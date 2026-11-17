// Đối chiếu vị trí MƯỢT (QUYET_DINH_M3 mục 41.3). Lớp THUẦN (không Phaser) nên test được.
//
// `reconcile` lấy vị trí máy chủ làm gốc rồi chạy lại các input chưa được xử lý, nên vị trí đoán trước (`pred`) có thể NHẢY khi máy chủ khác client (đụng tường khác nhau,
// máy chủ bỏ / xoá input cũ, hệ số tốc độ lệch...). Trước đây nhân vật vẽ bám `pred` với hằng thời gian ~33 ms: chênh nhỏ thì giật ngay, chênh lớn thì lao ngang màn hình.
//
// Cách làm: vị trí VẼ = `pred` + `corr` (độ lệch bù). Khi `pred` nhảy một đoạn `jump`, `corr` bị TRỪ đúng đoạn đó nên vị trí vẽ giữ nguyên tại khoảnh khắc nhảy; rồi `corr` tan
// dần về 0 với hằng thời gian `CORR_TAU_MS` (~120 ms: người dùng yêu cầu nội suy ~100-150 ms). Lệch tích luỹ từ `CORR_SNAP_PX` trở lên thì không nội suy mà
// DỊCH CHUYỂN TỨC THÌ (`absorbJump` trả `null`). Mọi logic chơi (nhắm, nhặt, chạm cổng) vẫn dùng `pred` thật, chỉ riêng việc vẽ nhân vật và camera dùng `pred + corr`.

/** Hằng thời gian tan của độ lệch bù (ms): ~95 % độ lệch tan sau 3 x tau = 360 ms, ~63 % sau 120 ms. */
export const CORR_TAU_MS = 120;
/** Độ lệch tích luỹ (px) từ mức này trở lên thì dịch chuyển tức thì thay vì trượt (~8 bước đi, ~0,4 giây di chuyển). */
export const CORR_SNAP_PX = 48;
/** Dưới mức này (px) coi như đã tan hết, đặt đúng 0 để vòng lặp vẽ không mang số thực lẻ mãi. */
export const CORR_EPS_PX = 0.05;

export interface Vec {
  x: number;
  y: number;
}

const ZERO: Vec = { x: 0, y: 0 };

/**
 * `pred` vừa nhảy một đoạn (`jumpX`, `jumpY`) = vị trí mới trừ vị trí cũ. Trả độ lệch bù MỚI (vị trí vẽ không đổi lúc nhảy), hoặc `null` khi độ lệch tích luỹ
 * quá lớn (từ `snapPx`): người gọi đặt `corr` về 0 và dịch chuyển tức thì. Số không hữu hạn (hỏng) cũng trả `null`.
 */
export function absorbJump(
  corr: Vec,
  jumpX: number,
  jumpY: number,
  snapPx: number = CORR_SNAP_PX,
): Vec | null {
  const x = corr.x - jumpX;
  const y = corr.y - jumpY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.hypot(x, y) >= snapPx ? null : { x, y };
}

/** Cho độ lệch bù tan sau `dtMs` mili giây (mũ, độc lập với tốc độ khung hình). `dtMs` xấu (âm / NaN) thì không đổi. */
export function decayCorr(corr: Vec, dtMs: number, tauMs: number = CORR_TAU_MS): Vec {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return corr;
  const k = Math.exp(-dtMs / tauMs);
  const x = corr.x * k;
  const y = corr.y * k;
  return Math.hypot(x, y) < CORR_EPS_PX ? ZERO : { x, y };
}
