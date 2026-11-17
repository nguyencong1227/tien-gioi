import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm KHUNG bảng "Xã hội" (M9, #1025; `client/src/social-tabs.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite),
 * ở sáu khung nhìn (năm khung chuẩn + điện thoại ngang nhỏ 568x320):
 *
 *   npm run build -w client && node client/scripts/check-social-shell.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Kiểm:
 *   - KHÔNG có `?social=1`: nút HUD ẩn, Shift+G không mở bảng (cờ tắt mặc định);
 *   - có `?social=1`: nút HUD hiện, nằm trọn khung, cao / rộng >= 44 px; Shift+G mở bảng (role=dialog, focus vào trong,
 *     `aria-expanded=true`), bảng nằm trọn khung, không tràn ngang; ba tab, tab Xếp hạng mở sẵn;
 *   - mũi tên Phải / Trái / Home / End đổi tab VÀ đưa focus theo (không nhảy qua tab `tabindex=-1`), vòng hai đầu, chỉ MỘT thân tab hiện;
 *   - bấm chuột / chạm vào tab đổi tab; mỗi tab cao >= 44 px;
 *   - Esc đóng bảng, trả focus về nút HUD, `aria-expanded=false`; Shift+G lần nữa đóng / mở lại được.
 * `--shots`: lưu ảnh bảng đang mở mỗi khung nhìn.
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

export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-social-shell-"));
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

    /** Gõ một phím thật qua CDP (keyDown + keyUp). `shift` = giữ Shift. */
    const press = async (code, key, vk, shift = false) => {
      const base = { code, key, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 };
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await sleep(120);
    };
    const shiftG = () => press("KeyG", "G", 71, true);

    const openPage = async (vp, query) => {
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1${query}`,
      });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__ui && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      await sleep(400);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      return ready;
    };

    /** Ảnh chụp trạng thái bảng + thanh tab. */
    const state = () =>
      evalJs(`(() => {
        const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const modal = document.getElementById("social-modal");
        const btn = document.getElementById("btn-social");
        const tabs = ["rank", "ach", "event"].map((id) => {
          const b = document.getElementById("social-tab-btn-" + id);
          const p = document.getElementById("social-tab-" + id);
          return { id, sel: b.getAttribute("aria-selected"), ti: b.tabIndex, h: rect(b).h, paneHidden: p.hidden };
        });
        const act = document.activeElement;
        return {
          vw: window.innerWidth, vh: window.innerHeight, scrollW: document.documentElement.scrollWidth,
          modalHidden: modal.hidden, modal: rect(modal),
          modalRole: modal.getAttribute("role"), modalLabel: modal.getAttribute("aria-labelledby"),
          btnHidden: btn.hidden, btnVisible: !!(btn.offsetParent || getComputedStyle(btn).position === "fixed") && !btn.hidden,
          btn: rect(btn), sectBtn: rect(document.getElementById("btn-sect")), btnExpanded: btn.getAttribute("aria-expanded"),
          focusId: act ? act.id : "", focusInModal: !!(act && modal.contains(act)),
          tabs, visiblePanes: tabs.filter((t) => !t.paneHidden).map((t) => t.id),
        };
      })()`);

    for (const vp of VIEWPORTS) {
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} ===`);

      // ---- 1. cờ TẮT (mặc định): nút ẩn, Shift+G không mở ----
      if (!(await openPage(vp, ""))) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      let s = await state();
      check(s.btnHidden, "không có ?social=1: nút HUD Xã hội ẩn");
      await shiftG();
      s = await state();
      check(s.modalHidden, "không có ?social=1: Shift+G KHÔNG mở bảng");

      // ---- 2. cờ BẬT ----
      if (!(await openPage(vp, "&social=1"))) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug&social=1)");
        failures++;
        continue;
      }
      s = await state();
      check(!s.btnHidden, "?social=1: nút HUD Xã hội hiện");
      // Điện thoại: nút HUD nằm trong menu ☰ (`#hud-menu-items`) thu gọn sẵn: mở menu rồi mới đo (nút khác như Tông môn cũng vậy)
      const inMenu = s.btn.w === 0 && s.btn.h === 0;
      if (inMenu) {
        await evalJs(`document.getElementById("btn-menu").click(); 1`);
        await sleep(500);
        s = await state();
      }
      check(
        s.btn.l >= -0.5 && s.btn.t >= -0.5 && s.btn.r <= s.vw + 0.5 && s.btn.b <= s.vh + 0.5,
        `nút HUD nằm trọn khung (${Math.round(s.btn.l)},${Math.round(s.btn.t)} - ${Math.round(s.btn.r)},${Math.round(s.btn.b)} / ${s.vw}x${s.vh})`,
      );
      // Cùng lớp `.hud-btn` với nút Tông môn: PHẢI bằng nó (máy tính 38 px, điện thoại 44 px), không to / nhỏ lệch nhịp HUD
      check(
        Math.abs(s.btn.w - s.sectBtn.w) <= 0.5 && Math.abs(s.btn.h - s.sectBtn.h) <= 0.5,
        `nút HUD bằng nút Tông môn (${Math.round(s.btn.w)}x${Math.round(s.btn.h)} so với ${Math.round(s.sectBtn.w)}x${Math.round(s.sectBtn.h)})${inMenu ? ", trong menu ☰" : ""}`,
      );
      if (vp.w <= 844 && vp.mobile && !(vp.w === 768))
        check(
          s.btn.w >= 44 - 0.5 && s.btn.h >= 44 - 0.5,
          `điện thoại: nút HUD >= 44 px (${Math.round(s.btn.w)}x${Math.round(s.btn.h)})`,
        );
      check(s.modalHidden && s.btnExpanded === "false", "ban đầu bảng ẩn, aria-expanded=false");

      await shiftG();
      await sleep(700); // tấm trượt vào (transition): đo khi đã yên vị
      s = await state();
      check(!s.modalHidden, "Shift+G mở bảng");
      check(
        s.modalRole === "dialog" && s.modalLabel === "social-head-title",
        "bảng role=dialog, có aria-labelledby",
      );
      check(s.btnExpanded === "true", "nút HUD aria-expanded=true khi mở");
      check(s.focusInModal, `focus vào trong bảng (đang ở "${s.focusId}")`);
      check(
        s.modal.l >= -0.5 &&
          s.modal.t >= -0.5 &&
          s.modal.r <= s.vw + 0.5 &&
          s.modal.b <= s.vh + 0.5,
        `bảng nằm trọn khung (${Math.round(s.modal.l)},${Math.round(s.modal.t)} - ${Math.round(s.modal.r)},${Math.round(s.modal.b)} / ${s.vw}x${s.vh})`,
      );
      check(s.scrollW <= s.vw + 1, `không tràn ngang (${s.scrollW} / ${s.vw})`);
      check(s.tabs.length === 3, "ba tab");
      check(
        s.tabs[0].sel === "true" && s.tabs[1].sel === "false" && s.tabs[2].sel === "false",
        "tab Xếp hạng mở sẵn",
      );
      check(
        s.tabs[0].ti === 0 && s.tabs[1].ti === -1 && s.tabs[2].ti === -1,
        "tabindex lăn: chỉ tab đang chọn là 0",
      );
      check(
        s.visiblePanes.length === 1 && s.visiblePanes[0] === "rank",
        "chỉ MỘT thân tab hiện (Xếp hạng)",
      );
      check(
        s.tabs.every((t) => t.h >= 44 - 0.5),
        `mỗi tab cao >= 44 px (${s.tabs.map((t) => Math.round(t.h)).join(" / ")})`,
      );
      if (shotsDir) {
        const shot = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(shotsDir, `xa-hoi-${vp.name}.png`),
          Buffer.from(shot.result.data, "base64"),
        );
      }

      // ---- 3. mũi tên trên thanh tab ----
      await evalJs(`document.getElementById("social-tab-btn-rank").focus(); 1`);
      await press("ArrowRight", "ArrowRight", 39);
      s = await state();
      check(
        s.tabs[1].sel === "true" && s.focusId === "social-tab-btn-ach",
        `Phải: sang Thành tựu, focus theo (focus ở "${s.focusId}")`,
      );
      check(
        s.visiblePanes.length === 1 && s.visiblePanes[0] === "ach",
        "Phải: chỉ thân Thành tựu hiện",
      );
      check(!s.modalHidden, "mũi tên không đóng bảng");
      await press("ArrowRight", "ArrowRight", 39);
      s = await state();
      check(
        s.tabs[2].sel === "true" && s.focusId === "social-tab-btn-event",
        "Phải lần 2: sang Sự kiện",
      );
      await press("ArrowRight", "ArrowRight", 39);
      s = await state();
      check(
        s.tabs[0].sel === "true" && s.focusId === "social-tab-btn-rank",
        "Phải ở tab cuối: vòng về Xếp hạng",
      );
      await press("ArrowLeft", "ArrowLeft", 37);
      s = await state();
      check(s.tabs[2].sel === "true", "Trái ở tab đầu: vòng về Sự kiện");
      await press("Home", "Home", 36);
      s = await state();
      check(s.tabs[0].sel === "true" && s.focusId === "social-tab-btn-rank", "Home: về Xếp hạng");
      await press("End", "End", 35);
      s = await state();
      check(s.tabs[2].sel === "true" && s.focusId === "social-tab-btn-event", "End: tới Sự kiện");

      // ---- 4. bấm chuột / chạm ----
      await evalJs(`document.getElementById("social-tab-btn-ach").click(); 1`);
      s = await state();
      check(
        s.tabs[1].sel === "true" && s.visiblePanes.join() === "ach",
        "bấm tab Thành tựu: đổi tab",
      );

      // ---- 5. Esc đóng, trả focus; Shift+G đóng / mở lại ----
      await press("Escape", "Escape", 27);
      s = await state();
      check(s.modalHidden, "Esc đóng bảng");
      check(s.btnExpanded === "false", "Esc: nút HUD aria-expanded=false");
      check(!s.focusInModal, "Esc: focus không kẹt trong bảng đã ẩn");
      // mở từ chính nút HUD bằng bàn phím (focus vào nút, Enter): Esc phải trả focus về ĐÚNG nút đó
      await evalJs(`document.getElementById("btn-social").focus(); 1`);
      await press("Enter", "Enter", 13);
      await sleep(700);
      s = await state();
      check(!s.modalHidden, "Enter trên nút HUD mở bảng");
      await press("Escape", "Escape", 27);
      s = await state();
      check(s.modalHidden, "Esc đóng bảng (mở từ nút)");
      check(
        s.focusId === "btn-social",
        `mở từ nút rồi Esc: focus trả về nút HUD (đang ở "${s.focusId}")`,
      );
      await shiftG();
      s = await state();
      check(!s.modalHidden, "Shift+G mở lại được");
      await shiftG();
      s = await state();
      check(s.modalHidden, "Shift+G lần nữa đóng bảng");
    }
  } finally {
    try {
      process.kill(-chrome.pid);
    } catch {
      // đã thoát
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
