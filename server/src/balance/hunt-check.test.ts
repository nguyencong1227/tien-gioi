// Đối chiếu mô hình cân bằng với mã server thật (#406 mục 7): thời gian hạ quái, khí huyết mất, trùm Hắc Giao theo đội.
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID } from "@tien-gioi/shared";
import { ASSUME } from "./simulate";
import { ASSUME_DUNGEON } from "./dungeon";
import {
  POTIONS_PLENTY,
  bossAtkSweep,
  bossDpsFrac,
  bossFight,
  bossPerPerson,
  bossSummary,
  huntCheck,
  huntCheckCases,
  huntFight,
  potionHealFrac,
  renderHuntCheck,
} from "./hunt-check";

describe("săn quái thường: mô hình khớp mã server thật", () => {
  const rows = huntCheckCases().map(([realm, tier, id]) => huntCheck(realm, tier, id, 8));

  it("mọi ca (Luyện Khí, Trúc Cơ, 3 bậc x 4 loài Kim Đan) đều hạ được quái; có đủ 14 dòng", () => {
    expect(rows).toHaveLength(2 + 3 * 4);
    for (const r of rows) expect(r.killedAll, `${r.label} ${r.monsterId}`).toBe(true);
  });

  it("thời gian hạ quái lệch mô hình <= 15% (thực tế <= 8%): tu vi / giờ và Linh thạch / giờ đáng tin", () => {
    for (const r of rows) {
      expect(r.timeRatio, `${r.label} ${r.monsterId}`).toBeGreaterThanOrEqual(0.85);
      expect(r.timeRatio, `${r.label} ${r.monsterId}`).toBeLessThanOrEqual(1.15);
    }
  });

  it("khí huyết mất (không né) trong 0,95-1,35x mô hình chia tỉ lệ trúng: mô hình không đánh giá thấp nguy hiểm quá ~35%", () => {
    for (const r of rows) {
      expect(r.lostRatioNoDodge, `${r.label} ${r.monsterId}`).toBeGreaterThanOrEqual(0.95);
      expect(r.lostRatioNoDodge, `${r.label} ${r.monsterId}`).toBeLessThanOrEqual(1.35);
    }
    expect(ASSUME.hitTaken).toBe(0.8); // giả định né 20% mà cột "không né" của tài liệu dựa vào
  });

  it("một trận là tất định theo hạt giống và trả lại Math.random", () => {
    const random = Math.random;
    expect(huntFight(3, 1, "suong_ho", 5)).toEqual(huntFight(3, 1, "suong_ho", 5));
    expect(Math.random).toBe(random);
  });
});

describe("trùm Hắc Giao theo đội, mã thật (đứng đánh liên tục, uống Đại Hồi Huyết Đan khi dưới 50%)", () => {
  it("đội 3-4 hạ được và KHÔNG AI CHẾT ở mọi bậc khi mỗi người mang 8 đan (mục tiêu M6)", () => {
    for (let tier = 0; tier < 3; tier++)
      for (const party of [3, 4]) {
        const s = bossSummary(tier, party, 8, 4);
        expect(s.killRate, `bậc ${tier} đội ${party}`).toBe(1);
        expect(s.deathsPerRun, `bậc ${tier} đội ${party}`).toBe(0);
      }
  });

  it("không có đan thì trùm CHỈ đánh một mục tiêu và giết nó: đội 4 ở Sơ kỳ có người chết (mô hình chia sát thương đều là lạc quan)", () => {
    const s = bossSummary(0, 4, 0, 4);
    expect(s.deathsPerRun).toBeGreaterThanOrEqual(1);
    const one = bossFight({ tier: 0, party: 4, potions: 0, seed: 1 });
    expect(one.worstLostFrac).toBeGreaterThanOrEqual(0.99); // một người mất cả khí huyết
  });

  it("một người và đội 2 không hạ nổi trùm nếu KHÔNG có đan, ở mọi bậc", () => {
    for (let tier = 0; tier < 3; tier++)
      for (const party of [1, 2])
        expect(bossSummary(tier, party, 0, 3).killRate, `bậc ${tier} đội ${party}`).toBe(0);
  });

  it("BẤT BIẾN (đo của B ở #446): sát thương trùm lên MỘT người < tốc độ hồi của Đại Hồi Huyết Đan ở mọi bậc, nên một người bền vững nếu đủ đan", () => {
    for (let tier = 0; tier < 3; tier++)
      expect(bossDpsFrac(tier), `bậc ${tier}`).toBeLessThan(potionHealFrac());
    expect(potionHealFrac()).toBeCloseTo(0.07, 10);
    // hệ quả: đủ đan thì một người hạ được ở MỌI bậc, 0 chết (trần 8 đan chỉ là giới hạn mang: Sơ kỳ solo 8 đan không hạ được)
    for (let tier = 0; tier < 3; tier++) {
      const s = bossSummary(tier, 1, POTIONS_PLENTY, 3);
      expect(s.killRate, `bậc ${tier}`).toBe(1);
      expect(s.deathsPerRun, `bậc ${tier}`).toBe(0);
    }
  });

  it("theo NGƯỜI, đội không nhanh hơn mà ÍT ĐAN hơn: 19 Giao Lân mất ~cùng số phút (±10%) ở mọi cỡ đội, số đan mỗi người giảm dần theo cỡ đội", () => {
    for (let tier = 0; tier < 3; tier++) {
      const rows = [1, 2, 3, 4].map((party) => bossPerPerson(tier, party, 3)!);
      const base = rows[0].minutes;
      for (const r of rows) {
        expect(r.minutes / base, `bậc ${tier} đội ${r.party}`).toBeGreaterThan(0.9);
        expect(r.minutes / base, `bậc ${tier} đội ${r.party}`).toBeLessThan(1.1);
        expect(r.deathsPerRun).toBe(0);
      }
      for (let i = 1; i < rows.length; i++)
        expect(rows[i].potions, `bậc ${tier} đội ${rows[i].party}`).toBeLessThan(
          rows[i - 1].potions,
        );
    }
    // số trận cả đội: đồ rơi một chủ nên đội n cần n x 19 Giao Lân (mỗi trận TB 3)
    expect(bossPerPerson(2, 4, 3)!.kills).toBeCloseTo((4 * 19) / 3, 6);
  });

  it("KHÔNG có hệ số công trùm chung nào vừa chặn solo ở Hậu kỳ vừa giữ đội 4 ở Sơ kỳ không chết (đo của B: x1,4 / x1,7 solo vẫn 100%; x2 chặn solo nhưng Sơ kỳ đội 4 chết); công trùm được khôi phục", () => {
    const before = MONSTER_BY_ID.hac_giao.atk;
    const sweep = bossAtkSweep([1, 1.4, 1.7, 2, 2.5], 3);
    expect(MONSTER_BY_ID.hac_giao.atk).toBe(before);
    for (const r of sweep)
      expect(r.hauSolo.killRate === 0 && r.soParty4.deathsPerRun === 0, `x${r.mult}`).toBe(false);
    expect(sweep.find((r) => r.mult === 1.4)!.hauSolo.killRate).toBe(1);
    expect(sweep.find((r) => r.mult === 2)!.hauSolo.killRate).toBe(0);
  });

  it("mang N đan thì không uống quá N (đan là giới hạn mang thật): solo Sơ kỳ mang 8 đan dùng hết nhưng không uống thêm", () => {
    const f = bossFight({ tier: 0, party: 1, potions: ASSUME_DUNGEON.potions, seed: 1 });
    expect(f.potions[0]).toBeGreaterThan(0);
    expect(f.potions[0]).toBeLessThanOrEqual(ASSUME_DUNGEON.potions);
    expect(bossFight({ tier: 0, party: 1, potions: 0, seed: 1 }).potions[0]).toBe(0);
  });

  it("chính sách đan dùng ASSUME_DUNGEON (không số cứng): đổi ngưỡng uống thì kết quả trận đổi; mặc định = ASSUME_DUNGEON.potions", () => {
    const a = bossFight({ tier: 2, party: 1, seed: 1 });
    const keep = ASSUME_DUNGEON.potionBelow;
    try {
      (ASSUME_DUNGEON as { potionBelow: number }).potionBelow = 0.05;
      const b = bossFight({ tier: 2, party: 1, seed: 1 });
      expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
    } finally {
      (ASSUME_DUNGEON as { potionBelow: number }).potionBelow = keep;
    }
    expect(JSON.stringify(bossSummary(2, 1, undefined, 2))).toBe(
      JSON.stringify(bossSummary(2, 1, ASSUME_DUNGEON.potions, 2)),
    );
  });
});

describe("renderHuntCheck", () => {
  it("có mục 9, đủ bảng thường và bảng trùm, không NaN / undefined / \\n", () => {
    const md = renderHuntCheck();
    for (const w of [
      "### 9.",
      "Hôi Lang",
      "Độc Thiềm",
      "Hắc Giao",
      "Đủ đan",
      "Chi phí MỖI NGƯỜI",
      "Hệ số công trùm",
      "Nhận định",
    ])
      expect(md).toContain(w);
    expect(md).not.toMatch(/NaN|undefined|Infinity|\\n/);
  });
});
