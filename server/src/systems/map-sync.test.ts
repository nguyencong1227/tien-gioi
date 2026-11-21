// Tệp bản đồ sinh ra phải KHỚP từng byte với đầu ra của `map:build` (như `map:build -- --check`): sửa tệp soạn `shared/maps/<id>.json` mà quên chạy `npm run map:build -w server`
// thì máy chủ (đọc `<id>.logic.json`) và client (gói `map:<id>`) chạy dữ liệu cũ. Trước đây việc kiểm này chỉ chạy tay, không nằm trong `npm test` / CI.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PROCEDURAL_MAPS,
  TILE,
  formatTiledJson,
  mapDefFromTiled,
  type TiledMap,
} from "@tien-gioi/shared";
import { buildFullTiledMap, buildLogicRuntimeMap, buildVisualRuntimeMap } from "./map-builder";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("tệp bản đồ khớp đầu ra của map:build (không lệch giữa tệp soạn, bản chạy logic và gói hình)", () => {
  for (const { id } of PROCEDURAL_MAPS)
    it(`${id}: shared/maps/${id}.json, ${id}.logic.json và packs/map-${id}/visual.json đúng bản sinh chuẩn`, () => {
      const authoring = path.join(root, "shared/maps", `${id}.json`);
      const src = existsSync(authoring)
        ? authoring
        : path.join(root, "shared/maps", `${id}.logic.json`);
      const base = JSON.parse(readFileSync(src, "utf8")) as TiledMap;
      const full = buildFullTiledMap(base, mapDefFromTiled(base, TILE).tiles!);
      const want: [string, string][] = [
        [authoring, formatTiledJson(full)],
        [
          path.join(root, "shared/maps", `${id}.logic.json`),
          formatTiledJson(buildLogicRuntimeMap(full)),
        ],
        [
          path.join(root, "client/public/packs", `map-${id}`, "visual.json"),
          formatTiledJson(buildVisualRuntimeMap(full)),
        ],
      ];
      for (const [file, text] of want)
        expect(
          readFileSync(file, "utf8") === text,
          `${path.relative(root, file)} lệch bản sinh chuẩn: chạy npm run map:build -w server -- ${id}`,
        ).toBe(true);
    });
});
