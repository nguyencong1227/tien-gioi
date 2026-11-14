/* global console, setTimeout, fetch */
/**
 * Đo thời gian vào thế giới qua mạng 4G giả lập (Fast 4G & Slow 4G, Lạnh & Ấm)
 * M7.15, Issue #516, THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.4.
 *
 * Mạng giả lập (CDP Network.emulateNetworkConditions):
 * - Fast 4G: ~9 Mbps tải xuống, 170 ms độ trễ, 1.5 Mbps tải lên.
 * - Slow 4G: ~1.6 Mbps tải xuống, 150 ms độ trễ, 750 Kbps tải lên.
 *
 * Kịch bản đo (mock ?duel=mock&debug=1, không cần server game):
 * - Lạnh: cache tắt, xóa sạch Service Worker & Cache Storage cho origin.
 * - Ấm: cache bật, Service Worker đã cài đặt và kích hoạt (precache hoàn tất).
 * - Đo từ navigationStart tới khi window.__scene.me() có giá trị.
 * - Mỗi ca đo 5 lần, lấy trung vị (median p50).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { getChromeGpuFlags } from "./chrome-gpu.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, "../..");
const DIST = path.join(REPO, "client/dist");
const DOC_PATH = path.join(REPO, "docs/HIEU_NANG_DI_DONG.md");
const BUDGET_PATH = path.join(REPO, "client/perf-budget.json");

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

// Cấu hình mạng theo THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.4
export const NETWORK_PROFILES = {
  fast4g: {
    id: "fast4g",
    name: "Fast 4G (~9 Mbps, 170 ms)",
    offline: false,
    latency: 170, // ms
    downloadThroughput: Math.floor((9 * 1024 * 1024) / 8), // ~9 Mbps = 1,179,648 B/s
    uploadThroughput: Math.floor((1.5 * 1024 * 1024) / 8), // ~1.5 Mbps = 196,608 B/s
    connectionType: "cellular4g",
  },
  slow4g: {
    id: "slow4g",
    name: "Slow 4G (~1.6 Mbps, 150 ms)",
    offline: false,
    latency: 150, // ms
    downloadThroughput: Math.floor((1.6 * 1024 * 1024) / 8), // ~1.6 Mbps = 209,715 B/s
    uploadThroughput: Math.floor((750 * 1024) / 8), // ~750 Kbps = 96,000 B/s
    connectionType: "cellular4g",
  },
};

/**
 * Tính median (p50) từ mảng số
 * @param {number[]} arr
 * @returns {number}
 */
export function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function run4gBenchmark(options = {}) {
  const runsPerCase = options.runs || 5;

  // 1. Web server phục vụ client/dist
  if (!fs.existsSync(DIST)) {
    throw new Error(`Thư mục ${DIST} không tồn tại. Hãy chạy 'npm run build' trước.`);
  }

  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST, "index.html");
    }
    const ext = path.extname(filePath);
    const mime = MIMES[ext] || "application/octet-stream";
    const headers = {
      "Content-Type": mime,
      "Access-Control-Allow-Origin": "*",
    };
    if (urlPath === "/sw.js") {
      headers["Service-Worker-Allowed"] = "/";
    }
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, headers);
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });

  const HTTP_PORT = await freePort();
  await new Promise((resolve) => server.listen(HTTP_PORT, "127.0.0.1", resolve));
  console.log(`- Web server tạm: http://127.0.0.1:${HTTP_PORT}`);

  const CDP_PORT = await freePort();
  const tmpChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-perf-4g-"));

  const chromeProcess = spawn("google-chrome", [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpChromeDir}`,
    "--no-sandbox",
    "--disable-dev-shm-usage",
    ...getChromeGpuFlags(),
    "about:blank",
  ]);

  const targetOrigin = `http://127.0.0.1:${HTTP_PORT}`;
  const targetUrl = `${targetOrigin}/?duel=mock&debug=1`;

  const results = {
    fast4gCold: [],
    fast4gWarm: [],
    slow4gCold: [],
    slow4gWarm: [],
  };

  try {
    let versionData = null;
    for (let i = 0; i < 300; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch {}
      await sleep(100);
    }

    if (!versionData) throw new Error("Chrome headless không khởi động kịp sau 30 giây.");

    // Hàm đo một lần tải trang
    async function measureSingleRun({ profile, warm }) {
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
      await cdpSend("Network.enable");
      await cdpSend("Storage.enable");

      // Giả lập mobile viewport chuẩn 390x844
      await cdpSend("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });

      // Đặt chất lượng thấp và tắt hướng dẫn tân thủ
      await cdpSend("Page.addScriptToEvaluateOnNewDocument", {
        source: `
          try {
            localStorage.setItem("tg_quality", "low");
            localStorage.setItem("tg_newbie_guide_dismissed", "1");
          } catch (e) {}
        `,
      });

      // Cài mã ghi nhận window.__scene.me() ở khung hình đầu tiên
      await cdpSend("Page.addScriptToEvaluateOnNewDocument", {
        source: `
          window.__tgTimeToWorld = null;
          const _checkMe = () => {
            try {
              if (window.__scene && typeof window.__scene.me === 'function' && window.__scene.me()) {
                window.__tgTimeToWorld = Math.round(performance.now());
                return;
              }
            } catch (e) {}
            requestAnimationFrame(_checkMe);
          };
          requestAnimationFrame(_checkMe);
        `,
      });

      if (!warm) {
        // Lạnh: xoá toàn bộ dữ liệu storage, cache và Service Worker của origin
        await cdpSend("Storage.clearDataForOrigin", {
          origin: targetOrigin,
          storageTypes: "all",
        });
        await cdpSend("Network.clearBrowserCache");
        await cdpSend("Network.clearBrowserCookies");
        await cdpSend("Network.setCacheDisabled", { cacheDisabled: true });
      } else {
        // Ấm: bật cache
        await cdpSend("Network.setCacheDisabled", { cacheDisabled: false });
      }

      // Đặt thông số mạng theo hồ sơ
      await cdpSend("Network.emulateNetworkConditions", {
        offline: profile.offline,
        latency: profile.latency,
        downloadThroughput: profile.downloadThroughput,
        uploadThroughput: profile.uploadThroughput,
        connectionType: profile.connectionType,
      });

      // Bắt đầu điều hướng
      await cdpSend("Page.navigate", { url: targetUrl });

      // Đợi window.__tgTimeToWorld
      let timeToWorld = null;
      const maxWait = profile.id === "slow4g" && !warm ? 35000 : 20000;
      const startPoll = Date.now();
      while (Date.now() - startPoll < maxWait) {
        await sleep(50);
        const evalRes = await cdpSend("Runtime.evaluate", {
          expression: `window.__tgTimeToWorld`,
          returnByValue: true,
        });
        const val = evalRes?.result?.result?.value;
        if (typeof val === "number" && val > 0) {
          timeToWorld = val;
          break;
        }
      }

      // Đóng tab
      cdpWs.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tabData.id}`);

      return timeToWorld;
    }

    // Hàm mồi để Service Worker đăng ký và precache trước khi đo Ấm
    async function primeServiceWorker() {
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
      await cdpSend("Network.enable");

      // Tải trang bình thường ở tốc độ mạng đầy đủ (không throttle) để cài SW nhanh
      await cdpSend("Page.navigate", { url: targetUrl });

      // Đợi ServiceWorker active
      for (let i = 0; i < 50; i++) {
        await sleep(200);
        const res = await cdpSend("Runtime.evaluate", {
          expression: `Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)`,
          returnByValue: true,
        });
        if (res?.result?.result?.value) break;
      }

      // Đợi thêm một chút để SW precache xong
      await sleep(1000);

      cdpWs.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tabData.id}`);
    }

    // 1. FAST 4G
    console.log(`\n=== 1. ĐO FAST 4G (~9 Mbps, 170 ms) ===`);
    console.log(`- Đo Lạnh (Cold, cache tắt, xóa sạch storage) ${runsPerCase} lần:`);
    for (let i = 1; i <= runsPerCase; i++) {
      const ms = await measureSingleRun({ profile: NETWORK_PROFILES.fast4g, warm: false });
      console.log(`  + Lần ${i}: ${ms ? `${ms} ms` : "Thất bại (hết giờ)"}`);
      if (ms) results.fast4gCold.push(ms);
      await sleep(200);
    }

    console.log(`- Mồi Service Worker trước khi đo Ấm...`);
    await primeServiceWorker();

    console.log(`- Đo Ấm (Warm, cache bật & SW đã cài) ${runsPerCase} lần:`);
    for (let i = 1; i <= runsPerCase; i++) {
      const ms = await measureSingleRun({ profile: NETWORK_PROFILES.fast4g, warm: true });
      console.log(`  + Lần ${i}: ${ms ? `${ms} ms` : "Thất bại (hết giờ)"}`);
      if (ms) results.fast4gWarm.push(ms);
      await sleep(200);
    }

    // 2. SLOW 4G
    console.log(`\n=== 2. ĐO SLOW 4G (~1.6 Mbps, 150 ms) ===`);
    console.log(`- Đo Lạnh (Cold, cache tắt, xóa sạch storage) ${runsPerCase} lần:`);
    for (let i = 1; i <= runsPerCase; i++) {
      const ms = await measureSingleRun({ profile: NETWORK_PROFILES.slow4g, warm: false });
      console.log(`  + Lần ${i}: ${ms ? `${ms} ms` : "Thất bại (hết giờ)"}`);
      if (ms) results.slow4gCold.push(ms);
      await sleep(200);
    }

    console.log(`- Mồi Service Worker trước khi đo Ấm...`);
    await primeServiceWorker();

    console.log(`- Đo Ấm (Warm, cache bật & SW đã cài) ${runsPerCase} lần:`);
    for (let i = 1; i <= runsPerCase; i++) {
      const ms = await measureSingleRun({ profile: NETWORK_PROFILES.slow4g, warm: true });
      console.log(`  + Lần ${i}: ${ms ? `${ms} ms` : "Thất bại (hết giờ)"}`);
      if (ms) results.slow4gWarm.push(ms);
      await sleep(200);
    }
  } finally {
    try {
      chromeProcess.kill("SIGKILL");
    } catch {}
    server.close();
    try {
      fs.rmSync(tmpChromeDir, { recursive: true, force: true });
    } catch {}
  }

  const summary = {
    fast4gColdP50: Math.round(median(results.fast4gCold)),
    fast4gWarmP50: Math.round(median(results.fast4gWarm)),
    slow4gColdP50: Math.round(median(results.slow4gCold)),
    slow4gWarmP50: Math.round(median(results.slow4gWarm)),
    raw: results,
  };

  console.log(`\n================ KẾT QUẢ TỔNG HỢP (p50) ================`);
  console.log(`Fast 4G Lạnh (Cold): ${summary.fast4gColdP50} ms`);
  console.log(`Fast 4G Ấm   (Warm): ${summary.fast4gWarmP50} ms`);
  console.log(`Slow 4G Lạnh (Cold): ${summary.slow4gColdP50} ms`);
  console.log(`Slow 4G Ấm   (Warm): ${summary.slow4gWarmP50} ms`);
  console.log(`========================================================\n`);

  return summary;
}

// Chạy trực tiếp qua CLI
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  const runsArg = process.argv.find((a) => a.startsWith("--runs="));
  const runs = runsArg ? parseInt(runsArg.split("=")[1], 10) : 5;
  try {
    await run4gBenchmark({ runs });
    process.exit(0);
  } catch (err) {
    console.error("Lỗi khi đo 4G:", err);
    process.exit(1);
  }
}
