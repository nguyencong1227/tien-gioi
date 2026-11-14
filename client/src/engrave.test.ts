import { describe, expect, it } from "vitest";
import { ENGRAVE_MAX, SKILLS_M7 } from "@tien-gioi/shared";
import {
  clampEngrave,
  effectiveEngrave,
  engraveEmptyText,
  engraveHint,
  engraveItem,
  engraveToSend,
  toggleEngrave,
} from "./engrave";

const ALL = ["hoa_van_kiem", "ung_trao", "me_tung_bo"];

describe("clampEngrave: lọc theo danh sách khắc được và cắt theo nấc", () => {
  it("giữ thứ tự, bỏ trùng, bỏ chiêu ngoài danh sách, cắt cap", () => {
    expect(clampEngrave(["ung_trao", "ung_trao", "xyz", "hoa_van_kiem"], ALL, 2)).toEqual([
      "ung_trao",
      "hoa_van_kiem",
    ]);
    expect(clampEngrave(["ung_trao", "hoa_van_kiem", "me_tung_bo"], ALL, 2)).toEqual([
      "ung_trao",
      "hoa_van_kiem",
    ]);
  });
  it("rác: không phải mảng, id sai kiểu / độc, cap <= 0 hoặc không hữu hạn -> rỗng hoặc bỏ phần rác", () => {
    expect(clampEngrave(undefined, ALL, 3)).toEqual([]);
    expect(clampEngrave(["ung_trao"], undefined, 3)).toEqual([]);
    expect(clampEngrave(["ung_trao"], ALL, 0)).toEqual([]);
    expect(clampEngrave(["ung_trao"], ALL, -1)).toEqual([]);
    expect(clampEngrave(["ung_trao"], ALL, Number.NaN)).toEqual([]);
    expect(clampEngrave([5, null, "constructor", "ung_trao"], ALL, 3)).toEqual(["ung_trao"]);
  });
});

describe("effectiveEngrave: chưa đụng thì hiện chiêu đã khắc", () => {
  it("chưa đụng (null) -> chiêu đã khắc còn trong danh sách; đã đụng -> lựa chọn", () => {
    expect(effectiveEngrave(["ung_trao"], null, ALL, 2)).toEqual(["ung_trao"]);
    expect(effectiveEngrave(["ung_trao"], [], ALL, 2)).toEqual([]);
    expect(effectiveEngrave(["ung_trao"], ["me_tung_bo"], ALL, 2)).toEqual(["me_tung_bo"]);
  });
  it("nấc đổi (mua thêm): lựa chọn cũ vẫn giữ, nấc thấp hơn cắt bớt", () => {
    expect(effectiveEngrave([], ["ung_trao", "me_tung_bo"], ALL, 3)).toEqual([
      "ung_trao",
      "me_tung_bo",
    ]);
    expect(effectiveEngrave([], ["ung_trao", "me_tung_bo"], ALL, 1)).toEqual(["ung_trao"]);
  });
  it("chiêu đã khắc nhưng không còn trong danh sách khắc được thì không hiện", () => {
    expect(effectiveEngrave(["ung_trao", "huyen_bang_chi"], null, ALL, 3)).toEqual(["ung_trao"]);
  });
});

describe("toggleEngrave: chọn / bỏ, không vượt nấc", () => {
  it("thêm khi còn chỗ, bỏ khi đang chọn, trả mảng MỚI", () => {
    const a: string[] = ["ung_trao"];
    const b = toggleEngrave(a, "hoa_van_kiem", ALL, 2);
    expect(b).toEqual(["ung_trao", "hoa_van_kiem"]);
    expect(a).toEqual(["ung_trao"]); // không sửa mảng cũ
    expect(toggleEngrave(b, "ung_trao", ALL, 2)).toEqual(["hoa_van_kiem"]);
  });
  it("hết chỗ thì không thêm nhưng vẫn bỏ được; chiêu ngoài danh sách không thêm được", () => {
    expect(toggleEngrave(["ung_trao"], "hoa_van_kiem", ALL, 1)).toEqual(["ung_trao"]);
    expect(toggleEngrave(["ung_trao"], "ung_trao", ALL, 1)).toEqual([]);
    expect(toggleEngrave([], "huyen_bang_chi", ALL, 3)).toEqual([]);
    expect(toggleEngrave([], "ung_trao", ALL, 0)).toEqual([]);
    expect(toggleEngrave([], "ung_trao", undefined, 3)).toEqual([]);
  });
});

describe("engraveToSend: chỉ gửi khi người chơi đã ĐỔI tập chiêu khắc", () => {
  it("chưa đụng -> vắng (giữ nguyên)", () => {
    expect(engraveToSend(["ung_trao"], null)).toBeUndefined();
    expect(engraveToSend(undefined, null)).toBeUndefined();
  });
  it("đụng nhưng trùng đúng tập đã khắc (kể cả khác thứ tự) -> vắng", () => {
    expect(engraveToSend(["ung_trao", "me_tung_bo"], ["me_tung_bo", "ung_trao"])).toBeUndefined();
    expect(engraveToSend(undefined, [])).toBeUndefined();
  });
  it("khác tập -> gửi mảng (kể cả [] = xoá hết)", () => {
    expect(engraveToSend(["ung_trao"], ["me_tung_bo"])).toEqual(["me_tung_bo"]);
    expect(engraveToSend(["ung_trao"], [])).toEqual([]);
    expect(engraveToSend([], ["ung_trao"])).toEqual(["ung_trao"]);
    expect(engraveToSend(["ung_trao"], ["ung_trao", "me_tung_bo"])).toEqual([
      "ung_trao",
      "me_tung_bo",
    ]);
  });
  it("mảng gửi là bản sao (người gọi sửa tiếp không ảnh hưởng)", () => {
    const sel = ["ung_trao"];
    const out = engraveToSend([], sel)!;
    sel.push("me_tung_bo");
    expect(out).toEqual(["ung_trao"]);
  });
});

describe("chữ hiển thị", () => {
  it("gợi ý, câu rỗng theo từng ca", () => {
    expect(engraveHint(2, 1)).toBe("Tối đa 2 chiêu (đã chọn 1/2)");
    expect(engraveEmptyText(0, 5)).toBe('Chưa mở "Khắc chân linh" ở Tam Sinh Thạch.');
    expect(engraveEmptyText(1, 0)).toBe("Kiếp này chưa học công pháp nào để khắc.");
    expect(engraveEmptyText(1, 2)).toBeNull();
    expect(engraveEmptyText(0, 0)).toBe('Chưa mở "Khắc chân linh" ở Tam Sinh Thạch.'); // chưa mở thắng "chưa học"
  });
  it("mục khắc: tên + hệ của chiêu thật; id lạ / độc không ném lỗi", () => {
    const it0 = engraveItem("hoa_van_kiem");
    expect(it0.def?.id).toBe("hoa_van_kiem");
    expect(it0.name).toBe("Hỏa Vân Kiếm");
    expect(it0.element).toBe("Hỏa");
    for (const bad of ["constructor", "__proto__", "khong_co"]) {
      const x = engraveItem(bad);
      expect(x.def).toBeUndefined();
      expect(x.name).toBe(bad);
      expect(x.element).toBe("");
    }
    for (const d of SKILLS_M7) expect(engraveItem(d.id).name).toBe(d.name);
  });
  it("trần nấc của hợp đồng: không quá ENGRAVE_MAX", () => {
    expect(ENGRAVE_MAX).toBe(3);
    const ids = SKILLS_M7.map((d) => d.id);
    expect(clampEngrave(ids, ids, 99).length).toBe(ids.length); // clamp chỉ theo cap người gọi đưa vào
    expect(clampEngrave(ids, ids, ENGRAVE_MAX).length).toBe(ENGRAVE_MAX);
  });
});
