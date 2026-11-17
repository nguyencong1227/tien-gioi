// Bộ dụng cụ cho DỮ LIỆU chiêu thức (mục 51, docs/PHAN_CONG_CHIEU_THUC.md, issue CT1 #1046): `TURN_MS`, hàm dựng hiệu ứng, phong cách, phẩm cấp.
// LÁ của đồ thị import: tệp này chỉ nhập KIỂU từ `skills.ts` (xoá lúc biên dịch), nên các tệp dữ liệu chiêu (`skills-*.ts`) dùng được mà KHÔNG tạo vòng import với
// `skills.ts` (nơi gom `LEARNABLE_SKILLS`). Dữ liệu chiêu mới viết ở `skills-kim-tho.ts` / `skills-moc-thuy.ts` / `skills-hoa.ts` / `skills-khac.ts` (D / E / G), không sửa `skills.ts`.
import type { SkillDef, SkillEffect, SkillShape, StatusId } from "./skills";

/** Một lượt của nguồn (trò chơi theo lượt) đổi sang thời gian thực (ms). `skills.ts` xuất lại tên này. */
export const TURN_MS = 1500;

/** Dựng một `SkillEffect` từ số LƯỢT của nguồn (`turns` x `TURN_MS`, làm tròn). Dùng ở mọi tệp dữ liệu chiêu để không chép `TURN_MS`. */
export function skillEffect(
  status: StatusId,
  turns: number,
  ratio: number,
  chance: number,
): SkillEffect {
  return { status, ms: Math.round(turns * TURN_MS), ratio, chance };
}

/**
 * Phong cách chiêu (`SkillDef.style`, TUỲ CHỌN): chọn hình biểu tượng ở client (atlas nhỏ = phong cách x màu hệ x khung phẩm). Người nhập dữ liệu điền theo TÊN nguồn
 * (Kiếm -> `kiem`, Đao -> `dao`, Quyền -> `quyen`, Chưởng / Trảo -> `chuong`, Chỉ -> `chi`, Ấn -> `an`, Quyết -> `quyet`, Phù -> `phu`, Trận -> `tran`, Thân pháp -> `than_phap`,
 * Hộ thể -> `ho_the`, còn lại `khac`). Thiếu thì client suy theo `shape`.
 */
export const SKILL_STYLES = [
  "kiem",
  "dao",
  "quyen",
  "chuong",
  "chi",
  "an",
  "quyet",
  "phu",
  "tran",
  "than_phap",
  "ho_the",
  "khac",
] as const;
export type SkillStyle = (typeof SKILL_STYLES)[number];

/** Phẩm cấp chiêu (`SkillDef.grade`, TUỲ CHỌN): 0 Hoàng, 1 Huyền, 2 Địa, 3 Thiên (nguồn `pham_cap` 1-2 Hoàng, 3-4 Huyền, 5-6 Địa, 7 Thiên). Thiếu = suy theo `rarity`. */
export const SKILL_GRADES = [0, 1, 2, 3] as const;
export type SkillGrade = (typeof SKILL_GRADES)[number];
export const SKILL_GRADE_NAMES: readonly string[] = ["Hoàng", "Huyền", "Địa", "Thiên"];

/** Hình chiêu -> phong cách MẶC ĐỊNH khi chiêu không khai `style` (client / máy chủ / test cùng dùng `skillStyleOf`, không tự suy). Hình mới của mục 51 (CT1b) thêm khoá ở đây khi hình vào `SkillShape`. */
export const SHAPE_DEFAULT_STYLE: Readonly<Record<SkillShape, SkillStyle>> = {
  cone: "kiem",
  line: "chi",
  fan: "kiem",
  nova: "quyet",
  ground: "an",
  dash: "than_phap",
  self: "ho_the",
};

const isStyle = (v: unknown): v is SkillStyle =>
  typeof v === "string" && (SKILL_STYLES as readonly string[]).includes(v);
const isGrade = (v: unknown): v is SkillGrade =>
  typeof v === "number" && (SKILL_GRADES as readonly number[]).includes(v);

/**
 * Phẩm cấp của chiêu: dùng `grade` nếu hợp lệ; thiếu thì LẤY CHẶN DƯỚI của khoảng độ hiếm tương ứng: `clamp(rarity - 1, 0, 3)` (hiếm 0-1 -> Hoàng, 2 -> Huyền, 3 -> Địa, 4 -> Thiên).
 * MỘT hàm cho 18 chiêu cũ (không có `grade`) và chiêu mới: sổ chiêu, `SkillsMsg`, test, dữ liệu đều gọi hàm này (khoảng `GRADE_RARITY` chồng nhau nên không tự suy ở nơi khác).
 */
export function skillGradeOf(def: Pick<SkillDef, "rarity"> & { grade?: unknown }): SkillGrade {
  if (isGrade(def.grade)) return def.grade;
  const r =
    typeof def.rarity === "number" && Number.isFinite(def.rarity) ? Math.floor(def.rarity) : 0;
  return Math.min(3, Math.max(0, r - 1)) as SkillGrade;
}

/** Phong cách của chiêu: dùng `style` nếu hợp lệ; thiếu thì theo `SHAPE_DEFAULT_STYLE[shape]`; hình lạ -> `khac`. */
export function skillStyleOf(def: { shape: unknown; style?: unknown }): SkillStyle {
  if (isStyle(def.style)) return def.style;
  const k = def.shape;
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(SHAPE_DEFAULT_STYLE, k)
    ? SHAPE_DEFAULT_STYLE[k as SkillShape]
    : "khac";
}
