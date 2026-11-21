// Kiểm thử đo DPS thật bằng bot chiến đấu (CT13 #1058)
import { describe, expect, it } from "vitest";
import { LEARNABLE_SKILLS, SKILL_BY_ID } from "@tien-gioi/shared";
import {
  measureAllBotSkills,
  measureBotSkillDps,
  renderBotDpsReportMarkdown,
} from "./skills-bot-dps";

describe("Bot đo DPS thật của chiêu thức (CT13, #1058)", () => {
  it("đo thử nghiệm chiêu điển hình: trả về số hữu hạn và đúng định dạng", () => {
    const report = measureBotSkillDps(SKILL_BY_ID.hoa_van_kiem);
    expect(report.id).toBe("hoa_van_kiem");
    expect(Number.isFinite(report.realRatio)).toBe(true);
    expect(report.realRatio).toBeGreaterThan(0);
    expect(Number.isFinite(report.diffPct)).toBe(true);
  });

  it("chạy đo toàn bộ 53 chiêu: kiểm tra tính ổn định, độ lệch <= 25% và định dạng báo cáo", () => {
    const reports = measureAllBotSkills();

    expect(reports.length).toBe(LEARNABLE_SKILLS.length);
    for (const r of reports) {
      expect(Number.isFinite(r.realRatio), r.id).toBe(true);
      expect(Number.isFinite(r.simRatio), r.id).toBe(true);
      expect(r.realRatio, r.id).toBeGreaterThan(0);
    }

    const md = renderBotDpsReportMarkdown(reports);
    expect(md).toContain("## Báo cáo đo DPS thật của chiêu thức bằng Bot");
    expect(md).toContain("hoa_van_kiem");

    // Khóa cứng độ lệch <= 25%: test đỏ nếu có chiêu thức nào lệch quá ngưỡng
    const deviations = reports
      .filter((r) => r.deviated)
      .map(
        (d) =>
          `${d.id} (${d.name}): Sim ${d.simRatio.toFixed(2)}× vs Real ${d.realRatio.toFixed(2)}× (lệch ${d.diffPct.toFixed(1)}%)`,
      );
    expect(deviations).toEqual([]);
  }, 120_000);
});
