// `safeSpot` / `nearestFreeSpot` (docs/THIET_KE_BAN_DO_TILED.md mục 7.2): vị trí đã lưu rơi vào ô chặn thì tới chỗ đứng GẦN nhất (không bị kéo về trấn), không có trong tầm thì về trấn.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP_ID,
  GameMap,
  PLAYER_RADIUS,
  T,
  TILE,
  bakeTiledMap,
  getMap,
  MAPS,
  mapDefFromTiled,
  type TiledMap,
} from "@tien-gioi/shared";
import { RELOCATE_MAX_PX, nearestFreeSpot, safeSpot } from "./movement";
import { inMainRegion } from "./nav";

const map = getMap(DEFAULT_MAP_ID)!;
const blocked = (m: GameMap, x: number, y: number) => m.circleBlocked(x, y, PLAYER_RADIUS);

/** Tâm một ô cây / đá ngay cạnh vùng thoáng (không phải viền bản đồ), cách trấn đủ xa. */
function wallSpot(): { x: number; y: number } {
  for (let ty = 20; ty < 40; ty++)
    for (let tx = 60; tx < 90; tx++) {
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      if (map.tileAt(tx, ty) === T.Tree && blocked(map, x, y)) return { x, y };
    }
  throw new Error("không có ô cây thử");
}

describe("nearestFreeSpot / safeSpot: vị trí lưu rơi vào ô chặn", () => {
  it("vị trí hợp lệ thì GIỮ NGUYÊN, không kèm `moved` (không đổi hành vi ở chỗ thoáng)", () => {
    const t = map.townPx;
    expect(safeSpot(map, t.x, t.y)).toEqual({ x: t.x, y: t.y });
  });

  it("vị trí trong ô cây: tới chỗ đứng KHÔNG chặn, rất gần chỗ cũ (không về trấn), `moved.to = near`", () => {
    const w = wallSpot();
    const s = safeSpot(map, w.x, w.y);
    expect(blocked(map, s.x, s.y)).toBe(false);
    expect(s.moved?.to).toBe("near");
    const d = Math.hypot(s.x - w.x, s.y - w.y);
    expect(s.moved?.dist).toBe(Math.round(d));
    expect(d).toBeLessThanOrEqual(3 * TILE); // cây cạnh chỗ thoáng
    expect(map.inTown(s.x, s.y)).toBe(false); // KHÔNG bị kéo về trấn như bản cũ
    expect(Number.isInteger(s.x) && Number.isInteger(s.y)).toBe(true);
  });

  it("GẦN NHẤT thật: không có điểm lưới 8 px thoáng VÀ nối với thế giới mở nào gần hơn kết quả quá một nửa bước lấy mẫu", () => {
    const w = wallSpot();
    const s = nearestFreeSpot(map, w.x, w.y)!;
    const d = Math.hypot(s.x - w.x, s.y - w.y);
    let best = Infinity;
    for (let y = w.y - 6 * TILE; y <= w.y + 6 * TILE; y += 8)
      for (let x = w.x - 6 * TILE; x <= w.x + 6 * TILE; x += 8)
        if (!blocked(map, x, y) && inMainRegion(map, PLAYER_RADIUS, x, y))
          best = Math.min(best, Math.hypot(x - w.x, y - w.y));
    expect(d).toBeLessThanOrEqual(best + TILE / 4 + 0.5); // lấy mẫu nửa ô (16 px) thô hơn lưới 8 px: sai lệch tối đa nửa bước
    expect(inMainRegion(map, PLAYER_RADIUS, s.x, s.y)).toBe(true);
  });

  it("TÚI KÍN gần hơn vùng mở: KHÔNG chọn túi (người chơi sẽ kẹt), chọn chỗ nối với thế giới", () => {
    const g = pocketWorld();
    // vị trí lưu ở ô đá (24, 22) sát túi kín 2 x 2 ô (22..23, 22..23); đất mở bắt đầu từ ô 30
    const x = 24.5 * TILE;
    const y = 22.5 * TILE;
    expect(blocked(g, x, y)).toBe(true);
    // túi có chỗ đứng thật (nếu không thì test này vô nghĩa)
    expect(blocked(g, 23 * TILE, 23 * TILE)).toBe(false);
    expect(inMainRegion(g, PLAYER_RADIUS, 23 * TILE, 23 * TILE)).toBe(false);
    const s = safeSpot(g, x, y);
    expect(s.moved?.to).toBe("near");
    const inPocket = s.x > 22 * TILE && s.x < 24 * TILE && s.y > 22 * TILE && s.y < 24 * TILE;
    expect(inPocket).toBe(false);
    expect(inMainRegion(g, PLAYER_RADIUS, s.x, s.y)).toBe(true);
    expect(blocked(g, s.x, s.y)).toBe(false);
  });

  it("ORACLE độc lập trên bốn bản đồ thật: MỌI vị trí lưu rơi vào ô chặn (mẫu mỗi ô thứ 7, nội thất lẫn viền) đều được đưa tới chỗ ĐI BỘ TỚI ĐƯỢC từ trấn", () => {
    for (const def of MAPS) {
      const m = getMap(def.id)!;
      const reach = walkableFromTown(m);
      let tested = 0;
      let k = 0;
      for (let ty = 0; ty < def.h; ty++)
        for (let tx = 0; tx < def.w; tx++) {
          const x = tx * TILE + TILE / 2;
          const y = ty * TILE + TILE / 2;
          if (!blocked(m, x, y) || k++ % 7 !== 0) continue;
          const s = safeSpot(m, x, y);
          tested++;
          expect(reach(s.x, s.y), `${def.id} ô (${tx},${ty}) -> (${s.x},${s.y})`).toBe(true);
          expect(blocked(m, s.x, s.y)).toBe(false);
          if (s.moved?.to === "near") expect(s.moved.dist).toBeLessThanOrEqual(RELOCATE_MAX_PX);
        }
      expect(tested, def.id).toBeGreaterThan(100);
    }
  }, 60_000);

  it("không có chỗ trong tầm (khối đá rộng) hoặc ngoài bản đồ: về TRẤN, `moved.to = town`", () => {
    const g = rockWorld();
    // trấn ở góc (10, 10), đường tới x = 20, ổ nhỏ ở (60..62, 60..62); vị trí (45, 20) cách MỌI chỗ thoáng > 24 ô
    expect(blocked(g, 45 * TILE, 20 * TILE)).toBe(true);
    expect(nearestFreeSpot(g, 45 * TILE, 20 * TILE)).toBeNull();
    const s = safeSpot(g, 45 * TILE, 20 * TILE);
    expect(s.moved?.to).toBe("town");
    expect(g.inTown(s.x, s.y)).toBe(true);
    // ổ thoáng ở đường chéo cách ~29 ô (trong ô vuông ±24 ô nhưng ngoài vòng tròn): KHÔNG được chọn
    expect(blocked(g, 61 * TILE + 16, 61 * TILE + 16)).toBe(false);
    expect(nearestFreeSpot(g, 40 * TILE, 40 * TILE)).toBeNull();
    // gần hơn tầm thì vẫn về chỗ đứng gần nhất thay vì trấn
    const near = safeSpot(g, 30 * TILE, 10 * TILE);
    expect(near.moved?.to).toBe("near");
    expect(g.inTown(near.x, near.y, 400)).toBe(true);
    // ngoài bản đồ (cách xa hơn tầm tìm)
    const out = safeSpot(map, map.worldW + RELOCATE_MAX_PX + 500, map.worldH / 2);
    expect(out.moved?.to).toBe("town");
    expect(map.inTown(out.x, out.y)).toBe(true);
  });

  it("tạo độ rác (NaN, Infinity) và không đưa toạ độ: không ném lỗi; không toạ độ thì không `moved`", () => {
    const a = safeSpot(map, NaN, NaN);
    expect(map.inTown(a.x, a.y)).toBe(true);
    expect(a.moved?.to).toBe("town");
    const b = safeSpot(map, Infinity, 5);
    expect(map.inTown(b.x, b.y)).toBe(true);
    expect(safeSpot(map).moved).toBeUndefined();
    expect(nearestFreeSpot(map, NaN, 3)).toBeNull();
  });
});

/** Bản đồ thử 64 x 64: TOÀN ĐÁ trừ một trấn nhỏ ở góc (10, 10) và một dải đường thoáng chạy sang phải tới x = 20; không cổng. */
function rockWorld(): GameMap {
  const json: TiledMap = structuredClone(bakeTiledMap(map));
  json.width = 64;
  json.height = 64;
  const data: number[] = [];
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const free =
        Math.hypot(x - 10, y - 10) < 6 ||
        (y >= 9 && y <= 11 && x <= 20) ||
        (x >= 60 && x <= 62 && y >= 60 && y <= 62); // ổ nhỏ ở đường chéo: trong ô vuông tìm kiếm nhưng NGOÀI bán kính 24 ô
      data.push(1 + (free ? T.Grass : T.Rock));
    }
  const logic = json.layers.find((l) => l.name === "logic")!;
  logic.width = 64;
  logic.height = 64;
  logic.data = data;
  const objects = json.layers.find((l) => l.name === "objects")!;
  objects.objects = objects.objects!.filter((o) => o.class === "town");
  const town = objects.objects[0]!;
  town.x = 10.5 * 16;
  town.y = 10.5 * 16;
  town.properties = [{ name: "r", value: 3 }];
  json.properties = json.properties!.filter((p) => p.name !== "monsterCap");
  return new GameMap(mapDefFromTiled(json, TILE));
}

/**
 * Bản đồ thử 64 x 64: cỏ, viền đá, một khối đá 10 x 10 ô ở (20..29, 20..29) có TÚI KÍN 2 x 2 ô ở (22..23, 22..23) hoàn toàn bao bằng đá; trấn ở (10, 10). Vùng mở (vùng chính) là phần còn lại.
 */
function pocketWorld(): GameMap {
  const side = 64;
  const t = new Uint8Array(side * side).fill(T.Grass);
  for (let i = 0; i < side; i++) {
    t[i] = T.Rock;
    t[(side - 1) * side + i] = T.Rock;
    t[i * side] = T.Rock;
    t[i * side + side - 1] = T.Rock;
  }
  for (let y = 20; y < 30; y++) for (let x = 20; x < 30; x++) t[y * side + x] = T.Rock;
  for (let y = 22; y < 24; y++) for (let x = 22; x < 24; x++) t[y * side + x] = T.Grass;
  return new GameMap({
    id: "thu_tui",
    name: "Thử Túi",
    seed: 1,
    w: side,
    h: side,
    town: { cx: 10, cy: 10, r: 3 },
    monsterCap: { tho: 1 },
    tiles: t,
  });
}

/**
 * ORACLE ĐỘC LẬP với mã của `safeSpot` (không dùng `nav.ts`): loang từ tâm trấn trên lưới 8 px, hai nút kề nhau nối được khi CẢ HAI và điểm giữa đều không chạm ô chặn theo thân người chơi
 * (`circleBlocked`). Trả hàm: điểm bất kỳ có nút lưới gần nhất (trong nửa bước) đã loang tới không.
 */
function walkableFromTown(m: GameMap): (x: number, y: number) => boolean {
  const step = 8;
  const cols = Math.floor(m.worldW / step) + 1;
  const rows = Math.floor(m.worldH / step) + 1;
  const free = (i: number, j: number) => !m.circleBlocked(i * step, j * step, PLAYER_RADIUS);
  const seen = new Uint8Array(cols * rows);
  const si = Math.round(m.townPx.x / step);
  const sj = Math.round(m.townPx.y / step);
  const queue: number[] = [sj * cols + si];
  seen[sj * cols + si] = 1;
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head]!;
    const i = k % cols;
    const j = (k - i) / cols;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || seen[nj * cols + ni]) continue;
      const mx = ((i + ni) * step) / 2;
      const my = ((j + nj) * step) / 2;
      if (!free(ni, nj) || m.circleBlocked(mx, my, PLAYER_RADIUS)) continue;
      seen[nj * cols + ni] = 1;
      queue.push(nj * cols + ni);
    }
  }
  return (x, y) => {
    const i = Math.round(x / step);
    const j = Math.round(y / step);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ni = i + di;
        const nj = j + dj;
        if (ni >= 0 && nj >= 0 && ni < cols && nj < rows && seen[nj * cols + ni]) return true;
      }
    return false;
  };
}
