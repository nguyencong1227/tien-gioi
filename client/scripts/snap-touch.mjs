/* global console, setTimeout, fetch, Buffer, process */
// Kiểm điều khiển cảm ứng (M5.1 #327) trong Chrome thật bằng CHẠM THẬT nhiều điểm (CDP Input.dispatchTouchEvent).
// Cần client đang chạy (npm run dev -w client). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/snap-touch.mjs [--url http://127.0.0.1:5183] [--out docs/screenshots] [--no-shot]
// Khẳng định: joystick chỉ hiện khi data-input="touch"; mục tiêu chạm >= 44 (nút kỹ năng >= 56) và khoảng cách >= 8,
// không nút nào chồng nhau (kể cả ba nút ngữ cảnh hiện cùng lúc); đa chạm (joystick + hai nút cùng lúc);
// trình đơn nhấn giữ bị chặn trên vùng điều khiển nhưng không trên ô nhập chữ; máy lai đổi theo lần nhập gần nhất.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const BASE_URL = arg("url", "http://127.0.0.1:5183");
const OUT_DIR = path.resolve(REPO, arg("out", "docs/screenshots"));
const NO_SHOT = process.argv.includes("--no-shot");
// Mật độ điểm ảnh giả lập (1 / 2 / 3): kiểm điều khiển cảm ứng vẫn đúng khi canvas lớn gấp renderScale lần (#324)
const DPR = Number(arg("dpr", "1"));

const VIEWPORTS = [
  { name: "390x844", w: 390, h: 844 },
  { name: "844x390", w: 844, h: 390 },
];
const CDP_PORT = 39300 + Math.floor(Math.random() * 400);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-snap-touch-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
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
  for (let i = 0; i < 40; i++) {
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
  const J = async (expression) => JSON.parse(await evalJs(`JSON.stringify(${expression})`));

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "try{localStorage.setItem('tg_newbie_guide_dismissed','1')}catch(e){}",
  });
  // Bật giả lập cảm ứng TRƯỚC khi mở trang để (pointer: coarse) đúng ngay từ đầu (như điện thoại thật)
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  if (!NO_SHOT) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Điểm chạm đang giữ: id -> {x, y}. CDP cần danh sách TẤT CẢ điểm đang chạm ở mỗi sự kiện.
  const touches = new Map();
  const dispatch = async (type) =>
    send("Input.dispatchTouchEvent", {
      type,
      touchPoints: [...touches].map(([id, p]) => ({ id, x: p.x, y: p.y })),
    });
  const touchDown = async (id, x, y) => {
    touches.set(id, { x, y });
    await dispatch("touchStart");
  };
  const touchMove = async (id, x, y) => {
    touches.set(id, { x, y });
    await dispatch("touchMove");
  };
  const touchUp = async (id) => {
    touches.delete(id);
    await dispatch("touchEnd");
  };
  const center = async (sel) => {
    const r = await J(
      `(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
    );
    return r;
  };

  for (const vp of VIEWPORTS) {
    console.log(`\\n=== ${vp.name} (DPR ${DPR}) ===`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: DPR,
      mobile: true,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      if (await evalJs("Boolean(window.__ui && window.__scene)")) {
        ready = true;
        break;
      }
    }
    if (!ready)
      throw new Error("Client mock không khởi động kịp (client có chạy ở " + BASE_URL + "?).");
    await evalJs(
      "document.querySelectorAll('.duel-mock-badge,.dungeon-mock-badge').forEach((e) => e.remove());0",
    );
    await sleep(500);

    // --- 1) Hiển thị theo data-input ---
    const d = await J(`({
      input: document.documentElement.dataset.input,
      joy: getComputedStyle(document.getElementById("joyzone")).display,
      help: getComputedStyle(document.getElementById("help")).display,
    })`);
    check(d.input === "touch", `data-input="touch" khi mở trang bằng cảm ứng (${d.input})`);
    check(d.joy === "block", `joystick hiện (${d.joy})`);
    check(d.help === "none", `gợi ý phím ẩn (${d.help})`);

    // --- 2) Mục tiêu chạm + khoảng cách + không chồng nhau (ép hiện cả ba nút ngữ cảnh) ---
    // Cảnh ẩn lại các nút này mỗi khung khi không có NPC / đồ rơi / cổng gần: ép hiện bằng CSS để đo bố cục
    await evalJs(
      "(() => { const st = document.createElement('style'); st.id = 'force-ctx'; st.textContent = '#btn-pickup[hidden],#btn-talk[hidden],#btn-portal[hidden]{display:grid !important}'; document.head.append(st); })();0",
    );
    await sleep(150);
    const ctl = await J(`(() => {
      const sel = ['#sk-break','#sk-med','#sk-sword','#sk-slash','#quick-1','#quick-2','#btn-pickup','#btn-talk','#btn-portal'];
      return sel.map((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { s, x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; });
    })()`);
    for (const c of ctl) {
      const min = c.s.startsWith("#sk-") ? 56 : 44;
      check(
        c.w >= min && c.h >= min,
        `${c.s} >= ${min}x${min} (${Math.round(c.w)}x${Math.round(c.h)})`,
      );
      check(c.x >= 0 && c.y >= 0 && c.r <= vp.w && c.b <= vp.h, `${c.s} nằm trong màn hình`);
    }
    let worstGap = Infinity;
    let worstPair = "";
    for (let i = 0; i < ctl.length; i++) {
      for (let j = i + 1; j < ctl.length; j++) {
        const a = ctl[i];
        const b = ctl[j];
        const gx = Math.max(a.x - b.r, b.x - a.r);
        const gy = Math.max(a.y - b.b, b.y - a.b);
        const gap = Math.max(gx, gy); // < 0 nghĩa là chồng nhau
        if (gap < worstGap) {
          worstGap = gap;
          worstPair = `${a.s} / ${b.s}`;
        }
      }
    }
    check(
      worstGap >= 8,
      `khoảng cách nhỏ nhất giữa các nút >= 8 px (${Math.round(worstGap)} px: ${worstPair})`,
    );
    if (!NO_SHOT) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(OUT_DIR, `touch-controls-${vp.name}.png`),
        Buffer.from(shot.result.data, "base64"),
      );
      console.log(`  ✓ ảnh touch-controls-${vp.name}.png`);
    }
    await evalJs("document.getElementById('force-ctx').remove();0");

    // --- 3) Đa chạm: joystick (ngón 1) + Chém (ngón 2) + Kiếm khí (ngón 3) cùng lúc ---
    await evalJs(
      "window.__n = { slash: 0, sword: 0 }; window.__scene.slash = () => { window.__n.slash++ }; window.__scene.sword = () => { window.__n.sword++ };0",
    );
    const jx = Math.round(vp.w * 0.1);
    const jy = Math.round(vp.h * 0.85);
    const under = await evalJs(`document.elementFromPoint(${jx}, ${jy})?.id`);
    check(
      under === "joyzone",
      `điểm đặt ngón cái (góc dưới trái) thuộc vùng joystick, không bị HUD che (${under})`,
    );
    await touchDown(1, jx, jy);
    await touchMove(1, jx + 40, jy - 30);
    let j = await J(
      `({ on: document.querySelector(".joy-base").classList.contains("on"), knob: document.querySelector(".joy-knob").style.transform })`,
    );
    check(j.on && j.knob.includes("translate"), `ngón 1 kéo joystick (${j.knob})`);
    const slash = await center("#sk-slash");
    const sword = await center("#sk-sword");
    await touchDown(2, slash.x, slash.y);
    await touchUp(2);
    await touchDown(3, sword.x, sword.y);
    await touchMove(1, jx + 50, jy - 10); // ngón 1 vẫn kéo được khi ngón 3 đang giữ
    j = await J(
      `({ on: document.querySelector(".joy-base").classList.contains("on"), knob: document.querySelector(".joy-knob").style.transform })`,
    );
    check(j.on, "joystick vẫn đang kéo khi bấm Chém / Kiếm khí bằng ngón khác");
    await touchUp(3);
    const n = await J("window.__n");
    check(n.slash === 1, `Chém được gọi đúng 1 lần khi đang kéo joystick (${n.slash})`);
    check(n.sword === 1, `Kiếm khí được gọi đúng 1 lần khi đang kéo joystick (${n.sword})`);
    await touchUp(1);
    j = await J(
      `({ on: document.querySelector(".joy-base").classList.contains("on"), knob: document.querySelector(".joy-knob").style.transform })`,
    );
    check(!j.on && j.knob === "", "thả ngón 1: joystick về trạng thái nghỉ");

    // --- 4) Phóng to hai ngón / chạm đúp không đổi tỉ lệ trang ---
    const s0 = await evalJs("visualViewport.scale");
    await touchDown(1, vp.w * 0.45, vp.h * 0.3);
    await touchDown(2, vp.w * 0.55, vp.h * 0.3);
    await touchMove(1, vp.w * 0.3, vp.h * 0.3);
    await touchMove(2, vp.w * 0.7, vp.h * 0.3);
    await touchUp(2);
    await touchUp(1);
    for (let k = 0; k < 2; k++) {
      await touchDown(1, vp.w * 0.5, vp.h * 0.3);
      await touchUp(1);
      await sleep(60);
    }
    await sleep(200);
    const s1 = await evalJs("visualViewport.scale");
    check(
      s0 === 1 && s1 === 1,
      `tỉ lệ trang giữ nguyên sau phóng to hai ngón + chạm đúp (${s0} -> ${s1})`,
    );

    // --- 5) Trình đơn nhấn giữ ---
    const cm = await J(`(() => {
      const fire = (sel) => document.querySelector(sel).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      // dispatchEvent trả về false khi sự kiện bị preventDefault
      return { skill: fire("#sk-slash"), joy: fire("#joyzone"), chat: fire("#chat-input") };
    })()`);
    check(
      cm.skill === false && cm.joy === false,
      "nhấn giữ nút kỹ năng / vùng joystick: trình đơn bị chặn",
    );
    check(cm.chat === true, "nhấn giữ trong ô chat: trình đơn vẫn mở được (không chặn ô nhập chữ)");

    // --- 6) Máy lai: chuột làm joystick ẩn, chạm làm hiện lại ---
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: vp.w / 2,
      y: vp.h / 2,
      button: "left",
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: vp.w / 2,
      y: vp.h / 2,
      button: "left",
      clickCount: 1,
    });
    await sleep(200);
    let h = await J(
      `({ input: document.documentElement.dataset.input, joy: getComputedStyle(document.getElementById("joyzone")).display, help: getComputedStyle(document.getElementById("help")).display })`,
    );
    check(
      h.input === "mouse" && h.joy === "none",
      `bấm chuột: data-input=mouse, joystick ẩn (${h.input} / ${h.joy})`,
    );
    await touchDown(1, vp.w / 2, vp.h / 2);
    await touchUp(1);
    await sleep(200);
    h = await J(
      `({ input: document.documentElement.dataset.input, joy: getComputedStyle(document.getElementById("joyzone")).display })`,
    );
    check(
      h.input === "touch" && h.joy === "block",
      `chạm lại: data-input=touch, joystick hiện (${h.input} / ${h.joy})`,
    );
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
