// E2E THẬT "TRẢ NHIỆM VỤ -> BẢNG THƯỞNG" (QUYET_DINH_M3 mục 66.5, #1339 mục 1): server Colyseus thật + Chrome headless + client đã build + PHÍM THẬT.
// Các test đơn vị (`quest-reward-msg.test.ts`, `quest-reward-view.test.ts`, `check-quest-reward.mjs` ở chế độ mock) không đi hết chuỗi máy chủ -> mạng -> DOM; ca này đi liền
// cả chuỗi với nhân vật VỪA TẠO (Phàm Nhân, sổ nhiệm vụ trống) và kiểm số liệu từ TRẠNG THÁI THẬT (máy chủ + HUD), KHÔNG chỉ tin chữ trên bảng:
//  1. Nhận "Nhập thế" (Trưởng trấn), gặp Hà lão: thẻ theo dõi đổi sang "ĐÃ ĐỦ", toast "ĐÃ ĐỦ: Nhập thế" hiện ĐÚNG MỘT lần, CHƯA có bảng thưởng (chưa trả).
//  2. Hệ số tu vi (`testExpMult` = 2, như `TEST_EXP_MULT` hoặc buff tông môn): bảng phải ghi số THẬT (+30), không phải 15 gốc.
//  3. TÚI ĐẦY: lấp đủ 24 ô rồi bấm "Trả nhiệm vụ": KHÔNG hiện bảng, có toast "Túi đồ đã đầy", nhiệm vụ còn nguyên (còn đủ để trả), tu vi / túi không đổi.
//  4. Mở một ô rồi trả lại: bảng hiện, tiêu đề "Hoàn thành: Nhập thế", dòng "+30 tu vi" KHỚP tăng thật của `exp` trên máy chủ VÀ chữ trên thanh tu vi của HUD,
//     dòng "Hồi Huyết Đan ×3" khớp số Hồi Huyết Đan thật vào túi.
//  5. Gửi LẠI `questTurnIn` (trả lần hai): vẫn đúng MỘT bảng, tu vi / túi không tăng thêm, nhiệm vụ chỉ nằm một lần trong danh sách xong.
// Mỗi bước còn kiểm KHÔNG có lỗi / cảnh báo console. Chờ theo điều kiện (không `sleep` cố định, trừ cửa sổ chặn "không có gì xảy ra" ở bước 5 dùng ping làm rào chắn:
// máy chủ xử lý tin theo thứ tự nên pong về nghĩa là `questTurnIn` gửi trước đó đã xử lý xong).
// Chạy: `npm run build -w client && npm run e2e:tra-nhiem-vu -w server` (cần google-chrome).
import { execSync, type ChildProcess } from "node:child_process";
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
  HEARTBEAT_MSG,
  INVENTORY_SLOTS,
  ITEMS,
  NPC_BY_ID,
  QUEST_BY_ID,
  questReady,
} from "@tien-gioi/shared";
import { Tab, sleep, listenWithRetry, removeTmpDirs, killChrome, shown } from "./e2e-kit";
import { launchChrome } from "./e2e-chrome";
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
  };
  await tab.send("Input.dispatchKeyEvent", {
    ...base,
    type: k.text ? "keyDown" : "rawKeyDown",
    ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}),
  });
  await tab.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
  await sleep(150); // cho DOM vẽ lại
}

const QUEST_ID = "nhap_the";
/** Hệ số tu vi giả lập (như `TEST_EXP_MULT` / buff tông môn): 15 gốc x 2 = 30 (< thanh 40 của Phàm Nhân nên không lên bậc làm lệch số). */
const EXP_MULT = 2;

async function main() {
  const CDP = await freePort();
  PORT = await freePort();
  out(
    "=== E2E THẬT trả nhiệm vụ -> bảng thưởng: server Colyseus thật + Chrome headless + phím thật ===",
  );
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-tnv-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-tnv-chrome-"));
  process.env.DATA_DIR = dataDir;
  // `store.ts` đọc DATA_DIR LÚC NẠP MODULE: nạp SAU khi đặt biến môi trường
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");
  const { questCtx } = await import("../src/systems/quests.js");
  const { giveItem, sendInv } = await import("../src/systems/inventory.js");
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
  const SECRET = "e2e_secret_tra_nhiem_vu_1111111";
  const NAME = "Tra Nhiem Vu Thu";

  /** Chờ `fn()` trả giá trị thật (trạng thái máy chủ) trong `ms`. */
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
        /* chưa sẵn sàng */
      }
      await sleep(100);
    }
    throw new Error(`Hết thời gian chờ (${ms} ms): ${label}`);
  };

  try {
    // NHÂN VẬT VỪA TẠO: Phàm Nhân, tu vi 0, không nhiệm vụ
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

    const launched = await launchChrome({
      cdpPort: CDP,
      userDataDir: chromeDir,
      log: out,
    });
    chrome = launched.chrome;
    tab = await Tab.open("A", launched.webSocketDebuggerUrl);
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
    const ctrl = world.ctrl.get(sid)!;
    must(
      me.realm === 0 && (await ev(`window.__ui.getQuestLog().active.length`)) === 0,
      "nhân vật mới: Phàm Nhân, chưa có nhiệm vụ",
    );
    ctrl.testExpMult = EXP_MULT; // hệ số thử nghiệm: bảng phải ghi số THẬT, không phải 15 gốc
    const def = QUEST_BY_ID[QUEST_ID];
    const baseExp = def.rewards.exp ?? 0;
    const potion = def.rewards.items![0]; // dữ liệu đúng như issue được `must` ngay dưới kiểm lại
    must(
      baseExp === 15 && potion.itemId === "hoi_huyet_dan" && potion.qty === 3,
      `dữ liệu Nhập thế đúng như issue (+15 tu vi, Hồi Huyết Đan x3): ${JSON.stringify(def.rewards)}`,
    );
    const realExp = baseExp * EXP_MULT;
    const potionInBag = () =>
      ctrl.inv.reduce((n, s) => n + (s?.itemId === potion.itemId ? s.qty : 0), 0);

    // Đếm bảng thưởng THỰC SỰ vẽ (mỗi lần `showQuestReward` thêm một `.qr-title`) và toast "ĐÃ ĐỦ" (mỗi dòng toast là một phần tử con riêng)
    await ev(`(() => {
      window.__qrCount = 0; window.__readyToasts = 0; window.__fullToasts = 0;
      const seen = new WeakSet();
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('qr-title')) window.__qrCount++; })
        .observe(document.getElementById('quest-reward'), { childList: true });
      new MutationObserver(() => { for (const el of document.getElementById('toast').querySelectorAll('*')) {
        const t = el.textContent || '';
        if (seen.has(el)) continue;
        if (t.includes('ĐÃ ĐỦ: Nhập thế')) { seen.add(el); window.__readyToasts++; }
        else if (t.includes('Túi đồ đã đầy')) { seen.add(el); window.__fullToasts++; }
      } }).observe(document.getElementById('toast'), { childList: true, subtree: true, characterData: true });
      return 1; })()`);
    const counters = () =>
      ev(
        `JSON.stringify({ qr: window.__qrCount, ready: window.__readyToasts, full: window.__fullToasts })`,
      ).then((v) => JSON.parse(String(v)) as { qr: number; ready: number; full: number });

    /** Dời nhân vật (máy chủ và dự đoán của client) tới cạnh NPC rồi chờ nút Nói chuyện hiện */
    const goToNpc = async (npcId: string) => {
      const npc = NPC_BY_ID[npcId];
      me.x = npc.x;
      me.y = npc.y + 20;
      syncPublicPos(me);
      ctrl.lastHitAt = 0;
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
    /** Bấm PHÍM SỐ của dòng có chữ `part` */
    const chooseKey = async (labels: string[], part: string) => {
      const i = labels.findIndex((l) => l.includes(part));
      must(i >= 0, `thiếu lựa chọn "${part}" trong ${JSON.stringify(labels)}`);
      await press(T, digit(i + 1));
    };
    const closeDialog = async () => {
      if (await ev(`!!(${shown("dialog-modal")})`)) {
        await press(T, ESC);
        await T.waitFor(`!(${shown("dialog-modal")})`, "Esc đóng hộp thoại");
      }
    };
    const readyOnServer = () => {
      const a = ctrl.quests.active.find((q) => q.id === QUEST_ID);
      return !!a && questReady(def, a, questCtx(me, ctrl));
    };
    /** Rào chắn thứ tự: pong về nghĩa là MỌI tin client gửi trước đó đã được máy chủ xử lý xong (cùng một phòng, xử lý theo thứ tự). */
    const barrier = () =>
      ev(
        `new Promise((resolve) => { const r = window.__scene.room;
          const off = r.onMessage(${JSON.stringify(HEARTBEAT_MSG.pong)}, () => { off?.(); resolve(1); });
          r.send(${JSON.stringify(HEARTBEAT_MSG.ping)}, { t: Date.now() }); })`,
      );
    const noErrors = (when: string) =>
      must(T.errors.length === 0, `lỗi console ${when}: ${JSON.stringify(T.errors)}`);

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 1. Nhận Nhập thế, gặp Hà lão: thẻ 'ĐÃ ĐỦ' + toast MỘT lần, chưa có bảng thưởng ---");
    let opts = await openTalk("truong_tran");
    await chooseKey(opts, "Nhận nhiệm vụ: Nhập thế");
    await T.waitFor(`!(${shown("dialog-modal")})`, "hộp thoại đóng sau khi nhận");
    await T.waitFor(
      `window.__ui.getQuestLog().active.some((q) => q.id === ${JSON.stringify(QUEST_ID)})`,
      "sổ nhiệm vụ có Nhập thế",
    );
    must(!readyOnServer(), "vừa nhận: CHƯA đủ mục tiêu (còn phải gặp Hà lão)");
    must((await counters()).ready === 0, "chưa đủ mục tiêu: chưa có toast 'ĐÃ ĐỦ'");
    await openTalk("duoc_su"); // `talk` tính bước gặp NPC; đóng hộp bằng Esc
    await closeDialog();
    await until(() => readyOnServer(), "máy chủ coi Nhập thế đã đủ mục tiêu");
    await T.waitFor(
      `(document.getElementById('quest-tracker-list')?.textContent ?? '').includes('ĐÃ ĐỦ')`,
      "thẻ theo dõi nhiệm vụ đổi sang 'ĐÃ ĐỦ'",
    );
    await T.waitFor(`window.__readyToasts >= 1`, "toast 'ĐÃ ĐỦ: Nhập thế' hiện");
    await barrier(); // cho mọi tin đến sau đó (nếu có báo trùng) về hết rồi mới đếm
    const c1 = await counters();
    must(c1.ready === 1, `toast 'ĐÃ ĐỦ: Nhập thế' ĐÚNG MỘT lần (đếm được ${c1.ready})`);
    must(c1.qr === 0, `chưa trả: CHƯA có bảng thưởng (đếm được ${c1.qr})`);
    ok("thẻ theo dõi ghi 'ĐÃ ĐỦ', toast báo đúng một lần, chưa có bảng thưởng");
    noErrors("ở bước 1");

    // ---------------------------------------------------------------------------------------------------------------
    out(
      "\n--- 2. TÚI ĐẦY: bấm Trả nhiệm vụ => KHÔNG có bảng, toast 'Túi đồ đã đầy', nhiệm vụ còn nguyên ---",
    );
    const expBefore = me.exp;
    must(expBefore === 0, `trước khi trả: tu vi 0 (đang ${expBefore})`);
    const junk = ITEMS.filter((it) => it.id !== potion.itemId)
      .map((it) => it.id)
      .slice(0, INVENTORY_SLOTS);
    for (const id of junk) giveItem(world, sid, id, 1);
    must(
      ctrl.inv.every((s) => s !== null) && potionInBag() === 0,
      "túi đã đầy đủ 24 ô và KHÔNG có Hồi Huyết Đan",
    );
    opts = await openTalk("truong_tran");
    await chooseKey(opts, "Trả nhiệm vụ: Nhập thế");
    await T.waitFor(`window.__fullToasts >= 1`, "toast 'Túi đồ đã đầy' hiện");
    await barrier();
    const c2 = await counters();
    must(c2.qr === 0, `túi đầy: KHÔNG hiện bảng thưởng (đếm được ${c2.qr})`);
    must(
      !ctrl.quests.done.includes(QUEST_ID) && readyOnServer(),
      "túi đầy: nhiệm vụ còn nguyên (chưa xong, vẫn đủ để trả)",
    );
    must(me.exp === expBefore, `túi đầy: tu vi không đổi (${me.exp})`);
    must(potionInBag() === 0, "túi đầy: không có Hồi Huyết Đan nào lọt vào túi");
    await closeDialog();
    ok("túi đầy: không bảng, có toast 'Túi đồ đã đầy', nhiệm vụ / tu vi / túi không đổi");
    noErrors("ở bước 2");

    // ---------------------------------------------------------------------------------------------------------------
    out(
      "\n--- 3. Mở một ô rồi trả lại: bảng đúng số THẬT (tu vi nhân hệ số), khớp máy chủ + HUD + túi ---",
    );
    ctrl.inv[ctrl.inv.findIndex((s) => s !== null)] = null; // trả lại đúng một ô trống
    sendInv(world, sid);
    opts = await openTalk("truong_tran");
    await chooseKey(opts, "Trả nhiệm vụ: Nhập thế");
    await until(() => ctrl.quests.done.includes(QUEST_ID), "máy chủ ghi xong Nhập thế");
    await T.waitFor(`!document.getElementById('quest-reward').hidden`, "bảng thưởng hiện");
    const panel = JSON.parse(
      String(
        await ev(`JSON.stringify({
          title: document.querySelector('#quest-reward .qr-title')?.textContent ?? '',
          exp: document.querySelector('#quest-reward .qr-exp')?.textContent ?? '',
          items: [...document.querySelectorAll('#quest-reward .qr-item')].map((e) => e.textContent),
          hud: document.getElementById('exp-text')?.textContent ?? '',
        })`),
      ),
    ) as { title: string; exp: string; items: string[]; hud: string };
    must(panel.title === `Hoàn thành: ${def.title}`, `tiêu đề bảng: "${panel.title}"`);
    const gotExp = me.exp - expBefore;
    must(
      gotExp === realExp,
      `máy chủ cộng ${gotExp} tu vi (cần ${realExp} = ${baseExp} x ${EXP_MULT})`,
    );
    must(
      panel.exp.includes(`+${realExp} tu vi`) && !panel.exp.includes(`+${baseExp} tu vi`),
      `dòng tu vi trên bảng ghi số THẬT +${realExp} (không phải ${baseExp} gốc): "${panel.exp}"`,
    );
    must(
      new RegExp(`(^|\\D)${me.exp}\\s*/\\s*${me.expMax}(\\D|$)`).test(panel.hud),
      `thanh tu vi HUD khớp trạng thái máy chủ ${me.exp} / ${me.expMax}: "${panel.hud}"`,
    );
    must(
      potionInBag() === potion.qty,
      `túi thật có ${potionInBag()} Hồi Huyết Đan (cần ${potion.qty})`,
    );
    must(
      panel.items.length === 1 && panel.items[0].includes(`Hồi Huyết Đan ×${potion.qty}`),
      `dòng vật phẩm ghi Hồi Huyết Đan ×${potion.qty}: ${JSON.stringify(panel.items)}`,
    );
    const c3 = await counters();
    must(c3.qr === 1, `đúng MỘT bảng sau lần trả thành công (đếm được ${c3.qr})`);
    // Không toast nào CHỒNG lên bảng thưởng (ca người chơi phát hiện bằng ảnh chơi thử AI, v0.5.4): máy chủ gửi toast "Hoàn thành: <tên>" ngay trước
    // `questReward`, toast nằm ở 16 % chiều cao còn bảng ở 64 px nên che dòng vật phẩm; chữ trùng tiêu đề bảng nên bảng đã đủ, không cần toast.
    // Chờ hai khung hình cho DOM yên (toast vừa thêm / vừa bị gỡ), rồi đo hình chữ nhật của từng dòng toast với bảng.
    await ev(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const overlap = JSON.parse(
      String(
        await ev(`JSON.stringify((() => {
          const panel = document.getElementById('quest-reward').getBoundingClientRect();
          return [...document.querySelectorAll('#toast p')].map((p) => {
            const r = p.getBoundingClientRect();
            const w = Math.min(r.right, panel.right) - Math.max(r.left, panel.left);
            const h = Math.min(r.bottom, panel.bottom) - Math.max(r.top, panel.top);
            return { text: p.textContent, hit: r.width > 0 && r.height > 0 && w > 0 && h > 0 };
          });
        })())`),
      ),
    ) as { text: string; hit: boolean }[];
    must(
      !overlap.some((t) => t.text === panel.title || t.text?.startsWith(`ĐÃ ĐỦ: ${def.title}`)),
      `toast lặp lại điều bảng đã nói ("${panel.title}" / "ĐÃ ĐỦ: ...") phải bị gỡ: ${JSON.stringify(overlap.map((t) => t.text))}`,
    );
    must(
      overlap.every((t) => !t.hit),
      `không toast nào chồng lên bảng thưởng: ${JSON.stringify(overlap.filter((t) => t.hit))}`,
    );
    ok(
      `bảng "${panel.title}": +${realExp} tu vi (= tăng thật ${gotExp}, HUD "${panel.hud}"), Hồi Huyết Đan ×${potion.qty} (= túi thật)`,
    );
    await closeDialog(); // hộp lời cảm ơn
    noErrors("ở bước 3");

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 4. Trả LẦN HAI (gửi lại questTurnIn): vẫn một bảng, tu vi / túi không tăng ---");
    await goToNpc("truong_tran");
    const expAfter = me.exp;
    const potionAfter = potionInBag();
    await ev(
      `window.__scene.room.send("questTurnIn", { questId: ${JSON.stringify(QUEST_ID)} }); 1`,
    );
    await barrier();
    const c4 = await counters();
    must(c4.qr === 1, `trả lần hai: vẫn đúng MỘT bảng (đếm được ${c4.qr})`);
    must(me.exp === expAfter, `trả lần hai: tu vi không tăng (${expAfter} -> ${me.exp})`);
    must(
      potionInBag() === potionAfter,
      `trả lần hai: túi không tăng (${potionAfter} -> ${potionInBag()})`,
    );
    must(
      ctrl.quests.done.filter((id) => id === QUEST_ID).length === 1 &&
        !ctrl.quests.active.some((q) => q.id === QUEST_ID),
      "Nhập thế chỉ nằm MỘT lần trong danh sách đã xong và không còn đang làm",
    );
    ok("trả lần hai: không bảng thứ hai, tu vi / túi / danh sách xong không đổi");
    noErrors("ở bước 4");
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
