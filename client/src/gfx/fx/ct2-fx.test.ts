import { describe, expect, it } from "vitest";
import { AMP_ELEMENTS, CHAIN_FX_POINTS_MAX, markIndexOf } from "@tien-gioi/shared";
import { ELEMENT_COLOR } from "../../skill-bar";
import { castTint } from "./cast-fx";
import {
  CHAIN_NODE_RECIPE,
  CHAIN_SEG_MS,
  CHAIN_SPARK_RECIPE,
  CHAIN_STEP_PX,
  CHAIN_Y_OFFSET,
  COMBO_BURST_RECIPE,
  COMBO_DEFAULT_TINT,
  COMBO_RING_PX,
  comboTint,
  parseChainPts,
  planChainFx,
  planComboBurst,
} from "./ct2-fx";
import { getRecipe, recipeCost, recipeIds } from "./recipes";

const flat = (...p: Array<[number, number]>) => p.flat();
const PTS = parseChainPts(flat([100, 100], [200, 100], [300, 140], [400, 140]))!;

describe("parseChainPts (không tin tin nhắn)", () => {
  it("tin hợp lệ -> các điểm", () => {
    expect(parseChainPts([1, 2, 3, 4])).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(
      parseChainPts(Array.from({ length: CHAIN_FX_POINTS_MAX * 2 }, (_, i) => i)),
    ).toHaveLength(CHAIN_FX_POINTS_MAX);
  });
  it("sai dạng thì bỏ CẢ tin: không phải mảng, độ dài lẻ, ít hơn 2 điểm, nhiều hơn trần, số lạ, sai kiểu", () => {
    const bad: unknown[] = [
      null,
      undefined,
      5,
      "x",
      {},
      [],
      [1, 2],
      [1, 2, 3],
      Array.from({ length: (CHAIN_FX_POINTS_MAX + 1) * 2 }, () => 1),
      [1, 2, NaN, 4],
      [1, 2, Infinity, 4],
      [1, 2, "3", 4],
      [1, 2, null, 4],
      [1, 2, 3, 1e9],
      [1, 2, 3, -1e9],
    ];
    for (const b of bad) expect(parseChainPts(b), JSON.stringify(b)).toBeNull();
  });
});

describe("planChainFx: tia sét lan", () => {
  const base = { skill: { element: "loi" }, pts: PTS, mine: false, emitterBudget: 24 } as const;
  it("rải tia lửa dọc từng đoạn + chớp ở mỗi mục tiêu (không chớp ở người dùng); màu theo HỆ", () => {
    const out = planChainFx(base);
    const nodes = out.filter((p) => p.recipe === CHAIN_NODE_RECIPE);
    const sparks = out.filter((p) => p.recipe === CHAIN_SPARK_RECIPE);
    expect(nodes).toHaveLength(PTS.length - 1);
    expect(sparks.length).toBeGreaterThanOrEqual(PTS.length - 1);
    expect(out.every((p) => p.tint === castTint("loi"))).toBe(true);
    expect(castTint("loi")).toBe(Number.parseInt(ELEMENT_COLOR.loi.slice(1), 16));
    // chớp nằm ĐÚNG ở các mục tiêu (từ điểm thứ hai), lệch lên CHAIN_Y_OFFSET
    expect(nodes.map((p) => [p.x, p.y])).toEqual(
      PTS.slice(1).map((p) => [p.x, p.y + CHAIN_Y_OFFSET]),
    );
  });
  it("các đoạn đi NỐI TIẾP: chớp đoạn i trễ (i + 1) x CHAIN_SEG_MS, tia lửa của đoạn i nằm trong khoảng của nó", () => {
    const out = planChainFx(base);
    const nodes = out.filter((p) => p.recipe === CHAIN_NODE_RECIPE);
    nodes.forEach((n, i) => expect(n.delayMs).toBe((i + 1) * CHAIN_SEG_MS));
    for (const s of out.filter((p) => p.recipe === CHAIN_SPARK_RECIPE)) {
      expect(s.delayMs).toBeGreaterThanOrEqual(0);
      expect(s.delayMs).toBeLessThanOrEqual((PTS.length - 1) * CHAIN_SEG_MS);
    }
  });
  it("tia lửa dọc đoạn nằm gần đoạn (lệch ngang <= 6 px) và hướng theo đoạn", () => {
    const out = planChainFx({ ...base, pts: parseChainPts(flat([0, 0], [280, 0]))! });
    const sparks = out.filter((p) => p.recipe === CHAIN_SPARK_RECIPE);
    expect(sparks.length).toBeGreaterThan(1);
    for (const s of sparks) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(280);
      expect(Math.abs(s.y - CHAIN_Y_OFFSET)).toBeLessThanOrEqual(6);
      expect(s.angle).toBe(0);
    }
    // đoạn dài hơn thì nhiều tia hơn (tới trần mỗi đoạn)
    const short = planChainFx({ ...base, pts: parseChainPts(flat([0, 0], [CHAIN_STEP_PX, 0]))! });
    expect(short.filter((p) => p.recipe === CHAIN_SPARK_RECIPE).length).toBeLessThan(sparks.length);
  });
  it("bậc Thấp (ngân sách 4): CHỈ chớp ở mục tiêu, không rải dọc tia; ngân sách lớn thì nhiều điểm hơn nhưng có trần", () => {
    const low = planChainFx({ ...base, emitterBudget: 4 });
    expect(low.every((p) => p.recipe === CHAIN_NODE_RECIPE)).toBe(true);
    expect(low).toHaveLength(PTS.length - 1);
    const mid = planChainFx({ ...base, emitterBudget: 10 });
    const high = planChainFx({ ...base, emitterBudget: 40 });
    expect(mid.length).toBeGreaterThan(low.length);
    expect(high.length).toBeGreaterThanOrEqual(mid.length);
    // trần cứng: tối đa (điểm - 1) đoạn x (6 tia + 1 chớp)
    expect(high.length).toBeLessThanOrEqual((PTS.length - 1) * 7);
  });
  it("của mình ưu tiên 2, của người khác ưu tiên 1", () => {
    expect(planChainFx({ ...base, mine: true }).every((p) => p.priority === 2)).toBe(true);
    expect(planChainFx(base).every((p) => p.priority === 1)).toBe(true);
  });
  it("dữ liệu hỏng -> [] (không ném lỗi); đoạn dài 0 vẫn có chớp; không đổi đầu vào", () => {
    expect(planChainFx({ ...base, pts: [] })).toEqual([]);
    expect(planChainFx({ ...base, pts: [{ x: 1, y: 1 }] })).toEqual([]);
    expect(
      planChainFx({
        ...base,
        pts: [
          { x: NaN, y: 1 },
          { x: 2, y: 2 },
        ],
      }),
    ).toEqual([]);
    expect(planChainFx({ ...base, emitterBudget: NaN }).length).toBeGreaterThan(0);
    const zero = planChainFx({ ...base, pts: parseChainPts(flat([5, 5], [5, 5]))! });
    expect(zero).toHaveLength(1);
    const copy = JSON.stringify(PTS);
    planChainFx(base);
    expect(JSON.stringify(PTS)).toBe(copy);
  });
  it("tất định: hai lần gọi cho đúng cùng kết quả (không Math.random)", () => {
    expect(planChainFx(base)).toEqual(planChainFx(base));
  });
});

describe("vụ nổ dấu (combo)", () => {
  it("comboTint: mỗi chỉ số dấu 1-9 ra màu của hệ tương ứng; 0 / lạ / sai kiểu -> vàng mặc định", () => {
    for (const el of AMP_ELEMENTS) {
      expect(comboTint(markIndexOf(el)), el).toBe(castTint(el));
    }
    for (const v of [0, 10, -1, 1.5, NaN, "3", null, undefined, {}])
      expect(comboTint(v), String(v)).toBe(COMBO_DEFAULT_TINT);
  });
  it("một chớp ĐÚNG chỗ trúng (lệch lên), thêm vòng tia theo ngân sách; Thấp chỉ chớp", () => {
    const hi = planComboBurst({
      x: 300,
      y: 200,
      markIndex: markIndexOf("hoa"),
      mine: true,
      emitterBudget: 24,
    });
    expect(hi[0]).toMatchObject({
      recipe: COMBO_BURST_RECIPE,
      x: 300,
      y: 200 + CHAIN_Y_OFFSET,
      priority: 2,
    });
    expect(hi.length).toBeGreaterThan(1);
    expect(hi.every((p) => p.tint === castTint("hoa"))).toBe(true);
    for (const p of hi.slice(1)) {
      expect(Math.hypot(p.x - 300, p.y - (200 + CHAIN_Y_OFFSET))).toBeCloseTo(COMBO_RING_PX, 5);
    }
    const low = planComboBurst({ x: 300, y: 200, mine: false, emitterBudget: 4 });
    expect(low).toHaveLength(1);
    expect(low[0].priority).toBe(1);
    expect(low[0].tint).toBe(COMBO_DEFAULT_TINT);
  });
  it("toạ độ không hữu hạn -> []", () => {
    expect(planComboBurst({ x: NaN, y: 0, mine: true, emitterBudget: 24 })).toEqual([]);
    expect(planComboBurst({ x: 0, y: Infinity, mine: true, emitterBudget: 24 })).toEqual([]);
  });
});

describe("công thức hạt của CT2", () => {
  it("đã đăng ký, hợp lệ, ngân sách hạt chấp nhận được", () => {
    for (const id of [CHAIN_SPARK_RECIPE, CHAIN_NODE_RECIPE, COMBO_BURST_RECIPE]) {
      expect(recipeIds()).toContain(id);
      const r = getRecipe(id)!;
      expect(r.particles?.count).toBeGreaterThan(0);
      expect(recipeCost(r).particles).toBeLessThanOrEqual(14);
      expect(recipeCost(r).ms).toBeLessThanOrEqual(600); // tia sét là nháy ngắn: không để hạt trôi lâu
    }
    // vụ nổ dấu là nét nhấn: ưu tiên cao hơn tia lửa
    expect(getRecipe(COMBO_BURST_RECIPE)!.priority).toBeGreaterThan(
      getRecipe(CHAIN_SPARK_RECIPE)!.priority,
    );
  });
});
