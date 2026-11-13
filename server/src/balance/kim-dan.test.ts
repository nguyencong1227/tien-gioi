// Test đo Kim Đan trước M6 (#402). Hai nhóm:
//  - số học / cấu trúc của `measureKimDan` trên dữ liệu SỐNG (không khoá con số cụ thể: nội dung M6 sẽ đổi chúng);
//  - các kết luận trên ẢNH CHỤP cố định `kim-dan-truoc.json` (mốc "trước M6" để #406 so trước / sau).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEM_BY_ID } from "@tien-gioi/shared";
import { BASELINE_IDS, measureKimDan, renderKimDan, type KimDanReport } from "./kim-dan";

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
