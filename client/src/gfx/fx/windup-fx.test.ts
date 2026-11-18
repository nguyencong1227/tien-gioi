import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SKILLS_M7, SKILL_LIMITS, WINDUP_MAX_MS, type SkillDef } from "@tien-gioi/shared";
import { castTint } from "./cast-fx";
import {
  WINDUP_R_IN,
  WINDUP_R_OUT,
  planWindup,
  windupAlpha,
  windupCancelled,
  windupLimits,
  windupMsOfDef,
  windupProgress,
  windupRadius,
  windupSlot,
  type WindupSlotItem,
} from "./windup-fx";

const base = SKILLS_M7[0]!;
const wind = (windupMs?: number): SkillDef => ({ ...base, windupMs }) as SkillDef;
const cast = { by: "s1", skill: base.id, x: 100, y: 200, angle: 0.5, range: 150 };

describe("windupMsOfDef: kẹp đúng như máy chủ", () => {
  it("không khai / không hữu hạn / <= 0 là chiêu TỨC THỜI (0)", () => {
    for (const v of [undefined, 0, -5, NaN, Infinity, -Infinity, "800", null, {}])
      expect(windupMsOfDef({ windupMs: v as number | undefined })).toBe(0);
  });
  it("kẹp vào [windupMin, WINDUP_MAX_MS]", () => {
    expect(windupMsOfDef({ windupMs: 1 })).toBe(SKILL_LIMITS.windupMin);
    expect(windupMsOfDef({ windupMs: 800 })).toBe(800);
    expect(windupMsOfDef({ windupMs: 1e9 })).toBe(WINDUP_MAX_MS);
    expect(windupMsOfDef({ windupMs: WINDUP_MAX_MS })).toBe(WINDUP_MAX_MS);
  });
  it("chiêu thật hiện có đều tức thời (chưa chiêu nào khai windupMs)", () => {
    for (const d of SKILLS_M7) expect(windupMsOfDef(d), d.id).toBe(0);
  });
});

describe("planWindup: kế hoạch từ tin `fx cast`", () => {
  it("chiêu tức thời thì null (đi đường cũ, vẽ ngay)", () => {
    expect(planWindup(cast, wind(undefined), true)).toBeNull();
    expect(planWindup(cast, wind(0), true)).toBeNull();
  });
  it("chiêu vận: ms đã kẹp, màu theo hệ, của mình hay người khác, giữ hướng + tầm", () => {
    const p = planWindup(cast, wind(800), true)!;
    expect(p).toMatchObject({
      by: "s1",
      skill: base.id,
      x: 100,
      y: 200,
      angle: 0.5,
      range: 150,
      ms: 800,
      mine: true,
      tint: castTint(base.element),
    });
    expect(planWindup(cast, wind(50), false)!.ms).toBe(SKILL_LIMITS.windupMin);
    expect(planWindup(cast, wind(800), false)!.mine).toBe(false);
  });
  it("tầm âm kẹp về 0", () => {
    expect(planWindup({ ...cast, range: -30 }, wind(800), true)!.range).toBe(0);
  });
  it("tin hỏng thì null, không ném lỗi", () => {
    const bad: unknown[] = [
      null,
      undefined,
      "x",
      5,
      [],
      {},
      { ...cast, by: "" },
      { ...cast, by: 5 },
      { ...cast, by: "a".repeat(65) },
      { ...cast, skill: "" },
      { ...cast, skill: undefined },
      { ...cast, x: NaN },
      { ...cast, y: Infinity },
      { ...cast, x: "1" },
      { ...cast, angle: NaN },
      { ...cast, range: NaN },
      { ...cast, range: undefined },
      { ...cast, x: 100_001 },
      { ...cast, y: -100_001 },
    ];
    for (const b of bad) expect(planWindup(b, wind(800), true), JSON.stringify(b)).toBeNull();
  });
});

describe("tiến độ, bán kính, độ đậm", () => {
  it("windupProgress: tuyến tính, kẹp [0, 1]; ms không dương / thời gian lạ = 0", () => {
    expect(windupProgress(800, 0)).toBe(0);
    expect(windupProgress(800, 400)).toBe(0.5);
    expect(windupProgress(800, 800)).toBe(1);
    expect(windupProgress(800, 99999)).toBe(1);
    for (const e of [-1, NaN, -Infinity, Infinity]) expect(windupProgress(800, e)).toBe(0);
    expect(windupProgress(0, 100)).toBe(0);
    expect(windupProgress(-5, 100)).toBe(0);
  });
  it("windupRadius: từ R_OUT thu vào R_IN, giảm đơn điệu, kẹp, số lạ = R_OUT", () => {
    expect(windupRadius(0)).toBe(WINDUP_R_OUT);
    expect(windupRadius(1)).toBe(WINDUP_R_IN);
    let prev = Infinity;
    for (let i = 0; i <= 10; i++) {
      const r = windupRadius(i / 10);
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
    expect(windupRadius(-3)).toBe(WINDUP_R_OUT);
    expect(windupRadius(9)).toBe(WINDUP_R_IN);
    expect(windupRadius(NaN)).toBe(WINDUP_R_OUT);
    // thu nhanh lúc đầu (ease-out): nửa thời gian đã vào quá nửa quãng
    expect(windupRadius(0.5)).toBeLessThan((WINDUP_R_OUT + WINDUP_R_IN) / 2);
  });
  it("windupAlpha: đậm dần tới lúc đáp, của mình đậm hơn, trong (0, 1]", () => {
    expect(windupAlpha(1, false)).toBeGreaterThan(windupAlpha(0, false));
    expect(windupAlpha(0.5, true)).toBeGreaterThan(windupAlpha(0.5, false));
    for (const p of [0, 0.3, 1, NaN, -1, 9]) {
      for (const mine of [true, false]) {
        const a = windupAlpha(p, mine);
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("windupCancelled", () => {
  it("huỷ khi mất khỏi state, chết, hoặc (của mình) choáng; không thì không", () => {
    expect(windupCancelled({ gone: false, dead: false, stunned: false })).toBe(false);
    expect(windupCancelled({ gone: true, dead: false, stunned: false })).toBe(true);
    expect(windupCancelled({ gone: false, dead: true, stunned: false })).toBe(true);
    expect(windupCancelled({ gone: false, dead: false, stunned: true })).toBe(true);
  });
});

describe("windupLimits / windupSlot", () => {
  it("trần theo ngân sách emitter: Thấp 4, Vừa 5, Cao 12, tối đa 16; số lạ như Thấp", () => {
    expect(windupLimits(4)).toEqual({ total: 4, detail: false });
    expect(windupLimits(10)).toEqual({ total: 5, detail: true });
    expect(windupLimits(24)).toEqual({ total: 12, detail: true });
    expect(windupLimits(100)).toEqual({ total: 16, detail: true });
    expect(windupLimits(NaN)).toEqual(windupLimits(4));
  });

  const it_ = (by: string, start: number, mine = false): WindupSlotItem => ({
    plan: { by, mine },
    start,
  });
  const lim = windupLimits(4); // tổng 4

  it("còn chỗ thì thêm mới (-1); cùng người vận lần mới thì THAY lần cũ của người đó", () => {
    expect(windupSlot([], { by: "a", mine: false }, lim)).toBe(-1);
    expect(windupSlot([it_("a", 1), it_("b", 2)], { by: "c", mine: false }, lim)).toBe(-1);
    expect(windupSlot([it_("a", 1), it_("b", 2)], { by: "b", mine: false }, lim)).toBe(1);
    // cùng người thay kể cả khi đã đủ trần (không đẩy người khác ra)
    const full = [it_("a", 1), it_("b", 2), it_("c", 3), it_("d", 4)];
    expect(windupSlot(full, { by: "c", mine: false }, lim)).toBe(2);
  });

  it("đủ trần: thay vòng cũ nhất của NGƯỜI KHÁC, không thay vòng của mình", () => {
    const items = [it_("me", 0, true), it_("x", 9), it_("y", 3), it_("z", 8)];
    expect(windupSlot(items, { by: "q", mine: false }, lim)).toBe(2);
    expect(windupSlot(items, { by: "r", mine: true }, lim)).toBe(2);
  });

  it("toàn vòng của mình mà đủ trần (không xảy ra thật vì mỗi người một vòng): thay cái cũ nhất", () => {
    const items = [it_("m1", 5, true), it_("m2", 1, true), it_("m3", 3, true), it_("m4", 4, true)];
    expect(windupSlot(items, { by: "m5", mine: true }, lim)).toBe(1);
  });

  it("nhiều người vận liên tục: tổng KHÔNG vượt trần, mỗi người tối đa một vòng", () => {
    const items: WindupSlotItem[] = [];
    const l = windupLimits(10);
    let t = 0;
    for (let round = 0; round < 40; round++)
      for (const by of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
        const k = windupSlot(items, { by, mine: false }, l);
        const entry = it_(by, t++);
        if (k >= 0) items[k] = entry;
        else items.push(entry);
        expect(items.length).toBeLessThanOrEqual(l.total);
        expect(items.filter((x) => x.plan.by === by).length).toBeLessThanOrEqual(1);
      }
  });
});

describe("tất định, không phụ thuộc đồng hồ máy", () => {
  it("nguồn không dùng Math.random / Date.now / performance.now", () => {
    for (const f of ["./windup-fx.ts", "./windup-layer.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
});
