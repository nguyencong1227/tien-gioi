/**
 * Hàng đợi theo khoá: các thao tác cùng khoá chạy lần lượt đúng thứ tự gọi (lần gọi sau luôn là bản cuối cùng), thao tác
 * lỗi không chặn lần sau (lỗi trả về cho chính lần đó). Cùng hợp đồng với hàng đợi theo tệp của `store.ts` / `soul.ts`;
 * với Postgres nó giữ thứ tự ghi dù nhiều kết nối trong pool chạy song song.
 */
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.tails.set(key, next);
    const done = () => {
      if (this.tails.get(key) === next) this.tails.delete(key);
    };
    next.then(done, done);
    return next;
  }
}
