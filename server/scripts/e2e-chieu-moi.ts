// E2E THẬT sáu chiêu GỐC dùng HÌNH MỚI (CT9 lát 1, #1054, mục 51): server Colyseus thật + Chrome headless + client đã build, điều khiển bằng PHÍM THẬT (L U I O,
// `Input.dispatchKeyEvent`). Đây là lần ĐẦU các hình của CT11 (đạn bay / sét lan / vật thể bền / chiêu vận) chạy với chiêu THẬT chứ không phải mock:
//   1. Độc Đằng Phục (bẫy):   `fx trap` -> vật thể bền hiện ngay, CHƯA kích hoạt (armMs 600), rồi kích hoạt; quái bước vào bán kính -> máy chủ `fxEnd pop`:
//                              vật thể gỡ + hạt nổ, quái mất máu.
//   2. Phi Kiếm Tam Liên (đạn): ba `fx pbolt` (count 3), lớp đạn đếm đủ ba viên, quái ở giữa mất máu.
//   3. Liệt Diễm Trận (vùng):  `fx zone` -> vật thể bền; quái trong vòng mất máu NHIỀU lần (nhịp 800 ms); hết 4 s thì TỰ TẮT, KHÔNG cần `fxEnd`.
//   4. Liên Châu Lôi (sét lan): `fx chain` có >= 2 điểm, hạt tia sét vẽ, quái mất máu.
//   5. Hồn Phiên Tượng (tượng): `fx totem` -> vật thể bền; quái trong tầm mất máu theo nhịp 1 s; hết 6 s tự tắt.
//   6. Phá Sơn Nhất Kích (chiêu VẬN 1200 ms): `fx cast` chưa có sát thương, vòng tụ khí (WindupLayer) hiện và tiến độ TĂNG; hết vận thì đòn mới đáp (quái mất máu), vòng tắt.
// Mỗi ca ghi lại tin `fx` thật client nhận (bọc `scene.onFx`) và chụp trạng thái lớp vẽ NGAY lúc nhận. Quái là Linh Thố (hiền) được nâng máu để không chết giữa chừng. Không đoán trước gì ở client:
// mọi kết quả (sát thương, nổ bẫy, hết hạn) do máy chủ quyết định. 0 lỗi console là điều kiện đạt.
// Ảnh: đặt `E2E_SHOTS=<thư mục>`. Thoát 0 khi đạt, 1 khi sai. Không ghi vào `server/data/players` thật.
//
// Chạy: `npm run build -w client && npm run e2e:chieu-moi -w server` (cần google-chrome; client/dist phải là bản build mới). Mất ~1 phút.
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_MAP_ID, skillOf } from "@tien-gioi/shared";
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

/** Phím thật qua CDP (nhấn rồi nhả). Ô 2..5 của thanh chiêu = L U I O. */
const KEYS = {
  2: { key: "l", code: "KeyL", vk: 76 },
  3: { key: "u", code: "KeyU", vk: 85 },
  4: { key: "i", code: "KeyI", vk: 73 },
  5: { key: "o", code: "KeyO", vk: 79 },
} as const;
async function press(tab: Tab, slot: 2 | 3 | 4 | 5) {
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

/** Sáu chiêu của lát 1 theo thứ tự trong bài kiểm (bốn đầu gắn sẵn ô 2..5, hai chiêu sau gắn lại bằng `skillSlot`). */
const TRAP = "doc_dang_phuc";
const BOLT = "phi_kiem_tam_lien";
const ZONE = "liet_diem_tran";
const CHAIN = "loi_lien_chau";
const TOTEM = "hon_phien_tuong";
const WINDUP = "pha_son_nhat_kich";
const BIG_HP = 1_000_000;

async function main() {
  const CDP = await freePort();
  let PORT = await freePort();
  out("=== E2E THẬT sáu chiêu hình mới (CT9 lát 1): server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  for (const id of [TRAP, BOLT, ZONE, CHAIN, TOTEM, WINDUP])
    if (!skillOf(id)) throw new Error(`Chiêu ${id} chưa có trong shared (cần #1148 đã vào main)`);
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-cm-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-cm-chrome-"));
  process.env.DATA_DIR = dataDir; // `store.ts` đọc DATA_DIR lúc nạp module: nạp SAU khi đặt
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");
  const { syncPublicPos } = await import("../src/systems/movement.js");
  const { applyMonsterStatus } = await import("../src/systems/status.js");

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
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };
  const SECRET = "e2e_secret_chieu_moi_1111111";
  const NAME = "Chieu Moi Mot";

  try {
    const now = new Date().toISOString();
    // Nguyên Anh (realm 4): mở đủ bốn ô; đã học đủ sáu chiêu ở tầng 1; bốn chiêu đầu gắn sẵn ô 2..5
    await savePlayer({
      name: NAME,
      secretHash: hashSecret(SECRET),
      realm: 4,
      tier: 0,
      exp: 0,
      coin: 0,
      mapId: DEFAULT_MAP_ID,
      skills: {
        learned: Object.fromEntries([TRAP, BOLT, ZONE, CHAIN, TOTEM, WINDUP].map((id) => [id, 1])),
        slots: [TRAP, BOLT, ZONE, CHAIN],
      },
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
      source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
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

    // Linh Thố (quái hiền): làm bao cát (máu cực lớn) rồi đứng cách nó 90 px
    // Chỗ phải THOÁNG THEO HƯỚNG BẮN: ba tia của Phi Kiếm Tam Liên (quạt +-27 độ, tầm 380) và tia sét không được đâm vào tường, ngược lại một tin `pbolt` thiếu (ca chập chờn
    // tuỳ vị trí sinh ngẫu nhiên của Linh Thố). Chọn con Linh Thố có phần THOÁNG NHẤT trong số đang ở ngoài trấn.
    const clearLen = (x: number, y: number, ang: number, max: number) => {
      let l = 0;
      for (; l < max; l += 20)
        if (world.map.circleBlocked(x + Math.cos(ang) * l, y + Math.sin(ang) * l, 12)) break;
      return l;
    };
    const FAN = (27 * Math.PI) / 180;
    let monId = "";
    let monXY = { x: 0, y: 0 };
    let bestScore = -1;
    world.state.monsters.forEach((m, id) => {
      if (m.kind !== "tho") return;
      const sx = m.x - 90;
      if (world.map.inTown(sx, m.y) || world.map.circleBlocked(sx, m.y, 20)) return;
      const lens = [-FAN, 0, FAN].map((ang) => clearLen(sx, m.y, ang, 420));
      const score = Math.min(...lens) >= 200 ? lens.reduce((a, b) => a + b, 0) : -1;
      if (score > bestScore) {
        bestScore = score;
        monId = id;
        monXY = { x: m.x, y: m.y };
      }
    });
    must(bestScore > 0, "có Linh Thố ở chỗ thoáng theo hướng bắn (mỗi tia >= 200 px)");
    must(monId !== "", "có Linh Thố ở chỗ thoáng trong phòng");
    const mon = world.state.monsters.get(monId)!;
    // Các quái KHÁC cất vào góc xa bản đồ (ngủ vì không ai ở gần): quái lạ bước vào bán kính bẫy / vùng, hay đánh người giữa chừng, làm ca chập chờn. Chúng tự đi về chỗ sinh
    // sau một lúc (vượt dây cương) nên cất lại ở MỖI lần `reset`.
    const stashOthers = () =>
      world.state.monsters.forEach((m, id) => {
        if (id === monId) return;
        m.x = world.map.worldW - 150;
        m.y = world.map.worldH - 150;
      });
    stashOthers();
    const stand = { x: monXY.x - 90, y: monXY.y };
    const place = async (x: number, y: number) => {
      me.x = x;
      me.y = y;
      syncPublicPos(me);
      await ev(
        `(() => { const s = window.__scene; s.predX = ${x}; s.predY = ${y}; s.facing = 0; return 1; })()`,
      );
    };
    const putMon = (x: number, y: number) => {
      mon.x = x;
      mon.y = y;
    };
    /** Đưa người về chỗ đứng, quái về trước mặt 90 px, đầy máu + đầy linh lực (mỗi ca đo từ đầu) */
    const reset = async () => {
      stashOthers();
      await place(stand.x, stand.y);
      putMon(monXY.x, monXY.y);
      mon.hp = BIG_HP;
      // bao cát CHOÁNG dài: quái bị đánh sẽ trả đòn / báo trước đòn lao, trúng người thì HUỶ chiêu vận (ca chập chờn ở chiêu vận); choáng thì đứng yên và không đánh
      applyMonsterStatus(world, monId, { status: "stun", ms: 30_000, ratio: 0, chance: 1 }, 0, "");
      me.mp = me.maxMp;
      me.hp = me.maxHp;
      await sleep(250);
    };
    serverDiag = () => {
      const near: string[] = [];
      world.state.monsters.forEach((m, id) => {
        const d = Math.hypot(m.x - me.x, m.y - me.y);
        if (d < 700) near.push(`${m.kind}@${Math.round(d)}${id === monId ? "*" : ""} hp ${m.hp}`);
      });
      const c: any = world.ctrl.get(sid);
      return `người: hp ${me.hp}/${me.maxHp} mp ${me.mp} dead ${me.dead} stunned ${c?.stunned} limbo ${!!c?.limbo} windup ${!!c?.windup}; quái gần: ${near.join("; ")}`;
    };
    await place(stand.x, stand.y);
    await T.waitFor(
      `!!window.__scene.monsterPips(${JSON.stringify(monId)})`,
      "client thấy Linh Thố (vùng nhìn đã cập nhật)",
      15000,
    );
    // Ghi lại MỌI tin `fx` thật client nhận (bọc `onFx`: tin đi đúng đường mạng -> `reg("fx")` -> `onFx`) kèm ảnh chụp lớp vẽ NGAY lúc nhận
    await ev(`(() => {
      const sc = window.__scene; window.__fxLog = []; window.__pts = [];
      // mọi điểm phát hạt playFxPoints (chỗ chung của tia sét, vòng nổ bẫy, bụi cuối đạn): ghi số điểm để biết MỖI tin fx thật sự vẽ gì (không lẫn hạt của tin khác)
      const origPts = sc.playFxPoints.bind(sc);
      sc.playFxPoints = (pts) => { window.__pts.push(Array.isArray(pts) ? pts.length : -1); return origPts(pts); };
      const orig = sc.onFx.bind(sc);
      sc.onFx = (m) => {
        const before = window.__pts.length;
        const r = orig(m);
        window.__fxLog.push({ kind: m?.kind, skill: m?.skill, id: m?.id, why: m?.why, x: m?.x, y: m?.y, r: m?.r, ms: m?.ms,
          n: Array.isArray(m?.pts) ? m.pts.length : undefined, t: performance.now(),
          drawn: window.__pts.slice(before).reduce((a, b) => a + b, 0),
          persist: sc.persists.snapshot(sc.time.now), windup: sc.windups.snapshot(sc.time.now) });
        return r;
      };
      return 1;
    })()`);
    const fxLog = async (kind: string, skill?: string) =>
      (await ev(
        `JSON.stringify(window.__fxLog.filter((e) => e.kind === ${JSON.stringify(kind)}${skill ? ` && e.skill === ${JSON.stringify(skill)}` : ""}))`,
      ).then((v) => JSON.parse(v as string))) as Array<{
        kind: string;
        skill?: string;
        id?: number;
        why?: string;
        x?: number;
        y?: number;
        r?: number;
        ms?: number;
        n?: number;
        /** số điểm hạt `playFxPoints` do CHÍNH tin này vẽ */
        drawn: number;
        persist: Array<{ id: number; kind: string; mine: boolean; armed: boolean; alpha: number }>;
        windup: Array<{ phase: string; progress: number; mine: boolean }>;
      }>;
    const waitLog = (
      kind: string,
      skill: string | undefined,
      count: number,
      why: string,
      ms = 5000,
    ) =>
      T.waitFor(
        `window.__fxLog.filter((e) => e.kind === ${JSON.stringify(kind)}${skill ? ` && e.skill === ${JSON.stringify(skill)}` : ""}).length >= ${count}`,
        why,
        ms,
      );
    const persistsNow = async () =>
      (await ev(`JSON.stringify(window.__scene.persists.snapshot(window.__scene.time.now))`).then(
        (v) => JSON.parse(v as string),
      )) as Array<{
        id: number;
        kind: string;
        mine: boolean;
        armed: boolean;
        ending: string | null;
      }>;
    const admitted = async () => (await ev(`window.__fx.stats().admitted`)) as number;
    const hpDrop = () => BIG_HP - (mon.hp as number);
    /** Chờ ô `slot` sẵn sàng VÀ client đã thấy đủ linh lực (state của chủ tới sau một nhịp), rồi bấm phím thật */
    const cast = async (slot: 2 | 3 | 4 | 5) => {
      await T.waitFor(
        `(document.getElementById('sk-slot${slot}')?.getAttribute('aria-label') ?? '').includes('sẵn sàng') && window.__scene.me().mp >= window.__scene.me().maxMp * 0.95 && window.__scene.me().hp > 0`,
        `ô ${slot} sẵn sàng và đủ linh lực`,
        8000,
      );
      await press(T, slot);
    };
    const barReady = (slot: number, skillId: string, why: string) =>
      T.waitFor(
        `(document.getElementById('sk-slot${slot}')?.getAttribute('aria-label') ?? '').includes(${JSON.stringify(skillOf(skillId)!.name)})`,
        why,
      );
    for (const [slot, id] of [
      [2, TRAP],
      [3, BOLT],
      [4, ZONE],
      [5, CHAIN],
    ] as const)
      await barReady(
        slot,
        id,
        `thanh chiêu ô ${slot} có ${skillOf(id)!.name} (sổ chiêu từ máy chủ)`,
      );
    ok("vào game bằng form thật; sổ chiêu của máy chủ gắn đúng bốn chiêu đầu vào ô 2..5");
    const bar = (await ev(
      `JSON.stringify([2, 3, 4, 5].map((n) => { const b = document.getElementById('sk-slot' + n).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height), b.right <= innerWidth && b.bottom <= innerHeight && b.width > 0]; }))`,
    ).then((v) => JSON.parse(v as string))) as Array<[number, number, boolean]>;
    must(
      bar.every(([w, h, inside]) => inside && w >= 44 && h >= 44),
      `thanh chiêu máy tính HIỆN đủ bốn ô >= 44 px trong khung nhìn (${JSON.stringify(bar)})`,
    );
    ok("thanh chiêu L U I O hiện đủ bốn ô trên máy tính (ô >= 44 px, nằm trong khung nhìn)");

    // ---------- 1. BẪY ----------
    await reset();
    putMon(monXY.x + 500, monXY.y); // quái ĐỨNG XA: đang trong bán kính thì bẫy nổ ngay khi kích hoạt, không thấy được giai đoạn "chưa kích hoạt"
    await cast(2);
    await waitLog("trap", TRAP, 1, "client nhận `fx trap` của Độc Đằng Phục");
    const trap = (await fxLog("trap", TRAP))[0]!;
    must(
      trap.persist.length === 1 && trap.persist[0]!.kind === "trap" && trap.persist[0]!.mine,
      `lớp vật thể bền giữ MỘT bẫy của mình ngay khi nhận tin (${JSON.stringify(trap.persist)})`,
    );
    must(trap.persist[0]!.armed === false, "bẫy mới đặt CHƯA kích hoạt (armMs 600 ms)");
    await T.shot("chieu-moi-1-bay-moi-dat");
    await sleep(900);
    const armed = (await persistsNow())[0];
    must(
      !!armed && armed.armed === true,
      `qua armMs thì bẫy KÍCH HOẠT (sáng lên): ${JSON.stringify(await persistsNow())}, đồng hồ cảnh ${await ev("window.__scene.time.now")}`,
    );
    const adm0 = await admitted();
    putMon(trap.x!, trap.y!); // quái bước vào bán kính bẫy: máy chủ quét theo nhịp rồi nổ
    await waitLog("fxEnd", undefined, 1, "máy chủ gửi `fxEnd` khi quái chạm bẫy", 6000);
    const pop = (await fxLog("fxEnd"))[0]!;
    must(
      pop.why === "pop" && pop.id === trap.id,
      `bẫy NỔ (why=${pop.why}, id ${pop.id} khớp ${trap.id})`,
    );
    await T.waitFor(`window.__scene.persists.stats().alive === 0`, "vật thể bẫy được gỡ");
    must(pop.drawn >= 1, `bẫy nổ: CHÍNH tin fxEnd vẽ vòng nổ + bụi (${pop.drawn} điểm hạt)`);
    must((await admitted()) > adm0, "bẫy nổ: hạt được phát thật");
    must(hpDrop() > 0, `quái mất máu vì bẫy (-${hpDrop()})`);
    ok(
      `bẫy: hiện ngay chưa kích hoạt -> kích hoạt sau armMs -> quái chạm thì NỔ (fxEnd pop), gỡ vật thể, hạt nổ, quái -${hpDrop()} máu`,
    );

    // ---------- 2. ĐẠN BAY ----------
    await reset();
    const spawned0 = (await ev(`window.__scene.pbolts.stats().spawned`)) as number;
    await cast(3);
    await waitLog("pbolt", BOLT, 3, "client nhận ba `fx pbolt` của Phi Kiếm Tam Liên");
    await T.waitFor(
      `window.__scene.pbolts.stats().spawned >= ${spawned0 + 3}`,
      "lớp đạn đếm đủ ba viên",
    );
    await T.shot("chieu-moi-2-dan");
    const t2 = Date.now();
    while (hpDrop() === 0 && Date.now() - t2 < 3000) await sleep(100);
    must(hpDrop() > 0, "quái trúng đạn (mất máu)");
    ok(`đạn: ba viên đạn bay (lớp đạn spawned +3), quái trúng -${hpDrop()} máu`);

    // ---------- 3. VÙNG ----------
    await reset();
    await cast(4);
    await waitLog("zone", ZONE, 1, "client nhận `fx zone` của Liệt Diễm Trận");
    const zone = (await fxLog("zone", ZONE))[0]!;
    must(
      zone.persist.some((p) => p.kind === "zone" && p.mine),
      "lớp vật thể bền giữ vùng lửa của mình",
    );
    putMon(zone.x!, zone.y!);
    await T.shot("chieu-moi-3-vung");
    await sleep(2200);
    const h1 = hpDrop();
    await sleep(1200);
    const h2 = hpDrop();
    must(h1 > 0 && h2 > h1, `quái trong vòng mất máu NHIỀU lần theo nhịp (${h1} -> ${h2})`);
    await T.waitFor(`window.__scene.persists.stats().alive === 0`, "vùng TỰ TẮT khi hết 4 s", 4000);
    must(
      (await fxLog("fxEnd")).length === 1,
      "hết hạn TỰ NHIÊN: không có thêm `fxEnd` (chỉ lần nổ bẫy ở ca 1)",
    );
    ok(`vùng: quái mất máu theo nhịp (${h1} -> ${h2}); hết 4 s TỰ TẮT, không cần fxEnd`);

    // ---------- 4. SÉT LAN ----------
    await reset();
    const adm4 = await admitted();
    await cast(5);
    await waitLog("chain", CHAIN, 1, "client nhận `fx chain` của Liên Châu Lôi");
    const chain = (await fxLog("chain", CHAIN))[0]!;
    must((chain.n ?? 0) >= 2, `tia sét có >= 2 điểm (${chain.n})`);
    must(
      chain.drawn >= (chain.n ?? 2) - 1,
      `CHÍNH tin chain vẽ tia sét: >= ${(chain.n ?? 2) - 1} điểm hạt, thực tế ${chain.drawn}`,
    );
    must((await admitted()) > adm4, "hạt tia sét được phát thật");
    const t4 = Date.now();
    while (hpDrop() === 0 && Date.now() - t4 < 3000) await sleep(100);
    must(hpDrop() > 0, "quái trúng sét (mất máu)");
    await T.shot("chieu-moi-4-set");
    ok(`sét lan: ${chain.n} điểm nối, hạt tia sét vẽ, quái -${hpDrop()} máu`);

    // ---------- 5. TƯỢNG ---------- (gắn lại ô 2 = tượng, ô 3 = chiêu vận bằng `skillSlot` thật)
    await ev(
      `window.__scene.room.send("skillSlot", { slot: 2, skillId: ${JSON.stringify(TOTEM)} }); 1`,
    );
    await ev(
      `window.__scene.room.send("skillSlot", { slot: 3, skillId: ${JSON.stringify(WINDUP)} }); 1`,
    );
    await barReady(2, TOTEM, "máy chủ xác nhận Hồn Phiên Tượng ở ô 2");
    await barReady(3, WINDUP, "máy chủ xác nhận Phá Sơn Nhất Kích ở ô 3");
    await reset();
    await cast(2);
    await waitLog("totem", TOTEM, 1, "client nhận `fx totem` của Hồn Phiên Tượng");
    const totem = (await fxLog("totem", TOTEM))[0]!;
    must(
      totem.persist.some((p) => p.kind === "totem" && p.mine),
      "lớp vật thể bền giữ tượng của mình",
    );
    putMon(totem.x!, totem.y!);
    await T.shot("chieu-moi-5-tuong");
    await sleep(2500);
    const g1 = hpDrop();
    await sleep(1500);
    const g2 = hpDrop();
    must(g1 > 0 && g2 > g1, `quái trong tầm tượng mất máu theo nhịp 1 s (${g1} -> ${g2})`);
    await T.waitFor(
      `window.__scene.persists.stats().alive === 0`,
      "tượng TỰ TẮT khi hết 6 s",
      6000,
    );
    ok(`tượng: quái mất máu theo nhịp (${g1} -> ${g2}); hết 6 s TỰ TẮT`);

    // ---------- 6. CHIÊU VẬN ----------
    await reset();
    // chờ hết sát thương theo thời gian còn sót từ các ca trước (bỏng / độc / chảy máu của vùng, bẫy, đạn) rồi đặt lại máu: "chưa có sát thương lúc vận" mới đo được
    for (let quiet = 0, last = -1; quiet < 4; await sleep(300)) {
      quiet = mon.hp === last ? quiet + 1 : 0;
      last = mon.hp as number;
      if (quiet === 0) mon.hp = BIG_HP;
    }
    mon.hp = BIG_HP;
    await cast(3);
    await waitLog("cast", WINDUP, 1, "client nhận `fx cast` của Phá Sơn Nhất Kích");
    const w0 = (await fxLog("cast", WINDUP))[0]!;
    must(
      w0.windup.length === 1 && w0.windup[0]!.mine,
      `chiêu vận: vòng tụ khí hiện NGAY khi nhận tin (${JSON.stringify(w0.windup)})`,
    );
    must(hpDrop() === 0, "đang vận: CHƯA có sát thương");
    await sleep(350);
    const p1 = (await ev(
      `JSON.stringify(window.__scene.windups.snapshot(window.__scene.time.now))`,
    ).then((v) => JSON.parse(v as string))) as Array<{ progress: number }>;
    await sleep(350);
    const p2 = (await ev(
      `JSON.stringify(window.__scene.windups.snapshot(window.__scene.time.now))`,
    ).then((v) => JSON.parse(v as string))) as Array<{ progress: number }>;
    await T.shot("chieu-moi-6-van");
    must(
      p1.length === 1 &&
        p2.length === 1 &&
        p1[0]!.progress > 0 &&
        p2[0]!.progress > p1[0]!.progress,
      `vòng tụ khí TIẾN DẦN (${p1[0]?.progress.toFixed(2)} -> ${p2[0]?.progress.toFixed(2)})`,
    );
    must(hpDrop() === 0, "vận được ~0,7 s trên 1,2 s: vẫn CHƯA có sát thương");
    await T.waitFor(`window.__scene.windups.stats().alive === 0`, "hết vận: vòng tắt", 3000);
    const t6 = Date.now();
    while (hpDrop() === 0 && Date.now() - t6 < 3000) await sleep(100);
    must(hpDrop() > 0, "hết vận: đòn ĐÁP xuống, quái mất máu");
    ok(
      `chiêu vận: vòng tụ khí hiện ngay, tiến dần (${p1[0]!.progress.toFixed(2)} -> ${p2[0]!.progress.toFixed(2)}), chưa sát thương lúc vận; hết vận đòn đáp (-${hpDrop()} máu), vòng tắt`,
    );

    must(T.errors.length === 0, `lỗi console: ${JSON.stringify(T.errors)}`);
    ok("0 lỗi console / exception");
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ THẤT BẠI: ${failed}`);
    if (tab?.errors.length) console.error(`  lỗi console: ${JSON.stringify(tab.errors)}`);
    try {
      // chẩn đoán: tin fx đã nhận + toast đang hiện (vì sao một lần bấm phím không ra hình)
      const diag = await tab?.ev(
        `JSON.stringify({ fx: (window.__fxLog ?? []).map((e) => [e.kind, e.skill, e.id, e.why]), toasts: [...document.querySelectorAll('#toast p')].map((p) => p.textContent), bar: [2, 3, 4, 5].map((n) => document.getElementById('sk-slot' + n)?.getAttribute('aria-label')) })`,
      );
      console.error(`  chẩn đoán: ${diag}`);
      console.error(`  máy chủ: ${serverDiag()}`);
    } catch {
      /* tab đã đóng */
    }
    await tab?.shot("chieu-moi-that-bai", { onFailure: true });
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
  out("\n=== E2E SÁU CHIÊU HÌNH MỚI ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
