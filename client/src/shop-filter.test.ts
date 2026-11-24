import { describe, expect, it } from "vitest";
import { SHOP_BY_NPC, ITEM_BY_ID } from "@tien-gioi/shared";
import { SKILL_QUERY_MAX } from "./skill-filter";
import {
  SHOP_FILTER_MIN,
  cleanShopQuery,
  filterShopIds,
  shopFilterActive,
  shopFilterSummary,
  shopItemMatches,
} from "./shop-filter";

const ITEMS: Record<string, { name: string; desc: string }> = {
  a: { name: "Hồi Huyết Đan", desc: "Hồi 40% khí huyết." },
  b: { name: "Hỏa Vân Kiếm Pháp", desc: "Kinh quyển dạy chiêu Hỏa Vân Kiếm." },
  c: { name: "Bôn Thạch Quyền", desc: "Kinh quyển dạy chiêu Bôn Thạch." },
  d: { name: "Xích Viêm Kinh", desc: "Kinh quyển hệ Hỏa." },
};
const info = (id: string) => ITEMS[id];
const IDS = ["a", "b", "c", "d"];

describe("cleanShopQuery / shopFilterActive", () => {
  it("không phải chuỗi -> '' (không ném lỗi)", () => {
    for (const raw of [undefined, null, 5, {}, [], true]) expect(cleanShopQuery(raw)).toBe("");
  });
  it("cắt về SKILL_QUERY_MAX (chặn dán cả đoạn văn)", () => {
    expect(cleanShopQuery("x".repeat(SKILL_QUERY_MAX + 40))).toHaveLength(SKILL_QUERY_MAX);
    expect(cleanShopQuery("x".repeat(SKILL_QUERY_MAX))).toHaveLength(SKILL_QUERY_MAX);
  });
  it("chỉ khoảng trắng / trống KHÔNG phải đang lọc; có chữ thì có", () => {
    expect(shopFilterActive("")).toBe(false);
    expect(shopFilterActive("   ")).toBe(false);
    expect(shopFilterActive(undefined)).toBe(false);
    expect(shopFilterActive("hoa")).toBe(true);
  });
});

describe("shopItemMatches", () => {
  it("chuỗi trống: qua hết", () => {
    expect(shopItemMatches("Hồi Huyết Đan", "x", "")).toBe(true);
    expect(shopItemMatches("Hồi Huyết Đan", "x", "   ")).toBe(true);
  });
  it("không cần gõ dấu, không phân biệt hoa thường, 'đ' = 'd'", () => {
    expect(shopItemMatches("Hồi Huyết Đan", "", "hoi huyet dan")).toBe(true);
    expect(shopItemMatches("Hồi Huyết Đan", "", "HỒI HUYẾT ĐAN")).toBe(true);
    expect(shopItemMatches("Hồi Huyết Đan", "", "dan")).toBe(true);
  });
  it("MỖI từ phải khớp (thứ tự tuỳ ý), thiếu một từ là loại", () => {
    expect(shopItemMatches("Hỏa Vân Kiếm Pháp", "", "kiem hoa")).toBe(true);
    expect(shopItemMatches("Hỏa Vân Kiếm Pháp", "", "kiem bang")).toBe(false);
  });
  it("tìm được cả trong mô tả", () => {
    expect(shopItemMatches("Xích Viêm Kinh", "Kinh quyển hệ Hỏa.", "he hoa")).toBe(true);
    expect(shopItemMatches("Xích Viêm Kinh", "Kinh quyển hệ Hỏa.", "thuy")).toBe(false);
  });
  it("ký tự đặc biệt của RegExp chỉ là chữ thường (không ném lỗi, không khớp lung tung)", () => {
    for (const q of [".*", "(", "[a-", "\\", "a|b", "$^", "+", "?"]) {
      expect(() => shopItemMatches("Hồi Huyết Đan", "Hồi 40%", q)).not.toThrow();
    }
    expect(shopItemMatches("Hồi Huyết Đan", "", ".*")).toBe(false);
    expect(shopItemMatches("Hồi Huyết Đan", "Hồi 40%", "40%")).toBe(true);
  });
  it("chuỗi tìm dài hơn trần bị cắt TRƯỚC khi so (từ nằm quá trần không còn bắt buộc)", () => {
    const q = `hoi ${"x".repeat(SKILL_QUERY_MAX)}`;
    // cắt về trần: "hoi" + khoảng trắng tới sát trần chỉ còn từ "hoi" (từ "zzz" nằm sau trần bị bỏ); nếu không cắt thì "zzz" bắt buộc và loại món
    expect(shopItemMatches("Hồi Huyết Đan", "", `hoi${" ".repeat(SKILL_QUERY_MAX)}zzz`)).toBe(true);
    expect(shopItemMatches("Hồi Huyết Đan", "", q)).toBe(false);
  });
});

describe("filterShopIds", () => {
  it("không lọc: trả BẢN SAO đủ id theo thứ tự (kể cả id không có trong bảng)", () => {
    const out = filterShopIds([...IDS, "zz"], "", info);
    expect(out).toEqual([...IDS, "zz"]);
    const src = [...IDS];
    expect(filterShopIds(src, "", info)).not.toBe(src);
  });
  it("lọc: giữ thứ tự gốc của cửa hàng, không sắp lại", () => {
    expect(filterShopIds(IDS, "kinh", info)).toEqual(["b", "c", "d"]);
    expect(filterShopIds(["d", "c", "b", "a"], "kinh", info)).toEqual(["d", "c", "b"]);
  });
  it("lọc: không khớp -> rỗng; id không có trong bảng bị bỏ", () => {
    expect(filterShopIds(IDS, "khong-co", info)).toEqual([]);
    expect(filterShopIds(["a", "zz"], "hoi", info)).toEqual(["a"]);
  });
  it("không sửa danh sách đầu vào", () => {
    const src = Object.freeze([...IDS]) as readonly string[];
    expect(() => filterShopIds(src, "kinh", info)).not.toThrow();
    expect(src).toEqual(IDS);
  });
  it("trên dữ liệu thật: mọi cửa hàng, tìm đúng tên một món thì ra món đó", () => {
    for (const shop of Object.values(SHOP_BY_NPC)) {
      for (const id of shop.itemIds) {
        const def = ITEM_BY_ID[id];
        if (!def) continue;
        const out = filterShopIds(shop.itemIds, def.name, (i) => ITEM_BY_ID[i]);
        expect(out, `${shop.npcId}: tìm "${def.name}" phải ra ${id}`).toContain(id);
      }
    }
  });
});

describe("shopFilterSummary", () => {
  it("đang lọc: 'Hiện X / Y món'; không thì 'Y món'", () => {
    expect(shopFilterSummary(5, 22, true)).toBe("Hiện 5 / 22 món");
    expect(shopFilterSummary(22, 22, false)).toBe("22 món");
  });
  it("số lạ về số nguyên không âm", () => {
    expect(shopFilterSummary(NaN, Infinity, true)).toBe("Hiện 0 / 0 món");
    expect(shopFilterSummary(-3, 7.9, true)).toBe("Hiện 0 / 7 món");
  });
});

describe("ngưỡng hiện ô tìm", () => {
  it("SHOP_FILTER_MIN: cửa hàng ngắn (4-6 món) không có ô tìm; hai cửa hàng lớn (22 món) có", () => {
    const sizes = Object.fromEntries(
      Object.entries(SHOP_BY_NPC).map(([k, v]) => [k, v.itemIds.length]),
    );
    expect(sizes.lai_buon_suong).toBeLessThan(SHOP_FILTER_MIN);
    expect(sizes.lai_buon_han).toBeLessThan(SHOP_FILTER_MIN);
    expect(sizes.duoc_su).toBeGreaterThanOrEqual(SHOP_FILTER_MIN);
    expect(sizes.lai_buon).toBeGreaterThanOrEqual(SHOP_FILTER_MIN);
  });
});
