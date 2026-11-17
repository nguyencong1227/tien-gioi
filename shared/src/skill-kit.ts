// Bộ dụng cụ cho DỮ LIỆU chiêu thức (mục 51, docs/PHAN_CONG_CHIEU_THUC.md, issue CT1 #1046): `TURN_MS`, hàm dựng hiệu ứng, phong cách, phẩm cấp.
// LÁ của đồ thị import: tệp này chỉ nhập KIỂU từ `skills.ts` (xoá lúc biên dịch), nên các tệp dữ liệu chiêu (`skills-*.ts`) dùng được mà KHÔNG tạo vòng import với
// `skills.ts` (nơi gom `LEARNABLE_SKILLS`). Dữ liệu chiêu mới viết ở `skills-kim-tho.ts` / `skills-moc-thuy.ts` / `skills-hoa.ts` / `skills-khac.ts` (D / E / G), không sửa `skills.ts`.
import type { SkillEffect, StatusId } from "./skills";

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
