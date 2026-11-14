import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm bảng Lò Rèn và Cửa hàng ở năm khung nhìn (M6 #409 mục 2 và 4): Chrome thật, chế độ mock (không cần server / Vite).
 *
 *   npm run build -w client && node client/scripts/check-forge-shop.mjs [--shots <thư mục>] [--probe]
 *
 * Dữ liệu là công thức rèn + cửa hàng THẬT của game (`window.__catalog`, chỉ `?debug`): 18 công thức (9 của Thiết Ngưu `tho_ren`, 9 Kim Đan của
 * thợ rèn Vọng Sương `tho_ren_suong`, có phí Linh thạch) và cửa hàng đan cấp 2 của `lai_buon_suong`. Mỗi bảng thử hai ca:
 *   "thiếu": ví 0, túi rỗng  -> mọi nút Rèn / Mua tắt, chip thiếu hiện đỏ (`.missing`);
 *   "đủ":    ví rất lớn, túi đủ mọi nguyên liệu x 999 -> mọi nút bật, không chip thiếu.
 * Khẳng định (`judgeForgeShop`, hàm thuần có test): đủ thẻ; nút bấm >= 44 px (cảm ứng); không tràn ngang; không cắt tên / chip;
 * chip không ra ngoài thẻ; trạng thái nút / chip đúng ca; thẻ cuối cuộn tới được. `--probe` chỉ in số đo (để đặt ngưỡng).
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

/** Năm khung nhìn như `snap-sheet.mjs`; máy tính đứng đầu vì Chrome headless không tắt được giả lập cảm ứng trong cùng phiên. */
export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
];

/** Mục bấm tối thiểu trên cảm ứng (px CSS), như mọi nút khác của game. */
export const MIN_TAP_PX = 44;

/**
 * @typedef {{ expectedCards: number, cards: number, tapHeights: number[], tapWidths: number[], overflowX: number,
 *   clipped: number, outsideCard: number, enabled: number, disabled: number, missingChips: number, feeChips: number,
 *   lastReachable: boolean, touch: boolean, state: "thieu" | "du", expectFee: boolean }} PanelMetrics
 */

/**
 * @param {string} label tên bảng + ca, để thông báo lỗi
 * @param {PanelMetrics} m
 * @returns {string[]} danh sách lỗi (rỗng = đạt)
 */
export function judgeForgeShop(label, m) {
  const errs = [];
  const e = (msg) => errs.push(`${label}: ${msg}`);
  if (!(m.expectedCards > 0)) e("không có thẻ nào để kiểm (dữ liệu rỗng)");
  if (m.cards !== m.expectedCards) e(`số thẻ ${m.cards} != ${m.expectedCards}`);
  if (m.touch) {
    const lowH = m.tapHeights.filter((h) => h < MIN_TAP_PX - 0.5);
    const lowW = m.tapWidths.filter((w) => w < MIN_TAP_PX - 0.5);
    if (lowH.length > 0)
      e(
        `${lowH.length} nút thấp hơn ${MIN_TAP_PX}px (thấp nhất ${Math.min(...lowH).toFixed(1)}px)`,
      );
    if (lowW.length > 0)
      e(`${lowW.length} nút hẹp hơn ${MIN_TAP_PX}px (hẹp nhất ${Math.min(...lowW).toFixed(1)}px)`);
  }
  if (m.overflowX > 1) e(`tràn ngang ${m.overflowX}px`);
  if (m.clipped > 0) e(`${m.clipped} chữ bị cắt`);
  if (m.outsideCard > 0) e(`${m.outsideCard} chip / chữ ra ngoài thẻ`);
  if (!m.lastReachable) e("không cuộn tới được thẻ cuối");
  if (m.state === "thieu") {
    if (m.enabled > 0) e(`${m.enabled} nút còn BẬT khi ví 0 và túi rỗng (phải tắt hết)`);
    if (m.missingChips === 0) e("không chip nào báo thiếu dù ví 0 và túi rỗng");
  } else {
    if (m.disabled > 0) e(`${m.disabled} nút còn TẮT dù đã đủ tiền và nguyên liệu`);
    if (m.missingChips > 0) e(`${m.missingChips} chip báo thiếu dù đã đủ`);
  }
  if (m.expectFee && m.feeChips !== m.expectedCards)
    e(`chip phí Linh thạch ${m.feeChips} != ${m.expectedCards} thẻ`);
  if (!m.expectFee && m.feeChips > 0) e(`${m.feeChips} chip phí ở bảng miễn phí`);
  return errs;
}

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  const probe = process.argv.includes("--probe");
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
  const CDP_PORT = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-forge-shop-"));
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
    { stdio: "ignore" },
  );
  let failures = 0;
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

    /**
     * Đo một bảng đã mở. `sel`: bộ chọn thẻ / nút / chip / chữ cần không bị cắt; `lists` = các hộp cuộn (tấm tự cuộn trên điện thoại).
     * Chạy TRONG trang; trả về `PanelMetrics` (không gồm `touch` / `state` / `expectFee`).
     */
    const measure = (modalId, listId, sel) => `(() => {
      const modal = document.getElementById(${JSON.stringify(modalId)});
      const list = document.getElementById(${JSON.stringify(listId)});
      const cards = [...list.querySelectorAll(${JSON.stringify(sel.card)})];
      const taps = [...list.querySelectorAll(${JSON.stringify(sel.tap)})];
      const rects = taps.map((b) => b.getBoundingClientRect());
      const clipped = [...list.querySelectorAll(${JSON.stringify(sel.text)})].filter((t) => t.scrollWidth > t.clientWidth + 1).length;
      let outside = 0;
      for (const c of cards) {
        const cr = c.getBoundingClientRect();
        for (const t of c.querySelectorAll(${JSON.stringify(sel.inner)})) {
          const r = t.getBoundingClientRect();
          if (r.width > 0 && (r.right > cr.right + 1 || r.left < cr.left - 1)) outside++;
        }
      }
      const last = cards[cards.length - 1];
      let lastReachable = false;
      if (last) {
        last.scrollIntoView({ block: "end" });
        const lr = last.getBoundingClientRect(), mr = modal.getBoundingClientRect();
        lastReachable = lr.bottom <= Math.max(mr.bottom, innerHeight) + 1 && lr.top >= -1;
      }
      const overflowX = Math.max(0, document.documentElement.scrollWidth - innerWidth, modal.scrollWidth - modal.clientWidth);
      return {
        cards: cards.length,
        tapHeights: rects.map((r) => r.height), tapWidths: rects.map((r) => r.width),
        overflowX, clipped, outsideCard: outside, lastReachable,
        enabled: taps.filter((b) => !b.disabled && ${sel.actionOnly ? "b.matches(" + JSON.stringify(sel.actionOnly) + ")" : "true"}).length,
        disabled: taps.filter((b) => b.disabled && ${sel.actionOnly ? "b.matches(" + JSON.stringify(sel.actionOnly) + ")" : "true"}).length,
        missingChips: list.querySelectorAll(${JSON.stringify(sel.missing)}).length,
        feeChips: list.querySelectorAll(${JSON.stringify(sel.fee)}).length,
      };
    })()`;

    for (const vp of VIEWPORTS) {
      console.log(`\n=== ${vp.name} ===`);
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      if (vp.mobile)
        await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      // Đánh dấu trang CŨ: khung nhìn sau không được coi "đã sẵn sàng" khi trang cũ còn sống lúc chưa kịp chuyển sang trang mới
      await evalJs("window.__fsOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&map=am_suong`,
      });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        // `__getMap` được đặt ở CUỐI `WorldScene.create` (sau `ui.init`: nút đã gắn sự kiện)
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__fsOldPage && window.__getMap && window.__catalog && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
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
      const cat = await evalJs(`JSON.stringify(window.__catalog())`).then((s) => JSON.parse(s));

      /**
       * Đứng cạnh NPC `npcId` (mock không chạy đối chiếu: đặt `predX / predY` trực tiếp). BẮT BUỘC: WorldScene tự đóng bảng Rèn / Cửa hàng
       * khi không có NPC nào trong tầm nói chuyện, nên đứng giữa trấn (cách NPC gần nhất 85 px > `NPC_RANGE` 80) thì bảng vừa mở đã đóng.
       */
      const standAt = async (npcId) => {
        const n = cat.npcs.find((x) => x.id === npcId);
        if (!n) throw new Error(`không có NPC ${npcId} trong catalog`);
        await evalJs(
          `(() => { const sc = window.__scene; sc.predX = ${n.x}; sc.predY = ${n.y}; sc.cameras.main.centerOn(${n.x}, ${n.y}); return 1; })()`,
        );
        await sleep(250);
      };

      /** Nạp ví + túi cho ca `state`, rồi chạy `body` (mở bảng...). Túi: mỗi nguyên liệu của MỌI công thức x 999 (ca "đủ"), hoặc rỗng. */
      const setState = (state) => {
        const mats = [...new Set(cat.recipes.flatMap((r) => r.inputs.map((i) => i.itemId)))];
        const slots = state === "du" ? mats.map((itemId) => ({ itemId, qty: 999 })) : [];
        return evalJs(`(() => {
          window.__ui.onWallet({ coin: ${state === "du" ? 100000000 : 0} });
          window.__ui.onInv({ slots: ${JSON.stringify(slots)}, cd: {} });
          return 1;
        })()`);
      };
      const shot = async (name) => {
        if (!shotsDir) return;
        await evalJs(
          `document.querySelectorAll(".modal-box.sheet:not([hidden])").forEach((m) => { m.scrollTop = 0; })`,
        );
        await sleep(150);
        const s = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(
          path.join(shotsDir, `${name}-${vp.name}.webp`),
          Buffer.from(s.result.data, "base64"),
        );
      };
      const report = (label, m, extra) => {
        const full = { ...m, touch: vp.mobile, ...extra };
        const avg = full.tapHeights.length
          ? full.tapHeights.reduce((a, b) => a + b, 0) / full.tapHeights.length
          : 0;
        console.log(
          `  - ${label}: ${m.cards}/${full.expectedCards} thẻ, nút ${full.tapHeights.length} (cao TB ${avg.toFixed(1)} px, thấp nhất ${Math.min(...full.tapHeights, 999).toFixed(1)}), bật ${m.enabled} / tắt ${m.disabled}, chip thiếu ${m.missingChips}, chip phí ${m.feeChips}`,
        );
        if (probe) return;
        const errs = judgeForgeShop(label, full);
        for (const er of errs) {
          console.log(`  ✗ ${er}`);
          failures++;
        }
      };

      // ---- Lò Rèn: hai thợ rèn x hai ca ----
      for (const [npcId, expectFee] of [
        ["tho_ren", false],
        ["tho_ren_suong", true],
      ]) {
        const expectedCards = cat.recipes.filter((r) => r.npcId === npcId).length;
        for (const state of ["thieu", "du"]) {
          await evalJs(`window.__ui.closeAllModals()`);
          await setState(state);
          // Cả hai thợ rèn mở khi đứng cạnh thợ rèn Vọng Sương: nội dung bảng chỉ phụ thuộc id NPC truyền vào `openForgeModal`
          await standAt("tho_ren_suong");
          await evalJs(`window.__ui.openForgeModal(${JSON.stringify(npcId)})`);
          await sleep(300);
          const m = await evalJs(
            measure("forge-modal", "forge-list", {
              card: ".forge-card",
              tap: ".forge-btn",
              text: ".forge-title-col b, .forge-mat",
              inner: ".forge-mat, .forge-title-col b",
              missing: ".forge-mat.missing",
              fee: ".forge-fee",
            }),
          );
          report(`rèn ${npcId} / ${state}`, m, { expectedCards, state, expectFee });
          if (state === "du" && npcId === "tho_ren_suong") await shot("ren-vong-suong");
          if (state === "thieu" && npcId === "tho_ren_suong") await shot("ren-vong-suong-thieu");
        }
      }

      // ---- Cửa hàng đan cấp 2 của lái buôn Vọng Sương: mua (hai ca) ----
      const shopItems = cat.shops.find((s) => s.npcId === "lai_buon_suong")?.itemIds ?? [];
      for (const state of ["thieu", "du"]) {
        await evalJs(`window.__ui.closeAllModals()`);
        await setState(state);
        await standAt("lai_buon_suong");
        await evalJs(`window.__ui.openShopModal("lai_buon_suong")`);
        await sleep(300);
        const m = await evalJs(
          measure("shop-modal", "shop-buy-list", {
            card: ".shop-card",
            tap: ".shop-act-btn, .shop-qty-btn",
            actionOnly: ".shop-act-btn",
            text: ".shop-item-name, .shop-price-tag",
            inner: ".shop-item-name, .shop-price-tag, .shop-act-btn",
            missing: ".shop-act-btn.buy:disabled",
            fee: ".never-exists",
          }),
        );
        // Ca "thiếu": nút Mua tắt VÀ hiện "Thiếu N" (chip thiếu = nút Mua tắt); ca "đủ": nút Mua bật
        report(`cửa hàng lai_buon_suong (mua) / ${state}`, m, {
          expectedCards: shopItems.length,
          state,
          expectFee: false,
        });
        if (state === "du") await shot("cua-hang-vong-suong");
      }
    }
    ws.close();
  } finally {
    chrome.kill("SIGKILL");
    server.close();
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // Bỏ qua
    }
  }
  if (failures > 0) {
    console.error(`\n❌ ${failures} lỗi.`);
    process.exitCode = 1;
  } else {
    console.log("\n🎉 Bảng Lò Rèn và Cửa hàng dùng được ở cả năm khung nhìn.");
  }
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error("Lỗi khi chạy check-forge-shop:", err);
    process.exitCode = 1;
  });
}
