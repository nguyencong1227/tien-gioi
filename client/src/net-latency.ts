// Bù độ trễ mạng cho vùng cảnh báo của quái / trùm (#873, quyết định của A ở comment trên #873; THIET_KE_TRUM.md mục 8).
//
// Vì sao: người chơi THẤY vùng báo ~RTT / 2 sau khi máy chủ phát `warn`, mà input cuối còn tác dụng phải tới máy chủ ~RTT / 2 trước
// khi đòn đáp, nên thời gian thực có từ lúc thấy tới hạn chót chỉ còn `ms - RTT - ~10`. Nếu vùng báo vẫn đầy đúng sau `ms` kể từ lúc
// NHẬN tin thì nó đầy SAU hạn chót khoảng `RTT + 10`: "đầy" chưa phải "đã chốt". Client rút ngắn thời gian đếm đúng bằng độ lệch đó
// (độ bù) để "đầy" = "input từ lúc này không còn kịp". Không đổi giao thức, không đổi nội dung `fx`; máy chủ vẫn quyết định trúng / trượt.
//
// Hai phần thuần (không đụng DOM / mạng, test được): `RttTracker` (trung vị vài pong gần nhất, một pong chậm lẻ loi không làm vùng báo
// nhảy) và `warnCompMs` / `warnShownMs` (độ bù, có chặn trên để RTT hỏng không làm vùng báo biến mất).

import { HEARTBEAT_TIMEOUT_MS } from "@tien-gioi/shared";

/** Số pong gần nhất giữ lại để lấy trung vị */
export const RTT_SAMPLES = 5;
/** Cần ít nhất chừng này mẫu mới tin số RTT (chưa đủ thì không bù) */
export const RTT_MIN_SAMPLES = 2;
/**
 * Mẫu RTT lớn hơn mức này (ms) bị bỏ: đó là pong của một ping gửi từ rất lâu (ứng dụng ở nền, mạng treo), không phải đường truyền hiện tại.
 * Bằng `HEARTBEAT_TIMEOUT_MS` của `shared/` (ping chờ quá chừng đó thì kết nối coi như chết).
 */
export const RTT_MAX_SAMPLE_MS = HEARTBEAT_TIMEOUT_MS;

/** Cộng thêm vào RTT: nửa khung vẽ + chênh lệch lấy mẫu input / tick máy chủ (phân tích của B ở #873: ~10 ms) */
export const WARN_COMP_PAD_MS = 10;
/** Độ bù tối đa tuyệt đối (ms): RTT hỏng / mạng rất xấu cũng không rút ngắn vùng báo hơn mức này */
export const WARN_COMP_MAX_MS = 250;
/** Độ bù tối đa theo tỉ lệ thời gian báo trước: vùng báo không bao giờ co quá 30 % */
export const WARN_COMP_MAX_FRAC = 0.3;

/**
 * Trung vị của `RTT_SAMPLES` mẫu RTT gần nhất. Mẫu không hữu hạn / âm (đồng hồ nhảy lùi) / quá `RTT_MAX_SAMPLE_MS` bị bỏ.
 * Số mẫu chẵn (2, 4) lấy trung bình hai giá trị giữa. Chưa đủ `RTT_MIN_SAMPLES` mẫu thì `median()` là `null`.
 */
export class RttTracker {
  private readonly ring: number[] = [];

  /** Ghi một mẫu RTT (ms). `true` nếu nhận, `false` nếu bỏ vì hỏng. */
  add(rttMs: number): boolean {
    if (
      typeof rttMs !== "number" ||
      !Number.isFinite(rttMs) ||
      rttMs < 0 ||
      rttMs > RTT_MAX_SAMPLE_MS
    )
      return false;
    this.ring.push(rttMs);
    if (this.ring.length > RTT_SAMPLES) this.ring.shift();
    return true;
  }

  /** Số mẫu đang giữ (0..`RTT_SAMPLES`) */
  get count(): number {
    return this.ring.length;
  }

  /** Trung vị (ms), `null` khi chưa đủ `RTT_MIN_SAMPLES` mẫu. */
  median(): number | null {
    const n = this.ring.length;
    if (n < RTT_MIN_SAMPLES) return null;
    const s = this.ring.slice().sort((a, b) => a - b);
    const mid = n >> 1;
    return n % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  }

  clear(): void {
    this.ring.length = 0;
  }
}

/**
 * Độ bù (ms) cho một vùng báo trước `ms`: `clamp(RTT + 10, 0, min(250, 0,3 x ms))`. RTT chưa biết (`null`, chưa đủ mẫu) / hỏng
 * hoặc `ms` hỏng thì 0 (không bù, giữ nguyên thời gian máy chủ báo).
 */
export function warnCompMs(rttMs: number | null | undefined, ms: number): number {
  if (typeof rttMs !== "number" || !Number.isFinite(rttMs)) return 0;
  if (typeof ms !== "number" || !Number.isFinite(ms) || !(ms > 0)) return 0;
  const cap = Math.min(WARN_COMP_MAX_MS, WARN_COMP_MAX_FRAC * ms);
  return Math.min(cap, Math.max(0, rttMs + WARN_COMP_PAD_MS));
}

/** Thời gian (ms) để vùng báo / thanh gồng đếm tới "đầy": `ms` trừ độ bù. Luôn trong [0,7 x ms, ms]. */
export function warnShownMs(ms: number, rttMs: number | null | undefined): number {
  return ms - warnCompMs(rttMs, ms);
}

/** Chữ cho bảng `?perf=1`: "160 ms" hoặc "--" khi chưa đủ mẫu / số hỏng. */
export function perfRttText(rttMs: number | null | undefined): string {
  return typeof rttMs === "number" && Number.isFinite(rttMs) && rttMs >= 0
    ? `${Math.round(rttMs)} ms`
    : "--";
}
