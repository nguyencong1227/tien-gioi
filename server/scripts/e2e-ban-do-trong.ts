// E2E THẬT: vào BẢN ĐỒ TRỐNG (không quái, không người khác: Lang Hoang, Uy Vân Kinh của mục 75) rồi ĐỨNG YÊN: cảnh phải lấy vị trí máy chủ làm gốc (`hasMe`, `predX` / `predY` = `me()`) và
// camera nhìn chỗ người chơi đứng. Lỗi cũ (A thấy khi sửa e2e:chuyen-canh, B đo 26/11): vào phòng thật rồi mới dựng cảnh nên lần đồng bộ state đầu xảy ra TRƯỚC `onStateChange`; phòng đông có patch liên tục
// tự lành, bản đồ trống thì không có patch nào: `hasMe` = false, pred = (0, 0), camera nhìn góc trên-trái bản đồ cho tới khi cử động. Server Colyseus thật + Chrome headless + client đã build.
// Chạy: `npm run build -w client && npm run e2e:ban-do-trong -w server` (cần google-chrome).
import { execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, listenWithRetry, removeTmpDirs } from "./e2e-kit";
import { launchChrome } from "./e2e-chrome";
import { freePort } from "../src/test-port.js";
import { getMap } from "@tien-gioi/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 38000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const out = (m: string) => console.log(m);

async function main() {
  // Cổng do hệ điều hành cấp (không `Math.random`): cổng CDP trùng Chrome của dev khác thì ta điều khiển nhầm trình duyệt của họ (nit của A ở #549)
  const CDP = await freePort();
  PORT = await freePort();
  out("=== E2E THẬT bản đồ trống: vào rồi đứng yên, cảnh phải đồng bộ vị trí máy chủ ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-ban-do-trong-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-ban-do-trong-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");

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

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  try {
    const launched = await launchChrome({
      cdpPort: CDP,
      userDataDir: chromeDir,
      log: out,
    });
    chrome = launched.chrome;
    tab = await Tab.open("A", launched.webSocketDebuggerUrl);
    const T = tab;

    let currentName = "Chuyen Canh Cong";
    let currentSecret = "e2e_secret_cc_1111111111111";
    let scriptId: string | null = null;
    const setStorage = async (extra: string) => {
      if (scriptId)
        await T.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
      const r = await T.send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(currentName)});` +
          ` localStorage.setItem("tien-gioi:secret", ${JSON.stringify(currentSecret)}); ${extra}`,
      });
      scriptId = String(r.result?.identifier ?? "");
    };
    const login = async (url: string) => {
      await T.send("Page.navigate", { url });
      await T.waitFor(
        `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
        "form đăng nhập",
      );
      await T.ev(
        `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(currentName)}; document.getElementById('login-form').requestSubmit(); 1`,
      );
      try {
        await T.waitFor(
          `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
          "vào game thành công",
        );
      } catch (err) {
        // Chẩn đoán: lỗi hiện trên màn đăng nhập + lỗi console (vd. wrong_map không được xử lý, mã bí mật sai)
        const info = await ev(
          `JSON.stringify({ err: document.getElementById('login-error')?.textContent || document.querySelector('.auth-error, #auth-msg, .login-msg')?.textContent || '', ui: !document.getElementById('ui')?.hidden, room: !!window.__scene?.room, url: location.href })`,
        );
        out(
          `  (chẩn đoán đăng nhập: ${info}; console: ${T.errors.slice(0, 6).join(" | ")}; trang: ${String(await ev(`document.body.innerText.slice(0, 300)`)).replace(/\s+/g, " ")})`,
        );
        throw err;
      }
    };
    const url = `http://127.0.0.1:${PORT}/?debug=1`;
    const ev = (expr: string) => T.ev(expr) as Promise<any>;

    // Hai bản đồ trống của mục 75; mỗi bản đồ một nhân vật lưu sẵn cạnh cổng nam (chỗ xuất hiện), đăng nhập, KHÔNG cử động.
    const CASES: Array<[string, string, string]> = [
      ["lang_hoang", "Ban Do Trong LH", "e2e_secret_bdt_1111111111111"],
      ["uy_van", "Ban Do Trong UV", "e2e_secret_bdt_2222222222222"],
    ];
    for (const [mapId, name, secret] of CASES) {
      const gate = getMap(mapId)!.portals.find((p) => p.id.endsWith("_nam"))!;
      await savePlayer({
        name,
        secretHash: hashSecret(secret),
        realm: 5,
        tier: 0,
        exp: 0,
        mapId,
        x: gate.spawn.x,
        y: gate.spawn.y,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      currentName = name;
      currentSecret = secret;
      await setStorage("");
      await login(url);
      await T.waitFor(
        `window.__scene && window.__scene.map && window.__scene.map.def.id === ${JSON.stringify(mapId)}`,
        `vào đúng phòng ${mapId}`,
        30000,
      );
      // Không cử động. Chờ ĐIỀU KIỆN (không ngủ cố định): cảnh có mình, vị trí đoán trước == vị trí máy chủ, camera nhìn đúng chỗ đứng.
      const synced = `(() => { const s = window.__scene; const m = s.me && s.me(); if (!m || !s.hasMe) return false;
        const w = s.cameras.main.worldView;
        return Math.hypot(s.predX - m.x, s.predY - m.y) < 2 && Math.abs(w.centerX - m.x) < 400 && Math.abs(w.centerY - m.y) < 400; })()`;
      let good = false;
      try {
        await T.waitFor(synced, `cảnh đồng bộ vị trí máy chủ ở ${mapId} khi đứng yên`, 20000);
        good = true;
      } catch {
        // chẩn đoán dưới
      }
      const diag =
        await ev(`(() => { const s = window.__scene; const m = s.me && s.me(); const w = s.cameras.main.worldView;
        return JSON.stringify({ hasMe: s.hasMe, me: m ? [Math.round(m.x), Math.round(m.y)] : null, pred: [Math.round(s.predX), Math.round(s.predY)],
          cam: [Math.round(w.centerX), Math.round(w.centerY)], monsters: s.room.state.monsters ? s.room.state.monsters.size : null, players: s.room.state.players.size }); })()`);
      must(
        good,
        `${mapId}: đứng yên vẫn đồng bộ vị trí máy chủ (hasMe, predX / predY = me(), camera ở chỗ đứng): ${diag}`,
      );
      ok(`${mapId}: đứng yên, cảnh đồng bộ vị trí máy chủ (${diag})`);
    }
    must(T.errors.length === 0, `0 lỗi console / exception (${T.errors.slice(0, 2).join(" | ")})`);
    ok("0 lỗi console / exception");
    out("\n=== E2E BẢN ĐỒ TRỐNG ĐẠT ===");
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
    out(`\n  ✗ THẤT BẠI: ${failed}`);
  } finally {
    if (tab) {
      try {
        await tab.close();
      } catch {
        /* bỏ qua */
      }
    }
    // detached: Chrome là chủ một NHÓM tiến trình; giết cả nhóm (-pid) thì tiến trình con (gpu, renderer) không sống sót để ghi lại thư mục dữ liệu
    if (chrome?.pid) {
      try {
        process.kill(-chrome.pid, "SIGKILL");
      } catch {
        chrome.kill("SIGKILL");
      }
    }
    await new Promise<void>((r) => httpServer.close(() => r()));
    // false: mặc định Colyseus GỌI process.exit ngay trong gracefullyShutdown nên các dòng dọn dẹp phía sau không bao giờ chạy (sót thư mục /tmp/tien-gioi-e2e-*)
    await gameServer.gracefullyShutdown(false);
    try {
      // Chrome vừa bị SIGKILL: tiến trình con còn ghi thư mục dữ liệu một lúc, xoá ngay thì sót lại /tmp/tien-gioi-e2e-*-chrome-*: chờ rồi xoá hai lần
      await sleep(1200);
      execSync(`rm -rf "${dataDir}" "${chromeDir}"`);
      await sleep(600);
      execSync(`rm -rf "${chromeDir}"`);
    } catch {
      /* bỏ qua */
    }
  }
  if (failed) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi thực thi main:", err);
  process.exit(1);
});
