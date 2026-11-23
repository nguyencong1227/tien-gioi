// E2E THẬT: GIỮ PHÍM DI CHUYỂN LIÊN TỤC LÂU → vị trí TĂNG ĐỀU (QUYET_DINH_M3 mục 25, #1383 Part 2).
// Server Colyseus thật + Chrome headless + phím THẬT qua CDP (isTrusted). Khác bước 8 của e2e-ban-phim (chỉ giữ 0,7s,
// chỉ khẳng định "đứng yên khi túi mở / đi khi túi đóng"): ca người dùng báo là GIỮ PHÍM LIÊN TỤC LÂU (tới ~30 giây) rồi
// nhân vật "giật / liệt nút" — vị trí KHÔNG tăng đều. Script này giữ mũi tên phải một nhịp dài, LẤY MẪU vị trí server (me.x,
// đọc thẳng state phòng, không qua mạng) nhiều mốc, rồi khẳng định: (1) đơn điệu không giảm (không giật lùi), (2) không interval
// nào đứng yên (KHÔNG "liệt nút" giữa đường), (3) mọi interval gần bằng trung vị (tăng đều, không burst), (4) thả phím thì dừng.
// Cơ chế token-bucket + cắt backlog của applyInputs (mục 41) là bất biến theo thời gian nên 6 giây đủ đại diện cho 30 giây;
// độ dài giữ lấy từ env E2E_KE_PHIM_MS (mặc định 6000) để chạy nhanh, có thể nâng lên 30000 khi muốn lặp ca thật.
// Chạy: `npm run e2e:ke-phim-dau-ban -w server`.
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_MAP_ID, roomNameOf, statsFor } from "@tien-gioi/shared";
import { Tab, sleep, listenWithRetry, getChromeGpuFlags } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 36000 + Math.floor(Math.random() * 4000);
let PORT = pickPort();
const CDP = 9500 + Math.floor(Math.random() * 400);
const out = (m: string) => console.log(m);
const NAME = "Cu Ky Duy Et";
const SECRET = "e2e_secret_ke_phim_abcdefghij";
const HOLD_MS = Math.max(3000, Number(process.env.E2E_KE_PHIM_MS ?? 6000));
const SAMPLE_MS = 350; // lấy mẫu vị trí server mỗi 350 ms (~10 tick)
const WARMUP_MS = 1200; // bỏ các mốc đầu (client mới bắt đầu gửi input, chưa ổn định)
const EPS = 0.5; // sai số float khi khẳng định đơn điệu (px)

interface Key {
  key: string;
  code: string;
  vk: number;
}
const K_RIGHT = { key: "ArrowRight", code: "ArrowRight", vk: 39 };
const K_ESC = { key: "Escape", code: "Escape", vk: 27 };

/** Phím thật qua CDP: nhấn / nhả bằng `rawKeyDown` / `keyUp` (giữ = nhấn rồi KHÔNG nhả ngay). */
function dispatchKey(tab: Tab, k: Key, type: "rawKeyDown" | "keyUp") {
  return tab.send("Input.dispatchKeyEvent", {
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
    type,
  });
}

/** Trung vị (số thực) của một mảng — dùng để tự hiệu chuẩn ngưỡng "tăng đều" mà không cần biết tốc độ tuyệt đối. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

async function main() {
  out(`=== E2E giữ phím di chuyển liên tục ${HOLD_MS} ms → vị trí tăng đều (mục 25) ===`);
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-kph-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-kph-chrome-"));
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
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(chromeDir, { recursive: true, force: true });
    throw err;
  }
  out(`- Server E2E: http://127.0.0.1:${PORT}`);

  let chrome: ReturnType<typeof spawn> | null = null;
  let tab: Tab | null = null;
  let fatal: string | null = null;
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    out(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` (${detail})`}`);
    if (!ok) failures.push(`${name}: ${detail}`);
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
      { stdio: "ignore" },
    );
    let targets: any[] = [];
    for (const start = Date.now(); Date.now() - start < 30000;) {
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
      source: `localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
    });
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game",
    );
    await sleep(500);
    const t = tab;
    const ev = (e: string) => t.ev(e);

    // Chỉ dùng bàn phím: đóng bảng chỉ dẫn người mới, nhả mọi focus khỏi ô nhập/nút
    await dispatchKey(t, K_ESC, "rawKeyDown");
    await dispatchKey(t, K_ESC, "keyUp");
    await sleep(150);
    await ev(
      `document.activeElement && document.activeElement.blur && document.activeElement.blur(); 1`,
    );

    // ---- Dựng cảnh: người chơi ra khỏi trấn, mặt phẳng rộng về phía phải ----
    const roomId = (await matchMaker.query({ name: roomNameOf(DEFAULT_MAP_ID) }))[0].roomId;
    const world = (matchMaker.getLocalRoomById(roomId) as any).world;
    let sid = "";
    world.state.players.forEach((p: any, id: string) => {
      if (p.name === NAME) sid = id;
    });
    if (!sid) throw new Error("Không tìm thấy người chơi trong phòng");
    const me = world.state.players.get(sid);

    // Tắt hồi sinh quái định kỳ + dọn quái: quái đánh trúng làm choáng → ngắt di chuyển → giả "liệt nút" (chồng lên ca cần kiểm)
    world.map = Object.create(world.map, { monsterCapOf: { value: () => 0 } });
    world.state.monsters.clear();
    world.mctrl.clear();

    // Hành lang phẳng đảm bảo: ghi đè `circleBlocked` (mà `moveWithCollision` gọi qua `this`) trả false trong một hình chữ
    // nhật rộng về phía phải, nên giữ phím phải sẽ KHÔNG bị địa hình chặn — ca này chỉ kiểm đường ống nhập-liệu/di chuyển, không phải địa hình.
    const map0 = world.map;
    const startX = map0.townPx.x + map0.townPx.r + 200;
    const startY = map0.townPx.y;
    world.map = Object.create(map0, {
      circleBlocked: {
        value: (x: number, y: number, r: number) =>
          x >= startX - 100 && x <= startX + 8000 && Math.abs(y - startY) <= 4000
            ? false
            : map0.circleBlocked(x, y, r),
      },
    });
    me.x = startX;
    me.y = startY;
    me.hp = me.maxHp;
    world.ctrl.get(sid).lastHitAt = 0;
    await t.waitFor(
      `Math.abs(window.__scene.predX - ${Math.round(startX)}) < 60 && Math.abs(window.__scene.predY - ${Math.round(startY)}) < 60`,
      "người chơi tới chỗ xuất phát",
    );
    await sleep(300);

    // ---- Giữ phím mũi tên phải LIÊN TỤC, lấy mẫu vị trí server nhiều mốc ----
    const x0 = me.x;
    const holdStart = Date.now();
    await dispatchKey(t, K_RIGHT, "rawKeyDown"); // nhấn và GIỮ (không nhả)
    // Lấy mẫu song song với vòng tick: mỗi mốc ghi lại thời điểm + me.x thật (đọc thẳng state phòng)
    const raw: Array<{ t: number; x: number }> = [];
    for (; Date.now() - holdStart < HOLD_MS;) {
      raw.push({ t: Date.now(), x: me.x });
      await sleep(SAMPLE_MS);
    }
    const xEndHold = me.x;
    await dispatchKey(t, K_RIGHT, "keyUp"); // thả phím

    check(
      "Giữ phím phải: nhân vật đi sang phải (server)",
      xEndHold - x0 > 40,
      `${x0} -> ${xEndHold} (chỉ giữ ${HOLD_MS} ms)`,
    );

    if (failures.length === 0) {
      // Hiệu số giữa các mốc liên tiếp; bỏ giai đoạn warmup (client mới bắt đầu gửi input)
      const steady: Array<{ dx: number; dt: number }> = [];
      for (let i = 1; i < raw.length; i++) {
        const prev = raw[i - 1]!,
          cur = raw[i]!;
        const dt = (cur.t - prev.t) / 1000; // giây
        if (dt <= 0.05) continue;
        if (prev.t - holdStart < WARMUP_MS) continue;
        steady.push({ dx: cur.x - prev.x, dt });
      }
      // Đơn điệu: không mốc nào lùi (cho phép sai số float)
      const mono = steady.every((s) => s.dx >= -EPS);
      check(
        "Vị trí đơn điệu không giảm (KHÔNG giật lùi)",
        mono,
        `${steady.filter((s) => s.dx < -EPS).length} interval lùi / ${steady.length}`,
      );
      const rates = steady.map((s) => s.dx / s.dt); // px/giây
      const med = median(rates);
      const minR = Math.min(...rates);
      const maxR = Math.max(...rates);
      // Tốc độ mong đợi (hằng, không buff trong ca này): so sánh TUYỆT ĐỐI chứ không tương đối — nếu tương đối, một đột biến
      // làm đứng hầu hết movement sẽ kéo trung vị về ~0 rồi ngưỡng ">= 0,4×trung vị" trở thành ">= 0" và bỏ lọt (false green).
      const expected = statsFor(me.realm, me.tier, me).speed; // px/giây (moveMul = 1 vì không tông môn / vật phẩm)
      const LO = 0.85 * expected;
      const HI = 1.15 * expected;
      out(
        `  (tốc độ mẫu: trung vị ${med.toFixed(1)}, min ${minR.toFixed(1)}, max ${maxR.toFixed(1)} px/s; mong đợi ${expected}; ${steady.length} interval)`,
      );
      // Tăng đều: tốc độ trung bình gần đúng tốc độ mong đợi (không chậm dần / không nhanh hơn thật)
      check(
        "Tốc độ trung bình ≈ tốc độ mong đợi (đều, không chậm/lỡ)",
        med >= LO && med <= HI,
        `trung vị ${med.toFixed(1)} vs mong đợi ${expected} px/s`,
      );
      // Không "liệt nút": KHÔNG interval ổn định nào chậm hơn 0,85× mong đợi (đặc biệt KHÔNG = 0 — ca liệt nút giữa đường)
      check(
        "Không interval nào đứng yên / liệt nút giữa đường",
        minR >= LO,
        `min ${minR.toFixed(1)} vs ngưỡng ${LO.toFixed(1)} px/s`,
      );
      // Không burst / nhảy cóc: interval nhanh nhất KHÔNG vượt quá 1,15× mong đợi
      check(
        "Vị trí tăng ĐỀU (không burst)",
        maxR <= HI,
        `max ${maxR.toFixed(1)} vs ngưỡng ${HI.toFixed(1)} px/s`,
      );
    }

    // ---- Thả phím: nhân vật dừng trong ~0,5 giây ----
    await sleep(500);
    const stopA = me.x;
    await sleep(400);
    const stopB = me.x;
    check(
      "Thả phím: nhân vật dừng lại (server)",
      Math.abs(stopB - stopA) < 1.5,
      `${stopA} -> ${stopB} (Δ ${(stopB - stopA).toFixed(2)} px sau khi thả)`,
    );

    check("0 lỗi console / exception", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  } catch (e) {
    fatal = (e as Error).message;
  } finally {
    tab?.close();
    chrome?.kill();
    await gameServer.gracefullyShutdown(false).catch(() => {});
    httpServer.close();
    rmSync(dataDir, { recursive: true, force: true });
    await sleep(600);
    rmSync(chromeDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  if (fatal || failures.length) {
    out(`\n❌ E2E GIỮ PHÍM DI CHUYỂN THẤT BẠI: ${fatal ?? `${failures.length} kiểm đỏ`}`);
    for (const f of failures) out(`   - ${f}`);
    process.exit(1);
  }
  out(`\n🎉 E2E GIỮ PHÍM DI CHUYỂN LIÊN TỤC PASS — vị trí tăng đều (${HOLD_MS} ms)`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
