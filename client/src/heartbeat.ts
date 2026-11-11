// Bộ điều khiển nhịp tim ứng dụng (M4.2b, issue #293):
// Phát hiện kết nối chết nhanh khi ứng dụng xuống nền, đổi mạng wifi <-> 4G hoặc gặp sự cố socket nửa mở.

import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MSG,
  HEARTBEAT_TIMEOUT_MS,
  isConnectionDead,
  RESUME_CHECK_AFTER_MS,
  RESUME_TIMEOUT_MS,
  type HeartbeatState,
  type PongMsg,
} from "@tien-gioi/shared";

export interface HeartbeatRoom {
  send(type: string, message?: any): void;
  onMessage<T = any>(type: string, handler: (message: T) => void): (() => void) | void;
  connection?: {
    isOpen?: boolean;
  };
}

export interface SoundController {
  suspend(): void;
  resume(): void;
}

export interface DocumentVisibilityLike {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  visibilityState?: DocumentVisibilityState;
  hidden?: boolean;
}

export interface HeartbeatOptions {
  room: HeartbeatRoom;
  onDead: () => void;
  sound?: SoundController;
  doc?: DocumentVisibilityLike;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => any;
  clearInterval?: (id: any) => void;
  setTimeout?: (fn: () => void, ms: number) => any;
  clearTimeout?: (id: any) => void;
}

export class HeartbeatController {
  readonly state: HeartbeatState = {
    supported: false,
    pendingSince: null,
  };

  private pendingT: number | null = null;
  private timerId: any = null;
  private resumeTimeoutId: any = null;
  private hiddenSince = 0;
  private stopped = false;
  private unregisterPong: (() => void) | null = null;

  private readonly room: HeartbeatRoom;
  private readonly onDeadCallback: () => void;
  private readonly sound?: SoundController;
  private readonly doc?: DocumentVisibilityLike;
  private readonly now: () => number;
  private readonly setIntervalFn: (fn: () => void, ms: number) => any;
  private readonly clearIntervalFn: (id: any) => void;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => any;
  private readonly clearTimeoutFn: (id: any) => void;

  private readonly handleVisibilityChange = () => {
    this.onVisibilityChange();
  };

  constructor(opts: HeartbeatOptions) {
    this.room = opts.room;
    this.onDeadCallback = opts.onDead;
    this.sound = opts.sound;
    this.doc = opts.doc ?? (typeof document !== "undefined" ? document : undefined);
    this.now = opts.now ?? (() => Date.now());
    this.setIntervalFn = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalFn = opts.clearInterval ?? ((id) => clearInterval(id));
    this.setTimeoutFn = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = opts.clearTimeout ?? ((id) => clearTimeout(id));
  }

  /** Khởi động gửi nhịp tim và lắng nghe phản hồi. */
  start(): void {
    if (this.stopped) return;

    // Đăng ký nhận pong từ server
    const cleanup = this.room.onMessage<PongMsg>(HEARTBEAT_MSG.pong, (msg) => {
      this.handlePong(msg);
    });
    if (typeof cleanup === "function") {
      this.unregisterPong = cleanup;
    }

    // Lắng nghe sự kiện chuyển đổi tiền cảnh / hậu cảnh
    if (this.doc) {
      this.doc.addEventListener("visibilitychange", this.handleVisibilityChange);
    }

    // Bắt đầu chu kỳ ping định kỳ khi ở tiền cảnh
    if (!this.isDocumentHidden()) {
      this.tick();
      this.startInterval();
    }
  }

  /** Nhận và xử lý tin pong từ máy chủ. */
  handlePong(msg: PongMsg | null | undefined): void {
    if (!msg || typeof msg.t !== "number") return;
    if (this.pendingT !== null && msg.t === this.pendingT) {
      this.state.supported = true;
      this.state.pendingSince = null;
      this.pendingT = null;
      if (this.resumeTimeoutId !== null) {
        this.clearTimeoutFn(this.resumeTimeoutId);
        this.resumeTimeoutId = null;
      }
    }
  }

  /** Chu kỳ kiểm tra định kỳ ở tiền cảnh (gọi mỗi HEARTBEAT_INTERVAL_MS). */
  tick(): void {
    if (this.stopped || this.isDocumentHidden()) return;

    // 1. Kiểm tra nếu ping trước đó đã quá hạn mà không có pong
    if (isConnectionDead(this.state, this.now(), HEARTBEAT_TIMEOUT_MS)) {
      this.triggerDead();
      return;
    }

    // 2. Nếu không có ping nào đang chờ, gửi ping mới
    if (this.state.pendingSince === null) {
      this.sendPing();
    }
  }

  /** Gửi một tin ping kèm mốc thời gian client. */
  private sendPing(): void {
    const t = this.now();
    this.state.pendingSince = t;
    this.pendingT = t;
    try {
      this.room.send(HEARTBEAT_MSG.ping, { t });
    } catch {
      // Bỏ qua lỗi gửi socket
    }
  }

  /** Xử lý khi ứng dụng xuống nền hoặc quay lại tiền cảnh. */
  private onVisibilityChange(): void {
    if (this.stopped) return;

    if (this.isDocumentHidden()) {
      // Xuống nền: tạm dừng âm thanh và dừng vòng lặp ping định kỳ
      this.hiddenSince = this.now();
      this.sound?.suspend();
      this.stopInterval();
    } else {
      // Quay lại tiền cảnh: phục hồi âm thanh
      this.sound?.resume();

      // Kiểm tra ngay nếu socket đã bị đóng ngầm
      if (this.room.connection && this.room.connection.isOpen === false) {
        this.triggerDead();
        return;
      }

      const wasHiddenDuration = this.hiddenSince > 0 ? this.now() - this.hiddenSince : 0;
      this.hiddenSince = 0;

      // Nếu ở nền đủ lâu (>= RESUME_CHECK_AFTER_MS): gửi ping ngay với hạn RESUME_TIMEOUT_MS
      if (wasHiddenDuration >= RESUME_CHECK_AFTER_MS) {
        this.sendPing();

        if (this.resumeTimeoutId !== null) {
          this.clearTimeoutFn(this.resumeTimeoutId);
        }
        this.resumeTimeoutId = this.setTimeoutFn(() => {
          this.resumeTimeoutId = null;
          // Bù sai số timer resolution của trình duyệt (+50ms) để không bị trượt điều kiện lố timeout
          if (isConnectionDead(this.state, this.now() + 50, RESUME_TIMEOUT_MS)) {
            this.triggerDead();
          }
        }, RESUME_TIMEOUT_MS);
      }

      // Khởi động lại vòng lặp định kỳ ở tiền cảnh
      this.startInterval();
    }
  }

  private isDocumentHidden(): boolean {
    if (!this.doc) return false;
    return this.doc.hidden === true || this.doc.visibilityState === "hidden";
  }

  private startInterval(): void {
    if (this.timerId === null && !this.stopped) {
      this.timerId = this.setIntervalFn(() => this.tick(), HEARTBEAT_INTERVAL_MS);
    }
  }

  private stopInterval(): void {
    if (this.timerId !== null) {
      this.clearIntervalFn(this.timerId);
      this.timerId = null;
    }
  }

  private triggerDead(): void {
    this.stop();
    this.onDeadCallback();
  }

  /** Dừng toàn bộ hoạt động nhịp tim và dọn dẹp tài nguyên. */
  stop(): void {
    this.stopped = true;
    this.stopInterval();

    if (this.resumeTimeoutId !== null) {
      this.clearTimeoutFn(this.resumeTimeoutId);
      this.resumeTimeoutId = null;
    }

    if (this.unregisterPong) {
      this.unregisterPong();
      this.unregisterPong = null;
    }

    if (this.doc) {
      this.doc.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }
}
