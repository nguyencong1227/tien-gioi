import { describe, expect, it } from "vitest";
import {
  QI_MAX_POINTS,
  QI_STEP_PX,
  QI_TRAVEL_MS,
  QI_Y_OFFSET,
  planSlashEdges,
  planSwordBeam,
  qiPointsFor,
  slashEdgesFor,
} from "./skill-fx";
import { getRecipe, recipeCost, validateRecipe } from "./recipes";
import { SKILL_RECIPES } from "./recipes-skill";

describe("gfx/fx: công thức công pháp (#329)", () => {
  it("mọi công thức hợp lệ, đã đăng ký, chi phí khai báo nhỏ (<= 10 hạt, <= 0,5 s); không rung / chớp", () => {
    expect(SKILL_RECIPES.map((r) => r.id).sort()).toEqual(["slash-edge", "sword-qi", "sword-tip"]);
    for (const r of SKILL_RECIPES) {
      validateRecipe(r);
      expect(getRecipe(r.id)).toBe(r);
      const c = recipeCost(r);
      expect(c.particles).toBeLessThanOrEqual(10);
      expect(c.ms).toBeLessThanOrEqual(500);
      expect(r.shake || r.flash).toBeFalsy();
    }
  });
});

describe("gfx/fx: planSwordBeam", () => {
  it("kiếm khí tầm 260 px: rải đều dọc đường bay (không ở gốc), mũi ở đúng cuối tầm, trễ tăng dần tới thời gian bay", () => {
    const pts = planSwordBeam(100, 200, 0, 260, true, 0xabcdef);
    const qi = pts.filter((p) => p.recipe === "sword-qi");
    const tip = pts.filter((p) => p.recipe === "sword-tip");
    expect(qi.length).toBe(Math.min(QI_MAX_POINTS, Math.ceil(260 / QI_STEP_PX)));
    expect(tip.length).toBe(1);
    expect(tip[0].x).toBeCloseTo(360, 6);
    expect(tip[0].y).toBeCloseTo(200 + QI_Y_OFFSET, 6);
    expect(tip[0].delayMs).toBe(QI_TRAVEL_MS);
    for (let i = 0; i < qi.length; i++) {
      expect(qi[i].x).toBeGreaterThan(100); // không chồng lên nhân vật
      expect(qi[i].x).toBeLessThan(360);
      if (i > 0) {
        expect(qi[i].x).toBeGreaterThan(qi[i - 1].x);
        expect(qi[i].delayMs).toBeGreaterThan(qi[i - 1].delayMs);
      }
      expect(qi[i].angle).toBe(0); // sword-qi có hướng
    }
    expect(tip[0].angle).toBeUndefined(); // sword-tip toả mọi hướng (lõi ép nón nếu truyền angle)
    for (const p of pts) expect(p.tint).toBe(0xabcdef);
  });

  it("của mình ưu tiên 2, người khác 1; số điểm bị chặn ở QI_MAX_POINTS dù tầm xa", () => {
    expect(planSwordBeam(0, 0, 1, 260, true, 1).every((p) => p.priority === 2)).toBe(true);
    expect(planSwordBeam(0, 0, 1, 260, false, 1).every((p) => p.priority === 1)).toBe(true);
    const far = planSwordBeam(0, 0, 0, 5000, false, 1);
    expect(far.filter((p) => p.recipe === "sword-qi").length).toBe(QI_MAX_POINTS);
  });

  it("hướng chéo: điểm cuối đúng toạ độ lượng giác; tầm tối thiểu vẫn có ít nhất một điểm qi", () => {
    const a = Math.PI / 3;
    const tip = planSwordBeam(0, 0, a, 100, true, 0).find((p) => p.recipe === "sword-tip")!;
    expect(tip.x).toBeCloseTo(Math.cos(a) * 100, 6);
    expect(tip.y).toBeCloseTo(QI_Y_OFFSET + Math.sin(a) * 100, 6);
    expect(planSwordBeam(0, 0, 0, 10, true, 0).filter((p) => p.recipe === "sword-qi").length).toBe(
      1,
    );
  });

  it("dữ liệu hỏng (NaN, tầm <= 0) thì không phát gì; mọi công thức được chọn có trong sổ", () => {
    expect(planSwordBeam(Number.NaN, 0, 0, 100, true, 0)).toEqual([]);
    expect(planSwordBeam(0, 0, 0, 0, true, 0)).toEqual([]);
    expect(planSwordBeam(0, 0, 0, -5, true, 0)).toEqual([]);
    for (const p of planSwordBeam(0, 0, 0, 260, true, 0)) expect(getRecipe(p.recipe)).toBeDefined();
  });
});

describe("gfx/fx: planSlashEdges", () => {
  it("hai đầu cung đối xứng quanh hướng chém, cách gốc 90 % tầm, phát ngay", () => {
    const arc = Math.PI * 0.6;
    const pts = planSlashEdges(0, 0, 0, 64, arc, true, 0xffffff);
    expect(pts.length).toBe(2);
    for (const p of pts) {
      expect(p.recipe).toBe("slash-edge");
      expect(p.delayMs).toBe(0);
      expect(p.priority).toBe(2);
      expect(Math.hypot(p.x, p.y + 8)).toBeCloseTo(64 * 0.9, 6);
    }
    expect(pts[0].x).toBeCloseTo(pts[1].x, 6); // đối xứng qua trục chém (hướng 0)
    expect(pts[0].y + 8).toBeCloseTo(-(pts[1].y + 8), 6);
    expect(planSlashEdges(0, 0, 0, 64, arc, false, 0)[0].priority).toBe(1);
    expect(planSlashEdges(0, 0, 0, 0, arc, true, 0)).toEqual([]);
  });
});

describe("gfx/fx: ngân sách emitter theo hồ sơ chất lượng (nit A ở #356)", () => {
  it("qiPointsFor: Thấp (4) -> 1, Vừa (10) -> 3, Cao (24) -> 5 (trần); giá trị hỏng -> 1", () => {
    expect(qiPointsFor(4)).toBe(1);
    expect(qiPointsFor(10)).toBe(3);
    expect(qiPointsFor(24)).toBe(QI_MAX_POINTS);
    expect(qiPointsFor(1000)).toBe(QI_MAX_POINTS);
    expect(qiPointsFor(0)).toBe(1);
    expect(qiPointsFor(Number.NaN)).toBe(1);
  });

  it("một đòn kiếm khí của mình dùng <= 1/3 + 1 emitter ngân sách ở mọi bậc (chừa chỗ cho người khác)", () => {
    for (const budget of [4, 10, 24]) {
      const pts = planSwordBeam(0, 0, 0, 260, true, 0, qiPointsFor(budget));
      expect(pts.length).toBeLessThanOrEqual(Math.floor(budget / 3) + 1);
      expect(pts.filter((p) => p.recipe === "sword-tip").length).toBe(1); // mũi luôn có
    }
    // bậc Thấp: 1 điểm qi + mũi, điểm qi vẫn nằm giữa đường bay
    const low = planSwordBeam(0, 0, 0, 260, true, 0, qiPointsFor(4));
    expect(low.length).toBe(2);
    expect(low[0].x).toBeGreaterThan(0);
    expect(low[0].x).toBeLessThan(260);
  });

  it("planSwordBeam: maxQi mặc định = trần cũ (không đổi hành vi); maxQi 0 / âm / NaN kẹp về 1", () => {
    expect(planSwordBeam(0, 0, 0, 260, true, 0).length).toBe(
      planSwordBeam(0, 0, 0, 260, true, 0, QI_MAX_POINTS).length,
    );
    expect(planSwordBeam(0, 0, 0, 260, true, 0, 0).length).toBe(2);
    expect(planSwordBeam(0, 0, 0, 260, true, 0, -3).length).toBe(2);
    expect(planSwordBeam(0, 0, 0, 5000, true, 0, 99).length).toBe(QI_MAX_POINTS + 1);
  });

  it("slashEdgesFor: bậc Thấp (<= 4) một đầu cung, còn lại hai; planSlashEdges theo số đầu", () => {
    expect(slashEdgesFor(4)).toBe(1);
    expect(slashEdgesFor(10)).toBe(2);
    expect(slashEdgesFor(24)).toBe(2);
    expect(slashEdgesFor(Number.NaN)).toBe(2);
    expect(planSlashEdges(0, 0, 0, 64, 1, true, 0, 1).length).toBe(1);
    expect(planSlashEdges(0, 0, 0, 64, 1, true, 0, 2).length).toBe(2);
    expect(planSlashEdges(0, 0, 0, 64, 1, true, 0).length).toBe(2);
  });
});
