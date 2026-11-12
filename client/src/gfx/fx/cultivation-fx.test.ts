import { describe, expect, it } from "vitest";
import {
  MOTE_INTERVAL_MS,
  MOTE_JITTER_MS,
  motePriority,
  nextMoteAt,
  planBreakFail,
  planLevelUp,
} from "./cultivation-fx";
import { getRecipe, recipeCost, validateRecipe } from "./recipes";
import { CULTIVATION_RECIPES } from "./recipes-cultivation";

describe("gfx/fx: công thức tu luyện (#329)", () => {
  it("mọi công thức hợp lệ, đã đăng ký, chi phí khai báo nhỏ (<= 30 hạt, <= 1,5 s)", () => {
    expect(CULTIVATION_RECIPES.map((r) => r.id).sort()).toEqual([
      "breakfail-smoke",
      "breakthrough-pillar",
      "breakthrough-ring",
      "levelup-glow",
      "levelup-ring",
      "meditate-mote",
    ]);
    for (const r of CULTIVATION_RECIPES) {
      validateRecipe(r);
      expect(getRecipe(r.id)).toBe(r);
      const c = recipeCost(r);
      expect(c.emitters).toBe(1);
      expect(c.particles).toBeLessThanOrEqual(30);
      expect(c.ms).toBeLessThanOrEqual(1500);
    }
  });

  it("chớp màn hình chỉ có ở cột sáng đột phá (nhẹ, <= 300 ms); không công thức tu luyện nào rung", () => {
    const flashing = CULTIVATION_RECIPES.filter((r) => r.flash).map((r) => r.id);
    expect(flashing).toEqual(["breakthrough-pillar"]);
    expect(getRecipe("breakthrough-pillar")!.flash!.durationMs).toBeLessThanOrEqual(300);
    expect(CULTIVATION_RECIPES.some((r) => r.shake)).toBe(false);
  });

  it("vòng sóng đứng yên (tốc độ 0) và phình ra; đốm thiền định ưu tiên môi trường (0)", () => {
    for (const id of ["levelup-ring", "breakthrough-ring"]) {
      const p = getRecipe(id)!.particles!;
      expect(p.frames).toEqual(["ring"]);
      expect(p.speed).toEqual({ min: 0, max: 0 });
      expect(p.scale.end).toBeGreaterThan(p.scale.start * 4);
    }
    expect(getRecipe("meditate-mote")!.priority).toBe(0);
  });
});

describe("gfx/fx: kế hoạch tu luyện", () => {
  it("lên cấp thường / đột phá chọn đúng công thức; của mình ưu tiên 2, người khác 1", () => {
    expect(planLevelUp(false, true)).toEqual({
      recipes: ["levelup-ring", "levelup-glow"],
      priority: 2,
    });
    expect(planLevelUp(true, true)).toEqual({
      recipes: ["breakthrough-ring", "breakthrough-pillar"],
      priority: 2,
    });
    expect(planLevelUp(true, false).priority).toBe(1);
    expect(planLevelUp(false, false).priority).toBe(1);
  });

  it("đột phá thất bại: khói tím; mọi công thức được chọn đều có trong sổ", () => {
    expect(planBreakFail(true)).toEqual({ recipes: ["breakfail-smoke"], priority: 2 });
    expect(planBreakFail(false).priority).toBe(1);
    for (const plan of [planLevelUp(true, true), planLevelUp(false, false), planBreakFail(false)])
      for (const id of plan.recipes) expect(getRecipe(id), id).toBeDefined();
  });

  it("đốm thiền định: của mình 1, người khác 0", () => {
    expect(motePriority(true)).toBe(1);
    expect(motePriority(false)).toBe(0);
  });

  it("nextMoteAt: lần đầu phát ngay; chưa tới mốc thì null; tới mốc thì mốc mới trong [interval, interval + jitter)", () => {
    expect(nextMoteAt(undefined, 1000, 0)).toBe(1000 + MOTE_INTERVAL_MS);
    expect(nextMoteAt(1600, 1599, 0.5)).toBeNull();
    expect(nextMoteAt(1600, 1600, 0)).toBe(1600 + MOTE_INTERVAL_MS);
    const hi = nextMoteAt(1600, 2000, 0.999)!;
    expect(hi).toBeGreaterThanOrEqual(2000 + MOTE_INTERVAL_MS);
    expect(hi).toBeLessThan(2000 + MOTE_INTERVAL_MS + MOTE_JITTER_MS);
  });
});
