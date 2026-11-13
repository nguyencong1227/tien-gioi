// Chữ lớp phủ khi gục (chết thường: không Hoàng Tuyền, không bí cảnh, không thách đấu).
// Server hồi sinh người chơi ở TRẤN CỦA BẢN ĐỒ HIỆN TẠI (`safeSpot(w.map)` -> `map.townPx`), nên tên nơi hồi sinh là
// `GameMap.townName` (Lạc Hà Trấn, Thanh Lộ Trạm...): không chép cứng "Lạc Hà Trấn" (M6: thêm bản đồ mới).
export function respawnDeathText(townName: string, secondsLeft: number): string {
  const sec = Math.max(0, Math.ceil(secondsLeft));
  return `Hồi sinh tại ${townName} sau ${sec}s`;
}
