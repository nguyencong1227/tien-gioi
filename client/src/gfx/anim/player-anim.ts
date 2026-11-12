/**
 * Máy trạng thái hoạt ảnh NGƯỜI CHƠI (M5.2, #328 phần 2, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 8).
 *
 * Phía CLIENT, suy từ dữ liệu đã có (không thêm tin nhắn / trường đồng bộ): `p.dead` (gục), tin `dmg` có `toPlayer` và
 * `target` = sessionId (bị đánh), `slashUntil` (đánh, đã có), vận tốc (đi). Hàm thuần, không đụng Phaser.
 * Ưu tiên: gục > bị đánh > đánh > đi > đứng.
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
  hurtUntil: number;
}

export function newPlayerAnimClock(): PlayerAnimClock {
  return { hurtUntil: 0 };
}

export function markPlayerHurt(c: PlayerAnimClock, now: number): void {
  c.hurtUntil = now + playerAnimMs("hurt");
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
  if (now < c.hurtUntil) return "hurt";
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
