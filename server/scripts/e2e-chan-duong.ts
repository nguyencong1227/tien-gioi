// E2E THẬT Gặp chặn đường (CD11 #1230, QUYET_DINH_M3 mục 52 / 53): server Colyseus thật (trong tiến trình, thư mục dữ liệu tạm,
// KHÔNG ghi `server/data/players` thật, KHÔNG cổng 2567) phục vụ client/dist, MỘT tab Chrome headless điều khiển bằng CDP.
// Luồng qua giao diện + phím thật: đi bộ ngoài vùng hoang -> hộp thoại chặn đường -> Enter = Chiến -> đấu trường solo -> thẻ kết quả
// -> về ĐÚNG chỗ cũ. Mỗi ca một nhân vật mới.
//
// Tất định, KHÔNG sửa mã trò chơi: `AMBUSH=on` đặt TRƯỚC khi dựng phòng; sau khi phòng có người, tiêm vào `world.ambush` (đối tượng
// `AmbushRuntime` vốn dành cho việc tiêm): `random = () => 0` (luôn trúng xúc xắc), bảng bầy MỘT bầy nhỏ (bảng thật `AMBUSH_FOES` còn rỗng,
// CD5b). Kích hoạt: dịch nhân vật tới chỗ đi bộ được ngoài trấn (dữ liệu RIÊNG của chính kịch bản), đặt quãng đã đi sát một bước chân
// (`AMBUSH_STRIDE_PX`), rồi cho CLIENT THẬT giữ phím D vài trăm ms để máy chủ tự cộng quãng đi thật và tung xúc xắc.
// Thoát 0 khi đạt, 1 khi sai.
//
// Chạy: `npm run build && npm run e2e:chan-duong -w server` (cần google-chrome; client/dist phải là bản build mới).
// `E2E_ONLY=1,3` chỉ chạy các ca đó (dev). Cổng server ngẫu nhiên 36000-39999, CDP 9500-9899.
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { AMBUSH_STRIDE_PX, DEFAULT_MAP_ID, type AmbushFoeGroup } from "@tien-gioi/shared";
import { Tab, sleep, shown, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 36000 + Math.floor(Math.random() * 4000);
let PORT = pickPort();
const CDP = 9500 + Math.floor(Math.random() * 400);
const out = (m: string) => console.log(m);
const only = (process.env.E2E_ONLY ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);
const wanted = (n: number) => only.length === 0 || only.includes(n);

/** Bầy duy nhất của kịch bản: MỘT Hôi Lang (cấp 1) cho người bậc 0-3 ở Lạc Hà (tiêm vào `world.ambush.foes`). */
const GROUP: AmbushFoeGroup = {
  id: "e2e_hoi_lang",
  name: "Hôi Lang Chặn Đường",
  mapId: DEFAULT_MAP_ID,
  minStep: 0,
  maxStep: 3,
  tier: "normal",
  foes: [{ kind: "lang", count: 1 }],
};

/** Phím thật qua CDP. */
interface Key {
  key: string;
  code: string;
  vk: number;
  text?: string;
}
const KEY = {
  D: { key: "d", code: "KeyD", vk: 68, text: "d" },
  J: { key: "j", code: "KeyJ", vk: 74, text: "j" },
  ENTER: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
} satisfies Record<string, Key>;

async function main() {
  out(
    "=== E2E THẬT Gặp chặn đường: Chrome headless + Server Colyseus thật (AMBUSH=on, tiêm tất định) ===",
  );
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }

  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-chanduong-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-chanduong-chrome-"));
  process.env.DATA_DIR = dataDir;
  process.env.AMBUSH = "on"; // TRƯỚC khi dựng phòng: `WorldRoom.onCreate` đọc `ambushOn(process.env)` đúng một lần

  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { ambushOf, ambushBlocked } = await import("../src/systems/ambush.js");
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
  out(`- Server thật: http://127.0.0.1:${PORT} (AMBUSH=on)`);

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;

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

    // ---------------------------------------------------------------- tiện ích
    let identityScript: string | null = null;
    const setIdentity = async (name: string, secret: string) => {
      if (identityScript)
        await T.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: identityScript });
      const r = await T.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(name)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(secret)});`,
      });
      identityScript = String(r.result?.identifier ?? "");
    };
    /** Sự thật phía SERVER (cùng tiến trình) của phòng mà tab đang ở. */
    const serverPlayer = async () => {
      const roomId = String(await T.ev(`window.__scene?.room?.roomId ?? ''`));
      const sid = String(await T.ev(`window.__scene?.room?.sessionId ?? ''`));
      const room = matchMaker.getLocalRoomById(roomId) as any;
      return {
        roomId,
        sid,
        room,
        world: room?.world as any,
        ctrl: room?.world?.ctrl?.get(sid) as any,
        p: room?.state?.players?.get(sid) as any,
      };
    };
    const until = async (fn: () => boolean | Promise<boolean>, label: string, ms = 8000) => {
      for (const end = Date.now() + ms; Date.now() < end;) {
        if (await fn()) return;
        await sleep(100);
      }
      throw new Error(`Hết thời gian chờ (${ms}ms): ${label}`);
    };
    const check = (cond: unknown, msg: string) => {
      if (!cond) throw new Error(msg);
      out(`  ✓ ${msg}`);
    };
    const frames = (n: number) =>
      T.ev(
        `new Promise((res) => { let k = ${n}; const f = () => (--k <= 0 ? res(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`,
      );
    /** Giữ các phím `ms` mili giây VÀ ít nhất 4 khung hình Phaser (di chuyển / đánh cần phím GIỮ). */
    const hold = async (keys: Key[], ms: number) => {
      const base = (k: Key) => ({
        key: k.key,
        code: k.code,
        windowsVirtualKeyCode: k.vk,
        nativeVirtualKeyCode: k.vk,
        modifiers: 0,
      });
      for (const k of keys)
        await T.send("Input.dispatchKeyEvent", {
          ...base(k),
          type: k.text ? "keyDown" : "rawKeyDown",
          ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}),
        });
      await frames(4);
      await sleep(ms);
      for (const k of keys.slice().reverse())
        await T.send("Input.dispatchKeyEvent", { ...base(k), type: "keyUp" });
      await frames(2);
    };
    const tap = (k: Key) => hold([k], 30);

    const login = async (name: string, secret: string) => {
      await setIdentity(name, secret);
      await T.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug` });
      await T.waitFor(
        `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
        "form đăng nhập",
      );
      await T.ev(`document.getElementById('login-form').requestSubmit(); 1`);
      await T.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "vào game thành công",
      );
    };

    /** Chỗ đi bộ được ngoài trấn (không khu an toàn), có thêm 160 px trống về phía +x để giữ phím D. */
    const wildSpot = (world: any, skip: number): { x: number; y: number } => {
      const map = world.map;
      const c = map.townPx;
      const monsters: { x: number; y: number }[] = [];
      world.state.monsters.forEach((m: any) => monsters.push({ x: m.x, y: m.y }));
      let seen = 0;
      for (const r of [700, 800, 900, 600, 1000, 1100, 1250])
        for (let i = 0; i < 48; i++) {
          const ang = (i * Math.PI) / 24;
          const x = c.x + Math.cos(ang) * r;
          const y = c.y + Math.sin(ang) * r;
          if (map.inSafe(x, y, 80)) continue;
          let ok = true;
          for (let k = 0; k <= 8; k++) if (map.circleBlocked(x + k * 20, y, 14)) ok = false;
          // không quái nào trong 260 px (quái nhắm người chơi làm "đang giao chiến" / trùm gần làm `ambushBlocked` chặn)
          if (ok && monsters.some((m) => Math.hypot(m.x - x, m.y - y) < 260)) ok = false;
          if (ok && seen++ >= skip) return { x, y };
        }
      throw new Error("Không tìm được chỗ đi bộ ngoài trấn (không quái gần) cho kịch bản");
    };

    /** Vào game, tiêm cấu hình tất định, dịch ra vùng hoang, đặt quãng đi sát một bước chân. Trả sự thật server. */
    const prepare = async (name: string, secret: string) => {
      await login(name, secret);
      const sp = await serverPlayer();
      if (!sp.world?.ambush) throw new Error("world.ambush null: AMBUSH=on chưa có hiệu lực");
      sp.world.ambush.random = () => 0; // luôn trúng xúc xắc
      sp.world.ambush.foes = [GROUP];
      const a = ambushOf(sp.world, sp.ctrl);
      a.cooldownUntil = 0; // vừa vào game thì có hồi 3 phút: bỏ để kích hoạt tất định
      let spot = { x: 0, y: 0 };
      for (let skip = 0; ; skip++) {
        spot = wildSpot(sp.world, skip);
        sp.p.x = spot.x;
        sp.p.y = spot.y;
        syncPublicPos(sp.p);
        // chỉ lấy chỗ mà máy chủ KHÔNG chặn (không gần trùm, không giao chiến...): kiểm tại chỗ, không đoán
        const why = ambushBlocked(sp.world, sp.sid);
        if (why === null) break;
        out(`  - chỗ #${skip} bị chặn (${why}), thử chỗ khác`);
        if (skip >= 12) throw new Error(`Không có chỗ nào không bị chặn (${why})`);
      }
      await until(
        async () =>
          Number(await T.ev(`Math.abs((window.__scene?.predX ?? 0) - ${spot.x})`)) < 6 &&
          Number(await T.ev(`Math.abs((window.__scene?.predY ?? 0) - ${spot.y})`)) < 6,
        "client theo kịp vị trí ngoài trấn",
      );
      a.walked = AMBUSH_STRIDE_PX - 40;
      a.lastX = sp.p.x;
      a.lastY = sp.p.y;
      return { ...sp, a };
    };

    /** Cho client thật đi vài bước tới khi hộp thoại hiện. */
    const walkIntoAmbush = async () => {
      await hold([KEY.D], 700);
      const why = ambushBlocked((await serverPlayer()).world, (await serverPlayer()).sid);
      try {
        await T.waitFor(shown("ambush-modal"), "hộp thoại chặn đường hiện", 8000);
      } catch (e) {
        // chẩn đoán phía máy chủ: vì sao không chặn
        const s = await serverPlayer();
        const a = ambushOf(s.world, s.ctrl);
        out(
          `  [chẩn đoán] ngay sau khi đi: blocked=${JSON.stringify(why)}; x=${Math.round(s.p.x)}, walked=${Math.round(a.walked)}, offer=${Boolean(a.offer)}, cooldownUntil=${a.cooldownUntil} (now=${s.world.now}), blocked=${JSON.stringify(ambushBlocked(s.world, s.sid))}, hp=${s.p.hp}/${s.p.maxHp}, proto=${s.ctrl.proto}`,
        );
        throw e;
      }
    };

    const dialog = async () =>
      (await T.ev(
        `(() => { const q = (id) => document.getElementById(id); const sub = (id) => q(id).querySelector('.ab-sub')?.textContent ?? ''; const lab = (id) => q(id).querySelector('.ab-label')?.textContent ?? '';
          return { foe: q('ambush-foe').textContent, scene: q('ambush-scene').textContent, countdown: q('ambush-countdown').textContent, fight: lab('ambush-fight'), coin: lab('ambush-flee-coin') + ' | ' + sub('ambush-flee-coin'), exp: lab('ambush-flee-exp') + ' | ' + sub('ambush-flee-exp'), death: q('ambush-death-note').textContent }; })()`,
      )) as Record<string, string>;

    const names = new Map<string, string>();
    const secretOf = (n: string) => `e2e_secret_${n.replace(/\s/g, "").toLowerCase()}_0123456789`;
    const nameOf = (id: string) => {
      const n = `Chan Duong ${id}`;
      names.set(id, n);
      return n;
    };

    // =========================================================================
    // CA 1: Chiến thắng, về ĐÚNG chỗ cũ, bảo hộ 5 giây
    // =========================================================================
    if (wanted(1)) {
      out("\n--- Ca 1: Chiến, thắng, về đúng chỗ cũ, bảo hộ ---");
      const NAME = nameOf("Mot");
      const s0 = await prepare(NAME, secretOf(NAME));
      const originRoomId = s0.roomId;
      const coinBefore = Number(s0.ctrl.coin ?? 0);
      const expBefore = Number(s0.p.exp ?? 0);
      await walkIntoAmbush();
      const d = await dialog();
      out(`  - hộp thoại: ${JSON.stringify(d)}`);
      check(d.foe.includes(GROUP.name), `hộp thoại nêu tên kẻ chặn đường "${GROUP.name}"`);
      check(d.scene.length > 20, "văn mẫu tình huống hiện (không rỗng)");
      check(/^Chiến/.test(d.fight), "nút Chiến");
      check(
        d.coin.includes("Linh thạch") && d.exp.includes("tu vi"),
        "hai nút bỏ chạy: Linh thạch và tu vi, có giá trên nút",
      );
      check(/\d/.test(d.countdown), `đếm ngược hiện (${d.countdown})`);
      check(/CHẾT|chết|kiếp/i.test(d.death), `dòng cảnh báo chết thật luôn hiện ("${d.death}")`);
      const offer = s0.a.offer;
      check(offer, "máy chủ có hộp thoại (offer) cho người này");
      const origin = { x: s0.p.x as number, y: s0.p.y as number };

      await tap(KEY.ENTER);
      await T.waitFor(
        `document.body.classList.contains('in-arena') && !document.getElementById('ambush-hud').hidden`,
        "vào đấu trường (HUD hiện)",
        20000,
      );
      const s1 = await serverPlayer();
      check(s1.roomId !== originRoomId, "đã sang PHÒNG đấu trường (roomId khác phòng gốc)");
      check(s1.world?.arena, "máy chủ: phòng này là đấu trường (world.arena)");
      const clock = String(await T.ev(`document.getElementById('ahud-clock').textContent`));
      check(/^\d\d:\d\d$/.test(clock), `đồng hồ đấu trường (${clock})`);
      check(Boolean(await T.ev(shown("ahud-flee"))), "nút Bỏ chạy hiện trong đấu trường");

      // Hạ kẻ địch: máu 1 phía máy chủ, đòn đánh là của CLIENT THẬT (giữ J, quay mặt +x)
      const foeId = [...s1.world.arena.foes][0] as string;
      const foe = s1.room.state.monsters.get(foeId);
      check(foe, "kẻ địch có trong state đấu trường");
      foe.hp = 1;
      s1.p.x = foe.x - 40;
      s1.p.y = foe.y;
      syncPublicPos(s1.p);
      await sleep(300);
      await hold([KEY.D], 150);
      for (let i = 0; i < 12 && !(await T.ev(shown("ambush-result"))); i++)
        await hold([KEY.J], 250);
      await T.waitFor(shown("ambush-result"), "thẻ kết quả hiện", 15000);
      const title = String(await T.ev(`document.getElementById('ar-title').textContent`));
      const lines = (await T.ev(
        `[...document.getElementById('ar-lines').children].map((li) => li.textContent)`,
      )) as string[];
      out(`  - thẻ kết quả: "${title}" ${JSON.stringify(lines)}`);
      check(/thắng/i.test(title), `thẻ kết quả là chiến thắng ("${title}")`);
      check(
        lines.some((l) => /tu vi/i.test(l)),
        "thẻ nêu thưởng tu vi",
      );

      // Về ĐÚNG chỗ cũ trên bản đồ gốc + bảo hộ
      await until(
        async () => {
          const s = await serverPlayer();
          return s.world?.map?.def?.id === DEFAULT_MAP_ID && !s.world?.arena && Boolean(s.ctrl);
        },
        "về phòng bản đồ gốc",
        20000,
      );
      await T.waitFor(
        `!document.body.classList.contains('in-arena') && document.getElementById('ambush-hud').hidden`,
        "HUD đấu trường tắt",
      );
      const s2 = await serverPlayer();
      const off = Math.hypot(s2.p.x - origin.x, s2.p.y - origin.y);
      check(
        off < 40,
        `về ĐÚNG chỗ cũ (lệch ${off.toFixed(1)} px, chỗ cũ (${Math.round(origin.x)}, ${Math.round(origin.y)}))`,
      );
      check(
        Number(s2.ctrl.shieldUntil ?? 0) > Number(s2.world.now),
        "bảo hộ sau khi về (shieldUntil còn hiệu lực)",
      );
      check(
        Number(s2.ctrl.coin ?? 0) > coinBefore || Number(s2.p.exp ?? 0) > expBefore,
        "ví / tu vi tăng nhờ thưởng thắng",
      );
      const daily = s2.ctrl.save?.ambushDaily;
      check(daily?.n === 1, `hồ sơ ghi ambushDaily.n = 1 (${JSON.stringify(daily)})`);
    }

    out("\n(CÁC CA 2-6: chưa viết trong bản này)");
  } catch (e) {
    failed = e instanceof Error ? e.message : String(e);
    if (tab) {
      const tail = tab.consoleTail.join(" | ");
      out(`  console cuối: ${tail.slice(0, 600)}`);
    }
  } finally {
    const errs = tab?.errors ?? [];
    if (!failed && errs.length > 0)
      failed = `Lỗi console / exception: ${errs.slice(0, 4).join(" || ")}`;
    tab?.close();
    if (chrome?.pid) {
      try {
        process.kill(-chrome.pid, "SIGKILL");
      } catch {
        chrome.kill("SIGKILL");
      }
    }
    await gameServer.gracefullyShutdown(false).catch(() => undefined);
    await removeTmpDirs(dataDir, chromeDir);
  }
  if (failed) {
    console.error(`\n✗ E2E chặn đường ĐỎ: ${failed}`);
    process.exit(1);
  }
  out("\n✓ E2E chặn đường ĐẠT");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
