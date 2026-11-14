import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm DẤU PHỤ ĐỘ HIẾM (M7.8 #509, `client/src/rarity.ts`) trong Chrome THẬT (`?skills=mock`, không cần máy chủ): bơm một túi đồ có đủ năm bậc qua đúng đường tin `inv`
// (`__ui.onInv`), mở túi và đo DOM + kiểu tính toán thật:
//  - mỗi ô có tên: `data-mark` đúng bậc, màu chữ đúng màu của bậc, `::before` THẬT có nội dung là dấu phụ (và Phàm phẩm KHÔNG có);
//  - năm bậc hiện năm dấu khác nhau, tên đã gắn dấu không bị cắt dấu (dấu đứng TRƯỚC tên);
//  - tên bậc có ở `title`; ô trống / đổi sang đồ khác thì sạch dấu và màu cũ (không "dính" từ lần vẽ trước);
//  - hàng đan dược nhanh và bảng chi tiết (tên + tên bậc) cũng mang dấu; 0 lỗi JS.
// Có thể chụp ảnh: `--shots <thư mục>`. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-rarity.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = argOf("--url", "http://127.0.0.1:5183");
const SHOTS = argOf("--shots", "");
/** Một vật phẩm mỗi bậc (id thật của `ITEMS`): Phàm / Linh / Bảo / Tiên / Thần phẩm */
const BY_TIER = ["hoi_huyet_dan", "da_ho", "vay_mang", "giao_lan", "giao_long_phu"];
const MARKS = ["", "◆", "◆◆", "◆◆◆", "★"];
const NAMES = ["Phàm phẩm", "Linh phẩm", "Bảo phẩm", "Tiên phẩm", "Thần phẩm"];
const COLORS = ["#c9c4b8", "#6fcf73", "#4fa3ff", "#c277ff", "#ffb23f"];
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-rarity-"));
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
const rgb = (hex) => {
  const v = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`;
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
  for (const [W, H] of [
    [1280, 720],
    [360, 640],
  ]) {
    console.log(`\n--- ${W}x${H} ---`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile: W < 700,
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
    // túi: năm đồ ở năm ô đầu + một ô trống ở giữa (ô 5) rồi đồ thứ sáu
    const slots = BY_TIER.map((id) => ({ itemId: id, qty: 1 }));
    await evalJs(
      `window.__ui.onInv({ slots: ${JSON.stringify([...slots.slice(0, 2), null, ...slots.slice(2)])}, cd: {} }); window.__ui.toggleInventory(true); 0`,
    );
    await sleep(300);
    const cards = await J(`[...document.querySelectorAll('#inv-grid .inv-slot')].map((el) => {
      const b = getComputedStyle(el, '::before');
      return { text: el.querySelector('.slot-name').textContent, badge: el.dataset.rbadge ?? null, rar: el.style.getPropertyValue('--rar'),
        before: b.content, bcolor: b.color, bpos: b.position, border: getComputedStyle(el).borderTopColor };
    })`);
    const filled = cards.filter((n) => n.text);
    check(filled.length === 5, `năm ô có đồ (${filled.length})`);
    // thứ tự ô: bậc 0, 1, (trống), 2, 3, 4
    const tiers = [0, 1, 2, 3, 4];
    let ok = true;
    const detail = [];
    filled.forEach((n, i) => {
      const t = tiers[i];
      // Chrome ghi nội dung có chú thích thay thế là `"◆" / ""`: chỉ so phần đầu
      const hasBefore = MARKS[t]
        ? n.before.startsWith(`"${MARKS[t]}"`)
        : n.before === "none" || n.before === "normal";
      const good =
        (n.badge ?? "") === MARKS[t] &&
        n.rar === COLORS[t] &&
        hasBefore &&
        (MARKS[t] ? n.bpos === "absolute" && n.bcolor === rgb(COLORS[t]) : true) &&
        n.border === rgb(COLORS[t]);
      if (!good) ok = false;
      detail.push(`${NAMES[t]}: huy hiệu "${n.badge ?? ""}", ::before ${n.before}`);
    });
    check(
      ok,
      `mỗi ô đúng huy hiệu, màu viền / huy hiệu, ::before THẬT ở góc (${detail.join(" | ")})`,
    );
    check(
      new Set(filled.map((n) => n.badge ?? "")).size === 5,
      "năm bậc hiện năm huy hiệu KHÁC nhau",
    );
    const nameBefore = await J(
      `[...document.querySelectorAll('#inv-grid .inv-slot .slot-name')].map((el) => getComputedStyle(el, '::before').content)`,
    );
    check(
      nameBefore.every((c) => c === "none" || c === "normal"),
      "tên trong ô túi KHÔNG bị chèn dấu phụ (tên giữ nguyên chỗ, huy hiệu nằm ở góc)",
    );
    const emptyEl = cards.find((n) => !n.text);
    check(
      !!emptyEl &&
        emptyEl.badge === null &&
        emptyEl.rar === "" &&
        (emptyEl.before === "none" || emptyEl.before === "normal"),
      `ô trống sạch huy hiệu / biến màu / ::before (${JSON.stringify(emptyEl)})`,
    );
    // đổi đồ: ô đầu từ Phàm -> Thần phẩm rồi về trống: không dính dấu cũ
    await evalJs(
      `window.__ui.onInv({ slots: [{ itemId: ${JSON.stringify(BY_TIER[4])}, qty: 1 }], cd: {} }); 0`,
    );
    await sleep(150);
    const first = await J(
      `(() => { const el = document.querySelector('#inv-grid .inv-slot'); return { badge: el.dataset.rbadge ?? null, rar: el.style.getPropertyValue('--rar') }; })()`,
    );
    check(
      first.badge === "★" && first.rar === COLORS[4],
      `đổi Phàm -> Thần phẩm: huy hiệu "★" (${JSON.stringify(first)})`,
    );
    await evalJs(`window.__ui.onInv({ slots: [null], cd: {} }); 0`);
    await sleep(150);
    const gone = await J(
      `(() => { const el = document.querySelector('#inv-grid .inv-slot'); return { badge: el.dataset.rbadge ?? null, rar: el.style.getPropertyValue('--rar'), text: el.querySelector('.slot-name').textContent }; })()`,
    );
    check(
      gone.badge === null && gone.rar === "" && gone.text === "",
      `về ô trống: huy hiệu và màu cũ đều sạch (${JSON.stringify(gone)})`,
    );
    // bảng chi tiết: chọn ô Tiên phẩm (đồ thứ tư): tên + tên bậc
    await evalJs(
      `window.__ui.onInv({ slots: ${JSON.stringify(slots)}, cd: {} }); document.querySelectorAll('#inv-grid .inv-slot')[3].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); 0`,
    );
    await sleep(200);
    const detailBox =
      await J(`(() => { const n = document.getElementById('inv-item-name'), r = document.getElementById('inv-item-rarity');
      return { mark: n.dataset.mark ?? null, before: getComputedStyle(n, '::before').content, rarity: r.textContent, rcolor: r.style.color }; })()`);
    check(
      detailBox.mark === "◆◆◆" &&
        detailBox.before.startsWith('"◆◆◆ "') &&
        detailBox.rarity === "Tiên phẩm",
      `bảng chi tiết: tên mang dấu "◆◆◆" và hiện tên bậc "Tiên phẩm" (${JSON.stringify(detailBox)})`,
    );
    if (SHOTS) {
      const png = await send("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, `do-hiem-${W}x${H}.png`),
        Buffer.from(png.result.data, "base64"),
      );
    }
    await evalJs("window.__ui.toggleInventory(false); 0");
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
