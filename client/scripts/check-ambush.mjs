import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm HỘP THOẠI GẶP CHẶN ĐƯỜNG (mục 52, CD7 #1067) trong Chrome THẬT qua CDP, chế độ `?skills=mock&n=2`, KHÔNG cần máy chủ: tin `ambushOffer` mẫu đổ thẳng vào `__ui.onAmbushOffer`
// (đường vào của `reg(AMBUSH_MSG.offer)`), tin gửi đi bắt ở `__scene.room.send`. Kiểm: hiện + bàn phím bị giữ + gửi `ambushSeen` đúng một lần; khoá 700 ms (nút mờ, bấm không gửi);
// Esc KHÔNG đóng; phím chữ / số của chiến đấu KHÔNG chọn gì; Enter khi focus ở khung = Chiến, Enter trên nút nào thì nút đó; tin gửi chỉ có `id` + `choice`; gửi một lần;
// cập nhật cùng `id` (nối lại) không khoá lại 700 ms và gửi lại `ambushSeen`; không đủ Linh thạch / thanh tu vi trống thì nút mờ và bấm không gửi; hết giờ cục bộ không tự chọn;
// đang nối lại thì nút mờ, đồng hồ "Tạm dừng", hộp thoại KHÔNG bị `showReconnectNotice` đóng; nhân vật đứng yên (không gửi `input` đi) khi giữ phím đi; `ambushEnd` đóng hộp thoại,
// báo đúng cái giá (huỷ lặng lẽ không báo); ở 5 khung: hộp thoại nằm trong màn hình, không tràn ngang, ba nút >= 44 px và Chiến cách xa hai nút bỏ chạy, không phải cuộn. Có thể chụp ảnh:
//   node client/scripts/check-ambush.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-ambush-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    // Chrome không đầu không có chuột: giả lập chuột (4 = fine, 2 = hover) như các script khác
    "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
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
  const J = async (expression) => JSON.parse(await evalJs(`JSON.stringify(${expression})`));

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high')}catch(e){}",
  });

  const open = async (w, h, mobile = false) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())"))
        break;
    }
    await sleep(800);
    // bắt mọi tin gửi lên máy chủ liên quan: ambush*, input, cast, attack
    await evalJs(`(() => { const sc = window.__scene; window.__sent = [];
      const orig = sc.room.send.bind(sc.room);
      sc.room.send = (t, d) => { if (/^ambush|^input$|^cast$|^attack$/.test(t)) window.__sent.push({ t, d }); return orig(t, d); };
      return 1; })()`);
  };
  const KEY = {
    Escape: { code: "Escape", key: "Escape", vk: 27 },
    Enter: { code: "Enter", key: "Enter", vk: 13 },
    Tab: { code: "Tab", key: "Tab", vk: 9 },
    ArrowDown: { code: "ArrowDown", key: "ArrowDown", vk: 40 },
    ArrowRight: { code: "ArrowRight", key: "ArrowRight", vk: 39 },
    Y: { code: "KeyY", key: "y", vk: 89 },
    J: { code: "KeyJ", key: "j", vk: 74 },
    K: { code: "KeyK", key: "k", vk: 75 },
    Z: { code: "KeyZ", key: "z", vk: 90 },
    X: { code: "KeyX", key: "x", vk: 88 },
    V: { code: "KeyV", key: "v", vk: 86 },
    D1: { code: "Digit1", key: "1", vk: 49 },
    D2: { code: "Digit2", key: "2", vk: 50 },
    L: { code: "KeyL", key: "l", vk: 76 },
    Space: { code: "Space", key: " ", vk: 32 },
    D: { code: "KeyD", key: "d", vk: 68 },
  };
  const base = (k) => ({
    code: k.code,
    key: k.key,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
  });
  const press = async (name) => {
    const k = KEY[name];
    // Enter: `keyDown` kèm `text` sinh `char` nên nút được kích hoạt như bàn phím thật (rawKeyDown thì không)
    if (name === "Enter")
      await send("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", ...base(k) });
    else await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base(k) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base(k) });
    await sleep(120);
  };
  const sent = () => J("window.__sent");
  const clearSent = () => evalJs("window.__sent.length = 0; 1");
  const shot = async (name) => {
    if (!SHOTS) return;
    const png = await send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(png.result.data, "base64"));
  };
  const sample = (patch = {}) =>
    JSON.stringify({
      id: "0123456789abcdef",
      scene:
        "Đường đi bỗng vắng hẳn. Từ bụi cỏ ven lối, một bóng đen lao ra chắn trước mặt, mắt đỏ ngầu.",
      foe: { name: "Sói Hoang", tier: "normal", count: 2 },
      price: { exp: 420, coin: { price: 30, enough: true } },
      ms: 10000,
      ...patch,
    });
  const offer = (patch) => evalJs(`window.__ui.onAmbushOffer(${sample(patch)}); 1`);
  const state = () =>
    J(`(() => {
      const q = (id) => document.getElementById(id);
      const m = q('ambush-modal');
      const btn = (id) => { const b = q(id); return { dis: b.getAttribute('aria-disabled'), sub: b.querySelector('.ab-sub').textContent,
        label: b.querySelector('.ab-label').textContent, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }; };
      return { open: !m.hidden, inAmbush: document.body.classList.contains('in-ambush'), captured: window.__ui.isKeyboardCaptured(),
        focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '', foe: q('ambush-foe').textContent,
        scene: q('ambush-scene').textContent, danger: !q('ambush-danger').hidden, dangerText: q('ambush-danger').textContent, count: q('ambush-countdown').textContent, note: q('ambush-note').textContent,
        fight: btn('ambush-fight'), coin: btn('ambush-flee-coin'), exp: btn('ambush-flee-exp') };
    })()`);
  const layout = () =>
    J(`(() => {
      const r = (id) => { const x = document.getElementById(id).getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom, h: x.height, w: x.width }; };
      const box = document.querySelector('.ambush-box');
      const bx = box.getBoundingClientRect();
      return { vw: innerWidth, vh: innerHeight, box: { l: bx.left, t: bx.top, r: bx.right, b: bx.bottom, sh: box.scrollHeight, ch: box.clientHeight },
        sw: document.documentElement.scrollWidth, fight: r('ambush-fight'), coin: r('ambush-flee-coin'), exp: r('ambush-flee-exp') };
    })()`);
  const ARM_WAIT = 850;

  console.log("--- 1280x720: mở, khoá 700 ms, Esc, phím chiến đấu ---");
  await open(1280, 720);
  let s0 = await state();
  check(!s0.open && !s0.inAmbush, "chưa có hộp thoại lúc đầu");
  await clearSent();
  await offer();
  await sleep(120);
  let s = await state();
  check(s.open && s.inAmbush, "ambushOffer mở hộp thoại (hiện, body.in-ambush)");
  check(s.captured, "bàn phím bị giữ (phím thế giới không chạy)");
  check(s.focus === "ambush-modal", `focus ở KHUNG, không ở nút (${s.focus})`);
  check(
    s.fight.sub === "Đấu một mình · Enter",
    `nút Chiến ghi 'Đấu một mình' kèm gợi ý Enter khi có chuột ('${s.fight.sub}')`,
  );
  check(s.foe === "Sói Hoang · Thường × 2", `tên kẻ chặn đường kèm mức và số lượng ('${s.foe}')`);
  check(!s.danger, "mức Thường: KHÔNG có nhãn NGUY HIỂM");
  check(s.scene.startsWith("Đường đi bỗng vắng hẳn"), "văn mẫu hiện đúng");
  check(
    s.coin.sub === "30 Linh thạch" && s.exp.sub === "420 tu vi",
    `giá trên nút = giá trong tin ('${s.coin.sub}' / '${s.exp.sub}')`,
  );
  check(
    s.fight.dis === "true" && s.coin.dis === "true" && s.exp.dis === "true",
    "còn khoá 700 ms: cả ba nút mờ (aria-disabled)",
  );
  let m = await sent();
  const seen = m.filter((x) => x.t === "ambushSeen");
  check(
    seen.length === 1 && seen[0].d.id === "0123456789abcdef" && Object.keys(seen[0].d).length === 1,
    `gửi ambushSeen đúng MỘT lần, chỉ có id (${seen.length})`,
  );
  await evalJs(
    `document.getElementById('ambush-flee-coin').click(); document.getElementById('ambush-fight').click(); 1`,
  );
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushChoose").length === 0,
    "bấm trong lúc khoá 700 ms: KHÔNG gửi ambushChoose",
  );
  await sleep(ARM_WAIT);
  s = await state();
  check(
    s.fight.dis === "false" && s.coin.dis === "false" && s.exp.dis === "false",
    "hết khoá: cả ba nút bật",
  );
  await press("Escape");
  s = await state();
  check(s.open && s.captured, "Esc KHÔNG đóng hộp thoại");
  await clearSent();
  for (const k of ["J", "K", "Z", "X", "V", "D1", "D2", "L", "Space"]) await press(k);
  m = await sent();
  s = await state();
  check(
    m.filter((x) => x.t === "ambushChoose" || x.t === "cast" || x.t === "attack").length === 0 &&
      s.open,
    `phím chiến đấu (J K Z X V 1 2 L Cách) KHÔNG chọn gì, không đánh (${m.map((x) => x.t).join(",") || "không tin"})`,
  );
  await shot("chan-duong-1280x720");

  // chạm xuyên lớp phủ: MỌI nút HUD (Chém, chiêu, túi, mục tiêu...) đang hiện trong màn hình phải bị lớp phủ che (chạm trúng hộp thoại, không trúng nút)
  const leaks = await J(`(() => {
    const bad = [];
    for (const b of document.querySelectorAll('button, [role=button], .sk')) {
      if (b.closest('#ambush-modal')) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      if (getComputedStyle(b).visibility === 'hidden' || b.closest('[hidden]')) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && !hit.closest('#ambush-modal')) bad.push((b.id || b.className || b.tagName).toString().slice(0, 30));
    }
    return bad;
  })()`);
  check(
    leaks.length === 0,
    `lớp phủ che MỌI nút HUD (chạm không xuyên được): ${leaks.length} nút lọt (${leaks.slice(0, 4).join(", ")})`,
  );

  console.log("--- nhân vật đứng yên khi hộp thoại mở ---");
  await clearSent();
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base(KEY.D) });
  await sleep(450);
  m = await sent();
  const moved = m.filter((x) => x.t === "input" && (x.d.dx !== 0 || x.d.dy !== 0)).length;
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base(KEY.D) });
  check(moved === 0, `giữ phím đi (D) 450 ms: không gửi input di chuyển (${moved})`);

  console.log("--- Tab / mũi tên / Enter trên nút ---");
  await press("Tab");
  s = await state();
  check(s.focus === "ambush-fight", `Tab đầu tiên vào nút Chiến (${s.focus})`);
  await press("Tab");
  await press("Tab");
  s = await state();
  check(s.focus === "ambush-flee-exp", `Tab xoay qua Linh thạch rồi tu vi (${s.focus})`);
  await press("Tab");
  s = await state();
  check(
    s.focus === "ambush-fight",
    `Tab xoay vòng về Chiến, không ra ngoài hộp thoại (${s.focus})`,
  );
  await press("ArrowDown");
  s = await state();
  check(s.focus !== "BODY" && s.focus !== "ambush-fight", `mũi tên chuyển nút (${s.focus})`);
  await evalJs("document.getElementById('ambush-flee-coin').focus(); 1");
  await clearSent();
  await press("Enter");
  m = await sent();
  const ch = m.filter((x) => x.t === "ambushChoose");
  check(
    ch.length === 1 &&
      ch[0].d.choice === "flee_coin" &&
      ch[0].d.id === "0123456789abcdef" &&
      Object.keys(ch[0].d).sort().join() === "choice,id",
    `Enter trên nút Linh thạch gửi flee_coin, chỉ id + choice (${JSON.stringify(ch)})`,
  );
  s = await state();
  check(s.note === "Đang xử lý…" && s.fight.dis === "true", "đã gửi: 'Đang xử lý…', nút mờ");
  await clearSent();
  await evalJs("document.getElementById('ambush-fight').click(); 1");
  await press("Y");
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushChoose").length === 0,
    "đã gửi rồi thì bấm tiếp / Y KHÔNG gửi hai lần",
  );
  await evalJs(
    `window.__ui.onAmbushEnd(${JSON.stringify({ result: "fled", paid: { coin: 30 } })}); 1`,
  );
  await sleep(150);
  s = await state();
  check(!s.open && !s.inAmbush && !s.captured, "ambushEnd đóng hộp thoại, nhả bàn phím");
  const toast1 = await evalJs(
    "[...document.querySelectorAll('#toast p')].map(e=>e.textContent).join('|')",
  );
  check(
    /Bỏ chạy thành công\. Mất 30 Linh thạch\./.test(toast1),
    `toast nói đúng cái giá ('${String(toast1).slice(0, 80)}')`,
  );

  console.log("--- Enter khi focus ở khung = Chiến; hết khoá mới nhận ---");
  await offer();
  await sleep(120);
  await clearSent();
  await press("Enter"); // còn khoá 700 ms
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushChoose").length === 0,
    "Enter lúc còn khoá 700 ms: không gửi",
  );
  await sleep(ARM_WAIT);
  await press("Enter");
  m = await sent();
  const fc = m.filter((x) => x.t === "ambushChoose");
  check(
    fc.length === 1 && fc[0].d.choice === "fight",
    `Enter (focus ở khung) sau khi hết khoá = Chiến (${JSON.stringify(fc)})`,
  );
  await evalJs(`window.__ui.onAmbushEnd(${JSON.stringify({ result: "canceled" })}); 1`);
  await sleep(100);
  s = await state();
  check(!s.open, "ambushEnd 'canceled' đóng hộp thoại");
  const toast2 = await evalJs("document.querySelectorAll('#toast p').length");
  check(toast2 === 1, `huỷ lặng lẽ KHÔNG thêm toast nào (còn ${toast2}: chỉ toast bỏ chạy cũ)`);

  console.log("--- giữ phím Enter (lặp) và tin chưa gửi được ---");
  await offer();
  await sleep(ARM_WAIT);
  await clearSent();
  // phím LẶP (giữ Enter từ trước, autoRepeat) KHÔNG được chọn; nhấn thật mới chọn
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: "\r",
    autoRepeat: true,
    ...base(KEY.Enter),
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base(KEY.Enter) });
  await sleep(150);
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushChoose").length === 0,
    "Enter LẶP (đang giữ phím) không chọn gì",
  );
  await evalJs(`window.__ui.onAmbushEnd(${JSON.stringify({ result: "canceled" })}); 1`);
  // máy khách đang nối lại (scene.isReconnecting) mà tin chưa đi được: chưa coi là ĐÃ GỬI `ambushSeen`, gửi bù khi gửi được
  await evalJs("window.__scene.isReconnecting = true; 1");
  await clearSent();
  await offer({ id: "00112233445566aa" });
  await sleep(600);
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushSeen").length === 0,
    "scene đang nối lại: chưa gửi được ambushSeen (không giả vờ đã gửi)",
  );
  await evalJs("window.__scene.isReconnecting = false; 1");
  await sleep(600);
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushSeen").length === 1,
    `gửi được thì gửi bù ambushSeen đúng một lần (${m.filter((x) => x.t === "ambushSeen").length})`,
  );
  await evalJs(`window.__ui.onAmbushEnd(${JSON.stringify({ result: "canceled" })}); 1`);

  console.log("--- cập nhật cùng id (như sau khi nối lại mạng) ---");
  await offer();
  await sleep(ARM_WAIT + 100);
  await clearSent();
  await offer({ ms: 4000 }); // cùng id: cập nhật như sau khi nối lại mạng
  await sleep(120);
  s = await state();
  check(
    s.open && s.fight.dis === "false",
    "cập nhật cùng id: hộp thoại giữ nguyên, KHÔNG khoá lại 700 ms",
  );
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushSeen").length === 1,
    `cập nhật cùng id gửi LẠI ambushSeen (${m.filter((x) => x.t === "ambushSeen").length})`,
  );
  await evalJs(`window.__ui.onAmbushEnd(${JSON.stringify({ result: "canceled" })}); 1`);

  console.log("--- không đủ Linh thạch / thanh tu vi trống / hết giờ cục bộ ---");
  await offer({ price: { exp: 0, coin: { price: 90, enough: false } } });
  await sleep(ARM_WAIT);
  s = await state();
  check(
    s.coin.dis === "true" && s.coin.sub === "90 Linh thạch (không đủ)",
    `không đủ Linh thạch: nút mờ nhưng vẫn hiện giá ('${s.coin.sub}')`,
  );
  check(
    s.exp.dis === "true" && s.exp.sub === "Thanh tu vi trống" && !/miễn phí/i.test(s.exp.sub),
    `thanh tu vi trống: nút khoá, không 'miễn phí' ('${s.exp.sub}')`,
  );
  await clearSent();
  await evalJs(
    "document.getElementById('ambush-flee-coin').click(); document.getElementById('ambush-flee-exp').click(); 1",
  );
  m = await sent();
  check(m.filter((x) => x.t === "ambushChoose").length === 0, "bấm hai nút mờ: không gửi gì");
  await evalJs(`window.__ui.onAmbushEnd(${JSON.stringify({ result: "canceled" })}); 1`);
  await offer({ id: "fedcba9876543210", ms: 900 });
  await sleep(1400);
  s = await state();
  check(
    s.open && s.count === "Chờ…" && s.note === "Đang chờ máy chủ…",
    `hết giờ cục bộ: vẫn mở, 'Đang chờ máy chủ…' ('${s.count}' / '${s.note}')`,
  );
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushChoose").length === 0,
    "hết giờ cục bộ KHÔNG tự chọn (máy chủ mới quyết)",
  );
  await evalJs(`window.__ui.onAmbushEnd(${JSON.stringify({ result: "canceled" })}); 1`);

  console.log("--- đang nối lại mạng ---");
  await offer();
  await sleep(ARM_WAIT);
  await evalJs("window.__ui.showReconnectNotice('Mất kết nối, đang nối lại...'); 1");
  await sleep(300);
  s = await state();
  check(
    s.open && s.captured,
    "showReconnectNotice KHÔNG đóng hộp thoại chặn đường, bàn phím vẫn bị giữ",
  );
  check(
    s.count === "Tạm dừng" && s.fight.dis === "true" && /nối lại/.test(s.note),
    `đang nối lại: đồng hồ 'Tạm dừng', nút mờ ('${s.count}' / '${s.note}')`,
  );
  await clearSent();
  await evalJs("document.getElementById('ambush-fight').click(); 1");
  m = await sent();
  check(m.filter((x) => x.t === "ambushChoose").length === 0, "đang nối lại: bấm không gửi gì");
  await evalJs("window.__ui.hideReconnectNotice(); 1");
  await sleep(350);
  s = await state();
  check(s.open && s.fight.dis === "false", "nối lại xong: nút bật lại, hộp thoại còn nguyên");
  await evalJs(`window.__ui.onAmbushEnd(${JSON.stringify({ result: "canceled" })}); 1`);

  console.log("--- tin hỏng bị bỏ ---");
  for (const bad of [null, 5, "x", {}, { id: "zzz" }, JSON.parse(sample({ ms: "5" }))]) {
    await evalJs(`window.__ui.onAmbushOffer(${JSON.stringify(bad)}); 1`);
  }
  s = await state();
  check(!s.open, "ambushOffer sai dạng không mở hộp thoại");

  console.log("--- kích thước ở 5 khung ---");
  const FRAMES = [
    { name: "mobile-sm", w: 360, h: 640, mobile: true },
    { name: "mobile-l", w: 844, h: 390, mobile: true },
    { name: "mobile-p", w: 390, h: 844, mobile: true },
    { name: "tablet-p", w: 768, h: 1024, mobile: true },
    { name: "desktop-hd", w: 1280, h: 720, mobile: false },
  ];
  for (const f of FRAMES) {
    await open(f.w, f.h, f.mobile);
    await offer({
      scene:
        "Đường đi bỗng vắng hẳn. Từ bụi cỏ ven lối, một bóng đen lao ra chắn trước mặt, mắt đỏ ngầu. Gió cuốn bụi mù mịt, tiếng gầm gừ vang lên từ phía sau những tảng đá lớn bên đường.",
      foe: { name: "Đạo Tặc Đầu Lĩnh", tier: "leader", count: 3 },
      price: { exp: 123456, coin: { price: 12345, enough: true } },
    });
    await sleep(ARM_WAIT);
    const L = await layout();
    const inView = L.box.l >= 0 && L.box.t >= 0 && L.box.r <= L.vw + 0.5 && L.box.b <= L.vh + 0.5;
    check(
      inView,
      `${f.name} ${f.w}x${f.h}: hộp thoại nằm trong màn hình (${Math.round(L.box.t)}..${Math.round(L.box.b)} / ${L.vh})`,
    );
    check(L.sw <= L.vw, `${f.name}: không tràn ngang (${L.sw}/${L.vw})`);
    check(
      L.box.sh <= L.box.ch + 1,
      `${f.name}: ba nút hiện đủ, không phải cuộn (${L.box.sh}/${L.box.ch})`,
    );
    const small = [L.fight, L.coin, L.exp].filter((b) => b.h < 44 || b.w < 44);
    check(small.length === 0, `${f.name}: ba nút >= 44 px (${small.length} nút nhỏ)`);
    // Chiến cách xa hai nút bỏ chạy (không dính nhau để khỏi bấm nhầm): khoảng trống dọc >= 12 px
    check(
      L.coin.t - L.fight.b >= 12 && L.exp.t - L.fight.b >= 12,
      `${f.name}: Chiến cách nút bỏ chạy ${Math.round(L.coin.t - L.fight.b)} px (>= 12)`,
    );
    check(
      L.coin.r <= L.exp.l - 6,
      `${f.name}: hai nút bỏ chạy cách nhau ${Math.round(L.exp.l - L.coin.r)} px`,
    );
    const st = await state();
    check(
      st.coin.sub === "12.345 Linh thạch" && st.exp.sub === "123.456 tu vi",
      `${f.name}: số lớn có dấu chấm ngăn nghìn ('${st.coin.sub}' / '${st.exp.sub}')`,
    );
    await shot(`chan-duong-${f.name}`);
  }

  console.log("--- ĐẤU TRƯỜNG: HUD, bỏ chạy có xác nhận, thẻ kết quả ---");
  await open(1280, 720);
  const AST = (patch = {}) =>
    JSON.stringify({
      msLeft: 83_000,
      price: { exp: 840, coin: { price: 60, enough: true } },
      ...patch,
    });
  const arena = () =>
    J(`(() => {
      const q = (id) => document.getElementById(id);
      const btn = (id) => { const b = q(id); return { dis: b.getAttribute('aria-disabled'), sub: b.querySelector('.ab-sub').textContent }; };
      return { hud: !q('ambush-hud').hidden, inArena: document.body.classList.contains('in-arena'), clock: q('ahud-clock').textContent,
        urgent: q('ahud-clock').classList.contains('urgent'), fleeDis: q('ahud-flee').getAttribute('aria-disabled'), note: q('ahud-note').textContent,
        fleeBar: !q('ahud-flee-bar').hidden, fleeFill: q('ahud-flee-fill').style.width, sheet: !q('ambush-flee-modal').hidden, captured: window.__ui.isKeyboardCaptured(), focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '',
        coin: btn('aflee-coin'), exp: btn('aflee-exp'), text: q('aflee-text').textContent, anote: q('aflee-note').textContent,
        result: !q('ambush-result').hidden, rTitle: q('ar-title').textContent, rLines: [...q('ar-lines').children].map((li) => li.textContent), rCls: q('ambush-result').className };
    })()`);
  await clearSent();
  await evalJs(`window.__ui.onAmbushState(${AST()}); 1`);
  await sleep(250);
  let a = await arena();
  check(a.hud && a.inArena, "ambushState hiện HUD đấu trường (body.in-arena)");
  check(/^01:2\d$/.test(a.clock) && !a.urgent, `đồng hồ theo msLeft ('${a.clock}')`);
  check(
    a.fleeDis === "false" && !a.sheet && !a.captured,
    "nút Bỏ chạy bấm được; chưa mở xác nhận; bàn phím KHÔNG bị giữ (đang đánh)",
  );
  m = await sent();
  check(m.filter((x) => x.t === "ambushFlee").length === 0, "chưa bấm gì thì KHÔNG gửi ambushFlee");
  // mở xác nhận ngay sau tin đầu (< 400 ms kể từ lúc giá hiện): nút giá còn khoá ngắn
  await evalJs(
    `window.__ui.onAmbushState(${AST({ price: { exp: 900, coin: { price: 66, enough: true } } })}); document.getElementById('ahud-flee').click(); 1`,
  );
  a = await arena();
  check(
    a.sheet && a.captured && a.focus === "ambush-flee-modal",
    `bấm Bỏ chạy: mở bảng xác nhận, giữ bàn phím, focus ở KHUNG (${a.focus})`,
  );
  check(
    a.coin.dis === "true" && a.exp.dis === "true",
    "giá vừa đổi: hai nút giá còn khoá ngắn (khỏi bấm trúng số khác với số vừa thấy)",
  );
  check(
    a.coin.sub === "66 Linh thạch" && a.exp.sub === "900 tu vi",
    `giá trên nút = giá của tin MỚI NHẤT ('${a.coin.sub}' / '${a.exp.sub}')`,
  );
  check(
    /nhiều hơn lúc mới gặp/.test(a.text),
    "bảng nhắc bỏ chạy giữa trận mất nhiều hơn lúc mới gặp",
  );
  await evalJs("document.getElementById('aflee-coin').click(); 1");
  m = await sent();
  check(m.filter((x) => x.t === "ambushFlee").length === 0, "bấm trong lúc khoá ngắn: KHÔNG gửi");
  await sleep(550);
  a = await arena();
  check(a.coin.dis === "false" && a.exp.dis === "false", "hết khoá ngắn: hai nút giá bật");
  // giá ĐỔI giữa chừng: khoá lại, số hiện đổi theo
  await evalJs(
    `window.__ui.onAmbushState(${AST({ price: { exp: 1000, coin: { price: 70, enough: true } } })}); 1`,
  );
  a = await arena();
  check(
    a.coin.dis === "true" && a.coin.sub === "70 Linh thạch",
    `giá đổi giữa lúc mở bảng: nút khoá lại và hiện số mới ('${a.coin.sub}')`,
  );
  await sleep(550);
  await clearSent();
  await press("Escape");
  a = await arena();
  check(
    !a.sheet && a.hud && !a.captured,
    "Esc đóng bảng xác nhận (= Ở lại đánh), HUD còn, nhả bàn phím",
  );
  await evalJs("document.getElementById('ahud-flee').click(); 1");
  await sleep(150);
  await clearSent();
  for (const k of ["J", "K", "Z", "X", "V", "D1", "D2", "L", "Space", "Y"]) await press(k);
  m = await sent();
  check(
    m.filter((x) => /^ambush|^cast$|^attack$/.test(x.t)).length === 0,
    `bảng xác nhận mở: phím chiến đấu / Y KHÔNG gửi gì (${m.map((x) => x.t).join(",") || "không tin"})`,
  );
  const arenaLeaks = await J(`(() => {
    const bad = [];
    for (const b of document.querySelectorAll('button, [role=button], .sk')) {
      if (b.closest('#ambush-flee-modal')) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      if (b.closest('[hidden]')) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && !hit.closest('#ambush-flee-modal')) bad.push((b.id || b.className || b.tagName).toString().slice(0, 30));
    }
    return bad;
  })()`);
  check(
    arenaLeaks.length === 0,
    `bảng xác nhận che MỌI nút khác (chạm không xuyên): ${arenaLeaks.length} nút lọt (${arenaLeaks.slice(0, 3).join(", ")})`,
  );
  await clearSent();
  await evalJs("document.getElementById('aflee-coin').click(); 1");
  m = await sent();
  const fl = m.filter((x) => x.t === "ambushFlee");
  check(
    fl.length === 1 && Object.keys(fl[0].d).join() === "choice" && fl[0].d.choice === "flee_coin",
    `chọn Linh thạch: gửi MỘT ambushFlee chỉ có choice (${JSON.stringify(fl)})`,
  );
  a = await arena();
  check(
    a.anote === "Đang xử lý…" && a.coin.dis === "true" && a.exp.dis === "true",
    "đã gửi: 'Đang xử lý…', hai nút mờ",
  );
  await evalJs(
    "document.getElementById('aflee-coin').click(); document.getElementById('aflee-exp').click(); document.getElementById('aflee-cancel').click(); 1",
  );
  m = await sent();
  a = await arena();
  check(
    m.filter((x) => x.t === "ambushFlee").length === 1 && a.sheet,
    "bấm tiếp: không gửi hai lần; 'Ở lại đánh' không rút lại giữa chừng",
  );
  const toastsBefore = await evalJs("document.querySelectorAll('#toast p').length");
  await evalJs(
    `window.__ui.onAmbushEnd(${JSON.stringify({ result: "fled", paid: { coin: 70 } })}); 1`,
  );
  await sleep(150);
  a = await arena();
  check(!a.hud && !a.sheet && !a.inArena && !a.captured, "ambushEnd đóng HUD + bảng, nhả bàn phím");
  check(
    a.result &&
      a.rTitle === "Bỏ chạy thành công" &&
      a.rLines.join("|") === "Mất 70 Linh thạch." &&
      a.rCls.includes("info"),
    `thẻ kết quả nói đúng cái giá ('${a.rTitle}' / '${a.rLines.join("|")}')`,
  );
  const toastsAfter = await evalJs("document.querySelectorAll('#toast p').length");
  check(toastsAfter === toastsBefore, "ở đấu trường dùng thẻ kết quả, không thêm toast trùng");
  await evalJs(
    `window.__ui.onAmbushState(${AST()}); window.__ui.onAmbushEnd(${JSON.stringify({ result: "won", rewards: { exp: 360, coin: 48, items: [] } })}); 1`,
  );
  a = await arena();
  check(
    a.result &&
      a.rTitle === "Chiến thắng" &&
      a.rLines.includes("+360 tu vi") &&
      a.rLines.includes("+48 Linh thạch") &&
      a.rCls.includes("good"),
    `thắng: thẻ liệt kê thưởng ('${a.rLines.join("|")}')`,
  );
  await evalJs("window.__ui.hideAmbush(); 1");
  a = await arena();
  check(!a.result && !a.hud, "hideAmbush (đổi phòng bởi travelTo) gỡ cả thẻ kết quả và HUD");
  // MỤC 53: VẬN bỏ chạy 1 giây (ambushState.fleeMs): bảng xác nhận đóng để thấy trận, thanh vận đầy dần, nút Bỏ chạy mờ (không bấm lại), chữ 'Đang thoát…'
  await evalJs(
    `window.__ui.onAmbushState(${AST()}); document.getElementById('ahud-flee').click(); 1`,
  );
  await sleep(120);
  a = await arena();
  check(a.sheet && !a.fleeBar, "(mồi) bảng xác nhận đang mở, chưa có thanh vận");
  await evalJs(`window.__ui.onAmbushState(${AST({ fleeMs: 1000 })}); 1`);
  await sleep(250);
  a = await arena();
  check(
    !a.sheet && a.hud && a.fleeBar && /^Đang thoát…/.test(a.note) && a.fleeDis === "true",
    `có fleeMs: bảng xác nhận đóng, HUD còn, thanh vận hiện, nút Bỏ chạy mờ ('${a.note}')`,
  );
  const w1 = parseFloat(a.fleeFill);
  await shot("chan-duong-dang-thoat");
  await sleep(500);
  a = await arena();
  check(parseFloat(a.fleeFill) > w1, `thanh vận ĐẦY DẦN theo thời gian (${w1}% -> ${a.fleeFill})`);
  await clearSent();
  await evalJs("document.getElementById('ahud-flee').click(); 1");
  m = await sent();
  a = await arena();
  check(!a.sheet && m.length === 0, "đang vận: bấm lại Bỏ chạy không mở xác nhận, không gửi gì");
  await evalJs(`window.__ui.onAmbushState(${AST()}); 1`);
  a = await arena();
  check(
    !a.fleeBar && a.fleeDis === "false" && a.note === "",
    "tin kế tiếp vắng fleeMs (vận huỷ): thanh vận ẩn, nút Bỏ chạy mở lại",
  );
  // MỤC 53: CHẾT THẬT: thẻ 'Ngươi đã gục', KHÔNG dòng 'Mất ...', KHÔNG câu 'không mất kiếp', không thêm toast
  const toastsDie = await evalJs("document.querySelectorAll('#toast p').length");
  await evalJs(
    `window.__ui.onAmbushState(${AST()}); window.__ui.onAmbushEnd(${JSON.stringify({ result: "lost", died: true })}); 1`,
  );
  await sleep(150);
  a = await arena();
  check(
    a.result &&
      !a.hud &&
      a.rTitle === "Ngươi đã gục" &&
      a.rLines.join("|") === "Hoàng Tuyền đang chờ ngươi." &&
      a.rCls.includes("bad"),
    `chết thật: thẻ 'Ngươi đã gục' + 'Hoàng Tuyền đang chờ ngươi.' ('${a.rTitle}' / '${a.rLines.join("|")}')`,
  );
  check(
    !/Mất |không mất kiếp/i.test(a.rTitle + " " + a.rLines.join(" ")),
    "chết thật: KHÔNG in giá và KHÔNG còn câu 'không mất kiếp'",
  );
  check(
    (await evalJs("document.querySelectorAll('#toast p').length")) === toastsDie,
    "chết thật ở đấu trường: dùng thẻ, không thêm toast trùng",
  );
  await evalJs("window.__ui.hideAmbush(); 1");
  // MỤC 53: nhãn NGUY HIỂM ở hộp thoại: tinh anh + cầm đầu có, thường không; chữ >= 14 px và không chỉ bằng màu
  for (const [tier, want] of [
    ["normal", false],
    ["elite", true],
    ["leader", true],
  ]) {
    await evalJs(
      `window.__ui.hideAmbush(); window.__ui.onAmbushOffer(${sample({ foe: { name: "Sói Hoang", tier, count: 1 } })}); 1`,
    );
    await sleep(150);
    s = await state();
    check(
      s.danger === want && (!want || s.dangerText === "NGUY HIỂM"),
      `mức ${tier}: nhãn NGUY HIỂM ${want ? "HIỆN" : "ẨN"} ('${s.danger ? s.dangerText : ""}')`,
    );
    if (tier === "leader") await shot("chan-duong-nguy-hiem");
  }
  await evalJs("window.__ui.hideAmbush(); 1");
  // không đủ / thanh tu vi trống / hết giờ cục bộ
  await evalJs(
    `window.__ui.onAmbushState(${AST({ price: { exp: 0, coin: { price: 90, enough: false } } })}); document.getElementById('ahud-flee').click(); 1`,
  );
  await sleep(550);
  a = await arena();
  check(
    a.coin.dis === "true" &&
      a.coin.sub === "90 Linh thạch (không đủ)" &&
      a.exp.dis === "true" &&
      a.exp.sub === "Thanh tu vi trống",
    `không đủ / tu vi trống: cả hai nút mờ, không 'miễn phí' ('${a.coin.sub}' / '${a.exp.sub}')`,
  );
  await clearSent();
  await evalJs(
    "document.getElementById('aflee-coin').click(); document.getElementById('aflee-exp').click(); 1",
  );
  m = await sent();
  check(m.filter((x) => x.t === "ambushFlee").length === 0, "bấm hai nút mờ: không gửi gì");
  await evalJs("document.getElementById('aflee-cancel').click(); window.__ui.hideAmbush(); 1");
  await evalJs(`window.__ui.onAmbushState(${AST({ msLeft: 14_000 })}); 1`);
  a = await arena();
  check(a.urgent, "còn dưới 15 giây: đồng hồ báo gấp");
  await evalJs(`window.__ui.hideAmbush(); window.__ui.onAmbushState(${AST({ msLeft: 800 })}); 1`);
  await sleep(1300);
  a = await arena();
  check(
    a.hud && a.clock === "Chờ…" && a.note === "Đang chờ máy chủ…",
    `hết đồng hồ cục bộ: vẫn hiện, 'Đang chờ máy chủ…' ('${a.clock}' / '${a.note}')`,
  );
  for (const bad of [
    null,
    5,
    "x",
    {},
    { msLeft: "5", price: {} },
    JSON.parse(AST({ msLeft: NaN })),
  ]) {
    await evalJs(`window.__ui.hideAmbush(); window.__ui.onAmbushState(${JSON.stringify(bad)}); 1`);
  }
  a = await arena();
  check(!a.hud, "ambushState sai dạng không mở HUD");
  await evalJs(`window.__ui.hideAmbush(); window.__ui.onAmbushState(${AST()}); 1`);
  await evalJs("window.__ui.showReconnectNotice('Mất kết nối, đang nối lại...'); 1");
  await sleep(300);
  a = await arena();
  check(
    a.hud && a.clock === "Tạm dừng" && a.fleeDis === "true",
    `đang nối lại: HUD còn, đồng hồ 'Tạm dừng', nút Bỏ chạy mờ ('${a.clock}')`,
  );
  await evalJs("window.__ui.hideReconnectNotice(); window.__ui.hideAmbush(); 1");

  console.log("--- ĐẤU TRƯỜNG ở 5 khung: HUD và bảng xác nhận ---");
  for (const f of [
    { name: "mobile-sm", w: 360, h: 640, mobile: true },
    { name: "mobile-l", w: 844, h: 390, mobile: true },
    { name: "mobile-p", w: 390, h: 844, mobile: true },
    { name: "tablet-p", w: 768, h: 1024, mobile: true },
    { name: "desktop-hd", w: 1280, h: 720, mobile: false },
  ]) {
    await open(f.w, f.h, f.mobile);
    await evalJs(
      `window.__ui.onAmbushState(${AST({ price: { exp: 123456, coin: { price: 12345, enough: true } } })}); 1`,
    );
    await sleep(500);
    const H = await J(`(() => {
      const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const q = (id) => document.getElementById(id);
      const over = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const hud = R(q('ambush-hud')), fl = R(q('ahud-flee'));
      const others = ['minimap-wrap', 'hud'].map((id) => q(id)).filter(Boolean).filter((e) => e.getClientRects().length > 0).map((e) => [e.id, R(e)]);
      return { vw: innerWidth, vh: innerHeight, hud, fl, sw: document.documentElement.scrollWidth, overlaps: others.filter(([, r]) => over(hud, r)).map(([id]) => id) };
    })()`);
    check(
      H.hud.l >= 0 && H.hud.r <= H.vw + 0.5 && H.hud.t >= 0 && H.hud.b <= H.vh,
      `${f.name} ${f.w}x${f.h}: HUD đấu trường nằm trong màn hình`,
    );
    check(
      H.fl.w >= 44 && H.fl.h >= 44,
      `${f.name}: nút Bỏ chạy >= 44 px (${Math.round(H.fl.w)}x${Math.round(H.fl.h)})`,
    );
    check(
      H.overlaps.length === 0,
      `${f.name}: HUD không đè khung nhân vật / bản đồ nhỏ (${H.overlaps.join(",") || "không"})`,
    );
    check(H.sw <= H.vw, `${f.name}: không tràn ngang (${H.sw}/${H.vw})`);
    await evalJs("document.getElementById('ahud-flee').click(); 1");
    await sleep(600);
    const S = await J(`(() => {
      const box = document.querySelector('#ambush-flee-modal .ambush-box'); const b = box.getBoundingClientRect();
      const r = (id) => { const x = document.getElementById(id).getBoundingClientRect(); return { w: x.width, h: x.height, t: x.top, b: x.bottom, l: x.left, r: x.right }; };
      return { vw: innerWidth, vh: innerHeight, box: { l: b.left, t: b.top, r: b.right, b: b.bottom, sh: box.scrollHeight, ch: box.clientHeight }, coin: r('aflee-coin'), exp: r('aflee-exp'), stay: r('aflee-cancel') };
    })()`);
    check(
      S.box.l >= 0 && S.box.r <= S.vw + 0.5 && S.box.t >= 0 && S.box.b <= S.vh + 0.5,
      `${f.name}: bảng xác nhận nằm trong màn hình`,
    );
    check(
      S.box.sh <= S.box.ch + 1,
      `${f.name}: bảng xác nhận không phải cuộn (${S.box.sh}/${S.box.ch})`,
    );
    const small = [S.coin, S.exp, S.stay].filter((b) => b.w < 44 || b.h < 44);
    check(small.length === 0, `${f.name}: ba nút của bảng >= 44 px`);
    check(
      S.coin.r <= S.exp.l - 6,
      `${f.name}: hai nút giá cách nhau ${Math.round(S.exp.l - S.coin.r)} px`,
    );
    await shot(`chan-duong-dau-truong-${f.name}`);
    await evalJs("window.__ui.hideAmbush(); 1");
  }

  console.log(
    "--- ĐƯỜNG DÂY THẬT: ?ambush=mock (máy chủ giả -> reg của WorldScene -> giao diện -> sendAmbush -> máy chủ giả) ---",
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${BASE_URL}/?ambush=mock&debug=1` });
  for (let k = 0; k < 60; k++) {
    await sleep(300);
    if (
      await evalJs(
        "Boolean(window.__scene && window.__scene.me && window.__scene.me() && window.__ambushMock)",
      )
    )
      break;
  }
  await evalJs(`(() => { const sc = window.__scene; window.__sent = [];
    const orig = sc.room.send.bind(sc.room);
    sc.room.send = (t, d) => { if (/^ambush/.test(t)) window.__sent.push({ t, d }); return orig(t, d); };
    return 1; })()`);
  // chờ lời đề nghị đầu tiên tự tới (máy chủ giả bắt đầu sau ~0,6 giây) bằng ĐÚNG tin ambushOffer qua reg
  let mockState = await arena();
  for (let k = 0; k < 40 && !(await state()).open; k++) await sleep(250);
  s = await state();
  check(
    s.open && s.inAmbush && /^Sói Hoang/.test(s.foe),
    `lời đề nghị đến bằng tin ambushOffer qua reg: hộp thoại tự mở ('${s.foe}')`,
  );
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushSeen").length >= 1,
    "giao diện tự gửi ambushSeen qua sendAmbush tới máy chủ giả",
  );
  await sleep(ARM_WAIT);
  await clearSent();
  await evalJs("document.getElementById('ambush-fight').click(); 1");
  await sleep(200);
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushChoose" && x.d.choice === "fight").length === 1,
    "bấm Chiến: gửi ambushChoose { fight } tới máy chủ giả",
  );
  s = await state();
  mockState = await arena();
  check(
    !s.open && mockState.hud && mockState.inArena,
    "máy chủ giả 'đổi phòng': hộp thoại đóng (hideAmbush), HUD đấu trường hiện bằng tin ambushState qua reg",
  );
  await sleep(2200);
  const c1 = (await arena()).clock;
  await sleep(2200);
  const c2 = (await arena()).clock;
  check(c1 !== c2, `đồng hồ HUD chạy theo ambushState mỗi giây ('${c1}' -> '${c2}')`);
  await evalJs("document.getElementById('ahud-flee').click(); 1");
  await sleep(500);
  mockState = await arena();
  check(
    mockState.sheet && mockState.coin.sub === "120 Linh thạch" && mockState.exp.sub === "840 tu vi",
    `bảng xác nhận hiện GIÁ GIỮA TRẬN của máy chủ giả ('${mockState.coin.sub}' / '${mockState.exp.sub}', gấp đôi giá hộp thoại)`,
  );
  await clearSent();
  await evalJs("document.getElementById('aflee-coin').click(); 1");
  await sleep(300);
  m = await sent();
  check(
    m.filter((x) => x.t === "ambushFlee").length === 1 &&
      m.find((x) => x.t === "ambushFlee").d.choice === "flee_coin",
    "chọn Linh thạch: gửi ambushFlee { flee_coin } qua sendAmbush",
  );
  mockState = await arena();
  check(
    mockState.hud &&
      !mockState.result &&
      !mockState.sheet &&
      mockState.fleeBar &&
      /^Đang thoát…/.test(mockState.note),
    `MỤC 53: máy chủ giả VẬN 1 giây (ambushState.fleeMs qua reg): HUD còn, chưa kết thúc, thanh vận hiện ('${mockState.note}')`,
  );
  await sleep(1100);
  mockState = await arena();
  check(
    !mockState.hud &&
      !mockState.sheet &&
      mockState.result &&
      mockState.rTitle === "Bỏ chạy thành công" &&
      mockState.rLines.join("|") === "Mất 120 Linh thạch.",
    `ambushEnd qua reg: thẻ kết quả đúng giá giữa trận ('${mockState.rTitle}' / '${mockState.rLines.join("|")}')`,
  );
  await sleep(6500);
  s = await state();
  check(s.open, "sau kết cục máy chủ giả đề nghị LẠI: hộp thoại mới tự mở (luồng lặp được)");
  await evalJs("window.__ambushMock.stop(); window.__ui.hideAmbush(); 1");

  console.log(
    "--- ĐƯỜNG DÂY THẬT, CHẾT THẬT (mục 53): ?ambush=mock&die=1 (hết trận = bị hạ: ambushEnd lost + died, rồi màn Hoàng Tuyền) ---",
  );
  await send("Page.navigate", { url: `${BASE_URL}/?ambush=mock&die=1&debug=1` });
  for (let k = 0; k < 60; k++) {
    await sleep(300);
    if (
      await evalJs(
        "Boolean(window.__scene && window.__scene.me && window.__scene.me() && window.__ambushMock)",
      )
    )
      break;
  }
  for (let k = 0; k < 40 && !(await state()).open; k++) await sleep(250);
  s = await state();
  check(s.open, "lời đề nghị đến (máy chủ giả, chế độ chết thật)");
  await sleep(ARM_WAIT);
  await evalJs("document.getElementById('ambush-fight').click(); 1");
  await sleep(1500);
  mockState = await arena();
  check(mockState.hud && !mockState.result, "đã vào đấu trường: HUD hiện, chưa có kết cục");
  // AMBUSH_MOCK_FIGHT_MS = 25 s: chờ tới lúc máy chủ giả cho bị hạ
  for (let k = 0; k < 40 && !(await arena()).result; k++) await sleep(1000);
  mockState = await arena();
  check(
    !mockState.hud &&
      mockState.result &&
      mockState.rTitle === "Ngươi đã gục" &&
      mockState.rCls.includes("bad") &&
      !/Mất |không mất kiếp/i.test(mockState.rTitle + " " + mockState.rLines.join(" ")),
    `bị hạ: thẻ 'Ngươi đã gục' qua reg, không in giá, không 'không mất kiếp' ('${mockState.rTitle}')`,
  );
  check(
    await evalJs("window.__ui.isLimboOpen()"),
    "ngay sau ambushEnd died: MÀN HOÀNG TUYỀN hiện (tin limbo của máy chủ giả)",
  );
  await sleep(600);
  await shot("chan-duong-chet-that");
  await evalJs("window.__ambushMock.stop(); window.__ui.hideAmbush(); 1");

  console.log("--- cảm ứng: cần điều khiển đang giữ lúc hộp thoại hiện, kiểu dính đáy ---");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await open(390, 844, true);
  const coarse = await evalJs("matchMedia('(pointer: coarse)').matches");
  const touches = new Map();
  const dispatchTouch = (type) =>
    send("Input.dispatchTouchEvent", {
      type,
      touchPoints: [...touches].map(([id, p]) => ({ id, x: p.x, y: p.y })),
    });
  // ngón 1 bắt đầu joystick nổi ở nửa trái, kéo sang phải; nửa phút sau mới có hộp thoại
  touches.set(1, { x: 90, y: 640 });
  await dispatchTouch("touchStart");
  touches.set(1, { x: 150, y: 640 });
  await dispatchTouch("touchMove");
  await sleep(350);
  const before = await J("window.__scene.moveDir()");
  check(
    before.dx > 0.2,
    `(mồi) cần điều khiển đang kéo thì nhân vật muốn đi (dx=${before.dx.toFixed(2)})`,
  );
  await clearSent();
  await offer();
  await sleep(500);
  const after = await J("window.__scene.moveDir()");
  check(
    after.dx === 0 && after.dy === 0,
    `hộp thoại mở: cần điều khiển đang giữ KHÔNG còn đẩy nhân vật (dx=${after.dx}, dy=${after.dy})`,
  );
  m = await sent();
  const joyMoves = m.filter((x) => x.t === "input" && (x.d.dx !== 0 || x.d.dy !== 0)).length;
  check(joyMoves === 0, `500 ms sau khi hộp thoại mở: không gửi input di chuyển (${joyMoves})`);
  await dispatchTouch("touchEnd");
  touches.clear();
  if (coarse) {
    const Lc = await layout();
    check(
      Lc.vh - Lc.box.b <= 24 && Lc.box.b <= Lc.vh + 0.5,
      `điện thoại dọc: hộp thoại dính đáy, dưới ngón cái (cách đáy ${Math.round(Lc.vh - Lc.box.b)} px)`,
    );
    const smallC = [Lc.fight, Lc.coin, Lc.exp].filter((b) => b.h < 44 || b.w < 44);
    check(smallC.length === 0, `điện thoại dọc (cảm ứng): ba nút >= 44 px (${smallC.length} nhỏ)`);
    await sleep(ARM_WAIT);
    const stc = await state();
    check(
      stc.fight.sub === "Đấu một mình" && stc.fight.dis === "false",
      `cảm ứng: nút Chiến KHÔNG ghi Enter ('${stc.fight.sub}'), đã hết khoá`,
    );
    await shot("chan-duong-cam-ung-dinh-day");
  } else {
    console.log("  (Chrome không báo pointer: coarse ở khung này: bỏ qua kiểm kiểu dính đáy)");
  }
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });

  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
} finally {
  const exited = new Promise((res) => chrome.once("exit", res));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  // Chrome có thể còn ghi vào thư mục hồ sơ lúc thoát (ENOTEMPTY): thử lại, thôi thì để /tmp dọn
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch {
    /* không quan trọng */
  }
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} KIỂM TRA THẤT BẠI`);
process.exit(failures === 0 ? 0 : 1);
