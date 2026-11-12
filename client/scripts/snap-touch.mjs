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
    await sleep(60); // pointermove được gom theo khung hình: chờ trang xử lý xong rồi mới đọc kết quả
  };
  // CDP: touchEnd KHÔNG được kèm điểm chạm và nhả TẤT CẢ; muốn nhả một ngón khi còn ngón khác thì gửi touchMove chỉ còn các
  // ngón đang giữ (điểm nào biến mất khỏi danh sách coi là đã nhả). (Bản đầu gửi touchEnd kèm ngón còn lại: nhả nhầm ngón 1.)
  const touchUp = async (id) => {
    touches.delete(id);
    await dispatch(touches.size ? "touchMove" : "touchEnd");
    await sleep(40);
  };
  const center = async (sel) => {
    const r = await J(
      `(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
    );
    return r;
  };

  // Khoảng cách nhỏ nhất giữa mọi cặp hộp (< 0 nghĩa là chồng nhau)
  const minGap = (list) => {
    let worst = Infinity;
    let pair = "";
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const gap = Math.max(Math.max(a.x - b.r, b.x - a.r), Math.max(a.y - b.b, b.y - a.b));
        if (gap < worst) {
          worst = gap;
          pair = `${a.s} / ${b.s}`;
        }
      }
    }
    return { worst, pair };
  };
  const rectsOf = (sels) =>
    J(
      `(() => ${JSON.stringify(sels)}.map((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { s, x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; }))()`,
    );

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

    // --- 2b) Vùng joystick không bị thân bảng HUD nuốt chạm (#326; phát hiện ở điện thoại ngang: chạm vào thân bảng Nhiệm vụ không bắt đầu được joystick) ---
    // Mọi điểm lưới trong vùng joystick mà bị phần tử khác che phải thuộc một phần tử TƯƠNG TÁC (nút, mục nhiệm vụ...); thân bảng thì không
    const blockers = await J(`(() => {
      const z = document.getElementById("joyzone").getBoundingClientRect();
      const bad = {}; let total = 0, blocked = 0, badN = 0;
      for (let x = z.left + 8; x < z.right; x += 16)
        for (let y = z.top + 8; y < z.bottom; y += 16) {
          total++;
          const el = document.elementFromPoint(x, y);
          if (!el || el.id === "joyzone") continue;
          blocked++;
          if (!el.closest("button, .qt-item, a, input, select, textarea, [role=button]")) {
            badN++;
            const k = el.closest("[id]")?.id || el.tagName;
            bad[k] = (bad[k] || 0) + 1;
          }
        }
      return { total, blocked, badN, bad };
    })()`);
    check(
      blockers.badN === 0,
      `vùng joystick: ${blockers.total} điểm lưới, ${blockers.blocked} bị che toàn bởi nút / mục tương tác, ${blockers.badN} bị thân bảng KHÔNG tương tác nuốt chạm ${JSON.stringify(blockers.bad)}`,
    );
    // Chạm thật vào thân bảng HUD nằm trong vùng joystick (giao của #hud / #quest-tracker / #party-panel với vùng joystick) phải bắt đầu được joystick
    const overlap = await J(`(() => {
      const z = document.getElementById("joyzone").getBoundingClientRect();
      for (const id of ["quest-tracker", "hud", "party-panel"]) {
        const e = document.getElementById(id);
        if (!e || e.hidden || getComputedStyle(e).display === "none") continue;
        const b = e.getBoundingClientRect();
        const x0 = Math.max(b.left, z.left), x1 = Math.min(b.right, z.right), y0 = Math.max(b.top, z.top), y1 = Math.min(b.bottom, z.bottom);
        if (x1 - x0 < 24 || y1 - y0 < 24) continue;
        // điểm trong giao mà KHÔNG nằm trên nút / mục tương tác
        for (let y = y0 + 6; y < y1 - 6; y += 6) for (let x = x0 + 6; x < x1 - 6; x += 6) {
          const el = document.elementFromPoint(x, y);
          if (el && !el.closest("button, .qt-item, a, input, select, textarea, [role=button]")) return { id, x: Math.round(x), y: Math.round(y) };
        }
      }
      return null;
    })()`);
    if (overlap) {
      await touchDown(9, overlap.x, overlap.y);
      await touchMove(9, overlap.x + 40, overlap.y - 30);
      const jb = await J(
        `({ on: document.querySelector(".joy-base").classList.contains("on"), knob: document.querySelector(".joy-knob").style.transform })`,
      );
      check(
        jb.on && jb.knob.includes("translate"),
        `chạm vào thân #${overlap.id} (${overlap.x}, ${overlap.y}) trong vùng joystick vẫn khởi động joystick (${jb.knob})`,
      );
      await touchUp(9);
    } else {
      console.log("  (không có thân bảng HUD giao với vùng joystick ở khung này)");
    }
    // Nút HUD vẫn bắt chạm (không bị pointer-events: none lây sang)
    const btnHit = await J(`(() => {
      const out = {};
      for (const id of ["btn-bag", "btn-char", "btn-quest"]) {
        const b = document.getElementById(id); if (!b) continue;
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        out[id] = Boolean(el && el.closest("button") === b);
      }
      return out;
    })()`);
    check(
      Object.values(btnHit).length > 0 && Object.values(btnHit).every(Boolean),
      `nút HUD vẫn bắt chạm giữa các thân bảng trong suốt (${JSON.stringify(btnHit)})`,
    );

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

    // --- 3b) Nút hướng cố định (D-pad): chọn trong Cài đặt như người chơi thật ---
    await evalJs("window.__ui.toggleSettingsModal(true);0");
    await sleep(200);
    const sel = await J(
      `(() => ["set-quality", "set-touch-scheme"].map((id) => { const el = document.getElementById(id); const b = el.getBoundingClientRect(); return { id, h: b.height, bg: getComputedStyle(el).backgroundColor }; }))()`,
    );
    for (const c of sel) {
      check(c.h >= 44, `ô chọn #${c.id} cao >= 44 px (${Math.round(c.h)} px)`);
      check(
        c.bg !== "rgb(255, 255, 255)",
        `ô chọn #${c.id} theo tông tối, không nền trắng mặc định (${c.bg})`,
      );
    }
    const rowShown = await evalJs(
      "getComputedStyle(document.getElementById('set-touch-row')).display !== 'none'",
    );
    check(rowShown === true, "Cài đặt có hàng 'Điều khiển di chuyển' khi dùng cảm ứng");
    await evalJs(
      "(() => { const sel = document.getElementById('set-touch-scheme'); sel.value = 'dpad'; sel.dispatchEvent(new Event('change')); })();0",
    );
    await evalJs("window.__ui.toggleSettingsModal(false);0");
    await sleep(300);
    let dp = await J(`({
      scheme: document.documentElement.dataset.touchScheme,
      stored: localStorage.getItem("tg_touch_scheme"),
      joy: getComputedStyle(document.getElementById("joyzone")).display,
      pad: getComputedStyle(document.getElementById("dpad")).display,
    })`);
    check(
      dp.scheme === "dpad" && dp.stored === "dpad",
      `chọn D-pad: data-touch-scheme + lưu tg_touch_scheme (${dp.scheme} / ${dp.stored})`,
    );
    check(
      dp.joy === "none" && dp.pad === "block",
      `D-pad hiện, joystick nổi ẩn (${dp.pad} / ${dp.joy})`,
    );
    const pad = await center("#dpad");
    const padBox = await J(
      `(() => { const b = document.getElementById("dpad").getBoundingClientRect(); return { w: b.width, h: b.height, x: b.x, y: b.y, r: b.right, b: b.bottom }; })()`,
    );
    check(
      padBox.w >= 120 && padBox.h >= 120,
      `D-pad đủ lớn (${Math.round(padBox.w)}x${Math.round(padBox.h)})`,
    );
    const padTop = await evalJs(`document.elementFromPoint(${pad.x}, ${pad.y})?.id`);
    check(padTop === "dpad", `tâm D-pad không bị HUD che (${padTop})`);
    // Ép hiện ba nút ngữ cảnh (cảnh ẩn lại mỗi khung nếu không có NPC / đồ rơi / cổng gần) để đo chồng nhau cả khi hiện cùng lúc
    await evalJs(
      "(() => { const st = document.createElement('style'); st.id = 'force-ctx2'; st.textContent = '#btn-pickup[hidden],#btn-talk[hidden],#btn-portal[hidden]{display:grid !important}'; document.head.append(st); })();0",
    );
    await sleep(150);
    const ctl2 = await rectsOf([
      "#sk-break",
      "#sk-med",
      "#sk-sword",
      "#sk-slash",
      "#quick-1",
      "#quick-2",
      "#btn-target",
      "#dpad",
      "#btn-pickup",
      "#btn-talk",
      "#btn-portal",
    ]);
    await evalJs("document.getElementById('force-ctx2').remove();0");
    const g2 = minGap(ctl2);
    check(
      g2.worst >= 8,
      `D-pad + nút mục tiêu + cụm kỹ năng: khoảng cách nhỏ nhất >= 8 px (${Math.round(g2.worst)} px: ${g2.pair})`,
    );
    const tgt = ctl2.find((c) => c.s === "#btn-target");
    check(
      tgt.w >= 56 && tgt.h >= 56,
      `nút khoá mục tiêu >= 56x56 (${Math.round(tgt.w)}x${Math.round(tgt.h)})`,
    );
    const hudBox = await J(
      `(() => { const b = document.getElementById("hud-col-left").getBoundingClientRect(); return { b: b.bottom }; })()`,
    );
    check(
      hudBox.b <= padBox.y,
      `cột HUD trái kết thúc phía trên D-pad (${Math.round(hudBox.b)} <= ${Math.round(padBox.y)})`,
    );
    // Hướng: phải, lên-trái (chéo), vùng chết; rồi nhả
    const vec = async () =>
      J("({ x: window.__joystick.x, y: window.__joystick.y, active: window.__joystick.active })");
    // pointermove được gom theo khung hình nên có thể tới trễ: thăm dò tới khi vector thoả điều kiện (tối đa ~1 s)
    const vecWhen = async (pred) => {
      let last = await vec();
      for (let i = 0; i < 30 && !pred(last); i++) {
        await sleep(35);
        last = await vec();
      }
      return last;
    };
    await touchDown(1, pad.x + 50, pad.y);
    let v = await vec();
    check(
      v.active && Math.abs(v.x - 1) < 0.01 && Math.abs(v.y) < 0.01,
      `chạm bên phải tâm: đi sang phải (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`,
    );
    await touchMove(1, pad.x - 40, pad.y - 40);
    v = await vecWhen((q) => q.x < -0.5 && q.y < -0.5);
    check(
      Math.abs(v.x + Math.SQRT1_2) < 0.01 && Math.abs(v.y + Math.SQRT1_2) < 0.01,
      `kéo sang trên-trái: đi chéo chuẩn hoá (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`,
    );
    const upOn = await evalJs(
      `document.querySelector("#dpad .dp-up").classList.contains("on") && document.querySelector("#dpad .dp-left").classList.contains("on")`,
    );
    check(upOn === true, "hai mũi tên lên + trái sáng");
    await touchMove(1, pad.x + 3, pad.y + 2);
    v = await vecWhen((q) => q.x === 0 && q.y === 0);
    check(
      v.active && v.x === 0 && v.y === 0,
      "về giữa nút (vùng chết): đứng yên nhưng vẫn đang giữ",
    );
    // Đa chạm: ngón 1 giữ D-pad, ngón 2 bấm Chém
    await evalJs("window.__n.slash = 0;0");
    await touchMove(1, pad.x, pad.y + 55);
    await touchDown(2, slash.x, slash.y);
    await touchUp(2);
    v = await vecWhen((q) => q.y > 0.5);
    const n2 = await J("window.__n");
    check(
      v.active && Math.abs(v.y - 1) < 0.01,
      `giữ D-pad (xuống) vẫn đi khi bấm Chém bằng ngón khác (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`,
    );
    check(n2.slash === 1, `Chém gọi đúng 1 lần khi đang giữ D-pad (${n2.slash})`);
    await touchUp(1);
    v = await vec();
    check(!v.active && v.x === 0 && v.y === 0, "thả ngón: D-pad về nghỉ");
    // Vùng chạm cũ của joystick nổi không còn tác dụng ở chế độ D-pad (chạm giữa màn hình bên trái không khởi động joystick)
    await touchDown(1, jx + 90, jy - 60);
    v = await vec();
    await touchUp(1);
    check(!v.active, "chế độ D-pad: chạm vùng joystick nổi cũ không đi");
    if (!NO_SHOT) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(OUT_DIR, `touch-dpad-${vp.name}.png`),
        Buffer.from(shot.result.data, "base64"),
      );
      console.log(`  ✓ ảnh touch-dpad-${vp.name}.png`);
    }

    // --- 3b') Nút Mục tiêu mờ đi khi không có quái trong tầm khoá (nit của A ở #344: hiện cả ở trấn), sáng lại khi có ---
    const idleState = () =>
      J(
        `({ idle: document.getElementById("btn-target").classList.contains("idle"), aria: document.getElementById("btn-target").getAttribute("aria-disabled"), op: parseFloat(getComputedStyle(document.getElementById("btn-target")).opacity) })`,
      );
    await sleep(350);
    let I = await idleState();
    check(
      I.idle && I.aria === "true" && I.op < 0.6,
      `không có quái: nút Mục tiêu mờ (opacity ${I.op}, aria-disabled=${I.aria})`,
    );
    await evalJs(
      `(() => { const sc = window.__scene; sc.state.monsters.set("t-idle", { kind: "tho", x: sc.predX + 300, y: sc.predY, hp: 40, maxHp: 40, angle: 0 }); 0; })()`,
    );
    await sleep(450);
    I = await idleState();
    check(
      !I.idle && I.aria === "false" && I.op === 1,
      `có quái trong tầm: nút Mục tiêu sáng lại (opacity ${I.op})`,
    );
    await evalJs(
      `(() => { const sc = window.__scene; const m = sc.state.monsters.get("t-idle"); m.x = sc.predX + 900; m.y = sc.predY; 0; })()`,
    );
    await sleep(450);
    I = await idleState();
    check(I.idle, "quái chỉ còn ngoài tầm khoá (900 px > 520): nút Mục tiêu mờ lại");
    await evalJs('window.__scene.state.monsters.delete("t-idle");0');
    await sleep(300);

    // --- 3c) Nút khoá mục tiêu: ba quái thật trong state mock (gần nhất, xa hơn, ngoài tầm) ---
    await evalJs(`(() => {
      const sc = window.__scene;
      const at = (dx, dy) => ({ kind: "tho", x: sc.predX + dx, y: sc.predY + dy, hp: 40, maxHp: 40, angle: 0 });
      sc.state.monsters.set("t-gan", at(100, 0));
      sc.state.monsters.set("t-giua", at(0, 220));
      sc.state.monsters.set("t-xa", at(-650, 0)); // ngoài tầm khoá 520
      0;
    })()`);
    await sleep(300);
    const lockState = () =>
      J(
        `({ id: window.__scene.lockedTargetId, cls: document.getElementById("btn-target").classList.contains("locked"), pressed: document.getElementById("btn-target").getAttribute("aria-pressed"), label: document.getElementById("btn-target-label").textContent })`,
      );
    const tgtC = await center("#btn-target");
    const tap = async () => {
      await touchDown(1, tgtC.x, tgtC.y);
      await touchUp(1);
      await sleep(120);
    };
    let L = await lockState();
    check(L.id === null && !L.cls, "chưa khoá: nút ở trạng thái thường");
    await tap();
    L = await lockState();
    check(
      L.id === "t-gan" && L.cls && L.pressed === "true",
      `bấm lần 1: khoá con GẦN nhất (${L.id}, aria-pressed=${L.pressed})`,
    );
    check(L.label.length > 0 && L.label !== "Mục tiêu", `nút hiện tên quái đang khoá (${L.label})`);
    const ringOn = await evalJs(
      "Boolean(window.__scene.targetRing && window.__scene.targetRing.visible)",
    );
    check(ringOn === true, "vòng đánh dấu hiện trên mục tiêu");
    await tap();
    L = await lockState();
    check(L.id === "t-giua", `bấm lần 2: chuyển sang con xa hơn trong tầm (${L.id})`);
    await tap();
    L = await lockState();
    check(L.id === "t-gan", `bấm lần 3: vòng lại con gần nhất, bỏ qua con ngoài tầm (${L.id})`);
    // Đánh về phía mục tiêu khoá dù con khác gần hơn: khoá con ở xa hơn rồi hỏi hướng ngắm
    await tap(); // -> t-giua (phía dưới)
    const ang = await evalJs("window.__scene.aim(500)");
    check(
      Math.abs(ang - Math.PI / 2) < 0.01,
      `ngắm về con đang khoá (phía dưới) dù con kia gần hơn (${Number(ang).toFixed(2)} rad)`,
    );
    // Phím T cũng chuyển mục tiêu (bàn phím)
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      code: "KeyT",
      key: "t",
      windowsVirtualKeyCode: 84,
      nativeVirtualKeyCode: 84,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      code: "KeyT",
      key: "t",
      windowsVirtualKeyCode: 84,
      nativeVirtualKeyCode: 84,
    });
    await sleep(120);
    L = await lockState();
    check(L.id === "t-gan", `phím T chuyển mục tiêu (${L.id})`);
    // Quái bị khoá biến mất: tự nhả khoá
    await evalJs('window.__scene.state.monsters.delete("t-gan");0');
    await sleep(300);
    L = await lockState();
    check(L.id === null && !L.cls, "mục tiêu biến mất: tự nhả khoá, nút về thường");
    const ringOff = await evalJs(
      "Boolean(window.__scene.targetRing && window.__scene.targetRing.visible)",
    );
    check(ringOff === false, "vòng đánh dấu ẩn khi nhả khoá");
    await evalJs(
      `(() => { const m = window.__scene.state.monsters; m.delete("t-giua"); m.delete("t-xa"); 0; })()`,
    );

    // Trả về joystick nổi để các mục sau (và khung nhìn kế tiếp) chạy như mặc định
    await evalJs("window.__ui.toggleSettingsModal(true);0");
    await evalJs(
      "(() => { const sel = document.getElementById('set-touch-scheme'); sel.value = 'float'; sel.dispatchEvent(new Event('change')); })();0",
    );
    await evalJs("window.__ui.toggleSettingsModal(false);0");
    await sleep(200);

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
