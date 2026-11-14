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
} from "@tien-gioi/shared";
import { ASSUME } from "./simulate";

/**
 * DPS cơ bản khi chỉ chém thường (baseline: SKILLS.slash)
 * Cooldown 500ms, hệ số 1.0, có tính bạo kích trung bình ASSUME.critAvg.
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
 */
export function computeSkillCombo(
  def: SkillDef,
  playerAtk: number,
  maxMp: number,
  targetElement: unknown = "none",
  level = 1,
  cdr = 0,
): SkillDpsBreakdown {
  const cdMs = skillCooldownMs(def, level, cdr);
  const cdSec = cdMs / 1000;
  const mpCost = skillMpCost(def, maxMp);
  const eleMult = elementMult(def.element, targetElement);

  // 1. Sát thương đòn đánh trực tiếp (direct hit)
  const dmgMult = def.mult * skillDamageMult(level) * eleMult * ASSUME.critAvg;
  const directDmg = playerAtk * dmgMult;

  // 2. Sát thương hiệu ứng trạng thái (DOT: burn, bleed, poison)
  // Theo status-rules: dps = ratio * baseDmg, kéo dài ms với xác suất chance
  let dotDmg = 0;
  let sunderVuln = 0;

  for (const eff of def.effects) {
    const sDef = STATUS_BY_ID[eff.status];
    if (!sDef) continue;

    if (sDef.kind === "dot") {
      const durSec = eff.ms / 1000;
      // Tổng sát thương DOT của 1 lần dính: (ratio * directDmg) * durSec
      const expectedDot = eff.ratio * directDmg * durSec * eff.chance;
      dotDmg += expectedDot;
    } else if (sDef.kind === "vuln") {
      // Vỡ giáp: tăng sát thương nhận trong thời gian hiệu lực
      const activeSec = Math.min(cdSec, eff.ms / 1000);
      sunderVuln += eff.ratio * (activeSec / cdSec) * eff.chance;
    }
  }

  // 3. Chém thường trong thời gian hồi chiêu còn lại (weaving)
  // Giả định 1 lần cast chiêu chiếm thời gian tương đương 1 nhịp chém (0.5s)
  const slashCastTime = 0.5;
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
  const advDmg =
    playerAtk * def.mult * skillDamageMult(level) * 1.3 * ASSUME.critAvg +
    dotDmg * (1.3 / (eleMult || 1)) +
    slashDmg;
  const disadvDmg =
    playerAtk * def.mult * skillDamageMult(level) * 0.8 * ASSUME.critAvg +
    dotDmg * (0.8 / (eleMult || 1)) +
    slashDmg;

  const advantageRatio = (advDmg * (1 + sunderVuln)) / cdSec / baseDps;
  const disadvantageRatio = (disadvDmg * (1 + sunderVuln)) / cdSec / baseDps;

  return {
    id: def.id,
    name: def.name,
    element: def.element,
    cooldownMs: cdMs,
    mpCost,
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
    const slashReplacedDmg = playerAtk * SKILLS.slash.mult * ASSUME.critAvg; // 1 nhịp chém 0.5s

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
