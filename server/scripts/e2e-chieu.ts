// E2E THẬT chiêu thức: khắc chân linh ở màn Hoàng Tuyền (M7.2c, #503; hợp đồng `shared/` #535, máy chủ #537, client #544) và bảng Công pháp (M7.6, #507): server Colyseus thật + Chrome
// headless + client đã build, điều khiển bằng PHÍM THẬT (`Input.dispatchKeyEvent`, `isTrusted`), không gọi hàm của giao diện. Ca `limbo` của
// `e2e.ts` KHÔNG đụng bộ chọn khắc; ba ca ở đây đi đủ đường client -> `rebirth` -> `validateRebirth` -> `applyRebirth` -> đĩa:
//  1. ĐỔI tập chiêu: chân linh đang khắc Ưng Trảo (một chỗ), bỏ Ưng Trảo rồi chọn Hỏa Vân Kiếm => tin `rebirth` kèm `engrave`; máy chủ ghi
//     `Soul.engraved = [hoa_van_kiem]` và kiếp mới có đúng chiêu đó ở tầng 1 (`rebirthSkills`), Ưng Trảo không còn.
//  2. KHÔNG ĐỤNG bộ chọn: tin `rebirth` KHÔNG có `engrave` => máy chủ GIỮ NGUYÊN chiêu đã khắc (Ưng Trảo vẫn còn ở kiếp mới).
//  3. BỎ HẾT: bỏ chiêu đã khắc => `engrave: []` => máy chủ XOÁ HẾT (chân linh và kiếp mới đều không còn chiêu).
// Mỗi ca còn kiểm giao diện: danh sách lấy từ `LimboMsg.engravable` thật (chiêu đang khắc đứng trước), chọn sẵn chiêu đã khắc, hết chỗ thì ô còn
// lại bị khoá, Enter bật / tắt được; và KHÔNG có lỗi / cảnh báo console.
//  4. BẢNG CÔNG PHÁP (M7.6, #507, #546; danh sách GỌN #668: mỗi chiêu một hàng, bấm / Enter mở chi tiết): nhân vật Trúc Cơ đã học ba chiêu, Shift+K mở bảng
//     (mọi hàng gập, nhãn "Ô N" / "Chưa gắn" theo máy chủ); số hiển thị khớp công thức dùng chung; mở hàng rồi Enter trên nút
//     "Ô N" gắn chiêu qua `skillSlot` THẬT (thanh chiêu chỉ đổi khi máy chủ gửi lại `skills`: client không đoán trước); gắn vào ô đang có chiêu khác thì
//     THAY, chiêu đang ở ô khác thì ĐỔI chỗ (ô cũ trống), Delete gỡ, ô chưa mở (ô 4 ở Trúc Cơ) không gửi gì; bấm L dùng chiêu thật (máy chủ đặt hồi chiêu,
//     phát `fx cast`, client vẽ hiệu ứng dùng chiêu #552); rời phòng chủ động rồi đọc hồ sơ trên đĩa.
//  5. HUY HIỆU TRẠNG THÁI TRÊN ĐẦU QUÁI (M7.7 #508, `Monster.fx` #559): máy chủ gắn bỏng rồi choáng lên Linh Thố bằng `applyMonsterStatus` TRONG TIẾN TRÌNH;
//     client (qua schema + `StateView`) vẽ đúng 1 rồi 2 chấm, tắt từng cái khi hết hạn và về 0 (huy hiệu cuối được dọn).
//  6. QUÁI LAO CÓ BÁO TRƯỚC (M7.3 #504): Hôi Lang THẬT (số liệu `MONSTERS`, không ép) thấy người thì gồng, client nhận `fx warn` thật, người đứng yên bị trúng đòn lao.
//  7. QUÁI TẦM XA BẮN ĐẠN (M7.3 #504, #599 / #602 / #607): Sương Hồ THẬT (`ranged` 280 / 300 từ `MONSTERS`, không ép def) thấy người thì đứng cách xa và bắn; client nhận `fx bolt`
//     thật (lớp báo trước đòn đếm đạn), người đứng yên bị trúng đúng `atk` MỘT lần (đạn, không đánh gần), quái giữ khoảng cách.
//  8. ĐẠN ĐỘC (M7.3 #504, #601 / #607): Độc Thiềm THẬT (`poisoner` + `boltRange`) bắn đạn độc: trúng thì trừ đúng `atk` VÀ gắn độc (máy chủ + huy hiệu độc ở HUD của người bị bắn), độc
//     không giết người; chạy về khu an toàn thì độc được THANH TẨY (huy hiệu tắt).
//  9. ĐẬP ĐẤT BÁO TRƯỚC (M7.3 #504, #629): Cốt Tượng THẬT (`slam` 90 px / 1100 ms / x2 công từ `MONSTERS`, không ép def) thấy người trong vòng thì đứng gồng; client nhận ĐÚNG MỘT `fx warn`
//     hình tròn (tâm ở chỗ quái, bán kính và thời gian đúng số liệu), người đứng yên trúng đúng `round(atk x 2)` MỘT lần (không đánh thường lúc gồng), vùng báo mờ hết sau khi đòn đáp;
//     người bước ra khỏi vòng trong lúc gồng thì KHÔNG trúng.
// Chạy: `npm run build -w client && npm run e2e:chieu -w server` (cần google-chrome).
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
import {
  DEFAULT_MAP_ID,
  skillCooldownMs,
  skillDamageMult,
  skillOf,
  type Soul,
} from "@tien-gioi/shared";
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

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 40000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const out = (m: string) => console.log(m);

/** Phím thật qua CDP (nhấn rồi nhả). */
const ENTER = { key: "Enter", code: "Enter", vk: 13, text: "\r" };
const DELETE = { key: "Delete", code: "Delete", vk: 46 };
const ESC = { key: "Escape", code: "Escape", vk: 27 };
const L_KEY = { key: "l", code: "KeyL", vk: 76, text: "l" };
const SHIFT_K = { key: "K", code: "KeyK", vk: 75, text: "K", modifiers: 8 };
async function press(
  tab: Tab,
  k: { key: string; code: string; vk: number; text?: string; modifiers?: number },
) {
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

/** Chiêu có sẵn trong bảng chiêu (id `SkillDef`): Ưng Trảo (phổ thông) và Hỏa Vân Kiếm (hệ Hỏa). */
const UNG_TRAO = "ung_trao";
const HOA_VAN = "hoa_van_kiem";

interface Case {
  title: string;
  name: string;
  /** Các bước phím người chơi thực hiện trên bộ chọn (id chiêu bấm Enter theo thứ tự) */
  toggle: string[];
  /** Kỳ vọng sau đầu thai */
  engraved: string[];
}

async function main() {
  // Cổng do hệ điều hành cấp (không `Math.random`): cổng CDP trùng Chrome của dev khác thì ta điều khiển nhầm trình duyệt của họ (review B ở #549)
  const CDP = await freePort();
  PORT = await freePort();
  out(
    "=== E2E THẬT chiêu thức (khắc chân linh + bảng Công pháp): server Colyseus thật + Chrome headless ===",
  );
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-chieu-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-chieu-chrome-"));
  process.env.DATA_DIR = dataDir;
  // `store.ts` đọc DATA_DIR LÚC NẠP MODULE: nạp SAU khi đặt biến môi trường
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");

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
  const SECRET = "e2e_secret_chieu_1111111111";
  const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));
  const soulFile = (name: string) => path.join(dataDir, "souls", `${sha1Nfc(name)}.json`);
  const playerFile = (name: string) => path.join(dataDir, `${sha1Nfc(name)}.json`);

  /** Gieo nhân vật ĐÃ chết thật (ở Hoàng Tuyền) và chân linh đang khắc Ưng Trảo, có một chỗ khắc (nấc `khac` 1). */
  const seed = async (name: string) => {
    const now = new Date().toISOString();
    await savePlayer({
      name,
      secretHash: hashSecret(SECRET),
      realm: 1,
      tier: 8,
      exp: 100,
      coin: 500,
      mapId: DEFAULT_MAP_ID,
      x: 2048,
      y: 2048,
      life: { playMs: 2880000, kills: 30, bossKills: 1 },
      limbo: {
        endedLifeId: `life-e2e-chieu-${sha1Nfc(name).slice(0, 8)}`,
        summary: { kiep: 1, realm: 1, tier: 8, minutes: 48, kills: 30, bossKills: 1, gain: 25 },
        keepable: [],
        // chiêu đang khắc đứng trước, rồi chiêu đã học ở kiếp vừa rồi (đúng thứ tự `engravableOf` của máy chủ)
        engravable: [UNG_TRAO, HOA_VAN],
        coinAtDeath: 500,
        counts: true,
        credited: false,
      },
      createdAt: now,
      updatedAt: now,
    });
    mkdirSync(path.join(dataDir, "souls"), { recursive: true });
    const soul: Soul = {
      v: 1,
      id: name.normalize("NFC").toLowerCase().trim(),
      kiep: 1,
      duyen: 0,
      duyenTotal: 0,
      unlocks: { khac: 1 },
      origins: ["pham_gia"],
      engraved: [UNG_TRAO],
      best: { step: 9, realm: 1, tier: 8 },
      lastCreditedLife: "",
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    writeFileSync(soulFile(name), JSON.stringify(soul, null, 2));
  };

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
    const ev = (expr: string) => T.ev(expr) as Promise<any>;

    let scriptId: string | null = null;
    const login = async (name: string) => {
      if (scriptId)
        await T.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
      const r = await T.send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(name)});` +
          ` localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
      });
      scriptId = String(r.result?.identifier ?? "");
      await T.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug=1` });
      await T.waitFor(
        `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
        "form đăng nhập",
      );
      await ev(
        `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(name)}; document.getElementById('login-form').requestSubmit(); 1`,
      );
    };

    /** Trạng thái bộ chọn khắc đọc từ DOM thật: [{id, checked, disabled, label}] theo thứ tự hiện + dòng gợi ý */
    const picker = async () =>
      (await ev(`(() => ({
        hint: document.getElementById('limbo-engrave-hint')?.textContent ?? '',
        items: [...document.querySelectorAll('#limbo-engrave-list input[data-nav^="engrave:"]')].map((cb) => ({
          id: cb.dataset.nav.slice('engrave:'.length), checked: cb.checked, disabled: cb.disabled, label: cb.getAttribute('aria-label') || '',
        })),
      }))()`)) as {
        hint: string;
        items: { id: string; checked: boolean; disabled: boolean; label: string }[];
      };

    const cases: Case[] = [
      {
        title: "ĐỔI tập chiêu: bỏ Ưng Trảo, chọn Hỏa Vân Kiếm => engrave [hoa_van_kiem]",
        name: "Khac Doi Chieu",
        toggle: [UNG_TRAO, HOA_VAN],
        engraved: [HOA_VAN],
      },
      {
        title: "KHÔNG ĐỤNG bộ chọn: tin rebirth không có engrave => giữ nguyên Ưng Trảo",
        name: "Khac Giu Nguyen",
        toggle: [],
        engraved: [UNG_TRAO],
      },
      {
        title: "BỎ HẾT: engrave [] => máy chủ xoá hết chiêu đã khắc",
        name: "Khac Bo Het",
        toggle: [UNG_TRAO],
        engraved: [],
      },
    ];

    for (const [i, cs] of cases.entries()) {
      out(`\n--- Ca ${i + 1}: ${cs.title} ---`);
      await seed(cs.name);
      await login(cs.name);
      await T.waitFor(shown("limbo-overlay"), "màn Hoàng Tuyền từ tin `limbo` thật", 20000);

      // Bộ chọn lấy từ LimboMsg.engravable thật: chiêu đang khắc đứng trước, được chọn sẵn, hết chỗ thì ô còn lại khoá
      await T.waitFor(
        `document.querySelectorAll('#limbo-engrave-list input[data-nav^="engrave:"]').length === 2`,
        "bộ chọn khắc có hai chiêu",
      );
      let st = await picker();
      must(
        st.items.map((x) => x.id).join() === `${UNG_TRAO},${HOA_VAN}`,
        `thứ tự: ${JSON.stringify(st.items.map((x) => x.id))}`,
      );
      must(
        st.items[0].checked && !st.items[1].checked,
        `chọn sẵn chiêu đã khắc: ${JSON.stringify(st.items)}`,
      );
      must(st.items[1].disabled, "chỉ có MỘT chỗ khắc: ô còn lại phải khoá khi đã chọn một chiêu");
      must(/1\/1/.test(st.hint), `gợi ý số chỗ (1/1), thực tế: "${st.hint}"`);
      must(
        /hệ Kim|hệ Hỏa|hệ /.test(st.items[1].label),
        `aria-label nêu hệ: "${st.items[1].label}"`,
      );
      ok(
        "bộ chọn từ danh sách thật của máy chủ: Ưng Trảo chọn sẵn, Hỏa Vân Kiếm bị khoá (hết chỗ)",
      );

      // Người chơi bấm Enter trên từng ô theo kịch bản (phím thật)
      for (const id of cs.toggle) {
        await ev(`document.querySelector('input[data-nav="engrave:${id}"]').focus(); 1`);
        await press(T, ENTER);
      }
      st = await picker();
      const want = new Set(cs.toggle.length === 0 ? [UNG_TRAO] : cs.engraved);
      const got = new Set(st.items.filter((x) => x.checked).map((x) => x.id));
      must(
        got.size === want.size && [...want].every((x) => got.has(x)),
        `lựa chọn sau khi bấm: ${JSON.stringify([...got])}, kỳ vọng ${JSON.stringify([...want])}`,
      );
      ok(`lựa chọn trên màn hình: ${JSON.stringify([...got])}`);
      await T.shot(`chieu-${i + 1}-chon`);

      // Đầu thai bằng phím Enter trên nút
      await ev(`document.getElementById('limbo-btn-rebirth').focus(); 1`);
      await press(T, ENTER);
      await T.waitFor(shown("reborn-overlay"), "màn Mạnh Bà", 10000);
      await T.waitFor(
        `document.getElementById('reborn-overlay')?.hidden`,
        "Mạnh Bà tự đóng",
        12000,
      );
      await T.waitFor(
        `!document.getElementById('ui')?.hidden && /2/.test(document.getElementById('hud-kiep')?.textContent ?? '')`,
        "HUD kiếp 2",
      );
      ok("máy chủ chấp nhận tin rebirth, vào kiếp 2");

      // KẾT QUẢ THẬT trên đĩa: chân linh và sổ chiêu của kiếp mới
      const soul = await until(() => {
        const s = readJson(soulFile(cs.name)) as Soul;
        return s.kiep === 2 ? s : false;
      }, "chân linh ghi kiếp 2");
      must(
        JSON.stringify(soul.engraved) === JSON.stringify(cs.engraved),
        `Soul.engraved = ${JSON.stringify(soul.engraved)}, kỳ vọng ${JSON.stringify(cs.engraved)}`,
      );
      ok(`chân linh: engraved = ${JSON.stringify(soul.engraved)}`);
      const saved = await until(() => {
        const p = readJson(playerFile(cs.name));
        return p.limbo === undefined ? p : false;
      }, "hồ sơ nhân vật ghi sau đầu thai");
      const learned = Object.keys(saved.skills?.learned ?? {}).sort();
      must(
        JSON.stringify(learned) === JSON.stringify([...cs.engraved].sort()),
        `sổ chiêu kiếp mới = ${JSON.stringify(learned)}, kỳ vọng ${JSON.stringify(cs.engraved)}`,
      );
      for (const id of cs.engraved)
        must(saved.skills.learned[id] === 1, `${id} ở tầng 1, thực tế ${saved.skills.learned[id]}`);
      ok(`kiếp mới: chiêu đã học = ${JSON.stringify(learned)} (tầng 1)`);
      await T.shot(`chieu-${i + 1}-kiep-moi`);
      must(T.errors.length === 0, `lỗi console ở ca ${i + 1}: ${JSON.stringify(T.errors)}`);
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Ca 4: bảng Công pháp (gắn / gỡ ô qua máy chủ thật)
    // ---------------------------------------------------------------------------------------------------------------
    out(
      "\n--- Ca 4: bảng Công pháp: Shift+K, số thật, gắn / thay / đổi chỗ / gỡ qua máy chủ thật, ô chưa mở ---",
    );
    const CP = "Cong Phap Gan Go";
    const BON = "bon_thach_quyen";
    const nameOf = (id: string) => skillOf(id)!.name;
    // Trúc Cơ (realm 2): mở ô 2 và 3, ô 4 còn khoá. Đã học ba chiêu; Bôn Thạch Quyền đang ở ô 2.
    await savePlayer({
      name: CP,
      secretHash: hashSecret(SECRET),
      realm: 2,
      tier: 0,
      exp: 0,
      coin: 0,
      mapId: DEFAULT_MAP_ID,
      skills: {
        learned: { [UNG_TRAO]: 1, [HOA_VAN]: 2, [BON]: 1 },
        slots: [BON, "", "", ""],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await login(CP);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room`,
      "vào game thành công",
      20000,
    );
    /** aria-label của ô `n` trên thanh chiêu (do máy chủ gửi `skills` mới vẽ lại) */
    const barLabel = (n: number) =>
      ev(
        `document.getElementById('sk-slot${n}')?.getAttribute('aria-label') ?? ''`,
      ) as Promise<string>;
    const waitBar = (n: number, text: string, why: string) =>
      T.waitFor(
        `(document.getElementById('sk-slot${n}')?.getAttribute('aria-label') ?? '').includes(${JSON.stringify(text)})`,
        why,
      );
    const focusNav = (nav: string) =>
      ev(
        `(() => { const b = document.querySelector('[data-nav="${nav}"]'); if (!b) return false; b.focus(); return document.activeElement === b; })()`,
      );
    /** Bảng gọn: nút ô nằm trong chi tiết của hàng, phải MỞ hàng (focus nút hàng + Enter) trước khi focus được nút ô; hàng đã mở thì giữ nguyên */
    const openRow = async (id: string) => {
      must(await focusNav(`skillrow:${id}`), `không focus được hàng của ${id}`);
      const on = (await ev(
        `document.querySelector('[data-nav="skillrow:${id}"]')?.getAttribute('aria-expanded') === 'true'`,
      )) as boolean;
      if (!on) await press(T, ENTER);
    };
    const slotBtn = async (id: string, slot: number) => {
      await openRow(id);
      must(await focusNav(`skillslot:${id}:${slot}`), `không focus được nút "Ô ${slot}" của ${id}`);
      await press(T, ENTER);
    };
    /** nhãn ô trên hàng gọn ("Ô 2" / "Chưa gắn") */
    const rowBadge = (id: string) =>
      ev(
        `document.querySelector('#skills-list .sk-row[data-skill="${id}"] .sk-row-badge')?.textContent ?? ''`,
      ) as Promise<string>;

    await waitBar(2, nameOf(BON), "thanh chiêu nhận `skills` từ máy chủ: ô 2 = Bôn Thạch Quyền");
    await press(T, SHIFT_K);
    await T.waitFor(shown("skills-modal"), "Shift+K mở bảng Công pháp");
    const ids = (await ev(
      `[...document.querySelectorAll('#skills-list .sk-row')].map((r) => r.dataset.skill).sort()`,
    )) as string[];
    must(
      JSON.stringify(ids) === JSON.stringify([BON, HOA_VAN, UNG_TRAO].sort()),
      `ba chiêu đã học trong bảng: ${JSON.stringify(ids)}`,
    );
    // Số hiển thị = công thức dùng chung ở `shared` (cùng hàm với máy chủ), tính ở đây bằng tay theo định dạng số kiểu Việt
    const vi = (n: number, digits: number) =>
      n
        .toFixed(digits)
        .replace(/\.?0+$/, "")
        .replace(".", ",");
    for (const [id, level] of [
      [HOA_VAN, 2],
      [UNG_TRAO, 1],
    ] as const) {
      const def = skillOf(id)!;
      const text = (await ev(
        `document.querySelector('#skills-list .sk-row[data-skill="${id}"]')?.textContent ?? ''`,
      )) as string;
      const wantDmg = `Sát thương: ${vi(def.mult * skillDamageMult(level), 2)} lần công`;
      const wantCd = `Hồi chiêu: ${vi(skillCooldownMs(def, level, 0) / 1000, 1)} giây`;
      must(text.includes(wantDmg), `${id}: thiếu "${wantDmg}" trong "${text.slice(0, 160)}"`);
      must(text.includes(wantCd), `${id}: thiếu "${wantCd}"`);
    }
    ok("Shift+K mở bảng; ba chiêu đã học; số sát thương / hồi chiêu khớp công thức dùng chung");
    // danh sách GỌN: mở bảng thì mọi hàng gập (chi tiết ẩn), nhãn ô theo sổ chiêu THẬT của máy chủ (Bôn Thạch Quyền ở ô 2, hai chiêu kia chưa gắn)
    const collapsed = (await ev(
      `[...document.querySelectorAll('#skills-list .sk-row')].every((r) => r.querySelector('.sk-line')?.getAttribute('aria-expanded') === 'false' && r.querySelector('.sk-detail')?.hidden === true)`,
    )) as boolean;
    must(collapsed, "mở bảng: mọi hàng gập, chi tiết ẩn");
    must(
      (await rowBadge(BON)) === "Ô 2" &&
        (await rowBadge(UNG_TRAO)) === "Chưa gắn" &&
        (await rowBadge(HOA_VAN)) === "Chưa gắn",
      `nhãn ô trên hàng gọn: ${await rowBadge(BON)} / ${await rowBadge(UNG_TRAO)} / ${await rowBadge(HOA_VAN)}`,
    );
    ok("danh sách gọn: mọi hàng gập; nhãn 'Ô 2' / 'Chưa gắn' đúng sổ chiêu của máy chủ");
    await T.shot("chieu-4-bang");

    // gắn vào ô TRỐNG: Ưng Trảo -> ô 3
    await slotBtn(UNG_TRAO, 3);
    await waitBar(3, nameOf(UNG_TRAO), "máy chủ xác nhận Ưng Trảo ở ô 3 (thanh chiêu đổi)");
    must(
      (await rowBadge(UNG_TRAO)) === "Ô 3",
      `nhãn ô của Ưng Trảo sau khi máy chủ gắn: ${await rowBadge(UNG_TRAO)}`,
    );
    ok(
      "mở hàng + Enter trên 'Ô 3' của Ưng Trảo: máy chủ gắn, thanh chiêu và nhãn ô trên hàng cập nhật",
    );

    // gắn vào ô ĐANG CÓ chiêu khác: Hỏa Vân Kiếm -> ô 2 thay Bôn Thạch Quyền
    await slotBtn(HOA_VAN, 2);
    await waitBar(2, nameOf(HOA_VAN), "máy chủ xác nhận Hỏa Vân Kiếm ở ô 2 (thay Bôn Thạch Quyền)");
    must(!(await barLabel(2)).includes(nameOf(BON)), "Bôn Thạch Quyền phải rời ô 2");
    ok("gắn vào ô đang có chiêu khác: THAY (Bôn Thạch Quyền rời ô 2)");

    // chiêu đang ở ô KHÁC: Hỏa Vân Kiếm -> ô 3 (thay Ưng Trảo) và ô 2 trống (mỗi chiêu một ô)
    await slotBtn(HOA_VAN, 3);
    await waitBar(3, nameOf(HOA_VAN), "Hỏa Vân Kiếm sang ô 3");
    await waitBar(2, "còn trống", "ô 2 trống sau khi Hỏa Vân Kiếm rời đi (mỗi chiêu tối đa một ô)");
    ok("chiêu đang ở ô khác: ĐỔI chỗ (ô cũ trống, ô mới thay Ưng Trảo)");

    // Delete gỡ: chiêu đang ở ô 3, bấm Delete trên một nút bất kỳ của hàng
    must(await focusNav(`skillslot:${HOA_VAN}:2`), "focus nút của hàng Hỏa Vân Kiếm");
    await press(T, DELETE);
    await waitBar(3, "còn trống", "Delete gỡ Hỏa Vân Kiếm khỏi ô 3");
    ok("Delete trên nút của hàng: máy chủ gỡ chiêu khỏi ô 3");

    // Delete khi CHỈ focus nút hàng ĐANG GẬP (không mở chi tiết): đưa Ưng Trảo vào ô 3 (đang trống) -> gập hàng rồi Delete
    await slotBtn(UNG_TRAO, 3);
    await waitBar(3, nameOf(UNG_TRAO), "Ưng Trảo về ô 3 để thử Delete trên hàng gập");
    must(await focusNav(`skillrow:${UNG_TRAO}`), "focus nút hàng Ưng Trảo");
    await press(T, ENTER); // đang mở -> gập
    must(
      !(await ev(
        `document.querySelector('[data-nav="skillrow:${UNG_TRAO}"]')?.getAttribute('aria-expanded') === 'true'`,
      )),
      "hàng Ưng Trảo đã gập",
    );
    await press(T, DELETE);
    await waitBar(3, "còn trống", "Delete trên hàng gập gỡ Ưng Trảo khỏi ô 3");
    must((await rowBadge(UNG_TRAO)) === "Chưa gắn", "nhãn ô Ưng Trảo về 'Chưa gắn'");
    ok("Delete khi chỉ focus hàng gập: gỡ chiêu khỏi ô (không cần mở chi tiết)");

    // ô CHƯA MỞ (ô 4 ở Trúc Cơ): không gửi gì, ô giữ nguyên
    await slotBtn(UNG_TRAO, 4);
    await sleep(500);
    must(/mở ở/.test(await barLabel(4)), `ô 4 vẫn khoá: "${await barLabel(4)}"`);
    must((await barLabel(3)).includes("còn trống"), "ô 3 không đổi sau khi bấm ô khoá");
    ok("ô 4 chưa mở: bấm không đổi gì (thanh chiêu giữ nguyên)");

    // Sắp lại lần cuối rồi ngắt kết nối: hồ sơ trên đĩa phải đúng
    await slotBtn(HOA_VAN, 2);
    await waitBar(2, nameOf(HOA_VAN), "Hỏa Vân Kiếm về ô 2");
    await slotBtn(UNG_TRAO, 3);
    await waitBar(3, nameOf(UNG_TRAO), "Ưng Trảo về ô 3");
    await T.shot("chieu-4-cuoi");

    // DÙNG chiêu thật: đóng bảng (phím thế giới bị chặn khi bảng mở) rồi bấm L (ô 2 = Hỏa Vân Kiếm). Máy chủ nhận `cast`, đặt hồi chiêu và phát `fx cast`
    // tới người ở gần; client vẽ hạt (HIỆU ỨNG DÙNG CHIÊU, #552). `lastAttack.range` chỉ được đặt khi `onFx` nhận tin `cast` của MÌNH, và mang tầm THẬT
    // máy chủ tính (`def.range` của chiêu cone): bằng chứng tin đi đủ đường máy chủ -> mạng -> client.
    await press(T, ESC);
    await T.waitFor(`document.getElementById('skills-modal')?.hidden`, "Esc đóng bảng Công pháp");
    must(
      !(await ev(`window.__scene.lastAttack`)),
      "trước khi dùng chiêu chưa có đòn nào (lastAttack trống)",
    );
    const admitted0 = (await ev(`window.__fx.stats().admitted`)) as number;
    await press(T, L_KEY);
    await T.waitFor(
      `(document.getElementById('sk-slot2')?.getAttribute('aria-label') ?? '').includes('hồi chiêu')`,
      "máy chủ nhận `cast`: ô 2 vào hồi chiêu",
    );
    await T.waitFor(
      `!!window.__scene.lastAttack && window.__scene.lastAttack.range === ${skillOf(HOA_VAN)!.range}`,
      "client nhận tin `fx cast` của máy chủ thật (lastAttack.range = tầm thật của Hỏa Vân Kiếm)",
    );
    must(
      ((await ev(`window.__fx.stats().admitted`)) as number) > admitted0,
      "client vẽ hạt cho chiêu vừa dùng (số điểm nhận vào tăng)",
    );
    ok(
      "L: máy chủ đặt hồi chiêu và phát fx cast; client vẽ hiệu ứng dùng chiêu (lastAttack + hạt)",
    );
    // Rời phòng CHỦ ĐỘNG (consented): máy chủ lưu ngay. Đóng tab / rớt mạng thì nhân vật ở lại `RECONNECT_GRACE_S` giây chờ nối lại rồi mới lưu.
    await ev(`window.__scene.room.leave(true).then(() => 1)`);
    const saved4 = await until(() => {
      const pf = readJson(playerFile(CP));
      const sl = pf.skills?.slots as string[] | undefined;
      return sl && sl[0] === HOA_VAN && sl[1] === UNG_TRAO ? pf : false;
    }, "hồ sơ nhân vật ghi sổ chiêu đã sắp lại");
    must(
      JSON.stringify(saved4.skills.slots) === JSON.stringify([HOA_VAN, UNG_TRAO, "", ""]),
      `ô trên đĩa: ${JSON.stringify(saved4.skills.slots)}`,
    );
    const learned4 = saved4.skills.learned as Record<string, number>;
    const wantLearned: Record<string, number> = { [UNG_TRAO]: 1, [HOA_VAN]: 2, [BON]: 1 };
    must(
      Object.keys(learned4).length === 3 &&
        Object.entries(wantLearned).every(([id, lv]) => learned4[id] === lv),
      `chiêu đã học trên đĩa không đổi: ${JSON.stringify(learned4)}`,
    );
    ok(`đĩa: ô = ${JSON.stringify(saved4.skills.slots)}, chiêu đã học và tầng nguyên vẹn`);
    must(T.errors.length === 0, `lỗi console ở ca 4: ${JSON.stringify(T.errors)}`);

    // ---------------------------------------------------------------------------------------------------------------
    // Ca 5 và 6: quái hành vi (M7.3, #504 / M7.7, #508): đường máy chủ -> mạng -> client với MÁY CHỦ THẬT trong tiến trình
    // ---------------------------------------------------------------------------------------------------------------
    const { applyMonsterStatus } = await import("../src/systems/status.js");
    const { syncPublicPos } = await import("../src/systems/movement.js");
    const QN = "Quai Hanh Vi";
    const seedQuai = async (name: string) =>
      savePlayer({
        name,
        secretHash: hashSecret(SECRET),
        realm: 3, // khí huyết dày: ca này đứng yên chịu đòn
        tier: 0,
        exp: 0,
        coin: 0,
        mapId: DEFAULT_MAP_ID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    /** Phòng thật của máy chủ trong tiến trình (qua `roomId` mà client đang giữ) */
    const worldOf = async () => {
      const roomId = (await ev(`window.__scene.room.roomId`)) as string;
      const room = matchMaker.getLocalRoomById(roomId) as any;
      must(!!room?.world, "lấy được World của phòng thật qua matchMaker");
      return room.world as import("../src/world.js").World;
    };
    /** Dời nhân vật (máy chủ và dự đoán của client) tới (x, y): ca này kiểm tin của quái, không kiểm di chuyển */
    const teleport = async (
      w: import("../src/world.js").World,
      sid: string,
      x: number,
      y: number,
    ) => {
      const p = w.state.players.get(sid)!;
      p.x = x;
      p.y = y;
      syncPublicPos(p);
      await ev(`(() => { const s = window.__scene; s.predX = ${x}; s.predY = ${y}; return 1; })()`);
    };
    const pips = (id: string) =>
      ev(`JSON.stringify(window.__scene.monsterPips(${JSON.stringify(id)}))`).then((v) =>
        typeof v === "string" ? JSON.parse(v) : null,
      ) as Promise<{ n: number; text: string; visible: boolean; draws: number } | null>;

    out(
      "\n--- Ca 5: huy hiệu trạng thái trên đầu quái: Monster.fx đồng bộ THẬT (máy chủ gắn / hết hạn -> client vẽ / xoá) ---",
    );
    await seedQuai(QN);
    await login(QN);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room`,
      "vào game thành công",
      20000,
    );
    const w5 = await worldOf();
    const sidQ = (await ev(`window.__scene.room.sessionId`)) as string;
    // Linh Thố (quái hiền, aggro 0): đứng cạnh nó mà không bị đánh
    let thoId = "";
    let thoXY = { x: 0, y: 0 };
    w5.state.monsters.forEach((m, id) => {
      if (!thoId && m.kind === "tho") {
        thoId = id;
        thoXY = { x: m.x, y: m.y };
      }
    });
    must(thoId !== "", "có Linh Thố trong phòng");
    await teleport(w5, sidQ, thoXY.x - 90, thoXY.y);
    await T.waitFor(
      `!!window.__scene.monsterPips(${JSON.stringify(thoId)})`,
      "client thấy Linh Thố (vùng nhìn đã cập nhật)",
      15000,
    );
    must((await pips(thoId))!.n === 0, "chưa dính trạng thái: không chấm");
    applyMonsterStatus(w5, thoId, { status: "burn", ms: 4000, ratio: 0.01, chance: 1 }, 1, "");
    await T.waitFor(
      `(window.__scene.monsterPips(${JSON.stringify(thoId)})?.n ?? 0) === 1`,
      "client vẽ MỘT chấm sau khi máy chủ gắn bỏng (Monster.fx = 1 đồng bộ qua schema)",
    );
    must(
      (await pips(thoId))!.text.includes("Bỏng"),
      `chấm là Bỏng: ${JSON.stringify(await pips(thoId))}`,
    );
    applyMonsterStatus(w5, thoId, { status: "stun", ms: 1000, ratio: 0, chance: 1 }, 0, "");
    await T.waitFor(
      `(window.__scene.monsterPips(${JSON.stringify(thoId)})?.n ?? 0) === 2`,
      "choáng gắn thêm: HAI chấm",
    );
    ok(
      "máy chủ gắn bỏng rồi choáng lên quái thật: client vẽ đúng 1 rồi 2 chấm (Monster.fx qua StateView)",
    );
    await T.waitFor(
      `(window.__scene.monsterPips(${JSON.stringify(thoId)})?.n ?? 0) === 1`,
      "choáng hết hạn (1 giây): còn MỘT chấm (bỏ bit choáng, không mất bỏng)",
      8000,
    );
    await T.waitFor(
      `(window.__scene.monsterPips(${JSON.stringify(thoId)})?.n ?? 0) === 0`,
      "bỏng hết hạn (4 giây): hết chấm (huy hiệu cuối được dọn)",
      10000,
    );
    ok("trạng thái hết hạn: chấm tắt đúng từng cái, về 0 khi hết sạch");
    must(T.errors.length === 0, `lỗi console ở ca 5: ${JSON.stringify(T.errors)}`);

    out(
      "\n--- Ca 6: Hôi Lang THẬT gồng báo trước rồi lao: client nhận fx warn thật, người đứng yên bị trúng đòn lao ---",
    );
    const LN = "Quai Goi Gong";
    await seedQuai(LN);
    await login(LN);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room`,
      "vào game thành công",
      20000,
    );
    const w6 = await worldOf();
    const sidL = (await ev(`window.__scene.room.sessionId`)) as string;
    // Chọn một Hôi Lang và chỗ đứng cách nó 120 px (trong aggro 170, ngoài tầm đánh thường) sao cho: chỗ đứng thoáng, KHÔNG nằm trong khu an toàn (quái bỏ
    // qua người ở đó) và đoạn từ quái tới người thoáng (cú lao không bị tường chặn): nếu không ca này phụ thuộc may rủi vị trí sinh quái ngẫu nhiên.
    let langId = "";
    let standXY = { x: 0, y: 0 };
    const mapW = w6.map;
    const lr = 13; // bán kính Hôi Lang
    const clearBetween = (x0: number, y0: number, x1: number, y1: number): boolean => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        const y = y0 + ((y1 - y0) * k) / n;
        if (mapW.circleBlocked(x, y, lr + 3) || mapW.inSafe(x, y, 40)) return false;
      }
      return true;
    };
    w6.state.monsters.forEach((m, id) => {
      if (langId || m.kind !== "lang") return;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const sx = m.x + dx * 120;
        const sy = m.y + dy * 120;
        if (clearBetween(m.x, m.y, sx + dx * 40, sy + dy * 40)) {
          langId = id;
          standXY = { x: sx, y: sy };
          return;
        }
      }
    });
    must(langId !== "", "có Hôi Lang với chỗ đứng thoáng cách 120 px");
    // Cô lập cảnh: quái KHÁC quanh chỗ đứng (trong 500 px) không được nhắm người này (aggro 0, bỏ mục tiêu), để lần mất khí huyết đầu tiên là đòn lao của ĐÚNG con này
    w6.state.monsters.forEach((o, oid) => {
      if (oid === langId || Math.hypot(o.x - standXY.x, o.y - standXY.y) > 500) return;
      const oc = w6.mctrl.get(oid);
      if (oc) {
        oc.def = { ...oc.def, aggro: 0 };
        oc.target = null;
      }
    });
    must(
      w6.mctrl.get(langId)?.def.behavior === "charger",
      "Hôi Lang THẬT là charger (số liệu trong MONSTERS, không ép def)",
    );
    const pL = w6.state.players.get(sidL)!;
    await T.waitFor(
      `!!window.__scene?.telegraphs && typeof window.__scene.telegraphs.stats === 'function'`,
      "lớp báo trước đòn của cảnh đã dựng",
      15000,
    );
    const warns0 = (await ev(`window.__scene.telegraphs.stats().spawnedWarns`)) as number;
    pL.hp = pL.maxHp;
    // đứng cách 120 px (trong aggro 170, ngoài tầm đánh thường), không di chuyển
    await teleport(w6, sidL, standXY.x, standXY.y);
    await T.waitFor(
      `window.__scene.telegraphs.stats().spawnedWarns > ${warns0}`,
      "client nhận fx `warn` từ máy chủ thật khi Hôi Lang bắt đầu gồng",
      15000,
    );
    ok("Hôi Lang thấy người thì gồng: client nhận tin `warn` thật (đường lao báo trước)");
    await until(() => (pL.hp < pL.maxHp ? true : false), "người đứng yên bị trúng đòn lao", 6000);
    // Lần mất khí huyết ĐẦU TIÊN phải đúng đòn LAO (atk x 1,5 = 21), không phải đòn thường (atk x 0,85-1,15 = 12-16) tới sau khi quái đã lao sát người
    const firstDrop = pL.maxHp - pL.hp;
    must(
      firstDrop === Math.round(14 * 1.5),
      `lần trúng đầu tiên là đòn lao: ${Math.round(14 * 1.5)}, thực tế ${firstDrop}`,
    );
    ok(`đứng yên trong vùng báo trước: lần trúng đầu là đòn lao (khí huyết -${firstDrop})`);
    must(T.errors.length === 0, `lỗi console ở ca 6: ${JSON.stringify(T.errors)}`);
    ok("0 lỗi console / exception");

    // ---------------------------------------------------------------------------------------------------------------
    // Ca 7 và 8: quái TẦM XA thật bắn đạn (M7.3): đặt quái THẬT (số liệu `MONSTERS`, không ép) vào phòng thật, đường máy chủ -> mạng -> client
    // ---------------------------------------------------------------------------------------------------------------
    const { addMonster } = await import("../src/systems/test-helpers.js");
    /**
     * Chỗ đứng cho người + chỗ đặt quái cách `gap` px về bên trái, cả hai thoáng (không tường / nước, KHÔNG trong khu an toàn: quái bỏ qua người ở đó), đoạn bắn thoáng;
     * quét lưới 64 px bắt đầu từ `skip` ô để hai ca không dùng cùng một chỗ (ca 7 không ảnh hưởng ca 8).
     */
    const openSpot = (w: import("../src/world.js").World, gap: number, skip: number) => {
      const r = 22;
      let seen = 0;
      for (let y = 300; y < w.map.worldH - 300; y += 64) {
        for (let x = 300; x < w.map.worldW - 300; x += 64) {
          let ok2 = true;
          for (let px = x - gap - 40; px <= x + 60 && ok2; px += 8) {
            if (w.map.circleBlocked(px, y, r) || w.map.inSafe(px, y, 220)) ok2 = false;
          }
          if (ok2 && seen++ >= skip) return { x, y };
        }
      }
      return null;
    };
    /** Quái KHÁC quanh chỗ đứng (trong 700 px) không được nhắm người này: để mọi lần mất khí huyết đều là của ĐÚNG con quái tầm xa đặt vào. */
    const isolate = (
      w: import("../src/world.js").World,
      around: { x: number; y: number },
      keep: string,
    ) => {
      w.state.monsters.forEach((o, oid) => {
        if (oid === keep || Math.hypot(o.x - around.x, o.y - around.y) > 700) return;
        const oc = w.mctrl.get(oid);
        if (oc) {
          oc.def = { ...oc.def, aggro: 0 };
          oc.target = null;
        }
      });
    };

    out(
      "\n--- Ca 7: Sương Hồ THẬT (ranged) đứng xa bắn đạn: client nhận fx bolt thật, người đứng yên bị trúng đúng atk MỘT lần ---",
    );
    const TXN = "Quai Tam Xa";
    await seedQuai(TXN);
    await login(TXN);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room`,
      "vào game thành công",
      20000,
    );
    const w7 = await worldOf();
    const sid7 = (await ev(`window.__scene.room.sessionId`)) as string;
    const spot7 = openSpot(w7, 180, 0);
    must(spot7 !== null, "có chỗ thoáng cho người + quái tầm xa cách 180 px");
    const sh = addMonster(w7, "suong_ho", spot7!.x - 180, spot7!.y);
    isolate(w7, spot7!, sh.id);
    must(
      sh.mc.def.behavior === "ranged" && sh.mc.def.boltSpeed === 280 && sh.mc.def.boltRange === 300,
      `Sương Hồ THẬT là ranged 280 / 300 (số liệu MONSTERS, không ép def): ${JSON.stringify([sh.mc.def.behavior, sh.mc.def.boltSpeed, sh.mc.def.boltRange])}`,
    );
    const p7 = w7.state.players.get(sid7)!;
    await T.waitFor(
      `!!window.__scene?.telegraphs && typeof window.__scene.telegraphs.stats === 'function'`,
      "lớp đạn / báo trước của cảnh đã dựng",
      15000,
    );
    const bolts0 = (await ev(`window.__scene.telegraphs.stats().spawnedBolts`)) as number;
    p7.hp = p7.maxHp;
    await teleport(w7, sid7, spot7!.x, spot7!.y);
    await T.waitFor(
      `window.__scene.telegraphs.stats().spawnedBolts > ${bolts0}`,
      "client nhận `fx bolt` từ máy chủ thật khi Sương Hồ bắn",
      15000,
    );
    ok(
      "Sương Hồ thấy người thì bắn: client nhận tin `bolt` thật (lớp đạn của cảnh đếm thêm một đạn)",
    );
    await until(() => (p7.hp < p7.maxHp ? true : false), "người đứng yên bị đạn trúng", 8000);
    const drop7 = p7.maxHp - p7.hp;
    must(
      drop7 === Math.round(sh.mc.def.atk),
      `lần mất khí huyết đầu tiên là ĐÚNG một viên đạn (atk ${sh.mc.def.atk}), thực tế -${drop7}`,
    );
    const dist7 = Math.hypot(sh.m.x - p7.x, sh.m.y - p7.y);
    must(
      dist7 > sh.mc.def.attackRange + 40,
      `quái tầm xa giữ khoảng cách (cách ${dist7.toFixed(0)} px, tầm đánh gần ${sh.mc.def.attackRange})`,
    );
    ok(
      `người đứng yên: trúng đạn (khí huyết -${drop7}), quái giữ khoảng cách ${dist7.toFixed(0)} px, không áp sát đánh gần`,
    );
    must(T.errors.length === 0, `lỗi console ở ca 7: ${JSON.stringify(T.errors)}`);
    // dọn: bỏ quái và đạn còn bay để ca sau không bị ảnh hưởng
    w7.state.monsters.delete(sh.id);
    w7.mctrl.delete(sh.id);
    w7.bolts.length = 0;

    out(
      "\n--- Ca 8: Độc Thiềm THẬT (poisoner + đạn) bắn đạn độc: trúng thì trừ atk VÀ gắn độc (máy chủ + huy hiệu HUD); khu an toàn thanh tẩy ---",
    );
    const DTN = "Quai Doc Thiem";
    await seedQuai(DTN);
    await login(DTN);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room`,
      "vào game thành công",
      20000,
    );
    const w8 = await worldOf();
    const sid8 = (await ev(`window.__scene.room.sessionId`)) as string;
    const spot8 = openSpot(w8, 160, 5);
    must(spot8 !== null, "có chỗ thoáng thứ hai cho người + quái tầm xa cách 160 px");
    const dt = addMonster(w8, "doc_thiem", spot8!.x - 160, spot8!.y);
    isolate(w8, spot8!, dt.id);
    must(
      dt.mc.def.behavior === "poisoner" && dt.mc.def.boltRange === 260,
      `Độc Thiềm THẬT là poisoner có tầm bắn 260 (số liệu MONSTERS): ${JSON.stringify([dt.mc.def.behavior, dt.mc.def.boltRange])}`,
    );
    const p8 = w8.state.players.get(sid8)!;
    const c8 = w8.ctrl.get(sid8)!;
    await T.waitFor(
      `!!window.__scene?.telegraphs && typeof window.__scene.telegraphs.stats === 'function'`,
      "lớp đạn của cảnh đã dựng (sau lần vào game thứ hai)",
      15000,
    );
    const bolts8 = (await ev(`window.__scene.telegraphs.stats().spawnedBolts`)) as number;
    p8.hp = p8.maxHp;
    await teleport(w8, sid8, spot8!.x, spot8!.y);
    await T.waitFor(
      `window.__scene.telegraphs.stats().spawnedBolts > ${bolts8}`,
      "client nhận `fx bolt` của Độc Thiềm",
      15000,
    );
    await until(
      () => (c8.st?.list.some((s) => s.id === "poison") ? true : false),
      "người đứng yên trúng đạn độc: máy chủ gắn trạng thái độc",
      10000,
    );
    ok("đạn độc trúng: máy chủ gắn độc lên người (trạng thái `poison` trong hộp trạng thái riêng)");
    await T.waitFor(
      `!!document.querySelector('[data-status="poison"]')`,
      "huy hiệu độc hiện ở HUD của người bị bắn (tin `status` gửi riêng chủ)",
      8000,
    );
    ok("client hiện huy hiệu độc ở HUD (tin `status` thật)");
    // Bỏ quái và đạn còn bay TRƯỚC (đòn thật của quái vẫn giết người: chỉ ĐỘC mới không giết), rồi gắn lại độc lên người chỉ còn 40 khí huyết: tổng độc cả đợt
    // (~23 / giây x 4 giây) vượt xa 40 nên nếu độc giết được thì ca này đỏ; máy chủ kẹp ở 1 khí huyết.
    w8.state.monsters.delete(dt.id);
    w8.mctrl.delete(dt.id);
    w8.bolts.length = 0;
    const { POISON_EFFECT } = await import("../src/systems/bolt.js");
    const { applyPlayerStatus } = await import("../src/systems/status.js");
    p8.hp = 40;
    must(
      applyPlayerStatus(w8, sid8, POISON_EFFECT, 290, "") !== "ignored",
      "gắn lại độc lên người",
    );
    await until(
      () => (c8.st?.list.some((s) => s.id === "poison") ? false : true),
      "độc chạy hết 4 giây",
      9000,
    );
    must(
      !p8.dead && p8.hp === 1,
      `độc không giết người: kẹp ở 1 khí huyết (khí huyết ${p8.hp}, dead=${p8.dead})`,
    );
    ok(
      "độc cả đợt vượt xa khí huyết còn lại mà người vẫn sống, dừng ở 1 khí huyết (độc không giết)",
    );
    // Về khu an toàn: độc được thanh tẩy (gắn độc mới rồi chạy về trấn ngay)
    p8.hp = p8.maxHp;
    applyPlayerStatus(w8, sid8, POISON_EFFECT, 290, "");
    await T.waitFor(
      `!!document.querySelector('[data-status="poison"]')`,
      "huy hiệu độc hiện lại sau khi gắn độc mới",
      8000,
    );
    await teleport(w8, sid8, w8.map.townPx.x, w8.map.townPx.y);
    await T.waitFor(
      `!document.querySelector('[data-status="poison"]')`,
      "về khu an toàn: huy hiệu độc tắt (độc được thanh tẩy)",
      8000,
    );
    must(!c8.st?.list.some((s) => s.id === "poison"), "máy chủ đã gỡ độc khỏi hộp trạng thái");
    ok("về khu an toàn: độc được thanh tẩy (máy chủ gỡ, huy hiệu tắt), người vẫn sống");
    must(T.errors.length === 0, `lỗi console ở ca 8: ${JSON.stringify(T.errors)}`);
    ok("0 lỗi console / exception");

    out(
      "\n--- Ca 9: Cốt Tượng THẬT đập đất báo trước: client nhận ĐÚNG MỘT warn tròn đúng tâm / bán kính / thời gian; đứng yên thì trúng round(atk x 2) MỘT lần; ra khỏi vòng lúc gồng thì tránh được ---",
    );
    const DDN = "Quai Dap Dat";
    await seedQuai(DDN);
    await login(DDN);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room`,
      "vào game thành công",
      20000,
    );
    const w9 = await worldOf();
    const sid9 = (await ev(`window.__scene.room.sessionId`)) as string;
    // Người đứng cách quái 200 px là NGOÀI vòng đập (90 + 11) và ngoài aggro (150, dư chỗ cho quái lang thang nhích vài chục px): quái chưa nhắm; cách 70 px là TRONG vòng (quái gồng ngay)
    const GAP9 = 200;
    const spot9 = openSpot(w9, GAP9, 10);
    must(spot9 !== null, "có chỗ thoáng thứ ba cho người + Cốt Tượng cách 200 px");
    const home9 = { x: spot9!.x - GAP9, y: spot9!.y }; // chỗ đặt quái
    const far9 = { x: spot9!.x, y: spot9!.y }; // cách quái 200 px
    const near9 = { x: home9.x + 70, y: home9.y }; // cách quái 70 px
    const p9 = w9.state.players.get(sid9)!;
    await T.waitFor(
      `!!window.__scene?.telegraphs && typeof window.__scene.telegraphs.stats === 'function'`,
      "lớp báo trước đòn của cảnh đã dựng (sau lần vào game thứ ba)",
      15000,
    );
    const warnsOf = () => ev(`window.__scene.telegraphs.stats().spawnedWarns`) as Promise<number>;
    const putStatue = () => {
      const s = addMonster(w9, "cot_tuong", home9.x, home9.y);
      isolate(w9, spot9!, s.id);
      return s;
    };
    const dropStatue = (id: string) => {
      w9.state.monsters.delete(id);
      w9.mctrl.delete(id);
    };

    // --- 9a: đứng yên trong vòng ---
    const st1 = putStatue();
    const slam = st1.mc.def.slam;
    must(
      !!slam && slam.radius === 90 && slam.windupMs === 1100 && slam.mult === 2,
      `Cốt Tượng THẬT có đập đất 90 px / 1100 ms / x2 (số liệu MONSTERS, không ép def): ${JSON.stringify(slam)}`,
    );
    const dmg9 = Math.round(st1.mc.def.atk * slam!.mult);
    await teleport(w9, sid9, far9.x, far9.y);
    p9.hp = p9.maxHp;
    await sleep(600);
    must(
      st1.mc.slam === undefined && p9.hp === p9.maxHp,
      "người cách 200 px (ngoài vòng, ngoài aggro): quái chưa gồng, chưa mất khí huyết",
    );
    const warns9 = await warnsOf();
    await teleport(w9, sid9, near9.x, near9.y);
    await T.waitFor(
      `window.__scene.telegraphs.stats().spawnedWarns > ${warns9}`,
      "client nhận fx `warn` từ máy chủ thật khi Cốt Tượng gồng đập đất",
      15000,
    );
    // Quái hiền lành lang thang nên chỗ đứng LÚC GỒNG không đúng chỗ đặt: lấy vị trí máy chủ ngay khi gồng (quái đứng yên suốt lúc gồng)
    const at9 = { x: st1.m.x, y: st1.m.y };
    const snap9 = JSON.parse(
      (await ev(
        `JSON.stringify(window.__scene.telegraphs.snapshot(window.__scene.time.now).warns)`,
      )) as string,
    ) as Array<{ shape: string; x: number; y: number; r: number; ms: number }>;
    must(
      snap9.length === 1 &&
        snap9[0].shape === "circle" &&
        snap9[0].r === slam!.radius &&
        snap9[0].ms === slam!.windupMs &&
        Math.abs(snap9[0].x - at9.x) <= 1 &&
        Math.abs(snap9[0].y - at9.y) <= 1,
      `vùng báo của client là MỘT hình tròn tâm quái (${at9.x.toFixed(0)}, ${at9.y.toFixed(0)}), r ${slam!.radius}, ${slam!.windupMs} ms: ${JSON.stringify(snap9)}`,
    );
    ok(
      `client nhận ĐÚNG MỘT vùng báo tròn: tâm ở chỗ quái, bán kính ${slam!.radius} px, gồng ${slam!.windupMs} ms`,
    );
    must(p9.hp === p9.maxHp, "đang gồng: quái đứng yên, KHÔNG đánh thường (khí huyết chưa mất)");
    // Suốt lúc gồng (đọc máy chủ: `mc.slam` còn = chưa đáp, cùng tick với lúc đáp thì xoá): quái KHÔNG nhúc nhích và KHÔNG đánh thường. Lấy mẫu mỗi 30 ms tới khi đáp.
    let maxMove9 = 0;
    let minHp9 = p9.hp;
    for (const end = Date.now() + 5000; st1.mc.slam && Date.now() < end; await sleep(30)) {
      maxMove9 = Math.max(maxMove9, Math.hypot(st1.m.x - at9.x, st1.m.y - at9.y));
      minHp9 = Math.min(minHp9, p9.hp);
    }
    must(!st1.mc.slam, "cú đập đã đáp (hết gồng)");
    must(
      maxMove9 <= 1 && minHp9 === p9.maxHp,
      `suốt lúc gồng quái đứng yên (nhích tối đa ${maxMove9.toFixed(2)} px) và không đánh thường (khí huyết thấp nhất ${minHp9} / ${p9.maxHp})`,
    );
    await until(() => (p9.hp < p9.maxHp ? true : false), "người đứng yên trong vòng bị đập", 5000);
    const drop9 = p9.maxHp - p9.hp;
    must(
      drop9 === dmg9,
      `lần mất khí huyết đầu tiên là cú đập đất: round(atk ${st1.mc.def.atk} x ${slam!.mult}) = ${dmg9}, thực tế -${drop9}`,
    );
    must(
      (await warnsOf()) === warns9 + 1,
      `suốt đợt gồng chỉ MỘT tin báo trước (${(await warnsOf()) - warns9})`,
    );
    // #645 (nit của B khi xem trùm thật): đập đất tính như MỘT đòn đánh, quái chờ đủ `attackCd` (Cốt Tượng 1800 ms) rồi mới đánh thường; người đứng sát vẫn chỉ mất đúng một cú đập
    await sleep(1200);
    must(
      p9.maxHp - p9.hp === dmg9,
      `1,2 s sau cú đập: KHÔNG bị đánh thường liền sau (khí huyết -${p9.maxHp - p9.hp}, mong đợi -${dmg9})`,
    );
    ok(`đứng yên trong vòng: trúng đúng MỘT cú đập đất (khí huyết -${drop9} = ${dmg9})`);
    await T.waitFor(
      `window.__scene.telegraphs.stats().warns === 0`,
      "vùng báo trên client mờ hết sau khi đòn đáp",
      4000,
    );
    ok("sau khi đòn đáp xuống: vùng báo trên client mờ hết");
    dropStatue(st1.id);

    // --- 9b: bước ra khỏi vòng trong lúc gồng ---
    await teleport(w9, sid9, far9.x, far9.y);
    p9.hp = p9.maxHp;
    const st2 = putStatue();
    const warns9b = await warnsOf();
    await sleep(400); // quái mới ở xa (200 px): chưa nhắm
    must(st2.mc.slam === undefined, "quái mới chưa gồng khi người ở ngoài aggro");
    await teleport(w9, sid9, near9.x, near9.y);
    await until(() => (st2.mc.slam ? true : false), "Cốt Tượng mới bắt đầu gồng", 3000);
    await teleport(w9, sid9, far9.x, far9.y); // ra khỏi vòng NGAY khi quái gồng (còn ~1,1 s)
    await T.waitFor(
      `window.__scene.telegraphs.stats().spawnedWarns > ${warns9b}`,
      "client vẫn nhận vùng báo của lần gồng này",
      5000,
    );
    await until(
      () => (st2.mc.slam === undefined && st2.mc.nextSlam !== undefined ? true : false),
      "cú đập đất đáp xuống (quái đặt hồi chiêu)",
      4000,
    );
    await sleep(400); // dư thời gian để mọi sát thương (nếu có) tới
    must(
      p9.hp === p9.maxHp && !p9.dead,
      `bước ra khỏi vòng trong lúc gồng thì tránh được (khí huyết ${p9.hp} / ${p9.maxHp})`,
    );
    ok("bước ra khỏi vòng trước lúc đáp: cú đập đất trượt (khí huyết nguyên vẹn)");
    dropStatue(st2.id);
    must(T.errors.length === 0, `lỗi console ở ca 9: ${JSON.stringify(T.errors)}`);
    ok("0 lỗi console / exception");

    out(
      "\n--- Ca 10: TINH ANH thật (M7.3 bước 6): máy chủ đặt Monster.elite = 1 lúc sinh, client nhận qua schema và vẽ nhãn / vầng sáng / thanh máu; quái thường bên cạnh không đổi ---",
    );
    const TAN = "Quai Tinh Anh";
    await seedQuai(TAN);
    await login(TAN);
    await T.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room`,
      "vào game thành công",
      20000,
    );
    const w10 = await worldOf();
    const sid10 = (await ev(`window.__scene.room.sessionId`)) as string;
    const { placeMonster } = await import("../src/systems/monsters.js");
    const { MONSTER_BY_ID } = await import("@tien-gioi/shared");
    // Quái cách người 300 px (ngoài aggro của Hôi Lang): không đánh nhau, chỉ nhìn
    const spot10 = openSpot(w10, 300, 15);
    must(spot10 !== null, "có chỗ thoáng cho người + hai Hôi Lang cách 300 px");
    const lang = MONSTER_BY_ID.lang;
    const eliteId = placeMonster(w10, lang, spot10!.x - 300, spot10!.y, true);
    const plainId = placeMonster(w10, lang, spot10!.x - 300, spot10!.y + 90, false);
    isolate(w10, spot10!, "");
    const eliteSrv = w10.state.monsters.get(eliteId)!;
    must(
      eliteSrv.elite === 1 &&
        eliteSrv.kind === "lang" &&
        eliteSrv.maxHp === Math.round(lang.hp * 2.5),
      `máy chủ: tinh anh elite = 1, kind giữ "lang", khí huyết x2,5 (${eliteSrv.maxHp})`,
    );
    const p10 = w10.state.players.get(sid10)!;
    p10.hp = p10.maxHp;
    await teleport(w10, sid10, spot10!.x, spot10!.y);
    await T.waitFor(
      `!!window.__scene.monsters.get(${JSON.stringify(eliteId)}) && !!window.__scene.monsters.get(${JSON.stringify(plainId)})`,
      "client dựng cả hai con quái",
      15000,
    );
    const view10 = JSON.parse(
      (await ev(`JSON.stringify((() => { const sc = window.__scene;
        const one = (id) => { const e = sc.monsters.get(id), m = sc.state.monsters.get(id);
          return { elite: m.elite, kind: e.monKind, label: e.label ? e.label.text : null, labelColor: e.label ? e.label.style.color : null,
            aura: e.eliteAura ? e.eliteAura.visible : null, barShown: e.lastBarKey !== -1 && e.lastBarKey !== undefined, hp: m.hp, maxHp: m.maxHp }; };
        return { e: one(${JSON.stringify(eliteId)}), n: one(${JSON.stringify(plainId)}) }; })())`)) as string,
    ) as Record<
      "e" | "n",
      {
        elite: number;
        kind: string;
        label: string | null;
        labelColor: string | null;
        aura: boolean | null;
        barShown: boolean;
        hp: number;
        maxHp: number;
      }
    >;
    must(
      view10.e.elite === 1 && view10.n.elite === 0,
      `client nhận cờ tinh anh qua schema (Monster.elite): ${view10.e.elite} / ${view10.n.elite}`,
    );
    must(
      view10.e.kind === "lang" && view10.n.kind === "lang",
      "sprite / loài giữ nguyên (kind = lang cho cả hai)",
    );
    must(
      view10.e.label === "★ Hôi Lang tinh anh" &&
        view10.e.labelColor === "#ffd76a" &&
        view10.e.aura === true &&
        view10.e.barShown,
      `tinh anh thật: nhãn "${view10.e.label}" màu ${view10.e.labelColor}, vầng sáng ${view10.e.aura}, thanh máu luôn hiện ${view10.e.barShown} (khí huyết ${view10.e.hp} / ${view10.e.maxHp})`,
    );
    must(
      view10.n.label === null && view10.n.aura === null && !view10.n.barShown,
      "quái thường bên cạnh: không nhãn, không vầng sáng, thanh máu ẩn khi đầy máu",
    );
    ok(
      `tinh anh thật: client vẽ nhãn "${view10.e.label}", vầng sáng, thanh máu luôn hiện; quái thường bên cạnh không đổi`,
    );
    must(p10.hp === p10.maxHp, "hai Hôi Lang ngoài aggro: người chưa mất khí huyết");
    must(T.errors.length === 0, `lỗi console ở ca 10: ${JSON.stringify(T.errors)}`);
    ok("0 lỗi console / exception");
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
  out("\n=== E2E CHIÊU THỨC ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
