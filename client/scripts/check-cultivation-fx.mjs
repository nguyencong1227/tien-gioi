import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm hiệu ứng tu luyện (lên cấp, đột phá + chớp, đột phá thất bại, đốm sáng thiền định) trong Chrome thật (M5.2 #329). Cần client đang chạy
// (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-cultivation-fx.mjs [--url http://127.0.0.1:5183] [--shot docs/screenshots/combat-fx.webp]
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-cultivation-fx-"));
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
    // Sương trôi (#362) và thời tiết làm nền ĐỔI THEO THỜI GIAN nên phép so điểm ảnh / đối chứng nhiễu sai: các script đo hạt tắt hẳn
    // sương (không dựng lại khi đổi bậc chất lượng / bản đồ). Kiểm riêng sương nằm ở server/scripts/e2e-map.ts (Ca 7).
    sc.applyFog = () => {};
    sc.stepFog = () => {};
    for (const im of sc.fogImages || []) im.destroy();
    sc.fogImages = [];
    return 0;
  })()`);

  /** Số hạt đang SỐNG THẬT trong mọi emitter của cảnh. */
  const alive = () =>
    evalJs(
      `window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0)`,
    );
  const flashing = () => evalJs("window.__scene.cameras.main.flashEffect.isRunning");
  /** Chờ camera hội tụ (đồng hồ trò chơi >= 6,5 s, rồi 3 lần đọc liên tiếp bằng nhau, tối đa 8 s): camera còn đang nội suy về nhân vật thì ảnh chụp lệch 1 điểm ảnh làm "nhiễu nền" vọt lên (máy chậm / nhiều lớp phủ hơn => hội tụ muộn hơn). */
  const camStable = async () => {
    // Camera nội suy về nhân vật theo đồng hồ TRÒ CHƠI và chỉ "nhích" 1 điểm ảnh khi giá trị thực vượt mốc làm tròn (~3,9 s sau khi vào cảnh):
    // đọc scroll nguyên không thấy được phần lẻ nên chờ cho đồng hồ trò chơi qua 6,5 s (tối đa 30 s thật) rồi mới đo.
    for (let k = 0; k < 150; k++) {
      if (Number(await evalJs("window.__scene.time.now")) >= 6500) break;
      await sleep(200);
    }
    let prev = "";
    let same = 0;
    for (let k = 0; k < 53 && same < 3; k++) {
      await sleep(150);
      const cur = await evalJs(
        "JSON.stringify([window.__scene.cameras.main.scrollX, window.__scene.cameras.main.scrollY, window.__scene.cameras.main.zoom])",
      );
      same = cur === prev ? same + 1 : 0;
      prev = cur;
    }
  };
  const settle = async () => {
    await evalJs("window.__scene.cameras.main.resetFX(); 0");
    // Chờ hạt tan HẾT (thăm dò, tối đa 12 s): đồng hồ trò chơi chậm lại khi máy bận nên chờ cố định không đủ
    for (let k = 0; k < 120; k++) {
      await sleep(100);
      if (
        (await evalJs(
          `window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0)`,
        )) === 0 &&
        k >= 15
      )
        break;
    }
    await camStable();
  };
  /** Chụp canvas WebGL (điểm ảnh thật) vào window[name]. */
  const snap = (name) =>
    evalJs(`new Promise((resolve) => {
      const s = window.__scene, r = s.game.canvas.getBoundingClientRect();
      s.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data; resolve(1);
      });
    })`);
  /** Số điểm ảnh đổi đáng kể giữa hai ảnh chụp. */
  const diff = (a, b) =>
    evalJs(`(() => { const A = window[${JSON.stringify(a)}], B = window[${JSON.stringify(b)}]; let n = 0;
      for (let i = 0; i < A.length; i += 4)
        if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 60) n++;
      return n; })()`);
  /** Phát tin `fx` như server gửi (đi qua đúng đường onFx); by "me" = chính mình. */
  const fxMsg = (o) =>
    evalJs(`(() => {
      const sc = window.__scene, o = ${JSON.stringify(o)};
      if (o.by === "me") o.by = sc.sid;
      sc.onFx(Object.assign({ x: sc.predX, y: sc.predY }, o));
      return 1;
    })()`);

  /**
   * Chạy `js` TRONG trang, chờ 150 ms THỜI GIAN TRÒ CHƠI (hạt đã nở ra, không phụ thuộc máy bận hay rảnh) rồi chụp ở khung hình kế tiếp.
   */
  const act = (js, name) =>
    evalJs(`new Promise((resolve) => {
      const sc = window.__scene, r = sc.game.canvas.getBoundingClientRect(), t0 = sc.time.now;
      ${js};
      const shoot = () => {
        if (sc.time.now - t0 < 150) return void requestAnimationFrame(shoot);
        sc.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
          const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
          const x = c.getContext("2d"); x.drawImage(img, 0, 0);
          window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data; resolve(1);
        });
      };
      shoot();
    })`);
  const fxJs = (o) =>
    `{ const o = ${JSON.stringify(o)}; if (o.by === "me") o.by = sc.sid; sc.onFx(Object.assign({ x: sc.predX, y: sc.predY }, o)); }`;

  await settle();
  check((await alive()) === 0, "ban đầu không hạt");
  // Đối chứng: hai ảnh chụp liên tiếp KHÔNG hiệu ứng khác nhau bao nhiêu (hoạt ảnh nền); mọi phép so ảnh phải vượt mức này.
  // Đôi lúc ngay sau khi vào cảnh nền còn đổi MỘT lần (nhiễu 11972 điểm ảnh rồi về 0, xảy ra cả trên main chưa có sương): chờ nền
  // đứng yên (hai ảnh liên tiếp giống hệt), tối đa 8 lần, rồi mới lấy nhiễu làm đối chứng.
  let noise = -1;
  for (let k = 0; k < 8; k++) {
    await snap("base");
    await sleep(80);
    await snap("ctl");
    noise = await diff("base", "ctl");
    if (noise === 0) break;
    await sleep(300);
  }
  console.log(`    (nhiễu nền giữa hai ảnh không hiệu ứng: ${noise} điểm ảnh)`);

  // 1) Đột phá của mình: vòng nổ + cột sáng + chớp nhẹ, vẽ ra điểm ảnh thật
  await act(fxJs({ kind: "levelup", by: "me", major: true }), "a");
  let n = await alive();
  check(n > 0 && n <= 31, `đột phá của mình: ${n} hạt sống (3 vòng + 28 cột sáng)`);
  check(Boolean(await flashing()), "đột phá của mình: chớp nhẹ toàn màn hình");
  let d = await diff("base", "a");
  check(d > 300, `đột phá: ${d} điểm ảnh thật khác nền (gồm cả chớp toàn màn hình)`);
  await settle();

  // 2) Lên cấp thường của mình: có hạt, KHÔNG chớp
  await snap("pre");
  await act(fxJs({ kind: "levelup", by: "me", major: false }), "m");
  n = await alive();
  check(n > 0 && n <= 12, `lên cấp thường: ${n} hạt`);
  check(!(await flashing()), "lên cấp thường không chớp");
  // Không có chớp che: điểm ảnh khác nền chính là hạt vẽ ra thật (bài học #348: đếm đối tượng không chứng minh được có vẽ)
  d = await diff("pre", "m");
  check(
    d - noise > 200,
    `lên cấp thường: ${d} điểm ảnh khác nền (nhiễu ${noise}; hạt thật sự được vẽ, vượt > 200)`,
  );
  await settle();

  // 3) Người khác đột phá gần mình: có hạt nhưng KHÔNG chớp màn hình của mình
  await fxMsg({ kind: "levelup", by: "nguoi-khac", major: true });
  await sleep(120);
  n = await alive();
  check(n > 0, `người khác đột phá: ${n} hạt`);
  check(!(await flashing()), "người khác đột phá không làm màn hình mình chớp");
  await settle();

  // 4) Đột phá thất bại: khói tím vẽ ra thật
  await snap("pre");
  await act(fxJs({ kind: "breakfail", by: "me" }), "b");
  n = await alive();
  check(n > 0 && n <= 10, `đột phá thất bại: ${n} hạt khói`);
  d = await diff("pre", "b");
  check(
    d - noise > 150,
    `khói đột phá thất bại: ${d} điểm ảnh khác nền (nhiễu ${noise}; vượt > 150)`,
  );
  await settle();

  // 5) Đả tọa: đốm sáng tự phát định kỳ khi đang thiền, ngừng khi thôi
  await evalJs(
    `(() => { const sc = window.__scene; sc.state.players.get(sc.sid).meditating = true; 0; })()`,
  );
  let seen = 0;
  let peak = 0;
  for (let k = 0; k < 24; k++) {
    await sleep(100);
    const a = await alive();
    if (a > 0) seen++;
    peak = Math.max(peak, a);
  }
  check(
    seen >= 8 && peak <= 12,
    `đả tọa: đốm sáng xuất hiện liên tục (${seen}/24 lần đo, đỉnh ${peak} hạt)`,
  );
  await evalJs(
    `(() => { const sc = window.__scene; sc.state.players.get(sc.sid).meditating = false; 0; })()`,
  );
  await sleep(1700);
  check((await alive()) === 0, "thôi đả tọa: hết đốm sáng");
  await sleep(900);
  check((await alive()) === 0, "thôi đả tọa: không phát thêm");

  // Ảnh chụp (tuỳ chọn --shot <tệp.webp>): đột phá + lên cấp + khói cùng lúc
  const si = process.argv.indexOf("--shot");
  if (si >= 0 && process.argv[si + 1]) {
    await fxMsg({ kind: "levelup", by: "me", major: true });
    await sleep(380);
    const pos = await J(`(() => {
      const sc = window.__scene, cam = sc.cameras.main, r = sc.game.canvas.getBoundingClientRect();
      const sx = r.width / sc.scale.width, sy = r.height / sc.scale.height;
      return { x: r.left + (sc.predX - cam.worldView.x) * cam.zoom * sx, y: r.top + (sc.predY - cam.worldView.y) * cam.zoom * sy };
    })()`);
    const shot = await send("Page.captureScreenshot", {
      format: "webp",
      quality: 90,
      clip: {
        x: Math.max(0, pos.x - 170),
        y: Math.max(0, pos.y - 200),
        width: 340,
        height: 280,
        scale: 2,
      },
    });
    fs.writeFileSync(process.argv[si + 1], Buffer.from(shot.result.data, "base64"));
    console.log(`    (đã chụp ${process.argv[si + 1]})`);
    await settle();
  }

  // 6) Giảm chuyển động: ít hạt hơn, KHÔNG chớp
  await evalJs(
    `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = true; c.dispatchEvent(new Event("change")); })()`,
  );
  await sleep(200);
  await settle();
  await fxMsg({ kind: "levelup", by: "me", major: true });
  await sleep(120);
  n = await alive();
  check(n > 0 && n < 14, `giảm chuyển động: ${n} hạt (31 x 0,3 ≈ 10)`);
  check(!(await flashing()), "giảm chuyển động: không chớp");

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
