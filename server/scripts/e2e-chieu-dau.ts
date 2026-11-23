// E2E THẬT ba chiêu DỮ LIỆU ĐẦU TIÊN dùng cơ chế DẤU / KÍCH / ĐỒNG ĐỘI (CT8 lát 2, #1053, mục 51): server Colyseus thật + Chrome headless + client đã build, điều khiển bằng
// PHÍM THẬT (L U I). Cơ chế `mark` + `combo` + `ally` đã có test đơn vị / `skill-kit` ở máy chủ và `monster-status.test.ts` ở client, nhưng CHƯA có kịch bản nào thấy
// chúng chạy trọn vẹn từ máy chủ tới màn hình với chiêu thật:
//   1. Thiên La Lôi Cấm (dấu):  gắn `mark_loi` lên quái (xác suất 0,8: thử lại); client vẽ chấm DẤU LÔI trên đầu quái (`monsterPips`).
//   2. Chưởng Tâm Lôi Bạo (kích): trúng quái CÓ dấu Lôi thì ĂN COMBO: máy chủ gỡ dấu, tin `dmg` có `combo`, client vẽ vụ nổ dấu (`planComboBurst`), sát thương ~ x1,5 đòn
//                                 cùng chiêu KHÔNG dấu (đo ở lượt đối chứng); chấm dấu tắt.
//   3. Bách Thú Khiếu Phong (đồng đội): buff tăng tốc + hồi phục lên mình VÀ đồng đội CÙNG ĐỘI trong 500 px, KHÔNG lên đồng đội ngoài tầm.
// Quái là Linh Thố (hiền) được nâng máu + choáng dài để không chết / trả đòn giữa chừng. Mọi kết quả do máy chủ quyết định; client chỉ vẽ. 0 lỗi console là điều kiện đạt.
// Ảnh: đặt `E2E_SHOTS=<thư mục>`. Thoát 0 khi đạt, 1 khi sai. Không ghi vào `server/data/players` thật.
//
// Chạy: `npm run build -w client && npm run e2e:chieu-dau -w server` (cần google-chrome; client/dist phải là bản build mới). Mất ~1 phút.
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { DEFAULT_MAP_ID, PROTOCOL_VERSION, roomNameOf, skillOf } from "@tien-gioi/shared";
import {
  Tab,
  sleep,
  listenWithRetry,
  removeTmpDirs,
  getChromeGpuFlags,
  killChrome,
} from "./e2e-kit";
import { freePort } from "../src/test-port.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const out = (m: string) => console.log(m);

/** Bậc đồ hoạ GHIM (như `e2e-chieu-moi.ts`): bậc "Tự động" đổi theo phần cứng (runner CI không GPU -> Thấp: ít điểm hạt). */
const QUALITY = process.env.E2E_QUALITY ?? "high";

/** Phím thật qua CDP (nhấn rồi nhả). Ô 2..4 của thanh chiêu = L U I. */
const KEYS = {
  2: { key: "l", code: "KeyL", vk: 76 },
  3: { key: "u", code: "KeyU", vk: 85 },
  4: { key: "i", code: "KeyI", vk: 73 },
} as const;
async function press(tab: Tab, slot: 2 | 3 | 4) {
  const k = KEYS[slot];
  const base = {
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
  };
  await tab.send("Input.dispatchKeyEvent", {
    ...base,
    type: "keyDown",
    text: k.key,
    unmodifiedText: k.key,
  });
  await tab.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
}

/** Chiêu gắn dấu Lôi ở ô 2. Mặc định Thiên La Lôi Cấm (ground, 80 %); `E2E_MARK_SKILL=<id>` thay bằng chiêu `mark_loi` khác (vd `chan_hon_loi_phap`, #1337) để kiểm chiêu dấu MỚI qua đúng đường đã có. */
const MARK = process.env.E2E_MARK_SKILL ?? "thien_la_loi_cam";
const STRIKE = "chuong_tam_loi_bao"; // ô 3: kích dấu (cone, combo x1,5)
const AURA = "bach_thu_khieu_phong"; // ô 4: tăng tốc + hồi phục cho mình và đồng đội
const BIG_HP = 1_000_000;

async function main() {
  const CDP = await freePort();
  let PORT = await freePort();
  out("=== E2E THẬT dấu / kích / đồng đội (CT8 lát 2): server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  for (const id of [MARK, STRIKE, AURA])
    if (!skillOf(id)) throw new Error(`Chiêu ${id} chưa có trong shared (cần #1168 đã vào main)`);
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-cd-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-cd-chrome-"));
  process.env.DATA_DIR = dataDir; // `store.ts` đọc DATA_DIR lúc nạp module: nạp SAU khi đặt
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");
  const { syncPublicPos } = await import("../src/systems/movement.js");
  const { applyMonsterStatus, monsterHasStatus, clearPlayerStatus } =
    await import("../src/systems/status.js");
  const { hasStatus } = await import("../src/systems/status-rules.js");
  const { partyInvite, partyAnswer, sameParty } = await import("../src/systems/party.js");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  try {
    PORT = await listenWithRetry(httpServer, PORT, {
      explicit: false,
      pick: () => 40000 + Math.floor(Math.random() * 2000),
    });
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }
  out(`- Server E2E: http://127.0.0.1:${PORT} (dữ liệu tạm ${dataDir})`);

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
  let serverDiag: () => string = () => "";
  let ally: Awaited<ReturnType<Client["joinOrCreate"]>> | null = null;
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };
  /** Chờ điều kiện ở máy chủ (cùng tiến trình) tới `ms`; hết giờ thì thôi (câu `must` sau đó báo lỗi cụ thể). */
  const waitCond = async (cond: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (!cond() && Date.now() < end) await sleep(50);
  };
  const SECRET = "e2e_secret_chieu_dau_111111111";
  const NAME = "Chieu Dau Mot";
  const SECRET2 = "e2e_secret_chieu_dau_222222222";
  const NAME2 = "Chieu Dau Hai";

  try {
    const now = new Date().toISOString();
    // Nguyên Anh hậu kỳ (realm 4, tier 2): đã học ba chiêu ở tầng 1, gắn sẵn ô 2..4
    await savePlayer({
      name: NAME,
      secretHash: hashSecret(SECRET),
      realm: 4,
      tier: 2, // hậu kỳ: Bách Thú Khiếu Phong đòi Nguyên Anh hậu kỳ, Chưởng Tâm Lôi Bạo đòi trung kỳ
      exp: 0,
      coin: 0,
      mapId: DEFAULT_MAP_ID,
      skills: {
        learned: Object.fromEntries([MARK, STRIKE, AURA].map((id) => [id, 1])),
        slots: [MARK, STRIKE, AURA, ""],
      },
      createdAt: now,
      updatedAt: now,
    });
    // Đồng đội (người chơi thứ hai, vào bằng colyseus.js thật): chỉ cần có mặt trong phòng để nhận buff
    await savePlayer({
      name: NAME2,
      secretHash: hashSecret(SECRET2),
      realm: 1,
      tier: 0,
      exp: 0,
      coin: 0,
      mapId: DEFAULT_MAP_ID,
      createdAt: now,
      updatedAt: now,
    });

    chrome = spawn(
      "google-chrome",
      [
        "--headless=new",
        "--no-sandbox",
        ...getChromeGpuFlags(),
        `--remote-debugging-port=${CDP}`,
        `--user-data-dir=${chromeDir}`,
        "--window-size=1280,720",
        // máy tính có chuột: headless không có chuột nên `pointer` là `none` và thanh chiêu L U I O (chỉ hiện ở `(pointer: fine)`) bị ẩn
        "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2",
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    let spawnError: Error | null = null;
    chrome.once("error", (e) => (spawnError = e));
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
    if (spawnError)
      throw new Error(`Không chạy được google-chrome: ${(spawnError as Error).message}`);
    const first = targets.find((t) => t.type === "page");
    if (!first?.webSocketDebuggerUrl) throw new Error("Không kết nối được Chrome DevTools");
    tab = await Tab.open("T", first.webSocketDebuggerUrl);
    const T = tab;
    const ev = (e: string) => T.ev(e);

    // Đăng nhập bằng form thật
    await T.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tg_quality", ${JSON.stringify(QUALITY)}); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
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
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!window.__fx`,
      "vào game thành công",
      20000,
    );

    const roomId = (await ev(`window.__scene.room.roomId`)) as string;
    const world = (matchMaker.getLocalRoomById(roomId) as any)
      .world as import("../src/world.js").World;
    must(!!world, "lấy được World của phòng thật qua matchMaker");
    const sid = (await ev(`window.__scene.room.sessionId`)) as string;
    const me = world.state.players.get(sid)!;
    must(me.realm === 4, `nhân vật ở Nguyên Anh (realm ${me.realm})`);

    // Linh Thố (quái hiền) làm bao cát; người đứng cách 70 px phía tây (quạt của Chưởng Tâm Lôi Bạo tầm 90, vòng của Thiên La Lôi Cấm đặt cách 110 px phía trước) ở chỗ THOÁNG
    const STAND_DX = 70;
    let monId = "";
    let monXY = { x: 0, y: 0 };
    world.state.monsters.forEach((m, id) => {
      if (monId !== "" || m.kind !== "tho") return;
      const sx = m.x - STAND_DX;
      if (world.map.inTown(sx, m.y) || world.map.circleBlocked(sx, m.y, 20)) return;
      for (let l = 0; l <= 260; l += 20) if (world.map.circleBlocked(sx + l, m.y, 12)) return; // đường từ chỗ đứng tới quái và xa hơn phải thoáng
      monId = id;
      monXY = { x: m.x, y: m.y };
    });
    must(monId !== "", "có Linh Thố ở chỗ thoáng trong phòng");
    const mon = world.state.monsters.get(monId)!;
    // Các quái KHÁC cất vào góc xa bản đồ (ngủ vì không ai ở gần); chúng tự đi về chỗ sinh sau một lúc nên cất lại ở MỖI lần `reset`
    const stashOthers = () =>
      world.state.monsters.forEach((m, id) => {
        if (id === monId) return;
        m.x = world.map.worldW - 150;
        m.y = world.map.worldH - 150;
      });
    stashOthers();
    const stand = { x: monXY.x - STAND_DX, y: monXY.y };
    const place = async (x: number, y: number) => {
      me.x = x;
      me.y = y;
      syncPublicPos(me);
      await ev(
        `(() => { const s = window.__scene; s.predX = ${x}; s.predY = ${y}; s.facing = 0; return 1; })()`,
      );
    };
    /** Đưa người về chỗ đứng, quái về trước mặt, đầy máu + linh lực; quái CHOÁNG dài (không trả đòn); dấu cũ (nếu còn) bị gỡ */
    const reset = async () => {
      stashOthers();
      await place(stand.x, stand.y);
      mon.x = monXY.x;
      mon.y = monXY.y;
      mon.hp = BIG_HP;
      applyMonsterStatus(world, monId, { status: "stun", ms: 60_000, ratio: 0, chance: 1 }, 0, "");
      me.mp = me.maxMp;
      me.hp = me.maxHp;
      await sleep(250);
    };
    serverDiag = () => {
      const c: any = world.ctrl.get(sid);
      return `người: hp ${me.hp}/${me.maxHp} mp ${me.mp} dead ${me.dead} stunned ${c?.stunned}; quái: hp ${mon.hp} mark ${mon.mark} dấu(máy chủ) ${monsterHasStatus(world, monId, "mark_loi")}`;
    };
    await place(stand.x, stand.y);
    await T.waitFor(
      `!!window.__scene.monsterPips(${JSON.stringify(monId)})`,
      "client thấy Linh Thố (vùng nhìn đã cập nhật)",
      15000,
    );
    // Ghi lại MỌI tin `dmg` thật client nhận (bọc `onDmg`) kèm số điểm hạt do CHÍNH tin này vẽ (vụ nổ dấu của đòn ĂN COMBO)
    await ev(`(() => {
      const sc = window.__scene; window.__dmgLog = []; window.__pts = [];
      const origPts = sc.playFxPoints.bind(sc);
      sc.playFxPoints = (pts) => { window.__pts.push(Array.isArray(pts) ? pts.length : -1); return origPts(pts); };
      const orig = sc.onDmg.bind(sc);
      sc.onDmg = (m) => {
        const before = window.__pts.length;
        const r = orig(m);
        window.__dmgLog.push({ target: m?.target, amount: m?.amount, crit: !!m?.crit, combo: m?.combo === true,
          burst: window.__pts.slice(before).reduce((a, b) => a + b, 0) });
        return r;
      };
      return 1;
    })()`);
    type DmgRow = { target: string; amount: number; crit: boolean; combo: boolean; burst: number };
    const dmgLog = async () =>
      (await ev(
        `JSON.stringify(window.__dmgLog.filter((d) => d.target === ${JSON.stringify(monId)}))`,
      ).then((v) => JSON.parse(v as string))) as DmgRow[];
    const pips = async () =>
      (await ev(`JSON.stringify(window.__scene.monsterPips(${JSON.stringify(monId)}))`).then((v) =>
        JSON.parse(v as string),
      )) as { n: number; text: string; visible: boolean; draws: number } | null;
    /** Chờ ô `slot` sẵn sàng VÀ client đã thấy đủ linh lực (state của chủ tới sau một nhịp), rồi bấm phím thật */
    const cast = async (slot: 2 | 3 | 4) => {
      await T.waitFor(
        `(document.getElementById('sk-slot${slot}')?.getAttribute('aria-label') ?? '').includes('sẵn sàng') && window.__scene.me().mp >= window.__scene.me().maxMp * 0.5`,
        `ô ${slot} sẵn sàng và đủ linh lực`,
        8000,
      );
      await press(T, slot);
    };
    for (const [slot, id] of [
      [2, MARK],
      [3, STRIKE],
      [4, AURA],
    ] as const)
      await T.waitFor(
        `(document.getElementById('sk-slot${slot}')?.getAttribute('aria-label') ?? '').includes(${JSON.stringify(skillOf(id)!.name)})`,
        `thanh chiêu ô ${slot} có ${skillOf(id)!.name} (sổ chiêu từ máy chủ)`,
      );
    ok("vào game bằng form thật; sổ chiêu của máy chủ gắn đúng ba chiêu vào ô 2..4");

    /** Bấm Chưởng Tâm Lôi Bạo (ô 3) rồi chờ client nhận tin `dmg` của CHÍNH đòn đó; trả hàng ghi tương ứng */
    const strike = async (): Promise<DmgRow> => {
      const n = (await dmgLog()).length;
      await cast(3);
      await T.waitFor(
        `window.__dmgLog.filter((d) => d.target === ${JSON.stringify(monId)}).length > ${n}`,
        "client nhận tin dmg của Chưởng Tâm Lôi Bạo",
        5000,
      );
      return (await dmgLog())[n]!;
    };

    // ---------- 0. ĐỐI CHỨNG: Chưởng Tâm Lôi Bạo KHÔNG dấu ----------
    // Sát thương có độ lệch ngẫu nhiên và chí mạng (nhân đôi): lấy TRUNG BÌNH HAI đòn không chí mạng làm mốc (chờ hồi chiêu 5 s mỗi lần), để tỉ lệ combo có răng
    // (một mẫu lẻ: lỗi "mất thưởng combo" vẫn lọt ~1 / 5 lần vì độ lệch hoặc vì mẫu chí mạng bị bỏ qua)
    const ctlHits: DmgRow[] = [];
    for (let k = 0; k < 6 && ctlHits.length < 2; k++) {
      await reset(); // mỗi đòn từ đầu: đòn trước đẩy lùi / làm lệch quái khỏi tầm quạt, hoặc hết linh lực
      must(!monsterHasStatus(world, monId, "mark_loi"), "đối chứng: quái chưa có dấu Lôi");
      const h = await strike();
      must(
        !h.combo && h.burst === 0,
        `đòn KHÔNG dấu: không ăn combo, không vụ nổ dấu (${JSON.stringify(h)})`,
      );
      if (!h.crit) ctlHits.push(h);
    }
    must(ctlHits.length === 2, "lấy được hai đòn đối chứng không chí mạng trong 6 lần");
    const ctlAvg = (ctlHits[0]!.amount + ctlHits[1]!.amount) / 2;
    ok(
      `đối chứng: Chưởng Tâm Lôi Bạo không dấu -${ctlHits[0]!.amount} / -${ctlHits[1]!.amount} (trung bình ${ctlAvg.toFixed(0)}), không combo`,
    );

    // ---------- 1 + 2. GẮN DẤU (Thiên La Lôi Cấm) RỒI KÍCH DẤU (Chưởng Tâm Lôi Bạo) ----------
    // Mỗi vòng: gắn dấu (xác suất 0,8: thử lại), kiểm client vẽ chấm, kích. Đòn chí mạng (hoặc tỉ lệ thấp do độ lệch ngẫu nhiên) thì làm lại vòng, tối đa 4 vòng.
    let hit: DmgRow | null = null;
    for (let round = 0; round < 4; round++) {
      await reset();
      let tries = 0;
      for (; tries < 5 && !monsterHasStatus(world, monId, "mark_loi"); tries++) {
        await cast(2);
        await sleep(600);
      }
      must(
        monsterHasStatus(world, monId, "mark_loi"),
        `${skillOf(MARK)!.name} gắn được dấu Lôi lên quái sau ${tries} lần`,
      );
      await T.waitFor(
        `window.__scene.monsterPips(${JSON.stringify(monId)})?.text.includes('Dấu Lôi')`,
        "client vẽ chấm DẤU LÔI trên đầu quái",
        5000,
      );
      const pk = (await pips())!;
      must(pk.visible && pk.n >= 1, `hàng chấm trạng thái hiện (${JSON.stringify(pk)})`);
      if (round === 0) {
        await T.shot("chieu-dau-1-dau-loi");
        ok(`gắn dấu: máy chủ có mark_loi sau ${tries} lần, client vẽ chấm "${pk.text}"`);
      }
      const h = await strike();
      must(h.combo, `đòn trúng quái CÓ dấu ĂN COMBO (tin dmg có combo: ${JSON.stringify(h)})`);
      must(
        h.burst > 0,
        `client vẽ VỤ NỔ DẤU của đòn ăn combo (${h.burst} điểm hạt do chính tin dmg này)`,
      );
      must(
        !monsterHasStatus(world, monId, "mark_loi"),
        "máy chủ GỠ dấu sau khi ăn combo (consume)",
      );
      await T.waitFor(
        `!window.__scene.monsterPips(${JSON.stringify(monId)})?.text.includes('Dấu Lôi')`,
        "chấm DẤU LÔI tắt sau khi bị kích",
        5000,
      );
      if (!h.crit) {
        hit = h;
        if (h.amount / ctlAvg > 1.2) break; // đủ thưởng combo; thấp hơn thì thử thêm một vòng (độ lệch ngẫu nhiên), lỗi thật thì vòng nào cũng thấp
      }
    }
    must(hit !== null, "có một đòn ăn combo KHÔNG chí mạng trong 4 vòng để so sát thương");
    const ratio = hit!.amount / ctlAvg;
    // x1,5 danh nghĩa; độ lệch ngẫu nhiên vài chục phần trăm một mẫu: ngưỡng 1,2 tách khỏi x1,0 (mất thưởng combo) với trung bình đối chứng hai đòn
    must(
      ratio > 1.2 && ratio < 1.9,
      `sát thương ăn combo ~ x1,5 đòn không dấu (${hit!.amount} / ${ctlAvg.toFixed(0)} = ${ratio.toFixed(2)})`,
    );
    await T.shot("chieu-dau-2-an-combo");
    ok(
      `kích dấu: tin dmg combo, vụ nổ ${hit!.burst} điểm hạt, máy chủ gỡ dấu, chấm tắt; -${hit!.amount} / ${ctlAvg.toFixed(0)} (x${ratio.toFixed(2)})`,
    );

    // ---------- 3. ĐỒNG ĐỘI: Bách Thú Khiếu Phong ----------
    ally = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
      name: NAME2,
      secret: SECRET2,
      v: PROTOCOL_VERSION,
    });
    ally.onMessage("*", () => {});
    const sid2 = ally.sessionId;
    await waitCond(() => world.state.players.has(sid2), 5000);
    const p2 = world.state.players.get(sid2);
    must(!!p2, "đồng đội vào được phòng");
    const mate = p2!;
    const placeMate = (x: number, y: number) => {
      mate.x = x;
      mate.y = y;
      syncPublicPos(mate);
    };
    // lập đội bằng đúng hàm của máy chủ (mời -> nhận)
    partyInvite(world, sid, NAME2);
    partyAnswer(world, sid2, NAME, true);
    must(sameParty(world, sid, sid2), "hai người đã cùng một đội");
    const buffOf = (id: string) => {
      const c: any = world.ctrl.get(id);
      return {
        haste: hasStatus(c?.st, "haste", world.now),
        regen: hasStatus(c?.st, "regen", world.now),
      };
    };
    // 3a. đồng đội NGOÀI tầm (800 px > 500): chỉ mình nhận buff
    await reset();
    placeMate(me.x + 800, me.y);
    await sleep(300);
    must(
      !buffOf(sid).haste && !buffOf(sid2).haste,
      "trước khi vận: không ai có tăng tốc (reset sạch buff)",
    );
    await cast(4);
    await T.waitFor(
      `window.__scene.status.active(performance.now()).some((s) => s[0] === 'haste')`,
      "client thấy buff TĂNG TỐC của chính mình sau Bách Thú Khiếu Phong",
      5000,
    );
    must(
      buffOf(sid).haste && buffOf(sid).regen,
      "máy chủ: người vận nhận tăng tốc + hồi phục (buff cho mình)",
    );
    must(
      !buffOf(sid2).haste && !buffOf(sid2).regen,
      "đồng đội ở 800 px (ngoài tầm 500) KHÔNG nhận buff",
    );
    ok("đồng đội ngoài tầm (800 px): chỉ mình nhận tăng tốc + hồi phục, đồng đội không");
    // 3b. đồng đội TRONG tầm (200 px): cả hai nhận buff (chờ hồi chiêu 7 s, rồi xoá buff cũ để thấy buff MỚI)
    placeMate(me.x + 200, me.y);
    clearPlayerStatus(world, sid);
    clearPlayerStatus(world, sid2);
    await sleep(300);
    must(!buffOf(sid2).haste, "trước khi vận lần hai: đồng đội chưa có tăng tốc");
    await cast(4);
    await waitCond(() => buffOf(sid2).haste, 4000);
    must(
      buffOf(sid2).haste && buffOf(sid2).regen,
      "đồng đội CÙNG ĐỘI ở 200 px (trong tầm 500) nhận tăng tốc + hồi phục",
    );
    must(buffOf(sid).haste, "người vận cũng nhận buff lần hai");
    await T.shot("chieu-dau-3-dong-doi");
    ok("đồng đội trong tầm (200 px): cả hai nhận tăng tốc + hồi phục");

    must(T.errors.length === 0, `lỗi console: ${JSON.stringify(T.errors)}`);
    ok("0 lỗi console / exception");
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ THẤT BẠI: ${failed}`);
    if (tab?.errors.length) console.error(`  lỗi console: ${JSON.stringify(tab.errors)}`);
    try {
      const diag = await tab?.ev(
        `JSON.stringify({ dmg: (window.__dmgLog ?? []).map((d) => [d.amount, d.crit, d.combo, d.burst]), slots: [2, 3, 4].map((n) => document.getElementById('sk-slot' + n)?.getAttribute('aria-label')), mp: [window.__scene.me().mp, window.__scene.me().maxMp], toasts: [...document.querySelectorAll('#toast p')].map((p) => p.textContent) })`,
      );
      console.error(`  chẩn đoán: ${diag}`);
      console.error(`  máy chủ: ${serverDiag()}`);
    } catch {
      /* tab đã đóng */
    }
    await tab?.shot("chieu-dau-that-bai", { onFailure: true });
  } finally {
    try {
      await ally?.leave(true);
    } catch {
      /* bỏ qua */
    }
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
  out("\n=== E2E DẤU / KÍCH / ĐỒNG ĐỘI ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
