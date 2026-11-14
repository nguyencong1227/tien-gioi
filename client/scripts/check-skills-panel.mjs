import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm bảng CÔNG PHÁP (M7.6, #507, docs/THIET_KE_THANH_CHIEU.md mục 4) trong Chrome THẬT qua CDP, chế độ `?skills=mock&n=2` (Trúc Cơ: ô 2, 3 mở; ô 4, 5 khoá), KHÔNG cần
// máy chủ: Shift+K / nút HUD mở, Esc đóng và trả focus; phím thế giới (L U I O) không chạy khi bảng mở; danh sách chiêu ĐÃ học với số thật (sát thương, linh lực, hồi chiêu),
// "Đang ở ô N"; gắn ô bằng Enter -> đúng một tin `skillSlot` và bảng + thanh chiêu cập nhật theo `skills` của máy chủ giả; ô khoá chỉ báo, không gửi; Delete gỡ;
// mũi tên đi giữa các ô / các hàng; ca chưa học chiêu nào; cảnh giới đổi lúc đang mở; mục bấm >= 44 px, không tràn ngang ở 360x640. Có thể chụp ảnh: `--shots <thư mục>`.
// Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-skills-panel.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-skills-panel-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    // Chrome không đầu không có chuột: `pointer: fine` = false thì thanh chiêu (CSS chỉ cho máy tính) bị ẩn; giả lập chuột (4 = fine, 2 = hover)
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

  const open = async (query, w, h) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?${query}&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())"))
        break;
    }
    await sleep(1000);
    await evalJs(`(() => { const sc = window.__scene; window.__sent = [];
      const orig = sc.room.send.bind(sc.room);
      sc.room.send = (t, d) => { if (t === "cast" || t === "skillSlot") window.__sent.push({ t, d }); return orig(t, d); };
      return 1; })()`);
  };
  const KEY = {
    Escape: { code: "Escape", key: "Escape", vk: 27 },
    Enter: { code: "Enter", key: "Enter", vk: 13 },
    Delete: { code: "Delete", key: "Delete", vk: 46 },
    ArrowRight: { code: "ArrowRight", key: "ArrowRight", vk: 39 },
    ArrowDown: { code: "ArrowDown", key: "ArrowDown", vk: 40 },
    K: { code: "KeyK", key: "K", vk: 75 },
    L: { code: "KeyL", key: "l", vk: 76 },
  };
  const press = async (name, modifiers = 0) => {
    const k = KEY[name];
    const base = {
      code: k.code,
      key: k.key,
      windowsVirtualKeyCode: k.vk,
      nativeVirtualKeyCode: k.vk,
      modifiers,
    };
    // Enter: `keyDown` kèm `text` sinh sự kiện `char` nên nút được kích hoạt như bàn phím thật (rawKeyDown thì không)
    if (name === "Enter")
      await send("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", ...base });
    else await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(150);
  };
  const SHIFT = 8;
  const state = () =>
    J(`(() => {
      const m = document.getElementById('skills-modal');
      const rows = [...document.querySelectorAll('#skills-list .sk-row')].map((r) => ({
        id: r.dataset.skill, name: r.querySelector('.sk-row-name').textContent, pips: r.querySelector('.sk-row-pips').textContent,
        badge: r.querySelector('.sk-row-badge:not(.need)')?.textContent ?? '', need: r.querySelector('.sk-row-badge.need')?.textContent ?? '',
        stats: [...r.querySelectorAll('.sk-row-stats li')].map((l) => l.textContent),
        slots: [...r.querySelectorAll('.sk-slot-btn:not(.unequip)')].map((b) => ({ slot: b.dataset.nav.split(':')[2], here: b.classList.contains('here'), locked: b.classList.contains('locked'), pressed: b.getAttribute('aria-pressed'), aria: b.getAttribute('aria-label') })),
        unequip: r.querySelector('.sk-slot-btn.unequip')?.getAttribute('aria-label') ?? '' }));
      return { open: !m.hidden, expanded: document.getElementById('btn-skills').getAttribute('aria-expanded'), count: document.getElementById('skills-count').textContent,
        emptyHidden: document.getElementById('skills-empty').hidden, emptyText: document.getElementById('skills-empty').textContent,
        focus: document.activeElement && document.activeElement.dataset ? (document.activeElement.dataset.nav || document.activeElement.id || '') : '', rows };
    })()`);
  const sent = () => J("window.__sent");
  const clearSent = () => evalJs("window.__sent.length = 0; 1");
  const focusNav = (nav) => evalJs(`document.querySelector('[data-nav="${nav}"]').focus(); 1`);
  const toastText = () => evalJs("document.getElementById('toast').textContent");
  const barSlot = (n) =>
    J(
      `({ cls: document.getElementById('sk-slot${n}').className, label: document.getElementById('sk-slot${n}').getAttribute('aria-label') })`,
    );
  const shot = async (name) => {
    if (!SHOTS) return;
    const png = await send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(png.result.data, "base64"));
  };

  console.log("--- 1280x720, Trúc Cơ, 2 chiêu gắn (ô 2, 3), học 5 chiêu ---");
  await open("skills=mock&n=2", 1280, 720);
  await sleep(3300); // hết hồi chiêu giả của ô 2
  let st = await state();
  check(!st.open && st.expanded === "false", "ban đầu bảng đóng");
  await press("K", SHIFT);
  st = await state();
  check(st.open && st.expanded === "true", "Shift+K mở bảng (nút HUD aria-expanded=true)");
  check(
    st.count === "5 chiêu đã học" && st.rows.length === 5,
    `5 chiêu đã học: ${st.rows.map((r) => r.id).join(", ")}`,
  );
  const hoa = st.rows.find((r) => r.id === "hoa_van_kiem");
  check(
    hoa &&
      hoa.badge === "Đang ở ô 2" &&
      hoa.stats.some((l) => /^Sát thương: 1,6 lần công$/.test(l)) &&
      hoa.stats.some((l) => /^Linh lực: 96 \(8% tối đa\)$/.test(l)),
    `Hỏa Vân Kiếm: ${hoa && hoa.badge} | ${hoa && hoa.stats.join(" | ")}`,
  );
  check(st.rows.filter((r) => r.badge).length === 2, "chỉ hai chiêu có huy hiệu 'Đang ở ô N'");
  check(
    hoa.slots.map((s) => s.locked).join() === "false,false,true,true",
    `ô 4, 5 khoá ở Trúc Cơ: ${hoa.slots.map((s) => s.locked).join()}`,
  );
  await shot("cong-phap-1280x720");

  console.log("--- phím thế giới không chạy khi bảng mở; Esc đóng và trả focus ---");
  await clearSent();
  await press("L");
  check((await sent()).length === 0, "L (ô chiêu 2) khi bảng mở: KHÔNG gửi cast");
  await press("Escape");
  st = await state();
  check(!st.open, "Esc đóng bảng");
  // mở bằng PHÍM thì nút HUD không phải người mở: focus rời bảng về màn chơi (a11y.ts returnFocus: canvas không nhận focus thì về body), KHÔNG nhảy vào nút HUD
  const outside = await J(
    "({ inModal: document.getElementById('skills-modal').contains(document.activeElement), btn: document.activeElement && document.activeElement.id === 'btn-skills' })",
  );
  check(
    !outside.inModal && !outside.btn,
    `mở bằng Shift+K rồi Esc: focus rời bảng, không nhảy vào nút HUD (${JSON.stringify(outside)})`,
  );
  // mở bằng nút (focus nút + Enter) thì Esc trả focus về chính nút
  await evalJs("document.getElementById('btn-skills').focus(); 1");
  await press("Enter");
  check((await state()).open, "focus nút Công pháp + Enter cũng mở bảng");
  await press("Escape");
  const back = await evalJs("document.activeElement && document.activeElement.id");
  check(
    back === "btn-skills" && !(await state()).open,
    `mở bằng nút rồi Esc: focus trả về nút Công pháp (${back})`,
  );
  await press("K", SHIFT);
  check((await state()).open, "Shift+K mở lại");

  console.log(
    "--- gắn ô bằng bàn phím: Enter -> một tin skillSlot, bảng + thanh chiêu cập nhật ---",
  );
  await clearSent();
  await focusNav("skillslot:ung_trao:3");
  await press("Enter");
  let s = await sent();
  check(
    s.length === 1 && s[0].t === "skillSlot" && s[0].d.slot === 3 && s[0].d.skillId === "ung_trao",
    `tin gửi: ${JSON.stringify(s)}`,
  );
  await sleep(200);
  st = await state();
  const ung = st.rows.find((r) => r.id === "ung_trao");
  const bon = st.rows.find((r) => r.id === "bon_thach_quyen");
  check(
    ung.badge === "Đang ở ô 3" && !bon.badge,
    `ung_trao ở ô 3, bon_thach_quyen bị thay (huy hiệu: "${ung.badge}" / "${bon.badge}")`,
  );
  check(
    /ung_trao|Ưng/.test((await barSlot(3)).label),
    `thanh chiêu ô 3 đổi: ${(await barSlot(3)).label}`,
  );
  check(st.focus === "skillslot:ung_trao:3", `giữ focus sau khi vẽ lại (${st.focus})`);

  console.log("--- mũi tên đi giữa các ô / hàng ---");
  await focusNav("skillslot:ung_trao:3");
  await press("ArrowRight");
  check(
    (await state()).focus === "skillslot:ung_trao:4",
    `Phải: sang ô 4 cùng hàng (${(await state()).focus})`,
  );
  await press("ArrowDown");
  const f2 = (await state()).focus;
  check(
    f2.startsWith("skillslot:") && !f2.includes("ung_trao"),
    `Xuống: sang hàng chiêu kế (${f2})`,
  );

  console.log("--- ô khoá: chỉ báo lý do, KHÔNG gửi ---");
  await clearSent();
  await evalJs(`document.querySelector('[data-nav="skillslot:hoa_van_kiem:4"]').click(); 1`);
  await sleep(150);
  check(
    (await sent()).length === 0 && /chưa mở: Mở ở Kim Đan/.test(String(await toastText())),
    `toast: ${await toastText()}`,
  );
  check(
    (await state()).rows[0].slots[2].aria.includes("chưa mở"),
    "aria-label ô khoá nêu cảnh giới mở",
  );

  console.log("--- Delete gỡ chiêu khỏi ô ---");
  await clearSent();
  await focusNav("skillslot:ung_trao:3");
  await press("Delete");
  s = await sent();
  check(
    s.length === 1 && s[0].d.slot === 3 && s[0].d.skillId === "",
    `tin gỡ: ${JSON.stringify(s)}`,
  );
  await sleep(200);
  st = await state();
  check(!st.rows.find((r) => r.id === "ung_trao").badge, "ung_trao hết huy hiệu");
  check(
    /còn trống/.test((await barSlot(3)).label),
    `thanh chiêu ô 3 trống: ${(await barSlot(3)).label}`,
  );

  console.log("--- cảnh giới đổi lúc bảng đang mở: ô 4 mở ---");
  await evalJs("window.__scene.me().realm = 3; 1");
  await sleep(500);
  st = await state();
  check(
    st.rows[0].slots[2].locked === false && st.rows[0].slots[3].locked === true,
    "Kim Đan: ô 4 mở, ô 5 còn khoá (bảng dựng lại, không cần đóng / mở)",
  );
  await evalJs("window.__scene.me().realm = 2; 1");

  console.log("--- chưa học chiêu nào ---");
  await evalJs(
    `window.__scene.onSkills({ learned: {}, slots: ["", "", "", ""], cd: [0, 0, 0, 0], cdMax: [0, 0, 0, 0] }); 1`,
  );
  await sleep(250);
  st = await state();
  check(
    st.rows.length === 0 &&
      !st.emptyHidden &&
      /Túi đồ/.test(st.emptyText) &&
      st.count === "0 chiêu đã học",
    `rỗng: "${st.emptyText}"`,
  );
  await evalJs(`document.querySelector('[data-nav="skills:bag"]').click(); 1`);
  await sleep(250);
  const bag = await J(
    "({ skills: !document.getElementById('skills-modal').hidden, inv: !document.getElementById('inv-modal').hidden })",
  );
  check(!bag.skills && bag.inv, "'Mở Túi đồ' đóng bảng và mở túi");

  console.log("--- 360x640: mục bấm >= 44 px, không tràn ngang ---");
  await open("skills=mock&n=2", 360, 640);
  await sleep(300);
  await evalJs("document.getElementById('btn-skills').click(); 1");
  await sleep(300);
  const geo = await J(`(() => {
    const m = document.getElementById('skills-modal');
    const small = [...m.querySelectorAll('.sk-slot-btn')].filter((b) => b.getBoundingClientRect().height < 43.5 || b.getBoundingClientRect().width < 43.5).length;
    return { small, n: m.querySelectorAll('.sk-slot-btn').length, sw: m.scrollWidth, cw: m.clientWidth, ow: document.documentElement.scrollWidth, vw: innerWidth };
  })()`);
  check(geo.n > 0 && geo.small === 0, `${geo.n} nút, ${geo.small} nút nhỏ hơn 44 px`);
  check(
    geo.sw <= geo.cw + 1 && geo.ow <= geo.vw + 1,
    `không tràn ngang (bảng ${geo.sw}/${geo.cw}, trang ${geo.ow}/${geo.vw})`,
  );
  await shot("cong-phap-360x640");

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
