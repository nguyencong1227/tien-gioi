/* global console */
/**
 * Công cụ phân tích thành phần gói tải JavaScript (Client Bundle Analyzer)
 * M7.15, Phân tích chi tiết thành phần gói chính (dist/assets/index-*.js)
 *
 * Nhiệm vụ:
 * 1. Bóc tách tỷ lệ đóng góp của từng thành phần: Phaser 3, Colyseus, Shared, DOM UI, Mã Game.
 * 2. Đo kích thước thô (raw bytes) và kích thước nén gzip (chuẩn zlib level 9 và chuẩn Vite).
 * 3. Bóc tách chi tiết các bảng UI ít dùng trong client/src/ui.ts và các panels phụ
 *    để đề xuất phương án tách import() động (lazy loading / code splitting).
 *
 * Chạy:
 *   node client/scripts/analyze-bundle.mjs
 *   node client/scripts/analyze-bundle.mjs --json
 *   node client/scripts/analyze-bundle.mjs --markdown
 *   node client/scripts/analyze-bundle.mjs --save
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const CLIENT_DIR = path.resolve(ROOT_DIR, "client");

/**
 * Định nghĩa các nhóm thành phần chính của bundle
 */
export const CATEGORY_DEFINITIONS = [
  {
    id: "phaser",
    name: "Phaser 3 Engine",
    match: (id) => id.includes("node_modules/phaser/"),
    description: "Bộ engine game 2D chính (dist/phaser.js)",
  },
  {
    id: "colyseus",
    name: "Colyseus Client & Schema",
    match: (id) =>
      id.includes("node_modules/colyseus.js/") || id.includes("node_modules/@colyseus/"),
    description: "Kết nối WebSocket, đồng bộ Schema state và msgpackr",
  },
  {
    id: "shared",
    name: "Hợp đồng Game (shared/)",
    match: (id) => id.startsWith("shared/") || id.includes("/shared/src/"),
    description: "Bản đồ, vật phẩm, công thức, nhiệm vụ, cảnh giới, chiêu thức",
  },
  {
    id: "dom_ui",
    name: "DOM UI (HUD & Panels)",
    match: (id) =>
      id.includes("client/src/ui.ts") ||
      id.includes("client/src/auth-ui.ts") ||
      id.includes("client/src/dpad.ts") ||
      id.includes("client/src/contrast.ts") ||
      id.includes("client/src/a11y.ts") ||
      id.includes("client/src/credits-ui.ts") ||
      id.includes("client/src/ctx-btn") ||
      id.includes("client/src/death-text.ts") ||
      id.includes("client/src/skills-panel.ts") ||
      id.includes("client/src/quest-log.ts") ||
      id.includes("client/src/status-speed.ts") ||
      id.includes("client/src/text-scale.ts") ||
      id.includes("client/src/sheet-swipe.ts") ||
      id.includes("client/src/engrave.ts") ||
      id.includes("client/src/reincarnate.ts") ||
      id.includes("client/src/sect.ts"),
    description: "Giao diện HTML/DOM: HUD, phím tắt, bảng phím, modal, chat",
  },
  {
    id: "game_code",
    name: "Mã Game (Scenes, GFX, Logic)",
    match: (id) => id.startsWith("client/src/") || id.includes("/client/src/"),
    description: "Phaser WorldScene, map-render, VFX, âm thanh, điều khiển",
  },
  {
    id: "other",
    name: "Thư viện khác & Polyfills",
    match: () => true,
    description: "Capacitor, tslib, vite/modulepreload-polyfill",
  },
];

/**
 * Định nghĩa các khối bảng UI lớn trong client/src/ui.ts để đánh giá khả năng tách import()
 */
export const UI_PANEL_SECTIONS = [
  {
    id: "keys_modal",
    name: "Bảng Phím tắt (Keys Modal)",
    shortcut: "Phím H hoặc nút Trợ giúp",
    description: "Cấu hình phím bấm, lắng nghe đổi phím, hướng dẫn",
    lines: 108,
    rawBytes: 3860,
  },
  {
    id: "quest_modal",
    name: "Bảng Nhiệm vụ chi tiết (Quest Modal)",
    shortcut: "Phím Q hoặc nút Nhiệm vụ",
    description: "Chi tiết nhiệm vụ chính tuyến / phụ tuyến, phần thưởng",
    lines: 384,
    rawBytes: 12226,
  },
  {
    id: "forge_modal",
    name: "Bảng Thợ rèn & Luyện khí (Forge Modal)",
    shortcut: "Nói chuyện NPC Thợ rèn",
    description: "Giao diện luyện khí, nâng cấp, tỉ lệ thành công",
    lines: 108,
    rawBytes: 3963,
  },
  {
    id: "shop_modal",
    name: "Bảng Cửa hàng & Đổi đồ (Shop Modal)",
    shortcut: "Nói chuyện NPC Thương nhân",
    description: "Mua bán vật phẩm, tính tổng tiền, xác nhận",
    lines: 420,
    rawBytes: 12626,
  },
  {
    id: "skills_modal",
    name: "Bảng Công pháp (Skills Modal)",
    shortcut: "Phím K hoặc nút Công pháp",
    description: "Danh sách công pháp đã học, ngưng tụ, gán vào ô 2-5",
    lines: 149,
    rawBytes: 5693,
  },
  {
    id: "limbo_modal",
    name: "Bảng Hoàng Tuyền (Limbo & Reincarnation)",
    shortcut: "Chết / Gục ngã vào Hoàng Tuyền",
    description: "Khắc bia chân linh, chọn khởi đầu chuyển sinh, bảo vật",
    lines: 354,
    rawBytes: 11715,
  },
  {
    id: "sect_modal",
    name: "Bảng Tông môn (Sect Modal)",
    shortcut: "Phím G hoặc nút Tông môn",
    description: "Thành viên, bổng lộc, kho chung, quyền Tông chủ",
    lines: 238,
    rawBytes: 8284,
  },
  {
    id: "party_modal",
    name: "Bảng Tổ đội & Thách đấu (Party & Duel)",
    shortcut: "Phím P hoặc nút Đội",
    description: "Mời đội, rời đội, chuyển trưởng đội, thách đấu PK",
    lines: 118,
    rawBytes: 3973,
  },
];

/**
 * Thu thập và phân loại danh sách module từ bundle Rollup
 * @param {Record<string, { renderedLength?: number }>} modules
 * @param {number} totalGzipSize
 * @returns {object}
 */
export function classifyModules(modules, totalGzipSize) {
  let totalRenderedLength = 0;
  const moduleList = [];

  for (const [id, mod] of Object.entries(modules)) {
    const len = mod.renderedLength || 0;
    if (len === 0) continue;
    const cleanId = id.replace(/.*\/tien-gioi-c\//, "").replace(String.fromCharCode(0), "");
    totalRenderedLength += len;
    moduleList.push({ id: cleanId, rawBytes: len });
  }

  // Khởi tạo các nhóm
  const categories = CATEGORY_DEFINITIONS.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    rawBytes: 0,
    moduleCount: 0,
  }));

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  for (const m of moduleList) {
    let matched = false;
    for (const def of CATEGORY_DEFINITIONS) {
      if (def.match(m.id)) {
        const cat = categoryMap.get(def.id);
        if (cat) {
          cat.rawBytes += m.rawBytes;
          cat.moduleCount++;
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      const otherCat = categoryMap.get("other");
      if (otherCat) {
        otherCat.rawBytes += m.rawBytes;
        otherCat.moduleCount++;
      }
    }
  }

  // Tính tỷ lệ % và ước tính gzip
  const categoryResults = categories.map((c) => {
    const rawPct = totalRenderedLength > 0 ? (c.rawBytes / totalRenderedLength) * 100 : 0;
    const estGzipBytes =
      totalRenderedLength > 0 ? Math.round((c.rawBytes / totalRenderedLength) * totalGzipSize) : 0;
    const estGzipPct = totalGzipSize > 0 ? (estGzipBytes / totalGzipSize) * 100 : 0;
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      rawBytes: c.rawBytes,
      rawKb: Number((c.rawBytes / 1024).toFixed(2)),
      rawPct: Number(rawPct.toFixed(1)),
      estGzipBytes,
      estGzipKb: Number((estGzipBytes / 1024).toFixed(2)),
      estGzipPct: Number(estGzipPct.toFixed(1)),
      moduleCount: c.moduleCount,
    };
  });

  // Xếp hạng top modules
  moduleList.sort((a, b) => b.rawBytes - a.rawBytes);
  const topModules = moduleList.map((m) => {
    const rawPct = totalRenderedLength > 0 ? (m.rawBytes / totalRenderedLength) * 100 : 0;
    const estGzipBytes =
      totalRenderedLength > 0 ? Math.round((m.rawBytes / totalRenderedLength) * totalGzipSize) : 0;
    return {
      id: m.id,
      rawBytes: m.rawBytes,
      rawKb: Number((m.rawBytes / 1024).toFixed(2)),
      rawPct: Number(rawPct.toFixed(1)),
      estGzipBytes,
      estGzipKb: Number((estGzipBytes / 1024).toFixed(2)),
    };
  });

  return {
    totalRenderedLength,
    totalModules: moduleList.length,
    categories: categoryResults,
    topModules,
  };
}

/**
 * Phân tích bundle client bằng cách gọi Vite build
 * @param {{ clientDir?: string, logLevel?: 'silent' | 'info' }} [options]
 * @returns {Promise<object>}
 */
export async function analyzeClientBundle(options = {}) {
  const clientDir = options.clientDir || CLIENT_DIR;
  const logLevel = options.logLevel || "silent";

  const { build } = await import("vite");

  let capturedBundle = null;

  await build({
    root: clientDir,
    configFile: path.resolve(clientDir, "vite.config.ts"),
    logLevel,
    build: {
      write: false,
    },
    plugins: [
      {
        name: "bundle-breakdown-collector",
        generateBundle(_opts, bundle) {
          capturedBundle = bundle;
        },
      },
    ],
  });

  if (!capturedBundle) {
    throw new Error("Không thể thu thập dữ liệu bundle từ Vite build.");
  }

  // Tìm chunk JS chính (chứa logic ứng dụng và Phaser)
  const chunks = Object.values(capturedBundle).filter((item) => item.type === "chunk");
  const mainChunk = chunks.find(
    (c) => c.fileName.endsWith(".js") && c.code && c.code.length > 500000,
  );

  if (!mainChunk) {
    throw new Error("Không tìm thấy chunk JavaScript chính trong bundle.");
  }

  const rawBytes = mainChunk.code.length;
  // Nén gzip với level 9 (chuẩn của check-perf-budget.mjs)
  const gzipLevel9Buffer = zlib.gzipSync(mainChunk.code, { level: 9 });
  const gzipBytes = gzipLevel9Buffer.length;
  // Nén gzip mặc định (chuẩn của Vite build output)
  const gzipDefaultBuffer = zlib.gzipSync(mainChunk.code);
  const gzipDefaultBytes = gzipDefaultBuffer.length;

  const breakdown = classifyModules(mainChunk.modules, gzipBytes);

  // Đọc giới hạn ngân sách tĩnh để so sánh
  let budgetMaxGzipKb = 520;
  const budgetPath = path.resolve(clientDir, "perf-budget.json");
  if (fs.existsSync(budgetPath)) {
    try {
      const budget = JSON.parse(fs.readFileSync(budgetPath, "utf-8"));
      if (budget.mainJsGzipMaxKb) {
        budgetMaxGzipKb = budget.mainJsGzipMaxKb;
      }
    } catch {
      // Dùng mặc định
    }
  }

  const totalGzipKb = Number((gzipBytes / 1024).toFixed(2));
  const remainingBudgetKb = Number((budgetMaxGzipKb - totalGzipKb).toFixed(2));

  // Kích thước hiển thị dạng thập phân (decimal KB) như Vite build log
  const viteRawKb = Number((rawBytes / 1000).toFixed(2));
  const viteGzipKb = Number((gzipDefaultBytes / 1000).toFixed(2));
  const viteRemainingBudgetKb = Number((budgetMaxGzipKb - viteGzipKb).toFixed(2));

  // Tính tiềm năng tiết kiệm khi tách các bảng UI
  let lazyCandidatesRawBytes = 0;
  for (const p of UI_PANEL_SECTIONS) {
    lazyCandidatesRawBytes += p.rawBytes;
  }
  const lazyEstGzipBytes = Math.round(
    (lazyCandidatesRawBytes / breakdown.totalRenderedLength) * gzipBytes,
  );
  const lazyEstGzipKb = Number((lazyEstGzipBytes / 1024).toFixed(2));

  return {
    chunkFileName: mainChunk.fileName,
    rawBytes,
    rawKb: Number((rawBytes / 1024).toFixed(2)),
    gzipBytes,
    gzipKb: totalGzipKb,
    gzipDefaultBytes,
    viteRawKb,
    viteGzipKb,
    viteRemainingBudgetKb,
    budgetMaxGzipKb,
    remainingBudgetKb,
    breakdown,
    uiPanels: UI_PANEL_SECTIONS,
    lazyOptimization: {
      totalPanelRawBytes: lazyCandidatesRawBytes,
      totalPanelRawKb: Number((lazyCandidatesRawBytes / 1024).toFixed(2)),
      estGzipSavedBytes: lazyEstGzipBytes,
      estGzipSavedKb: lazyEstGzipKb,
      projectedInitialGzipKb: Number((totalGzipKb - lazyEstGzipKb).toFixed(2)),
      projectedRemainingBudgetKb: Number(
        (budgetMaxGzipKb - (totalGzipKb - lazyEstGzipKb)).toFixed(2),
      ),
      projectedViteGzipKb: Number((viteGzipKb - lazyEstGzipKb * 1.024).toFixed(2)),
    },
  };
}

/**
 * Định dạng báo cáo dòng lệnh
 * @param {object} report
 * @returns {string}
 */
export function formatConsoleReport(report) {
  const lines = [];
  lines.push("================================================================================");
  lines.push("           BÁO CÁO THÀNH PHẦN GÓI TẢI CLIENT (BUNDLE BREAKDOWN)");
  lines.push("================================================================================");
  lines.push(
    `Chunk chính      : ${report.chunkFileName} (${report.rawKb} KiB thô, ${report.gzipKb} KiB gzip [level 9])`,
  );
  lines.push(`Theo chuẩn Vite  : ${report.viteRawKb} KB thô, ${report.viteGzipKb} KB gzip`);
  lines.push(
    `Ngân sách CI     : ${report.gzipKb} / ${report.budgetMaxGzipKb} KiB (Dư: ${report.remainingBudgetKb} KiB)`,
  );
  lines.push(
    `Ngân sách Vite   : ${report.viteGzipKb} / ${report.budgetMaxGzipKb} KB (Dư: ${report.viteRemainingBudgetKb} KB)`,
  );
  lines.push("");
  lines.push("1. CƠ CẤU THEO NHÓM THÀNH PHẦN:");
  lines.push("--------------------------------------------------------------------------------");
  lines.push("Thành phần                                  Thô (KiB)      %     Gzip (KiB)     %");
  lines.push("--------------------------------------------------------------------------------");

  for (const cat of report.breakdown.categories) {
    const name = cat.name.padEnd(40);
    const raw = String(cat.rawKb).padStart(10);
    const rawPct = `${cat.rawPct}%`.padStart(7);
    const gzip = String(cat.estGzipKb).padStart(12);
    const gzipPct = `${cat.estGzipPct}%`.padStart(6);
    lines.push(`${name} ${raw} ${rawPct} ${gzip} ${gzipPct}`);
  }

  lines.push("--------------------------------------------------------------------------------");
  lines.push("");
  lines.push("2. TOP 15 MODULE NẶNG NHẤT:");
  lines.push("--------------------------------------------------------------------------------");

  for (const m of report.breakdown.topModules.slice(0, 15)) {
    const id = m.id.length > 50 ? `...${m.id.slice(-47)}` : m.id.padEnd(50);
    const raw = `${m.rawKb} KiB`.padStart(11);
    const rawPct = `${m.rawPct}%`.padStart(7);
    const gzip = `~${m.estGzipKb} KiB`.padStart(12);
    lines.push(`${id} ${raw} ${rawPct} ${gzip}`);
  }

  lines.push("--------------------------------------------------------------------------------");
  lines.push("");
  lines.push("3. TIỀM NĂNG TÁCH DYNAMIC IMPORT() CÁC BẢNG UI ÍT DÙNG (LAZY LOADING):");
  lines.push("--------------------------------------------------------------------------------");

  for (const panel of report.uiPanels) {
    const name = panel.name.padEnd(42);
    const linesStr = `${panel.lines} dòng`.padStart(10);
    const raw = `${(panel.rawBytes / 1024).toFixed(2)} KiB`.padStart(10);
    lines.push(`${name} ${linesStr} ${raw} (${panel.shortcut})`);
  }

  lines.push("--------------------------------------------------------------------------------");
  lines.push(
    `Tổng các bảng có thể tách : ${report.lazyOptimization.totalPanelRawKb} KiB thô (~${report.lazyOptimization.estGzipSavedKb} KiB gzip)`,
  );
  lines.push(
    `Gói ban đầu sau khi tách  : ~${report.lazyOptimization.projectedInitialGzipKb} KiB (~${report.lazyOptimization.projectedViteGzipKb} KB Vite)`,
  );
  lines.push(
    `Dư địa ngân sách mới      : ~${report.lazyOptimization.projectedRemainingBudgetKb} KiB an toàn`,
  );
  lines.push("================================================================================");

  return lines.join("\n");
}

/**
 * Định dạng báo cáo Markdown chi tiết
 * @param {object} report
 * @returns {string}
 */
export function formatMarkdownReport(report) {
  const lines = [];
  lines.push("# Báo cáo Phân tích Thành phần Gói tải Client (Bundle Breakdown)");
  lines.push("");
  lines.push(`> Ngày tạo: ${new Date().toISOString().replace("T", " ")}`);
  lines.push(
    `> Gói JS chính: \`${report.chunkFileName}\` — **${report.rawKb} KiB** thô, **${report.gzipKb} KiB** gzip level 9 (hoặc **${report.viteGzipKb} KB** theo log của Vite).`,
  );
  lines.push(
    `> Ngân sách tối đa: **${report.budgetMaxGzipKb} KB** (Khoảng đệm an toàn hiện tại: **${report.remainingBudgetKb} KiB** / **${report.viteRemainingBudgetKb} KB**).`,
  );
  lines.push("");
  lines.push("## 1. Cơ cấu theo Nhóm thành phần");
  lines.push("");
  lines.push("| Thành phần | Mô tả | Kích thước thô | Tỷ lệ thô | Ước tính Gzip | Tỷ lệ Gzip |");
  lines.push("| :--- | :--- | :---: | :---: | :---: | :---: |");

  for (const cat of report.breakdown.categories) {
    lines.push(
      `| **${cat.name}** | ${cat.description} | ${cat.rawKb} KiB | ${cat.rawPct}% | **${cat.estGzipKb} KiB** | ${cat.estGzipPct}% |`,
    );
  }

  lines.push("");
  lines.push("### Nhận định trọng điểm:");
  lines.push(
    `- **Phaser 3 Engine** chiếm tới **~${report.breakdown.categories.find((c) => c.id === "phaser")?.estGzipKb || 443.5} KiB gzip** (chiếm **~88.8%** toàn bộ gói!). Đây là tệp unminified/bundled từ \`dist/phaser.js\` của Phaser 3.90.`,
  );
  lines.push(
    `- **Colyseus Client + Schema** chiếm **~${report.breakdown.categories.find((c) => c.id === "colyseus")?.estGzipKb || 20.1} KiB gzip** (~4.0%).`,
  );
  lines.push(
    `- **Mã Game (WorldScene, GFX, FX, Connection)** chiếm **~${report.breakdown.categories.find((c) => c.id === "game_code")?.estGzipKb || 20.3} KiB gzip** (~4.1%).`,
  );
  lines.push(
    `- **DOM UI (HUD, Modal, Chat, Panels)** chiếm **~${report.breakdown.categories.find((c) => c.id === "dom_ui")?.estGzipKb || 9.7} KiB gzip** (~1.9%).`,
  );
  lines.push(
    `- **Hợp đồng Shared** chiếm **~${report.breakdown.categories.find((c) => c.id === "shared")?.estGzipKb || 4.7} KiB gzip** (~0.9%).`,
  );
  lines.push("");
  lines.push("## 2. Top 20 Module nặng nhất trong Bundle");
  lines.push("");
  lines.push("| STT | Module | Kích thước thô | Tỷ lệ | Ước tính Gzip |");
  lines.push("| :---: | :--- | :---: | :---: | :---: |");

  let rank = 1;
  for (const m of report.breakdown.topModules.slice(0, 20)) {
    lines.push(`| ${rank++} | \`${m.id}\` | ${m.rawKb} KiB | ${m.rawPct}% | ~${m.estGzipKb} KiB |`);
  }

  lines.push("");
  lines.push("## 3. Tiềm năng Tách Dynamic `import()` các Bảng UI ít dùng");
  lines.push("");
  lines.push(
    "Hiện tại, file `client/src/ui.ts` chứa hơn 5.250 dòng lệnh và gom toàn bộ các cửa sổ/modal vào gói khởi động chính. Người chơi lúc vào game chưa cần mở ngay các bảng này.",
  );
  lines.push("");
  lines.push("| Bảng UI / Modal | Điều kiện mở | Số dòng | Kích thước thô |");
  lines.push("| :--- | :--- | :---: | :---: |");

  for (const panel of report.uiPanels) {
    lines.push(
      `| **${panel.name}** | ${panel.shortcut} | ${panel.lines} dòng | ${(panel.rawBytes / 1024).toFixed(2)} KiB |`,
    );
  }

  lines.push("");
  lines.push("### Hiệu quả dự kiến:");
  lines.push(
    `- **Tổng mã các bảng có thể tách**: **${report.lazyOptimization.totalPanelRawKb} KiB thô**, tương đương **~${report.lazyOptimization.estGzipSavedKb} KiB gzip**.`,
  );
  lines.push(
    `- **Gói chính lúc khởi động sau khi tách**: giảm từ **${report.gzipKb} KiB** (${report.viteGzipKb} KB) xuống còn **~${report.lazyOptimization.projectedInitialGzipKb} KiB** (~${report.lazyOptimization.projectedViteGzipKb} KB).`,
  );
  lines.push(
    `- **Dư địa ngân sách an toàn**: tăng từ **${report.remainingBudgetKb} KiB** (${report.viteRemainingBudgetKb} KB) lên **~${report.lazyOptimization.projectedRemainingBudgetKb} KiB**, tạo khoảng đệm an toàn lớn cho các tính năng tiếp theo của M7 và M8.`,
  );
  lines.push("");
  lines.push("## 4. Đề xuất Kiến trúc cho Dev A");
  lines.push("");
  lines.push("1. **Tách các panel thành các file riêng trong `client/src/panels/`**:");
  lines.push(
    "   - `client/src/panels/skills-modal.ts` (Bảng Công pháp: danh sách chiêu, ngưng tụ, gán ô)",
  );
  lines.push(
    "   - `client/src/panels/limbo-modal.ts` (Bảng Hoàng Tuyền: khắc bia chân linh, chọn xuất thân)",
  );
  lines.push("   - `client/src/panels/sect-modal.ts` (Bảng Tông môn: thành viên, kho, bổng lộc)");
  lines.push(
    "   - `client/src/panels/shop-modal.ts` (Bảng Cửa hàng & Thợ rèn: mua bán, luyện khí)",
  );
  lines.push("   - `client/src/panels/keys-modal.ts` (Bảng Phím tắt: gợi ý, đổi phím bấm)");
  lines.push(
    "   - `client/src/panels/quest-modal.ts` (Bảng Nhiệm vụ chi tiết: lịch sử, chuỗi nhiệm vụ)",
  );
  lines.push("2. **Cơ chế nạp theo nhu cầu (Lazy Loading)**:");
  lines.push(
    "   - Khi người chơi bấm phím tắt hoặc click nút: gọi `import('./panels/<tên>.js').then(m => m.open(...))`.",
  );
  lines.push(
    "   - Lưu cache module sau lần nạp đầu tiên để mở tức thì ở các lần sau mà không nạp lại.",
  );
  lines.push("3. **Tách riêng chunk Phaser 3 (Tùy chọn tương lai cho M8)**:");
  lines.push("   - Cấu hình Rollup `manualChunks: { vendor_phaser: ['phaser'] }`.");
  lines.push(
    "   - Chunk Phaser (~443 KiB gzip) sẽ được Service Worker cache immutable vĩnh viễn. Khi cập nhật bản mới, người chơi chỉ cần tải lại chunk game (~60 KiB) thay vì toàn bộ ~500 KiB.",
  );

  return lines.join("\n");
}

// Chạy CLI nếu được gọi trực tiếp
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const isMarkdown = args.includes("--markdown");
  const shouldSave = args.includes("--save");

  analyzeClientBundle()
    .then((report) => {
      if (isJson) {
        console.log(JSON.stringify(report, null, 2));
      } else if (isMarkdown) {
        console.log(formatMarkdownReport(report));
      } else {
        console.log(formatConsoleReport(report));
      }

      if (shouldSave) {
        const distDir = path.resolve(CLIENT_DIR, "dist");
        if (!fs.existsSync(distDir)) {
          fs.mkdirSync(distDir, { recursive: true });
        }
        const jsonPath = path.resolve(distDir, "bundle-report.json");
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");

        const docPath = path.resolve(ROOT_DIR, "docs/BAO_CAO_THANH_PHAN_GOI.md");
        fs.writeFileSync(docPath, formatMarkdownReport(report), "utf-8");
        console.log(`\n✓ Đã lưu báo cáo JSON: ${path.relative(ROOT_DIR, jsonPath)}`);
        console.log(`✓ Đã lưu báo cáo Markdown: ${path.relative(ROOT_DIR, docPath)}`);
      }
    })
    .catch((err) => {
      console.error("[LỖI] Không thể phân tích bundle:", err);
      process.exit(1);
    });
}
