/**
 * Mặt nước lấp lánh theo bản đồ (M5.3, #332 bước 2e, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 9).
 *
 * Thiết kế gốc nói "một TileSprite cuộn", nhưng TileSprite phủ cả bản đồ thì phải cắt theo ô nước (mặt nạ hình học vẽ hàng nghìn
 * ô, đắt hơn nhiều). Cách làm thay thế rẻ hơn: MỘT lớp tilemap chỉ gồm các ô nước, tileset là một canvas nhỏ (4 biến thể 32x32 =
 * 128x32) có các đốm sáng, vẽ lại ~4 lần/giây với đốm TRÔI theo `style.water.speed`; mỗi ô chọn biến thể theo băm của toạ độ nên
 * không thành hoa văn lặp. Cùng một lớp tilemap thì Phaser tự cắt theo camera, không thêm đối tượng nào.
 *
 * Phần THUẦN (`waterGrid`, `shimmerSpots`, `shimmerPhaseKey`: test không cần Phaser) + `ensureWaterTexture` / `drawShimmer`.
 */
import type Phaser from "phaser";
import { T, TILE, type GameMap } from "@tien-gioi/shared";
import { hash01, hashId } from "./map-decor";
import type { MapStyle } from "./map-style";

export const WATER_KEY = "water-shimmer";
export const WATER_VARIANTS = 4;
/** Chu kỳ vẽ lại đốm sáng (ms): 4 lần/giây là đủ thấy lấp lánh, rẻ hơn nhiều so với mỗi khung. */
export const WATER_STEP_MS = 250;
/** Số đốm mỗi ô. */
export const WATER_SPOTS = 3;
/** Độ đục đỉnh của đốm = `style.water.alpha` nhân hệ số này (đốm chỉ 1-2 điểm ảnh nên cần đậm hơn lớp phủ). */
export const WATER_GAIN = 3.2;

export const NO_WATER = -1;

type Tiles = Pick<GameMap, "tiles" | "def">;

/** Lưới biến thể mặt nước: ô nước -> 0..WATER_VARIANTS-1 (băm theo `seed` + `mapId` + toạ độ), ô khác -> NO_WATER. */
export function waterGrid(map: Tiles): Int8Array {
  const { w, h, seed } = map.def;
  const s = (seed ^ hashId(map.def.id)) | 0;
  const grid = new Int8Array(w * h).fill(NO_WATER);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (map.tiles[y * w + x] === T.Water)
        grid[y * w + x] = Math.min(
          WATER_VARIANTS - 1,
          Math.floor(hash01(s, x, y, 0x71) * WATER_VARIANTS),
        );
  return grid;
}

export interface Spot {
  x: number;
  y: number;
  w: number;
  /** Độ đục 0..1 (đã nhấp nháy theo thời gian). */
  a: number;
}

/**
 * Các đốm sáng của MỘT biến thể tại thời điểm `tMs`: mỗi đốm có vị trí đầu, hàng và pha riêng (băm theo biến thể + chỉ số), trôi
 * sang phải `speed` px/s (cuốn vòng trong 32 px) và nhấp nháy độ đục theo hình sin. Thuần, tất định theo (variant, tMs, speed).
 */
export function shimmerSpots(variant: number, tMs: number, speed: number): Spot[] {
  if (![variant, tMs, speed].every(Number.isFinite)) return [];
  const out: Spot[] = [];
  for (let i = 0; i < WATER_SPOTS; i++) {
    const x0 = hash01(variant, i, 1, 0x72) * TILE;
    const row = 3 + Math.floor(hash01(variant, i, 2, 0x72) * (TILE - 8));
    const phase = hash01(variant, i, 3, 0x72);
    const w = 2 + Math.floor(hash01(variant, i, 4, 0x72) * 3); // 2..4 điểm ảnh
    const x = (((x0 + (speed * tMs) / 1000) % TILE) + TILE) % TILE;
    const a = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (tMs / 1800 + phase)));
    out.push({ x: Math.floor(x), y: row, w: Math.min(w, TILE - Math.floor(x)), a });
  }
  return out;
}

/** Khoá "đã vẽ pha nào": các lần gọi trong cùng một bước `WATER_STEP_MS` cho cùng khoá nên không vẽ lại. Giảm chuyển động: luôn pha 0. */
export function shimmerPhaseKey(nowMs: number, still: boolean): number {
  if (still || !Number.isFinite(nowMs) || nowMs < 0) return 0;
  return Math.floor(nowMs / WATER_STEP_MS);
}

/** `rgba(r,g,b,a)` từ màu 0xRRGGBB. */
const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Dựng (một lần) texture 128x32 và trả về. */
export function ensureWaterTexture(scene: Phaser.Scene): Phaser.Textures.CanvasTexture {
  const ex = scene.textures.exists(WATER_KEY)
    ? (scene.textures.get(WATER_KEY) as Phaser.Textures.CanvasTexture)
    : null;
  return ex ?? scene.textures.createCanvas(WATER_KEY, TILE * WATER_VARIANTS, TILE)!;
}

/** Vẽ lại các đốm sáng của cả 4 biến thể ở thời điểm `tMs` theo màu / độ đục / tốc độ của kiểu bản đồ. */
export function drawShimmer(
  tex: Phaser.Textures.CanvasTexture,
  style: MapStyle,
  tMs: number,
): void {
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, TILE * WATER_VARIANTS, TILE);
  const peak = Math.min(1, style.water.alpha * WATER_GAIN);
  for (let v = 0; v < WATER_VARIANTS; v++)
    for (const sp of shimmerSpots(v, tMs, style.water.speed)) {
      ctx.fillStyle = rgba(style.water.shimmer, sp.a * peak);
      ctx.fillRect(v * TILE + sp.x, sp.y, sp.w, 1);
    }
  tex.refresh();
}
