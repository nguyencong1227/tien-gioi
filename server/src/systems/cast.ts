// Dùng chiêu thức (M7.2b bước 2, docs/PHAN_CONG_M7.md mục 5): tin `cast {slot, angle}` -> kiểm ô đã mở + đã gắn chiêu, hồi chiêu, linh lực;
// tính hình trúng (cone / line / fan / nova / ground / dash / self) trên quái và đối thủ thách đấu; sát thương nhân tầng chiêu và hệ khắc;
// gắn trạng thái; gửi `fx cast` cho người ở gần. Server quyết định mọi kết quả: client chỉ gửi ô và hướng.
// Số liệu từng chiêu ở `shared/src/skills.ts`; hình học thuần ở `shapeHits` (test riêng, dùng chung cho quái và người chơi).
import {
  CHAIN_FX_POINTS_MAX,
  PLAYER_RADIUS,
  SKILL_BY_ID,
  SKILL_LIMITS,
  elementMult,
  parseCast,
  realmLabel,
  skillCooldownMs,
  skillDamageMult,
  skillMpCost,
  skillReqMet,
  slotOpen,
  statsFor,
  statusEmpowerMult,
  statusOf,
  type SkillDef,
} from "@tien-gioi/shared";
import { angleDiff, quantAngle, type World } from "../world";
import { byId } from "./lookup";
import { dealMonsterDamage } from "./combat";
import { rollDamage } from "./damage";
import { treasureElementMult } from "./treasure";
import { duelHit } from "./duel";
import { syncPublicPos } from "./movement";
import { cdrNow, sendSkills } from "./skills";
import {
  applyMonsterStatus,
  applyPlayerStatus,
  monsterHasStatus,
  takeMonsterStatus,
} from "./status";
import { ampMultOf, entriesOf } from "./status-rules";

/** Bước nhỏ nhất khi lao (px): như một bước di chuyển thường, để `moveWithCollision` không xuyên tường. */
const DASH_STEP = 8;
/** Chiêu lao có sát thương: quét quái cách đường lao tối đa ngần này (px) cộng bán kính quái. */
const DASH_HIT_RADIUS = 24;

type ShapeDef = Pick<SkillDef, "shape" | "range" | "arc" | "width" | "count" | "reach">;

/** Mục tiêu tròn bán kính `r` ở (tx, ty) nằm trong tia từ (ox, oy) theo `angle` dài `range` rộng `width`? */
function inLine(
  ox: number,
  oy: number,
  angle: number,
  range: number,
  width: number,
  tx: number,
  ty: number,
  r: number,
): boolean {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const rx = tx - ox;
  const ry = ty - oy;
  const along = rx * ux + ry * uy;
  const perp = Math.abs(rx * uy - ry * ux);
  return along >= -r && along <= range + r && perp <= width / 2 + r;
}

/**
 * Số lần một chiêu hình `def` đánh từ (ox, oy) theo `angle` trúng mục tiêu tròn bán kính `r` ở (tx, ty): 0 = không trúng. Cone / line / nova /
 * ground luôn 0 hoặc 1; **fan** trả số tia trúng (mỗi tia là một lần trúng riêng, `SkillDef.mult` tính cho mỗi lần trúng). `dash` / `self` không
 * có vùng trúng ở đây (chiêu lao tự quét dọc đường lao). Thuần: không đọc `World`.
 */
export function shapeHits(
  def: ShapeDef,
  ox: number,
  oy: number,
  angle: number,
  tx: number,
  ty: number,
  r: number,
): number {
  switch (def.shape) {
    case "cone": {
      const d = Math.hypot(tx - ox, ty - oy);
      if (d > def.range + r) return 0;
      if (d > r && angleDiff(Math.atan2(ty - oy, tx - ox), angle) > (def.arc ?? Math.PI) / 2)
        return 0;
      return 1;
    }
    case "line":
      return inLine(ox, oy, angle, def.range, def.width ?? 0, tx, ty, r) ? 1 : 0;
    case "fan": {
      const n = Math.max(1, Math.floor(def.count ?? 1));
      const spread = def.arc ?? 0;
      let hits = 0;
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? angle : angle - spread / 2 + (spread * i) / (n - 1);
        if (inLine(ox, oy, a, def.range, def.width ?? 0, tx, ty, r)) hits++;
      }
      return hits;
    }
    case "nova":
      return Math.hypot(tx - ox, ty - oy) <= def.range + r ? 1 : 0;
    case "ground": {
      const cx = ox + Math.cos(angle) * (def.reach ?? 0);
      const cy = oy + Math.sin(angle) * (def.reach ?? 0);
      return Math.hypot(tx - cx, ty - cy) <= def.range + r ? 1 : 0;
    }
    default:
      return 0;
  }
}

/** Khoảng cách từ điểm (px, py) tới đoạn (ax, ay)-(bx, by). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Tầm hiện ra của hiệu ứng (px, cho `sendNear` và client vẽ): tầm thật server tính. */
function fxRange(def: SkillDef): number {
  if (def.shape === "ground") return (def.reach ?? 0) + def.range;
  if (def.shape === "dash") return def.reach ?? 0;
  return def.range;
}

/** Sét lan: mục tiêu ĐẦU phải ở nửa mặt phía trước hướng đánh (±90°); sét nảy sang quái gần nhất chưa trúng ở bất cứ hướng nào. */
const CHAIN_FRONT_RAD = Math.PI / 2;
/** Hệ số sát thương còn lại sau mỗi lần nảy khi dữ liệu không ghi `falloff` (đúng chú thích của `SkillDef`). */
export const CHAIN_FALLOFF_DEFAULT = 0.85;
/** Hệ số combo khi dữ liệu không ghi `combo.mult` (đúng chú thích của `SkillDef`: thiếu = 1,4). */
export const COMBO_MULT_DEFAULT = 1.4;

/**
 * SÉT LAN (`chain`, mục 51): mục tiêu ĐẦU = quái sống gần nhất trong tầm `def.range` và nửa mặt phía trước; rồi nảy tối đa `bounces` lần (trần `SKILL_LIMITS.chainBouncesMax`) sang quái gần
 * nhất CHƯA trúng trong `chainReach` (trần `chainReachMax`) tính từ mục tiêu vừa trúng; mỗi lần nảy sát thương nhân thêm `falloff` (kẹp [`chainFalloffMin`, 1]). Mỗi quái trúng tối đa MỘT lần.
 * Trả thứ tự trúng kèm hệ số (`scale` 1, falloff, falloff², ...) và `pts` = toạ độ phẳng [người dùng, mục tiêu 1, 2, ...] (nguyên, tối đa `CHAIN_FX_POINTS_MAX` điểm) cho `fx chain`.
 * Không đọc `Math.random`; hòa khoảng cách thì theo thứ tự trong bảng quái (ổn định).
 */
export function chainTargets(
  w: World,
  def: Pick<SkillDef, "range" | "bounces" | "chainReach" | "falloff">,
  ox: number,
  oy: number,
  angle: number,
): { hits: { id: string; n: number; scale: number }[]; pts: number[] } {
  const hits: { id: string; n: number; scale: number }[] = [];
  const pts = [Math.round(ox), Math.round(oy)];
  const bounces = Math.min(
    SKILL_LIMITS.chainBouncesMax,
    Math.max(0, Math.floor(Number.isFinite(def.bounces) ? (def.bounces as number) : 0)),
  );
  const reach = Math.min(
    SKILL_LIMITS.chainReachMax,
    Math.max(0, Number.isFinite(def.chainReach) ? (def.chainReach as number) : 0),
  );
  const falloff = Math.min(
    1,
    Math.max(
      SKILL_LIMITS.chainFalloffMin,
      Number.isFinite(def.falloff) ? (def.falloff as number) : CHAIN_FALLOFF_DEFAULT,
    ),
  );
  const done = new Set<string>();
  /** Quái sống gần (cx, cy) nhất trong `maxD` px (tính cả bán kính quái), chưa trúng; `front` thì còn phải ở nửa mặt phía trước. */
  const nearest = (cx: number, cy: number, maxD: number, front: boolean): string | undefined => {
    let best: string | undefined;
    let bd = Infinity;
    w.state.monsters.forEach((mon, id) => {
      const mc = w.mctrl.get(id);
      if (!mc || mon.hp <= 0 || done.has(id)) return;
      const d = Math.hypot(mon.x - cx, mon.y - cy);
      if (d > maxD + mc.def.radius) return;
      if (
        front &&
        d > mc.def.radius &&
        angleDiff(Math.atan2(mon.y - cy, mon.x - cx), angle) > CHAIN_FRONT_RAD
      )
        return;
      if (d < bd) {
        bd = d;
        best = id;
      }
    });
    return best;
  };
  let id = nearest(ox, oy, def.range, true);
  let scale = 1;
  for (let i = 0; id !== undefined && i <= bounces; i++) {
    const mon = w.state.monsters.get(id)!;
    done.add(id);
    hits.push({ id, n: 1, scale });
    if (pts.length < CHAIN_FX_POINTS_MAX * 2) pts.push(Math.round(mon.x), Math.round(mon.y));
    scale *= falloff;
    id = i < bounces && reach > 0 ? nearest(mon.x, mon.y, reach, false) : undefined;
  }
  return { hits, pts };
}

/** Tin `cast`: dùng chiêu ở ô `slot` (2..5) theo hướng `angle`. Client không tin được: mọi thứ kiểm lại ở đây. */
export function cast(w: World, sid: string, raw: unknown) {
  const r = w.ready(sid);
  if (!r) return;
  const { p, c } = r;
  if (c.limbo || c.stunned || (w.ghosts.size > 0 && w.ghosts.has(sid))) return;
  const m = parseCast(raw);
  if (!m || !slotOpen(m.slot, p.realm)) return;
  const idx = m.slot - 2;
  const def = byId(SKILL_BY_ID, c.skills.slots[idx]);
  const level = def ? c.skills.learned[def.id] : undefined;
  if (!def || !level) {
    w.events.toast(sid, { text: "Ô chiêu thức này còn trống.", tone: "bad" });
    return;
  }
  // Kiếp mới giữ chiêu đã khắc ở tầng 1 mà `rebirthSkills` không xét cảnh giới (và file lưu cũ): kiểm lại LÚC DÙNG bằng CÙNG hàm với client
  if (!skillReqMet(def, p.realm, p.tier)) {
    w.events.toast(sid, {
      text: `Cần đạt ${realmLabel(def.reqRealm, def.reqTier)} mới dùng được ${def.name}.`,
      tone: "bad",
    });
    return;
  }
  if (w.now < c.skillCd[idx]) return; // client tự hiện hồi chiêu (cdMax): im lặng, không tốn tin
  const cost = skillMpCost(def, p.maxMp);
  if (p.mp < cost) {
    w.events.toast(sid, { text: "Linh lực không đủ.", tone: "bad" });
    return;
  }
  c.skillCd[idx] = w.now + skillCooldownMs(def, level, cdrNow(w, sid, p, c)); // trang bị + phù cdr_phu (#514 lát 2)
  p.mp -= cost;
  p.meditating = false;
  p.angle = quantAngle(m.angle);
  if (def.dodgeMs) c.dodgeUntil = w.now + def.dodgeMs; // né đòn của quái trong lúc dùng (bộ pháp)
  const x0 = p.x;
  const y0 = p.y;
  w.events.fx({
    kind: "cast",
    by: sid,
    skill: def.id,
    x: x0,
    y: y0,
    angle: m.angle,
    range: fxRange(def),
  });

  if (def.shape === "dash") dash(w, sid, def, m.angle);

  // Cường Lực (`empower`, mục 51): sát thương gây ra của MỌI chiêu nhân `1 + ratio` (một lần mỗi lần dùng chiêu)
  const empower = c.st && c.st.list.length > 0 ? statusEmpowerMult(entriesOf(c.st, w.now)) : 1;
  const mult = def.mult * skillDamageMult(level) * empower;
  if (mult > 0) {
    const st = statsFor(p.realm, p.tier, p, c.mult);
    const atk = st.atk;
    const amp = ampMultOf(c.st, w.now, def.element); // một lần mỗi lần dùng chiêu (không mỗi mục tiêu)
    // gom mục tiêu trước rồi mới gây sát thương: hạ quái xoá nó khỏi bảng trong lúc duyệt
    const hits: { id: string; n: number; scale: number }[] = [];
    if (def.shape === "chain") {
      // SÉT LAN: thứ tự trúng + hệ số giảm theo từng lần nảy; vẽ tia nối tiếp cho người ở gần
      const ch = chainTargets(w, def, x0, y0, m.angle);
      hits.push(...ch.hits);
      if (ch.hits.length > 0)
        w.events.fx({ kind: "chain", by: sid, skill: def.id, x: x0, y: y0, pts: ch.pts });
    } else {
      w.state.monsters.forEach((mon, id) => {
        const mc = w.mctrl.get(id);
        if (!mc) return;
        const n =
          def.shape === "dash"
            ? segDist(mon.x, mon.y, x0, y0, p.x, p.y) <= DASH_HIT_RADIUS + mc.def.radius
              ? 1
              : 0
            : shapeHits(def, x0, y0, m.angle, mon.x, mon.y, mc.def.radius);
        if (n > 0) hits.push({ id, n, scale: 1 });
      });
    }
    for (const h of hits) {
      const mon = w.state.monsters.get(h.id);
      const mc = w.mctrl.get(h.id);
      if (!mon || !mc) continue;
      const em =
        elementMult(def.element, mc.def.element ?? "none") *
        treasureElementMult(p, def.element) * // pháp bảo hệ (M7.4)
        amp; // phù amp_<hệ> cùng hệ với chiêu (#514 lát 2); đòn lên người thách đấu (`castAtOpponent`) KHÔNG nhân
      // COMBO (mục 51): mục tiêu ĐANG mang trạng thái `needs` thì sát thương nhân `mult` (kẹp [1, `comboMultMax`]); xét TRƯỚC khi đánh (đòn này gỡ dấu)
      const cb = def.combo;
      const comboOn = cb !== undefined && monsterHasStatus(w, h.id, cb.needs);
      const cm = comboOn
        ? Math.min(
            SKILL_LIMITS.comboMultMax,
            Math.max(1, Number.isFinite(cb.mult) ? (cb.mult as number) : COMBO_MULT_DEFAULT),
          )
        : 1;
      let first = 0;
      for (let k = 0; k < h.n && w.mctrl.has(h.id); k++) {
        const { dmg, crit } = rollDamage(atk, mult * em * h.scale * cm, st.crit); // bạo kích cộng thêm từ trang bị (M7.4)
        if (k === 0) first = dmg;
        dealMonsterDamage(w, h.id, mon, sid, dmg, crit, true, comboOn);
      }
      if (!w.mctrl.has(h.id)) continue; // đã chết: không còn gắn trạng thái
      if (comboOn && cb) {
        if (cb.consume) takeMonsterStatus(w, h.id, cb.needs); // gỡ dấu / trạng thái đã dùng
        if (cb.apply) applyMonsterStatus(w, h.id, cb.apply, first, sid); // gắn thêm (vd dấu hệ khác, choáng ngắn)
      }
      for (const eff of def.effects)
        if (statusOf(eff.status)?.harmful) applyMonsterStatus(w, h.id, eff, first, sid);
    }
    if (def.shape !== "dash" && w.duels.active) castAtOpponent(w, sid, def, x0, y0, m.angle, mult);
  }

  // trạng thái CÓ LỢI của chiêu (hộ thể, tăng tốc, hồi phục) luôn lên chính mình; trạng thái có hại chỉ lên kẻ trúng đòn
  for (const eff of def.effects)
    if (statusOf(eff.status)?.harmful === false) applyPlayerStatus(w, sid, eff, 0, sid);

  sendSkills(w, sid); // hồi chiêu mới (client đếm lùi từ đây)
}

/** Lao theo `angle` tối đa `def.reach` px, dừng ở chỗ bị chặn (`moveWithCollision` dùng chung); ghi lại vị trí công khai. */
function dash(w: World, sid: string, def: SkillDef, angle: number) {
  const p = w.state.players.get(sid);
  if (!p) return;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let left = def.reach ?? 0;
  while (left > 0) {
    const s = Math.min(DASH_STEP, left);
    const next = w.map.moveWithCollision(p.x, p.y, ux * s, uy * s, PLAYER_RADIUS);
    if (next.x === p.x && next.y === p.y) break; // bị chặn
    p.x = next.x;
    p.y = next.y;
    left -= s;
  }
  syncPublicPos(p); // dịch chuyển tức thời: người khác thấy ngay
}

/**
 * Chiêu trúng ĐỐI THỦ thách đấu (cùng trận, pha `fight`): sát thương qua `duelHit` (đã nhân `PK_DAMAGE_MULT`, không có hệ khắc); chỉ trạng thái
 * TÊ CÓNG gắn được lên người (choáng bị gỡ trong PK theo kế hoạch mục 5.4; sát thương theo giây / vỡ giáp chưa nối cho người chơi).
 */
function castAtOpponent(
  w: World,
  sid: string,
  def: SkillDef,
  x0: number,
  y0: number,
  angle: number,
  mult: number,
) {
  const target = w.duels.opponentOf(sid);
  const pt = target === undefined ? undefined : w.state.players.get(target);
  if (!target || !pt) return;
  const n = shapeHits(def, x0, y0, angle, pt.x, pt.y, PLAYER_RADIUS);
  let landed = false;
  for (let k = 0; k < n; k++) landed = duelHit(w, sid, target, mult) || landed;
  if (!landed) return;
  for (const eff of def.effects)
    if (statusOf(eff.status)?.kind === "slow") applyPlayerStatus(w, target, eff, 0, sid);
}
