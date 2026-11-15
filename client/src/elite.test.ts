import { describe, expect, it } from "vitest";
import {
  ELITE_SUFFIX,
  eliteAuraDims,
  eliteAuraPulse,
  eliteBarWidth,
  eliteLabelText,
  eliteName,
  isElite,
} from "./elite";

describe("elite: nhận biết và tên hiển thị", () => {
  it("isElite: số hữu hạn >= 1 mới là tinh anh; 0 / rác / máy chủ cũ (undefined) là quái thường", () => {
    expect(isElite(1)).toBe(true);
    expect(isElite(2)).toBe(true); // bậc sau (nếu có) vẫn nổi bật như tinh anh
    for (const v of [0, -1, 0.5, NaN, Infinity, undefined, null, "1", true, {}, []])
      expect(isElite(v), String(v)).toBe(false);
  });

  it("eliteName: thêm hậu tố cho tinh anh, quái thường giữ nguyên, không thêm hai lần", () => {
    expect(eliteName("Hôi Lang", true)).toBe("Hôi Lang tinh anh");
    expect(eliteName("Hôi Lang", false)).toBe("Hôi Lang");
    expect(eliteName("Hôi Lang tinh anh", true)).toBe("Hôi Lang tinh anh");
    expect(eliteName(undefined as unknown as string, true)).toBe(ELITE_SUFFIX);
    expect(ELITE_SUFFIX).toBe(" tinh anh");
  });

  it("eliteLabelText: sao + tên + hậu tố", () => {
    expect(eliteLabelText("Cốt Tượng")).toBe("★ Cốt Tượng tinh anh");
  });
});

describe("elite: kích cỡ và nhịp", () => {
  it("thanh máu to hơn quái thường (max(24, 2r)) và có sàn 40; bán kính lạ không NaN", () => {
    for (const r of [10, 14, 22, 40]) expect(eliteBarWidth(r)).toBeGreaterThan(Math.max(24, r * 2));
    expect(eliteBarWidth(5)).toBe(40);
    for (const r of [NaN, -3, 0, Infinity]) expect(eliteBarWidth(r)).toBeGreaterThanOrEqual(40);
  });

  it("vầng sáng rộng hơn bóng thường và cùng độ cao chân", () => {
    for (const r of [10, 14, 22, 40]) {
      const a = eliteAuraDims(r);
      expect(a.w).toBeGreaterThan(Math.max(16, Math.round(r * 2.3)));
      expect(a.h).toBeGreaterThan(0);
      expect(a.y).toBe(Math.round(r * 0.95));
    }
  });

  it("eliteAuraPulse: nở nhẹ + sáng theo sóng; giảm chuyển động / số lạ thì đứng yên; luôn trong khoảng thấy được", () => {
    const lo = eliteAuraPulse(0, false);
    const hi = eliteAuraPulse(1, false);
    expect(lo.scale).toBe(1);
    expect(hi.scale).toBeGreaterThan(lo.scale);
    expect(hi.alpha).toBeGreaterThan(lo.alpha);
    expect(lo.alpha).toBeGreaterThan(0.3); // thấp nhất vẫn thấy từ xa
    expect(eliteAuraPulse(0.7, true)).toEqual({ scale: 1, alpha: 0.5 });
    expect(eliteAuraPulse(NaN, false)).toEqual({ scale: 1, alpha: 0.5 });
    expect(eliteAuraPulse(5, false)).toEqual(hi); // kẹp
    expect(eliteAuraPulse(-5, false)).toEqual(lo);
  });
});
