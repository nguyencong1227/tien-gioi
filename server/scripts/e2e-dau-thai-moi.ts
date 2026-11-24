// E2E THẬT ĐẦU THAI của NHÂN VẬT MỚI TINH (lỗi gấp mục 58, v0.5.2): người dùng báo nhân vật mới (kiếp 1, Phàm Nhân, chân linh mới tinh: 0 ô giữ / 0 ô khắc / chỉ có Phàm gia)
// chết xong bấm "Đầu thai" chỉ thấy toast rồi vẫn kẹt ở Hoàng Tuyền. Kịch bản đi đúng đường thật, KHÔNG gieo sẵn gì (không tệp nhân vật / chân linh), bật thành tựu như bản chạy thật
// (`WorldRoom.achievements`): đăng nhập bằng form -> chết thật (`hurtPlayer` với loài quái thật) -> màn Hoàng Tuyền (không có ô giữ / ô khắc để chọn) -> "Đầu thai" -> hộp tóm tắt ->
// xác nhận -> Mạnh Bà -> HUD kiếp 2. Ghi lại tin `rebirth` client THẬT sự gửi (bọc `room.send`) và mọi toast. Kết quả khi viết: client gửi {origin: "pham_gia", keep: []} (không `engrave`),
// máy chủ chấp nhận, đầu thai THÀNH CÔNG: trạng thái mặc định KHÔNG tái hiện được lỗi, nên lỗi phụ thuộc trạng thái thật của hồ sơ bị kẹt (xem ghi chú mục 58). Kịch bản giữ làm lưới an toàn
// cho đường 'nhân vật mới -> đầu thai'. Ảnh: đặt `E2E_SHOTS=<thư mục>`. Thoát 0 khi đạt, 1 khi sai.
//
// Chạy: `npm run build -w client && npm run e2e:dau-thai-moi -w server` (cần google-chrome). Mất ~30 giây.
import { execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, listenWithRetry, removeTmpDirs, killChrome } from "./e2e-kit";
import { launchChrome } from "./e2e-chrome";
import { freePort } from "../src/test-port.js";
import { ACT_CONFIRM_GUARD_MS as ACT_GUARD } from "../../client/src/act-confirm";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const out = (m: string) => console.log(m);

/** Bậc đồ hoạ GHIM (như `e2e-chieu-moi.ts`): bậc "Tự động" đổi theo phần cứng (runner CI không GPU -> Thấp: ít điểm hạt). */
const QUALITY = process.env.E2E_QUALITY ?? "high";

async function main() {
  const CDP = await freePort();
  let PORT = await freePort();
  out("=== E2E THẬT đầu thai của nhân vật MỚI TINH: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-dt-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-dt-chrome-"));
  process.env.DATA_DIR = dataDir; // `store.ts` đọc DATA_DIR lúc nạp module: nạp SAU khi đặt
  const { defineRooms, WorldRoom } = await import("../src/rooms/WorldRoom.js");
  WorldRoom.achievements = process.env.E2E_ACH !== "off"; // bản chạy thật bật thành tựu từ ~10:04 (mục 57)
  const { hurtPlayer } = await import("../src/systems/combat.js");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  try {
    PORT = await listenWithRetry(httpServer, PORT, {
      explicit: false,
      pick: () => 40000 + Math.floor(Math.random() * 2000),
    });
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }
  out(`- Server E2E: http://127.0.0.1:${PORT} (dữ liệu tạm ${dataDir})`);

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
  const serverDiag: () => string = () => "";
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };
  const SECRET = "e2e_secret_dau_thai_moi_11111";
  const NAME = "Hanh Moi Tinh";
  const shown = (id: string) => `!document.getElementById(${JSON.stringify(id)})?.hidden`;

  try {
    const launched = await launchChrome({
      cdpPort: CDP,
      userDataDir: chromeDir,
      extraFlags: [
        // máy tính có chuột: headless không có chuột nên `pointer` là `none` và thanh chiêu L U I O (chỉ hiện ở `(pointer: fine)`) bị ẩn
        "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2",
      ],
      log: out,
    });
    chrome = launched.chrome;
    tab = await Tab.open("T", launched.webSocketDebuggerUrl);
    const T = tab;
    const ev = (e: string) => T.ev(e);

    // Đăng nhập bằng form thật
    await T.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tg_quality", ${JSON.stringify(QUALITY)}); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
    });
    await T.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug=1` });
    await T.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    await ev(
      `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME)}; document.getElementById('login-form').requestSubmit(); 1`,
    );
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!window.__fx`,
      "vào game thành công",
      20000,
    );

    const roomId = (await ev(`window.__scene.room.roomId`)) as string;
    const world = (matchMaker.getLocalRoomById(roomId) as any)
      .world as import("../src/world.js").World;
    must(!!world, "lấy được World của phòng thật qua matchMaker");
    const sid = (await ev(`window.__scene.room.sessionId`)) as string;
    const me = world.state.players.get(sid)!;

    // ghi lại MỌI tin client gửi (bọc `room.send`) và mọi toast nhận được
    await ev(
      `(() => { const r = window.__scene.room; window.__sent = []; const o = r.send.bind(r); r.send = (t, m) => { window.__sent.push([t, JSON.parse(JSON.stringify(m ?? null))]); return o(t, m); }; window.__toasts = []; return 1; })()`,
    );
    const observer = `(() => { const box = document.getElementById('toast'); if (!box || window.__toastObs) return 1; window.__toastObs = new MutationObserver(() => { for (const p of box.querySelectorAll('p')) if (!window.__toasts.includes(p.textContent)) window.__toasts.push(p.textContent); }); window.__toastObs.observe(box, { childList: true, subtree: true, characterData: true }); return 1; })()`;
    await ev(observer);
    out(
      `- nhân vật mới: kiếp ${me.realm === 0 ? "1, Phàm Nhân" : "?"}, soul tệp: ${existsSync(path.join(dataDir, "souls")) ? "có thư mục souls" : "chưa có"}`,
    );

    const hurt = hurtPlayer(world, sid, me, me.hp + 9999, { kind: "lang" });
    must(hurt === true, "đòn của quái được nhận");
    await T.waitFor(`${shown("limbo-overlay")}`, "màn Hoàng Tuyền từ tin `limbo` thật", 20000);
    const limbo = await ev(
      `JSON.stringify({ relics: document.querySelectorAll('#limbo-relic-list input').length, relicChecked: document.querySelectorAll('#limbo-relic-list input:checked').length, engrave: document.querySelectorAll('#limbo-engrave-list input').length, engraveChecked: document.querySelectorAll('#limbo-engrave-list input:checked').length, relicHint: document.getElementById('limbo-relic-hint')?.textContent, engHint: document.getElementById('limbo-engrave-hint')?.textContent })`,
    ).then((v) => JSON.parse(v as string));
    out(`- màn Hoàng Tuyền: ${JSON.stringify(limbo)}`);
    await sleep(300);
    await ev(`document.getElementById('limbo-btn-rebirth').click(); 1`);
    await T.waitFor(shown("act-confirm"), "hộp tóm tắt đầu thai");
    await sleep(ACT_GUARD + 200);
    await ev(`document.getElementById('act-btn-yes').click(); 1`);
    await sleep(2500);
    const sent = await ev(`JSON.stringify(window.__sent.filter((x) => x[0] === 'rebirth'))`).then(
      (v) => JSON.parse(v as string),
    );
    const toasts = await ev(`JSON.stringify(window.__toasts)`).then((v) => JSON.parse(v as string));
    const overlay = await ev(
      `JSON.stringify({ limboShown: !document.getElementById('limbo-overlay').hidden, rebornShown: !document.getElementById('reborn-overlay').hidden, confirm: !document.getElementById('act-confirm').hidden })`,
    ).then((v) => JSON.parse(v as string));
    out(`- tin rebirth gửi: ${JSON.stringify(sent)}`);
    out(`- toast nhận: ${JSON.stringify(toasts)}`);
    out(`- màn hình sau 2,5 s: ${JSON.stringify(overlay)}`);
    must(sent.length === 1, `client gửi đúng MỘT tin rebirth (${sent.length})`);
    const msg = sent[0]![1] as { origin?: string; keep?: string[]; engrave?: string[] };
    must(
      msg.origin === "pham_gia" &&
        Array.isArray(msg.keep) &&
        msg.keep.length === 0 &&
        msg.engrave === undefined,
      `tin rebirth của nhân vật mới tinh = Phàm gia, không giữ, không khắc (${JSON.stringify(msg)})`,
    );
    must(
      !toasts.some((t: string) => /không hợp lệ|ghi sổ|Chưa khắc/.test(t)),
      `máy chủ KHÔNG từ chối (toast: ${JSON.stringify(toasts)})`,
    );
    await T.waitFor(
      `document.getElementById('reborn-overlay')?.hidden === false || /2/.test(document.getElementById('hud-kiep')?.textContent ?? '')`,
      "đầu thai thành công (Mạnh Bà / HUD kiếp 2)",
      15000,
    );
    ok("nhân vật mới đầu thai được");
    must(T.errors.length === 0, `lỗi console: ${JSON.stringify(T.errors)}`);
    ok("0 lỗi console / exception");
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ THẤT BẠI: ${failed}`);
    if (tab?.errors.length) console.error(`  lỗi console: ${JSON.stringify(tab.errors)}`);
    try {
      const diag = await tab?.ev(
        `JSON.stringify({ dmg: (window.__dmgLog ?? []).map((d) => [d.amount, d.crit, d.combo, d.burst]), slots: [2, 3, 4].map((n) => document.getElementById('sk-slot' + n)?.getAttribute('aria-label')), mp: [window.__scene.me().mp, window.__scene.me().maxMp], toasts: [...document.querySelectorAll('#toast p')].map((p) => p.textContent) })`,
      );
      console.error(`  chẩn đoán: ${diag}`);
      console.error(`  máy chủ: ${serverDiag()}`);
    } catch {
      /* tab đã đóng */
    }
    await tab?.shot("chieu-dau-that-bai", { onFailure: true });
  } finally {
    tab?.close();
    killChrome(chrome);
    try {
      await gameServer.gracefullyShutdown(false);
    } catch {
      /* bỏ qua */
    }
    await new Promise<void>((r) => httpServer.close(() => r()));
    await removeTmpDirs(dataDir, chromeDir);
  }
  if (failed) process.exit(1);
  out("\n=== E2E ĐẦU THAI NHÂN VẬT MỚI ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
