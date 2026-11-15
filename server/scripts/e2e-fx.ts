// E2E THẬT lõi hiệu ứng gfx/fx (M5.2, Issue #325): server Colyseus thật + Chrome headless + client đã build, vào game thật.
// Kiểm: atlas hạt + phông chữ bay được dựng bằng mã (kích thước trong ngân sách bộ nhớ); số HẠT SỐNG THẬT của Phaser không vượt
// ngân sách theo bậc chất lượng (Thấp / Vừa / Cao); ưu tiên 2 (của mình) vượt được trần tới gấp đôi, ưu tiên 0 chỉ tới 60 %; ngân sách
// được trả lại khi hạt hết thời gian sống; chữ bay bằng BitmapText không vượt `damageNumbers` và TÁI DÙNG đối tượng; giảm chuyển động giảm
// hạt 70 %; `onHitFx` thật của WorldScene dùng lõi mới; đóng lõi thì không còn emitter / chữ nào; 0 lỗi console.
// Chạy: `npm run build && npm run e2e:fx -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, shown, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 38000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

async function main() {
  out("=== E2E THẬT lõi hiệu ứng: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-fx-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-fx-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");

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
      { stdio: "ignore" },
    );
    let targets: any[] = [];
    for (const start = Date.now(); Date.now() - start < 15000;) {
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

    const NAME = "Hieu Ung Loi"; // ca 3 dùng đạo hiệu khác: ca 2 vừa rời phòng, nhân vật cũ còn trong thời gian chờ nối lại
    const SECRET = "e2e_secret_fx_1111111111111";
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
        `(() => { const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME)}; document.getElementById('login-form')?.requestSubmit(); })(); 1`,
      );
      await T.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent && (window.__scene?.predX > 0 || window.__scene?.hasMe)`,
        "vào game thành công và nhân vật có toạ độ",
      );
    };
    const setQuality = (v: string) =>
      T.ev(
        `(() => { const s = document.getElementById('set-quality'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })(); 1`,
      );
    const setCheck = (id: string, on: boolean) =>
      T.ev(
        `(() => { const c = document.getElementById(${JSON.stringify(id)}); c.checked = ${on}; c.dispatchEvent(new Event('change')); })(); 1`,
      );

    const fx = (expr: string) =>
      T.ev(`(() => { const fx = window.__fx; return ${expr}; })()`) as Promise<any>;
    /** Số hạt đang SỐNG THẬT trong mọi emitter của cảnh (đọc từ Phaser, không phải từ sổ ngân sách). */
    const aliveParticles = async () =>
      Number(
        await T.ev(
          `window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0)`,
        ),
      );
    const countOf = async (type: string) =>
      Number(
        await T.ev(
          `window.__scene.children.list.filter((c) => c.type === ${JSON.stringify(type)}).length`,
        ),
      );
    const burst = (n: number, opts: string, id = "hit-spark") =>
      fx(
        `(() => { let ok = 0; for (let i = 0; i < ${n}; i++) if (fx.play(${JSON.stringify(id)}, window.__scene.predX, window.__scene.predY, ${opts})) ok++; return ok; })()`,
      );

    // ---------------- Ca 1: dựng bằng mã ----------------
    out("\n--- Ca 1: atlas hạt + phông chữ bay dựng bằng mã ---");
    await setStorage('localStorage.setItem("tg_quality", "high");');
    await login(`http://127.0.0.1:${PORT}/?debug`);
    await T.waitFor(
      `!!window.__fx && (window.__scene?.predX > 0 || window.__scene?.hasMe)`,
      "lõi hiệu ứng (window.__fx) và toạ độ nhân vật có mặt",
    );
    const tex =
      (await T.ev(`(() => { const t = window.__scene.textures, a = t.get('fx-atlas'), f = t.get('fx-font');
      return { atlas: t.exists('fx-atlas') && a.getFrameNames().filter((n) => n !== '__BASE'), atlasPx: a.source[0].width * a.source[0].height * 4,
        font: window.__scene.cache.bitmapFont.exists('fx-font'), fontPx: f.source[0].width * f.source[0].height * 4,
        glyphs: Object.keys(window.__scene.cache.bitmapFont.get('fx-font').data.chars).length }; })()`)) as any;
    must(
      JSON.stringify(tex.atlas) ===
        JSON.stringify(["dot", "spark", "ring", "smoke", "petal", "ember"]),
      `atlas hạt đủ 6 khung: ${JSON.stringify(tex.atlas)}`,
    );
    must(tex.font === true && tex.glyphs >= 150, `phông bit-map có >= 150 glyph: ${tex.glyphs}`);
    must(
      tex.atlasPx + tex.fontPx < 3 * 1024 * 1024,
      `bộ nhớ texture hiệu ứng < 3 MB (≈ 6 % ngân sách 48 MB của bậc Thấp): ${(tex.atlasPx + tex.fontPx) / 1024} KB`,
    );
    ok(
      `atlas hạt ${(tex.atlasPx / 1024).toFixed(0)} KB + phông ${(tex.fontPx / 1024).toFixed(0)} KB (${tex.glyphs} glyph)`,
    );

    // Phông phải có UV (u0..v1) trong [0,1]: bộ vẽ WebGL của BitmapText đọc UV chứ không đọc x / y; thiếu UV thì chữ KHÔNG vẽ gì
    // (số sát thương vô hình, không báo lỗi; lỗi này đã lọt qua #345 vì các ca kiểm chỉ đếm đối tượng chữ)
    const uv =
      (await T.ev(`(() => { const chars = window.__scene.cache.bitmapFont.get('fx-font').data.chars;
      const bad = Object.keys(chars).filter((k) => { const g = chars[k];
        return ![g.u0, g.v0, g.u1, g.v1].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) || g.u1 < g.u0 || g.v1 < g.v0; });
      return { total: Object.keys(chars).length, bad: bad.length }; })()`)) as any;
    must(uv.bad === 0, `mọi glyph có UV hợp lệ trong [0,1] (${uv.total} glyph, hỏng ${uv.bad})`);

    // Chuẩn bị camera đúng vị trí nhân vật trước khi phát chữ bay
    await T.ev(`(() => {
      const s = window.__scene;
      s.cameras.main.centerOn(s.predX, s.predY);
    })()`);

    // (a) & (b): Gọi floatNumber, ghi nhận trạng thái BitmapText / fx ngay lập tức và chụp ảnh ngay không chờ
    const floatImmediate = (await T.ev(`(() => {
      const s = window.__scene, cam = s.cameras.main;
      const spawned = s.fx.floatNumber('88', s.predX, s.predY - 40, { color: 0xff00ff, size: 48, priority: 2 });
      // GHIM chữ ở tư thế vừa sinh trong lúc đo: chữ bay sống FLOAT_MS = 800 ms theo đồng hồ Phaser, mà trên runner CI (WebGL phần mềm) khung hình
      // tụt 47 -> 4 FPS nên ảnh chụp đầu tiên tới SAU khi chữ đã hết đời và bị ẩn (log runner #694: lần thăm dò 1 đã alpha 0,016 / visible false).
      // Ca này kiểm "chữ được vẽ ra canvas" (UV phông), không kiểm chuyển động (float-set.test.ts lo), nên đo độc lập với tốc độ khung.
      window.__fxUpdateOrig = s.fx.update;
      s.fx.update = () => {};
      const stats = s.fx.stats();
      const bms = (s.children?.list ?? [])
        .filter((c) => c.type === 'BitmapText')
        .map((t) => ({
          text: t.text,
          x: t.x,
          y: t.y,
          alpha: t.alpha,
          visible: t.visible,
          active: t.active,
          tint: t.tintTopLeft ?? t.tint,
          depth: t.depth,
          scaleX: t.scaleX,
          scaleY: t.scaleY,
          fontSize: t.fontSize,
          originX: t.originX,
          originY: t.originY,
          inView: cam.worldView ? cam.worldView.contains(t.x, t.y) : null,
        }));
      return {
        spawned,
        stats,
        bms,
        quality: s.quality ?? localStorage.getItem("tg_quality"),
        actualFps: Math.round(s.game.loop.actualFps * 10) / 10,
        predX: s.predX,
        predY: s.predY,
        cam: {
          scrollX: Math.round(cam.scrollX),
          scrollY: Math.round(cam.scrollY),
          zoom: cam.zoom,
          worldView: cam.worldView
            ? {
                x: Math.round(cam.worldView.x),
                y: Math.round(cam.worldView.y),
                w: Math.round(cam.worldView.width),
                h: Math.round(cam.worldView.height),
              }
            : null,
        },
      };
    })()`)) as any;

    // Chụp ảnh NGAY LẬP TỨC qua CDP, không chờ vòng thăm dò
    const shotImmediate = await T.shot("fx-immediate");

    // Và chữ bay THẬT SỰ ĐƯỢC VẼ: chữ tím (nền cỏ không có màu tím) chụp từ canvas WebGL phải có nhiều điểm ảnh tím
    const paintResult = (await T.ev(`new Promise((resolve) => {
      const s = window.__scene, cam = s.cameras.main;
      const r = s.game.canvas.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      // Màu tím nhạt hơn một chút (g < 130): ánh sáng môi trường + sương (#357, #362) phủ nhẹ lên chữ nên g của 0xff00ff tăng tới ~70-90.
      // Thăm dò tối đa 3 s (máy dùng chung có thể quá tải, khung chậm: chờ cố định 60 ms làm ca kiểm chập chờn); lấy số LỚN NHẤT thấy được
      let best = 0, tries = 0, lastNonBlack = 0, lastTotal = 0;
      const triesHistory = [];
      const grab = () => s.game.renderer.snapshotArea(0, 0, w, h, (img) => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let n = 0, nonBlack = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 180 && d[i + 2] > 180 && d[i + 1] < 130) n++;
          if (d[i] > 0 || d[i + 1] > 0 || d[i + 2] > 0) nonBlack++;
        }
        if (n > best) best = n;
        lastNonBlack = nonBlack;
        lastTotal = c.width * c.height;
        tries++;

        const currentBms = (s.children?.list ?? [])
          .filter((obj) => obj.type === 'BitmapText')
          .map((t) => ({ text: t.text, x: t.x, y: t.y, a: t.alpha, v: t.visible, inView: cam.worldView ? cam.worldView.contains(t.x, t.y) : null }));
        if (tries <= 5 || tries % 5 === 0) {
          triesHistory.push({
            try: tries,
            purplePx: n,
            fps: Math.round(s.game.loop.actualFps * 10) / 10,
            bms: currentBms,
          });
        }

        if (best > 150 || tries >= 25) {
          const renType = s.game.renderer.type === 2 ? 'WEBGL' : (s.game.renderer.type === 1 ? 'CANVAS' : String(s.game.renderer.type));
          const gl = s.game.renderer.gl;
          const isContextLost = gl && typeof gl.isContextLost === 'function' ? gl.isContextLost() : null;
          resolve({
            best,
            tries,
            triesHistory,
            rendererType: renType,
            actualFps: Math.round(s.game.loop.actualFps * 10) / 10,
            visibilityState: document.visibilityState,
            nonBlackPx: lastNonBlack,
            totalPx: lastTotal,
            glContextLost: isContextLost,
            canvasW: s.game.canvas ? s.game.canvas.width : 0,
            canvasH: s.game.canvas ? s.game.canvas.height : 0,
            rectW: w,
            rectH: h,
            predX: s.predX,
            predY: s.predY,
          });
        } else {
          setTimeout(grab, 120);
        }
      });
      setTimeout(grab, 60);
    })`)) as any;

    const painted = Number(paintResult?.best ?? 0);
    if (painted <= 150) {
      out(`  [CHẨN ĐOÁN FX KHI ĐỎ]:`);
      out(`    renderer.type: ${paintResult?.rendererType} (cần WEBGL)`);
      out(
        `    actualFps (lúc float -> lúc snapshot cuối): ${floatImmediate?.actualFps} -> ${paintResult?.actualFps}`,
      );
      out(`    visibilityState: ${paintResult?.visibilityState}`);
      out(`    glContextLost: ${paintResult?.glContextLost}`);
      out(`    điểm ảnh khác đen: ${paintResult?.nonBlackPx}/${paintResult?.totalPx}`);
      out(
        `    kích thước canvas: ${paintResult?.canvasW}x${paintResult?.canvasH} (CSS: ${paintResult?.rectW}x${paintResult?.rectH})`,
      );
      out(`    toạ độ nhân vật: (${paintResult?.predX}, ${paintResult?.predY})`);
      out(`    bậc chất lượng: ${floatImmediate?.quality}`);
      out(`    camera viewport: ${JSON.stringify(floatImmediate?.cam)}`);
      out(`    floatNumber kết quả: ${floatImmediate?.spawned}`);
      out(`    s.fx stats (ngay sau float): ${JSON.stringify(floatImmediate?.stats)}`);
      out(`    BitmapText list (ngay sau float): ${JSON.stringify(floatImmediate?.bms)}`);
      out(`    lịch sử thăm dò snapshotArea: ${JSON.stringify(paintResult?.triesHistory)}`);
      out(`    tổng số lần thử: ${paintResult?.tries}`);
      if (shotImmediate) out(`    đã lưu ảnh chụp ngay sau float (CDP): ${shotImmediate}`);
      const shotPath = await T.shot("fx-failure");
      if (shotPath) out(`    đã lưu ảnh chụp khi kết thúc (CDP): ${shotPath}`);
    }
    // Trả lại chuyển động rồi dọn chữ ghim
    await T.ev(
      `(() => { if (window.__fxUpdateOrig && window.__scene?.fx) window.__scene.fx.update = window.__fxUpdateOrig; window.__fx?.clear(); })()`,
    );
    must(painted > 150, `chữ bay được VẼ thật ra màn hình (điểm ảnh tím: ${painted})`);
    ok(`glyph có UV hợp lệ và chữ bay thật sự được vẽ (${painted} điểm ảnh)`);

    // ---------------- Ca 2: ngân sách hạt theo bậc ----------------
    out("\n--- Ca 2: số hạt sống THẬT không vượt ngân sách (Cao: 520 hạt / 24 emitter) ---");
    // Phát 60 lần ưu tiên 1 (chạm trần 24) và ngay sau đó 40 lần ưu tiên 2 trong cùng tick để không bị trôi 320 ms hạt sống
    const bursts = (await fx(`(() => {
      let ok1 = 0, ok2 = 0;
      for (let i = 0; i < 60; i++) if (fx.play("hit-spark", window.__scene.predX, window.__scene.predY, {})) ok1++;
      for (let i = 0; i < 40; i++) if (fx.play("hit-spark", window.__scene.predX, window.__scene.predY, { priority: 2 })) ok2++;
      return { ok1, ok2 };
    })()`)) as any;
    must(
      bursts.ok1 === 24,
      `Cao: 60 lần phát cùng lúc ưu tiên 1 -> chỉ 24 được nhận (trần emitter), nhận ${bursts.ok1}`,
    );
    must(
      bursts.ok2 === 24,
      `ưu tiên 2: vượt trần tới 48 emitter -> nhận thêm 24, nhận ${bursts.ok2}`,
    );
    ok(
      `24/60 hiệu ứng được nhận, ưu tiên 2 (của mình) vượt được trần tới gấp đôi (48 emitter), phần vượt gấp đôi bị bỏ`,
    );
    const alive2 = await aliveParticles();
    must(alive2 > 0 && alive2 <= 520 * 2, `hạt sống thật <= gấp đôi trần: ${alive2}`);
    // ưu tiên 0: tối đa 60 % trần
    // Hạt hết thời gian sống (<= 320 ms theo đồng hồ Phaser): thăm dò tới 15 s thay vì chờ cố định (máy quá tải thì khung chậm)
    await T.waitFor(
      `window.__fx.stats().liveEmitters === 0 && window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0) === 0`,
      "hạt hết thời gian sống",
    );
    must((await fx(`fx.stats().liveEmitters`)) === 0, "hết thời gian sống -> ngân sách trả về 0");
    must((await aliveParticles()) === 0, `hạt sống thật về 0: ${await aliveParticles()}`);
    ok("hạt hết thời gian sống: ngân sách VÀ hạt thật đều về 0");
    const amb = await burst(60, "{}", "ambient-glimmer");
    must(amb === 14, `ưu tiên 0 (môi trường): chỉ dùng tới 60 % trần emitter (14/24), nhận ${amb}`);
    ok("ưu tiên 0 (môi trường) bị chặn ở 60 % trần (14 emitter)");
    await sleep(1300);

    // ---------------- Ca 3: đổi bậc chất lượng ----------------
    out("\n--- Ca 3: ngân sách theo bậc (Thấp 4 emitter, Vừa 10) ---");
    await T.ev(`document.getElementById('btn-settings').click(); 1`);
    await T.waitFor(shown("set-quality"), "ô chất lượng hiện");
    await setQuality("low");
    must((await burst(30, "{}")) === 4, "Thấp: chỉ 4 emitter");
    await sleep(700);
    await setQuality("mid");
    must((await burst(30, "{}")) === 10, "Vừa: 10 emitter");
    await sleep(700);
    await setQuality("high");
    ok("Thấp 4 / Vừa 10 / Cao 24 emitter đúng ngân sách");

    // ---------------- Ca 4: giảm chuyển động ----------------
    out("\n--- Ca 4: giảm chuyển động giảm hạt 70 % ---");
    await T.waitFor("window.__fx.stats().liveEmitters === 0", "hạt ca trước tan hết");
    await setCheck("set-reduced-motion", true);
    await sleep(300);
    const before = await aliveParticles();
    must(before === 0, `trước khi phát: 0 hạt sống, thấy ${before}`);
    must((await burst(1, "{}")) === 1, "phát được một hiệu ứng khi giảm chuyển động");
    await T.waitFor(
      `window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0) === ${Math.round(8 * 0.3)}`,
      "hạt giảm chuyển động sinh đúng số lượng (8 * 0.3 = 2)",
    );
    const added = await aliveParticles();
    must(
      added === Math.round(8 * 0.3),
      `giảm chuyển động: 8 hạt -> ${Math.round(8 * 0.3)} hạt, thấy ${added}`,
    );
    ok(`giảm chuyển động: 8 hạt -> ${added} hạt`);
    await setCheck("set-reduced-motion", false);
    await T.waitFor("window.__fx.stats().liveEmitters === 0", "hạt giảm chuyển động tan hết");

    // ---------------- Ca 5: chữ bay ----------------
    out("\n--- Ca 5: chữ bay BitmapText (trần damageNumbers = 28 ở bậc Cao) ---");
    const n0 = await countOf("BitmapText");
    const spawned = await fx(
      `(() => { let ok = 0; for (let i = 0; i < 100; i++) if (fx.floatNumber(String(100 + i), window.__scene.predX + (i % 10) * 6, window.__scene.predY - 30, { color: 0xffffff, size: 15 })) ok++; return ok; })()`,
    );
    must(spawned === 28, `100 chữ cùng lúc -> chỉ 28 được nhận, nhận ${spawned}`);
    const bt = (await countOf("BitmapText")) - n0;
    must(bt <= 28, `số BitmapText tạo ra <= 28: ${bt}`);
    const st = await fx(`fx.stats()`);
    must(
      st.floatsActive === 28 && st.floatsDropped === 72,
      `đang bay 28, bỏ 72: ${JSON.stringify(st)}`,
    );
    ok(`100 chữ -> 28 bay, 72 bị bỏ, chỉ tạo ${bt} đối tượng BitmapText`);
    await T.waitFor(
      `window.__fx.stats().floatsActive === 0`,
      "hết 800 ms: không còn chữ nào bay",
      5000,
    );
    const created1 = await fx(`fx.stats().floatsCreated`);
    for (let r = 0; r < 5; r++) {
      await fx(
        `(() => { for (let i = 0; i < 28; i++) fx.floatNumber('9', window.__scene.predX, window.__scene.predY, { color: 0xffd34d, size: 20 }); return 1; })()`,
      );
      await T.waitFor(`window.__fx.stats().floatsActive === 0`, "chữ đợt trước tan hết", 5000);
    }
    must(
      (await fx(`fx.stats().floatsCreated`)) === created1,
      `5 đợt nữa: không tạo thêm đối tượng (tái dùng pool): ${created1}`,
    );
    ok(
      `5 đợt × 28 chữ: không tạo thêm đối tượng nào (tái dùng pool, ${created1} đối tượng cho cả phiên)`,
    );

    // onHitFx thật của WorldScene (đường sát thương) dùng lõi mới; chữ của mình bị đánh (ưu tiên 2) thay chữ cũ khi đầy
    await fx(
      `(() => { for (let i = 0; i < 28; i++) fx.floatNumber('1', 0, 0, { color: 0xffffff, size: 15 }); return 1; })()`,
    );
    const before2 = await fx(`fx.stats().floatsActive`);
    await T.ev(
      `(() => { const s = window.__scene; s.onHitFx({ target: s.sid, amount: 77, x: s.predX, y: s.predY - 20, crit: true, toPlayer: true }); })(); 1`,
    );
    const after2 = await fx(`fx.stats()`);
    must(
      before2 === 28 && after2.floatsActive === 28,
      `đầy: chữ của mình thay chữ cũ, vẫn 28: ${before2} -> ${after2.floatsActive}`,
    );
    ok("onHitFx thật (mình bị đánh, 'Bạo! 77') dùng lõi mới; đầy thì thay chữ cũ nhất");
    const label = await T.ev(
      `window.__scene.children.list.filter((c) => c.type === 'BitmapText' && c.visible).map((c) => c.text).filter((t) => t.includes('Bạo')).pop()`,
    );
    must(label === "Bạo! 77", `nhãn chí mạng in đủ glyph tiếng Việt: ${label}`);
    ok(`nhãn chí mạng: "${label}"`);
    await T.waitFor(`window.__fx.stats().floatsActive === 0`, "chữ chí mạng tan hết", 5000);

    // ---------------- Ca 6: giải phóng sạch ----------------
    out("\n--- Ca 6: đóng lõi hiệu ứng giải phóng sạch ---");
    await burst(5, "{}");
    must(
      (await countOf("ParticleEmitter")) >= 1 && (await countOf("BitmapText")) >= 1,
      "trước khi đóng có emitter và chữ bay",
    );
    await fx(`fx.destroy()`);
    must((await countOf("ParticleEmitter")) === 0, "sau destroy: 0 ParticleEmitter");
    must((await countOf("BitmapText")) === 0, "sau destroy: 0 BitmapText");
    must((await burst(3, "{}")) === 0, "sau destroy: play trả false, không ném lỗi");
    ok("destroy: 0 emitter, 0 chữ bay, play an toàn");

    must(T.errors.length === 0, `Không được có lỗi console / exception: ${T.errors.join(" | ")}`);
    ok("0 lỗi console / exception trong toàn bộ E2E");
    out("\n=== E2E LÕI HIỆU ỨNG ĐẠT ===");
  } catch (e) {
    failed = e instanceof Error ? e.message : String(e);
    out(`\n✗ THẤT BẠI: ${failed}`);
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
    // false: mặc định Colyseus GỌI process.exit ngay trong gracefullyShutdown nên các dòng dọn dẹp phía sau không bao giờ chạy (sót thư mục /tmp/tien-gioi-e2e-*)
    await gameServer.gracefullyShutdown(false);
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
