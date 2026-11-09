import { describe, expect, it } from "vitest";
import { COIN_CAP } from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { changeCoin, sendWallet, trySpendCoin } from "./wallet";

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
