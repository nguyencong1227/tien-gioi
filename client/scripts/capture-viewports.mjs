/* global console, setTimeout, fetch */
// Script tự động chụp ảnh màn hình đa viewport (E2E Multi-Viewport Screenshots)
// Phục vụ Milestone M5 (giao diện đa thiết bị & đồ hoạ Phaser)
// Chụp bộ ảnh mốc (baseline) trên nhiều kích thước màn hình và kịch bản giao diện.
//
// Cách dùng:
//   node client/scripts/capture-viewports.mjs
//   npm run capture:viewports
//   node client/scripts/capture-viewports.mjs --out-dir=docs/screenshots/m5-baseline
//   node client/scripts/capture-viewports.mjs --viewports=mobile-p,desktop-hd --scenarios=hud,char

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const DIST = path.join(REPO, "client/dist");

// Danh sách các viewport tiêu chuẩn cho đa thiết bị
export const VIEWPORTS = [
  {
    id: "mobile-p",
    name: "Điện thoại dọc (iPhone / Android chuẩn)",
    width: 390,
    height: 844,
    dpr: 2,
    mobile: true,
  },
  {
    id: "mobile-l",
    name: "Điện thoại ngang (Gaming landscape)",
    width: 844,
    height: 390,
    dpr: 2,
    mobile: true,
  },
  {
    id: "mobile-sm",
    name: "Điện thoại nhỏ (Compact 360x640)",
    width: 360,
    height: 640,
    dpr: 2,
    mobile: true,
  },
  {
    id: "tablet-p",
    name: "Máy tính bảng dọc (iPad Portrait)",
    width: 768,
    height: 1024,
    dpr: 2,
    mobile: true,
  },
  {
    id: "tablet-l",
    name: "Máy tính bảng ngang (iPad Landscape)",
    width: 1024,
    height: 768,
    dpr: 2,
    mobile: true,
  },
  {
    id: "desktop-hd",
    name: "Máy tính Laptop / HD (1280x720)",
    width: 1280,
    height: 720,
    dpr: 1,
    mobile: false,
  },
  {
    id: "desktop-fhd",
    name: "Máy tính Full HD (1920x1080)",
    width: 1920,
    height: 1080,
    dpr: 1,
    mobile: false,
  },
];

// Các kịch bản giao diện cần chụp mốc
export const SCENARIOS = [
  {
    id: "01-auth-login",
    name: "Màn hình Đăng nhập",
    mode: "auth",
    action: async (send) => {
      await send("Runtime.evaluate", {
        expression: `
          if (window.__authUi) window.__authUi.switchView("login");
          else if (document.getElementById("link-to-login")) document.getElementById("link-to-login").click();
        `,
      });
      await sleep(400);
    },
  },
  {
    id: "02-auth-register",
    name: "Màn hình Đăng ký",
    mode: "auth",
    action: async (send) => {
      await send("Runtime.evaluate", {
        expression: `
          if (window.__authUi) window.__authUi.switchView("register");
          else if (document.getElementById("link-to-register")) document.getElementById("link-to-register").click();
        `,
      });
      await sleep(400);
    },
  },
  {
    id: "03-game-hud",
    name: "Giao diện chính trong game (HUD & Bản đồ)",
    mode: "game",
    action: async () => {
      await sleep(600);
    },
  },
  {
    id: "04-game-char",
    name: "Bảng Nhân vật (Chỉ số & Cảnh giới)",
    mode: "game",
    action: async (send) => {
      await send("Runtime.evaluate", {
        expression: `
          const btn = document.getElementById("btn-char");
          if (btn) btn.click();
        `,
      });
      await sleep(500);
    },
  },
  {
    id: "05-game-inventory",
    name: "Bảng Túi đồ & Đan dược",
    mode: "game",
    action: async (send) => {
      await send("Runtime.evaluate", {
        expression: `
          const btn = document.getElementById("btn-bag");
          if (btn) btn.click();
        `,
      });
      await sleep(500);
    },
  },
  {
    id: "06-game-settings",
    name: "Bảng Cài đặt & Tuỳ chọn",
    mode: "game",
    action: async (send) => {
      await send("Runtime.evaluate", {
        expression: `
          const btn = document.getElementById("btn-settings");
          if (btn) btn.click();
        `,
      });
      await sleep(500);
    },
  },
  {
    id: "07-game-crowd",
    name: "Trấn đông người (30 người tụ tập)",
    mode: "crowd",
    action: async () => {
      await sleep(1200);
    },
  },
];

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function parseArgs() {
  const args = process.argv.slice(2);
  let outDir = path.join(REPO, "docs/screenshots/m5-baseline");
  let filterViewports = null;
  let filterScenarios = null;

  for (const arg of args) {
    if (arg.startsWith("--out-dir=")) {
      outDir = path.resolve(arg.slice("--out-dir=".length));
    } else if (arg.startsWith("--viewports=")) {
      filterViewports = arg
        .slice("--viewports=".length)
        .split(",")
        .map((s) => s.trim().toLowerCase());
    } else if (arg.startsWith("--scenarios=")) {
      filterScenarios = arg
        .slice("--scenarios=".length)
        .split(",")
        .map((s) => s.trim().toLowerCase());
    }
  }

  return { outDir, filterViewports, filterScenarios };
}

async function main() {
  const { outDir, filterViewports, filterScenarios } = parseArgs();

  console.log("=== Bắt đầu công cụ E2E chụp ảnh đa viewport (M5 Baseline) ===");
  console.log(`- Thư mục lưu ảnh: ${outDir}`);

  // 1. Kiểm tra build client
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.log("- Đang build client/dist...");
    execSync("npm run build -w client", { cwd: REPO, stdio: "inherit" });
  }

  fs.mkdirSync(outDir, { recursive: true });

  // 2. Khởi tạo Static Web Server
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

  const HTTP_PORT = 39880 + Math.floor(Math.random() * 80);
  await new Promise((resolve) => server.listen(HTTP_PORT, "127.0.0.1", resolve));
  console.log(`- Web server sẵn sàng tại: http://127.0.0.1:${HTTP_PORT}`);

  // 3. Khởi động Chrome headless
  const CDP_PORT = 39980 + Math.floor(Math.random() * 80);
  const tmpChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-capture-viewports-"));

  const chromeProcess = spawn("google-chrome", [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpChromeDir}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "about:blank",
  ]);

  let activeViewports = VIEWPORTS;
  if (filterViewports && filterViewports.length > 0) {
    activeViewports = VIEWPORTS.filter(
      (v) => filterViewports.includes(v.id) || filterViewports.some((f) => v.id.includes(f)),
    );
  }

  let activeScenarios = SCENARIOS;
  if (filterScenarios && filterScenarios.length > 0) {
    activeScenarios = SCENARIOS.filter(
      (s) => filterScenarios.includes(s.id) || filterScenarios.some((f) => s.id.includes(f)),
    );
  }

  const manifest = {
    capturedAt: new Date().toISOString(),
    viewports: activeViewports,
    scenarios: activeScenarios.map((s) => ({ id: s.id, name: s.name })),
    images: [],
  };

  try {
    // Chờ Chrome CDP sẵn sàng
    let cdpReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (res.ok) {
          cdpReady = true;
          break;
        }
      } catch {
        // Đợi Chrome mở socket
      }
      await sleep(100);
    }

    if (!cdpReady) throw new Error("Chrome headless không mở cổng CDP kịp thời.");

    // Lặp qua từng Viewport
    for (const vp of activeViewports) {
      console.log(`\n======================================================`);
      console.log(`>>> VIEWPORT: ${vp.name} (${vp.width}x${vp.height}, DPR: ${vp.dpr})`);
      console.log(`======================================================`);

      // Mỗi Viewport chạy các Scenarios
      for (const sc of activeScenarios) {
        console.log(`  -> Chụp kịch bản: [${sc.id}] ${sc.name}...`);

        // Mở tab mới
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

        // Thiết lập kích thước viewport & DPR
        await cdpSend("Emulation.setDeviceMetricsOverride", {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: vp.dpr,
          mobile: vp.mobile,
        });

        // Xác định URL theo mode
        let targetUrl = `http://127.0.0.1:${HTTP_PORT}/?debug=1`;
        if (sc.mode === "auth") {
          targetUrl = `http://127.0.0.1:${HTTP_PORT}/?auth=mock&debug=1`;
        } else if (sc.mode === "crowd") {
          targetUrl = `http://127.0.0.1:${HTTP_PORT}/?crowd=30&debug=1`;
        } else {
          targetUrl = `http://127.0.0.1:${HTTP_PORT}/?sect=mock&debug=1`;
        }

        // Điều hướng tới URL
        await cdpSend("Page.navigate", { url: targetUrl });

        // Chờ tải xong trang
        if (sc.mode === "auth") {
          // Chờ form auth xuất hiện
          for (let i = 0; i < 40; i++) {
            await sleep(150);
            const r = await cdpSend("Runtime.evaluate", {
              expression: `Boolean(document.getElementById("login"))`,
              returnByValue: true,
            });
            if (r?.result?.result?.value) break;
          }
        } else {
          // Chờ game scene & UI xuất hiện
          for (let i = 0; i < 60; i++) {
            await sleep(200);
            const r = await cdpSend("Runtime.evaluate", {
              expression: `Boolean(window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
              returnByValue: true,
            });
            if (r?.result?.result?.value) break;
          }
        }

        // Thực hiện hành động mở bảng / modal tương ứng
        if (sc.action) {
          await sc.action(cdpSend);
        }

        // Đợi render ổn định trước khi chụp
        await sleep(300);

        // Chụp ảnh màn hình
        const shotRes = await cdpSend("Page.captureScreenshot", { format: "png" });
        const imgBuffer = Buffer.from(shotRes.result.data, "base64");
        const fileName = `${vp.id}__${sc.id}.png`;
        const filePath = path.join(outDir, fileName);

        fs.writeFileSync(filePath, imgBuffer);
        console.log(`     ✓ Đã lưu: ${fileName} (${(imgBuffer.length / 1024).toFixed(1)} KB)`);

        manifest.images.push({
          viewportId: vp.id,
          viewportName: vp.name,
          width: vp.width,
          height: vp.height,
          dpr: vp.dpr,
          scenarioId: sc.id,
          scenarioName: sc.name,
          fileName,
          sizeKb: Number((imgBuffer.length / 1024).toFixed(1)),
        });

        // Đóng tab
        cdpWs.close();
        await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tabData.id}`);
      }
    }

    // Ghi manifest.json
    fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    // Sinh trang Gallery index.html để xem trực quan
    const galleryHtml = generateGalleryHtml(manifest);
    fs.writeFileSync(path.join(outDir, "index.html"), galleryHtml);

    // Sinh tài liệu tóm tắt README.md
    const readmeMd = generateReadmeMd(manifest);
    fs.writeFileSync(path.join(outDir, "README.md"), readmeMd);

    console.log(`\n🎉 HOÀN THÀNH CHỤP ẢNH ĐA VIEWPORT (TỔNG CỘNG: ${manifest.images.length} ẢNH)`);
    console.log(`- Xem trực quan tại: file://${path.join(outDir, "index.html")}`);
    console.log(`- Tài liệu tóm tắt: ${path.join(outDir, "README.md")}`);
  } finally {
    chromeProcess.kill("SIGKILL");
    server.close();
    try {
      fs.rmSync(tmpChromeDir, { recursive: true, force: true });
    } catch {
      // Bỏ qua lỗi xoá thư mục tạm
    }
  }
}

function generateGalleryHtml(manifest) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Tiên Giới - Bộ Ảnh Mốc Đa Viewport M5 (Baseline)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #12100e; color: #e6dec8; margin: 0; padding: 24px; }
    h1 { color: #d4a359; margin-bottom: 8px; }
    p.sub { color: #a89a80; margin-top: 0; }
    .filters { margin: 20px 0; display: flex; gap: 12px; flex-wrap: wrap; }
    .filter-btn { background: #26211a; color: #d4a359; border: 1px solid #4a3d2c; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .filter-btn.active { background: #8b5a2b; color: #fff; border-color: #d4a359; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; margin-top: 24px; }
    .card { background: #1c1813; border: 1px solid #3d3324; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
    .card-header { padding: 12px 16px; background: #231e17; border-bottom: 1px solid #3d3324; }
    .card-title { font-weight: 600; color: #d4a359; margin: 0 0 4px 0; font-size: 15px; }
    .card-meta { font-size: 12px; color: #8e806a; }
    .img-wrap { padding: 12px; background: #0a0908; display: flex; justify-content: center; align-items: center; min-height: 220px; }
    .img-wrap img { max-width: 100%; max-height: 380px; object-fit: contain; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
    .card-footer { padding: 8px 16px; font-size: 12px; color: #736754; border-top: 1px solid #231e17; text-align: right; }
  </style>
</head>
<body>
  <h1>Tiên Giới - Bộ Ảnh Mốc Đa Viewport M5 (Baseline)</h1>
  <p class="sub">Thời gian chụp: ${manifest.capturedAt} | Tổng cộng: ${manifest.images.length} ảnh</p>

  <div class="filters">
    <button class="filter-btn active" onclick="filterVp('all')">Tất cả Viewports</button>
    ${manifest.viewports.map((v) => `<button class="filter-btn" onclick="filterVp('${v.id}')">${v.id} (${v.width}x${v.height})</button>`).join("\n    ")}
  </div>

  <div class="grid" id="gallery">
    ${manifest.images
      .map(
        (img) => `
      <div class="card" data-vp="${img.viewportId}">
        <div class="card-header">
          <div class="card-title">${img.scenarioName}</div>
          <div class="card-meta">${img.viewportName} • ${img.width}×${img.height} (DPR ${img.dpr})</div>
        </div>
        <div class="img-wrap">
          <a href="${img.fileName}" target="_blank">
            <img src="${img.fileName}" alt="${img.scenarioName} - ${img.viewportName}" loading="lazy">
          </a>
        </div>
        <div class="card-footer">${img.fileName} (${img.sizeKb} KB)</div>
      </div>
    `,
      )
      .join("")}
  </div>

  <script>
    function filterVp(vpId) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      document.querySelectorAll('.card').forEach(c => {
        if (vpId === 'all' || c.getAttribute('data-vp') === vpId) {
          c.style.display = 'flex';
        } else {
          c.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}

function generateReadmeMd(manifest) {
  return `# Bộ Ảnh Mốc Đa Viewport M5 (Baseline Multi-Viewport Screenshots)

> Thư mục chứa bộ ảnh chụp màn hình làm mốc đối chiếu trước khi thực hiện các cải tiến giao diện đa thiết bị & đồ hoạ Phaser trong Milestone M5.
> Được sinh tự động bởi \`client/scripts/capture-viewports.mjs\` (\`npm run capture:viewports\`).
> Thời điểm chụp mốc: \`${manifest.capturedAt}\`.

## 1. Danh sách Viewport đo đạc

| Mã | Thiết bị mô phỏng | Kích thước (px) | Mật độ điểm ảnh (DPR) | Loại thiết bị |
|---|---|---|---|---|
${manifest.viewports.map((v) => `| \`${v.id}\` | ${v.name} | ${v.width} × ${v.height} | ${v.dpr} | ${v.mobile ? "Di động (Cảm ứng)" : "Máy tính (Chuột/Phím)"} |`).join("\n")}

## 2. Danh sách Kịch bản giao diện

| Mã kịch bản | Tên kịch bản | Mô tả kiểm tra |
|---|---|---|
${manifest.scenarios.map((s) => `| \`${s.id}\` | ${s.name} | Ảnh mốc hiển thị |`).join("\n")}

## 3. Tổng hợp ảnh chụp mốc (${manifest.images.length} ảnh)

- Xem trực quan dưới dạng gallery HTML tương tác tại: \`index.html\` (mở trong trình duyệt).
- Tệp siêu dữ liệu: \`manifest.json\`.

## 4. Cách chạy lại lệnh chụp
\`\`\`bash
npm run capture:viewports
\`\`\`
`;
}

if (process.argv[1]?.endsWith("capture-viewports.mjs")) {
  main().catch((err) => {
    console.error("Lỗi khi chạy capture-viewports:", err);
    process.exit(1);
  });
}
