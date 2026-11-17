import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm THẺ MINH HOẠ BẢN ĐỒ ở màn chuyển cảnh qua cổng (`client/src/map-card.ts`, M7.12 / #513) trong Chrome THẬT, chế độ mock
 * (không cần máy chủ / Vite), ở sáu khung nhìn (năm khung chuẩn + điện thoại ngang nhỏ 568x320):
 *
 *   npm run build -w client && node client/scripts/check-map-card.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Kiểm:
 *   - bản đồ chưa có thẻ: thẻ ẨN, tên + dòng phụ hiện đúng như cũ, không tràn;
 *   - NĂM THẺ THẬT của lô 1 (đáp án viết lại trong script): hiện SAU KHI tải xong, ảnh thật 624x416, đúng 3:2, nằm giữa, nằm trọn
 *     khung nhìn CÙNG với tên + dòng phụ (không đè, không tràn dọc / ngang), rộng không quá 420 px / 86 % khung, trang trí
 *     (`alt=""`, `aria-hidden`, không bắt chuột);
 *   - ảnh lỗi (đường dẫn không có, dùng `window.__mapCardOverride` chỉ có ở `?debug`): thẻ vẫn ẩn, không ô ảnh vỡ;
 *   - đổi sang bản đồ KHÔNG có thẻ ngay sau bản đồ có thẻ: thẻ ẩn NGAY, `src` bị bỏ (không nháy ảnh cũ);
 *   - mapId lạ ("constructor"): không thẻ, không lỗi; `hideTransition`: lớp phủ ẩn hẳn.
 * `--shots`: lưu ảnh màn chuyển cảnh: thẻ Hắc Phong ở mọi khung, cả năm thẻ ở 1280x720.
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

/** Năm khung nhìn như `check-forge-shop.mjs` + một khung điện thoại ngang nhỏ. */
export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
  // Điện thoại ngang NHỎ (iPhone SE ngang): khung duy nhất mà trần theo chiều cao (`40vh`) của thẻ có tác dụng
  { name: "568x320", w: 568, h: 320, dpr: 2, mobile: true },
];

/** Năm thẻ thật của lô 1: [mapId, tên tệp, tên hiện]. Viết LẠI ở đây (độc lập với `MAP_CARDS`) để dòng `MAP_CARDS` sai thì script đỏ. */
const REAL_CARDS = [
  ["lac_ha", "the_lac_ha.webp", "Lạc Hà Trấn"],
  ["hac_phong", "the_hac_phong.webp", "Hắc Phong Cốc"],
  ["bi_canh_linh_hu", "the_linh_hu.webp", "Linh Hư Bí Cảnh"],
  ["am_suong", "the_am_suong.webp", "Âm Sương Trạch"],
  ["han_van", "the_han_van.webp", "Hàn Vân Lĩnh"],
];

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
            cardAria: card.getAttribute("aria-hidden"), naturalW: card.naturalWidth, naturalH: card.naturalHeight, cardPtr: getComputedStyle(card).pointerEvents,
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

      /** Kiểm hình học của thẻ đang hiện (dùng cho cả năm thẻ thật). */
      const cardChecks = (m, label) => {
        check(!m.cardHidden && m.card.shown, `${label}: thẻ hiện`);
        check(
          m.naturalW === 624 && m.naturalH === 416,
          `${label}: ảnh thật 624x416 (${m.naturalW}x${m.naturalH})`,
        );
        check(
          Math.abs(m.card.w / m.card.h - 1.5) < 0.02,
          `${label}: thẻ đúng 3:2 (${Math.round(m.card.w)}x${Math.round(m.card.h)})`,
        );
        check(
          m.card.w <= 420.5 && m.card.w <= m.vw * 0.86 + 0.5,
          `${label}: thẻ rộng <= 420 px và <= 86 % khung (${Math.round(m.card.w)} / ${m.vw})`,
        );
        check(
          Math.abs((m.card.l + m.card.r) / 2 - m.vw / 2) <= 2,
          `${label}: thẻ nằm giữa theo chiều ngang`,
        );
        check(
          m.card.t >= 0 && m.sub.b <= m.vh && m.card.l >= 0 && m.card.r <= m.vw,
          `${label}: thẻ + tên + dòng phụ nằm TRỌN khung (đỉnh ${Math.round(m.card.t)}, đáy ${Math.round(m.sub.b)} / ${m.vh})`,
        );
        check(m.card.b <= m.name.t + 1, `${label}: thẻ nằm TRÊN tên, không đè`);
        check(m.scrollW <= m.vw + 1, `${label}: không tràn ngang`);
        check(
          m.cardAlt === "" && m.cardAria === "true" && m.cardPtr === "none",
          `${label}: thẻ chỉ trang trí (alt rỗng, aria-hidden, không bắt chuột)`,
        );
      };
      const snap = async (name) => {
        if (!shotsDir) return;
        const s = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(path.join(shotsDir, `${name}.webp`), Buffer.from(s.result.data, "base64"));
      };

      // ---- 1. bản đồ CHƯA có thẻ: thẻ ẩn, chữ như cũ ----
      await show("Bản đồ chưa có thẻ", "khong_co_the");
      let m = await measure();
      check(!m.overlayHidden && m.contentOpacity === "1", "màn chuyển cảnh hiện, nội dung rõ");
      check(m.cardHidden && !m.card.shown && m.cardSrc === null, "chưa có thẻ: thẻ ẩn, không src");
      check(m.nameText === "Bản đồ chưa có thẻ" && m.name.shown, "tên bản đồ vẫn hiện");
      check(
        m.name.l >= 0 && m.name.r <= m.vw + 0.5 && m.scrollW <= m.vw + 1,
        `tên không tràn ngang (rộng ${Math.round(m.name.w)} / ${m.vw})`,
      );
      await hide();
      m = await measure();
      check(m.overlayHidden, "hideTransition: lớp phủ ẩn hẳn");

      // ---- 2. NĂM THẺ THẬT (đáp án viết LẠI ở đây, không đọc từ MAP_CARDS): hiện sau khi tải, đúng 624x416, 3:2, giữa, trọn khung ----
      for (const [mapId, file, name] of REAL_CARDS) {
        await show(name, mapId);
        m = await measure();
        check(m.cardSrc === `/assets/ai/${file}`, `${mapId}: thẻ trỏ đúng ${file}`);
        cardChecks(m, mapId);
        if (mapId === "hac_phong") await snap(`man-qua-cong-hac_phong-${vp.name}`);
        if (vp.name === "1280x720") await snap(`man-qua-cong-${mapId}-${vp.name}`);
        await hide();
      }

      // ---- 3. đổi sang bản đồ KHÔNG có thẻ ngay sau bản đồ có thẻ: thẻ ẩn NGAY, bỏ src (không nháy ảnh cũ) ----
      await show("Hắc Phong Cốc", "hac_phong");
      await evalJs(`window.__ui.showTransition("Bản đồ chưa có thẻ", "khong_co_the"); 1`);
      m = await measure(); // đo NGAY, không chờ
      check(
        m.cardHidden && !m.card.shown && m.cardSrc === null,
        "đổi sang bản đồ không thẻ: thẻ ẩn ngay, bỏ src",
      );
      check(m.nameText === "Bản đồ chưa có thẻ", "tên đổi theo bản đồ mới");
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

      // ---- 6. THẺ Ở ĐẦU BẢNG SƠN HÀ ĐỒ (`M`): theo bản đồ ĐANG XEM; điện thoại ngang thấp (<= 480 px cao) bỏ hẳn ----
      const SHORT = vp.h <= 480;
      const measurePanel = () =>
        evalJs(`(() => {
          const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: e.getClientRects().length > 0 }; };
          const card = document.getElementById("map-card");
          return {
            vw: window.innerWidth, vh: window.innerHeight,
            open: !document.getElementById("map-modal").hidden,
            card: R(card), head: R(document.querySelector("#map-modal .inv-head")), title: R(document.getElementById("map-title")),
            close: R(document.getElementById("map-close")), panel: R(document.getElementById("map-modal")),
            cardHidden: card.hidden, cardSrc: card.getAttribute("src"), naturalW: card.naturalWidth,
            alt: card.getAttribute("alt"), aria: card.getAttribute("aria-hidden"), ptr: getComputedStyle(card).pointerEvents,
            titleText: document.getElementById("map-title").textContent, scrollW: document.documentElement.scrollWidth,
            closePos: getComputedStyle(document.getElementById("map-close")).position,
          };
        })()`);
      /** Chờ tới khi `pred(x)` đúng (tối đa 3 s), trả số đo cuối. */
      const panelUntil = async (pred) => {
        let x = await measurePanel();
        for (let t = 0; t < 3000 && !pred(x); t += 150) {
          await sleep(150);
          x = await measurePanel();
        }
        return x;
      };
      const sceneOk = await evalJs(
        `Boolean(window.__scene && typeof window.__scene.setMapView === "function")`,
      );
      check(sceneOk, "bảng bản đồ: cảnh sẵn sàng (cần ?debug)");
      if (sceneOk) {
        await evalJs("window.__ui.toggleMapModal(true); 1");
        let p = await panelUntil((x) => x.open && x.cardSrc !== null);
        check(p.open, "bảng Sơn Hà Đồ mở");
        check(
          p.cardSrc === "/assets/ai/the_am_suong.webp",
          `thẻ của bản đồ mình đứng (am_suong): ${p.cardSrc}`,
        );
        if (SHORT) {
          check(!p.card.shown, `màn thấp (${vp.h} px): thẻ bỏ hẳn, đầu bảng như cũ`);
        } else {
          p = await panelUntil((x) => x.card.shown);
          check(p.card.shown && !p.cardHidden, "bảng bản đồ: thẻ HIỆN sau khi ảnh tải xong");
          check(p.naturalW === 624, `ảnh thật 624 px rộng (${p.naturalW})`);
          check(
            Math.abs(p.card.w / p.card.h - 1.5) < 0.02,
            `thẻ đúng 3:2 (${Math.round(p.card.w)}x${Math.round(p.card.h)})`,
          );
          check(
            p.card.l >= p.head.l - 0.5 && p.card.r <= p.title.l + 0.5,
            "thẻ nằm TRONG đầu bảng, bên TRÁI tiêu đề, không đè",
          );
          // Điện thoại: nút Đóng NỔI cố định ở góc dưới (sheet.css), không nằm trong hàng đầu bảng: chỉ cần thẻ không chạm nó
          const rowClose = p.closePos !== "fixed";
          const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
          check(
            !hit(p.card, p.close) && (!rowClose || p.title.r <= p.close.l + 0.5),
            `thẻ + tiêu đề không đè nút đóng (${rowClose ? "nút trong hàng" : "nút nổi"}: thẻ ${Math.round(p.card.r)}, tiêu đề ${Math.round(p.title.r)}, nút ${Math.round(p.close.l)})`,
          );
          check(
            p.card.t >= p.head.t - 0.5 && p.card.b <= p.head.b + 0.5,
            `thẻ nằm trong đầu bảng (thẻ ${Math.round(p.card.t)}-${Math.round(p.card.b)}, đầu bảng ${Math.round(p.head.t)}-${Math.round(p.head.b)})`,
          );
          check(p.scrollW <= p.vw + 1, "bảng bản đồ không làm trang tràn ngang");
          check(
            p.alt === "" && p.aria === "true" && p.ptr === "none",
            "thẻ chỉ trang trí (alt rỗng, aria-hidden, không bắt chuột)",
          );
          if (vp.name === "1280x720" || vp.name === "390x844")
            await snap(`bang-son-ha-do-${vp.name}`);
        }
        // đang xem bản đồ KHÁC: thẻ đổi theo bản đồ xem, về chỗ mình thì quay lại thẻ của mình
        await evalJs(`window.__scene.setMapView("hac_phong"); 1`);
        p = await panelUntil((x) => x.cardSrc === "/assets/ai/the_hac_phong.webp");
        check(
          p.cardSrc === "/assets/ai/the_hac_phong.webp" && p.titleText.includes("Hắc Phong"),
          `xem bản đồ khác: thẻ theo bản đồ xem (${p.cardSrc})`,
        );
        await evalJs(`window.__scene.setMapView(null); 1`);
        p = await panelUntil((x) => x.cardSrc === "/assets/ai/the_am_suong.webp");
        check(p.cardSrc === "/assets/ai/the_am_suong.webp", "Về chỗ mình: về thẻ của mình");
        // bản đồ chưa có thẻ: ẩn NGAY, bỏ src, đầu bảng như cũ
        await evalJs(`window.__ui.setMapPanelCard("khong_co_the"); 1`);
        p = await measurePanel();
        check(
          p.cardHidden && !p.card.shown && p.cardSrc === null,
          "bản đồ chưa có thẻ: thẻ ẩn ngay, bỏ src",
        );
        check(
          p.title.shown && (p.closePos === "fixed" || p.title.r <= p.close.l + 0.5),
          `bản đồ chưa có thẻ: tiêu đề vẫn hiện, không chỗ trống (tiêu đề ${Math.round(p.title.l)}-${Math.round(p.title.r)}, nút đóng ${Math.round(p.close.l)}, ${p.closePos})`,
        );
        await evalJs("window.__ui.toggleMapModal(false); 1");
      }
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
