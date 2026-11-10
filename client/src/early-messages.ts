// Server gửi vài tin ngay lúc vào phòng (inv, quests, wallet, soul, limbo, party...), nhưng Phaser chỉ dựng xong cảnh
// (và đăng ký onMessage) sau vài trăm ms tới vài giây, mà colyseus.js BỎ tin không có handler ("onMessage() not
// registered"). Ghi lại các tin tới sớm rồi phát lại khi cảnh đăng ký xong.
import type { Room } from "colyseus.js";

interface Early {
  queue: [string, unknown][];
  off: () => void;
}
const pending = new WeakMap<Room, Early>();

/** Gọi NGAY sau khi vào phòng (trước mọi `await`). */
export function captureEarlyMessages(room: Room) {
  const queue: [string, unknown][] = [];
  const off = room.onMessage("*", (type, msg) => {
    queue.push([String(type), msg]);
  });
  pending.set(room, { queue, off });
}

/** Phát lại các tin đã ghi cho handler cùng loại (bỏ loại không có handler). Gọi sau khi đã đăng ký xong mọi handler. */
export function replayEarlyMessages(room: Room, handlers: Record<string, (msg: any) => void>) {
  const early = pending.get(room);
  if (!early) return;
  pending.delete(room);
  early.off();
  for (const [type, msg] of early.queue) handlers[type]?.(msg);
}
