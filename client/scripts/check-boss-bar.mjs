import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm THANH MÁU TRÙM + VÙNG CẢNH BÁO VÀNH KHUYÊN (QUYET_DINH_M3 mục 42, issue T4 #873) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-boss-bar.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Nhét trùm vào `state.monsters` rồi phát `fx` (`bossCast` / `bossPhase` / `bossEnrage` / `warn`) qua bộ xử lý thật của cảnh:
 *   - không trùm / trùm ngoài tầm: không có thanh; 8 Hắc Giao rải bản đồ: CHỈ MỘT thanh (con gần nhất); trùm bí cảnh (always) luôn hiện;
 *   - mốc giai đoạn đúng chỗ (vạch + "Giai đoạn 2 / 2" khi khí huyết dưới mốc), `aria` progressbar; khí huyết cập nhật;
 *   - `bossCast`: "Đang vận: <tên chiêu>" bằng CHỮ + thanh tiến độ, giữ thêm một chút rồi tắt; `bossPhase` chớp rồi hết; `bossEnrage` hiện chỉ báo "Cuồng nộ" bằng chữ;
 *   - vùng cảnh báo VÀNH KHUYÊN (`warn` có `r0`): đứng ở TÂM (chỗ an toàn) KHÔNG báo nguy hiểm, bước lên DẢI thì báo, vòng tròn đặc thì báo cả ở tâm;
 *   - thanh nằm gọn trong khung nhìn, không chặn chạm (`pointer-events: none`), không chữ Hán. `--shots`: lưu ảnh mỗi khung nhìn.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");

export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
];

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
  const onlyVp = process.argv.includes("--vp")
    ? process.argv[process.argv.indexOf("--vp") + 1]
    : null;
  if (!fs.existsSync(path.join(DIST, "index.html")))
    throw new Error("Chưa có client/dist: chạy `npm run build -w client` trước.");

  const MIMES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath)) filePath = path.join(DIST, "index.html");
    try {
      res.writeHead(200, {
        "Content-Type": MIMES[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(fs.readFileSync(filePath));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const HTTP_PORT = await freePort();
  await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));
  const CDP_PORT = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-boss-bar-"));
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      ...getChromeGpuFlags(),
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmp}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: true }, // nhóm tiến trình riêng: dọn được cả tiến trình con của Chrome một lần
  );
  let failures = 0;
  const check = (ok, msg) => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
    if (!ok) failures++;
  };
  try {
    let page = null;
    for (let i = 0; i < 100 && !page; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        page = (await res.json()).find((t) => t.type === "page") ?? null;
      } catch {
        // Chrome chưa mở cổng
      }
      if (!page) await sleep(150);
    }
    if (!page) throw new Error("Không tìm thấy Chrome page target.");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    let nextId = 1;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result?.result?.value;
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem('tg_newbie_guide_dismissed','1'); localStorage.setItem('tg_quality','low'); } catch (e) {}`,
    });

    for (const vp of VIEWPORTS) {
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} ===`);
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      if (vp.mobile)
        await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&map=am_suong`,
      });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__getMap && window.__scene && window.__ui && window.__craftData && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      if (!ready) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      await sleep(600);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      await evalJs(`(() => {
        const sc = window.__scene;
        sc.room.send = () => {};
        const n = window.__craftData.NPC_BY_ID.tho_ren_suong;
        sc.predX = n.x; sc.predY = n.y + 90; sc.cameras.main.centerOn(sc.predX, sc.predY);
        window.__start = { x: sc.predX, y: sc.predY };
        return 1;
      })()`);
      const setBoss = (id, o) =>
        evalJs(
          `(() => { const sc = window.__scene; sc.state.monsters.set(${JSON.stringify(id)}, Object.assign({ kind: "mang", x: window.__start.x + 80, y: window.__start.y, hp: 4000, maxHp: 4000, angle: 0, fx: 0, elite: 0 }, ${JSON.stringify(o)})); return 1; })()`,
        );
      const clearBosses = () =>
        evalJs(
          `(() => { const m = window.__scene.state.monsters; for (const k of [...m.keys()]) m.delete(k); return 1; })()`,
        );
      const fx = (m) =>
        evalJs(`(() => { window.__scene.onFx(${JSON.stringify(m)}); return 1; })()`);
      const bar = () =>
        evalJs(`(() => {
          const r = document.getElementById("boss-bar");
          const rect = r.getBoundingClientRect();
          const cs = getComputedStyle(r);
          return {
            hidden: r.hidden || cs.display === "none",
            name: document.getElementById("boss-bar-name").textContent,
            phase: document.getElementById("boss-bar-phase").hidden ? "" : document.getElementById("boss-bar-phase").textContent,
            hp: document.getElementById("boss-bar-hp").textContent,
            fill: document.getElementById("boss-bar-fill").style.width,
            marks: [...document.querySelectorAll("#boss-bar-track .boss-bar-mark")].map((e) => e.style.left),
            cast: document.getElementById("boss-bar-cast").textContent,
            castBar: !document.querySelector(".boss-bar-castbar").hidden,
            enrage: !document.getElementById("boss-bar-enrage").hidden,
            roaring: r.classList.contains("roaring"),
            flash: r.classList.contains("enrage-flash"),
            vt: document.getElementById("boss-bar-track").getAttribute("aria-valuetext"),
            vn: document.getElementById("boss-bar-track").getAttribute("aria-valuenow"),
            pe: cs.pointerEvents,
            rect: { l: rect.left, r: rect.right, t: rect.top, b: rect.bottom },
            count: document.querySelectorAll("#boss-bar").length,
          };
        })()`);
      const tick = () => sleep(260); // thanh cập nhật ~10 lần / giây

      // ---- không trùm / trùm ngoài tầm: không có thanh ----
      await clearBosses();
      await tick();
      check((await bar()).hidden, "không có trùm: thanh ẩn");
      await setBoss("xa", {});
      await evalJs(`window.__scene.state.monsters.get("xa").x = window.__start.x + 5000; 1`);
      await tick();
      check((await bar()).hidden, "trùm ngoài tầm 600 px: thanh ẩn (ngoài hoang)");
      await clearBosses();

      // ---- 8 Hắc Giao rải bản đồ: CHỈ MỘT thanh (con gần nhất) ----
      for (let i = 0; i < 8; i++)
        await setBoss(`hg${i}`, {
          kind: "hac_giao",
          hp: 50000,
          maxHp: 50000,
        });
      await evalJs(
        `(() => { const m = window.__scene.state.monsters; const s = window.__start; for (let i = 0; i < 8; i++) { const e = m.get("hg" + i); e.x = s.x + 150 + i * 60; e.y = s.y; } return 1; })()`,
      );
      await tick();
      const b8 = await bar();
      check(!b8.hidden && b8.count === 1, `8 Hắc Giao: đúng MỘT thanh (${b8.count})`);
      check(b8.name === "Hắc Giao", `thanh là của con gần nhất: "${b8.name}"`);
      check(b8.hp === "50.000 / 50.000", `khí huyết: "${b8.hp}"`);
      await clearBosses();

      // ---- Xích Mãng: mốc giai đoạn, giai đoạn, aria, khí huyết cập nhật ----
      await setBoss("m1", {});
      await tick();
      let b = await bar();
      check(!b.hidden && b.name === "Xích Mãng", `trùm trong tầm: thanh hiện "${b.name}"`);
      check(
        b.marks.length === 1 && b.marks[0] === "50%",
        `vạch mốc giai đoạn ở 50%: ${JSON.stringify(b.marks)}`,
      );
      check(b.phase === "Giai đoạn 1 / 2", `giai đoạn đầy máu: "${b.phase}"`);
      check(b.fill === "100%" && b.vn === "100", `thanh đầy: fill ${b.fill}, aria ${b.vn}`);
      await evalJs(`window.__scene.state.monsters.get("m1").hp = 1500; 1`);
      await tick();
      b = await bar();
      check(
        b.phase === "Giai đoạn 2 / 2" && b.fill === "37.5%",
        `dưới mốc 50%: "${b.phase}", fill ${b.fill}`,
      );
      check(
        /giai đoạn 2 \/ 2/.test(b.vt) && /38 % khí huyết/.test(b.vt),
        `aria-valuetext: "${b.vt}"`,
      );
      check(b.hp === "1.500 / 4.000", `khí huyết chữ: "${b.hp}"`);

      // ---- bossCast: tên chiêu bằng chữ ----
      await fx({
        kind: "bossCast",
        by: "m1",
        y: 0,
        ability: "quat_duoi",
        ms: 900,
      });
      await tick();
      b = await bar();
      check(b.cast === "Đang vận: Quất đuôi" && b.castBar, `bossCast: "${b.cast}" + thanh tiến độ`);
      await sleep(1500);
      b = await bar();
      check(
        b.cast === "" && !b.castBar,
        `hết chiêu (+ thời gian giữ): tên chiêu tắt ("${b.cast}")`,
      );
      await fx({ kind: "bossCast", by: "m1", x: 0, y: 0, ability: "chieu_la", ms: 800 });
      await tick();
      check(
        (await bar()).cast === "Đang vận: Đang vận chiêu",
        "chiêu lạ vẫn báo 'Đang vận chiêu' (không im lặng)",
      );

      // ---- hoạt ảnh gồng / đáp trên THÂN trùm (boss-cast-anim.ts): co thấp + nở ngang + ánh đỏ cam, đáp bật vươn rồi trả về ----
      // (mock chạy ở bậc đồ hoạ Thấp: tín hiệu chiến đấu vẫn phải chạy)
      const samplePose = (ms) =>
        evalJs(`(async () => {
          const e = window.__scene.monsters.get("m1");
          const out = [];
          const t0 = performance.now();
          while (performance.now() - t0 < ${ms}) {
            out.push({ t: performance.now() - t0, sx: e.sprite.scaleX, sy: e.sprite.scaleY, glow: e.bossGlow || 0, tinted: !!e.sprite.isTinted });
            await new Promise((r) => setTimeout(r, 16));
          }
          return out;
        })()`);
      const near1 = (v) => Math.abs(v - 1) < 1e-6;
      await sleep(1100); // chiêu lạ ở trên (800 ms + thời gian đáp) đã xong
      let ser = await samplePose(120);
      let last = ser[ser.length - 1];
      check(
        near1(last.sx) && near1(last.sy) && last.glow === 0 && !last.tinted,
        `không vận chiêu: thân trùm đứng yên (tỉ lệ ${last.sx.toFixed(3)} x ${last.sy.toFixed(3)}, không ánh)`,
      );
      await fx({ kind: "bossCast", by: "m1", x: 0, y: 0, ability: "quat_duoi", ms: 1200 });
      ser = await samplePose(1200 + 160 + 400);
      const wind = ser.filter((p) => p.t < 1100);
      check(
        wind.some((p) => p.sx > 1.01 && p.sy < 0.99 && p.tinted && p.glow >= 3),
        "gồng: thân co thấp + nở ngang + ánh đỏ cam (cuối chiêu: " +
          `${wind.at(-1).sx.toFixed(3)} x ${wind.at(-1).sy.toFixed(3)}, ánh ${wind.at(-1).glow}/8)`,
      );
      check(
        wind.every((p, i) => i === 0 || p.glow >= wind[i - 1].glow),
        "gồng: ánh chỉ tăng, không giật lùi",
      );
      check(
        ser.some((p) => p.sy > 1.02 && p.sx < 0.99),
        `đáp: thân bật vươn cao + hẹp ngang (đỉnh ${Math.max(...ser.map((p) => p.sy)).toFixed(3)} dọc)`,
      );
      last = ser[ser.length - 1];
      check(
        near1(last.sx) && near1(last.sy) && last.glow === 0 && !last.tinted,
        "hết đáp: tỉ lệ về đúng 1 x 1 và hết ánh (không kẹt tỉ lệ / màu lệch)",
      );
      // giảm chuyển động: KHÔNG co giãn, chỉ còn ánh màu
      await evalJs(
        `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = true; c.dispatchEvent(new Event("change")); return 1; })()`,
      );
      await fx({ kind: "bossCast", by: "m1", x: 0, y: 0, ability: "quat_duoi", ms: 1000 });
      ser = await samplePose(1000 + 160 + 300);
      check(
        ser.every((p) => near1(p.sx) && near1(p.sy)),
        "giảm chuyển động: thân trùm KHÔNG co giãn lúc nào",
      );
      check(
        ser.some((p) => p.tinted && p.glow >= 4),
        "giảm chuyển động: vẫn có ánh màu báo gồng (tên chiêu bằng chữ trên thanh là dấu hiệu thứ hai)",
      );
      last = ser[ser.length - 1];
      check(last.glow === 0 && !last.tinted, "giảm chuyển động: hết đáp thì hết ánh");
      await evalJs(
        `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = false; c.dispatchEvent(new Event("change")); return 1; })()`,
      );

      // ---- tiếng riêng của trùm (sound.boss): gồng ngay lúc báo, đòn rơi đúng lúc đáp, sắc theo hệ của chiêu ----
      await evalJs(`(() => {
        const sd = window.__sound;
        window.__bossSfx = [];
        if (!sd.__origBoss) sd.__origBoss = sd.boss.bind(sd);
        sd.boss = (kind, element) => { window.__bossSfx.push({ kind, element, t: performance.now() }); };
        return 1;
      })()`);
      const sfxLog = () => evalJs(`window.__bossSfx.splice(0)`);
      await sleep(300);
      await sfxLog();
      const bx = await evalJs(`window.__start.x + 80`); // máy chủ gửi x, y CỦA TRÙM trong fx (mock: trùm đặt ở start + 80)
      const by = await evalJs(`window.__start.y`);
      await fx({ kind: "bossCast", by: "m1", x: bx, y: by, ability: "quat_duoi", ms: 700 });
      await sleep(250);
      let snd = await sfxLog();
      check(
        snd.length === 1 && snd[0].kind === "cast",
        `bossCast: tiếng gồng phát NGAY (${JSON.stringify(snd.map((x) => x.kind))}), chưa có tiếng đòn rơi`,
      );
      await sleep(700);
      snd = await sfxLog();
      check(
        snd.length === 1 && snd[0].kind === "strike",
        `đúng lúc đáp (ms sau): tiếng đòn rơi (${JSON.stringify(snd.map((x) => x.kind))})`,
      );
      await fx({ kind: "bossCast", by: "m1", x: 5000, y: 5000, ability: "quat_duoi", ms: 300 });
      await sleep(650);
      snd = await sfxLog();
      check(snd.length === 0, "trùm vận chiêu ở NGOÀI tầm nhìn: không có tiếng");
      // ---- bossPhase / bossEnrage ----
      await sfxLog();
      await fx({ kind: "bossPhase", by: "m1", x: bx, y: by, phase: 1 });
      await tick();
      check((await bar()).roaring, "bossPhase: thanh chớp");
      snd = await sfxLog();
      check(
        snd.length === 1 && snd[0].kind === "phase",
        `bossPhase: tiếng gầm đổi giai đoạn (${JSON.stringify(snd.map((x) => x.kind))})`,
      );
      await sleep(1700);
      check(!(await bar()).roaring, "hết tiếng gầm: thanh hết chớp");
      check(!(await bar()).enrage, "chưa cuồng nộ: không có chỉ báo");
      await fx({ kind: "bossEnrage", by: "m1", x: bx, y: by });
      await tick();
      b = await bar();
      check(b.enrage && b.flash, "bossEnrage: chỉ báo 'Cuồng nộ' bằng chữ + chớp");
      snd = await sfxLog();
      check(
        snd.length === 1 && snd[0].kind === "enrage",
        `bossEnrage: còi cuồng nộ (${JSON.stringify(snd.map((x) => x.kind))})`,
      );
      await evalJs(`(() => { const sd = window.__sound; sd.boss = sd.__origBoss; return 1; })()`);
      await sleep(1700);
      b = await bar();
      check(b.enrage && !b.flash, "hết chớp mà chỉ báo cuồng nộ vẫn còn");

      // ---- GIÁP (bossArmor) + GỌI QUÁI CON (bossSummon) của trùm: chữ trên thanh, vầng giáp quanh thân, số bay xanh, tiếng, tự hết ----
      await evalJs(`(() => {
        const sd = window.__sound;
        window.__bossSfx = [];
        if (!sd.__origBoss) sd.__origBoss = sd.boss.bind(sd);
        sd.boss = (kind, element) => { window.__bossSfx.push({ kind, element }); };
        return 1;
      })()`);
      await sfxLog();
      const armorUi = () =>
        evalJs(`(() => {
          const a = document.getElementById("boss-bar-armor");
          const e = window.__scene.monsters.get("m1");
          return {
            text: a.hidden ? "" : a.textContent,
            cls: document.getElementById("boss-bar").classList.contains("armored"),
            aura: Boolean(e?.armorAura?.visible),
            auraStroke: e?.armorAura ? e.armorAura.isStroked : false,
            armoredHit: window.__scene.hitInput({ target: "m1", amount: 5, x: 0, y: 0, toPlayer: false }).armored === true,
            vt: document.getElementById("boss-bar-track").getAttribute("aria-valuetext"),
          };
        })()`);
      await fx({ kind: "bossArmor", by: "m1", x: bx, y: by, ms: 2500, mult: 0.5 });
      await tick();
      let au = await armorUi();
      check(
        /Giáp: nhận 50% sát thương \([1-3] s\)/.test(au.text) && au.cls,
        `bossArmor: thanh trùm ghi bằng CHỮ "${au.text}"`,
      );
      check(
        au.aura && au.auraStroke,
        "bossArmor: vầng giáp (vòng tròn CÓ VIỀN) bao quanh thân trùm",
      );
      await fx({ kind: "bossSummon", by: "m1", x: bx, y: by, n: 1 }); // cả hai dòng ghi chú cùng hiện: thanh vẫn nằm gọn nửa trên khung nhìn
      await tick();
      const bb = await bar();
      check(
        bb.rect.l >= 0 && bb.rect.r <= vp.w && bb.rect.t >= 0 && bb.rect.b <= vp.h * 0.5,
        `giáp + gọi quái con cùng hiện: thanh vẫn gọn trong nửa trên khung nhìn (${Math.round(bb.rect.t)}-${Math.round(bb.rect.b)} / ${vp.h * 0.5})`,
      );
      check(
        au.armoredHit,
        "bossArmor: số sát thương bay lên trùm đang có giáp mang cờ 'armored' (xanh nhạt)",
      );
      check(
        /có giáp \(nhận 50 % sát thương\)/.test(au.vt),
        `bossArmor: aria-valuetext có giáp: "${au.vt}"`,
      );
      snd = await sfxLog();
      check(
        snd.length >= 1 && snd[0].kind === "armor",
        `bossArmor: tiếng giáp (${JSON.stringify(snd.map((x) => x.kind))})`,
      );
      await sleep(2500 - 260 + 500); // quá hạn giáp
      au = await armorUi();
      check(
        au.text === "" && !au.cls && !au.aura && !au.armoredHit,
        `hết giáp: chữ, vầng và cờ số bay đều tắt (${JSON.stringify({ t: au.text, c: au.cls, a: au.aura, h: au.armoredHit })})`,
      );
      await fx({ kind: "bossArmor", by: "m1", x: bx, y: by, ms: 2500, mult: 3 }); // fx hỏng (mult ngoài (0, 1])
      await fx({ kind: "bossArmor", by: "m1", x: bx, y: by, ms: -5, mult: 0.5 });
      await tick();
      au = await armorUi();
      check(au.text === "" && !au.aura, "bossArmor hỏng (mult 3 / ms âm): bỏ qua, không dựng giáp");
      await sfxLog();
      await fx({ kind: "bossSummon", by: "m1", x: bx, y: by, n: 2 });
      await tick();
      const sm = await evalJs(
        `(() => { const e = document.getElementById("boss-bar-summon"); return e.hidden ? "" : e.textContent; })()`,
      );
      check(sm === "Gọi 2 quái con", `bossSummon: thanh trùm ghi "${sm}"`);
      snd = await sfxLog();
      check(
        snd.length === 1 && snd[0].kind === "summon",
        `bossSummon: tiếng gọi quái con (${JSON.stringify(snd.map((x) => x.kind))})`,
      );
      await sleep(3200);
      const sm2 = await evalJs(
        `(() => { const e = document.getElementById("boss-bar-summon"); return e.hidden ? "" : e.textContent; })()`,
      );
      check(sm2 === "", "bossSummon: dòng 'Gọi quái con' tự tắt sau vài giây");
      await evalJs(`(() => { const sd = window.__sound; sd.boss = sd.__origBoss; return 1; })()`);

      // ---- bố cục ----
      check(b.pe === "none", "thanh không chặn chạm / nhấp (pointer-events: none)");
      check(
        b.rect.l >= 0 && b.rect.r <= vp.w && b.rect.t >= 0 && b.rect.b <= vp.h * 0.5,
        `thanh nằm gọn trong nửa trên khung nhìn (${Math.round(b.rect.l)}-${Math.round(b.rect.r)} / ${Math.round(b.rect.t)}-${Math.round(b.rect.b)})`,
      );
      const txt = await evalJs(`document.getElementById("boss-bar").innerText`);
      check(
        !new RegExp(
          "[" + String.fromCharCode(0x4e00) + "-" + String.fromCharCode(0x9fff) + "]",
        ).test(txt),
        "không chữ Hán",
      );
      if (shotsDir) {
        await fx({ kind: "bossCast", by: "m1", x: 0, y: 0, ability: "cuon_minh", ms: 5000 });
        await sleep(400);
        const shot = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(shotsDir, `boss-bar-${vp.name}.png`),
          Buffer.from(shot.result.data, "base64"),
        );
      }
      await clearBosses();
      await tick();
      check((await bar()).hidden, "trùm biến mất: thanh ẩn");

      // ---- vùng cảnh báo VÀNH KHUYÊN ----
      const alerts = () => evalJs(`window.__scene.telegraphs.dangerAlerts`);
      const standAt = (dx) =>
        evalJs(
          `(() => { const sc = window.__scene; sc.predX = window.__start.x + ${dx}; sc.predY = window.__start.y; return 1; })()`,
        );
      // tâm vùng = chỗ đứng gốc
      const place = (extra) =>
        evalJs(
          `(() => { const s = window.__start; window.__scene.onFx(Object.assign({ kind: "warn", shape: "circle", x: s.x, y: s.y, r: 120, ms: 900 }, ${JSON.stringify(extra)})); return 1; })()`,
        );
      await standAt(0);
      const a0 = await alerts();
      await place({ r0: 60 });
      await sleep(350);
      check((await alerts()) === a0, "vành khuyên: đứng ở TÂM (chỗ an toàn) KHÔNG báo nguy hiểm");
      await sleep(900);
      await standAt(90);
      const a1 = await alerts();
      await place({ r0: 60 });
      await sleep(350);
      check(
        (await alerts()) === a1 + 1,
        "vành khuyên: đứng trên DẢI thì báo nguy hiểm đúng một lần",
      );
      await sleep(900);
      await standAt(0);
      const a2 = await alerts();
      await place({});
      await sleep(350);
      check((await alerts()) === a2 + 1, "hình tròn ĐẶC (không r0): đứng ở tâm vẫn báo nguy hiểm");
      await sleep(900);

      // ---- bù độ trễ mạng (#873, hướng 2): `rttSource` rút ngắn vùng báo VÀ thanh gồng CÙNG MỘT mức ----
      // độ bù = clamp(RTT + 10, 0, min(250, 0,3 x ms)); RTT chưa biết (null) thì không bù (mock không có nhịp tim nên mặc định là null)
      const setRtt = (v) =>
        evalJs(`(() => { window.__scene.rttSource = () => ${JSON.stringify(v)}; return 1; })()`);
      const lat = async (rtt, ms) => {
        await setRtt(rtt);
        await evalJs(
          `(() => { const sc = window.__scene; sc.telegraphs.clear(); sc.bossFx.clear(); return 1; })()`,
        );
        await clearBosses();
        await setBoss("m1", {});
        await fx({ kind: "bossCast", by: "m1", x: 0, y: 0, ability: "quat_duoi", ms });
        await place({ ms });
        return evalJs(`(() => {
          const sc = window.__scene;
          const w = sc.telegraphs.snapshot(sc.time.now).warns;
          const c = sc.bossFx.castTiming("m1", sc.time.now);
          return { rings: w.length, ringMs: w[0] && w[0].ms, castMs: c && c.castMs };
        })()`);
      };
      check(
        (await evalJs(`window.__scene.rttSource()`)) === null,
        "mock: rttSource mặc định là null (không bù khi chưa có nhịp tim)",
      );
      for (const [rtt, ms, want] of [
        [null, 1000, 1000], // chưa đủ mẫu: không bù
        [0, 1000, 990],
        [60, 1000, 930],
        [160, 1000, 830],
        [1000, 1000, 750], // RTT hỏng: kẹp 250 ms
        [1000, 800, 560], // báo trước ngắn: không co quá 30 %
        [-50, 1000, 1000], // RTT âm không làm vùng báo dài ra
      ]) {
        const r = await lat(rtt, ms);
        check(
          r.rings === 1 &&
            Math.abs(r.ringMs - want) < 1e-6 &&
            r.castMs !== null &&
            Math.abs(r.castMs - want) < 1e-6,
          `bù độ trễ RTT ${rtt}, báo trước ${ms} ms: vùng báo ${r.ringMs} = thanh gồng ${r.castMs} = ${want}`,
        );
      }
      // đầy SỚM đúng mức: RTT 160 thì sau ~870 ms vùng báo đã đầy và thanh gồng đã chạm 100 % (không bù thì mới ~87 %)
      const fullAfter = async (rtt, waitMs) => {
        await lat(rtt, 1000);
        await sleep(waitMs);
        return evalJs(`(() => {
          const sc = window.__scene;
          const w = sc.telegraphs.snapshot(sc.time.now).warns[0];
          const fill = document.getElementById("boss-bar-castfill").style.width;
          return { progress: w.progress, elapsed: w.elapsed, fill };
        })()`);
      };
      const withComp = await fullAfter(160, 880);
      check(
        withComp.progress === 1 && withComp.elapsed >= 830 && withComp.elapsed < 1000,
        `RTT 160: sau ${Math.round(withComp.elapsed)} ms vùng báo đã ĐẦY (tiến độ ${withComp.progress})`,
      );
      check(
        withComp.fill === "100%",
        `RTT 160: thanh gồng cũng đã đầy cùng lúc ("${withComp.fill}")`,
      );
      const noComp = await fullAfter(null, 880);
      check(
        noComp.progress < 1 && noComp.elapsed >= 830,
        `không bù (RTT chưa biết): cùng thời điểm vùng báo CHƯA đầy (tiến độ ${noComp.progress.toFixed(2)})`,
      );
      await evalJs(
        `(() => { const sc = window.__scene; sc.rttSource = () => null; sc.telegraphs.clear(); return 1; })()`,
      );
      await clearBosses();
      await sleep(900);
    }
  } finally {
    try {
      process.kill(-chrome.pid, "SIGKILL"); // cả nhóm
    } catch {
      chrome.kill("SIGKILL");
    }
    server.close();
    await new Promise((r) => {
      chrome.once("exit", r);
      setTimeout(r, 1500);
    });
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // bỏ qua
    }
  }
  console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1] === __filename) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
