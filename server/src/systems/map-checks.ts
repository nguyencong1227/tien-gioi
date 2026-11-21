// Kiểm LIÊN THÔNG của một bản đồ cho NGƯỜI CHƠI (docs/THIET_KE_BAN_DO_TILED.md mục 5.4): từ tâm trấn đi bộ tới được MỌI cổng (tâm + chỗ xuất hiện) và hang (nếu có).
// Chạy trong test và `npm run check:content`; chỉ server (dùng `squareFree` / `navClassOf` của `nav.ts`: cùng luật cỡ thân với quái, nên "đi được" nghĩa như nhau).
//
// KHÔNG dùng `inMainRegion` / vùng chính của `nav.ts`: lưới đó là của QUÁI, cố ý loại khu an toàn (trấn, quanh cổng) vì quái không bước vào, nên tâm trấn / cổng không bao giờ thuộc vùng đó.
// Người chơi đi được qua khu an toàn, nên loang ở đây KHÔNG loại khu an toàn. Liên thông theo cỡ THÂN QUÁI / TRÙM của `spawnZone` (S5, mục 5.5) kiểm ở `spawnZoneViolations` bên dưới.
import {
  MONSTER_BY_ID,
  PLAYER_RADIUS,
  WORLD_BOSS_SCHEDULE,
  inSpawnZone,
  type GameMap,
  type WorldBossSlot,
} from "@tien-gioi/shared";
import { BOSS_SPAWN_MARGIN, bossSpawnOkOn } from "./monsters";
import { NAV_CELL, inMainRegion, navClassOf, squareFree } from "./nav";

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

type Flood = ReturnType<typeof flood>;

/** Điểm (x, y) có nút lưới (trong ±1 nút quanh điểm) đã loang tới không. */
function reached(f: Flood, x: number, y: number): boolean {
  const ci = Math.round(x / NAV_CELL);
  const cj = Math.round(y / NAV_CELL);
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i >= 0 && j >= 0 && i < f.cols && j < f.rows && f.reach[j * f.cols + i]) return true;
    }
  return false;
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
    if (!reached(f, s.x, s.y))
      errs.push(
        `bản đồ ${id}: ${s.what} (${Math.round(s.x)}, ${Math.round(s.y)}) không tới được từ tâm trấn (người chơi)`,
      );
  }
  return errs;
}

/** Số chỗ sinh hợp lệ tối thiểu của MỘT vùng (điểm lưới nửa ô: 8 điểm ~ hai ô vuông): ít hơn thì vùng gần như vô dụng (đá / trấn / túi kín che gần hết). */
export const MIN_ZONE_SPOTS = 8;

/**
 * Lỗi của các `spawnZone` của `map` (rỗng = hợp lệ; docs/THIET_KE_BAN_DO_TILED.md mục 5.5), kiểm trên DỮ LIỆU THẬT (`GameMap` đã dựng lo phần cú pháp: loài lạ, khung, `max`):
 *  - loài của vùng phải CÓ ở bản đồ này (`monsterCap` > 0) hoặc là trùm thế giới của lịch cho bản đồ này (`slots`): nếu không, vùng vô dụng và lưới tìm đường của loài không được dựng sẵn;
 *  - vùng phải có ít nhất `MIN_ZONE_SPOTS` chỗ sinh hợp lệ (đúng hình, không đè ô chặn theo cỡ thân, ngoài khu an toàn đệm 160 px như `zoneSpawnSpot`; trùm thì còn `bossSpawnOkOn`: không sát cây / đá);
 *  - KHÔNG chỗ đứng được nào của vùng nằm trong túi kín (không thuộc vùng chính của cỡ thân loài đó): quái sinh ở đó không đi đâu được, người chơi đứng ngoài đánh miễn phí (mục 48);
 *  - nếu MỌI vùng của một loài đều khai `max` thì tổng `max` không được nhỏ hơn `monsterCap` (nếu không bản đồ không bao giờ đủ quái).
 * Lấy mẫu theo lưới nửa ô, nên một khe hẹp hơn nửa ô có thể lọt: đủ cho vùng soạn bằng tay theo ô.
 */
export function spawnZoneViolations(
  map: GameMap,
  slots: readonly WorldBossSlot[] = WORLD_BOSS_SCHEDULE,
): string[] {
  const errs: string[] = [];
  const id = map.def.id;
  const floods = new Map<number, Flood>();
  map.spawnZones.forEach((z, i) => {
    const at = `bản đồ ${id}: vùng sinh #${i + 1} (${z.monster})`;
    const def = Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, z.monster)
      ? MONSTER_BY_ID[z.monster]
      : undefined;
    if (!def) return; // `GameMap` đã ném khi dựng; giữ cho hàm không ném với dữ liệu lạ
    const scheduled = slots.some((s) => s.mapId === id && s.boss === z.monster);
    if (map.monsterCapOf(z.monster) <= 0 && !scheduled)
      errs.push(
        `${at}: loài này không có trong monsterCap của bản đồ và không phải trùm thế giới của lịch ở đây`,
      );
    // Tới được = loang từ TÂM TRẤN theo cỡ thân quái, KHÔNG loại khu an toàn (người chơi đi qua trấn được). Lưới của quái coi trấn là tường nên trấn có thể cắt bản đồ làm hai nửa quái không qua lại được:
    // nửa nhỏ vẫn là đất MỞ (quái đi lại thoải mái, người chơi tới bằng cách đi qua trấn), chỉ khoảng đất BAO KÍN thật mới là túi kín (B đo ở review #1214: Âm Sương có nửa ~20 % diện tích tách vì trấn).
    const cls = navClassOf(def.radius * 0.8);
    let f = floods.get(cls);
    if (!f) {
      f = flood(map, cls, map.townPx.x, map.townPx.y);
      floods.set(cls, f);
    }
    if (!f.ok) {
      errs.push(`${at}: tâm trấn không đứng được cho cỡ thân loài này, không kiểm được liên thông`);
      return;
    }
    let ok = 0;
    let isolated = 0;
    let tight = 0; // trùm: chỗ sát cây / đá
    let outsideMain = 0; // trùm: chỗ ngoài vùng chính của lưới quái
    const x1 = z.x + z.w;
    const y1 = z.y + z.h;
    for (let y = z.y + NAV_CELL / 2; y < y1; y += NAV_CELL)
      for (let x = z.x + NAV_CELL / 2; x < x1; x += NAV_CELL) {
        if (!inSpawnZone(z, x, y)) continue;
        if (map.inSafe(x, y, 160) || map.circleBlocked(x, y, def.radius)) continue;
        if (!reached(f, x, y)) {
          isolated++;
          continue;
        }
        if (!def.boss || bossSpawnOkOn(map, def, x, y)) ok++;
        // Trùm: tách LÝ DO loại để người soạn biết sửa gì (B review #1214: "0 chỗ hợp lệ" không nói vì đá che hay vì trấn cắt bản đồ).
        // Hai lý do ĐỘC LẬP (một chỗ có thể dính cả hai): vùng trùm ở nửa nhỏ lại nhiều cây mà chỉ báo "sát cây" thì người soạn dọn cây xong mới gặp lỗi vùng chính (B đo ở review #1218).
        else {
          if (!squareFree(map, x, y, def.radius + BOSS_SPAWN_MARGIN)) tight++;
          if (!inMainRegion(map, def.radius * 0.8, x, y)) outsideMain++;
        }
      }
    if (ok < MIN_ZONE_SPOTS) {
      const why: string[] = [];
      if (tight > 0)
        why.push(`${tight} chỗ sát cây / đá (cách ô chặn dưới bán kính + ${BOSS_SPAWN_MARGIN} px)`);
      if (outsideMain > 0)
        why.push(
          `${outsideMain} chỗ ngoài vùng chính của lưới quái cho trùm (trấn có thể cắt bản đồ làm đôi: vùng trùm phải ở nửa thế giới chứa vùng chính, luật mục 48; một chỗ có thể thuộc cả hai nhóm)`,
        );
      errs.push(
        `${at}: chỉ có ${ok} chỗ sinh hợp lệ (cần >= ${MIN_ZONE_SPOTS})${why.length > 0 ? `; bị loại: ${why.join("; ")}` : ""}`,
      );
    }
    if (isolated > 0)
      errs.push(
        `${at}: ${isolated} chỗ đứng được nằm trong túi kín (không tới được từ tâm trấn, kể cả đi qua khu an toàn, cho cỡ thân loài này)`,
      );
  });
  // tổng `max` so với monsterCap, mỗi loài một lần
  const kinds = new Set(map.spawnZones.map((z) => z.monster));
  for (const k of kinds) {
    const zs = map.spawnZonesOf(k);
    const cap = map.monsterCapOf(k);
    if (cap > 0 && zs.every((z) => z.max !== undefined)) {
      const sum = zs.reduce((n, z) => n + (z.max ?? 0), 0);
      if (sum < cap)
        errs.push(
          `bản đồ ${id}: loài ${k}: tổng max các vùng (${sum}) nhỏ hơn monsterCap (${cap}), bản đồ không bao giờ đủ quái`,
        );
    }
  }
  return errs;
}
