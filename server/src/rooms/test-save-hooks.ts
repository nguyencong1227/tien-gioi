// Chen vào việc LƯU HỒ SƠ của phòng trong test tích hợp (server Colyseus thật): làm cửa sổ đua TẤT ĐỊNH thay vì phụ thuộc tốc độ đĩa của máy chạy test (#752).
// Dùng ở `WorldRoom.sect.test.ts` và `WorldRoom.sect-vault-stress.test.ts`. Máy chủ giữ khoá "một thao tác tông môn một lúc" của từng người cho tới khi lưu xong,
// mà túi đồ đổi TRƯỚC lúc lưu; và ảnh chụp tông môn / kho chỉ gửi SAU lúc lưu: test chờ sai tín hiệu (túi đổi, hoặc ngủ một khoảng cố định rồi đọc ảnh chụp cũ)
// đỏ ngay khi lưu chậm hơn một chút (đĩa chậm, CI tải nặng), còn ở máy rảnh thì hiếm khi thấy.
import { matchMaker } from "colyseus";
import type { Room } from "colyseus.js";

const undos: (() => void)[] = [];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Kho hồ sơ của phòng phía máy chủ (`WorldRoom.players` hoặc kho tệp mặc định), tìm theo phòng của client. */
function playersOf(room: Room): { save: (...args: unknown[]) => Promise<unknown> } {
  return (matchMaker.getLocalRoomById(room.roomId) as unknown as { players: never }).players;
}

/** Chen `wait` chạy trước MỖI lần lưu thật; `release` chạy khi khôi phục (đừng để lưu nào kẹt lại khi ca kết thúc giữa chừng). Khôi phục bằng `restoreSaves()`. */
export function delaySave(
  room: Room,
  wait: (savedName?: string) => Promise<unknown>,
  release: () => void = () => {},
) {
  const players = playersOf(room);
  const real = players.save;
  players.save = async (...args: unknown[]) => {
    const rec = args[0] as { name?: unknown } | undefined;
    await wait(typeof rec?.name === "string" ? rec.name : undefined); // tên hồ sơ đang lưu: để làm chậm riêng một số người
    return real.apply(players, args);
  };
  undos.push(() => {
    release();
    players.save = real;
  });
}

/** Mọi lần lưu hồ sơ chậm thêm `ms` (mô phỏng đĩa chậm / máy tải nặng). */
export const slowSave = (room: Room, ms: number) => delaySave(room, () => sleep(ms));

/** Chỉ việc lưu hồ sơ của các nhân vật có tên trong `names` chậm thêm `ms` (người khác lưu ngay): dựng thứ tự hoàn thành NGƯỢC thứ tự bắt đầu. */
export const slowSaveFor = (room: Room, ms: number, names: readonly string[]) =>
  delaySave(room, (name) =>
    name !== undefined && names.includes(name) ? sleep(ms) : Promise.resolve(),
  );

/** Mọi lần lưu hồ sơ ĐỨNG yên cho tới khi gọi hàm trả về (test chủ động quyết định lúc nào lưu xong, không dùng đồng hồ). */
export function gateSave(room: Room): () => void {
  let open = () => {};
  const gate = new Promise<void>((r) => (open = r));
  delaySave(
    room,
    () => gate,
    () => open(),
  );
  return () => open();
}

/** Trả việc lưu về bình thường (gọi ở afterEach, TRƯỚC khi đóng phòng: đóng phòng cũng lưu hồ sơ). Khôi phục theo thứ tự NGƯỢC (các lớp bọc lồng nhau). */
export function restoreSaves() {
  for (const undo of undos.splice(0).reverse()) undo();
}
