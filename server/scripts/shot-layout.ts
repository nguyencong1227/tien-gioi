// Chụp BỐ CỤC giao diện ở nhiều cỡ màn hình để so ảnh trước / sau (QUYET_DINH_M3 mục 15): server Colyseus thật + Chrome headless + client đã build.
// Dựng một màn chơi "đông" như người dùng gặp: tổ đội 3 người, hai nhiệm vụ, chat nhiều dòng, rồi chụp ở 6 cỡ: điện thoại dọc 360x640 và 412x915,
// điện thoại ngang 915x412, cửa sổ hẹp ~550x900 (như ảnh người dùng gửi), máy tính 1366x768 và 1920x1080. Mỗi ảnh kèm số đo diện tích các bảng nổi
// (chiếm bao nhiêu % chiều rộng / chiều cao khung nhìn) in ra bảng để đối chiếu với ngân sách ~25-30 % chiều rộng.
// Chạy: `npm run build -w client && npm run shot:layout -w server -- <thư-mục-ảnh> [nhãn]` (cần google-chrome). Ảnh: `<nhãn>-<rộng>x<cao>.png`.
// Không phải test: không có kiểm đỏ / xanh, chỉ sinh ảnh + bảng số đo.
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";
import { PANELS, VIEWPORTS, applyViewport, crowdHud } from "./layout-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 38000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

async function main() {
  const outDir = path.resolve(process.argv[2] ?? "/tmp/tg-layout-shots");
  const tag = process.argv[3] ?? "anh";
  mkdirSync(outDir, { recursive: true });
  out("=== Chụp bố cục nhiều cỡ màn hình: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-shot-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-shot-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  try {
    PORT = await listenWithRetry(httpServer, PORT, { explicit: false, pick: pickPort });
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
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
      { stdio: "ignore" },
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
    const NAME = "Cu Ky Anh Anh";
    const SECRET = "e2e_secret_shot_layout_abcdef";
    await T.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
    });
    await T.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug` });
    await T.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    await T.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game",
    );
    await sleep(800);

    // Dựng màn chơi "đông": tổ đội 3 người, 2 nhiệm vụ đang làm, chat nhiều dòng (đúng kiểu ảnh người dùng gửi)
    await crowdHud(T, NAME);

    const rows: string[] = [];
    for (const v of VIEWPORTS) {
      await applyViewport(T, v);
      const info = await T.ev(`(() => {
        const R = document.documentElement, W = innerWidth, H = innerHeight;
        const m = {};
        for (const id of ${JSON.stringify(PANELS)}) {
          const e = document.getElementById(id);
          if (!e || e.hidden || e.getClientRects().length === 0) { m[id] = null; continue; }
          const b = e.getBoundingClientRect();
          m[id] = { w: Math.round(b.width), h: Math.round(b.height), l: Math.round(b.left), t: Math.round(b.top) };
        }
        return { W, H, form: R.dataset.form, orient: R.dataset.orient, input: R.dataset.input, m };
      })()`);
      const file = path.join(outDir, `${tag}-${v.w}x${v.h}.png`);
      const r = await T.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(r.result.data, "base64"));
      const col = info.m["hud-col-left"];
      const colTxt = col
        ? `${Math.round((col.w / info.W) * 100)}% rộng x ${Math.round((col.h / info.H) * 100)}% cao`
        : "ẩn";
      const part = (id: string) => {
        const p = info.m[id];
        return p ? `${id} ${p.w}x${p.h}` : `${id} ẩn`;
      };
      rows.push(
        `| ${v.w}x${v.h} | ${info.form}/${info.orient}/${info.input} | ${colTxt} | ${part("hud")} · ${part("party-panel")} · ${part("quest-tracker")} · ${part("chat")} |`,
      );
      out(`  chụp ${path.basename(file)} (${v.note}): cột trái ${colTxt}`);
    }
    out(
      "\n| Khung nhìn | form / hướng / nhập | Cột trái (HUD + đội + nhiệm vụ) | Kích thước từng bảng (px) |",
    );
    out("|---|---|---|---|");
    for (const r of rows) out(r);
    out(`\nẢnh lưu ở ${outDir}`);
  } catch (e) {
    failed = (e as Error).message;
  } finally {
    tab?.close();
    chrome?.kill();
    await gameServer.gracefullyShutdown(false).catch(() => {});
    httpServer.close();
    await sleep(600);
    await removeTmpDirs(dataDir, chromeDir);
  }
  if (failed) {
    out(`\n❌ CHỤP BỐ CỤC THẤT BẠI: ${failed}`);
    process.exit(1);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
