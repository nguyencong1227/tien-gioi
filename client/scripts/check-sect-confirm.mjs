/* global console, setTimeout, Buffer */
/**
 * Kiểm hộp xác nhận LẬP tông môn và NỘP Linh thạch vào kho (issue #779, docs/RA_SOAT_THAO_TAC.md hàng 13-14; `act-confirm.ts`: `sectCreatePlan` / `sectDepositPlan`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-sect-confirm.mjs [--shots <thư mục>] [--vp <khung>] [--slow-frame <ms>]
 *   (`--slow-frame <ms>` / `TG_SLOW_FRAME_MS`: mỗi khung hình trang bận `ms` ms (`slow-frame.mjs`) để thử khung chậm 25-50 ms, nhiều lõi VÀ một lõi `taskset -c 0`.)
 *
 * Dựng bảng Tông môn bằng `window.__ui.onSect` / `onWallet` (dữ liệu giả), bắt tin gửi đi bằng cách đè `window.__scene.room.send`:
 *   - Lập (ví đủ): hộp nêu tên + biệt hiệu + phí + số dư còn lại + "không hoàn lại"; focus ở "Chưa"; bấm "Lập" NGAY khi hộp vừa mở (click ma) bị bỏ qua; sau cửa sổ chống click ma: đúng MỘT tin `sectCreate`;
 *     "Chưa" / Esc (chỉ đóng hộp, bảng Tông môn còn mở) / X: không gửi; click ma ngay sau khi đóng hộp không mở lại hộp; Enter trong ô nhập (bàn phím) cũng mở hộp;
 *     ví không đủ: gửi thẳng (chưa mất gì); ví đổi giữa lúc hộp mở: huỷ + báo, không gửi;
 *   - Nộp (Đệ tử / Trưởng lão: KHÔNG rút lại được): hộp nêu số tiền + "chỉ Tông chủ rút được"; "Giữ lại" không gửi và GIỮ số đã nhập; xác nhận: đúng MỘT tin `sectDeposit`;
 *     Tông chủ (rút lại được) nộp thẳng, không hộp; nộp quá ví: gửi thẳng; không còn ở tông môn giữa lúc hộp mở: huỷ + báo; bảng đóng thì hộp đóng theo.
 * `--shots`: lưu ảnh hộp mỗi khung nhìn.
 */
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
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { launchChrome } from "./chrome-launch.mjs";
import { waitUntilTrue } from "./chrome-wait.mjs";
import { slowFrameMs, slowFrameSource } from "./slow-frame.mjs";

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
  let failures = 0;
  const check = (ok, msg) => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
    if (!ok) failures++;
  };
  let launched = null;
  try {
    launched = await launchChrome({ name: "sect-confirm" });
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
      source: `try { localStorage.setItem('tg_newbie_guide_dismissed','1'); localStorage.setItem('tg_quality','low'); } catch (e) {}${slowFrameSource(slowFrameMs())}`,
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
      const ready = Boolean(
        await waitUntilTrue(async () =>
          Boolean(
            await evalJs(
              `Boolean(!window.__isOldPage && window.__getMap && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
            ),
          ),
        ),
      );
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

      // ---- dữ liệu giả ----
      await evalJs(`(() => {
        window.__sent = [];
        window.__scene.room.send = (t, m) => { window.__sent.push([t, m]); };
        return 1;
      })()`);
      const NOW = Date.now();
      const sectOf = (rank) => ({
        sect: {
          name: "Thanh Vân",
          tag: "TV",
          motd: "",
          myRank: rank,
          members: [{ name: "Mộc Thanh", rank: "chu", joinedAt: NOW - 86400000 }],
          coin: 0,
          log: [],
          createdAt: NOW - 86400000,
        },
      });
      const setCoin = (coin) =>
        evalJs(`(() => { window.__ui.onWallet({ coin: ${coin} }); return 1; })()`);
      const setSect = (rank) =>
        evalJs(
          `(() => { window.__ui.onSect(${rank ? JSON.stringify(sectOf(rank)) : "{ sect: null }"}); return 1; })()`,
        );
      const sentOf = (re) => evalJs(`window.__sent.filter((m) => ${re}.test(m[0]))`);
      const box = () =>
        evalJs(`(() => ({
          open: window.__ui.isActConfirmOpen(),
          text: document.getElementById("act-confirm-text").textContent,
          warn: document.getElementById("act-confirm-warn").hidden ? "" : document.getElementById("act-confirm-warn").textContent,
          yes: document.getElementById("act-btn-yes-label").textContent,
          no: document.getElementById("act-btn-no-label").textContent,
          active: document.activeElement?.id ?? "",
        }))()`);
      const fill = (id, value) =>
        evalJs(
          `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`,
        );
      const val = (id) => evalJs(`document.getElementById(${JSON.stringify(id)}).value`);
      const toastTexts = () =>
        evalJs(`[...document.querySelectorAll("#toast p")].map((p) => p.textContent)`);
      const sectOpen = () => evalJs(`window.__ui.isSectModalOpen()`);
      /** Về trạng thái sạch: không hộp, tin đã bắt xoá, bảng Tông môn mở ở màn lập (chưa có tông môn) hoặc ở tab Kho */
      const reset = async ({ rank = null, coin = 5000 } = {}) => {
        await evalJs(
          `window.__sent.length = 0; window.__ui.closeActConfirm(false); document.getElementById("toast").replaceChildren(); 1`,
        );
        await setCoin(coin);
        await setSect(rank);
        await evalJs(`window.__ui.toggleSectModal(false); window.__ui.toggleSectModal(true); 1`);
        if (rank) await evalJs(`window.__ui.switchSectTab("treasury"); 1`);
        await sleep(350);
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
      };
      const SENT_CREATE = /^sectCreate$/;
      const SENT_DEP = /^sectDeposit$/;

      console.log(
        "  [1] Lập (ví đủ): hộp nêu tên + biệt hiệu + phí + số dư còn lại; chưa gửi gì khi chưa xác nhận",
      );
      await reset();
      await fill("sect-input-name", "Tiêu Dao Phái");
      await fill("sect-input-tag", "TD");
      let b = await center("#sect-btn-create");
      check(
        b && b.hit && (!vp.mobile || b.h >= MIN_TAP_PX),
        `nút Lập bấm được, không bị che (${Math.round(b?.w)}x${Math.round(b?.h)})`,
      );
      await tap(b.x, b.y);
      await sleep(150);
      let st = await box();
      check(st.open, "hộp xác nhận mở");
      check(
        st.text === "Lập tông môn «Tiêu Dao Phái» [TD]? Tốn 1.000 Linh thạch (còn lại 4.000).",
        `câu hỏi: "${st.text}"`,
      );
      check(/không hoàn lại, kể cả khi giải tán/.test(st.warn), `nhắc: "${st.warn}"`);
      check(st.yes === "Lập" && st.no === "Chưa", `nút: "${st.no}" / "${st.yes}"`);
      check(st.active === "act-btn-no", `focus ở "Chưa" (${st.active})`);
      check((await sentOf(SENT_CREATE)).length === 0, "chưa gửi sectCreate khi chưa xác nhận");
      const yes1 = await center("#act-btn-yes");
      check(
        yes1.hit && (!vp.mobile || (yes1.w >= MIN_TAP_PX && yes1.h >= MIN_TAP_PX)),
        `nút Lập trong hộp bấm được (${Math.round(yes1.w)}x${Math.round(yes1.h)})`,
      );
      await shot("lap-tong-mon");
      // KHÔNG phụ thuộc đồng hồ: đóng hộp bằng "Chưa" (SAU cửa sổ chống click ma; ngủ dài hơn chỉ an toàn hơn), rồi MỞ LẠI hộp và bấm "Lập" trong CÙNG MỘT lượt JS của trang (độ trễ ~0 ms, không qua CDP):
      // cú bấm luôn rơi trong cửa sổ ACT_CONFIRM_GUARD_MS (450 ms) dù runner chậm (trước đây tap() chạy SAU khi mở hộp nên trên runner CI không GPU cú bấm trễ quá cửa sổ và được tính là thật)
      await sleep(560);
      const no1 = await center("#act-btn-no");
      await tap(no1.x, no1.y);
      await evalJs(
        `(() => { const pd = (id) => document.getElementById(id).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 })); document.getElementById("sect-btn-create").click(); pd("act-btn-yes"); return 1; })()`,
      );
      check(
        (await box()).open && (await sentOf(SENT_CREATE)).length === 0,
        "bấm xác nhận NGAY khi hộp vừa mở (click ma): bị bỏ qua",
      );
      await sleep(560);
      await tap(yes1.x, yes1.y);
      await sleep(300);
      let m = await sentOf(SENT_CREATE);
      check(
        !(await box()).open &&
          m.length === 1 &&
          JSON.stringify(m[0][1]) === '{"name":"Tiêu Dao Phái","tag":"TD"}',
        `xác nhận: đúng MỘT tin sectCreate đúng nội dung (${JSON.stringify(m)})`,
      );

      console.log(
        "  [2] 'Chưa' / Esc / X: không gửi; Esc chỉ đóng hộp; click ma sau khi đóng không mở lại hộp",
      );
      await reset();
      await fill("sect-input-name", "Tiêu Dao Phái");
      await fill("sect-input-tag", "TD");
      b = await center("#sect-btn-create");
      await tap(b.x, b.y);
      await sleep(600);
      // click ma: ngay sau khi hộp đóng, một cú bấm chuột / chạm rơi xuống nút Lập nằm dưới hộp: không được mở lại hộp. Cùng MỘT lượt JS (không phụ thuộc đồng hồ): đóng bằng "Chưa" rồi click CHUỘT (detail 1)
      await evalJs(
        `(() => { const pd = (id) => document.getElementById(id).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 })); pd("act-btn-no"); document.getElementById("sect-btn-create").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })); return 1; })()`,
      );
      await sleep(150);
      check(
        !(await box()).open && (await sentOf(SENT_CREATE)).length === 0,
        "'Chưa' rồi click ma: hộp KHÔNG mở lại, không gửi",
      );
      check(
        (await val("sect-input-name")) === "Tiêu Dao Phái",
        "tên đã nhập còn nguyên (nhập lại được)",
      );
      await sleep(560);
      b = await center("#sect-btn-create");
      await tap(b.x, b.y);
      await sleep(300);
      await key("Escape", "Escape", 27);
      await sleep(600);
      check(
        !(await box()).open && (await sentOf(SENT_CREATE)).length === 0 && (await sectOpen()),
        "Esc: hộp đóng, không gửi, bảng Tông môn VẪN mở",
      );
      b = await center("#sect-btn-create");
      await tap(b.x, b.y);
      await sleep(300);
      await key("KeyX", "x", 88);
      await sleep(600);
      check(!(await box()).open && (await sentOf(SENT_CREATE)).length === 0, "phím X: giữ lại");

      console.log(
        "  [3] bàn phím: Enter trong ô nhập mở hộp; Y (sau cửa sổ chống click ma) mới gửi",
      );
      await reset();
      await fill("sect-input-name", "Tiêu Dao Phái");
      await fill("sect-input-tag", "TD");
      await evalJs(`document.getElementById("sect-input-tag").focus(); 1`);
      await enterKey();
      await sleep(300);
      check(
        (await box()).open && (await sentOf(SENT_CREATE)).length === 0,
        "Enter trong ô biệt hiệu: hộp mở, chưa gửi",
      );
      await sleep(400);
      await key("KeyY", "y", 89);
      await sleep(400);
      check(!(await box()).open && (await sentOf(SENT_CREATE)).length === 1, "Y: gửi đúng một tin");

      console.log(
        "  [4] ví không đủ phí: gửi thẳng (chưa mất gì, máy chủ báo lý do); ví đổi giữa lúc hộp mở: huỷ + báo",
      );
      await reset({ coin: 500 });
      await fill("sect-input-name", "Tiêu Dao Phái");
      await fill("sect-input-tag", "TD");
      b = await center("#sect-btn-create");
      await tap(b.x, b.y);
      await sleep(300);
      check(
        !(await box()).open && (await sentOf(SENT_CREATE)).length === 1,
        "ví 500 < 1.000: không hộp, gửi thẳng",
      );
      await reset({ coin: 5000 });
      await fill("sect-input-name", "Tiêu Dao Phái");
      await fill("sect-input-tag", "TD");
      b = await center("#sect-btn-create");
      await tap(b.x, b.y);
      await sleep(600);
      check((await box()).open, "hộp mở");
      await setCoin(500);
      const y4 = await center("#act-btn-yes");
      await tap(y4.x, y4.y);
      await sleep(400);
      const t4 = await toastTexts();
      check(
        !(await box()).open &&
          (await sentOf(SENT_CREATE)).length === 0 &&
          t4.some((t) => t.includes("vừa đổi, chưa lập gì")),
        `ví đổi: huỷ + báo, không gửi (${JSON.stringify(t4)})`,
      );

      console.log(
        "  [5] Nộp kho (Đệ tử, KHÔNG rút lại được): hộp nêu số tiền + 'chỉ Tông chủ rút được'; 'Giữ lại' giữ số đã nhập",
      );
      await reset({ rank: "de_tu", coin: 3000 });
      await fill("sect-input-deposit", "200");
      b = await center("#sect-btn-deposit");
      check(
        b && b.hit && (!vp.mobile || b.h >= MIN_TAP_PX),
        `nút Góp bấm được, không bị che (${Math.round(b?.w)}x${Math.round(b?.h)})`,
      );
      await tap(b.x, b.y);
      await sleep(150);
      st = await box();
      check(st.open && st.text === "Nộp 200 Linh thạch vào kho tông môn?", `câu hỏi: "${st.text}"`);
      check(
        /Chỉ Tông chủ rút được/.test(st.warn) && st.yes === "Nộp" && st.no === "Giữ lại",
        `nhắc "${st.warn}", nút "${st.no}" / "${st.yes}"`,
      );
      check(
        st.active === "act-btn-no" && (await sentOf(SENT_DEP)).length === 0,
        "focus ở 'Giữ lại'; chưa gửi",
      );
      await shot("nop-kho-de-tu");
      await sleep(560);
      // cùng MỘT lượt JS (không phụ thuộc đồng hồ): đóng bằng "Giữ lại" rồi click CHUỘT (detail 1) vào nút Góp nằm dưới hộp
      await evalJs(
        `(() => { const pd = (id) => document.getElementById(id).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 })); pd("act-btn-no"); document.getElementById("sect-btn-deposit").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })); return 1; })()`,
      );
      await sleep(150);
      check(
        !(await box()).open && (await sentOf(SENT_DEP)).length === 0,
        "'Giữ lại' rồi click ma: hộp KHÔNG mở lại, không gửi",
      );
      check((await val("sect-input-deposit")) === "200", "số đã nhập còn nguyên");
      await sleep(560);
      b = await center("#sect-btn-deposit");
      await tap(b.x, b.y);
      await sleep(600);
      const y5 = await center("#act-btn-yes");
      await tap(y5.x, y5.y);
      await sleep(300);
      m = await sentOf(SENT_DEP);
      check(
        !(await box()).open && m.length === 1 && JSON.stringify(m[0][1]) === '{"amount":200}',
        `xác nhận: đúng MỘT tin sectDeposit amount 200 (${JSON.stringify(m)})`,
      );
      check((await val("sect-input-deposit")) === "", "ô nhập được xoá sau khi nộp");

      console.log(
        "  [6] Tông chủ (rút lại được) nộp THẲNG; nộp quá ví: gửi thẳng; Trưởng lão cũng được hỏi",
      );
      await reset({ rank: "chu", coin: 3000 });
      await fill("sect-input-deposit", "200");
      b = await center("#sect-btn-deposit");
      await tap(b.x, b.y);
      await sleep(300);
      m = await sentOf(SENT_DEP);
      check(
        !(await box()).open && m.length === 1 && JSON.stringify(m[0][1]) === '{"amount":200}',
        "Tông chủ: KHÔNG hộp, gửi thẳng",
      );
      await reset({ rank: "de_tu", coin: 3000 });
      await fill("sect-input-deposit", "9000");
      // Ô số lượng dùng chung (mục 47): gõ quá ví thì KẸP về ví, ghi đè lại ô và báo bằng chữ; hộp xác nhận hỏi đúng số đã kẹp (không gửi số quá ví)
      check(
        (await val("sect-input-deposit")) === "3000",
        `nộp 9.000 > ví 3.000: ô bị kẹp về 3000 (${await val("sect-input-deposit")})`,
      );
      check(
        (
          await evalJs(`document.querySelector("#sect-deposit-qty .qty-note")?.textContent ?? ""`)
        ).includes("Chỉ có tối đa 3.000"),
        "nộp quá ví: chữ báo 'Chỉ có tối đa 3.000'",
      );
      b = await center("#sect-btn-deposit");
      await tap(b.x, b.y);
      await sleep(300);
      check(
        (await box()).open &&
          /^Nộp 3\.?000 Linh thạch vào kho tông môn\?$/.test((await box()).text),
        `nộp quá ví: hộp hỏi đúng số đã kẹp: "${(await box()).text}"`,
      );
      check(
        (await sentOf(SENT_DEP)).length === 0,
        "nộp quá ví: chưa gửi gì khi hộp còn mở (không bao giờ gửi số quá ví)",
      );
      await key("Escape", "Escape", 27);
      await sleep(500);
      await reset({ rank: "truong_lao", coin: 3000 });
      await fill("sect-input-deposit", "50");
      b = await center("#sect-btn-deposit");
      await tap(b.x, b.y);
      await sleep(300);
      check(
        (await box()).open && (await box()).text === "Nộp 50 Linh thạch vào kho tông môn?",
        "Trưởng lão (cũng không rút được): có hộp",
      );
      await key("Escape", "Escape", 27);
      await sleep(500);

      console.log(
        "  [7] giữa lúc hộp mở: không còn ở tông môn -> huỷ + báo; bảng Tông môn đóng -> hộp đóng theo",
      );
      await reset({ rank: "de_tu", coin: 3000 });
      await fill("sect-input-deposit", "200");
      b = await center("#sect-btn-deposit");
      await tap(b.x, b.y);
      await sleep(600);
      check((await box()).open, "hộp mở");
      await setSect(null);
      await sleep(200);
      const y7 = await center("#act-btn-yes");
      await tap(y7.x, y7.y);
      await sleep(400);
      const t7 = await toastTexts();
      check(
        !(await box()).open &&
          (await sentOf(SENT_DEP)).length === 0 &&
          t7.some((t) => t.includes("vừa đổi, chưa nộp gì")),
        `rời tông môn: huỷ + báo, không gửi (${JSON.stringify(t7)})`,
      );
      await reset({ rank: "de_tu", coin: 3000 });
      await fill("sect-input-deposit", "200");
      b = await center("#sect-btn-deposit");
      await tap(b.x, b.y);
      await sleep(300);
      check((await box()).open, "hộp mở");
      await evalJs(`window.__ui.toggleSectModal(false); 1`);
      await sleep(200);
      check(!(await box()).open, "bảng Tông môn đóng: hộp xác nhận cũng đóng");

      console.log(
        "  [8] ô SỐ LƯỢNG dùng chung (mục 47): gõ, kẹp theo ví, ×10 / ×100 / Tối đa, giữ nút tăng nhanh dần, Enter / Esc, không điều khiển nhân vật",
      );
      await reset({ rank: "chu", coin: 3000 });
      const qtyInfo = () =>
        evalJs(`(() => {
          const root = document.getElementById("sect-deposit-qty");
          const inp = document.getElementById("sect-input-deposit");
          const btns = [...root.querySelectorAll("button")];
          const modal = document.getElementById("sect-modal");
          return {
            im: inp.getAttribute("inputmode"), pat: inp.getAttribute("pattern"), ac: inp.getAttribute("autocomplete"),
            label: inp.getAttribute("aria-label"), type: inp.type, value: inp.value, invalid: inp.getAttribute("aria-invalid"),
            note: root.querySelector(".qty-note")?.textContent ?? "", btns: btns.map((b) => b.textContent), dis: btns.map((b) => b.disabled),
            inputH: inp.getBoundingClientRect().height, btnH: btns.map((b) => Math.round(b.getBoundingClientRect().height)),
            btnW: btns.map((b) => Math.round(b.getBoundingClientRect().width)), overflow: modal.scrollWidth - modal.clientWidth,
          };
        })()`);
      const typeText = async (text) => {
        await evalJs(
          `(() => { const e = document.getElementById("sect-input-deposit"); e.focus(); e.value = ""; e.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`,
        );
        await send("Input.insertText", { text });
        await sleep(80);
      };
      let q = await qtyInfo();
      check(
        q.im === "numeric" &&
          q.pat === "[0-9]*" &&
          q.ac === "off" &&
          q.type === "text" &&
          Boolean(q.label),
        `ô gõ: inputmode numeric (bàn phím số trên điện thoại), pattern, autocomplete tắt, có nhãn (${q.im} / ${q.pat})`,
      );
      check(
        JSON.stringify(q.btns) === JSON.stringify(["−", "+", "×10", "×100", "Tối đa"]),
        `năm nút: ${JSON.stringify(q.btns)}`,
      );
      if (vp.mobile)
        check(
          q.btnH.every((h) => h >= MIN_TAP_PX) &&
            q.inputH >= MIN_TAP_PX &&
            q.btnW.every((w) => w >= MIN_TAP_PX),
          `nút và ô gõ >= ${MIN_TAP_PX} px (ô ${Math.round(q.inputH)}, nút cao ${q.btnH}, rộng ${q.btnW})`,
        );
      check(q.overflow <= 1, `ô số lượng không làm tràn ngang bảng (${q.overflow})`);
      // gõ quá ví: kẹp + báo bằng chữ + ghi đè lại ô
      await typeText("9999");
      q = await qtyInfo();
      check(
        q.value === "3000" && q.note.includes("Chỉ có tối đa 3.000"),
        `gõ 9999 > ví 3.000: kẹp về ${q.value}, báo "${q.note}"`,
      );
      check(
        q.dis[1] && q.dis[2] && q.dis[3] && q.dis[4] && !q.dis[0],
        "chạm trần: khoá +, ×10, ×100, Tối đa; còn −",
      );
      // gõ sai: chữ / số âm / SỐ LẺ (A review #983: "2.5" từng bị đọc thành 25 rồi kẹp về cả ví); ô GIỮ NGUYÊN chữ, không ghi đè
      for (const bad of ["abc", "-5", "2.5", "1,5", "12.34"]) {
        await typeText(bad);
        q = await qtyInfo();
        check(
          q.invalid === "true" && q.note !== "" && q.value === bad,
          `gõ "${bad}": đánh dấu sai, báo "${q.note}", ô giữ nguyên "${q.value}"`,
        );
      }
      await typeText("12");
      q = await qtyInfo();
      check(
        q.invalid === null && q.note.includes("Ví còn lại 2.988"),
        `gõ 12: hết lỗi, xem trước: "${q.note}"`,
      );
      await evalJs(
        `document.getElementById("sect-input-deposit").scrollIntoView({ block: "center" }); 1`,
      );
      await shot("o-so-luong");
      // nút bằng chạm / chuột thật
      const press = async (i) => {
        const c = await center("#sect-deposit-qty button", i);
        check(c && c.hit, `nút ${["−", "+", "×10", "×100", "Tối đa"][i]} không bị che`);
        await tap(c.x, c.y);
        await sleep(120);
        return (await qtyInfo()).value;
      };
      check((await press(1)) === "13", "bấm + : 12 -> 13");
      check((await press(2)) === "130", "bấm ×10 : 13 -> 130");
      check((await press(3)) === "3000", "bấm ×100 : 130 -> 13000 bị kẹp về ví 3000");
      check((await press(0)) === "2999", "bấm − : 3000 -> 2999");
      check((await press(4)) === "3000", "bấm Tối đa : 3000 (= ví)");
      // giữ nút +: nhanh dần; nhả thì dừng. Nhịp giữ nút theo CHỈ SỐ bước (qtyHoldStep: +1 x6, +5 x6, +10 x8, ...); thời gian thật chỉ quyết định BAO LÂU tới bước kế. Nên kiểm HÌNH DẠNG chuỗi bước ghi trong
      // trang (mẫu 10 ms) và chờ theo ĐIỀU KIỆN, không đếm số lần trong đúng 1,7 s (runner CI chậm chỉ đạt 13 so với ngưỡng 20 của kiểm cũ)
      await fill("sect-input-deposit", "1");
      const hc = await center("#sect-deposit-qty button", 1);
      await evalJs(
        `(() => { const inp = document.getElementById("sect-input-deposit"); window.__qtyTrace = []; window.__qtyTimer = setInterval(() => { const v = Number(inp.value); const l = window.__qtyTrace[window.__qtyTrace.length - 1]; if (!l || l.v !== v) window.__qtyTrace.push({ v, t: performance.now() }); }, 10); return 1; })()`,
      );
      if (vp.mobile)
        await send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: hc.x, y: hc.y }],
        });
      else {
        await send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: hc.x,
          y: hc.y,
          button: "none",
          buttons: 0,
        });
        await mouse("mousePressed", hc.x, hc.y);
      }
      let heldAt = 0;
      for (let i = 0; i < 120 && heldAt < 40; i++) {
        await sleep(100);
        heldAt = Number((await qtyInfo()).value);
      }
      if (vp.mobile) await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      else await mouse("mouseReleased", hc.x, hc.y);
      await sleep(150);
      const afterRelease = Number((await qtyInfo()).value);
      await sleep(700);
      const later = Number((await qtyInfo()).value);
      const trace = JSON.parse(
        await evalJs(
          `(() => { clearInterval(window.__qtyTimer); return JSON.stringify(window.__qtyTrace); })()`,
        ),
      );
      const vals = trace.map((x) => x.v);
      const deltas = vals.slice(1).map((v, i) => v - vals[i]);
      check(
        heldAt >= 40,
        `giữ +: lên tới ${heldAt} (chờ theo điều kiện tối đa 12 s, không theo 1,7 s cố định)`,
      );
      check(
        deltas.length >= 8 &&
          deltas[0] === 1 &&
          deltas.every((d, i) => i === 0 || d >= deltas[i - 1]) &&
          Math.max(...deltas) >= 5,
        `giữ +: tăng NHANH dần theo nhịp (bước ${[...new Set(deltas)].join(" -> ")}, không bao giờ chậm lại)`,
      );
      // (Độ trễ lặp 380 ms KHÔNG kiểm ở đây: đo bằng mốc thời gian của bộ lấy mẫu 10 ms thì CPU runner bận làm mốc lệch, CI đỏ 'lặp đầu sau 180 / 242 ms'; hằng QTY_HOLD_DELAY_MS đã có test đơn vị `qty-input.test.ts`.)
      check(
        later === afterRelease,
        `nhả nút thì dừng hẳn (${afterRelease} -> ${later} sau 0,7 giây)`,
      );
      // Enter = xác nhận (Tông chủ nộp thẳng), ô được xoá sau khi gửi
      await reset({ rank: "chu", coin: 3000 });
      await typeText("250");
      await enterKey();
      await sleep(300);
      m = await sentOf(SENT_DEP);
      check(
        m.length === 1 &&
          JSON.stringify(m[0][1]) === '{"amount":250}' &&
          (await val("sect-input-deposit")) === "",
        `Enter trong ô: gửi đúng một tin nộp 250 và xoá ô (${JSON.stringify(m.map((x) => x[1]))})`,
      );
      // ô trống / sai thì Enter KHÔNG gửi
      await evalJs(`window.__sent.length = 0; 1`);
      await typeText("abc");
      await enterKey();
      await sleep(250);
      check((await sentOf(SENT_DEP)).length === 0, "Enter khi ô sai: không gửi gì");
      // đang gõ trong ô thì phím KHÔNG điều khiển nhân vật
      await evalJs(
        `window.__sent.length = 0; document.getElementById("sect-input-deposit").focus(); 1`,
      );
      for (const [k, c, vk] of [
        ["d", "KeyD", 68],
        ["w", "KeyW", 87],
        ["a", "KeyA", 65],
        ["s", "KeyS", 83],
      ]) {
        await send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: k,
          code: c,
          windowsVirtualKeyCode: vk,
          text: k,
        });
        await sleep(60);
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: k,
          code: c,
          windowsVirtualKeyCode: vk,
        });
      }
      await sleep(250);
      const moving = await evalJs(
        `window.__sent.filter((x) => x[0] === "input" && (x[1].dx !== 0 || x[1].dy !== 0)).length`,
      );
      check(moving === 0, `gõ w a s d trong ô: nhân vật KHÔNG di chuyển (${moving} tin di chuyển)`);
      // Esc = huỷ: lần đầu RỜI ô (không đóng bảng khi đang gõ), lần hai mới đóng bảng
      await key("Escape", "Escape", 27);
      await sleep(200);
      check(
        (await sectOpen()) && (await evalJs(`document.activeElement?.id !== "sect-input-deposit"`)),
        "Esc lần 1 khi đang ở ô số lượng: rời ô, bảng Tông môn vẫn mở",
      );
      await key("Escape", "Escape", 27);
      await sleep(300);
      check(!(await sectOpen()), "Esc lần 2: đóng bảng Tông môn");
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
