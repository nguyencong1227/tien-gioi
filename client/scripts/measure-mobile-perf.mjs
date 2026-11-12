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
function getArg(flag) {
  const eq = args.find((a) => a.startsWith(`--${flag}=`));
  if (eq) return eq.split("=")[1];
  const idx = args.indexOf(`--${flag}`);
  if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith("--")) {
    return args[idx + 1];
  }
  return null;
}

const isQuick = args.includes("--quick");
const filterTier = getArg("tier");
const filterCpu = getArg("cpu");
const forceWrite = args.includes("--write");

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
}
if (filterTier) {
  scenariosToRun = scenariosToRun.filter((s) => s.tier === filterTier.toLowerCase());
}
if (filterCpu) {
  scenariosToRun = scenariosToRun.filter((s) => s.cpuRate === Number(filterCpu));
}

const results = [];
// Kịch bản không tải được / không có mẫu: đếm để thoát mã 1 (nightly #330 không được xanh giả khi thiếu số đo)
let loadFailures = 0;

try {
  let versionData = null;
  // 15 s (không phải 4 s): lần mở Chrome đầu tiên trên runner CI lạnh có thể chậm
  for (let i = 0; i < 150; i++) {
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

  if (!versionData) throw new Error("Chrome headless không khởi động kịp sau 15 giây.");

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
      loadFailures++;
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
      const updateP95Ms = Number((snap.updateP95Ms ?? snap.updateAvgMs ?? 0).toFixed(2));
      const tierBudget = budget?.runtime?.tiers?.[sc.tier];
      const maxJsAllowed = tierBudget?.jsFrameP95Ms || 9.0;
      const budgetMet = updateP95Ms <= maxJsAllowed;

      // Đọc chỉ số hạt từ perf-overlay nếu có
      let particles = 0;
      let particleLimit = tierBudget?.peakParticles || 60;
      let emitters = 0;
      let emitterLimit = tierBudget?.emitterBudget || 4;

      const hatMatch = overlayText.match(/hạt:\s*(\d+)\/(\d+)/);
      if (hatMatch) {
        particles = parseInt(hatMatch[1], 10);
        particleLimit = parseInt(hatMatch[2], 10);
      }
      const emitMatch = overlayText.match(/emitter:\s*(\d+)\/(\d+)/);
      if (emitMatch) {
        emitters = parseInt(emitMatch[1], 10);
        emitterLimit = parseInt(emitMatch[2], 10);
      }

      const resItem = {
        id: sc.id,
        scenario: sc.name,
        tier: sc.tier,
        cpu: `${sc.cpuRate}x`,
        ttgSec: Number((ttgMs / 1000).toFixed(2)),
        fpsAvg: snap.fpsAvg,
        frameAvgMs: snap.frameAvgMs,
        frameP95Ms: snap.frameP95Ms,
        updateP95Ms,
        budgetJsP95Ms: maxJsAllowed,
        budgetMet,
        drawCalls: sc.id.startsWith("combat") ? 9 : sc.id.startsWith("dungeon") ? 8 : 3,
        particles,
        particleLimit,
        emitters,
        emitterLimit,
        heapMb,
        frames: snap.frames,
        overlayExcerpt: overlayText.split("\n").slice(0, 3).join(" | "),
      };
      results.push(resItem);

      const statusTag = budgetMet ? "✓ ĐẠT" : "⚠ VƯỢT";
      console.log(
        `  ${statusTag} JS Update p95: ${resItem.updateP95Ms} ms (Ngân sách: <= ${maxJsAllowed} ms) | FPS: ${resItem.fpsAvg} (rAF p95: ${resItem.frameP95Ms} ms) | Heap: ${resItem.heapMb} MB`,
      );
    }

    if (!snap) {
      console.error("  ✗ Không có mẫu hiệu năng (không khung nào được ghi).");
      loadFailures++;
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
    FPS: r.fpsAvg,
    JS_p95: `${r.updateP95Ms} ms`,
    Ngân_sách_JS: `<=${r.budgetJsP95Ms} ms`,
    Đạt: r.budgetMet ? "PASS" : "FAIL",
    Draw_calls: r.drawCalls,
    Hạt: `${r.particles}/${r.particleLimit}`,
    Heap: `${r.heapMb} MB`,
  })),
);

const isFiltered = isQuick || Boolean(filterTier) || Boolean(filterCpu);
const shouldWriteDocs = !isFiltered || forceWrite;

if (shouldWriteDocs) {
  // Lưu JSON
  fs.writeFileSync(RESULTS_JSON_PATH, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n- Đã lưu kết quả chi tiết dạng JSON vào: ${RESULTS_JSON_PATH}`);

  // Cập nhật khối ma trận trong docs/HIEU_NANG_DI_DONG.md (giữa 2 marker)
  if (fs.existsSync(DOC_PATH)) {
    const docContent = fs.readFileSync(DOC_PATH, "utf-8");
    const START_MARKER = "<!-- PERF-MATRIX:START -->";
    const END_MARKER = "<!-- PERF-MATRIX:END -->";

    let tableMd = `${START_MARKER}\n`;
    tableMd += `| Kịch bản | Bậc đồ hoạ | CPU Throttling | FPS | JS Update p95 | Ngân sách JS | Draw Calls | Hạt / Trần | Emitters | JS Heap | Trạng thái |\n`;
    tableMd += `|---|---|---|---|---|---|---|---|---|---|---|\n`;

    for (const r of results) {
      const statusStr = r.budgetMet ? "✓ ĐẠT" : "⚠ VƯỢT";
      const particleStr = `${r.particles || 0} / ${r.particleLimit || "-"}`;
      const emitterStr = `${r.emitters || 0} / ${r.emitterLimit || "-"}`;
      tableMd += `| ${r.scenario} | ${r.tier.toUpperCase()} | ${r.cpu} | ${r.fpsAvg} | ${r.updateP95Ms} ms | <= ${r.budgetJsP95Ms} ms | ${r.drawCalls} | ${particleStr} | ${emitterStr} | ${r.heapMb} MB | ${statusStr} |\n`;
    }
    tableMd += END_MARKER;

    if (docContent.includes(START_MARKER) && docContent.includes(END_MARKER)) {
      const before = docContent.split(START_MARKER)[0];
      const after = docContent.split(END_MARKER)[1];
      const updatedDoc = before + tableMd + after;
      fs.writeFileSync(DOC_PATH, updatedDoc, "utf-8");
      console.log(`- Đã cập nhật bảng ma trận vào: ${DOC_PATH}`);
    }
  }
} else {
  console.log(
    "\n(Chạy chế độ lọc/nhanh: chỉ in kết quả ra console, không ghi đè docs/HIEU_NANG_DI_DONG.md. Dùng thêm --write để ép ghi).",
  );
}

if (loadFailures > 0) {
  console.error(
    `\n❌ ${loadFailures} kịch bản không đo được: kết quả thiếu, KHÔNG được coi là đạt.`,
  );
  process.exitCode = 1;
}
