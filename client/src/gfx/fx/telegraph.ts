/**
 * Báo trước đòn (`warn`) và đạn tầm xa (`bolt`) của quái (M7.7, #508; hợp đồng `shared/` `FxMsg`, hành vi quái M7.3 #504). Lớp THUẦN: không Phaser, không đồng hồ thật
 * (mọi hàm nhận `elapsed` ms), nên test tất định được. `telegraph-layer.ts` vẽ bằng Graphics từ pool; máy chủ quyết định mọi trúng / trượt, đây chỉ là hình ảnh.
 *
 * Vì sao client TỰ vẽ đạn: máy chủ chỉ gửi MỘT tin `bolt` lúc bắn (vị trí, hướng, tốc độ, tầm); đạn không là state (tiết kiệm băng thông, `MAX_BOLTS`). Client lấy vị trí
 * đạn bằng `x0 + cos(angle) * min(speed * t, range)`, cùng công thức máy chủ dùng để kiểm trúng, nên mắt người chơi thấy đạn ở đúng chỗ nó gây sát thương.
 *
 * Mọi số từ tin nhắn đều bị kiểm hữu hạn và kẹp vào khoảng hợp lý: tin hỏng không làm vẽ vô hạn / NaN / tốn bộ nhớ.
 */
import { elementOf, type FxMsg } from "@tien-gioi/shared";
import { castTint } from "./cast-fx";

export type WarnMsg = Extract<FxMsg, { kind: "warn" }>;
export type BoltMsg = Extract<FxMsg, { kind: "bolt" }>;

/** Một vùng báo không sống ngắn hơn / dài hơn các mốc này (ms): quá ngắn thì không kịp thấy, quá dài thì có thể là tin hỏng. */
export const WARN_MIN_MS = 80;
export const WARN_MAX_MS = 3000;
/** Bán kính / chiều dài tối đa (px) và bề rộng tối đa của vùng `line` (px). Màn hình ~1280 px: 480 đã phủ nửa màn. */
export const WARN_MAX_R = 480;
export const WARN_MAX_W = 320;
/** Sau khi hết `ms` (đòn đáp xuống) vùng báo mờ nhanh trong khoảng này rồi biến mất (ms). */
export const WARN_FADE_MS = 140;
/** Mặc định khi tin `cone` / `line` thiếu số đo. */
export const WARN_DEFAULT_ARC = Math.PI / 2;
export const WARN_DEFAULT_W = 24;
/** Số đoạn xấp xỉ cung của vùng `cone` (đỉnh = steps + 2 kể cả tâm). */
export const WARN_MAX_ARC_STEPS = 12;
/** Đạn: tốc độ (px/giây) và tầm (px) hợp lệ. Nhanh hơn 1600 px/s thì người chơi không còn nhìn thấy gì để tránh. */
export const BOLT_MAX_SPEED = 1600;
export const BOLT_MAX_RANGE = 1000;
export const BOLT_MIN_SPEED = 20;
/** Màu đạn khi quái không có hệ (cùng màu vệt chém của yêu thú `mslash`). */
export const BOLT_NEUTRAL_TINT = 0xff6050;
/** Đạn tới cuối tầm thì mờ nhanh trong khoảng này (ms). */
export const BOLT_FADE_MS = 90;

/** Có hệ thật (không phải thiếu / lạ / `none`)? Quái vô sắc cho đạn màu trung tính chứ không xám. */
const hasElement = (e: unknown) => {
  const id = elementOf(e)?.id;
  return id !== undefined && id !== "none";
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (...v: number[]) => v.every((n) => Number.isFinite(n));

export interface WarnPlan {
  shape: "circle" | "cone" | "line";
  x: number;
  y: number;
  /** circle: bán kính; cone: bán kính cung; line: chiều dài (px) */
  r: number;
  angle: number;
  /** Góc mở của `cone` (rad) */
  arc: number;
  /** Bề rộng của `line` (px) */
  w: number;
  /** Thời gian tới lúc đòn đáp xuống (ms) */
  ms: number;
}

/** Kiểm + kẹp tin `warn`. `null` khi hình lạ hoặc số không hữu hạn / không dương. */
export function planWarn(m: WarnMsg): WarnPlan | null {
  const shape = m?.shape;
  if (shape !== "circle" && shape !== "cone" && shape !== "line") return null;
  if (!finite(m.x, m.y, m.r, m.ms) || !(m.r > 0) || !(m.ms > 0)) return null;
  const angle = m.angle === undefined ? 0 : m.angle;
  const arc = m.arc === undefined ? WARN_DEFAULT_ARC : m.arc;
  const w = m.w === undefined ? WARN_DEFAULT_W : m.w;
  if (!finite(angle, arc, w) || !(arc > 0) || !(w > 0)) return null;
  return {
    shape,
    x: m.x,
    y: m.y,
    r: clamp(m.r, 4, WARN_MAX_R),
    angle,
    arc: clamp(arc, 0.1, Math.PI * 2),
    w: clamp(w, 4, WARN_MAX_W),
    ms: clamp(m.ms, WARN_MIN_MS, WARN_MAX_MS),
  };
}

/** Tiến độ gồng 0..1: vùng tô đặc lớn dần từ tâm tới viền theo thời gian, hết `ms` là đầy = lúc đòn đáp xuống. */
export function warnProgress(elapsed: number, ms: number): number {
  if (!(ms > 0) || !Number.isFinite(elapsed)) return 1;
  return clamp(elapsed / ms, 0, 1);
}

/** Độ đậm của nét viền: nhịp thở nhanh dần về cuối cho tới lúc đáp; giảm chuyển động thì đứng yên. Luôn trong (0.45, 0.95). */
export function warnOutlineAlpha(elapsed: number, ms: number, reduced: boolean): number {
  if (reduced) return 0.8;
  const p = warnProgress(elapsed, ms);
  const hz = 2 + 4 * p; // 2 -> 6 nhịp/giây
  return 0.7 + 0.25 * Math.sin((elapsed / 1000) * Math.PI * 2 * hz);
}

/** Độ đậm của vùng tô đặc: tăng theo tiến độ (đậm dần = sắp đáp). Sau `ms` mờ dần về 0 trong `WARN_FADE_MS`. */
export function warnFillAlpha(elapsed: number, ms: number): number {
  const p = warnProgress(elapsed, ms);
  const base = 0.14 + 0.26 * p;
  if (elapsed <= ms) return base;
  return base * clamp(1 - (elapsed - ms) / WARN_FADE_MS, 0, 1);
}

/** Vùng báo còn sống không (kể cả khoảng mờ sau `ms`). */
export function warnAlive(elapsed: number, ms: number): boolean {
  return elapsed < ms + WARN_FADE_MS;
}

/** Khoảng cách từ điểm (px, py) tới đoạn (ax, ay)-(bx, by). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Hiệu hai góc, chuẩn về [0, pi]. */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/**
 * Người chơi (tâm (px, py), bán kính thân `pad`) có đang đứng TRONG vùng báo không: đúng ý nghĩa vùng máy chủ kiểm trúng (thân chạm vào vùng là trúng), dùng để cảnh báo
 * "bạn đang trong vùng nguy hiểm" (viền sáng + tiếng báo). `line`: khoảng cách tới đoạn dài `r` <= nửa bề rộng + `pad` (hình viên thuốc, như `charge.ts`); `circle`: khoảng cách
 * tâm <= `r` + `pad`; `cone`: trong bán kính `r` + `pad` và lệch hướng không quá nửa góc mở (nới thêm `asin(pad / d)` vì thân có bề rộng). Số không hữu hạn thì `false`.
 */
export function warnCovers(plan: WarnPlan, px: number, py: number, pad = 0): boolean {
  if (!finite(px, py, pad)) return false;
  const p = Math.max(0, pad);
  if (plan.shape === "circle") return Math.hypot(px - plan.x, py - plan.y) <= plan.r + p;
  if (plan.shape === "line") {
    const bx = plan.x + Math.cos(plan.angle) * plan.r;
    const by = plan.y + Math.sin(plan.angle) * plan.r;
    return segDist(px, py, plan.x, plan.y, bx, by) <= plan.w / 2 + p;
  }
  const d = Math.hypot(px - plan.x, py - plan.y);
  if (d > plan.r + p) return false;
  if (d <= p) return true; // thân đã chạm tâm quạt
  const slack = Math.asin(Math.min(1, p / d));
  return angleDiff(Math.atan2(py - plan.y, px - plan.x), plan.angle) <= plan.arc / 2 + slack;
}

export interface Pt {
  x: number;
  y: number;
}

/** Số đoạn cung theo bậc chất lượng: bậc ít chi tiết vẽ thô hơn (`emitterBudget` Thấp 4 -> 5, Vừa 10 -> 8, Cao 24+ -> 12). */
export function warnArcSteps(emitterBudget: number): number {
  if (!Number.isFinite(emitterBudget)) return 5;
  return clamp(Math.round(4 + emitterBudget / 3), 5, WARN_MAX_ARC_STEPS);
}

/**
 * Ghi đa giác của vùng `cone` / `line` vào `out` (toạ độ TƯƠNG ĐỐI với (x, y) của vùng), `scale` 0..1 co chiều dài / bán kính (vùng tô đặc lớn dần). Trả số đỉnh đã ghi
 * (0 với `circle`: vẽ bằng hình tròn). Không cấp phát mảng mới: `out` phải có sẵn >= WARN_MAX_ARC_STEPS + 2 phần tử.
 *  - `cone`: tâm rồi các điểm trên cung (steps + 1 điểm) từ angle - arc/2 tới angle + arc/2;
 *  - `line`: hình chữ nhật dài `r * scale`, rộng `w`, bắt đầu từ tâm, dọc theo `angle` (như vùng máy chủ kiểm trúng).
 */
export function warnPolygon(out: Pt[], plan: WarnPlan, scale: number, steps: number): number {
  const s = clamp(scale, 0, 1);
  if (plan.shape === "cone") {
    const n = clamp(Math.floor(steps), 1, WARN_MAX_ARC_STEPS);
    out[0].x = 0;
    out[0].y = 0;
    const r = plan.r * s;
    const a0 = plan.angle - plan.arc / 2;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (plan.arc * i) / n;
      out[i + 1].x = Math.cos(a) * r;
      out[i + 1].y = Math.sin(a) * r;
    }
    return n + 2;
  }
  if (plan.shape === "line") {
    const c = Math.cos(plan.angle);
    const sn = Math.sin(plan.angle);
    const len = plan.r * s;
    const hw = plan.w / 2;
    // (0, ±hw) quay theo góc rồi cộng (len, 0) quay theo góc
    out[0].x = -sn * hw;
    out[0].y = c * hw;
    out[1].x = c * len - sn * hw;
    out[1].y = sn * len + c * hw;
    out[2].x = c * len + sn * hw;
    out[2].y = sn * len - c * hw;
    out[3].x = sn * hw;
    out[3].y = -c * hw;
    return 4;
  }
  return 0;
}

export interface BoltPlan {
  x: number;
  y: number;
  angle: number;
  /** px/giây */
  speed: number;
  /** px */
  range: number;
  tint: number;
  /** Thời gian bay hết tầm (ms) */
  flightMs: number;
}

/** Kiểm + kẹp tin `bolt`. `null` khi số không hữu hạn / không dương. Hệ lạ (hoặc không có) -> màu trung tính. */
export function planBolt(m: BoltMsg): BoltPlan | null {
  if (!finite(m?.x, m?.y, m?.angle, m?.speed, m?.range)) return null;
  if (!(m.speed > 0) || !(m.range > 0)) return null;
  const speed = clamp(m.speed, BOLT_MIN_SPEED, BOLT_MAX_SPEED);
  const range = clamp(m.range, 1, BOLT_MAX_RANGE);
  return {
    x: m.x,
    y: m.y,
    angle: m.angle,
    speed,
    range,
    tint: hasElement(m.element) ? castTint(m.element) : BOLT_NEUTRAL_TINT,
    flightMs: (range / speed) * 1000,
  };
}

/** Quãng đã bay (px) sau `elapsed` ms: không âm, không vượt tầm. */
export function boltTravelled(plan: BoltPlan, elapsed: number): number {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.min(plan.range, (plan.speed * elapsed) / 1000);
}

/** Vị trí đạn sau `elapsed` ms (ghi vào `out`, không cấp phát). */
export function boltPosition(out: Pt, plan: BoltPlan, elapsed: number): Pt {
  const d = boltTravelled(plan, elapsed);
  out.x = plan.x + Math.cos(plan.angle) * d;
  out.y = plan.y + Math.sin(plan.angle) * d;
  return out;
}

/** Đạn còn sống không: bay hết tầm rồi mờ nhanh trong `BOLT_FADE_MS`. */
export function boltAlive(plan: BoltPlan, elapsed: number): boolean {
  return elapsed < plan.flightMs + BOLT_FADE_MS;
}

/** Độ đậm của đạn: 1 khi đang bay, mờ về 0 trong `BOLT_FADE_MS` sau khi hết tầm. */
export function boltAlpha(plan: BoltPlan, elapsed: number): number {
  if (elapsed <= plan.flightMs) return 1;
  return clamp(1 - (elapsed - plan.flightMs) / BOLT_FADE_MS, 0, 1);
}

/** Trần số vùng báo / đạn sống cùng lúc theo ngân sách emitter của bậc chất lượng (Thấp 4 -> 4 / 8, Vừa 10 -> 7 / 10, Cao 24 -> 14 / 24, Rất cao 40 -> 16 / 32). */
export interface TelegraphLimits {
  warns: number;
  bolts: number;
  /** Vẽ chi tiết (nét viền nhịp thở, vệt đuôi đạn) hay chỉ hình tối thiểu */
  detail: boolean;
}
export function telegraphLimits(emitterBudget: number): TelegraphLimits {
  const b = Number.isFinite(emitterBudget) ? emitterBudget : 4;
  return {
    warns: clamp(Math.round(b / 2) + 2, 4, 16),
    bolts: clamp(Math.round(b), 8, 32),
    detail: b >= 10,
  };
}

/** Số điểm vệt đuôi đạn (0 khi không chi tiết). Cao -> 4, Vừa -> 3. */
export function boltTrailCount(limits: TelegraphLimits): number {
  return limits.detail ? (limits.bolts >= 24 ? 4 : 3) : 0;
}
