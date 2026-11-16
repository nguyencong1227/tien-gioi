import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch */
/**
 * Kiểm CHẾ ĐỘ NHẮM (QUYET_DINH_M3 mục 26, `client/src/auto-target.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-aim-mode.mjs [--vp <khung>]
 *
 * Máy tính (phím thật `Input.dispatchKeyEvent`, chọn chế độ qua Cài đặt thật): mặc định Tự động, tự nhắm quái gần nhất (vòng + tên / khí huyết nhỏ); chống nhảy (hơn 10 px thì giữ,
 * hơn 90 px thì đổi; hai quái dao động ±10 px trong 3 giây không đổi lần nào); mục tiêu chết thì chọn lại ngay; Tab chọn tay TẠM THỜI (ghim) và Esc quay lại tự động; J không chuột
 * đánh theo mục tiêu tự động; Thủ công (không tự chọn, Tab / Esc như cũ, J tự khoá); phím tắt ` đổi chế độ + thông báo + lưu theo thiết bị; đổi chế độ giữa chừng; PK thách đấu chỉ nhắm
 * đối thủ. Cảm ứng (4 khung): nút Mục tiêu chọn tay tạm thời.
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

/** Năm khung nhìn như `check-forge-shop.mjs`; máy tính đứng đầu (Chrome headless không tắt được giả lập cảm ứng trong cùng phiên). */
export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
];

async function main() {
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-aim-mode-"));
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
      console.log(`\n=== ${vp.name} (${vp.mobile ? "cảm ứng" : "chuột"}) ===`);
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
            `Boolean(!window.__isOldPage && window.__getMap && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
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

      // ---- dữ liệu: người chơi ở trấn, camera canh giữa, tin gửi đi bị chặn lại để đọc ----
      await evalJs(`(() => {
        const sc = window.__scene;
        window.__sent = [];
        sc.room.send = (t, m) => { window.__sent.push([t, m]); };
        const me = sc.me(), t = sc.map.townPx;
        me.x = t.x; me.y = t.y; sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0; sc.hasMe = true;
        me.realm = 6; me.tier = 0; me.mp = 99999; me.maxMp = 99999; me.dead = false;
        sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(me.x, me.y);
        return 1;
      })()`);
      const BOOK = `{ learned: { hoa_van_kiem: 1 }, slots: ["hoa_van_kiem", "", "", ""], cd: [0, 0, 0, 0], cdMax: [0, 0, 0, 0] }`;
      /** Dựng quái `id` cách nhân vật (dx, dy); đã có thì dời */
      const put = (id, dx, dy) =>
        evalJs(`(() => {
          const sc = window.__scene, t = sc.map.townPx;
          const cur = sc.state.monsters.get(${JSON.stringify(id)});
          if (cur) { cur.x = t.x + ${dx}; cur.y = t.y + ${dy}; }
          else sc.state.monsters.set(${JSON.stringify(id)}, { kind: "lang", x: t.x + ${dx}, y: t.y + ${dy}, angle: 0, hp: 100, maxHp: 100, fx: 0, elite: 0 });
          return 1;
        })()`);
      const drop = (id) => evalJs(`window.__scene.state.monsters.delete(${JSON.stringify(id)})`);
      const dropAll = () =>
        evalJs(
          `(() => { const sc = window.__scene; for (const id of [...sc.state.monsters.keys()]) sc.state.monsters.delete(id); sc.setLockedTarget(null); return 1; })()`,
        );
      const tgt = () => evalJs(`window.__scene.lockedTargetId`);
      const pinned = () => evalJs(`window.__scene.targetPinned`);
      const mode = () => evalJs(`window.__ui.getAimMode()`);
      const setMode = (m) =>
        evalJs(
          `(() => { const s = document.getElementById("set-aim-mode"); s.value = ${JSON.stringify(m)}; s.dispatchEvent(new Event("change")); return window.__ui.getAimMode(); })()`,
        );
      const VK = { Tab: 9, Escape: 27, Backquote: 192, KeyJ: 74 };
      const KEY = { Tab: "Tab", Escape: "Escape", Backquote: "`", KeyJ: "j" };
      const press = async (code, extra = {}) => {
        await send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: KEY[code],
          code,
          windowsVirtualKeyCode: VK[code],
          ...extra,
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: KEY[code],
          code,
          windowsVirtualKeyCode: VK[code],
        });
        await sleep(200);
      };
      /** Theo dõi mọi lần `lockedTargetId` đổi giá trị trong `ms` ms (lấy mẫu mỗi 25 ms), trả danh sách giá trị liên tiếp khác nhau */
      const watch = async (ms) => {
        const seen = [];
        for (let t = 0; t < ms; t += 25) {
          const v = await tgt();
          if (seen.length === 0 || seen[seen.length - 1] !== v) seen.push(v);
          await sleep(25);
        }
        return seen;
      };
      const resetAll = async () => {
        await setMode("auto");
        await dropAll();
        await evalJs(
          `(() => { const sc = window.__scene; sc.targetPinned = false; sc.nextSlash = 0; sc.onSkills(${BOOK}); window.__sent.length = 0; return 1; })()`,
        );
        await sleep(400);
      };

      if (!vp.mobile) {
        console.log("  [1] mặc định là Tự động: tự nhắm quái gần nhất, không cần bấm gì");
        check((await mode()) === "auto", "chế độ nhắm mặc định = auto (chưa lưu gì)");
        await put("a", 150, 0);
        await put("b", 300, 0);
        await sleep(700);
        check((await tgt()) === "a", `mục tiêu tự động = quái gần nhất a (${await tgt()})`);
        check(await evalJs(`window.__scene.targetRing?.visible === true`), "vòng dưới chân hiện");
        const info = await evalJs(`window.__scene.targetInfo?.text ?? ""`);
        check(/\d+%/.test(info), `tên + khí huyết nhỏ trên vòng: "${info}"`);

        console.log(
          "  [2] chống nhảy: con kia chỉ nhỉnh hơn chút thì KHÔNG đổi, hơn rõ rệt thì đổi",
        );
        await put("b", 140, 0); // a = 150, b = 140: hơn 10 px < 24
        let seen = await watch(600);
        check(seen.length === 1 && seen[0] === "a", `b hơn 10 px: giữ a (${JSON.stringify(seen)})`);
        await put("b", 60, 0); // hơn 90 px
        seen = await watch(500);
        check(seen[seen.length - 1] === "b", `b hơn 90 px: đổi sang b (${JSON.stringify(seen)})`);

        console.log("  [3] hai quái đi qua lại sát nhau (±10 px): vòng KHÔNG nhấp nháy");
        await dropAll();
        await put("a", 200, 0);
        await put("b", 200, 20);
        await sleep(600);
        const first = await tgt();
        const changes = [];
        let last = first;
        for (let i = 0; i < 80; i++) {
          const w = 10 * Math.sin(i / 4);
          await put("a", 200 + w, 0);
          await put("b", 200 - w, 20);
          await sleep(40);
          const v = await tgt();
          if (v !== last) {
            changes.push(v);
            last = v;
          }
        }
        check(
          first !== null && changes.length === 0,
          `3 giây dao động: ${changes.length} lần đổi mục tiêu (cần 0)`,
        );

        console.log("  [4] mục tiêu chết / mất: chọn lại NGAY con còn lại");
        await dropAll();
        await put("a", 100, 0);
        await put("b", 250, 0);
        await sleep(500);
        check((await tgt()) === "a", "đang nhắm a");
        await drop("a");
        seen = await watch(400);
        check(
          seen[seen.length - 1] === "b",
          `a chết: sang b trong 400 ms (${JSON.stringify(seen)})`,
        );
        await drop("b");
        await sleep(400);
        check((await tgt()) === null, "hết quái: không còn mục tiêu, vòng ẩn");
        check(await evalJs(`window.__scene.targetRing?.visible !== true`), "vòng đã ẩn");

        console.log("  [5] Tab chọn tay TẠM THỜI trong chế độ Tự động; Esc quay lại tự động");
        await dropAll();
        await put("a", 100, 0);
        await put("b", 200, 0);
        await sleep(500);
        check((await tgt()) === "a", "tự động: a");
        await press("Tab");
        check(
          (await tgt()) === "b" && (await pinned()) === true,
          `Tab: chọn tay b, đang ghim (${await tgt()}, ghim=${await pinned()})`,
        );
        await put("a", 30, 0); // a sát người nhưng b đã được chọn tay
        seen = await watch(700);
        check(
          seen.length === 1 && seen[0] === "b",
          `đã ghim b: a lại gần cũng không giành (${JSON.stringify(seen)})`,
        );
        await press("Escape");
        await sleep(300);
        check(
          (await pinned()) === false && (await tgt()) === "a",
          `Esc: bỏ ghim, quay lại tự động -> a (${await tgt()}, ghim=${await pinned()})`,
        );
        await press("Escape");
        await sleep(300);
        check((await tgt()) === "a", "Esc lần nữa (không ghim): giữ mục tiêu tự động");
        await press("Tab");
        check((await pinned()) === true, "Tab lại: ghim");
        await drop("b");
        await sleep(400);
        check(
          (await pinned()) === false && (await tgt()) === "a",
          "mục tiêu ghim chết: quay lại tự động",
        );

        console.log("  [6] J không chuột: đánh theo mục tiêu tự động ngay cả khi chưa bấm Tab");
        await dropAll();
        await put("a", 0, 150); // phía NAM (góc ~ +pi/2)
        await sleep(700);
        await evalJs(`window.__sent.length = 0; window.__scene.nextSlash = 0; 1`);
        await press("KeyJ");
        const aJ = await evalJs(
          `(() => { const m = window.__sent.filter((s) => s[0] === "attack").pop(); return m ? m[1].angle : null; })()`,
        );
        check(
          aJ !== null && Math.abs(aJ - Math.PI / 2) < 0.3,
          `J -> ${aJ === null ? "không gửi" : aJ.toFixed(2)} rad (về quái phía nam, cần ${(Math.PI / 2).toFixed(2)})`,
        );

        console.log("  [7] Thủ công: không tự chọn; Tab khoá gần nhất; Esc bỏ khoá");
        await resetAll();
        check((await setMode("manual")) === "manual", "đổi sang Thủ công qua Cài đặt");
        await put("a", 100, 0);
        await put("b", 200, 0);
        seen = await watch(600);
        check(
          seen.length === 1 && seen[0] === null,
          `Thủ công: có quái mà không tự khoá (${JSON.stringify(seen)})`,
        );
        await press("Tab");
        check((await tgt()) === "a", `Tab: khoá con gần nhất (${await tgt()})`);
        await put("b", 20, 0); // gần hơn hẳn nhưng khoá tay phải giữ
        seen = await watch(500);
        check(
          seen.length === 1 && seen[0] === "a",
          `khoá tay: con khác lại gần cũng không đổi (${JSON.stringify(seen)})`,
        );
        await press("Escape");
        check((await tgt()) === null, "Esc: bỏ khoá");
        await sleep(400);
        check((await tgt()) === null, "Thủ công: bỏ khoá xong không tự chọn lại");
        await evalJs(`window.__sent.length = 0; window.__scene.nextSlash = 0; 1`);
        await press("KeyJ");
        check((await tgt()) !== null, "Thủ công: bấm J thì tự khoá quái gần nhất (như cũ)");

        console.log("  [8] phím tắt ` đổi chế độ, có thông báo; lưu theo thiết bị");
        await resetAll();
        await press("Backquote");
        check((await mode()) === "manual", "bấm ` : sang Thủ công");
        const toastsM = await evalJs(
          `[...document.querySelectorAll("#toast p")].map((p) => p.textContent)`,
        );
        check(
          toastsM.some((t) => t.includes("Chế độ nhắm") && t.includes("Thủ công")),
          `thông báo: ${JSON.stringify(toastsM)}`,
        );
        check(
          (await evalJs(`localStorage.getItem("tg_aim_mode")`)) === "manual",
          "đã lưu theo thiết bị (tg_aim_mode)",
        );
        check(
          (await evalJs(`document.getElementById("set-aim-mode").value`)) === "manual",
          "ô chọn trong Cài đặt đồng bộ",
        );
        await press("Backquote");
        check((await mode()) === "auto", "bấm ` lần nữa: về Tự động");

        console.log("  [9] đổi chế độ giữa chừng: Tự động -> Thủ công giữ nguyên mục tiêu đang có");
        await resetAll();
        await put("a", 100, 0);
        await sleep(500);
        check((await tgt()) === "a", "tự động: a");
        await setMode("manual");
        await sleep(300);
        check((await tgt()) === "a" && (await pinned()) === false, "sang Thủ công: vẫn khoá a");

        console.log("  [10] PK thách đấu: chỉ nhắm ĐỐI THỦ");
        await resetAll();
        await put("a", 60, 0); // quái sát người: không được chọn trong trận
        await evalJs(`(() => {
          const sc = window.__scene, me = sc.state.players.get(sc.sid);
          const opp = Object.assign({}, me, { name: "Dau Si Ha", x: me.x - 140, y: me.y, px: me.x - 140, py: me.y, hp: 50, maxHp: 100, dead: false });
          sc.state.players.set("opp1", opp);
          window.__ui.onDuelState({ phase: "fight", opponent: "Dau Si Ha", startsInMs: 0, endsInMs: 100000 });
          return 1;
        })()`);
        await sleep(900);
        check(await evalJs(`window.__ui.isDuelActive()`), "đang trong trận (HUD quyết đấu hiện)");
        check(
          (await tgt()) === "p:opp1",
          `mục tiêu = đối thủ, không phải quái sát người (${await tgt()})`,
        );
        const infoP = await evalJs(`window.__scene.targetInfo?.text ?? ""`);
        check(/Dau Si Ha/.test(infoP) && /50%/.test(infoP), `tên + khí huyết đối thủ: "${infoP}"`);
        await evalJs(`window.__sent.length = 0; window.__scene.nextSlash = 0; 1`);
        await press("KeyJ");
        const aP = await evalJs(
          `(() => { const m = window.__sent.filter((s) => s[0] === "attack").pop(); return m ? m[1].angle : null; })()`,
        );
        check(
          aP !== null && Math.abs(Math.abs(aP) - Math.PI) < 0.3,
          `J trong trận -> ${aP === null ? "không gửi" : aP.toFixed(2)} rad (về đối thủ phía tây)`,
        );
        await evalJs(`document.getElementById("duel-hud").hidden = true`);
        await sleep(500);
        check((await tgt()) === "a", `hết trận: nhả đối thủ, quay về quái (${await tgt()})`);
      } else {
        console.log("  [11] cảm ứng: nút Mục tiêu chọn tay tạm thời trong chế độ Tự động");
        await resetAll();
        await put("a", 100, 0);
        await put("b", 200, 0);
        await sleep(700);
        check((await tgt()) === "a", "tự động: a");
        const bc = await evalJs(
          `(() => { const e = document.getElementById("btn-target"); const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { x: r.left + r.width / 2, y: r.top + r.height / 2, ok: !!top && (top === e || e.contains(top)), w: r.width, h: r.height }; })()`,
        );
        check(
          bc.ok && bc.w >= 44 && bc.h >= 44,
          `nút Mục tiêu bấm được (${Math.round(bc.w)}x${Math.round(bc.h)})`,
        );
        await send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: bc.x, y: bc.y }],
        });
        await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(300);
        check(
          (await tgt()) === "b" && (await pinned()) === true,
          `chạm: chọn tay b, ghim (${await tgt()}, ghim=${await pinned()})`,
        );
        await evalJs(`window.__scene.runAction("target.next")`);
        await sleep(300);
        check(
          (await tgt()) === "a" && (await pinned()) === true,
          "chạm lần nữa: xoay vòng về a (vẫn chọn tay)",
        );
        await drop("b");
        await sleep(300);
        await evalJs(`window.__scene.runAction("target.next")`);
        await sleep(300);
        check(
          (await pinned()) === false && (await tgt()) === "a",
          "chỉ còn đúng con đang chọn: Tab bỏ ghim, quay lại tự động",
        );
      }
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
