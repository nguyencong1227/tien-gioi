// E2E THẬT chuyển cảnh qua cổng truyền tống (M5.2, #329 + M5.3, #332): server Colyseus thật + Chrome headless + client đã build, vào game thật.
// Kiểm LUỒNG THẬT qua cổng (client `travelTo` của main.ts + màn chuyển cảnh + dựng lại bản đồ): đi bộ tới Bắc Môn Quan bằng
// joystick ảo (BFS trên ô), qua cổng sang Hắc Phong Cốc; màn chuyển cảnh THẬT SỰ chạy mống mắt (bán kính lỗ tròn ở giữa 0 và
// đầy), bản đồ đích có lớp trang trí / ánh sáng / sương, màn chuyển cảnh ẩn lại, 0 lỗi console.
// Chạy: `npm run build && npm run e2e:chuyen-canh -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const PORT = 38000 + Math.floor(Math.random() * 2000);
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

async function main() {
  out("=== E2E THẬT chuyển cảnh qua cổng: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-chuyen-canh-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-chuyen-canh-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };

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

    const NAME = "Chuyen Canh Cong";
    const SECRET = "e2e_secret_cc_1111111111111";
    let scriptId: string | null = null;
    const setStorage = async (extra: string) => {
      if (scriptId)
        await T.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
      const r = await T.send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)});` +
          ` localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)}); ${extra}`,
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
        `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME)}; document.getElementById('login-form').requestSubmit(); 1`,
      );
      await T.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "vào game thành công",
      );
    };
    const url = `http://127.0.0.1:${PORT}/?debug=1`;
    const ev = (expr: string) => T.ev(expr) as Promise<any>;
    await setStorage("");
    await login(url);

    // ---------------- Đi bộ tới Bắc Môn Quan ----------------
    out("\n--- Đi bộ tới cổng (joystick ảo + BFS trên ô) ---");
    const portalId = String(await ev(`window.__scene.map.portals[0].id`));
    must(portalId === "lac_ha_bac", `cổng đầu tiên của Lạc Hà là lac_ha_bac (${portalId})`);
    await ev(`(() => { const s = window.__scene, m = s.map, W = m.def.w, H = m.def.h, tiles = m.tiles, p = m.portals[0], J = window.__joystick;
      const bad = (i) => { const t = tiles[i]; return t === 3 || t === 4 || t === 5; };
      const sx = Math.floor(s.predX / 32), sy = Math.floor(s.predY / 32), gx = Math.floor(p.x / 32), gy = Math.floor(p.y / 32);
      const prev = new Int32Array(W * H).fill(-2); const q = [sy * W + sx]; prev[q[0]] = -1;
      for (let h = 0; h < q.length; h++) { const c = q[h], cx = c % W, cy = (c - cx) / W;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx;
          if (prev[n] !== -2 || bad(n)) continue; prev[n] = c; q.push(n); } }
      const goal = gy * W + gx; if (prev[goal] === -2) { window.__walkErr = 'không có đường tới cổng'; return 0; }
      const path = []; for (let c = goal; c !== -1; c = prev[c]) path.push([(c % W) * 32 + 16, Math.floor(c / W) * 32 + 16]); path.reverse();
      let i = 1; window.__walkLen = path.length;
      window.__walkTimer = setInterval(() => { if (Math.hypot(s.predX - p.x, s.predY - p.y) < 30 || i >= path.length) { J.x = 0; J.y = 0; J.active = false; clearInterval(window.__walkTimer); return; }
        const [tx, ty] = path[i], dx = tx - s.predX, dy = ty - s.predY, d = Math.hypot(dx, dy);
        if (d < 8) { i++; return; } J.x = dx / d; J.y = dy / d; J.active = true; }, 40); return 1; })()`);
    must(
      !(await ev(`window.__walkErr`)),
      `có đường đi bộ tới cổng (${await ev(`window.__walkErr`)})`,
    );
    await T.waitFor(
      `!!window.__scene.nearPortal && Math.hypot(window.__scene.predX - window.__scene.map.portals[0].x, window.__scene.predY - window.__scene.map.portals[0].y) < 40`,
      "tới sát tâm cổng",
      90000,
    );
    ok(`đã tới gần cổng sau ${await ev(`window.__walkLen`)} ô`);
    await ev(
      `(() => { const J = window.__joystick; J.x = 0; J.y = 0; J.active = false; return 1; })()`,
    );
    await sleep(700); // đợi vị trí THẬT của server đuổi kịp vị trí đoán trước (server kiểm khoảng cách tới cổng)

    // ---------------- Qua cổng: màn chuyển cảnh chạy thật ----------------
    out("\n--- Qua cổng: mống mắt chạy thật, bản đồ đích dựng đủ lớp, màn chuyển cảnh ẩn lại ---");
    await ev(`window.__scene.travelPortal(${JSON.stringify(portalId)}); 1`);
    await T.waitFor(
      `document.getElementById('transition-overlay').classList.contains('active') && !document.getElementById('transition-overlay').hidden`,
      "màn chuyển cảnh hiện",
      5000,
    );
    ok("màn chuyển cảnh hiện ngay khi qua cổng");
    // Lấy mẫu bán kính mống mắt trong lúc nó khép: phải có giá trị Ở GIỮA (đang chuyển động thật), không phải nhảy thẳng
    const radii: number[] = [];
    for (let i = 0; i < 14; i++) {
      const r = Number(
        await ev(
          `parseFloat(getComputedStyle(document.getElementById('transition-overlay')).getPropertyValue('--iris-r')) || 0`,
        ),
      );
      radii.push(r);
      if (!(await ev(`document.getElementById('transition-overlay').classList.contains('active')`)))
        break;
      await sleep(40);
    }
    const mid = radii.filter((r) => r > 20 && r < 1500).length;
    must(
      mid >= 1,
      `mống mắt THẬT SỰ chuyển động: ${mid} mẫu ở giữa (0, đầy) trong ${radii.length} mẫu [${radii.map((r) => r.toFixed(0)).join(", ")}]`,
    );
    ok(`mống mắt khép dần: ${radii.map((r) => r.toFixed(0)).join(" -> ")} px`);
    await T.waitFor(
      `window.__scene && window.__scene.map && window.__scene.map.def.id === 'hac_phong'`,
      "sang bản đồ Hắc Phong Cốc",
      30000,
    );
    ok("đã sang bản đồ Hắc Phong Cốc (hac_phong)");
    await T.waitFor(
      `document.getElementById('transition-overlay').hidden === true`,
      "màn chuyển cảnh ẩn lại",
      8000,
    );
    ok("màn chuyển cảnh ẩn lại sau khi tới nơi");
    // Bản đồ đích có đủ lớp M5.3 (dựng lại đúng khi đổi bản đồ thật)
    await sleep(800);
    const dest =
      await ev(`(() => { try { const s = window.__scene; return { decor: !!s.decorLayer, fog: s.fogImages ? s.fogImages.length : -1, light: s.lightVignette === undefined ? -1 : (s.lightVignette ? 1 : 0), mapId: s.map.def.id,
      decorKey: s.decorLayer ? s.decorLayer.tileset[0].image.key : '' }; } catch (e) { return { err: String((e && e.stack) || e) }; } })()`);
    must(!dest.err, `đọc trạng thái bản đồ đích (${dest.err})`);
    must(dest.decor, "bản đồ đích có lớp trang trí");
    must(
      dest.decorKey === "decor-hac_phong",
      `lớp trang trí dùng kiểu của Hắc Phong (${dest.decorKey})`,
    );
    // Ánh sáng / sương chỉ kiểm khi bản dựng có (-1 = chưa có tính năng đó trong bản dựng này)
    if (dest.light !== -1) must(dest.light === 1, "bản đồ đích có ánh sáng / vignette");
    if (dest.fog !== -1) must(dest.fog > 0, `bản đồ đích có sương (${dest.fog} mảng)`);
    ok(
      `bản đồ đích: trang trí ${dest.decorKey}, ánh sáng ${dest.light === -1 ? "(chưa có)" : "có"}, sương ${dest.fog === -1 ? "(chưa có)" : dest.fog + " mảng"}`,
    );
    must(T.errors.length === 0, `0 lỗi console / exception (${T.errors.slice(0, 2).join(" | ")})`);
    ok("0 lỗi console / exception");
    out("\n=== E2E CHUYỂN CẢNH QUA CỔNG ĐẠT ===");
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
    if (chrome) chrome.kill("SIGKILL");
    await new Promise<void>((r) => httpServer.close(() => r()));
    await gameServer.gracefullyShutdown();
    try {
      execSync(`rm -rf "${dataDir}" "${chromeDir}"`);
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
