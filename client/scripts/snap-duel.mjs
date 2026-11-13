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
const tmpChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-snap-duel-"));

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

    // Điều hướng vào trang mock duel
    const testUrl = `http://127.0.0.1:${HTTP_PORT}/?duel=mock&debug=1`;
    console.log(`- Điều hướng tới ${testUrl}`);
    await cdpSend("Page.navigate", { url: testUrl });

    // Đợi window.__mockDuel và UI sẵn sàng
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      const res = await cdpSend("Runtime.evaluate", {
        expression: `JSON.stringify({
          mockDuel: Boolean(window.__mockDuel),
          ui: Boolean(window.__ui),
          scene: Boolean(window.__scene),
        })`,
        returnByValue: true,
      });
      const raw = res?.result?.result?.value;
      const st = raw ? JSON.parse(raw) : {};
      if (st.mockDuel && st.ui && st.scene) {
        ready = true;
        break;
      }
    }
    if (!ready) throw new Error("Giao diện mock duel không khởi động kịp sau 9s.");
    console.log("- Giao diện mock duel đã sẵn sàng.");
    await sleep(600);

    const snap = async (filename) => {
      await sleep(400);
      const res = await cdpSend("Page.captureScreenshot", { format: "png" });
      const buf = Buffer.from(res.result.data, "base64");
      const outPath = path.join(OUT_DIR, filename);
      fs.writeFileSync(outPath, buf);
      console.log(`  ✓ Đã chụp: ${filename} (${buf.length} bytes)`);
    };

    // 1. Menu người chơi có nút Thách đấu
    console.log("- Chụp menu người chơi...");
    await cdpSend("Runtime.evaluate", {
      expression: `
        window.__mockDuel.hide();
        window.__ui.openPlayerMenu("Diệp Phàm", 1, 4, ${sz.w < 600 ? 50 : 250}, ${sz.w < 600 ? 120 : 180}, { ok: true });
      `,
    });
    await snap(`duel-menu-${sz.name}.png`);

    // 2. Lời mời thách đấu (20s)
    console.log("- Chụp hộp lời mời thách đấu...");
    await cdpSend("Runtime.evaluate", {
      expression: `
        window.__ui.closePlayerMenu();
        window.__mockDuel.showInvite("Diệp Phàm");
      `,
    });
    await snap(`duel-invite-${sz.name}.png`);

    // 3. Đếm ngược 3-2-1 giữa màn hình
    console.log("- Chụp đếm ngược 3-2-1...");
    await cdpSend("Runtime.evaluate", {
      expression: `
        window.__mockDuel.showCountdown("Diệp Phàm");
      `,
    });
    await snap(`duel-countdown-${sz.name}.png`);

    // 4. HUD quyết đấu (chiến đấu)
    console.log("- Chụp HUD quyết đấu...");
    await cdpSend("Runtime.evaluate", {
      expression: `
        window.__mockDuel.showFighting("Diệp Phàm");
        window.__mockDuel.updateOpponentHp(4200, 5000);
      `,
    });
    await snap(`duel-hud-fight-${sz.name}.png`);

    // 5. Kết quả: Đại Thắng
    console.log("- Chụp kết quả Đại Thắng...");
    await cdpSend("Runtime.evaluate", {
      expression: `
        window.__mockDuel.showWon("Diệp Phàm");
      `,
    });
    await snap(`duel-won-${sz.name}.png`);

    // 6. Kết quả: Chiến Bại
    console.log("- Chụp kết quả Chiến Bại...");
    await cdpSend("Runtime.evaluate", {
      expression: `
        window.__mockDuel.showLost("Diệp Phàm");
      `,
    });
    await snap(`duel-lost-${sz.name}.png`);

    // Đóng modal kết quả
    await cdpSend("Runtime.evaluate", {
      expression: `window.__mockDuel.hide();`,
    });
  } finally {
    if (cdpWs) {
      try {
        cdpWs.close();
      } catch {
        // bỏ qua
      }
    }
    chromeProcess.kill("SIGKILL");
    await sleep(200);
    fs.rmSync(tmpChromeDir, { recursive: true, force: true });
  }
}

server.close();
console.log("\n Hoàn tất chụp đủ 12 ảnh nghiệm thu PK Thách đấu.");
