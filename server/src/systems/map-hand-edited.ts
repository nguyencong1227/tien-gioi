// Bản đồ thường SỬA TAY (S6, docs/THIET_KE_BAN_DO_TILED.md mục 6a): tệp Tiled `shared/maps/<id>.json` là NGUỒN DUY NHẤT, không còn bằng bản sinh theo `seed`.
// Đánh dấu bằng thuộc tính bản đồ `handEdited` = true trong tệp soạn (`map:build` giữ mọi thuộc tính nên nó đi cả vào `<id>.logic.json`). Bản đồ có cờ này:
//  - `map:bake` (sinh `<id>.logic.json` từ `seed`) BỎ QUA, để khỏi ghi đè bản sửa tay;
//  - test "giống từng byte bản sinh theo seed" (`shared/src/tiled-maps.test.ts`) chuyển sang kiểm hợp lệ (cùng thuộc tính `handEdited`: nếu đổi tên thì đổi ở cả hai nơi).
// Mọi kiểm khác (`map:check`: cổng hai chiều, liên thông, vùng sinh; `map-sync.test.ts`: tệp đã commit == đầu ra `map:build`) VẪN chạy với bản đồ sửa tay.

/** Tên thuộc tính bản đồ (Tiled custom property, kiểu bool) đánh dấu bản đồ sửa tay. */
export const HAND_EDITED_PROPERTY = "handEdited";

/** Tệp Tiled (JSON đã đọc) có đánh dấu sửa tay không: thuộc tính `handEdited` phải là boolean `true` (chuỗi "true", số 1... KHÔNG tính). Dữ liệu lạ thì `false`, không ném. */
export function isHandEditedTiled(json: unknown): boolean {
  if (typeof json !== "object" || json === null) return false;
  const props = (json as { properties?: unknown }).properties;
  if (!Array.isArray(props)) return false;
  return props.some(
    (p) =>
      typeof p === "object" &&
      p !== null &&
      (p as { name?: unknown }).name === HAND_EDITED_PROPERTY &&
      (p as { value?: unknown }).value === true,
  );
}
