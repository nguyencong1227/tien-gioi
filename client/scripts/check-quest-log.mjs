/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm Sổ nhiệm vụ khi chuỗi dài (M6 #409 mục 2 và 4): tab "Đã hoàn thành" với MỌI nhiệm vụ chính tuyến + nhiệm vụ lặp đã xong,
 * ở năm khung nhìn (1280x720, 768x1024, 844x390, 390x844, 360x640), trong Chrome thật bằng chế độ mock (không cần server / Vite).
 *
 *   npm run build -w client && node client/scripts/check-quest-log.mjs [--shots <thư mục>]
 *
 * Khẳng định (`judgeQuestLog`, hàm thuần có test): mỗi nhiệm vụ MỘT hàng; hàng bấm được >= 44 px (cảm ứng); danh sách GỌN (cao trung bình
 * mỗi hàng đóng <= MAX_ROW_PX, không phải thẻ nhiều dòng như trước); không tràn ngang; chữ tiêu đề không bị cắt; mô tả ẩn tới khi bấm,
 * bấm mở (aria-expanded) rồi bấm lại đóng; chuỗi dài vẫn cuộn tới hàng cuối được.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");

/** Năm khung nhìn như `snap-sheet.mjs`; máy tính đứng đầu vì Chrome headless không tắt được giả lập cảm ứng trong cùng phiên. */
export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
];

/** Mục bấm tối thiểu trên cảm ứng (px CSS), như mọi nút khác của game. */
export const MIN_TAP_PX = 44;
/** Chiều cao TRUNG BÌNH tối đa của một hàng đang đóng (px): hàng gọn một dòng, hai dòng khi tiêu đề dài ở màn hẹp. */
export const MAX_ROW_PX = 84;

/**
 * @param {{ expectedRows: number, rows: number, heights: number[], overflowX: number, clippedTitles: number,
 *   descHiddenBefore: boolean, openedOk: boolean, closedOk: boolean, lastReachable: boolean, touch: boolean }} m
 * @returns {string[]} danh sách lỗi (rỗng = đạt)
 */
export function judgeQuestLog(m) {
  const errs = [];
  if (!(m.expectedRows > 0)) errs.push("không có nhiệm vụ nào để kiểm (dữ liệu mẫu rỗng)");
  if (m.rows !== m.expectedRows)
    errs.push(`số hàng ${m.rows} != số nhiệm vụ đã xong ${m.expectedRows}`);
  const tooShort = m.heights.filter((h) => h < MIN_TAP_PX - 0.5);
  if (m.touch && tooShort.length > 0)
    errs.push(
      `${tooShort.length} hàng thấp hơn ${MIN_TAP_PX}px (thấp nhất ${Math.min(...tooShort).toFixed(1)}px)`,
    );
  const avg = m.heights.length ? m.heights.reduce((a, b) => a + b, 0) / m.heights.length : 0;
  if (avg > MAX_ROW_PX)
    errs.push(`hàng không gọn: cao trung bình ${avg.toFixed(1)}px > ${MAX_ROW_PX}px`);
  if (m.overflowX > 1) errs.push(`tràn ngang ${m.overflowX}px`);
  if (m.clippedTitles > 0) errs.push(`${m.clippedTitles} tiêu đề bị cắt chữ`);
  if (!m.descHiddenBefore) errs.push("mô tả hiện sẵn khi chưa bấm (không gọn)");
  if (!m.openedOk) errs.push("bấm hàng không mở mô tả / aria-expanded không thành true");
  if (!m.closedOk) errs.push("bấm lần hai không đóng mô tả");
  if (!m.lastReachable) errs.push("không cuộn tới được hàng cuối");
  return errs;
}

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
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
  const HTTP_PORT = 39800 + Math.floor(Math.random() * 90);
  await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));
  const CDP_PORT = 39700 + Math.floor(Math.random() * 90);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-quest-log-"));
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmp}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let failures = 0;
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
      console.log(`\n=== ${vp.name} ===`);
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      if (vp.mobile)
        await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      // Đánh dấu trang CŨ: khung nhìn sau không được coi "đã sẵn sàng" khi trang cũ còn sống lúc chưa kịp chuyển sang trang mới
      await evalJs("window.__qlOldPage = true");
      await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1` });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        // `__getMap` được đặt ở CUỐI `WorldScene.create` (sau `ui.init`: nút đã gắn sự kiện); `__scene` thì đặt sớm hơn ở main.ts
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__qlOldPage && window.__getMap && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      if (!ready) {
        console.log("  ✗ cảnh không sẵn sàng");
        failures++;
        continue;
      }
      // Mọi nhiệm vụ chính tuyến + nhiệm vụ lặp đã xong: dữ liệu THẬT của game, lấy từ chính trang (shared đã đóng gói trong client)
      const seed = await evalJs(`(async () => {
        const ui = window.__ui;
        const q = window.__questIds ? window.__questIds() : null;
        return q;
      })()`);
      if (!seed || !seed.main?.length) {
        console.log("  ✗ trang không cung cấp window.__questIds (cần ?debug)");
        failures++;
        continue;
      }
      await evalJs(`(() => {
        const q = window.__questIds();
        window.__ui.onQuests({ active: [], done: q.main, dailyDone: q.daily });
        window.__ui.closeAllModals();
        window.__ui.toggleQuestModal(true);
        document.getElementById("tab-q-done").click();
      })()`);
      await sleep(400);
      const m = await evalJs(`(() => {
        const modal = document.getElementById("quest-modal");
        const list = document.getElementById("quest-list");
        const rows = [...list.querySelectorAll(".q-row")];
        const btns = rows.map((r) => r.querySelector(".q-row-btn"));
        const heights = rows.map((r) => r.getBoundingClientRect().height);
        const clipped = [...list.querySelectorAll(".q-row-title")].filter((t) => t.scrollWidth > t.clientWidth + 1).length;
        const first = rows[0];
        const descHiddenBefore = rows.every((r) => r.querySelector(".q-row-desc").hidden);
        btns[0].click();
        const openedOk = !first.querySelector(".q-row-desc").hidden && btns[0].getAttribute("aria-expanded") === "true";
        btns[0].click();
        const closedOk = first.querySelector(".q-row-desc").hidden && btns[0].getAttribute("aria-expanded") === "false";
        // Cuộn tới hàng cuối (tấm tự cuộn trên điện thoại, danh sách cuộn riêng trên máy tính)
        const last = rows[rows.length - 1];
        last.scrollIntoView({ block: "end" });
        const lr = last.getBoundingClientRect();
        const mr = modal.getBoundingClientRect();
        const lastReachable = lr.bottom <= Math.max(mr.bottom, innerHeight) + 1 && lr.top >= -1;
        const overflowX = Math.max(0, document.documentElement.scrollWidth - innerWidth, modal.scrollWidth - modal.clientWidth);
        return {
          expectedRows: window.__questIds().main.length + window.__questIds().daily.length,
          rows: rows.length, heights, overflowX, clippedTitles: clipped,
          descHiddenBefore, openedOk, closedOk, lastReachable, touch: ${vp.mobile},
          summary: list.querySelector(".q-done-summary")?.textContent ?? "",
        };
      })()`);
      console.log(
        `  - ${m.rows} hàng, cao TB ${(m.heights.reduce((a, b) => a + b, 0) / Math.max(1, m.heights.length)).toFixed(1)} px, tóm tắt: ${m.summary}`,
      );
      const errs = judgeQuestLog(m);
      for (const e of errs) {
        console.log(`  ✗ ${e}`);
        failures++;
      }
      if (errs.length === 0) console.log("  ✓ đạt");
      if (shotsDir) {
        // Huy hiệu "giả lập" của mock đè lên tiêu đề tấm (bản thật không có): ẩn như `capture-viewports.mjs`
        await evalJs(
          `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
        );
        await evalJs(
          `document.getElementById("quest-list").firstElementChild?.scrollIntoView({ block: "start" }); document.getElementById("quest-modal").scrollTop = 0`,
        );
        await sleep(200);
        const shot = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(
          path.join(shotsDir, `nhat-ky-nhiem-vu-${vp.name}.webp`),
          Buffer.from(shot.result.data, "base64"),
        );
      }
    }
    ws.close();
  } finally {
    chrome.kill("SIGKILL");
    server.close();
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // Bỏ qua
    }
  }
  if (failures > 0) {
    console.error(`\n❌ ${failures} lỗi.`);
    process.exitCode = 1;
  } else {
    console.log("\n🎉 Sổ nhiệm vụ gọn và dùng được ở cả năm khung nhìn.");
  }
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error("Lỗi khi chạy check-quest-log:", err);
    process.exitCode = 1;
  });
}
