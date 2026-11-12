import { describe, expect, it } from "vitest";
import { TILE } from "@tien-gioi/shared";
import { DECOR_FRAMES, DECOR_KINDS, DECOR_VARIANTS, MAP_STYLES, styleOf } from "./map-style";
import { decorFrameRects, decorTilesetKey, shade } from "./decor-tileset";

const STYLE_IDS = Object.keys(MAP_STYLES);

/** Rasterize thô: số ô 1x1 được phủ (gộp các hình chữ nhật chồng nhau). */
function covered(rects: ReturnType<typeof decorFrameRects>): Set<number> {
  const s = new Set<number>();
  for (const r of rects)
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) s.add(y * TILE + x);
  return s;
}

describe("decor-tileset (khung trang trí vẽ bằng mã)", () => {
  it("mọi khung của mọi kiểu: có hình, nằm TRONG khung 32x32, số nguyên, màu hợp lệ", () => {
    for (const id of STYLE_IDS)
      for (let f = 0; f < DECOR_FRAMES; f++) {
        const rects = decorFrameRects(styleOf(id), f);
        expect(rects.length, `${id}#${f}`).toBeGreaterThan(0);
        for (const r of rects) {
          for (const v of [r.x, r.y, r.w, r.h])
            expect(Number.isInteger(v), `${id}#${f}`).toBe(true);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, `${id}#${f} tràn phải`).toBeLessThanOrEqual(TILE);
          expect(r.y + r.h, `${id}#${f} tràn đáy`).toBeLessThanOrEqual(TILE);
          expect(r.w).toBeGreaterThan(0);
          expect(r.h).toBeGreaterThan(0);
          expect(r.color).toBeGreaterThanOrEqual(0);
          expect(r.color).toBeLessThanOrEqual(0xffffff);
          expect(r.a === undefined || (r.a > 0 && r.a <= 1)).toBe(true);
        }
      }
  });

  it("khung không rỗng ruột và không phủ kín ô (trang trí thưa trên nền): 5-60 % diện tích", () => {
    for (let f = 0; f < DECOR_FRAMES; f++) {
      const cov = covered(decorFrameRects(styleOf("lac_ha"), f)).size / (TILE * TILE);
      expect(cov, `khung ${f}`).toBeGreaterThan(0.05);
      expect(cov, `khung ${f}`).toBeLessThan(0.6);
    }
  });

  it("hai biến thể của cùng một loại KHÁC nhau; các loại khác nhau", () => {
    const sig = (f: number) => JSON.stringify(decorFrameRects(styleOf("lac_ha"), f));
    const seen = new Set<string>();
    for (let f = 0; f < DECOR_FRAMES; f++) seen.add(sig(f));
    expect(seen.size).toBe(DECOR_FRAMES);
    for (let k = 0; k < DECOR_KINDS.length; k++)
      expect(sig(k * DECOR_VARIANTS)).not.toBe(sig(k * DECOR_VARIANTS + 1));
  });

  it("bảng màu của kiểu ĐƯỢC DÙNG: đổi màu chính thì khung đổi (mỗi loại, mỗi biến thể)", () => {
    const base = styleOf("lac_ha");
    for (let k = 0; k < DECOR_KINDS.length; k++)
      for (let v = 0; v < DECOR_VARIANTS; v++) {
        const kind = DECOR_KINDS[k];
        const pal = [...base.decor.palette[kind]] as [number, number];
        pal[v] = 0x123456;
        const changed = {
          ...base,
          decor: { ...base.decor, palette: { ...base.decor.palette, [kind]: pal } },
        };
        const f = k * DECOR_VARIANTS + v;
        expect(JSON.stringify(decorFrameRects(changed, f)), `${kind}#${v}`).not.toBe(
          JSON.stringify(decorFrameRects(base, f)),
        );
        // Khung của biến thể kia không đổi (không rò màu sang biến thể khác)
        const other = k * DECOR_VARIANTS + (1 - v);
        expect(JSON.stringify(decorFrameRects(changed, other))).toBe(
          JSON.stringify(decorFrameRects(base, other)),
        );
      }
  });

  it("tất định; khung ngoài khoảng / không nguyên trả mảng rỗng", () => {
    const s = styleOf("hac_phong");
    expect(JSON.stringify(decorFrameRects(s, 3))).toBe(JSON.stringify(decorFrameRects(s, 3)));
    for (const f of [-1, DECOR_FRAMES, 1.5, Number.NaN, Infinity])
      expect(decorFrameRects(s, f)).toEqual([]);
  });

  it("decorTilesetKey: kiểu riêng theo id, id lạ dùng chung 'default' (không tạo texture mỗi id lạ)", () => {
    expect(decorTilesetKey("lac_ha")).toBe("decor-lac_ha");
    expect(decorTilesetKey("khong_co")).toBe("decor-default");
    expect(decorTilesetKey("constructor")).toBe("decor-default");
  });

  it("shade: sáng / tối đúng chiều, giữ trong 0..0xffffff, f = 0 giữ nguyên", () => {
    expect(shade(0x808080, 0)).toBe(0x808080);
    expect(shade(0x808080, 0.5) & 255).toBeGreaterThan(0x80);
    expect(shade(0x808080, -0.5) & 255).toBeLessThan(0x80);
    expect(shade(0xffffff, 1)).toBe(0xffffff);
    expect(shade(0x000000, -1)).toBe(0);
    expect(shade(0x336699, 0.3)).toBeLessThanOrEqual(0xffffff);
  });
});
