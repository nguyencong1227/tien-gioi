import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm hộp xác nhận BÁN đồ quý / trang bị ở cửa hàng (issue #779, docs/RA_SOAT_THAO_TAC.md hàng 2; `act-confirm.ts`: `sellPlan`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-sell-confirm.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Túi có đồ thường (Hồi Huyết Đan), đồ quý (Đại Hồi Huyết Đan) và trang bị (Lang Nha Kiếm); chạm / bấm nút "Bán (+N)" THẬT:
 *   - đồ thường: gửi `sell` ngay, KHÔNG hộp;
 *   - đồ quý: hộp nêu "Bán <tên> ×N được M Linh thạch?" + nhắc mua lại tốn hơn; focus ở "Giữ lại"; bấm "Bán" NGAY khi hộp vừa mở (click ma) bị bỏ qua; sau cửa sổ chống click ma: đúng MỘT tin `sell`;
 *   - "Giữ lại" / Esc (đóng hộp trước, cửa hàng còn mở) / X: không bán; trang bị cũng có hộp;
 *   - túi đổi giữa lúc hộp mở: xác nhận huỷ + thông báo, không bán món khác; cửa hàng đóng thì hộp đóng theo.
 * `--shots`: lưu ảnh hộp mỗi khung nhìn.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-sell-confirm-"));
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

      // ---- dữ liệu: túi có đồ thường (hoi_huyet_dan x20), đồ quý (dai_hoi_huyet_dan x5), trang bị (lang_nha_kiem), mở cửa hàng ở tab Bán ----
      await evalJs(`(() => {
        window.__sent = [];
        window.__scene.room.send = (t, m) => { window.__sent.push([t, m]); };
        return 1;
      })()`);
      const setBag = (slots) =>
        evalJs(
          `(() => { window.__ui.onInv({ slots: ${JSON.stringify(slots)}, cd: {} }); return 1; })()`,
        );
      const BAG = [
        { itemId: "hoi_huyet_dan", qty: 20 },
        { itemId: "dai_hoi_huyet_dan", qty: 5 },
        { itemId: "lang_nha_kiem", qty: 1 },
      ];
      const sold = () => evalJs(`window.__sent.filter((m) => m[0] === "sell").map((m) => m[1])`);
      const box = () =>
        evalJs(`(() => ({
          open: window.__ui.isActConfirmOpen(),
          text: document.getElementById("act-confirm-text").textContent,
          warn: document.getElementById("act-confirm-warn").hidden ? "" : document.getElementById("act-confirm-warn").textContent,
          yes: document.getElementById("act-btn-yes-label").textContent,
          no: document.getElementById("act-btn-no-label").textContent,
          active: document.activeElement?.id ?? "",
        }))()`);
      /** Chỉ số thẻ trong danh sách Bán của món có tên chứa `name` */
      const cardOf = (name) =>
        evalJs(
          `(() => { const cs = [...document.querySelectorAll("#shop-sell-list .shop-card")]; return cs.findIndex((c) => c.querySelector(".shop-item-name")?.textContent.includes(${JSON.stringify(name)})); })()`,
        );
      const sellBtnOf = async (name) => {
        const i = await cardOf(name);
        return i < 0
          ? null
          : center(`#shop-sell-list .shop-card:nth-child(${i + 1}) .shop-act-btn.sell`);
      };
      const openShop = async () => {
        await evalJs(`window.__ui.closeAllModals()`);
        await setBag(BAG);
        await evalJs(
          `(() => { const sc = window.__scene, n = window.__craftData.NPC_BY_ID.lai_buon_suong; sc.predX = n.x; sc.predY = n.y; sc.cameras.main.centerOn(n.x, n.y); window.__ui.openShopModal("lai_buon_suong"); return 1; })()`,
        );
        await sleep(300);
        await evalJs(
          `document.getElementById("tab-shop-sell").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))`,
        );
        await sleep(300);
      };

      console.log("  [1] đồ thường: bán thẳng, không hộp");
      await openShop();
      let b = await sellBtnOf("Hồi Huyết Đan");
      check(b && b.hit, "nút Bán của Hồi Huyết Đan (đồ thường) bấm được");
      await tap(b.x, b.y);
      await sleep(250);
      let s1 = await sold();
      check(
        !(await box()).open && s1.length === 1 && s1[0].qty === 1,
        `đồ thường: gửi bán ngay, không hỏi (${JSON.stringify(s1)})`,
      );

      console.log(
        "  [2] đồ quý: hộp xác nhận nêu tên + số lượng + Linh thạch + nhắc mua lại tốn hơn",
      );
      await evalJs(`window.__sent.length = 0`);
      await openShop();
      // tăng số lượng lên 3 bằng nút + của ô số lượng dùng chung (mục 47)
      const iq = await cardOf("Đại Hồi Huyết Đan");
      for (let k = 0; k < 2; k++) {
        // nút "+" tăng số lượng ở pointerdown (giữ để tăng nhanh): chạm / bấm THẬT
        const plus = await center(
          `#shop-sell-list .shop-card:nth-child(${iq + 1}) [data-nav$=":plus"]`,
        );
        await tap(plus.x, plus.y);
        await sleep(300);
      }
      b = await sellBtnOf("Đại Hồi Huyết Đan");
      check(b && b.hit, "nút Bán của Đại Hồi Huyết Đan (đồ quý) bấm được");
      await tap(b.x, b.y);
      await sleep(100);
      let st = await box();
      check(st.open, "đồ quý: hộp xác nhận mở");
      check(
        /Bán Đại Hồi Huyết Đan ×3 được \d+ Linh thạch\?/.test(st.text),
        `câu hỏi: "${st.text}"`,
      );
      check(/Đồ quý: .*mua lại tốn hơn/.test(st.warn), `nhắc: "${st.warn}"`);
      check(st.yes === "Bán" && st.no === "Giữ lại", `nút: "${st.no}" / "${st.yes}"`);
      check(st.active === "act-btn-no", `focus ở "Giữ lại" (${st.active})`);
      check((await sold()).length === 0, "chưa gửi bán khi chưa xác nhận");
      const yesBtn = await center("#act-btn-yes");
      check(
        yesBtn.hit && (!vp.mobile || (yesBtn.w >= 44 && yesBtn.h >= 44)),
        `nút Bán trong hộp bấm được, không bị che (${Math.round(yesBtn.w)}x${Math.round(yesBtn.h)})`,
      );
      await tap(yesBtn.x, yesBtn.y);
      await sleep(200);
      check(
        (await box()).open && (await sold()).length === 0,
        "bấm NGAY khi hộp vừa mở (click ma): bị bỏ qua",
      );
      await shot("ban-do-quy"); // chụp SAU phép kiểm click ma (chụp ảnh tốn hơn cửa sổ chống click ma 450 ms)
      await sleep(560);
      await tap(yesBtn.x, yesBtn.y);
      await sleep(250);
      let s2 = await sold();
      check(
        !(await box()).open &&
          s2.length === 1 &&
          s2[0].qty === 3 &&
          s2[0].npcId === "lai_buon_suong",
        `xác nhận sau cửa sổ chống click ma: đúng MỘT tin bán qty 3 (${JSON.stringify(s2)})`,
      );

      console.log("  [3] 'Giữ lại' / Esc / X: không bán");
      await evalJs(`window.__sent.length = 0`);
      await openShop();
      b = await sellBtnOf("Đại Hồi Huyết Đan");
      await tap(b.x, b.y);
      await sleep(300);
      await sleep(300); // qua cửa sổ chống click ma (450 ms) của CẢ HAI nút trong hộp
      const no = await center("#act-btn-no");
      await tap(no.x, no.y);
      await sleep(560); // qua cửa sổ chặn click ma sau khi hộp đóng, để bấm nút Bán lần nữa được tính
      check(!(await box()).open && (await sold()).length === 0, "'Giữ lại': hộp đóng, không bán");
      b = await sellBtnOf("Đại Hồi Huyết Đan");
      await tap(b.x, b.y);
      await sleep(300);
      await key("Escape", "Escape", 27);
      await sleep(560); // qua cửa sổ chặn click ma sau khi hộp đóng, để bấm nút Bán lần nữa được tính
      check(
        !(await box()).open && (await sold()).length === 0,
        "Esc: hộp đóng, không bán, cửa hàng VẪN mở",
      );
      check(
        await evalJs(`!document.getElementById("shop-modal").hidden`),
        "cửa hàng còn mở sau Esc đầu (Esc đóng hộp trước)",
      );
      b = await sellBtnOf("Đại Hồi Huyết Đan");
      await tap(b.x, b.y);
      await sleep(300);
      await key("KeyX", "x", 88);
      await sleep(560); // qua cửa sổ chặn click ma sau khi hộp đóng, để bấm nút Bán lần nữa được tính
      check(!(await box()).open && (await sold()).length === 0, "phím X: giữ lại");

      console.log("  [4] trang bị: có hộp");
      await evalJs(`window.__sent.length = 0`);
      await openShop();
      b = await sellBtnOf("Lang Nha Kiếm");
      check(b && b.hit, "nút Bán của Lang Nha Kiếm (trang bị) bấm được");
      await tap(b.x, b.y);
      await sleep(300);
      st = await box();
      check(
        st.open && /Bán Lang Nha Kiếm được \d+ Linh thạch\?/.test(st.text),
        `trang bị: hộp mở "${st.text}"`,
      );
      check(/Trang bị/.test(st.warn), `nhắc: "${st.warn}"`);
      await key("KeyX", "x", 88);
      await sleep(200);

      console.log("  [5] túi đổi giữa lúc hộp mở: xác nhận bị huỷ, không bán món khác");
      await evalJs(`window.__sent.length = 0`);
      await openShop();
      b = await sellBtnOf("Đại Hồi Huyết Đan");
      await tap(b.x, b.y);
      await sleep(600);
      // ô đại hồi huyết đan vừa bị dùng hết (máy chủ gửi lại túi)
      await setBag([
        { itemId: "hoi_huyet_dan", qty: 20 },
        null,
        { itemId: "lang_nha_kiem", qty: 1 },
      ]);
      await sleep(200);
      const y5 = await center("#act-btn-yes");
      if (y5) await tap(y5.x, y5.y);
      await sleep(300);
      const toasts = await evalJs(
        `[...document.querySelectorAll("#toast p")].map((p) => p.textContent)`,
      );
      check(
        !(await box()).open &&
          (await sold()).length === 0 &&
          toasts.some((t) => t.includes("Túi vừa đổi")),
        `món đã đổi: huỷ + thông báo, không gửi bán (${JSON.stringify(toasts)})`,
      );

      console.log("  [6] cửa hàng đóng (đi xa NPC) giữa lúc hộp mở: hộp đóng theo");
      await openShop();
      b = await sellBtnOf("Đại Hồi Huyết Đan");
      await tap(b.x, b.y);
      await sleep(300);
      check((await box()).open, "hộp mở");
      await evalJs(`window.__ui.toggleShopModal(false)`);
      await sleep(200);
      check(!(await box()).open, "cửa hàng đóng: hộp xác nhận bán cũng đóng");
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
