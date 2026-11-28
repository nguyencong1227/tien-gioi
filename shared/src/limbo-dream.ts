// Giấc mơ bến sông (mục 75, `docs/COT_TRUYEN.md` mục 4-5, issue #1464 [75-E1], chương 1): một dòng chữ nghiêng ở màn Hoàng Tuyền
// khi kiếp ĐẦU của một chân linh khép lại, gieo hình ảnh ông lái đò (Lão Đò, chân tướng để dành chương 7-10). Chỉ là LỜI: không đổi luật
// luân hồi, không thêm trường vào `LimboMsg` / state / tệp lưu, không đi qua server. Client lấy bằng `limboDreamOf(summary.kiep)`
// (`LifeSummary.kiep` = kiếp VỪA khép lại) và hiện dưới "Kiếp thứ N khép lại"; không có dòng cho kiếp đó thì ẩn.

/** Một dòng mơ gắn với kiếp VỪA khép lại. */
export interface LimboDreamLine {
  /** Kiếp vừa khép lại (1 = kiếp đầu). Mỗi kiếp tối đa MỘT dòng. */
  readonly kiep: number;
  /** Lời hiện ở màn Hoàng Tuyền (một câu liền, không chữ Hán, không tên riêng của chân tướng). */
  readonly text: string;
  /** Khoá nguồn trong bản sao Vạn Kiếp (có một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3). */
  readonly nguon: string;
}

/**
 * Nguồn: `/content/world/lore.yaml` `lore.lao_do_ben_song` (lớp `da_su`): người chết đuối được vớt kịp đều kể bên kia có con sông không sóng,
 * ông lão chèo đò nan đầu trọc, không lấy tiền đò, chỉ hỏi đời vừa rồi có ai đáng nhớ không. Viết lại thành lời mơ hồ ở ngôi thứ hai;
 * KHÔNG nêu tên Thích Không (chân tướng Lão Đò nằm ở chương 7-10).
 */
export const LIMBO_DREAM_LINES: readonly LimboDreamLine[] = [
  {
    kiep: 1,
    text: "Sông không sóng. Một ông lão đầu trọc chèo đò nan, chẳng lấy tiền đò, chỉ hỏi: đời vừa rồi, có ai đáng nhớ không?",
    nguon: "lore.lao_do_ben_song",
  },
];

/** Dòng mơ của kiếp vừa khép lại `kiep`; `undefined` nếu không có (kiếp lạ, không nguyên, hoặc kiếp 2 trở đi chưa có lời). */
export function limboDreamOf(kiep: unknown): string | undefined {
  return LIMBO_DREAM_LINES.find((l) => l.kiep === kiep)?.text; // so khớp chặt (===) nên kiểu / số lạ đều ra undefined
}
