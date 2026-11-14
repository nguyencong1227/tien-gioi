// Nút "dùng" của vật phẩm trong túi (M7.4): đan dược "Dùng", kinh quyển "Học", còn lại không có nút.
import { describe, expect, it } from "vitest";
import { ITEM_BY_ID, ITEMS, SKILLS_M7, bookIdOf, realmLabel } from "@tien-gioi/shared";
import { bookTeach, useLabelOf } from "./item-use";

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

describe("bookTeach (dòng Dạy ở chi tiết túi)", () => {
  const hoaVan = ITEM_BY_ID[bookIdOf("hoa_van_kiem")];

  it("quyển chiêu cơ bản: Luyện Khí đủ, Phàm Nhân chưa; ghi đúng tên chiêu và cảnh giới cần", () => {
    const skill = SKILLS_M7.find((d) => d.id === "hoa_van_kiem")!;
    const req = realmLabel(skill.reqRealm, skill.reqTier);
    const ok = bookTeach(hoaVan, skill.reqRealm, skill.reqTier);
    expect(ok).toEqual({
      skillName: skill.name,
      ok: true,
      text: `Dạy: ${skill.name} · Đủ cảnh giới (${req})`,
    });
    // một bậc dưới mức cần (nếu reqTier = 0 thì xuống một cảnh giới)
    const [lowRealm, lowTier] =
      skill.reqTier > 0 ? [skill.reqRealm, skill.reqTier - 1] : [skill.reqRealm - 1, 9];
    const low = bookTeach(hoaVan, lowRealm, lowTier);
    expect(low?.ok).toBe(false);
    expect(low?.text).toBe(`Dạy: ${skill.name} · Cần ${req}`);
  });

  it("cảnh giới cao hơn thì đủ bất kể bậc (cùng `skillReqMet` với máy chủ)", () => {
    for (const d of SKILLS_M7) {
      const info = bookTeach(ITEM_BY_ID[bookIdOf(d.id)], d.reqRealm + 1, 0);
      expect(info?.ok, d.id).toBe(true);
      expect(info?.text, d.id).toContain(d.name);
    }
  });

  it("món không phải kinh quyển, không có món, chiêu không tồn tại, cảnh giới lạ: null / chưa đủ, không ném lỗi", () => {
    expect(bookTeach(ITEM_BY_ID.hoi_huyet_dan, 3, 0)).toBeNull();
    expect(bookTeach(ITEM_BY_ID.lang_nha_kiem, 3, 0)).toBeNull();
    expect(bookTeach(undefined, 3, 0)).toBeNull();
    expect(bookTeach({ teaches: "khong_co_chieu_nay" }, 3, 0)).toBeNull();
    expect(bookTeach({ teaches: "constructor" }, 3, 0)).toBeNull();
    expect(bookTeach(hoaVan, Number.NaN, 0)?.ok).toBe(false);
    expect(bookTeach(hoaVan, Number.POSITIVE_INFINITY, 0)?.ok).toBe(false);
  });
});
