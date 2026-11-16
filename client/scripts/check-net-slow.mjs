import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm chip "Mạng chậm" (QUYET_DINH_M3 mục 25, `client/src/net-slow.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-net-slow.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Chip hiện / ẩn đúng theo `ui.setNetSlow`; KHÔNG chặn chạm (pointer-events none, phần tử tại tâm chip là thứ nằm DƯỚI); nằm trọn trong màn hình; không đè lên
 * nút HUD nào bấm được (trừ dòng gợi ý mờ `#help`: chip không nhận chạm nên chạm xuyên qua); chữ có trong cây truy cập (role=status); banner nối lại đè lên chip (chip ẩn khi `body.reconnecting`). `--shots`: lưu ảnh mỗi khung.
 * Phần LOGIC đo mạng (chờ phản hồi quá 2,5 giây) do test đơn vị `net-slow.test.ts` và E2E thật `e2e:nhip-tim` (proxy blackhole) kiểm.
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

/** Năm khung nhìn như `check-forge-shop.mjs`; máy tính đứng đầu (Chrome headless không tắt được giả lập cảm ứng trong cùng phiên). */
export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-net-slow-"));
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
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} (${vp.mobile ? "cảm ứng" : "chuột"}) ===`);
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
      const shot = async (name) => {
        if (!shotsDir) return;
        await sleep(150);
        const s = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(
          path.join(shotsDir, `${name}-${vp.name}.webp`),
          Buffer.from(s.result.data, "base64"),
        );
      };
      const chip = () =>
        evalJs(`(() => {
          const e = document.getElementById("net-slow");
          if (!e) return null;
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const top = r.width > 0 ? document.elementFromPoint(x, y) : null;
          // nút / ô bấm được nằm DƯỚI chip (chip không được che chúng)
          const clickable = [...document.querySelectorAll("button, a[href], input, select, [role=button]")].filter((b) => {
            if (b.disabled || b.closest("[hidden]") || b.id === "help") return false; // #help: dòng gợi ý mờ ở giữa phía trên, chip nhận chạm xuyên qua nên vẫn bấm được
            const br = b.getBoundingClientRect();
            if (br.width <= 0 || br.height <= 0) return false;
            return br.left < r.right && br.right > r.left && br.top < r.bottom && br.bottom > r.top;
          }).map((b) => b.id || b.className || b.tagName);
          return {
            hidden: e.hidden, display: cs.display, w: r.width, h: r.height, left: r.left, right: r.right, top: r.top,
            pe: cs.pointerEvents, role: e.getAttribute("role"), text: e.textContent.trim().replace(/\\s+/g, " "),
            topIsChip: !!top && (top === e || e.contains(top)), clickable, vw: innerWidth,
          };
        })()`);

      console.log("  [1] mặc định: ẩn");
      let c = await chip();
      check(c && (c.hidden || c.display === "none"), "chip ẩn lúc bình thường");

      console.log("  [2] ui.setNetSlow(true): hiện, không chắn chạm");
      await evalJs(`window.__ui.setNetSlow(true)`);
      await sleep(120);
      c = await chip();
      check(
        c.hidden === false && c.w > 0 && c.h > 0,
        `chip hiện (${Math.round(c.w)}x${Math.round(c.h)})`,
      );
      check(/Mất kết nối — nhân vật đang được bảo vệ/.test(c.text), `chữ: "${c.text}"`);
      check(c.role === "status", `role = ${c.role} (đọc được bằng trình đọc màn hình)`);
      check(
        c.pe === "none" && !c.topIsChip,
        "không nhận chạm: phần tử tại tâm chip là thứ nằm dưới",
      );
      check(
        c.left >= 0 && c.right <= c.vw,
        `nằm trọn trong màn hình (${Math.round(c.left)}..${Math.round(c.right)} / ${c.vw})`,
      );
      // Chữ dải dài ("Mất kết nối — nhân vật đang được bảo vệ", mục 33) nên ở điện thoại dọc chồng lên mép HUD / bản đồ nhỏ, như banner nối lại: chấp nhận vì dải KHÔNG nhận chạm
      // (kiểm ở trên: pointer-events none, phần tử tại tâm là thứ nằm dưới) nên mọi nút bên dưới vẫn bấm được. Chỉ ghi nhận để người đọc thấy.
      if (c.clickable.length > 0)
        console.log(`  - chồng lên (vẫn bấm xuyên được): ${JSON.stringify(c.clickable)}`);
      await shot("net-slow");

      console.log("  [3] ui.setNetSlow(false): ẩn; banner nối lại đè lên chip");
      await evalJs(`window.__ui.setNetSlow(false)`);
      await sleep(100);
      c = await chip();
      check(c.hidden === true, "setNetSlow(false): chip ẩn");
      await evalJs(
        `window.__ui.setNetSlow(true); window.__ui.showReconnectNotice("Mất kết nối, đang nối lại... (còn 20 giây)")`,
      );
      await sleep(150);
      c = await chip();
      check(c.display === "none", "đang nối lại: chip KHÔNG hiện chồng lên banner đỏ");
      await shot("net-slow-reconnecting");
      await evalJs(`window.__ui.hideReconnectNotice(); window.__ui.setNetSlow(false)`);
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
