import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKILL_FILTER,
  SKILL_QUERY_MAX,
  cleanSkillFilter,
  elementCounts,
  filterSkills,
  foldText,
  skillFilterActive,
  skillFilterSummary,
  skillMatches,
  sortSkills,
  type FilterableSkill,
  type SkillFilter,
} from "./skill-filter";

const mk = (o: Partial<FilterableSkill> & { id: string; name: string }): FilterableSkill => ({
  book: "",
  element: "Hỏa",
  elementId: "hoa",
  grade: 0,
  slotNow: null,
  need: null,
  ...o,
});

const ROWS: FilterableSkill[] = [
  mk({
    id: "kiem_khi",
    name: "Kiếm Khí",
    book: "Kinh Kiếm Khí",
    element: "Kim",
    elementId: "kim",
    grade: 0,
    slotNow: 3,
  }),
  mk({ id: "hoa_cau", name: "Hỏa Cầu Thuật", book: "Kinh Hỏa Cầu", grade: 1, slotNow: null }),
  mk({
    id: "bang_phong",
    name: "Băng Phong Chưởng",
    element: "Băng",
    elementId: "bang",
    grade: 2,
    slotNow: 2,
  }),
  mk({
    id: "da_toa",
    name: "Đả Tọa Quyết",
    element: "Thổ",
    elementId: "tho",
    grade: 3,
    need: "Cần đạt Kim Đan",
  }),
  mk({ id: "liet_diem", name: "Liệt Diễm Trảm", grade: 1, slotNow: null }),
];
const f = (o: Partial<SkillFilter>): SkillFilter => ({ ...DEFAULT_SKILL_FILTER, ...o });
const ids = (rows: readonly FilterableSkill[]) => rows.map((r) => r.id);

describe("foldText", () => {
  it("bỏ dấu tiếng Việt, đ -> d, chữ thường, gộp khoảng trắng", () => {
    expect(foldText("Kiếm Khí")).toBe("kiem khi");
    expect(foldText("  Đả   Tọa  ")).toBe("da toa");
    expect(foldText("ĐẠO HIỆU")).toBe("dao hieu");
    expect(foldText("Hỏa Cầu")).toBe("hoa cau");
  });
  it("chuỗi đã ở dạng tổ hợp (NFC) và rã (NFD) cho cùng kết quả", () => {
    expect(foldText("Ế".normalize("NFC"))).toBe(foldText("Ế".normalize("NFD")));
  });
  it("không phải chuỗi -> rỗng", () => {
    for (const bad of [null, undefined, 5, {}, []]) expect(foldText(bad)).toBe("");
  });
});

describe("cleanSkillFilter", () => {
  it("đầu vào lạ về mặc định", () => {
    for (const bad of [null, undefined, 5, "x", []])
      expect(cleanSkillFilter(bad)).toEqual(DEFAULT_SKILL_FILTER);
  });
  it("trường sai kiểu về mặc định, trường đúng giữ", () => {
    expect(cleanSkillFilter({ q: 5, element: 7, grade: "2", slot: "zzz", usable: "yes" })).toEqual(
      DEFAULT_SKILL_FILTER,
    );
    expect(
      cleanSkillFilter({ q: "kiem", element: "hoa", grade: 2, slot: "equipped", usable: true }),
    ).toEqual({
      q: "kiem",
      element: "hoa",
      grade: 2,
      slot: "equipped",
      usable: true,
    });
  });
  it("phẩm ngoài 0-3 / không nguyên / NaN -> null; element rỗng -> all", () => {
    for (const g of [-1, 4, 1.5, NaN, Infinity])
      expect(cleanSkillFilter({ grade: g }).grade).toBeNull();
    expect(cleanSkillFilter({ element: "" }).element).toBe("all");
  });
  it("chuỗi tìm cắt về SKILL_QUERY_MAX", () => {
    expect(cleanSkillFilter({ q: "a".repeat(500) }).q).toHaveLength(SKILL_QUERY_MAX);
  });
});

describe("skillFilterActive", () => {
  it("mặc định không lọc; mỗi trường khác mặc định là đang lọc; chuỗi tìm chỉ khoảng trắng không tính", () => {
    expect(skillFilterActive(DEFAULT_SKILL_FILTER)).toBe(false);
    expect(skillFilterActive(f({ q: "   " }))).toBe(false);
    for (const o of [
      { q: "kiem" },
      { element: "hoa" },
      { grade: 0 },
      { slot: "free" as const },
      { usable: true },
    ])
      expect(skillFilterActive(f(o))).toBe(true);
  });
});

describe("filterSkills", () => {
  it("không lọc: đủ mọi hàng, đúng thứ tự, là bản SAO (không sửa đầu vào)", () => {
    const copy = JSON.stringify(ROWS);
    const out = filterSkills(ROWS, DEFAULT_SKILL_FILTER);
    expect(ids(out)).toEqual(ids(ROWS));
    expect(out).not.toBe(ROWS);
    expect(JSON.stringify(ROWS)).toBe(copy);
  });

  it("tìm theo tên KHÔNG CẦN DẤU và không phân biệt hoa thường", () => {
    expect(ids(filterSkills(ROWS, f({ q: "kiem khi" })))).toEqual(["kiem_khi"]);
    expect(ids(filterSkills(ROWS, f({ q: "KIẾM" })))).toEqual(["kiem_khi"]);
    expect(ids(filterSkills(ROWS, f({ q: "da toa" })))).toEqual(["da_toa"]);
    expect(ids(filterSkills(ROWS, f({ q: "đả tọa" })))).toEqual(["da_toa"]);
  });

  it("nhiều từ: MỖI từ phải có (thứ tự tuỳ ý); từ thừa không khớp thì loại", () => {
    expect(ids(filterSkills(ROWS, f({ q: "cau hoa" })))).toEqual(["hoa_cau"]);
    expect(ids(filterSkills(ROWS, f({ q: "hoa xyz" })))).toEqual([]);
  });

  it("tìm được bằng tên quyển và tên hệ", () => {
    expect(ids(filterSkills(ROWS, f({ q: "kinh hoa" })))).toEqual(["hoa_cau"]);
    expect(ids(filterSkills(ROWS, f({ q: "bang" })))).toEqual(["bang_phong"]);
    expect(ids(filterSkills(ROWS, f({ q: "hoa" })))).toEqual(["hoa_cau", "liet_diem"]);
  });

  it("ký tự đặc biệt của biểu thức chính quy chỉ là chữ thường, không ném lỗi", () => {
    for (const q of ["(", "[a-z]", ".*", "\\", "^$", "a|b", "+"])
      expect(() => filterSkills(ROWS, f({ q }))).not.toThrow();
    expect(ids(filterSkills(ROWS, f({ q: ".*" })))).toEqual([]);
  });

  it("lọc theo hệ / phẩm / ô / dùng được; tổ hợp là VÀ", () => {
    expect(ids(filterSkills(ROWS, f({ element: "kim" })))).toEqual(["kiem_khi"]);
    expect(ids(filterSkills(ROWS, f({ grade: 1 })))).toEqual(["hoa_cau", "liet_diem"]);
    expect(ids(filterSkills(ROWS, f({ slot: "equipped" })))).toEqual(["kiem_khi", "bang_phong"]);
    expect(ids(filterSkills(ROWS, f({ slot: "free" })))).toEqual([
      "hoa_cau",
      "da_toa",
      "liet_diem",
    ]);
    expect(ids(filterSkills(ROWS, f({ usable: true })))).toEqual([
      "kiem_khi",
      "hoa_cau",
      "bang_phong",
      "liet_diem",
    ]);
    expect(
      ids(filterSkills(ROWS, f({ element: "hoa", grade: 1, slot: "free", q: "diem" }))),
    ).toEqual(["liet_diem"]);
    expect(ids(filterSkills(ROWS, f({ element: "hoa", grade: 3 })))).toEqual([]);
  });

  it("danh sách rỗng -> rỗng", () => {
    expect(filterSkills([], f({ q: "a" }))).toEqual([]);
  });
});

describe("skillMatches (biên)", () => {
  it("grade 0 (Hoàng) là phẩm hợp lệ, KHÁC 'không lọc' (null)", () => {
    expect(skillMatches(ROWS[0], f({ grade: 0 }))).toBe(true);
    expect(skillMatches(ROWS[1], f({ grade: 0 }))).toBe(false);
  });
});

describe("sortSkills", () => {
  it("slot: đang gắn trước theo số ô, rồi phẩm cao trước, rồi tên", () => {
    expect(ids(sortSkills(ROWS, "slot"))).toEqual([
      "bang_phong",
      "kiem_khi",
      "da_toa",
      "hoa_cau",
      "liet_diem",
    ]);
  });
  it("grade: phẩm cao trước rồi tên", () => {
    expect(ids(sortSkills(ROWS, "grade"))).toEqual([
      "da_toa",
      "bang_phong",
      "hoa_cau",
      "liet_diem",
      "kiem_khi",
    ]);
  });
  it("name: theo tên không dấu (Đả Tọa xếp theo 'da', không dồn xuống cuối)", () => {
    expect(ids(sortSkills(ROWS, "name"))).toEqual([
      "bang_phong",
      "da_toa",
      "hoa_cau",
      "kiem_khi",
      "liet_diem",
    ]);
  });
  it("tất định: đảo thứ tự đầu vào vẫn ra đúng thứ tự cũ; không sửa đầu vào", () => {
    const rev = [...ROWS].reverse();
    for (const mode of ["slot", "grade", "name"] as const)
      expect(ids(sortSkills(rev, mode))).toEqual(ids(sortSkills(ROWS, mode)));
    const before = ids(ROWS);
    sortSkills(ROWS, "grade");
    expect(ids(ROWS)).toEqual(before);
  });
  it("hoà tên và phẩm thì theo id", () => {
    const a = mk({ id: "b2", name: "Trùng Tên" });
    const b = mk({ id: "a1", name: "Trùng Tên" });
    expect(ids(sortSkills([a, b], "name"))).toEqual(["a1", "b2"]);
  });
});

describe("skillFilterSummary / elementCounts", () => {
  it("câu tóm tắt", () => {
    expect(skillFilterSummary(5, 48, true)).toBe("Hiện 5 / 48 chiêu");
    expect(skillFilterSummary(48, 48, false)).toBe("48 chiêu");
    expect(skillFilterSummary(-3, NaN, true)).toBe("Hiện 0 / 0 chiêu");
  });
  it("đếm theo hệ", () => {
    const m = elementCounts(ROWS);
    expect(m.get("hoa")).toBe(2);
    expect(m.get("kim")).toBe(1);
    expect(m.has("loi")).toBe(false);
  });
});
