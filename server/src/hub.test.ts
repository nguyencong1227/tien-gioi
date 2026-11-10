import { describe, expect, it, vi } from "vitest";
import type { ChatOut } from "@tien-gioi/shared";
import { Hub } from "./hub";

describe("Hub (kênh chung giữa các phòng)", () => {
  it("chat tới mọi phòng đã đăng ký, kể cả phòng gửi; huỷ đăng ký thì thôi nhận", () => {
    const hub = new Hub();
    const a: ChatOut[] = [];
    const b: ChatOut[] = [];
    const offA = hub.addChatSink((m) => a.push(m));
    hub.addChatSink((m) => b.push(m));
    expect(hub.chatSinkCount).toBe(2);
    hub.chat({ from: "x", text: "một" });
    offA();
    hub.chat({ from: "y", text: "hai" });
    expect(a.map((m) => m.text)).toEqual(["một"]);
    expect(b.map((m) => m.text)).toEqual(["một", "hai"]);
    expect(hub.chatSinkCount).toBe(1);
    offA(); // huỷ hai lần không sao
    expect(hub.chatSinkCount).toBe(1);
  });

  it("một phòng lỗi (đang đóng...) không làm các phòng khác mất tin và không ném ra ngoài", () => {
    const hub = new Hub();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const got: ChatOut[] = [];
    hub.addChatSink(() => {
      throw new Error("phòng đã đóng");
    });
    hub.addChatSink((m) => got.push(m));
    expect(() => hub.chat({ from: "x", text: "vẫn tới" })).not.toThrow();
    expect(got).toHaveLength(1);
    vi.restoreAllMocks();
  });
});
