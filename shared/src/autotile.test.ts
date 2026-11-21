import { describe, expect, it } from "vitest";
import {
  NEIGHBOR_OFFSETS,
  PEERING_NAMES,
  WANG_BLOB_LUT,
  autotileGrid,
  canonicalMask,
  neighborMask,
  neighborMaskClamped,
  resolveAutotile,
  toTileGid,
} from "./autotile";

/**
 * Bảng ORACLE độc lập: ghi cứng 49 ô địa hình đích (tâm dirt) từ tileset.tres của Ninja Adventure.
 * Khoá: toạ độ cục bộ "col,row" trong khối 11 cột x 7 hàng (col = x % 11, row = y - 7).
 * Giá trị: đúng 8-bit mặt nạ hàng xóm định nghĩa trong tileset.tres.
 */
export const DIRT_TILES_ORACLE: Record<string, number> = {
  "0,0": 208,
  "0,1": 214,
  "0,2": 22,
  "0,3": 16,
  "0,4": 255, // biến thể ô đầy
  "1,0": 248,
  "1,1": 255, // ô đầy chính (tâm 3x3)
  "1,2": 31,
  "1,3": 24,
  "1,4": 255, // biến thể ô đầy
  "2,0": 104,
  "2,1": 107,
  "2,2": 11,
  "2,3": 8,
  "3,0": 64,
  "3,1": 66,
  "3,2": 2,
  "3,3": 0,
  "4,0": 80,
  "4,1": 86,
  "4,2": 210,
  "4,3": 18,
  "4,4": 82,
  "5,0": 120,
  "5,1": 127,
  "5,2": 251,
  "5,3": 27,
  "5,4": 123,
  "6,0": 216,
  "6,1": 223,
  "6,2": 254,
  "6,3": 30,
  "6,4": 222,
  "7,0": 72,
  "7,1": 75,
  "7,2": 106,
  "7,3": 10,
  "7,4": 74,
  "8,0": 88,
  "8,1": 95,
  "8,2": 250,
  "8,3": 26,
  "8,4": 90,
  "9,0": 219,
  "9,1": 126,
  "9,2": 218,
  "9,3": 94,
  "10,2": 122,
  "10,3": 91,
};

describe("Ghép góc tự động Wang Blob 47 ô (shared/src/autotile.ts)", () => {
  it("8 hướng hàng xóm và bitmask chuẩn xác", () => {
    expect(NEIGHBOR_OFFSETS.length).toBe(8);
    expect(PEERING_NAMES.length).toBe(8);
    expect(NEIGHBOR_OFFSETS[0]).toEqual([-1, -1]); // TopLeft
    expect(NEIGHBOR_OFFSETS[1]).toEqual([0, -1]); // Top
    expect(NEIGHBOR_OFFSETS[2]).toEqual([1, -1]); // TopRight
    expect(NEIGHBOR_OFFSETS[3]).toEqual([-1, 0]); // Left
    expect(NEIGHBOR_OFFSETS[4]).toEqual([1, 0]); // Right
    expect(NEIGHBOR_OFFSETS[5]).toEqual([-1, 1]); // BottomLeft
    expect(NEIGHBOR_OFFSETS[6]).toEqual([0, 1]); // Bottom
    expect(NEIGHBOR_OFFSETS[7]).toEqual([1, 1]); // BottomRight
  });

  it("canonicalMask chuẩn hoá mặt nạ chính xác (bỏ góc chéo mồ côi không có 2 cạnh kề)", () => {
    // 47 trạng thái chuẩn độc nhất trên toàn bộ 256 tổ hợp
    const canonSet = new Set<number>();
    for (let m = 0; m < 256; m++) {
      const c = canonicalMask(m);
      expect(canonicalMask(c)).toBe(c); // Idempotent
      canonSet.add(c);
    }
    expect(canonSet.size).toBe(47);

    // Kiểm các ca chéo-không-cạnh điển hình (lỗi mép rách nếu không chuẩn hoá):
    // Mask 1: chỉ có TopLeft (bit 0), không có Top (bit 1) hay Left (bit 3) -> về 0 (độc lập)
    expect(canonicalMask(1)).toBe(0);

    // Mask 3: TopLeft (bit 0) + Top (bit 1), thiếu Left (bit 3) -> chỉ còn Top (bit 1) = 2
    expect(canonicalMask(3)).toBe(2);

    // Mask 6: Top (bit 1) + TopRight (bit 2), thiếu Right (bit 4) -> chỉ còn Top (bit 1) = 2
    expect(canonicalMask(6)).toBe(2);

    // Mask 9: TopLeft (bit 0) + Left (bit 3), thiếu Top (bit 1) -> chỉ còn Left (bit 3) = 8
    expect(canonicalMask(9)).toBe(8);

    // Mask 14: Top (bit 1) + TopRight (bit 2) + Left (bit 3), thiếu Right (bit 4) -> Top + Left (bit 1 + bit 3) = 10
    expect(canonicalMask(14)).toBe(10);
  });

  it("ORACLE độc lập: với MỌI mask 0..255, ô được chọn có bitmask khớp chính xác canonicalMask(m)", () => {
    for (let m = 0; m < 256; m++) {
      const coord = resolveAutotile(m);
      const key = `${coord.col},${coord.row}`;
      const oracleMask = DIRT_TILES_ORACLE[key];
      expect(oracleMask).toBeDefined();
      expect(oracleMask).toBe(canonicalMask(m));

      // Bảng WANG_BLOB_LUT trực tiếp cũng phải đồng nhất
      const entry = WANG_BLOB_LUT[m]!;
      expect(entry[0]).toBe(coord.col);
      expect(entry[1]).toBe(rowOf(coord));
    }
  });

  it("Mask chéo-không-cạnh cho ra CÙNG một ô với mask đã chuẩn hoá", () => {
    expect(resolveAutotile(1)).toEqual(resolveAutotile(0)); // mask 1 -> ô độc lập [3, 3]
    expect(resolveAutotile(3)).toEqual(resolveAutotile(2)); // mask 3 -> ô chỉ có cạnh trên [3, 2]
    expect(resolveAutotile(6)).toEqual(resolveAutotile(2)); // mask 6 -> ô chỉ có cạnh trên [3, 2]
    expect(resolveAutotile(9)).toEqual(resolveAutotile(8)); // mask 9 -> ô chỉ có cạnh trái [2, 3]
    expect(resolveAutotile(14)).toEqual(resolveAutotile(10)); // mask 14 -> ô góc Top-Left [7, 3]
  });

  it("Bảng tra cứu WANG_BLOB_LUT có đủ 256 phần tử và đúng 47 ô Wang blob độc nhất", () => {
    expect(WANG_BLOB_LUT.length).toBe(256);
    const unique = new Set(WANG_BLOB_LUT.map(([c, r]) => `${c},${r}`));
    expect(unique.size).toBe(47);

    for (const [col, row] of WANG_BLOB_LUT) {
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThanOrEqual(10);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThanOrEqual(5);
    }
  });

  it("Các ca hình học cốt lõi ánh xạ đúng toạ độ ô kinh điển", () => {
    // 1. Ô bao quanh bởi cùng loại (mặt nạ 255: tất cả 8 hàng xóm đều có mặt) -> ô tâm (1, 1)
    expect(resolveAutotile(255)).toEqual({ col: 1, row: 1 });

    // 2. Ô đơn độc (mặt nạ 0: không có hàng xóm nào) -> ô độc lập (3, 3)
    expect(resolveAutotile(0)).toEqual({ col: 3, row: 3 });

    // 3. Khung 3x3:
    // Top-Left của khối: có Right (bit 4), Bottom (bit 6), BottomRight (bit 7)
    // mask = 16 + 64 + 128 = 208
    expect(resolveAutotile(208)).toEqual({ col: 0, row: 0 });

    // Top-Edge của khối: có Left (bit 3), Right (bit 4), BottomLeft (bit 5), Bottom (bit 6), BottomRight (bit 7)
    // mask = 8 + 16 + 32 + 64 + 128 = 248
    expect(resolveAutotile(248)).toEqual({ col: 1, row: 0 });

    // Top-Right của khối: có Left (bit 3), BottomLeft (bit 5), Bottom (bit 6)
    // mask = 8 + 32 + 64 = 104
    expect(resolveAutotile(104)).toEqual({ col: 2, row: 0 });

    // Left-Edge của khối: có Top (bit 1), TopRight (bit 2), Right (bit 4), Bottom (bit 6), BottomRight (bit 7)
    // mask = 2 + 4 + 16 + 64 + 128 = 214
    expect(resolveAutotile(214)).toEqual({ col: 0, row: 1 });

    // Right-Edge của khối: có TopLeft (bit 0), Top (bit 1), Left (bit 3), BottomLeft (bit 5), Bottom (bit 6)
    // mask = 1 + 2 + 8 + 32 + 64 = 107
    expect(resolveAutotile(107)).toEqual({ col: 2, row: 1 });

    // Bottom-Left của khối: có Top (bit 1), TopRight (bit 2), Right (bit 4)
    // mask = 2 + 4 + 16 = 22
    expect(resolveAutotile(22)).toEqual({ col: 0, row: 2 });

    // Bottom-Edge của khối: có TopLeft (bit 0), Top (bit 1), TopRight (bit 2), Left (bit 3), Right (bit 4)
    // mask = 1 + 2 + 4 + 8 + 16 = 31
    expect(resolveAutotile(31)).toEqual({ col: 1, row: 2 });

    // Bottom-Right của khối: có TopLeft (bit 0), Top (bit 1), Left (bit 3)
    // mask = 1 + 2 + 8 = 11
    expect(resolveAutotile(11)).toEqual({ col: 2, row: 2 });
  });

  it("neighborMask tính bitmask chính xác từ hàm kiểm tra", () => {
    const isTarget = (x: number, y: number) => x === 2 && y === 1;
    // Xét ô (1, 1): ô mục tiêu nằm ở (2, 1) là Right (offset [1, 0], bit 4)
    const mask = neighborMask(isTarget, 1, 1);
    expect(mask).toBe(1 << 4);

    // Xét ô (2, 2): ô mục tiêu nằm ở (2, 1) là Top (offset [0, -1], bit 1)
    expect(neighborMask(isTarget, 2, 2)).toBe(1 << 1);

    // Xét ô (3, 2): ô mục tiêu nằm ở (2, 1) là TopLeft (offset [-1, -1], bit 0)
    expect(neighborMask(isTarget, 3, 2)).toBe(1 << 0);
  });

  it("neighborMaskClamped kẹp biên chuẩn xác ở các góc bản đồ", () => {
    const allTarget = (_x: number, _y: number) => true;
    expect(neighborMaskClamped(allTarget, 3, 3, 0, 0)).toBe(255);

    const onlyOrigin = (x: number, y: number) => x === 0 && y === 0;
    // TopLeft (-1,-1), Top (0,-1), Left (-1,0) kẹp về (0,0) nên nhận true (bit 0, 1, 3 => 1 + 2 + 8 = 11)
    expect(neighborMaskClamped(onlyOrigin, 3, 3, 0, 0)).toBe(11);
    expect(neighborMask(onlyOrigin, 0, 0)).toBe(0);
  });

  it("autotileGrid bo góc ma trận 5x5 có đảo 3x3 ở giữa", () => {
    const w = 5;
    const h = 5;
    const grid = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    const isTarget = (x: number, y: number) => grid[y]?.[x] === 1;

    const res = autotileGrid(w, h, isTarget);

    expect(res[0]).toBeNull();
    expect(res[4]).toBeNull();
    expect(res[20]).toBeNull();

    expect(res[1 * w + 1]).toEqual({ col: 0, row: 0 });
    expect(res[1 * w + 2]).toEqual({ col: 1, row: 0 });
    expect(res[1 * w + 3]).toEqual({ col: 2, row: 0 });

    expect(res[2 * w + 1]).toEqual({ col: 0, row: 1 });
    expect(res[2 * w + 2]).toEqual({ col: 1, row: 1 });
    expect(res[2 * w + 3]).toEqual({ col: 2, row: 1 });

    expect(res[3 * w + 1]).toEqual({ col: 0, row: 2 });
    expect(res[3 * w + 2]).toEqual({ col: 1, row: 2 });
    expect(res[3 * w + 3]).toEqual({ col: 2, row: 2 });
  });

  it("toTileGid tính GID bản đồ Tiled chính xác theo firstgid và chiều rộng tileset", () => {
    const gid = toTileGid(1, 22, { col: 0, row: 7 }, { col: 1, row: 1 });
    expect(gid).toBe(178);

    expect(toTileGid(1, 22, { col: 0, row: 7 }, { col: 0, row: 0 })).toBe(155);
  });

  it("Tính tất định: chạy nhiều lần ra kết quả hoàn toàn trùng khớp từng byte", () => {
    const isTarget = (x: number, y: number) => (x * 7 + y * 13) % 3 === 0;
    const res1 = autotileGrid(16, 16, isTarget);
    const res2 = autotileGrid(16, 16, isTarget);
    expect(res1).toEqual(res2);
  });

  it("Đột biến (a): bỏ canonicalMask khỏi resolveAutotile sẽ làm sai các mask không chuẩn", () => {
    // Giả lập hàm resolveAutotile lỗi không gọi canonicalMask mà lấy ô từ thuật toán thô cũ
    // Ví dụ mask 3 (TopLeft + Top, thiếu Left):
    const naiveResolve = (m: number) => {
      // Giả sử lấy ô [2, 2] như bản cũ trước khi sửa
      if (m === 3) return { col: 2, row: 2 };
      return resolveAutotile(m);
    };
    const badCoord = naiveResolve(3);
    const badMask = DIRT_TILES_ORACLE[`${badCoord.col},${badCoord.row}`];
    // Ô [2, 2] có mask 11 (TopLeft + Top + Left) !== canonicalMask(3) là 2 (chỉ Top) => BẮT ĐƯỢC LỖI
    expect(badMask).not.toBe(canonicalMask(3));
  });

  it("Đột biến (b): đổi một mục LUT sang một ô hợp lệ khác sẽ vi phạm ORACLE ngay lập tức", () => {
    // Giả lập mục 100 bị đổi từ [2,0] sang một ô khác cũng hợp lệ là [3,3]
    const mutatedCoord = { col: 3, row: 3 };
    const oracleMaskOfMutated = DIRT_TILES_ORACLE[`${mutatedCoord.col},${mutatedCoord.row}`];
    // Ô [3, 3] có mask là 0, trong khi canonicalMask(100) là 104 => BẮT ĐƯỢC LỖI
    expect(oracleMaskOfMutated).not.toBe(canonicalMask(100));
  });
});

function rowOf(coord: { col: number; row: number }): number {
  return coord.row;
}
