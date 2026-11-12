import { describe, expect, it } from "vitest";
import { MAP_STYLES, styleOf } from "./map-style";
import { FOG_ASPECT, advanceU, fogPatchLayout, fogRect, planFog } from "./map-fog";

describe("map-fog (sương trôi)", () => {
  it("planFog: theo cờ / số mảng của hồ sơ chất lượng; màu, độ đậm, tốc độ từ kiểu bản đồ", () => {
    for (const id of Object.keys(MAP_STYLES)) {
      const f = styleOf(id).fog;
      const p = planFog(f, { fog: true, fogPatches: 8 })!;
      expect(p).toEqual({ count: 8, color: f.color, alpha: f.alpha, speed: f.speed });
      expect(planFog(f, { fog: true, fogPatches: 4 })!.count).toBe(4);
      expect(planFog(f, { fog: false, fogPatches: 8 })).toBeNull(); // bậc Thấp
      expect(planFog(f, { fog: true, fogPatches: 0 })).toBeNull();
    }
    expect(planFog({ color: 0, alpha: 0, speed: 5 }, { fog: true, fogPatches: 8 })).toBeNull();
  });

  it("fogPatchLayout: tất định theo hạt giống, đúng số mảng, rải đều ngang, trong giới hạn", () => {
    const a = fogPatchLayout(8, 12345);
    const b = fogPatchLayout(8, 12345);
    expect(a).toEqual(b);
    expect(fogPatchLayout(8, 54321)).not.toEqual(a);
    expect(a).toHaveLength(8);
    a.forEach((p, i) => {
      expect(p.u).toBeGreaterThanOrEqual(i / 8);
      expect(p.u).toBeLessThan((i + 1) / 8); // mỗi mảng một cột: phủ đều cả bề ngang
      expect(p.v).toBeGreaterThanOrEqual(0.15);
      expect(p.v).toBeLessThanOrEqual(0.9);
      expect(p.size).toBeGreaterThanOrEqual(0.45);
      expect(p.size).toBeLessThanOrEqual(0.8);
      expect(p.speed).toBeGreaterThanOrEqual(0.6);
      expect(p.speed).toBeLessThanOrEqual(1.4);
    });
    expect(new Set(a.map((p) => p.speed)).size).toBeGreaterThan(4); // không trôi như một khối
    expect(fogPatchLayout(0, 1)).toEqual([]);
    expect(fogPatchLayout(-3, 1)).toEqual([]);
    expect(fogPatchLayout(4.9, 1)).toHaveLength(4);
  });

  it("advanceU: trôi sang phải đúng quãng đường, quay lại từ mép trái khi ra hết mép phải, số rác giữ nguyên", () => {
    // 10 px/s x hệ số 1 trong 1 s trên khung nhìn rộng 1000 px = 0,01
    expect(advanceU(0.5, 1000, 10, 1, 1000, 0.5)).toBeCloseTo(0.51, 9);
    expect(advanceU(0.5, 1000, 10, 2, 1000, 0.5)).toBeCloseTo(0.52, 9);
    // Ra hết mép phải (u - size/2 > 1) thì quay về mép trái, KHÔNG nhảy giữa màn hình
    const size = 0.5;
    const wrapped = advanceU(1.25 + 0.001, 1000, 10, 1, 1000, size);
    expect(wrapped).toBeLessThan(0);
    expect(wrapped + size / 2).toBeLessThanOrEqual(0.011 + 1e-9); // mép phải mảng chỉ lấn tối đa một bước trôi (rìa mảng trong suốt nên không thấy)
    expect(advanceU(0.4, 0, 10, 1, 1000, 0.5)).toBe(0.4);
    expect(advanceU(0.4, -50, 10, 1, 1000, 0.5)).toBe(0.4);
    for (const bad of [Number.NaN, Infinity]) {
      expect(advanceU(bad, 100, 10, 1, 1000, 0.5)).toBe(bad);
      expect(advanceU(0.4, 100, bad, 1, 1000, 0.5)).toBe(0.4);
    }
    expect(advanceU(0.4, 100, 10, 1, 0, 0.5)).toBe(0.4);
  });

  it("một vòng trôi hết: mọi mảng ở mọi tốc độ quay lại, không văng ra vô cực", () => {
    for (const id of Object.keys(MAP_STYLES)) {
      const speed = styleOf(id).fog.speed;
      for (const p of fogPatchLayout(8, 777)) {
        let u = p.u;
        for (let t = 0; t < 600_000; t += 100) u = advanceU(u, 100, speed, p.speed, 1138, p.size);
        expect(u).toBeGreaterThan(-p.size);
        expect(u).toBeLessThan(1 + p.size);
      }
    }
  });

  it("fogRect: tâm theo tỉ lệ khung nhìn thế giới (đúng khi thu phóng / DPR), dẹt theo FOG_ASPECT; số hỏng -> null", () => {
    // Canvas 780x1688 (DPR 2), thu phóng 0.5 -> khung nhìn thế giới 1560x3376
    const r = fogRect({ u: 0.5, v: 0.5, size: 0.5, speed: 1 }, 780, 1688, 1560, 3376)!;
    expect(r.x).toBe(390);
    expect(r.y).toBe(844);
    expect(r.w).toBe(780);
    expect(r.h).toBeCloseTo(780 * FOG_ASPECT, 6);
    const left = fogRect({ u: 0, v: 0, size: 0.5, speed: 1 }, 780, 1688, 1560, 3376)!;
    expect(left.x).toBe(390 - 780);
    for (const bad of [
      [0, 100, 100, 100],
      [100, 100, Number.NaN, 100],
      [100, 100, 100, -1],
    ] as const)
      expect(
        fogRect({ u: 0, v: 0, size: 0.5, speed: 1 }, bad[0], bad[1], bad[2], bad[3]),
      ).toBeNull();
  });
});
