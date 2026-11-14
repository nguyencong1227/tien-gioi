// Biểu tượng chiêu thức vẽ bằng mã (M7.6, #507): CHƯA có hình từ nguồn (M7.8 / #509), nên mỗi chiêu là một hình theo `shape` (hướng đánh) tô màu theo
// `element` (hệ). Không chữ Hán, không tài sản ngoài. Khi có ảnh `vktt/` thì thay MỘT chỗ này (`skillIconSvg`), ô chiêu vẫn đúng.
// Chuỗi trả về là hằng cố định ghép với MỘT màu lấy từ bảng `ELEMENT_COLOR` (không bao giờ chứa dữ liệu từ tin nhắn) nên gán `innerHTML` an toàn.
import type { SkillShape } from "@tien-gioi/shared";
import { elementColor } from "./skill-bar";

/** Hình theo kiểu đánh, hệ toạ độ 24 x 24 (gốc ở giữa-dưới: chiêu "hướng lên"). Thứ tự khoá theo `SkillShape`. */
const SHAPE_PATH: Readonly<Record<SkillShape, string>> = {
  // quạt hẹp mở rộng ra phía trước
  cone: '<path d="M12 21 L3.5 6.5 Q12 2 20.5 6.5 Z" />',
  // tia thẳng có mũi
  line: '<path d="M12 2.5 L16.5 8 H13.5 V21 H10.5 V8 H7.5 Z" />',
  // ba tia toả ra
  fan: '<path d="M12 21 L4 7 M12 21 L12 3.5 M12 21 L20 7" fill="none" stroke-width="2.6" stroke-linecap="round" />',
  // vòng nổ quanh mình
  nova: '<circle cx="12" cy="12" r="8" fill="none" stroke-width="2.6" /><circle cx="12" cy="12" r="2.6" />',
  // vùng đặt xuống đất (elip nét đứt + chấm tâm)
  ground:
    '<ellipse cx="12" cy="14" rx="9" ry="5.2" fill="none" stroke-width="2.4" stroke-dasharray="4 2.6" /><circle cx="12" cy="14" r="2" />',
  // hai mũi tên lao tới
  dash: '<path d="M4.5 5.5 L11 12 L4.5 18.5 M12.5 5.5 L19 12 L12.5 18.5" fill="none" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />',
  // hộ thể: khiên
  self: '<path d="M12 2.8 L19.2 5.8 V12 C19.2 16.8 15.6 19.8 12 21.2 C8.4 19.8 4.8 16.8 4.8 12 V5.8 Z" />',
};

/** `<svg>` của chiêu: hình theo `shape`, màu theo `element` (hình lạ -> `nova`, hệ lạ -> xám). */
export function skillIconSvg(def: { shape: unknown; element: unknown }): string {
  const key =
    typeof def.shape === "string" && Object.hasOwn(SHAPE_PATH, def.shape) ? def.shape : "nova";
  const c = elementColor(def.element);
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="${c}" fill-opacity="0.35" stroke="${c}" stroke-width="1.6">${SHAPE_PATH[key as SkillShape]}</svg>`;
}

/** Ổ khoá của ô chưa mở / chiêu thiếu cảnh giới. */
export function lockIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.8"><rect x="5.5" y="10.5" width="13" height="10" rx="2" /><path d="M8.5 10.5 V8 A3.5 3.5 0 0 1 15.5 8 V10.5" fill="none" /></svg>';
}
