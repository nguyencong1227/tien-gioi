import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm CHỈ DẪN NGƯỜI MỚI (#673, #674) trong Chrome THẬT (`?skills=mock`, không cần máy chủ; KHÔNG đặt cờ bỏ qua nên hộp tự mở lần đầu như người mới thật):
//  - hai nút ở chân hộp ("Xem tất cả phím tắt" / "Đã Hiểu") đều >= 44 px, KHÔNG vỡ chữ (một dòng: chiều cao nhỏ hơn 2 dòng chữ + đệm) và không tràn; nút phím tắt không bị ép hẹp hơn chữ của nó
//    (trước đây `.auth-btn-primary` rộng 100 % ép nó còn 44 x 97 px, chữ xuống 5 dòng, nút "Đã Hiểu" cao 97 px); ở cảm ứng nút phím tắt ẩn (không bàn phím) và "Đã Hiểu" chiếm cả hàng;
//  - có thẻ "Chiêu Thức" nói quyển học ở Túi đồ (nút Học), phím L U I O và bảng Công pháp, nhãn phím theo phím ĐANG GÁN (đổi phím thì chữ đổi theo);
//  - Esc / Cách đóng hộp.
// Ở bốn khung nhìn (1280x720, 844x390, 390x844, 360x640). Có thể chụp ảnh: `--shots <thư mục>`. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-newbie-guide.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
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
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-newbie-guide-"));
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
    // KHÔNG đặt `tg_newbie_guide_dismissed`: người mới thật thấy hộp chỉ dẫn tự mở
    source: `try{localStorage.removeItem('tg_newbie_guide_dismissed');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
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
    await sleep(800);
    check(
      Boolean(await evalJs("window.__ui.isNewbieGuideOpen()")),
      "hộp chỉ dẫn tự mở khi vào game lần đầu (chưa có cờ đã đọc)",
    );
    const g = await J(`(() => {
      const m = document.getElementById('newbie-guide-modal'), k = document.getElementById('newbie-btn-keys'), d = document.getElementById('newbie-btn-dismiss');
      const r = (e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), shown: getComputedStyle(e).display !== 'none' }; };
      const lh = parseFloat(getComputedStyle(k).lineHeight) || parseFloat(getComputedStyle(k).fontSize) * 1.3;
      return { keys: r(k), dismiss: r(d), fs: parseFloat(getComputedStyle(k).fontSize), lh, form: document.documentElement.dataset.form,
        sw: m.scrollWidth, cw: m.clientWidth, ow: document.documentElement.scrollWidth, vw: innerWidth,
        cards: [...document.querySelectorAll('#newbie-guide-modal .newbie-card')].map((c) => c.innerText.replace(/\\s+/g, ' ')),
        keysTextH: k.scrollHeight, keysTextW: k.scrollWidth, keysClientW: k.clientWidth };
    })()`);
    const touch = !g.keys.shown;
    check(
      g.dismiss.h >= 44 && g.dismiss.h < 80 && g.dismiss.w >= 150,
      `nút "Đã Hiểu" ${g.dismiss.w} x ${g.dismiss.h} px: >= 44, không bị kéo cao bất thường (< 80), đủ rộng`,
    );
    if (!touch) {
      check(g.keys.h >= 44, `nút phím tắt cao ${g.keys.h} px (>= 44)`);
      check(
        g.keysTextW <= g.keysClientW + 1,
        `nút phím tắt không tràn / không bị ép hẹp (chữ ${g.keysTextW}, nút ${g.keysClientW}, rộng ${g.keys.w} px)`,
      );
      check(
        g.keys.h < g.lh * 2 + 40,
        `nút phím tắt MỘT dòng chữ (cao ${g.keys.h} px, dòng ${Math.round(g.lh)} px; trước đây 97 px và 5 dòng)`,
      );
    } else {
      check(true, "cảm ứng: nút phím tắt ẩn (không bàn phím), 'Đã Hiểu' chiếm cả hàng");
    }
    check(
      g.sw <= g.cw + 1 && g.ow <= g.vw + 1,
      `không tràn ngang (hộp ${g.sw}/${g.cw}, trang ${g.ow}/${g.vw})`,
    );
    const skill = g.cards.find((c) => c.startsWith("📖") || c.includes("Chiêu Thức"));
    check(
      Boolean(skill) && /Túi đồ/.test(skill) && /Học/.test(skill) && /Công pháp/.test(skill),
      `có thẻ Chiêu Thức nêu Túi đồ + nút Học + bảng Công pháp: "${(skill ?? "").slice(0, 140)}"`,
    );
    check(
      Boolean(skill) && /\bL\b.*\bU\b.*\bI\b.*\bO\b/.test(skill) && /Shift\+K/.test(skill),
      "thẻ Chiêu Thức ghi đúng phím mặc định L U I O và Shift+K (lấy theo phím đang gán)",
    );
    if (SHOTS) {
      const png = await send("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, `chi-dan-${W}x${H}.png`),
        Buffer.from(png.result.data, "base64"),
      );
    }
    // đóng bằng phím Esc thật
    await send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await sleep(200);
    check(!(await evalJs("window.__ui.isNewbieGuideOpen()")), "hộp chỉ dẫn đã đóng");
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
