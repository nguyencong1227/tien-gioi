// E2E THẬT chiêu thức: khắc chân linh ở màn Hoàng Tuyền (M7.2c, #503; hợp đồng `shared/` #535, máy chủ #537, client #544) và bảng Công pháp (M7.6, #507): server Colyseus thật + Chrome
// headless + client đã build, điều khiển bằng PHÍM THẬT (`Input.dispatchKeyEvent`, `isTrusted`), không gọi hàm của giao diện. Ca `limbo` của
// `e2e.ts` KHÔNG đụng bộ chọn khắc; ba ca ở đây đi đủ đường client -> `rebirth` -> `validateRebirth` -> `applyRebirth` -> đĩa:
//  1. ĐỔI tập chiêu: chân linh đang khắc Ưng Trảo (một chỗ), bỏ Ưng Trảo rồi chọn Hỏa Vân Kiếm => tin `rebirth` kèm `engrave`; máy chủ ghi
//     `Soul.engraved = [hoa_van_kiem]` và kiếp mới có đúng chiêu đó ở tầng 1 (`rebirthSkills`), Ưng Trảo không còn.
//  2. KHÔNG ĐỤNG bộ chọn: tin `rebirth` KHÔNG có `engrave` => máy chủ GIỮ NGUYÊN chiêu đã khắc (Ưng Trảo vẫn còn ở kiếp mới).
//  3. BỎ HẾT: bỏ chiêu đã khắc => `engrave: []` => máy chủ XOÁ HẾT (chân linh và kiếp mới đều không còn chiêu).
// Mỗi ca còn kiểm giao diện: danh sách lấy từ `LimboMsg.engravable` thật (chiêu đang khắc đứng trước), chọn sẵn chiêu đã khắc, hết chỗ thì ô còn
// lại bị khoá, Enter bật / tắt được; và KHÔNG có lỗi / cảnh báo console.
//  4. BẢNG CÔNG PHÁP (M7.6, #507, #546): nhân vật Trúc Cơ đã học ba chiêu, Shift+K mở bảng; số hiển thị khớp công thức dùng chung; Enter trên nút
//     "Ô N" gắn chiêu qua `skillSlot` THẬT (thanh chiêu chỉ đổi khi máy chủ gửi lại `skills`: client không đoán trước); gắn vào ô đang có chiêu khác thì
//     THAY, chiêu đang ở ô khác thì ĐỔI chỗ (ô cũ trống), Delete gỡ, ô chưa mở (ô 4 ở Trúc Cơ) không gửi gì; ngắt kết nối rồi đọc hồ sơ trên đĩa.
// Chạy: `npm run build -w client && npm run e2e:chieu -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
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

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 40000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const CDP = 10100 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

/** Phím thật qua CDP (nhấn rồi nhả). */
const ENTER = { key: "Enter", code: "Enter", vk: 13, text: "\r" };
const DELETE = { key: "Delete", code: "Delete", vk: 46 };
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
    const slotBtn = async (id: string, slot: number) => {
      must(await focusNav(`skillslot:${id}:${slot}`), `không focus được nút "Ô ${slot}" của ${id}`);
      await press(T, ENTER);
    };

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
    await T.shot("chieu-4-bang");

    // gắn vào ô TRỐNG: Ưng Trảo -> ô 3
    await slotBtn(UNG_TRAO, 3);
    await waitBar(3, nameOf(UNG_TRAO), "máy chủ xác nhận Ưng Trảo ở ô 3 (thanh chiêu đổi)");
    ok("Enter trên 'Ô 3' của Ưng Trảo: máy chủ gắn, thanh chiêu cập nhật");

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
