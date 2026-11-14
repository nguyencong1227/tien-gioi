import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm bộ chọn "Khắc chân linh" ở màn Hoàng Tuyền (M7.2c, #503) trong Chrome THẬT (`?duel=mock&debug=1`, không cần máy chủ): khối '(sắp có)' đã bỏ và mục
// Khắc chân linh chỉ hiện MỘT lần ở Tam Sinh Thạch; danh sách theo `LimboMsg.engravable`, mặc định chọn sẵn chiêu đã khắc, không vượt `engraveSlotsOf`;
// tin `rebirth` chỉ kèm `engrave` khi người chơi ĐỔI tập chiêu (vắng = giữ nguyên, `[]` = xoá hết); mua thêm nấc giữ lựa chọn; ca chưa mở / chưa học;
// bàn phím (Enter trên ô tích); bấm đầu thai hai lần chỉ gửi một tin; không tràn ngang ở 360x640, mục bấm >= 44 px. Có thể chụp ảnh: `--shots <thư mục>`.
// Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-limbo-engrave.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
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
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-limbo-engrave-"));
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
  const J = async (expression) => JSON.parse(await evalJs(`JSON.stringify(${expression})`));

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high')}catch(e){}",
  });

  const open = async (w, h) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (await evalJs("typeof window.__debugLimbo === 'function' && Boolean(window.__ui)")) break;
    }
    await sleep(500);
  };
  /** Mở màn Hoàng Tuyền với dữ liệu tuỳ ý (null = bản mẫu: nấc khắc 1, đã khắc ung_trao, khắc được 3 chiêu); xoá nhật ký các tin đầu thai */
  const showLimbo = async (mock) => {
    await evalJs(
      `window.__rebirthChoices = []; window.__debugLimbo(${mock ? JSON.stringify(mock) : ""}); 1`,
    );
    await sleep(250);
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
    ).then(() => sleep(120));
  const rebirth = async () => {
    await evalJs("document.getElementById('limbo-btn-rebirth').click(); 1");
    await sleep(150);
    return J("window.__rebirthChoices");
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    await evalJs(
      "document.getElementById('limbo-engrave-list').closest('.limbo-field').scrollIntoView({block:'center'}); 1",
    );
    await sleep(200);
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
  // Ưng Trảo hệ Kim (#e0c25a), Hỏa Vân Kiếm hệ Hỏa (#e8573a): tên chiêu tô màu theo hệ, mỗi hệ một màu
  check(
    colors.ung_trao === "rgb(224, 194, 90)" && colors.hoa_van_kiem === "rgb(232, 87, 58)",
    `tên chiêu tô màu hệ: ${JSON.stringify(colors)}`,
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
  await sleep(300);
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
  await sleep(200);
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
  await sleep(150);
  check((await J("window.__rebirthChoices")).length === 1, "hai lần bấm liền: chỉ MỘT tin");
  const aria = await evalJs(
    "document.getElementById('limbo-btn-rebirth').getAttribute('aria-disabled')",
  );
  check(aria === "true", "nút aria-disabled trong lúc chờ");
  await sleep(3200);
  await evalJs("document.getElementById('limbo-btn-rebirth').click(); 1");
  await sleep(150);
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
