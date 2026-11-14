// E2E THẬT khắc chân linh ở màn Hoàng Tuyền (M7.2c, #503; hợp đồng `shared/` #535, máy chủ #537, client #544): server Colyseus thật + Chrome
// headless + client đã build, điều khiển bằng PHÍM THẬT (`Input.dispatchKeyEvent`, `isTrusted`), không gọi hàm của giao diện. Ca `limbo` của
// `e2e.ts` KHÔNG đụng bộ chọn khắc; ba ca ở đây đi đủ đường client -> `rebirth` -> `validateRebirth` -> `applyRebirth` -> đĩa:
//  1. ĐỔI tập chiêu: chân linh đang khắc Ưng Trảo (một chỗ), bỏ Ưng Trảo rồi chọn Hỏa Vân Kiếm => tin `rebirth` kèm `engrave`; máy chủ ghi
//     `Soul.engraved = [hoa_van_kiem]` và kiếp mới có đúng chiêu đó ở tầng 1 (`rebirthSkills`), Ưng Trảo không còn.
//  2. KHÔNG ĐỤNG bộ chọn: tin `rebirth` KHÔNG có `engrave` => máy chủ GIỮ NGUYÊN chiêu đã khắc (Ưng Trảo vẫn còn ở kiếp mới).
//  3. BỎ HẾT: bỏ chiêu đã khắc => `engrave: []` => máy chủ XOÁ HẾT (chân linh và kiếp mới đều không còn chiêu).
// Mỗi ca còn kiểm giao diện: danh sách lấy từ `LimboMsg.engravable` thật (chiêu đang khắc đứng trước), chọn sẵn chiêu đã khắc, hết chỗ thì ô còn
// lại bị khoá, Enter bật / tắt được; và KHÔNG có lỗi / cảnh báo console.
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
import { DEFAULT_MAP_ID, type Soul } from "@tien-gioi/shared";
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
async function press(tab: Tab, k: { key: string; code: string; vk: number; text?: string }) {
  const base = {
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
    modifiers: 0,
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
  out("=== E2E THẬT khắc chân linh ở Hoàng Tuyền: server Colyseus thật + Chrome headless ===");
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
  out("\n=== E2E KHẮC CHÂN LINH ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
