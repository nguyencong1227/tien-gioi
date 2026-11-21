// Kiểm liên thông bản đồ cho người chơi (docs/THIET_KE_BAN_DO_TILED.md mục 5.4): bản đồ thật qua; bản đồ bị ĐỘT BIẾN (khoanh cổng bằng đá, bao kín trấn, chặn tâm trấn) thì bị bắt đúng chỗ.
import { beforeAll, describe, expect, it } from "vitest";
import {
  GameMap,
  MAPS,
  T,
  TILE,
  bakeTiledMap,
  getMap,
  mapDefFromTiled,
  type TiledMap,
} from "@tien-gioi/shared";
import { adoptTiledMapFiles } from "@tien-gioi/shared/src/map-files";
import { reachabilityViolations } from "./map-checks";

// Kiểm CHÍNH các tệp Tiled (server nhận tệp lúc defineRooms)
beforeAll(() => {
  adoptTiledMapFiles();
});

/** Dựng `GameMap` từ bản đồ thật `id` sau khi sửa lớp logic bằng `edit(đặt ô, w, h)`. */
function mutated(
  id: string,
  edit: (set: (x: number, y: number, t: T) => void, w: number, h: number) => void,
): GameMap {
  const json: TiledMap = structuredClone(bakeTiledMap(getMap(id)!));
  const w = json.width;
  const h = json.height;
  const data = json.layers.find((l) => l.name === "logic")!.data as number[];
  edit(
    (x, y, t) => {
      if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = 1 + t;
    },
    w,
    h,
  );
  return new GameMap(mapDefFromTiled(json, TILE));
}

describe("reachabilityViolations", () => {
  for (const def of MAPS)
    it(`${def.id} (bản đồ thật): từ tâm trấn tới được mọi cổng`, () => {
      expect(reachabilityViolations(getMap(def.id)!)).toEqual([]);
    });

  it("ĐỘT BIẾN: khoanh kín chỗ xuất hiện của cổng bắc Lạc Hà bằng vòng đá => bắt 'chỗ xuất hiện'", () => {
    const base = getMap("lac_ha")!;
    const p = base.portals[0]!;
    const sx = Math.floor(p.spawn.x / TILE);
    const sy = Math.floor(p.spawn.y / TILE);
    const sealed = mutated("lac_ha", (set) => {
      for (let y = sy - 3; y <= sy + 3; y++)
        for (let x = sx - 3; x <= sx + 3; x++)
          if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) === 3) set(x, y, T.Rock);
    });
    const errs = reachabilityViolations(sealed);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join("\n")).toMatch(
      /chỗ xuất hiện của cổng lac_ha_bac .* không tới được từ tâm trấn/,
    );
  });

  it("ĐIỀU KHIỂN: cùng vòng đá nhưng chừa một khe 2 ô thì VẪN tới được (kiểm không quá chặt)", () => {
    const base = getMap("lac_ha")!;
    const p = base.portals[0]!;
    const sx = Math.floor(p.spawn.x / TILE);
    const sy = Math.floor(p.spawn.y / TILE);
    const gap = mutated("lac_ha", (set) => {
      for (let y = sy - 3; y <= sy + 3; y++)
        for (let x = sx - 3; x <= sx + 3; x++)
          if (
            Math.max(Math.abs(x - sx), Math.abs(y - sy)) === 3 &&
            !(y === sy + 3 && (x === sx || x === sx + 1))
          )
            set(x, y, T.Rock);
    });
    // khe phía nam (hướng về trấn) mở thì không còn cô lập
    expect(reachabilityViolations(gap)).toEqual([]);
  });

  it("ĐỘT BIẾN: bao kín cả trấn bằng vành núi đá dày => mọi cổng không tới được từ trấn", () => {
    const base = getMap("lac_ha")!;
    const { cx, cy } = base.def.town;
    const walled = mutated("lac_ha", (set, w, h) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d >= base.def.town.r + 3 && d <= base.def.town.r + 5) set(x, y, T.Rock);
        }
    });
    const errs = reachabilityViolations(walled);
    for (const portal of base.portals) expect(errs.join("\n")).toContain(`tâm cổng ${portal.id}`);
  });

  it("ĐỘT BIẾN: chặn ngay tâm trấn bằng đá => 'không đứng được'", () => {
    const base = getMap("lac_ha")!;
    const { cx, cy } = base.def.town;
    const blocked = mutated("lac_ha", (set) => {
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let x = cx - 1; x <= cx + 1; x++) set(x, y, T.Rock);
    });
    expect(reachabilityViolations(blocked).join("\n")).toMatch(/tâm trấn .* không đứng được/);
  });
});
