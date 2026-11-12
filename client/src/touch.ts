/**
 * Chặn cử chỉ mặc định của trình duyệt trên màn hình cảm ứng (M5.1, #327, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 4.2 (6)).
 *
 * `touch-action: none` (CSS) và `user-scalable=no` (meta viewport) đã chặn phóng to hai ngón / chạm đúp trên trình duyệt hiện đại;
 * mô-đun này bù những chỗ còn hở: Safari iOS cũ bỏ qua `touch-action` cho cử chỉ phóng to (`gesture*`), chạm đúp có thể vẫn
 * phóng to, và nhấn giữ nút điều khiển bật trình đơn ngữ cảnh làm cắt ngang vuốt joystick.
 * KHÔNG chặn ô nhập chữ (chat, đạo hiệu): vẫn chọn / dán / mở trình đơn được.
 *
 * Tách hàm thuần (`isDoubleTap`, `isGuardedTarget`, `isEditableTarget`) để test được không cần DOM (client không có jsdom).
 */

/** Hai lần chạm cách nhau ít hơn mức này (ms) là chạm đúp. */
export const DOUBLE_TAP_MS = 350;

/** Vùng điều khiển trò chơi: nhấn giữ ở đây không được mở trình đơn ngữ cảnh. */
export const GUARDED_SELECTOR =
  "#game, #joyzone, #dpad, #skills, #quickbar, #btn-talk, #btn-pickup, #btn-portal, #btn-target";

export function isDoubleTap(prevMs: number, nowMs: number): boolean {
  return prevMs > 0 && nowMs - prevMs >= 0 && nowMs - prevMs < DOUBLE_TAP_MS;
}

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/** Ô nhập chữ (input / textarea / select / contenteditable): luôn để trình duyệt xử lý. */
export function isEditableTarget(t: unknown): boolean {
  const el = t as TargetLike | null;
  if (!el || typeof el !== "object") return false;
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/** Phần tử thuộc vùng điều khiển trò chơi (và không phải ô nhập chữ)? */
export function isGuardedTarget(t: unknown): boolean {
  if (isEditableTarget(t)) return false;
  const el = t as TargetLike | null;
  return Boolean(el && typeof el.closest === "function" && el.closest(GUARDED_SELECTOR));
}

/** Phần tối thiểu của `Document` cần dùng (tiêm vào để test). */
export interface TouchGuardDoc {
  addEventListener(
    type: string,
    cb: (e: any) => void,
    opts?: { passive?: boolean; capture?: boolean },
  ): void;
  removeEventListener(type: string, cb: (e: any) => void, opts?: { capture?: boolean }): void;
}

/**
 * Cài các chốt chặn; trả về hàm gỡ. Gọi một lần lúc khởi động (`main.ts`).
 * - `gesturestart|change|end` (Safari iOS): chặn phóng to hai ngón.
 * - `touchend` hai lần trong DOUBLE_TAP_MS TRÊN vùng điều khiển trò chơi: chặn phóng to chạm đúp (không đụng tới nút / ô túi đồ bình thường).
 * - `contextmenu` trên vùng điều khiển: chặn trình đơn nhấn giữ.
 */
export function installTouchGuards(
  doc: TouchGuardDoc = document,
  now: () => number = () => performance.now(),
): () => void {
  const prevent = (e: { preventDefault(): void }) => e.preventDefault();
  let lastTap = 0;
  const onTouchEnd = (e: { target: unknown; preventDefault(): void }) => {
    const t = now();
    // CHỈ trên vùng điều khiển trò chơi (canvas, joystick, nút kỹ năng...): `preventDefault` ở `touchend` huỷ luôn `click`
    // mô phỏng của lần chạm thứ hai, nên làm ở mọi nơi sẽ nuốt lần bấm nhanh thứ hai vào nút / ô túi đồ dùng `click`
    // (17 chỗ trong ui.ts). Phóng to chạm đúp ở chỗ khác đã bị `html, body { touch-action: none }` chặn.
    if (isGuardedTarget(e.target) && isDoubleTap(lastTap, t)) e.preventDefault();
    lastTap = t;
  };
  const onContextMenu = (e: { target: unknown; preventDefault(): void }) => {
    if (isGuardedTarget(e.target)) e.preventDefault();
  };
  const opts = { passive: false };
  const gestures = ["gesturestart", "gesturechange", "gestureend"];
  for (const g of gestures) doc.addEventListener(g, prevent, opts);
  doc.addEventListener("touchend", onTouchEnd, opts);
  doc.addEventListener("contextmenu", onContextMenu, opts);
  return () => {
    for (const g of gestures) doc.removeEventListener(g, prevent);
    doc.removeEventListener("touchend", onTouchEnd);
    doc.removeEventListener("contextmenu", onContextMenu);
  };
}
