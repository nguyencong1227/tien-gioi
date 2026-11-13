// E2E THẬT chuyển cảnh qua cổng truyền tống (M5.2, #329 + M5.3, #332): server Colyseus thật + Chrome headless + client đã build, vào game thật.
// Kiểm LUỒNG THẬT qua cổng (client `travelTo` của main.ts + màn chuyển cảnh + dựng lại bản đồ): đi bộ tới Bắc Môn Quan bằng
// joystick ảo (BFS trên ô), qua cổng sang Hắc Phong Cốc; màn chuyển cảnh THẬT SỰ chạy mống mắt (bán kính lỗ tròn ở giữa 0 và
// đầy), bản đồ đích có lớp trang trí / ánh sáng / sương, màn chuyển cảnh ẩn lại, 0 lỗi console.
// Chặng hai (M6, #408): nhân vật lưu sẵn cạnh Vọng Trạch Quan đi Hắc Phong Cốc -> Âm Sương Trạch -> Hắc Phong Cốc bằng cổng THẬT (vào nhầm
// phòng thì `wrong_map` đưa về đúng phòng): kiểu trang trí / ánh sáng / sương / dấu cổng / tên vùng của bản đồ thứ ba, 0 lỗi console.
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
import { Tab, sleep, listenWithRetry, removeTmpDirs } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 38000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
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
      { stdio: "ignore", detached: true },
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
    await setStorage("");
    await login(url);
    // Chrome headless không GPU tự rơi vào bậc Thấp (không sương, không ánh sáng): ép bậc Cao để các lớp M5.3 ở bản đồ đích thật sự có mặt
    await ev(
      `(() => { const s = document.getElementById('set-quality'); s.value = 'high'; s.dispatchEvent(new Event('change')); })(); 1`,
    );

    // Đi bộ tới cổng `id` của bản đồ hiện tại bằng joystick ảo (BFS trên ô) rồi đứng sát tâm cổng
    const walkToPortal = async (id: string) => {
      const P = `window.__scene.map.portals.find((q) => q.id === ${JSON.stringify(id)})`;
      await ev(`(() => { const s = window.__scene, m = s.map, W = m.def.w, H = m.def.h, tiles = m.tiles, p = ${P}, J = window.__joystick;
        window.__walkErr = ''; if (!p) { window.__walkErr = 'bản đồ này không có cổng ' + ${JSON.stringify(id)}; return 0; }
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
        `có đường đi bộ tới cổng ${id} (${await ev(`window.__walkErr`)})`,
      );
      await T.waitFor(
        `!!window.__scene.nearPortal && Math.hypot(window.__scene.predX - ${P}.x, window.__scene.predY - ${P}.y) < 40`,
        `tới sát tâm cổng ${id}`,
        90000,
      );
      ok(`đã tới gần cổng ${id} sau ${await ev(`window.__walkLen`)} ô`);
      await ev(
        `(() => { const J = window.__joystick; J.x = 0; J.y = 0; J.active = false; return 1; })()`,
      );
      await sleep(700); // đợi vị trí THẬT của server đuổi kịp vị trí đoán trước (server kiểm khoảng cách tới cổng)
    };

    // Bản đồ đích đã dựng đủ lớp M5.3 + dấu cổng + tên vùng (dựng lại đúng khi đổi bản đồ thật)
    const checkDest = async (mapId: string) => {
      await sleep(800);
      const dest =
        await ev(`(() => { try { const s = window.__scene; return { decor: !!s.decorLayer, fog: s.fogImages.length, light: s.lightVignette ? 1 : 0, mapId: s.map.def.id,
        decorKey: s.decorLayer ? s.decorLayer.tileset[0].image.key : '', portals: s.map.portals.length, portalVisuals: s.portalVisuals.length,
        zone: document.getElementById('minimap-zone')?.textContent || '', town: s.map.def.townName, wild: s.map.def.wildName }; } catch (e) { return { err: String((e && e.stack) || e) }; } })()`);
      must(!dest.err, `đọc trạng thái bản đồ đích (${dest.err})`);
      must(dest.mapId === mapId, `đang ở bản đồ ${mapId} (${dest.mapId})`);
      must(dest.decor, "bản đồ đích có lớp trang trí");
      must(
        dest.decorKey === `decor-${mapId}`,
        `lớp trang trí dùng kiểu của ${mapId} (${dest.decorKey})`,
      );
      must(dest.light === 1, "bản đồ đích có ánh sáng / vignette");
      must(dest.fog > 0, `bản đồ đích có sương (${dest.fog} mảng)`);
      must(
        dest.portals > 0 && dest.portalVisuals > 0,
        `bản đồ đích có cổng và dấu cổng hiện (${dest.portals} cổng, ${dest.portalVisuals} hình)`,
      );
      must(
        dest.zone === dest.town || dest.zone === dest.wild,
        `tên vùng ở bản đồ nhỏ theo bản đồ đích: "${dest.zone}" (trấn "${dest.town}" / hoang "${dest.wild}")`,
      );
      ok(
        `bản đồ đích ${mapId}: trang trí ${dest.decorKey}, ánh sáng có, sương ${dest.fog} mảng, ${dest.portals} cổng, vùng "${dest.zone}"`,
      );
    };

    // Qua cổng `id`: màn chuyển cảnh hiện, bản đồ đích đúng, màn chuyển cảnh ẩn lại (trả về các mẫu bán kính mống mắt)
    const crossPortal = async (id: string, destMapId: string) => {
      await ev(`window.__scene.travelPortal(${JSON.stringify(id)}); 1`);
      await T.waitFor(
        `document.getElementById('transition-overlay').classList.contains('active') && !document.getElementById('transition-overlay').hidden`,
        "màn chuyển cảnh hiện",
        5000,
      );
      ok(`màn chuyển cảnh hiện ngay khi qua cổng ${id}`);
      // Lấy mẫu bán kính mống mắt trong lúc nó khép: phải có giá trị Ở GIỮA (đang chuyển động thật), không phải nhảy thẳng
      const radii: number[] = [];
      for (let i = 0; i < 14; i++) {
        const r = Number(
          await ev(
            `parseFloat(getComputedStyle(document.getElementById('transition-overlay')).getPropertyValue('--iris-r')) || 0`,
          ),
        );
        radii.push(r);
        if (
          !(await ev(`document.getElementById('transition-overlay').classList.contains('active')`))
        )
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
        `window.__scene && window.__scene.map && window.__scene.map.def.id === ${JSON.stringify(destMapId)}`,
        `sang bản đồ ${destMapId}`,
        30000,
      );
      ok(`đã sang bản đồ ${destMapId}`);
      await T.waitFor(
        `document.getElementById('transition-overlay').hidden === true`,
        "màn chuyển cảnh ẩn lại",
        8000,
      );
      ok("màn chuyển cảnh ẩn lại sau khi tới nơi");
      await checkDest(destMapId);
    };

    // ---------------- Chặng một: Lạc Hà -> Hắc Phong Cốc ----------------
    out("\n--- Đi bộ tới cổng (joystick ảo + BFS trên ô) ---");
    const portalId = String(await ev(`window.__scene.map.portals[0].id`));
    must(portalId === "lac_ha_bac", `cổng đầu tiên của Lạc Hà là lac_ha_bac (${portalId})`);
    await walkToPortal(portalId);
    out("\n--- Qua cổng: mống mắt chạy thật, bản đồ đích dựng đủ lớp, màn chuyển cảnh ẩn lại ---");
    await crossPortal(portalId, "hac_phong");

    // ---------------- Chặng hai (M6, #408): Hắc Phong Cốc -> Âm Sương Trạch -> Hắc Phong Cốc ----------------
    // Nhân vật thứ hai lưu sẵn cạnh Vọng Trạch Quan (chỗ xuất hiện của cổng bắc Hắc Phong, trong khu an toàn): đi bộ từ cổng nam qua cả
    // bản đồ Hắc Phong dày quái là không cần thiết cho kiểm cổng. Client vào phòng Lạc Hà trước rồi `wrong_map` đưa về đúng phòng.
    out(
      "\n--- Ba bản đồ: Hắc Phong Cốc -> Âm Sương Trạch -> Hắc Phong Cốc (cổng thật, nhân vật lưu sẵn cạnh Vọng Trạch Quan) ---",
    );
    const { getMap } = await import("@tien-gioi/shared");
    const north = getMap("hac_phong")!.portal("hac_phong_bac")!;
    const NAME2 = "Canh Am Suong"; // tên 2-16 ký tự (luật đạo hiệu)
    const SECRET2 = "e2e_secret_cc_2222222222222";
    await savePlayer({
      name: NAME2,
      secretHash: hashSecret(SECRET2),
      realm: 3,
      tier: 0,
      exp: 0,
      mapId: "hac_phong",
      x: north.spawn.x,
      y: north.spawn.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    currentName = NAME2;
    currentSecret = SECRET2;
    await setStorage("");
    await login(url);
    await ev(
      `(() => { const s = document.getElementById('set-quality'); s.value = 'high'; s.dispatchEvent(new Event('change')); })(); 1`,
    );
    await T.waitFor(
      `window.__scene && window.__scene.map && window.__scene.map.def.id === 'hac_phong'`,
      "vào đúng phòng Hắc Phong Cốc (wrong_map đưa về đúng phòng)",
      30000,
    );
    ok("nhân vật lưu ở Hắc Phong Cốc vào đúng phòng (qua wrong_map)");
    await checkDest("hac_phong");
    await walkToPortal("hac_phong_bac");
    await crossPortal("hac_phong_bac", "am_suong");
    await walkToPortal("am_suong_nam");
    await crossPortal("am_suong_nam", "hac_phong");
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
