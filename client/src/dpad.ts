/**
 * Nút hướng cố định (D-pad) cho cảm ứng (M5.1, #327): lựa chọn thay cho joystick nổi, nằm cố định ở góc dưới trái.
 * Hàm thuần (không đụng DOM) để test được: đổi vị trí chạm so với tâm thành hướng đi 8 chiều.
 * Joystick nổi mặc định giữ nguyên; chọn kiểu ở Cài đặt, lưu `tg_touch_scheme`.
 */

export type TouchScheme = "float" | "dpad";
export const TOUCH_SCHEME_STORAGE_KEY = "tg_touch_scheme";
export const DEFAULT_TOUCH_SCHEME: TouchScheme = "float";

/** Vùng chết (px tính từ tâm nút): chạm sát tâm không đi. */
export const DPAD_DEADZONE = 14;

export function parseTouchScheme(v: unknown): TouchScheme {
  return v === "dpad" || v === "float" ? v : DEFAULT_TOUCH_SCHEME;
}

/** 8 hướng, chỉ số theo góc (toạ độ màn hình, y hướng xuống): 0 = phải, 1 = phải-xuống, 2 = xuống... */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [Math.SQRT1_2, Math.SQRT1_2],
  [0, 1],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [0, -1],
  [Math.SQRT1_2, -Math.SQRT1_2],
];

export interface DpadVector {
  /** Hướng đã chuẩn hoá (độ dài 1, hoặc 0 khi trong vùng chết). */
  x: number;
  y: number;
  /** Hướng nào đang sáng (cho giao diện). */
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const NONE: DpadVector = { x: 0, y: 0, up: false, down: false, left: false, right: false };

/**
 * `dx`, `dy`: vị trí chạm trừ tâm nút (px). Trong vùng chết hoặc dữ liệu rác: đứng yên.
 * Ngoài vùng chết: làm tròn góc về bội 45° (8 hướng) để người chơi không phải ngắm góc chính xác.
 */
export function dpadVector(dx: number, dy: number, deadzone: number = DPAD_DEADZONE): DpadVector {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return NONE;
  if (Math.hypot(dx, dy) < deadzone) return NONE;
  const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  const [x, y] = DIRS[sector];
  const eps = 0.01;
  return { x, y, up: y < -eps, down: y > eps, left: x < -eps, right: x > eps };
}
