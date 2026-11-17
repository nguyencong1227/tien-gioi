/**
 * Hiệu ứng của đợt thêm chiêu thức (mục 51, CT11b, hợp đồng CT1b #1084 + máy chủ CT2 #1098): TIA SÉT LAN (`FxMsg` `chain`, các điểm nối tiếp) và VỤ NỔ DẤU (`DmgMsg.combo`,
 * màu theo hệ của dấu vừa bị gỡ). Hàm THUẦN (không Phaser): `WorldScene` chỉ gọi và phát bằng `playFxPoints`, KHÔNG chạm vào kết quả trận (máy chủ quyết, đây chỉ là hình).
 * Không `Math.random` (kế hoạch tất định, test được); số điểm bị chặn theo ngân sách emitter của bậc chất lượng (Thấp: chỉ một chớp ở mỗi mục tiêu, không rải dọc tia).
 */
import { CHAIN_FX_POINTS_MAX, markElementOf, type SkillDef } from "@tien-gioi/shared";
import { castPointsFor, castTint } from "./cast-fx";
import type { FxPriority } from "./budget";
import type { FxPoint } from "./skill-fx";

/** Công thức (`recipes-ct2.ts`): tia lửa điện rải dọc đoạn, chớp ở mục tiêu, vụ nổ dấu. */
export const CHAIN_SPARK_RECIPE = "chain-spark";
export const CHAIN_NODE_RECIPE = "chain-node";
export const COMBO_BURST_RECIPE = "combo-burst";

/** Khoảng cách giữa hai tia lửa dọc đoạn (px) và số tia tối đa mỗi đoạn. */
export const CHAIN_STEP_PX = 28;
export const CHAIN_MAX_SEG_SPARKS = 6;
/** Thời gian tia đi hết MỘT đoạn (ms): các đoạn nối tiếp nhau (đoạn sau bắt đầu khi đoạn trước tới nơi). */
export const CHAIN_SEG_MS = 70;
/** Tia bay lệch lên một chút so với chân (khớp `cast-fx` `CAST_Y_OFFSET`). */
export const CHAIN_Y_OFFSET = -10;
/** Biên toạ độ chấp nhận (px): ngoài khoảng này coi là tin hỏng. */
const COORD_LIMIT = 100_000;
/** Màu vụ nổ khi không biết hệ của dấu (vàng nhạt, hợp mọi nền). */
export const COMBO_DEFAULT_TINT = 0xffe08a;
/** Số tia tối đa của vụ nổ dấu (vòng quanh mục tiêu) và bán kính vòng (px). */
export const COMBO_MAX_POINTS = 8;
export const COMBO_RING_PX = 18;

export interface ChainPt {
  x: number;
  y: number;
}

/**
 * Các điểm của tin `chain` (`pts` phẳng `[x0, y0, x1, y1, ...]`): cần mảng số HỮU HẠN trong biên, độ dài chẵn, từ 2 tới `CHAIN_FX_POINTS_MAX` điểm; sai dạng thì `null` (bỏ cả tin,
 * không vẽ nửa vời). Không tin tin nhắn: số lạ / thiếu / dư đều bị từ chối.
 */
export function parseChainPts(raw: unknown): ChainPt[] | null {
  if (!Array.isArray(raw) || raw.length % 2 !== 0) return null;
  const n = raw.length / 2;
  if (n < 2 || n > CHAIN_FX_POINTS_MAX) return null;
  const out: ChainPt[] = [];
  for (let i = 0; i < n; i++) {
    const x = raw[2 * i];
    const y = raw[2 * i + 1];
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) return null;
    out.push({ x, y });
  }
  return out;
}

export interface ChainFxInput {
  skill: Pick<SkillDef, "element">;
  pts: readonly ChainPt[];
  /** Của chính mình (ưu tiên 2, không bị bỏ khi đông) hay của người khác (ưu tiên 1) */
  mine: boolean;
  emitterBudget: number;
}

/**
 * Các điểm phát của MỘT tia sét lan: mỗi đoạn (điểm i -> i + 1) có các tia lửa điện rải dọc, lệch ngang một chút kiểu răng cưa (tất định), trễ theo vị trí để tia đi nối tiếp
 * từng đoạn; cuối mỗi đoạn có một CHỚP ở mục tiêu vừa trúng. Bậc Thấp (`castPointsFor` = 1): chỉ chớp ở mục tiêu. `[]` khi dữ liệu hỏng. Điểm đầu (người dùng) không có chớp.
 */
export function planChainFx(input: ChainFxInput): FxPoint[] {
  const { pts, mine } = input;
  if (pts.length < 2) return [];
  const tint = castTint(input.skill.element);
  const priority: FxPriority = mine ? 2 : 1;
  const cap = castPointsFor(input.emitterBudget);
  const out: FxPoint[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const base = i * CHAIN_SEG_MS;
    if (cap > 1 && dist > 0) {
      const n = Math.min(CHAIN_MAX_SEG_SPARKS, Math.max(1, Math.ceil(dist / CHAIN_STEP_PX)), cap);
      const nx = -dy / dist; // pháp tuyến để lệch răng cưa
      const ny = dx / dist;
      for (let j = 1; j <= n; j++) {
        const t = j / (n + 1);
        const jitter = (((i * 5 + j * 3) % 5) - 2) * 3; // -6..6 px, tất định
        out.push({
          recipe: CHAIN_SPARK_RECIPE,
          x: a.x + dx * t + nx * jitter,
          y: a.y + dy * t + ny * jitter + CHAIN_Y_OFFSET,
          angle: Math.atan2(dy, dx),
          tint,
          priority,
          delayMs: Math.round(base + CHAIN_SEG_MS * t),
        });
      }
    }
    out.push({
      recipe: CHAIN_NODE_RECIPE,
      x: b.x,
      y: b.y + CHAIN_Y_OFFSET,
      tint,
      priority,
      delayMs: base + CHAIN_SEG_MS,
    });
  }
  return out;
}

/** Màu vụ nổ dấu: hệ của dấu (`Monster.mark` 1-9 -> `markElementOf`); không biết (0 / lạ) thì `COMBO_DEFAULT_TINT`. */
export function comboTint(markIndex: unknown): number {
  const el = markElementOf(markIndex);
  return el === undefined ? COMBO_DEFAULT_TINT : castTint(el);
}

export interface ComboFxInput {
  x: number;
  y: number;
  /** Chỉ số dấu vừa bị gỡ nếu client còn nhớ (`Monster.mark`), không thì `0` / `undefined` */
  markIndex?: unknown;
  mine: boolean;
  emitterBudget: number;
}

/**
 * Vụ nổ dấu khi đòn ĂN COMBO (`DmgMsg.combo`): một chớp ngay chỗ trúng + (tuỳ ngân sách) vòng tia quanh mục tiêu. `[]` khi toạ độ không hữu hạn. Màu theo hệ của dấu.
 */
export function planComboBurst(input: ComboFxInput): FxPoint[] {
  const { x, y, mine } = input;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
  const tint = comboTint(input.markIndex);
  const priority: FxPriority = mine ? 2 : 1;
  const cap = castPointsFor(input.emitterBudget);
  const gy = y + CHAIN_Y_OFFSET;
  const out: FxPoint[] = [{ recipe: COMBO_BURST_RECIPE, x, y: gy, tint, priority, delayMs: 0 }];
  const ring = Math.min(COMBO_MAX_POINTS, cap) - 1;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    out.push({
      recipe: CHAIN_NODE_RECIPE,
      x: x + Math.cos(a) * COMBO_RING_PX,
      y: gy + Math.sin(a) * COMBO_RING_PX,
      tint,
      priority,
      delayMs: 40,
    });
  }
  return out;
}
