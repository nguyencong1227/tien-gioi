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
/**
 * Kiểm tab "Nội vụ" của bảng Tông môn (M8.6, issue #843; `sect-hall.ts` + `sect-hall-ui.ts` + `ui.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-sect-hall.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Dùng `window.__ui.onSect` + `window.__ui.onSectHall` với ảnh chụp MẪU của `shared/` (`window.__sampleSectHall`), bắt tin gửi đi bằng cách đè `window.__scene.room.send`:
 *   - vào tab xin `sectHallGet`; chưa có ảnh chụp thì ghi "Đang tải"; năm tab không tràn ngang;
 *   - cấp tông + thanh điểm (aria progressbar), cống hiến / công tích, 3 nhiệm vụ (đã xong / đang làm / chưa nhận), cửa hàng chia Bảo khố / Tàng Kinh Các;
 *   - nút Nhận / Trả / Đổi gửi ĐÚNG tin (`sectQuestAccept` / `sectQuestTurnIn` / `sectShopBuy`), khoá "Đang xử lý…" tới khi có ảnh chụp mới hoặc toast;
 *   - món khoá nêu LÝ DO bằng chữ (liên kết `aria-describedby`); mới vào tông: "sang ngày mới" + Trả mờ; đã gục: khoá tất cả bằng chuỗi `down`;
 *   - qua mốc đặt lại: xin ảnh chụp mới ĐÚNG MỘT lần; rời tông: hộp xác nhận nêu số cống hiến + công tích sẽ MẤT;
 *   - không chữ Hán, không tràn ngang, nút >= 44 px trên điện thoại. `--shots`: lưu ảnh mỗi khung nhìn.
 */
/**
 * Kiểm DỪNG NGAY + ĐỐI CHIẾU MƯỢT (QUYET_DINH_M3 mục 41: di chuyển "trôi" trên v0.3.1) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-move-stop.mjs [--vp <khung>] [--reps <số lần đo độ trễ, mặc định 12>]
 *
 *   [1] NHẢ PHÍM -> tin DỪNG {dx: 0, dy: 0} gửi NGAY (trong ~1 khung vẽ, không chờ nhịp 50 ms), đúng 3 tin, seq liên tiếp tăng dần sau input di chuyển cuối;
 *   [2] đứng yên thì KHÔNG gửi gì thêm (không spam tin dừng);
 *   [3] ĐI LẠI giữa chừng huỷ phần lặp cũ: không có tin dừng "mồ côi" sau input di chuyển mới; nhả lần hai mới có bộ tin dừng mới;
 *   [4] mở bảng (chặn phím) khi đang giữ phím: cũng gửi tin dừng (hết ý định đi);
 *   [5] ĐỐI CHIẾU MƯỢT: `pred` nhảy lùi 20 px (máy chủ bỏ / xoá input): nhân vật vẽ KHÔNG giật tức thì mà trượt về trong ~150-600 ms, không đoạn nào quá 40 % độ lệch trong một khung;
 *       lệch lớn (200 px) thì dịch chuyển TỨC THÌ (không lao ngang màn hình).
 *
 * Mock không chạy đối chiếu thật nên script ghi đè `room.send` để bắt tin, và gọi `reconcile()` của cảnh khi cần.
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
const MIN_TAP_PX = 44;

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

      // ---- bossPhase / bossEnrage ----
      await fx({ kind: "bossPhase", by: "m1", x: 0, y: 0, phase: 1 });
      await tick();
      check((await bar()).roaring, "bossPhase: thanh chớp");
      await sleep(1700);
      check(!(await bar()).roaring, "hết tiếng gầm: thanh hết chớp");
      check(!(await bar()).enrage, "chưa cuồng nộ: không có chỉ báo");
      await fx({ kind: "bossEnrage", by: "m1", x: 0, y: 0 });
      await tick();
      b = await bar();
      check(b.enrage && b.flash, "bossEnrage: chỉ báo 'Cuồng nộ' bằng chữ + chớp");
      await sleep(1700);
      b = await bar();
      check(b.enrage && !b.flash, "hết chớp mà chỉ báo cuồng nộ vẫn còn");

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
      const warnRing = (r0) =>
        fx({ kind: "warn", shape: "circle", x: 0, y: 0, r: 120, ms: 900, ...(r0 ? { r0 } : {}) });
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
