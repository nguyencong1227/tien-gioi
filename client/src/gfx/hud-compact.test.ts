import { describe, expect, it } from "vitest";
import {
  COMPACT_MAX_HEIGHT,
  isCompactHud,
  parseTrackerPref,
  trackerOpen,
  type HudDisplay,
} from "./hud-compact";

const d = (form: string, orient: string, cssH: number): HudDisplay => ({ form, orient, cssH });

describe("hud-compact: isCompactHud", () => {
  it("điện thoại ngang luôn gọn", () => {
    for (const h of [360, 375, 390, 430, 600])
      expect(isCompactHud(d("phone", "landscape", h))).toBe(true);
  });
  it("điện thoại dọc: gọn khi thấp (< 700), thoáng khi cao", () => {
    expect(isCompactHud(d("phone", "portrait", 640))).toBe(true);
    expect(isCompactHud(d("phone", "portrait", COMPACT_MAX_HEIGHT - 1))).toBe(true);
    expect(isCompactHud(d("phone", "portrait", COMPACT_MAX_HEIGHT))).toBe(false);
    expect(isCompactHud(d("phone", "portrait", 844))).toBe(false);
  });
  it("tablet / máy tính không bao giờ gọn, dù thấp hay ngang", () => {
    expect(isCompactHud(d("tablet", "landscape", 600))).toBe(false);
    expect(isCompactHud(d("desktop", "landscape", 400))).toBe(false);
    expect(isCompactHud(d("desktop", "portrait", 500))).toBe(false);
  });
  it("chiều cao hỏng thì điện thoại dọc không gọn (không ép thu gọn vì số rác)", () => {
    expect(isCompactHud(d("phone", "portrait", NaN))).toBe(false);
    expect(isCompactHud(d("phone", "portrait", Infinity))).toBe(false);
  });
});

describe("hud-compact: parseTrackerPref / trackerOpen", () => {
  it("parseTrackerPref: 1 / 0, còn lại null", () => {
    expect(parseTrackerPref("1")).toBe(true);
    expect(parseTrackerPref("0")).toBe(false);
    for (const v of [null, undefined, "", "true", "2", 1, 0, {}])
      expect(parseTrackerPref(v)).toBeNull();
  });
  it("chưa chọn: theo độ gọn của máy (ngang thu gọn, dọc cao mở)", () => {
    expect(trackerOpen(null, d("phone", "landscape", 390))).toBe(false);
    expect(trackerOpen(null, d("phone", "portrait", 844))).toBe(true);
    expect(trackerOpen(null, d("phone", "portrait", 640))).toBe(false);
    expect(trackerOpen(null, d("desktop", "landscape", 720))).toBe(true);
  });
  it("đã chọn: lựa chọn của người chơi thắng ở mọi máy", () => {
    expect(trackerOpen(true, d("phone", "landscape", 390))).toBe(true);
    expect(trackerOpen(false, d("desktop", "landscape", 720))).toBe(false);
    expect(trackerOpen(false, d("phone", "portrait", 844))).toBe(false);
  });
});
