/**
 * Phẩm cấp và phong cách của một chiêu để sổ chiêu (CT11a, #1056) lọc và vẽ biểu tượng. THUẦN, không DOM.
 *
 * Hợp đồng `shared/` (CT1a, #1077) cho `SkillDef` hai trường TUỲ CHỌN `grade` (0 Hoàng .. 3 Thiên) và `style` (`SKILL_STYLES`). Dữ liệu cũ chưa có thì suy:
 * phẩm theo `rarity` của kinh quyển (`clamp(rarity - 1, 0, 3)`), phong cách theo `shape`. Đọc qua kiểu cấu trúc để mã này chạy cả trước lẫn sau khi #1077 vào `main`
 * (sau đó đổi sang `skillGradeOf` / `skillStyleOf` của `shared/` nếu có, xoá hai hàm suy ở đây).
 */
import type { SkillDef } from "@tien-gioi/shared";

/** Tên phẩm theo thứ tự 0..3 (cùng `SKILL_GRADE_NAMES` của shared, chép ở đây để không phụ thuộc #1077). */
export const GRADE_NAMES: readonly string[] = ["Hoàng", "Huyền", "Địa", "Thiên"];

/** Mười hai phong cách (cùng `SKILL_STYLES`): khoá và tên hiển thị. */
export const STYLE_LABELS: Readonly<Record<string, string>> = {
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

/** Phong cách suy theo hình đánh khi dữ liệu chưa ghi `style`. */
const STYLE_BY_SHAPE: Readonly<Record<string, string>> = {
  cone: "chuong",
  line: "kiem",
  fan: "phu",
  nova: "an",
  ground: "tran",
  dash: "than_phap",
  self: "ho_the",
};

interface MaybeMeta {
  grade?: unknown;
  style?: unknown;
  rarity?: unknown;
  shape?: unknown;
}

/** Phẩm 0..3: `grade` hợp lệ thì dùng, không thì suy theo `rarity` (sai kiểu / ngoài khoảng -> 0). */
export function skillGradeOf(def: Pick<SkillDef, "rarity"> & MaybeMeta): number {
  const g = def.grade;
  if (typeof g === "number" && Number.isInteger(g) && g >= 0 && g <= 3) return g;
  const r = def.rarity;
  if (typeof r !== "number" || !Number.isFinite(r)) return 0;
  return Math.min(3, Math.max(0, Math.floor(r) - 1));
}

/** Phong cách: `style` thuộc 12 khoá thì dùng, không thì suy theo `shape`, lạ nữa thì `khac`. */
export function skillStyleOf(def: MaybeMeta): string {
  const s = def.style;
  if (typeof s === "string" && Object.prototype.hasOwnProperty.call(STYLE_LABELS, s)) return s;
  const sh = def.shape;
  if (typeof sh === "string" && Object.prototype.hasOwnProperty.call(STYLE_BY_SHAPE, sh))
    return STYLE_BY_SHAPE[sh];
  return "khac";
}

/** Tên phẩm hiển thị; số lạ -> "Hoàng". */
export function gradeName(grade: number): string {
  return GRADE_NAMES[grade] ?? GRADE_NAMES[0];
}

/** Tên phong cách hiển thị; khoá lạ -> "Khác". */
export function styleName(style: string): string {
  return Object.prototype.hasOwnProperty.call(STYLE_LABELS, style)
    ? STYLE_LABELS[style]
    : STYLE_LABELS.khac;
}
