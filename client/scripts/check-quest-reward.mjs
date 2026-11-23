import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm BẢNG THƯỞNG khi TRẢ nhiệm vụ (mục 66, #1327; `client/src/quest-reward-view.ts`, tin `questReward`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-quest-reward.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Cho mỗi khung: bảng HIỆN khi có tin (tiêu đề tên nhiệm vụ, dòng tu vi, vật phẩm có số lượng + ô biểu tượng, không bắt chuột, gọn khung); hộp thoại NPC mở ngay sau vẫn bấm được;
 * tin mới thay bảng cũ (tu vi 0 -> 'đã đầy, cần Đột phá'; Linh thạch); tin hỏng bị bỏ; bảng tự ẩn sau ~6 giây. `--shots`: lưu ảnh bảng thưởng.
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

export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
];

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  const onlyVp = process.argv.includes("--vp")
    ? process.argv[process.argv.indexOf("--vp") + 1]
    : null;
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
  const HTTP_PORT = await freePort();
  await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));
  const CDP_PORT = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-quest-ready-"));
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
    { stdio: "ignore", detached: true },
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

    const loadPage = async (vp) => {
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1` });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      if (!ready) return false;
      await sleep(500);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      await evalJs(`window.__scene.room.send = () => {}; 1`);
      return true;
    };
    const shot = async (name) => {
      if (!shotsDir) return;
      const s = await send("Page.captureScreenshot", { format: "webp", quality: 80 });
      fs.writeFileSync(path.join(shotsDir, name), Buffer.from(s.result.data, "base64"));
    };

    for (const vp of VIEWPORTS) {
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} ===`);
      if (!(await loadPage(vp))) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      const panel = () =>
        evalJs(`(() => {
          const b = document.getElementById("quest-reward");
          const r = b.getBoundingClientRect();
          return {
            hidden: b.hidden,
            shown: b.getClientRects().length > 0,
            title: b.querySelector(".qr-title")?.textContent ?? null,
            lines: Array.from(b.querySelectorAll(".qr-line")).map((l) => ({ cls: l.className, text: l.querySelector("span")?.textContent ?? "", icoW: l.querySelector("i")?.getBoundingClientRect().width ?? 0, icoBg: getComputedStyle(l.querySelector("i")).backgroundImage })),
            ptr: getComputedStyle(b).pointerEvents,
            l: r.left, r: r.right, t: r.top, bt: r.bottom, vw: window.innerWidth, vh: window.innerHeight,
            scrollW: document.documentElement.scrollWidth,
          };
        })()`);

      // (1) tin thưởng thật: tu vi + vật phẩm có biểu tượng
      await evalJs(
        `window.__ui.onQuestReward(${JSON.stringify({ questId: "nhap_the", exp: 15, coin: 0, items: [{ itemId: "hoi_huyet_dan", qty: 3 }] })}); 1`,
      );
      await sleep(500);
      let p = await panel();
      check(p.shown && !p.hidden, "bảng thưởng HIỆN khi có tin questReward");
      check(p.title === "Hoàn thành: Nhập thế", `tiêu đề nói tên nhiệm vụ ("${p.title}")`);
      check(p.lines.length === 2, `đúng 2 dòng thưởng (${p.lines.length})`);
      check(p.lines[0]?.text === "+15 tu vi", `dòng tu vi: "${p.lines[0]?.text}"`);
      check(
        /^Hồi Huyết Đan ×3$/.test(p.lines[1]?.text ?? ""),
        `dòng vật phẩm có số lượng: "${p.lines[1]?.text}"`,
      );
      check(p.lines[1] && p.lines[1].icoW > 0, "vật phẩm có ô biểu tượng");
      check(p.ptr === "none", "bảng KHÔNG bắt chuột (không chặn thao tác)");
      check(
        p.l >= -0.5 && p.r <= p.vw + 0.5 && p.t >= 0 && p.bt <= p.vh + 0.5 && p.scrollW <= p.vw + 1,
        "bảng nằm gọn khung nhìn, không tràn ngang",
      );
      await shot(`nhiem-vu-bang-thuong-${vp.name}.webp`);

      // (2) hộp thoại NPC mở ngay sau đó (đúng thứ tự máy chủ gửi) vẫn bấm được dù bảng còn hiện
      await evalJs(
        `window.__ui.onDialog(${JSON.stringify({
          npcId: "truong_tran",
          lines: ["Làm tốt lắm."],
          options: [{ label: "Rời đi", action: { kind: "close" } }],
        })}); 1`,
      );
      await sleep(600);
      await evalJs(
        `document.getElementById("dlg-body").dispatchEvent(new Event("pointerdown")); 1`,
      );
      await sleep(200);
      const hit = await evalJs(`(() => {
        const btn = document.querySelector("#dlg-options button.dlg-opt-btn");
        if (!btn) return { ok: false, why: "không có nút" };
        const r = btn.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { ok: btn === el || btn.contains(el), who: el?.id || el?.className || el?.tagName };
      })()`);
      check(
        hit.ok,
        `nút trong hộp thoại bấm được khi bảng thưởng còn hiện (${hit.who ?? hit.why})`,
      );
      await evalJs(`window.__ui.closeDialog(); 1`);

      // (3) tin MỚI thay bảng cũ; tu vi 0 + Linh thạch: dòng chú thích / Linh thạch
      await evalJs(
        `window.__ui.onQuestReward(${JSON.stringify({ questId: "nhap_the", exp: 0, coin: 1200, items: [] })}); 1`,
      );
      await sleep(300);
      p = await panel();
      check(p.lines.length === 2, `bảng mới thay bảng cũ (${p.lines.length} dòng)`);
      check(
        /Đột phá/.test(p.lines[0]?.text ?? ""),
        `tu vi 0: nói rõ "đã đầy, cần Đột phá" ("${p.lines[0]?.text}")`,
      );
      check(
        /^\+1\.200 Linh thạch$/.test(p.lines[1]?.text ?? ""),
        `dòng Linh thạch: "${p.lines[1]?.text}"`,
      );

      // (4) tin hỏng: không đổi bảng, không lỗi
      await evalJs(`window.__ui.onQuestReward(null); window.__ui.onQuestReward({ questId: 5 }); 1`);
      p = await panel();
      check(p.lines.length === 2, "tin hỏng bị bỏ: bảng giữ nguyên");

      // (5) tự ẩn sau vài giây
      await sleep(6500);
      p = await panel();
      check(p.hidden && !p.shown, "bảng tự ẩn sau ~6 giây");
    }
  } finally {
    try {
      process.kill(-chrome.pid, "SIGKILL");
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
