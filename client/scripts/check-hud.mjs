/* global console, process */
// Kiểm HUD gọn trên điện thoại (M5.1 #326; quy tắc mới ở QUYET_DINH_M3 mục 15): bảng Nhiệm vụ thu gọn mặc định ở MỌI điện thoại (dọc lẫn ngang) và cửa sổ hẹp
// (< 700 px), mở ở tablet / máy tính đủ rộng; bấm tiêu đề để mở / thu, lựa chọn được nhớ (`tg_qt_open`) và thắng mặc định kể cả khi xoay máy; cột HUD trái cao <= 72 % chiều cao khi thu gọn. Chrome thật, chạm
// thật (CDP). Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn. Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-hud.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--slow-frame <ms>]
import WebSocket from "ws";
import { resolveClientUrl } from "./client-url.mjs";
import { launchChrome } from "./chrome-launch.mjs";
import { waitUntilTrue } from "./chrome-wait.mjs";
import { slowFrameMs, slowFrameSource } from "./slow-frame.mjs";

const i = process.argv.indexOf("--url");
const BASE_URL = await resolveClientUrl(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "");
let launched = null;
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
try {
  launched = await launchChrome({ name: "hud" });
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
    // Chất lượng Cao (cho rung + chớp), bỏ hướng dẫn tân thủ
    // `--slow-frame <ms>` (hoặc `TG_SLOW_FRAME_MS`): giả lập runner khung chậm, xem `slow-frame.mjs`
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}${slowFrameSource(slowFrameMs())}`,
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 900,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Đánh dấu tài liệu CŨ rồi mới điều hướng: điều kiện sẵn sàng KHÔNG được đúng trên tài liệu cũ (chưa kịp đổi trang)
  await evalJs("window.__isOldPage = true");
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1&crowd=6` });
  const ready = await waitUntilTrue(
    () =>
      evalJs(
        "Boolean(!window.__isOldPage && window.__scene && window.__scene.me && window.__scene.me())",
      ),
    60000,
    300,
  );
  if (!ready) throw new Error(`cảnh mock không sẵn sàng sau 60 s`);
  // Chờ THEO ĐIỀU KIỆN thay `sleep(600)`: phông Noto Serif đã tải xong (đo chữ bằng phông dự phòng sẽ sai) và `data-input` đã đặt lên <html>
  const settled = await waitUntilTrue(
    () =>
      evalJs(
        `document.fonts.status === "loaded" && Boolean(document.documentElement.dataset.input)`,
      ),
    30000,
    100,
  );
  if (!settled) throw new Error(`phông chưa tải xong / thiếu data-input sau 30 s`);

  // Chế độ mock không chạy đối chiếu máy chủ: đặt vị trí đoán trước tại chỗ nhân vật và đưa camera về đó
  await evalJs(`(() => {
    const sc = window.__scene, me = sc.me();
    sc.predX = me.x; sc.predY = me.y;
    sc.cameras.main.centerOn(me.x, me.y);
    return 0;
  })()`);

  /** Chờ một giá trị đọc được ĐỨNG YÊN (`samples` mẫu liên tiếp cách `gap` ms giống hệt nhau): ở khung chậm bố cục HUD, mặc định mở / thu của bảng và dạng màn áp dụng muộn sau khi tải /
   *  nạp lại / đổi khung nhìn, nên `sleep` cố định đọc giữa chừng (đo: cú chạm đầu tiên sau nạp lại trúng chỗ cũ của nút; trạng thái đọc trước khi bảng áp dụng lựa chọn đã nhớ). */
  const calm = async (read, samples = 6, gap = 100) => {
    let last = "";
    let same = 0;
    const ok = await waitUntilTrue(
      async () => {
        const cur = JSON.stringify(await read());
        same = cur === last ? same + 1 : 0;
        last = cur;
        return same >= samples;
      },
      30000,
      gap,
    );
    if (!ok) throw new Error(`không đứng yên sau 30 s: ${last}`);
  };
  const metrics = async (w, h, mobile) => {
    if (mobile)
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile,
    });
    // display.ts gom sự kiện đổi kích thước (~100 ms rồi mới ghi `data-orient` / `data-form`): chờ khung nhìn VÀ hướng đã áp dụng, rồi chờ dạng màn / bảng đứng yên, thay vì ngủ cố định
    const applied = await waitUntilTrue(
      () =>
        evalJs(
          `innerWidth === ${w} && innerHeight === ${h} && document.documentElement.dataset.orient === "${w > h ? "landscape" : "portrait"}"`,
        ),
      30000,
      100,
    );
    if (!applied) throw new Error(`khung ${w}x${h} không được áp dụng sau 30 s`);
    await calm(state, 8);
  };
  const reload = async () => {
    // Đánh dấu tài liệu CŨ rồi mới nạp lại: điều kiện sẵn sàng KHÔNG được đúng trên tài liệu cũ
    await evalJs("window.__isOldPage = true");
    await send("Page.reload");
    const ok = await waitUntilTrue(
      () => evalJs("Boolean(!window.__isOldPage && window.__ui && window.__scene)"),
      60000,
      300,
    );
    if (!ok) throw new Error("cảnh mock không sẵn sàng sau khi nạp lại (60 s)");
    // Chờ THEO ĐIỀU KIỆN thay `sleep(600)`: phông đã tải xong và `data-input` đã đặt
    const settled = await waitUntilTrue(
      () =>
        evalJs(
          `document.fonts.status === "loaded" && Boolean(document.documentElement.dataset.input)`,
        ),
      30000,
      100,
    );
    if (!settled) throw new Error("phông chưa tải xong / thiếu data-input sau khi nạp lại (30 s)");
    // bảng Nhiệm vụ áp dụng lựa chọn đã nhớ (`tg_qt_open`) muộn hơn `__ui` / phông: chờ trạng thái đứng yên rồi mới đọc
    await calm(state);
  };
  const state = () =>
    evalJs(`(() => {
      const t = document.getElementById("quest-tracker"), b = document.getElementById("qt-toggle"), list = document.getElementById("quest-tracker-list");
      const col = document.getElementById("hud-col-left").getBoundingClientRect(), r = b.getBoundingClientRect();
      return JSON.stringify({
        collapsed: t.classList.contains("collapsed"), aria: b.getAttribute("aria-expanded"),
        listShown: getComputedStyle(list).display !== "none", btnH: Math.round(r.height), btnW: Math.round(r.width),
        colPct: Math.round((col.height / innerHeight) * 100), colH: Math.round(col.height), ih: innerHeight,
        pref: localStorage.getItem("tg_qt_open"), form: document.documentElement.dataset.form, orient: document.documentElement.dataset.orient,
        topIsBtn: (() => { const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return Boolean(e && e.closest("button") === b); })(),
      });
    })()`).then((v) => JSON.parse(v));
  const tap = async () => {
    // chờ vị trí nút đứng yên (bố cục còn xê dịch ngay sau khi tải / nạp lại thì cú chạm trúng chỗ cũ của nút)
    await calm(() =>
      evalJs(
        `(() => { const r = document.getElementById("qt-toggle").getBoundingClientRect(); return [r.x, r.y, r.width, r.height].join(","); })()`,
      ),
    );
    const c = JSON.parse(
      await evalJs(
        `(() => { const r = document.getElementById("qt-toggle").getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`,
      ),
    );
    await send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x: c.x, y: c.y }],
    });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await calm(state);
  };
  const fresh = async (w, h, mobile) => {
    await metrics(w, h, mobile);
    await evalJs('localStorage.removeItem("tg_qt_open");0');
    await reload();
    return state();
  };

  // 1) Mặc định theo máy
  let s = await fresh(844, 390, true);
  check(
    s.form === "phone" && s.orient === "landscape",
    `844x390 là điện thoại ngang (${s.form}/${s.orient})`,
  );
  check(
    s.collapsed && s.aria === "false" && !s.listShown,
    `điện thoại ngang: bảng Nhiệm vụ THU GỌN mặc định (aria-expanded=${s.aria})`,
  );
  check(
    s.colPct <= 72,
    `điện thoại ngang: cột HUD trái cao ${s.colH} px = ${s.colPct} % chiều cao (<= 72 %; trước đây 82 %)`,
  );
  check(s.btnH >= 44, `tiêu đề bấm được >= 44 px trên cảm ứng (${s.btnW}x${s.btnH})`);
  check(
    s.topIsBtn,
    "tiêu đề không bị lớp nào chắn (bấm trúng nút, kể cả khi thân bảng trong suốt với chạm)",
  );
  for (const [w, h] of [
    [667, 375],
    [640, 360],
    [932, 430],
  ]) {
    s = await fresh(w, h, true);
    check(
      s.collapsed && s.colPct <= 76,
      `${w}x${h}: thu gọn, cột HUD ${s.colH} px = ${s.colPct} %`,
    );
  }
  s = await fresh(360, 640, true);
  check(
    s.collapsed && s.orient === "portrait",
    `điện thoại dọc THẤP 360x640: thu gọn (cột ${s.colPct} %)`,
  );
  s = await fresh(390, 844, true);
  check(
    s.collapsed && s.aria === "false" && !s.listShown,
    `điện thoại dọc cao 390x844: THU GỌN mặc định (mọi điện thoại thu gọn; cột ${s.colPct} %)`,
  );
  s = await fresh(768, 1024, true);
  check(!s.collapsed, "tablet 768x1024: mở mặc định");
  s = await fresh(1280, 720, false);
  check(!s.collapsed && s.aria === "true", "máy tính 1280x720: mở mặc định");

  // 2) Bấm tiêu đề mở / thu, nhớ lựa chọn, qua nạp lại trang
  s = await fresh(844, 390, true);
  // có nhiệm vụ thì mở / thu mới đổi chiều cao (không có nhiệm vụ: bảng chỉ còn tiêu đề một dòng, QUYET_DINH_M3 mục 15)
  await evalJs(
    `window.__ui.onQuests({ active: [{ id: "nhap_the", step: 0, count: 0 }, { id: "tru_tho", step: 0, count: 3 }], done: [], dailyDone: [] });0`,
  );
  await calm(state);
  s = await state();
  const before = s.colH;
  await tap();
  s = await state();
  check(
    !s.collapsed && s.aria === "true" && s.listShown && s.pref === "1",
    `bấm: MỞ (aria-expanded=${s.aria}, tg_qt_open=${s.pref}, cột ${before} -> ${s.colH} px)`,
  );
  check(s.colH > before, "mở ra làm cột HUD cao hơn lúc thu gọn");
  await reload();
  s = await state();
  check(
    !s.collapsed && s.pref === "1",
    "nạp lại trang: lựa chọn MỞ được nhớ (thắng mặc định thu gọn của điện thoại ngang)",
  );
  await tap();
  s = await state();
  check(
    s.collapsed && s.aria === "false" && s.pref === "0",
    `bấm lần nữa: THU GỌN (tg_qt_open=${s.pref})`,
  );
  await reload();
  s = await state();
  check(s.collapsed && s.pref === "0", "nạp lại trang: lựa chọn THU GỌN được nhớ");

  // 3) Xoay máy: chưa chọn thì tự đổi theo độ gọn; đã chọn thì giữ
  s = await fresh(768, 1024, true);
  check(!s.collapsed, "bắt đầu ở tablet dọc 768x1024, chưa chọn: mở");
  await metrics(390, 844, true);
  s = await state();
  check(
    s.collapsed && s.pref === null,
    "đổi sang cỡ điện thoại 390x844 (chưa chọn): tự THU GỌN, không ghi lựa chọn",
  );
  await metrics(768, 1024, true);
  s = await state();
  check(!s.collapsed && s.pref === null, "trở lại tablet 768x1024 (chưa chọn): tự MỞ lại");
  await metrics(844, 390, true);
  await tap(); // chọn MỞ ở ngang
  await metrics(360, 640, true); // dọc thấp, mặc định sẽ thu gọn
  s = await state();
  check(
    !s.collapsed && s.pref === "1",
    "đã chọn MỞ: xoay sang dọc thấp vẫn giữ MỞ (lựa chọn thắng mặc định)",
  );
  await evalJs('localStorage.removeItem("tg_qt_open");0');

  // 4) Gợi ý "chạm nhiệm vụ để chỉ đường" nằm NGOÀI nút thu gọn / mở (nit của A ở #386: nằm trong nút thì dễ hiểu nhầm bấm tiêu đề là chỉ đường)
  const hintState = () =>
    evalJs(`(() => {
      const t = document.getElementById("qt-toggle"), h = document.getElementById("qt-hint");
      const hr = h.getBoundingClientRect(), tr = t.getBoundingClientRect();
      return JSON.stringify({ inButton: t.contains(h), btnText: t.textContent, shown: getComputedStyle(h).display !== "none" && !h.hidden,
        below: hr.top >= tr.bottom - 1, text: h.textContent });
    })()`).then((v) => JSON.parse(v));
  await fresh(768, 1024, true); // tablet đủ rộng: mở mặc định (điện thoại thu gọn mặc định nên không dùng 390x844)
  let hs = await hintState();
  check(
    !hs.inButton && !/chỉ đường/i.test(hs.btnText),
    `nhãn gợi ý nằm ngoài nút thu gọn / mở (nút chỉ có "${hs.btnText.trim()}")`,
  );
  check(!hs.shown, "chưa có nhiệm vụ: không hiện gợi ý chỉ đường (không có gì để chạm)");
  await evalJs(
    `window.__ui.onQuests({ active: [{ id: "nhap_the", step: 0, count: 0 }], done: [], dailyDone: [] });0`,
  );
  await calm(hintState);
  hs = await hintState();
  check(hs.shown && hs.below, `có nhiệm vụ + bảng mở: hiện gợi ý ngay dưới tiêu đề ("${hs.text}")`);
  const preTap = await state();
  await tap(); // thu gọn
  hs = await hintState();
  const postTap = await state();
  check(
    !hs.shown,
    `bảng thu gọn: ẩn gợi ý (trước chạm collapsed=${preTap.collapsed} aria=${preTap.aria}; sau chạm collapsed=${postTap.collapsed} aria=${postTap.aria} pref=${postTap.pref}; gợi ý hiện=${hs.shown} "${hs.text}")`,
  );
  await tap(); // mở lại
  await evalJs(`window.__ui.onQuests({ active: [], done: [], dailyDone: [] });0`);
  await calm(hintState);
  hs = await hintState();
  check(!hs.shown, "hết nhiệm vụ: ẩn gợi ý");
  await evalJs('localStorage.removeItem("tg_qt_open");0');

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  if (launched) await launched.close();
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
