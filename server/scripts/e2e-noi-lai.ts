// E2E THẬT nối lại sau rớt mạng bằng proxy TCP (#116 / #117, M4-sớm #288):
// Server Colyseus thật + Proxy TCP (node:net) trung gian + Chrome headless.
// Proxy TCP destroy socket để tạo rớt bất thường thật (mã 1006) trong Chrome.
// Ba ca:
//  1. Rớt mạng rồi nối lại được: hiện banner nối lại -> nối lại thành công, cùng sessionId, vị trí/đồ đạc nguyên vẹn, 0 lỗi console, điều khiển dùng lại được.
//  2. Rớt quá hạn grace (reconnectGraceS = 2): thử lại thất bại dứt khoát, hiện banner lỗi kèm nút Tải lại trang, hồ sơ đã lưu, không còn ghost.
//  3. Thoát chủ động (room.leave()): KHÔNG hiện banner nối lại.
// Chạy: `npm run build && npm run e2e:noi-lai -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, shown, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPortServer = () => 37000 + Math.floor(Math.random() * 2000);
let PORT_SERVER = pickPortServer();
// Cổng proxy tính theo cổng server HIỆN TẠI (có thể đã đổi sau khi thử lại cổng bận)
const pickPortProxy = () => PORT_SERVER + 100 + Math.floor(Math.random() * 500);
let PORT_PROXY = pickPortProxy();
const CDP = 9600 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

/** Proxy TCP chuyển tiếp byte giữa client Chrome và server Colyseus thật. */
class TcpProxy {
  private server: net.Server;
  private connections = new Set<{ client: net.Socket; target: net.Socket }>();
  private allowNew = true;
  /** Tổng số byte client đã gửi lên server: sau một lần thoát chủ động mà số này còn tăng nghĩa là client vẫn đang thử nối lại.
   *  (Không đếm số kết nối TCP: HTTP matchmaking của lần nối lại có thể đi trên socket keep-alive sẵn có nên không tạo kết nối mới.) */
  clientBytes = 0;

  constructor(
    public listenPort: number,
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

      clientSocket.on("data", (d: Buffer) => (this.clientBytes += d.length));
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

  /** Nghe trên 127.0.0.1; lỗi (cổng bận) là lỗi THẬT, cổng bận thì thử cổng khác. Trả về cổng thật sự đang nghe. */
  async listen(): Promise<number> {
    this.listenPort = await listenWithRetry(this.server, this.listenPort, {
      explicit: false,
      pick: pickPortProxy,
      host: "127.0.0.1",
    });
    return this.listenPort;
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
  // Lỗi listen (cổng bận) phải thành lỗi THẬT (e2e-kit.listenWithRetry): `new Promise((r) => server.listen(PORT, r))` không bao giờ resolve khi cổng bận
  // nên script thoát mã 0 không in gì (false green) và sót thư mục tạm. Cổng ngẫu nhiên bận thì thử cổng khác.
  try {
    PORT_SERVER = await listenWithRetry(httpServer, PORT_SERVER, {
      explicit: false,
      pick: pickPortServer,
    });
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }

  // Dựng Proxy TCP trung gian
  const proxy = new TcpProxy(pickPortProxy(), PORT_SERVER);
  try {
    PORT_PROXY = await proxy.listen();
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }
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

    // Danh tính theo TỪNG ca: script chạy lúc tạo mỗi tài liệu mới, nên phải gỡ script của ca trước (nếu không mọi ca đều
    // đăng nhập bằng danh tính của ca 1: lỗi đã bắt được khi A review #292)
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
    /** Sự thật phía SERVER (cùng tiến trình): phòng, người chơi, ví, túi đồ của người đang mở trong tab */
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
    /** Cho nhân vật trong tab 2 nanh sói qua chat (/give chỉ bật khi không chạy production) và chờ server nhận */
    const giveItem = async () => {
      await T.ev(`window.__scene.room.send("chat", { text: "/give nanh_soi 2" }); 1`);
      await until(
        async () => JSON.stringify((await serverPlayer()).ctrl?.inv ?? "").includes("nanh_soi"),
        "server nhận /give",
      );
    };

    // =========================================================================
    // CA 1: Rớt mạng rồi nối lại được
    // =========================================================================
    out("\n--- Ca 1: Rớt mạng bất thường rồi nối lại thành công ---");
    const NAME_1 = "Noi Lai Ok";
    const SECRET_1 = "e2e_secret_reconnect_11111111";

    await setIdentity(NAME_1, SECRET_1);
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

    // Trạng thái có giá trị phía server: Linh thạch 123 + 2 nanh sói. Phải còn NGUYÊN sau khi nối lại.
    const sp1 = await serverPlayer();
    if (sp1.sid !== sidBefore || !sp1.ctrl)
      throw new Error("Không tìm thấy người chơi ca 1 trên server");
    changeCoin(sp1.world, sp1.sid, 123);
    await giveItem();
    const before = { coin: sp1.ctrl.coin as number, inv: JSON.stringify(sp1.ctrl.inv) };
    if (before.coin !== 123) throw new Error(`Linh thạch ca 1 không như dựng: ${before.coin}`);

    // Proxy ngắt toàn bộ kết nối hiện tại (gây mã 1006 cho client) và TẠM chặn kết nối mới: nối lại thành công chỉ mất
    // vài chục ms nên nếu cho nối ngay thì banner chỉ lóe lên và vòng thăm dò 100 ms có thể bỏ lỡ (E2E chập chờn khi máy bận,
    // A bắt được khi review #292). Chặn rồi mở lại làm banner hiện đủ lâu và có thể kiểm một cách chắc chắn.
    out("  - Proxy TCP destroy kết nối hiện tại (mã 1006) và tạm chặn kết nối mới...");
    proxy.setAllowNewConnections(false);
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

    // Mở lại proxy (còn trong 20 giây grace): lần thử kế tiếp của client phải nối lại thành công
    proxy.setAllowNewConnections(true);
    out("  - Mở lại proxy, chờ client tự động kết nối lại...");
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

    const sp1b = await serverPlayer();
    if (sp1b.roomId !== sp1.roomId || sp1b.ctrl !== sp1.ctrl) {
      throw new Error("Sau nối lại không phải cùng nhân vật / cùng phòng phía server");
    }
    if (sp1b.ctrl.coin !== before.coin || JSON.stringify(sp1b.ctrl.inv) !== before.inv) {
      throw new Error(`Ví / túi đồ đổi sau nối lại: ví ${before.coin} -> ${sp1b.ctrl.coin}`);
    }
    if (sp1b.world.ghosts.size !== 0)
      throw new Error("Còn nhân vật chờ nối lại (ghost) sau khi đã nối lại");
    out(
      `  ✓ Server: cùng nhân vật, ví ${sp1b.ctrl.coin} Linh thạch + túi đồ (nanh sói) nguyên vẹn, không còn ghost`,
    );

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

    await setIdentity(NAME_2, SECRET_2);
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
    const hudName2 = String(await tab.ev(`document.getElementById('hud-name')?.textContent ?? ''`));
    if (hudName2 !== NAME_2)
      throw new Error(`Ca 2 đăng nhập nhầm danh tính: "${hudName2}" (cần "${NAME_2}")`);
    const sp2 = await serverPlayer();
    await giveItem(); // thay đổi sau lần ghi lúc vào phòng: chỉ có thể xuống đĩa nếu server lưu khi hết grace

    // Chặn kết nối mới tại proxy trong 2.5s để server hết 2s grace
    out("  - Khóa proxy trong 2.5s và drop kết nối hiện tại (chờ server hết 2s grace)...");
    proxy.setAllowNewConnections(false);
    proxy.dropAll();
    // Server lưu ngay lúc rớt (phòng khi sập), nên lần lưu khi HẾT grace chỉ được chứng minh bằng thay đổi xảy ra SAU đó:
    // cộng 77 Linh thạch trong lúc nhân vật đang chờ nối lại
    await until(
      () => sp2.world.ghosts.has(sp2.sid),
      "server đưa nhân vật ca 2 vào trạng thái chờ nối lại",
    );
    const coin2 = (sp2.ctrl.coin as number) + 77;
    changeCoin(sp2.world, sp2.sid, 77);

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

    // Kiểm tra server: ĐÚNG hồ sơ của nhân vật ca 2 đã xuống đĩa kèm thay đổi (nanh sói), và không còn ghost / ctrl
    const file2 = path.join(
      dataDir,
      `${createHash("sha1").update(NAME_2.normalize("NFC").toLowerCase()).digest("hex")}.json`,
    );
    await until(() => {
      if (!existsSync(file2)) return false;
      const saved = JSON.parse(readFileSync(file2, "utf8"));
      return JSON.stringify(saved.inventory).includes("nanh_soi") && saved.coin === coin2;
    }, "hồ sơ nhân vật ca 2 (nanh sói + Linh thạch cộng trong lúc chờ) được lưu xuống đĩa khi hết grace");
    const roomAfter2 = matchMaker.getLocalRoomById(sp2.roomId) as any;
    if (roomAfter2?.world?.ghosts?.size) throw new Error("Còn ghost sau khi hết grace");
    if (roomAfter2?.world?.ctrl?.has(sp2.sid))
      throw new Error("Nhân vật ca 2 vẫn còn trong phòng sau khi hết grace");
    out(
      `  ✓ Hồ sơ ${NAME_2} (nanh sói + ${coin2} Linh thạch, gồm phần cộng lúc chờ) đã lưu xuống đĩa khi hết grace; không còn ghost, không còn trong phòng`,
    );

    // =========================================================================
    // CA 3: Thoát chủ động không nối lại
    // =========================================================================
    out("\n--- Ca 3: Thoát chủ động (room.leave()) không kích hoạt reconnect ---");
    WorldRoom.reconnectGraceS = 20; // Khôi phục grace mặc định

    const NAME_3 = "Thoat Chu Dong";
    const SECRET_3 = "e2e_secret_active_leave_333";

    await setIdentity(NAME_3, SECRET_3);
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
    const hudName3 = String(await tab.ev(`document.getElementById('hud-name')?.textContent ?? ''`));
    if (hudName3 !== NAME_3)
      throw new Error(`Ca 3 đăng nhập nhầm danh tính: "${hudName3}" (cần "${NAME_3}")`);
    const sp3 = await serverPlayer();
    // Ghi lại MỌI thay đổi của banner nối lại: lần thử nối lại bị từ chối dứt khoát (token đã vô hiệu vì thoát chủ động) làm
    // banner lóe "đang nối lại" rồi chuyển ngay sang "thất bại" trong vài ms, nên chỉ đọc chữ cuối cùng thì bỏ lỡ
    await tab.ev(`window.__bannerLog = [];
      const el = document.getElementById('reconnect-banner');
      new MutationObserver(() => window.__bannerLog.push(((document.getElementById('reconnect-banner-text') || {}).textContent || '') + '|hidden=' + (el ? el.hidden : 'x')))
        .observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
      1`);
    await sleep(500);

    out("  - Gọi chủ động đóng kết nối (mã 4000)...");
    await tab.ev(`window.__scene?.room?.connection?.close(4000); 1`);
    await sleep(300); // khung đóng của chính lần thoát này đã đi qua proxy
    const bytesBefore = proxy.clientBytes;
    await sleep(3200); // dài hơn hai nhịp thử lại (1,5 giây) của vòng nối lại

    const bannerMsgCa3 = String(
      await tab.ev(`document.getElementById('reconnect-banner-text')?.textContent ?? ''`),
    );
    if (bannerMsgCa3.includes("đang nối lại")) {
      throw new Error(`Thoát chủ động mà vẫn hiển thị banner đang nối lại: "${bannerMsgCa3}"`);
    }
    const bannerLog = (await tab.ev(`window.__bannerLog ?? []`)) as string[];
    if (bannerLog.some((t) => t.includes("đang nối lại"))) {
      throw new Error(
        `Thoát chủ động mà banner từng hiện "đang nối lại": ${JSON.stringify(bannerLog)}`,
      );
    }
    if (proxy.clientBytes !== bytesBefore) {
      throw new Error(
        `Thoát chủ động mà client vẫn gửi ${proxy.clientBytes - bytesBefore} byte lên server (đang thử nối lại)`,
      );
    }
    const room3 = matchMaker.getLocalRoomById(sp3.roomId) as any;
    if (room3?.world?.ghosts?.size)
      throw new Error("Thoát chủ động mà server vẫn giữ ghost chờ nối lại");
    out(
      `  ✓ Thoát chủ động: banner không từng hiện "đang nối lại", client không gửi thêm byte nào, server không giữ ghost`,
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
