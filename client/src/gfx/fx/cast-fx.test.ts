import { describe, expect, it } from "vitest";
import {
  SKILL_FX_IDS,
  SKILLS_M7,
  skillOf,
  type SkillDef,
  type SkillShape,
} from "@tien-gioi/shared";
import { ELEMENT_COLOR } from "../../skill-bar";
import {
  CAST_MAX_POINTS,
  CAST_TRAVEL_MS,
  CAST_Y_OFFSET,
  castPointsFor,
  castTint,
  planCastFx,
  type CastFxInput,
} from "./cast-fx";
import { getRecipe, recipeCost, recipeIds } from "./recipes";
import { CAST_RECIPES, castRecipeId } from "./recipes-cast";

const def = (id: string) => skillOf(id)!;
function plan(id: string, over: Partial<CastFxInput> = {}) {
  const d = def(id);
  const reach =
    d.shape === "ground" ? (d.reach ?? 0) + d.range : d.shape === "dash" ? (d.reach ?? 0) : d.range;
  return planCastFx({
    skill: d,
    x: 500,
    y: 400,
    angle: 0,
    range: reach,
    mine: false,
    emitterBudget: 24,
    ...over,
  });
}
/** Một chiêu mẫu cho mỗi hình (chiêu thật nếu có, không thì dựng từ chiêu khác) */
const SHAPES: SkillShape[] = ["cone", "line", "fan", "nova", "ground", "dash", "self"];
function sample(shape: SkillShape): SkillDef {
  const d = SKILLS_M7.find((s) => s.shape === shape);
  if (d) return d;
  return { ...SKILLS_M7[0], shape, range: 120, reach: 90, count: 4, arc: Math.PI / 2 };
}

describe("recipes-cast: mỗi kiểu SkillDef.fx có một công thức hạt", () => {
  it("phủ kín SKILL_FX_IDS, id duy nhất, đã đăng ký trong lõi, id hợp lệ", () => {
    expect(CAST_RECIPES.map((r) => r.id).sort()).toEqual(SKILL_FX_IDS.map(castRecipeId).sort());
    expect(new Set(CAST_RECIPES.map((r) => r.id)).size).toBe(SKILL_FX_IDS.length);
    for (const fx of SKILL_FX_IDS) {
      expect(getRecipe(castRecipeId(fx))).toBeDefined();
      expect(recipeIds()).toContain(castRecipeId(fx));
    }
    expect(castRecipeId("slash_fire")).toBe("cast-slash-fire");
  });

  it("mỗi công thức KHÁC nhau (không sao chép một công thức cho cả 12 chiêu)", () => {
    const sig = CAST_RECIPES.map((r) => JSON.stringify({ ...r, id: "" }));
    expect(new Set(sig).size).toBe(CAST_RECIPES.length);
  });

  it("chi phí hạt có giới hạn (một lần phát <= 24 hạt, sống <= 1 s): không nuốt ngân sách", () => {
    for (const r of CAST_RECIPES) {
      const c = recipeCost(r);
      expect(c.particles).toBeLessThanOrEqual(24);
      expect(c.ms).toBeLessThanOrEqual(1000);
    }
  });
});

describe("planCastFx: mọi chiêu thật cho điểm phát hợp lệ", () => {
  it("mỗi chiêu thật: >= 1 điểm, công thức đúng kiểu và có đăng ký, màu theo hệ, ưu tiên theo mine", () => {
    for (const d of SKILLS_M7) {
      const pts = plan(d.id);
      expect(pts.length, d.id).toBeGreaterThanOrEqual(1);
      for (const p of pts) {
        expect(p.recipe).toBe(castRecipeId(d.fx));
        expect(getRecipe(p.recipe)).toBeDefined();
        expect(p.tint).toBe(castTint(d.element));
        expect(Number.isFinite(p.x + p.y)).toBe(true);
        expect(p.priority).toBe(1);
        expect(p.delayMs).toBeGreaterThanOrEqual(0);
      }
      expect(plan(d.id, { mine: true }).every((p) => p.priority === 2)).toBe(true);
    }
  });

  it("màu hạt theo HỆ (cùng bảng với biểu tượng); hệ lạ / độc rơi về xám", () => {
    expect(castTint("hoa")).toBe(0xe8573a);
    expect(castTint("thuy")).toBe(0x4a90e2);
    expect(castTint("hoa")).not.toBe(castTint("thuy"));
    expect(castTint("constructor")).toBe(Number.parseInt(ELEMENT_COLOR.none.slice(1), 16));
    expect(castTint(undefined)).toBe(castTint("none"));
  });
});

describe("planCastFx: số điểm theo ngân sách emitter", () => {
  it("castPointsFor: Thấp 1, Vừa 2, Cao 6, Rất cao 8 (trần), rác 1", () => {
    expect(castPointsFor(4)).toBe(1);
    expect(castPointsFor(10)).toBe(2);
    expect(castPointsFor(24)).toBe(6);
    expect(castPointsFor(40)).toBe(CAST_MAX_POINTS);
    expect(castPointsFor(1000)).toBe(CAST_MAX_POINTS);
    expect(castPointsFor(0)).toBe(1);
    expect(castPointsFor(Number.NaN)).toBe(1);
  });

  it("MỌI hình: số điểm <= castPointsFor(ngân sách), ít nhất 1, ngân sách càng lớn càng không ít hơn", () => {
    for (const shape of SHAPES) {
      const d = sample(shape);
      let prev = 0;
      for (const budget of [4, 10, 24, 40]) {
        const n = plan(d.id, { skill: d, emitterBudget: budget }).length;
        expect(n, `${shape} @${budget}`).toBeGreaterThanOrEqual(1);
        expect(n, `${shape} @${budget}`).toBeLessThanOrEqual(castPointsFor(budget));
        expect(n).toBeGreaterThanOrEqual(prev);
        prev = n;
      }
    }
  });
});

describe("planCastFx: hình học theo hình chiêu", () => {
  it("cone: điểm giữa ở 70 % tầm trước mặt, hai đầu cung ở 90 % tầm lệch ± nửa cung", () => {
    const d = def("hoa_van_kiem"); // cone, range 90, arc 0,7 pi
    const pts = planCastFx({
      skill: d,
      x: 100,
      y: 200,
      angle: 0,
      range: d.range,
      mine: false,
      emitterBudget: 24,
    });
    const gy = 200 + CAST_Y_OFFSET;
    const front = pts[0];
    expect(front.x).toBeCloseTo(100 + d.range * 0.7, 6);
    expect(front.y).toBeCloseTo(gy, 6);
    const half = (d.arc ?? 0) / 2;
    expect(pts[1].x).toBeCloseTo(100 + Math.cos(-half) * d.range * 0.9, 6);
    expect(pts[1].y).toBeCloseTo(gy + Math.sin(-half) * d.range * 0.9, 6);
    expect(pts[2].y).toBeCloseTo(gy + Math.sin(half) * d.range * 0.9, 6);
  });

  it("line / dash: rải dọc hướng đánh, điểm cuối đúng tầm, trễ tăng dần tới CAST_TRAVEL_MS", () => {
    for (const shape of ["line", "dash"] as const) {
      const d = sample(shape);
      const range = shape === "dash" ? (d.reach ?? 150) : d.range;
      const pts = planCastFx({
        skill: d,
        x: 0,
        y: 0,
        angle: Math.PI / 2,
        range,
        mine: false,
        emitterBudget: 24,
      });
      expect(pts.length).toBeGreaterThanOrEqual(1);
      const last = pts[pts.length - 1];
      expect(last.x).toBeCloseTo(0, 6); // hướng xuống: x không đổi
      expect(last.y).toBeCloseTo(CAST_Y_OFFSET + range, 6);
      expect(last.delayMs).toBe(CAST_TRAVEL_MS);
      for (let i = 1; i < pts.length; i++)
        expect(pts[i].delayMs).toBeGreaterThan(pts[i - 1].delayMs);
    }
  });

  it("nova: vòng quanh mình ở 70 % tầm, đều góc", () => {
    const d = sample("nova");
    const pts = planCastFx({
      skill: d,
      x: 300,
      y: 300,
      angle: 1,
      range: 100,
      mine: false,
      emitterBudget: 24,
    });
    for (const p of pts)
      expect(Math.hypot(p.x - 300, p.y - (300 + CAST_Y_OFFSET))).toBeCloseTo(70, 6);
    expect(pts.length).toBeGreaterThanOrEqual(2);
  });

  it("ground: điểm đầu là TÂM vùng, cách mình `reach` theo hướng đánh; các điểm sau quanh tâm trong bán kính vùng", () => {
    const d = def("cuu_cung_khon_sat");
    const pts = planCastFx({
      skill: d,
      x: 0,
      y: 0,
      angle: 0,
      range: (d.reach ?? 0) + d.range,
      mine: false,
      emitterBudget: 24,
    });
    expect(pts[0].x).toBeCloseTo(d.reach ?? 0, 6);
    for (const p of pts.slice(1))
      expect(Math.hypot(p.x - pts[0].x, p.y - pts[0].y)).toBeLessThanOrEqual(d.range + 1e-6);
  });

  it("fan: mỗi điểm là đầu một tia, nằm trong cung toả và mang hướng tia", () => {
    const d = def("lac_tuyet_phan_phi"); // fan: 5 tia, arc 0,5 pi
    const pts = planCastFx({
      skill: d,
      x: 0,
      y: 0,
      angle: 0,
      range: d.range,
      mine: false,
      emitterBudget: 24,
    });
    expect(pts.length).toBe(Math.min(castPointsFor(24), d.count ?? 1));
    const half = (d.arc ?? 0) / 2;
    for (const p of pts) {
      expect(p.angle).toBeDefined();
      expect(Math.abs(p.angle!)).toBeLessThanOrEqual(half + 1e-9);
    }
    // ngân sách 1 điểm: tia GIỮA
    const one = planCastFx({
      skill: d,
      x: 0,
      y: 0,
      angle: 0,
      range: d.range,
      mine: false,
      emitterBudget: 4,
    });
    expect(one).toHaveLength(1);
    expect(one[0].angle).toBeCloseTo(0, 9);
  });

  it("self: một điểm ngay chỗ người dùng, kể cả tầm 0", () => {
    const d = def("kim_chung_trao");
    const pts = planCastFx({
      skill: d,
      x: 10,
      y: 20,
      angle: 0,
      range: 0,
      mine: true,
      emitterBudget: 40,
    });
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBe(10);
    expect(pts[0].y).toBe(20 + CAST_Y_OFFSET);
  });
});

describe("planCastFx: dữ liệu rác", () => {
  it("không hữu hạn hoặc tầm <= 0 (trừ self) -> []", () => {
    const d = def("hoa_van_kiem");
    const base = { skill: d, x: 0, y: 0, angle: 0, range: 90, mine: false, emitterBudget: 24 };
    expect(planCastFx({ ...base, x: Number.NaN })).toEqual([]);
    expect(planCastFx({ ...base, y: Infinity })).toEqual([]);
    expect(planCastFx({ ...base, angle: Number.NaN })).toEqual([]);
    expect(planCastFx({ ...base, range: Number.NaN })).toEqual([]);
    expect(planCastFx({ ...base, range: 0 })).toEqual([]);
    expect(planCastFx({ ...base, range: -5 })).toEqual([]);
    expect(planCastFx({ ...base, skill: def("kim_chung_trao"), range: 0 })).toHaveLength(1);
  });
});
