// Kinh quyển 12 chiêu (M7.4, #505): bất biến của `books.ts` + nguồn quyển (cửa hàng cho chiêu cơ bản, rơi hiếm / rơi trùm cho chiêu cao cấp).
import { describe, expect, it } from "vitest";
import {
  DROP_TABLES,
  SHOP_BOOK_IDS,
  SKILL_BOOK_ITEMS,
  bookIdOf,
  ITEMS,
  ITEM_BY_ID,
  ITEM_VALUE,
  MONSTER_BY_ID,
  SHOPS,
  SHOP_BY_NPC,
  SKILLS_M7,
  buyPrice,
  rollDrops,
  sellPrice,
  skillOf,
} from "./index";

describe("kinh quyển: dữ liệu", () => {
  it("mỗi chiêu có ĐÚNG MỘT quyển (`kinh_<chiêu>`), có trong ITEMS một lần, dạy đúng chiêu, tên / độ hiếm theo chiêu", () => {
    expect(SKILL_BOOK_ITEMS).toHaveLength(SKILLS_M7.length);
    expect(new Set(SKILL_BOOK_ITEMS.map((b) => b.id)).size).toBe(SKILLS_M7.length);
    for (const def of SKILLS_M7) {
      const id = bookIdOf(def.id);
      expect(id).toBe(`kinh_${def.id}`);
      const matches = ITEMS.filter((i) => i.id === id);
      expect(matches, id).toHaveLength(1);
      const b = matches[0];
      expect(b.type, id).toBe("book");
      expect(b.teaches, id).toBe(def.id);
      expect(skillOf(b.teaches), id).toBe(def);
      expect(b.name, id).toBe(def.bookName);
      expect(b.rarity, id).toBe(def.rarity);
      expect(b.stack, id).toBeGreaterThan(1); // quyển trùng gộp được (đọc thêm để tăng tầng)
      expect(b.equip, id).toBeUndefined();
      expect(b.effect, id).toBeUndefined();
      expect(b.desc.length, id).toBeGreaterThan(10);
    }
    expect(Object.keys(ITEM_BY_ID)).toHaveLength(ITEMS.length); // không id nào bị đè
  });

  it("giá: mỗi quyển có giá trị gốc dương; giá mua xấp xỉ `SkillDef.price` (không thấp hơn, hơn tối đa 1); bán lại luôn thấp hơn mua", () => {
    for (const def of SKILLS_M7) {
      const id = bookIdOf(def.id);
      expect(ITEM_VALUE[id], id).toBeGreaterThan(0);
      expect(buyPrice(id), id).toBeGreaterThanOrEqual(def.price);
      expect(buyPrice(id), id).toBeLessThanOrEqual(def.price + 1);
      expect(sellPrice(id), id).toBeGreaterThan(0);
      expect(sellPrice(id), id).toBeLessThan(buyPrice(id));
    }
  });
});

describe("kinh quyển: nguồn", () => {
  it("cửa hàng bán đúng các chiêu CƠ BẢN (độ hiếm <= 1, Luyện Khí) ở Lão dược sư và Lái buôn Hắc Phong; Vọng Sương và chiêu cao cấp thì không", () => {
    const basic = SKILLS_M7.filter((d) => d.rarity <= 1);
    expect(basic.length).toBeGreaterThan(0);
    expect(SHOP_BOOK_IDS).toEqual(basic.map((d) => bookIdOf(d.id)));
    for (const d of basic) expect(d.reqRealm, d.id).toBeLessThanOrEqual(1);
    for (const npc of ["duoc_su", "lai_buon"]) {
      for (const id of SHOP_BOOK_IDS)
        expect(SHOP_BY_NPC[npc].itemIds, `${npc} ${id}`).toContain(id);
    }
    for (const id of SHOP_BOOK_IDS) expect(SHOP_BY_NPC.lai_buon_suong.itemIds).not.toContain(id);
    const sold = new Set(SHOPS.flatMap((s) => s.itemIds));
    for (const d of SKILLS_M7.filter((x) => x.rarity >= 2))
      expect(sold.has(bookIdOf(d.id)), `${d.id} (cao cấp) không bán ở cửa hàng`).toBe(false);
  });

  it("mọi mục rơi kinh quyển trỏ tới quyển có thật, xác suất hợp lý (0..1, hiếm), và MỌI quyển đều kiếm được (bán hoặc rơi)", () => {
    const dropped = new Set<string>();
    for (const [mon, table] of Object.entries(DROP_TABLES)) {
      expect(MONSTER_BY_ID[mon], mon).toBeDefined();
      for (const e of table) {
        const it = ITEM_BY_ID[e.itemId];
        expect(it, `${mon} -> ${e.itemId}`).toBeDefined();
        if (it.type !== "book") continue;
        expect(e.chance, `${mon} ${e.itemId}`).toBeGreaterThan(0);
        expect(e.chance, `${mon} ${e.itemId}`).toBeLessThanOrEqual(0.3);
        expect([e.min, e.max], `${mon} ${e.itemId}`).toEqual([1, 1]);
        dropped.add(e.itemId);
      }
    }
    const sold = new Set(SHOPS.flatMap((s) => s.itemIds));
    for (const d of SKILLS_M7) {
      const id = bookIdOf(d.id);
      expect(sold.has(id) || dropped.has(id), `${id} phải bán hoặc rơi`).toBe(true);
    }
    // Chiêu cao cấp (Trúc Cơ trở lên) chỉ có nguồn là rơi: có ít nhất một nơi rơi
    for (const d of SKILLS_M7.filter((x) => x.rarity >= 2))
      expect(dropped.has(bookIdOf(d.id)), d.id).toBe(true);
  });

  it("rollDrops: trùm Xích Mãng rơi quyển cao cấp khi tung trúng, và không rơi khi tung trượt", () => {
    const hit = rollDrops("mang", () => 0); // mọi mục đều trúng, số lượng tối thiểu
    expect(hit.some((d) => d.itemId === bookIdOf("thanh_tung_phi_cham"))).toBe(true);
    expect(hit.some((d) => d.itemId === bookIdOf("cuu_cung_khon_sat"))).toBe(true);
    const miss = rollDrops("mang", () => 0.9999);
    expect(miss.some((d) => ITEM_BY_ID[d.itemId].type === "book")).toBe(false);
  });
});
