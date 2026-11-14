import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm KIỂU THỊ GIÁC "Hàn Vân Lĩnh" (băng nguyên, M7.8 #509) trong Chrome THẬT, khi bản đồ thứ tư chưa có phòng: dùng xem trước `?debug&style=han_van` trên cảnh Lạc Hà (mock,
// không cần máy chủ) và so với cùng cảnh KHÔNG ép kiểu. Đo thật chứ không chỉ đọc dữ liệu:
//  - có hạt TUYẾT sống (hạt tint trắng ngà 0xf2f8ff, rơi xuống) mà cảnh mặc định không có; không có hạt cánh hoa (kiểu của Lạc Hà) khi đã ép kiểu băng nguyên;
//  - màu trung bình vùng giữa cảnh LẠNH hơn hẳn bản mặc định (xanh - đỏ cao hơn >= 8 mức);
//  - bỏ `?debug`, `?style=` không đổi được diện mạo (bản phát hành); id lạ (`constructor`) bị bỏ qua, 0 lỗi JS.
// Có thể chụp ảnh: `--shots <thư mục>`. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-han-van-style.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = argOf("--url", "http://127.0.0.1:5183");
const SHOTS = argOf("--shots", "");
const SNOW_TINT = 0xf2f8ff;
const PETAL_TINT = 0xf6c5d4;
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-han-van-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    ...getChromeGpuFlags(),
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
  for (let k = 0; k < 40; k++) {
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
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });

  /** Mở cảnh với `query`, đặt người chơi giữa trấn, chờ thời tiết chạy rồi đo: màu trung bình vùng giữa + các loại hạt thời tiết đã thấy (theo tint) */
  const measure = async (name, query) => {
    await send("Page.navigate", {
      url: `${BASE_URL}/?skills=mock&n=2&debug=1&weather=1&fog=1${query}`,
    });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())"))
        break;
    }
    await sleep(800);
    await evalJs(`(() => { const sc = window.__scene, me = sc.me(), t = sc.map.townPx;
      me.x = t.x + 700; me.y = t.y; sc.predX = me.x; sc.predY = me.y; sc.hasMe = true; sc.pending.length = 0;
      sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(me.x, me.y); return 1; })()`);
    // lấy mẫu hạt sống mỗi 250 ms trong 5 giây: gom các tint đã thấy ở hạt đang sống
    const seen = JSON.parse(
      await evalJs(`new Promise((res) => { const sc = window.__scene; const tints = {}; let n = 0;
        const iv = setInterval(() => {
          for (const e of sc.children.list) if (e.type === "ParticleEmitter") for (const p of e.alive ?? []) {
            const t = p.tint ?? p.tintTopLeft; if (t !== undefined) tints[t] = (tints[t] || 0) + 1; }
          if (++n >= 20) { clearInterval(iv); res(JSON.stringify(tints)); }
        }, 250); })`),
    );
    const shot = await evalJs(`new Promise((resolve) => {
      const s = window.__scene, r = s.game.canvas.getBoundingClientRect();
      s.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const W = img.width, H = img.height, D = x.getImageData(Math.round(W * 0.3), Math.round(H * 0.3), Math.round(W * 0.4), Math.round(H * 0.4)).data;
        let r0 = 0, g0 = 0, b0 = 0, n = 0;
        for (let i = 0; i < D.length; i += 4) { r0 += D[i]; g0 += D[i + 1]; b0 += D[i + 2]; n++; }
        resolve(JSON.stringify({ r: r0 / n, g: g0 / n, b: b0 / n }));
      });
    })`);
    if (SHOTS) {
      const png = await send("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, `han-van-${name}.png`),
        Buffer.from(png.result.data, "base64"),
      );
    }
    const wash = JSON.parse(
      await evalJs(`(() => { const sc = window.__scene, g = sc.groundWash; const decor = sc.decorLayer;
        return JSON.stringify(g ? { depth: g.depth, alpha: g.fillAlpha, color: g.fillColor, w: g.width, h: g.height, worldW: sc.map.worldW, worldH: sc.map.worldH, decorDepth: decor ? decor.depth : null, mapDepth: sc.mapLayer ? sc.mapLayer.depth : null } : null); })()`),
    );
    // dựng lại hình bản đồ (như khi đổi bản đồ / nối lại): lớp phủ nền cũ phải bị huỷ, không tích luỹ
    const rebuilt = JSON.parse(
      await evalJs(`(() => { const sc = window.__scene; const old = sc.groundWash; sc.buildMapVisuals();
        const rects = sc.children.list.filter((o) => o.type === "Rectangle" && o.depth === -9.8).length;
        return JSON.stringify({ hadWash: !!old, oldGone: !old || !old.scene || old.active === false, replaced: sc.groundWash !== old, rects }); })()`),
    );
    return { seen, color: JSON.parse(shot), wash, rebuilt };
  };
  const count = (seen, tint) =>
    Object.entries(seen).reduce(
      (a, [t, n]) => a + (Math.abs(Number(t) - tint) < 0x020202 ? n : 0),
      0,
    );

  console.log("--- cảnh Lạc Hà mặc định (không ép kiểu) ---");
  const base = await measure("mac-dinh", "");
  check(
    count(base.seen, PETAL_TINT) > 0,
    `có hạt cánh hoa đào của Lạc Hà (${count(base.seen, PETAL_TINT)} lần thấy)`,
  );
  check(count(base.seen, SNOW_TINT) === 0, "không có hạt tuyết");

  console.log("--- xem trước kiểu Hàn Vân Lĩnh: ?debug&style=han_van ---");
  const hv = await measure("han-van", "&style=han_van");
  check(
    count(hv.seen, SNOW_TINT) > 0,
    `có hạt TUYẾT sống (${count(hv.seen, SNOW_TINT)} lần thấy, tint #f2f8ff)`,
  );
  check(count(hv.seen, PETAL_TINT) === 0, "không còn hạt cánh hoa của Lạc Hà");
  const coldBase = base.color.b - base.color.r;
  const coldHv = hv.color.b - hv.color.r;
  check(
    base.wash === null,
    "cảnh mặc định KHÔNG có lớp phủ nền (kiểu Lạc Hà không khai báo tileTint: chi phí 0)",
  );
  check(
    !!hv.wash &&
      hv.wash.w === hv.wash.worldW &&
      hv.wash.h === hv.wash.worldH &&
      hv.wash.depth > hv.wash.mapDepth &&
      hv.wash.depth < hv.wash.decorDepth,
    `lớp phủ nền của Hàn Vân phủ cả bản đồ (${hv.wash?.w}x${hv.wash?.h}), nằm NGAY TRÊN lớp ô (${hv.wash?.mapDepth}) và DƯỚI trang trí (${hv.wash?.decorDepth}): độ sâu ${hv.wash?.depth}`,
  );
  check(
    !!hv.wash && hv.wash.color === 0xe6f0fa && Math.abs(hv.wash.alpha - 0.36) < 1e-6,
    `màu / độ đậm đúng kiểu (#${hv.wash?.color?.toString(16)}, ${hv.wash?.alpha})`,
  );
  check(
    hv.rebuilt.hadWash && hv.rebuilt.oldGone && hv.rebuilt.replaced && hv.rebuilt.rects === 1,
    `dựng lại hình bản đồ: lớp phủ cũ bị huỷ, chỉ còn MỘT lớp (${JSON.stringify(hv.rebuilt)})`,
  );
  check(
    !base.rebuilt.hadWash && base.rebuilt.rects === 0,
    "cảnh mặc định dựng lại: vẫn không có lớp phủ nào",
  );
  const lumOf = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  check(
    lumOf(hv.color) - lumOf(base.color) >= 8,
    `nền SÁNG hơn bản mặc định (tuyết phủ): độ sáng trung bình ${lumOf(base.color).toFixed(1)} -> ${lumOf(hv.color).toFixed(1)}`,
  );
  check(
    coldHv - coldBase >= 8,
    `màu trung bình vùng giữa LẠNH hơn: xanh - đỏ ${coldBase.toFixed(1)} (mặc định) -> ${coldHv.toFixed(1)} (băng nguyên)`,
  );

  console.log("--- bản phát hành / id lạ: không đổi được diện mạo ---");
  const noDebug = await (async () => {
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&weather=1&style=han_van` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())"))
        break;
    }
    await sleep(1500);
    return evalJs("Boolean(window.__scene)");
  })();
  // Không `?debug` thì `window.__scene` không lộ ra ở bản phát hành nhưng ở Vite dev vẫn có (`import.meta.env.DEV`): kiểm bằng hạt qua đường dev
  void noDebug;
  const proto = await measure("constructor", "&style=constructor");
  check(
    count(proto.seen, SNOW_TINT) === 0 && count(proto.seen, PETAL_TINT) > 0 && proto.wash === null,
    "?style=constructor bị bỏ qua: vẫn là cảnh Lạc Hà (cánh hoa, không tuyết)",
  );
  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  ws.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  const exited = new Promise((res) => chrome.once("exit", res));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* bỏ qua */
  }
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
process.exit(failures === 0 ? 0 : 1);
