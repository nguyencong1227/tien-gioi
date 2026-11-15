// E2E THẬT chuyển cảnh qua cổng truyền tống (M5.2, #329 + M5.3, #332): server Colyseus thật + Chrome headless + client đã build, vào game thật.
// Kiểm LUỒNG THẬT qua cổng (client `travelTo` của main.ts + màn chuyển cảnh + dựng lại bản đồ): đi bộ tới Bắc Môn Quan bằng
// joystick ảo (BFS trên ô), qua cổng sang Hắc Phong Cốc; màn chuyển cảnh THẬT SỰ chạy mống mắt (bán kính lỗ tròn ở giữa 0 và
// đầy), bản đồ đích có lớp trang trí / ánh sáng / sương, màn chuyển cảnh ẩn lại, 0 lỗi console.
// Chặng hai (M6, #408): nhân vật lưu sẵn cạnh Vọng Trạch Quan đi Hắc Phong Cốc -> Âm Sương Trạch -> Hắc Phong Cốc bằng cổng THẬT (vào nhầm
// phòng thì `wrong_map` đưa về đúng phòng): kiểu trang trí / ánh sáng / sương / dấu cổng / tên vùng của bản đồ thứ ba, 0 lỗi console.
// Chặng ba (M7.5, #506, M7.8 #509): nhân vật lưu sẵn cạnh Lăng Hàn Quan đi Âm Sương Trạch -> Hàn Vân Lĩnh -> Âm Sương Trạch bằng cổng THẬT: bản đồ thứ tư dựng đủ lớp
// (kiểu `han_van`), chỗ xuất hiện đúng cạnh Hồi Sương Quan (cổng nam, trong khu an toàn), quay về đúng cổng bắc Âm Sương.
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
import { Tab, sleep, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";
import { freePort } from "../src/test-port.js";
import { getMap, DEFAULT_MAP_ID } from "@tien-gioi/shared";

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
        ...getChromeGpuFlags(),
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

    // Lưu sẵn nhân vật 1 cạnh Bắc Môn Quan (như chặng 2 cạnh Vọng Trạch Quan và chặng 3 cạnh Lăng Hàn Quan)
    // để đi bộ tới cổng chỉ mất vài ô bằng joystick ảo, tránh lội bộ 80 ô từ giữa trấn Lạc Hà gây quá hạn 90s khi FPS thấp trên CI runner
    const lhBac = getMap(DEFAULT_MAP_ID)!.portals.find((p) => p.id === "lac_ha_bac")!;
    await savePlayer({
      name: currentName,
      secretHash: hashSecret(currentSecret),
      realm: 2,
      tier: 0,
      exp: 0,
      mapId: DEFAULT_MAP_ID,
      x: lhBac.spawn.x,
      y: lhBac.spawn.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

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
          // Waypoint ĐÃ QUA khi hình chiếu của nhân vật dọc đoạn đường tới nó vượt 1 (hoặc tới sát 8 px): khung chậm (~4-6 FPS, runner CI) nhảy
          // 27-45 px mỗi khung nên bán kính 8 px không bao giờ trúng, nhân vật quay quanh waypoint tới hết hạn chờ (đo: 90 s ở am_suong_nam khi ghim một nhân)
          const [bx, by] = path[i - 1], sx = tx - bx, sy = ty - by, along = ((s.predX - bx) * sx + (s.predY - by) * sy) / (sx * sx + sy * sy || 1);
          if (d < 8 || along >= 1) { i++; return; } J.x = dx / d; J.y = dy / d; J.active = true; }, 40); return 1; })()`);
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
      // Ghi mống mắt TRONG TRANG: sự kiện `transitionrun` / `transitionend` của biến --iris-r (transition CSS 0,4 s, thuộc tính đã đăng ký bằng @property)
      // cộng mẫu mỗi khung vẽ (chỉ để báo cáo). KHÔNG đòi "có mẫu ở giữa": khi một khung đứng > 400 ms (máy tải, runner ~4-6 FPS) giá trị nhảy
      // thẳng từ đầy sang 0 giữa hai khung dù transition vẫn chạy đúng 0,4 s (đo: [1920, 1920, 1920, 0, 0, 0] khi ghim một nhân CPU)
      await ev(`(() => { const o = document.getElementById('transition-overlay');
        if (window.__irisRec) { o.removeEventListener('transitionrun', window.__irisRec); o.removeEventListener('transitionend', window.__irisRec); }
        if (window.__irisOff) window.__irisOff();
        const R = (window.__iris = { runs: [], ends: [], frames: [] }); let on = true; window.__irisOff = () => { on = false; };
        window.__irisRec = (e) => { if (e.propertyName !== '--iris-r') return;
          // Lúc transition BẮT ĐẦU chạy: đọc thời lượng cấu hình (ms) từ Web Animations (A đo ra 400 ở mọi lần qua cổng)
          const dur = e.type === 'transitionrun' ? ((o.getAnimations().find((a) => a.transitionProperty === '--iris-r') || {}).effect || { getTiming: () => ({}) }).getTiming().duration : undefined;
          (e.type === 'transitionrun' ? R.runs : R.ends).push({ t: performance.now(), el: e.elapsedTime, dur }); };
        o.addEventListener('transitionrun', window.__irisRec); o.addEventListener('transitionend', window.__irisRec);
        const tick = () => { if (!on) return; if (o.classList.contains('active')) R.frames.push(parseFloat(getComputedStyle(o).getPropertyValue('--iris-r')) || 0); requestAnimationFrame(tick); };
        requestAnimationFrame(tick); return 1; })()`);

      await ev(`window.__scene.travelPortal(${JSON.stringify(id)}); 1`);
      await T.waitFor(
        `document.getElementById('transition-overlay').classList.contains('active') && !document.getElementById('transition-overlay').hidden`,
        "màn chuyển cảnh hiện",
        5000,
      );
      ok(`màn chuyển cảnh hiện ngay khi qua cổng ${id}`);

      // Mống mắt phải CHUYỂN ĐỘNG thật: một transition CSS của --iris-r có thời lượng ~0,4 s BẮT ĐẦU chạy (không phải nhảy thẳng). KHÔNG đòi nó chạy
      // hết: khi khung đứng (máy tải, runner ~4-6 FPS) transition đóng bị đảo chiều giữa chừng bởi lần mở lại, và `transitionend` đầu tiên là của
      // transition NGƯỢC đã bị rút ngắn (đo: "kéo dài 0,228 s" khi ghim một nhân CPU)
      await T.waitFor(
        `window.__iris.runs.length >= 1`,
        "mống mắt khép: transition của --iris-r phải chạy (mống mắt nhảy thẳng, không có transition?)",
        15000,
      );
      const iris = (await ev(`window.__iris`)) as {
        runs: Array<{ t: number; el: number; dur?: number }>;
        ends: Array<{ t: number; el: number }>;
        frames: number[];
      };
      const mid = iris.frames.filter((r) => r > 20 && r < 1500).length;
      const longest = Math.max(0, ...iris.runs.map((r) => r.dur ?? 0));
      must(
        longest >= 350,
        `mống mắt THẬT SỰ chuyển động: ${iris.runs.length} transition chạy, thời lượng dài nhất ${longest} ms (cần >= 350 ms; ${mid} mẫu ở giữa trong ${iris.frames.length} khung vẽ)`,
      );
      ok(
        `mống mắt khép dần: transition --iris-r ${longest} ms, ${mid} mẫu ở giữa trong ${iris.frames.length} khung vẽ`,
      );
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

    // ---------------- Chặng ba (M7.5, #506): Âm Sương Trạch -> Hàn Vân Lĩnh -> Âm Sương Trạch ----------------
    // Nhân vật thứ ba lưu sẵn cạnh Lăng Hàn Quan (chỗ xuất hiện của cổng bắc Âm Sương, trong khu an toàn): bản đồ thứ tư là bản đồ Nguyên Anh, đi bộ từ cổng nam
    // qua cả Âm Sương dày quái là không cần thiết cho kiểm cổng.
    out(
      "\n--- Bốn bản đồ: Âm Sương Trạch -> Hàn Vân Lĩnh -> Âm Sương Trạch (cổng thật, nhân vật lưu sẵn cạnh Lăng Hàn Quan) ---",
    );
    const amBac = getMap("am_suong")!.portal("am_suong_bac")!;
    const hanNam = getMap("han_van")!.portal("han_van_nam")!;
    const NAME3 = "Canh Han Van";
    const SECRET3 = "e2e_secret_cc_3333333333333";
    await savePlayer({
      name: NAME3,
      secretHash: hashSecret(SECRET3),
      realm: 4,
      tier: 0,
      exp: 0,
      mapId: "am_suong",
      x: amBac.spawn.x,
      y: amBac.spawn.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    currentName = NAME3;
    currentSecret = SECRET3;
    await setStorage("");
    await login(url);
    await ev(
      `(() => { const s = document.getElementById('set-quality'); s.value = 'high'; s.dispatchEvent(new Event('change')); })(); 1`,
    );
    await T.waitFor(
      `window.__scene && window.__scene.map && window.__scene.map.def.id === 'am_suong'`,
      "vào đúng phòng Âm Sương Trạch (wrong_map đưa về đúng phòng)",
      30000,
    );
    ok("nhân vật lưu ở Âm Sương Trạch vào đúng phòng (qua wrong_map)");
    await checkDest("am_suong");
    await walkToPortal("am_suong_bac");
    await crossPortal("am_suong_bac", "han_van");
    // bản đồ thứ tư: đúng kích thước, chỗ xuất hiện cạnh Hồi Sương Quan (spawn của cổng nam), vẫn trong khu an toàn
    const hv = await ev(
      `JSON.stringify({ w: window.__scene.map.def.w, h: window.__scene.map.def.h, x: window.__scene.predX, y: window.__scene.predY, town: window.__scene.map.inTown(window.__scene.predX, window.__scene.predY) })`,
    );
    const hvInfo = JSON.parse(hv as string) as {
      w: number;
      h: number;
      x: number;
      y: number;
      town: boolean;
    };
    must(
      hvInfo.w === 128 && hvInfo.h === 128,
      `Hàn Vân Lĩnh 128 x 128 ô (${hvInfo.w} x ${hvInfo.h})`,
    );
    must(
      Math.hypot(hvInfo.x - hanNam.spawn.x, hvInfo.y - hanNam.spawn.y) < 80,
      `xuất hiện cạnh Hồi Sương Quan: (${hvInfo.x.toFixed(0)}, ${hvInfo.y.toFixed(0)}) cách chỗ xuất hiện (${hanNam.spawn.x}, ${hanNam.spawn.y}) < 80 px`,
    );
    ok(`bản đồ thứ tư: ${hvInfo.w} x ${hvInfo.h} ô, xuất hiện đúng cạnh Hồi Sương Quan`);
    await walkToPortal("han_van_nam");
    await crossPortal("han_van_nam", "am_suong");
    const back = await ev(`JSON.stringify({ x: window.__scene.predX, y: window.__scene.predY })`);
    const backXY = JSON.parse(back as string) as { x: number; y: number };
    must(
      Math.hypot(backXY.x - amBac.spawn.x, backXY.y - amBac.spawn.y) < 80,
      `về Âm Sương xuất hiện cạnh Lăng Hàn Quan: (${backXY.x.toFixed(0)}, ${backXY.y.toFixed(0)}) cách (${amBac.spawn.x}, ${amBac.spawn.y}) < 80 px`,
    );
    ok("về Âm Sương Trạch đúng cạnh Lăng Hàn Quan");
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
