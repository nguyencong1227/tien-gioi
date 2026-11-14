import { getChromeGpuFlags } from "./chrome-gpu.mjs";
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

// MIME types đơn giản cho static server
const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

// 1. Tạo HTTP static server phục vụ client/dist
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
const tmpChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-snap-sect-"));

const SIZES = [
  { name: "1280x720", w: 1280, h: 720 },
  { name: "390x844", w: 390, h: 844 },
];

for (const sz of SIZES) {
  console.log(`\n=== Bắt đầu chụp ảnh tông môn kích thước ${sz.name} ===`);
  const chromeProcess = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      ...getChromeGpuFlags(),
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
      if (msg.method === "Runtime.consoleAPICalled") {
        console.log(
          "  [BROWSER CONSOLE]",
          msg.params.type,
          ...msg.params.args.map((a) => a.value || a.description),
        );
      } else if (msg.method === "Runtime.exceptionThrown") {
        console.error("  [BROWSER ERROR]", msg.params.exceptionDetails);
      }
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    const cdpSend = (method, params = {}) =>
      new Promise((resolve) => {
        const id = cdpId++;
        pending.set(id, resolve);
        cdpWs.send(JSON.stringify({ id, method, params }));
      });

    await cdpSend("Runtime.enable");
    await cdpSend("Page.enable");
    await cdpSend("Network.enable");
    await cdpSend("Emulation.setDeviceMetricsOverride", {
      width: sz.w,
      height: sz.h,
      deviceScaleFactor: 1,
      mobile: sz.w < 600,
    });

    // Điều hướng vào trang mock tông môn
    const testUrl = `http://127.0.0.1:${HTTP_PORT}/?sect=mock&debug=1`;
    console.log(`- Điều hướng tới ${testUrl}`);
    await cdpSend("Page.navigate", { url: testUrl });

    // Đợi window.__mockSect và UI sẵn sàng
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      const res = await cdpSend("Runtime.evaluate", {
        expression: `JSON.stringify({
          mockSect: Boolean(window.__mockSect),
          ui: Boolean(window.__ui),
          scene: Boolean(window.__scene),
        })`,
        returnByValue: true,
      });
      const raw = res?.result?.result?.value;
      const st = raw ? JSON.parse(raw) : {};
      if (st.mockSect && st.ui && st.scene) {
        ready = true;
        break;
      }
    }
    if (!ready) throw new Error("Giao diện mock sect không khởi động kịp sau 9s.");
    console.log("- Giao diện mock sect đã sẵn sàng.");
    await sleep(600);

    const snap = async (filename) => {
      await sleep(400);
      const res = await cdpSend("Page.captureScreenshot", { format: "png" });
      const buf = Buffer.from(res.result.data, "base64");
      const outPath = path.join(OUT_DIR, filename);
      fs.writeFileSync(outPath, buf);
      console.log(`  ✓ Đã chụp: ${filename} (${buf.length} bytes)`);
    };

    const evalJs = async (expr) => {
      const res = await cdpSend("Runtime.evaluate", { expression: expr });
      if (res.result?.exceptionDetails) {
        console.error("  [EVAL ERROR]", res.result.exceptionDetails);
      }
      return res;
    };

    // 1. Bảng Tông Môn: Tổng quan
    console.log("- Chụp bảng tông môn Tổng quan...");
    await evalJs(`
      window.__mockSect.showLeader();
      window.__mockSect.switchTab("overview");
    `);
    await snap(`sect-overview-${sz.name}.png`);

    // 2. Bảng Tông Môn: Thành viên
    console.log("- Chụp bảng tông môn Thành viên...");
    await evalJs(`
      window.__mockSect.switchTab("members");
    `);
    await snap(`sect-members-${sz.name}.png`);

    // 2b. Hộp xác nhận trong game (#246): bấm nút "Trục xuất" đầu tiên trong danh sách
    console.log("- Chụp hộp xác nhận Trục xuất...");
    await evalJs(`
      [...document.querySelectorAll("#sect-members-list .sect-action-btn")]
        .find((b) => b.textContent === "Trục xuất")?.click();
    `);
    await snap(`sect-confirm-${sz.name}.png`);
    await evalJs(`document.getElementById("sect-action-confirm-cancel").click();`);

    // 3. Bảng Tông Môn: Kho tông môn & sổ ghi
    console.log("- Chụp bảng tông môn Kho tông môn...");
    await evalJs(`
      window.__mockSect.switchTab("treasury");
    `);
    await snap(`sect-treasury-${sz.name}.png`);

    // 4. Bảng Chưa có tông môn: Form Lập tông môn
    console.log("- Chụp form Lập tông môn...");
    await evalJs(`
      window.__mockSect.showNone();
    `);
    await snap(`sect-none-${sz.name}.png`);

    // 5. Hộp lời mời tông môn góc phải
    console.log("- Chụp hộp lời mời tông môn...");
    await evalJs(`
      window.__mockSect.closeModal();
      window.__mockSect.showInvite();
    `);
    await snap(`sect-invite-${sz.name}.png`);

    // 6. Menu người chơi có nút "Mời vào tông môn"
    console.log("- Chụp menu người chơi có nút Mời tông môn...");
    await evalJs(`
      window.__ui.closeSectInviteBox();
      window.__mockSect.showLeader();
      window.__mockSect.closeModal();
      window.__ui.openPlayerMenu("Hàn Lập", 1, 3, ${sz.w < 600 ? 50 : 250}, ${sz.w < 600 ? 120 : 180}, undefined, "Tiêu Dao");
    `);
    await snap(`sect-menu-${sz.name}.png`);

    cdpWs.close();
  } finally {
    chromeProcess.kill("SIGKILL");
    await sleep(300);
  }
}

server.close();
fs.rmSync(tmpChromeDir, { recursive: true, force: true });
console.log("\n Hoàn tất chụp toàn bộ ảnh tông môn.");
