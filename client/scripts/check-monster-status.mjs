import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm HUY HIỆU TRẠNG THÁI CÓ HẠI TRÊN ĐẦU QUÁI (M7.7 bước 3b, #508) trong Chrome THẬT (`?skills=mock`, không cần máy chủ): đặt quái giả vào state với `fx` (mặt nạ bit
// `Monster.fx` của máy chủ, #559) rồi đo ĐIỂM ẢNH THẬT của canvas (snapshotArea) tại đúng chỗ mong đợi (trên đầu quái, mỗi chấm đúng màu của trạng thái):
//  - fx = 0: không chấm, không Graphics hiện; fx bật bit nào thì có đúng chấm đó (số chấm + tên) và đúng MÀU ở đúng VỊ TRÍ (cân giữa, cách đều, trên thanh máu);
//  - sáu bit cùng lúc: sáu màu khác nhau, đều thấy; tắt về 0 thì hết sạch điểm ảnh chấm; trùm có hàng chấm cao hơn quái thường (tránh đè tên trùm);
//  - bật / tắt 30 lần không tạo thêm Graphics (không rò); `fx` rác (NaN, chuỗi, bit lạ, âm) không chấm, không lỗi JS.
// Có thể chụp ảnh: `--shots <thư mục>`. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-monster-status.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
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
/** Bit -> [tên, màu 0xRRGGBB] (khớp `STATUS_BIT` và `PIP_STYLE`) */
const BITS = [
  [1, "Bỏng", [255, 138, 61]],
  [2, "Độc", [139, 224, 78]],
  [4, "Chảy máu", [255, 77, 94]],
  [8, "Tê cóng", [127, 220, 255]],
  [16, "Vỡ giáp", [255, 211, 77]],
  [32, "Choáng", [255, 255, 255]],
];
const PIP_STEP = 11;
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-monster-status-"));
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
  const J = async (js) => JSON.parse(await evalJs(`JSON.stringify(${js})`));
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
  await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&debug=1` });
  for (let k = 0; k < 50; k++) {
    await sleep(300);
    if (
      await evalJs(
        "Boolean(window.__scene && window.__scene.me && window.__scene.me() && window.__scene.state?.monsters)",
      )
    )
      break;
  }
  await sleep(1200);
  // Chế độ mock không chạy đối chiếu: đặt người chơi giữa trấn, camera nhìn vào đó và đứng yên
  await evalJs(`(() => { const sc = window.__scene, me = sc.me(), t = sc.map.townPx;
    me.x = t.x; me.y = t.y; sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0;
    sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(me.x, me.y); return 1; })()`);
  await sleep(600);

  /** Chạy `js` trong trang rồi chụp ở khung hình KẾ TIẾP vào window[name]; trả camera + vị trí gốc quái `id` đúng khung đó */
  const act = (js, name, id = "m1") =>
    evalJs(`new Promise((resolve) => {
      const sc = window.__scene, r = sc.game.canvas.getBoundingClientRect();
      ${js};
      sc.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data;
        const wv = sc.cameras.main.worldView, e = sc.monsters.get(${JSON.stringify(id)});
        resolve(JSON.stringify({ w: img.width, h: img.height, wvx: wv.x, wvy: wv.y, wvw: wv.width, wvh: wv.height,
          mx: e ? e.root.x : null, my: e ? e.root.y : null, pips: sc.monsterPips(${JSON.stringify(id)}) }));
      });
    })`).then((s) => JSON.parse(s));
  /** Số điểm ảnh gần màu `rgb` (sai số `tol` mỗi kênh) trong hình vuông tâm (cx, cy) cạnh 2 * rad */
  const near = (name, w, cx, cy, rad, rgb, tol) =>
    evalJs(`(() => { const D = window[${JSON.stringify(name)}]; let n = 0;
      for (let y = ${Math.max(0, Math.floor(cy - rad))}; y < ${Math.floor(cy + rad)}; y++) for (let x = ${Math.max(0, Math.floor(cx - rad))}; x < ${Math.floor(cx + rad)}; x++) {
        const i = (y * ${w} + x) * 4;
        if (Math.abs(D[i] - ${rgb[0]}) < ${tol} && Math.abs(D[i + 1] - ${rgb[1]}) < ${tol} && Math.abs(D[i + 2] - ${rgb[2]}) < ${tol}) n++;
      }
      return n; })()`);
  /** Màu điểm ảnh tại tâm (cx, cy) của ảnh chụp `name` (ánh sáng môi trường nhấc các kênh thấp lên ~20-35 nên so sánh theo màu GẦN NHẤT, không theo giá trị tuyệt đối) */
  const centreRgb = (name, w, cx, cy) =>
    J(
      `(() => { const D = window[${JSON.stringify(name)}], i = (Math.round(${cy}) * ${w} + Math.round(${cx})) * 4; return [D[i], D[i + 1], D[i + 2]]; })()`,
    );
  const l1 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const nearestBit = (rgb) =>
    BITS.map(([, n, c]) => [n, l1(rgb, c)]).sort((x, y) => x[1] - y[1])[0][0];
  const addMon = (id, kind, dx, dy) =>
    `sc.state.monsters.set(${JSON.stringify(id)}, { kind: ${JSON.stringify(kind)}, x: sc.predX + ${dx}, y: sc.predY + ${dy}, angle: 0, hp: 100, maxHp: 100, fx: 0 })`;
  const setFx = (id, v) => `sc.state.monsters.get(${JSON.stringify(id)}).fx = ${v}`;
  const px = (info, wx, wy) => ({
    x: ((wx - info.wvx) * info.w) / info.wvw,
    y: ((wy - info.wvy) * info.h) / info.wvh,
  });

  // Hôi Lang (bán kính 13) ở bên phải người chơi; trùm Xích Mãng (bán kính 24) ở bên trái
  await act(`${addMon("m1", "lang", 140, -40)}; ${addMon("boss", "mang", -160, -40)}`, "base0");
  await sleep(300);
  const info0 = await act("0", "base");
  check(
    info0.pips && info0.pips.n === 0 && !info0.pips.visible,
    `fx = 0: không chấm, không Graphics hiện (${JSON.stringify(info0.pips)})`,
  );
  const k = info0.w / info0.wvw;

  /** Kiểm đúng các bit trong `mask` hiện đúng màu ở đúng chỗ, các bit khác KHÔNG */
  const checkMask = async (id, mask, radius, boss, label) => {
    const info = await act(setFx(id, mask), `s${mask}${id}`, id);
    const want = BITS.filter(([b]) => mask & b);
    const text = want.map(([, n]) => n).join(", ");
    check(
      info.pips && info.pips.n === want.length && info.pips.text === text && info.pips.visible,
      `${label}: ${want.length} chấm "${info.pips?.text}" (mong "${text}")`,
    );
    const offs = want.map((_, i) => -((want.length - 1) * PIP_STEP) / 2 + i * PIP_STEP);
    const yOff = -radius - (boss ? 36 : 21);
    let allOk = true;
    const detail = [];
    for (let i = 0; i < want.length; i++) {
      const c = px(info, info.mx + offs[i], info.my + yOff);
      const rgb = await centreRgb(`s${mask}${id}`, info.w, c.x, c.y);
      const own = want[i];
      const nearestName = nearestBit(rgb);
      const lift = Math.max(...rgb.map((v, ch) => Math.abs(v - own[2][ch])));
      // đủ lớn: điểm ảnh gần màu của chấm (sai số 45 mỗi kênh) nhiều hơn ở ảnh nền
      const got = await near(`s${mask}${id}`, info.w, c.x, c.y, 3.5 * k, own[2], 45);
      const base = await near("base", info.w, c.x, c.y, 3.5 * k, own[2], 45);
      detail.push(
        `${own[1]}: tâm (${rgb.join(",")}) gần "${nearestName}", +${got - base} điểm ảnh`,
      );
      if (nearestName !== own[1] || lift > 45 || got - base < 6) allOk = false;
    }
    check(allOk, `${label}: tâm mỗi chấm đúng MÀU ở đúng CHỖ (${detail.join(" | ")})`);
    // các bit KHÔNG bật không có chấm ở vị trí của chúng nếu chúng được bật cùng mặt nạ đầy
    return info;
  };
  await checkMask("m1", 1 | 32, 13, false, "Hôi Lang bỏng + choáng");
  await checkMask("m1", 63, 13, false, "Hôi Lang đủ 6 trạng thái");
  if (SHOTS) {
    const info = await act("0", "shotA");
    const c = px(info, info.mx, info.my - 13);
    const png = await send("Page.captureScreenshot", {
      format: "png",
      clip: {
        x: Math.max(0, c.x - 90),
        y: Math.max(0, c.y - 60),
        width: 180,
        height: 110,
        scale: 4,
      },
    });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(
      path.join(SHOTS, "huy-hieu-quai-6.png"),
      Buffer.from(png.result.data, "base64"),
    );
  }
  // sáu màu khác nhau thật trên màn hình: màu ở tâm mỗi chấm gần màu CỦA CHÍNH NÓ hơn mọi màu khác (sáu tên khác nhau)
  const infoAll = await act("0", "all");
  const names = [];
  for (let i = 0; i < 6; i++) {
    const c = px(
      infoAll,
      infoAll.mx + (-((6 - 1) * PIP_STEP) / 2 + i * PIP_STEP),
      infoAll.my - 13 - 21,
    );
    names.push(nearestBit(await centreRgb("all", infoAll.w, c.x, c.y)));
  }
  check(
    JSON.stringify(names) === JSON.stringify(BITS.map(([, n]) => n)),
    `sáu chấm nhận ra đúng sáu màu khác nhau theo thứ tự bit: ${names.join(", ")}`,
  );

  // trùm: hàng chấm cao hơn (tránh đè tên trùm), vẫn đúng màu
  await checkMask("boss", 2, 24, true, "trùm Xích Mãng nhiễm độc");

  // tắt về 0: hết sạch
  const off = await act(setFx("m1", 0), "off");
  const infoOffBase = await act(setFx("m1", 0), "off2");
  const centre0 = px(off, off.mx, off.my - 13 - 21);
  let left = 0;
  for (const [, , rgb] of BITS)
    left +=
      (await near("off2", off.w, centre0.x, centre0.y, 8 * k, rgb, 28)) -
      (await near("base", off.w, centre0.x, centre0.y, 8 * k, rgb, 28));
  check(
    off.pips.n === 0 && !off.pips.visible && Math.abs(left) <= 6,
    `fx về 0: chấm biến mất (số chấm ${off.pips.n}, hiện ${off.pips.visible}, điểm ảnh còn thừa ${left})`,
  );
  void infoOffBase;

  // chỉ vẽ lại khi mặt nạ ĐỔI: giữ nguyên fx qua ~30 khung hình thì số lần vẽ không tăng
  await evalJs("window.__scene.state.monsters.get('m1').fx = 5; 0");
  await sleep(250);
  const d0 = (await J("window.__scene.monsterPips('m1')")).draws;
  await sleep(500);
  const d1 = (await J("window.__scene.monsterPips('m1')")).draws;
  check(
    d1 === d0 && d0 >= 1,
    `giữ nguyên fx qua ~30 khung hình: không vẽ lại (số lần vẽ ${d0} -> ${d1})`,
  );
  await evalJs("window.__scene.state.monsters.get('m1').fx = 0; 0");
  await sleep(150);

  // không rò: bật / tắt 30 lần, số Graphics con của quái giữ nguyên
  const g0 = await evalJs(
    "window.__scene.monsters.get('m1').root.list.filter((o) => o.type === 'Graphics').length",
  );
  await evalJs(
    `new Promise((res) => { const sc = window.__scene; let i = 0; const iv = setInterval(() => { sc.state.monsters.get('m1').fx = (i++ % 2) ? 0 : 1 + (i % 63); if (i >= 30) { clearInterval(iv); sc.state.monsters.get('m1').fx = 0; res(1); } }, 40); })`,
  );
  await sleep(200);
  const g1 = await evalJs(
    "window.__scene.monsters.get('m1').root.list.filter((o) => o.type === 'Graphics').length",
  );
  check(g0 === g1 && g1 <= 2, `bật / tắt 30 lần không tạo thêm Graphics (${g0} -> ${g1})`);

  // fx rác
  for (const bad of ["NaN", "'3'", "null", "undefined", "-1", "1.5", "Infinity", "64", "{}"]) {
    await evalJs(`window.__scene.state.monsters.get('m1').fx = ${bad}; 0`);
    await sleep(120);
    const p = await J("window.__scene.monsterPips('m1')");
    check(p.n === 0 && !p.visible, `fx rác (${bad}): không chấm`);
  }
  // 64 | 2: bit lạ lẫn bit thật => chỉ bit thật
  await evalJs("window.__scene.state.monsters.get('m1').fx = 64 | 2; 0");
  await sleep(120);
  const mixed = await J("window.__scene.monsterPips('m1')");
  check(
    mixed.n === 1 && mixed.text === "Độc",
    `bit lạ lẫn bit thật (64 | 2): chỉ giữ bit thật (${mixed.text})`,
  );
  // quái rời state: không lỗi
  await evalJs("window.__scene.state.monsters.delete('m1'); 0");
  await sleep(200);
  check(
    (await evalJs("window.__scene.monsterPips('m1')")) === null,
    "quái rời state: entity dọn, không lỗi",
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
