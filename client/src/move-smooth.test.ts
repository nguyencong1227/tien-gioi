// Đối chiếu vị trí mượt (QUYET_DINH_M3 mục 41.3): lệch nhỏ trượt về trong ~100-150 ms, lệch lớn dịch chuyển tức thì.
import { describe, expect, it } from "vitest";
import { CORR_EPS_PX, CORR_SNAP_PX, CORR_TAU_MS, absorbJump, decayCorr } from "./move-smooth";

describe("absorbJump: vị trí vẽ không đổi ở khoảnh khắc pred nhảy", () => {
  it("pred lùi 20 px: độ lệch bù +20 nên pred + corr (vị trí vẽ) giữ nguyên", () => {
    const predBefore = 100;
    const jump = -20;
    const corr = absorbJump({ x: 0, y: 0 }, jump, 0)!;
    expect(corr).toEqual({ x: 20, y: 0 });
    expect(predBefore + jump + corr.x).toBe(predBefore); // vị trí vẽ trước = sau
  });

  it("nhảy theo cả hai trục", () => {
    expect(absorbJump({ x: 0, y: 0 }, 6, -8)).toEqual({ x: -6, y: 8 });
  });

  it("nhiều lần nhảy cộng dồn lên độ lệch còn dở", () => {
    const c1 = absorbJump({ x: 0, y: 0 }, -10, 0)!;
    const c2 = absorbJump(c1, -15, 0)!;
    expect(c2).toEqual({ x: 25, y: 0 });
  });

  it("độ lệch tích luỹ từ ngưỡng trở lên: null (dịch chuyển tức thì); dưới ngưỡng thì trượt", () => {
    expect(absorbJump({ x: 0, y: 0 }, CORR_SNAP_PX - 0.5, 0)).not.toBeNull();
    expect(absorbJump({ x: 0, y: 0 }, CORR_SNAP_PX, 0)).toBeNull(); // đúng ngưỡng: tức thì
    expect(absorbJump({ x: 0, y: 0 }, 0, -CORR_SNAP_PX - 100)).toBeNull();
    // lệch nhỏ nhiều lần mà chưa tan thì cuối cùng cũng vượt ngưỡng
    let c: { x: number; y: number } | null = { x: 0, y: 0 };
    let snapped = false;
    for (let i = 0; i < 20 && c; i++) {
      c = absorbJump(c, -12, 0);
      if (!c) snapped = true;
    }
    expect(snapped).toBe(true);
  });

  it("độ lệch ngược chiều bù trừ nhau (không tính riêng từng cú nhảy)", () => {
    const c1 = absorbJump({ x: 0, y: 0 }, -40, 0)!;
    const c2 = absorbJump(c1, 40, 0)!; // nhảy ngược lại đúng đoạn cũ
    expect(c2).toEqual({ x: 0, y: 0 });
  });

  it("số không hữu hạn (hỏng) thì null, không lan NaN ra vị trí vẽ", () => {
    expect(absorbJump({ x: 0, y: 0 }, NaN, 0)).toBeNull();
    expect(absorbJump({ x: 0, y: 0 }, 0, Infinity)).toBeNull();
    expect(absorbJump({ x: NaN, y: 0 }, 1, 0)).toBeNull();
  });
});

describe("decayCorr: tan mũ, không phụ thuộc tốc độ khung hình", () => {
  it("sau đúng một hằng thời gian còn 1/e, nội suy trong khoảng 100-150 ms người dùng yêu cầu", () => {
    const c = decayCorr({ x: 20, y: -10 }, CORR_TAU_MS);
    expect(c.x).toBeCloseTo(20 / Math.E, 9);
    expect(c.y).toBeCloseTo(-10 / Math.E, 9);
    expect(CORR_TAU_MS).toBeGreaterThanOrEqual(100);
    expect(CORR_TAU_MS).toBeLessThanOrEqual(150);
  });

  it("chia nhỏ khung hình (60 Hz, 30 Hz, 144 Hz) cho cùng kết quả sau cùng khoảng thời gian", () => {
    const run = (dt: number) => {
      let c = { x: 30, y: 0 };
      for (let t = 0; t < 240; t += dt) c = decayCorr(c, dt);
      return c.x;
    };
    expect(run(16.0)).toBeCloseTo(run(8.0), 6);
    expect(run(24.0)).toBeCloseTo(run(12.0), 6);
    expect(run(16.0)).toBeCloseTo(30 * Math.exp(-240 / CORR_TAU_MS), 6);
  });

  it("lệch 20 px còn dưới 1 px sau 0,4 giây (trượt êm, không kéo dài)", () => {
    let c = { x: 20, y: 0 };
    for (let t = 0; t < 400; t += 16) c = decayCorr(c, 16);
    expect(c.x).toBeLessThan(1);
  });

  it("tan hết trong < 1 giây ở độ lệch lớn nhất còn trượt, và đặt đúng 0 khi dưới ngưỡng nhỏ (không mang số lẻ mãi)", () => {
    let c = { x: CORR_SNAP_PX - 1, y: 0 };
    let ms = 0;
    while ((c.x !== 0 || c.y !== 0) && ms < 2000) {
      c = decayCorr(c, 16);
      ms += 16;
    }
    expect(c).toEqual({ x: 0, y: 0 });
    expect(ms).toBeLessThan(1000);
    expect(CORR_EPS_PX).toBeGreaterThan(0);
  });

  it("dt xấu (âm, 0, NaN) không đổi gì", () => {
    const c = { x: 5, y: 5 };
    for (const dt of [0, -16, NaN, Infinity * -1]) expect(decayCorr(c, dt)).toBe(c);
  });
});
