// Quy tắc & giải thuật phân tích lớp hình cho bản đồ Tiled (Tiled S4b, Issue #1222).
// Xử lý 3 bài toán lớp hình đo được từ 4 bản đồ thật (Lạc Hà, Hắc Phong, Âm Sương, Hàn Vân):
//   1. Xếp cây thành khối: loại bỏ tán cây (over) đè lên thân cây khác (decor).
//   2. Dải cát rộng 1 ô: phát hiện và phân loại dải cát hẹp để dùng viền riêng hoặc mở rộng hình ảnh.
//   3. Lớp nền cỏ đáy: phát hiện các ô tiếp giáp Cát - Nước cần lớp nền cỏ bên dưới.

import { T } from "@tien-gioi/shared";

/** Kết quả phân tích độ đè tán cây */
export interface TreeOverlapAnalysis {
  /** Tổng số ô T.Tree trên bản đồ */
  totalTrees: number;
  /** Số ô cây có tán của cây bên dưới đè lên thân của nó */
  overlapCount: number;
  /** Tỷ lệ đè tán (overlapCount / totalTrees) */
  overlapRate: number;
  /** Chỉ số các ô bị đè tán (y * width + x) */
  overlapIndices: number[];
}

/**
 * Phân tích số lượng ô cây mà tán cây ở hàng dưới đè lên thân cây của hàng trên.
 * Một ô (x, y) bị đè tán khi:
 *   - Bản thân ô (x, y) là T.Tree (có thân cây ở lớp decor)
 *   - Ô bên dưới (x, y + 1) cũng là T.Tree (đặt tán cây ở lớp over tại (x, y))
 */
export function analyzeTreeCanopyOverlaps(
  tiles: Uint8Array,
  width: number,
  height: number,
): TreeOverlapAnalysis {
  let totalTrees = 0;
  const overlapIndices: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (tiles[idx] === T.Tree) {
        totalTrees++;
        // Kiểm tra xem ô phía dưới có phải là Tree không
        if (y + 1 < height && tiles[(y + 1) * width + x] === T.Tree) {
          overlapIndices.push(idx);
        }
      }
    }
  }

  const overlapCount = overlapIndices.length;
  const overlapRate = totalTrees > 0 ? overlapCount / totalTrees : 0;

  return {
    totalTrees,
    overlapCount,
    overlapRate,
    overlapIndices,
  };
}

/** Chế độ xếp tán cây */
export type TreeCanopyMode = "legacy" | "cluster_top";

/**
 * Xác định ma trận vị trí đặt tán cây (over) cho bản đồ.
 * - "legacy": Mọi cây ở (x, y) đều cố đặt tán ở (x, y - 1) bất kể ô (x, y - 1) là gì.
 * - "cluster_top": Chỉ các cây ở rìa trên của khối rừng (ô (x, y - 1) KHÔNG phải là T.Tree)
 *   mới vươn tán lên hàng trên. Nhờ đó, trong nội bộ cụm cây thân cây không bị tán đè lên,
 *   đưa tỷ lệ tán đè thân về 0%.
 */
export function resolveTreeCanopies(
  tiles: Uint8Array,
  width: number,
  height: number,
  mode: TreeCanopyMode = "cluster_top",
): Uint8Array {
  const over = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (tiles[idx] === T.Tree) {
        // Cây ở (x, y) có tán ở (x, y - 1)
        if (y > 0) {
          const topIdx = (y - 1) * width + x;
          if (mode === "legacy") {
            over[topIdx] = 1;
          } else {
            // cluster_top: Chỉ đặt tán nếu ô phía trên KHÔNG phải là Tree
            // (tránh đè lên thân cây của cây phía trên)
            if (tiles[topIdx] !== T.Tree) {
              over[topIdx] = 1;
            }
          }
        }
      }
    }
  }

  return over;
}

/** Phân loại dải cát hẹp */
export type NarrowSandDirection = "horizontal" | "vertical" | "isolated";

export interface NarrowSandCell {
  x: number;
  y: number;
  index: number;
  direction: NarrowSandDirection;
}

export interface NarrowSandAnalysis {
  /** Tổng số ô T.Sand */
  totalSand: number;
  /** Số ô cát thuộc dải hẹp rộng 1 ô */
  narrowCount: number;
  /** Tỷ lệ ô cát hẹp (narrowCount / totalSand) */
  narrowRate: number;
  /** Danh sách chi tiết các ô hẹp */
  narrowCells: NarrowSandCell[];
}

/**
 * Phân tích các dải cát hẹp rộng 1 ô.
 * Một ô cát được coi là thuộc dải 1 ô khi nó không có cát ở cả 2 phía đối diện:
 *   (!left && !right) || (!up && !down)
 */
export function analyzeNarrowSandStrips(
  tiles: Uint8Array,
  width: number,
  height: number,
): NarrowSandAnalysis {
  let totalSand = 0;
  const narrowCells: NarrowSandCell[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (tiles[idx] === T.Sand) {
        totalSand++;

        const left = x > 0 && tiles[idx - 1] === T.Sand;
        const right = x < width - 1 && tiles[idx + 1] === T.Sand;
        const up = y > 0 && tiles[(y - 1) * width + x] === T.Sand;
        const down = y < height - 1 && tiles[(y + 1) * width + x] === T.Sand;

        const isolatedH = !left && !right;
        const isolatedV = !up && !down;

        if (isolatedH || isolatedV) {
          let direction: NarrowSandDirection;
          if (isolatedH && !isolatedV) {
            direction = "vertical"; // Dải chạy dọc hẹp 1 ô
          } else if (!isolatedH && isolatedV) {
            direction = "horizontal"; // Dải chạy ngang hẹp 1 ô
          } else {
            direction = "isolated"; // Ô cát đơn lẻ cô lập cả 2 chiều
          }

          narrowCells.push({ x, y, index: idx, direction });
        }
      }
    }
  }

  const narrowCount = narrowCells.length;
  const narrowRate = totalSand > 0 ? narrowCount / totalSand : 0;

  return {
    totalSand,
    narrowCount,
    narrowRate,
    narrowCells,
  };
}

/** Phân tích tiếp giáp Cát - Nước */
export interface SandWaterBorderAnalysis {
  /** Số ô cát tiếp giáp với ít nhất 1 ô nước kề bên */
  sandAdjacentToWaterCount: number;
  /** Tổng số cặp cạnh tiếp giáp giữa cát và nước */
  borderPairs: number;
  /** Các chỉ số ô cát cần có lớp nền cỏ đáy */
  sandCellIndices: number[];
}

/**
 * Phân tích các ô cát tiếp giáp với nước (4 hướng).
 * Những ô này khi ghép góc bằng Wang blob trên một lớp ground duy nhất
 * sẽ có mép ngoài trong suốt/viền cỏ tiếp xúc nhau, cần lớp nền cỏ bên dưới làm đáy.
 */
export function analyzeSandWaterBorders(
  tiles: Uint8Array,
  width: number,
  height: number,
): SandWaterBorderAnalysis {
  let borderPairs = 0;
  const sandCellIndices: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (tiles[idx] === T.Sand) {
        let hasWater = false;
        // Kiểm tra 4 hướng
        if (x > 0 && tiles[idx - 1] === T.Water) {
          borderPairs++;
          hasWater = true;
        }
        if (x < width - 1 && tiles[idx + 1] === T.Water) {
          borderPairs++;
          hasWater = true;
        }
        if (y > 0 && tiles[(y - 1) * width + x] === T.Water) {
          borderPairs++;
          hasWater = true;
        }
        if (y < height - 1 && tiles[(y + 1) * width + x] === T.Water) {
          borderPairs++;
          hasWater = true;
        }

        if (hasWater) {
          sandCellIndices.push(idx);
        }
      }
    }
  }

  return {
    sandAdjacentToWaterCount: sandCellIndices.length,
    borderPairs,
    sandCellIndices,
  };
}
