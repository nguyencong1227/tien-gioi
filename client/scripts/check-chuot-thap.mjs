import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm bộ giao diện của cửa sổ CHUỘT thấp (#676, A quyết ở issue): chuột + cạnh ngắn < 600 chỉ là điện thoại khi hẹp (< 900) HOẶC thấp hơn `DESKTOP_MIN_HEIGHT`. Script này:
//  (a) ĐO ở các khung thấp xem bố cục MÁY TÍNH còn dùng được không, để CHỌN mốc `DESKTOP_MIN_HEIGHT` bằng số đo chứ không đoán. Mỗi khung: HUD không tràn trang / không ra ngoài khung / không chồng
//      nhau (khung trái, nhiệm vụ, chat, bản đồ nhỏ, nút HUD, ô chiêu, nút Chém / Kiếm khí / Đả tọa / Đột phá, Nói, ô nhanh), nút HUD >= 44 px; rồi mở lần lượt túi, nhân vật, nhiệm vụ, công pháp,
//      bản đồ lớn, cài đặt, hộp thoại NPC, chỉ dẫn: bảng nằm trong khung, không tràn ngang, nút Đóng trong khung và >= 44 px, nút >= 44 px; bảng phải tự cuộn thì ghi chú (không tính lỗi: tấm dài tự cuộn là thiết kế);
//  (b) khẳng định phân loại (`data-form`) đúng quy tắc và KHÔNG có vấn đề bố cục ở mọi khung truyền vào.
// Con trỏ CHUỘT (cờ Chrome như check-skills-panel), `?skills=mock&n=4&realm=4`. Có thể chụp ảnh: `--shots <thư mục>`. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-chuot-thap.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots] [--measure] [--min-h <số>] [--ui-scale 1.15] [--frames '[[1280,577],[1366,625]]']
//   --measure: chỉ in số đo, không khẳng định (dùng để chọn `DESKTOP_MIN_HEIGHT`); --min-h: ghi đè `DESKTOP_MIN_HEIGHT` để kiểm `data-form` (mặc định: giá trị trong `client/src/gfx/display.ts`).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = argOf("--url", "http://127.0.0.1:5183");
const SHOTS = argOf("--shots", "");
const MEASURE = process.argv.includes("--measure");
// `DESKTOP_MIN_HEIGHT` đọc thẳng từ nguồn (một nơi duy nhất): chạy trần không cờ thì khẳng định theo mốc thật đang cài, không phải gõ `--min-h 500` (nit của A ở #682)
const SRC_MIN_H = Number(
  /DESKTOP_MIN_HEIGHT\s*=\s*(\d+)/.exec(
    fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/gfx/display.ts"),
      "utf8",
    ),
  )?.[1],
);
if (!Number.isFinite(SRC_MIN_H)) throw new Error("Không đọc được DESKTOP_MIN_HEIGHT từ display.ts");
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-chuot-thap-"));
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
  const J = async (js) => JSON.parse(await evalJs(`JSON.stringify(${js})`));
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    // `--ui-scale 1.15`: cỡ chữ "Lớn" (Cài đặt) làm nội dung cao thêm; mốc `DESKTOP_MIN_HEIGHT` phải đủ cho cả cỡ này
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.setItem('tg_ui_scale',${JSON.stringify(argOf("--ui-scale", "1"))});localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
  });

  // khung CHUỘT (không bật `mobile`): [rộng, cao]
  const FRAMES = JSON.parse(
    argOf(
      "--frames",
      JSON.stringify([
        [1280, 720],
        [1366, 768],
        [1280, 577],
        [1366, 625],
        [1280, 520],
        [1280, 500],
        [1280, 480],
        [1280, 450],
        [1280, 400],
        [900, 577],
        [899, 577],
        [767, 500],
      ]),
    ),
  );
  const PANELS = [
    [
      "inv-modal",
      // túi có đồ và ô đầu được chọn: chi tiết hiện đủ các nút Dùng / Vứt (túi rỗng ẩn chúng nên không lộ được chuyện bị cắt)
      `window.__ui.onInv({ slots: [{ itemId: 'hoi_huyet_dan', qty: 3 }, { itemId: 'thuong_hoi_linh_dan', qty: 2 }], cd: {} }); window.__ui.toggleInventory(true)`,
    ],
    ["char-modal", "window.__ui.toggleCharModal(true)"],
    ["quest-modal", "window.__ui.toggleQuestModal(true)"],
    ["skills-modal", "window.__ui.toggleSkillsModal(true)"],
    ["map-modal", "window.__ui.toggleMapModal(true)"],
    ["settings-modal", "window.__ui.toggleSettingsModal(true)"],
    [
      "dialog-modal",
      `window.__ui.onDialog({ npcId: 'truong_tran', lines: ['Người lạ mặt, ngươi mới tới Lạc Hà Trấn sao?', 'Muốn bước lên con đường tu tiên thì trước hết phải biết giữ mạng.'], options: [{ label: 'Nhận nhiệm vụ: Nhập thế', action: { kind: 'accept', questId: 'nhap_the' } }, { label: 'Rời đi', action: { kind: 'close' } }] })`,
    ],
    ["newbie-guide-modal", "window.__ui.showNewbieGuide(true)"],
  ];
  const HUD_SEL = [
    "#hud-col-left",
    "#quest-tracker",
    "#chat",
    "#minimap-wrap",
    "#hud-menu-items",
    "#skill-slots",
    "#sk-break",
    "#sk-med",
    "#sk-sword",
    "#sk-slash",
    "#btn-talk",
    "#quick-1",
    "#quick-2",
  ];
  /** Bảng KHÔNG được tự cuộn làm mất nút: nút (Dùng / Vứt, Đóng, Đã Hiểu, lựa chọn hộp thoại, nút bản đồ) nằm ngoài phần nhìn thấy của bảng là bị CẮT */
  const CUT_PANELS = ["inv-modal", "char-modal", "dialog-modal", "newbie-guide-modal", "map-modal"];
  const probeJs = (panelId) => `(() => {
    const vis = (e) => { if (!e || e.hidden) return false; const st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const out = { form: document.documentElement.dataset.form, input: document.documentElement.dataset.input, vw: innerWidth, vh: innerHeight, problems: [], scroll: 0 };
    const P = (m) => out.problems.push(m);
    const small = (e) => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; };
    if (!${JSON.stringify(panelId)}) {
      const de = document.documentElement;
      if (de.scrollWidth > innerWidth + 2) P('tràn ngang trang ' + de.scrollWidth + '/' + innerWidth);
      if (de.scrollHeight > innerHeight + 2) P('tràn dọc trang ' + de.scrollHeight + '/' + innerHeight);
      const els = ${JSON.stringify(HUD_SEL)}.map((s) => [s, document.querySelector(s)]).filter(([, e]) => vis(e));
      for (const [s, e] of els) { const r = e.getBoundingClientRect(); if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) P(s + ' ra ngoài khung (' + [r.left, r.top, r.right, r.bottom].map(Math.round) + ')'); }
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        if (els[i][1].contains(els[j][1]) || els[j][1].contains(els[i][1])) continue;
        const a = els[i][1].getBoundingClientRect(), b = els[j][1].getBoundingClientRect();
        const xo = Math.min(a.right, b.right) - Math.max(a.left, b.left), yo = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (xo > 4 && yo > 4) P(els[i][0] + ' chồng ' + els[j][0] + ' (' + Math.round(xo) + 'x' + Math.round(yo) + ')');
      }
      const sm = [...document.querySelectorAll('#sk-break, #sk-med, #sk-sword, #sk-slash, #btn-talk, #quick-1, #quick-2, #skill-slots .sk.slot')].filter(vis).filter(small);
      if (sm.length) P(sm.length + ' nút HUD < 44 px: ' + sm.slice(0, 4).map((b) => b.id || b.className).join(','));
      return out;
    }
    const m = document.getElementById(${JSON.stringify(panelId)});
    if (!vis(m)) { P('bảng không hiện'); return out; }
    const r = m.getBoundingClientRect();
    if (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1) P('bảng ra ngoài khung ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
    out.scroll = m.scrollHeight - m.clientHeight;
    if (m.scrollWidth > m.clientWidth + 1) P('bảng tràn ngang ' + m.scrollWidth + '/' + m.clientWidth);
    const closeBtn = m.querySelector('.modal-close');
    if (closeBtn && vis(closeBtn)) {
      const cr = closeBtn.getBoundingClientRect();
      if (cr.bottom > innerHeight + 1 || cr.top < -1 || cr.right > innerWidth + 1) P('nút Đóng ngoài khung ' + [cr.left, cr.top, cr.right, cr.bottom].map(Math.round));
      if (small(closeBtn)) P('nút Đóng < 44 px ' + Math.round(cr.width) + 'x' + Math.round(cr.height));
    }
    if (${JSON.stringify(CUT_PANELS)}.includes(${JSON.stringify(panelId)})) {
      const cut = [...m.querySelectorAll('button')].filter(vis).filter((b) => { const br = b.getBoundingClientRect(); return br.bottom > r.bottom + 1 || br.top < r.top - 1; });
      if (cut.length) P(cut.length + ' nút bị cắt (nằm ngoài phần nhìn thấy của bảng): ' + cut.slice(0, 3).map((b) => (b.id || b.className || b.textContent).toString().slice(0, 20)).join(' | '));
    }
    // nút >= 44 px (trừ ô chọn nhỏ có nhãn bao quanh và nhãn số phím của hộp thoại)
    const smallB = [...m.querySelectorAll('button')].filter(vis).filter((b) => small(b) && !b.classList.contains('opt-key'));
    if (smallB.length) P(smallB.length + ' nút < 44 px: ' + smallB.slice(0, 3).map((b) => (b.id || b.className || b.textContent).toString().slice(0, 24)).join(' | '));
    return out;
  })()`;
  const results = [];
  for (const [w, h] of FRAMES) {
    console.log(`\n--- chuột ${w}x${h} ---`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=4&realm=4&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__ui && window.__scene && window.__scene.me && window.__scene.me())",
        )
      )
        break;
    }
    await sleep(1200);
    const hud = await J(probeJs(null));
    const row = { w, h, form: hud.form, hud: hud.problems, panels: {} };
    console.log(
      `  data-form=${hud.form} data-input=${hud.input}  HUD: ${hud.problems.length === 0 ? "ổn" : hud.problems.join(" ; ")}`,
    );
    if (SHOTS) {
      const png = await send("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, `chuot-${w}x${h}-hud.png`),
        Buffer.from(png.result.data, "base64"),
      );
    }
    for (const [id, open] of PANELS) {
      await evalJs(`${open}; 0`);
      await sleep(350);
      const p = await J(probeJs(id));
      row.panels[id] = p.problems;
      console.log(
        `  ${id.padEnd(20)} ${p.problems.length === 0 ? "ổn" : p.problems.join(" ; ")}${p.scroll > 1 ? `  [tự cuộn +${p.scroll}px]` : ""}`,
      );
      if (SHOTS && ["inv-modal", "skills-modal", "map-modal"].includes(id)) {
        const png = await send("Page.captureScreenshot", { format: "png" });
        fs.mkdirSync(SHOTS, { recursive: true });
        fs.writeFileSync(
          path.join(SHOTS, `chuot-${w}x${h}-${id}.png`),
          Buffer.from(png.result.data, "base64"),
        );
      }
      await evalJs("window.__ui.closeAllModals(); 0");
      await sleep(150);
    }
    results.push(row);
  }
  const badOf = (r) => [
    ...r.hud,
    ...Object.entries(r.panels).flatMap(([k, v]) => v.map((x) => `${k}: ${x}`)),
  ];
  console.log("\n=== TỔNG KẾT ===");
  for (const r of results)
    console.log(
      `${r.w}x${r.h}  form=${r.form}  ${badOf(r).length === 0 ? "KHÔNG vấn đề" : badOf(r).length + " vấn đề"}`,
    );
  if (!MEASURE) {
    const minH = Number(argOf("--min-h", String(SRC_MIN_H)));
    console.log(`\n--- khẳng định (DESKTOP_MIN_HEIGHT = ${minH}) ---`);
    for (const r of results) {
      const want = r.w >= 900 && r.h >= minH ? "desktop" : "phone";
      check(r.form === want, `${r.w}x${r.h} chuột -> data-form=${r.form} (mong đợi ${want})`);
      // Bố cục chỉ khẳng định ở khung được xếp MÁY TÍNH (đó là điều #676 mới cho phép): khung còn xếp ĐIỆN THOẠI giữ nguyên hành vi cũ (tấm tự cuộn, nút Đóng cố định),
      // nên "nút nằm ngoài phần nhìn thấy" ở đó là thiết kế của bộ điện thoại, không phải lỗi
      if (want === "desktop") {
        const bad = badOf(r);
        check(
          bad.length === 0,
          `${r.w}x${r.h} bố cục máy tính không vấn đề${bad.length ? `: ${bad.slice(0, 3).join(" ; ")}` : ""}`,
        );
      }
    }
    check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  }
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
