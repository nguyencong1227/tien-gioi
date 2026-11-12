/* global console, setTimeout, fetch, process */
// Cổng kiểm cử chỉ KÉO ĐỂ ĐÓNG TẤM (M5.1 #326, docs/THIET_KE_GIAO_DIEN_DO_HOA.md mục 4.2 điều 5; client/src/gfx/sheet-swipe.ts) trong Chrome thật,
// bằng cảm ứng thật qua CDP (`Input.dispatchTouchEvent`): trên điện thoại vuốt TIÊU ĐỀ tấm xuống (dọc) / sang phải (ngang) thì tấm theo ngón tay,
// thả đủ xa hoặc vuốt nhanh thì đóng, thả sớm thì trả về; vuốt ngược chiều / sai trục / ở thân tấm thì không đóng; máy tính bảng không có cử chỉ này;
// Giảm chuyển động thì đóng ngay. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183); chế độ mock (?duel=mock&debug=1), KHÔNG cần server.
//   node client/scripts/check-sheet-swipe.mjs [--url http://127.0.0.1:5183]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
const CDP_PORT = 43100 + Math.floor(Math.random() * 300);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-swipe-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
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
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1&crowd=6` });
  for (let k = 0; k < 40; k++) {
    await sleep(300);
    if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())")) break;
  }
  await sleep(600);

  await evalJs("window.__scene.syncNpcs = () => {};0");
  await evalJs(
    "document.querySelectorAll('.duel-mock-badge,.dungeon-mock-badge').forEach((e) => e.remove());0",
  );
  const PANELS = [
    ["inv-modal", "toggleInventory"],
    ["char-modal", "toggleCharModal"],
    ["settings-modal", "toggleSettingsModal"],
    ["map-modal", "toggleMapModal"],
    ["quest-modal", "toggleQuestModal"],
    ["shop-modal", "toggleShopModal"],
    ["forge-modal", "toggleForgeModal"],
    ["sect-modal", "toggleSectModal"],
  ];
  const VPS = [
    { name: "390x844", w: 390, h: 844, form: "phone", orient: "portrait", panels: PANELS },
    { name: "844x390", w: 844, h: 390, form: "phone", orient: "landscape", panels: PANELS },
    {
      name: "360x640",
      w: 360,
      h: 640,
      form: "phone",
      orient: "portrait",
      panels: PANELS.slice(0, 2),
    },
    {
      name: "768x1024",
      w: 768,
      h: 1024,
      form: "tablet",
      orient: "portrait",
      panels: PANELS.slice(0, 2),
    },
  ];
  // Thời gian ẢO (timestamp của sự kiện cảm ứng do script đặt, giây): vận tốc vuốt tất định, không phụ thuộc độ trễ CDP
  let vt = Date.now() / 1000;
  const touch = (type, x, y) =>
    send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      timestamp: vt,
    });
  /** Vuốt từ (x, y) với các bước (dx, dy) cách nhau `gap` ms (thời gian ảo); `beforeEnd` chạy khi ngón còn trên màn hình. */
  const swipe = async (x, y, steps, gap, beforeEnd) => {
    vt += 0.5; // tách khỏi cử chỉ trước
    await touch("touchStart", x, y);
    let cx = x;
    let cy = y;
    for (const [dx, dy] of steps) {
      cx += dx;
      cy += dy;
      vt += gap / 1000;
      await touch("touchMove", cx, cy);
      await sleep(4);
    }
    if (beforeEnd) await beforeEnd();
    vt += 0.001;
    await touch("touchEnd", cx, cy);
  };
  const repeat = (n, dx, dy) => Array.from({ length: n }, () => [dx / n, dy / n]);
  const state = (id) =>
    evalJs(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      const r = el.getBoundingClientRect();
      return JSON.stringify({ hidden: el.hidden, transform: el.style.transform, animation: el.style.animation, transition: el.style.transition,
        top: r.top, left: r.left, right: r.right, w: r.width, h: r.height, iw: innerWidth });
    })()`).then(JSON.parse);
  const headPoint = (id) =>
    evalJs(`(() => {
      const r = document.getElementById(${JSON.stringify(id)}).querySelector(":scope > .inv-head").getBoundingClientRect();
      return JSON.stringify({ x: r.x + 40, y: r.y + r.height / 2, w: r.width, h: r.height });
    })()`).then(JSON.parse);
  const open = async (toggle, on) => {
    await evalJs(`window.__ui.${toggle}(${on});0`);
    await sleep(on ? 450 : 100);
  };
  /** Mép tấm ở đúng chỗ (chưa dịch): dọc top = 0; ngang sát cạnh phải. */
  const atRest = (s, orient) =>
    orient === "portrait" ? Math.abs(s.top) < 1 : Math.abs(s.right - s.iw) < 1;
  const shift = (s, rest, orient) =>
    orient === "portrait" ? s.top - rest.top : s.left - rest.left;

  for (const vp of VPS) {
    console.log(`\n=== ${vp.name} (${vp.form}/${vp.orient}) ===`);
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(500);
    const dd = await evalJs(
      "document.documentElement.dataset.form + '/' + document.documentElement.dataset.orient",
    );
    check(dd === `${vp.form}/${vp.orient}`, `display.ts phân loại ${vp.form}/${vp.orient} (${dd})`);
    const dir = vp.orient === "portrait" ? [0, 1] : [1, 0]; // chiều đóng
    const cross = vp.orient === "portrait" ? [1, 0] : [0, 1];
    for (const [id, toggle] of vp.panels) {
      await open(toggle, true);
      const rest = await state(id);
      const hp = await headPoint(id);
      const size = vp.orient === "portrait" ? rest.h : rest.w;
      const tag = `${vp.name} ${id}`;
      if (vp.form !== "phone") {
        // Máy tính bảng: cửa sổ nổi, không có cử chỉ kéo để đóng. Ép `touch-action: none` ở tiêu đề để trình duyệt không tự huỷ cử chỉ:
        // chỉ còn chốt `data-form === "phone"` trong JS đứng giữa cú vuốt và việc đóng tấm
        await evalJs(
          `document.getElementById(${JSON.stringify(id)}).querySelector(":scope > .inv-head").style.touchAction = "none";0`,
        );
        await swipe(hp.x, hp.y, repeat(10, 0, 300), 20);
        await sleep(300);
        const s = await state(id);
        check(
          !s.hidden && s.transform === "",
          `${tag}: máy tính bảng, vuốt tiêu đề KHÔNG đóng / không dịch tấm`,
        );
        await open(toggle, false);
        continue;
      }
      check(Math.abs(rest.top) < 1 || vp.orient === "landscape", `${tag}: tấm mở ở chỗ nghỉ`);
      // A. Vuốt ngắn: tấm theo ngón tay rồi trả về
      let mid = null;
      await swipe(hp.x, hp.y, repeat(8, dir[0] * 40, dir[1] * 40), 30, async () => {
        await sleep(80); // chờ khung hình xử lý nốt sự kiện di chuyển cuối
        mid = await state(id);
      });
      const dMid = shift(mid, rest, vp.orient);
      check(
        Math.abs(dMid - 40) <= 3,
        `${tag}: tấm theo ngón tay khi vuốt (dịch ${dMid.toFixed(1)} / 40 px)`,
      );
      await sleep(350);
      let s = await state(id);
      check(
        !s.hidden &&
          s.transform === "" &&
          s.animation === "" &&
          s.transition === "" &&
          atRest(s, vp.orient),
        `${tag}: thả sớm (40 px, chậm) thì trả về, dọn kiểu inline`,
      );
      // D. Ngược chiều đóng: đứng yên
      await swipe(hp.x, hp.y, repeat(8, -dir[0] * 20 + dir[0] * 0, -dir[1] * 20), 20);
      await sleep(300);
      s = await state(id);
      check(!s.hidden && s.transform === "", `${tag}: vuốt ngược chiều đóng thì tấm đứng yên`);
      // E. Sai trục (vuốt ngang trên tấm dọc, dọc trên ngăn kéo ngang)
      await swipe(hp.x, hp.y, repeat(8, cross[0] * 20, cross[1] * 20), 20);
      await sleep(300);
      s = await state(id);
      check(!s.hidden && s.transform === "", `${tag}: vuốt sai trục thì tấm đứng yên`);
      // F. Vuốt ở THÂN tấm (không phải tiêu đề): không đóng
      const bodyY = vp.orient === "portrait" ? rest.h * 0.45 : rest.h * 0.45;
      const bodyX = vp.orient === "portrait" ? rest.w * 0.5 : rest.left + rest.w * 0.5;
      await swipe(bodyX, bodyY, repeat(10, dir[0] * 0.4 * size, dir[1] * 0.4 * size), 20);
      await sleep(350);
      s = await state(id);
      check(
        !s.hidden && s.transform === "",
        `${tag}: vuốt ở thân tấm (0,4 x kích thước) KHÔNG đóng`,
      );
      // C. Vuốt nhanh (flick) ngắn: đóng
      await swipe(hp.x, hp.y, repeat(5, dir[0] * 70, dir[1] * 70), 10);
      await sleep(450);
      s = await state(id);
      check(
        s.hidden && s.transform === "" && s.transition === "",
        `${tag}: vuốt nhanh 70 px đóng tấm, dọn kiểu inline`,
      );
      // Mở lại: animation trượt vào còn nguyên (kiểu inline đã dọn)
      await open(toggle, true);
      s = await state(id);
      check(
        !s.hidden && s.transform === "" && atRest(s, vp.orient),
        `${tag}: mở lại bình thường sau khi đóng bằng cử chỉ`,
      );
      // B. Vuốt chậm nhưng đủ xa (0,45 x kích thước): đóng
      await swipe(
        hp.x,
        hp.y,
        repeat(15, ((dir[0] * 0.45 * size) / 15) * 15, ((dir[1] * 0.45 * size) / 15) * 15),
        25,
      );
      await sleep(450);
      s = await state(id);
      check(s.hidden, `${tag}: vuốt chậm qua 30 % kích thước đóng tấm`);
      if (!s.hidden) await open(toggle, false);

      // D. Ngưỡng 30 % (SWIPE_CLOSE_FRAC) phải tách bạch với vuốt nhanh (flick): hai ca dưới đều đi RẤT CHẬM
      // (20 bước cách 40 ms, ~0,2-0,4 px/ms, dưới SWIPE_FLICK_V = 0,6) nên chỉ ngưỡng quãng đường quyết định.
      // (Ca "vuốt chậm" phía trên thật ra ~1 px/ms nên đóng nhờ flick, không chứng minh được ngưỡng.)
      await open(toggle, true);
      await swipe(hp.x, hp.y, repeat(20, dir[0] * 0.2 * size, dir[1] * 0.2 * size), 40);
      await sleep(450);
      s = await state(id);
      check(
        !s.hidden && s.transform === "" && s.transition === "" && atRest(s, vp.orient),
        `${tag}: thả CHẬM ở 20 % kích thước thì trả về (không đóng), dọn kiểu inline`,
      );
      await swipe(hp.x, hp.y, repeat(20, dir[0] * 0.4 * size, dir[1] * 0.4 * size), 40);
      await sleep(450);
      s = await state(id);
      check(
        s.hidden,
        `${tag}: thả CHẬM ở 40 % kích thước thì đóng (đủ ngưỡng 30 %, không phải flick)`,
      );
      if (!s.hidden) await open(toggle, false);
    }
    if (vp.name === "390x844") {
      // Giảm chuyển động: đóng ngay, không trượt
      await evalJs('document.documentElement.dataset.reduceMotion = "1";0');
      await open("toggleInventory", true);
      const hp = await headPoint("inv-modal");
      await swipe(hp.x, hp.y, repeat(10, 0, 400), 20);
      await sleep(60);
      check(
        (await state("inv-modal")).hidden,
        "giảm chuyển động: thả xong tấm đóng ngay (không chờ trượt)",
      );
      await evalJs("delete document.documentElement.dataset.reduceMotion;0");
    }
  }
  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
