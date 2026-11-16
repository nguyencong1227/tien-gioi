import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm CHỈ DẪN NGƯỜI MỚI (#673, #674) trong Chrome THẬT (`?skills=mock`, không cần máy chủ; KHÔNG đặt cờ bỏ qua nên hộp tự mở lần đầu như người mới thật):
//  - hai nút ở chân hộp ("Xem tất cả phím tắt" / "Đã Hiểu") đều >= 44 px, KHÔNG vỡ chữ (một dòng: chiều cao nhỏ hơn 2 dòng chữ + đệm) và không tràn; nút phím tắt không bị ép hẹp hơn chữ của nó
//    (trước đây `.auth-btn-primary` rộng 100 % ép nó còn 44 x 97 px, chữ xuống 5 dòng, nút "Đã Hiểu" cao 97 px); ở cảm ứng THẬT (`data-input="touch"`) nút phím tắt bị CSS ẩn và "Đã Hiểu" chiếm cả hàng; Chrome không đầu chỉ GIẢ khung (`mobile`) mà con trỏ vẫn là chuột nên ở bốn khung này nút phím tắt vẫn HIỆN và được đo như mọi khung;
//  - có thẻ "Chiêu Thức" nói quyển học ở Túi đồ (nút Học), phím L U I O và bảng Công pháp, nhãn phím theo phím ĐANG GÁN (đổi phím thì chữ đổi theo);
//  - Esc / Cách đóng hộp.
// Ở bốn khung nhìn (1280x720 chuột; 844x390, 390x844, 360x640 CẢM ỨNG THẬT: `Emulation.setTouchEmulationEnabled`, `data-input="touch"`): ở cảm ứng hộp chỉ dẫn / dòng chào nêu NÚT thay vì phím (#690). Có thể chụp ảnh: `--shots <thư mục>`. Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-newbie-guide.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
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
  // khung chuột TRƯỚC, khung cảm ứng SAU: một khi Chrome bật giả lập cảm ứng thì không tắt lại được trong cùng phiên (như capture-viewports)
  for (const [W, H, mobile, realTouch] of [
    [1280, 720, false, false],
    [844, 390, true, true],
    [390, 844, true, true],
    [360, 640, true, true],
  ]) {
    console.log(`\n--- ${W}x${H}${mobile ? " (cảm ứng)" : ""} ---`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile,
    });
    if (realTouch) {
      // cảm ứng THẬT (con trỏ chính là cảm ứng, `data-input="touch"`): `mobile` một mình chỉ giả khung nên con trỏ vẫn là chuột
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await send("Emulation.setEmitTouchEventsForMouse", {
        enabled: true,
        configuration: "mobile",
      });
    }
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
    const input = await evalJs("document.documentElement.dataset.input");
    check(
      realTouch ? input === "touch" : input === "mouse",
      `data-input = ${input} (mong đợi ${realTouch ? "touch" : "mouse"})`,
    );
    const skill = g.cards.find((c) => c.startsWith("📖") || c.includes("Chiêu Thức"));
    check(
      Boolean(skill) && /Túi đồ/.test(skill) && /Học/.test(skill) && /Công pháp/.test(skill),
      `có thẻ Chiêu Thức nêu Túi đồ + nút Học + bảng Công pháp: "${(skill ?? "").slice(0, 140)}"`,
    );
    const visibleText = g.cards.join(" ");
    const dismissText = await evalJs("document.getElementById('newbie-btn-dismiss').innerText");
    const chat = String(await evalJs("document.getElementById('chat')?.innerText ?? ''"));
    if (realTouch) {
      // người chơi cảm ứng KHÔNG có phím: chữ hiển thị nêu NÚT, không còn tên phím (#690)
      check(
        !/\bPhím\b|\bTab\b|Shift\+|\bEsc\b|\bEnter\b/.test(visibleText),
        `hộp chỉ dẫn ở cảm ứng không còn tên phím (Phím / Tab / Shift+ / Esc / Enter): "${visibleText.match(/\bPhím\b|\bTab\b|Shift\+\S*|\bEsc\b|\bEnter\b/)?.[0] ?? ""}"`,
      );
      check(
        /nút hướng cố định/.test(visibleText),
        "hộp chỉ dẫn ở cảm ứng nhắc cả kiểu NÚT HƯỚNG cố định (tg_touch_scheme = dpad, đổi ở Cài đặt), không chỉ cần điều khiển nổi",
      );
      check(
        /Chém/.test(visibleText) &&
          /Mục tiêu/.test(visibleText) &&
          /Đả tọa/.test(visibleText) &&
          /Nói/.test(visibleText),
        "hộp chỉ dẫn ở cảm ứng nêu các NÚT: Chém, Mục tiêu, Đả tọa, Nói",
      );
      check(
        !/Phím Cách|Esc/.test(dismissText) && /Đã Hiểu/.test(dismissText),
        `nút đóng ở cảm ứng: "${dismissText.replace(/\s+/g, " ")}" (không bảo bấm phím)`,
      );
      check(
        /nút Nói/.test(chat) && !/\(F\)/.test(chat),
        "dòng chào ở chat nêu nút Nói, không nêu phím (F)",
      );
      const qkey = await evalJs(
        "(() => { const k = document.querySelector('#quick-1 .qkey'); return k ? getComputedStyle(k).display : 'none'; })()",
      );
      check(qkey === "none", `số phím '1' trên ô nhanh bị ẩn ở cảm ứng (${qkey})`);
    } else {
      check(
        Boolean(skill) && /\bL\b.*\bU\b.*\bI\b.*\bO\b/.test(skill) && /Shift\+K/.test(skill),
        "thẻ Chiêu Thức ghi đúng phím mặc định L U I O và Shift+K (lấy theo phím đang gán)",
      );
      check(
        /Phím J/.test(visibleText) && /Phím Cách hoặc Esc/.test(dismissText),
        "chuột: chữ hiển thị vẫn là bản phím (Phím J..., Phím Cách hoặc Esc)",
      );
      check(/\(F\)/.test(chat), "chuột: dòng chào ở chat nêu phím (F)");
    }
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
