import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm BẢNG TRANG BỊ SÁU Ô (M7.4 #505, `client/src/equip-panel.ts` + `ui.ts`) trong Chrome THẬT (`?skills=mock`, không cần máy chủ):
// đặt `boots / jade / treasure / realm` thẳng lên `__scene.me()` (hud chạy mỗi khung nên ghi đè được ngay) và nhập `ITEM_BY_ID` của chính trang để thêm món thử
// (chưa có món thật cho ba ô riêng, sẽ vào ở PR server). Đo DOM + kiểu tính toán + toạ độ thật:
//  - lưới 3 x 2 đúng thứ tự (Vũ khí, Pháp bào, Hộ phù / Hài, Ngọc bội, Pháp bảo), không tràn khung, mỗi thẻ cao >= 44 px;
//  - ô trống viền nét đứt; ô pháp bảo KHOÁ trước Kim Đan (ổ khoá, "Mở ở Kim Đan", aria-disabled, vẫn focus được, bấm ra thông báo), mở từ Kim Đan;
//  - ba dòng chỉ số % (bạo kích, giảm hồi chiêu, giáp) lấy từ statsFor, chạm trần ghi "(tối đa)", xem trước ghi ▲ / ▼ kèm số, đã ở trần ghi "đã tối đa";
//  - so sánh cùng ô "Đang mặc: cũ → mới"; nút Mặc của pháp bảo trước Kim Đan bị khoá kèm lý do; bấm ô trống nhảy tới món hợp ô trong túi;
//  - dữ liệu lạ (số, "constructor") không làm vỡ; không dựng lại DOM khi không đổi gì; 0 lỗi JS.
// Có thể chụp ảnh: `--shots <thư mục>`. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-equip-six.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
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
const SHARED = `/@fs/${path.resolve(import.meta.dirname, "../../shared/src/items.ts").replace(/^\//, "")}`;
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-equip6-"));
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
    if (msg.method === "Runtime.exceptionThrown") {
      pageErrors++;
      console.log(
        "  [lỗi JS]",
        JSON.stringify(msg.params?.exceptionDetails?.exception?.description ?? "").slice(0, 300),
      );
    }
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
    if (r.result?.exceptionDetails)
      throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result?.result?.value;
  };
  const J = async (js) => JSON.parse(await evalJs(`JSON.stringify(${js})`));
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, "base64"));
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
  });

  // ---- tiện ích trong trang -----------------------------------------------------------------------------------
  /** Đặt cảnh giới + sáu ô lên `me` rồi đợi hud vẽ lại (chạy mỗi khung). */
  const setMe = async (o) => {
    await evalJs(`Object.assign(window.__scene.me(), ${JSON.stringify(o)}); 0`);
    await sleep(250);
  };
  const cards = () =>
    J(`[...document.querySelectorAll('#char-equip-slots .equip-slot-card')].map((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { label: el.querySelector('.slot-label')?.textContent, name: el.querySelector('.slot-item-name')?.textContent,
        hint: el.querySelector('.slot-hint')?.textContent, cls: el.className, aria: el.getAttribute('aria-label'),
        ariaDisabled: el.getAttribute('aria-disabled'), title: el.title, nav: el.dataset.nav, tab: el.tabIndex, disabled: el.disabled,
        svg: Boolean(el.querySelector('svg')), border: cs.borderTopStyle,
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
    })`);
  const pct = () =>
    J(`Object.fromEntries([...document.querySelectorAll('#char-stats .stat-row.pct')].map((row) => [row.dataset.stat, {
      label: row.querySelector('.stat-label').textContent, val: row.querySelector('.stat-val').firstChild.textContent,
      atCap: row.querySelector('.stat-val').classList.contains('at-cap'),
      diff: row.querySelector('.stat-diff')?.textContent ?? '', diffCls: row.querySelector('.stat-diff')?.className ?? '' }]))`);
  const pointer = (sel, i = 0) =>
    evalJs(
      `document.querySelectorAll(${JSON.stringify(sel)})[${i}].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); 0`,
    );
  const speedBonus = () =>
    J(
      `(() => { const row = [...document.querySelectorAll('#char-stats .stat-row')].find((r) => r.querySelector('.stat-label')?.textContent === 'Tốc độ di chuyển'); return row?.querySelector('.stat-bonus')?.textContent ?? null; })()`,
    );
  const toasts = () => J(`[...document.querySelectorAll('#toast p')].map((p) => p.textContent)`);

  for (const [W, H] of [
    [1280, 720],
    [360, 640],
  ]) {
    console.log(`\n--- ${W}x${H} ---`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile: W < 700,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__ui && window.__scene && window.__scene.me && window.__scene.me())",
        )
      )
        break;
    }
    await sleep(500);

    // Nhập module `shared` của trang rồi thêm món thử cho ba ô riêng
    const info = JSON.parse(
      await evalJs(`import(${JSON.stringify(SHARED)}).then((m) => {
      const mk = (id, name, slot, stats, extra = {}) => { m.ITEM_BY_ID[id] = { id, name, type: 'equip', stack: 1, color: 0x7fb6ff, rarity: 1, desc: 'Món thử.', equip: { slot, stats, reqRealm: 0, reqTier: 0, ...extra } }; };
      mk('zz_boots', 'Hài thử', 'boots', { speed: 6, crit: 3 });
      mk('zz_boots_hi', 'Hài cao', 'boots', { crit: m.STAT_CAPS.crit });
      mk('zz_boots_lo', 'Hài thấp', 'boots', { crit: 10 });
      mk('zz_jade', 'Ngọc thử', 'jade', { cdr: 5, guard: 4 });
      mk('zz_jade_crit', 'Ngọc bạo', 'jade', { crit: 5 });
      mk('zz_tre_plain', 'Pháp bảo trơn', 'treasure', {}, { treasure: m.TREASURES[0].id });
      mk('zz_tre', 'Pháp bảo thử', 'treasure', { speed: 11 }, { treasure: m.TREASURES[0].id });
      return JSON.stringify({ cap: m.STAT_CAPS, desc: m.TREASURES[0].desc });
    })`),
    );
    check(
      info.cap.crit === 40 && info.cap.cdr === 30 && info.cap.guard === 40,
      "STAT_CAPS của trang = 40 / 30 / 40 (hợp đồng #585)",
    );
    await evalJs("window.__ui.toggleCharModal(true); 0");

    // ---- A. trước Kim Đan (realm 2), chưa mặc gì ------------------------------------------------------------
    await setMe({ realm: 2, tier: 0, boots: "", jade: "", treasure: "" });
    let c = await cards();
    check(c.length === 6, `đúng sáu thẻ (có ${c.length})`);
    check(
      JSON.stringify(c.map((x) => x.label)) ===
        JSON.stringify(["Vũ khí", "Pháp bào", "Hộ phù", "Hài", "Ngọc bội", "Pháp bảo"]),
      `thứ tự: ${c.map((x) => x.label).join(", ")}`,
    );
    check(
      c[0].y === c[1].y && c[1].y === c[2].y && c[3].y === c[4].y && c[4].y === c[5].y,
      "hai hàng, mỗi hàng ba thẻ ngang nhau",
    );
    check(c[3].y > c[0].y + c[0].h - 1, `hàng dưới nằm dưới hàng trên (${c[0].y} -> ${c[3].y})`);
    check(
      c[0].x === c[3].x && c[1].x === c[4].x && c[2].x === c[5].x,
      "ba cột thẳng hàng (lưới 3 x 2)",
    );
    check(
      c.every((x) => x.right <= W && x.x >= 0),
      `không thẻ nào tràn khung ${W} px (phải nhất ${Math.max(...c.map((x) => x.right))})`,
    );
    check(
      c.every((x) => x.h >= 44),
      `mọi thẻ cao >= 44 px (thấp nhất ${Math.min(...c.map((x) => x.h))})`,
    );
    const [, , , boots0, jade0, tre0] = c;
    check(
      boots0.cls.includes("empty") && boots0.border === "dashed" && boots0.name === "Trống",
      "ô Hài trống: viền nét đứt, chữ 'Trống'",
    );
    check(
      jade0.cls.includes("empty") && jade0.border === "dashed",
      "ô Ngọc bội trống: viền nét đứt",
    );
    check(
      tre0.cls.includes("locked") && tre0.svg,
      "ô Pháp bảo trước Kim Đan: có lớp khoá + ổ khoá (svg)",
    );
    check(tre0.ariaDisabled === "true", "ô khoá có aria-disabled=true");
    check(
      tre0.tab >= 0 && tre0.disabled !== true,
      "ô khoá vẫn FOCUS được (không `disabled`) để nghe lý do",
    );
    check(
      tre0.hint === "Mở ở Kim Đan" && tre0.aria === "Pháp bảo: khoá, Mở ở Kim Đan",
      `chữ + aria của ô khoá: "${tre0.hint}" / "${tre0.aria}"`,
    );
    check(
      c.every((x) => x.nav?.startsWith("eq:")) &&
        c.map((x) => x.nav).join() === "eq:weapon,eq:robe,eq:talisman,eq:boots,eq:jade,eq:treasure",
      "data-nav eq:<ô> đủ sáu (bàn phím đi theo lưới)",
    );
    let p = await pct();
    check(
      JSON.stringify(Object.keys(p)) === JSON.stringify(["crit", "cdr", "guard"]),
      "ba dòng chỉ số % đúng thứ tự bạo kích, giảm hồi chiêu, giáp",
    );
    check(
      Object.values(p).every((r) => r.val === "0%"),
      "chưa mặc gì: cả ba là 0%",
    );
    check(p.guard.label === "Giáp (giảm sát thương)", `nhãn giáp: "${p.guard.label}"`);
    await pointer("#char-equip-slots .equip-slot-card", 5);
    await sleep(150);
    check(
      (await toasts()).some((t) => t === "Mở ở Kim Đan"),
      "bấm ô khoá: thông báo 'Mở ở Kim Đan'",
    );
    await shot(`equip6-${W}-truoc-kim-dan`);

    // ---- B. mặc hài + ngọc: chỉ số lên, ô pháp bảo vẫn khoá và KHÔNG cộng ----------------------------------
    await setMe({ boots: "zz_boots", jade: "zz_jade", treasure: "zz_tre" });
    c = await cards();
    check(
      c[3].name === "Hài thử" && c[4].name === "Ngọc thử" && c[3].cls.includes("filled"),
      "hài + ngọc bội hiện tên, thẻ 'filled'",
    );
    check(
      c[5].cls.includes("locked") && c[5].name === "Đã khoá",
      "pháp bảo đặt sẵn mà CHƯA tới Kim Đan: thẻ vẫn khoá, không hiện như đang có tác dụng",
    );
    p = await pct();
    check(
      p.crit.val === "3%" && p.cdr.val === "5%" && p.guard.val === "4%",
      `chỉ số % từ statsFor: ${p.crit.val} / ${p.cdr.val} / ${p.guard.val}`,
    );
    check(
      c[3].hint.includes("+6 Tốc độ") &&
        c[3].hint.includes("+3% Bạo kích") &&
        c[3].hint.endsWith("Chạm tháo"),
      `gợi ý thẻ có chỉ số mới: "${c[3].hint}"`,
    );

    check(
      (await speedBonus()) === "(+6)",
      `pháp bảo (speed +11) đặt sẵn mà CHƯA tới Kim Đan KHÔNG cộng vào '(+N)' của tốc độ: "${await speedBonus()}" (khớp statsFor)`,
    );

    // ---- C. từ Kim Đan (realm 3): pháp bảo mở -----------------------------------------------------------------
    await setMe({ realm: 3 });
    c = await cards();
    check(
      !c[5].cls.includes("locked") && c[5].name === "Pháp bảo thử" && c[5].cls.includes("filled"),
      "từ Kim Đan: thẻ pháp bảo mở, hiện tên",
    );
    check(
      (await speedBonus()) === "(+17)",
      `từ Kim Đan pháp bảo cộng vào tốc độ: "${await speedBonus()}"`,
    );
    check(c[5].hint === "+11 Tốc độ · Chạm tháo", `pháp bảo CÓ chỉ số: gợi ý "${c[5].hint}"`);
    check(
      c[5].title.includes(info.desc) && c[5].aria.includes(info.desc),
      "title + aria chứa NGUYÊN VĂN câu nội tại của shared (không tự diễn giải)",
    );
    await setMe({ treasure: "zz_tre_plain" });
    c = await cards();
    check(c[5].hint === "Có nội tại · Chạm tháo", `pháp bảo KHÔNG có chỉ số: gợi ý "${c[5].hint}"`);
    check(
      c[5].title.includes(info.desc),
      "pháp bảo không chỉ số: title vẫn chứa nguyên văn câu nội tại",
    );
    await setMe({ treasure: "zz_tre" });
    await shot(`equip6-${W}-day-du`);

    // Bảng dài hơn nay (thêm hàng ô + ba dòng chỉ số): cuộn xuống đáy thì phần tử CUỐI không được nằm dưới nút Đóng nổi
    await evalJs(
      "(() => { const b = document.querySelector('#char-modal .char-body'); b.scrollTop = b.scrollHeight; return 0; })()",
    );
    await sleep(200);
    const ov = await J(`(() => {
      const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      const close = document.getElementById('char-close').getBoundingClientRect();
      const bag = document.getElementById('char-bag-equips'); const last = (bag.lastElementChild ?? bag).getBoundingClientRect();
      const body = document.querySelector('#char-modal .char-body');
      return { lastBottom: Math.round(last.bottom), closeTop: Math.round(close.top), hit: hit(last, close), scrollable: body.scrollHeight > body.clientHeight };
    })()`);
    check(
      !ov.hit,
      `cuộn xuống đáy: phần tử cuối không bị nút Đóng che (đáy ${ov.lastBottom} px, nút Đóng bắt đầu ${ov.closeTop} px, cuộn được: ${ov.scrollable})`,
    );
    await shot(`equip6-${W}-day-cuoi`);
    await evalJs(
      "(() => { document.querySelector('#char-modal .char-body').scrollTop = 0; return 0; })()",
    );

    // ---- D. trần: hài cao đủ trần, xem trước ------------------------------------------------------------------
    const bag = [
      { itemId: "zz_boots_lo", qty: 1 },
      { itemId: "zz_jade_crit", qty: 1 },
      { itemId: "zz_tre", qty: 1 },
    ];
    await evalJs(`window.__ui.onInv({ slots: ${JSON.stringify(bag)}, cd: {} }); 0`);
    await setMe({ boots: "zz_boots_hi", jade: "", treasure: "" });
    p = await pct();
    check(
      p.crit.val === "40% (tối đa)" && p.crit.atCap,
      `bạo kích chạm trần: "${p.crit.val}", lớp at-cap`,
    );
    check(
      p.cdr.val === "0%" && !p.cdr.atCap,
      "giảm hồi chiêu chưa chạm trần thì không ghi (tối đa)",
    );
    // xem trước hài thấp (cùng ô, bạo kích 40 -> 10): giảm
    await pointer("#char-bag-equips .char-bag-item", 0);
    await sleep(200);
    p = await pct();
    check(
      p.crit.diff === "▼-30%" && p.crit.diffCls.includes("down"),
      `xem trước hài thấp: "${p.crit.diff}" (mũi tên ▼ kèm số)`,
    );
    const bagLine = await J(
      `document.querySelectorAll('#char-bag-equips .char-bag-item')[0].querySelector('small').textContent`,
    );
    check(bagLine.includes("▼ Bạo kích -30%"), `dòng so sánh trong túi: "${bagLine}"`);
    // xem trước ngọc bạo kích (ô khác, đã ở trần): "đã tối đa", không mũi tên
    await pointer("#char-bag-equips .char-bag-item", 1);
    await sleep(200);
    p = await pct();
    check(
      p.crit.diff === "đã tối đa" && p.crit.diffCls.includes("maxed"),
      `đã ở trần mà món mới cộng bạo kích: "${p.crit.diff}" (không mũi tên)`,
    );
    await shot(`equip6-${W}-tran`);

    // ---- E. nút Mặc: pháp bảo trước Kim Đan khoá kèm lý do; ô trống nhảy tới món hợp ô ----------------------
    await setMe({ realm: 2 });
    await evalJs(`window.__ui.onInv({ slots: ${JSON.stringify(bag)}, cd: {} }); 0`);
    await sleep(200);
    const btns =
      await J(`[...document.querySelectorAll('#char-bag-equips .char-bag-item')].map((row) => ({ slot: row.dataset.slot,
      btn: row.querySelector('.char-equip-btn').textContent, disabled: row.querySelector('.char-equip-btn').disabled, cmp: row.querySelector('small')?.textContent ?? '' }))`);
    check(
      btns[2].slot === "treasure" && btns[2].btn === "Mở ở Kim Đan" && btns[2].disabled,
      `nút Mặc pháp bảo trước Kim Đan: "${btns[2].btn}", disabled=${btns[2].disabled}`,
    );
    check(btns[0].btn === "Mặc" && !btns[0].disabled, "nút Mặc hài vẫn dùng được");
    check(
      !/ngang bằng/i.test(btns[2].cmp) && btns[2].cmp.trim() === "Mở ở Kim Đan",
      `dòng so sánh pháp bảo khoá trong túi: "${btns[2].cmp}" (không "ngang bằng", có lý do khoá)`,
    );
    // ô Ngọc bội trống + túi có ngọc -> bấm thẻ thì focus nút Mặc của ngọc
    await pointer("#char-equip-slots .equip-slot-card", 4);
    await sleep(200);
    const focus = await J(
      `({ slot: document.activeElement?.closest?.('.char-bag-item')?.dataset?.slot ?? null, cls: document.activeElement?.className ?? '' })`,
    );
    check(
      focus.slot === "jade" && focus.cls.includes("char-equip-btn"),
      `bấm ô Ngọc bội trống: focus nhảy tới nút Mặc của món hợp ô (slot=${focus.slot})`,
    );
    // ô Hài đã có (hài cao) nên thử ô trống không có đồ hợp: tháo hài rồi bỏ hài khỏi túi
    await setMe({ boots: "", jade: "" });
    await evalJs(`window.__ui.onInv({ slots: [{ itemId: 'zz_jade_crit', qty: 1 }], cd: {} }); 0`);
    await sleep(200);
    await pointer("#char-equip-slots .equip-slot-card", 3);
    await sleep(150);
    check(
      (await toasts()).some((t) => t === "Trong túi chưa có đồ cho ô Hài"),
      "ô Hài trống mà túi không có hài: nói rõ 'Trong túi chưa có đồ cho ô Hài'",
    );

    // ---- E2. chi tiết ô túi: pháp bảo trước Kim Đan, nút Mặc khoá kèm lý do (cả hộp so sánh) ------------------
    await setMe({ realm: 2, boots: "", jade: "", treasure: "" });
    await evalJs("window.__ui.toggleCharModal(false); window.__ui.toggleInventory(true); 0");
    await evalJs(`window.__ui.onInv({ slots: [{ itemId: 'zz_tre', qty: 1 }], cd: {} }); 0`);
    await sleep(200);
    await pointer("#inv-grid .inv-slot", 0);
    await sleep(200);
    const eb =
      await J(`({ text: document.getElementById('inv-btn-equip').textContent, disabled: document.getElementById('inv-btn-equip').disabled,
      cmp: document.getElementById('inv-equip-cmp').textContent })`);
    check(
      eb.text === "Mở ở Kim Đan" && eb.disabled,
      `chi tiết ô túi, pháp bảo trước Kim Đan: nút "${eb.text}", disabled=${eb.disabled}`,
    );
    check(
      eb.cmp.includes("Mở ở Kim Đan"),
      "hộp so sánh cũng ghi 'Mở ở Kim Đan' (không ghi 'Đủ cảnh giới')",
    );
    check(!eb.cmp.includes("Đủ cảnh giới"), "hộp so sánh KHÔNG nói 'Đủ cảnh giới' khi ô còn khoá");
    check(
      !/ngang bằng/i.test(eb.cmp),
      "hộp so sánh KHÔNG nói 'ngang bằng' cho ô còn khoá (không có món nào đang mặc ở đó)",
    );
    await setMe({ realm: 3 });
    await evalJs(`window.__ui.onInv({ slots: [{ itemId: 'zz_tre', qty: 1 }], cd: {} }); 0`);
    await sleep(200);
    await pointer("#inv-grid .inv-slot", 0);
    await sleep(200);
    const eb3 = await J(
      `({ text: document.getElementById('inv-btn-equip').textContent, disabled: document.getElementById('inv-btn-equip').disabled })`,
    );
    check(
      eb3.text === "Mặc" && !eb3.disabled,
      `từ Kim Đan: nút "${eb3.text}", disabled=${eb3.disabled}`,
    );
    await evalJs("window.__ui.toggleInventory(false); window.__ui.toggleCharModal(true); 0");

    // ---- F. so sánh cùng ô trong túi (hộp chi tiết) ------------------------------------------------------------
    await setMe({ realm: 3, boots: "zz_boots", jade: "", treasure: "" });
    await evalJs("window.__ui.toggleCharModal(false); window.__ui.toggleInventory(true); 0");
    await evalJs(`window.__ui.onInv({ slots: [{ itemId: 'zz_boots_hi', qty: 1 }], cd: {} }); 0`);
    await sleep(200);
    await pointer("#inv-grid .inv-slot", 0);
    await sleep(200);
    const cmp = await J(`document.getElementById('inv-equip-cmp').textContent`);
    check(cmp.includes("Đang mặc: Hài thử → Hài cao"), `hộp so sánh: "${cmp.slice(0, 80)}"`);
    check(
      cmp.includes("▲ Bạo kích +37%"),
      "hộp so sánh có mũi tên ▲ kèm số cho bạo kích (3 -> 40)",
    );
    await shot(`equip6-${W}-so-sanh`);
    await evalJs("window.__ui.toggleInventory(false); window.__ui.toggleCharModal(true); 0");

    // ---- G. dữ liệu lạ không làm vỡ ----------------------------------------------------------------------------
    await setMe({ boots: "constructor", jade: 5, treasure: { x: 1 }, weapon: "__proto__" });
    c = await cards();
    check(
      c[3].name === "Trống" && c[4].name === "Trống" && c[0].name === "Trống",
      "id 'constructor' / số / object / '__proto__' về Trống",
    );
    await setMe({ boots: "", jade: "", treasure: "", weapon: "" });

    // ---- H. không dựng lại DOM khi không đổi gì ---------------------------------------------------------------
    await evalJs(
      `window.__mut = 0; new MutationObserver((l) => { window.__mut += l.length; }).observe(document.getElementById('char-equip-slots'), { childList: true, subtree: true, attributes: true, characterData: true }); 0`,
    );
    await sleep(1200);
    const muts = await evalJs("window.__mut");
    check(muts === 0, `1,2 giây đứng yên: bảng sáu ô KHÔNG bị dựng lại (${muts} thay đổi DOM)`);
  }
  check(pageErrors === 0, `0 lỗi JS (có ${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures === 0 ? "\n✓ TẤT CẢ ĐẠT" : `\n✗ ${failures} kiểm tra HỎNG`);
process.exit(failures === 0 ? 0 : 1);
