import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm hiệu ứng luân hồi bằng CSS thuần (hồn lửa Hoàng Tuyền, Tam Sinh Thạch, cánh hoa đầu thai) trong Chrome thật (M5.2 #329). Cần client đang chạy
// (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-limbo-fx.mjs [--url http://127.0.0.1:5183] [--shot docs/screenshots/combat-fx.webp]
// Đo hoạt ảnh CSS đang CHẠY THẬT (document.getAnimations), kiểu tính toán của hồn lửa / cánh hoa và ảnh chụp màn hình.
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-limbo-fx-"));
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
    return 0;
  })()`);

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
  await sleep(500);
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
  await sleep(1200);
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
  await sleep(900);
  const p = await anims("petal-fall");
  const b = await anims("reborn-bloom");
  check(p === 12 && b === 1, `đầu thai: ${p} cánh hoa rơi + ${b} vầng sáng đang chạy`);
  check(
    (await evalJs(`getComputedStyle(document.querySelector(".reborn-bloom")).opacity`)) > 0,
    "vầng sáng mờ trắng đã nở (opacity > 0)",
  );
  if (shotBase) await shot(`${shotBase}-dau-thai.webp`);
  await sleep(3600); // 2,5 s hiện + 0,6 s mờ đi
  check((await anims("petal-fall")) === 0, "xong đầu thai: không còn hoạt ảnh cánh hoa nào chạy");
  check(
    (await evalJs(`getComputedStyle(document.querySelector(".limbo-fx")).display`)) === "none",
    "xong đầu thai (rời Hoàng Tuyền): lớp hồn lửa ẩn lại",
  );

  // 4) Giảm chuyển động: hồn lửa / cánh hoa đứng yên (không hoạt ảnh), vẫn hiện mờ
  await evalJs(
    `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = true; c.dispatchEvent(new Event("change")); })()`,
  );
  await sleep(300);
  await showLimbo();
  await sleep(400);
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
  await sleep(900);
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
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
