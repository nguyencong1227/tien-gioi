/**
 * Sinh trang trí bản đồ TẤT ĐỊNH (M5.3, #332, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 9).
 *
 * Kết quả là một lưới số nguyên, mỗi ô một khung của tileset trang trí (`-1` = không có gì): đưa thẳng vào MỘT lớp
 * tilemap thứ hai (không hàng nghìn sprite, không RenderTexture nặng bộ nhớ), Phaser tự cắt theo camera.
 *
 * Tất định và độc lập thứ tự: quyết định của một ô chỉ phụ thuộc `seed` + `mapId` + toạ độ ô + ô lân cận (băm số
 * nguyên, KHÔNG `Math.random`, KHÔNG trạng thái chạy dần), nên mọi người thấy giống nhau mà không đồng bộ gì, và có thể
 * sinh từng mảng khi cần (`decorAtTile`). Thuần thị giác: không đổi ô, va chạm hay bất cứ thứ gì server biết.
 *
 * Mỗi ô tối đa MỘT trang trí: một lần gieo xúc xắc rồi tra ngưỡng cộng dồn theo thứ tự cố định.
 */
import { T, TILE, type GameMap } from "@tien-gioi/shared";
import { DECOR_KINDS, DECOR_VARIANTS, type DecorKind, type MapStyle } from "./map-style";

/** Giá trị "không có trang trí" trong lưới. */
export const NO_DECOR = -1;

/** Băm số nguyên 32 bit (kiểu murmur / xorshift-multiply): (a, b, c, d) -> [0, 1). Thuần, không trạng thái. */
export function hash01(a: number, b: number, c: number, d: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) ^ Math.imul(c | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 13), 0x165667b1) ^ Math.imul(d | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Băm chuỗi `mapId` thành số nguyên (FNV-1a) để trộn vào hạt giống: hai bản đồ cùng seed vẫn khác nhau. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/** Nhiễu giá trị mượt (ô lưới `cell` ô, nội suy smoothstep) từ băm: dùng để hoa mọc thành đám chứ không rắc đều. */
function smoothNoise(salt: number, seed: number, x: number, y: number, cell: number): number {
  const fx = x / cell;
  const fy = y / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = fx - x0;
  const sy = fy - y0;
  const tx = sx * sx * (3 - 2 * sx);
  const ty = sy * sy * (3 - 2 * sy);
  const v = (i: number, j: number) => hash01(seed, i, j, salt);
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
  const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
  return a + (b - a) * ty;
}

/** Muối băm riêng cho từng việc (tránh hai quyết định tương quan nhau). */
const SALT_ROLL = 0x51;
const SALT_VARIANT = 0x52;
const SALT_MEADOW = 0x53;

/**
 * Hoa mọc ĐÁM: xác suất nhân với hệ số từ nhiễu mượt, từ `MEADOW_FLOOR` (ngoài đám, gần như không có) tới `MEADOW_MAX`
 * (giữa đám), trung bình ~1 nên mật độ khai báo vẫn là mật độ trung bình. Tổng mật độ * `MEADOW_MAX` phải <= 1.
 */
const MEADOW_FLOOR = 0.1;
const MEADOW_MAX = 2;
/** Ô cách cổng / hang trong khoảng này (px, tính từ mép) giữ trống để chỗ đứng đọc rõ. */
const CLEAR_MARGIN = TILE;
/** Cỡ ô nhiễu đám hoa (ô). */
const MEADOW_CELL = 6;

type Tiles = Pick<GameMap, "tiles" | "def" | "portals" | "lairPx" | "townPx">;

/** Ô (x, y) có bất kỳ ô lân cận (8 hướng) thuộc `pred` không (ngoài bản đồ coi là không). */
function nearAny(map: Tiles, x: number, y: number, pred: (t: T) => boolean): boolean {
  const { w, h } = map.def;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (pred(map.tiles[ny * w + nx] as T)) return true;
    }
  }
  return false;
}

/** Ô nằm trong vùng phải để trống (quanh cổng, hang trùm, lòng trấn)? */
function inClearZone(map: Tiles, x: number, y: number): boolean {
  const cx = (x + 0.5) * TILE;
  const cy = (y + 0.5) * TILE;
  for (const p of map.portals)
    if (Math.hypot(cx - p.x, cy - p.y) <= p.r + CLEAR_MARGIN) return true;
  const l = map.lairPx;
  if (l && Math.hypot(cx - l.x, cy - l.y) <= l.r + CLEAR_MARGIN) return true;
  return false;
}

/**
 * Loại trang trí ô này có thể nhận, theo nền và lân cận. Danh sách TRẮNG theo nền: ô chặn / nước / đá lát / cỏ cao
 * không loại nào nhận được nên không cần danh sách đen riêng.
 */
function eligible(map: Tiles, x: number, y: number, t: T, kind: DecorKind): boolean {
  switch (kind) {
    case "tuft":
      return t === T.Grass;
    case "flower":
      return t === T.Grass;
    case "pebble":
      return t === T.Grass || t === T.Dirt || t === T.Sand;
    case "mushroom":
      return t === T.Grass && nearAny(map, x, y, (n) => n === T.Tree);
    case "bush":
      return (
        (t === T.Grass || t === T.Sand) && nearAny(map, x, y, (n) => n === T.Tree || n === T.Water)
      );
  }
}

/**
 * Khung trang trí của MỘT ô (`NO_DECOR` nếu trống). Khung = chỉ số loại * `DECOR_VARIANTS` + biến thể.
 * `mapId` lấy từ `map.def.id` (trộn vào hạt để hai bản đồ cùng seed vẫn khác nhau).
 */
export function decorAtTile(map: Tiles, style: MapStyle, x: number, y: number): number {
  const { w, h, seed } = map.def;
  if (x < 0 || y < 0 || x >= w || y >= h) return NO_DECOR;
  const t = map.tiles[y * w + x] as T;
  if (inClearZone(map, x, y)) return NO_DECOR;
  if (map.townPx.r > 0) {
    const d = Math.hypot((x + 0.5) * TILE - map.townPx.x, (y + 0.5) * TILE - map.townPx.y);
    if (d <= map.townPx.r) return NO_DECOR;
  }
  const s = (seed ^ hashId(map.def.id)) | 0;
  const roll = hash01(s, x, y, SALT_ROLL);
  const n = smoothNoise(SALT_MEADOW, s, x, y, MEADOW_CELL);
  const edge = Math.min(1, Math.max(0, (n - 0.42) / 0.16)); // 0 ngoài đám -> 1 trong đám
  const meadow = MEADOW_FLOOR + (MEADOW_MAX - MEADOW_FLOOR) * edge * edge * (3 - 2 * edge);
  let acc = 0;
  for (let k = 0; k < DECOR_KINDS.length; k++) {
    const kind = DECOR_KINDS[k];
    const base = style.decor.density[kind] ?? 0;
    if (base <= 0) continue;
    if (!eligible(map, x, y, t, kind)) continue;
    acc += kind === "flower" ? base * meadow : base;
    if (roll < acc) {
      const variant = hash01(s, x, y, SALT_VARIANT) < 0.5 ? 0 : 1;
      return k * DECOR_VARIANTS + variant;
    }
  }
  return NO_DECOR;
}

/** Cả lưới trang trí (hàng trước, theo `w * h`): dữ liệu cho lớp tilemap thứ hai. Một lần mỗi lần dựng bản đồ. */
export function buildDecorGrid(map: Tiles, style: MapStyle): Int8Array {
  const { w, h } = map.def;
  const grid = new Int8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) grid[y * w + x] = decorAtTile(map, style, x, y);
  return grid;
}

/** Số trang trí mỗi loại (cho test / lớp phủ `?perf=1`). */
export function decorCounts(grid: Int8Array): Record<DecorKind, number> {
  const out = { tuft: 0, flower: 0, pebble: 0, mushroom: 0, bush: 0 } as Record<DecorKind, number>;
  for (let i = 0; i < grid.length; i++) {
    const f = grid[i];
    if (f !== NO_DECOR) out[DECOR_KINDS[Math.floor(f / DECOR_VARIANTS)]]++;
  }
  return out;
}
