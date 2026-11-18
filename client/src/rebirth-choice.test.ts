import { describe, expect, it } from "vitest";
import { DEFAULT_ORIGIN, newSoul, soulView, validateRebirth } from "@tien-gioi/shared";
import { isRebirthRefusal, safeRebirthChoice } from "./rebirth-choice";

// Chân linh MỚI TINH (nhân vật mới: kiếp 1, 0 ô giữ, 0 ô khắc, chỉ có Phàm gia): trường hợp của lỗi gấp mục 58 (v0.5.2)
const fresh = soulView(newSoul("hanh", "2026-11-18T00:00:00.000Z"));
const limbo = {
  keepable: ["lang_nha_kiem", "tho_nhung_bao", "lang_nha_kiem"],
  engravable: ["ung_trao", "hoa_van_kiem"],
};
const rich = {
  ...fresh,
  unlocks: { ky_vat: 2, khac: 1 },
  origins: ["kiem_khach"],
  engraved: [],
};

describe("safeRebirthChoice: chỉ gửi lựa chọn máy chủ chấp nhận", () => {
  it("chân linh mới tinh, không chọn gì: Phàm gia, không giữ, không khắc, không bỏ gì", () => {
    const r = safeRebirthChoice(fresh, limbo, { origin: DEFAULT_ORIGIN, keep: [] });
    expect(r.choice).toEqual({ origin: DEFAULT_ORIGIN, keep: [] });
    expect(r.dropped).toEqual([]);
  });

  it("chân linh mới tinh mà đồ giữ được chọn sẵn (0 ô): bỏ hết, vẫn hợp lệ, báo phần bỏ", () => {
    const r = safeRebirthChoice(fresh, limbo, {
      origin: DEFAULT_ORIGIN,
      keep: ["lang_nha_kiem", "tho_nhung_bao"],
    });
    expect(r.choice.keep).toEqual([]);
    expect(r.dropped.join(" ")).toMatch(/2 di vật/);
    expect(validateRebirth(fresh, r.choice, limbo.keepable, limbo.engravable)).not.toBeNull();
  });

  it("chiêu khắc chọn sẵn vượt số ô (0 ô): engrave rỗng (thay danh sách bằng rỗng) hoặc vắng, vẫn hợp lệ", () => {
    const r = safeRebirthChoice(fresh, limbo, {
      origin: DEFAULT_ORIGIN,
      keep: [],
      engrave: ["ung_trao"],
    });
    expect(r.choice.engrave).toEqual([]);
    expect(r.dropped.join(" ")).toMatch(/1 chiêu khắc/);
    expect(validateRebirth(fresh, r.choice, limbo.keepable, limbo.engravable)).not.toBeNull();
  });

  it("engrave vắng thì VẪN vắng (giữ nguyên chiêu đã khắc)", () => {
    const r = safeRebirthChoice(rich, limbo, { origin: DEFAULT_ORIGIN, keep: [] });
    expect("engrave" in r.choice).toBe(false);
  });

  it("trong số ô: giữ đúng thứ tự, đếm theo số lượng (id lặp), cắt phần dư", () => {
    const r = safeRebirthChoice(rich, limbo, {
      origin: "kiem_khach",
      keep: ["lang_nha_kiem", "lang_nha_kiem", "tho_nhung_bao"],
      engrave: ["hoa_van_kiem", "ung_trao"],
    });
    expect(r.choice).toEqual({
      origin: "kiem_khach",
      keep: ["lang_nha_kiem", "lang_nha_kiem"],
      engrave: ["hoa_van_kiem"],
    });
    expect(r.dropped.length).toBe(2);
  });

  it("id giữ lặp quá số lượng thật trong danh sách giữ được thì bỏ phần dư", () => {
    const r = safeRebirthChoice(
      { ...rich, unlocks: { ky_vat: 3 } },
      { keepable: ["lang_nha_kiem"] },
      { origin: DEFAULT_ORIGIN, keep: ["lang_nha_kiem", "lang_nha_kiem"] },
    );
    expect(r.choice.keep).toEqual(["lang_nha_kiem"]);
  });

  it("xuất thân chưa mở / lạ / phí 0 khác Phàm gia: về Phàm gia", () => {
    for (const origin of ["linh_tu", "khong_co", "__proto__"]) {
      const r = safeRebirthChoice(rich, limbo, { origin, keep: [] });
      expect(r.choice.origin).toBe(DEFAULT_ORIGIN);
      expect(r.dropped.length).toBe(1);
    }
    expect(safeRebirthChoice(rich, limbo, { origin: "kiem_khach", keep: [] }).choice.origin).toBe(
      "kiem_khach",
    );
  });

  it("chiêu khắc trùng / không có trong danh sách khắc được / không có trong game: bỏ", () => {
    const r = safeRebirthChoice(
      { ...rich, unlocks: { khac: 3 } },
      { keepable: [], engravable: ["ung_trao", "chieu_khong_co"] },
      {
        origin: DEFAULT_ORIGIN,
        keep: [],
        engrave: ["ung_trao", "ung_trao", "hoa_van_kiem", "chieu_khong_co"],
      },
    );
    expect(r.choice.engrave).toEqual(["ung_trao"]);
  });

  it("dữ liệu hỏng (không có chân linh / danh sách): lùi về mặc định, không ném lỗi", () => {
    const r = safeRebirthChoice(null, null, {
      origin: "kiem_khach",
      keep: ["a"],
      engrave: ["b"],
    });
    expect(r.choice.origin).toBe(DEFAULT_ORIGIN);
    expect(r.choice.keep).toEqual([]);
    expect(r.choice.engrave).toEqual([]);
  });

  it("mọi tổ hợp lộn xộn đều qua validateRebirth của máy chủ (thuộc tính)", () => {
    const origins = [DEFAULT_ORIGIN, "kiem_khach", "linh_tu", "x"];
    const ids = ["lang_nha_kiem", "tho_nhung_bao", "ung_trao", "hoa_van_kiem", "x", ""];
    const souls = [fresh, rich, { ...rich, unlocks: { ky_vat: 6, khac: 6 } }];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pickSome = () =>
      Array.from({ length: Math.floor(rnd() * 6) }, () => ids[Math.floor(rnd() * ids.length)]!);
    for (let i = 0; i < 400; i++) {
      const soul = souls[Math.floor(rnd() * souls.length)]!;
      const wish = {
        origin: origins[Math.floor(rnd() * origins.length)]!,
        keep: pickSome(),
        engrave: rnd() < 0.5 ? undefined : pickSome(),
      };
      const { choice } = safeRebirthChoice(soul, limbo, wish);
      expect(
        validateRebirth(soul, choice, limbo.keepable, limbo.engravable),
        JSON.stringify({ soul: soul.unlocks, wish }),
      ).not.toBeNull();
    }
  });
});

describe("isRebirthRefusal: toast nào là lời từ chối đầu thai", () => {
  it("các lời từ chối của máy chủ (WorldRoom.rebirth)", () => {
    expect(isRebirthRefusal({ text: "Lựa chọn đầu thai không hợp lệ.", tone: "bad" })).toBe(true);
    expect(isRebirthRefusal({ text: "Chưa khắc được chân linh, thử lại sau.", tone: "bad" })).toBe(
      true,
    );
    expect(isRebirthRefusal({ text: "Linh hồn chưa kịp ghi sổ, chờ một lát.", tone: "info" })).toBe(
      true,
    );
  });

  it("toast không liên quan lúc chờ: KHÔNG tính (thành tựu, thông báo quái, chữ lạ)", () => {
    expect(isRebirthRefusal({ text: "Đạt thành tựu: Nhập Thế Lạc Hà", tone: "good" })).toBe(false);
    expect(isRebirthRefusal({ text: "★ Hôi Lang tinh anh: nên đi đội.", tone: "info" })).toBe(
      false,
    );
    expect(isRebirthRefusal({ text: "Đã khắc xong chân linh!", tone: "good" })).toBe(false);
    expect(isRebirthRefusal({ text: "Đã bỏ phần khắc vượt số ô.", tone: "info" })).toBe(false);
    expect(isRebirthRefusal({ text: "", tone: "bad" })).toBe(false);
    expect(isRebirthRefusal({ text: 5, tone: "bad" })).toBe(false);
    expect(isRebirthRefusal({})).toBe(false);
  });
});
