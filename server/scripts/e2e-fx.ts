// E2E THẬT lõi hiệu ứng gfx/fx (M5.2, Issue #325): server Colyseus thật + Chrome headless + client đã build, vào game thật.
// Kiểm: atlas hạt + phông chữ bay được dựng bằng mã (kích thước trong ngân sách bộ nhớ); số HẠT SỐNG THẬT của Phaser không vượt
// ngân sách theo bậc chất lượng (Thấp / Vừa / Cao); ưu tiên 2 (của mình) vượt được trần tới gấp đôi, ưu tiên 0 chỉ tới 60 %; ngân sách
// được trả lại khi hạt hết thời gian sống; chữ bay bằng BitmapText không vượt `damageNumbers` và TÁI DÙNG đối tượng; giảm chuyển động giảm
// hạt 70 %; `floatText` thật của WorldScene dùng lõi mới; đóng lõi thì không còn emitter / chữ nào; 0 lỗi console.
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
import { Tab, sleep, shown } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const PORT = 38000 + Math.floor(Math.random() * 2000);
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
        `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME)}; document.getElementById('login-form').requestSubmit(); 1`,
      );
      await T.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "vào game thành công",
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
    await T.waitFor(`!!window.__fx`, "lõi hiệu ứng (window.__fx) có mặt");
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

    // ---------------- Ca 2: ngân sách hạt theo bậc ----------------
    out("\n--- Ca 2: số hạt sống THẬT không vượt ngân sách (Cao: 520 hạt / 24 emitter) ---");
    const okN = await burst(60, "{}");
    must(
      okN === 24,
      `Cao: 60 lần phát cùng lúc ưu tiên 1 -> chỉ 24 được nhận (trần emitter), nhận ${okN}`,
    );
    const alive1 = await aliveParticles();
    must(alive1 > 0 && alive1 <= 520, `hạt sống thật > 0 và <= 520: ${alive1}`);
    ok(`24/60 hiệu ứng được nhận, hạt sống thật ${alive1} <= 520`);
    // ưu tiên 2 vượt trần tới gấp đôi
    const okMine = await burst(40, "{ priority: 2 }");
    must(okMine === 24, `ưu tiên 2: vượt trần tới 48 emitter -> nhận thêm 24, nhận ${okMine}`);
    ok("ưu tiên 2 (của mình) vượt được trần tới gấp đôi (48 emitter), phần vượt gấp đôi bị bỏ");
    const alive2 = await aliveParticles();
    must(alive2 <= 520 * 2, `hạt sống thật <= gấp đôi trần: ${alive2}`);
    // ưu tiên 0: tối đa 60 % trần
    await sleep(700); // hạt hết thời gian sống (<= 320 ms): ngân sách được trả lại
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
    await setCheck("set-reduced-motion", true);
    await sleep(300);
    const before = await aliveParticles();
    must((await burst(1, "{}")) === 1, "phát được một hiệu ứng khi giảm chuyển động");
    await sleep(60);
    const added = (await aliveParticles()) - before;
    must(
      added === Math.round(8 * 0.3),
      `giảm chuyển động: 8 hạt -> ${Math.round(8 * 0.3)} hạt, thấy ${added}`,
    );
    ok(`giảm chuyển động: 8 hạt -> ${added} hạt`);
    await setCheck("set-reduced-motion", false);
    await sleep(800);

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
    await sleep(1100);
    must((await fx(`fx.stats().floatsActive`)) === 0, "hết 800 ms: không còn chữ nào bay");
    const created1 = await fx(`fx.stats().floatsCreated`);
    for (let r = 0; r < 5; r++) {
      await fx(
        `(() => { for (let i = 0; i < 28; i++) fx.floatNumber('9', window.__scene.predX, window.__scene.predY, { color: 0xffd34d, size: 20 }); return 1; })()`,
      );
      await sleep(900);
    }
    must(
      (await fx(`fx.stats().floatsCreated`)) === created1,
      `5 đợt nữa: không tạo thêm đối tượng (tái dùng pool): ${created1}`,
    );
    ok(
      `5 đợt × 28 chữ: không tạo thêm đối tượng nào (tái dùng pool, ${created1} đối tượng cho cả phiên)`,
    );

    // floatText thật của WorldScene (đường sát thương) dùng lõi mới; chữ của mình bị đánh (ưu tiên 2) thay chữ cũ khi đầy
    await fx(
      `(() => { for (let i = 0; i < 28; i++) fx.floatNumber('1', 0, 0, { color: 0xffffff, size: 15 }); return 1; })()`,
    );
    const before2 = await fx(`fx.stats().floatsActive`);
    await T.ev(
      `(() => { const s = window.__scene; s.floatText({ target: s.sid, amount: 77, x: s.predX, y: s.predY - 20, crit: true, toPlayer: true }); })(); 1`,
    );
    const after2 = await fx(`fx.stats()`);
    must(
      before2 === 28 && after2.floatsActive === 28,
      `đầy: chữ của mình thay chữ cũ, vẫn 28: ${before2} -> ${after2.floatsActive}`,
    );
    ok("floatText thật (mình bị đánh, 'Bạo! 77') dùng lõi mới; đầy thì thay chữ cũ nhất");
    const label = await T.ev(
      `window.__scene.children.list.filter((c) => c.type === 'BitmapText' && c.visible).map((c) => c.text).filter((t) => t.includes('Bạo')).pop()`,
    );
    must(label === "Bạo! 77", `nhãn chí mạng in đủ glyph tiếng Việt: ${label}`);
    ok(`nhãn chí mạng: "${label}"`);
    await sleep(1000);

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
