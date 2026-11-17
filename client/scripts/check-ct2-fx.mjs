import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm hiệu ứng của đợt thêm chiêu (mục 51, CT11b) trong Chrome THẬT (`?skills=mock`, không cần máy chủ): phát tin `fx` kiểu `chain` và tin `dmg` có `combo` qua ĐÚNG đường tin
// nhắn của cảnh (mock room `emit`), đo HẠT / EMITTER SỐNG THẬT của Phaser, và đặt quái giả có `Monster.mark` để đo chấm DẤU hệ trên đầu quái. Khẳng định: tia sét có hạt, số điểm
// nhận không vượt ngân sách của bậc chất lượng (Thấp chỉ chớp ở mục tiêu), tia ngoài tầm nhìn / tin hỏng / chiêu lạ không phát gì và không lỗi JS; đòn ĂN COMBO thêm vụ nổ so với
// đòn thường; chấm dấu hiện đúng tên hệ, mất khi dấu về 0, mỗi hệ một màu. Có thể chụp ảnh: `--shots <thư mục>`.
//   node client/scripts/check-ct2-fx.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
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
const BUDGET = { low: 4, high: 24 };
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-ct2-fx-"));
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
  let scriptId = null;
  const open = async (quality) => {
    if (scriptId) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
    const r = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','${quality}');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
    });
    scriptId = String(r.result?.identifier ?? "");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=4&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__scene && window.__scene.me && window.__scene.me() && window.__fx)",
        )
      )
        break;
    }
    await sleep(1200);
    // Chế độ mock không chạy đối chiếu (predX / predY = 0): đặt người chơi (và đoán trước) vào giữa trấn thoáng, camera nhìn vào đó
    await evalJs(`(() => { const sc = window.__scene, me = sc.me(), t = sc.map.townPx;
      me.x = t.x; me.y = t.y; sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0; sc.cameras.main.centerOn(me.x, me.y); return 1; })()`);
    await sleep(500);
  };
  const settle = async () => {
    await evalJs("window.__fx.clear(); 0");
    for (let k = 0; k < 60; k++) {
      await sleep(100);
      if ((await evalJs("window.__fx.stats().liveParticles")) === 0 && k >= 3) break;
    }
  };
  /** Phát tin `type` (đường `room.emit` của cảnh giả) và lấy đỉnh hạt / emitter sống + số điểm Phaser NHẬN trong `ms` (lấy mẫu mỗi 25 ms ngay trong trang). `msgJs` dựng tin từ (x, y) = chỗ người chơi. */
  const emitPeak = (type, msgJs, ms = 600) =>
    evalJs(`new Promise((res) => {
      const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY);
      window.__fx.clear();
      const x = sc.predX, y = sc.predY;
      const msg = ${msgJs};
      const a0 = window.__fx.stats().admitted;
      sc.room.emit(${JSON.stringify(type)}, msg);
      let peakP = 0, peakE = 0; const t0 = performance.now();
      const iv = setInterval(() => {
        const s = window.__fx.stats(); peakP = Math.max(peakP, s.liveParticles); peakE = Math.max(peakE, s.liveEmitters);
        if (performance.now() - t0 > ${ms}) { clearInterval(iv); res({ peakP, peakE, admitted: window.__fx.stats().admitted - a0 }); }
      }, 25);
    })`);
  const chain = (over = "") =>
    `{ kind: "chain", by: "mock-bot-1", skill: "hoa_van_kiem", x, y, pts: [x, y, x + 80, y, x + 160, y + 40, x + 240, y + 40]${over} }`;
  const dmg = (combo) =>
    `{ target: "mock-bot-9", amount: 50, x, y, crit: false${combo ? ", combo: true" : ""} }`;
  const NODES = 3; // 4 điểm = 3 đoạn = 3 chớp ở mục tiêu
  const peaks = {};
  for (const q of ["high", "low"]) {
    console.log(`--- bậc ${q === "high" ? "Cao" : "Thấp"} (ngân sách emitter ${BUDGET[q]}) ---`);
    await open(q);
    await settle();
    const r = await emitPeak("fx", chain());
    peaks[q] = r;
    check(
      r.peakP > 0 && r.admitted >= NODES,
      `tia sét có hạt thật: đỉnh ${r.peakP} hạt, ${r.peakE} emitter, nhận ${r.admitted} điểm (>= ${NODES} chớp)`,
    );
    check(r.peakE <= BUDGET[q], `emitter sống ${r.peakE} KHÔNG vượt ngân sách bậc (${BUDGET[q]})`);
    if (q === "low")
      check(
        r.admitted === NODES,
        `bậc Thấp: CHỈ chớp ở mục tiêu (nhận ${r.admitted} = ${NODES}), không rải dọc tia`,
      );
    await settle();
    const far = await emitPeak(
      "fx",
      `{ kind: "chain", by: "mock-bot-1", skill: "hoa_van_kiem", x: x + 5000, y, pts: [x + 5000, y, x + 5080, y] }`,
    );
    check(far.admitted === 0, `tia ngoài tầm nhìn không phát gì (nhận ${far.admitted})`);
    for (const [name, over] of [
      ["pts lẻ", ", pts: [1, 2, 3]"],
      ["pts NaN", ", pts: [x, y, NaN, 5]"],
      ["pts một điểm", ", pts: [x, y]"],
      ["pts không phải mảng", ', pts: "abc"'],
      ["chiêu lạ", ', skill: "khong_co_chieu_nay"'],
    ]) {
      await settle();
      const bad = await emitPeak("fx", chain(over), 250);
      check(
        bad.admitted === 0,
        `tin hỏng (${name}): không phát gì, không lỗi (nhận ${bad.admitted})`,
      );
    }
    await settle();
    const plain = await emitPeak("dmg", dmg(false), 250);
    await settle();
    const combo = await emitPeak("dmg", dmg(true), 250);
    check(
      combo.admitted >= plain.admitted + 1,
      `đòn ĂN COMBO thêm vụ nổ so với đòn thường (nhận ${combo.admitted} so với ${plain.admitted})`,
    );
    check(
      combo.peakE <= BUDGET[q],
      `vụ nổ dấu không vượt ngân sách emitter (${combo.peakE} <= ${BUDGET[q]})`,
    );
    if (q === "high" && SHOTS) {
      await settle();
      await evalJs(`(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX + 120, sc.predY); window.__fx.clear(); const x = sc.predX, y = sc.predY;
        sc.room.emit("fx", ${chain()}); sc.room.emit("dmg", { target: "mock-bot-9", amount: 50, x: x + 240, y: y + 40, crit: false, combo: true }); return 1; })()`);
      await sleep(110);
      const png = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 440, y: 300, width: 460, height: 160, scale: 2 },
      });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, "fx-set-lan-no-dau.png"),
        Buffer.from(png.result.data, "base64"),
      );
    }
  }
  check(
    peaks.high.admitted > peaks.low.admitted,
    `bậc Cao nhiều điểm hơn bậc Thấp (${peaks.high.admitted} > ${peaks.low.admitted})`,
  );

  console.log("--- chấm DẤU hệ trên đầu quái (Monster.mark) ---");
  await open("high");
  const put = (id, mark) =>
    evalJs(`(() => { const sc = window.__scene; const m = sc.state.monsters.get(${JSON.stringify(id)});
      if (m) { m.mark = ${mark}; return 1; }
      sc.state.monsters.set(${JSON.stringify(id)}, { kind: "lang", x: sc.predX + 90, y: sc.predY, angle: 0, hp: 100, maxHp: 100, fx: 0, mark: ${mark} }); return 1; })()`);
  const pips = () =>
    evalJs(`JSON.stringify(window.__scene.monsterPips("m-dau"))`).then((s) => JSON.parse(s));
  await put("m-dau", 0);
  await sleep(500);
  let pp = await pips();
  check(pp !== null && pp.n === 0, "chưa có dấu: không chấm");
  const NAMES = ["Kim", "Mộc", "Thủy", "Hỏa", "Thổ", "Băng", "Phong", "Lôi", "Âm"];
  for (let i = 1; i <= 9; i++) {
    await put("m-dau", i);
    await sleep(200);
    pp = await pips();
    check(
      pp !== null && pp.n === 1 && pp.text === `Dấu ${NAMES[i - 1]}` && pp.visible,
      `dấu hệ ${i} -> một chấm '${pp?.text}' hiện`,
    );
  }
  await put("m-dau", 0);
  await sleep(250);
  pp = await pips();
  check(pp !== null && pp.n === 0 && !pp.visible, "dấu về 0: chấm biến mất");
  for (const bad of [10, -1, 2.5, "3", null]) {
    await put("m-dau", typeof bad === "string" ? `"${bad}"` : String(bad));
    await sleep(150);
    pp = await pips();
    check(pp !== null && pp.n === 0, `dấu rác (${JSON.stringify(bad)}): không chấm`);
  }
  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  if (SHOTS) {
    await put("m-dau", 4);
    await sleep(300);
    await evalJs(
      "(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX + 45, sc.predY); return 1; })()",
    );
    await sleep(200);
    const png = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 520, y: 300, width: 240, height: 120, scale: 3 },
    });
    fs.writeFileSync(path.join(SHOTS, "cham-dau-he.png"), Buffer.from(png.result.data, "base64"));
  }
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
