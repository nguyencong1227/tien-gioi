/**
 * Kế hoạch hiệu ứng CÔNG PHÁP (M5.2, #329): điểm phát hạt dọc đường kiếm khí và ở hai đầu cung chém. Hàm thuần (không Phaser)
 * để test; `WorldScene` chỉ gọi và phát bằng `fx.play`. Không thêm tin / trường đồng bộ.
 */
import type { FxPriority } from "./budget";

export interface FxPoint {
  recipe: string;
  x: number;
  y: number;
  /** Hướng (radian) cho công thức có hướng; thiếu = toả mọi hướng. */
  angle?: number;
  tint: number;
  priority: FxPriority;
  /** Trễ so với lúc ra đòn (ms), để hạt đi cùng ảnh kiếm khí đang bay. */
  delayMs: number;
}

/** Khoảng cách tối đa giữa hai điểm phát dọc đường kiếm khí (px) và số điểm tối đa (giữ chi phí cố định, kể cả khi tầm xa). */
export const QI_STEP_PX = 70;
export const QI_MAX_POINTS = 5;
/** Thời gian ảnh kiếm khí bay hết tầm (ms), khớp `stepTransientFx` trong WorldScene (220 ms). */
export const QI_TRAVEL_MS = 220;
/**
 * Số điểm `sword-qi` tối đa theo ngân sách emitter của hồ sơ chất lượng: mỗi điểm là MỘT lần phát = một emitter sống trong ~0,4 s.
 * Chia 3 để một đòn của mình (ưu tiên 2, được vượt trần tới gấp đôi) chỉ chiếm ~1/3 ngân sách, chừa chỗ cho người khác:
 * Thấp (4) -> 1 điểm + mũi = 2 emitter; Vừa (10) -> 3 + mũi; Cao (24) -> 5 (trần `QI_MAX_POINTS`) + mũi.
 */
export function qiPointsFor(emitterBudget: number): number {
  if (!Number.isFinite(emitterBudget)) return 1;
  return Math.max(1, Math.min(QI_MAX_POINTS, Math.floor(emitterBudget / 3)));
}

/** Số đầu cung chém phát tia lửa: bậc Thấp (<= 4 emitter) chỉ một đầu, còn lại hai. */
export function slashEdgesFor(emitterBudget: number): 1 | 2 {
  return Number.isFinite(emitterBudget) && emitterBudget <= 4 ? 1 : 2;
}

/** Kiếm khí bay lệch lên một chút so với chân nhân vật (khớp `fxSword`: y - 10). */
export const QI_Y_OFFSET = -10;

/**
 * Kiếm khí: `sword-qi` rải đều dọc đường bay (không điểm nào ở gốc, để khỏi chồng lên nhân vật) và `sword-tip` ở mũi.
 * Của mình ưu tiên 2 (không bị bỏ khi đông), người khác ưu tiên 1. `maxQi` (từ `qiPointsFor(emitterBudget)`) chặn số điểm qi
 * theo hồ sơ chất lượng để một đòn không nuốt hết ngân sách emitter ở bậc Thấp.
 */
export function planSwordBeam(
  x: number,
  y: number,
  angle: number,
  range: number,
  mine: boolean,
  tint: number,
  maxQi: number = QI_MAX_POINTS,
): FxPoint[] {
  if (!Number.isFinite(x + y + angle + range) || range <= 0) return [];
  const priority: FxPriority = mine ? 2 : 1;
  const cap = Math.max(1, Math.min(QI_MAX_POINTS, Math.floor(maxQi)));
  const n = Math.max(1, Math.min(cap, Math.ceil(range / QI_STEP_PX)));
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pts: FxPoint[] = [];
  for (let i = 1; i <= n; i++) {
    const d = (range * i) / (n + 1);
    pts.push({
      recipe: "sword-qi",
      x: x + c * d,
      y: y + QI_Y_OFFSET + s * d,
      angle,
      tint,
      priority,
      delayMs: Math.round((QI_TRAVEL_MS * i) / (n + 1)),
    });
  }
  pts.push({
    recipe: "sword-tip",
    x: x + c * range,
    y: y + QI_Y_OFFSET + s * range,
    tint,
    priority,
    delayMs: QI_TRAVEL_MS,
  });
  return pts;
}

/** Cung chém: tia lửa ở hai đầu cung (góc ± nửa cung, ở ~90 % tầm). */
export function planSlashEdges(
  x: number,
  y: number,
  angle: number,
  range: number,
  arc: number,
  mine: boolean,
  tint: number,
  edges: 1 | 2 = 2,
): FxPoint[] {
  if (!Number.isFinite(x + y + angle + range + arc) || range <= 0) return [];
  const priority: FxPriority = mine ? 2 : 1;
  const r = range * 0.9;
  return (edges === 1 ? [1] : [-1, 1]).map((sign) => {
    const a = angle + (sign * arc) / 2;
    return {
      recipe: "slash-edge",
      x: x + Math.cos(a) * r,
      y: y - 8 + Math.sin(a) * r,
      tint,
      priority,
      delayMs: 0,
    };
  });
}
