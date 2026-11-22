// Dấu riêng của kinh quyển (issue #1303, B). Trước đây 43 / 57 quyển dùng cùng một dấu tròn: 10 cặp icon GIỐNG HỆT (vd
// `kinh_thuc_giap_phi_tan` = `kinh_ung_trao`) + 37 cặp gần giống, người chơi khó biết quyển nào ra chiêu nào. Nay quyển không có dấu vẽ tay
// tự có "ấn" 7 x 7 sinh TẤT ĐỊNH từ id (`book-marks.mjs`), và test này giữ bất biến cho MỌI quyển học được trên `main` (kể cả quyển G / D / E
// thêm sau): không hai quyển cùng điểm ảnh, không cùng (bìa, viền, dấu), và hai quyển MÀU GẦN NHAU phải khác nhau rõ về hình dấu.
//
// Gồm hai phần: (1) hàm thuần `book-marks.mjs` (tất định, luật ấn, luật chống chữ Hán); (2) giải mã chính các tệp PNG 24 x 24 do `gen-assets.mjs`
// sinh (như `item-icons.test.ts`) nên bắt được cả lỗi ở bảng `BOOKS` lẫn lỗi ở phép vẽ.
import fs from "node:fs";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { LEARNABLE_SKILLS, bookIdOf } from "@tien-gioi/shared";
import {
  MAX_LIT,
  MAX_RUN,
  MIN_LIT,
  SIGIL_SIZE,
  hash32,
  sigilGrid,
  sigilRows,
  sigilValid,
} from "./book-marks.mjs";

// ---------------------------------------------------------------- (1) hàm thuần

type Grid = number[][];
const rowsOf = (g: Grid) => g.map((r) => r.join(""));
const flat = (g: Grid) => rowsOf(g).join("|");

/** Chiều dài nét liền dài nhất của một dãy 0/1. */
function longestRun(line: number[]) {
  let best = 0;
  let cur = 0;
  for (const v of line) {
    cur = v ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

describe("book-marks: hash32 và ấn sinh từ id (hàm thuần)", () => {
  it("hash32 cho đúng các giá trị đã ghim (đổi thuật toán băm là đổi hình MỌI quyển: phải cố ý)", () => {
    expect(hash32("")).toBe(2872998923);
    expect(hash32("abc")).toBe(482950588);
    expect(hash32("kinh_hoa_van_kiem")).toBe(3983807428);
  });

  it("tất định: cùng (id, salt) thì cùng ấn; đổi salt thì đổi ấn", () => {
    expect(flat(sigilGrid("kinh_x"))).toBe(flat(sigilGrid("kinh_x")));
    expect(flat(sigilGrid("kinh_x", 0))).toBe(flat(sigilGrid("kinh_x")));
    expect(flat(sigilGrid("kinh_x", 1))).not.toBe(flat(sigilGrid("kinh_x", 0)));
    expect(flat(sigilGrid("kinh_y"))).not.toBe(flat(sigilGrid("kinh_x")));
  });

  it("mọi ấn của 2000 id: 7 x 7, đối xứng trái / phải, đủ điểm sáng, không nét liền dài, hàng / cột nào cũng có điểm sáng", () => {
    for (let i = 0; i < 2000; i++) {
      const g = sigilGrid(`kinh_thu_${i}`);
      expect(g).toHaveLength(SIGIL_SIZE);
      let lit = 0;
      for (let y = 0; y < SIGIL_SIZE; y++) {
        expect(g[y]).toHaveLength(SIGIL_SIZE);
        for (let x = 0; x < SIGIL_SIZE; x++)
          expect(g[y][x], `đối xứng ${i}`).toBe(g[y][SIGIL_SIZE - 1 - x]);
        lit += g[y].reduce((a, v) => a + v, 0);
        expect(g[y].some(Boolean), `hàng rỗng ${i}`).toBe(true);
        expect(longestRun(g[y]), `nét ngang liền ${i}`).toBeLessThanOrEqual(MAX_RUN);
        const col = g.map((r) => r[y]);
        expect(col.some(Boolean), `cột rỗng ${i}`).toBe(true);
        expect(longestRun(col), `nét dọc liền ${i}`).toBeLessThanOrEqual(MAX_RUN);
      }
      expect(lit).toBeGreaterThanOrEqual(MIN_LIT);
      expect(lit).toBeLessThanOrEqual(MAX_LIT);
    }
  });

  it("sigilValid loại: ấn rỗng, ấn đặc, dấu cộng (nét liền 7), lưới ô vuông, và ấn thưa", () => {
    const blank: Grid = Array.from({ length: 7 }, () => new Array(7).fill(0));
    const full: Grid = Array.from({ length: 7 }, () => new Array(7).fill(1));
    const plus: Grid = blank.map((r, y) => r.map((_, x) => (x === 3 || y === 3 ? 1 : 0)));
    const lattice: Grid = blank.map((r, y) =>
      r.map((_, x) => (x % 3 === 0 || y % 3 === 0 ? 1 : 0)),
    );
    const sparse: Grid = blank.map((r) => r.slice());
    for (let k = 0; k < 7; k++) sparse[k][k % 2 ? 3 : 2] = 1;
    for (const [ten, g] of [
      ["rỗng", blank],
      ["đặc", full],
      ["dấu cộng", plus],
      ["lưới", lattice],
      ["thưa", sparse],
    ] as const)
      expect(sigilValid(g as Grid), ten).toBe(false);
  });

  it("sigilRows: 7 hàng x 9 ký tự, '#' là điểm sáng, hai cột mép luôn nền (ấn 7 cột đặt giữa vùng 9 cột)", () => {
    const rows = sigilRows("kinh_hoa_van_kiem");
    expect(rows).toHaveLength(SIGIL_SIZE);
    for (const r of rows) {
      expect(r).toMatch(/^\.[#.]{7}\.$/);
    }
    expect(rows.join("\n")).toBe(
      [
        ".#..#..#.",
        ".##...##.",
        "..#...#..",
        ".#.....#.",
        "..#.#.#..",
        "...#.#...",
        "...#.#...",
      ].join("\n"),
    );
  });

  it("5000 id giả: 5000 ấn đôi một khác nhau (28 bit tự do, không va chạm ở quy mô quyển thật)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(flat(sigilGrid(`kinh_gia_${i}`)));
    expect(seen.size).toBe(5000);
  });
});

// ---------------------------------------------------------------- (2) ảnh thật

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

type Rgb = [number, number, number];
const at = (im: Img, x: number, y: number): Rgb => {
  const k = (y * im.w + x) * 4;
  return [im.px[k], im.px[k + 1], im.px[k + 2]];
};
const same = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const chDiff = (a: Rgb, b: Rgb) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

/** Hai quyển có bìa VÀ viền gần nhau (lệch mỗi kênh <= ngần này) thì mắt khó phân biệt bằng màu: phải khác nhau về hình dấu. */
const NEAR_COLOUR = 40;
/** Số điểm ảnh khác nhau tối thiểu của vùng dấu (9 x 9) giữa hai quyển màu gần nhau. */
const MIN_MARK_DIFF = 10;

interface Book {
  id: string;
  im: Img;
  cover: Rgb;
  accent: Rgb;
  mask: number[];
  pixels: string;
}

/** Toạ độ theo phép vẽ trong `gen-assets.mjs`: bìa `rect(5, 4, 14, 17)`; dải trên `rect(8, 7, 9, 1, accent)`; vùng dấu x 8..16, y 9..17. */
function loadBook(id: string): Book {
  const im = decodePng(id);
  expect([im.w, im.h]).toEqual([24, 24]);
  const cover = at(im, 12, 5);
  const accent = at(im, 12, 7);
  const mask: number[] = [];
  for (let y = 9; y <= 17; y++)
    for (let x = 8; x <= 16; x++) mask.push(same(at(im, x, y), cover) ? 0 : 1);
  return { id, im, cover, accent, mask, pixels: Buffer.from(im.px).toString("base64") };
}

const BOOKS: Book[] = LEARNABLE_SKILLS.map((d) => loadBook(bookIdOf(d.id)));
const pairs: [Book, Book][] = [];
for (let i = 0; i < BOOKS.length; i++)
  for (let j = i + 1; j < BOOKS.length; j++) pairs.push([BOOKS[i], BOOKS[j]]);
const maskDiff = (a: Book, b: Book) => a.mask.reduce((n, v, k) => n + (v !== b.mask[k] ? 1 : 0), 0);
const nameOf = (a: Book, b: Book) => `${a.id.slice(5)} / ${b.id.slice(5)}`;

describe("kinh quyển học được: mỗi quyển một dấu riêng (#1303)", () => {
  it("có đủ quyển để so (mọi chiêu học được đều có icon quyển)", () => {
    expect(BOOKS.length).toBe(LEARNABLE_SKILLS.length);
    expect(BOOKS.length).toBeGreaterThanOrEqual(57);
  });

  it("không hai quyển có CÙNG điểm ảnh (băm cả icon 24 x 24)", () => {
    const dup = pairs.filter(([a, b]) => a.pixels === b.pixels).map(([a, b]) => nameOf(a, b));
    expect(dup, `cặp icon giống hệt: ${dup.join("; ")}`).toEqual([]);
  });

  it("không hai quyển cùng (bìa, viền, dấu)", () => {
    const dup = pairs
      .filter(
        ([a, b]) =>
          same(a.cover, b.cover) && same(a.accent, b.accent) && a.mask.join("") === b.mask.join(""),
      )
      .map(([a, b]) => nameOf(a, b));
    expect(dup, `cặp cùng bìa + viền + dấu: ${dup.join("; ")}`).toEqual([]);
  });

  it(`hai quyển bìa VÀ viền gần nhau (lệch kênh <= ${NEAR_COLOUR}) khác nhau >= ${MIN_MARK_DIFF} điểm ảnh ở vùng dấu`, () => {
    const bad = pairs
      .filter(
        ([a, b]) =>
          chDiff(a.cover, b.cover) <= NEAR_COLOUR && chDiff(a.accent, b.accent) <= NEAR_COLOUR,
      )
      .map(([a, b]) => ({ ten: nameOf(a, b), d: maskDiff(a, b) }))
      .filter((p) => p.d < MIN_MARK_DIFF)
      .map((p) => `${p.ten} (${p.d})`);
    expect(
      bad,
      `màu gần nhau mà dấu chỉ khác dưới ${MIN_MARK_DIFF} điểm: ${bad.join("; ")}. Sửa: thêm \`salt\` (số nguyên) làm phần tử thứ TƯ của mục quyển trong BOOKS (gen-assets.mjs), vd [bìa, viền, undefined, 1], rồi npm run assets -w client.`,
    ).toEqual([]);
  });

  it("vùng dấu của mọi quyển có điểm sáng (không quyển nào để bìa trơn)", () => {
    const blank = BOOKS.filter((b) => b.mask.every((v) => v === 0)).map((b) => b.id);
    expect(blank).toEqual([]);
  });
});
