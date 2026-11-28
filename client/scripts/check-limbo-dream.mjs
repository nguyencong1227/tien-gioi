/* global console, process, Buffer */
// Kiểm "giấc mơ bến sông" ở màn Hoàng Tuyền (#1464 lát 2) bằng Chrome THẬT qua CDP ở chế độ giả lập `?duel=mock&debug=1` (KHÔNG cần máy chủ trò chơi):
// ngoài Hoàng Tuyền dòng ẩn; kiếp 1 khép lại thì hiện ĐÚNG lời trong `limbo-dream.ts`, chữ nghiêng, nằm giữa "Kiếp thứ 1 khép lại" và bảng tóm tắt, không
// tràn ngang hộp; kiếp 2 trở đi ẩn và xoá chữ (màn dùng lại giữa các lần vào); mua thêm (`updateSoul`, vẽ lại) giữ nguyên dòng; 0 lỗi trang. Năm khung nhìn
// (máy tính 1280x720 / 1920x1080, điện thoại dọc 360x640, ngang 640x360, máy tính bảng 768x1024). Có thể chụp ảnh: `--shots <thư mục>`.
// Mặc định phục vụ `client/dist` bằng máy chủ tĩnh của script (chạy `npm run build -w client` trước); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-limbo-dream.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots] [--slow-frame <ms>]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { launchChrome } from "./chrome-launch.mjs";
import { waitUntilTrue } from "./chrome-wait.mjs";
import { slowFrameMs, slowFrameSource } from "./slow-frame.mjs";

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");
const SHOTS = argOf("--shots", "");
const URL_ARG = argOf("--url", "");

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
/** Lời giấc mơ kiếp 1: đọc thẳng từ `shared/src/limbo-dream.ts` để script không chép chữ (đổi chữ ở một chỗ) */
const DREAM = fs
  .readFileSync(path.join(REPO, "shared/src/limbo-dream.ts"), "utf8")
  .match(/kiep: 1,\s*\n\s*text: "([^"]+)"/)?.[1];
if (!DREAM) throw new Error("Không đọc được lời kiếp 1 từ shared/src/limbo-dream.ts");

/** Máy chủ tĩnh của `client/dist` (không dựng khi có `--url`) */
let server = null;
let BASE_URL = URL_ARG.replace(/\/$/, "");
if (!BASE_URL) {
  if (!fs.existsSync(path.join(DIST, "index.html")))
    throw new Error(
      "Chưa có client/dist: chạy `npm run build -w client` trước (hoặc truyền --url).",
    );
  server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath)) filePath = path.join(DIST, "index.html");
    try {
      res.writeHead(200, {
        "Content-Type": MIMES[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(fs.readFileSync(filePath));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const httpPort = await freePort();
  await new Promise((r) => server.listen(httpPort, "127.0.0.1", r));
  BASE_URL = `http://127.0.0.1:${httpPort}`;
}
let launched = null;
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, mobile: false },
  { name: "1920x1080", w: 1920, h: 1080, mobile: false },
  { name: "360x640", w: 360, h: 640, mobile: true },
  { name: "640x360", w: 640, h: 360, mobile: true },
  { name: "768x1024", w: 768, h: 1024, mobile: true },
];
const LIMBO = (kiep) => ({
  summary: { kiep, realm: 1, tier: 3, minutes: 42, kills: 120, bossKills: 2, gain: 35 },
  soul: { kiep, duyen: 50, unlocks: {}, origins: [] },
  keepable: [],
});
try {
  launched = await launchChrome({ name: "limbo-dream", extraArgs: [] });
  const ws = new WebSocket(launched.page.webSocketDebuggerUrl);
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
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high')}catch(e){}${slowFrameSource(slowFrameMs())}`,
  });
  const frames = (n) =>
    evalJs(
      `new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`,
    );
  const shot = async (file) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, "base64"));
  };
  /** Mô tả dòng giấc mơ + vị trí so với hai phần tử bên cạnh (hàm chạy trong trang) */
  const STATE = `(() => {
    const d = document.getElementById("limbo-dream");
    const sub = document.getElementById("limbo-kiep-sub");
    const box = document.querySelector(".limbo-box");
    const sum = document.querySelector(".limbo-summary");
    const r = (e) => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height }; };
    return JSON.stringify({
      hidden: d.hidden, text: d.textContent, display: getComputedStyle(d).display,
      italic: getComputedStyle(d).fontStyle, d: r(d), sub: r(sub), box: r(box), sum: r(sum),
      boxOverflowX: box.scrollWidth > box.clientWidth + 1,
      inLimbo: document.body.classList.contains("in-limbo"),
    });
  })()`;
  const state = () => evalJs(STATE).then(JSON.parse);
  const showLimbo = async (kiep) => {
    await evalJs(`window.__ui.showLimbo(${JSON.stringify(LIMBO(kiep))}, {}); 1`);
    await waitUntilTrue(() => evalJs(`document.body.classList.contains("in-limbo")`), 10000, 50);
    await frames(3);
  };
  const hideLimbo = async () => {
    await evalJs(`window.__ui.hideLimbo(); 1`);
    await waitUntilTrue(() => evalJs(`!document.body.classList.contains("in-limbo")`), 10000, 50);
  };

  for (const vp of VIEWPORTS) {
    console.log(`--- ${vp.name} ---`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 1,
      mobile: vp.mobile,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
    await waitUntilTrue(
      () => evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())"),
      30000,
      100,
    );
    await frames(5);

    // ngoài Hoàng Tuyền: dòng ẩn, không chữ
    let s = await state();
    check(
      s.hidden && s.display === "none" && s.text === "",
      `${vp.name}: ngoài Hoàng Tuyền: ẩn, không chữ`,
    );

    // kiếp 1: hiện đúng lời, chữ nghiêng, nằm giữa dòng "Kiếp thứ 1" và bảng tóm tắt, trong hộp
    await showLimbo(1);
    s = await state();
    check(s.inLimbo && !s.hidden && s.display !== "none", `${vp.name}: kiếp 1: dòng giấc mơ hiện`);
    check(s.text === DREAM, `${vp.name}: kiếp 1: đúng lời trong limbo-dream.ts`);
    check(s.italic === "italic", `${vp.name}: chữ nghiêng`);
    check(
      s.sub.b <= s.d.t + 1 && s.d.b <= s.sum.t + 1,
      `${vp.name}: nằm giữa "Kiếp thứ 1 khép lại" (${s.sub.b.toFixed(0)}) và bảng tóm tắt (${s.sum.t.toFixed(0)}): dòng ${s.d.t.toFixed(0)}-${s.d.b.toFixed(0)}`,
    );
    check(
      s.d.l >= s.box.l - 1 && s.d.r <= s.box.r + 1 && !s.boxOverflowX,
      `${vp.name}: không tràn ngang hộp (dòng ${s.d.l.toFixed(0)}-${s.d.r.toFixed(0)}, hộp ${s.box.l.toFixed(0)}-${s.box.r.toFixed(0)})`,
    );
    await shot(`limbo-dream-kiep1-${vp.name}.png`);

    // mua thêm: màn vẽ lại, giữ nguyên dòng
    await evalJs(
      `window.__ui.updateSoul(${JSON.stringify({ kiep: 1, duyen: 10, unlocks: {}, origins: [] })}); 1`,
    );
    await frames(3);
    s = await state();
    check(!s.hidden && s.text === DREAM, `${vp.name}: vẽ lại sau khi mua: dòng giữ nguyên`);

    // đóng, vào lại ở kiếp 2: ẩn và xoá chữ
    await hideLimbo();
    await showLimbo(2);
    s = await state();
    check(s.hidden && s.display === "none" && s.text === "", `${vp.name}: kiếp 2: ẩn, xoá chữ`);
    await shot(`limbo-dream-kiep2-${vp.name}.png`);

    // kiếp 1 lại (chân linh khác / vào lại): hiện lại được
    await hideLimbo();
    await showLimbo(1);
    s = await state();
    check(!s.hidden && s.text === DREAM, `${vp.name}: vào lại kiếp 1: hiện lại`);
    await hideLimbo();
  }
  check(pageErrors === 0, `0 lỗi trang (đếm được ${pageErrors})`);
  ws.close();
} finally {
  await launched?.close();
  if (server) await new Promise((r) => server.close(r));
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} kiểm ĐỎ`);
process.exit(failures === 0 ? 0 : 1);
