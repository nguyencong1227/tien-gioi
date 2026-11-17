// Giới hạn tần suất tin nhắn theo từng người chơi (token bucket), độc lập với Colyseus để test được.
// Client bình thường không bao giờ chạm giới hạn; vượt thì tin nhắn bị bỏ qua.
// Bỏ qua quá nhiều trong thời gian ngắn (spam có chủ đích) thì báo để phòng ngắt kết nối.

import { AMBUSH_MSG, SKILL_MSG, SOCIAL_MSG } from "@tien-gioi/shared";

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
  // Mục 41: mạng nhà đứng 3-5 giây rồi xả dồn 60-100 tin `input` MỘT lúc; burst cũ 40 bỏ đúng PHẦN ĐUÔI của đợt dồn (chính các tin DỪNG nằm cuối) nên nhả phím
  // mà nhân vật không dừng. 100 = 5 giây ở 20 Hz (nhịp tim ứng dụng coi là chết sau 8 giây); spam bền vững trên 30 tin / giây vẫn bị bỏ.
  input: { perSec: 30, burst: 100 },
  attack: { perSec: 10, burst: 10 },
  skill: { perSec: 10, burst: 10 },
  // Dùng chiêu thức (M7.2b): như `skill` (hồi chiêu từng ô do server giữ, giới hạn này chỉ chặn spam)
  [SKILL_MSG.cast]: { perSec: 10, burst: 10 },
  // Gắn chiêu vào ô (M7.2): thao tác bảng, hiếm
  [SKILL_MSG.slot]: { perSec: 4, burst: 8 },
  // Xin bảng xếp hạng (M9.3, `boardsGet`): mở bảng / đổi tab, tra bản chụp trong bộ nhớ; chặn spam
  boardsGet: { perSec: 2, burst: 6 },
  // Danh hiệu / thành tựu (M9.5): mỗi `titleSet` hợp lệ có thể là MỘT lần ghi tệp chân linh, `achievementsGet` gửi lại cả sổ; người thật bấm vài lần / phút
  [SOCIAL_MSG.titleSet]: { perSec: 1, burst: 3 },
  [SOCIAL_MSG.achievementsGet]: { perSec: 1, burst: 3 },
  // Gặp chặn đường (mục 52): người thật bấm 1-2 lần mỗi lần bị chặn (`ambushSeen` một lần, `ambushChoose` / `ambushFlee` vài lần nếu ví không đủ); chặn spam
  [AMBUSH_MSG.seen]: { perSec: 2, burst: 4 },
  [AMBUSH_MSG.choose]: { perSec: 2, burst: 4 },
  [AMBUSH_MSG.flee]: { perSec: 2, burst: 4 },
  chat: { perSec: 2, burst: 5 },
  // Nhịp tim: client gửi mỗi `NET_BEAT_MS` = 1 giây (mục 33; bản cũ 5 giây) + 1 lần lúc quay lại tiền cảnh; chặn vì mỗi ping tốn một tin trả lời
  ping: { perSec: 2, burst: 6 },
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
