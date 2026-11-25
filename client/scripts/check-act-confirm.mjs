import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm HỘP XÁC NHẬN DÙNG CHUNG (issue #779, docs/RA_SOAT_THAO_TAC.md) ở thao tác ĐỘT PHÁ trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-act-confirm.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Dùng sự kiện đầu vào THẬT của Chrome (`Input.dispatchMouseEvent` / `dispatchTouchEvent` / `dispatchKeyEvent`):
 *   - Đủ điều kiện (tầng cuối, đầy tu vi): bấm / chạm nút Đột phá -> HỘP hiện nêu cảnh giới, xác suất thành công và hậu quả thất bại; CHƯA gửi `breakthrough`;
 *     bấm "Đột phá" NGAY khi hộp vừa mở (click ma) bị bỏ qua; sau cửa sổ chống click ma: đúng MỘT `breakthrough`; "Chưa" / Esc / X không gửi gì.
 *   - Chưa đủ điều kiện: gửi luôn (máy chủ báo lý do, không mất gì), KHÔNG hỏi.
 *   - Phím tắt (V): hộp mở, focus ở "Chưa"; Y xác nhận (sau cửa sổ chống click ma), X giữ lại, Esc giữ lại.
 *   - Có đan hộ đạo: xác suất cao hơn, nhắc phần đã cộng. Điều kiện đổi giữa lúc hộp mở (hết đầy tu vi): xác nhận bị huỷ kèm thông báo, không gửi.
 *   - Nối lại mạng: hộp đóng. Nút trong hộp >= 44 px trên cảm ứng và không bị che.
 *   - Đang giữ D mà bấm V: hộp mở thì nhân vật ĐỨNG LẠI (hộp là tầng trên cùng: `ui.isKeyboardCaptured()`), Esc đóng rồi D còn giữ thì đi tiếp, nhả D (kể cả
 *     lúc hộp đang mở) thì dừng, không kẹt phím.
 * `--shots`: lưu ảnh hộp xác nhận mỗi khung nhìn.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-act-confirm-"));
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

    // ---- đầu vào THẬT của Chrome ----
    const mouse = (type, x, y, extra = {}) =>
      send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        buttons: type === "mousePressed" ? 1 : 0,
        clickCount: 1,
        ...extra,
      });
    const moveTo = async (x, y) => mouse("mouseMoved", x, y, { button: "none", buttons: 0 });
    const clickAt = async (x, y) => {
      await moveTo(x, y);
      await mouse("mousePressed", x, y);
      await mouse("mouseReleased", x, y);
    };
    const tapAt = async (x, y) => {
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const keyDef = {
      Enter: [13, "\r"],
      Escape: [27, ""],
      ArrowRight: [39, ""],
      ArrowLeft: [37, ""],
      ArrowDown: [40, ""],
      Tab: [9, ""],
    };
    const press = async (key) => {
      const [vk, text] = keyDef[key];
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        code: key,
        windowsVirtualKeyCode: vk,
        ...(text ? { text } : {}),
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: key,
        windowsVirtualKeyCode: vk,
      });
    };

    for (const vp of VIEWPORTS) {
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} (${vp.mobile ? "cảm ứng" : "chuột"} + bàn phím) ===`);
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
      const shot = async (name) => {
        if (!shotsDir) return;
        await sleep(150);
        const s = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(
          path.join(shotsDir, `${name}-${vp.name}.webp`),
          Buffer.from(s.result.data, "base64"),
        );
      };
      /** Tâm của phần tử (đã cuộn vào tầm nhìn); `null` nếu không có. Trả thêm phần tử TẠI điểm đó để biết có bị che (nút Đóng nổi...) không. */
      const center = (sel, idx = 0) =>
        evalJs(`(() => {
          const e = document.querySelectorAll(${JSON.stringify(sel)})[${idx}];
          if (!e) return null;
          e.scrollIntoView({ block: "center", inline: "center" });
          const r = e.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const top = document.elementFromPoint(x, y);
          return { x, y, w: r.width, h: r.height, hit: !!top && (top === e || e.contains(top)), topId: top ? (top.id || top.className || top.tagName) : null };
        })()`);

      // ---- dữ liệu: người chơi ở đỉnh bậc, đầy tu vi ----
      await evalJs(`(() => {
        window.__sent = [];
        window.__scene.room.send = (t, m) => { window.__sent.push([t, m]); };
        return 1;
      })()`);
      /** Đặt người chơi ở Trúc Cơ: \`ready\` = tầng cuối (tầng 99 >= tầng cuối) + đầy tu vi (đủ điều kiện thử), ngược lại tầng đầu, tu vi dở. */
      const setMe = (ready) =>
        evalJs(`(() => {
          const me = window.__scene.me();
          me.realm = 2; me.tier = ${ready ? 99 : 0};
          me.expMax = 1000; me.exp = ${ready ? 1000 : 10};
          window.__scene.onStatus({ list: [] });
          return 1;
        })()`);
      const sentCount = (t) =>
        evalJs(`window.__sent.filter((m) => m[0] === ${JSON.stringify(t)}).length`);
      const box = () =>
        evalJs(`(() => ({
          open: window.__ui.isActConfirmOpen(),
          text: document.getElementById("act-confirm-text").textContent,
          warn: document.getElementById("act-confirm-warn").hidden ? "" : document.getElementById("act-confirm-warn").textContent,
          yes: document.getElementById("act-btn-yes-label").textContent,
          no: document.getElementById("act-btn-no-label").textContent,
          active: document.activeElement?.id ?? "",
        }))()`);
      const press2 = async (key, code) => {
        await send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key,
          code,
          windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
          text: key,
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key,
          code,
          windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
        });
      };
      const tap = (x, y) => (vp.mobile ? tapAt(x, y) : clickAt(x, y));

      console.log("  [1] chưa đủ điều kiện: gửi luôn, không hỏi");
      await setMe(false);
      let b = await center("#sk-break");
      await tap(b.x, b.y);
      await sleep(200);
      check(
        (await sentCount("breakthrough")) === 1 && !(await box()).open,
        "chưa đầy tu vi: gửi breakthrough ngay, không hộp xác nhận",
      );

      console.log("  [2] đủ điều kiện: hộp xác nhận (nút HUD)");
      await evalJs(`window.__sent.length = 0`);
      await setMe(true);
      b = await center("#sk-break");
      check(b.hit, `nút Đột phá bấm được (không bị che bởi "${b.topId}")`);
      await tap(b.x, b.y);
      await sleep(120);
      let st = await box();
      check(
        st.open && /^Đột phá .+ lên .+: thành công \d+%\.$/.test(st.text),
        `hộp mở, câu hỏi: "${st.text}"`,
      );
      check(
        /^Thất bại mất 30% tu vi và nửa khí huyết\.$/.test(st.warn),
        `hậu quả thất bại: "${st.warn}"`,
      );
      check(st.yes === "Đột phá" && st.no === "Chưa", `nút: "${st.no}" / "${st.yes}"`);
      check(st.active === "act-btn-no", `focus ở "Chưa" (${st.active})`);
      check((await sentCount("breakthrough")) === 0, "chưa gửi breakthrough khi chưa xác nhận");
      const yes = await center("#act-btn-yes");
      await shot("xac-nhan-dot-pha");
      await sleep(560);
      check(
        yes.hit &&
          yes.w >= (vp.mobile ? MIN_TAP_PX : 0) - 0.5 &&
          yes.h >= (vp.mobile ? MIN_TAP_PX : 0) - 0.5,
        `nút xác nhận không bị che (${yes.w.toFixed(0)}x${yes.h.toFixed(0)}px, che bởi "${yes.hit ? "" : yes.topId}")`,
      );
      // Giữ lại: không gửi
      const no = await center("#act-btn-no");
      await tap(no.x, no.y);
      await sleep(150);
      check(
        !(await box()).open && (await sentCount("breakthrough")) === 0,
        "Chưa: hộp đóng, không gửi",
      );
      // click ma: bấm Đột phá NGAY khi hộp vừa mở. KHÔNG phụ thuộc đồng hồ: mở hộp VÀ bấm "Đột phá" trong CÙNG MỘT lượt JS của trang (độ trễ ~0 ms, không qua CDP; `pointerdown` tổng hợp), nên cú bấm luôn rơi trong
      // cửa sổ chống click ma ACT_CONFIRM_GUARD_MS (450 ms) dù runner chậm (trước đây center() + tap() chạy SAU khi mở hộp: trên runner CI không GPU cú bấm trễ quá 450 ms nên được tính là thật)
      // (nút HUD và nút trong hộp nối `pointerdown`, nên dùng PointerEvent tổng hợp chứ không `.click()`)
      await evalJs(
        `(() => { const pd = (id) => document.getElementById(id).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 })); pd("sk-break"); pd("act-btn-yes"); return 1; })()`,
      );
      st = await box();
      check(
        st.open && (await sentCount("breakthrough")) === 0,
        "bấm Đột phá ngay khi hộp vừa mở (click ma): bị bỏ qua, hộp vẫn mở",
      );
      // xác nhận: đúng MỘT (hộp đang mở từ bước trên; chờ ĐÃ QUA cửa sổ rồi mới bấm: ngủ dài hơn cửa sổ chỉ an toàn hơn trên runner chậm)
      await sleep(600);
      const yes2 = await center("#act-btn-yes");
      await tap(yes2.x, yes2.y);
      await sleep(200);
      check(
        !(await box()).open && (await sentCount("breakthrough")) === 1,
        "xác nhận sau cửa sổ chống click ma: đúng MỘT breakthrough",
      );

      console.log("  [3] bàn phím: phím tắt V, Y / X / Esc");
      await evalJs(`window.__sent.length = 0`);
      await setMe(true);
      await press2("v", "KeyV");
      await sleep(150);
      st = await box();
      check(st.open && st.active === "act-btn-no", `phím V mở hộp, focus ở "Chưa" (${st.active})`);
      await press("Escape");
      await sleep(150);
      check(
        !(await box()).open && (await sentCount("breakthrough")) === 0,
        "Esc = giữ lại: hộp đóng, không gửi",
      );
      await press2("v", "KeyV");
      await sleep(150);
      await press2("x", "KeyX");
      await sleep(150);
      check(!(await box()).open && (await sentCount("breakthrough")) === 0, "X = giữ lại");
      // Y NGAY khi hộp vừa mở: V rồi Y trong CÙNG MỘT lượt JS của trang (keydown tổng hợp, độ trễ ~0 ms) thay vì hai phím CDP cách nhau 80 ms + độ trễ runner
      await evalJs(
        `(() => { const k = (type, key, code) => window.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true })); k("keydown", "v", "KeyV"); k("keyup", "v", "KeyV"); k("keydown", "y", "KeyY"); k("keyup", "y", "KeyY"); return 1; })()`,
      );
      await sleep(100);
      check(
        (await box()).open && (await sentCount("breakthrough")) === 0,
        "Y NGAY khi hộp vừa mở (click ma): bị bỏ qua",
      );
      await sleep(560);
      await press2("y", "KeyY");
      await sleep(200);
      check(
        !(await box()).open && (await sentCount("breakthrough")) === 1,
        "Y sau cửa sổ chống click ma: đúng MỘT breakthrough",
      );

      console.log("  [4] đan hộ đạo, điều kiện đổi giữa chừng, nối lại mạng");
      await evalJs(`window.__sent.length = 0`);
      await setMe(true);
      b = await center("#sk-break");
      await tap(b.x, b.y);
      await sleep(150);
      const plain = (await box()).text;
      await press("Escape");
      await sleep(100);
      await evalJs(`window.__scene.onStatus({ list: [["dao_ho", 600000, 0.15]] })`);
      b = await center("#sk-break");
      await tap(b.x, b.y);
      await sleep(150);
      st = await box();
      const pctOf = (t) => Number((t.match(/thành công (\d+)%/) ?? [])[1]);
      check(
        pctOf(st.text) > pctOf(plain),
        `có đan hộ đạo: xác suất cao hơn (${pctOf(plain)}% -> ${pctOf(st.text)}%)`,
      );
      check(/Đã cộng \d+% từ đan hộ đạo/.test(st.warn), `nhắc phần đan hộ đạo: "${st.warn}"`);
      // điều kiện đổi giữa chừng: hết đầy tu vi
      await sleep(560);
      await evalJs(`window.__scene.me().exp = 10`);
      const yes3 = await center("#act-btn-yes");
      await tap(yes3.x, yes3.y);
      await sleep(250);
      const toasts = await evalJs(
        `[...document.querySelectorAll("#toast p")].map((p) => p.textContent)`,
      );
      check(
        !(await box()).open &&
          (await sentCount("breakthrough")) === 0 &&
          toasts.some((t) => t.includes("Điều kiện đột phá vừa đổi")),
        `điều kiện đổi giữa lúc hộp mở: huỷ + thông báo, không gửi (${JSON.stringify(toasts)})`,
      );
      // nối lại mạng đóng hộp
      await setMe(true);
      b = await center("#sk-break");
      await tap(b.x, b.y);
      await sleep(150);
      check((await box()).open, "hộp mở trước khi nối lại");
      await evalJs(`window.__scene.setReconnecting(true)`);
      await sleep(150);
      check(!(await box()).open, "mất kết nối / nối lại: hộp đóng");
      await evalJs(`window.__scene.setReconnecting(false)`);

      // ---- [5] hộp xác nhận mở lúc đang giữ phím đi: nhân vật đứng lại, đóng hộp / nhả phím xong KHÔNG kẹt (A dặn ở #781) ----
      console.log("  [5] giữ D, bấm V mở hộp: đứng lại; Esc; nhả D: không kẹt");
      await evalJs(`(() => {
        const n = window.__craftData.NPC_BY_ID.tho_ren_suong;
        window.__start = { x: n.x, y: n.y + 90 };
        const sc = window.__scene; sc.predX = window.__start.x; sc.predY = window.__start.y; sc.cameras.main.centerOn(sc.predX, sc.predY);
        window.__sent.length = 0;
        return 1;
      })()`);
      await setMe(true);
      const dx = () => evalJs(`window.__scene.predX - window.__start.x`);
      const keyD = (type, extra = {}) =>
        send("Input.dispatchKeyEvent", {
          type,
          key: "d",
          code: "KeyD",
          windowsVirtualKeyCode: 68,
          ...extra,
        });
      await keyD("rawKeyDown");
      await sleep(500);
      const walked = await dx();
      check(walked > 20, `đang giữ D, hộp chưa mở: nhân vật đi (${Math.round(walked)} px)`);
      await press2("v", "KeyV");
      await sleep(150);
      check((await box()).open, "bấm V giữa lúc giữ D: hộp mở");
      const frozenA = await dx();
      await sleep(600);
      const frozenB = await dx();
      check(
        frozenB - frozenA < 2,
        `hộp mở: nhân vật KHÔNG đi tiếp (${Math.round(frozenB - frozenA)} px trong 600 ms)`,
      );
      await press("Escape");
      await sleep(150);
      check(!(await box()).open, "Esc đóng hộp");
      await sleep(300);
      const afterEsc = await dx();
      check(
        afterEsc - frozenB > 10,
        `đóng hộp mà D còn giữ: đi tiếp (${Math.round(afterEsc - frozenB)} px)`,
      );
      await keyD("keyUp");
      await sleep(150);
      const stopA = await dx();
      await sleep(500);
      const stopB = await dx();
      check(
        stopB - stopA < 2,
        `nhả D: dừng, không kẹt phím (${Math.round(stopB - stopA)} px trong 500 ms)`,
      );
      // nhả D TRONG LÚC hộp mở: keyup không bị hộp nuốt, đóng hộp xong nhân vật vẫn đứng
      await keyD("rawKeyDown");
      await sleep(250);
      await press2("v", "KeyV");
      await sleep(150);
      await keyD("keyUp");
      await sleep(100);
      await press("Escape");
      await sleep(150);
      const rel0 = await dx();
      await sleep(500);
      const rel1 = await dx();
      check(
        !(await box()).open && rel1 - rel0 < 2,
        `nhả D lúc hộp đang mở rồi đóng hộp: không kẹt (${Math.round(rel1 - rel0)} px)`,
      );
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
