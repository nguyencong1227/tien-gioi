import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm SỔ CHIÊU cho 48-80 chiêu (CT11a, #1056) trong Chrome THẬT qua CDP, chế độ `?skills=mock&n=2`, KHÔNG cần máy chủ: 60 chiêu (12 thật + 48 giả đủ hệ / phẩm, tên có dấu) ->
// thanh tìm hiện (và KHÔNG hiện khi chỉ có 5 chiêu); gõ tên không dấu ra đúng chiêu, "Hiện X / 60 chiêu", "Bỏ lọc"; gõ chữ KHÔNG kích phím tắt của thế giới (Shift+K gõ trong ô tìm không đóng bảng);
// Esc xoá chữ trước, Esc lần hai mới đóng bảng; nút Lọc gập / mở các lựa chọn hệ / phẩm / ô / xếp / chỉ chiêu dùng được; lọc ra rỗng báo "Không có chiêu nào khớp"; đóng rồi mở lại về đủ chiêu;
// bấm hàng sau khi lọc mở đúng chi tiết và gắn ô gửi đúng `skillId`; ở 5 khung mọi điều khiển >= 44 px, không tràn ngang, không cắt chip phẩm. Có thể chụp ảnh: `--shots <thư mục>`.
//   node client/scripts/check-skill-book.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { resolveClientUrl } from "./client-url.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = await resolveClientUrl(argOf("--url", ""));
const SHOTS = argOf("--shots", "");
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-skill-book-"));
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

  // gõ chữ như bàn phím thật: focus ô tìm rồi `Input.insertText` (sinh sự kiện `input`), không đặt `.value` bằng tay
  const typeQ = async (text) => {
    await evalJs(
      `(() => { const q = document.getElementById('skills-q'); q.focus(); q.select(); return 1; })()`,
    );
    await send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      code: "Backspace",
      key: "Backspace",
      windowsVirtualKeyCode: 8,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      code: "Backspace",
      key: "Backspace",
      windowsVirtualKeyCode: 8,
    });
    if (text) await send("Input.insertText", { text });
    await sleep(150);
  };
  const setSel = (id, v) =>
    evalJs(`(() => { const s = document.getElementById('${id}'); s.value = ${JSON.stringify(v)};
      s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  const bk = () =>
    J(`(() => {
      const q = (id) => document.getElementById(id);
      const rows = [...document.querySelectorAll('#skills-list .sk-row')];
      return { open: !q('skills-modal').hidden, barHidden: q('skills-filter').hidden, moreHidden: q('skills-filter-more').hidden,
        toggleExp: q('skills-filter-toggle').getAttribute('aria-expanded'), qv: q('skills-q').value,
        sum: q('skills-count').textContent, clearHidden: q('skills-filter-clear').hidden,
        nomatchHidden: q('skills-nomatch').hidden, n: rows.length, ids: rows.map((r) => r.dataset.skill),
        names: rows.map((r) => r.querySelector('.sk-row-name').firstChild.textContent), grades: rows.map((r) => r.querySelector('.sk-grade').textContent),
        focus: document.activeElement ? (document.activeElement.id || document.activeElement.dataset.nav || document.activeElement.tagName) : '' };
    })()`);

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
  const EL = [
    ["kim", "Kim"],
    ["moc", "Mộc"],
    ["thuy", "Thủy"],
    ["hoa", "Hỏa"],
    ["tho", "Thổ"],
    ["bang", "Băng"],
    ["phong", "Phong"],
    ["loi", "Lôi"],
    ["am", "Âm"],
  ];
  const GN = ["Hoàng", "Huyền", "Địa", "Thiên"];
  const NAMES = [
    "Kiếm Khí Tung Hoành",
    "Đả Tọa Quyết",
    "Băng Phong Chưởng",
    "Liệt Diễm Trảm",
    "Lôi Đình Ấn",
    "Thanh Mộc Phù",
    "Ngũ Hành Trận",
    "Phong Hành Bộ",
    "Kim Cang Hộ Thể",
    "Âm Dương Chỉ",
    "Huyết Ảnh Đao",
    "Thổ Long Quyền",
  ];
  /** Dựng 60 chiêu: 12 thật + 48 giả (hệ xoay vòng, phẩm xoay vòng, tên có dấu), bọc `ui.setSkillsModel` rồi mở bảng */
  const openMany = async (w, h, mobile, total = 60) => {
    await open("skills=mock&n=2", w, h, mobile);
    await evalJs(`(() => { const ui = window.__ui, sc = window.__scene;
      const orig = ui.setSkillsModel.bind(ui), EL = ${JSON.stringify(EL)}, GN = ${JSON.stringify(GN)}, NAMES = ${JSON.stringify(NAMES)}, TOTAL = ${total};
      ui.setSkillsModel = (m) => {
        const real = m.rows.filter((r) => !r.id.startsWith('gia_'));
        const fake = [];
        for (let i = 0; real.length + fake.length < TOTAL; i++) { const t = real[i % real.length], e = EL[i % EL.length], g = (i * 7) % 4;
          const nm = NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + (Math.floor(i / NAMES.length) + 1) : '');
          fake.push({ ...t, id: 'gia_' + i, name: nm, element: e[1], elementId: e[0], grade: g, gradeName: GN[g], slotNow: null, slotLabel: 'Chưa gắn', unequip: null,
            need: i % 5 === 0 ? 'Cần đạt Nguyên Anh Trung kỳ' : null, aria: nm + ', chiêu giả', book: 'Kinh ' + nm, slots: t.slots.map((s) => ({ ...s, here: false })) }); }
        const rows = [...real, ...fake].slice(0, TOTAL);
        orig({ ...m, rows, count: rows.length + ' chiêu đã học' });
      };
      const learned = {}; ${JSON.stringify(REAL12)}.forEach((id, i) => { learned[id] = 1 + (i % 3); });
      sc.onSkills({ learned, slots: ['hoa_van_kiem', 'ung_trao', '', ''], cd: [0, 0, 0, 0], cdMax: [3000, 3000, 0, 0] });
      ui.toggleSkillsModal(true); return 1; })()`);
    await sleep(500);
  };
  const lay = (extra = "") =>
    J(`(() => {
      const m = document.getElementById('skills-modal'), mr = m.getBoundingClientRect();
      const vis = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
      const ctl = [...m.querySelectorAll('#skills-filter input, #skills-filter select, #skills-filter button')].filter(vis);
      const small = ctl.filter((c) => { const r = c.getBoundingClientRect(); const lbl = c.closest('label'); const rr = lbl && c.type === 'checkbox' ? lbl.getBoundingClientRect() : r; return rr.height < 43.5 || (c.type !== 'checkbox' && r.width < 43.5); });
      const out = ctl.filter((c) => { const r = c.getBoundingClientRect(); return r.left < mr.left - 1 || r.right > mr.right + 1; });
      const chips = [...m.querySelectorAll('.sk-grade')].filter((c) => c.scrollWidth > c.clientWidth + 1);
      const list = document.getElementById('skills-list'), lr = list.getBoundingClientRect();
      ${extra}
      return { ctl: ctl.length, small: small.map((c) => c.id || c.tagName), out: out.map((c) => c.id), chips: chips.length,
        sw: m.scrollWidth, cw: m.clientWidth, ow: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight, modalY: [Math.round(mr.top), Math.round(mr.bottom)],
        listH: Math.round(lr.height), listBottom: Math.round(lr.bottom), scrollable: list.scrollHeight > list.clientHeight + 1 };
    })()`);

  // ---------------------------------------------------------------------------------------------------------------
  console.log("--- 1280x720, ÍT chiêu (5): KHÔNG có thanh lọc ---");
  await open("skills=mock&n=2", 1280, 720);
  await sleep(500);
  await press("K", SHIFT);
  let b = await bk();
  check(
    b.open && b.barHidden && b.n === 5,
    `5 chiêu: thanh lọc ẩn, đủ 5 hàng (ẩn=${b.barHidden}, hàng=${b.n})`,
  );
  check(
    b.grades.every((g) => GN.includes(g)),
    `mỗi hàng có chip phẩm hợp lệ (${b.grades.join(", ")})`,
  );
  await press("Escape");

  console.log("--- 1280x720, 60 chiêu: thanh tìm, lọc ---");
  await openMany(1280, 720, false);
  b = await bk();
  check(
    b.open && !b.barHidden && b.n === 60,
    `60 chiêu: thanh lọc hiện, đủ 60 hàng (hiện=${!b.barHidden}, hàng=${b.n})`,
  );
  check(
    b.moreHidden && b.toggleExp === "false",
    "các lựa chọn lọc gập sau nút Lọc, aria-expanded=false",
  );
  check(
    b.clearHidden && b.sum === "60 chiêu đã học",
    `chưa lọc: tiêu đề '${b.sum}', không có nút Bỏ lọc`,
  );
  check(
    b.ids.slice(0, 2).every((id) => ["hoa_van_kiem", "ung_trao"].includes(id)),
    `mặc định xếp ĐANG GẮN trước (hai hàng đầu: ${b.ids.slice(0, 2).join(", ")})`,
  );

  await typeQ("hoa van");
  b = await bk();
  check(
    b.n >= 1 && b.ids.includes("hoa_van_kiem"),
    `gõ "hoa van" (không dấu) ra "Hỏa Vân Kiếm" (${b.n} hàng: ${b.names.join(", ")})`,
  );
  check(
    b.sum === `Hiện ${b.n} / 60 chiêu` && !b.clearHidden,
    `tiêu đề "${b.sum}" và nút Bỏ lọc hiện`,
  );
  check(b.focus === "skills-q", `gõ xong focus vẫn ở ô tìm (${b.focus})`);

  await typeQ("DẢ TOA");
  b = await bk();
  check(
    b.n >= 1 && b.names.every((n) => /Đả Tọa/.test(n)),
    `"DẢ TOA" không phân biệt hoa thường: ${b.n} hàng (${b.names.slice(0, 3).join(", ")})`,
  );
  await typeQ("đả tọa");
  const b2 = await bk();
  check(b2.n === b.n, `"đả tọa" có dấu ra cùng ${b.n} hàng (${b2.n})`);

  // gõ chữ KHÔNG kích phím tắt thế giới: gõ "K" hoa (Shift+K = đóng bảng) và "l" trong ô tìm
  await typeQ("");
  await send("Input.insertText", { text: "KkLl" });
  await sleep(150);
  b = await bk();
  check(b.open && b.qv === "KkLl", `gõ "KkLl" trong ô tìm: bảng vẫn mở, chữ đúng ("${b.qv}")`);
  await typeQ("zzzzzz");
  b = await bk();
  check(
    b.n === 0 && !b.nomatchHidden,
    `không khớp: 0 hàng và báo "Không có chiêu nào khớp" (hàng=${b.n}, ẩn=${b.nomatchHidden})`,
  );
  await evalJs("document.getElementById('skills-filter-clear').click(); 1");
  await sleep(150);
  b = await bk();
  check(
    b.n === 60 && b.qv === "" && b.nomatchHidden && b.clearHidden,
    `Bỏ lọc: về đủ 60 hàng, ô tìm rỗng, ẩn thông báo (hàng=${b.n}, q="${b.qv}")`,
  );
  check(b.focus === "skills-q", `sau Bỏ lọc focus về ô tìm (${b.focus})`);

  // Esc: có chữ thì xoá chữ (KHÔNG đóng bảng), hết chữ rồi mới đóng
  await typeQ("kiem");
  b = await bk();
  const nKiem = b.n;
  check(nKiem >= 1 && nKiem < 60, `gõ "kiem": ${nKiem} hàng`);
  await press("Escape");
  b = await bk();
  check(
    b.open && b.qv === "" && b.n === 60,
    `Esc lần 1 xoá chữ, bảng vẫn mở, đủ 60 hàng (mở=${b.open}, q="${b.qv}", hàng=${b.n})`,
  );
  await press("Escape");
  b = await bk();
  check(!b.open, "Esc lần 2 (ô tìm đã rỗng) đóng bảng");

  console.log("--- lựa chọn lọc: hệ / phẩm / ô / dùng được / xếp ---");
  await openMany(1280, 720, false);
  await evalJs("document.getElementById('skills-filter-toggle').click(); 1");
  b = await bk();
  check(!b.moreHidden && b.toggleExp === "true", "nút Lọc mở các lựa chọn (aria-expanded=true)");
  const opts = await J(
    "[...document.getElementById('skills-el').options].map((o) => o.value + '|' + o.textContent)",
  );
  check(
    opts[0] === "all|Mọi hệ" && opts.length >= 8,
    `lựa chọn hệ: 'Mọi hệ' + các hệ có chiêu (kèm số chiêu) (${opts.join(" ; ")})`,
  );
  await setSel("skills-el", "hoa");
  b = await bk();
  const nHoa = b.n;
  const hoaExpect = Number(opts.find((o) => o.startsWith("hoa|")).match(/\((\d+)\)/)[1]);
  check(
    nHoa === hoaExpect && nHoa > 0 && nHoa < 60,
    `lọc hệ Hỏa: ${nHoa} hàng = số ghi trên lựa chọn (${hoaExpect})`,
  );
  await setSel("skills-gr", "1");
  b = await bk();
  check(
    b.n > 0 && b.n < nHoa && b.grades.every((g) => g === "Huyền"),
    `+ phẩm Huyền: ${b.n} hàng, đều Huyền (${[...new Set(b.grades)].join(",")})`,
  );
  await setSel("skills-gr", "all");
  await setSel("skills-sl", "equipped");
  b = await bk();
  check(
    b.n === 1 && b.ids[0] === "hoa_van_kiem",
    `Hỏa + đang gắn: đúng Hỏa Vân Kiếm (${b.ids.join(",")})`,
  );
  await setSel("skills-sl", "free");
  b = await bk();
  check(
    b.n === nHoa - 1 && !b.ids.includes("hoa_van_kiem"),
    `Hỏa + chưa gắn: ${b.n} hàng, không có Hỏa Vân Kiếm`,
  );
  await setSel("skills-el", "all");
  await setSel("skills-sl", "all");
  await evalJs(
    "(() => { const c = document.getElementById('skills-usable'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()",
  );
  b = await bk();
  const needCount = await J("document.querySelectorAll('#skills-list .sk-row-need').length");
  check(
    b.n > 0 && b.n < 60 && needCount === 0,
    `chỉ chiêu dùng được: ${b.n} hàng, không hàng nào 'Cần đạt' (${needCount})`,
  );
  await evalJs(
    "(() => { const c = document.getElementById('skills-usable'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()",
  );
  await setSel("skills-sort", "grade");
  b = await bk();
  const gi = b.grades.map((g) => GN.indexOf(g));
  check(
    gi.every((g, i) => i === 0 || gi[i - 1] >= g),
    `xếp phẩm cao trước: ${[...new Set(b.grades)].join(" > ")}`,
  );
  await setSel("skills-sort", "name");
  b = await bk();
  const sortedNames = [...b.names].sort((x, y) => x.localeCompare(y, "vi"));
  check(
    b.names.length === 60 &&
      JSON.stringify(
        sortedNames.map((n) => n.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()),
      ) ===
        JSON.stringify(b.names.map((n) => n.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase())),
    "xếp theo tên (không dấu): đúng thứ tự",
  );

  // chọn phím số khi đang ở ô chọn KHÔNG bắn chiêu của thế giới
  await clearSent();
  await evalJs("document.getElementById('skills-gr').focus(); 1");
  for (const k of ["1", "2", "j", "k"]) {
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: k,
      code: k >= "0" && k <= "9" ? `Digit${k}` : `Key${k.toUpperCase()}`,
      text: k,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: k,
      code: k >= "0" && k <= "9" ? `Digit${k}` : `Key${k.toUpperCase()}`,
    });
  }
  await sleep(200);
  const castSent = (await sent()).filter((m) => m.t === "cast").length;
  check(castSent === 0, `bấm 1 2 J K trên ô chọn phẩm: không gửi tin cast (${castSent})`);
  await setSel("skills-gr", "all");

  // bấm hàng sau khi lọc: mở đúng chi tiết, gắn ô gửi đúng skillId
  await setSel("skills-sort", "slot");
  await typeQ("dai toa");
  await typeQ("da toa");
  b = await bk();
  const target = b.ids[0];
  check(Boolean(target), `lọc "da toa" còn ${b.n} hàng, hàng đầu ${target}`);
  await clearSent();
  const gone =
    await J(`(() => { const r = document.querySelector('.sk-row[data-skill="${target}"] .sk-line'); r.click();
    const open = document.querySelector('.sk-row[data-skill="${target}"]'); const btn = open.querySelector('.sk-slot-btn[data-nav$=":2"]'); btn.click();
    return { expanded: r.getAttribute('aria-expanded'), open: open.classList.contains('open') }; })()`);
  await sleep(200);
  const sk = (await sent()).filter((m) => m.t === "skillSlot");
  check(
    gone.expanded === "true" && sk.length === 1 && sk[0].d.skillId === target && sk[0].d.slot === 2,
    `bấm hàng đã lọc mở chi tiết, gắn ô 2 gửi đúng ${JSON.stringify(sk)}`,
  );

  // đóng rồi mở lại: về đủ chiêu
  await evalJs("window.__ui.toggleSkillsModal(false); 1");
  await evalJs("window.__ui.toggleSkillsModal(true); 1");
  await sleep(300);
  b = await bk();
  check(
    b.n === 60 && b.qv === "",
    `đóng rồi mở lại: đủ 60 hàng, ô tìm rỗng (hàng=${b.n}, q="${b.qv}")`,
  );

  await evalJs("window.__ui.toggleSkillsModal(false); 1");

  // ---------------------------------------------------------------------------------------------------------------
  const FRAMES = [
    { id: "desktop-hd", w: 1280, h: 720, mobile: false },
    { id: "tablet-p", w: 768, h: 1024, mobile: true },
    { id: "mobile-l", w: 844, h: 390, mobile: true },
    { id: "mobile-p", w: 390, h: 844, mobile: true },
    { id: "mobile-sm", w: 360, h: 640, mobile: true },
  ];
  for (const f of FRAMES) {
    console.log(`--- 60 chiêu ở ${f.w}x${f.h} (${f.id}) ---`);
    await openMany(f.w, f.h, f.mobile);
    let L = await lay();
    check(
      L.ctl >= 2 && L.small.length === 0,
      `thanh tìm + nút Lọc: ${L.ctl} điều khiển, ${L.small.length} cái < 44 px ${L.small.join(",")}`,
    );
    check(
      L.sw <= L.cw + 1 && L.ow <= L.vw + 1 && L.out.length === 0,
      `không tràn ngang (modal ${L.sw}/${L.cw}, trang ${L.ow}/${L.vw}, ngoài khung: ${L.out.join(",")})`,
    );
    check(L.chips === 0, `chip phẩm không bị cắt (${L.chips})`);
    check(L.listH >= 120, `danh sách còn đủ cao để thao tác (${L.listH} px)`);
    await shot(`so-chieu-60-${f.id}`);
    await evalJs("document.getElementById('skills-filter-toggle').click(); 1");
    await typeQ("kiem");
    L = await lay();
    check(L.small.length === 0, `mở Lọc + gõ: mọi điều khiển >= 44 px (${L.small.join(",")})`);
    check(
      L.sw <= L.cw + 1 && L.ow <= L.vw + 1 && L.out.length === 0,
      `mở Lọc không tràn ngang (modal ${L.sw}/${L.cw}, trang ${L.ow}/${L.vw}, ngoài khung: ${L.out.join(",")})`,
    );
    check(
      L.modalY[0] >= 0 && L.modalY[1] <= L.vh + 1,
      `cả bảng nằm trong màn hình (y ${L.modalY}, cao ${L.vh})`,
    );
    check(
      L.listH >= 60 || f.h < 450,
      `mở Lọc: danh sách vẫn thấy được (${L.listH} px; modal ${L.modalY})`,
    );
    await shot(`so-chieu-60-loc-${f.id}`);
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
