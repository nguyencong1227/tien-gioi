// Tranh sáu sói Hóa Thần của Lang Hoang (D1 #1466 lát A1, B vẽ riêng): `drawWolf` ở `gen-assets.mjs` (MỘT hình sói 48x44 như Hàn Lang, mỗi loài một bảng màu /
// bờm / dấu). Test giải mã chính `atlas.png` (như `han-van-sprites.test.ts`) để canh TRANH THẬT: đủ khung, đúng cỡ, KHÔNG còn là ảnh Hàn Lang tạm, mỗi
// loài nhìn khác nhau, và Hàn Lang không đổi một điểm ảnh sau khi tách hàm vẽ dùng chung.
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

interface Frame {
  frame: { x: number; y: number; w: number; h: number };
}
const read = (f: string) => fs.readFileSync(new URL(`../public/assets/${f}`, import.meta.url));
const atlas = JSON.parse(read("atlas.json").toString("utf-8")) as { frames: Record<string, Frame> };

/** Giải mã PNG RGBA 8 bit, bộ lọc None (đúng bộ mã hoá của `gen-assets.mjs`). */
function decode(b: Buffer) {
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
  return { w, px };
}
const sheet = decode(read("atlas.png"));

/** Điểm ảnh RGBA của một khung. */
function pixelsOf(name: string): { w: number; h: number; data: Uint8Array } {
  const f = atlas.frames[name]?.frame;
  expect(f, `thiếu khung ${name}`).toBeDefined();
  const data = new Uint8Array(f.w * f.h * 4);
  for (let y = 0; y < f.h; y++) {
    const src = ((f.y + y) * sheet.w + f.x) * 4;
    data.set(sheet.px.subarray(src, src + f.w * 4), y * f.w * 4);
  }
  return { w: f.w, h: f.h, data };
}
const sha = (p: { data: Uint8Array }) => crypto.createHash("sha256").update(p.data).digest("hex");
/** Màu trung bình (R, G, B) của các điểm ảnh đục. */
function meanColor(p: { data: Uint8Array }): [number, number, number] {
  let n = 0;
  const s: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < p.data.length; i += 4) {
    if (p.data[i + 3] <= 200) continue;
    n++;
    s[0] += p.data[i];
    s[1] += p.data[i + 1];
    s[2] += p.data[i + 2];
  }
  return [s[0] / n, s[1] / n, s[2] / n];
}
const l1 = (a: number[], b: number[]) => a.reduce((t, v, i) => t + Math.abs(v - b[i]), 0);

const WOLVES = [
  "da_lang",
  "hac_phong_lang",
  "huyet_nguyet_lang",
  "xich_diem_lang",
  "thuong_nguyet_lang",
  "ngan_nguyet_lang",
];
const POSES = ["atk-0", "atk-1", "hurt", "die-0", "die-1", "die-2", "die-3"];

describe("sáu sói Lang Hoang: tranh riêng (không còn ảnh Hàn Lang tạm)", () => {
  it("mỗi loài đủ khung gốc, hai khung đi bộ và bảy tư thế, đều 48x44, có hình", () => {
    for (const id of WOLVES) {
      for (const suf of ["", "-0", "-1", ...POSES.map((p) => `-${p}`)]) {
        const p = pixelsOf(`mon-${id}${suf}`);
        expect([p.w, p.h], `${id}${suf}`).toEqual([48, 44]);
        let opaque = 0;
        for (let i = 3; i < p.data.length; i += 4) if (p.data[i] > 200) opaque++;
        // khung chết tan dần: die-0..2 còn ít điểm đục hơn khung sống, die-3 gần như tan hẳn (chỉ cần khung tồn tại, đúng cỡ)
        const min = suf.endsWith("die-3") ? -1 : suf.includes("die") ? 50 : 300;
        expect(opaque, `${id}${suf}: số điểm đục`).toBeGreaterThan(min);
      }
      expect(sha(pixelsOf(`mon-${id}-0`)), `${id}: hai khung đi bộ khác nhau`).not.toBe(
        sha(pixelsOf(`mon-${id}-1`)),
      );
    }
  });

  it("KHÔNG loài nào trùng ảnh Hàn Lang (cũng không trùng nhau): mỗi loài một hình riêng", () => {
    const hash = new Map<string, string>([["han_lang", sha(pixelsOf("mon-han_lang"))]]);
    for (const id of WOLVES) hash.set(id, sha(pixelsOf(`mon-${id}`)));
    expect(new Set(hash.values()).size, "có hai loài cùng một ảnh").toBe(WOLVES.length + 1);
  });

  it("nhìn khác nhau thật: màu trung bình từng cặp (kể cả Hàn Lang) cách nhau >= 50 (tổng |ΔR|+|ΔG|+|ΔB|)", () => {
    const ids = ["han_lang", ...WOLVES];
    const mean = Object.fromEntries(ids.map((id) => [id, meanColor(pixelsOf(`mon-${id}`))]));
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        expect(l1(mean[ids[i]], mean[ids[j]]), `${ids[i]} / ${ids[j]}`).toBeGreaterThanOrEqual(50);
  });

  it("Hàn Lang KHÔNG đổi một điểm ảnh sau khi tách `drawWolf` (băm lấy từ atlas trước khi tách)", () => {
    const want: Record<string, string> = {
      "": "bab8248292f769f23e8a351ec32d41d4d42915e44b3995e090a140efebca7b40",
      "-1": "b3f11dc7fecb9812c043ec149733e408b5a3d68797223297ae7994cd24ffb379",
      "-atk-0": "6520763c3d1207c850630255c313d3c3dbc78d0825f2252b0f3d1c16be209994",
      "-hurt": "425d03456b539202163dac37aa610d6e8b51f31d1a1b3c0c9f7adda016e1db42",
      "-die-3": "7ac5678e83932d4aa3c1216faef9265cb170fe7fc90c551f8424d136fc964c9b",
    };
    for (const [suf, h] of Object.entries(want))
      expect(sha(pixelsOf(`mon-han_lang${suf}`)), `han_lang${suf}`).toBe(h);
  });
});
