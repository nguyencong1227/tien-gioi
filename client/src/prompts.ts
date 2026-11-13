/**
 * Trả lời lời mời / hộp xác nhận bằng phím (QUYET_DINH_M3 mục 13, #463). Các hộp lời mời (tổ đội, bí cảnh, thách đấu, tông môn) và hộp xác nhận
 * rời bí cảnh / đầu hàng KHÔNG nằm trong `modalStack` (không chặn điều khiển, Tab không tới được vì Tab là chọn mục tiêu), nên chuột là cách
 * duy nhất bấm "Nhận" / "Từ chối". Hai phím chung (`prompt.yes` / `prompt.no`) bấm nút đầu tiên đang HIỆN theo thứ tự ưu tiên dưới đây;
 * hàm chọn là THUẦN (nhận hàm hỏi "nút này đang hiện không") để test.
 *
 * Thứ tự: hộp xác nhận (người chơi vừa tự mở, đang chờ) trước, rồi lời mời theo độ gấp: thách đấu (20 giây), bí cảnh (60), tổ đội, tông môn (30).
 * Hộp xác nhận của tông môn (giải tán / trục xuất / nhường) KHÔNG nằm ở đây: nằm trong bảng tông môn, đi bằng mũi tên + Enter, Esc = huỷ.
 */
export type PromptAnswer = "yes" | "no";

export const PROMPT_BUTTONS: Readonly<Record<PromptAnswer, readonly string[]>> = {
  yes: [
    "dhud-btn-leave-yes",
    "duel-btn-yield-yes",
    "duib-btn-accept",
    "dib-btn-enter",
    "pib-btn-accept",
    "sib-btn-accept",
  ],
  no: [
    "dhud-btn-leave-no",
    "duel-btn-yield-no",
    "duib-btn-decline",
    "dib-btn-decline",
    "pib-btn-decline",
    "sib-btn-decline",
  ],
};

/** Nút MỞ hộp xác nhận (phím `exit.fight`): rời bí cảnh, đầu hàng quyết đấu. */
export const LEAVE_BUTTONS: readonly string[] = ["dhud-btn-leave", "duel-btn-yield"];

/** Id nút đầu tiên đang hiện trong `ids` (theo thứ tự), hoặc `null`. */
export function pickVisible(
  ids: readonly string[],
  isVisible: (id: string) => boolean,
): string | null {
  for (const id of ids) if (isVisible(id)) return id;
  return null;
}

export const pickPromptButton = (
  answer: PromptAnswer,
  isVisible: (id: string) => boolean,
): string | null => pickVisible(PROMPT_BUTTONS[answer], isVisible);
