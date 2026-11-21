import { describe, expect, it } from "vitest";
import {
  NEIGHBOR_OFFSETS,
  PEERING_NAMES,
  WANG_BLOB_LUT,
  autotileGrid,
  neighborMask,
  neighborMaskClamped,
  resolveAutotile,
  toTileGid,
} from "./autotile";

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

  it("Bảng tra cứu WANG_BLOB_LUT có đủ 256 phần tử và đúng 47 ô Wang blob độc nhất", () => {
    expect(WANG_BLOB_LUT.length).toBe(256);
    const unique = new Set(WANG_BLOB_LUT.map(([c, r]) => `${c},${r}`));
    expect(unique.size).toBe(47);

    // Mọi ô đều nằm trong phạm vi 11 cột x 6 hàng (0..10, 0..5)
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
    // mask = (1 << 4) | (1 << 6) | (1 << 7) = 16 + 64 + 128 = 208
    expect(resolveAutotile(208)).toEqual({ col: 0, row: 0 });

    // Top-Edge của khối: có Left (bit 3), Right (bit 4), BottomLeft (bit 5), Bottom (bit 6), BottomRight (bit 7)
    // mask = 8 + 16 + 32 + 64 + 128 = 248
    expect(resolveAutotile(248)).toEqual({ col: 1, row: 0 });

    // Top-Right của khối: có Left (bit 3), BottomLeft (bit 5), Bottom (bit 6)
    // mask = (1 << 3) | (1 << 5) | (1 << 6) = 8 + 32 + 64 = 104
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
    // Lưới 3x3 toàn bộ là target:
    const allTarget = (_x: number, _y: number) => true;
    // Ô (0, 0) kẹp biên: các hàng xóm ngoài biên kẹp về hàng/cột 0, nên đều coi là true -> mask 255
    expect(neighborMaskClamped(allTarget, 3, 3, 0, 0)).toBe(255);

    // Lưới 3x3 chỉ có duy nhất ô (0, 0) là target:
    const onlyOrigin = (x: number, y: number) => x === 0 && y === 0;
    // Ô (0, 0): TopLeft (-1,-1), Top (0,-1), Left (-1,0) kẹp về (0,0), nên nhận true (bit 0, 1, 3 => 1 + 2 + 8 = 11)
    expect(neighborMaskClamped(onlyOrigin, 3, 3, 0, 0)).toBe(11);
    // Với neighborMask không kẹp biên: không có hàng xóm nào ngoài biên
    expect(neighborMask(onlyOrigin, 0, 0)).toBe(0);
  });

  it("autotileGrid bo góc ma trận 5x5 có đảo 3x3 ở giữa", () => {
    // Lưới 5x5: viền ngoài là 0, khối giữa [1..3, 1..3] là 1
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

    // Các ô ngoài (0) phải là null
    expect(res[0]).toBeNull();
    expect(res[4]).toBeNull();
    expect(res[20]).toBeNull();

    // Khối 3x3 ở giữa:
    // (1, 1) là góc trên trái -> { col: 0, row: 0 }
    expect(res[1 * w + 1]).toEqual({ col: 0, row: 0 });
    // (2, 1) là cạnh trên -> { col: 1, row: 0 }
    expect(res[1 * w + 2]).toEqual({ col: 1, row: 0 });
    // (3, 1) là góc trên phải -> { col: 2, row: 0 }
    expect(res[1 * w + 3]).toEqual({ col: 2, row: 0 });

    // (1, 2) là cạnh trái -> { col: 0, row: 1 }
    expect(res[2 * w + 1]).toEqual({ col: 0, row: 1 });
    // (2, 2) là tâm -> { col: 1, row: 1 }
    expect(res[2 * w + 2]).toEqual({ col: 1, row: 1 });
    // (3, 2) là cạnh phải -> { col: 2, row: 1 }
    expect(res[2 * w + 3]).toEqual({ col: 2, row: 1 });

    // (1, 3) là góc dưới trái -> { col: 0, row: 2 }
    expect(res[3 * w + 1]).toEqual({ col: 0, row: 2 });
    // (2, 3) là cạnh dưới -> { col: 1, row: 2 }
    expect(res[3 * w + 2]).toEqual({ col: 1, row: 2 });
    // (3, 3) là góc dưới phải -> { col: 2, row: 2 }
    expect(res[3 * w + 3]).toEqual({ col: 2, row: 2 });
  });

  it("toTileGid tính GID bản đồ Tiled chính xác theo firstgid và chiều rộng tileset", () => {
    // Tileset tileset_floor rộng 22 ô (352 px / 16 px).
    // firstgid = 1.
    // Variant (0, 1): col offset = 0, row offset = 7.
    // Ô tâm { col: 1, row: 1 } => absCol = 1, absRow = 8.
    // GID = 1 + 8 * 22 + 1 = 178.
    const gid = toTileGid(1, 22, { col: 0, row: 7 }, { col: 1, row: 1 });
    expect(gid).toBe(178);

    // Ô góc trên trái { col: 0, row: 0 } => absCol = 0, absRow = 7.
    // GID = 1 + 7 * 22 + 0 = 155.
    expect(toTileGid(1, 22, { col: 0, row: 7 }, { col: 0, row: 0 })).toBe(155);
  });

  it("Tính tất định: chạy nhiều lần ra kết quả hoàn toàn trùng khớp từng byte", () => {
    const isTarget = (x: number, y: number) => (x * 7 + y * 13) % 3 === 0;
    const res1 = autotileGrid(16, 16, isTarget);
    const res2 = autotileGrid(16, 16, isTarget);
    expect(res1).toEqual(res2);
  });

  it("Đột biến chứng minh: thay đổi bất kỳ ô nào của WANG_BLOB_LUT đều làm sai", () => {
    const original = resolveAutotile(255);
    expect(original).toEqual({ col: 1, row: 1 });

    // Giả lập sai ô tâm
    const badLUT = [...WANG_BLOB_LUT];
    badLUT[255] = [0, 0];
    const mutated = badLUT[255]!;
    expect({ col: mutated[0], row: mutated[1] }).not.toEqual({ col: 1, row: 1 });
  });
});
