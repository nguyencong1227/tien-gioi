// Bản đồ thứ sáu Uy Vân Kinh (mục 75, #1467 bước A2 lát 2) và cổng bắc `lang_hoang_bac` của Lang Hoang. Cũng là bản đồ SỬA TAY: mọi ca đọc BẢN DỰNG TỪ TỆP (`adoptTiledMapFiles`).
import { beforeAll, describe, expect, it } from "vitest";
import { MONSTER_BY_ID, MONSTER_CAP, PLAYER_RADIUS } from "./game";
import { portalLinkViolations } from "./map-checks";
import { adoptTiledMapFiles } from "./map-files";
import {
  BLOCKING,
  LANG_HOANG_ID,
  MAPS,
  PROCEDURAL_MAPS,
  T,
  TILE,
  UY_VAN_ID,
  getMap,
  type GameMap,
} from "./map";

let lh: GameMap;
let uv: GameMap;
beforeAll(() => {
  adoptTiledMapFiles();
  lh = getMap(LANG_HOANG_ID)!;
  uv = getMap(UY_VAN_ID)!;
});

describe("Uy Vân Kinh: đăng ký bản đồ thứ sáu (mục 75 / A2 lát 2)", () => {
  it("nằm trong MAPS (đứng sau Lang Hoang) và trong sổ PROCEDURAL_MAPS; có ô dựng sẵn từ tệp", () => {
    const ids = MAPS.map((m) => m.id);
    expect(ids.indexOf(UY_VAN_ID)).toBe(ids.indexOf(LANG_HOANG_ID) + 1);
    expect(PROCEDURAL_MAPS.some((m) => m.id === UY_VAN_ID)).toBe(true);
    expect(uv.def.tiles).toBeDefined();
  });

  it("cặp cổng Lang Hoang <-> Uy Vân Kinh: `lang_hoang_bac` và `uy_van_nam` trỏ ngược nhau, tâm cổng nằm trên ô đường đất, ở rìa bắc / rìa nam", () => {
    const up = lh.portal("lang_hoang_bac")!;
    const down = uv.portal("uy_van_nam")!;
    expect(up.toMap).toBe(UY_VAN_ID);
    expect(up.toPortal).toBe("uy_van_nam");
    expect(down.toMap).toBe(LANG_HOANG_ID);
    expect(down.toPortal).toBe("lang_hoang_bac");
    expect(lh.tileAt(Math.floor(up.x / TILE), Math.floor(up.y / TILE))).toBe(T.Dirt);
    expect(uv.tileAt(Math.floor(down.x / TILE), Math.floor(down.y / TILE))).toBe(T.Dirt);
    expect(up.y).toBeLessThan(4 * TILE); // rìa bắc Lang Hoang (hàng 3)
    expect(down.y).toBeGreaterThan((uv.def.h - 5) * TILE); // rìa nam Uy Vân Kinh (hàng 108 / 112)
    expect(portalLinkViolations(MAPS)).toEqual([]);
  });

  it("chỗ xuất hiện của cổng nam Uy Vân Kinh đi lại được, ngoài vòng kích hoạt, trong khu an toàn quanh cổng", () => {
    const p = uv.portal("uy_van_nam")!;
    expect(uv.circleBlocked(p.spawn.x, p.spawn.y, PLAYER_RADIUS)).toBe(false);
    expect(Math.hypot(p.spawn.x - p.x, p.spawn.y - p.y)).toBeGreaterThan(p.r);
    expect(uv.inSafe(p.x, p.y)).toBe(true);
    expect(uv.inSafe(p.spawn.x, p.spawn.y)).toBe(true);
  });

  it("Uy Vân Kinh: 128 x 112, trạm Uy Vân Kinh sát cổng nam (cách ~10 ô), vùng hoang Huyết Trận Uy Vân, không hang trùm, CHƯA cổng bắc", () => {
    expect([uv.def.w, uv.def.h]).toEqual([128, 112]);
    expect(uv.def.name).toBe("Uy Vân Kinh");
    expect(uv.townName).toBe("Uy Vân Kinh");
    expect(uv.wildName).toBe("Huyết Trận Uy Vân");
    expect(uv.def.lair).toBeUndefined();
    const down = uv.portal("uy_van_nam")!;
    const d = Math.hypot(down.x - uv.townPx.x, down.y - uv.townPx.y) / TILE;
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(14);
    expect(uv.inSafe(uv.townPx.x, uv.townPx.y)).toBe(true);
    expect(uv.portals.map((p) => p.id)).toEqual(["uy_van_nam"]);
  });

  it("quái tự nhiên CHỈ là sáu loài Hóa Thần (D1 #1466 lát A3 chương 6) + hai trùm (lát E): `monsterCap` tổng 64, không rơi về MONSTER_CAP mặc định của Lạc Hà", () => {
    const QUAI: Record<string, number> = {
      luyen_huyet_de_tu: 16,
      nga_quy: 12,
      cuong_thi: 10,
      huyet_mi: 10,
      huyet_anh: 8,
      huyet_sat_chan_truyen: 6,
      huyet_hai_lao_ma: 1,
      huyet_ma_ho_phap: 1,
    };
    expect(uv.def.monsterCap).toEqual(QUAI);
    expect(uv.monsterCap).toEqual(QUAI);
    expect(Object.values(QUAI).reduce((a, b) => a + b, 0)).toBe(64);
    for (const id of Object.keys(MONSTER_CAP)) expect(uv.monsterCapOf(id), id).toBe(QUAI[id] ?? 0);
  });

  it("đủ chỗ sinh cho từng loài: ô đi lại được, nối với trạm, ngoài khu an toàn, nguy hiểm >= minDanger, >= 100 ô mỗi quái (như Kim Đan)", () => {
    const seen = new Set<number>([uv.def.town.cy * uv.def.w + uv.def.town.cx]);
    const stack = [[uv.def.town.cx, uv.def.town.cy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= uv.def.w || ny >= uv.def.h) continue;
        const i = ny * uv.def.w + nx;
        if (BLOCKING.has(uv.tileAt(nx, ny)) || seen.has(i)) continue;
        seen.add(i);
        stack.push([nx, ny]);
      }
    }
    for (const [id, cap] of Object.entries(uv.monsterCap)) {
      let n = 0;
      for (const i of seen) {
        const x = (i % uv.def.w) * TILE + TILE / 2;
        const y = Math.floor(i / uv.def.w) * TILE + TILE / 2;
        if (uv.dangerAt(x, y) >= MONSTER_BY_ID[id].minDanger && !uv.inSafe(x, y)) n++;
      }
      expect(n, id).toBeGreaterThanOrEqual(100 * cap);
    }
  });
});
