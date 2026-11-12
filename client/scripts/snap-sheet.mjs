/* global console, setTimeout, fetch, Buffer, process */
// Chụp ảnh + khẳng định bố cục cho tấm chung (.sheet, M5.1 #326) ở nhiều khung nhìn.
// Cần client đang chạy (npm run dev -w client hoặc vite preview). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/snap-sheet.mjs [--url http://127.0.0.1:5183] [--out docs/screenshots] [--no-shot]
// Thuộc tính <html data-form|orient> do gfx/display.ts (A) cập nhật; script đặt TAY theo từng khung để thử CSS độc lập.
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
  { name: "360x640", w: 360, h: 640, form: "phone", orient: "portrait" },
  { name: "390x844", w: 390, h: 844, form: "phone", orient: "portrait" },
  { name: "844x390", w: 844, h: 390, form: "phone", orient: "landscape" },
  { name: "768x1024", w: 768, h: 1024, form: "tablet", orient: "portrait" },
  { name: "1280x720", w: 1280, h: 720, form: "desktop", orient: "landscape" },
];
// Bảng đã chuyển sang tấm chung: [id bảng, tên hàm mở, tên hàm đóng]
const PANELS = [
  ["inv-modal", "toggleInventory"],
  ["char-modal", "toggleCharModal"],
];

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
  await sleep(500);
  if (!NO_SHOT) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const vp of VIEWPORTS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 1,
      mobile: vp.form === "phone",
    });
    await evalJs(
      `document.documentElement.dataset.form=${JSON.stringify(vp.form)};document.documentElement.dataset.orient=${JSON.stringify(vp.orient)};0`,
    );
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
          return JSON.stringify({
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
        check(
          m.scrolled > 0 && Math.abs(m.closeAfterScrollY - m.close.y) < 1,
          `nút đóng đứng yên khi cuộn nội dung (đã cuộn ${Math.round(m.scrolled)} px)`,
        );
      }
      if (vp.form === "phone") {
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
        const shot = await send("Page.captureScreenshot", { format: "png" });
        const file = `sheet-${id.replace("-modal", "")}-${vp.name}.png`;
        fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(shot.result.data, "base64"));
        console.log(`  ✓ ảnh ${file}`);
      }
      await evalJs(`window.__ui.${toggle}(false);0`);
      await sleep(100);
    }
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
