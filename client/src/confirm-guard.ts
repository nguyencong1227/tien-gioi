// Chống "click ma" của HỘP XÁC NHẬN (act-confirm dùng chung và hộp vứt đồ ở túi) bằng GHÉP CẶP với cú chạm mở / đóng hộp, không chỉ bằng cửa sổ thời gian.
// Lớp THUẦN: không biết DOM, đồng hồ do người gọi truyền vào nên test được trong Node.
//
// Lỗi cũ: hộp mở ở `pointerdown` của nút (hiện ngay dưới ngón), `click` do trình duyệt tạo sau khi nhả ngón rơi vào nút xác nhận vừa hiện. Bản cũ bỏ qua mọi lần bấm trong
// 450 ms đầu sau khi mở, nên nhấn GIỮ nút >= ~0,4 s (chạm lâu một chút, hoặc máy chậm) thì `click` tới SAU cửa sổ và XÁC NHẬN luôn (vứt đồ, bán đồ, đột phá) khi người chơi chưa kịp đọc.
// Nhật ký sự kiện thật (cảm ứng, khung chậm): pointerdown (hộp mở) -> pointerup +355 ms -> click trên nút Vứt +114 ms = ~470 ms sau khi mở: đã quá cửa sổ nên vứt thật.
//
// Sửa: hộp mở trong lúc một con trỏ ĐANG NHẤN (tức do chính cú chạm đó) "nợ" đúng MỘT `click`: `click` đầu tiên sau lần nhả đó (dù trễ bao lâu, trong hạn `CONFIRM_GUARD_MAX_WAIT_MS`) bị
// bỏ qua. Lần nhấn MỚI (`pointerdown` sau lần nhả) xoá nợ vì cú chạm mở hộp đã xong, nên bấm xác nhận thật vẫn nhận ngay khi qua cửa sổ. Cửa sổ 450 ms GIỮ làm cận dưới (bảo vệ `click` do
// nguồn khác, bàn phím vẫn qua được khi hộp không mở bằng cú chạm). Cùng cơ chế cho `click` rơi xuống nút BÊN DƯỚI ngay sau khi hộp đóng (hộp đóng ở `pointerdown` của nút Giữ lại / Vứt).

/** Cận dưới (ms): hộp bỏ qua mọi lần bấm trong chừng này ms đầu sau khi mở (và nút bên dưới bỏ qua click chừng này ms sau khi hộp đóng). */
export const CONFIRM_GUARD_MS = 450;
/** Hạn chờ tối đa (ms) từ lần NHẢ tới `click` đi kèm; quá hạn coi là cú chạm đã bị huỷ (kéo ngón ra khỏi nút, không có `click`). */
export const CONFIRM_GUARD_MAX_WAIT_MS = 1500;

// Giới hạn đã biết (đều AN TOÀN: chỉ bỏ nợ sớm hoặc bỏ thêm một lần bấm, không bao giờ xác nhận nhầm):
//  - NHIỀU NGÓN: `active` là MỘT cờ chung; `pointerdown` thứ hai coi ngón trước đã nhả (bỏ nợ sớm), `pointerup` của ngón nào cũng làm `active` = false.
//  - Phím Enter / Cách ngay sau lần NHẢ của chính cú chạm mở hộp (chưa có `pointerdown` xen giữa, trong hạn `CONFIRM_GUARD_MAX_WAIT_MS`) tiêu khoản nợ nên lần Enter ĐẦU bị bỏ; nhấn lần hai là qua.

export interface ConfirmGuard {
  /** `pointerdown` bất kỳ trong trang (pha bắt, TRƯỚC bộ xử lý của nút: hộp mở bởi chính cú nhấn này thấy con trỏ đang nhấn). */
  pointerDown(now: number): void;
  /** `pointerup` / `pointercancel` bất kỳ trong trang. */
  pointerUp(now: number): void;
  /** Hộp vừa mở lúc `now`. */
  open(now: number): void;
  /** Hộp vừa đóng lúc `now`. */
  closed(now: number): void;
  /** Nút TRONG hộp được kích hoạt lúc `now` (chạm / chuột / phím): đó là click ma cần bỏ qua không? Gọi cho mỗi lần kích hoạt; bỏ qua một click ghép cặp thì tiêu khoản nợ. */
  ignoreInside(now: number): boolean;
  /** `click` rơi xuống nút BÊN DƯỚI hộp lúc `now` (chỉ click chuột / chạm): đó là click ma của cú chạm đóng hộp không? */
  ignoreAfterClose(now: number): boolean;
  /** Coi hộp như đã mở từ rất lâu (cho thao tác CHỦ Ý bằng bàn phím cần bỏ cửa sổ, ví dụ phím X giữ lại). */
  expire(): void;
}

/** Còn trong cửa sổ thời gian không: đồng hồ lùi / số hỏng coi như CÒN (an toàn: bỏ qua thêm một lần bấm còn hơn xác nhận nhầm). */
function within(since: number, now: number, windowMs: number): boolean {
  return !(now - since >= windowMs);
}

export function createConfirmGuard(
  windowMs: number = CONFIRM_GUARD_MS,
  maxWaitMs: number = CONFIRM_GUARD_MAX_WAIT_MS,
): ConfirmGuard {
  let active = false;
  let openedAt = -Infinity;
  let openPending = false;
  let openUpAt = -Infinity;
  let closedAt = -Infinity;
  let closePending = false;
  let closeUpAt = -Infinity;
  /** Có `pointerup` của cú chạm đã mở / đóng hộp chưa (đã nhả ngón mà `click` chưa tới). */
  let openUpSeen = false;
  let closeUpSeen = false;

  const releaseOnNewGesture = () => {
    if (openPending && openUpSeen) openPending = false;
    if (closePending && closeUpSeen) closePending = false;
  };

  return {
    pointerDown(now) {
      // `pointerup` bị lỗi mất (nhả ngoài cửa sổ...): coi như đã nhả trước khi có lần nhấn mới
      if (active) this.pointerUp(now);
      active = true;
      releaseOnNewGesture();
    },
    pointerUp(now) {
      active = false;
      if (openPending && !openUpSeen) {
        openUpSeen = true;
        openUpAt = now;
      }
      if (closePending && !closeUpSeen) {
        closeUpSeen = true;
        closeUpAt = now;
      }
    },
    open(now) {
      openedAt = now;
      openPending = active;
      openUpSeen = false;
      openUpAt = -Infinity;
    },
    closed(now) {
      closedAt = now;
      closePending = active;
      closeUpSeen = false;
      closeUpAt = -Infinity;
    },
    ignoreInside(now) {
      let ghost = false;
      if (openPending && openUpSeen) {
        ghost = now - openUpAt < maxWaitMs;
        openPending = false; // tiêu khoản nợ (hoặc quá hạn: cú chạm đã bị huỷ)
      }
      return within(openedAt, now, windowMs) || ghost;
    },
    ignoreAfterClose(now) {
      let ghost = false;
      if (closePending && closeUpSeen) {
        ghost = now - closeUpAt < maxWaitMs;
        closePending = false;
      }
      return within(closedAt, now, windowMs) || ghost;
    },
    expire() {
      openedAt = -Infinity;
      openPending = false;
    },
  };
}
