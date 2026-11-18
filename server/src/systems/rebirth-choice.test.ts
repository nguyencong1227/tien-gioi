// Lựa chọn đầu thai KHOAN DUNG (QUYET_DINH_M3 mục 58): tin sai chỉ bị bỏ phần sai, không bao giờ từ chối cả yêu cầu.
import { describe, expect, it } from "vitest";
import { validateRebirth } from "@tien-gioi/shared";
import { lenientRebirth } from "./rebirth-choice";

// Chân linh MỚI TINH như `hanh` / `hanh1` ở bản thật: 0 ô giữ, 0 ô khắc, chưa mở xuất thân nào
const TRANG = { unlocks: {}, origins: [] as string[] };
// Chân linh đã mở: 2 ô giữ (`ky_vat` nấc 2), 2 ô khắc (`khac` nấc 2), xuất thân Thể tu
const DA_MO = { unlocks: { ky_vat: 2, khac: 2 }, origins: ["the_tu"] };

const KEEPABLE = ["hac_ho_kiem", "hac_ho_kiem", "lang_nha_kiem"];
const ENGRAVABLE = ["hoa_van_kiem", "me_tung_bo", "ung_trao"];

describe("lenientRebirth: chân linh mới tinh không bao giờ kẹt", () => {
  it("tin đúng như client gửi cho kiếp đầu (không giữ, không khắc) đầu thai y hệt validateRebirth, không ghi chú", () => {
    const msg = { origin: "pham_gia", keep: [] };
    const r = lenientRebirth(TRANG, msg, [], []);
    expect(r.choice).toEqual({ origin: "pham_gia", keep: [] });
    expect(r.notes).toEqual([]);
    expect(validateRebirth(TRANG, msg, [], [])).toEqual(r.choice);
  });

  it("MỌI kiểu tin rác với chân linh trắng vẫn ra một lựa chọn hợp lệ (xuất thân mặc định, không giữ, không khắc)", () => {
    for (const bad of [
      undefined,
      null,
      5,
      "rác",
      [],
      [1, 2],
      true,
      {},
      { keep: "x" },
      { keep: null },
    ]) {
      const r = lenientRebirth(TRANG, bad, [], []);
      expect(r.choice.origin).toBe("pham_gia");
      expect(r.choice.keep).toEqual([]);
      expect(r.choice.engrave).toBeUndefined();
    }
  });

  it("client chọn sẵn quá số ô (0 ô): bỏ hết phần giữ / khắc, ghi chú rõ, vẫn đầu thai", () => {
    const r = lenientRebirth(
      TRANG,
      { origin: "pham_gia", keep: ["hac_ho_kiem"], engrave: ["hoa_van_kiem"] },
      KEEPABLE,
      ENGRAVABLE,
    );
    expect(r.choice).toEqual({ origin: "pham_gia", keep: [], engrave: [] });
    expect(r.notes.join(" | ")).toMatch(/chưa mở ô Ký vật/);
    // validateRebirth cũ TỪ CHỐI đúng tin này (đây là chỗ khiến người chơi kẹt)
    expect(validateRebirth(TRANG, { keep: ["hac_ho_kiem"] }, KEEPABLE, ENGRAVABLE)).toBeNull();
  });

  it("xuất thân chưa mở hoặc lạ: về Phàm gia, có ghi chú; xuất thân đã mở được giữ", () => {
    expect(lenientRebirth(TRANG, { origin: "the_tu", keep: [] }, [], []).choice.origin).toBe(
      "pham_gia",
    );
    expect(lenientRebirth(TRANG, { origin: "the_tu", keep: [] }, [], []).notes[0]).toMatch(
      /xuất thân/,
    );
    for (const lạ of ["constructor", "__proto__", 5, {}, ["the_tu"]]) {
      expect(lenientRebirth(DA_MO, { origin: lạ, keep: [] }, [], []).choice.origin).toBe(
        "pham_gia",
      );
    }
    const ok = lenientRebirth(DA_MO, { origin: "the_tu", keep: [] }, [], []);
    expect(ok.choice.origin).toBe("the_tu");
    expect(ok.notes).toEqual([]);
  });
});

describe("lenientRebirth: giữ đồ", () => {
  it("chỉ giữ món CÓ THẬT, mỗi món dùng một lần, tối đa số ô; phần thừa bị bỏ", () => {
    const r = lenientRebirth(
      DA_MO,
      { keep: ["hac_ho_kiem", "hac_ho_kiem", "hac_ho_kiem", "khong_co"] },
      KEEPABLE,
      [],
    );
    expect(r.choice.keep).toEqual(["hac_ho_kiem", "hac_ho_kiem"]);
    expect(r.notes[0]).toMatch(/bỏ 2 món/);
  });

  it("món không có trong túi, sai kiểu, id độc ('constructor', '__proto__') đều bị bỏ", () => {
    const r = lenientRebirth(
      DA_MO,
      { keep: ["constructor", "__proto__", 7, null, "lang_nha_kiem"] },
      KEEPABLE,
      [],
    );
    expect(r.choice.keep).toEqual(["lang_nha_kiem"]);
    expect(r.notes[0]).toMatch(/bỏ 4 món/);
  });
});

describe("lenientRebirth: khắc chiêu", () => {
  it("`engrave` vắng = giữ nguyên chiêu đã khắc (không có trường engrave trong kết quả)", () => {
    const r = lenientRebirth(DA_MO, { keep: [] }, [], ENGRAVABLE);
    expect("engrave" in r.choice).toBe(false);
    expect(r.notes).toEqual([]);
  });

  it("danh sách hợp lệ được giữ nguyên thứ tự; trùng id được gộp, không ghi chú", () => {
    const r = lenientRebirth(
      DA_MO,
      { keep: [], engrave: ["me_tung_bo", "hoa_van_kiem", "me_tung_bo"] },
      [],
      ENGRAVABLE,
    );
    expect(r.choice.engrave).toEqual(["me_tung_bo", "hoa_van_kiem"]);
    expect(r.notes).toEqual([]);
  });

  it("nhiều hơn số ô: cắt giữ các chiêu đầu, có ghi chú", () => {
    const r = lenientRebirth(DA_MO, { keep: [], engrave: ENGRAVABLE }, [], ENGRAVABLE);
    expect(r.choice.engrave).toEqual(["hoa_van_kiem", "me_tung_bo"]);
    expect(r.notes[0]).toMatch(/vượt 2 ô/);
  });

  it("có MỘT chiêu sai (không có trong danh sách / lạ / sai kiểu) thì bỏ CẢ phần khắc và giữ nguyên chân linh (không xoá nhầm chiêu đã khắc)", () => {
    for (const bad of [
      ["huyen_bang_chi"],
      ["me_tung_bo", "constructor"],
      [5],
      "me_tung_bo",
      {},
      ["__proto__"],
    ]) {
      const r = lenientRebirth(DA_MO, { keep: [], engrave: bad }, [], ENGRAVABLE);
      expect("engrave" in r.choice, JSON.stringify(bad)).toBe(false);
      expect(r.notes[0]).toMatch(/giữ nguyên chiêu đã khắc/);
    }
  });

  it("`engrave: []` hợp lệ = xoá hết khắc (ý người chơi); chân linh 0 ô khắc mà gửi `[]` cũng không lỗi", () => {
    expect(lenientRebirth(DA_MO, { keep: [], engrave: [] }, [], ENGRAVABLE).choice.engrave).toEqual(
      [],
    );
    const r = lenientRebirth(TRANG, { keep: [], engrave: [] }, [], []);
    expect(r.choice.engrave).toEqual([]);
    expect(r.notes).toEqual([]);
  });

  it("kết quả luôn qua được validateRebirth (khoan dung nhưng KHÔNG nới luật: server vẫn quyết định)", () => {
    const msgs: unknown[] = [
      {
        keep: ["hac_ho_kiem", "hac_ho_kiem", "hac_ho_kiem"],
        engrave: ENGRAVABLE,
        origin: "kiem_khach",
      },
      { keep: ["x"], engrave: ["y"] },
      { origin: "the_tu", keep: ["lang_nha_kiem"], engrave: ["ung_trao", "hoa_van_kiem"] },
      null,
      7,
    ];
    for (const soul of [TRANG, DA_MO]) {
      for (const msg of msgs) {
        const r = lenientRebirth(soul, msg, KEEPABLE, ENGRAVABLE);
        expect(
          validateRebirth(soul, r.choice, KEEPABLE, ENGRAVABLE),
          JSON.stringify(msg),
        ).not.toBeNull();
      }
    }
  });
});
