// E2E THẬT Bí cảnh (M3.4): server Colyseus thật (trong tiến trình, thư mục dữ liệu tạm) phục vụ client/dist, HAI tab Chrome
// headless điều khiển bằng CDP (hai nguồn khác nhau 127.0.0.1 / localhost để không chung localStorage). Luồng qua giao diện
// thật: lập đội -> nói chuyện Thủ môn -> bấm "Mở Linh Hư Bí Cảnh" -> cả hai nhận hộp mời -> bấm "Vào Bí Cảnh" -> vào phòng bí
// cảnh bằng joinById (HUD, thanh máu trùm, danh sách đội) -> hạ trùm (máu trùm đặt về 1 phía server, đòn đánh là của client
// thật) -> màn kết quả (thưởng cho người đánh, "chưa gây sát thương" cho người không đánh) -> hết thời gian nhặt đồ (rút ngắn)
// -> cả hai về Lạc Hà -> hồ sơ đúng (lượt thưởng ngày, bản đồ Lạc Hà). Không lỗi console, không cảnh báo mất tin lúc vào phòng.
// Thoát 0 khi đạt, 1 khi sai. Không ghi vào `server/data/players` thật.
//
// Chạy: `npm run build && npm run e2e:bi-canh` (cần google-chrome; client/dist phải là bản build mới).
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
import {
  DEFAULT_MAP_ID,
  LINH_HU_ID,
  LINH_HU_MAP_ID,
  NPC_BY_ID,
  dayKey,
  dungeonOf,
} from "@tien-gioi/shared";
import { shown, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";

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

const A = { name: "Dao Truong Mot", secret: "e2e_secret_dao_truong_01_abcdef", host: "127.0.0.1" };
const B = { name: "Dao Huu Hai", secret: "e2e_secret_dao_huu_02_abcdefgh", host: "localhost" };

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
  out("=== E2E THẬT Bí cảnh: hai tab Chrome headless + server Colyseus thật ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-bc-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-bc-chrome-"));
  // `store.ts` đọc DATA_DIR LÚC NẠP MODULE: nạp WorldRoom (kéo theo store) SAU khi đặt biến môi trường
  process.env.DATA_DIR = dataDir;
  const { defineRooms, WorldRoom } = await import("../src/rooms/WorldRoom.js");

  // Hai nhân vật Luyện Khí 9 (đủ `minStep`), đứng cạnh Thủ môn
  const gate = NPC_BY_ID.thu_mon;
  const now = new Date().toISOString();
  mkdirSync(path.join(dataDir, "souls"), { recursive: true });
  for (const [i, p] of [A, B].entries()) {
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
        x: Math.round(gate.x + (i === 0 ? 30 : -30)),
        y: Math.round(gate.y + 30),
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
        ...getChromeGpuFlags(),
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

    // 1. Đăng nhập cả hai bằng danh tính trong localStorage (mỗi tab một nguồn riêng)
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
    for (const tab of tabs) {
      await tab.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "vào Lạc Hà",
      );
      await tab.waitFor(
        `window.__scene.map.def.id === ${JSON.stringify(DEFAULT_MAP_ID)}`,
        "ở Lạc Hà",
      );
    }
    out("  ✓ [1/8] Hai người chơi vào Lạc Hà bằng giao diện thật");

    // 2. Lập đội (tin nhắn thật qua phòng; giao diện lập đội đã có test riêng)
    await ta.ev(`window.__scene.room.send('partyInvite', { name: ${JSON.stringify(B.name)} }); 1`);
    await sleep(800); // lời mời tới phòng của B
    await tb.ev(`window.__scene.room.send('partyAccept', { from: ${JSON.stringify(A.name)} }); 1`);
    for (let i = 0; i < 50 && WorldRoom.hub.parties.size < 1; i++) await sleep(100);
    if (WorldRoom.hub.parties.size < 1) throw new Error("Đội chưa lập được");
    out("  ✓ [2/8] Lập đội A (đội trưởng) + B");

    // 3. Đội trưởng nói chuyện Thủ môn và bấm "Mở Linh Hư Bí Cảnh"
    await ta.ev(`window.__scene.room.send('talk', { npcId: 'thu_mon' }); 1`);
    await ta.waitFor(
      `[...document.querySelectorAll('#dlg-options .dlg-opt-btn')].some(b => b.textContent.includes('Linh Hư Bí Cảnh') && !b.disabled)`,
      "nút Mở bí cảnh bấm được",
    );
    await ta.shot("1-dialog");
    await ta.ev(
      `[...document.querySelectorAll('#dlg-options .dlg-opt-btn')].find(b => b.textContent.includes('Linh Hư Bí Cảnh')).click(); 1`,
    );
    out("  ✓ [3/8] Hộp thoại Thủ môn có nút mở bí cảnh (đội đủ điều kiện), đã bấm");

    // 4. Cả hai nhận hộp mời và bấm Vào
    for (const tab of tabs) {
      await tab.waitFor(shown("dungeon-invite-box"), "hộp mời bí cảnh");
      const txt = await tab.ev(`document.getElementById('dib-rewards-left')?.textContent || ''`);
      if (!/3\/3/.test(txt))
        throw new Error(`${tab.label}: hộp mời phải báo 3/3 lượt thưởng, thực tế "${txt}"`);
    }
    await tb.shot("2-invite");
    for (const tab of tabs)
      await tab.ev(
        `document.getElementById('dib-btn-enter').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); 1`,
      );
    out("  ✓ [4/8] Cả hai nhận hộp mời (3/3 lượt thưởng) và bấm Vào");

    // 5. Vào phòng bí cảnh bằng joinById: HUD, bản đồ, thanh máu trùm, danh sách đội
    for (const tab of tabs) {
      await tab.waitFor(
        `window.__scene.map.def.id === ${JSON.stringify(LINH_HU_MAP_ID)}`,
        "vào bản đồ bí cảnh",
      );
      await tab.waitFor(
        `document.body.classList.contains('in-dungeon') && ${shown("dungeon-hud")}`,
        "HUD bí cảnh",
      );
      await tab.waitFor(shown("dhud-boss-wrap"), "thanh máu trùm");
    }
    await ta.waitFor(
      `document.getElementById('dhud-members').children.length === 2`,
      "danh sách đội đủ hai người",
    );
    await ta.shot("3-hud");
    const run = [...WorldRoom.hub.runs.all()][0];
    if (!run || run.phase !== "running")
      throw new Error(`Run phải đang chạy, thực tế ${run?.phase}`);
    out(
      "  ✓ [5/8] Cả hai vào phòng bí cảnh (joinById): HUD, thanh máu trùm, danh sách đội 2 người",
    );

    // 6. Hạ trùm: đặt máu trùm về 1 phía server, A đánh bằng chính client (`slash`), B đứng xem
    const room = matchMaker.getLocalRoomById(run.roomId!) as any;
    const world = room.world;
    const dun = dungeonOf(LINH_HU_ID)!;
    const lair = world.map.lairPx;
    const bossEntry = [...world.state.monsters.entries()].find(([, m]: any) => m.kind === dun.boss);
    if (!bossEntry) throw new Error("Không có trùm trong phòng");
    const [bossId, boss] = bossEntry as [string, any];
    if (Math.abs(boss.x - lair.x) > 1 || Math.abs(boss.y - lair.y) > 1)
      throw new Error("Trùm không ở tâm hang");
    boss.hp = 1;
    world.state.players.forEach((p: any) => {
      p.x = lair.x;
      p.y = lair.y + 70;
    });
    await sleep(300);
    for (let i = 0; i < 40 && world.state.monsters.has(bossId); i++) {
      await ta.ev(`window.__scene.slash(-Math.PI / 2); 1`);
      await sleep(250);
    }
    if (world.state.monsters.has(bossId)) throw new Error("Trùm chưa chết sau các đòn của client");
    out("  ✓ [6/8] A hạ trùm bằng đòn chém của client thật");

    // 7. Màn kết quả: A có thưởng, B (không đánh) có lý do
    await ta.waitFor(shown("dungeon-end-modal"), "màn kết quả của A");
    await tb.waitFor(shown("dungeon-end-modal"), "màn kết quả của B");
    const titleA = await ta.ev(`document.getElementById('dend-title').textContent`);
    const coinA = await ta.ev(`document.getElementById('dend-reward-coin')?.textContent || ''`);
    const itemsA = await ta.ev(
      `document.getElementById('dend-reward-items')?.children.length || 0`,
    );
    const leftA = await ta.ev(`document.getElementById('dend-rewards-left')?.textContent || ''`);
    if (!/THẮNG/i.test(titleA)) throw new Error(`Tiêu đề thắng sai: "${titleA}"`);
    if (!new RegExp(`\\+${dun.reward.coin}`).test(coinA))
      throw new Error(`Thưởng Linh thạch của A sai: "${coinA}"`);
    if (itemsA < 1) throw new Error("A phải có ít nhất một món đồ thưởng (tu_khi_dan chắc chắn)");
    if (!/2\/3/.test(leftA)) throw new Error(`A phải còn 2/3 lượt, thực tế "${leftA}"`);
    const noRewardB = await tb.ev(
      `document.getElementById('dend-no-reward')?.hidden ? '' : document.getElementById('dend-no-reward').textContent`,
    );
    if (!/chưa gây sát thương/.test(noRewardB))
      throw new Error(`B phải thấy lý do không có thưởng, thực tế "${noRewardB}"`);
    await ta.shot("4-won");
    await tb.shot("5-no-reward");
    out(
      `  ✓ [7/8] Màn kết quả: A "${titleA}" ${coinA}, ${itemsA} món, còn 2/3 lượt; B: "${noRewardB}"`,
    );

    // 8. Hết thời gian nhặt đồ (rút ngắn): cả hai về Lạc Hà, hồ sơ đúng
    (run as { exitAt: number | null }).exitAt = Date.now();
    for (const tab of tabs) {
      await tab.waitFor(
        `window.__scene.map.def.id === ${JSON.stringify(DEFAULT_MAP_ID)}`,
        "về Lạc Hà",
        20000,
      );
      await tab.waitFor(
        `!document.body.classList.contains('in-dungeon') && document.getElementById('dungeon-hud').hidden`,
        "HUD bí cảnh tắt",
      );
    }
    for (let i = 0; i < 50 && WorldRoom.hub.runs.size > 0; i++) await sleep(100);
    if (WorldRoom.hub.runs.size !== 0) throw new Error("Run chưa được dọn");
    const saves = new Map<string, any>();
    for (const f of readdirSync(dataDir).filter((x) => x.endsWith(".json"))) {
      const d = JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
      saves.set(d.name, d);
    }
    // Lưu định kỳ / lúc rời phòng: chờ bản ghi mới nhất của A có bộ đếm
    for (let i = 0; i < 50 && !saves.get(A.name)?.dungeonDaily; i++) {
      await sleep(200);
      for (const f of readdirSync(dataDir).filter((x) => x.endsWith(".json"))) {
        const d = JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
        saves.set(d.name, d);
      }
    }
    const sa = saves.get(A.name);
    const sb = saves.get(B.name);
    if (sa?.dungeonDaily?.day !== dayKey(Date.now()) || sa.dungeonDaily.rewards !== 1)
      throw new Error(
        `Hồ sơ A phải ghi 1 lượt thưởng hôm nay, thực tế ${JSON.stringify(sa?.dungeonDaily)}`,
      );
    if (sb?.dungeonDaily)
      throw new Error(`B không được ghi lượt thưởng, thực tế ${JSON.stringify(sb.dungeonDaily)}`);
    for (const s of [sa, sb])
      if (s.mapId !== DEFAULT_MAP_ID)
        throw new Error(`${s.name}: hồ sơ phải ở Lạc Hà, thực tế ${s.mapId}`);
    if (!(sa.coin >= dun.reward.coin))
      throw new Error(`Ví A phải >= ${dun.reward.coin}, thực tế ${sa.coin}`);
    await ta.shot("6-back-in-town");
    out(
      "  ✓ [8/8] Hết thời gian nhặt đồ: cả hai về Lạc Hà, run được dọn, hồ sơ A ghi 1 lượt thưởng + Linh thạch, B không",
    );

    const errors = tabs.flatMap((t) => t.errors.map((e) => `[${t.label}] ${e}`));
    if (errors.length > 0) {
      console.error("\n❌ LỖI / CẢNH BÁO TRÌNH DUYỆT:");
      for (const e of errors) console.error("   " + e);
      throw new Error(`E2E thất bại: ${errors.length} lỗi console`);
    }
    out("  ✓ 0 lỗi console, 0 exception, 0 cảnh báo mất tin lúc vào phòng.");
    out("\n🎉 E2E THẬT BÍ CẢNH PASS 100%!\n");
  } catch (e: any) {
    console.error(`\n❌ E2E BÍ CẢNH THẤT BẠI: ${e?.message || e}\n`);
    for (const t of tabs) for (const err of t.errors) console.error(`   [${t.label}] ${err}`);
    // Chẩn đoán: toast đang hiện ở từng tab và số run phía server
    for (const t of tabs)
      console.error(
        `   [${t.label}] toast: ${await t.ev(`[...document.querySelectorAll('#toasts > *, .toast')].map(e => e.textContent).join(' | ')`).catch(() => "(không đọc được)")}`,
      );
    console.error(`   server: ${WorldRoom.hub.runs.size} run, ${WorldRoom.hub.parties.size} đội`);
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
