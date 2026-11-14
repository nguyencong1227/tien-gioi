import { describe, expect, it } from "vitest";
import { moveVector, type MoveInput } from "./move-input";

const base: MoveInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  keyboardBlocked: false,
  joystick: { active: false, x: 0, y: 0 },
};
const mv = (o: Partial<MoveInput>) => moveVector({ ...base, ...o });

describe("moveVector (#463)", () => {
  it("bàn phím: bốn hướng, hai hướng ngược nhau triệt tiêu", () => {
    expect(mv({ right: true })).toEqual({ dx: 1, dy: 0 });
    expect(mv({ up: true })).toEqual({ dx: 0, dy: -1 });
    expect(mv({ left: true, right: true })).toEqual({ dx: 0, dy: 0 });
  });
  it("đi chéo được chuẩn hoá (không nhanh hơn)", () => {
    const v = mv({ right: true, down: true });
    expect(Math.hypot(v.dx, v.dy)).toBeCloseTo(1, 10);
  });
  it("bảng mở: bàn phím đứng yên", () => {
    expect(mv({ right: true, down: true, keyboardBlocked: true })).toEqual({ dx: 0, dy: 0 });
  });
  it("CẢM ỨNG không đổi: bảng mở mà đang kéo cần điều khiển ảo thì vẫn đi theo cần", () => {
    expect(mv({ keyboardBlocked: true, joystick: { active: true, x: 0.5, y: -0.25 } })).toEqual({
      dx: 0.5,
      dy: -0.25,
    });
  });
  it("cần điều khiển ảo thắng bàn phím; cần không kéo thì bàn phím vẫn dùng được", () => {
    expect(mv({ right: true, joystick: { active: true, x: -1, y: 0 } })).toEqual({
      dx: -1,
      dy: 0,
    });
    expect(mv({ right: true, joystick: { active: false, x: -1, y: 0 } })).toEqual({
      dx: 1,
      dy: 0,
    });
  });
  it("cần kéo quá 1 thì kẹp về độ dài 1", () => {
    const v = mv({ joystick: { active: true, x: 3, y: 4 } });
    expect(v.dx).toBeCloseTo(0.6, 10);
    expect(v.dy).toBeCloseTo(0.8, 10);
  });
});
