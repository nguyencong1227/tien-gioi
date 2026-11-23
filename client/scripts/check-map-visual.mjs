import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm lớp HÌNH Tiled của bản đồ (S3b, #1206 / #1330 mục 67.1) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-map-visual.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Dựng một BẢN SAO của client/dist trong thư mục tạm (không đụng dist / public), rồi thử bốn tình huống bằng cách đổi gói `map:lac_ha` trong bản sao:
 *   (1) gói CÓ ảnh tileset + `visual.json` hợp lệ -> ba lớp hình (ground -10 / decor -9 / over worldH - 0.01, phóng 2 lần), lớp ô cũ + trang trí + nước KHÔNG còn;
 *   (1b) `?debug` KHÔNG kèm `?visual` -> vẽ cách cũ (mặc định tắt ở `?debug` để các script đo / E2E có cảnh ổn định);
 *   (1c) ô "Cảnh bản đồ kiểu mới" ở Cài đặt: lựa chọn '1' thắng mặc định tắt của `?debug`, bỏ tick -> nền cũ NGAY, tick lại -> lớp hình (làm mờ chuyển);
 *   (2) `?visual=0` -> vẽ cách cũ (cờ tắt thắng gói);
 *   (3) gói CHƯA có ảnh trong manifest -> vẽ cách cũ, không lỗi;
 *   (4) `visual.json` hỏng (hợp lệ về băm nhưng sai nội dung) -> vẽ cách cũ, không lỗi.
 * Ảnh tileset lấy ở dist nếu đã phát hành, không thì DỰNG bằng `client/scripts/art/dung-tileset-world.py` (cần Pillow + gói gốc Ninja Adventure ở /mnt/data):
 * thiếu thì bỏ qua (1) và chỉ kiểm các ca vẽ cách cũ. `--shots`: lưu ảnh toàn màn hình của ca (1).
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");
const MAP_ID = "lac_ha";

export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Dựng ảnh tileset của bản đồ vào `outDir` bằng script Python; trả đường dẫn tệp hoặc null (thiếu Pillow / gói gốc). */
function buildTileset(outDir) {
  const r = spawnSync(
    "python3",
    ["-I", path.join(REPO, "client/scripts/art/dung-tileset-world.py"), "--out", outDir],
    { encoding: "utf8" },
  );
  const f = path.join(outDir, `tileset_world_${MAP_ID}.png`);
  return r.status === 0 && fs.existsSync(f) ? f : null;
}

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  const onlyVp = process.argv.includes("--vp")
    ? process.argv[process.argv.indexOf("--vp") + 1]
    : null;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
  if (!fs.existsSync(path.join(DIST, "index.html")))
    throw new Error("Chưa có client/dist: chạy `npm run build -w client` trước.");

  // Bản sao dist để đổi gói mà không đụng bản thật
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-map-visual-"));
  const site = path.join(work, "site");
  fs.cpSync(DIST, site, { recursive: true });
  const packDir = path.join(site, "packs", `map-${MAP_ID}`);
  const manifestPath = path.join(site, "packs", "manifest.json");
  const manifest0 = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const visualPath = path.join(packDir, "visual.json");
  const visual0 = fs.readFileSync(visualPath);
  const imagePath = path.join(packDir, "tileset_world.png");
  let haveImage = fs.existsSync(imagePath);
  if (!haveImage) {
    const built = buildTileset(path.join(work, "img"));
    if (built) {
      fs.copyFileSync(built, imagePath);
      haveImage = true;
    }
  }
  const image0 = haveImage ? fs.readFileSync(imagePath) : null;

  /** Ghi lại manifest của bản sao: `image` = có ảnh tileset trong gói; `visualBuf` = nội dung `visual.json` (băm / cỡ khớp nội dung). */
  const setPack = ({ image, visualBuf }) => {
    fs.writeFileSync(visualPath, visualBuf);
    const m = JSON.parse(JSON.stringify(manifest0));
    const pack = m.packs.find((p) => p.id === `map:${MAP_ID}`);
    pack.files = pack.files.filter(
      (f) => f.path !== `map-${MAP_ID}/visual.json` && f.path !== `map-${MAP_ID}/tileset_world.png`,
    );
    pack.files.push({
      path: `map-${MAP_ID}/visual.json`,
      bytes: visualBuf.length,
      sha256: sha256(visualBuf),
    });
    if (image && image0)
      pack.files.push({
        path: `map-${MAP_ID}/tileset_world.png`,
        bytes: image0.length,
        sha256: sha256(image0),
      });
    pack.bytes = pack.files.reduce((a, f) => a + f.bytes, 0);
    fs.writeFileSync(manifestPath, JSON.stringify(m));
  };

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
    let filePath = path.join(site, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory())
      filePath = path.join(site, "index.html");
    try {
      res.writeHead(200, {
        "Content-Type": MIMES[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store",
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-map-visual-chrome-"));
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
    let exceptions = [];
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method === "Runtime.exceptionThrown") {
        exceptions.push(msg.params?.exceptionDetails?.exception?.description ?? "lỗi");
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

    /** Mở trang mock với `query`; chờ cảnh sẵn sàng và (nếu `waitVisual`) chờ ba lớp hình tối đa 8 giây. */
    const loadPage = async (vp, query, waitVisual) => {
      exceptions = [];
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1${query}`, // ?debug mặc định TẮT lớp hình: ca cần lớp hình truyền &visual=1
      });
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
      for (let i = 0; i < 40; i++) {
        const n = await evalJs("window.__scene.visualLayers.length");
        if (waitVisual ? n === 3 : i >= 12) break; // không chờ lớp hình thì đợi ~2,4 s cho gói về / bị bỏ
        await sleep(200);
      }
      await sleep(400);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      return true;
    };
    const state = () =>
      evalJs(`(() => {
        const s = window.__scene;
        return {
          layers: s.visualLayers.length,
          scale: s.visualLayers[0]?.scaleX ?? null,
          depths: s.visualLayers.map((l) => l.depth),
          alphas: s.visualLayers.map((l) => l.alpha),
          fades: s.visualFades,
          fxDepth: s.fx ? s.map.worldH : null,
          worldH: s.map.worldH,
          legacy: Boolean(s.mapLayer),
          decor: Boolean(s.decorLayer),
          water: Boolean(s.waterLayer),
          texW: s.textures.exists("map-visual:${MAP_ID}") ? s.textures.get("map-visual:${MAP_ID}").getSourceImage().width : 0,
        };
      })()`);
    const shot = async (name) => {
      if (!shotsDir) return;
      const s = await send("Page.captureScreenshot", { format: "webp", quality: 82 });
      fs.writeFileSync(path.join(shotsDir, name), Buffer.from(s.result.data, "base64"));
    };

    for (const vp of VIEWPORTS) {
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} ===`);

      // (1) gói có ảnh + visual.json hợp lệ -> ba lớp hình
      if (haveImage) {
        setPack({ image: true, visualBuf: visual0 });
        if (!(await loadPage(vp, "&visual=1", true))) {
          console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
          failures++;
          continue;
        }
        const s = await state();
        check(s.layers === 3, `gói có ảnh: ba lớp hình (ground / decor / over), có ${s.layers}`);
        check(s.scale === 2, `ô 16 px phóng đúng 2 lần (TILE 32): ${s.scale}`);
        check(
          s.depths.length === 3 &&
            s.depths[0] === -10 &&
            s.depths[1] === -9 &&
            s.depths[2] === s.worldH - 0.01,
          `độ sâu ground -10 / decor -9 / over worldH - 0.01 (trên thực thể, DƯỚI fx và nhãn): ${JSON.stringify(s.depths)}`,
        );
        check(s.fades === 1, `gói về muộn sau nền cũ: làm mờ chuyển ĐÚNG MỘT lần (${s.fades})`);
        check(!s.legacy && !s.decor && !s.water, "lớp ô cũ, trang trí cũ và nước cũ KHÔNG còn");
        await sleep(900); // làm mờ chuyển (350 ms) đã xong: lớp hình đặc hẳn, nền cũ đã gỡ khỏi danh sách hiển thị
        const done = await evalJs(`(() => {
          const s = window.__scene;
          const legacyAlive = s.children.list.filter((o) => o.type === "TilemapLayer" && !s.visualLayers.includes(o)).length;
          return { alphas: s.visualLayers.map((l) => l.alpha), legacyAlive };
        })()`);
        check(
          done.alphas.length === 3 && done.alphas.every((a) => a === 1),
          `sau khi làm mờ chuyển, ba lớp hình đặc hẳn (alpha 1): ${JSON.stringify(done.alphas)}`,
        );
        check(
          done.legacyAlive === 0,
          `không còn lớp ô cũ nào trong danh sách hiển thị (${done.legacyAlive})`,
        );
        check(s.texW === 396, `texture ảnh tileset nạp, rộng 396: ${s.texW}`);
        check(
          exceptions.length === 0,
          `không lỗi JS (${exceptions.length}): ${exceptions[0] ?? ""}`,
        );
        await shot(`ban-do-hinh-moi-${vp.name}.webp`);

        // (1b) ?debug KHÔNG kèm ?visual: mặc định TẮT (cảnh cũ ổn định cho các script đo / E2E dùng ?debug) dù gói có ảnh
        if (!(await loadPage(vp, "", false))) {
          failures++;
          continue;
        }
        const dbg = await state();
        check(dbg.layers === 0 && dbg.legacy, "?debug không kèm ?visual: vẽ cách cũ dù gói có ảnh");

        // (1c) ô "Cảnh bản đồ kiểu mới" ở Cài đặt: lựa chọn RÕ RÀNG ('1') thắng mặc định tắt của ?debug; bấm ô thì cảnh đổi NGAY (không tải lại trang)
        await evalJs(`localStorage.setItem("tg.mapVisual", "1"); 1`);
        if (!(await loadPage(vp, "", true))) {
          failures++;
          continue;
        }
        const pref = await state();
        const chk0 = await evalJs(`document.getElementById("set-map-visual")?.checked`);
        check(
          pref.layers === 3 && chk0 === true,
          `?debug + lựa chọn '1' ở Cài đặt: lớp hình bật, ô được tick (${pref.layers} lớp, ô: ${chk0})`,
        );
        await evalJs(`document.getElementById("set-map-visual").click(); 1`);
        await sleep(700);
        const offNow = await state();
        check(
          offNow.layers === 0 && offNow.legacy,
          "bỏ tick ô Cài đặt: về nền cũ NGAY, không cần tải lại",
        );
        check(
          (await evalJs(`localStorage.getItem("tg.mapVisual")`)) === "0",
          "lựa chọn được lưu ('0') để lần sau vẫn tắt",
        );
        await evalJs(`document.getElementById("set-map-visual").click(); 1`);
        await sleep(1500);
        const onAgain = await state();
        check(
          onAgain.layers === 3 && !onAgain.legacy,
          `tick lại: lớp hình về (làm mờ chuyển), nền cũ gỡ (${onAgain.layers} lớp)`,
        );
        check(onAgain.fades >= 2, `làm mờ chuyển lần thứ hai khi bật lại (${onAgain.fades})`);
        check(
          exceptions.length === 0,
          `không lỗi JS khi bật / tắt ở Cài đặt (${exceptions.length}): ${exceptions[0] ?? ""}`,
        );
        await evalJs(`localStorage.removeItem("tg.mapVisual"); 1`);

        // (2) cờ tắt thắng gói
        if (!(await loadPage(vp, "&visual=0", false))) {
          failures++;
          continue;
        }
        const off = await state();
        check(off.layers === 0 && off.legacy, "?visual=0: vẽ cách cũ dù gói có ảnh");
        await shot(`ban-do-cach-cu-${vp.name}.webp`);
      } else {
        console.log(
          "  (bỏ qua ca có ảnh: thiếu Pillow / gói gốc Ninja Adventure để dựng ảnh tileset)",
        );
      }

      // (3) gói chưa có ảnh trong manifest
      setPack({ image: false, visualBuf: visual0 });
      if (!(await loadPage(vp, "&visual=1", false))) {
        failures++;
        continue;
      }
      const noImg = await state();
      check(noImg.layers === 0 && noImg.legacy, "gói CHƯA có ảnh: vẽ cách cũ");
      check(exceptions.length === 0, `không lỗi JS khi gói thiếu ảnh (${exceptions.length})`);

      // (4) visual.json hỏng (băm khớp nội dung, nhưng nội dung sai)
      if (haveImage) {
        setPack({ image: true, visualBuf: Buffer.from('{"width":96,"height":96,"layers":"x"}') });
        if (!(await loadPage(vp, "&visual=1", false))) {
          failures++;
          continue;
        }
        const bad = await state();
        check(bad.layers === 0 && bad.legacy, "visual.json hỏng: vẽ cách cũ");
        check(exceptions.length === 0, `không lỗi JS khi visual.json hỏng (${exceptions.length})`);
      }
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
    for (const d of [tmp, work]) {
      try {
        fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // bỏ qua
      }
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
