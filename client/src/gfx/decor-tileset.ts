/**
 * Tileset trang trí bản đồ VẼ BẰNG MÃ (M5.3, #332): 10 khung 32x32 (5 loại x 2 biến thể, xem `map-style.ts`) tô theo
 * `MapStyle.decor.palette`, nối liền một hàng ngang (320x32 px = 40 KB texture mỗi kiểu). Lưới khung từ `map-decor.ts`.
 *
 * Tách phần THUẦN (`decorFrameRects`: danh sách hình chữ nhật có màu, test được không cần Phaser / canvas) khỏi phần vẽ
 * (`ensureDecorTileset`: một `CanvasTexture`). Phong cách khớp tileset hiện có: khối pixel 2x2, không khử răng cưa.
 * Không tài sản ngoài: sinh hoàn toàn từ mã nên không cần ghi `CREDITS.md`.
 */
import type Phaser from "phaser";
import { TILE } from "@tien-gioi/shared";
import {
  DECOR_FRAMES,
  DECOR_KINDS,
  DECOR_VARIANTS,
  hasOwnStyle,
  type DecorKind,
  type MapStyle,
} from "./map-style";

export interface DecorRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  /** Độ trong suốt (mặc định 1): bóng đổ dưới chân. */
  a?: number;
}

/** Làm sáng (f > 0) / tối (f < 0) một màu 0xRRGGBB, f trong [-1, 1]. */
export function shade(color: number, f: number): number {
  const ch = (v: number) => {
    const out = f >= 0 ? v + (255 - v) * f : v * (1 + f);
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  return (ch((color >> 16) & 255) << 16) | (ch((color >> 8) & 255) << 8) | ch(color & 255);
}

const SHADOW = 0x1d1a16;
const STEM = 0x4f6838;
const CREAM = 0xf2e6cf;
const POLLEN = 0xf2c94c;

/** Bóng đổ nhạt dưới chân một vật (hình elip thô bằng hai hình chữ nhật). */
function shadow(cx: number, y: number, w: number): DecorRect[] {
  return [
    { x: cx - w / 2, y, w, h: 2, color: SHADOW, a: 0.22 },
    { x: cx - w / 2 + 2, y: y + 2, w: w - 4, h: 2, color: SHADOW, a: 0.16 },
  ];
}

function tuft(color: number, variant: number): DecorRect[] {
  const dark = shade(color, -0.25);
  const light = shade(color, 0.25);
  // Hai biến thể: cụm lệch trái và cụm lệch phải, chiều cao các cọng khác nhau
  const ox = variant === 0 ? 6 : 12;
  const heights = variant === 0 ? [12, 18, 10, 16, 8] : [10, 16, 20, 12, 14];
  const rects: DecorRect[] = [...shadow(ox + 10, 26, 18)];
  heights.forEach((h, i) => {
    const x = ox + i * 4;
    rects.push({ x, y: 26 - h, w: 2, h, color: i % 2 ? color : dark });
    rects.push({ x, y: 26 - h, w: 2, h: 2, color: light });
  });
  return rects;
}

function flowerAt(x: number, y: number, petal: number): DecorRect[] {
  return [
    { x: x + 3, y: y + 8, w: 2, h: 8, color: STEM },
    { x: x + 2, y: y + 4, w: 4, h: 4, color: POLLEN },
    { x: x + 2, y, w: 4, h: 4, color: petal },
    { x: x - 2, y: y + 4, w: 4, h: 4, color: petal },
    { x: x + 6, y: y + 4, w: 4, h: 4, color: petal },
    { x: x + 2, y: y + 4, w: 4, h: 2, color: shade(POLLEN, 0.3) },
  ];
}

function flower(color: number, variant: number): DecorRect[] {
  const second = shade(color, -0.15);
  const sets =
    variant === 0
      ? [
          [8, 6, color],
          [20, 14, second],
        ]
      : [
          [18, 4, color],
          [6, 14, second],
        ];
  const rects: DecorRect[] = [];
  for (const [x, y, c] of sets) {
    rects.push(...shadow(x + 4, y + 14, 10), ...flowerAt(x, y, c));
  }
  return rects;
}

function pebble(color: number, variant: number): DecorRect[] {
  const light = shade(color, 0.28);
  const dark = shade(color, -0.2);
  const spots =
    variant === 0
      ? [
          [8, 16, 10, 6],
          [20, 20, 6, 4],
          [14, 24, 6, 4],
        ]
      : [
          [12, 14, 8, 6],
          [6, 22, 6, 4],
          [22, 18, 8, 6],
        ];
  const rects: DecorRect[] = [];
  for (const [x, y, w, h] of spots) {
    rects.push({ x: x + 1, y: y + h, w, h: 2, color: SHADOW, a: 0.25 });
    rects.push({ x, y, w, h, color });
    rects.push({ x, y: y + h - 2, w, h: 2, color: dark });
    rects.push({ x: x + 2, y, w: Math.max(2, w - 4), h: 2, color: light });
  }
  return rects;
}

function mushroom(color: number, variant: number): DecorRect[] {
  const x = variant === 0 ? 10 : 14;
  const dot = 0xfff7e6;
  const dark = shade(color, -0.25);
  return [
    ...shadow(x + 6, 24, 14),
    { x: x + 4, y: 16, w: 4, h: 8, color: CREAM },
    { x: x + 4, y: 20, w: 4, h: 4, color: shade(CREAM, -0.15) },
    { x, y: 12, w: 12, h: 4, color },
    { x: x + 2, y: 8, w: 8, h: 4, color },
    { x: x + 4, y: 6, w: 4, h: 2, color },
    { x, y: 14, w: 12, h: 2, color: dark },
    { x: x + 3, y: 9, w: 2, h: 2, color: dot },
    { x: x + 8, y: 12, w: 2, h: 2, color: dot },
  ];
}

function bush(color: number, variant: number): DecorRect[] {
  const dark = shade(color, -0.28);
  const light = shade(color, 0.22);
  const ox = variant === 0 ? 4 : 6;
  return [
    ...shadow(ox + 12, 24, 24),
    { x: ox, y: 14, w: 24, h: 10, color },
    { x: ox + 2, y: 10, w: 20, h: 4, color },
    { x: ox + 6, y: 6, w: 12, h: 4, color },
    { x: ox, y: 20, w: 24, h: 4, color: dark },
    { x: ox + 4, y: 12, w: 6, h: 2, color: light },
    { x: ox + 14, y: 14, w: 6, h: 2, color: light },
    { x: ox + 8, y: 8, w: 4, h: 2, color: light },
  ];
}

const DRAW: Record<DecorKind, (color: number, variant: number) => DecorRect[]> = {
  tuft,
  flower,
  pebble,
  mushroom,
  bush,
};

/**
 * Các hình chữ nhật của khung `frame` (0..DECOR_FRAMES-1), toạ độ TRONG khung (0..32). Thuần và tất định.
 * `frame` ngoài khoảng -> mảng rỗng.
 */
export function decorFrameRects(style: MapStyle, frame: number): DecorRect[] {
  if (!Number.isInteger(frame) || frame < 0 || frame >= DECOR_FRAMES) return [];
  const kind = DECOR_KINDS[Math.floor(frame / DECOR_VARIANTS)];
  const variant = frame % DECOR_VARIANTS;
  return DRAW[kind](style.decor.palette[kind][variant], variant);
}

/** Khoá texture của kiểu bản đồ: id lạ dùng chung một texture "default". */
export function decorTilesetKey(mapId: string): string {
  return `decor-${hasOwnStyle(mapId) ? mapId : "default"}`;
}

const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Dựng (một lần) texture trang trí cho một kiểu và trả khoá. Gọi lại với cùng khoá thì dùng lại. */
export function ensureDecorTileset(scene: Phaser.Scene, mapId: string, style: MapStyle): string {
  const key = decorTilesetKey(mapId);
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, TILE * DECOR_FRAMES, TILE)!;
  const ctx = tex.getContext();
  for (let f = 0; f < DECOR_FRAMES; f++) {
    for (const r of decorFrameRects(style, f)) {
      ctx.fillStyle = css(r.color, r.a ?? 1);
      ctx.fillRect(f * TILE + r.x, r.y, r.w, r.h);
    }
  }
  tex.refresh();
  return key;
}
