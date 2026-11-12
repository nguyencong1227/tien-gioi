/**
 * Máy trạng thái hoạt ảnh yêu thú (M5.2, #328, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 8).
 *
 * Hoàn toàn PHÍA CLIENT, suy từ dữ liệu đã có (không thêm tin nhắn / trường đồng bộ):
 *   - đánh:   tin `fx` loại `mslash` (`by` = id quái)
 *   - bị đánh: tin `dmg` có `target` = id quái
 *   - gục:    quái biến mất khỏi state (server xoá ngay khi chết)
 * Hàm thuần, không đụng Phaser, test được bằng số.
 */

export type MonAnimState = "move" | "attack" | "hurt" | "die";

/**
 * Khung hình và tốc độ của các hoạt ảnh một lần (tên khung trong atlas là `mon-<kind>-<tên>`, do `gen-assets.mjs` sinh).
 * Một nguồn duy nhất cho `textures.ts` (đăng ký) lẫn thời lượng ở đây, nên không lệch nhau.
 */
export const MON_ONE_SHOT = {
  attack: { frames: ["atk-0", "atk-1"], fps: 8 },
  hurt: { frames: ["hurt"], fps: 6 },
  die: { frames: ["die-0", "die-1", "die-2", "die-3"], fps: 10 },
} as const;

/** Thời lượng (ms) của hoạt ảnh một lần = số khung / tốc độ. */
export function monAnimMs(state: keyof typeof MON_ONE_SHOT): number {
  const a = MON_ONE_SHOT[state];
  return Math.round((a.frames.length * 1000) / a.fps);
}

/** Cờ thời gian của một quái (ms theo đồng hồ cảnh `scene.time.now`); 0 = chưa từng. */
export interface MonAnimClock {
  attackUntil: number;
  hurtUntil: number;
  /** Đang gục (đã biến khỏi state, chờ hết hoạt ảnh rồi dọn). */
  dying: boolean;
}

export function newMonAnimClock(): MonAnimClock {
  return { attackUntil: 0, hurtUntil: 0, dying: false };
}

/** Ưu tiên: gục > bị đánh > đánh > đi. Bị đánh cắt ngang đòn đánh (giật lùi thấy ngay). */
export function monAnimState(c: MonAnimClock, now: number): MonAnimState {
  if (c.dying) return "die";
  if (now < c.hurtUntil) return "hurt";
  if (now < c.attackUntil) return "attack";
  return "move";
}

/** Khoá hoạt ảnh đã đăng ký trong `textures.ts` (`mon-<kind>-move|attack|hurt|die`). */
export function monAnimKey(kind: string, state: MonAnimState): string {
  return `mon-${kind}-${state}`;
}

export function markMonAttack(c: MonAnimClock, now: number): void {
  c.attackUntil = now + monAnimMs("attack");
}

export function markMonHurt(c: MonAnimClock, now: number): void {
  c.hurtUntil = now + monAnimMs("hurt");
}

/**
 * Tần suất cập nhật hoạt ảnh của thực thể ở xa (`farAnimHz` của hồ sơ chất lượng, #323): có đến lượt cập nhật chưa?
 * `hz <= 0` hoặc không hữu hạn = luôn cập nhật. Thuần; người gọi tự lưu `lastMs`.
 */
export function animTickDue(nowMs: number, lastMs: number, hz: number): boolean {
  if (!Number.isFinite(hz) || hz <= 0) return true;
  return nowMs - lastMs >= 1000 / hz;
}
