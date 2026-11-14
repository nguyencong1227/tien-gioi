import { describe, it, expect } from "vitest";
import {
  CATEGORY_DEFINITIONS,
  UI_PANEL_SECTIONS,
  classifyModules,
  formatConsoleReport,
  formatMarkdownReport,
} from "./analyze-bundle.mjs";

describe("M7.15: analyze-bundle (Phân tích thành phần gói tải JavaScript)", () => {
  it("định nghĩa đầy đủ 6 nhóm thành phần chính", () => {
    expect(CATEGORY_DEFINITIONS.length).toBe(6);
    const ids = CATEGORY_DEFINITIONS.map((c) => c.id);
    expect(ids).toContain("phaser");
    expect(ids).toContain("colyseus");
    expect(ids).toContain("shared");
    expect(ids).toContain("dom_ui");
    expect(ids).toContain("game_code");
    expect(ids).toContain("other");
  });

  it("khớp chính xác module theo quy tắc nhóm", () => {
    const phaserDef = CATEGORY_DEFINITIONS.find((c) => c.id === "phaser")!;
    expect(phaserDef.match("node_modules/phaser/dist/phaser.js")).toBe(true);
    expect(phaserDef.match("client/src/ui.ts")).toBe(false);

    const colyseusDef = CATEGORY_DEFINITIONS.find((c) => c.id === "colyseus")!;
    expect(colyseusDef.match("node_modules/colyseus.js/build/index.js")).toBe(true);
    expect(colyseusDef.match("node_modules/@colyseus/schema/build/index.js")).toBe(true);

    const sharedDef = CATEGORY_DEFINITIONS.find((c) => c.id === "shared")!;
    expect(sharedDef.match("shared/src/items.ts")).toBe(true);

    const domUiDef = CATEGORY_DEFINITIONS.find((c) => c.id === "dom_ui")!;
    expect(domUiDef.match("client/src/ui.ts")).toBe(true);
    expect(domUiDef.match("client/src/skills-panel.ts")).toBe(true);

    const gameDef = CATEGORY_DEFINITIONS.find((c) => c.id === "game_code")!;
    expect(gameDef.match("client/src/scenes/WorldScene.ts")).toBe(true);
  });

  it("khai báo danh sách bảng UI có tiềm năng tách lazy loading", () => {
    expect(UI_PANEL_SECTIONS.length).toBeGreaterThanOrEqual(6);
    const ids = UI_PANEL_SECTIONS.map((p) => p.id);
    expect(ids).toContain("skills_modal");
    expect(ids).toContain("limbo_modal");
    expect(ids).toContain("sect_modal");
    expect(ids).toContain("shop_modal");
    expect(ids).toContain("keys_modal");
    expect(ids).toContain("quest_modal");
  });

  it("classifyModules phân loại và tính tỷ lệ chính xác", () => {
    const mockModules = {
      "node_modules/phaser/dist/phaser.js": { renderedLength: 80000 },
      "node_modules/colyseus.js/index.js": { renderedLength: 10000 },
      "shared/src/items.ts": { renderedLength: 5000 },
      "client/src/ui.ts": { renderedLength: 5000 },
    };
    const totalGzip = 20000;

    const result = classifyModules(mockModules, totalGzip);

    expect(result.totalRenderedLength).toBe(100000);
    expect(result.totalModules).toBe(4);

    const phaserCat = result.categories.find((c) => c.id === "phaser")!;
    expect(phaserCat.rawBytes).toBe(80000);
    expect(phaserCat.rawPct).toBe(80);
    expect(phaserCat.estGzipBytes).toBe(16000);

    const uiCat = result.categories.find((c) => c.id === "dom_ui")!;
    expect(uiCat.rawBytes).toBe(5000);
    expect(uiCat.rawPct).toBe(5);

    expect(result.topModules[0].id).toBe("node_modules/phaser/dist/phaser.js");
  });

  it("formatConsoleReport và formatMarkdownReport định dạng đầy đủ tiêu đề và bảng", () => {
    const mockReport = {
      chunkFileName: "assets/index-test.js",
      rawBytes: 1000000,
      rawKb: 976.56,
      gzipBytes: 300000,
      gzipKb: 292.97,
      gzipDefaultBytes: 305000,
      viteRawKb: 1000,
      viteGzipKb: 305,
      viteRemainingBudgetKb: 215,
      budgetMaxGzipKb: 520,
      remainingBudgetKb: 227.03,
      breakdown: {
        totalRenderedLength: 1000000,
        totalModules: 10,
        categories: [
          {
            id: "phaser",
            name: "Phaser 3 Engine",
            description: "Test Phaser",
            rawBytes: 800000,
            rawKb: 781.25,
            rawPct: 80,
            estGzipBytes: 240000,
            estGzipKb: 234.38,
            estGzipPct: 80,
            moduleCount: 1,
          },
        ],
        topModules: [
          {
            id: "node_modules/phaser/dist/phaser.js",
            rawBytes: 800000,
            rawKb: 781.25,
            rawPct: 80,
            estGzipBytes: 240000,
            estGzipKb: 234.38,
          },
        ],
      },
      uiPanels: UI_PANEL_SECTIONS,
      lazyOptimization: {
        totalPanelRawBytes: 60000,
        totalPanelRawKb: 58.59,
        estGzipSavedBytes: 18000,
        estGzipSavedKb: 17.58,
        projectedInitialGzipKb: 275.39,
        projectedRemainingBudgetKb: 244.61,
        projectedViteGzipKb: 287,
      },
    };

    const consoleReport = formatConsoleReport(mockReport);
    expect(consoleReport).toContain("BÁO CÁO THÀNH PHẦN GÓI TẢI CLIENT");
    expect(consoleReport).toContain("Phaser 3 Engine");
    expect(consoleReport).toContain("TIỀM NĂNG TÁCH DYNAMIC IMPORT()");

    const mdReport = formatMarkdownReport(mockReport);
    expect(mdReport).toContain("# Báo cáo Phân tích Thành phần Gói tải Client");
    expect(mdReport).toContain("## 1. Cơ cấu theo Nhóm thành phần");
    expect(mdReport).toContain("## 4. Đề xuất Kiến trúc cho Dev A");
  });
});
