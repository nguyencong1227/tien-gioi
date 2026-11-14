import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process */
// Kiểm đoán trước di chuyển theo trạng thái của chính mình (M7.2b, StatusEntry.ratio + moveSpeedMul dùng chung): giữ phím mũi tên THẬT qua CDP, đo
// quãng đường mỗi `input` ở client khi (a) không có gì, (b) tăng tốc +40 %, (c) tê cóng 50 %, (d) cả hai, (e) hết hạn, (f) choáng (không gửi `input`,
// đứng yên), rồi (g) `reconcile` chạy lại input chưa xác nhận với CÙNG hệ số (khớp vị trí đoán trước) và bỏ qua khi choáng, (h) đổi bản đồ xoá danh sách.
// Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-status-speed.mjs [--url http://127.0.0.1:5183]
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-status-speed-"));
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
const near = (a, b, tol) => Math.abs(a - b) <= tol;
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
    source: "try{localStorage.setItem('tg_newbie_guide_dismissed','1')}catch(e){}",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
  for (let k = 0; k < 40; k++) {
    await sleep(300);
    if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())")) break;
  }
  await sleep(600);

  // Đếm `input` gửi đi (mock chỉ in log); mock không chạy đối chiếu nên tự đặt predX / predY về chỗ đứng của máy chủ trước mỗi pha
  await evalJs(`(() => {
    const sc = window.__scene; window.__inputs = 0;
    const orig = sc.room.send.bind(sc.room);
    sc.room.send = (t, d) => { if (t === "input") window.__inputs++; return orig(t, d); };
    return 1; })()`);
  // Chỗ đứng mặc định của mock (512, 896) nằm trong ô chặn nên đi không nhúc nhích: đặt cả máy chủ giả lẫn đoán trước vào giữa trấn (thoáng)
  const spot = JSON.parse(await evalJs("JSON.stringify(window.__scene.map.townPx)"));
  const reset = () =>
    evalJs(`(() => { const sc = window.__scene, me = sc.me();
      me.x = ${spot.x}; me.y = ${spot.y};
      sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0; window.__inputs = 0;
      sc.cameras.main.centerOn(me.x, me.y); return 1; })()`);
  const pos = () =>
    evalJs("JSON.stringify({ x: window.__scene.predX, y: window.__scene.predY })").then(JSON.parse);
  const keyEv = (type) =>
    send("Input.dispatchKeyEvent", {
      type,
      code: "ArrowRight",
      key: "ArrowRight",
      windowsVirtualKeyCode: 39,
      nativeVirtualKeyCode: 39,
    });
  // Qua đúng đường tin nhắn: mock room phát tin "status" tới handler mà cảnh đã đăng ký (đột biến bỏ đăng ký handler sẽ đỏ)
  const setStatus = (list) =>
    evalJs(`window.__scene.room.emit("status", { list: ${JSON.stringify(list)} }); 1`);
  /** Giữ mũi tên phải `ms` ms: trả quãng đường (px) mỗi input và số input đã gửi */
  const hold = async (ms = 700) => {
    await reset();
    const a = await pos();
    await keyEv("rawKeyDown");
    await sleep(ms);
    await keyEv("keyUp");
    await sleep(120);
    const b = await pos();
    const n = await evalJs("window.__inputs");
    return { n, dx: b.x - a.x, dy: b.y - a.y, per: n > 0 ? (b.x - a.x) / n : 0 };
  };

  console.log("--- Đoán trước theo trạng thái (mock, phím thật) ---");
  await setStatus([]);
  const base = await hold();
  console.log("  nền:", JSON.stringify(base));
  check(
    base.n >= 8 && base.per > 1,
    `không có trạng thái: đi được (${base.n} input, ${base.per.toFixed(3)} px/input)`,
  );

  await setStatus([["haste", 8000, 0.4]]);
  const fast = await hold();
  check(
    fast.n >= 8 && near(fast.per / base.per, 1.4, 0.01),
    `tăng tốc +40%: quãng đường mỗi input x${(fast.per / base.per).toFixed(4)} (mong đợi 1,4)`,
  );

  await setStatus([["chill", 8000, 0.5]]);
  const slow = await hold();
  check(
    slow.n >= 8 && near(slow.per / base.per, 0.5, 0.01),
    `tê cóng 50%: x${(slow.per / base.per).toFixed(4)} (mong đợi 0,5)`,
  );

  await setStatus([
    ["haste", 8000, 0.4],
    ["chill", 8000, 0.5],
  ]);
  const both = await hold();
  check(
    both.n >= 8 && near(both.per / base.per, 0.7, 0.01),
    `cả hai: (1 + 0,4) x (1 - 0,5) = x${(both.per / base.per).toFixed(4)} (mong đợi 0,7)`,
  );

  await setStatus([["haste", 8000, 99]]);
  const clamped = await hold();
  check(
    near(clamped.per / base.per, 1.6, 0.01),
    `cường độ rác 99 bị kẹp theo maxRatio 0,6: x${(clamped.per / base.per).toFixed(4)} (mong đợi 1,6)`,
  );

  await setStatus([["haste", 300, 0.4]]);
  await sleep(500);
  const expired = await hold();
  check(
    near(expired.per / base.per, 1, 0.01),
    `tăng tốc 300 ms đã hết hạn: về x${(expired.per / base.per).toFixed(4)} (mong đợi 1)`,
  );

  await setStatus([["stun", 8000]]);
  const stun = await hold();
  check(
    stun.n === 0 && stun.dx === 0,
    `choáng: KHÔNG gửi input (${stun.n}) và đứng yên (dx ${stun.dx})`,
  );
  const moving = await evalJs("window.__scene.moving");
  check(moving === false, "choáng: cờ đang đi (hoạt ảnh) tắt");

  await setStatus([["stun", 300]]);
  await sleep(500);
  const afterStun = await hold();
  check(
    afterStun.n >= 8 && near(afterStun.per / base.per, 1, 0.01),
    `hết choáng thì đi lại bình thường (${afterStun.n} input)`,
  );

  console.log("\n--- Đối chiếu (reconcile) chạy lại input chưa xác nhận ---");
  await setStatus([["haste", 8000, 0.4]]);
  const r1 = await hold(500);
  const before = await pos();
  const meNow = JSON.parse(
    await evalJs("JSON.stringify({ x: window.__scene.me().x, y: window.__scene.me().y })"),
  );
  await evalJs("window.__scene.reconcile(); 1");
  const afterRec = await pos();
  check(
    near(afterRec.x, before.x, 0.01) &&
      near(afterRec.y, before.y, 0.01) &&
      afterRec.x > meNow.x + 5,
    `tăng tốc: đối chiếu cho đúng vị trí đã đoán trước (${before.x.toFixed(2)} -> ${afterRec.x.toFixed(2)}; ${r1.n} input chưa xác nhận)`,
  );
  await setStatus([["stun", 8000]]);
  await evalJs("window.__scene.reconcile(); 1");
  const stunRec = await pos();
  check(
    near(stunRec.x, meNow.x, 0.01),
    `đang choáng: đối chiếu KHÔNG chạy lại input chưa xác nhận (về ${stunRec.x.toFixed(2)} = máy chủ ${meNow.x.toFixed(2)})`,
  );

  console.log("\n--- Đổi bản đồ / nối lại xoá danh sách ---");
  await setStatus([
    ["haste", 8000, 0.4],
    ["stun", 8000],
  ]);
  check(
    (await evalJs("window.__scene.status.empty")) === false,
    "có danh sách trước khi đổi bản đồ",
  );
  await evalJs(
    `(() => { const sc = window.__scene; sc.changeMap(sc.room, window.__getMap("hac_phong")); return 1; })()`,
  );
  await sleep(300);
  check(
    (await evalJs("window.__scene.status.empty")) === true,
    "changeMap (qua cổng): danh sách trạng thái được xoá",
  );
  await setStatus([["haste", 8000, 0.4]]);
  await evalJs(`(() => { const sc = window.__scene; sc.attachRoom(sc.room); return 1; })()`);
  check(
    (await evalJs("window.__scene.status.empty")) === true,
    "attachRoom (nối lại): danh sách được xoá (server gửi lại danh sách đúng)",
  );

  console.log("\n--- Tin hỏng không làm văng ---");
  for (const bad of [
    "undefined",
    "null",
    "5",
    '"x"',
    "{}",
    "{ list: 5 }",
    '{ list: [null, "x", [1,2,3]] }',
  ]) {
    await evalJs(`window.__scene.room.emit("status", ${bad}); 1`);
  }
  check(
    (await evalJs("window.__scene.status.empty")) === true,
    "tin hỏng: danh sách rỗng, không ném lỗi",
  );
  check(pageErrors === 0, `0 lỗi console / exception (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  await sleep(600);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    // dọn thư mục tạm không bắt buộc
  }
}
if (failures > 0) {
  console.log(`\n✗ ${failures} kiểm tra ĐỎ`);
  process.exit(1);
}
console.log("\n🎉 KIỂM ĐOÁN TRƯỚC DI CHUYỂN THEO TRẠNG THÁI PASS 100%!");
