// Kiểm LIÊN THÔNG của một bản đồ cho NGƯỜI CHƠI (docs/THIET_KE_BAN_DO_TILED.md mục 5.4): từ tâm trấn đi bộ tới được MỌI cổng (tâm + chỗ xuất hiện) và hang (nếu có).
// Chạy trong test và `npm run check:content`; chỉ server (dùng `squareFree` / `navClassOf` của `nav.ts`: cùng luật cỡ thân với quái, nên "đi được" nghĩa như nhau).
//
// KHÔNG dùng `inMainRegion` / vùng chính của `nav.ts`: lưới đó là của QUÁI, cố ý loại khu an toàn (trấn, quanh cổng) vì quái không bước vào, nên tâm trấn / cổng không bao giờ thuộc vùng đó.
// Người chơi đi được qua khu an toàn, nên loang ở đây KHÔNG loại khu an toàn. Liên thông theo cỡ THÂN TRÙM (chỗ sinh trùm, mục 48) kiểm ở lát cắt S5 cùng `spawnZone`.
import { PLAYER_RADIUS, type GameMap } from "@tien-gioi/shared";
import { NAV_CELL, navClassOf, squareFree } from "./nav";

/** Loang (8 hướng, không cắt góc) trên lưới nút nửa ô cho thân cỡ `cls`; trả mặt nạ nút đã tới được từ nút gần (x, y) nhất. */
function flood(
  map: GameMap,
  cls: number,
  x: number,
  y: number,
): { reach: Uint8Array; cols: number; rows: number; ok: boolean } {
  const cols = map.def.w * 2 + 1;
  const rows = map.def.h * 2 + 1;
  const free = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      free[j * cols + i] = squareFree(map, i * NAV_CELL, j * NAV_CELL, cls) ? 1 : 0;
  const reach = new Uint8Array(cols * rows);
  const si = Math.min(cols - 1, Math.max(0, Math.round(x / NAV_CELL)));
  const sj = Math.min(rows - 1, Math.max(0, Math.round(y / NAV_CELL)));
  const start = sj * cols + si;
  if (!free[start]) return { reach, cols, rows, ok: false };
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  reach[start] = 1;
  while (head < tail) {
    const k = queue[head++]!;
    const ci = k % cols;
    const cj = (k - ci) / cols;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const nk = nj * cols + ni;
        if (reach[nk] || !free[nk]) continue;
        // không cắt góc: đi chéo cần cả hai ô kề thẳng đều thông. PHÒNG THỦ: với thân người (nửa cạnh 12 px, bước lưới 16 px) và ô đá thẳng hàng lưới, hai nút chéo thông luôn kéo theo
        // hai nút kề thông (A đã thử: bỏ luật này, bốn bản đồ thật và mọi ca đột biến cho cùng kết quả, nên không có test khoá được nó); giữ cho khớp luật của `nav.ts` và cho cỡ thân khác.
        if (di && dj && (!free[cj * cols + ni] || !free[nj * cols + ci])) continue;
        reach[nk] = 1;
        queue[tail++] = nk;
      }
  }
  return { reach, cols, rows, ok: true };
}

/**
 * Lỗi liên thông của `map` cho người chơi (rỗng = hợp lệ): tâm trấn phải đứng được; tâm cổng, chỗ xuất hiện của mọi cổng và tâm hang (nếu có) phải TỚI ĐƯỢC từ tâm trấn.
 * (Nút lưới gần điểm nhất trong ±1 nút; điểm đặt ở tâm hai ô nên luôn có nút kề.)
 */
export function reachabilityViolations(map: GameMap): string[] {
  const errs: string[] = [];
  const id = map.def.id;
  const cls = navClassOf(PLAYER_RADIUS);
  const f = flood(map, cls, map.townPx.x, map.townPx.y);
  if (!f.ok) {
    errs.push(
      `bản đồ ${id}: tâm trấn (${Math.round(map.townPx.x)}, ${Math.round(map.townPx.y)}) không đứng được cho người chơi`,
    );
    return errs;
  }
  const spots: { what: string; x: number; y: number }[] = [];
  for (const p of map.portals) {
    spots.push({ what: `tâm cổng ${p.id}`, x: p.x, y: p.y });
    spots.push({ what: `chỗ xuất hiện của cổng ${p.id}`, x: p.spawn.x, y: p.spawn.y });
  }
  if (map.lairPx) spots.push({ what: "tâm hang", x: map.lairPx.x, y: map.lairPx.y });
  for (const s of spots) {
    const ci = Math.round(s.x / NAV_CELL);
    const cj = Math.round(s.y / NAV_CELL);
    let hit = false;
    for (let dj = -1; dj <= 1 && !hit; dj++)
      for (let di = -1; di <= 1 && !hit; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i >= 0 && j >= 0 && i < f.cols && j < f.rows && f.reach[j * f.cols + i]) hit = true;
      }
    if (!hit)
      errs.push(
        `bản đồ ${id}: ${s.what} (${Math.round(s.x)}, ${Math.round(s.y)}) không tới được từ tâm trấn (người chơi)`,
      );
  }
  return errs;
}
