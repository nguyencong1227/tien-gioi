// Lựa chọn đầu thai client gửi (mục 58): chỉ phần hợp lệ, kẹp theo chân linh và danh sách máy chủ gửi.
import { describe, expect, it } from "vitest";
import { validateRebirth, type SoulView } from "@tien-gioi/shared";
import { buildRebirthChoice, keepToSend, usableOrigin } from "./limbo-choice";

// Chân linh MỚI TINH như `hanh` / `hanh1` ở bản thật: 0 ô giữ, 0 ô khắc, chưa có xuất thân nào
const TRANG: SoulView = { kiep: 1, duyen: 0, unlocks: {}, origins: [], engraved: [] };
const DA_MO: SoulView = {
  kiep: 3,
  duyen: 50,
  unlocks: { ky_vat: 2, khac: 2 },
  origins: ["the_tu"],
  engraved: ["me_tung_bo"],
};
const LIMBO = {
  keepable: ["hac_ho_kiem", "hac_ho_kiem", "lang_nha_kiem"],
  engravable: ["me_tung_bo", "hoa_van_kiem", "ung_trao"],
};

describe("buildRebirthChoice", () => {
  it("chân linh trắng, chưa đụng gì: xuất thân mặc định, không giữ, KHÔNG gửi engrave", () => {
    const c = buildRebirthChoice(
      TRANG,
      { keepable: [], engravable: [] },
      { origin: "pham_gia", relics: [], engrave: null },
    );
    expect(c).toEqual({ origin: "pham_gia", keep: [] });
  });

  it("chọn sẵn quá số ô (0 ô): không gửi món nào, không gửi chiêu nào; máy chủ (validateRebirth) nhận được", () => {
    const c = buildRebirthChoice(TRANG, LIMBO, {
      origin: "the_tu", // xuất thân chưa mở
      relics: ["hac_ho_kiem", "lang_nha_kiem"],
      engrave: ["me_tung_bo"],
    });
    expect(c.origin).toBe("pham_gia");
    expect(c.keep).toEqual([]);
    expect(c.engrave).toBeUndefined(); // kẹp về [] = đúng tập đã khắc ([]): vắng = giữ nguyên
    expect(validateRebirth(TRANG, c, LIMBO.keepable, LIMBO.engravable)).not.toBeNull();
  });

  it("chân linh đã mở: giữ tối đa 2 món CÓ THẬT, chiêu khắc kẹp theo danh sách + ô, xuất thân đã mua được giữ", () => {
    const c = buildRebirthChoice(DA_MO, LIMBO, {
      origin: "the_tu",
      relics: ["hac_ho_kiem", "khong_co", "hac_ho_kiem", "hac_ho_kiem", "lang_nha_kiem"],
      engrave: ["hoa_van_kiem", "ung_trao", "me_tung_bo", "la_hoac"],
    });
    expect(c.origin).toBe("the_tu");
    expect(c.keep).toEqual(["hac_ho_kiem", "hac_ho_kiem"]);
    expect(c.engrave).toEqual(["hoa_van_kiem", "ung_trao"]); // lạ bị bỏ, cắt còn 2 ô
    expect(validateRebirth(DA_MO, c, LIMBO.keepable, LIMBO.engravable)).not.toBeNull();
  });

  it("tập khắc trùng đúng tập đã khắc thì KHÔNG gửi engrave (vắng = giữ nguyên)", () => {
    const c = buildRebirthChoice(DA_MO, LIMBO, {
      origin: "pham_gia",
      relics: [],
      engrave: ["me_tung_bo"],
    });
    expect(c.engrave).toBeUndefined();
  });

  it("thiếu soul / limbo (không nên xảy ra): vẫn ra lựa chọn rỗng đầu thai được", () => {
    const c = buildRebirthChoice(undefined, undefined, {
      origin: "the_tu",
      relics: ["x"],
      engrave: ["y"],
    });
    expect(c).toEqual({ origin: "pham_gia", keep: [] });
  });
});

describe("usableOrigin / keepToSend", () => {
  it("xuất thân lạ, độc, chưa mở đều về Phàm gia", () => {
    for (const id of ["constructor", "__proto__", "", "kiem_khach", "the_tu"])
      expect(usableOrigin(TRANG, id)).toBe("pham_gia");
    expect(usableOrigin(DA_MO, "the_tu")).toBe("the_tu");
    expect(usableOrigin(undefined, "the_tu")).toBe("pham_gia");
  });

  it("keepToSend: cap 0 hoặc danh sách thiếu thì rỗng; mỗi món trong keepable dùng một lần", () => {
    expect(keepToSend(["a"], ["a"], 0)).toEqual([]);
    expect(keepToSend(undefined, ["a"], 3)).toEqual([]);
    expect(keepToSend(["a", "b"], ["a", "a", "b"], 3)).toEqual(["a", "b"]);
  });
});
