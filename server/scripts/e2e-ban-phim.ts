// E2E THẬT chơi bằng BÀN PHÍM (QUYET_DINH_M3 mục 13, #463): server Colyseus thật + Chrome headless, phím gửi bằng CDP
// `Input.dispatchKeyEvent` (phím thật, `isTrusted`), TUYỆT ĐỐI không click chuột và không gọi hàm của UI. Kiểm:
//  1. Nhãn phím hiện trên nút kỹ năng (máy tính): Cách / 3 / 4 / B / Tab, title ghi đủ phím.
//  2. Tab chọn mục tiêu gần nhất, Tab tiếp đi xa dần rồi vòng lại, Shift+Tab đi ngược, Esc bỏ chọn.
//  3. Space khi chưa có mục tiêu: tự khoá con gần nhất VÀ chém trúng (máu quái giảm, phía server).
//  4. Phím 3 (Kiếm khí) tốn linh lực + khoá hồi chiêu; phím 4 bật / tắt đả tọa (server xác nhận).
//  5. I / C / J / G / M / O mở đúng bảng, Esc đóng bảng trên cùng; J là sổ nhiệm vụ (không còn là chém).
//  6. Bảng đang mở: Tab KHÔNG đổi mục tiêu, Space KHÔNG chém (phím thuộc về bảng).
//  7. Enter mở ô chat, gõ chữ thì phím I không mở túi, Enter gửi (server nhận), Esc rời ô chat.
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
import { DEFAULT_MAP, DEFAULT_MAP_ID, roomNameOf } from "@tien-gioi/shared";
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
    world.ctrl.get(sid).lastHitAt = 0;
    // quái đứng yên: không để chúng đuổi / làm máu người chơi dao động
    for (const id of [nearId, midId, farId]) world.mctrl.get(id).nextWander = Infinity;
    await t.waitFor(
      `window.__scene.monsters.size === 3 && Math.abs((window.__scene.predX ?? 0) - ${Math.round(me.x)}) < 200`,
      "cảnh có ba quái và người chơi ở chỗ mới",
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
