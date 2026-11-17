// E2E THẬT nhịp tim ứng dụng (ping / pong) và vòng đời nền / tiền cảnh (M4.2b, Issue #293):
// Server Colyseus thật + Proxy TCP trung gian (hỗ trợ chế độ BLACKHOLE mô phỏng socket nửa mở thật) + Chrome headless.
// Bảy ca:
//  1. Blackhole ở tiền cảnh: socket TCP vẫn mở nhưng ngừng byte -> client phát hiện chết trong <= HEARTBEAT_TIMEOUT_MS + nhịp (<= 14s)
//     rồi mở lại proxy thì nối lại thành công, cùng sessionId, ví / túi đồ nguyên vẹn.
//  2. Quay lại tiền cảnh sau khi ở nền: ghi đè document.visibilityState + bắn visibilitychange -> phát hiện chết trong <= RESUME_TIMEOUT_MS + dung sai (<= 4.5s).
//  3. Server không trả pong (server cũ không hỗ trợ nhịp tim): proxy chặn tin pong -> client KHÔNG tự ngắt kết nối, chip "Mạng chậm" cũng không hiện.
//  4. Socket cũ (nửa mở) đóng MUỘN sau khi đã nối lại xong (đổi mạng): sự kiện đóng của phòng CŨ không được chạy lại vòng nối lại.
//  6. (mục 33, cần máy chủ có `net-guard`) Đường hầm ĐỨNG 5 giây (stall: byte bị hoãn, không mất) rồi thông: máy chủ ghost sau 3 giây im lặng dù socket mở, có tin lại thì hộ thể 3 giây
//     + `netShield` tới client (vầng sáng), dải + toast "Đã kết nối lại", không ngắt kết nối.
//  7. (#873) ĐỘ TRỄ MẠNG thật (proxy hoãn byte, RTT 0 / ~160 / ~800): `lastRttMs` đo từ pong, vùng báo (`warn`) + thanh gồng (`bossCast`) rút ngắn CÙNG một mức
//     (clamp(RTT + 10, 0, min(250, 0,3 x ms))), HUD ?perf=1 ghi RTT, hết trễ thì trở lại.
//  5. Chip "Mạng chậm" (mục 25): đang ĐI BỘ mà mạng đứng thì chip hiện sau ~SLOW_AFTER_MS, TRƯỚC banner nối lại; Ca 1 (đứng yên) chip cũng hiện trước banner
//     (nhờ ping) và tắt khi nối lại xong.
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
import { HEARTBEAT_TIMEOUT_MS, NET_BEAT_MS, RESUME_TIMEOUT_MS } from "@tien-gioi/shared";
// Ngưỡng báo "Mạng chậm" của client (chip báo sớm hơn nhịp tim, QUYET_DINH_M3 mục 25): nhập từ mã client để script và mã dùng MỘT con số
import { SLOW_AFTER_MS, SLOW_POLL_MS } from "../../client/src/net-slow";
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
const pickPortServer = () => 38000 + Math.floor(Math.random() * 2000);
let PORT_SERVER = pickPortServer();
// Cổng proxy tính theo cổng server HIỆN TẠI (có thể đã đổi sau khi thử lại cổng bận)
const pickPortProxy = () => PORT_SERVER + 100 + Math.floor(Math.random() * 500);
let PORT_PROXY = pickPortProxy();
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);
/** Xấu nhất phát hiện socket chết ở tiền cảnh: tới nhịp ping kế + hạn chờ làm tròn lên bội nhịp, cộng dung sai 1,5s */
const DETECT_MAX_MS = NET_BEAT_MS * (1 + Math.ceil(HEARTBEAT_TIMEOUT_MS / NET_BEAT_MS)) + 1500;

/** Proxy TCP chuyển tiếp byte giữa client Chrome và server Colyseus thật, hỗ trợ BLACKHOLE và DROP PONG. */
class TcpProxy {
  private server: net.Server;
  private connections = new Set<{ client: net.Socket; target: net.Socket }>();
  private allowNew = true;
  private blackhole = false;
  private dropPong = false;
  private stalled = false;
  private stallQueue: Array<() => void> = [];
  private holed = new Set<{ client: net.Socket; target: net.Socket }>();
  clientBytes = 0;
  /** Sổ sự kiện (đo cho chẩn đoán khi đỏ): kết nối mới và dòng yêu cầu HTTP đầu của từng chuỗi byte client -> server, kèm cờ `holed`. */
  readonly events: string[] = [];
  private pairSeq = 0;
  private swallowReconnect = 0;
  private t0 = Date.now();
  private note(msg: string) {
    this.events.push(`+${((Date.now() - this.t0) / 1000).toFixed(1)}s ${msg}`);
    if (this.events.length > 60) this.events.shift();
  }

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
      const id = ++this.pairSeq;
      this.note(
        `kết nối mới #${id}${this.holed.size ? ` (đã có ${this.holed.size} socket nửa mở)` : ""}`,
      );

      clientSocket.on("data", (d: Buffer) => {
        this.clientBytes += d.length;
        const m = /^(GET|POST|PUT|OPTIONS|DELETE|HEAD) (\S+)/.exec(
          d.subarray(0, 120).toString("latin1"),
        );
        // Mô phỏng socket keep-alive CHẾT mà Chrome không biết: yêu cầu nối lại đầu tiên bị nuốt, socket vẫn mở, không phản hồi bao giờ
        if (
          this.swallowReconnect > 0 &&
          d.subarray(0, 40).toString("latin1").startsWith("POST /matchmake/reconnect/")
        ) {
          this.swallowReconnect--;
          this.holed.add(pair);
          this.note(`#${id} POST /matchmake/reconnect  <-- BỊ NUỐT (mô phỏng socket chết)`);
          return;
        }
        if (m)
          this.note(
            `#${id} ${m[1]} ${m[2].split("?")[0].slice(0, 60)}${this.holed.has(pair) ? "  <-- SOCKET NỬA MỞ, byte bị nuốt" : ""}`,
          );
        if (this.stalled) {
          this.stallQueue.push(() => {
            if (!targetSocket.destroyed) targetSocket.write(d);
          });
          return;
        }
        if (this.blackhole || this.holed.has(pair)) {
          // Blackhole: giữ socket mở nhưng ngừng chuyển tiếp byte hai chiều
          return;
        }
        this.flow("up", () => {
          if (!targetSocket.destroyed) targetSocket.write(d);
        });
      });

      targetSocket.on("data", (d: Buffer) => {
        if (this.stalled) {
          this.stallQueue.push(() => {
            if (!clientSocket.destroyed) clientSocket.write(d);
          });
          return;
        }
        if (this.blackhole || this.holed.has(pair)) {
          return;
        }
        if (this.dropPong && d.includes(Buffer.from("pong"))) {
          // Chặn tin pong từ server về client
          return;
        }
        this.flow("down", () => {
          if (!clientSocket.destroyed) clientSocket.write(d);
        });
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

  /**
   * STALL: GIỮ byte hai chiều (không bỏ) rồi xả đúng thứ tự khi `setStall(false)`: mô phỏng đường hầm "đứng" rồi thông lại (TCP hoãn chứ không mất byte). Khác blackhole (bỏ byte, luồng WebSocket
   * không dùng tiếp được): sau stall socket vẫn dùng tiếp, nên đo được đường "có tin lại sau im lặng" của máy chủ (mục 33: hộ thể, quái mất mục tiêu).
   */
  setStall(on: boolean) {
    this.stalled = on;
    if (!on) {
      const q = this.stallQueue;
      this.stallQueue = [];
      for (const f of q) f();
    }
  }

  /**
   * ĐỘ TRỄ giả lập (ms MỖI CHIỀU, RTT = 2 x `ms`): mỗi đoạn byte tới đích muộn `ms` ms nhưng vẫn ĐÚNG THỨ TỰ trong từng chiều (kể cả khi đổi `ms` giữa chừng:
   * không đoạn nào vượt đoạn đứng trước). Khác stall (hoãn hết rồi xả một lượt): luồng vẫn chảy đều, chỉ chậm. Dùng đo RTT thật của nhịp tim (#873).
   */
  setDelay(ms: number) {
    this.delayMs = Math.max(0, ms);
  }

  private delayMs = 0;
  private flowQ: Record<"up" | "down", Array<{ due: number; f: () => void }>> = {
    up: [],
    down: [],
  };
  private flowTimer: Record<"up" | "down", NodeJS.Timeout | null> = { up: null, down: null };

  private flow(dir: "up" | "down", f: () => void) {
    const q = this.flowQ[dir];
    if (this.delayMs <= 0 && q.length === 0) {
      f();
      return;
    }
    q.push({ due: Math.max(Date.now() + this.delayMs, q[q.length - 1]?.due ?? 0), f });
    this.pumpFlow(dir);
  }

  private pumpFlow(dir: "up" | "down") {
    const q = this.flowQ[dir];
    if (this.flowTimer[dir] || q.length === 0) return;
    this.flowTimer[dir] = setTimeout(
      () => {
        this.flowTimer[dir] = null;
        const now = Date.now();
        while (q.length > 0 && q[0]!.due <= now) q.shift()!.f();
        this.pumpFlow(dir);
      },
      Math.max(0, q[0]!.due - Date.now()),
    );
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

  /** Nuốt `n` yêu cầu `POST /matchmake/reconnect` kế tiếp (trên bất kỳ socket nào): tái hiện lần nối lại treo ở máy nào cũng giống runner. */
  swallowReconnectPosts(n: number) {
    this.swallowReconnect = n;
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
    for (const dir of ["up", "down"] as const) {
      if (this.flowTimer[dir]) clearTimeout(this.flowTimer[dir]!);
      this.flowTimer[dir] = null;
      this.flowQ[dir].length = 0;
    }
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

  const serverLogs: string[] = [];
  const logServer = (msg: string) => {
    serverLogs.push(`[${new Date().toISOString()}] ${msg}`);
    if (serverLogs.length > 50) serverLogs.shift();
  };
  const origOnLeave = WorldRoom.prototype.onLeave;
  WorldRoom.prototype.onLeave = async function (client: any, consented?: boolean) {
    logServer(`WorldRoom onLeave: sid=${client?.sessionId}, consented=${consented}`);
    return origOnLeave.call(this, client, consented);
  };
  const origAllowReconnection = WorldRoom.prototype.allowReconnection;
  WorldRoom.prototype.allowReconnection = function (client: any, seconds: number) {
    logServer(`WorldRoom allowReconnection: sid=${client?.sessionId}, seconds=${seconds}`);
    return origAllowReconnection.call(this, client, seconds);
  };
  const origOnJoin = WorldRoom.prototype.onJoin;
  WorldRoom.prototype.onJoin = function (client: any, options: any, auth: any) {
    logServer(`WorldRoom onJoin: sid=${client?.sessionId}, name=${auth?.name ?? options?.name}`);
    return origOnJoin.call(this, client, options, auth);
  };

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
      { stdio: "ignore", detached: true },
    );

    let targets: any[] = [];
    for (const start = Date.now(); Date.now() - start < 15000;) {
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
    // Chip "Mạng chậm" phải hiện TRƯỚC banner (đứng yên: chờ pong của ping kế <= một nhịp + SLOW_AFTER_MS), banner chưa hiện lúc đó
    await tab.waitFor(shown("net-slow"), 'chip "Mạng chậm" hiện sau blackhole', 12000);
    const chipMs = Date.now() - t0;
    const chipText = String(await tab.ev(`document.getElementById('net-slow')?.textContent ?? ''`));
    if (!chipText.includes("Mất kết nối") || !chipText.includes("được bảo vệ")) {
      throw new Error(`Ca 1: chữ trên dải sai: "${chipText.trim()}"`);
    }
    const chipMax = NET_BEAT_MS + SLOW_AFTER_MS + SLOW_POLL_MS + 1500;
    const bannerAtChip = Boolean(
      await tab.ev(`!document.getElementById('reconnect-banner')?.hidden`),
    );
    if (chipMs > chipMax || bannerAtChip) {
      throw new Error(
        `Ca 1: chip "Mạng chậm" hiện sau ${chipMs}ms (cần <= ${chipMax}ms) và phải TRƯỚC banner nối lại (banner đã hiện: ${bannerAtChip})`,
      );
    }
    out(
      `  ✓ Chip "Mạng chậm" hiện sau ${chipMs}ms, trước banner nối lại (sớm hơn ${HEARTBEAT_TIMEOUT_MS}ms của nhịp tim)`,
    );
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

    if (await tab.ev(`!document.getElementById('net-slow')?.hidden`)) {
      throw new Error('Ca 1: chip "Mạng chậm" còn hiện sau khi đã nối lại');
    }
    out('  ✓ Nối lại xong: chip "Mạng chậm" đã tắt');
    await tab.waitFor(
      `[...document.querySelectorAll('#toast p')].some((p) => p.textContent.includes('Đã kết nối lại'))`,
      'toast "Đã kết nối lại" sau khi nối lại',
      5000,
    );
    out('  ✓ Toast "Đã kết nối lại." hiện sau khi nối lại');

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
    // máy chủ cũ không trả pong: ping không phải bằng chứng gì, chip "Mạng chậm" cũng KHÔNG được hiện (phòng lặng im là bình thường)
    if (await tab.ev(`!document.getElementById('net-slow')?.hidden`)) {
      throw new Error('Ca 3: chip "Mạng chậm" hiện dù chỉ vì máy chủ cũ không trả pong (báo nhầm)');
    }
    out('  ✓ Máy chủ cũ không trả pong: chip "Mạng chậm" KHÔNG hiện (báo nhầm)');

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
    // Lần nối lại ĐẦU bị nuốt (socket keep-alive chết): trên runner CI Chrome dùng lại socket rảnh đã bị blackhole và `client.reconnect()`
    // treo mãi; vòng nối lại phải mở lần thử song song thay vì kẹt (`client/src/reconnect.ts`). Ép xảy ra để cục bộ cũng đỏ khi hỏng.
    proxy.swallowReconnectPosts(1);
    proxy.holeExisting();
    // Nối lại qua kết nối mới xong rất nhanh (banner chỉ lóe vài chục ms), nên chờ TOKEN phòng đổi thay vì thăm dò banner
    try {
      await tab.waitFor(
        `window.__scene?.room?.reconnectionToken && window.__scene.room.reconnectionToken !== ${JSON.stringify(token4)}`,
        "nhịp tim phát hiện chết và nối lại qua kết nối mới (token phòng đổi)",
        25000,
      );
    } catch (e: any) {
      const diag = (await tab.ev(`(() => {
        const b = document.getElementById('reconnect-banner');
        const hb = window.__heartbeat;
        const rm = window.__scene?.room;
        return {
          banner: b ? { hidden: b.hidden, text: b.textContent, display: window.getComputedStyle(b).display } : null,
          heartbeat: hb ? { supported: hb.state?.supported ?? hb.supported, stopped: hb.stopped, pendingSince: hb.state?.pendingSince ?? null } : null,
          room: rm ? { isOpen: !!rm.connection?.isOpen, sessionId: rm.sessionId, token: rm.reconnectionToken } : null,
          attachCount: window.__attachCount,
        };
      })()`)) as any;
      out(`  [CHẨN ĐOÁN CA 4 HẾT GIỜ]:`);
      out(`    banner: ${JSON.stringify(diag?.banner)}`);
      out(`    heartbeat: ${JSON.stringify(diag?.heartbeat)}`);
      out(`    room: ${JSON.stringify(diag?.room)} (token ban đầu: ${token4})`);
      out(`    attachCount: ${diag?.attachCount}`);
      out(
        `    console tail gần nhất:\n      ${tab.consoleTail.slice(-10).join("\n      ") || "(không có)"}`,
      );
      out(`    console errors:\n      ${tab.errors.slice(-10).join("\n      ") || "(không có)"}`);
      out(
        `    nhật ký server gần nhất:\n      ${serverLogs.slice(-10).join("\n      ") || "(không có)"}`,
      );
      out(
        `    sổ proxy (kết nối mới và yêu cầu HTTP, mốc 0 = lúc tạo proxy):\n      ${proxy.events.slice(-25).join("\n      ")}`,
      );
      throw e;
    }
    if (process.env.E2E_PROXY_TRACE)
      out(`  [SỔ PROXY]:\n    ${proxy.events.slice(-25).join("\n    ")}`);
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

    // =========================================================================
    // CA 5: đang ĐI BỘ mà mạng đứng: chip "Mạng chậm" hiện sau ~SLOW_AFTER_MS (không phải đợi ping 5 giây + 8 giây), trước banner
    // =========================================================================
    out('\n--- Ca 5: Đang đi bộ mà mạng đứng: chip "Mạng chậm" hiện sớm ---');
    const NAME_5 = "Mang Cham Som";
    const SECRET_5 = "e2e_secret_heartbeat_55555555";
    await setIdentity(NAME_5, SECRET_5);
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập ca 5",
    );
    await tab.ev(
      `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME_5)}; document.getElementById('login-form').requestSubmit(); 1`,
    );
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game ca 5",
    );
    await tab.waitFor(shown("hud-name"), "đạo hiệu ca 5");
    await sleep(1500);
    if (await tab.ev(`!document.getElementById('net-slow')?.hidden`)) {
      throw new Error('Ca 5: chip "Mạng chậm" hiện khi mạng bình thường (báo nhầm)');
    }
    const key5 = (type: string) =>
      T.send("Input.dispatchKeyEvent", {
        type,
        key: "d",
        code: "KeyD",
        windowsVirtualKeyCode: 68,
      });
    await key5("rawKeyDown");
    // đi bộ 3 giây trên mạng thông: patch về đều, chip KHÔNG được hiện (kể cả khi chạm tường: input vẫn tiêu thụ và `lastSeq` vẫn tăng)
    for (let i = 0; i < 6; i++) {
      await sleep(500);
      await key5("rawKeyDown"); // phím lặp của hệ điều hành
      if (await tab.ev(`!document.getElementById('net-slow')?.hidden`)) {
        throw new Error('Ca 5: chip "Mạng chậm" hiện khi đang đi bộ trên mạng thông (báo nhầm)');
      }
    }
    out("  ✓ Đi bộ 3 giây trên mạng thông: không báo nhầm");
    const t5 = Date.now();
    proxy.setBlackhole(true);
    // vẫn giữ D (phím lặp) trong lúc mạng đứng
    let chip5Ms = -1;
    for (let waited = 0; waited < 9000; waited += 250) {
      await sleep(250);
      await key5("rawKeyDown");
      if (await tab.ev(shown("net-slow"))) {
        chip5Ms = Date.now() - t5;
        break;
      }
    }
    const chip5Max = SLOW_AFTER_MS + SLOW_POLL_MS + 1500;
    const banner5 = Boolean(await tab.ev(`!document.getElementById('reconnect-banner')?.hidden`));
    if (chip5Ms < 0 || chip5Ms > chip5Max || banner5) {
      throw new Error(
        `Ca 5: chip "Mạng chậm" hiện sau ${chip5Ms}ms (cần <= ${chip5Max}ms, khi đang đi bộ) và trước banner (banner đã hiện: ${banner5})`,
      );
    }
    out(
      `  ✓ Đang đi bộ, mạng đứng: chip "Mạng chậm" hiện sau ${chip5Ms}ms (ngưỡng <= ${chip5Max}ms), banner nối lại chưa hiện`,
    );
    await key5("keyUp");
    proxy.setBlackhole(false);
    proxy.dropAll();
    await tab.waitFor(
      `(() => { const b = document.getElementById('reconnect-banner'); return !b || b.hidden; })() && !!window.__scene?.room?.connection?.isOpen`,
      "nối lại xong ca 5",
      25000,
    );
    await tab.waitFor(
      `document.getElementById('net-slow')?.hidden !== false`,
      "chip tắt sau khi nối lại ca 5",
      5000,
    );
    out('  ✓ Nối lại xong: chip "Mạng chậm" đã tắt');

    // =========================================================================
    // CA 6 (mục 33, cần máy chủ có `net-guard`): đường hầm ĐỨNG rồi thông lại (stall, byte bị hoãn chứ không mất)
    // =========================================================================
    out(
      "\n--- Ca 6: Đường hầm đứng 5 giây rồi thông: máy chủ ghost sau 3 giây, có tin lại thì hộ thể 3 giây ---",
    );
    const NAME_6 = "Duong Ham Dung";
    const SECRET_6 = "e2e_secret_heartbeat_66666666";
    await setIdentity(NAME_6, SECRET_6);
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập ca 6",
    );
    await tab.ev(
      `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME_6)}; document.getElementById('login-form').requestSubmit(); 1`,
    );
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game ca 6",
    );
    await tab.waitFor(shown("hud-name"), "đạo hiệu ca 6");
    await sleep(2500); // vài nhịp 1 giây đầu: máy chủ đã ghi nhận tin của client
    const sp6 = await serverPlayer();
    if (sp6.ctrl.beatMs !== NET_BEAT_MS) {
      throw new Error(
        `Ca 6: máy chủ không ghi nhận nhịp client khai (beatMs=${sp6.ctrl.beatMs}, cần ${NET_BEAT_MS})`,
      );
    }
    if (sp6.ctrl.silent || sp6.world.ghosts.has(sp6.sid))
      throw new Error("Ca 6: ghost oan khi mạng bình thường");
    out(`  ✓ Máy chủ ghi nhận beatMs=${sp6.ctrl.beatMs} của client; mạng thông: không ghost oan`);
    const t6 = Date.now();
    proxy.setStall(true);
    await until(
      async () => Boolean((await serverPlayer()).ctrl?.silent),
      "máy chủ coi im lặng quá 3 giây là hồn lìa xác",
      8000,
    );
    const ghostMs = Date.now() - t6;
    const sp6b = await serverPlayer();
    if (!sp6b.world.ghosts.has(sp6b.sid))
      throw new Error("Ca 6: silent nhưng không nằm trong world.ghosts");
    // im lặng tính từ TIN CUỐI (có thể trước t6 tới một nhịp): ghost sau 3-4 giây kể từ lúc đứng
    if (ghostMs < 2000 || ghostMs > 5500)
      throw new Error(`Ca 6: ghost sau ${ghostMs}ms (cần ~3000-4000)`);
    out(
      `  ✓ Máy chủ: hồn lìa xác sau ${ghostMs}ms im lặng, socket vẫn mở (bất tử, quái bỏ mục tiêu)`,
    );
    await tab.waitFor(shown("net-slow"), 'dải "Mất kết nối" hiện trong lúc đứng', 4000);
    if (await tab.ev(`!document.getElementById('reconnect-banner')?.hidden`)) {
      throw new Error("Ca 6: banner nối lại hiện (socket chưa chết, chỉ đứng)");
    }
    out('  ✓ Client: dải "Mất kết nối — nhân vật đang được bảo vệ" hiện, chưa có banner nối lại');
    proxy.setStall(false); // thông lại: tin dồn ứ tới máy chủ
    await until(
      async () => !(await serverPlayer()).ctrl?.silent,
      "có tin lại: máy chủ cho ra khỏi hồn lìa xác",
      5000,
    );
    const sp6c = await serverPlayer();
    if (sp6c.world.ghosts.has(sp6c.sid))
      throw new Error("Ca 6: còn trong world.ghosts sau khi có tin lại");
    if (!sp6c.world.shielded.has(sp6c.sid))
      throw new Error("Ca 6: không được hộ thể sau khi có tin lại");
    out("  ✓ Máy chủ: có tin lại thì ra khỏi hồn lìa xác và được hộ thể 3 giây");
    await tab.waitFor(
      `!!window.__scene?.shieldRing?.visible && /Hộ thể/.test(window.__scene?.shieldText?.text ?? '')`,
      "client nhận netShield: vầng sáng + chữ Hộ thể",
      4000,
    );
    out("  ✓ Client: nhận netShield, vầng sáng + chữ Hộ thể hiện");
    await tab.waitFor(
      `[...document.querySelectorAll('#toast p')].some((p) => p.textContent.includes('Đã kết nối lại'))`,
      'toast "Đã kết nối lại" khi tín hiệu về',
      5000,
    );
    await tab.waitFor(
      `document.getElementById('net-slow')?.hidden !== false`,
      "dải tắt khi tín hiệu về",
      5000,
    );
    await tab.waitFor(`!window.__scene?.shieldRing?.visible`, "hộ thể hết sau ~3 giây", 6000);
    await until(
      async () => !(await serverPlayer()).world.shielded.has(sp6c.sid),
      "máy chủ gỡ hộ thể",
      5000,
    );
    out("  ✓ Hộ thể hết đúng hạn ở cả máy chủ lẫn client; không ngắt kết nối, không nối lại");

    // =========================================================================
    // CA 7 (#873, hướng 2): ĐỘ TRỄ MẠNG thật -> `lastRttMs` (trung vị 5 pong) -> vùng báo + thanh gồng rút ngắn CÙNG một mức; HUD ?perf=1 ghi RTT
    // =========================================================================
    out(
      "\n--- Ca 7: Độ trễ mạng giả lập (proxy): RTT đo được từ pong, vùng báo + thanh gồng rút ngắn đúng mức, HUD ?perf=1 ---",
    );
    // Mô phỏng runner CI chậm (nightly 17/11 đo RTT ~45 ms vì pong chờ luồng chính của Chrome WebGL mềm): E2E_NEN_MS = độ trễ MỖI CHIỀU (ms) làm "nền" của ca 7
    // (RTT nền ~ 2 x giá trị này; 22 -> ~45 ms). Mặc định 0 = mạng cục bộ thật.
    const NEN_MS = Math.max(0, Number(process.env.E2E_NEN_MS ?? "0") || 0);
    proxy.setDelay(NEN_MS);
    const NAME_7 = "Do Tre Mang";
    const SECRET_7 = "e2e_secret_heartbeat_77777777";
    await setIdentity(NAME_7, SECRET_7);
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug&perf=1` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập ca 7",
    );
    await tab.ev(
      `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME_7)}; document.getElementById('login-form').requestSubmit(); 1`,
    );
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game ca 7",
    );
    await tab.waitFor(shown("hud-name"), "đạo hiệu ca 7");
    /** Chờ trung vị RTT của nhịp tim nằm trong [lo, hi] (ms): cần vài pong mới sau khi đổi độ trễ */
    const waitRtt = async (lo: number, hi: number, what: string, timeoutMs = 20000) => {
      await tab!.waitFor(
        `(() => { const r = window.__heartbeat?.lastRttMs; return typeof r === 'number' && r >= ${lo} && r <= ${hi}; })()`,
        what,
        timeoutMs,
      );
      return Number(await tab!.ev(`window.__heartbeat.lastRttMs`));
    };
    /** Phát MỘT cặp fx (vùng báo `warn` + `bossCast`) cùng `ms` qua bộ xử lý thật của cảnh rồi đọc `ms` hiệu dụng của cả hai */
    const castAndRead = async (ms: number) =>
      (await tab!.ev(`(() => {
        const sc = window.__scene;
        sc.telegraphs.clear(); sc.bossFx.clear();
        const me = sc.me();
        const x = me.px ?? me.x, y = me.py ?? me.y;
        sc.onFx({ kind: 'bossCast', by: 'e2e_boss', x, y, ability: 'quat_duoi', ms: ${ms} });
        sc.onFx({ kind: 'warn', shape: 'circle', x, y, r: 100, ms: ${ms} });
        const w = sc.telegraphs.snapshot(sc.time.now).warns;
        const c = sc.bossFx.castTiming('e2e_boss', sc.time.now);
        return { rings: w.length, ringMs: w[0]?.ms, castMs: c?.castMs, rtt: window.__heartbeat.lastRttMs };
      })()`)) as { rings: number; ringMs: number; castMs: number; rtt: number };

    /**
     * Thời gian vùng báo / thanh gồng DỰ KIẾN (ms) khi máy chủ báo `ms` và RTT đo được là `rtt`: `ms` trừ độ bù = clamp(RTT + 10, 0, min(250, 30 % x ms))
     * (cùng công thức `warnCompMs` ở `client/src/net-latency.ts`; sao lại ở đây để kịch bản không phụ thuộc mã dưới test). RTT đọc CÙNG lúc với vùng báo
     * (`castAndRead.rtt`), nên không lệch do trung vị trôi giữa hai lần đọc.
     */
    const expectShown = (ms: number, rtt: number) =>
      ms - Math.min(250, 0.3 * ms, Math.max(0, rtt + 10));
    // (a) mạng cục bộ (không trễ): RTT nhỏ. Trần 120 ms (không phải 40): máy chủ chạy chung với Chrome WebGL mềm trên runner CI hai lõi đo ~40-50 ms
    // vì pong chờ luồng chính của Chrome (nightly 17/11: 'RTT < 40 ms' hết giờ ở CẢ HAI lần thử), nhưng vẫn thấp hơn xa mức 150+ của ca (b)
    const rtt0 = await waitRtt(0, 120, "RTT đo được trên đường cục bộ (< 120 ms)");
    out(`  ✓ Không trễ: lastRttMs = ${rtt0.toFixed(1)} ms (trung vị 5 pong)`);
    if (Number(await tab.ev(`typeof window.__scene.rttSource() === 'number' ? 1 : 0`)) !== 1)
      throw new Error("Ca 7: rttSource của cảnh không đọc được số từ nhịp tim thật");
    await tab.waitFor(
      `/^\\d+ ms$/.test(document.getElementById('perf-rtt')?.textContent ?? '')`,
      "HUD ?perf=1 ghi RTT dạng 'N ms'",
      5000,
    );
    const c0 = await castAndRead(1000);
    // bù = RTT + 10 nên vùng báo phải NGẮN HƠN 1000 (đã bù) và bằng đúng 1000 - (RTT + 10) theo RTT lúc phát; thanh gồng PHẢI bằng vùng báo
    if (
      c0.rings !== 1 ||
      c0.ringMs > 995 ||
      Math.abs(c0.ringMs - expectShown(1000, c0.rtt)) > 1 ||
      c0.castMs !== c0.ringMs
    )
      throw new Error(
        `Ca 7: không trễ (RTT ${c0.rtt}) nhưng vùng báo ${c0.ringMs} (cần ${expectShown(1000, c0.rtt)}) / thanh gồng ${c0.castMs}`,
      );
    out(
      `  ✓ Vùng báo = thanh gồng = ${c0.ringMs.toFixed(1)} ms (bù = RTT ${c0.rtt.toFixed(1)} + 10, báo trước 1000)`,
    );

    // (b) trễ 80 ms mỗi chiều (RTT ~160): trung vị đo được ~160; vùng báo ~ 1000 - (RTT + 10)
    proxy.setDelay(80);
    // 160 ms do proxy + nền của máy (~1 ms máy nhanh, ~45 ms runner CI): trần 320 giữ chỗ cho nền chậm, vẫn tách xa ca (c) 650+
    const rtt1 = await waitRtt(150, 320, "RTT ~160 ms sau khi đặt trễ 80 ms mỗi chiều");
    out(`  ✓ Trễ 80 ms mỗi chiều: lastRttMs = ${rtt1.toFixed(1)} ms`);
    // HUD cập nhật ~4 lần / giây (chậm hơn nhịp pong một chút): chờ tới khi ghi đúng số trung vị hiện tại
    await tab.waitFor(
      `(() => {
        const m = /^(\\d+) ms$/.exec(document.getElementById('perf-rtt')?.textContent ?? '');
        const r = window.__heartbeat.lastRttMs;
        return !!m && typeof r === 'number' && Math.abs(Number(m[1]) - r) <= 10;
      })()`,
      "HUD ?perf=1 ghi RTT khớp lastRttMs (lệch <= 10 ms)",
      5000,
    );
    const hud1 = String(await tab.ev(`document.getElementById('perf-rtt').textContent`));
    out(`  ✓ HUD ?perf=1 ghi "${hud1}"`);
    const c1 = await castAndRead(1000);
    // RTT 150..320 -> bù 160..270, KẸP 250 -> vùng 750..840 (và thanh gồng PHẢI bằng vùng báo)
    if (c1.rings !== 1 || c1.ringMs < 720 || c1.ringMs > 845 || c1.castMs !== c1.ringMs)
      throw new Error(`Ca 7: trễ 160 ms mà vùng báo ${c1.ringMs} / thanh gồng ${c1.castMs}`);
    out(
      `  ✓ RTT ${c1.rtt.toFixed(0)} ms: vùng báo = thanh gồng = ${c1.ringMs.toFixed(1)} ms / 1000`,
    );

    // (c) trễ 400 ms mỗi chiều (RTT ~800, xấu): bù KẸP 250 ms (báo trước dài) và 30 % (báo trước ngắn), vùng báo không biến mất
    proxy.setDelay(400);
    await waitRtt(650, 1000, "RTT ~800 ms sau khi đặt trễ 400 ms mỗi chiều", 30000);
    const c2 = await castAndRead(1000);
    if (c2.rings !== 1 || Math.abs(c2.ringMs - 750) > 1e-6 || c2.castMs !== c2.ringMs)
      throw new Error(`Ca 7: RTT hỏng (800) mà vùng báo ${c2.ringMs} (cần 750 = kẹp 250 ms)`);
    const c3 = await castAndRead(800);
    if (c3.rings !== 1 || Math.abs(c3.ringMs - 560) > 1e-6 || c3.castMs !== c3.ringMs)
      throw new Error(`Ca 7: RTT 800, báo trước 800: vùng báo ${c3.ringMs} (cần 560 = kẹp 30 %)`);
    out("  ✓ RTT ~800: bù KẸP 250 ms (báo 1000 -> 750) và 30 % (báo 800 -> 560), không biến mất");
    if (await tab.ev(`!document.getElementById('reconnect-banner')?.hidden`))
      throw new Error("Ca 7: banner nối lại hiện khi chỉ có độ trễ");

    // (d) hết trễ: trung vị trôi về nhỏ, vùng báo trở lại gần nguyên
    proxy.setDelay(NEN_MS);
    await waitRtt(0, 120, "RTT về nhỏ sau khi bỏ độ trễ", 30000);
    const c4 = await castAndRead(1000);
    if (
      c4.rings !== 1 ||
      Math.abs(c4.ringMs - expectShown(1000, c4.rtt)) > 1 ||
      c4.ringMs < 800 ||
      c4.castMs !== c4.ringMs
    )
      throw new Error(
        `Ca 7: hết trễ (RTT ${c4.rtt}) mà vùng báo ${c4.ringMs} (cần ${expectShown(1000, c4.rtt)})`,
      );
    out(`  ✓ Hết trễ: vùng báo trở lại ${c4.ringMs.toFixed(1)} ms`);

    if (tab.errors.length) {
      throw new Error(`Có lỗi console trong quá trình test: ${tab.errors.join("; ")}`);
    }
    out("  ✓ 0 lỗi console / exception trong toàn bộ 7 ca");

    out("\n=== TẤT CẢ 7 CA E2E NHỊP TIM ĐỀU ĐẠT ===");
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
        if (tab.consoleTail.length)
          out(`  [CONSOLE TAIL]:\n    ${tab.consoleTail.slice(-10).join("\n    ")}`);
        if (tab.errors.length) out(`  [TAB ERRORS]:\n    ${tab.errors.join("\n    ")}`);
        if (serverLogs.length) out(`  [SERVER LOGS]:\n    ${serverLogs.slice(-10).join("\n    ")}`);
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
    killChrome(chrome); // cả nhóm tiến trình (detached), không chỉ tiến trình gốc
    await proxy.close();
    await new Promise<void>((r) => httpServer.close(() => r()));
    // false: mặc định Colyseus GỌI process.exit ngay trong gracefullyShutdown nên các dòng dọn dẹp phía sau không bao giờ chạy (sót thư mục /tmp/tien-gioi-e2e-*)
    await gameServer.gracefullyShutdown(false);
    await removeTmpDirs(dataDir, chromeDir);
  }

  // thoát tường minh (cùng chat-luong / dpr): gracefullyShutdown(false) không còn tự thoát, và thoát mã 1 khi đỏ
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Lỗi thực thi main:", err);
  process.exit(1);
});
