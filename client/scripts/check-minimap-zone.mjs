import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process */
// Kiểm NHÃN TÊN VÙNG dưới bản đồ nhỏ (`#minimap-zone`) trong Chrome THẬT (`?skills=mock`, không cần máy chủ), ở bốn khung nhìn: MỌI tên vùng của `MAPS` (trấn + hoang của cả bốn bản
// đồ) đặt vào nhãn rồi đo: KHÔNG bị cắt (scrollWidth <= clientWidth), tối đa HAI dòng, chân bản đồ không đè thanh menu HUD bên dưới; màn cảm ứng ẩn chữ gợi ý "M" (không có phím M),
// máy tính vẫn hiện. Trước đây `max-width: 85px` + một dòng + dấu chấm lửng cắt 7 / 8 tên ở màn cảm ứng ("Hàn Vân T…") và "Vọng Sương Trạm" ở máy tính.
// Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-minimap-zone.mjs [--url http://127.0.0.1:5183]
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
const MAP_TS = `/@fs/${path.resolve(import.meta.dirname, "../../shared/src/map.ts").replace(/^\//, "")}`;
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-minimap-zone-"));
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
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1')}catch(e){}`,
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
    // Cảm ứng thật: `(pointer: coarse)` đúng thì `display.ts` đặt data-input="touch" (CSS ẩn chữ "M" dựa vào đó)
    await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__ui && window.__scene && document.getElementById('minimap-zone'))",
        )
      )
        break;
    }
    await sleep(600);
    const names = JSON.parse(
      await evalJs(
        `import(${JSON.stringify(MAP_TS)}).then((m) => JSON.stringify([...new Set(m.MAPS.flatMap((d) => [d.townName, d.wildName]))]))`,
      ),
    );
    check(names.length >= 8, `${names.length} tên vùng của MAPS để kiểm`);
    const rows = [];
    for (const n of names) {
      rows.push(
        await J(`(() => { const z = document.getElementById("minimap-zone"); z.textContent = ${JSON.stringify(n)};
          const w = document.getElementById("minimap-wrap"), menu = document.getElementById("hud-menu");
          const lh = parseFloat(getComputedStyle(z).lineHeight) || parseFloat(getComputedStyle(z).fontSize) * 1.2;
          return { name: ${JSON.stringify(n)}, clipped: z.scrollWidth > z.clientWidth + 1, h: z.getBoundingClientRect().height, lh,
            wrapBottom: w.getBoundingClientRect().bottom, menuTop: menu ? menu.getBoundingClientRect().top : 1e9 }; })()`),
      );
    }
    const clipped = rows.filter((r) => r.clipped).map((r) => r.name);
    check(
      clipped.length === 0,
      `không tên vùng nào bị cắt ngang (${clipped.length} / ${rows.length}${clipped.length ? `: ${clipped.join(", ")}` : ""})`,
    );
    const tall = rows.filter((r) => r.h > 2 * r.lh + 2).map((r) => r.name);
    check(
      tall.length === 0,
      `mọi tên vùng tối đa hai dòng${tall.length ? ` (quá: ${tall.join(", ")})` : ""}`,
    );
    const overlap = rows.filter((r) => r.wrapBottom > r.menuTop + 0.5).map((r) => r.name);
    check(
      overlap.length === 0,
      `chân bản đồ không đè thanh menu HUD${overlap.length ? ` (đè với: ${overlap.join(", ")})` : ""}`,
    );
    const hint = await J(
      `(() => { const s = document.querySelector(".mm-foot small"); return s ? getComputedStyle(s).display : "none"; })()`,
    );
    check(
      mobile ? hint === "none" : hint !== "none",
      `chữ gợi ý "M": ${mobile ? "ẩn ở màn cảm ứng" : "hiện ở máy tính"} (display ${hint})`,
    );
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
