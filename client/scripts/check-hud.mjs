/* global console, setTimeout, fetch, process */
// Kiểm HUD gọn trên điện thoại (M5.1 #326): bảng Nhiệm vụ thu gọn mặc định ở điện thoại NGANG / dọc thấp, mở ở dọc cao / tablet / máy tính; bấm tiêu đề
// để mở / thu, lựa chọn được nhớ (`tg_qt_open`) và thắng mặc định kể cả khi xoay máy; cột HUD trái cao <= 72 % chiều cao khi thu gọn. Chrome thật, chạm
// thật (CDP). Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-hud.mjs [--url http://127.0.0.1:5183]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-hud-"));
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
    // Chất lượng Cao (cho rung + chớp), bỏ hướng dẫn tân thủ
    source:
      "try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 900,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1&crowd=6` });
  for (let k = 0; k < 40; k++) {
    await sleep(300);
    if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())")) break;
  }
  await sleep(600);

  // Chế độ mock không chạy đối chiếu máy chủ: đặt vị trí đoán trước tại chỗ nhân vật và đưa camera về đó
  await evalJs(`(() => {
    const sc = window.__scene, me = sc.me();
    sc.predX = me.x; sc.predY = me.y;
    sc.cameras.main.centerOn(me.x, me.y);
    return 0;
  })()`);

  const metrics = async (w, h, mobile) => {
    if (mobile)
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile,
    });
    await sleep(450); // display.ts gom sự kiện đổi kích thước ~100 ms
  };
  const reload = async () => {
    await send("Page.reload");
    for (let k = 0; k < 40; k++) {
      await sleep(300);
      if (await evalJs("Boolean(window.__ui && window.__scene)")) break;
    }
    await sleep(600);
  };
  const state = () =>
    evalJs(`(() => {
      const t = document.getElementById("quest-tracker"), b = document.getElementById("qt-toggle"), list = document.getElementById("quest-tracker-list");
      const col = document.getElementById("hud-col-left").getBoundingClientRect(), r = b.getBoundingClientRect();
      return JSON.stringify({
        collapsed: t.classList.contains("collapsed"), aria: b.getAttribute("aria-expanded"),
        listShown: getComputedStyle(list).display !== "none", btnH: Math.round(r.height), btnW: Math.round(r.width),
        colPct: Math.round((col.height / innerHeight) * 100), colH: Math.round(col.height), ih: innerHeight,
        pref: localStorage.getItem("tg_qt_open"), form: document.documentElement.dataset.form, orient: document.documentElement.dataset.orient,
        topIsBtn: (() => { const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return Boolean(e && e.closest("button") === b); })(),
      });
    })()`).then((v) => JSON.parse(v));
  const tap = async () => {
    const c = JSON.parse(
      await evalJs(
        `(() => { const r = document.getElementById("qt-toggle").getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`,
      ),
    );
    await send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x: c.x, y: c.y }],
    });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(250);
  };
  const fresh = async (w, h, mobile) => {
    await metrics(w, h, mobile);
    await evalJs('localStorage.removeItem("tg_qt_open");0');
    await reload();
    await sleep(300);
    return state();
  };

  // 1) Mặc định theo máy
  let s = await fresh(844, 390, true);
  check(
    s.form === "phone" && s.orient === "landscape",
    `844x390 là điện thoại ngang (${s.form}/${s.orient})`,
  );
  check(
    s.collapsed && s.aria === "false" && !s.listShown,
    `điện thoại ngang: bảng Nhiệm vụ THU GỌN mặc định (aria-expanded=${s.aria})`,
  );
  check(
    s.colPct <= 72,
    `điện thoại ngang: cột HUD trái cao ${s.colH} px = ${s.colPct} % chiều cao (<= 72 %; trước đây 82 %)`,
  );
  check(s.btnH >= 44, `tiêu đề bấm được >= 44 px trên cảm ứng (${s.btnW}x${s.btnH})`);
  check(
    s.topIsBtn,
    "tiêu đề không bị lớp nào chắn (bấm trúng nút, kể cả khi thân bảng trong suốt với chạm)",
  );
  for (const [w, h] of [
    [667, 375],
    [640, 360],
    [932, 430],
  ]) {
    s = await fresh(w, h, true);
    check(
      s.collapsed && s.colPct <= 76,
      `${w}x${h}: thu gọn, cột HUD ${s.colH} px = ${s.colPct} %`,
    );
  }
  s = await fresh(360, 640, true);
  check(
    s.collapsed && s.orient === "portrait",
    `điện thoại dọc THẤP 360x640: thu gọn (cột ${s.colPct} %)`,
  );
  s = await fresh(390, 844, true);
  check(
    !s.collapsed && s.aria === "true" && s.listShown,
    `điện thoại dọc cao 390x844: MỞ mặc định (cột ${s.colPct} %)`,
  );
  s = await fresh(768, 1024, true);
  check(!s.collapsed, "tablet 768x1024: mở mặc định");
  s = await fresh(1280, 720, false);
  check(!s.collapsed && s.aria === "true", "máy tính 1280x720: mở mặc định");

  // 2) Bấm tiêu đề mở / thu, nhớ lựa chọn, qua nạp lại trang
  s = await fresh(844, 390, true);
  const before = s.colH;
  await tap();
  s = await state();
  check(
    !s.collapsed && s.aria === "true" && s.listShown && s.pref === "1",
    `bấm: MỞ (aria-expanded=${s.aria}, tg_qt_open=${s.pref}, cột ${before} -> ${s.colH} px)`,
  );
  check(s.colH > before, "mở ra làm cột HUD cao hơn lúc thu gọn");
  await reload();
  s = await state();
  check(
    !s.collapsed && s.pref === "1",
    "nạp lại trang: lựa chọn MỞ được nhớ (thắng mặc định thu gọn của điện thoại ngang)",
  );
  await tap();
  s = await state();
  check(
    s.collapsed && s.aria === "false" && s.pref === "0",
    `bấm lần nữa: THU GỌN (tg_qt_open=${s.pref})`,
  );
  await reload();
  s = await state();
  check(s.collapsed && s.pref === "0", "nạp lại trang: lựa chọn THU GỌN được nhớ");

  // 3) Xoay máy: chưa chọn thì tự đổi theo độ gọn; đã chọn thì giữ
  s = await fresh(390, 844, true);
  check(!s.collapsed, "bắt đầu ở dọc cao, chưa chọn: mở");
  await metrics(844, 390, true);
  s = await state();
  check(
    s.collapsed && s.pref === null,
    "xoay sang ngang (chưa chọn): tự THU GỌN, không ghi lựa chọn",
  );
  await metrics(390, 844, true);
  s = await state();
  check(!s.collapsed && s.pref === null, "xoay lại dọc (chưa chọn): tự MỞ lại");
  await metrics(844, 390, true);
  await tap(); // chọn MỞ ở ngang
  await metrics(360, 640, true); // dọc thấp, mặc định sẽ thu gọn
  s = await state();
  check(
    !s.collapsed && s.pref === "1",
    "đã chọn MỞ: xoay sang dọc thấp vẫn giữ MỞ (lựa chọn thắng mặc định)",
  );
  await evalJs('localStorage.removeItem("tg_qt_open");0');

  // 4) Gợi ý "chạm nhiệm vụ để chỉ đường" nằm NGOÀI nút thu gọn / mở (nit của A ở #386: nằm trong nút thì dễ hiểu nhầm bấm tiêu đề là chỉ đường)
  const hintState = () =>
    evalJs(`(() => {
      const t = document.getElementById("qt-toggle"), h = document.getElementById("qt-hint");
      const hr = h.getBoundingClientRect(), tr = t.getBoundingClientRect();
      return JSON.stringify({ inButton: t.contains(h), btnText: t.textContent, shown: getComputedStyle(h).display !== "none" && !h.hidden,
        below: hr.top >= tr.bottom - 1, text: h.textContent });
    })()`).then((v) => JSON.parse(v));
  await fresh(390, 844, true); // mở mặc định
  let hs = await hintState();
  check(
    !hs.inButton && !/chỉ đường/i.test(hs.btnText),
    `nhãn gợi ý nằm ngoài nút thu gọn / mở (nút chỉ có "${hs.btnText.trim()}")`,
  );
  check(!hs.shown, "chưa có nhiệm vụ: không hiện gợi ý chỉ đường (không có gì để chạm)");
  await evalJs(
    `window.__ui.onQuests({ active: [{ id: "nhap_the", step: 0, count: 0 }], done: [], dailyDone: [] });0`,
  );
  await sleep(150);
  hs = await hintState();
  check(hs.shown && hs.below, `có nhiệm vụ + bảng mở: hiện gợi ý ngay dưới tiêu đề ("${hs.text}")`);
  await tap(); // thu gọn
  hs = await hintState();
  check(!hs.shown, "bảng thu gọn: ẩn gợi ý");
  await tap(); // mở lại
  await evalJs(`window.__ui.onQuests({ active: [], done: [], dailyDone: [] });0`);
  await sleep(150);
  hs = await hintState();
  check(!hs.shown, "hết nhiệm vụ: ẩn gợi ý");
  await evalJs('localStorage.removeItem("tg_qt_open");0');

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
