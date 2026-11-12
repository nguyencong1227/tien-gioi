import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { MONSTERS } from "@tien-gioi/shared";
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

  it("4 yêu thú có tranh trong atlas: đủ khung đi, đánh, bị đánh, gục cùng kích thước với khung đi", () => {
    // Quái chưa có tranh trong atlas (vd boss bí cảnh) dùng ảnh dự phòng vẽ bằng mã trong textures.ts và rơi về hiệu ứng mờ dần cũ
    const inAtlas = MONSTERS.filter((m) => atlas.frames[`mon-${m.id}-0`]);
    expect(inAtlas.map((m) => m.id)).toEqual(expect.arrayContaining(["tho", "lang", "ho", "mang"]));
    for (const m of inAtlas) {
      const base = atlas.frames[`mon-${m.id}-0`];
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
});
