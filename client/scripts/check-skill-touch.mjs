import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm CỤM CHIÊU CẢM ỨNG (M7.6, #507, docs/THIET_KE_THANH_CHIEU.md mục 5 phương án A) bằng Chrome THẬT giả lập cảm ứng, chế độ `?skills=mock&n=1|2|4` (không cần máy chủ):
// ở 4 khung nhìn (360x640, 390x844, 844x390, 768x1024) và 3 số chiêu, mỗi nút chiêu: hiện (chỉ chiêu đã gắn), >= 56 px, nằm trọn trong màn hình, KHÔNG chồng và cách
// >= 8 px mọi nút / khung khác đang hiện (kể cả ba nút ngữ cảnh ép hiện cùng lúc, khung chat, bản đồ nhỏ, cột HUD); 1-2 chiêu nằm bên TRÁI nút Mục tiêu, 3-4 chiêu nằm
// TRÊN nút Mục tiêu; chạm thật vào nút -> đúng một tin `cast`; ô khoá / trống không có nút. Có thể chụp ảnh: `--shots <thư mục>`.
// Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-skill-touch.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
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
const ALL_VIEWPORTS = [
  { name: "360x640", w: 360, h: 640 },
  { name: "390x844", w: 390, h: 844 },
  { name: "844x390", w: 844, h: 390 },
  { name: "768x1024", w: 768, h: 1024 },
];
// `--only 844x390`: chỉ một khung nhìn (chạy nhanh khi thử đột biến)
const ONLY = argOf("--only", "");
const VIEWPORTS = ALL_VIEWPORTS.filter((v) => !ONLY || v.name === ONLY);
const COUNTS = [1, 2, 4];
// `--scheme dpad`: kiểu điều khiển D-pad (Cài đặt -> Điều khiển di chuyển, khoá `tg_touch_scheme`); mặc định joystick nổi
const SCHEME = argOf("--scheme", "joystick");
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-skill-touch-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
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
  const J = async (expression) => JSON.parse(await evalJs(`JSON.stringify(${expression})`));

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.setItem('tg_touch_scheme','${SCHEME}')}catch(e){}`,
  });
  // Bật giả lập cảm ứng TRƯỚC khi mở trang để (pointer: coarse) đúng ngay từ đầu (như điện thoại thật)
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const open = async (query, vp) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?${query}&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())"))
        break;
    }
    await sleep(1200);
    await evalJs(`(() => { const sc = window.__scene; window.__casts = [];
      const orig = sc.room.send.bind(sc.room);
      sc.room.send = (t, d) => { if (t === "cast") window.__casts.push(d); return orig(t, d); };
      const st = document.createElement('style'); st.textContent = '#btn-pickup[hidden],#btn-talk[hidden],#btn-portal[hidden]{display:grid !important}'; document.head.append(st);
      return 1; })()`);
    await sleep(300);
  };

  /** Mọi phần tử tương tác / khung đang hiện (trừ chính cụm chiêu): hộp để so chồng nhau */
  const others = `(() => {
    const slotsEl = document.getElementById('skill-slots');
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
    const out = [];
    for (const el of document.querySelectorAll('button, [role="button"], a[href], input, select, #chat, #minimap-wrap, #quickbar, #hud-col-left, #hud-col-right')) {
      if (slotsEl.contains(el) || el.contains(slotsEl) || !vis(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && !el.closest('#hud-col-left, #hud-col-right, #chat, #skills, #quickbar')) continue;
      if (el.closest('.modal-box, .sheet, #joyzone, #game')) continue;
      const r = el.getBoundingClientRect();
      out.push({ id: el.id || el.className || el.tagName, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    return out;
  })()`;
  const slotsInfo = `(() => {
    const out = [];
    for (const el of document.querySelectorAll('#skill-slots .sk.slot')) {
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      out.push({ id: el.id, shown: cs.display !== 'none' && r.width > 0, cls: el.className, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    const t = document.getElementById('btn-target').getBoundingClientRect();
    const q = document.getElementById('quickbar').getBoundingClientRect();
    return { slots: out, target: { x: t.x, y: t.y, w: t.width, h: t.height }, quick: { x: q.x, y: q.y, w: q.width, h: q.height }, filled: document.getElementById('skill-slots').getAttribute('data-filled'),
      input: document.documentElement.dataset.input, vw: innerWidth, vh: innerHeight };
  })()`;
  const gap = (a, b) =>
    Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h));
  const shot = async (name) => {
    if (!SHOTS) return;
    const png = await send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(png.result.data, "base64"));
  };

  for (const vp of VIEWPORTS) {
    for (const n of COUNTS) {
      console.log(`--- ${vp.name}, ${n} chiêu (?skills=mock&n=${n}), điều khiển ${SCHEME} ---`);
      await open(`skills=mock&n=${n}`, vp);
      const info = await J(slotsInfo);
      const shown = info.slots.filter((s) => s.shown);
      check(info.input === "touch", `chế độ cảm ứng (data-input=${info.input})`);
      check(
        shown.length === n,
        `chỉ hiện chiêu đã gắn: ${shown.length} nút (mong ${n}; ô khoá / trống không có nút)`,
      );
      check(String(info.filled) === String(n), `data-filled = ${info.filled}`);
      check(
        shown.every((s) => s.w >= 56 && s.h >= 56),
        `mỗi nút >= 56 x 56 (${shown.map((s) => `${Math.round(s.w)}x${Math.round(s.h)}`).join(", ")})`,
      );
      check(
        shown.every((s) => s.x >= 0 && s.y >= 0 && s.x + s.w <= info.vw && s.y + s.h <= info.vh),
        "nằm trọn trong màn hình",
      );
      // vị trí: dọc / máy tính bảng = khối dính mép phải, ngay TRÊN nút Mục tiêu, ô 2 sát nút (dưới-phải); điện thoại NGANG (trên nút Mục tiêu là hàng nút menu +
      // bản đồ nhỏ) = bên trái cột nút ngữ cảnh, trên thanh đan dược
      const t = info.target;
      const phoneLandscape = vp.w > vp.h && vp.h < 520;
      if (phoneLandscape) {
        check(
          shown.every((s) => s.x + s.w <= t.x - 8 && s.y + s.h <= info.quick.y - 8 + 0.5),
          "điện thoại ngang: bên trái nút Mục tiêu và TRÊN thanh đan dược (cách >= 8 px)",
        );
      } else if (SCHEME === "dpad") {
        check(
          shown.every((s) => s.x + s.w <= t.x - 8 + 0.5 && s.y + s.h <= info.quick.y - 8 + 0.5),
          "D-pad dọc: bên trái cột nút ngữ cảnh (trên nút Mục tiêu) và TRÊN thanh đan dược (cách >= 8 px)",
        );
      } else {
        const bottomRight = shown.find((s) => s.id === "sk-slot2");
        check(
          shown.every((s) => s.y + s.h <= t.y - 8 + 0.5) &&
            (!bottomRight || Math.abs(bottomRight.x + bottomRight.w - (t.x + t.w)) <= 1),
          "khối nằm TRÊN nút Mục tiêu (cách >= 8 px), ô 2 ở góc dưới-phải thẳng cột với nút Mục tiêu",
        );
      }
      // không chồng + cách >= 8 px mọi thứ khác đang hiện
      const oth = await J(others);
      const bad = [];
      for (const s of shown)
        for (const o of oth)
          if (gap(s, o) < 8) bad.push(`${s.id} ~ ${o.id} (khoảng ${Math.round(gap(s, o))})`);
      // khe giữa các nút chiêu với nhau
      for (let i = 0; i < shown.length; i++)
        for (let j = i + 1; j < shown.length; j++)
          if (gap(shown[i], shown[j]) < 8) bad.push(`${shown[i].id} ~ ${shown[j].id}`);
      check(
        bad.length === 0,
        `không chồng, cách >= 8 px mọi nút / khung khác${bad.length ? ": " + bad.slice(0, 5).join("; ") : ""}`,
      );
      await shot(`cam-ung-${vp.name}-n${n}${SCHEME === "joystick" ? "" : "-" + SCHEME}`);
      // chạm thật vào nút đầu tiên -> một tin cast
      const first = shown[0];
      if (first) {
        const cx = first.x + first.w / 2;
        const cy = first.y + first.h / 2;
        await evalJs("window.__casts.length = 0; 1");
        await send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ id: 1, x: cx, y: cy }],
        });
        await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(200);
        const casts = await J("window.__casts");
        // ô 2 của mock đang hồi chiêu 3 s lúc mở: chờ hết rồi chạm lại nếu chưa có cast
        let got = casts;
        if (got.length === 0) {
          await sleep(3300);
          await send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ id: 1, x: cx, y: cy }],
          });
          await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await sleep(200);
          got = await J("window.__casts");
        }
        check(
          got.length === 1 && got[0].slot >= 2 && got[0].slot <= 5,
          `chạm thật: đúng 1 tin cast ${JSON.stringify(got)}`,
        );
      }
    }
  }
  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  ws.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
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
