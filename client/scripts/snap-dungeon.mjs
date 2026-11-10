import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

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
  } catch (err) {
    res.writeHead(404);
    res.end();
  }
});

const HTTP_PORT = 38900 + Math.floor(Math.random() * 500);
await new Promise((resolve) => server.listen(HTTP_PORT, "127.0.0.1", resolve));
console.log(`- Web server tạm sẵn sàng tại http://127.0.0.1:${HTTP_PORT}`);

const CDP_PORT = 39500 + Math.floor(Math.random() * 500);
const tmpChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-snap-chrome-"));

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

    // Điều hướng vào trang mock bí cảnh
    const testUrl = `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1`;
    console.log(`- Điều hướng tới ${testUrl}`);
    await cdpSend("Page.navigate", { url: testUrl });

    // Đợi window.__mockDungeon sẵn sàng
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      const res = await cdpSend("Runtime.evaluate", {
        expression: `JSON.stringify({
          mockDungeon: Boolean(window.__mockDungeon),
          ui: Boolean(window.__ui),
          scene: Boolean(window.__scene),
          game: Boolean(window.__game),
        })`,
        returnByValue: true,
      });
      const raw = res?.result?.result?.value;
      const st = raw ? JSON.parse(raw) : {};
      if (st.mockDungeon && st.ui && st.scene) {
        ready = true;
        break;
      }
    }
    if (!ready) throw new Error("Giao diện mock dungeon không khởi động kịp sau 9s.");
    console.log("- Giao diện mock dungeon đã sẵn sàng.");
    await sleep(600);

    const snap = async (filename) => {
      await sleep(400);
      const res = await cdpSend("Page.captureScreenshot", { format: "png" });
      const buf = Buffer.from(res.result.data, "base64");
      const outPath = path.join(OUT_DIR, filename);
      fs.writeFileSync(outPath, buf);
      console.log(`  ✓ Đã chụp: ${filename} (${buf.length} bytes)`);
    };

    // 1. Hộp thoại Thủ Môn đủ điều kiện
    console.log("- Chụp hộp thoại Thủ Môn (đủ điều kiện)...");
    await cdpSend("Runtime.evaluate", {
      expression: `window.__mockDungeon.openThuMonOk()`,
    });
    await snap(`dungeon-dialog-ok-${sz.name}.png`);

    // 2. Hộp thoại Thủ Môn thiếu điều kiện
    console.log("- Chụp hộp thoại Thủ Môn (thiếu điều kiện)...");
    await cdpSend("Runtime.evaluate", {
      expression: `window.__mockDungeon.openThuMonFail()`,
    });
    await snap(`dungeon-dialog-fail-${sz.name}.png`);

    // Đóng dialog
    await cdpSend("Runtime.evaluate", {
      expression: `window.__ui.closeDialog()`,
    });

    // 3. Lời mời Bí cảnh
    console.log("- Chụp lời mời Bí cảnh...");
    await cdpSend("Runtime.evaluate", {
      expression: `window.__mockDungeon.showInvite()`,
    });
    await snap(`dungeon-invite-${sz.name}.png`);

    // 4. Vào trận đánh trùm Bí cảnh
    console.log("- Chụp HUD bí cảnh đang đánh trùm...");
    await cdpSend("Runtime.evaluate", {
      expression: `window.__mockDungeon.enterBossFight()`,
    });
    await snap(`dungeon-hud-fight-${sz.name}.png`);

    // 5. Kết quả Thắng
    console.log("- Chụp màn kết quả Thắng...");
    await cdpSend("Runtime.evaluate", {
      expression: `window.__mockDungeon.showWon()`,
    });
    await snap(`dungeon-won-${sz.name}.png`);

    // 6. Kết quả Thua
    console.log("- Chụp màn kết quả Thua...");
    await cdpSend("Runtime.evaluate", {
      expression: `window.__mockDungeon.showLost()`,
    });
    await snap(`dungeon-lost-${sz.name}.png`);
  } finally {
    if (cdpWs) cdpWs.close();
    chromeProcess.kill();
    await sleep(400);
  }
}

server.close();
try {
  fs.rmSync(tmpChromeDir, { recursive: true, force: true });
} catch {}
console.log("\n Hoàn tất chụp 12 ảnh nghiệm thu Bí cảnh!");
