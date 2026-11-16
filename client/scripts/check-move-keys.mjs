import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch */
/**
 * Kiểm DI CHUYỂN BẰNG BÀN PHÍM (QUYET_DINH_M3 mục 25: "giật / không ăn / liệt nút") trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-move-keys.mjs [--vp <khung>] [--secs <giây giữ phím, mặc định 30>]
 *
 * Dùng `Input.dispatchKeyEvent` của Chrome với đúng sự kiện bộ gõ / hệ điều hành. Mỗi giây đặt lại nhân vật về điểm xuất phát rồi đo quãng đường (không đụng tường):
 *   [1] GIỮ phím D 30 giây (kèm phím lặp 30 Hz như hệ điều hành): mỗi giây đi được xấp xỉ như nhau, KHÔNG giây nào khựng;
 *   [2] BỘ GÕ kiểu Windows (Telex / VNI): `key = "Process"`, `keyCode = 229`, `code` đúng vị trí phím: vẫn đi (Phaser keyCode từng KHÔNG thấy phím nào);
 *   [3] BỘ GÕ chèn ký tự (Unikey): giữ W, bộ gõ chèn Backspace + chữ có dấu (code rỗng, keyCode 231): không làm mất phím đang giữ;
 *   [4] ĐỔI HƯỚNG NHANH: A rồi D khi A chưa nhả, rồi nhả A: không đứng im (phím bấm sau thắng);
 *   [5] PHÍM KẸT: keyup không tới (mất focus / ẩn tab / menu chuột phải / vào ô chat) thì QUÊN phím, nhân vật dừng; không kẹt sau đó;
 *   [6] FOCUS: ô đánh dấu (checkbox) còn focus KHÔNG chặn đi bộ; ô chat chặn (gõ chữ), nhả ra thì đi lại;
 *   [7] MỤC SÓT: bảng đã ẩn mà còn trong ngăn xếp (đường đóng quên `remove`) không còn chặn WASD.
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

/** Năm khung nhìn như `check-forge-shop.mjs`; máy tính đứng đầu (Chrome headless không tắt được giả lập cảm ứng trong cùng phiên). */
export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
];

export const MIN_TAP_PX = 44;

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  const SECS = Number(
    process.argv.includes("--secs") ? process.argv[process.argv.indexOf("--secs") + 1] : 30,
  );
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-inv-select-"));
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
    { stdio: "ignore", detached: true }, // nhóm tiến trình riêng: dọn được cả tiến trình con của Chrome một lần
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
      if (onlyVp ? vp.name !== onlyVp : vp.name !== "1280x720" && vp.name !== "844x390") continue;
      console.log(`\n=== ${vp.name} ===`);
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      if (vp.mobile)
        await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&map=am_suong`,
      });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__getMap && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      if (!ready) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      await sleep(600);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      // ---- khởi tạo: đứng giữa quảng trường, mỗi lần đo đặt lại điểm xuất phát ----
      await evalJs(`(() => {
        window.__sent = [];
        window.__scene.room.send = (t, m) => { window.__sent.push([t, m]); };
        const n = window.__craftData.NPC_BY_ID.tho_ren_suong;
        window.__start = { x: n.x, y: n.y + 90 };
        return 1;
      })()`);
      const reset = () =>
        evalJs(
          `(() => { const sc = window.__scene; sc.predX = window.__start.x; sc.predY = window.__start.y; sc.cameras.main.centerOn(sc.predX, sc.predY); return 1; })()`,
        );
      const pos = () =>
        evalJs(
          `({ x: window.__scene.predX - window.__start.x, y: window.__scene.predY - window.__start.y })`,
        );
      const VK = { KeyA: 65, KeyD: 68, KeyW: 87, KeyS: 83, ArrowRight: 39, Backspace: 8 };
      const KEY = {
        KeyA: "a",
        KeyD: "d",
        KeyW: "w",
        KeyS: "s",
        ArrowRight: "ArrowRight",
        Backspace: "Backspace",
      };
      /** Bấm xuống phím vật lý `code`; `ime` = kiểu bộ gõ Windows (key "Process", keyCode 229); `repeat` = phím lặp của hệ điều hành. */
      const down = (code, { ime = false, repeat = false } = {}) =>
        send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: ime ? "Process" : KEY[code],
          code,
          windowsVirtualKeyCode: ime ? 229 : VK[code],
          autoRepeat: repeat,
        });
      const up = (code, { ime = false } = {}) =>
        send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: ime ? "Process" : KEY[code],
          code,
          windowsVirtualKeyCode: ime ? 229 : VK[code],
        });
      /** Giữ `code` trong `ms` ms (phím lặp 30 Hz sau 500 ms như hệ điều hành), trả quãng đường đã đi. */
      const hold = async (code, ms, opts = {}) => {
        await reset();
        await down(code, opts);
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          await sleep(33);
          if (Date.now() - t0 > 500) await down(code, { ...opts, repeat: true });
        }
        const p = await pos();
        await up(code, opts);
        await sleep(60);
        return p;
      };
      const stopped = async () => {
        const a = await pos();
        await sleep(300);
        const b = await pos();
        return Math.hypot(b.x - a.x, b.y - a.y) < 1;
      };
      await sleep(300);
      await reset();
      await down("KeyD");
      await sleep(1000);
      const base = (await pos()).x;
      await up("KeyD");
      await sleep(60);
      check(base > 60, `chuẩn: giữ D 1 giây đi được ${base.toFixed(0)} px`);

      console.log(`  [1] giữ phím D ${SECS} giây (phím lặp 30 Hz): mỗi giây đi đều, không khựng`);
      await reset();
      await down("KeyD");
      const t0 = Date.now();
      const steps = [];
      for (let s = 1; s <= SECS; s++) {
        while (Date.now() - t0 < s * 1000) {
          await sleep(33);
          if (Date.now() - t0 > 500) await down("KeyD", { repeat: true });
        }
        steps.push((await pos()).x);
        await reset(); // mỗi giây đo lại từ điểm xuất phát để không tới tường
      }
      await up("KeyD");
      const minStep = Math.min(...steps);
      const maxStep = Math.max(...steps);
      check(
        minStep >= base * 0.75,
        `${SECS} giây liên tục: giây chậm nhất ${minStep.toFixed(0)} px >= 75% chuẩn ${base.toFixed(0)} px`,
      );
      check(
        maxStep <= base * 1.3,
        `giây nhanh nhất ${maxStep.toFixed(0)} px <= 130% chuẩn (không giật tăng tốc)`,
      );
      check(await stopped(), "nhả phím: nhân vật dừng");
      const toastTexts = () =>
        evalJs(`[...document.querySelectorAll("#toast p")].map((p) => p.textContent)`);
      check(
        !(await toastTexts()).some((t) => t.includes("bộ gõ")),
        "chơi bình thường 30 giây: KHÔNG hiện gợi ý bộ gõ",
      );

      console.log("  [2] bộ gõ kiểu Windows: key = 'Process', keyCode 229");
      for (const code of ["KeyD", "KeyA", "KeyW", "KeyS", "ArrowRight"]) {
        const p = await hold(code, 700, { ime: true });
        const dist = Math.hypot(p.x, p.y);
        check(
          dist > base * 0.5,
          `giữ ${code} qua bộ gõ: đi được ${dist.toFixed(0)} px (> 50% chuẩn)`,
        );
      }

      console.log("  [3] bộ gõ Unikey chèn Backspace + chữ có dấu khi đang giữ W");
      await reset();
      await down("KeyW");
      await sleep(250);
      await down("Backspace");
      await up("Backspace");
      await send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key: "ư",
        code: "",
        windowsVirtualKeyCode: 231,
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "ư",
        code: "",
        windowsVirtualKeyCode: 231,
      });
      await sleep(500);
      const pu = await pos();
      await up("KeyW");
      await sleep(60);
      check(
        -pu.y > base * 0.4,
        `giữ W, bộ gõ chèn Backspace + chữ: vẫn đi lên ${(-pu.y).toFixed(0)} px`,
      );

      console.log("  [4] đổi hướng nhanh: A rồi D khi A chưa nhả");
      await reset();
      await down("KeyA");
      await sleep(300);
      await down("KeyD"); // A chưa nhả
      await sleep(400);
      const mid = await pos();
      await up("KeyA");
      await sleep(400);
      const fin = await pos();
      await up("KeyD");
      await sleep(60);
      check(
        fin.x - mid.x > base * 0.25,
        `nhả A, giữ D: vẫn đi sang phải (+${(fin.x - mid.x).toFixed(0)} px), không đứng im`,
      );
      check(mid.x > -base * 0.45, `bấm D khi A chưa nhả: đổi hướng ngay (x = ${mid.x.toFixed(0)})`);

      console.log("  [5] phím KẸT: mất focus / ẩn tab / menu chuột phải / vào ô chat");
      const stuckCase = async (name, trigger) => {
        await reset();
        await down("KeyD");
        await sleep(300);
        await trigger(); // keyup của D sẽ KHÔNG bao giờ tới
        await sleep(100);
        const a = await pos();
        await sleep(400);
        const b = await pos();
        check(
          Math.abs(b.x - a.x) < 1,
          `${name}: nhân vật dừng, phím không kẹt (đi thêm ${(b.x - a.x).toFixed(1)} px)`,
        );
        await up("KeyD"); // keyup muộn: không gây hại
      };
      await stuckCase("mất focus cửa sổ (blur)", () =>
        evalJs(`window.dispatchEvent(new Event("blur"))`),
      );
      await stuckCase("ẩn tab (visibilitychange)", () =>
        evalJs(
          `(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); return 1; })()`,
        ),
      );
      await stuckCase("menu chuột phải (contextmenu)", () =>
        evalJs(`window.dispatchEvent(new Event("contextmenu"))`),
      );
      // ô chat có thể ẩn ở khung nhìn nhỏ (không focus được): chỉ kiểm khi focus thật sự vào được
      const chatFocusable = await evalJs(
        `(() => { const c = document.getElementById("chat-input"); c.focus(); const ok = document.activeElement === c; c.blur(); return ok; })()`,
      );
      if (chatFocusable)
        await stuckCase("vào ô chat (focus ô nhập)", () =>
          evalJs(`document.getElementById("chat-input").focus()`),
        );
      else console.log("  - ô chat ẩn ở khung nhìn này: bỏ qua ca vào ô chat");
      await evalJs(`document.getElementById("chat-input").blur()`);
      const afterKept = await hold("KeyD", 600);
      check(
        afterKept.x > base * 0.4,
        `sau các ca kẹt, bấm lại vẫn đi (${afterKept.x.toFixed(0)} px)`,
      );

      console.log("  [6] focus: ô đánh dấu không chặn, ô chat chặn");
      await evalJs(
        `(() => { const c = document.createElement("input"); c.type = "checkbox"; c.id = "mk-test-cb"; c.style.position = "fixed"; c.style.left = "-100px"; document.body.append(c); c.focus(); return document.activeElement === c; })()`,
      );
      const withCb = await hold("KeyD", 600);
      check(
        withCb.x > base * 0.4,
        `ô đánh dấu (checkbox) đang giữ focus: vẫn đi (${withCb.x.toFixed(0)} px)`,
      );
      await evalJs(`document.getElementById("mk-test-cb").remove()`);
      // thanh trượt (range) còn giữ focus, như thanh âm lượng ở Cài đặt sau khi bấm: KHÔNG chặn đi bộ
      await evalJs(
        `(() => { const c = document.createElement("input"); c.type = "range"; c.id = "mk-test-range"; c.style.position = "fixed"; c.style.left = "-100px"; document.body.append(c); c.focus(); return document.activeElement === c; })()`,
      );
      const withRange = await hold("KeyD", 600);
      check(
        withRange.x > base * 0.4,
        `thanh trượt (range) đang giữ focus: vẫn đi (${withRange.x.toFixed(0)} px)`,
      );
      await evalJs(`document.getElementById("mk-test-range").remove()`);
      if (chatFocusable) {
        await evalJs(`document.getElementById("chat-input").focus()`);
        const inChat = await hold("KeyD", 500);
        check(Math.hypot(inChat.x, inChat.y) < 1, "đang gõ ở ô chat: KHÔNG đi (phím là chữ)");
      }
      await evalJs(`document.getElementById("chat-input").blur()`);
      await sleep(100);
      const backWalk = await hold("KeyD", 600);
      check(
        backWalk.x > base * 0.4,
        `nhả ô chat: đi lại bình thường (${backWalk.x.toFixed(0)} px)`,
      );

      console.log("  [7] mục sót trong ngăn xếp bảng");
      await evalJs(`window.__ui.toggleInventory(true)`);
      await sleep(200);
      const blockedWhileOpen = await hold("KeyD", 400);
      check(
        Math.hypot(blockedWhileOpen.x, blockedWhileOpen.y) < 1,
        "túi đồ đang mở: bàn phím KHÔNG đi (mũi tên dành cho bảng)",
      );
      await evalJs(`document.getElementById("inv-modal").hidden = true`); // đường đóng quên `remove`: ẩn thẳng phần tử
      await sleep(100);
      const healed = await hold("KeyD", 600);
      check(
        healed.x > base * 0.4,
        `bảng đã ẩn nhưng còn trong ngăn xếp: tự chữa, đi lại được (${healed.x.toFixed(0)} px)`,
      );
      await evalJs(`window.__ui.toggleInventory(false)`);

      console.log("  [8] bộ gõ Unikey chèn Backspace + chữ có dấu nhiều lần: gợi ý MỘT lần");
      await evalJs(`document.querySelectorAll("#toast p").forEach((p) => p.remove())`);
      for (let i = 0; i < 3; i++) {
        await down("KeyW");
        await sleep(20);
        await down("Backspace");
        await up("Backspace");
        await send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: "ư",
          code: "",
          windowsVirtualKeyCode: 231,
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "ư",
          code: "",
          windowsVirtualKeyCode: 231,
        });
        await up("KeyW");
        await sleep(200);
      }
      const hint = (await toastTexts()).filter((t) => t.includes("bộ gõ"));
      check(hint.length === 1, `gợi ý bộ gõ hiện đúng MỘT lần: ${JSON.stringify(hint)}`);
      await sleep(200);

      console.log("  [9] độ trễ từ lúc nhấn phím đến lúc thấy nhân vật nhích");
      const lat = [];
      for (let i = 0; i < 10; i++) {
        await reset();
        await sleep(120);
        const x0 = (await pos()).x;
        const t1 = Date.now();
        await down("KeyD");
        let dt = -1;
        while (Date.now() - t1 < 1000) {
          if ((await pos()).x - x0 > 0.5) {
            dt = Date.now() - t1;
            break;
          }
          await sleep(4);
        }
        await up("KeyD");
        await sleep(100);
        lat.push(dt);
      }
      lat.sort((a, b) => a - b);
      const med = lat[Math.floor(lat.length / 2)];
      check(
        lat[0] >= 0 && med <= 150,
        `độ trễ nhấn phím -> nhích: trung vị ${med} ms (<= 150), lớn nhất ${lat[lat.length - 1]} ms`,
      );
    }

    // ---- [10] phím di chuyển ĐỔI ĐƯỢC (bảng phím `move.*`, QUYET_DINH_M3 mục 25): nạp bảng phím đã đổi ở máy tính ----
    if (!onlyVp || onlyVp === "1280x720") {
      console.log(
        "\n=== Phím di chuyển ĐỔI ĐƯỢC: I J K L đi (lên, trái, xuống, phải), W A S D hết đi ===",
      );
      await send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const seed = {
        "move.up": ["KeyI"],
        "move.left": ["KeyJ"],
        "move.down": ["KeyK"],
        "move.right": ["KeyL"],
      };
      await send("Page.addScriptToEvaluateOnNewDocument", {
        source: `try { localStorage.setItem('tg_keymap', ${JSON.stringify(JSON.stringify(seed))}); } catch (e) {}`,
      });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&map=am_suong`,
      });
      let ready2 = false;
      for (let i = 0; i < 80 && !ready2; i++) {
        await sleep(200);
        ready2 = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__getMap && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      if (!ready2) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
      } else {
        await sleep(600);
        await evalJs(`(() => {
          window.__sent = [];
          window.__scene.room.send = (t, m) => { window.__sent.push([t, m]); };
          const n = window.__craftData.NPC_BY_ID.tho_ren_suong;
          window.__start = { x: n.x, y: n.y + 90 };
          return 1;
        })()`);
        const VK2 = {
          KeyI: 73,
          KeyJ: 74,
          KeyK: 75,
          KeyL: 76,
          KeyW: 87,
          KeyA: 65,
          KeyS: 83,
          KeyD: 68,
          ArrowRight: 39,
        };
        const KEY2 = {
          KeyI: "i",
          KeyJ: "j",
          KeyK: "k",
          KeyL: "l",
          KeyW: "w",
          KeyA: "a",
          KeyS: "s",
          KeyD: "d",
          ArrowRight: "ArrowRight",
        };
        const holdKey = async (code, ms) => {
          await evalJs(
            `(() => { const sc = window.__scene; sc.predX = window.__start.x; sc.predY = window.__start.y; sc.cameras.main.centerOn(sc.predX, sc.predY); return 1; })()`,
          );
          await send("Input.dispatchKeyEvent", {
            type: "rawKeyDown",
            key: KEY2[code],
            code,
            windowsVirtualKeyCode: VK2[code],
          });
          await sleep(ms);
          const p = await evalJs(
            `({ x: window.__scene.predX - window.__start.x, y: window.__scene.predY - window.__start.y })`,
          );
          await send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: KEY2[code],
            code,
            windowsVirtualKeyCode: VK2[code],
          });
          await sleep(100);
          return p;
        };
        console.log("  [10] bảng phím đã đổi: phím mới đi, phím cũ không đi");
        const MIN = 30;
        const r = await holdKey("KeyL", 600);
        check(
          r.x > MIN && Math.abs(r.y) < 1,
          `L = đi phải (${r.x.toFixed(0)}, ${r.y.toFixed(0)} px)`,
        );
        const l = await holdKey("KeyJ", 600);
        check(
          l.x < -MIN && Math.abs(l.y) < 1,
          `J = đi trái (${l.x.toFixed(0)}, ${l.y.toFixed(0)} px)`,
        );
        const u = await holdKey("KeyI", 600);
        check(
          u.y < -MIN && Math.abs(u.x) < 1,
          `I = đi lên (${u.x.toFixed(0)}, ${u.y.toFixed(0)} px)`,
        );
        const d = await holdKey("KeyK", 600);
        check(
          d.y > MIN && Math.abs(d.x) < 1,
          `K = đi xuống (${d.x.toFixed(0)}, ${d.y.toFixed(0)} px)`,
        );
        for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowRight"]) {
          const o = await holdKey(code, 500);
          check(
            Math.hypot(o.x, o.y) < 1,
            `${code} không còn là phím đi (${o.x.toFixed(0)}, ${o.y.toFixed(0)} px)`,
          );
        }
        const helpText = await evalJs(`document.getElementById("help")?.textContent ?? ""`);
        check(
          helpText.startsWith("I J K L đi"),
          `dòng gợi ý đầu màn hình ghi phím mới: "${helpText.slice(0, 40)}"`,
        );

        console.log('  [11] màn "Phím tắt" có nhóm Di chuyển, ghi đúng phím đã đổi');
        await evalJs(`window.__ui.toggleKeysModal(true)`);
        await sleep(300);
        const keysTxt = await evalJs(`document.getElementById("keys-modal")?.innerText ?? ""`);
        check(/Di chuyển/.test(keysTxt), 'có nhóm "Di chuyển"');
        check(
          /Đi sang phải/.test(keysTxt) && /Đi lên/.test(keysTxt),
          "có bốn dòng Đi lên / xuống / trái / phải",
        );
        const rows = await evalJs(
          `[...document.querySelectorAll("#keys-modal .keys-row")].map((r) => r.innerText.replace(/\\s+/g, " ").trim()).filter((t) => t.startsWith("Đi "))`,
        );
        check(
          rows.some((t) => /Đi lên.*\bI\b/.test(t)) &&
            rows.some((t) => /Đi sang phải.*\bL\b/.test(t)),
          `dòng Đi lên ghi I, Đi sang phải ghi L: ${JSON.stringify(rows)}`,
        );
        await evalJs(`window.__ui.toggleKeysModal(false)`);
      }
    }
  } finally {
    try {
      process.kill(-chrome.pid, "SIGKILL"); // cả nhóm
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
