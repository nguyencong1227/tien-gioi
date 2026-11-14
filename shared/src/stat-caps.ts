// Trần ba chỉ số phần trăm cộng từ TRANG BỊ (M7.4, #505). Tệp LÁ (không import gì) để `items.ts` và `skills.ts` cùng dùng mà không thành vòng import:
// `items.ts` cần `skills.ts` (kinh quyển dựng từ `SKILLS_M7`), `skills.ts` cần trần này (`CDR_CAP`). `items.ts` xuất lại nên `STAT_CAPS` vẫn lấy từ `@tien-gioi/shared` như cũ.

/**
 * Trần của ba chỉ số phần trăm cộng từ TRANG BỊ (điểm %, M7.4): `equipBonus` / `statsFor` trả tổng ĐÃ KẸP theo bảng này; client so với nó để ghi "(tối đa)", không tự kẹp.
 * Chiêu / trạng thái (hộ thể, tăng tốc...) là hệ số riêng, không nằm trong tổng này. `crit` 40 theo issue #505; số khởi đầu, M7.9 hiệu chỉnh (một chỗ để sửa).
 */
export const STAT_CAPS = { crit: 40, cdr: 30, guard: 40 } as const;
