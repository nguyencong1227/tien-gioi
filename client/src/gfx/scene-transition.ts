/**
 * Chuyển cảnh khi qua cổng / vào-ra bí cảnh (M5.2, #329, mục 7.2): mống mắt khép lại 400 ms, giảm chuyển động thì chỉ mờ dần
 * 300 ms. Phần hình ảnh là CSS (`.transition-overlay`); đây là phần logic thuần để test:
 *  - thời lượng theo chế độ (`transitionMs`), CSS và `ui.hideTransition` dùng cùng số;
 *  - `waitOrSkip`: chờ `ms` rồi xong, hoặc xong SỚM khi người chơi bấm / gõ phím ("bỏ qua được").
 */

/** Mống mắt khép (ms). */
export const IRIS_MS = 400;
/** Chỉ mờ dần (giảm chuyển động / hồ sơ `fadeOnly`) (ms). */
export const FADE_MS = 300;

export function transitionMs(fadeOnly: boolean): number {
  return fadeOnly ? FADE_MS : IRIS_MS;
}

export interface WaitDeps {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
}

const REAL: WaitDeps = {
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Chờ `ms` rồi trả về `false` ("hết giờ"), hoặc trả về `true` NGAY khi `subscribeSkip` gọi lại hàm báo bỏ qua.
 * `subscribeSkip(onSkip)` trả hàm huỷ đăng ký; luôn được gọi khi xong (kể cả lỗi) để không rò bộ lắng nghe.
 * `ms <= 0` hoặc không hữu hạn thì xong ngay (`false`).
 */
export function waitOrSkip(
  ms: number,
  subscribeSkip: (onSkip: () => void) => () => void,
  deps: WaitDeps = REAL,
): Promise<boolean> {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let done = false;
    let timer: unknown = null;
    let unsub: (() => void) | null = null;
    const finish = (skipped: boolean) => {
      if (done) return;
      done = true;
      if (timer !== null) deps.clearTimer(timer);
      unsub?.();
      resolve(skipped);
    };
    timer = deps.setTimer(() => finish(false), ms);
    unsub = subscribeSkip(() => finish(true));
    if (done) unsub(); // bỏ qua gọi đồng bộ trong subscribeSkip
  });
}
