/**
 * Máy trạng thái hoạt ảnh NGƯỜI CHƠI (M5.2, #328 phần 2, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 8).
 *
 * Phía CLIENT, suy từ dữ liệu đã có (không thêm tin nhắn / trường đồng bộ): `p.dead` (gục), tin `dmg` có `toPlayer` và
 * `target` = sessionId (bị đánh), `slashUntil` (đánh, đã có), vận tốc (đi). Hàm thuần, không đụng Phaser.
 * Ưu tiên: gục > bị đánh > đánh > đi > đứng; bị đánh GIỮA đòn đánh thì chờ đòn đánh xong rồi mới giật lùi (không cắt khung Chém).
 */
import { getQuality, hasQuality } from "../quality";

export type PlayerAnimState = "idle" | "walk" | "slash" | "hurt" | "die";
export type PlayerDir = "down" | "up" | "left" | "right";

/** Hoạt ảnh một lần: tên khung trong atlas là `<bộ>-hurt-<hướng>` và `<bộ>-die-0..3` (`gen-assets.mjs`). */
export const PLAYER_HURT_FPS = 6;
export const PLAYER_DIE_FPS = 10;
export const PLAYER_DIE_FRAMES = 4;

/** Thời lượng (ms) của hoạt ảnh một lần = số khung / tốc độ. */
export function playerAnimMs(state: "hurt" | "die"): number {
  return state === "hurt"
    ? Math.round(1000 / PLAYER_HURT_FPS)
    : Math.round((PLAYER_DIE_FRAMES * 1000) / PLAYER_DIE_FPS);
}

/** Cờ thời gian (ms theo đồng hồ cảnh `scene.time.now`); 0 = chưa từng. */
export interface PlayerAnimClock {
  /** Hoạt ảnh bị đánh bắt đầu từ mốc này (sau đòn đánh đang diễn ra, nếu có). */
  hurtFrom: number;
  hurtUntil: number;
}

export function newPlayerAnimClock(): PlayerAnimClock {
  return { hurtFrom: 0, hurtUntil: 0 };
}

/** Đòn đánh còn lại tối đa chừng này thì hoạt ảnh bị đánh mới chịu chờ (số lạ / hỏng thì không chờ quá lâu). */
export const HURT_MAX_DEFER_MS = 400;

/**
 * Đánh dấu bị đánh. `slashUntil` = mốc hết đòn đánh đang diễn ra (0 = không đánh): bị đánh giữa đòn thì giật lùi bắt đầu SAU khi
 * đòn xong (nit của A ở #346: trước đây hoạt ảnh bị đánh cắt ngang khung Chém 167 ms). Phản hồi bị đánh vẫn tức thì ở chữ bay,
 * hạt, rung; chỉ tư thế chờ.
 */
export function markPlayerHurt(c: PlayerAnimClock, now: number, slashUntil = 0): void {
  const defer = Number.isFinite(slashUntil) ? Math.min(slashUntil, now + HURT_MAX_DEFER_MS) : 0;
  c.hurtFrom = Math.max(now, defer);
  c.hurtUntil = c.hurtFrom + playerAnimMs("hurt");
}

export interface PlayerAnimInput {
  dead: boolean;
  /** Mốc hết đòn đánh (ms) do `slash` / `sword` đặt. */
  slashUntil: number;
  moving: boolean;
}

export function playerAnimState(
  c: PlayerAnimClock,
  now: number,
  i: PlayerAnimInput,
): PlayerAnimState {
  if (i.dead) return "die";
  if (now >= c.hurtFrom && now < c.hurtUntil) return "hurt";
  if (now < i.slashUntil) return "slash";
  return i.moving ? "walk" : "idle";
}

/** Khoá hoạt ảnh đã đăng ký trong `textures.ts`: gục không có hướng (`<bộ>-die`), còn lại `<bộ>-<trạng thái>-<hướng>`. */
export function playerAnimKey(prefix: string, state: PlayerAnimState, dir: PlayerDir): string {
  return state === "die" ? `${prefix}-die` : `${prefix}-${state}-${dir}`;
}

/** Giảm chuyển động (OS + cài đặt, một nguồn của `quality.ts`); chưa khởi tạo chất lượng thì coi là tắt. */
export function animReducedMotion(): boolean {
  return hasQuality() ? getQuality().reducedMotion : false;
}
