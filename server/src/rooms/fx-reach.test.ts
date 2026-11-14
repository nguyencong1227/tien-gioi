// `fxReachOf`: tầm vươn xa của `fx` ngoài điểm phát (WorldRoom `sendNear`): người đứng ở đầu kia vùng báo trước / đạn / chiêu vẫn nhận tin.
import { describe, expect, it } from "vitest";
import type { FxMsg } from "@tien-gioi/shared";
import { fxReachOf } from "./WorldRoom";

describe("fxReachOf (M7.3, #504)", () => {
  it("vùng báo trước đòn quái vươn r px (đường lao dài 280 px: người đứng ở đầu kia phải thấy)", () => {
    const line: FxMsg = {
      kind: "warn",
      shape: "line",
      x: 0,
      y: 0,
      r: 280,
      w: 56,
      angle: 0,
      ms: 800,
    };
    const circle: FxMsg = { kind: "warn", shape: "circle", x: 0, y: 0, r: 120, ms: 900 };
    expect(fxReachOf(line)).toBe(280);
    expect(fxReachOf(circle)).toBe(120);
  });

  it("kiếm khí / chiêu / đạn lấy `range`; hiệu ứng điểm (chém, lên cấp) là 0", () => {
    expect(fxReachOf({ kind: "sword", by: "a", x: 0, y: 0, angle: 0, range: 150 })).toBe(150);
    expect(
      fxReachOf({ kind: "cast", by: "a", skill: "hoa_van_kiem", x: 0, y: 0, angle: 0, range: 90 }),
    ).toBe(90);
    expect(fxReachOf({ kind: "bolt", x: 0, y: 0, angle: 0, speed: 200, range: 300 })).toBe(300);
    expect(fxReachOf({ kind: "slash", by: "a", x: 0, y: 0, angle: 0 })).toBe(0);
    expect(fxReachOf({ kind: "levelup", by: "a", x: 0, y: 0, major: false })).toBe(0);
  });
});
