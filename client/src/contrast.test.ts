import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ELEMENTS } from "@tien-gioi/shared";
import { ELEMENT_COLOR } from "./skill-bar";
import {
  compositeOver,
  contrast,
  luminance,
  parseHex,
  readableOn,
  toHex,
  type Rgb,
} from "./contrast";
import { ENGRAVE_CHECKED_BG } from "./engrave";

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

describe("contrast: công thức WCAG", () => {
  it("đen / trắng = 21:1, cùng màu = 1:1, đối xứng", () => {
    expect(contrast(BLACK, WHITE)).toBeCloseTo(21, 6);
    expect(contrast(WHITE, WHITE)).toBeCloseTo(1, 9);
    expect(contrast([12, 80, 200], WHITE)).toBeCloseTo(contrast(WHITE, [12, 80, 200]), 12);
  });
  it("giá trị tham chiếu: #777777 trên trắng ~ 4,48:1; #767676 ~ 4,54:1 (ngưỡng AA kinh điển)", () => {
    expect(contrast(parseHex("#777777"), WHITE)).toBeCloseTo(4.48, 2);
    expect(contrast(parseHex("#767676"), WHITE)).toBeCloseTo(4.54, 2);
  });
  it("độ sáng: đen 0, trắng 1, đơn điệu theo kênh", () => {
    expect(luminance(BLACK)).toBe(0);
    expect(luminance(WHITE)).toBeCloseTo(1, 9);
    expect(luminance([200, 0, 0])).toBeGreaterThan(luminance([100, 0, 0]));
  });
  it("đầu vào hỏng không ném lỗi: hex sai -> đen, số không hữu hạn -> 0", () => {
    expect(parseHex("xyz")).toEqual([0, 0, 0]);
    expect(parseHex("#12345")).toEqual([0, 0, 0]);
    expect(parseHex(undefined as unknown as string)).toEqual([0, 0, 0]);
    expect(parseHex("A0B1C2")).toEqual([160, 177, 194]);
    expect(luminance([Number.NaN, Infinity, -5])).toBe(0);
    expect(toHex([300, -1, 15.6])).toBe("#ff0010");
  });
  it("compositeOver: alpha 0 = nền, alpha 1 = màu, nửa nửa = trung bình", () => {
    expect(compositeOver([255, 0, 0, 0], [0, 0, 255])).toEqual([0, 0, 255]);
    expect(compositeOver([255, 0, 0, 1], [0, 0, 255])).toEqual([255, 0, 0]);
    expect(compositeOver([200, 100, 0, 0.5], [0, 100, 200])).toEqual([100, 100, 100]);
    expect(compositeOver([255, 0, 0, Number.NaN], [0, 0, 255])).toEqual([255, 0, 0]); // alpha hỏng = đặc
  });
});

describe("readableOn: sáng dần về phía trắng tới khi đủ tương phản", () => {
  it("đã đạt thì giữ nguyên; chưa đạt thì sáng hơn và ĐẠT; không bao giờ tối hơn", () => {
    const bg = ENGRAVE_CHECKED_BG;
    expect(readableOn("#ffffff", bg)).toBe("#ffffff");
    const dim = "#8a6fb0"; // hệ Âm
    expect(contrast(parseHex(dim), bg)).toBeLessThan(4.5);
    const out = readableOn(dim, bg);
    expect(contrast(parseHex(out), bg)).toBeGreaterThanOrEqual(4.5);
    expect(luminance(parseHex(out))).toBeGreaterThan(luminance(parseHex(dim)));
  });
  it("nền sáng đến mức không thể đạt: trả trắng; ngưỡng tuỳ chỉnh được tôn trọng", () => {
    // chữ sáng trên nền sáng: làm sáng thêm chỉ tệ hơn, không đạt được 4,5 -> trả trắng (cố gắng tối đa)
    expect(readableOn("#dddddd", [250, 250, 250], 4.5)).toBe("#ffffff");
    const c3 = readableOn("#8a6fb0", ENGRAVE_CHECKED_BG, 3);
    expect(contrast(parseHex(c3), ENGRAVE_CHECKED_BG)).toBeGreaterThanOrEqual(3);
    expect(luminance(parseHex(c3))).toBeLessThanOrEqual(
      luminance(parseHex(readableOn("#8a6fb0", ENGRAVE_CHECKED_BG, 4.5))),
    );
  });
});

describe("chữ màu hệ ở mục khắc chân linh đã chọn", () => {
  it("MỌI hệ (bảng màu thật), sau `readableOn`, đạt >= 4,5:1 trên nền mục đã chọn; trước khi sửa có hệ dưới 4,5", () => {
    let below = 0;
    for (const e of ELEMENTS) {
      const raw = ELEMENT_COLOR[e.id];
      if (contrast(parseHex(raw), ENGRAVE_CHECKED_BG) < 4.5) below++;
      const fixed = readableOn(raw, ENGRAVE_CHECKED_BG);
      expect(contrast(parseHex(fixed), ENGRAVE_CHECKED_BG), e.id).toBeGreaterThanOrEqual(4.5);
    }
    // A đo (#550): Âm 3,0 / Hỏa 3,5 / Thủy 3,8 / Thổ 4,0 dưới 4,5: ít nhất 4 hệ thật sự cần chỉnh
    expect(below).toBeGreaterThanOrEqual(4);
  });
  it("hệ đã đủ sáng (Kim, Băng, Phong...) giữ nguyên màu (không đổi sắc thừa)", () => {
    for (const id of ["kim", "bang", "phong"] as const) {
      const raw = ELEMENT_COLOR[id];
      if (contrast(parseHex(raw), ENGRAVE_CHECKED_BG) >= 4.5)
        expect(readableOn(raw, ENGRAVE_CHECKED_BG)).toBe(raw.toLowerCase());
    }
  });
  it("hằng nền KHỚP style.css: .relic-item, .relic-item.checked, .limbo-box (đổi CSS thì phải đổi `ENGRAVE_CHECKED_BG`)", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "style.css"), "utf-8");
    const block = (sel: string): string => {
      const i = css.indexOf(`\n${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf("}", i));
    };
    expect(block(".relic-item.checked")).toContain("background: rgba(56, 189, 248, 0.2)");
    expect(block(".limbo-box")).toContain("background: rgba(28, 24, 38, 0.92)");
  });
});
