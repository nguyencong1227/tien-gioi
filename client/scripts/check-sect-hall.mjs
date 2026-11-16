import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
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
];
const MIN_TAP_PX = 44;

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
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__getMap && window.__scene && window.__ui && window.__sampleSectHall && !document.getElementById("ui")?.hidden)`,
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
        const tabBtns = await evalJs(
          `[...document.querySelectorAll(".sect-tab")].map((b) => Math.round(b.getBoundingClientRect().height))`,
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

      if (shotsDir) {
        await hallOf(3);
        await evalJs(`document.getElementById("sect-tab-btn-hall").click(); 1`);
        await sleep(300);
        const shot = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(shotsDir, `sect-hall-${vp.name}.png`),
          Buffer.from(shot.result.data, "base64"),
        );
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
