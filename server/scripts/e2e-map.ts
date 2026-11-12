// E2E THẬT lớp trang trí bản đồ (M5.3, Issue #332): server Colyseus thật + Chrome headless + client đã build, vào game thật.
// Kiểm: lớp trang trí tất định (phiên mới ra cùng một lưới), ĐƯỢC VẼ THẬT (so điểm ảnh trên canvas khi bật / tắt lớp,
// không chỉ đếm ô), chi phí draw call thêm <= 2 mỗi khung, texture <= 64 KB, dựng lại cảnh 20 lần không rò đối tượng / texture,
// 0 lỗi console. BÀI HỌC #348: kiểm cái người chơi THẤY (điểm ảnh), không chỉ cái có trong cảnh.
// Chạy: `npm run build && npm run e2e:map -w server` (cần google-chrome).
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
  out("=== E2E THẬT lớp trang trí bản đồ: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-map-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-map-chrome-"));
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

    let NAME = "Trang Tri Ban Do"; // ca phiên mới dùng đạo hiệu khác: phiên cũ còn trong thời gian chờ nối lại
    const SECRET = "e2e_secret_map_11111111111";
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

    // ---------------- Ca 1: lớp trang trí có thật, đúng chỗ ----------------
    out("\n--- Ca 1: lớp trang trí tất định (Lạc Hà Trấn) ---");
    await setStorage("");
    await login(url);
    const info = await ev(`(() => { const s = window.__scene, L = s.decorLayer; if (!L) return null;
      const d = L.layer.data; let n = 0, h = 5381;
      for (let y = 0; y < d.length; y++) for (let x = 0; x < d[y].length; x++) { const i = d[y][x].index;
        if (i >= 0) { n++; h = (Math.imul(h, 33) ^ (i + 1) ^ (x * 131 + y * 7919)) | 0; } }
      return { n, h, depth: L.depth, baseDepth: s.mapLayer.depth, key: L.tileset[0].image.key,
               texBytes: L.tileset[0].image.source[0].width * L.tileset[0].image.source[0].height * 4 }; })()`);
    must(info !== null, "WorldScene có decorLayer");
    must(
      info.n > 500 && info.n < 1100,
      `số ô trang trí hợp lý cho Lạc Hà (${info.n}, kỳ vọng ~780)`,
    );
    must(
      info.depth > info.baseDepth && info.depth < 0,
      `lớp trang trí nằm giữa ô nền và thực thể (depth ${info.baseDepth} < ${info.depth} < 0)`,
    );
    must(
      info.texBytes <= 64 * 1024,
      `texture trang trí <= 64 KB (${(info.texBytes / 1024).toFixed(0)} KB, khoá ${info.key})`,
    );
    ok(
      `decorLayer: ${info.n} ô, depth ${info.depth}, texture ${(info.texBytes / 1024).toFixed(0)} KB`,
    );

    // Tất định: một phiên MỚI (cảnh mới, đạo hiệu khác) ra ĐÚNG cùng lưới
    NAME = "Trang Tri Hai";
    await setStorage("");
    await login(url);
    const info2 =
      await ev(`(() => { const d = window.__scene.decorLayer.layer.data; let n = 0, h = 5381;
      for (let y = 0; y < d.length; y++) for (let x = 0; x < d[y].length; x++) { const i = d[y][x].index;
        if (i >= 0) { n++; h = (Math.imul(h, 33) ^ (i + 1) ^ (x * 131 + y * 7919)) | 0; } }
      return { n, h }; })()`);
    must(
      info2.n === info.n && info2.h === info.h,
      `phiên mới: cùng lưới (${info2.n} ô, băm ${info2.h} = ${info.h})`,
    );
    ok("tất định: phiên mới ra đúng cùng lưới trang trí");

    // ---------------- Ca 2: được VẼ thật ----------------
    out("\n--- Ca 2: trang trí được vẽ ra màn hình (so điểm ảnh bật / tắt lớp) ---");
    // Đưa camera tới vùng dày trang trí nhất (20 x 12 ô) để phép đo không phụ thuộc chỗ nhân vật đứng
    const view =
      await ev(`(() => { const s = window.__scene, d = s.decorLayer.layer.data, cam = s.cameras.main;
      const W = 20, H = 12; let best = -1, bx = 0, by = 0;
      for (let y = 1; y + H < d.length - 1; y += 2) for (let x = 1; x + W < d[0].length - 1; x += 2) {
        let c = 0; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (d[y + j][x + i].index >= 0) c++;
        if (c > best) { best = c; bx = x; by = y; } }
      cam.stopFollow(); cam.centerOn((bx + W / 2) * 32, (by + H / 2) * 32);
      return { best, zoom: cam.zoom, w: cam.width, h: cam.height }; })()`);
    must(view.best >= 15, `vùng đo có đủ trang trí (${view.best} ô trong 20x12)`);
    await sleep(300);
    // Đếm điểm ảnh KHÁC nhau giữa hai ảnh chụp liên tiếp ngay trong trang (không chuyển dữ liệu ảnh lớn qua CDP)
    const diffBetween = async (visA: boolean, visB: boolean) =>
      Number(
        await ev(`new Promise((resolve) => { const s = window.__scene;
        const grab = (visible) => new Promise((res) => { s.decorLayer.setVisible(visible);
          const r = s.game.canvas.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
          setTimeout(() => s.game.renderer.snapshotArea(0, 0, w, h, (img) => {
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const x = c.getContext('2d'); x.drawImage(img, 0, 0); res(x.getImageData(0, 0, c.width, c.height).data); }), 120); });
        grab(${visA}).then((a) => grab(${visB}).then((b) => { let n = 0;
          for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
          resolve(n); })); })`),
      );
    // ĐỐI CHỨNG: hai ảnh chụp cùng trạng thái phải gần như giống hệt (nếu không, phép đo chỉ đo nhiễu / hoạt ảnh)
    const control = await diffBetween(true, true);
    must(control < 500, `đối chứng: hai ảnh cùng trạng thái chỉ khác ${control} điểm ảnh (< 500)`);
    const diff = await diffBetween(false, true);
    must(
      diff > 2000 && diff > control * 10,
      `bật lớp trang trí đổi nhiều điểm ảnh trên canvas (${diff} khác, đối chứng ${control}; cần > 2000 và gấp 10 lần đối chứng)`,
    );
    ok(
      `trang trí ĐƯỢC VẼ: ${diff} điểm ảnh khác giữa tắt và bật lớp, đối chứng ${control} (vùng ${view.best} ô trang trí)`,
    );

    // Ảnh để xem bằng mắt (chỉ khi đặt E2E_SHOTS): cùng vùng, lớp trang trí tắt rồi bật
    await ev(`window.__scene.decorLayer.setVisible(false); 1`);
    await sleep(250);
    await T.shot("map-decor-tat");
    await ev(`window.__scene.decorLayer.setVisible(true); 1`);
    await sleep(250);
    await T.shot("map-decor-bat");

    // ---------------- Ca 3: chi phí draw call ----------------
    out("\n--- Ca 3: draw call mỗi khung (WebGL thật) ---");
    const measure = (visible: boolean) =>
      ev(`new Promise((resolve) => { const s = window.__scene, g = s.game, gl = g.renderer.gl;
        if (!gl) return resolve(-1); s.decorLayer.setVisible(${visible});
        let draws = 0, f = 0; const de = gl.drawElements, da = gl.drawArrays;
        gl.drawElements = function () { draws++; return de.apply(this, arguments); };
        gl.drawArrays = function () { draws++; return da.apply(this, arguments); };
        const on = () => { if (++f > 30) { g.events.off('postrender', on); gl.drawElements = de; gl.drawArrays = da; resolve(draws / 30); } };
        g.events.on('postrender', on); })`) as Promise<number>;
    const off = Number(await measure(false));
    const on = Number(await measure(true));
    must(off >= 0, "renderer là WebGL (đếm được draw call)");
    must(
      on - off <= 2.01,
      `lớp trang trí thêm <= 2 draw call mỗi khung (tắt ${off.toFixed(1)}, bật ${on.toFixed(1)})`,
    );
    ok(
      `draw call mỗi khung: tắt ${off.toFixed(1)} -> bật ${on.toFixed(1)} (+${(on - off).toFixed(1)})`,
    );

    // ---------------- Ca 4: dựng lại cảnh không rò ----------------
    out("\n--- Ca 4: dựng lại bản đồ 20 lần không rò đối tượng / texture ---");
    const before = await ev(
      `({ kids: window.__scene.children.list.length, tex: window.__scene.textures.getTextureKeys().length })`,
    );
    await ev(
      `(() => { for (let i = 0; i < 20; i++) window.__scene.buildMapVisuals(); return 1; })()`,
    );
    const after = await ev(
      `({ kids: window.__scene.children.list.length, tex: window.__scene.textures.getTextureKeys().length, layer: !!window.__scene.decorLayer })`,
    );
    must(after.layer, "decorLayer còn sau khi dựng lại");
    must(
      after.kids === before.kids,
      `số đối tượng trong cảnh không đổi (${before.kids} -> ${after.kids})`,
    );
    must(after.tex === before.tex, `số texture không đổi (${before.tex} -> ${after.tex})`);
    ok(`không rò: ${before.kids} đối tượng, ${before.tex} texture trước và sau 20 lần dựng lại`);

    // ---------------- Ca 5: ánh sáng môi trường + vignette ----------------
    out("\n--- Ca 5: ánh sáng môi trường + vignette (điểm ảnh thật theo bậc chất lượng) ---");
    const setQuality = (v: string) =>
      ev(
        `(() => { const s = document.getElementById('set-quality'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })(); 1`,
      );
    /** Độ sáng trung bình bốn góc (16x16) và giữa màn hình (32x32) của canvas WebGL THẬT. */
    const luma = () =>
      ev(`new Promise((resolve) => { const g = window.__scene.game, w = g.canvas.width, h = g.canvas.height;
        setTimeout(() => g.renderer.snapshotArea(0, 0, w, h, (img) => {
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const x = c.getContext('2d'); x.drawImage(img, 0, 0);
          const patch = (x0, y0, pw, ph) => { const d = x.getImageData(x0, y0, pw, ph).data; let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            return sum / (d.length / 4); };
          resolve({ w, h, tl: patch(2, 2, 16, 16), tr: patch(w - 18, 2, 16, 16), bl: patch(2, h - 18, 16, 16),
            br: patch(w - 18, h - 18, 16, 16), c: patch(Math.round(w / 2) - 16, Math.round(h / 2) - 16, 32, 32) }); }), 250); })`) as Promise<
        Record<string, number>
      >;
    const flags = () =>
      ev(`({ amb: window.__scene.lightAmbient.visible, vig: window.__scene.lightVignette.visible,
        vw: Math.round(window.__scene.lightVignette.displayWidth), cw: Math.round(window.__scene.cameras.main.displayWidth) })`) as Promise<{
        amb: boolean;
        vig: boolean;
        vw: number;
        cw: number;
      }>;
    await setQuality("high");
    await sleep(500);
    const fHigh = await flags();
    must(fHigh.amb && fHigh.vig, "bậc Cao: cả ánh sáng môi trường lẫn vignette hiện");
    must(
      fHigh.vw >= fHigh.cw,
      `ảnh phủ che đủ khung nhìn (${fHigh.vw} >= ${fHigh.cw} px thế giới)`,
    );
    const lumaHigh = await luma();
    const lumaHigh2 = await luma();
    await T.shot("map-light-cao");
    await setQuality("low");
    await sleep(500);
    const fLow = await flags();
    must(!fLow.amb && !fLow.vig, "bậc Thấp: cả hai đều tắt");
    const lumaLow = await luma();
    await T.shot("map-light-thap");
    const corners = ["tl", "tr", "bl", "br"] as const;
    for (const k of corners) {
      const ctl = Math.abs(lumaHigh[k] / lumaHigh2[k] - 1);
      must(
        ctl < 0.05,
        `đối chứng góc ${k}: hai ảnh cùng bậc khác ${(ctl * 100).toFixed(1)} % (< 5 %)`,
      );
      const ratio = lumaHigh[k] / lumaLow[k];
      must(
        ratio < 0.9,
        `góc ${k} tối đi khi bật vignette: độ sáng ${lumaHigh[k].toFixed(0)} / ${lumaLow[k].toFixed(0)} = ${ratio.toFixed(2)} (< 0,9)`,
      );
    }
    const cRatio = Math.abs(lumaHigh.c / lumaLow.c - 1);
    must(
      cRatio < 0.1,
      `giữa màn hình gần như không đổi (${(cRatio * 100).toFixed(1)} % < 10 %): vùng chơi sạch`,
    );
    ok(
      `ánh sáng: góc tối ${corners.map((k) => (lumaHigh[k] / lumaLow[k]).toFixed(2)).join(" / ")} so với bậc Thấp, giữa màn hình đổi ${(cRatio * 100).toFixed(1)} %`,
    );
    // Draw call: bật / tắt hai ảnh phủ trực tiếp (cùng bậc, cùng cảnh)
    await setQuality("high");
    await sleep(500);
    const drawsWithLight = (on: boolean) =>
      ev(`new Promise((resolve) => { const s = window.__scene, g = s.game, gl = g.renderer.gl;
        if (!gl) return resolve(-1); s.lightAmbient.setVisible(${on}); s.lightVignette.setVisible(${on});
        let draws = 0, f = 0; const de = gl.drawElements, da = gl.drawArrays;
        gl.drawElements = function () { draws++; return de.apply(this, arguments); };
        gl.drawArrays = function () { draws++; return da.apply(this, arguments); };
        const on2 = () => { if (++f > 30) { g.events.off('postrender', on2); gl.drawElements = de; gl.drawArrays = da; resolve(draws / 30); } };
        g.events.on('postrender', on2); })`) as Promise<number>;
    const dOff = Number(await drawsWithLight(false));
    const dOn = Number(await drawsWithLight(true));
    must(dOff >= 0, "renderer là WebGL");
    must(
      dOn - dOff <= 2.01,
      `hai ảnh phủ thêm <= 2 draw call mỗi khung (tắt ${dOff.toFixed(1)}, bật ${dOn.toFixed(1)})`,
    );
    ok(
      `draw call mỗi khung: tắt ${dOff.toFixed(1)} -> bật ${dOn.toFixed(1)} (+${(dOn - dOff).toFixed(1)})`,
    );

    // ---------------- Ca 6: thời tiết bằng hạt ----------------
    out(
      "\n--- Ca 6: thời tiết (cánh hoa đào ở Lạc Hà): hạt sống thật, ngân sách, điểm ảnh, theo bậc ---",
    );
    const setCheck = (id: string, on: boolean) =>
      ev(
        `(() => { const c = document.getElementById(${JSON.stringify(id)}); c.checked = ${on}; c.dispatchEvent(new Event('change')); })(); 1`,
      );
    const alive = async () =>
      Number(
        await ev(
          `window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0)`,
        ),
      );
    const emitters = async () => Number(await ev(`window.__fx.stats().liveEmitters`));
    const waitDrain = () =>
      T.waitFor(
        `window.__fx.stats().liveEmitters === 0 && window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0) === 0`,
        "hạt thời tiết hết",
      );
    // Mặc định ở ?debug: thời tiết TẮT để các script đo khác có cảnh sạch
    must(
      Boolean(await ev(`window.__scene.weatherPaused`)),
      "?debug mặc định tắt thời tiết (weatherPaused = true)",
    );
    await setQuality("high");
    await sleep(400);
    await sleep(1500);
    must((await alive()) === 0, "tạm dừng: không có hạt nào");
    // Bắt đầu: bật thời tiết, đợi 5 s THEO ĐỒNG HỒ PHASER (nhịp ~1,7 s, tuổi thọ <= 3,8 s)
    await ev(`window.__scene.weatherPaused = false; 1`);
    await T.waitFor(
      `window.__scene.time.now > ${Number(await ev(`window.__scene.time.now`)) + 5000}`,
      "5 s đồng hồ trò chơi",
    );
    const wAlive = await alive();
    const wEm = await emitters();
    must(wAlive >= 8, `bậc Cao: có hạt thời tiết sống thật (${wAlive} >= 8)`);
    must(wAlive <= 120, `số hạt thời tiết hợp lý (${wAlive} <= 120)`);
    must(
      wEm >= 1 && wEm <= 8,
      `chỉ vài emitter ưu tiên 0 (${wEm} trong 1..8; trần ưu tiên 0 bậc Cao = 14)`,
    );
    ok(`bậc Cao: ${wAlive} hạt sống, ${wEm} emitter`);
    // Hạt ĐƯỢC VẼ: so ảnh khi thời tiết chạy với ảnh sau khi tạm dừng và hết hạt (có đối chứng)
    const diffRun = (
      a: string,
      b: string,
    ) => `(() => { let n = 0; const A = window.${a}, B = window.${b};
      for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 60) n++; return n; })()`;
    const stash = (name: string) =>
      ev(`new Promise((resolve) => { const g = window.__scene.game, w = g.canvas.width, h = g.canvas.height;
        setTimeout(() => g.renderer.snapshotArea(0, 0, w, h, (img) => {
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const x = c.getContext('2d'); x.drawImage(img, 0, 0); window.${name} = x.getImageData(0, 0, c.width, c.height).data; resolve(1); }), 150); })`);
    await T.shot("map-weather-bat");
    await stash("__wOn");
    await ev(`window.__scene.weatherPaused = true; 1`);
    await waitDrain();
    await stash("__wOff1");
    await stash("__wOff2");
    const wControl = Number(await ev(diffRun("__wOff1", "__wOff2")));
    const wDiff = Number(await ev(diffRun("__wOn", "__wOff1")));
    must(
      wControl < 300,
      `đối chứng: hai ảnh không thời tiết chỉ khác ${wControl} điểm ảnh (< 300)`,
    );
    must(
      wDiff > 400 && wDiff > wControl * 3,
      `hạt thời tiết ĐƯỢC VẼ: ${wDiff} điểm ảnh khác ảnh không thời tiết (đối chứng ${wControl}; cần > 400 và gấp 3 lần)`,
    );
    ok(`hạt thời tiết được vẽ: ${wDiff} điểm ảnh khác, đối chứng ${wControl}`);
    // Bậc Thấp: không có thời tiết
    await setQuality("low");
    await sleep(500);
    await ev(`window.__scene.weatherPaused = false; 1`);
    await T.waitFor(
      `window.__scene.time.now > ${Number(await ev(`window.__scene.time.now`)) + 4000}`,
      "4 s đồng hồ trò chơi",
    );
    must((await alive()) === 0, "bậc Thấp: không có hạt thời tiết");
    ok("bậc Thấp: 0 hạt thời tiết");
    // Giảm chuyển động: không có thời tiết ở bậc Cao
    await setQuality("high");
    await sleep(500);
    await setCheck("set-reduced-motion", true);
    await sleep(500);
    await T.waitFor(
      `window.__scene.time.now > ${Number(await ev(`window.__scene.time.now`)) + 4000}`,
      "4 s đồng hồ trò chơi",
    );
    must((await alive()) === 0, "giảm chuyển động: không có hạt thời tiết");
    ok("giảm chuyển động: 0 hạt thời tiết");
    await setCheck("set-reduced-motion", false);
    await ev(`window.__scene.weatherPaused = true; 1`);

    // ---------------- Ca 7: sương trôi ----------------
    out("\n--- Ca 7: sương trôi (số mảng theo bậc, trôi thật, điểm ảnh, giảm chuyển động) ---");
    const gameMs = async () => Number(await ev(`window.__scene.time.now`));
    const waitGame = async (ms: number, label: string) =>
      T.waitFor(`window.__scene.time.now > ${(await gameMs()) + ms}`, label);
    const fogXs = () => ev(`window.__scene.fogImages.map((im) => im.x)`) as Promise<number[]>;
    /** Độ sáng trung bình CẢ khung canvas WebGL THẬT (sương làm sáng nhẹ toàn cảnh). */
    const meanLuma = () =>
      ev(`new Promise((resolve) => { const g = window.__scene.game, w = g.canvas.width, h = g.canvas.height;
        setTimeout(() => g.renderer.snapshotArea(0, 0, w, h, (img) => {
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const x = c.getContext('2d'); x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data; let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          resolve(sum / (d.length / 4)); }), 200); })`) as Promise<number>;
    await setQuality("high");
    await sleep(500);
    const nHigh = Number(await ev(`window.__scene.fogImages.length`));
    must(nHigh === 8, `bậc Cao: 8 mảng sương (${nHigh})`);
    must(
      Boolean(await ev(`window.__scene.fogImages.every((im) => im.visible && im.alpha > 0)`)),
      "mọi mảng sương hiện và có độ đậm",
    );
    must(
      Boolean(await ev(`window.__scene.fogPaused`)),
      "?debug mặc định để sương đứng yên (fogPaused = true)",
    );
    await ev(`window.__scene.fogPaused = false; 1`); // bật lại chuyển động sương để kiểm trôi
    const xs0 = await fogXs();
    await waitGame(2500, "2,5 s đồng hồ trò chơi");
    const xs1 = await fogXs();
    const moved = xs1.filter((x, i) => Math.abs(x - xs0[i]) > 3).length;
    must(moved >= 6, `sương TRÔI thật: ${moved}/8 mảng dời > 3 px sau 2,5 s (đồng hồ trò chơi)`);
    // Điểm ảnh: bật / tắt toàn bộ mảng sương, có đối chứng
    const lumaOn1 = await meanLuma();
    const lumaOn2 = await meanLuma();
    await T.shot("map-fog-bat");
    await ev(`window.__scene.fogImages.forEach((im) => im.setVisible(false)); 1`);
    const lumaOff = await meanLuma();
    await T.shot("map-fog-tat");
    await ev(`window.__scene.fogImages.forEach((im) => im.setVisible(true)); 1`);
    const lift = lumaOn1 / lumaOff - 1;
    const noise = Math.abs(lumaOn1 / lumaOn2 - 1);
    must(
      noise < 0.005,
      `đối chứng: hai ảnh cùng trạng thái khác ${(noise * 100).toFixed(2)} % (< 0,5 %)`,
    );
    must(
      lift > 0.01 && lift > noise * 3,
      `sương ĐƯỢC VẼ: làm sáng cảnh ${(lift * 100).toFixed(2)} % (đối chứng ${(noise * 100).toFixed(2)} %; cần > 1 % và gấp 3 lần)`,
    );
    ok(
      `sương: ${moved}/8 mảng trôi, làm sáng cảnh ${(lift * 100).toFixed(2)} % (đối chứng ${(noise * 100).toFixed(2)} %)`,
    );
    // Draw call: bật / tắt toàn bộ mảng sương (cùng bậc, cùng cảnh)
    const drawsWithFog = (on: boolean) =>
      ev(`new Promise((resolve) => { const s = window.__scene, g = s.game, gl = g.renderer.gl;
        if (!gl) return resolve(-1); s.fogImages.forEach((im) => im.setVisible(${on}));
        let draws = 0, f = 0; const de = gl.drawElements, da = gl.drawArrays;
        gl.drawElements = function () { draws++; return de.apply(this, arguments); };
        gl.drawArrays = function () { draws++; return da.apply(this, arguments); };
        const on2 = () => { if (++f > 30) { g.events.off('postrender', on2); gl.drawElements = de; gl.drawArrays = da; resolve(draws / 30); } };
        g.events.on('postrender', on2); })`) as Promise<number>;
    const fOff = Number(await drawsWithFog(false));
    const fOn = Number(await drawsWithFog(true));
    must(fOff >= 0, "renderer là WebGL");
    must(
      fOn - fOff <= 2.01,
      `8 mảng sương thêm <= 2 draw call mỗi khung (tắt ${fOff.toFixed(1)}, bật ${fOn.toFixed(1)})`,
    );
    ok(
      `draw call mỗi khung: tắt ${fOff.toFixed(1)} -> bật ${fOn.toFixed(1)} (+${(fOn - fOff).toFixed(1)})`,
    );
    // Bậc Vừa: 4 mảng; bậc Thấp: không có
    await setQuality("mid");
    await sleep(500);
    must(Number(await ev(`window.__scene.fogImages.length`)) === 4, "bậc Vừa: 4 mảng sương");
    await setQuality("low");
    await sleep(500);
    must(Number(await ev(`window.__scene.fogImages.length`)) === 0, "bậc Thấp: không có sương");
    ok("bậc Vừa 4 mảng, bậc Thấp 0 mảng");
    // Giảm chuyển động: sương CÒN NHƯNG đứng yên
    await setQuality("high");
    await sleep(500);
    await setCheck("set-reduced-motion", true);
    await sleep(500);
    const still0 = await fogXs();
    must(still0.length === 8, "giảm chuyển động: sương vẫn hiện (8 mảng)");
    await waitGame(2500, "2,5 s đồng hồ trò chơi");
    const still1 = await fogXs();
    const stillMoved = still1.filter((x, i) => Math.abs(x - still0[i]) > 0.01).length;
    must(stillMoved === 0, `giảm chuyển động: sương đứng yên (${stillMoved} mảng còn dời)`);
    await setCheck("set-reduced-motion", false);
    await ev(`window.__scene.fogPaused = true; 1`);
    ok("giảm chuyển động: sương hiện nhưng đứng yên");
    // Đổi bản đồ (dựng lại): số mảng không đổi, không rò đối tượng
    const kidsBefore = Number(await ev(`window.__scene.children.list.length`));
    await ev(
      `(() => { for (let i = 0; i < 20; i++) window.__scene.buildMapVisuals(); return 1; })()`,
    );
    const kidsAfter = Number(await ev(`window.__scene.children.list.length`));
    must(
      kidsAfter === kidsBefore,
      `dựng lại 20 lần: số đối tượng không đổi (${kidsBefore} -> ${kidsAfter})`,
    );
    must(Number(await ev(`window.__scene.fogImages.length`)) === 8, "dựng lại: vẫn 8 mảng sương");
    ok("dựng lại bản đồ 20 lần: không rò mảng sương");

    must(T.errors.length === 0, `0 lỗi console / exception (${T.errors.slice(0, 2).join(" | ")})`);
    ok("0 lỗi console / exception");
    out("\n=== E2E LỚP TRANG TRÍ ĐẠT ===");
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
