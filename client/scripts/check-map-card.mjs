import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm THẺ MINH HOẠ BẢN ĐỒ ở màn chuyển cảnh qua cổng (`client/src/map-card.ts`, M7.12 / #513) trong Chrome THẬT, chế độ mock
 * (không cần máy chủ / Vite), ở năm khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-map-card.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * `MAP_CARDS` còn rỗng (chưa có ảnh lô 1) nên script dùng `window.__mapCardOverride` (chỉ có ở `?debug`) để đặt ảnh THẾ CHỖ
 * (`login_bg.webp`, vuông: thử luôn việc cắt `object-fit: cover` về 3:2). Kiểm:
 *   - chưa có ảnh: thẻ ẨN, tên + dòng phụ hiện đúng như cũ, không tràn;
 *   - có ảnh: thẻ hiện SAU KHI tải xong, đúng 3:2, nằm giữa, nằm trọn khung nhìn CÙNG với tên + dòng phụ (không đè, không tràn
 *     dọc / ngang), rộng không quá 420 px / 86 % khung, trang trí (`alt=""`, `aria-hidden`, không bắt chuột);
 *   - ảnh lỗi (đường dẫn không có): thẻ vẫn ẩn, không ô ảnh vỡ;
 *   - đổi sang bản đồ KHÔNG có ảnh ngay sau bản đồ có ảnh: thẻ ẩn NGAY, `src` bị bỏ (không nháy ảnh cũ);
 *   - `hideTransition`: lớp phủ ẩn hẳn.
 * `--shots`: lưu ảnh màn chuyển cảnh có thẻ mỗi khung nhìn.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");

/** Năm khung nhìn như `check-forge-shop.mjs`. */
export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
];

/** Ảnh thế chỗ có thật trong `dist` (vuông 1024x1024). */
const STAND_IN = "/assets/ai/login_bg.webp";

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  const onlyVp = process.argv.includes("--vp")
    ? process.argv[process.argv.indexOf("--vp") + 1]
    : null;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
  if (!fs.existsSync(path.join(DIST, "index.html")))
    throw new Error("Chưa có client/dist: chạy `npm run build -w client` trước.");

  const MIMES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  // Đường dẫn lạ trả index.html (text/html): làm ảnh "lỗi" thật, đúng ca ảnh không tải được
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath)) filePath = path.join(DIST, "index.html");
    try {
      res.writeHead(200, {
        "Content-Type": MIMES[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(fs.readFileSync(filePath));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const HTTP_PORT = await freePort();
  await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));
  const CDP_PORT = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-map-card-"));
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      ...getChromeGpuFlags(),
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmp}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  let failures = 0;
  const check = (ok, msg) => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
    if (!ok) failures++;
  };
  try {
    let page = null;
    for (let i = 0; i < 100 && !page; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        page = (await res.json()).find((t) => t.type === "page") ?? null;
      } catch {
        // Chrome chưa mở cổng
      }
      if (!page) await sleep(150);
    }
    if (!page) throw new Error("Không tìm thấy Chrome page target.");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    let nextId = 1;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result?.result?.value;
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem('tg_newbie_guide_dismissed','1'); localStorage.setItem('tg_quality','low'); } catch (e) {}`,
    });

    for (const vp of VIEWPORTS) {
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} ===`);
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&map=am_suong`,
      });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__ui && window.__mapCardOverride && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      if (!ready) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      await sleep(400);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );

      /** Đo màn chuyển cảnh đang hiện. */
      const measure = () =>
        evalJs(`(() => {
          const rect = (id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: e.getClientRects().length > 0 }; };
          const card = document.getElementById("transition-card");
          return {
            vw: window.innerWidth, vh: window.innerHeight,
            card: rect("transition-card"), name: rect("transition-map-name"),
            sub: rect("transition-overlay").shown ? (() => { const e = document.querySelector(".transition-sub"); const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width }; })() : null,
            cardHidden: card.hidden, cardSrc: card.getAttribute("src"), cardAlt: card.getAttribute("alt"),
            cardAria: card.getAttribute("aria-hidden"), cardPtr: getComputedStyle(card).pointerEvents,
            nameText: document.getElementById("transition-map-name").textContent,
            overlayHidden: document.getElementById("transition-overlay").hidden,
            contentOpacity: getComputedStyle(document.querySelector(".transition-content")).opacity,
            scrollW: document.documentElement.scrollWidth,
          };
        })()`);
      const show = async (name, mapId) => {
        await evalJs(
          `window.__ui.showTransition(${JSON.stringify(name)}, ${JSON.stringify(mapId)}); 1`,
        );
        await sleep(900); // mống mắt 400 ms + tên hiện dần + ảnh tải
      };
      const hide = async () => {
        await evalJs("window.__ui.hideTransition(); 1");
        await sleep(600);
      };

      // ---- 1. chưa có ảnh (đúng như bản chạy thật hôm nay): thẻ ẩn, chữ như cũ ----
      await show("Hắc Phong Cốc", "hac_phong");
      let m = await measure();
      check(!m.overlayHidden && m.contentOpacity === "1", "màn chuyển cảnh hiện, nội dung rõ");
      check(m.cardHidden && !m.card.shown && m.cardSrc === null, "chưa có ảnh: thẻ ẩn, không src");
      check(m.nameText === "Hắc Phong Cốc" && m.name.shown, "tên bản đồ vẫn hiện");
      check(
        m.name.l >= 0 && m.name.r <= m.vw + 0.5 && m.scrollW <= m.vw + 1,
        `tên không tràn ngang (rộng ${Math.round(m.name.w)} / ${m.vw})`,
      );
      await hide();
      m = await measure();
      check(m.overlayHidden, "hideTransition: lớp phủ ẩn hẳn");

      // ---- 2. có ảnh (thế chỗ): thẻ hiện SAU KHI tải, đúng 3:2, giữa, trọn khung cùng tên + dòng phụ ----
      await evalJs(`window.__mapCardOverride("hac_phong", ${JSON.stringify(STAND_IN)}); 1`);
      await show("Hắc Phong Cốc", "hac_phong");
      m = await measure();
      check(!m.cardHidden && m.card.shown, "có ảnh: thẻ hiện");
      check(m.cardSrc === STAND_IN, "thẻ trỏ đúng ảnh của bản đồ đích");
      check(
        Math.abs(m.card.w / m.card.h - 1.5) < 0.02,
        `thẻ đúng 3:2 (${Math.round(m.card.w)}x${Math.round(m.card.h)})`,
      );
      check(
        m.card.w <= 420.5 && m.card.w <= m.vw * 0.86 + 0.5,
        `thẻ rộng <= 420 px và <= 86 % khung (${Math.round(m.card.w)} / ${m.vw})`,
      );
      check(Math.abs((m.card.l + m.card.r) / 2 - m.vw / 2) <= 2, "thẻ nằm giữa theo chiều ngang");
      check(
        m.card.t >= 0 && m.sub.b <= m.vh && m.card.l >= 0 && m.card.r <= m.vw,
        `thẻ + tên + dòng phụ nằm TRỌN khung (đỉnh ${Math.round(m.card.t)}, đáy ${Math.round(m.sub.b)} / ${m.vh})`,
      );
      check(m.card.b <= m.name.t + 1, "thẻ nằm TRÊN tên, không đè");
      check(m.scrollW <= m.vw + 1, "không tràn ngang");
      check(
        m.cardAlt === "" && m.cardAria === "true" && m.cardPtr === "none",
        "thẻ chỉ trang trí: alt rỗng, aria-hidden, không bắt chuột",
      );
      if (shotsDir) {
        const s = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(
          path.join(shotsDir, `the-ban-do-man-qua-cong-${vp.name}.webp`),
          Buffer.from(s.result.data, "base64"),
        );
      }

      // ---- 3. đổi sang bản đồ KHÔNG có ảnh ngay sau đó: thẻ ẩn NGAY, bỏ src (không nháy ảnh cũ) ----
      await evalJs(`window.__ui.showTransition("Âm Sương Trạch", "am_suong"); 1`);
      m = await measure(); // đo NGAY, không chờ
      check(
        m.cardHidden && !m.card.shown && m.cardSrc === null,
        "đổi sang bản đồ không ảnh: thẻ ẩn ngay, bỏ src",
      );
      check(m.nameText === "Âm Sương Trạch", "tên đổi theo bản đồ mới");
      await hide();

      // ---- 4. ảnh LỖI (đường dẫn không có -> máy chủ trả HTML): thẻ vẫn ẩn, không ô ảnh vỡ ----
      await evalJs(`window.__mapCardOverride("hac_phong", "/assets/ai/khong-co-anh.webp"); 1`);
      await show("Hắc Phong Cốc", "hac_phong");
      m = await measure();
      check(m.cardHidden && !m.card.shown, "ảnh lỗi: thẻ vẫn ẩn (không ô ảnh vỡ)");
      check(m.name.shown && m.nameText === "Hắc Phong Cốc", "ảnh lỗi: tên vẫn hiện");
      await evalJs(`window.__mapCardOverride("hac_phong", null); 1`);
      await hide();

      // ---- 5. mapId lạ của máy chủ ("constructor"): không ảnh, không lỗi ----
      await show("Lạ", "constructor");
      m = await measure();
      check(m.cardHidden && !m.card.shown, 'mapId "constructor": không có thẻ, không lỗi');
      await hide();
    }
  } finally {
    try {
      process.kill(-chrome.pid, "SIGKILL");
    } catch {
      chrome.kill("SIGKILL");
    }
    server.close();
    await new Promise((r) => {
      chrome.once("exit", r);
      setTimeout(r, 1500);
    });
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // bỏ qua
    }
  }
  console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1] === __filename) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
