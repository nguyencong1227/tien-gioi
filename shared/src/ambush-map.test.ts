// Đấu trường chặn đường (docs/THIET_KE_CHAN_DUONG.md mục 5, CD1 #1061): bản đồ solo, không khu an toàn, mỗi bản đồ thường một cái.
import { describe, expect, it } from "vitest";
import {
  ARENA_MAPS,
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  DUNGEON_MAPS,
  GameMap,
  LINH_HU_MAP_ID,
  MAPS,
  MAP_BY_ID,
  TILE,
  arenaMapIdOf,
  getMap,
  isArenaMap,
  isDungeonMap,
} from "./map";

describe("ARENA_MAPS", () => {
  it("một đấu trường cho MỖI bản đồ thường, id theo `arenaMapIdOf`, nhỏ, kind arena, trỏ về bản đồ gốc", () => {
    expect(ARENA_MAPS.length).toBe(MAPS.length);
    for (const m of MAPS) {
      const a = ARENA_MAPS.find((x) => x.arenaFor === m.id);
      expect(a, m.id).toBeDefined();
      expect(a!.id).toBe(arenaMapIdOf(m.id));
      expect(a!.kind).toBe("arena");
      expect(a!.w).toBeLessThanOrEqual(40);
      expect(a!.h).toBeLessThanOrEqual(40);
      expect(a!.seed).not.toBe(m.seed); // hình khác bản đồ gốc
      expect(a!.name).toContain(m.wildName ?? m.name);
    }
    expect(new Set(ARENA_MAPS.map((a) => a.id)).size).toBe(ARENA_MAPS.length);
  });

  it("KHÔNG nằm trong MAPS / DUNGEON_MAPS (không có phòng thường), nhưng tra được bằng MAP_BY_ID / getMap", () => {
    for (const a of ARENA_MAPS) {
      expect(MAPS.includes(a)).toBe(false);
      expect(DUNGEON_MAPS.includes(a)).toBe(false);
      expect(MAP_BY_ID[a.id]).toBe(a);
      expect(getMap(a.id)?.def).toBe(a);
    }
    expect(isArenaMap("arena_lac_ha")).toBe(true);
  });

  it("isArenaMap / isDungeonMap phân biệt đúng; id lạ và kiểu sai là false (không đọc prototype)", () => {
    expect(isArenaMap(arenaMapIdOf(DEFAULT_MAP_ID))).toBe(true);
    expect(isArenaMap(DEFAULT_MAP_ID)).toBe(false);
    expect(isArenaMap(LINH_HU_MAP_ID)).toBe(false);
    expect(isDungeonMap(arenaMapIdOf(DEFAULT_MAP_ID))).toBe(false); // đấu trường KHÔNG là bí cảnh
    expect(isDungeonMap(LINH_HU_MAP_ID)).toBe(true);
    for (const bad of [
      "constructor",
      "__proto__",
      "toString",
      "",
      "arena_",
      5,
      null,
      undefined,
      {},
    ])
      expect(isArenaMap(bad), String(bad)).toBe(false);
  });

  it("không có quái sinh tự nhiên, không cổng, có chỗ kẻ địch đứng (lair)", () => {
    for (const a of ARENA_MAPS) {
      const g = getMap(a.id)!;
      expect(a.monsterCap).toEqual({});
      expect(g.monsterCap).toEqual({});
      expect(g.portals).toEqual([]);
      expect(g.lairPx, a.id).toBeDefined(); // chỗ kẻ địch đứng lúc bắt đầu (nền san phẳng)
    }
  });

  it("KHÔNG có khu an toàn / trấn: mọi điểm (kể cả chỗ đứng lúc vào) đều ngoài `inSafe` / `inTown`; bản đồ khác không đổi", () => {
    for (const a of ARENA_MAPS) {
      const g = getMap(a.id)!;
      for (let ty = 0; ty < a.h; ty++)
        for (let tx = 0; tx < a.w; tx++) {
          expect(g.inSafe(tx * TILE, ty * TILE)).toBe(false);
          expect(g.inTown(tx * TILE, ty * TILE)).toBe(false);
        }
      expect(g.inSafe(g.townPx.x, g.townPx.y, 9999)).toBe(false);
      expect(g.inTown(g.townPx.x, g.townPx.y, 9999)).toBe(false);
    }
    // hồi quy: bản đồ thường và bí cảnh vẫn có khu an toàn ở chỗ cũ
    expect(DEFAULT_MAP.inSafe(DEFAULT_MAP.townPx.x, DEFAULT_MAP.townPx.y)).toBe(true);
    expect(DEFAULT_MAP.inTown(DEFAULT_MAP.townPx.x, DEFAULT_MAP.townPx.y)).toBe(true);
    const dj = getMap(LINH_HU_MAP_ID)!;
    expect(dj.inSafe(dj.townPx.x, dj.townPx.y)).toBe(true);
  });

  it("chỗ đứng lúc vào (townPx) đi được, và từ đó tới giữa / phía bắc đấu trường đi được (không bị bít)", () => {
    for (const a of ARENA_MAPS) {
      const g = getMap(a.id)!;
      expect(g.isBlockedPx(g.townPx.x, g.townPx.y), a.id).toBe(false);
      const start = [Math.floor(g.townPx.x / TILE), Math.floor(g.townPx.y / TILE)];
      const seen = new Set<number>([start[1] * a.w + start[0]]);
      const q = [start];
      while (q.length) {
        const [x, y] = q.pop()!;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h || seen.has(ny * a.w + nx)) continue;
          if (g.isBlockedPx((nx + 0.5) * TILE, (ny + 0.5) * TILE)) continue;
          seen.add(ny * a.w + nx);
          q.push([nx, ny]);
        }
      }
      // chỗ kẻ địch đứng (hang): tâm và các điểm quanh tâm đều tới được từ chỗ đứng của người chơi
      const l = g.lairPx!;
      expect(l, a.id).toBeDefined();
      const lc = [Math.floor(l.x / TILE), Math.floor(l.y / TILE)];
      for (const [dx, dy] of [
        [0, 0],
        [-2, 0],
        [2, 0],
        [0, 2],
        [0, -2],
      ])
        expect(seen.has((lc[1] + dy) * a.w + lc[0] + dx), `${a.id} hang +${dx},${dy}`).toBe(true);
      // phần đi được đủ rộng để đánh nhau (>= 300 ô)
      expect(seen.size, a.id).toBeGreaterThanOrEqual(300);
    }
  });

  it("kể cả khi (giả sử) có cổng: khu an toàn quanh cổng cũng KHÔNG hiệu lực trong đấu trường (kind arena luôn không an toàn)", () => {
    const base = ARENA_MAPS[0];
    const g0 = getMap(base.id)!;
    const px = g0.townPx.x;
    const py = g0.townPx.y;
    const g = new GameMap({
      ...base,
      portals: [
        {
          id: "arena_thu_cong",
          name: "Cổng thử",
          x: px,
          y: py,
          r: 20,
          safeR: 120,
          toMap: DEFAULT_MAP_ID,
          toPortal: "khong_co",
          spawn: { x: px + 60, y: py },
        },
      ],
    });
    expect(g.inSafe(px, py)).toBe(false);
    expect(g.inSafe(px + 60, py)).toBe(false);
    // đối chứng: cùng cổng đó ở bản đồ KHÔNG phải đấu trường thì có khu an toàn
    const w = new GameMap({ ...base, kind: "world", portals: g.def.portals });
    expect(w.inSafe(px + 60, py)).toBe(true);
  });

  it("tất định: dựng hai lần cho cùng ô (client và server cùng sinh từ seed)", () => {
    for (const a of ARENA_MAPS) {
      expect(getMap(a.id)!.tiles).toEqual(getMap(a.id)!.tiles);
    }
  });
});
