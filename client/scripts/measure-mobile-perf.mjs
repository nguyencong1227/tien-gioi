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
 *   node client/scripts/measure-mobile-perf.mjs [--quick] [--tier low|mid|high] [--cpu 1|4|6] [--only id1,id2]
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { parseOverlayCounts } from "./perf-gate.mjs";
import { DRAW_COUNTER_SOURCE, parseDrawCounterSnapshot } from "./draw-counter.mjs";
import { FX_DRIVER_SOURCE, parseFxDriverReport } from "./fx-driver.mjs";

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
// `--only a,b`: chỉ đo các kịch bản có id này (đo nhanh một nhóm; không ghi đè docs trừ khi có --write)
const filterOnly = getArg("only");
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

/** Địa chỉ của kịch bản "bản đồ ngoài, hiệu ứng môi trường bật": `?debug` tắt sương / thời tiết / nước nên phải bật lại bằng `=1`. */
const AMBIENT_QUERY = (mapId) => `map=${mapId}&crowd=20&debug=1&perf=1&weather=1&fog=1&water=1`;

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
  // `fx`: kế hoạch bắn hiệu ứng THẬT trong cửa sổ lấy mẫu (fx-driver.mjs, #400): mock không tự phát hạt / chữ bay đúng lúc lấy mẫu
  {
    id: "combat-low-4x",
    name: "Chiến đấu có hiệu ứng hạt",
    query: "duel=mock&debug=1&perf=1",
    tier: "low",
    cpuRate: 4,
    fx: "combat",
  },
  {
    id: "combat-high-4x",
    name: "Chiến đấu có hiệu ứng hạt",
    query: "duel=mock&debug=1&perf=1",
    tier: "high",
    cpuRate: 4,
    fx: "combat",
  },
  // Nhiều chiêu liên tục (đòn dồn dập + công pháp liên tiếp): thử ngân sách hiệu ứng ở bậc Thấp (trần chặt nhất) và Cao
  {
    id: "burst-low-4x",
    name: "Nhiều chiêu liên tục",
    query: "duel=mock&debug=1&perf=1",
    tier: "low",
    cpuRate: 4,
    fx: "burst",
  },
  {
    id: "burst-high-4x",
    name: "Nhiều chiêu liên tục",
    query: "duel=mock&debug=1&perf=1",
    tier: "high",
    cpuRate: 4,
    fx: "burst",
  },
  // Bản đồ ngoài với sương + thời tiết + nước BẬT (#408 bước 4). Mọi kịch bản khác chạy `?debug=1` nên ba hiệu ứng môi trường này mặc định TẮT
  // (`ambientEnabledByUrl`): chưa kịch bản nào đo chi phí của chúng. `map=<id>` (client/src/mock-map.ts) cho mock khởi đầu ở bản đồ đó, đứng giữa
  // trấn; `crowd=20` thêm 20 đạo hữu quanh người chơi. Âm Sương (sương dày nhất, thời tiết + nước riêng) đo ở cả ba bậc; Lạc Hà / Hắc Phong
  // chỉ đo bậc Cao (đắt nhất) làm mốc so sánh: Âm Sương không được nặng hơn hẳn hai bản đồ kia.
  ...["low", "mid", "high"].map((tier) => ({
    id: `am-suong-${tier}-4x`,
    name: "Âm Sương Trạch (sương + thời tiết + nước)",
    query: AMBIENT_QUERY("am_suong"),
    tier,
    cpuRate: 4,
  })),
  {
    id: "hac-phong-high-4x",
    name: "Hắc Phong Cốc (sương + thời tiết + nước)",
    query: AMBIENT_QUERY("hac_phong"),
    tier: "high",
    cpuRate: 4,
  },
  {
    id: "lac-ha-high-4x",
    name: "Lạc Hà Trấn (sương + thời tiết + nước)",
    query: AMBIENT_QUERY("lac_ha"),
    tier: "high",
    cpuRate: 4,
  },
  // Đánh TRÙM (M6 #409, nit của A ở #450): đòn thường -> boss-hit, trùm gục -> boss-vanish (ưu tiên 2) theo nhịp dồn dập; bậc Thấp (trần chặt
  // nhất) và Cao. Trước đây hai công thức trùm chỉ được giữ bằng test FxBudget + trần mỗi công thức, chưa bằng số đo của perf-gate.
  {
    id: "boss-low-4x",
    name: "Đánh trùm (đòn dồn dập + trùm gục)",
    query: "duel=mock&debug=1&perf=1",
    tier: "low",
    cpuRate: 4,
    fx: "boss",
  },
  {
    id: "boss-high-4x",
    name: "Đánh trùm (đòn dồn dập + trùm gục)",
    query: "duel=mock&debug=1&perf=1",
    tier: "high",
    cpuRate: 4,
    fx: "boss",
  },
  // Chế độ bí cảnh (dungeon)
  {
    id: "dungeon-mid-4x",
    name: "Bí cảnh",
    query: "dungeon=mock&debug=1&perf=1",
    tier: "mid",
    cpuRate: 4,
    fx: "combat",
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
if (filterOnly) {
  const wanted = new Set(
    filterOnly
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
  const known = new Set(ALL_SCENARIOS.map((s) => s.id));
  const unknown = [...wanted].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    console.error(
      `--only: không có kịch bản "${unknown.join('", "')}" (có: ${[...known].join(", ")})`,
    );
    process.exit(2);
  }
  scenariosToRun = scenariosToRun.filter((s) => wanted.has(s.id));
}

const results = [];
// Kịch bản không tải được / không có mẫu: đếm để thoát mã 1 (nightly #330 không được xanh giả khi thiếu số đo)
let loadFailures = 0;

try {
  let versionData = null;
  // 30 s (không phải 4 s): lần mở Chrome đầu tiên trên runner CI lạnh có thể chậm (run đầu của #398 đỏ vì 15 s không đủ)
  for (let i = 0; i < 300; i++) {
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

  if (!versionData) throw new Error("Chrome headless không khởi động kịp sau 30 giây.");

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

    // Đếm THẬT draw call mỗi khung (#397): bọc các hàm vẽ WebGL TRƯỚC mã của trang (draw-counter.mjs, có test hợp đồng)
    await cdpSend("Page.addScriptToEvaluateOnNewDocument", { source: DRAW_COUNTER_SOURCE });

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
    await cdpSend("Runtime.evaluate", {
      expression: `window.__tgPerf.reset(); window.__tgDraw && window.__tgDraw.reset()`,
    });
    // Bắn hiệu ứng THẬT trong cả cửa sổ lấy mẫu (fx-driver.mjs): mock không tự phát hạt / chữ bay đúng lúc lấy mẫu
    let fxStart = null;
    if (sc.fx) {
      const started = await cdpSend("Runtime.evaluate", {
        expression: `${FX_DRIVER_SOURCE}\n;JSON.stringify(window.__tgFxDriver.start(${JSON.stringify(sc.fx)}))`,
        returnByValue: true,
      });
      try {
        fxStart = JSON.parse(started?.result?.result?.value ?? "null");
      } catch {
        fxStart = null;
      }
      if (!fxStart?.ok) {
        console.error(
          `  ✗ Không bắn được hiệu ứng (kế hoạch "${sc.fx}"): ${fxStart?.error ?? "không rõ"}`,
        );
      }
    }

    // Thu thập mẫu trong 5 giây
    const sampleDurationMs = isQuick ? 3000 : 5000;
    console.log(`  - Đang thu thập mẫu hiệu năng trong ${sampleDurationMs / 1000} giây...`);
    await sleep(sampleDurationMs);

    const snapRes = await cdpSend("Runtime.evaluate", {
      expression: `JSON.stringify(window.__tgPerf.snapshot())`,
      returnByValue: true,
    });

    // Dừng bắn NGAY khi lấy snapshot (cùng lúc): báo cáo đỉnh hạt / emitter / chữ bay trong cả cửa sổ
    const fxRes = sc.fx
      ? await cdpSend("Runtime.evaluate", {
          expression: `JSON.stringify(window.__tgFxDriver ? window.__tgFxDriver.stop() : null)`,
          returnByValue: true,
        })
      : null;

    const drawRes = await cdpSend("Runtime.evaluate", {
      expression: `JSON.stringify(window.__tgDraw ? window.__tgDraw.snapshot() : null)`,
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

      // Số hạt / emitter SỐNG từ lớp phủ `?perf=1` (hàm thuần `parseOverlayCounts`, có test hợp đồng với `formatPerfLines`).
      // Không đọc được thì để null (cổng perf-gate báo "thiếu số đo"), KHÔNG mặc định 0 như trước (regex sai dấu hai chấm
      // làm mọi kịch bản ra 0 hạt, cổng hạt xanh giả).
      const { particles, particleLimit, emitters, emitterLimit } = parseOverlayCounts(overlayText);

      // Draw call mỗi khung CÓ VẼ (trung bình / p95); không đọc được thì null (perf-gate báo "thiếu số đo"), KHÔNG gán cứng như trước
      const { drawCallsAvg, drawCallsP95, drawCallFrames } = parseDrawCounterSnapshot(
        drawRes?.result?.result?.value,
      );
      if (drawCallsP95 === null) {
        console.error(
          "  ✗ Không đếm được draw call (WebGL không vẽ khung nào / bộ đếm không bắt được): perf-gate sẽ ĐỎ 'thiếu số đo'.",
        );
      }

      const fxReport = sc.fx ? parseFxDriverReport(fxRes?.result?.result?.value) : null;
      if (sc.fx && !fxReport) {
        console.error("  ✗ Không đọc được báo cáo bắn hiệu ứng: perf-gate sẽ ĐỎ 'thiếu số đo'.");
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
        drawCallsAvg,
        drawCallsP95,
        drawCallFrames,
        // Hiệu ứng bắn THẬT (null nếu kịch bản không bắn): kế hoạch, số lần phát, ĐỈNH hạt / emitter / chữ bay trong cả cửa sổ
        fxPlan: sc.fx ?? null,
        fxPlayed: fxReport?.fxPlayed ?? null,
        fxRejected: fxReport?.fxRejected ?? null,
        floatsPlayed: fxReport?.floatsPlayed ?? null,
        particlesPeak: fxReport?.particlesPeak ?? null,
        emittersPeak: fxReport?.emittersPeak ?? null,
        floatsPeak: fxReport?.floatsPeak ?? null,
        fxAdmitted: fxReport?.fxAdmitted ?? null,
        fxDropped: fxReport?.fxDropped ?? null,
        particles,
        particleLimit,
        emitters,
        emitterLimit,
        heapMb,
        frames: snap.frames,
        overlayExcerpt: overlayText.split("\n").slice(0, 3).join(" | "),
      };
      results.push(resItem);

      if (sc.fx) {
        const t = budget?.runtime?.tiers?.[sc.tier];
        console.log(
          `  - Hiệu ứng bắn thật ("${sc.fx}"): phát ${resItem.fxPlayed ?? "?"} (ngân sách bỏ ${resItem.fxDropped ?? "?"}), ĐỈNH hạt ${resItem.particlesPeak ?? "?"} (trần ${t?.peakParticles ?? "?"}) | emitter ${resItem.emittersPeak ?? "?"} (trần ${t?.emitterBudget ?? "?"}) | chữ bay ${resItem.floatsPeak ?? "?"} (trần ${t?.damageNumbers ?? "?"})`,
        );
      }

      const statusTag = budgetMet ? "✓ ĐẠT" : "⚠ VƯỢT";
      console.log(
        `  ${statusTag} JS Update p95: ${resItem.updateP95Ms} ms (Ngân sách: <= ${maxJsAllowed} ms) | Draw call TB / p95: ${resItem.drawCallsAvg ?? "?"} / ${resItem.drawCallsP95 ?? "?"} (${resItem.drawCallFrames} khung) | FPS: ${resItem.fpsAvg} (rAF p95: ${resItem.frameP95Ms} ms) | Heap: ${resItem.heapMb} MB`,
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
    Draw_call_TB: r.drawCallsAvg ?? "?",
    Draw_call_p95: `${r.drawCallsP95 ?? "?"}/${budget?.runtime?.tiers?.[r.tier]?.drawCalls ?? "?"}`,
    Hạt: r.fxPlan
      ? `${r.particlesPeak ?? "?"} đỉnh/${r.particleLimit ?? "?"}`
      : `${r.particles ?? "?"}/${r.particleLimit ?? "?"}`,
    Emitter: r.fxPlan
      ? `${r.emittersPeak ?? "?"} đỉnh/${r.emitterLimit ?? "?"}`
      : `${r.emitters ?? "?"}/${r.emitterLimit ?? "?"}`,
    Chữ_bay: r.fxPlan ? `${r.floatsPeak ?? "?"} đỉnh` : "-",
    Heap: `${r.heapMb} MB`,
  })),
);

const isFiltered = isQuick || Boolean(filterTier) || Boolean(filterCpu) || Boolean(filterOnly);
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
    tableMd += `| Kịch bản | Bậc đồ hoạ | CPU Throttling | FPS | JS Update p95 | Ngân sách JS | Draw call TB / p95 / Trần | Hạt / Trần | Emitters | Chữ bay đỉnh / Trần | JS Heap | Trạng thái |\n`;
    tableMd += `|---|---|---|---|---|---|---|---|---|---|---|---|\n`;

    for (const r of results) {
      const statusStr = r.budgetMet ? "✓ ĐẠT" : "⚠ VƯỢT";
      // Kịch bản bắn hiệu ứng thật: ĐỈNH trong cả cửa sổ (đánh dấu "đỉnh"); không bắn: số SỐNG lúc lớp phủ vẽ lần cuối
      const particleStr = r.fxPlan
        ? `${r.particlesPeak ?? "?"} đỉnh / ${r.particleLimit ?? "-"}`
        : `${r.particles ?? "?"} / ${r.particleLimit ?? "-"}`;
      const emitterStr = r.fxPlan
        ? `${r.emittersPeak ?? "?"} đỉnh / ${r.emitterLimit ?? "-"}`
        : `${r.emitters ?? "?"} / ${r.emitterLimit ?? "-"}`;
      const floatStr = r.fxPlan
        ? `${r.floatsPeak ?? "?"} đỉnh / ${budget?.runtime?.tiers?.[r.tier]?.damageNumbers ?? "-"}`
        : "-";
      tableMd += `| ${r.scenario} | ${r.tier.toUpperCase()} | ${r.cpu} | ${r.fpsAvg} | ${r.updateP95Ms} ms | <= ${r.budgetJsP95Ms} ms | ${r.drawCallsAvg ?? "?"} / ${r.drawCallsP95 ?? "?"} / ${budget?.runtime?.tiers?.[r.tier]?.drawCalls ?? "-"} | ${particleStr} | ${emitterStr} | ${floatStr} | ${r.heapMb} MB | ${statusStr} |\n`;
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
