// Quái TẦM XA (`behavior: "ranged"`, M7.3, #504, docs/PHAN_CONG_M7.md mục 6): đứng cách xa và bắn ĐẠN. Đạn KHÔNG là thực thể trong state: server giữ danh sách riêng
// (`World.bolts`, tối đa `MAX_BOLTS`), mỗi tick di chuyển đạn và kiểm trúng người chơi; client chỉ nhận MỘT `fx` `bolt` lúc bắn (`sendNear`, tầm = `range`) và tự vẽ đạn bay
// theo `speed` / `angle` / `range`. Tiết kiệm băng thông: không patch state mỗi tick. Luật chốt (server quyết định, người chơi tránh được):
//  - Bắn thẳng về phía mục tiêu LÚC BẮN (không đón đầu): người chơi đi ngang là tránh được (`boltSpeed` mặc định thấp hơn tốc độ chạy của người chơi cùng bậc).
//  - Đạn dừng ở ô chặn (tường, đá, nước sâu như `isBlockedPx`) và hết tầm `boltRange`; trúng người đầu tiên nằm sát đường bay thì mất đạn (một đạn một người).
//  - Không trúng người trong khu an toàn (đạn bay vào trấn thì thôi); người chết / hồn lìa xác / đang thách đấu / đang né: `hurtPlayer` đã bỏ qua (một nơi giữ các luật này).
//  - Quái giữ khoảng cách: đứng bắn khi mục tiêu trong tầm, lùi khi mục tiêu áp sát quá, đuổi theo khi mục tiêu ở quá xa. Choáng thì không bắn.
//  - Sát thương cố định `atk` (không `Math.random`: giữ nguyên chuỗi ngẫu nhiên của bench có hạt giống).
// Mô-đun chỉ biết `World`; `monsters.ts` gọi `rangedStep` mỗi tick cho quái có mục tiêu, `tickWorld` gọi `tickBolts`.
import { MAX_BOLTS, PLAYER_RADIUS, type MonsterKind, type SkillEffect } from "@tien-gioi/shared";
import type { Monster } from "../schema";
import { quantAngle, type World, type MonsterCtrl } from "../world";
import { hurtPlayer } from "./combat";
import { applyPlayerStatus } from "./status";

/** Một đạn đang bay (chỉ server). */
export interface Bolt {
  x: number;
  y: number;
  /** Hướng bay (đã chuẩn hoá) */
  ux: number;
  uy: number;
  speed: number;
  /** Quãng còn bay được (px) */
  left: number;
  dmg: number;
  /** Loài quái bắn (để viết thông báo khi trúng; quái bắn có thể đã chết lúc đạn tới) */
  kind: string;
  /** Hiệu ứng gắn lên người trúng đạn (`poisoner`: độc), chỉ khi đạn THẬT SỰ trúng (qua luật né / bất tử) */
  effect?: SkillEffect;
}

/** Độc của quái `poisoner` (M7.3): mỗi giây `ratio` x sát thương gốc của đòn trong `ms`; số khởi đầu, M7.9 hiệu chỉnh. Không giết người (dot không giết) và khu an toàn thanh tẩy. */
export const POISON_EFFECT: SkillEffect = { status: "poison", ms: 4000, ratio: 0.08, chance: 1 };

/** Hiệu ứng đi kèm đòn của quái `def` (đòn gần lẫn đạn): độc cho `poisoner`, còn lại không có. */
export function onHitEffectOf(def: MonsterKind): SkillEffect | undefined {
  return def.behavior === "poisoner" ? POISON_EFFECT : undefined;
}

/** Mặc định khi `MonsterKind.boltSpeed` / `boltRange` bỏ trống (px / giây, px). */
export const DEFAULT_BOLT_SPEED = 240;
export const DEFAULT_BOLT_RANGE = 300;
/** Bán kính trúng của đạn (cộng `PLAYER_RADIUS` của người chơi) (px). */
export const BOLT_RADIUS = 6;
/** Quái đứng bắn khi mục tiêu cách trong (`BOLT_HOLD_MIN` x tầm, `BOLT_HOLD_MAX` x tầm]; gần hơn thì lùi, xa hơn thì đuổi. */
export const BOLT_HOLD_MIN = 0.3;
export const BOLT_HOLD_MAX = 0.85;
/** Tốc độ lùi so với tốc độ đuổi. */
export const BOLT_RETREAT_MULT = 0.6;

/** Đạn kiểm ô chặn mỗi `BOLT_WALL_SAMPLE` px dọc đoạn bay (nhỏ hơn `TILE` = 32): đạn nhanh (> 32 px mỗi tick, tức `boltSpeed` > 640) không nhảy qua tường mỏng một ô. */
export const BOLT_WALL_SAMPLE = 16;

/** Khoảng cách từ điểm (px, py) tới đoạn (ax, ay)-(bx, by). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Quái này có bắn đạn không: `ranged`, hoặc `poisoner` có khai báo `boltRange` (Độc Thiềm: đạn độc). `poisoner` không có tầm bắn thì vẫn đánh gần và gây độc bằng đòn gần.
 */
export function isRanged(def: MonsterKind): boolean {
  return def.behavior === "ranged" || (def.behavior === "poisoner" && def.boltRange !== undefined);
}

/** Tầm bay của đạn quái `def` (px) và tốc độ đạn (px / giây). */
export const boltRangeOf = (def: MonsterKind) => def.boltRange ?? DEFAULT_BOLT_RANGE;
export const boltSpeedOf = (def: MonsterKind) => def.boltSpeed ?? DEFAULT_BOLT_SPEED;

/** Bắn MỘT đạn từ quái `m` về hướng `angle`. Đủ `MAX_BOLTS` rồi thì bỏ (không ném lỗi); trả `true` nếu đã bắn. */
export function fireBolt(w: World, m: Monster, def: MonsterKind, angle: number): boolean {
  if (w.bolts.length >= MAX_BOLTS) return false;
  const speed = boltSpeedOf(def);
  const range = boltRangeOf(def);
  w.bolts.push({
    x: m.x,
    y: m.y,
    ux: Math.cos(angle),
    uy: Math.sin(angle),
    speed,
    left: range,
    dmg: Math.max(1, Math.round(def.atk)),
    kind: def.id,
    effect: onHitEffectOf(def),
  });
  w.events.fx({ kind: "bolt", x: m.x, y: m.y, angle, speed, range, element: def.element });
  return true;
}

export interface RangedMove {
  /** Điểm quái nhắm đi tới (px) và tốc độ (px / giây); `speed` 0 = đứng bắn */
  tx: number;
  ty: number;
  speed: number;
}

/**
 * Một tick của quái tầm xa có mục tiêu `target` ở khoảng cách `d`: trả cách di chuyển tick này (đứng bắn / lùi / đuổi). Bắn nếu mục tiêu trong tầm và đã hết hồi
 * (`attackCd`); choáng không bắn (chuyển động do `monsters.ts` áp: choáng đứng im).
 */
export function rangedStep(
  w: World,
  m: Monster,
  mc: MonsterCtrl,
  target: { x: number; y: number },
  d: number,
  stunned: boolean,
): RangedMove {
  const def = mc.def;
  const range = boltRangeOf(def);
  const aim = Math.atan2(target.y - m.y, target.x - m.x);
  if (d > range * BOLT_HOLD_MAX) {
    // Quá xa: đuổi tới tầm bắn
    return { tx: target.x, ty: target.y, speed: def.speed };
  }
  m.angle = quantAngle(aim);
  if (!stunned && d <= range && w.now >= mc.nextAttack) {
    if (fireBolt(w, m, def, aim)) mc.nextAttack = w.now + def.attackCd;
  }
  if (d < range * BOLT_HOLD_MIN) {
    // Mục tiêu áp sát: lùi ra xa mục tiêu (vẫn bắn)
    return {
      tx: m.x - Math.cos(aim) * 100,
      ty: m.y - Math.sin(aim) * 100,
      speed: def.speed * BOLT_RETREAT_MULT,
    };
  }
  return { tx: m.x, ty: m.y, speed: 0 };
}

/**
 * Một tick của mọi đạn: bay `speed x dt`, dừng ở ô chặn / hết tầm, trúng người chơi đầu tiên nằm sát đoạn vừa bay (kiểm theo ĐOẠN nên đạn nhanh không xuyên qua người).
 * Danh sách rỗng thì không tốn gì.
 */
export function tickBolts(w: World, dt: number) {
  if (w.bolts.length === 0) return;
  const reach = PLAYER_RADIUS + BOLT_RADIUS;
  let keep = 0;
  for (let i = 0; i < w.bolts.length; i++) {
    const b = w.bolts[i];
    let step = Math.min(b.left, b.speed * dt);
    // Quét ô chặn theo ĐOẠN (không chỉ điểm cuối): gặp ô chặn thì đạn dừng ngay trước nó và vẫn trúng người đứng trước tường trong đoạn còn lại
    let wall = false;
    if (step > 0) {
      for (let s = BOLT_WALL_SAMPLE; ; s += BOLT_WALL_SAMPLE) {
        const d = Math.min(s, step);
        if (w.map.isBlockedPx(b.x + b.ux * d, b.y + b.uy * d)) {
          step = Math.max(0, d - BOLT_WALL_SAMPLE);
          wall = true;
          break;
        }
        if (d >= step) break;
      }
    } else step = 0; // tốc độ / dt không dương hoặc không phải số: đạn không bay, bỏ (không treo vòng quét)
    const nx = b.x + b.ux * step;
    const ny = b.y + b.uy * step;
    let dead = wall || step <= 0;
    if (step > 0) {
      let hitSid: string | null = null;
      let hitD = Infinity;
      w.state.players.forEach((p, sid) => {
        if (p.dead || (w.ghosts.size > 0 && w.ghosts.has(sid))) return;
        // Loại nhanh người ở xa đoạn bay trước khi tính khoảng cách chính xác
        if (Math.abs(p.x - nx) > step + reach + 4 && Math.abs(p.x - b.x) > step + reach + 4) return;
        if (Math.abs(p.y - ny) > step + reach + 4 && Math.abs(p.y - b.y) > step + reach + 4) return;
        if (w.map.inSafe(p.x, p.y)) return;
        const dd = segDist(p.x, p.y, b.x, b.y, nx, ny);
        if (dd <= reach && dd < hitD) {
          hitD = dd;
          hitSid = sid;
        }
      });
      if (hitSid !== null) {
        const p = w.state.players.get(hitSid);
        if (p && hurtPlayer(w, hitSid, p, b.dmg, { kind: b.kind }) && b.effect)
          applyPlayerStatus(w, hitSid, b.effect, b.dmg, ""); // độc đi kèm đạn trúng (M7.3)
        dead = true;
      }
    }
    b.x = nx;
    b.y = ny;
    b.left -= step;
    if (b.left <= 0) dead = true;
    if (!dead) w.bolts[keep++] = b;
  }
  w.bolts.length = keep;
}
