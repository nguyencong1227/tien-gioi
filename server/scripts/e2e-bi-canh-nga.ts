// E2E THẬT gục trong bí cảnh KHÔNG mất kiếp (M3.4, quyết định 11/11/2026): server Colyseus thật (trong tiến trình, thư mục dữ liệu tạm)
// phục vụ client/dist, HAI tab Chrome headless (CDP; `127.0.0.1` / `localhost`). Luồng qua giao diện thật: lập đội -> Thủ môn -> mở -> cả hai
// vào phòng bí cảnh -> A bị đánh gục (sát thương phía server qua `hurtPlayer`, đường thật của quái) -> lớp phủ "chết" của A nói RÕ
// "Ngươi đã gục ... bị đưa ra khỏi bí cảnh", dòng phụ "Không mất kiếp", KHÔNG hứa "Hồi sinh tại Lạc Hà Trấn", KHÔNG màn Hoàng Tuyền; B thấy A "Đã gục"
// và run chạy tiếp -> ~3 giây sau A về Lạc Hà (lớp phủ tắt, toast mất lượt), hồ sơ A KHÔNG `limbo`, Linh thạch / cảnh giới nguyên, mất MỘT lượt,
// A không vào lại được run -> B cũng gục: run thua `all_dead`, B về Lạc Hà, run được dọn. Không lỗi console. Thoát 0 khi đạt, 1 khi sai.
//
// Chạy: `npm run build && npm run e2e:bi-canh-nga -w server` (cần google-chrome; client/dist phải là bản build mới).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  DEFAULT_MAP_ID,
  DUNGEON_DAILY_REWARDS,
  LINH_HU_MAP_ID,
  NPC_BY_ID,
  dayKey,
} from "@tien-gioi/shared";
import { Tab, shown, sleep } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const PORT = 36000 + Math.floor(Math.random() * 4000);
const CDP = 9500 + Math.floor(Math.random() * 400);
const sha1 = (s: string) =>
  createHash("sha1").update(s.normalize("NFC").toLowerCase().trim()).digest("hex");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const out = (m: string) => console.log(m);

const A = {
  name: "Dao Truong Mot",
  secret: "e2e_secret_dao_truong_01_abcdef",
  host: "127.0.0.1",
  coin: 321,
};
const B = {
  name: "Dao Huu Hai",
  secret: "e2e_secret_dao_huu_02_abcdefgh",
  host: "localhost",
  coin: 77,
};

async function main() {
  out("=== E2E THẬT gục trong bí cảnh: hai tab Chrome headless + server Colyseus thật ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-nga-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-nga-chrome-"));
  // `store.ts` đọc DATA_DIR LÚC NẠP MODULE: nạp WorldRoom / combat SAU khi đặt biến môi trường
  process.env.DATA_DIR = dataDir;
  const { defineRooms, WorldRoom } = await import("../src/rooms/WorldRoom.js");
  const { hurtPlayer } = await import("../src/systems/combat.js");

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
        coin: p.coin,
        mapId: DEFAULT_MAP_ID,
        x: Math.round(gate.x + (i === 0 ? 30 : -30)),
        y: Math.round(gate.y + 30),
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  const saveOf = (name: string) =>
    JSON.parse(readFileSync(path.join(dataDir, `${sha1(name)}.json`), "utf8"));

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
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

    // 2. Lập đội, Thủ môn, mở bí cảnh, cả hai vào
    await ta.ev(`window.__scene.room.send('partyInvite', { name: ${JSON.stringify(B.name)} }); 1`);
    await sleep(800);
    await tb.ev(`window.__scene.room.send('partyAccept', { from: ${JSON.stringify(A.name)} }); 1`);
    for (let i = 0; i < 50 && WorldRoom.hub.parties.size < 1; i++) await sleep(100);
    if (WorldRoom.hub.parties.size < 1) throw new Error("Đội chưa lập được");
    await ta.ev(`window.__scene.room.send('talk', { npcId: 'thu_mon' }); 1`);
    await ta.waitFor(
      `[...document.querySelectorAll('#dlg-options .dlg-opt-btn')].some(b => b.textContent.includes('Linh Hư Bí Cảnh') && !b.disabled)`,
      "nút Mở bí cảnh bấm được",
    );
    await ta.ev(
      `[...document.querySelectorAll('#dlg-options .dlg-opt-btn')].find(b => b.textContent.includes('Linh Hư Bí Cảnh')).click(); 1`,
    );
    for (const tab of tabs) {
      await tab.waitFor(shown("dungeon-invite-box"), "hộp mời bí cảnh");
      // Hộp mời nhắc gục = mất lượt (client #241)
      await tab.ev(
        `document.getElementById('dib-btn-enter').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); 1`,
      );
    }
    for (const tab of tabs) {
      await tab.waitFor(
        `window.__scene.map.def.id === ${JSON.stringify(LINH_HU_MAP_ID)}`,
        "vào bản đồ bí cảnh",
      );
      await tab.waitFor(
        `document.body.classList.contains('in-dungeon') && ${shown("dungeon-hud")}`,
        "HUD bí cảnh",
      );
    }
    await ta.waitFor(
      `document.getElementById('dhud-members').children.length === 2`,
      "danh sách đội đủ hai người",
    );
    const run = [...WorldRoom.hub.runs.all()][0] as {
      id: string;
      roomId: string | null;
      phase: string;
      endReason: string | null;
    };
    if (!run || run.phase !== "running")
      throw new Error(`Run phải đang chạy, thực tế ${run?.phase}`);
    const room = (await import("colyseus")).matchMaker.getLocalRoomById(run.roomId!) as any;
    const world = room.world;
    const sids = new Map<string, string>();
    world.state.players.forEach((p: any, sid: string) => sids.set(p.name, sid));
    const ctrlOf = (n: string) => world.ctrl.get(sids.get(n)!);
    const playerOf = (n: string) => world.state.players.get(sids.get(n)!);
    out("  ✓ [2/8] Lập đội, mở bí cảnh, cả hai vào phòng bí cảnh (HUD, danh sách đội 2 người)");

    // 3. A bị đánh gục (đường thật của quái: hurtPlayer): lớp phủ nói rõ không mất kiếp
    const monster = world.state.monsters.values().next().value;
    const soulBefore = JSON.stringify(ctrlOf(A.name).soul);
    const lifeBefore = ctrlOf(A.name).lifeId;
    const pa = playerOf(A.name);
    hurtPlayer(world, sids.get(A.name)!, pa, pa.hp + 100000, monster);
    await ta.waitFor(shown("death"), "lớp phủ gục của A");
    const death = await ta.ev(`document.getElementById('death-t')?.textContent || ''`);
    const sub = await ta.ev(
      `document.getElementById('death-sub')?.hidden ? '' : (document.getElementById('death-sub').textContent || '')`,
    );
    if (!/gục/i.test(death) || !/bí cảnh/.test(death))
      throw new Error(`Lớp phủ phải nói gục + bị đưa ra khỏi bí cảnh, thực tế "${death}"`);
    if (/Lạc Hà Trấn|Hoàng Tuyền|Hồi sinh/.test(death + sub))
      throw new Error(`Lớp phủ KHÔNG được hứa hồi sinh / Hoàng Tuyền: "${death}" / "${sub}"`);
    if (!/Không mất kiếp/.test(sub))
      throw new Error(`Dòng phụ phải trấn an "Không mất kiếp", thực tế "${sub}"`);
    if (!(await ta.ev(`document.getElementById('limbo-overlay')?.hidden ?? true`)))
      throw new Error("Gục trong bí cảnh KHÔNG được mở màn Hoàng Tuyền");
    await ta.shot("1-gục");
    // Khung đếm ngược không bị xoá giữa chừng (bài học PK): vẫn hiện sau 1.2 giây
    await sleep(1200);
    if (await ta.ev(`document.getElementById('death').hidden`))
      throw new Error("Lớp phủ gục biến mất sớm (mốc đếm ngược bị xoá giữa khung?)");
    // B thấy A "Đã gục" ở HUD đội, run chạy tiếp
    await tb.waitFor(
      `/Đã gục/.test(document.getElementById('dhud-members')?.textContent || '')`,
      "B thấy A đã gục",
    );
    await tb.shot("2-dong-doi-thay");
    if (run.phase !== "running")
      throw new Error(`Run phải chạy tiếp (B còn đứng), thực tế ${run.phase}`);
    if (ctrlOf(A.name).limbo) throw new Error("A không được có limbo");
    out(
      `  ✓ [3/8] A gục: lớp phủ "${death}" / "${sub}", không Hoàng Tuyền, B thấy A đã gục, run chạy tiếp`,
    );

    // 4. ~3 giây sau A về Lạc Hà: lớp phủ tắt, toast mất lượt
    await ta.waitFor(
      `window.__scene.map.def.id === ${JSON.stringify(DEFAULT_MAP_ID)}`,
      "A về Lạc Hà",
      20000,
    );
    await ta.waitFor(
      `document.getElementById('death').hidden && !document.body.classList.contains('in-dungeon')`,
      "lớp phủ + HUD bí cảnh tắt",
    );
    await ta.waitFor(
      `/mất một lượt/.test(document.getElementById('toast')?.textContent || '')`,
      "toast mất lượt",
      8000,
    );
    await ta.shot("3-ve-lac-ha");
    // hồ sơ A: KHÔNG limbo, tiền / cảnh giới nguyên, mất MỘT lượt, về Lạc Hà
    let sa = saveOf(A.name);
    for (let i = 0; i < 50 && !sa.dungeonDaily; i++) {
      await sleep(200);
      sa = saveOf(A.name);
    }
    if (sa.limbo) throw new Error("Hồ sơ A không được có limbo");
    if (sa.coin !== A.coin) throw new Error(`Ví A phải nguyên ${A.coin}, thực tế ${sa.coin}`);
    if ([sa.realm, sa.tier].join() !== "1,8")
      throw new Error(`Cảnh giới A phải nguyên, thực tế ${sa.realm}/${sa.tier}`);
    if (sa.mapId !== DEFAULT_MAP_ID) throw new Error(`A phải ở Lạc Hà, thực tế ${sa.mapId}`);
    if (sa.dungeonDaily?.day !== dayKey(Date.now()) || sa.dungeonDaily.rewards !== 1)
      throw new Error(`A phải mất MỘT lượt hôm nay, thực tế ${JSON.stringify(sa.dungeonDaily)}`);
    if (ctrlOf(A.name)?.soul && JSON.stringify(ctrlOf(A.name).soul) !== soulBefore)
      throw new Error("Chân linh A không được đổi (không Duyên)");
    void lifeBefore;
    out(
      `  ✓ [4/8] ~3 giây sau A về Lạc Hà: lớp phủ tắt, toast mất lượt; hồ sơ: không limbo, ví ${sa.coin} nguyên, cảnh giới nguyên, ${sa.dungeonDaily.rewards}/${DUNGEON_DAILY_REWARDS} lượt đã dùng`,
    );

    // 5. A không vào lại được run đó (lời mời cũ đã trả lời)
    await ta.ev(
      `window.__scene.room.send('dungeonEnter', { runId: ${JSON.stringify(run.id)} }); 1`,
    );
    await sleep(800);
    if (await ta.ev(`window.__scene.map.def.id !== ${JSON.stringify(DEFAULT_MAP_ID)}`))
      throw new Error("A không được vào lại run đã gục");
    out("  ✓ [5/8] A gửi dungeonEnter lại: bị từ chối, vẫn ở Lạc Hà");

    // 6. B cũng gục: run thua all_dead; B về Lạc Hà
    const pb = playerOf(B.name);
    hurtPlayer(world, sids.get(B.name)!, pb, pb.hp + 100000, monster);
    await tb.waitFor(shown("death"), "lớp phủ gục của B");
    const phase = () => String(run.phase); // (TS đã thu hẹp `run.phase` sau kiểm "running" ở bước 3)
    for (let i = 0; i < 50 && phase() !== "lost"; i++) await sleep(100);
    if (phase() !== "lost" || run.endReason !== "all_dead")
      throw new Error(`Run phải thua all_dead, thực tế ${phase()}/${run.endReason}`);
    out("  ✓ [6/8] B cũng gục: run thua `all_dead`");

    // 7. B về Lạc Hà, run được dọn, B cũng mất một lượt và không mất gì
    await tb.waitFor(
      `window.__scene.map.def.id === ${JSON.stringify(DEFAULT_MAP_ID)}`,
      "B về Lạc Hà",
      20000,
    );
    for (let i = 0; i < 80 && WorldRoom.hub.runs.size > 0; i++) await sleep(100);
    if (WorldRoom.hub.runs.size !== 0) throw new Error("Run chưa được dọn");
    let sb = saveOf(B.name);
    for (let i = 0; i < 50 && !sb.dungeonDaily; i++) {
      await sleep(200);
      sb = saveOf(B.name);
    }
    if (
      sb.limbo ||
      sb.coin !== B.coin ||
      sb.mapId !== DEFAULT_MAP_ID ||
      sb.dungeonDaily?.rewards !== 1
    )
      throw new Error(
        `Hồ sơ B sai: ${JSON.stringify({ limbo: !!sb.limbo, coin: sb.coin, mapId: sb.mapId, daily: sb.dungeonDaily })}`,
      );
    await tb.shot("4-b-ve-lac-ha");
    out("  ✓ [7/8] B về Lạc Hà, run được dọn; B: không limbo, ví nguyên, mất 1 lượt");

    const errors = tabs.flatMap((t) => t.errors.map((e) => `[${t.label}] ${e}`));
    if (errors.length > 0) {
      console.error("\n❌ LỖI / CẢNH BÁO TRÌNH DUYỆT:");
      for (const e of errors) console.error("   " + e);
      throw new Error(`E2E thất bại: ${errors.length} lỗi console`);
    }
    out("  ✓ [8/8] 0 lỗi console, 0 exception, 0 cảnh báo mất tin lúc vào phòng.");
    out("\n🎉 E2E THẬT GỤC TRONG BÍ CẢNH PASS 100%!\n");
  } catch (e: any) {
    console.error(`\n❌ E2E GỤC TRONG BÍ CẢNH THẤT BẠI: ${e?.message || e}\n`);
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
