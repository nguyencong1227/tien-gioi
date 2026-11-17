// Bản đồ thử cho test tìm đường (mục 48, #1012): `GameMap` thật, `tiles` san phẳng rồi vẽ tường cây. Sửa `tiles` TRƯỚC khi hỏi tìm đường lần đầu (mặt nạ dựng lười, giữ theo bản đồ).
import { GameMap, T } from "@tien-gioi/shared";

let seq = 0;
/** Bản đồ phẳng w x h ô, viền đá, trấn nhỏ ở góc (không ảnh hưởng tìm đường). Mỗi lần gọi một bản đồ mới (không dính bộ nhớ đệm). */
export function flatMap(w = 40, h = 30): GameMap {
  const map = new GameMap({
    id: `test_nav_${++seq}`,
    name: "Phẳng",
    seed: 1,
    w,
    h,
    town: { cx: 3, cy: 3, r: 2 },
  });
  map.tiles.fill(T.Grass);
  for (let x = 0; x < w; x++) {
    map.tiles[x] = T.Rock;
    map.tiles[(h - 1) * w + x] = T.Rock;
  }
  for (let y = 0; y < h; y++) {
    map.tiles[y * w] = T.Rock;
    map.tiles[y * w + w - 1] = T.Rock;
  }
  return map;
}

/** Tô các ô [tx0..tx1] x [ty0..ty1] bằng `tile` (mặc định cây). */
export function paint(
  map: GameMap,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
  tile = T.Tree,
) {
  for (let y = ty0; y <= ty1; y++)
    for (let x = tx0; x <= tx1; x++) map.tiles[y * map.def.w + x] = tile;
}
