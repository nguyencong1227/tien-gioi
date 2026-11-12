import { describe, expect, it } from "vitest";
import {
  SWIPE_CLOSE_FRAC,
  SWIPE_FLICK_MIN_PX,
  SWIPE_FLICK_V,
  SWIPE_START_PX,
  dragOffset,
  shouldCloseSwipe,
  swipeAxis,
  swipeIntent,
  swipeVelocity,
} from "./sheet-swipe";

describe("kéo để đóng tấm (sheet-swipe)", () => {
  it("trục đóng: dọc vuốt xuống, ngang vuốt sang phải", () => {
    expect(swipeAxis("portrait")).toBe("y");
    expect(swipeAxis("landscape")).toBe("x");
    expect(swipeAxis(undefined)).toBe("y");
  });

  it("độ dịch chỉ theo chiều đóng, ngược chiều và số rác là 0", () => {
    expect(dragOffset(5, 120, "y")).toBe(120);
    expect(dragOffset(120, 5, "x")).toBe(120);
    expect(dragOffset(0, -50, "y")).toBe(0);
    expect(dragOffset(-50, 0, "x")).toBe(0);
    expect(dragOffset(NaN, NaN, "y")).toBe(0);
    expect(dragOffset(Infinity, Infinity, "x")).toBe(0);
  });

  it("ý định: chưa đủ ngưỡng thì chờ, đúng chiều + trục chính thì kéo, còn lại bỏ qua", () => {
    expect(swipeIntent(1, SWIPE_START_PX - 2, "y")).toBe("pending");
    expect(swipeIntent(3, 40, "y")).toBe("drag");
    expect(swipeIntent(40, 3, "x")).toBe("drag");
    // ngược chiều đóng
    expect(swipeIntent(0, -40, "y")).toBe("ignore");
    expect(swipeIntent(-40, 0, "x")).toBe("ignore");
    // vuốt ngang trên tấm dọc / vuốt dọc trên ngăn kéo ngang: cử chỉ khác
    expect(swipeIntent(60, 20, "y")).toBe("ignore");
    expect(swipeIntent(20, 60, "x")).toBe("ignore");
    expect(swipeIntent(NaN, 10, "y")).toBe("ignore");
  });

  it("thả: đủ xa thì đóng, ngắn thì trả về, vuốt nhanh thì đóng dù chưa đủ xa", () => {
    const size = 800;
    expect(shouldCloseSwipe(size * SWIPE_CLOSE_FRAC, size, 0)).toBe(true);
    expect(shouldCloseSwipe(size * SWIPE_CLOSE_FRAC - 1, size, 0)).toBe(false);
    expect(shouldCloseSwipe(SWIPE_FLICK_MIN_PX, size, SWIPE_FLICK_V)).toBe(true);
    // nhanh nhưng mới đi rất ngắn (rung tay): không đóng
    expect(shouldCloseSwipe(SWIPE_FLICK_MIN_PX - 1, size, SWIPE_FLICK_V * 3)).toBe(false);
    // chậm và ngắn
    expect(shouldCloseSwipe(60, size, SWIPE_FLICK_V - 0.1)).toBe(false);
    // dữ liệu rác không đóng
    expect(shouldCloseSwipe(NaN, size, 0)).toBe(false);
    expect(shouldCloseSwipe(500, 0, 0)).toBe(false);
    expect(shouldCloseSwipe(500, NaN, 0)).toBe(false);
  });

  it("vận tốc: chỉ tính phần cuối cử chỉ, ít hơn 2 mẫu = 0", () => {
    expect(swipeVelocity([])).toBe(0);
    expect(swipeVelocity([{ t: 0, v: 0 }])).toBe(0);
    // 100 px trong 100 ms = 1 px/ms
    expect(
      swipeVelocity([
        { t: 0, v: 0 },
        { t: 100, v: 100 },
      ]),
    ).toBeCloseTo(1, 5);
    // đứng yên lâu rồi mới vuốt nhanh ở cuối: chỉ tính đoạn cuối (cửa sổ 120 ms)
    expect(
      swipeVelocity([
        { t: 0, v: 0 },
        { t: 1000, v: 10 },
        { t: 1050, v: 60 },
        { t: 1100, v: 110 },
      ]),
    ).toBeCloseTo(100 / 100, 5);
    // cùng thời điểm: không chia cho 0
    expect(
      swipeVelocity([
        { t: 5, v: 0 },
        { t: 5, v: 50 },
      ]),
    ).toBe(0);
  });
});
