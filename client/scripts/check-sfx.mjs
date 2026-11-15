import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process */
// Kiểm ÂM THANH HIỆU ỨNG chiến đấu M7 (#508 (a); A chốt: tổng hợp bằng mã, không gói âm thanh) trong Chrome THẬT, `?skills=mock`, không cần máy chủ: bọc `AudioContext` (tiêm TRƯỚC khi tải trang)
// để ĐẾM dao động / nguồn nhiễu được tạo, rồi bơm đúng các tin của máy chủ qua `window.__scene` (như leak-test): fx `cast` của mình (hệ + hình khác nhau cho số thành phần khác nhau: vòng nổ nhiều hơn tia),
// fx `cast` của người khác ngoài tầm nhìn (im) / trong tầm nhìn (có tiếng), fx `bolt` của quái, tin `status` (trạng thái MỚI có tiếng, làm mới trạng thái đã có thì im, loại lợi cũng có),
// chống dồn (hai chiêu cùng lúc chỉ kêu một lần), và ổn định (không lỗi JS). Mở khoá âm bằng PHÍM THẬT (chính sách autoplay: Audio chỉ mở sau cử chỉ người dùng).
// Có thể chạy trên máy không loa: Web Audio vẫn chạy (không cần thiết bị ra). Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-sfx.mjs [--url http://127.0.0.1:5183]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE_URL = (() => {
  const i = process.argv.indexOf("--url");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
})();
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-sfx-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--autoplay-policy=no-user-gesture-required",
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
    // đếm số nguồn âm Web Audio được tạo (dao động + nguồn đệm nhiễu) do `SoundEngine.playSfx` (chỉ ÂM HIỆU ỨNG chiến đấu M7: nhạc nền `tickBgm` cũng tạo dao động nên phải loại, nhận ra bằng stack; chạy trên bản dev của Vite có tên hàm)
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_muted');
      window.__sfx = { osc: 0, noise: 0 };
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) {
        const co = C.prototype.createOscillator, cb = C.prototype.createBufferSource;
        C.prototype.createOscillator = function () { if (new Error().stack.includes('playSfx')) window.__sfx.osc++; return co.apply(this, arguments); };
        C.prototype.createBufferSource = function () { if (new Error().stack.includes('playSfx')) window.__sfx.noise++; return cb.apply(this, arguments); };
      }}catch(e){}`,
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=4&realm=4&debug=1` });
  for (let k = 0; k < 50; k++) {
    await sleep(300);
    if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())")) break;
  }
  await sleep(800);
  // cử chỉ người dùng THẬT mở khoá âm thanh (phím Cách)
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    text: " ",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await sleep(500);
  const count = async () => JSON.parse(await evalJs("JSON.stringify(window.__sfx)"));
  // bơm tin `fx` của máy chủ như thật; đặt vị trí = chỗ người chơi (đang trong tầm nhìn) hoặc rất xa (ngoài tầm nhìn)
  const fx = (msg, far = false) =>
    evalJs(
      `(() => { const sc = window.__scene; const x = sc.predX + ${far ? 99999 : 0}, y = sc.predY; sc.room.emit('fx', Object.assign({ x, y, angle: 0, range: 150 }, ${JSON.stringify(msg)}, { by: sc.sid })); return 1; })()`,
    );
  const sid = await evalJs("window.__scene.sid");
  const deltaOf = async (fn) => {
    await sleep(120); // qua khoảng chống dồn của loại trước
    const a = await count();
    await fn();
    await sleep(150);
    const b = await count();
    return { osc: b.osc - a.osc, noise: b.noise - a.noise };
  };
  const base = await count();
  check(typeof base.osc === "number", "đã bọc AudioContext để đếm nguồn âm");

  const hoaCone = await deltaOf(() => fx({ kind: "cast", skill: "hoa_van_kiem" }));
  check(
    hoaCone.osc >= 1,
    `chiêu hệ Hỏa (quạt) của MÌNH có tiếng (${hoaCone.osc} dao động, ${hoaCone.noise} nhiễu)`,
  );
  check(hoaCone.noise >= 1, "chiêu Hỏa có thêm đợt nhiễu (tiếng phụt)");
  const nova = await deltaOf(() => fx({ kind: "cast", skill: "kim_chung_trao" }));
  check(nova.osc >= 1, `chiêu Kim Chung Tráo (hộ thể) có tiếng (${nova.osc} dao động)`);
  const bigger = await deltaOf(() => fx({ kind: "cast", skill: "cuu_cung_khon_sat" }));
  check(bigger.osc >= 1, `chiêu Cửu Cung Khôn Sát (thổ) có tiếng (${bigger.osc} dao động)`);
  const shapes = new Set([
    `${hoaCone.osc}/${hoaCone.noise}`,
    `${nova.osc}/${nova.noise}`,
    `${bigger.osc}/${bigger.noise}`,
  ]);
  check(
    shapes.size >= 2,
    `chiêu khác hệ / hình cho số thành phần khác nhau (${[...shapes].join(", ")})`,
  );

  const farOther = await deltaOf(() =>
    evalJs(
      `(() => { const sc = window.__scene; sc.room.emit('fx', { kind: 'cast', by: 'nguoi-la', skill: 'hoa_van_kiem', x: sc.predX + 99999, y: sc.predY, angle: 0, range: 150 }); return 1; })()`,
    ),
  );
  check(farOther.osc === 0, `chiêu của người KHÁC ở rất xa (ngoài tầm nhìn): IM (${farOther.osc})`);
  const nearOther = await deltaOf(() =>
    evalJs(
      `(() => { const sc = window.__scene; sc.room.emit('fx', { kind: 'cast', by: 'nguoi-la', skill: 'hoa_van_kiem', x: sc.predX + 40, y: sc.predY, angle: 0, range: 150 }); return 1; })()`,
    ),
  );
  check(
    nearOther.osc >= 1,
    `chiêu của người khác TRONG tầm nhìn có tiếng (nhỏ hơn) (${nearOther.osc})`,
  );

  const burst = await deltaOf(async () => {
    await fx({ kind: "cast", skill: "hoa_van_kiem" });
    await fx({ kind: "cast", skill: "hoa_van_kiem" }); // cùng khung: bị chống dồn
  });
  check(
    burst.osc === hoaCone.osc,
    `hai chiêu liền nhau chỉ kêu MỘT lần (${burst.osc} = ${hoaCone.osc})`,
  );

  const bolt = await deltaOf(() => fx({ kind: "bolt", speed: 300, range: 280, element: "bang" }));
  check(bolt.osc >= 1, `đạn tầm xa của quái có tiếng (${bolt.osc})`);
  const boltFar = await deltaOf(() =>
    evalJs(
      `(() => { const sc = window.__scene; sc.room.emit('fx', { kind: 'bolt', x: sc.predX + 99999, y: sc.predY, angle: 0, speed: 300, range: 280 }); return 1; })()`,
    ),
  );
  check(boltFar.osc === 0, `đạn ở rất xa: im (${boltFar.osc})`);

  // trạng thái của chính mình: mới có tiếng, làm mới thì im, đổi sang loại khác thì lại có
  const stun = await deltaOf(() =>
    evalJs("window.__scene.onStatus({ list: [['stun', 2000]] }); 1"),
  );
  check(stun.osc >= 1, `dính choáng (trạng thái MỚI): có tiếng (${stun.osc})`);
  const refresh = await deltaOf(() =>
    evalJs("window.__scene.onStatus({ list: [['stun', 2500]] }); 1"),
  );
  check(refresh.osc === 0, `làm mới choáng (đã có): IM (${refresh.osc})`);
  const buff = await deltaOf(() =>
    evalJs("window.__scene.onStatus({ list: [['stun', 2000], ['shield', 5000, 0.2]] }); 1"),
  );
  check(buff.osc >= 1, `thêm khiên (có lợi, MỚI): có tiếng (${buff.osc})`);
  const clear = await deltaOf(() => evalJs("window.__scene.onStatus({ list: [] }); 1"));
  check(clear.osc === 0, `hết trạng thái (xoá): im (${clear.osc})`);

  // tin rác không làm hỏng
  await deltaOf(() =>
    evalJs(
      "window.__scene.room.emit('fx', { kind: 'cast', by: 'x', skill: 'constructor', x: 0, y: 0, angle: 0, range: 1 }); window.__scene.onStatus({ list: 'rác' }); 1",
    ),
  );
  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  void sid;
  ws.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  const exited = new Promise((res) => chrome.once("exit", res));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* bỏ qua */
  }
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
process.exit(failures === 0 ? 0 : 1);
