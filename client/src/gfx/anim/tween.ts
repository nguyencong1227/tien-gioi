/**
 * Tween nhẹ cho người chơi / yêu thú (M5.2, #328 phần 2b đợt 3, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 8):
 *  - nhấp nhô khi đi (sprite nảy lên xuống vài điểm ảnh theo nhịp bước);
 *  - co giãn khi đánh (lao ngang một chút) và khi bị đánh (nén dọc một chút).
 * Không dùng `scene.tweens` (mỗi thực thể một tween là rác + khó tắt): mỗi khung TÍNH từ đồng hồ cảnh rồi đặt `y` / `scale` của sprite.
 * Hàm thuần, không đụng Phaser, test được bằng số. Tắt khi giảm chuyển động, ở bậc Thấp, và với thực thể ở xa (xem `tweenEnabled`).
 */

/** Chu kỳ một nhịp nảy (ms) và biên độ (px): khoảng hai bước chân mỗi chu kỳ ở 4 khung đi. */
export const WALK_BOB_PERIOD_MS = 360;
export const WALK_BOB_PX = 1.5;
/** Thời lượng (ms) và biên độ co giãn khi đánh / bị đánh (đỉnh ở giữa thời lượng). */
export const STRIKE_PULSE_MS = 180;
export const STRIKE_STRETCH_X = 0.12;
export const STRIKE_STRETCH_Y = -0.08;
export const HURT_PULSE_MS = 140;
export const HURT_STRETCH_X = 0.1;
export const HURT_STRETCH_Y = -0.12;

export interface SpriteTween {
  /** Dịch dọc (px, âm = lên trên). */
  dy: number;
  sx: number;
  sy: number;
}

export const NEUTRAL_TWEEN: Readonly<SpriteTween> = Object.freeze({ dy: 0, sx: 1, sy: 1 });

/** Có áp tween không: không giảm chuyển động, không bậc Thấp (hồ sơ chất lượng) và ở GẦN nhân vật của mình. */
export function tweenEnabled(
  prof: { reducedMotion: boolean; tier: string },
  near: boolean,
): boolean {
  return !prof.reducedMotion && prof.tier !== "low" && near;
}

/** Nhấp nhô khi đi: 0 (chạm đất) đến -WALK_BOB_PX (đỉnh), nảy hai lần mỗi chu kỳ. Số hỏng -> 0. */
export function walkBob(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 0;
  return -Math.abs(Math.sin((2 * Math.PI * nowMs) / WALK_BOB_PERIOD_MS)) * WALK_BOB_PX;
}

/**
 * Đã bao lâu (ms) kể từ lúc một hoạt ảnh một lần BẮT ĐẦU, biết mốc HẾT (`until`) và thời lượng; -1 nếu không đang diễn ra
 * (chưa từng, đã hết, số hỏng). Dùng chung cho `slashUntil`, `attackUntil`, `hurtUntil`.
 */
export function sinceStart(nowMs: number, untilMs: number, durMs: number): number {
  if (![nowMs, untilMs, durMs].every(Number.isFinite) || durMs <= 0) return -1;
  const s = nowMs - (untilMs - durMs);
  return s >= 0 && s < durMs ? s : -1;
}

/** Xung co giãn dạng chuông sin: 0 ở hai đầu, 1 ở giữa; ngoài thời lượng (`since < 0` hoặc `>= dur`) -> 0. */
function bell(since: number, dur: number): number {
  if (!Number.isFinite(since) || since < 0 || since >= dur) return 0;
  return Math.sin((Math.PI * since) / dur);
}

export interface TweenInput {
  enabled: boolean;
  nowMs: number;
  moving: boolean;
  dead: boolean;
  /** Đã bao lâu kể từ lúc đánh / bị đánh bắt đầu (`sinceStart`), -1 = không. */
  strikeSince: number;
  hurtSince: number;
  /** Lệch pha riêng của thực thể (ms) để một đám không nảy đồng bộ như một khối. */
  phaseMs: number;
}

/**
 * Tween của MỘT khung. Ưu tiên giống máy trạng thái hoạt ảnh: gục (không tween) > bị đánh > đánh > đi. Đứng yên: không tween.
 * `dy` KHÔNG bù chân (để `footPlant` làm, vì cần chiều cao khung).
 */
export function spriteTween(i: TweenInput): SpriteTween {
  if (!i.enabled || i.dead) return NEUTRAL_TWEEN;
  const hurt = bell(i.hurtSince, HURT_PULSE_MS);
  if (hurt > 0) return { dy: 0, sx: 1 + HURT_STRETCH_X * hurt, sy: 1 + HURT_STRETCH_Y * hurt };
  const strike = bell(i.strikeSince, STRIKE_PULSE_MS);
  if (strike > 0)
    return { dy: 0, sx: 1 + STRIKE_STRETCH_X * strike, sy: 1 + STRIKE_STRETCH_Y * strike };
  if (i.moving)
    return { dy: walkBob(i.nowMs + (Number.isFinite(i.phaseMs) ? i.phaseMs : 0)), sx: 1, sy: 1 };
  return NEUTRAL_TWEEN;
}

/**
 * Sprite có gốc ở GIỮA khung: co dọc `sy` làm chân nhấc lên `h/2 * (1 - sy)`. Bù lại để chân đứng yên một chỗ khi co giãn
 * (`h` = chiều cao khung gốc, chưa nhân tỉ lệ). Số hỏng -> 0.
 */
export function footPlant(h: number, sy: number): number {
  if (!Number.isFinite(h) || !Number.isFinite(sy)) return 0;
  return (h / 2) * (1 - sy);
}
