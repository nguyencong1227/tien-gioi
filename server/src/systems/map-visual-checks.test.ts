import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkTiledMapComplete,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  isGidInTilesets,
  parseGid,
  visualLayerViolations,
} from "./map-visual-checks";
import type { TiledLayer, TiledMap } from "@tien-gioi/shared";

const mapsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../shared/maps");

describe("map-visual-checks", () => {
  describe("parseGid & isGidInTilesets", () => {
    it("tách đúng gid và cờ lật", () => {
      expect(parseGid(0)).toEqual({ gid: 0, flipped: false });
      expect(parseGid(42)).toEqual({ gid: 42, flipped: false });

      const flippedH = (42 | FLIPPED_HORIZONTALLY_FLAG) >>> 0;
      expect(parseGid(flippedH)).toEqual({ gid: 42, flipped: true });

      const flippedBoth = (100 | FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG) >>> 0;
      expect(parseGid(flippedBoth)).toEqual({ gid: 100, flipped: true });
    });

    it("kiểm tra gid thuộc tileset đã khai báo", () => {
      const tilesets = [
        { firstgid: 1, tilecount: 10 },
        { firstgid: 50, tilecount: 20 },
      ];
      expect(isGidInTilesets(0, tilesets)).toBe(true); // 0 là ô trống, luôn hợp lệ
      expect(isGidInTilesets(1, tilesets)).toBe(true);
      expect(isGidInTilesets(10, tilesets)).toBe(true);
      expect(isGidInTilesets(11, tilesets)).toBe(false);
      expect(isGidInTilesets(49, tilesets)).toBe(false);
      expect(isGidInTilesets(50, tilesets)).toBe(true);
      expect(isGidInTilesets(69, tilesets)).toBe(true);
      expect(isGidInTilesets(70, tilesets)).toBe(false);
    });

    it("tileset không có tilecount thì nhận mọi gid >= firstgid", () => {
      const tilesets = [{ firstgid: 10 }];
      expect(isGidInTilesets(5, tilesets)).toBe(false);
      expect(isGidInTilesets(10, tilesets)).toBe(true);
      expect(isGidInTilesets(9999, tilesets)).toBe(true);
    });
  });

  describe("visualLayerViolations", () => {
    const tilesets = [{ firstgid: 10, tilecount: 50 }];

    it("bắt lỗi khi width hoặc height của layer lệch map", () => {
      const layer: TiledLayer = {
        name: "ground",
        type: "tilelayer",
        width: 10,
        height: 10,
        data: new Array(100).fill(10),
      };
      const errs = visualLayerViolations(layer, 12, 10, tilesets, "map_test");
      expect(errs.some((e) => e.includes("width (10) khác width bản đồ (12)"))).toBe(true);
    });

    it("bắt lỗi khi data không đủ hoặc thừa ô", () => {
      const layer: TiledLayer = {
        name: "decor",
        type: "tilelayer",
        data: [10, 11, 12],
      };
      const errs = visualLayerViolations(layer, 2, 2, tilesets, "map_test");
      expect(errs.some((e) => e.includes("có 3 ô, cần 4"))).toBe(true);
    });

    it("bắt lỗi khi ô có gid ngoài tileset, báo đúng toạ độ", () => {
      // Bản đồ 4x2 ô, ô tại (2, 1) index = 1 * 4 + 2 = 6 mang gid 999
      const data = [10, 10, 10, 10, 10, 10, 999, 10];
      const layer: TiledLayer = {
        name: "ground",
        type: "tilelayer",
        data,
      };
      const errs = visualLayerViolations(layer, 4, 2, tilesets, "map_test");
      expect(errs.some((e) => e.includes("ô (2, 1) có gid 999 không thuộc tileset"))).toBe(true);
    });

    it("chấp nhận cờ lật ở lớp hình nếu allowFlipInVisual = true", () => {
      const flipped = (15 | FLIPPED_HORIZONTALLY_FLAG) >>> 0;
      const data = [10, flipped, 12, 13];
      const layer: TiledLayer = {
        name: "ground",
        type: "tilelayer",
        data,
      };
      const errs = visualLayerViolations(layer, 2, 2, tilesets, "map_test", {
        allowFlipInVisual: true,
      });
      expect(errs).toEqual([]);
    });

    it("bắt lỗi cờ lật khi allowFlipInVisual = false", () => {
      const flipped = (15 | FLIPPED_HORIZONTALLY_FLAG) >>> 0;
      const data = [10, flipped, 12, 13];
      const layer: TiledLayer = {
        name: "ground",
        type: "tilelayer",
        data,
      };
      const errs = visualLayerViolations(layer, 2, 2, tilesets, "map_test", {
        allowFlipInVisual: false,
      });
      expect(errs.some((e) => e.includes("chứa cờ lật không được phép"))).toBe(true);
    });
  });

  describe("checkTiledMapComplete", () => {
    it("bắt cờ lật ở lớp logic", () => {
      const rawText = readFileSync(path.join(mapsDir, "lac_ha.logic.json"), "utf8");
      const mapObj: TiledMap = JSON.parse(rawText);
      const logicLayer = mapObj.layers.find((l) => l.name === "logic")!;

      // Đột biến: gắn cờ lật vào ô đầu tiên của logic layer
      const orig = (logicLayer.data as number[])[0];
      (logicLayer.data as number[])[0] = (orig | FLIPPED_HORIZONTALLY_FLAG) >>> 0;

      const result = checkTiledMapComplete(mapObj, { label: "lac_ha_mutant" });
      expect(
        result.errors.some((e) => e.includes("lớp logic ô (0, 0) không được chứa cờ lật")),
      ).toBe(true);
    });

    it("kiểm tra 4 bản đồ logic hiện có trong repo: đều xanh 100% không có lỗi", () => {
      const mapIds = ["lac_ha", "hac_phong", "am_suong", "han_van"];
      for (const id of mapIds) {
        const rawText = readFileSync(path.join(mapsDir, `${id}.logic.json`), "utf8");
        const mapObj: TiledMap = JSON.parse(rawText);
        const result = checkTiledMapComplete(mapObj, { label: id, checkReachability: true });
        expect(result.errors).toEqual([]);
        expect(result.mapDef).toBeDefined();
      }
    });

    it("kiểm tra lớp hình bổ sung trên bản đồ thật hợp lệ", () => {
      const rawText = readFileSync(path.join(mapsDir, "lac_ha.logic.json"), "utf8");
      const mapObj: TiledMap = JSON.parse(rawText);

      // Thêm tileset hình và lớp ground
      mapObj.tilesets!.push({ firstgid: 100, name: "terrain", tilecount: 200 } as any);
      mapObj.layers.push({
        name: "ground",
        type: "tilelayer",
        width: mapObj.width,
        height: mapObj.height,
        data: new Array(mapObj.width * mapObj.height).fill(105),
      });

      const result = checkTiledMapComplete(mapObj, { label: "lac_ha_visual" });
      expect(result.errors).toEqual([]);
    });

    it("test đột biến: lớp hình sai gid bị bắt đúng toạ độ", () => {
      const rawText = readFileSync(path.join(mapsDir, "lac_ha.logic.json"), "utf8");
      const mapObj: TiledMap = JSON.parse(rawText);

      mapObj.tilesets!.push({ firstgid: 100, name: "terrain", tilecount: 50 } as any);
      const groundData = new Array(mapObj.width * mapObj.height).fill(105);
      // Gid 9999 ở ô (15, 20)
      const targetIdx = 20 * mapObj.width + 15;
      groundData[targetIdx] = 9999;

      mapObj.layers.push({
        name: "ground",
        type: "tilelayer",
        width: mapObj.width,
        height: mapObj.height,
        data: groundData,
      });

      const result = checkTiledMapComplete(mapObj, { label: "lac_ha_mutant" });
      expect(
        result.errors.some((e) => e.includes("ô (15, 20) có gid 9999 không thuộc tileset")),
      ).toBe(true);
    });

    it("test: spawnZone không hợp lệ (loài lạ) bị bắt bởi checkTiledMapComplete", () => {
      const rawText = readFileSync(path.join(mapsDir, "lac_ha.logic.json"), "utf8");
      const mapObj: TiledMap = JSON.parse(rawText);
      const objLayer = mapObj.layers.find((l) => l.name === "objects") as any;
      objLayer.objects.push({
        id: 99,
        name: "bad_zone",
        class: "spawnZone",
        x: 320,
        y: 320,
        width: 64,
        height: 64,
        properties: [{ name: "monster", value: "loai_khong_ton_tai" }],
      });
      const result = checkTiledMapComplete(mapObj, { label: "lac_ha_spawn" });
      expect(
        result.errors.some(
          (e) => e.includes("loại quái không tồn tại") || e.includes("loai_khong_ton_tai"),
        ),
      ).toBe(true);
    });
  });
});
