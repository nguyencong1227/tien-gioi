// Ô nhập SỐ LƯỢNG dùng chung (QUYET_DINH_M3 mục 47): phần LOGIC thuần (đọc chữ người gõ, kẹp theo giới hạn, nút nhanh, nhịp tăng nhanh dần khi giữ nút).
// Phần dựng DOM ở `qty-stepper.ts`. Server VẪN kiểm số lượng (không tin client): kẹp ở đây chỉ để người chơi thấy trước điều gì sẽ được gửi.

/** Mốc chữ số tối đa khi đọc: dài hơn thì coi như vượt mọi giới hạn (tránh `Number("99999999999999999999")` mất chính xác). */
const MAX_DIGITS = 12;

/** Các nút nhanh của ô: bớt / thêm một, nhân 10, nhân 100, lấy tối đa. */
export type QtyAction = "minus" | "plus" | "x10" | "x100" | "max";

export interface QtyParse {
  /** Số lượng đọc được (đã kẹp vào [1, max]); `null` khi ô trống / hỏng / không còn gì để chọn */
  qty: number | null;
  /** Chữ báo cho người chơi: rỗng nếu ổn; lý do nếu hỏng; "Tối đa ..." nếu bị kẹp */
  note: string;
  /** Có bị kẹp xuống `max` không (để ô ghi đè lại số đã kẹp, người chơi thấy đúng thứ sẽ gửi) */
  clamped: boolean;
  /** Chữ gõ vào hỏng (không phải số nguyên dương): ô đánh dấu `aria-invalid` */
  invalid: boolean;
}

const fmtNum = (n: number) => n.toLocaleString("vi-VN");

/**
 * Đọc chữ trong ô. Chấp nhận dấu cách và dấu chấm / phẩy phân nhóm nghìn kiểu "1.000" / "1,000" (điện thoại hay chèn); mọi ký tự khác (chữ, dấu trừ, dấu thập phân,
 * `e`) là hỏng. Trống thì chưa phải lỗi (người chơi đang xoá để gõ lại): `qty` null, không báo.
 */
export function parseQty(text: unknown, max: number): QtyParse {
  const limit = Number.isFinite(max) ? Math.floor(max) : 0;
  const raw = typeof text === "string" ? text : "";
  const compact = raw.replace(/[\s.,]/g, "");
  if (compact === "") return { qty: null, note: "", clamped: false, invalid: false };
  if (limit < 1)
    return { qty: null, note: "Không còn gì để chọn.", clamped: false, invalid: false };
  if (!/^\d+$/.test(compact))
    return {
      qty: null,
      note: "Chỉ nhập số nguyên dương (không chữ, không dấu âm, không số lẻ).",
      clamped: false,
      invalid: true,
    };
  const digits = compact.replace(/^0+(?=\d)/, "");
  const n = digits.length > MAX_DIGITS ? Number.POSITIVE_INFINITY : Number(digits);
  if (n < 1)
    return { qty: null, note: "Số lượng phải từ 1 trở lên.", clamped: false, invalid: true };
  if (n > limit)
    return { qty: limit, note: `Chỉ có tối đa ${fmtNum(limit)}.`, clamped: true, invalid: false };
  return { qty: n, note: "", clamped: false, invalid: false };
}

/** Số lượng sau một lần bấm nút nhanh, kẹp vào [1, max] (`max` < 1 thì 0). Ô trống / hỏng: + cho 1, ×10 cho 10, ×100 cho 100, − cho 1. */
export function applyQtyAction(cur: number | null, action: QtyAction, max: number): number {
  const limit = Number.isFinite(max) ? Math.floor(max) : 0;
  if (limit < 1) return 0;
  // ô TRỐNG / hỏng coi như 0 cho nút thêm và nhân (bấm + từ ô trống ra 1, ×10 ra 10, ×100 ra 100); nút bớt luôn về tối thiểu 1
  const have = cur !== null && Number.isFinite(cur) && cur >= 1;
  const c = have ? Math.floor(cur) : 1;
  const clamp = (v: number) => Math.min(limit, Math.max(1, v));
  switch (action) {
    case "minus":
      return clamp(c - 1);
    case "plus":
      return clamp(have ? c + 1 : 1);
    case "x10":
      return clamp(c * 10);
    case "x100":
      return clamp(c * 100);
    case "max":
      return limit;
  }
}

/** Nút nào bấm không còn tác dụng (khoá nút): bớt ở 1, thêm / nhân / tối đa khi đã chạm trần, hoặc không còn gì để chọn. */
export function qtyDisabled(cur: number | null, max: number): Record<QtyAction, boolean> {
  const limit = Number.isFinite(max) ? Math.floor(max) : 0;
  const off = limit < 1;
  const c = cur ?? 1;
  return {
    minus: off || c <= 1,
    plus: off || c >= limit,
    x10: off || c >= limit,
    x100: off || c >= limit,
    max: off || c >= limit,
  };
}

/** Giữ nút −/+ lâu hơn chừng này (ms) thì bắt đầu lặp. */
export const QTY_HOLD_DELAY_MS = 380;

/**
 * Bước lặp thứ `i` (0, 1, 2...) khi giữ nút: số đơn vị mỗi nhịp và khoảng chờ tới nhịp kế (ms). Nhanh dần: ban đầu 1 đơn vị / 170 ms, sau cùng 100 đơn vị / 45 ms,
 * để đi từ 1 tới vài nghìn trong vài giây mà vẫn chọn chính xác được lúc đầu. Không giảm theo `i`.
 */
export function qtyHoldStep(i: number): { delta: number; nextMs: number } {
  const k = Number.isFinite(i) && i > 0 ? Math.floor(i) : 0;
  const delta = k < 6 ? 1 : k < 12 ? 5 : k < 20 ? 10 : k < 30 ? 50 : 100;
  const nextMs = Math.max(45, 170 - k * 6);
  return { delta, nextMs };
}

/** Một nhịp giữ nút: thêm / bớt `delta` rồi kẹp vào [1, max]. */
export function applyHold(
  cur: number | null,
  dir: "plus" | "minus",
  i: number,
  max: number,
): number {
  const limit = Number.isFinite(max) ? Math.floor(max) : 0;
  if (limit < 1) return 0;
  const c = cur !== null && Number.isFinite(cur) && cur >= 1 ? Math.floor(cur) : 1;
  const d = qtyHoldStep(i).delta;
  return Math.min(limit, Math.max(1, dir === "plus" ? c + d : c - d));
}
