/* global console, process, Buffer */
// Kiểm bộ chọn "Khắc chân linh" ở màn Hoàng Tuyền (M7.2c, #503) trong Chrome THẬT (`?duel=mock&debug=1`, không cần máy chủ): khối '(sắp có)' đã bỏ và mục
// Khắc chân linh chỉ hiện MỘT lần ở Tam Sinh Thạch; danh sách theo `LimboMsg.engravable`, mặc định chọn sẵn chiêu đã khắc, không vượt `engraveSlotsOf`;
// tin `rebirth` chỉ kèm `engrave` khi người chơi ĐỔI tập chiêu (vắng = giữ nguyên, `[]` = xoá hết); mua thêm nấc giữ lựa chọn; ca chưa mở / chưa học;
// bàn phím (Enter trên ô tích); bấm đầu thai hai lần chỉ gửi một tin; không tràn ngang ở 360x640, mục bấm >= 44 px. Có thể chụp ảnh: `--shots <thư mục>`.
// Mặc định phục vụ `client/dist` bằng máy chủ tĩnh của script (chạy `npm run build -w client` trước; chế độ giả lập có ở bản dựng nhờ `?debug`); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-limbo-engrave.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots] [--slow-frame <ms>]
// Chờ THEO ĐIỀU KIỆN (nightly #1458, lô 14): không còn `sleep` cố định. Hộp xác nhận có cửa sổ chống click ma 450 ms (`ACT_CONFIRM_GUARD_MS`, tính theo
// `performance.now` THẬT của trang): `confirmYes` bấm "Đầu thai / Mở" LẶP LẠI tới khi hộp đóng (lần bấm sớm bị bỏ qua đúng thiết kế) thay vì `sleep(520)`;
// cửa sổ chờ máy chủ 3 giây (`REBIRTH_BUSY_MS`) chờ tới khi nút hết `aria-disabled` thay vì `sleep(3200)`.
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
  launched = await launchChrome({ name: "limbo-engrave", extraArgs: [] });
  const ws = new WebSocket(launched.page.webSocketDebuggerUrl);
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
  /** Chờ `n` khung hình của trang (rAF liên tiếp): ở khung chậm mỗi khung dài hơn nên chờ tự co giãn theo (thay `sleep` cố định sau thao tác). */
  const frames = (n) =>
    evalJs(
      `new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`,
    );
  const J = async (expression) => JSON.parse(await evalJs(`JSON.stringify(${expression})`));

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    // `--slow-frame <ms>` (hoặc `TG_SLOW_FRAME_MS`): giả lập runner khung chậm, xem `slow-frame.mjs`
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high')}catch(e){}${slowFrameSource(slowFrameMs())}`,
  });

  const open = async (w, h) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    // dấu trên tài liệu CŨ: `Page.navigate` trả về trước khi tài liệu mới được nạp, thăm dò sớm có thể thấy trang cũ (lần mở thứ hai cùng tab) và coi là sẵn sàng
    await evalJs("window.__navMark = 1; 1");
    await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
    const ready = await waitUntilTrue(
      () =>
        evalJs(
          "window.__navMark === undefined && typeof window.__debugLimbo === 'function' && Boolean(window.__ui)",
        ),
      45000,
      100,
    );
    // Báo RÕ thay vì chết ở `window.__debugLimbo is not a function` (nit của A, lượt 447): `--url` tới client của cây khác / bản cũ
    if (!ready)
      throw new Error(
        `Không có window.__debugLimbo / __ui sau 45 giây ở ${BASE_URL}: client ở địa chỉ này là bản cũ, hay không chạy ?duel=mock&debug=1? Bỏ --url để script phục vụ client/dist của cây này.`,
      );
    await frames(5);
  };
  /** Mở màn Hoàng Tuyền với dữ liệu tuỳ ý (null = bản mẫu: nấc khắc 1, đã khắc ung_trao, khắc được 3 chiêu); xoá nhật ký các tin đầu thai */
  const showLimbo = async (mock) => {
    await evalJs(
      `window.__rebirthChoices = []; window.__debugLimbo(${mock ? JSON.stringify(mock) : ""}); 1`,
    );
    await waitUntilTrue(
      () =>
        evalJs(
          "document.body.classList.contains('in-limbo') && !document.getElementById('limbo-overlay').hidden",
        ),
      15000,
      50,
    );
    await frames(3);
  };
  const state = () =>
    J(`(() => {
      const items = [...document.querySelectorAll('#limbo-engrave-list .engrave-item')].map((el) => {
        const cb = el.querySelector('input');
        return { id: cb.dataset.nav.slice(8), checked: cb.checked, disabled: cb.disabled, label: cb.getAttribute('aria-label'), h: el.getBoundingClientRect().height };
      });
      const stone = document.getElementById('limbo-stone-list');
      const names = [...stone.querySelectorAll('.stone-item-name')].map((n) => n.textContent);
      return { items, hint: document.getElementById('limbo-engrave-hint').textContent,
        emptyHidden: document.getElementById('limbo-engrave-empty').hidden, emptyText: document.getElementById('limbo-engrave-empty').textContent,
        khacNames: names.filter((n) => n.includes('Khắc chân linh')), sapCo: stone.textContent.includes('Sắp có'),
        open: !document.getElementById('limbo-overlay').hidden };
    })()`);
  const clickItem = (id) =>
    evalJs(
      `document.querySelector('#limbo-engrave-list [data-nav="engrave:${id}"]').closest('.engrave-item').click(); 1`,
    ).then(() => frames(3));
  /** Hộp xác nhận chung (issue #779): bấm Đầu thai / Mở chỉ MỞ hộp; chờ qua cửa sổ chống click ma (450 ms) rồi xác nhận bằng nút "Bán / Mở / Đầu thai" (pointerdown như chạm thật) */
  const confirmYes = async () => {
    await waitUntilTrue(() => evalJs("window.__ui.isActConfirmOpen()"), 15000, 50);
    // Bấm LẶP LẠI tới khi hộp đóng: lần bấm trong cửa sổ chống click ma (450 ms, `performance.now` thật) bị bỏ qua đúng thiết kế, không đổi trạng thái;
    // thay `sleep(520)` cố định (ở khung chậm cửa sổ vẫn là 450 ms THẬT nên chờ theo điều kiện chắc hơn đoán giờ)
    await waitUntilTrue(
      async () => {
        await evalJs(
          "document.getElementById('act-btn-yes').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 1",
        );
        return !(await evalJs("window.__ui.isActConfirmOpen()"));
      },
      15000,
      100,
    );
  };
  const rebirth = async () => {
    await evalJs("document.getElementById('limbo-btn-rebirth').click(); 1");
    await confirmYes();
    // tin `rebirth` đi đồng bộ khi xác nhận; chờ tới khi nhật ký có tin (`showLimbo` xoá nhật ký trước mỗi ca)
    await waitUntilTrue(() => evalJs("window.__rebirthChoices.length >= 1"), 10000, 50);
    return J("window.__rebirthChoices");
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    await evalJs(
      "document.getElementById('limbo-engrave-list').closest('.limbo-field').scrollIntoView({block:'center'}); 1",
    );
    await frames(3);
    const png = await send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(png.result.data, "base64"));
  };

  console.log("--- 1280x720: bản mẫu (nấc khắc 1, đã khắc ung_trao, khắc được 3 chiêu) ---");
  await open(1280, 720);
  await showLimbo(null);
  let st = await state();
  check(!st.sapCo, "khối '(sắp có)' đã bỏ");
  check(
    st.khacNames.length === 1 && st.khacNames[0].includes("Nấc 1/3"),
    `Tam Sinh Thạch có đúng MỘT mục Khắc chân linh: ${JSON.stringify(st.khacNames)}`,
  );
  check(
    st.items.length === 3 && !st.emptyHidden === false,
    `danh sách 3 chiêu khắc được (${st.items.map((i) => i.id).join(", ")})`,
  );
  check(
    st.items
      .filter((i) => i.checked)
      .map((i) => i.id)
      .join() === "ung_trao",
    "chọn sẵn đúng chiêu ĐÃ khắc (ung_trao)",
  );
  check(st.hint === "Tối đa 1 chiêu (đã chọn 1/1)", `gợi ý: "${st.hint}"`);
  const colors = await J(
    "Object.fromEntries([...document.querySelectorAll('#limbo-engrave-list .engrave-item')].map((el) => [el.querySelector('input').dataset.nav.slice(8), getComputedStyle(el.querySelector('.engrave-name')).color]))",
  );
  // Ưng Trảo hệ Kim (#e0c25a: đủ sáng, giữ nguyên); Hỏa Vân Kiếm hệ Hỏa (#e8573a gốc chỉ ~3,5:1: được sáng thêm); Mê Tung Bộ hệ Phong: mỗi hệ MỘT màu khác nhau
  check(
    colors.ung_trao === "rgb(224, 194, 90)" &&
      colors.hoa_van_kiem !== "rgb(232, 87, 58)" &&
      new Set(Object.values(colors)).size === 3,
    `tên chiêu tô màu theo hệ (Kim giữ nguyên, Hỏa sáng thêm, ba hệ ba màu): ${JSON.stringify(colors)}`,
  );
  check(
    st.items.filter((i) => !i.checked).every((i) => i.disabled),
    "hết chỗ (nấc 1): hai chiêu còn lại bị khoá, không chọn thêm được",
  );
  check(
    st.items.every((i) => /hệ/.test(i.label)),
    `aria-label nêu hệ: ${st.items[0].label}`,
  );
  await shot("khac-1280x720");

  console.log("--- tin `rebirth`: chỉ kèm engrave khi đổi tập chiêu ---");
  let rc = await rebirth();
  check(
    rc.length === 1 && !("engrave" in rc[0]),
    `chưa đụng bộ chọn: KHÔNG có engrave (${JSON.stringify(rc[0])})`,
  );
  await showLimbo(null);
  await clickItem("hoa_van_kiem"); // đang đầy nấc 1: không thêm được
  st = await state();
  check(
    st.items
      .filter((i) => i.checked)
      .map((i) => i.id)
      .join() === "ung_trao",
    "bấm chiêu khi hết chỗ: không đổi",
  );
  await clickItem("ung_trao"); // bỏ
  await clickItem("hoa_van_kiem"); // chọn
  st = await state();
  check(
    st.items
      .filter((i) => i.checked)
      .map((i) => i.id)
      .join() === "hoa_van_kiem" && st.hint === "Tối đa 1 chiêu (đã chọn 1/1)",
    "bỏ ung_trao, chọn hoa_van_kiem",
  );
  rc = await rebirth();
  check(
    rc.length === 1 && JSON.stringify(rc[0].engrave) === '["hoa_van_kiem"]',
    `đổi chiêu: engrave = ["hoa_van_kiem"] (${JSON.stringify(rc[0])})`,
  );

  await showLimbo(null);
  await clickItem("ung_trao");
  await clickItem("hoa_van_kiem");
  await clickItem("hoa_van_kiem");
  await clickItem("ung_trao"); // về đúng tập cũ
  rc = await rebirth();
  check(
    rc.length === 1 && !("engrave" in rc[0]),
    `đổi rồi trả về đúng tập cũ: KHÔNG có engrave (${JSON.stringify(rc[0])})`,
  );

  await showLimbo(null);
  await clickItem("ung_trao"); // bỏ hết
  st = await state();
  check(st.hint === "Tối đa 1 chiêu (đã chọn 0/1)", `bỏ hết: "${st.hint}"`);
  rc = await rebirth();
  check(
    rc.length === 1 && JSON.stringify(rc[0].engrave) === "[]",
    `bỏ hết: engrave = [] (xoá khắc) (${JSON.stringify(rc[0])})`,
  );

  console.log("--- mua thêm nấc giữ lựa chọn; bàn phím ---");
  // nấc khắc 2 giá 100 Duyên: bản mẫu chỉ có 28 nên dùng dữ liệu riêng đủ Duyên (mock `onBuy` trừ 10 và tăng nấc)
  await showLimbo({
    summary: { kiep: 1, realm: 1, tier: 4, minutes: 42, kills: 68, bossKills: 1, gain: 16 },
    soul: { kiep: 1, duyen: 500, unlocks: { khac: 1 }, origins: [], engraved: ["ung_trao"] },
    keepable: [],
    engravable: ["ung_trao", "hoa_van_kiem", "me_tung_bo"],
  });
  await clickItem("ung_trao");
  await clickItem("me_tung_bo"); // lựa chọn đã đụng: me_tung_bo
  await evalJs("document.querySelector('[data-nav=\"stone:khac\"]').click(); 1");
  await confirmYes(); // mở nấc bằng Duyên có hộp xác nhận
  await waitUntilTrue(
    () => evalJs("document.getElementById('limbo-engrave-hint').textContent.includes('Tối đa 2')"),
    15000,
    50,
  ); // máy chủ giả trừ Duyên + tăng nấc rồi vẽ lại; hết hạn thì kiểm bên dưới báo đúng chữ gợi ý hiện có
  await frames(3);
  st = await state();
  check(st.hint === "Tối đa 2 chiêu (đã chọn 1/2)", `sau khi mua nấc 2: "${st.hint}"`);
  check(
    st.items.find((i) => i.id === "me_tung_bo").checked &&
      st.items.filter((i) => !i.checked).every((i) => !i.disabled),
    "giữ lựa chọn me_tung_bo, còn chỗ cho chiêu thứ hai",
  );
  await evalJs(
    "document.querySelector('#limbo-engrave-list [data-nav=\"engrave:hoa_van_kiem\"]').focus(); 1",
  );
  await send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    code: "Enter",
    key: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    code: "Enter",
    key: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await waitUntilTrue(
    () =>
      evalJs("document.querySelectorAll('#limbo-engrave-list .engrave-item.checked').length >= 2"),
    10000,
    50,
  );
  await frames(3);
  st = await state();
  check(
    st.items
      .filter((i) => i.checked)
      .map((i) => i.id)
      .sort()
      .join() === "hoa_van_kiem,me_tung_bo",
    "Enter trên ô tích chọn được chiêu (bàn phím)",
  );
  const focused = await evalJs(
    "document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.nav : ''",
  );
  check(focused === "engrave:hoa_van_kiem", `giữ tiêu điểm sau khi vẽ lại (${focused})`);

  console.log("--- bấm đầu thai hai lần: một tin; bấm lại được sau khi hết chờ ---");
  await evalJs("window.__ui.showReborn = () => {}; 1"); // giữ màn Hoàng Tuyền mở như lúc chờ máy chủ
  await showLimbo(null);
  await evalJs(
    "document.getElementById('limbo-btn-rebirth').click(); document.getElementById('limbo-btn-rebirth').click(); 1",
  );
  await confirmYes();
  // Bấm thêm hai lần lúc ĐANG chờ máy chủ và đọc `aria-disabled` trong CÙNG MỘT lệnh: cửa sổ chờ chỉ 3 giây THẬT (`REBIRTH_BUSY_MS`), ở một lõi / khung chậm
  // vài chục khung hình có thể dài hơn thế nên đọc lại SAU khi chờ khung sẽ thấy nút đã hết khoá (lượt đầu của lô 14 đỏ đúng chỗ này)
  const ariaBusy = await evalJs(
    "(() => { const b = document.getElementById('limbo-btn-rebirth'); b.click(); b.click(); return b.getAttribute('aria-disabled'); })()",
  ); // đang chờ máy chủ (aria-disabled): bấm thêm KHÔNG mở hộp, KHÔNG gửi thêm
  await frames(15); // kiểm PHỦ ĐỊNH (không mở hộp, không tin thứ hai): cho đủ khung để hiệu ứng muộn (nếu có) kịp lộ ra; không phụ thuộc cửa sổ 3 giây
  check(
    (await evalJs("window.__ui.isActConfirmOpen()")) === false,
    "đã gửi: bấm thêm không mở hộp nữa",
  );
  check(
    (await J("window.__rebirthChoices")).length === 1,
    "hai lần bấm liền + bấm thêm lúc chờ: chỉ MỘT tin",
  );
  check(ariaBusy === "true", "nút aria-disabled trong lúc chờ");
  // hết cửa sổ chờ máy chủ (`REBIRTH_BUSY_MS` = 3000 ms THẬT): nút hết aria-disabled (thay `sleep(3200)`)
  await waitUntilTrue(
    () =>
      evalJs(
        "document.getElementById('limbo-btn-rebirth').getAttribute('aria-disabled') !== 'true'",
      ),
    20000,
    100,
  );
  await evalJs("document.getElementById('limbo-btn-rebirth').click(); 1");
  await confirmYes();
  await waitUntilTrue(() => evalJs("window.__rebirthChoices.length >= 2"), 10000, 50);
  check(
    (await J("window.__rebirthChoices")).length === 2,
    "sau 3 s (máy chủ từ chối thì còn ở Hoàng Tuyền) bấm lại được",
  );

  console.log("--- chưa mở khắc / chưa học chiêu nào ---");
  await showLimbo({
    summary: { kiep: 1, realm: 1, tier: 4, minutes: 42, kills: 68, bossKills: 1, gain: 16 },
    soul: { kiep: 1, duyen: 28, unlocks: {}, origins: [] },
    keepable: [],
    engravable: ["ung_trao"],
  });
  st = await state();
  check(
    st.items.length === 0 && !st.emptyHidden && st.emptyText.includes("Chưa mở"),
    `chưa mở nấc khắc: "${st.emptyText}"`,
  );
  check(st.hint === "Tối đa 0 chiêu (đã chọn 0/0)", `gợi ý: "${st.hint}"`);
  await showLimbo({
    summary: { kiep: 1, realm: 1, tier: 4, minutes: 42, kills: 68, bossKills: 1, gain: 16 },
    soul: { kiep: 1, duyen: 28, unlocks: { khac: 2 }, origins: [] },
    keepable: [],
  });
  st = await state();
  check(
    st.items.length === 0 && !st.emptyHidden && st.emptyText.includes("chưa học"),
    `đã mở nhưng không có chiêu (engravable vắng): "${st.emptyText}"`,
  );
  await showLimbo({
    summary: { kiep: 1, realm: 1, tier: 4, minutes: 42, kills: 68, bossKills: 1, gain: 16 },
    soul: {
      kiep: 1,
      duyen: 28,
      unlocks: { khac: 3 },
      origins: [],
      engraved: ["constructor", "ung_trao"],
    },
    keepable: [],
    engravable: ["constructor", "ung_trao", "__proto__"],
  });
  st = await state();
  check(
    st.items.length === 3 && st.items.every((i) => i.id.length > 0),
    "id lạ / độc trong danh sách không làm hỏng giao diện",
  );
  rc = await rebirth();
  check(!("engrave" in rc[0]), "dữ liệu lạ + chưa đụng: vẫn KHÔNG gửi engrave");

  console.log("--- tương phản chữ màu hệ >= 4,5:1 trên nền mục ĐÃ CHỌN, cả 12 chiêu (a11y) ---");
  const ALL12 = [
    "hoa_van_kiem",
    "bon_thach_quyen",
    "ung_trao",
    "trong_nhac_tram",
    "huyen_bang_chi",
    "kim_chung_trao",
    "bich_thuy_hoi_xuan",
    "phieu_phong_bo",
    "thanh_tung_phi_cham",
    "lac_tuyet_phan_phi",
    "cuu_cung_khon_sat",
    "me_tung_bo",
  ];
  await showLimbo({
    summary: { kiep: 1, realm: 1, tier: 4, minutes: 42, kills: 68, bossKills: 1, gain: 16 },
    soul: { kiep: 1, duyen: 500, unlocks: { khac: 3 }, origins: [], engraved: ["ung_trao"] },
    keepable: [],
    engravable: ALL12,
  });
  const lay = await J(`(() => {
    const px = (c) => c.match(/[\\d.]+/g).map(Number);
    const box = getComputedStyle(document.querySelector('.limbo-box')).backgroundColor;
    const checked = document.querySelector('#limbo-engrave-list .engrave-item.checked');
    return { box, itemBg: getComputedStyle(checked).backgroundColor,
      names: Object.fromEntries([...document.querySelectorAll('#limbo-engrave-list .engrave-item')].map((el) => [el.querySelector('input').dataset.nav.slice(8), getComputedStyle(el.querySelector('.engrave-name')).color])) };
  })()`);
  const nums = (c) => c.match(/[\d.]+/g).map(Number);
  const layerOver = (fg, bg) =>
    [0, 1, 2].map((i) => fg[i] * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
  const lum = (c) => {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  // nền thật: lớp mục đã chọn (trong suốt) trên hộp Hoàng Tuyền (gần đặc) trên nền tối: lấy đen làm nền dưới cùng (không làm tương phản đẹp hơn quá ~8 %)
  const bgReal = layerOver(nums(lay.itemBg), layerOver(nums(lay.box), [0, 0, 0]));
  const bad = Object.entries(lay.names)
    .filter(([, c]) => ratio(nums(c), bgReal) < 4.5)
    .map(([id, c]) => `${id} ${ratio(nums(c), bgReal).toFixed(2)}`);
  check(
    Object.keys(lay.names).length === 12 && bad.length === 0,
    `12 chiêu, mọi tên >= 4,5:1 trên nền đã chọn (nền ~ rgb(${bgReal.map(Math.round)})${bad.length ? "; dưới ngưỡng: " + bad.join(", ") : ""})`,
  );
  check(
    new Set(Object.values(lay.names)).size >= 6,
    `màu vẫn phân biệt theo hệ (${new Set(Object.values(lay.names)).size} màu khác nhau)`,
  );

  console.log("--- 360x640: không tràn ngang, mục bấm >= 44 px ---");
  await open(360, 640);
  await showLimbo(null);
  st = await state();
  const over = await J(
    "(() => { const b = document.querySelector('.limbo-box'); return { sw: b.scrollWidth, cw: b.clientWidth, ow: document.documentElement.scrollWidth, vw: innerWidth }; })()",
  );
  check(
    over.sw <= over.cw + 1 && over.ow <= over.vw + 1,
    `không tràn ngang (hộp ${over.sw}/${over.cw}, trang ${over.ow}/${over.vw})`,
  );
  check(
    st.items.every((i) => i.h >= 44),
    `mọi mục khắc cao >= 44 px (${st.items.map((i) => Math.round(i.h)).join(", ")})`,
  );
  await shot("khac-360x640");

  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  ws.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await launched?.close();
  if (server) await new Promise((r) => server.close(r));
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
process.exit(failures === 0 ? 0 : 1);
