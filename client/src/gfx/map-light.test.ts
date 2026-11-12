import { describe, expect, it } from "vitest";
import { MAP_STYLES, styleOf } from "./map-style";
import { LIGHT_OVERSCAN, VIGNETTE_CLEAR, lightRect, planLight, vignetteAlphaAt } from "./map-light";

describe("map-light (ánh sáng môi trường + vignette)", () => {
  it("planLight: cờ của hồ sơ chất lượng quyết định lớp nào hiện, màu / độ đậm lấy từ kiểu bản đồ", () => {
    for (const id of Object.keys(MAP_STYLES)) {
      const s = styleOf(id);
      const both = planLight(s, { ambient: true, vignette: true });
      expect(both.ambient).toEqual({ color: s.ambient.color, alpha: s.ambient.alpha });
      expect(both.vignette).toEqual({ color: s.vignette.color, alpha: s.vignette.strength });
      expect(planLight(s, { ambient: false, vignette: true }).ambient).toBeNull();
      expect(planLight(s, { ambient: false, vignette: true }).vignette).not.toBeNull();
      expect(planLight(s, { ambient: true, vignette: false }).vignette).toBeNull();
      expect(planLight(s, { ambient: false, vignette: false })).toEqual({
        ambient: null,
        vignette: null,
      });
    }
  });

  it("planLight: độ đậm 0 coi như tắt (không phủ một lớp trong suốt tốn draw call)", () => {
    const base = styleOf("lac_ha");
    const flat = {
      ...base,
      ambient: { ...base.ambient, alpha: 0 },
      vignette: { ...base.vignette, strength: 0 },
    };
    expect(planLight(flat, { ambient: true, vignette: true })).toEqual({
      ambient: null,
      vignette: null,
    });
  });

  it("mỗi bản đồ có ánh sáng khác nhau (không chép một màu cho tất cả)", () => {
    const colors = new Set(Object.keys(MAP_STYLES).map((id) => styleOf(id).ambient.color));
    expect(colors.size).toBe(Object.keys(MAP_STYLES).length);
  });

  it("vignetteAlphaAt: 0 trong vùng sạch, 1 ở cuối, tăng đơn điệu, hợp lệ với số rác", () => {
    expect(vignetteAlphaAt(0)).toBe(0);
    expect(vignetteAlphaAt(VIGNETTE_CLEAR)).toBe(0);
    expect(vignetteAlphaAt(1)).toBe(1);
    expect(vignetteAlphaAt(5)).toBe(1);
    let prev = 0;
    for (let i = 0; i <= 100; i++) {
      const v = vignetteAlphaAt(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    for (const bad of [Number.NaN, -1, Infinity * 0]) expect(vignetteAlphaAt(bad)).toBe(0);
    // Giữa chừng: đã tối nhưng chưa tối hết
    const mid = vignetteAlphaAt((VIGNETTE_CLEAR + 1) / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });

  it("lightRect: tâm giữa camera, cạnh = khung nhìn thế giới nhân overscan; số hỏng -> null", () => {
    // Điện thoại dọc DPR 2: canvas 780x1688, thu phóng 0.5 -> khung nhìn thế giới 1560x3376
    const r = lightRect(780, 1688, 1560, 3376)!;
    expect(r.x).toBe(390);
    expect(r.y).toBe(844);
    expect(r.w).toBeCloseTo(1560 * LIGHT_OVERSCAN, 6);
    expect(r.h).toBeCloseTo(3376 * LIGHT_OVERSCAN, 6);
    expect(r.w).toBeGreaterThan(1560);
    for (const bad of [
      [0, 100, 100, 100],
      [100, -1, 100, 100],
      [100, 100, Number.NaN, 100],
      [100, 100, 100, Infinity],
    ] as const)
      expect(lightRect(bad[0], bad[1], bad[2], bad[3])).toBeNull();
  });
});
