// E2E THẬT bố cục giao diện (QUYET_DINH_M3 mục 15): server Colyseus thật + Chrome headless + client đã build.
// Dựng màn chơi "đông" (tổ đội 3 người, 2 nhiệm vụ, chat nhiều dòng) rồi, ở 6 cỡ màn hình (điện thoại dọc 360x640 / 412x915, ngang 915x412,
// cửa sổ hẹp 550x900, máy tính 1366x768 / 1920x1080), đo bằng getBoundingClientRect trên DOM thật:
//  - thẻ nhân vật gọn: không có nút, hai chip (Linh thạch, đạo hữu) cùng MỘT hàng và không tràn, thẻ không quá rộng / cao;
//  - thanh menu: sáu nút cùng cỡ, cùng một hàng, cách đều, nằm trong khung nhìn; màn < 480 px gộp vào nút ☰ mở ra đúng một hàng, chọn mục thì đóng;
//  - không bảng nổi nào chồng lên nhau (cột trái, cột phải, chat), vùng giữa (quanh nhân vật) trống, ngân sách diện tích;
//  - Tổ đội / Nhiệm vụ / Chat: mặc định thu gọn ở màn hẹp, mở ở máy tính rộng; chat thu gọn còn đúng một dòng, Enter mở, tự mờ, nhớ trạng thái.
// Chạy: `npm run build -w client && npm run e2e:giao-dien -w server` (cần google-chrome). Ảnh (tuỳ chọn): đặt E2E_SHOTS=<thư mục>.
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, listenWithRetry, removeTmpDirs } from "./e2e-kit";
import { VIEWPORTS, applyViewport, crowdHud } from "./layout-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 38000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

/** Đo bố cục hiện tại trong trang (một lần gọi): toạ độ các phần tử cần kiểm. */
const MEASURE = `(() => {
  const rect = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const shown = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const byId = (id) => document.getElementById(id);
  const hud = byId('hud');
  const chips = [...document.querySelectorAll('#hud .hud-chip')];
  const chipRow = byId('hud').querySelector('.hud-chips');
  const items = [...document.querySelectorAll('#hud-menu-items > button')];
  const toggle = byId('btn-menu');
  const panels = ['hud', 'party-panel', 'quest-tracker', 'chat', 'minimap-wrap', 'hud-menu'].filter((id) => shown(byId(id))).map((id) => ({ id, ...rect(byId(id)) }));
  const itemsShown = items.length > 0 && shown(byId('hud-menu-items'));
  const col = byId('hud-col-left');
  const cls = (id) => (byId(id) ? [...byId(id).classList] : []);
  return {
    W: innerWidth, H: innerHeight,
    hudButtons: hud.querySelectorAll('button').length,
    hud: rect(hud),
    chips: chips.map(rect),
    chipOverflow: chipRow.scrollWidth - chipRow.clientWidth,
    toggleShown: shown(toggle),
    toggleExpanded: toggle.getAttribute('aria-expanded'),
    itemsShown,
    items: itemsShown ? items.map(rect) : [],
    panels,
    colLeft: shown(col) ? rect(col) : null,
    partyCollapsed: cls('party-panel').includes('collapsed'),
    questCollapsed: cls('quest-tracker').includes('collapsed'),
    chatCollapsed: cls('chat').includes('collapsed'),
    chatToggleShown: shown(byId('chat')) && shown(byId('chat-toggle')),
  };
})()`;

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}
interface Measure {
  W: number;
  H: number;
  hudButtons: number;
  hud: Rect;
  chips: Rect[];
  chipOverflow: number;
  toggleShown: boolean;
  toggleExpanded: string;
  itemsShown: boolean;
  items: Rect[];
  panels: Array<Rect & { id: string }>;
  colLeft: Rect | null;
  partyCollapsed: boolean;
  questCollapsed: boolean;
  chatCollapsed: boolean;
  chatToggleShown: boolean;
}

const overlap = (a: Rect, b: Rect) =>
  Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;

async function main() {
  out("=== E2E THẬT bố cục giao diện: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-gd-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-gd-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  try {
    PORT = await listenWithRetry(httpServer, PORT, { explicit: false, pick: pickPort });
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    out(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` (${detail})`}`);
    if (!ok) failures.push(name + ": " + detail);
  };
  let fatal: string | null = null;
  try {
    chrome = spawn(
      "google-chrome",
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        `--remote-debugging-port=${CDP}`,
        `--user-data-dir=${chromeDir}`,
        "--window-size=1280,720",
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    let targets: any[] = [];
    for (const start = Date.now(); Date.now() - start < 8000;) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP}/json`);
        if (res.ok) {
          targets = (await res.json()) as any[];
          break;
        }
      } catch {
        await sleep(150);
      }
    }
    const first = targets.find((t) => t.type === "page");
    if (!first?.webSocketDebuggerUrl) throw new Error("Không kết nối được Chrome DevTools");
    tab = await Tab.open("A", first.webSocketDebuggerUrl);
    const T = tab;
    const NAME = "Cu Ky Anh Anh";
    await T.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)}); localStorage.setItem("tien-gioi:secret", "e2e_secret_giao_dien_abcdefg");`,
    });
    await T.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug` });
    await T.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    await T.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game",
    );
    await sleep(800);
    await crowdHud(T, NAME);

    for (const v of VIEWPORTS) {
      out(`\n--- ${v.w}x${v.h} (${v.note}) ---`);
      await applyViewport(T, v);
      const tag = `${v.w}x${v.h}`;
      let m = (await T.ev(MEASURE)) as Measure;

      // ---- thẻ nhân vật gọn ----
      check(`${tag}: thẻ nhân vật KHÔNG chứa nút nào`, m.hudButtons === 0, String(m.hudButtons));
      check(
        `${tag}: hai chip (Linh thạch, đạo hữu) cùng MỘT hàng`,
        m.chips.length === 2 && Math.abs(m.chips[0].t - m.chips[1].t) < 2,
        JSON.stringify(m.chips.map((c) => Math.round(c.t))),
      );
      check(`${tag}: dòng chip không tràn ngang`, m.chipOverflow <= 0, String(m.chipOverflow));
      const maxHudW = v.w >= 1000 ? 0.3 * m.W : 0.6 * m.W;
      check(
        `${tag}: thẻ nhân vật rộng ${Math.round(m.hud.w)} px, không quá ${v.w >= 1000 ? 30 : 60}% khung (${Math.round(maxHudW)} px)`,
        m.hud.w <= maxHudW,
        String(m.hud.w),
      );
      const maxHudH = v.w >= 1000 ? 115 : 135; // màn hẹp: tên một dòng riêng nên cao hơn một dòng
      check(
        `${tag}: thẻ nhân vật cao ${Math.round(m.hud.h)} px (<= ${maxHudH})`,
        m.hud.h <= maxHudH,
        String(m.hud.h),
      );

      // ---- thanh menu ----
      const equalRow = (rs: Rect[]) => {
        if (rs.length !== 6) return `có ${rs.length} nút`;
        const w0 = rs[0].w;
        const h0 = rs[0].h;
        const t0 = rs[0].t;
        if (rs.some((r) => Math.abs(r.w - w0) > 1 || Math.abs(r.h - h0) > 1)) return "khác cỡ";
        if (rs.some((r) => Math.abs(r.t - t0) > 1)) return "không cùng một hàng";
        const gaps = rs.slice(1).map((r, i) => r.l - rs[i].r);
        if (gaps.some((g) => Math.abs(g - gaps[0]) > 1 || g < 0))
          return `khe không đều ${gaps.map(Math.round)}`;
        if (rs.some((r) => r.l < 0 || r.r > m.W + 0.5 || r.t < 0 || r.b > m.H + 0.5))
          return "ra ngoài khung nhìn";
        const minSide = v.touch ? 44 : 36;
        if (w0 < minSide - 0.5 || h0 < minSide - 0.5)
          return `nhỏ ${Math.round(w0)}x${Math.round(h0)} < ${minSide}`;
        return "";
      };
      if (v.w >= 480) {
        check(
          `${tag}: thanh menu hiện sẵn, không có nút ☰`,
          m.itemsShown && !m.toggleShown,
          JSON.stringify({ items: m.itemsShown, toggle: m.toggleShown }),
        );
        check(
          `${tag}: sáu nút menu cùng cỡ, một hàng, cách đều, trong khung`,
          equalRow(m.items) === "",
          equalRow(m.items),
        );
      } else {
        check(
          `${tag}: màn hẹp chỉ có nút ☰, chưa hiện hàng nút`,
          m.toggleShown && !m.itemsShown,
          JSON.stringify({ items: m.itemsShown, toggle: m.toggleShown }),
        );
        await T.ev(`document.getElementById('btn-menu').click(); 1`);
        await sleep(250);
        m = (await T.ev(MEASURE)) as Measure;
        check(
          `${tag}: bấm ☰ mở ra đúng MỘT hàng sáu nút cùng cỡ, cách đều, trong khung`,
          m.itemsShown && m.toggleExpanded === "true" && equalRow(m.items) === "",
          `${m.itemsShown} ${m.toggleExpanded} ${equalRow(m.items)}`,
        );
        await T.ev(`document.getElementById('btn-char').click(); 1`);
        await sleep(300);
        const afterPick = (await T.ev(MEASURE)) as Measure;
        check(
          `${tag}: chọn một mục thì hàng nút đóng lại`,
          !afterPick.itemsShown && afterPick.toggleExpanded === "false",
          `${afterPick.itemsShown} ${afterPick.toggleExpanded}`,
        );
        await T.ev(`window.__ui.closeAllModals(); 1`);
        await sleep(200);
        m = (await T.ev(MEASURE)) as Measure;
      }

      // ---- không bảng nổi nào chồng lên nhau ----
      const clashes: string[] = [];
      const ps = m.panels;
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++)
          if (overlap(ps[i], ps[j])) clashes.push(`${ps[i].id} x ${ps[j].id}`);
      check(
        `${tag}: không bảng nổi nào chồng lên nhau (${ps.map((p) => p.id).join(", ")})`,
        clashes.length === 0,
        clashes.join("; "),
      );
      // ---- mặc định thu gọn ở màn hẹp, mở ở máy tính rộng ----
      const narrow = v.w < 700 || Math.min(v.w, v.h) < 600; // quy tắc của isCompactHud: điện thoại (cạnh ngắn < 600) hoặc cửa sổ hẹp (< 700)
      const expect = narrow ? "thu gọn" : "mở";
      check(
        `${tag}: Tổ đội, Nhiệm vụ, Chat mặc định ${expect}`,
        m.partyCollapsed === narrow && m.questCollapsed === narrow && m.chatCollapsed === narrow,
        JSON.stringify({ party: m.partyCollapsed, quest: m.questCollapsed, chat: m.chatCollapsed }),
      );
      // ---- khung chat và nút 💬 hiện ở MỌI cỡ (điện thoại ngang trước đây ẩn hẳn chat; nit của A ở #479) ----
      check(
        `${tag}: khung chat và nút 💬 hiện ra`,
        m.chatToggleShown,
        JSON.stringify(m.chatToggleShown),
      );
      // ---- ngân sách diện tích và vùng giữa trống ----
      const area = (r: Rect) => r.w * r.h;
      const total = ps.reduce((a, p) => a + area(p), 0) / (m.W * m.H);
      const maxTotal = narrow ? 0.35 : 0.25;
      check(
        `${tag}: các bảng nổi chiếm ${(total * 100).toFixed(1)}% diện tích (<= ${maxTotal * 100}%)`,
        total <= maxTotal,
        String(total),
      );
      const widest = ps.reduce((a, p) => (p.w > a.w ? p : a), ps[0]);
      const maxW = v.w >= 1000 ? 0.3 : 0.6;
      check(
        `${tag}: bảng nổi rộng nhất (${widest.id}) ${Math.round(widest.w)} px, không quá ${maxW * 100}% khung`,
        widest.w <= maxW * m.W,
        String(widest.w),
      );
      if (m.colLeft)
        check(
          `${tag}: cột trái cao ${Math.round(m.colLeft.h)} px, không quá 60% khung (${Math.round(0.6 * m.H)} px)`,
          m.colLeft.h <= 0.6 * m.H,
          String(m.colLeft.h),
        );
      const centre: Rect = {
        l: m.W * 0.4,
        t: m.H * 0.4,
        r: m.W * 0.6,
        b: m.H * 0.6,
        w: m.W * 0.2,
        h: m.H * 0.2,
      };
      const inCentre = ps.filter((p) => overlap(p, centre)).map((p) => p.id);
      check(
        `${tag}: vùng giữa (quanh nhân vật) không bị bảng nào che`,
        inCentre.length === 0,
        inCentre.join(", "),
      );
      await T.shot(`giao-dien-${tag}`);
    }

    // ---- Chat thu gọn, tự mờ; Tổ đội / Nhiệm vụ nhớ trạng thái; nhiệm vụ trống ----
    // máy tính 1366x768: mặc định mở cả ba
    await applyViewport(T, VIEWPORTS[4]);
    const st = async () => (await T.ev(MEASURE)) as Measure;
    const cls = (id: string) => T.ev(`[...document.getElementById('${id}').classList].join(' ')`);
    const rectOf = (sel: string) =>
      T.ev(
        `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, h: b.height, d: getComputedStyle(e).display }; })()`,
      ) as Promise<{ t: number; b: number; h: number; d: string } | null>;
    check(
      "máy tính: chat mở sẵn, ô nhập hiện",
      (await rectOf("#chat-form"))?.d !== "none" &&
        !String(await cls("chat")).includes("collapsed"),
      String(await cls("chat")),
    );
    await T.ev(`document.getElementById('chat-toggle').click(); 1`);
    await sleep(250);
    const logC = await rectOf("#chat-log");
    const lastP = await rectOf("#chat-log p:last-child");
    check(
      "Bấm 💬: chat thu gọn còn MỘT dòng (cao <= 30 px), ô nhập ẩn, dòng cuối nằm trọn trong khung",
      !!logC &&
        !!lastP &&
        logC.h <= 30 &&
        (await rectOf("#chat-form"))?.d === "none" &&
        lastP.t >= logC.t - 1 &&
        lastP.b <= logC.b + 1,
      JSON.stringify({ logC, lastP }),
    );
    await T.ev(`window.__ui.chat({ from: 'Tin Moi', text: 'dong cuoi cung khi dang thu gon' }); 1`);
    await sleep(150);
    check(
      "Tin mới khi đang thu gọn: dòng cuối là tin mới và khung sáng lên (không còn mờ)",
      String(await T.ev(`document.querySelector('#chat-log p:last-child').textContent`)).includes(
        "dong cuoi cung",
      ) && !String(await cls("chat")).includes("idle"),
      String(await cls("chat")),
    );
    // Enter thật (qua CDP): hiện ô nhập tạm rồi đưa con trỏ vào; Esc thu lại
    const key = async (type: "enter" | "esc" | "h") => {
      const k =
        type === "enter"
          ? { key: "Enter", code: "Enter", vk: 13, text: "\r" }
          : type === "h"
            ? { key: "h", code: "KeyH", vk: 72, text: "h" }
            : { key: "Escape", code: "Escape", vk: 27, text: "" };
      const base = {
        key: k.key,
        code: k.code,
        windowsVirtualKeyCode: k.vk,
        nativeVirtualKeyCode: k.vk,
        modifiers: 0,
      };
      await T.send("Input.dispatchKeyEvent", {
        ...base,
        type: k.text ? "keyDown" : "rawKeyDown",
        ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}),
      });
      await T.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
      await sleep(250);
    };
    await T.ev(
      `document.activeElement && document.activeElement.blur && document.activeElement.blur(); 1`,
    );
    await key("enter");
    check(
      "Enter: chat thu gọn hiện ô nhập tạm (typing) và con trỏ nằm trong ô",
      String(await cls("chat")).includes("typing") &&
        (await T.ev(`document.activeElement && document.activeElement.id`)) === "chat-input" &&
        (await rectOf("#chat-form"))?.d !== "none",
      `${await cls("chat")} / ${await T.ev(`document.activeElement && document.activeElement.id`)}`,
    );
    await key("esc");
    check(
      "Esc: rời ô nhập, chat thu lại còn một dòng",
      !String(await cls("chat")).includes("typing") && (await rectOf("#chat-form"))?.d === "none",
      String(await cls("chat")),
    );
    // tự mờ sau vài giây không dùng, rê chuột thì sáng lại
    await sleep(6800);
    const idle = String(await cls("chat")).includes("idle");
    const opIdle = Number(
      await T.ev(`parseFloat(getComputedStyle(document.getElementById('chat')).opacity)`),
    );
    check(
      `Không dùng 6 giây: chat tự mờ (opacity ${opIdle.toFixed(2)} <= 0.5)`,
      idle && opIdle <= 0.5,
      `${idle} ${opIdle}`,
    );
    await T.ev(`document.getElementById('chat').dispatchEvent(new Event('pointerenter')); 1`);
    await sleep(500);
    check(
      "Rê chuột vào chat: sáng lại",
      !String(await cls("chat")).includes("idle") &&
        Number(
          await T.ev(`parseFloat(getComputedStyle(document.getElementById('chat')).opacity)`),
        ) > 0.9,
      String(await cls("chat")),
    );

    // ---- Phím H ẩn / hiện TOÀN BỘ giao diện (màn chơi sạch) ----
    const bodyCls = () => T.ev(`document.body.className`);
    const HUD_IDS = [
      "hud",
      "hud-menu",
      "minimap-wrap",
      "party-panel",
      "quest-tracker",
      "chat",
      "skills",
      "quickbar",
    ];
    const visibleIds = async () =>
      JSON.parse(
        String(
          await T.ev(
            `JSON.stringify(${JSON.stringify(HUD_IDS)}.filter((id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.getClientRects().length > 0; }))`,
          ),
        ),
      ) as string[];
    // đang gõ chữ (ô chat) thì H là chữ "h", không ẩn giao diện
    await T.ev(`window.__ui.focusChat(); 1`);
    await sleep(150);
    await key("h");
    check(
      "Đang gõ trong ô chat: H là chữ 'h', giao diện KHÔNG bị ẩn",
      !String(await bodyCls()).includes("ui-hidden") &&
        (await T.ev(`document.getElementById('chat-input').value`)) === "h",
      `${await bodyCls()} / ${await T.ev(`document.getElementById('chat-input').value`)}`,
    );
    await T.ev(
      `document.getElementById('chat-input').value = ''; document.activeElement.blur(); 1`,
    );
    await sleep(150);
    const before = await visibleIds();
    check(
      "Trước khi ẩn: đủ 8 phần giao diện đang hiện",
      before.length === HUD_IDS.length,
      before.join(","),
    );
    await key("h");
    const hiddenNow = await visibleIds();
    check(
      "Bấm H: ẩn TOÀN BỘ giao diện (thẻ, menu, bản đồ nhỏ, tổ đội, nhiệm vụ, chat, nút kỹ năng, thanh đan)",
      String(await bodyCls()).includes("ui-hidden") && hiddenNow.length === 0,
      `${await bodyCls()} / còn hiện: ${hiddenNow.join(",")}`,
    );
    check(
      "Có thông báo hướng dẫn cách hiện lại",
      String(await T.ev(`document.getElementById('toast').textContent`)).includes(
        "Bấm H để hiện lại",
      ),
      String(await T.ev(`document.getElementById('toast').textContent`)),
    );
    await T.ev(`window.__ui.toggleSettingsModal(true); 1`);
    await sleep(200);
    check(
      "Đang ẩn giao diện: bảng mở ra (Cài đặt) VẪN hiện bình thường",
      !!(await rectOf("#settings-modal")) &&
        (await rectOf("#settings-modal"))!.h > 100 &&
        (await rectOf("#settings-modal"))!.d !== "none",
      JSON.stringify(await rectOf("#settings-modal")),
    );
    await T.ev(`window.__ui.toggleSettingsModal(false); 1`);
    await sleep(150);
    await key("h");
    const backNow = await visibleIds();
    check(
      "Bấm H lần nữa: hiện lại đủ giao diện như trước",
      !String(await bodyCls()).includes("ui-hidden") && backNow.join(",") === before.join(","),
      `${await bodyCls()} / ${backNow.join(",")}`,
    );
    // phím nằm trong màn Phím tắt (cùng bảng phím với mọi hành động)
    await T.ev(`window.__ui.toggleKeysModal(true); 1`);
    await sleep(250);
    check(
      "Màn Phím tắt có dòng 'Ẩn / hiện toàn bộ giao diện' với phím H",
      (await T.ev(
        `(() => { const b = document.querySelector('#keys-list button[data-action="ui.toggle"]'); return b ? [...b.closest('.keys-row').querySelectorAll('.key-chip')].map((c) => c.textContent).join(',') : null; })()`,
      )) === "H",
      String(
        await T.ev(`document.querySelector('#keys-list button[data-action="ui.toggle"]') !== null`),
      ),
    );
    await T.ev(`window.__ui.toggleKeysModal(false); 1`);
    await sleep(150);

    // nhiệm vụ trống: chỉ còn tiêu đề một dòng
    await T.ev(`window.__ui.onQuests({ active: [], done: [], dailyDone: [] }); 1`);
    await sleep(200);
    const qEmpty = await rectOf("#quest-tracker");
    check(
      "Chưa có nhiệm vụ: bảng nhiệm vụ chỉ còn một dòng (cao <= 44 px), danh sách ẩn",
      !!qEmpty && qEmpty.h <= 44 && (await rectOf("#quest-tracker-list"))?.d === "none",
      JSON.stringify(qEmpty),
    );
    await crowdHud(T, NAME); // trả lại hai nhiệm vụ

    // nhớ trạng thái: thu gọn Tổ đội + Nhiệm vụ, mở Chat, tải lại trang, vào lại
    await T.ev(
      `document.getElementById('party-btn-toggle').click(); document.getElementById('qt-toggle').click(); document.getElementById('chat-toggle').click(); 1`,
    );
    await sleep(250);
    const prefs = JSON.parse(
      String(
        await T.ev(
          `JSON.stringify([localStorage.getItem('tg_party_open'), localStorage.getItem('tg_qt_open'), localStorage.getItem('tg_chat_open')])`,
        ),
      ),
    );
    check(
      "Bấm thu / mở: ba bảng ghi lựa chọn vào localStorage (đội 0, nhiệm vụ 0, chat 1)",
      prefs.join(",") === "0,0,1",
      prefs.join(","),
    );
    await T.send("Page.reload");
    await T.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập sau khi tải lại",
    );
    await T.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào lại game",
    );
    await sleep(800);
    await crowdHud(T, NAME);
    const after = await st();
    check(
      "Sau khi tải lại: đúng lựa chọn đã nhớ (Tổ đội thu gọn, Nhiệm vụ thu gọn, Chat mở) dù máy tính mặc định mở cả ba",
      after.partyCollapsed && after.questCollapsed && !after.chatCollapsed,
      JSON.stringify({
        party: after.partyCollapsed,
        quest: after.questCollapsed,
        chat: after.chatCollapsed,
      }),
    );
    await T.ev(
      `localStorage.removeItem('tg_party_open'); localStorage.removeItem('tg_qt_open'); localStorage.removeItem('tg_chat_open'); 1`,
    );

    check("0 lỗi console / exception", T.errors.length === 0, T.errors.slice(0, 3).join(" | "));
  } catch (e) {
    fatal = (e as Error).message;
  } finally {
    tab?.close();
    chrome?.kill();
    await gameServer.gracefullyShutdown(false).catch(() => {});
    httpServer.close();
    await sleep(600);
    await removeTmpDirs(dataDir, chromeDir);
  }
  if (fatal || failures.length) {
    out(`\n❌ E2E BỐ CỤC THẤT BẠI: ${fatal ?? `${failures.length} kiểm đỏ`}`);
    for (const f of failures) out(`   - ${f}`);
    process.exit(1);
  }
  out("\n🎉 E2E THẬT BỐ CỤC PASS 100%!");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
