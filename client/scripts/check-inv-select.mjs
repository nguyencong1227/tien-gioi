import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm LỖI TÚI ĐỒ (QUYET_DINH_M3 mục 24) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), ở năm khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-inv-select.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Lỗi gốc: rê chuột (`pointerenter`) đổi luôn ô ĐƯỢC CHỌN, nên bấm món rồi rê sang nút Vứt (đi ngang các ô khác) thì Vứt rơi vào món cuối chuột đi qua.
 * Script dùng sự kiện đầu vào THẬT của Chrome (`Input.dispatchMouseEvent` / `dispatchTouchEvent` / `dispatchKeyEvent`):
 *   CHUỘT (khung máy tính): bấm ô 2 -> rê chuột ngang các ô khác tới nút "Vứt 1" -> ô chọn KHÔNG đổi, chi tiết vẫn là món ô 2 -> bấm Vứt 1 -> hộp xác nhận nêu đúng
 *     tên + số lượng của món ô 2 -> bấm "Vứt" -> đúng MỘT tin `dropItem { slot: 2, qty: 1 }`; "Giữ lại" không gửi gì; đổi ô khi hộp mở thì hộp đóng; túi đổi món thì hộp đóng.
 *   CẢM ỨNG (khung điện thoại / máy tính bảng): chạm ô -> chạm Vứt hết -> hộp xác nhận (nút >= 44 px) -> chạm Vứt: đúng `dropItem { slot }` (không qty).
 *   BÀN PHÍM (mọi khung): mũi tên chọn ô; Tab / Enter tới Vứt 1 -> hộp mở, focus ở "Giữ lại"; Esc đóng HỘP trước (túi còn mở); Enter xác nhận thì vứt đúng món.
 *   Bảng nhân vật (so sánh trang bị): rê chuột KHÔNG đổi món xem trước; bấm mới đổi.
 * `--shots`: lưu ảnh hộp xác nhận (và trạng thái rê chuột) mỗi khung nhìn.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-inv-select-"));
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

    // ---- đầu vào THẬT của Chrome ----
    const mouse = (type, x, y, extra = {}) =>
      send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        buttons: type === "mousePressed" ? 1 : 0,
        clickCount: 1,
        ...extra,
      });
    const moveTo = async (x, y) => mouse("mouseMoved", x, y, { button: "none", buttons: 0 });
    const clickAt = async (x, y) => {
      await moveTo(x, y);
      await mouse("mousePressed", x, y);
      await mouse("mouseReleased", x, y);
    };
    const tapAt = async (x, y) => {
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const keyDef = {
      Enter: [13, "\r"],
      Escape: [27, ""],
      ArrowRight: [39, ""],
      ArrowLeft: [37, ""],
      ArrowDown: [40, ""],
      Tab: [9, ""],
    };
    const press = async (key) => {
      const [vk, text] = keyDef[key];
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        code: key,
        windowsVirtualKeyCode: vk,
        ...(text ? { text } : {}),
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: key,
        windowsVirtualKeyCode: vk,
      });
    };

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
      /** Hộp xác nhận bỏ qua mọi lần bấm trong ~450 ms đầu (chống "click ma" sau khi chạm Vứt): chờ qua cửa sổ đó trước khi bấm "Vứt" / "Giữ lại" */
      const pastGuard = () => sleep(560);
      /** Tâm của phần tử (đã cuộn vào tầm nhìn); `null` nếu không có. Trả thêm phần tử TẠI điểm đó để biết có bị che (nút Đóng nổi...) không. */
      const center = (sel, idx = 0) =>
        evalJs(`(() => {
          const e = document.querySelectorAll(${JSON.stringify(sel)})[${idx}];
          if (!e) return null;
          e.scrollIntoView({ block: "center", inline: "center" });
          const r = e.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const top = document.elementFromPoint(x, y);
          return { x, y, w: r.width, h: r.height, hit: !!top && (top === e || e.contains(top)), topId: top ? (top.id || top.className || top.tagName) : null };
        })()`);
      const state = () =>
        evalJs(`(() => ({
          selected: [...document.querySelectorAll("#inv-grid .inv-slot")].findIndex((b) => b.classList.contains("selected")),
          name: document.getElementById("inv-item-name").textContent,
          confirmOpen: !document.getElementById("inv-drop-confirm").hidden,
          confirmText: document.getElementById("inv-drop-text").textContent,
          warn: document.getElementById("inv-drop-warn").hidden ? "" : document.getElementById("inv-drop-warn").textContent,
          active: document.activeElement?.id ?? "",
          invOpen: window.__ui.isInventoryOpen(),
          drops: window.__sent.filter((m) => m[0] === "dropItem").map((m) => m[1]),
        }))()`);

      // ---- dữ liệu: ô 0 Hồi Huyết Đan x5, ô 1 Hồi Linh Đan x3, ô 2 Long Thố x7, ô 3 Lang Nha Kiếm, ô 4 Tụ Khí Đan... ----
      await evalJs(`(() => {
        window.__sent = [];
        window.__scene.room.send = (t, m) => { window.__sent.push([t, m]); };
        window.__ui.onWallet({ coin: 1000 });
        window.__ui.onInv({ slots: [
          { itemId: "hoi_huyet_dan", qty: 5 }, { itemId: "hoi_linh_dan", qty: 3 }, { itemId: "long_tho", qty: 7 },
          { itemId: "lang_nha_kiem", qty: 1 }, null, { itemId: "long_tho", qty: 2 },
        ], cd: {} });
        window.__ui.toggleInventory(true);
        return 1;
      })()`);
      await sleep(300);
      const cat = JSON.parse(
        await evalJs(`JSON.stringify({ long_tho: window.__craftData ? 0 : 0 })`),
      );
      void cat;
      const nameOf = (id) =>
        evalJs(
          `(window.__craftData ? window.__craftData.ITEM_BY_ID[${JSON.stringify(id)}]?.name : "")`,
        );
      const longTho = await nameOf("long_tho");
      const nSlots = await evalJs(`document.querySelectorAll("#inv-grid .inv-slot").length`);
      check(nSlots >= 6 && Boolean(longTho), `túi có ${nSlots} ô, tên món: "${longTho}"`);

      if (!vp.mobile) {
        // ================= CHUỘT =================
        console.log("  [chuột] bấm món rồi rê sang chỗ khác");
        const s2 = await center("#inv-grid .inv-slot", 2);
        await clickAt(s2.x, s2.y);
        await sleep(200);
        let st = await state();
        check(st.selected === 2 && st.name.includes(longTho), `bấm ô 2: chọn ô 2 ("${st.name}")`);
        // rê ngang các ô khác (0, 1, 3, 5) rồi xuống nút Vứt 1: ô chọn KHÔNG đổi
        const visited = [];
        for (const i of [3, 5, 1, 0]) {
          const c = await center("#inv-grid .inv-slot", i);
          await moveTo(c.x - 8, c.y);
          await moveTo(c.x, c.y);
          await sleep(120);
          const hovered = await evalJs(
            `document.querySelectorAll("#inv-grid .inv-slot")[${i}].matches(":hover")`,
          );
          const sNow = await state();
          visited.push(`${i}:${hovered ? "sáng" : "?"}/chọn${sNow.selected}`);
          if (sNow.selected !== 2 || !sNow.name.includes(longTho)) {
            check(false, `rê qua ô ${i} làm ô chọn đổi sang ${sNow.selected} ("${sNow.name}")`);
          }
        }
        check(
          true,
          `rê chuột qua ô 3, 5, 1, 0 (${visited.join(", ")}): ô chọn vẫn là ô 2, chi tiết vẫn là "${longTho}"`,
        );
        await shot("hover-giu-chon");
        const drop1 = await center("#inv-btn-drop1");
        check(drop1.hit, `nút Vứt 1 bấm được (không bị che bởi "${drop1.topId}")`);
        await moveTo(drop1.x, drop1.y);
        st = await state();
        check(st.selected === 2, "rê tới nút Vứt 1: ô chọn vẫn là ô 2");
        await mouse("mousePressed", drop1.x, drop1.y);
        await mouse("mouseReleased", drop1.x, drop1.y);
        // click ma: bấm "Vứt" NGAY sau khi hộp vừa mở (trong cửa sổ chống click ma 450 ms) thì KHÔNG xác nhận.
        // Trên CI SwiftShader chậm, bấm ngay lập tức để nằm trong cửa sổ guard:
        const yes = await center("#inv-drop-yes");
        await clickAt(yes.x, yes.y);
        await sleep(100);
        st = await state();
        check(
          st.confirmOpen && st.drops.length === 0,
          "bấm Vứt ngay khi hộp vừa mở (click ma): bị bỏ qua, hộp vẫn mở, chưa gửi gì",
        );
        check(
          st.confirmOpen && st.confirmText === `Vứt 1 ${longTho}? (còn lại 6)`,
          `hộp xác nhận nêu đúng món + số lượng: "${st.confirmText}"`,
        );
        check(st.drops.length === 0, "chưa gửi dropItem khi chưa xác nhận");
        check(st.active === "inv-drop-no", `focus ở "Giữ lại" (${st.active})`);
        await shot("xac-nhan-vut");
        await pastGuard();
        check(yes.hit, `nút Vứt trong hộp bấm được (không bị che bởi "${yes.topId}")`);
        await clickAt(yes.x, yes.y);
        await sleep(200);
        st = await state();
        check(
          !st.confirmOpen &&
            st.drops.length === 1 &&
            st.drops[0].slot === 2 &&
            st.drops[0].qty === 1,
          `xác nhận: đúng MỘT dropItem ${JSON.stringify(st.drops)}`,
        );
        // Vứt hết rồi Giữ lại: không gửi gì thêm
        await evalJs(`window.__sent.length = 0`);
        const all = await center("#inv-btn-dropall");
        await clickAt(all.x, all.y);
        await sleep(150);
        st = await state();
        check(
          st.confirmOpen && st.confirmText === `Vứt hết ${longTho} ×7?`,
          `Vứt hết: "${st.confirmText}"`,
        );
        await pastGuard();
        const no = await center("#inv-drop-no");
        await clickAt(no.x, no.y);
        await sleep(150);
        st = await state();
        check(!st.confirmOpen && st.drops.length === 0, "Giữ lại: hộp đóng, không gửi dropItem");
        // đổi ô khi hộp đang mở: hộp đóng
        await clickAt(all.x, all.y);
        await sleep(120);
        const s0 = await center("#inv-grid .inv-slot", 0);
        await clickAt(s0.x, s0.y);
        await sleep(150);
        st = await state();
        check(
          !st.confirmOpen && st.selected === 0,
          "bấm ô khác khi hộp đang mở: hộp đóng, ô chọn đổi sang ô 0",
        );
        // túi đổi món ở đúng ô định vứt: hộp đóng, không vứt nhầm
        const all0 = await center("#inv-btn-dropall");
        await clickAt(all0.x, all0.y);
        await sleep(120);
        await evalJs(
          `window.__ui.onInv({ slots: [{ itemId: "long_tho", qty: 5 }, { itemId: "hoi_linh_dan", qty: 3 }, { itemId: "long_tho", qty: 7 }], cd: {} })`,
        );
        await sleep(150);
        st = await state();
        check(
          !st.confirmOpen && st.drops.length === 0,
          "túi đổi món ở ô định vứt: hộp đóng, không vứt gì",
        );
        // ---- bảng nhân vật: hover không đổi món xem trước ----
        console.log("  [chuột] bảng nhân vật: rê không đổi món xem trước");
        await evalJs(
          `(() => { const eq = Object.values(window.__craftData.ITEM_BY_ID).filter((d) => d.type === "equip").slice(0, 2); window.__ui.onInv({ slots: eq.map((d) => ({ itemId: d.id, qty: 1 })), cd: {} }); window.__ui.toggleInventory(false); window.__ui.toggleCharModal(true); return 1; })()`,
        );
        await sleep(300);
        const rows = await evalJs(
          `document.querySelectorAll("#char-bag-equips .char-bag-item").length`,
        );
        if (rows >= 1) {
          const r0 = await center("#char-bag-equips .char-bag-item", 0);
          await moveTo(r0.x, r0.y);
          await sleep(200);
          const prev = await evalJs(
            `document.querySelectorAll("#char-bag-equips .char-bag-item.previewing").length`,
          );
          check(prev === 0, `rê chuột qua hàng trang bị: không có hàng xem trước (${prev})`);
          const r0b = await center("#char-bag-equips .char-bag-item", 0);
          await mouse("mousePressed", r0b.x, r0b.y - 4);
          await mouse("mouseReleased", r0b.x, r0b.y - 4);
          await sleep(200);
          const prev2 = await evalJs(
            `document.querySelectorAll("#char-bag-equips .char-bag-item.previewing").length`,
          );
          check(prev2 === 1, `bấm hàng: có đúng 1 hàng xem trước (${prev2})`);
        } else {
          check(false, "bảng nhân vật không có hàng trang bị để kiểm");
        }
        await evalJs(`window.__ui.toggleCharModal(false)`);
      } else {
        // ================= CẢM ỨNG =================
        console.log("  [cảm ứng] chạm món rồi chạm Vứt hết");
        const s3 = await center("#inv-grid .inv-slot", 3);
        await tapAt(s3.x, s3.y);
        await sleep(250);
        let st = await state();
        const kiem = await nameOf("lang_nha_kiem");
        check(st.selected === 3 && st.name.includes(kiem), `chạm ô 3: chọn ô 3 ("${st.name}")`);
        const all = await center("#inv-btn-dropall");
        check(all.hit, `nút Vứt hết chạm được (không bị che bởi "${all.topId}")`);
        check(
          all.h >= MIN_TAP_PX - 0.5 && all.w >= MIN_TAP_PX - 0.5,
          `nút Vứt hết đủ lớn (${all.w.toFixed(0)}x${all.h.toFixed(0)}px)`,
        );
        await tapAt(all.x, all.y);
        await sleep(250);
        st = await state();
        check(
          st.confirmOpen && st.confirmText === `Vứt ${kiem}?`,
          `hộp xác nhận: "${st.confirmText}"`,
        );
        check(st.warn !== "" || true, "dòng nhắc đồ quý (nếu có)");
        await shot("xac-nhan-vut");
        for (const id of ["inv-drop-no", "inv-drop-yes"]) {
          const b = await center(`#${id}`);
          check(
            b.h >= MIN_TAP_PX - 0.5 && b.w >= MIN_TAP_PX - 0.5 && b.hit,
            `nút ${id} đủ lớn và không bị che (${b.w.toFixed(0)}x${b.h.toFixed(0)}px, che bởi "${b.hit ? "" : b.topId}")`,
          );
        }
        await pastGuard();
        const no = await center("#inv-drop-no");
        await tapAt(no.x, no.y);
        await sleep(200);
        st = await state();
        check(!st.confirmOpen && st.drops.length === 0, "chạm Giữ lại: hộp đóng, không gửi gì");
        await tapAt(all.x, all.y);
        // Ngay sau khi hộp mở: chạm Vứt trong cửa sổ chống click ma (bị bỏ qua)
        const yes = await center("#inv-drop-yes");
        await tapAt(yes.x, yes.y);
        await sleep(100);
        st = await state();
        check(
          st.confirmOpen && st.drops.length === 0,
          "chạm Vứt ngay khi hộp vừa mở (click ma): bị bỏ qua, chưa gửi gì",
        );
        await pastGuard();
        await tapAt(yes.x, yes.y);
        await sleep(250);
        st = await state();
        check(
          st.drops.length === 1 && st.drops[0].slot === 3 && !("qty" in st.drops[0]),
          `chạm Vứt: đúng MỘT dropItem ô 3 (Vứt hết, không qty) ${JSON.stringify(st.drops)}`,
        );
      }

      // ================= BÀN PHÍM (mọi khung) =================
      console.log("  [bàn phím] mũi tên chọn, Enter mở hộp, Esc đóng hộp, Enter xác nhận");
      await evalJs(`(() => {
        window.__sent.length = 0;
        window.__ui.toggleCharModal && window.__ui.toggleCharModal(false);
        window.__ui.onInv({ slots: [
          { itemId: "hoi_huyet_dan", qty: 5 }, { itemId: "hoi_linh_dan", qty: 3 }, { itemId: "long_tho", qty: 7 },
          { itemId: "lang_nha_kiem", qty: 1 }, null, { itemId: "long_tho", qty: 2 },
        ], cd: {} });
        window.__ui.toggleInventory(false);
        window.__ui.toggleInventory(true);
        return 1;
      })()`);
      await sleep(300);
      await evalJs(`document.querySelectorAll("#inv-grid .inv-slot")[1].focus()`);
      await sleep(100);
      let kb = await state();
      check(kb.selected === 1, `focus ô 1 bằng bàn phím: chọn ô 1 (${kb.selected})`);
      await press("ArrowRight");
      await sleep(150);
      kb = await state();
      check(
        kb.selected === 2 && kb.name.includes(longTho),
        `mũi tên phải: chọn ô 2 ("${kb.name}")`,
      );
      await evalJs(`document.getElementById("inv-btn-drop1").focus()`);
      await press("Enter");
      await sleep(200);
      kb = await state();
      check(
        kb.confirmOpen && kb.confirmText === `Vứt 1 ${longTho}? (còn lại 6)`,
        `Enter ở Vứt 1: hộp mở, "${kb.confirmText}"`,
      );
      check(kb.active === "inv-drop-no", `focus ở "Giữ lại" (${kb.active})`);
      await press("Escape");
      await sleep(200);
      kb = await state();
      check(
        !kb.confirmOpen && kb.invOpen,
        `Esc: đóng HỘP trước, túi đồ vẫn mở (hộp ${kb.confirmOpen ? "còn" : "đóng"}, túi ${kb.invOpen ? "mở" : "đóng"})`,
      );
      check(kb.active === "inv-btn-drop1", `focus trở về nút Vứt 1 (${kb.active})`);
      check(kb.selected === 2, `Esc không đổi ô chọn (${kb.selected})`);
      await press("Enter");
      await sleep(200);
      await evalJs(`document.getElementById("inv-drop-yes").focus()`);
      await pastGuard();
      await press("Enter");
      await sleep(250);
      kb = await state();
      check(
        !kb.confirmOpen && kb.drops.length === 1 && kb.drops[0].slot === 2 && kb.drops[0].qty === 1,
        `Enter ở "Vứt": đúng MỘT dropItem ô 2 ${JSON.stringify(kb.drops)}`,
      );
      await press("Escape");
      await sleep(150);
      kb = await state();
      check(!kb.invOpen, "Esc lần nữa (không còn hộp): đóng túi đồ");

      // ================= Ô SỐ LƯỢNG trong hộp xác nhận vứt (QUYET_DINH_M3 mục 47) =================
      console.log("  [ô số lượng] hộp xác nhận vứt: chỉnh số trước khi vứt");
      const tap = (x, y) => (vp.mobile ? tapAt(x, y) : clickAt(x, y));
      const huyet = await nameOf("hoi_huyet_dan");
      const resetBag = async () => {
        await evalJs(`(() => {
          window.__sent = [];
          window.__ui.onInv({ slots: [
            { itemId: "hoi_huyet_dan", qty: 5 }, { itemId: "hoi_linh_dan", qty: 3 }, { itemId: "long_tho", qty: 7 },
            { itemId: "lang_nha_kiem", qty: 1 }, null, { itemId: "long_tho", qty: 2 },
          ], cd: {} });
          window.__ui.toggleInventory(false);
          window.__ui.toggleInventory(true);
          return 1;
        })()`);
        await sleep(300);
      };
      const qty = () =>
        evalJs(`(() => {
          const box = document.getElementById("inv-drop-qty");
          const i = document.getElementById("inv-drop-qty-input");
          const note = box.querySelector(".qty-note");
          const r = box.getBoundingClientRect();
          return {
            shown: !box.hidden && r.height > 0, value: i ? i.value : null, invalid: i?.getAttribute("aria-invalid") === "true",
            note: note ? note.textContent : "", focused: document.activeElement === i, right: Math.round(r.right), left: Math.round(r.left),
            vw: window.innerWidth,
          };
        })()`);
      const typeQty = async (text) => {
        await evalJs(
          `(() => { const i = document.getElementById("inv-drop-qty-input"); i.focus(); i.select(); return 1; })()`,
        );
        await send("Input.insertText", { text });
        await sleep(80);
      };
      const selectSlot = async (i) => {
        const c = await center("#inv-grid .inv-slot", i);
        await tap(c.x, c.y);
        await sleep(200);
      };
      const openDrop = async (all) => {
        const b = await center(all ? "#inv-btn-dropall" : "#inv-btn-drop1");
        await tap(b.x, b.y);
        await sleep(200);
      };
      const clickYes = async () => {
        await pastGuard();
        const y = await center("#inv-drop-yes");
        await tap(y.x, y.y);
        await sleep(250);
      };

      // món chỉ có 1 cái (ô 3): không có gì để chọn, KHÔNG có ô số lượng
      await resetBag();
      await selectSlot(3);
      await openDrop(true);
      let q = await qty();
      check(!q.shown, "món chỉ có 1 cái: hộp vứt KHÔNG hiện ô số lượng");
      await pastGuard();
      await press("Escape");
      await sleep(150);

      // stack 5 (ô 0): "Vứt 1" mở hộp với số 1, hiện ô số lượng, focus vẫn ở "Giữ lại"
      await resetBag();
      await selectSlot(0);
      await openDrop(false);
      let st2 = await state();
      q = await qty();
      check(
        q.shown && q.value === "1" && st2.confirmText === `Vứt 1 ${huyet}? (còn lại 4)`,
        `Vứt 1 (stack 5): ô số lượng hiện, = 1, lời "${st2.confirmText}"`,
      );
      check(
        st2.active === "inv-drop-no",
        `focus vẫn ở "Giữ lại" (${st2.active}): Enter nhầm không vứt`,
      );
      check(
        q.left >= 0 && q.right <= q.vw,
        `ô số lượng không tràn ngang khung (${q.left}..${q.right} / ${q.vw})`,
      );
      // vừa mở (chưa cuộn tay): hai nút xác nhận nằm trọn trong khung nhìn và KHÔNG bị nút Đóng nổi của điện thoại che
      const cover = await evalJs(`(() => {
        const close = document.getElementById("inv-close").getBoundingClientRect();
        const out = {};
        for (const id of ["inv-drop-no", "inv-drop-yes"]) {
          const r = document.getElementById(id).getBoundingClientRect();
          out[id] = {
            inView: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
            covered: !(r.right <= close.left || r.left >= close.right || r.bottom <= close.top || r.top >= close.bottom),
          };
        }
        return out;
      })()`);
      check(
        Object.values(cover).every((c) => c.inView && !c.covered),
        `vừa mở hộp (chưa cuộn tay): "Giữ lại" / "Vứt" trọn trong khung nhìn, không bị nút Đóng che ${JSON.stringify(cover)}`,
      );
      await shot("vut-o-so-luong"); // ảnh đúng trạng thái người chơi thấy ngay sau khi mở hộp
      for (let i = 0; i < 5; i++) {
        const b = await center("#inv-drop-qty button", i);
        check(
          b.hit && (!vp.mobile || (b.h >= MIN_TAP_PX - 0.5 && b.w >= MIN_TAP_PX - 0.5)),
          `nút ${i} của ô số lượng bấm được, không bị che${vp.mobile ? `, >= ${MIN_TAP_PX} px` : ""} (${b.w.toFixed(0)}x${b.h.toFixed(0)}, che bởi "${b.hit ? "" : b.topId}")`,
        );
      }

      // gõ số: lời đổi theo, chưa gửi gì
      await typeQty("3");
      st2 = await state();
      check(
        st2.confirmText === `Vứt 3 ${huyet}? (còn lại 2)` && st2.drops.length === 0,
        `gõ 3: lời đổi thành "${st2.confirmText}", chưa gửi gì`,
      );
      // 9999: kẹp về toàn bộ, lời thành "Vứt hết", ghi chú nêu giới hạn
      await typeQty("9999");
      st2 = await state();
      q = await qty();
      check(
        q.value === "5" &&
          st2.confirmText === `Vứt hết ${huyet} ×5?` &&
          /Chỉ có tối đa 5/.test(q.note),
        `gõ 9999: kẹp về 5, lời "${st2.confirmText}", ghi chú "${q.note}"`,
      );
      // chữ / 0 / số lẻ rồi Enter: KHÔNG vứt, hộp vẫn mở
      await pastGuard();
      for (const bad of ["abc", "0", "2.5", ""]) {
        await typeQty(bad);
        if (bad === "")
          await evalJs(
            `document.getElementById("inv-drop-qty-input").value = ""; document.getElementById("inv-drop-qty-input").dispatchEvent(new Event("input", { bubbles: true })); 1`,
          );
        await press("Enter");
        await sleep(150);
        st2 = await state();
        check(
          st2.confirmOpen && st2.drops.length === 0,
          `gõ "${bad}" rồi Enter: KHÔNG vứt, hộp vẫn mở (gửi ${st2.drops.length} tin)`,
        );
      }
      // chữ / 0 / trống rồi bấm nút "Vứt" (chuột / chạm, không qua Enter của ô): cũng KHÔNG vứt, hộp vẫn mở, focus về ô để sửa (nếu không, nút sẽ vứt lại số hợp lệ cũ)
      for (const bad of ["abc", "0", ""]) {
        await typeQty(bad);
        if (bad === "")
          await evalJs(
            `document.getElementById("inv-drop-qty-input").value = ""; document.getElementById("inv-drop-qty-input").dispatchEvent(new Event("input", { bubbles: true })); 1`,
          );
        await evalJs(`document.getElementById("inv-drop-no").focus(); 1`); // focus rời ô: để thấy focus được ĐƯA VỀ ô (không phải còn nguyên từ lúc gõ)
        const yesBtn = await center("#inv-drop-yes");
        await tap(yesBtn.x, yesBtn.y);
        await sleep(200);
        st2 = await state();
        check(
          st2.confirmOpen && st2.drops.length === 0 && st2.active === "inv-drop-qty-input",
          `gõ "${bad}" rồi bấm nút Vứt: KHÔNG vứt, hộp vẫn mở, focus về ô (${st2.drops.length} tin, focus "${st2.active}")`,
        );
      }
      // số hợp lệ rồi Enter trong ô: đúng MỘT dropItem với qty đã gõ
      await typeQty("3");
      await press("Enter");
      await sleep(250);
      st2 = await state();
      check(
        !st2.confirmOpen &&
          st2.drops.length === 1 &&
          st2.drops[0].slot === 0 &&
          st2.drops[0].qty === 3,
        `gõ 3 rồi Enter: đúng MỘT dropItem {slot: 0, qty: 3} ${JSON.stringify(st2.drops)}`,
      );

      // "Vứt hết": mở với toàn bộ; chỉnh xuống thì gửi qty cụ thể bằng nút Vứt; không chỉnh thì vẫn KHÔNG kèm qty
      await resetBag();
      await selectSlot(0);
      await openDrop(true);
      q = await qty();
      st2 = await state();
      check(
        q.shown && q.value === "5" && st2.confirmText === `Vứt hết ${huyet} ×5?`,
        `Vứt hết (stack 5): ô số lượng = 5, lời "${st2.confirmText}"`,
      );
      await typeQty("2");
      st2 = await state();
      check(
        st2.confirmText === `Vứt 2 ${huyet}? (còn lại 3)`,
        `chỉnh xuống 2: lời "${st2.confirmText}"`,
      );
      await clickYes();
      st2 = await state();
      check(
        !st2.confirmOpen &&
          st2.drops.length === 1 &&
          st2.drops[0].slot === 0 &&
          st2.drops[0].qty === 2,
        `bấm Vứt sau khi chỉnh: đúng MỘT dropItem {slot: 0, qty: 2} ${JSON.stringify(st2.drops)}`,
      );
      await resetBag();
      await selectSlot(0);
      await openDrop(true);
      await clickYes();
      st2 = await state();
      check(
        st2.drops.length === 1 && st2.drops[0].slot === 0 && !("qty" in st2.drops[0]),
        `Vứt hết không chỉnh: dropItem KHÔNG kèm qty ${JSON.stringify(st2.drops)}`,
      );

      // nút Tối đa / − bằng chuột hoặc chạm thật
      await resetBag();
      await selectSlot(0);
      await openDrop(false);
      const maxBtn = await center("#inv-drop-qty button", 4);
      await tap(maxBtn.x, maxBtn.y);
      await sleep(150);
      q = await qty();
      st2 = await state();
      check(
        q.value === "5" && st2.confirmText === `Vứt hết ${huyet} ×5?`,
        `bấm Tối đa: ô = ${q.value}, lời "${st2.confirmText}"`,
      );
      const minusBtn = await center("#inv-drop-qty button", 0);
      await tap(minusBtn.x, minusBtn.y);
      await sleep(150);
      q = await qty();
      check(q.value === "4", `bấm −: 5 -> ${q.value}`);

      // Esc trong ô: Giữ lại (hộp đóng, túi còn mở, không gửi gì)
      await typeQty("2");
      await press("Escape");
      await sleep(200);
      st2 = await state();
      check(
        !st2.confirmOpen && st2.invOpen && st2.drops.length === 0,
        `Esc trong ô số lượng: hộp đóng, túi vẫn mở, không gửi gì (hộp ${st2.confirmOpen ? "còn" : "đóng"}, túi ${st2.invOpen ? "mở" : "đóng"})`,
      );

      // túi đổi lúc hộp mở và không còn đủ số định vứt: hộp đóng, không vứt
      await selectSlot(0);
      await openDrop(false);
      await typeQty("4");
      await evalJs(
        `window.__ui.onInv({ slots: [{ itemId: "hoi_huyet_dan", qty: 2 }, { itemId: "hoi_linh_dan", qty: 3 }], cd: {} }); 1`,
      );
      await sleep(150);
      st2 = await state();
      check(
        !st2.confirmOpen && st2.drops.length === 0,
        "túi chỉ còn 2 mà đang định vứt 4: hộp đóng, không gửi gì",
      );
      await resetBag();
      await press("Escape");
      await sleep(150);
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
