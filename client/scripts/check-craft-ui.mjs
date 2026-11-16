import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm giao diện nghề nhỏ lát 1 (#514, issue #769) trong Chrome THẬT ở năm khung nhìn, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-craft-ui.mjs [--shots <thư mục>]
 *
 * Nghề nhỏ chưa có NPC / đan thật (D làm ở #763) nên script CHÈN dữ liệu thử qua `window.__craftData` (chỉ `?debug`): một thợ rèn đổi thành Lò đan
 * (`station: "alchemy"`) kèm một công thức có phí, hai món đan thử (đan hộ đạo đúng bậc người chơi và đan tăng tốc không `forRealm`), rồi dọn lại. Năm cảnh:
 *   1. Lò đan: tiêu đề "Lò Đan · ...", dòng phụ, nút "Luyện" (không còn "Rèn"), gợi ý phí "Luyện: tốn 700 Linh thạch"; thợ rèn thường vẫn "Lò Rèn" / "Rèn".
 *   2. Chip bốn ô (có hại + hộ đạo m:ss + buff chiêu): đúng chữ "Hộ đạo +15% 14:59", không chồng nhau, không ra ngoài màn hình.
 *   3. Túi đồ: nút Dùng MỜ kèm lý do (chưa đỉnh / đang còn hiệu lực), sáng lại khi hết chip; dòng "Hiệu lực: ..." ở khung chi tiết.
 *   4. Qua cổng: có chip chế phẩm thì hộp xác nhận hiện (Y đi / X ở lại, nút >= 44 px, nằm trong màn hình); chỉ có buff chiêu thì KHÔNG hỏi và `travel` gửi đi.
 *   5. Toast thành công khi chip chế phẩm hiện ngay sau một lần bấm Dùng.
 * `--shots`: lưu ảnh `<tên>-<khung>.webp` của cảnh 1-4 (kiểm bằng mắt).
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

/** Mục bấm tối thiểu trên cảm ứng (px CSS), như mọi nút khác của game. */
export const MIN_TAP_PX = 44;

/**
 * Hộp / hàng đo được có nằm gọn trong màn hình và nút đủ lớn không. `rect` = {left, top, right, bottom} (px CSS), `vw` / `vh` = khung nhìn.
 * @returns {string[]} lỗi (rỗng = đạt)
 */
export function judgeBox(label, rect, vw, vh, taps, touch) {
  const errs = [];
  if (!rect || !(rect.right > rect.left) || !(rect.bottom > rect.top)) {
    errs.push(`${label}: hộp không hiện (kích thước 0)`);
    return errs;
  }
  if (rect.left < -1 || rect.top < -1 || rect.right > vw + 1 || rect.bottom > vh + 1)
    errs.push(
      `${label}: ra ngoài màn hình (${rect.left.toFixed(0)},${rect.top.toFixed(0)} - ${rect.right.toFixed(0)},${rect.bottom.toFixed(0)} trong ${vw}x${vh})`,
    );
  if (touch) {
    const low = taps.filter((t) => t.h < MIN_TAP_PX - 0.5 || t.w < MIN_TAP_PX - 0.5);
    if (low.length > 0)
      errs.push(
        `${label}: ${low.length} nút nhỏ hơn ${MIN_TAP_PX}px (${low.map((t) => `${t.w.toFixed(0)}x${t.h.toFixed(0)}`).join(", ")})`,
      );
  }
  return errs;
}

/** Các hình chữ nhật có chồng nhau không (dung sai 1 px): trả số cặp chồng. */
export function overlapPairs(rects) {
  let n = 0;
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (
        a.left < b.right - 1 &&
        b.left < a.right - 1 &&
        a.top < b.bottom - 1 &&
        b.top < a.bottom - 1
      )
        n++;
    }
  return n;
}

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-craft-ui-"));
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
    const pressKey = async (key, code) => {
      for (const type of ["keyDown", "keyUp"])
        await send("Input.dispatchKeyEvent", {
          type,
          key,
          code,
          windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
        });
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem('tg_newbie_guide_dismissed','1'); localStorage.setItem('tg_quality','low'); } catch (e) {}`,
    });

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
      await evalJs("window.__cuOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&map=am_suong`,
      });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__cuOldPage && window.__getMap && window.__craftData && window.__scene && window.__ui && !document.getElementById("ui")?.hidden)`,
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
      const rectOf = (sel) =>
        evalJs(
          `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })()`,
        );
      const tapsOf = (sel) =>
        evalJs(
          `[...document.querySelectorAll(${JSON.stringify(sel)})].map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; })`,
        );
      const report = (errs) => {
        for (const e of errs) check(false, e);
      };

      // ---- Chèn dữ liệu thử (dọn ở cuối khung nhìn) ----
      const me = JSON.parse(
        await evalJs(
          `JSON.stringify({ realm: window.__scene.me().realm, tier: window.__scene.me().tier })`,
        ),
      );
      await evalJs(`(() => {
        const D = window.__craftData;
        D.ITEM_BY_ID.t_dan_hodao = { id: "t_dan_hodao", name: "Hộ Đạo Đan Thử", type: "consumable", stack: 9, rarity: 3,
          desc: "Đan thử: cộng 15% xác suất đột phá lần kế trong 15 phút.", color: 0xffd166,
          effect: { kind: "status", id: "dao_ho", ratio: 0.15, ms: 900000, forRealm: ${me.realm} } };
        D.ITEM_BY_ID.t_dan_tang_toc = { id: "t_dan_tang_toc", name: "Tăng Tốc Đan Thử", type: "consumable", stack: 9, rarity: 2,
          desc: "Đan thử: tăng 30% tốc độ di chuyển trong 8 giây.", color: 0x6ee7b7,
          effect: { kind: "status", id: "haste", ratio: 0.3, ms: 8000 } };
        window.__cuBackup = { station: D.NPC_BY_ID.tho_ren_suong.station, recipes: D.RECIPES.filter((r) => r.npcId === "tho_ren_suong") };
        for (const r of window.__cuBackup.recipes) D.RECIPES.splice(D.RECIPES.indexOf(r), 1);
        D.RECIPES.push({ id: "t_luyen_hodao", npcId: "tho_ren_suong", inputs: [{ itemId: "long_tho", qty: 3 }], output: { itemId: "t_dan_hodao", qty: 1 }, coin: 700 });
        window.__sent = [];
        const room = window.__scene.room;
        room.send = (t, m) => { window.__sent.push([t, m]); };
        return 1;
      })()`);
      const standAt = async (npcId) => {
        await evalJs(
          `(() => { const n = window.__craftData.NPC_BY_ID[${JSON.stringify(npcId)}]; const sc = window.__scene; sc.predX = n.x; sc.predY = n.y; sc.cameras.main.centerOn(n.x, n.y); return 1; })()`,
        );
        await sleep(250);
      };

      // ---- 1. Lò đan (và thợ rèn thường không đổi) ----
      console.log("  [1] bảng chế tác theo trạm");
      await evalJs(`window.__craftData.NPC_BY_ID.tho_ren_suong.station = "alchemy"`);
      await evalJs(
        `(() => { window.__ui.onWallet({ coin: 100000 }); window.__ui.onInv({ slots: [{ itemId: "long_tho", qty: 9 }], cd: {} }); return 1; })()`,
      );
      await standAt("tho_ren_suong");
      await evalJs(`window.__ui.openForgeModal("tho_ren_suong")`);
      await sleep(300);
      const forge = await evalJs(`(() => ({
        title: document.getElementById("forge-title").textContent,
        sub: document.getElementById("forge-sub").textContent,
        btns: [...document.querySelectorAll("#forge-list .forge-btn")].map((b) => ({ text: b.textContent, title: b.title })),
        overflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      }))()`);
      check(/^Lò Đan · /.test(forge.title), `tiêu đề Lò đan: "${forge.title}"`);
      check(!/Rèn/.test(forge.title + forge.sub), `dòng phụ không còn chữ Rèn: "${forge.sub}"`);
      check(
        forge.btns.length === 1 && forge.btns[0].text === "Luyện",
        `nút "Luyện" (${JSON.stringify(forge.btns.map((b) => b.text))})`,
      );
      check(
        /^Luyện: tốn 700 /.test(forge.btns[0]?.title ?? ""),
        `gợi ý phí: "${forge.btns[0]?.title}"`,
      );
      check(forge.overflowX <= 1, `không tràn ngang (${forge.overflowX}px)`);
      if (vp.mobile)
        report(
          judgeBox(
            "nút Luyện",
            await rectOf("#forge-list .forge-btn"),
            vp.w,
            vp.h * 4,
            await tapsOf("#forge-list .forge-btn"),
            true,
          ),
        );
      await shot("lo-dan");
      await evalJs(`window.__ui.closeAllModals()`);
      // thợ rèn thường: không có station -> chữ cũ
      await evalJs(`window.__craftData.NPC_BY_ID.tho_ren_suong.station = undefined`);
      await standAt("tho_ren_suong");
      await evalJs(`window.__ui.openForgeModal("tho_ren_han")`);
      await sleep(250);
      const smith = await evalJs(
        `({ title: document.getElementById("forge-title").textContent, btn: document.querySelector("#forge-list .forge-btn")?.textContent ?? "" })`,
      );
      check(
        /^Lò Rèn · /.test(smith.title) && smith.btn === "Rèn",
        `thợ rèn thường giữ chữ cũ ("${smith.title}" / "${smith.btn}")`,
      );
      await evalJs(`window.__ui.closeAllModals()`);

      // ---- 2. Chip bốn ô ----
      console.log("  [2] chip trạng thái bốn ô");
      await evalJs(
        `window.__scene.onStatus({ list: [["burn", 5000], ["dao_ho", 899000, 0.15], ["haste", 6000, 0.3], ["shield", 59000, 0.2]] })`,
      );
      await sleep(300);
      const chips = await evalJs(
        `[...document.querySelectorAll(".st-badge")].map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.status, label: e.textContent, aria: e.getAttribute("aria-label"), left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })`,
      );
      check(chips.length === 4, `đủ 4 chip (${chips.length})`);
      const dao = chips.find((c) => c.id === "dao_ho");
      check(
        dao && /^Hộ đạo \+15% 1[45]:\d\d$/.test(dao.label),
        `chip Hộ đạo dạng m:ss: "${dao?.label}"`,
      );
      check(
        dao && /còn 14 phút (59|58) giây|còn 15 phút/.test(dao.aria),
        `aria đủ chữ: "${dao?.aria}"`,
      );
      check(overlapPairs(chips) === 0, "các chip không chồng nhau");
      check(
        chips.every(
          (c) => c.left >= -1 && c.right <= vp.w + 1 && c.top >= -1 && c.bottom <= vp.h + 1,
        ),
        "mọi chip nằm trong màn hình",
      );
      await shot("chip-bon-o");

      // ---- 3. Túi đồ: nút Dùng mờ + dòng Hiệu lực ----
      console.log("  [3] nút Dùng mờ + dòng Hiệu lực");
      await evalJs(`window.__scene.onStatus({ list: [] })`);
      await sleep(200);
      await evalJs(
        `(() => { window.__ui.onInv({ slots: [{ itemId: "t_dan_hodao", qty: 2 }, { itemId: "t_dan_tang_toc", qty: 2 }], cd: {} }); window.__ui.toggleInventory(true); return 1; })()`,
      );
      await sleep(300);
      const pick = async (i) => {
        // `pointerdown` chọn ô (như chuột / chạm); `focus()` không chắc bắn sự kiện khi Chrome headless chưa có tiêu điểm trang
        await evalJs(
          `document.querySelectorAll("#inv-grid button")[${i}].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))`,
        );
        await sleep(150);
        return evalJs(
          `(() => { const b = document.getElementById("inv-btn-use"); return { text: b.textContent, disabled: b.disabled, line: document.getElementById("inv-equip-cmp").hidden ? "" : document.getElementById("inv-equip-cmp").textContent }; })()`,
        );
      };
      const quick = await evalJs(
        `[document.getElementById("quick-1").dataset.itemId, document.getElementById("quick-2").dataset.itemId]`,
      );
      check(
        quick[0] === "hoi_huyet_dan" && quick[1] === "hoi_linh_dan",
        `ô dùng nhanh không bị đan thử chiếm (${JSON.stringify(quick)})`,
      );
      const hodao = await pick(0);
      check(
        hodao.disabled && /^Cần đỉnh .+, đầy tu vi$/.test(hodao.text),
        `đan hộ đạo chưa đỉnh: nút mờ "${hodao.text}"`,
      );
      check(
        hodao.line === "Hiệu lực: cộng 15% xác suất đột phá lần kế · 15 phút",
        `dòng Hiệu lực: "${hodao.line}"`,
      );
      await shot("nut-dung-chua-dinh");
      const haste1 = await pick(1);
      check(
        !haste1.disabled && haste1.text === "Dùng",
        `đan tăng tốc chưa có chip: nút sáng "${haste1.text}"`,
      );
      check(
        haste1.line === "Hiệu lực: tăng 30% tốc độ di chuyển · 8 giây",
        `dòng Hiệu lực: "${haste1.line}"`,
      );
      await evalJs(`window.__scene.onStatus({ list: [["haste", 6000, 0.3]] })`);
      await sleep(350);
      const haste2 = await evalJs(
        `(() => { const b = document.getElementById("inv-btn-use"); return { text: b.textContent, disabled: b.disabled }; })()`,
      );
      check(
        haste2.disabled && haste2.text === "Đang còn hiệu lực",
        `có chip cùng id: nút mờ "${haste2.text}"`,
      );
      // tấm túi đồ tự cuộn trên điện thoại ngang: cuộn nút vào tầm nhìn rồi mới đo
      await evalJs(`document.getElementById("inv-btn-use").scrollIntoView({ block: "center" })`);
      await sleep(150);
      if (vp.mobile)
        report(
          judgeBox(
            "nút Dùng",
            await rectOf("#inv-btn-use"),
            vp.w,
            vp.h,
            await tapsOf("#inv-btn-use"),
            true,
          ),
        );
      await shot("nut-dung-con-hieu-luc");
      // hết hạn: chip mất thì nút sáng lại (scene báo mỗi ~60 ms)
      await evalJs(`window.__scene.onStatus({ list: [] })`);
      await sleep(400);
      const haste3 = await evalJs(
        `(() => { const b = document.getElementById("inv-btn-use"); return { text: b.textContent, disabled: b.disabled }; })()`,
      );
      check(
        !haste3.disabled && haste3.text === "Dùng",
        `hết hiệu lực: nút sáng lại "${haste3.text}"`,
      );

      // ---- 5. Toast thành công (bấm Dùng thật rồi máy chủ giả báo chip mới) ----
      console.log("  [5] toast thành công khi dùng đan");
      await evalJs(`window.__sent.length = 0`);
      await evalJs(`document.getElementById("inv-btn-use").click()`);
      await sleep(100);
      const used = await evalJs(`window.__sent.filter((m) => m[0] === "useItem").length`);
      check(used === 1, `bấm Dùng gửi 1 tin useItem (${used})`);
      await evalJs(`window.__scene.onStatus({ list: [["dao_ho", 900000, 0.15]] })`);
      await sleep(150);
      const toast = await evalJs(
        `[...document.querySelectorAll("#toast p")].map((p) => p.textContent)`,
      );
      check(
        toast.some((t) => t === "Hộ đạo: cộng 15% xác suất đột phá lần kế trong 15 phút"),
        `toast thành công: ${JSON.stringify(toast)}`,
      );
      await evalJs(`window.__ui.toggleInventory(false)`);

      // ---- 4. Qua cổng ----
      console.log("  [4] hộp xác nhận qua cổng");
      const portalId = await evalJs(`window.__scene.map.portals[0].id`);
      await evalJs(`window.__sent.length = 0`);
      await evalJs(`window.__scene.onStatus({ list: [["haste", 6000, 0.3]] })`); // chỉ buff chiêu: KHÔNG hỏi
      await evalJs(`window.__scene.travelPortal(${JSON.stringify(portalId)})`);
      await sleep(150);
      check(
        (await evalJs(`window.__sent.filter((m) => m[0] === "travel").length`)) === 1,
        "chỉ buff chiêu: gửi travel ngay, không hỏi",
      );
      check(
        !(await evalJs(`window.__ui.isTravelConfirmOpen()`)),
        "chỉ buff chiêu: không hiện hộp xác nhận",
      );
      await evalJs(`window.__sent.length = 0`);
      await evalJs(
        `window.__scene.onStatus({ list: [["haste", 6000, 0.3], ["dao_ho", 600000, 0.15]] })`,
      );
      await evalJs(`window.__scene.travelPortal(${JSON.stringify(portalId)})`);
      await sleep(250);
      check(await evalJs(`window.__ui.isTravelConfirmOpen()`), "có chip Hộ đạo: hộp xác nhận hiện");
      check(
        (await evalJs(`window.__sent.filter((m) => m[0] === "travel").length`)) === 0,
        "chưa gửi travel khi chưa chọn Đi",
      );
      const txt = await evalJs(`document.getElementById("travel-confirm-text").textContent`);
      check(txt === "Qua cổng sẽ mất Hộ đạo. Vẫn đi?", `lời hộp: "${txt}"`);
      report(
        judgeBox(
          "hộp qua cổng",
          await rectOf("#travel-confirm"),
          vp.w,
          vp.h,
          await tapsOf("#travel-confirm button"),
          vp.mobile,
        ),
      );
      await shot("xac-nhan-qua-cong");
      await pressKey("x", "KeyX");
      await sleep(200);
      check(!(await evalJs(`window.__ui.isTravelConfirmOpen()`)), "phím X (Ở lại): hộp đóng");
      check(
        (await evalJs(`window.__sent.filter((m) => m[0] === "travel").length`)) === 0,
        "Ở lại: KHÔNG gửi travel",
      );
      await evalJs(`window.__scene.travelPortal(${JSON.stringify(portalId)})`);
      await sleep(200);
      await pressKey("y", "KeyY");
      await sleep(250);
      check(!(await evalJs(`window.__ui.isTravelConfirmOpen()`)), "phím Y (Đi): hộp đóng");
      check(
        (await evalJs(`window.__sent.filter((m) => m[0] === "travel").length`)) === 1,
        "Đi: gửi đúng 1 tin travel",
      );
      // hết hạn trong lúc hộp đang mở: tự đóng
      await evalJs(`window.__sent.length = 0`);
      await evalJs(`window.__scene.travelPortal(${JSON.stringify(portalId)})`);
      await sleep(150);
      await evalJs(`window.__scene.onStatus({ list: [] })`);
      await sleep(400);
      check(
        !(await evalJs(`window.__ui.isTravelConfirmOpen()`)),
        "chip hết hạn khi hộp đang mở: hộp tự đóng",
      );

      // ---- Dọn dữ liệu thử ----
      await evalJs(`(() => {
        const D = window.__craftData;
        delete D.ITEM_BY_ID.t_dan_hodao; delete D.ITEM_BY_ID.t_dan_tang_toc;
        D.RECIPES.splice(D.RECIPES.findIndex((r) => r.id === "t_luyen_hodao"), 1);
        for (const r of window.__cuBackup.recipes) D.RECIPES.push(r);
        D.NPC_BY_ID.tho_ren_suong.station = window.__cuBackup.station;
        return 1;
      })()`);
    }
  } finally {
    chrome.kill("SIGKILL");
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
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
