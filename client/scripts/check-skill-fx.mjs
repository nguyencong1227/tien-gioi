/* global console, setTimeout, fetch, process, Buffer */
// Kiểm hiệu ứng công pháp (kiếm khí rải hạt dọc đường bay, tia lửa hai đầu cung chém) trong Chrome thật (M5.2 #329). Cần client đang chạy
// (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-skill-fx.mjs [--url http://127.0.0.1:5183] [--shot docs/screenshots/combat-fx.webp]
// Đo số HẠT SỐNG THẬT của Phaser, trạng thái chớp của camera VÀ điểm ảnh thật trên canvas (so với ảnh nền không hiệu ứng).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
const CDP_PORT = 40700 + Math.floor(Math.random() * 300);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-skill-fx-"));
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

  /** Số hạt đang SỐNG THẬT trong mọi emitter của cảnh. */
  const alive = () =>
    evalJs(
      `window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0)`,
    );
  /**
   * Chạy `js` TRONG trang, chờ `gameMs` THỜI GIAN TRÒ CHƠI rồi chụp ở khung hình kế tiếp (đo theo đồng hồ cảnh, không lệch khi máy bận).
   * Trả về số hạt sống tại thời điểm chụp.
   */
  const act = (js, name, gameMs) =>
    evalJs(`new Promise((resolve) => {
      const sc = window.__scene, r = sc.game.canvas.getBoundingClientRect(), t0 = sc.time.now;
      ${js};
      const count = () => sc.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0);
      let peak = 0;
      const shoot = () => {
        peak = Math.max(peak, count());
        if (sc.time.now - t0 < ${gameMs}) return void requestAnimationFrame(shoot);
        sc.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
          const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
          const x = c.getContext("2d"); x.drawImage(img, 0, 0);
          window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data;
          resolve({ alive: count(), peak });
        });
      };
      shoot();
    })`);
  const snap = (name) => act("", name, 0);
  const diff = (a, b) =>
    evalJs(`(() => { const A = window[${JSON.stringify(a)}], B = window[${JSON.stringify(b)}]; let n = 0;
      for (let i = 0; i < A.length; i += 4)
        if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 60) n++;
      return n; })()`);
  const settle = async () => {
    await evalJs("window.__fx.clear(); 0");
    for (let k = 0; k < 120; k++) {
      await sleep(100);
      if ((await alive()) === 0 && k >= 5) break;
    }
  };

  await settle();
  check((await alive()) === 0, "ban đầu không hạt");

  // 1) Kiếm khí của mình: hạt rải dọc đường bay + mũi; đo điểm ảnh khi ảnh kiếm khí ĐÃ TAN (sau 450 ms trò chơi) nên chỉ còn hạt
  await snap("pre");
  let r = await act("sc.fxSword(sc.predX, sc.predY, 0, 260, 0xffffff, true)", "sw", 450);
  check(
    r.peak > 8 && r.peak <= 32,
    `kiếm khí của mình: đỉnh ${r.peak} hạt sống (4 điểm qi x 6 + mũi 8 = 32 tối đa)`,
  );
  check(
    r.alive > 0,
    `kiếm khí: ${r.alive} hạt còn sống sau 450 ms (hạt đi cùng ảnh kiếm khí, tan sau ảnh)`,
  );
  const d = await diff("pre", "sw");
  check(
    d > 60,
    `kiếm khí: ${d} điểm ảnh khác nền khi ảnh kiếm khí đã tan (hạt thật sự được vẽ, > 60)`,
  );
  await settle();

  // 2) Qua đúng đường người chơi gọi (nút / phím): sword() và slash() của mình
  r = await act("sc.nextSword = 0; sc.sword()", "sw2", 120);
  check(r.peak > 8, `sword() của mình qua đường thật: đỉnh ${r.peak} hạt`);
  await settle();

  // 3) Hạt trễ theo thời gian bay: ngay khung đầu CHƯA có mũi nổ; xong thời gian bay thì có hạt mũi
  r = await act("sc.fxSword(sc.predX, sc.predY, 0, 260, 0xffffff, true)", "x", 0);
  const early = r.peak;
  await sleep(10);
  const later = (await act("", "y", 300)).peak;
  check(
    later > early,
    `hạt theo thời gian bay: ${early} hạt lúc ra đòn -> đỉnh ${later} khi kiếm khí bay tới mũi`,
  );
  await settle();

  // 4) Người khác tung kiếm khí (tin fx 'sword'): vẫn có hạt (ưu tiên 1)
  r = await act(
    `sc.onFx({ kind: "sword", by: "nguoi-khac", x: sc.predX, y: sc.predY, angle: 0, range: 260 })`,
    "o",
    300,
  );
  check(r.peak > 8, `kiếm khí của người khác: đỉnh ${r.peak} hạt`);
  await settle();

  // 5) Chém: tia lửa hai đầu cung (của mình) có hạt; yêu thú chém (mslash, vòng nhỏ) KHÔNG thêm hạt
  r = await act("sc.nextSlash = 0; sc.slash(0)", "sl", 60);
  check(r.peak > 0 && r.peak <= 8, `chém của mình: đỉnh ${r.peak} hạt (2 đầu cung x 4)`);
  await settle();
  r = await act(
    `sc.onFx({ kind: "mslash", by: "quai-1", x: sc.predX, y: sc.predY, angle: 0 })`,
    "ms",
    60,
  );
  check(r.peak === 0, `yêu thú chém: ${r.peak} hạt (không thêm tia lửa)`);
  await settle();

  // 5b) Bậc Thấp (4 emitter): một đòn kiếm khí của mình chỉ chiếm 1 điểm qi + mũi = 2 emitter (không nuốt ngân sách), nên hiệu ứng
  // ưu tiên 1 của người khác phát ngay sau đó VẪN được nhận; chém chỉ một đầu cung (nit A ở #356)
  await evalJs(
    `(() => { const c = document.getElementById("set-quality"); c.value = "low"; c.dispatchEvent(new Event("change")); return 1; })()`,
  );
  await sleep(300);
  await settle();
  const a0 = await evalJs("window.__fx.stats().admitted");
  r = await act("sc.fxSword(sc.predX, sc.predY, 0, 260, 0xffffff, true)", "lo", 300);
  const a1 = await evalJs("window.__fx.stats().admitted");
  check(
    a1 - a0 === 2,
    `bậc Thấp: kiếm khí của mình phát ${a1 - a0} lần (1 qi + mũi = 2; trước sửa: 5)`,
  );
  const accepted = await evalJs(
    `window.__fx.play("hit-spark", window.__scene.predX + 200, window.__scene.predY, { priority: 1 })`,
  );
  check(
    accepted === true,
    "bậc Thấp: ngay sau kiếm khí, hiệu ứng ưu tiên 1 của người khác vẫn được nhận (không bị nuốt ngân sách)",
  );
  await settle();
  const b0 = await evalJs("window.__fx.stats().admitted");
  await act("sc.nextSlash = 0; sc.slash(0)", "lo2", 60);
  const b1 = await evalJs("window.__fx.stats().admitted");
  check(b1 - b0 === 1, `bậc Thấp: chém của mình phát ${b1 - b0} lần (1 đầu cung)`);
  await settle();
  await evalJs(
    `(() => { const c = document.getElementById("set-quality"); c.value = "high"; c.dispatchEvent(new Event("change")); return 1; })()`,
  );
  await sleep(300);
  await settle();

  // 6) Giảm chuyển động: ít hạt hơn (x 0,3)
  await evalJs(
    `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = true; c.dispatchEvent(new Event("change")); })()`,
  );
  await sleep(200);
  await settle();
  r = await act("sc.fxSword(sc.predX, sc.predY, 0, 260, 0xffffff, true)", "rm", 300);
  check(r.peak > 0 && r.peak < 14, `giảm chuyển động: đỉnh ${r.peak} hạt (32 x 0,3 ≈ 10)`);

  // Ảnh chụp (tuỳ chọn --shot <tệp.webp>): kiếm khí đang bay + chém
  const si = process.argv.indexOf("--shot");
  if (si >= 0 && process.argv[si + 1]) {
    await evalJs(
      `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = false; c.dispatchEvent(new Event("change")); })()`,
    );
    await sleep(200);
    await settle();
    await act(
      "sc.fxSword(sc.predX, sc.predY, 0, 260, 0xbfe8ff, true); sc.fxSlash(sc.predX, sc.predY, -1.2, 0xffffff, 1, true)",
      "shot",
      130,
    );
    const pos = await J(`(() => {
      const sc = window.__scene, cam = sc.cameras.main, r = sc.game.canvas.getBoundingClientRect();
      const sx = r.width / sc.scale.width, sy = r.height / sc.scale.height;
      return { x: r.left + (sc.predX - cam.worldView.x) * cam.zoom * sx, y: r.top + (sc.predY - cam.worldView.y) * cam.zoom * sy };
    })()`);
    await sleep(0);
    const shot = await send("Page.captureScreenshot", {
      format: "webp",
      quality: 90,
      clip: {
        x: Math.max(0, pos.x - 80),
        y: Math.max(0, pos.y - 150),
        width: 360,
        height: 220,
        scale: 2,
      },
    });
    fs.writeFileSync(process.argv[si + 1], Buffer.from(shot.result.data, "base64"));
    console.log(`    (đã chụp ${process.argv[si + 1]})`);
  }

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
