// E2E THẬT phiên bản giao thức (M4 2.5): server Colyseus thật nâng `WorldRoom.minProtocol` lên cao hơn client, Chrome headless mở client
// thật. Luồng: client cũ vào -> màn hình "Phiên Bản Đã Cũ" (KHÔNG thử lại, không tạo nhân vật) -> server hạ mức -> bấm "Tải Lại Trang"
// -> vào game được. Chạy: `npm run build && npm run e2e:phien-ban -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PROTOCOL_VERSION } from "@tien-gioi/shared";
import { Tab, sleep } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const PORT = 36000 + Math.floor(Math.random() * 4000);
const CDP = 9500 + Math.floor(Math.random() * 400);
const out = (m: string) => console.log(m);
const NAME = "Cu Ky Phien Ban";
const SECRET = "e2e_secret_phien_ban_abcdefghij";

async function main() {
  out("=== E2E THẬT phiên bản giao thức: Chrome headless + server Colyseus thật ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-ver-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-ver-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom.js");

  // Đếm số lần onAuth được gọi: client "quá cũ" chỉ được thử ĐÚNG MỘT lần (không vòng thử lại)
  let authCalls = 0;
  const realOnAuth = WorldRoom.prototype.onAuth;
  WorldRoom.prototype.onAuth = function (this: any, ...a: Parameters<typeof realOnAuth>) {
    authCalls++;
    return realOnAuth.apply(this, a);
  };
  WorldRoom.minProtocol = PROTOCOL_VERSION + 1; // client này (v = PROTOCOL_VERSION) trở thành "quá cũ"

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
  out(
    `- Server E2E: http://127.0.0.1:${PORT} (client v${PROTOCOL_VERSION}, server yêu cầu >= v${WorldRoom.minProtocol})`,
  );

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
  try {
    chrome = spawn(
      "google-chrome",
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
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
    await tab.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
    });
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);

    // 1. Client quá cũ: màn hình cập nhật hiện ra
    // Phải THẤY thật: `hidden` của phần tử cha (vd #ui chưa vào game) làm modal biến mất mà `m.hidden` vẫn false
    await tab.waitFor(
      `(() => {
        const m = document.getElementById('outdated-modal');
        if (!m || m.hidden || !m.checkVisibility()) return false;
        const r = m.getBoundingClientRect();
        if (r.width < 100 || r.height < 60) return false;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const login = document.getElementById('login');
        return !!top && m.contains(top) && !(login && login.checkVisibility());
      })()`,
      "màn hình 'Phiên Bản Đã Cũ' (nhìn thấy thật, không bị che, màn hình đăng nhập đã ẩn)",
    );
    const msg = String(await tab.ev(`document.getElementById('outdated-msg')?.textContent ?? ''`));
    if (!msg.includes(`v${PROTOCOL_VERSION + 1}`))
      throw new Error(`Thông báo không nêu mức tối thiểu v${PROTOCOL_VERSION + 1}: "${msg}"`);
    const inGame = await tab.ev(`!document.getElementById('ui')?.hidden && !!window.__scene?.room`);
    if (inGame) throw new Error("Client quá cũ mà vẫn vào được game");
    out(
      `  ✓ [1/4] Server yêu cầu v${PROTOCOL_VERSION + 1}: client v${PROTOCOL_VERSION} thấy màn hình cập nhật ("${msg.slice(0, 60)}...")`,
    );

    // 2. Không thử lại, không tạo nhân vật
    await sleep(2500);
    if (authCalls !== 1)
      throw new Error(
        `Client thử vào ${authCalls} lần (phải đúng 1: lỗi dứt khoát, không vòng thử lại)`,
      );
    const files = readdirSync(dataDir).filter((f) => f.endsWith(".json"));
    if (files.length !== 0)
      throw new Error(`Bị từ chối ở onAuth mà vẫn có hồ sơ: ${files.join(", ")}`);
    out("  ✓ [2/4] Đúng 1 lần thử vào (không vòng thử lại), không tạo hồ sơ nhân vật");

    // 3. Server hạ mức, bấm "Tải Lại Trang": tải lại và vào game được
    WorldRoom.minProtocol = 0;
    await tab.ev(`document.getElementById('btn-reload-outdated').click(); 1`);
    await sleep(800);
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập sau khi tải lại",
    );
    const modalAfter = await tab.ev(
      `(() => { const m = document.getElementById('outdated-modal'); return !!m && !m.hidden; })()`,
    );
    if (modalAfter) throw new Error("Sau khi tải lại, màn hình cập nhật vẫn còn");
    out("  ✓ [3/4] Bấm 'Tải Lại Trang': trang tải lại sạch, màn hình cập nhật tắt");
    await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game sau khi server hạ mức",
    );
    out("  ✓ [4/4] Server hạ mức: client vào game bình thường (gửi v hợp lệ)");
  } catch (e) {
    failed = (e as Error).message;
  } finally {
    tab?.close();
    chrome?.kill();
    await gameServer.gracefullyShutdown(false).catch(() => {});
    httpServer.close();
    rmSync(dataDir, { recursive: true, force: true });
    await sleep(600); // Chrome cần chút thời gian đóng tệp trước khi xoá thư mục hồ sơ
    rmSync(chromeDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  if (failed) {
    out(`\n❌ E2E PHIÊN BẢN THẤT BẠI: ${failed}`);
    process.exit(1);
  }
  out("\n🎉 E2E THẬT PHIÊN BẢN PASS 100%!");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
