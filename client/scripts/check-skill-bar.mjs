/* global console, process, Buffer */
// Kiểm thanh chiêu thức L U I O (M7.6, #507) bằng Chrome THẬT qua CDP ở chế độ giả lập `?skills=mock&debug=1` (KHÔNG cần máy chủ trò chơi): phím L U I O và chạm nút -> đúng số tin
// `cast`; ô hồi chiêu / thiếu linh lực / choáng / khoá / trống KHÔNG gửi; lớp trạng thái `k-*` đúng; vòng quét + số giây đếm lùi; hướng đánh theo con trỏ (chuột trong
// canvas) / theo hình chiêu; đổi số chiêu và cảnh giới (`?n=`, `?realm=`). Có thể chụp ảnh: `--shots <thư mục>`.
// Mặc định phục vụ `client/dist` bằng máy chủ tĩnh của script (chạy `npm run build -w client` trước; chế độ giả lập có ở bản dựng nhờ `?debug`); `--url` để dùng client đang chạy sẵn (vd Vite).
//   node client/scripts/check-skill-bar.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots] [--slow-frame <ms>]
// Chờ THEO ĐIỀU KIỆN (nightly #1458): hồi chiêu giả của ô 2 là 3 giây tính từ lúc trang khởi tạo, ở runner chậm đã hết trước khi kiểm chạy nên mỗi lần mở trang script PHÁT LẠI sổ chiêu
// (`window.__mockSkills.emit()`) để hồi chiêu bắt đầu lại từ lúc đó; các `sleep` gắn với hồi chiêu / choáng thành chờ đến khi lớp `k-*` đổi.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { launchChrome } from "./chrome-launch.mjs";
import { waitUntilTrue } from "./chrome-wait.mjs";
import { slowFrameMs, slowFrameSource } from "./slow-frame.mjs";

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");
const SHOTS = argOf("--shots", "");
const URL_ARG = argOf("--url", "");

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
/** Máy chủ tĩnh của `client/dist` (không dựng khi có `--url`) */
let server = null;
let BASE_URL = URL_ARG.replace(/\/$/, "");
if (!BASE_URL) {
  if (!fs.existsSync(path.join(DIST, "index.html")))
    throw new Error(
      "Chưa có client/dist: chạy `npm run build -w client` trước (hoặc truyền --url).",
    );
  server = http.createServer((req, res) => {
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
  const httpPort = await freePort();
  await new Promise((r) => server.listen(httpPort, "127.0.0.1", r));
  BASE_URL = `http://127.0.0.1:${httpPort}`;
}
let launched = null;
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
try {
  // Chrome không đầu không có chuột: `pointer: fine` = false thì thanh chiêu (CSS chỉ cho máy tính) bị ẩn; giả lập chuột (4 = fine, 2 = hover)
  launched = await launchChrome({
    name: "skill-bar",
    extraArgs: [
      "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
    ],
  });
  const page = launched.page;
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
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high')}catch(e){}${slowFrameSource(slowFrameMs())}`,
  });

  /** Chờ `n` khung hình của trang (rAF liên tiếp): ở khung chậm mỗi khung dài hơn nên chờ tự co giãn theo (thay `sleep` cố định sau thao tác). */
  const frames = (n) =>
    evalJs(
      `new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`,
    );
  /** Mô tả MỘT ô chiêu (hàm chạy trong trang): lớp `k-*`, aria, số giây đếm lùi, vòng quét... */
  const SLOT_FN = `(n) => { const e = document.getElementById('sk-slot' + n); return {
      cls: e.className, aria: e.getAttribute('aria-label'), dis: e.getAttribute('aria-disabled'),
      cdn: e.querySelector('.cdn').textContent, nm: e.querySelector('.nm').textContent,
      cd: e.querySelector('.cdv').style.getPropertyValue('--cd'), ico: e.querySelector('.ico').innerHTML.length,
      vis: getComputedStyle(document.getElementById('skill-slots')).display }; }`;
  const slot = (n) => evalJs(`JSON.stringify((${SLOT_FN})(${n}))`).then(JSON.parse);
  /** Bốn ô 2-5 trong MỘT lệnh CDP: ảnh chụp trạng thái cùng một lúc (hồi chiêu 3 giây của ô 2 không trôi giữa bốn lệnh ở khung chậm) */
  const slots4 = () => evalJs(`JSON.stringify([2, 3, 4, 5].map(${SLOT_FN}))`).then(JSON.parse);
  /** Chờ ô `n` thoả `pred(slot)` (tối đa `ms`, đồng hồ thật); trả ô cuối đo được */
  const waitSlot = async (n, pred, ms = 20000) => {
    let last = await slot(n);
    if (pred(last)) return last;
    await waitUntilTrue(
      async () => {
        last = await slot(n);
        return pred(last);
      },
      ms,
      100,
    );
    return last;
  };
  const isReady = (x) => x.cls === "sk slot k-ready";
  /** Chờ ô `n` sẵn sàng (hồi chiêu giả 3 giây, choáng 2,5 giây: chờ theo điều kiện, trần 20 s) */
  const waitReady = async (n) => isReady(await waitSlot(n, isReady));

  /** Mở trang mock (`query` = phần sau `?`), chờ cảnh có người chơi và đã nhận `skills` (mock gửi sau ~400 ms), đếm tin `cast`. */
  const open = async (query, w = 1280, h = 720) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evalJs("window.__isOldPage = true");
    await send("Page.navigate", { url: `${BASE_URL}/?${query}&debug=1` });
    // Có số chiêu (`n` > 0) thì chờ ô 2 mang tên chiêu (sổ chiêu của mock tới sau ~400 ms), thay `sleep(900)`
    const hasSkills = Number(/[?&]n=(\d+)/.exec(`?${query}`)?.[1] ?? "0") > 0;
    const ready = await waitUntilTrue(
      async () =>
        Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__scene && window.__scene.me && window.__scene.me() && window.__mockSkills && ${
              hasSkills
                ? `document.querySelector('#sk-slot2 .nm')?.textContent`
                : `document.getElementById('sk-slot2')`
            })`,
          ),
        ),
      60000,
      200,
    );
    if (!ready) throw new Error(`cảnh / sổ chiêu giả chưa sẵn sàng sau 60 s (${query})`);
    await evalJs(`(() => { const sc = window.__scene; window.__casts = [];
      const orig = sc.room.send.bind(sc.room);
      sc.room.send = (t, d) => { if (t === "cast") window.__casts.push(d); return orig(t, d); };
      sc.cameras.main.centerOn(sc.predX, sc.predY); return 1; })()`);
  };
  /**
   * Hồi chiêu giả của ô 2 là 3 giây tính từ lúc TRANG khởi tạo; ở runner chậm trang nạp xong thì đã hết (kiểm "ô 2 đang hồi chiêu" đỏ oan).
   * Phát lại sổ chiêu của mock (`__mockSkills.emit`: cùng `cd` ban đầu, khách hàng đặt lại mốc từ NGAY BÂY GIỜ) rồi chờ lớp `k-cooldown` hiện.
   */
  const rearmCooldown = async () => {
    await evalJs("window.__mockSkills.emit(); 1");
    const x = await waitSlot(2, (v) => v.cls.includes("k-cooldown") && v.cdn !== "", 10000);
    return x.cls.includes("k-cooldown");
  };
  const casts = () => evalJs("JSON.stringify(window.__casts)").then(JSON.parse);
  const clearCasts = () => evalJs("window.__casts.length = 0; 1");
  const toastText = () => evalJs("document.getElementById('toast').textContent");
  const KEYS = { 2: ["KeyL", 76], 3: ["KeyU", 85], 4: ["KeyI", 73], 5: ["KeyO", 79] };
  const press = async (n) => {
    const [code, vk] = KEYS[n];
    const base = {
      code,
      key: code.slice(3).toLowerCase(),
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
    };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await frames(3);
  };
  const clickEl = async (id) => {
    const r = JSON.parse(
      await evalJs(
        `(() => { const b = document.getElementById('${id}').getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); })()`,
      ),
    );
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: r.x,
      y: r.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
      pointerType: "mouse",
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: r.x,
      y: r.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
      pointerType: "mouse",
    });
    await frames(3);
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    const r = JSON.parse(
      await evalJs(
        `(() => { const a = document.getElementById('skills').getBoundingClientRect(), g = document.getElementById('skill-slots').getBoundingClientRect(); const x0 = Math.max(0, Math.min(a.x, g.x) - 20), y0 = Math.max(0, Math.min(a.y, g.y) - 20); return JSON.stringify({ x: x0, y: y0, w: Math.max(a.right, g.right) + 20 - x0, h: a.bottom + 20 - y0 }); })()`,
      ),
    );
    const png = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 2 },
    });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(png.result.data, "base64"));
  };

  // ---------------------------------------------------------------- 4 chiêu, Nguyên Anh
  console.log("--- 4 chiêu (?skills=mock&n=4): trạng thái ban đầu ---");
  await open("skills=mock&n=4");
  await rearmCooldown(); // hồi chiêu giả của ô 2 bắt đầu lại từ BÂY GIỜ (xem chú thích `rearmCooldown`)
  let s = await slots4();
  check(s[0].vis === "flex", `thanh hiện ở máy tính (display ${s[0].vis})`);
  check(
    s[0].cls.includes("k-cooldown") && s[0].cdn !== "",
    `ô 2 đang hồi chiêu (lớp ${s[0].cls}, số giây "${s[0].cdn}")`,
  );
  check(
    [1, 2, 3].every((i) => s[i].cls === "sk slot k-ready" && s[i].dis === "false"),
    `ô 3-5 sẵn sàng: ${[1, 2, 3].map((i) => s[i].cls).join(" | ")}`,
  );
  check(
    s[1].aria.includes("tầng") && s[1].aria.includes("sẵn sàng") && s[1].aria.includes("(Phím U)"),
    `aria ô 3: ${s[1].aria}`,
  );
  check(
    s.every((x) => x.ico > 50 && x.nm.length > 0),
    "mỗi ô có biểu tượng và tên viết tắt",
  );
  await shot("n4-ban-dau");

  console.log("--- phím L (ô đang hồi chiêu) KHÔNG gửi; phím U gửi đúng 1 cast ---");
  await rearmCooldown(); // chưa cast lần nào nên phát lại vẫn cho hồi chiêu 3 giây MỚI: ô 2 chắc chắn đang hồi khi bấm L
  await clearCasts();
  await press(2);
  check((await casts()).length === 0, "L khi hồi chiêu: 0 tin cast");
  await press(3);
  let c = await casts();
  check(
    c.length === 1 && c[0].slot === 3 && Number.isFinite(c[0].angle),
    `U: 1 cast ${JSON.stringify(c)}`,
  );
  s[1] = await waitSlot(3, (v) => v.cls.includes("k-cooldown") && v.cdn !== "", 10000);
  check(
    s[1].cls.includes("k-cooldown") && s[1].cdn !== "" && Number(s[1].cd) > 0.5,
    `sau cast ô 3 hồi chiêu (số ${s[1].cdn}, vòng quét ${s[1].cd})`,
  );
  await press(3);
  check((await casts()).length === 1, "U lần nữa trong lúc hồi chiêu: vẫn 1 tin");
  await shot("n4-hoi-chieu");

  console.log("--- vòng quét + số giây đếm lùi, hết hồi chiêu thì sẵn sàng lại ---");
  const s0 = await slot(2);
  const s1 = await waitSlot(2, isReady); // hồi chiêu giả 3 giây: chờ đến khi lớp k-ready hiện (trần 20 s)
  check(
    s1.cls === "sk slot k-ready" && s1.cdn === "",
    `ô 2 hết hồi chiêu (${s0.cdn}s -> ${s1.cls})`,
  );

  console.log("--- chạm / bấm chuột vào nút ---");
  await clearCasts();
  await clickEl("sk-slot4");
  c = await casts();
  check(c.length === 1 && c[0].slot === 4, `bấm ô 4: ${JSON.stringify(c)}`);

  console.log("--- hướng đánh theo con trỏ (chuột trong canvas) ---");
  await frames(6);
  const centre = JSON.parse(
    await evalJs(`(() => { const sc = window.__scene; const cam = sc.cameras.main; const cv = sc.game.canvas.getBoundingClientRect();
    const v = cam.worldView;
    const p = { x: (sc.predX - v.x) * cam.zoom, y: (sc.predY - v.y) * cam.zoom };
    const sx = cv.width / cam.width, sy = cv.height / cam.height;
    return JSON.stringify({ x: cv.x + p.x * sx, y: cv.y + p.y * sy }); })()`),
  );
  const aimAt = async (n, dx, dy) => {
    await waitReady(n);
    await clearCasts();
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: centre.x + dx,
      y: centre.y + dy,
      pointerType: "mouse",
    });
    await frames(3);
    await press(n);
    const cs = await casts();
    return cs[0]?.angle;
  };
  const aRight = await aimAt(5, 200, 0);
  check(
    aRight !== undefined && Math.abs(aRight) < 0.15,
    `con trỏ bên phải -> góc ~0 (được ${aRight})`,
  );
  const aDown = await aimAt(3, 0, 200);
  check(
    aDown !== undefined && Math.abs(aDown - Math.PI / 2) < 0.15,
    `con trỏ bên dưới -> góc ~pi/2 (được ${aDown})`,
  );
  // con trỏ rời canvas sang nút HUD (pointerleave): KHÔNG theo con trỏ nữa, quay về hướng nhìn (= lần đánh trước, pi/2)
  const bag = JSON.parse(
    await evalJs(
      `(() => { const b = document.getElementById('btn-bag').getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); })()`,
    ),
  );
  await waitReady(4);
  await clearCasts();
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: bag.x,
    y: bag.y,
    pointerType: "mouse",
  });
  await frames(3);
  await press(4);
  const aOut = (await casts())[0]?.angle;
  check(
    aOut !== undefined && Math.abs(aOut - Math.PI / 2) < 0.15,
    `con trỏ ở nút HUD (ngoài canvas) -> hướng nhìn pi/2, không theo con trỏ (được ${aOut})`,
  );

  // ---------------------------------------------------------------- choáng
  console.log("--- choáng: cả thanh xám, KHÔNG gửi ---");
  await open("skills=mock&n=4");
  await waitReady(2); // ô 2 hết hồi chiêu (chờ theo điều kiện, không `sleep(3300)`)
  // Choáng 6 giây (trước 2,5): đủ chỗ cho các kiểm trong lúc choáng ở khung chậm; hết choáng thì chờ theo lớp k-ready, không `sleep`
  await evalJs(`window.__scene.room.emit("status", { list: [["stun", 6000]] }); 1`);
  await waitUntilTrue(
    async () => (await slots4()).every((x) => x.cls === "sk slot k-stunned"),
    15000,
    100,
  );
  s = await slots4();
  check(
    s.every((x) => x.cls === "sk slot k-stunned"),
    `4 ô choáng: ${s.map((x) => x.cls).join(" | ")}`,
  );
  await clearCasts();
  await press(3);
  check((await casts()).length === 0, "U khi choáng: 0 tin cast");
  await shot("n4-choang");
  check(await waitReady(3), "hết choáng: sẵn sàng lại");

  // ---------------------------------------------------------------- thiếu linh lực
  console.log("--- thiếu linh lực: ô tối, KHÔNG gửi, báo 'Linh lực không đủ' ---");
  await evalJs("window.__scene.me().mp = 1; 1");
  const noMp = await waitSlot(3, (v) => v.cls === "sk slot k-noMp", 10000);
  check(noMp.cls === "sk slot k-noMp", `ô 3: ${noMp.cls}`);
  await clearCasts();
  await press(3);
  check((await casts()).length === 0, "U khi thiếu linh lực: 0 tin cast");
  check(String(await toastText()).includes("Linh lực không đủ"), `toast: ${await toastText()}`);
  await shot("n4-thieu-linh-luc");
  await evalJs("window.__scene.me().mp = 1200; 1");
  check(await waitReady(3), "đủ linh lực lại: sẵn sàng");

  // ---------------------------------------------------------------- 2 chiêu: ô 4, 5 khoá
  console.log("--- 2 chiêu, Trúc Cơ (?n=2): ô 4, 5 khoá ---");
  await open("skills=mock&n=2");
  await waitSlot(5, (v) => v.cls === "sk slot k-locked", 10000); // ô 4, 5 khoá (thay `sleep(3300)`)
  s = await slots4();
  check(
    s[2].cls === "sk slot k-locked" && s[3].cls === "sk slot k-locked",
    `ô 4, 5: ${s[2].cls} | ${s[3].cls}`,
  );
  check(
    s[2].aria.includes("mở ở kim đan") && s[3].aria.includes("mở ở nguyên anh"),
    `aria ô 4: ${s[2].aria}`,
  );
  check(s[2].dis === "true", "ô khoá aria-disabled");
  await clearCasts();
  await press(4);
  check(
    (await casts()).length === 0 && String(await toastText()).includes("chưa mở"),
    `I (ô khoá): 0 cast, toast "${await toastText()}"`,
  );
  await shot("n2-khoa");

  // ---------------------------------------------------------------- 0 chiêu: ô 2, 3 trống
  console.log("--- chưa có chiêu (?n=0): ô 2, 3 trống ---");
  await open("skills=mock&n=0");
  await waitSlot(3, (v) => v.cls === "sk slot k-empty", 10000);
  s = [await slot(2), await slot(3)];
  check(
    s.every((x) => x.cls === "sk slot k-empty"),
    `ô 2, 3: ${s.map((x) => x.cls).join(" | ")}`,
  );
  await clearCasts();
  await press(2);
  check(
    (await casts()).length === 0 && String(await toastText()).includes("còn trống"),
    `L (ô trống): 0 cast, toast "${await toastText()}"`,
  );
  await shot("n0-trong");

  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  ws.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  if (launched) await launched.close();
  if (server) server.close();
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
process.exit(failures === 0 ? 0 : 1);
