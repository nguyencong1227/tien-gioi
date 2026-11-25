import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, Buffer */
/**
 * Kiểm tab "Nội vụ" của bảng Tông môn (M8.6, issue #843; `sect-hall.ts` + `sect-hall-ui.ts` + `ui.ts`) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-sect-hall.mjs [--shots <thư mục>] [--vp <khung>]
 *
 * Dùng `window.__ui.onSect` + `window.__ui.onSectHall` với ảnh chụp MẪU của `shared/` (`window.__sampleSectHall`), bắt tin gửi đi bằng cách đè `window.__scene.room.send`:
 *   - vào tab xin `sectHallGet`; chưa có ảnh chụp thì ghi "Đang tải"; năm tab không tràn ngang;
 *   - cấp tông + thanh điểm (aria progressbar), cống hiến / công tích, 3 nhiệm vụ (đã xong / đang làm / chưa nhận), cửa hàng chia Bảo khố / Tàng Kinh Các;
 *   - nút Nhận / Trả / Đổi gửi ĐÚNG tin (`sectQuestAccept` / `sectQuestTurnIn` / `sectShopBuy`), khoá "Đang xử lý…" tới khi có ảnh chụp mới hoặc toast;
 *   - món khoá nêu LÝ DO bằng chữ (liên kết `aria-describedby`); mới vào tông: "sang ngày mới" + Trả mờ; đã gục: khoá tất cả bằng chuỗi `down`;
 *   - qua mốc đặt lại: xin ảnh chụp mới ĐÚNG MỘT lần; rời tông: hộp xác nhận nêu số cống hiến + công tích sẽ MẤT;
 *   - không chữ Hán, không tràn ngang, nút >= 44 px trên điện thoại. `--shots`: lưu ảnh mỗi khung nhìn.
 */
/**
 * Kiểm DỪNG NGAY + ĐỐI CHIẾU MƯỢT (QUYET_DINH_M3 mục 41: di chuyển "trôi" trên v0.3.1) trong Chrome THẬT, chế độ mock (không cần máy chủ / Vite):
 *
 *   npm run build -w client && node client/scripts/check-move-stop.mjs [--vp <khung>] [--reps <số lần đo độ trễ, mặc định 12>]
 *
 *   [1] NHẢ PHÍM -> tin DỪNG {dx: 0, dy: 0} gửi NGAY (trong ~1 khung vẽ, không chờ nhịp 50 ms), đúng 3 tin, seq liên tiếp tăng dần sau input di chuyển cuối;
 *   [2] đứng yên thì KHÔNG gửi gì thêm (không spam tin dừng);
 *   [3] ĐI LẠI giữa chừng huỷ phần lặp cũ: không có tin dừng "mồ côi" sau input di chuyển mới; nhả lần hai mới có bộ tin dừng mới;
 *   [4] mở bảng (chặn phím) khi đang giữ phím: cũng gửi tin dừng (hết ý định đi);
 *   [5] ĐỐI CHIẾU MƯỢT: `pred` nhảy lùi 20 px (máy chủ bỏ / xoá input): nhân vật vẽ KHÔNG giật tức thì mà trượt về trong ~150-600 ms, không đoạn nào quá 40 % độ lệch trong một khung;
 *       lệch lớn (200 px) thì dịch chuyển TỨC THÌ (không lao ngang màn hình).
 *
 * Mock không chạy đối chiếu thật nên script ghi đè `room.send` để bắt tin, và gọi `reconcile()` của cảnh khi cần.
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
import { waitPageTarget, waitUntilTrue } from "./chrome-wait.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");

export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
  { name: "640x360", w: 640, h: 360, dpr: 2, mobile: true },
];
const MIN_TAP_PX = 44;
/** Cấp tông cao nhất (`SECT_LEVEL_MAX` của shared/): ở cấp này mọi món đã mở theo cấp */
const SECT_LEVEL_MAX_FOR_CHECK = 5;

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-sect-hall-"));
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
    const page = await waitPageTarget(CDP_PORT);
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
      console.log(`\n=== ${vp.name} ===`);
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
              `Boolean(!window.__isOldPage && window.__getMap && window.__scene && window.__ui && window.__sampleSectHall && !document.getElementById("ui")?.hidden)`,
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
      await evalJs(`(() => {
        window.__sent = [];
        window.__scene.room.send = (t, m) => { window.__sent.push([t, m]); };
        return 1;
      })()`);
      const NOW = Date.now();
      const sect = {
        sect: {
          name: "Thanh Vân",
          tag: "TV",
          motd: "",
          myRank: "chu",
          members: [{ name: "Mộc Thanh", rank: "chu", joinedAt: NOW - 86400000 }],
          coin: 0,
          log: [],
          createdAt: NOW - 86400000,
        },
      };
      const sent = () => evalJs(`window.__sent.filter((m) => /^sect(Hall|Quest|Shop)/.test(m[0]))`);
      const clearSent = () => evalJs(`window.__sent.length = 0; 1`);
      const hallOf = (level, patch = "") =>
        evalJs(
          `(() => { const v = window.__sampleSectHall(${level}, Date.now()); ${patch}; window.__ui.onSectHall({ hall: v }); return 1; })()`,
        );
      const text = () => evalJs(`document.getElementById("sect-tab-hall").innerText`);
      const overflow = () =>
        evalJs(`(() => {
          const m = document.getElementById("sect-modal");
          const t = document.getElementById("sect-tab-hall");
          const tabs = document.querySelector(".sect-tabs");
          return { modal: m.scrollWidth - m.clientWidth, tab: t.scrollWidth - t.clientWidth, tabs: tabs.scrollWidth - tabs.clientWidth };
        })()`);
      const btns = () =>
        evalJs(`[...document.querySelectorAll("#sect-tab-hall button")].map((b) => ({
          label: b.textContent, disabled: b.disabled, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width),
          desc: b.getAttribute("aria-describedby"),
          descText: b.getAttribute("aria-describedby") ? (document.getElementById(b.getAttribute("aria-describedby"))?.textContent ?? "") : ""
        }))`);
      const click = (label, nth = 0) =>
        evalJs(
          `(() => { const bs = [...document.querySelectorAll("#sect-tab-hall button")].filter((b) => b.textContent === ${JSON.stringify(label)}); if (!bs[${nth}]) return false; bs[${nth}].click(); return true; })()`,
        );

      // ---- vào tab: xin ảnh chụp, chưa có thì "Đang tải" ----
      await evalJs(
        `window.__ui.toggleSectModal(true); window.__ui.onSect(${JSON.stringify(sect)}); 1`,
      );
      await sleep(150);
      await clearSent();
      await evalJs(`document.getElementById("sect-tab-btn-hall").click(); 1`);
      await sleep(150);
      check(
        (await sent()).some((m) => m[0] === "sectHallGet"),
        "vào tab Nội vụ: gửi sectHallGet",
      );
      check(
        (await text()).includes("Đang tải"),
        "chưa có ảnh chụp: ghi 'Đang tải nội vụ tông môn'",
      );
      const tabsOv = await overflow();
      check(
        tabsOv.tabs <= 1 && tabsOv.modal <= 1,
        `năm tab không tràn ngang (tab ${tabsOv.tabs}, bảng ${tabsOv.modal})`,
      );

      // ---- ảnh chụp mẫu cấp 2 ----
      await hallOf(2);
      await sleep(150);
      const t2 = await text();
      check(/Cấp tông 2: /.test(t2), `cấp tông + tên cấp: ${JSON.stringify(t2.split("\n")[0])}`);
      check(
        await evalJs(
          `(() => { const b = document.querySelector("#sect-tab-hall [role=progressbar]"); return Boolean(b && b.getAttribute("aria-valuenow") !== null && b.getAttribute("aria-valuemax") && b.getAttribute("aria-valuetext") && b.getAttribute("aria-labelledby")); })()`,
        ),
        "thanh điểm có aria (progressbar, valuenow / valuemax / valuetext, nhãn)",
      );
      check(
        t2.includes("Cống hiến") && t2.includes("Công tích"),
        "hiện Cống hiến và Công tích của mình",
      );
      check(
        t2.includes("Nhiệm vụ hôm nay") && t2.includes("Cửa hàng tông môn"),
        "có mục Nhiệm vụ hôm nay và Cửa hàng",
      );
      check(t2.includes("Bảo khố"), "cửa hàng chia nhóm Bảo khố");
      check(
        /Đã xong hôm nay/.test(t2) && /Đang làm/.test(t2) && /Chưa nhận/.test(t2),
        "ba nhiệm vụ: đã xong / đang làm / chưa nhận",
      );
      check(
        !new RegExp(
          "[" + String.fromCharCode(0x4e00) + "-" + String.fromCharCode(0x9fff) + "]",
        ).test(t2),
        "không chữ Hán",
      );
      const ov2 = await overflow();
      check(ov2.tab <= 1 && ov2.modal <= 1, `không tràn ngang (tab ${ov2.tab}, bảng ${ov2.modal})`);
      const bs = await btns();
      if (vp.mobile) {
        const small = bs.filter((b) => b.h < MIN_TAP_PX);
        check(
          small.length === 0,
          `mọi nút >= ${MIN_TAP_PX} px (nhỏ nhất ${Math.min(...bs.map((b) => b.h))} px)`,
        );
        // chỉ năm nút của bảng Tông môn: `.sect-tab` còn là lớp của ba tab bảng Xã hội (M9, `#social-tabs`), đang ẩn nên đo ra 0 px
        const tabBtns = await evalJs(
          `[...document.querySelectorAll("#sect-tab-btn-overview, #sect-tab-btn-members, #sect-tab-btn-treasury, #sect-tab-btn-vault, #sect-tab-btn-hall")].map((b) => Math.round(b.getBoundingClientRect().height))`,
        );
        check(
          tabBtns.every((h) => h >= MIN_TAP_PX),
          `năm nút tab >= ${MIN_TAP_PX} px (${tabBtns.join(", ")})`,
        );
      }

      // ---- Nhận / Trả gửi đúng tin, khoá, mở khoá ----
      await clearSent();
      check(await click("Nhận"), "có nút Nhận (nhiệm vụ chưa nhận)");
      await sleep(100);
      const accept = (await sent()).find((m) => m[0] === "sectQuestAccept");
      check(
        Boolean(
          accept && typeof accept[1].questId === "string" && /\.t\d$/.test(accept[1].questId),
        ),
        `Nhận gửi sectQuestAccept {questId}: ${JSON.stringify(accept?.[1])}`,
      );
      const busy = await btns();
      check(
        busy.some((b) => b.label === "Đang xử lý…" && b.disabled),
        "sau khi gửi: nút khoá 'Đang xử lý…'",
      );
      await clearSent();
      await click("Đang xử lý…"); // bấm khi đang khoá không gửi gì
      check((await sent()).length === 0, "bấm nút đang khoá không gửi thêm tin");
      await hallOf(2);
      await sleep(100);
      check(!(await btns()).some((b) => b.label === "Đang xử lý…"), "có ảnh chụp mới: nút mở khoá");
      await clearSent();
      check(await click("Trả"), "có nút Trả (nhiệm vụ đang làm)");
      await sleep(100);
      const turn = (await sent()).find((m) => m[0] === "sectQuestTurnIn");
      check(
        Boolean(turn && typeof turn[1].questId === "string"),
        `Trả gửi sectQuestTurnIn {questId}: ${JSON.stringify(turn?.[1])}`,
      );
      await evalJs(
        `window.__ui.toast({ text: "Nhiệm vụ này không có trong việc hôm nay của tông môn.", tone: "bad" }); 1`,
      );
      await sleep(100);
      check(!(await btns()).some((b) => b.label === "Đang xử lý…"), "toast trả lời: nút mở khoá");

      // ---- cửa hàng: món khoá có LÝ DO bằng chữ; Đổi gửi đúng tin ----
      await hallOf(1);
      await sleep(100);
      const shopBtns = (await btns()).filter((b) => b.label === "Đổi");
      const lockedBtn = shopBtns.find((b) => b.disabled);
      check(
        Boolean(lockedBtn && lockedBtn.desc && /Mở ở cấp tông/.test(lockedBtn.descText)),
        `món khoá có lý do nối aria-describedby: ${JSON.stringify(lockedBtn?.descText)}`,
      );
      await clearSent();
      const idx = shopBtns.filter((b) => b.disabled || !b.disabled).findIndex((b) => !b.disabled);
      check(idx >= 0 && (await click("Đổi", idx)), "có món mua được: bấm Đổi");
      await sleep(100);
      const buy = (await sent()).find((m) => m[0] === "sectShopBuy");
      check(
        Boolean(buy && typeof buy[1].itemId === "string" && buy[1].qty === 1),
        `Đổi gửi sectShopBuy {itemId, qty: 1}: ${JSON.stringify(buy?.[1])}`,
      );
      await hallOf(1);

      // ---- mua nhiều (mục 47): ô số lượng dùng chung trong một khung ngay dưới hàng; "Đổi" vẫn mua nhanh MỘT cái ----
      {
        const NOW_ROWS = `window.__hv`;
        const many = (patch = "") => hallOf(5, `v.me.contrib = 100000; window.__hv = v; ${patch}`);
        // giới hạn mong đợi của từng món, tính độc lập từ dữ liệu (không dùng hàm của client): trần 10, lượt còn lại, cống hiến / giá
        const expectMax = (id) =>
          evalJs(
            `(() => { const v = ${NOW_ROWS}; const e = v.shop.find((x) => x.itemId === ${JSON.stringify(id)}); if (!e || e.locked) return 0; return Math.max(0, Math.min(10, e.left, Math.floor(v.me.contrib / e.cost))); })()`,
          );
        const panels = () =>
          evalJs(
            `[...document.querySelectorAll("#sect-tab-hall .sect-hall-buy")].map((p) => p.closest("li").getAttribute("data-item-id"))`,
          );
        const moreRows = () =>
          evalJs(
            `[...document.querySelectorAll("#sect-tab-hall button.sect-hall-more")].map((b) => b.closest("li").getAttribute("data-item-id"))`,
          );
        const clickMore = (id) =>
          evalJs(
            `(() => { const b = document.querySelector('#sect-tab-hall li[data-item-id="${id}"] button.sect-hall-more'); if (!b) return false; b.click(); return true; })()`,
          );
        const qtyState = () =>
          evalJs(
            `(() => { const i = document.getElementById("sect-shop-qty"); if (!i) return null; const note = i.closest(".qty-stepper")?.querySelector(".qty-note"); return { value: i.value, focused: document.activeElement === i, invalid: i.getAttribute("aria-invalid") === "true", note: note ? note.textContent : "", mode: i.getAttribute("inputmode"), parent: i.closest("li")?.getAttribute("data-item-id") ?? null }; })()`,
          );
        const typeInto = async (text) => {
          await evalJs(
            `(() => { const i = document.getElementById("sect-shop-qty"); i.focus(); i.select(); return 1; })()`,
          );
          await send("Input.insertText", { text });
          await sleep(60);
        };
        const pressKey = async (k, code, vk, text) => {
          await send("Input.dispatchKeyEvent", {
            type: text ? "keyDown" : "rawKeyDown",
            key: k,
            code,
            windowsVirtualKeyCode: vk,
            nativeVirtualKeyCode: vk,
            text,
          });
          await send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: k,
            code,
            windowsVirtualKeyCode: vk,
            nativeVirtualKeyCode: vk,
          });
          await sleep(60);
        };

        await many();
        await sleep(150);
        const ids = await moreRows();
        const allItems = await evalJs(`${NOW_ROWS}.shop.map((e) => e.itemId)`);
        let wantIds = [];
        for (const id of allItems) if ((await expectMax(id)) >= 2) wantIds.push(id);
        check(
          wantIds.length >= 2 &&
            ids.length === wantIds.length &&
            wantIds.every((id) => ids.includes(id)),
          `nút 'Nhiều…' chỉ ở món mua được từ 2 cái trở lên (${ids.length} / ${wantIds.length} món)`,
        );
        const lockedMore = await evalJs(
          `[...document.querySelectorAll("#sect-tab-hall li.sect-hall-row")].filter((li) => li.querySelector("button.sect-hall-more") && [...li.querySelectorAll("button")].some((b) => b.textContent === "Đổi" && b.disabled)).length`,
        );
        check(lockedMore === 0, "món khoá (Đổi mờ) không có nút 'Nhiều…'");
        check((await panels()).length === 0, "chưa bấm gì: không có khung mua nhiều nào");

        // mở khung ở món thứ nhất: đúng MỘT khung, trong đúng hàng, ô số = 1, đang focus, bàn phím số
        const [idA, idB] = ids;
        check(await clickMore(idA), `bấm 'Nhiều…' ở ${idA}`);
        await sleep(120);
        let st = await qtyState();
        check(
          JSON.stringify(await panels()) === JSON.stringify([idA]) &&
            st?.parent === idA &&
            st.value === "1" &&
            st.focused &&
            st.mode === "numeric",
          `khung mở đúng hàng, ô = 1, đang focus, bàn phím số: ${JSON.stringify(st)}`,
        );
        const lab = await evalJs(
          `(() => { const b = document.querySelector('#sect-tab-hall li[data-item-id="${idA}"] button.sect-hall-more'); return { t: b.textContent, e: b.getAttribute("aria-expanded") }; })()`,
        );
        check(
          lab.t === "Gấp lại" && lab.e === "true",
          `nút đổi thành 'Gấp lại', aria-expanded: ${JSON.stringify(lab)}`,
        );

        // sang món khác: khung CHUYỂN (vẫn chỉ một), ô đặt lại 1
        await typeInto("4");
        check(await clickMore(idB), `bấm 'Nhiều…' ở ${idB}`);
        await sleep(120);
        st = await qtyState();
        check(
          JSON.stringify(await panels()) === JSON.stringify([idB]) && st?.value === "1",
          `khung chuyển sang món khác, chỉ còn một, ô đặt lại 1: ${JSON.stringify([await panels(), st?.value])}`,
        );

        // gõ 9999 -> kẹp đúng giới hạn của món (tính độc lập), vùng báo nói rõ giới hạn; số hợp lệ thì vùng báo là xem trước tổng giá
        const maxB = await expectMax(idB);
        await typeInto("9999");
        st = await qtyState();
        check(
          st?.value === String(maxB) && new RegExp(`Chỉ có tối đa ${maxB}`).test(st.note),
          `gõ 9999 kẹp về ${maxB}, vùng báo nêu giới hạn: ${JSON.stringify([st?.value, st?.note])}`,
        );
        await typeInto("2");
        st = await qtyState();
        const price = await evalJs(
          `(() => { const e = window.__hv.shop.find((x) => x.itemId === ${JSON.stringify(idB)}); return e.cost * 2; })()`,
        );
        check(
          st?.value === "2" &&
            st.note.startsWith(`Mất ${price.toLocaleString("vi-VN")} cống hiến, còn `),
          `số hợp lệ: xem trước tổng giá (${price}): ${JSON.stringify(st?.note)}`,
        );
        // chữ / số sai: đánh dấu sai kèm lời nhắc, không bao giờ gửi
        await clearSent();
        await typeInto("abc");
        st = await qtyState();
        check(
          st?.invalid === true && st.note.length > 0,
          `gõ chữ: ô đánh dấu sai kèm lời nhắc: ${JSON.stringify([st?.invalid, st?.note])}`,
        );
        await pressKey("Enter", "Enter", 13, "\r");
        check(
          !(await sent()).some((m) => m[0] === "sectShopBuy"),
          "Enter khi ô sai / trống: KHÔNG gửi gì",
        );
        await typeInto("0");
        await pressKey("Enter", "Enter", 13, "\r");
        check(!(await sent()).some((m) => m[0] === "sectShopBuy"), "gõ 0 rồi Enter: KHÔNG gửi gì");

        // vẽ lại (ảnh chụp mới về) khi đang gõ: GIỮ số, focus, vị trí khung
        await typeInto("2");
        await many();
        await sleep(120);
        st = await qtyState();
        check(
          st?.value === "2" && st.focused && st.parent === idB && (await panels()).length === 1,
          `ảnh chụp mới về lúc đang gõ: giữ số '2', giữ focus, giữ khung: ${JSON.stringify(st)}`,
        );
        // Enter gửi MỘT tin với đúng số lượng, khung đóng
        await clearSent();
        await typeInto("3");
        await pressKey("Enter", "Enter", 13, "\r");
        await sleep(100);
        const bought = (await sent()).filter((m) => m[0] === "sectShopBuy");
        check(
          bought.length === 1 &&
            bought[0][1].itemId === idB &&
            bought[0][1].qty === Math.min(3, maxB),
          `Enter gửi đúng MỘT sectShopBuy {itemId, qty}: ${JSON.stringify(bought)}`,
        );
        check((await panels()).length === 0, "gửi xong: khung đóng");
        await many();

        // nút 'Đổi số này' trong khung cũng gửi đúng số đang gõ; 'Huỷ' đóng không gửi
        await clickMore(idA);
        await sleep(100);
        await typeInto("2");
        await clearSent();
        check(await click("Đổi số này"), "bấm 'Đổi số này'");
        await sleep(100);
        const viaBtn = (await sent()).filter((m) => m[0] === "sectShopBuy");
        check(
          viaBtn.length === 1 &&
            viaBtn[0][1].itemId === idA &&
            viaBtn[0][1].qty === Math.min(2, await expectMax(idA)),
          `'Đổi số này' gửi đúng số: ${JSON.stringify(viaBtn)}`,
        );
        await many();
        await clickMore(idA);
        await sleep(100);
        await clearSent();
        check(await click("Huỷ"), "bấm 'Huỷ'");
        await sleep(100);
        check(
          (await panels()).length === 0 && !(await sent()).some((m) => m[0] === "sectShopBuy"),
          "'Huỷ': khung đóng, không gửi gì",
        );

        // Esc trong ô: huỷ khung, bảng KHÔNG đóng (lần Esc kế mới đóng bảng)
        await clickMore(idA);
        await sleep(100);
        await typeInto("5");
        await pressKey("Escape", "Escape", 27);
        const stillOpen = await evalJs(`!document.getElementById("sect-modal").hidden`);
        check(
          (await panels()).length === 0 && stillOpen,
          `Esc trong ô: khung đóng, bảng Tông môn vẫn mở (${stillOpen})`,
        );

        // món bị khoá / hết lượt khi ảnh chụp mới về: khung đóng, không giữ khung cho món không mua được
        await clickMore(idA);
        await sleep(100);
        await many(`v.shop.find((e) => e.itemId === ${JSON.stringify(idA)}).left = 0`);
        await sleep(120);
        check(
          (await panels()).length === 0 && !(await moreRows()).includes(idA),
          "món hết lượt khi ảnh chụp mới về: khung đóng, không còn nút 'Nhiều…' ở món đó",
        );
        // sang ngày mới (món có lượt lại): khung đã đóng KHÔNG tự bật lên lại với số cũ
        await many();
        await sleep(120);
        check(
          (await panels()).length === 0 && (await moreRows()).includes(idA),
          "món có lượt lại sau đó: nút 'Nhiều…' về, nhưng khung KHÔNG tự bật lại",
        );
        // đã gục: mọi nút mờ, không còn nút 'Nhiều…'
        await evalJs(`window.__scene.me().dead = true; 1`);
        await many();
        await sleep(120);
        check((await moreRows()).length === 0, "đã gục: không còn nút 'Nhiều…'");
        await evalJs(`window.__scene.me().dead = false; 1`);
        await many();
        check(
          (await overflow()).modal <= 0 && (await overflow()).tab <= 0,
          `không tràn ngang sau khi mở khung: ${JSON.stringify(await overflow())}`,
        );
        await hallOf(1);
      }

      // ---- mới vào tông: chờ sang ngày + Trả mờ kèm lý do ----
      await hallOf(2, "v.me.earnFromAt = v.now + 3 * 3600000");
      await sleep(100);
      const tw = await text();
      check(
        /sang ngày mới/.test(tw),
        "mới vào tông: 'sang ngày mới mới kiếm được' + thời gian còn lại",
      );
      const turnBtn = (await btns()).find((b) => b.label === "Trả");
      check(
        Boolean(turnBtn && turnBtn.disabled && /Ngươi mới vào tông môn/.test(turnBtn.descText)),
        `Trả mờ kèm lý do not_warm: ${JSON.stringify(turnBtn?.descText)}`,
      );

      // ---- đã gục: khoá tất cả bằng chuỗi down ----
      await evalJs(`window.__scene.me().dead = true; 1`);
      await hallOf(2);
      await sleep(100);
      const dn = await btns();
      check(
        dn.length > 0 && dn.every((b) => b.disabled),
        "đã gục: mọi nút Nhận / Trả / Đổi bị khoá",
      );
      check((await text()).includes("Ngươi đã gục"), "đã gục: lý do bằng chuỗi down chung");
      await evalJs(`window.__scene.me().dead = false; 1`);

      // ---- qua mốc đặt lại: xin ảnh chụp mới ĐÚNG MỘT lần ----
      await hallOf(2, "v.resetAt = v.now + 2500");
      await sleep(150);
      await clearSent();
      await sleep(4500);
      const gets = (await sent()).filter((m) => m[0] === "sectHallGet").length;
      check(gets === 1, `qua mốc đặt lại: xin sectHallGet đúng 1 lần (đã gửi ${gets})`);
      check(
        (await text()).includes("Đang sang ngày mới"),
        "dòng đếm ngược báo 'Đang sang ngày mới…'",
      );

      // ---- hẹn giờ NỀN: qua mốc đặt lại khi tab Nội vụ ĐÓNG vẫn xin ảnh chụp mới (máy chủ gỡ nhiệm vụ tông quá ngày khi nhận sectHallGet) ----
      await evalJs(
        `window.__ui.toggleSectModal(false); window.__ui.onSect(${JSON.stringify(sect)}); 1`,
      );
      await hallOf(2, "v.resetAt = v.now + 800");
      await clearSent();
      await sleep(800 + 2000 - 700); // chưa tới mốc + biên an toàn 2 s: chưa xin
      let bg = (await sent()).filter((m) => m[0] === "sectHallGet").length;
      check(bg === 0, `tab đóng, chưa qua mốc + biên: chưa xin (đã gửi ${bg})`);
      await sleep(1500);
      bg = (await sent()).filter((m) => m[0] === "sectHallGet").length;
      check(bg === 1, `tab đóng, qua mốc đặt lại: tự xin sectHallGet đúng 1 lần (đã gửi ${bg})`);
      await sleep(3000);
      bg = (await sent()).filter((m) => m[0] === "sectHallGet").length;
      check(bg === 1, `tab đóng: không xin lặp cho cùng một mốc (đã gửi ${bg})`);
      // rời tông trước khi tới mốc: huỷ hẹn giờ, không xin gì
      await hallOf(2, "v.resetAt = v.now + 800");
      await evalJs(`window.__ui.onSect({ sect: null }); 1`);
      await clearSent();
      await sleep(800 + 2000 + 1200);
      bg = (await sent()).filter((m) => m[0] === "sectHallGet").length;
      check(bg === 0, `rời tông trước mốc: không xin ảnh chụp (đã gửi ${bg})`);
      // khôi phục trạng thái cho mục sau (đang ở trong tông, mở bảng)
      await evalJs(
        `window.__ui.onSect(${JSON.stringify(sect)}); window.__ui.toggleSectModal(true); 1`,
      );
      await hallOf(2);

      // ---- danh sách thành viên: hiện CÔNG TÍCH; "Thăng TL" theo giới hạn Trưởng lão của CẤP TÔNG (không cứng 3) ----
      const memberSect = {
        sect: {
          ...sect.sect,
          members: [
            { name: "Mộc Thanh", rank: "chu", joinedAt: NOW - 86400000, merit: 900 },
            { name: "Lão Nhất", rank: "truong_lao", joinedAt: NOW - 86400000, merit: 1234 },
            { name: "Lão Nhị", rank: "truong_lao", joinedAt: NOW - 86400000 },
            { name: "Lão Tam", rank: "truong_lao", joinedAt: NOW - 86400000, merit: 7 },
            { name: "Đệ Tử Một", rank: "de_tu", joinedAt: NOW - 86400000, merit: 40 },
          ],
        },
      };
      const membersView = () =>
        evalJs(`(() => ({
          rows: [...document.querySelectorAll("#sect-members-list .sect-member-item")].map((r) => ({
            name: r.querySelector(".sect-member-name")?.textContent ?? "",
            merit: r.querySelector(".sect-member-merit")?.textContent ?? "",
            promote: (() => { const b = [...r.querySelectorAll("button")].find((x) => x.textContent === "Thăng TL"); return b ? { disabled: b.disabled, title: b.title } : null; })(),
          })),
        }))()`);
      await evalJs(
        `window.__ui.onSect(${JSON.stringify(memberSect)}); document.getElementById("sect-tab-btn-overview").click(); 1`,
      );
      await hallOf(3); // cấp 3: tối đa 5 Trưởng lão (đang có 3)
      await evalJs(`document.getElementById("sect-tab-btn-members").click(); 1`);
      await sleep(150);
      let mv = await membersView();
      const merits = Object.fromEntries(mv.rows.map((r) => [r.name, r.merit]));
      check(
        merits["Lão Nhất"] === "Công tích 1.234" &&
          merits["Đệ Tử Một"] === "Công tích 40" &&
          merits["Lão Tam"] === "Công tích 7" &&
          merits["Lão Nhị"] === "",
        `danh sách thành viên hiện công tích (chỉ người có công tích): ${JSON.stringify(merits)}`,
      );
      const dt = mv.rows.find((r) => r.name === "Đệ Tử Một");
      check(
        dt?.promote && dt.promote.disabled === false,
        `cấp 3 (tối đa 5 Trưởng lão, đang 3): nút Thăng TL BẤM ĐƯỢC (${JSON.stringify(dt?.promote)})`,
      );
      await hallOf(1); // cấp 1: tối đa 3 Trưởng lão (đang 3) -> khoá
      await evalJs(`document.getElementById("sect-tab-btn-overview").click(); 1`);
      await evalJs(`document.getElementById("sect-tab-btn-members").click(); 1`);
      await sleep(150);
      mv = await membersView();
      const dt1 = mv.rows.find((r) => r.name === "Đệ Tử Một");
      check(
        dt1?.promote?.disabled === true && /Đã tối đa 3 Trưởng lão/.test(dt1.promote.title),
        `cấp 1 (tối đa 3, đang 3): nút Thăng TL khoá kèm lý do (${JSON.stringify(dt1?.promote)})`,
      );
      // tổng số thành viên + nút "Mời vào tông môn" theo giới hạn thành viên của CẤP TÔNG (30 ở cấp 1, 40 ở cấp 3): không cứng 30
      const summaryText = () =>
        evalJs(`document.getElementById("sect-members-summary")?.textContent ?? ""`);
      check(
        (await summaryText()) === "Tổng số: 5 / 30",
        `cấp 1: tổng số thành viên '${await summaryText()}' (giới hạn 30)`,
      );
      await hallOf(3);
      await evalJs(`document.getElementById("sect-tab-btn-overview").click(); 1`);
      await evalJs(`document.getElementById("sect-tab-btn-members").click(); 1`);
      await sleep(150);
      check(
        (await summaryText()) === "Tổng số: 5 / 40",
        `cấp 3: tổng số thành viên '${await summaryText()}' (giới hạn 40)`,
      );
      const full30 = {
        sect: {
          ...sect.sect,
          members: Array.from({ length: 30 }, (_, i) => ({
            name: i === 0 ? "Mộc Thanh" : `Đệ tử ${i}`,
            rank: i === 0 ? "chu" : "de_tu",
            joinedAt: NOW - 86400000,
          })),
        },
      };
      const inviteBtn = async () => {
        await evalJs(`window.__ui.openPlayerMenu("Khách Lạ", 1, 1, 200, 200, undefined, ""); 1`);
        await sleep(100);
        return evalJs(
          `(() => { const b = document.getElementById("pm-sect-btn"); return { disabled: b.disabled, text: b.textContent.trim() }; })()`,
        );
      };
      await evalJs(`window.__ui.onSect(${JSON.stringify(full30)}); 1`);
      await hallOf(1); // cấp 1: tối đa 30, đang 30 -> đủ
      let ib = await inviteBtn();
      check(
        ib.disabled && ib.text === "Tông môn đã đủ (30/30)",
        `cấp 1 đang 30 / 30: nút Mời bị khoá: ${JSON.stringify(ib)}`,
      );
      await hallOf(3); // cấp 3: tối đa 40, đang 30 -> còn chỗ
      ib = await inviteBtn();
      check(
        !ib.disabled && ib.text === "Mời vào tông môn",
        `cấp 3 đang 30 / 40: nút Mời BẤM ĐƯỢC (máy chủ còn cho): ${JSON.stringify(ib)}`,
      );
      await evalJs(`window.__ui.closePlayerMenu?.(); 1`);
      await evalJs(`window.__ui.onSect(${JSON.stringify(sect)}); 1`);
      await hallOf(2);

      // ---- rời tông: hộp xác nhận nêu số mất ----
      await hallOf(2, "v.me.contrib = 1234; v.me.merit = 56789");
      await evalJs(`document.getElementById("sect-tab-btn-overview").click(); 1`);
      await sleep(100);
      await evalJs(`document.getElementById("sect-btn-leave").click(); 1`);
      await sleep(100);
      const lv = await evalJs(`document.getElementById("sect-action-confirm-text").textContent`);
      check(
        /MẤT 1\.234 cống hiến và 56\.789 công tích/.test(lv),
        `rời tông nêu số mất: ${JSON.stringify(lv)}`,
      );
      await evalJs(`document.getElementById("sect-action-confirm-cancel").click(); 1`);

      // ---- nhiệm vụ TÔNG MÔN trong sổ nhiệm vụ / HUD: không có NPC giao, trả ở bảng Tông môn ----
      await evalJs(`window.__ui.toggleSectModal(false); 1`);
      // Nhiệm vụ lấy từ ảnh chụp mẫu (dữ liệu THẬT của game, E / D còn thay ở M8.7): không cứng id / tên của bảng khung. `step` lớn = đã xong mọi bước (sẵn sàng trả)
      const hudQuest = await evalJs(
        `(() => { const q = window.__sampleSectHall(2, Date.now()).quests[0]; return { questId: q.questId, title: q.title }; })()`,
      );
      await evalJs(
        `window.__ui.onQuests({ active: [{ id: ${JSON.stringify(hudQuest.questId)}, step: 99, count: 0 }], done: [], dailyDone: [] }); 1`,
      );
      await sleep(150);
      const qt = await evalJs(
        `[...document.querySelectorAll(".qt-item")].map((e) => ({ title: e.querySelector(".qt-title span")?.textContent ?? "", badge: e.querySelector(".qt-badge")?.textContent ?? "", step: e.querySelector(".qt-step")?.textContent ?? "", ready: e.classList.contains("ready") }))`,
      );
      check(
        qt.length === 1 &&
          qt[0].title === hudQuest.title &&
          qt[0].badge === "Tông" &&
          qt[0].ready &&
          /Mở bảng Tông môn > Nội vụ để trả/.test(qt[0].step),
        `HUD: nhiệm vụ tông môn hiện tên + huy hiệu 'Tông' + 'Mở bảng Tông môn > Nội vụ để trả': ${JSON.stringify(qt[0])}`,
      );
      await evalJs(`window.__ui.toggleQuestModal(true); 1`);
      await sleep(200);
      const qc = await evalJs(
        `[...document.querySelectorAll("#quest-list .q-card")].map((c) => ({ giver: c.querySelector(".q-card-head small")?.textContent ?? "", progress: c.querySelector(".q-card-progress")?.textContent ?? "" }))`,
      );
      check(
        qc.length === 1 &&
          qc[0].giver === "Nhiệm vụ nội vụ tông môn" &&
          !/tong_mon/.test(qc[0].giver) &&
          /Mở bảng Tông môn > Nội vụ/.test(qc[0].progress),
        `sổ nhiệm vụ: không hiện id 'tong_mon', ghi nơi trả là bảng Tông môn: ${JSON.stringify(qc[0])}`,
      );
      await evalJs(
        `window.__ui.toggleQuestModal(false); window.__ui.onQuests({ active: [], done: [], dailyDone: [] }); 1`,
      );

      // ---- cửa hàng GOM NHÓM theo cấp tông (bảng thật ~28 món: cuộn dài, nhiều hàng khoá) ----
      // Kỳ vọng suy ra từ chính bảng `shop` của ảnh chụp mẫu (khớp `SECT_SHOP` thật; `sanitizeHallView` bỏ món lạ nên không bơm bảng riêng được), nên script đúng với mọi bảng.
      {
        const shopOf = (level) => evalJs(`window.__sampleSectHall(${level}, Date.now()).shop`);
        // oracle độc lập với `hallShopGroups`: món đã mở theo cấp; nhóm chưa mở theo cấp tăng dần; chỉ cấp kế tiếp (nhỏ nhất trên cả hai gian) mở sẵn
        const expectFor = (shop, level) => {
          const lockedLv = shop.filter((r) => r.minLevel > level).map((r) => r.minLevel);
          const next = lockedLv.length ? Math.min(...lockedLv) : null;
          const groups = [];
          let visible = 0;
          const subs = [];
          for (const hall of ["baoKho", "tangKinh"]) {
            const mine = shop.filter((r) => r.hall === hall);
            if (!mine.length) continue;
            subs.push(hall === "baoKho" ? "Bảo khố" : "Tàng Kinh Các");
            visible += mine.filter((r) => r.minLevel <= level).length;
            for (const lv of [
              ...new Set(mine.filter((r) => r.minLevel > level).map((r) => r.minLevel)),
            ].sort((a, b) => a - b)) {
              const n = mine.filter((r) => r.minLevel === lv).length;
              const open = lv === next;
              groups.push({ lv, n, open });
              if (open) visible += n;
            }
          }
          return { groups, visible, subs, total: shop.length };
        };
        const probe = () =>
          evalJs(`(() => {
            const card = [...document.querySelectorAll("#sect-tab-hall section")].find((x) => x.querySelector("h4")?.textContent.trim() === "Cửa hàng tông môn");
            const rows = [...card.querySelectorAll("li.sect-hall-row")];
            const vis = (e) => e.checkVisibility() && e.getBoundingClientRect().height > 0;
            const groups = [...card.querySelectorAll("details.sect-hall-group")].map((d) => ({
              title: d.querySelector("summary").textContent, open: d.open, n: d.querySelectorAll("li.sect-hall-row").length,
              sumH: Math.round(d.querySelector("summary").getBoundingClientRect().height),
            }));
            const modal = document.getElementById("sect-modal");
            return { total: rows.length, visible: rows.filter(vis).length, groups, subs: [...card.querySelectorAll("h5")].map((h) => h.textContent), overflow: modal.scrollWidth - modal.clientWidth, cardH: Math.round(card.getBoundingClientRect().height) };
          })()`);
        const toggleGroup = (title) =>
          evalJs(
            `(() => { const s = [...document.querySelectorAll("#sect-tab-hall summary")].find((x) => x.textContent.startsWith(${JSON.stringify(title)})); if (!s) return false; s.click(); return true; })()`,
          );
        const key = (type, k, code, vk, text) =>
          send("Input.dispatchKeyEvent", {
            type,
            key: k,
            code,
            windowsVirtualKeyCode: vk,
            nativeVirtualKeyCode: vk,
            text: type === "keyDown" ? text : undefined,
          });
        const lvOf = (title) => Number(/Mở ở cấp tông (\d+)/.exec(title)?.[1]);

        await evalJs(
          `window.__ui.toggleSectModal(true); window.__ui.onSect(${JSON.stringify(sect)}); 1`,
        );
        await evalJs(`document.getElementById("sect-tab-btn-hall").click(); 1`);
        for (const level of [1, 2, 3, 4, 5]) {
          const shop = await shopOf(level);
          const want = expectFor(shop, level);
          await hallOf(level);
          await sleep(180);
          const g = await probe();
          console.log(
            `    (cấp ${level}: thẻ cửa hàng cao ${g.cardH} px, ${g.visible} / ${g.total} hàng nhìn thấy)`,
          );
          check(
            g.total === want.total,
            `gom nhóm cấp ${level}: đủ ${want.total} hàng trong DOM, không bỏ món nào (${g.total})`,
          );
          check(
            JSON.stringify(g.subs) === JSON.stringify(want.subs),
            `cấp ${level}: tiêu đề gian ${JSON.stringify(g.subs)}`,
          );
          check(
            JSON.stringify(g.groups.map((x) => [lvOf(x.title), x.n, x.open])) ===
              JSON.stringify(want.groups.map((x) => [x.lv, x.n, x.open])),
            `cấp ${level}: nhóm chưa mở (cấp, số món, mở sẵn) khớp: ${JSON.stringify(g.groups.map((x) => [lvOf(x.title), x.n, x.open]))}`,
          );
          check(
            g.visible === want.visible,
            `cấp ${level}: ${g.visible} / ${g.total} hàng nhìn thấy (cần ${want.visible})`,
          );
          check(g.overflow <= 1, `cấp ${level}: không tràn ngang (${g.overflow})`);
          if (vp.mobile && g.groups.length)
            check(
              g.groups.every((x) => x.sumH >= MIN_TAP_PX),
              `cấp ${level}: tiêu đề nhóm >= ${MIN_TAP_PX} px (${JSON.stringify(g.groups.map((x) => x.sumH))})`,
            );
          if (level === SECT_LEVEL_MAX_FOR_CHECK)
            check(g.groups.length === 0, "cấp tông cao nhất: không còn nhóm nào");
        }

        // tương tác ở cấp 1: mở một nhóm đang thu, thu một nhóm đang mở sẵn, bàn phím; vẽ lại vẫn giữ lựa chọn
        const shop1 = await shopOf(1);
        const want1 = expectFor(shop1, 1);
        await hallOf(1);
        await sleep(180);
        let g = await probe();
        const collapsed = g.groups.find((x) => !x.open);
        const openByDefault = g.groups.find((x) => x.open);
        if (collapsed) {
          const before = g.visible;
          check(
            await toggleGroup(collapsed.title.split(" · ")[0]),
            "bấm tiêu đề một nhóm đang thu",
          );
          await sleep(150);
          g = await probe();
          check(
            g.visible === before + collapsed.n,
            `nhóm mở ra: ${g.visible} hàng (cần ${before + collapsed.n})`,
          );
          await hallOf(1);
          await sleep(180);
          g = await probe();
          check(
            g.groups.find((x) => x.title === collapsed.title)?.open === true,
            "vẽ lại tab (ảnh chụp mới): nhóm người chơi vừa mở VẪN mở",
          );
          check(await toggleGroup(collapsed.title.split(" · ")[0]), "thu lại nhóm vừa mở");
          await sleep(150);
        }
        if (openByDefault) {
          check(
            await toggleGroup(openByDefault.title.split(" · ")[0]),
            "bấm tiêu đề nhóm đang mở sẵn",
          );
          await sleep(150);
          await hallOf(1);
          await sleep(180);
          g = await probe();
          check(
            g.groups.find((x) => x.title === openByDefault.title)?.open === false,
            "nhóm mở sẵn mà người chơi vừa thu VẪN thu sau khi vẽ lại",
          );
          await toggleGroup(openByDefault.title.split(" · ")[0]);
          await sleep(150);
        }
        const kbTitle = (await probe()).groups.find((x) => !x.open)?.title;
        if (kbTitle) {
          await evalJs(
            `[...document.querySelectorAll("#sect-tab-hall summary")].find((x) => x.textContent === ${JSON.stringify(kbTitle)}).focus(); 1`,
          );
          const isOpen = async () => (await probe()).groups.find((x) => x.title === kbTitle).open;
          const k0 = await isOpen();
          await key("keyDown", "Enter", "Enter", 13, "\r");
          await key("keyUp", "Enter", "Enter", 13);
          await sleep(150);
          const k1 = await isOpen();
          await key("keyDown", " ", "Space", 32, " ");
          await key("keyUp", " ", "Space", 32);
          await sleep(150);
          const k2 = await isOpen();
          check(
            k0 === false && k1 === true && k2 === false,
            `bàn phím: Enter mở, Cách thu một nhóm (${k0} -> ${k1} -> ${k2})`,
          );
        }
        check(
          want1.groups.length === 0 || (await probe()).groups.length === want1.groups.length,
          "sau các thao tác số nhóm không đổi",
        );
        await evalJs(`window.__ui.toggleSectModal(false); 1`);
      }

      if (shotsDir) {
        // Bảng Tông môn ĐANG MỞ ở tab Nội vụ (các bước trên đã đóng bảng để kiểm HUD / sổ nhiệm vụ: không mở lại thì ảnh chỉ có màn chơi)
        await evalJs(
          `window.__ui.toggleSectModal(true); window.__ui.onSect(${JSON.stringify(sect)}); 1`,
        );
        await hallOf(3);
        await evalJs(`document.getElementById("sect-tab-btn-hall").click(); 1`);
        await sleep(300);
        const snap = async (suffix) => {
          const shot = await send("Page.captureScreenshot", { format: "webp", quality: 85 });
          fs.writeFileSync(
            path.join(shotsDir, `sect-hall-${vp.name}${suffix}.webp`),
            Buffer.from(shot.result.data, "base64"),
          );
        };
        await snap("");
        // cuộn tới hai mục dưới để ảnh cũng thấy nhiệm vụ + cửa hàng
        for (const [heading, suffix] of [
          ["Nhiệm vụ hôm nay", "-nhiem-vu"],
          ["Cửa hàng tông môn", "-cua-hang"],
        ]) {
          await evalJs(
            `(() => { const h = [...document.querySelectorAll("#sect-tab-hall h4, #sect-tab-hall h3")].find((x) => x.textContent.trim() === ${JSON.stringify(heading)}); if (h) h.scrollIntoView({ block: "start" }); return Boolean(h); })()`,
          );
          await sleep(200);
          await snap(suffix);
        }
        // nhóm chưa mở của cửa hàng (nếu có): cuộn tới tiêu đề nhóm đầu tiên để ảnh thấy nhóm thu gọn và nhóm mở sẵn
        const hasGroup = await evalJs(
          `(() => { const s = document.querySelector("#sect-tab-hall summary.sect-hall-group-title"); if (!s) return false; s.scrollIntoView({ block: "center" }); return true; })()`,
        );
        if (hasGroup) {
          await sleep(200);
          await snap("-cua-hang-nhom");
        }
        // khung "mua nhiều" đang mở (ô số lượng + xem trước + nút): ảnh để người duyệt xem bố cục ở từng khung nhìn
        await hallOf(5, "v.me.contrib = 100000");
        const opened = await evalJs(
          `(() => { const b = document.querySelector("#sect-tab-hall button.sect-hall-more"); if (!b) return false; b.click(); document.querySelector("#sect-tab-hall .sect-hall-buy")?.scrollIntoView({ block: "center" }); return true; })()`,
        );
        if (opened) {
          await sleep(250);
          await snap("-mua-nhieu");
        }
      }
      await evalJs(`window.__ui.toggleSectModal(false); 1`);
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
