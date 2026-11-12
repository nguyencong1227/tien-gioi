// E2E THẬT Tông môn (M3.6): server Colyseus thật (trong tiến trình, thư mục dữ liệu tạm) phục vụ client/dist, HAI tab Chrome headless
// điều khiển bằng CDP (hai nguồn 127.0.0.1 / localhost để không chung localStorage). Luồng qua giao diện thật:
// A mở bảng Tông môn (nút HUD) -> lập (form: tên + biệt hiệu, mất phí) -> B thấy `[TV]` cạnh tên A -> A bấm chuột thật vào B -> nút "Mời vào
// tông môn" -> B nhận hộp mời -> Gia nhập -> hai bên thấy nhau trong danh sách thành viên -> chat `/s` (kênh riêng) -> B góp kho, A rút kho
// (ví, hồ sơ, tệp tông môn khớp; tổng Linh thạch chỉ giảm đúng phí lập) -> thăng Trưởng lão -> B rời (mất biệt hiệu) -> A giải tán (hai bước,
// kho phải rỗng). Không lỗi console, không cảnh báo mất tin. Thoát 0 khi đạt, 1 khi sai. Không ghi vào `server/data/players` thật.
//
// Chạy: `npm run build && npm run e2e:tong-mon -w server` (cần google-chrome; client/dist phải là bản build mới).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_MAP, DEFAULT_MAP_ID, SECT_CREATE_COST, roomNameOf } from "@tien-gioi/shared";
import { Tab, shown, sleep, listenWithRetry, removeTmpDirs } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 36000 + Math.floor(Math.random() * 4000);
let PORT = pickPort();
const CDP = 9500 + Math.floor(Math.random() * 400);
const sha1 = (s: string) =>
  createHash("sha1").update(s.normalize("NFC").toLowerCase().trim()).digest("hex");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const out = (m: string) => console.log(m);

const A = {
  name: "Tong Chu Mot",
  secret: "e2e_secret_tong_chu_1_abcdefghij",
  host: "127.0.0.1",
  coin: 3000,
};
const B = {
  name: "De Tu Hai",
  secret: "e2e_secret_de_tu_hai_2_abcdefghij",
  host: "localhost",
  coin: 500,
};
const SECT = { name: "Thanh Van Mon", tag: "TV" };

async function main() {
  out("=== E2E THẬT Tông môn: hai tab Chrome headless + server Colyseus thật ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-sect-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-sect-chrome-"));
  // `store.ts` / `sect-store.ts` đọc DATA_DIR khi dùng: đặt TRƯỚC khi nạp WorldRoom
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");

  const now = new Date().toISOString();
  mkdirSync(path.join(dataDir, "souls"), { recursive: true });
  for (const p of [A, B]) {
    writeFileSync(
      path.join(dataDir, `${sha1(p.name)}.json`),
      JSON.stringify({
        name: p.name,
        secretHash: sha256(p.secret),
        realm: 1,
        tier: 8,
        exp: 0,
        coin: p.coin,
        mapId: DEFAULT_MAP_ID,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  const sectFiles = () => {
    const d = path.join(dataDir, "sects");
    return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")) : [];
  };
  const sectOnDisk = () =>
    JSON.parse(readFileSync(path.join(dataDir, "sects", sectFiles()[0]), "utf8"));
  const saveOf = (name: string) =>
    JSON.parse(readFileSync(path.join(dataDir, `${sha1(name)}.json`), "utf8"));

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  // Lỗi listen (cổng bận) phải thành lỗi THẬT (e2e-kit.listenWithRetry): `new Promise((r) => server.listen(PORT, r))` không bao giờ resolve khi cổng bận
  // nên script thoát mã 0 không in gì (false green) và sót thư mục tạm. Cổng ngẫu nhiên bận thì thử cổng khác.
  try {
    PORT = await listenWithRetry(httpServer, PORT, { explicit: false, pick: pickPort });
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }
  out(`- Server E2E: http://127.0.0.1:${PORT} (dữ liệu tạm ${dataDir})`);

  let chrome: ChildProcess | null = null;
  const tabs: Tab[] = [];
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
    let spawnError: Error | null = null;
    chrome.once("error", (e) => (spawnError = e));
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
    if (spawnError)
      throw new Error(`Không chạy được google-chrome: ${(spawnError as Error).message}`);
    const first = targets.find((t) => t.type === "page");
    if (!first?.webSocketDebuggerUrl) throw new Error("Không kết nối được Chrome DevTools");
    const second = await (
      await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: "PUT" })
    ).json();
    const ta = await Tab.open("A", first.webSocketDebuggerUrl);
    const tb = await Tab.open("B", (second as any).webSocketDebuggerUrl);
    tabs.push(ta, tb);

    // 1. Đăng nhập cả hai (form thật) vào Lạc Hà; xác nhận (confirm) của nút Nhường / Trục xuất / Rời luôn đồng ý
    for (const [tab, p] of [
      [ta, A],
      [tb, B],
    ] as const) {
      await tab.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(p.name)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(p.secret)}); window.confirm = () => true;`,
      });
      await tab.send("Page.navigate", { url: `http://${p.host}:${PORT}/?debug` });
    }
    for (const tab of tabs) {
      await tab.waitFor(
        `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
        "form đăng nhập",
      );
      await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    }
    for (const tab of tabs)
      await tab.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "vào Lạc Hà",
      );
    const roomId = (await matchMaker.query({ name: roomNameOf(DEFAULT_MAP_ID) }))[0].roomId;
    const world = (matchMaker.getLocalRoomById(roomId) as any).world;
    const sids = new Map<string, string>();
    world.state.players.forEach((p: any, sid: string) => sids.set(p.name, sid));
    const ctrlOf = (n: string) => world.ctrl.get(sids.get(n)!);
    const playerOf = (n: string) => world.state.players.get(sids.get(n)!);
    // Hai người đứng cạnh nhau trong trấn (cùng thấy nhau, bấm chuột được)
    const pa = playerOf(A.name);
    const pb = playerOf(B.name);
    pa.x = DEFAULT_MAP.townPx.x - 40;
    pb.x = DEFAULT_MAP.townPx.x + 40;
    pa.y = pb.y = DEFAULT_MAP.townPx.y + 60;
    for (const tab of tabs)
      await tab.waitFor(
        `[...window.__scene.state.players.values()].filter(p => Math.abs((p.px ?? p.x) - ${Math.round(DEFAULT_MAP.townPx.x)}) < 120).length === 2`,
        "hai người ở chỗ mới",
      );
    if (ctrlOf(A.name).coin !== A.coin)
      throw new Error(`A phải có ${A.coin} Linh thạch, thực tế ${ctrlOf(A.name).coin}`);
    out("  ✓ [1/9] Hai người chơi vào Lạc Hà (form thật), đứng cạnh nhau trong trấn");

    // Tiện ích giao diện thật
    const press = (tab: Tab, id: string) =>
      tab.ev(
        `(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) throw new Error('không có #${id}'); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); e.click(); return 1; })()`,
      );
    const visible = shown; // thấy thật (kể cả khi phần tử cha ẩn), không chỉ `!hidden`
    const text = (tab: Tab, id: string) =>
      tab.ev(`document.getElementById(${JSON.stringify(id)})?.textContent ?? ''`);
    const fill = (tab: Tab, id: string, value: string) =>
      tab.ev(
        `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`,
      );
    const submit = (tab: Tab, id: string) =>
      tab.ev(`document.getElementById(${JSON.stringify(id)}).requestSubmit(); 1`);
    const openModal = async (tab: Tab) => {
      if (!(await tab.ev(visible("sect-modal")))) await press(tab, "btn-sect");
      await tab.waitFor(visible("sect-modal"), "bảng Tông môn");
    };
    const clickOn = async (tab: Tab, name: string) => {
      const pos = await tab.ev(
        `(() => { const s = window.__scene; const cam = s.cameras.main; const [, e] = [...s.players.entries()].find(([id]) => s.state.players.get(id)?.name === ${JSON.stringify(name)}); return { x: (e.root.x - cam.worldView.x) * cam.zoom, y: (e.root.y - cam.worldView.y) * cam.zoom }; })()`,
      );
      for (const type of ["mousePressed", "mouseReleased"])
        await tab.send("Input.dispatchMouseEvent", {
          type,
          x: pos.x,
          y: pos.y,
          button: "left",
          clickCount: 1,
        });
    };

    // 2. A lập tông môn qua form
    await openModal(ta);
    await ta.waitFor(visible("sect-view-none"), "ô lập tông môn");
    await ta.shot("1-lap");
    await fill(ta, "sect-input-name", SECT.name);
    await fill(ta, "sect-input-tag", SECT.tag);
    await submit(ta, "sect-form-create");
    await ta.waitFor(visible("sect-view-detail"), "bảng chi tiết sau khi lập");
    if (!(await text(ta, "sect-head-title")).includes(SECT.name))
      throw new Error(`Tiêu đề phải nêu "${SECT.name}"`);
    if (!(await text(ta, "sect-meta-tag")).includes(SECT.tag))
      throw new Error("Biệt hiệu phải hiện ở bảng");
    if (!/Tông chủ/.test(await text(ta, "sect-meta-my-rank")))
      throw new Error("A phải là Tông chủ");
    if (ctrlOf(A.name).coin !== A.coin - SECT_CREATE_COST)
      throw new Error(`Phí lập ${SECT_CREATE_COST} chưa bị trừ: ${ctrlOf(A.name).coin}`);
    if (saveOf(A.name).coin !== A.coin - SECT_CREATE_COST)
      throw new Error("Phí lập phải xuống hồ sơ trước khi tông môn ra đời");
    if (sectFiles().length !== 1) throw new Error("Phải có đúng một tệp tông môn");
    await ta.shot("2-da-lap");
    // B thấy biệt hiệu [TV] cạnh tên A (state công khai + nhãn vẽ)
    await tb.waitFor(
      `(() => { const s = window.__scene; const e = [...s.players.entries()].find(([id]) => s.state.players.get(id)?.name === ${JSON.stringify(A.name)}); return !!e && s.state.players.get(e[0]).sect === ${JSON.stringify(SECT.tag)} && (e[1].lastLabel || '').includes('[${SECT.tag}]'); })()`,
      "B thấy [TV] cạnh tên A",
    );
    await press(ta, "sect-close");
    out(
      `  ✓ [2/9] A lập "${SECT.name}" [${SECT.tag}] qua form: mất ${SECT_CREATE_COST} Linh thạch (đã xuống hồ sơ), là Tông chủ, B thấy [${SECT.tag}] cạnh tên A`,
    );

    // 3. A bấm chuột thật vào B -> "Mời vào tông môn"; B nhận hộp mời
    await clickOn(ta, B.name);
    await ta.waitFor(visible("player-menu"), "menu người chơi");
    await ta.waitFor(
      `${shown("pm-sect-btn")} && !document.getElementById('pm-sect-btn').disabled`,
      "nút Mời vào tông môn bấm được",
    );
    await ta.shot("3-menu");
    await press(ta, "pm-sect-btn");
    await tb.waitFor(visible("sect-invite-box"), "hộp mời tông môn của B");
    await tb.shot("4-loi-moi");
    const invText =
      (await text(tb, "sib-msg")) + (await text(tb, "sib-title")) + (await text(tb, "sib-tag"));
    if (!invText.includes(A.name) && !invText.includes(SECT.name))
      throw new Error(`Hộp mời phải nêu người mời / tông môn, thực tế "${invText}"`);
    out("  ✓ [3/9] A bấm chuột vào B -> nút Mời vào tông môn; B nhận hộp lời mời");

    // 4. B gia nhập
    await press(tb, "sib-btn-accept");
    await tb.waitFor(
      `!document.getElementById('sect-invite-box') || document.getElementById('sect-invite-box').hidden`,
      "hộp mời đóng",
    );
    await openModal(tb);
    await tb.waitFor(visible("sect-view-detail"), "B thấy bảng chi tiết");
    if (!(await text(tb, "sect-head-title")).includes(SECT.name))
      throw new Error("B phải thấy tên tông môn");
    if (!/Đệ tử/.test(await text(tb, "sect-meta-my-rank"))) throw new Error("B phải là Đệ tử");
    await press(ta, "btn-sect");
    await ta.waitFor(visible("sect-modal"), "A mở lại bảng");
    await press(ta, "sect-tab-btn-members");
    await ta.waitFor(
      `document.getElementById('sect-members-list').children.length === 2`,
      "A thấy 2 thành viên",
    );
    // B hiện TRỰC TUYẾN ngay (server gửi presence lúc thành viên đổi, không chờ nhịp 10 giây)
    await ta.waitFor(
      `[...document.querySelectorAll('#sect-members-list .sect-member-item')].some(i => i.textContent.includes(${JSON.stringify(B.name)}) && i.querySelector('.sect-member-status.online'))`,
      "A thấy B trực tuyến trong danh sách",
      4000,
    );
    // Dòng "Tổng số" phải khớp danh sách (lỗi đã bắt ở #237: luôn ghi 0)
    const summary = await text(ta, "sect-members-summary");
    if (!/2\s*\/\s*30/.test(summary))
      throw new Error(`Tổng số thành viên phải ghi 2 / 30, thực tế "${summary}"`);
    await ta.shot("5-thanh-vien");
    if (playerOf(B.name).sect !== SECT.tag) throw new Error("B phải mang biệt hiệu trong state");
    out(
      "  ✓ [4/9] B gia nhập: hai bên thấy nhau trong danh sách thành viên (B trực tuyến), B là Đệ tử",
    );

    // 5. Chat /s (kênh riêng) A -> B
    await fill(ta, "chat-input", "/s Hom nay san boss");
    await submit(ta, "chat-form");
    await tb.waitFor(
      `[...document.querySelectorAll('#chat-log p')].some(p => /\\[Tông môn\\] ${A.name}: Hom nay san boss/.test(p.textContent))`,
      "B nhận chat /s",
    );
    await tb.shot("6-chat");
    // chat thường KHÔNG vào kênh tông môn
    await sleep(1000); // hồi chiêu chat (800 ms) giữa hai tin
    await fill(ta, "chat-input", "xin chao ca lang");
    await submit(ta, "chat-form");
    await tb.waitFor(
      `[...document.querySelectorAll('#chat-log p')].some(p => /Tong Chu Mot: xin chao ca lang/.test(p.textContent) && !/Tông môn/.test(p.textContent))`,
      "chat thường tới B",
    );
    out("  ✓ [5/9] Chat /s tới B ở kênh [Tông môn]; chat thường vẫn đi kênh chung");

    // 6. Kho: B góp 200, A rút 150
    await press(tb, "sect-tab-btn-treasury");
    await tb.waitFor(visible("sect-tab-treasury"), "tab Kho của B");
    await fill(tb, "sect-input-deposit", "200");
    await submit(tb, "sect-form-deposit");
    await press(ta, "sect-tab-btn-treasury");
    await ta.waitFor(
      `document.getElementById('sect-treasury-value').textContent.replace(/\\D/g,'') === '200'`,
      "A thấy kho 200",
    );
    if (ctrlOf(B.name).coin !== B.coin - 200)
      throw new Error(`Ví B phải còn ${B.coin - 200}, thực tế ${ctrlOf(B.name).coin}`);
    if (saveOf(B.name).coin !== B.coin - 200) throw new Error("Số góp phải xuống hồ sơ B");
    await ta.waitFor(shown("sect-form-withdraw"), "ô rút của Tông chủ");
    await fill(ta, "sect-input-withdraw", "150");
    await submit(ta, "sect-form-withdraw");
    await ta.waitFor(
      `document.getElementById('sect-treasury-value').textContent.replace(/\\D/g,'') === '50'`,
      "kho còn 50",
    );
    if (ctrlOf(A.name).coin !== A.coin - SECT_CREATE_COST + 150)
      throw new Error(
        `Ví A phải là ${A.coin - SECT_CREATE_COST + 150}, thực tế ${ctrlOf(A.name).coin}`,
      );
    await ta.shot("7-kho");
    const file = sectOnDisk();
    if (file.coin !== 50 || file.members.length !== 2)
      throw new Error(`Tệp tông môn lệch: coin ${file.coin}, ${file.members.length} thành viên`);
    const total = ctrlOf(A.name).coin + ctrlOf(B.name).coin + file.coin;
    if (total !== A.coin + B.coin - SECT_CREATE_COST)
      throw new Error(`Tổng Linh thạch phải chỉ giảm đúng phí lập: ${total}`);
    // B (Đệ tử) không có ô rút
    if (!(await tb.ev(`document.getElementById('sect-form-withdraw').hidden`)))
      throw new Error("Đệ tử không được thấy ô rút kho");
    out(
      "  ✓ [6/9] B góp 200, A rút 150: ví, hồ sơ, tệp tông môn khớp; tổng Linh thạch chỉ giảm đúng phí lập; Đệ tử không có ô rút",
    );

    // 7. Thăng Trưởng lão
    await press(ta, "sect-tab-btn-members");
    await ta.waitFor(
      `document.getElementById('sect-members-list').children.length === 2`,
      "danh sách thành viên",
    );
    await ta.ev(
      `(() => { const b = [...document.querySelectorAll('#sect-members-list button')].find(x => /Thăng/.test(x.textContent)); if (!b) throw new Error('không có nút Thăng TL'); b.click(); return 1; })()`,
    );
    // Phía server: hồ sơ tông môn ghi B là Trưởng lão
    for (
      let i = 0;
      i < 50 &&
      !sectOnDisk().members.some((m: any) => m.name === B.name && m.rank === "truong_lao");
      i++
    )
      await sleep(100);
    if (!sectOnDisk().members.some((m: any) => m.name === B.name && m.rank === "truong_lao"))
      throw new Error("Tệp tông môn phải ghi B là Trưởng lão");
    await press(tb, "sect-tab-btn-overview"); // thẻ Tổng quan hiện hạng của mình
    await tb.waitFor(
      `/Trưởng lão/.test(document.getElementById('sect-meta-my-rank')?.textContent || '')`,
      "B thành Trưởng lão",
    );
    out("  ✓ [7/9] A thăng B làm Trưởng lão: bảng của B cập nhật");

    // 8. B rời tông môn
    await press(tb, "sect-tab-btn-overview");
    await press(tb, "sect-btn-leave");
    // Hộp xác nhận trong game (#246) thay confirm() gốc
    await tb.waitFor(visible("sect-action-confirm"), "hộp xác nhận rời tông môn");
    await press(tb, "sect-action-confirm-ok");
    await tb.waitFor(visible("sect-view-none"), "B về màn chưa có tông môn");
    await tb.waitFor(`true`, "");
    for (let i = 0; i < 50 && playerOf(B.name).sect !== ""; i++) await sleep(100);
    if (playerOf(B.name).sect !== "") throw new Error("B phải mất biệt hiệu sau khi rời");
    await ta.waitFor(
      `document.getElementById('sect-members-list').children.length === 1`,
      "A thấy chỉ còn mình",
    );
    await ta.waitFor(
      `(() => { const s = window.__scene; const e = [...s.players.entries()].find(([id]) => s.state.players.get(id)?.name === ${JSON.stringify(B.name)}); return !!e && !(e[1].lastLabel || '').includes('[${SECT.tag}]'); })()`,
      "A thấy B mất [TV]",
    );
    out("  ✓ [8/9] B rời: bảng của B về màn lập, mất biệt hiệu; A thấy chỉ còn mình");

    // 9. A giải tán: phải rút hết kho trước; xác nhận hai bước
    await press(ta, "sect-tab-btn-overview");
    await press(ta, "sect-btn-disband");
    await ta.waitFor(visible("sect-disband-confirm"), "ô xác nhận giải tán");
    await press(ta, "sect-btn-disband-confirm");
    await ta.waitFor(
      `/rút hết|Linh thạch/.test(document.getElementById('toast')?.textContent || '')`,
      "toast bị chặn vì kho còn tiền",
    );
    if (sectFiles().length !== 1) throw new Error("Kho còn tiền thì không được giải tán");
    await press(ta, "sect-tab-btn-treasury");
    await fill(ta, "sect-input-withdraw", "50");
    await submit(ta, "sect-form-withdraw");
    await ta.waitFor(
      `document.getElementById('sect-treasury-value').textContent.replace(/\\D/g,'') === '0'`,
      "kho rỗng",
    );
    await press(ta, "sect-tab-btn-overview");
    await press(ta, "sect-btn-disband");
    await ta.waitFor(visible("sect-disband-confirm"), "ô xác nhận giải tán lần hai");
    await press(ta, "sect-btn-disband-confirm");
    await ta.waitFor(visible("sect-view-none"), "A về màn lập sau khi giải tán");
    if (sectFiles().length !== 0) throw new Error("Tệp tông môn phải bị xoá");
    if (playerOf(A.name).sect !== "") throw new Error("A phải mất biệt hiệu");
    const finalTotal = ctrlOf(A.name).coin + ctrlOf(B.name).coin;
    if (finalTotal !== A.coin + B.coin - SECT_CREATE_COST)
      throw new Error(
        `Tổng Linh thạch cuối phải là ${A.coin + B.coin - SECT_CREATE_COST}, thực tế ${finalTotal}`,
      );
    await ta.shot("8-giai-tan");
    out(
      "  ✓ [9/9] Giải tán: bị chặn khi kho còn tiền, rút hết rồi giải tán xong; tệp xoá; tổng Linh thạch chỉ mất đúng phí lập",
    );

    const errors = tabs.flatMap((t) => t.errors.map((e) => `[${t.label}] ${e}`));
    if (errors.length > 0) {
      console.error("\n❌ LỖI / CẢNH BÁO TRÌNH DUYỆT:");
      for (const e of errors) console.error("   " + e);
      throw new Error(`E2E thất bại: ${errors.length} lỗi console`);
    }
    out("  ✓ 0 lỗi console, 0 exception, 0 cảnh báo mất tin lúc vào phòng.");
    out("\n🎉 E2E THẬT TÔNG MÔN PASS 100%!\n");
  } catch (e: any) {
    console.error(`\n❌ E2E TÔNG MÔN THẤT BẠI: ${e?.message || e}\n`);
    for (const t of tabs) for (const err of t.errors) console.error(`   [${t.label}] ${err}`);
    process.exitCode = 1;
  } finally {
    for (const t of tabs) t.close();
    if (chrome) {
      try {
        chrome.kill("SIGKILL");
      } catch {
        /* bỏ qua */
      }
    }
    await gameServer.gracefullyShutdown(false).catch(() => {});
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await sleep(500); // Chrome vừa bị kill còn đang đóng tệp
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(chromeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

main();
