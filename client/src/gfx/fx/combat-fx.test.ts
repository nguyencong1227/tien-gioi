import { describe, expect, it } from "vitest";
import {
  HEAL_JUMP_FRAC,
  HEAVY_HIT_FRAC,
  MY_HIT_RANGE_SLACK,
  MY_HIT_WINDOW_MS,
  healAmount,
  healNumber,
  isHeavyHit,
  isMyHit,
  planHitFx,
  planHitNumber,
  type HitInput,
} from "./combat-fx";
import { missingGlyphs } from "./glyphs";
import { getRecipe, recipeCost, validateRecipe } from "./recipes";
import { COMBAT_RECIPES } from "./recipes-combat";

const base: HitInput = {
  amount: 10,
  crit: false,
  toPlayer: false,
  targetIsMe: false,
  targetMaxHp: 200,
  mine: false,
};
const hit = (p: Partial<HitInput> = {}): HitInput => ({ ...base, ...p });

describe("gfx/fx: công thức chiến đấu (#329)", () => {
  it("mọi công thức chiến đấu hợp lệ, đã đăng ký, có chi phí khai báo trong ngân sách bậc Thấp", () => {
    expect(COMBAT_RECIPES.length).toBeGreaterThanOrEqual(6);
    for (const r of COMBAT_RECIPES) {
      validateRecipe(r);
      expect(getRecipe(r.id)).toBe(r);
      const c = recipeCost(r);
      expect(c.emitters).toBe(1);
      expect(c.particles).toBeLessThanOrEqual(20); // một đòn không ngốn quá 1/6 ngân sách hạt bậc Thấp (120)
      expect(c.ms).toBeLessThanOrEqual(1000);
    }
  });

  it("chỉ công thức đòn nặng mới rung, và rung nhẹ (<= 0,006, <= 150 ms)", () => {
    const shaking = COMBAT_RECIPES.filter((r) => r.shake).map((r) => r.id);
    expect(shaking.sort()).toEqual(["hit-heavy", "hurt-heavy"]);
    for (const r of COMBAT_RECIPES) {
      if (!r.shake) continue;
      expect(r.shake.intensity).toBeLessThanOrEqual(0.006);
      expect(r.shake.durationMs).toBeLessThanOrEqual(150);
    }
  });

  it("nhãn chữ bay in được bằng phông bit-map (Bạo!, +, số)", () => {
    for (const i of [hit({ crit: true, amount: 1234 }), hit()]) {
      expect(missingGlyphs(planHitNumber(i).text)).toEqual([]);
    }
    expect(missingGlyphs(healNumber(987).text)).toEqual([]);
  });
});

describe("gfx/fx: planHitFx / planHitNumber", () => {
  it("isHeavyHit: chí mạng hoặc >= 15 % khí huyết tối đa; không rõ khí huyết thì chỉ xét chí mạng", () => {
    expect(isHeavyHit(29, false, 200)).toBe(false);
    expect(isHeavyHit(200 * HEAVY_HIT_FRAC, false, 200)).toBe(true);
    expect(isHeavyHit(1, true, 200)).toBe(true);
    expect(isHeavyHit(9999, false, 0)).toBe(false);
  });

  it("mình bị đánh: công thức đỏ, luôn ưu tiên 2, đòn nặng thì hurt-heavy", () => {
    expect(planHitFx(hit({ targetIsMe: true, toPlayer: true }))).toEqual({
      recipe: "hurt-self",
      priority: 2,
      heavy: false,
    });
    const heavy = planHitFx(hit({ targetIsMe: true, toPlayer: true, amount: 60 }));
    expect(heavy).toMatchObject({ recipe: "hurt-heavy", priority: 2, heavy: true });
  });

  it("mình đánh quái: ưu tiên 2 (được rung nếu đòn nặng); người khác đánh: ưu tiên 1 (không rung màn mình)", () => {
    expect(planHitFx(hit({ mine: true }))).toMatchObject({ recipe: "hit-spark", priority: 2 });
    expect(planHitFx(hit({ mine: true, crit: true, amount: 5 }))).toMatchObject({
      recipe: "hit-heavy",
      priority: 2,
    });
    expect(planHitFx(hit({ mine: false, crit: true }))).toMatchObject({
      recipe: "hit-heavy",
      priority: 1,
    });
    expect(planHitFx(hit({ mine: false }))).toMatchObject({ recipe: "hit-spark", priority: 1 });
  });

  it("công thức được chọn luôn tồn tại trong sổ", () => {
    for (const targetIsMe of [false, true])
      for (const crit of [false, true])
        for (const amount of [1, 100])
          for (const mine of [false, true]) {
            const p = planHitFx(hit({ targetIsMe, crit, amount, mine }));
            expect(getRecipe(p.recipe), p.recipe).toBeDefined();
          }
  });

  it("chữ bay: chí mạng 'Bạo!' vàng lớn hơn; đánh người chơi đỏ; hồi máu xanh '+N' ưu tiên 2", () => {
    const n = planHitNumber(hit({ amount: 12 }));
    expect(n).toEqual({ text: "12", color: 0xffffff, size: 15, priority: 1 });
    const c = planHitNumber(hit({ amount: 40, crit: true, mine: true }));
    expect(c.text).toBe("Bạo! 40");
    expect(c.size).toBeGreaterThan(n.size);
    expect(c.priority).toBe(2);
    expect(planHitNumber(hit({ toPlayer: true, targetIsMe: true })).color).toBe(0xff6b5e);
    const h = healNumber(50);
    expect(h).toMatchObject({ text: "+50", priority: 2 });
    expect(h.color).not.toBe(n.color);
  });
});

describe("gfx/fx: isMyHit (suy 'của mình' không cần đổi giao thức)", () => {
  const me = { x: 100, y: 100 };
  const last = { at: 1000, range: 64 };
  it("trong cửa sổ thời gian và trong tầm đòn + dung sai", () => {
    expect(isMyHit(last, 1100, me, { x: 150, y: 100 })).toBe(true);
    expect(isMyHit(last, 1000 + MY_HIT_WINDOW_MS, me, { x: 100, y: 100 })).toBe(true);
    expect(isMyHit(last, 1100, me, { x: 100 + 64 + MY_HIT_RANGE_SLACK, y: 100 })).toBe(true);
  });
  it("ngoài cửa sổ, ngoài tầm, chưa từng đánh, hoặc đồng hồ lùi thì không", () => {
    expect(isMyHit(last, 1000 + MY_HIT_WINDOW_MS + 1, me, me)).toBe(false);
    expect(isMyHit(last, 1100, me, { x: 100 + 64 + MY_HIT_RANGE_SLACK + 1, y: 100 })).toBe(false);
    expect(isMyHit(null, 1100, me, me)).toBe(false);
    expect(isMyHit(last, 900, me, me)).toBe(false);
  });
});

describe("gfx/fx: healAmount (chỉ hồi lớn của mình)", () => {
  it("tăng >= 10 % tối đa trong một bước khi còn sống thì tính là hồi máu", () => {
    expect(healAmount(100, 100 + 200 * HEAL_JUMP_FRAC, 200, false, 16)).toBe(20);
    expect(healAmount(100, 150, 200, false, 16)).toBe(50);
  });
  it("hồi tự nhiên (từng số nguyên), mất máu, hồi sinh từ 0, đang chết, khung quá dài thì không", () => {
    expect(healAmount(100, 103, 200, false, 16)).toBe(0);
    expect(healAmount(100, 40, 200, false, 16)).toBe(0);
    expect(healAmount(0, 200, 200, false, 16)).toBe(0);
    expect(healAmount(100, 200, 200, true, 16)).toBe(0);
    expect(healAmount(100, 200, 200, false, 900)).toBe(0);
    expect(healAmount(100, 200, 0, false, 16)).toBe(0);
  });
});
