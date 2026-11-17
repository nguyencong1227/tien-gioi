import { describe, expect, it } from "vitest";
import { SKILL_BY_ID } from "@tien-gioi/shared";
import {
  GRADE_NAMES,
  STYLE_LABELS,
  gradeName,
  skillGradeOf,
  skillStyleOf,
  styleName,
} from "./skill-meta";

describe("skillGradeOf", () => {
  it("grade hợp lệ được ưu tiên hơn rarity", () => {
    expect(skillGradeOf({ rarity: 4, grade: 0 })).toBe(0);
    expect(skillGradeOf({ rarity: 0, grade: 3 })).toBe(3);
  });
  it("thiếu grade thì suy theo rarity: clamp(rarity - 1, 0, 3)", () => {
    const want = [0, 0, 1, 2, 3];
    ([0, 1, 2, 3, 4] as const).forEach((r) => expect(skillGradeOf({ rarity: r })).toBe(want[r]));
  });
  it("grade sai (ngoài khoảng, không nguyên, sai kiểu) bị bỏ qua, rơi về rarity", () => {
    for (const g of [-1, 4, 1.5, NaN, "2", null, {}])
      expect(skillGradeOf({ rarity: 3, grade: g })).toBe(2);
  });
  it("rarity hỏng -> 0", () => {
    for (const r of [NaN, Infinity, "x", undefined])
      expect(skillGradeOf({ rarity: r as never })).toBe(0);
  });
  it("mọi chiêu dạy được đều ra phẩm 0..3", () => {
    for (const d of Object.values(SKILL_BY_ID)) {
      const g = skillGradeOf(d);
      expect(Number.isInteger(g) && g >= 0 && g <= 3, d.id).toBe(true);
    }
  });
});

describe("skillStyleOf", () => {
  it("style hợp lệ được dùng", () => {
    expect(skillStyleOf({ style: "dao", shape: "cone" })).toBe("dao");
  });
  it("thiếu / lạ thì suy theo shape; shape lạ -> khac", () => {
    expect(skillStyleOf({ shape: "dash" })).toBe("than_phap");
    expect(skillStyleOf({ style: "zzz", shape: "self" })).toBe("ho_the");
    expect(skillStyleOf({ shape: "constructor" })).toBe("khac");
    expect(skillStyleOf({ style: "constructor" })).toBe("khac");
    expect(skillStyleOf({})).toBe("khac");
  });
  it("mọi chiêu dạy được ra một phong cách có tên", () => {
    for (const d of Object.values(SKILL_BY_ID))
      expect(STYLE_LABELS[skillStyleOf(d)], d.id).toBeTruthy();
  });
});

describe("tên hiển thị", () => {
  it("bốn phẩm và mười hai phong cách", () => {
    expect(GRADE_NAMES).toHaveLength(4);
    expect(Object.keys(STYLE_LABELS)).toHaveLength(12);
  });
  it("giá trị lạ về mặc định, không ném lỗi", () => {
    expect(gradeName(2)).toBe("Địa");
    expect(gradeName(9)).toBe("Hoàng");
    expect(styleName("kiem")).toBe("Kiếm");
    expect(styleName("toString")).toBe("Khác");
  });
});
