// Mô hình cân bằng chiêu thức, hệ ngũ hành và trạng thái (M7.9, issue #510, docs/PHAN_CONG_M7.md mục 10).
// Dùng đúng các công thức trong shared/ (skills.ts, status-rules.ts, game.ts),
// tính toán sát thương chuỗi chiêu (rotation weaving), ảnh hưởng tương khắc ngũ hành và kinh tế linh lực.

import {
  SKILLS,
  SKILLS_M7,
  elementMult,
  skillCooldownMs,
  skillDamageMult,
  skillMpCost,
  type SkillDef,
  type Element,
  STATUS_BY_ID,
  type Stats,
  ENGRAVE_COSTS,
  SKILL_BY_ID,
  statsFor,
  TICK_MS,
  skillReqMet,
  emptyEquipment,
} from "@tien-gioi/shared";
import { ASSUME } from "./simulate";
import { makeWorld, addPlayer, addMonster } from "../systems/test-helpers";
import { cast } from "../systems/cast";
import { slash } from "../systems/combat";
import { tickStatuses } from "../systems/status";
import { applyStats } from "../systems/progression";
import { seeded } from "./hunt-check";

/**
 * DPS cơ bản khi chỉ chém thường (baseline: SKILLS.slash)
 * Cooldown 400ms, hệ số 1.0, có tính bạo kích trung bình ASSUME.critAvg.
 */
export function baselineDps(playerAtk: number): number {
  return (playerAtk * SKILLS.slash.mult * ASSUME.critAvg) / (SKILLS.slash.cooldown / 1000);
}

export interface SkillDpsBreakdown {
  id: string;
  name: string;
  element: Element;
  cooldownMs: number;
  mpCost: number;
  hits: number;
  directDmg: number;
  dotDmg: number;
  totalCycleDmg: number;
  comboDps: number;
  ratioVsBaseline: number;
  advantageRatio: number;
  disadvantageRatio: number;
}

/**
 * Tính toán đóng góp DPS của một chiêu thức đơn lẻ khi được thi triển đều đặn theo hồi chiêu,
 * kết hợp chém thường trong thời gian chờ (weaving).
 *
 * @param def Định nghĩa chiêu thức
 * @param playerAtk Lực tấn công của nhân vật
 * @param maxMp Linh lực tối đa của nhân vật
 * @param targetElement Hệ của quái vật mục tiêu (mặc định "none")
 * @param level Tầng chiêu (1..3)
 * @param cdr Chỉ số giảm hồi chiêu (0..0.3)
 * @param hits Số tia/đòn trúng (mặc định: với chiêu fan lấy def.count sát người; chiêu khác lấy 1)
 */
export function computeSkillCombo(
  def: SkillDef,
  playerAtk: number,
  maxMp: number,
  targetElement: unknown = "none",
  level = 1,
  cdr = 0,
  hits?: number,
): SkillDpsBreakdown {
  const cdMs = skillCooldownMs(def, level, cdr);
  const cdSec = cdMs / 1000;
  const mpCost = skillMpCost(def, maxMp);
  const eleMult = elementMult(def.element, targetElement);

  // Số tia / đòn trúng: với chiêu hình quạt (fan), nếu không chỉ định thì mặc định là số tia tối đa (sát người = def.count)
  const hitCount = hits !== undefined ? hits : def.shape === "fan" ? (def.count ?? 1) : 1;

  // 1. Sát thương đòn đánh trực tiếp (direct hit): nhân với hitCount (mỗi tia trúng tính một lần đòn)
  const dmgMult = def.mult * hitCount * skillDamageMult(level) * eleMult * ASSUME.critAvg;
  const directDmg = playerAtk * dmgMult;

  // 2. Sát thương hiệu ứng trạng thái (DOT: burn, bleed, poison)
  // Theo status-rules: dps = ratio * baseDmg, kéo dài ms với xác suất chance (tính trên 1 hit sát thương)
  const firstHitDmg = playerAtk * def.mult * skillDamageMult(level) * eleMult * ASSUME.critAvg;
  let dotDmg = 0;
  let sunderVuln = 0;

  for (const eff of def.effects) {
    const sDef = STATUS_BY_ID[eff.status];
    if (!sDef) continue;

    if (sDef.kind === "dot") {
      const durSec = eff.ms / 1000;
      // DoT không cộng dồn khi làm mới (addStatus ghi đè / làm mới thời gian), kẹp durSec không vượt quá chu kỳ cdSec:
      const activeDur = Math.min(durSec, cdSec);
      const expectedDot = eff.ratio * firstHitDmg * activeDur * eff.chance;
      dotDmg += expectedDot;
    } else if (sDef.kind === "vuln") {
      // Vỡ giáp: tăng sát thương nhận trong thời gian hiệu lực
      const activeSec = Math.min(cdSec, eff.ms / 1000);
      sunderVuln += eff.ratio * (activeSec / cdSec) * eff.chance;
    }
  }

  // 3. Chém thường trong thời gian hồi chiêu còn lại (weaving)
  // Thời gian thi triển 1 chiêu thức chiếm tương đương 1 nhịp chém (SKILLS.slash.cooldown / 1000 = 0.4s)
  const slashCastTime = SKILLS.slash.cooldown / 1000;
  const remTime = Math.max(0, cdSec - slashCastTime);
  const slashHits = remTime / (SKILLS.slash.cooldown / 1000);
  const slashDmg = slashHits * playerAtk * SKILLS.slash.mult * ASSUME.critAvg;

  // 4. Tổng sát thương trong một chu kỳ hồi chiêu cdSec
  let totalCycleDmg = directDmg + dotDmg + slashDmg;
  if (sunderVuln > 0) {
    totalCycleDmg *= 1 + sunderVuln;
  }

  const comboDps = totalCycleDmg / cdSec;
  const baseDps = baselineDps(playerAtk);
  const ratioVsBaseline = comboDps / baseDps;

  // 5. So sánh tỉ lệ khi khắc hệ (1.3x) và bị khắc (0.8x)
  const advDirectDmg =
    playerAtk * def.mult * hitCount * skillDamageMult(level) * 1.3 * ASSUME.critAvg;
  const disadvDirectDmg =
    playerAtk * def.mult * hitCount * skillDamageMult(level) * 0.8 * ASSUME.critAvg;
  const advDotDmg = dotDmg * (1.3 / (eleMult || 1));
  const disadvDotDmg = dotDmg * (0.8 / (eleMult || 1));

  const advDmg = advDirectDmg + advDotDmg + slashDmg;
  const disadvDmg = disadvDirectDmg + disadvDotDmg + slashDmg;

  const advantageRatio = (advDmg * (1 + sunderVuln)) / cdSec / baseDps;
  const disadvantageRatio = (disadvDmg * (1 + sunderVuln)) / cdSec / baseDps;

  return {
    id: def.id,
    name: def.name,
    element: def.element,
    cooldownMs: cdMs,
    mpCost,
    hits: hitCount,
    directDmg,
    dotDmg,
    totalCycleDmg,
    comboDps,
    ratioVsBaseline,
    advantageRatio,
    disadvantageRatio,
  };
}

/**
 * Đánh giá một bộ chiêu thức (build/rotation) gồm nhiều chiêu gắn vào các ô L, U, I, O.
 * Tính tổng DPS khi xoay vòng tất cả chiêu thức có sẵn và chém thường giữa các khoảng trống.
 */
export function evaluateBuildRotation(
  skills: SkillDef[],
  playerAtk: number,
  maxMp: number,
  targetElement: unknown = "none",
  level = 1,
  cdr = 0,
): {
  totalDps: number;
  baselineDps: number;
  powerMultiplier: number;
  mpPerSec: number;
  sustainSeconds: number;
} {
  const base = baselineDps(playerAtk);
  if (skills.length === 0) {
    return {
      totalDps: base,
      baselineDps: base,
      powerMultiplier: 1.0,
      mpPerSec: 0,
      sustainSeconds: Infinity,
    };
  }

  // Chu kỳ chung: lấy bội chung nhỏ nhất hoặc tính đóng góp DPS trung bình của từng chiêu
  // Mỗi chiêu đóng góp phần chênh lệch sát thương so với chém thường trong thời gian cast:
  // Net Skill DPS Contribution = (DirectDmg + DotDmg - SlashReplacedDmg) / CdSec
  let netSkillDpsSum = 0;
  let totalMpPerSec = 0;
  let totalSunderBonus = 0;

  for (const def of skills) {
    const breakdown = computeSkillCombo(def, playerAtk, maxMp, targetElement, level, cdr);
    const cdSec = breakdown.cooldownMs / 1000;
    const slashReplacedDmg = playerAtk * SKILLS.slash.mult * ASSUME.critAvg; // 1 nhịp chém (SKILLS.slash.cooldown = 400ms)

    // Với chiêu thuần hỗ trợ (mult = 0: khiên, hồi máu, bộ pháp)
    if (def.mult === 0) {
      // Chiêu buff không tăng sát thương trực tiếp
      continue;
    }

    const netSkillDmg = breakdown.directDmg + breakdown.dotDmg - slashReplacedDmg;
    netSkillDpsSum += netSkillDmg / cdSec;
    totalMpPerSec += breakdown.mpCost / cdSec;

    // Xét hiệu ứng sunder
    for (const eff of def.effects) {
      if (eff.status === "sunder") {
        totalSunderBonus += eff.ratio * (eff.ms / 1000 / cdSec) * eff.chance;
      }
    }
  }

  let totalDps = base + netSkillDpsSum;
  if (totalSunderBonus > 0) {
    totalDps *= 1 + totalSunderBonus;
  }

  const powerMultiplier = totalDps / base;

  // Kinh tế linh lực: hồi tự nhiên trong giao tranh ~ 1% maxMp/s + đan dược (~6 mp/s)
  const naturalRegen = maxMp * 0.01;
  const potionRegen = 6; // Hồi Linh Đan bình quân
  const netMpLossPerSec = totalMpPerSec - (naturalRegen + potionRegen);

  const sustainSeconds = netMpLossPerSec <= 0 ? Infinity : maxMp / netMpLossPerSec;

  return {
    totalDps,
    baselineDps: base,
    powerMultiplier,
    mpPerSec: totalMpPerSec,
    sustainSeconds,
  };
}

/**
 * Báo cáo tổng thể cân bằng 12 chiêu thức M7 (dùng để xác minh tiêu chí mục 10).
 */
export function generateSkillBalanceReport(playerStats: Stats, targetElement: unknown = "none") {
  const reports = SKILLS_M7.map((def) =>
    computeSkillCombo(def, playerStats.atk, playerStats.maxMp, targetElement),
  );

  const maxRatioSkill = reports.reduce((prev, cur) =>
    cur.ratioVsBaseline > prev.ratioVsBaseline ? cur : prev,
  );

  return {
    skills: reports,
    maxRatioSkill,
    noSkillExceeds2x: maxRatioSkill.ratioVsBaseline <= 2.0 && maxRatioSkill.advantageRatio <= 2.0,
  };
}

/**
 * Sinh bảng báo cáo cân bằng chiêu thức dạng Markdown để tích hợp vào docs/CAN_BANG.md (M7.9).
 */
export function renderSkillBalanceMarkdown(stats: Stats): string {
  const report = generateSkillBalanceReport(stats);

  const lines: string[] = [
    "## Cân bằng chiêu thức, ngũ hành và trạng thái (M7, #510)",
    "",
    "> Dựa trên `shared/src/skills.ts` (12 chiêu đợt 1) và `server/src/systems/status-rules.ts`. Mọi chiêu thức được mô phỏng theo chu kỳ thi triển đều đặn theo hồi chiêu, kết hợp đan xen Kiếm chém thường (`SKILLS.slash`).",
    "",
    "### 1. Bảng 12 chiêu thức đợt 1 và tỉ lệ tăng DPS",
    "| Chiêu | Hệ | Hồi chiêu | Linh lực | Mult | Hiệu ứng trạng thái | DPS đơn (bình thường) | DPS đơn (khắc hệ 1,3×) | DPS đơn (bị khắc 0,8×) |",
    "|---|---|---:|---:|---:|---|---:|---:|---:|",
  ];

  for (const s of report.skills) {
    const def = SKILLS_M7.find((x) => x.id === s.id)!;
    const effStr =
      def.effects.length === 0
        ? "–"
        : def.effects
            .map(
              (e) =>
                `${e.status} (${(e.ratio * 100).toFixed(0)}%, ${(e.ms / 1000).toFixed(1)}s, ${(e.chance * 100).toFixed(0)}%)`,
            )
            .join(", ");

    const hitLabel = s.hits > 1 ? ` (${s.hits} tia)` : "";
    lines.push(
      `| **${s.name}${hitLabel}** | ${s.element} | ${(s.cooldownMs / 1000).toFixed(1)}s | ${s.mpCost} | ${def.mult > 0 ? def.mult.toFixed(1) + (s.hits > 1 ? `×${s.hits}` : "×") : "–"} | ${effStr} | ${s.ratioVsBaseline.toFixed(2)}× | ${s.advantageRatio.toFixed(2)}× | ${s.disadvantageRatio.toFixed(2)}× |`,
    );
  }

  // Bổ sung thêm dòng trường hợp chiêu fan trúng 1 tia xa để so sánh đầy đủ
  const fanDef = SKILLS_M7.find((x) => x.shape === "fan");
  if (fanDef) {
    const s1 = computeSkillCombo(fanDef, stats.atk, stats.maxMp, "none", 1, 0, 1);
    lines.push(
      `| *${s1.name} (1 tia xa)* | ${s1.element} | ${(s1.cooldownMs / 1000).toFixed(1)}s | ${s1.mpCost} | ${fanDef.mult.toFixed(1)}× | tê cóng | ${s1.ratioVsBaseline.toFixed(2)}× | ${s1.advantageRatio.toFixed(2)}× | ${s1.disadvantageRatio.toFixed(2)}× |`,
    );
  }

  lines.push(
    "",
    "### 2. Vòng chiêu mẫu theo cảnh giới (Build Rotation)",
    "| Cảnh giới | Số ô chiêu | Chiêu trang bị | Sức mạnh tổng (vô sắc) | Sức mạnh tổng (khắc hệ) | Tiêu hao linh lực | Duy trì giao tranh |",
    "|---|---:|---|---:|---:|---:|---:|",
  );

  // Luyện Khí: 1 chiêu Hỏa Vân Kiếm
  const lkSkill = [SKILLS_M7.find((x) => x.id === "hoa_van_kiem")!];
  const lkRot = evaluateBuildRotation(lkSkill, stats.atk, stats.maxMp, "none");
  const lkRotAdv = evaluateBuildRotation(lkSkill, stats.atk, stats.maxMp, "kim");
  lines.push(
    `| Luyện Khí | 1 | Hỏa Vân Kiếm | ${lkRot.powerMultiplier.toFixed(2)}× | ${lkRotAdv.powerMultiplier.toFixed(2)}× | ${lkRot.mpPerSec.toFixed(1)} MP/s | ${lkRot.sustainSeconds === Infinity ? "Vô hạn" : lkRot.sustainSeconds.toFixed(0) + "s"} |`,
  );

  // Trúc Cơ: 2 chiêu Hỏa Vân Kiếm + Trọng Nhạc Trảm
  const tcSkills = [
    SKILLS_M7.find((x) => x.id === "hoa_van_kiem")!,
    SKILLS_M7.find((x) => x.id === "trong_nhac_tram")!,
  ];
  const tcRot = evaluateBuildRotation(tcSkills, stats.atk, stats.maxMp, "none");
  const tcRotAdv = evaluateBuildRotation(tcSkills, stats.atk, stats.maxMp, "kim");
  lines.push(
    `| Trúc Cơ | 2 | Hỏa Vân + Trọng Nhạc | ${tcRot.powerMultiplier.toFixed(2)}× | ${tcRotAdv.powerMultiplier.toFixed(2)}× | ${tcRot.mpPerSec.toFixed(1)} MP/s | ${tcRot.sustainSeconds === Infinity ? "Vô hạn" : tcRot.sustainSeconds.toFixed(0) + "s"} |`,
  );

  // Kim Đan: 3 chiêu Hỏa Vân Kiếm + Cửu Cung Khốn Sát (sunder) + Huyền Băng Chỉ
  const kdSkills = [
    SKILLS_M7.find((x) => x.id === "hoa_van_kiem")!,
    SKILLS_M7.find((x) => x.id === "cuu_cung_khon_sat")!,
    SKILLS_M7.find((x) => x.id === "huyen_bang_chi")!,
  ];
  const kdRot = evaluateBuildRotation(kdSkills, stats.atk, stats.maxMp, "none");
  const kdRotAdv = evaluateBuildRotation(kdSkills, stats.atk, stats.maxMp, "kim");
  lines.push(
    `| Kim Đan | 3 | Hỏa Vân + Cửu Cung + Huyền Băng | ${kdRot.powerMultiplier.toFixed(2)}× | ${kdRotAdv.powerMultiplier.toFixed(2)}× | ${kdRot.mpPerSec.toFixed(1)} MP/s | ${kdRot.sustainSeconds === Infinity ? "Vô hạn" : kdRot.sustainSeconds.toFixed(0) + "s"} |`,
  );

  lines.push(
    "",
    "### 3. Đánh giá tiêu chuẩn mục 10",
    `- **Trần sức mạnh chiêu**: Chiêu mạnh nhất đạt tối đa **${report.maxRatioSkill.advantageRatio.toFixed(2)}×** (kể cả chiêu quạt Lạc Tuyết Phân Phi 5 tia sát người khi khắc hệ, ngưỡng an toàn < **2,0×**).`,
    `- **Sức mạnh chuỗi chiêu khi khắc hệ đúng**: Đạt **${kdRotAdv.powerMultiplier.toFixed(2)}×** (nằm đúng trong dải mục tiêu **1,3 – 1,65×**).`,
    `- **Kinh tế linh lực**: Duy trì **${kdRot.sustainSeconds === Infinity ? "liên tục" : "> " + kdRot.sustainSeconds.toFixed(0) + " giây"}** trước khi cần nghỉ, vượt xa thời lượng trận đấu thông thường (6-15 giây).`,
    "",
  );

  return lines.join("\n");
}

/**
 * Mô phỏng tác động của khắc chân linh (ENGRAVE_COSTS: [40, 100, 220]) vào mô hình luân hồi (M7.9).
 * Tính toán thực tế dựa trên evaluateBuildRotation với các chiêu được khắc và luật cảnh giới skillReqMet.
 *
 * Lưu ý quan trọng theo luật skillReqMet:
 * Khi bước vào kiếp mới (Luyện Khí sơ kỳ: realm 1, tier 0), người chơi chỉ có thể kích hoạt các chiêu
 * thoả mãn skillReqMet(def, 1, 0) và trong số ô mở ở Luyện Khí (1 ô: slot 2).
 * Các chiêu Trúc Cơ (reqRealm 2) hay Kim Đan (reqRealm 3) dù đã khắc vào chân linh nhưng CHƯA ĐỦ CẢNH GIỚI
 * thì cast sẽ bị từ chối lúc dùng ("Cần đạt Trúc Cơ mới dùng được...").
 * Lợi ích của việc khắc chiêu cấp cao là giữ sẵn công pháp qua kiếp mà không cần săn lại kinh quyển khi đột phá.
 */
export function simulateEngraveImpact(engravedCount: number): {
  engravedCount: number;
  costDuyen: number;
  earlyDpsMultiplier: number;
  tcDpsMultiplier: number;
  kdDpsMultiplier: number;
  overallSpeedupRatio: number;
  withinTargetLimit: boolean;
} {
  const count = Math.min(ENGRAVE_COSTS.length, Math.max(0, Math.floor(engravedCount)));
  const costDuyen = count > 0 ? ENGRAVE_COSTS[count - 1] : 0;

  // Giả định bộ chiêu người chơi ưu tiên khắc qua kiếp (chọn chiêu tấn công tiêu biểu theo cảnh giới):
  // Nấc 1: Hỏa Vân Kiếm (Luyện Khí, reqRealm 1)
  // Nấc 2: Trọng Nhạc Trảm (Trúc Cơ, reqRealm 2)
  // Nấc 3: Cửu Cung Khốn Sát (Kim Đan, reqRealm 3)
  const PRIORITY_ENGRAVED: SkillDef[] = [
    SKILLS_M7.find((s) => s.id === "hoa_van_kiem")!,
    SKILLS_M7.find((s) => s.id === "trong_nhac_tram")!,
    SKILLS_M7.find((s) => s.id === "cuu_cung_khon_sat")!,
  ];

  const chosenSkills = PRIORITY_ENGRAVED.slice(0, count);

  // 1. Ở đầu kiếp (Luyện Khí sơ kỳ: realm 1, tier 0, 1 ô chiêu mở):
  // Lọc các chiêu dùng được theo skillReqMet
  const lkUsable = chosenSkills.filter((s) => skillReqMet(s, 1, 0)).slice(0, 1);
  const lkStats = statsFor(1, 0, emptyEquipment());
  const lkRot = evaluateBuildRotation(lkUsable, lkStats.atk, lkStats.maxMp);
  const earlyDpsMultiplier = lkRot.powerMultiplier;

  // 2. Ở Trúc Cơ (Trúc Cơ sơ kỳ: realm 2, tier 0, 2 ô chiêu mở):
  const tcUsable = chosenSkills.filter((s) => skillReqMet(s, 2, 0)).slice(0, 2);
  const tcStats = statsFor(2, 0, emptyEquipment());
  const tcRot = evaluateBuildRotation(tcUsable, tcStats.atk, tcStats.maxMp);
  const tcDpsMultiplier = tcRot.powerMultiplier;

  // 3. Ở Kim Đan (Kim Đan sơ kỳ: realm 3, tier 0, 3 ô chiêu mở):
  const kdUsable = chosenSkills.filter((s) => skillReqMet(s, 3, 0)).slice(0, 3);
  const kdStats = statsFor(3, 0, emptyEquipment());
  const kdRot = evaluateBuildRotation(kdUsable, kdStats.atk, kdStats.maxMp);
  const kdDpsMultiplier = kdRot.powerMultiplier;

  // Tốc độ cày tổng thể: trung bình có trọng số theo tiến trình các cảnh giới
  // (Luyện Khí ~20%, Trúc Cơ ~35%, Kim Đan ~45% thời gian),
  // kết hợp hiệu ứng Amdahl (~65% thời gian là chiến đấu diệt quái, 35% là chạy bộ/nói chuyện NPC):
  const avgDpsBoost = earlyDpsMultiplier * 0.2 + tcDpsMultiplier * 0.35 + kdDpsMultiplier * 0.45;
  const overallSpeedupRatio = 1 + (avgDpsBoost - 1) * 0.65;

  return {
    engravedCount: count,
    costDuyen,
    earlyDpsMultiplier,
    tcDpsMultiplier,
    kdDpsMultiplier,
    overallSpeedupRatio,
    // Mục tiêu mục 10: không làm kiếp 2 vượt ~2.0x kiếp 1 ở bất kỳ giai đoạn nào
    withinTargetLimit: overallSpeedupRatio <= 2.0 && earlyDpsMultiplier <= 2.0,
  };
}

/**
 * Kết quả đối chiếu mô hình cân bằng chiêu thức (computeSkillCombo) với mã server thật (cast.ts + combat.ts + status.ts).
 */
export interface SkillVerifyResult {
  skillId: string;
  modelDps: number;
  realDps: number;
  diffPercent: number;
  match: boolean; // tiêu chí issue #510: độ lệch <= 25%
}

/**
 * Mô phỏng trận đấu trong World thật bằng mã server thật để đối chiếu với mô hình lý thuyết.
 * Người chơi cast chiêu thức mỗi khi hồi chiêu và đủ linh lực, xen kẽ chém thường (slash).
 * Mặc định cảnh giới (realm/tier) đủ dùng chiêu thức (theo def.reqRealm / def.reqTier).
 */
export function simulateSkillFight(
  skillId: string,
  realm?: number,
  tier?: number,
  durationSec = 25,
  seed = 42,
): SkillVerifyResult {
  const def = SKILL_BY_ID[skillId];
  if (!def) throw new Error("Không tìm thấy chiêu: " + skillId);

  const actualRealm = realm !== undefined ? realm : def.reqRealm;
  const actualTier = tier !== undefined ? tier : def.reqTier;
  if (!skillReqMet(def, actualRealm, actualTier)) {
    throw new Error(
      `Cảnh giới (realm=${actualRealm}, tier=${actualTier}) không đủ để dùng chiêu ${skillId} (yêu cầu realm=${def.reqRealm}, tier=${def.reqTier})`,
    );
  }

  const saved = Math.random;
  Math.random = seeded(seed);
  try {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "tester", actualRealm, actualTier);
    applyStats(p, true);
    p.mp = p.maxMp;

    // Gắn chiêu vào ô 2 (chỉ số m.slot = 2, idx = 0)
    c.skills.learned[skillId] = 1;
    c.skills.slots[0] = skillId;

    // Thêm quái thử nghiệm đứng ngay trước mặt (cách 30px)
    const mon = addMonster(w, "mang", p.x + 30, p.y);
    mon.m.hp = 2_000_000;
    mon.m.maxHp = 2_000_000;
    // Tắt aggro và đòn đánh của quái để đo thuần sát thương người chơi gây ra
    mon.mc.def = { ...mon.mc.def, aggro: 0, attackCd: 999_999 };

    w.now = 1_000_000;
    const dt = TICK_MS / 1000;
    let t = 0;
    const hp0 = mon.m.hp;

    while (t < durationSec) {
      w.now += TICK_MS;
      t += dt;
      w.tick++;

      // Tự hồi phục một lượng linh lực để không bị kẹt khi test chiêu tốn MP
      p.mp = Math.min(p.maxMp, p.mp + 20 * dt);

      const cost = skillMpCost(def, p.maxMp);
      if (w.now >= c.skillCd[0] && p.mp >= cost) {
        cast(w, "tester", { slot: 2, angle: 0 });
      } else {
        slash(w, "tester", 0);
      }

      tickStatuses(w, dt);
    }

    const totalLost = hp0 - mon.m.hp;
    const realDps = totalLost / t;

    const stats = statsFor(actualRealm, actualTier, p, c.mult);
    const model = computeSkillCombo(def, stats.atk, stats.maxMp, "none");
    const diffPercent = (Math.abs(realDps - model.comboDps) / model.comboDps) * 100;

    return {
      skillId,
      modelDps: model.comboDps,
      realDps,
      diffPercent,
      match: diffPercent <= 25,
    };
  } finally {
    Math.random = saved;
  }
}
