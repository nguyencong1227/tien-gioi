import { describe, expect, it } from "vitest";
import { DUNGEON_MAPS, MAPS, T, TILE, getMap } from "@tien-gioi/shared";
import { styleOf, MAP_STYLES } from "./map-style";
import {
  NO_WATER,
  WATER_SPOTS,
  WATER_STEP_MS,
  WATER_VARIANTS,
  shimmerPhaseKey,
  shimmerSpots,
  waterGrid,
} from "./map-water";

const ALL = [...MAPS, ...DUNGEON_MAPS].map((m) => m.id);

describe("map-water (mặt nước lấp lánh)", () => {
  it("waterGrid: ô nước có biến thể hợp lệ, ô khác NO_WATER; tất định; hai bản đồ khác nhau", () => {
    for (const id of ALL) {
      const m = getMap(id)!;
      const g = waterGrid(m);
      expect(Array.from(g)).toEqual(Array.from(waterGrid(m)));
      let water = 0;
      const seen = new Set<number>();
      for (let i = 0; i < g.length; i++) {
        if (m.tiles[i] === T.Water) {
          water++;
          expect(g[i], `${id} ô ${i}`).toBeGreaterThanOrEqual(0);
          expect(g[i]).toBeLessThan(WATER_VARIANTS);
          seen.add(g[i]);
        } else expect(g[i], `${id} ô ${i}`).toBe(NO_WATER);
      }
      expect(water, `${id} có nước`).toBeGreaterThan(20);
      expect(seen.size, `${id} dùng đủ biến thể`).toBe(WATER_VARIANTS);
    }
    const clone = { ...getMap("lac_ha")!, def: { ...getMap("lac_ha")!.def, id: "khac" } };
    expect(Array.from(waterGrid(clone))).not.toEqual(Array.from(waterGrid(getMap("lac_ha")!)));
  });

  it("shimmerSpots: số đốm cố định, nằm TRONG ô 32x32, độ đục 0..1, tất định", () => {
    for (const style of Object.values(MAP_STYLES))
      for (let v = 0; v < WATER_VARIANTS; v++)
        for (const t of [0, 1, 250, 777, 5000, 123456]) {
          const a = shimmerSpots(v, t, style.water.speed);
          expect(a).toHaveLength(WATER_SPOTS);
          expect(JSON.stringify(a)).toBe(JSON.stringify(shimmerSpots(v, t, style.water.speed)));
          for (const s of a) {
            expect(Number.isInteger(s.x)).toBe(true);
            expect(s.x).toBeGreaterThanOrEqual(0);
            expect(s.x + s.w).toBeLessThanOrEqual(TILE);
            expect(s.y).toBeGreaterThanOrEqual(0);
            expect(s.y).toBeLessThan(TILE);
            expect(s.w).toBeGreaterThanOrEqual(1);
            expect(s.a).toBeGreaterThan(0);
            expect(s.a).toBeLessThanOrEqual(1);
          }
        }
  });

  it("shimmerSpots: các biến thể KHÁC nhau; đốm TRÔI theo thời gian với tốc độ > 0 và đứng yên khi tốc độ 0", () => {
    const sig = (v: number, t: number, sp: number) => JSON.stringify(shimmerSpots(v, t, sp));
    const variants = new Set(Array.from({ length: WATER_VARIANTS }, (_, v) => sig(v, 0, 10)));
    expect(variants.size).toBe(WATER_VARIANTS);
    // Trôi: vị trí x đổi theo thời gian
    const xs0 = shimmerSpots(1, 0, 12).map((s) => s.x);
    const xs1 = shimmerSpots(1, 2000, 12).map((s) => s.x);
    expect(xs1).not.toEqual(xs0);
    // Tốc độ 0: x đứng yên (chỉ độ đục nhấp nháy)
    expect(shimmerSpots(1, 0, 0).map((s) => s.x)).toEqual(shimmerSpots(1, 9999, 0).map((s) => s.x));
    // Nhấp nháy: độ đục đổi theo thời gian
    expect(shimmerSpots(2, 0, 0).map((s) => s.a)).not.toEqual(
      shimmerSpots(2, 450, 0).map((s) => s.a),
    );
    // Cuốn vòng đúng chu kỳ: tốc độ 16 px/s -> sau 2 s (32 px) về vị trí cũ
    expect(shimmerSpots(3, 0, 16).map((s) => s.x)).toEqual(
      shimmerSpots(3, 2000, 16).map((s) => s.x),
    );
  });

  it("shimmerSpots: số rác -> không đốm nào, không ném lỗi", () => {
    for (const bad of [
      [Number.NaN, 0, 1],
      [0, Infinity, 1],
      [0, 0, Number.NaN],
    ] as const)
      expect(shimmerSpots(bad[0], bad[1], bad[2])).toEqual([]);
  });

  it("shimmerPhaseKey: cùng khoá trong một bước, đổi khi qua bước, giảm chuyển động luôn 0, số rác 0", () => {
    expect(shimmerPhaseKey(0, false)).toBe(0);
    expect(shimmerPhaseKey(WATER_STEP_MS - 1, false)).toBe(0);
    expect(shimmerPhaseKey(WATER_STEP_MS, false)).toBe(1);
    expect(shimmerPhaseKey(5 * WATER_STEP_MS + 3, false)).toBe(5);
    expect(shimmerPhaseKey(99999, true)).toBe(0);
    for (const bad of [Number.NaN, -5, Infinity]) expect(shimmerPhaseKey(bad, false)).toBe(0);
  });

  it("kiểu bản đồ nào cũng có màu / độ đục / tốc độ nước hợp lệ để vẽ", () => {
    for (const id of ALL) {
      const w = styleOf(id).water;
      expect(w.alpha).toBeGreaterThan(0);
      expect(w.speed).toBeGreaterThanOrEqual(0);
    }
  });
});
