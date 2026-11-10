import { describe, expect, it } from "vitest";
import type { Room } from "colyseus.js";
import { captureEarlyMessages, replayEarlyMessages } from "./early-messages";

/** Phòng giả mô phỏng colyseus.js 0.16: tin có handler riêng thì gọi handler riêng; không thì gọi "*"; không có cả hai thì BỎ. */
function fakeRoom() {
  const handlers = new Map<string, (...a: any[]) => void>();
  const room = {
    onMessage(type: string, cb: (...a: any[]) => void) {
      handlers.set(type, cb);
      return () => handlers.delete(type);
    },
  } as unknown as Room;
  const receive = (type: string, msg: unknown) => {
    const h = handlers.get(type);
    if (h) h(msg);
    else handlers.get("*")?.(type, msg);
  };
  return { room, receive, handlers };
}

describe("tin server gửi ngay lúc vào phòng, tới trước khi cảnh đăng ký handler", () => {
  it("không mất tin: ghi lại rồi phát lại đúng thứ tự cho handler cùng loại", () => {
    const { room, receive } = fakeRoom();
    captureEarlyMessages(room);
    receive("inv", { n: 1 });
    receive("wallet", { coin: 5 });
    receive("limbo", { duyen: 25 });
    receive("inv", { n: 2 });
    const got: [string, unknown][] = [];
    const handlers = {
      inv: (m: unknown) => got.push(["inv", m]),
      wallet: (m: unknown) => got.push(["wallet", m]),
      limbo: (m: unknown) => got.push(["limbo", m]),
    };
    replayEarlyMessages(room, handlers);
    expect(got).toEqual([
      ["inv", { n: 1 }],
      ["wallet", { coin: 5 }],
      ["limbo", { duyen: 25 }],
      ["inv", { n: 2 }],
    ]);
  });

  it("loại không có handler thì bỏ (không ném lỗi); sau khi phát lại không còn ghi nữa", () => {
    const { room, receive, handlers } = fakeRoom();
    captureEarlyMessages(room);
    receive("la", { x: 1 });
    const got: unknown[] = [];
    room.onMessage("inv", (m: unknown) => got.push(m)); // cảnh đăng ký handler thật
    replayEarlyMessages(room, { inv: (m) => got.push(m) });
    expect(got).toEqual([]);
    expect(handlers.has("*")).toBe(false); // đã gỡ handler "*"
    receive("inv", { n: 3 }); // tin sau đó đi thẳng tới handler riêng
    expect(got).toEqual([{ n: 3 }]);
  });

  it("gọi phát lại lần hai hoặc cho phòng chưa ghi thì không làm gì", () => {
    const { room, receive } = fakeRoom();
    const calls: unknown[] = [];
    replayEarlyMessages(room, { inv: (m) => calls.push(m) }); // chưa capture
    captureEarlyMessages(room);
    receive("inv", { n: 1 });
    replayEarlyMessages(room, { inv: (m) => calls.push(m) });
    replayEarlyMessages(room, { inv: (m) => calls.push(m) });
    expect(calls).toEqual([{ n: 1 }]);
  });
});
