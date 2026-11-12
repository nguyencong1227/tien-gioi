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
