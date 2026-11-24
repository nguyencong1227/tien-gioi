// E2E THẬT "NGƯỜI MỚI -> CHIÊU ĐẦU TIÊN" (M7.4 #505, M7.6 #507): nhân vật VỪA TẠO (Phàm Nhân, sổ nhiệm vụ trống, chưa học chiêu nào) đi hết chuỗi mở đầu bằng PHÍM THẬT
// (`Input.dispatchKeyEvent`) trên server Colyseus thật + Chrome headless + client đã build, tới lúc dùng được chiêu đầu tiên. Các ca khác kiểm TỪNG mắt xích (`e2e-ban-phim`: nói chuyện / nhận
// việc bằng phím; `e2e-chieu`: bảng Công pháp + dùng chiêu với sổ chiêu gieo sẵn; `quests.test.ts`: phần thưởng quyển ở mức đơn vị); chưa ca nào đi liền cả chuỗi, nên một mắt xích gãy giữa
// hai bảng (lời thoại chỉ sai chỗ học, quyển không vào túi, học xong chiêu không tự gắn ô, ô gắn không dùng được) lọt qua. Chuỗi:
//  1. Trưởng trấn (F, Enter tua chữ, phím số): "Nhận nhiệm vụ: Nhập thế"; Lão Dược Sư (F): bước gặp NPC xong; Trưởng trấn: "Trả nhiệm vụ: Nhập thế", rồi nhận "Thỏ phá ruộng".
//  2. Giết 5 Linh Thố + 3 lông thỏ: rút gọn bằng chính hàm của máy chủ (`onMonsterKilled`, `giveItem`) vì đánh thật đã có ca riêng; vẫn trả nhiệm vụ bằng phím và nhận "Bước vào tiên đồ".
//  3. Đủ tu vi, phím V (Đột phá) lên Luyện Khí (ép `Math.random` = 0 đúng lúc bấm để đột phá không thất bại ngẫu nhiên: máy chủ chạy CÙNG tiến trình), Trưởng trấn: "Trả nhiệm vụ: Bước
//     vào tiên đồ". Lời thoại hoàn thành PHẢI nói đúng nơi học (Túi đồ, nút Học), quyển Hỏa Vân Kiếm Pháp vào túi.
//  4. Túi (phím B): focus ô quyển (focus = chọn ô), nút ở chi tiết ghi "Học", Enter => máy chủ học: quyển mất khỏi túi, ô chiêu 2 (L) NHẬN chiêu (thanh chiêu chỉ đổi khi máy chủ gửi
//     `skills`) và toast "Đã học ... và gắn vào ô chiêu thức" hiện, bảng Công pháp (Shift+K) có đúng một hàng "Hỏa Vân Kiếm" ghi "Ô 2".
//  5. Phím L dùng chiêu thật: máy chủ đặt hồi chiêu, client nhận `fx cast` (tầm thật); rời phòng chủ động rồi đọc hồ sơ trên đĩa: đã học tầng 1, ô 2 giữ chiêu, nhiệm vụ đã ghi xong.
// Mỗi bước còn kiểm KHÔNG có lỗi / cảnh báo console.
// Chạy: `npm run build -w client && npm run e2e:nguoi-moi -w server` (cần google-chrome).
import { execSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_MAP_ID, NPC_BY_ID, QUEST_BY_ID, questReady, skillOf } from "@tien-gioi/shared";
import { Tab, sleep, listenWithRetry, removeTmpDirs, killChrome, shown } from "./e2e-kit";
import { launchChrome } from "./e2e-chrome";
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
const F_KEY: Key = { key: "f", code: "KeyF", vk: 70, text: "f" };
const V_KEY: Key = { key: "v", code: "KeyV", vk: 86, text: "v" };
const Y_KEY: Key = { key: "y", code: "KeyY", vk: 89, text: "y" };
const B_KEY: Key = { key: "b", code: "KeyB", vk: 66, text: "b" };
const L_KEY: Key = { key: "l", code: "KeyL", vk: 76, text: "l" };
const SHIFT_K: Key = { key: "K", code: "KeyK", vk: 75, text: "K", modifiers: 8 };
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

const SKILL = "hoa_van_kiem";

async function main() {
  const CDP = await freePort();
  PORT = await freePort();
  out(
    "=== E2E THẬT người mới -> chiêu đầu tiên: server Colyseus thật + Chrome headless + phím thật ===",
  );
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-nm-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-nm-chrome-"));
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
  const SECRET = "e2e_secret_nguoi_moi_11111111";
  const NAME = "Nguoi Moi Thu";
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
    // NHÂN VẬT VỪA TẠO: Phàm Nhân, tu vi 0, không nhiệm vụ, không chiêu (thiếu `quests` / `skills` = sổ trống)
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
    must(
      me.realm === 0 && (await ev(`window.__ui.getQuestLog().active.length`)) === 0,
      "nhân vật mới: Phàm Nhân, chưa có nhiệm vụ",
    );
    const skillsNow = () =>
      ev(
        `JSON.stringify([2, 3, 4, 5].map((n) => document.getElementById('sk-slot' + n)?.getAttribute('aria-label') ?? ''))`,
      ).then((v) => JSON.parse(String(v)) as string[]);
    must(
      (await skillsNow()).every((l) => !/Hỏa Vân/.test(l)),
      "chưa có chiêu nào trên thanh chiêu",
    );

    /** Dời nhân vật (máy chủ và dự đoán của client) tới cạnh NPC rồi chờ nút Nói chuyện hiện */
    const goToNpc = async (npcId: string) => {
      const npc = NPC_BY_ID[npcId];
      me.x = npc.x;
      me.y = npc.y + 20; // sát NPC đích (20 px): từ khi có Lão Phù cạnh Trưởng trấn (G, #1071) điểm cách 50 px cách đều hai NPC
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
    const dlgText = () =>
      ev(`document.getElementById('dlg-body')?.textContent ?? ''`) as Promise<string>;
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
    /** Chọn dòng có chữ `part` bằng PHÍM SỐ, rồi chờ hộp thoại đóng (nhận việc / rời đi) */
    const choose = async (labels: string[], part: string) => {
      const i = labels.findIndex((l) => l.includes(part));
      must(i >= 0, `thiếu lựa chọn "${part}" trong ${JSON.stringify(labels)}`);
      await press(T, digit(i + 1));
      await T.waitFor(`!(${shown("dialog-modal")})`, `hộp thoại đóng sau khi chọn "${part}"`);
    };
    /**
     * Trả nhiệm vụ `questId` bằng phím số: máy chủ ghi xong nhiệm vụ rồi gửi LẠI một hộp thoại với lời thoại hoàn thành (`talk.complete`), nên hộp thoại
     * mở lại thay vì đóng. Trả về toàn bộ chữ của hộp thoại đó (Enter tua chữ trước khi đọc) rồi đóng bằng Esc.
     */
    const turnIn = async (labels: string[], questId: string) => {
      const title = QUEST_BY_ID[questId].title;
      const i = labels.findIndex((l) => l.includes(`Trả nhiệm vụ: ${title}`));
      must(i >= 0, `thiếu "Trả nhiệm vụ: ${title}" trong ${JSON.stringify(labels)}`);
      await press(T, digit(i + 1));
      await until(
        () => world.ctrl.get(sid)!.quests.done.includes(questId),
        `máy chủ ghi xong nhiệm vụ ${questId}`,
      );
      await T.waitFor(`${shown("dialog-modal")}`, "hộp thoại lời hoàn thành mở lại");
      await press(T, ENTER); // tua chữ
      const text = await dlgText();
      await press(T, ESC);
      await T.waitFor(`!(${shown("dialog-modal")})`, "Esc đóng hộp thoại lời hoàn thành");
      return text;
    };
    /** Nhiệm vụ đã qua hết các bước (cùng `questReady` với máy chủ khi dựng hộp thoại "Trả nhiệm vụ") */
    const readyOnServer = (id: string) => {
      const c = world.ctrl.get(sid)!;
      const a = c.quests.active.find((q) => q.id === id);
      return !!a && questReady(QUEST_BY_ID[id], a, questCtx(me, c));
    };
    const questState = () =>
      ev(`JSON.stringify(window.__ui.getQuestLog())`).then((v) => JSON.parse(String(v)) as any);
    const noErrors = (when: string) =>
      must(T.errors.length === 0, `lỗi console ${when}: ${JSON.stringify(T.errors)}`);

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 1. Nhập thế: Trưởng trấn -> Lão Dược Sư -> Trưởng trấn (bằng phím) ---");
    let opts = await openTalk("truong_tran");
    await choose(opts, "Nhận nhiệm vụ: Nhập thế");
    must(
      (await questState()).active.some((q: any) => q.id === "nhap_the"),
      "sổ nhiệm vụ có Nhập thế",
    );
    await openTalk("duoc_su"); // `talk` đã tính bước gặp NPC; đóng hộp bằng Esc
    await press(T, ESC);
    opts = await openTalk("truong_tran");
    await turnIn(opts, "nhap_the");
    must((await questState()).done.includes("nhap_the"), "Nhập thế đã xong (client nhận sổ mới)");
    ok("Nhập thế: nhận, gặp Lão Dược Sư, trả (phím F / Enter / số)");
    noErrors("ở bước 1");

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 2. Thỏ phá ruộng (giết rút gọn bằng hàm máy chủ) -> nhận Bước vào tiên đồ ---");
    opts = await openTalk("truong_tran");
    await choose(opts, "Nhận nhiệm vụ: Thỏ phá ruộng");
    for (let k = 0; k < 5; k++) onMonsterKilled(world, sid, "tho");
    giveItem(world, sid, "long_tho", 3);
    await until(() => readyOnServer("tru_tho"), "Thỏ phá ruộng sẵn sàng trả (5 quái + 3 lông)");
    opts = await openTalk("truong_tran");
    await turnIn(opts, "tru_tho");
    opts = await openTalk("truong_tran");
    await choose(opts, "Nhận nhiệm vụ: Bước vào tiên đồ");
    const q3 = (await questState()).active.find((q: any) => q.id === "buoc_vao_tien_do");
    must(
      !!q3 && !readyOnServer("buoc_vao_tien_do"),
      `Bước vào tiên đồ đang làm, chưa xong: ${JSON.stringify(q3)}`,
    );
    ok("Thỏ phá ruộng trả xong; Bước vào tiên đồ đang làm (cần Luyện Khí)");
    noErrors("ở bước 2");

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 3. Phím V (Đột phá) lên Luyện Khí -> trả Bước vào tiên đồ: nhận quyển ---");
    me.exp = me.expMax; // đủ tu vi (nguồn tu vi không phải điều ca này kiểm)
    await T.waitFor(
      `window.__scene.me().exp >= window.__scene.me().expMax`,
      "client thấy tu vi đầy",
    );
    world.ctrl.get(sid)!.nextBreak = 0;
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
    await until(
      () => readyOnServer("buoc_vao_tien_do"),
      "Bước vào tiên đồ sẵn sàng trả sau đột phá",
    );
    opts = await openTalk("truong_tran");
    const complete = await turnIn(opts, "buoc_vao_tien_do");
    must((await questState()).done.includes("buoc_vao_tien_do"), "Bước vào tiên đồ đã xong");
    // lời thoại hoàn thành HIỆN TRÊN MÀN HÌNH phải chỉ đúng nơi học (nit B ở #652): Túi đồ + nút Học, không gán chỗ học cho Shift+K
    must(
      /Túi đồ/.test(complete) && /Học/.test(complete) && !/Shift\+K/.test(complete),
      `lời thoại hoàn thành nêu Túi đồ + nút Học, không gán chỗ học cho Shift+K: "${complete.slice(0, 300)}"`,
    );
    ok("đột phá bằng V; trả Bước vào tiên đồ; lời thoại chỉ đúng nơi học (Túi đồ, nút Học)");
    noErrors("ở bước 3");

    // ---------------------------------------------------------------------------------------------------------------
    out(
      "\n--- 4. Túi: quyển Hỏa Vân Kiếm Pháp -> Học (Enter) -> chiêu tự gắn ô 2 -> bảng Công pháp ---",
    );
    await press(T, B_KEY);
    await T.waitFor(`${shown("inv-modal")}`, "phím B mở túi");
    const bookSlot = (await ev(
      `[...document.querySelectorAll('#inv-grid .inv-slot')].findIndex((b) => (b.getAttribute('aria-label') || '').startsWith('Hỏa Vân Kiếm Pháp'))`,
    )) as number;
    must(bookSlot >= 0, "quyển Hỏa Vân Kiếm Pháp có trong túi sau khi trả nhiệm vụ");
    await ev(`document.querySelectorAll('#inv-grid .inv-slot')[${bookSlot}].focus(); 1`);
    await T.waitFor(
      `(document.getElementById('inv-item-name')?.textContent ?? '').startsWith('Hỏa Vân Kiếm Pháp')`,
      "chi tiết ghi tên quyển khi focus ô",
    );
    const useLabel = (await ev(
      `(() => { const b = document.getElementById('inv-btn-use'); return b && !b.hidden ? b.textContent : ''; })()`,
    )) as string;
    must(useLabel.trim() === "Học", `nút ở chi tiết quyển ghi "Học" (thực tế "${useLabel}")`);
    const detailText = (await ev(`document.getElementById('inv-detail').textContent`)) as string;
    must(
      /Dạy: Hỏa Vân Kiếm/.test(detailText) && /Đủ cảnh giới/.test(detailText),
      `chi tiết quyển nói dạy chiêu nào và đủ cảnh giới để học: "${detailText.replace(/\s+/g, " ").slice(0, 200)}"`,
    );
    await press(T, ENTER);
    await T.waitFor(
      `(document.getElementById('sk-slot2')?.getAttribute('aria-label') ?? '').includes('Hỏa Vân')`,
      "máy chủ học chiêu và TỰ GẮN ô 2 (thanh chiêu đổi khi nhận `skills`)",
    );
    // thông báo học chiêu (#507 "dùng quyển từ túi hiện thông báo học / lên tầng"): toast của máy chủ hiện trên màn hình
    await T.waitFor(
      `/Đã học Hỏa Vân Kiếm và gắn vào ô chiêu thức/.test(document.getElementById('toast')?.textContent ?? '')`,
      "toast 'Đã học Hỏa Vân Kiếm và gắn vào ô chiêu thức.' hiện sau khi học",
      4000,
    );
    const sc = world.ctrl.get(sid)!.skills;
    must(
      sc.learned[SKILL] === 1 && sc.slots[0] === SKILL,
      `máy chủ: đã học ${SKILL} tầng 1, ô 2 giữ chiêu (${JSON.stringify(sc)})`,
    );
    must(
      (await ev(
        `[...document.querySelectorAll('#inv-grid .inv-slot')].every((b) => !(b.getAttribute('aria-label') || '').startsWith('Hỏa Vân Kiếm Pháp'))`,
      )) as boolean,
      "quyển được dùng hết, không còn trong túi",
    );
    await press(T, ESC);
    await T.waitFor(`!(${shown("inv-modal")})`, "Esc đóng túi");
    await press(T, SHIFT_K);
    await T.waitFor(`${shown("skills-modal")}`, "Shift+K mở bảng Công pháp");
    const rows = (await ev(
      `JSON.stringify([...document.querySelectorAll('#skills-list .sk-row')].map((r) => ({ id: r.dataset.skill, name: r.querySelector('.sk-row-name').textContent, badge: r.querySelector('.sk-row-badge').textContent })))`,
    ).then((v) => JSON.parse(String(v)))) as { id: string; name: string; badge: string }[];
    must(
      rows.length === 1 && rows[0].id === SKILL && rows[0].badge === "Ô 2",
      `bảng Công pháp: một hàng ${skillOf(SKILL)!.name} ghi "Ô 2": ${JSON.stringify(rows)}`,
    );
    await press(T, ESC);
    await T.waitFor(`!(${shown("skills-modal")})`, "Esc đóng bảng Công pháp");
    ok(
      "Học bằng Enter ở túi: quyển mất, chiêu tự gắn ô 2 (thanh chiêu + bảng Công pháp khớp máy chủ)",
    );
    noErrors("ở bước 4");

    // ---------------------------------------------------------------------------------------------------------------
    out("\n--- 5. Phím L dùng chiêu đầu tiên; rời phòng, đọc hồ sơ trên đĩa ---");
    must(
      !(await ev(`window.__scene.lastAttack`)),
      "trước khi dùng chiêu chưa có đòn nào (lastAttack trống)",
    );
    await press(T, L_KEY);
    await T.waitFor(
      `(document.getElementById('sk-slot2')?.getAttribute('aria-label') ?? '').includes('hồi chiêu')`,
      "máy chủ nhận `cast`: ô 2 vào hồi chiêu",
    );
    await T.waitFor(
      `!!window.__scene.lastAttack && window.__scene.lastAttack.range === ${skillOf(SKILL)!.range}`,
      "client nhận `fx cast` của máy chủ thật (tầm = tầm thật của Hỏa Vân Kiếm)",
    );
    ok("L: ô 2 vào hồi chiêu, client nhận hiệu ứng dùng chiêu với tầm thật");
    // Rời phòng CHỦ ĐỘNG (consented): máy chủ lưu ngay.
    await ev(`window.__scene.room.leave(true).then(() => 1)`);
    const saved = await until(() => {
      const pf = JSON.parse(readFileSync(playerFile, "utf8"));
      return pf.skills?.slots?.[0] === SKILL && pf.quests?.done?.includes("buoc_vao_tien_do")
        ? pf
        : false;
    }, "hồ sơ ghi chiêu đã học + nhiệm vụ đã xong");
    must(
      saved.realm === 1 &&
        saved.skills.learned[SKILL] === 1 &&
        JSON.stringify(saved.skills.slots) === JSON.stringify([SKILL, "", "", ""]),
      `đĩa: Luyện Khí, ${SKILL} tầng 1, ô = ${JSON.stringify(saved.skills.slots)}`,
    );
    must(
      ["nhap_the", "tru_tho", "buoc_vao_tien_do"].every((id) => saved.quests.done.includes(id)),
      `ba nhiệm vụ mở đầu đã ghi xong: ${JSON.stringify(saved.quests.done)}`,
    );
    ok(`đĩa: Luyện Khí, ${SKILL} tầng 1 ở ô 2, ba nhiệm vụ mở đầu đã xong`);
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
  out("\n=== E2E NGƯỜI MỚI ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
