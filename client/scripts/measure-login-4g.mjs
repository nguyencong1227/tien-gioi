/* global console, setTimeout, fetch */
/**
 * Đo thời gian tới MÀN ĐĂNG NHẬP dùng được (và tới lúc chunk game tải xong) qua mạng 4G giả lập, tải Lạnh (#1097).
 *
 * `measure-4g.mjs` đo từ lúc mở trang tới khi có nhân vật (đường mock, không có màn đăng nhập) nên không thấy lợi ích của việc tách Phaser + cảnh thế giới ra khỏi gói khởi động:
 * ở đây đo `domContentLoadedEventEnd` (mô-đun `<script type="module">` của gói khởi động chạy xong TRƯỚC mốc này, tức form đăng nhập đã có tay xử lý) và `responseEnd` muộn nhất của
 * mọi tệp JS (khi Phaser + cảnh thế giới tải xong lúc rảnh; bấm Vào sau mốc này không phải chờ gói nào).
 *
 *   node client/scripts/measure-login-4g.mjs [--dist <thư mục dist>] [--runs=5]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { getChromeGpuFlags } from "./chrome-gpu.mjs";
import { COMPRESSIBLE_EXTS, NETWORK_PROFILES, median } from "./measure-4g.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const here = path.dirname(fileURLToPath(import.meta.url));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const DIST = path.resolve(argOf("--dist", path.join(here, "../dist")));
const runsArg = process.argv.find((a) => a.startsWith("--runs="));
const RUNS = runsArg ? Number(runsArg.split("=")[1]) : 5;
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

if (!fs.existsSync(DIST)) throw new Error(`Không có ${DIST}: chạy 'npm run build' trước.`);
const server = http.createServer((req, res) => {
  const urlPath = (req.url ?? "/").split("?")[0];
  let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
    filePath = path.join(DIST, "index.html");
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": MIMES[ext] || "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
  };
  let data = fs.readFileSync(filePath);
  if (COMPRESSIBLE_EXTS.has(ext) && String(req.headers["accept-encoding"] ?? "").includes("gzip")) {
    data = zlib.gzipSync(data);
    headers["Content-Encoding"] = "gzip";
    headers["Vary"] = "Accept-Encoding";
  }
  headers["Content-Length"] = data.length;
  res.writeHead(200, headers);
  res.end(data);
});
const HTTP_PORT = await freePort();
await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));
const CDP_PORT = await freePort();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-login-4g-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmp}`,
    "--no-sandbox",
    "--disable-dev-shm-usage",
    ...getChromeGpuFlags(),
    "about:blank",
  ],
  { stdio: "ignore" },
);
const origin = `http://127.0.0.1:${HTTP_PORT}`;
const out = {};
try {
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) break;
    } catch {
      /* chờ Chrome */
    }
    await sleep(100);
  }
  const once = async (profile) => {
    const tab = await (
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" })
    ).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r) => ws.on("open", r));
    let id = 1;
    const pending = new Map();
    ws.on("message", (d) => {
      const m = JSON.parse(d);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const i = id++;
        pending.set(i, resolve);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Storage.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{localStorage.setItem("tg_quality","low");localStorage.setItem("tg_newbie_guide_dismissed","1")}catch(e){}`,
    });
    await send("Storage.clearDataForOrigin", { origin, storageTypes: "all" });
    await send("Network.clearBrowserCache");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.downloadThroughput,
      uploadThroughput: profile.uploadThroughput,
      connectionType: profile.connectionType,
    });
    await send("Page.navigate", { url: `${origin}/?debug=1` });
    // chờ mọi tải xong + thời gian cho việc tải sẵn lúc rảnh (tối đa 2,5 s) rồi đo
    const read = `(() => { const n = performance.getEntriesByType("navigation")[0];
      const js = performance.getEntriesByType("resource").filter((r) => /\\.js(\\?|$)/.test(r.name));
      const last = js.reduce((a, r) => (r.responseEnd > a.responseEnd ? r : a), { responseEnd: 0, name: "" });
      return JSON.stringify({ now: Math.round(performance.now()), dcl: Math.round(n.domContentLoadedEventEnd), jsEnd: Math.round(last.responseEnd), jsCount: js.length, jsBytes: js.reduce((a, r) => a + r.encodedBodySize, 0) }); })()`;
    // đợi đủ lâu cho việc tải sẵn lúc rảnh (hẹn tối đa 2,5 s sau khi màn đăng nhập dùng được, rồi tải ~2 s trên Slow 4G), rồi lấy số đo lúc đã ổn định
    let r = null;
    for (let k = 0; k < 120; k++) {
      await sleep(500);
      const v = await send("Runtime.evaluate", { expression: read, returnByValue: true });
      const val = v.result?.result?.value;
      if (!val) continue;
      const cur = JSON.parse(val);
      if (cur.dcl > 0 && cur.now - cur.dcl >= 8000) {
        r = cur;
        break;
      }
    }
    if (!r) throw new Error("Không đo được (trang không tải xong trong 60 giây).");
    ws.close();
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`).catch(() => {});
    return r;
  };
  for (const key of ["fast4g", "slow4g"]) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) rs.push(await once(NETWORK_PROFILES[key]));
    out[key] = {
      dclP50: median(rs.map((r) => r.dcl)),
      jsEndP50: median(rs.map((r) => r.jsEnd)),
      jsCount: rs[0].jsCount,
      jsKb: Math.round(median(rs.map((r) => r.jsBytes)) / 1024),
      runs: rs.map((r) => `${r.dcl}/${r.jsEnd}`),
    };
  }
  console.log(`dist: ${DIST}`);
  for (const key of ["fast4g", "slow4g"]) {
    const o = out[key];
    console.log(
      `${NETWORK_PROFILES[key].name} Lạnh: màn đăng nhập dùng được (DCL) p50 ${o.dclP50} ms; JS tải xong hết p50 ${o.jsEndP50} ms (${o.jsCount} tệp, ${o.jsKb} KB nén); các lần DCL/JS: ${o.runs.join(", ")}`,
    );
  }
} finally {
  chrome.kill();
  server.close();
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* bỏ qua */
  }
}
process.exit(0);
