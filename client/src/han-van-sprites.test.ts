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

// ---------------------------------------------------------------------------------------------------------------------------------------
// Biểu tượng và NPC Hàn Vân Lĩnh (M7.5c, #506): 12 icon + 3 NPC vẽ TRƯỚC vật phẩm / NPC trong `shared/` (id chốt ở #618)
// ---------------------------------------------------------------------------------------------------------------------------------------
const HV_ITEMS = [
  "han_lang_mao",
  "phong_nha_vu",
  "tuong_cot",
  "doc_tuoc_nang",
  "thien_han_chau",
  "han_vu_kiem",
  "han_lang_bao",
  "phong_nha_phu",
  "tuyet_hanh_ngoa",
  "han_tinh_boi",
  "thuong_hoi_huyet_dan",
  "thuong_hoi_linh_dan",
];
const HV_NPCS = ["tram_truong_han", "lai_buon_han", "tho_ren_han"];
const iconFiles = fs
  .readdirSync(new URL("../public/assets/items/", import.meta.url))
  .filter((f) => f.endsWith(".png"))
  .map((f) => f.replace(/\.png$/, ""));
const iconPixels = (id: string) => {
  const d = decode(read(`items/${id}.png`));
  return { w: d.w, h: d.h, data: d.px };
};

describe("biểu tượng vật phẩm và NPC Hàn Vân Lĩnh", () => {
  it("mỗi icon có tệp items/<id>.png 24 x 24 và khung item-<id> trong atlas, thân đủ điểm đặc", () => {
    for (const id of HV_ITEMS) {
      expect(iconFiles, `${id}.png`).toContain(id);
      const p = iconPixels(id);
      expect([p.w, p.h], id).toEqual([24, 24]);
      expect(opaqueCount(p), `${id} điểm đặc`).toBeGreaterThan(60);
      const f = atlas.frames[`item-${id}`];
      expect(f, `item-${id}`).toBeDefined();
      expect([f.frame.w, f.frame.h], `item-${id}`).toEqual([24, 24]);
    }
  });

  it("không icon nào trùng pixel với icon khác (kể cả đan cấp 2 và đồ Kim Đan): không chép nhầm hình", () => {
    const all = iconFiles.map((id) => ({ id, p: iconPixels(id) }));
    const mine = all.filter((x) => HV_ITEMS.includes(x.id));
    for (const a of mine)
      for (const b of all) {
        if (a.id === b.id) continue;
        expect(same(a.p, b.p), `${a.id} / ${b.id}`).toBe(false);
      }
  });

  it("đan cấp 3 khác đan cấp 2 về HÌNH (quầng ngoài + tia chéo), không chỉ khác màu: nhiều điểm sáng hơn", () => {
    for (const k of ["huyet", "linh"]) {
      const lo = iconPixels(`dai_hoi_${k}_dan`);
      const hi = iconPixels(`thuong_hoi_${k}_dan`);
      expect(opaqueCount(hi), k).toBeGreaterThan(opaqueCount(lo));
    }
  });

  it("ngọc bội Hàn Tinh không giống con mắt: không có lỗ đen lớn (chỉ lỗ xỏ dây)", () => {
    const p = iconPixels("han_tinh_boi");
    let dark = 0;
    for (let k = 0; k < p.w * p.h; k++) {
      const o = k * 4;
      if (p.data[o + 3] >= 200 && Math.max(p.data[o], p.data[o + 1], p.data[o + 2]) < 0x30) dark++;
    }
    expect(dark).toBeLessThanOrEqual(8);
  });

  it("ba NPC Hàn Vân Trạm có khung npc-<id>, cùng kích thước NPC cũ, khác nhau và khác mọi NPC cũ", () => {
    const OLD_NPC = [
      "truong_tran",
      "duoc_su",
      "tho_ren",
      "cao_thi",
      "lai_buon",
      "thu_mon",
      "tram_truong",
      "lai_buon_suong",
      "tho_ren_suong",
    ];
    const base = atlas.frames["npc-tram_truong"].frame;
    for (const id of HV_NPCS) {
      const f = atlas.frames[`npc-${id}`];
      expect(f, `npc-${id}`).toBeDefined();
      expect([f.frame.w, f.frame.h], `npc-${id}`).toEqual([base.w, base.h]);
    }
    const all = [...OLD_NPC, ...HV_NPCS].map((id) => ({ id, p: pixelsOf(`npc-${id}`) }));
    for (const a of all.filter((x) => HV_NPCS.includes(x.id)))
      for (const b of all) {
        if (a.id === b.id) continue;
        expect(same(a.p, b.p), `${a.id} / ${b.id}`).toBe(false);
      }
  });
});

describe("viền tối của icon Hàn Vân nhạt (M7.5c: ô túi nền nhạt làm icon cùng tông chìm)", () => {
  const OUTLINED = [
    "han_lang_mao",
    "phong_nha_vu",
    "tuong_cot",
    "doc_tuoc_nang",
    "han_vu_kiem",
    "han_lang_bao",
    "phong_nha_phu",
    "tuyet_hanh_ngoa",
    "han_tinh_boi",
  ];
  /** Số điểm màu viền (0x2a3340, độ đục 235) của icon. */
  const outlinePixels = (id: string) => {
    const p = iconPixels(id);
    let n = 0;
    for (let k = 0; k < p.w * p.h; k++) {
      const o = k * 4;
      if (
        p.data[o] === 0x2a &&
        p.data[o + 1] === 0x33 &&
        p.data[o + 2] === 0x40 &&
        p.data[o + 3] === 235
      )
        n++;
    }
    return n;
  };

  it("chín icon nhạt có viền tối quanh hình (đủ điểm viền); đan và Thiên Hàn Châu (đã có vòng tối / viền vàng) không thêm viền", () => {
    for (const id of OUTLINED) expect(outlinePixels(id), id).toBeGreaterThanOrEqual(25);
    for (const id of ["thuong_hoi_huyet_dan", "thuong_hoi_linh_dan", "thien_han_chau"])
      expect(outlinePixels(id), id).toBe(0);
  });

  it("viền chỉ nằm NGOÀI hình: mọi điểm viền kề một điểm đặc, không có điểm viền nào đứng xa hình", () => {
    for (const id of OUTLINED) {
      const p = iconPixels(id);
      const isOutline = (x: number, y: number) => {
        const o = (y * p.w + x) * 4;
        return (
          p.data[o] === 0x2a &&
          p.data[o + 1] === 0x33 &&
          p.data[o + 2] === 0x40 &&
          p.data[o + 3] === 235
        );
      };
      const solid = (x: number, y: number) =>
        x >= 0 &&
        y >= 0 &&
        x < p.w &&
        y < p.h &&
        p.data[(y * p.w + x) * 4 + 3] >= 200 &&
        !isOutline(x, y);
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++)
          if (isOutline(x, y))
            expect(
              solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1),
              `${id} (${x},${y})`,
            ).toBe(true);
    }
  });
});
