// Giới hạn tần suất tin nhắn theo từng người chơi (token bucket), độc lập với Colyseus để test được.
// Client bình thường không bao giờ chạm giới hạn; vượt thì tin nhắn bị bỏ qua.
// Bỏ qua quá nhiều trong thời gian ngắn (spam có chủ đích) thì báo để phòng ngắt kết nối.

export interface Limit {
  /** Số tin nhắn hồi lại mỗi giây */
  perSec: number;
  /** Tối đa gửi dồn một lúc */
  burst: number;
}

/**
 * Giới hạn theo loại tin nhắn. Client gửi `input` 20 lần/giây; các nút bấm có hồi chiêu riêng ở server,
 * giới hạn ở đây chỉ chặn spam để server không phải xử lý (và gửi toast) hàng nghìn lần mỗi giây.
 */
export const MESSAGE_LIMITS: Record<string, Limit> = {
  input: { perSec: 30, burst: 40 },
  attack: { perSec: 10, burst: 10 },
  skill: { perSec: 10, burst: 10 },
  // Gắn chiêu vào ô (M7.2): thao tác bảng, hiếm; cast (M7.2b) sẽ có giới hạn riêng như `skill`
  skillSlot: { perSec: 4, burst: 8 },
  chat: { perSec: 2, burst: 5 },
  // Nhịp tim: client gửi 1 lần / 5 giây (+ 1 lần lúc quay lại tiền cảnh); chặn chặt vì mỗi ping tốn một tin trả lời
  ping: { perSec: 1, burst: 3 },
};
/** Loại tin nhắn không có trong MESSAGE_LIMITS (nhặt đồ, dùng đan, nói chuyện, nhận nhiệm vụ...) */
export const DEFAULT_LIMIT: Limit = { perSec: 8, burst: 16 };
/**
 * Số tin nhắn bị bỏ được "tha" tối đa; hồi lại ABUSE.perSec mỗi giây. Hết thì ngắt kết nối.
 * 30/giây: giữ một phím (tự lặp ~30 lần/giây, vd giữ B để đột phá) không bao giờ bị ngắt.
 */
export const ABUSE: Limit = { perSec: 30, burst: 200 };

interface Bucket {
  tokens: number;
  at: number;
}

function take(b: Bucket, l: Limit, now: number): boolean {
  b.tokens = Math.min(l.burst, b.tokens + ((now - b.at) / 1000) * l.perSec);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

export type Verdict = "ok" | "drop" | "kick";

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private abuse: Bucket;

  constructor(now: number) {
    this.abuse = { tokens: ABUSE.burst, at: now };
  }

  /** Gọi trước khi xử lý mỗi tin nhắn. `type` lạ (không đăng ký) cũng đi qua đây để tính spam. */
  check(type: string, now: number): Verdict {
    const limit = Object.hasOwn(MESSAGE_LIMITS, type) ? MESSAGE_LIMITS[type] : DEFAULT_LIMIT;
    let b = this.buckets.get(type);
    if (!b) {
      // Giới hạn số loại tin nhắn khác nhau được theo dõi, để gửi hàng triệu type ngẫu nhiên không làm phình bộ nhớ
      if (this.buckets.size >= 64) return this.reject(now);
      b = { tokens: limit.burst, at: now };
      this.buckets.set(type, b);
    }
    return take(b, limit, now) ? "ok" : this.reject(now);
  }

  /** Tin nhắn bị bỏ (vượt giới hạn, sai loại, sai dữ liệu): trừ vào quỹ "tha thứ". */
  reject(now: number): Verdict {
    return take(this.abuse, ABUSE, now) ? "drop" : "kick";
  }
}
