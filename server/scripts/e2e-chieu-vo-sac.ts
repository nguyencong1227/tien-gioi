// E2E THẬT ba cơ chế mà chiêu VÔ SẮC (CT8 lát 3, #1173, mục 51) dùng LẦN ĐẦU: chiêu VẬN trên hình `line`, KÉO quái (`displace pull`) và HỘ THỂ (`shield`). Server Colyseus
// thật + Chrome headless + client đã build, điều khiển bằng PHÍM THẬT (L U I):
//   1. Huyết Ảnh Xuyên Tâm (vận 1200 ms, tia): `fx cast` có vòng vận khí (WindupLayer) hiện ngay và TIẾN DẦN, CHƯA sát thương lúc vận; hết vận đòn mới đáp, vòng tắt.
//   2. Cầm Long Khấu (kéo 60 px): quái bị KÉO lại gần người dùng ~60 px (máy chủ quyết định, dừng sát người); client vẽ quái ở chỗ mới (khớp máy chủ).
//   3. Long Tượng Hộ Thể (khiên 30 % khí huyết tối đa): máy chủ gắn `shield`, client hiện huy hiệu Hộ thể; khiên HẤP THỤ sát thương (đòn nhỏ không mất máu; đòn lớn chỉ mất phần vượt khiên).
// Quái là Linh Thố (hiền) được nâng máu + choáng dài để không chết / trả đòn giữa chừng. Mọi kết quả do máy chủ quyết định; client chỉ vẽ. 0 lỗi console là điều kiện đạt.
// Ảnh: đặt `E2E_SHOTS=<thư mục>`. Thoát 0 khi đạt, 1 khi sai. Không ghi vào `server/data/players` thật.
//
// Chạy: `npm run build -w client && npm run e2e:chieu-vo-sac -w server` (cần google-chrome; client/dist phải là bản build mới). Mất ~1 phút.
import { execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_MAP_ID, skillOf } from "@tien-gioi/shared";
import { Tab, sleep, listenWithRetry, removeTmpDirs, killChrome } from "./e2e-kit";
import { launchChrome } from "./e2e-chrome";
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

const WINDUP = "huyet_anh_xuyen_tam"; // ô 2: chiêu vận 1200 ms, hình tia (Luyện Khí)
const PULL = "cam_long_khau"; // ô 3: quạt, kéo quái 60 px (Trúc Cơ trung kỳ)
const SHIELD = "long_tuong_ho_the"; // ô 4: khiên 30 % khí huyết tối đa (Nguyên Anh trung kỳ)
const BIG_HP = 1_000_000;

async function main() {
  const CDP = await freePort();
  let PORT = await freePort();
  out(
    "=== E2E THẬT chiêu vận tia / kéo / hộ thể (CT8 lát 3, vô sắc): server Colyseus thật + Chrome headless ===",
  );
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  for (const id of [WINDUP, PULL, SHIELD])
    if (!skillOf(id)) throw new Error(`Chiêu ${id} chưa có trong shared (cần #1173 đã vào main)`);
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-vs-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-vs-chrome-"));
  process.env.DATA_DIR = dataDir; // `store.ts` đọc DATA_DIR lúc nạp module: nạp SAU khi đặt
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");
  const { syncPublicPos } = await import("../src/systems/movement.js");
  const { applyMonsterStatus } = await import("../src/systems/status.js");
  const { hasStatus } = await import("../src/systems/status-rules.js");
  const { hurtPlayerDot } = await import("../src/systems/combat.js");

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
  /** Chờ điều kiện ở máy chủ (cùng tiến trình) tới `ms`; hết giờ thì thôi (câu `must` sau đó báo lỗi cụ thể). */
  const waitCond = async (cond: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (!cond() && Date.now() < end) await sleep(50);
  };
  const SECRET = "e2e_secret_chieu_vo_sac_1111111";
  const NAME = "Chieu Vo Sac Mot";

  try {
    const now = new Date().toISOString();
    // Nguyên Anh hậu kỳ (realm 4, tier 2: đủ cho Long Tượng Hộ Thể đòi trung kỳ): đã học ba chiêu ở tầng 1, gắn sẵn ô 2..4
    await savePlayer({
      name: NAME,
      secretHash: hashSecret(SECRET),
      realm: 4,
      tier: 2,
      exp: 0,
      coin: 0,
      mapId: DEFAULT_MAP_ID,
      skills: {
        learned: Object.fromEntries([WINDUP, PULL, SHIELD].map((id) => [id, 1])),
        slots: [WINDUP, PULL, SHIELD, ""],
      },
      createdAt: now,
      updatedAt: now,
    });
    const launched = await launchChrome({
      cdpPort: CDP,
      userDataDir: chromeDir,
      extraFlags: [
        // máy tính có chuột: headless không có chuột nên `pointer` là `none` và thanh chiêu L U I O (chỉ hiện ở `(pointer: fine)`) bị ẩn
        "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2",
      ],
      log: out,
    });
    chrome = launched.chrome;
    tab = await Tab.open("T", launched.webSocketDebuggerUrl);
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

    // Linh Thố (quái hiền) làm bao cát; người đứng cách 80 px phía tây (tia của Huyết Ảnh Xuyên Tâm dài 160, quạt của Cầm Long Khấu tầm 110) ở chỗ THOÁNG
    const STAND_DX = 80;
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
    // Các quái KHÁC cất vào góc xa bản đồ và đóng băng (không đi về chỗ sinh, không cản đường hay bị nhắm)
    const stashOthers = () =>
      world.state.monsters.forEach((m, id) => {
        if (id === monId) return;
        m.x = world.map.worldW - 150;
        m.y = world.map.worldH - 150;
        const mc = world.mctrl.get(id);
        if (mc) {
          mc.homeX = world.map.worldW - 150;
          mc.homeY = world.map.worldH - 150;
          mc.wanderX = world.map.worldW - 150;
          mc.wanderY = world.map.worldH - 150;
          mc.target = null;
          mc.st = {
            list: [
              {
                id: "stun",
                until: world.now + 3600_000,
                ratio: 0,
                dps: 0,
                pool: 0,
                last: world.now,
                src: "",
              },
            ],
            stunImmuneUntil: 0,
          };
          if (mc.nav) {
            mc.nav.pts = null;
            mc.nav.evadeUntil = 0;
            mc.nav.stuckMs = 0;
          }
        }
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
    /** Đưa người về chỗ đứng, quái về trước mặt, đầy máu + linh lực; quái CHOÁNG dài (không trả đòn / di chuyển); dấu cũ (nếu còn) bị gỡ */
    const reset = async () => {
      stashOthers();
      await place(stand.x, stand.y);
      mon.x = monXY.x;
      mon.y = monXY.y;
      mon.hp = BIG_HP;
      const mc = world.mctrl.get(monId);
      if (mc) {
        mc.homeX = monXY.x;
        mc.homeY = monXY.y;
        mc.wanderX = monXY.x;
        mc.wanderY = monXY.y;
        mc.target = null;
        mc.st = {
          list: [
            {
              id: "stun",
              until: world.now + 3600_000,
              ratio: 0,
              dps: 0,
              pool: 0,
              last: world.now,
              src: "",
            },
          ],
          stunImmuneUntil: 0,
        };
        if (mc.nav) {
          mc.nav.pts = null;
          mc.nav.evadeUntil = 0;
          mc.nav.stuckMs = 0;
        }
      }
      me.mp = me.maxMp;
      me.hp = me.maxHp;
      await sleep(100);
    };
    serverDiag = () => {
      const c: any = world.ctrl.get(sid);
      return `người: hp ${me.hp}/${me.maxHp} mp ${me.mp} dead ${me.dead} stunned ${c?.stunned} khiên ${hasStatus(c?.st, "shield", world.now)} windup ${!!c?.windup}; quái: hp ${mon.hp} cách ${Math.round(Math.hypot(mon.x - me.x, mon.y - me.y))} px`;
    };
    await place(stand.x, stand.y);
    await T.waitFor(
      `!!window.__scene.monsterPips(${JSON.stringify(monId)})`,
      "client thấy Linh Thố (vùng nhìn đã cập nhật)",
      15000,
    );
    // Ghi lại MỌI tin `fx` thật client nhận (bọc `onFx`) kèm ảnh chụp lớp vận khí NGAY lúc nhận, và mọi tin `dmg` (bọc `onDmg`)
    await ev(`(() => {
      const sc = window.__scene; window.__fxLog = []; window.__dmgLog = [];
      const origFx = sc.onFx.bind(sc);
      sc.onFx = (m) => {
        const r = origFx(m);
        window.__fxLog.push({ kind: m?.kind, skill: m?.skill, t: performance.now(), windup: sc.windups.snapshot(sc.time.now) });
        return r;
      };
      const origDmg = sc.onDmg.bind(sc);
      sc.onDmg = (m) => { window.__dmgLog.push({ target: m?.target, amount: m?.amount, t: performance.now() }); return origDmg(m); };
      return 1;
    })()`);
    const fxCasts = async (skill: string) =>
      (await ev(
        `JSON.stringify(window.__fxLog.filter((e) => e.kind === 'cast' && e.skill === ${JSON.stringify(skill)}))`,
      ).then((v) => JSON.parse(v as string))) as Array<{
        windup: Array<{ phase: string; progress: number; mine: boolean }>;
      }>;
    const windupNow = async () =>
      (await ev(`JSON.stringify(window.__scene.windups.snapshot(window.__scene.time.now))`).then(
        (v) => JSON.parse(v as string),
      )) as Array<{ progress: number }>;
    const hpDrop = () => BIG_HP - (mon.hp as number);
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
      [2, WINDUP],
      [3, PULL],
      [4, SHIELD],
    ] as const)
      await T.waitFor(
        `(document.getElementById('sk-slot${slot}')?.getAttribute('aria-label') ?? '').includes(${JSON.stringify(skillOf(id)!.name)})`,
        `thanh chiêu ô ${slot} có ${skillOf(id)!.name} (sổ chiêu từ máy chủ)`,
      );
    ok("vào game bằng form thật; sổ chiêu của máy chủ gắn đúng ba chiêu vào ô 2..4");

    // ---------- 1. CHIÊU VẬN TRÊN HÌNH TIA: Huyết Ảnh Xuyên Tâm ----------
    await reset();
    await cast(2);
    // 1. Chờ máy chủ bắt đầu vận khí và client nhận fx cast
    await waitCond(() => (world.ctrl.get(sid) as any)?.windup !== undefined, 4000);
    must(
      (world.ctrl.get(sid) as any)?.windup !== undefined,
      "máy chủ: bắt đầu vận Huyết Ảnh Xuyên Tâm",
    );
    must(hpDrop() === 0, "máy chủ vừa bắt đầu vận: CHƯA có sát thương");
    await T.waitFor(
      `window.__fxLog.filter((e) => e.kind === 'cast' && e.skill === ${JSON.stringify(WINDUP)}).length >= 1`,
      "client nhận `fx cast` của Huyết Ảnh Xuyên Tâm",
      5000,
    );
    const w0 = (await fxCasts(WINDUP))[0]!;
    must(
      w0.windup.length === 1 && w0.windup[0]!.mine,
      `chiêu vận trên tia: vòng tụ khí hiện NGAY khi nhận tin (${JSON.stringify(w0.windup)})`,
    );
    if ((world.ctrl.get(sid) as any)?.windup !== undefined) {
      must(hpDrop() === 0, "trong lúc máy chủ đang vận: CHƯA có sát thương");
    }

    // 2. Chờ vòng tụ khí tiến dần theo điều kiện (không sleep cố định)
    await T.waitFor(
      `(() => { const s = window.__scene?.windups?.snapshot(window.__scene?.time?.now); return Array.isArray(s) && s.length === 1 && s[0].progress >= 0.05; })()`,
      "vòng tụ khí bắt đầu tiến (progress >= 0.05)",
      4000,
    );
    const p1 = await windupNow();
    must(p1.length === 1 && p1[0]!.progress > 0, "đo được mốc p1 của vòng tụ khí");

    await T.waitFor(
      `(() => { const s = window.__scene?.windups?.snapshot(window.__scene?.time?.now); return Array.isArray(s) && s.length === 1 && s[0].progress >= ${p1[0]!.progress + 0.15}; })()`,
      "vòng tụ khí tiến tiếp (progress tăng thêm)",
      4000,
    );
    const p2 = await windupNow();
    must(
      p2.length === 1 && p2[0]!.progress > p1[0]!.progress,
      `vòng tụ khí TIẾN DẦN (${p1[0]?.progress.toFixed(2)} -> ${p2[0]?.progress.toFixed(2)})`,
    );

    // Trong lúc máy chủ còn đang vận: khẳng định CHƯA có sát thương
    if ((world.ctrl.get(sid) as any)?.windup !== undefined) {
      must(hpDrop() === 0, "trong lúc máy chủ đang vận: vẫn CHƯA có sát thương");
    }

    await T.shot("chieu-vo-sac-1-van-tia");

    // 3. Chờ máy chủ hết vận và đòn đáp: vòng tắt, quái mất máu
    await waitCond(() => (world.ctrl.get(sid) as any)?.windup === undefined, 4000);
    await T.waitFor(`window.__scene.windups.stats().alive === 0`, "hết vận: vòng tắt", 4000);
    await waitCond(() => hpDrop() > 0, 4000);
    must(hpDrop() > 0, "hết vận: đòn ĐÁP xuống trên tia, quái mất máu");
    ok(
      `chiêu vận trên tia: vòng tụ khí hiện ngay, tiến dần (${p1[0]!.progress.toFixed(2)} -> ${p2[0]!.progress.toFixed(2)}), chưa sát thương lúc vận; hết vận đòn đáp (-${hpDrop()} máu), vòng tắt`,
    );

    // ---------- 2. KÉO: Cầm Long Khấu ----------
    await reset();
    const dist0 = Math.hypot(mon.x - me.x, mon.y - me.y);
    await cast(3);
    await waitCond(() => Math.hypot(mon.x - me.x, mon.y - me.y) < dist0 - 20, 4000);
    const dist1 = Math.hypot(mon.x - me.x, mon.y - me.y);
    const pulled = dist0 - dist1;
    must(
      pulled >= 40 && pulled <= 70,
      `quái bị KÉO lại gần người dùng ~60 px (cách ${dist0.toFixed(0)} -> ${dist1.toFixed(0)} px, kéo ${pulled.toFixed(0)})`,
    );
    // client vẽ quái ở chỗ MỚI (khớp máy chủ), không ở chỗ cũ
    await T.waitFor(
      `(() => { const e = window.__scene.monsters.get(${JSON.stringify(monId)}); return !!e && Math.hypot(e.root.x - ${mon.x}, e.root.y - ${mon.y}) < 30; })()`,
      "client vẽ quái ở chỗ đã bị kéo (khớp máy chủ trong 30 px)",
      5000,
    );
    await T.shot("chieu-vo-sac-2-keo");
    ok(
      `kéo: máy chủ kéo quái ${pulled.toFixed(0)} px lại gần (${dist0.toFixed(0)} -> ${dist1.toFixed(0)}), client vẽ quái ở chỗ mới`,
    );

    // ---------- 3. HỘ THỂ: Long Tượng Hộ Thể ----------
    await reset();
    // Cất quái ra xa: quái đã bị đánh ở hai ca trước, trên runner CI chậm nó kịp đánh người vài khí huyết (4 một đòn) giữa lúc vận khiên và lúc đo, khiên hấp thụ trước nên
    // số 'mất' lệch 4 so với kỳ vọng (nightly thủ công 18/11: 1360 thay vì 1356). Đo khiên không cần quái.
    mon.x = world.map.worldW - 150;
    mon.y = world.map.worldH - 150;
    // đối chứng: chưa có khiên thì sát thương trừ thẳng khí huyết
    hurtPlayerDot(world, sid, me, 300);
    must(
      me.hp === me.maxHp - 300,
      `đối chứng: chưa khiên, đòn 300 trừ đúng 300 khí huyết (${me.maxHp - me.hp})`,
    );
    me.hp = me.maxHp;
    await cast(4);
    await waitCond(() => hasStatus((world.ctrl.get(sid) as any)?.st, "shield", world.now), 4000);
    must(
      hasStatus((world.ctrl.get(sid) as any)?.st, "shield", world.now),
      "máy chủ: Long Tượng Hộ Thể gắn khiên lên người dùng",
    );
    await T.waitFor(
      `!!document.querySelector('[data-status="shield"]')`,
      "client hiện huy hiệu HỘ THỂ trên thanh trạng thái",
      5000,
    );
    const pool = Math.round(0.3 * me.maxHp);
    hurtPlayerDot(world, sid, me, 300);
    must(
      me.hp === me.maxHp,
      `khiên HẤP THỤ đòn nhỏ: đòn 300 < khiên ${pool} không mất khí huyết (mất ${me.maxHp - me.hp})`,
    );
    // đòn lớn: tổng 300 + 2000 vượt khiên, chỉ phần vượt khiên trừ vào khí huyết
    hurtPlayerDot(world, sid, me, 2000);
    const lost = me.maxHp - me.hp;
    must(
      Math.abs(lost - (2300 - pool)) <= 2,
      `khiên hết thì phần VƯỢT khiên mới trừ khí huyết: mất ${lost}, kỳ vọng ${2300 - pool} (= 2300 - khiên ${pool})`,
    );
    await T.shot("chieu-vo-sac-3-ho-the");
    ok(
      `hộ thể: khiên ${pool} hấp thụ đòn 300 (không mất máu) rồi chỉ phần vượt khiên trừ (mất ${lost} / ${2300 - pool}); client hiện huy hiệu Hộ thể`,
    );

    must(T.errors.length === 0, `lỗi console: ${JSON.stringify(T.errors)}`);
    ok("0 lỗi console / exception");
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ THẤT BẠI: ${failed}`);
    if (tab?.errors.length) console.error(`  lỗi console: ${JSON.stringify(tab.errors)}`);
    try {
      const diag = await tab?.ev(
        `JSON.stringify({ dmg: (window.__fxLog ?? []).map((e) => [e.kind, e.skill]), slots: [2, 3, 4].map((n) => document.getElementById('sk-slot' + n)?.getAttribute('aria-label')), mp: [window.__scene.me().mp, window.__scene.me().maxMp], toasts: [...document.querySelectorAll('#toast p')].map((p) => p.textContent) })`,
      );
      console.error(`  chẩn đoán: ${diag}`);
      console.error(`  máy chủ: ${serverDiag()}`);
    } catch {
      /* tab đã đóng */
    }
    await tab?.shot("chieu-vo-sac-that-bai", { onFailure: true });
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
  out("\n=== E2E CHIÊU VẬN TIA / KÉO / HỘ THỂ ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
