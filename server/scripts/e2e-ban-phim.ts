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
import {
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  DUEL_MSG,
  DUNGEON_MSG,
  NPC_BY_ID,
  SECT_MSG,
  roomNameOf,
} from "@tien-gioi/shared";
import { Tab, sleep, shown, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 36000 + Math.floor(Math.random() * 4000);
let PORT = pickPort();
const CDP = 9500 + Math.floor(Math.random() * 400);
const out = (m: string) => console.log(m);
const NAME = "Cu Ky Ban Phim";
const SECRET = "e2e_secret_ban_phim_abcdefghij";
const NAME_B = "Dong Dao Phu";
const SECRET_B = "e2e_secret_ban_phim_phu_abcdefg";

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
  w: { key: "w", code: "KeyW", vk: 87, text: "w" },
  x: { key: "x", code: "KeyX", vk: 88, text: "x" },
  y: { key: "y", code: "KeyY", vk: 89, text: "y" },
  r: { key: "r", code: "KeyR", vk: 82, text: "r" },
  p: { key: "p", code: "KeyP", vk: 80, text: "p" },
  v: { key: "v", code: "KeyV", vk: 86, text: "v" },
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
  const { spawnLoot } = await import("../src/systems/loot.js");
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
  let tabB: Tab | null = null;
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
        ...getChromeGpuFlags(),
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
    await t.waitFor(
      `!document.getElementById('btn-talk').hidden`,
      "nút Nói chuyện hiện khi đứng cạnh NPC",
    );
    await sleep(150);
    check(
      "Nút Nói chuyện (nhãn M6 chỉ còn tên ngắn) có nhãn phím F ở góc nút",
      (await cap("btn-talk")) === "F",
      String(await cap("btn-talk")),
    );
    await t.shot("ban-phim-nut-noi-chuyen.png");
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

    // ---- 11. Màn Phím tắt: mở từ Cài đặt, đổi phím, hoán đổi, khôi phục, tất cả bằng bàn phím ----
    const textOf = (sel: string) =>
      ev(
        `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : null; })()`,
      );
    const swordBtn = '#keys-list button[data-action="skill.sword"]';
    const medBtn = '#keys-list button[data-action="skill.meditate"]';
    const rowChips = (action: string) =>
      ev(
        `(() => { const b = document.querySelector('#keys-list button[data-action="${action}"]'); return b ? [...b.closest('.keys-row').querySelectorAll('.key-chip')].map((c) => c.textContent).join(',') : null; })()`,
      );
    const openKeys = async () => {
      await press(t, K.o);
      await arrowTo(t, "#set-open-keys", 12);
      await press(t, K.enter);
    };
    // cảm ứng không đổi: nút / dòng mở màn Phím tắt ẩn khi đang dùng cảm ứng (data-input="touch"), hiện khi dùng chuột / bàn phím
    const keysUiDisplay = (input: string) =>
      ev(
        `(() => { const old = document.documentElement.dataset.input; document.documentElement.dataset.input = ${JSON.stringify(input)}; const r = ['set-keys-row', 'newbie-btn-keys'].map((id) => getComputedStyle(document.getElementById(id)).display).join(','); if (old === undefined) delete document.documentElement.dataset.input; else document.documentElement.dataset.input = old; return r; })()`,
      );
    const touchDisplay = String(await keysUiDisplay("touch"));
    const mouseDisplay = String(await keysUiDisplay("mouse"));
    check(
      "Cảm ứng: dòng mở Phím tắt (Cài đặt) và nút 'Xem tất cả phím tắt' (chỉ dẫn) ẨN; chuột / bàn phím thì hiện",
      touchDisplay === "none,none" && !mouseDisplay.includes("none"),
      `touch=${touchDisplay} mouse=${mouseDisplay}`,
    );
    await openKeys();
    check(
      "O mở Cài đặt, mũi tên + Enter trên 'Xem và đổi phím tắt' mở màn Phím tắt",
      !!(await ev(shown("keys-modal"))) && !!(await ev(shown("settings-modal"))),
      `keys=${await ev(shown("keys-modal"))} settings=${await ev(shown("settings-modal"))}`,
    );
    check(
      "Màn Phím tắt liệt kê đủ hành động (>= 15 dòng) và phím cố định",
      Number(await ev(`document.querySelectorAll('#keys-list .keys-row').length`)) >= 15 &&
        Number(await ev(`document.querySelectorAll('#keys-fixed-list li').length`)) >= 4,
      String(await ev(`document.querySelectorAll('#keys-list .keys-row').length`)),
    );
    check(
      "Dòng Kiếm khí ghi phím 3 và K",
      (await rowChips("skill.sword")) === "3,K",
      String(await rowChips("skill.sword")),
    );
    check(
      "Mũi tên tới nút 'Đổi phím' của Kiếm khí",
      await arrowTo(t, swordBtn, 40),
      String(await ev(`document.activeElement && document.activeElement.outerHTML.slice(0, 80)`)),
    );
    await press(t, K.enter);
    check(
      "Enter: nút chuyển sang 'Bấm phím mới...' và dòng trạng thái báo đang chờ",
      !!(await ev(
        `document.querySelector(${JSON.stringify(swordBtn)}).classList.contains('waiting')`,
      )) && String(await textOf("#keys-status")).includes("Đang đổi phím"),
      String(await textOf("#keys-status")),
    );
    await t.shot("ban-phim-phim-tat-cho.png");
    await press(t, K.w);
    check(
      "Bấm W (phím cố định): bị từ chối, vẫn chờ, không đổi phím nào",
      String(await textOf("#keys-status")).includes("cố định") &&
        !!(await ev(
          `document.querySelector(${JSON.stringify(swordBtn)}).classList.contains('waiting')`,
        )) &&
        (await rowChips("skill.sword")) === "3,K",
      `${await textOf("#keys-status")} | ${await rowChips("skill.sword")}`,
    );
    await press(t, K.esc);
    check(
      "Esc khi đang chờ phím: chỉ huỷ việc đổi, màn Phím tắt VẪN mở",
      !!(await ev(shown("keys-modal"))) &&
        !(await ev(
          `document.querySelector(${JSON.stringify(swordBtn)}).classList.contains('waiting')`,
        )) &&
        (await rowChips("skill.sword")) === "3,K",
      `keys=${await ev(shown("keys-modal"))}`,
    );
    check(
      "Sau khi huỷ, focus vẫn ở nút 'Đổi phím' của Kiếm khí",
      (await ev(`document.activeElement && document.activeElement.dataset.action`)) ===
        "skill.sword",
      String(await ev(`document.activeElement && document.activeElement.dataset.action`)),
    );
    await press(t, K.enter);
    await press(t, K.v);
    check(
      "Bấm V: Kiếm khí đổi sang V (giữ 3 và K làm phím phụ)",
      (await rowChips("skill.sword")) === "V,3,K" &&
        String(await textOf("#keys-status")).includes("Kiếm khí: V"),
      `${await rowChips("skill.sword")} | ${await textOf("#keys-status")}`,
    );
    check(
      "Nhãn phím trên nút Kiếm khí đổi theo thành V; lưu vào localStorage",
      (await cap("sk-sword")) === "V" &&
        String(await ev(`localStorage.getItem('tg_keymap')`)).includes("KeyV"),
      `${await cap("sk-sword")} | ${await ev(`localStorage.getItem('tg_keymap')`)}`,
    );
    await t.shot("ban-phim-phim-tat-da-doi.png");
    check(
      "Chữ hướng dẫn tĩnh (bảng chỉ dẫn người mới, Cài đặt) đổi theo phím mới",
      (await textOf('#newbie-guide-modal [data-key-action="skill.sword"]')) === "V",
      String(await textOf('#newbie-guide-modal [data-key-action="skill.sword"]')),
    );
    // lấy phím DUY NHẤT của đan ô 1 (phím 1) cho Đả tọa: hai hành động đổi chỗ, không ai mất phím
    await arrowTo(t, medBtn, 40);
    await press(t, K.enter);
    await press(t, K.d1);
    check(
      "Đả tọa lấy phím 1: HOÁN ĐỔI, đan ô 1 nhận phím 4 (không hành động nào mất phím)",
      (await cap("sk-med")) === "1" &&
        (await ev(`document.querySelector('#quick-1 .qkey').textContent`)) === "4" &&
        String(await textOf("#keys-status")).includes("đổi sang 4"),
      `${await cap("sk-med")} | ${await ev(`document.querySelector('#quick-1 .qkey').textContent`)} | ${await textOf("#keys-status")}`,
    );
    await press(t, K.esc);
    check(
      "Esc đóng riêng màn Phím tắt, Cài đặt vẫn mở, focus về nút mở màn Phím tắt",
      !(await ev(shown("keys-modal"))) &&
        !!(await ev(shown("settings-modal"))) &&
        (await ev(`document.activeElement && document.activeElement.id`)) === "set-open-keys",
      `keys=${await ev(shown("keys-modal"))} settings=${await ev(shown("settings-modal"))} focus=${await ev(`document.activeElement && document.activeElement.id`)}`,
    );
    await press(t, K.esc);
    check("Esc đóng Cài đặt", !(await ev(shown("settings-modal"))), "settings-modal vẫn mở");
    // phím mới có tác dụng trong game: V phóng Kiếm khí (server trừ linh lực)
    me.mp = me.maxMp;
    const mpX = me.mp;
    await press(t, K.v);
    await sleep(300);
    check("Phím V mới: phóng Kiếm khí (server trừ linh lực)", me.mp < mpX, `${mpX} -> ${me.mp}`);
    // khôi phục mặc định
    await openKeys();
    await arrowTo(t, "#keys-reset", 40);
    await press(t, K.enter);
    check(
      "'Khôi phục phím mặc định': Kiếm khí về 3 / K, Đả tọa về 4, đan ô 1 về 1, xoá khỏi localStorage",
      (await rowChips("skill.sword")) === "3,K" &&
        (await cap("sk-sword")) === "3" &&
        (await cap("sk-med")) === "4" &&
        (await ev(`document.querySelector('#quick-1 .qkey').textContent`)) === "1" &&
        (await ev(`localStorage.getItem('tg_keymap')`)) === null,
      `${await rowChips("skill.sword")} | ${await cap("sk-sword")} | ${await cap("sk-med")} | ${await ev(`localStorage.getItem('tg_keymap')`)}`,
    );
    await press(t, K.esc);
    await press(t, K.esc);
    me.mp = me.maxMp;
    const mpFull = me.mp;
    await press(t, K.v);
    await sleep(300);
    check(
      "Sau khi khôi phục: phím V không còn phóng Kiếm khí",
      me.mp === mpFull,
      `${mpFull} -> ${me.mp}`,
    );

    // ---- 12. Lời mời, xác nhận rời / đầu hàng, tấm kết quả: chỉ bằng phím (Y nhận, X từ chối, R rời) ----
    // Chặn room.send để ghi lại tin gửi server (lời mời giả lập phía client, server không có lời mời thật nên bỏ qua tin).
    await ev(
      `(() => { const r = window.__scene.room; window.__sent = []; const o = r.send.bind(r); r.send = (t, m) => { window.__sent.push([t, m]); return o(t, m); }; return 1; })()`,
    );
    const sentList = async (): Promise<Array<[string, any]>> =>
      (
        JSON.parse(String(await ev(`JSON.stringify(window.__sent)`))) as Array<[string, any]>
      ).filter(
        ([ty]) => ty !== "ping", // nhịp tim tự gửi, không phải tin do phím
      );
    const clearSent = () => ev(`window.__sent.length = 0; 1`);
    const vis = async (id: string) =>
      !!(await ev(
        `(() => { const e = document.getElementById('${id}'); return !!e && !e.closest('[hidden]'); })()`,
      ));
    const sentHas = async (type: string, payload: unknown) =>
      (await sentList()).some(
        ([ty, m]) => ty === type && JSON.stringify(m) === JSON.stringify(payload),
      );
    await press(t, K.esc); // bỏ focus / bảng còn sót

    await ev(`window.__ui.onPartyInvited({ from: 'Dao Huu A', ttlMs: 30000 }); 1`);
    check("Lời mời tổ đội hiện (nút Nhận có chip phím Y)", await vis("pib-btn-accept"), "hộp ẩn");
    check(
      "Chip phím trên nút Nhận / Từ chối là Y / X",
      (await textOf("#pib-btn-accept .btn-key")) === "Y" &&
        (await textOf("#pib-btn-decline .btn-key")) === "X",
      `${await textOf("#pib-btn-accept .btn-key")} / ${await textOf("#pib-btn-decline .btn-key")}`,
    );
    await press(t, K.y);
    check(
      "Y: nhận lời mời tổ đội (gửi partyAccept, hộp ẩn)",
      (await sentHas("partyAccept", { from: "Dao Huu A" })) && !(await vis("pib-btn-accept")),
      JSON.stringify(await sentList()),
    );
    await clearSent();
    // nút ưu tiên cao hơn đang bị vô hiệu (disabled) thì Y bỏ qua nó, sang hộp kế (nit của A ở #470): thách đấu bị khoá, tổ đội còn dùng được
    await ev(
      `window.__ui.onDuelInvited({ from: 'Dao Huu D2', ttlMs: 30000 }); document.getElementById('duib-btn-accept').disabled = true; window.__ui.onPartyInvited({ from: 'Dao Huu Z', ttlMs: 30000 }); 1`,
    );
    await press(t, K.y);
    check(
      "Nút Nhận thách đấu đang disabled: Y bỏ qua, nhận lời mời tổ đội kế tiếp",
      (await sentHas("partyAccept", { from: "Dao Huu Z" })) &&
        !(await sentHas(DUEL_MSG.accept, { from: "Dao Huu D2" })),
      JSON.stringify(await sentList()),
    );
    await ev(`document.getElementById('duib-btn-accept').disabled = false; 1`);
    await press(t, K.x); // từ chối lời thách đấu D2 cho sạch
    await clearSent();
    await ev(`window.__ui.onPartyInvited({ from: 'Dao Huu B', ttlMs: 30000 }); 1`);
    await press(t, K.x);
    check(
      "X: từ chối lời mời tổ đội (gửi partyDecline, hộp ẩn)",
      (await sentHas("partyDecline", { from: "Dao Huu B" })) && !(await vis("pib-btn-accept")),
      JSON.stringify(await sentList()),
    );
    await clearSent();

    // hai lời mời cùng lúc: thách đấu (gấp hơn) được trả lời trước, rồi mới tới tổ đội
    await ev(
      `window.__ui.onPartyInvited({ from: 'Dao Huu C', ttlMs: 30000 }); window.__ui.onDuelInvited({ from: 'Dao Huu D', ttlMs: 30000 }); 1`,
    );
    check(
      "Thách đấu + tổ đội cùng hiện",
      (await vis("duib-btn-accept")) && (await vis("pib-btn-accept")),
      `${await vis("duib-btn-accept")} ${await vis("pib-btn-accept")}`,
    );
    await t.shot("ban-phim-loi-moi.png");
    await press(t, K.y);
    check(
      "Y khi có hai lời mời: nhận THÁCH ĐẤU trước (gấp hơn), tổ đội vẫn chờ",
      (await sentHas(DUEL_MSG.accept, { from: "Dao Huu D" })) &&
        !(await sentHas("partyAccept", { from: "Dao Huu C" })) &&
        !(await vis("duib-btn-accept")) &&
        (await vis("pib-btn-accept")),
      JSON.stringify(await sentList()),
    );
    await press(t, K.x);
    check(
      "X kế tiếp: từ chối lời mời tổ đội còn lại",
      (await sentHas("partyDecline", { from: "Dao Huu C" })) && !(await vis("pib-btn-accept")),
      JSON.stringify(await sentList()),
    );
    await clearSent();

    await ev(
      `window.__ui.onDungeonInvite({ runId: 'run1', dungeonId: 'linh_hu', from: 'Doi Truong', expiresInMs: 30000, rewardsLeft: 3 }); 1`,
    );
    await press(t, K.y);
    check(
      "Y: vào bí cảnh (gửi dungeonEnter)",
      (await sentHas(DUNGEON_MSG.enter, { runId: "run1" })) && !(await vis("dib-btn-enter")),
      JSON.stringify(await sentList()),
    );
    await ev(
      `window.__ui.onDungeonInvite({ runId: 'run2', dungeonId: 'linh_hu', from: 'Doi Truong', expiresInMs: 30000, rewardsLeft: 3 }); 1`,
    );
    await press(t, K.x);
    check(
      "X: từ chối bí cảnh (gửi dungeonDecline)",
      (await sentHas(DUNGEON_MSG.decline, { runId: "run2" })) && !(await vis("dib-btn-decline")),
      JSON.stringify(await sentList()),
    );
    await ev(
      `window.__ui.onSectInvited({ from: 'Dao Huu E', sect: 'Thanh Van', tag: 'TV', ttlMs: 30000 }); 1`,
    );
    await press(t, K.y);
    check(
      "Y: gia nhập tông môn (gửi sectAccept)",
      (await sentHas(SECT_MSG.accept, { from: "Dao Huu E" })) && !(await vis("sib-btn-accept")),
      JSON.stringify(await sentList()),
    );
    await clearSent();
    check(
      "Không có hộp nào: Y / X không làm gì (không gửi tin)",
      await (async () => {
        await press(t, K.y);
        await press(t, K.x);
        return (await sentList()).length === 0;
      })(),
      JSON.stringify(await sentList()),
    );

    // rời bí cảnh: R mở xác nhận, X huỷ, R rồi Y rời thật
    await ev(`document.getElementById('dungeon-hud').hidden = false; 1`);
    await press(t, K.r);
    check(
      "R: hiện hộp xác nhận rời bí cảnh (chưa gửi gì)",
      (await vis("dhud-btn-leave-yes")) &&
        !(await vis("dhud-btn-leave")) &&
        (await sentList()).length === 0,
      JSON.stringify(await sentList()),
    );
    await press(t, K.x);
    check(
      "X: huỷ xác nhận, nút 'Rời Bí Cảnh' hiện lại, chưa gửi gì",
      !(await vis("dhud-btn-leave-yes")) &&
        (await vis("dhud-btn-leave")) &&
        (await sentList()).length === 0,
      JSON.stringify(await sentList()),
    );
    await press(t, K.r);
    await press(t, K.y);
    check(
      "R rồi Y: rời bí cảnh (gửi dungeonLeave)",
      (await sentHas(DUNGEON_MSG.leave, {})) && !(await vis("dhud-btn-leave-yes")),
      JSON.stringify(await sentList()),
    );
    await ev(`document.getElementById('dungeon-hud').hidden = true; 1`);
    await clearSent();

    // đầu hàng quyết đấu: cùng một mẫu
    await ev(`document.getElementById('duel-hud').hidden = false; 1`);
    await press(t, K.r);
    check("R: hiện hộp xác nhận đầu hàng", await vis("duel-btn-yield-yes"), "hộp ẩn");
    await press(t, K.y);
    check(
      "Y: đầu hàng (gửi duelYield)",
      (await sentHas(DUEL_MSG.yield, {})) && !(await vis("duel-btn-yield-yes")),
      JSON.stringify(await sentList()),
    );
    await ev(`document.getElementById('duel-hud').hidden = true; 1`);

    // tấm kết quả: nhận focus, giữ phím thế giới lại, Esc / Enter đóng được
    const slashMark = await ev(`window.__scene.nextSlash`);
    await ev(`document.getElementById('dungeon-end-modal').hidden = false; 1`);
    await sleep(150);
    check(
      "Tấm kết quả bí cảnh hiện: focus vào nút của tấm, phím thế giới bị giữ",
      (await ev(
        `document.activeElement && document.activeElement.closest('#dungeon-end-modal') !== null`,
      )) && !!(await ev(`window.__ui.isKeyboardCaptured()`)),
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );
    await ev(`document.activeElement.blur(); 1`);
    await press(t, K.space);
    check(
      "Tấm kết quả mở: Space KHÔNG chém phía sau",
      (await ev(`window.__scene.nextSlash`)) === slashMark,
      `${slashMark} -> ${await ev(`window.__scene.nextSlash`)}`,
    );
    await press(t, K.esc);
    check(
      "Esc đóng tấm kết quả, phím thế giới chạy lại",
      !(await ev(shown("dungeon-end-modal"))) && !(await ev(`window.__ui.isKeyboardCaptured()`)),
      `captured=${await ev(`window.__ui.isKeyboardCaptured()`)}`,
    );
    await ev(`document.getElementById('duel-end-modal').hidden = false; 1`);
    await sleep(150);
    check(
      "Tấm kết quả quyết đấu hiện: focus ở nút Đóng; Enter đóng",
      (await ev(`document.activeElement && document.activeElement.id`)) === "duend-btn-close",
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );
    await press(t, K.enter);
    check(
      "Enter trên nút Đóng: tấm biến mất, thế giới nhận phím lại",
      !(await ev(shown("duel-end-modal"))) && !(await ev(`window.__ui.isKeyboardCaptured()`)),
      `captured=${await ev(`window.__ui.isKeyboardCaptured()`)}`,
    );

    // ---- 13. Menu đồng đạo bằng phím P, mời đội / thách đấu thật giữa hai người chơi, trả lời bằng Y / X ----
    const second = await (
      await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: "PUT" })
    ).json();
    const tb = await Tab.open("B", (second as any).webSocketDebuggerUrl);
    tabB = tb;
    await tb.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME_B)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET_B)});`,
    });
    // origin khác (localhost, không phải 127.0.0.1) để localStorage của B không đè tên / mã của A (A còn dùng khi qua cổng ở mục 16)
    await tb.send("Page.navigate", { url: `http://localhost:${PORT}/?debug` });
    await tb.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập của người chơi thứ hai",
    );
    await tb.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await tb.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "người chơi thứ hai vào game",
    );
    let sidB = "";
    world.state.players.forEach((p: any, id: string) => {
      if (p.name === NAME_B) sidB = id;
    });
    const pb = world.state.players.get(sidB);
    const calmWorld = () => {
      world.state.monsters.clear();
      world.mctrl.clear();
      world.ctrl.get(sid).lastHitAt = 0;
      world.ctrl.get(sidB).lastHitAt = 0;
    };
    // hai người đứng ngoài trấn (trong trấn không thách đấu được), cạnh nhau, trong tầm nhìn của nhau
    me.x = DEFAULT_MAP.townPx.x + DEFAULT_MAP.townPx.r + 500;
    me.y = pb.y = DEFAULT_MAP.townPx.y;
    pb.x = me.x + 90;
    calmWorld();
    await t.waitFor(
      `window.__scene.players.size >= 2 && Math.abs(window.__scene.predX - ${Math.round(me.x)}) < 100`,
      "A thấy B",
    );
    // hình của B phải thật sự nằm trong khung nhìn của A (hình trượt dần tới vị trí mới, lúc mới vào còn ở chỗ cũ)
    await t.waitFor(
      `Array.from(window.__scene.players.entries()).some(([id, e]) => id !== window.__scene.sid && window.__scene.cameras.main.worldView.contains(e.root.x, e.root.y) && !!window.__scene.state.players.get(id))`,
      "hình của B nằm trong khung nhìn của A",
    );
    await sleep(300);
    await press(t, K.p);
    check(
      "P: menu đồng đạo mở, đúng người gần nhất",
      !!(await ev(shown("player-menu"))) && (await textOf("#pm-name")) === NAME_B,
      `${await ev(shown("player-menu"))} / ${await textOf("#pm-name")}`,
    );
    check(
      "Mở bằng phím: focus nhảy vào nút hành động đầu tiên (Mời vào tổ đội), không phải nút Đóng",
      (await ev(`document.activeElement && document.activeElement.id`)) === "pm-invite-btn",
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );
    await press(t, K.esc);
    check(
      "Esc đóng menu đồng đạo, thế giới nhận phím lại",
      !(await ev(shown("player-menu"))) && !(await ev(`window.__ui.isKeyboardCaptured()`)),
      `captured=${await ev(`window.__ui.isKeyboardCaptured()`)}`,
    );
    await press(t, K.p);
    check(
      "Bấm P lần nữa: chỉ còn một người nên mở lại đúng người đó",
      !!(await ev(shown("player-menu"))) && (await textOf("#pm-name")) === NAME_B,
      String(await textOf("#pm-name")),
    );
    check(
      "Mũi tên tới nút 'Thách Đấu' (dùng được)",
      (await arrowTo(t, "#pm-duel-btn", 8)) &&
        !(await ev(`document.getElementById('pm-duel-btn').disabled`)),
      `hint=${await textOf("#pm-duel-hint")}`,
    );
    // Server từ chối thách đấu khi một trong hai vừa bị đánh (quái hồi sinh gần đó): nếu 5 giây không có lời mời thì dọn quái và thử lại tối đa hai lần
    // (việc kiểm là luồng bàn phím, không phải luật thách đấu); ghi lại thông báo của A để biết lý do khi vẫn đỏ.
    let duelSeen = false;
    for (let attempt = 0; attempt < 3 && !duelSeen; attempt++) {
      if (attempt > 0) {
        out(
          `  (thách đấu lần ${attempt} chưa tới B; toast A: ${await textOf("#toast")}; thử lại sau khi dọn quái)`,
        );
        calmWorld();
        await sleep(300);
        await press(t, K.p);
        await arrowTo(t, "#pm-duel-btn", 8);
      }
      await press(t, K.enter);
      try {
        await tb.waitFor(
          `!!document.getElementById('duel-invite-box') && !document.getElementById('duel-invite-box').hidden`,
          "B nhận lời thách đấu",
          5000,
        );
        duelSeen = true;
      } catch {
        /* thử lại */
      }
    }
    if (!duelSeen)
      throw new Error(`B không nhận được lời thách đấu; toast A: ${await textOf("#toast")}`);
    check(
      "Enter: lời thách đấu tới người kia (hộp mời hiện ở máy B), menu của A đã đóng",
      !(await ev(shown("player-menu"))) && !!(await tb.ev(shown("duel-invite-box"))),
      "hộp mời không hiện",
    );
    check(
      "Bấm nút trong menu xong: modalStack được dọn (phím thế giới của A KHÔNG kẹt)",
      !(await ev(`window.__ui.isKeyboardCaptured()`)),
      `captured=${await ev(`window.__ui.isKeyboardCaptured()`)}`,
    );
    await press(tb, K.x);
    await sleep(300);
    check(
      "B bấm X: từ chối thách đấu, hộp mời ẩn",
      !(await tb.ev(shown("duel-invite-box"))),
      "hộp vẫn hiện",
    );
    await sleep(500);
    await press(t, K.p);
    await press(t, K.enter); // nút đầu tiên: Mời vào tổ đội
    await tb.waitFor(
      `!!document.getElementById('party-invite-box') && !document.getElementById('party-invite-box').hidden`,
      "B nhận lời mời tổ đội",
    );
    await press(tb, K.y);
    await t.waitFor(
      `(window.__ui.getParty().members || []).length >= 2`,
      "A và B vào cùng một tổ đội",
    );
    check(
      "P rồi Enter mời vào tổ đội, B bấm Y nhận: hai người cùng tổ đội (server)",
      !(await tb.ev(shown("party-invite-box"))),
      JSON.stringify(await ev(`window.__ui.getParty()`)),
    );
    // đồng đạo ra khỏi tầm nhìn: báo bằng toast, không mở menu
    pb.x = me.x + 1500;
    await sleep(900);
    await press(t, K.p);
    check(
      "Không có đồng đạo trong tầm nhìn: không mở menu, hiện thông báo",
      !(await ev(shown("player-menu"))) &&
        String(await textOf("#toast")).includes("Không có đồng đạo"),
      `${await ev(shown("player-menu"))} / ${await textOf("#toast")}`,
    );

    // ---- 14. Màn Hoàng Tuyền (chết) chơi được bằng phím ----
    await ev(
      `window.__reborns = 0; window.__ui.showReborn = () => { window.__reborns += 1; }; window.__debugLimbo({ summary: { kiep: 1, realm: 1, tier: 4, minutes: 42, kills: 68, bossKills: 1, gain: 16 }, soul: { kiep: 1, duyen: 28, unlocks: { du_am: 1, ky_vat: 1 }, origins: ['kiem_khach'] }, keepable: ['lang_nha_kiem', 'tho_nhung_bao'] }); 1`,
    );
    await sleep(200);
    check(
      "Hoàng Tuyền hiện: focus ở KHUNG màn (không ở nút nào), phím thế giới bị giữ",
      !!(await ev(shown("limbo-overlay"))) &&
        (await ev(`document.activeElement && document.activeElement.id`)) === "limbo-overlay" &&
        !!(await ev(`window.__ui.isKeyboardCaptured()`)),
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );
    await press(t, K.space);
    await press(t, K.enter);
    check(
      "Đang nhấn Cách / Enter lúc vừa gục: KHÔNG mua gì, KHÔNG đầu thai",
      (await textOf("#limbo-duyen-total")) === "28" && (await ev(`window.__reborns`)) === 0,
      `duyên=${await textOf("#limbo-duyen-total")} đầu thai=${await ev(`window.__reborns`)}`,
    );
    await press(t, K.esc);
    check("Esc KHÔNG đóng màn Hoàng Tuyền", !!(await ev(shown("limbo-overlay"))), "đã đóng");
    await ev(`window.__ui.closeAllModals(); 1`); // WorldScene gọi mỗi lần cập nhật khi đang chết
    check(
      "closeAllModals (WorldScene gọi liên tục khi đang chết): màn vẫn giữ phím thế giới",
      !!(await ev(`window.__ui.isKeyboardCaptured()`)) && !!(await ev(shown("limbo-overlay"))),
      `captured=${await ev(`window.__ui.isKeyboardCaptured()`)}`,
    );
    const inLimbo = () =>
      ev(`!!document.activeElement && document.activeElement.closest('#limbo-overlay') !== null`);
    await press(t, K.tab);
    await press(t, K.tab);
    await press(t, K.tab);
    check(
      "Tab xoay trong màn Hoàng Tuyền, không thoát ra ngoài",
      !!(await inLimbo()),
      "focus ra ngoài",
    );
    const nav = (sel: string) => `document.querySelector(${JSON.stringify(sel)})`;
    check(
      "Mũi tên tới thẻ xuất thân 'Kiếm khách'",
      await arrowTo(t, '[data-nav="origin:kiem_khach"]', 40),
      String(
        await ev(
          `document.activeElement && (document.activeElement.dataset.nav || document.activeElement.id || document.activeElement.tagName)`,
        ),
      ),
    );
    await press(t, K.enter);
    check(
      "Enter chọn xuất thân: thẻ được chọn (aria-checked) và vẫn giữ focus",
      (await ev(`${nav('[data-nav="origin:kiem_khach"]')}.getAttribute('aria-checked')`)) ===
        "true" &&
        (await ev(`document.activeElement && document.activeElement.dataset.nav`)) ===
          "origin:kiem_khach",
      String(await ev(`document.activeElement && document.activeElement.dataset.nav`)),
    );
    check(
      "Mũi tên tới ô ký vật đầu tiên",
      await arrowTo(t, '[data-nav="relic:lang_nha_kiem"]', 40),
      String(
        await ev(
          `document.activeElement && (document.activeElement.dataset.nav || document.activeElement.id || document.activeElement.tagName)`,
        ),
      ),
    );
    await press(t, K.space);
    check(
      "Cách tích ký vật (đã chọn 1/1), focus giữ nguyên sau khi vẽ lại",
      String(await textOf("#limbo-relic-hint")).includes("1/1") &&
        (await ev(`document.activeElement && document.activeElement.dataset.nav`)) ===
          "relic:lang_nha_kiem",
      `${await textOf("#limbo-relic-hint")} / ${await ev(`document.activeElement && document.activeElement.dataset.nav`)}`,
    );
    await press(t, K.enter);
    check(
      "Enter bỏ tích ký vật (0/1)",
      String(await textOf("#limbo-relic-hint")).includes("0/1"),
      String(await textOf("#limbo-relic-hint")),
    );
    check(
      "Mũi tên tới nút mở 'Kim nang' ở Tam Sinh Thạch",
      await arrowTo(t, '[data-nav="stone:kim_nang"]', 40),
      String(
        await ev(
          `document.activeElement && (document.activeElement.dataset.nav || document.activeElement.id || document.activeElement.tagName)`,
        ),
      ),
    );
    await press(t, K.enter);
    await sleep(200);
    check(
      "Enter mua Kim nang: Duyên 28 -> 18 và focus vẫn ở màn (không rơi về đầu)",
      (await textOf("#limbo-duyen-total")) === "18" && !!(await inLimbo()),
      `duyên=${await textOf("#limbo-duyen-total")} / ${await ev(`document.activeElement && document.activeElement.tagName`)}`,
    );
    check(
      "Mũi tên tới nút đầu thai",
      await arrowTo(t, "#limbo-btn-rebirth", 60),
      String(await ev(`document.activeElement && document.activeElement.id`)),
    );
    await press(t, K.enter);
    check(
      "Enter trên nút đầu thai: gọi đầu thai đúng một lần",
      (await ev(`window.__reborns`)) === 1,
      String(await ev(`window.__reborns`)),
    );
    await ev(`window.__ui.hideLimbo(); 1`);
    check(
      "Hết Hoàng Tuyền: thế giới nhận phím lại",
      !(await ev(shown("limbo-overlay"))) && !(await ev(`window.__ui.isKeyboardCaptured()`)),
      `captured=${await ev(`window.__ui.isKeyboardCaptured()`)} dialog=${await ev(`window.__ui.isDialogOpen()`)} menu=${await ev(`window.__ui.isPlayerMenuOpen()`)} focus=${await ev(`document.activeElement && (document.activeElement.id || document.activeElement.tagName)`)} open=${await ev(`[...document.querySelectorAll('[role=dialog]')].filter((e) => !e.hidden).map((e) => e.id).join(',')`)}`,
    );

    // ---- 15. Nhặt đồ rơi, lò rèn: chỉ bằng phím ----
    const invCount = (itemId: string): number =>
      (world.ctrl.get(sid).inv as Array<{ itemId: string; qty: number } | null>).reduce(
        (n, slot) => n + (slot && slot.itemId === itemId ? slot.qty : 0),
        0,
      );
    const digitKey = (n: number): Key => ({
      key: String(n),
      code: `Digit${n}`,
      vk: 48 + n,
      text: String(n),
    });
    // đang đứng ngoài trấn (không có NPC / cổng gần): F nhặt món đồ nằm cạnh
    calmWorld();
    const nanhBefore = invCount("nanh_soi");
    const lootId = spawnLoot(world, "nanh_soi", 2, me.x + 30, me.y, "");
    await t.waitFor(
      `!!window.__scene.nearestLootId && window.__scene.state.loot.has(${JSON.stringify(lootId)})`,
      "đồ rơi hiện ở máy A và là món gần nhất",
    );
    await t.waitFor(`!document.getElementById('btn-pickup').hidden`, "nút Nhặt hiện");
    await sleep(150);
    check(
      "Nút Nhặt có nhãn phím F ở góc nút",
      (await cap("btn-pickup")) === "F",
      String(await cap("btn-pickup")),
    );
    await t.shot("ban-phim-nut-nhat.png");
    await press(t, K.f);
    await sleep(500);
    check(
      "F nhặt đồ rơi: túi có thêm 2 Nanh Sói (server), món đồ biến khỏi đất",
      invCount("nanh_soi") === nanhBefore + 2 && !world.state.loot.has(lootId),
      `${nanhBefore} -> ${invCount("nanh_soi")}, còn trên đất=${world.state.loot.has(lootId)}`,
    );
    // lò rèn: F nói chuyện Thợ rèn, phím số chọn dòng "Lò rèn", mũi tên + Enter rèn
    giveItem(world, sid, "long_tho", 12);
    const longBefore = invCount("long_tho");
    const baoBefore = invCount("tho_nhung_bao");
    const smith = NPC_BY_ID["tho_ren"];
    me.x = smith.x;
    me.y = smith.y + 50;
    world.ctrl.get(sid).lastHitAt = 0;
    await t.waitFor(
      `Math.abs(window.__scene.predX - ${Math.round(smith.x)}) < 40 && Math.abs(window.__scene.predY - ${Math.round(smith.y + 50)}) < 40 && window.__scene.closestNpcId === 'tho_ren'`,
      "đứng cạnh Thợ rèn",
    );
    await press(t, K.f);
    await t.waitFor(
      `!!document.getElementById('dialog-modal') && !document.getElementById('dialog-modal').hidden`,
      "hộp thoại Thợ rèn mở bằng F",
    );
    await press(t, K.enter); // tua chữ
    await t.waitFor(
      `document.querySelectorAll('#dlg-options .dlg-opt-btn').length > 0`,
      "lựa chọn của Thợ rèn hiện",
    );
    const forgeOpt = Number(
      await ev(
        `[...document.querySelectorAll('#dlg-options .dlg-opt-btn')].findIndex((b) => /rèn/i.test(b.textContent))`,
      ),
    );
    check('Thợ rèn có dòng "Lò rèn"', forgeOpt >= 0, String(forgeOpt));
    await press(t, digitKey(forgeOpt + 1));
    await t.waitFor(
      `!!document.getElementById('forge-modal') && !document.getElementById('forge-modal').hidden`,
      "lò rèn mở bằng phím số",
    );
    check(
      "Phím số chọn dòng Lò rèn: bảng lò rèn mở",
      !!(await ev(shown("forge-modal"))),
      "không mở",
    );
    check(
      "Mũi tên tới nút Rèn đầu tiên dùng được (Thổ Nhung Bào, đủ 12 Lông Thỏ)",
      await arrowTo(t, "#forge-list .forge-btn:not(:disabled)", 30),
      String(
        await ev(
          `document.activeElement && (document.activeElement.className || document.activeElement.tagName)`,
        ),
      ),
    );
    await press(t, K.enter);
    await sleep(600);
    check(
      "Enter trên nút Rèn: trừ 12 Lông Thỏ và có thêm Thổ Nhung Bào (server)",
      invCount("long_tho") === longBefore - 12 && invCount("tho_nhung_bao") === baoBefore + 1,
      `lông ${longBefore} -> ${invCount("long_tho")}, áo ${baoBefore} -> ${invCount("tho_nhung_bao")}`,
    );
    await press(t, K.esc);
    check("Esc đóng lò rèn", !(await ev(shown("forge-modal"))), "forge-modal vẫn mở");

    // ---- 16. Qua cổng bằng phím F (CUỐI CÙNG: người chơi sang phòng khác) ----
    const portal = DEFAULT_MAP.portals[0];
    me.x = portal.x;
    me.y = portal.y + 30;
    world.ctrl.get(sid).lastHitAt = 0;
    await t.waitFor(
      `!!window.__scene.nearPortal && Math.hypot(window.__scene.predX - ${portal.x}, window.__scene.predY - ${portal.y}) < 80`,
      "đứng trong vùng cổng",
    );
    await sleep(700); // vị trí thật của server đuổi kịp (server kiểm khoảng cách tới cổng)
    check(
      "Nút Qua cổng có nhãn phím F ở góc nút",
      (await cap("btn-portal")) === "F",
      String(await cap("btn-portal")),
    );
    await t.shot("ban-phim-nut-qua-cong.png");
    await press(t, K.f);
    await t.waitFor(
      `window.__scene && window.__scene.map && window.__scene.map.def.id === ${JSON.stringify(portal.toMap)}`,
      "sang bản đồ đích",
      30000,
    );
    check(
      `F ở ${portal.name}: sang bản đồ ${portal.toMap}`,
      (await ev(`window.__scene.map.def.id`)) === portal.toMap,
      String(await ev(`window.__scene.map.def.id`)),
    );

    check("0 lỗi console / exception", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  } catch (e) {
    fatal = (e as Error).message;
  } finally {
    tab?.close();
    tabB?.close();
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
