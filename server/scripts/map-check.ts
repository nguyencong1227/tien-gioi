// Công cụ kiểm tra toàn diện bản đồ Tiled (docs/THIET_KE_BAN_DO_TILED.md lát cắt S4, Issue #1207).
// Chạy:
//   npm run map:check -w server            # Kiểm tra mọi bản đồ trong shared/maps/
//   npm run map:check -w server -- <id>    # Kiểm tra một bản đồ chỉ định (vd: lac_ha)

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { portalLinkViolations, type MapDef, type TiledMap } from "@tien-gioi/shared";
import { checkTiledMapComplete } from "../src/systems/map-visual-checks";

const here = path.dirname(fileURLToPath(import.meta.url));
const mapsDir = path.resolve(here, "../../shared/maps");

// Lấy tham số id nếu có (loại bỏ các cờ như --check nếu có)
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const targetFilter = args[0]
  ? args[0].replace(/\.(logic\.)?json$/, "").replace(/^shared\/maps\//, "")
  : undefined;

if (!existsSync(mapsDir)) {
  console.error(`✗ Thư mục bản đồ không tồn tại: ${mapsDir}`);
  process.exit(1);
}

const files = readdirSync(mapsDir).filter((f) => f.endsWith(".json"));
const candidateFiles = targetFilter
  ? files.filter((f) => f.startsWith(`${targetFilter}.`) || f === `${targetFilter}.json`)
  : files;

if (candidateFiles.length === 0) {
  if (targetFilter) {
    console.error(`✗ Không tìm thấy tệp bản đồ nào khớp với '${targetFilter}' trong ${mapsDir}`);
  } else {
    console.error(`✗ Không có tệp bản đồ .json nào trong ${mapsDir}`);
  }
  process.exit(1);
}

let totalErrors = 0;
const validMapsById = new Map<string, MapDef>();
const parsedMapsByFile = new Map<string, { mapObj: TiledMap; mapDef?: MapDef }>();

console.log(`Kiểm tra ${candidateFiles.length} tệp bản đồ trong shared/maps...`);

for (const file of candidateFiles) {
  const fullPath = path.join(mapsDir, file);
  const relPath = path.relative(path.resolve(here, "../.."), fullPath);

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (e) {
    console.error(`✗ ${relPath}: lỗi cú pháp JSON (${(e as Error).message})`);
    totalErrors++;
    continue;
  }

  const result = checkTiledMapComplete(rawJson, { label: relPath, checkReachability: true });
  if (result.errors.length > 0) {
    console.error(`✗ ${relPath}:`);
    for (const err of result.errors) {
      console.error(`   - ${err}`);
    }
    totalErrors += result.errors.length;
  } else {
    const mapObj = rawJson as TiledMap;
    const layerCount = Array.isArray(mapObj.layers) ? mapObj.layers.length : 0;
    console.log(`✓ ${relPath} (${mapObj.width}x${mapObj.height} ô, ${layerCount} lớp)`);
    if (result.mapDef) {
      // Ưu tiên bản tệp soạn <id>.json khi kiểm tra liên kết cổng toàn game
      if (file.endsWith(".logic.json")) {
        if (!validMapsById.has(result.mapDef.id)) {
          validMapsById.set(result.mapDef.id, result.mapDef);
        }
      } else {
        validMapsById.set(result.mapDef.id, result.mapDef);
      }
    }
    parsedMapsByFile.set(file, { mapObj, mapDef: result.mapDef });
  }
}

// Kiểm tra tính nhất quán giữa tệp soạn <id>.json và bản chạy <id>.logic.json (nếu có cả hai)
const baseIds = new Set(candidateFiles.map((f) => f.replace(/\.(logic\.)?json$/, "")));
for (const id of baseIds) {
  const fullFile = `${id}.json`;
  const logicFile = `${id}.logic.json`;
  const full = parsedMapsByFile.get(fullFile);
  const logic = parsedMapsByFile.get(logicFile);

  if (full && logic && full.mapDef && logic.mapDef) {
    // So sánh dữ liệu ô logic
    const fullTiles = Buffer.from(full.mapDef.tiles ?? []);
    const logicTiles = Buffer.from(logic.mapDef.tiles ?? []);
    if (!fullTiles.equals(logicTiles)) {
      console.error(`✗ Lệch lớp logic giữa tệp soạn ${fullFile} và bản chạy ${logicFile}!`);
      totalErrors++;
    }
    // So sánh kích thước
    if (full.mapDef.w !== logic.mapDef.w || full.mapDef.h !== logic.mapDef.h) {
      console.error(
        `✗ Lệch kích thước giữa ${fullFile} (${full.mapDef.w}x${full.mapDef.h}) và ${logicFile} (${logic.mapDef.w}x${logic.mapDef.h})!`,
      );
      totalErrors++;
    }
  }
}

// Kiểm tra liên kết cổng hai chiều giữa các bản đồ (chỉ khi kiểm tra toàn bộ hoặc có từ 2 bản đồ trở lên)
const distinctMaps = Array.from(validMapsById.values());
if (distinctMaps.length > 1) {
  const portalErrs = portalLinkViolations(distinctMaps);
  if (portalErrs.length > 0) {
    console.error(`✗ Lỗi liên kết cổng giữa các bản đồ:`);
    for (const err of portalErrs) {
      console.error(`   - ${err}`);
    }
    totalErrors += portalErrs.length;
  }
}

console.log("----------------------------------------");
if (totalErrors > 0) {
  console.error(`✗ Thất bại: phát hiện ${totalErrors} lỗi trên các tệp bản đồ!`);
  process.exit(1);
} else {
  console.log(`✓ Thành công: mọi bản đồ đều hợp lệ, liên thông và chuẩn hoá!`);
  process.exit(0);
}
