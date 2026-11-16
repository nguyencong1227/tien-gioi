import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch */
/**
 * Kiểm HƯỚNG ĐÁNH theo mục 29 (QUYET_DINH_M3, `client/src/aim-order.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-aim-cursor.mjs [--vp <khung>]
 *
 * Quái đứng phía ĐÔNG và đang được khoá; con trỏ chuột đặt phía TÂY nhân vật. Bấm phím THẬT (`Input.dispatchKeyEvent`) J, K, L, U, I, O (cone / line / self / dash)
 * và đọc `angle` trong tin gửi đi:
 *   - con trỏ trên canvas màn chơi: bay về CON TRỎ (tây), kể cả khi đang khoá quái;
 *   - con trỏ trên bản đồ nhỏ / khung chat / thanh chiêu / thẻ nhân vật / Nhiệm vụ (khung phủ trên màn chơi): coi như KHÔNG có chuột, bay về quái đã khoá (đông);
 *   - một khung phủ lên dưới con chuột ĐỨNG YÊN (không có sự kiện chuột nào) cũng vậy; bản đồ lớn mở ra thì `cursorAngle()` là null, đóng thì trở lại;
 *   - dash: phím hướng đang giữ thắng cả con trỏ lẫn mục tiêu;
 *   - cài đặt "Ưu tiên mục tiêu hơn chuột" bật: về quái dù chuột ở trên canvas; chưa khoá + không chuột hợp lệ: quái gần nhất, rồi hướng nhìn;
 *   - cảm ứng (chạm): luôn về mục tiêu.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-aim-cursor-"));
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

      // ---- dữ liệu: người chơi ở trấn, cảnh giới cao, đủ linh lực, bốn chiêu (cone / line / self / dash) ở ô 2-5, một quái phía đông đang khoá ----
      const BOOK = `{ learned: { hoa_van_kiem: 1, huyen_bang_chi: 1, kim_chung_trao: 1, phieu_phong_bo: 1 }, slots: ["hoa_van_kiem", "huyen_bang_chi", "kim_chung_trao", "phieu_phong_bo"], cd: [0, 0, 0, 0], cdMax: [0, 0, 0, 0] }`;
      await evalJs(`(() => {
        const sc = window.__scene;
        window.__sent = [];
        sc.room.send = (t, m) => { window.__sent.push([t, m]); };
        const me = sc.me(), t = sc.map.townPx;
        me.x = t.x; me.y = t.y; sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0; sc.hasMe = true;
        me.realm = 6; me.tier = 0; me.mp = 99999; me.maxMp = 99999; me.dead = false;
        sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(me.x, me.y);
        sc.onSkills(${BOOK});
        sc.state.monsters.set("m1", { kind: "lang", x: sc.predX + 200, y: sc.predY, angle: 0, hp: 100, maxHp: 100, fx: 0, elite: 0 });
        return 1;
      })()`);
      await sleep(700);
      const lockEast = () =>
        evalJs(
          `(() => { const sc = window.__scene; sc.setLockedTarget("m1"); return sc.lockedTargetId; })()`,
        );
      check((await lockEast()) === "m1", "quái m1 ở phía đông đã được khoá");
      const toMonster = () =>
        evalJs(
          `(() => { const sc = window.__scene, m = sc.monsters.get("m1"); return Math.atan2(m.ty - sc.predY, m.tx - sc.predX); })()`,
        );
      const SHIFT = 0.4; // dung sai góc (rad)
      const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < SHIFT;
      const canvasRect = () =>
        evalJs(
          `(() => { const r = window.__scene.game.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`,
        );
      /** Đặt con chuột THẬT tại (x, y) cửa sổ */
      const mouseTo = async (x, y) => {
        await send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x,
          y,
          button: "none",
          buttons: 0,
        });
        await sleep(120);
      };
      /** Con trỏ cách nhân vật 180 px về phía TÂY trên canvas (nhân vật ở giữa khung nhìn, camera đã canh giữa) */
      const westPoint = async () => {
        const r = await canvasRect();
        return { x: r.l + r.w / 2 - 180, y: r.t + r.h / 2 };
      };
      const VK = { KeyJ: 74, KeyK: 75, KeyL: 76, KeyU: 85, KeyI: 73, KeyO: 79, KeyW: 87 };
      const KEY = { KeyJ: "j", KeyK: "k", KeyL: "l", KeyU: "u", KeyI: "i", KeyO: "o", KeyW: "w" };
      const keyDown = (code) =>
        send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: KEY[code],
          code,
          windowsVirtualKeyCode: VK[code],
        });
      const keyUp = (code) =>
        send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: KEY[code],
          code,
          windowsVirtualKeyCode: VK[code],
        });
      const resetCd = () =>
        evalJs(
          `(() => { const sc = window.__scene; sc.nextSlash = 0; sc.nextSword = 0; sc.onSkills(${BOOK}); window.__sent.length = 0; return 1; })()`,
        );
      const lastAngle = (types) =>
        evalJs(
          `(() => { const m = window.__sent.filter((s) => ${JSON.stringify(types)}.includes(s[0])).pop(); return m ? m[1].angle : null; })()`,
        );
      /** Bấm phím `code` và trả góc đã gửi (null nếu không có tin đánh nào) */
      const fire = async (code) => {
        await resetCd();
        await keyDown(code);
        await sleep(60);
        await keyUp(code);
        await sleep(120);
        return lastAngle(["attack", "skill", "cast"]);
      };
      const ATTACKS = [
        ["J đánh thường", "KeyJ"],
        ["K Kiếm khí", "KeyK"],
        ["L (cone)", "KeyL"],
        ["U (line)", "KeyU"],
        ["I (self)", "KeyI"],
        ["O (dash, không giữ phím)", "KeyO"],
      ];
      const fmt = (a) => (a === null ? "không gửi" : a.toFixed(2));
      /** Mọi đòn trong ATTACKS đều bay về `want` (rad) */
      const allToward = async (label, want) => {
        for (const [name, code] of ATTACKS) {
          const a = await fire(code);
          check(
            a !== null && near(a, want),
            `${label}: ${name} -> ${fmt(a)} rad (cần ${want.toFixed(2)})`,
          );
        }
      };
      const cursorAngleNow = () => evalJs(`window.__scene.cursorAngle()`);
      const hitIsCanvas = (x, y) =>
        evalJs(`document.elementFromPoint(${x}, ${y}) === window.__scene.game.canvas`);

      if (!vp.mobile) {
        const east = await toMonster();
        const w = await westPoint();
        console.log(
          "  [1] chuột trên canvas màn chơi (phía tây), đang khoá quái phía đông: bay về CON TRỎ",
        );
        await mouseTo(w.x, w.y);
        check(await hitIsCanvas(w.x, w.y), "phần tử dưới con trỏ là canvas màn chơi");
        const cur = await cursorAngleNow();
        check(
          cur !== null && near(cur, Math.PI),
          `cursorAngle() ~ tây (${cur === null ? "null" : cur.toFixed(2)})`,
        );
        await allToward("chuột trên canvas", Math.PI);

        console.log(
          "  [2] chuột trên khung giao diện phủ trên màn chơi: coi như KHÔNG có chuột, bay về quái đã khoá",
        );
        const FRAMES = [
          ["bản đồ nhỏ", "#minimap-wrap"],
          ["khung chat", "#chat"],
          ["thanh chiêu", "#skills .sk.slot"],
          ["thẻ nhân vật (HUD)", "#hud"],
          ["Nhiệm vụ", "#quest-tracker"],
        ];
        for (const [name, sel] of FRAMES) {
          const c = await evalJs(`(() => {
            const e = document.querySelector(${JSON.stringify(sel)});
            if (!e) return null;
            const r = e.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return null;
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const top = document.elementFromPoint(x, y);
            return { x, y, onFrame: !!top && (top === e || e.contains(top)) };
          })()`);
          if (!c) {
            console.log(`  - bỏ qua "${name}" (không hiện ở khung này)`);
            continue;
          }
          await mouseTo(c.x, c.y);
          check(c.onFrame, `"${name}": phần tử dưới con trỏ là chính khung đó`);
          check((await cursorAngleNow()) === null, `"${name}": cursorAngle() = null`);
          check((await lockEast()) === "m1", "vẫn đang khoá quái");
          await allToward(`chuột trên ${name}`, east);
        }

        console.log("  [3] khung phủ lên dưới con chuột ĐỨNG YÊN (không có sự kiện chuột nào)");
        await mouseTo(w.x, w.y);
        check((await cursorAngleNow()) !== null, "chuột trên canvas: hợp lệ");
        await evalJs(
          `(() => { const d = document.createElement("div"); d.id = "tg-test-frame"; d.style.cssText = "position:fixed;inset:0;z-index:99999;background:transparent"; document.body.appendChild(d); return 1; })()`,
        );
        await sleep(100);
        check(
          (await cursorAngleNow()) === null,
          "khung phủ lên: cursorAngle() = null dù chuột chưa nhúc nhích",
        );
        await allToward("khung phủ lên dưới chuột đứng yên", east);
        await evalJs(`document.getElementById("tg-test-frame")?.remove()`);
        await sleep(100);
        check((await cursorAngleNow()) !== null, "gỡ khung: chuột hợp lệ trở lại");

        console.log("  [3b] bản đồ lớn (bảng) mở ra dưới con chuột đứng yên");
        await evalJs(`window.__ui.toggleMapModal(true)`);
        await sleep(300);
        check((await hitIsCanvas(w.x, w.y)) === false, "bản đồ lớn phủ lên điểm con trỏ");
        check((await cursorAngleNow()) === null, "bản đồ lớn mở: cursorAngle() = null");
        await evalJs(`window.__ui.toggleMapModal(false)`);
        await sleep(300);
        check((await cursorAngleNow()) !== null, "đóng bản đồ lớn: chuột hợp lệ trở lại");

        console.log("  [4] dash: phím hướng đang giữ thắng cả con trỏ lẫn mục tiêu");
        await mouseTo(w.x, w.y);
        await resetCd();
        await keyDown("KeyW");
        await sleep(250);
        await keyDown("KeyO");
        await sleep(60);
        await keyUp("KeyO");
        await sleep(120);
        const dashA = await lastAngle(["cast"]);
        await keyUp("KeyW");
        // W đã đẩy nhân vật đi lên: đặt lại chỗ đứng để quái lại nằm đúng phía đông (mốc `east` của các bước sau)
        await evalJs(
          `(() => { const sc = window.__scene, t = sc.map.townPx, m = sc.state.monsters.get("m1"); sc.predX = t.x; sc.predY = t.y; sc.pending.length = 0; sc.cameras.main.centerOn(t.x, t.y); if (m) { m.x = t.x + 200; m.y = t.y; } return 1; })()`,
        );
        await sleep(500);
        check(
          dashA !== null && near(dashA, -Math.PI / 2),
          `giữ W (lên) rồi O: ${fmt(dashA)} rad (cần ${(-Math.PI / 2).toFixed(2)})`,
        );

        console.log('  [5] cài đặt "Ưu tiên mục tiêu hơn chuột"');
        check((await evalJs(`window.__ui.isPreferTarget()`)) === false, "mặc định TẮT");
        await evalJs(
          `(() => { const c = document.getElementById("set-prefer-target"); c.checked = true; c.dispatchEvent(new Event("change")); return 1; })()`,
        );
        check((await evalJs(`window.__ui.isPreferTarget()`)) === true, "bật được");
        await mouseTo(w.x, w.y);
        await allToward("ưu tiên mục tiêu, chuột trên canvas", east);
        await evalJs(
          `(() => { const c = document.getElementById("set-prefer-target"); c.checked = false; c.dispatchEvent(new Event("change")); return 1; })()`,
        );
        check((await evalJs(`window.__ui.isPreferTarget()`)) === false, "tắt lại được");

        console.log(
          "  [6] không chuột hợp lệ + chưa khoá: tự khoá quái gần nhất, rồi mới tới hướng nhìn",
        );
        const chat = await evalJs(
          `(() => { const r = document.querySelector("#chat").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
        );
        await mouseTo(chat.x, chat.y);
        await evalJs(`window.__scene.setLockedTarget(null)`);
        const aCone = await fire("KeyL");
        check(
          aCone !== null && near(aCone, east),
          `chưa khoá, chuột trên chat: L về quái gần nhất (${fmt(aCone)})`,
        );
        check(
          (await evalJs(`window.__scene.lockedTargetId`)) === "m1",
          "quái gần nhất đã được tự khoá",
        );
        await evalJs(
          `(() => { const sc = window.__scene; sc.setLockedTarget(null); sc.state.monsters.delete("m1"); sc.facing = 1.0; return 1; })()`,
        );
        await sleep(500);
        const aFace = await fire("KeyL");
        check(
          aFace !== null && near(aFace, 1.0),
          `không quái, không chuột hợp lệ: về hướng nhìn (${fmt(aFace)})`,
        );
      } else {
        console.log("  [7] cảm ứng: không có chuột, luôn về mục tiêu");
        const east = await toMonster();
        const r = await canvasRect();
        // một con chuột cũ phía tây rồi chạm: chạm xoá con trỏ
        await mouseTo(r.l + r.w / 2 - 180, r.t + r.h / 2);
        await send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: r.l + r.w / 2 - 60, y: r.t + r.h / 2 }],
        });
        await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(150);
        check((await cursorAngleNow()) === null, "sau khi chạm: cursorAngle() = null");
        for (const [name, action] of [
          ["J", "attack"],
          ["K", "skill.sword"],
          ["L", "skill.slot2"],
          ["U", "skill.slot3"],
          ["I", "skill.slot4"],
          ["O", "skill.slot5"],
        ]) {
          await resetCd();
          await evalJs(`window.__scene.runAction(${JSON.stringify(action)})`);
          await sleep(120);
          const a = await lastAngle(["attack", "skill", "cast"]);
          check(
            a !== null && near(a, east),
            `cảm ứng: ${name} -> ${fmt(a)} rad (về quái, cần ${east.toFixed(2)})`,
          );
        }
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
