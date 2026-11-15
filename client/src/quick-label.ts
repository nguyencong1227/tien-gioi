/**
 * Nhãn NGẮN cho ô nhanh đan dược (phím 1 / 2). Ô chỉ rộng ~48 px nên tên đầy đủ bị cắt bằng dấu chấm lửng, và vì phần dễ phân biệt nằm ở CUỐI tên nên đan cấp 2 / 3
 * thành "Đại Hồi …" / "Thượng …" y hệt nhau ở cả ô Huyết lẫn ô Linh (chụp ở Hàn Vân, M7.5c). Rút gọn giữ đúng thứ cần phân biệt: loại (Huyết / Linh) và cấp (2 / 3, như "đan cấp 3" trong tài liệu; chữ số hẹp hơn "III" nên "Huyết 3" còn vừa ô cảm ứng 48 px, "Huyết III" tràn 3 px).
 *   Hồi Huyết Đan -> "Huyết"; Đại Hồi Linh Đan -> "Linh 2"; Thượng Hồi Huyết Đan -> "Huyết 3"; đan khác (Tụ Khí Đan) -> bỏ chữ " Đan" ("Tụ Khí").
 * Tên đầy đủ vẫn ở túi (bảng chi tiết, `aria-label`) và ô nhanh chỉ là nhãn hiển thị.
 */
const TIER_OF_PREFIX: Readonly<Record<string, string>> = { Đại: "2", Thượng: "3" };
const HOI_DAN = /^(?:(Đại|Thượng) )?Hồi (Huyết|Linh) Đan$/;

export function quickLabel(name: string): string {
  const n = String(name ?? "").trim();
  const m = HOI_DAN.exec(n);
  if (m) return m[1] ? `${m[2]} ${TIER_OF_PREFIX[m[1]]}` : m[2];
  return n.replace(/ Đan$/, "");
}
