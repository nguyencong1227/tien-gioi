/**
 * Dòng chào ở chat khi vào game lần đầu (#690): lớp THUẦN, test được. Người chơi chuột / bàn phím nghe tên PHÍM đang gán; người chơi CẢM ỨNG không có
 * phím nên nghe tên NÚT (nút Nói hiện khi đứng cạnh NPC, menu ☰ ở màn hẹp, bản đồ nhỏ chạm được).
 */
export interface WelcomeKeys {
  interact: string;
  quest: string;
  map: string;
}

export function welcomeText(touch: boolean, keys: WelcomeKeys): string {
  if (touch)
    return "Chào mừng đạo hữu tới Tiên Giới. Nhận nhiệm vụ ở Trưởng trấn (đứng cạnh rồi chạm nút Nói), mở sổ nhiệm vụ ở thanh menu và chạm bản đồ nhỏ để xem bản đồ lớn.";
  return `Chào mừng đạo hữu tới Tiên Giới. Nhận nhiệm vụ ở Trưởng trấn (${keys.interact}), mở sổ nhiệm vụ (${keys.quest}) và xem bản đồ (${keys.map}).`;
}
