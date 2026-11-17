// E2E THẬT bảng XÃ HỘI + TRÙM THẾ GIỚI (M9, nghiệm thu #1034): server Colyseus thật (trong tiến trình, thư mục dữ liệu tạm, `ACHIEVEMENTS` bật, lịch trùm thế giới MẪU gắn vào sổ
// của `Hub`) phục vụ client/dist, HAI tab Chrome headless (hai nguồn 127.0.0.1 / localhost). Luồng qua giao diện thật (form đăng nhập, bấm nút HUD, bấm tab):
//   báo trước 1 phút (dòng hệ thống trong chat) -> trùm xuất hiện (banner đếm ngược + máu) -> hai người đóng góp (máy chủ trừ máu qua `dealMonsterDamage`, đúng đường `worldBossCredit`)
//   -> banner có danh sách đóng góp + phần của mình -> hạ trùm -> banner kết quả + toast + thưởng (Linh thạch / tu vi chia theo tỉ lệ, MỘT lần mỗi linh hồn) -> thành tựu 'Hạ Xích Mãng' mới
//   (chấm Mới trên nút HUD) -> bảng Xã hội: tab Xếp hạng, Thành tựu (đeo danh hiệu 'Thợ Săn Trùm': máy chủ xác nhận, nhãn trên đầu + chat), Sự kiện.
// Trùm mẫu là Xích Mãng (`boss: true`, ít máu, id `mang` khớp thành tựu `trum_mang_1`); lịch MẪU không phải dữ liệu thật (dữ liệu thật là việc của E, M9.10).
// Ảnh: đặt `E2E_SHOTS=<thư mục>` (mỗi tab một tiền tố A- / B-). Thoát 0 khi đạt, 1 khi sai. Không ghi vào `server/data/players` thật.
//
// Chạy: `npm run build && npm run e2e:xa-hoi -w server` (cần google-chrome; client/dist phải là bản build mới). Mất ~2 phút (chờ mốc phút của lịch).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_MAP, DEFAULT_MAP_ID, roomNameOf, type WorldBossSlot } from "@tien-gioi/shared";
import { Tab, sleep, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 36000 + Math.floor(Math.random() * 4000);
let PORT = pickPort();
const CDP = 9500 + Math.floor(Math.random() * 400);
const sha1 = (s: string) =>
  createHash("sha1").update(s.normalize("NFC").toLowerCase().trim()).digest("hex");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const out = (m: string) => console.log(m);

const A = { name: "Dai Hiep Mot", secret: "e2e_secret_dai_hiep_1_abcdefghij", host: "127.0.0.1" };
const B = { name: "Tieu Sinh Hai", secret: "e2e_secret_tieu_sinh_2_abcdefghij", host: "localhost" };
const REWARD = { exp: 800, coin: 150 };
const WAIT_MS = 200_000; // mốc phút của lịch cách tối đa ~2 phút

async function main() {
  out("=== E2E THẬT Xã hội + trùm thế giới: hai tab Chrome headless + server Colyseus thật ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-xh-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-xh-chrome-"));
  process.env.DATA_DIR = dataDir; // `store.ts` / `soul.ts` đọc DATA_DIR khi dùng: đặt TRƯỚC khi nạp WorldRoom
  const { defineRooms, WorldRoom } = await import("../src/rooms/WorldRoom.js");
  const { dealMonsterDamage } = await import("../src/systems/combat.js");
  const { createStores } = await import("../src/stores.js");
  const { LeaderboardService } = await import("../src/leaderboard.js");

  // Lịch MẪU một khung: bắt đầu ở mốc phút kế tiếp cách >= 60 giây (để mốc báo trước 1 phút còn nằm ở tương lai), kéo dài 5 phút, trùm Xích Mãng ở Lạc Hà (nơi hai người đứng)
  const startAbs = Math.ceil((Date.now() + 60_000) / 60_000) * 60_000;
  const vn = new Date(startAbs + 7 * 3600_000);
  const slot: WorldBossSlot = {
    id: "e2e_trum",
    hour: vn.getUTCHours(),
    minute: vn.getUTCMinutes(),
    boss: "mang",
    mapId: DEFAULT_MAP_ID,
    durationMin: 5,
    announceMin: [1],
    reward: { ...REWARD, top: { itemId: "dai_hoi_huyet_dan", count: 1 } },
  };
  WorldRoom.hub.worldBoss.slots = [slot];
  WorldRoom.hub.worldBoss.enabled = true;
  WorldRoom.achievements = true; // M9.5: cấp thành tựu + danh hiệu (mặc định TẮT ở máy chủ cho tới khi phát hành)
  out(
    `- Lịch mẫu: ${slot.boss} ở ${slot.mapId} lúc ${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")} (UTC+7), báo trước 1 phút`,
  );

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
        coin: 500,
        mapId: DEFAULT_MAP_ID,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  // Bảng xếp hạng như `index.ts` (kho tệp trong thư mục tạm; không bật `start()` định kỳ: script gọi `refresh()` đúng lúc để không đợi 5 phút)
  const stores = await createStores(process.env);
  const leaderboards = new LeaderboardService({
    souls: stores.souls,
    players: stores.players,
    sects: stores.sects,
    accounts: null,
    testExp: () => WorldRoom.testExpMult,
  });
  WorldRoom.leaderboards = leaderboards;
  await leaderboards.refresh();

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

    // 1. Đăng nhập cả hai bằng form thật vào Lạc Hà
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
    const roomId = (await matchMaker.query({ name: roomNameOf(DEFAULT_MAP_ID) }))[0].roomId;
    const world = (matchMaker.getLocalRoomById(roomId) as any).world;
    const sids = new Map<string, string>();
    world.state.players.forEach((p: any, sid: string) => sids.set(p.name, sid));
    const ctrlOf = (n: string) => world.ctrl.get(sids.get(n)!);
    const playerOf = (n: string) => world.state.players.get(sids.get(n)!);
    for (const [n, dx] of [
      [A.name, -40],
      [B.name, 40],
    ] as const) {
      const p = playerOf(n);
      p.x = DEFAULT_MAP.townPx.x + dx;
      p.y = DEFAULT_MAP.townPx.y + 60;
    }
    out("  ✓ [1/8] Hai người đăng nhập bằng form thật, đứng trong trấn Lạc Hà");

    const text = (tab: Tab, id: string) =>
      tab.ev(`document.getElementById(${JSON.stringify(id)})?.textContent || ''`);
    const hidden = (id: string) => `document.getElementById(${JSON.stringify(id)}).hidden`;

    // 2. Báo trước: dòng hệ thống 'sẽ xuất hiện' trong chat (mốc 1 phút của lịch)
    await ta.waitFor(
      `/sẽ xuất hiện/.test(document.getElementById('chat-log')?.textContent || '')`,
      "dòng hệ thống báo trước 1 phút",
      WAIT_MS,
    );
    const soonBanner = !(await ta.ev(hidden("wb-banner")));
    await ta.shot("m9-1-bao-truoc");
    out(
      `  ✓ [2/8] Báo trước: dòng hệ thống trong chat (banner ${soonBanner ? "HIỆN" : "chưa hiện"} ở pha báo trước)`,
    );

    // 3. Đến giờ: trùm xuất hiện (sinh ở phòng Lạc Hà), banner có tên + đồng hồ + máu
    await ta.waitFor(
      `!${hidden("wb-banner")} && /Xích Mãng/.test(document.getElementById('wb-title')?.textContent || '') && /Máu/.test(document.getElementById('wb-hp')?.textContent || '')`,
      "banner trùm đang diễn ra (tên + máu)",
      WAIT_MS,
    );
    await tb.waitFor(
      `!${hidden("wb-banner")} && /Xích Mãng/.test(document.getElementById('wb-title')?.textContent || '')`,
      "banner của B",
    );
    const bossId: string = world.wbossId;
    if (!bossId) throw new Error("Máy chủ phải có trùm thế giới (world.wbossId)");
    const boss = world.state.monsters.get(bossId);
    if (!boss || boss.kind !== "mang") throw new Error("Trùm thế giới phải là Xích Mãng");
    const timer = await text(ta, "wb-timer");
    if (!/^\d\d:\d\d$/.test(timer.trim())) throw new Error(`Đồng hồ banner sai dạng: '${timer}'`);
    await ta.shot("m9-2-trum-xuat-hien");
    out(
      `  ✓ [3/8] Trùm Xích Mãng xuất hiện: banner có tên, máu ('${await text(ta, "wb-hp")}'), đồng hồ ${timer}`,
    );

    // 4. Hai người đóng góp (máy chủ trừ máu: đúng đường `worldBossCredit`); bảng gửi mỗi 2 giây cho người ở phòng đích
    const maxHp = boss.maxHp as number;
    dealMonsterDamage(world, bossId, boss, sids.get(A.name)!, Math.floor(maxHp * 0.5), false);
    dealMonsterDamage(world, bossId, boss, sids.get(B.name)!, Math.floor(maxHp * 0.2), false);
    // bảng gửi mỗi ~2 giây cho người ở phòng đích: chờ cả hai thấy phần đóng góp CỦA MÌNH lớn hơn 0 % rồi mới so ("Bạn đóng góp 71,4%: ...")
    for (const tab of [ta, tb])
      await tab.waitFor(
        `/đóng góp ([1-9]\\d*|0[,.]\\d*[1-9])/.test(document.getElementById('wb-mine')?.textContent || '')`,
        `phần đóng góp của mình > 0 % (${tab.label})`,
        20_000,
      );
    await ta.ev(
      `if (document.getElementById('wb-top').hidden) document.getElementById('wb-toggle')?.click(); 1`,
    );
    await ta.waitFor(
      `document.querySelectorAll('#wb-top li').length >= 2`,
      "danh sách đóng góp có hai người",
      8000,
    );
    const mineA = (await text(ta, "wb-mine")).trim();
    const mineB = (await text(tb, "wb-mine")).trim();
    if (!/\d/.test(mineA) || !/\d/.test(mineB))
      throw new Error(`Phần đóng góp của mình phải có số: A '${mineA}' / B '${mineB}'`);
    if (mineA === mineB)
      throw new Error("Hai người đóng góp khác nhau phải thấy hai con số khác nhau");
    const hpTxt = await text(ta, "wb-hp");
    if (/100\s*%/.test(hpTxt)) throw new Error(`Máu trùm phải giảm sau khi bị đánh: '${hpTxt}'`);
    await ta.shot("m9-3-dong-gop");
    await tb.shot("m9-3-dong-gop");
    out(
      `  ✓ [4/8] Đóng góp: A '${mineA}' / B '${mineB}', máu trùm '${hpTxt}', danh sách hiện đủ hai người`,
    );

    // 5. Hạ trùm: chia thưởng theo tỉ lệ, MỘT lần mỗi linh hồn; banner kết quả + toast
    const coinA0 = ctrlOf(A.name).coin as number;
    const coinB0 = ctrlOf(B.name).coin as number;
    const monNow = world.state.monsters.get(bossId);
    dealMonsterDamage(world, bossId, monNow, sids.get(A.name)!, (monNow.hp as number) + 10, false);
    await ta.waitFor(
      `!${hidden("wb-banner")} && !${hidden("wb-result")} && /hạ|gục|Xích Mãng/.test(document.getElementById('wb-result')?.textContent || '')`,
      "banner kết quả",
      20_000,
    );
    await ta.shot("m9-4-ket-qua");
    await tb.shot("m9-4-ket-qua");
    const gainA = (ctrlOf(A.name).coin as number) - coinA0;
    const gainB = (ctrlOf(B.name).coin as number) - coinB0;
    if (!(gainA > gainB && gainB > 0))
      throw new Error(`Thưởng chia theo đóng góp: A (nhiều hơn) ${gainA} phải > B ${gainB} > 0`);
    if (gainA + gainB > REWARD.coin)
      throw new Error(`Tổng thưởng ${gainA + gainB} không được vượt ${REWARD.coin}`);
    if (world.wbossId) throw new Error("Hạ trùm xong thì world.wbossId phải về null");
    out(
      `  ✓ [5/8] Hạ trùm: banner kết quả ('${(await text(ta, "wb-result")).trim().slice(0, 60)}'), thưởng Linh thạch chia A +${gainA} / B +${gainB} (tổng <= ${REWARD.coin})`,
    );

    // 6. Thành tựu mới 'Hạ Xích Mãng': chấm Mới trên nút HUD (bảng đang đóng)
    await ta.waitFor(
      `document.getElementById('btn-social').classList.contains('has-new')`,
      "chấm Mới trên nút Xã hội",
      15_000,
    );
    await ta.shot("m9-5-cham-moi");
    out("  ✓ [6/8] Thành tựu mới: chấm 'Mới' hiện trên nút HUD Xã hội");

    // 7. Bảng Xã hội: mở bằng nút HUD thật; tab Thành tựu -> đeo danh hiệu; tab Xếp hạng; tab Sự kiện
    await leaderboards.refresh(); // bản chụp có hai người chơi + tu vi vừa nhận (ngoài e2e: mỗi 5 phút)
    await ta.ev(`document.getElementById('btn-social').click(); 1`);
    await ta.waitFor(`!${hidden("social-modal")}`, "bảng Xã hội mở");
    await ta.ev(`document.getElementById('social-tab-btn-ach').click(); 1`);
    await ta.waitFor(
      `!${hidden("ach-body")} && /Hạ Xích Mãng/.test(document.getElementById('ach-groups')?.textContent || '')`,
      "tab Thành tựu có 'Hạ Xích Mãng'",
    );
    const summary = (await text(ta, "ach-summary")).trim();
    if (!/^Đã đạt 1 \//.test(summary)) throw new Error(`Thành tựu phải đạt 1: '${summary}'`);
    await ta.shot("m9-6-thanh-tuu");
    // đeo danh hiệu 'Thợ Săn Trùm' (nút radio mở khoá): máy chủ phải xác nhận
    await ta.ev(
      `[...document.querySelectorAll('#ach-titles [role="radio"]')].find((b) => /Thợ Săn Trùm/.test(b.textContent) && b.getAttribute('aria-disabled') !== 'true')?.click(); 1`,
    );
    const t0 = Date.now();
    while (playerOf(A.name).title !== "tr1" && Date.now() - t0 < 10_000) await sleep(100);
    if (playerOf(A.name).title !== "tr1")
      throw new Error(`Máy chủ phải ghi danh hiệu tr1 cho A, thực tế '${playerOf(A.name).title}'`);
    await ta.waitFor(
      `/Thợ Săn Trùm/.test(document.getElementById('ach-worn')?.textContent || '')`,
      "ô 'đang đeo' cập nhật theo máy chủ",
    );
    // người KHÁC (tab B) thấy danh hiệu của A cạnh đạo hiệu trên đầu nhân vật (state công khai `Player.title`)
    await tb.waitFor(
      `(() => { const sc = window.__scene; for (const e of sc.players.values()) if (e.label && /Thợ Săn Trùm/.test(e.label.text)) return true; return false; })()`,
      "B thấy danh hiệu 'Thợ Săn Trùm' của A trên đầu nhân vật",
    );
    await sleep(600);
    await ta.shot("m9-7-deo-danh-hieu");
    await tb.shot("m9-7-thay-danh-hieu");
    out(
      "  ✓ [7/8] Thành tựu: 'Hạ Xích Mãng' đạt, đeo danh hiệu 'Thợ Săn Trùm' (máy chủ xác nhận: Player.title = tr1)",
    );

    await ta.ev(`document.getElementById('social-tab-btn-rank').click(); 1`);
    await ta.waitFor(
      `!${hidden("social-board-wrap")} && document.querySelectorAll('#social-board-wrap tbody tr').length >= 1`,
      "tab Xếp hạng có bảng",
      20_000,
    );
    const rankRows = Number(
      await ta.ev(`document.querySelectorAll('#social-board-wrap tbody tr').length`),
    );
    const rankMine = (await text(ta, "social-board-mine")).trim();
    if (!/Hạng của bạn: \d+/.test(rankMine))
      throw new Error(`Bảng Tu vi phải có hạng của A (đã có hồ sơ): '${rankMine}'`);
    await ta.shot("m9-8-xep-hang");
    await ta.ev(`document.getElementById('social-tab-btn-event').click(); 1`);
    await ta.waitFor(`!${hidden("social-tab-event")}`, "tab Sự kiện");
    await sleep(800);
    await ta.shot("m9-9-su-kien");
    out(
      `  ✓ [8/8] Tab Xếp hạng: bảng Tu vi ${rankRows} dòng, '${rankMine}'; tab Sự kiện mở được (ảnh đã chụp)`,
    );

    // 8. Không có lỗi console / cảnh báo mất tin
    const errors = tabs.flatMap((t) => t.errors.map((e) => `[${t.label}] ${e}`));
    if (errors.length > 0) {
      console.error("\n❌ LỖI / CẢNH BÁO TRÌNH DUYỆT:");
      for (const e of errors) console.error("   " + e);
      throw new Error(`E2E thất bại: ${errors.length} lỗi console`);
    }
    out("  ✓ 0 lỗi console, 0 exception, 0 cảnh báo mất tin lúc vào phòng.");
    out("\n🎉 E2E THẬT XÃ HỘI + TRÙM THẾ GIỚI PASS 100%!\n");
  } catch (e: any) {
    console.error(`\n❌ E2E XÃ HỘI THẤT BẠI: ${e?.message || e}\n`);
    for (const t of tabs) for (const err of t.errors) console.error(`   [${t.label}] ${err}`);
    for (const t of tabs) await t.shot("that-bai", { onFailure: true });
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
    await sleep(500);
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(chromeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

main();
