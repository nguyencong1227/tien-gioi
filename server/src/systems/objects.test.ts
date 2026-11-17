// VẬT THỂ BỀN (mục 51, CT4 #1049): vùng (`zone`), bẫy (`trap`), hào quang (`aura`), tượng (`totem`). World giả; `Math.random` được ghim; đồng hồ phòng `w.now` trôi bằng tay.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKILL_BY_ID, SKILL_LIMITS, TICK_MS, type FxMsg, type SkillDef } from "@tien-gioi/shared";
import { cast } from "./cast";
import { PERSIST_KIND_MAX, isPersistShape, placeObject, tickObjects, type PObj } from "./objects";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const added: string[] = [];
function withSkill(over: Partial<SkillDef> & { id: string }): SkillDef {
  const def: SkillDef = { ...SKILL_BY_ID["bon_thach_quyen"]!, effects: [], ...over } as SkillDef;
  (SKILL_BY_ID as Record<string, SkillDef>)[def.id] = def;
  added.push(def.id);
  return def;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const id of added.splice(0)) delete (SKILL_BY_ID as Record<string, SkillDef>)[id];
});

function setup() {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 4, 0);
  a.p.x = 1000;
  a.p.y = 1000;
  a.p.mp = a.p.maxMp;
  t.w.now = 800_000;
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  return { ...t, ...a };
}
type T = ReturnType<typeof setup>;
const def = (t: T, over: Partial<SkillDef> & { shape: string }, slot = 0) => {
  const d = withSkill({
    id: `vat_${added.length}`,
    mult: 1,
    range: 100,
    reach: 0,
    element: "none",
    durationMs: 2000,
    tickMs: 500,
    ...over,
  } as Partial<SkillDef> & { id: string });
  t.c.skills.learned[d.id] = 1;
  t.c.skills.slots[slot] = d.id;
  return d;
};
const use = (t: T, slot: 2 | 3 | 4 | 5 = 2) => {
  cast(t.w, "a", { slot, angle: 0 });
  t.c.skillCd[slot - 2] = 0;
  t.p.mp = t.p.maxMp;
};
const mon = (t: T, x: number, y: number) => {
  const m = addMonster(t.w, "tho", x, y);
  m.m.hp = m.m.maxHp = 1e12;
  return m;
};
const dmgTo = (t: T, id: string) => t.dmgs.filter((d) => d.target === id);
/** Trôi `ms` ms theo bước 100 ms, chạy vật thể mỗi bước. */
const advance = (t: T, ms: number, step = 100) => {
  for (let e = 0; e < ms; e += step) {
    t.w.now += step;
    tickObjects(t.w);
  }
};
/** Các tin `fx` có `kind` chứa K (hình vật thể bền chung một kiểu có `kind` là hợp của bốn chuỗi). */
type FxKind<K extends FxMsg["kind"]> = FxMsg extends infer U
  ? U extends { kind: infer Q }
    ? [K] extends [Q]
      ? U
      : never
    : never
  : never;
const fxOf = <K extends FxMsg["kind"]>(t: T, k: K) =>
  t.fx.filter((f) => f.kind === k) as unknown as FxKind<K>[];
const dummy = (t: T, owner: string, n: number, kind: PObj["kind"] = "zone") => {
  for (let i = 0; i < n; i++)
    t.w.objs.push({
      id: ++t.w.objSeq,
      owner,
      skill: "x",
      kind,
      x: 0,
      y: 0,
      r: 10,
      until: t.w.now + 60_000,
      nextAt: t.w.now + 60_000,
      tickMs: 1000,
      strike: () => {},
    });
};

describe("hình nào là vật thể bền", () => {
  it("zone / trap / aura / totem có; hình khác và đầu vào lạ không (kể cả khoá nguyên mẫu)", () => {
    for (const k of Object.keys(PERSIST_KIND_MAX)) expect(isPersistShape(k)).toBe(true);
    for (const k of ["cone", "bolt", "dash", "ground", "constructor", "__proto__", "", 5, null])
      expect(isPersistShape(k), String(k)).toBe(false);
  });
});

describe("zone: vùng duy trì", () => {
  it("dựng cách `reach` px theo hướng, MỘT `fx zone` đúng id / tâm / bán kính / thời gian; id tăng dần theo phòng; `ms` kẹp trần", () => {
    const t = setup();
    def(t, { shape: "zone", reach: 100, range: 80, durationMs: 99_999 });
    use(t);
    const f = fxOf(t, "zone");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      by: "a",
      id: 1,
      x: 1100,
      y: 1000,
      r: 80,
      ms: SKILL_LIMITS.zoneDurationMax,
    });
    use(t);
    expect(fxOf(t, "zone")[1]!.id).toBe(2);
    expect(t.w.objs).toHaveLength(2);
  });

  it("không sát thương lúc dựng; mỗi `tickMs` MỘT lần với mọi quái trong vùng; quái ngoài vùng không; dừng khi hết hạn (không `fxEnd`)", () => {
    const t = setup();
    def(t, { shape: "zone", reach: 0, range: 100, durationMs: 2000, tickMs: 500 });
    const a = mon(t, 1050, 1000);
    const b = mon(t, 1060, 1010);
    const far = mon(t, 1600, 1000);
    use(t);
    expect(t.dmgs).toEqual([]);
    advance(t, 400);
    expect(dmgTo(t, a.id)).toHaveLength(0);
    advance(t, 100); // 500 ms
    expect(dmgTo(t, a.id)).toHaveLength(1);
    expect(dmgTo(t, b.id)).toHaveLength(1);
    advance(t, 1500); // hết 2000 ms: nhịp ở 500, 1000, 1500
    expect(dmgTo(t, a.id)).toHaveLength(3);
    expect(dmgTo(t, far.id)).toEqual([]);
    expect(t.w.objs).toEqual([]);
    expect(fxOf(t, "fxEnd")).toEqual([]);
    advance(t, 3000);
    expect(dmgTo(t, a.id)).toHaveLength(3); // không tác dụng thêm sau khi hết hạn
  });

  it("tính cả bán kính quái (thân chạm vòng); nhịp dưới sàn zoneTickMin bị kẹp lên", () => {
    const t = setup();
    def(t, { shape: "zone", range: 100, durationMs: 2000, tickMs: 50 });
    const edge = mon(t, 1000 + 100 + 10, 1000); // tâm ngoài 10 px nhưng thân quái chạm
    use(t);
    advance(t, SKILL_LIMITS.zoneTickMin - 100);
    expect(dmgTo(t, edge.id)).toEqual([]);
    advance(t, 100);
    expect(dmgTo(t, edge.id)).toHaveLength(1);
  });

  it("sát thương BẰNG chiêu `ground` cùng `mult` (một công thức chung)", () => {
    const g = setup();
    def(g, { shape: "ground", reach: 0, range: 100, mult: 1 });
    const mg = mon(g, 1040, 1000);
    use(g);
    const ground = dmgTo(g, mg.id)[0]!.amount;
    const z = setup();
    def(z, { shape: "zone", reach: 0, range: 100, mult: 1, tickMs: 500 });
    const mz = mon(z, 1040, 1000);
    use(z);
    advance(z, 500);
    expect(dmgTo(z, mz.id)[0]!.amount).toBe(ground);
  });

  it("dữ liệu thiếu `durationMs` / không hợp lệ: KHÔNG dựng (không fx, không vật thể); `taunt` lạ không gây lỗi", () => {
    for (const bad of [undefined, 0, -5, Number.NaN] as const) {
      const t = setup();
      def(t, { shape: "zone", durationMs: bad as never });
      use(t);
      expect(fxOf(t, "zone"), String(bad)).toEqual([]);
      expect(t.w.objs, String(bad)).toEqual([]);
    }
    const t = setup();
    def(t, { shape: "totem", taunt: true, range: 200, durationMs: 2000, tickMs: 800 });
    expect(() => use(t)).not.toThrow();
    expect(t.w.objs).toHaveLength(1);
  });

  it("đặt / đứng trong khu an toàn thì KHÔNG dựng (đã tốn linh lực + hồi chiêu)", () => {
    const t = setup();
    def(t, { shape: "zone", reach: 0 });
    vi.spyOn(t.w.map, "inSafe").mockReturnValue(true);
    const mp = t.p.mp;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.w.objs).toEqual([]);
    expect(fxOf(t, "zone")).toEqual([]);
    expect(t.p.mp).toBeLessThan(mp);
  });

  it("chỉ đánh QUÁI: đối thủ thách đấu đứng trong vùng không mất máu", () => {
    const t = setup();
    def(t, { shape: "zone", reach: 0, range: 200, durationMs: 2000, tickMs: 500 });
    const b = addPlayer(t.w, "b", 4, 0);
    b.p.x = 1050;
    b.p.y = 1000;
    t.w.duels._start({
      a: "a",
      b: "b",
      phase: "fight",
      fightAt: 0,
      endsAt: Infinity,
      ox: 0,
      oy: 0,
    });
    const hp = b.p.hp;
    use(t);
    advance(t, 2500);
    expect(b.p.hp).toBe(hp);
  });

  it("điểm luyện chiêu cộng MỘT lần mỗi lần đặt, dù vùng đánh nhiều lần nhiều quái", () => {
    const t = setup();
    const d = def(t, {
      shape: "zone",
      reach: 0,
      range: 200,
      durationMs: 2000,
      tickMs: 500,
      grade: 3,
    } as Partial<SkillDef> & { shape: string });
    mon(t, 1050, 1000);
    mon(t, 1060, 1000);
    use(t);
    advance(t, 2000);
    expect(t.c.skills.mastery?.[d.id]).toBe(1);
  });

  it("đi qua tickWorld (đã nối vào vòng tick)", () => {
    const t = setup();
    def(t, { shape: "zone", reach: 0, range: 100, durationMs: 2000, tickMs: 500 });
    const m = mon(t, 1050, 1000);
    use(t);
    for (let i = 0; i < 12; i++) {
      t.w.now += TICK_MS;
      tickWorld(t.w, TICK_MS);
    }
    expect(dmgTo(t, m.id).length).toBeGreaterThanOrEqual(1);
  });
});

describe("trap: bẫy", () => {
  it("chưa hoạt động trước `armMs` (quái đã đứng sẵn không kích); sau đó NỔ MỘT LẦN: mọi quái trong bán kính trúng một lần, `fxEnd pop`, vật thể gỡ", () => {
    const t = setup();
    def(t, { shape: "trap", reach: 0, range: 100, armMs: 1000, durationMs: 10_000 });
    const a = mon(t, 1050, 1000);
    const b = mon(t, 1000, 1070);
    const far = mon(t, 1500, 1000);
    use(t);
    advance(t, 900);
    expect(t.dmgs).toEqual([]);
    expect(t.w.objs).toHaveLength(1);
    advance(t, 200);
    expect(dmgTo(t, a.id)).toHaveLength(1);
    expect(dmgTo(t, b.id)).toHaveLength(1);
    expect(dmgTo(t, far.id)).toEqual([]);
    expect(t.w.objs).toEqual([]);
    const end = fxOf(t, "fxEnd");
    expect(end).toHaveLength(1);
    expect(end[0]).toMatchObject({ id: fxOf(t, "trap")[0]!.id, why: "pop" });
    advance(t, 3000);
    expect(dmgTo(t, a.id)).toHaveLength(1); // nổ MỘT lần
  });

  it("đã hoạt động mà chưa có quái: chờ; quái bước vào sau mới nổ", () => {
    const t = setup();
    def(t, { shape: "trap", reach: 0, range: 60, armMs: 400, durationMs: 10_000 });
    use(t);
    advance(t, 2000);
    expect(t.w.objs).toHaveLength(1);
    const m = mon(t, 1030, 1000);
    advance(t, 100);
    expect(dmgTo(t, m.id)).toHaveLength(1);
    expect(t.w.objs).toEqual([]);
  });

  it("hết `durationMs` mà chưa nổ thì tan lặng lẽ (không `fxEnd`); `armMs` dưới sàn bị kẹp lên trapArmMin", () => {
    const t = setup();
    def(t, { shape: "trap", reach: 0, range: 60, armMs: 10, durationMs: 1000 });
    use(t);
    advance(t, 300);
    const m = mon(t, 1030, 1000);
    advance(t, 100); // 400 ms: vừa tới trapArmMin
    expect(dmgTo(t, m.id)).toHaveLength(1);
    const u = setup();
    def(u, { shape: "trap", reach: 0, range: 60, armMs: 400, durationMs: 1000 });
    use(u);
    advance(u, 2000);
    expect(u.w.objs).toEqual([]);
    expect(fxOf(u, "fxEnd")).toEqual([]);
  });
});

describe("aura: hào quang bám theo người", () => {
  it("tâm là chỗ người đứng LÚC NÀY: người đi đâu đánh quái ở đó; quái quanh chỗ cũ thì không", () => {
    const t = setup();
    def(t, { shape: "aura", range: 120, durationMs: 4000, tickMs: 500 });
    const oldSpot = mon(t, 1050, 1000);
    use(t);
    t.p.x = 1800; // đã đi chỗ khác
    t.p.y = 1000;
    const newSpot = mon(t, 1850, 1000);
    advance(t, 500);
    expect(dmgTo(t, newSpot.id)).toHaveLength(1);
    expect(dmgTo(t, oldSpot.id)).toEqual([]);
  });

  it("tối đa MỘT hào quang mỗi người: dùng lại thì cái cũ bị thay (`fxEnd gone`)", () => {
    const t = setup();
    def(t, { shape: "aura", range: 120, durationMs: 4000, tickMs: 500 });
    use(t);
    const first = fxOf(t, "aura")[0]!.id;
    use(t);
    expect(t.w.objs).toHaveLength(1);
    expect(t.w.objs[0]!.id).not.toBe(first);
    expect(fxOf(t, "fxEnd")).toEqual([expect.objectContaining({ id: first, why: "gone" })]);
  });

  it("đứng trong khu an toàn thì tạm ngưng (không đánh)", () => {
    const t = setup();
    def(t, { shape: "aura", range: 120, durationMs: 4000, tickMs: 500 });
    const m = mon(t, 1050, 1000);
    use(t);
    vi.spyOn(t.w.map, "inSafe").mockReturnValue(true);
    advance(t, 1500);
    expect(dmgTo(t, m.id)).toEqual([]);
  });
});

describe("totem: tượng", () => {
  it("mỗi nhịp đánh MỘT quái GẦN NHẤT trong tầm; quái ngoài tầm không", () => {
    const t = setup();
    def(t, { shape: "totem", reach: 0, range: 200, durationMs: 4000, tickMs: 800 });
    const near = mon(t, 1060, 1000);
    const mid = mon(t, 1150, 1000);
    const far = mon(t, 1600, 1000);
    use(t);
    advance(t, 800);
    expect(dmgTo(t, near.id)).toHaveLength(1);
    expect(dmgTo(t, mid.id)).toEqual([]);
    expect(dmgTo(t, far.id)).toEqual([]);
    advance(t, 800);
    expect(dmgTo(t, near.id)).toHaveLength(2);
  });
});

describe("trần vật thể bền", () => {
  it("theo LOẠI: vùng thứ 4 đẩy vùng cũ nhất ra (`fxEnd gone`, đúng id), còn 3", () => {
    const t = setup();
    def(t, { shape: "zone", reach: 0 });
    for (let i = 0; i < PERSIST_KIND_MAX.zone + 1; i++) use(t);
    const ids = fxOf(t, "zone").map((f) => f.id);
    expect(t.w.objs.map((o) => o.id)).toEqual(ids.slice(1));
    expect(fxOf(t, "fxEnd")).toEqual([expect.objectContaining({ id: ids[0], why: "gone" })]);
  });

  it("theo NGƯỜI (persistPerPlayerMax chung mọi loại): dựng thêm loại khác khi đã đủ thì cũ nhất của người đó bị đẩy", () => {
    const t = setup();
    def(t, { shape: "zone", reach: 0 }, 0);
    def(t, { shape: "totem", reach: 0, range: 100, tickMs: 800 }, 1);
    for (let i = 0; i < 3; i++) use(t, 2);
    use(t, 3); // tượng thứ nhất: đã 4 vật thể
    expect(t.w.objs).toHaveLength(SKILL_LIMITS.persistPerPlayerMax);
    const firstZone = fxOf(t, "zone")[0]!.id;
    use(t, 3); // tượng thứ hai: vượt 4 -> đẩy vùng cũ nhất
    expect(t.w.objs).toHaveLength(SKILL_LIMITS.persistPerPlayerMax);
    expect(t.w.objs.some((o) => o.id === firstZone)).toBe(false);
    expect(fxOf(t, "fxEnd").some((f) => f.id === firstZone && f.why === "gone")).toBe(true);
  });

  it("theo PHÒNG (persistPerRoomMax): người khác đầy phòng thì vật thể mới đẩy cái cũ nhất của phòng", () => {
    const t = setup();
    def(t, { shape: "zone", reach: 0 });
    dummy(t, "khac", SKILL_LIMITS.persistPerRoomMax);
    const oldest = t.w.objs[0]!.id;
    use(t);
    expect(t.w.objs).toHaveLength(SKILL_LIMITS.persistPerRoomMax);
    expect(t.w.objs.some((o) => o.id === oldest)).toBe(false);
    expect(fxOf(t, "fxEnd")).toEqual([expect.objectContaining({ id: oldest, why: "gone" })]);
  });

  it("người khác đủ trần riêng không chặn người này", () => {
    const t = setup();
    def(t, { shape: "zone", reach: 0 });
    dummy(t, "khac", SKILL_LIMITS.persistPerPlayerMax);
    use(t);
    expect(t.w.objs.filter((o) => o.owner === "a")).toHaveLength(1);
    expect(fxOf(t, "fxEnd")).toEqual([]);
  });

  it("placeObject với hình không phải vật thể bền: false, không đụng gì", () => {
    const t = setup();
    const d = withSkill({ id: "chem", shape: "cone" } as Partial<SkillDef> & { id: string });
    expect(placeObject(t.w, "a", d, 0, 0, 0, () => {})).toBe(false);
    expect(t.w.objs).toEqual([]);
  });
});

describe("dọn khi mất chủ", () => {
  const cases: [string, (t: T) => void][] = [
    ["chết", (t) => void (t.p.dead = true)],
    [
      "rời phòng / qua cổng / vào bí cảnh",
      (t) => void (t.w.state.players.delete("a"), t.w.ctrl.delete("a")),
    ],
    ["hồn lìa xác", (t) => void t.w.ghosts.add("a")],
    ["Hoàng Tuyền", (t) => void (t.c.limbo = {} as never)],
  ];
  for (const [name, kill] of cases) {
    it(`chủ ${name}: mọi vật thể của họ tan (\`fxEnd gone\`), không tác dụng thêm; của người khác còn nguyên`, () => {
      const t = setup();
      def(t, { shape: "zone", reach: 0, range: 200, durationMs: 4000, tickMs: 500 }, 0);
      def(t, { shape: "aura", range: 200, durationMs: 4000, tickMs: 500 }, 1);
      const m = mon(t, 1050, 1000);
      use(t, 2);
      use(t, 3);
      addPlayer(t.w, "khac", 4, 0); // người khác CÒN trong phòng: vật thể của họ không bị dọn
      dummy(t, "khac", 1);
      const mine = t.w.objs.filter((o) => o.owner === "a").map((o) => o.id);
      kill(t);
      advance(t, 1500);
      expect(dmgTo(t, m.id), name).toEqual([]);
      expect(
        t.w.objs.filter((o) => o.owner === "a"),
        name,
      ).toEqual([]);
      expect(
        fxOf(t, "fxEnd")
          .filter((f) => f.why === "gone")
          .map((f) => f.id)
          .sort(),
        name,
      ).toEqual(mine.sort());
    });
  }
});

describe("không có vật thể", () => {
  it("tickObjects thoát ngay, không ném, không fx", () => {
    const t = setup();
    expect(() => tickObjects(t.w)).not.toThrow();
    expect(t.fx).toEqual([]);
  });
});
