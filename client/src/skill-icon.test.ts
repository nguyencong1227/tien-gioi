import { describe, expect, it } from "vitest";
import { ELEMENTS, SKILLS_M7, type SkillShape } from "@tien-gioi/shared";
import { ELEMENT_COLOR } from "./skill-bar";
import { lockIconSvg, skillIconSvg } from "./skill-icon";

const SHAPES: SkillShape[] = ["cone", "line", "fan", "nova", "ground", "dash", "self"];

describe("skillIconSvg (biểu tượng vẽ bằng mã)", () => {
  it("mỗi hình cho một <svg> khác nhau, đóng đủ thẻ, không chữ", () => {
    const seen = new Set<string>();
    for (const shape of SHAPES) {
      const s = skillIconSvg({ shape, element: "hoa" });
      expect(s.startsWith("<svg ")).toBe(true);
      expect(s.endsWith("</svg>")).toBe(true);
      expect(s).not.toMatch(/<text|<script|on\w+=|javascript:/i);
      expect(s).toContain('aria-hidden="true"');
      seen.add(s);
    }
    expect(seen.size).toBe(SHAPES.length);
  });

  it("màu theo hệ: hệ khác nhau -> màu khác; hệ lạ / độc rơi về xám, không chèn chuỗi vào mã", () => {
    const hoa = skillIconSvg({ shape: "cone", element: "hoa" });
    const thuy = skillIconSvg({ shape: "cone", element: "thuy" });
    expect(hoa).toContain(ELEMENT_COLOR.hoa);
    expect(thuy).toContain(ELEMENT_COLOR.thuy);
    expect(hoa).not.toBe(thuy);
    const evil = skillIconSvg({ shape: "cone", element: '"><script>x</script>' });
    expect(evil).toContain(ELEMENT_COLOR.none);
    expect(evil).not.toContain("script");
  });

  it("hình lạ / độc ('constructor', '__proto__') rơi về nova, không ném lỗi", () => {
    const nova = skillIconSvg({ shape: "nova", element: "kim" });
    for (const shape of ["constructor", "__proto__", "toString", 5, undefined, null]) {
      expect(skillIconSvg({ shape, element: "kim" })).toBe(nova);
    }
  });

  it("mọi chiêu thật và mọi hệ đều vẽ được; ổ khoá có thẻ đóng", () => {
    for (const d of SKILLS_M7) expect(skillIconSvg(d).length).toBeGreaterThan(50);
    for (const e of ELEMENTS)
      expect(skillIconSvg({ shape: "line", element: e.id })).toContain("<svg");
    expect(lockIconSvg()).toMatch(/^<svg .*<\/svg>$/);
  });
});
