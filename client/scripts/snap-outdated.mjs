/* global console, setTimeout, fetch, Buffer */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const DIST = path.join(REPO, "client/dist");
const OUT_DIR = path.join(REPO, "docs/screenshots");

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

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

const HTTP_PORT = await freePort();
await new Promise((resolve) => server.listen(HTTP_PORT, "127.0.0.1", resolve));
console.log(`- Web server tạm sẵn sàng tại http://127.0.0.1:${HTTP_PORT}`);

const CDP_PORT = await freePort();
const tmpChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-snap-outdated-"));

const SIZES = [
  { name: "1280x720", w: 1280, h: 720 },
  { name: "390x844", w: 390, h: 844 },
];

for (const sz of SIZES) {
  console.log(`\n=== Bắt đầu chụp ảnh kích thước ${sz.name} ===`);
  const chromeProcess = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpChromeDir}`,
      `--window-size=${sz.w},${sz.h}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdpWs = null;
  try {
    let targets = [];
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        if (res.ok) {
          targets = await res.json();
          break;
        }
      } catch {
        await sleep(150);
      }
    }
    const pageTarget = targets.find((t) => t.type === "page");
    if (!pageTarget) throw new Error("Không tìm thấy Chrome page target.");

    cdpWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      cdpWs.onopen = res;
      cdpWs.onerror = rej;
    });

    let cdpId = 1;
    const pending = new Map();
    cdpWs.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(msg.error);
        else p.resolve(msg.result);
      }
    };

    const send = (method, params = {}) => {
      const id = ++cdpId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        cdpWs.send(JSON.stringify({ id, method, params }));
      });
    };

    await send("Page.enable");
    await send("DOM.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: sz.w,
      height: sz.h,
      deviceScaleFactor: 1,
      mobile: sz.w < 600,
    });

    // Mở trang kèm cờ ?outdated=2&debug=1 (chế độ kiểm thử giao diện)
    await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/?outdated=2&debug=1` });
    await sleep(800);

    // Chụp màn hình
    const snap = await send("Page.captureScreenshot", { format: "png" });
    const snapPath = path.join(OUT_DIR, `outdated-${sz.name}.png`);
    fs.writeFileSync(snapPath, Buffer.from(snap.data, "base64"));
    console.log(`  ✓ Đã lưu: ${snapPath}`);
  } finally {
    if (cdpWs) cdpWs.close();
    chromeProcess.kill();
    await sleep(200);
  }
}

server.close();
fs.rmSync(tmpChromeDir, { recursive: true, force: true });
console.log("\n🎉 Hoàn thành chụp ảnh nghiệm thu outdated!");
