// Chip "Mạng chậm" (QUYET_DINH_M3 mục 25, lượt 431-433): báo SỚM hơn nhịp tim (`HEARTBEAT_TIMEOUT_MS` = 8 giây của shared, vẫn là mốc coi kết nối đã chết).
// CHỈ phía client, không đổi `shared/` hay giao thức. Mục đích: người chơi thấy nhân vật khựng / "liệt nút" biết ngay là do mạng chứ không phải do phím.
//
// Cách đo: không đếm "im lặng" thuần tuý (không ai chơi thì patch = 0 byte, lặng im là bình thường), mà đo THỜI GIAN CHỜ MỘT PHẢN HỒI ĐÃ CHẮC CHẮN SẼ TỚI:
//   - gửi `ping` -> máy chủ luôn trả `pong`;
//   - gửi `input` (chỉ khi đang đi) -> máy chủ luôn tăng `lastSeq` của chính mình nên client luôn nhận patch.
// Mốc chờ bắt đầu ở lần gửi đầu tiên sau lần nhận gần nhất; BẤT KỲ thứ gì nhận về (patch state, pong) xoá mốc. Chờ quá `SLOW_AFTER_MS` thì "chậm"; có tin về lại là tắt
// (giữ chip tối thiểu `SLOW_MIN_SHOW_MS` để kịp đọc, không nháy).

/** Chờ phản hồi quá chừng này (ms) thì báo "Mạng chậm". Dưới 8 giây của nhịp tim; trên độ trễ xấu nhất bình thường của 4G (~1 giây) + một nhịp mất gói. */
export const SLOW_AFTER_MS = 2500;
/** Chip đã hiện thì giữ ít nhất chừng này (ms) kể cả khi tin đã về lại (không nhấp nháy). */
export const SLOW_MIN_SHOW_MS = 1500;
/** Lần `poll` trước cách quá chừng này (tab ẩn, máy treo, luồng chính bị chặn): không đủ bằng chứng về mạng, bỏ mốc chờ cũ. */
export const SLOW_STALE_POLL_MS = 2000;
/** Chu kỳ `poll` của bộ theo dõi (ms). */
export const SLOW_POLL_MS = 500;

/** Bộ phát hiện THUẦN (đồng hồ tiêm vào qua tham số `now`), test được không cần DOM. */
export class NetSlowDetector {
  private waitingSince: number | null = null;
  private shownAt: number | null = null;
  private lastPoll = Number.NEGATIVE_INFINITY;

  /** Vừa gửi một tin mà máy chủ chắc chắn sẽ đáp lại (`ping`, `input`). Chỉ đặt mốc nếu chưa có mốc chờ. */
  noteSend(now: number): void {
    if (this.waitingSince === null) this.waitingSince = now;
  }

  /** Vừa nhận bất kỳ phản hồi nào (patch state, pong): mạng đang thông. */
  noteInbound(): void {
    this.waitingSince = null;
  }

  /** Quên mọi mốc (đổi phòng, nối lại, tab hiện lại). */
  reset(): void {
    this.waitingSince = null;
    this.shownAt = null;
    this.lastPoll = Number.NEGATIVE_INFINITY;
  }

  /** Gọi định kỳ (`SLOW_POLL_MS`): `true` = chip nên đang hiện. */
  poll(now: number): boolean {
    if (!Number.isFinite(now)) return false;
    if (now - this.lastPoll > SLOW_STALE_POLL_MS) {
      // vừa bị treo / ẩn: thời gian chờ đo được là do phía MÌNH không chạy, không phải do mạng
      this.waitingSince = null;
      this.shownAt = null;
    }
    this.lastPoll = now;
    if (this.waitingSince !== null && now - this.waitingSince > SLOW_AFTER_MS) {
      if (this.shownAt === null) this.shownAt = now;
      return true;
    }
    if (this.shownAt !== null && now - this.shownAt < SLOW_MIN_SHOW_MS) return true;
    this.shownAt = null;
    return false;
  }
}

export interface NetSlowRoom {
  send(type: string, message?: unknown): void;
  onStateChange(cb: () => void): unknown;
  onMessage<T = unknown>(type: string, cb: (m: T) => void): unknown;
}

export interface NetSlowOptions {
  room: NetSlowRoom;
  /** Hiện / ẩn chip (chỉ gọi khi giá trị ĐỔI) */
  onChange: (slow: boolean) => void;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}

/**
 * Gắn bộ phát hiện vào một phòng: bọc `room.send` (đếm `ping` / `input` đã gửi), nghe patch state và `pong`, và `poll` mỗi `SLOW_POLL_MS`.
 * `stop()` dừng, tắt chip và trả `room.send` về nguyên bản.
 */
export class NetSlowMonitor {
  readonly detector = new NetSlowDetector();
  private slow = false;
  private timer: unknown = null;
  private stopped = false;
  private origSend: NetSlowRoom["send"] | null = null;
  private wrapper: NetSlowRoom["send"] | null = null;

  private readonly room: NetSlowRoom;
  private readonly onChange: (slow: boolean) => void;
  private readonly now: () => number;
  private readonly setIntervalFn: (fn: () => void, ms: number) => unknown;
  private readonly clearIntervalFn: (id: unknown) => void;

  constructor(opts: NetSlowOptions) {
    this.room = opts.room;
    this.onChange = opts.onChange;
    this.now = opts.now ?? (() => Date.now());
    this.setIntervalFn = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalFn = opts.clearInterval ?? ((id) => clearInterval(id as number));
  }

  start(): void {
    if (this.stopped || this.timer !== null) return;
    const room = this.room;
    const orig = room.send.bind(room);
    this.origSend = room.send;
    room.send = (type: string, message?: unknown) => {
      if (type === "ping" || type === "input") this.detector.noteSend(this.now());
      orig(type, message);
    };
    this.wrapper = room.send;
    room.onStateChange(() => this.detector.noteInbound());
    room.onMessage("pong", () => this.detector.noteInbound());
    this.detector.poll(this.now()); // đặt mốc `poll` đầu tiên: lần gửi ngay sau `start()` (ping đầu của nhịp tim) không bị coi là "cũ"
    this.timer = this.setIntervalFn(() => this.tick(), SLOW_POLL_MS);
  }

  /** Một nhịp kiểm (public cho test / gọi tay). */
  tick(): void {
    if (this.stopped) return;
    const slow = this.detector.poll(this.now());
    if (slow !== this.slow) {
      this.slow = slow;
      this.onChange(slow);
    }
  }

  isSlow(): boolean {
    return this.slow;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) this.clearIntervalFn(this.timer);
    this.timer = null;
    // trả `send` nguyên bản, trừ khi ai đó (script kiểm thử, công cụ gỡ lỗi) đã thay nó sau khi ta bọc: không đè lên bản của họ
    if (this.origSend && this.room.send === this.wrapper) this.room.send = this.origSend;
    this.origSend = null;
    this.wrapper = null;
    if (this.slow) {
      this.slow = false;
      this.onChange(false);
    }
  }
}
