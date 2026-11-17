// Giới hạn số lượng ở cửa hàng NPC (QUYET_DINH_M3 mục 47, bước 4): lớp THUẦN (không DOM) nên test được. Ô số lượng dùng chung (`qty-stepper.ts`) kẹp theo các giới hạn này;
// máy chủ vẫn kiểm lại (số nguyên 1..`SHOP_MAX_QTY`, đủ Linh thạch / đủ đồ).
import { SHOP_MAX_QTY } from "@tien-gioi/shared";

/**
 * Mua tối đa mấy cái một lần: ví đủ trả (`coin / unitPrice`, làm tròn xuống), không quá trần `SHOP_MAX_QTY` của máy chủ, TỐI THIỂU 1 (ví không đủ cả một cái thì ô vẫn dùng được,
 * nút Mua mờ kèm "Thiếu N": người chơi vẫn thấy giá). Ví không hữu hạn coi như ví 0, ví âm cho kết quả âm nên cũng thành tối thiểu 1; giá không dương coi như không có giới hạn theo ví.
 */
export function buyQtyMax(coin: number, unitPrice: number): number {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return SHOP_MAX_QTY;
  const wallet = Number.isFinite(coin) ? Math.floor(coin) : 0;
  return Math.min(SHOP_MAX_QTY, Math.max(1, Math.floor(wallet / unitPrice)));
}

/**
 * Bán tối đa mấy cái một lần: số đang có trong ô túi, không quá trần `SHOP_MAX_QTY` (ngăn xếp lớn hơn thì bán từng đợt), tối thiểu 1. Số hỏng coi như 1 (ô túi trống không có thẻ bán).
 */
export function sellQtyMax(have: number): number {
  const h = Number.isFinite(have) ? Math.floor(have) : 0;
  return Math.max(1, Math.min(SHOP_MAX_QTY, h));
}
