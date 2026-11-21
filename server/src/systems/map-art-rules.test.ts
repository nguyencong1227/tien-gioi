import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { T } from "@tien-gioi/shared";
import {
  analyzeTreeCanopyOverlaps,
  analyzeNarrowSandStrips,
  analyzeSandWaterBorders,
  resolveTreeCanopies,
} from "./map-art-rules";
import { buildVisualLayersFromLogic, GID_TREE_CANOPY, GID_TREE_TRUNK } from "./map-builder";

// Helper nạp dữ liệu ô logic từ file map json
function loadMapTiles(mapId: string): { tiles: Uint8Array; width: number; height: number } {
  const filePath = resolve(__dirname, `../../../shared/maps/${mapId}.json`);
  const json = JSON.parse(readFileSync(filePath, "utf-8"));
  const width = json.width as number;
  const height = json.height as number;
  const logicLayer = json.layers.find((l: any) => l.name === "logic");
  if (!logicLayer) {
    throw new Error(`Map ${mapId} không có layer 'logic'`);
  }
  // Dữ liệu Tiled lưu giá trị T + 1 (firstgid = 1)
  const tiles = new Uint8Array(width * height);
  for (let i = 0; i < logicLayer.data.length; i++) {
    tiles[i] = (logicLayer.data[i] - 1) as number;
  }
  return { tiles, width, height };
}

describe("Quy tắc lớp hình bản đồ Tiled (S4b, Issue #1222)", () => {
  describe("1. Số đo trên 4 bản đồ thật (khớp 100% số đo của Dev B)", () => {
    it("đo chính xác tỷ lệ tán cây đè lên thân cây khác (42-46%)", () => {
      // lac_ha: 559 / 1205
      const lacHa = loadMapTiles("lac_ha");
      const resLacHa = analyzeTreeCanopyOverlaps(lacHa.tiles, lacHa.width, lacHa.height);
      expect(resLacHa.totalTrees).toBe(1205);
      expect(resLacHa.overlapCount).toBe(559);
      expect(Math.round(resLacHa.overlapRate * 1000) / 10).toBe(46.4);

      // hac_phong: 748 / 1722
      const hacPhong = loadMapTiles("hac_phong");
      const resHacPhong = analyzeTreeCanopyOverlaps(
        hacPhong.tiles,
        hacPhong.width,
        hacPhong.height,
      );
      expect(resHacPhong.totalTrees).toBe(1722);
      expect(resHacPhong.overlapCount).toBe(748);
      expect(Math.round(resHacPhong.overlapRate * 1000) / 10).toBe(43.4);

      // am_suong: 764 / 1737
      const amSuong = loadMapTiles("am_suong");
      const resAmSuong = analyzeTreeCanopyOverlaps(amSuong.tiles, amSuong.width, amSuong.height);
      expect(resAmSuong.totalTrees).toBe(1737);
      expect(resAmSuong.overlapCount).toBe(764);
      expect(Math.round(resAmSuong.overlapRate * 1000) / 10).toBe(44.0);

      // han_van: 914 / 2167
      const hanVan = loadMapTiles("han_van");
      const resHanVan = analyzeTreeCanopyOverlaps(hanVan.tiles, hanVan.width, hanVan.height);
      expect(resHanVan.totalTrees).toBe(2167);
      expect(resHanVan.overlapCount).toBe(914);
      expect(Math.round(resHanVan.overlapRate * 1000) / 10).toBe(42.2);
    });

    it("đo chính xác số ô cát thuộc dải hẹp rộng 1 ô (175 / 240 / 441 / 236)", () => {
      // lac_ha: 175 / 353
      const lacHa = loadMapTiles("lac_ha");
      const resLacHa = analyzeNarrowSandStrips(lacHa.tiles, lacHa.width, lacHa.height);
      expect(resLacHa.totalSand).toBe(353);
      expect(resLacHa.narrowCount).toBe(175);
      expect(Math.round(resLacHa.narrowRate * 1000) / 10).toBe(49.6);

      // hac_phong: 240 / 437
      const hacPhong = loadMapTiles("hac_phong");
      const resHacPhong = analyzeNarrowSandStrips(hacPhong.tiles, hacPhong.width, hacPhong.height);
      expect(resHacPhong.totalSand).toBe(437);
      expect(resHacPhong.narrowCount).toBe(240);
      expect(Math.round(resHacPhong.narrowRate * 1000) / 10).toBe(54.9);

      // am_suong: 441 / 912
      const amSuong = loadMapTiles("am_suong");
      const resAmSuong = analyzeNarrowSandStrips(amSuong.tiles, amSuong.width, amSuong.height);
      expect(resAmSuong.totalSand).toBe(912);
      expect(resAmSuong.narrowCount).toBe(441);
      expect(Math.round(resAmSuong.narrowRate * 1000) / 10).toBe(48.4);

      // han_van: 236 / 617
      const hanVan = loadMapTiles("han_van");
      const resHanVan = analyzeNarrowSandStrips(hanVan.tiles, hanVan.width, hanVan.height);
      expect(resHanVan.totalSand).toBe(617);
      expect(resHanVan.narrowCount).toBe(236);
      expect(Math.round(resHanVan.narrowRate * 1000) / 10).toBe(38.2);
    });

    it("đo chính xác số cặp cạnh tiếp giáp cát - nước (304 / 402 / 836 / 404)", () => {
      // lac_ha: 304 cặp
      const lacHa = loadMapTiles("lac_ha");
      const resLacHa = analyzeSandWaterBorders(lacHa.tiles, lacHa.width, lacHa.height);
      expect(resLacHa.borderPairs).toBe(304);
      expect(resLacHa.sandAdjacentToWaterCount).toBe(233);

      // hac_phong: 402 cặp
      const hacPhong = loadMapTiles("hac_phong");
      const resHacPhong = analyzeSandWaterBorders(hacPhong.tiles, hacPhong.width, hacPhong.height);
      expect(resHacPhong.borderPairs).toBe(402);
      expect(resHacPhong.sandAdjacentToWaterCount).toBe(292);

      // am_suong: 836 cặp
      const amSuong = loadMapTiles("am_suong");
      const resAmSuong = analyzeSandWaterBorders(amSuong.tiles, amSuong.width, amSuong.height);
      expect(resAmSuong.borderPairs).toBe(836);
      expect(resAmSuong.sandAdjacentToWaterCount).toBe(615);

      // han_van: 404 cặp
      const hanVan = loadMapTiles("han_van");
      const resHanVan = analyzeSandWaterBorders(hanVan.tiles, hanVan.width, hanVan.height);
      expect(resHanVan.borderPairs).toBe(404);
      expect(resHanVan.sandAdjacentToWaterCount).toBe(319);
    });
  });

  describe("2. Giải pháp xếp cây cluster_top (loại bỏ hoàn toàn tán đè thân)", () => {
    it("trong cụm rừng dọc 3 ô, chỉ ô cỏ trên đỉnh nhận tán cây", () => {
      // Ma trận 3 x 4:
      // (1, 1), (1, 2), (1, 3) là Tree; (1, 0) là Grass
      const w = 3;
      const h = 4;
      const tiles = new Uint8Array(w * h).fill(T.Grass);
      tiles[1 * w + 1] = T.Tree;
      tiles[2 * w + 1] = T.Tree;
      tiles[3 * w + 1] = T.Tree;

      // Legacy: ô (1, 0), (1, 1), (1, 2) đều có tán
      // Nhưng (1, 1) và (1, 2) là thân cây -> bị đè
      const legacyOver = resolveTreeCanopies(tiles, w, h, "legacy");
      expect(legacyOver[0 * w + 1]).toBe(1); // trên cỏ
      expect(legacyOver[1 * w + 1]).toBe(1); // đè lên thân cây (1, 1)!
      expect(legacyOver[2 * w + 1]).toBe(1); // đè lên thân cây (1, 2)!

      // Cluster top: chỉ ô (1, 0) nhận tán
      const clusterOver = resolveTreeCanopies(tiles, w, h, "cluster_top");
      expect(clusterOver[0 * w + 1]).toBe(1); // trên cỏ (che đầu khi đi ngang đỉnh rừng)
      expect(clusterOver[1 * w + 1]).toBe(0); // KHÔNG đè lên thân cây
      expect(clusterOver[2 * w + 1]).toBe(0); // KHÔNG đè lên thân cây
    });

    it("chế độ cluster_top loại bỏ 100% ô tán đè thân trên cả 4 bản đồ thật", () => {
      for (const mapId of ["lac_ha", "hac_phong", "am_suong", "han_van"]) {
        const map = loadMapTiles(mapId);
        const layers = buildVisualLayersFromLogic(map.tiles, map.width, map.height, {
          treeCanopyMode: "cluster_top",
        });

        const decor = layers.decor.data as number[];
        const over = layers.over.data as number[];

        let overlapCount = 0;
        for (let i = 0; i < decor.length; i++) {
          if (decor[i] === GID_TREE_TRUNK && over[i] === GID_TREE_CANOPY) {
            overlapCount++;
          }
        }

        // Tỷ lệ đè thân triệt tiêu hoàn toàn
        expect(overlapCount).toBe(0);
      }
    });

    it("chế độ mặc định 'legacy' giữ nguyên 100% tương thích với bản Tiled S4", () => {
      const map = loadMapTiles("lac_ha");
      const layersDefault = buildVisualLayersFromLogic(map.tiles, map.width, map.height);
      const layersLegacy = buildVisualLayersFromLogic(map.tiles, map.width, map.height, {
        treeCanopyMode: "legacy",
      });

      expect(layersDefault.over.data).toEqual(layersLegacy.over.data);
      expect(layersDefault.decor.data).toEqual(layersLegacy.decor.data);
      expect(layersDefault.ground.data).toEqual(layersLegacy.ground.data);
    });
  });

  describe("3. Phân loại dải cát hẹp", () => {
    it("phân loại đúng dải cát chạy dọc, dải chạy ngang và ô đơn lẻ", () => {
      const w = 5;
      const h = 5;
      const tiles = new Uint8Array(w * h).fill(T.Grass);

      // Dải dọc: (1, 1), (1, 2), (1, 3)
      tiles[1 * w + 1] = T.Sand;
      tiles[2 * w + 1] = T.Sand;
      tiles[3 * w + 1] = T.Sand;

      // Dải ngang: (3, 1), (3, 2), (3, 3) -> y=3: x=1,2,3 là Sand
      tiles[3 * w + 1] = T.Sand;
      tiles[3 * w + 2] = T.Sand;
      tiles[3 * w + 3] = T.Sand;

      // Ô đơn lẻ: (4, 4)
      tiles[4 * w + 4] = T.Sand;

      const res = analyzeNarrowSandStrips(tiles, w, h);
      const vertical = res.narrowCells.filter((c) => c.direction === "vertical");
      const horizontal = res.narrowCells.filter((c) => c.direction === "horizontal");
      const isolated = res.narrowCells.filter((c) => c.direction === "isolated");

      expect(vertical.length).toBe(2); // (1, 1) và (1, 2) là dải dọc (ô 1, 3 giao với dải ngang)
      expect(horizontal.length).toBe(2); // (3, 2) và (3, 3) là dải ngang
      expect(isolated.length).toBe(1); // (4, 4)
    });
  });
});
