// Đấu trường chặn đường (mục 52, CD3 #1063): vé + sổ vé, dựng bầy, thắng / thua / hết giờ / bỏ chạy / thoát, thưởng, về chỗ cũ. World giả (bản đồ đấu trường), đồng hồ `w.now` điều khiển tay.
import { describe, expect, it } from "vitest";
import {
  AMBUSH_EXIT_MS,
  AMBUSH_MIN_PROTOCOL,
  AMBUSH_FALL_MS,
  AMBUSH_TIME_MS,
  DEFAULT_MAP_ID,
  MAX_AMBUSH_ROOMS,
  TICK_MS,
  arenaMapIdOf,
  getMap,
  type AmbushFoeGroup,
  type AmbushTier,
} from "@tien-gioi/shared";
import { hurtPlayer, killMonster, tickRespawn } from "./combat";
import { createAmbushRuntime, type AmbushOfferCtrl } from "./ambush";
import {
  AMBUSH_TICKET_TTL_MS,
  ARENA_REWARD_MULT,
  Ambushes,
  arenaDrop,
  arenaJoined,
  createArena,
  finishArena,
  onAmbushFlee,
  openTicket,
  tickArena,
  type AmbushTicket,
} from "./arena";
import { addPlayer, makeWorld } from "./test-helpers";
import { tickWorld } from "./tick";

const ARENA = getMap(arenaMapIdOf(DEFAULT_MAP_ID))!;
const T0 = Date.UTC(2026, 10, 17, 5, 0, 0);

const group = (tier: AmbushTier, foes: AmbushFoeGroup["foes"]): AmbushFoeGroup => ({
  id: `g_${tier}`,
  name: "Sói Hoang",
  mapId: DEFAULT_MAP_ID,
  minStep: 0,
  maxStep: 40,
  tier,
  foes,
});

function ticketOf(g: AmbushFoeGroup, over: Partial<AmbushTicket> = {}): AmbushTicket {
  return {
    id: "a".repeat(32),
    key: "a",
    name: "a",
    origin: { mapId: DEFAULT_MAP_ID, x: 2200, y: 1536 },
    group: g,
    tier: g.tier,
    roomId: null,
    createdAt: T0,
    expiresAt: T0 + AMBUSH_TICKET_TTL_MS,
    ended: false,
    ...over,
  };
}

/** Dựng một đấu trường có MỘT người chơi đã vào (đồng hồ trận đã chạy). */
function setup(g: AmbushFoeGroup = group("normal", [{ kind: "tho", count: 2 }])) {
  const h = makeWorld(ARENA);
  const { w } = h;
  w.now = T0;
  w.ambush = createAmbushRuntime({ random: () => 0, scenes: [], foes: [] });
  w.reincarnate = true; // chết thật sẽ vào Hoàng Tuyền: đấu trường PHẢI chặn đường đó
  const ticket = ticketOf(g, { roomId: "room-1" });
  w.hub.ambushes._add(ticket);
  const a = createArena(w, ticket);
  const { p, c } = addPlayer(w, "a", 1, 2);
  p.exp = 400;
  p.expMax = 1000;
  c.coin = 5000;
  p.x = w.map.townPx.x;
  p.y = w.map.townPx.y;
  arenaJoined(w, "a");
  const exits: string[] = [];
  w.onArenaExit = (sid) => exits.push(sid);
  return { ...h, w, a, p, c, sid: "a", ticket, exits };
}

/** Giả lập người chơi đã hành động (đi xa chỗ vào) để trận không bị tính là vắng mặt. */
const act = (s: ReturnType<typeof setup>) => {
  s.p.x += 100;
  tickArena(s.w);
};

describe("sổ vé (Ambushes)", () => {
  it("thêm / tra theo id và theo khoá; xoá idempotent và không xoá nhầm vé khác cùng khoá", () => {
    const book = new Ambushes();
    const t = ticketOf(group("normal", [{ kind: "tho", count: 1 }]));
    book._add(t);
    expect(book.size).toBe(1);
    expect(book.get(t.id)).toBe(t);
    expect(book.ofKey("a")).toBe(t);
    expect(book.get(7)).toBeUndefined();
    expect(book.get("constructor")).toBeUndefined();
    const other = ticketOf(t.group, { id: "b".repeat(32) });
    book._remove(other); // vé khác id: không đụng
    expect(book.size).toBe(1);
    book._remove(t);
    book._remove(t);
    expect(book.size).toBe(0);
    expect(book.ofKey("a")).toBeUndefined();
  });
});

describe("openTicket: vé cho lựa chọn Chiến", () => {
  const offerOf = (g: AmbushFoeGroup): AmbushOfferCtrl => ({ group: g, tier: g.tier }) as never;

  it("lập vé với CHỖ CŨ (bản đồ + toạ độ nguyên không bị chặn), id 128 bit, hạn vào phòng", () => {
    const h = makeWorld();
    h.w.now = T0;
    const { p } = addPlayer(h.w, "a");
    p.x = 2200.4;
    p.y = 1536.6;
    const g = group("normal", [{ kind: "tho", count: 1 }]);
    const t = openTicket(h.w, "a", offerOf(g))!;
    expect(t).not.toBeNull();
    expect(t.id).toMatch(/^[a-f0-9]{32}$/);
    expect(t.origin.mapId).toBe(h.w.map.def.id);
    expect(Number.isInteger(t.origin.x) && Number.isInteger(t.origin.y)).toBe(true);
    expect(Math.abs(t.origin.x - 2200.4)).toBeLessThan(2);
    expect(t.expiresAt).toBe(T0 + AMBUSH_TICKET_TTL_MS);
    expect(h.w.hub.ambushes.ofKey("a")).toBe(t);
  });

  it("đã có vé của người này, hoặc đủ MAX_AMBUSH_ROOMS: từ chối (null), không đổi sổ", () => {
    const h = makeWorld();
    addPlayer(h.w, "a");
    const g = group("normal", [{ kind: "tho", count: 1 }]);
    expect(openTicket(h.w, "a", offerOf(g))).not.toBeNull();
    expect(openTicket(h.w, "a", offerOf(g))).toBeNull(); // hai vé một người
    const full = makeWorld();
    addPlayer(full.w, "x");
    for (let i = 0; i < MAX_AMBUSH_ROOMS; i++)
      full.w.hub.ambushes._add(ticketOf(g, { id: `${i}`.padStart(32, "0"), key: `k${i}` }));
    expect(openTicket(full.w, "x", offerOf(g))).toBeNull();
    expect(full.w.hub.ambushes.size).toBe(MAX_AMBUSH_ROOMS);
    expect(openTicket(full.w, "khong_co", offerOf(g))).toBeNull(); // không còn trong phòng
  });

  it("đồng đội (cùng đội, ở phòng nào cũng được) nhận dòng 'X bị chặn đường'; người ngoài đội thì không", () => {
    const h = makeWorld();
    addPlayer(h.w, "an");
    addPlayer(h.w, "binh");
    addPlayer(h.w, "chi");
    h.w.parties._create("an", "binh");
    openTicket(h.w, "an", offerOf(group("normal", [{ kind: "tho", count: 1 }])));
    const to = h.toasts.map((t) => t.sid);
    expect(to).toEqual(["binh"]);
    expect(h.toasts[0]!.msg.text).toContain("an");
  });
});

describe("createArena: dựng bầy kẻ địch", () => {
  it("đúng số con theo bảng, mọi con đánh dấu `arena`, KHÔNG quái tự nhiên, nằm quanh tâm hang", () => {
    const s = setup(
      group("normal", [
        { kind: "tho", count: 2 },
        { kind: "lang", count: 1 },
      ]),
    );
    expect(s.a.foes).toHaveLength(3);
    expect(s.w.state.monsters.size).toBe(3);
    const lair = s.w.map.lairPx!;
    for (const id of s.a.foes) {
      const mc = s.w.mctrl.get(id)!;
      expect(mc.arena).toBe(true);
      const m = s.w.state.monsters.get(id)!;
      expect(Math.hypot(m.x - lair.x, m.y - lair.y)).toBeLessThanOrEqual(81);
    }
  });

  it("tinh anh: số liệu nhân + cờ elite; thường thì không", () => {
    const e = setup(group("elite", [{ kind: "lang", count: 1 }]));
    const m = e.w.state.monsters.get(e.a.foes[0]!)!;
    expect(m.elite).toBe(1);
    expect(m.maxHp).toBeGreaterThan(e.w.mctrl.get(e.a.foes[0]!)!.def.hp - 1);
    const n = setup(group("normal", [{ kind: "lang", count: 1 }]));
    expect(n.w.state.monsters.get(n.a.foes[0]!)!.elite).toBeFalsy();
    expect(m.maxHp).toBeGreaterThan(n.w.state.monsters.get(n.a.foes[0]!)!.maxHp);
  });

  it("kẻ cầm đầu ở TÂM hang, lính quanh; loài lạ trong bảng bị bỏ (không ném lỗi)", () => {
    const s = setup(
      group("leader", [
        { kind: "mang", count: 1 },
        { kind: "tho", count: 2 },
      ]),
    );
    const lair = s.w.map.lairPx!;
    const boss = s.w.state.monsters.get(s.a.foes[0]!)!;
    expect(boss.kind).toBe("mang");
    expect(Math.hypot(boss.x - lair.x, boss.y - lair.y)).toBeLessThan(1);
    const bad = setup(
      group("normal", [
        { kind: "khong_co_loai_nay", count: 2 },
        { kind: "tho", count: 1 },
      ]),
    );
    expect(bad.a.foes).toHaveLength(1);
  });

  it("quái đấu trường chết KHÔNG cho tu vi / Linh thạch / đồ rơi", () => {
    const s = setup(group("normal", [{ kind: "tho", count: 1 }]));
    const id = s.a.foes[0]!;
    const mc = s.w.mctrl.get(id)!;
    mc.damageBy.set("a", 100);
    s.p.x = s.w.state.monsters.get(id)!.x;
    s.p.y = s.w.state.monsters.get(id)!.y;
    const exp = s.p.exp;
    const coin = s.c.coin;
    killMonster(s.w, id, mc);
    expect(s.w.state.monsters.has(id)).toBe(false);
    expect(s.w.mctrl.has(id)).toBe(false);
    expect(s.p.exp).toBe(exp);
    expect(s.c.coin).toBe(coin);
    expect(s.w.state.loot.size).toBe(0);
  });
});

describe("đồng hồ trận và ambushState", () => {
  it("chưa có người vào thì đồng hồ chưa chạy; arenaJoined đặt hạn AMBUSH_TIME_MS, chốt giá và gửi state đầu", () => {
    const h = makeWorld(ARENA);
    h.w.now = T0;
    const t = ticketOf(group("normal", [{ kind: "tho", count: 1 }]));
    const a = createArena(h.w, t);
    tickArena(h.w); // chưa ai: no-op
    expect(a.startedAt).toBeNull();
    const s = setup();
    expect(s.a.startedAt).toBe(T0);
    expect(s.a.deadline).toBe(T0 + AMBUSH_TIME_MS);
    expect(s.ambushStates).toHaveLength(1);
    expect(s.ambushStates[0]!.msg.msLeft).toBe(AMBUSH_TIME_MS);
    expect(s.ambushStates[0]!.msg.price.coin.price).toBeGreaterThan(0);
  });

  it("ambushState mỗi giây (không mỗi tick), thời gian còn giảm đúng, giá làm mới theo tu vi hiện tại", () => {
    const s = setup();
    const n0 = s.ambushStates.length;
    for (let i = 0; i < 19; i++) {
      s.w.now += TICK_MS;
      tickArena(s.w);
    }
    expect(s.ambushStates.length).toBe(n0); // chưa đủ một giây
    s.p.exp = 30; // thấp hơn giá cũ (100): giá làm mới phải theo tu vi MỚI, không phải bản chốt lúc vào
    s.w.now += 1000;
    tickArena(s.w);
    expect(s.ambushStates.length).toBe(n0 + 1);
    const last = s.ambushStates.at(-1)!.msg;
    expect(last.msLeft).toBe(AMBUSH_TIME_MS - 1000 - 19 * TICK_MS);
    expect(last.price.exp).toBe(30);
  });
});

describe("thắng: hạ hết bầy", () => {
  it("không còn con nào -> won; thưởng tu vi + Linh thạch qua đường riêng, ambushEnd có rewards, hồ sơ lưu TRƯỚC khi báo", async () => {
    const s = setup(group("normal", [{ kind: "tho", count: 2 }]));
    const order: string[] = [];
    s.w.onSaveNow = async () => {
      order.push(`save exp=${Math.floor(s.p.exp)}`);
      return true;
    };
    act(s);
    for (const id of s.a.foes) killMonster(s.w, id, s.w.mctrl.get(id)!);
    const exp0 = s.p.exp;
    const coin0 = s.c.coin;
    s.w.now += TICK_MS;
    tickArena(s.w);
    expect(s.a.phase).toBe("over");
    expect(s.a.result).toBe("won");
    expect(s.ticket.ended).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    const end = s.ambushEnds.at(-1)!.msg;
    expect(end.result).toBe("won");
    expect(end.rewards!.exp).toBeGreaterThan(0);
    expect(s.p.exp - exp0).toBe(end.rewards!.exp); // đúng số báo
    expect(s.c.coin - coin0).toBe(end.rewards!.coin);
    expect(order).toHaveLength(1); // đã lưu (sau khi cộng thưởng) rồi mới báo
    expect(end.rewards!.items).toEqual([]);
    expect(ARENA_REWARD_MULT.normal).toBeGreaterThan(0);
  });

  it("thắng chỉ MỘT lần: tick thêm không thưởng thêm", async () => {
    const s = setup(group("normal", [{ kind: "tho", count: 1 }]));
    act(s);
    killMonster(s.w, s.a.foes[0]!, s.w.mctrl.get(s.a.foes[0]!)!);
    s.w.now += TICK_MS;
    tickArena(s.w);
    const exp = s.p.exp;
    const coin = s.c.coin;
    for (let i = 0; i < 20; i++) {
      s.w.now += TICK_MS;
      tickArena(s.w);
    }
    await Promise.resolve();
    await Promise.resolve();
    expect(s.p.exp).toBe(exp);
    expect(s.c.coin).toBe(coin);
    expect(s.ambushEnds).toHaveLength(1);
  });
});

describe("thua / hết giờ: giá giữa trận bằng tu vi", () => {
  it("hết giờ (đã hành động): trừ giá giữa trận đã chốt, không thưởng, lost-like `timeout`", () => {
    const s = setup();
    act(s);
    const chot = s.a.price.exp;
    expect(chot).toBeGreaterThan(0);
    s.w.now = s.a.deadline;
    tickArena(s.w);
    expect(s.a.result).toBe("timeout");
    expect(s.p.exp).toBe(400 - chot);
    expect(s.c.coin).toBe(5000);
  });

  it("chưa có đầu vào nào (vắng mặt) mà hết giờ: tính ĐẦU HÀNG, giá HỘP THOẠI thấp hơn giá giữa trận", () => {
    const s = setup();
    s.w.now = s.a.deadline;
    tickArena(s.w);
    expect(s.a.acted).toBe(false);
    const offerPrice = Math.floor(1000 * 0.05); // 5% thanh tu vi
    expect(s.p.exp).toBe(400 - offerPrice);
    expect(offerPrice).toBeLessThan(Math.floor(1000 * 0.1));
  });

  it("tu vi không đủ giá: chỉ trừ phần có (không âm, không rớt cảnh giới)", () => {
    const s = setup();
    act(s);
    s.p.exp = 7;
    s.w.now = s.a.deadline;
    tickArena(s.w);
    expect(s.p.exp).toBe(0);
  });

  it("bị hạ: KHÔNG Hoàng Tuyền / mất kiếp (dù w.reincarnate), nằm AMBUSH_FALL_MS rồi đứng dậy ĐẦY khí huyết; trận lost, trừ giá giữa trận", () => {
    const s = setup();
    act(s);
    const chot = s.a.price.exp;
    const mc = [...s.w.mctrl.values()][0]!;
    const limbos = s.limbos.length;
    s.p.hp = 1;
    hurtPlayer(s.w, s.sid, s.p, 9999, { kind: mc.def.id });
    expect(s.p.dead).toBe(true);
    expect(s.c.limbo).toBeUndefined();
    expect(s.limbos.length).toBe(limbos);
    expect(s.a.result).toBe("lost");
    expect(s.p.exp).toBe(400 - chot);
    expect(s.c.lifeId).toBe(`life-${s.sid}`); // kiếp nguyên vẹn
    s.w.now += AMBUSH_FALL_MS;
    tickRespawn(s.w, s.p, s.c);
    expect(s.p.dead).toBe(false);
    expect(s.p.hp).toBe(s.p.maxHp);
  });

  it("hạ thêm / hết giờ SAU khi đã có kết cục: không trừ giá lần hai", () => {
    const s = setup();
    act(s);
    s.p.hp = 1;
    hurtPlayer(s.w, s.sid, s.p, 9999, { kind: [...s.w.mctrl.values()][0]!.def.id });
    const exp = s.p.exp;
    s.w.now = s.a.deadline + 1000;
    tickArena(s.w);
    finishArena(s.w, s.sid, "timeout");
    expect(s.p.exp).toBe(exp);
  });
});

describe("bỏ chạy giữa trận (ambushFlee)", () => {
  it("flee_coin: trừ ĐÚNG giá đã chốt, LƯU xong mới đóng; kết cục fled + paid", async () => {
    const s = setup();
    let coinAtSave = -1;
    s.w.onSaveNow = async () => {
      coinAtSave = s.c.coin;
      return true;
    };
    const price = s.a.price.coin.price;
    await onAmbushFlee(s.w, s.sid, { choice: "flee_coin" });
    expect(coinAtSave).toBe(5000 - price);
    expect(s.ambushEnds.at(-1)!.msg).toEqual({ result: "fled", paid: { coin: price } });
    expect(s.a.phase).toBe("over");
    expect(s.a.result).toBe("fled");
  });

  it("flee_exp: trừ tu vi đúng giá chốt; giá chốt không đổi dù tu vi tăng sau đó", async () => {
    const s = setup();
    const chot = s.a.price.exp;
    s.p.expMax = 1_000_000; // nếu tính lại thì giá vọt lên
    s.p.exp = 100_000;
    await onAmbushFlee(s.w, s.sid, { choice: "flee_exp" });
    expect(s.p.exp).toBe(100_000 - chot);
    expect(s.ambushEnds.at(-1)!.msg.paid).toEqual({ exp: chot });
  });

  it("không đủ Linh thạch: không trừ gì, trận tiếp tục, báo toast", async () => {
    const s = setup();
    s.c.coin = s.a.price.coin.price - 1;
    await onAmbushFlee(s.w, s.sid, { choice: "flee_coin" });
    expect(s.c.coin).toBe(s.a.price.coin.price - 1);
    expect(s.a.phase).toBe("fighting");
    expect(s.toasts).toHaveLength(1);
    expect(s.ambushEnds).toHaveLength(0);
  });

  it("lưu HỎNG: giữ trận, đã trừ MỘT lần; bấm lại chỉ lưu (không trừ hai lần); xong mới đóng", async () => {
    const s = setup();
    let ok = false;
    s.w.onSaveNow = async () => ok;
    const before = s.c.coin;
    const price = s.a.price.coin.price;
    await onAmbushFlee(s.w, s.sid, { choice: "flee_coin" });
    expect(s.a.phase).toBe("fighting");
    expect(s.c.coin).toBe(before - price);
    expect(s.toasts).toHaveLength(1);
    ok = true;
    await onAmbushFlee(s.w, s.sid, { choice: "flee_coin" });
    expect(s.c.coin).toBe(before - price);
    expect(s.a.phase).toBe("over");
    expect(s.ambushEnds).toHaveLength(1);
  });

  it("đang chờ lưu một cách trả thì không đổi sang cách khác; sau kết cục thì bỏ qua", async () => {
    const s = setup();
    let release!: (v: boolean) => void;
    s.w.onSaveNow = () => new Promise<boolean>((r) => (release = r));
    const first = onAmbushFlee(s.w, s.sid, { choice: "flee_coin" });
    await onAmbushFlee(s.w, s.sid, { choice: "flee_exp" });
    expect(s.p.exp).toBe(400);
    release(true);
    await first;
    const coin = s.c.coin;
    await onAmbushFlee(s.w, s.sid, { choice: "flee_coin" }); // trận đã `over`
    expect(s.c.coin).toBe(coin);
    expect(s.ambushEnds).toHaveLength(1);
  });

  it("tin rác / choice lạ / `fight` / người chết / chưa vào trận: bỏ qua lặng lẽ", async () => {
    const s = setup();
    for (const bad of [
      undefined,
      null,
      "x",
      5,
      [],
      {},
      { choice: "fight" },
      { choice: "flee_all" },
    ])
      await onAmbushFlee(s.w, s.sid, bad);
    s.p.dead = true;
    await onAmbushFlee(s.w, s.sid, { choice: "flee_coin" });
    await onAmbushFlee(s.w, "nguoi_la", { choice: "flee_coin" });
    expect(s.c.coin).toBe(5000);
    expect(s.p.exp).toBe(400);
    expect(s.ambushEnds).toHaveLength(0);
    const h = makeWorld();
    addPlayer(h.w, "a");
    await onAmbushFlee(h.w, "a", { choice: "flee_coin" }); // phòng thường: không có đấu trường
    expect(h.ambushEnds).toHaveLength(0);
  });
});

describe("thoát / rớt mạng khỏi đấu trường", () => {
  it("lúc đang đánh: trừ giá giữa trận bằng TU VI (đã hành động); trận đóng, vé kết thúc", () => {
    const s = setup();
    act(s);
    const chot = s.a.price.exp;
    expect(arenaDrop(s.w, s.sid)).toBe(chot);
    expect(s.p.exp).toBe(400 - chot);
    expect(s.a.result).toBe("dropped");
    expect(s.ticket.ended).toBe(true);
  });

  it("chưa hành động mà thoát: giá HỘP THOẠI (thấp hơn)", () => {
    const s = setup();
    expect(arenaDrop(s.w, s.sid)).toBe(Math.floor(1000 * 0.05));
  });

  it("đã có kết cục thì thoát KHÔNG trừ thêm; đã trừ rồi (chờ lưu khi bỏ chạy) thì giữ nguyên", async () => {
    const s = setup();
    act(s);
    finishArena(s.w, s.sid, "timeout");
    const exp = s.p.exp;
    expect(arenaDrop(s.w, s.sid)).toBe(0);
    expect(s.p.exp).toBe(exp);
    const t = setup();
    t.w.onSaveNow = () => new Promise<boolean>(() => {});
    void onAmbushFlee(t.w, t.sid, { choice: "flee_exp" });
    await Promise.resolve();
    const afterCharge = t.p.exp;
    expect(arenaDrop(t.w, t.sid)).toBe(t.a.price.exp);
    expect(t.p.exp).toBe(afterCharge);
  });

  it("phòng thường: không làm gì", () => {
    const h = makeWorld();
    addPlayer(h.w, "a");
    expect(arenaDrop(h.w, "a")).toBe(0);
  });
});

describe("về chỗ cũ sau kết cục", () => {
  it("trong AMBUSH_EXIT_MS kẻ địch bỏ mục tiêu và người chơi bất khả xâm phạm; tới hạn thì gọi onArenaExit MỘT lần, thử lại mỗi 2 giây", () => {
    const s = setup();
    act(s);
    s.w.now = s.a.deadline;
    tickArena(s.w);
    const mc = [...s.w.mctrl.values()][0]!;
    mc.target = s.sid;
    s.w.now += AMBUSH_EXIT_MS - 1;
    tickArena(s.w);
    expect(mc.target).toBeNull(); // bỏ mục tiêu
    expect(s.w.shielded.has(s.sid)).toBe(true);
    expect(s.exits).toEqual([]);
    s.w.now += 1;
    tickArena(s.w);
    expect(s.exits).toEqual([s.sid]);
    s.w.now += 1999;
    tickArena(s.w);
    expect(s.exits).toHaveLength(1); // chưa tới lần thử lại
    s.w.now += 1;
    tickArena(s.w);
    expect(s.exits).toHaveLength(2);
  });

  it("không gọi onArenaExit khi đang đi qua cổng hoặc còn nằm (chưa đứng dậy)", () => {
    const s = setup();
    act(s);
    s.w.now = s.a.deadline;
    tickArena(s.w);
    s.w.now = s.a.endAt!;
    s.c.travelling = true;
    tickArena(s.w);
    expect(s.exits).toEqual([]);
    s.c.travelling = false;
    s.p.dead = true;
    tickArena(s.w);
    expect(s.exits).toEqual([]);
    s.p.dead = false;
    tickArena(s.w);
    expect(s.exits).toEqual([s.sid]);
  });
});

describe("phòng thường và tickWorld", () => {
  it("phòng thường: tickArena thoát ngay; tickWorld ở đấu trường chạy được (không ném lỗi) và hết giờ thì kết thúc", () => {
    const h = makeWorld();
    addPlayer(h.w, "a");
    expect(() => tickArena(h.w)).not.toThrow();
    const s = setup();
    for (let i = 0; i < 5; i++) {
      s.w.now += TICK_MS;
      tickWorld(s.w, TICK_MS);
    }
    expect(s.a.phase).toBe("fighting");
    s.w.now = s.a.deadline;
    tickWorld(s.w, TICK_MS);
    expect(s.a.phase).toBe("over");
  });

  it("ambushBlocked: ở đấu trường KHÔNG bị chặn đường lồng nhau (nhánh `run`)", async () => {
    const { ambushBlocked } = await import("./ambush");
    const s = setup();
    s.c.proto = AMBUSH_MIN_PROTOCOL;
    expect(ambushBlocked(s.w, s.sid)).toBe("run");
  });
});
