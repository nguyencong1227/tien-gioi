/* global console, setTimeout, process */
// Kiểm NHÃN TÊN VÙNG dưới bản đồ nhỏ (`#minimap-zone`) trong Chrome THẬT (`?skills=mock`, không cần máy chủ), ở bốn khung nhìn: MỌI tên vùng của `MAPS` (trấn + hoang của MỌI bản đồ: sáu bản đồ = 12 tên sau mục 75) đặt vào nhãn rồi đo: KHÔNG bị cắt (scrollWidth <= clientWidth), tối đa HAI dòng, chân bản đồ không đè thanh menu HUD bên dưới; màn cảm ứng ẩn chữ gợi ý "M" (không có phím M),
// máy tính vẫn hiện. Trước đây `max-width: 85px` + một dòng + dấu chấm lửng cắt 7 / 8 tên ở màn cảm ứng ("Hàn Vân T…") và "Vọng Sương Trạm" ở máy tính.
// Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-minimap-zone.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--slow-frame <ms>]
import path from "node:path";
import WebSocket from "ws";
import { resolveClientUrl } from "./client-url.mjs";
import { launchChrome } from "./chrome-launch.mjs";
import { waitUntilTrue } from "./chrome-wait.mjs";
import { slowFrameMs, slowFrameSource } from "./slow-frame.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = await resolveClientUrl(argOf("--url", ""));
const MAP_TS = `/@fs/${path.resolve(import.meta.dirname, "../../shared/src/map.ts").replace(/^\//, "")}`;
let launched = null;
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
try {
  launched = await launchChrome({ name: "minimap-zone" });
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
  const J = async (js) => JSON.parse(await evalJs(`JSON.stringify(${js})`));
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    // `--slow-frame <ms>` (hoặc `TG_SLOW_FRAME_MS`): giả lập runner khung chậm, xem `slow-frame.mjs`
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1')}catch(e){}${slowFrameSource(slowFrameMs())}`,
  });
  for (const [W, H, mobile] of [
    [1280, 720, false],
    [844, 390, true],
    [390, 844, true],
    [360, 640, true],
  ]) {
    console.log(`\n--- ${W}x${H}${mobile ? " (cảm ứng)" : ""} ---`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile,
    });
    // Cảm ứng thật: `(pointer: coarse)` đúng thì `display.ts` đặt data-input="touch" (CSS ẩn chữ "M" dựa vào đó)
    await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&debug=1` });
    const ready = await waitUntilTrue(
      () =>
        evalJs("Boolean(window.__ui && window.__scene && document.getElementById('minimap-zone'))"),
      60000,
      300,
    );
    if (!ready) throw new Error(`${W}x${H}: cảnh mock không sẵn sàng sau 60 s`);
    // Chờ THEO ĐIỀU KIỆN thay `sleep(600)`: phông Noto Serif đã tải xong (đo `scrollWidth` bằng phông dự phòng sẽ sai) và `data-input` đã đặt lên <html> (CSS ẩn chữ "M" dựa vào nó)
    const settled = await waitUntilTrue(
      () =>
        evalJs(
          `document.fonts.status === "loaded" && Boolean(document.documentElement.dataset.input)`,
        ),
      30000,
      100,
    );
    if (!settled) throw new Error(`${W}x${H}: phông chưa tải xong / thiếu data-input sau 30 s`);
    const names = JSON.parse(
      await evalJs(
        `import(${JSON.stringify(MAP_TS)}).then((m) => JSON.stringify([...new Set(m.MAPS.flatMap((d) => [d.townName, d.wildName]))]))`,
      ),
    );
    check(names.length >= 8, `${names.length} tên vùng của MAPS để kiểm`);
    // Hai bản đồ của mục 75 (#1467) phải nằm trong danh sách kiểm: tên trạm / vùng hoang MỚI (dài: "Huyết Trận Uy Vân", "Tuyết Đao Quan") là ca dễ bị cắt nhất
    for (const must of ["Tuyết Đao Quan", "Lang Hoang", "Uy Vân Kinh", "Huyết Trận Uy Vân"])
      check(names.includes(must), `tên vùng '${must}' có trong MAPS để kiểm`);
    const rows = [];
    for (const n of names) {
      rows.push(
        await J(`(() => { const z = document.getElementById("minimap-zone"); z.textContent = ${JSON.stringify(n)};
          const w = document.getElementById("minimap-wrap"), menu = document.getElementById("hud-menu");
          const lh = parseFloat(getComputedStyle(z).lineHeight) || parseFloat(getComputedStyle(z).fontSize) * 1.2;
          return { name: ${JSON.stringify(n)}, clipped: z.scrollWidth > z.clientWidth + 1, h: z.getBoundingClientRect().height, lh,
            wrapBottom: w.getBoundingClientRect().bottom, menuTop: menu ? menu.getBoundingClientRect().top : 1e9 }; })()`),
      );
    }
    const clipped = rows.filter((r) => r.clipped).map((r) => r.name);
    check(
      clipped.length === 0,
      `không tên vùng nào bị cắt ngang (${clipped.length} / ${rows.length}${clipped.length ? `: ${clipped.join(", ")}` : ""})`,
    );
    const tall = rows.filter((r) => r.h > 2 * r.lh + 2).map((r) => r.name);
    check(
      tall.length === 0,
      `mọi tên vùng tối đa hai dòng${tall.length ? ` (quá: ${tall.join(", ")})` : ""}`,
    );
    const overlap = rows.filter((r) => r.wrapBottom > r.menuTop + 0.5).map((r) => r.name);
    check(
      overlap.length === 0,
      `chân bản đồ không đè thanh menu HUD${overlap.length ? ` (đè với: ${overlap.join(", ")})` : ""}`,
    );
    const hint = await J(
      `(() => { const s = document.querySelector(".mm-foot small"); return s ? getComputedStyle(s).display : "none"; })()`,
    );
    check(
      mobile ? hint === "none" : hint !== "none",
      `chữ gợi ý "M": ${mobile ? "ẩn ở màn cảm ứng" : "hiện ở máy tính"} (display ${hint})`,
    );
  }
  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  ws.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  if (launched) await launched.close();
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
process.exit(failures === 0 ? 0 : 1);
