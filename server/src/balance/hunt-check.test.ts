// Đối chiếu mô hình cân bằng với mã server thật (#406 mục 7): thời gian hạ quái, khí huyết mất, trùm Hắc Giao theo đội.
import { describe, expect, it } from "vitest";
import { ASSUME } from "./simulate";
import {
  BOSS_RUNS,
  bossFight,
  bossSummary,
  huntCheck,
  huntCheckCases,
  huntFight,
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

  it("một người và đội 2 không hạ nổi trùm nếu không có đan, ở mọi bậc", () => {
    for (let tier = 0; tier < 3; tier++)
      for (const party of [1, 2])
        expect(bossSummary(tier, party, 0, 3).killRate, `bậc ${tier} đội ${party}`).toBe(0);
  });

  it("KHOÁ HIỆN TRẠNG (câu hỏi cho người dùng ở questions.md): một người ở Hậu kỳ hạ được trùm với <= 8 Đại Hồi Huyết Đan; Sơ kỳ thì không", () => {
    const hau = bossSummary(2, 1, 8, BOSS_RUNS);
    expect(hau.killRate).toBe(1);
    expect(hau.potionsPerKill).toBeLessThanOrEqual(8);
    expect(hau.deathsPerRun).toBe(0);
    expect(bossSummary(0, 1, 8, 3).killRate).toBe(0);
  });

  it("đội đông hạ nhanh hơn và ít đan hơn: đội 4 nhanh hơn đội 1 ở Hậu kỳ", () => {
    const solo = bossSummary(2, 1, 8, 3);
    const four = bossSummary(2, 4, 8, 3);
    expect(four.seconds!).toBeLessThan(solo.seconds!);
    expect(four.potionsPerKill!).toBeLessThan(solo.potionsPerKill!);
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
      "Có Đại Hồi Huyết Đan",
      "Nhận định",
    ])
      expect(md).toContain(w);
    expect(md).not.toMatch(/NaN|undefined|Infinity|\\n/);
  });
});
