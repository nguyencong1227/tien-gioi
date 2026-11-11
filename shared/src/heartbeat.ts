// Nhịp tim ứng dụng (M4.2b, docs/THIET_KE_APP_ANDROID.md mục 3.1): để client phát hiện NHANH một kết nối đã chết mà trình duyệt /
// WebView chưa báo (socket "nửa mở" sau khi ứng dụng xuống nền, đổi mạng wifi <-> 4G, vào hầm).
//
// Vì sao cần: `client/src/main.ts` chỉ nối lại khi `onLeave` bắn. Với socket nửa mở `onLeave` có thể không bắn trong nhiều phút, mà
// server không có luồng tin đều đặn nào để client dùng làm dấu hiệu "còn sống" (không ai chơi thì patch = 0 byte), còn Chrome
// headless đo được: chặn mạng không đóng WebSocket (docs/THIET_KE_APP_ANDROID.md mục 6.1).
//
// Luồng (client -> server -> client):
//  1. Client gửi `ping {t}` mỗi `HEARTBEAT_INTERVAL_MS` khi đang ở tiền cảnh, và NGAY khi quay lại tiền cảnh sau khi ở nền.
//  2. Server trả đúng `pong {t}` (không tin gì khác trong tin của client, chỉ lặp lại số hữu hạn `t`).
//  3. Client coi kết nối đã chết khi MỘT ping chưa có pong quá `HEARTBEAT_TIMEOUT_MS` (`RESUME_TIMEOUT_MS` cho ping gửi lúc quay
//     lại tiền cảnh, vì ở đó người chơi đang nhìn màn hình và mạng thường đã đổi), rồi chạy vòng nối lại sẵn có (#117).
//
// TƯƠNG THÍCH: thêm tin nhắn mới nên KHÔNG tăng `PROTOCOL_VERSION` (xem protocol.ts). Server cũ không biết `ping` nên không bao giờ
// trả `pong`: client chỉ kết luận "chết" SAU KHI đã nhận ít nhất một `pong` (`supported`), nếu không mọi client mới nối vào server
// cũ sẽ tự ngắt. Triển khai server trước client như quy ước của `protocol.ts`.

export const HEARTBEAT_MSG = { ping: "ping", pong: "pong" } as const;

/** Khoảng giữa hai lần ping khi ở tiền cảnh. Server Colyseus tự ping khung WebSocket mỗi 3 giây và ngắt sau ~2 lần lỡ. */
export const HEARTBEAT_INTERVAL_MS = 5000;
/** Ping thường chưa có pong quá chừng này thì kết nối coi như chết (lớn hơn độ trễ xấu nhất của 4G + một nhịp mất gói). */
export const HEARTBEAT_TIMEOUT_MS = 8000;
/** Ping gửi lúc quay lại tiền cảnh: chờ ngắn hơn vì người chơi đang nhìn màn hình. */
export const RESUME_TIMEOUT_MS = 3000;
/** Chỉ kiểm khi quay lại tiền cảnh nếu đã ở nền ít nhất chừng này (nháy tab / kéo thanh thông báo không kích hoạt). */
export const RESUME_CHECK_AFTER_MS = 2000;

/** Tin client gửi: `t` là mốc thời gian phía client (ms), server chỉ lặp lại. */
export interface PingMsg {
  t: number;
}
/** Tin server trả: đúng `t` của `ping` tương ứng. */
export interface PongMsg {
  t: number;
}

/**
 * Làm sạch `ping` nhận từ client (server không tin client): chỉ nhận object có `t` là số hữu hạn, không âm, không vượt
 * `Number.MAX_SAFE_INTEGER`; còn lại là `null` (bỏ qua, không trả lời).
 */
export function parsePing(raw: unknown): PingMsg | null {
  if (typeof raw !== "object" || raw === null) return null;
  const t = (raw as { t?: unknown }).t;
  return typeof t === "number" && Number.isFinite(t) && t >= 0 && t <= Number.MAX_SAFE_INTEGER
    ? { t }
    : null;
}

/** Trạng thái nhịp tim ở client. */
export interface HeartbeatState {
  /** Đã từng nhận `pong` (server hiểu `ping`). Chưa thì KHÔNG BAO GIỜ kết luận chết (server cũ không trả lời). */
  supported: boolean;
  /** Mốc (ms) của ping chưa có pong, `null` nếu không có ping nào đang chờ */
  pendingSince: number | null;
}

/**
 * Kết nối đã chết? Chỉ khi server từng trả `pong`, đang có một ping chờ, và đã chờ LỐ `timeoutMs` (chờ đúng bằng thì chưa).
 * Thuần hàm để client và test dùng chung một luật.
 */
export function isConnectionDead(s: HeartbeatState, now: number, timeoutMs: number): boolean {
  return s.supported && s.pendingSince !== null && now - s.pendingSince > timeoutMs;
}
