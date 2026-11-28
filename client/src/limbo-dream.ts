// Giấc mơ về bến sông (#1464, lát 2 của 75-E1): MỘT dòng chữ nghiêng ở màn Hoàng Tuyền, chỉ khi kiếp ĐẦU của chân linh khép lại.
// Chỉ là lời kể (không đổi luật luân hồi, không thêm trường vào LimboMsg / state, không máy chủ). Nguồn: lore.lao_do_ben_song (lớp da_su, Vạn Kiếp Tu Tiên,
// mục 75), viết lại, KHÔNG chữ Hán, KHÔNG nêu tên thật của Lão Đò (chân tướng để dành chương 7-10); ghi một dòng ở docs/NGUON_NOI_DUNG.md mục 3.

/** Lời giấc mơ ở kiếp 1 (viết lại từ lore.lao_do_ben_song) */
export const LIMBO_DREAM_TEXT =
  "Sông không sóng. Một ông lão đầu trọc chèo đò nan, chẳng lấy tiền đò, chỉ hỏi: đời vừa rồi, có ai đáng nhớ không?";

/**
 * Dòng giấc mơ cho kiếp vừa khép lại (`LifeSummary.kiep`): chỉ kiếp 1 (lần chết đầu) có; kiếp khác, số lẻ / âm / NaN thì `null`.
 * Số kiếp đến từ máy chủ nhưng vẫn không tin: chỉ đúng số nguyên 1 mới hiện.
 */
export function limboDreamLine(kiep: unknown): string | null {
  return kiep === 1 ? LIMBO_DREAM_TEXT : null;
}
