import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MONSTERS, MONSTER_BY_ID } from "@tien-gioi/shared";
import { FxBudget } from "./budget";
import {
  MONSTER_FX_TINT,
  planMonsterDeath,
  HEAL_JUMP_FRAC,
  FloatLanes,
  HEAVY_HIT_FRAC,
  LANE_COUNT,
  LANE_PRUNE_AT,
  LANE_STEP_PX,
  LANE_WINDOW_MS,
  MY_HIT_RANGE_SLACK,
  MON_DEATH_MAX_DIST,
  MY_HIT_WINDOW_MS,
  healAmount,
  healNumber,
  isHeavyHit,
  isMonsterDeath,
  isMyHit,
  planHitFx,
  planHitNumber,
  type HitInput,
} from "./combat-fx";
import { missingGlyphs } from "./glyphs";
import { getRecipe, recipeCost, validateRecipe } from "./recipes";
import { COMBAT_RECIPES, FX_COLOR } from "./recipes-combat";

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

describe("gfx/fx: isMonsterDeath (quái rời vùng nhìn không phải là gục)", () => {
  it("chỉ gần hơn MON_DEATH_MAX_DIST mới coi là gục; khoảng cách hỏng thì không", () => {
    expect(isMonsterDeath(0)).toBe(true);
    expect(isMonsterDeath(500)).toBe(true);
    expect(isMonsterDeath(MON_DEATH_MAX_DIST - 1)).toBe(true);
    expect(isMonsterDeath(MON_DEATH_MAX_DIST)).toBe(false);
    expect(isMonsterDeath(1300)).toBe(false);
    expect(isMonsterDeath(Number.NaN)).toBe(false);
    expect(isMonsterDeath(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("MON_DEATH_MAX_DIST bằng VIEW_ENTER của server (client không import được từ server nên đọc tệp)", () => {
    const src = readFileSync(
      new URL("../../../../server/src/systems/interest.ts", import.meta.url),
      "utf8",
    );
    const m = /export const VIEW_ENTER\s*=\s*(\d+)/.exec(src);
    expect(m, "không thấy VIEW_ENTER trong interest.ts").not.toBeNull();
    expect(Number(m![1])).toBe(MON_DEATH_MAX_DIST);
  });
});

describe("gfx/fx: FloatLanes (chữ bay không đè nhau khi dồn đòn)", () => {
  it("lần đầu ở hàng 0; các chữ liên tiếp trong cửa sổ lên từng hàng rồi quay vòng", () => {
    const l = new FloatLanes();
    const offs = [0, 50, 100, 150, 200, 250].map((t) => l.offset("quai-1", t));
    expect(offs).toEqual([
      0,
      -LANE_STEP_PX,
      -2 * LANE_STEP_PX,
      -3 * LANE_STEP_PX,
      0,
      -LANE_STEP_PX,
    ]);
    expect(LANE_COUNT).toBe(4);
  });

  it("yên ắng quá LANE_WINDOW_MS thì về hàng 0; đúng bằng cửa sổ vẫn còn tính", () => {
    const l = new FloatLanes();
    l.offset("a", 0);
    expect(l.offset("a", LANE_WINDOW_MS)).toBe(-LANE_STEP_PX);
    expect(l.offset("a", LANE_WINDOW_MS + LANE_WINDOW_MS + 1)).toBe(0);
  });

  it("mỗi mục tiêu một hàng riêng: đòn lên quái khác không đẩy chữ của quái này", () => {
    const l = new FloatLanes();
    expect(l.offset("a", 0)).toBe(0);
    expect(l.offset("b", 10)).toBe(0);
    expect(l.offset("a", 20)).toBe(-LANE_STEP_PX);
    expect(l.offset("b", 30)).toBe(-LANE_STEP_PX);
  });

  it("đồng hồ lùi (now < lần trước) thì về hàng 0, không ra số lạ", () => {
    const l = new FloatLanes();
    l.offset("a", 1000);
    expect(l.offset("a", 500)).toBe(0);
  });

  it("dọn mục quá hạn khi nhiều mục tiêu: bộ nhớ không phình mãi", () => {
    const l = new FloatLanes();
    for (let i = 0; i < 200; i++) l.offset(`quai-${i}`, i * (LANE_WINDOW_MS + 1));
    expect(l.size()).toBeLessThanOrEqual(LANE_PRUNE_AT + 2);
    l.clear();
    expect(l.size()).toBe(0);
  });
});

describe("gfx/fx: trùm và quái Kim Đan (M6 #409)", () => {
  const BOSSES = MONSTERS.filter((m) => m.boss).map((m) => m.id);
  const OLD_KINDS = ["tho", "lang", "ho"];

  it("có đủ trùm trong game để kiểm (mang, hac_giao, yeu_vuong)", () => {
    expect(BOSSES.sort()).toEqual(["hac_giao", "mang", "yeu_vuong"]);
  });

  it("boss-hit / boss-vanish hợp lệ, đã đăng ký, RẺ: không rung, <= 20 hạt, <= 1 s, boss-hit không đắt hơn hit-heavy", () => {
    for (const id of ["boss-hit", "boss-vanish"]) {
      const r = getRecipe(id)!;
      expect(r, id).toBeDefined();
      expect(COMBAT_RECIPES).toContain(r);
      validateRecipe(r);
      expect(r.shake, `${id} không rung`).toBeUndefined();
      expect(r.flash, `${id} không chớp`).toBeUndefined();
      const c = recipeCost(r);
      expect(c.particles).toBeLessThanOrEqual(20);
      expect(c.ms).toBeLessThanOrEqual(1000);
    }
    expect(recipeCost(getRecipe("boss-hit")!).particles).toBeLessThanOrEqual(
      recipeCost(getRecipe("hit-heavy")!).particles,
    );
    // nổi hơn quái thường: hơn hit-spark / mon-vanish về số hạt
    expect(recipeCost(getRecipe("boss-hit")!).particles).toBeGreaterThan(
      recipeCost(getRecipe("hit-spark")!).particles,
    );
    expect(recipeCost(getRecipe("boss-vanish")!).particles).toBeGreaterThan(
      recipeCost(getRecipe("mon-vanish")!).particles,
    );
  });

  it("đòn THƯỜNG lên mọi trùm dùng boss-hit; đòn nặng / chí mạng vẫn hit-heavy (đọc ra là đòn mạnh)", () => {
    for (const kind of BOSSES) {
      expect(planHitFx(hit({ kind })).recipe, kind).toBe("boss-hit");
      expect(planHitFx(hit({ kind, crit: true })).recipe, kind).toBe("hit-heavy");
      expect(planHitFx(hit({ kind, amount: 200 * HEAVY_HIT_FRAC })).recipe, kind).toBe("hit-heavy");
      // ưu tiên như mọi đòn: mình đánh 2, người khác 1
      expect(planHitFx(hit({ kind, mine: true })).priority).toBe(2);
      expect(planHitFx(hit({ kind })).priority).toBe(1);
    }
  });

  it("quái cũ y như trước (hit-spark, không đổi màu); đánh người chơi / mình bị đánh không bị loại quái chi phối", () => {
    for (const kind of OLD_KINDS) {
      const p = planHitFx(hit({ kind }));
      expect(p).toEqual({ recipe: "hit-spark", priority: 1, heavy: false });
      expect("tint" in p).toBe(false);
    }
    expect(planHitFx(hit({ kind: "hac_giao", toPlayer: true }))).toEqual({
      recipe: "hit-spark",
      priority: 1,
      heavy: false,
    });
    expect(planHitFx(hit({ kind: "hac_giao", targetIsMe: true, toPlayer: true }))).toEqual({
      recipe: "hurt-self",
      priority: 2,
      heavy: false,
    });
  });

  it("quái Kim Đan đổi màu hạt đòn thường (suong_ho, thach_quy, doc_thiem); đòn nặng giữ vàng chung", () => {
    for (const kind of ["suong_ho", "thach_quy", "doc_thiem"]) {
      expect(planHitFx(hit({ kind })).tint, kind).toBe(MONSTER_FX_TINT[kind]);
      expect(planHitFx(hit({ kind, crit: true })).tint, kind).toBeUndefined();
    }
    expect(planHitFx(hit({ kind: "hac_giao" })).tint).toBe(MONSTER_FX_TINT.hac_giao);
  });

  it("id lạ / độc / sai kiểu: coi như quái thường, không ném lỗi", () => {
    for (const kind of [
      undefined,
      "",
      "khong_co",
      "constructor",
      "__proto__",
      "toString",
      7 as unknown as string,
    ]) {
      expect(planHitFx(hit({ kind })), String(kind)).toEqual({
        recipe: "hit-spark",
        priority: 1,
        heavy: false,
      });
      expect(planMonsterDeath(kind), String(kind)).toEqual({ recipe: "mon-vanish" });
    }
  });

  it("gục: trùm nổ boss-vanish ưu tiên 2; quái cũ mon-vanish y như trước; quái Kim Đan mon-vanish đổi màu", () => {
    for (const kind of BOSSES) {
      expect(planMonsterDeath(kind), kind).toMatchObject({ recipe: "boss-vanish", priority: 2 });
    }
    expect(planMonsterDeath("hac_giao").tint).toBe(MONSTER_FX_TINT.hac_giao);
    expect(planMonsterDeath("mang").tint).toBeUndefined(); // trùm cũ: màu mặc định của công thức
    for (const kind of OLD_KINDS) expect(planMonsterDeath(kind)).toEqual({ recipe: "mon-vanish" });
    for (const kind of ["suong_ho", "thach_quy", "doc_thiem"]) {
      expect(planMonsterDeath(kind)).toEqual({ recipe: "mon-vanish", tint: MONSTER_FX_TINT[kind] });
    }
  });

  it("mọi công thức được chọn đều có trong sổ (gõ sai tên sẽ đỏ)", () => {
    for (const m of MONSTERS) {
      expect(getRecipe(planMonsterDeath(m.id).recipe), m.id).toBeDefined();
      expect(getRecipe(planHitFx(hit({ kind: m.id })).recipe), m.id).toBeDefined();
    }
  });

  it("MONSTER_FX_TINT chỉ gồm loài CÓ trong game; mỗi màu khác màu chung (đòn / chí mạng / bị đánh / hồi máu / tan) và khác nhau", () => {
    const common = [FX_COLOR.hit, FX_COLOR.crit, FX_COLOR.hurt, FX_COLOR.heal, FX_COLOR.vanish];
    const seen = new Set<number>();
    for (const [kind, c] of Object.entries(MONSTER_FX_TINT)) {
      expect(MONSTER_BY_ID[kind], kind).toBeDefined();
      expect(common, kind).not.toContain(c);
      expect(seen.has(c), `${kind} trùng màu loài khác`).toBe(false);
      seen.add(c);
    }
  });

  it("ngân sách: trùm gục (ưu tiên 2) vẫn phát được khi ngân sách bậc Thấp đã đầy tới trần ưu tiên 1; mon-vanish thường thì bị bỏ", () => {
    const LOW = { particles: 60, emitters: 4 }; // hồ sơ bậc Thấp
    const t = 0;
    const full = () => {
      const b = new FxBudget(
        () => LOW,
        () => t,
      );
      expect(b.tryAcquire({ particles: 58, emitters: 1, ms: 1000 }, 1)).toBe(true);
      return b;
    };
    const boss = recipeCost(getRecipe("boss-vanish")!);
    expect(full().tryAcquire(boss, 2)).toBe(true);
    expect(full().tryAcquire(boss, 1)).toBe(false);
    // ...nhưng không vượt trần cứng (x2): đã đầy tới trần ưu tiên 2 thì bị bỏ, perf-gate không bao giờ thấy vượt
    const b = new FxBudget(
      () => LOW,
      () => t,
    );
    expect(b.tryAcquire({ particles: 110, emitters: 1, ms: 1000 }, 2)).toBe(true);
    expect(b.tryAcquire(boss, 2)).toBe(false);
  });
});
