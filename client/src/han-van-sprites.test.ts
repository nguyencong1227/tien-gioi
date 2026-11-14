// Tranh năm quái của Hàn Vân Lĩnh (M7.5b, #506): han_lang, phong_nha, cot_tuong, doc_tuoc, thien_han_vuong. Tranh được vẽ TRƯỚC khi loài vào `shared/` (id chưa có trong `MONSTERS` thì
// vô hại; A thêm loài + `monsterCap` sau và `atlas.test.ts` đòi mỗi loài có khung). Test này giải mã chính `atlas.png` (bộ mã hoá của `gen-assets.mjs`: PNG RGBA 8 bit, bộ lọc None)
// để kiểm tranh THẬT chứ không chỉ tên khung.
import fs from "node:fs";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { MON_ONE_SHOT } from "./gfx/anim/mon-anim";

interface Frame {
  frame: { x: number; y: number; w: number; h: number };
}
const read = (f: string) => fs.readFileSync(new URL(`../public/assets/${f}`, import.meta.url));
const atlas = JSON.parse(read("atlas.json").toString("utf-8")) as {
  frames: Record<string, Frame>;
};

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
  return { w, h, px };
}
const sheet = decode(read("atlas.png"));

/** Điểm ảnh RGBA của một khung (w x h x 4). */
function pixelsOf(name: string): { w: number; h: number; data: Uint8Array } {
  const f = atlas.frames[name]?.frame;
  expect(f, name).toBeDefined();
  const data = new Uint8Array(f.w * f.h * 4);
  for (let y = 0; y < f.h; y++) {
    const src = ((f.y + y) * sheet.w + f.x) * 4;
    data.set(sheet.px.subarray(src, src + f.w * 4), y * f.w * 4);
  }
  return { w: f.w, h: f.h, data };
}
const opaqueCount = (p: { data: Uint8Array }) => {
  let n = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] >= 200) n++;
  return n;
};
const same = (a: { data: Uint8Array }, b: { data: Uint8Array }) =>
  a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);

const HAN_VAN = ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc", "thien_han_vuong"];
/** Mọi loài đã có tranh từ trước + năm loài mới. */
const OLD = [
  "tho",
  "lang",
  "ho",
  "mang",
  "suong_ho",
  "thach_quy",
  "doc_thiem",
  "hac_giao",
  "yeu_vuong",
];
const areaOf = (id: string) => {
  const f = atlas.frames[`mon-${id}-0`].frame;
  return f.w * f.h;
};

describe("tranh quái Hàn Vân Lĩnh trong atlas", () => {
  it("mỗi loài đủ khung: mon-<id>, hai khung đi, mọi khung tư thế (đánh, bị đánh, gục) cùng kích thước khung đi", () => {
    for (const id of HAN_VAN) {
      const base = atlas.frames[`mon-${id}-0`];
      expect(base, `mon-${id}-0`).toBeDefined();
      expect(atlas.frames[`mon-${id}`], `mon-${id}`).toBeDefined();
      expect(atlas.frames[`mon-${id}-1`], `mon-${id}-1`).toBeDefined();
      for (const shot of Object.values(MON_ONE_SHOT)) {
        for (const n of shot.frames) {
          const f = atlas.frames[`mon-${id}-${n}`];
          expect(f, `mon-${id}-${n}`).toBeDefined();
          expect([f.frame.w, f.frame.h], `mon-${id}-${n}`).toEqual([base.frame.w, base.frame.h]);
        }
      }
    }
  });

  it("trùm Thiên Hàn Vương lớn hơn mọi quái khác kể cả trùm cũ (đọc được là trùm ở màn hình nhỏ); bốn loài thường nhỏ hơn mọi trùm", () => {
    for (const id of [...OLD, ...HAN_VAN.filter((x) => x !== "thien_han_vuong")])
      expect(areaOf("thien_han_vuong"), `thien_han_vuong lớn hơn ${id}`).toBeGreaterThan(
        areaOf(id),
      );
    for (const small of ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc"])
      for (const boss of ["mang", "hac_giao", "yeu_vuong"])
        expect(areaOf(boss), `${boss} lớn hơn ${small}`).toBeGreaterThan(areaOf(small));
  });

  it("tranh có thân thật (đủ điểm đặc), hai khung đi khác nhau (có hoạt ảnh), khung gục tan dần (ít điểm đặc hơn khung đi)", () => {
    for (const id of HAN_VAN) {
      const f0 = pixelsOf(`mon-${id}-0`);
      const f1 = pixelsOf(`mon-${id}-1`);
      expect(opaqueCount(f0), `${id} điểm đặc`).toBeGreaterThan(300);
      expect(same(f0, f1), `${id}: khung 0 và 1 khác nhau`).toBe(false);
      expect(opaqueCount(pixelsOf(`mon-${id}-die-3`)), `${id} gục xong`).toBeLessThan(
        opaqueCount(f0),
      );
    }
  });

  it("không loài nào trùng tranh với loài khác (khung đi 0): không chép nhầm hình", () => {
    const all = [...OLD, ...HAN_VAN];
    const imgs = all.map((id) => ({ id, p: pixelsOf(`mon-${id}-0`) }));
    for (let i = 0; i < imgs.length; i++)
      for (let j = i + 1; j < imgs.length; j++)
        expect(same(imgs[i].p, imgs[j].p), `${imgs[i].id} / ${imgs[j].id}`).toBe(false);
  });

  it("năm loài khác nhau về BÓNG HÌNH với mọi loài cùng kích thước khung (không chỉ khác màu)", () => {
    const sil = (p: { data: Uint8Array }) =>
      Array.from({ length: p.data.length / 4 }, (_, i) => (p.data[i * 4 + 3] >= 200 ? 1 : 0));
    const all = [...OLD, ...HAN_VAN];
    const imgs = all.map((id) => ({ id, p: pixelsOf(`mon-${id}-0`) }));
    for (const a of imgs.filter((x) => HAN_VAN.includes(x.id)))
      for (const b of imgs) {
        if (a.id === b.id || a.p.w !== b.p.w || a.p.h !== b.p.h) continue;
        const sa = sil(a.p);
        const sb = sil(b.p);
        let inter = 0;
        let uni = 0;
        for (let k = 0; k < sa.length; k++) {
          inter += sa[k] & sb[k];
          uni += sa[k] | sb[k];
        }
        expect(inter / uni, `${a.id} / ${b.id}`).toBeLessThan(0.9);
      }
  });
});
