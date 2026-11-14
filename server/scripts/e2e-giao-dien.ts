// E2E THẬT bố cục giao diện (QUYET_DINH_M3 mục 15): server Colyseus thật + Chrome headless + client đã build.
// Dựng màn chơi "đông" (tổ đội 3 người, 2 nhiệm vụ, chat nhiều dòng) rồi, ở 6 cỡ màn hình (điện thoại dọc 360x640 / 412x915, ngang 915x412,
// cửa sổ hẹp 550x900, máy tính 1366x768 / 1920x1080), đo bằng getBoundingClientRect trên DOM thật:
//  - thẻ nhân vật gọn: không có nút, hai chip (Linh thạch, đạo hữu) cùng MỘT hàng và không tràn, thẻ không quá rộng / cao;
//  - thanh menu: sáu nút cùng cỡ, cùng một hàng, cách đều, nằm trong khung nhìn; màn < 480 px gộp vào nút ☰ mở ra đúng một hàng, chọn mục thì đóng;
//  - không bảng nổi nào chồng lên nhau (cột trái, cột phải, chat).
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
      await T.shot(`giao-dien-${tag}`);
    }

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
