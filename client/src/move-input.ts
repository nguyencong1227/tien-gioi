/**
 * Vector di chuyển từ phím + cần điều khiển ảo (thuần để test). Quy tắc (#463, review của A ở #468):
 *  - bảng / hộp thoại đang mở (`keyboardBlocked`): BÀN PHÍM không đi (mũi tên dành cho điều hướng bảng, WASD không làm gì);
 *  - cần điều khiển ảo giữ nguyên hành vi cảm ứng: đang kéo thì luôn đi theo cần, kể cả khi có bảng mở (`#joyzone` vẫn chạm được ngoài phần bảng phủ lên);
 *  - cần điều khiển ảo thắng bàn phím khi cả hai cùng có; độ dài vector kẹp về 1 (đi chéo không nhanh hơn).
 */
export interface MoveInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Bảng / hộp thoại mở: bỏ qua bàn phím */
  keyboardBlocked: boolean;
  joystick: { active: boolean; x: number; y: number };
}

export function moveVector(i: MoveInput): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  if (!i.keyboardBlocked) {
    dx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    dy = (i.down ? 1 : 0) - (i.up ? 1 : 0);
  }
  if (i.joystick.active) {
    dx = i.joystick.x;
    dy = i.joystick.y;
  }
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  return { dx, dy };
}
