/**
 * Kéo để đóng tấm trên điện thoại (M5.1, #326, docs/THIET_KE_GIAO_DIEN_DO_HOA.md mục 4.2 điều 5).
 *
 * Tấm `.sheet` (không phải thẻ `.sheet-card`) trên điện thoại: dọc = tấm toàn màn hình trượt từ dưới lên, ngang = ngăn kéo cạnh phải.
 * Vuốt TIÊU ĐỀ của tấm (`.inv-head`) xuống (dọc) hoặc sang phải (ngang) để đóng; thả sớm thì tấm trượt về chỗ cũ.
 * Chỉ bắt ở tiêu đề (không bắt ở thân) để không tranh với cuộn nội dung; tiêu đề có `touch-action: none` (sheet.css) nên trình duyệt
 * không cướp cử chỉ làm cuộn tấm. Đóng bằng cách bấm đúng nút `.modal-close` của tấm (cùng đường với nút Đóng / phím Esc).
 *
 * Phần quyết định (hàm thuần) tách riêng để test ở môi trường node; phần DOM (`initSheetSwipe`) kiểm bằng Chrome thật
 * (`client/scripts/check-sheet-swipe.mjs`).
 */

export type SwipeAxis = "x" | "y";
export type SwipeIntent = "pending" | "drag" | "ignore";

/** Dưới ngưỡng này (px) coi là chạm chứ chưa phải vuốt. */
export const SWIPE_START_PX = 8;
/** Kéo qua tỉ lệ này của kích thước tấm thì đóng khi thả. */
export const SWIPE_CLOSE_FRAC = 0.3;
/** Vuốt nhanh hơn tốc độ này (px / ms) và đã đi >= `SWIPE_FLICK_MIN_PX` thì đóng dù chưa đủ xa. */
export const SWIPE_FLICK_V = 0.6;
export const SWIPE_FLICK_MIN_PX = 40;
/** Cửa sổ đo vận tốc (ms): chỉ tính phần cuối của cử chỉ. */
export const SWIPE_VELOCITY_WINDOW_MS = 120;

/** Trục đóng tấm: dọc (tấm trượt từ dưới lên) vuốt xuống; ngang (ngăn kéo cạnh phải) vuốt sang phải. */
export function swipeAxis(orient: string | undefined): SwipeAxis {
  return orient === "landscape" ? "x" : "y";
}

/** Phần dịch được phép theo chiều đóng (>= 0): kéo ngược chiều thì tấm đứng yên. Số rác coi là 0. */
export function dragOffset(dx: number, dy: number, axis: SwipeAxis): number {
  const v = axis === "y" ? dy : dx;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Ý định của ngón tay sau khi đã dịch (dx, dy) kể từ lúc chạm:
 * chưa đủ ngưỡng = pending; đủ ngưỡng và đi theo chiều đóng, trục đóng chiếm ưu thế = drag; ngược lại ignore (cử chỉ khác).
 */
export function swipeIntent(dx: number, dy: number, axis: SwipeAxis): SwipeIntent {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return "ignore";
  const main = axis === "y" ? dy : dx;
  const cross = axis === "y" ? dx : dy;
  if (Math.hypot(dx, dy) < SWIPE_START_PX) return "pending";
  return main > 0 && Math.abs(main) >= Math.abs(cross) ? "drag" : "ignore";
}

/** Thả tay ở `offset` px (kích thước tấm theo trục đóng là `size`), vận tốc `velocity` px/ms: đóng hay trả về? */
export function shouldCloseSwipe(offset: number, size: number, velocity: number): boolean {
  if (!Number.isFinite(offset) || !Number.isFinite(size) || size <= 0) return false;
  if (offset >= size * SWIPE_CLOSE_FRAC) return true;
  return Number.isFinite(velocity) && velocity >= SWIPE_FLICK_V && offset >= SWIPE_FLICK_MIN_PX;
}

/** Vận tốc (px / ms) theo các mẫu (thời điểm, độ dịch) trong cửa sổ cuối `SWIPE_VELOCITY_WINDOW_MS`; < 2 mẫu = 0. */
export function swipeVelocity(samples: ReadonlyArray<{ t: number; v: number }>): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > SWIPE_VELOCITY_WINDOW_MS) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.v - first.v) / dt : 0;
}

const HEAD_SELECTOR = ".sheet:not(.sheet-card) > .inv-head";
const INTERACTIVE = "button, input, select, textarea, a, [role='button']";
const ANIM_MS = 180;

/** Giảm chuyển động: không trượt, đóng / trả về ngay. */
function reducedMotion(): boolean {
  return (
    document.documentElement.dataset.reduceMotion === "1" ||
    document.body.classList.contains("reduced-motion")
  );
}

/**
 * Bật cử chỉ kéo để đóng cho mọi tấm `.sheet` trên điện thoại. Gọi một lần lúc khởi động (sau `initDisplay()`).
 * Dùng ủy quyền sự kiện trên `document` nên không cần biết danh sách tấm.
 */
export function initSheetSwipe(): void {
  let busy = false; // đang trượt ra / về sau khi thả: bỏ qua cử chỉ mới
  document.addEventListener("pointerdown", (e) => {
    if (busy || e.pointerType === "mouse" || !e.isPrimary) return;
    const root = document.documentElement;
    if (root.dataset.form !== "phone") return;
    const target = e.target as Element | null;
    const head = target?.closest?.(HEAD_SELECTOR) as HTMLElement | null | undefined;
    if (!head || target?.closest(INTERACTIVE)) return;
    const sheet = head.parentElement as HTMLElement;
    const axis = swipeAxis(root.dataset.orient);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const samples: { t: number; v: number }[] = [{ t: e.timeStamp, v: 0 }];
    let dragging = false;
    let offset = 0;
    try {
      head.setPointerCapture(e.pointerId);
    } catch {
      // trình duyệt không hỗ trợ / con trỏ đã nhả: vẫn nghe sự kiện trên head
    }
    const reset = () => {
      sheet.style.transform = "";
      sheet.style.transition = "";
    };
    const finish = () => {
      head.removeEventListener("pointermove", onMove);
      head.removeEventListener("pointerup", onUp);
      head.removeEventListener("pointercancel", onCancel);
      try {
        head.releasePointerCapture(e.pointerId);
      } catch {
        // đã nhả
      }
    };
    const translate = (px: number) =>
      axis === "y" ? `translateY(${px}px)` : `translateX(${px}px)`;
    const onMove = (m: PointerEvent) => {
      if (m.pointerId !== e.pointerId) return;
      const dx = m.clientX - x0;
      const dy = m.clientY - y0;
      if (!dragging) {
        const intent = swipeIntent(dx, dy, axis);
        if (intent === "pending") return;
        if (intent === "ignore") {
          finish();
          return;
        }
        dragging = true;
        // KHÔNG đụng `animation`: bỏ `animation: none` inline sau đó sẽ khởi động lại animation trượt vào (tấm trượt vào lần nữa)
        sheet.style.transition = "none";
      }
      offset = dragOffset(dx, dy, axis);
      samples.push({ t: m.timeStamp, v: offset });
      if (samples.length > 16) samples.shift();
      sheet.style.transform = translate(offset);
    };
    const onCancel = (c: PointerEvent) => {
      if (c.pointerId !== e.pointerId) return;
      finish();
      if (dragging) reset();
    };
    const onUp = (u: PointerEvent) => {
      if (u.pointerId !== e.pointerId) return;
      finish();
      if (!dragging) return;
      const size = axis === "y" ? sheet.offsetHeight : sheet.offsetWidth;
      const closing = shouldCloseSwipe(offset, size, swipeVelocity(samples));
      const instant = reducedMotion();
      const close = () => {
        (sheet.querySelector(".modal-close") as HTMLElement | null)?.click();
        reset();
        busy = false;
      };
      busy = true;
      if (instant) {
        if (closing) close();
        else {
          reset();
          busy = false;
        }
        return;
      }
      sheet.style.transition = `transform ${ANIM_MS}ms ease-out`;
      sheet.style.transform = translate(closing ? size : 0);
      window.setTimeout(() => (closing ? close() : (reset(), (busy = false))), ANIM_MS + 30);
    };
    head.addEventListener("pointermove", onMove);
    head.addEventListener("pointerup", onUp);
    head.addEventListener("pointercancel", onCancel);
  });
}
