// E2E THẬT nối lại sau rớt mạng bằng proxy TCP (#116 / #117, M4-sớm #288):
// Server Colyseus thật + Proxy TCP (node:net) trung gian + Chrome headless.
// Proxy TCP destroy socket để tạo rớt bất thường thật (mã 1006) trong Chrome.
// Ba ca:
//  1. Rớt mạng rồi nối lại được: hiện banner nối lại -> nối lại thành công, cùng sessionId, vị trí/đồ đạc nguyên vẹn, 0 lỗi console, điều khiển dùng lại được.
//  2. Rớt quá hạn grace (reconnectGraceS = 2): thử lại thất bại dứt khoát, hiện banner lỗi kèm nút Tải lại trang, hồ sơ đã lưu, không còn ghost.
//  3. Thoát chủ động (room.leave()): KHÔNG hiện banner nối lại.
// Chạy: `npm run build && npm run e2e:noi-lai -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, shown } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const PORT_SERVER = 37000 + Math.floor(Math.random() * 2000);
const PORT_PROXY = PORT_SERVER + 100 + Math.floor(Math.random() * 500);
const CDP = 9600 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

/** Proxy TCP chuyển tiếp byte giữa client Chrome và server Colyseus thật. */
class TcpProxy {
  private server: net.Server;
  private connections = new Set<{ client: net.Socket; target: net.Socket }>();
  private allowNew = true;

  constructor(
    readonly listenPort: number,
    readonly targetPort: number,
  ) {
    this.server = net.createServer((clientSocket) => {
      if (!this.allowNew) {
        clientSocket.destroy();
        return;
      }
      const targetSocket = net.connect({ port: this.targetPort, host: "127.0.0.1" });
      const pair = { client: clientSocket, target: targetSocket };
      this.connections.add(pair);

      clientSocket.pipe(targetSocket);
      targetSocket.pipe(clientSocket);

      const cleanup = () => {
        this.connections.delete(pair);
        clientSocket.destroy();
        targetSocket.destroy();
      };

      clientSocket.on("error", cleanup);
      targetSocket.on("error", cleanup);
      clientSocket.on("close", cleanup);
      targetSocket.on("close", cleanup);
    });
  }

  async listen(): Promise<void> {
    return new Promise((resolve) => this.server.listen(this.listenPort, "127.0.0.1", resolve));
  }

  setAllowNewConnections(allow: boolean) {
    this.allowNew = allow;
  }

  dropAll() {
    for (const pair of Array.from(this.connections)) {
      pair.client.destroy();
      pair.target.destroy();
    }
    this.connections.clear();
  }

  async close(): Promise<void> {
    this.dropAll();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

async function main() {
  out("=== E2E THẬT nối lại sau rớt mạng: Chrome headless + Proxy TCP + Server Colyseus thật ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }

  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-reconnect-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-reconnect-chrome-"));
  process.env.DATA_DIR = dataDir;

  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom.js");
  WorldRoom.reconnectGraceS = 20;

  // Dựng HTTP + WebSocket Server Colyseus
  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  await new Promise<void>((resolve) => httpServer.listen(PORT_SERVER, resolve));

  // Dựng Proxy TCP trung gian
  const proxy = new TcpProxy(PORT_PROXY, PORT_SERVER);
  await proxy.listen();
  out(`- Server thật: http://127.0.0.1:${PORT_SERVER}`);
  out(`- Proxy TCP:   http://127.0.0.1:${PORT_PROXY} -> 127.0.0.1:${PORT_SERVER}`);

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

    // =========================================================================
    // CA 1: Rớt mạng rồi nối lại được
    // =========================================================================
    out("\n--- Ca 1: Rớt mạng bất thường rồi nối lại thành công ---");
    const NAME_1 = "Noi Lai Ok";
    const SECRET_1 = "e2e_secret_reconnect_11111111";

    await tab.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME_1)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET_1)});`,
    });
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game thành công",
    );
    await tab.waitFor(shown("hud-name"), "đạo hiệu trên HUD");

    const sidBefore = String(await tab.ev(`window.__scene?.room?.sessionId ?? ''`));
    if (!sidBefore) throw new Error("Không lấy được sessionId ban đầu");
    const posBefore = (await tab.ev(
      `({ x: Math.round(window.__scene?.predX ?? 0), y: Math.round(window.__scene?.predY ?? 0) })`,
    )) as { x: number; y: number };

    out(`  - Người chơi vào game: sessionId=${sidBefore}, toạ độ=(${posBefore.x}, ${posBefore.y})`);

    // Proxy ngắt toàn bộ kết nối hiện tại (gây mã 1006 cho client)
    out("  - Proxy TCP destroy kết nối hiện tại (mã 1006)...");
    proxy.dropAll();

    // Banner nối lại phải hiện thật
    await tab.waitFor(shown("reconnect-banner"), "banner nối lại hiển thị thật");
    const bannerMsg = String(
      await tab.ev(`document.getElementById('reconnect-banner-text')?.textContent ?? ''`),
    );
    if (!bannerMsg.includes("Mất kết nối, đang nối lại")) {
      throw new Error(`Nội dung banner không đúng mong đợi: "${bannerMsg}"`);
    }
    out(`  ✓ Banner nối lại hiển thị thật: "${bannerMsg}"`);

    // Vì proxy vẫn cho phép kết nối mới, client sẽ tự động reconnect thành công
    out("  - Chờ client tự động kết nối lại...");
    await tab.waitFor(
      `(() => { const b = document.getElementById('reconnect-banner'); return !b || b.hidden; })()`,
      "banner nối lại ẩn đi sau khi nối lại thành công",
      15000,
    );

    const sidAfter = String(await tab.ev(`window.__scene?.room?.sessionId ?? ''`));
    if (sidAfter !== sidBefore) {
      throw new Error(`sessionId bị đổi sau khi nối lại: trước=${sidBefore}, sau=${sidAfter}`);
    }
    out(`  ✓ Đã nối lại thành công, giữ nguyên sessionId: ${sidAfter}`);

    // Kiểm tra toạ độ và điều khiển dùng lại được
    const posAfter = (await tab.ev(
      `({ x: Math.round(window.__scene?.predX ?? 0), y: Math.round(window.__scene?.predY ?? 0) })`,
    )) as { x: number; y: number };
    if (Math.abs(posAfter.x - posBefore.x) > 5 || Math.abs(posAfter.y - posBefore.y) > 5) {
      throw new Error(
        `Vị trí bị nhảy sau reconnect: trước=(${posBefore.x}, ${posBefore.y}), sau=(${posAfter.x}, ${posAfter.y})`,
      );
    }
    out(`  ✓ Vị trí nhân vật bảo toàn sau reconnect: (${posAfter.x}, ${posAfter.y})`);

    // Kiểm tra điều khiển dùng lại được: nhấn phím D để di chuyển
    await tab.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "d",
      code: "KeyD",
      windowsVirtualKeyCode: 68,
    });
    await sleep(400);
    await tab.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "d",
      code: "KeyD",
      windowsVirtualKeyCode: 68,
    });
    await sleep(250);

    const posMoved = (await tab.ev(
      `({ x: Math.round(window.__scene?.predX ?? 0), y: Math.round(window.__scene?.predY ?? 0) })`,
    )) as { x: number; y: number };
    if (posMoved.x === posAfter.x && posMoved.y === posAfter.y) {
      throw new Error("Điều khiển không phản hồi sau khi nối lại (nhân vật không di chuyển)");
    }
    out(
      `  ✓ Điều khiển phản hồi bình thường sau reconnect: toạ độ mới (${posMoved.x}, ${posMoved.y})`,
    );

    if (tab.errors.length) {
      throw new Error(`Có lỗi console trong quá trình reconnect: ${tab.errors.join("; ")}`);
    }
    out("  ✓ 0 lỗi console / exception trong luồng nối lại");

    // =========================================================================
    // CA 2: Rớt quá hạn grace (hạ xuống 2s)
    // =========================================================================
    out("\n--- Ca 2: Rớt mạng quá hạn grace (reconnectGraceS = 2s) ---");
    const NAME_2 = "Qua Han Grace";
    const SECRET_2 = "e2e_secret_grace_expired_222";

    WorldRoom.reconnectGraceS = 2; // Hạ thời gian grace để kiểm thử chạy nhanh

    await tab.ev(`
      localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME_2)});
      localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET_2)});
    `);
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập ca 2",
    );
    await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game ca 2",
    );
    await tab.waitFor(shown("hud-name"), "đạo hiệu ca 2");

    // Chặn kết nối mới tại proxy trong 2.5s để server hết 2s grace
    out("  - Khóa proxy trong 2.5s và drop kết nối hiện tại (chờ server hết 2s grace)...");
    proxy.setAllowNewConnections(false);
    proxy.dropAll();

    // Đợi 2.5s để server hết hạn 2s grace, dọn ghost và hủy token
    await sleep(2500);

    // Mở lại proxy để client gửi reconnect và nhận lỗi dứt khoát từ server (token expired / not found)
    out("  - Mở lại proxy để client nhận phản hồi lỗi dứt khoát từ server...");
    proxy.setAllowNewConnections(true);

    // Chờ quá hạn và hiện màn hình disconnected thất bại
    await tab.waitFor(
      `(() => {
        const b = document.getElementById('reconnect-banner');
        const r = document.getElementById('reconnect-reload');
        return b && !b.hidden && b.classList.contains('failed') && r && !r.hidden;
      })()`,
      "màn hình mất kết nối vĩnh viễn kèm nút Tải lại trang",
      12000,
    );

    const failMsg = String(
      await tab.ev(`document.getElementById('reconnect-banner-text')?.textContent ?? ''`),
    );
    out(`  ✓ Màn hình thất bại hiển thị chính xác: "${failMsg}"`);

    await sleep(1000); // Đợi server hoàn tất persist nếu còn đang ghi

    // Kiểm tra server: nhân vật đã được lưu vào đĩa
    const playerFiles = readdirSync(dataDir).filter((f) => f.endsWith(".json"));
    if (playerFiles.length === 0) {
      throw new Error("Server không lưu hồ sơ nhân vật sau khi rớt mạng quá hạn");
    }
    out(`  ✓ Server đã lưu hồ sơ nhân vật sau khi quá hạn grace: ${playerFiles.length} tệp`);

    // =========================================================================
    // CA 3: Thoát chủ động không nối lại
    // =========================================================================
    out("\n--- Ca 3: Thoát chủ động (room.leave()) không kích hoạt reconnect ---");
    WorldRoom.reconnectGraceS = 20; // Khôi phục grace mặc định

    const NAME_3 = "Thoat Chu Dong";
    const SECRET_3 = "e2e_secret_active_leave_333";

    await tab.ev(`
      localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME_3)});
      localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET_3)});
    `);
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập ca 3",
    );
    await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game ca 3",
    );
    await tab.waitFor(shown("hud-name"), "đạo hiệu ca 3");

    out("  - Gọi chủ động đóng kết nối (mã 4000)...");
    await tab.ev(`window.__scene?.room?.connection?.close(4000); 1`);
    await sleep(1500);

    const bannerMsgCa3 = String(
      await tab.ev(`document.getElementById('reconnect-banner-text')?.textContent ?? ''`),
    );
    if (bannerMsgCa3.includes("đang nối lại")) {
      throw new Error(`Thoát chủ động mà vẫn hiển thị banner đang nối lại: "${bannerMsgCa3}"`);
    }
    out(
      `  ✓ Thoát chủ động: KHÔNG kích hoạt luồng reconnect (không hiện banner đếm ngược nối lại)`,
    );
  } catch (e) {
    failed = (e as Error).message;
  } finally {
    tab?.close();
    chrome?.kill();
    await proxy.close().catch(() => {});
    await gameServer.gracefullyShutdown(false).catch(() => {});
    httpServer.close();
    rmSync(dataDir, { recursive: true, force: true });
    await sleep(600);
    rmSync(chromeDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }

  if (failed) {
    out(`\n❌ E2E NỐI LẠI THẤT BẠI: ${failed}`);
    process.exit(1);
  }
  out("\n🎉 E2E THẬT NỐI LẠI PASS 100%!");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
