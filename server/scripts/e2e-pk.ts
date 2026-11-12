// E2E THẬT PK thách đấu (M3.5): server Colyseus thật (trong tiến trình, thư mục dữ liệu tạm) phục vụ client/dist, HAI tab Chrome
// headless điều khiển bằng CDP (hai nguồn 127.0.0.1 / localhost để không chung localStorage). Luồng qua giao diện thật: bấm vào người
// chơi khác (chuột thật qua CDP) -> menu có nút "Thách Đấu" -> bấm -> người kia nhận hộp mời -> TỪ CHỐI (người thách nhận toast) ->
// thách lại -> NHẬN -> đếm ngược 3-2-1 -> HUD quyết đấu (đối thủ, thanh máu, Đầu hàng) -> A đánh bằng đòn chém của client thật
// (máu B đặt về 1 phía server) -> màn kết quả (A thắng, B thua) -> B gục rồi đứng dậy TẠI CHỖ, KHÔNG có màn Hoàng Tuyền và KHÔNG
// có chữ "Hồi sinh tại Lạc Hà Trấn" -> hồ sơ B không `limbo`, vẫn ở Lạc Hà. Không lỗi console, không cảnh báo mất tin lúc vào phòng.
// Thoát 0 khi đạt, 1 khi sai. Không ghi vào `server/data/players` thật.
//
// Chạy: `npm run build && npm run e2e:pk` (cần google-chrome; client/dist phải là bản build mới).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import WebSocket from "ws";
import { DEFAULT_MAP, DEFAULT_MAP_ID, roomNameOf } from "@tien-gioi/shared";
import { shown, listenWithRetry, removeTmpDirs } from "./e2e-kit";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 36000 + Math.floor(Math.random() * 4000);
let PORT = pickPort();
const CDP = 9500 + Math.floor(Math.random() * 400);
const SHOTS = process.env.E2E_SHOTS ? path.resolve(process.env.E2E_SHOTS) : undefined;
const TIMEOUT = 15000;
const sha1 = (s: string) =>
  createHash("sha1").update(s.normalize("NFC").toLowerCase().trim()).digest("hex");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const out = (m: string) => console.log(m);

const A = { name: "Dau Si Mot", secret: "e2e_secret_dau_si_01_abcdefghij", host: "127.0.0.1" };
const B = { name: "Dau Si Hai", secret: "e2e_secret_dau_si_02_abcdefghij", host: "localhost" };

/** Một tab Chrome điều khiển bằng CDP. Gom lỗi console / exception để E2E thất bại nếu có. */
class Tab {
  private id = 0;
  private pending = new Map<number, (r: any) => void>();
  readonly errors: string[] = [];
  private constructor(
    readonly label: string,
    private ws: WebSocket,
  ) {
    ws.onmessage = (event) => {
      try {
        const d = JSON.parse(String(event.data));
        if (d.id && this.pending.has(d.id)) {
          this.pending.get(d.id)!(d);
          this.pending.delete(d.id);
          return;
        }
        if (d.method === "Runtime.exceptionThrown")
          this.errors.push(`EXCEPTION: ${JSON.stringify(d.params.exceptionDetails).slice(0, 300)}`);
        if (d.method === "Runtime.consoleAPICalled") {
          const type = d.params.type;
          const text = (d.params.args ?? [])
            .map((a: any) => a.value ?? a.description ?? "")
            .join(" ");
          if (type === "error") this.errors.push(`CONSOLE ERROR: ${text.slice(0, 300)}`);
          else if (
            type === "warning" &&
            (text.includes("onMessage() not registered") || text.includes("unhandled"))
          )
            this.errors.push(`CONSOLE WARN: ${text.slice(0, 300)}`);
        }
      } catch {
        /* bỏ qua thông điệp không parse được */
      }
    };
  }

  static async open(label: string, wsUrl: string): Promise<Tab> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(new Error(`CDP ${label}: ${String(e)}`));
    });
    const t = new Tab(label, ws);
    await t.send("Page.enable");
    await t.send("Runtime.enable");
    // Tab nền không bị Chrome làm chậm (cả hai tab phải chạy như đang được xem)
    await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await t.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    return t;
  }

  send(method: string, params: Record<string, any> = {}) {
    return new Promise<any>((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async ev(expr: string) {
    const r = await this.send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error(
        `${this.label}: evaluate lỗi: ${JSON.stringify(r.result.exceptionDetails).slice(0, 300)}`,
      );
    return r.result?.result?.value;
  }

  async waitFor(expr: string, label: string, timeout = TIMEOUT) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (await this.ev(expr)) return;
      } catch {
        /* đang chờ điều kiện thoả mãn */
      }
      await sleep(100);
    }
    throw new Error(`Hết thời gian chờ (${timeout}ms) ở ${this.label}: ${label}`);
  }

  async shot(file: string) {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(
      path.join(SHOTS, `${this.label}-${file}.png`),
      Buffer.from(r.result.data, "base64"),
    );
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* bỏ qua */
    }
  }
}

async function main() {
  out("=== E2E THẬT PK thách đấu: hai tab Chrome headless + server Colyseus thật ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-pk-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-pk-chrome-"));
  // `store.ts` đọc DATA_DIR LÚC NẠP MODULE: nạp WorldRoom (kéo theo store) SAU khi đặt biến môi trường
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");

  const now = new Date().toISOString();
  mkdirSync(path.join(dataDir, "souls"), { recursive: true });
  for (const p of [A, B]) {
    writeFileSync(
      path.join(dataDir, `${sha1(p.name)}.json`),
      JSON.stringify({
        name: p.name,
        secretHash: sha256(p.secret),
        realm: 1,
        tier: 8,
        exp: 0,
        coin: 0,
        mapId: DEFAULT_MAP_ID,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

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
  out(`- Server E2E: http://127.0.0.1:${PORT} (dữ liệu tạm ${dataDir})`);

  let chrome: ChildProcess | null = null;
  const tabs: Tab[] = [];
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
    let spawnError: Error | null = null;
    chrome.once("error", (e) => (spawnError = e));
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
    if (spawnError)
      throw new Error(`Không chạy được google-chrome: ${(spawnError as Error).message}`);
    const first = targets.find((t) => t.type === "page");
    if (!first?.webSocketDebuggerUrl) throw new Error("Không kết nối được Chrome DevTools");
    const second = await (
      await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: "PUT" })
    ).json();
    const ta = await Tab.open("A", first.webSocketDebuggerUrl);
    const tb = await Tab.open("B", (second as any).webSocketDebuggerUrl);
    tabs.push(ta, tb);

    // 1. Đăng nhập cả hai (form thật) vào Lạc Hà
    for (const [tab, p] of [
      [ta, A],
      [tb, B],
    ] as const) {
      await tab.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(p.name)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(p.secret)});`,
      });
      await tab.send("Page.navigate", { url: `http://${p.host}:${PORT}/?debug` });
    }
    for (const tab of tabs) {
      await tab.waitFor(
        `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
        "form đăng nhập",
      );
      await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    }
    for (const tab of tabs)
      await tab.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "vào Lạc Hà",
      );

    // Đặt hai người ngoài trấn, cạnh nhau (phía server), dọn quái hoang để không ai bị đánh làm "bận"
    const roomId = (await matchMaker.query({ name: roomNameOf(DEFAULT_MAP_ID) }))[0].roomId;
    const world = (matchMaker.getLocalRoomById(roomId) as any).world;
    const sids = new Map<string, string>();
    world.state.players.forEach((p: any, sid: string) => sids.set(p.name, sid));
    const pa = world.state.players.get(sids.get(A.name));
    const pb = world.state.players.get(sids.get(B.name));
    const calm = () => {
      world.state.monsters.clear();
      world.mctrl.clear();
      for (const sid of sids.values()) world.ctrl.get(sid).lastHitAt = 0;
    };
    pa.x = DEFAULT_MAP.townPx.x + DEFAULT_MAP.townPx.r + 500;
    pa.y = pb.y = DEFAULT_MAP.townPx.y;
    pb.x = pa.x + 45;
    calm();
    for (const tab of tabs) {
      await tab.waitFor(
        `[...window.__scene.state.players.values()].filter(p => Math.abs((p.px ?? p.x) - ${Math.round(pa.x)}) < 120).length === 2`,
        "hai người ở chỗ mới",
      );
    }
    out("  ✓ [1/7] Hai người chơi vào Lạc Hà (form thật), đứng ngoài trấn cạnh nhau");

    // 2. A bấm chuột (thật, qua CDP) vào B: menu có nút "Thách Đấu" bấm được
    const clickOn = async (tab: Tab, name: string) => {
      // Vị trí VẼ của người đó (`root`, đã nội suy): đúng thứ `tryClickPlayer` so với con trỏ (trong 28 px)
      const pos = await tab.ev(
        `(() => { const s = window.__scene; const cam = s.cameras.main; const [, e] = [...s.players.entries()].find(([id]) => s.state.players.get(id)?.name === ${JSON.stringify(name)}); return { x: (e.root.x - cam.worldView.x) * cam.zoom, y: (e.root.y - cam.worldView.y) * cam.zoom }; })()`,
      );
      for (const type of ["mousePressed", "mouseReleased"])
        await tab.send("Input.dispatchMouseEvent", {
          type,
          x: pos.x,
          y: pos.y,
          button: "left",
          clickCount: 1,
        });
    };
    const tap = (tab: Tab, id: string) =>
      tab.ev(
        `document.getElementById(${JSON.stringify(id)}).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); 1`,
      );
    const challenge = async () => {
      await clickOn(ta, B.name);
      await ta.waitFor(shown("player-menu"), "menu người chơi");
      await ta.waitFor(
        `!document.getElementById('pm-duel-btn').disabled`,
        "nút Thách Đấu bấm được",
      );
      await tap(ta, "pm-duel-btn");
      await tb.waitFor(shown("duel-invite-box"), "hộp lời thách");
    };
    await challenge();
    await ta.shot("1-menu-ok");
    await tb.shot("2-invite");
    const msg = await tb.ev(`document.getElementById('duib-msg').textContent`);
    if (!msg.includes(A.name)) throw new Error(`Hộp mời phải nêu "${A.name}", thực tế "${msg}"`);
    out("  ✓ [2/7] A bấm vào B -> Thách Đấu; B nhận hộp lời mời nêu đúng tên người thách");

    // 3. B từ chối: A nhận toast
    await tap(tb, "duib-btn-decline");
    await ta.waitFor(
      `/từ chối/.test(document.getElementById('toast')?.textContent || '')`,
      "toast từ chối của A",
    );
    if (world.duels.size !== 0) throw new Error("Từ chối thì không được có trận");
    world.duels.clear(); // bỏ hồi chiêu để thách lại ngay
    out("  ✓ [3/7] B từ chối: A nhận toast, không có trận");

    // 4. Thách lại, B nhận: đếm ngược 3-2-1 rồi HUD quyết đấu
    calm();
    await challenge();
    await tap(tb, "duib-btn-accept");
    for (const tab of tabs) await tab.waitFor(shown("duel-countdown-overlay"), "đếm ngược 3-2-1");
    await ta.shot("3-countdown");
    const vs = await ta.ev(`document.getElementById('dco-vs').textContent`);
    if (!vs.includes(B.name))
      throw new Error(`Đếm ngược phải nêu đối thủ "${B.name}", thực tế "${vs}"`);
    if (!(world.duels.size === 1 && pa.duel === true && pb.duel === true))
      throw new Error("Trận chưa bắt đầu đúng ở server");
    world.duels.all()[0].fightAt = Date.now() - 1; // bỏ chờ đếm ngược
    for (const tab of tabs) await tab.waitFor(shown("duel-hud"), "HUD quyết đấu");
    const oppA = await ta.ev(`document.getElementById('duel-hud-opponent').textContent`);
    if (oppA !== B.name)
      throw new Error(`HUD của A phải ghi đối thủ "${B.name}", thực tế "${oppA}"`);
    await ta.waitFor(
      `[...window.__scene.players.values()].some(e => (e.lastLabel || '').includes('⚔'))`,
      "dấu ⚔ trên đầu người trong trận",
    );
    await ta.shot("4-hud");
    out(
      "  ✓ [4/7] B nhận: đếm ngược 3-2-1 nêu đối thủ, rồi HUD quyết đấu (tên đối thủ, thanh máu) + dấu ⚔",
    );

    // 5. A đánh bằng đòn chém của client thật; máu B đặt về 1 phía server
    pb.hp = 1;
    const at = { x: pb.x, y: pb.y };
    for (let i = 0; i < 30 && world.duels.size > 0; i++) {
      await ta.ev(`window.__scene.slash(0); 1`);
      await sleep(450);
    }
    if (world.duels.size > 0) throw new Error("Trận chưa kết thúc sau các đòn của client");
    out("  ✓ [5/7] A hạ B bằng đòn chém của client thật");

    // 6. Màn kết quả; B gục: KHÔNG hiện màn Hoàng Tuyền, KHÔNG hiện chữ hồi sinh ở trấn; rồi đứng dậy tại chỗ
    await ta.waitFor(shown("duel-end-modal"), "màn kết quả của A");
    await tb.waitFor(shown("duel-end-modal"), "màn kết quả của B");
    const titleA = await ta.ev(`document.getElementById('duend-title').textContent`);
    const titleB = await tb.ev(`document.getElementById('duend-title').textContent`);
    const reasonB = await tb.ev(`document.getElementById('duend-reason').textContent`);
    if (!/THẮNG/i.test(titleA)) throw new Error(`A phải thắng, thực tế "${titleA}"`);
    if (!/BẠI/i.test(titleB)) throw new Error(`B phải thua, thực tế "${titleB}"`);
    if (!/gục/.test(reasonB))
      throw new Error(`Lý do của B phải nêu bị đánh gục, thực tế "${reasonB}"`);
    await tb.shot("5-lost");
    await ta.shot("6-won");
    const limboOpen = await tb.ev(shown("limbo-overlay"));
    if (limboOpen) throw new Error("Thua thách đấu KHÔNG được mở màn Hoàng Tuyền");
    // B đang gục (3 giây): lớp phủ "chết" không được hứa hồi sinh ở Lạc Hà Trấn (người thua đứng dậy TẠI CHỖ)
    const deathText = await tb.ev(
      `(() => { const d = document.getElementById('death'); return d && !d.hidden ? (document.getElementById('death-t')?.textContent || '') : ''; })()`,
    );
    if (/Lạc Hà Trấn/.test(deathText))
      throw new Error(
        `B gục vì thách đấu mà lớp phủ vẫn ghi "${deathText}" (phải đứng dậy tại chỗ, không về trấn)`,
      );
    await tb.waitFor(`!window.__scene.me().dead`, "B đứng dậy", 8000);
    if (pb.dead || Math.hypot(pb.x - at.x, pb.y - at.y) > 1)
      throw new Error("B phải đứng dậy ĐÚNG CHỖ ngã");
    if (!(pb.hp > 1)) throw new Error("B đứng dậy với khí huyết hồi lại (30%)");
    if (pa.duel || pb.duel) throw new Error("Cờ duel phải tắt sau trận");
    await tb.waitFor(`document.getElementById('death').hidden`, "lớp phủ gục tắt");
    out(
      `  ✓ [6/7] Màn kết quả: A "${titleA}", B "${titleB}" (${reasonB}); B gục rồi đứng dậy tại chỗ, không Hoàng Tuyền`,
    );

    // 7. Không mất kiếp: hồ sơ B không `limbo`, vẫn ở Lạc Hà
    await (matchMaker.getLocalRoomById(roomId) as any).saveAll();
    const saves = new Map<string, any>();
    for (const f of readdirSync(dataDir).filter((x) => x.endsWith(".json"))) {
      const d = JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
      saves.set(d.name, d);
    }
    const sb = saves.get(B.name);
    if (sb.limbo) throw new Error("Hồ sơ B không được có limbo");
    if ((sb.mapId ?? DEFAULT_MAP_ID) !== DEFAULT_MAP_ID)
      throw new Error(`B phải ở Lạc Hà, thực tế ${sb.mapId}`);
    out("  ✓ [7/7] Không mất kiếp: hồ sơ B không limbo, vẫn ở Lạc Hà");

    const errors = tabs.flatMap((t) => t.errors.map((e) => `[${t.label}] ${e}`));
    if (errors.length > 0) {
      console.error("\n❌ LỖI / CẢNH BÁO TRÌNH DUYỆT:");
      for (const e of errors) console.error("   " + e);
      throw new Error(`E2E thất bại: ${errors.length} lỗi console`);
    }
    out("  ✓ 0 lỗi console, 0 exception, 0 cảnh báo mất tin lúc vào phòng.");
    out("\n🎉 E2E THẬT PK PASS 100%!\n");
  } catch (e: any) {
    console.error(`\n❌ E2E PK THẤT BẠI: ${e?.message || e}\n`);
    for (const t of tabs) for (const err of t.errors) console.error(`   [${t.label}] ${err}`);
    process.exitCode = 1;
  } finally {
    for (const t of tabs) t.close();
    if (chrome) {
      try {
        chrome.kill("SIGKILL");
      } catch {
        /* bỏ qua */
      }
    }
    await gameServer.gracefullyShutdown(false).catch(() => {});
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await sleep(500); // Chrome vừa bị kill còn đang đóng tệp
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(chromeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

main();
