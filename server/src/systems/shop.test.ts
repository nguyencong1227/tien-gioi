import { describe, expect, it } from "vitest";
import {
  COIN_CAP,
  INVENTORY_SLOTS,
  NPC_BY_ID,
  NPC_RANGE,
  SHOP_MAX_QTY,
  buyPrice,
  sellPrice,
  type DialogOption,
} from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { buy, sell } from "./shop";
import { giveItem } from "./inventory";
import { talk } from "./npc";

const NPC = "duoc_su";

/** Một người chơi đứng cạnh Lão dược sư với `coin` Linh thạch. */
function shopper(coin = 1000) {
  const t = makeWorld();
  const { p, c } = addPlayer(t.w, "a");
  p.x = NPC_BY_ID[NPC]!.x + 10;
  p.y = NPC_BY_ID[NPC]!.y;
  c.coin = coin;
  return { ...t, p, c };
}
const count = (c: { inv: ({ itemId: string; qty: number } | null)[] }, id: string) =>
  c.inv.reduce((n, s) => n + (s?.itemId === id ? s.qty : 0), 0);
/** Ảnh chụp trạng thái để chứng minh "không đổi gì" khi bị từ chối. */
const snap = (c: { coin: number; inv: unknown }) => JSON.stringify({ coin: c.coin, inv: c.inv });

describe("mua hàng", () => {
  it("đủ tiền, túi còn chỗ: nhận đồ, trừ tiền, báo ví / túi / toast cho chủ", () => {
    const { w, c, wallets, invs, toasts } = shopper(100);
    const price = buyPrice("hoi_huyet_dan");
    buy(w, "a", NPC, "hoi_huyet_dan", 2);
    expect(count(c, "hoi_huyet_dan")).toBe(2);
    expect(c.coin).toBe(100 - 2 * price);
    expect(wallets).toEqual([{ sid: "a", msg: { coin: 100 - 2 * price, gained: -2 * price } }]);
    expect(invs.at(-1)!.msg.gained).toEqual([{ itemId: "hoi_huyet_dan", qty: 2 }]);
    expect(toasts.at(-1)!.msg.tone).toBe("good");
  });

  it("không đủ tiền: không đổi gì", () => {
    const { w, c, toasts, wallets } = shopper(buyPrice("hoi_huyet_dan") * 2 - 1);
    const before = snap(c);
    buy(w, "a", NPC, "hoi_huyet_dan", 2);
    expect(snap(c)).toBe(before);
    expect(wallets).toEqual([]);
    expect(toasts.at(-1)!.msg).toMatchObject({ tone: "bad", text: "Không đủ Linh thạch." });
  });

  it("túi không đủ chỗ cho cả số lượng: không mua dở, không mất tiền", () => {
    const { w, c, toasts } = shopper(100_000);
    // Còn đúng một ô trống: 99 đan (mỗi ô chứa 20) cần 5 ô
    for (let i = 0; i < INVENTORY_SLOTS - 1; i++) giveItem(w, "a", "lang_nha_kiem", 1);
    expect(c.inv.filter((s) => s === null)).toHaveLength(1);
    const before = snap(c);
    buy(w, "a", NPC, "hoi_huyet_dan", SHOP_MAX_QTY);
    expect(snap(c)).toBe(before);
    expect(toasts.at(-1)!.msg).toMatchObject({ tone: "bad", text: "Túi đồ đã đầy." });
    // Vừa một ô thì mua được
    buy(w, "a", NPC, "hoi_huyet_dan", 20);
    expect(count(c, "hoi_huyet_dan")).toBe(20);
  });

  it("số lượng rác bị bỏ qua, không đổi gì", () => {
    const { w, c, toasts } = shopper();
    const before = snap(c);
    const bad: unknown[] = [
      NaN,
      Infinity,
      -Infinity,
      0,
      -1,
      1.5,
      SHOP_MAX_QTY + 1,
      1e9,
      "2",
      null,
      undefined,
      {},
      [2],
    ];
    for (const q of bad) buy(w, "a", NPC, "hoi_huyet_dan", q);
    expect(snap(c)).toBe(before);
    expect(toasts).toEqual([]);
  });

  it("hàng không có trong cửa hàng hoặc id lạ bị bỏ qua (tu_khi_dan, trang bị, tên thuộc tính Object)", () => {
    const { w, c } = shopper();
    const before = snap(c);
    const bad: unknown[] = [
      "tu_khi_dan",
      "lang_nha_kiem",
      "nanh_soi",
      "constructor",
      "__proto__",
      "toString",
      "",
      7,
      null,
      undefined,
    ];
    for (const id of bad) buy(w, "a", NPC, id, 1);
    expect(snap(c)).toBe(before);
  });

  it("NPC xa, NPC không có cửa hàng, id NPC lạ, người trọng thương: không mua được", () => {
    const { w, c, p } = shopper();
    const before = snap(c);
    buy(w, "a", "truong_tran", "hoi_huyet_dan", 1); // có thật nhưng không bán hàng (và đứng xa)
    buy(w, "a", "constructor", "hoi_huyet_dan", 1);
    buy(w, "a", undefined, "hoi_huyet_dan", 1);
    p.x = NPC_BY_ID[NPC]!.x + NPC_RANGE + 5; // vừa quá tầm
    buy(w, "a", NPC, "hoi_huyet_dan", 1);
    p.x = NPC_BY_ID[NPC]!.x + 10;
    p.dead = true;
    buy(w, "a", NPC, "hoi_huyet_dan", 1);
    expect(snap(c)).toBe(before);
    p.dead = false;
    buy(w, "a", NPC, "hoi_huyet_dan", 1);
    expect(count(c, "hoi_huyet_dan")).toBe(1); // điều kiện khôi phục thì mua được
  });
});

describe("bán hàng", () => {
  it("bán một phần ô: nhận tiền theo giá thu mua, túi bớt, báo ví / túi / toast", () => {
    const { w, c, wallets, invs, toasts } = shopper(0);
    giveItem(w, "a", "nanh_soi", 10);
    wallets.length = 0;
    sell(w, "a", NPC, 0, 3);
    expect(c.coin).toBe(3 * sellPrice("nanh_soi"));
    expect(c.inv[0]).toEqual({ itemId: "nanh_soi", qty: 7 });
    expect(wallets).toEqual([{ sid: "a", msg: { coin: c.coin, gained: c.coin } }]);
    expect(invs.at(-1)!.msg.slots[0]).toEqual({ itemId: "nanh_soi", qty: 7 });
    expect(toasts.at(-1)!.msg.tone).toBe("good");
  });

  it("bán hết ô: ô thành trống", () => {
    const { w, c } = shopper(0);
    giveItem(w, "a", "da_ho", 2);
    sell(w, "a", NPC, 0, 2);
    expect(c.inv[0]).toBeNull();
    expect(c.coin).toBe(2 * sellPrice("da_ho"));
  });

  it("không bán quá số đang có, không bán ô trống hay ô sai, số lượng rác: không đổi gì", () => {
    const { w, c } = shopper(5);
    giveItem(w, "a", "nanh_soi", 2);
    const before = snap(c);
    sell(w, "a", NPC, 0, 3); // quá số lượng
    sell(w, "a", NPC, 1, 1); // ô trống
    for (const slot of [-1, INVENTORY_SLOTS, 0.5, NaN, Infinity, "0", null, undefined])
      sell(w, "a", NPC, slot, 1);
    for (const q of [NaN, 0, -2, 1.5, SHOP_MAX_QTY + 1, "1", null, undefined])
      sell(w, "a", NPC, 0, q);
    expect(snap(c)).toBe(before);
  });

  it("ví chạm trần: không bán (không để mất đồ mà tiền bị cắt)", () => {
    const { w, c, toasts } = shopper(COIN_CAP - 1);
    giveItem(w, "a", "nanh_soi", 1);
    const before = snap(c);
    sell(w, "a", NPC, 0, 1);
    expect(snap(c)).toBe(before);
    expect(toasts.at(-1)!.msg).toMatchObject({ tone: "bad", text: "Ví Linh thạch đã đầy." });
  });

  it("NPC xa hoặc không có cửa hàng: không bán được", () => {
    const { w, c } = shopper(0);
    giveItem(w, "a", "nanh_soi", 1);
    const before = snap(c);
    sell(w, "a", "truong_tran", 0, 1);
    sell(w, "a", "__proto__", 0, 1);
    expect(snap(c)).toBe(before);
  });
});

describe("kinh tế: không có vòng lời", () => {
  it("mua rồi bán lại toàn bộ thì lỗ tiền", () => {
    const { w, c } = shopper(1000);
    buy(w, "a", NPC, "hoi_huyet_dan", 10);
    buy(w, "a", NPC, "hoi_linh_dan", 10);
    for (let i = 0; i < INVENTORY_SLOTS; i++) if (c.inv[i]) sell(w, "a", NPC, i, c.inv[i]!.qty);
    expect(c.inv.every((s) => s === null)).toBe(true);
    expect(c.coin).toBeLessThan(1000);
  });
});

describe("hộp thoại", () => {
  const optionsOf = (npc: string) => {
    const { w, dialogs, p } = shopper();
    p.x = NPC_BY_ID[npc]!.x;
    p.y = NPC_BY_ID[npc]!.y;
    talk(w, "a", npc);
    return dialogs.at(-1)!.msg.options as DialogOption[];
  };

  it("NPC có cửa hàng thì có lựa chọn Cửa hàng; NPC khác thì không", () => {
    expect(optionsOf(NPC).some((o) => o.action.kind === "shop")).toBe(true);
    expect(optionsOf("truong_tran").some((o) => o.action.kind === "shop")).toBe(false);
    expect(optionsOf("tho_ren").some((o) => o.action.kind === "shop")).toBe(false);
  });
});
