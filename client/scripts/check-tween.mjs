import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process */
// Kiểm tween nhẹ của người chơi / yêu thú trong Chrome thật (M5.2 #328 phần 2b đợt 3): nhấp nhô khi đi, co giãn khi đánh / bị đánh,
// chân đứng yên khi co giãn, tắt ở bậc Thấp / giảm chuyển động / thực thể ở xa. Cần client đang chạy (`npm run dev -w client`, cổng
// của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1&crowd=6) nên KHÔNG cần server.
//   node client/scripts/check-tween.mjs [--url http://127.0.0.1:5183]
// Đo TỪNG KHUNG HÌNH bằng requestAnimationFrame + `scene.time.now` (đồng hồ trò chơi): y / tỉ lệ thật của sprite, không đo bằng sleep.
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-tween-"));
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
  const setReduced = async (on) => {
    await evalJs(
      `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = ${on}; c.dispatchEvent(new Event("change")); return 1; })()`,
    );
    await sleep(300);
  };
  const place = (id, dx) =>
    evalJs(`(() => { const sc = window.__scene, me = sc.me(), p = sc.state.players.get(${JSON.stringify(id)});
      p.x = p.px = me.x + ${dx}; p.y = p.py = me.y; return 1; })()`);
  const NEAR = "mock-bot-2";
  const FAR = "mock-bot-1";
  await place(NEAR, 120);
  await place(FAR, 450); // xa hơn FAR_ANIM_DIST (420) nhưng vẫn trong khung camera
  await sleep(500);

  /**
   * Lấy mẫu từng khung hình trong `ms` mili giây THỜI GIAN TRÒ CHƠI: y và tỉ lệ của sprite thực thể `get` (biểu thức JS trả thực thể),
   * và chân (đáy sprite = y + chiều cao * tỉ lệ dọc / 2). `before` chạy NGAY trước khung đầu (đặt đòn đánh / bị đánh / bước đi).
   * `each` chạy mỗi khung (vd. đẩy bot đi bộ).
   */
  const sample = (get, ms, before = "", each = "") =>
    evalJs(`new Promise((resolve) => {
      const sc = window.__scene, t0 = sc.time.now, out = [];
      ${before};
      const tick = () => {
        const e = ${get};
        ${each};
        out.push([e.sprite.y, e.sprite.scaleX, e.sprite.scaleY, e.sprite.y + e.sprite.height * e.sprite.scaleY / 2]);
        if (sc.time.now - t0 >= ${ms}) return resolve(JSON.stringify(out));
        requestAnimationFrame(tick);
      };
      tick();
    })`).then((v) => JSON.parse(v));
  const range = (a, k) => [Math.min(...a.map((r) => r[k])), Math.max(...a.map((r) => r[k]))];
  const ME = `sc.players.get(sc.sid)`;
  const BOT = (id) => `sc.players.get("${id}")`;
  const MON = `sc.monsters.get("m-tw")`;
  const BASE_Y = -12; // spriteBaseY của người chơi

  // Bậc Cao, không giảm chuyển động: tween BẬT
  await setQuality("high");
  await setReduced(false);

  // 1) Đứng yên: không tween (sprite đúng vị trí / tỉ lệ gốc từng khung)
  let a = await sample(ME, 500);
  let [y0, y1] = range(a, 0);
  let [sx0, sx1] = range(a, 1);
  check(
    y0 === BASE_Y && y1 === BASE_Y && sx0 === 1 && sx1 === 1,
    `đứng yên: không tween (y ${y0}..${y1}, scaleX ${sx0}..${sx1}, ${a.length} khung)`,
  );

  // 2) Đi (người khác ở gần, bot đẩy mỗi khung 2 px qua lại): nhấp nhô lên đến ~1,5 px, không co giãn, không xuống dưới gốc
  const walk = `const p = sc.state.players.get("${NEAR}"); window.__dir = window.__dir || 1; if (Math.abs(p.px - (window.__bx || p.px)) > 40) window.__dir *= -1; window.__bx = window.__bx || p.px; p.x = p.px = p.px + 2 * window.__dir`;
  a = await sample(BOT(NEAR), 1100, "", walk);
  [y0, y1] = range(a, 0);
  [sx0, sx1] = range(a, 1);
  check(
    y0 <= BASE_Y - 1.2 && y0 >= BASE_Y - 1.51 && y1 >= BASE_Y - 0.05 && y1 <= BASE_Y + 1e-6,
    `đi: nhấp nhô y ${y0.toFixed(2)}..${y1.toFixed(2)} (gốc ${BASE_Y}, biên độ <= 1,5 px, không xuống dưới gốc; ${a.length} khung)`,
  );
  check(sx0 === 1 && sx1 === 1, `đi: không co giãn (scaleX ${sx0}..${sx1})`);
  // dừng đi: về đúng gốc
  await sleep(300);
  a = await sample(BOT(NEAR), 200);
  check(
    range(a, 0)[0] === BASE_Y && range(a, 0)[1] === BASE_Y,
    `dừng đi: sprite về đúng gốc (y ${range(a, 0)[0]}..${range(a, 0)[1]})`,
  );

  // 3) Thực thể Ở XA (>= 420 px) đi nhưng KHÔNG tween
  const walkFar = walk.replace(NEAR, FAR).replace(/__dir/g, "__dirF").replace(/__bx/g, "__bxF");
  a = await sample(BOT(FAR), 900, "", walkFar);
  check(
    range(a, 0)[0] === BASE_Y && range(a, 0)[1] === BASE_Y,
    `ở xa (>= 420 px): đi mà không tween (y ${range(a, 0)[0]}..${range(a, 0)[1]})`,
  );
  await sleep(200);

  // 4) Đánh (mình): giãn ngang tới ~1,12, nén dọc nhẹ, CHÂN đứng yên, rồi về đúng 1
  a = await sample(ME, 450, `${ME}.slashUntil = sc.time.now + 220`);
  [sx0, sx1] = range(a, 1);
  const [sy0] = range(a, 2);
  const [f0, f1] = range(a, 3);
  check(sx1 >= 1.08 && sx1 <= 1.121, `đánh: giãn ngang tới ${sx1.toFixed(3)} (đỉnh ~1,12)`);
  check(sy0 <= 0.95 && sy0 >= 0.919, `đánh: nén dọc xuống ${sy0.toFixed(3)} (đáy ~0,92)`);
  check(
    f1 - f0 < 0.01,
    `đánh: chân đứng yên khi co giãn (đáy sprite ${f0.toFixed(3)}..${f1.toFixed(3)})`,
  );
  const lastStrike = a[a.length - 1];
  check(
    lastStrike[1] === 1 && lastStrike[2] === 1 && lastStrike[0] === BASE_Y,
    `đánh xong: về đúng tỉ lệ 1 / vị trí gốc (${lastStrike
      .slice(0, 3)
      .map((v) => v.toFixed(3))
      .join(", ")})`,
  );

  // 5) Bị đánh (mình): nén dọc mạnh hơn đánh (~0,88), ưu tiên hơn đánh, rồi về 1
  a = await sample(
    ME,
    450,
    `sc.onDmg({ target: sc.sid, amount: 7, x: sc.predX, y: sc.predY - 20, toPlayer: true })`,
  );
  const [hsy] = range(a, 2);
  check(
    hsy <= 0.91 && hsy >= 0.879,
    `bị đánh: nén dọc xuống ${hsy.toFixed(3)} (đáy ~0,88, sâu hơn đánh)`,
  );
  const lastHurt = a[a.length - 1];
  check(
    lastHurt[1] === 1 && lastHurt[2] === 1 && lastHurt[0] === BASE_Y,
    `bị đánh xong: về đúng tỉ lệ 1 / vị trí gốc`,
  );

  // 6) Quái: đánh và bị đánh co giãn như người; quái thường gốc y = 0
  await evalJs(`(() => { const sc = window.__scene, me = sc.me();
    sc.state.monsters.set("m-tw", { kind: "tho", x: me.x - 120, y: me.y, hp: 40, maxHp: 40, angle: 0 }); return 1; })()`);
  await sleep(500);
  a = await sample(MON, 300);
  check(
    range(a, 0)[0] === 0 && range(a, 0)[1] === 0 && range(a, 1)[1] === 1,
    `quái đứng yên: không tween (y ${range(a, 0)[0]}..${range(a, 0)[1]})`,
  );
  const markHit = `(() => { const m = sc.monsters.get("m-tw"); m.monAnim.hurtUntil = sc.time.now + 167; })()`;
  a = await sample(MON, 400, markHit);
  check(
    range(a, 2)[0] <= 0.91 && range(a, 1)[1] >= 1.07,
    `quái bị đánh: co giãn (scaleX tới ${range(a, 1)[1].toFixed(3)}, scaleY xuống ${range(a, 2)[0].toFixed(3)})`,
  );
  const markAtk = `(() => { const m = sc.monsters.get("m-tw"); m.monAnim.attackUntil = sc.time.now + 250; })()`;
  a = await sample(MON, 400, markAtk);
  check(
    range(a, 1)[1] >= 1.08 && range(a, 3)[1] - range(a, 3)[0] < 0.01,
    `quái đánh: giãn ngang tới ${range(a, 1)[1].toFixed(3)}, chân đứng yên`,
  );
  const lastMon = a[a.length - 1];
  check(lastMon[1] === 1 && lastMon[2] === 1 && lastMon[0] === 0, `quái đánh xong: về đúng gốc`);

  // 7) Bậc Thấp: không tween (đòn đánh / bị đánh / đi đều giữ nguyên sprite)
  await setQuality("low");
  a = await sample(ME, 450, `${ME}.slashUntil = sc.time.now + 220`);
  check(
    range(a, 1)[1] === 1 && range(a, 2)[0] === 1,
    `bậc Thấp: đánh không co giãn (scaleX ${range(a, 1)[1]}, scaleY ${range(a, 2)[0]})`,
  );
  a = await sample(BOT(NEAR), 700, "", walk);
  check(
    range(a, 0)[0] === BASE_Y && range(a, 0)[1] === BASE_Y,
    `bậc Thấp: đi không nhấp nhô (y ${range(a, 0)[0]}..${range(a, 0)[1]})`,
  );

  // 8) Giảm chuyển động (bậc Cao): không tween
  await setQuality("high");
  await setReduced(true);
  a = await sample(ME, 450, `${ME}.slashUntil = sc.time.now + 220`);
  check(
    range(a, 1)[1] === 1 && range(a, 2)[0] === 1,
    `giảm chuyển động: đánh không co giãn (scaleX ${range(a, 1)[1]}, scaleY ${range(a, 2)[0]})`,
  );
  a = await sample(BOT(NEAR), 700, "", walk);
  check(
    range(a, 0)[0] === BASE_Y && range(a, 0)[1] === BASE_Y,
    `giảm chuyển động: đi không nhấp nhô (y ${range(a, 0)[0]}..${range(a, 0)[1]})`,
  );
  await setReduced(false);

  // 9) Tắt tween GIỮA chừng trả sprite về gốc (đổi sang bậc Thấp khi đang nhấp nhô: không kẹt lệch)
  await setQuality("high");
  const midSwitch = await evalJs(`new Promise((resolve) => {
    const sc = window.__scene, e = sc.players.get("${NEAR}"); let dir = 1, bx = null, n = 0, done = false;
    const tick = () => {
      const p = sc.state.players.get("${NEAR}"); if (bx === null) bx = p.px;
      if (Math.abs(p.px - bx) > 40) dir *= -1; p.x = p.px = p.px + 2 * dir;
      n++;
      if (n === 30) { const c = document.getElementById("set-quality"); c.value = "low"; c.dispatchEvent(new Event("change")); }
      if (n > 60) { if (!done) { done = true; setTimeout(() => resolve(JSON.stringify([e.sprite.y, e.sprite.scaleX, e.sprite.scaleY])), 100); } return; }
      requestAnimationFrame(tick);
    };
    tick();
  })`).then((v) => JSON.parse(v));
  check(
    midSwitch[0] === BASE_Y && midSwitch[1] === 1 && midSwitch[2] === 1,
    `đổi sang bậc Thấp giữa lúc đang đi: sprite về đúng gốc (${midSwitch.join(", ")})`,
  );

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
