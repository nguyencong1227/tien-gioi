// E2E THẬT Scale Manager + DPR + giới hạn FPS (M5, Issue #324): server Colyseus thật + Chrome headless + client đã build.
// Kiểm trong phiên chơi thật: canvas = khung nhìn logic x renderScale ở DPR 1 / 2 / 3 (đổi DPR LÚC CHẠY, không tải lại), kích thước
// hiển thị = khung nhìn logic, toạ độ chạm đúng (con trỏ = CSS x renderScale; điểm thế giới dưới con trỏ so với người chơi KHÔNG đổi theo DPR),
// đổi chất lượng đổi renderScale, xoay máy, màn 4K không phá vùng nhìn của server (VIEW_ENTER = 1100), Tiết kiệm pin ra đúng ~30 FPS
// (ngưỡng Phaser 30 ra ~21 FPS) rồi trả về ~60 FPS, 0 lỗi console.
// Chạy: `npm run build && npm run e2e:dpr -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  Tab,
  sleep,
  shown,
  killChrome,
  removeTmpDirs,
  listenWithRetry,
  getChromeGpuFlags,
} from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 38000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

async function main() {
  out("=== E2E THẬT Scale + DPR + FPS: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-dpr-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-dpr-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  // Lỗi listen (cổng bận) phải thành lỗi THẬT (e2e-kit.listenWithRetry): `new Promise((r) => server.listen(PORT, r))` không bao giờ resolve khi cổng bận
  // nên script thoát mã 0 không in gì (false green) và sót thư mục tạm. Cổng ngẫu nhiên bận thì thử cổng khác.
  try {
    PORT = await listenWithRetry(httpServer, PORT, { explicit: false, pick: pickPort });
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  try {
    chrome = spawn(
      "google-chrome",
      [
        "--headless=new",
        "--no-sandbox",
        ...getChromeGpuFlags(),
        `--remote-debugging-port=${CDP}`,
        `--user-data-dir=${chromeDir}`,
        "--window-size=1280,720",
        "about:blank",
      ],
      { stdio: "ignore", detached: true },
    );
    let targets: any[] = [];
    for (const start = Date.now(); Date.now() - start < 8000;) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP}/json`);
        if (res.ok) {
          targets = (await res.json()) as any[];
          break;
        }
      } catch {
        await sleep(150);
      }
    }
    const first = targets.find((t) => t.type === "page");
    if (!first?.webSocketDebuggerUrl) throw new Error("Không kết nối được Chrome DevTools");
    tab = await Tab.open("A", first.webSocketDebuggerUrl);
    const T = tab;

    const NAME = "Do Phan Giai"; // ca 3 dùng đạo hiệu khác: ca 2 vừa rời phòng, nhân vật cũ còn trong thời gian chờ nối lại
    const SECRET = "e2e_secret_dpr_11111111111";
    let scriptId: string | null = null;
    const setStorage = async (extra: string) => {
      if (scriptId)
        await T.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
      const r = await T.send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)});` +
          ` localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)}); ${extra}`,
      });
      scriptId = String(r.result?.identifier ?? "");
    };
    const login = async (url: string) => {
      await T.send("Page.navigate", { url });
      await T.waitFor(
        `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
        "form đăng nhập",
      );
      await T.ev(
        `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME)}; document.getElementById('login-form').requestSubmit(); 1`,
      );
      await T.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "vào game thành công",
      );
    };
    const setQuality = (v: string) =>
      T.ev(
        `(() => { const s = document.getElementById('set-quality'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })(); 1`,
      );
    const setCheck = (id: string, on: boolean) =>
      T.ev(
        `(() => { const c = document.getElementById(${JSON.stringify(id)}); c.checked = ${on}; c.dispatchEvent(new Event('change')); })(); 1`,
      );

    const metrics = (w: number, h: number, dpr: number) =>
      T.send("Emulation.setDeviceMetricsOverride", {
        width: w,
        height: h,
        deviceScaleFactor: dpr,
        mobile: false,
      });
    const probe = async () =>
      (await T.ev(`(() => { const g = window.__scene.game, c = g.canvas, r = c.getBoundingClientRect(), cam = window.__scene.cameras.main;
        return { cw: c.width, ch: c.height, sw: c.style.width, sh: c.style.height, rw: Math.round(r.width), rh: Math.round(r.height),
          disp: g.scale.displayScale.x, zoom: cam.zoom, vw: cam.worldView.width, vh: cam.worldView.height, dpr: devicePixelRatio,
          rs: Math.round(c.width / innerWidth * 100) / 100 }; })()`)) as any;
    const waitCanvas = (w: number, h: number, label: string) =>
      T.waitFor(
        `(() => { const c = window.__scene?.game?.canvas; return !!c && c.width === ${w} && c.height === ${h}; })()`,
        label,
        8000,
      );
    const move = async (x: number, y: number) => {
      await T.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
      await sleep(120);
    };
    // Chạm vào CHÍNH người chơi: vị trí CSS của người chơi tính độc lập từ DOM (canvas.width / rect.width) + worldView + zoom của camera;
    // chạm đúng chỗ đó thì điểm thế giới Phaser trả về PHẢI trùng vị trí người chơi (kiểm cả chuỗi DOM -> con trỏ -> camera -> thế giới)
    // Dung sai 3 px thế giới: CDP CẮT phần lẻ toạ độ chuột (về số nguyên) (sai <= 1 CSS px); lỗi nhân đôi do DPR sẽ lệch hàng trăm px
    const clickOnPlayer = async () => {
      // Camera bám người chơi có độ trễ và bị chặn bởi biên bản đồ: dừng bám và đợi ổn định để worldView không đổi giữa hai lần đọc
      await T.ev(
        `(() => { const s = window.__scene; s.cameras.main.stopFollow(); s.cameras.main.centerOn(s.predX, s.predY); })(); 1`,
      );
      await sleep(250);
      const t =
        (await T.ev(`(() => { const s = window.__scene, c = s.game.canvas, r = c.getBoundingClientRect(), cam = s.cameras.main,
        rs = c.width / r.width, wv = cam.worldView;
        return { x: r.left + (s.predX - wv.x) * cam.zoom / rs, y: r.top + (s.predY - wv.y) * cam.zoom / rs, rs }; })()`)) as any;
      await move(t.x, t.y);
      const p =
        (await T.ev(`(() => { const s = window.__scene, p = s.input.activePointer, w = s.cameras.main.getWorldPoint(p.x, p.y);
        return { px: p.x, py: p.y, ex: w.x - s.predX, ey: w.y - s.predY }; })()`)) as any;
      return { ...p, cssX: t.x, cssY: t.y, rs: t.rs };
    };
    const stepRate = async (ms = 2500) => {
      await T.ev(
        `window.__steps = 0; if (!window.__stepHook) { window.__stepHook = true; window.__scene.game.events.on('step', () => { window.__steps++; }); } 1`,
      );
      await sleep(ms);
      return Number(await T.ev(`window.__steps`)) / (ms / 1000);
    };

    // ---------------- Ca 1: DPR 1 -> 2 -> 3 LÚC CHẠY (bậc Cao ép bằng tg_quality) ----------------
    out("\n--- Ca 1: canvas theo DPR (bậc Cao, 1280x720), đổi DPR không tải lại ---");
    await setStorage('localStorage.setItem("tg_quality", "high");');
    await metrics(1280, 720, 1);
    await login(`http://127.0.0.1:${PORT}/?debug`);
    await waitCanvas(1280, 720, "canvas 1280x720 ở DPR 1");
    let a = await probe();
    must(
      a.sw === "1280px" && a.sh === "720px" && a.rw === 1280 && a.rh === 720,
      `kích thước hiển thị = khung nhìn logic: ${JSON.stringify(a)}`,
    );
    must(Math.abs(a.zoom - 1.125) < 1e-6, `zoom DPR 1 = fitZoom(1280x720) = 1,125, thấy ${a.zoom}`);
    ok(`DPR 1: canvas ${a.cw}x${a.ch}, hiển thị ${a.sw}x${a.sh}, zoom ${a.zoom}`);
    const c1 = await clickOnPlayer();
    must(
      Math.abs(c1.px - Math.floor(c1.cssX) * c1.rs) <= 1 &&
        Math.abs(c1.py - Math.floor(c1.cssY) * c1.rs) <= 1,
      `DPR 1: con trỏ = CSS x 1: ${JSON.stringify(c1)}`,
    );
    must(
      Math.hypot(c1.ex, c1.ey) < 3,
      `DPR 1: chạm vào người chơi ra đúng vị trí người chơi (lệch ${Math.hypot(c1.ex, c1.ey).toFixed(2)} px): ${JSON.stringify(c1)}`,
    );

    // Giả lập CDP KHÔNG phát `resize` / `resolution` khi chỉ đổi DPR (trình duyệt thật có; pointerdown cũng đọc lại): lệch 1 px bề rộng
    // để chạy đường cập nhật theo DPR của display.ts -> attachScale
    await metrics(1281, 720, 2);
    await waitCanvas(2562, 1440, "canvas 2562x1440 sau khi đổi DPR 1 -> 2 (không tải lại)");
    a = await probe();
    must(
      a.sw === "1281px" && a.sh === "720px" && a.rw === 1281 && a.rh === 720,
      `DPR 2: hiển thị vẫn 1281x720 (= khung nhìn logic): ${JSON.stringify(a)}`,
    );
    must(Math.abs(a.disp - 2) < 1e-6, `displayScale = 2, thấy ${a.disp}`);
    must(Math.abs(a.zoom - 2.25) < 1e-6, `camera zoom = fitZoom x 2 = 2,25, thấy ${a.zoom}`);
    must(
      Math.abs(a.vw - 1281 / 1.125) < 0.5 && Math.abs(a.vh - 720 / 1.125) < 0.5,
      `vùng nhìn thế giới KHÔNG đổi theo DPR: ${a.vw}x${a.vh}`,
    );
    ok(
      `DPR 2: canvas ${a.cw}x${a.ch}, hiển thị ${a.sw}x${a.sh}, displayScale ${a.disp}, zoom ${a.zoom}, vùng nhìn ${a.vw.toFixed(0)}x${a.vh.toFixed(0)}`,
    );
    const c2 = await clickOnPlayer();
    must(Math.abs(c2.rs - 2) < 0.01, `DPR 2: canvas / hiển thị = 2: ${JSON.stringify(c2)}`);
    must(
      Math.abs(c2.px - Math.floor(c2.cssX) * 2) <= 1 &&
        Math.abs(c2.py - Math.floor(c2.cssY) * 2) <= 1,
      `DPR 2: con trỏ = CSS x 2: ${JSON.stringify(c2)}`,
    );
    must(
      Math.hypot(c2.ex, c2.ey) < 3,
      `DPR 2: chạm vào người chơi ra đúng vị trí người chơi (lệch ${Math.hypot(c2.ex, c2.ey).toFixed(2)} px): ${JSON.stringify(c2)}`,
    );
    ok(
      `toạ độ chạm đúng: CSS (${c2.cssX.toFixed(0)},${c2.cssY.toFixed(0)}) -> con trỏ (${c2.px.toFixed(0)},${c2.py.toFixed(0)}) -> thế giới lệch ${Math.hypot(c2.ex, c2.ey).toFixed(2)} px so với người chơi`,
    );

    await metrics(1282, 720, 3);
    await waitCanvas(2564, 1440, "DPR 3 bậc Cao: renderScale chặn ở 2 -> 2564x1440");
    a = await probe();
    must(a.sw === "1282px", `DPR 3 bậc Cao: hiển thị 1282px: ${JSON.stringify(a)}`);
    ok("DPR 3 + bậc Cao: renderScale chặn ở 2 (canvas 2564x1440, hiển thị 1282x720)");
    const c3 = await clickOnPlayer();
    must(
      Math.hypot(c3.ex, c3.ey) < 3,
      `DPR 3: chạm vào người chơi ra đúng vị trí (lệch ${Math.hypot(c3.ex, c3.ey).toFixed(2)} px): ${JSON.stringify(c3)}`,
    );
    ok(`DPR 3: chạm đúng (lệch ${Math.hypot(c3.ex, c3.ey).toFixed(2)} px)`);

    // ---------------- Ca 2: đổi chất lượng đổi renderScale ----------------
    out("\n--- Ca 2: đổi chất lượng đổi renderScale (DPR 3) ---");
    await T.ev(`document.getElementById('btn-settings').click(); 1`);
    await T.waitFor(shown("set-quality"), "ô chất lượng hiện");
    await setQuality("mid");
    await waitCanvas(1923, 1080, "Vừa: renderScale 1,5 -> 1923x1080");
    ok("Vừa: renderScale 1,5, canvas 1923x1080");
    await setQuality("low");
    await waitCanvas(1282, 720, "Thấp: renderScale 1 -> 1282x720");
    a = await probe();
    must(
      a.sw === "1282px" && Math.abs(a.zoom - 1.125) < 1e-6,
      `Thấp: hiển thị 1282px, zoom 1,125: ${JSON.stringify(a)}`,
    );
    ok("Thấp: renderScale 1, canvas 1282x720");
    await setQuality("high");
    await waitCanvas(2564, 1440, "Cao: về 2564x1440");

    // ---------------- Ca 3: điện thoại + xoay máy ----------------
    out("\n--- Ca 3: điện thoại 390x844 DPR 3 và xoay ngang ---");
    await metrics(390, 844, 3);
    await waitCanvas(780, 1688, "điện thoại dọc: 780x1688 (renderScale 2)");
    a = await probe();
    must(
      a.sw === "390px" && a.sh === "844px",
      `điện thoại: hiển thị 390x844: ${JSON.stringify(a)}`,
    );
    ok(`điện thoại dọc: canvas ${a.cw}x${a.ch}, hiển thị ${a.sw}x${a.sh}`);
    await metrics(844, 390, 3);
    await waitCanvas(1688, 780, "xoay ngang: 1688x780");
    a = await probe();
    must(
      a.sw === "844px" && a.sh === "390px",
      `xoay ngang: hiển thị 844x390: ${JSON.stringify(a)}`,
    );
    ok(`xoay ngang: canvas ${a.cw}x${a.ch}, hiển thị ${a.sw}x${a.sh}`);

    // ---------------- Ca 4: 4K không phá vùng nhìn của server ----------------
    out("\n--- Ca 4: 4K 3840x2160 DPR 1 (bậc Cao, trần 4,2 M điểm ảnh) ---");
    await metrics(3840, 2160, 1);
    await sleep(800);
    a = await probe();
    must(a.cw * a.ch <= 4_200_000 + 4000, `tổng điểm ảnh canvas <= maxPixels: ${a.cw * a.ch}`);
    must(a.rw === 3840 && a.rh === 2160, `hiển thị đúng 3840x2160: ${JSON.stringify(a)}`);
    must(
      a.vw <= 1900 + 1 && a.vh <= 1100 + 1,
      `vùng nhìn thế giới <= 1900x1100 (VIEW_ENTER = 1100): ${a.vw.toFixed(1)}x${a.vh.toFixed(1)}`,
    );
    ok(
      `4K: canvas ${a.cw}x${a.ch} (${((a.cw * a.ch) / 1e6).toFixed(2)} M điểm ảnh), vùng nhìn ${a.vw.toFixed(0)}x${a.vh.toFixed(0)} <= 1900x1100`,
    );
    await metrics(1280, 720, 1);
    await waitCanvas(1280, 720, "về 1280x720");

    // ---------------- Ca 5: Tiết kiệm pin = ~30 FPS, đổi lúc chạy ----------------
    out("\n--- Ca 5: Tiết kiệm pin đổi giới hạn FPS lúc chạy ---");
    // Khung NHỎ: ca này kiểm giới hạn FPS (fps.limit), không kiểm tốc độ vẽ. Chrome headless vẽ bằng phần mềm (SwiftShader): ở 1280x720
    // bậc Cao trò chơi chỉ ~25-33 FPS (đo 12/11 17:30, cả ở commit 0c17203 lúc viết E2E này đo được 59,6), nên ngưỡng 52-70 đỏ vì máy,
    // không vì mã. 480x270 vẽ đủ nhanh để đạt trần 60 và 30 => ngưỡng đo đúng cái cần kiểm.
    await metrics(480, 270, 1);
    await waitCanvas(480, 270, "khung nhỏ 480x270");
    await sleep(500);
    const f0 = await stepRate();
    must(f0 > 52 && f0 < 70, `mặc định ~60 FPS, đo ${f0.toFixed(1)}`);
    await setCheck("set-battery-saver", true);
    await sleep(600);
    const f1 = await stepRate();
    must(
      f1 > 26 && f1 < 34,
      `Tiết kiệm pin ~30 FPS (ngưỡng 30 của Phaser ra ~21), đo ${f1.toFixed(1)}`,
    );
    await setCheck("set-battery-saver", false);
    await sleep(600);
    const f2 = await stepRate();
    must(f2 > 52 && f2 < 70, `tắt Tiết kiệm pin về ~60 FPS, đo ${f2.toFixed(1)}`);
    ok(`FPS: mặc định ${f0.toFixed(1)} -> tiết kiệm pin ${f1.toFixed(1)} -> tắt ${f2.toFixed(1)}`);

    must(T.errors.length === 0, `Không được có lỗi console / exception: ${T.errors.join(" | ")}`);
    ok("0 lỗi console / exception trong toàn bộ E2E");
    out("\n=== E2E SCALE + DPR + FPS ĐẠT ===");
  } catch (e) {
    failed = e instanceof Error ? e.message : String(e);
    out(`\n✗ THẤT BẠI: ${failed}`);
  } finally {
    if (tab) {
      try {
        await tab.close();
      } catch {
        /* bỏ qua */
      }
    }
    killChrome(chrome); // cả nhóm tiến trình (detached), không chỉ tiến trình gốc
    await new Promise<void>((r) => httpServer.close(() => r()));
    // false: mặc định Colyseus GỌI process.exit ngay trong gracefullyShutdown nên các dòng dọn dẹp phía sau không bao giờ chạy (sót thư mục /tmp/tien-gioi-e2e-*)
    await gameServer.gracefullyShutdown(false);
    await removeTmpDirs(dataDir, chromeDir);
  }
  if (failed) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi thực thi main:", err);
  process.exit(1);
});
