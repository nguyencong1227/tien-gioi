// Hệ số tu vi THỬ NGHIỆM của một nhân vật (QUYET_DINH_M3 mục 34, để chính người dùng test game; bản vá v0.3.1).
// Máy chủ (Dev A) đọc cấu hình `TEST_EXP_MULT` (`đạoHiệu:hệSố`, nhiều mục cách nhau dấu phẩy, mặc định rỗng = tắt), nhân MỌI nguồn tu vi của nhân vật
// khớp đạo hiệu, rồi báo cho CHÍNH nhân vật đó bằng tin `testExp` để client hiện nhãn "Thử nghiệm ×N" cạnh thanh Tu vi (minh bạch: không ai chơi
// với hệ số ẩn). Hợp đồng này chỉ là TIN + hằng số + hàm đọc / dựng nhãn; luật nhân tu vi nằm ở máy chủ.
//
// Luật tin (máy chủ quyết định, client chỉ hiển thị):
//  1. CHỈ gửi cho chủ nhân vật (`sendTo`), không bao giờ `broadcast` / đưa vào state chung: người khác không thấy nhãn, không biết hệ số.
//  2. Gửi khi vào phòng và khi nối lại (cùng lúc với các tin riêng khác như `wallet`, `inv`); nhân vật KHÔNG có hệ số thì không cần gửi gì (client
//     mặc định không có nhãn). Có thể gửi `{ mult: 1 }` để xoá nhãn (vd cấu hình đổi lúc đang chạy).
//  3. `mult` trong [`TEST_EXP_MIN`, `TEST_EXP_MAX`]; client vẫn kẹp / bỏ tin hỏng (`parseTestExp`), không tin tuyệt đối.
// TƯƠNG THÍCH: chỉ THÊM một tin mới (client cũ bỏ qua tin lạ) nên KHÔNG tăng `PROTOCOL_VERSION`.

/** Hệ số nhỏ nhất (1 = không nhân, tắt nhãn) và lớn nhất cho phép (cùng giới hạn với cấu hình `TEST_EXP_MULT`). */
export const TEST_EXP_MIN = 1;
export const TEST_EXP_MAX = 10;

/** Tên tin máy chủ -> client (chỉ chủ nhân vật nhận). */
export const TEST_EXP_MSG = "testExp" as const;

/** Máy chủ -> client: tu vi của chính nhân vật này đang được nhân `mult` (> 1 thì client hiện nhãn "Thử nghiệm ×N"; 1 thì xoá nhãn). */
export interface TestExpMsg {
  mult: number;
}

/**
 * Đọc tin `testExp` (client không tin máy chủ tuyệt đối): số hữu hạn thì kẹp vào [`TEST_EXP_MIN`, `TEST_EXP_MAX`] và làm tròn 2 chữ số thập phân;
 * rác (không phải đối tượng, thiếu `mult`, không phải số, NaN / vô cực) trả `null` = bỏ qua tin, giữ nguyên nhãn đang có.
 */
export function parseTestExp(raw: unknown): TestExpMsg | null {
  if (!raw || typeof raw !== "object") return null;
  const m = (raw as { mult?: unknown }).mult;
  if (typeof m !== "number" || !Number.isFinite(m)) return null;
  const clamped = Math.min(TEST_EXP_MAX, Math.max(TEST_EXP_MIN, m));
  return { mult: Math.round(clamped * 100) / 100 };
}

/** Có hệ số thử nghiệm đáng hiện nhãn không (> 1). */
export function hasTestExp(mult: number | null | undefined): mult is number {
  return typeof mult === "number" && Number.isFinite(mult) && mult > TEST_EXP_MIN;
}

/** Nhãn hiển thị: "Thử nghiệm ×5", "Thử nghiệm ×2,5" (dấu phẩy thập phân kiểu Việt, bỏ số 0 thừa). Hệ số <= 1 / rác trả chuỗi rỗng. */
export function testExpLabel(mult: number | null | undefined): string {
  if (!hasTestExp(mult)) return "";
  const v = Math.min(TEST_EXP_MAX, mult);
  const s = (Math.round(v * 100) / 100).toString().replace(".", ",");
  return `Thử nghiệm ×${s}`;
}
