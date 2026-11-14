import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process */
// Script kiểm tra PWA hoàn chỉnh theo Issue #251:
// 1. Manifest đầy đủ trường (name, short_name, start_url, display: standalone, theme_color, background_color, icons 192/512 + maskable).
// 2. Mọi URL trong PRECACHE_URLS (do stamp-sw.mjs điền) thực sự tồn tại trong client/dist/.
// 3. Chrome CDP kiểm tra Page.getInstallabilityErrors và Page.getAppManifest báo 0 lỗi cài đặt.
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
const MANIFEST_PATH = path.join(DIST, "manifest.webmanifest");
const SW_PATH = path.join(DIST, "sw.js");

console.log("=== BẮT ĐẦU KIỂM TRA PWA HOÀN CHỈNH (Issue #251) ===");

if (!fs.existsSync(DIST) || !fs.existsSync(MANIFEST_PATH) || !fs.existsSync(SW_PATH)) {
  console.error("LỖI: Chưa có thư mục build client/dist. Vui lòng chạy `npm run build` trước.");
  process.exit(1);
}

const errors = [];

// ---------------------------------------------------------------------------
// 1. Kiểm tra Web App Manifest
// ---------------------------------------------------------------------------
console.log("\n[1/3] Kiểm tra Web App Manifest...");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

const requiredFields = [
  { field: "name", check: (v) => typeof v === "string" && v.length > 0 },
  { field: "short_name", check: (v) => typeof v === "string" && v.length > 0 },
  { field: "start_url", check: (v) => typeof v === "string" && v.length > 0 },
  {
    field: "display",
    check: (v) =>
      v === "standalone" ||
      (Array.isArray(manifest.display_override) &&
        manifest.display_override.includes("standalone")),
  },
  { field: "theme_color", check: (v) => typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) },
  { field: "background_color", check: (v) => typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) },
];

for (const { field, check } of requiredFields) {
  if (check(manifest[field])) {
    console.log(`  ✓ ${field}: "${manifest[field]}"`);
  } else {
    const msg = `Manifest thiếu hoặc sai định dạng trường bắt buộc: "${field}"`;
    console.error(`  ✗ ${msg}`);
    errors.push(msg);
  }
}

// Kiểm tra icons trong manifest
if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  errors.push("Manifest không có danh sách icons hợp lệ.");
} else {
  let has192 = false;
  let has512 = false;
  let hasMaskable = false;

  for (const icon of manifest.icons) {
    const iconRel = icon.src.replace(/^\//, "");
    const iconFile = path.join(DIST, iconRel);
    const exists = fs.existsSync(iconFile);

    if (!exists) {
      const msg = `Icon trong manifest không tồn tại trên đĩa: "${icon.src}"`;
      console.error(`  ✗ ${msg}`);
      errors.push(msg);
      continue;
    }

    const sizes = String(icon.sizes || "");
    const purpose = String(icon.purpose || "any");

    if (sizes.includes("192x192")) has192 = true;
    if (sizes.includes("512x512")) has512 = true;
    if (purpose.includes("maskable")) hasMaskable = true;
  }

  if (has192) console.log("  ✓ Có icon 192x192 (any)");
  else errors.push("Manifest thiếu icon kích thước 192x192.");

  if (has512) console.log("  ✓ Có icon 512x512 (any)");
  else errors.push("Manifest thiếu icon kích thước 512x512.");

  if (hasMaskable) console.log("  ✓ Có icon maskable");
  else errors.push("Manifest thiếu icon có purpose: maskable.");
}

// ---------------------------------------------------------------------------
// 2. Kiểm tra PRECACHE_URLS trong Service Worker
// ---------------------------------------------------------------------------
console.log("\n[2/3] Kiểm tra PRECACHE_URLS trong Service Worker...");
const swContent = fs.readFileSync(SW_PATH, "utf8");
const match = swContent.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);

if (!match) {
  const msg = "Không tìm thấy mảng PRECACHE_URLS trong dist/sw.js.";
  console.error(`  ✗ ${msg}`);
  errors.push(msg);
} else {
  const precacheUrls = JSON.parse(match[1]);
  console.log(`  - Tìm thấy ${precacheUrls.length} URL trong PRECACHE_URLS.`);

  let missingCount = 0;
  for (const url of precacheUrls) {
    let filePath;
    if (url === "/" || url === "/index.html") {
      filePath = path.join(DIST, "index.html");
    } else {
      filePath = path.join(DIST, url.replace(/^\//, ""));
    }

    if (!fs.existsSync(filePath)) {
      console.error(`  ✗ URL trong PRECACHE không tồn tại trên đĩa: ${url} -> ${filePath}`);
      missingCount++;
    }
  }

  if (missingCount === 0) {
    console.log(
      `  ✓ Toàn bộ ${precacheUrls.length}/${precacheUrls.length} file tĩnh trong PRECACHE_URLS đều tồn tại 100%.`,
    );
  } else {
    errors.push(`Có ${missingCount} file trong PRECACHE_URLS bị thiếu trên đĩa.`);
  }

  // Phông tự lưu (#331): mọi /fonts/*.woff2 mà CSS bản build tham chiếu phải nằm trong PRECACHE_URLS,
  // nếu không ngoại tuyến / APK sẽ rơi về phông hệ thống
  const assetsDir = path.join(DIST, "assets");
  const builtCss = fs
    .readdirSync(assetsDir)
    .filter((n) => n.endsWith(".css"))
    .map((n) => fs.readFileSync(path.join(assetsDir, n), "utf8"))
    .join("\n");
  const fontUrls = [
    ...new Set(
      [...builtCss.matchAll(/url\(\s*["']?(\/fonts\/[^"')]+\.woff2)["']?\s*\)/g)].map((m) => m[1]),
    ),
  ];
  const fontsNotCached = fontUrls.filter((u) => !precacheUrls.includes(u));
  if (fontUrls.length === 0) {
    const msg = "CSS bản build không tham chiếu phông tự lưu /fonts/*.woff2 (đã mất @font-face?).";
    console.error(`  ✗ ${msg}`);
    errors.push(msg);
  } else if (fontsNotCached.length > 0) {
    const msg = `Phông không nằm trong PRECACHE_URLS (ngoại tuyến sẽ mất phông): ${fontsNotCached.join(", ")}`;
    console.error(`  ✗ ${msg}`);
    errors.push(msg);
  } else {
    console.log(
      `  ✓ ${fontUrls.length}/${fontUrls.length} phông tự lưu nằm trong PRECACHE_URLS (chạy ngoại tuyến vẫn đúng chữ).`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Kiểm tra Chrome CDP: Page.getInstallabilityErrors
// ---------------------------------------------------------------------------
console.log("\n[3/3] Kiểm tra Chrome CDP (Page.getInstallabilityErrors)...");

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
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

const CDP_PORT = await freePort();
const tmpChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-pwa-"));

const chromeProcess = spawn("google-chrome", [
  "--headless=new",
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${tmpChromeDir}`,
  "--no-sandbox",
  ...getChromeGpuFlags(),
  "--disable-dev-shm-usage",
  "about:blank",
]);

let cdpSuccess = false;

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
      // Chrome chưa mở cổng, thử lại ở vòng lặp sau
    }
    await sleep(100);
  }

  if (!versionData) throw new Error("Chrome headless không khởi động kịp sau 4 giây.");

  const newTabRes = await fetch(
    `http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${HTTP_PORT}/`,
    {
      method: "PUT",
    },
  );
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
  await cdpSend("ServiceWorker.enable");

  // Đợi trang nạp và Service Worker đăng ký xong
  await sleep(1800);

  const errorsRes = await cdpSend("Page.getInstallabilityErrors");
  const installErrors = errorsRes?.result?.installabilityErrors || [];

  const manifestRes = await cdpSend("Page.getAppManifest");
  const manifestErrors = manifestRes?.result?.errors || [];

  if (manifestErrors.length > 0) {
    console.error("  ✗ Lỗi phân tích Manifest:", JSON.stringify(manifestErrors, null, 2));
    errors.push(`Manifest có ${manifestErrors.length} lỗi phân tích từ trình duyệt.`);
  } else {
    console.log("  ✓ Page.getAppManifest: 0 lỗi.");
  }

  if (installErrors.length === 0) {
    console.log("  ✓ Page.getInstallabilityErrors: 0 lỗi cài đặt (PWA đủ điều kiện cài đặt 100%).");
    cdpSuccess = true;
  } else {
    console.error("  ✗ Lỗi cài đặt PWA:", JSON.stringify(installErrors, null, 2));
    errors.push(`Chrome báo ${installErrors.length} lỗi cài đặt PWA.`);
  }

  cdpWs.close();
} catch (err) {
  const msg = `Lỗi thực thi CDP: ${err?.message || String(err)}`;
  console.error(`  ✗ ${msg}`);
  errors.push(msg);
} finally {
  chromeProcess.kill("SIGKILL");
  server.close();
  try {
    fs.rmSync(tmpChromeDir, { recursive: true, force: true });
  } catch {
    // Bỏ qua lỗi dọn thư mục tạm nếu đã xoá
  }
}

// ---------------------------------------------------------------------------
// Tổng kết kết quả
// ---------------------------------------------------------------------------
console.log("\n---------------------------------------------------");
if (errors.length === 0 && cdpSuccess) {
  console.log("🎉 KẾT QUẢ: TẤT CẢ CÁC TIÊU CHÍ PWA ĐỀU ĐẠT CHUẨN (0 lỗi)!");
  console.log("---------------------------------------------------\n");
  process.exit(0);
} else {
  console.error(`❌ KẾT QUẢ THẤT BẠI: Có ${errors.length} lỗi:`);
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  console.log("---------------------------------------------------\n");
  process.exit(1);
}
