import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch */
/**
 * Kiểm DỪNG NGAY + ĐỐI CHIẾU MƯỢT (QUYET_DINH_M3 mục 41: di chuyển "trôi" trên v0.3.1) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-move-stop.mjs [--vp <khung>] [--reps <số lần đo độ trễ, mặc định 12>]
 *
 *   [1] NHẢ PHÍM -> tin DỪNG {dx: 0, dy: 0} gửi NGAY (trong ~1 khung vẽ, không chờ nhịp 50 ms), đúng 3 tin, seq liên tiếp tăng dần sau input di chuyển cuối;
 *   [2] đứng yên thì KHÔNG gửi gì thêm (không spam tin dừng);
 *   [3] ĐI LẠI giữa chừng huỷ phần lặp cũ: không có tin dừng "mồ côi" sau input di chuyển mới; nhả lần hai mới có bộ tin dừng mới;
 *   [4] mở bảng (chặn phím) khi đang giữ phím: cũng gửi tin dừng (hết ý định đi);
 *   [5] ĐỐI CHIẾU MƯỢT: `pred` nhảy lùi 20 px (máy chủ bỏ / xoá input): nhân vật vẽ KHÔNG giật tức thì mà trượt về trong ~150-600 ms, không đoạn nào quá 40 % độ lệch trong một khung;
 *       lệch lớn (200 px) thì dịch chuyển TỨC THÌ (không lao ngang màn hình).
 *
 * Mock không chạy đối chiếu thật nên script ghi đè `room.send` để bắt tin, và gọi `reconcile()` của cảnh khi cần.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");

const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
];

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

async function main() {
  const REPS = Number(
    process.argv.includes("--reps") ? process.argv[process.argv.indexOf("--reps") + 1] : 12,
  );
  const onlyVp = process.argv.includes("--vp")
    ? process.argv[process.argv.indexOf("--vp") + 1]
    : null;
  if (!fs.existsSync(path.join(DIST, "index.html")))
    throw new Error("Chưa có client/dist: chạy `npm run build -w client` trước.");

  const MIMES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath)) filePath = path.join(DIST, "index.html");
    try {
      res.writeHead(200, {
        "Content-Type": MIMES[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(fs.readFileSync(filePath));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const HTTP_PORT = await freePort();
  await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));
  const CDP_PORT = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-move-stop-"));
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      ...getChromeGpuFlags(),
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmp}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: true }, // nhóm tiến trình riêng: dọn được cả tiến trình con của Chrome một lần
  );
  let failures = 0;
  const check = (ok, msg) => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
    if (!ok) failures++;
  };
  try {
    let page = null;
    for (let i = 0; i < 100 && !page; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        page = (await res.json()).find((t) => t.type === "page") ?? null;
      } catch {
        // Chrome chưa mở cổng
      }
      if (!page) await sleep(150);
    }
    if (!page) throw new Error("Không tìm thấy Chrome page target.");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    let nextId = 1;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
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
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem('tg_newbie_guide_dismissed','1'); localStorage.setItem('tg_quality','low'); } catch (e) {}`,
    });

    for (const vp of VIEWPORTS) {
      if (onlyVp ? vp.name !== onlyVp : false) continue;
      console.log(`\n=== ${vp.name} ===`);
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      if (vp.mobile)
        await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&map=am_suong`,
      });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__getMap && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      if (!ready) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      await sleep(600);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      // ---- khởi tạo: bắt mọi tin `input` gửi ra (kèm đồng hồ trang) + ghi lúc keyup tới trang ----
      await evalJs(`(() => {
        window.__sent = [];
        window.__keyups = [];
        window.__scene.room.send = (t, m) => { if (t === "input") window.__sent.push({ at: performance.now(), ...m }); };
        window.addEventListener("keyup", (e) => window.__keyups.push(performance.now()), true);
        const n = window.__craftData.NPC_BY_ID.tho_ren_suong;
        window.__start = { x: n.x, y: n.y + 90 };
        return 1;
      })()`);
      const reset = () =>
        evalJs(
          `(() => { const sc = window.__scene; sc.predX = window.__start.x; sc.predY = window.__start.y; sc.corrX = 0; sc.corrY = 0; sc.cameras.main.centerOn(sc.predX, sc.predY); window.__sent.length = 0; window.__keyups.length = 0; return 1; })()`,
        );
      const sent = () => evalJs(`window.__sent.slice()`);
      const VK = { KeyD: 68, KeyA: 65 };
      const KEY = { KeyD: "d", KeyA: "a" };
      const down = (code, repeat = false) =>
        send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: KEY[code],
          code,
          windowsVirtualKeyCode: VK[code],
          autoRepeat: repeat,
        });
      const up = (code) =>
        send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: KEY[code],
          code,
          windowsVirtualKeyCode: VK[code],
        });
      const isStop = (m) => m.dx === 0 && m.dy === 0;

      // ---- [1] nhả phím -> tin dừng ngay, đúng 3 tin, seq liên tiếp ----
      console.log(
        "  [1] nhả phím: tin DỪNG gửi ngay (trong ~1 khung vẽ), đúng 3 tin, seq liên tiếp",
      );
      const lat = [];
      let badCount = 0;
      let badSeq = 0;
      let badGap = 0;
      for (let i = 0; i < REPS; i++) {
        await reset();
        await down("KeyD");
        await sleep(350);
        await up("KeyD");
        await sleep(450);
        const msgs = await sent();
        const ups = await evalJs(`window.__keyups.slice()`);
        const lastMove = [...msgs].reverse().find((m) => !isStop(m));
        const stops = msgs.filter((m) => isStop(m) && lastMove && m.seq > lastMove.seq);
        if (stops.length !== 3) badCount++;
        if (lastMove && stops.some((m, j) => m.seq !== lastMove.seq + 1 + j)) badSeq++;
        if (
          stops.length >= 3 &&
          (stops[1].at - stops[0].at > 150 || stops[2].at - stops[1].at > 150)
        )
          badGap++;
        if (stops.length && ups.length) lat.push(stops[0].at - ups[ups.length - 1]);
      }
      const med = median(lat);
      const max = Math.max(...lat);
      check(badCount === 0, `${REPS} lần nhả: lần nào cũng đúng 3 tin dừng (lệch ${badCount} lần)`);
      check(
        badSeq === 0,
        `seq của 3 tin dừng liên tiếp ngay sau input di chuyển cuối (lệch ${badSeq} lần)`,
      );
      check(
        Number.isFinite(med) && med <= 40,
        `độ trễ từ keyup tới tin dừng đầu tiên: trung vị ${med.toFixed(1)} ms, lớn nhất ${max.toFixed(1)} ms (<= 40 ms trung vị; nhịp 20 Hz cũ là tới 50 ms)`,
      );
      check(max <= 120, `không lần nào quá 120 ms (lớn nhất ${max.toFixed(1)} ms)`);
      check(badGap === 0, `hai tin lặp cách nhau <= 150 ms (một bước 50 ms), lệch ${badGap} lần`);

      // ---- [2] đứng yên không gửi gì thêm ----
      console.log("  [2] đứng yên: không gửi thêm tin nào");
      await reset();
      await sleep(600);
      check((await sent()).length === 0, "600 ms đứng yên, chưa từng đi: 0 tin input");

      // ---- [3] đi lại giữa chừng huỷ phần lặp cũ ----
      console.log("  [3] đi lại giữa chừng huỷ phần lặp cũ");
      await reset();
      await down("KeyD");
      await sleep(300);
      await up("KeyD");
      await sleep(20); // trước khi hai tin lặp kịp đi hết
      await down("KeyA");
      await sleep(400);
      const mid = await sent();
      // sau input di chuyển ĐẦU TIÊN của lần đi lại (dx < 0) KHÔNG có tin dừng nào cho tới khi nhả A
      const firstBack = mid.findIndex((m) => m.dx < 0);
      check(firstBack >= 0, "đi lại hướng ngược: có input di chuyển mới");
      check(
        firstBack >= 0 && mid.slice(firstBack).every((m) => !isStop(m)),
        "khi đang đi lại KHÔNG có tin dừng mồ côi (phần lặp cũ đã huỷ)",
      );
      await up("KeyA");
      await sleep(450);
      const end = await sent();
      const lastBack = [...end].reverse().find((m) => m.dx < 0);
      const stops2 = end.filter((m) => isStop(m) && lastBack && m.seq > lastBack.seq);
      check(stops2.length === 3, `nhả lần hai: bộ tin dừng mới đủ 3 tin (có ${stops2.length})`);

      // ---- [4] mở bảng chặn phím khi đang giữ: cũng dừng ----
      console.log("  [4] mở bảng khi đang giữ phím: hết ý định đi nên gửi tin dừng");
      await reset();
      await down("KeyD");
      await sleep(300);
      await evalJs(`window.__ui.toggleKeysModal(true)`);
      await sleep(400);
      const blocked = await sent();
      const lastMv = [...blocked].reverse().find((m) => !isStop(m));
      const stops4 = blocked.filter((m) => isStop(m) && lastMv && m.seq > lastMv.seq);
      check(stops4.length === 3, `bảng chặn phím mở: ${stops4.length} tin dừng (cần 3)`);
      await evalJs(`window.__ui.toggleKeysModal(false)`);
      await up("KeyD");
      await sleep(200);

      // ---- [5] đối chiếu mượt ----
      console.log("  [5] đối chiếu mượt: lệch nhỏ trượt ~150-600 ms, lệch lớn tức thì");
      const jumpTest = (back) =>
        evalJs(`(async () => {
          const sc = window.__scene;
          const me = sc.me();
          me.x = window.__start.x; me.y = window.__start.y; me.lastSeq = 0; me.dead = false;
          sc.pending = [];
          sc.corrX = 0; sc.corrY = 0;
          const root = sc.players.get(sc.sid).root;
          // ổn định ở vị trí "cũ" của pred (đã đi trước máy chủ ${back} px)
          sc.predX = me.x + ${back}; sc.predY = me.y;
          root.x = sc.predX; root.y = sc.predY;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          root.x = sc.predX; root.y = sc.predY;
          const t0 = performance.now();
          sc.reconcile(); // máy chủ (và pending rỗng): pred nhảy lùi ${back} px
          const samples = [];
          let prev = root.x;
          for (let i = 0; i < 60; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            samples.push({ t: performance.now() - t0, x: root.x, d: Math.abs(root.x - prev) });
            prev = root.x;
          }
          return { target: me.x, startX: me.x + ${back}, samples };
        })()`);
      const small = await jumpTest(20);
      const within = (r, px) => r.samples.find((s) => Math.abs(s.x - r.target) <= px);
      const t2 = within(small, 2)?.t ?? Infinity;
      const maxStep = Math.max(...small.samples.map((s) => s.d));
      const first = small.samples[0];
      check(
        Math.abs(first.x - small.startX) < 12,
        `lệch 20 px: khung đầu sau reconcile CHƯA nhảy tức thì (cách chỗ cũ ${Math.abs(first.x - small.startX).toFixed(1)} px < 12)`,
      );
      check(
        t2 >= 120 && t2 <= 700,
        `lệch 20 px: về trong 2 px sau ${Number.isFinite(t2) ? t2.toFixed(0) : "không bao giờ"} ms (khoảng 120-700 ms; hằng thời gian ~120 ms)`,
      );
      check(
        maxStep <= 20 * 0.4,
        `không khung nào dịch quá 40 % độ lệch (lớn nhất ${maxStep.toFixed(1)} px)`,
      );
      check(
        Math.abs(small.samples[small.samples.length - 1].x - small.target) <= 1,
        "cuối cùng về đúng vị trí máy chủ",
      );
      const large = await jumpTest(200);
      const tl = within(large, 2)?.t ?? Infinity;
      check(
        tl <= 70,
        `lệch 200 px: dịch chuyển TỨC THÌ (về trong 2 px sau ${Number.isFinite(tl) ? tl.toFixed(0) : "không bao giờ"} ms <= 70 ms), không lao ngang màn hình`,
      );
    }
  } finally {
    try {
      process.kill(-chrome.pid, "SIGKILL"); // cả nhóm
    } catch {
      chrome.kill("SIGKILL");
    }
    server.close();
    await new Promise((r) => {
      chrome.once("exit", r);
      setTimeout(r, 1500);
    });
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // bỏ qua
    }
  }
  console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1] === __filename) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
