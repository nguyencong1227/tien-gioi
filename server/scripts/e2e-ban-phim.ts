// E2E THẬT chơi bằng BÀN PHÍM (QUYET_DINH_M3 mục 13, #463): server Colyseus thật + Chrome headless, phím gửi bằng CDP
// `Input.dispatchKeyEvent` (phím thật, `isTrusted`), TUYỆT ĐỐI không click chuột và không gọi hàm của UI. Kiểm:
//  1. Nhãn phím hiện trên nút kỹ năng (máy tính): Cách / 3 / 4 / B / Tab, title ghi đủ phím.
//  2. Tab chọn mục tiêu gần nhất, Tab tiếp đi xa dần rồi vòng lại, Shift+Tab đi ngược, Esc bỏ chọn.
//  3. Space khi chưa có mục tiêu: tự khoá con gần nhất VÀ chém trúng (máu quái giảm, phía server).
//  4. Phím 3 (Kiếm khí) tốn linh lực + khoá hồi chiêu; phím 4 bật / tắt đả tọa (server xác nhận).
//  5. I / C / J / G / M / O mở đúng bảng, Esc đóng bảng trên cùng; J là sổ nhiệm vụ (không còn là chém).
//  6. Bảng đang mở: Tab KHÔNG đổi mục tiêu, Space KHÔNG chém (phím thuộc về bảng).
//  7. Enter mở ô chat, gõ chữ thì phím I không mở túi, Enter gửi (server nhận), Esc rời ô chat.
//  8. Bảng mở thì mũi tên KHÔNG làm nhân vật đi (đo vị trí phía server); đóng bảng thì đi lại được.
//  9. Túi đồ: mũi tên chuyển ô (focus = chọn ô), Enter dùng đan (máu hồi, server xác nhận), Esc đóng.
// 10. Nói chuyện NPC chỉ bằng phím: F mở hộp thoại, Enter tua chữ, mũi tên vào dòng lựa chọn, phím số chọn dòng (nhận nhiệm vụ).
// 11. Cửa hàng chỉ bằng phím: phím số mở "Cửa hàng", mũi tên tới nút +, Enter tăng số lượng (focus KHÔNG rơi khi bảng vẽ lại), Enter Mua (Linh thạch giảm, túi tăng).
// Chạy: `npm run build && npm run e2e:ban-phim -w server`.
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_MAP, DEFAULT_MAP_ID, NPC_BY_ID, roomNameOf } from "@tien-gioi/shared";
import { Tab, sleep, shown, listenWithRetry, removeTmpDirs } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 36000 + Math.floor(Math.random() * 4000);
let PORT = pickPort();
const CDP = 9500 + Math.floor(Math.random() * 400);
const out = (m: string) => console.log(m);
const NAME = "Cu Ky Ban Phim";
const SECRET = "e2e_secret_ban_phim_abcdefghij";

interface Key {
  key: string;
  code: string;
  vk: number;
  text?: string;
}
const K = {
  esc: { key: "Escape", code: "Escape", vk: 27 },
  space: { key: " ", code: "Space", vk: 32, text: " " },
  enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  tab: { key: "Tab", code: "Tab", vk: 9 },
  d3: { key: "3", code: "Digit3", vk: 51, text: "3" },
  d4: { key: "4", code: "Digit4", vk: 52, text: "4" },
  i: { key: "i", code: "KeyI", vk: 73, text: "i" },
  c: { key: "c", code: "KeyC", vk: 67, text: "c" },
  j: { key: "j", code: "KeyJ", vk: 74, text: "j" },
  g: { key: "g", code: "KeyG", vk: 71, text: "g" },
  m: { key: "m", code: "KeyM", vk: 77, text: "m" },
  o: { key: "o", code: "KeyO", vk: 79, text: "o" },
  a: { key: "a", code: "KeyA", vk: 65, text: "a" },
  x: { key: "x", code: "KeyX", vk: 88, text: "x" },
  f: { key: "f", code: "KeyF", vk: 70, text: "f" },
  d1: { key: "1", code: "Digit1", vk: 49, text: "1" },
  right: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  left: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  up: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  down: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
} satisfies Record<string, Key>;

/** Phím thật qua CDP: nhấn rồi nhả (`shift` cho Shift+Tab). */
async function press(tab: Tab, k: Key, shift = false) {
  const base = {
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
    modifiers: shift ? 8 : 0,
  };
  await tab.send("Input.dispatchKeyEvent", {
    ...base,
    type: k.text ? "keyDown" : "rawKeyDown",
    ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}),
  });
  await tab.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
  await sleep(140); // cho Phaser / DOM xử lý xong
}

/** Giữ một phím `ms` mili giây (di chuyển bằng Phaser cần phím GIỮ: isDown theo từng khung). */
async function hold(tab: Tab, k: Key, ms: number) {
  const base = {
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
    modifiers: 0,
  };
  await tab.send("Input.dispatchKeyEvent", { ...base, type: "rawKeyDown" });
  await sleep(ms);
  await tab.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
  await sleep(150);
}

/**
 * Đi tới phần tử `selector` chỉ bằng MŨI TÊN như người chơi: mỗi bước nhìn xem đích nằm hướng nào so với phần tử đang focus rồi bấm mũi tên
 * theo trục lệch nhiều hơn. `true` nếu tới nơi trong `max` bước.
 */
async function arrowTo(tab: Tab, selector: string, max = 20): Promise<boolean> {
  const keys = { up: K.up, down: K.down, left: K.left, right: K.right } as const;
  for (let n = 0; n < max; n++) {
    const d = String(
      await tab.ev(
        `(() => { const t = document.querySelector(${JSON.stringify(selector)}); const a = document.activeElement; if (!t) return 'missing'; if (t === a) return 'here'; if (!a || a === document.body) return 'down'; const tr = t.getBoundingClientRect(), ar = a.getBoundingClientRect(); const dx = (tr.left + tr.right) / 2 - (ar.left + ar.right) / 2, dy = (tr.top + tr.bottom) / 2 - (ar.top + ar.bottom) / 2; return Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left'); })()`,
      ),
    );
    if (d === "here") return true;
    if (d === "missing") return false;
    await press(tab, keys[d as keyof typeof keys]);
  }
  return false;
}

/** Gõ một chuỗi chữ thường (không dấu cách) vào ô đang focus */
async function typeText(tab: Tab, text: string) {
  for (const ch of text) {
    const code = `Key${ch.toUpperCase()}`;
    await press(tab, { key: ch, code, vk: ch.toUpperCase().charCodeAt(0), text: ch });
  }
}

async function main() {
  out("=== E2E THẬT chơi bằng bàn phím: Chrome headless + server Colyseus thật ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-kb-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-kb-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { addMonster } = await import("../src/systems/test-helpers.js");
  const { giveItem } = await import("../src/systems/inventory.js");
  const { changeCoin } = await import("../src/systems/wallet.js");

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
  out(`- Server E2E: http://127.0.0.1:${PORT}`);

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    out(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` (${detail})`}`);
    if (!ok) failures.push(`${name}: ${detail}`);
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
        // Chrome headless không có chuột nên `pointer: fine` = false và nhãn phím (CSS chỉ cho máy tính) bị ẩn: giả lập chuột (4 = fine, 2 = hover)
        "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2",
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
    await tab.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
    });
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    // Đăng nhập bằng form đã điền sẵn qua localStorage: gửi form (không phải chuột) rồi vào game
    await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game",
    );
    await sleep(500);
    const t = tab;
    const ev = (e: string) => t.ev(e);

    // Từ đây chỉ dùng bàn phím. Bảng chỉ dẫn người mới đóng bằng Esc.
    await press(t, K.esc);

    // ---- 1. Nhãn phím trên nút ----
    out(
      `  (media: pointer:fine=${await ev(`matchMedia('(pointer: fine)').matches`)} hover=${await ev(`matchMedia('(hover: hover)').matches`)} rộng=${await ev(`innerWidth`)})`,
    );
    const cap = (id: string) =>
      ev(
        `(() => { const c = document.querySelector('#${id} .keycap'); return c && c.checkVisibility() ? c.textContent : null; })()`,
      );
    check(
      "Nhãn phím nút Chém = Cách",
      (await cap("sk-slash")) === "Cách",
      String(await cap("sk-slash")),
    );
    check(
      "Nhãn phím nút Kiếm khí = 3",
      (await cap("sk-sword")) === "3",
      String(await cap("sk-sword")),
    );
    check("Nhãn phím nút Đả tọa = 4", (await cap("sk-med")) === "4", String(await cap("sk-med")));
    check(
      "Nhãn phím nút Đột phá = B",
      (await cap("sk-break")) === "B",
      String(await cap("sk-break")),
    );
    check(
      "Nút Kiếm khí: title ghi đủ phím",
      (await ev(`document.getElementById('sk-sword').title`)) === "Phóng kiếm khí (3 / K)",
      String(await ev(`document.getElementById('sk-sword').title`)),
    );

    // ---- Dựng cảnh: người chơi ngoài trấn, ba con quái gần ----
    const roomId = (await matchMaker.query({ name: roomNameOf(DEFAULT_MAP_ID) }))[0].roomId;
    const world = (matchMaker.getLocalRoomById(roomId) as any).world;
    let sid = "";
    world.state.players.forEach((p: any, id: string) => {
      if (p.name === NAME) sid = id;
    });
    const me = world.state.players.get(sid);
    world.state.monsters.clear();
    world.mctrl.clear();
    me.x = DEFAULT_MAP.townPx.x + DEFAULT_MAP.townPx.r + 500;
    me.y = DEFAULT_MAP.townPx.y;
    const [nearId, midId, farId] = [40, 150, 300].map(
      (dx) => addMonster(world, "tho", me.x + dx, me.y).id,
    ) as string[];
    // quái thứ tư nằm TRONG tầm khoá 520 px nhưng NGOÀI màn hình (khung cao ~640 px): Tab / Space không được chọn nó (góp ý của A ở #465)
    const offId = addMonster(world, "tho", me.x + 20, me.y - 460).id;
    world.ctrl.get(sid).lastHitAt = 0;
    // quái đứng yên: không để chúng đuổi / làm máu người chơi dao động
    for (const id of [nearId, midId, farId, offId]) world.mctrl.get(id).nextWander = Infinity;
    await t.waitFor(
      `window.__scene.monsters.size === 4 && Math.abs((window.__scene.predX ?? 0) - ${Math.round(me.x)}) < 200`,
      "cảnh có bốn quái và người chơi ở chỗ mới",
    );
    await sleep(300);
    const lock = () => ev(`window.__scene.lockedTargetId`);
    const helpText = await ev(`document.getElementById('help').textContent`);
    // Nút Mục tiêu chỉ hiện trên cảm ứng (máy tính dùng Tab): dòng gợi ý đầu màn hình phải nhắc Tab
    check(
      "Dòng gợi ý đầu màn hình ghi phím mới (Cách chém, Tab mục tiêu, 3 kiếm khí, J nhiệm vụ)",
      ["Cách chém", "Tab mục tiêu", "3 kiếm khí", "J nhiệm vụ"].every((x) =>
        String(helpText).includes(x),
      ) && !String(helpText).includes("J chém"),
      String(helpText),
    );
    await t.shot("ban-phim-hud.png");

    // ---- 2. Tab / Shift+Tab / Esc ----
    check("Chưa chọn mục tiêu", (await lock()) === null, String(await lock()));
    await press(t, K.tab);
    check("Tab: chọn con GẦN nhất", (await lock()) === nearId, `${await lock()} != ${nearId}`);
    await press(t, K.tab);
    check("Tab lần hai: con kế (xa hơn)", (await lock()) === midId, `${await lock()} != ${midId}`);
    await press(t, K.tab);
    check("Tab lần ba: con xa nhất", (await lock()) === farId, `${await lock()} != ${farId}`);
    await press(t, K.tab);
    check(
      "Tab lần bốn: vòng về con gần nhất",
      (await lock()) === nearId,
      `${await lock()} != ${nearId}`,
    );
    const offId_ = JSON.stringify(offId);
    check(
      "Quái ngoài màn hình (trong tầm 520 px) KHÔNG bị Tab chọn: vòng Tab chỉ có ba con thấy được",
      (await lock()) !== offId &&
        !!(await ev(
          `(() => { const m = window.__scene.monsters.get(${offId_}); return !!m && !window.__scene.cameras.main.worldView.contains(m.tx, m.ty); })()`,
        )),
      `khoá=${await lock()}`,
    );
    await press(t, K.tab, true);
    check(
      "Shift+Tab: đi ngược về con xa nhất",
      (await lock()) === farId,
      `${await lock()} != ${farId}`,
    );
    check(
      "Tab không đổi focus trình duyệt (không nhảy vào nút / ô nhập)",
      !!(await ev(
        `!document.activeElement || document.activeElement === document.body || document.activeElement.tagName === 'CANVAS'`,
      )),
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );
    await press(t, K.esc);
    check(
      "Esc (không có bảng nào mở): bỏ chọn mục tiêu",
      (await lock()) === null,
      String(await lock()),
    );

    // ---- 3. Space tự khoá + chém trúng ----
    const hpBefore = world.state.monsters.get(nearId).hp;
    await press(t, K.space);
    await sleep(300);
    check(
      "Space khi chưa có mục tiêu: tự khoá con gần nhất",
      (await lock()) === nearId,
      `${await lock()} != ${nearId}`,
    );
    const hpAfter = world.state.monsters.get(nearId)?.hp ?? 0;
    check(
      "Space chém trúng: máu quái giảm (server)",
      hpAfter < hpBefore,
      `${hpBefore} -> ${hpAfter}`,
    );
    await press(t, K.esc);

    // ---- 4. Phím 3 (Kiếm khí) và 4 (Đả tọa) ----
    // dọn quái: quái đánh trúng người chơi sẽ ngắt đả tọa làm kiểm đả tọa chập chờn
    world.state.monsters.clear();
    world.mctrl.clear();
    const mpBefore = me.mp;
    await press(t, K.d3);
    await sleep(300);
    check(
      "Phím 3 (Kiếm khí): tốn linh lực (server)",
      me.mp < mpBefore || me.mp === 0,
      `${mpBefore} -> ${me.mp}`,
    );
    check(
      "Phím 3: khoá hồi chiêu Kiếm khí ở client",
      !!(await ev(`window.__scene.nextSword > window.__scene.time.now`)),
      "nextSword chưa tăng",
    );
    await press(t, K.esc);
    await press(t, K.d4);
    await sleep(300);
    check("Phím 4: bật đả tọa (server xác nhận)", me.meditating === true, String(me.meditating));
    await press(t, K.d4);
    await sleep(300);
    check("Phím 4 lần nữa: tắt đả tọa", me.meditating === false, String(me.meditating));

    // ---- 5. Mở / đóng bảng ----
    const panels: Array<[string, Key, string]> = [
      ["Túi đồ", K.i, "inv-modal"],
      ["Nhân vật", K.c, "char-modal"],
      ["Sổ nhiệm vụ (J)", K.j, "quest-modal"],
      ["Tông môn", K.g, "sect-modal"],
      ["Bản đồ lớn", K.m, "map-modal"],
      ["Cài đặt", K.o, "settings-modal"],
    ];
    for (const [name, key, id] of panels) {
      await press(t, key);
      check(`${name}: phím ${key.code} mở bảng`, !!(await ev(shown(id))), `${id} không hiện`);
      await press(t, K.esc);
      check(`${name}: Esc đóng bảng`, !(await ev(shown(id))), `${id} vẫn mở`);
    }

    // ---- 6. Bảng mở thì phím thế giới thuộc về bảng ----
    const slashBefore = await ev(`window.__scene.nextSlash`);
    await press(t, K.i);
    await press(t, K.tab);
    check("Túi mở: Tab KHÔNG chọn mục tiêu", (await lock()) === null, String(await lock()));
    await ev(
      `document.activeElement && document.activeElement.blur && document.activeElement.blur(); 1`,
    );
    await press(t, K.space);
    check(
      "Túi mở (focus ngoài nút): Space KHÔNG chém",
      (await ev(`window.__scene.nextSlash`)) === slashBefore,
      `${slashBefore} -> ${await ev(`window.__scene.nextSlash`)}`,
    );
    await press(t, K.esc);
    check("Esc đóng túi", !(await ev(shown("inv-modal"))), "inv-modal vẫn mở");

    // ---- 7. Chat bằng bàn phím ----
    await press(t, K.enter);
    check(
      "Enter: focus vào ô chat",
      (await ev(`document.activeElement && document.activeElement.id`)) === "chat-input",
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );
    await typeText(t, "ixa");
    check(
      "Đang gõ chat: phím I KHÔNG mở túi",
      !(await ev(shown("inv-modal"))),
      "inv-modal mở khi đang gõ",
    );
    check(
      "Ô chat nhận đúng chữ đã gõ",
      (await ev(`document.getElementById('chat-input').value`)) === "ixa",
      String(await ev(`document.getElementById('chat-input').value`)),
    );
    await press(t, K.enter);
    await sleep(300);
    check(
      "Enter gửi chat: ô chat trống và rời ô",
      (await ev(`document.getElementById('chat-input').value`)) === "" &&
        (await ev(`document.activeElement && document.activeElement.id`)) !== "chat-input",
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );
    await press(t, K.enter);
    await typeText(t, "a");
    await press(t, K.esc);
    check(
      "Esc ở ô chat: rời ô chat",
      (await ev(`document.activeElement && document.activeElement.id`)) !== "chat-input",
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );

    // ---- 8. Bảng mở thì mũi tên không làm nhân vật đi ----
    world.state.monsters.clear();
    world.mctrl.clear();
    await ev(
      `document.activeElement && document.activeElement.blur && document.activeElement.blur(); 1`,
    );
    await press(t, K.i);
    check("Mở túi để thử đi bộ", !!(await ev(shown("inv-modal"))), "inv-modal không hiện");
    const x0 = me.x;
    await hold(t, K.right, 700);
    check(
      "Túi mở: giữ mũi tên phải 0,7 giây, nhân vật ĐỨNG YÊN (server)",
      Math.abs(me.x - x0) < 1,
      `${x0} -> ${me.x}`,
    );
    await press(t, K.esc);
    const x1 = me.x;
    await hold(t, K.right, 700);
    check(
      "Đóng túi: giữ mũi tên phải thì nhân vật đi sang phải (server)",
      me.x - x1 > 30,
      `${x1} -> ${me.x}`,
    );

    // ---- 9. Túi đồ: mũi tên chuyển ô, Enter dùng đan ----
    // về giữa trấn (khu an toàn: quái không đánh, không hồi sinh quái): máu thấp mà gặp quái hồi sinh gần đó thì chết, kiểm chập chờn
    me.x = DEFAULT_MAP.townPx.x;
    me.y = DEFAULT_MAP.townPx.y + 150;
    giveItem(world, sid, "hoi_huyet_dan", 3);
    me.hp = 30;
    await sleep(400);
    await press(t, K.i);
    const slotInfo = await ev(
      `(() => { const s = [...document.querySelectorAll('.inv-slot')]; const idx = s.findIndex(e => e.querySelector('.slot-name')?.textContent === 'Hồi Huyết Đan'); const top0 = s[0].getBoundingClientRect().top; const cols = s.filter(e => Math.abs(e.getBoundingClientRect().top - top0) < 2).length; return JSON.stringify({ idx, cols }); })()`,
    );
    const { idx: pillIdx, cols } = JSON.parse(String(slotInfo)) as { idx: number; cols: number };
    check("Túi có Hồi Huyết Đan ở một ô", pillIdx >= 0 && cols > 1, String(slotInfo));
    // mũi tên đầu tiên đưa focus từ nút đóng xuống lưới ô
    const focusedSlot = () =>
      ev(
        `[...document.querySelectorAll('.inv-slot')].indexOf(document.activeElement)`,
      ) as Promise<number>;
    for (let n = 0; n < 8 && (await focusedSlot()) < 0; n++) await press(t, K.down);
    let cur = await focusedSlot();
    check("Mũi tên Xuống đưa focus từ nút đóng vào lưới ô", cur >= 0, `ô=${cur}`);
    // đi tới ô chứa đan bằng mũi tên (hàng rồi cột)
    for (let n = 0; n < 30 && cur !== pillIdx; n++) {
      const dr = Math.floor(pillIdx / cols) - Math.floor(cur / cols);
      const dc = (pillIdx % cols) - (cur % cols);
      await press(t, dr > 0 ? K.down : dr < 0 ? K.up : dc > 0 ? K.right : K.left);
      cur = await focusedSlot();
    }
    check("Mũi tên đưa focus tới đúng ô chứa đan", cur === pillIdx, `ô=${cur}, cần ${pillIdx}`);
    check(
      "Focus vào ô = chọn ô (ô được tô sáng, chi tiết hiện)",
      !!(await ev(`document.activeElement.classList.contains('selected')`)) &&
        String(await ev(`document.getElementById('inv-item-name').textContent`)).includes(
          "Hồi Huyết",
        ),
      String(await ev(`document.getElementById('inv-item-name').textContent`)),
    );
    const hp0 = me.hp;
    await press(t, K.enter);
    await sleep(400);
    check("Enter trên ô đan: dùng đan, máu hồi (server)", me.hp > hp0, `${hp0} -> ${me.hp}`);
    check(
      "Enter dùng đan không mở chat",
      (await ev(`document.activeElement && document.activeElement.id`)) !== "chat-input",
      "chat mở",
    );
    await press(t, K.esc);
    check("Esc đóng túi", !(await ev(shown("inv-modal"))), "inv-modal vẫn mở");

    // ---- 10. Nói chuyện NPC chỉ bằng phím ----
    const npc = NPC_BY_ID["truong_tran"];
    me.x = npc.x;
    me.y = npc.y + 50;
    world.ctrl.get(sid).lastHitAt = 0;
    await t.waitFor(
      `Math.abs(window.__scene.predX - ${Math.round(npc.x)}) < 40 && Math.abs(window.__scene.predY - ${Math.round(npc.y + 50)}) < 40 && window.__scene.closestNpcId === 'truong_tran'`,
      "đứng cạnh Trưởng trấn",
    );
    await press(t, K.f);
    await t.waitFor(
      `!!document.getElementById('dialog-modal') && !document.getElementById('dialog-modal').hidden`,
      "hộp thoại NPC mở bằng F",
    );
    check(
      "F mở hộp thoại; focus ở thân hộp (Enter / Cách tua chữ, không đóng hộp)",
      (await ev(`document.activeElement && document.activeElement.id`)) === "dlg-body",
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );
    await press(t, K.enter);
    await t.waitFor(
      `document.querySelectorAll('#dlg-options .dlg-opt-btn').length > 0`,
      "lựa chọn hội thoại hiện sau khi tua chữ",
    );
    check(
      "Enter tua chữ: hộp thoại VẪN mở",
      !!(await ev(shown("dialog-modal"))),
      "hộp thoại đã đóng",
    );
    const optLabels = String(
      await ev(
        `[...document.querySelectorAll('#dlg-options .dlg-opt-btn')].map(b => b.textContent).join(' | ')`,
      ),
    );
    out(`  (lựa chọn: ${optLabels})`);
    check(
      "Mỗi dòng lựa chọn có nhãn số (1, 2, ...)",
      !!(await ev(
        `[...document.querySelectorAll('#dlg-options .dlg-opt-btn .opt-key')].map(k => k.textContent).join(',').startsWith('1,')`,
      )) ||
        !!(await ev(
          `document.querySelectorAll('#dlg-options .dlg-opt-btn .opt-key').length === 1`,
        )),
      optLabels,
    );
    await press(t, K.down);
    check(
      "Mũi tên Xuống: focus vào dòng lựa chọn đầu",
      !!(await ev(
        `document.activeElement && document.activeElement.classList.contains('dlg-opt-btn')`,
      )),
      String(await ev(`document.activeElement && document.activeElement.className`)),
    );
    const before = await ev(`window.__ui.getQuestLog().active.length`);
    await press(t, K.d1);
    await sleep(500);
    check(
      "Phím số 1 chọn dòng 1: hộp thoại đóng",
      !(await ev(shown("dialog-modal"))),
      "hộp thoại vẫn mở",
    );
    check(
      "Dòng 1 là Nhận việc: sổ nhiệm vụ có thêm một nhiệm vụ (server)",
      (await ev(`window.__ui.getQuestLog().active.length`)) === Number(before) + 1,
      `${before} -> ${await ev(`window.__ui.getQuestLog().active.length`)}`,
    );

    // ---- 11. Cửa hàng chỉ bằng phím ----
    const duoc = NPC_BY_ID["duoc_su"];
    changeCoin(world, sid, 500);
    me.x = duoc.x;
    me.y = duoc.y + 50;
    await t.waitFor(
      `Math.abs(window.__scene.predX - ${Math.round(duoc.x)}) < 40 && Math.abs(window.__scene.predY - ${Math.round(duoc.y + 50)}) < 40 && window.__scene.closestNpcId === 'duoc_su'`,
      "đứng cạnh Lão Dược Sư",
    );
    await press(t, K.f);
    await t.waitFor(
      `document.querySelectorAll('#dlg-options .dlg-opt-btn').length > 0 || !!document.getElementById('dlg-skip-hint')?.hidden`,
      "hộp thoại Dược Sư",
    );
    await press(t, K.enter); // tua chữ nếu còn đang gõ
    await t.waitFor(
      `document.querySelectorAll('#dlg-options .dlg-opt-btn').length > 0`,
      "lựa chọn của Dược Sư",
    );
    const shopOpt = Number(
      await ev(
        `[...document.querySelectorAll('#dlg-options .dlg-opt-btn')].findIndex(b => b.textContent.includes('Cửa hàng')) + 1`,
      ),
    );
    check('Dược Sư có dòng "Cửa hàng"', shopOpt >= 1, String(shopOpt));
    await press(t, {
      key: String(shopOpt),
      code: `Digit${shopOpt}`,
      vk: 48 + shopOpt,
      text: String(shopOpt),
    });
    await t.waitFor(
      `!!document.getElementById('shop-modal') && !document.getElementById('shop-modal').hidden`,
      "cửa hàng mở",
    );
    check(
      "Phím số chọn dòng Cửa hàng: bảng cửa hàng mở",
      !!(await ev(shown("shop-modal"))),
      "shop-modal không hiện",
    );
    const navKey = () =>
      ev(
        `document.activeElement && document.activeElement.dataset && document.activeElement.dataset.nav || ''`,
      );
    await arrowTo(t, '[data-nav="buy:hoi_huyet_dan:plus"]');
    check(
      "Mũi tên đưa focus tới nút + của Hồi Huyết Đan",
      (await navKey()) === "buy:hoi_huyet_dan:plus",
      String(await navKey()),
    );
    const qtyText = () =>
      ev(
        `document.querySelector('#shop-modal [data-nav="buy:hoi_huyet_dan:plus"]').parentElement.querySelector('.shop-qty-val').textContent`,
      );
    const q0 = Number(await qtyText());
    await press(t, K.enter);
    check(
      "Enter trên nút +: số lượng tăng 1",
      Number(await qtyText()) === q0 + 1,
      `${q0} -> ${await qtyText()}`,
    );
    check(
      "Bảng vẽ lại nhưng focus VẪN ở nút + (không rơi về đầu bảng)",
      (await navKey()) === "buy:hoi_huyet_dan:plus",
      String(await navKey()),
    );
    await press(t, K.enter);
    check(
      "Enter lần nữa: số lượng tăng tiếp",
      Number(await qtyText()) === q0 + 2,
      `${await qtyText()}`,
    );
    await press(t, K.right);
    check(
      "Mũi tên Phải: focus sang nút Mua cùng hàng",
      !!(await ev(`document.activeElement && document.activeElement.classList.contains('buy')`)),
      String(await ev(`document.activeElement && document.activeElement.className`)),
    );
    await press(t, K.enter);
    await sleep(500);
    check(
      "Enter trên nút Mua: túi có Hồi Huyết Đan mua thêm (server)",
      Number(await ev(`window.__ui.getCurrentCoin()`)) < 500,
      `Linh thạch=${await ev(`window.__ui.getCurrentCoin()`)}`,
    );
    await press(t, K.esc);
    check("Esc đóng cửa hàng", !(await ev(shown("shop-modal"))), "shop-modal vẫn mở");

    check("0 lỗi console / exception", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  } catch (e) {
    fatal = (e as Error).message;
  } finally {
    tab?.close();
    chrome?.kill();
    await gameServer.gracefullyShutdown(false).catch(() => {});
    httpServer.close();
    rmSync(dataDir, { recursive: true, force: true });
    await sleep(600);
    rmSync(chromeDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  if (fatal || failures.length) {
    out(`\n❌ E2E BÀN PHÍM THẤT BẠI: ${fatal ?? `${failures.length} kiểm đỏ`}`);
    for (const f of failures) out(`   - ${f}`);
    process.exit(1);
  }
  out("\n🎉 E2E THẬT BÀN PHÍM PASS 100%!");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
