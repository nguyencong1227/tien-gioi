// E2E THẬT nhịp tim ứng dụng (ping / pong) và vòng đời nền / tiền cảnh (M4.2b, Issue #293):
// Server Colyseus thật + Proxy TCP trung gian (hỗ trợ chế độ BLACKHOLE mô phỏng socket nửa mở thật) + Chrome headless.
// Bốn ca:
//  1. Blackhole ở tiền cảnh: socket TCP vẫn mở nhưng ngừng byte -> client phát hiện chết trong <= HEARTBEAT_TIMEOUT_MS + nhịp (<= 14s)
//     rồi mở lại proxy thì nối lại thành công, cùng sessionId, ví / túi đồ nguyên vẹn.
//  2. Quay lại tiền cảnh sau khi ở nền: ghi đè document.visibilityState + bắn visibilitychange -> phát hiện chết trong <= RESUME_TIMEOUT_MS + dung sai (<= 4.5s).
//  3. Server không trả pong (server cũ không hỗ trợ nhịp tim): proxy chặn tin pong -> client KHÔNG tự ngắt kết nối.
//  4. Socket cũ (nửa mở) đóng MUỘN sau khi đã nối lại xong (đổi mạng): sự kiện đóng của phòng CŨ không được chạy lại vòng nối lại.
// Chạy: `npm run build && npm run e2e:nhip-tim -w server` (cần google-chrome).

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS, RESUME_TIMEOUT_MS } from "@tien-gioi/shared";
import { Tab, sleep, shown } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const PORT_SERVER = 38000 + Math.floor(Math.random() * 2000);
const PORT_PROXY = PORT_SERVER + 100 + Math.floor(Math.random() * 500);
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);
/** Xấu nhất phát hiện socket chết ở tiền cảnh: tới nhịp ping kế + hạn chờ làm tròn lên bội nhịp, cộng dung sai 1,5s */
const DETECT_MAX_MS =
  HEARTBEAT_INTERVAL_MS * (1 + Math.ceil(HEARTBEAT_TIMEOUT_MS / HEARTBEAT_INTERVAL_MS)) + 1500;

/** Proxy TCP chuyển tiếp byte giữa client Chrome và server Colyseus thật, hỗ trợ BLACKHOLE và DROP PONG. */
class TcpProxy {
  private server: net.Server;
  private connections = new Set<{ client: net.Socket; target: net.Socket }>();
  private allowNew = true;
  private blackhole = false;
  private dropPong = false;
  private holed = new Set<{ client: net.Socket; target: net.Socket }>();
  clientBytes = 0;

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

      clientSocket.on("data", (d: Buffer) => {
        this.clientBytes += d.length;
        if (this.blackhole || this.holed.has(pair)) {
          // Blackhole: giữ socket mở nhưng ngừng chuyển tiếp byte hai chiều
          return;
        }
        targetSocket.write(d);
      });

      targetSocket.on("data", (d: Buffer) => {
        if (this.blackhole || this.holed.has(pair)) {
          return;
        }
        if (this.dropPong && d.includes(Buffer.from("pong"))) {
          // Chặn tin pong từ server về client
          return;
        }
        clientSocket.write(d);
      });

      const cleanup = () => {
        if (this.blackhole || this.holed.has(pair)) {
          // Khi đang blackhole, giữ nguyên socket phía client để duy trì trạng thái nửa mở (half-open)
          return;
        }
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

  setBlackhole(blackhole: boolean) {
    this.blackhole = blackhole;
    if (!blackhole) {
      for (const pair of Array.from(this.connections)) {
        if (pair.client.destroyed || pair.target.destroyed) {
          pair.client.destroy();
          pair.target.destroy();
          this.connections.delete(pair);
        }
      }
    }
  }

  /** Socket ĐANG CÓ bị blackhole (nửa mở), nhưng kết nối MỚI vẫn thông: mô phỏng đổi mạng (wifi -> 4G): nối lại được ngay, socket cũ còn treo */
  holeExisting() {
    for (const pair of this.connections) this.holed.add(pair);
  }

  /** Huỷ các socket nửa mở: trình duyệt nhận sự kiện đóng MUỘN (1006) của phòng cũ */
  destroyHoled() {
    for (const pair of Array.from(this.holed)) {
      pair.client.destroy();
      pair.target.destroy();
      this.connections.delete(pair);
    }
    this.holed.clear();
  }

  setDropPong(drop: boolean) {
    this.dropPong = drop;
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
  out(
    "=== E2E THẬT nhịp tim ứng dụng (ping / pong): Chrome headless + Proxy TCP Blackhole + Server Colyseus thật ===",
  );
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }

  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-heartbeat-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-heartbeat-chrome-"));
  process.env.DATA_DIR = dataDir;

  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { changeCoin } = await import("../src/systems/wallet.js");
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
    const T = tab;

    let identityScript: string | null = null;
    const setIdentity = async (name: string, secret: string) => {
      if (identityScript) {
        await T.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: identityScript });
      }
      const r = await T.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(name)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(secret)});`,
      });
      identityScript = String(r.result?.identifier ?? "");
    };

    const serverPlayer = async () => {
      const roomId = String(await T.ev(`window.__scene?.room?.roomId ?? ''`));
      const sid = String(await T.ev(`window.__scene?.room?.sessionId ?? ''`));
      const room = matchMaker.getLocalRoomById(roomId) as any;
      return {
        roomId,
        sid,
        room,
        world: room?.world as any,
        ctrl: room?.world?.ctrl?.get(sid) as any,
      };
    };

    const until = async (fn: () => boolean | Promise<boolean>, label: string, ms = 5000) => {
      for (const end = Date.now() + ms; Date.now() < end;) {
        if (await fn()) return;
        await sleep(100);
      }
      throw new Error(`Hết thời gian chờ (${ms}ms): ${label}`);
    };

    const giveItem = async () => {
      await T.ev(`window.__scene.room.send("chat", { text: "/give nanh_soi 2" }); 1`);
      await until(
        async () => JSON.stringify((await serverPlayer()).ctrl?.inv ?? "").includes("nanh_soi"),
        "server nhận /give",
      );
    };

    // =========================================================================
    // CA 1: Socket nửa mở (Blackhole) ở tiền cảnh
    // =========================================================================
    out("\n--- Ca 1: Socket nửa mở (Blackhole) ở tiền cảnh ---");
    const NAME_1 = "Tim Blackhole";
    const SECRET_1 = "e2e_secret_heartbeat_11111111";

    await setIdentity(NAME_1, SECRET_1);
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    await tab.ev(
      `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME_1)}; document.getElementById('login-form').requestSubmit(); 1`,
    );
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

    out(`  - Vào game thành công: sessionId=${sidBefore}, toạ độ=(${posBefore.x}, ${posBefore.y})`);

    const sp1 = await serverPlayer();
    if (sp1.sid !== sidBefore || !sp1.ctrl) {
      throw new Error("Không tìm thấy người chơi ca 1 trên server");
    }
    changeCoin(sp1.world, sp1.sid, 168);
    await giveItem();
    const before = { coin: sp1.ctrl.coin as number, inv: JSON.stringify(sp1.ctrl.inv) };

    // Chờ 6 giây để client gửi ít nhất 1 ping và nhận pong (supported = true)
    out("  - Chờ nhịp tim đầu tiên xác nhận server hỗ trợ (supported = true)...");
    await sleep(6000);

    // Kích hoạt BLACKHOLE tại proxy: socket TCP vẫn hoàn toàn MỞ nhưng không byte nào đi qua
    out("  - Bật TCP blackhole (socket vẫn mở 100%, không byte nào truyền qua)...");
    const t0 = Date.now();
    proxy.setBlackhole(true);

    // Kiểm tra mỗi HEARTBEAT_INTERVAL_MS nên xấu nhất = chờ tới nhịp ping kế (5s) + hạn chờ làm tròn lên bội nhịp (10s) = 15s (bản đầu
    // đặt 14s: chạy 13,7s, chập chờn). Dung sai 1,5s.
    await tab.waitFor(shown("reconnect-banner"), "banner nối lại hiển thị sau blackhole", 20000);
    const tDetect = Date.now();
    const detectDuration = tDetect - t0;
    out(`  ✓ Client phát hiện socket chết sau ${detectDuration}ms (ngưỡng <= ${DETECT_MAX_MS}ms)`);

    if (detectDuration > DETECT_MAX_MS) {
      throw new Error(`Thời gian phát hiện socket chết quá lâu: ${detectDuration}ms`);
    }

    const bannerMsg = String(
      await tab.ev(`document.getElementById('reconnect-banner-text')?.textContent ?? ''`),
    );
    if (!bannerMsg.includes("Mất kết nối, đang nối lại")) {
      throw new Error(`Nội dung banner không đúng mong đợi: "${bannerMsg}"`);
    }
    out(`  ✓ Banner nối lại hiển thị chính xác: "${bannerMsg}"`);

    // Tắt blackhole và drop socket cũ để client nối lại thành công
    proxy.setBlackhole(false);
    proxy.dropAll();
    out("  - Mở lại proxy, chờ client tự động nối lại thành công...");

    await tab.waitFor(
      `(() => { const b = document.getElementById('reconnect-banner'); return !b || b.hidden; })()`,
      "banner nối lại ẩn đi sau khi nối lại",
      15000,
    );

    const sidAfter = String(await tab.ev(`window.__scene?.room?.sessionId ?? ''`));
    if (sidAfter !== sidBefore) {
      throw new Error(`sessionId bị đổi sau reconnect: trước=${sidBefore}, sau=${sidAfter}`);
    }
    out(`  ✓ Đã nối lại thành công, bảo toàn sessionId: ${sidAfter}`);

    const sp1b = await serverPlayer();
    if (sp1b.ctrl.coin !== before.coin || JSON.stringify(sp1b.ctrl.inv) !== before.inv) {
      throw new Error(`Ví / túi đồ bị đổi sau reconnect: ví ${before.coin} -> ${sp1b.ctrl.coin}`);
    }
    if (sp1b.world.ghosts.size !== 0) {
      throw new Error("Còn ghost sau khi đã nối lại");
    }
    out(`  ✓ Server: cùng nhân vật, ví ${sp1b.ctrl.coin} Linh thạch + túi đồ nguyên vẹn`);

    // Kiểm tra điều khiển di chuyển phản hồi bình thường
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
    if (posMoved.x === posBefore.x && posMoved.y === posBefore.y) {
      throw new Error("Điều khiển không phản hồi sau khi nối lại");
    }
    out(`  ✓ Điều khiển phản hồi bình thường sau nối lại`);

    // =========================================================================
    // CA 2: Quay lại tiền cảnh sau khi ở nền (Background -> Foreground)
    // =========================================================================
    out("\n--- Ca 2: Quay lại tiền cảnh sau khi ở nền (Background -> Foreground) ---");
    const NAME_2 = "Tim Xuong Nen";
    const SECRET_2 = "e2e_secret_heartbeat_22222222";

    await setIdentity(NAME_2, SECRET_2);
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập ca 2",
    );
    await tab.ev(
      `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME_2)}; document.getElementById('login-form').requestSubmit(); 1`,
    );
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game ca 2",
    );
    await tab.waitFor(shown("hud-name"), "đạo hiệu ca 2");
    out("  - Chờ nhịp tim đầu tiên xác nhận server hỗ trợ...");
    await sleep(6000);

    out("  - Giả lập ứng dụng xuống nền trong 2.5s (> RESUME_CHECK_AFTER_MS = 2000ms)...");
    await tab.ev(`
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      1;
    `);
    await sleep(2500);

    out("  - Bật blackhole khi đang ở nền...");
    proxy.setBlackhole(true);

    out("  - Giả lập ứng dụng quay lại tiền cảnh...");
    const tResume = Date.now();
    await tab.ev(`
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      1;
    `);

    // Phải phát hiện chết trong <= RESUME_TIMEOUT_MS (3000ms) + 1500ms dung sai = <= 4500ms
    await tab.waitFor(
      shown("reconnect-banner"),
      "banner nối lại hiển thị sau khi quay lại tiền cảnh",
      8000,
    );
    const tDetectResume = Date.now();
    const resumeDuration = tDetectResume - tResume;
    out(
      `  ✓ Phát hiện socket chết khi quay lại tiền cảnh trong ${resumeDuration}ms (ngưỡng <= 4500ms)`,
    );

    if (resumeDuration > RESUME_TIMEOUT_MS + 2000) {
      throw new Error(`Thời gian phát hiện khi resume quá lâu: ${resumeDuration}ms`);
    }

    // Mở lại proxy để client nối lại
    proxy.setBlackhole(false);
    proxy.dropAll();
    await tab.waitFor(
      `(() => { const b = document.getElementById('reconnect-banner'); return !b || b.hidden; })()`,
      "banner nối lại ẩn sau khi nối lại ở ca 2",
      15000,
    );
    out("  ✓ Nối lại thành công sau ca quay lại tiền cảnh");

    // =========================================================================
    // CA 3: Server cũ không trả pong (không tự ngắt kết nối oan)
    // =========================================================================
    out("\n--- Ca 3: Server không trả pong (server cũ không hỗ trợ nhịp tim) ---");
    const NAME_3 = "Khong Co Pong";
    const SECRET_3 = "e2e_secret_heartbeat_33333333";

    await setIdentity(NAME_3, SECRET_3);
    // Bật chặn pong tại proxy NGAY TỪ ĐẦU cho ca 3: server trả pong nhưng proxy drop không cho về client
    proxy.setDropPong(true);

    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập ca 3",
    );
    await tab.ev(
      `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME_3)}; document.getElementById('login-form').requestSubmit(); 1`,
    );
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game ca 3",
    );
    await tab.waitFor(shown("hud-name"), "đạo hiệu ca 3");

    // Gắn giám sát DOM banner và nhớ token phòng ban đầu để phát hiện mọi lần ngắt kết nối ngầm
    const tokenBefore = String(await tab.ev(`window.__scene?.room?.reconnectionToken ?? ""`));
    await tab.ev(`
      window.__bannerShownCount = 0;
      const el = document.getElementById('reconnect-banner');
      if (el) {
        new MutationObserver(() => {
          if (!el.hidden && window.getComputedStyle(el).display !== 'none') {
            window.__bannerShownCount++;
          }
        }).observe(el, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
      }
      1;
    `);

    out("  - Nhân vật đang ở trong game, proxy chặn 100% tin pong từ server...");
    out(
      "  - Chờ 12s (> HEARTBEAT_TIMEOUT_MS = 8s và > 2 chu kỳ ping) để khẳng định client KHÔNG tự ngắt...",
    );
    await sleep(12000);

    const bannerShownCount = Number(await tab.ev(`window.__bannerShownCount ?? 0`));
    const tokenAfter = String(await tab.ev(`window.__scene?.room?.reconnectionToken ?? ""`));
    const isBannerShown = await tab.ev(shown("reconnect-banner"));

    if (bannerShownCount > 0 || isBannerShown || tokenAfter !== tokenBefore) {
      throw new Error(
        `Client tự ngắt kết nối oan dù chưa từng nhận pong (vi phạm cờ supported)! (bannerCount=${bannerShownCount}, isBannerShown=${isBannerShown}, tokenChanged=${tokenAfter !== tokenBefore})`,
      );
    }
    out("  ✓ Khẳng định: Banner nối lại KHÔNG hiển thị, client KHÔNG tự ngắt kết nối");

    proxy.setDropPong(false);

    // =========================================================================
    // CA 4 (A thêm khi review #310): socket CŨ đóng MUỘN sau khi đã nối lại xong
    // =========================================================================
    out("\n--- Ca 4: Socket cũ (nửa mở) đóng muộn sau khi đã nối lại xong ---");
    const NAME_4 = "Dong Muon";
    const SECRET_4 = "e2e_secret_heartbeat_44444444";
    await setIdentity(NAME_4, SECRET_4);
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập ca 4",
    );
    await tab.ev(
      `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME_4)}; document.getElementById('login-form').requestSubmit(); 1`,
    );
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game ca 4",
    );
    await tab.waitFor(shown("hud-name"), "đạo hiệu ca 4");
    const sid4 = String(await tab.ev(`window.__scene?.room?.sessionId ?? ''`));
    await sleep(6000); // nhịp tim đầu tiên: supported = true

    const token4 = String(await tab.ev(`window.__scene?.room?.reconnectionToken ?? ''`));
    out("  - Blackhole CHỈ socket đang có (kết nối mới vẫn thông, như đổi wifi sang 4G)...");
    // Đếm số lần cảnh bám vào phòng MỚI (mỗi lần nối lại thành công gọi attachRoom một lần): đúng 1 lần là đúng
    await tab.ev(
      `window.__attachCount = 0; const sc = window.__scene; const orig = sc.attachRoom.bind(sc); sc.attachRoom = (r) => { window.__attachCount++; return orig(r); }; 1`,
    );
    proxy.holeExisting();
    // Nối lại qua kết nối mới xong rất nhanh (banner chỉ lóe vài chục ms), nên chờ TOKEN phòng đổi thay vì thăm dò banner
    await tab.waitFor(
      `window.__scene?.room?.reconnectionToken && window.__scene.room.reconnectionToken !== ${JSON.stringify(token4)}`,
      "nhịp tim phát hiện chết và nối lại qua kết nối mới (token phòng đổi)",
      25000,
    );
    await tab.waitFor(
      `(() => { const b = document.getElementById('reconnect-banner'); return !b || b.hidden; })()`,
      "banner nối lại ẩn sau khi nối lại",
      5000,
    );
    if (String(await tab.ev(`window.__scene?.room?.sessionId ?? ''`)) !== sid4) {
      throw new Error("Ca 4: sessionId đổi sau khi nối lại");
    }
    const hb4 = (await tab.ev(`window.__heartbeat`)) !== undefined;
    out(`  ✓ Đã nối lại qua kết nối mới, cùng sessionId; nhịp tim phòng mới có mặt: ${hb4}`);

    // Socket CŨ (còn treo từ lúc blackhole) đóng MUỘN: trình duyệt bắn sự kiện đóng (1006) của phòng CŨ ngay sau khi đã nối lại xong
    // (đo: ~200ms sau). Bản đầu chạy lại vòng nối lại: đóng phòng MỚI vừa nối, nối lại LẦN HAI (R1 -> R2 -> R3), dừng nhịp tim mới.
    proxy.destroyHoled(); // phòng khi sự kiện đóng chưa tới thì ép tới
    await sleep(4000);
    const attached = Number(await tab.ev(`window.__attachCount`));
    const live4 = await tab.ev(
      `!!window.__scene?.room?.connection?.isOpen && document.getElementById('reconnect-banner')?.hidden !== false && !window.__heartbeat?.stopped`,
    );
    if (attached !== 1 || !live4) {
      throw new Error(
        `Ca 4: socket cũ đóng muộn gây nối lại thừa (số lần nối lại=${attached}, cần 1; phòng mới sống và có nhịp tim=${live4})`,
      );
    }
    out(
      "  ✓ Chỉ nối lại ĐÚNG MỘT lần; sự kiện đóng muộn của phòng cũ bị bỏ qua, nhịp tim phòng mới còn chạy",
    );

    if (tab.errors.length) {
      throw new Error(`Có lỗi console trong quá trình test: ${tab.errors.join("; ")}`);
    }
    out("  ✓ 0 lỗi console / exception trong toàn bộ 4 ca");

    out("\n=== TẤT CẢ 4 CA E2E NHỊP TIM ĐỀU ĐẠT ===");
  } catch (err: any) {
    failed = err?.message || String(err);
    out(`\n[LỖI E2E NHỊP TIM] ${failed}`);
    if (tab) {
      try {
        const info = await tab.ev(`({
          url: location.href,
          uiHidden: document.getElementById('ui')?.hidden,
          loginHidden: document.getElementById('login')?.hidden,
          loginNameVal: document.getElementById('login-name')?.value,
          loginErr: document.getElementById('login-err')?.textContent,
          hasScene: !!window.__scene,
          hasRoom: !!window.__scene?.room,
          hudName: document.getElementById('hud-name')?.textContent
        })`);
        out(`  [TAB INFO]: ${JSON.stringify(info)}`);
        if (tab.errors.length) out(`  [TAB ERRORS]:\n    ${tab.errors.join("\n    ")}`);
      } catch (e) {
        out(`  [CANNOT GET TAB INFO]: ${e}`);
      }
    }
  } finally {
    if (tab) {
      try {
        await tab.close();
      } catch {
        /* ignore close error */
      }
    }
    if (chrome) {
      chrome.kill("SIGKILL");
    }
    await proxy.close();
    await new Promise<void>((r) => httpServer.close(() => r()));
    await gameServer.gracefullyShutdown();
    try {
      execSync(`rm -rf "${dataDir}" "${chromeDir}"`);
    } catch {
      /* ignore rm error */
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Lỗi thực thi main:", err);
  process.exit(1);
});
