/* global console, setTimeout, fetch, Buffer, process */
// Chụp ảnh + khẳng định bố cục cho tấm chung (.sheet, M5.1 #326) ở nhiều khung nhìn.
// Cần client đang chạy (npm run dev -w client hoặc vite preview). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/snap-sheet.mjs [--url http://127.0.0.1:5183] [--out docs/screenshots] [--no-shot]
// Thuộc tính <html data-form|orient> và --vh do gfx/display.ts (A, #322) đặt; script KHẲNG ĐỊNH chúng đúng với từng khung nhìn.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const BASE_URL = arg("url", "http://127.0.0.1:5183");
const OUT_DIR = path.resolve(REPO, arg("out", "docs/screenshots"));
const NO_SHOT = process.argv.includes("--no-shot");

// Khung nhìn theo bảng phân loại mục 4.1 của THIET_KE_GIAO_DIEN_DO_HOA.md
const VIEWPORTS = [
  // desktop (con trỏ chuột) phải đứng đầu: xem ghi chú ở vòng lặp bên dưới
  { name: "1280x720", w: 1280, h: 720, form: "desktop", orient: "landscape" },
  { name: "360x640", w: 360, h: 640, form: "phone", orient: "portrait" },
  { name: "390x844", w: 390, h: 844, form: "phone", orient: "portrait" },
  { name: "844x390", w: 844, h: 390, form: "phone", orient: "landscape" },
  { name: "768x1024", w: 768, h: 1024, form: "tablet", orient: "portrait" },
];
// Bảng đã chuyển sang tấm chung: [id bảng, tên hàm mở, tên hàm đóng]
const PANELS = [
  ["inv-modal", "toggleInventory"],
  ["char-modal", "toggleCharModal"],
  ["settings-modal", "toggleSettingsModal"],
  ["map-modal", "toggleMapModal"],
  ["quest-modal", "toggleQuestModal"],
  ["shop-modal", "toggleShopModal"],
  ["forge-modal", "toggleForgeModal"],
  ["sect-modal", "toggleSectModal"],
];
// Tấm KHÔNG tự cuộn, từng view cuộn bên trong (để hộp xác nhận lồng luôn phủ kín tấm): bỏ ca "tấm cuộn được" và đo hộp xác nhận
const INNER_SCROLL = new Set(["sect-modal"]);
// Bảng mới chụp ảnh WebP
const WEBP_PANELS = new Set(["sect-modal"]);
// Thẻ (.sheet.sheet-card): hộp thoại kết quả / chỉ dẫn / cảnh báo có nút hành động riêng; mở bằng cách bỏ `hidden` (bố cục đo theo nội dung mặc định)
const CARDS = ["dungeon-end-modal", "duel-end-modal", "newbie-guide-modal", "outdated-modal"];

const CDP_PORT = 39100 + Math.floor(Math.random() * 400);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-snap-sheet-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpDir}`,
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
  let targets = [];
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        targets = await res.json();
        break;
      }
    } catch {
      await sleep(150);
    }
  }
  const page = targets.find((t) => t.type === "page");
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

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Tắt bảng chỉ dẫn người mới (nếu không nó phủ lên tấm đang thử)
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "try{localStorage.setItem('tg_newbie_guide_dismissed','1')}catch(e){}",
  });
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    if (await evalJs("Boolean(window.__ui && window.__scene)")) {
      ready = true;
      break;
    }
  }
  if (!ready)
    throw new Error(
      "Client mock không khởi động kịp sau 12s (client có đang chạy ở " + BASE_URL + "?).",
    );
  // Ẩn dải "giả lập" của chế độ mock để không che tiêu đề trong ảnh
  await evalJs(
    "document.querySelectorAll('.duel-mock-badge,.dungeon-mock-badge').forEach((e) => e.remove());0",
  );
  // Cửa hàng / Lò rèn TỰ ĐÓNG khi không có NPC ở gần (WorldScene.syncNpcs mỗi khung), mà cảnh mock không có NPC: vô hiệu hoá để tấm ở yên cho phép đo
  await evalJs("window.__scene.syncNpcs = () => {};0");
  await sleep(500);
  if (!NO_SHOT) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const vp of VIEWPORTS) {
    // phone / tablet = cảm ứng (con trỏ chính coarse), desktop = chuột
    const touch = vp.form !== "desktop";
    // Con trỏ chính cảm ứng (coarse): chỉ BẬT được, Chrome không trả về chuột trong cùng phiên
    // (setEmulatedMedia không hỗ trợ `pointer`), nên desktop phải đứng ĐẦU danh sách VIEWPORTS.
    if (touch)
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 1,
      mobile: touch,
    });
    await sleep(400); // display.ts gom sự kiện đổi kích thước ~100 ms
    const dd = JSON.parse(
      await evalJs(`JSON.stringify({
        form: document.documentElement.dataset.form,
        orient: document.documentElement.dataset.orient,
        vh: document.documentElement.style.getPropertyValue("--vh"),
        ih: innerHeight,
      })`),
    );
    console.log(`\n[${vp.name}] display.ts: form=${dd.form} orient=${dd.orient} --vh=${dd.vh}`);
    check(
      dd.form === vp.form && dd.orient === vp.orient,
      `display.ts phân loại ${vp.form}/${vp.orient}`,
    );
    check(dd.vh === `${dd.ih}px`, "--vh bằng chiều cao khung nhìn (px)");
    for (const [id, toggle] of PANELS) {
      console.log(`\n[${vp.name} ${vp.form}/${vp.orient}] ${id}`);
      await evalJs(`window.__ui.${toggle}(true);0`);
      await sleep(450); // chờ hết animation trượt (220 ms)
      const m = JSON.parse(
        await evalJs(`(() => {
          const el = document.getElementById(${JSON.stringify(id)});
          const r = el.getBoundingClientRect();
          const close = el.querySelector(".modal-close");
          const c = close.getBoundingClientRect();
          // Trước khi chèn chiều cao giả: tấm có vừa nội dung tự nhiên không, và có cho cuộn không (overflow-y)
          const naturalFits = el.scrollHeight <= el.clientHeight + 1;
          const overflowY = getComputedStyle(el).overflowY;
          // Ép nội dung dài để tấm CHẮC CHẮN cuộn được, rồi cuộn xuống đáy: nút đóng phải đứng yên
          const spacer = document.createElement("div");
          spacer.style.cssText = "height:1800px;flex:none";
          el.appendChild(spacer);
          el.scrollTop = el.scrollHeight;
          const c2 = close.getBoundingClientRect();
          const scrolled = el.scrollTop;
          el.scrollTop = 0;
          spacer.remove();
          const de = document.documentElement;
          // Lấy mẫu lưới 5x5 trên tấm: mọi điểm phải thuộc tấm (không có HUD / lớp khác chắn bắt chạm)
          let foreign = 0;
          for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
              const px = Math.min(r.x + ((i + 0.5) / 5) * r.width, innerWidth - 1);
              const py = Math.min(r.y + ((j + 0.5) / 5) * r.height, innerHeight - 1);
              const t = document.elementFromPoint(px, py);
              if (!t || !el.contains(t)) foreign++;
            }
          }
          // Danh sách trong tấm (Lò rèn / Cửa hàng / Sổ nhiệm vụ) không được có khung cuộn riêng khi tấm đã tự cuộn (hai thanh cuộn lồng nhau)
          const nestedScroll = [...el.querySelectorAll(".forge-list, .shop-list, #quest-list")].filter((l) =>
            ["auto", "scroll"].includes(getComputedStyle(l).overflowY),
          ).length;
          return JSON.stringify({
            nestedScroll,
            naturalFits,
            overflowY,
            foreign,
            iw: innerWidth, ih: innerHeight,
            sheet: { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom },
            close: { x: c.x, y: c.y, w: c.width, h: c.height, r: c.right, b: c.bottom },
            closeAfterScrollY: c2.y,
            scrolled,
            docScrollW: de.scrollWidth, docScrollH: de.scrollHeight,
            bodyScrollW: document.body.scrollWidth, bodyScrollH: document.body.scrollHeight,
          });
        })()`),
      );
      check(
        m.foreign === 0,
        `tấm nằm trên cùng, không lớp khác chắn (${m.foreign}/25 điểm mẫu bị chắn)`,
      );
      check(
        m.docScrollW <= m.iw && m.docScrollH <= m.ih,
        `không thanh cuộn ngoài ý muốn (doc ${m.docScrollW}x${m.docScrollH} / khung ${m.iw}x${m.ih})`,
      );
      check(
        m.close.w >= 44 && m.close.h >= 44,
        `nút đóng >= 44x44 (${Math.round(m.close.w)}x${Math.round(m.close.h)})`,
      );
      if (vp.form === "phone") {
        // Chỉ điện thoại: nút đóng cố định ở vùng với tay. Cửa sổ nổi (tablet / desktop) để nút đóng ở đầu bảng như cũ.
        if (INNER_SCROLL.has(id))
          check(
            m.overflowY === "hidden" &&
              m.naturalFits &&
              Math.abs(m.closeAfterScrollY - m.close.y) < 1,
            `tấm không tự cuộn (overflow-y ${m.overflowY}, vừa nội dung: ${m.naturalFits}; view cuộn bên trong), nút đóng đứng yên`,
          );
        else
          check(
            m.scrolled > 0 && Math.abs(m.closeAfterScrollY - m.close.y) < 1,
            `nút đóng đứng yên khi cuộn nội dung (đã cuộn ${Math.round(m.scrolled)} px)`,
          );
      }
      if (vp.form === "phone") {
        check(
          m.nestedScroll === 0,
          `phone: danh sách trong tấm không có khung cuộn riêng (${m.nestedScroll} khung)`,
        );
        check(
          Math.abs(m.sheet.h - m.ih) < 1,
          `phone: tấm cao đủ màn hình (${Math.round(m.sheet.h)} / ${m.ih})`,
        );
        if (vp.orient === "portrait") {
          check(Math.abs(m.sheet.w - m.iw) < 1 && m.sheet.x < 1, "phone dọc: tấm toàn màn hình");
        } else {
          check(
            Math.abs(m.sheet.r - m.iw) < 1 && m.sheet.w <= m.iw * 0.64 + 1,
            `phone ngang: ngăn kéo sát cạnh phải (rộng ${Math.round(m.sheet.w)})`,
          );
        }
        check(
          m.close.r <= m.iw - 12 + 1 && m.close.b <= m.ih - 12 + 1,
          "nút đóng ở góc dưới phải, cách mép >= 12 px",
        );
      } else {
        check(
          m.sheet.x >= 0 && m.sheet.r <= m.iw && m.sheet.y >= 0 && m.sheet.b <= m.ih,
          "cửa sổ nổi nằm gọn trong màn hình",
        );
        check(Math.abs(m.sheet.x + m.sheet.w / 2 - m.iw / 2) < 2, "cửa sổ nổi căn giữa ngang");
      }
      if (!NO_SHOT) {
        // Bảng mới dùng WebP (nhẹ hơn PNG ~3 lần); các bảng cũ giữ PNG để ảnh cũ không thành mồ côi
        const webp = WEBP_PANELS.has(id);
        const shot = await send(
          "Page.captureScreenshot",
          webp ? { format: "webp", quality: 90 } : { format: "png" },
        );
        const file = `sheet-${id.replace("-modal", "")}-${vp.name}.${webp ? "webp" : "png"}`;
        fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(shot.result.data, "base64"));
        console.log(`  ✓ ảnh ${file}`);
      }
      if (id === "sect-modal") {
        // Hộp xác nhận lồng (Nhường / Trục xuất / Rời): phải phủ KÍN tấm, nằm trên cùng, nút >= 44 px trên điện thoại
        const cf = JSON.parse(
          await evalJs(`(() => {
            const el = document.getElementById("sect-modal"), ov = document.getElementById("sect-action-confirm");
            document.getElementById("sect-action-confirm-text").textContent = "Xác nhận thao tác tông môn?";
            ov.hidden = false;
            const s = el.getBoundingClientRect(), o = ov.getBoundingClientRect();
            const pts = [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95], [0.5, 0.5]];
            let foreign = 0;
            for (const [fx, fy] of pts) {
              const t = document.elementFromPoint(Math.min(s.x + fx * s.width, innerWidth - 1), Math.min(s.y + fy * s.height, innerHeight - 1));
              if (!t || !ov.contains(t)) foreign++;
            }
            const btns = [...ov.querySelectorAll("button")].map((b) => { const q = b.getBoundingClientRect(); return { w: q.width, h: q.height, ok: q.top >= s.top && q.bottom <= s.bottom && q.left >= s.left && q.right <= s.right }; });
            ov.hidden = true;
            return JSON.stringify({ dx: Math.abs(o.x - s.x), dy: Math.abs(o.y - s.y), dw: Math.abs(o.width - s.width), dh: Math.abs(o.height - s.height), foreign, btns });
          })()`),
        );
        check(
          // hộp phủ khung đệm của tấm, tấm có viền 1 px (cửa sổ nổi) nên lệch <= 1 px mỗi cạnh, cỡ lệch <= 2 px
          cf.dx < 1.5 && cf.dy < 1.5 && cf.dw < 2.5 && cf.dh < 2.5,
          `hộp xác nhận lồng phủ kín tấm (lệch ${cf.dx.toFixed(1)},${cf.dy.toFixed(1)} cỡ ${cf.dw.toFixed(1)}x${cf.dh.toFixed(1)})`,
        );
        check(cf.foreign === 0, `hộp xác nhận nằm trên cùng (${cf.foreign}/5 điểm mẫu bị chắn)`);
        check(
          cf.btns.length === 2 &&
            cf.btns.every((b) => b.ok && b.h >= (vp.form === "phone" ? 44 : 36)),
          `hai nút xác nhận nằm trong tấm, đủ lớn (${cf.btns.map((b) => Math.round(b.h)).join(", ")} px)`,
        );
      }
      await evalJs(`window.__ui.${toggle}(false);0`);
      await sleep(100);
    }
    for (const id of CARDS) {
      console.log(`\n[${vp.name} ${vp.form}/${vp.orient}] ${id} (thẻ)`);
      await evalJs(`document.getElementById(${JSON.stringify(id)}).hidden = false;0`);
      await sleep(450);
      const c = JSON.parse(
        await evalJs(`(() => {
          const el = document.getElementById(${JSON.stringify(id)});
          const r0 = el.getBoundingClientRect();
          let foreign = 0;
          for (let i = 0; i < 5; i++)
            for (let j = 0; j < 5; j++) {
              const t = document.elementFromPoint(Math.min(r0.x + ((i + 0.5) / 5) * r0.width, innerWidth - 1), Math.min(r0.y + ((j + 0.5) / 5) * r0.height, innerHeight - 1));
              if (!t || !el.contains(t)) foreign++;
            }
          const cantScroll = el.scrollHeight <= el.clientHeight + 1;
          el.scrollTop = el.scrollHeight; // kéo xuống đáy: nút hành động cuối phải với tới được
          const r = el.getBoundingClientRect();
          const btns = [...el.querySelectorAll("button")].filter((b) => b.getClientRects().length > 0).map((b) => {
            const q = b.getBoundingClientRect();
            return { id: b.id, w: q.width, h: q.height, top: q.top, bottom: q.bottom, inCard: q.top >= r.top - 1 && q.bottom <= r.bottom + 1, fixed: getComputedStyle(b).position === "fixed" };
          });
          el.scrollTop = 0;
          const de = document.documentElement;
          return JSON.stringify({
            foreign, iw: innerWidth, ih: innerHeight, cantScroll,
            card: { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom },
            sheetW: parseFloat(getComputedStyle(el).getPropertyValue("--sheet-w")),
            btns,
            docScrollW: de.scrollWidth, docScrollH: de.scrollHeight,
          });
        })()`),
      );
      check(
        c.foreign === 0,
        `thẻ nằm trên cùng, không lớp khác chắn (${c.foreign}/25 điểm mẫu bị chắn)`,
      );
      check(
        c.docScrollW <= c.iw && c.docScrollH <= c.ih,
        `không thanh cuộn ngoài ý muốn (doc ${c.docScrollW}x${c.docScrollH} / khung ${c.iw}x${c.ih})`,
      );
      check(
        c.card.x >= 0 && c.card.r <= c.iw && c.card.y >= 0 && c.card.b <= c.ih,
        `thẻ nằm gọn trong màn hình (${Math.round(c.card.x)},${Math.round(c.card.y)} ${Math.round(c.card.w)}x${Math.round(c.card.h)} / ${c.iw}x${c.ih})`,
      );
      check(Math.abs(c.card.x + c.card.w / 2 - c.iw / 2) < 2, "thẻ căn giữa ngang");
      check(
        c.cantScroll
          ? Math.abs(c.card.y + c.card.h / 2 - c.ih / 2) < 2
          : c.card.h <= c.ih - 23 && c.card.h >= c.ih * 0.5,
        `thẻ căn giữa dọc (hoặc, nếu dài, cuộn trong khung chừa lề >= 12 px: cao ${Math.round(c.card.h)} / ${c.ih})`,
      );
      check(
        c.card.w <= Math.min(c.iw * 0.94, c.sheetW) + 1,
        `bề rộng thẻ <= min(94 % khung, --sheet-w ${c.sheetW}) (${Math.round(c.card.w)})`,
      );
      check(
        c.btns.length > 0,
        `thẻ có nút hành động hiện (${c.btns.map((b) => b.id || "?").join(", ")})`,
      );
      check(
        c.btns.every((b) => b.h >= 44 && b.w >= 44),
        `mọi nút >= 44x44 (${c.btns.map((b) => `${b.id || "?"} ${Math.round(b.w)}x${Math.round(b.h)}`).join(", ")})`,
      );
      check(
        c.btns.every((b) => b.inCard && b.bottom <= c.ih && b.top >= 0 && !b.fixed),
        "kéo xuống đáy: mọi nút nằm trong thẻ, với tới được, không bị ghim ra ngoài thẻ",
      );
      if (!NO_SHOT) {
        const shot = await send("Page.captureScreenshot", { format: "webp", quality: 90 });
        const file = `sheet-${id.replace("-modal", "")}-${vp.name}.webp`;
        fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(shot.result.data, "base64"));
        console.log(`  ✓ ảnh ${file}`);
      }
      await evalJs(`document.getElementById(${JSON.stringify(id)}).hidden = true;0`);
      await sleep(100);
    }
  }
  // ---- Bàn phím ảo: khung nhìn chỉ thấp đi (không xoay máy) thì tấm KHÔNG được đổi dạng (#339) ----
  // Ca thật: điện thoại nhỏ 360x640 mở bàn phím còn ~360x340 (rộng >= cao nên phân loại thô sẽ ra landscape).
  console.log("\n[bàn phím ảo] 360x640 -> 360x340 -> xoay 640x360 -> về 360x640");
  const measure = async (id) =>
    JSON.parse(
      await evalJs(`(() => {
        const el = document.getElementById(${JSON.stringify(id)});
        const r = el.getBoundingClientRect();
        const de = document.documentElement;
        return JSON.stringify({
          form: de.dataset.form, orient: de.dataset.orient, input: de.dataset.input,
          vh: de.style.getPropertyValue("--vh"), iw: innerWidth, ih: innerHeight,
          x: r.x, w: r.width, h: r.height, r: r.right,
        });
      })()`),
    );
  const setSize = async (w, h) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(400);
  };
  await setSize(360, 640);
  // Một lần chạm thật để display.ts biết đang dùng cảm ứng (data-input="touch"), như người chơi thật
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 5, y: 5 }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await evalJs("window.__ui.toggleInventory(true);0");
  await sleep(450);
  let k = await measure("inv-modal");
  check(k.input === "touch", `đã nhận cảm ứng (data-input=${k.input})`);
  check(k.form === "phone" && k.orient === "portrait", `trước bàn phím: ${k.form}/${k.orient}`);
  await setSize(360, 340);
  k = await measure("inv-modal");
  check(k.vh === "340px", `--vh theo chiều cao THẬT khi mở bàn phím (${k.vh})`);
  check(
    k.form === "phone" && k.orient === "portrait",
    `bàn phím mở: vẫn phone/portrait, không lật landscape (${k.form}/${k.orient})`,
  );
  check(
    k.x < 1 && Math.abs(k.w - k.iw) < 1 && Math.abs(k.h - k.ih) < 1,
    `tấm vẫn toàn màn hình và co theo chỗ còn lại (${Math.round(k.w)}x${Math.round(k.h)} / ${k.iw}x${k.ih})`,
  );
  await setSize(360, 640);
  k = await measure("inv-modal");
  check(k.orient === "portrait" && k.vh === "640px", `đóng bàn phím: portrait, --vh=${k.vh}`);
  await setSize(640, 360); // xoay máy thật: bề rộng đổi nên phân loại lại
  k = await measure("inv-modal");
  check(
    k.form === "phone" && k.orient === "landscape",
    `xoay máy: phone/landscape (${k.form}/${k.orient})`,
  );
  check(
    Math.abs(k.r - k.iw) < 1 && k.w <= k.iw * 0.64 + 1,
    `xoay máy: ngăn kéo cạnh phải (rộng ${Math.round(k.w)})`,
  );
  await setSize(360, 640);
  k = await measure("inv-modal");
  check(k.orient === "portrait", `xoay lại: portrait (${k.orient})`);
  await evalJs("window.__ui.toggleInventory(false);0");
  // Máy tính bảng + bàn phím: 768x1024 -> 768x560 vẫn là tablet (cửa sổ nổi), không thành phone
  await setSize(768, 1024);
  await setSize(768, 560);
  k = await measure("inv-modal");
  check(k.form === "tablet", `tablet + bàn phím vẫn là tablet (${k.form}/${k.orient})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
