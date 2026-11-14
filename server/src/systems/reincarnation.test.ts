// Luân hồi (M3 bước 2): chết thật -> Hoàng Tuyền -> đầu thai, phần đồng bộ trên World (WorldRoom lo I/O: xem WorldRoom.test.ts).
import { describe, expect, it } from "vitest";
import {
  HISTORY_MAX,
  RESPAWN_MS,
  calcDuyen,
  expMultOf,
  newSoul,
  stepOf,
  type RebirthChoice,
} from "@tien-gioi/shared";
import { hurtPlayer, killMonster } from "./combat";
import { tickWorld } from "./tick";
import { applyRebirth, creditSoul, keepableOf } from "./reincarnation";
import { setEquipment } from "./equipment";
import { gainExp } from "./progression";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import type { LimboRecord } from "../store";

/** Thế giới bật luân hồi, một người đã chơi tới Luyện Khí tầng 9 sau 48 phút, mang vài món đồ */
function setup() {
  const t = makeWorld();
  t.w.reincarnate = true;
  const a = addPlayer(t.w, "a", 1, 8);
  a.c.life = { playMs: 48 * 60_000, kills: 30, bossKills: 0 };
  a.c.coin = 250;
  a.c.inv[0] = { itemId: "hoi_huyet_dan", qty: 5 };
  a.c.inv[1] = { itemId: "hac_ho_kiem", qty: 1 };
  setEquipment(a.p, { weapon: "lang_nha_kiem", robe: "", talisman: "" });
  a.c.quests = { active: [], done: ["q1"], daily: {} };
  const lifeBefore = a.c.lifeId;
  const calls: string[] = [];
  t.w.onLimbo = (sid) => calls.push(sid);
  return { ...t, ...a, lifeBefore, calls };
}
const kill = (t: ReturnType<typeof setup>) => {
  const { m } = addMonster(t.w, "lang", t.p.x + 20, t.p.y);
  hurtPlayer(t.w, "a", t.p, 1e9, m);
};

describe("beginLimbo: chết thật", () => {
  it("tính Duyên và tóm tắt kiếp, chụp trang bị giữ được và Linh thạch, rồi đặt lại nhân vật về kiếp mới", () => {
    const t = setup();
    const expected = calcDuyen({
      realm: 1,
      tier: 8,
      exp: t.p.exp,
      playMs: 48 * 60_000,
      bossKills: 0,
    });
    expect(expected).toBeGreaterThan(15);
    kill(t);
    expect(t.c.limbo).toEqual({
      endedLifeId: t.lifeBefore,
      summary: { kiep: 1, realm: 1, tier: 8, minutes: 48, kills: 30, bossKills: 0, gain: expected },
      keepable: ["lang_nha_kiem", "hac_ho_kiem"],
      engravable: [],
      coinAtDeath: 250,
      counts: true,
      credited: false,
    });
    expect(t.calls).toEqual(["a"]); // hook gọi đúng một lần
    // nằm "chết" (người khác thấy xác), không có đồng hồ hồi sinh
    expect(t.p.dead).toBe(true);
    // kiếp cũ không còn gì
    expect([t.p.realm, t.p.tier, t.p.exp]).toEqual([0, 0, 0]);
    expect([t.p.weapon, t.p.robe, t.p.talisman]).toEqual(["", "", ""]);
    expect(t.c.inv.every((s) => s === null)).toBe(true);
    expect(t.c.coin).toBe(0);
    expect(t.c.quests).toEqual({ active: [], done: [], daily: {} });
    expect(t.c.life).toEqual({ playMs: 0, kills: 0, bossKills: 0 });
    expect(t.c.lifeId).not.toBe(t.lifeBefore);
    expect(t.toasts.some((x) => x.sid === "a" && /Hoàng Tuyền/.test(x.msg.text))).toBe(true);
  });

  it("quái bỏ mục tiêu; chết rồi không bị đánh thêm, không gọi hook lần hai, không hồi sinh theo đồng hồ", () => {
    const t = setup();
    const { m, mc } = addMonster(t.w, "lang", t.p.x + 20, t.p.y);
    mc.target = "a";
    hurtPlayer(t.w, "a", t.p, 1e9, m);
    expect(mc.target).toBeNull();
    hurtPlayer(t.w, "a", t.p, 1e9, m);
    expect(t.calls).toHaveLength(1);
    t.w.now += RESPAWN_MS * 100;
    for (let i = 0; i < 40; i++) tickWorld(t.w, 50);
    expect(t.p.dead).toBe(true); // vẫn ở Hoàng Tuyền
    expect(t.c.limbo).toBeDefined();
  });

  it("kiếp quá ngắn hoặc còn Phàm Nhân: 0 Duyên và không tính là một kiếp (vẫn qua Hoàng Tuyền)", () => {
    const t = setup();
    t.c.life.playMs = 60_000; // 1 phút
    kill(t);
    expect(t.c.limbo!.summary.gain).toBe(0);
    expect(t.c.limbo!.counts).toBe(false);
    const u = makeWorld();
    u.w.reincarnate = true;
    const b = addPlayer(u.w, "b", 0, 0);
    b.c.life.playMs = 10 * 60_000;
    const { m } = addMonster(u.w, "tho", b.p.x + 10, b.p.y);
    hurtPlayer(u.w, "b", b.p, 1e9, m);
    expect([b.c.limbo!.summary.gain, b.c.limbo!.counts]).toEqual([0, false]);
  });

  it("nhánh hồi sinh khi KHÔNG bật luân hồi (bench, PK sau này): hồi sinh ở trấn sau RESPAWN_MS, không mất gì", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 8);
    a.p.exp = 100;
    const { m } = addMonster(t.w, "lang", a.p.x + 20, a.p.y);
    hurtPlayer(t.w, "a", a.p, 1e9, m);
    expect(a.p.dead).toBe(true);
    expect(a.c.limbo).toBeUndefined();
    t.w.now += RESPAWN_MS + 1;
    tickWorld(t.w, 50);
    expect(a.p.dead).toBe(false);
    expect([a.p.realm, a.p.tier, a.p.exp]).toEqual([1, 8, 100]);
  });

  it("keepableOf: trang bị đang mặc + trong túi (nhiều món cùng loại lặp lại), không lấy đan dược", () => {
    const t = setup();
    t.c.inv[2] = { itemId: "hac_ho_kiem", qty: 1 };
    expect(keepableOf(t.p, t.c)).toEqual(["lang_nha_kiem", "hac_ho_kiem", "hac_ho_kiem"]);
  });
});

describe("creditSoul: cộng Duyên idempotent", () => {
  const limbo = (over: Partial<LimboRecord> = {}): LimboRecord => ({
    endedLifeId: "life-1",
    summary: { kiep: 1, realm: 1, tier: 8, minutes: 48, kills: 30, bossKills: 0, gain: 22 },
    keepable: [],
    engravable: [],
    coinAtDeath: 0,
    counts: true,
    credited: false,
    ...over,
  });

  it("cộng Duyên và tổng, tăng kiếp, cập nhật thành tựu cao nhất, ghi lịch sử; cộng lần hai cùng kiếp thì không đổi gì", () => {
    const s0 = newSoul("a", "t");
    const s1 = creditSoul(s0, limbo(), "now");
    expect([s1.duyen, s1.duyenTotal, s1.kiep, s1.best.step, s1.lastCreditedLife]).toEqual([
      22,
      22,
      2,
      9,
      "life-1",
    ]);
    expect(s1.history).toEqual([{ kiep: 1, step: 9, minutes: 48, gain: 22, at: "now" }]);
    expect(creditSoul(s1, limbo(), "later")).toBe(s1); // đúng cùng một đối tượng: không cộng hai lần
    expect(s0.duyen).toBe(0); // không sửa đối số
  });

  it("kiếp không tính: có thể không có Duyên, không tăng kiếp, không vào lịch sử, nhưng vẫn ghi đã xử lý (không xử lý lại)", () => {
    const s = creditSoul(
      newSoul("a", "t"),
      limbo({
        counts: false,
        summary: { kiep: 1, realm: 0, tier: 0, minutes: 1, kills: 0, bossKills: 0, gain: 0 },
      }),
      "n",
    );
    expect([s.kiep, s.duyen, s.history.length, s.lastCreditedLife]).toEqual([1, 0, 0, "life-1"]);
  });

  it("thành tựu cao nhất chỉ tăng, không giảm; lịch sử cắt HISTORY_MAX kiếp gần nhất", () => {
    let s = creditSoul(newSoul("a", "t"), limbo(), "n");
    s = creditSoul(
      s,
      limbo({
        endedLifeId: "life-2",
        summary: { kiep: 2, realm: 0, tier: 0, minutes: 3, kills: 1, bossKills: 0, gain: 1 },
      }),
      "n",
    );
    expect(s.best.step).toBe(stepOf(1, 8));
    for (let i = 3; i < 40; i++)
      s = creditSoul(
        s,
        limbo({
          endedLifeId: `life-${i}`,
          summary: { kiep: i, realm: 1, tier: 0, minutes: 5, kills: 1, bossKills: 0, gain: 2 },
        }),
        "n",
      );
    expect(s.history).toHaveLength(HISTORY_MAX);
    expect(s.history.at(-1)!.kiep).toBe(39);
    expect(s.kiep).toBe(40);
  });
});

describe("beginLimbo: chiêu có thể khắc (M7.2c)", () => {
  it("chụp chiêu đã học ở kiếp vừa kết thúc cộng chiêu đang khắc (đang khắc đứng trước, không trùng, id lạ bị bỏ), TRƯỚC khi đặt lại sổ chiêu", () => {
    const t = setup();
    t.c.soul = { ...t.c.soul, engraved: ["ung_trao"] };
    t.c.skills = {
      learned: {
        hoa_van_kiem: 2,
        me_tung_bo: 1,
        ung_trao: 1,
        constructor: 1,
        __proto__: 1,
      } as never,
      slots: ["hoa_van_kiem", "", "", ""],
    };
    kill(t);
    expect(t.c.limbo!.engravable).toEqual(["ung_trao", "hoa_van_kiem", "me_tung_bo"]);
    expect(t.c.skills).toEqual({ learned: {}, slots: ["", "", "", ""] }); // sổ chiêu đã đặt lại
  });

  it("chưa học chiêu nào và chưa khắc: danh sách rỗng", () => {
    const t = setup();
    kill(t);
    expect(t.c.limbo!.engravable).toEqual([]);
  });

  it("audit `soul.rebirth` ghi số chiêu đang khắc; kiếp mới dựng từ `Soul.engraved` ở tầng 1, ô trống", () => {
    const t = setup();
    const events: Array<{ ev: string; f: Record<string, unknown> }> = [];
    t.w.audit = (ev, f) => events.push({ ev, f: f as Record<string, unknown> });
    kill(t);
    t.c.soul = creditSoul(t.c.soul, { ...t.c.limbo!, credited: true }, "n");
    t.c.soul = { ...t.c.soul, unlocks: { khac: 2 }, engraved: ["hoa_van_kiem", "me_tung_bo"] };
    applyRebirth(t.w, "a", t.p, t.c, { origin: "pham_gia", keep: [] });
    expect(t.c.skills.learned).toEqual({ hoa_van_kiem: 1, me_tung_bo: 1 });
    expect(t.c.skills.slots).toEqual(["", "", "", ""]);
    expect(events.find((e) => e.ev === "soul.rebirth")!.f.engraved).toBe(2);
  });
});

describe("applyRebirth: đầu thai", () => {
  const choice = (over: Partial<RebirthChoice> = {}): RebirthChoice => ({
    origin: "pham_gia",
    keep: [],
    ...over,
  });

  it("không có gì mở khóa: kiếp mới trắng tay ở trấn, hồi sinh đầy máu, Hoàng Tuyền đóng, báo reborn", () => {
    const t = setup();
    kill(t);
    t.c.soul = creditSoul(t.c.soul, { ...t.c.limbo!, credited: true }, "n");
    t.p.x = 1;
    t.p.y = 1;
    applyRebirth(t.w, "a", t.p, t.c, choice());
    expect(t.c.limbo).toBeUndefined();
    expect(t.p.dead).toBe(false);
    expect(t.p.hp).toBe(t.p.maxHp);
    expect(t.w.map.inTown(t.p.x, t.p.y)).toBe(true);
    expect(t.c.inv.every((s) => s === null)).toBe(true);
    expect(t.c.coin).toBe(0);
    expect(t.reborns).toEqual([{ sid: "a", msg: { kiep: 2 } }]);
    expect(t.sys.some((x) => /luân hồi/.test(x) && /thứ 2/.test(x))).toBe(true);
  });

  it("Lễ Mạnh Bà, Ký vật, Kim nang, xuất thân: túi có quà + đồ giữ lại, Linh thạch tối đa theo trần, hệ số xuất thân", () => {
    const t = setup();
    kill(t);
    t.c.soul = { ...t.c.soul, unlocks: { le_ma: 2, ky_vat: 1, kim_nang: 1 }, origins: ["the_tu"] };
    applyRebirth(t.w, "a", t.p, t.c, choice({ origin: "the_tu", keep: ["hac_ho_kiem"] }));
    const bag = Object.fromEntries(t.c.inv.filter(Boolean).map((s) => [s!.itemId, s!.qty]));
    expect(bag).toEqual({ hoi_huyet_dan: 6, hoi_linh_dan: 6, hac_ho_kiem: 1 });
    expect(t.c.coin).toBe(20); // chết với 250, trần Kim nang nấc 1 là 20
    expect([t.c.origin, t.c.mult]).toEqual(["the_tu", { maxHp: 1.15 }]);
    // chỉ số gốc ở Phàm Nhân nhân 1.15 khí huyết
    const base = makeWorld();
    const b = addPlayer(base.w, "b", 0, 0);
    expect(t.p.maxHp).toBe(Math.round(b.p.maxHp * 1.15));
    expect(t.p.maxHp).toBeGreaterThan(b.p.maxHp);
  });

  it("Linh thạch lúc chết ít hơn trần thì mang hết; chưa mở Kim nang thì 0", () => {
    const t = setup();
    kill(t);
    t.c.soul = { ...t.c.soul, unlocks: { kim_nang: 4 } };
    applyRebirth(t.w, "a", t.p, t.c, choice());
    expect(t.c.coin).toBe(250);
  });

  it("không ở Hoàng Tuyền thì không làm gì (gọi nhầm / lần hai)", () => {
    const t = setup();
    applyRebirth(t.w, "a", t.p, t.c, choice({ keep: ["hac_ho_kiem"] }));
    expect(t.reborns).toHaveLength(0);
    expect(t.c.inv[1]).toEqual({ itemId: "hac_ho_kiem", qty: 1 });
    kill(t);
    applyRebirth(t.w, "a", t.p, t.c, choice());
    applyRebirth(t.w, "a", t.p, t.c, choice()); // lần hai: bỏ qua
    expect(t.reborns).toHaveLength(1);
  });
});

describe("Dư âm tu hành: tu vi từ hạ quái và đả tọa được nhân; đan dược / nhiệm vụ thì không", () => {
  it("hạ quái: tu vi nhân expMultOf; kiếp mới ở cùng điều kiện chậm hơn khi chưa mở", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 0);
    const b = addPlayer(t.w, "b", 1, 0);
    b.c.soul = { ...b.c.soul, unlocks: { du_am: 10 } };
    expect(expMultOf(b.c.soul.unlocks)).toBeCloseTo(2, 10);
    for (const x of [a, b]) {
      const { id, mc } = addMonster(t.w, "lang", x.p.x + 20, x.p.y);
      mc.damageBy.set(x.p.name, 100);
      killMonster(t.w, id, mc);
    }
    expect(b.p.exp).toBeCloseTo(a.p.exp * 2, 6);
  });

  it("gainExp mặc định không nhân (đan dược, nhiệm vụ); scale chỉ áp khi truyền", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 0);
    a.c.soul = { ...a.c.soul, unlocks: { du_am: 10 } };
    gainExp(t.w, "a", a.p, 10);
    expect(a.p.exp).toBe(10);
    gainExp(t.w, "a", a.p, 10, 2);
    expect(a.p.exp).toBe(30);
  });
});

describe("nhật ký kiểm toán: chết thật và đầu thai (M4 2.4, lát 3)", () => {
  const withAudit = (t: ReturnType<typeof setup>) => {
    const log: { ev: string; f: Record<string, unknown> }[] = [];
    t.w.audit = (ev, f) => void log.push({ ev, f: f ?? {} });
    return log;
  };

  it("chết thật ghi soul.limbo MỘT lần với số liệu của kiếp cũ (Linh thạch, cảnh giới, Duyên), không lộ bí mật", () => {
    const t = setup();
    const log = withAudit(t);
    kill(t);
    expect(log).toHaveLength(1);
    expect(log[0].ev).toBe("soul.limbo");
    expect(log[0].f).toMatchObject({
      name: "a",
      kiep: 1,
      realm: 1,
      tier: 8,
      coin: 250,
      counts: true,
    });
    expect(log[0].f.gain).toBe(t.c.limbo!.summary.gain);
    expect(JSON.stringify(log[0].f)).not.toMatch(/secret|token|pass/i);
    // bị đánh thêm lúc đã chết: không ghi lần hai
    kill(t);
    expect(log.filter((x) => x.ev === "soul.limbo")).toHaveLength(1);
  });

  it("đầu thai ghi soul.rebirth (kiếp mới, xuất thân, Linh thạch mang theo / lúc chết, số món giữ)", () => {
    const t = setup();
    kill(t);
    t.c.soul = creditSoul(t.c.soul, { ...t.c.limbo!, credited: true }, "n");
    const log = withAudit(t);
    applyRebirth(t.w, "a", t.p, t.c, { origin: "pham_gia", keep: [] });
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual({
      ev: "soul.rebirth",
      f: {
        name: "a",
        kiep: 2,
        origin: "pham_gia",
        coin: 0,
        coinAtDeath: 250,
        kept: 0,
        engraved: 0,
      },
    });
  });

  it("world.audit = null (test / bench): không ghi và không lỗi", () => {
    const t = setup();
    expect(t.w.audit).toBeNull();
    expect(() => kill(t)).not.toThrow();
  });
});
