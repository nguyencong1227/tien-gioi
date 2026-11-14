import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm hiệu ứng DÙNG CHIÊU (M7.7, #508) trong Chrome THẬT (`?skills=mock`, không cần máy chủ): phát tin `fx` kiểu `cast` qua ĐÚNG đường tin nhắn của cảnh (mock room `emit`)
// cho cả 12 chiêu và đo HẠT / EMITTER SỐNG THẬT của Phaser: mỗi chiêu có hạt, số emitter không vượt ngân sách của bậc chất lượng (Thấp 4 -> <= 1 điểm, Cao 24 -> <= 6),
// bậc Thấp ít hơn bậc Cao ở chiêu nhiều điểm; id lạ không ném lỗi; chiêu của mình đặt `lastAttack` (số sát thương tô như đòn của mình) và hoạt ảnh đánh;
// chiêu ngoài tầm nhìn không phát hạt. Có thể chụp ảnh: `--shots <thư mục>`.
// Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-cast-fx.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
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
/** 12 chiêu của `SKILLS_M7`: id + kiểu hiệu ứng (`SkillDef.fx`) + hình, để báo kết quả dễ đọc (số liệu hình học nằm ở test đơn vị `cast-fx.test.ts`) */
const SKILLS = [
  ["hoa_van_kiem", "slash_fire", "cone"],
  ["bon_thach_quyen", "punch_earth", "cone"],
  ["ung_trao", "claw_metal", "cone"],
  ["trong_nhac_tram", "slash_earth", "cone"],
  ["huyen_bang_chi", "bolt_ice", "line"],
  ["kim_chung_trao", "aura_metal", "self"],
  ["bich_thuy_hoi_xuan", "aura_water", "self"],
  ["phieu_phong_bo", "dash_wind", "dash"],
  ["thanh_tung_phi_cham", "needle_wood", "line"],
  ["lac_tuyet_phan_phi", "fan_ice", "fan"],
  ["cuu_cung_khon_sat", "ground_earth", "ground"],
  ["me_tung_bo", "aura_wind", "self"],
];
const BUDGET = { low: 4, high: 24 };
const POINTS = { low: 1, high: 6 }; // castPointsFor
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-cast-fx-"));
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
  /** Phát tin `fx` cast và lấy đỉnh hạt / emitter sống trong `ms` (lấy mẫu mỗi 25 ms ngay trong trang) */
  const castPeak = (skill, by, ms = 700, extra = {}) =>
    evalJs(`new Promise((res) => {
      const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY);
      window.__fx.clear();
      const x = ${extra.x ?? "sc.predX"}, y = ${extra.y ?? "sc.predY"};
      const msg = { kind: "cast", by: ${by === "me" ? "sc.sid" : JSON.stringify(by)}, skill: ${JSON.stringify(skill)}, x, y, angle: 0, range: 150 };
      const a0 = window.__fx.stats().admitted;
      sc.room.emit("fx", msg);
      let peakP = 0, peakE = 0; const t0 = performance.now();
      const iv = setInterval(() => {
        const s = window.__fx.stats(); peakP = Math.max(peakP, s.liveParticles); peakE = Math.max(peakE, s.liveEmitters);
        if (performance.now() - t0 > ${ms}) { clearInterval(iv); res({ peakP, peakE, admitted: window.__fx.stats().admitted - a0 }); }
      }, 25);
    })`);
  const settle = async () => {
    await evalJs("window.__fx.clear(); 0");
    for (let k = 0; k < 60; k++) {
      await sleep(100);
      if ((await evalJs("window.__fx.stats().liveParticles")) === 0 && k >= 3) break;
    }
  };
  const results = {};
  for (const q of ["high", "low"]) {
    console.log(`--- bậc ${q === "high" ? "Cao" : "Thấp"} (ngân sách emitter ${BUDGET[q]}) ---`);
    await open(q);
    const prof = await evalJs(
      "JSON.stringify({ tier: window.__fx && window.__scene && (document.documentElement.dataset.quality) })",
    );
    check(
      JSON.parse(prof).tier === q,
      `đã ghim bậc chất lượng ${q} (data-quality=${JSON.parse(prof).tier})`,
    );
    results[q] = {};
    for (const [id, fx, shape] of SKILLS) {
      await settle();
      const r = await castPeak(id, "mock-bot-1");
      results[q][id] = r;
      check(
        r.peakP > 0 && r.admitted >= 1 && r.admitted <= POINTS[q],
        `${id} (${fx}, ${shape}): đỉnh ${r.peakP} hạt, ${r.peakE} emitter, nhận ${r.admitted} điểm (<= ${POINTS[q]})`,
      );
    }
    if (q === "high" && SHOTS) {
      for (const id of ["cuu_cung_khon_sat", "lac_tuyet_phan_phi", "hoa_van_kiem"]) {
        await settle();
        await evalJs(
          `(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY); window.__fx.clear(); sc.room.emit("fx", { kind: "cast", by: "mock-bot-1", skill: ${JSON.stringify(id)}, x: sc.predX, y: sc.predY, angle: 0, range: 150 }); })()`,
        );
        await sleep(60);
        const png = await send("Page.captureScreenshot", {
          format: "png",
          clip: { x: 490, y: 260, width: 300, height: 200, scale: 3 },
        });
        fs.mkdirSync(SHOTS, { recursive: true });
        fs.writeFileSync(
          path.join(SHOTS, `fx-chieu-${id}.png`),
          Buffer.from(png.result.data, "base64"),
        );
      }
    }
  }
  console.log(
    "--- VỊ TRÍ hạt thật của Phaser ngay lúc phát (bậc Thấp đang mở: 1 điểm / chiêu) ---",
  );
  // Bậc Thấp = 1 điểm phát nên toạ độ dễ khẳng định: self = ngay người dùng (y - 10); ground = tâm vùng cách mình `reach` (140 px) theo hướng đánh; cone = điểm GIỮA
  // ở 70 % tầm (tầm trong tin = 150 -> 105 px) trước mặt. Đọc các hạt đang sống của emitter ngay lúc `explode` vừa chạy (hạt còn ở đúng chỗ phát).
  await evalJs(
    "(() => { const sc = window.__scene; sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(sc.predX, sc.predY); return 1; })()",
  );
  await sleep(500);
  const spawnAt = (id, angle) =>
    evalJs(`(() => {
      const sc = window.__scene; window.__fx.clear();
      sc.room.emit("fx", { kind: "cast", by: "mock-bot-1", skill: ${JSON.stringify(id)}, x: sc.predX, y: sc.predY, angle: ${angle}, range: 150 });
      const ps = [];
      for (const e of sc.children.list) if (e.type === "ParticleEmitter") for (const p of e.alive ?? []) ps.push([p.x, p.y]);
      const n = ps.length || 1;
      return { n: ps.length, cx: ps.reduce((a, p) => a + p[0], 0) / n - sc.predX, cy: ps.reduce((a, p) => a + p[1], 0) / n - sc.predY };
    })()`);
  for (const [id, angle, ex, ey, label] of [
    ["kim_chung_trao", 0, 0, -10, "hộ thể: ngay người dùng"],
    ["cuu_cung_khon_sat", 0, 140, -10, "vùng đặt đất hướng phải: tâm cách mình reach 140 px"],
    [
      "cuu_cung_khon_sat",
      Math.PI / 2,
      0,
      140 - 10,
      "vùng đặt đất hướng xuống: tâm cách mình 140 px phía dưới",
    ],
    ["hoa_van_kiem", 0, 105, -10, "quạt hướng phải: điểm giữa ở 70 % tầm (105 px)"],
    ["hoa_van_kiem", Math.PI, -105, -10, "quạt hướng trái: đối xứng"],
  ]) {
    await settle();
    const r = await spawnAt(id, angle);
    check(
      r.n > 0 && Math.abs(r.cx - ex) <= 6 && Math.abs(r.cy - ey) <= 6,
      `${id}: ${label} (hạt ở lệch (${r.cx.toFixed(1)}, ${r.cy.toFixed(1)}), mong (${ex}, ${ey}), ${r.n} hạt)`,
    );
  }
  console.log("--- so sánh bậc / trường hợp đặc biệt (bậc Thấp đang mở) ---");
  const multi = ["hoa_van_kiem", "cuu_cung_khon_sat", "phieu_phong_bo", "lac_tuyet_phan_phi"];
  check(
    multi.every((id) => results.low[id].admitted < results.high[id].admitted),
    `chiêu nhiều điểm: bậc Thấp ít điểm hơn bậc Cao (${multi.map((id) => `${id} ${results.low[id].admitted}/${results.high[id].admitted}`).join(", ")})`,
  );
  check(
    SKILLS.every(([id]) => results.low[id].peakE <= results.high[id].peakE + 1),
    "bậc Thấp không bao giờ nhiều emitter hơn bậc Cao",
  );
  await settle();
  const unknown = await castPeak("khong_co_chieu_nay", "mock-bot-1", 300);
  check(unknown.admitted === 0 && unknown.peakP === 0, "id chiêu lạ: bỏ qua, không hạt, không lỗi");
  const proto = await castPeak("constructor", "mock-bot-1", 300);
  check(proto.admitted === 0, "id độc ('constructor'): bỏ qua");
  await settle();
  const far = await castPeak("hoa_van_kiem", "mock-bot-1", 300, {
    x: "sc.predX + 5000",
    y: "sc.predY",
  });
  check(far.admitted === 0, "chiêu ngoài tầm nhìn (cách 5000 px): không phát hạt");
  await settle();
  const mine = await castPeak("hoa_van_kiem", "me", 300);
  const own = JSON.parse(
    await evalJs(
      "JSON.stringify({ last: !!window.__scene.lastAttack, range: window.__scene.lastAttack && window.__scene.lastAttack.range, slash: (window.__scene.players.get(window.__scene.sid)?.slashUntil ?? 0) > 0 })",
    ),
  );
  check(
    mine.admitted >= 1 && own.last && own.range === 150 && own.slash,
    `chiêu của mình: có hạt, lastAttack.range = 150, hoạt ảnh đánh (${JSON.stringify(own)})`,
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
