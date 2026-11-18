// Biểu tượng chiêu thức vẽ bằng mã (M7.6 #507, CT11a #1056): hình theo PHONG CÁCH (`skillStyleOf`: kiếm, đao, quyền... 12 loại) tô màu theo `element` (hệ), trong một
// KHUNG theo PHẨM (`skillGradeOf`). Không chữ Hán, không tài sản ngoài. Khi có ảnh `vktt/` thì thay MỘT chỗ này (`skillIconSvg`), ô chiêu vẫn đúng.
// Chuỗi trả về là hằng cố định ghép với màu lấy từ bảng `ELEMENT_COLOR` / `GRADE_GOLD` (không bao giờ chứa dữ liệu từ tin nhắn) nên gán `innerHTML` an toàn.
//
// Phẩm KHÔNG chỉ nói bằng màu (người mù màu, màn nhỏ): mỗi bậc là một CẤU TRÚC khung khác nhau, đếm được ở 24 px:
//   Hoàng = một nét mảnh; Huyền = một nét đậm; Địa = hai nét mảnh lồng nhau; Thiên = hai nét (đậm + mảnh) và bốn chấm vàng ở góc.
// Chữ phẩm vẫn hiện cạnh tên ở sổ chiêu, aria đọc phẩm (`skills-panel.ts`).
import { skillGradeOf, skillStyleOf, type SkillDef, type SkillStyle } from "@tien-gioi/shared";
import { elementColor } from "./skill-bar";

/** Vàng của bốn chấm góc phẩm Thiên (khác nét hệ, kể cả hệ Kim vàng, ở chỗ nó là CHẤM, không phải nét). */
export const GRADE_GOLD = "#ffe08a";

/**
 * Hình theo phong cách, hệ toạ độ 24 x 24 (ngay ngắn, "hướng lên"). Vẽ vào vùng giữa của khung (xem `GLYPH_TRANSFORM`), nét cuối do nhóm `<g>` đặt.
 * Thứ tự khoá theo `SKILL_STYLES`; test giữ mỗi phong cách một hình khác nhau.
 */
export const STYLE_PATH: Readonly<Record<SkillStyle, string>> = {
  // kiếm: lưỡi thẳng có mũi, chắn tay, chuôi
  kiem: '<path d="M12 2.2 L15.2 13.5 H8.8 Z" /><path d="M7 14 H17 M12 14 V21" fill="none" stroke-linecap="round" />',
  // đao: lưỡi cong một mặt, chuôi chếch
  dao: '<path d="M18 3 C19.5 11 14.5 17 7.5 19 L6.5 16.5 C11.5 13 15 9 18 3 Z" /><path d="M7 18 L4 21 M5.5 15.5 L9 19" fill="none" stroke-linecap="round" />',
  // quyền: nắm đấm bốn ngón
  quyen:
    '<path d="M6 11 V9.5 A2.5 2.5 0 0 1 8.5 7 H15.5 A2.5 2.5 0 0 1 18 9.5 V14 A5 5 0 0 1 13 19 H11 A5 5 0 0 1 6 14 Z" /><path d="M9.5 7 V12 M12 7 V12 M14.5 7 V12" fill="none" />',
  // chưởng: bàn tay mở, bốn ngón và ngón cái
  chuong:
    '<rect x="7" y="11" width="10" height="9" rx="3" /><path d="M8.6 11 V5.5 M11 11 V3.5 M13.4 11 V3.5 M15.8 11 V5.5 M7 15 L4 12" fill="none" stroke-width="2.4" stroke-linecap="round" />',
  // chỉ: ngón điểm ra một tia, đầu có tia sáng
  chi: '<path d="M12 21 V11" fill="none" stroke-width="3.2" stroke-linecap="round" /><circle cx="12" cy="7" r="3" /><path d="M12 1.5 V2.5 M5.5 7 H6.5 M17.5 7 H18.5 M7.4 2.9 L8.1 3.6 M16.6 2.9 L15.9 3.6" fill="none" stroke-linecap="round" />',
  // ấn: con dấu lục giác có vòng tâm
  an: '<path d="M12 2.8 L19.2 7 V16.6 L12 21 L4.8 16.6 V7 Z" /><circle cx="12" cy="12" r="3.2" fill="none" />',
  // quyết: vòng xoáy bắt quyết
  quyet:
    '<path d="M12 12 A1.6 1.6 0 0 1 15.2 12 A3.6 3.6 0 0 1 8 12 A5.6 5.6 0 0 1 19.2 12 A7.6 7.6 0 0 1 4 12" fill="none" stroke-width="2.4" stroke-linecap="round" />',
  // phù: lá bùa dọc có vạch và dấu giữa (nét vẽ, không phải chữ)
  phu: '<rect x="6.8" y="2.8" width="10.4" height="18.4" rx="1.6" /><path d="M9.6 7.5 H14.4 M9.6 11 H14.4 M12 11 V17 M9.8 14.5 L12 17 L14.2 14.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />',
  // trận: vòng tròn nội tiếp tam giác
  tran: '<circle cx="12" cy="12" r="9" fill="none" /><path d="M12 4.6 L19 16.6 H5 Z" />',
  // thân pháp: mũi tên kèm vạch tốc độ
  than_phap:
    '<path d="M13 5.5 L20 12 L13 18.5" fill="none" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" /><path d="M3 8.5 H12 M1.5 12 H11 M3 15.5 H12" fill="none" stroke-linecap="round" />',
  // hộ thể: khiên
  ho_the:
    '<path d="M12 2.8 L19.2 5.8 V12 C19.2 16.8 15.6 19.8 12 21.2 C8.4 19.8 4.8 16.8 4.8 12 V5.8 Z" />',
  // khác: tia lấp lánh bốn cánh
  khac: '<path d="M12 2.5 L14.2 9.8 L21.5 12 L14.2 14.2 L12 21.5 L9.8 14.2 L2.5 12 L9.8 9.8 Z" />',
};

/** Hình đặt vào vùng giữa của khung 24 x 24: thu 0,7 và dời 3,6 (vùng 16,8 x 16,8 cách mép 3,6). */
const GLYPH_TRANSFORM = "translate(3.6 3.6) scale(0.7)";

/**
 * Khung theo phẩm 0..3 (xem đầu tệp). Nét lấy `stroke` từ thẻ `<svg>` ngoài (màu hệ); riêng chấm góc Thiên có màu vàng riêng.
 * Khung nằm ngoài nhóm hình nên độ dày nét không bị thu theo `GLYPH_TRANSFORM`.
 */
const FRAME_BY_GRADE: readonly string[] = [
  // Hoàng: một nét mảnh
  '<rect x="1.6" y="1.6" width="20.8" height="20.8" rx="4.4" fill="none" stroke-width="1" />',
  // Huyền: một nét đậm
  '<rect x="2" y="2" width="20" height="20" rx="4.4" fill="none" stroke-width="2.4" />',
  // Địa: hai nét mảnh lồng nhau
  '<rect x="1.6" y="1.6" width="20.8" height="20.8" rx="4.4" fill="none" stroke-width="1" /><rect x="3.8" y="3.8" width="16.4" height="16.4" rx="2.8" fill="none" stroke-width="1" />',
  // Thiên: nét đậm ngoài + nét mảnh trong + bốn chấm vàng ở góc
  `<rect x="2" y="2" width="20" height="20" rx="4.4" fill="none" stroke-width="2.2" /><rect x="4.4" y="4.4" width="15.2" height="15.2" rx="2.4" fill="none" stroke-width="0.9" /><g fill="${GRADE_GOLD}" fill-opacity="1" stroke="none"><circle cx="3.4" cy="3.4" r="1.5" /><circle cx="20.6" cy="3.4" r="1.5" /><circle cx="3.4" cy="20.6" r="1.5" /><circle cx="20.6" cy="20.6" r="1.5" /></g>`,
];

/** Dữ liệu chiêu đủ để vẽ: `shape` / `element` như cũ, thêm `style` / `grade` / `rarity` (thiếu thì `shared/` suy). */
export interface SkillIconDef {
  shape: unknown;
  element: unknown;
  style?: unknown;
  grade?: unknown;
  rarity?: unknown;
}

/**
 * `<svg>` của chiêu: hình theo phong cách, màu theo `element` (hệ lạ -> xám), khung theo phẩm. Giá trị lạ / độc ('constructor', '__proto__') rơi về `khac` / Hoàng,
 * không bao giờ ném lỗi và không đưa chuỗi của dữ liệu vào mã.
 */
export function skillIconSvg(def: SkillIconDef): string {
  const style = skillStyleOf(def);
  const grade = skillGradeOf({ rarity: def.rarity as SkillDef["rarity"], grade: def.grade });
  const c = elementColor(def.element);
  return (
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="${c}" fill-opacity="0.35" stroke="${c}" stroke-width="1.6">` +
    `${FRAME_BY_GRADE[grade]}` +
    `<g transform="${GLYPH_TRANSFORM}" stroke-width="2.2">${STYLE_PATH[style]}</g></svg>`
  );
}

/** Ổ khoá của ô chưa mở / chiêu thiếu cảnh giới. */
export function lockIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.8"><rect x="5.5" y="10.5" width="13" height="10" rx="2" /><path d="M8.5 10.5 V8 A3.5 3.5 0 0 1 15.5 8 V10.5" fill="none" /></svg>';
}
