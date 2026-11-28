/* global console, process, Buffer */
// Kiểm hiệu ứng luân hồi bằng CSS thuần (hồn lửa Hoàng Tuyền, Tam Sinh Thạch, cánh hoa đầu thai) trong Chrome thật (M5.2 #329), chế độ giả lập `?duel=mock&debug=1` (không cần máy chủ).
//   node client/scripts/check-limbo-fx.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shot docs/screenshots/combat-fx.webp] [--slow-frame <ms>]
// Đo hoạt ảnh CSS đang CHẠY THẬT (document.getAnimations), kiểu tính toán của hồn lửa / cánh hoa và ảnh chụp màn hình.
// Mặc định phục vụ `client/dist` bằng máy chủ tĩnh của script (chạy `npm run build -w client` trước; chế độ giả lập có ở bản dựng nhờ `?debug`); `--url` để dùng client đang chạy sẵn.
// Chờ THEO ĐIỀU KIỆN (nightly #1458, lô 16): không còn `sleep` cố định. Các hoạt ảnh CSS chạy theo giờ THẬT của trình duyệt (cánh hoa hiện 2,5 s + mờ 0,6 s), nên chờ tới khi
// đạt trạng thái (đủ số hoạt ảnh đang chạy / hết hoạt ảnh) thay vì đoán giờ; kiểm PHỦ ĐỊNH ('không còn hoạt ảnh') chờ tới khi lớp đã dựng rồi mới đếm.
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
try {
  launched = await launchChrome({ name: "limbo-fx", extraArgs: [] });
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
  /** Chờ `n` khung hình của trang (rAF liên tiếp): ở khung chậm mỗi khung dài hơn nên chờ tự co giãn theo (thay `sleep` cố định). */
  const frames = (n) =>
    evalJs(
      `new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`,
    );

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    // Chất lượng Cao (cho rung + chớp), bỏ hướng dẫn tân thủ; `--slow-frame <ms>` (hoặc `TG_SLOW_FRAME_MS`): giả lập runner khung chậm, xem `slow-frame.mjs`
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}${slowFrameSource(slowFrameMs())}`,
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 900,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
  await waitUntilTrue(
    () => evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())"),
    45000,
    100,
  );
  await frames(5);

  /** Chờ biểu thức JS trong trang đúng (điều kiện, không đoán giờ) */
  const until = (expr, ms = 15000) => waitUntilTrue(() => evalJs(expr), ms, 50);
  const animsExpr = (name) =>
    `document.getAnimations().filter((a) => a.animationName === ${JSON.stringify(name)} && a.playState === "running").length`;
  const anims = (name) =>
    evalJs(
      `document.getAnimations().filter((a) => a.animationName === ${JSON.stringify(name)} && a.playState === "running").length`,
    );
  const LIMBO = {
    summary: { kiep: 1, realm: 1, tier: 3, minutes: 42, kills: 120, bossKills: 2, gain: 35 },
    soul: { kiep: 1, duyen: 50, unlocks: {}, origins: [] },
    keepable: [],
  };
  const showLimbo = () => evalJs(`window.__ui.showLimbo(${JSON.stringify(LIMBO)}, {}); 1`);
  const shot = async (file) => {
    const r = await send("Page.captureScreenshot", { format: "webp", quality: 85 });
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    console.log(`    (đã chụp ${file})`);
  };
  const si = process.argv.indexOf("--shot");
  const shotBase = si >= 0 && process.argv[si + 1] ? process.argv[si + 1] : null; // tiền tố, vd docs/screenshots/luan-hoi

  // 1) Chưa vào Hoàng Tuyền: lớp hồn lửa ẩn, KHÔNG có hoạt ảnh nào chạy (không tốn gì khi chơi bình thường)
  check(
    (await evalJs(`getComputedStyle(document.querySelector(".limbo-fx")).display`)) === "none",
    "ngoài Hoàng Tuyền: lớp hồn lửa display none",
  );
  check(
    (await anims("limbo-wisp")) === 0 && (await anims("stone-glow")) === 0,
    "ngoài Hoàng Tuyền: 0 hoạt ảnh hồn lửa / Tam Sinh Thạch đang chạy",
  );

  // 2) Vào Hoàng Tuyền: 10 hồn lửa trôi thật (transform đổi theo thời gian), vignette tím đen, Tam Sinh Thạch toả sáng
  await showLimbo();
  await until(
    `getComputedStyle(document.querySelector(".limbo-fx")).display === "block" && ${animsExpr("limbo-wisp")} === 10`,
  );
  check(
    (await evalJs(`getComputedStyle(document.querySelector(".limbo-fx")).display`)) === "block",
    "trong Hoàng Tuyền: lớp hồn lửa hiện",
  );
  const w = await anims("limbo-wisp");
  check(w === 10, `10 hồn lửa đang chạy hoạt ảnh (${w})`);
  const stones = await evalJs(`document.querySelectorAll("#limbo-stone-list .stone-item").length`);
  const sg = await anims("stone-glow");
  check(stones > 0 && sg === stones, `Tam Sinh Thạch: ${sg}/${stones} nấc đang toả sáng`);
  const t1 = await evalJs(
    `getComputedStyle(document.querySelector(".limbo-fx i:nth-child(1)")).transform`,
  );
  // hồn lửa trôi theo giờ thật: chờ tới khi transform ĐỔI (thay `sleep(1200)`), hết hạn thì kiểm bên dưới báo đúng hai giá trị
  await until(
    `getComputedStyle(document.querySelector(".limbo-fx i:nth-child(1)")).transform !== ${JSON.stringify(t1)}`,
    20000,
  );
  const t2 = await evalJs(
    `getComputedStyle(document.querySelector(".limbo-fx i:nth-child(1)")).transform`,
  );
  check(t1 !== t2, `hồn lửa thật sự trôi: transform đổi (${t1} -> ${t2})`);
  const vig = await evalJs(`getComputedStyle(document.querySelector(".limbo-fx")).boxShadow`);
  check(/rgba\(38, 12, 66/.test(vig), `vignette tím đen ở mép (${vig})`);
  check(
    (await evalJs(`getComputedStyle(document.querySelector(".limbo-fx")).pointerEvents`)) ===
      "none",
    "lớp hồn lửa không bắt chuột (không chặn nút Đầu thai / mua)",
  );
  // Nút Đầu thai vẫn bấm được (không bị lớp hiệu ứng che): phần tử tại tâm nút phải chính là nút
  const hit = await evalJs(
    `(() => { const b = document.getElementById("limbo-btn-rebirth"); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); })()`,
  );
  check(hit === true, "nút Đầu thai không bị lớp hiệu ứng che");
  if (shotBase) await shot(`${shotBase}-hoang-tuyen.webp`);

  // 3) Đầu thai: vầng sáng trắng + 12 cánh hoa rơi khi overlay đang hiện; hết thì dừng (display none)
  await evalJs(`window.__ui.showReborn(2); 1`);
  await until(`${animsExpr("petal-fall")} === 12 && ${animsExpr("reborn-bloom")} === 1`);
  const p = await anims("petal-fall");
  const b = await anims("reborn-bloom");
  check(p === 12 && b === 1, `đầu thai: ${p} cánh hoa rơi + ${b} vầng sáng đang chạy`);
  // vầng sáng bắt đầu từ opacity 0 rồi nở dần: hoạt ảnh vừa CHẠY chưa có nghĩa là đã NỞ, nên chờ chính điều cần khẳng định (opacity > 0) thay vì `sleep(900)`
  await until(`getComputedStyle(document.querySelector(".reborn-bloom")).opacity > 0`);
  check(
    (await evalJs(`getComputedStyle(document.querySelector(".reborn-bloom")).opacity`)) > 0,
    "vầng sáng mờ trắng đã nở (opacity > 0)",
  );
  if (shotBase) await shot(`${shotBase}-dau-thai.webp`);
  // 2,5 s hiện + 0,6 s mờ đi (giờ THẬT): chờ tới khi hết hoạt ảnh cánh hoa VÀ lớp hồn lửa ẩn lại (thay `sleep(3600)`)
  await until(
    `${animsExpr("petal-fall")} === 0 && getComputedStyle(document.querySelector(".limbo-fx")).display === "none"`,
    30000,
  );
  check((await anims("petal-fall")) === 0, "xong đầu thai: không còn hoạt ảnh cánh hoa nào chạy");
  check(
    (await evalJs(`getComputedStyle(document.querySelector(".limbo-fx")).display`)) === "none",
    "xong đầu thai (rời Hoàng Tuyền): lớp hồn lửa ẩn lại",
  );

  // 4) Giảm chuyển động: hồn lửa / cánh hoa đứng yên (không hoạt ảnh), vẫn hiện mờ
  await evalJs(
    `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = true; c.dispatchEvent(new Event("change")); })()`,
  );
  await until(`document.body.classList.contains("reduced-motion")`);
  await showLimbo();
  await until(`getComputedStyle(document.querySelector(".limbo-fx")).display === "block"`);
  await frames(5);
  check((await anims("limbo-wisp")) === 0, "giảm chuyển động: 0 hồn lửa chạy hoạt ảnh");
  // Quy tắc toàn cục `body.reduced-motion *` đã ép mọi hoạt ảnh xong ngay (0,01 ms, 1 vòng): nên đo thêm kiểu TÍNH TOÁN để chứng minh
  // quy tắc RIÊNG của luân hồi (cũng phủ `html[data-reduce-motion]` mà quy tắc toàn cục không có) thật sự tắt hoạt ảnh, không chỉ nhờ quy tắc kia
  check(
    (await evalJs(`getComputedStyle(document.querySelector(".limbo-fx i")).animationName`)) ===
      "none",
    "giảm chuyển động: hồn lửa animation-name = none (quy tắc riêng của luân hồi)",
  );
  check((await anims("stone-glow")) === 0, "giảm chuyển động: Tam Sinh Thạch không nhấp nháy");
  check(
    Number(
      await evalJs(`getComputedStyle(document.querySelector(".limbo-fx i:nth-child(1)")).opacity`),
    ) > 0,
    "giảm chuyển động: hồn lửa vẫn hiện (mờ, đứng yên)",
  );
  await evalJs(`window.__ui.showReborn(3); 1`);
  // kiểm PHỦ ĐỊNH (không hoạt ảnh nào): chờ tới khi lớp đầu thai đã hiện rồi cho vài khung để hoạt ảnh (nếu có) kịp khởi động
  await until(`getComputedStyle(document.querySelector(".reborn-bloom")).opacity > 0`);
  await frames(10);
  check(
    (await anims("petal-fall")) === 0 && (await anims("reborn-bloom")) === 0,
    "giảm chuyển động: cánh hoa / vầng sáng không chạy hoạt ảnh",
  );
  check(
    (await evalJs(`getComputedStyle(document.querySelector(".reborn-petals i")).animationName`)) ===
      "none" &&
      (await evalJs(`getComputedStyle(document.querySelector(".reborn-bloom")).animationName`)) ===
        "none",
    "giảm chuyển động: cánh hoa / vầng sáng animation-name = none",
  );
  check(
    Number(await evalJs(`getComputedStyle(document.querySelector(".reborn-bloom")).opacity`)) > 0,
    "giảm chuyển động: vầng sáng hiện thẳng (opacity > 0)",
  );

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  await launched?.close();
  if (server) await new Promise((r) => server.close(r));
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
