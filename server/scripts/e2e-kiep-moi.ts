// E2E THẬT "KIẾP MỚI GIỮ CHIÊU KHẮC" (M7.2c #503, M7.6 #507; việc A gợi ý sau #671): nhân vật ĐÃ HỌC chiêu CHẾT THẬT (đi đúng đường `hurtPlayer` -> `damagePlayer` -> `beginLimbo`, không gieo
// sẵn trạng thái Hoàng Tuyền như `e2e-chieu` ca 1-3) rồi đi hết vòng luân hồi bằng PHÍM THẬT (`Input.dispatchKeyEvent`) trên server Colyseus thật + Chrome headless + client đã build, tới lúc dùng
// lại được chiêu đã khắc ở kiếp mới. Các ca khác kiểm TỪNG mắt xích (`e2e-chieu` ca 1-3: bộ chọn khắc với Hoàng Tuyền gieo sẵn; `e2e-nguoi-moi`: kiếp đầu tới chiêu đầu tiên; `reincarnation.test.ts`:
// luật ở mức đơn vị); chưa ca nào nối "chiêu học ở kiếp trước" -> "chết thật" -> "khắc" -> "kiếp mới" -> "gắn lại ô" -> "dùng". Chuỗi:
//  1. Nhân vật Luyện Khí đã học Hỏa Vân Kiếm (tầng 2, đang ở ô 2), chân linh có MỘT chỗ khắc (nấc `khac` 1, gieo sẵn: mua nấc đã có ca riêng) nhưng chưa khắc gì. Bị đánh gục bằng đúng hàm của
//     quái (`hurtPlayer` với loài quái thật): client nhận tin `limbo`, màn Hoàng Tuyền hiện; bộ chọn khắc CÓ Hỏa Vân Kiếm (lấy từ sổ chiêu kiếp vừa rồi, chụp TRƯỚC khi sổ bị đặt lại), chưa chọn.
//  2. Phím Enter trên ô chọn rồi Enter trên "Đầu thai": Mạnh Bà, HUD kiếp 2.
//  3. Kiếp mới (Phàm Nhân): thanh chiêu mọi ô khoá; bảng Công pháp (Shift+K) có ĐÚNG một hàng Hỏa Vân Kiếm, tầng 1, "Chưa gắn", ghi "Cần đạt Luyện Khí" (chiêu khắc giữ lại nhưng chưa dùng được);
//     tin `skills` của máy chủ khớp (chiêu kiếp trước KHÔNG còn nguyên: tầng 2 -> tầng 1, không ô).
//  4. Đủ tu vi, phím V đột phá lên Luyện Khí (ép `Math.random` = 0 đúng lúc bấm V, như e2e-nguoi-moi): "Cần đạt" biến mất, ô 2 mở, chiêu VẪN chưa gắn (kiếp mới để người chơi tự gắn); mở hàng,
//     Enter ở "Ô 2" => máy chủ gắn, thanh chiêu ô 2 nhận chiêu; phím L dùng chiêu thật (hồi chiêu + `fx cast` tầm thật).
//  5. Rời phòng chủ động, đọc đĩa: chân linh kiếp 2 với `engraved = [hoa_van_kiem]`, hồ sơ nhân vật chiêu tầng 1 ở ô 2, không còn `limbo`.
// Mỗi bước còn kiểm KHÔNG có lỗi / cảnh báo console.
// Chạy: `npm run build -w client && npm run e2e:kiep-moi -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_MAP_ID, skillOf, type Soul } from "@tien-gioi/shared";
import {
  Tab,
  sleep,
  listenWithRetry,
  removeTmpDirs,
  getChromeGpuFlags,
  killChrome,
  shown,
} from "./e2e-kit";
import { freePort } from "../src/test-port.js";
import { ACT_CONFIRM_GUARD_MS } from "../../client/src/act-confirm";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 40000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const out = (m: string) => console.log(m);

/** Phím thật qua CDP (nhấn rồi nhả). */
interface Key {
  key: string;
  code: string;
  vk: number;
  text?: string;
  modifiers?: number;
}
const ENTER: Key = { key: "Enter", code: "Enter", vk: 13, text: "\r" };
const ESC: Key = { key: "Escape", code: "Escape", vk: 27 };
const V_KEY: Key = { key: "v", code: "KeyV", vk: 86, text: "v" };
const Y_KEY: Key = { key: "y", code: "KeyY", vk: 89, text: "y" };
const L_KEY: Key = { key: "l", code: "KeyL", vk: 76, text: "l" };
const SHIFT_K: Key = { key: "K", code: "KeyK", vk: 75, text: "K", modifiers: 8 };
async function press(tab: Tab, k: Key) {
  const base = {
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
    modifiers: k.modifiers ?? 0,
  };
  await tab.send("Input.dispatchKeyEvent", {
    ...base,
    type: k.text ? "keyDown" : "rawKeyDown",
    ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}),
  });
  await tab.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
  await sleep(150); // cho DOM vẽ lại
}

const sha1Nfc = (s: string) =>
  createHash("sha1").update(s.normalize("NFC").toLowerCase().trim()).digest("hex");

const SKILL = "hoa_van_kiem";

async function main() {
  const CDP = await freePort();
  PORT = await freePort();
  out(
    "=== E2E THẬT kiếp mới giữ chiêu khắc: chết thật -> Hoàng Tuyền -> khắc -> kiếp mới -> gắn lại -> dùng ===",
  );
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-km-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-km-chrome-"));
  process.env.DATA_DIR = dataDir;
  // `store.ts` đọc DATA_DIR LÚC NẠP MODULE: nạp SAU khi đặt biến môi trường
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");
  const { hurtPlayer } = await import("../src/systems/combat.js");

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
  let failed: string | null = null;
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };
  const SECRET = "e2e_secret_kiep_moi_1111111";
  const NAME = "Kiep Moi Chieu"; // đạo hiệu 2-16 ký tự
  const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));
  const soulFile = path.join(dataDir, "souls", `${sha1Nfc(NAME)}.json`);
  const playerFile = path.join(dataDir, `${sha1Nfc(NAME)}.json`);

  /** Chờ `fn()` trả giá trị thật (đọc đĩa / trạng thái máy chủ) trong `ms`. */
  const until = async <T>(
    fn: () => T | undefined | false,
    label: string,
    ms = 10000,
  ): Promise<T> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        const v = fn();
        if (v) return v as T;
      } catch {
        /* tệp chưa ghi xong */
      }
      await sleep(150);
    }
    throw new Error(`Hết thời gian chờ (${ms} ms): ${label}`);
  };

  try {
    // Nhân vật Luyện Khí tầng 3 ĐÃ HỌC Hỏa Vân Kiếm (tầng 2, ô 2); chân linh có một chỗ khắc nhưng chưa khắc gì
    const now = new Date().toISOString();
    await savePlayer({
      name: NAME,
      secretHash: hashSecret(SECRET),
      realm: 1,
      tier: 2,
      exp: 10,
      coin: 120,
      mapId: DEFAULT_MAP_ID,
      life: { playMs: 25 * 60_000, kills: 40, bossKills: 0 },
      skills: { learned: { [SKILL]: 2 }, slots: [SKILL, "", "", ""] },
      createdAt: now,
      updatedAt: now,
    });
    mkdirSync(path.join(dataDir, "souls"), { recursive: true });
    const soul: Soul = {
      v: 1,
      id: NAME.normalize("NFC").toLowerCase().trim(),
      kiep: 1,
      duyen: 0,
      duyenTotal: 0,
      unlocks: { khac: 1 },
      origins: ["pham_gia"],
      engraved: [],
      best: { step: 3, realm: 1, tier: 2 },
      lastCreditedLife: "",
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    writeFileSync(soulFile, JSON.stringify(soul, null, 2));

    chrome = spawn(
      "google-chrome",
      [
        "--headless=new",
        "--no-sandbox",
        ...getChromeGpuFlags(),
        `--remote-debugging-port=${CDP}`,
        `--user-data-dir=${chromeDir}`,
        "--window-size=1280,720",
        "about:blank",
      ],
      { stdio: "ignore", detached: true },
    );
    let targets: any[] = [];
    for (const start = Date.now(); Date.now() - start < 30000;) {
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
    const ev = (expr: string) => T.ev(expr) as Promise<any>;
    const noErrors = (when: string) =>
      must(T.errors.length === 0, `lỗi console ${when}: ${JSON.stringify(T.errors)}`);

    await T.send("Page.addScriptToEvaluateOnNewDocument", {
      source:
        `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)});` +
        ` localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
    });
    await T.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug=1` });
    await T.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    await ev(
      `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME)}; document.getElementById('login-form').requestSubmit(); 1`,
    );
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room`,
      "vào game thành công",
      20000,
    );
    const sid = (await ev(`window.__scene.room.sessionId`)) as string;
    const roomId = (await ev(`window.__scene.room.roomId`)) as string;
    const room = matchMaker.getLocalRoomById(roomId) as any;
    must(!!room?.world, "lấy được World của phòng thật qua matchMaker");
    const world = room.world as import("../src/world.js").World;
    const me = world.state.players.get(sid)!;
    const barLabel = (n: number) =>
      ev(
        `document.getElementById('sk-slot${n}')?.getAttribute('aria-label') ?? ''`,
      ) as Promise<string>;
    const rows = () =>
      ev(
        `JSON.stringify([...document.querySelectorAll('#skills-list .sk-row')].map((r) => ({ id: r.dataset.skill, badge: r.querySelector('.sk-row-badge').textContent, sub: r.querySelector('.sk-line .sk-row-tag').textContent, need: r.querySelector('.sk-row-need')?.textContent ?? '' })))`,
      ).then((v) => JSON.parse(String(v))) as Promise<
        { id: string; badge: string; sub: string; need: string }[]
      >;
    await T.waitFor(
      `(document.getElementById('sk-slot2')?.getAttribute('aria-label') ?? '').includes('Hỏa Vân')`,
      "kiếp 1: thanh chiêu ô 2 nhận Hỏa Vân Kiếm từ tin `skills`",
    );
    must(me.realm === 1, `kiếp 1: Luyện Khí (realm ${me.realm})`);

    // ---------------------------------------------------------------------------------------------------------------
    out(
      "\n--- 1. Chết thật (đường đánh của quái) -> Hoàng Tuyền, bộ chọn khắc có Hỏa Vân Kiếm ---",
    );
    const hurt = hurtPlayer(world, sid, me, me.hp + 9999, { kind: "lang" });
    must(hurt === true, "đòn của quái được nhận (người chơi không bất tử lúc này)");
    await T.waitFor(`${shown("limbo-overlay")}`, "màn Hoàng Tuyền từ tin `limbo` thật", 20000);
    await T.waitFor(
      `document.querySelectorAll('#limbo-engrave-list input[data-nav^="engrave:"]').length === 1`,
      "bộ chọn khắc có đúng một chiêu (lấy từ sổ chiêu kiếp vừa rồi)",
    );
    const pick0 = (await ev(
      `JSON.stringify([...document.querySelectorAll('#limbo-engrave-list input[data-nav^="engrave:"]')].map((cb) => ({ id: cb.dataset.nav.slice(8), checked: cb.checked, disabled: cb.disabled })))`,
    ).then((v) => JSON.parse(String(v)))) as { id: string; checked: boolean; disabled: boolean }[];
    must(
      pick0.length === 1 && pick0[0].id === SKILL && !pick0[0].checked && !pick0[0].disabled,
      `bộ chọn: Hỏa Vân Kiếm, chưa chọn, chọn được: ${JSON.stringify(pick0)}`,
    );
    ok("chết thật: Hoàng Tuyền hiện; bộ chọn khắc có Hỏa Vân Kiếm (chưa chọn, chọn được)");
    noErrors("ở bước 1");

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 2. Enter chọn chiêu, Enter 'Đầu thai' -> Mạnh Bà -> kiếp 2 ---");
    await ev(`document.querySelector('input[data-nav="engrave:${SKILL}"]').focus(); 1`);
    await press(T, ENTER);
    must(
      (await ev(`document.querySelector('input[data-nav="engrave:${SKILL}"]').checked`)) as boolean,
      "Enter bật ô chọn Hỏa Vân Kiếm",
    );
    await ev(`document.getElementById('limbo-btn-rebirth').focus(); 1`);
    await press(T, ENTER);
    await T.waitFor(`${shown("reborn-overlay")}`, "màn Mạnh Bà", 10000);
    await T.waitFor(`document.getElementById('reborn-overlay')?.hidden`, "Mạnh Bà tự đóng", 12000);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && /2/.test(document.getElementById('hud-kiep')?.textContent ?? '')`,
      "HUD kiếp 2",
    );
    ok("đầu thai bằng phím: Mạnh Bà, vào kiếp 2");
    noErrors("ở bước 2");

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 3. Kiếp mới (Phàm Nhân): chiêu khắc còn, tầng 1, chưa gắn, 'Cần đạt Luyện Khí' ---");
    await T.waitFor(`window.__scene.me().realm === 0`, "client thấy Phàm Nhân");
    const bar = await Promise.all([2, 3, 4, 5].map((n) => barLabel(n)));
    must(
      bar.every((l) => !/Hỏa Vân/.test(l)) && bar.every((l) => /mở ở/i.test(l)),
      `kiếp mới: mọi ô khoá và không giữ chiêu: ${JSON.stringify(bar)}`,
    );
    await press(T, SHIFT_K);
    await T.waitFor(`${shown("skills-modal")}`, "Shift+K mở bảng Công pháp");
    const r3 = await rows();
    must(
      r3.length === 1 &&
        r3[0].id === SKILL &&
        r3[0].badge === "Chưa gắn" &&
        /tầng 1/.test(r3[0].sub) &&
        /Cần đạt Luyện Khí/.test(r3[0].need),
      `bảng Công pháp: một hàng Hỏa Vân Kiếm tầng 1, Chưa gắn, "Cần đạt Luyện Khí": ${JSON.stringify(r3)}`,
    );
    const ctrl = world.ctrl.get(sid)!;
    must(
      ctrl.skills.learned[SKILL] === 1 && ctrl.skills.slots.every((s) => s === ""),
      `máy chủ: ${SKILL} tầng 1 (kiếp trước tầng 2), không ô nào giữ chiêu: ${JSON.stringify(ctrl.skills)}`,
    );
    await press(T, ESC);
    await T.waitFor(`!(${shown("skills-modal")})`, "Esc đóng bảng Công pháp");
    ok(
      "kiếp mới: chiêu khắc giữ ở tầng 1, ô trống, bảng ghi 'Cần đạt Luyện Khí'; thanh chiêu mọi ô khoá",
    );
    noErrors("ở bước 3");

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 4. V đột phá lên Luyện Khí -> tự gắn lại ô 2 bằng phím -> L dùng chiêu ---");
    me.exp = me.expMax; // đủ tu vi (nguồn tu vi không phải điều ca này kiểm)
    await T.waitFor(
      `window.__scene.me().exp >= window.__scene.me().expMax`,
      "client thấy tu vi đầy",
    );
    ctrl.nextBreak = 0;
    const realRandom = Math.random;
    Math.random = () => 0; // đột phá thành công (máy chủ cùng tiến trình)
    try {
      await press(T, V_KEY);
      // Đột phá có HỘP XÁC NHẬN (#779, #781): V chỉ mở hộp (nêu xác suất + hậu quả), Y mới gửi; Y trong cửa sổ chống click ma bị bỏ qua nên chờ qua `ACT_CONFIRM_GUARD_MS`
      await T.waitFor(shown("act-confirm"), "hộp xác nhận đột phá hiện sau phím V");
      await sleep(ACT_CONFIRM_GUARD_MS + 150);
      await press(T, Y_KEY);
      await until(() => me.realm === 1, "máy chủ cho đột phá lên Luyện Khí", 5000);
    } finally {
      Math.random = realRandom;
    }
    await T.waitFor(`window.__scene.me().realm === 1`, "client thấy Luyện Khí");
    await press(T, SHIFT_K);
    await T.waitFor(`${shown("skills-modal")}`, "Shift+K mở bảng Công pháp lần hai");
    await T.waitFor(
      `!document.querySelector('#skills-list .sk-row .sk-row-need')`,
      "'Cần đạt' biến mất khi đủ cảnh giới",
    );
    const r4 = await rows();
    must(
      r4.length === 1 && r4[0].badge === "Chưa gắn" && r4[0].need === "",
      `đủ cảnh giới nhưng chiêu VẪN chưa gắn (kiếp mới để người chơi tự gắn): ${JSON.stringify(r4)}`,
    );
    await ev(`document.querySelector('[data-nav="skillrow:${SKILL}"]').focus(); 1`);
    await press(T, ENTER); // mở chi tiết
    await ev(`document.querySelector('[data-nav="skillslot:${SKILL}:2"]').focus(); 1`);
    await press(T, ENTER);
    await T.waitFor(
      `(document.getElementById('sk-slot2')?.getAttribute('aria-label') ?? '').includes('Hỏa Vân')`,
      "máy chủ gắn chiêu vào ô 2 (thanh chiêu đổi khi nhận `skills`)",
    );
    must((await rows())[0].badge === "Ô 2", "bảng Công pháp ghi 'Ô 2' sau khi máy chủ xác nhận");
    await press(T, ESC);
    await T.waitFor(`!(${shown("skills-modal")})`, "Esc đóng bảng Công pháp");
    must(!(await ev(`window.__scene.lastAttack`)), "trước khi dùng chiêu chưa có đòn nào");
    await press(T, L_KEY);
    await T.waitFor(
      `(document.getElementById('sk-slot2')?.getAttribute('aria-label') ?? '').includes('hồi chiêu')`,
      "máy chủ nhận `cast`: ô 2 vào hồi chiêu",
    );
    await T.waitFor(
      `!!window.__scene.lastAttack && window.__scene.lastAttack.range === ${skillOf(SKILL)!.range}`,
      "client nhận `fx cast` của máy chủ thật (tầm = tầm thật của Hỏa Vân Kiếm)",
    );
    ok(
      "Luyện Khí: 'Cần đạt' biến mất, chiêu chưa gắn; Enter ở Ô 2 gắn lại; L dùng chiêu (hồi chiêu + fx cast)",
    );
    noErrors("ở bước 4");

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 5. Rời phòng, đọc đĩa: chân linh kiếp 2 + hồ sơ ---");
    await ev(`window.__scene.room.leave(true).then(() => 1)`);
    const savedSoul = await until(() => {
      const s = readJson(soulFile) as Soul;
      return s.kiep === 2 ? s : false;
    }, "chân linh ghi kiếp 2");
    must(
      JSON.stringify(savedSoul.engraved) === JSON.stringify([SKILL]),
      `Soul.engraved = ${JSON.stringify(savedSoul.engraved)}`,
    );
    const saved = await until(() => {
      const p = readJson(playerFile);
      return p.limbo === undefined && p.skills?.slots?.[0] === SKILL ? p : false;
    }, "hồ sơ nhân vật: hết limbo, ô 2 giữ chiêu");
    must(
      saved.realm === 1 &&
        saved.skills.learned[SKILL] === 1 &&
        JSON.stringify(saved.skills.slots) === JSON.stringify([SKILL, "", "", ""]),
      `đĩa: Luyện Khí, ${SKILL} tầng 1 ở ô 2: ${JSON.stringify(saved.skills)}`,
    );
    ok(
      `đĩa: chân linh kiếp 2 khắc ${JSON.stringify(savedSoul.engraved)}; nhân vật Luyện Khí, chiêu tầng 1 ở ô 2, hết limbo`,
    );
    noErrors("ở bước 5");
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ THẤT BẠI: ${failed}`);
    if (tab?.errors.length) console.error(`  lỗi console: ${JSON.stringify(tab.errors)}`);
  } finally {
    tab?.close();
    killChrome(chrome);
    try {
      await gameServer.gracefullyShutdown(false);
    } catch {
      /* bỏ qua */
    }
    await new Promise<void>((r) => httpServer.close(() => r()));
    await removeTmpDirs(dataDir, chromeDir);
  }
  if (failed) process.exit(1);
  out("\n=== E2E KIẾP MỚI ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
