import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm KHUNG bảng "Xã hội" (M9, #1025; `client/src/social-tabs.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite),
 * ở sáu khung nhìn (năm khung chuẩn + điện thoại ngang nhỏ 568x320):
 *
 *   npm run build -w client && node client/scripts/check-social-shell.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Kiểm:
 *   - MẶC ĐỊNH BẬT (không cờ): nút HUD hiện, banner trùm hiện khi có tin; `?social=0` (công tắc khẩn): nút HUD ẩn, Shift+G không mở bảng, không banner / chấm mới;
 *   - có `?social=1`: nút HUD hiện, nằm trọn khung, cao / rộng >= 44 px; Shift+G mở bảng (role=dialog, focus vào trong,
 *     `aria-expanded=true`), bảng nằm trọn khung, không tràn ngang; ba tab, tab Xếp hạng mở sẵn;
 *   - mũi tên Phải / Trái / Home / End đổi tab VÀ đưa focus theo (không nhảy qua tab `tabindex=-1`), vòng hai đầu, chỉ MỘT thân tab hiện;
 *   - bấm chuột / chạm vào tab đổi tab; mỗi tab cao >= 44 px;
 *   - Esc đóng bảng, trả focus về nút HUD, `aria-expanded=false`; Shift+G lần nữa đóng / mở lại được.
 *   - tab Xếp hạng (M9.6): trạng thái đang tải + nút Tải lại (>= 44 px), bốn bảng bằng tin MẪU `window.__sample.boards` (20 dòng, đủ cột, dòng của mình, thử nghiệm,
 *     không ô trống / NaN, không cắt chữ, không tràn), mình ngoài top / không hạng (3 lý do) / bảng rỗng, đạo hiệu có thẻ HTML không thành phần tử, tin sai kiểu bị bỏ,
 *     tab phụ >= 44 px + mũi tên / Home / End đổi bảng và đưa focus theo.
 *   - trùm thế giới (M9.7): tab Sự kiện (đang tải + nút Tải lại, đồng hồ GIẢM theo thời gian, chưa có sự kiện, sự kiện cách 3 giờ chỉ ở tab, đang diễn ra),
 *     banner (trọn khung, không tràn, KHÔNG chặn chạm, thanh trùm nằm dưới và theo --wb-h, nút >= 44 px, danh sách đóng góp mở / thu gọn theo khung),
 *     chưa đủ ngưỡng, bốn kết quả (+ toast cùng tông, không toast lần hai, tự ẩn sau ~10 s), tin sai kiểu bị bỏ, cờ tắt thì không hiện.
 *   - thành tựu + danh hiệu (M9.8): tab Thành tựu (đang tải + Tải lại, nhóm <details> / danh hiệu radiogroup >= 44 px, thanh tiến độ có chữ, thưởng bằng chữ),
 *     đeo / gỡ danh hiệu CHỈ đổi khi máy chủ trả lại `achievements` (khóa / đang chờ không gửi, từ chối về đúng trạng thái máy chủ, im 5 s thì thôi chờ),
 *     thành tựu mới (chấm trên nút HUD khi ở tab khác, dấu 'Mới' + toast mời đeo, mất khi rời tab), tin sai kiểu / id lạ bị bỏ, danh hiệu trên đầu nhân vật (lạ thì không lộ id).
 *   - bấm vào bảng KHÔNG chém: chuột trái giữa bảng / ở thân cả ba tab / ở vùng thế giới lúc bảng đang mở / ở nút banner trùm không gửi `attack`; đối chứng: đóng bảng thì bấm
 *     vào thế giới vẫn chém (cờ chặn không kẹt).
 * `--shots`: lưu ảnh bảng đang mở mỗi khung nhìn (và bảng Tu vi / Tông môn đầy dòng).
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
  // cửa sổ trình duyệt hẹp: hàng menu 8 nút (nút Xã hội) quanh mốc chuyển sang ☰ (670 px khi cờ bật)
  { name: "664x900", w: 664, h: 900, dpr: 1, mobile: false },
  { name: "700x900", w: 700, h: 900, dpr: 1, mobile: false },
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

      // ---- 0. MẶC ĐỊNH BẬT (M9 phát hành): không cờ nào thì nút HUD hiện, Shift+G mở bảng ----
      if (!(await openPage(vp, ""))) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      let s = await state();
      check(!s.btnHidden, "mặc định (không cờ): nút HUD Xã hội HIỆN");
      await evalJs(`window.__ui.setWorldBoss(window.__sample.worldBoss("live")); 1`);
      check(
        !(await evalJs(`document.getElementById("wb-banner").hidden`)),
        "mặc định: tin trùm thế giới làm hiện banner",
      );
      await evalJs(`window.__ui.setWorldBoss(window.__sample.worldBoss("none")); 1`);

      // ---- 1. công tắc khẩn ?social=0: nút ẩn, Shift+G không mở ----
      if (!(await openPage(vp, "&social=0"))) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug&social=0)");
        failures++;
        continue;
      }
      s = await state();
      check(s.btnHidden, "?social=0: nút HUD Xã hội ẩn");
      await shiftG();
      s = await state();
      check(s.modalHidden, "?social=0: Shift+G KHÔNG mở bảng");
      await evalJs(`window.__ui.setWorldBoss(window.__sample.worldBoss("live")); 1`);
      check(
        await evalJs(`document.getElementById("wb-banner").hidden`),
        "?social=0: tin trùm thế giới KHÔNG làm hiện banner",
      );
      await evalJs(
        `window.__ui.onAchievementNew({ id: "kiep_2" }); window.__ui.setAchievements(window.__sample.achievements()); 1`,
      );
      check(
        await evalJs(`!document.getElementById("btn-social").classList.contains("has-new")`),
        "?social=0: thành tựu mới KHÔNG tạo chấm trên nút HUD",
      );

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
        const open = await evalJs(`(() => {
          const btns = [...document.querySelectorAll("#hud-menu-items button")].filter((b) => b.getBoundingClientRect().width > 0);
          const lefts = btns.map((b) => b.getBoundingClientRect().left), rights = btns.map((b) => b.getBoundingClientRect().right);
          const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
          const rows = new Set(tops).size;
          const perRow = [...new Set(tops)].sort((a, b) => a - b).map((t) => tops.filter((x) => x === t).length);
          return { n: btns.length, minL: Math.min(...lefts), maxR: Math.max(...rights), vw: window.innerWidth, rows, perRow };
        })()`);
        check(
          open.n === 8 && open.minL >= -0.5 && open.maxR <= open.vw + 0.5,
          `menu ☰ đang mở: cả ${open.n} nút nằm trọn khung (${Math.round(open.minL)} - ${Math.round(open.maxR)} / ${open.vw})`,
        );
        check(
          open.rows <= 2,
          `menu ☰ đang mở: tối đa 2 hàng, không thành một cột (${open.rows} hàng)`,
        );
        // MỞ MẶC ĐỊNH (M9): 8 nút xếp 4 + 4 (không phải 7 + 1 nút lẻ) ở màn hẹp
        check(
          open.perRow.join("+") === "4+4",
          `menu ☰ đang mở: 8 nút xếp 4 + 4 (${open.perRow.join(" + ")})`,
        );
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
      // hàng nút menu (8 nút khi bật nút Xã hội): MỌI nút nằm trọn khung (360 px từng bị cắt nút đầu) và, khi hàng đứng cạnh cột trái, không chồng bảng Tổ đội
      const menu = await evalJs(`(() => {
        const items = document.getElementById("hud-menu-items");
        const shown = getComputedStyle(items).display !== "none";
        const btns = [...items.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0);
        const r = items.getBoundingClientRect();
        return { shown, n: btns.length, minL: Math.min(...btns.map((b) => b.getBoundingClientRect().left)), maxR: Math.max(...btns.map((b) => b.getBoundingClientRect().right)), left: r.left, vw: window.innerWidth,
          abs: getComputedStyle(items).position === "absolute" };
      })()`);
      check(
        !menu.shown || (menu.n === 8 && menu.minL >= -0.5 && menu.maxR <= menu.vw + 0.5),
        menu.shown
          ? `hàng menu (${menu.n} nút) nằm trọn khung (${Math.round(menu.minL)} - ${Math.round(menu.maxR)} / ${menu.vw})`
          : "hàng menu thu vào nút ☰ ở khung này",
      );
      if (menu.shown && !menu.abs)
        check(
          menu.left >= 12 + 240 + 8 - 1,
          `hàng menu đứng cạnh cột trái, không chồng bảng Tổ đội (trái ${Math.round(menu.left)} px >= 259)`,
        );

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

      // ---- 4b. tab Xếp hạng (M9.6, #1025) ----
      await evalJs(`document.getElementById("social-tab-btn-rank").click(); 1`);
      await sleep(200);
      const rank = () =>
        evalJs(`(() => {
          const q = (id) => document.getElementById(id);
          const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, h: b.height }; };
          const wrap = q("social-board-wrap"), table = q("social-board-table");
          const cells = [...table.querySelectorAll("th, td")];
          return {
            status: q("social-board-status").textContent, statusHidden: q("social-board-status").hidden,
            wrapHidden: wrap.hidden, retryHidden: q("social-board-retry").hidden, retryH: r(q("social-board-retry")).h,
            mine: q("social-board-mine").textContent, age: q("social-board-age").textContent,
            head: [...q("social-board-head").children].map((e) => e.textContent),
            rows: [...q("social-board-body").querySelectorAll("tr")].map((tr) => ({ cls: tr.className, cells: [...tr.children].map((c) => c.textContent) })),
            wrapOverflow: wrap.scrollWidth - wrap.clientWidth,
            clipped: cells.filter((c) => c.scrollWidth > c.clientWidth + 1).length,
            pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
            modal: r(q("social-modal")), vw: window.innerWidth, vh: window.innerHeight,
            injected: q("social-board-body").querySelectorAll("b, img, script").length,
            sub: ["tuvi", "linhhon", "tongmon", "pk"].map((id) => { const b = q("social-board-btn-" + id); return { id, sel: b.getAttribute("aria-selected"), ti: b.tabIndex, h: r(b).h }; }),
            focusId: document.activeElement ? document.activeElement.id : "",
          };
        })()`);
      /** Bảng mẫu của shared; bảng Linh hồn đổi bậc về trong thang (mẫu của shared cho bậc 40, ngoài thang). */
      const setBoard = (board, n, patch = "", variant = "top") =>
        evalJs(`(() => {
          const m = window.__sample.boards(${JSON.stringify(board)}, ${n}, ${JSON.stringify(variant)});
          if (m.board === "linhhon") m.rows = m.rows.map((r, i) => ({ ...r, step: 30 - i }));
          ${patch}
          window.__ui.setBoards(m);
          window.__ui.switchSocialBoard(${JSON.stringify(board)});
          return 1;
        })()`);

      // chưa có bản nào của bảng 'pk' (chưa nhận được tin): "Đang tải…", rồi sau ~6 s hiện nút "Tải lại" cao >= 44 px
      await evalJs(`window.__ui.switchSocialBoard("pk"); 1`);
      let k = await rank();
      check(
        k.status === "Đang tải bảng Thách đấu…" && !k.statusHidden && k.wrapHidden && k.retryHidden,
        `chưa có bảng: "${k.status}", bảng ẩn, chưa có nút Tải lại`,
      );
      await sleep(6300);
      k = await rank();
      check(
        !k.retryHidden && k.retryH >= 44 - 0.5 && k.status.startsWith("Chưa nhận được bảng"),
        `máy chủ im quá 6 s: nút "Tải lại bảng" hiện (${Math.round(k.retryH)} px), chữ "${k.status}"`,
      );

      const WANT_HEAD = { tuvi: 4, linhhon: 4, tongmon: 5, pk: 4 };
      for (const board of ["tuvi", "linhhon", "tongmon", "pk"]) {
        await setBoard(board, 20);
        await sleep(150);
        k = await rank();
        const tag = `bảng ${board}`;
        check(!k.wrapHidden && k.rows.length === 20, `${tag}: 20 dòng (${k.rows.length})`);
        check(
          k.head.length === WANT_HEAD[board],
          `${tag}: ${WANT_HEAD[board]} cột (${k.head.join(" | ")})`,
        );
        check(k.retryHidden && k.statusHidden, `${tag}: hết trạng thái tải, không còn nút Tải lại`);
        check(k.mine === "Hạng của bạn: 3", `${tag}: "${k.mine}"`);
        check(
          k.rows.filter((x) => x.cls.includes("mine")).length === 1 &&
            k.rows[2].cls.includes("mine"),
          `${tag}: đúng MỘT dòng được đánh dấu (hạng 3)`,
        );
        check(
          /^Cập nhật 1 phút trước\. Bảng làm mới mỗi 5 phút\.$/.test(k.age),
          `${tag}: "${k.age}"`,
        );
        check(
          k.rows.every((x) => x.cells.every((c) => c !== "" && !/NaN|undefined|null/.test(c))),
          `${tag}: không ô trống / NaN / undefined`,
        );
        if (board === "linhhon")
          check(
            k.rows[0].cells[2] !== "—",
            `${tag}: cột cảnh giới đảo từ bậc ("${k.rows[0].cells[2]}")`,
          );
        if (board === "tongmon") check(k.head[1] === "Tông môn", `${tag}: cột tên ghi "Tông môn"`);
        check(
          board === "tuvi"
            ? k.rows.every((x) => !x.cells[1].includes("thử nghiệm"))
            : k.rows[1].cells[1].includes("thử nghiệm"),
          board === "tuvi"
            ? `${tag}: KHÔNG có dòng thử nghiệm`
            : `${tag}: dòng thử nghiệm được đánh dấu`,
        );
        check(k.clipped === 0, `${tag}: không ô nào bị cắt chữ (${k.clipped})`);
        check(
          k.wrapOverflow <= 1 && k.pageOverflow <= 1,
          `${tag}: không tràn ngang (bảng ${k.wrapOverflow}, trang ${k.pageOverflow})`,
        );
        check(
          k.modal.l >= -0.5 &&
            k.modal.t >= -0.5 &&
            k.modal.r <= k.vw + 0.5 &&
            k.modal.b <= k.vh + 0.5,
          `${tag}: bảng vẫn nằm trọn khung`,
        );
        if (shotsDir && (board === "tuvi" || board === "tongmon")) {
          const shot = await send("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(
            path.join(shotsDir, `xa-hoi-xep-hang-${board}-${vp.name}.png`),
            Buffer.from(shot.result.data, "base64"),
          );
        }
      }

      // các trạng thái của "Hạng của bạn" (biến thể của `sampleBoards` ở shared) + bảng rỗng + chống chèn HTML (trên bảng tu vi)
      await setBoard("tuvi", 5, "", "outside");
      k = await rank();
      check(
        k.mine === "Hạng của bạn: 47" &&
          k.rows.length === 7 &&
          k.rows[5].cls.includes("gap") &&
          k.rows[6].cls.includes("outside") &&
          k.rows[6].cls.includes("mine") &&
          k.rows[6].cells[0] === "47",
        `mình ngoài top: dòng "…" rồi dòng của mình (hạng 47) có số liệu (${k.rows.length} hàng)`,
      );
      for (const [variant, want] of [
        ["test", "Tài khoản thử nghiệm không vào bảng này."],
        ["min_games", "Cần thêm 6 trận để lên bảng."],
        ["none", "Chưa có hạng."],
      ]) {
        await setBoard("tuvi", 5, "", variant);
        k = await rank();
        check(
          k.mine === want && !k.rows.some((x) => x.cls.includes("mine")),
          `không hạng (${variant}): "${k.mine}"`,
        );
      }
      // bảng Tông môn khi CHƯA thuộc tông môn nào (mock không có tông môn): nói thẳng, không 'Chưa có hạng.' (các bảng khác giữ câu cũ ở vòng trên)
      await setBoard("tongmon", 5, "", "none");
      k = await rank();
      check(
        k.mine === "Bạn chưa thuộc tông môn nào.",
        `bảng Tông môn, chưa thuộc tông môn nào: "${k.mine}"`,
      );
      await setBoard("tuvi", 5, `m.rows = [];`);
      k = await rank();
      check(
        k.wrapHidden && !k.statusHidden && k.status === "Chưa có ai trên bảng này.",
        `bảng rỗng: "${k.status}", không hiện khung bảng`,
      );
      await setBoard("tuvi", 5, `m.rows[0].name = "<b>x</b><img src=x onerror=alert(1)>";`);
      k = await rank();
      check(
        k.injected === 0 && k.rows[0].cells[1].startsWith("<b>x</b>"),
        `đạo hiệu có thẻ HTML hiện NGUYÊN chữ, không thành phần tử (${k.injected})`,
      );
      await evalJs(
        `window.__ui.setBoards({ board: "zzz", rows: 5 }); window.__ui.setBoards(null); window.__ui.setBoards("x"); 1`,
      );
      k = await rank();
      check(k.rows.length === 5 || k.wrapHidden, "tin sai kiểu bị bỏ, giao diện vẫn nguyên");

      // tab phụ: cao >= 44, mũi tên / Home / End đổi bảng VÀ đưa focus theo
      k = await rank();
      check(
        k.sub.every((b) => b.h >= 44 - 0.5),
        `mỗi tab phụ cao >= 44 px (${k.sub.map((b) => Math.round(b.h)).join(" / ")})`,
      );
      await evalJs(
        `window.__ui.switchSocialBoard("tuvi"); document.getElementById("social-board-btn-tuvi").focus(); 1`,
      );
      await press("ArrowRight", "ArrowRight", 39);
      k = await rank();
      check(
        k.sub[1].sel === "true" && k.focusId === "social-board-btn-linhhon",
        `tab phụ: Phải -> Linh hồn, focus theo ("${k.focusId}")`,
      );
      check(
        k.sub.filter((b) => b.sel === "true").length === 1 &&
          k.sub.filter((b) => b.ti === 0).length === 1,
        "tab phụ: chỉ MỘT tab chọn / tabindex 0",
      );
      await press("End", "End", 35);
      k = await rank();
      check(
        k.sub[3].sel === "true" && k.focusId === "social-board-btn-pk",
        "tab phụ: End -> Thách đấu",
      );
      await press("ArrowRight", "ArrowRight", 39);
      k = await rank();
      check(k.sub[0].sel === "true", "tab phụ: Phải ở tab cuối vòng về Tu vi");
      await press("ArrowLeft", "ArrowLeft", 37);
      k = await rank();
      check(k.sub[3].sel === "true", "tab phụ: Trái ở tab đầu vòng về Thách đấu");
      await press("Home", "Home", 36);
      k = await rank();
      check(
        k.sub[0].sel === "true" && k.focusId === "social-board-btn-tuvi",
        "tab phụ: Home -> Tu vi",
      );
      check(!(await state()).modalHidden, "mũi tên ở tab phụ không đóng bảng");

      // ---- 4c. trùm thế giới (M9.7, #1026): tab Sự kiện + banner ----
      const wb = () =>
        evalJs(`(() => {
          const q = (id) => document.getElementById(id);
          const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
          const banner = q("wb-banner"), bar = q("boss-bar");
          return {
            hidden: banner.hidden, rect: r(banner), tone: banner.dataset.tone || "",
            title: q("wb-title").textContent, hp: q("wb-hp").textContent, timerLabel: q("wb-timer-label").textContent, timer: q("wb-timer").textContent,
            mine: q("wb-mine").textContent, mineHidden: q("wb-mine").hidden, result: q("wb-result").textContent, resultHidden: q("wb-result").hidden,
            toggleHidden: q("wb-toggle").hidden, toggleH: r(q("wb-toggle")).h, toggleDisplay: getComputedStyle(q("wb-toggle")).display, expanded: q("wb-toggle").getAttribute("aria-expanded"),
            topHidden: q("wb-top").hidden, topItems: [...q("wb-top").children].map((li) => li.textContent),
            pe: getComputedStyle(banner).pointerEvents, peToggle: getComputedStyle(q("wb-toggle")).pointerEvents,
            barTop: parseFloat(getComputedStyle(bar).top), wbH: getComputedStyle(document.documentElement).getPropertyValue("--wb-h").trim(),
            overflow: banner.scrollWidth - banner.clientWidth, pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
            vw: window.innerWidth, vh: window.innerHeight,
            tab: { status: q("wbt-status").textContent, detail: q("wbt-detail").textContent, retryHidden: q("wbt-retry").hidden, retryH: r(q("wbt-retry")).h, emptyHidden: q("wbt-empty").hidden, wrapHidden: q("wbt-wrap").hidden, tz: q("wbt-tz").textContent, sched: [...q("wbt-body").children].map((tr) => [...tr.children].map((td) => td.textContent)) },
            toasts: [...document.querySelectorAll("#toast p")].map((p) => p.className + ":" + p.textContent),
          };
        })()`);
      const sendWb = (phase, variant = "killed", patch = "") =>
        evalJs(
          `(() => { const m = window.__sample.worldBoss(${JSON.stringify(phase)}, ${JSON.stringify(variant)}); ${patch} window.__ui.setWorldBoss(m); return 1; })()`,
        );
      const secs = (t) => {
        const m = /(\d\d):(\d\d)/.exec(t);
        return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
      };

      // tab Sự kiện: chưa có tin -> "Đang tải sự kiện…", im ~6 s -> nút Tải lại (>= 44 px)
      await evalJs(`document.getElementById("social-tab-btn-event").click(); 1`);
      await sleep(150);
      let w = await wb();
      check(
        w.tab.status === "Đang tải sự kiện…" && w.tab.retryHidden,
        `tab Sự kiện chưa có tin: "${w.tab.status}"`,
      );
      await sleep(6300);
      w = await wb();
      check(
        !w.tab.retryHidden && w.tab.retryH >= 44 - 0.5 && w.tab.status.startsWith("Chưa nhận được"),
        `máy chủ im quá 6 s: nút Tải lại (${Math.round(w.tab.retryH)} px), "${w.tab.status}"`,
      );
      check(w.hidden, "chưa có tin: banner ẩn");
      // lịch hằng ngày theo DỮ LIỆU THẬT của shared (WORLD_BOSS_SCHEDULE): có khung giờ -> bảng + ghi chú múi giờ, câu giữ chỗ ẩn; rỗng -> câu giữ chỗ, không bảng rỗng.
      // (trước 25/11 kiểm cứng 'lịch rỗng' nên đỏ từ khi A nhập lịch thật ở M9.10; nay đúng cả hai trạng thái dữ liệu)
      const sched = w.tab.sched;
      if (sched.length > 0) {
        check(
          w.tab.emptyHidden && !w.tab.wrapHidden && w.tab.tz !== "",
          `lịch có ${sched.length} khung giờ: bảng hiện, câu giữ chỗ ẩn, ghi chú múi giờ "${w.tab.tz}"`,
        );
        check(
          sched.every(
            (r) => r.length === 4 && /^\d{1,2}:\d\d/.test(r[0]) && r.every((c) => c !== ""),
          ),
          `mỗi hàng lịch đủ 4 ô (giờ / trùm / bản đồ / thời lượng), không ô trống: ${JSON.stringify(sched[0])}`,
        );
      } else {
        check(
          !w.tab.emptyHidden && w.tab.wrapHidden && w.tab.tz === "",
          "lịch rỗng: 'Lịch sự kiện chưa được công bố.', không hiện bảng / ghi chú múi giờ",
        );
      }

      // sắp xuất hiện (5 phút): trạng thái ở tab + đếm ngược GIẢM theo thời gian; banner hiện
      await sendWb("soon");
      w = await wb();
      const t0 = secs(w.tab.status);
      check(/xuất hiện sau 0[45]:\d\d$/.test(w.tab.status) && t0 > 0, `tab: "${w.tab.status}"`);
      check(w.tab.retryHidden, "có tin: nút Tải lại ẩn");
      check(
        !w.hidden && w.timerLabel === "Xuất hiện sau" && w.title.includes(" · "),
        `banner (sắp): "${w.title}" ${w.timerLabel} ${w.timer}`,
      );
      await sleep(2300);
      w = await wb();
      check(
        secs(w.timer) > 0 && secs(w.timer) <= t0 - 2,
        `đồng hồ giảm theo thời gian (${t0}s -> ${secs(w.timer)}s)`,
      );
      check(secs(w.tab.status) <= t0 - 2, "đồng hồ ở tab Sự kiện cũng giảm");

      // chưa có sự kiện: banner ẩn, tab báo; sự kiện xa hơn 15 phút: CHỈ ở tab, banner không hiện
      await sendWb("none");
      w = await wb();
      check(
        w.hidden && w.tab.status === "Chưa có sự kiện.",
        `không có sự kiện: banner ẩn, tab "${w.tab.status}"`,
      );
      await evalJs(
        `window.__ui.setWorldBoss({ ...window.__sample.worldBoss("soon"), startsInMs: 3 * 3600000 }); 1`,
      );
      w = await wb();
      check(
        w.hidden && /xuất hiện sau 3 giờ 00 phút$/.test(w.tab.status),
        `sự kiện cách 3 giờ: banner ẩn, tab "${w.tab.status}"`,
      );

      // đang diễn ra: tab (còn bao lâu + máu + đóng góp), banner
      await sendWb("live");
      w = await wb();
      check(/đang diễn ra, còn 2[12]:\d\d\.$/.test(w.tab.status), `tab live: "${w.tab.status}"`);
      check(
        w.tab.detail === "Máu 64% · Bạn đóng góp 4,6%: đủ điều kiện nhận thưởng.",
        `tab live chi tiết: "${w.tab.detail}"`,
      );

      // đóng bảng để đo banner thật: vị trí, không đè thanh trùm, nút >= 44 px, danh sách đóng góp, không chặn chạm
      await evalJs(
        `window.__ui.toggleSocialModal(false); document.getElementById("boss-bar").hidden = false; 1`,
      );
      await sleep(300);
      w = await wb();
      check(
        !w.hidden && w.timerLabel === "Còn lại" && w.hp === "Máu 64%",
        `banner live: ${w.title} · ${w.timerLabel} ${w.timer} · ${w.hp}`,
      );
      check(
        w.mine === "Bạn đóng góp 4,6%: đủ điều kiện nhận thưởng." && !w.mineHidden,
        `banner: "${w.mine}"`,
      );
      check(
        w.rect.l >= -0.5 && w.rect.t >= -0.5 && w.rect.r <= w.vw + 0.5 && w.rect.b <= w.vh + 0.5,
        `banner nằm trọn khung (${Math.round(w.rect.l)},${Math.round(w.rect.t)} - ${Math.round(w.rect.r)},${Math.round(w.rect.b)} / ${w.vw}x${w.vh})`,
      );
      check(
        w.overflow <= 1 && w.pageOverflow <= 1,
        `banner không tràn ngang (${w.overflow} / ${w.pageOverflow})`,
      );
      if (inMenu) {
        const onTop = await evalJs(`(() => {
          const items = document.getElementById("hud-menu-items");
          if (getComputedStyle(items).display === "none") return "menu đóng";
          const b = document.getElementById("btn-char").getBoundingClientRect();
          const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return el && items.contains(el) ? "ok" : "banner đè: " + (el ? el.id || el.className : "null");
        })()`);
        check(
          onTop === "ok" || onTop === "menu đóng",
          `menu ☰ (điện thoại dọc) nằm TRÊN banner, bấm được (${onTop})`,
        );
      }
      check(
        w.pe === "none" && w.peToggle === "auto",
        "banner KHÔNG chặn chạm xuống thế giới (chỉ nút bật / tắt nhận chạm)",
      );
      check(
        w.barTop >= w.rect.b - 0.5,
        `thanh trùm nằm DƯỚI banner, không đè (${Math.round(w.barTop)} >= ${Math.round(w.rect.b)})`,
      );
      check(
        parseInt(w.wbH, 10) >= Math.round(w.rect.h),
        `--wb-h = ${w.wbH} (cao banner ${Math.round(w.rect.h)} px)`,
      );
      const compact = w.vh <= 420 && w.vw > w.vh;
      if (compact) {
        check(
          w.toggleDisplay === "none" && w.rect.h <= 64,
          `khung ngang thấp: banner MỘT dòng (cao ${Math.round(w.rect.h)} px), không nút / danh sách che HUD`,
        );
      }
      if (!compact) {
        check(
          !w.toggleHidden && w.toggleH >= 44 - 0.5,
          `nút "Xem đóng góp" cao >= 44 px (${Math.round(w.toggleH)})`,
        );
        // mở sẵn trên màn rộng, thu gọn trên điện thoại; bấm đổi trạng thái
        const wide = w.vw >= 900 && w.vh >= 500;
        check(
          w.expanded === String(wide) && w.topHidden === !wide,
          `danh sách đóng góp ${wide ? "mở sẵn" : "thu gọn"} ở khung này`,
        );
        await evalJs(`document.getElementById("wb-toggle").click(); 1`);
        await sleep(150);
        w = await wb();
        check(
          w.expanded === String(!wide) && w.topHidden === wide,
          "bấm nút: đổi mở / thu gọn, aria-expanded đúng",
        );
        await evalJs(
          `if (document.getElementById("wb-top").hidden) document.getElementById("wb-toggle").click(); 1`,
        );
        await sleep(150);
        w = await wb();
        check(
          !w.topHidden && w.topItems.length === 3 && w.topItems.every((t) => /\d,\d%$/.test(t)),
          `danh sách đóng góp: ${w.topItems.length} dòng, mỗi dòng có phần trăm`,
        );
        check(
          w.rect.b <= w.vh + 0.5 && w.overflow <= 1,
          "mở danh sách: banner vẫn trọn khung, không tràn",
        );
        check(
          w.barTop >= w.rect.b - 0.5,
          "mở danh sách: thanh trùm vẫn dưới banner (--wb-h cập nhật theo chiều cao)",
        );
      }
      if (shotsDir) {
        const shot = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(shotsDir, `xa-hoi-trum-${vp.name}.png`),
          Buffer.from(shot.result.data, "base64"),
        );
      }

      await sendWb("live", "below");
      w = await wb();
      check(/cần từ 1,5% để nhận thưởng\.$/.test(w.mine), `chưa đủ ngưỡng: "${w.mine}"`);

      // kết quả: bốn trường hợp (banner đổi sang câu kết quả + một toast đúng tông)
      for (const [variant, re, tone] of [
        ["killed", /^Đã hạ .+! Thưởng: \+46 tu vi, \+9 Linh thạch, .+ x1\.$/, "good"],
        ["fled", /đã bỏ chạy\.$/, "bad"],
        ["cancelled", /đã bị huỷ\.$/, "info"],
      ]) {
        await sendWb("ended", variant);
        await sleep(100);
        w = await wb();
        check(
          !w.hidden && !w.resultHidden && re.test(w.result) && w.tone === tone,
          `kết quả ${variant}: "${w.result}" (tông ${w.tone})`,
        );
        check(
          w.toasts.some((t) => t.startsWith(tone + ":") && re.test(t.slice(tone.length + 1))),
          `kết quả ${variant}: có toast cùng tông`,
        );
        check(
          w.timer === "" || w.mineHidden,
          `kết quả ${variant}: banner không còn đồng hồ / đóng góp`,
        );
      }
      // cùng một sự kiện kết thúc nhận LẠI thì KHÔNG toast lần hai
      const before = (await wb()).toasts.length;
      await sendWb("ended", "cancelled");
      await sleep(100);
      check(
        (await wb()).toasts.length === before,
        "tin kết thúc lặp đúng sự kiện đó: không toast lần hai",
      );
      if (vp.name === VIEWPORTS[0].name) {
        await sleep(10_300);
        w = await wb();
        check(w.hidden, "sau ~10 s kết quả tự ẩn, banner biến mất");
      }

      // tin sai kiểu bị bỏ; có tin mới thì banner lại hiện; ẩn thì thanh trùm lên lại chỗ cũ
      await sendWb("live");
      await evalJs(
        `window.__ui.setWorldBoss(null); window.__ui.setWorldBoss({ phase: "zzz", id: "a", name: "b", mapId: "c" }); window.__ui.setWorldBoss("x"); 1`,
      );
      w = await wb();
      check(!w.hidden && w.hp === "Máu 64%", "tin sai kiểu bị bỏ, banner giữ nguyên");
      await sendWb("none");
      await sleep(250);
      w = await wb();
      check(
        w.hidden && parseInt(w.wbH, 10) === 0,
        `không còn sự kiện: banner ẩn, --wb-h = ${w.wbH}`,
      );
      await evalJs(
        `document.getElementById("boss-bar").hidden = true; window.__ui.toggleSocialModal(true); 1`,
      );
      await sleep(700);

      // ---- 4d. thành tựu + danh hiệu (M9.8, #1027) ----
      const ach = () =>
        evalJs(`(() => {
          const q = (id) => document.getElementById(id);
          const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, h: b.height, w: b.width }; };
          const radios = [...q("ach-titles").querySelectorAll('[role="radio"]')];
          const groups = [...q("ach-groups").querySelectorAll("details")];
          const lk = q("ach-locked");
          const lkItems = [...q("ach-locked-list").querySelectorAll(".ach-item")];
          const items = [...q("ach-groups").querySelectorAll(".ach-item")];
          const pane = q("social-tab-ach");
          const btn = q("btn-social");
          return {
            status: q("ach-status").textContent, statusHidden: q("ach-status").hidden, retryHidden: q("ach-retry").hidden, retryH: r(q("ach-retry")).h,
            bodyHidden: q("ach-body").hidden, summary: q("ach-summary").textContent, worn: q("ach-worn").textContent,
            radios: radios.map((b) => ({ t: b.querySelector(".ach-title-text").textContent, checked: b.getAttribute("aria-checked"), dis: b.getAttribute("aria-disabled"), hint: (b.querySelector(".ach-title-hint") || {}).textContent || "", h: r(b).h })),
            locked: { hidden: lk.hidden, open: lk.open, sum: q("ach-locked-sum").textContent, sumH: r(q("ach-locked-sum")).h, nRadioInside: lk.querySelectorAll('[role="radio"]').length,
              items: lkItems.map((li) => ({ name: li.querySelector(".ach-name").textContent, hint: li.querySelector(".ach-desc").textContent, w: r(li).w, h: r(li).h })) },
            groups: groups.map((g) => ({ s: g.querySelector("summary").textContent, open: g.open, h: r(g.querySelector("summary")).h })),
            items: items.map((li) => ({ name: li.querySelector(".ach-name").textContent, state: li.querySelector(".ach-state").textContent, isNew: !!li.querySelector(".ach-badge"),
              bar: li.querySelector(".ach-bar") ? { now: li.querySelector(".ach-bar").getAttribute("aria-valuenow"), text: li.querySelector(".ach-bar").getAttribute("aria-valuetext") } : null,
              reward: (li.querySelector(".ach-reward") || {}).textContent || "" })),
            paneOverflow: pane.scrollWidth - pane.clientWidth, pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
            dot: btn.classList.contains("has-new"), btnLabel: btn.getAttribute("aria-label"),
            toasts: [...document.querySelectorAll("#toast p")].map((p) => p.className + ":" + p.textContent),
            sent: (window.__sent || []).map((x) => x[0] + ":" + JSON.stringify(x[1])),
          };
        })()`);
      const setAch = (patch = "") =>
        evalJs(
          `(() => { const m = window.__sample.achievements(); ${patch} window.__ui.setAchievements(m); return 1; })()`,
        );
      // bắt tin gửi đi (đè room.send như check-sect-hall)
      await evalJs(
        `(() => { window.__sent = []; const rm = window.__scene.room; if (!rm.__origSend) rm.__origSend = rm.send; rm.send = (t, m) => { window.__sent.push([t, m]); }; return 1; })()`,
      );

      // chưa có sổ: "Đang tải…" + đã gửi achievementsGet; im ~6 s -> nút Tải lại >= 44 px
      await evalJs(`document.getElementById("social-tab-btn-ach").click(); 1`);
      await sleep(200);
      let a = await ach();
      check(
        a.status === "Đang tải sổ thành tựu…" && a.bodyHidden && a.retryHidden,
        `tab Thành tựu chưa có sổ: "${a.status}", thân ẩn`,
      );
      check(
        a.sent.some((x) => x.startsWith("achievementsGet:")),
        "mở tab: gửi achievementsGet",
      );
      await sleep(6300);
      a = await ach();
      check(
        !a.retryHidden && a.retryH >= 44 - 0.5 && a.status.startsWith("Chưa nhận được sổ"),
        `máy chủ im quá 6 s: nút Tải lại (${Math.round(a.retryH)} px), "${a.status}"`,
      );
      await evalJs(`window.__sent.length = 0; document.getElementById("ach-retry").click(); 1`);
      check(
        (await ach()).sent.some((x) => x.startsWith("achievementsGet:")),
        "bấm Tải lại: gửi lại achievementsGet",
      );

      // có sổ (tin mẫu của shared)
      await setAch();
      await sleep(150);
      a = await ach();
      check(
        !a.bodyHidden && a.statusHidden && a.retryHidden,
        "có sổ: thân hiện, hết trạng thái tải",
      );
      check(/^Đã đạt 1 \/ \d+ thành tựu\.$/.test(a.summary), `tóm tắt: "${a.summary}"`);
      check(a.worn === "Danh hiệu đang đeo: Tái Sinh", `danh hiệu đang đeo: "${a.worn}"`);
      // Danh hiệu ĐÃ mở hiện thẳng (radio) cùng "Không đeo"; CHƯA mở gập vào một mục riêng (M9.9: 32 danh hiệu, hiện hết thì phải cuộn ~1800 px mới tới thành tựu). Số danh hiệu
      // lấy từ DANH MỤC (`TITLES` của shared) nên KHÔNG cứng: sổ mẫu chỉ mở một danh hiệu (Tái Sinh) => radio = "Không đeo" + Tái Sinh, mọi danh hiệu còn lại nằm trong mục gập
      check(
        a.radios.length === 2 &&
          a.radios.filter((x) => x.checked === "true").length === 1 &&
          a.radios[1].checked === "true" &&
          a.radios.every((x) => x.dis === null),
        `danh hiệu: chỉ "Không đeo" + cái đã mở là nút chọn, đúng MỘT cái được chọn (${a.radios.map((x) => x.t + (x.checked === "true" ? "*" : "")).join(" | ")})`,
      );
      const lockedN = a.locked.items.length;
      check(
        !a.locked.hidden &&
          !a.locked.open &&
          lockedN >= 3 &&
          a.locked.sum === `Còn ${lockedN} danh hiệu chưa mở` &&
          a.locked.nRadioInside === 0,
        `danh hiệu chưa mở GẬP sẵn: "${a.locked.sum}" (${lockedN} mục, mở = ${a.locked.open}), không phải nút chọn`,
      );
      check(
        a.locked.sumH >= 44 - 0.5,
        `mục gập danh hiệu: tiêu đề cao >= 44 px (${Math.round(a.locked.sumH)} px)`,
      );
      check(
        a.radios.every((x) => x.h >= 44 - 0.5),
        `mọi nút danh hiệu cao >= 44 px (${a.radios.map((x) => Math.round(x.h)).join(" / ")})`,
      );
      check(
        a.groups.length >= 1 && a.groups.every((g) => g.h >= 44 - 0.5),
        `mỗi nhóm thành tựu có tiêu đề cao >= 44 px (${a.groups.length} nhóm)`,
      );
      // bấm tiêu đề mở mục gập: mỗi danh hiệu chưa mở có TÊN + cách mở bằng CHỮ, không tràn ngang; vẽ lại sổ (tin mới) KHÔNG làm gập lại; bấm lần nữa thì gập
      await evalJs(`document.getElementById("ach-locked-sum").click(); 1`);
      await sleep(120);
      let lk = await ach();
      check(
        lk.locked.open &&
          lk.locked.items.length === lockedN &&
          lk.locked.items.every(
            (x) => x.name !== "" && /^Mở bằng thành tựu: /.test(x.hint) && x.h > 0 && x.w > 0,
          ) &&
          lk.paneOverflow <= 1 &&
          lk.pageOverflow <= 1,
        `mở mục gập: ${lk.locked.items.length} danh hiệu chưa mở, mỗi cái có tên + "Mở bằng thành tựu: ...", không tràn ngang (bảng ${lk.paneOverflow}, trang ${lk.pageOverflow})`,
      );
      await setAch();
      await sleep(150);
      lk = await ach();
      check(lk.locked.open, "sổ mới về lúc đang xem: mục gập danh hiệu vẫn MỞ");
      await evalJs(`document.getElementById("ach-locked-sum").click(); 1`);
      await sleep(120);
      lk = await ach();
      check(!lk.locked.open, "bấm tiêu đề lần nữa: mục gập danh hiệu đóng lại");
      const itDone = a.items.find((x) => x.name === "Luân Hồi Lần Đầu");
      const itDoing = a.items.find((x) => x.name === "Mười Trận Thắng");
      check(
        itDone &&
          /^Hoàn thành/.test(itDone.state) &&
          itDone.bar === null &&
          itDone.reward === "Thưởng: danh hiệu Tái Sinh, +2 Duyên",
        "thành tựu đã đạt: Hoàn thành, không thanh tiến độ, thưởng bằng chữ",
      );
      check(
        itDoing &&
          itDoing.state === "6 / 10" &&
          itDoing.bar &&
          itDoing.bar.now === "60" &&
          itDoing.bar.text === "6 / 10",
        "thành tựu dở: '6 / 10', thanh tiến độ 60% có aria-valuetext",
      );
      check(
        a.paneOverflow <= 1 && a.pageOverflow <= 1,
        `tab Thành tựu không tràn ngang (${a.paneOverflow} / ${a.pageOverflow})`,
      );
      if (shotsDir) {
        const shot = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(shotsDir, `xa-hoi-thanh-tuu-${vp.name}.png`),
          Buffer.from(shot.result.data, "base64"),
        );
      }

      // đeo / gỡ: KHÔNG đoán trước, chỉ đổi khi máy chủ trả lại achievements; bấm danh hiệu CHƯA mở (chỉ là chữ trong mục gập) không làm gì
      await evalJs(
        `window.__sent.length = 0; document.getElementById("ach-locked").open = true; document.querySelector("#ach-locked-list .ach-item").click(); document.getElementById("ach-locked").open = false; 1`,
      );
      a = await ach();
      check(
        a.sent.every((x) => !x.startsWith("titleSet:")) &&
          a.worn === "Danh hiệu đang đeo: Tái Sinh",
        "bấm danh hiệu KHÓA: không gửi titleSet, không đổi",
      );
      await evalJs(
        `window.__sent.length = 0; document.querySelectorAll('#ach-titles [role="radio"]')[0].click(); 1`,
      ); // Không đeo
      a = await ach();
      check(
        a.sent.includes('titleSet:{"id":null}'),
        `bấm "Không đeo": gửi titleSet {id:null} (${a.sent.join(",")})`,
      );
      check(
        a.worn === "Đang đổi danh hiệu…" && a.radios[1].checked === "true",
        "chờ máy chủ: hiện 'Đang đổi…', CHƯA đổi lựa chọn",
      );
      await evalJs(
        `window.__sent.length = 0; document.querySelectorAll('#ach-titles [role="radio"]')[0].click(); 1`,
      );
      check((await ach()).sent.length === 0, "đang chờ trả lời: bấm nữa không gửi thêm");
      await setAch(`m.title = null;`);
      a = await ach();
      check(
        a.worn === "Chưa đeo danh hiệu." &&
          a.radios[0].checked === "true" &&
          a.radios[1].checked === "false",
        "máy chủ trả lại title null: đổi sang 'Không đeo'",
      );
      await evalJs(
        `window.__sent.length = 0; document.querySelectorAll('#ach-titles [role="radio"]')[1].click(); 1`,
      ); // đeo lại Tái Sinh
      a = await ach();
      check(a.sent.includes('titleSet:{"id":"lh2"}'), "bấm 'Tái Sinh': gửi titleSet {id:'lh2'}");
      await setAch(); // máy chủ chấp nhận (title lh2)
      a = await ach();
      check(
        a.worn === "Danh hiệu đang đeo: Tái Sinh" && a.radios[1].checked === "true",
        "máy chủ xác nhận: đang đeo Tái Sinh",
      );
      // máy chủ TỪ CHỐI (trả lại sổ cũ với title null): UI về đúng trạng thái máy chủ, không kẹt 'Đang đổi…'
      await evalJs(`document.querySelectorAll('#ach-titles [role="radio"]')[0].click(); 1`);
      await setAch(`m.title = "lh2";`);
      a = await ach();
      check(
        a.worn === "Danh hiệu đang đeo: Tái Sinh" && a.radios[1].checked === "true",
        "máy chủ từ chối (trả lại title cũ): UI theo máy chủ, hết 'Đang đổi…'",
      );
      if (vp.name === VIEWPORTS[0].name) {
        await evalJs(`document.querySelectorAll('#ach-titles [role="radio"]')[0].click(); 1`);
        await sleep(5300);
        a = await ach();
        check(
          a.worn === "Danh hiệu đang đeo: Tái Sinh",
          "máy chủ im 5 s sau khi bấm: thôi chờ, về trạng thái cũ (không kẹt)",
        );
      }

      // thành tựu MỚI: đang ở tab khác thì có chấm trên nút HUD; mở tab Thành tựu thấy 'Mới' và chấm tắt; rời tab thì dấu 'Mới' mất
      await evalJs(`document.getElementById("social-tab-btn-event").click(); 1`);
      await setAch(`m.ach.pk_thang_10 = "2026-11-17T09:00:00.000Z"; m.counters.pk_won = 10;`);
      await evalJs(`window.__ui.onAchievementNew({ id: "pk_thang_10" }); 1`);
      a = await ach();
      check(
        a.dot && /Có thành tựu mới/.test(a.btnLabel),
        `thành tựu mới lúc ở tab khác: chấm trên nút HUD + nhãn đọc màn hình ("${a.btnLabel}")`,
      );
      check(
        a.toasts.some((t) => t.startsWith("good:Mở danh hiệu Đấu Sĩ")),
        "thành tựu mở danh hiệu: có toast mời đeo (máy chủ đã có toast tên thành tựu riêng)",
      );
      await evalJs(`document.getElementById("social-tab-btn-ach").click(); 1`);
      await sleep(150);
      a = await ach();
      const itNew = a.items.find((x) => x.name === "Mười Trận Thắng");
      check(
        itNew && itNew.isNew && !a.dot,
        "mở tab Thành tựu: dấu 'Mới' ở đúng mục, chấm trên nút HUD tắt",
      );
      check(a.items.filter((x) => x.isNew).length === 1, "chỉ MỘT mục có dấu 'Mới'");
      await evalJs(
        `document.getElementById("social-tab-btn-rank").click(); document.getElementById("social-tab-btn-ach").click(); 1`,
      );
      await sleep(150);
      a = await ach();
      check(a.items.every((x) => !x.isNew) && !a.dot, "rời rồi vào lại tab: dấu 'Mới' đã mất");

      // tin sai kiểu bị bỏ; id lạ không tạo chấm
      await evalJs(
        `window.__ui.setAchievements(null); window.__ui.setAchievements("x"); window.__ui.setAchievements([]); window.__ui.onAchievementNew(null); window.__ui.onAchievementNew({ id: "__proto__" }); window.__ui.onAchievementNew({ id: "khong_co_thanh_tuu" }); 1`,
      );
      a = await ach();
      check(
        !a.bodyHidden && /^Đã đạt 2 \//.test(a.summary) && !a.dot,
        "tin sai kiểu bị bỏ; id lạ KHÔNG tạo dấu / chấm: giao diện giữ nguyên",
      );
      // MÁY CHỦ CHƯA BẬT THÀNH TỰU (`ACHIEVEMENTS` tắt: vẫn trả sổ nhưng KHÔNG ai được cấp gì; hoặc người chơi mới tinh): sổ rỗng tiến độ phải hiện gọn, không nút chết / không giả vờ đã đạt
      await setAch("m.ach = {}; m.counters = {}; m.title = null;");
      a = await ach();
      check(
        !a.bodyHidden && /^Đã đạt 0 \//.test(a.summary) && !a.dot,
        `sổ rỗng (máy chủ chưa cấp gì): "${a.summary}", không chấm Mới`,
      );
      check(
        a.items.every((x) => x.state !== "Hoàn thành" && !x.isNew),
        "sổ rỗng: không thành tựu nào hiện 'Hoàn thành' hay dấu Mới",
      );
      check(
        a.radios.filter((x) => x.t !== "Không đeo" && x.dis !== "true").length === 0,
        "sổ rỗng: mọi danh hiệu đều khoá (aria-disabled), không có lựa chọn đeo nào bấm được",
      );
      check(a.paneOverflow <= 0 && a.pageOverflow <= 0, "sổ rỗng: không tràn ngang");
      await evalJs(`window.__scene.room.send = window.__scene.room.__origSend; 1`);

      // danh hiệu hiện cạnh đạo hiệu trên đầu nhân vật (nhãn Phaser): chỉ khi cờ bật
      await evalJs(
        `(() => { const sc = window.__scene; const me = sc.room.state.players.get(sc.room.sessionId); me.title = "lh2"; return 1; })()`,
      );
      await sleep(600);
      const lab = await evalJs(
        `(() => { const sc = window.__scene; const e = sc.players.get(sc.room.sessionId); return e && e.label ? e.label.text : null; })()`,
      );
      check(
        typeof lab === "string" && lab.includes("«Tái Sinh»"),
        `nhãn trên đầu nhân vật có danh hiệu ("${String(lab).replace(/\n/g, " / ")}")`,
      );
      await evalJs(
        `(() => { const sc = window.__scene; const me = sc.room.state.players.get(sc.room.sessionId); me.title = "zz99"; return 1; })()`,
      );
      await sleep(600);
      const lab2 = await evalJs(
        `(() => { const sc = window.__scene; const e = sc.players.get(sc.room.sessionId); return e && e.label ? e.label.text : null; })()`,
      );
      check(
        typeof lab2 === "string" && !lab2.includes("zz99") && !lab2.includes("«"),
        `danh hiệu LẠ không lộ id, không hiện ngoặc ("${String(lab2).replace(/\n/g, " / ")}")`,
      );
      await evalJs(
        `(() => { const sc = window.__scene; const me = sc.room.state.players.get(sc.room.sessionId); me.title = ""; return 1; })()`,
      );

      // ---- 4c. BẤM VÀO BẢNG KHÔNG CHÉM (M9): chuột trái trên bảng Xã hội, trên vùng thế giới lúc bảng đang mở, và trên nút của banner KHÔNG gửi `attack`; ĐỐI CHỨNG: đóng bảng thì bấm vào
      // thế giới VẪN chém (không thì ca này không bắt được gì); bảng mở lại / đóng lại vẫn đúng (cờ chặn không kẹt) ----
      await evalJs(
        `(() => { window.__sent = []; const rm = window.__scene.room; if (!rm.__origSend) rm.__origSend = rm.send; rm.send = (t, m) => { window.__sent.push([t, m]); }; return 1; })()`,
      );
      const mouseClick = async (x, y) => {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "left",
          buttons: 1,
          clickCount: 1,
        });
        await send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x,
          y,
          button: "left",
          buttons: 0,
          clickCount: 1,
        });
        await sleep(150);
      };
      const attackCount = () => evalJs(`window.__sent.filter((x) => x[0] === "attack").length`);
      /** Điểm trên canvas không bị phần tử DOM nào che (quét lưới); `null` nếu bảng phủ kín (điện thoại). */
      const worldPoint = () =>
        evalJs(`(() => {
          for (let fy = 0.92; fy >= 0.08; fy -= 0.06) for (let fx = 0.04; fx <= 0.97; fx += 0.06) {
            const x = Math.round(innerWidth * fx), y = Math.round(innerHeight * fy);
            const el = document.elementFromPoint(x, y);
            if (el && el.tagName === "CANVAS") return { x, y };
          }
          return null;
        })()`);
      s = await state();
      check(!s.modalHidden, "(mồi) bảng Xã hội đang mở");
      await mouseClick(
        Math.round((s.modal.l + s.modal.r) / 2),
        Math.round((s.modal.t + s.modal.b) / 2),
      );
      check((await attackCount()) === 0, "bấm chuột giữa bảng Xã hội: KHÔNG chém");
      const outside = await worldPoint();
      if (outside) {
        await mouseClick(outside.x, outside.y);
        check(
          (await attackCount()) === 0,
          `bảng đang mở, bấm vào vùng thế giới (${outside.x}, ${outside.y}): KHÔNG chém`,
        );
      } else {
        console.log("  (bảng phủ kín khung nhìn: không có vùng thế giới để bấm)");
      }
      for (const tab of ["rank", "ach", "event"]) {
        await evalJs(`document.getElementById("social-tab-btn-${tab}").click(); 1`);
        await sleep(200);
        s = await state();
        await mouseClick(Math.round((s.modal.l + s.modal.r) / 2), Math.round(s.modal.t + 120));
      }
      check((await attackCount()) === 0, "bấm trong thân cả ba tab: KHÔNG chém");
      await press("Escape", "Escape", 27);
      s = await state();
      check(s.modalHidden, "(mồi) Esc đóng bảng");
      await sleep(900); // qua hồi chiêu chém
      const wp = await worldPoint();
      check(wp !== null, "(mồi) có điểm thế giới để bấm khi bảng đóng");
      if (wp) {
        await mouseClick(wp.x, wp.y);
        check(
          (await attackCount()) >= 1,
          "ĐỐI CHỨNG: bảng đã đóng, bấm vào thế giới VẪN chém (cờ chặn không kẹt)",
        );
      }
      // nút của banner trùm thế giới (banner nền KHÔNG chặn chạm, riêng nút vẫn nhận): bấm nút KHÔNG chém
      await evalJs(`window.__ui.setWorldBoss(window.__sample.worldBoss("live")); 1`);
      await sleep(400);
      const tgl = await evalJs(`(() => {
        const b = document.getElementById("wb-toggle");
        if (!b || b.hidden) return null;
        const r = b.getBoundingClientRect();
        return r.width > 0 ? { x: Math.round((r.left + r.right) / 2), y: Math.round((r.top + r.bottom) / 2) } : null;
      })()`);
      if (tgl) {
        await sleep(900);
        await evalJs(`window.__sent.length = 0; 1`);
        await mouseClick(tgl.x, tgl.y);
        check(
          (await attackCount()) === 0,
          "bấm nút 'Ẩn / Hiện đóng góp' của banner trùm: KHÔNG chém",
        );
      } else {
        console.log("  (khung này banner không có nút đóng góp hiện: bỏ qua ca nút banner)");
      }
      await evalJs(`window.__ui.setWorldBoss(window.__sample.worldBoss("none")); 1`);
      await evalJs(`window.__scene.room.send = window.__scene.room.__origSend; 1`);
      await shiftG(); // mở lại bảng như trước ca này (bước 5 bắt đầu từ bảng đang mở)
      s = await state();
      check(!s.modalHidden, "(mồi) Shift+G mở lại bảng cho bước kế");
      // điện thoại: bấm ra vùng thế giới làm menu ☰ thu lại (nút Xã hội nằm trong menu); mở lại cho bước 5 (focus bằng bàn phím vào nút HUD)
      if (inMenu && (await state()).btn.w === 0) {
        await evalJs(`document.getElementById("btn-menu").click(); 1`);
        await sleep(500);
      }

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
