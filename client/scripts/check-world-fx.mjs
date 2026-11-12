/* global console, setTimeout, fetch, process, Buffer */
// Kiểm hiệu ứng thế giới (đồ rơi theo độ hiếm, lấp lánh, nhặt đồ, cổng truyền tống xoáy) trong Chrome thật (M5.2 #329). Cần client đang chạy
// (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-world-fx.mjs [--url http://127.0.0.1:5183] [--shot docs/screenshots/combat-fx.webp]
// Đo số HẠT SỐNG THẬT của Phaser, trạng thái chớp của camera VÀ điểm ảnh thật trên canvas (so với ảnh nền không hiệu ứng).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
const CDP_PORT = 40400 + Math.floor(Math.random() * 300);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-world-fx-"));
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
  const snap = (name) =>
    evalJs(`new Promise((resolve) => {
      const s = window.__scene, r = s.game.canvas.getBoundingClientRect();
      s.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data; resolve(1);
      });
    })`);
  const diff = (a, b) =>
    evalJs(`(() => { const A = window[${JSON.stringify(a)}], B = window[${JSON.stringify(b)}]; let n = 0;
      for (let i = 0; i < A.length; i += 4)
        if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 60) n++;
      return n; })()`);
  const wait = async (ms) => sleep(ms);
  /** Đặt đồ rơi vào state (như server) ngay cạnh nhân vật. */
  const putLoot = (id, itemId, dx = 40) =>
    evalJs(
      `(() => { const sc = window.__scene; sc.state.loot.set(${JSON.stringify(id)}, { itemId: ${JSON.stringify(itemId)}, x: sc.predX + ${dx}, y: sc.predY, qty: 1, owner: "" }); return 1; })()`,
    );
  const delLoot = (id) => evalJs(`window.__scene.state.loot.delete(${JSON.stringify(id)}); 1`);
  const clearFx = async () => {
    await evalJs("window.__fx.clear(); 0");
    await sleep(1700);
  };

  // Đồ có sẵn lúc vào cảnh không nổ hạt "xuất hiện" (lần đồng bộ đầu): đã qua giai đoạn đó, nhưng kiểm lại bên dưới bằng đồ mới
  await clearFx();
  check((await alive()) === 0, "ban đầu không hạt");

  // 1) Đồ thường (độ hiếm 0) xuất hiện: 5 hạt; đồ lam (2): 9 hạt
  await putLoot("l-thuong", "hoi_huyet_dan", 40);
  await wait(120);
  let n = await alive();
  check(n > 0 && n <= 5, `đồ thường xuất hiện: ${n} hạt (loot-drop-low 5)`);
  await clearFx();
  await putLoot("l-lam", "vay_mang", -40);
  await wait(120);
  n = await alive();
  check(n > 5 && n <= 9 + 2, `đồ lam xuất hiện: ${n} hạt (loot-drop-mid 9, cộng lấp lánh)`);
  await clearFx();

  // 2) Lấp lánh định kỳ chỉ trên đồ từ lam trở lên: đồ lam còn đó thì có hạt lặp lại; đồ thường thì không
  await delLoot("l-lam");
  await wait(300);
  await clearFx();
  let seen = 0;
  for (let k = 0; k < 20; k++) {
    await sleep(100);
    if ((await alive()) > 0) seen++;
  }
  check(seen === 0, `chỉ còn đồ thường: không lấp lánh (${seen}/20 lần đo có hạt)`);
  await putLoot("l-lam2", "vay_mang", -40);
  await wait(1900); // qua đợt nổ xuất hiện
  seen = 0;
  for (let k = 0; k < 30; k++) {
    await sleep(100);
    if ((await alive()) > 0) seen++;
  }
  check(seen >= 4, `đồ lam: lấp lánh lặp lại (${seen}/30 lần đo có hạt)`);
  await delLoot("l-lam2");
  await clearFx();

  // 3) Nhặt đồ: nhặt của mình -> đốm bay lên (loot-pickup 8); đồ biến mất vì lý do khác (người khác nhặt / hết hạn) -> không nổ
  await delLoot("l-thuong");
  await clearFx();
  await putLoot("l-a", "hoi_huyet_dan", 30);
  await wait(300);
  await clearFx();
  await evalJs(
    `(() => { const sc = window.__scene; sc.nearestLootId = "l-a"; sc.pickupNearest(); return 1; })()`,
  );
  await delLoot("l-a");
  await wait(150);
  n = await alive();
  check(n > 0 && n <= 8, `mình nhặt đồ: ${n} hạt (loot-pickup 8)`);
  await clearFx();
  await putLoot("l-b", "hoi_huyet_dan", 30);
  await wait(300);
  await clearFx();
  await delLoot("l-b"); // không nhặt
  await wait(150);
  check((await alive()) === 0, "đồ biến mất mà mình không nhặt: không nổ hạt nhặt đồ");

  // Mình đang nhặt món C; món D (khác id) biến mất trước -> KHÔNG nổ hạt nhặt đồ cho D; C biến mất -> có
  await putLoot("l-c", "hoi_huyet_dan", 30);
  await putLoot("l-d", "hoi_huyet_dan", -30);
  await wait(300);
  await clearFx();
  await evalJs(
    `(() => { const sc = window.__scene; sc.nearestLootId = "l-c"; sc.pickupNearest(); return 1; })()`,
  );
  await delLoot("l-d");
  await wait(150);
  check((await alive()) === 0, "món khác id biến mất khi mình đang nhặt món C: không nổ hạt");
  await delLoot("l-c");
  await wait(150);
  n = await alive();
  check(n > 0 && n <= 8, `món C (đang nhặt) biến mất: ${n} hạt nhặt đồ`);
  await clearFx();

  // 4) Cổng truyền tống xoáy: đứng cạnh cổng Bắc Môn Quan, đốm tím liên tục; đo ĐIỂM ẢNH so với ảnh khi chặn phát
  await evalJs(`(() => {
    const sc = window.__scene, p = sc.map.portals[0];
    sc.predX = p.x; sc.predY = p.y + 90;
    sc.cameras.main.centerOn(p.x, p.y + 40);
    for (const q of sc.map.portals) sc.portalFxAt.set(q.id, 1e12); // chặn phát để lấy ảnh đối chứng
    return 1;
  })()`);
  // Ẩn hình cổng (có hoạt ảnh quay) để nền tĩnh: chỉ còn hạt là thứ thay đổi
  await evalJs(
    `(() => { for (const o of window.__scene.portalVisuals) o.setVisible(false); return 1; })()`,
  );
  await clearFx();
  await snap("c1");
  await sleep(1000); // cùng khoảng thời gian với phép đo hạt bên dưới
  await snap("c2");
  const noise = await diff("c1", "c2");
  console.log(`    (nhiễu nền giữa hai ảnh cách 1 s khi chặn phát: ${noise} điểm ảnh)`);
  await evalJs(`(() => { window.__scene.portalFxAt.clear(); return 1; })()`);
  let best = 0;
  let peakAlive = 0;
  seen = 0;
  for (let k = 0; k < 24; k++) {
    await sleep(100);
    const a = await alive();
    if (a > 0) seen++;
    peakAlive = Math.max(peakAlive, a);
    if (k >= 8 && k % 4 === 0) {
      await snap("s");
      best = Math.max(best, await diff("c2", "s"));
    }
  }
  check(
    seen >= 20 && peakAlive <= 40,
    `cổng xoáy: đốm sáng liên tục (${seen}/24 lần đo, đỉnh ${peakAlive} hạt)`,
  );
  check(
    best - noise > 100,
    `cổng xoáy: ${best} điểm ảnh khác ảnh chặn phát (nhiễu ${noise}; hạt thật sự được vẽ, vượt > 100)`,
  );

  // Ảnh chụp (tuỳ chọn --shot <tệp.webp>): cổng xoáy + đồ lam vừa rơi + nhặt đồ
  const si = process.argv.indexOf("--shot");
  if (si >= 0 && process.argv[si + 1]) {
    await evalJs(
      `(() => { const sc = window.__scene; sc.predX = sc.map.portals[0].x; sc.predY = sc.map.portals[0].y + 90; 1; })()`,
    );
    await putLoot("l-shot", "vay_mang", -60);
    await sleep(900);
    const pos = await J(`(() => {
      const sc = window.__scene, cam = sc.cameras.main, r = sc.game.canvas.getBoundingClientRect();
      const sx = r.width / sc.scale.width, sy = r.height / sc.scale.height, p = sc.map.portals[0];
      return { x: r.left + (p.x - cam.worldView.x) * cam.zoom * sx, y: r.top + (p.y - cam.worldView.y) * cam.zoom * sy };
    })()`);
    const shot = await send("Page.captureScreenshot", {
      format: "webp",
      quality: 90,
      clip: {
        x: Math.max(0, pos.x - 170),
        y: Math.max(0, pos.y - 110),
        width: 340,
        height: 280,
        scale: 2,
      },
    });
    fs.writeFileSync(process.argv[si + 1], Buffer.from(shot.result.data, "base64"));
    console.log(`    (đã chụp ${process.argv[si + 1]})`);
    await delLoot("l-shot");
  }

  // 5) Chặn tiết kiệm: hạt cổng là ưu tiên 0, đông cổng cũng không vượt trần (kiểm ngân sách chung đã có ở e2e:fx)
  check(
    (await evalJs("window.__fx.stats().liveParticles")) <=
      (await evalJs("window.__fx.stats().particleLimit")),
    "hạt sống không vượt trần ngân sách",
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
