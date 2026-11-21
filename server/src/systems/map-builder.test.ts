import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFullTiledMap,
  buildLogicRuntimeMap,
  buildVisualLayersFromLogic,
  buildVisualRuntimeMap,
  GID_GRASS,
  GID_ROCK,
  GID_TALL_GRASS,
  GID_TREE_CANOPY,
  GID_TREE_TRUNK,
} from "./map-builder";
import { checkTiledMapComplete } from "./map-visual-checks";
import { formatTiledJson, mapDefFromTiled, T, TILE, type TiledMap } from "@tien-gioi/shared";

const mapsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../shared/maps");

describe("map-builder", () => {
  it("sinh đúng 3 lớp ground, decor, over từ ma trận logic", () => {
    const width = 4;
    const height = 4;
    // 4x4:
    // hàng 0: Grass, Grass, Tree, Rock
    // hàng 1: Grass, TallGrass, Grass, Grass
    // hàng 2: Dirt, Dirt, Grass, Grass
    // hàng 3: Water, Water, Grass, Grass
    const tiles = new Uint8Array([
      T.Grass,
      T.Grass,
      T.Tree,
      T.Rock,
      T.Grass,
      T.TallGrass,
      T.Grass,
      T.Grass,
      T.Dirt,
      T.Dirt,
      T.Grass,
      T.Grass,
      T.Water,
      T.Water,
      T.Grass,
      T.Grass,
    ]);

    const { ground, decor, over, tileset } = buildVisualLayersFromLogic(tiles, width, height);

    expect(tileset.name).toBe("world");
    expect(tileset.firstgid).toBe(10);

    // Kích thước
    expect((ground.data as number[]).length).toBe(16);
    expect((decor.data as number[]).length).toBe(16);
    expect((over.data as number[]).length).toBe(16);

    // Grass ở (0, 0): ground nhận GID_GRASS
    expect((ground.data as number[])[0]).toBe(GID_GRASS);

    // Tree ở (2, 0): decor nhận GID_TREE_TRUNK
    expect((decor.data as number[])[0 * width + 2]).toBe(GID_TREE_TRUNK);

    // Tree ở (2, 0): over không có tán phía trên vì y-1 ngoài biên
    // Đặt Tree ở (1, 2) xem over ở (1, 1)
    const tilesWithTree = new Uint8Array(16).fill(T.Grass);
    tilesWithTree[2 * width + 1] = T.Tree; // Tree ở (1, 2)
    const res2 = buildVisualLayersFromLogic(tilesWithTree, width, height);
    expect((res2.decor.data as number[])[2 * width + 1]).toBe(GID_TREE_TRUNK);
    expect((res2.over.data as number[])[1 * width + 1]).toBe(GID_TREE_CANOPY);

    // TallGrass ở (1, 1): decor nhận GID_TALL_GRASS
    expect((decor.data as number[])[1 * width + 1]).toBe(GID_TALL_GRASS);

    // Rock ở (3, 0): decor nhận GID_ROCK
    expect((decor.data as number[])[0 * width + 3]).toBe(GID_ROCK);

    // Dirt ở (0, 2): ground nhận GID_DIRT_BASE + offset
    const dirtGid = (ground.data as number[])[2 * width + 0];
    expect(dirtGid).toBeGreaterThanOrEqual(10);
    expect(dirtGid).toBeLessThan(650);

    // Water ở (0, 3): ground nhận GID_WATER_BASE + offset
    const waterGid = (ground.data as number[])[3 * width + 0];
    expect(waterGid).toBeGreaterThanOrEqual(10);
    expect(waterGid).toBeLessThan(650);
  });

  it("tất định (idempotent): chạy hai lần trên bản đồ thật cho cùng kết quả byte 100%", () => {
    const raw = readFileSync(path.join(mapsDir, "lac_ha.logic.json"), "utf8");
    const mapObj: TiledMap = JSON.parse(raw);
    const def = mapDefFromTiled(mapObj, TILE);

    const full1 = buildFullTiledMap(mapObj, def.tiles!);
    const text1 = formatTiledJson(full1);

    const full2 = buildFullTiledMap(mapObj, def.tiles!);
    const text2 = formatTiledJson(full2);

    expect(text1).toBe(text2);

    // Runtime logic
    const logic1 = buildLogicRuntimeMap(full1);
    const logicText1 = formatTiledJson(logic1);
    const logic2 = buildLogicRuntimeMap(full2);
    const logicText2 = formatTiledJson(logic2);
    expect(logicText1).toBe(logicText2);

    // Runtime visual
    const visual1 = buildVisualRuntimeMap(full1);
    const visualText1 = formatTiledJson(visual1);
    const visual2 = buildVisualRuntimeMap(full2);
    const visualText2 = formatTiledJson(visual2);
    expect(visualText1).toBe(visualText2);
  });

  it("bảo toàn lớp logic và objects (mở / lưu giả lập không đổi logic)", () => {
    const raw = readFileSync(path.join(mapsDir, "lac_ha.logic.json"), "utf8");
    const mapObj: TiledMap = JSON.parse(raw);
    const origDef = mapDefFromTiled(mapObj, TILE);

    const fullMap = buildFullTiledMap(mapObj, origDef.tiles!);
    const logicMap = buildLogicRuntimeMap(fullMap);
    const newDef = mapDefFromTiled(logicMap, TILE);

    // Ô logic khớp từng byte
    expect(Buffer.from(origDef.tiles!).equals(Buffer.from(newDef.tiles!))).toBe(true);
    // Objects khớp
    expect(origDef.town).toEqual(newDef.town);
    expect(origDef.portals).toEqual(newDef.portals);
  });

  it("tệp soạn fullMap sau khi build vượt qua toàn bộ kiểm tra map-visual-checks", () => {
    const raw = readFileSync(path.join(mapsDir, "lac_ha.logic.json"), "utf8");
    const mapObj: TiledMap = JSON.parse(raw);
    const def = mapDefFromTiled(mapObj, 32);

    const fullMap = buildFullTiledMap(mapObj, def.tiles!);
    const result = checkTiledMapComplete(fullMap, {
      label: "lac_ha_full",
      checkReachability: true,
    });
    expect(result.errors).toEqual([]);
  });
});
