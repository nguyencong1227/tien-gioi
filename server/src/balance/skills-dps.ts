// DPS THẬT của mọi chiêu học được (CT10 #1055, docs/PHAN_CONG_CHIEU_THUC.md mục 9): chạy chiêu trong `World` thật (`cast` + `tickWorld`, nên bẫy / vùng / tượng / đạn bay / chiêu vận chạy
// đúng như máy chủ) trước quái bù nhìn đứng yên, so với CHỈ chém thường cùng cảnh giới. Khác `skills-model.ts` (công thức giải tích cho 18 chiêu đầu, không biết hình mới): ở đây không
// chép công thức, nên chiêu mới của D / E / G tự được đo mà không phải sửa mô hình.
//
// Cách đo (mọi giả định đều ở đây, in ra cạnh bảng ở `CAN_BANG.md`): người chơi đúng cảnh giới `reqRealm` / `reqTier` của chiêu (chỉ số `statsFor`), chiêu ở ô 2; mỗi tick dùng chiêu nếu
// hết hồi + đủ linh lực, không thì chém. Linh lực hồi 20 / giây (như `simulateSkillFight`). Bù nhìn là "lang" máu cực lớn, aggro 0, GHIM đứng yên cách người đánh 40 px (cận chiến, nơi người chơi
// thật đứng): MỘT bù nhìn (đơn mục tiêu) hoặc BA bù nhìn dàn hàng ngang cách nhau 40 px (nhóm). Trời không bạo kích ngẫu nhiên lệch: `Math.random` có hạt giống. `tỉ lệ` = sát thương mất của
// bù nhìn khi luân phiên chiêu / sát thương khi chỉ chém thường cùng thời gian, cùng bố trí (chiêu hộ thể / hồi: ~1 hoặc thấp hơn, vì mất lượt chém).
import {
  LEARNABLE_SKILLS,
  TICK_MS,
  skillCooldownMs,
  skillMpCost,
  statusOf,
  type SkillDef,
} from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "../systems/test-helpers";
import { cast } from "../systems/cast";
import { slash } from "../systems/combat";
import { tickWorld } from "../systems/tick";
import { applyStats } from "../systems/progression";
import { seeded } from "./hunt-check";

/** Số giây mô phỏng mỗi lần đo. */
export const DPS_SECONDS = 30;
const MP_REGEN_PER_SEC = 20;
/** Khoảng cách bù nhìn tới người đánh (px) và khoảng giữa các bù nhìn ở bố trí nhóm. */
const DUMMY_DIST = 40;
const DUMMY_GAP = 40;

export type SkillRole = "sat_thuong" | "khong_che" | "thu" | "hoi" | "tang_ich";

/** Vai của chiêu theo dữ liệu: gây sát thương (mult > 0), khống chế (choáng / tê cóng / suy yếu), thủ (khiên / né), hồi, tăng ích (tăng tốc / tự tăng sát thương). */
export function roleOf(def: SkillDef): SkillRole {
  const kinds = def.effects.map((e) => statusOf(e.status)?.kind);
  if (def.mult > 0)
    return kinds.some((k) => k === "stun" || k === "slow" || k === "weaken")
      ? "khong_che"
      : "sat_thuong";
  if (kinds.includes("regen")) return "hoi";
  if (kinds.includes("shield") || def.dodgeMs) return "thu";
  return "tang_ich";
}

/** Tổng sát thương bù nhìn mất trong `seconds` giây khi người chơi luân phiên `def` (hoặc chỉ chém nếu `def` null). */
export function measureDamage(
  def: SkillDef | null,
  realm: number,
  tier: number,
  targets: 1 | 3,
  seconds = DPS_SECONDS,
  seed = 7,
): number {
  const saved = Math.random;
  Math.random = seeded(seed);
  try {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "dps", realm, tier);
    applyStats(p, true);
    p.mp = p.maxMp;
    if (def) {
      c.skills.learned[def.id] = 1;
      c.skills.slots[0] = def.id;
    }
    const dummies = [0, 1, 2].slice(0, targets).map((i) => {
      const dy = targets === 1 ? 0 : (i - 1) * DUMMY_GAP;
      const m = addMonster(w, "lang", p.x + DUMMY_DIST, p.y + dy);
      m.m.hp = 1e12;
      m.m.maxHp = 1e12;
      m.mc.def = { ...m.mc.def, aggro: 0, attackCd: 1e9 };
      return { m: m.m, x: m.m.x, y: m.m.y, hp0: m.m.hp };
    });
    const px = p.x;
    const py = p.y;
    w.now = 1_000_000;
    const dt = TICK_MS / 1000;
    const cost = def ? skillMpCost(def, p.maxMp) : 0;
    for (let t = 0; t < seconds; t += dt) {
      w.now += TICK_MS;
      p.mp = Math.min(p.maxMp, p.mp + MP_REGEN_PER_SEC * dt);
      if (def && w.now >= c.skillCd[0] && p.mp >= cost) cast(w, "dps", { slot: 2, angle: 0 });
      else slash(w, "dps", 0);
      tickWorld(w, TICK_MS);
      for (const d of dummies) {
        d.m.x = d.x; // ghim: AI không dắt bù nhìn đi khỏi vùng
        d.m.y = d.y;
      }
      p.x = px; // ghim cả người đánh: chiêu lao (`dash`) không được dời người ra khỏi bù nhìn rồi tính là "mất sát thương"
      p.y = py;
    }
    return dummies.reduce((s, d) => s + (d.hp0 - d.m.hp), 0);
  } finally {
    Math.random = saved;
  }
}

export interface SkillDpsRow {
  id: string;
  name: string;
  element: string;
  shape: string;
  role: SkillRole;
  reqRealm: number;
  cooldownS: number;
  mpPerSec: number;
  /** Tỉ lệ sát thương so với chỉ chém: một bù nhìn / ba bù nhìn. */
  single: number;
  group: number;
}

const baselineCache = new Map<string, number>();
function baseline(realm: number, tier: number, targets: 1 | 3): number {
  const key = `${realm}:${tier}:${targets}`;
  let v = baselineCache.get(key);
  if (v === undefined) baselineCache.set(key, (v = measureDamage(null, realm, tier, targets)));
  return v;
}

/** Đo một chiêu: tỉ lệ so với chỉ chém ở đúng cảnh giới yêu cầu. */
export function measureSkill(def: SkillDef): SkillDpsRow {
  const single =
    measureDamage(def, def.reqRealm, def.reqTier, 1) / baseline(def.reqRealm, def.reqTier, 1);
  const group =
    measureDamage(def, def.reqRealm, def.reqTier, 3) / baseline(def.reqRealm, def.reqTier, 3);
  const cd = skillCooldownMs(def, 1, 0) / 1000;
  return {
    id: def.id,
    name: def.name,
    element: def.element,
    shape: def.shape,
    role: roleOf(def),
    reqRealm: def.reqRealm,
    cooldownS: cd,
    mpPerSec: def.mpPct / cd,
    single,
    group,
  };
}

/** Đo MỌI chiêu học được (thứ tự `LEARNABLE_SKILLS`). */
export function measureAllSkills(defs: readonly SkillDef[] = LEARNABLE_SKILLS): SkillDpsRow[] {
  return defs.map(measureSkill);
}

const REALM_NAMES: Readonly<Record<number, string>> = {
  1: "Luyện Khí",
  2: "Trúc Cơ",
  3: "Kim Đan",
  4: "Nguyên Anh",
};
const ROLE_LABEL: Readonly<Record<SkillRole, string>> = {
  sat_thuong: "sát thương",
  khong_che: "khống chế",
  thu: "thủ",
  hoi: "hồi",
  tang_ich: "tăng ích",
};

/** Mục `CAN_BANG.md` về DPS thật của mọi chiêu (CT10). */
export function renderSkillDpsMarkdown(rows: readonly SkillDpsRow[] = measureAllSkills()): string {
  const L: string[] = [
    "## DPS thật của mọi chiêu học được (CT10, #1055)",
    "",
    `> Chạy trong \`World\` thật (\`cast\` + \`tickWorld\`: bẫy / vùng / tượng / đạn bay / chiêu vận đúng như máy chủ), ${DPS_SECONDS} giây mỗi lần đo, người chơi đúng cảnh giới yêu cầu của chiêu, linh lực hồi ${MP_REGEN_PER_SEC}/giây, bù nhìn "lang" đứng yên cách ${DUMMY_DIST} px (một, hoặc ba dàn hàng ngang cách ${DUMMY_GAP} px). **Tỉ lệ** = sát thương bù nhìn mất khi luân phiên chiêu so với CHỈ chém thường cùng bố trí (chiêu thủ / hồi / tăng ích ~1 hoặc thấp hơn vì mất lượt chém). Số có hạt giống, ổn định. Mã: \`server/src/balance/skills-dps.ts\`.`,
    "",
  ];
  for (const realm of [1, 2, 3, 4]) {
    const rs = rows.filter((r) => r.reqRealm === realm);
    if (rs.length === 0) continue;
    L.push(
      `### ${REALM_NAMES[realm]} (${rs.length} chiêu)`,
      "| Chiêu | Hệ | Hình | Vai | Hồi chiêu | Linh lực / giây | Tỉ lệ (1 mục tiêu) | Tỉ lệ (3 mục tiêu) |",
      "|---|---|---|---|---:|---:|---:|---:|",
    );
    for (const r of rs)
      L.push(
        `| **${r.name}** | ${r.element} | ${r.shape} | ${ROLE_LABEL[r.role]} | ${r.cooldownS.toFixed(1)}s | ${r.mpPerSec.toFixed(3)} | ${r.single.toFixed(2)}× | ${r.group.toFixed(2)}× |`,
      );
    const dmg = rs.filter((r) => r.role === "sat_thuong" || r.role === "khong_che");
    if (dmg.length > 0) {
      const med = [...dmg].map((r) => r.single).sort((a, b) => a - b)[Math.floor(dmg.length / 2)];
      const max = Math.max(...dmg.map((r) => r.single));
      L.push(
        "",
        `Chiêu gây sát thương: trung vị **${med.toFixed(2)}×**, cao nhất **${max.toFixed(2)}×** (1 mục tiêu).`,
        "",
      );
    } else L.push("");
  }
  return L.join("\n");
}
