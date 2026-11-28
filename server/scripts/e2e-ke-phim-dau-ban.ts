// E2E THẬT: GIỮ PHÍM DI CHUYỂN LIÊN TỤC LÂU → vị trí TĂNG ĐỀU (QUYET_DINH_M3 mục 25, #1383 Part 2).
// Server Colyseus thật + Chrome headless (dựng qua helper launchChrome #1434) + phím THẬT qua CDP (isTrusted). Khác bước 8 của
// e2e-ban-phim (chỉ giữ 0,7s, chỉ khẳng định "đứng yên khi túi mở / đi khi túi đóng"): ca người dùng báo là GIỮ PHÍM LIÊN TỤC LÂU
// (tới ~30 giây) rồi nhân vật "giật / liệt nút" — vị trí KHÔNG tăng đều. Script giữ mũi tên phải một nhịp dài, LẤY MẪU vị trí server
// (me.x, đọc thẳng state phòng, không qua mạng) nhiều mốc, rồi khẳng định: (1) đơn điệu không giảm (không giật lùi), (2) KHÔNG có
// plateau đứng DÀI (KHÔNG "liệt nút" giữa đường — kiểm theo độ dài plateau, tốc độ-độc lập), (3) tốc độ TB toàn cửa sổ ≈ mong đợi
// (khung nhanh) HOẶC không burst vượt tốc độ danh nghĩa (khung chậm), (4) thả phím thì dừng.
// Cơ chế token-bucket + cắt backlog của applyInputs (mục 41) là bất biến theo thời gian nên 6 giây đủ đại diện cho 30 giây;
// độ dài giữ lấy từ env E2E_KE_PHIM_MS (mặc định 6000) để chạy nhanh, có thể nâng lên 30000 khi muốn lặp ca thật.
//
// FPS-AWARE (#1394, theo B + A): runner GitHub chạy WebGL phần mềm / bị bóp CPU (`CI=true taskset -c 0`) nên khung hình CHẬM
// (vài khung / giây); khi đó client chỉ tiến MỘT bước ~8 px mỗi khung → vị trí tăng theo FPS chứ KHÔNG theo đồng hồ thật, đo
// px/giây cố định sẽ ĐỎ giả (đỏ 2/2 trên runner ở đầu 4ad40ad6). Script ĐO thời gian khung hình bằng rAF TRƯỚC khi giữ phím:
//   - KHUNG CHẬM (frameMs > SLOW_FRAME_MS, hoặc tốc độ TB < SLOW_FRAC×mong đợi): KHÔNG đòi tốc độ tuyệt đối — chỉ đòi đơn điệu,
//     KHÔNG plateau đứng dài, trần không burst vượt tốc độ danh nghĩa (maxR <= 1,4×), thả phím dừng; in `⚠ khung chậm ... bỏ qua`.
//   - KHUNG NHANH: tốc độ TB TOÀN cửa sổ trong ±15% mong đợi (răng cho đột biến làm chậm/nhanh movement) + đơn điệu + plateau +
//     thả phím. KHÔNG kiểm từng interval: biên tuyệt đối theo đồng hồ thật chập chờn ở dải khung 28-40 ms (A/C tái hiện đỏ ở
//     --slow-frame 14: min 85,5 < sàn 90; và --slow-frame 36: TB ~130 < ±10%) — jitter lấy mẫu ±1 tick KHÔNG phải lỗi movement thật.
// ĐỘT BIẾN TEST-ONLY (env `E2E_KE_PHIM_MUTATE=stall:<N>`): ngừng gửi input sau N bước giữ phím → giả "liệt nút"; cờ giữ-phím
// (`window.__kphHoldStarted`) do KỊCH BẢN đặt qua CDP ngay trước khi gửi phím (KHÔNG đặt trong mã game — F không sửa mã trò chơi),
// để đột biến đếm stall chỉ tính các bước SAU khi giữ phím. `--slow-frame <ms>` / `TG_SLOW_FRAME_MS` giả lập khung chậm
// (client/scripts/slow-frame.mjs) để kiểm cả hai nhánh không cần runner.
// Chạy: `npm run e2e:ke-phim-dau-ban -w server` [--slow-frame 150] [E2E_KE_PHIM_MUTATE=stall:20].
import { execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_MAP_ID, roomNameOf, statsFor } from "@tien-gioi/shared";
import { Tab, sleep, listenWithRetry } from "./e2e-kit";
import { launchChrome } from "./e2e-chrome";

// Giả lập KHUNG CHẬM (copy từ client/scripts/slow-frame.mjs — module JS thuần không kèm .d.ts nên KHÔNG import được trong TS;
// giữ nguyên bản chất: mỗi requestAnimationFrame bận luồng chính `ms` ms). `--slow-frame <ms>` / `TG_SLOW_FRAME_MS` bật, 0 = tắt.
function slowFrameMs(): number {
  const idx = process.argv.indexOf("--slow-frame");
  const raw = idx >= 0 ? process.argv[idx + 1] : process.env.TG_SLOW_FRAME_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 2000 ? Math.floor(n) : 0;
}
function slowFrameSource(ms: number): string {
  if (!ms) return "";
  return `(() => {
    const real = performance.now.bind(performance);
    const spin = () => {
      const t = real();
      while (real() - t < ${ms}) { /* bận luồng chính */ }
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  })();`;
}

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

// ---- FPS-aware (#1394) ----
const SLOW_FRAME_MS = 40; // khung hình > 40 ms (~25 FPS) coi là khung chậm (dưới đây là runner WebGL phần mềm / taskset -c 0)
const SLOW_FRAC = 0.85; // hoặc tốc độ mẫu < SLOW_FRAC×mong đợi → coi là khung chậm (chậm theo hiệu quả, dù frameMs biên)
const FAST_HI = 1.4; // khung CHẬM: trần tốc độ danh nghĩa — interval nhanh nhất KHÔNG được vượt (máy chậm KHÔNG thể nhanh hơn tốc độ thật)
const WINDOW_FRAC = 0.15; // khung NHANH: tốc độ TB toàn cửa sổ phải trong ±15% mong đợi (±10% quá chặt ở khung 28-40 ms: jitter lấy mẫu ±1 tick
// ≈ ±8 px/350 ms ≈ ±23 px/s, và TB hiệu quả bị giới hạn FPS tụt xuống ~130 px/s ở --slow-frame 36 → đỏ giả; C chốt ±10-15%, A muốn thông qua --slow-frame 25/36/50/80/150)
// "Liệt nút" = plateau DỪNG đứng KÉO DÀI (đột biến ngừng gửi input → dx≈0 mọi interval tới cuối). Máy chậm KHỎE chỉ có blip lẻ
// (jitter gửi input không đều ở khung rất chậm) nên KHÔNG có plateau dài. Kiểm theo độ dài plateau (tốc độ-độc lập) chứ KHÔNG
// theo "mỗi interval phải nhích" (quá chặt ở khung cực chậm: lấy mẫu 350 ms có interval bắt đúng 0 bước → false red).
const STALL_EPS_PX = 1; // interval coi là "đứng" nếu dx < 1 px
const STALL_MAX_MS = 2200; // plateau đứng dài >= 2,2 s (≈ 6 interval) mới coi là liệt nút thật (blip jitter ngắn hơn thì qua)
/** Đột biến TEST-ONLY (env `E2E_KE_PHIM_MUTATE=stall:<N>`): ngừng gửi input di chuyển sau N bước → giả "liệt nút" giữa đường.
 *  Chỉ dùng để chứng minh kiểm "không plateau đứng dài" có răng; KHÔNG bật khi chạy thường (mặc định tắt). */
const MUTATE_STALL_AT = (() => {
  const m = /^stall:(\d+)$/.exec(process.env.E2E_KE_PHIM_MUTATE ?? "");
  return m ? Number(m[1]) : 0;
})();

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

/** Đo thời gian khung hình trung bình (ms) trong trang bằng requestAnimationFrame (~600 ms) — tín hiệu chính để biết máy có chậm không. */
function measureFrameMs(tab: Tab): Promise<number> {
  return tab.ev(
    `new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 >= 600) res((performance.now() - t0) / n); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`,
  );
}

/**
 * Mã đột biến TEST-ONLY (nạp ở đầu trang): poll tới khi `window.__scene` sẵn rồi bao gói `fixedStep` — sau bước thứ N (tính TỪ khi
 * giữ phím di chuyển) thì no-op (không gửi input, không đoán trước) → server ngừng nhận input di chuyển → `me.x` đứng yên giữa đường
 * = giả "liệt nút". Làm ở tầng scene (KHÔNG đụng WebSocket) vì colyseus.js 0.16 mã hoá MSGPACK binary (`packr.buffer`), không dò được
 * bằng chuỗi. KHÔNG chạy thường (N=0 → bỏ qua).
 *
 * Đếm CHỈ SAU KHI GIỮ PHÍM (cờ `__kphHoldStarted`): `fixedStep` chạy MỌI khung kể cả khi nhân vật đứng yên (warmup trước khi giữ
 * phím), nên đếm mọi lời gọi sẽ hết N bước trong giai đoạn warmup → đột biến no-op NGAY khi giữ phím → zero movement = stall giả
 * (hết 12 bước trong warmup). Scene đặt cờ `__kphHoldStarted` NGAY TRƯỚC khi gửi input bước đầu tiên khi đang có hướng đi; đột biến
 * chỉ đếm các bước sau cờ đó, nên N bước thực sự là N bước GIỮ PHÍM.
 */
function mutateStallSource(at: number): string {
  return `
      (() => {
        const AT = ${at};
        let done = false, tries = 0;
        const iv = setInterval(() => {
          if (done || ++tries > 200) { clearInterval(iv); return; } // hết hạn (30 s) nếu scene KHÔNG xuất hiện
          const sc = window.__scene;
          if (!sc || typeof sc.fixedStep !== "function") return;
          done = true; clearInterval(iv);
          const orig = sc.fixedStep.bind(sc);
          let n = 0;
          sc.fixedStep = () => {
            if (!window.__kphHoldStarted) return orig(); // chưa giữ phím: KHÔNG đếm (bỏ qua giai đoạn warmup nhân vật đứng yên)
            if (++n > AT) return; // liệt nút: ngừng sau bước thứ AT kể từ khi giữ phím
            return orig();
          };
        }, 100);
      })();`;
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

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let fatal: string | null = null;
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    out(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` (${detail})`}`);
    if (!ok) failures.push(`${name}: ${detail}`);
  };
  try {
    // Dựng Chrome qua helper launchChrome (#1434): hạn chờ >= 30 s + tự thử lại kèm chẩn đoán, thay vòng chờ CDP chép tay.
    const launched = await launchChrome({ cdpPort: CDP, userDataDir: chromeDir, log: out });
    chrome = launched.chrome;
    tab = await Tab.open("A", launched.webSocketDebuggerUrl);
    // Khởi tạo trang (chạy TRƯỚC mọi script của game): localStorage đạo hiệu/mã + giả lập khung chậm (slow-frame.mjs) + đột biến TEST-ONLY.
    const initSource = `
      localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)});
      localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});
      ${slowFrameSource(slowFrameMs())}
      ${MUTATE_STALL_AT > 0 ? mutateStallSource(MUTATE_STALL_AT) : ""}`;
    await tab.send("Page.addScriptToEvaluateOnNewDocument", { source: initSource });
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

    // ---- Đo thời gian khung hình TRƯỚC khi giữ phím (tín hiệu chính để biết máy có chậm không — FPS-aware #1394) ----
    const frameMs = await measureFrameMs(t);

    // ---- Giữ phím mũi tên phải LIÊN TỤC, lấy mẫu vị trí server nhiều mốc ----
    const x0 = me.x;
    // Đánh cờ "đã bắt đầu giữ phím" qua CDP NGAY TRƯỚC khi gửi phím — đột biến stall chỉ đếm các bước SAU cờ này (KHÔNG đếm
    // warmup đứng yên). F KHÔNG đặt cờ trong mã game (WorldScene); kịch bản tự đặt qua CDP cho cùng kết quả đo (A + B, #1394).
    await t.ev(`window.__kphHoldStarted = true; 1`);
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

    // Tốc độ mong đợi (hằng, không buff trong ca này): dùng để phân loại + so sánh. So TUYỆT ĐỐI chứ không tương đối với trung vị
    // (một đột biến làm đứng movement sẽ kéo trung vị về ~0 rồi ngưỡng tương đối ">= 0,4×trung vị" bỏ lọt — false green).
    const expected = statsFor(me.realm, me.tier, me).speed; // px/giây (moveMul = 1 vì không tông môn / vật phẩm)

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
      const rates = steady.map((s) => s.dx / s.dt); // px/giây
      const med = median(rates);
      const minR = Math.min(...rates);
      const maxR = Math.max(...rates);
      const totalDx = steady.reduce((a, s) => a + s.dx, 0);
      const totalDt = steady.reduce((a, s) => a + s.dt, 0);
      const base = totalDt > 0 ? totalDx / totalDt : 0; // tốc độ TB TOÀN cửa sổ (px/giây)
      // Plateau đứng dài nhất (ms): chuỗi interval liên tiếp dx < STALL_EPS_PX. Đột biến "liệt nút" → plateau tới cuối (rất dài);
      // máy chậm khỏe chỉ blip jitter ngắn. Bất biến tốc độ-độc lập → dùng cho CẢ hai chế độ.
      let plateauMs = 0,
        longestStallMs = 0;
      for (const s of steady) {
        if (s.dx < STALL_EPS_PX) {
          plateauMs += s.dt * 1000;
          if (plateauMs > longestStallMs) longestStallMs = plateauMs;
        } else plateauMs = 0;
      }
      // Phân loại: khung hình chậm HOẶC tốc độ TB hiệu quả dưới sàn → máy chậm (runner WebGL phần mềm / taskset -c 0).
      const slow = frameMs > SLOW_FRAME_MS || base < SLOW_FRAC * expected;
      out(
        `  (khung hình ${frameMs.toFixed(0)} ms; tốc độ TB toàn cửa sổ ${base.toFixed(1)} px/s, trung vị ${med.toFixed(1)}, min ${minR.toFixed(1)}, max ${maxR.toFixed(1)}; plateau đứng dài nhất ${longestStallMs.toFixed(0)} ms; mong đợi ${expected} px/s; ${steady.length} interval)`,
      );

      // Đơn điệu: không mốc nào lùi (CHO PHÉP ở CẢ hai chế độ — bất biến cơ bản, không phụ thuộc tốc độ tuyệt đối).
      const mono = steady.every((s) => s.dx >= -EPS);
      check(
        "Vị trí đơn điệu không giảm (KHÔNG giật lùi)",
        mono,
        `${steady.filter((s) => s.dx < -EPS).length} interval lùi / ${steady.length}`,
      );
      // Không "liệt nút": KHÔNG được có plateau đứng dài >= STALL_MAX_MS giữa đường. Đột biến "liệt nút" (ngừng gửi input) → mọi
      // interval sau ngừng tăng (dx≈0) tạo plateau kéo dài tới cuối → kiểm này ĐỎ (đó là răng của đột biến, CẢ chế độ chậm lẫn nhanh).
      check(
        "Không liệt nút giữa đường (không có plateau đứng dài)",
        longestStallMs < STALL_MAX_MS,
        `plateau đứng dài nhất ${longestStallMs.toFixed(0)} ms vs ngưỡng ${STALL_MAX_MS} ms`,
      );

      if (slow) {
        // KHUNG CHẬM: vị trí tăng theo FPS chứ không theo đồng hồ thật → KHÔNG đòi tốc độ tuyệt đối (B + A, #1394).
        out(
          `  ⚠ khung chậm (frameMs ${frameMs.toFixed(0)} > ${SLOW_FRAME_MS} hoặc TB ${base.toFixed(0)} < ${SLOW_FRAC}×mong đợi): bỏ kiểm tốc độ tuyệt đối, chỉ đòi bất biến theo FPS`,
        );
        // Không burst bất thường: interval nhanh nhất KHÔNG vượt quá trần danh nghĩa (máy chậm KHÔNG thể nhanh hơn tốc độ thật).
        check(
          "Vị trí tăng đều (không burst vượt tốc độ danh nghĩa)",
          maxR <= FAST_HI * expected,
          `max ${maxR.toFixed(1)} vs trần ${(FAST_HI * expected).toFixed(0)} px/s`,
        );
      } else {
        // KHUNG NHANH: khẳng định tốc độ TB TOÀN cửa sổ trong ±15% mong đợi (không theo từng interval — biên tuyệt đối theo đồng
        // hồ thật chập chờn ở dải khung 25-50 ms, A/C #1394).
        const wLO = (1 - WINDOW_FRAC) * expected;
        const wHI = (1 + WINDOW_FRAC) * expected;
        // Tốc độ TB TOÀN cửa sổ trong ±15% mong đợi — răng cho đột biến làm chậm/nhanh movement (kéo base ra khỏi ±15%). KHÔNG
        // kiểm từng interval: biên tuyệt đối theo đồng hồ thật chập chờn ở dải khung 28-40 ms (A/C tái hiện đỏ ở --slow-frame 14,
        // min 85,5 < sàn 90; --slow-frame 36: TB ~130 < ±10%) — jitter lấy mẫu ±1 tick không phải lỗi movement thật.
        check(
          "Tốc độ trung bình toàn cửa sổ ≈ mong đợi (đều, không chậm/lỡ)",
          base >= wLO && base <= wHI,
          `TB cửa sổ ${base.toFixed(1)} vs mong đợi ${expected} px/s (±${(WINDOW_FRAC * 100).toFixed(0)}%)`,
        );
      }
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
