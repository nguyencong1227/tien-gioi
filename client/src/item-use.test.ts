// Nút "dùng" của vật phẩm trong túi (M7.4): đan dược "Dùng", kinh quyển "Học", còn lại không có nút.
import { describe, expect, it } from "vitest";
import { ITEM_BY_ID, ITEMS, SKILLS_M7, bookIdOf } from "@tien-gioi/shared";
import { useLabelOf } from "./item-use";

describe("useLabelOf", () => {
  it("kinh quyển -> Học; đan dược -> Dùng; nguyên liệu, trang bị, không có món -> null", () => {
    expect(useLabelOf(ITEM_BY_ID[bookIdOf("hoa_van_kiem")])).toBe("Học");
    expect(useLabelOf(ITEM_BY_ID.hoi_huyet_dan)).toBe("Dùng");
    expect(useLabelOf(ITEM_BY_ID.long_tho)).toBeNull();
    expect(useLabelOf(ITEM_BY_ID.lang_nha_kiem)).toBeNull();
    expect(useLabelOf(undefined)).toBeNull();
  });

  it("MỌI kinh quyển thật có nút Học; MỌI đan dược có nút Dùng; không loại vật phẩm nào khác có nút", () => {
    for (const d of SKILLS_M7) expect(useLabelOf(ITEM_BY_ID[bookIdOf(d.id)]), d.id).toBe("Học");
    for (const it of ITEMS) {
      const label = useLabelOf(it);
      if (it.type === "book") expect(label, it.id).toBe("Học");
      else if (it.effect) expect(label, it.id).toBe("Dùng");
      else expect(label, it.id).toBeNull();
    }
  });

  it("quyển có cả `teaches` lẫn `effect` (dữ liệu hỏng) ưu tiên Học: không thành nút Dùng của đan dược", () => {
    expect(
      useLabelOf({ teaches: "hoa_van_kiem", effect: { kind: "hp", amount: 10 } } as never),
    ).toBe("Học");
  });
});
