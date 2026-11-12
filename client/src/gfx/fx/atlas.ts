/**
 * Atlas hạt + phông bit-map chữ bay, SINH BẰNG MÃ lúc chạy (M5.2, #325, mục 7.1 (4)-(5), mục 11 "tài sản").
 * Không có tệp ngoài: không cần giấy phép, không tải mạng, tất định (trừ hình chữ của phông, lấy từ phông hệ thống / Noto Serif).
 * Một atlas hạt duy nhất (192x32, 6 khung 32x32) để gộp lệnh vẽ; một texture phông bit-map (~1 MB).
 */
import Phaser from "phaser";
import { FX_FRAMES, type FxFrame } from "./recipes";
import { FX_CHARS, glyphUvs, layoutGlyphGrid } from "./glyphs";

export const FX_ATLAS_KEY = "fx-atlas";
export const FX_FONT_KEY = "fx-font";
const FRAME_PX = 32;

type Draw = (ctx: CanvasRenderingContext2D, c: number) => void;

function radial(
  ctx: CanvasRenderingContext2D,
  c: number,
  r: number,
  stops: Array<[number, string]>,
): void {
  const g = ctx.createRadialGradient(c, c, 0, c, c, r);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FRAME_PX, FRAME_PX);
}

const DRAWERS: Record<FxFrame, Draw> = {
  // đốm mềm
  dot: (ctx, c) =>
    radial(ctx, c, 15, [
      [0, "rgba(255,255,255,1)"],
      [0.45, "rgba(255,255,255,0.55)"],
      [1, "rgba(255,255,255,0)"],
    ]),
  // tia sao bốn cánh
  spark: (ctx, c) => {
    radial(ctx, c, 8, [
      [0, "rgba(255,255,255,0.9)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 === 0 ? 15 : 2.2;
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  },
  // vòng mảnh có quầng
  ring: (ctx, c) => {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c, c, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, 11, 0, Math.PI * 2);
    ctx.stroke();
  },
  // khói / sương: mảng lớn, mờ
  smoke: (ctx, c) =>
    radial(ctx, c, 16, [
      [0, "rgba(255,255,255,0.55)"],
      [0.6, "rgba(255,255,255,0.22)"],
      [1, "rgba(255,255,255,0)"],
    ]),
  // cánh hoa
  petal: (ctx, c) => {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(c, c, 12, 6, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.ellipse(c - 2, c - 1, 6, 2.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
  },
  // hạt lửa nhỏ, sắc
  ember: (ctx, c) =>
    radial(ctx, c, 6, [
      [0, "rgba(255,255,255,1)"],
      [0.7, "rgba(255,255,255,0.9)"],
      [1, "rgba(255,255,255,0)"],
    ]),
};

/** Dựng atlas hạt (một lần cho mỗi game). */
export function ensureFxAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(FX_ATLAS_KEY)) return;
  const tex = scene.textures.createCanvas(FX_ATLAS_KEY, FRAME_PX * FX_FRAMES.length, FRAME_PX);
  if (!tex) throw new Error("Không tạo được texture atlas hạt");
  const ctx = tex.getContext();
  FX_FRAMES.forEach((name, i) => {
    ctx.save();
    ctx.translate(i * FRAME_PX, 0);
    ctx.beginPath();
    ctx.rect(0, 0, FRAME_PX, FRAME_PX);
    ctx.clip();
    DRAWERS[name](ctx, FRAME_PX / 2);
    ctx.restore();
    tex.add(name, 0, i * FRAME_PX, 0, FRAME_PX, FRAME_PX);
  });
  tex.refresh();
}

const CELL_W = 48;
const CELL_H = 56;
const FONT_PX = 38;
const BASELINE = 44;
const STROKE = 6;

/** Dựng phông bit-map chữ bay: chữ TRẮNG viền tối, nên `setTint` chỉ đổi màu phần chữ (viền tối vẫn tối). */
export function ensureFxFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(FX_FONT_KEY)) return;
  const grid = layoutGlyphGrid(FX_CHARS, CELL_W, CELL_H, 12);
  const tex = scene.textures.createCanvas(FX_FONT_KEY, grid.width, grid.height);
  if (!tex) throw new Error("Không tạo được texture phông chữ bay");
  const ctx = tex.getContext();
  ctx.font = `bold ${FONT_PX}px "Noto Serif", Georgia, serif`;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  // Kiểu của Phaser thiếu `xAdvance` (dữ liệu thật có): khai báo kiểu riêng rồi ép khi nạp
  interface Glyph {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    xOffset: number;
    yOffset: number;
    xAdvance: number;
    data: Record<string, never>;
    kerning: Record<string, never>;
    /** UV cho bộ vẽ WebGL của BitmapText (xem `glyphUvs`). */
    u0: number;
    v0: number;
    u1: number;
    v1: number;
  }
  const chars: Record<number, Glyph> = {};
  for (const cell of grid.cells) {
    const measured = ctx.measureText(cell.ch).width;
    const isSpace = cell.ch === " ";
    if (!isSpace) {
      const x = cell.x + STROKE / 2;
      const y = cell.y + BASELINE;
      ctx.strokeStyle = "#1d1a16";
      ctx.lineWidth = STROKE;
      ctx.strokeText(cell.ch, x, y, CELL_W - STROKE);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(cell.ch, x, y, CELL_W - STROKE);
    }
    const w = isSpace ? 1 : Math.min(CELL_W, Math.ceil(measured) + STROKE);
    const h = isSpace ? 1 : CELL_H;
    chars[cell.ch.charCodeAt(0)] = {
      ...glyphUvs({ x: cell.x, y: cell.y, width: w, height: h }, grid.width, grid.height),
      x: cell.x,
      y: cell.y,
      width: w,
      height: h,
      centerX: w / 2,
      centerY: CELL_H / 2,
      xOffset: 0,
      yOffset: 0,
      xAdvance: Math.ceil(measured) + 1,
      data: {},
      kerning: {},
    };
  }
  tex.refresh();
  scene.cache.bitmapFont.add(FX_FONT_KEY, {
    data: {
      font: FX_FONT_KEY,
      size: FONT_PX,
      lineHeight: CELL_H,
      retroFont: false,
      chars,
    } as never,
    texture: FX_FONT_KEY,
    frame: null,
  });
}
