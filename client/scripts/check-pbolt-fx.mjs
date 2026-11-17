import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm ĐẠN BAY của người chơi (`fx` `pbolt`, mục 51, CT11b bước 2) trong Chrome THẬT (`?skills=mock`, không cần máy chủ): phát tin qua ĐÚNG đường nhận tin của cảnh
// (mock room `emit`), đo hình đạn đang giữ / vị trí theo thời gian (`scene.pbolts`) và HẠT thật ở cuối đoạn (`__fx.stats()`). Khẳng định: đạn bay thẳng đều theo `speed` /
// `angle`, dừng ở cuối đoạn (không bay quá `ms`), mờ rồi được gỡ; bụi cuối đoạn có hạt; nảy (tin mới đúng lúc) nối tiếp; ngoài tầm nhìn / tin hỏng / chiêu lạ không vẽ gì
// và không lỗi JS; số đạn đang vẽ KHÔNG vượt trần theo bậc chất lượng và theo chủ (16 viên x nhiều người không phình). Có thể chụp ảnh: `--shots <thư mục>`.
//   node client/scripts/check-pbolt-fx.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-pbolt-fx-"));
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
  /** Ảnh chụp lớp đạn: số liệu + từng viên (vị trí tại thời điểm hiện tại của cảnh). */
  const layer = () =>
    evalJs(
      `(() => { const sc = window.__scene, p = sc.pbolts; return JSON.stringify({ s: p.stats(), snap: p.snapshot(sc.time.now) }); })()`,
    ).then((s) => JSON.parse(s));
  /** Phát một tin `fx` (đường `room.emit` của cảnh giả); `msgJs` dựng tin từ (x, y, sid) đang đứng. */
  const emit = (msgJs) =>
    evalJs(`(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY);
      const x = sc.predX, y = sc.predY, sid = sc.sid; sc.room.emit("fx", ${msgJs}); return 1; })()`);
  const admitted = () => evalJs("window.__fx.stats().admitted");
  const reset = async () => {
    await evalJs("window.__scene.pbolts.clear(); window.__fx.clear(); 0");
    await settle();
  };
  const bolt = (over = "") =>
    `{ kind: "pbolt", by: "mock-bot-1", skill: "hoa_van_kiem", x, y, angle: 0, speed: 500, ms: 600${over} }`;
  const LIMITS = { low: { total: 8, perOther: 2 }, high: { total: 24, perOther: 6 } };
  for (const q of ["high", "low"]) {
    console.log(`--- bậc ${q === "high" ? "Cao" : "Thấp"} (ngân sách emitter ${BUDGET[q]}) ---`);
    await open(q);
    await reset();
    // 1. một đoạn: bay đều, dừng đúng cuối đoạn, mờ rồi gỡ, có bụi cuối đoạn
    const x0 = await evalJs("window.__scene.predX");
    const a0 = await admitted();
    await emit(bolt());
    let r = await layer();
    check(
      r.s.alive === 1 && r.snap.length === 1,
      `đạn hiện ngay khi nhận tin (đang giữ ${r.s.alive})`,
    );
    check(
      Math.abs(r.snap[0].x - x0) < 40,
      `đạn xuất phát ở điểm bắn (x ${Math.round(r.snap[0].x)} so với ${Math.round(x0)})`,
    );
    check(r.snap[0].alpha === 1, "đang bay thì đậm tối đa");
    await sleep(300);
    r = await layer();
    const mid = r.snap[0]?.x ?? NaN;
    check(
      mid > x0 + 60 && mid < x0 + 260,
      `giữa chặng đạn đã bay xa dần (x ${Math.round(mid - x0)} px từ điểm bắn, cuối đoạn 300 px)`,
    );
    await sleep(500); // tổng ~800 ms > ms 600
    r = await layer();
    const endX = r.snap[0]?.x;
    check(r.s.alive <= 1, `hết đoạn: đạn không còn giữ quá một viên (${r.s.alive})`);
    if (endX !== undefined)
      check(
        endX <= x0 + 300 + 1,
        `đạn KHÔNG bay quá cuối đoạn (x ${Math.round(endX - x0)} <= 300)`,
      );
    await sleep(300);
    r = await layer();
    check(r.s.alive === 0, `mờ xong thì gỡ hẳn khỏi lớp (đang giữ ${r.s.alive})`);
    check(
      (await admitted()) - a0 >= 1,
      `bụi ở cuối đoạn có hạt thật (nhận ${(await admitted()) - a0} điểm)`,
    );
    await reset();

    // 2. của mình / của người khác
    await emit(
      `{ kind: "pbolt", by: sid, skill: "hoa_van_kiem", x, y, angle: 0, speed: 500, ms: 400 }`,
    );
    r = await layer();
    check(r.snap[0]?.mine === true, "đạn của chính mình được nhận ra (mine)");
    await emit(bolt(", ms: 400"));
    r = await layer();
    check(
      r.snap.filter((s) => !s.mine).length === 1,
      "đạn của người khác không bị coi là của mình",
    );
    await reset();

    // 3. ngoài tầm nhìn không vẽ; bay ngang qua màn hình (đầu ngoài, cuối trong) thì vẽ
    const aFar = await admitted();
    await emit(
      `{ kind: "pbolt", by: "mock-bot-1", skill: "hoa_van_kiem", x: x + 5000, y, angle: 0, speed: 500, ms: 600 }`,
    );
    r = await layer();
    check(
      r.s.alive === 0 && (await admitted()) === aFar,
      `đạn ngoài tầm nhìn không vẽ, không hạt (giữ ${r.s.alive})`,
    );
    await emit(
      `{ kind: "pbolt", by: "mock-bot-1", skill: "hoa_van_kiem", x: x - 900, y, angle: 0, speed: 700, ms: 1400 }`,
    );
    r = await layer();
    check(r.s.alive === 1, "đạn đầu ngoài nhưng cuối trong tầm nhìn vẫn được vẽ");
    await reset();

    // 4. tin hỏng / chiêu lạ: bỏ cả tin, không lỗi
    for (const [name, over] of [
      ["by rỗng", ', by: ""'],
      ["speed NaN", ", speed: NaN"],
      ["speed 0", ", speed: 0"],
      ["ms chuỗi", ', ms: "600"'],
      ["angle thiếu", ", angle: undefined"],
      ["x vô cực", ", x: Infinity"],
      ["toạ độ quá biên", ", x: 1e9"],
      ["chiêu lạ", ', skill: "khong_co_chieu_nay"'],
      ["chiêu độc", ', skill: "constructor"'],
    ]) {
      await emit(bolt(over));
      r = await layer();
      check(r.s.alive === 0, `tin hỏng (${name}): không vẽ (giữ ${r.s.alive})`);
    }
    await reset();

    // 5. nảy: đoạn mới đến đúng lúc từ chỗ nảy, hai đoạn cùng tồn tại ngắn rồi gỡ; mỗi đoạn có bụi cuối
    await sleep(1500); // đợi hết bụi hẹn giờ của các đạn trước (đoạn 1400 ms ở mục 3) để đếm đúng
    await settle();
    const aB = await admitted();
    await emit(bolt(", ms: 300"));
    await sleep(300);
    await emit(
      `{ kind: "pbolt", by: "mock-bot-1", skill: "hoa_van_kiem", x: x + 150, y, angle: Math.PI / 2, speed: 500, ms: 300 }`,
    );
    r = await layer();
    check(r.s.alive === 2, `đoạn nảy nối tiếp đoạn trước (đang giữ ${r.s.alive})`);
    await sleep(900);
    r = await layer();
    check(r.s.alive === 0, `cả hai đoạn được gỡ sau khi hết (giữ ${r.s.alive})`);
    check(
      (await admitted()) - aB === 2,
      `mỗi đoạn có bụi cuối (nhận ${(await admitted()) - aB} điểm, đúng 2: mỗi đoạn một)`,
    );
    await reset();

    // 6. trần: một người khác bắn dồn dập, nhiều người cùng bắn, và chính mình bắn dồn dập
    await evalJs(`(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY); const x = sc.predX, y = sc.predY;
      for (let i = 0; i < 40; i++) sc.room.emit("fx", { kind: "pbolt", by: "mock-bot-1", skill: "hoa_van_kiem", x, y, angle: i * 0.1, speed: 300, ms: 1800 }); return 1; })()`);
    r = await layer();
    const lim = LIMITS[q];
    check(
      r.snap.length <= lim.perOther,
      `40 viên của MỘT người khác chỉ giữ ${r.snap.length} (<= ${lim.perOther} theo bậc)`,
    );
    check(
      r.s.recycled >= 40 - lim.perOther,
      `phần vượt trần được TÁI DÙNG viên cũ (${r.s.recycled} lần), không bỏ tin mới`,
    );
    await reset();
    await evalJs(`(() => { const sc = window.__scene; const x = sc.predX, y = sc.predY;
      for (let o = 0; o < 20; o++) for (let i = 0; i < 6; i++)
        sc.room.emit("fx", { kind: "pbolt", by: "mock-bot-" + o, skill: "hoa_van_kiem", x, y, angle: i * 0.3, speed: 300, ms: 1800 });
      return 1; })()`);
    r = await layer();
    check(
      r.snap.length <= lim.total,
      `20 người x 6 viên: tổng giữ ${r.snap.length} (<= ${lim.total} theo bậc)`,
    );
    await reset();
    await evalJs(`(() => { const sc = window.__scene; const x = sc.predX, y = sc.predY;
      for (let i = 0; i < 40; i++) sc.room.emit("fx", { kind: "pbolt", by: sc.sid, skill: "hoa_van_kiem", x, y, angle: i * 0.1, speed: 300, ms: 1800 });
      return 1; })()`);
    r = await layer();
    check(
      r.snap.length <= Math.max(lim.total, 16) && r.snap.every((s) => s.mine),
      `40 viên của chính mình: giữ ${r.snap.length}, đều là của mình`,
    );
    check(
      r.snap.length >= Math.min(lim.total, 16),
      `đạn của mình KHÔNG bị bóp xuống dưới trần chung (${r.snap.length})`,
    );
    if (q === "high" && SHOTS) {
      await reset();
      await evalJs(`(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX + 150, sc.predY); const x = sc.predX, y = sc.predY;
        sc.room.emit("fx", { kind: "pbolt", by: sc.sid, skill: "hoa_van_kiem", x, y, angle: 0, speed: 500, ms: 700 });
        sc.room.emit("fx", { kind: "pbolt", by: "mock-bot-1", skill: "huyen_bang_chi", x, y: y + 34, angle: 0.15, speed: 420, ms: 700 });
        return 1; })()`);
      await sleep(330);
      const png = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 580, y: 300, width: 420, height: 160, scale: 2 },
      });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, "dan-nguoi-choi.png"),
        Buffer.from(png.result.data, "base64"),
      );
    }
    await reset();
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
