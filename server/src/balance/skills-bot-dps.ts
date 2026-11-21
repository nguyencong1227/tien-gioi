// Đo DPS THẬT của chiêu thức bằng bot chiến đấu (CT13 #1058, docs/PHAN_CONG_CHIEU_THUC.md mục 9).
// So sánh tỉ lệ thực chiến (bot di chuyển, ngắm góc, tung chiêu, trúng/trượt, trễ thời gian) với tỉ lệ mô phỏng tĩnh
// từ bảng CAN_BANG.md (`skills-dps.ts` - bù nhìn ghim 40px). Lệch > 25% được ghi nhận để báo cáo.

import {
  LEARNABLE_SKILLS,
  SKILL_BY_ID,
  SKILLS,
  TICK_MS,
  skillCooldownMs,
  skillMpCost,
  statsFor,
  type SkillDef,
} from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "../systems/test-helpers";
import { cast } from "../systems/cast";
import { slash } from "../systems/combat";
import { tickWorld } from "../systems/tick";
import { applyStats } from "../systems/progression";
import { measureSkill, roleOf, type SkillRole } from "./skills-dps";
import { seeded } from "./hunt-check";

export const BOT_DPS_SECONDS = 30;
const MP_REGEN_PER_SEC = 20;

/** Tầm hiệu quả mà bot cố gắng giữ khi định tung chiêu */
export function effectiveCastRange(def: SkillDef): number {
  if (def.shape === "self") return 40;
  if (def.shape === "dash") return Math.max(30, (def.reach ?? 60) * 0.7);
  if (
    def.shape === "ground" ||
    def.shape === "zone" ||
    def.shape === "trap" ||
    def.shape === "totem"
  ) {
    return Math.max(40, (def.reach ?? 80) + (def.range ?? 40) * 0.5);
  }
  return Math.max(40, (def.range ?? 60) * 0.8);
}

export interface BotFightDamageOptions {
  def: SkillDef | null;
  realm: number;
  tier: number;
  seconds?: number;
  seed?: number;
  targetInitialDist?: number;
}

/**
 * Đo tổng sát thương quái nhận được khi bot điều khiển chiến đấu trong World thật.
 * Bot di chuyển tiếp cận mục tiêu theo cự ly hiệu quả, ngắm góc chính xác, dùng chiêu khi đủ điều kiện hoặc chém thường.
 */
export function measureBotFightDamage(options: BotFightDamageOptions): number {
  const { def, realm, tier, seconds = BOT_DPS_SECONDS, seed = 7, targetInitialDist = 80 } = options;
  const saved = Math.random;
  Math.random = seeded(seed);

  try {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "bot_caster", realm, tier);
    applyStats(p, true);
    p.mp = p.maxMp;
    p.hp = 1e8;
    p.maxHp = 1e8;

    const speed = statsFor(p.realm, p.tier, p).speed;

    if (def) {
      c.skills.learned[def.id] = 1;
      c.skills.slots[0] = def.id;
    }

    // Quái vật đối kháng mục tiêu
    const mon = addMonster(w, "lang", p.x + targetInitialDist, p.y);
    mon.m.hp = 1e12;
    mon.m.maxHp = 1e12;
    // Bù nhìn không tự chết, tấn công bị vô hiệu để đo sát thương nhận được
    mon.mc.def = { ...mon.mc.def, aggro: 0, attackCd: 1e9 };
    const m = mon.m;
    const hp0 = m.hp;

    w.now = 1_000_000;
    const dt = TICK_MS / 1000;
    const cost = def ? skillMpCost(def, p.maxMp) : 0;
    const slashRange = SKILLS.slash.range;

    for (let t = 0; t < seconds; t += dt) {
      w.now += TICK_MS;
      p.mp = Math.min(p.maxMp, p.mp + MP_REGEN_PER_SEC * dt);

      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);

      const skillReady = def && w.now >= c.skillCd[0] && p.mp >= cost && c.windup === undefined;
      const desiredDist = skillReady ? effectiveCastRange(def) : slashRange * 0.8;

      // Bot di chuyển tiếp cận quái nếu ở xa
      if (dist > desiredDist + 10) {
        const step = speed * dt;
        p.x += Math.cos(angle) * Math.min(step, dist - desiredDist);
        p.y += Math.sin(angle) * Math.min(step, dist - desiredDist);
      } else if (dist < desiredDist - 20 && def?.shape !== "self") {
        // Quá gần cho chiêu tầm xa: lùi nhẹ
        const step = speed * dt * 0.5;
        p.x -= Math.cos(angle) * step;
        p.y -= Math.sin(angle) * step;
      }

      // Hành động tấn công
      if (skillReady && dist <= effectiveCastRange(def) + 30) {
        cast(w, "bot_caster", { slot: 2, angle });
      } else if (dist <= slashRange + 15) {
        slash(w, "bot_caster", angle);
      }

      tickWorld(w, TICK_MS);
    }

    return hp0 - m.hp;
  } finally {
    Math.random = saved;
  }
}

export interface BotSkillDpsReport {
  id: string;
  name: string;
  realm: number;
  role: SkillRole;
  shape: string;
  element: string;
  simRatio: number;
  realRatio: number;
  diffPct: number;
  deviated: boolean;
}

const botBaselineCache = new Map<string, number>();
function getBotBaseline(realm: number, tier: number): number {
  const key = `${realm}:${tier}`;
  let v = botBaselineCache.get(key);
  if (v === undefined) {
    v = measureBotFightDamage({ def: null, realm, tier });
    botBaselineCache.set(key, v);
  }
  return v;
}

/** Đo DPS thật của một chiêu bằng bot chiến đấu và so sánh với mô phỏng tĩnh */
export function measureBotSkillDps(def: SkillDef): BotSkillDpsReport {
  const sim = measureSkill(def);
  const baseline = getBotBaseline(def.reqRealm, def.reqTier);
  const realDmg = measureBotFightDamage({ def, realm: def.reqRealm, tier: def.reqTier });
  const realRatio = baseline > 0 ? realDmg / baseline : 1;
  const diffPct = sim.single > 0 ? ((realRatio - sim.single) / sim.single) * 100 : 0;
  const deviated = Math.abs(diffPct) > 25;

  return {
    id: def.id,
    name: def.name,
    realm: def.reqRealm,
    role: roleOf(def),
    shape: def.shape,
    element: def.element,
    simRatio: sim.single,
    realRatio,
    diffPct,
    deviated,
  };
}

/** Đo DPS thật cho toàn bộ chiêu học được */
export function measureAllBotSkills(
  defs: readonly SkillDef[] = LEARNABLE_SKILLS,
): BotSkillDpsReport[] {
  return defs.map(measureBotSkillDps);
}

/** Kết xuất báo cáo so sánh DPS thực chiến và mô phỏng dạng Markdown */
export function renderBotDpsReportMarkdown(
  reports: readonly BotSkillDpsReport[] = measureAllBotSkills(),
): string {
  const lines: string[] = [
    "## Báo cáo đo DPS thật của chiêu thức bằng Bot (CT13, #1058)",
    "",
    `> Mô phỏng trận đấu bằng bot thật trong \`World\` (\`cast\` + \`slash\` + \`tickWorld\`), ${BOT_DPS_SECONDS} giây mỗi lần đo.`,
    "> Bot tự căn chỉnh cự ly và góc đánh, so sánh tỉ lệ thực chiến (`Real Ratio`) với bảng `CAN_BANG.md` (`Sim Ratio`).",
    "> Ngưỡng cảnh báo lệch: **> 25%**.",
    "",
    "| Chiêu | Cảnh giới | Hệ | Hình | Vai | Sim Ratio | Real Ratio | Độ lệch | Trạng thái |",
    "|---|:---:|:---:|:---:|:---:|---:|---:|---:|:---:|",
  ];

  for (const r of reports) {
    const status = r.deviated ? "⚠️ LỆCH >25%" : "✅ ĐẠT";
    const diffSign = r.diffPct >= 0 ? `+${r.diffPct.toFixed(1)}%` : `${r.diffPct.toFixed(1)}%`;
    lines.push(
      `| **${r.name}** (\`${r.id}\`) | ${r.realm} | ${r.element} | ${r.shape} | ${r.role} | ${r.simRatio.toFixed(2)}× | ${r.realRatio.toFixed(2)}× | ${diffSign} | ${status} |`,
    );
  }

  const deviations = reports.filter((r) => r.deviated);
  lines.push("");
  if (deviations.length === 0) {
    lines.push("=> **KẾT QUẢ: 100% chiêu thức ĐẠT chuẩn cân bằng (độ lệch thực chiến <= 25%).**");
  } else {
    lines.push(
      `=> **CẢNH BÁO: Có ${deviations.length} chiêu thức lệch > 25% so với mô phỏng tĩnh:**`,
    );
    for (const d of deviations) {
      lines.push(
        `- **${d.name}** (\`${d.id}\`): Sim ${d.simRatio.toFixed(2)}× vs Real ${d.realRatio.toFixed(2)}× (lệch ${d.diffPct.toFixed(1)}%)`,
      );
    }
  }

  return lines.join("\n");
}
