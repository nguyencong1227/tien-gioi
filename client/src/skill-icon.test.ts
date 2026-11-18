import { describe, expect, it } from "vitest";
import { ELEMENTS, SKILLS_M7, SKILL_STYLES, type SkillStyle } from "@tien-gioi/shared";
import { ELEMENT_COLOR } from "./skill-bar";
import { GRADE_GOLD, STYLE_PATH, lockIconSvg, skillIconSvg } from "./skill-icon";

const icon = (style: SkillStyle | unknown, grade: unknown = 0, element: unknown = "hoa") =>
  skillIconSvg({ shape: "nova", style, grade, element });

describe("skillIconSvg (biểu tượng vẽ bằng mã, theo phong cách x hệ x phẩm)", () => {
  it("mỗi phong cách có đúng một hình, và 12 hình khác nhau", () => {
    expect(Object.keys(STYLE_PATH).sort()).toEqual([...SKILL_STYLES].sort());
    expect(new Set(Object.values(STYLE_PATH)).size).toBe(SKILL_STYLES.length);
  });

  it("mỗi phong cách cho một <svg> khác nhau, đóng đủ thẻ, không chữ, ẩn với trình đọc màn hình", () => {
    const seen = new Set<string>();
    for (const style of SKILL_STYLES) {
      const s = icon(style);
      expect(s.startsWith("<svg ")).toBe(true);
      expect(s.endsWith("</svg>")).toBe(true);
      expect(s).not.toMatch(/<text|<script|on\w+=|javascript:/i);
      expect(s).toContain('aria-hidden="true"');
      seen.add(s);
    }
    expect(seen.size).toBe(SKILL_STYLES.length);
  });

  it("thiếu `style` thì suy theo `shape` (cùng hàm của shared), hai hình cùng phong cách mặc định cho cùng biểu tượng", () => {
    expect(skillIconSvg({ shape: "self", element: "kim" })).toBe(icon("ho_the", 0, "kim"));
    expect(skillIconSvg({ shape: "dash", element: "kim" })).toBe(icon("than_phap", 0, "kim"));
    // `style` ghi rõ thắng `shape`
    expect(skillIconSvg({ shape: "self", style: "kiem", element: "kim" })).toBe(
      icon("kiem", 0, "kim"),
    );
  });

  it("màu theo hệ: hệ khác nhau -> màu khác; hệ lạ / độc rơi về xám, không chèn chuỗi vào mã", () => {
    const hoa = icon("kiem", 0, "hoa");
    const thuy = icon("kiem", 0, "thuy");
    expect(hoa).toContain(ELEMENT_COLOR.hoa);
    expect(thuy).toContain(ELEMENT_COLOR.thuy);
    expect(hoa).not.toBe(thuy);
    const evil = icon("kiem", 0, '"><script>x</script>');
    expect(evil).toContain(ELEMENT_COLOR.none);
    expect(evil).not.toContain("script");
  });

  it("phong cách / hình lạ hoặc độc ('constructor', '__proto__') rơi về `khac`, không ném lỗi", () => {
    const khac = icon("khac");
    for (const style of ["constructor", "__proto__", "toString", 5, null, "<b>"]) {
      expect(skillIconSvg({ shape: "constructor", style, element: "hoa" })).toBe(khac);
    }
    expect(skillIconSvg({ shape: undefined, element: "hoa" })).toBe(khac);
  });

  describe("khung theo phẩm: bốn bậc khác nhau về CẤU TRÚC, không chỉ màu", () => {
    const frames = [0, 1, 2, 3].map((g) => icon("kiem", g));
    const rects = (s: string) => (s.match(/<rect /g) ?? []).length;

    it("bốn khung khác nhau", () => {
      expect(new Set(frames).size).toBe(4);
    });
    it("Hoàng một nét mảnh, Huyền một nét đậm, Địa hai nét, Thiên hai nét + bốn chấm vàng", () => {
      expect(rects(frames[0])).toBe(1);
      expect(rects(frames[1])).toBe(1);
      expect(rects(frames[2])).toBe(2);
      expect(rects(frames[3])).toBe(2);
      expect(frames[0]).toContain('stroke-width="1"');
      expect(frames[1]).toContain('stroke-width="2.4"');
      expect(frames[2]).not.toContain('stroke-width="2.4"');
    });
    it("chấm vàng CHỈ ở phẩm Thiên, đúng bốn chấm", () => {
      for (const g of [0, 1, 2]) expect(frames[g]).not.toContain(GRADE_GOLD);
      expect(frames[3].split(GRADE_GOLD).length - 1).toBe(1); // một nhóm <g fill=vàng>
      expect((frames[3].match(/<circle /g) ?? []).length).toBe(4);
    });
    it("chấm vàng KHÔNG bị mờ theo `fill-opacity` 0,35 của thẻ ngoài (nhìn ảnh thấy chấm nâu đục)", () => {
      expect(frames[3]).toMatch(/<g fill="#ffe08a" fill-opacity="1" stroke="none">/);
    });
    it("thiếu `grade` thì suy theo `rarity` (hiếm 0-1 Hoàng, 2 Huyền, 3 Địa, 4 Thiên)", () => {
      const byRarity = (rarity: number) => skillIconSvg({ shape: "nova", element: "hoa", rarity });
      const same = (g: number) =>
        skillIconSvg({ shape: "nova", element: "hoa", grade: g, rarity: 0 });
      expect(byRarity(1)).toBe(same(0));
      expect(byRarity(2)).toBe(same(1));
      expect(byRarity(3)).toBe(same(2));
      expect(byRarity(4)).toBe(same(3));
    });
    it("`grade` ghi rõ thắng `rarity`; grade sai / rarity hỏng rơi về Hoàng, không ném lỗi", () => {
      const base = skillIconSvg({ shape: "nova", element: "hoa", grade: 0, rarity: 0 });
      expect(skillIconSvg({ shape: "nova", element: "hoa", grade: 0, rarity: 4 })).toBe(base);
      for (const grade of [-1, 4, 1.5, NaN, "2", null, {}])
        expect(skillIconSvg({ shape: "nova", element: "hoa", grade, rarity: 0 })).toBe(base);
      for (const rarity of [NaN, Infinity, "x", undefined])
        expect(skillIconSvg({ shape: "nova", element: "hoa", rarity })).toBe(base);
    });
  });

  it("mọi chiêu thật, mọi hệ, mọi phẩm đều vẽ được; ổ khoá có thẻ đóng", () => {
    for (const d of SKILLS_M7) expect(skillIconSvg(d).length).toBeGreaterThan(50);
    for (const e of ELEMENTS)
      expect(skillIconSvg({ shape: "line", element: e.id })).toContain("<svg");
    for (const style of SKILL_STYLES)
      for (const g of [0, 1, 2, 3]) expect(icon(style, g)).toMatch(/^<svg .*<\/svg>$/);
    expect(lockIconSvg()).toMatch(/^<svg .*<\/svg>$/);
  });

  it("chuỗi trả về là hằng cố định ghép MỘT màu từ bảng: không có dấu nháy hay ngoặc nhọn nào ngoài thẻ, mọi thẻ đều đóng", () => {
    for (const style of SKILL_STYLES)
      for (const g of [0, 3]) {
        const s = icon(style, g);
        const open = (s.match(/<(svg|g)\b/g) ?? []).length;
        const close = (s.match(/<\/(svg|g)>/g) ?? []).length;
        expect(open).toBe(close);
        // mọi giá trị fill / stroke là một mã màu, `none` hoặc `currentColor`
        for (const m of s.matchAll(/\b(?:fill|stroke)="([^"]*)"/g))
          expect(m[1]).toMatch(/^(#[0-9a-f]{6}|none)$/i);
      }
  });
});
