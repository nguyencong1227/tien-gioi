import { describe, it, expect } from "vitest";
import { DPAD_DEADZONE, dpadVector, parseTouchScheme } from "./dpad";

describe("dpad: dpadVector (8 hướng)", () => {
  it("vùng chết và dữ liệu rác: đứng yên", () => {
    for (const [dx, dy] of [
      [0, 0],
      [DPAD_DEADZONE - 1, 0],
      [3, -4],
      [NaN, 10],
      [10, Infinity],
    ]) {
      const v = dpadVector(dx, dy);
      expect([v.x, v.y]).toEqual([0, 0]);
      expect(v.up || v.down || v.left || v.right).toBe(false);
    }
  });

  it("4 hướng chính: đúng hướng, độ dài 1 (toạ độ màn hình, y xuống)", () => {
    const cases: Array<[number, number, number, number, string]> = [
      [60, 0, 1, 0, "right"],
      [-60, 0, -1, 0, "left"],
      [0, 60, 0, 1, "down"],
      [0, -60, 0, -1, "up"],
    ];
    for (const [dx, dy, ex, ey, key] of cases) {
      const v = dpadVector(dx, dy);
      expect(v.x).toBeCloseTo(ex);
      expect(v.y).toBeCloseTo(ey);
      expect(v[key as "up" | "down" | "left" | "right"]).toBe(true);
    }
  });

  it("4 hướng chéo: chuẩn hoá (độ dài 1), sáng hai mũi tên", () => {
    const v = dpadVector(50, -50); // phải-lên
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
    expect(v.right && v.up).toBe(true);
    expect(v.left || v.down).toBe(false);
    const w = dpadVector(-50, 50); // trái-xuống
    expect(w.left && w.down).toBe(true);
  });

  it("làm tròn góc về bội 45 độ: lệch dưới 22,5 độ vẫn là hướng chính", () => {
    // 20 độ dưới trục phải => vẫn "phải"
    const a = (20 * Math.PI) / 180;
    const v = dpadVector(Math.cos(a) * 60, Math.sin(a) * 60);
    expect([v.x, v.y]).toEqual([1, 0]);
    // 30 độ => sang "phải-xuống"
    const b = (30 * Math.PI) / 180;
    const w = dpadVector(Math.cos(b) * 60, Math.sin(b) * 60);
    expect(w.x).toBeCloseTo(Math.SQRT1_2);
    expect(w.y).toBeCloseTo(Math.SQRT1_2);
  });

  it("quét đủ 360 độ: luôn ra một trong 8 hướng độ dài 1 (không NaN, không lọt chỉ số)", () => {
    for (let deg = -360; deg <= 360; deg += 3) {
      const r = (deg * Math.PI) / 180;
      const v = dpadVector(Math.cos(r) * 80, Math.sin(r) * 80);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    }
  });

  it("parseTouchScheme: chỉ nhận float / dpad, rác thì mặc định joystick nổi", () => {
    expect(parseTouchScheme("dpad")).toBe("dpad");
    expect(parseTouchScheme("float")).toBe("float");
    for (const bad of [null, undefined, "", "Dpad", 1, {}])
      expect(parseTouchScheme(bad)).toBe("float");
  });
});
