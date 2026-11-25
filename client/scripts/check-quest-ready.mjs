/* global console, setTimeout, Buffer */
/**
 * Kiểm mục 66 (nhiệm vụ xong "không thấy thưởng", #1327) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-quest-ready.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Cho mỗi khung: (1) lập mốc (túi + sổ nhiệm vụ lần đầu) KHÔNG báo gì dù nhiệm vụ đã đủ; (2) nhiệm vụ "Nhập thế" vừa đủ -> dòng "ĐÃ ĐỦ: ..." hiện MỘT lần, nói NPC + bản đồ;
 * (3) thanh theo dõi ghi "ĐÃ ĐỦ — về gặp ... để trả nhiệm vụ"; (4) dấu "?" trên đầu Trưởng trấn là VÀNG, to hơn "!" của NPC khác; (5) hộp thoại nhận nhiệm vụ có dòng
 * "Thưởng (gốc): ..." dưới nút, KHÔNG phải nút (phím 1-9 vẫn theo nút), nằm gọn khung nhìn; (6) trả xong (khỏi sổ) rồi vẽ lại sổ: không báo lại.
 * `--shots`: lưu ảnh toàn màn hình (dòng báo + dấu "?") và ảnh hộp thoại.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { launchChrome } from "./chrome-launch.mjs";
import { waitUntilTrue } from "./chrome-wait.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");

export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
];

/** Sổ nhiệm vụ: "Nhập thế" (đi gặp Hà lão, trả ở Trưởng trấn) ở bước `step` (0 = chưa đủ, 1 = đã đủ). */
const QUESTS_MSG = (step) => ({
  active: [{ id: "nhap_the", step, count: step }],
  done: [],
  dailyDone: [],
});
const EMPTY_QUESTS = { active: [], done: [], dailyDone: [] };

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  const onlyVp = process.argv.includes("--vp")
    ? process.argv[process.argv.indexOf("--vp") + 1]
    : null;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
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
  let failures = 0;
  const check = (ok, msg) => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
    if (!ok) failures++;
  };
  let launched = null;
  try {
    launched = await launchChrome({ name: "quest-ready" });
    const page = launched.page;
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

    const loadPage = async (vp) => {
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1` });
      const ready = Boolean(
        await waitUntilTrue(async () =>
          Boolean(
            await evalJs(
              `Boolean(!window.__isOldPage && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
            ),
          ),
        ),
      );
      if (!ready) return false;
      await sleep(500);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      await evalJs(`window.__scene.room.send = () => {}; 1`);
      return true;
    };
    const toasts = () =>
      evalJs(`Array.from(document.querySelectorAll("#toast p")).map((p) => p.textContent)`);
    const readyToasts = async () => (await toasts()).filter((t) => t.startsWith("ĐÃ ĐỦ"));
    const markerOf = (npcId) =>
      evalJs(`(() => {
        const ne = window.__scene.npcs.get(${JSON.stringify(npcId)});
        if (!ne) return null;
        return { text: ne.markerText.text, color: ne.markerText.style.color, visible: ne.markerText.visible, scale: ne.markerText.scaleX, auraScale: ne.markerAura.scaleX };
      })()`);
    const shot = async (name) => {
      if (!shotsDir) return;
      const s = await send("Page.captureScreenshot", { format: "webp", quality: 80 });
      fs.writeFileSync(path.join(shotsDir, name), Buffer.from(s.result.data, "base64"));
    };

    for (const vp of VIEWPORTS) {
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} ===`);
      if (!(await loadPage(vp))) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      const emptyInv = `{ slots: Array.from({ length: 30 }, () => null), cd: {} }`;

      // (1) mốc đầu: túi + sổ có nhiệm vụ ĐÃ ĐỦ từ trước -> KHÔNG báo (lập mốc)
      await evalJs(`window.__ui.onInv(${emptyInv}); 1`);
      await evalJs(`window.__ui.onQuests(${JSON.stringify(QUESTS_MSG(1))}); 1`);
      await sleep(300);
      check(
        (await readyToasts()).length === 0,
        "nhiệm vụ đã đủ từ trước (mốc đầu sau khi có túi + sổ): KHÔNG báo",
      );

      // (2) trả xong rồi nhận lại, chưa đủ -> đủ: báo ĐÚNG MỘT lần
      await evalJs(`window.__ui.onQuests(${JSON.stringify(QUESTS_MSG(0))}); 1`);
      await sleep(200);
      check((await readyToasts()).length === 0, "chưa đủ mục tiêu: không báo");
      await evalJs(`window.__ui.onQuests(${JSON.stringify(QUESTS_MSG(1))}); 1`);
      await sleep(400);
      let rt = await readyToasts();
      check(rt.length === 1, `vừa đủ: báo ĐÚNG MỘT lần (${rt.length})`);
      check(
        /^ĐÃ ĐỦ: Nhập thế — về gặp Lâm Thanh Tùng ở Lạc Hà Trấn để trả nhiệm vụ$/.test(rt[0] ?? ""),
        `dòng báo nói tên nhiệm vụ, NPC và bản đồ ("${rt[0]}")`,
      );
      await evalJs(`window.__ui.onQuests(${JSON.stringify(QUESTS_MSG(1))}); 1`);
      await evalJs(`window.__ui.onInv(${emptyInv}); 1`);
      await sleep(200);
      check((await readyToasts()).length === 1, "tin sổ / túi lặp lại (vẫn đủ): KHÔNG báo thêm");

      // (3) thanh theo dõi
      const step = await evalJs(
        `document.querySelector("#quest-tracker-list .qt-item.ready .qt-step")?.textContent ?? null`,
      );
      check(
        typeof step === "string" && /^ĐÃ ĐỦ — về gặp .* ở Lạc Hà Trấn để trả nhiệm vụ$/.test(step),
        `thanh theo dõi: "${step}"`,
      );

      // (4) dấu "?" vàng, to hơn "!"
      await sleep(500); // cảnh gọi syncNpcs mỗi khung
      const q = await markerOf("truong_tran");
      check(q && q.visible && q.text === "?", `Trưởng trấn có dấu "?" hiện (${JSON.stringify(q)})`);
      check(q && q.color === "#ffec4d", `dấu "?" màu VÀNG #ffec4d (${q?.color})`);
      check(q && q.scale > 1.2 && q.auraScale > 1.2, "dấu \"?\" to hơn dấu '!' (co giãn 1.3)");
      await shot(`nhiem-vu-da-du-${vp.name}.webp`);

      // (5) hộp thoại nhận nhiệm vụ có dòng xem trước thưởng
      await evalJs(`window.__ui.onQuests(${JSON.stringify(EMPTY_QUESTS)}); 1`);
      await evalJs(
        `window.__ui.onDialog(${JSON.stringify({
          npcId: "truong_tran",
          lines: ["Đạo hữu mới đến? Ngồi xuống uống chén trà."],
          options: [
            { label: "Nhận nhiệm vụ: Nhập thế", action: { kind: "accept", questId: "nhap_the" } },
            { label: "Rời đi", action: { kind: "close" } },
          ],
        })}); 1`,
      );
      await sleep(600);
      await evalJs(
        `document.getElementById("dlg-body").dispatchEvent(new Event("pointerdown")); 1`,
      );
      await sleep(200);
      const dlg = await evalJs(`(() => {
        const box = document.getElementById("dlg-options");
        const reward = box.querySelector(".dlg-opt-reward");
        const modal = document.getElementById("dialog-modal");
        const r = reward ? reward.getBoundingClientRect() : null;
        const m = modal.getBoundingClientRect();
        return {
          buttons: box.querySelectorAll("button.dlg-opt-btn").length,
          reward: reward ? reward.textContent : null,
          prev: reward ? reward.previousElementSibling?.tagName : null,
          inside: r ? r.left >= m.left - 0.5 && r.right <= m.right + 0.5 && r.bottom <= window.innerHeight + 0.5 : false,
          scrollW: document.documentElement.scrollWidth, vw: window.innerWidth,
        };
      })()`);
      check(dlg.buttons === 2, `đúng 2 NÚT (dòng xem trước không phải nút; ${dlg.buttons})`);
      check(
        typeof dlg.reward === "string" && /^Thưởng \(gốc\): 15 tu vi, .+ ×3$/.test(dlg.reward),
        `dòng xem trước thưởng: "${dlg.reward}"`,
      );
      check(dlg.prev === "BUTTON", "dòng xem trước nằm NGAY DƯỚI nút nhận nhiệm vụ");
      check(
        dlg.inside && dlg.scrollW <= dlg.vw + 1,
        "dòng xem trước nằm gọn khung nhìn, không tràn ngang",
      );
      await shot(`nhiem-vu-xem-truoc-thuong-${vp.name}.webp`);
      await evalJs(`window.__ui.closeDialog(); 1`);
    }
  } finally {
    server.close();
    if (launched) await launched.close();
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
