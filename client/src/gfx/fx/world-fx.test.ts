import { describe, expect, it } from "vitest";
import { RARITY_COLORS } from "@tien-gioi/shared";
import {
  PORTAL_SWIRL_PERIOD_MS,
  PORTAL_SWIRL_RADIUS,
  clampRarity,
  glintIntervalMs,
  lootGlints,
  nextDueAt,
  planLootDrop,
  planLootPickup,
  portalSwirlPoints,
  rarityTint,
} from "./world-fx";
import { getRecipe, recipeCost, validateRecipe } from "./recipes";
import { WORLD_RECIPES } from "./recipes-world";

describe("gfx/fx: công thức thế giới (#329)", () => {
  it("mọi công thức hợp lệ, đã đăng ký, chi phí khai báo nhỏ (<= 20 hạt, <= 1,5 s)", () => {
    expect(WORLD_RECIPES.map((r) => r.id).sort()).toEqual([
      "loot-drop-high",
      "loot-drop-low",
      "loot-drop-mid",
      "loot-glint",
      "loot-pickup",
      "portal-swirl",
    ]);
    for (const r of WORLD_RECIPES) {
      validateRecipe(r);
      expect(getRecipe(r.id)).toBe(r);
      const c = recipeCost(r);
      expect(c.emitters).toBe(1);
      expect(c.particles).toBeLessThanOrEqual(20);
      expect(c.ms).toBeLessThanOrEqual(1500);
    }
  });

  it("số hạt rơi đồ tăng theo độ hiếm; lấp lánh / cổng là môi trường (ưu tiên 0); nhặt của mình ưu tiên 2", () => {
    const n = (id: string) => getRecipe(id)!.particles!.count;
    expect(n("loot-drop-low")).toBeLessThan(n("loot-drop-mid"));
    expect(n("loot-drop-mid")).toBeLessThan(n("loot-drop-high"));
    expect(getRecipe("loot-glint")!.priority).toBe(0);
    expect(getRecipe("portal-swirl")!.priority).toBe(0);
    expect(getRecipe("loot-pickup")!.priority).toBe(2);
    // chỉ bậc cam có vòng sáng
    expect(getRecipe("loot-drop-high")!.particles!.frames).toContain("ring");
    expect(getRecipe("loot-drop-mid")!.particles!.frames).not.toContain("ring");
  });

  it("không công thức thế giới nào rung hay chớp màn hình", () => {
    expect(WORLD_RECIPES.some((r) => r.shake || r.flash)).toBe(false);
  });
});

describe("gfx/fx: kế hoạch thế giới", () => {
  it("clampRarity: id lạ / thiếu / ngoài khoảng thì kẹp về 0..4", () => {
    expect(clampRarity(undefined)).toBe(0);
    expect(clampRarity(-1)).toBe(0);
    expect(clampRarity(1.5)).toBe(0);
    expect(clampRarity(2)).toBe(2);
    expect(clampRarity(99)).toBe(4);
    expect(rarityTint(undefined)).toBe(RARITY_COLORS[0]);
  });

  it("planLootDrop: bậc công thức theo độ hiếm, màu đúng RARITY_COLORS, công thức có trong sổ", () => {
    const want = [
      "loot-drop-low",
      "loot-drop-low",
      "loot-drop-mid",
      "loot-drop-mid",
      "loot-drop-high",
    ];
    for (let r = 0; r <= 4; r++) {
      const p = planLootDrop(r);
      expect(p.recipe).toBe(want[r]);
      expect(p.tint).toBe(RARITY_COLORS[r]);
      expect(p.priority).toBe(1);
      expect(getRecipe(p.recipe)).toBeDefined();
    }
    expect(planLootDrop(undefined).recipe).toBe("loot-drop-low");
  });

  it("planLootPickup: của mình ưu tiên 2, màu theo độ hiếm", () => {
    expect(planLootPickup(3)).toEqual({
      recipe: "loot-pickup",
      tint: RARITY_COLORS[3],
      priority: 2,
    });
    expect(getRecipe(planLootPickup(0).recipe)).toBeDefined();
  });

  it("lấp lánh chỉ từ lam (2) trở lên; hiếm hơn thì dày hơn", () => {
    expect([0, 1, 2, 3, 4].map(lootGlints)).toEqual([false, false, true, true, true]);
    expect(glintIntervalMs(4)).toBeLessThan(glintIntervalMs(3));
    expect(glintIntervalMs(3)).toBeLessThan(glintIntervalMs(2));
  });

  it("nextDueAt: chưa tới mốc thì null; tới mốc thì mốc mới trong [interval, interval + jitter)", () => {
    expect(nextDueAt(undefined, 1000, 500, 100, 0)).toBe(1500);
    expect(nextDueAt(1500, 1499, 500, 100, 0.5)).toBeNull();
    expect(nextDueAt(1500, 1500, 500, 100, 0)).toBe(2000);
    const hi = nextDueAt(1500, 2000, 500, 100, 0.999)!;
    expect(hi).toBeGreaterThanOrEqual(2500);
    expect(hi).toBeLessThan(2600);
  });

  it("portalSwirlPoints: hai điểm đối xứng qua tâm, cách tâm <= bán kính, quay hết một vòng sau một chu kỳ", () => {
    for (const t of [0, 300, 1200, 2399]) {
      const [a, b] = portalSwirlPoints(100, 200, t);
      expect(a.x + b.x).toBeCloseTo(200, 6);
      expect(a.y + b.y).toBeCloseTo(400, 6);
      expect(Math.hypot(a.x - 100, a.y - 200)).toBeLessThanOrEqual(PORTAL_SWIRL_RADIUS + 1e-9);
    }
    const [p0] = portalSwirlPoints(0, 0, 0);
    const [p1] = portalSwirlPoints(0, 0, PORTAL_SWIRL_PERIOD_MS);
    expect(p1.x).toBeCloseTo(p0.x, 6);
    expect(p1.y).toBeCloseTo(p0.y, 6);
    const [q] = portalSwirlPoints(0, 0, PORTAL_SWIRL_PERIOD_MS / 4);
    expect(q.x).toBeCloseTo(0, 6); // 1/4 vòng: lên đỉnh dọc
    expect(Math.abs(q.y)).toBeGreaterThan(5);
  });
});
