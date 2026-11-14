import { describe, expect, it } from "vitest";
import {
  CHAT_PREF_KEY,
  COMPACT_MAX_WIDTH,
  PARTY_PREF_KEY,
  isCompactHud,
  panelOpen,
  TRACKER_PREF_KEY,
  parseTrackerPref,
  trackerOpen,
  type HudDisplay,
} from "./hud-compact";

const d = (form: string, orient: string, cssH: number, cssW?: number): HudDisplay => ({
  form,
  orient,
  cssH,
  cssW,
});

describe("hud-compact: isCompactHud", () => {
  it("điện thoại ngang luôn gọn", () => {
    for (const h of [360, 375, 390, 430, 600])
      expect(isCompactHud(d("phone", "landscape", h))).toBe(true);
  });
  it("điện thoại dọc luôn gọn, cao bao nhiêu cũng vậy (cửa sổ 550x900 và 412x915 không được xếp ba bảng chồng nhau)", () => {
    for (const h of [640, 699, 700, 844, 900, 915])
      expect(isCompactHud(d("phone", "portrait", h))).toBe(true);
  });
  it("máy tính / máy tính bảng đủ rộng không bao giờ gọn, dù thấp hay ngang", () => {
    expect(isCompactHud(d("tablet", "landscape", 600, 1024))).toBe(false);
    expect(isCompactHud(d("desktop", "landscape", 400, 1366))).toBe(false);
    expect(isCompactHud(d("desktop", "portrait", 1000, COMPACT_MAX_WIDTH))).toBe(false);
  });
  it("máy tính / máy tính bảng nhưng cửa sổ hẹp (< 700 px rộng) thì gọn", () => {
    expect(isCompactHud(d("desktop", "portrait", 900, 650))).toBe(true);
    expect(isCompactHud(d("tablet", "portrait", 1000, COMPACT_MAX_WIDTH - 1))).toBe(true);
  });
  it("thiếu / hỏng chiều rộng thì chỉ xét loại máy (không ép thu gọn vì số rác)", () => {
    expect(isCompactHud(d("desktop", "landscape", 720))).toBe(false);
    expect(isCompactHud(d("desktop", "landscape", 720, NaN))).toBe(false);
    expect(isCompactHud(d("desktop", "landscape", 720, Infinity))).toBe(false);
    expect(isCompactHud(d("phone", "portrait", NaN, NaN))).toBe(true);
  });
});

describe("hud-compact: parseTrackerPref / trackerOpen", () => {
  it("parseTrackerPref: 1 / 0, còn lại null", () => {
    expect(parseTrackerPref("1")).toBe(true);
    expect(parseTrackerPref("0")).toBe(false);
    for (const v of [null, undefined, "", "true", "2", 1, 0, {}])
      expect(parseTrackerPref(v)).toBeNull();
  });
  it("chưa chọn: theo độ gọn của máy (điện thoại và cửa sổ hẹp thu gọn, máy tính rộng mở)", () => {
    expect(trackerOpen(null, d("phone", "landscape", 390))).toBe(false);
    expect(trackerOpen(null, d("phone", "portrait", 844))).toBe(false);
    expect(trackerOpen(null, d("phone", "portrait", 640))).toBe(false);
    expect(trackerOpen(null, d("desktop", "portrait", 900, 550))).toBe(false);
    expect(trackerOpen(null, d("desktop", "landscape", 720, 1280))).toBe(true);
  });
  it("đã chọn: lựa chọn của người chơi thắng ở mọi máy", () => {
    expect(trackerOpen(true, d("phone", "landscape", 390))).toBe(true);
    expect(trackerOpen(false, d("desktop", "landscape", 720))).toBe(false);
    expect(trackerOpen(false, d("phone", "portrait", 844))).toBe(false);
  });
});

describe("hud-compact: panelOpen và khoá lưu", () => {
  it("panelOpen = trackerOpen: một quy tắc cho Nhiệm vụ, Tổ đội, Chat", () => {
    expect(panelOpen(null, d("phone", "portrait", 900))).toBe(false);
    expect(panelOpen(null, d("desktop", "landscape", 768, 1366))).toBe(true);
    expect(panelOpen(true, d("phone", "portrait", 900))).toBe(true);
    expect(panelOpen(false, d("desktop", "landscape", 768, 1366))).toBe(false);
  });
  it("ba khoá lưu khác nhau", () => {
    expect(new Set([TRACKER_PREF_KEY, PARTY_PREF_KEY, CHAT_PREF_KEY]).size).toBe(3);
  });
});
