import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ITEMS, MONSTERS, NPCS } from "@tien-gioi/shared";
import { MON_ONE_SHOT } from "./gfx/anim/mon-anim";

// Atlas do `client/scripts/gen-assets.mjs` sinh (tất định, không tệp ngoài). Test này giữ hợp đồng giữa script sinh,
// `textures.ts` (đăng ký hoạt ảnh) và ngân sách M5 mục 8 / 10 (atlas <= 2048x2048).
interface Frame {
  frame: { x: number; y: number; w: number; h: number };
}
const read = (f: string) => fs.readFileSync(new URL(`../public/assets/${f}`, import.meta.url));
const atlas = JSON.parse(read("atlas.json").toString("utf-8")) as {
  frames: Record<string, Frame>;
  meta: { size: { w: number; h: number } };
};
const png = read("atlas.png");

describe("atlas.json / atlas.png (sinh bằng gen-assets.mjs)", () => {
  it("kích thước trong ngân sách (<= 2048x2048) và khớp tiêu đề PNG", () => {
    expect(atlas.meta.size.w).toBeLessThanOrEqual(2048);
    expect(atlas.meta.size.h).toBeLessThanOrEqual(2048);
    expect(png.readUInt32BE(16)).toBe(atlas.meta.size.w);
    expect(png.readUInt32BE(20)).toBe(atlas.meta.size.h);
  });

  it("mọi khung nằm trong atlas và không khung nào đè lên khung khác", () => {
    const list = Object.entries(atlas.frames).map(([name, f]) => ({ name, ...f.frame }));
    for (const f of list) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(atlas.meta.size.w);
      expect(f.y + f.h).toBeLessThanOrEqual(atlas.meta.size.h);
    }
    // Chỉ các ô hình chữ nhật KHÁC nhau mới so đè (tên khác nhau có thể trỏ cùng một ô: `mon-<id>` = `mon-<id>-0`)
    const key = (f: { x: number; y: number; w: number; h: number }) =>
      `${f.x},${f.y},${f.w},${f.h}`;
    const rects = [...new Map(list.map((f) => [key(f), f])).values()];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.name} đè ${b.name}`).toBe(false);
      }
    }
  });

  it("MỌI yêu thú có tranh trong atlas (kể cả quái Kim Đan và trùm bí cảnh): đủ khung đi, đánh, bị đánh, gục cùng kích thước khung đi", () => {
    // M6 #407: không còn quái nào rơi về ảnh dự phòng vẽ bằng mã (textures.ts) vì thiếu khung trong atlas
    expect(MONSTERS.length).toBeGreaterThanOrEqual(9);
    for (const m of MONSTERS) {
      const base = atlas.frames[`mon-${m.id}-0`];
      expect(base, `mon-${m.id}-0`).toBeDefined();
      expect(atlas.frames[`mon-${m.id}`], `mon-${m.id}`).toBeDefined();
      expect(atlas.frames[`mon-${m.id}-1`], `mon-${m.id}-1`).toBeDefined();
      for (const shot of Object.values(MON_ONE_SHOT)) {
        for (const n of shot.frames) {
          const f = atlas.frames[`mon-${m.id}-${n}`];
          expect(f, `mon-${m.id}-${n}`).toBeDefined();
          expect(f.frame.w).toBe(base.frame.w);
          expect(f.frame.h).toBe(base.frame.h);
        }
      }
    }
  });

  it("MỌI NPC và MỌI vật phẩm có tranh: khung npc-<id>, item-<id> trong atlas và tệp items/<id>.png", () => {
    for (const n of NPCS) expect(atlas.frames[`npc-${n.id}`], `npc-${n.id}`).toBeDefined();
    for (const it of ITEMS) {
      expect(atlas.frames[`item-${it.id}`], `item-${it.id}`).toBeDefined();
      expect(
        fs.existsSync(new URL(`../public/assets/items/${it.id}.png`, import.meta.url)),
        `items/${it.id}.png`,
      ).toBe(true);
    }
  });

  it("bốn loài Kim Đan và trùm bí cảnh khác nhau về kích thước / hình: trùm lớn hơn quái thường (đọc được ở màn hình nhỏ)", () => {
    const area = (id: string) =>
      atlas.frames[`mon-${id}-0`].frame.w * atlas.frames[`mon-${id}-0`].frame.h;
    for (const boss of ["mang", "hac_giao", "yeu_vuong"])
      for (const small of ["tho", "lang", "ho", "suong_ho", "thach_quy", "doc_thiem"])
        expect(area(boss), `${boss} lớn hơn ${small}`).toBeGreaterThan(area(small));
    expect(area("hac_giao")).toBeGreaterThan(area("mang"));
  });

  it("5 bộ người chơi (me, other, 3 pháp bào) đủ khung bị đánh 4 hướng và gục 4 khung cùng kích thước khung đứng", () => {
    for (const who of [
      "me",
      "other",
      "robe-tho_nhung_bao",
      "robe-hac_ho_bao",
      "robe-xich_lan_bao",
    ]) {
      const idle = atlas.frames[`${who}-idle-down`];
      expect(idle, `${who}-idle-down`).toBeDefined();
      for (const d of ["down", "up", "left", "right"]) {
        const f = atlas.frames[`${who}-hurt-${d}`];
        expect(f, `${who}-hurt-${d}`).toBeDefined();
        expect(f.frame.w).toBe(idle.frame.w);
        expect(f.frame.h).toBe(idle.frame.h);
      }
      for (let i = 0; i < 4; i++) {
        const f = atlas.frames[`${who}-die-${i}`];
        expect(f, `${who}-die-${i}`).toBeDefined();
        expect(f.frame.w).toBe(idle.frame.w);
        expect(f.frame.h).toBe(idle.frame.h);
      }
    }
  });
});
