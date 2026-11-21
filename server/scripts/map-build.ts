// Công cụ sinh lớp hình bo góc Wang blob 47 ô cho bản đồ Tiled (docs/THIET_KE_BAN_DO_TILED.md lát cắt S4, Issue #1207).
// Xuất:
//   1. shared/maps/<id>.json: tệp soạn đủ lớp (logic, ground, decor, over, objects, tilesets)
//   2. shared/maps/<id>.logic.json: bản chạy logic cho server & getMap
//   3. client/public/packs/map-<id>/visual.json: bản chạy hình cho gói tải theo nhu cầu của client
//
// Chạy:
//   npm run map:build -w server                 # Build toàn bộ bản đồ
//   npm run map:build -w server -- lac_ha       # Chỉ build lac_ha
//   npm run map:build -w server -- --check      # Chỉ kiểm tra không ghi đè

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  TILE,
  formatTiledJson,
  mapDefFromTiled,
  PROCEDURAL_MAPS,
  type TiledMap,
} from "@tien-gioi/shared";
import {
  buildFullTiledMap,
  buildLogicRuntimeMap,
  buildVisualRuntimeMap,
} from "../src/systems/map-builder";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const mapsDir = path.resolve(repoRoot, "shared/maps");
const packsDir = path.resolve(repoRoot, "client/public/packs");

const checkOnly = process.argv.includes("--check");
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const targetFilter = args[0] ? args[0].replace(/\.(logic\.)?json$/, "") : undefined;

const mapIds = targetFilter ? [targetFilter] : PROCEDURAL_MAPS.map((m) => m.id);

let bad = 0;

for (const id of mapIds) {
  // Tìm tệp nguồn: ưu tiên <id>.json, nếu chưa có thì lấy <id>.logic.json
  const fullJsonPath = path.join(mapsDir, `${id}.json`);
  const logicJsonPath = path.join(mapsDir, `${id}.logic.json`);

  let srcPath = fullJsonPath;
  if (!existsSync(srcPath)) {
    srcPath = logicJsonPath;
  }
  if (!existsSync(srcPath)) {
    console.error(`✗ Không tìm thấy tệp nguồn cho bản đồ '${id}' trong ${mapsDir}`);
    bad++;
    continue;
  }

  const rawText = readFileSync(srcPath, "utf8");
  const baseMap: TiledMap = JSON.parse(rawText);
  const def = mapDefFromTiled(baseMap, TILE);

  // Sinh 3 tệp
  const fullMap = buildFullTiledMap(baseMap, def.tiles!);
  const logicMap = buildLogicRuntimeMap(fullMap);
  const visualMap = buildVisualRuntimeMap(fullMap);

  const fullText = formatTiledJson(fullMap);
  const logicText = formatTiledJson(logicMap);
  const visualText = formatTiledJson(visualMap);

  const targetFull = path.join(mapsDir, `${id}.json`);
  const targetLogic = path.join(mapsDir, `${id}.logic.json`);
  const packMapDir = path.join(packsDir, `map-${id}`);
  const targetVisual = path.join(packMapDir, "visual.json");

  const filesToCheckOrWrite = [
    { target: targetFull, text: fullText, label: `shared/maps/${id}.json (tệp soạn)` },
    { target: targetLogic, text: logicText, label: `shared/maps/${id}.logic.json (logic runtime)` },
    {
      target: targetVisual,
      text: visualText,
      label: `client/public/packs/map-${id}/visual.json (visual runtime)`,
    },
  ];

  if (checkOnly) {
    for (const f of filesToCheckOrWrite) {
      const cur = existsSync(f.target) ? readFileSync(f.target, "utf8") : null;
      if (cur !== f.text) {
        console.error(`✗ ${f.label}: khác bản sinh chuẩn (chạy npm run map:build -w server)`);
        bad++;
      } else {
        console.log(`✓ ${f.label}`);
      }
    }
  } else {
    mkdirSync(mapsDir, { recursive: true });
    mkdirSync(packMapDir, { recursive: true });

    for (const f of filesToCheckOrWrite) {
      writeFileSync(f.target, f.text);
      console.log(`✓ Đã ghi ${f.label} (${(f.text.length / 1024).toFixed(1)} KB)`);
    }
  }
}

if (bad > 0) {
  process.exit(1);
} else {
  console.log("----------------------------------------");
  console.log(`✓ Hoàn thành map:build cho ${mapIds.length} bản đồ!`);
}
