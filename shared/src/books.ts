// Kinh quyển (sách công pháp, M7.4, #505): mỗi chiêu của `SKILLS_M7` có MỘT quyển (`ItemType` "book", `ItemDef.teaches`): dùng quyển = học chiêu, quyển trùng = +1 tầng (tối đa
// 3, `learnSkill`). Dựng từ dữ liệu chiêu nên tên quyển (`bookName`), độ hiếm, yêu cầu cảnh giới và giá KHÔNG thể lệch với chiêu. Chỉ import KIỂU từ `items.ts` (`items.ts` nạp tệp
// này vào `ITEMS`: import giá trị sẽ thành vòng). Nguồn quyển: cửa hàng (chiêu cơ bản, `SHOPS`), rơi hiếm từ quái, rơi trùm (chiêu cao cấp) ở `DROP_TABLES`.
import type { ItemDef } from "./items";
import { SKILLS_M7, type Element } from "./skills";

/** Id quyển của chiêu `skillId`. */
export const bookIdOf = (skillId: string) => `kinh_${skillId}`;

/** Màu ảnh tạm của quyển theo hệ của chiêu. */
const BOOK_COLOR: Record<Element, number> = {
  kim: 0xc8ccd4,
  moc: 0x5e9a4a,
  thuy: 0x3b7bd9,
  hoa: 0xd9433b,
  tho: 0xa8803a,
  bang: 0x9fd0ea,
  phong: 0x9ad0b8,
  loi: 0xe8c547,
  am: 0x6a4a8c,
  none: 0xb8b0a0,
};

export const SKILL_BOOK_ITEMS: ItemDef[] = SKILLS_M7.map((def) => ({
  id: bookIdOf(def.id),
  name: def.bookName,
  type: "book",
  stack: 10,
  rarity: def.rarity,
  desc: `Kinh quyển dạy chiêu ${def.name}. Đọc để học; đọc thêm quyển trùng để tăng tầng (tối đa 3).`,
  teaches: def.id,
  color: BOOK_COLOR[def.element],
}));

/**
 * Giá trị gốc (Linh thạch) của quyển: cửa hàng bán với `BUY_MARKUP` (2) lần giá trị gốc nên giá mua xấp xỉ `SkillDef.price`; NPC thu mua trả một nửa giá trị gốc
 * (luôn thấp hơn giá mua, test của `currency.ts` giữ).
 */
export const SKILL_BOOK_VALUE: Record<string, number> = Object.fromEntries(
  SKILLS_M7.map((def) => [bookIdOf(def.id), Math.ceil(def.price / 2)]),
);

/** Chiêu CƠ BẢN (độ hiếm <= 1, cảnh giới Luyện Khí): bán ở cửa hàng. Chiêu cao cấp chỉ rơi từ quái / trùm. */
export const SHOP_BOOK_IDS: string[] = SKILLS_M7.filter((d) => d.rarity <= 1).map((d) =>
  bookIdOf(d.id),
);
