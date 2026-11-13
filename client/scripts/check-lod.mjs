/* global console, setTimeout, fetch, process, Buffer */
// Kiểm mức chi tiết thực thể theo hồ sơ chất lượng (hoạt ảnh ở xa theo farAnimHz, bóng đốm, bán kính nhãn tên) trong Chrome thật (M5.2 #329). Cần client đang chạy
// (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1&crowd=6) nên KHÔNG cần server.
//   node client/scripts/check-lod.mjs [--url http://127.0.0.1:5183] [--shot docs/screenshots/combat-fx.webp]
// Đo số HẠT SỐNG THẬT của Phaser, trạng thái chớp của camera VÀ điểm ảnh thật trên canvas (so với ảnh nền không hiệu ứng).
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-lod-"));
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

  const setQuality = async (v) => {
    await evalJs(
      `(() => { const c = document.getElementById("set-quality"); c.value = ${JSON.stringify(v)}; c.dispatchEvent(new Event("change")); return 1; })()`,
    );
    await sleep(400);
  };
  const place = (id, dx) =>
    evalJs(`(() => { const sc = window.__scene, me = sc.me(), p = sc.state.players.get(${JSON.stringify(id)});
      p.x = p.px = me.x + ${dx}; p.y = p.py = me.y; return 1; })()`);
  /** Chạy `ms` mili giây THỜI GIAN TRÒ CHƠI và trả số lần updatePlayerAnim / updateMonsterAnim của từng thực thể được hỏi. */
  const countAnim = (botIds, ms) =>
    evalJs(`new Promise((resolve) => {
      const sc = window.__scene, t0 = sc.time.now;
      const counts = new Map();
      const op = sc.updatePlayerAnim.bind(sc), om = sc.updateMonsterAnim.bind(sc);
      sc.updatePlayerAnim = (e, ...a) => { counts.set(e, (counts.get(e) || 0) + 1); return op(e, ...a); };
      sc.updateMonsterAnim = (e, ...a) => { counts.set(e, (counts.get(e) || 0) + 1); return om(e, ...a); };
      const out = {};
      const done = () => {
        sc.updatePlayerAnim = op; sc.updateMonsterAnim = om;
        for (const id of ${JSON.stringify(botIds)}) {
          const e = sc.players.get(id) || sc.monsters.get(id);
          out[id] = e ? counts.get(e) || 0 : -1;
        }
        resolve(JSON.stringify(out));
      };
      const tick = () => (sc.time.now - t0 >= ${ms} ? done() : requestAnimationFrame(tick));
      tick();
    })`).then((v) => JSON.parse(v));
  const snap = (name) =>
    evalJs(`new Promise((resolve) => {
      const s = window.__scene, r = s.game.canvas.getBoundingClientRect();
      s.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data; resolve(1);
      });
    })`);
  /** Độ sáng trung bình (0..255) của hình chữ nhật trong ảnh chụp window[name]. */
  const luma = (name, x0, y0, w, h) =>
    evalJs(`(() => { const D = window[${JSON.stringify(name)}], W = Math.round(window.__scene.game.canvas.getBoundingClientRect().width); let s = 0, n = 0;
      for (let y = ${y0}; y < ${y0 + h}; y++) for (let x = ${x0}; x < ${x0 + w}; x++) { const i = (y * W + x) * 4; s += 0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]; n++; }
      return s / n; })()`);

  // Bố trí: bot-1 ở xa 440 px (xa hơn FAR_ANIM_DIST 420, ngoài nhãn bậc Vừa 420, trong nhãn bậc Cao 640), bot-2 cách 300 px
  // (gần cho hoạt ảnh, ngoài nhãn bậc Thấp 260, trong nhãn bậc Vừa 420); cả hai nằm trong khung camera (±480 px)
  await place("mock-bot-1", 440);
  await place("mock-bot-2", 300);
  await sleep(600);
  const FAR = "mock-bot-1";
  const NEAR = "mock-bot-2";

  // 1) Hoạt ảnh thực thể Ở XA theo farAnimHz: bậc Thấp 8 Hz; gần thì mỗi khung
  await setQuality("low");
  let c = await countAnim([FAR, NEAR], 2000);
  check(
    c[FAR] > 0 && c[FAR] <= 8 * 2 + 3,
    `bậc Thấp (8 Hz): thực thể xa cập nhật ${c[FAR]} lần / 2 s (<= 19)`,
  );
  check(
    c[NEAR] >= 2.5 * c[FAR],
    `bậc Thấp: thực thể gần cập nhật ${c[NEAR]} lần / 2 s, gấp >= 2,5 lần thực thể xa (${c[FAR]})`,
  );
  await setQuality("mid");
  c = await countAnim([FAR, NEAR], 2000);
  check(
    c[FAR] > 0 && c[FAR] <= 15 * 2 + 3,
    `bậc Vừa (15 Hz): thực thể xa cập nhật ${c[FAR]} lần / 2 s (<= 33)`,
  );

  // 2) Bóng đốm theo cờ blobShadows: Thấp tắt; Vừa / Cao bật; người chơi và quái đều có
  await evalJs(`(() => { const sc = window.__scene, me = sc.me();
    sc.state.monsters.set("m-lod", { kind: "tho", x: me.x - 120, y: me.y, hp: 40, maxHp: 40, angle: 0 }); return 1; })()`);
  await sleep(500);
  const shadowState = () =>
    evalJs(`(() => { const sc = window.__scene; const me = sc.players.get(sc.sid), bot = sc.players.get("${NEAR}"), mon = sc.monsters.get("m-lod");
      return JSON.stringify({ me: me.shadow.visible, bot: bot.shadow.visible, mon: mon.shadow.visible, monW: Math.round(mon.shadow.displayWidth) }); })()`).then(
      (v) => JSON.parse(v),
    );
  await setQuality("low");
  let sh = await shadowState();
  check(
    !sh.me && !sh.bot && !sh.mon,
    `bậc Thấp: không bóng đốm (mình ${sh.me}, người khác ${sh.bot}, quái ${sh.mon})`,
  );
  await setQuality("mid");
  sh = await shadowState();
  check(
    sh.me && sh.bot && sh.mon,
    `bậc Vừa: bóng đốm hiện cho mình / người khác / quái (${sh.me} / ${sh.bot} / ${sh.mon})`,
  );
  check(sh.monW >= 16, `bóng quái theo bán kính thân (rộng ${sh.monW} px)`);
  await setQuality("high");
  sh = await shadowState();
  check(sh.me && sh.bot && sh.mon, "bậc Cao: bóng đốm hiện cho cả ba");

  // 3) Bóng được VẼ thật: ở bậc Cao, bật / tắt riêng bóng của mình rồi đo độ sáng ngay dưới chân trên canvas WebGL
  const feet =
    await evalJs(`(() => { const sc = window.__scene, cam = sc.cameras.main, r = sc.game.canvas.getBoundingClientRect(), me = sc.players.get(sc.sid);
    const sx = r.width / sc.scale.width, sy = r.height / sc.scale.height;
    return JSON.stringify({ x: Math.round((me.root.x - cam.worldView.x) * cam.zoom * sx), y: Math.round((me.root.y - cam.worldView.y) * cam.zoom * sy) }); })()`).then(
      (v) => JSON.parse(v),
    );
  const setMyShadow = (on) =>
    evalJs(
      `(() => { const sc = window.__scene; const me = sc.players.get(sc.sid); me.shadowOn = true; me.shadow.setVisible(${on}); return 1; })()`,
    );
  await setMyShadow(false);
  await sleep(250);
  await snap("sh0");
  await setMyShadow(true);
  await sleep(250);
  await snap("sh1");
  const px = feet.x - 7,
    py = feet.y + 9;
  const l0 = await luma("sh0", px, py, 14, 3);
  const l1 = await luma("sh1", px, py, 14, 3);
  check(
    l1 < l0 * 0.93,
    `bóng đốm được vẽ dưới chân: độ sáng ${l0.toFixed(0)} -> ${l1.toFixed(0)} (< 93 %)`,
  );

  // 4) Bán kính nhãn tên theo hồ sơ: bot gần 300 px, bot xa 440 px
  const labels = () =>
    evalJs(
      `(() => { const sc = window.__scene; return JSON.stringify({ near: sc.players.get("${NEAR}").label.visible, far: sc.players.get("${FAR}").label.visible }); })()`,
    ).then((v) => JSON.parse(v));
  await setQuality("low");
  await sleep(300);
  let lb = await labels();
  check(
    !lb.near && !lb.far,
    `bậc Thấp (bán kính 260): nhãn bot 300 px và 440 px đều ẩn (${lb.near} / ${lb.far})`,
  );
  await setQuality("mid");
  await sleep(300);
  lb = await labels();
  check(
    lb.near && !lb.far,
    `bậc Vừa (bán kính 420): nhãn bot 300 px hiện, bot 440 px ẩn (${lb.near} / ${lb.far})`,
  );
  await setQuality("high");
  await sleep(300);
  lb = await labels();
  check(lb.near && lb.far, `bậc Cao (bán kính 640): cả hai hiện (${lb.near} / ${lb.far})`);

  // 5) Chi phí: bật / tắt MỌI bóng cùng bậc, cùng cảnh: draw call mỗi khung (WebGL thật) chỉ tăng tối đa 2 (bóng cùng một texture, gộp lô)
  const drawsWithShadows = (on) =>
    evalJs(`new Promise((resolve) => { const s = window.__scene, g = s.game, gl = g.renderer.gl;
      if (!gl) return resolve(-1);
      for (const e of [...s.players.values(), ...s.monsters.values()]) { e.shadowOn = true; e.shadow.setVisible(${on}); }
      let draws = 0, f = 0; const de = gl.drawElements, da = gl.drawArrays;
      gl.drawElements = function () { draws++; return de.apply(this, arguments); };
      gl.drawArrays = function () { draws++; return da.apply(this, arguments); };
      const on2 = () => { if (++f > 30) { g.events.off('postrender', on2); gl.drawElements = de; gl.drawArrays = da; resolve(draws / 30); } };
      g.events.on('postrender', on2); })`);
  const dOff = Number(await drawsWithShadows(false));
  const dOn = Number(await drawsWithShadows(true));
  check(dOff >= 0, "renderer là WebGL");
  check(
    dOn - dOff <= 2.01,
    `bóng đốm của ${await evalJs("window.__scene.players.size + window.__scene.monsters.size")} thực thể thêm <= 2 draw call mỗi khung (tắt ${dOff.toFixed(1)}, bật ${dOn.toFixed(1)})`,
  );

  // Ảnh chụp (tuỳ chọn --shot <tệp.webp>): bậc Cao có bóng, quanh nhân vật
  const si = process.argv.indexOf("--shot");
  if (si >= 0 && process.argv[si + 1]) {
    const shot = await send("Page.captureScreenshot", {
      format: "webp",
      quality: 90,
      clip: { x: 250, y: 150, width: 400, height: 300, scale: 2 },
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
