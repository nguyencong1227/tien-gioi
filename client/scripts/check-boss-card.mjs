import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm THẺ TRÙM trên THANH MÁU TRÙM (`client/src/boss-card.ts`, `boss-bar-ui.ts`, gói tải theo nhu cầu `art:trum`; M7.12 / #513) trong Chrome THẬT,
 * chế độ mock (không cần máy chủ / Vite), qua ĐƯỜNG TẢI THẬT của gói (manifest -> tải tệp -> URL có băm -> giải mã): máy chủ tĩnh của script dựng
 * một gói GIẢ `art:trum` (ảnh thế chỗ `login_bg.webp`, cỡ + băm tính từ tệp thật), còn `BOSS_CARDS` thì đặt qua `window.__bossCardOverride`
 * (chỉ có ở `?debug`) vì chưa có ảnh lô 2.
 *
 *   npm run build -w client && node client/scripts/check-boss-card.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Sáu khung (năm chuẩn + 568x320): gói tải OK => ảnh đại diện HIỆN sau khi tải xong, vuông, nằm TRỌN trong thanh, tên trùm KHÔNG bị đè, thanh vẫn
 * nằm gọn khung nhìn; manifest chỉ tải MỘT lần và tệp tải bằng URL có băm; đổi sang trùm KHÔNG có thẻ thì ảnh ẩn NGAY; về lại trùm có thẻ thì hiện
 * lại; hết trùm thì thanh + ảnh ẩn. Riêng khung 1280x720: không có gói (manifest 404), tệp gói lỗi (404), và gói về MUỘN sau 3 giây (ẩn rồi hiện).
 * `--shots`: lưu ảnh thanh trùm có thẻ mỗi khung.
 */
import http from "node:http";
import { BOSS_CARD_BATCH } from "./art/prompt-rules.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Mỗi trùm của lô 2 và tên tệp thẻ (`prompt-rules.mjs` là nguồn; `boss-card.test.ts` giữ `BOSS_CARDS` khớp). */
const REAL_CARDS = BOSS_CARD_BATCH.items.map((i) => [i.bossId, `${i.id}.webp`]);

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
  // Gói GIẢ `art:trum`: ảnh thế chỗ là `login_bg.webp` của bản dựng. `packMode` đổi theo từng ca (script gán trước khi mở trang).
  const standBase = fs.readFileSync(path.join(DIST, "assets/ai/login_bg.webp"));
  // Mỗi chế độ một tệp có băm KHÁC (thêm vài byte đuôi, ảnh vẫn giải mã được): URL `?v=<băm>` khác nên không dính bộ nhớ đệm của Service
  // Worker từ ca trước (nếu không thì ca "lỗi" / "muộn" lấy ảnh từ bộ nhớ đệm và không thử được gì).
  const payloadOf = (mode) =>
    mode === "ok" ? standBase : Buffer.concat([standBase, Buffer.from(mode)]);
  const shaOf = (b) => crypto.createHash("sha256").update(b).digest("hex");
  const PACK_FILE = "art-trum/the_xich_mang.webp";
  const state = { packMode: "ok", manifestHits: 0, fileUrls: [] };
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    if (
      urlPath === "/packs/manifest.json" &&
      state.packMode !== "none" &&
      state.packMode !== "real"
    ) {
      state.manifestHits++;
      const body = payloadOf(state.packMode);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          packs: [
            {
              id: "art:trum",
              kind: "art",
              files: [{ path: PACK_FILE, bytes: body.length, sha256: shaOf(body) }],
              bytes: body.length,
            },
          ],
        }),
      );
      return;
    }
    if (state.packMode === "real" && urlPath.startsWith("/packs/art-trum/"))
      state.fileUrls.push(req.url); // chế độ "real": manifest và thẻ lấy từ `client/dist/packs` THẬT (đi tiếp xuống phần tệp tĩnh)
    if (urlPath === `/packs/${PACK_FILE}` && state.packMode !== "real") {
      state.fileUrls.push(req.url);
      if (state.packMode === "badfile") {
        res.writeHead(404);
        res.end();
        return;
      }
      const body = payloadOf(state.packMode);
      const send = () => {
        res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "no-store" });
        res.end(body);
      };
      if (state.packMode === "slow") setTimeout(send, 4500);
      else send();
      return;
    }
    // Đường dẫn lạ trả index.html (text/html): manifest 404 thành "không có gói", đúng ca máy chủ tĩnh không có /packs/
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-boss-card-"));
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

    /** Mở trang mock mới với chế độ gói `mode`; trả về khi cảnh sẵn sàng và đã đặt điểm đứng gần NPC. */
    const loadPage = async (vp, mode) => {
      state.packMode = mode;
      state.manifestHits = 0;
      state.fileUrls.length = 0;
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
            `Boolean(!window.__isOldPage && window.__scene && window.__ui && window.__bossCardOverride && window.__craftData && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      if (!ready) return false;
      await sleep(500);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      await evalJs(`(() => {
        const sc = window.__scene;
        sc.room.send = () => {};
        const n = window.__craftData.NPC_BY_ID.tho_ren_suong;
        sc.predX = n.x; sc.predY = n.y + 90; sc.cameras.main.centerOn(sc.predX, sc.predY);
        window.__start = { x: sc.predX, y: sc.predY };
        return 1;
      })()`);
      return true;
    };
    const setBoss = (id, kind) =>
      evalJs(
        `(() => { const sc = window.__scene; sc.state.monsters.set(${JSON.stringify(id)}, { kind: ${JSON.stringify(kind)}, x: window.__start.x + 80, y: window.__start.y, hp: 4000, maxHp: 4000, angle: 0, fx: 0, elite: 0 }); return 1; })()`,
      );
    const clearBosses = () =>
      evalJs(
        `(() => { const m = window.__scene.state.monsters; for (const k of [...m.keys()]) m.delete(k); return 1; })()`,
      );
    const measure = () =>
      evalJs(`(() => {
        const bar = document.getElementById("boss-bar");
        const art = document.getElementById("boss-bar-art");
        const name = document.getElementById("boss-bar-name");
        const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: e.getClientRects().length > 0 }; };
        return {
          vw: window.innerWidth, vh: window.innerHeight,
          barHidden: bar.hidden || getComputedStyle(bar).display === "none",
          bar: R(bar), art: R(art), name: R(name), nameText: name.textContent,
          artHidden: art.hidden, artSrc: art.getAttribute("src"), nw: art.naturalWidth, nh: art.naturalHeight,
          artAlt: art.getAttribute("alt"), artAria: art.getAttribute("aria-hidden"), artPtr: getComputedStyle(art).pointerEvents,
          headAlign: getComputedStyle(art.parentElement).alignItems, artSelf: getComputedStyle(art).alignSelf,
          scrollW: document.documentElement.scrollWidth,
        };
      })()`);
    /** Chờ tới khi `pred(m)` đúng (tối đa `ms`), trả số đo cuối. */
    const until = async (pred, ms = 6000) => {
      let m = await measure();
      for (let t = 0; t < ms && !pred(m); t += 150) {
        await sleep(150);
        m = await measure();
      }
      return m;
    };

    for (const vp of VIEWPORTS) {
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} ===`);

      // ---- A. gói tải OK (đường tải thật) ----
      if (!(await loadPage(vp, "ok"))) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      await evalJs(`window.__bossCardOverride("mang", "the_xich_mang.webp"); 1`);
      await setBoss("m1", "mang");
      let m = await until((x) => !x.barHidden && x.art.shown);
      check(!m.barHidden && m.nameText === "Xích Mãng", "thanh trùm hiện với tên Xích Mãng");
      check(m.art.shown && !m.artHidden, "ảnh đại diện HIỆN sau khi gói tải xong");
      check(
        m.artSrc !== null &&
          /^\/packs\/art-trum\/the_xich_mang\.webp\?v=[0-9a-f]{12}$/.test(m.artSrc),
        `ảnh trỏ URL CÓ BĂM của tệp trong gói (${m.artSrc})`,
      );
      check(m.nw > 0 && m.nh > 0, `ảnh đã giải mã (${m.nw}x${m.nh})`);
      check(
        Math.abs(m.art.w - m.art.h) < 0.5,
        `ảnh vuông (${Math.round(m.art.w)}x${Math.round(m.art.h)})`,
      );
      check(
        m.art.l >= m.bar.l - 0.5 &&
          m.art.r <= m.bar.r + 0.5 &&
          m.art.t >= m.bar.t - 0.5 &&
          m.art.b <= m.bar.b + 0.5,
        "ảnh nằm TRỌN trong thanh trùm",
      );
      check(m.name.l >= m.art.r - 0.5, "tên trùm KHÔNG bị ảnh đè (nằm bên phải ảnh)");
      check(
        m.bar.l >= 0 &&
          m.bar.r <= m.vw + 0.5 &&
          m.bar.t >= 0 &&
          m.bar.b <= m.vh &&
          m.scrollW <= m.vw + 1,
        `thanh trùm nằm gọn khung nhìn (cao ${Math.round(m.bar.h)} px)`,
      );
      check(
        m.artAlt === "" && m.artAria === "true" && m.artPtr === "none",
        "ảnh chỉ trang trí: alt rỗng, aria-hidden, không bắt chuột",
      );
      check(
        m.headAlign === "baseline" && m.artSelf === "center",
        `hàng đầu giữ căn theo đường chữ (${m.headAlign}), chỉ ảnh tự căn giữa (${m.artSelf})`,
      );
      check(state.manifestHits === 1, `manifest tải đúng MỘT lần (${state.manifestHits})`);
      // Tệp gói được lấy qua `fetch` (nạp gói, `packs.ts`) rồi qua `<img>` (giải mã): tối đa HAI yêu cầu mạng, MỌI yêu cầu đều bằng URL CÓ BĂM. NGUYÊN NHÂN số yêu cầu không cố định
      // (A thấy xanh / đỏ / xanh ở khung đầu 1280x720): máy chủ giả đặt `no-store` để đếm được, nhưng Service Worker (`sw.js`, cache-first cho tệp gói có `?v=`) vẫn lưu bản `fetch`.
      // Khung ĐẦU TIÊN của một hồ sơ Chrome mới: trang chưa được Service Worker kiểm soát tới lúc nó kích hoạt + `clients.claim()` (đua với việc tải) nên `fetch` và `<img>` đều ra
      // mạng (2) hoặc `<img>` kịp lấy bản đã lưu (1); các khung SAU dùng lại bản đã lưu (0, cùng băm). Vậy 0 / 1 / 2 đều đúng, chỉ 3 trở lên (tải thừa) là lỗi: KHÔNG ghim đúng một.
      check(
        state.fileUrls.length <= 2 && state.fileUrls.every((u) => /\?v=[0-9a-f]{12}$/.test(u)),
        `tệp gói được tải bằng URL có băm, tối đa hai yêu cầu (${state.fileUrls.length})`,
      );
      if (shotsDir) {
        const s = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(
          path.join(shotsDir, `thanh-trum-co-the-${vp.name}.webp`),
          Buffer.from(s.result.data, "base64"),
        );
      }
      // đổi sang trùm KHÔNG có thẻ (không có mục ghi đè / bảng): ảnh ẩn NGAY, bỏ src
      await clearBosses();
      await setBoss("m2", "hac_giao");
      m = await until((x) => !x.barHidden && x.nameText === "Hắc Giao" && !x.art.shown, 3000);
      check(
        m.nameText === "Hắc Giao" && !m.art.shown && m.artSrc === null,
        "đổi sang trùm không thẻ: ảnh ẩn, bỏ src",
      );
      // về lại trùm có thẻ: hiện lại (gói đã có sẵn, không tải thêm manifest)
      await clearBosses();
      await setBoss("m3", "mang");
      m = await until((x) => !x.barHidden && x.art.shown, 4000);
      check(m.art.shown && m.nameText === "Xích Mãng", "về lại trùm có thẻ: ảnh hiện lại");
      check(state.manifestHits === 1, "vẫn chỉ MỘT lần tải manifest sau khi đổi trùm qua lại");
      // hết trùm: thanh + ảnh ẩn
      await clearBosses();
      m = await until((x) => x.barHidden, 3000);
      check(m.barHidden && !m.art.shown && m.artSrc === null, "hết trùm: thanh và ảnh ẩn, bỏ src");

      if (vp.name !== "1280x720") continue;

      // ---- B. không có gói nào (manifest 404): ảnh ẩn, thanh bình thường ----
      await loadPage(vp, "none");
      await evalJs(`window.__bossCardOverride("mang", "the_xich_mang.webp"); 1`);
      await setBoss("m1", "mang");
      await sleep(1800);
      m = await measure();
      check(
        !m.barHidden && m.nameText === "Xích Mãng",
        "không có gói: thanh trùm vẫn hiện với tên",
      );
      check(!m.art.shown && m.artSrc === null, "không có gói: ảnh ẩn, không ô trống / ảnh vỡ");

      // ---- C. tệp gói lỗi (404): ảnh ẩn ----
      await loadPage(vp, "badfile");
      await evalJs(`window.__bossCardOverride("mang", "the_xich_mang.webp"); 1`);
      await setBoss("m1", "mang");
      await sleep(2000);
      m = await measure();
      check(
        !m.barHidden && !m.art.shown && m.artSrc === null,
        "tệp gói lỗi: thanh vẫn hiện, ảnh ẩn",
      );

      // ---- D. gói về MUỘN (4,5 giây > 3 giây chờ): ẩn trước, hiện khi về ----
      await loadPage(vp, "slow");
      await evalJs(`window.__bossCardOverride("mang", "the_xich_mang.webp"); 1`);
      await setBoss("m1", "mang");
      await sleep(3600); // quá ART_WAIT_MS (3 s), gói còn đang tải
      m = await measure();
      check(!m.barHidden && !m.art.shown, "gói chưa về sau 3 giây: ảnh ẩn, thanh vẫn dùng được");
      m = await until((x) => x.art.shown, 6000);
      check(m.art.shown && m.nw > 0, "gói về muộn: ảnh HIỆN (áp dụng khi về)");

      // ---- E. gói THẬT của bản dựng (`client/dist/packs`, KHÔNG ghi đè `BOSS_CARDS`): mỗi trùm trong `BOSS_CARDS` hiện đúng thẻ của mình ----
      const realManifest = path.join(DIST, "packs/manifest.json");
      if (!fs.existsSync(realManifest)) {
        check(
          false,
          "bản dựng không có packs/manifest.json (chạy `npm run build -w client` sau `npm run build:packs`)",
        );
      } else {
        const real = JSON.parse(fs.readFileSync(realManifest, "utf8")).packs.find(
          (p) => p.id === "art:trum",
        );
        // sạch Service Worker + bộ nhớ đệm của các ca giả trước đó (manifest giả không được dính sang ca gói thật)
        await evalJs(
          `(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); return 1; })()`,
        );
        if (!(await loadPage(vp, "real"))) {
          check(false, "cảnh không sẵn sàng ở ca gói thật");
        }
        for (const [kind, file] of REAL_CARDS) {
          const entry = real?.files.find((f) => f.path === `art-trum/${file}`);
          check(entry !== undefined, `manifest thật có art-trum/${file}`);
          await clearBosses();
          await setBoss(`r_${kind}`, kind);
          m = await until(
            (x) => !x.barHidden && x.art.shown && (x.artSrc ?? "").includes(`/${file}?v=`),
            8000,
          );
          const want = new RegExp(
            `^/packs/art-trum/${file.replace(".", "\\.")}\\?v=${entry?.sha256.slice(0, 12)}$`,
          );
          check(
            m.art.shown && m.artSrc !== null && want.test(m.artSrc),
            `${kind}: ảnh HIỆN, URL có băm ĐÚNG của thẻ thật (${m.artSrc})`,
          );
          check(
            m.nw === 384 && m.nh === 384,
            `${kind}: thẻ thật giải mã đúng 384x384 (${m.nw}x${m.nh})`,
          );
          check(
            m.art.l >= m.bar.l - 0.5 && m.art.r <= m.bar.r + 0.5 && m.name.l >= m.art.r - 0.5,
            `${kind}: ảnh nằm trong thanh, tên không bị đè`,
          );
          if (shotsDir) {
            const png = await send("Page.captureScreenshot", {
              format: "png",
              clip: { x: m.bar.l, y: m.bar.t, width: m.bar.w, height: m.bar.h, scale: 3 },
            });
            fs.mkdirSync(shotsDir, { recursive: true });
            fs.writeFileSync(
              path.join(shotsDir, `thanh-trum-that-${kind}.png`),
              Buffer.from(png.result.data, "base64"),
            );
          }
        }
        check(
          state.fileUrls.length >= 1 && state.fileUrls.every((u) => /\?v=[0-9a-f]{12}$/.test(u)),
          `mọi yêu cầu tệp thẻ thật đều dùng URL có băm (${state.fileUrls.length} yêu cầu tới máy chủ; phần còn lại lấy từ bộ nhớ đệm của trình duyệt)`,
        );
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
