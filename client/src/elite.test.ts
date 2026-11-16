import { describe, expect, it } from "vitest";
import {
  ELITE_PARTY_HINT,
  ELITE_SUFFIX,
  EliteHintGate,
  eliteAuraDims,
  eliteAuraPulse,
  eliteBarWidth,
  eliteLabelText,
  eliteName,
  eliteSightText,
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

describe("elite: gợi ý nên đi đội (mục 22.2)", () => {
  it("lời thông báo có sao, tên đủ hậu tố và gợi ý; không thêm hậu tố hai lần", () => {
    expect(eliteSightText("Độc Tước")).toBe("★ Độc Tước tinh anh: nên đi đội.");
    expect(eliteSightText("Độc Tước tinh anh")).toBe("★ Độc Tước tinh anh: nên đi đội.");
    expect(ELITE_PARTY_HINT).toBe("nên đi đội");
  });

  it("nhắc đúng MỘT lần cho mỗi loài, loài khác vẫn được nhắc", () => {
    const g = new EliteHintGate();
    expect(g.take("doc_tuoc", 0)).toBe(true);
    expect(g.take("doc_tuoc", 0)).toBe(false);
    expect(g.take("doc_tuoc", 1)).toBe(false);
    expect(g.take("han_lang", 1)).toBe(true);
  });

  it("đang đi đội (>= 2 người) thì không nhắc và KHÔNG ghi nhớ: rời đội gặp lại thì vẫn nhắc", () => {
    const g = new EliteHintGate();
    expect(g.take("doc_tuoc", 2)).toBe(false);
    expect(g.take("doc_tuoc", 4)).toBe(false);
    expect(g.take("doc_tuoc", 1)).toBe(true);
    expect(g.take("doc_tuoc", 1)).toBe(false);
  });

  it("đội một người (chỉ mình) vẫn là đi một mình; số đội rác không chặn nhắc", () => {
    const g = new EliteHintGate();
    expect(g.take("a", 1)).toBe(true);
    for (const [i, n] of [NaN, -1, -Infinity].entries())
      expect(g.take(`k${i}`, n), String(n)).toBe(true);
  });

  it("loài rỗng / không phải chuỗi bị bỏ qua, không làm hỏng cổng", () => {
    const g = new EliteHintGate();
    for (const k of ["", undefined, null, 3, {}]) expect(g.take(k, 0), String(k)).toBe(false);
    expect(g.take("a", 0)).toBe(true);
  });
});
