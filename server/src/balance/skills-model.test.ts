import { describe, expect, it } from "vitest";
import { SKILLS_M7, statsFor, emptyEquipment, skillOf } from "@tien-gioi/shared";
import {
  baselineDps,
  computeSkillCombo,
  evaluateBuildRotation,
  generateSkillBalanceReport,
  renderSkillBalanceMarkdown,
  simulateEngraveImpact,
  simulateSkillFight,
} from "./skills-model";

describe("Mô hình cân bằng chiêu thức, hệ và trạng thái (M7.9, issue #510)", () => {
  const lkStats = statsFor(1, 0, emptyEquipment()); // Luyện Khí sơ kỳ
  const tcStats = statsFor(2, 0, emptyEquipment()); // Trúc Cơ sơ kỳ
  const kdStats = statsFor(3, 0, emptyEquipment()); // Kim Đan sơ kỳ

  it("baselineDps: tính đúng sát thương chém cơ bản với bạo kích trung bình", () => {
    const base = baselineDps(lkStats.atk);
    // atk * 1.0 * 1.08 / 0.4s = atk * 2.7
    expect(base).toBeCloseTo(lkStats.atk * 2.7, 2);
  });

  it("12 chiêu thức M7: KHÔNG chiêu nào vượt quá trần 2,0x sức mạnh so với chém thường (kể cả khi khắc hệ)", () => {
    for (const def of SKILLS_M7) {
      const breakdown = computeSkillCombo(def, kdStats.atk, kdStats.maxMp, "none");
      // Sức mạnh thông thường không được > 2.0x
      expect(breakdown.ratioVsBaseline).toBeLessThanOrEqual(2.0);
      // Khi khắc hệ (1.3x sát thương) cũng không được > 2.0x
      expect(breakdown.advantageRatio).toBeLessThanOrEqual(2.0);
    }
  });

  it("generateSkillBalanceReport: báo cáo tổng thể xác nhận bất biến noSkillExceeds2x", () => {
    const report = generateSkillBalanceReport(kdStats);
    expect(report.skills).toHaveLength(12);
    expect(report.noSkillExceeds2x).toBe(true);
    expect(report.maxRatioSkill.ratioVsBaseline).toBeLessThanOrEqual(2.0);
  });

  it("Tương khắc ngũ hành: khắc hệ đạt 1.3x sát thương chiêu, bị khắc đạt 0.8x", () => {
    const hoaVanKiem = skillOf("hoa_van_kiem")!;
    // Hỏa Vân Kiếm (hệ Hỏa) đánh quái hệ Kim (Hỏa khắc Kim)
    const adv = computeSkillCombo(hoaVanKiem, kdStats.atk, kdStats.maxMp, "kim");
    // Hỏa Vân Kiếm đánh quái hệ Thủy (Thủy khắc Hỏa -> Hỏa bị khắc)
    const disadv = computeSkillCombo(hoaVanKiem, kdStats.atk, kdStats.maxMp, "thuy");
    // Hỏa Vân Kiếm đánh quái vô sắc (none)
    const neutral = computeSkillCombo(hoaVanKiem, kdStats.atk, kdStats.maxMp, "none");

    expect(adv.directDmg).toBeCloseTo(neutral.directDmg * 1.3, 1);
    expect(disadv.directDmg).toBeCloseTo(neutral.directDmg * 0.8, 1);
    expect(adv.comboDps).toBeGreaterThan(neutral.comboDps);
    expect(disadv.comboDps).toBeLessThan(neutral.comboDps);
  });

  it("Hiệu ứng trạng thái DOT (Bỏng, Chảy máu, Độc) đóng góp sát thương thực tế vào chu kỳ", () => {
    const hoaVanKiem = skillOf("hoa_van_kiem")!; // có burn (dot)
    const bonThachQuyen = skillOf("bon_thach_quyen")!; // không có dot

    const hvk = computeSkillCombo(hoaVanKiem, kdStats.atk, kdStats.maxMp);
    const btq = computeSkillCombo(bonThachQuyen, kdStats.atk, kdStats.maxMp);

    expect(hvk.dotDmg).toBeGreaterThan(0);
    expect(btq.dotDmg).toBe(0);
  });

  it("Bộ chiêu theo cảnh giới (build rotation): đạt tiêu chí mục tiêu 1,3 - 1,6x sát thương ở Kim Đan", () => {
    // Kim Đan gắn 3 chiêu: 1 chiêu tấn công chính + 1 chiêu khống chế/vỡ giáp + 1 chiêu dot
    const hoaVanKiem = skillOf("hoa_van_kiem")!;
    const cuuCung = skillOf("cuu_cung_khon_sat")!; // có sunder (vỡ giáp)
    const huyenBang = skillOf("huyen_bang_chi")!;

    const build = evaluateBuildRotation(
      [hoaVanKiem, cuuCung, huyenBang],
      kdStats.atk,
      kdStats.maxMp,
      "kim", // đánh quái bị khắc hệ
    );

    // Mục tiêu mục 10: "người chơi dùng chiêu và hệ khắc đúng đạt 1,3-1,6x sát thương / giây so với chỉ chém + Kiếm khí"
    expect(build.powerMultiplier).toBeGreaterThanOrEqual(1.3);
    expect(build.powerMultiplier).toBeLessThanOrEqual(1.65);
  });

  it("Kinh tế linh lực: duy trì liên tục qua các trận săn thông thường (6-15 giây)", () => {
    const hoaVanKiem = skillOf("hoa_van_kiem")!;
    const trongNhac = skillOf("trong_nhac_tram")!;

    const build = evaluateBuildRotation([hoaVanKiem, trongNhac], tcStats.atk, tcStats.maxMp);

    // Tiêu hao linh lực có hạn, duy trì được >= 20 giây giao tranh liên tục không ngừng
    expect(build.sustainSeconds).toBeGreaterThan(20);
  });

  it("renderSkillBalanceMarkdown: sinh đúng cấu trúc markdown với đủ 3 mục", () => {
    const md = renderSkillBalanceMarkdown(kdStats);
    expect(md).toContain("## Cân bằng chiêu thức, ngũ hành và trạng thái (M7, #510)");
    expect(md).toContain("Bảng 12 chiêu thức đợt 1");
    expect(md).toContain("Vòng chiêu mẫu theo cảnh giới");
    expect(md).toContain("Đánh giá tiêu chuẩn mục 10");
    expect(md).toContain("Hỏa Vân Kiếm");
    expect(md).toContain("Cửu Cung Khốn Sát");
  });

  it("simulateEngraveImpact: khắc chân linh mang lại lợi thế nhưng không làm kiếp 2 vượt 2.0x kiếp 1", () => {
    const impact0 = simulateEngraveImpact(0);
    const impact1 = simulateEngraveImpact(1);
    const impact2 = simulateEngraveImpact(2);
    const impact3 = simulateEngraveImpact(3);

    expect(impact0.costDuyen).toBe(0);
    expect(impact1.costDuyen).toBe(40);
    expect(impact2.costDuyen).toBe(100);
    expect(impact3.costDuyen).toBe(220);

    expect(impact1.overallSpeedupRatio).toBeGreaterThan(1.0);
    expect(impact1.withinTargetLimit).toBe(true);
    expect(impact3.overallSpeedupRatio).toBeLessThanOrEqual(2.0);
    expect(impact3.withinTargetLimit).toBe(true);
  });

  it("Đối chiếu mô hình với mã server thật (cast.ts + combat.ts): độ lệch <= 25% trên cả 8 chiêu gây sát thương", () => {
    // Thử nghiệm toàn diện trên cả 8 chiêu thức M7 có mult > 0:
    // gồm cả chiêu quạt (fan: Lạc Tuyết Phân Phi 5 tia), đòn thẳng (line: Huyền Băng Chỉ, Thanh Tùng Phi Châm),
    // đòn nón (cone: Hỏa Vân Kiếm, Bổn Thạch Quyền, Ưng Trảo, Trọng Nhạc Trảm) và đòn vùng (ground: Cửu Cung Khốn Sát)
    const DAMAGE_SKILLS = [
      "hoa_van_kiem",
      "bon_thach_quyen",
      "ung_trao",
      "trong_nhac_tram",
      "huyen_bang_chi",
      "thanh_tung_phi_cham",
      "lac_tuyet_phan_phi",
      "cuu_cung_khon_sat",
    ];

    for (const skillId of DAMAGE_SKILLS) {
      const res = simulateSkillFight(skillId, undefined, undefined, 30, 100);
      expect(res.match).toBe(true);
      expect(res.diffPercent).toBeLessThanOrEqual(25);
    }

    // Chiêu không truyền cảnh giới: tự dùng cảnh giới yêu cầu (def.reqRealm)
    const autoRealmRes = simulateSkillFight("cuu_cung_khon_sat", undefined, undefined, 30, 100);
    expect(autoRealmRes.match).toBe(true);

    // Cảnh giới không đủ: ném lỗi rõ ràng thay vì im lặng từ chối
    expect(() => simulateSkillFight("cuu_cung_khon_sat", 1, 0)).toThrow(
      /không đủ để dùng chiêu cuu_cung_khon_sat/,
    );
  });
});
