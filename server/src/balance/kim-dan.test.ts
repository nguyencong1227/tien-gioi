// Test đo Kim Đan trước M6 (#402). Hai nhóm:
//  - số học / cấu trúc của `measureKimDan` trên dữ liệu SỐNG (không khoá con số cụ thể: nội dung M6 sẽ đổi chúng);
//  - các kết luận trên ẢNH CHỤP cố định `kim-dan-truoc.json` (mốc "trước M6" để #406 so trước / sau).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DROP_TABLES, ITEM_BY_ID } from "@tien-gioi/shared";
import { BASELINE_IDS, measureKimDan, renderKimDan, type KimDanReport } from "./kim-dan";
import { simulate } from "./simulate";

const truoc = JSON.parse(
  readFileSync(new URL("./kim-dan-truoc.json", import.meta.url), "utf-8"),
) as KimDanReport;

describe("measureKimDan (dữ liệu sống)", () => {
  // 3 trận mỗi dòng cho nhanh: kiểm cấu trúc, không kiểm tỉ lệ thắng
  const r = measureKimDan(BASELINE_IDS, 3);

  it("ba bậc Kim Đan, mỗi bậc đủ bốn loài và bốn cỡ đội", () => {
    expect(r.tiers.map((t) => t.step)).toEqual([13, 14, 15]);
    for (const t of r.tiers) {
      expect(t.hunts.map((h) => h.id)).toEqual([...BASELINE_IDS]);
      expect(t.dungeon.map((d) => d.party)).toEqual([1, 2, 3, 4]);
    }
  });

  it("số học đan: dùng = min(nguồn cung, giới hạn hồi chiêu); có đan luôn nhanh hơn không đan", () => {
    const cap = 3600 / ((ITEM_BY_ID["tu_khi_dan"].cooldown ?? 60_000) / 1000);
    let seen = 0;
    for (const t of r.tiers) {
      for (const p of [t.pill, t.pillFastSearch]) {
        if (!p) continue;
        seen++;
        expect(p.usedPerHour).toBeCloseTo(Math.min(p.supplyPerHour, cap), 9);
        expect(p.supplyPerHour).toBeCloseTo(p.killsPerHour * p.pillsPerKill, 9);
        expect(p.pillExpPerHour).toBeCloseTo(p.usedPerHour * p.expEach, 6);
        expect(p.expEach).toBeCloseTo(t.bar * 0.05, 6);
        expect(p.minutesWithPill).toBeLessThan(p.minutesNoPill);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  // ----- Quan hệ độc lập (không khoá con số): bắt các đột biến mà kiểm tự nhất quán bỏ sót -----
  it("kỳ vọng đan mỗi con = chance x (min + max) / 2 của bảng rơi thật (DROP_TABLES)", () => {
    for (const t of r.tiers) {
      for (const p of [t.pill, t.pillFastSearch]) {
        if (!p) continue;
        const e = DROP_TABLES[p.monsterId].find((d) => d.itemId === "tu_khi_dan")!;
        expect(p.pillsPerKill).toBeCloseTo(e.chance * ((e.min + e.max) / 2), 12);
      }
    }
  });

  it("nguồn tu vi tốt nhất = loài an toàn có tu vi / giờ lớn nhất; loài không an toàn thì không có số", () => {
    for (const t of r.tiers) {
      const safe = t.hunts.filter((h) => h.safe);
      for (const h of t.hunts) {
        expect(h.expPerHour === null, h.id).toBe(!h.safe);
        expect(h.coinPerHour === null, h.id).toBe(!h.safe);
      }
      const max = Math.max(...safe.map((h) => h.expPerHour!));
      expect(t.best!.expPerHour).toBe(max);
      expect(safe.find((h) => h.id === t.best!.id)!.expPerHour).toBe(max);
    }
  });

  it("nguồn đan = loài an toàn cho NHIỀU đan nhất mỗi giờ (con / giờ x đan / con), không phải loài săn nhanh nhất", () => {
    for (const t of r.tiers) {
      const cand = t.hunts
        .filter((h) => h.safe)
        .map((h) => {
          const e = DROP_TABLES[h.id].find((d) => d.itemId === "tu_khi_dan");
          return {
            id: h.id,
            supply: e ? (3600 / h.secPerKill!) * e.chance * ((e.min + e.max) / 2) : 0,
          };
        })
        .filter((c) => c.supply > 0);
      const bestSupply = Math.max(...cand.map((c) => c.supply));
      expect(t.pill!.supplyPerHour).toBeCloseTo(bestSupply, 9);
      expect(cand.find((c) => c.id === t.pill!.monsterId)!.supply).toBeCloseTo(bestSupply, 9);
    }
  });

  it("tổng thời gian Kim Đan = tổng phút ba bậc Kim Đan của simulate() (độc lập với kim-dan.ts)", () => {
    const sum = simulate(3)
      .filter((row) => row.realm === 3)
      .reduce((a, row) => a + row.minutes, 0);
    expect(r.simulateMinutes).toBeCloseTo(sum, 6);
  });

  it("độ nhạy hitTaken: an toàn khi mọi đòn trúng thì phải an toàn ở ca thường (đơn điệu); ASSUME.hitTaken được khôi phục", async () => {
    const { ASSUME } = await import("./simulate");
    expect(ASSUME.hitTaken).toBeLessThan(1);
    // Tính lại độc lập: đặt hitTaken = 1 rồi hỏi mô hình an toàn solo (khôi phục ngay)
    const { huntRate } = await import("./simulate");
    const { MONSTER_BY_ID } = await import("@tien-gioi/shared");
    const saved = ASSUME.hitTaken;
    try {
      ASSUME.hitTaken = 1;
      for (const t of r.tiers)
        for (const h of t.hunts)
          expect(h.safeIfAllHit, `${t.label} ${h.id}`).toBe(
            !!huntRate(MONSTER_BY_ID[h.id], 3, t.tier),
          );
    } finally {
      ASSUME.hitTaken = saved;
    }
    for (const t of r.tiers)
      for (const h of t.hunts) if (h.safeIfAllHit) expect(h.safe, h.id).toBe(true);
  });

  it("ca 'tìm nhanh' không làm lệch giả định toàn cục (khôi phục ASSUME.searchSec.mang)", async () => {
    const { ASSUME } = await import("./simulate");
    expect(ASSUME.searchSec.mang).toBe(r.mangSearch);
  });

  it("id quái lạ thì ném lỗi, không đo sai lặng lẽ", () => {
    expect(() => measureKimDan(["khong_co"], 1)).toThrow(/khong_co/);
  });
});

describe("kim-dan-truoc.json: mốc trước M6 (nội dung chỉ có bốn loài cũ)", () => {
  it("chụp đúng bốn loài cũ ở ba bậc Kim Đan", () => {
    expect(truoc.ids).toEqual([...BASELINE_IDS]);
    expect(truoc.tiers).toHaveLength(3);
  });

  it("Xích Mãng chưa an toàn solo ở Sơ kỳ nhưng an toàn từ Trung kỳ và nhanh gấp hơn 4 lần Hắc Hổ (hình dạng sai)", () => {
    const get = (ti: number, id: string) => truoc.tiers[ti].hunts.find((h) => h.id === id)!;
    expect(get(0, "mang").safe).toBe(false);
    for (const ti of [1, 2]) {
      expect(get(ti, "mang").safe).toBe(true);
      expect(get(ti, "mang").expPerHour!).toBeGreaterThan(4 * get(ti, "ho").expPerHour!);
    }
    expect(truoc.tiers[0].best!.id).toBe("ho");
    expect(truoc.tiers[1].best!.id).toBe("mang");
  });

  it("độ nhạy (B, #416): nếu mọi đòn trúng thì Xích Mãng chỉ an toàn solo từ Hậu kỳ; Trung kỳ sát ngưỡng", () => {
    const m = (ti: number) => truoc.tiers[ti].hunts.find((h) => h.id === "mang")!;
    expect([m(0).safeIfAllHit, m(1).safeIfAllHit, m(2).safeIfAllHit]).toEqual([false, false, true]);
    expect(m(1).safe).toBe(true);
    expect(renderKimDan(truoc)).toContain("sát ngưỡng");
  });

  it("Tụ Khí Đan là nguồn tu vi chính ở Kim Đan: có đan rút ngắn một thanh Xích Mãng quá một nửa", () => {
    for (const ti of [1, 2]) {
      const p = truoc.tiers[ti].pill!;
      expect(p.monsterId).toBe("mang");
      expect(p.minutesWithPill).toBeLessThan(p.minutesNoPill / 2);
    }
  });

  it("bí cảnh Linh Hư không chặn được đội Kim Đan: thắng 100%, không ai chết, trong thời hạn", () => {
    for (const t of truoc.tiers) {
      for (const d of t.dungeon) {
        expect(d.winRate).toBe(1);
        expect(d.deathsPerRun).toBe(0);
        expect(d.realMinutes!).toBeLessThan(12);
      }
    }
  });

  it("tổng thời gian Kim Đan theo simulate() nằm trong 5-7 giờ (đúng nhịp nhưng chỉ nhờ đường tắt)", () => {
    expect(truoc.simulateMinutes).toBeGreaterThan(5 * 60);
    expect(truoc.simulateMinutes).toBeLessThan(7 * 60);
  });
});

describe("renderKimDan", () => {
  const md = renderKimDan(truoc);

  it("có đủ năm mục, đủ ba bậc, không NaN / undefined", () => {
    for (const h of ["### 1.", "### 2.", "### 3.", "### 4.", "### 5."]) expect(md).toContain(h);
    for (const t of truoc.tiers) expect(md).toContain(t.label);
    expect(md).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("nhãn thời gian tìm quái chỉ gắn cho Xích Mãng (Hắc Hổ không có giả định 90 s)", () => {
    expect(md).toMatch(/Xích Mãng \(tìm 90 s\)/);
    expect(md).not.toMatch(/Hắc Hổ \(tìm/);
  });

  it("kết luận bí cảnh theo dữ liệu: thắng nhanh thì 'bị phá', thua hoặc quá giờ thì không", () => {
    expect(md).toContain("bị phá ở mọi bậc Kim Đan");
    const lose: KimDanReport = JSON.parse(JSON.stringify(truoc));
    for (const t of lose.tiers) for (const d of t.dungeon) d.winRate = 0;
    expect(renderKimDan(lose)).not.toContain("bị phá ở mọi bậc Kim Đan");
    const slow: KimDanReport = JSON.parse(JSON.stringify(truoc));
    for (const t of slow.tiers) for (const d of t.dungeon) d.realMinutes = 99;
    expect(renderKimDan(slow)).not.toContain("bị phá ở mọi bậc Kim Đan");
  });
});
