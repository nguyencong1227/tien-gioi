// Chống chạy `fn` HAI lần cho MỘT lần bấm ở nút nối `bindTap` (ui.ts): `fn` chạy ở `pointerdown` (nhạy với chạm), còn `click` đến sau lần nhả đó phải bị bỏ qua.
// Lớp THUẦN: không biết DOM, đồng hồ do người gọi truyền vào nên test được trong Node.
//
// Mốc chống trùng là lần chạm GẦN NHẤT của con trỏ lên nút, tức `pointerdown` (`down`) HOẶC `pointerup` (`up`), cái nào muộn hơn: `click` luôn tới ngay sau lần NHẢ, dù người chơi nhấn giữ bao lâu.
// Bản cũ chỉ ghi mốc ở `pointerdown` nên nhấn giữ >= ~400 ms (chạm lâu một chút, hoặc máy chậm: Chrome chờ ~200 ms ack cảm ứng) làm `click` tới sau cửa sổ 300 ms, `fn` chạy LẦN HAI
// và nút bật / tắt mở rồi đóng ngay (đo bằng chuột thật trên nút Nhiệm vụ: giữ 100 / 250 ms đổi một lần, 400 / 700 / 1200 ms đổi hai lần). Vẫn giữ mốc `pointerdown`: `click` tổng hợp
// ngay sau `pointerdown` mà KHÔNG có `pointerup` (kịch bản kiểm, một số công cụ trợ năng, `pointerup` rơi ra ngoài nút vì `fn` vừa ẩn nút) vẫn bị coi là cùng một lần bấm như trước.

/** Khoảng (ms) sau lần chạm cuối mà `click` còn bị coi là cùng một lần bấm. Đủ rộng cho khung chậm (đo được ~160 ms giữa `pointerup` và `click`). */
export const TAP_CLICK_DEDUPE_MS = 300;

export interface TapDedupe {
  /** `pointerdown` tới nút (`fn` vừa chạy ở đây). */
  down(now: number): void;
  /** `pointerup` tới nút: `click` đi kèm lần nhả này tới ngay sau đó, dù đã nhấn giữ bao lâu. */
  up(now: number): void;
  /** `click` tại `now` đi kèm lần chạm vừa rồi (bỏ qua) hay là click độc lập (chạy `fn`)? */
  ignoreClick(now: number): boolean;
}

export function createTapDedupe(windowMs: number = TAP_CLICK_DEDUPE_MS): TapDedupe {
  // -Infinity (không phải 0): với 0, mọi `click` trong `windowMs` đầu sau khi tải trang bị coi là trùng với một lần chạm và bỏ qua (hồi quy cũ, #409)
  let lastTouch = -Infinity;
  return {
    down(now) {
      lastTouch = now;
    },
    up(now) {
      lastTouch = now;
    },
    ignoreClick(now) {
      return now - lastTouch < windowMs;
    },
  };
}
