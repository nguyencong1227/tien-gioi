/* global console, setTimeout, Buffer */
/**
 * Kiểm tab "Kho đồ" của bảng Tông môn (QUYET_DINH_M3 mục 27, K4, issue #788; `sect-vault.ts` + `ui.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-sect-vault.mjs [--shots <thư mục>] [--vp <khung>] [--slow-frame <ms>]
 *   (`--slow-frame <ms>` / `TG_SLOW_FRAME_MS`: mỗi khung hình trang bận `ms` ms (`slow-frame.mjs`) để thử khung chậm 25-50 ms, nhiều lõi VÀ một lõi `taskset -c 0`.)
 *
 * Đứng ở bảng Tông môn bằng `window.__ui.onSect` + `window.__ui.onSectVault` (dữ liệu giả), bắt tin gửi đi bằng cách đè `window.__scene.room.send`:
 *   - lưới kho 40 ô + lưới túi; rê chuột KHÔNG chọn ô (mục 24), bấm / chạm / bàn phím (focus) mới chọn;
 *   - Rút / Góp đồ thường gửi thẳng đúng `{slot, itemId, qty}` / `{slot, qty}`; sau khi gửi nút khoá ("Đang xử lý…") tới khi có ảnh chụp kho mới hoặc toast; bấm lần hai không gửi thêm;
 *   - số lượng lớn (>= 10), đồ quý / trang bị, và Đệ tử có hạn mức: hộp xác nhận nêu tên + số lượng + hậu quả; click ma sau khi đóng hộp bị chặn; "Giữ lại" không gửi gì;
 *   - kho / túi đổi giữa lúc hộp mở: xác nhận huỷ + báo, không gửi theo lời hỏi cũ;
 *   - lý do không bấm được hiện bằng CHỮ (kho đầy, hết lượt rút, kiếp mới chưa được rút, chưa chọn ô);
 *   - Tông chủ chỉnh hạn mức (Đệ tử không thấy form); sổ kho đồ; không chữ Hán; không tràn ngang; nút >= 44 px trên điện thoại.
 * `--shots`: lưu ảnh mỗi khung nhìn.
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
    launched = await launchChrome({ name: "sect-vault" });
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
      const center = (sel, idx = 0, block = "center") =>
        evalJs(
          `(() => {
          const e = document.querySelectorAll(${JSON.stringify(sel)})[${idx}];
          if (!e) return null;
          e.scrollIntoView({ block: ${JSON.stringify(block)}, inline: "center" });
          const r = e.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const top = document.elementFromPoint(x, y);
          return {
            x, y, w: r.width, h: r.height, hit: !!top && (top === e || e.contains(top)),
            cover: top && top !== e && !e.contains(top) ? (top.id ? "#" + top.id : top.tagName + "." + String(top.className).slice(0, 40)) : "",
            // chẩn đoán khi bị che: vị trí thanh hành động (sticky), lưới và khung cuộn gần nhất của ô
            dbg: (() => {
              const rc = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
              let sc = e.parentElement; while (sc && sc.scrollHeight <= sc.clientHeight + 1) sc = sc.parentElement;
              return { bar: rc(document.getElementById("sect-vault-actions")), grid: rc(document.getElementById("sect-vault-grid")), scroller: sc ? (sc.id || sc.className) + " " + JSON.stringify(rc(sc)) + " top=" + Math.round(sc.scrollTop) + "/" + (sc.scrollHeight - sc.clientHeight) : null, vp: [innerWidth, innerHeight] };
            })(),
          };
        })()`,
        );
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
      const slotsOf = (map) => Array.from({ length: 40 }, (_, i) => map[i] ?? null);
      const VAULT_SLOTS = {
        0: { itemId: "hoi_huyet_dan", qty: 20 },
        1: { itemId: "dai_hoi_huyet_dan", qty: 3 },
        2: { itemId: "lang_nha_kiem", qty: 1 },
      };
      const LOG = [
        { at: NOW - 60000, name: "Lạc Phong", kind: "deposit", itemId: "hoi_huyet_dan", qty: 5 },
        { at: NOW - 3600000, name: "Mộc Thanh", kind: "withdraw", itemId: "lang_nha_kiem", qty: 1 },
      ];
      const vaultOf = (o = {}) => ({
        vault: {
          slots: slotsOf(VAULT_SLOTS),
          log: LOG,
          drawPerDay: 3,
          myDrawsLeft: null,
          lockMs: 0,
          ...o,
        },
      });
      const setSect = (rank) =>
        evalJs(`(() => { window.__ui.onSect(${JSON.stringify(sectOf(rank))}); return 1; })()`);
      const setVault = (o) =>
        evalJs(`(() => { window.__ui.onSectVault(${JSON.stringify(vaultOf(o))}); return 1; })()`);
      const BAG = [
        { itemId: "hoi_huyet_dan", qty: 20 },
        { itemId: "dai_hoi_huyet_dan", qty: 5 },
        { itemId: "lang_nha_kiem", qty: 1 },
      ];
      await evalJs(
        `(() => { window.__ui.onInv({ slots: ${JSON.stringify([...BAG, ...Array(21).fill(null)])}, cd: {} }); return 1; })()`,
      );
      const vaultMsgs = () => evalJs(`window.__sent.filter((m) => /^sectVault/.test(m[0]))`);
      const box = () =>
        evalJs(`(() => ({
          open: window.__ui.isActConfirmOpen(),
          text: document.getElementById("act-confirm-text").textContent,
          warn: document.getElementById("act-confirm-warn").hidden ? "" : document.getElementById("act-confirm-warn").textContent,
          yes: document.getElementById("act-btn-yes-label").textContent,
          no: document.getElementById("act-btn-no-label").textContent,
          active: document.activeElement?.id ?? "",
        }))()`);
      const st = () =>
        evalJs(`(() => {
          const g = (id) => document.getElementById(id);
          const idx = (e) => [...e.parentNode.children].indexOf(e);
          const act = g("sect-vault-act");
          return {
            selVault: [...document.querySelectorAll("#sect-vault-grid .inv-slot.selected")].map(idx),
            selBag: [...document.querySelectorAll("#sect-vault-bag .inv-slot.selected")].map(idx),
            act: act.textContent, actDisabled: act.disabled,
            why: g("sect-vault-why").textContent, selText: g("sect-vault-sel").textContent,
            draw: g("sect-vault-draw").textContent, qty: g("sect-vault-qty").value,
            qtyHidden: g("sect-vault-qty-box").hidden, policyHidden: g("sect-vault-policy").hidden,
            count: g("sect-vault-count").textContent,
            vaultCells: g("sect-vault-grid").children.length, bagCells: g("sect-vault-bag").children.length,
          };
        })()`);
      const slotSel = (from, i) =>
        `#sect-vault-${from === "vault" ? "grid" : "bag"} .inv-slot:nth-child(${i + 1})`;
      const tapSel = async (sel) => {
        // CHỜ theo điều kiện (ô nhận được cú bấm), không ngủ cố định: ngay sau khi bảng vừa vẽ lại / cuộn ô có thể còn bị lớp khác che vài khung (chập chờn ~1/3 lượt ở [13b], 25/11)
        let c = await center(sel);
        // Bị che (thanh hành động .sect-vault-actions dính đáy cao 166 px trong vùng cuộn 231 px ở 844x390 khi có món được chọn che điểm GIỮA vùng nhìn): cuộn ô lên ĐẦU vùng cuộn, nơi
        // thanh không tới. Chỉ khi căn giữa hỏng mới đổi, các cú bấm khác giữ nguyên như cũ.
        if (!c || !c.hit) c = await center(sel, 0, "start");
        for (let k = 0; k < 40 && (!c || !c.hit); k++) {
          await sleep(125);
          c = await center(sel, 0, "start");
        }
        if (!c || !c.hit) throw new Error(`không bấm được ${sel} sau 5 s: ${JSON.stringify(c)}`);
        await tap(c.x, c.y);
        await sleep(120);
        return c;
      };
      const reset = async (rank = "chu", vo = {}) => {
        // `onSect(null)` xoá ô đang chọn + số lượng cũ của kho đồ, để mỗi mục bắt đầu sạch
        await evalJs(
          `window.__sent.length = 0; window.__ui.closeActConfirm(false); window.__ui.onSect({ sect: null }); 1`,
        );
        await setSect(rank);
        await setVault(vo);
        await sleep(80);
      };

      console.log(
        "  [1] mở bảng Tông môn, sang tab Kho đồ: lưới kho 40 ô + lưới túi, hạn mức, form hạn mức (Tông chủ)",
      );
      await setSect("chu");
      await setVault();
      await evalJs(`window.__ui.toggleSectModal(true); 1`);
      await sleep(300);
      const tabBtn = await center("#sect-tab-btn-vault");
      check(tabBtn && tabBtn.hit, "nút tab Kho đồ bấm được");
      check(
        !vp.mobile || tabBtn.h >= MIN_TAP_PX,
        `tab Kho đồ >= ${MIN_TAP_PX}px cao trên điện thoại (${Math.round(tabBtn.h)})`,
      );
      await tap(tabBtn.x, tabBtn.y);
      await sleep(250);
      let s = await st();
      check(s.vaultCells === 40, `lưới kho có 40 ô (${s.vaultCells})`);
      check(s.bagCells > 0, `lưới túi có ô (${s.bagCells})`);
      check(s.count === "(3 / 40 ô)", `đếm ô dùng: "${s.count}"`);
      // M8: số ô kho theo cấp tông (`SectVaultView.unlocked`): chỉ vẽ ô ĐÃ MỞ + ghi chú ô còn khoá; cấp 1 giữ nguyên 40 ô
      for (const [n, note] of [
        [50, /Còn 30 ô chưa mở.*cấp tông 3/],
        [80, null],
        [40, /Còn 40 ô chưa mở.*cấp tông 2/],
      ]) {
        await setVault({
          slots: Array.from({ length: n }, (_, i) => VAULT_SLOTS[i] ?? null),
          unlocked: n,
        });
        await sleep(150);
        const u = await evalJs(
          `({ cells: document.getElementById("sect-vault-grid").children.length, note: document.getElementById("sect-vault-locked").textContent, shown: getComputedStyle(document.getElementById("sect-vault-locked")).display, count: document.getElementById("sect-vault-count").textContent })`,
        );
        check(u.cells === n, `unlocked ${n}: lưới kho có ${n} ô (${u.cells})`);
        check(
          note ? note.test(u.note) && u.shown !== "none" : u.note === "" && u.shown === "none",
          `unlocked ${n}: ghi chú ô khoá ${note ? "nêu số ô + cấp mở thêm" : "ẩn"}: "${u.note}"`,
        );
        check(u.count.endsWith(`/ ${n} ô)`), `unlocked ${n}: đếm "${u.count}"`);
      }
      await setVault();
      await sleep(150);
      check(s.draw === "Lượt rút: không hạn.", `Tông chủ không hạn mức: "${s.draw}"`);
      check(!s.policyHidden, "Tông chủ thấy form chỉnh hạn mức");
      check(
        s.act === "Chọn món" && s.actDisabled && s.why === "Chọn một ô trước.",
        `chưa chọn ô: nút khoá + lý do chữ ("${s.act}" / "${s.why}")`,
      );
      const geo = await evalJs(`(() => {
        const m = document.getElementById("sect-modal");
        return { over: m.scrollWidth > m.clientWidth + 1, pageOver: document.documentElement.scrollWidth > window.innerWidth + 1,
                 han: /[\u4e00-\u9fff]/.test(document.getElementById("sect-tab-vault").textContent) };
      })()`);
      check(!geo.over && !geo.pageOver, "không tràn ngang");
      check(!geo.han, "không có chữ Hán trong tab");
      const cell = await center(slotSel("vault", 0));
      check(
        cell && cell.hit && (!vp.mobile || (cell.w >= MIN_TAP_PX && cell.h >= MIN_TAP_PX)),
        `ô kho bấm được, không bị che (${Math.round(cell.w)}x${Math.round(cell.h)})`,
      );
      await shot("tab-kho-do");

      console.log("  [2] rê chuột KHÔNG chọn ô; bấm / chạm mới chọn");
      const c0 = await center(slotSel("vault", 0));
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: c0.x,
        y: c0.y,
        button: "none",
        buttons: 0,
      });
      await sleep(150);
      s = await st();
      check(s.selVault.length === 0 && s.selBag.length === 0, "rê chuột lên ô kho: chưa chọn gì");
      await tapSel(slotSel("vault", 0));
      s = await st();
      check(
        JSON.stringify(s.selVault) === "[0]" && s.selBag.length === 0,
        `chạm ô 0 của kho: chọn ô 0 (${JSON.stringify(s.selVault)})`,
      );
      check(s.act === "Rút" && !s.actDisabled && s.why === "", `nút "Rút" bấm được (${s.act})`);
      check(s.selText === "Trong kho: Hồi Huyết Đan (có 20)", `món đang chọn: "${s.selText}"`);
      check(!s.qtyHidden && s.qty === "1", "có bộ chỉnh số lượng, bắt đầu từ 1");
      await shot("chon-rut");

      console.log(
        "  [3] Rút đồ thường (Tông chủ, 1 món): gửi thẳng đúng tin; khoá nút tới khi máy chủ trả lời; bấm lần hai không gửi thêm",
      );
      const actC = await center("#sect-vault-act");
      check(
        actC && actC.hit && (!vp.mobile || (actC.w >= MIN_TAP_PX && actC.h >= MIN_TAP_PX)),
        `nút Rút bấm được (${Math.round(actC.w)}x${Math.round(actC.h)})`,
      );
      await tap(actC.x, actC.y);
      await sleep(200);
      check(!(await box()).open, "đồ thường: KHÔNG hộp xác nhận");
      let m = await vaultMsgs();
      check(
        m.length === 1 &&
          m[0][0] === "sectVaultWithdraw" &&
          JSON.stringify(m[0][1]) === '{"slot":0,"itemId":"hoi_huyet_dan","qty":1}',
        `đúng một tin rút (${JSON.stringify(m)})`,
      );
      s = await st();
      check(s.act === "Đang xử lý…" && s.actDisabled, `nút khoá trong lúc chờ ("${s.act}")`);
      await evalJs(`document.getElementById("sect-vault-act").click(); 1`);
      await sleep(150);
      await evalJs(
        `document.querySelector(${JSON.stringify(slotSel("vault", 0))}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); 1`,
      );
      await sleep(150);
      check((await vaultMsgs()).length === 1, "đang chờ: bấm thêm / Enter không gửi tin thứ hai");
      await setVault({
        slots: slotsOf({ ...VAULT_SLOTS, 0: { itemId: "hoi_huyet_dan", qty: 19 } }),
      });
      await sleep(100);
      s = await st();
      check(
        s.act === "Rút" && !s.actDisabled && JSON.stringify(s.selVault) === "[0]",
        `ảnh chụp kho mới: mở khoá, vẫn chọn ô 0 ("${s.act}")`,
      );
      check(s.selText.endsWith("(có 19)"), `số lượng mới hiện đúng ("${s.selText}")`);

      console.log("  [4] lời từ chối (toast) cũng mở khoá nút");
      await tapSel("#sect-vault-act");
      check((await vaultMsgs()).length === 2, "gửi tin thứ hai sau khi mở khoá");
      check((await st()).actDisabled, "khoá lại");
      await evalJs(`window.__ui.toast({ text: "Kho vừa đổi, hãy thử lại.", tone: "bad" }); 1`);
      await sleep(100);
      s = await st();
      check(s.act === "Rút" && !s.actDisabled, `toast: mở khoá ("${s.act}")`);

      console.log(
        "  [5] số lượng lớn (10): hộp xác nhận; click ma bị chặn; 'Giữ lại' không gửi; xác nhận gửi đúng MỘT tin qty 10",
      );
      await reset("chu");
      await tapSel(slotSel("vault", 0));
      for (let i = 0; i < 9; i++) await tapSel("#sect-vault-plus");
      s = await st();
      check(s.qty === "10", `chỉnh số lượng lên 10 (${s.qty})`);
      await tapSel("#sect-vault-act");
      let b = await box();
      check(b.open && b.text === "Rút Hồi Huyết Đan ×10 từ kho tông môn?", `câu hỏi: "${b.text}"`);
      check(
        b.warn === "Số lượng lớn." && b.yes === "Rút" && b.no === "Giữ lại",
        `nhắc "${b.warn}", nút "${b.no}" / "${b.yes}"`,
      );
      check(b.active === "act-btn-no", `focus ở "Giữ lại" (${b.active})`);
      check((await vaultMsgs()).length === 0, "chưa gửi gì khi chưa xác nhận");
      await shot("xac-nhan-rut");
      await sleep(560);
      // Cú bấm THẬT (chuột / chạm) vào "Giữ lại": đóng hộp, không gửi gì. Hai kiểm "ngay" bên dưới KHÔNG dùng cú bấm thật vì độ trễ giữa các lệnh CDP phụ thuộc tốc độ khung
      // của runner (khung 30-250 ms: nhiều lệnh chồng lên có thể vượt cửa sổ 450 ms và làm kiểm đỏ oan, A thấy ở run 45556979540): cú bấm "ma" / "ngay" chạy trong CÙNG MỘT lượt JS
      // với thao tác đóng / mở hộp nên khoảng cách giữa chúng gần 0 ms, đúng bằng thứ cửa sổ chống click ma phải chặn, không phụ thuộc đồng hồ.
      const noBtn = await center("#act-btn-no");
      await tap(noBtn.x, noBtn.y);
      await sleep(150);
      check(
        !(await box()).open && (await vaultMsgs()).length === 0,
        "'Giữ lại' (cú bấm thật): đóng hộp, không gửi",
      );
      await sleep(560);
      await tapSel("#sect-vault-act");
      check((await box()).open, "sau 'Giữ lại' + hết cửa sổ chống click ma: bấm Rút mở lại hộp");
      await sleep(560);
      // click ma: ngay sau khi hộp đóng (pointerdown "Giữ lại"), click chuột (detail 1) rơi xuống nút Rút nằm dưới hộp: không được mở lại hộp. Cùng một lượt JS.
      const ghost = await evalJs(`(() => {
        const g = (id) => document.getElementById(id);
        g("act-btn-no").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 }));
        g("sect-vault-act").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
        return { open: window.__ui.isActConfirmOpen(), n: window.__sent.filter((m) => /^sectVault/.test(m[0])).length };
      })()`);
      check(
        !ghost.open && ghost.n === 0,
        `click ma ngay sau khi đóng hộp: bị bỏ qua (không mở lại hộp, không gửi) (${JSON.stringify(ghost)})`,
      );
      await sleep(560);
      await tapSel("#sect-vault-act");
      check((await box()).open, "sau cửa sổ chống click ma: bấm Rút mở lại hộp");
      const yes = await center("#act-btn-yes");
      check(
        yes.hit && (!vp.mobile || (yes.w >= MIN_TAP_PX && yes.h >= MIN_TAP_PX)),
        `nút Rút trong hộp bấm được (${Math.round(yes.w)}x${Math.round(yes.h)})`,
      );
      await sleep(560);
      // xác nhận "NGAY khi hộp vừa mở": đóng hộp, mở lại (Rút bằng click không chuột: không bị chặn) và bấm "Rút" trong hộp, cùng MỘT lượt JS: phải bị bỏ qua
      const imm = await evalJs(`(() => {
        const g = (id) => document.getElementById(id);
        const pd = (id) => g(id).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 }));
        pd("act-btn-no");
        g("sect-vault-act").click();
        const opened = window.__ui.isActConfirmOpen();
        pd("act-btn-yes");
        return { opened, open: window.__ui.isActConfirmOpen(), n: window.__sent.filter((m) => /^sectVault/.test(m[0])).length };
      })()`);
      check(
        imm.opened && imm.open && imm.n === 0,
        `bấm xác nhận NGAY khi hộp vừa mở: bị bỏ qua (${JSON.stringify(imm)})`,
      );
      await sleep(560);
      const yes2 = await center("#act-btn-yes");
      await tap(yes2.x, yes2.y);
      await sleep(250);
      m = await vaultMsgs();
      check(
        !(await box()).open &&
          m.length === 1 &&
          JSON.stringify(m[0]) ===
            '["sectVaultWithdraw",{"slot":0,"itemId":"hoi_huyet_dan","qty":10}]',
        `xác nhận: đúng MỘT tin rút qty 10 (${JSON.stringify(m)})`,
      );

      console.log("  [6] trang bị trong kho: hộp xác nhận 'đồ quý'; Esc chỉ đóng hộp");
      await reset("chu");
      await tapSel(slotSel("vault", 2));
      await tapSel("#sect-vault-act");
      b = await box();
      check(
        b.open &&
          b.text === "Rút Lang Nha Kiếm từ kho tông môn?" &&
          b.warn === "Đồ quý trong kho chung của tông môn.",
        `hộp: "${b.text}" / "${b.warn}"`,
      );
      await key("Escape", "Escape", 27);
      await sleep(500);
      check(!(await box()).open && (await vaultMsgs()).length === 0, "Esc: đóng hộp, không gửi");
      check(
        await evalJs(`window.__ui.isSectModalOpen()`),
        "Esc chỉ đóng hộp: bảng Tông môn VẪN mở",
      );

      console.log(
        "  [7] kho đổi giữa lúc hộp mở (ô bị người khác rút hết): xác nhận huỷ + báo, không gửi theo lời hỏi cũ",
      );
      await reset("chu");
      await tapSel(slotSel("vault", 2));
      await tapSel("#sect-vault-act");
      check((await box()).open, "hộp mở");
      await setVault({ slots: slotsOf({ 0: VAULT_SLOTS[0], 1: VAULT_SLOTS[1] }) });
      await sleep(600);
      const y7 = await center("#act-btn-yes");
      await tap(y7.x, y7.y);
      await sleep(300);
      const toasts = await evalJs(
        `[...document.querySelectorAll("#toast p")].map((p) => p.textContent)`,
      );
      check(
        !(await box()).open &&
          (await vaultMsgs()).length === 0 &&
          toasts.some((t) => t.includes("Kho hoặc túi vừa đổi")),
        `huỷ + báo, không gửi (${JSON.stringify(toasts)})`,
      );

      console.log("  [8] Góp từ túi: đồ thường gửi thẳng; đồ quý có hộp; 'Giữ lại' không gửi");
      await reset("chu");
      await tapSel(slotSel("bag", 0));
      s = await st();
      check(
        JSON.stringify(s.selBag) === "[0]" && s.selVault.length === 0 && s.act === "Góp",
        `chọn ô túi 0: nút "Góp" (${s.act})`,
      );
      check(s.selText === "Trong túi: Hồi Huyết Đan (có 20)", `món chọn: "${s.selText}"`);
      await tapSel("#sect-vault-act");
      m = await vaultMsgs();
      check(
        m.length === 1 &&
          JSON.stringify(m[0]) === '["sectVaultDeposit",{"slot":0,"qty":1}]' &&
          !(await box()).open,
        `đồ thường: gửi thẳng góp (${JSON.stringify(m)})`,
      );
      await reset("chu");
      await tapSel(slotSel("bag", 1));
      await tapSel("#sect-vault-act");
      b = await box();
      check(b.open && b.text === "Góp Đại Hồi Huyết Đan vào kho tông môn?", `đồ quý: "${b.text}"`);
      check(
        /^Đồ quý/.test(b.warn) && b.yes === "Góp" && b.no === "Giữ lại",
        `nhắc "${b.warn}", nút "${b.no}" / "${b.yes}"`,
      );
      await shot("xac-nhan-gop");
      await sleep(560);
      const no8 = await center("#act-btn-no");
      await tap(no8.x, no8.y);
      await sleep(600);
      check(!(await box()).open && (await vaultMsgs()).length === 0, "'Giữ lại': không gửi");
      await tapSel("#sect-vault-act");
      await sleep(560);
      const y8 = await center("#act-btn-yes");
      await tap(y8.x, y8.y);
      await sleep(250);
      m = await vaultMsgs();
      check(
        m.length === 1 && JSON.stringify(m[0]) === '["sectVaultDeposit",{"slot":1,"qty":1}]',
        `xác nhận: đúng MỘT tin góp (${JSON.stringify(m)})`,
      );

      console.log("  [9] kho đầy: Góp khoá, lý do bằng chữ");
      await reset("chu", {
        slots: slotsOf(
          Object.fromEntries(
            Array.from({ length: 40 }, (_, i) => [i, { itemId: "hoi_huyet_dan", qty: 20 }]),
          ),
        ),
      });
      await tapSel(slotSel("bag", 0));
      s = await st();
      check(
        s.actDisabled && s.why === "Kho đã đầy, không còn chỗ cho món này.",
        `kho đầy: "${s.why}"`,
      );
      await tapSel(slotSel("bag", 1));
      check((await st()).actDisabled, "kho đầy chặn cả món khác");

      console.log(
        "  [10] Đệ tử có hạn mức: hộp nêu lượt rút; hết lượt / kiếp mới: khoá + lý do chữ; không thấy form hạn mức",
      );
      await reset("de_tu", { myDrawsLeft: 2 });
      s = await st();
      check(s.policyHidden, "Đệ tử KHÔNG thấy form chỉnh hạn mức");
      check(s.draw === "Lượt rút hôm nay: còn 2 / 3.", `hạn mức: "${s.draw}"`);
      await tapSel(slotSel("vault", 0));
      await tapSel("#sect-vault-act");
      b = await box();
      check(
        b.open &&
          b.text === "Rút Hồi Huyết Đan từ kho tông môn?" &&
          b.warn === "Tốn 1 lượt rút (còn 2 / 3 hôm nay).",
        `hộp: "${b.text}" / "${b.warn}"`,
      );
      await shot("xac-nhan-rut-de-tu");
      await sleep(560);
      const no10 = await center("#act-btn-no");
      await tap(no10.x, no10.y);
      await sleep(600);
      check((await vaultMsgs()).length === 0, "'Giữ lại': không gửi");
      await reset("de_tu", { myDrawsLeft: 0 });
      await tapSel(slotSel("vault", 0));
      s = await st();
      check(s.actDisabled && s.why === "Hôm nay đã hết lượt rút.", `hết lượt: "${s.why}"`);
      await shot("het-luot-rut");
      await reset("de_tu", { myDrawsLeft: 3, lockMs: 120000 });
      await tapSel(slotSel("vault", 0));
      s = await st();
      check(
        s.actDisabled && s.why === "Kiếp này còn quá mới, chưa được rút.",
        `kiếp mới: "${s.why}"`,
      );
      check(/chưa rút được/.test(s.draw), `dòng hạn mức: "${s.draw}"`);
      await tapSel(slotSel("bag", 0));
      s = await st();
      check(!s.actDisabled && s.act === "Góp", "Đệ tử vẫn Góp được khi chưa rút được");
      await reset("de_tu", { myDrawsLeft: 2 });
      await tapSel(slotSel("vault", 0));
      for (let i = 0; i < 12; i++) await tapSel("#sect-vault-plus");
      check((await st()).qty === "10", "Đệ tử: mỗi lượt tối đa 10 món (số lượng kẹp ở 10)");

      console.log("  [11] Tông chủ chỉnh hạn mức Đệ tử");
      await reset("chu");
      s = await st();
      check(!s.policyHidden, "form hiện");
      await evalJs(`document.getElementById("sect-vault-policy-sel").value = "5"; 1`);
      await tapSel("#sect-vault-policy-save");
      m = await vaultMsgs();
      check(
        m.length === 1 && JSON.stringify(m[0]) === '["sectVaultPolicy",{"drawPerDay":5}]',
        `gửi đúng hạn mức (${JSON.stringify(m)})`,
      );

      console.log("  [12] sổ kho đồ: mới nhất đứng đầu, đọc được");
      const lines = await evalJs(
        `[...document.querySelectorAll("#sect-vault-log > *")].map((e) => e.textContent)`,
      );
      check(
        lines.length === 2 &&
          /^\d\d:\d\d · Lạc Phong đã góp Hồi Huyết Đan ×5$/.test(lines[0]) &&
          /^\d\d:\d\d · Mộc Thanh đã rút Lang Nha Kiếm$/.test(lines[1]),
        `sổ: ${JSON.stringify(lines)}`,
      );
      await shot("so-kho-do");

      console.log(
        "  [13] bàn phím: focus ô (mũi tên / Tab) = chọn; Enter = làm (đồ thường gửi thẳng)",
      );
      await reset("chu");
      await evalJs(`document.querySelector(${JSON.stringify(slotSel("vault", 0))}).focus(); 1`);
      await sleep(150);
      s = await st();
      check(
        JSON.stringify(s.selVault) === "[0]",
        `focus ô 0: chọn ô 0 (${JSON.stringify(s.selVault)})`,
      );
      await key("Enter", "Enter", 13);
      await sleep(250);
      m = await vaultMsgs();
      check(
        m.length === 1 &&
          JSON.stringify(m[0]) ===
            '["sectVaultWithdraw",{"slot":0,"itemId":"hoi_huyet_dan","qty":1}]',
        `Enter: gửi đúng một tin rút (${JSON.stringify(m)})`,
      );

      console.log(
        "  [13b] focus bàn phím ở ô A, rồi bấm chuột chọn ô B: Enter chạy trên B (ô được chọn = ô đang focus), không phải A",
      );
      await reset("chu");
      await evalJs(`document.querySelector(${JSON.stringify(slotSel("vault", 0))}).focus(); 1`);
      await sleep(100);
      await tapSel(slotSel("vault", 2));
      s = await st();
      check(
        JSON.stringify(s.selVault) === "[2]",
        `bấm ô 2: chọn ô 2 (${JSON.stringify(s.selVault)})`,
      );
      const foc = await evalJs(
        `(() => { const e = document.activeElement; return e && e.parentNode ? [e.parentNode.id, [...e.parentNode.children].indexOf(e)] : null; })()`,
      );
      check(
        JSON.stringify(foc) === '["sect-vault-grid",2]',
        `focus đi theo ô vừa bấm (${JSON.stringify(foc)})`,
      );
      await key("Enter", "Enter", 13);
      await sleep(250);
      b = await box();
      check(
        b.open &&
          b.text === "Rút Lang Nha Kiếm từ kho tông môn?" &&
          (await vaultMsgs()).length === 0,
        `Enter: hộp của ô 2 (Lang Nha Kiếm), chưa gửi gì ("${b.text}")`,
      );
      await key("Escape", "Escape", 27);
      await sleep(500);

      console.log("  [14] rời tông môn: kho đồ xoá sạch");
      await evalJs(`window.__ui.onSect({ sect: null }); 1`);
      await sleep(150);
      check(
        (await evalJs(`window.__ui.getSectVault()`)) === null,
        "ảnh chụp kho bị xoá khi không còn tông môn",
      );
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
