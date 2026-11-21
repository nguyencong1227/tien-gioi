// S3a (#1206, docs/THIET_KE_BAN_DO_TILED.md mục 4a): sau khi chunk game tải xong (bộ tải THẬT `createGameLoader` với importer THẬT của tệp bản đồ), `getMap(id)` ở client phải là bản dựng
// từ ĐÚNG tệp mà máy chủ nhận (`TILED_MAP_FILES`), từng ô và từng trường, không phải bản sinh theo `seed`. Hôm nay hai bản cùng byte; từ S6 (tệp sửa tay) mới khác `seed`, nên có thêm ca
// dùng tệp sửa tay để chứng minh client đọc tệp chứ không đọc `seed`.
import { afterEach, describe, expect, it } from "vitest";
import {
  GameMap,
  PROCEDURAL_MAPS,
  T,
  TILE,
  adoptTiledMaps,
  getMap,
  mapDefFromTiled,
  type TiledMap,
} from "@tien-gioi/shared";
import { TILED_MAP_FILES, adoptTiledMapFiles } from "@tien-gioi/shared/src/map-files";
import { createGameLoader } from "./game-modules";

class FakeScene {}
const fakes = {
  phaser: async () => ({ default: {} }),
  scene: async () => ({ WorldScene: FakeScene as never }),
};

/** Trả lại trạng thái "đã nhận bản chuẩn" cho các ca sau (kho bản đồ là toàn cục của tệp test này). */
afterEach(() => {
  adoptTiledMapFiles();
});

/** Mọi ô của bản đồ, hàng trước cột sau. */
function cells(m: GameMap): number[] {
  const out: number[] = [];
  for (let y = 0; y < m.def.h; y++) for (let x = 0; x < m.def.w; x++) out.push(m.tileAt(x, y));
  return out;
}
/** Mọi dữ liệu game ngoài ô (trấn, cổng, hang, vùng sinh, monsterCap, tên...). */
const sansTiles = (m: GameMap) => JSON.stringify({ ...m.def, tiles: undefined });

describe("client sau khi tải chunk game: bản đồ = bản dựng từ tệp", () => {
  it("bộ tải THẬT (importer tệp thật): 4 bản đồ thường giống bản dựng độc lập từ tệp từng ô và từng trường", async () => {
    const loader = createGameLoader({
      ...fakes,
      mapFiles: () => import("@tien-gioi/shared/src/map-files"),
    });
    await loader.load();
    expect(Object.keys(TILED_MAP_FILES).sort()).toEqual(PROCEDURAL_MAPS.map((d) => d.id).sort());
    for (const id of Object.keys(TILED_MAP_FILES)) {
      const client = getMap(id)!;
      const fromFile = new GameMap(mapDefFromTiled(TILED_MAP_FILES[id], TILE));
      expect(client.def.w, id).toBe(fromFile.def.w);
      expect(cells(client), `${id}: ô`).toEqual(cells(fromFile));
      expect(sansTiles(client), `${id}: trường ngoài ô`).toBe(sansTiles(fromFile));
      expect(client.townPx, id).toEqual(fromFile.townPx);
      expect(client.portals, id).toEqual(fromFile.portals);
    }
  });

  it("tệp SỬA TAY (khác `seed`): sau khi tải chunk game client thấy ô đã sửa, không phải bản sinh theo `seed`", async () => {
    const id = PROCEDURAL_MAPS[0]!.id;
    const seedMap = new GameMap(PROCEDURAL_MAPS[0]!);
    const edited = structuredClone(TILED_MAP_FILES[id]) as TiledMap;
    const logic = edited.layers.find((l) => l.name === "logic")!;
    const firstgid = edited.tilesets!.find((t) => t.name === "logic")!.firstgid;
    // ô cỏ đầu tiên ngoài viền thành đá: khác `seed` ở đúng một ô
    let at = -1;
    for (let i = 0; i < seedMap.def.w * seedMap.def.h && at < 0; i++) {
      const x = i % seedMap.def.w;
      const y = Math.floor(i / seedMap.def.w);
      if (x > 2 && y > 2 && seedMap.tileAt(x, y) === T.Grass) at = i;
    }
    expect(at).toBeGreaterThan(0);
    (logic.data as number[])[at] = firstgid + T.Rock;
    const x = at % seedMap.def.w;
    const y = Math.floor(at / seedMap.def.w);
    const loader = createGameLoader({
      ...fakes,
      mapFiles: async () => ({ adoptTiledMapFiles: () => adoptTiledMaps({ [id]: edited }) }),
    });
    await loader.load();
    expect(getMap(id)!.tileAt(x, y)).toBe(T.Rock);
    expect(seedMap.tileAt(x, y)).toBe(T.Grass); // đối chứng: bản sinh theo seed khác ở đúng ô đó
  });
});
