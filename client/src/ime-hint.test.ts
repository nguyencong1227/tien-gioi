import { describe, expect, it } from "vitest";
import {
  IME_BACKSPACE_MS,
  IME_HINT_SCORE,
  IME_HINT_TEXT,
  IME_HINT_WINDOW_MS,
  ImeSniffer,
  type ImeKey,
} from "./ime-hint";

const down = (code: string, at: number, extra: Partial<ImeKey> = {}): ImeKey => ({
  type: "down",
  code,
  key: "x",
  typing: false,
  at,
  ...extra,
});
const up = (code: string, at: number, wasHeld: boolean, extra: Partial<ImeKey> = {}): ImeKey => ({
  type: "up",
  code,
  typing: false,
  wasHeld,
  at,
  ...extra,
});

describe("ImeSniffer: gợi ý khi bộ gõ kiểu hook chèn Backspace / chữ có dấu", () => {
  it("chơi bình thường (giữ W A S D, nhả đúng): KHÔNG gợi ý", () => {
    const s = new ImeSniffer();
    let fired = false;
    for (let i = 0; i < 200; i++) {
      for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp"]) {
        fired ||= s.feed(down(code, i * 100));
        fired ||= s.feed(up(code, i * 100 + 40, true));
      }
    }
    expect(fired).toBe(false);
  });

  it("Unikey Telex: W rồi Backspace + 'ư' (code rỗng, keyCode 231) lặp lại: gợi ý MỘT lần", () => {
    const s = new ImeSniffer();
    const fired: boolean[] = [];
    let t = 0;
    for (let i = 0; i < 3; i++) {
      fired.push(s.feed(down("KeyW", t)));
      fired.push(s.feed(down("Backspace", t + 20))); // bộ gõ xoá chữ vừa gõ
      fired.push(s.feed(down("", t + 30, { key: "ư", keyCode: 231 }))); // rồi chèn chữ có dấu
      t += 400;
    }
    expect(fired.filter(Boolean)).toHaveLength(1);
    // đã gợi ý: không bao giờ gợi ý lại
    expect(s.feed(down("", t, { key: "â", keyCode: 231 }))).toBe(false);
    expect(s.alreadyShown).toBe(true);
  });

  it("keyup của phím di chuyển KHÔNG có keydown (bộ gõ nuốt keydown): đếm dấu hiệu, đủ ngưỡng thì gợi ý", () => {
    const s = new ImeSniffer();
    expect(s.feed(up("KeyD", 0, false))).toBe(false);
    expect(s.feed(up("KeyA", 500, false))).toBe(false);
    expect(s.feed(up("KeyW", 1000, false))).toBe(true);
  });

  it("Backspace lâu sau phím chữ (người chơi tự bấm) không phải dấu hiệu", () => {
    const s = new ImeSniffer();
    for (let i = 0; i < 20; i++) {
      s.feed(down("KeyW", i * 1000));
      expect(s.feed(down("Backspace", i * 1000 + IME_BACKSPACE_MS + 50))).toBe(false);
    }
  });

  it("đang gõ chữ ở ô chat (typing): không đếm, dù có Backspace và chữ có dấu", () => {
    const s = new ImeSniffer();
    for (let i = 0; i < 10; i++) {
      expect(s.feed(down("KeyW", i * 50, { typing: true }))).toBe(false);
      expect(s.feed(down("Backspace", i * 50 + 10, { typing: true }))).toBe(false);
      expect(s.feed(down("", i * 50 + 20, { key: "ư", keyCode: 231, typing: true }))).toBe(false);
    }
  });

  it("dấu hiệu rải rác quá lâu (ngoài cửa sổ) không cộng dồn", () => {
    const s = new ImeSniffer();
    for (let i = 0; i < IME_HINT_SCORE + 2; i++)
      expect(s.feed(up("KeyD", i * (IME_HINT_WINDOW_MS + 1), false))).toBe(false);
  });

  it("bộ gõ Windows (key 'Process', keyCode 229, code ĐÚNG) không phải dấu hiệu: đã đi được, không cần gợi ý", () => {
    const s = new ImeSniffer();
    let fired = false;
    for (let i = 0; i < 100; i++) {
      fired ||= s.feed(down("KeyD", i * 60, { key: "Process", keyCode: 229 }));
      fired ||= s.feed(up("KeyD", i * 60 + 30, true));
    }
    expect(fired).toBe(false);
  });

  it("modifier và phím lạ không có code không bị tính nhầm (Shift / Control / Alt)", () => {
    const s = new ImeSniffer();
    for (let i = 0; i < 20; i++) {
      for (const key of ["Shift", "Control", "Alt"])
        expect(s.feed(down("", i * 10, { key, keyCode: 16 }))).toBe(false);
    }
  });

  it("lời gợi ý nêu cách xử lý (tắt bộ gõ hoặc dùng phím mũi tên)", () => {
    expect(IME_HINT_TEXT).toContain("bộ gõ");
    expect(IME_HINT_TEXT).toContain("mũi tên");
  });
});
