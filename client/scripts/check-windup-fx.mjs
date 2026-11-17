import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm CHIÊU VẬN (`SkillDef.windupMs`, mục 51, CT5 lát 2 + CT11b bước 3) trong Chrome THẬT (`?skills=mock&crowd=3`, không cần máy chủ): phát tin `fx cast` qua ĐÚNG đường nhận tin của
// cảnh, đo vòng tụ khí (`scene.windups`) và HẠT thật (`__fx.stats()`). Chưa chiêu thật nào khai `windupMs` nên script gán tạm `windupMs` lên chiêu mẫu trong trang. Khẳng định: chiêu vận
// vẽ vòng tụ khí NGAY và HOÃN hiệu ứng đáp tới hết `windupMs` (không hạt trước đó), đáp đúng MỘT lần; chiêu tức thời vẽ ngay như cũ; người vận chết / rời vùng nhìn thì tắt vòng
// và KHÔNG đáp; lần vận mới của cùng người thay lần cũ; tin hỏng không vẽ gì, không lỗi JS; trần số vòng theo bậc chất lượng. Có thể chụp ảnh: `--shots <thư mục>`.
//   node client/scripts/check-windup-fx.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-windup-fx-"));
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
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=4&debug=1&crowd=3` });
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
  const W = 800; // windupMs giả gán cho chiêu mẫu
  /** Gán `windupMs` cho chiêu mẫu ngay trong trang (object `SkillDef` dùng chung của shared): `hoa_van_kiem` vận W ms, `bon_thach_quyen` tức thời. */
  const arm = () =>
    evalJs(`(() => { const L = window.__scene.skills.learnedList(); const by = (id) => L.find((x) => x.def.id === id)?.def;
      const a = by("hoa_van_kiem"), b = by("bon_thach_quyen"); if (!a || !b) return 0; a.windupMs = ${W}; b.windupMs = undefined; return 1; })()`);
  const disarm = () =>
    evalJs(
      `(() => { const L = window.__scene.skills.learnedList(); const a = L.find((x) => x.def.id === "hoa_van_kiem")?.def; if (a) a.windupMs = undefined; return 1; })()`,
    );
  const layer = () =>
    evalJs(
      `(() => { const sc = window.__scene, w = sc.windups; return JSON.stringify({ s: w.stats(), snap: w.snapshot(sc.time.now) }); })()`,
    ).then((s) => JSON.parse(s));
  const admitted = () => evalJs("window.__fx.stats().admitted");
  const emitCast = (by, skill = "hoa_van_kiem", extra = "") =>
    evalJs(`(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY);
      sc.room.emit("fx", { kind: "cast", by: ${JSON.stringify(by)}, skill: ${JSON.stringify(skill)}, x: sc.predX, y: sc.predY, angle: 0, range: 150${extra} }); return 1; })()`);
  const reset = async () => {
    await evalJs("window.__scene.windups.clear(); window.__fx.clear(); 0");
    await settle();
  };
  const BUDGET_TOTAL = { low: 4, high: 12 };
  for (const q of ["high", "low"]) {
    console.log(`--- bậc ${q === "high" ? "Cao" : "Thấp"} (ngân sách emitter ${BUDGET[q]}) ---`);
    await open(q);
    check(
      (await arm()) === 1,
      "gán windupMs cho chiêu mẫu (hoa_van_kiem vận, bon_thach_quyen tức thời)",
    );
    // ba đạo hữu giả đứng sát người chơi (để hiệu ứng đáp nằm trong tầm nhìn); chờ thực thể nội suy tới chỗ mới
    await evalJs(`(() => { const sc = window.__scene; for (let i = 1; i <= 3; i++) { const p = sc.state.players.get("mock-bot-" + i);
      if (p) { p.px = p.x = sc.predX + 30 * i; p.py = p.y = sc.predY + 10; p.dead = false; } } return 1; })()`);
    await sleep(1500);
    await reset();

    // 1. chiêu vận của người khác: vòng ngay, hoãn hạt đáp, đáp đúng một lần
    const a0 = await admitted();
    await emitCast("mock-bot-1");
    let r = await layer();
    check(
      r.s.alive === 1 && r.snap[0]?.phase === "charge",
      `chiêu vận: vòng tụ khí hiện ngay (giữ ${r.s.alive}, pha ${r.snap[0]?.phase})`,
    );
    check(r.snap[0]?.mine === false, "vận của người khác không bị coi là của mình");
    await sleep(W * 0.5);
    r = await layer();
    const mid = r.snap[0]?.progress ?? -1;
    check(mid > 0.3 && mid < 0.75, `giữa chặng tiến độ ~0,5 (${mid.toFixed(2)})`);
    check(
      (await admitted()) === a0,
      `CHƯA có hạt đáp trước khi hết windupMs (nhận thêm ${(await admitted()) - a0})`,
    );
    await sleep(W * 0.5 + 250);
    r = await layer();
    const rel1 = r.s.released;
    check(rel1 === 1, `hết windupMs: đáp đúng MỘT lần (released ${rel1})`);
    check(
      (await admitted()) - a0 >= 1,
      `hạt đáp có thật sau khi vận xong (nhận ${(await admitted()) - a0} điểm)`,
    );
    await sleep(300);
    r = await layer();
    check(r.s.alive === 0, `chớp xong thì gỡ vòng (giữ ${r.s.alive})`);
    check(r.s.released === rel1, "không đáp lần hai");
    await reset();

    // 2. chiêu tức thời đi đường cũ: vẽ ngay, không vòng
    const a1 = await admitted();
    await emitCast("mock-bot-1", "bon_thach_quyen");
    await sleep(150);
    r = await layer();
    check(r.s.alive === 0, `chiêu tức thời KHÔNG có vòng tụ khí (giữ ${r.s.alive})`);
    check(
      (await admitted()) - a1 >= 1,
      `chiêu tức thời vẽ hạt ngay như cũ (nhận ${(await admitted()) - a1} điểm)`,
    );
    await reset();

    // 3. chiêu vận của MÌNH: nhận ra mine; choáng thì huỷ, KHÔNG đáp
    const a2 = await admitted();
    const rel2 = (await layer()).s.released;
    await emitCast(await evalJs("window.__scene.sid"));
    r = await layer();
    check(r.snap[0]?.mine === true, "vận của chính mình được nhận ra (mine)");
    await sleep(200);
    await evalJs(`window.__scene.onStatus({ list: [["stun", 600]] }); 1`);
    await sleep(120);
    r = await layer();
    check(
      r.snap[0]?.phase === "fizzle" && r.s.fizzled === 1,
      `mình bị choáng giữa lúc vận: vòng tắt (pha ${r.snap[0]?.phase}, fizzled ${r.s.fizzled})`,
    );
    await sleep(W + 300);
    r = await layer();
    check(
      r.s.released === rel2 && (await admitted()) === a2,
      `bị huỷ thì KHÔNG đáp, không hạt (đáp thêm ${r.s.released - rel2}, nhận ${(await admitted()) - a2})`,
    );
    check(r.s.alive === 0, `vòng đã gỡ sau khi tắt (giữ ${r.s.alive})`);
    await evalJs(`window.__scene.onStatus({ list: [] }); 1`);
    await reset();

    // 4. người khác chết giữa lúc vận: huỷ; rời khỏi state: huỷ
    const a3 = await admitted();
    const rel3 = (await layer()).s.released;
    await emitCast("mock-bot-1");
    await sleep(250);
    await evalJs(
      `(() => { const p = window.__scene.state.players.get("mock-bot-1"); p.dead = true; return 1; })()`,
    );
    await sleep(120);
    r = await layer();
    check(r.snap[0]?.phase === "fizzle", `người vận chết: vòng tắt (pha ${r.snap[0]?.phase})`);
    await sleep(W + 300);
    r = await layer();
    check(
      r.s.released === rel3 && (await admitted()) === a3,
      `người vận chết thì không đáp (đáp thêm ${r.s.released - rel3})`,
    );
    await evalJs(
      `(() => { const p = window.__scene.state.players.get("mock-bot-1"); p.dead = false; return 1; })()`,
    );
    await reset();
    await emitCast("mock-bot-2");
    await sleep(250);
    await evalJs(
      `(() => { const sc = window.__scene; sc.state.players.delete("mock-bot-2"); return 1; })()`,
    );
    await sleep(120);
    r = await layer();
    check(
      r.snap[0]?.phase === "fizzle",
      `người vận biến khỏi state: vòng tắt (pha ${r.snap[0]?.phase})`,
    );
    await reset();

    // 5. vận lần mới của cùng người thay lần cũ (mỗi người một vòng)
    await emitCast("mock-bot-3");
    await sleep(200);
    await emitCast("mock-bot-3");
    r = await layer();
    check(
      r.s.alive === 1 && r.s.replaced >= 1,
      `cùng người vận lần mới thì THAY lần cũ (giữ ${r.s.alive}, thay ${r.s.replaced})`,
    );
    check(
      r.snap[0].progress < 0.3,
      `lần mới tính lại từ đầu (tiến độ ${r.snap[0].progress.toFixed(2)})`,
    );
    await reset();

    // 6. tin hỏng / chiêu lạ: không vòng, không lỗi
    for (const [name, extra] of [
      ["x NaN", ", x: NaN"],
      ["range chuỗi", ', range: "150"'],
      ["by rỗng", ', by: ""'],
      ["toạ độ quá biên", ", x: 1e9"],
    ]) {
      await emitCast("mock-bot-1", "hoa_van_kiem", extra);
      r = await layer();
      check(r.s.alive === 0, `tin hỏng (${name}): không vòng (giữ ${r.s.alive})`);
    }
    await emitCast("mock-bot-1", "khong_co_chieu_nay");
    r = await layer();
    check(r.s.alive === 0, "chiêu lạ: không vòng");
    await reset();

    // 7. trần theo bậc: nhiều người cùng vận
    await evalJs(`(() => { const sc = window.__scene; for (let i = 0; i < 30; i++) {
      const id = "fake-" + i; sc.state.players.set(id, { name: id, dead: false, px: sc.predX, py: sc.predY, x: sc.predX, y: sc.predY, hp: 10, maxHp: 10, realm: 1, tier: 0 }); } return 1; })()`);
    await sleep(300);
    for (let i = 0; i < 30; i++) await emitCast(`fake-${i}`);
    r = await layer();
    const cap = BUDGET_TOTAL[q];
    check(r.s.alive <= cap, `30 người cùng vận: giữ ${r.s.alive} vòng (<= ${cap} theo bậc)`);
    await evalJs(
      `(() => { const sc = window.__scene; for (let i = 0; i < 30; i++) sc.state.players.delete("fake-" + i); return 1; })()`,
    );
    await reset();
    if (q === "high" && SHOTS) {
      await evalJs(
        `(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY); return 1; })()`,
      );
      await emitCast("mock-bot-1");
      await emitCast(await evalJs("window.__scene.sid"));
      await sleep(W * 0.6);
      const png = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 480, y: 250, width: 320, height: 200, scale: 2 },
      });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, "chieu-van-tu-khi.png"),
        Buffer.from(png.result.data, "base64"),
      );
      await reset();
    }
    await disarm();
  }
  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
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
