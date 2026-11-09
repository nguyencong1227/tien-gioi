import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID } from "./game";
import { ITEMS, ITEM_BY_ID } from "./items";
import { NPC_BY_ID, TRADES } from "./npcs";
import { RECIPES } from "./recipes";
import {
  BUY_MARKUP,
  COIN_CAP,
  COIN_DROPS,
  ITEM_VALUE,
  SELL_RATE,
  SHOPS,
  SHOP_BY_NPC,
  addCoin,
  buyPrice,
  rollCoin,
  sellPrice,
} from "./currency";

describe("giá trị vật phẩm", () => {
  it("mọi vật phẩm đều có giá trị (số nguyên >= 0) và không có khóa lạ", () => {
    for (const i of ITEMS) {
      expect(Object.prototype.hasOwnProperty.call(ITEM_VALUE, i.id), `thiếu giá trị: ${i.id}`).toBe(
        true,
      );
      const v = ITEM_VALUE[i.id]!;
      expect(Number.isInteger(v) && v >= 0, `giá trị sai: ${i.id}`).toBe(true);
    }
    for (const id of Object.keys(ITEM_VALUE))
      expect(ITEM_BY_ID[id], `khóa lạ: ${id}`).toBeDefined();
  });

  it("mua rồi bán lại luôn lỗ, bán nhiều cũng không lách được (không có vòng lời)", () => {
    expect(SELL_RATE).toBeGreaterThan(0);
    expect(SELL_RATE).toBeLessThan(1);
    expect(BUY_MARKUP).toBeGreaterThan(1);
    for (const i of ITEMS) {
      if (!(ITEM_VALUE[i.id]! > 0)) continue;
      expect(buyPrice(i.id), i.id).toBeGreaterThan(sellPrice(i.id));
      expect(sellPrice(i.id), i.id).toBeGreaterThanOrEqual(1);
      expect(sellPrice(i.id), i.id).toBeLessThanOrEqual(ITEM_VALUE[i.id]!);
    }
  });

  it("id lạ hoặc tên thuộc tính của Object không có giá (không rơi vào prototype)", () => {
    for (const id of ["", "khong_co", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(sellPrice(id)).toBe(0);
      expect(buyPrice(id)).toBe(0);
    }
  });
});

describe("cửa hàng", () => {
  it("NPC và hàng bán đều có thật, có giá, không trùng", () => {
    expect(new Set(SHOPS.map((s) => s.npcId)).size).toBe(SHOPS.length);
    for (const s of SHOPS) {
      expect(NPC_BY_ID[s.npcId], s.npcId).toBeDefined();
      expect(SHOP_BY_NPC[s.npcId]).toBe(s);
      expect(new Set(s.itemIds).size).toBe(s.itemIds.length);
      for (const id of s.itemIds) {
        expect(ITEM_BY_ID[id], id).toBeDefined();
        expect(buyPrice(id), id).toBeGreaterThan(0);
      }
    }
  });

  it("không bán đồ cộng tu vi hay trang bị (không vòng qua đường cong tu luyện, docs/CAN_BANG.md)", () => {
    for (const s of SHOPS) {
      for (const id of s.itemIds) {
        const def = ITEM_BY_ID[id]!;
        expect(def.type, id).not.toBe("equip");
        expect(def.effect?.kind, id).not.toBe("exp");
      }
    }
  });
});

describe("rơi Linh thạch", () => {
  it("bảng rơi hợp lệ: quái có thật, xác suất (0, 1], min <= max, số nguyên dương", () => {
    for (const [kind, d] of Object.entries(COIN_DROPS)) {
      expect(MONSTER_BY_ID[kind], kind).toBeDefined();
      expect(d.chance).toBeGreaterThan(0);
      expect(d.chance).toBeLessThanOrEqual(1);
      expect(Number.isInteger(d.min) && d.min >= 1, kind).toBe(true);
      expect(Number.isInteger(d.max) && d.max >= d.min, kind).toBe(true);
    }
  });

  it("rollCoin: không rơi khi tung vượt xác suất, rơi trong khoảng min..max, không vượt max khi rng sát 1", () => {
    const d = COIN_DROPS.lang!;
    expect(rollCoin("lang", () => d.chance)).toBe(0); // rng >= chance -> không rơi
    expect(rollCoin("lang", () => 0)).toBe(d.min);
    const seq = [0, 0.999999];
    let i = 0;
    expect(rollCoin("lang", () => seq[i++]!)).toBe(d.max);
  });

  it("quái không có bảng, hoặc tên thuộc tính của Object, không rơi tiền", () => {
    for (const k of ["", "khong_co", "constructor", "__proto__", "toString"]) {
      expect(rollCoin(k, () => 0)).toBe(0);
    }
  });

  it("quái mạnh hơn rơi trung bình nhiều tiền hơn (theo máu quái)", () => {
    const avg = (k: string) => {
      const d = COIN_DROPS[k]!;
      return d.chance * ((d.min + d.max) / 2);
    };
    const kinds = Object.keys(COIN_DROPS).sort(
      (a, b) => MONSTER_BY_ID[a]!.hp - MONSTER_BY_ID[b]!.hp,
    );
    for (let i = 1; i < kinds.length; i++)
      expect(avg(kinds[i]!)).toBeGreaterThan(avg(kinds[i - 1]!));
  });
});

describe("addCoin", () => {
  it("cộng, trừ, cắt trần và sàn 0", () => {
    expect(addCoin(10, 5)).toBe(15);
    expect(addCoin(10, -4)).toBe(6);
    expect(addCoin(10, -999)).toBe(0);
    expect(addCoin(COIN_CAP - 1, 50)).toBe(COIN_CAP);
    expect(addCoin(COIN_CAP, 1)).toBe(COIN_CAP);
  });

  it("giá trị không hữu hạn hoặc lẻ không làm hỏng số dư (luôn nguyên, trong 0..COIN_CAP)", () => {
    expect(addCoin(10, NaN)).toBe(10);
    expect(addCoin(10, Infinity)).toBe(10);
    expect(addCoin(NaN, 5)).toBe(5);
    expect(addCoin(-Infinity, 5)).toBe(5);
    expect(addCoin(10.9, 1.9)).toBe(11);
    expect(Number.isInteger(addCoin(1e308, 1e308))).toBe(true);
  });
});

describe("rèn và đổi đồ không thành vòng sinh tiền (docs/CAN_BANG.md)", () => {
  // Giá bán cho NPC của cả một bộ (id + số lượng); đồ không bán được tính 0.
  const sellTotal = (xs: { itemId: string; qty: number }[]) =>
    xs.reduce((s, x) => s + sellPrice(x.itemId) * x.qty, 0);
  const buyTotal = (xs: { itemId: string; qty: number }[]) =>
    xs.reduce((s, x) => s + buyPrice(x.itemId) * x.qty, 0);
  const shopItems = new Set(SHOPS.flatMap((s) => s.itemIds));

  /** Rèn rồi bán lời tối đa bấy nhiêu lần so với bán thẳng nguyên liệu (hiện cao nhất ~1.6). */
  const RECIPE_MAX_GAIN = 2;
  /** Đổi đồ ở Lão dược sư (hiện cao nhất ~1.2). */
  const TRADE_MAX_GAIN = 1.5;

  it("rèn: bán thành phẩm không lời quá RECIPE_MAX_GAIN lần so với bán nguyên liệu", () => {
    for (const r of RECIPES) {
      const inSell = sellTotal(r.inputs);
      const outSell = sellTotal([r.output]);
      expect(inSell, `${r.id}: nguyên liệu phải bán được`).toBeGreaterThan(0);
      expect(outSell, `${r.id}: ${outSell} / ${inSell}`).toBeLessThanOrEqual(
        inSell * RECIPE_MAX_GAIN,
      );
    }
  });

  it("đổi đồ: nhận về không lời quá TRADE_MAX_GAIN lần so với bán thứ nộp", () => {
    for (const t of TRADES) {
      const inSell = sellTotal(t.give);
      const outSell = sellTotal([t.get]);
      expect(inSell, `${t.id}: đồ nộp phải bán được`).toBeGreaterThan(0);
      expect(outSell, `${t.id}: ${outSell} / ${inSell}`).toBeLessThanOrEqual(
        inSell * TRADE_MAX_GAIN,
      );
    }
  });

  it("không có vòng mua nguyên liệu ở cửa hàng -> rèn / đổi -> bán lại có lời", () => {
    // Chỉ cần xét khi cửa hàng bán một thứ làm nguyên liệu (hiện chưa có): mua rồi biến đổi rồi bán phải lỗ.
    for (const r of RECIPES)
      for (const i of r.inputs)
        if (shopItems.has(i.itemId))
          expect(buyTotal(r.inputs), r.id).toBeGreaterThan(sellTotal([r.output]));
    for (const t of TRADES)
      for (const g of t.give)
        if (shopItems.has(g.itemId))
          expect(buyTotal(t.give), t.id).toBeGreaterThan(sellTotal([t.get]));
  });
});
