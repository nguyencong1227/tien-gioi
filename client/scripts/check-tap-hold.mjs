/* global console, setTimeout, process */
// Kiểm NHẤN GIỮ nút HUD (`bindTap` ở `client/src/ui.ts`) trong Chrome THẬT (chế độ mock `?duel=mock&debug=1`, không cần máy chủ):
//  - mỗi nút nối `bindTap` chạy `fn` ở `pointerdown` (nhạy với chạm) và bỏ `click` đi liền sau lần nhả đó để `fn` không chạy hai lần. Trước đây cửa sổ chống trùng tính từ lúc NHẤN
//    (300 ms): nhấn giữ >= ~400 ms thì `click` tới sau cửa sổ và `fn` chạy LẦN HAI (nút bật / tắt mở rồi đóng ngay; túi đồ mở rồi đóng ngay). Cửa sổ phải tính từ lúc NHẢ.
//  - CHUỘT thật (`Input.dispatchMouseEvent`) và CẢM ỨNG thật (`Input.dispatchTouchEvent`), nhấn giữ 100 / 450 / 1200 ms: trạng thái đổi ĐÚNG MỘT lần;
//  - `click` tổng hợp không có pointer (`el.click()`, trợ năng) vẫn chạy MỘT lần; hai lần chạm nhanh liền nhau chạy HAI lần (không bị nuốt nhầm lần hai).
// Chờ THEO ĐIỀU KIỆN (sự kiện `click` đã tới) rồi mới đọc trạng thái, không `sleep` cố định: ở khung chậm `click` tới cách `pointerdown` tới vài trăm ms. Mặc định tự dựng Vite của cây này
// trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-tap-hold.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--slow-frame <ms>]
import WebSocket from "ws";
import { resolveClientUrl } from "./client-url.mjs";
import { launchChrome } from "./chrome-launch.mjs";
import { waitUntilTrue } from "./chrome-wait.mjs";
import { slowFrameMs, slowFrameSource } from "./slow-frame.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = await resolveClientUrl(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "");
let launched = null;
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
const HOLDS = [100, 450, 1200];
try {
  launched = await launchChrome({ name: "tap-hold" });
  const page = launched.page;
  if (!page) throw new Error("Không tìm thấy Chrome page target.");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let nextId = 1;
  const pending = new Map();
  let pageErrors = 0;
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === "Runtime.exceptionThrown") pageErrors++;
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

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    // `--slow-frame <ms>` (hoặc `TG_SLOW_FRAME_MS`): giả lập runner khung chậm, xem `slow-frame.mjs`
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.removeItem('tg_qt_open');localStorage.removeItem('tg_reduced_motion')}catch(e){}${slowFrameSource(slowFrameMs())}`,
  });

  /** Mở trang mock ở khung (W x H) và chờ sẵn sàng (đánh dấu tài liệu CŨ trước khi điều hướng) */
  const open = async (W, H, mobile) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile,
    });
    await evalJs("window.__isOldPage = true");
    await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
    const ready = await waitUntilTrue(
      () =>
        evalJs(
          "Boolean(!window.__isOldPage && window.__ui && window.__scene && window.__scene.me && window.__scene.me())",
        ),
      60000,
      300,
    );
    if (!ready) throw new Error(`${W}x${H}: cảnh mock không sẵn sàng sau 60 s`);
    const settled = await waitUntilTrue(
      () =>
        evalJs(
          `document.fonts.status === "loaded" && Boolean(document.documentElement.dataset.input)`,
        ),
      30000,
      100,
    );
    if (!settled) throw new Error(`${W}x${H}: phông chưa tải xong / thiếu data-input sau 30 s`);
    // Chờ trạng thái hiển thị ĐỨNG YÊN (dạng màn `data-form`, hướng, bảng Nhiệm vụ mở / thu): ở khung chậm bộ xếp dạng màn và mặc định mở / thu của bảng áp dụng muộn sau khi đổi khung nhìn,
    // cú bấm đầu tiên rơi vào giữa chừng thì bị mặc định ghi đè (đo: aria-expanded true -> true ở khung 36 ms)
    let lastShape = "";
    let sameShape = 0;
    const calm = await waitUntilTrue(
      async () => {
        const cur = await evalJs(
          `[document.documentElement.dataset.form, document.documentElement.dataset.orient, document.getElementById("qt-toggle").getAttribute("aria-expanded"), innerWidth, innerHeight].join("|")`,
        );
        sameShape = cur === lastShape ? sameShape + 1 : 0;
        lastShape = cur;
        return sameShape >= 8;
      },
      30000,
      120,
    );
    if (!calm)
      throw new Error(`${W}x${H}: trạng thái hiển thị không đứng yên sau 30 s (${lastShape})`);
    // đếm mọi `click` (pha bắt, trước cả bộ xử lý của nút) để chờ THEO sự kiện thay vì ngủ
    await evalJs(
      `window.__clicks = 0; window.addEventListener("click", () => { window.__clicks++; }, true); 0`,
    );
  };
  /** Tâm nút SAU KHI vị trí đã đứng yên (5 mẫu liên tiếp cách 120 ms giống hệt nhau): ngay sau khi tải, bố cục HUD còn xê dịch (đo: nút Nhiệm vụ ở y = 124 lúc đo, y = 158 lúc bấm
   *  ở khung chậm) nên cú bấm trúng khung chứa / vùng game thay vì nút. */
  const centerOf = async (id) => {
    const sample = () =>
      evalJs(
        `(() => { const b = document.getElementById(${JSON.stringify(id)}); if (!b) return ""; const r = b.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height].map((v) => v.toFixed(1)).join(","); })()`,
      );
    let last = "";
    let same = 0;
    const stable = await waitUntilTrue(
      async () => {
        const cur = await sample();
        same = cur !== "" && cur === last ? same + 1 : 0;
        last = cur;
        return same >= 5;
      },
      20000,
      120,
    );
    if (!stable) throw new Error(`#${id}: vị trí không đứng yên sau 20 s (${last})`);
    const c = JSON.parse(
      await evalJs(
        `(() => { const b = document.getElementById(${JSON.stringify(id)}); const r = b.getBoundingClientRect();
          const x = r.x + r.width / 2, y = r.y + r.height / 2; const top = document.elementFromPoint(x, y);
          return JSON.stringify({ x, y, onTop: Boolean(top && top.closest("button") === b) }); })()`,
      ),
    );
    if (!c.onTop) throw new Error(`#${id}: bị lớp khác che ở tâm nút, không bấm trúng được`);
    return c;
  };
  const clicks = () => evalJs("window.__clicks");
  /** Nhấn `kind` ("mouse" | "touch") giữ `holdMs` rồi nhả; chờ cho tới khi sự kiện `click` của lần nhả đã tới (tối đa 10 s) + một nhịp cho bộ xử lý chạy xong */
  const press = async (id, holdMs, kind) => {
    const { x, y } = await centerOf(id);
    const before = await clicks();
    if (kind === "mouse") {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1,
      });
      await sleep(holdMs);
      await send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1,
      });
    } else {
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ id: 1, x, y }],
      });
      await sleep(holdMs);
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const arrived = await waitUntilTrue(async () => (await clicks()) > before, 10000, 25);
    await sleep(100);
    return arrived;
  };
  const aria = () => evalJs(`document.getElementById("qt-toggle").getAttribute("aria-expanded")`);
  const bagOpen = () => evalJs("window.__ui.isInventoryOpen()");

  for (const [kind, W, H, mobile] of [
    // chuột TRƯỚC, cảm ứng SAU: một khi Chrome bật giả lập cảm ứng thì không tắt lại được trong cùng phiên
    ["mouse", 1280, 720, false],
    ["touch", 844, 390, true],
  ]) {
    console.log(`\n--- ${kind} ${W}x${H} ---`);
    if (kind === "touch")
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await open(W, H, mobile);
    for (const hold of HOLDS) {
      // nút bật / tắt bảng Nhiệm vụ (`aria-expanded`)
      const before = await aria();
      const arrived = await press("qt-toggle", hold, kind);
      const after = await aria();
      check(
        arrived && before !== after,
        `${kind} giữ ${hold} ms trên "Nhiệm vụ": đổi MỘT lần (aria-expanded ${before} -> ${after}${arrived ? "" : "; click không tới"})`,
      );
      // túi đồ: nút mở rồi nút đóng (hai nút `bindTap` khác nhau, cùng một `fn` bật / tắt)
      await press("btn-bag", hold, kind);
      const opened = await bagOpen();
      check(opened === true, `${kind} giữ ${hold} ms trên nút Túi: túi MỞ và ở lại mở (${opened})`);
      if (opened) {
        await press("inv-close", hold, kind);
        const closed = await bagOpen();
        check(closed === false, `${kind} giữ ${hold} ms trên nút đóng túi: túi ĐÓNG (${closed})`);
      } else {
        // túi không mở được (lỗi đã báo ở trên): dọn trạng thái để các ca sau vẫn chạy, không ném lỗi giữa chừng
        await evalJs("window.__ui.toggleInventory(false); 0");
      }
    }
  }

  // `click` tổng hợp không kèm pointer (trợ năng, `el.click()`): không được bị nuốt, cũng không chạy hai lần
  console.log("\n--- click tổng hợp / chạm nhanh liền nhau ---");
  await open(1280, 720, false);
  {
    const before = await aria();
    await evalJs(`document.getElementById("qt-toggle").click(); 0`);
    const after = await aria();
    check(before !== after, `el.click() không kèm pointer: đổi MỘT lần (${before} -> ${after})`);
    // hai lần chạm nhanh (giữ 60 ms, cách nhau ~80 ms): mỗi lần là một lần bật / tắt, lần hai không bị nuốt
    const start = await aria();
    await press("qt-toggle", 60, "mouse");
    await sleep(80);
    await press("qt-toggle", 60, "mouse");
    const end = await aria();
    check(
      start === end,
      `hai lần bấm nhanh: bật rồi tắt lại, không nuốt lần hai (${start} -> ${end})`,
    );
  }

  // `click` tới TRỄ sau `pointerup` (luồng chính bận: `click` cảm ứng là cử chỉ do trình duyệt phát, đo tới 226 ms sau `pointerup` ở khung chậm, có thể hơn): vẫn MỘT lần.
  // Phát sự kiện TỔNG HỢP trong cùng một lượt JS nên không phụ thuộc tốc độ khung; cửa sổ thời gian cố định (300 ms) làm `fn` chạy lần hai ở mọi độ trễ >= 300 ms.
  console.log("\n--- click tới trễ sau pointerup (tổng hợp, tất định) ---");
  const lateClick = (delayMs) =>
    evalJs(`(async () => {
      const b = document.getElementById("qt-toggle");
      const before = b.getAttribute("aria-expanded");
      const o = { bubbles: true, cancelable: true, pointerId: 77, pointerType: "touch", isPrimary: true, button: 0 };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      b.dispatchEvent(new PointerEvent("pointerdown", o));
      await wait(120);
      b.dispatchEvent(new PointerEvent("pointerup", o));
      await wait(${delayMs});
      b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
      return JSON.stringify([before, b.getAttribute("aria-expanded")]);
    })()`).then(JSON.parse);
  for (const delay of [50, 350, 600, 1200]) {
    const [before, after] = await lateClick(delay);
    check(
      before !== after,
      `click trễ ${delay} ms sau pointerup: đổi MỘT lần (aria-expanded ${before} -> ${after})`,
    );
  }
  {
    // hai lần bấm CHỒNG nhau: click của lần một tới sau pointerdown của lần hai; tổng cộng đúng hai lần đổi (về chỗ cũ), không ba
    const [before, after] = JSON.parse(
      await evalJs(`(async () => {
        const b = document.getElementById("qt-toggle");
        const before = b.getAttribute("aria-expanded");
        const o = { bubbles: true, cancelable: true, pointerId: 78, pointerType: "touch", isPrimary: true, button: 0 };
        const click = () => b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
        b.dispatchEvent(new PointerEvent("pointerdown", o));
        b.dispatchEvent(new PointerEvent("pointerup", o));
        b.dispatchEvent(new PointerEvent("pointerdown", o));
        click(); // click của lần một, tới muộn
        b.dispatchEvent(new PointerEvent("pointerup", o));
        click(); // click của lần hai
        return JSON.stringify([before, b.getAttribute("aria-expanded")]);
      })()`),
    );
    check(before === after, `hai lần bấm chồng nhau: đúng hai lần đổi (${before} -> ${after})`);
  }

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  if (launched) await launched.close();
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
