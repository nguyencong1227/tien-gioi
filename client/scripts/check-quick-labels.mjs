import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm NHÃN Ô NHANH đan dược ba cấp (M7.5c, nit của B khi xem #636) trong Chrome THẬT (`?skills=mock`, không cần máy chủ): bơm túi qua đúng đường tin `inv` (`__ui.onInv`) rồi đo DOM:
//  - ô nhanh (phím 1 / 2): đan Hồi / Đại Hồi / Thượng Hồi hiện nhãn NGẮN "Huyết" / "Huyết 2" / "Huyết 3" (và "Linh ..."), hai ô KHÁC nhau, nhãn KHÔNG bị cắt (scrollWidth <= clientWidth);
//    trước đây tên đầy đủ bị cắt thành "Thượng …" y hệt nhau ở cả ô Huyết lẫn ô Linh (chụp ở Hàn Vân); ở bốn khung nhìn (PC, điện thoại ngang / dọc, 360 x 640: chữ ở màn cảm ứng to hơn
//    nên "Huyết III" tràn 3 px ở ô 48 px, vì vậy cấp dùng chữ số).
// Có thể chụp ảnh: `--shots <thư mục>`. Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-quick-labels.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { resolveClientUrl } from "./client-url.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = await resolveClientUrl(argOf("--url", ""));
const SHOTS = argOf("--shots", "");
/** Ba cấp đan Hồi (id thật của `ITEMS`) và nhãn ngắn mong đợi ở ô nhanh */
const TIERS = [
  { hp: "hoi_huyet_dan", mp: "hoi_linh_dan", labels: ["Huyết", "Linh"] },
  { hp: "dai_hoi_huyet_dan", mp: "dai_hoi_linh_dan", labels: ["Huyết 2", "Linh 2"] },
  { hp: "thuong_hoi_huyet_dan", mp: "thuong_hoi_linh_dan", labels: ["Huyết 3", "Linh 3"] },
];
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-bag-labels-"));
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
  const J = async (js) => JSON.parse(await evalJs(`JSON.stringify(${js})`));
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
  });
  for (const [W, H, mobile] of [
    [1280, 720, false],
    [844, 390, true],
    [390, 844, true],
    [360, 640, true],
  ]) {
    console.log(`\n--- ${W}x${H}${mobile ? " (cảm ứng)" : ""} ---`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__ui && window.__scene && window.__scene.me && window.__scene.me())",
        )
      )
        break;
    }
    await sleep(500);
    const inv = (slots) =>
      evalJs(
        `window.__ui.onInv({ slots: ${JSON.stringify(slots)}, cd: {} }); window.__ui.toggleInventory(false); 0`,
      );
    // ---- Ô nhanh: mỗi cấp một lần (túi chỉ có cặp đan của cấp đó nên ô 1 / ô 2 lấy đúng cặp này) ----
    for (const t of TIERS) {
      await inv([
        { itemId: t.hp, qty: 5 },
        { itemId: t.mp, qty: 3 },
      ]);
      await sleep(150);
      const q = await J(`[1, 2].map((i) => {
        const n = document.getElementById('quick-' + i + '-name');
        return { id: document.getElementById('quick-' + i).dataset.itemId, text: n.textContent, sw: n.scrollWidth, cw: n.clientWidth };
      })`);
      check(
        q[0].id === t.hp && q[1].id === t.mp,
        `ô nhanh 1 / 2 lấy đúng cặp đan ${t.hp} / ${t.mp} (${q[0].id} / ${q[1].id})`,
      );
      check(
        q[0].text === t.labels[0] && q[1].text === t.labels[1],
        `nhãn ô nhanh "${q[0].text}" / "${q[1].text}" = "${t.labels[0]}" / "${t.labels[1]}"`,
      );
      check(q[0].text !== q[1].text, "hai ô nhanh có nhãn KHÁC nhau");
      check(
        q.every((n) => n.sw <= n.cw),
        `nhãn ô nhanh KHÔNG bị cắt (scrollWidth ${q[0].sw} / ${q[1].sw} <= clientWidth ${q[0].cw} / ${q[1].cw})`,
      );
    }
    // Tụ Khí Đan (đan không phải Hồi): chỉ bỏ chữ "Đan", vẫn vừa ô
    await inv([{ itemId: "tu_khi_dan", qty: 9 }]);
    await sleep(150);
    const tk = await J(`(() => {
      const n = document.getElementById('quick-1-name');
      return { id: document.getElementById('quick-1').dataset.itemId, text: n.textContent, sw: n.scrollWidth, cw: n.clientWidth };
    })()`);
    check(
      tk.id === "tu_khi_dan" && tk.text === "Tụ Khí" && tk.sw <= tk.cw,
      `Tụ Khí Đan: nhãn "${tk.text}" (đan khác chỉ bỏ chữ "Đan"), không bị cắt (${tk.sw} <= ${tk.cw})`,
    );
    if (SHOTS) {
      await inv([
        { itemId: "thuong_hoi_huyet_dan", qty: 5 },
        { itemId: "thuong_hoi_linh_dan", qty: 3 },
      ]);
      await sleep(150);
      const png = await send("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, `nhan-o-nhanh-${W}x${H}.png`),
        Buffer.from(png.result.data, "base64"),
      );
    }
  }
  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
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
