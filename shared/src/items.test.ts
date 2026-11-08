import { describe, expect, it } from "vitest";
import {
  ITEMS, ITEM_BY_ID, DROP_TABLES, MONSTERS, INVENTORY_SLOTS,
  rollDrops, emptyInventory, addToInventory,
} from "./index";

describe("dữ liệu vật phẩm", () => {
  it("id không trùng, stack và độ hiếm hợp lệ", () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const i of ITEMS) {
      expect(i.stack).toBeGreaterThanOrEqual(1);
      expect(i.rarity).toBeGreaterThanOrEqual(0);
      expect(i.rarity).toBeLessThanOrEqual(4);
    }
  });

  it("đan dược nào cũng có hiệu ứng và hồi chiêu, nguyên liệu thì không", () => {
    for (const i of ITEMS) {
      if (i.type === "consumable") {
        expect(i.effect).toBeDefined();
        expect(i.cooldown).toBeGreaterThan(0);
      } else {
        expect(i.effect).toBeUndefined();
      }
    }
    expect(ITEM_BY_ID.tu_khi_dan.cooldown).toBe(60_000);
  });

  it("mỗi loại quái có bảng rơi đồ, mỗi dòng trỏ tới vật phẩm có thật", () => {
    for (const m of MONSTERS) expect(DROP_TABLES[m.id]?.length).toBeGreaterThan(0);
    for (const [kind, table] of Object.entries(DROP_TABLES)) {
      expect(MONSTERS.some((m) => m.id === kind)).toBe(true);
      for (const e of table) {
        expect(ITEM_BY_ID[e.itemId]).toBeDefined();
        expect(e.chance).toBeGreaterThan(0);
        expect(e.chance).toBeLessThanOrEqual(1);
        expect(e.min).toBeGreaterThanOrEqual(1);
        expect(e.max).toBeGreaterThanOrEqual(e.min);
        expect(e.max).toBeLessThanOrEqual(ITEM_BY_ID[e.itemId].stack);
      }
    }
  });
});

describe("rollDrops", () => {
  it("rng nhỏ: rơi tất cả, số lượng ít nhất; rng sát 1: không rơi gì", () => {
    expect(rollDrops("lang", () => 0)).toEqual(DROP_TABLES.lang.map((e) => ({ itemId: e.itemId, qty: e.min })));
    expect(rollDrops("lang", () => 0.999)).toEqual([]);
  });

  it("số lượng luôn trong [min, max]", () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let n = 0; n < 2000; n++) {
      for (const d of rollDrops("mang", rng)) {
        const e = DROP_TABLES.mang.find((x) => x.itemId === d.itemId)!;
        expect(d.qty).toBeGreaterThanOrEqual(e.min);
        expect(d.qty).toBeLessThanOrEqual(e.max);
      }
    }
  });

  it("quái không có bảng thì không rơi gì", () => {
    expect(rollDrops("khong_co")).toEqual([]);
  });
});

describe("addToInventory", () => {
  it("cộng dồn vào ô cùng loại trước, tràn sang ô trống", () => {
    const inv = emptyInventory();
    expect(inv).toHaveLength(INVENTORY_SLOTS);
    inv[3] = { itemId: "hoi_huyet_dan", qty: 18 };
    expect(addToInventory(inv, "hoi_huyet_dan", 5)).toBe(0);
    expect(inv[3]).toEqual({ itemId: "hoi_huyet_dan", qty: 20 });
    expect(inv[0]).toEqual({ itemId: "hoi_huyet_dan", qty: 3 });
  });

  it("túi đầy thì trả về phần thừa và không đổi túi", () => {
    const inv = emptyInventory().map(() => ({ itemId: "long_tho", qty: 99 }));
    const before = JSON.stringify(inv);
    expect(addToInventory(inv, "nanh_soi", 2)).toBe(2);
    expect(JSON.stringify(inv)).toBe(before);
  });

  it("vừa đủ chỗ một phần thì vào phần đó", () => {
    const inv = emptyInventory().map(() => ({ itemId: "long_tho", qty: 99 }));
    inv[5] = { itemId: "tu_khi_dan", qty: 8 }; // stack 10
    expect(addToInventory(inv, "tu_khi_dan", 5)).toBe(3);
    expect(inv[5]!.qty).toBe(10);
  });

  it("bỏ qua vật phẩm lạ và số lượng không hợp lệ", () => {
    const inv = emptyInventory();
    expect(addToInventory(inv, "khong_co", 3)).toBe(3);
    expect(addToInventory(inv, "long_tho", 0)).toBe(0);
    expect(addToInventory(inv, "long_tho", -4)).toBe(0);
    expect(addToInventory(inv, "long_tho", NaN)).toBe(0);
    expect(inv.every((s) => s === null)).toBe(true);
  });
});
