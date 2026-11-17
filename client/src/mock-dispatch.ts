// Phát tin của phòng GIẢ (`?skills=mock`, `?ambush=mock`, `?duel=mock`...) đúng cách colyseus.js 0.16 phát tin của phòng thật.
// colyseus.js: tin có handler riêng thì chỉ gọi handler riêng; không có thì gọi handler "*" với (loại, nội dung); không có cả hai thì BỎ.
// `captureEarlyMessages` (early-messages.ts) dựa vào handler "*" để ghi lại tin tới trước khi cảnh đăng ký xong; phòng giả mà không đi đường "*" thì tin mock gửi lúc cảnh
// còn đang tải (Phaser + WorldScene tách chunk, #1097) bị mất: `?skills=mock` gửi sổ chiêu sau 400 ms nhưng ở dev server cảnh dựng chậm hơn thế.

/** Bảng handler của phòng giả: loại tin -> danh sách hàm (handler "*" nhận thêm tham số đầu là loại). */
export type MockHandlers = Map<string, ((...args: any[]) => void)[]>;

/** Phát một tin tới handler của phòng giả. Sao chép danh sách trước khi gọi để handler tự gỡ mình giữa chừng cũng không làm hỏng vòng lặp. */
export function dispatchMockMessage(handlers: MockHandlers, type: string, msg: unknown): void {
  const typed = handlers.get(type);
  if (typed && typed.length > 0) {
    for (const fn of [...typed]) fn(msg);
    return;
  }
  for (const fn of [...(handlers.get("*") ?? [])]) fn(type, msg);
}
