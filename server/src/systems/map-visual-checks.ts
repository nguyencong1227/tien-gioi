// Kiểm tra lớp HÌNH và tính toàn vẹn của tệp bản đồ Tiled (docs/THIET_KE_BAN_DO_TILED.md mục 5.1 và S4, #1207).
// Chạy trong `map:check` và test: kiểm tra kích thước lớp hình, gid thuộc tileset nhúng, cờ lật, và liên thông cho người chơi.

import {
  GameMap,
  mapDefFromTiled,
  tiledViolations,
  type MapDef,
  type TiledLayer,
  type TiledMap,
  type TiledTileset,
} from "@tien-gioi/shared";
import { reachabilityViolations } from "./map-checks";

export const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
export const FLIPPED_VERTICALLY_FLAG = 0x40000000;
export const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
export const ROTATED_HEX_120_FLAG = 0x10000000;
export const FLIPPED_FLAGS = 0xf0000000;
export const GID_MASK = 0x0fffffff;

export interface VisualCheckOptions {
  /** Cho phép cờ lật ở lớp hình (mặc định: true) */
  allowFlipInVisual?: boolean;
}

/** Tách cờ lật khỏi GID của Tiled */
export function parseGid(rawVal: number): { gid: number; flipped: boolean } {
  const u = rawVal >>> 0;
  return {
    gid: u & GID_MASK,
    flipped: (u & FLIPPED_FLAGS) !== 0,
  };
}

/** Kiểm tra một gid có thuộc bất kỳ tileset nào đã khai báo */
export function isGidInTilesets(
  gid: number,
  tilesets: (TiledTileset & { tilecount?: number })[],
): boolean {
  if (gid === 0) return true; // 0 là ô trống (luôn hợp lệ trong Tiled)
  for (const ts of tilesets) {
    if (typeof ts.firstgid !== "number") continue;
    let count = typeof ts.tilecount === "number" ? ts.tilecount : Infinity;
    // Tileset 'logic' chỉ có đúng 8 ô (LOGIC_TILE_COUNT), không bao trùm các gid khác
    if (ts.name === "logic" && count === Infinity) {
      count = 8;
    }
    if (gid >= ts.firstgid && gid < ts.firstgid + count) {
      return true;
    }
  }
  return false;
}

/**
 * Kiểm tra vi phạm của một lớp hình (`ground`, `decor`, `over`, hoặc bất kỳ lớp tilelayer nào khác `logic`).
 * Báo lỗi gọn: tệp/lớp + toạ độ ô.
 */
export function visualLayerViolations(
  layer: TiledLayer,
  mapWidth: number,
  mapHeight: number,
  tilesets: (TiledTileset & { tilecount?: number })[] | undefined,
  mapLabel: string,
  options: VisualCheckOptions = {},
): string[] {
  const errs: string[] = [];
  const layerLabel = `${mapLabel}: lớp '${layer.name}'`;

  if (layer.width !== undefined && layer.width !== mapWidth) {
    errs.push(`${layerLabel}: width (${layer.width}) khác width bản đồ (${mapWidth})`);
  }
  if (layer.height !== undefined && layer.height !== mapHeight) {
    errs.push(`${layerLabel}: height (${layer.height}) khác height bản đồ (${mapHeight})`);
  }

  const data = layer.data;
  if (!Array.isArray(data)) {
    errs.push(`${layerLabel}: data phải là mảng số (không nén / base64)`);
    return errs;
  }

  const expectedCount = mapWidth * mapHeight;
  if (data.length !== expectedCount) {
    errs.push(`${layerLabel}: có ${data.length} ô, cần ${expectedCount}`);
    return errs;
  }

  const allowFlip = options.allowFlipInVisual !== false;
  const declaredTilesets = Array.isArray(tilesets) ? tilesets : [];

  let badGidCount = 0;
  let badFlipCount = 0;

  for (let i = 0; i < data.length; i++) {
    const rawVal = data[i];
    if (typeof rawVal !== "number" || !Number.isInteger(rawVal)) {
      if (badGidCount++ < 3) {
        errs.push(
          `${layerLabel}: ô (${i % mapWidth}, ${Math.floor(i / mapWidth)}) không phải số nguyên: ${String(rawVal)}`,
        );
      }
      continue;
    }

    const { gid, flipped } = parseGid(rawVal);

    if (flipped && !allowFlip) {
      if (badFlipCount++ < 3) {
        errs.push(
          `${layerLabel}: ô (${i % mapWidth}, ${Math.floor(i / mapWidth)}) chứa cờ lật không được phép`,
        );
      }
    }

    if (!isGidInTilesets(gid, declaredTilesets)) {
      if (badGidCount++ < 3) {
        errs.push(
          `${layerLabel}: ô (${i % mapWidth}, ${Math.floor(i / mapWidth)}) có gid ${gid} không thuộc tileset nào đã khai báo`,
        );
      }
    }
  }

  if (badGidCount > 3) {
    errs.push(`${layerLabel}: còn ${badGidCount - 3} ô gid không hợp lệ nữa`);
  }
  if (badFlipCount > 3) {
    errs.push(`${layerLabel}: còn ${badFlipCount - 3} ô cờ lật không hợp lệ nữa`);
  }

  return errs;
}

/**
 * Kiểm tra toàn diện một đối tượng bản đồ Tiled (logic, objects, liên thông, và các lớp hình).
 */
export function checkTiledMapComplete(
  json: unknown,
  options: { label?: string; checkReachability?: boolean } = {},
): { errors: string[]; mapDef?: MapDef } {
  const errs: string[] = [];
  const label = options.label ?? "bản đồ";

  // 1. Kiểm tra cấu trúc logic và objects bằng hàm thuần của shared
  const baseErrs = tiledViolations(json);
  errs.push(...baseErrs);

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { errors: errs };
  }

  const mapObj = json as TiledMap;
  const layers = Array.isArray(mapObj.layers) ? mapObj.layers : [];
  const tilesets = Array.isArray(mapObj.tilesets) ? mapObj.tilesets : [];

  // 2. Kiểm tra cấm cờ lật ở lớp logic (nếu có lớp logic)
  const logicLayer = layers.find((l) => l.name === "logic" && l.type === "tilelayer");
  if (logicLayer && Array.isArray(logicLayer.data)) {
    let logicFlipCount = 0;
    const w = mapObj.width || 0;
    for (let i = 0; i < logicLayer.data.length; i++) {
      const raw = logicLayer.data[i];
      if (typeof raw === "number") {
        const { flipped } = parseGid(raw);
        if (flipped) {
          if (logicFlipCount++ < 3) {
            errs.push(
              `${label}: lớp logic ô (${i % w}, ${Math.floor(i / w)}) không được chứa cờ lật`,
            );
          }
        }
      }
    }
    if (logicFlipCount > 3) {
      errs.push(`${label}: lớp logic còn ${logicFlipCount - 3} ô chứa cờ lật nữa`);
    }
  }

  // 3. Kiểm tra các lớp hình (ground, decor, over hoặc bất kỳ tilelayer nào khác logic)
  for (const l of layers) {
    if (l.type === "tilelayer" && l.name !== "logic") {
      const visualErrs = visualLayerViolations(l, mapObj.width, mapObj.height, tilesets, label);
      errs.push(...visualErrs);
    }
  }

  // 4. Nếu logic và objects không có lỗi, dựng GameMap và kiểm tra liên thông
  let mapDef: MapDef | undefined;
  if (baseErrs.length === 0 && options.checkReachability !== false) {
    try {
      mapDef = mapDefFromTiled(json, 32);
      const gameMap = new GameMap(mapDef);
      const reachErrs = reachabilityViolations(gameMap);
      errs.push(...reachErrs);
    } catch (e) {
      errs.push(`${label}: lỗi khi dựng GameMap để kiểm tra liên thông: ${(e as Error).message}`);
    }
  }

  return { errors: errs, mapDef };
}
