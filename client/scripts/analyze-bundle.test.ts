import { describe, it, expect } from "vitest";
import {
  CATEGORY_DEFINITIONS,
  UI_PANEL_SECTIONS,
  classifyModules,
  formatConsoleReport,
  formatMarkdownReport,
  splitCodeAndMapData,
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

  it("classifyModules phân loại và tính tỷ lệ chính xác theo kích thước minified esbuild", () => {
    // Giả lập: Phaser có mã nguồn thô lớn nhưng sau khi nén thì tỷ lệ giảm
    const mockModules = {
      "node_modules/phaser/dist/phaser.js": {
        renderedLength: 80000,
        // Giả lập code với comment dài để esbuild minify nén sâu
        code: "/* " + "A".repeat(50000) + " */ function foo() { return 1; }",
      },
      "node_modules/colyseus.js/index.js": { renderedLength: 10000, minBytes: 8000 },
      "shared/src/items.ts": { renderedLength: 5000, minBytes: 4000 },
      "client/src/ui.ts": { renderedLength: 5000, minBytes: 3000 },
    };
    const totalGzip = 20000;

    const result = classifyModules(mockModules, totalGzip);

    expect(result.totalRenderedLength).toBe(100000);
    expect(result.totalModules).toBe(4);

    const phaserCat = result.categories.find((c) => c.id === "phaser")!;
    expect(phaserCat.rawBytes).toBe(80000);
    expect(phaserCat.rawPct).toBe(80);
    // esbuild nén comment 50KB đi, chỉ còn vài chục bytes cho hàm foo
    expect(phaserCat.minBytes).toBeLessThan(100);

    const colyseusCat = result.categories.find((c) => c.id === "colyseus")!;
    expect(colyseusCat.minBytes).toBe(8000);

    const uiCat = result.categories.find((c) => c.id === "dom_ui")!;
    expect(uiCat.rawBytes).toBe(5000);
    expect(uiCat.minBytes).toBe(3000);

    // Module xếp hạng theo minBytes giảm dần
    expect(result.topModules[0].id).toBe("node_modules/colyseus.js/index.js");
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
        totalMinBytes: 500000,
        totalModules: 10,
        categories: [
          {
            id: "phaser",
            name: "Phaser 3 Engine",
            description: "Test Phaser",
            rawBytes: 800000,
            rawKb: 781.25,
            rawPct: 80,
            minBytes: 300000,
            minKb: 292.97,
            minPct: 60,
            estGzipBytes: 180000,
            estGzipKb: 175.78,
            estGzipPct: 60,
            moduleCount: 1,
          },
        ],
        topModules: [
          {
            id: "node_modules/phaser/dist/phaser.js",
            rawBytes: 800000,
            rawKb: 781.25,
            rawPct: 80,
            minBytes: 300000,
            minKb: 292.97,
            minPct: 60,
            estGzipBytes: 180000,
            estGzipKb: 175.78,
          },
        ],
      },
      uiPanels: UI_PANEL_SECTIONS,
      lazyOptimization: {
        totalPanelRawBytes: 60000,
        totalPanelRawKb: 58.59,
        totalPanelMinBytes: 28000,
        totalPanelMinKb: 27.34,
        estGzipSavedBytes: 14000,
        estGzipSavedKb: 13.67,
        projectedInitialGzipKb: 279.3,
        projectedRemainingBudgetKb: 240.7,
        projectedViteGzipKb: 291,
      },
    };

    const consoleReport = formatConsoleReport(mockReport);
    expect(consoleReport).toContain("BÁO CÁO THÀNH PHẦN GÓI TẢI CLIENT");
    expect(consoleReport).toContain("Phaser 3 Engine");
    expect(consoleReport).toContain("TIỀM NĂNG TÁCH DYNAMIC IMPORT()");

    const mdReport = formatMarkdownReport(mockReport);
    expect(mdReport).toContain("# Báo cáo Phân tích Thành phần Gói tải Client");
    expect(mdReport).toContain("## 1. Cơ cấu theo Nhóm thành phần");
    expect(mdReport).toContain("## 4. Quyết định & Đề xuất Kiến trúc cho Nhóm");
  });
  it("splitCodeAndMapData (#1283): chỉ tách `map-files-<băm>.js` KHI ngân sách khai báo trần riêng; tên Rollup có tiền tố `assets/`", () => {
    const chunks = [
      { fileName: "assets/index-DMwuQVDW.js" },
      { fileName: "assets/map-files-Ab1_-x.js" },
      { fileName: "assets/map-files.js" }, // không băm: KHÔNG được miễn
      { fileName: "assets/mapfiles-x.js" },
      { fileName: "assets/xmap-files-a.js" },
      { fileName: "assets/WorldScene-ceN6fDXA.js" },
    ];
    const r = splitCodeAndMapData(chunks, 48);
    expect(r.data.map((c) => c.fileName)).toEqual(["assets/map-files-Ab1_-x.js"]);
    expect(r.code).toHaveLength(5);
    expect(r.code.map((c) => c.fileName)).toContain("assets/map-files.js");
    expect(r.code.map((c) => c.fileName)).toContain("assets/xmap-files-a.js");

    // chưa khai báo trần riêng (hoặc sai kiểu): KHÔNG miễn trừ ai, như `checkTotalJsGzip`
    for (const limit of [undefined, "48", null]) {
      const none = splitCodeAndMapData(chunks, limit as unknown as number | undefined);
      expect(none.data).toEqual([]);
      expect(none.code).toHaveLength(6);
    }
    // không có chunk nào khớp: không ai bị miễn
    expect(splitCodeAndMapData([{ fileName: "assets/index-a.js" }], 48).data).toEqual([]);
  });

  it("báo cáo (#1283): dư địa tính trên MÃ và có dòng dữ liệu bản đồ; báo cáo cũ thiếu trường mới vẫn in được", () => {
    const base = {
      chunkFileName: "6 chunk JS (khởi động: assets/index-x.js)",
      startupGzipKb: 195.77,
      rawBytes: 2000000,
      rawKb: 1953.12,
      gzipBytes: 560000,
      gzipKb: 545.88,
      gzipDefaultBytes: 570000,
      viteRawKb: 2000,
      viteGzipKb: 562.3,
      viteRemainingBudgetKb: -0.75,
      budgetMaxGzipKb: 548,
      remainingBudgetKb: 14.52,
      breakdown: {
        totalRenderedLength: 0,
        totalMinBytes: 0,
        totalModules: 0,
        categories: [],
        topModules: [],
      },
      uiPanels: UI_PANEL_SECTIONS,
      lazyOptimization: {
        totalPanelRawBytes: 0,
        totalPanelRawKb: 0,
        totalPanelMinBytes: 0,
        totalPanelMinKb: 0,
        estGzipSavedBytes: 0,
        estGzipSavedKb: 0,
        projectedInitialGzipKb: 0,
        projectedRemainingBudgetKb: 0,
        projectedViteGzipKb: 0,
      },
    };
    const withData = {
      ...base,
      codeGzipKb: 533.48,
      viteCodeGzipKb: 548.75,
      mapFilesGzipKb: 12.4,
      mapFilesLimitKb: 48,
    };
    const c = formatConsoleReport(withData);
    expect(c).toContain("Ngân sách CI     : 533.48 / 548 KiB (Dư: 14.52 KiB) [chỉ mã]");
    expect(c).toContain("Dữ liệu bản đồ   : 12.4 / 48 KiB (trần riêng, không tính vào trần mã)");
    const md = formatMarkdownReport(withData);
    expect(md).toContain("cho MÃ JS (chưa tính dữ liệu bản đồ)");
    expect(md).toContain("**12.4 KiB** / trần riêng **48 KB**");

    // báo cáo cũ (không có trường mới): số tổng mọi chunk, không có dòng dữ liệu bản đồ
    const old = formatConsoleReport(base);
    expect(old).toContain("Ngân sách CI     : 545.88 / 548 KiB (Dư: 14.52 KiB)");
    expect(old).not.toContain("[chỉ mã]");
    expect(old).not.toContain("Dữ liệu bản đồ");
    expect(formatMarkdownReport(base)).not.toContain("trần riêng");
  });
});
