// ĐẠN BAY của người chơi (mục 51, CT3 #1048): quy hoạch đường bay thuần (`planBolt`: xuyên / nảy / ô chặn / tầm / bán kính trúng) và thực thi trong `World` giả (`fx pbolt` từng
// đoạn đúng `ms`, sát thương hẹn giờ đúng lúc chạm, trần theo người / phòng, chủ mất thì đạn tan, trúng đối thủ thách đấu, chung công thức với chiêu tức thời).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLAYER_RADIUS,
  SKILL_BY_ID,
  SKILL_LIMITS,
  TICK_MS,
  type FxMsg,
  type SkillDef,
  type SkillEffect,
} from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import { cast } from "./cast";
import {
  MAX_PLAYER_BOLTS,
  MAX_PLAYER_BOLTS_PER_PLAYER,
  PBOLT_BOUNCE_RADIUS,
  PBOLT_RADIUS,
  PBOLT_WALL_SAMPLE,
  planBolt,
  tickPBolts,
  type PBolt,
  type PTarget,
  type PlanIn,
} from "./pbolt";
import { monsterHasStatus } from "./status";
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

// ---------------------------------------------------------------- planBolt (thuần)
const R = 20; // bán kính mục tiêu thử
const free = () => false;
const tg = (id: string, x: number, y: number, r = R): PTarget => ({ id, x, y, r });
const plan = (over: Partial<PlanIn> = {}) =>
  planBolt({
    x: 0,
    y: 0,
    angle: 0,
    speed: 500,
    range: 600,
    pierce: 0,
    bounce: 0,
    targets: [],
    blocked: free,
    ...over,
  });
/** Quãng bay tới khi chạm mục tiêu tròn tâm (x, 0) bán kính R dọc trục: tâm trừ (R + bán kính đạn). */
const enterAt = (x: number) => x - (R + PBOLT_RADIUS);

describe("planBolt: đường bay thuần", () => {
  it("không có gì chắn: MỘT đoạn dài đúng `range`, không lần trúng nào", () => {
    const p = plan();
    expect(p.legs).toEqual([{ x: 0, y: 0, angle: 0, dist: 600, t0: 0 }]);
    expect(p.hits).toEqual([]);
  });

  it("ô chặn: dừng NGAY TRƯỚC ô (lấy mẫu mỗi PBOLT_WALL_SAMPLE px), kể cả khi tường sau mục tiêu", () => {
    const p = plan({ blocked: (x) => x >= 100 });
    expect(p.legs[0].dist).toBe(96); // mẫu 16, 32, ..., 96 trống; 112 chặn -> dừng ở 96
    const q = plan({ blocked: (x) => x >= 100, targets: [tg("a", 300, 0)] });
    expect(q.hits).toEqual([]); // mục tiêu sau tường không trúng
    expect(PBOLT_WALL_SAMPLE).toBe(16);
  });

  it("bắn sát tường (ô chặn ngay mẫu đầu): quãng 0, không bay", () => {
    expect(plan({ blocked: () => true }).legs[0].dist).toBe(0);
  });

  it("trúng mục tiêu đầu tiên rồi DỪNG (xuyên 0): quãng tới chỗ chạm, thời điểm = quãng / tốc độ; mục tiêu sau không trúng", () => {
    const p = plan({ targets: [tg("a", 200, 0), tg("b", 300, 0)] });
    expect(p.legs).toHaveLength(1);
    expect(p.legs[0].dist).toBeCloseTo(enterAt(200), 9);
    expect(p.hits.map((h) => h.id)).toEqual(["a"]);
    expect(p.hits[0].t).toBeCloseTo((enterAt(200) / 500) * 1000, 9);
    expect(p.hits[0].pk).toBe(false);
  });

  it("thứ tự trúng theo quãng gặp, không theo thứ tự trong danh sách", () => {
    const p = plan({ pierce: 1, targets: [tg("xa", 400, 0), tg("gan", 150, 0)] });
    expect(p.hits.map((h) => h.id)).toEqual(["gan", "xa"]);
  });

  it("xuyên N: trúng N + 1 mục tiêu rồi dừng ở mục tiêu cuối; mục tiêu thứ N + 2 không trúng", () => {
    const targets = [tg("a", 100, 0), tg("b", 200, 0), tg("c", 300, 0), tg("d", 400, 0)];
    const p = plan({ pierce: 2, targets });
    expect(p.hits.map((h) => h.id)).toEqual(["a", "b", "c"]);
    expect(p.legs[0].dist).toBeCloseTo(enterAt(300), 9);
  });

  it("xuyên nhiều hơn số mục tiêu: bay hết `range`", () => {
    const p = plan({ pierce: 3, targets: [tg("a", 100, 0)] });
    expect(p.hits).toHaveLength(1);
    expect(p.legs[0].dist).toBe(600);
  });

  it("lệch ngang quá r + bán kính đạn thì không trúng; đúng bằng thì trúng", () => {
    const edge = R + PBOLT_RADIUS;
    expect(plan({ targets: [tg("a", 200, edge + 0.5)] }).hits).toEqual([]);
    expect(plan({ targets: [tg("a", 200, edge)] }).hits).toHaveLength(1);
    expect(plan({ targets: [tg("a", 200, -(edge + 0.5))] }).hits).toEqual([]);
  });

  it("mục tiêu SAU LƯNG không trúng; mục tiêu chồng lên chỗ bắn trúng ngay quãng 0", () => {
    expect(plan({ targets: [tg("sau", -200, 0)] }).hits).toEqual([]);
    const p = plan({ targets: [tg("chong", 5, 0)] });
    expect(p.hits).toHaveLength(1);
    expect(p.hits[0].t).toBe(0);
    expect(p.legs[0].dist).toBe(0);
  });

  it("mục tiêu quá tầm không trúng", () => {
    expect(plan({ range: 100, targets: [tg("a", 300, 0)] }).hits).toEqual([]);
    expect(
      plan({ range: 100, targets: [tg("a", 100 + R + PBOLT_RADIUS - 1, 0)] }).hits,
    ).toHaveLength(1);
  });

  it("hướng bắn tuỳ ý: góc 90 độ bay dọc trục y", () => {
    const p = plan({ angle: Math.PI / 2, targets: [tg("a", 0, 200)] });
    expect(p.hits.map((h) => h.id)).toEqual(["a"]);
    expect(p.legs[0].dist).toBeCloseTo(enterAt(200), 9);
  });

  it("NẢY: sang mục tiêu GẦN NHẤT chưa trúng trong bán kính nảy; đoạn mới bắt đầu ở chỗ trúng, hướng về mục tiêu mới", () => {
    const p = plan({
      bounce: 1,
      targets: [tg("a", 200, 0), tg("xa", 200, 150), tg("gan", 200, 60)],
    });
    expect(p.hits.map((h) => h.id)).toEqual(["a", "gan"]);
    expect(p.legs).toHaveLength(2);
    const hx = enterAt(200);
    expect(p.legs[1].x).toBeCloseTo(hx, 9);
    expect(p.legs[1].y).toBeCloseTo(0, 9);
    expect(p.legs[1].angle).toBeCloseTo(Math.atan2(60, 200 - hx), 9);
    expect(p.legs[1].t0).toBeCloseTo((hx / 500) * 1000, 9);
    expect(p.hits[1].fromX).toBeCloseTo(hx, 9); // kéo / đẩy tính từ đầu đoạn chứa lần trúng
  });

  it("nảy: mục tiêu ngoài bán kính nảy thì đạn dừng ở chỗ trúng, không nảy", () => {
    const p = plan({
      bounce: 1,
      targets: [tg("a", 200, 0), tg("b", 200, PBOLT_BOUNCE_RADIUS + 1)],
    });
    expect(p.hits.map((h) => h.id)).toEqual(["a"]);
    expect(p.legs).toHaveLength(1);
  });

  it("nảy chỉ khi HẾT xuyên: xuyên dùng trước, rồi mới nảy sang mục tiêu gần nhất từ chỗ trúng cuối", () => {
    const p = plan({
      pierce: 1,
      bounce: 1,
      targets: [tg("a", 100, 0), tg("b", 200, 0), tg("c", 200, 80)],
    });
    expect(p.hits.map((h) => h.id)).toEqual(["a", "b", "c"]);
    expect(p.legs).toHaveLength(2);
    expect(p.legs[0].dist).toBeCloseTo(enterAt(200), 9); // xuyên qua a, dừng / nảy ở b
  });

  it("nảy tối đa `bounce` lần, mỗi mục tiêu một lần (không nảy ngược lại mục tiêu đã trúng)", () => {
    const targets = [tg("a", 150, 0), tg("b", 150, 100), tg("c", 150, 200), tg("d", 150, 300)];
    const p = plan({ bounce: 2, targets });
    expect(p.hits.map((h) => h.id)).toEqual(["a", "b", "c"]);
    expect(p.legs).toHaveLength(3);
    expect(new Set(p.hits.map((h) => h.id)).size).toBe(p.hits.length);
    expect(p.legs.length).toBeLessThanOrEqual(1 + SKILL_LIMITS.boltBounceMax);
  });

  it("quãng bay là CHUNG cho mọi đoạn: hết `range` giữa đường nảy thì mục tiêu sau không trúng", () => {
    const targets = [tg("a", 100, 0), tg("b", 100, 120)];
    const ok = plan({ bounce: 1, range: 500, targets });
    expect(ok.hits.map((h) => h.id)).toEqual(["a", "b"]);
    const short = plan({ bounce: 1, range: enterAt(100) + 40, targets }); // còn 40 px sau chỗ trúng đầu, b cách ~120
    expect(short.hits.map((h) => h.id)).toEqual(["a"]);
    expect(short.legs.reduce((s, l) => s + l.dist, 0)).toBeLessThanOrEqual(
      enterAt(100) + 40 + 1e-9,
    );
  });

  it("ô chặn cũng cắt đoạn SAU khi nảy", () => {
    // a trên trục, b cách a 100 px phía +y; tường ở y >= 60: đoạn nảy dừng trước tường, b (y = 100) không trúng
    const p = plan({
      bounce: 1,
      targets: [tg("a", 150, 0), tg("b", 150, 100)],
      blocked: (_x, y) => y >= 60,
    });
    expect(p.hits.map((h) => h.id)).toEqual(["a"]);
    expect(p.legs[1].dist).toBeLessThan(60);
  });

  it("tất định: cùng đầu vào cho cùng kết quả; tốc độ không hợp lệ không treo vòng", () => {
    const targets = [tg("a", 150, 0), tg("b", 150, 100)];
    expect(plan({ bounce: 1, targets })).toEqual(plan({ bounce: 1, targets }));
    const bad = plan({ speed: Number.NaN, bounce: 2, targets });
    expect(bad.legs.length).toBeLessThanOrEqual(1 + SKILL_LIMITS.boltBounceMax);
    expect(plan({ range: Number.NaN }).legs[0].dist).toBe(0);
  });

  it("mục tiêu thách đấu (`pk`) được đánh dấu để thực thi đi qua duelHit", () => {
    const p = plan({ targets: [{ id: "pk:b", x: 200, y: 0, r: PLAYER_RADIUS, pk: true }] });
    expect(p.hits[0].pk).toBe(true);
  });
});

// ---------------------------------------------------------------- thực thi trong World
function setup() {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 4, 0);
  a.p.x = 1000;
  a.p.y = 1000;
  a.p.mp = a.p.maxMp;
  t.w.now = 100_000;
  vi.spyOn(Math, "random").mockReturnValue(0.5); // không bạo kích, dao động cố định
  return { ...t, ...a };
}
type T = ReturnType<typeof setup>;
function equip(c: PlayerCtrl, id: string, level = 1) {
  c.skills.learned[id] = level;
  c.skills.slots[0] = id;
}
const bolt = (over: Partial<SkillDef> = {}) =>
  withSkill({
    id: "dan_thu",
    shape: "bolt",
    mult: 1,
    range: 500,
    arc: undefined,
    count: 1,
    speed: 500,
    pierce: 0,
    bounce: 0,
    element: "none",
    ...over,
  } as Partial<SkillDef> & { id: string });
const mon = (t: T, x: number, y: number, hp = 1e12) => {
  const r = addMonster(t.w, "tho", x, y);
  r.m.hp = r.m.maxHp = hp;
  return r;
};
const pbolts = (t: T) =>
  t.fx.filter((f): f is Extract<FxMsg, { kind: "pbolt" }> => f.kind === "pbolt");
const dmgTo = (t: T, id: string) => t.dmgs.filter((d) => d.target === id);
/** Trôi đồng hồ phòng `ms` rồi chạy đạn. */
const advance = (t: T, ms: number) => {
  t.w.now += ms;
  tickPBolts(t.w);
};
const stopAt = (x: number, r: number) => x - 1000 - (r + PBOLT_RADIUS); // quãng bay tới chỗ chạm quái tâm x (người ở 1000)

describe("cast bolt: bắn", () => {
  it("bắn xong KHÔNG có sát thương ngay: `fx cast` rồi MỘT `fx pbolt` đúng điểm bắn, hướng, tốc độ, `ms` tới chỗ chạm", () => {
    const t = setup();
    bolt();
    equip(t.c, "dan_thu");
    const m = mon(t, 1300, 1000);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.fx.map((f) => f.kind)).toEqual(["cast", "pbolt"]);
    const f = pbolts(t)[0];
    expect(f).toMatchObject({ by: "a", skill: "dan_thu", x: 1000, y: 1000, angle: 0, speed: 500 });
    expect(f.ms).toBe(Math.round((stopAt(1300, m.mc.def.radius) / 500) * 1000));
    expect(t.dmgs).toEqual([]);
    expect(t.w.pbolts).toHaveLength(1);
  });

  it("đạn hẹn giờ: chưa tới lúc chạm thì chưa sát thương; tới đúng lúc thì MỘT lần trúng đúng quái đó", () => {
    const t = setup();
    bolt();
    equip(t.c, "dan_thu");
    const m = mon(t, 1300, 1000);
    const other = mon(t, 1300, 1200); // lệch ngang xa
    cast(t.w, "a", { slot: 2, angle: 0 });
    const hitMs = (stopAt(1300, m.mc.def.radius) / 500) * 1000;
    advance(t, hitMs - 1);
    expect(t.dmgs).toEqual([]);
    advance(t, 2);
    expect(dmgTo(t, m.id)).toHaveLength(1);
    expect(dmgTo(t, other.id)).toEqual([]);
    advance(t, 10_000);
    expect(dmgTo(t, m.id)).toHaveLength(1); // không trúng lần hai
    expect(t.w.pbolts).toEqual([]); // hết bay thì gỡ
  });

  it("đi qua `tickWorld` (đã nối vào vòng tick), không chỉ gọi tay", () => {
    const t = setup();
    bolt();
    equip(t.c, "dan_thu");
    const m = mon(t, 1200, 1000);
    cast(t.w, "a", { slot: 2, angle: 0 });
    for (let i = 0; i < 40; i++) {
      t.w.now += TICK_MS;
      tickWorld(t.w, TICK_MS);
    }
    expect(dmgTo(t, m.id).length).toBeGreaterThanOrEqual(1);
  });

  it("sát thương BẰNG chiêu tức thời cùng `mult` / tầng (một công thức chung): đạn so với `line` trúng cùng quái", () => {
    const line = (lvl: number) => {
      const t = setup();
      withSkill({ id: "tia_thu", shape: "line", mult: 1, range: 500, width: 40, element: "none" });
      equip(t.c, "tia_thu", lvl);
      const m = mon(t, 1300, 1000);
      cast(t.w, "a", { slot: 2, angle: 0 });
      return dmgTo(t, m.id)[0].amount;
    };
    const dan = (lvl: number) => {
      const t = setup();
      bolt();
      equip(t.c, "dan_thu", lvl);
      const m = mon(t, 1300, 1000);
      cast(t.w, "a", { slot: 2, angle: 0 });
      advance(t, 5000);
      return dmgTo(t, m.id)[0].amount;
    };
    expect(dan(1)).toBe(line(1));
    expect(dan(3)).toBe(line(3));
    expect(dan(3)).toBeGreaterThan(dan(1));
  });

  it("`count` viên toả `arc`: mỗi viên một `fx pbolt`; chỉ viên đúng hướng trúng quái ở giữa", () => {
    const t = setup();
    bolt({ count: 3, arc: Math.PI / 6 });
    equip(t.c, "dan_thu");
    const m = mon(t, 1300, 1000);
    cast(t.w, "a", { slot: 2, angle: 0 });
    const f = pbolts(t);
    expect(f).toHaveLength(3);
    expect(f.map((x) => x.angle)).toEqual([-0.262, 0, 0.262]);
    advance(t, 5000);
    expect(dmgTo(t, m.id)).toHaveLength(1);
  });

  it("`count` toả rộng: viên nào cũng có thể trúng quái riêng; mỗi viên một lần", () => {
    const t = setup();
    bolt({ count: 3, arc: Math.PI / 2 });
    equip(t.c, "dan_thu");
    const mid = mon(t, 1300, 1000);
    const up = mon(t, 1000 + 300 * Math.cos(-Math.PI / 4), 1000 + 300 * Math.sin(-Math.PI / 4));
    cast(t.w, "a", { slot: 2, angle: 0 });
    advance(t, 5000);
    expect(dmgTo(t, mid.id)).toHaveLength(1);
    expect(dmgTo(t, up.id)).toHaveLength(1);
  });

  it("xuyên: quái thứ hai cũng trúng, ở thời điểm muộn hơn; nảy: gửi `fx pbolt` MỚI lúc đạn tới chỗ nảy, từ chỗ nảy", () => {
    const t = setup();
    bolt({ pierce: 1 });
    equip(t.c, "dan_thu");
    const a = mon(t, 1200, 1000);
    const b = mon(t, 1350, 1000);
    cast(t.w, "a", { slot: 2, angle: 0 });
    const tA = (stopAt(1200, a.mc.def.radius) / 500) * 1000;
    advance(t, tA + 1);
    expect(dmgTo(t, a.id)).toHaveLength(1);
    expect(dmgTo(t, b.id)).toEqual([]);
    advance(t, 1000);
    expect(dmgTo(t, b.id)).toHaveLength(1);
  });

  it("nảy: đoạn thứ hai chỉ phát lúc tới chỗ nảy (không phát hết lúc bắn); trúng quái nảy sang", () => {
    const t = setup();
    bolt({ bounce: 1 });
    equip(t.c, "dan_thu");
    const a = mon(t, 1300, 1000);
    const b = mon(t, 1300, 1100);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(pbolts(t)).toHaveLength(1);
    const tA = (stopAt(1300, a.mc.def.radius) / 500) * 1000;
    advance(t, tA - 5);
    expect(pbolts(t)).toHaveLength(1);
    advance(t, 10);
    expect(pbolts(t)).toHaveLength(2);
    const seg = pbolts(t)[1];
    expect(seg.x).toBe(Math.round(1000 + stopAt(1300, a.mc.def.radius)));
    expect(seg.y).toBe(1000);
    expect(seg.angle).toBeGreaterThan(0); // quay xuống phía b (y lớn hơn)
    expect(dmgTo(t, a.id)).toHaveLength(1);
    advance(t, 5000);
    expect(dmgTo(t, b.id)).toHaveLength(1);
  });

  it("ô chặn: đạn dừng trước tường, quái sau tường không trúng, `ms` của fx là tới chỗ dừng", () => {
    const t = setup();
    vi.spyOn(t.w.map, "isBlockedPx").mockImplementation((x) => x >= 1150);
    bolt();
    equip(t.c, "dan_thu");
    const m = mon(t, 1300, 1000);
    cast(t.w, "a", { slot: 2, angle: 0 });
    // tường ở x >= 1150 (cách 150 px): mẫu 16, 32, ..., 144 trống, mẫu 160 chặn -> dừng ở 144 px
    expect(pbolts(t)[0].ms).toBe(Math.round((144 / 500) * 1000));
    advance(t, 5000);
    expect(dmgTo(t, m.id)).toEqual([]);
  });

  it("bắn thẳng vào tường sát chân: không viên nào bay (không fx pbolt, không giữ chỗ)", () => {
    const t = setup();
    vi.spyOn(t.w.map, "isBlockedPx").mockReturnValue(true);
    bolt();
    equip(t.c, "dan_thu");
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(pbolts(t)).toEqual([]);
    expect(t.w.pbolts).toEqual([]);
  });

  it("hiệu ứng có hại + kéo / đẩy + combo áp lúc TRÚNG (không lúc bắn), qua cùng đường với chiêu tức thời", () => {
    const t = setup();
    const eff: SkillEffect = { status: "mark_hoa" as never, ms: 8000, ratio: 0, chance: 1 };
    bolt({ effects: [eff], displace: { dir: "push", px: 40 } });
    equip(t.c, "dan_thu");
    const m = mon(t, 1300, 1000);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(monsterHasStatus(t.w, m.id, "mark_hoa" as never)).toBe(false);
    expect(m.m.x).toBe(1300);
    advance(t, 5000);
    expect(monsterHasStatus(t.w, m.id, "mark_hoa" as never)).toBe(true);
    expect(m.m.x).toBeGreaterThan(1300); // đẩy ra xa chỗ bắt đầu đoạn bay
  });

  it("quái chết trước khi đạn tới: không ném lỗi, không sát thương, đạn vẫn gỡ khi hết bay", () => {
    const t = setup();
    bolt();
    equip(t.c, "dan_thu");
    const m = mon(t, 1300, 1000);
    cast(t.w, "a", { slot: 2, angle: 0 });
    t.w.state.monsters.delete(m.id);
    t.w.mctrl.delete(m.id);
    expect(() => advance(t, 5000)).not.toThrow();
    expect(t.dmgs).toEqual([]);
    expect(t.w.pbolts).toEqual([]);
  });

  it("đạn CHẾT chủ: chủ chết / rời phòng / hồn lìa xác / Hoàng Tuyền thì đạn tan, không sát thương mồ côi", () => {
    const cases: [string, (t: T) => void][] = [
      ["chết", (t) => void (t.p.dead = true)],
      ["rời", (t) => void t.w.state.players.delete("a")],
      ["ghost", (t) => void t.w.ghosts.add("a")],
      ["limbo", (t) => void (t.c.limbo = {} as never)],
    ];
    for (const [name, kill] of cases) {
      const t = setup();
      bolt();
      equip(t.c, "dan_thu");
      const m = mon(t, 1300, 1000);
      cast(t.w, "a", { slot: 2, angle: 0 });
      expect(t.w.pbolts, name).toHaveLength(1);
      kill(t);
      advance(t, 5000);
      expect(dmgTo(t, m.id), name).toEqual([]);
      expect(t.w.pbolts, name).toEqual([]);
    }
  });

  it("Cường Lực nhân sát thương LÚC BẮN (chốt một lần), không đổi nếu hết hiệu lực giữa đường", () => {
    const base = () => {
      const t = setup();
      bolt();
      equip(t.c, "dan_thu");
      const m = mon(t, 1300, 1000);
      return { t, m };
    };
    const a = base();
    cast(a.t.w, "a", { slot: 2, angle: 0 });
    advance(a.t, 5000);
    const plain = dmgTo(a.t, a.m.id)[0].amount;
    const b = base();
    b.t.c.st = { list: [{ id: "empower", until: b.t.w.now + 60_000, ratio: 0.5 }] } as never;
    cast(b.t.w, "a", { slot: 2, angle: 0 });
    b.t.c.st = undefined; // hết hiệu lực trước khi đạn chạm
    advance(b.t, 5000);
    expect(dmgTo(b.t, b.m.id)[0].amount).toBeGreaterThan(plain);
  });
});

describe("cast bolt: dữ liệu sai và thứ tự việc hẹn giờ", () => {
  it("trường sai bị KẸP theo SKILL_LIMITS: count 50 chỉ bắn tối đa boltCountMax viên; tốc độ / tầm không vượt trần", () => {
    const t = setup();
    bolt({ count: 50, arc: Math.PI, speed: 99_999, range: 99_999, pierce: 99, bounce: 99 });
    equip(t.c, "dan_thu");
    cast(t.w, "a", { slot: 2, angle: 0 });
    const f = pbolts(t);
    expect(f).toHaveLength(SKILL_LIMITS.boltCountMax);
    for (const x of f) {
      expect(x.speed).toBe(SKILL_LIMITS.boltSpeedMax);
      expect(x.ms).toBeLessThanOrEqual(
        Math.round((SKILL_LIMITS.boltRangeMax / SKILL_LIMITS.boltSpeedMax) * 1000),
      );
    }
    const slow = setup();
    bolt({ speed: 1, range: 400 });
    equip(slow.c, "dan_thu");
    cast(slow.w, "a", { slot: 2, angle: 0 });
    expect(pbolts(slow)[0].speed).toBe(SKILL_LIMITS.boltSpeedMin);
  });

  it("xuyên rồi nảy: mỗi lần trúng áp ĐÚNG thời điểm của nó (không dồn theo đoạn nảy phát sau)", () => {
    const t = setup();
    bolt({ pierce: 1, bounce: 1 });
    equip(t.c, "dan_thu");
    const a = mon(t, 1150, 1000);
    const b = mon(t, 1300, 1000);
    const c = mon(t, 1300, 1090);
    cast(t.w, "a", { slot: 2, angle: 0 });
    const tA = (stopAt(1150, a.mc.def.radius) / 500) * 1000;
    const tB = (stopAt(1300, b.mc.def.radius) / 500) * 1000;
    advance(t, tA + 1);
    expect(dmgTo(t, a.id)).toHaveLength(1); // a trúng SỚM, trước khi tới b / chỗ nảy
    expect(dmgTo(t, b.id)).toEqual([]);
    advance(t, tB - tA);
    expect(dmgTo(t, b.id)).toHaveLength(1);
    expect(pbolts(t)).toHaveLength(2); // đoạn nảy phát lúc tới b
    advance(t, 5000);
    expect(dmgTo(t, c.id)).toHaveLength(1);
  });
});

describe("cast bolt: trần", () => {
  /** Đạn giả của `owner` (không việc nào, hết bay sau `ms`). */
  const dummy = (t: T, owner: string, n: number) => {
    for (let i = 0; i < n; i++)
      t.w.pbolts.push({
        owner,
        skill: "dan_thu",
        speed: 500,
        steps: [],
        next: 0,
        end: t.w.now + 60_000,
        strike: () => {},
        hitOpponent: () => {},
      } satisfies PBolt);
  };

  it("mỗi người tối đa MAX_PLAYER_BOLTS_PER_PLAYER viên đang bay: viên vượt trần KHÔNG bắn (không fx pbolt)", () => {
    const t = setup();
    bolt({ count: 5, arc: Math.PI / 4 });
    equip(t.c, "dan_thu");
    dummy(t, "a", MAX_PLAYER_BOLTS_PER_PLAYER - 2);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(pbolts(t)).toHaveLength(2);
    expect(t.w.pbolts.filter((b) => b.owner === "a")).toHaveLength(MAX_PLAYER_BOLTS_PER_PLAYER);
    t.c.skillCd[0] = 0;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(pbolts(t)).toHaveLength(2); // đủ trần: không thêm
  });

  it("người khác đầy trần không chặn người này; trần PHÒNG MAX_PLAYER_BOLTS chặn tất cả", () => {
    const t = setup();
    bolt({ count: 5, arc: Math.PI / 4 });
    equip(t.c, "dan_thu");
    dummy(t, "khac", MAX_PLAYER_BOLTS_PER_PLAYER);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(pbolts(t)).toHaveLength(5);
    dummy(t, "khac2", MAX_PLAYER_BOLTS - t.w.pbolts.length - 1);
    t.fx.length = 0;
    t.c.skillCd[0] = 0;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(pbolts(t)).toHaveLength(1);
    expect(t.w.pbolts).toHaveLength(MAX_PLAYER_BOLTS);
  });

  it("đạn hết bay được gỡ nên trần giải phóng: bắn tiếp được sau khi các viên trước đã tới đích", () => {
    const t = setup();
    bolt({ count: 5, arc: Math.PI / 4 });
    equip(t.c, "dan_thu");
    for (let i = 0; i < 3; i++) {
      cast(t.w, "a", { slot: 2, angle: 0 });
      t.c.skillCd[0] = 0;
    }
    expect(t.w.pbolts.length).toBe(15);
    advance(t, 10_000);
    expect(t.w.pbolts).toEqual([]);
    t.fx.length = 0;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(pbolts(t)).toHaveLength(5);
  });

  it("không có đạn thì tickPBolts không đụng gì (không ném, không tốn)", () => {
    const t = setup();
    expect(() => tickPBolts(t.w)).not.toThrow();
    expect(t.fx).toEqual([]);
  });
});

describe("cast bolt: thách đấu (PK)", () => {
  function duel(dx: number, phase: "fight" | "ready" = "fight") {
    const t = setup();
    bolt();
    equip(t.c, "dan_thu");
    const b = addPlayer(t.w, "b", 4, 0);
    b.p.x = 1000 + dx;
    b.p.y = 1000;
    t.w.duels._start({
      a: "a",
      b: "b",
      phase: phase as never,
      fightAt: 0,
      endsAt: Infinity,
      ox: 0,
      oy: 0,
    });
    return { ...t, b };
  }

  it("trúng ĐỐI THỦ qua duelHit đúng lúc chạm; đối thủ ở ngoài đường bay thì không", () => {
    const hit = duel(300);
    cast(hit.w, "a", { slot: 2, angle: 0 });
    const hp = hit.b.p.hp;
    expect(hit.dmgs).toEqual([]);
    advance(hit, 5000);
    expect(hit.b.p.hp).toBeLessThan(hp);
    expect(hit.dmgs.some((d) => d.toPlayer)).toBe(true);

    const miss = duel(300);
    miss.b.p.y = 1000 + 200;
    cast(miss.w, "a", { slot: 2, angle: 0 });
    const hp2 = miss.b.p.hp;
    advance(miss, 5000);
    expect(miss.b.p.hp).toBe(hp2);
  });

  it("không trong pha `fight` thì duelHit từ chối (không trúng)", () => {
    const t = duel(300, "ready");
    cast(t.w, "a", { slot: 2, angle: 0 });
    const hp = t.b.p.hp;
    advance(t, 5000);
    expect(t.b.p.hp).toBe(hp);
  });

  it("người chơi KHÁC (không phải đối thủ) đứng trên đường bay không bị trúng; PK đạn xuyên qua người ngoài", () => {
    const t = duel(400);
    const c = addPlayer(t.w, "c", 4, 0);
    c.p.x = 1200;
    c.p.y = 1000;
    cast(t.w, "a", { slot: 2, angle: 0 });
    const hpC = c.p.hp;
    advance(t, 5000);
    expect(c.p.hp).toBe(hpC);
  });

  it("trúng đối thủ thì hiệu ứng Tê cóng gắn lên người và kéo / đẩy áp từ chỗ bắt đầu đoạn bay (như chiêu tức thời); trạng thái khác không gắn", () => {
    const t = duel(300);
    bolt({
      effects: [
        { status: "chill", ms: 3000, ratio: 0.3, chance: 1 },
        { status: "mark_hoa" as never, ms: 3000, ratio: 0, chance: 1 },
      ],
      displace: { dir: "push", px: 40 },
    });
    cast(t.w, "a", { slot: 2, angle: 0 });
    const x0 = t.b.p.x;
    advance(t, 5000);
    const ids = (t.w.ctrl.get("b")!.st?.list ?? []).map((s) => s.id);
    expect(ids).toContain("chill");
    expect(ids).not.toContain("mark_hoa");
    expect(t.b.p.x).toBeGreaterThan(x0);
  });

  it("trúng quái trên đường TRƯỚC đối thủ thì đạn dừng ở quái (xuyên 0): đối thủ phía sau không trúng", () => {
    const t = duel(400);
    const m = mon(t, 1200, 1000);
    cast(t.w, "a", { slot: 2, angle: 0 });
    const hp = t.b.p.hp;
    advance(t, 5000);
    expect(dmgTo(t, m.id)).toHaveLength(1);
    expect(t.b.p.hp).toBe(hp);
  });
});
