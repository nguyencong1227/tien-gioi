import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, process, Buffer */
// Kiểm bảng CÔNG PHÁP (M7.6, #507, docs/THIET_KE_THANH_CHIEU.md mục 4) trong Chrome THẬT qua CDP, chế độ `?skills=mock&n=2` (Trúc Cơ: ô 2, 3 mở; ô 4, 5 khoá), KHÔNG cần
// máy chủ: Shift+K / nút HUD mở, Esc đóng và trả focus; phím thế giới (L U I O) không chạy khi bảng mở; danh sách chiêu ĐÃ học với số thật (sát thương, linh lực, hồi chiêu),
// nhãn ô ("Ô N" / "Chưa gắn") trên MỖI HÀNG GỌN (một chiêu một hàng, #668); bấm / Enter mở chi tiết (mỗi lúc một hàng, đóng bảng thì gập lại), gắn ô bằng Enter -> đúng một tin
// `skillSlot` và bảng + thanh chiêu cập nhật theo `skills` của máy chủ giả (chi tiết đang mở KHÔNG gập lại khi vẽ lại); ô khoá chỉ báo, không gửi; Delete gỡ (cả khi chỉ focus hàng);
// mũi tên đi giữa các hàng / các ô; ca chưa học chiêu nào; cảnh giới đổi lúc đang mở; 18 chiêu (12 thật + 6 tên dài giả) ở 5 khung: hàng >= 44 px, không tràn, không cắt tên,
// chiêu cuối cuộn tới được, chi tiết mở vẫn đủ nút >= 44 px. Có thể chụp ảnh: `--shots <thư mục>`.
// Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-skills-panel.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { resolveClientUrl } from "./client-url.mjs";
import { waitPageTarget } from "./chrome-wait.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = await resolveClientUrl(argOf("--url", ""));
const SHOTS = argOf("--shots", "");
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-skills-panel-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    // Chrome không đầu không có chuột: `pointer: fine` = false thì thanh chiêu (CSS chỉ cho máy tính) bị ẩn; giả lập chuột (4 = fine, 2 = hover)
    "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
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
  const page = await waitPageTarget(CDP_PORT);
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

  const open = async (query, w, h, mobile = false) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?${query}&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())"))
        break;
    }
    await sleep(1000);
    await evalJs(`(() => { const sc = window.__scene; window.__sent = [];
      const orig = sc.room.send.bind(sc.room);
      sc.room.send = (t, d) => { if (t === "cast" || t === "skillSlot") window.__sent.push({ t, d }); return orig(t, d); };
      return 1; })()`);
  };
  const KEY = {
    Escape: { code: "Escape", key: "Escape", vk: 27 },
    Enter: { code: "Enter", key: "Enter", vk: 13 },
    Delete: { code: "Delete", key: "Delete", vk: 46 },
    ArrowRight: { code: "ArrowRight", key: "ArrowRight", vk: 39 },
    ArrowDown: { code: "ArrowDown", key: "ArrowDown", vk: 40 },
    ArrowUp: { code: "ArrowUp", key: "ArrowUp", vk: 38 },
    K: { code: "KeyK", key: "K", vk: 75 },
    L: { code: "KeyL", key: "l", vk: 76 },
  };
  const press = async (name, modifiers = 0) => {
    const k = KEY[name];
    const base = {
      code: k.code,
      key: k.key,
      windowsVirtualKeyCode: k.vk,
      nativeVirtualKeyCode: k.vk,
      modifiers,
    };
    // Enter: `keyDown` kèm `text` sinh sự kiện `char` nên nút được kích hoạt như bàn phím thật (rawKeyDown thì không)
    if (name === "Enter")
      await send("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", ...base });
    else await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(150);
  };
  const SHIFT = 8;
  const state = () =>
    J(`(() => {
      const m = document.getElementById('skills-modal');
      const rows = [...document.querySelectorAll('#skills-list .sk-row')].map((r) => {
        const line = r.querySelector('.sk-line'), detail = r.querySelector('.sk-detail');
        return {
        id: r.dataset.skill, name: r.querySelector('.sk-row-name').firstChild.textContent, pips: r.querySelector('.sk-row-pips').textContent.trim(),
        badge: r.querySelector('.sk-row-badge')?.textContent ?? '', need: r.querySelector('.sk-row-need')?.textContent ?? '', sub: r.querySelector('.sk-line .sk-row-tag').textContent,
        aria: line.getAttribute('aria-label'), expanded: line.getAttribute('aria-expanded'), detailHidden: detail.hidden, h: Math.round(line.getBoundingClientRect().height),
        stats: [...r.querySelectorAll('.sk-row-stats li')].map((l) => l.textContent),
        mastery: (() => { const m = r.querySelector('.sk-mastery'); if (!m) return null; const b = m.querySelector('.sk-mastery-bar'), f = m.querySelector('.sk-mastery-fill');
          return { text: m.querySelector('.sk-mastery-text').textContent, textHidden: m.querySelector('.sk-mastery-text').getAttribute('aria-hidden') === 'true', bar: !!b,
            role: b?.getAttribute('role') ?? '', now: b?.getAttribute('aria-valuenow') ?? '', max: b?.getAttribute('aria-valuemax') ?? '', min: b?.getAttribute('aria-valuemin') ?? '',
            label: b?.getAttribute('aria-label') ?? '', fill: f?.style.width ?? '', trackW: b ? Math.round(b.getBoundingClientRect().width) : 0, fillW: f ? Math.round(f.getBoundingClientRect().width) : 0 }; })(),
        slots: [...r.querySelectorAll('.sk-slot-btn:not(.unequip)')].map((b) => ({ slot: b.dataset.nav.split(':')[2], here: b.classList.contains('here'), locked: b.classList.contains('locked'), pressed: b.getAttribute('aria-pressed'), aria: b.getAttribute('aria-label') })),
        unequip: r.querySelector('.sk-slot-btn.unequip')?.getAttribute('aria-label') ?? '' };
      });
      return { open: !m.hidden, expanded: document.getElementById('btn-skills').getAttribute('aria-expanded'), count: document.getElementById('skills-count').textContent,
        emptyHidden: document.getElementById('skills-empty').hidden, emptyText: document.getElementById('skills-empty').textContent,
        focus: document.activeElement && document.activeElement.dataset ? (document.activeElement.dataset.nav || document.activeElement.id || '') : '', rows };
    })()`);
  const sent = () => J("window.__sent");
  const clearSent = () => evalJs("window.__sent.length = 0; 1");
  const focusNav = (nav) => evalJs(`document.querySelector('[data-nav="${nav}"]').focus(); 1`);
  const toastText = () => evalJs("document.getElementById('toast').textContent");
  const barSlot = (n) =>
    J(
      `({ cls: document.getElementById('sk-slot${n}').className, label: document.getElementById('sk-slot${n}').getAttribute('aria-label') })`,
    );
  const shot = async (name) => {
    if (!SHOTS) return;
    const png = await send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(png.result.data, "base64"));
  };

  /** Mở chi tiết một hàng bằng bàn phím: focus nút hàng + Enter */
  const openRow = async (id) => {
    await focusNav(`skillrow:${id}`);
    const on = await evalJs(
      `document.querySelector('[data-nav="skillrow:${id}"]').getAttribute('aria-expanded') === 'true'`,
    );
    if (!on) await press("Enter");
  };
  const expandedIds = async () =>
    (await state()).rows.filter((r) => r.expanded === "true" && !r.detailHidden).map((r) => r.id);

  console.log("--- 1280x720, Trúc Cơ, 2 chiêu gắn (ô 2, 3), học 5 chiêu: danh sách GỌN ---");
  await open("skills=mock&n=2", 1280, 720);
  await sleep(3300); // hết hồi chiêu giả của ô 2
  let st = await state();
  check(!st.open && st.expanded === "false", "ban đầu bảng đóng");
  await press("K", SHIFT);
  st = await state();
  check(st.open && st.expanded === "true", "Shift+K mở bảng (nút HUD aria-expanded=true)");
  check(
    st.count === "5 chiêu đã học" && st.rows.length === 5,
    `5 chiêu đã học: ${st.rows.map((r) => r.id).join(", ")}`,
  );
  check(
    st.rows.every((r) => r.expanded === "false" && r.detailHidden),
    "mở bảng: MỌI hàng gập, chỉ thấy một hàng mỗi chiêu",
  );
  check(
    st.rows.every((r) => r.h >= 44),
    `mỗi hàng cao >= 44 px (${st.rows.map((r) => r.h).join(", ")})`,
  );
  // LUYỆN CHIÊU (CT5): `?skills=mock` gửi điểm luyện giả (40% điểm cần của chiêu còn luyện được); chiêu tầng 1 có THANH, tầng cuối / tối đa chỉ một dòng chữ
  {
    const lvOf = (r) => (r.pips.match(/●/g) ?? []).length;
    const bars = st.rows.filter((r) => lvOf(r) === 1);
    const last = st.rows.filter((r) => lvOf(r) === 2);
    const maxed = st.rows.filter((r) => lvOf(r) === 3);
    check(
      bars.length >= 1 && last.length >= 1 && maxed.length >= 1,
      `mock có chiêu tầng 1 / 2 / 3 (${bars.length} / ${last.length} / ${maxed.length})`,
    );
    await openRow(bars[0].id);
    const b = (await state()).rows.find((r) => r.id === bars[0].id).mastery;
    check(
      b !== null &&
        b.bar &&
        b.role === "progressbar" &&
        b.min === "0" &&
        b.max === "60" &&
        b.now === "24" &&
        b.fill === "40%",
      `chiêu tầng 1: thanh luyện 24 / 60, đầy 40% (role=${b?.role}, now=${b?.now}, max=${b?.max}, fill=${b?.fill})`,
    );
    check(
      b !== null && b.trackW > 0 && b.fillW > 0 && b.fillW < b.trackW,
      `thanh có bề rộng thật: phần đầy ${b?.fillW} px trong ${b?.trackW} px`,
    );
    check(
      b !== null &&
        /^Luyện chiêu .+ lên tầng 2: 24 trên 60 điểm$/.test(b.label) &&
        b.text.includes("24 / 60") &&
        b.text.includes("cập nhật khi dùng chiêu") &&
        b.textHidden,
      `nhãn đọc màn hình đủ số, chữ trên màn hình ẩn với trình đọc (tránh đọc hai lần): "${b?.label}"`,
    );
    const n1 = last.map((r) => r.mastery);
    check(
      n1.every((m) => m !== null && !m.bar && m.text === "Tầng 3 chỉ nâng bằng kinh quyển trùng."),
      `chiêu tầng 2 (tối đa 3): một dòng chữ, KHÔNG thanh ("${n1[0]?.text}")`,
    );
    const n2 = maxed.map((r) => r.mastery);
    check(
      n2.every((m) => m !== null && !m.bar && m.text === "Đã đạt tầng tối đa."),
      `chiêu tầng tối đa: "Đã đạt tầng tối đa." không thanh ("${n2[0]?.text}")`,
    );
    await press("Escape");
    await press("K", SHIFT);
  }
  const hoa0 = st.rows.find((r) => r.id === "hoa_van_kiem");
  check(
    hoa0.badge === "Ô 2" &&
      /^Hỏa · tầng \d$/.test(hoa0.sub) &&
      /Hỏa Vân Kiếm, hệ Hỏa, phẩm \S+, tầng \d trên 3, đang ở ô 2/.test(hoa0.aria),
    `hàng Hỏa Vân Kiếm: tên + hệ + ô đang giữ ("${hoa0.name}" | "${hoa0.sub}" | "${hoa0.badge}" | aria "${hoa0.aria}")`,
  );
  check(
    st.rows.filter((r) => r.badge === "Chưa gắn").length === 3 &&
      st.rows.filter((r) => /^Ô \d$/.test(r.badge)).length === 2,
    "hai chiêu 'Ô N', ba chiêu 'Chưa gắn'",
  );
  const visibleSlotBtns = await evalJs(
    `[...document.querySelectorAll('#skills-list .sk-slot-btn')].filter((b) => b.getClientRects().length > 0).length`,
  );
  check(visibleSlotBtns === 0, `gập thì không có nút ô nào hiện (${visibleSlotBtns})`);
  await shot("cong-phap-gon-1280x720");

  console.log("--- bấm / Enter mở chi tiết; mỗi lúc MỘT hàng; Enter lần nữa gập ---");
  await openRow("hoa_van_kiem");
  st = await state();
  const hoa = st.rows.find((r) => r.id === "hoa_van_kiem");
  check(
    (await expandedIds()).join() === "hoa_van_kiem" &&
      hoa.stats.some((l) => /^Sát thương: 1,6 lần công$/.test(l)) &&
      hoa.stats.some((l) => /^Linh lực: 96 \(8% tối đa\)$/.test(l)),
    `Enter mở chi tiết Hỏa Vân Kiếm với số thật: ${hoa.stats.join(" | ")}`,
  );
  check(st.focus === "skillrow:hoa_van_kiem", `focus giữ ở hàng vừa mở (${st.focus})`);
  check(
    hoa.slots.map((s) => s.locked).join() === "false,false,true,true",
    `ô 4, 5 khoá ở Trúc Cơ: ${hoa.slots.map((s) => s.locked).join()}`,
  );
  await shot("cong-phap-gon-mo-1280x720");
  await openRow("bon_thach_quyen");
  check(
    (await expandedIds()).join() === "bon_thach_quyen",
    `mở hàng khác thì hàng trước gập (${(await expandedIds()).join()})`,
  );
  await press("Enter");
  check((await expandedIds()).length === 0, "Enter trên hàng đang mở: gập");
  // mở rồi đóng bảng: lần sau mở lại phải gọn
  await openRow("ung_trao");
  await press("Escape");
  await press("K", SHIFT);
  check(
    (await expandedIds()).length === 0 && (await state()).open,
    "đóng rồi mở lại bảng: danh sách gọn (không nhớ hàng đang mở)",
  );

  console.log("--- phím thế giới không chạy khi bảng mở; Esc đóng và trả focus ---");
  await clearSent();
  await press("L");
  check((await sent()).length === 0, "L (ô chiêu 2) khi bảng mở: KHÔNG gửi cast");
  await press("Escape");
  st = await state();
  check(!st.open, "Esc đóng bảng");
  // mở bằng PHÍM thì nút HUD không phải người mở: focus rời bảng về màn chơi (a11y.ts returnFocus: canvas không nhận focus thì về body), KHÔNG nhảy vào nút HUD
  const outside = await J(
    "({ inModal: document.getElementById('skills-modal').contains(document.activeElement), btn: document.activeElement && document.activeElement.id === 'btn-skills' })",
  );
  check(
    !outside.inModal && !outside.btn,
    `mở bằng Shift+K rồi Esc: focus rời bảng, không nhảy vào nút HUD (${JSON.stringify(outside)})`,
  );
  // mở bằng nút (focus nút + Enter) thì Esc trả focus về chính nút
  await evalJs("document.getElementById('btn-skills').focus(); 1");
  await press("Enter");
  check((await state()).open, "focus nút Công pháp + Enter cũng mở bảng");
  await press("Escape");
  const back = await evalJs("document.activeElement && document.activeElement.id");
  check(
    back === "btn-skills" && !(await state()).open,
    `mở bằng nút rồi Esc: focus trả về nút Công pháp (${back})`,
  );
  await press("K", SHIFT);
  check((await state()).open, "Shift+K mở lại");

  console.log(
    "--- gắn ô bằng bàn phím: Enter -> một tin skillSlot, bảng + thanh chiêu cập nhật, chi tiết KHÔNG gập ---",
  );
  await clearSent();
  await openRow("ung_trao");
  await focusNav("skillslot:ung_trao:3");
  await press("Enter");
  let s = await sent();
  check(
    s.length === 1 && s[0].t === "skillSlot" && s[0].d.slot === 3 && s[0].d.skillId === "ung_trao",
    `tin gửi: ${JSON.stringify(s)}`,
  );
  await sleep(200);
  st = await state();
  const ung = st.rows.find((r) => r.id === "ung_trao");
  const bon = st.rows.find((r) => r.id === "bon_thach_quyen");
  check(
    ung.badge === "Ô 3" && bon.badge === "Chưa gắn",
    `ung_trao ở ô 3, bon_thach_quyen bị thay (nhãn: "${ung.badge}" / "${bon.badge}")`,
  );
  check(
    /ung_trao|Ưng/.test((await barSlot(3)).label),
    `thanh chiêu ô 3 đổi: ${(await barSlot(3)).label}`,
  );
  check(st.focus === "skillslot:ung_trao:3", `giữ focus sau khi vẽ lại (${st.focus})`);
  check(
    (await expandedIds()).join() === "ung_trao",
    `vẽ lại theo tin của máy chủ: chi tiết đang mở KHÔNG gập (${(await expandedIds()).join()})`,
  );

  console.log("--- mũi tên đi giữa các ô / hàng ---");
  await focusNav("skillslot:ung_trao:3");
  await press("ArrowRight");
  check(
    (await state()).focus === "skillslot:ung_trao:4",
    `Phải: sang ô 4 cùng hàng (${(await state()).focus})`,
  );
  await press("ArrowDown");
  const f2 = (await state()).focus;
  check(
    f2.startsWith("skillrow:") && !f2.includes("ung_trao"),
    `Xuống từ chi tiết đang mở: sang hàng chiêu kế (${f2})`,
  );
  await press("Enter"); // mở hàng kế, hàng Ưng Trảo gập
  await focusNav("skillrow:hoa_van_kiem"); // đang gập (chiêu đầu danh sách)
  await press("Escape");
  await press("K", SHIFT);
  await focusNav("skillrow:hoa_van_kiem");
  await press("ArrowDown");
  const ids = (await state()).rows.map((r) => r.id);
  check(
    (await state()).focus === `skillrow:${ids[1]}`,
    `các hàng gập: Xuống đi hàng này sang hàng sau (${(await state()).focus})`,
  );
  await press("ArrowUp");
  check((await state()).focus === `skillrow:${ids[0]}`, "Lên: về hàng trước");

  console.log("--- ô khoá: chỉ báo lý do, KHÔNG gửi ---");
  await openRow("hoa_van_kiem");
  await clearSent();
  await evalJs(`document.querySelector('[data-nav="skillslot:hoa_van_kiem:4"]').click(); 1`);
  await sleep(150);
  check(
    (await sent()).length === 0 && /chưa mở: Mở ở Kim Đan/.test(String(await toastText())),
    `toast: ${await toastText()}`,
  );
  check(
    (await state()).rows[0].slots[2].aria.includes("chưa mở"),
    "aria-label ô khoá nêu cảnh giới mở",
  );

  console.log("--- Delete gỡ chiêu khỏi ô (nút ô hoặc CHỈ focus hàng gập) ---");
  await clearSent();
  await focusNav("skillslot:hoa_van_kiem:2");
  await press("Delete");
  s = await sent();
  check(
    s.length === 1 && s[0].d.slot === 2 && s[0].d.skillId === "",
    `Delete trên nút ô trong chi tiết: ${JSON.stringify(s)}`,
  );
  await sleep(200);
  check(
    (await state()).rows.find((r) => r.id === "hoa_van_kiem").badge === "Chưa gắn",
    "Hỏa Vân Kiếm hết nhãn ô",
  );
  await clearSent();
  await focusNav("skillrow:ung_trao");
  if ((await expandedIds()).includes("ung_trao")) await press("Enter");
  check(!(await expandedIds()).includes("ung_trao"), "Ưng Trảo đang gập, focus ở hàng của nó");
  await press("Delete");
  s = await sent();
  check(
    s.length === 1 && s[0].d.slot === 3 && s[0].d.skillId === "",
    `Delete khi chỉ focus hàng gập: ${JSON.stringify(s)}`,
  );
  await sleep(200);
  st = await state();
  check(st.rows.find((r) => r.id === "ung_trao").badge === "Chưa gắn", "ung_trao hết nhãn ô");
  check(
    /còn trống/.test((await barSlot(3)).label),
    `thanh chiêu ô 3 trống: ${(await barSlot(3)).label}`,
  );

  console.log("--- cảnh giới đổi lúc bảng đang mở: ô 4 mở ---");
  await openRow("hoa_van_kiem");
  await evalJs("window.__scene.me().realm = 3; 1");
  await sleep(500);
  st = await state();
  check(
    st.rows[0].slots[2].locked === false && st.rows[0].slots[3].locked === true,
    "Kim Đan: ô 4 mở, ô 5 còn khoá (bảng dựng lại, không cần đóng / mở)",
  );
  check(
    (await expandedIds()).join() === "hoa_van_kiem",
    "cảnh giới đổi, bảng dựng lại: chi tiết đang mở vẫn mở",
  );
  await evalJs("window.__scene.me().realm = 2; 1");

  console.log("--- chưa học chiêu nào ---");
  await evalJs(
    `window.__scene.onSkills({ learned: {}, slots: ["", "", "", ""], cd: [0, 0, 0, 0], cdMax: [0, 0, 0, 0] }); 1`,
  );
  await sleep(250);
  st = await state();
  check(
    st.rows.length === 0 &&
      !st.emptyHidden &&
      /Túi đồ/.test(st.emptyText) &&
      st.count === "0 chiêu đã học",
    `rỗng: "${st.emptyText}"`,
  );
  await evalJs(`document.querySelector('[data-nav="skills:bag"]').click(); 1`);
  await sleep(250);
  const bag = await J(
    "({ skills: !document.getElementById('skills-modal').hidden, inv: !document.getElementById('inv-modal').hidden })",
  );
  check(!bag.skills && bag.inv, "'Mở Túi đồ' đóng bảng và mở túi");

  // ---------------------------------------------------------------------------------------------------------------
  // 18 chiêu (12 thật + 6 giả tên dài) ở 5 khung: bảng gọn phải đọc được, không tràn, cuộn tới chiêu cuối
  // ---------------------------------------------------------------------------------------------------------------
  const REAL12 = [
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
  const LONG6 = [
    "Cửu Thiên Huyền Lôi Phá Diệt Chưởng",
    "Vạn Kiếm Quy Tông Thần Quang Trảm",
    "Thái Thượng Đại La Ngũ Hành Phù",
    "Bất Động Minh Vương Hộ Thể Kim Cương Quyết",
    "Thiên Địa Đồng Thọ Âm Dương Hợp Nhất Đại Pháp",
    "Linh",
  ];
  const FRAMES = [
    { id: "desktop-hd", w: 1280, h: 720, mobile: false },
    { id: "tablet-p", w: 768, h: 1024, mobile: true },
    { id: "mobile-l", w: 844, h: 390, mobile: true },
    { id: "mobile-p", w: 390, h: 844, mobile: true },
    { id: "mobile-sm", w: 360, h: 640, mobile: true },
  ];
  for (const f of FRAMES) {
    console.log(`--- 18 chiêu (12 thật + 6 tên dài giả) ở ${f.w}x${f.h} (${f.id}) ---`);
    await open("skills=mock&n=2", f.w, f.h, f.mobile);
    // 12 chiêu thật qua `skills` của cảnh; thêm 6 hàng giả (tên dài, một nửa thiếu cảnh giới) bằng cách bọc `ui.setSkillsModel`: chỉ để thử bố cục
    await evalJs(`(() => { const ui = window.__ui, sc = window.__scene;
      const orig = ui.setSkillsModel.bind(ui), LONG = ${JSON.stringify(LONG6)};
      ui.setSkillsModel = (m) => {
        const real = m.rows.filter((r) => !r.id.startsWith('gia_'));
        const fake = LONG.map((nm, i) => { const t = real[i % real.length];
          return { ...t, id: 'gia_' + i, name: nm, slotNow: null, slotLabel: 'Chưa gắn', unequip: null, need: i % 2 === 0 ? 'Cần đạt Nguyên Anh Trung kỳ' : null,
            aria: nm + ', chiêu giả', book: 'Kinh quyển giả ' + i, slots: t.slots.map((s) => ({ ...s, here: false })) }; });
        const rows = [...real, ...fake];
        orig({ ...m, rows, count: rows.length + ' chiêu đã học' });
      };
      const learned = {}; ${JSON.stringify(REAL12)}.forEach((id, i) => { learned[id] = 1 + (i % 3); });
      sc.onSkills({ learned, slots: ['hoa_van_kiem', 'ung_trao', '', ''], cd: [0, 0, 0, 0], cdMax: [3000, 3000, 0, 0] });
      ui.toggleSkillsModal(true); return 1; })()`);
    await sleep(500);
    st = await state();
    check(
      st.count === "18 chiêu đã học" && st.rows.length === 18,
      `18 hàng: ${st.rows.length} (${st.count})`,
    );
    const lay = await J(`(() => {
      const m = document.getElementById('skills-modal'), list = document.getElementById('skills-list');
      const lines = [...list.querySelectorAll('.sk-line')];
      const mr = m.getBoundingClientRect(), lr = list.getBoundingClientRect();
      return {
        minH: Math.round(Math.min(...lines.map((l) => l.getBoundingClientRect().height))),
        clipped: lines.filter((l) => l.scrollWidth > l.clientWidth + 1 || l.querySelector('.sk-row-name').scrollWidth > l.querySelector('.sk-row-name').clientWidth + 1).length,
        modalX: [Math.round(mr.left), Math.round(mr.right)], modalY: [Math.round(mr.top), Math.round(mr.bottom)],
        listH: Math.round(lr.height), listBottom: Math.round(lr.bottom), scrollable: list.scrollHeight > list.clientHeight + 1, listSW: list.scrollWidth, listCW: list.clientWidth,
        sw: m.scrollWidth, cw: m.clientWidth, ow: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight, contentH: list.scrollHeight };
    })()`);
    check(lay.minH >= 44, `mọi hàng cao >= 44 px (thấp nhất ${lay.minH})`);
    check(lay.clipped === 0, `không hàng nào cắt tên / tràn nội dung (${lay.clipped} hàng)`);
    check(
      lay.sw <= lay.cw + 1 &&
        lay.listSW <= lay.listCW + 1 &&
        lay.ow <= lay.vw + 1 &&
        lay.modalX[0] >= 0 &&
        lay.modalX[1] <= lay.vw + 1,
      `không tràn ngang (bảng ${lay.sw}/${lay.cw}, danh sách ${lay.listSW}/${lay.listCW}, trang ${lay.ow}/${lay.vw}, bảng x ${lay.modalX})`,
    );
    check(
      lay.modalY[0] >= 0 && lay.modalY[1] <= lay.vh + 1,
      `cả bảng nằm trong màn hình (y ${lay.modalY}, cao ${lay.vh}); danh sách cao ${lay.listH} / nội dung ${lay.contentH}`,
    );
    check(lay.scrollable, "danh sách 18 chiêu cuộn được trong khung của nó");
    await shot(`cong-phap-gon-18-${f.id}`);

    // mũi tên Xuống 17 lần từ hàng đầu: tới đúng hàng cuối và hàng đó nằm TRONG vùng nhìn của danh sách
    // từ 8 chiêu trở lên bảng xếp "đang gắn trước, phẩm cao trước" (CT11a): hàng đầu / hàng cuối lấy theo THỨ TỰ ĐÃ VẼ, không còn cố định
    const order = await J(
      `[...document.querySelectorAll('#skills-list .sk-row')].map((r) => r.dataset.skill)`,
    );
    const lastId = order[order.length - 1];
    await focusNav(`skillrow:${order[0]}`);
    const seq = [];
    for (let k = 0; k < 17; k++) {
      await press("ArrowDown");
      seq.push((await state()).focus.replace("skillrow:", ""));
    }
    const last = await J(`(() => {
      const list = document.getElementById('skills-list'), a = document.activeElement, lr = list.getBoundingClientRect(), ar = a.getBoundingClientRect();
      return { nav: a.dataset.nav, inView: ar.top >= lr.top - 1 && ar.bottom <= lr.bottom + 1 }; })()`);
    check(
      last.nav === `skillrow:${lastId}` && last.inView,
      `Xuống 17 lần: tới chiêu cuối và cuộn vào tầm nhìn (${JSON.stringify(last)}; đường đi ${seq.join(" > ")})`,
    );
    await shot(`cong-phap-gon-18-cuoi-${f.id}`);

    // mở chi tiết chiêu cuối: nút ô >= 44 px, nằm trong vùng nhìn của danh sách, không tràn
    await press("Enter");
    const det = await J(`(() => {
      const list = document.getElementById('skills-list'), lr = list.getBoundingClientRect();
      const row = document.querySelector('.sk-row[data-skill="${lastId}"]');
      const btns = [...row.querySelectorAll('.sk-slot-btn')];
      return { n: btns.length, small: btns.filter((b) => b.getBoundingClientRect().height < 43.5 || b.getBoundingClientRect().width < 43.5).length,
        below: btns.filter((b) => b.getBoundingClientRect().bottom > lr.bottom + 1).length, sw: row.scrollWidth, cw: row.clientWidth,
        rowH: Math.round(row.getBoundingClientRect().height), listH: Math.round(lr.height) }; })()`);
    check(
      det.n === 4 && det.small === 0 && det.sw <= det.cw + 1,
      `chi tiết chiêu cuối: ${det.n} nút ô, ${det.small} nút < 44 px, không tràn (${det.sw}/${det.cw})`,
    );
    check(
      det.below === 0,
      `nút ô của chiêu vừa mở nằm TRONG vùng nhìn của danh sách, không phải cuộn (${det.below} nút bị cắt; danh sách cao ${det.listH} px, hàng ${det.rowH} px)`,
    );
    await shot(`cong-phap-gon-18-mo-${f.id}`);
    // gập hết rồi mở một chiêu thật ở giữa danh sách, rồi gập lại bằng Enter
    await evalJs("window.__ui.toggleSkillsModal(false); 1");
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
