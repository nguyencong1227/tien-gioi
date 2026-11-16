import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm HỘ THỂ 3 giây sau khi nối lại / được tha chết vì mạng (QUYET_DINH_M3 mục 33, `client/src/net-shield.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-net-shield.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Máy chủ gửi riêng chủ `netShield { ms, reason }` (giả lập bằng `WorldScene.onNetShield`): vầng sáng bám nhân vật MÌNH + chữ "Hộ thể 2,4s" đếm ngược trên đầu, tắt sau ~3 giây;
 * tin hỏng (không phải số, âm, vô cực, thiếu) bị bỏ; tin ngắn đến sau không rút ngắn hộ thể đang chạy. `--shots`: lưu ảnh mỗi khung nhìn.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-net-shield-"));
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
      // nhân vật đứng giữa quảng trường, camera canh giữa
      await evalJs(`(() => {
        const sc = window.__scene, t = sc.map.townPx, me = sc.me();
        me.x = t.x; me.y = t.y; sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0; sc.hasMe = true;
        sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(me.x, me.y);
        return 1;
      })()`);
      await sleep(400);
      const state = () =>
        evalJs(`(() => {
          const sc = window.__scene, ring = sc.shieldRing, txt = sc.shieldText;
          const mine = sc.players.get(sc.sid);
          return {
            ringVisible: !!ring && ring.visible,
            textVisible: !!txt && txt.visible,
            text: txt ? txt.text : "",
            dx: ring && mine ? Math.abs(ring.x - mine.root.x) : null,
            dy: ring && mine ? Math.abs(ring.y - mine.root.y) : null,
            below: txt && ring ? txt.y > ring.y : null,
          };
        })()`);

      console.log("  [1] chưa có tin netShield: không có vầng sáng");
      let st = await state();
      check(!st.ringVisible && !st.textVisible, "mặc định: không vầng sáng, không chữ");

      console.log(
        "  [2] netShield { ms: 3000, reason: resume }: vầng sáng quanh nhân vật mình + chữ đếm ngược, tắt sau ~3 giây",
      );
      const t0 = Date.now();
      await evalJs(`window.__scene.onNetShield({ ms: 3000, reason: "resume" })`);
      await sleep(350);
      st = await state();
      check(st.ringVisible && st.textVisible, "vầng sáng + chữ hiện");
      check(/^Hộ thể [0-3],\d+s$/.test(st.text), `chữ: "${st.text}"`);
      check(
        st.dx < 2 && st.dy < 2,
        `vầng sáng bám đúng nhân vật mình (lệch ${st.dx?.toFixed(1)}, ${st.dy?.toFixed(1)} px)`,
      );
      check(st.below === true, "chữ nằm DƯỚI chân (trên đầu đã có tên + cảnh giới)");
      await shot("ho-the");
      const secs1 = Number(
        st.text
          .match(/(\d+),(\d)/)
          ?.slice(1, 3)
          .join("."),
      );
      await sleep(1100);
      st = await state();
      const secs2 = Number(
        st.text
          .match(/(\d+),(\d)/)
          ?.slice(1, 3)
          .join("."),
      );
      check(secs2 < secs1, `chữ đếm ngược: ${secs1}s -> ${secs2}s`);
      // đứng yên chờ hết hạn
      let gone = -1;
      while (Date.now() - t0 < 5000) {
        st = await state();
        if (!st.ringVisible && !st.textVisible) {
          gone = Date.now() - t0;
          break;
        }
        await sleep(100);
      }
      check(gone >= 2800 && gone <= 3800, `hết hạn: vầng sáng + chữ tắt sau ${gone} ms (~3000)`);

      console.log(
        "  [3] tin hỏng bị bỏ; tin 'spared' cũng hiện; tin mới không rút ngắn hộ thể đang chạy",
      );
      for (const bad of [null, "3000", { ms: "x" }, { ms: -1 }, { ms: Infinity }, {}, []]) {
        await evalJs(`window.__scene.onNetShield(${JSON.stringify(bad)})`);
      }
      await sleep(200);
      st = await state();
      check(!st.ringVisible, "tin hỏng: không bật vầng sáng");
      await evalJs(`window.__scene.onNetShield({ ms: 3000, reason: "spared" })`);
      await sleep(200);
      check((await state()).ringVisible, "tin 'spared' (vừa được tha chết): hiện");
      await evalJs(`window.__scene.onNetShield({ ms: 300, reason: "resume" })`);
      await sleep(900);
      check((await state()).ringVisible, "tin ngắn đến sau KHÔNG rút ngắn hộ thể đang chạy");

      console.log("  [4] đường đăng ký tin: tin 'netShield' của máy chủ tới WorldScene");
      const wired = await evalJs(`typeof window.__scene.onNetShield === "function"`);
      check(
        wired,
        "WorldScene.onNetShield có mặt (đăng ký bằng NET_MSG.shield ở setupNetwork, test canh mã net-shield-wiring.test.ts)",
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
