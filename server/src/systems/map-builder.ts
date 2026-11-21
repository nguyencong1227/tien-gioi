// Logic dựng lớp hình autotile Wang blob 47 ô cho bản đồ Tiled (docs/THIET_KE_BAN_DO_TILED.md lát cắt S4, Issue #1207).
// Sinh 3 lớp hình:
//   - ground: nền đã bo góc (đất, nước, cát, sàn trấn, cỏ) bằng Wang blob 47 ô
//   - decor: chi tiết cảnh vật cùng cao độ (cỏ cao, đá, thân cây 1 ô chặn đường)
//   - over: tán cây phủ phía trên thân cây (ở hàng trên) che đầu nhân vật

import {
  T,
  type TiledLayer,
  type TiledMap,
  type TiledProperty,
  type TiledTileset,
} from "@tien-gioi/shared";
import { neighborMaskClamped, resolveAutotile, toTileGid } from "@tien-gioi/shared/src/autotile";
import { resolveTreeCanopies, type TreeCanopyMode } from "./map-art-rules";

export * from "./map-art-rules";

/** GID cơ sở cho tileset nhúng 'world' */
export const TILES_WORLD_FIRSTGID = 10;
export const TILES_WORLD_COLUMNS = 22;
export const TILES_WORLD_COUNT = 640;

// Các variant offset trong tileset_floor (cột x hàng ô):
// Cát: khối (0, 0) -> col 0, row 0
// Đất: khối (0, 1) -> col 0, row 7
// Nước: khối (0, 3) -> col 0, row 21
export const VARIANT_SAND = { col: 0, row: 0 };
export const VARIANT_DIRT = { col: 0, row: 7 };
export const VARIANT_WATER = { col: 0, row: 21 };
export const VARIANT_STONE = { col: 11, row: 7 };

// GID đơn lẻ cho các vật thể phụ
export const GID_GRASS = 10;
export const GID_TREE_TRUNK = 620;
export const GID_TREE_CANOPY = 621;
export const GID_ROCK = 622;
export const GID_TALL_GRASS = 623;

/** Định nghĩa tileset nhúng ĐÙN MÉP (extruded) chuẩn cho lớp hình */
export function createExtrudedWorldTileset(firstgid = TILES_WORLD_FIRSTGID): TiledTileset & {
  tilewidth: number;
  tileheight: number;
  margin: number;
  spacing: number;
  columns: number;
  tilecount: number;
  image: string;
} {
  return {
    firstgid,
    name: "world",
    tilewidth: 16,
    tileheight: 16,
    margin: 1, // Đùn mép 1 px
    spacing: 2, // Spacing 2 px chống rách viền (bleeding)
    columns: TILES_WORLD_COLUMNS,
    tilecount: TILES_WORLD_COUNT,
    image: "tileset_world.png",
  };
}

export interface BuiltVisualLayers {
  ground: TiledLayer;
  decor: TiledLayer;
  over: TiledLayer;
  tileset: TiledTileset;
}

export interface BuildVisualOptions {
  /** Chế độ xếp tán cây (mặc định 'legacy' tương thích hoàn toàn bản Tiled S4) */
  treeCanopyMode?: TreeCanopyMode;
}

/**
 * Sinh 3 lớp hình (ground, decor, over) từ ma trận ô logic theo luật autotile Wang blob 47 ô.
 * Hàm thuần tất định: cùng input luôn cho cùng output.
 */
export function buildVisualLayersFromLogic(
  tiles: Uint8Array,
  width: number,
  height: number,
  options: BuildVisualOptions = {},
): BuiltVisualLayers {
  const size = width * height;
  const groundData = new Array<number>(size).fill(GID_GRASS);
  const decorData = new Array<number>(size).fill(0); // 0 = trong suốt
  const overData = new Array<number>(size).fill(0); // 0 = trong suốt
  const canopyMode = options.treeCanopyMode ?? "legacy";
  const canopyMask = resolveTreeCanopies(tiles, width, height, canopyMode);

  // Helper lấy ô logic có kẹp mép
  const tileAt = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    return tiles[cy * width + cx]!;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const t = tiles[idx]!;

      // 1. LỚP NỀN (ground): bo góc bằng Wang blob 47 ô
      if (t === T.Dirt) {
        const mask = neighborMaskClamped(
          (nx, ny) => tileAt(nx, ny) === T.Dirt,
          width,
          height,
          x,
          y,
        );
        const coord = resolveAutotile(mask);
        groundData[idx] = toTileGid(TILES_WORLD_FIRSTGID, TILES_WORLD_COLUMNS, VARIANT_DIRT, coord);
      } else if (t === T.Water) {
        const mask = neighborMaskClamped(
          (nx, ny) => tileAt(nx, ny) === T.Water,
          width,
          height,
          x,
          y,
        );
        const coord = resolveAutotile(mask);
        groundData[idx] = toTileGid(
          TILES_WORLD_FIRSTGID,
          TILES_WORLD_COLUMNS,
          VARIANT_WATER,
          coord,
        );
      } else if (t === T.Sand) {
        const mask = neighborMaskClamped(
          (nx, ny) => tileAt(nx, ny) === T.Sand,
          width,
          height,
          x,
          y,
        );
        const coord = resolveAutotile(mask);
        groundData[idx] = toTileGid(TILES_WORLD_FIRSTGID, TILES_WORLD_COLUMNS, VARIANT_SAND, coord);
      } else if (t === T.Stone) {
        const mask = neighborMaskClamped(
          (nx, ny) => tileAt(nx, ny) === T.Stone,
          width,
          height,
          x,
          y,
        );
        const coord = resolveAutotile(mask);
        groundData[idx] = toTileGid(
          TILES_WORLD_FIRSTGID,
          TILES_WORLD_COLUMNS,
          VARIANT_STONE,
          coord,
        );
      } else {
        // Cỏ mặc định
        groundData[idx] = GID_GRASS;
      }

      // 2. LỚP TRANG TRÍ (decor)
      if (t === T.TallGrass) {
        decorData[idx] = GID_TALL_GRASS;
      } else if (t === T.Rock) {
        decorData[idx] = GID_ROCK;
      } else if (t === T.Tree) {
        // Thân cây 1 ô chặn đường nằm ở lớp decor
        decorData[idx] = GID_TREE_TRUNK;
      }

      // 3. LỚP PHỦ TRÊN ĐẦU (over)
      // Tán cây phủ trên đầu nhân vật sinh từ hàm quy hoạch resolveTreeCanopies duy nhất
      if (canopyMask[idx] === 1) {
        overData[idx] = GID_TREE_CANOPY;
      }
    }
  }

  const ground: TiledLayer = {
    type: "tilelayer",
    name: "ground",
    width,
    height,
    data: groundData,
  };

  const decor: TiledLayer = {
    type: "tilelayer",
    name: "decor",
    width,
    height,
    data: decorData,
  };

  const over: TiledLayer = {
    type: "tilelayer",
    name: "over",
    width,
    height,
    data: overData,
  };

  return {
    ground,
    decor,
    over,
    tileset: createExtrudedWorldTileset(),
  };
}

/**
 * Tạo tệp soạn đầy đủ `shared/maps/<id>.json` từ bản đồ logic, bổ sung/cập nhật 3 lớp hình.
 * Bảo toàn các lớp và thuộc tính tuỳ chỉnh khác (nếu người dùng đã mở Tiled thêm).
 */
export function buildFullTiledMap(baseMap: TiledMap, tiles: Uint8Array): TiledMap {
  const { ground, decor, over, tileset } = buildVisualLayersFromLogic(
    tiles,
    baseMap.width,
    baseMap.height,
  );

  // Giữ nguyên các lớp ngoài ground, decor, over
  const otherLayers = (baseMap.layers || []).filter(
    (l) => l.name !== "ground" && l.name !== "decor" && l.name !== "over",
  );

  // Thứ tự lớp chuẩn: logic (dưới cùng), ground, decor, over, objects
  const logicLayer = otherLayers.find((l) => l.name === "logic");
  const objectsLayer = otherLayers.find((l) => l.name === "objects");
  const restLayers = otherLayers.filter((l) => l.name !== "logic" && l.name !== "objects");

  const newLayers: TiledLayer[] = [];
  if (logicLayer) newLayers.push(logicLayer);
  newLayers.push(ground, decor, over);
  if (objectsLayer) newLayers.push(objectsLayer);
  newLayers.push(...restLayers);

  // Cập nhật danh sách tilesets: giữ tileset logic, thêm tileset world
  const tilesets = (baseMap.tilesets || []).filter((ts) => ts.name !== "world");
  tilesets.push(tileset);

  return {
    ...baseMap,
    layers: newLayers,
    tilesets,
  };
}

/**
 * Tạo tệp bản chạy logic `shared/maps/<id>.logic.json`:
 * Chỉ gồm lớp `logic` + `objects`, giữ nguyên các thuộc tính cần thiết cho server runtime.
 */
export function buildLogicRuntimeMap(fullMap: TiledMap): TiledMap {
  const logicLayer = fullMap.layers.find((l) => l.name === "logic");
  const objectsLayer = fullMap.layers.find((l) => l.name === "objects");

  const props: TiledProperty[] = fullMap.properties || [];

  const tilesets = (fullMap.tilesets || []).filter((ts) => ts.name === "logic");
  if (tilesets.length === 0) {
    tilesets.push({ firstgid: 1, name: "logic" });
  }

  const layers: TiledLayer[] = [];
  if (logicLayer) layers.push(logicLayer);
  if (objectsLayer) layers.push(objectsLayer);

  return {
    type: "map",
    orientation: fullMap.orientation,
    infinite: fullMap.infinite,
    width: fullMap.width,
    height: fullMap.height,
    tilewidth: fullMap.tilewidth,
    tileheight: fullMap.tileheight,
    properties: props,
    tilesets,
    layers,
  };
}

/**
 * Tạo tệp bản chạy hình `visual.json` (gói map:<id>):
 * Chỉ gồm 3 lớp `ground`, `decor`, `over` và tileset nhúng đùn mép.
 */
export function buildVisualRuntimeMap(fullMap: TiledMap): TiledMap {
  const visualLayers = fullMap.layers.filter(
    (l) => l.name === "ground" || l.name === "decor" || l.name === "over",
  );

  const tilesets = (fullMap.tilesets || []).filter((ts) => ts.name === "world");

  // Chỉ giữ các thuộc tính cần cho render
  const relevantProps = (fullMap.properties || []).filter(
    (p) => p.name === "schema" || p.name === "id" || p.name === "name",
  );

  return {
    type: "map",
    orientation: fullMap.orientation,
    infinite: fullMap.infinite,
    width: fullMap.width,
    height: fullMap.height,
    tilewidth: fullMap.tilewidth,
    tileheight: fullMap.tileheight,
    properties: relevantProps,
    tilesets,
    layers: visualLayers,
  };
}
