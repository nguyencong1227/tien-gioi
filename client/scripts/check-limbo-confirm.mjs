/* global console, Buffer */
/**
 * Kiểm hộp xác nhận ở màn HOÀNG TUYỀN (issue #779, docs/RA_SOAT_THAO_TAC.md hàng 11, 12; `act-confirm.ts`: `unlockPlan` / `rebirthPlan`) trong Chrome THẬT, chế độ mock (`?duel=mock&debug=1`,
 * `window.__debugLimbo`; không cần máy chủ / Vite), 5 khung nhìn:
 *
 *   npm run build -w client && node client/scripts/check-limbo-confirm.mjs [--shots <thư mục>] [--vp <khung>] [--slow-frame <ms>]
 *
 *   - mở nấc chân linh / xuất thân bằng Duyên: hộp "Mở <tên> tốn N Duyên (còn lại M)?" + nhắc không hoàn lại; chưa trừ gì khi chưa xác nhận; bấm "Mở" NGAY khi hộp vừa mở (click ma) bị bỏ qua;
 *     xác nhận trừ ĐÚNG MỘT lần (không bị click ma rơi xuống nút bên dưới mở lại hộp); "Giữ lại" / Esc (chỉ đóng hộp, Hoàng Tuyền còn mở) / X không trừ;
 *   - Duyên đổi giữa lúc hộp mở: xác nhận huỷ + thông báo, không trừ theo lời hỏi cũ;
 *   - đầu thai: hộp TÓM TẮT "Đầu thai làm <xuất thân>, giữ K di vật, khắc N chiêu?"; "Xem lại" quay về màn chọn; xác nhận gửi đúng MỘT tin kèm lựa chọn; bàn phím: Enter chỉ mở hộp, Y gửi;
 *   - máy chủ đóng Hoàng Tuyền lúc hộp còn mở: hộp đóng theo.
 * `--shots`: lưu ảnh hộp mỗi khung nhìn.
 *
 * Chờ THEO ĐIỀU KIỆN (nightly #1458, lô 15): không còn `sleep` cố định. Hộp xác nhận có cửa sổ chống click ma 450 ms tính theo `performance.now` của trang
 * (`confirm-guard.ts`): các kiểm "bấm NGAY khi hộp vừa mở bị bỏ qua / click ma sau khi đóng không mở lại hộp" phải rơi TRONG cửa sổ, nên [1] chạy chúng trên ĐỒNG HỒ ẢO
 * (`performance.now` đứng yên trong đoạn ngắn, `advance(ms)` tua tay qua cửa sổ); dùng giờ thật thì ở khung chậm cửa sổ đã hết trước khi bấm. Đoạn đóng băng phải NGẮN: phím X / Y
 * đi qua vòng lặp Phaser nên cần đồng hồ chạy (đóng băng cả kịch bản làm phím không được xử lý). Mọi chỗ còn lại chạy giờ THẬT và bấm / gõ LẶP tới khi hộp đạt trạng thái
 * mong muốn (lần bấm trong cửa sổ bị bỏ qua đúng thiết kế); [8] chờ giờ thật 3 s của toast và của chờ máy chủ bằng điều kiện.
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
  let launched = null;
  let failures = 0;
  const check = (ok, msg) => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
    if (!ok) failures++;
  };
  try {
    launched = await launchChrome({ name: "limbo-confirm", extraArgs: [] });
    const ws = new WebSocket(launched.page.webSocketDebuggerUrl);
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
      // `--slow-frame <ms>` (hoặc `TG_SLOW_FRAME_MS`): giả lập runner khung chậm, xem `slow-frame.mjs`
      source: `try { localStorage.setItem('tg_newbie_guide_dismissed','1'); localStorage.setItem('tg_quality','low'); } catch (e) {}${slowFrameSource(slowFrameMs())}`,
    });
    /** Chờ `n` khung hình của trang (rAF liên tiếp): ở khung chậm mỗi khung dài hơn nên chờ tự co giãn theo (thay `sleep` cố định sau thao tác). */
    const frames = (n) =>
      evalJs(
        `new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`,
      );
    /** Chờ biểu thức JS trong trang đúng (điều kiện, không đoán giờ) */
    const until = (expr, ms = 15000) => waitUntilTrue(() => evalJs(expr), ms, 50);
    // ----- ĐỒNG HỒ ẢO của trang: `performance.now` đóng băng / tua tay (xem chú thích đầu tệp)
    const clockInstall = () =>
      evalJs(`(() => { if (window.__clk) return 1; const real = performance.now.bind(performance);
        window.__clk = { real, frozen: null, skew: 0 };
        performance.now = () => (window.__clk.frozen !== null ? window.__clk.frozen : window.__clk.real() + window.__clk.skew); return 1; })()`);
    const freeze = () =>
      evalJs(
        `(() => { const c = window.__clk; if (c.frozen === null) c.frozen = c.real() + c.skew; return 1; })()`,
      );
    const advance = (ms) =>
      evalJs(
        `(() => { const c = window.__clk; if (c.frozen === null) c.skew += ${ms}; else c.frozen += ${ms}; return 1; })()`,
      );
    const thaw = () =>
      evalJs(
        `(() => { const c = window.__clk; if (c.frozen !== null) { c.skew = c.frozen - c.real(); c.frozen = null; } return 1; })()`,
      );
    /** Tua qua cửa sổ chống click ma (450 ms) của hộp xác nhận */
    const PAST_GUARD = 600;

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
      const ready = await waitUntilTrue(
        () =>
          evalJs(
            `Boolean(!window.__isOldPage && typeof window.__debugLimbo === "function" && window.__ui)`,
          ),
        45000,
        100,
      );
      if (!ready) {
        console.log("  ✗ trang không sẵn sàng (cần ?duel=mock&debug=1)");
        failures++;
        continue;
      }
      await frames(5);
      await clockInstall();
      const shot = async (name) => {
        if (!shotsDir) return;
        await frames(3);
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
      const waitBox = (open) => until(`window.__ui.isActConfirmOpen() === ${open}`);
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
        await until(`window.__ui.isLimboOpen() && document.body.classList.contains("in-limbo")`);
        await frames(3);
      };
      // ----- GIỜ THẬT: bấm LẶP tới khi đạt (lần bấm trong cửa sổ chống click ma 450 ms bị bỏ qua đúng thiết kế, không đổi trạng thái); `done` kiểm điều kiện đạt
      const tapUntil = (sel, done) =>
        waitUntilTrue(
          async () => {
            const t = await center(sel);
            if (!t) return false;
            await tap(t.x, t.y);
            return await done();
          },
          20000,
          120,
        );
      const boxOpen = async () => (await box()).open;
      const boxClosed = async () => !(await box()).open;
      /** Bấm nút `sel` tới khi hộp xác nhận MỞ */
      const tapOpen = (sel) => tapUntil(sel, boxOpen);
      /** Bấm nút `sel` trong hộp tới khi hộp ĐÓNG (xác nhận / giữ lại) */
      const tapInBox = (sel) => tapUntil(sel, boxClosed);
      /** Phím `code` tới khi hộp ĐÓNG (Y trong cửa sổ chống click ma bị bỏ qua nên bấm lặp; X / Esc đóng ngay) */
      const keyUntilClosed = (code, k, vk) =>
        waitUntilTrue(
          async () => {
            await key(code, k, vk);
            return await boxClosed();
          },
          20000,
          150,
        );
      /**
       * Chạy \`fn\` khi đồng hồ trang ĐỨNG YÊN (chỉ cho các kiểm CLICK MA phải rơi TRONG cửa sổ 450 ms: sự kiện DOM chạm / chuột). Giữ ngắn: phím X / Y đi qua vòng lặp
       * Phaser nên cần đồng hồ chạy, đóng băng cả đoạn dài làm phím không được xử lý.
       */
      const frozen = async (fn) => {
        await freeze();
        try {
          return await fn();
        } finally {
          await thaw();
        }
      };

      console.log(
        "  [1] mở nấc chân linh bằng Duyên: hộp nêu tên + giá + Duyên còn lại; chưa trừ gì khi chưa xác nhận",
      );
      await openLimbo();
      check((await duyen()) === 500, "Duyên ban đầu 500");
      let b = await center('[data-nav="stone:khac"]');
      check(b && b.hit, "nút Mở Khắc chân linh bấm được");
      let st;
      let yes1;
      // NỬA ĐẦU trên đồng hồ ĐỨNG YÊN: hộp mở rồi bấm NGAY (click ma) phải rơi TRONG cửa sổ 450 ms dù khung chậm tới đâu
      await frozen(async () => {
        await tap(b.x, b.y);
        await waitBox(true);
        st = await box();
        check(st.open, "hộp xác nhận mở");
        check(
          /^Mở Khắc chân linh nấc 2 tốn \d+ Duyên \(còn lại \d+\)\?$/.test(st.text),
          `câu hỏi: "${st.text}"`,
        );
        check(/không hoàn lại/.test(st.warn), `nhắc: "${st.warn}"`);
        check(st.yes === "Mở" && st.no === "Giữ lại", `nút: "${st.no}" / "${st.yes}"`);
        check(st.active === "act-btn-no", `focus ở "Giữ lại" (${st.active})`);
        check((await duyen()) === 500, "chưa trừ Duyên");
        yes1 = await center("#act-btn-yes");
        check(
          yes1.hit && (!vp.mobile || (yes1.w >= 44 && yes1.h >= 44)),
          `nút Mở trong hộp bấm được, không bị che (${Math.round(yes1.w)}x${Math.round(yes1.h)})`,
        );
        await tap(yes1.x, yes1.y); // đồng hồ chưa tua: hộp vừa mở xong, NGAY trong cửa sổ chống click ma
        await frames(3);
        check(
          (await box()).open && (await duyen()) === 500,
          "bấm NGAY khi hộp vừa mở (click ma): bị bỏ qua",
        );
        await shot("hoang-tuyen-mo-duyen");
      });
      await advance(PAST_GUARD); // đồng hồ chạy lại và tua qua cửa sổ: xác nhận bây giờ phải được nhận
      // NỬA SAU lại đóng băng (SAU khi đã quá cửa sổ mở): hộp đóng rồi click ma / click bàn phím phải rơi TRONG cửa sổ sau khi đóng
      await frozen(async () => {
        await tap(yes1.x, yes1.y);
        await waitBox(false);
        await until(`Number(document.getElementById("limbo-duyen-total")?.textContent) === 490`);
        // `click` "ma" do trình duyệt tạo sau khi nhả ngón (cảm ứng: hộp đóng ở pointerdown nên click rơi xuống nút bên dưới): giả lập NGAY sau khi hộp đóng
        await evalJs(
          `document.querySelector('[data-nav="stone:khac"]').dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })); 1`,
        );
        await frames(3);
        check(
          !(await box()).open && (await duyen()) === 490,
          `xác nhận sau cửa sổ chống click ma: trừ Duyên đúng MỘT lần, click ma ngay sau đó không mở lại hộp (${await duyen()})`,
        );
        // thao tác bằng BÀN PHÍM / lập trình (click có detail = 0) cũng NGAY sau khi hộp đóng (vẫn trong 450 ms) KHÔNG phải click ma: mở được hộp mới
        await evalJs(`document.querySelector('[data-nav="stone:khac"]').click(); 1`);
        await waitBox(true);
        check(
          (await box()).open,
          "click bàn phím (detail 0) ngay sau khi đóng hộp: mở hộp mới, không bị coi là click ma",
        );
      });
      await keyUntilClosed("KeyX", "x", 88);

      console.log(
        "  [2] 'Giữ lại' / Esc / X: không trừ Duyên; Esc chỉ đóng hộp, KHÔNG đóng Hoàng Tuyền",
      );
      await openLimbo();
      await tapOpen('[data-nav="stone:khac"]');
      await tapInBox("#act-btn-no");
      check(!(await box()).open && (await duyen()) === 500, "'Giữ lại': hộp đóng, không trừ");
      await tapOpen('[data-nav="stone:khac"]');
      await key("Escape", "Escape", 27);
      await waitBox(false);
      check(
        !(await box()).open && (await duyen()) === 500 && (await limboOpen()),
        "Esc: hộp đóng, không trừ, Hoàng Tuyền VẪN mở",
      );
      await tapOpen('[data-nav="stone:khac"]');
      await keyUntilClosed("KeyX", "x", 88);
      check(!(await box()).open && (await duyen()) === 500, "phím X: giữ lại");

      console.log("  [3] mở xuất thân bằng Duyên");
      b = await center('[data-nav="origin-buy:kiem_khach"]');
      check(b && b.hit, "nút Mở xuất thân Kiếm khách bấm được");
      await tapOpen('[data-nav="origin-buy:kiem_khach"]');
      st = await box();
      check(
        /^Mở xuất thân Kiếm khách tốn 20 Duyên \(còn lại 480\)\?$/.test(st.text),
        `câu hỏi: "${st.text}"`,
      );
      await keyUntilClosed("KeyX", "x", 88);

      console.log("  [4] Duyên đổi giữa lúc hộp mở: xác nhận bị huỷ, không trừ theo lời hỏi cũ");
      await openLimbo();
      await tapOpen('[data-nav="stone:khac"]');
      await evalJs(
        `window.__ui.updateSoul({ kiep: 1, duyen: 5, unlocks: { ky_vat: 1, khac: 1 }, origins: [], engraved: ["ung_trao"] }); 1`,
      );
      await until(`Number(document.getElementById("limbo-duyen-total")?.textContent) === 5`);
      check((await box()).open, "hộp còn mở sau khi chân linh đổi");
      await tapInBox("#act-btn-yes");
      await until(
        `[...document.querySelectorAll("#toast p")].some((p) => p.textContent.includes("Chân linh vừa đổi"))`,
      );
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
      await frames(3);
      b = await center("#limbo-btn-rebirth");
      check(b && b.hit, "nút Đầu thai bấm được");
      await tapOpen("#limbo-btn-rebirth");
      st = await box();
      check(
        /^Đầu thai làm Phàm gia, giữ 1 di vật, khắc 1 chiêu\?$/.test(st.text),
        `tóm tắt: "${st.text}"`,
      );
      check(/không đổi lại được/.test(st.warn), `nhắc: "${st.warn}"`);
      check(st.yes === "Đầu thai" && st.no === "Xem lại", `nút: "${st.no}" / "${st.yes}"`);
      check((await choices()).length === 0, "chưa gửi đầu thai khi chưa xác nhận");
      await shot("hoang-tuyen-dau-thai");
      await tapInBox("#act-btn-no");
      check(
        !(await box()).open && (await choices()).length === 0 && (await limboOpen()),
        "'Xem lại': quay về màn chọn, chưa đầu thai",
      );
      await tapOpen("#limbo-btn-rebirth");
      await tapInBox("#act-btn-yes");
      await until(`(window.__rebirthChoices ?? []).length >= 1`);
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
      await waitBox(true);
      check((await box()).open && (await choices()).length === 0, "Enter: hộp mở, chưa gửi");
      await keyUntilClosed("KeyY", "y", 89); // Y trong cửa sổ chống click ma bị bỏ qua: bấm lặp tới khi hộp đóng
      await until(`(window.__rebirthChoices ?? []).length >= 1`);
      check(!(await box()).open && (await choices()).length === 1, "Y: gửi đúng một tin");

      console.log("  [7] máy chủ đóng Hoàng Tuyền (đã đầu thai) lúc hộp còn mở: hộp đóng theo");
      await openLimbo();
      await tapOpen("#limbo-btn-rebirth");
      check((await box()).open, "hộp mở");
      await evalJs(`window.__ui.hideLimbo(); 1`);
      await waitBox(false);
      check(!(await box()).open, "hideLimbo: hộp xác nhận cũng đóng");

      console.log(
        "  [8] máy chủ TỪ CHỐI đầu thai (lỗi gấp mục 58): ở lại Hoàng Tuyền, LÝ DO nằm trên nút (không chỉ toast 3 s), nút mở lại, bấm lại được",
      );
      const REASON = "Lựa chọn đầu thai không hợp lệ.";
      const status = () =>
        evalJs(
          `(() => { const e = document.getElementById("limbo-rebirth-status"); return { hidden: e.hidden, text: e.textContent, bad: e.classList.contains("bad") }; })()`,
        );
      const btnBusy = () =>
        evalJs(
          `document.getElementById("limbo-btn-rebirth").getAttribute("aria-disabled") === "true"`,
        );
      await openLimbo();
      check((await status()).hidden, "chưa bấm gì: dòng trạng thái ẩn");
      await evalJs(`window.__limboRefuse = ${JSON.stringify(REASON)}; 1`);
      await tapUntil("#limbo-btn-rebirth", boxOpen);
      await tapUntil("#act-btn-yes", boxClosed);
      await until(
        `(() => { const e = document.getElementById("limbo-rebirth-status"); return !e.hidden && e.textContent.includes(${JSON.stringify(REASON)}); })()`,
      );
      let sRefuse = await status();
      check(
        !sRefuse.hidden && sRefuse.bad && sRefuse.text.includes(REASON),
        `lý do hiện trên nút, tô đỏ: "${sRefuse.text}"`,
      );
      check(await limboOpen(), "vẫn ở màn Hoàng Tuyền (KHÔNG tự đóng)");
      check(!(await btnBusy()), "nút Đầu thai mở lại ngay (không chờ hết giờ)");
      await shot("hoang-tuyen-tu-choi");
      // quá 3 s của toast: toast đã tắt (chờ tới khi hết toast), lý do vẫn còn
      await until(`document.querySelectorAll("#toast p").length === 0`);
      check(
        (await evalJs(`document.querySelectorAll("#toast p").length`)) === 0,
        "toast đã tắt sau 3 s",
      );
      sRefuse = await status();
      check(!sRefuse.hidden && sRefuse.text.includes(REASON), "lý do VẪN còn sau khi toast tắt");
      check(await limboOpen(), "vẫn ở Hoàng Tuyền sau khi toast tắt");
      // máy chủ sửa lại: bấm lại đầu thai được, màn đóng theo Mạnh Bà
      await evalJs(`window.__limboRefuse = undefined; 1`);
      await tapUntil("#limbo-btn-rebirth", boxOpen);
      await tapUntil("#act-btn-yes", boxClosed);
      await until(`!window.__ui.isLimboOpen()`);
      check(!(await limboOpen()), "bấm lại sau khi hết lỗi: đầu thai, Hoàng Tuyền đóng");
      // toast KHÔNG liên quan lúc chờ (thông báo quái, thành tựu) không bị coi là lời từ chối
      await evalJs(`document.getElementById("reborn-overlay").hidden = true; 1`); // màn Mạnh Bà của lần đầu thai vừa rồi che nút
      await openLimbo();
      await tapUntil("#limbo-btn-rebirth", boxOpen);
      await evalJs(`window.__limboHold = true; 1`);
      await tapUntil("#act-btn-yes", boxClosed);
      await evalJs(
        `window.__ui.toast({ text: "★ Hôi Lang tinh anh: nên đi đội.", tone: "info" }); window.__ui.toast({ text: "Đạt thành tựu: Nhập Thế Lạc Hà", tone: "good" }); 1`,
      );
      await frames(2);
      check(
        (await btnBusy()) && /Đang uống canh/.test((await status()).text),
        `toast không liên quan: vẫn "đang chờ", không báo lỗi oan ("${(await status()).text}")`,
      );
      // máy chủ IM LẶNG tới hết giờ chờ (3 s): nói rõ + mở lại nút (không để người chơi nhìn nút khoá không lý do)
      await until(
        `(() => { const e = document.getElementById("limbo-rebirth-status"); return !e.hidden && e.classList.contains("bad") && /chưa phản hồi/.test(e.textContent); })()`,
      );
      const sSilent = await status();
      check(
        !sSilent.hidden && sSilent.bad && /chưa phản hồi/.test(sSilent.text),
        `hết giờ chờ: báo "máy chủ chưa phản hồi" ("${sSilent.text}")`,
      );
      check(!(await btnBusy()), "hết giờ chờ: nút Đầu thai mở lại");
      await evalJs(`window.__limboHold = undefined; window.__ui.hideLimbo(); 1`);
    }
  } finally {
    await launched?.close();
    server.close();
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
