// Bản đồ thứ năm Lang Hoang (mục 75, #1467 bước A2) và cổng bắc mới của Hàn Vân Lĩnh. Lang Hoang là bản đồ SỬA TAY (tệp Tiled là nguồn duy nhất): mọi ca ở đây đọc BẢN DỰNG TỪ TỆP
// (`adoptTiledMapFiles`), vì `getMap` trước khi nhận tệp trả bản sinh theo `seed` (khác tệp ở ô).
import { beforeAll, describe, expect, it } from "vitest";
import { MONSTER_CAP, PLAYER_RADIUS } from "./game";
import { portalLinkViolations } from "./map-checks";
import { adoptTiledMapFiles } from "./map-files";
import {
  HAN_VAN_ID,
  LANG_HOANG_ID,
  MAPS,
  PROCEDURAL_MAPS,
  T,
  TILE,
  getMap,
  type GameMap,
} from "./map";

let hv: GameMap;
let lh: GameMap;
beforeAll(() => {
  adoptTiledMapFiles();
  hv = getMap(HAN_VAN_ID)!;
  lh = getMap(LANG_HOANG_ID)!;
});

describe("Lang Hoang: đăng ký bản đồ thứ năm (mục 75 / A2)", () => {
  it("nằm trong MAPS (đứng sau Hàn Vân Lĩnh) và trong sổ PROCEDURAL_MAPS; id duy nhất; có ô dựng sẵn từ tệp", () => {
    const ids = MAPS.map((m) => m.id);
    expect(ids.indexOf(LANG_HOANG_ID)).toBe(ids.indexOf(HAN_VAN_ID) + 1);
    expect(PROCEDURAL_MAPS.some((m) => m.id === LANG_HOANG_ID)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(lh.def.tiles).toBeDefined();
  });

  it("cặp cổng Hàn Vân <-> Lang Hoang: `han_van_bac` và `lang_hoang_nam` trỏ ngược nhau, tâm cổng nằm trên ô đường đất, ở rìa bắc / rìa nam", () => {
    const up = hv.portal("han_van_bac")!;
    const down = lh.portal("lang_hoang_nam")!;
    expect(up.toMap).toBe(LANG_HOANG_ID);
    expect(up.toPortal).toBe("lang_hoang_nam");
    expect(down.toMap).toBe(HAN_VAN_ID);
    expect(down.toPortal).toBe("han_van_bac");
    expect(hv.tileAt(Math.floor(up.x / TILE), Math.floor(up.y / TILE))).toBe(T.Dirt);
    expect(lh.tileAt(Math.floor(down.x / TILE), Math.floor(down.y / TILE))).toBe(T.Dirt);
    expect(up.y).toBeLessThan(4 * TILE); // rìa bắc Hàn Vân (hàng 3)
    expect(down.y).toBeGreaterThan((lh.def.h - 5) * TILE); // rìa nam Lang Hoang (hàng 108 / 112)
    expect(portalLinkViolations(MAPS)).toEqual([]);
  });

  it("chỗ xuất hiện của hai cổng đi lại được, nằm NGOÀI vòng kích hoạt cổng (không bật qua lại) và TRONG khu an toàn quanh cổng", () => {
    for (const [m, id] of [
      [hv, "han_van_bac"],
      [lh, "lang_hoang_nam"],
      [lh, "lang_hoang_bac"],
    ] as const) {
      const p = m.portal(id)!;
      expect(m.circleBlocked(p.spawn.x, p.spawn.y, PLAYER_RADIUS), `${id}: chỗ xuất hiện`).toBe(
        false,
      );
      expect(Math.hypot(p.spawn.x - p.x, p.spawn.y - p.y), `${id}: ngoài vòng r`).toBeGreaterThan(
        p.r,
      );
      expect(m.inSafe(p.x, p.y), `${id}: cổng trong khu an toàn`).toBe(true);
      expect(m.inSafe(p.spawn.x, p.spawn.y), `${id}: chỗ xuất hiện an toàn`).toBe(true);
    }
  });

  it("thêm cổng bắc KHÔNG đổi ô của Hàn Vân: seed vẫn 20262122, vẫn 128 x 128, cổng nam Âm Sương giữ nguyên", () => {
    expect(hv.def.seed).toBe(20262122);
    expect([hv.def.w, hv.def.h]).toEqual([128, 128]);
    expect(hv.portal("han_van_nam")!.toMap).toBe("am_suong");
    expect(hv.portals.map((p) => p.id)).toEqual(["han_van_nam", "han_van_bac"]);
  });

  it("Lang Hoang: 128 x 112, trạm Tuyết Đao Quan sát cổng nam (cách ~10 ô), vùng hoang Lang Hoang, không hang trùm", () => {
    expect([lh.def.w, lh.def.h]).toEqual([128, 112]);
    expect(lh.def.name).toBe("Lang Hoang");
    expect(lh.townName).toBe("Tuyết Đao Quan");
    expect(lh.wildName).toBe("Lang Hoang");
    expect(lh.def.lair).toBeUndefined();
    const down = lh.portal("lang_hoang_nam")!;
    const d = Math.hypot(down.x - lh.townPx.x, down.y - lh.townPx.y) / TILE;
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(14);
    expect(lh.inSafe(lh.townPx.x, lh.townPx.y)).toBe(true);
    // cổng bắc tới Uy Vân Kinh có từ A2 lát 2 (cặp cổng kiểm ở `uy-van.test.ts`)
    expect(lh.portals.map((p) => p.id)).toEqual(["lang_hoang_nam", "lang_hoang_bac"]);
  });

  it("quái tự nhiên CHỈ là sáu loài sói Hóa Thần (62) + hai trùm (D1 #1466 lát A3 / B): `monsterCap` tổng 64, không rơi về MONSTER_CAP mặc định của Lạc Hà", () => {
    const SOI: Record<string, number> = {
      da_lang: 16,
      hac_phong_lang: 12,
      huyet_nguyet_lang: 10,
      xich_diem_lang: 12,
      thuong_nguyet_lang: 4,
      ngan_nguyet_lang: 8,
      lang_vuong: 1,
      thien_lang_vuong: 1,
    };
    expect(lh.def.monsterCap).toEqual(SOI);
    expect(lh.monsterCap).toEqual(SOI);
    expect(Object.values(SOI).reduce((a, b) => a + b, 0)).toBe(64);
    for (const id of Object.keys(MONSTER_CAP)) expect(lh.monsterCapOf(id), id).toBe(SOI[id] ?? 0);
  });
});
