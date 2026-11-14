/**
 * Kế hoạch hiệu ứng DÙNG CHIÊU (M7.7, #508): từ tin `FxMsg` `cast` (id chiêu, vị trí, hướng, tầm THẬT máy chủ tính) và hình / hệ của `SkillDef`, tính các điểm phát
 * hạt. Hàm thuần (không Phaser), `WorldScene.onFx` chỉ gọi và phát bằng `fx.play` (như `planSwordBeam`). Không thêm tin / trường đồng bộ, KHÔNG chạm vào kết quả
 * trận đánh (máy chủ quyết định): đây chỉ là hình ảnh. Số điểm bị chặn theo ngân sách emitter của bậc chất lượng để một chiêu không nuốt hết ngân sách.
 */
import { elementOf, type SkillDef } from "@tien-gioi/shared";
import { elementColor } from "../../skill-bar";
import type { FxPriority } from "./budget";
import { castRecipeId } from "./recipes-cast";
import type { FxPoint } from "./skill-fx";

/** Số điểm phát tối đa của một chiêu: ~1/4 ngân sách emitter (Thấp 4 -> 1, Vừa 10 -> 2, Cao 24 -> 6, Rất cao 40 -> 8, tối đa `CAST_MAX_POINTS`). */
export const CAST_MAX_POINTS = 8;
export function castPointsFor(emitterBudget: number): number {
  if (!Number.isFinite(emitterBudget)) return 1;
  return Math.max(1, Math.min(CAST_MAX_POINTS, Math.floor(emitterBudget / 4)));
}

/** Hạt bay lệch lên một chút so với chân nhân vật (khớp kiếm khí: y - 10). */
export const CAST_Y_OFFSET = -10;
/** Thời gian hạt đi hết đường của chiêu có đường đi (tia, bộ pháp), ms: các điểm trễ dần theo vị trí. */
export const CAST_TRAVEL_MS = 200;

/** Màu hạt theo HỆ của chiêu (0xRRGGBB), cùng bảng màu với biểu tượng ở thanh chiêu. Hệ lạ -> xám vô sắc. */
export function castTint(element: unknown): number {
  const id = elementOf(element)?.id;
  return Number.parseInt(elementColor(id).slice(1), 16);
}

/** `n` điểm đều nhau trên đoạn (0, 1] dọc hướng `angle` từ (x, y), kèm trễ theo `CAST_TRAVEL_MS`. */
function along(x: number, y: number, angle: number, dist: number, n: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pts: Array<{ x: number; y: number; t: number }> = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pts.push({ x: x + c * dist * t, y: y + CAST_Y_OFFSET + s * dist * t, t });
  }
  return pts;
}

export interface CastFxInput {
  skill: SkillDef;
  /** Vị trí và hướng lúc dùng (từ tin `cast`), tầm thật máy chủ tính (px): ground = reach + bán kính, dash = quãng lao, còn lại = tầm */
  x: number;
  y: number;
  angle: number;
  range: number;
  /** Của chính mình (ưu tiên 2, không bị bỏ khi đông) hay của người khác (ưu tiên 1) */
  mine: boolean;
  emitterBudget: number;
}

/**
 * Các điểm phát hạt của một lần dùng chiêu, theo hình:
 *  - `cone`: giữa trước mặt + hai đầu cung (±arc/2) ở ~90 % tầm; `line`: rải dọc tia (có trễ theo thời gian bay);
 *  - `fan`: đầu từng tia toả (chọn đều nếu nhiều hơn ngân sách); `nova`: vòng đều quanh mình; `self`: một điểm ở người dùng;
 *  - `ground`: tâm vùng (cách mình `reach` theo hướng đánh) + vòng quanh tâm; `dash`: rải dọc đường lao (trễ theo vị trí).
 * Trả `[]` khi dữ liệu không hữu hạn hoặc tầm <= 0 (trừ `self`, không cần tầm).
 */
export function planCastFx(input: CastFxInput): FxPoint[] {
  const { skill: def, x, y, angle, range, mine } = input;
  if (!Number.isFinite(x + y + angle + range)) return [];
  if (def.shape !== "self" && !(range > 0)) return [];
  const priority: FxPriority = mine ? 2 : 1;
  const recipe = castRecipeId(def.fx);
  const tint = castTint(def.element);
  const cap = castPointsFor(input.emitterBudget);
  const pt = (px: number, py: number, delayMs = 0, a?: number): FxPoint => ({
    recipe,
    x: px,
    y: py,
    tint,
    priority,
    delayMs: Math.round(delayMs),
    ...(a === undefined ? {} : { angle: a }),
  });
  const gy = y + CAST_Y_OFFSET;
  const out: FxPoint[] = [];

  switch (def.shape) {
    case "cone": {
      const half = (def.arc ?? Math.PI / 2) / 2;
      // thứ tự ưu tiên khi ngân sách ít: giữa, trái, phải, rồi các điểm xen giữa
      const offsets = [0, -1, 1, -0.5, 0.5, -0.75, 0.75, -0.25].slice(0, cap);
      for (const k of offsets) {
        const r = range * (k === 0 ? 0.7 : 0.9);
        const a = angle + half * k;
        out.push(pt(x + Math.cos(a) * r, gy + Math.sin(a) * r));
      }
      break;
    }
    case "line": {
      for (const p of along(x, y, angle, range, Math.min(cap, Math.max(1, Math.ceil(range / 70)))))
        out.push(pt(p.x, p.y, CAST_TRAVEL_MS * p.t, angle));
      break;
    }
    case "fan": {
      const rays = Math.max(1, def.count ?? 3);
      const spread = def.arc ?? Math.PI / 2;
      const n = Math.min(cap, rays);
      for (let i = 0; i < n; i++) {
        // chọn n tia cách đều trong số `rays` tia (n = rays thì lấy hết)
        const idx = n === 1 ? (rays - 1) / 2 : (i * (rays - 1)) / (n - 1);
        const a = angle + (rays === 1 ? 0 : -spread / 2 + (spread * idx) / (rays - 1));
        out.push(pt(x + Math.cos(a) * range * 0.9, gy + Math.sin(a) * range * 0.9, 0, a));
      }
      break;
    }
    case "nova": {
      const n = cap;
      const r = range * 0.7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push(pt(x + Math.cos(a) * r, gy + Math.sin(a) * r));
      }
      break;
    }
    case "self":
      out.push(pt(x, gy));
      break;
    case "ground": {
      const reach = def.reach ?? 0;
      const cx = x + Math.cos(angle) * reach;
      const cy = gy + Math.sin(angle) * reach;
      out.push(pt(cx, cy));
      const ring = Math.min(cap - 1, 6);
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2;
        out.push(pt(cx + Math.cos(a) * def.range * 0.6, cy + Math.sin(a) * def.range * 0.6));
      }
      break;
    }
    case "dash": {
      for (const p of along(x, y, angle, range, cap)) out.push(pt(p.x, p.y, CAST_TRAVEL_MS * p.t));
      break;
    }
  }
  return out;
}
