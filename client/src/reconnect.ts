// Vòng nối lại tự động (M4.2b, sửa lỗi treo ở #694): một lần thử `client.reconnect(token)` có thể TREO MÃI mà không báo lỗi.
// Nguyên nhân thật đo được trên runner CI (sổ proxy: `POST /matchmake/reconnect` đi vào một socket keep-alive đã chết và bị nuốt):
// `colyseus.js` 0.16 `reconnect()` là POST HTTP rồi mới mở WebSocket; Chrome dùng lại kết nối keep-alive RẢNH trong pool, mà sau khi
// đổi mạng (wifi -> 4G) hoặc socket nửa mở thì kết nối đó chết mà Chrome không biết, yêu cầu không có phản hồi và không có hạn nào.
// Vòng cũ `await` thẳng nên treo cả vòng: banner mãi "(còn 20 giây)", hết 20 giây vẫn chưa thử lại lần nào.
//
// Cách xử lý: mỗi lần thử treo quá `stallMs` thì MỞ THÊM một lần thử song song (yêu cầu cũ vẫn chiếm socket chết nên lần mới phải
// dùng socket khác, cuối cùng là kết nối MỚI) mà KHÔNG huỷ lần cũ. Không huỷ vì lần thử chậm (mạng yếu, không chết) có thể vẫn
// thành công muộn: bỏ nó mà thử lại thì token đã bị dùng, mất luôn phiên. Phòng nào về sau khi đã có người thắng thì giao cho
// `onLate` (client gọi `leave`) để không để lại kết nối thừa.

/** Tham số của vòng nối lại; mọi thời gian tính bằng mili-giây. */
export interface ReconnectOptions<R> {
  /** Một lần thử nối lại (thường `() => client.reconnect(token)`). Trả `null` / `undefined` = chưa được, thử lại. */
  attempt: () => Promise<R | null | undefined>;
  /** Tổng thời gian cho cả vòng (khớp `RECONNECT_GRACE_S` giữ chỗ ở server). */
  deadlineMs: number;
  /** Một lần thử chưa có kết quả sau chừng này thì mở thêm một lần thử song song. */
  stallMs: number;
  /** Nghỉ chừng này sau khi một lần thử THẤT BẠI (có lỗi / không trả phòng) rồi mới thử lại. */
  retryMs: number;
  /** Lỗi dứt khoát (phòng không còn, token hết hạn): dừng cả vòng, không thử nữa. */
  isFatal: (err: unknown) => boolean;
  /** Gọi mỗi lần bắt đầu một lần thử, kèm số giây còn lại (để cập nhật banner). */
  onAttempt?: (remainingSec: number) => void;
  /** Phòng về MUỘN sau khi vòng đã kết thúc (có người thắng hoặc hết hạn): phải đóng nó. */
  onLate?: (room: R) => void;
  /** Số lần thử ĐỒNG THỜI tối đa (mặc định 6: chính là giới hạn socket mỗi máy chủ của Chrome); tới mức này thì chờ một lần xong. */
  maxInflight?: number;
  /** Đồng hồ, để test thay thế. */
  now?: () => number;
}

/** Chạy vòng nối lại; trả phòng của lần thử thành công đầu tiên, hoặc `null` nếu hết hạn / gặp lỗi dứt khoát. */
export function runReconnect<R>(opts: ReconnectOptions<R>): Promise<R | null> {
  const now = opts.now ?? Date.now;
  const deadline = now() + opts.deadlineMs;
  const maxInflight = opts.maxInflight ?? 6;
  let inflight = 0;

  return new Promise<R | null>((resolve) => {
    let finished = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };
    const finish = (room: R | null) => {
      if (finished) return;
      finished = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      resolve(room);
    };

    const start = () => {
      if (finished) return;
      const remainingMs = deadline - now();
      if (remainingMs <= 0) return;
      if (inflight >= maxInflight) {
        later(start, opts.retryMs);
        return;
      }
      opts.onAttempt?.(Math.max(1, Math.ceil(remainingMs / 1000)));

      let settled = false;
      inflight++;
      // Lần thử này treo: mở thêm một lần song song (giữ lần này, nó có thể về muộn)
      later(() => {
        if (!settled) start();
      }, opts.stallMs);

      const retry = () => later(start, opts.retryMs);
      let p: Promise<R | null | undefined>;
      try {
        p = opts.attempt();
      } catch (err) {
        settled = true;
        inflight--;
        if (opts.isFatal(err)) finish(null);
        else retry();
        return;
      }
      p.then(
        (room) => {
          settled = true;
          inflight--;
          if (room) {
            if (finished) opts.onLate?.(room);
            else finish(room);
          } else retry();
        },
        (err) => {
          settled = true;
          inflight--;
          if (finished) return;
          if (opts.isFatal(err)) finish(null);
          else retry();
        },
      );
    };

    // Hết hạn tổng: kết thúc dù còn lần thử treo (lần về muộn sẽ qua `onLate`)
    later(() => finish(null), Math.max(0, deadline - now()));
    start();
  });
}
