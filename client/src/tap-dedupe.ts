// Chống chạy `fn` HAI lần cho MỘT lần bấm ở nút nối `bindTap` (ui.ts): `fn` chạy ở `pointerdown` (nhạy với chạm), còn `click` của CHÍNH lần bấm đó phải bị bỏ qua.
// Lớp THUẦN: không biết DOM, đồng hồ do người gọi truyền vào nên test được trong Node.
//
// GHÉP CẶP, không dùng cửa sổ thời gian cố định: mỗi `pointerdown` đã chạy `fn` "nợ" đúng MỘT `click`, và `click` kế tiếp trả nợ đó (bị bỏ qua) dù tới trễ bao lâu
// (trong hạn `TAP_CLICK_MAX_WAIT_MS`). Hai bản trước đều tính cửa sổ 300 ms: bản đầu từ `pointerdown` (nhấn giữ >= ~400 ms làm `click` tới sau cửa sổ, #1515), bản hai từ
// `pointerup` (vẫn hở khi luồng chính bận: đo `click` tới 226 ms sau `pointerup` ở khung chậm, mà `click` cảm ứng là cử chỉ do trình duyệt phát nên có thể trễ hơn nữa,
// khi đó `fn` chạy lần hai và nút bật / tắt mở rồi đóng ngay). Hạn chờ chỉ để lần bấm BỊ HUỶ (kéo ngón ra khỏi nút, không có `click`) không nuốt nhầm một `click` độc lập về sau.
// Mốc của mỗi khoản nợ được làm mới ở `pointerup` để hạn tính từ lúc NHẢ, không từ lúc nhấn: nhấn giữ lâu vẫn được trả nợ.

/** Hạn chờ tối đa (ms) từ lần chạm cuối (`pointerdown` / `pointerup`) tới `click` đi kèm. Quá hạn coi là lần bấm bị huỷ, `click` sau đó là click độc lập (chạy `fn`). */
export const TAP_CLICK_MAX_WAIT_MS = 1500;

/** Số khoản nợ tối đa giữ lại (bấm liên tục mà không có `click` nào, ví dụ chuột phải): bỏ khoản cũ nhất. */
const MAX_PENDING = 8;

export interface TapDedupe {
  /** `pointerdown` tới nút (`fn` vừa chạy ở đây): ghi một khoản nợ `click`. */
  down(now: number): void;
  /** `pointerup` tới nút: làm mới mốc của khoản nợ gần nhất (hạn tính từ lúc nhả). */
  up(now: number): void;
  /** `click` tại `now`: là cái trả nợ cho một lần bấm đã chạy `fn` (bỏ qua, trả `true`) hay click độc lập (chạy `fn`, trả `false`)? */
  ignoreClick(now: number): boolean;
}

export function createTapDedupe(maxWaitMs: number = TAP_CLICK_MAX_WAIT_MS): TapDedupe {
  /** mốc (lần chạm cuối) của từng lần bấm đã chạy `fn` mà chưa thấy `click`, cũ nhất ở đầu */
  const pending: number[] = [];
  return {
    down(now) {
      pending.push(now);
      if (pending.length > MAX_PENDING) pending.shift();
    },
    up(now) {
      if (pending.length > 0) pending[pending.length - 1] = now;
    },
    ignoreClick(now) {
      // bỏ các khoản quá hạn (lần bấm bị huỷ), rồi trả khoản cũ nhất còn lại
      while (pending.length > 0 && now - pending[0]! >= maxWaitMs) pending.shift();
      return pending.shift() !== undefined;
    },
  };
}
