/* global console, setTimeout, fetch */
// Script tự động chụp ảnh màn hình đa viewport (E2E Multi-Viewport Screenshots)
// Phục vụ Milestone M5 (giao diện đa thiết bị & đồ hoạ Phaser)
// Chụp bộ ảnh mốc (baseline) trên nhiều kích thước màn hình và kịch bản giao diện.
//
// Định dạng lưu trữ: WebP (quality: 75) nhằm tối ưu dung lượng git (~1-2 MB thay vì ~18 MB).
// Tự động kiểm tra tính duy nhất (tránh ảnh trùng lặp khi modal chưa mở thật).
//
// Cách dùng:
//   node client/scripts/capture-viewports.mjs
//   npm run capture:viewports
//   npm run chup-viewport
//   node client/scripts/capture-viewports.mjs --out-dir=docs/screenshots/m5-baseline
//   node client/scripts/capture-viewports.mjs --viewports=mobile-p,desktop-hd --scenarios=hud,char
//   node client/scripts/capture-viewports.mjs --maps    (Hắc Phong / Âm Sương x 5 khung, ghi vào docs/screenshots/m6-ban-do)

import process from "node:process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const DIST = path.join(REPO, "client/dist");

/** Tính băm sha256 cho bộ đệm ảnh để kiểm tra toàn vẹn và chống trùng lặp */
export function computeImageHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Tự kiểm tra trùng lặp ảnh trong cùng một viewport.
 * Nếu hai kịch bản khác nhau trong cùng một viewport cho ra cùng một băm ảnh,
 * chứng tỏ bảng giao diện chưa được mở thật và công cụ phải thoát lỗi ngay lập tức.
 */
export function checkDuplicateScreenshots(records) {
  const seenByViewport = new Map();
  for (const r of records) {
    if (!seenByViewport.has(r.viewportId)) {
      seenByViewport.set(r.viewportId, new Map());
    }
    const hashes = seenByViewport.get(r.viewportId);
    if (hashes.has(r.sha256)) {
      const prevScenarioId = hashes.get(r.sha256);
      throw new Error(
        `Phát hiện ảnh trùng lặp trong viewport "${r.viewportId}": kịch bản "${prevScenarioId}" và "${r.scenarioId}" có cùng băm sha256 (${r.sha256.slice(0, 10)}...). Bảng giao diện có thể chưa được mở thật!`,
      );
    }
    hashes.set(r.sha256, r.scenarioId);
  }
}

/** Chờ một phần tử hiển thị và kiểm tra kích thước hợp lệ trên DOM */
export async function assertElementVisible(cdpSend, selector, timeoutMs = 4000) {
  const start = Date.now();
  let lastReason = "Chưa kiểm tra";
  while (Date.now() - start < timeoutMs) {
    const res = await cdpSend("Runtime.evaluate", {
      expression: `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { ok: false, reason: "Phần tử không tồn tại trong DOM" };
          if (el.hidden) return { ok: false, reason: "Thuộc tính hidden = true" };
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return { ok: false, reason: "Kích thước phần tử <= 0 (" + rect.width + "x" + rect.height + ")" };
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return { ok: false, reason: "Phần tử bị ẩn bởi CSS (display=" + style.display + ", visibility=" + style.visibility + ")" };
          }
          return { ok: true };
        })()
      `,
      returnByValue: true,
    });
    const val = res?.result?.result?.value;
    if (val?.ok) return true;
    if (val?.reason) lastReason = val.reason;
    await sleep(100);
  }
  throw new Error(
    `Phần tử "${selector}" không hiển thị hợp lệ sau ${timeoutMs}ms. Lý do: ${lastReason}`,
  );
}

/**
 * Script chạy TRƯỚC mọi mã của trang (Page.addScriptToEvaluateOnNewDocument):
 * - Đánh dấu đã đọc bảng "Chỉ dẫn" của người mới.
 * - Đặt chất lượng tường minh 'high' để headless Chrome không rơi về Thấp do SwiftShader.
 */
export const PRELOAD_SCRIPT = `
  try {
    localStorage.setItem('tg_newbie_guide_dismissed', '1');
    if (!localStorage.getItem('tg_quality')) localStorage.setItem('tg_quality', 'high');
  } catch(e) {}
`;

/**
 * Khẳng định tính toàn vẹn của bố cục giao diện tự động (Layout Assertions):
 * 1. Không tràn khung hình ngang / dọc ngoài ý muốn.
 * 2. Các vùng HUD chính (#hud-col-left, #chat, #minimap-wrap, touch pads) không chồng chéo nhau.
 * 3. Trên thiết bị cảm ứng, mục tiêu tương tác phím ảo phải đủ lớn (>= 40px).
 */
export async function assertLayoutIntegrity(cdpSend, isMobile = false) {
  const res = await cdpSend("Runtime.evaluate", {
    expression: `
      (() => {
        const errors = [];
        const docEl = document.documentElement;

        // 1. Kiểm tra tràn khung nhìn ngang / dọc ngoài ý muốn
        const sw = docEl.scrollWidth;
        const sh = docEl.scrollHeight;
        const iw = window.innerWidth;
        const ih = window.innerHeight;
        if (sw > iw + 2) {
          errors.push("Tràn ngang ngoài ý muốn: scrollWidth=" + sw + " > innerWidth=" + iw);
        }
        if (sh > ih + 2) {
          errors.push("Tràn dọc ngoài ý muốn: scrollHeight=" + sh + " > innerHeight=" + ih);
        }

        // 2. Kiểm tra không chồng chéo giữa các vùng HUD chính nếu cùng hiển thị
        const hudRegions = [
          { id: "hud-col-left", el: document.getElementById("hud-col-left") },
          { id: "chat", el: document.getElementById("chat") },
          { id: "minimap-wrap", el: document.getElementById("minimap-wrap") },
          { id: "touch-action-pad", el: document.getElementById("touch-action-pad") },
          { id: "touch-dpad", el: document.getElementById("touch-dpad") },
        ].filter((r) => r.el && !r.el.hidden && window.getComputedStyle(r.el).display !== "none");

        for (let i = 0; i < hudRegions.length; i++) {
          for (let j = i + 1; j < hudRegions.length; j++) {
            const a = hudRegions[i].el.getBoundingClientRect();
            const b = hudRegions[j].el.getBoundingClientRect();
            if (a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0) {
              const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
              const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
              // Cho phép biên an toàn 4px
              if (xOverlap > 4 && yOverlap > 4) {
                errors.push(
                  "Vùng HUD #" + hudRegions[i].id + " chồng lên #" + hudRegions[j].id +
                    " (Giao nhau: " + Math.round(xOverlap) + "x" + Math.round(yOverlap) + "px)"
                );
              }
            }
          }
        }

        // 3. Trên thiết bị cảm ứng, kiểm tra kích thước mục tương tác trong cụm phím ảo >= 40x40
        if (${isMobile}) {
          const touchBtns = document.querySelectorAll("#touch-action-pad button, #touch-dpad button");
          for (const btn of touchBtns) {
            if (!btn.hidden && window.getComputedStyle(btn).display !== "none") {
              const r = btn.getBoundingClientRect();
              if (r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40)) {
                errors.push(
                  "Nút cảm ứng #" + (btn.id || btn.className) + " quá nhỏ: " +
                    Math.round(r.width) + "x" + Math.round(r.height) + "px (< 40px)"
                );
              }
            }
          }
        }

        return { ok: errors.length === 0, errors };
      })()
    `,
    returnByValue: true,
  });

  const val = res?.result?.result?.value;
  if (!val?.ok && val?.errors?.length > 0) {
    throw new Error(`Lỗi bố cục giao diện:\n  - ${val.errors.join("\n  - ")}`);
  }
}

/**
 * Khẳng định đúng tập bảng (section.modal-box) đang mở: không bảng lạ nào được che ảnh.
 * assertElementVisible chỉ chứng minh bảng đích hiển thị, KHÔNG chứng minh nó không bị bảng
 * khác che; hàm này lấp chỗ đó. allowedIds = id các bảng được phép mở (thường 0 hoặc 1).
 */
export async function assertOnlyModalsOpen(cdpSend, allowedIds = []) {
  const res = await cdpSend("Runtime.evaluate", {
    expression: `
      Array.from(document.querySelectorAll("section.modal-box"))
        .filter((el) => {
          if (el.hidden) return false;
          const st = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return st.display !== "none" && st.visibility !== "hidden" && r.width > 0 && r.height > 0;
        })
        .map((el) => el.id)
    `,
    returnByValue: true,
  });
  const open = res?.result?.result?.value;
  if (!Array.isArray(open)) {
    throw new Error("Không đọc được danh sách bảng đang mở (kết quả CDP không hợp lệ).");
  }
  const stray = open.filter((id) => !allowedIds.includes(id));
  if (stray.length > 0) {
    throw new Error(
      `Có bảng lạ đang mở che ảnh: ${stray.map((id) => "#" + id).join(", ")} (chỉ cho phép: ${
        allowedIds.length ? allowedIds.map((id) => "#" + id).join(", ") : "không bảng nào"
      }).`,
    );
  }
}

// Danh sách các viewport tiêu chuẩn cho đa thiết bị (Milestone M5 Mục 12)
// QUAN TRỌNG: Thiết bị Desktop (chuột) phải chạy TRƯỚC thiết bị Cảm ứng (mobile/tablet),
// vì một khi Chrome headless bật touch emulation thì không thể tắt lại trong cùng phiên.
export const VIEWPORTS = [
  // 1. Máy tính Desktop / Laptop (Chuột/Phím - chạy trước)
  {
    id: "desktop-qhd",
    name: "Máy tính 2K QHD (2560x1440)",
    width: 2560,
    height: 1440,
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
  {
    id: "desktop-hd",
    name: "Máy tính Laptop / HD (1280x720)",
    width: 1280,
    height: 720,
    dpr: 1,
    mobile: false,
  },
  // 2. Máy tính bảng (Cảm ứng)
  {
    id: "tablet-l",
    name: "Máy tính bảng ngang (iPad Landscape)",
    width: 1024,
    height: 768,
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
  // 3. Điện thoại di động (Cảm ứng)
  {
    id: "mobile-l",
    name: "Điện thoại ngang (Gaming landscape)",
    width: 844,
    height: 390,
    dpr: 2,
    mobile: true,
  },
  {
    id: "mobile-p",
    name: "Điện thoại dọc (iPhone / Android chuẩn)",
    width: 390,
    height: 844,
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
];

// Các kịch bản giao diện cần chụp mốc
export const SCENARIOS = [
  {
    id: "01-auth-login",
    name: "Màn hình Đăng nhập",
    mode: "auth",
    targetSelector: "#auth-view-login",
    action: async (send) => {
      for (let i = 0; i < 40; i++) {
        const r = await send("Runtime.evaluate", {
          expression: `Boolean(window.__authUi)`,
          returnByValue: true,
        });
        if (r?.result?.result?.value) break;
        await sleep(100);
      }
      await send("Runtime.evaluate", {
        expression: `
          if (window.__authUi) window.__authUi.switchView("login");
          else if (document.getElementById("link-to-login")) document.getElementById("link-to-login").click();
        `,
      });
      await sleep(300);
    },
  },
  {
    id: "02-auth-register",
    name: "Màn hình Đăng ký",
    mode: "auth",
    targetSelector: "#auth-view-register",
    action: async (send) => {
      for (let i = 0; i < 40; i++) {
        const r = await send("Runtime.evaluate", {
          expression: `Boolean(window.__authUi)`,
          returnByValue: true,
        });
        if (r?.result?.result?.value) break;
        await sleep(100);
      }
      await send("Runtime.evaluate", {
        expression: `
          if (window.__authUi) window.__authUi.switchView("register");
          else if (document.getElementById("link-to-register")) document.getElementById("link-to-register").click();
        `,
      });
      await sleep(300);
    },
  },
  {
    id: "03-game-hud",
    name: "Giao diện chính trong game (HUD & Bản đồ)",
    mode: "game",
    targetSelector: "#hud",
    action: async (send) => {
      // Đảm bảo đóng tất cả modal để chỉ hiển thị HUD gốc
      await send("Runtime.evaluate", {
        expression: `
          if (window.__ui) {
            window.__ui.closeAllModals();
          }
        `,
      });
      await sleep(300);
      // Khẳng định tất cả modal đã đóng
      const r = await send("Runtime.evaluate", {
        expression: `
          (() => {
            const modals = ["char-modal", "inv-modal", "settings-modal", "map-modal"];
            for (const id of modals) {
              const el = document.getElementById(id);
              if (el && !el.hidden) return { open: id };
            }
            return { ok: true };
          })()
        `,
        returnByValue: true,
      });
      if (r?.result?.result?.value?.open) {
        throw new Error(
          `Kịch bản HUD yêu cầu đóng tất cả modal nhưng modal #${r.result.result.value.open} vẫn mở!`,
        );
      }
    },
  },
  {
    id: "04-game-char",
    name: "Bảng Nhân vật (Chỉ số & Cảnh giới)",
    mode: "game",
    targetSelector: "#char-modal",
    action: async (send) => {
      await send("Runtime.evaluate", {
        expression: `
          if (window.__ui) {
            window.__ui.closeAllModals();
            window.__ui.toggleCharModal(true);
          }
        `,
      });
      await sleep(400);
    },
  },
  {
    id: "05-game-inventory",
    name: "Bảng Túi đồ & Đan dược",
    mode: "game",
    targetSelector: "#inv-modal",
    action: async (send) => {
      await send("Runtime.evaluate", {
        expression: `
          if (window.__ui) {
            window.__ui.closeAllModals();
            window.__ui.toggleInventory(true);
          }
        `,
      });
      await sleep(400);
    },
  },
  {
    id: "06-game-settings",
    name: "Bảng Cài đặt & Tuỳ chọn",
    mode: "game",
    targetSelector: "#settings-modal",
    action: async (send) => {
      await send("Runtime.evaluate", {
        expression: `
          if (window.__ui) {
            window.__ui.closeAllModals();
            window.__ui.toggleSettingsModal(true);
          }
        `,
      });
      await sleep(400);
    },
  },
  {
    id: "07-game-crowd",
    name: "Trấn đông người (30 người tụ tập)",
    mode: "crowd",
    targetSelector: "#hud",
    action: async (send) => {
      await send("Runtime.evaluate", {
        expression: `
          if (window.__ui) {
            window.__ui.closeAllModals();
          }
        `,
      });
      await sleep(1000);
    },
  },
];

/**
 * Kịch bản "bản đồ ngoài" (#408 bước 4): cùng một đám đạo hữu đứng giữa trấn, sương + thời tiết + nước BẬT (`?debug` mặc định tắt cả ba),
 * để so Âm Sương Trạch với Hắc Phong Cốc (bản đồ liền kề) ở nhiều khung nhìn. KHÔNG nằm trong `SCENARIOS` (bộ ảnh mốc M5 giữ nguyên):
 * chỉ chạy với cờ `--maps` (mặc định ghi vào `docs/screenshots/m6-ban-do`, chỉ `MAP_VIEWPORT_IDS`).
 */
const mapScenario = (id, name, mapId) => ({
  id,
  name,
  mode: "map",
  query: `map=${mapId}&crowd=12&debug=1&weather=1&fog=1&water=1`,
  targetSelector: "#hud",
  action: async (send) => {
    await send("Runtime.evaluate", { expression: `if (window.__ui) window.__ui.closeAllModals()` });
    // Chờ sương trôi / hạt thời tiết đã phủ khung nhìn (ảnh chụp ngay khi vào cảnh còn trống)
    await sleep(2500);
  },
});
export const MAP_SCENARIOS = [
  mapScenario(
    "08-map-hac-phong",
    "Hắc Phong Cốc (mốc so sánh: sương + thời tiết + nước)",
    "hac_phong",
  ),
  mapScenario("09-map-am-suong", "Âm Sương Trạch (sương + thời tiết + nước)", "am_suong"),
];

/** Năm khung nhìn đại diện cho ảnh bản đồ: máy tính HD, tablet dọc, điện thoại ngang / dọc / nhỏ. */
export const MAP_VIEWPORT_IDS = ["desktop-hd", "tablet-p", "mobile-l", "mobile-p", "mobile-sm"];

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

function parseArgs() {
  const args = process.argv.slice(2);
  let outDir = path.join(REPO, "docs/screenshots/m5-baseline");
  let filterViewports = null;
  let filterScenarios = null;
  let outDirGiven = false;
  const maps = args.includes("--maps");

  for (const arg of args) {
    if (arg.startsWith("--out-dir=")) {
      outDirGiven = true;
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

  if (maps) {
    if (!outDirGiven) outDir = path.join(REPO, "docs/screenshots/m6-ban-do");
    if (!filterViewports) filterViewports = MAP_VIEWPORT_IDS;
  }
  return { outDir, filterViewports, filterScenarios, maps };
}

async function main() {
  const { outDir, filterViewports, filterScenarios, maps } = parseArgs();

  console.log("=== Bắt đầu công cụ E2E chụp ảnh đa viewport (M5 Baseline - WebP) ===");
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

  const HTTP_PORT = await freePort();
  await new Promise((resolve) => server.listen(HTTP_PORT, "127.0.0.1", resolve));
  console.log(`- Web server sẵn sàng tại: http://127.0.0.1:${HTTP_PORT}`);

  // 3. Khởi động Chrome headless
  const CDP_PORT = await freePort();
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

  const scenarioPool = maps ? MAP_SCENARIOS : SCENARIOS;
  let activeScenarios = scenarioPool;
  if (filterScenarios && filterScenarios.length > 0) {
    activeScenarios = scenarioPool.filter(
      (s) => filterScenarios.includes(s.id) || filterScenarios.some((f) => s.id.includes(f)),
    );
  }

  const manifest = {
    capturedAt: new Date().toISOString(),
    format: "webp",
    quality: 75,
    maps,
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
        if (vp.mobile) {
          await cdpSend("Emulation.setTouchEmulationEnabled", {
            enabled: true,
            maxTouchPoints: 5,
          });
        }

        // Xác định URL theo mode
        let targetUrl = `http://127.0.0.1:${HTTP_PORT}/?debug=1`;
        if (sc.mode === "auth") {
          targetUrl = `http://127.0.0.1:${HTTP_PORT}/?auth=mock&debug=1`;
        } else if (sc.mode === "crowd") {
          targetUrl = `http://127.0.0.1:${HTTP_PORT}/?crowd=30&debug=1`;
        } else if (sc.mode === "map") {
          targetUrl = `http://127.0.0.1:${HTTP_PORT}/?${sc.query}`;
        } else {
          targetUrl = `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1`;
        }

        // Đánh dấu đã đọc chỉ dẫn người mới TRƯỚC khi trang chạy (xem PRELOAD_SCRIPT)
        await cdpSend("Page.addScriptToEvaluateOnNewDocument", { source: PRELOAD_SCRIPT });

        // Điều hướng tới URL
        await cdpSend("Page.navigate", { url: targetUrl });

        // Chờ tải xong trang
        if (sc.mode === "auth") {
          // Chờ auth UI và module sẵn sàng
          for (let i = 0; i < 50; i++) {
            await sleep(150);
            const r = await cdpSend("Runtime.evaluate", {
              expression: `Boolean(window.__authUi && document.getElementById("login") && !document.getElementById("login")?.hidden)`,
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

        // Khẳng định phần tử đích đang hiển thị hợp lệ trước khi chụp
        if (sc.targetSelector) {
          await assertElementVisible(cdpSend, sc.targetSelector);
        }

        // Khẳng định không bảng nào khác đang mở che ảnh (chỉ bảng đích, nếu đích là một bảng)
        const targetId = sc.targetSelector?.startsWith("#") ? sc.targetSelector.slice(1) : "";
        await assertOnlyModalsOpen(cdpSend, targetId.endsWith("-modal") ? [targetId] : []);

        // Ẩn huy hiệu "giả lập" của chế độ mock ngay trước khi chụp (UI bật lại nó muộn): nó đè lên tiêu đề bảng, mà bản thật không có
        await cdpSend("Runtime.evaluate", {
          expression: `["dungeon-mock-badge", "duel-mock-badge", "auth-mock-badge"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.hidden = true;
          })`,
        });

        // Đợi render và animation CSS ổn định trước khi chụp
        await sleep(300);

        // Khẳng định tính toàn vẹn bố cục (không tràn, HUD không chồng nhau)
        if (sc.mode !== "auth") {
          await assertLayoutIntegrity(cdpSend, vp.mobile);
        }

        // Chụp ảnh màn hình định dạng WebP quality 75 để tối ưu git
        const shotRes = await cdpSend("Page.captureScreenshot", {
          format: "webp",
          quality: 75,
        });
        const imgBuffer = Buffer.from(shotRes.result.data, "base64");
        const hash = computeImageHash(imgBuffer);
        const fileName = `${vp.id}__${sc.id}.webp`;
        const filePath = path.join(outDir, fileName);

        fs.writeFileSync(filePath, imgBuffer);
        console.log(
          `     ✓ Đã lưu: ${fileName} (${(imgBuffer.length / 1024).toFixed(1)} KB, sha: ${hash.slice(0, 8)})`,
        );

        const record = {
          viewportId: vp.id,
          viewportName: vp.name,
          width: vp.width,
          height: vp.height,
          dpr: vp.dpr,
          scenarioId: sc.id,
          scenarioName: sc.name,
          fileName,
          sizeKb: Number((imgBuffer.length / 1024).toFixed(1)),
          sha256: hash,
        };

        manifest.images.push(record);

        // Tự kiểm tra trùng lặp ảnh ngay lập tức: nếu trùng hash trong cùng viewport -> ném lỗi
        checkDuplicateScreenshots(manifest.images);

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

    // Tự động định dạng các tệp văn bản vừa sinh bằng Prettier (đảm bảo CI format không báo đỏ)
    try {
      execSync(
        `npx prettier --write "${path.join(outDir, "index.html")}" "${path.join(outDir, "manifest.json")}" "${path.join(outDir, "README.md")}"`,
        {
          stdio: "ignore",
        },
      );
    } catch {
      // Bỏ qua lỗi nhỏ nếu prettier không khả dụng
    }

    const totalSizeKb = manifest.images.reduce((sum, img) => sum + img.sizeKb, 0);
    console.log(
      `\n🎉 HOÀN THÀNH CHỤP ẢNH ĐA VIEWPORT (TỔNG CỘNG: ${manifest.images.length} ẢNH, ${(totalSizeKb / 1024).toFixed(2)} MB)`,
    );
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
  <title>Tiên Giới - Bộ Ảnh Mốc Đa Viewport M5 (Baseline WebP)</title>
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
    .card-footer { padding: 8px 16px; font-size: 12px; color: #736754; border-top: 1px solid #231e17; display: flex; justify-content: space-between; }
    .sha { font-family: monospace; color: #9c8b74; }
  </style>
</head>
<body>
  <h1>Tiên Giới - Bộ Ảnh Mốc Đa Viewport M5 (Baseline WebP)</h1>
  <p class="sub">Thời gian chụp: ${manifest.capturedAt} | Định dạng: WebP (quality 75) | Tổng cộng: ${manifest.images.length} ảnh</p>

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
        <div class="card-footer">
          <span>${img.fileName} (${img.sizeKb} KB)</span>
          <span class="sha">sha: ${img.sha256 ? img.sha256.slice(0, 8) : "n/a"}</span>
        </div>
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
  const totalSizeKb = manifest.images.reduce((sum, img) => sum + img.sizeKb, 0);
  const mapNote = manifest.maps
    ? "\n> **Bộ ảnh bản đồ ngoài** (`--maps`, #408 bước 4): Hắc Phong Cốc (mốc so sánh) và Âm Sương Trạch (bản đồ mới) ở năm khung nhìn; sương + thời tiết + nước BẬT, 12 đạo hữu đứng giữa trấn. Bộ ảnh mốc M5 nằm ở `docs/screenshots/m5-baseline` và không bị đụng tới.\n"
    : "";
  return `# Bộ Ảnh Mốc Đa Viewport M5 (Baseline Multi-Viewport Screenshots)
${mapNote}
> Thư mục chứa bộ ảnh chụp màn hình làm mốc đối chiếu trước khi thực hiện các cải tiến giao diện đa thiết bị & đồ hoạ Phaser trong Milestone M5.
> Được sinh tự động bởi \`client/scripts/capture-viewports.mjs\` (\`npm run capture:viewports\` hoặc \`npm run chup-viewport\`).
> Định dạng: **WebP (quality 75)**, tự động kiểm tra chống trùng lặp băm sha256 giữa các kịch bản.
> **Chế độ kiểm thử**: Sử dụng các chế độ giả lập client có sẵn (\`?dungeon=mock&debug=1\`, \`?crowd=30\`, \`?auth=mock\`) không phụ thuộc server mạng thật.
> Thời điểm chụp mốc: \`${manifest.capturedAt}\`.
> Tổng dung lượng: **${(totalSizeKb / 1024).toFixed(2)} MB** (${manifest.images.length} tệp WebP).

## 1. Danh sách Viewport đo đạc

| Mã | Thiết bị mô phỏng | Kích thước (px) | Mật độ điểm ảnh (DPR) | Loại thiết bị |
|---|---|---|---|---|
${manifest.viewports.map((v) => `| \`${v.id}\` | ${v.name} | ${v.width} × ${v.height} | ${v.dpr} | ${v.mobile ? "Di động (Cảm ứng)" : "Máy tính (Chuột/Phím)"} |`).join("\n")}

## 2. Danh sách Kịch bản giao diện

| Mã kịch bản | Tên kịch bản | Phần tử hiển thị yêu cầu | Mô tả kiểm tra |
|---|---|---|---|
${manifest.scenarios.map((s) => `| \`${s.id}\` | ${s.name} | \`${[...SCENARIOS, ...MAP_SCENARIOS].find((sc) => sc.id === s.id)?.targetSelector || ""}\` | Ảnh mốc hiển thị |`).join("\n")}

## 3. Tổng hợp ảnh chụp mốc (${manifest.images.length} ảnh WebP)

- Xem trực quan dưới dạng gallery HTML tương tác tại: \`index.html\` (mở trong trình duyệt).
- Tệp siêu dữ liệu: \`manifest.json\`.
- Tất cả các ảnh trong cùng một viewport đều có băm sha256 duy nhất, đảm bảo các bảng modal (Nhân vật, Túi đồ, Cài đặt) được mở thật.

## 4. Cách chạy lại lệnh chụp
\`\`\`bash
npm run capture:viewports
# hoặc:
npm run chup-viewport
\`\`\`
`;
}

if (process.argv[1]?.endsWith("capture-viewports.mjs")) {
  main().catch((err) => {
    console.error("Lỗi khi chạy capture-viewports:", err);
    process.exit(1);
  });
}
