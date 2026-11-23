// E2E THẬT "TRẢ NHIỆM VỤ — BẢNG THƯỞNG ĐÚNG SỐ" (M66.5, #1339): server Colyseus thật + Chrome headless + client đã build.
// Kiểm luồng server tin `questReward` (#1331) -> client vẽ bảng thưởng (#1335):
//  1. Nhận "Nhập thế" ở Trưởng trấn, nói chuyện Hà lão (duoc_su) -> thẻ theo dõi đổi "ĐÃ ĐỦ — về gặp Lâm Thanh Tùng".
//  2. Túi đầy: trả nhiệm vụ -> KHÔNG hiện bảng thưởng, có toast "Túi đồ đã đầy", nhiệm vụ còn nguyên.
//  3. Để trống túi rồi trả: bảng thưởng hiện, tiêu đề đúng tên nhiệm vụ, dòng "+15 tu vi" khớp tăng THẬT của thanh tu vi
//     (đọc từ state máy chủ, KHÔNG chỉ chữ trên bảng), dòng "Hồi Huyết Đan ×3" khớp túi.
//  4. Trả HAI lần liên tiếp (gửi lại `questTurnIn`): chỉ MỘT bảng, túi / tu vi không tăng lần hai.
//  5. Người chơi có hệ số thử nghiệm (`testExpMult`): số trên bảng = số thực tăng (15 * hệ số), KHÔNG phải 15 gốc.
// Mỗi bước còn kiểm KHÔNG có lỗi / cảnh báo console. Chỉ TEST, KHÔNG sửa mã game.
// Chạy: `npm run build -w client && npm run e2e:quest-turnin -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  DEFAULT_MAP_ID,
  ITEM_BY_ID,
  NPC_BY_ID,
  QUEST_BY_ID,
  emptyInventory as emptyInvShared,
  expToNext,
  questReady,
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
interface Key {
  key: string;
  code: string;
  vk: number;
  text?: string;
  modifiers?: number;
}
const ENTER: Key = { key: "Enter", code: "Enter", vk: 13, text: "\r" };
const ESC: Key = { key: "Escape", code: "Escape", vk: 27 };
const F_KEY: Key = { key: "f", code: "KeyF", vk: 70, text: "f" };
const digit = (n: number): Key => ({
  key: String(n),
  code: `Digit${n}`,
  vk: 48 + n,
  text: String(n),
});
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

const QUEST_ID = "nhap_the"; // thưởng gốc: 15 tu vi + 3 Hồi Huyết Đan
const ITEM_ID = "hoi_huyet_dan";
const ITEM_BY_ID_NAME = ITEM_BY_ID[ITEM_ID].name; // "Hồi Huyết Đan"
const BASE_EXP = QUEST_BY_ID[QUEST_ID].rewards.exp; // 15
const BASE_EXP_TRU = QUEST_BY_ID["tru_tho"].rewards.exp ?? 0; // 25 (nhiệm vụ giết, dùng cho kịch bản hệ số)

/** Nội dung bảng thưởng `#quest-reward` đang hiện (đọc từ DOM client — tiêu đề + các dòng chữ). */
interface RewardBoard {
  title: string;
  lines: string[];
}

async function main() {
  const CDP = await freePort();
  PORT = await freePort();
  out(
    "=== E2E THẬT trả nhiệm vụ — bảng thưởng đúng số: server Colyseus thật + Chrome headless + phím thật ===",
  );
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-qt-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-qt-chrome-"));
  process.env.DATA_DIR = dataDir;
  // `store.ts` đọc DATA_DIR LÚC NẠP MODULE: nạp SAU khi đặt biến môi trường
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");
  const { onMonsterKilled, questCtx } = await import("../src/systems/quests.js");
  const { giveItem } = await import("../src/systems/inventory.js");
  const { syncPublicPos } = await import("../src/systems/movement.js");

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
  const SECRET = "e2e_secret_quest_turnin_22222222";
  const NAME = "Thu Nhiem Vu";
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
    // NHÂN VẬT VỪA TẠO: Phàm Nhân, tu vi 0, không nhiệm vụ, túi trống
    const now = new Date().toISOString();
    await savePlayer({
      name: NAME,
      secretHash: hashSecret(SECRET),
      realm: 0,
      tier: 0,
      exp: 0,
      coin: 0,
      mapId: DEFAULT_MAP_ID,
      createdAt: now,
      updatedAt: now,
    });
    must(existsSync(playerFile), "hồ sơ nhân vật mới đã ghi đĩa sau savePlayer");

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
    must(
      me.realm === 0 && (await ev(`window.__ui.getQuestLog().active.length`)) === 0,
      "nhân vật mới: Phàm Nhân, chưa có nhiệm vụ",
    );

    /** Dời nhân vật (máy chủ và dự đoán của client) tới cạnh NPC rồi chờ nút Nói chuyện hiện */
    const goToNpc = async (npcId: string) => {
      const npc = NPC_BY_ID[npcId];
      me.x = npc.x;
      me.y = npc.y + 20; // sát NPC đích (20 px)
      syncPublicPos(me);
      world.ctrl.get(sid)!.lastHitAt = 0;
      await ev(
        `(() => { const s = window.__scene; s.predX = ${Math.round(npc.x)}; s.predY = ${Math.round(npc.y + 20)}; return 1; })()`,
      );
      await T.waitFor(
        `window.__scene.closestNpcId === ${JSON.stringify(npcId)} && !document.getElementById('btn-talk').hidden`,
        `đứng cạnh ${npcId}`,
      );
    };
    const dlgOptions = () =>
      ev(
        `JSON.stringify([...document.querySelectorAll('#dlg-options .dlg-opt-btn')].map((b) => b.textContent))`,
      ).then((v) => JSON.parse(String(v)) as string[]);
    /** F mở hộp thoại, Enter tua chữ, rồi chờ các dòng lựa chọn; trả nhãn các lựa chọn */
    const openTalk = async (npcId: string) => {
      await goToNpc(npcId);
      await press(T, F_KEY);
      await T.waitFor(`${shown("dialog-modal")}`, `hộp thoại ${npcId} mở bằng F`);
      await press(T, ENTER);
      await T.waitFor(
        `document.querySelectorAll('#dlg-options .dlg-opt-btn').length > 0`,
        "lựa chọn hội thoại hiện sau khi tua chữ",
      );
      return dlgOptions();
    };
    /** Chọn dòng có chữ `part` bằng PHÍM SỐ, rồi chờ hộp thoại đóng */
    const choose = async (labels: string[], part: string) => {
      const i = labels.findIndex((l) => l.includes(part));
      must(i >= 0, `thiếu lựa chọn "${part}" trong ${JSON.stringify(labels)}`);
      await press(T, digit(i + 1));
      await T.waitFor(`!(${shown("dialog-modal")})`, `hộp thoại đóng sau khi chọn "${part}"`);
    };
    /** Gửi lại tin `questTurnIn` từ client (bỏ qua UI) — dùng cho kịch bản trả hai lần */
    const sendTurnIn = (questId: string) =>
      ev(`window.__scene.room.send("questTurnIn", ${JSON.stringify({ questId })}); 1`);

    /** Đọc bảng thưởng `#quest-reward` đang hiện (tự ẩn sau QUEST_REWARD_SHOW_MS): null nếu KHÔNG hiện */
    const readRewardBoard = (): Promise<RewardBoard | null> =>
      ev(
        `(() => { const b = document.getElementById('quest-reward'); if (!b || b.hidden) return null;` +
          ` return { title: (b.querySelector('.qr-title')?.textContent ?? ''),` +
          ` lines: [...b.querySelectorAll('.qr-line')].map((r) => (r.textContent || '').trim()) }; })()`,
      ).then((v) => (typeof v === "object" && v !== null ? (v as RewardBoard) : null));
    /** Chờ bảng thưởng hiện (poll bất đồng bộ, vì `until` chỉ cho hàm đồng bộ) trong `ms` */
    const pollBoard = async (ms: number): Promise<RewardBoard | null> => {
      const end = Date.now() + ms;
      for (;;) {
        const b = await readRewardBoard();
        if (b) return b;
        if (Date.now() >= end) return null;
        await sleep(100);
      }
    };
    const questState = () =>
      ev(`JSON.stringify(window.__ui.getQuestLog())`).then((v) => JSON.parse(String(v)) as any);
    const toastText = () => ev(`(document.getElementById('toast')?.textContent ?? '').trim()`);
    /** Số lượng một vật phẩm TRONG TÚI (đọc state máy chủ — nguồn sự thật, không chỉ UI) */
    const bagQty = (itemId: string) => {
      const inv = world.ctrl.get(sid)!.inv;
      return inv.reduce((n, s) => (s?.itemId === itemId ? n + (s.qty ?? 0) : n), 0);
    };
    const expNow = () => me.exp;
    const noErrors = (when: string) =>
      must(T.errors.length === 0, `lỗi console ${when}: ${JSON.stringify(T.errors)}`);

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 1. Nhận Nhập thế -> nói chuyện Hà lão -> thẻ theo dõi 'ĐÃ ĐỦ — về gặp ...' ---");
    let opts = await openTalk("truong_tran");
    await choose(opts, "Nhận nhiệm vụ: Nhập thế");
    must(
      (await questState()).active.some((q: any) => q.id === QUEST_ID),
      "sổ nhiệm vụ có Nhập thế",
    );
    await openTalk("duoc_su"); // bước "talk" gặp Hà lão
    await press(T, ESC);
    // Chờ thẻ theo dõi đổi sang "ĐÃ ĐỦ — về gặp Lâm Thanh Tùng" (giver = truong_tran, name "Lâm Thanh Tùng").
    // Đọc textContent qua ev() CHỈ chữ ASCII, so sánh tiếng Việt ở Node: KHÔNG đưa chuỗi đa byte vào biểu thức CDP
    // (Runtime.evaluate ném "Uncaught" với chữ Việt — mọi ev()/waitFor khác trong các e2e đều ASCII).
    const trackerReady = async () => {
      const t = (
        ((await ev(
          `(document.getElementById('quest-tracker-list')?.textContent)||''`,
        )) as string) ?? ""
      ).replace(/\s+/g, " ");
      return t.includes("ĐÃ ĐỦ") && t.includes("về gặp Lâm Thanh Tùng");
    };
    let trackerOk = false;
    for (const start = Date.now(); Date.now() - start < 15000;) {
      try {
        if (await trackerReady()) {
          trackerOk = true;
          break;
        }
      } catch {
        /* đang chờ thẻ cập nhật */
      }
      await sleep(150);
    }
    must(trackerOk, "thẻ theo dõi đổi sang ĐÃ ĐỦ — về gặp Lâm Thanh Tùng sau khi đủ mục tiêu");
    ok("Nhận Nhập thế, gặp Hà lão, thẻ theo dõi báo ĐÃ ĐỦ — về gặp Lâm Thanh Tùng");
    noErrors("ở bước 1");

    // ---------------------------------------------------------------------------------------------------------------
    out(
      "\n--- 2. Túi đầy: trả nhiệm vụ -> KHÔNG bảng thưởng + toast 'Túi đồ đã đầy' + nhiệm vụ còn nguyên ---",
    );
    // ĐIỀN ĐẦY 24 ô túi (mỗi ô đầy stack 99): không còn chỗ cho thưởng 3 đan -> trả phải thất bại.
    // (giveItem cộng dồn theo stack: da_ho stack 99 nên 24 cái chỉ chiếm 1 ô — phải đặt trực tiếp đủ 24 ô.)
    world.ctrl.get(sid)!.inv = Array.from({ length: 24 }, () => ({ itemId: "da_ho", qty: 99 }));
    must(
      bagQty(ITEM_ID) === 0 && world.ctrl.get(sid)!.inv.every((s) => s !== null),
      "túi đã điền đầy 24 ô",
    );
    const expBeforeFull = expNow();
    opts = await openTalk("truong_tran");
    await sendTurnIn(QUEST_ID); // trả bằng tin thật
    // KHÔNG có bảng thưởng: chờ nhẹ rồi khẳng định #quest-reward ẩn
    await sleep(600);
    must((await readRewardBoard()) === null, "túi đầy: KHÔNG hiện bảng thưởng");
    must(
      /Túi đồ đã đầy/i.test(await toastText()),
      `túi đầy: toast 'Túi đồ đã đầy' (thực tế '${await toastText()}')`,
    );
    must(
      (await questState()).active.some((q: any) => q.id === QUEST_ID),
      "túi đầy: nhiệm vụ vẫn đang làm (chưa xong)",
    );
    must(expNow() === expBeforeFull, "túi đầy: tu vi không tăng");
    must(bagQty(ITEM_ID) === 0, "túi đầy: không nhận đan");
    ok("túi đầy: không bảng thưởng, toast 'Túi đồ đã đầy', nhiệm vụ + tu vi + túi giữ nguyên");
    await press(T, ESC); // đóng hộp thoại (trả thô không tự đóng) để mở lại sạch ở bước sau
    noErrors("ở bước 2");

    // ---------------------------------------------------------------------------------------------------------------
    out(
      "\n--- 3. Để trống túi -> trả: bảng thưởng đúng tên, +15 tu vi khớp tăng thật, ×3 đan khớp túi ---",
    );
    world.ctrl.get(sid)!.inv = emptyInvShared(); // dọn túi
    must(bagQty("da_ho") === 0, "túi đã dọn trống");
    const expBefore = expNow();
    const danBefore = bagQty(ITEM_ID);
    opts = await openTalk("truong_tran");
    await sendTurnIn(QUEST_ID);
    const board = await pollBoard(4000); // `until` chỉ cho hàm đồng bộ; bảng đọc qua ev() trả Promise
    must(board !== null, "trả thành công: bảng thưởng hiện");
    must(
      board!.title === `Hoàn thành: ${QUEST_BY_ID[QUEST_ID].title}`,
      `tiêu đề bảng = 'Hoàn thành: Nhập thế' (thực tế '${board!.title}')`,
    );
    const expLine = board!.lines.find((l) => /tu vi/.test(l));
    must(!!expLine, `dòng tu vi trên bảng: ${JSON.stringify(board!.lines)}`);
    const boardExp = Number(/([\d,]+)/.exec(expLine!)?.[1]?.replace(/,/g, ""));
    const realGained = expNow() - expBefore;
    must(
      boardExp === realGained && realGained === BASE_EXP,
      `dòng '+${boardExp} tu vi' khớp tăng THẬT ${realGained} = thưởng gốc ${BASE_EXP}`,
    );
    const itemLine = board!.lines.find((l) => l.includes(ITEM_BY_ID_NAME));
    must(
      !!itemLine && new RegExp(`${ITEM_BY_ID_NAME} ×3`).test(itemLine),
      `dòng thưởng đan '×3' (thực tế '${itemLine}', toàn bộ ${JSON.stringify(board!.lines)})`,
    );
    must(
      bagQty(ITEM_ID) - danBefore === 3,
      `túi tăng đúng 3 ${ITEM_BY_ID_NAME} (thực tế ${bagQty(ITEM_ID) - danBefore})`,
    );
    must((await questState()).done.includes(QUEST_ID), "nhiệm vụ đã xong (client nhận sổ mới)");
    ok(`bảng thưởng: '${board!.title}', '${expLine}', '${itemLine}'; túi +3, tu vi +${realGained}`);
    noErrors("ở bước 3");

    // ---------------------------------------------------------------------------------------------------------------
    out(
      "\n--- 4. Trả HAI lần liên tiếp (gửi lại questTurnIn): chỉ MỘT bảng, túi / tu vi không tăng lần hai ---",
    );
    // Chờ bảng thưởng của bước 3 TỰ ẨN (QUEST_REWARD_SHOW_MS = 6s) trước khi kiểm trả lại — tránh nhầm bảng cũ.
    const waitBoardGone = async (ms: number) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (!(await readRewardBoard())) return true;
        await sleep(100);
      }
      return false;
    };
    must(await waitBoardGone(9000), "bảng thưởng bước 3 đã tự ẩn trước khi trả lại");
    const expBefore2 = expNow();
    const danBefore2 = bagQty(ITEM_ID);
    await sendTurnIn(QUEST_ID); // lần 2
    await sendTurnIn(QUEST_ID); // lần 3
    // Trong 1,5s tới KHÔNG được có bảng thưởng MỚI (nhiệm vụ đã xong, gửi lại questTurnIn không trao thưởng). Dùng kiểu
    // `end = Date.now() + ms` (như waitBoardGone / pollBoard): KHÔNG dùng `Date.now() - start < N` vì e2e-cdp-wait.test.ts
    // quét đúng mẫu đó coi là vòng chờ CDP khởi động lạnh (#694, đòi >= 15s); đây là cửa sổ kiểm trạng thái game, không chờ CDP.
    const leakEnd = Date.now() + 1500;
    let leaked = false;
    while (Date.now() < leakEnd) {
      if (await readRewardBoard()) {
        leaked = true;
        break;
      }
      await sleep(100);
    }
    must(!leaked, "trả lại: KHÔNG hiện bảng thưởng lần hai");
    must(expNow() === expBefore2, "trả lại: tu vi không tăng lần hai");
    must(bagQty(ITEM_ID) === danBefore2, "trả lại: túi không tăng lần hai");
    ok("trả nhiều lần: chỉ một bảng, tu vi / túi giữ nguyên");
    noErrors("ở bước 4");

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 5. Người chơi có hệ số thử nghiệm: số trên bảng = số thực tăng (15 * hệ số) ---");
    // Nhận + hoàn thành một nhiệm vụ GIẾT để có cơ hội trả với hệ số: dùng 'tru_tho' (thưởng 25), hệ số 4 -> 100
    // Đảm bảo KHÔNG tràn exp / KHÔNG lên tầng: đặt tu vi về 0 ở Luyện Khí tầng 1 và TÍNH LẠI expMax (=280). Gán thẳng
    // realm/tier mà không cập nhật expMax để nó giữ mặc định 40 -> thưởng 100 vượt 40 gây up tầng (exp bị "tiêu" chuyển
    // tầng), lúc đó bảng thưởng (=số thưởng đầy, 100) khác tăng THẬT (còn lại sau khi lên tầng) -> lệch. `applyStats`
    // (nơi duy nhất cập nhật expMax) chỉ chạy khi up tầng, không chạy khi ta gán trực tiếp nên phải tính lại ở đây.
    me.exp = 0;
    me.realm = 1;
    me.tier = 0;
    me.expMax = expToNext(me.realm, me.tier); // = 280: thưởng 100 vừa đủ, KHÔNG up tầng -> bảng = tăng thật
    world.ctrl.get(sid)!.testExpMult = 4; // mô phỏng TEST_EXP_MULT cho nhân vật này
    opts = await openTalk("truong_tran");
    await choose(opts, "Nhận nhiệm vụ: Thỏ phá ruộng");
    for (let k = 0; k < 5; k++) onMonsterKilled(world, sid, "tho");
    giveItem(world, sid, "long_tho", 3);
    await until(() => {
      const c = world.ctrl.get(sid)!;
      const a = c.quests.active.find((q) => q.id === "tru_tho");
      return !!a && questReady(QUEST_BY_ID["tru_tho"], a, questCtx(me, c));
    }, "Thỏ phá ruộng sẵn sàng trả");
    // Giữ long_tho×3 để NỘP (bước collect của tru_tho); dọn các ô còn lại cho sạch. KHÔNG dọn hết túi: thiếu đồ nộp
    // thì exchangeItems trả false -> trả thất bại, KHÔNG có bảng thưởng.
    world.ctrl.get(sid)!.inv = Array.from({ length: 24 }, (_, i) =>
      i === 0 ? { itemId: "long_tho", qty: 3 } : null,
    );
    const expB = expNow();
    opts = await openTalk("truong_tran");
    await sendTurnIn("tru_tho");
    const board2 = await pollBoard(4000); // `until` chỉ cho hàm đồng bộ; bảng đọc qua ev() trả Promise
    must(board2 !== null, "trả Thỏ phá ruộng với hệ số: bảng thưởng hiện");
    const expLine2 = board2!.lines.find((l) => /tu vi/.test(l));
    const boardExp2 = Number(/([\d,]+)/.exec(expLine2!)?.[1]?.replace(/,/g, ""));
    const realGained2 = expNow() - expB;
    must(
      boardExp2 === realGained2 && realGained2 === BASE_EXP_TRU * 4,
      `hệ số 4: dòng '+${boardExp2} tu vi' khớp tăng THẬT ${realGained2} = ${BASE_EXP_TRU}×4`,
    );
    ok(`hệ số thử nghiệm: bảng '+${boardExp2} tu vi' = tăng thật (25×4)`);
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
  out("\n=== E2E TRẢ NHIỆM VỤ ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
