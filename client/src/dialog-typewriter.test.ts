import { describe, expect, it } from "vitest";
import { TYPE_MS_PER_CHAR, typedLength } from "./dialog-typewriter";

describe("typedLength: gõ chữ hộp thoại theo thời gian", () => {
  it("tốc độ danh nghĩa bằng bản cũ: 2 ký tự mỗi 28 ms", () => {
    expect(TYPE_MS_PER_CHAR).toBe(14);
    expect(typedLength(0, 100)).toBe(0);
    expect(typedLength(28, 100)).toBe(2);
    expect(typedLength(280, 1000)).toBe(20);
  });

  it("timer chạy thưa (khung chậm) vẫn theo kịp: một lần chạy sau 1,4 s hiện 100 ký tự", () => {
    expect(typedLength(1400, 1000)).toBe(100);
  });

  it("không vượt tổng độ dài; hết chữ khi đủ thời gian", () => {
    expect(typedLength(100000, 50)).toBe(50);
    expect(typedLength(14 * 50, 50)).toBe(50);
    expect(typedLength(14 * 50 - 1, 50)).toBe(49);
  });

  it("đầu vào xấu không ném lỗi: thời gian âm / NaN / vô hạn, tổng 0 / âm", () => {
    expect(typedLength(-5, 10)).toBe(0);
    expect(typedLength(Number.NaN, 10)).toBe(0);
    expect(typedLength(Number.POSITIVE_INFINITY, 10)).toBe(0);
    expect(typedLength(100, 0)).toBe(0);
    expect(typedLength(100, -3)).toBe(0);
    expect(typedLength(100, Number.NaN)).toBe(0);
  });

  it("tốc độ mỗi ký tự không hợp lệ thì hiện hết (không kẹt vô hạn)", () => {
    expect(typedLength(10, 20, 0)).toBe(20);
    expect(typedLength(10, 20, -1)).toBe(20);
  });
});
