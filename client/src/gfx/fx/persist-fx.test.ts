import { describe, expect, it } from "vitest";
import { SKILLS_M7, SKILL_LIMITS } from "@tien-gioi/shared";
import { castTint } from "./cast-fx";
import {
  PERSIST_ARM_FLASH_MS,
  PERSIST_FADE_IN_MS,
  PERSIST_FADE_OUT_MS,
  PERSIST_MS_MAX,
  PERSIST_POP_BODY_MS,
  PERSIST_POP_MS,
  PERSIST_R_MAX,
  PERSIST_R_MIN,
  parsePersist,
  parsePersistEnd,
  persistAlive,
  persistAlpha,
  persistArmFlash,
  persistArmed,
  persistLifeEnd,
  persistLimits,
  persistPlan,
  persistPopProgress,
  persistPulse,
  persistSlot,
  planPersistPop,
  type PersistEnd,
  type PersistSlotItem,
} from "./persist-fx";

const def = SKILLS_M7[0]!;
const good = { kind: "zone", by: "s1", skill: def.id, id: 7, x: 100, y: 200, r: 80, ms: 5000 };

describe("parsePersist: tin vật thể bền", () => {
  it("nhận đủ bốn hình và trả bản sạch", () => {
    for (const kind of ["zone", "trap", "totem", "aura"]) {
      const p = parsePersist({ ...good, kind });
      expect(p?.kind).toBe(kind);
      expect(p).toMatchObject({ by: "s1", skill: def.id, id: 7, x: 100, y: 200, r: 80, ms: 5000 });
    }
  });
  it("bỏ trường thừa (không chép nguyên tin)", () => {
    const p = parsePersist({ ...good, extra: "x", __proto__: { evil: 1 } });
    expect(p).not.toBeNull();
    expect(Object.keys(p!).sort()).toEqual(
      ["by", "id", "kind", "ms", "r", "skill", "x", "y"].sort(),
    );
  });
  it("kẹp r vào [R_MIN, R_MAX] và ms vào [1, MS_MAX], làm tròn ms", () => {
    expect(parsePersist({ ...good, r: 1 })?.r).toBe(PERSIST_R_MIN);
    expect(parsePersist({ ...good, r: 1e6 })?.r).toBe(PERSIST_R_MAX);
    expect(parsePersist({ ...good, ms: 0.2 })?.ms).toBe(1);
    expect(parsePersist({ ...good, ms: 1e9 })?.ms).toBe(PERSIST_MS_MAX);
    expect(parsePersist({ ...good, ms: 1234.6 })?.ms).toBe(1235);
  });
  it("tin hỏng thì bỏ CẢ tin", () => {
    const bad: Array<[string, unknown]> = [
      ["null", null],
      ["mảng", [good]],
      ["chuỗi", "zone"],
      ["kind lạ", { ...good, kind: "wall" }],
      ["kind độc", { ...good, kind: "constructor" }],
      ["kind thiếu", { ...good, kind: undefined }],
      ["by rỗng", { ...good, by: "" }],
      ["by số", { ...good, by: 5 }],
      ["by quá dài", { ...good, by: "a".repeat(65) }],
      ["skill rỗng", { ...good, skill: "" }],
      ["id âm", { ...good, id: -1 }],
      ["id lẻ", { ...good, id: 1.5 }],
      ["id chuỗi", { ...good, id: "7" }],
      ["id quá lớn", { ...good, id: 2 ** 40 }],
      ["x NaN", { ...good, x: NaN }],
      ["y vô cực", { ...good, y: Infinity }],
      ["x quá biên", { ...good, x: 1e9 }],
      ["r 0", { ...good, r: 0 }],
      ["r âm", { ...good, r: -3 }],
      ["r chuỗi", { ...good, r: "80" }],
      ["ms 0", { ...good, ms: 0 }],
      ["ms âm", { ...good, ms: -1 }],
      ["ms NaN", { ...good, ms: NaN }],
    ];
    for (const [name, raw] of bad) expect(parsePersist(raw), name).toBeNull();
  });
});

describe("parsePersistEnd: tin fxEnd", () => {
  const e = { id: 7, x: 10, y: 20, why: "pop" };
  it("nhận pop / gone", () => {
    expect(parsePersistEnd(e)).toEqual(e);
    expect(parsePersistEnd({ ...e, why: "gone" })?.why).toBe("gone");
  });
  it("hỏng thì null", () => {
    for (const raw of [
      null,
      [],
      { ...e, id: -1 },
      { ...e, id: 0.5 },
      { ...e, id: "7" },
      { ...e, why: "boom" },
      { ...e, why: undefined },
      { ...e, x: NaN },
      { ...e, y: 1e9 },
    ])
      expect(parsePersistEnd(raw)).toBeNull();
  });
});

describe("persistPlan", () => {
  const m = parsePersist({ ...good, kind: "trap" })!;
  it("màu theo hệ của chiêu, cờ mine", () => {
    const p = persistPlan(m, def, true);
    expect(p.tint).toBe(castTint(def.element));
    expect(p.mine).toBe(true);
    expect(persistPlan(m, def, false).mine).toBe(false);
  });
  it("bẫy lấy armMs của chiêu, kẹp không dài hơn ms; hình khác armMs = 0", () => {
    expect(persistPlan(m, { ...def, armMs: 900 }, false).armMs).toBe(900);
    expect(persistPlan(m, { ...def, armMs: 99_999 }, false).armMs).toBe(m.ms);
    expect(persistPlan(m, { ...def, armMs: -5 }, false).armMs).toBe(0);
    expect(persistPlan(m, def, false).armMs).toBe(0);
    expect(persistPlan({ ...m, kind: "zone" }, { ...def, armMs: 900 }, false).armMs).toBe(0);
  });
  it("tickMs kẹp [200, 5000], thiếu thì 800", () => {
    expect(persistPlan(m, def, false).tickMs).toBe(800);
    expect(persistPlan(m, { ...def, tickMs: 10 }, false).tickMs).toBe(200);
    expect(persistPlan(m, { ...def, tickMs: 99_999 }, false).tickMs).toBe(5000);
    expect(persistPlan(m, { ...def, tickMs: 1000 }, false).tickMs).toBe(1000);
    expect(persistPlan(m, { ...def, tickMs: NaN }, false).tickMs).toBe(800);
  });
});

describe("vòng đời: persistLifeEnd / persistAlive / persistAlpha", () => {
  const plan = { ms: 5000 };
  const gone = (at: number): PersistEnd => ({ at, why: "gone" });
  const pop = (at: number): PersistEnd => ({ at, why: "pop" });

  it("tự nhiên: sống tới đúng ms, rồi gỡ (KHÔNG cần fxEnd)", () => {
    expect(persistLifeEnd(plan, null)).toBe(5000);
    expect(persistAlive(plan, 4999, null)).toBe(true);
    expect(persistAlive(plan, 5000, null)).toBe(false);
  });
  it("fxEnd gone: gỡ sau PERSIST_FADE_OUT_MS; pop: sau PERSIST_POP_MS", () => {
    expect(persistLifeEnd(plan, gone(1000))).toBe(1000 + PERSIST_FADE_OUT_MS);
    expect(persistLifeEnd(plan, pop(1000))).toBe(1000 + PERSIST_POP_MS);
  });
  it("fxEnd sát hạn ms thì không sống quá ms", () => {
    expect(persistLifeEnd(plan, gone(4900))).toBe(5000);
    expect(persistLifeEnd(plan, pop(4990))).toBe(5000);
  });
  it("hiện dần lúc dựng (0 -> 1 trong PERSIST_FADE_IN_MS)", () => {
    expect(persistAlpha(plan, 0, null)).toBe(0);
    expect(persistAlpha(plan, PERSIST_FADE_IN_MS / 2, null)).toBeCloseTo(0.5, 5);
    expect(persistAlpha(plan, PERSIST_FADE_IN_MS, null)).toBe(1);
    expect(persistAlpha(plan, 2500, null)).toBe(1);
  });
  it("tự nhiên: mờ dần trong PERSIST_FADE_OUT_MS cuối, về 0 ở ms", () => {
    expect(persistAlpha(plan, 5000 - PERSIST_FADE_OUT_MS, null)).toBe(1);
    expect(persistAlpha(plan, 5000 - PERSIST_FADE_OUT_MS / 2, null)).toBeCloseTo(0.5, 5);
    expect(persistAlpha(plan, 5000, null)).toBe(0);
    expect(persistAlpha(plan, 9000, null)).toBe(0);
  });
  it("gone: đậm tới lúc fxEnd rồi mờ dần; pop: thân tắt nhanh hơn", () => {
    expect(persistAlpha(plan, 999, gone(1000))).toBe(1);
    expect(persistAlpha(plan, 1000 + PERSIST_FADE_OUT_MS / 2, gone(1000))).toBeCloseTo(0.5, 5);
    expect(persistAlpha(plan, 1000 + PERSIST_FADE_OUT_MS, gone(1000))).toBe(0);
    expect(persistAlpha(plan, 1000 + PERSIST_POP_BODY_MS, pop(1000))).toBe(0);
    expect(persistAlpha(plan, 1000 + PERSIST_POP_BODY_MS / 2, pop(1000))).toBeCloseTo(0.5, 5);
  });
  it("độ đậm luôn trong [0, 1], kể cả thời gian âm / vô lý", () => {
    for (const el of [-100, 0, 1, 100, 4000, 4999, 5000, 1e9])
      for (const end of [null, gone(1000), pop(1000)]) {
        const a = persistAlpha(plan, el, end);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
  });
});

describe("persistPopProgress / bẫy kích hoạt / nhịp", () => {
  it("vòng nổ chỉ có sau fxEnd pop, 0 -> 1 trong PERSIST_POP_MS", () => {
    expect(persistPopProgress(500, null)).toBe(-1);
    expect(persistPopProgress(500, { at: 1000, why: "gone" })).toBe(-1);
    expect(persistPopProgress(500, { at: 1000, why: "pop" })).toBe(-1);
    expect(persistPopProgress(1000, { at: 1000, why: "pop" })).toBe(0);
    expect(persistPopProgress(1000 + PERSIST_POP_MS / 2, { at: 1000, why: "pop" })).toBeCloseTo(
      0.5,
      5,
    );
    expect(persistPopProgress(1e6, { at: 1000, why: "pop" })).toBe(1);
  });
  it("bẫy chưa kích hoạt trước armMs; hình khác luôn hoạt động", () => {
    const trap = { kind: "trap" as const, armMs: 800 };
    expect(persistArmed(trap, 799)).toBe(false);
    expect(persistArmed(trap, 800)).toBe(true);
    expect(persistArmed({ kind: "zone", armMs: 0 }, 0)).toBe(true);
    expect(persistArmed({ kind: "totem", armMs: 0 }, 0)).toBe(true);
  });
  it("chớp lúc bẫy vừa kích hoạt, tắt dần trong PERSIST_ARM_FLASH_MS; hình khác / armMs 0 không chớp", () => {
    const trap = { kind: "trap" as const, armMs: 800 };
    expect(persistArmFlash(trap, 799)).toBe(0);
    expect(persistArmFlash(trap, 800)).toBe(1);
    expect(persistArmFlash(trap, 800 + PERSIST_ARM_FLASH_MS / 2)).toBeCloseTo(0.5, 5);
    expect(persistArmFlash(trap, 800 + PERSIST_ARM_FLASH_MS)).toBe(0);
    expect(persistArmFlash({ kind: "trap", armMs: 0 }, 10)).toBe(0);
    expect(persistArmFlash({ kind: "zone", armMs: 800 }, 800)).toBe(0);
  });
  it("pha nhịp tuần hoàn trong [0, 1)", () => {
    const p = { tickMs: 500 };
    expect(persistPulse(p, 0)).toBe(0);
    expect(persistPulse(p, 250)).toBeCloseTo(0.5, 5);
    expect(persistPulse(p, 500)).toBe(0);
    expect(persistPulse(p, 625)).toBeCloseTo(0.25, 5);
    expect(persistPulse(p, -10)).toBe(0);
    expect(persistPulse(p, NaN)).toBe(0);
  });
  it("hạt nổ: bụi tại chỗ bẫy, tô theo hệ, ưu tiên của mình cao hơn", () => {
    const mine = planPersistPop({ mine: true, tint: 0xff0000 }, 50, 60);
    const other = planPersistPop({ mine: false, tint: 0xff0000 }, 50, 60);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ x: 50, tint: 0xff0000, delayMs: 0, priority: 2 });
    expect(other[0]!.priority).toBe(1);
    expect(mine[0]!.y).toBeLessThanOrEqual(60);
  });
});

describe("persistLimits: trần theo bậc chất lượng, cùng nguồn với máy chủ", () => {
  it("mỗi chủ = persistPerPlayerMax ở mọi bậc; tổng tăng theo bậc, không quá persistPerRoomMax", () => {
    for (const b of [4, 10, 24, 40]) {
      expect(persistLimits(b).perOwner).toBe(SKILL_LIMITS.persistPerPlayerMax);
      expect(persistLimits(b).total).toBeLessThanOrEqual(SKILL_LIMITS.persistPerRoomMax);
    }
    expect(persistLimits(4).total).toBe(12);
    expect(persistLimits(10).total).toBe(24);
    expect(persistLimits(24).total).toBe(SKILL_LIMITS.persistPerRoomMax);
  });
  it("chi tiết (sóng lan, vòng quay) chỉ từ bậc Vừa; ngân sách hỏng coi như Thấp", () => {
    expect(persistLimits(4).detail).toBe(false);
    expect(persistLimits(10).detail).toBe(true);
    expect(persistLimits(NaN)).toEqual(persistLimits(4));
  });
});

describe("persistSlot: chỗ cho vật thể mới", () => {
  const item = (id: number, by: string, start: number, mine = false): PersistSlotItem => ({
    plan: { id, by, mine },
    start,
  });
  const lim = { total: 6, perOwner: 2, detail: true };

  it("còn chỗ thì thêm mới (-1)", () => {
    expect(persistSlot([], { id: 1, by: "a", mine: false }, lim)).toBe(-1);
    expect(persistSlot([item(1, "a", 0)], { id: 2, by: "a", mine: false }, lim)).toBe(-1);
  });
  it("cùng id thì cập nhật đúng cái đó (tin gửi lại), không thêm", () => {
    const items = [item(1, "a", 0), item(2, "b", 5), item(3, "a", 9)];
    expect(persistSlot(items, { id: 2, by: "b", mine: false }, lim)).toBe(1);
  });
  it("chủ đủ phần thì thay cái sớm nhất CỦA CHỦ ĐÓ, không đụng người khác", () => {
    const items = [item(1, "a", 50), item(2, "b", 0), item(3, "a", 10)];
    expect(persistSlot(items, { id: 4, by: "a", mine: false }, lim)).toBe(2);
  });
  it("tổng đủ thì thay cái sớm nhất của NGƯỜI KHÁC, không đụng của mình", () => {
    const items = [
      item(1, "me", 0, true),
      item(2, "x", 30),
      item(3, "y", 20),
      item(4, "z", 40),
      item(5, "w", 50),
      item(6, "v", 60),
    ];
    expect(persistSlot(items, { id: 7, by: "u", mine: false }, lim)).toBe(2);
  });
  it("tổng đủ mà toàn của mình thì thay cái sớm nhất", () => {
    const items = [
      item(1, "me", 30, true),
      item(2, "me", 10, true),
      item(3, "me", 20, true),
      item(4, "me", 40, true),
      item(5, "me", 50, true),
      item(6, "me", 60, true),
    ];
    // chủ "me" đã đủ phần (perOwner 2) -> thay cái sớm nhất của chính chủ
    expect(persistSlot(items, { id: 7, by: "me", mine: true }, lim)).toBe(1);
  });
  it("mô phỏng 30 người x 4 vật thể: số đang giữ không bao giờ vượt tổng / mỗi chủ", () => {
    for (const b of [4, 10, 24]) {
      const L = persistLimits(b);
      const items: Array<PersistSlotItem & { plan: { id: number; by: string; mine: boolean } }> =
        [];
      let id = 0;
      for (let t = 0; t < 400; t++) {
        const by = "p" + (t % 30);
        const k = persistSlot(items, { id: ++id, by, mine: by === "p0" }, L);
        const it = { plan: { id, by, mine: by === "p0" }, start: t };
        if (k >= 0) items[k] = it;
        else items.push(it);
        expect(items.length).toBeLessThanOrEqual(L.total);
        const own = items.filter((x) => x.plan.by === by).length;
        expect(own).toBeLessThanOrEqual(L.perOwner);
      }
    }
  });
});
