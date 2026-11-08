// Test đơn vị cho các system với một World giả (không cần server Colyseus).
import { describe, expect, it, vi, afterEach } from "vitest";
import { MONSTER_BY_ID, expToNext, statsFor, TOWN_PX, TICK_MS, type FxMsg, type ToastMsg } from "@tien-gioi/shared";
import { WorldState, Player, Monster } from "../schema";
import { World, type PlayerCtrl } from "../world";
import { applyStats, gainExp, tickRecovery } from "./progression";
import { applyInputs, queueInput } from "./movement";
import { hitMonster, hurtPlayer, killMonster } from "./combat";
import { chat } from "./chat";

afterEach(() => vi.restoreAllMocks());

function makeWorld() {
  const fx: FxMsg[] = [];
  const toasts: { sid: string; msg: ToastMsg }[] = [];
  const sys: string[] = [];
  const chats: { from: string; text: string }[] = [];
  const w = new World(new WorldState(), {
    fx: (m) => fx.push(m),
    dmg: () => {},
    sys: (t) => sys.push(t),
    chat: (from, text) => chats.push({ from, text }),
    toast: (sid, msg) => toasts.push({ sid, msg }),
  });
  return { w, fx, toasts, sys, chats };
}

function addPlayer(w: World, sid: string, realm = 0, tier = 0) {
  const p = new Player();
  p.name = sid; p.realm = realm; p.tier = tier;
  p.x = TOWN_PX.x + TOWN_PX.r + 400; p.y = TOWN_PX.y;
  applyStats(p, true);
  const c: PlayerCtrl = {
    save: { name: sid, secretHash: "", realm, tier, exp: 0, createdAt: "", updatedAt: "" },
    inputs: [], moveBudget: 4, nextSlash: 0, nextSword: 0, nextBreak: 0, nextChat: 0, lastHitAt: 0, deadAt: 0,
  };
  w.state.players.set(sid, p);
  w.ctrl.set(sid, c);
  return { p, c };
}

function addMonster(w: World, kind: string, x: number, y: number) {
  const def = MONSTER_BY_ID[kind];
  const id = `m${++w.monsterSeq}`;
  const m = new Monster();
  m.kind = kind; m.x = x; m.y = y; m.hp = def.hp; m.maxHp = def.hp;
  w.state.monsters.set(id, m);
  w.mctrl.set(id, { def, homeX: x, homeY: y, target: null, nextAttack: 0, wanderX: x, wanderY: y, nextWander: 0, damageBy: new Map() });
  return { id, m, mc: w.mctrl.get(id)! };
}

describe("progression", () => {
  it("tu vi dư thì lên liền nhiều bậc nhỏ, có hiệu ứng mỗi bậc", () => {
    const { w, fx } = makeWorld();
    const { p } = addPlayer(w, "a", 1, 0);
    gainExp(w, "a", p, expToNext(1, 0) + expToNext(1, 1) + 5);
    expect(p.tier).toBe(2);
    expect(p.exp).toBeCloseTo(5);
    expect(p.maxHp).toBe(statsFor(1, 2).maxHp);
    expect(fx.filter((f) => f.kind === "levelup")).toHaveLength(2);
  });

  it("tới bậc cuối của cảnh giới thì dừng ở đầy, chờ đột phá", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a", 1, 8);
    gainExp(w, "a", p, 1e9);
    expect(p.realm).toBe(1);
    expect(p.tier).toBe(8);
    expect(p.exp).toBe(p.expMax);
  });

  it("đả tọa hồi khí huyết, linh lực và tăng tu vi", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    p.hp = 10; p.mp = 0; p.meditating = true;
    tickRecovery(w, "a", p, c, 1);
    expect(p.hp).toBeGreaterThan(10);
    expect(p.mp).toBeGreaterThan(0);
    expect(p.exp).toBeGreaterThan(0);
  });
});

describe("movement", () => {
  it("mỗi tick chỉ áp tối đa ngân sách input, phần còn lại chờ tick sau", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    c.moveBudget = 0;
    for (let seq = 1; seq <= 10; seq++) queueInput(w, "a", { seq, dx: 0, dy: 1 });
    applyInputs(p, c); // ngân sách 0 + 1
    expect(p.lastSeq).toBe(1);
    expect(c.inputs).toHaveLength(9);
  });

  it("vector hướng dài hơn 1 bị chuẩn hóa", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    p.x = TOWN_PX.x; p.y = TOWN_PX.y;
    queueInput(w, "a", { seq: 1, dx: 100, dy: 0 });
    applyInputs(p, c);
    expect(p.x - TOWN_PX.x).toBeCloseTo(statsFor(0, 0).speed * (TICK_MS / 1000));
  });
});

describe("combat", () => {
  it("chia tu vi theo tỉ lệ sát thương", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "a").p;
    const b = addPlayer(w, "b").p;
    const { id, mc } = addMonster(w, "lang", a.x + 20, a.y);
    mc.damageBy.set("a", 75).set("b", 25);
    killMonster(w, id, mc);
    expect(w.state.monsters.has(id)).toBe(false);
    // Hôi Lang: 22 tu vi gốc × 1.35^3 (quái bậc 2), chia 75% / 25%
    const full = 22 * Math.pow(1.35, 3);
    expect(b.exp).toBe(Math.round(full * 0.25));
    expect(a.exp).toBe(Math.min(a.expMax, Math.round(full * 0.75))); // Phàm Nhân: đầy thì dừng chờ đột phá
    expect(a.exp).toBeGreaterThan(b.exp);
  });

  it("đòn đánh ghi nhận sát thương và kéo quái nhắm vào người đánh", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a");
    const { id, m, mc } = addMonster(w, "ho", p.x + 20, p.y);
    vi.spyOn(Math, "random").mockReturnValue(0.5); // không bạo kích, hệ số 1.0
    hitMonster(w, id, m, "a", p, 1);
    expect(m.hp).toBe(m.maxHp - statsFor(0, 0).atk);
    expect(mc.target).toBe("a");
    expect(mc.damageBy.get("a")).toBe(statsFor(0, 0).atk);
  });

  it("hết khí huyết thì trọng thương, mất 10% tu vi, quái bỏ mục tiêu", () => {
    const { w, toasts } = makeWorld();
    const { p } = addPlayer(w, "a");
    const { m, mc } = addMonster(w, "lang", p.x + 20, p.y);
    mc.target = "a";
    p.exp = 20;
    hurtPlayer(w, "a", p, 1e6, m);
    expect(p.dead).toBe(true);
    expect(p.exp).toBe(18);
    expect(mc.target).toBeNull();
    expect(toasts[0]).toMatchObject({ sid: "a", msg: { tone: "bad" } });
  });
});

describe("chat", () => {
  it("bỏ ký tự điều khiển và tin rỗng", () => {
    const { w, chats } = makeWorld();
    addPlayer(w, "a");
    chat(w, "a", "\u0007\u0000   ");
    chat(w, "a", 123);
    chat(w, "a", "chào\u0000 cả nhà");
    expect(chats).toEqual([{ from: "a", text: "chào cả nhà" }]);
  });
});
