/* global console, setTimeout, fetch, process */
// Kiểm hoạt ảnh người chơi bị đánh / gục trong Chrome thật (M5.2 #328 phần 2). Cần client đang chạy (npm run dev -w client).
// Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server: đặt `dead` trên người chơi mock và gọi `scene.onDmg` như tin `dmg`.
//   node client/scripts/check-anim.mjs [--url http://127.0.0.1:5183]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
const CDP_PORT = 39500 + Math.floor(Math.random() * 300);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-anim-"));
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
    source: "try{localStorage.setItem('tg_newbie_guide_dismissed','1')}catch(e){}",
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

  // Ghi lại mọi lần Sprite.play bắt đầu bằng me- / other- / robe-
  await evalJs(`(() => {
    const sc = window.__scene;
    window.__plays = [];
    const e = sc.players.get(sc.sid);
    const S = Object.getPrototypeOf(e.sprite);
    const orig = S.play;
    S.play = function (k, ...a) {
      const key = typeof k === "string" ? k : k && k.key;
      if (key && /^(me|other|robe-)/.test(key)) window.__plays.push(key);
      return orig.call(this, k, ...a);
    };
    0;
  })()`);
  const st = () =>
    J(
      `(() => { const sc = window.__scene; const e = sc.players.get(sc.sid); return { state: e.playerAnimState, key: e.sprite.anims.currentAnim ? e.sprite.anims.currentAnim.key : null, plays: window.__plays.slice() }; })()`,
    );

  let s = await st();
  check(s.state === "idle" && /-idle-/.test(s.key ?? ""), `ban đầu đứng (${s.state} / ${s.key})`);

  // 1) Bị đánh: tin dmg toPlayer đúng người chơi
  await evalJs(
    `(() => { const sc = window.__scene; sc.onDmg({ target: sc.sid, amount: 7, x: sc.predX, y: sc.predY - 20, toPlayer: true }); 0; })()`,
  );
  await sleep(70);
  s = await st();
  check(
    s.state === "hurt" && /-hurt-/.test(s.key ?? ""),
    `trúng đòn: chớp bị đánh (${s.state} / ${s.key})`,
  );
  await sleep(400);
  s = await st();
  check(
    s.state === "idle" && /-idle-/.test(s.key ?? ""),
    `hết giật lùi: về đứng (${s.state} / ${s.key})`,
  );

  // 2) Tin dmg lên QUÁI (toPlayer sai) không làm người chơi chớp
  await evalJs(
    `(() => { const sc = window.__scene; sc.onDmg({ target: "khong-co-quai", amount: 3, x: sc.predX, y: sc.predY, crit: false }); 0; })()`,
  );
  await sleep(70);
  s = await st();
  check(s.state === "idle", `sát thương lên quái không làm mình chớp (${s.state})`);

  // 3) Gục: p.dead = true -> me-die 4 khung rồi nằm lại; hồi sinh -> đứng
  await evalJs(
    `(() => { const sc = window.__scene; sc.state.players.get(sc.sid).dead = true; 0; })()`,
  );
  await sleep(150);
  s = await st();
  check(
    s.state === "die" && /-die$/.test(s.key ?? ""),
    `gục: hoạt ảnh gục (${s.state} / ${s.key})`,
  );
  await sleep(700);
  const last = await J(
    `(() => { const sc = window.__scene; const e = sc.players.get(sc.sid); const a = e.sprite.anims; return { playing: a.isPlaying, frame: a.currentFrame ? a.currentFrame.textureFrame : null, alpha: e.root.alpha }; })()`,
  );
  check(
    last.playing === false && /-die-3$/.test(last.frame ?? ""),
    `gục xong dừng ở khung cuối (${last.frame}, đang chạy: ${last.playing})`,
  );
  check(last.alpha < 0.5, `xác mờ như trước (alpha ${last.alpha})`);
  await evalJs(
    `(() => { const sc = window.__scene; sc.state.players.get(sc.sid).dead = false; 0; })()`,
  );
  await sleep(200);
  s = await st();
  check(
    s.state === "idle" && /-idle-/.test(s.key ?? ""),
    `hồi sinh: về đứng (${s.state} / ${s.key})`,
  );

  // 4) Giảm chuyển động: không chớp bị đánh (gục vẫn đổi tư thế vì là trạng thái, không phải hiệu ứng)
  await evalJs(
    `localStorage.setItem("tg_reduced_motion", "1"); document.querySelector("#set-reduced-motion") && 0; 0`,
  );
  await evalJs(
    `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = true; c.dispatchEvent(new Event("change")); })()`,
  );
  await sleep(200);
  await evalJs(
    `(() => { const sc = window.__scene; sc.onDmg({ target: sc.sid, amount: 7, x: sc.predX, y: sc.predY - 20, toPlayer: true }); 0; })()`,
  );
  await sleep(70);
  s = await st();
  check(s.state === "idle", `giảm chuyển động: trúng đòn không chớp (${s.state})`);

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
