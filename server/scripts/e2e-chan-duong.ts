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
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
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

/** Tu vi đặt cho nhân vật ở các ca thử GIÁ tu vi. Giá tính bằng PHÚT SĂN của bậc (CD6b: 2 phút hộp thoại / 3 phút giữa trận; bậc 0 = 30 tu vi / phút => 60 / 90) và bị kẹp theo tu vi đang có, nên phải >= giá giữa trận (90) thì hai giá mới khác nhau và chưa bị kẹp hết. */
const EXP_FOR_PRICES = 200;

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

/**
 * Proxy TCP giữa Chrome và server Colyseus thật (như `e2e-noi-lai.ts`): `dropAll()` destroy socket => rớt mạng BẤT THƯỜNG (mã 1006) thật; `setAllow(false)`
 * chặn kết nối MỚI để cửa sổ "hồn lìa xác" (client tự nối lại ngay, vài chục ms) đủ dài mà đo được đồng hồ đóng băng / hết hạn chờ.
 */
class TcpProxy {
  private server: net.Server;
  private pairs = new Set<{ client: net.Socket; target: net.Socket }>();
  private allow = true;
  constructor(
    public listenPort: number,
    readonly targetPort: number,
  ) {
    this.server = net.createServer((client) => {
      if (!this.allow) {
        client.destroy();
        return;
      }
      const target = net.connect({ port: this.targetPort, host: "127.0.0.1" });
      const pair = { client, target };
      this.pairs.add(pair);
      client.pipe(target);
      target.pipe(client);
      const done = () => {
        this.pairs.delete(pair);
        client.destroy();
        target.destroy();
      };
      client.on("error", done);
      target.on("error", done);
      client.on("close", done);
      target.on("close", done);
    });
  }
  async listen(): Promise<number> {
    this.listenPort = await listenWithRetry(this.server, this.listenPort, {
      explicit: false,
      pick: () => pickPort() + 4000,
      host: "127.0.0.1",
    });
    return this.listenPort;
  }
  setAllow(allow: boolean) {
    this.allow = allow;
  }
  dropAll() {
    for (const p of Array.from(this.pairs)) {
      p.client.destroy();
      p.target.destroy();
    }
    this.pairs.clear();
  }
  close(): Promise<void> {
    this.dropAll();
    return new Promise((r) => this.server.close(() => r()));
  }
}

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

  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { changeCoin } = await import("../src/systems/wallet.js");
  const { giveItem } = await import("../src/systems/inventory.js");
  const { ambushOf, ambushBlocked, ambushPriceOf } = await import("../src/systems/ambush.js");
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
  const proxy = new TcpProxy(pickPort() + 4000, PORT);
  let PORT_PROXY = 0;
  try {
    PORT_PROXY = await proxy.listen();
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }
  out(`- Server thật: http://127.0.0.1:${PORT} (AMBUSH=on); Proxy TCP: ${PORT_PROXY} -> ${PORT}`);

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
      proxy.setAllow(true); // ca trước có thể đã chặn kết nối mới
      await T.send("Page.navigate", { url: `http://127.0.0.1:${PORT_PROXY}/?debug` });
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

    /**
     * Chỗ đi bộ được ngoài trấn (không khu an toàn), có 160 px trống về phía +x để giữ phím D, không quái nào trong 260 px (quái nhắm người chơi làm
     * "đang giao chiến"). Xếp theo độ XA TRÙM giảm dần (`ambushBlocked` nhánh "boss": trùm sống trong `MONSTER_WAKE_DIST` = 900 px chặn; trùm còn lang
     * thang quanh nhà nên lấy chỗ xa nhất có thể, theo toạ độ NHÀ của trùm); `skip` lấy chỗ thứ `skip` của danh sách đó.
     */
    const wildSpot = (world: any, skip: number): { x: number; y: number } => {
      const map = world.map;
      const c = map.townPx;
      const monsters: { x: number; y: number }[] = [];
      world.state.monsters.forEach((m: any) => monsters.push({ x: m.x, y: m.y }));
      const bossHomes: { x: number; y: number }[] = [];
      for (const [id, mc] of world.mctrl as Map<string, any>)
        if (mc.boss !== undefined || mc.def?.boss === true) {
          const m = world.state.monsters.get(id);
          bossHomes.push({ x: mc.homeX ?? m?.x ?? 0, y: mc.homeY ?? m?.y ?? 0 });
        }
      const cands: { x: number; y: number; clear: number }[] = [];
      for (const r of [600, 700, 800, 900, 1000, 1100, 1200, 1300])
        for (let i = 0; i < 96; i++) {
          const ang = (i * Math.PI) / 48;
          const x = c.x + Math.cos(ang) * r;
          const y = c.y + Math.sin(ang) * r;
          if (map.inSafe(x, y, 80)) continue;
          let ok = true;
          for (let k = 0; k <= 8; k++) if (map.circleBlocked(x + k * 20, y, 14)) ok = false;
          if (!ok || monsters.some((m) => Math.hypot(m.x - x, m.y - y) < 260)) continue;
          const clear = Math.min(1500, ...bossHomes.map((b) => Math.hypot(b.x - x, b.y - y)));
          cands.push({ x, y, clear });
        }
      cands.sort((u, v) => v.clear - u.clear);
      const pick = cands[skip];
      if (!pick)
        throw new Error(
          `Không tìm được chỗ đi bộ ngoài trấn cho kịch bản (còn ${cands.length} chỗ, đã bỏ ${skip})`,
        );
      return pick;
    };

    type Prepared = Awaited<ReturnType<typeof serverPlayer>> & { a: ReturnType<typeof ambushOf> };
    let cur: Prepared | null = null;

    /** Dịch nhân vật tới chỗ ngoài trấn mà máy chủ KHÔNG chặn, đặt quãng đi sát một bước chân, chờ client theo kịp. */
    const placeInWild = async (sp: Prepared, from = 0) => {
      sp.a.cooldownUntil = 0; // TRƯỚC vòng chọn chỗ: `ambushBlocked` có nhánh "cooldown" (vừa vào game có hồi 3 phút)
      let spot = { x: 0, y: 0 };
      for (let skip = from; ; skip++) {
        spot = wildSpot(sp.world, skip);
        sp.p.x = spot.x;
        sp.p.y = spot.y;
        syncPublicPos(sp.p);
        // chỉ lấy chỗ mà máy chủ KHÔNG chặn (không gần trùm, không giao chiến...): kiểm tại chỗ, không đoán
        const why = ambushBlocked(sp.world, sp.sid);
        if (why === null) break;
        out(`  - chỗ #${skip} bị chặn (${why}), thử chỗ khác`);
        if (skip >= from + 12) throw new Error(`Không có chỗ nào không bị chặn (${why})`);
      }
      await until(
        async () =>
          Number(await T.ev(`Math.abs((window.__scene?.predX ?? 0) - ${spot.x})`)) < 6 &&
          Number(await T.ev(`Math.abs((window.__scene?.predY ?? 0) - ${spot.y})`)) < 6,
        "client theo kịp vị trí ngoài trấn",
      );
      sp.a.cooldownUntil = 0;
      sp.a.walked = AMBUSH_STRIDE_PX - 40;
      sp.a.lastX = sp.p.x;
      sp.a.lastY = sp.p.y;
    };

    /** Vào game, tiêm cấu hình tất định, dịch ra vùng hoang, đặt quãng đi sát một bước chân. Trả sự thật server. */
    /** Đặt ĐÚNG `n` đan hồi khí huyết loại `itemId` trong túi (xoá MỌI đan hồi khí huyết cũ, rồi `giveItem` gửi tin `inv` cho client thật). */
    const HEAL_POTIONS = ["hoi_huyet_dan", "dai_hoi_huyet_dan", "thuong_hoi_huyet_dan"];
    const setPotions = (sp: Prepared, n: number, itemId = "hoi_huyet_dan") => {
      const inv = sp.ctrl.inv as Array<{ itemId: string; qty: number } | null>;
      for (let i = 0; i < inv.length; i++)
        if (HEAL_POTIONS.includes(inv[i]?.itemId ?? "")) inv[i] = null;
      if (n > 0) giveItem(sp.world, sp.sid, itemId, n);
    };

    const prepare = async (name: string, secret: string) => {
      await login(name, secret);
      const sp = await serverPlayer();
      if (!sp.world?.ambush) throw new Error("world.ambush null: AMBUSH=on chưa có hiệu lực");
      sp.world.ambush.random = () => 0; // luôn trúng xúc xắc
      sp.world.ambush.foes = [GROUP];
      const full: Prepared = { ...sp, a: ambushOf(sp.world, sp.ctrl) };
      await placeInWild(full);
      cur = full;
      return full;
    };

    /**
     * Cho client thật đi vài bước tới khi hộp thoại hiện. Lần tung xúc xắc chỉ có MỘT lượt mỗi bước chân: quái / trùm ngẫu nhiên có thể đi tới gần giữa lúc
     * kiểm và lúc tung (`ambushBlocked`), nên thử lại tối đa 4 lần với chỗ khác thay vì đỏ giả.
     */
    const walkIntoAmbush = async () => {
      const sp = cur;
      if (!sp) throw new Error("chưa prepare");
      for (let attempt = 0; ; attempt++) {
        await hold([KEY.D], 700);
        const why = ambushBlocked(sp.world, sp.sid);
        try {
          await T.waitFor(
            shown("ambush-modal"),
            "hộp thoại chặn đường hiện",
            attempt >= 3 ? 8000 : 2500,
          );
          return;
        } catch (e) {
          out(
            `  [chẩn đoán lần ${attempt + 1}] ngay sau khi đi: blocked=${JSON.stringify(why)}; x=${Math.round(sp.p.x)}, walked=${Math.round(sp.a.walked)}, offer=${Boolean(sp.a.offer)}`,
          );
          if (attempt >= 3) throw e;
          await placeInWild(sp, 3 * (attempt + 1)); // chỗ khác + đặt lại quãng đi
        }
      }
    };

    const dialog = async () =>
      (await T.ev(
        `(() => { const q = (id) => document.getElementById(id); const sub = (id) => q(id).querySelector('.ab-sub')?.textContent ?? ''; const lab = (id) => q(id).querySelector('.ab-label')?.textContent ?? '';
          return { foe: q('ambush-foe').textContent, scene: q('ambush-scene').textContent, countdown: q('ambush-countdown').textContent, fight: lab('ambush-fight'), coin: lab('ambush-flee-coin') + ' | ' + sub('ambush-flee-coin'), exp: lab('ambush-flee-exp') + ' | ' + sub('ambush-flee-exp'), death: q('ambush-death-note').textContent, potion: q('ambush-potion-note').textContent }; })()`,
      )) as Record<string, string>;

    /** Bấm nút theo id (hàm `click()` của trang: sự kiện bấm của chính nút, đã qua `AMBUSH_ARM_MS`). */
    const click = (id: string) => T.ev(`document.getElementById(${JSON.stringify(id)}).click(); 1`);
    /** `AMBUSH_ARM_MS` = 700 ms: bấm sớm hơn bị bỏ qua, nên đợi 900 ms sau khi hộp thoại / tấm xác nhận hiện. */
    const ARM_MS = 900;
    /** Enter = Chiến rồi chờ vào đấu trường; trả sự thật server của PHÒNG ĐẤU TRƯỜNG + kẻ địch (state). */
    const fightIntoArena = async (originRoomId: string) => {
      await sleep(ARM_MS);
      await tap(KEY.ENTER);
      await T.waitFor(
        `document.body.classList.contains('in-arena') && !document.getElementById('ambush-hud').hidden`,
        "vào đấu trường (HUD hiện)",
        20000,
      );
      const s = await serverPlayer();
      if (s.roomId === originRoomId || !s.world?.arena)
        throw new Error("không sang phòng đấu trường");
      const foeId = [...s.world.arena.foes][0] as string;
      return { ...s, foe: s.room.state.monsters.get(foeId) as any };
    };
    /** Về phòng bản đồ gốc (không còn đấu trường) và HUD đấu trường tắt. */
    const backToOrigin = async (ms = 20000) => {
      await until(
        async () => {
          const s = await serverPlayer();
          return s.world?.map?.def?.id === DEFAULT_MAP_ID && !s.world?.arena && Boolean(s.ctrl);
        },
        "về phòng bản đồ gốc",
        ms,
      );
      await T.waitFor(
        `!document.body.classList.contains('in-arena') && document.getElementById('ambush-hud').hidden`,
        "HUD đấu trường tắt",
      );
      return serverPlayer();
    };
    /** Rớt mạng BẤT THƯỜNG (mã 1006) và CHẶN kết nối mới (gọi `proxy.setAllow(true)` để cho nối lại). */
    const dropSocket = () => {
      proxy.setAllow(false);
      proxy.dropAll();
    };
    /** Hồ sơ đã lưu xuống đĩa của nhân vật `name`. */
    const savedOf = (name: string) => {
      const file = path.join(
        dataDir,
        `${createHash("sha1").update(name.normalize("NFC").toLowerCase().trim()).digest("hex")}.json`,
      );
      return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as any) : null;
    };

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
      setPotions(s0, 1); // túi chỉ còn 1 Hồi Huyết Đan: hộp thoại phải nhắc (số đo #1254: 1 đan chưa đủ cho kẻ cầm đầu bậc 11)
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
      check(
        d.potion === "Túi chỉ còn 1 đan hồi huyết: nên mang ít nhất 2.",
        `túi 1 đan: dòng nhắc đan nêu ĐÚNG số đan thật của máy chủ ("${d.potion}")`,
      );
      const offer = s0.a.offer!;
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

    // =========================================================================
    // CA 2: bỏ chạy Ở HỘP THOẠI bằng Linh thạch: ví giảm ĐÚNG giá hiện trên nút, đi tiếp như chưa có gì
    // =========================================================================
    if (wanted(2)) {
      out("\n--- Ca 2: bỏ chạy ở hộp thoại bằng Linh thạch ---");
      const NAME = nameOf("Hai");
      const s0 = await prepare(NAME, secretOf(NAME));
      changeCoin(s0.world, s0.sid, 500); // TRƯỚC khi hộp thoại mở: `price.coin.enough` tính lúc mở
      const coin0 = Number(s0.ctrl.coin);
      setPotions(s0, 2, "dai_hoi_huyet_dan"); // đủ 2 đan (loại ĐẠI, không phải đan thường): KHÔNG có dòng nhắc
      await walkIntoAmbush();
      const price = s0.a.offer!.price as { exp: number; coin: { price: number; enough: boolean } };
      check(
        price.coin.enough && price.coin.price > 0,
        `giá Linh thạch trên nút ${price.coin.price} (đủ tiền)`,
      );
      const d = await dialog();
      check(d.potion === "", `túi 2 Đại Hồi Huyết Đan: KHÔNG có dòng nhắc đan ("${d.potion}")`);
      check(
        new RegExp(`(^|\\D)${price.coin.price}(\\D|$)`).test(d.coin),
        `nút bỏ chạy bằng Linh thạch HIỆN đúng giá của máy chủ ("${d.coin}")`,
      );
      await sleep(ARM_MS);
      await click("ambush-flee-coin");
      await until(() => s0.a.offer === undefined, "máy chủ đóng hộp thoại");
      await T.waitFor(
        `document.getElementById('ambush-modal')?.hidden ?? true`,
        "hộp thoại đóng ở client",
      );
      await until(
        () => Number(s0.ctrl.coin) === coin0 - price.coin.price,
        `ví giảm ĐÚNG ${price.coin.price} (client không gửi số)`,
      );
      out(`  ✓ ví ${coin0} -> ${s0.ctrl.coin} (đúng giá hiện trên nút ${price.coin.price})`);
      const s1 = await serverPlayer();
      check(s1.roomId === s0.roomId && !s1.world.arena, "vẫn ở phòng gốc (không vào đấu trường)");
      check(s0.a.cooldownUntil > s0.world.now, "đã đặt hồi sau lần chặn");
      const x0 = Number(s1.p.x);
      await hold([KEY.D], 400);
      const x1 = Number((await serverPlayer()).p.x);
      check(x1 - x0 > 20, `đi tiếp được như chưa có gì (x ${Math.round(x0)} -> ${Math.round(x1)})`);
      const daily = s0.ctrl.save?.ambushDaily;
      check(daily?.n === 1, `ambushDaily.n = 1 (${JSON.stringify(daily)})`);
    }

    // =========================================================================
    // CA 3: bỏ chạy GIỮA TRẬN: nút luôn bấm được, vận 1 giây, giá GẤP ĐÔI, về chỗ cũ
    // =========================================================================
    if (wanted(3)) {
      out("\n--- Ca 3: bỏ chạy giữa trận (vận 1 giây, giá gấp đôi) ---");
      const NAME = nameOf("Ba");
      const s0 = await prepare(NAME, secretOf(NAME));
      changeCoin(s0.world, s0.sid, 5000);
      s0.p.exp = EXP_FOR_PRICES; // giá tu vi bị KẸP theo tu vi đang có: nhân vật mới (0) thì giá 0, không so được hộp thoại với giữa trận
      const coin0 = Number(s0.ctrl.coin);
      await walkIntoAmbush();
      const offerPrice = s0.a.offer!.price as { exp: number; coin: { price: number } };
      const origin = { x: s0.p.x as number, y: s0.p.y as number };
      const s1 = await fightIntoArena(s0.roomId);
      const mid = s1.world.arena.price as { exp: number; coin: { price: number; enough: boolean } };
      check(
        Math.abs(mid.coin.price - 2 * offerPrice.coin.price) <= 1,
        `giá giữa trận ${mid.coin.price} Linh thạch ~ GẤP ĐÔI giá hộp thoại ${offerPrice.coin.price}`,
      );
      check(
        mid.exp > offerPrice.exp,
        `giá tu vi giữa trận ${mid.exp} > hộp thoại ${offerPrice.exp}`,
      );
      await click("ahud-flee");
      await T.waitFor(shown("ambush-flee-modal"), "tấm xác nhận bỏ chạy hiện");
      const sub = String(
        await T.ev(`document.querySelector('#aflee-coin .ab-sub')?.textContent ?? ''`),
      );
      check(
        new RegExp(`(^|\\D)${mid.coin.price}(\\D|$)`).test(sub),
        `nút xác nhận hiện đúng giá giữa trận ("${sub}")`,
      );
      await sleep(ARM_MS);
      await click("aflee-coin");
      await until(() => s1.world.arena.fleeing !== undefined, "máy chủ bắt đầu VẬN bỏ chạy");
      check(s1.world.arena.fleeing.choice === "flee_coin", "đang vận bỏ chạy bằng Linh thạch");
      check(Number(s1.ctrl.coin) === coin0, `ví CHƯA đổi trong lúc vận (${s1.ctrl.coin})`);
      const s2 = await backToOrigin();
      check(
        Number(s2.ctrl.coin) === coin0 - mid.coin.price,
        `ví giảm ĐÚNG giá giữa trận: ${coin0} -> ${s2.ctrl.coin} (-${mid.coin.price})`,
      );
      const off = Math.hypot(s2.p.x - origin.x, s2.p.y - origin.y);
      check(off < 40, `thoát về ĐÚNG chỗ cũ (lệch ${off.toFixed(1)} px)`);
    }

    // =========================================================================
    // CA 4: thua = CHẾT THẬT (mục 53): Hoàng Tuyền ở phòng gốc, mất kiếp, KHÔNG trừ thêm giá
    // =========================================================================
    if (wanted(4)) {
      out("\n--- Ca 4: thua là chết thật (Hoàng Tuyền, không trừ giá) ---");
      const NAME = nameOf("Bon");
      const s0 = await prepare(NAME, secretOf(NAME));
      changeCoin(s0.world, s0.sid, 300);
      s0.p.exp = 40;
      const coin0 = Number(s0.ctrl.coin);
      await walkIntoAmbush();
      const s1 = await fightIntoArena(s0.roomId);
      const arena4 = s1.world.arena; // giữ tham chiếu: kết cục nằm ở `arena.end`
      s1.p.hp = 1; // một đòn là gục
      s1.p.x = s1.foe.x - 30;
      s1.p.y = s1.foe.y;
      syncPublicPos(s1.p);
      await T.waitFor(shown("limbo-overlay"), "màn Hoàng Tuyền hiện (chết thật)", 30000);
      // màn hiện NGAY ở phòng đấu trường (lúc gục) rồi giữ qua lần chuyển về phòng gốc ở trạng thái Hoàng Tuyền (`AMBUSH_FALL_MS`): chờ tới khi đã về
      await until(
        async () => {
          const s = await serverPlayer();
          return (
            s.world?.map?.def?.id === DEFAULT_MAP_ID && !s.world?.arena && Boolean(s.ctrl?.limbo)
          );
        },
        "về PHÒNG GỐC ở trạng thái Hoàng Tuyền",
        25000,
      );
      await T.waitFor(
        shown("limbo-overlay"),
        "màn Hoàng Tuyền còn hiện sau khi về phòng gốc",
        10000,
      );
      const s2 = await serverPlayer();
      check(
        s2.world?.map?.def?.id === DEFAULT_MAP_ID && !s2.world?.arena,
        "màn Hoàng Tuyền hiện ở PHÒNG GỐC (không phải đấu trường)",
      );
      check(s2.ctrl?.limbo, "máy chủ: nhân vật ở trạng thái Hoàng Tuyền (mất kiếp)");
      // Hoàng Tuyền đặt lại ví / tu vi về 0 (luật chết thật chung, `docs/THIET_KE_LUAN_HOI.md` mục 4), nên so với chỗ GHI LẠI lúc chết (`coinAtDeath`)
      check(
        Number(s2.ctrl.limbo.coinAtDeath) === coin0,
        `KHÔNG trừ thêm giá Linh thạch: ví lúc chết ${s2.ctrl.limbo.coinAtDeath} = ví trước trận ${coin0}`,
      );
      check(
        arena4.end?.result === "lost" && arena4.end?.died === true,
        `kết cục trận là thua + chết thật (${JSON.stringify(arena4.end)})`,
      );
      check(
        arena4.end?.paid === undefined,
        "kết cục không có `paid` (cái chết thay giá: không trừ tu vi / Linh thạch)",
      );
    }

    // =========================================================================
    // CA 5: rớt mạng: đồng hồ ĐÓNG BĂNG, nối lại còn nguyên; quá hạn chờ mới trả giá
    // =========================================================================
    const FREEZE_MS = 800;
    if (wanted(5)) {
      out("\n--- Ca 5a: rớt mạng LÚC HỘP THOẠI: đóng băng, nối lại còn nguyên ---");
      WorldRoom.reconnectGraceS = 20;
      const NAME = nameOf("NamA");
      const s0 = await prepare(NAME, secretOf(NAME));
      changeCoin(s0.world, s0.sid, 500);
      s0.p.exp = EXP_FOR_PRICES;
      await walkIntoAmbush();
      const offer = s0.a.offer!;
      const id0 = offer.id as string;
      const exp0 = Number(s0.p.exp);
      dropSocket();
      await until(() => s0.world.ghosts.has(s0.sid), "máy chủ thấy hồn lìa xác");
      const r1 = offer.endsAt - s0.world.now;
      await sleep(FREEZE_MS);
      const r2 = offer.endsAt - s0.world.now;
      check(
        Math.abs(r1 - r2) < 150,
        `đồng hồ hộp thoại ĐÓNG BĂNG trong lúc chờ nối lại (còn ${r1} -> ${r2} ms sau ${FREEZE_MS} ms)`,
      );
      check(
        s0.a.offer === offer && Number(s0.p.exp) === exp0,
        "hộp thoại còn nguyên, chưa trừ giá",
      );
      proxy.setAllow(true); // cho nối lại: client tự thử lại mỗi 1,5 s
      await T.waitFor(
        `(() => { const b = document.getElementById('reconnect-banner'); return (!b || b.hidden) && ${shown("ambush-modal")}; })()`,
        "nối lại xong và hộp thoại hiện LẠI",
        20000,
      );
      const s1 = await serverPlayer();
      check(s1.ctrl.ambush?.offer?.id === id0, `cùng hộp thoại sau khi nối lại (id ${id0})`);
      check(Number(s1.p.exp) === exp0, "tu vi không đổi sau nối lại kịp");
      const dd = await dialog();
      check(
        Number(dd.countdown.split(":")[1]) >= 8,
        `đếm ngược tiếp tục từ chỗ đã đóng băng (${dd.countdown}, đóng băng ở ~9,5 giây)`,
      );

      out("\n--- Ca 5b: rớt mạng QUÁ HẠN lúc hộp thoại: trả giá hộp thoại bằng tu vi ---");
      WorldRoom.reconnectGraceS = 2; // proxy chặn kết nối mới nên client không nối lại được trong hạn này
      const NAME_B = nameOf("NamB");
      const b0 = await prepare(NAME_B, secretOf(NAME_B));
      b0.p.exp = EXP_FOR_PRICES;
      await walkIntoAmbush();
      const expB0 = Number(b0.p.exp);
      const priceB = Math.min(Number(b0.a.offer!.price.exp), Math.floor(expB0));
      check(priceB > 0, `giá tu vi hộp thoại ${priceB} (tu vi ${expB0})`);
      dropSocket();
      await until(
        () => !b0.world.ctrl.has(b0.sid),
        "người chơi rời phòng sau khi hết hạn chờ",
        15000,
      );
      await until(
        () => {
          const sv = savedOf(NAME_B);
          return sv !== null && Number(sv.exp) === expB0 - priceB;
        },
        `hồ sơ lưu: tu vi ${expB0} -> ${expB0 - priceB} (trả giá hộp thoại bằng tu vi)`,
        10000,
      );
      out(`  ✓ quá hạn mới trả giá: tu vi ${expB0} -> ${savedOf(NAME_B).exp} (giá ${priceB})`);

      out("\n--- Ca 5c: rớt mạng GIỮA TRẬN: đóng băng đồng hồ trận, nối lại còn nguyên ---");
      WorldRoom.reconnectGraceS = 20;
      const NAME_C = nameOf("NamC");
      const c0 = await prepare(NAME_C, secretOf(NAME_C));
      changeCoin(c0.world, c0.sid, 500);
      await walkIntoAmbush();
      const c1 = await fightIntoArena(c0.roomId);
      const arena = c1.world.arena;
      dropSocket();
      await until(() => c1.world.ghosts.has(c1.sid), "máy chủ thấy hồn lìa xác (đấu trường)");
      const m1 = arena.deadline - c1.world.now;
      await sleep(FREEZE_MS);
      const m2 = arena.deadline - c1.world.now;
      check(
        Math.abs(m1 - m2) < 150,
        `đồng hồ TRẬN ĐÓNG BĂNG (còn ${m1} -> ${m2} ms sau ${FREEZE_MS} ms)`,
      );
      proxy.setAllow(true);
      await T.waitFor(
        `(() => { const b = document.getElementById('reconnect-banner'); return (!b || b.hidden) && !document.getElementById('ambush-hud').hidden && document.body.classList.contains('in-arena'); })()`,
        "nối lại xong, HUD đấu trường hiện lại",
        20000,
      );
      const c2 = await serverPlayer();
      check(
        c2.world.arena === arena && arena.phase === "fighting",
        "trận còn nguyên sau khi nối lại",
      );

      out("\n--- Ca 5d: rớt mạng QUÁ HẠN giữa trận: trả giá bằng tu vi ---");
      WorldRoom.reconnectGraceS = 2;
      const NAME_D = nameOf("NamD");
      const d0 = await prepare(NAME_D, secretOf(NAME_D));
      changeCoin(d0.world, d0.sid, 500);
      d0.p.exp = EXP_FOR_PRICES;
      await walkIntoAmbush();
      const d1 = await fightIntoArena(d0.roomId);
      const expD0 = Number(d1.p.exp);
      const acted = d1.world.arena.acted === true;
      const priceD = Math.min(
        acted
          ? Number(d1.world.arena.price.exp)
          : Number(ambushPriceOf(d1.p, d1.ctrl, "offer").exp),
        Math.floor(expD0),
      );
      check(priceD > 0, `giá tu vi bị trừ khi rớt giữa trận ${priceD} (tu vi ${expD0})`);
      dropSocket();
      await until(
        () => !d1.world.ctrl.has(d1.sid),
        "người chơi rời đấu trường sau khi hết hạn chờ",
        15000,
      );
      await until(
        () => {
          const sv = savedOf(NAME_D);
          return sv !== null && Number(sv.exp) === expD0 - priceD;
        },
        `hồ sơ lưu: tu vi ${expD0} -> ${expD0 - priceD} (giá giữa trận bằng tu vi)`,
        10000,
      );
      out(`  ✓ quá hạn mới trả giá giữa trận: tu vi ${expD0} -> ${savedOf(NAME_D).exp}`);
    }

    // =========================================================================
    // CA 6: hồ sơ đúng sau chặn đường; không lỗi / cảnh báo console (Tab gom `errors`, kiểm ở cuối)
    // =========================================================================
    if (wanted(6) && names.has("Mot")) {
      out("\n--- Ca 6: hồ sơ đã lưu của ca 1 ---");
      const sv = savedOf(names.get("Mot")!);
      check(sv, "hồ sơ ca 1 đã xuống đĩa");
      check(
        sv.ambushDaily?.n === 1,
        `hồ sơ: ambushDaily.n = 1 (${JSON.stringify(sv.ambushDaily)})`,
      );
      check(
        typeof sv.ambushUntil === "number" && sv.ambushUntil > 0,
        "hồ sơ: ambushUntil (hồi) đã ghi",
      );
      check(sv.mapId === DEFAULT_MAP_ID, `hồ sơ: ở bản đồ gốc (${sv.mapId})`);
    }
    out(`\n(không lỗi console / cảnh báo mất tin: kiểm ở bước cuối trên ${names.size} nhân vật)`);
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
    await proxy.close().catch(() => undefined);
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
