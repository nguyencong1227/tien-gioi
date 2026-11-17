/**
 * Phẩm cấp và phong cách của một chiêu để sổ chiêu (CT11a, #1056) lọc và vẽ biểu tượng. THUẦN, không DOM.
 *
 * Hợp đồng `shared/` (CT1a, #1077): `SkillDef.grade` (0 Hoàng .. 3 Thiên) và `SkillDef.style` (`SKILL_STYLES`) TUỲ CHỌN; thiếu thì `skillGradeOf` / `skillStyleOf` của
 * `shared/` suy (phẩm theo `rarity`, phong cách theo `shape`). Client KHÔNG tự suy: chỉ xuất lại hai hàm đó cùng tên hiển thị.
 */
import { SKILL_GRADE_NAMES, skillGradeOf, skillStyleOf, type SkillStyle } from "@tien-gioi/shared";

export { skillGradeOf, skillStyleOf };

/** Tên phẩm theo thứ tự 0..3 (chính là `SKILL_GRADE_NAMES` của shared). */
export const GRADE_NAMES: readonly string[] = SKILL_GRADE_NAMES;

/** Mười hai phong cách (`SKILL_STYLES`): khoá và tên hiển thị. */
export const STYLE_LABELS: Readonly<Record<SkillStyle, string>> = {
  kiem: "Kiếm",
  dao: "Đao",
  quyen: "Quyền",
  chuong: "Chưởng",
  chi: "Chỉ",
  an: "Ấn",
  quyet: "Quyết",
  phu: "Phù",
  tran: "Trận",
  than_phap: "Thân pháp",
  ho_the: "Hộ thể",
  khac: "Khác",
};

/** Tên phẩm hiển thị; số lạ -> "Hoàng". */
export function gradeName(grade: number): string {
  return GRADE_NAMES[grade] ?? GRADE_NAMES[0];
}

/** Tên phong cách hiển thị; khoá lạ -> "Khác". */
export function styleName(style: string): string {
  return Object.prototype.hasOwnProperty.call(STYLE_LABELS, style)
    ? STYLE_LABELS[style as SkillStyle]
    : STYLE_LABELS.khac;
}
