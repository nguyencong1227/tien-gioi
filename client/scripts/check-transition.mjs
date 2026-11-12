/* global console, setTimeout, fetch, process */
// Kiểm chuyển cảnh qua cổng / vào-ra bí cảnh (mống mắt 400 ms, giảm chuyển động chỉ mờ 300 ms, bỏ qua được) trong Chrome thật (M5.2 #329). Cần client đang chạy
// (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-transition.mjs [--url http://127.0.0.1:5183]
// Đóng băng chuyển động CSS bằng Web Animations (pause + currentTime) để chụp ĐIỂM ẢNH THẬT ở đúng nửa chừng, tất định.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
const CDP_PORT = 41100 + Math.floor(Math.random() * 300);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-transition-"));
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
  const J = async (expression) => JSON.parse(await evalJs(`JSON.stringify(${expression})`));

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
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
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

  /** Điểm ảnh (r, g, b) tại các toạ độ CSS từ ảnh chụp màn hình thật (giải mã PNG ngay trong trang). */
  const pixels = async (points) => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    return JSON.parse(
      await evalJs(`new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const k = img.width / window.innerWidth;
        resolve(JSON.stringify(${JSON.stringify(points)}.map(([px, py]) => Array.from(x.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data.slice(0, 3)))));
      };
      img.src = "data:image/png;base64,${shot.result.data}";
    })`),
    );
  };
  const dark = (p) => p[0] < 12 && p[1] < 12 && p[2] < 12;
  const overlayOpen = () => evalJs(`!document.getElementById("transition-overlay").hidden`);
  /** Đóng băng mọi chuyển động CSS của lớp chuyển cảnh ở `ms` mili giây (tiến độ tất định). */
  const freezeAt = (ms) =>
    evalJs(`(() => { const o = document.getElementById("transition-overlay");
      const list = document.getAnimations().filter((a) => a.effect && a.effect.target === o);
      for (const a of list) { a.pause(); a.currentTime = ${ms}; }
      return list.map((a) => a.transitionProperty); })()`);
  const irisR = () =>
    evalJs(
      `getComputedStyle(document.getElementById("transition-overlay")).getPropertyValue("--iris-r")`,
    );
  const setReduced = (on) =>
    evalJs(
      `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = ${on}; c.dispatchEvent(new Event("change")); return 1; })()`,
    );
  const W = 900,
    H = 600;
  const CORNER = [10, 10],
    CENTER = [W / 2, 160]; // lệch lên khỏi chữ tên bản đồ ở tâm, vẫn gần tâm (cách 140 px)

  // 1) Ban đầu: lớp chuyển cảnh ẩn, canvas thấy rõ (cả góc lẫn tâm đều KHÔNG đen)
  check(!(await overlayOpen()), "ban đầu: lớp chuyển cảnh ẩn");
  let [c0, m0] = await pixels([CORNER, CENTER]);
  check(!dark(c0) && !dark(m0), `ban đầu: góc ${c0} và tâm ${m0} không đen`);

  // 2) Mống mắt (mặc định): nửa chừng, MÉP đen nhưng TÂM vẫn thấy cảnh; khép hẳn thì đen toàn bộ và hiện tên bản đồ
  await evalJs(`window.__ui.showTransition("Hắc Phong Cốc"); 1`);
  await sleep(100);
  const props = await freezeAt(300); // 75 % thời gian (làm mượt ~ 84 %): bán kính ~ 215 px < nửa đường chéo 541 px nên góc đã đen, điểm gần tâm (cách 140 px) còn thấy
  check(
    props.includes("--iris-r"),
    `đang chạy chuyển động --iris-r (${props.join(",") || "không có"})`,
  );
  const rMid = await irisR();
  check(
    parseFloat(rMid) > 0 && parseFloat(rMid) < 0.9 * Math.max(W, H) * 1.5,
    `nửa chừng: bán kính mống mắt ${rMid} nằm giữa mở và khép`,
  );
  const [cm, mm] = await pixels([CORNER, CENTER]);
  check(dark(cm), `nửa chừng: góc đã đen (${cm})`);
  check(!dark(mm), `nửa chừng: tâm vẫn thấy cảnh (${mm})`);
  await evalJs(
    `(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch {} } return 1; })()`,
  );
  await sleep(500);
  check(parseFloat(await irisR()) === 0, `khép hẳn: bán kính = ${await irisR()}`);
  const [cc, mc] = await pixels([CORNER, CENTER]);
  check(dark(cc) && dark(mc), `khép hẳn: góc ${cc} và tâm ${mc} đều đen`);
  check(
    Number(
      await evalJs(`getComputedStyle(document.getElementById("transition-map-name")).opacity`),
    ) === 1 &&
      (await evalJs(`document.getElementById("transition-map-name").textContent`)) ===
        "Hắc Phong Cốc",
    "khép hẳn: hiện tên bản đồ",
  );

  // 3) Mở lại khi tới nơi: sau hideTransition thì ẩn hẳn và cảnh thấy lại
  await evalJs(`window.__ui.hideTransition(); 1`);
  await sleep(1200);
  check(!(await overlayOpen()), "sau hideTransition: lớp chuyển cảnh ẩn hẳn");
  [c0, m0] = await pixels([CORNER, CENTER]);
  check(!dark(c0) && !dark(m0), `sau mở lại: góc ${c0} và tâm ${m0} không đen`);

  // 4) Bỏ qua được: bấm / gõ phím thì phần chờ xong sớm (< 250 ms thay vì ~400 ms); không ai bấm thì chờ đủ
  const hold = async (act) =>
    evalJs(`new Promise((resolve) => {
      window.__ui.showTransition("X");
      const t0 = performance.now();
      window.__ui.transitionHold().then((skipped) => { window.__ui.hideTransition(); resolve({ skipped, ms: Math.round(performance.now() - t0) }); });
      setTimeout(() => { ${act} }, 60);
    })`);
  let h = await J(`window.__ui.transitionHold ? 1 : 0`);
  check(h === 1, "ui.transitionHold có mặt");
  h = await hold("");
  check(
    h.skipped === false && h.ms >= 380 && h.ms < 900,
    `không bấm: chờ đủ (${h.ms} ms, skipped=${h.skipped})`,
  );
  await sleep(700);
  h = await hold(
    `document.getElementById("transition-overlay").dispatchEvent(new Event("pointerdown"));`,
  );
  check(h.skipped === true && h.ms < 250, `bấm chuột: bỏ qua sau ${h.ms} ms`);
  await sleep(700);
  h = await hold(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));`);
  check(h.skipped === true && h.ms < 250, `gõ phím: bỏ qua sau ${h.ms} ms`);
  await sleep(700);

  // 5) Giảm chuyển động: KHÔNG mống mắt (nền đặc), chỉ mờ dần 300 ms; nửa chừng bán trong suốt, xong thì đen toàn bộ
  await setReduced(true);
  await sleep(300);
  await evalJs(`window.__ui.showTransition("Hắc Phong Cốc"); 1`);
  await sleep(60);
  const styles = await J(
    `(() => { const s = getComputedStyle(document.getElementById("transition-overlay")); return { bg: s.backgroundImage, dur: s.transitionDuration, prop: s.transitionProperty }; })()`,
  );
  check(
    styles.bg === "none",
    `giảm chuyển động: không có lỗ mống mắt (background-image ${styles.bg})`,
  );
  check(
    styles.dur === "0.3s" && styles.prop === "opacity",
    `giảm chuyển động: mờ dần ${styles.dur} trên ${styles.prop} (không phải 0,01 ms của quy tắc toàn cục)`,
  );
  const fp = await freezeAt(150);
  check(fp.includes("opacity"), `đang chạy chuyển động opacity (${fp.join(",") || "không có"})`);
  const op = Number(
    await evalJs(`getComputedStyle(document.getElementById("transition-overlay")).opacity`),
  );
  check(op > 0.3 && op < 0.7, `nửa chừng: opacity ${op} (mờ dần)`);
  const [cf, mf] = await pixels([CORNER, CENTER]);
  check(
    !dark(cf) && !dark(mf),
    `nửa chừng mờ: góc ${cf} và tâm ${mf} chưa đen hẳn (bán trong suốt)`,
  );
  await evalJs(
    `(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch {} } return 1; })()`,
  );
  await sleep(500);
  const [cfe, mfe] = await pixels([CORNER, CENTER]);
  check(dark(cfe) && dark(mfe), `mờ xong: góc ${cfe} và tâm ${mfe} đều đen`);
  await evalJs(`window.__ui.hideTransition(); 1`);
  await sleep(900);
  check(!(await overlayOpen()), "giảm chuyển động: sau hideTransition lớp ẩn hẳn");

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
