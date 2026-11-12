/**
 * Tập chữ bay (số sát thương, hồi máu...) của lớp hiệu ứng (M5.2, #325, mục 7.1 (5)).
 *
 * Logic thuần, độc lập Phaser (đối tượng hiển thị do người gọi cấp qua `hooks`): pool tái dùng, trần `max` (= `damageNumbers`
 * của hồ sơ chất lượng) và chuyển động (bay lên, mờ dần; giảm chuyển động: ngắn hơn, trôi nhẹ). Không cấp phát khi đang chạy
 * trừ lúc pool chưa đủ (tạo tối đa `max` đối tượng cho cả phiên). Ưu tiên 2 (của mình) khi đầy thì THAY chữ cũ nhất; còn lại bị bỏ.
 */
import type { FxPriority } from "./budget";

export const FLOAT_MS = 800;
export const FLOAT_MS_REDUCED = 300;
export const FLOAT_RISE = 36;
export const FLOAT_RISE_REDUCED = 8;

export interface FloatSpec {
  text: string;
  x: number;
  y: number;
  /** Màu (0xRRGGBB) và cỡ chữ (px thế giới) do người gọi quyết định theo kiểu. */
  color: number;
  size: number;
  priority: FxPriority;
}

export interface FloatHooks<T> {
  create(): T;
  /** Hiện `item` với nội dung / vị trí / kiểu của `spec`. */
  show(item: T, spec: FloatSpec): void;
  /** Đặt vị trí dọc và độ mờ theo tiến độ (đã tính giảm chuyển động). */
  place(item: T, y: number, alpha: number): void;
  hide(item: T): void;
  /** Giải phóng hẳn `item` (đóng lõi hiệu ứng); không có thì `dispose` chỉ bỏ tham chiếu. */
  destroy?(item: T): void;
}

interface Active<T> {
  item: T;
  y0: number;
  start: number;
  priority: FxPriority;
}

export class FloatSet<T> {
  private readonly free: T[] = [];
  private readonly active: Active<T>[] = [];
  private created = 0;
  private disposed = false;
  dropped = 0;
  recycled = 0;

  constructor(
    private readonly hooks: FloatHooks<T>,
    private readonly max: () => number,
  ) {}

  get activeCount(): number {
    return this.active.length;
  }
  /** Số đối tượng đã tạo cho cả phiên (không bao giờ vượt `max` lớn nhất từng gặp). */
  get createdCount(): number {
    return this.created;
  }

  spawn(spec: FloatSpec, now: number): boolean {
    if (this.disposed) return false;
    const cap = Math.max(0, Math.floor(this.max()));
    let item: T | undefined;
    if (this.active.length >= cap) {
      if (spec.priority < 2 || this.active.length === 0) {
        this.dropped++;
        return false;
      }
      // Đầy: chữ của mình thay chữ cũ nhất (ưu tiên thấp nhất trước)
      let k = 0;
      for (let i = 1; i < this.active.length; i++) {
        const a = this.active[i];
        const b = this.active[k];
        if (a.priority < b.priority || (a.priority === b.priority && a.start < b.start)) k = i;
      }
      item = this.active[k].item;
      this.active[k] = this.active[this.active.length - 1];
      this.active.pop();
      this.recycled++;
    } else {
      item = this.free.pop();
      if (item === undefined) {
        if (cap === 0) {
          this.dropped++;
          return false;
        }
        item = this.hooks.create();
        this.created++;
      }
    }
    this.hooks.show(item, spec);
    this.active.push({ item, y0: spec.y, start: now, priority: spec.priority });
    return true;
  }

  /** Tiến chuyển động; trả chữ hết giờ về pool. */
  step(now: number, reduced: boolean): void {
    const dur = reduced ? FLOAT_MS_REDUCED : FLOAT_MS;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      const p = (now - a.start) / dur;
      if (p >= 1) {
        this.hooks.hide(a.item);
        this.free.push(a.item);
        const last = this.active.pop()!;
        if (i < this.active.length) this.active[i] = last;
      } else if (reduced) {
        this.hooks.place(a.item, a.y0 - FLOAT_RISE_REDUCED * p, 1 - p);
      } else {
        const inv = 1 - p;
        const ease = 1 - inv * inv * inv; // Cubic.easeOut
        this.hooks.place(a.item, a.y0 - FLOAT_RISE * ease, 1 - ease);
      }
    }
  }

  /** Giải phóng toàn bộ đối tượng (đang bay và trong pool); sau đó `spawn` luôn trả false. */
  dispose(): void {
    for (const a of this.active) this.hooks.destroy?.(a.item);
    for (const f of this.free) this.hooks.destroy?.(f);
    this.active.length = 0;
    this.free.length = 0;
    this.disposed = true;
  }

  /** Ẩn và trả tất cả về pool (đổi bản đồ). */
  clear(): void {
    for (const a of this.active) {
      this.hooks.hide(a.item);
      this.free.push(a.item);
    }
    this.active.length = 0;
  }
}
