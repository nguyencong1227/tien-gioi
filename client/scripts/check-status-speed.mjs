/* global console, setTimeout, process */
// Kiểm đoán trước di chuyển theo trạng thái của chính mình (M7.2b, StatusEntry.ratio + moveSpeedMul dùng chung): giữ phím mũi tên THẬT qua CDP, đo
// quãng đường mỗi `input` ở client khi (a) không có gì, (b) tăng tốc +40 %, (c) tê cóng 50 %, (d) cả hai, (e) hết hạn, (f) choáng (không gửi `input`,
// đứng yên), rồi (g) `reconcile` chạy lại input chưa xác nhận với CÙNG hệ số (khớp vị trí đoán trước) và bỏ qua khi choáng, (h) đổi bản đồ xoá danh sách.
// Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn. Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-status-speed.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--slow-frame <ms>]
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
const near = (a, b, tol) => Math.abs(a - b) <= tol;
try {
  launched = await launchChrome({ name: "status-speed" });
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
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1')}catch(e){}${slowFrameSource(slowFrameMs())}`,
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Đánh dấu tài liệu CŨ rồi mới điều hướng: điều kiện sẵn sàng KHÔNG được đúng trên tài liệu cũ (chưa kịp đổi trang)
  await evalJs("window.__isOldPage = true");
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
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

  // Đếm `input` gửi đi (mock chỉ in log); mock không chạy đối chiếu nên tự đặt predX / predY về chỗ đứng của máy chủ trước mỗi pha
  await evalJs(`(() => {
    const sc = window.__scene; window.__inputs = 0; window.__xs = [];
    const orig = sc.room.send.bind(sc.room);
    // ghi cả predX LÚC GỬI mỗi input: hiệu hai lần gửi liền nhau = đúng một bước đoán trước (không phụ thuộc lúc nhả phím / số input đếm được)
    sc.room.send = (t, d) => { if (t === "input") { window.__inputs++; window.__xs.push(sc.predX); } return orig(t, d); };
    return 1; })()`);
  // Chỗ đứng mặc định của mock (512, 896) nằm trong ô chặn nên đi không nhúc nhích: đặt cả máy chủ giả lẫn đoán trước vào giữa trấn (thoáng)
  const spot = JSON.parse(await evalJs("JSON.stringify(window.__scene.map.townPx)"));
  const reset = () =>
    evalJs(`(() => { const sc = window.__scene, me = sc.me();
      me.x = ${spot.x}; me.y = ${spot.y};
      sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0; window.__inputs = 0; window.__xs = [];
      sc.cameras.main.centerOn(me.x, me.y); return 1; })()`);
  const pos = () =>
    evalJs("JSON.stringify({ x: window.__scene.predX, y: window.__scene.predY })").then(JSON.parse);
  const keyEv = (type) =>
    send("Input.dispatchKeyEvent", {
      type,
      code: "ArrowRight",
      key: "ArrowRight",
      windowsVirtualKeyCode: 39,
      nativeVirtualKeyCode: 39,
    });
  // Qua đúng đường tin nhắn: mock room phát tin "status" tới handler mà cảnh đã đăng ký (đột biến bỏ đăng ký handler sẽ đỏ)
  const setStatus = (list) =>
    evalJs(`window.__scene.room.emit("status", { list: ${JSON.stringify(list)} }); 1`);
  /** Giữ mũi tên phải: trả quãng đường (px) mỗi input và số input đã gửi.
   *  `minInputs` > 0: giữ cho tới khi ĐÃ GỬI đủ ngần ấy input (tối đa 20 s), KHÔNG theo thời gian cố định: số input trong một cửa sổ cố định tuỳ tốc độ khung
   *  (khung chậm ~45 ms gửi 4-7 input trong 700 ms thay vì 14-17) nên `n >= 8` sau `sleep(700)` đỏ ở runner chậm dù bước mỗi input vẫn đúng.
   *  `minInputs` = 0: giữ `ms` ms (ca choáng: mong đợi 0 input, chờ theo số không có nghĩa).
   *  `keep` (danh sách trạng thái, tuỳ chọn): áp dụng NGAY trước khi nhấn phím rồi LÀM MỚI mỗi ~150 ms suốt lượt giữ (máy chủ cũng làm mới trạng thái định kỳ).
   *  Trạng thái là đồng hồ THẬT của trang và bị kẹp theo `STATUSES.maxMs` (choáng 1,2 s, tê cóng 6 s, tăng tốc 8 s): khi máy tải (khung ~170 ms, mỗi lệnh CDP chờ một khung)
   *  từ lúc đặt tới input đầu tiên đã mất > 1,2 s và một lượt giữ kéo dài 2-6 s, nên không làm mới thì choáng hết hạn TRƯỚC khi nhấn phím (đo: 6-7 input lọt qua,
   *  `stunned = 0` suốt cửa sổ) và tê cóng / tăng tốc hết hạn giữa chừng (tỉ lệ ra 1,0 thay vì 0,7). Không `keep` = không làm mới (ca "đã hết hạn"). */
  const hold = async (ms = 700, minInputs = 0, keep = null) => {
    await reset();
    const a = await pos();
    let lastSet = Date.now();
    if (keep) await setStatus(keep);
    await keyEv("rawKeyDown");
    const refresh = async () => {
      if (keep && Date.now() - lastSet >= 150) {
        lastSet = Date.now();
        await setStatus(keep);
      }
    };
    if (minInputs > 0) {
      const enough = await waitUntilTrue(
        async () => {
          await refresh();
          return Number(await evalJs("window.__inputs")) >= minInputs;
        },
        20000,
        25,
      );
      if (!enough) throw new Error(`giữ phím 20 s mà chưa gửi đủ ${minInputs} input`);
    } else {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        await sleep(25);
        await refresh();
      }
    }
    await keyEv("keyUp");
    await sleep(120);
    const b = await pos();
    const n = await evalJs("window.__inputs");
    // Bước mỗi input = MEDIAN các hiệu predX giữa hai lần gửi liền nhau. KHÔNG dùng dx / n: mock không có máy chủ xác nhận nên cảnh ngừng đoán sau ~13-14 input chưa xác nhận
    // (xs dẹt ở đoạn cuối), n đếm cả các input đứng yên đó => dx / n lệch 1-2 % tuỳ số input gửi được trong 700 ms (máy tải thì n = 16 thay vì 17) và làm ca tỉ lệ 1,4 chập chờn.
    const xs = JSON.parse(await evalJs("JSON.stringify(window.__xs)"));
    const steps = xs
      .slice(1)
      .map((x, i) => x - xs[i])
      .sort((p, q) => p - q);
    const per = steps.length >= 3 ? steps[Math.floor(steps.length / 2)] : 0;
    return { n, dx: b.x - a.x, dy: b.y - a.y, per };
  };

  console.log("--- Đoán trước theo trạng thái (mock, phím thật) ---");
  const base = await hold(0, 10, []);
  console.log("  nền:", JSON.stringify(base));
  check(
    base.n >= 8 && base.per > 1,
    `không có trạng thái: đi được (${base.n} input, ${base.per.toFixed(3)} px/input)`,
  );

  const fast = await hold(0, 10, [["haste", 8000, 0.4]]);
  check(
    fast.n >= 8 && near(fast.per / base.per, 1.4, 0.01),
    `tăng tốc +40%: quãng đường mỗi input x${(fast.per / base.per).toFixed(4)} (mong đợi 1,4)`,
  );

  const slow = await hold(0, 10, [["chill", 8000, 0.5]]);
  check(
    slow.n >= 8 && near(slow.per / base.per, 0.5, 0.01),
    `tê cóng 50%: x${(slow.per / base.per).toFixed(4)} (mong đợi 0,5)`,
  );

  const both = await hold(0, 10, [
    ["haste", 8000, 0.4],
    ["chill", 8000, 0.5],
  ]);
  check(
    both.n >= 8 && near(both.per / base.per, 0.7, 0.01),
    `cả hai: (1 + 0,4) x (1 - 0,5) = x${(both.per / base.per).toFixed(4)} (mong đợi 0,7)`,
  );

  const clamped = await hold(0, 10, [["haste", 8000, 99]]);
  check(
    near(clamped.per / base.per, 1.6, 0.01),
    `cường độ rác 99 bị kẹp theo maxRatio 0,6: x${(clamped.per / base.per).toFixed(4)} (mong đợi 1,6)`,
  );

  await setStatus([["haste", 300, 0.4]]);
  await sleep(500);
  const expired = await hold(0, 10);
  check(
    near(expired.per / base.per, 1, 0.01),
    `tăng tốc 300 ms đã hết hạn: về x${(expired.per / base.per).toFixed(4)} (mong đợi 1)`,
  );

  const stun = await hold(700, 0, [["stun", 8000]]);
  check(
    stun.n === 0 && stun.dx === 0,
    `choáng: KHÔNG gửi input (${stun.n}) và đứng yên (dx ${stun.dx})`,
  );
  const moving = await evalJs("window.__scene.moving");
  check(moving === false, "choáng: cờ đang đi (hoạt ảnh) tắt");

  await setStatus([["stun", 300]]);
  await sleep(500);
  const afterStun = await hold(0, 10);
  check(
    afterStun.n >= 8 && near(afterStun.per / base.per, 1, 0.01),
    `hết choáng thì đi lại bình thường (${afterStun.n} input)`,
  );

  console.log("\n--- Đối chiếu (reconcile) chạy lại input chưa xác nhận ---");
  const r1 = await hold(0, 8, [["haste", 8000, 0.4]]);
  // MỘT lượt JS cho trước / sau đối chiếu: input muộn của lượt giữ phím (khung chậm) không chen được giữa hai lệnh CDP
  const rec = JSON.parse(
    await evalJs(`(() => { const sc = window.__scene, me = sc.me();
      const before = { x: sc.predX, y: sc.predY }, meNow = { x: me.x, y: me.y };
      sc.reconcile();
      return JSON.stringify({ before, meNow, after: { x: sc.predX, y: sc.predY } }); })()`),
  );
  const { before, meNow, after: afterRec } = rec;
  check(
    near(afterRec.x, before.x, 0.01) &&
      near(afterRec.y, before.y, 0.01) &&
      afterRec.x > meNow.x + 5,
    `tăng tốc: đối chiếu cho đúng vị trí đã đoán trước (${before.x.toFixed(2)} -> ${afterRec.x.toFixed(2)}; ${r1.n} input chưa xác nhận)`,
  );
  // đặt choáng + đối chiếu + đọc vị trí trong CÙNG lượt JS: choáng chỉ sống tối đa 1,2 s (`STUN_MAX_MS`), mỗi lệnh CDP ở khung chậm đã chiếm cả khung
  const stunRec = JSON.parse(
    await evalJs(`(() => { const sc = window.__scene;
      sc.room.emit("status", { list: [["stun", 8000]] });
      sc.reconcile();
      return JSON.stringify({ x: sc.predX, y: sc.predY }); })()`),
  );
  check(
    near(stunRec.x, meNow.x, 0.01),
    `đang choáng: đối chiếu KHÔNG chạy lại input chưa xác nhận (về ${stunRec.x.toFixed(2)} = máy chủ ${meNow.x.toFixed(2)})`,
  );

  console.log("\n--- Đổi bản đồ / nối lại xoá danh sách ---");
  await setStatus([
    ["haste", 8000, 0.4],
    ["stun", 8000],
  ]);
  check(
    (await evalJs("window.__scene.status.empty")) === false,
    "có danh sách trước khi đổi bản đồ",
  );
  await evalJs(
    `(() => { const sc = window.__scene; sc.changeMap(sc.room, window.__getMap("hac_phong")); return 1; })()`,
  );
  await sleep(300);
  check(
    (await evalJs("window.__scene.status.empty")) === true,
    "changeMap (qua cổng): danh sách trạng thái được xoá",
  );
  await setStatus([["haste", 8000, 0.4]]);
  await evalJs(`(() => { const sc = window.__scene; sc.attachRoom(sc.room); return 1; })()`);
  check(
    (await evalJs("window.__scene.status.empty")) === true,
    "attachRoom (nối lại): danh sách được xoá (server gửi lại danh sách đúng)",
  );

  console.log("\n--- Tin hỏng không làm văng ---");
  for (const bad of [
    "undefined",
    "null",
    "5",
    '"x"',
    "{}",
    "{ list: 5 }",
    '{ list: [null, "x", [1,2,3]] }',
  ]) {
    await evalJs(`window.__scene.room.emit("status", ${bad}); 1`);
  }
  check(
    (await evalJs("window.__scene.status.empty")) === true,
    "tin hỏng: danh sách rỗng, không ném lỗi",
  );
  check(pageErrors === 0, `0 lỗi console / exception (${pageErrors})`);
  ws.close();
} finally {
  if (launched) await launched.close();
}
if (failures > 0) {
  console.log(`\n✗ ${failures} kiểm tra ĐỎ`);
  process.exit(1);
}
console.log("\n🎉 KIỂM ĐOÁN TRƯỚC DI CHUYỂN THEO TRẠNG THÁI PASS 100%!");
