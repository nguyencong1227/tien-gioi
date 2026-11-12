/* global console, setTimeout, fetch */
/**
 * Script đo hiệu năng di động & đồ hoạ đa kịch bản qua Chrome CDP Headless
 * M5.1, Issue #330, THIET_KE_GIAO_DIEN_DO_HOA.md mục 10 và 12.
 *
 * - Giả lập viewport di động: 390x844 (DPR 2)
 * - Tự động thiết lập localStorage.tg_quality tường minh (low / mid / high) để không phụ thuộc SwiftShader
 * - Throttling CPU: 1x, 4x, 6x (giả lập Android tầm trung và thiết bị yếu)
 * - Kịch bản: solo (1 người), crowd (50 bot), combat (chiến đấu fx), dungeon (bí cảnh)
 * - Đối chiếu thời gian khung p95 và các chỉ số tài nguyên với client/perf-budget.json
 *
 * Chạy:
 *   npm run perf:mobile
 *   node client/scripts/measure-mobile-perf.mjs [--quick] [--tier low|mid|high] [--cpu 1|4|6]
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, "../..");
const DIST = path.join(REPO, "client/dist");
const DOC_PATH = path.join(REPO, "docs/HIEU_NANG_DI_DONG.md");
const BUDGET_PATH = path.join(REPO, "client/perf-budget.json");
const RESULTS_JSON_PATH = path.join(REPO, "docs/perf-mobile-results.json");

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

// Đọc tham số dòng lệnh
const args = process.argv.slice(2);
const isQuick = args.includes("--quick");
const filterTier = args.find((a) => a.startsWith("--tier="))?.split("=")[1] || null;
const filterCpu = args.find((a) => a.startsWith("--cpu="))?.split("=")[1] || null;

// Đọc ngân sách nếu có
let budget = null;
if (fs.existsSync(BUDGET_PATH)) {
  try {
    budget = JSON.parse(fs.readFileSync(BUDGET_PATH, "utf-8"));
  } catch (e) {
    console.warn(`[Cảnh báo] Không thể nạp ${BUDGET_PATH}:`, e.message);
  }
}

// 1. Static web server phục vụ client/dist
const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, "index.html");
  }
  const ext = path.extname(filePath);
  const mime = MIMES[ext] || "application/octet-stream";
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

const HTTP_PORT = 39860 + Math.floor(Math.random() * 80);
await new Promise((resolve) => server.listen(HTTP_PORT, "127.0.0.1", resolve));
console.log(`- Web server tạm: http://127.0.0.1:${HTTP_PORT}`);

const CDP_PORT = 39960 + Math.floor(Math.random() * 80);
const tmpChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-perf-mobile-"));

const chromeProcess = spawn("google-chrome", [
  "--headless=new",
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${tmpChromeDir}`,
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "about:blank",
]);

// Danh sách các kịch bản chuẩn
export const ALL_SCENARIOS = [
  // Chế độ solo (1 người)
  {
    id: "solo",
    name: "Một mình (Trấn vắng)",
    query: "dungeon=mock&debug=1&perf=1",
    tier: "low",
    cpuRate: 1,
  },
  {
    id: "solo-4x",
    name: "Một mình (Trấn vắng)",
    query: "dungeon=mock&debug=1&perf=1",
    tier: "low",
    cpuRate: 4,
  },
  // Chế độ crowd (50 người đông)
  {
    id: "crowd-low-4x",
    name: "Trấn đông (50 bot)",
    query: "crowd=50&debug=1&perf=1",
    tier: "low",
    cpuRate: 4,
  },
  {
    id: "crowd-mid-4x",
    name: "Trấn đông (50 bot)",
    query: "crowd=50&debug=1&perf=1",
    tier: "mid",
    cpuRate: 4,
  },
  {
    id: "crowd-high-4x",
    name: "Trấn đông (50 bot)",
    query: "crowd=50&debug=1&perf=1",
    tier: "high",
    cpuRate: 4,
  },
  {
    id: "crowd-high-1x",
    name: "Trấn đông (50 bot)",
    query: "crowd=50&debug=1&perf=1",
    tier: "high",
    cpuRate: 1,
  },
  {
    id: "crowd-low-6x",
    name: "Trấn đông (50 bot) - Máy rất yếu",
    query: "crowd=50&debug=1&perf=1",
    tier: "low",
    cpuRate: 6,
  },
  // Chế độ combat (chiến đấu có hiệu ứng fx)
  {
    id: "combat-low-4x",
    name: "Chiến đấu có hiệu ứng hạt",
    query: "duel=mock&debug=1&perf=1",
    tier: "low",
    cpuRate: 4,
  },
  {
    id: "combat-high-4x",
    name: "Chiến đấu có hiệu ứng hạt",
    query: "duel=mock&debug=1&perf=1",
    tier: "high",
    cpuRate: 4,
  },
  // Chế độ bí cảnh (dungeon)
  {
    id: "dungeon-mid-4x",
    name: "Bí cảnh",
    query: "dungeon=mock&debug=1&perf=1",
    tier: "mid",
    cpuRate: 4,
  },
];

// Lọc kịch bản theo cờ
let scenariosToRun = ALL_SCENARIOS;
if (isQuick) {
  // Chế độ nhanh: chỉ đo 3 ca tiêu biểu của Trấn đông 50 bot ở CPU 4x cho 3 bậc
  scenariosToRun = ALL_SCENARIOS.filter((s) =>
    ["crowd-low-4x", "crowd-mid-4x", "crowd-high-4x"].includes(s.id),
  );
} else {
  if (filterTier) {
    scenariosToRun = scenariosToRun.filter((s) => s.tier === filterTier);
  }
  if (filterCpu) {
    scenariosToRun = scenariosToRun.filter((s) => s.cpuRate === Number(filterCpu));
  }
}

const results = [];

try {
  let versionData = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch {
      // Đợi Chrome mở cổng
    }
    await sleep(100);
  }

  if (!versionData) throw new Error("Chrome headless không khởi động kịp sau 4 giây.");

  for (const sc of scenariosToRun) {
    const targetUrl = `http://127.0.0.1:${HTTP_PORT}/?${sc.query}`;
    console.log(
      `\n>>> Đo kịch bản: ${sc.name} | Bậc: ${sc.tier.toUpperCase()} | CPU: ${sc.cpuRate}x...`,
    );

    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, {
      method: "PUT",
    });
    const tabData = await newTabRes.json();
    const cdpWs = new WebSocket(tabData.webSocketDebuggerUrl);
    await new Promise((resolve) => cdpWs.on("open", resolve));

    let cdpId = 1;
    const pending = new Map();
    cdpWs.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });

    const cdpSend = (method, params = {}) =>
      new Promise((resolve) => {
        const id = cdpId++;
        pending.set(id, resolve);
        cdpWs.send(JSON.stringify({ id, method, params }));
      });

    await cdpSend("Page.enable");
    await cdpSend("Runtime.enable");

    // Đặt viewport chuẩn di động 390x844
    await cdpSend("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdpSend("Emulation.setCPUThrottlingRate", { rate: sc.cpuRate });

    // ĐẶT CHẤT LƯỢNG TƯỜNG MINH TRƯỚC KHI TRANG TẢI (chống fallback SwiftShader)
    await cdpSend("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        try {
          localStorage.setItem("tg_quality", ${JSON.stringify(sc.tier)});
          localStorage.setItem("tg_newbie_guide_dismissed", "1");
        } catch (e) {}
      `,
    });

    const t0 = Date.now();
    await cdpSend("Page.navigate", { url: targetUrl });

    // Đợi scene và __tgPerf sẵn sàng
    let ready = false;
    for (let i = 0; i < 50; i++) {
      await sleep(200);
      const evalRes = await cdpSend("Runtime.evaluate", {
        expression: `Boolean(window.__tgPerf && window.__scene)`,
        returnByValue: true,
      });
      if (evalRes?.result?.result?.value) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      console.error("  ✗ Kịch bản không tải xong sau 10s.");
      cdpWs.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tabData.id}`);
      continue;
    }

    const ttgMs = Date.now() - t0;
    console.log(`  - Thời gian tới lúc vào game (TTG): ${(ttgMs / 1000).toFixed(2)}s`);

    // Chờ 1.5s cho cảnh ổn định rồi reset bộ đếm
    await sleep(1500);
    await cdpSend("Runtime.evaluate", { expression: `window.__tgPerf.reset()` });

    // Thu thập mẫu trong 5 giây
    const sampleDurationMs = isQuick ? 3000 : 5000;
    console.log(`  - Đang thu thập mẫu hiệu năng trong ${sampleDurationMs / 1000} giây...`);
    await sleep(sampleDurationMs);

    const snapRes = await cdpSend("Runtime.evaluate", {
      expression: `JSON.stringify(window.__tgPerf.snapshot())`,
      returnByValue: true,
    });

    const memoryRes = await cdpSend("Runtime.evaluate", {
      expression: `performance?.memory ? performance.memory.usedJSHeapSize : 0`,
      returnByValue: true,
    });

    // Đọc thêm chỉ số từ ?perf=1 overlay nếu có
    const overlayRes = await cdpSend("Runtime.evaluate", {
      expression: `document.getElementById("perf-overlay")?.innerText || ""`,
      returnByValue: true,
    });

    const rawSnap = snapRes?.result?.result?.value;
    const snap = rawSnap ? JSON.parse(rawSnap) : null;
    const heapBytes = memoryRes?.result?.result?.value || 0;
    const heapMb = Number((heapBytes / (1024 * 1024)).toFixed(1));
    const overlayText = overlayRes?.result?.result?.value || "";

    if (snap) {
      const fpsP5 = Number((1000 / snap.frameP95Ms).toFixed(1));
      const tierBudget = budget?.runtime?.tiers?.[sc.tier];
      const maxP95Allowed = tierBudget?.jsFrameP95Ms || 999;
      const budgetMet = snap.frameP95Ms <= maxP95Allowed;

      const resItem = {
        id: sc.id,
        scenario: sc.name,
        tier: sc.tier,
        cpu: `${sc.cpuRate}x`,
        ttgSec: Number((ttgMs / 1000).toFixed(2)),
        fpsAvg: snap.fpsAvg,
        fpsP5: Math.min(snap.fpsAvg, fpsP5),
        frameAvgMs: snap.frameAvgMs,
        frameP95Ms: snap.frameP95Ms,
        budgetP95Ms: maxP95Allowed,
        budgetMet,
        heapMb,
        frames: snap.frames,
        overlayExcerpt: overlayText.split("\n").slice(0, 3).join(" | "),
      };
      results.push(resItem);

      const statusTag = budgetMet ? "✓ ĐẠT" : "⚠ VƯỢT";
      console.log(
        `  ${statusTag} FPS TB: ${resItem.fpsAvg} | Frame p95: ${resItem.frameP95Ms} ms (Ngân sách: <= ${maxP95Allowed} ms) | Heap: ${resItem.heapMb} MB`,
      );
    }

    cdpWs.close();
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tabData.id}`);
  }
} finally {
  chromeProcess.kill("SIGKILL");
  server.close();
  try {
    fs.rmSync(tmpChromeDir, { recursive: true, force: true });
  } catch {
    // Bỏ qua lỗi xoá thư mục tạm
  }
}

// ---------------------------------------------------------------------------
// Xuất bảng kết quả và lưu tệp
// ---------------------------------------------------------------------------
console.log("\n=== TỔNG HỢP KẾT QUẢ ĐO HIỆU NĂNG DI ĐỘNG & ĐỒ HOẠ (M5.1) ===");
console.table(
  results.map((r) => ({
    Kịch_bản: r.scenario,
    Bậc: r.tier,
    CPU: r.cpu,
    FPS_TB: r.fpsAvg,
    FPS_p5: r.fpsP5,
    Frame_p95: `${r.frameP95Ms} ms`,
    Ngân_sách: `<=${r.budgetP95Ms} ms`,
    Đạt: r.budgetMet ? "PASS" : "FAIL",
    Heap: `${r.heapMb} MB`,
  })),
);

// Lưu JSON
fs.writeFileSync(RESULTS_JSON_PATH, JSON.stringify(results, null, 2), "utf-8");
console.log(`\n- Đã lưu kết quả chi tiết dạng JSON vào: ${RESULTS_JSON_PATH}`);

// Ghi tài liệu docs/HIEU_NANG_DI_DONG.md
let markdown = `# Đo Hiệu Năng Di Động & Đồ Hoạ (Mobile Performance Benchmark)

> Tài liệu thực nghiệm đo hiệu năng giao diện và đồ hoạ client trên thiết bị di động (M5.1, Issue #330).
> **Nguyên tắc**: Đo bằng số liệu thực tế, **không tối ưu mù**.

## 1. Môi trường và thông số đo
- **Thiết bị giả lập**: Chrome Headless CDP qua \`Emulation.setDeviceMetricsOverride\`.
- **Độ phân giải viewport**: 390 × 844 px (tỷ lệ màn hình iPhone 12/13/14 Pro chuẩn, DPR 2).
- **Chất lượng**: Được cố định tường minh qua \`localStorage.setItem('tg_quality', tier)\` cho từng kịch bản (\`low\`, \`mid\`, \`high\`).
- **CPU Throttling**:
  - **1x**: Máy tính bàn hoặc chip flagship cao cấp.
  - **4x**: Đại diện điện thoại Android / iOS tầm trung.
  - **6x**: Thiết bị đời cũ hoặc phân khúc thấp.

## 2. Bảng số liệu thực nghiệm ma trận

| Kịch bản | Bậc chất lượng | CPU | Vào game (s) | FPS TB | FPS p5 | Frame TB (ms) | Frame p95 (ms) | Ngân sách p95 | Trạng thái | JS Heap (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
`;

for (const r of results) {
  const statusStr = r.budgetMet ? "✓ ĐẠT" : "⚠ VƯỢT";
  markdown += `| ${r.scenario} | ${r.tier.toUpperCase()} | ${r.cpu} | ${r.ttgSec}s | **${r.fpsAvg}** | **${r.fpsP5}** | ${r.frameAvgMs} ms | ${r.frameP95Ms} ms | <= ${r.budgetP95Ms} ms | ${statusStr} | ${r.heapMb} MB |\n`;
}

markdown += `\n## 3. Đối chiếu Ngân sách perf-budget.json
- Bậc Thấp (CPU 4x): Frame p95 <= 9.0 ms
- Bậc Vừa (CPU 4x): Frame p95 <= 11.0 ms
- Bậc Cao (CPU 4x): Frame p95 <= 13.0 ms
- Kết quả chi tiết máy đọc được lưu tại \`docs/perf-mobile-results.json\`.
`;

fs.writeFileSync(DOC_PATH, markdown, "utf-8");
console.log(`- Đã cập nhật bảng số liệu vào: ${DOC_PATH}`);
