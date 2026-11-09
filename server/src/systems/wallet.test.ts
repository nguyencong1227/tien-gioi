import { describe, expect, it } from "vitest";
import { COIN_CAP } from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { changeCoin, sendWallet, splitCoin, trySpendCoin } from "./wallet";

describe("ví Linh thạch", () => {
  it("cộng tiền: đổi số dư, gửi wallet cho đúng chủ kèm gained", () => {
    const { w, wallets } = makeWorld();
    const { c } = addPlayer(w, "A");
    addPlayer(w, "B");
    expect(changeCoin(w, "A", 7)).toBe(7);
    expect(c.coin).toBe(7);
    expect(wallets).toEqual([{ sid: "A", msg: { coin: 7, gained: 7 } }]);
  });

  it("trừ tiền không xuống dưới 0; cộng không vượt COIN_CAP; phần đổi trả về là phần thật", () => {
    const { w, wallets } = makeWorld();
    const { c } = addPlayer(w, "A");
    c.coin = 5;
    expect(changeCoin(w, "A", -50)).toBe(-5);
    expect(c.coin).toBe(0);
    c.coin = COIN_CAP - 3;
    expect(changeCoin(w, "A", 100)).toBe(3);
    expect(c.coin).toBe(COIN_CAP);
    wallets.length = 0;
    expect(changeCoin(w, "A", 1)).toBe(0); // đã đầy: không đổi, không gửi tin
    expect(wallets).toEqual([]);
  });

  it("số lạ (NaN, vô cực, lẻ) không làm hỏng số dư", () => {
    const { w, wallets } = makeWorld();
    const { c } = addPlayer(w, "A");
    c.coin = 10;
    expect(changeCoin(w, "A", NaN)).toBe(0);
    expect(changeCoin(w, "A", Infinity)).toBe(0);
    expect(changeCoin(w, "A", -Infinity)).toBe(0);
    expect(c.coin).toBe(10);
    expect(changeCoin(w, "A", 2.9)).toBe(2);
    expect(Number.isInteger(c.coin)).toBe(true);
    expect(wallets).toHaveLength(1);
  });

  it("trySpendCoin: trọn vẹn hoặc không gì cả", () => {
    const { w, wallets } = makeWorld();
    const { c } = addPlayer(w, "A");
    c.coin = 10;
    expect(trySpendCoin(w, "A", 11)).toBe(false);
    expect(c.coin).toBe(10);
    for (const bad of [0, -3, NaN, Infinity, 2.5]) expect(trySpendCoin(w, "A", bad)).toBe(false);
    expect(c.coin).toBe(10);
    expect(wallets).toEqual([]);
    expect(trySpendCoin(w, "A", 10)).toBe(true);
    expect(c.coin).toBe(0);
    expect(wallets).toEqual([{ sid: "A", msg: { coin: 0, gained: -10 } }]);
  });

  it("người không có trong phòng: không làm gì, không ném lỗi", () => {
    const { w, wallets } = makeWorld();
    expect(changeCoin(w, "ghost", 5)).toBe(0);
    expect(trySpendCoin(w, "ghost", 5)).toBe(false);
    sendWallet(w, "ghost");
    expect(wallets).toEqual([]);
  });

  it("sendWallet đồng bộ lại không kèm gained", () => {
    const { w, wallets } = makeWorld();
    const { c } = addPlayer(w, "A");
    c.coin = 42;
    sendWallet(w, "A");
    expect(wallets).toEqual([{ sid: "A", msg: { coin: 42 } }]);
  });
});

describe("splitCoin", () => {
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  it("tổng chia ra đúng bằng khoản rơi, mọi tỉ lệ và số người", () => {
    for (const total of [1, 2, 3, 7, 10, 99, 150, 299, 1000]) {
      for (const ws of [
        [1],
        [1, 1],
        [1, 1, 1],
        [1, 1, 1, 1],
        [7, 1],
        [0.1, 0.2, 0.7],
        [3, 3, 3, 1],
      ]) {
        const w = new Map(ws.map((x, i) => [`p${i}`, x] as [string, number]));
        expect(sum(splitCoin(total, w)), `${total} / ${ws}`).toBe(total);
      }
    }
  });

  it("chia theo trọng số: phần của mỗi người lệch tối đa 1 so với số lý thuyết", () => {
    const out = splitCoin(
      100,
      new Map([
        ["a", 3],
        ["b", 1],
      ]),
    );
    expect(Math.abs(out.get("a")! - 75)).toBeLessThanOrEqual(1);
    expect(Math.abs(out.get("b")! - 25)).toBeLessThanOrEqual(1);
  });

  it("khoản nhỏ hơn số người: người được nhận là ngẫu nhiên, không luôn là cùng một người", () => {
    const w = new Map([
      ["a", 1],
      ["b", 1],
      ["c", 1],
      ["d", 1],
    ]);
    const winners = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const out = splitCoin(1, w); // chỉ một người nhận
      expect(out.size).toBe(1);
      winners.add([...out.keys()][0]!);
    }
    expect(winners.size).toBeGreaterThan(1);
    // rng cố định thì kết quả xác định
    const seq = [0.9, 0.1, 0.5, 0.3];
    let i = 0;
    expect([...splitCoin(1, w, () => seq[i++ % 4]!).keys()]).toEqual(["b"]);
  });

  it("bỏ qua trọng số không hợp lệ; khoản rơi không hợp lệ hoặc không ai đủ điều kiện thì rỗng", () => {
    const w = new Map([
      ["ok", 1],
      ["zero", 0],
      ["neg", -3],
      ["nan", NaN],
      ["inf", Infinity],
    ]);
    expect(splitCoin(10, w)).toEqual(new Map([["ok", 10]]));
    for (const bad of [0, -5, 1.5, NaN, Infinity]) expect(splitCoin(bad, w).size).toBe(0);
    expect(splitCoin(10, new Map()).size).toBe(0);
    expect(splitCoin(10, new Map([["z", 0]])).size).toBe(0);
  });
});
