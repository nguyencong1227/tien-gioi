// Hình đồ ngọc bội và pháp bảo (M7.4 #505, nit của B ở review #590): trước đây bốn ngọc bội đều là đĩa tròn có lỗ đen giữa + chấm sáng (trông như CON MẮT) và sáu pháp bảo là CÙNG một ấn
// vuông chỉ khác màu (người khó phân biệt màu không phân biệt được). Nay mỗi món một hình riêng. Test giải mã chính các tệp PNG 24 x 24 do `gen-assets.mjs` sinh và so hình
// (bóng đổ, độ sáng chuẩn hoá) chứ không so màu.
import fs from "node:fs";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { ITEM_BY_ID } from "@tien-gioi/shared";

interface Img {
  w: number;
  h: number;
  px: Uint8Array;
}

/** Giải mã PNG RGBA 8 bit, bộ lọc "None" (đúng bộ mã hoá của `gen-assets.mjs`). */
function decodePng(id: string): Img {
  const b = fs.readFileSync(new URL(`../public/assets/items/${id}.png`, import.meta.url));
  const idat: Buffer[] = [];
  for (let off = 8; off < b.length;) {
    const len = b.readUInt32BE(off);
    if (b.toString("ascii", off + 4, off + 8) === "IDAT")
      idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    expect(raw[y * (w * 4 + 1)], "bộ lọc PNG").toBe(0);
    raw.copy(px, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1));
  }
  return { w, h, px };
}

const OPAQUE = 200;
const silhouette = (im: Img) =>
  Array.from({ length: im.w * im.h }, (_, i) => (im.px[i * 4 + 3] >= OPAQUE ? 1 : 0));
function iou(a: number[], b: number[]) {
  let i = 0;
  let u = 0;
  for (let k = 0; k < a.length; k++) {
    i += a[k] & b[k];
    u += a[k] | b[k];
  }
  return i / u;
}
/** Độ sáng chuẩn hoá (z-score trên điểm đặc): bỏ màu, chỉ còn hoa văn sáng / tối. */
function pattern(im: Img): number[] {
  const idx: number[] = [];
  for (let k = 0; k < im.w * im.h; k++) if (im.px[k * 4 + 3] >= OPAQUE) idx.push(k);
  const lum = (k: number) => 0.3 * im.px[k * 4] + 0.59 * im.px[k * 4 + 1] + 0.11 * im.px[k * 4 + 2];
  const v = idx.map(lum);
  const mean = v.reduce((a, c) => a + c, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, c) => a + (c - mean) ** 2, 0) / v.length) || 1;
  const out = new Array<number>(im.w * im.h).fill(0);
  idx.forEach((k, j) => (out[k] = (v[j] - mean) / sd));
  return out;
}
const mad = (a: number[], b: number[]) =>
  a.reduce((s, x, k) => s + Math.abs(x - b[k]), 0) / a.length;
const pairs = <T>(xs: T[]) => xs.flatMap((x, i) => xs.slice(i + 1).map((y) => [x, y] as const));

const JADES = ["tho_nguyet_boi", "mang_tinh_boi", "suong_linh_boi", "giao_chau_boi"];
const TREASURES = [
  "ho_than_an",
  "hap_linh_chau",
  "xich_diem_an",
  "han_bang_an",
  "dinh_tam_chung",
  "phong_hanh_boi",
];

describe("hình ngọc bội: mỗi món một hình, không giống con mắt", () => {
  it("đủ tên trong bảng vật phẩm (id trong test khớp `ITEMS`)", () => {
    for (const id of [...JADES, ...TREASURES]) expect(ITEM_BY_ID[id], id).toBeDefined();
  });

  it("bốn ngọc bội có BÓNG HÌNH đôi một khác nhau (không còn cùng một đĩa tròn)", () => {
    const sil = JADES.map((id) => silhouette(decodePng(id)));
    for (const [a, b] of pairs(JADES.map((id, i) => ({ id, s: sil[i] })))) {
      expect(iou(a.s, b.s), `${a.id} / ${b.id}`).toBeLessThan(0.9);
    }
  });

  it("không có lỗ đen LỚN ở giữa mặt ngọc (chỉ còn lỗ xỏ dây nhỏ): ít điểm đen đặc", () => {
    for (const id of JADES) {
      const im = decodePng(id);
      let dark = 0;
      for (let k = 0; k < im.w * im.h; k++) {
        const o = k * 4;
        if (im.px[o + 3] >= OPAQUE && Math.max(im.px[o], im.px[o + 1], im.px[o + 2]) < 0x30) dark++;
      }
      // bản cũ: 21 điểm (đĩa đen bán kính 2,6); lỗ xỏ dây bán kính ~1 chỉ vài điểm
      expect(dark, id).toBeLessThanOrEqual(8);
    }
  });
});

describe("hình pháp bảo: mỗi món một hình, không chỉ khác màu", () => {
  it("sáu pháp bảo đôi một khác nhau về BÓNG HÌNH hoặc về hoa văn sáng / tối (không phân biệt bằng màu)", () => {
    const ims = TREASURES.map((id) => decodePng(id));
    const sil = ims.map(silhouette);
    const pat = ims.map(pattern);
    for (const [i, j] of pairs(TREASURES.map((_, k) => k))) {
      const sameShape = iou(sil[i], sil[j]) >= 0.95;
      const d = mad(pat[i], pat[j]);
      // bản cũ: bóng hình giống hệt (1,0) VÀ hoa văn giống hệt (0,0)
      expect(
        !sameShape || d >= 0.1,
        `${TREASURES[i]} / ${TREASURES[j]} (iou ${iou(sil[i], sil[j]).toFixed(2)}, hoa văn ${d.toFixed(2)})`,
      ).toBe(true);
    }
  });

  it("ít nhất năm trong sáu pháp bảo có bóng hình riêng (hai ấn lửa / băng cùng dáng ấn, khác hoa văn)", () => {
    const sil = TREASURES.map((id) => silhouette(decodePng(id)));
    const unique = sil.filter((s, i) => sil.findIndex((t) => iou(s, t) >= 0.95) === i);
    expect(unique.length).toBeGreaterThanOrEqual(5);
  });
});
