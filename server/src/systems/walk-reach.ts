// Đất NGƯỜI CHƠI ĐI BỘ TỚI ĐƯỢC từ tâm trấn (docs/THIET_KE_BAN_DO_TILED.md mục 7.2): loang trên lưới 8 px bằng đúng phép thử va chạm của người chơi (`circleBlocked`, thân PLAYER_RADIUS).
// Khác `nav.ts` `inMainRegion` (lưới của QUÁI: khu an toàn là tường, nên trấn cắt bản đồ làm đôi và tâm trấn không thuộc vùng đó): người chơi đi qua trấn được, nên ở đây KHÔNG loại khu an toàn.
// Dùng để: (1) không giữ vị trí lưu nằm trong TÚI KÍN (hồ sơ cũ sau khi bản đồ bị sửa tay: đứng ở chỗ không đi ra được, game không có lệnh gỡ kẹt); (2) chỉ dời người tới chỗ nối với thế giới.
// Dựng MỘT lần mỗi `GameMap` (nhớ theo đối tượng) ở lần dùng đầu: ~vài chục ms, không nằm trong tick.
import { PLAYER_RADIUS, type GameMap } from "@tien-gioi/shared";

/** Bước lưới (px): nhỏ hơn thân người chơi (22 px) nên khe vừa khít vẫn thông. */
export const WALK_STEP = 8;

interface Mask {
  cols: number;
  rows: number;
  seen: Uint8Array;
}

/** `null` = không kiểm được (tâm trấn không đứng được: bản đồ cấu hình hỏng, do `reachabilityViolations` bắt): coi MỌI chỗ là tới được, không dời hàng loạt. */
const cache = new WeakMap<GameMap, Mask | null>();

function build(map: GameMap): Mask | null {
  const cols = Math.floor(map.worldW / WALK_STEP) + 1;
  const rows = Math.floor(map.worldH / WALK_STEP) + 1;
  const free = (i: number, j: number) =>
    !map.circleBlocked(i * WALK_STEP, j * WALK_STEP, PLAYER_RADIUS);
  const seen = new Uint8Array(cols * rows);
  // nút xuất phát: nút thoáng gần tâm trấn nhất trong ±1 nút
  const ci = Math.round(map.townPx.x / WALK_STEP);
  const cj = Math.round(map.townPx.y / WALK_STEP);
  let start = -1;
  for (let dj = -1; dj <= 1 && start < 0; dj++)
    for (let di = -1; di <= 1 && start < 0; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i >= 0 && j >= 0 && i < cols && j < rows && free(i, j)) start = j * cols + i;
    }
  if (start < 0) return null;
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  while (head < tail) {
    const k = queue[head++]!;
    const i = k % cols;
    const j = (k - i) / cols;
    for (let d = 0; d < 4; d++) {
      const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const nk = nj * cols + ni;
      if (seen[nk] || !free(ni, nj)) continue;
      // điểm giữa hai nút cũng phải thoáng (không lách qua khe mỏng hơn thân)
      if (map.circleBlocked(((i + ni) * WALK_STEP) / 2, ((j + nj) * WALK_STEP) / 2, PLAYER_RADIUS))
        continue;
      seen[nk] = 1;
      queue[tail++] = nk;
    }
  }
  return { cols, rows, seen };
}

/** (x, y) có đi bộ tới được từ tâm trấn không (nút lưới đã loang tới trong ±1 nút quanh điểm). Bản đồ không kiểm được thì luôn `true`. */
export function reachableFromTown(map: GameMap, x: number, y: number): boolean {
  let m = cache.get(map);
  if (m === undefined) {
    m = build(map);
    cache.set(map, m);
  }
  if (m === null) return true;
  const ci = Math.round(x / WALK_STEP);
  const cj = Math.round(y / WALK_STEP);
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i >= 0 && j >= 0 && i < m.cols && j < m.rows && m.seen[j * m.cols + i]) return true;
    }
  return false;
}
