// Rơi Linh thạch khi quái chết: người nhận, chia đội, bảo toàn tổng (#99).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COIN_CAP,
  COIN_DROPS,
  PARTY_INVITE_COOLDOWN_MS,
  PARTY_SHARE_RANGE,
} from "@tien-gioi/shared";
import type { World } from "../world";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { killMonster } from "./combat";
import { partyAnswer, partyInvite } from "./party";

afterEach(() => vi.restoreAllMocks());

const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];

function setup(n: number) {
  const t = makeWorld();
  for (const name of names.slice(0, n)) addPlayer(t.w, name);
  return t;
}
function team(w: World, ...members: string[]) {
  for (const m of members.slice(1)) {
    partyInvite(w, members[0]!, m);
    partyAnswer(w, m, members[0]!, true);
    w.now += PARTY_INVITE_COOLDOWN_MS;
  }
}
/** Hạ một con quái `kind` tại chỗ người chơi A đứng; random = 0 nên chắc chắn rơi và rơi mức tối thiểu. */
function kill(w: World, kind: string, damage: Record<string, number>) {
  const a = w.state.players.get("Alpha")!;
  const { id, mc } = addMonster(w, kind, a.x + 10, a.y);
  for (const [sid, d] of Object.entries(damage)) mc.damageBy.set(sid, d);
  vi.spyOn(Math, "random").mockReturnValue(0);
  killMonster(w, id, mc);
}
const coinOf = (w: World, sid: string) => w.ctrl.get(sid)!.coin;
const totalCoin = (w: World, ...sids: string[]) => sids.reduce((s, x) => s + coinOf(w, x), 0);

describe("rơi Linh thạch khi quái chết", () => {
  it("người hạ quái một mình nhận cả khoản rơi, kèm tin wallet cho đúng người", () => {
    const { w, wallets } = setup(2);
    kill(w, "lang", { Alpha: 50 });
    const d = COIN_DROPS.lang!;
    expect(coinOf(w, "Alpha")).toBe(d.min); // random = 0: rơi và ở mức tối thiểu
    expect(coinOf(w, "Bravo")).toBe(0); // người không góp sát thương không nhận
    expect(wallets).toEqual([{ sid: "Alpha", msg: { coin: d.min, gained: d.min } }]);
  });

  it("tung vượt xác suất thì không rơi tiền", () => {
    const { w, wallets } = setup(1);
    const a = w.state.players.get("Alpha")!;
    const { id, mc } = addMonster(w, "tho", a.x + 10, a.y);
    mc.damageBy.set("Alpha", 10);
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    killMonster(w, id, mc);
    expect(coinOf(w, "Alpha")).toBe(0);
    expect(wallets).toEqual([]);
  });

  it("nhiều người lẻ cùng đánh: chia theo sát thương, tổng đúng bằng khoản rơi", () => {
    const { w } = setup(2);
    kill(w, "mang", { Alpha: 30, Bravo: 10 }); // random = 0: 150
    expect(totalCoin(w, "Alpha", "Bravo")).toBe(COIN_DROPS.mang!.min);
    expect(coinOf(w, "Alpha")).toBeGreaterThan(coinOf(w, "Bravo"));
    expect(Math.abs(coinOf(w, "Alpha") - 150 * 0.75)).toBeLessThanOrEqual(1);
  });

  it("đội 4 người: chia đều, tổng KHÔNG hơn một người hạ một mình (không có thưởng đội)", () => {
    const solo = setup(1);
    kill(solo.w, "mang", { Alpha: 100 });
    const t = setup(4);
    team(t.w, "Alpha", "Bravo", "Charlie", "Delta");
    kill(t.w, "mang", { Alpha: 70, Bravo: 10, Charlie: 10, Delta: 10 });
    const sum = totalCoin(t.w, "Alpha", "Bravo", "Charlie", "Delta");
    expect(sum).toBe(totalCoin(solo.w, "Alpha"));
    for (const n of ["Alpha", "Bravo", "Charlie", "Delta"]) {
      expect(coinOf(t.w, n)).toBeGreaterThanOrEqual(Math.floor(150 / 4));
      expect(coinOf(t.w, n)).toBeLessThanOrEqual(Math.ceil(150 / 4));
    }
  });

  it("đội đánh cùng người lẻ: không được ưu ái, mỗi người cùng sát thương nhận như nhau (không thưởng đội)", () => {
    const t = setup(3);
    team(t.w, "Alpha", "Bravo"); // Charlie đánh một mình
    kill(t.w, "mang", { Alpha: 20, Bravo: 20, Charlie: 20 });
    for (const n of ["Alpha", "Bravo", "Charlie"]) {
      expect(Math.abs(coinOf(t.w, n) - 50), n).toBeLessThanOrEqual(1);
    }
    expect(totalCoin(t.w, "Alpha", "Bravo", "Charlie")).toBe(150);
  });

  it("thành viên chưa ra đòn nhưng đứng gần vẫn được chia; ở xa, đã ngã hoặc không cùng đội thì không", () => {
    const t = setup(5);
    team(t.w, "Alpha", "Bravo", "Charlie", "Delta");
    const at = (sid: string, dx: number) => {
      const p = t.w.state.players.get(sid)!;
      p.x = t.w.state.players.get("Alpha")!.x + dx;
    };
    at("Charlie", PARTY_SHARE_RANGE + 200); // ở xa
    t.w.state.players.get("Delta")!.dead = true; // đã ngã
    kill(t.w, "mang", { Alpha: 100 });
    expect(coinOf(t.w, "Charlie")).toBe(0);
    expect(coinOf(t.w, "Delta")).toBe(0);
    expect(coinOf(t.w, "Echo")).toBe(0); // không cùng đội, không góp sát thương
    expect(coinOf(t.w, "Alpha") + coinOf(t.w, "Bravo")).toBe(150);
    expect(coinOf(t.w, "Bravo")).toBeGreaterThan(0); // chưa ra đòn vẫn nhận
  });

  it("người gây sát thương nhưng đã ngã không nhận; khoản rơi chia hết cho người còn lại", () => {
    const { w } = setup(2);
    w.state.players.get("Bravo")!.dead = true;
    kill(w, "mang", { Alpha: 10, Bravo: 90 });
    expect(coinOf(w, "Bravo")).toBe(0);
    expect(coinOf(w, "Alpha")).toBe(150);
  });

  it("không ai nhận được (không có sát thương, hoặc cả đội ở xa): không mất tiền, không lỗi", () => {
    const { w, wallets } = setup(2);
    team(w, "Alpha", "Bravo");
    kill(w, "mang", {});
    expect(wallets).toEqual([]);
    for (const n of ["Alpha", "Bravo"]) w.state.players.get(n)!.x += PARTY_SHARE_RANGE + 500;
    const a = w.state.players.get("Alpha")!;
    const { id, mc } = addMonster(w, "mang", a.x - PARTY_SHARE_RANGE - 300, a.y);
    mc.damageBy.set("Alpha", 100);
    vi.spyOn(Math, "random").mockReturnValue(0);
    killMonster(w, id, mc);
    expect(totalCoin(w, "Alpha", "Bravo")).toBe(0);
  });

  it("ví chạm trần: không vượt COIN_CAP", () => {
    const { w } = setup(1);
    w.ctrl.get("Alpha")!.coin = COIN_CAP - 5;
    kill(w, "mang", { Alpha: 100 });
    expect(coinOf(w, "Alpha")).toBe(COIN_CAP);
  });
});
