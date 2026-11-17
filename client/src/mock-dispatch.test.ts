import { describe, expect, it } from "vitest";
import type { Room } from "colyseus.js";
import { dispatchMockMessage, type MockHandlers } from "./mock-dispatch";
import { captureEarlyMessages, replayEarlyMessages } from "./early-messages";

describe("phát tin của phòng giả (như colyseus.js)", () => {
  it("tin có handler riêng: chỉ handler riêng nhận, handler '*' KHÔNG nhận", () => {
    const got: unknown[] = [];
    const star: unknown[] = [];
    const h: MockHandlers = new Map([
      ["skills", [(m) => got.push(m)]],
      ["*", [(t, m) => star.push([t, m])]],
    ]);
    dispatchMockMessage(h, "skills", { a: 1 });
    expect(got).toEqual([{ a: 1 }]);
    expect(star).toEqual([]);
  });

  it("tin chưa có handler riêng: đi vào handler '*' kèm loại", () => {
    const star: unknown[] = [];
    const h: MockHandlers = new Map([["*", [(t, m) => star.push([t, m])]]]);
    dispatchMockMessage(h, "skills", { a: 1 });
    expect(star).toEqual([["skills", { a: 1 }]]);
  });

  it("không có handler nào: bỏ êm, không ném lỗi", () => {
    expect(() => dispatchMockMessage(new Map(), "skills", {})).not.toThrow();
    // danh sách rỗng (handler riêng đã gỡ hết) cũng coi như chưa có handler riêng
    const star: unknown[] = [];
    const h: MockHandlers = new Map([
      ["skills", []],
      ["*", [(t) => star.push(t)]],
    ]);
    dispatchMockMessage(h, "skills", {});
    expect(star).toEqual(["skills"]);
  });

  it("handler tự gỡ mình giữa chừng không làm bỏ sót handler sau", () => {
    const order: number[] = [];
    const list: ((m: unknown) => void)[] = [];
    list.push(() => {
      order.push(1);
      list.splice(0, 1);
    });
    list.push(() => order.push(2));
    dispatchMockMessage(new Map([["x", list]]), "x", null);
    expect(order).toEqual([1, 2]);
  });

  it("đúng ca lỗi ?skills=mock: tin phát TRƯỚC khi cảnh đăng ký vẫn tới tay cảnh nhờ captureEarlyMessages", () => {
    const handlers: MockHandlers = new Map();
    const room = {
      onMessage(type: string, cb: (...a: any[]) => void) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type)!.push(cb);
        return () => {
          const l = handlers.get(type)!;
          l.splice(l.indexOf(cb), 1);
        };
      },
    } as unknown as Room;
    captureEarlyMessages(room);
    dispatchMockMessage(handlers, "skills", { slots: ["a"] }); // cảnh chưa dựng xong
    const got: unknown[] = [];
    replayEarlyMessages(room, { skills: (m) => got.push(m) });
    expect(got).toEqual([{ slots: ["a"] }]);
  });
});
