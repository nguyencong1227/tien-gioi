// Xuất lưới ô THẬT của một bản đồ (loại ô `T` từng ô + trấn) ra JSON, để `mau-huong-moi.py` dựng ảnh mẫu 6 khung bằng đúng bản đồ của game.
// Chạy:  npx tsx client/scripts/art/xuat-luoi-ban-do.ts lac_ha > /tmp/lac_ha.json
import { TILE, getMap } from "../../../shared/src/map";

const id = process.argv[2] ?? "lac_ha";
const g = getMap(id);
if (!g) {
  console.error(`Không có bản đồ '${id}'`);
  process.exit(1);
}
const w = g.worldW / TILE;
const h = g.worldH / TILE;
const tiles: number[] = [];
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push(g.tileAt(x, y));
process.stdout.write(
  JSON.stringify({
    id,
    w,
    h,
    town: { cx: g.townPx.x / TILE, cy: g.townPx.y / TILE, r: g.townPx.r / TILE },
    tiles,
  }),
);
