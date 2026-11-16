/**
 * Chữ nhỏ của hộp thoại NPC (#675): lớp THUẦN, không biết DOM, nên test được.
 *  - Gợi ý bỏ qua chữ gõ dần theo CÁCH NHẬP (`data-input` của `<html>`): cảm ứng "Chạm", còn lại "Enter hoặc nhấp" (trước đây luôn "Chạm" kể cả khi chơi bằng chuột / bàn phím).
 *  - Thẻ phụ dưới nhãn lựa chọn: bỏ khi trùng nhãn (nút "Cửa hàng" in thêm một dòng "Cửa hàng"); các thẻ có nghĩa ("Nhận việc", "Trả thưởng", "Lò rèn", "Bí cảnh") giữ.
 */
import { craftTag } from "./craft-ui";

export type DialogOptionKind = "accept" | "turnIn" | "forge" | "shop" | "dungeon" | string;

/** Gợi ý dưới hộp thoại khi chữ còn đang gõ. `input` = `data-input` ("touch" | "mouse"), thiếu / lạ coi như chuột + bàn phím. */
export function skipHintText(input: string | null | undefined): string {
  return input === "touch" ? "Chạm để hiện hết chữ ▸" : "Enter hoặc nhấp để hiện hết chữ ▸";
}

export interface OptionTag {
  text: string;
  /** Màu chữ: vàng cho thẻ thường, đỏ nhạt khi lựa chọn bị khoá */
  color: string;
}

const GOLD = "#ffe08a";
const RED = "#fca5a5";

/**
 * Thẻ phụ của một lựa chọn (hoặc `null` nếu không có / trùng nhãn). `station` (chỉ lựa chọn `forge`, #514): "Lò rèn" / "Lò đan" / "Bàn phù" theo
 * `CRAFT_STATIONS`; thiếu hoặc lạ = Lò rèn (máy chủ cũ không gửi trường này).
 */
export function optionTag(
  kind: DialogOptionKind,
  label: string,
  disabled = false,
  station?: unknown,
): OptionTag | null {
  let tag: OptionTag | null = null;
  switch (kind) {
    case "turnIn":
      tag = { text: "Trả thưởng", color: GOLD };
      break;
    case "accept":
      tag = { text: "Nhận việc", color: GOLD };
      break;
    case "forge":
      tag = { text: craftTag(station), color: GOLD };
      break;
    case "shop":
      tag = { text: "Cửa hàng", color: GOLD };
      break;
    case "dungeon":
      tag = disabled ? { text: "Chưa đủ điều kiện", color: RED } : { text: "Bí cảnh", color: GOLD };
      break;
  }
  if (tag && tag.text.trim().toLowerCase() === label.trim().toLowerCase()) return null;
  return tag;
}
