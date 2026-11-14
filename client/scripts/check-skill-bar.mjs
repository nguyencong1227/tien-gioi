import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm thanh chiêu thức L U I O (M7.6, #507) bằng Chrome THẬT qua CDP ở chế độ giả lập `?skills=mock` (KHÔNG cần máy chủ): phím L U I O và chạm nút -> đúng số tin
// `cast`; ô hồi chiêu / thiếu linh lực / choáng / khoá / trống KHÔNG gửi; lớp trạng thái `k-*` đúng; vòng quét + số giây đếm lùi; hướng đánh theo con trỏ (chuột trong
// canvas) / theo hình chiêu; đổi số chiêu và cảnh giới (`?n=`, `?realm=`). Có thể chụp ảnh: `--shots <thư mục>`.
// Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-skill-bar.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = argOf("--url", "http://127.0.0.1:5183");
const SHOTS = argOf("--shots", "");
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-skill-bar-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    // Chrome không đầu không có chuột: `pointer: fine` = false thì thanh chiêu (CSS chỉ cho máy tính) bị ẩn; giả lập chuột (4 = fine, 2 = hover)
    "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
    ...getChromeGpuFlags(),
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpDir}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
try {
  let targets = [];
  for (let k = 0; k < 40; k++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        targets = await res.json();
        break;
      }
    } catch {
      await sleep(150);
    }
  }
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("Không tìm thấy Chrome page target.");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let nextId = 1;
  const pending = new Map();
  let pageErrors = 0;
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === "Runtime.exceptionThrown") pageErrors++;
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

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high')}catch(e){}",
  });

  /** Mở trang mock (`query` = phần sau `?`), chờ cảnh có người chơi và đã nhận `skills` (mock gửi sau ~400 ms), đếm tin `cast`. */
  const open = async (query, w = 1280, h = 720) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?${query}&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())"))
        break;
    }
    await sleep(900);
    await evalJs(`(() => { const sc = window.__scene; window.__casts = [];
      const orig = sc.room.send.bind(sc.room);
      sc.room.send = (t, d) => { if (t === "cast") window.__casts.push(d); return orig(t, d); };
      sc.cameras.main.centerOn(sc.predX, sc.predY); return 1; })()`);
  };
  const slot = (n) =>
    evalJs(`(() => { const e = document.getElementById('sk-slot${n}'); return JSON.stringify({
      cls: e.className, aria: e.getAttribute('aria-label'), dis: e.getAttribute('aria-disabled'),
      cdn: e.querySelector('.cdn').textContent, nm: e.querySelector('.nm').textContent,
      cd: e.querySelector('.cdv').style.getPropertyValue('--cd'), ico: e.querySelector('.ico').innerHTML.length,
      vis: getComputedStyle(document.getElementById('skill-slots')).display }); })()`).then(
      JSON.parse,
    );
  const casts = () => evalJs("JSON.stringify(window.__casts)").then(JSON.parse);
  const clearCasts = () => evalJs("window.__casts.length = 0; 1");
  const toastText = () => evalJs("document.getElementById('toast').textContent");
  const KEYS = { 2: ["KeyL", 76], 3: ["KeyU", 85], 4: ["KeyI", 73], 5: ["KeyO", 79] };
  const press = async (n) => {
    const [code, vk] = KEYS[n];
    const base = {
      code,
      key: code.slice(3).toLowerCase(),
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
    };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(120);
  };
  const clickEl = async (id) => {
    const r = JSON.parse(
      await evalJs(
        `(() => { const b = document.getElementById('${id}').getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); })()`,
      ),
    );
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: r.x,
      y: r.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
      pointerType: "mouse",
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: r.x,
      y: r.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
      pointerType: "mouse",
    });
    await sleep(120);
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    const r = JSON.parse(
      await evalJs(
        `(() => { const a = document.getElementById('skills').getBoundingClientRect(), g = document.getElementById('skill-slots').getBoundingClientRect(); const x0 = Math.max(0, Math.min(a.x, g.x) - 20), y0 = Math.max(0, Math.min(a.y, g.y) - 20); return JSON.stringify({ x: x0, y: y0, w: Math.max(a.right, g.right) + 20 - x0, h: a.bottom + 20 - y0 }); })()`,
      ),
    );
    const png = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 2 },
    });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(png.result.data, "base64"));
  };

  // ---------------------------------------------------------------- 4 chiêu, Nguyên Anh
  console.log("--- 4 chiêu (?skills=mock&n=4): trạng thái ban đầu ---");
  await open("skills=mock&n=4");
  let s = [2, 3, 4, 5].map(() => null);
  for (let i = 0; i < 4; i++) s[i] = await slot(i + 2);
  check(s[0].vis === "flex", `thanh hiện ở máy tính (display ${s[0].vis})`);
  check(
    s[0].cls.includes("k-cooldown") && s[0].cdn !== "",
    `ô 2 đang hồi chiêu (lớp ${s[0].cls}, số giây "${s[0].cdn}")`,
  );
  check(
    [1, 2, 3].every((i) => s[i].cls === "sk slot k-ready" && s[i].dis === "false"),
    `ô 3-5 sẵn sàng: ${[1, 2, 3].map((i) => s[i].cls).join(" | ")}`,
  );
  check(
    s[1].aria.includes("tầng") && s[1].aria.includes("sẵn sàng") && s[1].aria.includes("(Phím U)"),
    `aria ô 3: ${s[1].aria}`,
  );
  check(
    s.every((x) => x.ico > 50 && x.nm.length > 0),
    "mỗi ô có biểu tượng và tên viết tắt",
  );
  await shot("n4-ban-dau");

  console.log("--- phím L (ô đang hồi chiêu) KHÔNG gửi; phím U gửi đúng 1 cast ---");
  await clearCasts();
  await press(2);
  check((await casts()).length === 0, "L khi hồi chiêu: 0 tin cast");
  await press(3);
  let c = await casts();
  check(
    c.length === 1 && c[0].slot === 3 && Number.isFinite(c[0].angle),
    `U: 1 cast ${JSON.stringify(c)}`,
  );
  await sleep(300);
  s[1] = await slot(3);
  check(
    s[1].cls.includes("k-cooldown") && s[1].cdn !== "" && Number(s[1].cd) > 0.5,
    `sau cast ô 3 hồi chiêu (số ${s[1].cdn}, vòng quét ${s[1].cd})`,
  );
  await press(3);
  check((await casts()).length === 1, "U lần nữa trong lúc hồi chiêu: vẫn 1 tin");
  await shot("n4-hoi-chieu");

  console.log("--- vòng quét + số giây đếm lùi, hết hồi chiêu thì sẵn sàng lại ---");
  const s0 = await slot(2);
  await sleep(3000);
  const s1 = await slot(2);
  check(
    s1.cls === "sk slot k-ready" && s1.cdn === "",
    `ô 2 hết hồi chiêu (${s0.cdn}s -> ${s1.cls})`,
  );

  console.log("--- chạm / bấm chuột vào nút ---");
  await clearCasts();
  await clickEl("sk-slot4");
  c = await casts();
  check(c.length === 1 && c[0].slot === 4, `bấm ô 4: ${JSON.stringify(c)}`);

  console.log("--- hướng đánh theo con trỏ (chuột trong canvas) ---");
  await sleep(600);
  const centre = JSON.parse(
    await evalJs(`(() => { const sc = window.__scene; const cam = sc.cameras.main; const cv = sc.game.canvas.getBoundingClientRect();
    const v = cam.worldView;
    const p = { x: (sc.predX - v.x) * cam.zoom, y: (sc.predY - v.y) * cam.zoom };
    const sx = cv.width / cam.width, sy = cv.height / cam.height;
    return JSON.stringify({ x: cv.x + p.x * sx, y: cv.y + p.y * sy }); })()`),
  );
  /** Chờ ô `n` sẵn sàng (tối đa 9 s) */
  const waitReady = async (n) => {
    for (let k = 0; k < 45; k++) {
      if ((await slot(n)).cls === "sk slot k-ready") return true;
      await sleep(200);
    }
    return false;
  };
  const aimAt = async (n, dx, dy) => {
    await waitReady(n);
    await clearCasts();
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: centre.x + dx,
      y: centre.y + dy,
      pointerType: "mouse",
    });
    await sleep(100);
    await press(n);
    const cs = await casts();
    return cs[0]?.angle;
  };
  const aRight = await aimAt(5, 200, 0);
  check(
    aRight !== undefined && Math.abs(aRight) < 0.15,
    `con trỏ bên phải -> góc ~0 (được ${aRight})`,
  );
  const aDown = await aimAt(3, 0, 200);
  check(
    aDown !== undefined && Math.abs(aDown - Math.PI / 2) < 0.15,
    `con trỏ bên dưới -> góc ~pi/2 (được ${aDown})`,
  );
  // con trỏ rời canvas sang nút HUD (pointerleave): KHÔNG theo con trỏ nữa, quay về hướng nhìn (= lần đánh trước, pi/2)
  const bag = JSON.parse(
    await evalJs(
      `(() => { const b = document.getElementById('btn-bag').getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); })()`,
    ),
  );
  await waitReady(4);
  await clearCasts();
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: bag.x,
    y: bag.y,
    pointerType: "mouse",
  });
  await sleep(100);
  await press(4);
  const aOut = (await casts())[0]?.angle;
  check(
    aOut !== undefined && Math.abs(aOut - Math.PI / 2) < 0.15,
    `con trỏ ở nút HUD (ngoài canvas) -> hướng nhìn pi/2, không theo con trỏ (được ${aOut})`,
  );

  // ---------------------------------------------------------------- choáng
  console.log("--- choáng: cả thanh xám, KHÔNG gửi ---");
  await open("skills=mock&n=4");
  await sleep(3300); // ô 2 hết hồi chiêu
  await evalJs(`window.__scene.room.emit("status", { list: [["stun", 2500]] }); 1`);
  await sleep(250);
  s = [await slot(2), await slot(3), await slot(4), await slot(5)];
  check(
    s.every((x) => x.cls === "sk slot k-stunned"),
    `4 ô choáng: ${s.map((x) => x.cls).join(" | ")}`,
  );
  await clearCasts();
  await press(3);
  check((await casts()).length === 0, "U khi choáng: 0 tin cast");
  await shot("n4-choang");
  await sleep(2600);
  check((await slot(3)).cls === "sk slot k-ready", "hết choáng: sẵn sàng lại");

  // ---------------------------------------------------------------- thiếu linh lực
  console.log("--- thiếu linh lực: ô tối, KHÔNG gửi, báo 'Linh lực không đủ' ---");
  await evalJs("window.__scene.me().mp = 1; 1");
  await sleep(250);
  check((await slot(3)).cls === "sk slot k-noMp", `ô 3: ${(await slot(3)).cls}`);
  await clearCasts();
  await press(3);
  check((await casts()).length === 0, "U khi thiếu linh lực: 0 tin cast");
  check(String(await toastText()).includes("Linh lực không đủ"), `toast: ${await toastText()}`);
  await shot("n4-thieu-linh-luc");
  await evalJs("window.__scene.me().mp = 1200; 1");
  await sleep(250);
  check((await slot(3)).cls === "sk slot k-ready", "đủ linh lực lại: sẵn sàng");

  // ---------------------------------------------------------------- 2 chiêu: ô 4, 5 khoá
  console.log("--- 2 chiêu, Trúc Cơ (?n=2): ô 4, 5 khoá ---");
  await open("skills=mock&n=2");
  await sleep(3300);
  s = [await slot(2), await slot(3), await slot(4), await slot(5)];
  check(
    s[2].cls === "sk slot k-locked" && s[3].cls === "sk slot k-locked",
    `ô 4, 5: ${s[2].cls} | ${s[3].cls}`,
  );
  check(
    s[2].aria.includes("mở ở kim đan") && s[3].aria.includes("mở ở nguyên anh"),
    `aria ô 4: ${s[2].aria}`,
  );
  check(s[2].dis === "true", "ô khoá aria-disabled");
  await clearCasts();
  await press(4);
  check(
    (await casts()).length === 0 && String(await toastText()).includes("chưa mở"),
    `I (ô khoá): 0 cast, toast "${await toastText()}"`,
  );
  await shot("n2-khoa");

  // ---------------------------------------------------------------- 0 chiêu: ô 2, 3 trống
  console.log("--- chưa có chiêu (?n=0): ô 2, 3 trống ---");
  await open("skills=mock&n=0");
  s = [await slot(2), await slot(3)];
  check(
    s.every((x) => x.cls === "sk slot k-empty"),
    `ô 2, 3: ${s.map((x) => x.cls).join(" | ")}`,
  );
  await clearCasts();
  await press(2);
  check(
    (await casts()).length === 0 && String(await toastText()).includes("còn trống"),
    `L (ô trống): 0 cast, toast "${await toastText()}"`,
  );
  await shot("n0-trong");

  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  ws.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  // Chờ Chrome thoát hẳn rồi mới xoá thư mục hồ sơ (xoá khi còn ghi thì để lại rác trong /tmp)
  const exited = new Promise((res) => chrome.once("exit", res));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* bỏ qua */
  }
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
process.exit(failures === 0 ? 0 : 1);
