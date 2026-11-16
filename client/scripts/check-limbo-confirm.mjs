import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, Buffer */
/**
 * Kiểm hộp xác nhận ở màn HOÀNG TUYỀN (issue #779, docs/RA_SOAT_THAO_TAC.md hàng 11, 12; `act-confirm.ts`: `unlockPlan` / `rebirthPlan`) trong Chrome THẬT, chế độ mock (`?duel=mock&debug=1`,
 * `window.__debugLimbo`; không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-limbo-confirm.mjs [--shots <thư mục>] [--vp <khung>]
 *
 *   - mở nấc chân linh / xuất thân bằng Duyên: hộp "Mở <tên> tốn N Duyên (còn lại M)?" + nhắc không hoàn lại; chưa trừ gì khi chưa xác nhận; bấm "Mở" NGAY khi hộp vừa mở (click ma) bị bỏ qua;
 *     xác nhận trừ ĐÚNG MỘT lần (không bị click ma rơi xuống nút bên dưới mở lại hộp); "Giữ lại" / Esc (chỉ đóng hộp, Hoàng Tuyền còn mở) / X không trừ;
 *   - Duyên đổi giữa lúc hộp mở: xác nhận huỷ + thông báo, không trừ theo lời hỏi cũ;
 *   - đầu thai: hộp TÓM TẮT "Đầu thai làm <xuất thân>, giữ K di vật, khắc N chiêu?"; "Xem lại" quay về màn chọn; xác nhận gửi đúng MỘT tin kèm lựa chọn; bàn phím: Enter chỉ mở hộp, Y gửi;
 *   - máy chủ đóng Hoàng Tuyền lúc hộp còn mở: hộp đóng theo.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-limbo-confirm-"));
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
      await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/?duel=mock&debug=1` });
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && typeof window.__debugLimbo === "function" && window.__ui)`,
          ),
        );
      }
      if (!ready) {
        console.log("  ✗ trang không sẵn sàng (cần ?duel=mock&debug=1)");
        failures++;
        continue;
      }
      await sleep(600);
      const shot = async (name) => {
        if (!shotsDir) return;
        await sleep(150);
        const s = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(
          path.join(shotsDir, `${name}-${vp.name}.webp`),
          Buffer.from(s.result.data, "base64"),
        );
      };
      /** Tâm của phần tử (cuộn vào tầm nhìn) + phần tử TẠI điểm đó */
      const center = (sel) =>
        evalJs(`(() => {
          const e = document.querySelector(${JSON.stringify(sel)});
          if (!e) return null;
          e.scrollIntoView({ block: "center", inline: "center" });
          const r = e.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const top = document.elementFromPoint(x, y);
          return { x, y, w: r.width, h: r.height, hit: !!top && (top === e || e.contains(top)) };
        })()`);
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
          await send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            buttons: 1,
            clickCount: 1,
          });
          await send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            buttons: 0,
            clickCount: 1,
          });
        }
      };
      const key = async (code, k, vk) => {
        await send("Input.dispatchKeyEvent", {
          type: k === "Enter" ? "keyDown" : "rawKeyDown", // Enter: `keyDown` kèm `text` thì Chrome mới tạo `click` trên nút đang focus (như bàn phím thật)
          key: k,
          code,
          windowsVirtualKeyCode: vk,
          ...(k === "Enter" ? { text: "\r" } : {}),
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: k,
          code,
          windowsVirtualKeyCode: vk,
        });
      };
      const box = () =>
        evalJs(`(() => ({
          open: window.__ui.isActConfirmOpen(),
          text: document.getElementById("act-confirm-text").textContent,
          warn: document.getElementById("act-confirm-warn").hidden ? "" : document.getElementById("act-confirm-warn").textContent,
          yes: document.getElementById("act-btn-yes-label").textContent,
          no: document.getElementById("act-btn-no-label").textContent,
          active: document.activeElement?.id ?? "",
        }))()`);
      const duyen = () =>
        evalJs(`Number(document.getElementById("limbo-duyen-total")?.textContent)`);
      const choices = () => evalJs(`window.__rebirthChoices ?? []`);
      const limboOpen = () => evalJs(`window.__ui.isLimboOpen()`);
      const MOCK = {
        summary: { kiep: 1, realm: 1, tier: 4, minutes: 42, kills: 68, bossKills: 1, gain: 16 },
        soul: {
          kiep: 1,
          duyen: 500,
          unlocks: { ky_vat: 1, khac: 1 },
          origins: [],
          engraved: ["ung_trao"],
        },
        keepable: ["lang_nha_kiem", "tho_nhung_bao"],
        engravable: ["ung_trao", "hoa_van_kiem", "me_tung_bo"],
      };
      const openLimbo = async () => {
        await evalJs(
          `window.__rebirthChoices = []; window.__ui.hideLimbo(); window.__debugLimbo(${JSON.stringify(MOCK)}); 1`,
        );
        await sleep(400);
      };

      console.log(
        "  [1] mở nấc chân linh bằng Duyên: hộp nêu tên + giá + Duyên còn lại; chưa trừ gì khi chưa xác nhận",
      );
      await openLimbo();
      check((await duyen()) === 500, "Duyên ban đầu 500");
      let b = await center('[data-nav="stone:khac"]');
      check(b && b.hit, "nút Mở Khắc chân linh bấm được");
      await tap(b.x, b.y);
      await sleep(100);
      let st = await box();
      check(st.open, "hộp xác nhận mở");
      check(
        /^Mở Khắc chân linh nấc 2 tốn \d+ Duyên \(còn lại \d+\)\?$/.test(st.text),
        `câu hỏi: "${st.text}"`,
      );
      check(/không hoàn lại/.test(st.warn), `nhắc: "${st.warn}"`);
      check(st.yes === "Mở" && st.no === "Giữ lại", `nút: "${st.no}" / "${st.yes}"`);
      check(st.active === "act-btn-no", `focus ở "Giữ lại" (${st.active})`);
      check((await duyen()) === 500, "chưa trừ Duyên");
      const yes1 = await center("#act-btn-yes");
      check(
        yes1.hit && (!vp.mobile || (yes1.w >= 44 && yes1.h >= 44)),
        `nút Mở trong hộp bấm được, không bị che (${Math.round(yes1.w)}x${Math.round(yes1.h)})`,
      );
      await tap(yes1.x, yes1.y);
      await sleep(150);
      check(
        (await box()).open && (await duyen()) === 500,
        "bấm NGAY khi hộp vừa mở (click ma): bị bỏ qua",
      );
      await shot("hoang-tuyen-mo-duyen");
      await sleep(560);
      await tap(yes1.x, yes1.y);
      await sleep(700);
      check(
        !(await box()).open && (await duyen()) === 490,
        `xác nhận sau cửa sổ chống click ma: trừ Duyên đúng MỘT lần (${await duyen()})`,
      );

      console.log(
        "  [2] 'Giữ lại' / Esc / X: không trừ Duyên; Esc chỉ đóng hộp, KHÔNG đóng Hoàng Tuyền",
      );
      await openLimbo();
      b = await center('[data-nav="stone:khac"]');
      await tap(b.x, b.y);
      await sleep(600);
      const no = await center("#act-btn-no");
      await tap(no.x, no.y);
      await sleep(600);
      check(!(await box()).open && (await duyen()) === 500, "'Giữ lại': hộp đóng, không trừ");
      b = await center('[data-nav="stone:khac"]');
      await tap(b.x, b.y);
      await sleep(300);
      await key("Escape", "Escape", 27);
      await sleep(600);
      check(
        !(await box()).open && (await duyen()) === 500 && (await limboOpen()),
        "Esc: hộp đóng, không trừ, Hoàng Tuyền VẪN mở",
      );
      b = await center('[data-nav="stone:khac"]');
      await tap(b.x, b.y);
      await sleep(300);
      await key("KeyX", "x", 88);
      await sleep(600);
      check(!(await box()).open && (await duyen()) === 500, "phím X: giữ lại");

      console.log("  [3] mở xuất thân bằng Duyên");
      b = await center('[data-nav="origin-buy:kiem_khach"]');
      check(b && b.hit, "nút Mở xuất thân Kiếm khách bấm được");
      await tap(b.x, b.y);
      await sleep(300);
      st = await box();
      check(
        /^Mở xuất thân Kiếm khách tốn 20 Duyên \(còn lại 480\)\?$/.test(st.text),
        `câu hỏi: "${st.text}"`,
      );
      await key("KeyX", "x", 88);
      await sleep(600);

      console.log("  [4] Duyên đổi giữa lúc hộp mở: xác nhận bị huỷ, không trừ theo lời hỏi cũ");
      await openLimbo();
      b = await center('[data-nav="stone:khac"]');
      await tap(b.x, b.y);
      await sleep(600);
      await evalJs(
        `window.__ui.updateSoul({ kiep: 1, duyen: 5, unlocks: { ky_vat: 1, khac: 1 }, origins: [], engraved: ["ung_trao"] }); 1`,
      );
      await sleep(200);
      check((await box()).open, "hộp còn mở sau khi chân linh đổi");
      const y4 = await center("#act-btn-yes");
      await tap(y4.x, y4.y);
      await sleep(700);
      const toasts = await evalJs(
        `[...document.querySelectorAll("#toast p")].map((p) => p.textContent)`,
      );
      check(
        !(await box()).open &&
          (await duyen()) === 5 &&
          toasts.some((t) => t.includes("Chân linh vừa đổi")),
        `Duyên chỉ còn 5: huỷ + thông báo, không trừ (${await duyen()}; ${JSON.stringify(toasts)})`,
      );

      console.log(
        "  [5] đầu thai: hộp TÓM TẮT (xuất thân, số di vật giữ, số chiêu khắc); chỉ gửi sau xác nhận",
      );
      await openLimbo();
      await evalJs(`document.querySelector('[data-nav="relic:lang_nha_kiem"]').click(); 1`); // giữ 1 di vật
      await sleep(200);
      b = await center("#limbo-btn-rebirth");
      check(b && b.hit, "nút Đầu thai bấm được");
      await tap(b.x, b.y);
      await sleep(100);
      st = await box();
      check(
        /^Đầu thai làm Phàm gia, giữ 1 di vật, khắc 1 chiêu\?$/.test(st.text),
        `tóm tắt: "${st.text}"`,
      );
      check(/không đổi lại được/.test(st.warn), `nhắc: "${st.warn}"`);
      check(st.yes === "Đầu thai" && st.no === "Xem lại", `nút: "${st.no}" / "${st.yes}"`);
      check((await choices()).length === 0, "chưa gửi đầu thai khi chưa xác nhận");
      await shot("hoang-tuyen-dau-thai");
      await sleep(560);
      const noBtn = await center("#act-btn-no");
      await tap(noBtn.x, noBtn.y);
      await sleep(600);
      check(
        !(await box()).open && (await choices()).length === 0 && (await limboOpen()),
        "'Xem lại': quay về màn chọn, chưa đầu thai",
      );
      b = await center("#limbo-btn-rebirth");
      await tap(b.x, b.y);
      await sleep(700);
      const yes5 = await center("#act-btn-yes");
      await tap(yes5.x, yes5.y);
      await sleep(700);
      const ch = await choices();
      check(
        !(await box()).open &&
          ch.length === 1 &&
          JSON.stringify(ch[0].keep) === '["lang_nha_kiem"]',
        `xác nhận: đúng MỘT tin đầu thai kèm di vật đã chọn (${JSON.stringify(ch)})`,
      );

      console.log(
        "  [6] bàn phím: Enter trên nút Đầu thai chỉ MỞ hộp; Y (sau cửa sổ chống click ma) mới gửi",
      );
      await openLimbo();
      await evalJs(`document.getElementById("limbo-btn-rebirth").focus(); 1`);
      await key("Enter", "Enter", 13);
      await sleep(300);
      check((await box()).open && (await choices()).length === 0, "Enter: hộp mở, chưa gửi");
      await sleep(400);
      await key("KeyY", "y", 89);
      await sleep(500);
      check(!(await box()).open && (await choices()).length === 1, "Y: gửi đúng một tin");

      console.log("  [7] máy chủ đóng Hoàng Tuyền (đã đầu thai) lúc hộp còn mở: hộp đóng theo");
      await openLimbo();
      b = await center("#limbo-btn-rebirth");
      await tap(b.x, b.y);
      await sleep(300);
      check((await box()).open, "hộp mở");
      await evalJs(`window.__ui.hideLimbo(); 1`);
      await sleep(200);
      check(!(await box()).open, "hideLimbo: hộp xác nhận cũng đóng");
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
