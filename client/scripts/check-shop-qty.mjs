import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm Ô SỐ LƯỢNG dùng chung ở CỬA HÀNG NPC (QUYET_DINH_M3 mục 47, bước 4; `qty-stepper.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), năm khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-shop-qty.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * MUA (lái buôn Vọng Sương): mỗi thẻ có ô gõ số + − / + / ×10 / ×100 / Tối đa; giới hạn = ví / giá (trần 99 của máy chủ); gõ 9999 kẹp đúng giới hạn tính ĐỘC LẬP từ dữ liệu;
 *   nút Mua đổi theo số; chữ / 0 / "2.5" / trống rồi bấm Mua (hoặc Enter): KHÔNG gửi gì, focus về ô; Enter / Mua gửi đúng MỘT `buy {npcId, itemId, qty}`;
 *   ví đổi (vẽ lại cả danh sách) KHÔNG làm mất số đã chọn / focus; ví không đủ cả một cái: nút Mua mờ "Thiếu N".
 * BÁN: giới hạn = số đang có (trần 99); đồ thường gửi `sell {npcId, slot, qty}` ngay, đồ quý có hộp xác nhận với đúng số đã gõ; số sai thì không bán, không mở hộp.
 * `--shots`: lưu ảnh tab Mua và tab Bán mỗi khung nhìn (chụp ngay sau khi mở, chưa cuộn).
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

export const MIN_TAP_PX = 44;
/** Ngưỡng hình học thẻ cửa hàng (px): cột thông tin tối thiểu, ô số lượng tối thiểu, cột thông tin / thẻ tối đa (thẻ bị kéo cao nếu vượt) */
const GEO_MIN_LEFT_W = 200;
const GEO_MIN_STEP_W = 250;
const GEO_MAX_LEFT_H = 90;
const GEO_MAX_CARD_H = 300;

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
  const CDP_PORT = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-shop-qty-"));
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
      console.log(`\n=== ${vp.name} (${vp.mobile ? "cảm ứng" : "chuột"} + bàn phím) ===`);
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
      const shot = async (name) => {
        if (!shotsDir) return;
        await sleep(150);
        const s = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(
          path.join(shotsDir, `${name}-${vp.name}.webp`),
          Buffer.from(s.result.data, "base64"),
        );
      };
      /** Tâm của phần tử (cuộn vào tầm nhìn) + phần tử TẠI điểm đó (biết có bị che không) */
      const center = (sel, idx = 0) =>
        evalJs(`(() => {
          const e = document.querySelectorAll(${JSON.stringify(sel)})[${idx}];
          if (!e) return null;
          e.scrollIntoView({ block: "center", inline: "center" });
          const r = e.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const top = document.elementFromPoint(x, y);
          return { x, y, w: r.width, h: r.height, hit: !!top && (top === e || e.contains(top)) };
        })()`);
      const mouse = (type, x, y) =>
        send("Input.dispatchMouseEvent", {
          type,
          x,
          y,
          button: "left",
          buttons: type === "mousePressed" ? 1 : 0,
          clickCount: 1,
        });
      const tap = async (x, y) => {
        if (vp.mobile) {
          await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
          await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } else {
          await send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x,
            y,
            button: "none",
            buttons: 0,
          });
          await mouse("mousePressed", x, y);
          await mouse("mouseReleased", x, y);
        }
      };
      const key = async (code, k, vk) => {
        await send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: k,
          code,
          windowsVirtualKeyCode: vk,
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: k,
          code,
          windowsVirtualKeyCode: vk,
        });
      };

      // ---- dữ liệu ----
      await evalJs(`(() => {
        window.__sent = [];
        window.__scene.room.send = (t, m) => { window.__sent.push([t, m]); };
        return 1;
      })()`);
      const sent = (type) =>
        evalJs(`window.__sent.filter((m) => m[0] === ${JSON.stringify(type)}).map((m) => m[1])`);
      const clearSent = () => evalJs(`window.__sent.length = 0; 1`);
      const setBag = (slots) =>
        evalJs(
          `(() => { window.__ui.onInv({ slots: ${JSON.stringify(slots)}, cd: {} }); return 1; })()`,
        );
      const setCoin = (coin) =>
        evalJs(`(() => { window.__ui.onWallet({ coin: ${coin} }); return 1; })()`);
      const NPC = "lai_buon_suong";
      const openShop = async (tab) => {
        await evalJs(`window.__ui.closeAllModals()`);
        await evalJs(
          `(() => { const sc = window.__scene, n = window.__craftData.NPC_BY_ID.${NPC}; sc.predX = n.x; sc.predY = n.y; sc.cameras.main.centerOn(n.x, n.y); window.__ui.openShopModal(${JSON.stringify(NPC)}); return 1; })()`,
        );
        await sleep(300);
        if (tab === "sell") {
          await evalJs(
            `document.getElementById("tab-shop-sell").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))`,
          );
          await sleep(300);
        }
      };
      const LIST = (tab) => (tab === "buy" ? "#shop-buy-list" : "#shop-sell-list");
      /** Thẻ thứ `n` (0..) của danh sách: tên, giá một cái (đọc từ nhãn giá), ô số lượng, nút hành động */
      const cardInfo = (tab, n) =>
        evalJs(`(() => {
          const c = document.querySelectorAll("${LIST(tab)} .shop-card")[${n}];
          if (!c) return null;
          const inp = c.querySelector(".qty-input");
          const act = c.querySelector(".shop-act-btn");
          const note = c.querySelector(".qty-note");
          const price = Number((c.querySelector(".shop-price-tag")?.textContent.match(/(\\d+)/) ?? [])[1] ?? 0);
          return {
            name: c.querySelector(".shop-item-name")?.textContent ?? "", price,
            hasStepper: !!inp, value: inp ? inp.value : null, invalid: inp?.getAttribute("aria-invalid") === "true",
            note: note ? note.textContent : "", act: act ? act.textContent : "", actDisabled: act ? act.disabled : null,
            focused: !!inp && document.activeElement === inp, nav: inp ? inp.dataset.nav : null,
            inputId: inp ? inp.id : null,
          };
        })()`);
      const typeInto = async (tab, n, text) => {
        await evalJs(
          `(() => { const i = document.querySelectorAll("${LIST(tab)} .shop-card")[${n}].querySelector(".qty-input"); i.focus(); i.select(); return 1; })()`,
        );
        if (text === "") {
          await evalJs(
            `(() => { const i = document.activeElement; i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`,
          );
        } else await send("Input.insertText", { text });
        await sleep(80);
      };
      const enterKey = async () => {
        await send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          text: "\r",
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
        await sleep(150);
      };
      const clickAct = async (tab, n) => {
        const c = await center(`${LIST(tab)} .shop-card:nth-child(${n + 1}) .shop-act-btn`);
        await tap(c.x, c.y);
        await sleep(200);
      };
      const overflowOf = () =>
        evalJs(
          `(() => { const m = document.getElementById("shop-modal"); return m.scrollWidth - m.clientWidth; })()`,
        );
      const BAG = [
        { itemId: "hoi_huyet_dan", qty: 20 },
        { itemId: "dai_hoi_huyet_dan", qty: 5 },
        { itemId: "lang_nha_kiem", qty: 1 },
      ];

      // =================== MUA ===================
      console.log("  [mua] ô số lượng ở từng thẻ");
      await setBag(BAG);
      await setCoin(1000);
      await openShop("buy");
      await shot("cua-hang-npc-mua");
      const nCards = await evalJs(`document.querySelectorAll("#shop-buy-list .shop-card").length`);
      const noStep = await evalJs(
        `[...document.querySelectorAll("#shop-buy-list .shop-card")].filter((c) => !c.querySelector(".qty-input") || c.querySelectorAll(".qty-btn").length !== 5).length`,
      );
      check(
        nCards >= 2 && noStep === 0,
        `${nCards} thẻ mua, thẻ nào cũng có ô gõ số + 5 nút (thiếu ở ${noStep})`,
      );
      const ids = await evalJs(
        `[...document.querySelectorAll("#shop-buy-list .qty-input")].map((i) => i.id)`,
      );
      check(
        new Set(ids).size === ids.length && ids.every(Boolean),
        `id ô số lượng duy nhất (${ids.length})`,
      );
      let c0 = await cardInfo("buy", 0);
      const unit = c0.price;
      const afford = Math.floor(1000 / unit);
      const maxBuy = Math.min(99, Math.max(1, afford));
      check(unit > 0 && c0.value === "1", `thẻ 0 "${c0.name}": giá ${unit} / cái, ô = 1`);
      check(c0.act === `Mua (${unit} 💎)` && !c0.actDisabled, `nút Mua theo số: "${c0.act}"`);
      check((await overflowOf()) <= 1, `cửa hàng không tràn ngang (${await overflowOf()})`);
      if (vp.mobile) {
        const sizes = await evalJs(
          `[...document.querySelectorAll("#shop-buy-list .shop-card:first-child .qty-btn, #shop-buy-list .shop-card:first-child .qty-input, #shop-buy-list .shop-card:first-child .shop-act-btn")].map((e) => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)])`,
        );
        check(
          sizes.every(([w, h]) => w >= MIN_TAP_PX - 0.5 && h >= MIN_TAP_PX - 0.5),
          `nút / ô của thẻ 0 đều >= ${MIN_TAP_PX} px (${JSON.stringify(sizes)})`,
        );
      }
      // hình học của thẻ: cột thông tin không bị ép hẹp, ô số lượng đủ rộng cho cả sáu phần tử, thẻ không bị kéo cao (cột phải / trái KHÔNG lấy bề rộng làm chiều cao khi xếp dọc)
      const geo = await evalJs(`(() => {
        const c = document.querySelector("#shop-buy-list .shop-card");
        const r = (e) => e.getBoundingClientRect();
        return {
          leftW: Math.round(r(c.querySelector(".shop-card-left")).width), leftH: Math.round(r(c.querySelector(".shop-card-left")).height),
          rightH: Math.round(r(c.querySelector(".shop-card-right")).height), stepW: Math.round(r(c.querySelector(".qty-stepper")).width),
          cardW: Math.round(r(c).width), cardH: Math.round(r(c).height),
        };
      })()`);
      check(
        geo.leftW >= GEO_MIN_LEFT_W &&
          geo.stepW >= GEO_MIN_STEP_W &&
          geo.leftH <= GEO_MAX_LEFT_H &&
          geo.cardH <= GEO_MAX_CARD_H,
        `bố cục thẻ không bị ép / không bị kéo cao: ${JSON.stringify(geo)}`,
      );
      // gõ 9999: kẹp đúng giới hạn (ví / giá, trần 99)
      await typeInto("buy", 0, "9999");
      c0 = await cardInfo("buy", 0);
      check(
        c0.value === String(maxBuy) &&
          new RegExp(`Chỉ có tối đa ${maxBuy}`).test(c0.note) &&
          c0.act === `Mua (${unit * maxBuy} 💎)`,
        `gõ 9999: kẹp về ${maxBuy} (ví 1000 / giá ${unit}), nút "${c0.act}", ghi chú "${c0.note}"`,
      );
      await typeInto("buy", 0, "3");
      c0 = await cardInfo("buy", 0);
      check(
        c0.act === `Mua (${unit * 3} 💎)` &&
          c0.note.startsWith(
            `Tổng ${(unit * 3).toLocaleString("vi-VN")} 💎, ví còn ${(1000 - unit * 3).toLocaleString("vi-VN")}`,
          ),
        `gõ 3: nút "${c0.act}", xem trước "${c0.note}"`,
      );
      // số sai rồi bấm Mua / Enter: không gửi gì, focus về ô
      await clearSent();
      for (const bad of ["abc", "0", "2.5", ""]) {
        await typeInto("buy", 0, bad);
        c0 = await cardInfo("buy", 0);
        check(
          c0.actDisabled && c0.act === "Nhập số lượng",
          `gõ "${bad}": nút Mua mờ "Nhập số lượng" ("${c0.act}")`,
        );
        // nút mờ không bấm được; gọi thẳng click (như Enter / hỗ trợ tiếp cận) cũng không được gửi
        await evalJs(
          `document.querySelectorAll("#shop-buy-list .shop-card")[0].querySelector(".shop-act-btn").click(); 1`,
        );
        await enterKey();
        check(
          (await sent("buy")).length === 0,
          `gõ "${bad}" rồi Mua / Enter: KHÔNG gửi mua (${(await sent("buy")).length} tin)`,
        );
      }
      // ô trống rồi bấm Mua lúc nút chưa kịp mờ (đồng bộ lại bằng click của bàn phím): focus về ô
      await typeInto("buy", 0, "3");
      await evalJs(
        `document.getElementById("shop-modal").querySelector(".shop-card .shop-act-btn").blur(); 1`,
      );
      // Enter trong ô: đúng MỘT tin mua với đúng số
      await typeInto("buy", 0, "3");
      await enterKey();
      let buys = await sent("buy");
      check(
        buys.length === 1 &&
          buys[0].npcId === NPC &&
          buys[0].qty === 3 &&
          typeof buys[0].itemId === "string",
        `gõ 3 rồi Enter: đúng MỘT buy {npcId, itemId, qty: 3} ${JSON.stringify(buys)}`,
      );
      // nút Mua bằng chuột / chạm thật với số khác
      await clearSent();
      await typeInto("buy", 0, "5");
      await clickAct("buy", 0);
      buys = await sent("buy");
      check(
        buys.length === 1 && buys[0].qty === 5,
        `gõ 5 rồi bấm nút Mua: đúng MỘT buy qty 5 ${JSON.stringify(buys)}`,
      );
      // nút ×10 / Tối đa / − bằng chuột / chạm thật
      await openShop("buy");
      const nav = (n, which) =>
        `#shop-buy-list .shop-card:nth-child(${n + 1}) .qty-btn:nth-of-type(${which})`;
      c0 = await cardInfo("buy", 0);
      const x10 = await center(`#shop-buy-list .shop-card:nth-child(1) .qty-btn-quick`);
      check(x10 && x10.hit, "nút ×10 bấm được, không bị che");
      await tap(x10.x, x10.y);
      await sleep(150);
      c0 = await cardInfo("buy", 0);
      const want10 = Math.min(maxBuy, 50); // số đang chọn trước đó là 5 (nhớ qua lần mở lại): 5 x 10
      check(Number(c0.value) === want10, `bấm ×10 từ 5: ${c0.value} (kỳ vọng ${want10})`);
      const maxBtn = await center(`#shop-buy-list .shop-card:nth-child(1) .qty-btn-max`);
      await tap(maxBtn.x, maxBtn.y);
      await sleep(150);
      c0 = await cardInfo("buy", 0);
      check(c0.value === String(maxBuy), `bấm Tối đa: ${c0.value} (kỳ vọng ${maxBuy})`);
      void nav;
      // ví đổi lúc đang gõ: vẽ lại cả danh sách, GIỮ số + focus + vị trí thẻ
      await typeInto("buy", 0, "4");
      await setCoin(900);
      await sleep(150);
      c0 = await cardInfo("buy", 0);
      check(
        c0.value === "4" && c0.focused && c0.act === `Mua (${unit * 4} 💎)`,
        `ví đổi lúc đang gõ: giữ số 4, giữ focus ("${c0.act}", focus ${c0.focused})`,
      );
      // ví co lại: giới hạn theo ví mới
      await setCoin(unit * 2 + 1);
      await sleep(150);
      c0 = await cardInfo("buy", 0);
      check(
        c0.value === "2" && c0.act === `Mua (${unit * 2} 💎)`,
        `ví chỉ đủ 2 (${unit * 2 + 1}): số kẹp về ${c0.value}, nút "${c0.act}"`,
      );
      // ví không đủ cả một cái: nút mờ "Thiếu N", ô vẫn dùng được (xem giá)
      await setCoin(unit - 1);
      await sleep(150);
      c0 = await cardInfo("buy", 0);
      check(
        c0.actDisabled && c0.act === "Thiếu 1 💎" && c0.hasStepper,
        `ví thiếu 1: nút mờ "${c0.act}"`,
      );
      await clearSent();
      await typeInto("buy", 0, "1");
      await enterKey();
      check((await sent("buy")).length === 0, "ví không đủ: Enter KHÔNG gửi mua");
      await setCoin(1000);

      // =================== BÁN ===================
      console.log("  [bán] ô số lượng ở từng thẻ");
      await setBag([...BAG]);
      await openShop("sell");
      await shot("cua-hang-npc-ban");
      let s0 = await cardInfo("sell", 0);
      check(
        s0.hasStepper && s0.value === "1" && s0.act === `Bán (+${s0.price} 💎)`,
        `thẻ bán 0 "${s0.name}": ô = 1, nút "${s0.act}"`,
      );
      check((await overflowOf()) <= 1, `tab Bán không tràn ngang (${await overflowOf()})`);
      await typeInto("sell", 0, "9999");
      s0 = await cardInfo("sell", 0);
      check(
        s0.value === "20" &&
          /Chỉ có tối đa 20/.test(s0.note) &&
          s0.act === `Bán (+${s0.price * 20} 💎)`,
        `gõ 9999: kẹp về 20 (số đang có), nút "${s0.act}", ghi chú "${s0.note}"`,
      );
      await typeInto("sell", 0, "7");
      s0 = await cardInfo("sell", 0);
      check(
        s0.note.startsWith(`Nhận ${(s0.price * 7).toLocaleString("vi-VN")} 💎`),
        `gõ 7: xem trước "${s0.note}"`,
      );
      // số sai: không bán, không mở hộp
      await clearSent();
      for (const bad of ["abc", "0", "2.5", ""]) {
        await typeInto("sell", 0, bad);
        s0 = await cardInfo("sell", 0);
        check(
          s0.actDisabled && s0.act === "Nhập số lượng",
          `bán: gõ "${bad}": nút mờ "Nhập số lượng"`,
        );
        await evalJs(
          `document.querySelectorAll("#shop-sell-list .shop-card")[0].querySelector(".shop-act-btn").click(); 1`,
        );
        await enterKey();
        check(
          (await sent("sell")).length === 0 && !(await evalJs(`window.__ui.isActConfirmOpen()`)),
          `bán: gõ "${bad}" rồi Bán / Enter: KHÔNG gửi bán, KHÔNG mở hộp`,
        );
      }
      // đồ thường: Enter gửi bán ngay đúng số
      await typeInto("sell", 0, "7");
      await enterKey();
      let sells = await sent("sell");
      check(
        sells.length === 1 && sells[0].npcId === NPC && sells[0].slot === 0 && sells[0].qty === 7,
        `gõ 7 rồi Enter: đúng MỘT sell {npcId, slot: 0, qty: 7} ${JSON.stringify(sells)}`,
      );
      check(!(await evalJs(`window.__ui.isActConfirmOpen()`)), "đồ thường: không có hộp xác nhận");
      // đồ quý: hộp xác nhận nêu ĐÚNG số đã gõ; chưa gửi cho tới khi xác nhận
      await clearSent();
      await openShop("sell");
      await typeInto("sell", 1, "3");
      await enterKey();
      const q = await evalJs(
        `(() => ({ open: window.__ui.isActConfirmOpen(), text: document.getElementById("act-confirm-text").textContent }))()`,
      );
      check(
        q.open &&
          /Bán Đại Hồi Huyết Đan ×3 được \d+ Linh thạch\?/.test(q.text) &&
          (await sent("sell")).length === 0,
        `đồ quý: Enter mở hộp "${q.text}", chưa gửi bán`,
      );
      await key("Escape", "Escape", 27);
      await sleep(200);
      check(
        !(await evalJs(`window.__ui.isActConfirmOpen()`)) && (await sent("sell")).length === 0,
        "Esc: hộp đóng, không bán",
      );
      // ngăn xếp > 99: trần 99 của máy chủ
      await setBag([{ itemId: "hoi_huyet_dan", qty: 150 }]);
      await openShop("sell");
      await typeInto("sell", 0, "9999");
      s0 = await cardInfo("sell", 0);
      check(
        s0.value === "99",
        `ngăn xếp 150: gõ 9999 kẹp về 99 (trần một lần của máy chủ) (${s0.value})`,
      );
      // đồ khoá (không bán được): không có ô
      const locked = await evalJs(
        `[...document.querySelectorAll("#shop-sell-list .shop-card.unsellable")].every((c) => !c.querySelector(".qty-input"))`,
      );
      check(locked, "đồ không bán được: không có ô số lượng");
      await evalJs(`window.__ui.closeAllModals()`);
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
