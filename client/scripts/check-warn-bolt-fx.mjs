import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm BÁO TRƯỚC ĐÒN (`warn`) và ĐẠN TẦM XA (`bolt`) của quái (M7.7, #508) trong Chrome THẬT (`?skills=mock`, không cần máy chủ): phát tin `fx` qua ĐÚNG đường tin
// nhắn của cảnh (mock room `emit`) rồi đo ĐIỂM ẢNH THẬT của canvas (snapshotArea) chứ không chỉ đọc trạng thái:
//  - vùng `circle` / `cone` / `line` hiện đúng KÍCH THƯỚC và đúng CHỖ (hộp bao của điểm ảnh đổi màu khớp r, góc mở, chiều dài, bề rộng theo zoom của camera);
//  - vùng tô đặc lớn dần theo thời gian (nhiều điểm ảnh đỏ hơn lúc gần đáp so với lúc mới báo), hết hạn thì biến mất và Graphics về pool;
//  - đạn bay ĐÚNG chỗ theo `speed` / `angle` (vị trí đo cùng khung hình với ảnh chụp) và có đúng màu hệ; hết tầm thì biến mất;
//  - trần theo bậc chất lượng (Thấp 4 vùng / 8 đạn, Cao 14 / 24): vượt trần thì tái dùng, không tạo thêm Graphics; tin hỏng bị bỏ, không lỗi JS.
// Có thể chụp ảnh: `--shots <thư mục>`. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-warn-bolt-fx.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
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
/** Trần theo bậc (khớp `telegraphLimits`): Thấp emitterBudget 4, Cao 24 */
const LIMITS = { low: { warns: 4, bolts: 8 }, high: { warns: 14, bolts: 24 } };
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-warn-bolt-fx-"));
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
  let scriptId = null;
  const open = async (quality) => {
    if (scriptId) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
    const r = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','${quality}');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
    });
    scriptId = String(r.result?.identifier ?? "");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=4&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__scene && window.__scene.me && window.__scene.me() && window.__scene.telegraphs)",
        )
      )
        break;
    }
    await sleep(1200);
    // Chế độ mock không chạy đối chiếu (predX / predY = 0): đặt người chơi vào giữa trấn thoáng, camera nhìn vào đó và đứng yên
    await evalJs(`(() => { const sc = window.__scene, me = sc.me(), t = sc.map.townPx;
      me.x = t.x; me.y = t.y; sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0;
      sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(me.x, me.y); return 1; })()`);
    await sleep(700);
  };
  const J = async (js) => JSON.parse(await evalJs(`JSON.stringify(${js})`));
  /**
   * Tìm chỗ YÊN TĨNH để đo hộp bao: trong trấn có NPC cử động, ngoài trấn có nước / vòng an toàn nhấp nháy, nên chụp hai ảnh cách nhau 1 s ở từng ứng viên và lấy chỗ
   * gần như không đổi (<= 40 điểm ảnh lệch) trong vùng sẽ đặt hình. Đặt người chơi + camera ở đó, trả độ lệch so với giữa trấn.
   */
  const calmSpot = async () => {
    const offsets = [
      [0, 0],
      [700, 0],
      [-700, 0],
      [0, -650],
      [0, 650],
      [700, -650],
      [-700, -650],
      [700, 650],
      [-700, 650],
      [1100, 0],
      [-1100, 0],
    ];
    for (const [ox, oy] of offsets) {
      const ok = await evalJs(`(() => { const sc = window.__scene, me = sc.me(), t = sc.map.townPx;
        const x = t.x + ${ox}, y = t.y + ${oy};
        if (x < 420 || y < 320 || x > sc.map.worldW - 420 || y > sc.map.worldH - 320) return false;
        me.x = x; me.y = y; sc.predX = x; sc.predY = y; sc.cameras.main.centerOn(x, y); return true; })()`);
      if (!ok) continue;
      await sleep(600);
      await act("", "calmA");
      await sleep(1000);
      const info = await act("", "calmB");
      const n =
        await evalJs(`(() => { const A = window.calmA, B = window.calmB, W = ${info.w}; let n = 0;
        for (let y = ${Math.floor(info.h / 2 - 270)}; y < ${Math.floor(info.h / 2 + 210)}; y++) for (let x = ${Math.floor(info.w / 2 - 330)}; x < ${Math.floor(info.w / 2 + 330)}; x++) {
          const i = (y * W + x) * 4;
          if (Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) > 30) n++;
        }
        return n; })()`);
      if (n <= 40) return { ox, oy, n };
    }
    return null;
  };
  const clear = () => evalJs("window.__scene.telegraphs.clear(); 0");
  const stats = () => J("window.__scene.telegraphs.stats()");
  /** Chạy `js` TRONG trang rồi chụp ở khung hình KẾ TIẾP (điểm ảnh thật) vào window[name]; trả hộp thông tin camera + đạn đúng khung hình đó. */
  const act = (js, name) =>
    evalJs(`new Promise((resolve) => {
      const sc = window.__scene, r = sc.game.canvas.getBoundingClientRect();
      ${js};
      sc.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data;
        const wv = sc.cameras.main.worldView;
        resolve(JSON.stringify({ w: img.width, h: img.height, wvx: wv.x, wvy: wv.y, wvw: wv.width, wvh: wv.height,
          bolts: sc.telegraphs.snapshot(sc.time.now).bolts, warns: sc.telegraphs.snapshot(sc.time.now).warns }));
      });
    })`).then((s) => JSON.parse(s));
  /** Hộp bao + số điểm ảnh "đỏ lên" so với ảnh nền `pre` (điểm ảnh có r - g tăng > 45 và r > 150 (vòng an toàn của trấn nhấp nháy nhẹ nên ngưỡng phải cao hơn nhiễu đó)), trong vùng [x0, x1] x [y0, y1]. */
  const redGrowth = (pre, post, box) =>
    evalJs(`(() => { const A = window[${JSON.stringify(pre)}], B = window[${JSON.stringify(post)}];
      const W = ${box.w}; let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = ${Math.max(0, Math.floor(box.y0))}; y < ${Math.floor(box.y1)}; y++) for (let x = ${Math.max(0, Math.floor(box.x0))}; x < ${Math.floor(box.x1)}; x++) {
        const i = (y * W + x) * 4;
        if (B[i] > 150 && (B[i] - B[i + 1]) - (A[i] - A[i + 1]) > 45) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      return JSON.stringify({ n, x0, y0, x1, y1 }); })()`).then((s) => JSON.parse(s));
  /** Số điểm ảnh gần màu (r, g, b) trong hình vuông tâm (cx, cy) cạnh 2 * rad */
  const nearColor = (name, w, cx, cy, rad, rgb, tol) =>
    evalJs(`(() => { const D = window[${JSON.stringify(name)}]; let n = 0;
      for (let y = ${Math.max(0, Math.floor(cy - rad))}; y < ${Math.floor(cy + rad)}; y++) for (let x = ${Math.max(0, Math.floor(cx - rad))}; x < ${Math.floor(cx + rad)}; x++) {
        const i = (y * ${w} + x) * 4;
        if (Math.abs(D[i] - ${rgb[0]}) < ${tol} && Math.abs(D[i + 1] - ${rgb[1]}) < ${tol} && Math.abs(D[i + 2] - ${rgb[2]}) < ${tol}) n++;
      }
      return n; })()`);
  const emit = (msg) => `sc.room.emit("fx", ${JSON.stringify(msg)})`;
  /** Chờ đồng hồ CẢNH (không phải đồng hồ tường: máy bận thì chậm) tới `ms` kể từ mốc `t0` */
  const waitScene = async (t0, ms, limit = 15000) => {
    const tEnd = Date.now() + limit;
    while (Date.now() < tEnd) {
      if ((await evalJs("window.__scene.time.now")) - t0 >= ms) return true;
      await sleep(30);
    }
    return false;
  };
  /** Đổi toạ độ thế giới -> điểm ảnh ảnh chụp */
  const toPx = (info, wx, wy) => ({
    x: ((wx - info.wvx) * info.w) / info.wvw,
    y: ((wy - info.wvy) * info.h) / info.wvh,
  });

  for (const q of ["high", "low"]) {
    console.log(`\n--- bậc ${q === "high" ? "Cao" : "Thấp"} ---`);
    await open(q);
    const tier = await evalJs("document.documentElement.dataset.quality");
    check(tier === q, `đã ghim bậc chất lượng ${q} (data-quality=${tier})`);
    await clear();
    check(
      (await stats()).warns === 0 && (await stats()).bolts === 0,
      "ban đầu không vùng báo, không đạn",
    );
    const ratio = await evalJs(
      "(() => { const sc = window.__scene, r = sc.game.canvas.getBoundingClientRect(); return sc.game.canvas.width / Math.round(r.width); })()",
    );
    check(Math.abs(ratio - 1) < 0.01, `canvas 1 điểm ảnh = 1 CSS px (tỉ lệ ${ratio})`);

    // ---- Hình học trên điểm ảnh thật, ở một chỗ yên tĩnh (không NPC / nước cử động) để hộp bao chỉ do vùng báo tạo ra ----
    const calm = await calmSpot();
    check(
      !!calm,
      `tìm được chỗ yên tĩnh để đo (lệch (${calm?.ox}, ${calm?.oy}) so với giữa trấn, ${calm?.n} điểm ảnh lệch)`,
    );
    if (!calm) continue;
    const cx = await evalJs("window.__scene.predX");
    const cy = await evalJs("window.__scene.predY");
    const cases = [
      // [tên, tin, hộp bao mong đợi (tương đối so với (x, y) của tin): [x0, y0, x1, y1]]
      [
        "circle r=90",
        { kind: "warn", shape: "circle", x: cx + 200, y: cy, r: 90, ms: 1600 },
        [-90, -90, 90, 90],
      ],
      [
        "cone r=200 arc=1.2 angle=0",
        { kind: "warn", shape: "cone", x: cx - 260, y: cy, r: 200, angle: 0, arc: 1.2, ms: 1600 },
        [0, -200 * Math.sin(0.6), 200, 200 * Math.sin(0.6)],
      ],
      [
        "line r=300 w=40 angle=0",
        {
          kind: "warn",
          shape: "line",
          x: cx - 150,
          y: cy - 220,
          r: 300,
          w: 40,
          angle: 0,
          ms: 1600,
        },
        [0, -20, 300, 20],
      ],
    ];
    for (const [name, msg, want] of cases) {
      await clear();
      await act("window.__scene.telegraphs.clear()", "before"); // ảnh nền ngay trước ca (nền có thể trôi chậm)
      const s0 = await evalJs("window.__scene.time.now");
      await evalJs(`(() => { const sc = window.__scene; ${emit(msg)}; return 1; })()`);
      check((await stats()).warns === 1, `${name}: máy chủ giả phát tin => 1 vùng báo sống`);
      // chờ gần lúc đáp (tiến độ ~ 0,9) để vùng tô đặc đã lớn gần hết, rồi chụp ở khung kế tiếp
      await waitScene(s0, 1450);
      const info = await act("", "post");
      const snap = info.warns[0];
      const p = toPx(info, msg.x, msg.y);
      // hộp mong đợi theo ĐIỂM ẢNH: kích thước thế giới nhân zoom của camera (canvas / vùng nhìn)
      const k = info.w / info.wvw;
      const wantPx = want.map((v) => v * k);
      const box = {
        w: info.w,
        x0: p.x + wantPx[0] - 14,
        y0: p.y + wantPx[1] - 14,
        x1: p.x + wantPx[2] + 14,
        y1: p.y + wantPx[3] + 14,
      };
      const g2 = await redGrowth("before", "post", box);
      const tol = 7;
      const okBox =
        g2.n > 0 &&
        Math.abs(g2.x0 - (p.x + wantPx[0])) <= tol &&
        Math.abs(g2.y0 - (p.y + wantPx[1])) <= tol &&
        Math.abs(g2.x1 - (p.x + wantPx[2])) <= tol &&
        Math.abs(g2.y1 - (p.y + wantPx[3])) <= tol;
      check(
        okBox,
        `${name}: hộp bao điểm ảnh đỏ lên [${g2.x0},${g2.y0} .. ${g2.x1},${g2.y1}] khớp mong đợi [${(p.x + wantPx[0]).toFixed(0)},${(p.y + wantPx[1]).toFixed(0)} .. ${(p.x + wantPx[2]).toFixed(0)},${(p.y + wantPx[3]).toFixed(0)}] (±${tol} px, zoom ${k.toFixed(3)}, tiến độ ${snap ? snap.progress.toFixed(2) : "?"})`,
      );
      check(
        snap && snap.progress > 0.8 && g2.n > 400,
        `${name}: ${g2.n} điểm ảnh đỏ lên khi gần đáp (vùng tô đặc đã lớn)`,
      );
      // kiểm vùng tô đặc LỚN DẦN: ảnh lúc mới báo ít điểm đỏ hơn lúc gần đáp
      await clear();
      await act(emit(msg), "early");
      const gEarly = await redGrowth("before", "early", box);
      check(
        gEarly.n < g2.n,
        `${name}: lúc mới báo ${gEarly.n} điểm đỏ < ${g2.n} lúc gần đáp (vùng tô đặc lớn dần)`,
      );
      // hết hạn: biến mất, Graphics về pool
      const s1 = await evalJs("window.__scene.time.now");
      await waitScene(s1, 1600 + 160 + 150);
      await evalJs("window.__scene.telegraphs.update(window.__scene.time.now); 0");
      const st = await stats();
      check(st.warns === 0, `${name}: hết ms + mờ thì biến mất (còn ${st.warns})`);
    }

    // ---- Đạn: đúng chỗ theo speed / angle, đúng màu hệ, hết tầm thì biến mất ----
    await clear();
    const bx = cx - 380;
    const by = cy + 120;
    const bolt = { kind: "bolt", x: bx, y: by, angle: 0, speed: 260, range: 640, element: "thuy" };
    await act("window.__scene.telegraphs.clear()", "boltbase");
    const info = await act(emit(bolt), "bolt1");
    const b = info.bolts[0];
    check(info.bolts.length === 1 && !!b, "tin bolt => 1 đạn sống");
    // vị trí đo CÙNG khung hình với ảnh chụp: g.x của lần update trước khi vẽ; so với công thức theo đồng hồ cảnh
    check(
      b && Math.abs(b.y - by) < 0.5 && b.x >= bx - 0.5 && b.x <= bx + 640 + 0.5,
      `đạn nằm trên đường bắn (x ${b?.x?.toFixed(1)}, y ${b?.y?.toFixed(1)}; đường y = ${by})`,
    );
    // theo dõi 6 mẫu: đạn tiến đều theo speed (độ chênh vị trí / độ chênh thời gian ~ 260 px/s)
    const samples = [];
    for (let k = 0; k < 6; k++) {
      await sleep(120);
      const s = await J(`(() => { const sc = window.__scene; sc.telegraphs.update(sc.time.now);
        const b = sc.telegraphs.snapshot(sc.time.now).bolts[0]; return b ? { t: sc.time.now, x: b.x, y: b.y } : null; })()`);
      if (s) samples.push(s);
    }
    check(samples.length >= 4, `lấy được ${samples.length} mẫu vị trí đạn`);
    let okSpeed = true;
    let note = "";
    for (let i = 1; i < samples.length; i++) {
      const dt = (samples[i].t - samples[i - 1].t) / 1000;
      const v = (samples[i].x - samples[i - 1].x) / dt;
      if (!(Math.abs(v - 260) < 6)) {
        okSpeed = false;
        note += ` ${v.toFixed(0)}`;
      }
    }
    check(okSpeed, `tốc độ đạn đo từ các mẫu ~ 260 px/s${okSpeed ? "" : " (lệch:" + note + ")"}`);
    // màu hệ thủy #4a90e2 (74, 144, 226): lõi đạn đứng đúng chỗ trong ảnh chụp
    await clear();
    const info2 = await act(emit({ ...bolt, speed: 120 }), "bolt2");
    const b2 = info2.bolts[0];
    const bp = toPx(info2, b2.x, b2.y);
    const blue = await nearColor("bolt2", info2.w, bp.x, bp.y, 10, [74, 144, 226], 40);
    const blueBase = await nearColor("boltbase", info2.w, bp.x, bp.y, 10, [74, 144, 226], 40);
    check(
      blue - blueBase >= 12,
      `lõi đạn (hệ thuỷ, xanh) hiện tại đúng chỗ: +${blue - blueBase} điểm ảnh gần màu #4a90e2`,
    );
    // đạn không hệ => đỏ cam trung tính; đạn hệ hoả => #e8573a
    await clear();
    const info3 = await act(emit({ ...bolt, element: undefined, speed: 120 }), "bolt3");
    const b3 = info3.bolts[0];
    const bp3 = toPx(info3, b3.x, b3.y);
    const orange = await nearColor("bolt3", info3.w, bp3.x, bp3.y, 10, [255, 96, 80], 30);
    const orangeBase = await nearColor("boltbase", info3.w, bp3.x, bp3.y, 10, [255, 96, 80], 30);
    check(
      orange - orangeBase >= 12,
      `đạn không hệ: lõi đỏ cam trung tính (+${orange - orangeBase} điểm ảnh)`,
    );
    // hết tầm thì biến mất
    await clear();
    await evalJs(
      `(() => { const sc = window.__scene; ${emit({ ...bolt, speed: 800, range: 400 })}; return 1; })()`,
    );
    const f0 = await evalJs("window.__scene.time.now");
    await waitScene(f0, 500 + 90 + 150);
    await evalJs("window.__scene.telegraphs.update(window.__scene.time.now); 0");
    check((await stats()).bolts === 0, "bay hết tầm (400 px / 800 px/s) rồi mờ thì biến mất");

    // ---- Trần theo bậc, tái dùng, không rò, tin hỏng ----
    await clear();
    const lim = LIMITS[q];
    const before = await stats();
    await evalJs(`(() => { const sc = window.__scene;
      for (let i = 0; i < 40; i++) sc.room.emit("fx", { kind: "warn", shape: "circle", x: sc.predX + i * 3, y: sc.predY, r: 50, ms: 2500 });
      for (let i = 0; i < 80; i++) sc.room.emit("fx", { kind: "bolt", x: sc.predX, y: sc.predY + i, angle: 0, speed: 50, range: 900 });
      return 1; })()`);
    const full = await stats();
    check(
      full.warns === lim.warns && full.bolts === lim.bolts,
      `trần bậc ${q}: ${full.warns} vùng báo (<= ${lim.warns}), ${full.bolts} đạn (<= ${lim.bolts}) sau 40 + 80 tin`,
    );
    check(
      full.recycledWarns - before.recycledWarns === 40 - lim.warns &&
        full.recycledBolts - before.recycledBolts === 80 - lim.bolts,
      `vượt trần thì tái dùng, không bỏ tin: ${full.recycledWarns - before.recycledWarns} / ${full.recycledBolts - before.recycledBolts} lần`,
    );
    const g0 = full.graphics;
    await clear();
    await evalJs(`(() => { const sc = window.__scene;
      for (let i = 0; i < 40; i++) sc.room.emit("fx", { kind: "warn", shape: "cone", x: sc.predX, y: sc.predY, r: 80, ms: 400 });
      return 1; })()`);
    check(
      (await stats()).graphics === g0,
      `phát lại sau khi dọn dùng lại pool (Graphics ${g0} -> ${(await stats()).graphics})`,
    );
    await clear();
    const rej0 = (await stats()).rejected;
    await evalJs(`(() => { const sc = window.__scene;
      for (const m of [
        { kind: "warn", shape: "circle", x: NaN, y: 0, r: 10, ms: 100 },
        { kind: "warn", shape: "triangle", x: 0, y: 0, r: 10, ms: 100 },
        { kind: "warn", shape: "circle", x: 0, y: 0, r: -4, ms: 100 },
        { kind: "warn", shape: "constructor", x: 0, y: 0, r: 10, ms: 100 },
        { kind: "bolt", x: 0, y: 0, angle: 0, speed: 0, range: 100 },
        { kind: "bolt", x: 0, y: 0, angle: NaN, speed: 100, range: 100 },
        { kind: "bolt", x: 0, y: 0, angle: 0, speed: 100, range: Infinity },
      ]) sc.room.emit("fx", m);
      return 1; })()`);
    const bad = await stats();
    check(
      bad.warns === 0 && bad.bolts === 0 && bad.rejected - rej0 === 7,
      `7 tin hỏng: không vẽ gì, đếm bỏ ${bad.rejected - rej0}/7`,
    );

    if (q === "high" && SHOTS) {
      await clear();
      await evalJs(`(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY);
        const x = sc.predX, y = sc.predY;
        sc.room.emit("fx", { kind: "warn", shape: "cone", x: x - 250, y: y + 10, r: 180, angle: 0, arc: 1.2, ms: 3000 });
        sc.room.emit("fx", { kind: "warn", shape: "circle", x: x + 150, y: y - 40, r: 90, ms: 3000 });
        sc.room.emit("fx", { kind: "warn", shape: "line", x: x - 60, y: y + 130, r: 280, w: 36, angle: -0.25, ms: 3000 });
        sc.room.emit("fx", { kind: "bolt", x: x - 300, y: y - 120, angle: 0.1, speed: 90, range: 700, element: "thuy" });
        sc.room.emit("fx", { kind: "bolt", x: x - 300, y: y - 90, angle: 0.1, speed: 90, range: 700, element: "hoa" });
        sc.room.emit("fx", { kind: "bolt", x: x - 300, y: y - 60, angle: 0.1, speed: 90, range: 700 });
        return 1; })()`);
      await sleep(2200);
      const png = await send("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, "fx-bao-truoc-dan.png"),
        Buffer.from(png.result.data, "base64"),
      );
      await clear();
    }
  }
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
