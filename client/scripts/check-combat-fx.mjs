/* global console, setTimeout, fetch, process */
// Kiểm hiệu ứng chiến đấu (hạt, rung, chữ bay, hồi máu, quái tan) trong Chrome thật (M5.2 #329). Cần client đang chạy
// (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-combat-fx.mjs [--url http://127.0.0.1:5183] [--shot docs/screenshots/combat-fx.webp]
// Đo số HẠT SỐNG THẬT của Phaser (không đọc sổ ngân sách) và trạng thái rung của camera.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
const CDP_PORT = 39800 + Math.floor(Math.random() * 300);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-combat-fx-"));
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
  const shaking = () => evalJs("window.__scene.cameras.main.shakeEffect.isRunning");
  const floats = () => evalJs("window.__fx.stats().floatsActive");
  /** Chờ rung cũ tắt và hạt cũ tan để mỗi ca đo độc lập. */
  const settle = async () => {
    await evalJs("window.__scene.cameras.main.resetFX(); 0");
    await sleep(1100);
  };
  /** Phát tin dmg như server gửi (đi qua đúng đường onHitFx), `mine` bằng cách giả lập một đòn vừa ra. */
  const dmg = (o, mine) =>
    evalJs(`(() => {
      const sc = window.__scene;
      sc.lastAttack = ${mine ? "{ at: sc.time.now, range: 64 }" : "null"};
      sc.onHitFx(Object.assign({ x: sc.predX + 30, y: sc.predY }, ${JSON.stringify(o)}));
      return 1;
    })()`);

  await settle();
  check((await alive()) === 0 && (await floats()) === 0, "ban đầu không hạt, không chữ bay");

  // 1) Mình đánh thường: tia lửa + chữ, KHÔNG rung
  await dmg({ target: "quai-1", amount: 12 }, true);
  await sleep(60);
  let n = await alive();
  check(n > 0 && n <= 8, `đòn thường: ${n} hạt sống (hit-spark 8)`);
  check(!(await shaking()), "đòn thường không rung màn hình");
  check((await floats()) === 1, "đòn thường: một chữ bay");
  await settle();

  // 2) Mình chí mạng: nhiều hạt hơn + rung nhẹ (ưu tiên 2, hồ sơ Cao cho rung)
  await dmg({ target: "quai-1", amount: 40, crit: true }, true);
  await sleep(60);
  n = await alive();
  check(n > 8 && n <= 16, `chí mạng của mình: ${n} hạt (hit-heavy 16)`);
  check(Boolean(await shaking()), "chí mạng của mình: màn hình rung nhẹ");
  await settle();

  // 3) Người khác chí mạng gần mình: có hạt nhưng KHÔNG rung màn hình của mình
  await dmg({ target: "quai-1", amount: 40, crit: true }, false);
  await sleep(60);
  n = await alive();
  check(n > 0, `chí mạng của người khác: ${n} hạt`);
  check(!(await shaking()), "chí mạng của người khác không làm màn hình mình rung");
  await settle();

  // 4) Mình bị đánh nặng (>= 15 % khí huyết tối đa 2500): hạt đỏ + rung; bị đánh nhẹ: không rung
  await dmg({ target: "mock-session-01", amount: 500, toPlayer: true }, false);
  await sleep(60);
  check(Boolean(await shaking()), "bị đòn nặng (500 / 2500): màn hình rung");
  await settle();
  await dmg({ target: "mock-session-01", amount: 30, toPlayer: true }, false);
  await sleep(60);
  n = await alive();
  check(n > 0 && !(await shaking()), `bị đòn nhẹ: ${n} hạt, không rung`);
  await settle();

  // 5) Hồi máu: khí huyết nhảy một bước lớn -> chữ "+N" xanh + hạt; hồi tự nhiên nhỏ thì không
  await evalJs(`(() => { window.__scene.state.players.get(window.__scene.sid).hp = 1000; 0; })()`);
  await sleep(250);
  await settle();
  const before = await floats();
  await evalJs(`(() => { window.__scene.state.players.get(window.__scene.sid).hp = 1003; 0; })()`);
  await sleep(150);
  check((await floats()) === before, "hồi tự nhiên (+3) không có chữ bay");
  await evalJs(`(() => { window.__scene.state.players.get(window.__scene.sid).hp = 1600; 0; })()`);
  await sleep(150);
  const txt = await evalJs(
    `window.__scene.children.list.filter((c) => c.type === 'BitmapText' && c.visible).map((c) => c.text).join('|')`,
  );
  check(/\+597/.test(txt ?? ""), `hồi máu lớn: chữ "+597" (${txt})`);
  check((await alive()) > 0, "hồi máu lớn: có hạt heal-glow");
  await settle();

  // 6) Quái biến khỏi state ngay trong màn hình: tan thành điểm sáng
  await evalJs(`(() => {
    const sc = window.__scene;
    sc.state.monsters.set("t-quai", { kind: "tho", x: sc.predX + 80, y: sc.predY, hp: 40, maxHp: 40, angle: 0 });
    0;
  })()`);
  await sleep(400);
  check((await alive()) === 0, "quái đang đứng yên: chưa có hạt");
  await evalJs(`window.__scene.state.monsters.delete("t-quai"); 0`);
  await sleep(120);
  n = await alive();
  check(n > 0 && n <= 12, `quái gục trong màn hình: ${n} hạt tan (mon-vanish 12)`);
  await settle();
  // ...còn quái ở xa ngoài khung camera rồi mới biến (rời vùng nhìn) thì KHÔNG nổ hạt
  await evalJs(`(() => {
    const sc = window.__scene;
    sc.state.monsters.set("t-xa", { kind: "tho", x: sc.predX + 3000, y: sc.predY, hp: 40, maxHp: 40, angle: 0 });
    0;
  })()`);
  await sleep(400);
  await evalJs(`window.__scene.state.monsters.delete("t-xa"); 0`);
  await sleep(120);
  check((await alive()) === 0, "quái rời vùng nhìn (ngoài camera): không nổ hạt");

  // Ảnh chụp (tuỳ chọn --shot <tệp.webp>): chí mạng + bị đòn nặng + hồi máu cùng lúc, phóng to quanh nhân vật
  const si = process.argv.indexOf("--shot");
  if (si >= 0 && process.argv[si + 1]) {
    await settle();
    await dmg({ target: "quai-1", amount: 88, crit: true }, true);
    await dmg({ target: "mock-session-01", amount: 420, toPlayer: true }, false);
    await evalJs(`(() => { const sc = window.__scene; sc.state.players.get(sc.sid).hp = 900; 0; })()`);
    await sleep(200);
    await settle();
    await evalJs(`(() => { const sc = window.__scene; sc.state.players.get(sc.sid).hp = 1700; 0; })()`);
    await dmg({ target: "quai-1", amount: 88, crit: true }, true);
    await dmg({ target: "mock-session-01", amount: 420, toPlayer: true }, false);
    await sleep(110);
    // Vị trí nhân vật trên màn hình (CSS px) = (toạ độ thế giới - góc nhìn camera) * thu phóng * tỉ lệ canvas / DPR
    const pos = await J(`(() => {
      const sc = window.__scene, cam = sc.cameras.main, r = sc.game.canvas.getBoundingClientRect();
      const sx = r.width / sc.scale.width, sy = r.height / sc.scale.height;
      return { x: r.left + (sc.predX - cam.worldView.x) * cam.zoom * sx, y: r.top + (sc.predY - cam.worldView.y) * cam.zoom * sy, zoom: cam.zoom * sx };
    })()`);
    const shot = await send("Page.captureScreenshot", {
      format: "webp",
      quality: 90,
      clip: {
        x: Math.max(0, pos.x - 140),
        y: Math.max(0, pos.y - 130),
        width: 280,
        height: 220,
        scale: 2.5,
      },
    });
    console.log(`    (nhân vật ở ${Math.round(pos.x)},${Math.round(pos.y)} px, thu phóng ${pos.zoom})`);
    fs.writeFileSync(process.argv[si + 1], Buffer.from(shot.result.data, "base64"));
    console.log(`    (đã chụp ${process.argv[si + 1]})`);
    await settle();
  }

  // 7) Cảnh đông: 120 đòn của người khác (nửa chí mạng) trong ~1 giây không vượt ngân sách hạt / chữ bay của hồ sơ
  await settle();
  const lim = await J("window.__fx.stats()");
  let peak = 0;
  let peakFloats = 0;
  for (let k = 0; k < 120; k++) {
    await dmg({ target: "quai-" + (k % 7), amount: 10 + k, crit: k % 2 === 0 }, false);
    if (k % 6 === 5) {
      peak = Math.max(peak, await alive());
      peakFloats = Math.max(peakFloats, await floats());
      await sleep(50);
    }
  }
  const st = await J("window.__fx.stats()");
  console.log(
    `    (số đo: đỉnh ${peak} hạt sống / trần ${lim.particleLimit}; đỉnh ${peakFloats} chữ bay; bỏ ${st.dropped} hiệu ứng, ${st.floatsDropped} chữ)`,
  );
  check(peak > 0 && peak <= lim.particleLimit, `cảnh đông: hạt sống ${peak} <= trần ${lim.particleLimit}`);
  check(st.dropped > 0, `cảnh đông: ngân sách có bỏ bớt hiệu ứng ưu tiên thấp (${st.dropped})`);
  check(peakFloats <= 28, `cảnh đông: chữ bay ${peakFloats} <= damageNumbers (Cao 28)`);
  await settle();

  // 8) Giảm chuyển động: ít hạt hơn, không rung
  await evalJs(
    `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = true; c.dispatchEvent(new Event("change")); })()`,
  );
  await sleep(200);
  await settle();
  await dmg({ target: "quai-1", amount: 40, crit: true }, true);
  await sleep(60);
  n = await alive();
  check(n > 0 && n <= 6, `giảm chuyển động: ${n} hạt (16 x 0,3 ≈ 5)`);
  check(!(await shaking()), "giảm chuyển động: không rung");

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
