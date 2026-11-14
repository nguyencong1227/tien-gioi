import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm HUY HIỆU TRẠNG THÁI của chính mình (M7.7 bước 3a, #508) trong Chrome THẬT (`?skills=mock&status=...`, không cần máy chủ): phát tin `status` qua đúng đường tin
// nhắn của cảnh rồi đo DOM thật và hình học thật:
//  - rỗng thì hàng ẩn và KHÔNG chiếm chỗ (chiều cao #hud bằng lúc chưa có gì); có trạng thái thì đúng ô, đúng thứ tự (có hại trước), đúng chữ và nhãn đọc;
//  - số giây đếm lùi theo đồng hồ, hết hạn thì ô mất, hết cả thì hàng ẩn lại;
//  - gọi mỗi khung KHÔNG dựng lại DOM (số lần dựng chỉ tăng khi số giây đổi);
//  - không ô nào tràn ra ngoài khung HUD / màn hình, các ô không chồng nhau, khối nhiệm vụ bên dưới không bị đè (ở 1280x720 và 360x640);
//  - chữ >= 4,5:1 trên nền ô (màu tính thật từ CSS); sắp hết thì nhấp nháy, giảm chuyển động (OS) thì không.
// Có thể chụp ảnh: `--shots <thư mục>`. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-status-badges.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-status-badges-"));
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
  let scriptId = null;
  /** Mở trang với (rộng, cao), có / không giả lập `prefers-reduced-motion`, và `status` ban đầu */
  const open = async (w, h, { status = "", reduce = false } = {}) => {
    if (scriptId) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
    const r = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
    });
    scriptId = String(r.result?.identifier ?? "");
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: w < 700,
    });
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }],
    });
    await send("Page.navigate", {
      url: `${BASE_URL}/?skills=mock&n=2${status ? `&status=${status}` : ""}&debug=1`,
    });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__scene && window.__scene.me && window.__scene.me() && window.__mockStatus)",
        )
      )
        break;
    }
    await sleep(300);
  };
  const chips = () =>
    J(`[...document.querySelectorAll('#hud-status .st-badge')].map((c) => {
      const r = c.getBoundingClientRect();
      return { id: c.dataset.status, text: c.textContent, aria: c.getAttribute('aria-label'), role: c.getAttribute('role'), cls: c.className,
        l: r.left, t: r.top, r: r.right, b: r.bottom, anim: getComputedStyle(c).animationName };
    })`);
  const box = () =>
    J(`(() => { const s = document.getElementById('hud-status'); const h = document.getElementById('hud').getBoundingClientRect(); const rs = s.getBoundingClientRect();
      const q = document.getElementById('quest-tracker').getBoundingClientRect();
      return { hidden: s.hidden, display: getComputedStyle(s).display, hudH: h.height, hudL: h.left, hudR: h.right, hudB: h.bottom, sH: rs.height, qTop: q.top, vw: innerWidth }; })()`);

  for (const [W, H] of [
    [1280, 720],
    [360, 640],
  ]) {
    console.log(`\n--- ${W}x${H} ---`);
    // Đo chiều cao HUD lúc CHƯA có trạng thái
    await open(W, H);
    const base = await box();
    check(
      base.hidden && base.display === "none" && base.sH === 0,
      `chưa có trạng thái: hàng ẩn (display ${base.display}), không chiếm chỗ`,
    );
    // Có trạng thái: ba ô (hai có hại, một có lợi)
    await open(W, H, { status: "burn:6,haste:8:0.3,stun:1.2" });
    await evalJs("0");
    for (let k = 0; k < 30 && (await chips()).length === 0; k++) await sleep(100);
    const c0 = await chips();
    const b0 = await box();
    check(
      !b0.hidden && c0.length === 3,
      `có trạng thái: hàng hiện, ${c0.length} ô (${c0.map((c) => c.text).join(" | ")})`,
    );
    check(
      JSON.stringify(c0.map((c) => c.id)) === JSON.stringify(["burn", "stun", "haste"]),
      `thứ tự: có hại trước (bỏng, choáng) rồi có lợi (tăng tốc): ${c0.map((c) => c.id).join(", ")}`,
    );
    check(
      /^Bỏng [56]$/.test(c0[0].text) &&
        /^Choáng [12]$/.test(c0[1].text) &&
        /^Tăng tốc \+30% [78]$/.test(c0[2].text),
      `chữ trên ô có tên, cường độ tăng tốc và số giây: ${c0.map((c) => c.text).join(" | ")}`,
    );
    check(
      c0.every(
        (c) =>
          c.role === "img" &&
          /còn \d+ giây$/.test(c.aria) &&
          c.aria.startsWith(c.text.split(" ")[0]),
      ),
      `mỗi ô có role=img và nhãn đọc "tên: tác dụng, còn N giây" (${c0[0].aria})`,
    );
    check(
      b0.hudH > base.hudH,
      `HUD cao thêm ${(b0.hudH - base.hudH).toFixed(0)} px để chứa hàng ô`,
    );
    // hình học
    const inside = c0.every((c) => c.l >= b0.hudL - 0.5 && c.r <= b0.hudR + 0.5 && c.r <= b0.vw);
    check(
      inside,
      `mọi ô nằm trong khung HUD (${b0.hudL.toFixed(0)}..${b0.hudR.toFixed(0)}) và trong màn hình (${b0.vw})`,
    );
    let overlap = false;
    for (let i = 0; i < c0.length; i++)
      for (let j = i + 1; j < c0.length; j++) {
        const a = c0[i];
        const b = c0[j];
        if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) overlap = true;
      }
    check(!overlap, "các ô không chồng nhau");
    check(
      b0.qTop >= b0.hudB - 0.5,
      `khối nhiệm vụ bên dưới không bị đè (top ${b0.qTop.toFixed(0)} >= đáy HUD ${b0.hudB.toFixed(0)})`,
    );
    // tương phản thật
    const ct = await J(`(() => {
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const rgb = (s) => s.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map(Number);
      return [...document.querySelectorAll('#hud-status .st-badge')].map((el) => {
        const cs = getComputedStyle(el); const a = lum(rgb(cs.color)), b = lum(rgb(cs.backgroundColor));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    })()`);
    check(
      ct.length === 3 && ct.every((v) => v >= 4.5),
      `chữ >= 4,5:1 trên nền ô thật: ${ct.map((v) => v.toFixed(1)).join(", ")}`,
    );
    // nhấp nháy: ô choáng (<= 2 giây) là urgent
    check(
      c0[1].cls.includes("urgent") &&
        c0[1].anim === "st-badge-blink" &&
        !c0[0].cls.includes("urgent") &&
        c0[0].anim === "none",
      `ô sắp hết (choáng 1,2 giây) nhấp nháy, ô còn lâu thì không (anim ${c0[1].anim} / ${c0[0].anim})`,
    );
    if (SHOTS) {
      const png = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 0, y: 0, width: Math.min(W, 420), height: Math.min(H, 260), scale: 2 },
      });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, `trang-thai-${W}x${H}.png`),
        Buffer.from(png.result.data, "base64"),
      );
    }

    // đếm lùi theo đồng hồ + hết hạn
    await evalJs("window.__mockStatus.emit([['burn', 3000], ['haste', 9000, 0.3]]); 0");
    await sleep(250);
    const d0 = await chips();
    await sleep(1400);
    const d1 = await chips();
    const sec = (c, id) =>
      Number(
        c
          .find((x) => x.id === id)
          ?.text.split(" ")
          .pop(),
      );
    check(
      sec(d0, "burn") - sec(d1, "burn") >= 1 && sec(d0, "haste") - sec(d1, "haste") >= 1,
      `số giây đếm lùi theo đồng hồ: bỏng ${sec(d0, "burn")} -> ${sec(d1, "burn")}, tăng tốc ${sec(d0, "haste")} -> ${sec(d1, "haste")}`,
    );
    await sleep(2000);
    const d2 = await chips();
    check(
      d2.length === 1 && d2[0].id === "haste",
      `bỏng (3 giây) hết hạn thì ô mất, tăng tốc còn: ${d2.map((c) => c.id).join(", ")}`,
    );
    // không dựng lại mỗi khung
    const r0 = await evalJs("window.__scene.statusBadges.rebuilds");
    await sleep(400);
    const r1 = await evalJs("window.__scene.statusBadges.rebuilds");
    check(
      r1 - r0 <= 1,
      `gọi mỗi khung không dựng lại DOM: ${r1 - r0} lần dựng trong 0,4 giây (số giây đổi nhiều nhất 1 lần)`,
    );
    // hết hết thì ẩn lại và HUD cao đúng như lúc đầu
    await evalJs("window.__mockStatus.emit([]); 0");
    await sleep(300);
    const e = await box();
    check(
      e.hidden && e.display === "none" && Math.abs(e.hudH - base.hudH) < 0.5,
      `hết trạng thái: hàng ẩn lại, HUD cao ${e.hudH.toFixed(1)} = ${base.hudH.toFixed(1)} lúc đầu`,
    );
    // nối lại phòng (attachRoom): trạng thái của Room cũ không còn đúng nên huy hiệu mất NGAY; máy chủ gửi lại danh sách thì hiện lại
    await evalJs("window.__mockStatus.emit([['poison', 9000]]); 0");
    await sleep(250);
    check((await chips()).length === 1, "trước khi nối lại: 1 ô (Độc)");
    // ĐỌC NGAY trong cùng lượt chạy JS (trước mọi khung hình): nhân vật chưa có lại (`hasMe` = false) nên vòng khung chưa vẽ lại, phải do `attachRoom` tự xoá
    const afterAttach = await J(`(() => { window.__scene.attachRoom(window.__scene.room);
      return { hidden: document.getElementById('hud-status').hidden, n: document.querySelectorAll('#hud-status .st-badge').length }; })()`);
    check(
      afterAttach.hidden && afterAttach.n === 0,
      `nối lại phòng: huy hiệu của Room cũ mất NGAY (chưa tới khung hình kế): ẩn ${afterAttach.hidden}, ${afterAttach.n} ô`,
    );
    await evalJs("window.__mockStatus.emit([['poison', 7000]]); 0");
    await sleep(250);
    check((await chips()).length === 1, "máy chủ gửi lại danh sách sau nối lại: huy hiệu hiện lại");
    await evalJs("window.__mockStatus.emit([]); 0");
    await sleep(200);
    // tin hỏng không ném lỗi, không vẽ ô lạ
    await evalJs(
      "window.__mockStatus.emit([['constructor', 3000], ['burn', -5], 'rác', null, ['poison', 'x']]); 0",
    );
    await sleep(300);
    check(
      (await chips()).length === 0 && (await box()).hidden,
      "tin trạng thái hỏng (id lạ, số âm, rác): không ô nào",
    );
  }

  console.log("\n--- giảm chuyển động của hệ điều hành ---");
  await open(1280, 720, { status: "stun:1.2,burn:8", reduce: true });
  for (let k = 0; k < 30 && (await chips()).length === 0; k++) await sleep(100);
  const rm = await chips();
  const rmStun = rm.find((c) => c.id === "stun");
  check(
    rm.length === 2 && !!rmStun && rmStun.cls.includes("urgent") && rmStun.anim === "none",
    `prefers-reduced-motion: ô sắp hết vẫn đánh dấu urgent nhưng KHÔNG nhấp nháy (anim ${rmStun?.anim})`,
  );

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
