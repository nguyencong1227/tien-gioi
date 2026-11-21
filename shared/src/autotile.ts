// Ghép góc tự động (autotile Wang blob 47/56 ô) dùng chung cho client và server (mục 62 giai đoạn 1 & 2).
// Hợp đồng giữa client (vẽ nền bo góc, Phase 1 / S3) và server công cụ (`map:build`, S4 #1207).
//
// Mô hình: 8 hướng hàng xóm (3x3 Wang minimal / Godot terrain peering bits).
// 2^8 = 256 tổ hợp mặt nạ hàng xóm được ánh xạ tất định về 47 trạng thái Wang blob chuẩn
// (tương ứng với 49 ô địa hình đích trong khối 11 cột x 7 hàng của tileset_floor, Ninja Adventure CC0).

/**
 * 8 hướng hàng xóm theo thứ tự bitmask:
 * Bit 0: TopLeft     (-1, -1)
 * Bit 1: Top         ( 0, -1)
 * Bit 2: TopRight    ( 1, -1)
 * Bit 3: Left        (-1,  0)
 * Bit 4: Right       ( 1,  0)
 * Bit 5: BottomLeft  (-1,  1)
 * Bit 6: Bottom      ( 0,  1)
 * Bit 7: BottomRight ( 1,  1)
 */
export const NEIGHBOR_OFFSETS: readonly (readonly [dx: number, dy: number])[] = [
  [-1, -1], // 0: TopLeft
  [0, -1], // 1: Top
  [1, -1], // 2: TopRight
  [-1, 0], // 3: Left
  [1, 0], // 4: Right
  [-1, 1], // 5: BottomLeft
  [0, 1], // 6: Bottom
  [1, 1], // 7: BottomRight
] as const;

export const PEERING_NAMES = [
  "top_left_corner",
  "top_side",
  "top_right_corner",
  "left_side",
  "right_side",
  "bottom_left_corner",
  "bottom_side",
  "bottom_right_corner",
] as const;

export type PeeringName = (typeof PEERING_NAMES)[number];

/** Toạ độ ô cục bộ trong khối terrain 11 cột x 7 hàng (col: 0..10, row: 0..5) */
export interface AutotileCoord {
  col: number;
  row: number;
}

/**
 * Chuẩn hoá mặt nạ 8 hướng theo quy tắc Wang Blob 47 ô (3x3 minimal):
 * Một bit góc (TopLeft, TopRight, BottomLeft, BottomRight) CHỈ có hiệu lực
 * khi CẢ HAI cạnh kề trực giao tương ứng đều là địa hình đích (bật = 1).
 * Nếu thiếu một trong hai cạnh kề, góc chéo đó không thể nối liền với ô tâm
 * và được chuẩn hoá về 0 để tránh chọn sai ô biên (chống rách mép / lộ khe).
 */
export function canonicalMask(mask: number): number {
  const m = mask & 0xff;
  const has = (i: number) => (m >> i) & 1;
  // 4 cạnh trực giao: Top (bit 1), Left (bit 3), Right (bit 4), Bottom (bit 6)
  let c = m & 0b01011010;
  if (has(0) && has(1) && has(3)) c |= 1; // TopLeft cần Top + Left
  if (has(2) && has(1) && has(4)) c |= 4; // TopRight cần Top + Right
  if (has(5) && has(6) && has(3)) c |= 32; // BottomLeft cần Bottom + Left
  if (has(7) && has(6) && has(4)) c |= 128; // BottomRight cần Bottom + Right
  return c;
}

/**
 * Bảng tra 256 tổ hợp hàng xóm -> toạ độ ô [col, row] trong khối 11 cột của tileset.
 * Mỗi mục thứ `m` (0..255) được chuẩn hoá sẵn theo `canonicalMask(m)`, khớp 100%
 * với 47 trạng thái Wang blob chuẩn từ định nghĩa terrain của Godot tileset.tres (Ninja Adventure).
 */
export const WANG_BLOB_LUT: readonly (readonly [col: number, row: number])[] = [
  [3, 3],
  [3, 3],
  [3, 2],
  [3, 2],
  [3, 3],
  [3, 3],
  [3, 2],
  [3, 2],
  [2, 3],
  [2, 3],
  [7, 3],
  [2, 2],
  [2, 3],
  [2, 3],
  [7, 3],
  [2, 2], // 0..15
  [0, 3],
  [0, 3],
  [4, 3],
  [4, 3],
  [0, 3],
  [0, 3],
  [0, 2],
  [0, 2],
  [1, 3],
  [1, 3],
  [8, 3],
  [5, 3],
  [1, 3],
  [1, 3],
  [6, 3],
  [1, 2], // 16..31
  [3, 3],
  [3, 3],
  [3, 2],
  [3, 2],
  [3, 3],
  [3, 3],
  [3, 2],
  [3, 2],
  [2, 3],
  [2, 3],
  [7, 3],
  [2, 2],
  [2, 3],
  [2, 3],
  [7, 3],
  [2, 2], // 32..47
  [0, 3],
  [0, 3],
  [4, 3],
  [4, 3],
  [0, 3],
  [0, 3],
  [0, 2],
  [0, 2],
  [1, 3],
  [1, 3],
  [8, 3],
  [5, 3],
  [1, 3],
  [1, 3],
  [6, 3],
  [1, 2], // 48..63
  [3, 0],
  [3, 0],
  [3, 1],
  [3, 1],
  [3, 0],
  [3, 0],
  [3, 1],
  [3, 1],
  [7, 0],
  [7, 0],
  [7, 4],
  [7, 1],
  [7, 0],
  [7, 0],
  [7, 4],
  [7, 1], // 64..79
  [4, 0],
  [4, 0],
  [4, 4],
  [4, 4],
  [4, 0],
  [4, 0],
  [4, 1],
  [4, 1],
  [8, 0],
  [8, 0],
  [8, 4],
  [10, 3],
  [8, 0],
  [8, 0],
  [9, 3],
  [8, 1], // 80..95
  [3, 0],
  [3, 0],
  [3, 1],
  [3, 1],
  [3, 0],
  [3, 0],
  [3, 1],
  [3, 1],
  [2, 0],
  [2, 0],
  [7, 2],
  [2, 1],
  [2, 0],
  [2, 0],
  [7, 2],
  [2, 1], // 96..111
  [4, 0],
  [4, 0],
  [4, 4],
  [4, 4],
  [4, 0],
  [4, 0],
  [4, 1],
  [4, 1],
  [5, 0],
  [5, 0],
  [10, 2],
  [5, 4],
  [5, 0],
  [5, 0],
  [9, 1],
  [5, 1], // 112..127
  [3, 3],
  [3, 3],
  [3, 2],
  [3, 2],
  [3, 3],
  [3, 3],
  [3, 2],
  [3, 2],
  [2, 3],
  [2, 3],
  [7, 3],
  [2, 2],
  [2, 3],
  [2, 3],
  [7, 3],
  [2, 2], // 128..143
  [0, 3],
  [0, 3],
  [4, 3],
  [4, 3],
  [0, 3],
  [0, 3],
  [0, 2],
  [0, 2],
  [1, 3],
  [1, 3],
  [8, 3],
  [5, 3],
  [1, 3],
  [1, 3],
  [6, 3],
  [1, 2], // 144..159
  [3, 3],
  [3, 3],
  [3, 2],
  [3, 2],
  [3, 3],
  [3, 3],
  [3, 2],
  [3, 2],
  [2, 3],
  [2, 3],
  [7, 3],
  [2, 2],
  [2, 3],
  [2, 3],
  [7, 3],
  [2, 2], // 160..175
  [0, 3],
  [0, 3],
  [4, 3],
  [4, 3],
  [0, 3],
  [0, 3],
  [0, 2],
  [0, 2],
  [1, 3],
  [1, 3],
  [8, 3],
  [5, 3],
  [1, 3],
  [1, 3],
  [6, 3],
  [1, 2], // 176..191
  [3, 0],
  [3, 0],
  [3, 1],
  [3, 1],
  [3, 0],
  [3, 0],
  [3, 1],
  [3, 1],
  [7, 0],
  [7, 0],
  [7, 4],
  [7, 1],
  [7, 0],
  [7, 0],
  [7, 4],
  [7, 1], // 192..207
  [0, 0],
  [0, 0],
  [4, 2],
  [4, 2],
  [0, 0],
  [0, 0],
  [0, 1],
  [0, 1],
  [6, 0],
  [6, 0],
  [9, 2],
  [9, 0],
  [6, 0],
  [6, 0],
  [6, 4],
  [6, 1], // 208..223
  [3, 0],
  [3, 0],
  [3, 1],
  [3, 1],
  [3, 0],
  [3, 0],
  [3, 1],
  [3, 1],
  [2, 0],
  [2, 0],
  [7, 2],
  [2, 1],
  [2, 0],
  [2, 0],
  [7, 2],
  [2, 1], // 224..239
  [0, 0],
  [0, 0],
  [4, 2],
  [4, 2],
  [0, 0],
  [0, 0],
  [0, 1],
  [0, 1],
  [1, 0],
  [1, 0],
  [8, 2],
  [5, 2],
  [1, 0],
  [1, 0],
  [6, 2],
  [1, 1], // 240..255
] as const;

/** Tra cứu toạ độ ô bo góc từ mặt nạ 8 bit hàng xóm (0..255) */
export function resolveAutotile(mask: number): AutotileCoord {
  const c = canonicalMask(mask);
  const entry = WANG_BLOB_LUT[c]!;
  return { col: entry[0], row: entry[1] };
}

/**
 * Tính mặt nạ 8 bit từ hàm kiểm tra ô hàng xóm.
 * @param isMatch Hàm kiểm tra ô (x, y) có cùng loại địa hình mục tiêu không
 * @param x Toạ độ x của ô đang xét
 * @param y Toạ độ y của ô đang xét
 */
export function neighborMask(
  isMatch: (x: number, y: number) => boolean,
  x: number,
  y: number,
): number {
  let mask = 0;
  for (let i = 0; i < 8; i++) {
    const off = NEIGHBOR_OFFSETS[i]!;
    if (isMatch(x + off[0], y + off[1])) {
      mask |= 1 << i;
    }
  }
  return mask;
}

/**
 * Tính mặt nạ 8 bit trên lưới phẳng 2D có kẹp biên (clamp to edge),
 * hành vi đồng nhất với `mau-huong-moi.py`.
 */
export function neighborMaskClamped(
  isMatch: (x: number, y: number) => boolean,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  let mask = 0;
  for (let i = 0; i < 8; i++) {
    const off = NEIGHBOR_OFFSETS[i]!;
    const nx = Math.max(0, Math.min(w - 1, x + off[0]));
    const ny = Math.max(0, Math.min(h - 1, y + off[1]));
    if (isMatch(nx, ny)) {
      mask |= 1 << i;
    }
  }
  return mask;
}

/**
 * Ghép góc một ma trận boolean / nhị phân thành mảng toạ độ ô cục bộ.
 * CHÚ Ý: Hàm này CHỈ sinh ô cho các vị trí là địa hình đích (49 ô tâm `dirt` / đất / nước).
 * Các vị trí trả về `null` là ô không thuộc địa hình đích; nền cỏ (hoặc địa hình nền bên dưới)
 * do nơi gọi tự vẽ hoặc xử lý ở lớp nền cơ sở.
 *
 * @param w Chiều rộng lưới
 * @param h Chiều cao lưới
 * @param isTarget Hàm kiểm tra ô (x, y) có phải địa hình cần bo góc không
 * @returns Mảng `AutotileCoord` đúng kích thước `w * h` (null cho ô không thuộc địa hình)
 */
export function autotileGrid(
  w: number,
  h: number,
  isTarget: (x: number, y: number) => boolean,
): (AutotileCoord | null)[] {
  const out = new Array<AutotileCoord | null>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!isTarget(x, y)) {
        out[idx] = null;
        continue;
      }
      const mask = neighborMaskClamped(isTarget, w, h, x, y);
      out[idx] = resolveAutotile(mask);
    }
  }
  return out;
}

/**
 * Tính tile ID tuyệt đối trong một tileset Tiled từ toạ độ cục bộ và cấu hình variant.
 * @param firstgid GID đầu tiên của tileset trong bản đồ Tiled
 * @param tilesetWidthInTiles Chiều rộng của ảnh tileset tính bằng ô (ví dụ 22 ô cho tileset_floor)
 * @param variantOffset Cột và hàng bắt đầu của khối địa hình (ví dụ variant (0, 1) là col 0, row 7)
 * @param coord Toạ độ cục bộ trong khối (col: 0..10, row: 0..5)
 */
export function toTileGid(
  firstgid: number,
  tilesetWidthInTiles: number,
  variantOffset: { col: number; row: number },
  coord: AutotileCoord,
): number {
  const absCol = variantOffset.col + coord.col;
  const absRow = variantOffset.row + coord.row;
  return firstgid + absRow * tilesetWidthInTiles + absCol;
}
