// Nút hành động "dùng" của một vật phẩm trong túi (lớp THUẦN, không DOM): đan dược (`effect`) -> "Dùng"; kinh quyển (`teaches`, M7.4) -> "Học". Trang bị có nút Mặc riêng.
// Server quyết định kết quả (đủ cảnh giới, đã học tối đa...); client chỉ hiện đúng nút để người chơi bấm được.
import type { ItemDef } from "@tien-gioi/shared";

/** Nhãn nút dùng của món, hoặc `null` nếu không dùng được trực tiếp (nguyên liệu, trang bị). */
export function useLabelOf(def: Pick<ItemDef, "effect" | "teaches"> | undefined): string | null {
  if (!def) return null;
  if (def.teaches) return "Học";
  if (def.effect) return "Dùng";
  return null;
}
