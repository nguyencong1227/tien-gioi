import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm KINH QUYỂN ở TÚI ĐỒ (M7.4 #505, `client/src/item-use.ts` + `ui.ts`) trong Chrome THẬT (`?skills=mock`, không cần máy chủ):
//  - chi tiết túi: quyển có nút "Học", đan dược "Dùng" (đổi qua lại không kẹt nhãn), nguyên liệu ẩn nút; 12 icon sách tải được;
//  - dòng "Dạy: <chiêu> · Đủ cảnh giới (..) / Cần .." ở khung chi tiết, đổi theo cảnh giới (Luyện Khí học được chiêu cơ bản, chiêu Trúc Cơ thì "Cần"); món khác ẩn khung;
//  - bấm nút Học, nhấp đúp ô và phím Enter trên ô (#463) đều gửi `useItem {slot}` cho quyển và đan dược, KHÔNG gửi cho nguyên liệu;
//  - 0 lỗi JS. Có thể chụp ảnh: `--shots <thư mục>`. Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-book-bag.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-book-bag-"));
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
    if (msg.method === "Runtime.exceptionThrown") {
      pageErrors++;
      console.log(
        "  [lỗi JS]",
        JSON.stringify(msg.params?.exceptionDetails?.exception?.description ?? "").slice(0, 300),
      );
    }
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
    if (r.result?.exceptionDetails)
      throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result?.result?.value;
  };
  const J = async (js) => JSON.parse(await evalJs(`JSON.stringify(${js})`));
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, "base64"));
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
  });

  // ---- tiện ích trong trang -----------------------------------------------------------------------------------
  const pointer = (sel, i = 0) =>
    evalJs(
      `document.querySelectorAll(${JSON.stringify(sel)})[${i}].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); 0`,
    );
  const setMe = async (o) => {
    await evalJs(`Object.assign(window.__scene.me(), ${JSON.stringify(o)}); 0`);
    await sleep(250);
  };
  const sentSince = async (action) => {
    await evalJs("window.__sent.length = 0; 0");
    await action();
    await sleep(80);
    return J("window.__sent.filter((s) => s[0] === 'useItem')");
  };
  const imageLoads = (id) =>
    evalJs(
      `new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = '/assets/items/${id}.png'; })`,
    );

  const BAG = [
    { itemId: "kinh_hoa_van_kiem", qty: 1 }, // Luyện Khí
    { itemId: "hoi_huyet_dan", qty: 2 },
    { itemId: "kinh_thanh_tung_phi_cham", qty: 3 }, // Trúc Cơ
    { itemId: "long_tho", qty: 1 }, // nguyên liệu
    { itemId: "kinh_me_tung_bo", qty: 1 }, // Trúc Cơ
  ];
  const BOOK_IDS = [
    "hoa_van_kiem",
    "bon_thach_quyen",
    "ung_trao",
    "trong_nhac_tram",
    "huyen_bang_chi",
    "kim_chung_trao",
    "bich_thuy_hoi_xuan",
    "phieu_phong_bo",
    "thanh_tung_phi_cham",
    "lac_tuyet_phan_phi",
    "cuu_cung_khon_sat",
    "me_tung_bo",
  ];
  const detail = () =>
    J(`({ name: document.getElementById('inv-item-name').textContent,
      useHidden: document.getElementById('inv-btn-use').hidden, useText: document.getElementById('inv-btn-use').textContent,
      cmpHidden: document.getElementById('inv-equip-cmp').hidden, cmp: document.getElementById('inv-equip-cmp').textContent,
      cmpCls: [...document.querySelectorAll('#inv-equip-cmp span')].map((s) => s.className).join(' ') })`);

  for (const [W, H] of [
    [1280, 720],
    [360, 640],
  ]) {
    console.log(`\n--- ${W}x${H} ---`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile: W < 700,
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
    await sleep(500);
    // ghi lại mọi tin gửi lên máy chủ giả
    await evalJs(
      `window.__sent = []; const r = window.__scene.room; const o = r.send.bind(r); r.send = (t, p) => { window.__sent.push([t, p]); return o(t, p); }; 0`,
    );

    let bad = [];
    for (const id of BOOK_IDS) if (!(await imageLoads(`kinh_${id}`))) bad.push(id);
    check(
      bad.length === 0,
      `12 icon sách tải được${bad.length ? ` (lỗi: ${bad.join(", ")})` : ""}`,
    );

    await setMe({ realm: 1, tier: 0 });
    await evalJs("window.__ui.toggleInventory(true); 0");
    await evalJs(`window.__ui.onInv({ slots: ${JSON.stringify(BAG)}, cd: {} }); 0`);
    await sleep(300);

    // ---- A. Luyện Khí: nút + dòng "Dạy" ---------------------------------------------------------------------
    const want = [
      { label: "Học", cmp: /^Dạy: Hỏa Vân Kiếm · Đủ cảnh giới \(Luyện Khí/, cls: "req-ok" },
      { label: "Dùng", cmp: null },
      { label: "Học", cmp: /^Dạy: Thanh Tùng Phi Châm · Cần Trúc Cơ/, cls: "req-warn" },
      { label: null, cmp: null },
      { label: "Học", cmp: /^Dạy: Mê Tung Bộ · Cần Trúc Cơ/, cls: "req-warn" },
    ];
    for (let i = 0; i < BAG.length; i++) {
      await pointer("#inv-grid .inv-slot", i);
      await sleep(120);
      const d = await detail();
      const w = want[i];
      check(
        w.label === null ? d.useHidden : !d.useHidden && d.useText === w.label,
        `${BAG[i].itemId}: nút ${w.label ?? "ẩn"} (có "${d.useHidden ? "ẩn" : d.useText}")`,
      );
      if (w.cmp) {
        check(
          !d.cmpHidden && w.cmp.test(d.cmp) && d.cmpCls === w.cls,
          `${BAG[i].itemId}: "${d.cmp}" (${d.cmpCls})`,
        );
      } else {
        check(d.cmpHidden, `${BAG[i].itemId}: khung "Dạy" ẩn`);
      }
      await shot(`book-bag-${W}-${i}`);
    }

    // ---- B. đổi cảnh giới: Trúc Cơ thì quyển Trúc Cơ hết "Cần" -----------------------------------------------
    await setMe({ realm: 2, tier: 0 });
    await pointer("#inv-grid .inv-slot", 2);
    await sleep(150);
    let d = await detail();
    check(
      /^Dạy: Thanh Tùng Phi Châm · Đủ cảnh giới \(Trúc Cơ/.test(d.cmp) && d.cmpCls === "req-ok",
      `Trúc Cơ: "${d.cmp}" (${d.cmpCls})`,
    );
    await setMe({ realm: 0, tier: 0 });
    await pointer("#inv-grid .inv-slot", 0);
    await sleep(150);
    d = await detail();
    check(
      /^Dạy: Hỏa Vân Kiếm · Cần Luyện Khí/.test(d.cmp) && d.cmpCls === "req-warn",
      `Phàm Nhân: "${d.cmp}" (${d.cmpCls})`,
    );
    // nút Học vẫn bấm được khi chưa đủ cảnh giới (máy chủ quyết định, báo lý do bằng thông báo)
    check(!d.useHidden, "Phàm Nhân vẫn thấy nút Học (máy chủ từ chối và báo lý do)");
    await setMe({ realm: 1, tier: 0 });

    // ---- C. gửi `useItem` đúng ô: nút, nhấp đúp, Enter ------------------------------------------------------
    await pointer("#inv-grid .inv-slot", 0);
    let sent = await sentSince(() =>
      evalJs(
        `document.getElementById('inv-btn-use').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); 0`,
      ),
    );
    check(
      sent.length === 1 && sent[0][1].slot === 0,
      `nút Học gửi useItem {slot 0}: ${JSON.stringify(sent)}`,
    );

    for (const [i, expectSend, what] of [
      [0, true, "quyển"],
      [1, true, "đan dược"],
      [3, false, "nguyên liệu"],
    ]) {
      sent = await sentSince(() =>
        evalJs(
          `document.querySelectorAll('#inv-grid .inv-slot')[${i}].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 0`,
        ),
      );
      check(
        expectSend ? sent.length === 1 && sent[0][1].slot === i : sent.length === 0,
        `nhấp đúp ô ${what} ${expectSend ? "gửi" : "KHÔNG gửi"} useItem: ${JSON.stringify(sent)}`,
      );
      sent = await sentSince(() =>
        evalJs(
          `document.querySelectorAll('#inv-grid .inv-slot')[${i}].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); 0`,
        ),
      );
      check(
        expectSend ? sent.length === 1 && sent[0][1].slot === i : sent.length === 0,
        `Enter trên ô ${what} ${expectSend ? "gửi" : "KHÔNG gửi"} useItem: ${JSON.stringify(sent)}`,
      );
    }
  }
  check(pageErrors === 0, `0 lỗi JS (có ${pageErrors})`);
} finally {
  try {
    chrome.kill();
  } catch {
    /* đã thoát */
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* bỏ qua */
  }
}
console.log(failures ? `\n${failures} KIỂM TRA ĐỎ` : "\nTẤT CẢ ĐẠT");
process.exit(failures ? 1 : 0);
