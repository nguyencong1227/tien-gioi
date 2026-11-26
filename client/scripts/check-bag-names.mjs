/* global console, setTimeout, process, Buffer */
// Kiểm TÊN Ô TÚI ở các khung nhìn (nit của B, M7.8 #509) trong Chrome THẬT (`?skills=mock`, không cần máy chủ): bơm túi 24 món tên dài qua đúng đường tin `inv` (`__ui.onInv`) rồi đo DOM.
// Ở điện thoại ô túi chỉ ~42-68 px mà chữ nội dung >= 14 px, nên tên chỉ còn 2-3 chữ ("Hồi…", "Th…") và nhiều món cắt giống hệt nhau (đo cả 69 món: 68 / 69 tên bị cắt ở 390 x 844):
//  - điện thoại DỌC (`data-form="phone"` + `data-orient="portrait"`): tên ô BỊ ẨN (không phải cắt dở), biểu tượng >= 32 px, ô >= 44 px, `aria-label` vẫn mở đầu bằng tên ĐẦY ĐỦ, chạm ô thì bảng chi tiết ghi tên đầy đủ;
//  - máy tính, máy tính bảng và điện thoại NGANG (ô 80 px, bảng chi tiết nằm dưới màn hình): tên vẫn hiện, `aria-label` đủ tên, chọn ô thì bảng chi tiết ghi tên đầy đủ.
// Có thể chụp ảnh: `--shots <thư mục>`. Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-bag-names.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--slow-frame <ms>] [--shots /tmp/tg-b-shots]
import fs from "node:fs";
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
const SHOTS = argOf("--shots", "");
let launched = null;
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
try {
  launched = await launchChrome({ name: "bag-names" });
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
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}${slowFrameSource(slowFrameMs())}`,
  });
  /** 24 món tên dài thật (id của `ITEMS`): đan ba cấp, đồ ba ô riêng + trang bị, kinh quyển, nguyên liệu */
  const IDS = [
    "hoi_huyet_dan",
    "thuong_hoi_huyet_dan",
    "thuong_hoi_linh_dan",
    "dai_hoi_linh_dan",
    "hac_ho_kiem",
    "hac_ho_bao",
    "ho_hon_phu",
    "ho_bo_ngoa",
    "tho_nguyet_boi",
    "ho_than_an",
    "xich_mang_kiem",
    "han_lang_bao",
    "han_lang_mao",
    "kinh_hoa_van_kiem",
    "kinh_trong_nhac_tram",
    "kinh_bich_thuy_hoi_xuan",
    "kinh_thanh_tung_phi_cham",
    "tu_khi_dan",
    "long_tho",
    "nanh_soi",
    "thien_han_chau",
    "suong_van_ngoa",
    "suong_vu_kiem",
    "phong_nha_phu",
  ];
  for (const [W, H, mobile] of [
    [1280, 720, false],
    [768, 1024, true],
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
    // Đánh dấu tài liệu CŨ rồi mới điều hướng: điều kiện sẵn sàng KHÔNG được đúng trên tài liệu cũ (chưa kịp đổi trang)
    await evalJs("window.__isOldPage = true");
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&debug=1` });
    const ready = await waitUntilTrue(
      () =>
        evalJs(
          "Boolean(!window.__isOldPage && window.__ui && window.__scene && window.__scene.me && window.__scene.me())",
        ),
      60000,
      300,
    );
    if (!ready) throw new Error(`${W}x${H}: cảnh mock không sẵn sàng sau 60 s`);
    // Chờ THEO ĐIỀU KIỆN thay `sleep(500)`: phông Noto Serif đã tải xong (đo chữ bằng phông dự phòng sẽ sai) và `data-input` đã đặt lên <html>
    const settled = await waitUntilTrue(
      () =>
        evalJs(
          `document.fonts.status === "loaded" && Boolean(document.documentElement.dataset.input)`,
        ),
      30000,
      100,
    );
    if (!settled) throw new Error(`${W}x${H}: phông chưa tải xong / thiếu data-input sau 30 s`);
    await evalJs(
      `window.__ui.onInv({ slots: ${JSON.stringify(IDS.map((itemId) => ({ itemId, qty: 2 })))}, cd: {} }); window.__ui.toggleInventory(true); 0`,
    );
    await sleep(300);
    const form = await evalJs("document.documentElement.dataset.form");
    const orient = await evalJs("document.documentElement.dataset.orient");
    const phone = form === "phone" && orient === "portrait";
    const cells = await J(`[...document.querySelectorAll('#inv-grid .inv-slot')].map((b) => {
      const n = b.querySelector('.slot-name'), ic = b.querySelector('.slot-icon'), r = b.getBoundingClientRect(), ir = ic.getBoundingClientRect();
      return { name: n.textContent, shown: getComputedStyle(n).display !== 'none', aria: b.getAttribute('aria-label') || '', w: Math.round(r.width), h: Math.round(r.height), icon: Math.round(ir.width) };
    }).filter((c) => c.name)`);
    check(
      cells.length === IDS.length,
      `đủ ${IDS.length} món tên dài trong túi (${cells.length}); khung ${W}x${H} là "${form}" / "${orient}"`,
    );
    check(
      cells.every((c) => c.aria.startsWith(c.name)),
      "aria-label mọi ô mở đầu bằng tên ĐẦY ĐỦ của món",
    );
    check(
      cells.every((c) => c.w >= 44 && c.h >= 44),
      `mọi ô >= 44 px (nhỏ nhất ${Math.min(...cells.map((c) => c.w))} x ${Math.min(...cells.map((c) => c.h))})`,
    );
    if (phone) {
      check(
        cells.every((c) => !c.shown),
        "điện thoại dọc: tên trong ô được ẩn (không còn mẩu 2-3 chữ cắt dở)",
      );
      check(
        cells.every((c) => c.icon >= 32),
        `điện thoại dọc: biểu tượng >= 32 px (${Math.min(...cells.map((c) => c.icon))})`,
      );
    } else {
      check(
        cells.every((c) => c.shown),
        "máy tính, máy tính bảng, điện thoại NGANG: tên trong ô vẫn hiện (ngăn kéo ngang thấp, bảng chi tiết nằm dưới màn hình)",
      );
    }
    // chọn ô (chạm = pointerdown, như người chơi): bảng chi tiết ghi tên đầy đủ, kể cả món có tên dài nhất
    const longest = cells.reduce((a, c) => (c.name.length > a.name.length ? c : a), cells[0]);
    const idx = cells.findIndex((c) => c.name === longest.name);
    await evalJs(
      `document.querySelectorAll('#inv-grid .inv-slot')[${idx}].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 0`,
    );
    await sleep(150);
    const detail = await evalJs("document.getElementById('inv-item-name').textContent");
    check(
      String(detail).startsWith(longest.name),
      `chạm ô "${longest.name}": bảng chi tiết ghi "${detail}"`,
    );
    // không tràn ngang
    const ov = await J(
      "({ ow: document.documentElement.scrollWidth, vw: innerWidth, sw: document.getElementById('inv-modal').scrollWidth, cw: document.getElementById('inv-modal').clientWidth })",
    );
    check(
      ov.ow <= ov.vw + 1 && ov.sw <= ov.cw + 1,
      `không tràn ngang (trang ${ov.ow}/${ov.vw}, túi ${ov.sw}/${ov.cw})`,
    );
    if (SHOTS) {
      const png = await send("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, `ten-o-tui-${W}x${H}.png`),
        Buffer.from(png.result.data, "base64"),
      );
    }
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
