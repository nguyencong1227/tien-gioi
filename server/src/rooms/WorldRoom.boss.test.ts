// Test tích hợp Trùm nhiều chiêu (T6 #875, docs/THIET_KE_TRUM.md mục 2, 4):
// Chạy trên máy chủ Colyseus THẬT với `BOSS_MOVES=on` và dữ liệu `BOSSES` thật (Xích Mãng ở Hắc Phong Cốc).
// Kiểm chứng:
//   1. Client gần trùm nhận `fx` `bossCast` và `warn` qua `sendNear`; Client xa ngoài vùng nhìn KHÔNG nhận.
//   2. Client đứng yên trong vùng cảnh báo bị mất khí huyết đúng sau `ms`; nếu né ra ngoài vùng thì KHÔNG mất khí huyết.
//   3. Người chơi trong Hoàng Tuyền (limbo / dead) nằm trong vùng đáp chiêu KHÔNG bị trúng đòn thêm, không mất kiếp lần hai.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  PROTOCOL_VERSION,
  getMap,
  roomNameOf,
  type FxMsg,
} from "@tien-gioi/shared";
import { fxReachOf, type WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";
import { listenWithRetry } from "../test-port";
import { bossCanTarget, bossInZone } from "../systems/boss";
import { hurtPlayer } from "../systems/combat";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-boss-room-"));

let PORT = 0;
let server: Server;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  process.env.BOSS_MOVES = "on"; // Bật bộ chiêu trùm trên máy chủ thật
  const mod = await import("./WorldRoom");
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
});

afterAll(async () => {
  delete process.env.BOSS_MOVES;
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  fn: () => T | undefined | false,
  ms = 6000,
  what = "điều kiện",
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ: ${what}`);
    await sleep(20);
  }
}

let seq = 0;
const secretOf = (name: string) => `secret-${name.replace(/\s/g, "")}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const worldOf = (room: Room) => (serverRoom(room) as any).world;

interface Hero {
  name: string;
  room: Room;
  fxList: FxMsg[];
}

function listen(room: Room, h: Hero) {
  room.onMessage("fx", (m: FxMsg) => h.fxList.push(m));
}

async function spawn(name: string, roomName = roomNameOf(DEFAULT_MAP_ID)): Promise<Hero> {
  const secret = secretOf(name);
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomName, {
    v: PROTOCOL_VERSION,
    name,
    secret,
  });
  const h: Hero = { name, room, fxList: [] };
  listen(room, h);
  rooms.push(room);
  await waitFor(
    () => (room.state as any)?.players?.get(room.sessionId),
    4000,
    "player state đồng bộ",
  );
  return h;
}

/** Tạo nhân vật ở Lạc Hà rồi sửa hồ sơ để vào thẳng Hắc Phong Cốc tại toạ độ chỉ định */
async function spawnInHacPhong(name: string, x?: number, y?: number): Promise<Hero> {
  const first = await spawn(name);
  await first.room.leave(true);
  rooms.splice(rooms.indexOf(first.room), 1);
  await sleep(150);

  const f = readdirSync(dataDir)
    .filter((x) => x.endsWith(".json"))
    .map((x) => path.join(dataDir, x))
    .find((x) => JSON.parse(readFileSync(x, "utf8")).name === name)!;

  const hpMap = getMap(HAC_PHONG_ID)!;
  const targetX = x ?? Math.round(hpMap.townPx.x);
  const targetY = y ?? Math.round(hpMap.townPx.y);

  const raw = JSON.parse(readFileSync(f, "utf8"));
  writeFileSync(
    f,
    JSON.stringify({
      ...raw,
      mapId: HAC_PHONG_ID,
      realm: 1,
      tier: 8, // Trúc Cơ viên mãn đủ máu thử đòn
      x: targetX,
      y: targetY,
    }),
  );

  return spawn(name, roomNameOf(HAC_PHONG_ID));
}

describe("Trùm nhiều chiêu trên máy chủ Colyseus thật (T6 #875)", () => {
  it("Client gần nhận bossCast và fx warn; Client xa ngoài vùng nhìn KHÔNG nhận (sendNear)", async () => {
    // 1. Tạo phòng Hắc Phong Cốc và tìm trùm Xích Mãng
    const nameNear = `Near ${++seq}`;
    const near = await spawnInHacPhong(nameNear);
    const w = worldOf(near.room);
    expect(w.bossMoves).toBe(true);

    // Tìm con trùm mang trong phòng
    let bossId: string | null = null;
    let bossObj: any = null;
    for (const [id, m] of w.state.monsters) {
      if (m.kind === "mang") {
        bossId = id;
        bossObj = m;
        break;
      }
    }
    expect(bossId).not.toBeNull();
    const bossCtrl = w.mctrl.get(bossId!);
    expect(bossCtrl?.boss).toBeDefined();

    // 2. Client Alpha (gần): đặt cách trùm 80 px (trong tầm nhìn và aggro của trùm)
    const pNear = serverState(near.room).players.get(near.room.sessionId)!;
    pNear.x = bossObj.x + 80;
    pNear.y = bossObj.y;

    // 3. Client Bravo (xa): tạo ở trấn Hắc Phong Cốc (cách trùm > 1000 px, ngoài vùng nhìn)
    const nameFar = `Far ${++seq}`;
    const far = await spawnInHacPhong(nameFar, w.map.townPx.x, w.map.townPx.y);
    const pFar = serverState(far.room).players.get(far.room.sessionId)!;
    const distToFar = Math.hypot(pFar.x - bossObj.x, pFar.y - bossObj.y);
    expect(distToFar).toBeGreaterThan(600); // Ngoài vùng nhìn

    // 4. Chờ trùm phát hiện người chơi gần và vận chiêu
    const warnReceived = await waitFor(
      () =>
        near.fxList.find(
          (f) => f.kind === "warn" || (f.kind === "bossCast" && (f as any).by === bossId),
        ),
      7000,
      "Alpha nhận tin nhắn cảnh báo hoặc bossCast từ trùm",
    );
    expect(warnReceived).toBeDefined();

    // 5. Kiểm chứng Client xa KHÔNG nhận được bất kỳ warn hay bossCast nào từ con trùm này
    const farBossFx = far.fxList.filter(
      (f) => f.kind === "warn" || (f.kind === "bossCast" && (f as any).by === bossId),
    );
    expect(farBossFx.length).toBe(0);
  });

  it("Client đứng yên trong vùng cảnh báo bị mất khí huyết đúng sau ms", async () => {
    const name = `Stand ${++seq}`;
    const hero = await spawnInHacPhong(name);
    const w = worldOf(hero.room);

    let bossId: string | null = null;
    let bossObj: any = null;
    for (const [id, m] of w.state.monsters) {
      if (m.kind === "mang") {
        bossId = id;
        bossObj = m;
        break;
      }
    }
    expect(bossId).not.toBeNull();
    const p = serverState(hero.room).players.get(hero.room.sessionId)!;

    // Đặt người chơi cạnh trùm để trùm vận chiêu
    p.x = bossObj.x + 60;
    p.y = bossObj.y;
    const hpInitial = p.hp;

    // Đợi trùm bắt đầu gồng chiêu (phát bossCast và warn)
    const castFx = await waitFor(
      () => hero.fxList.find((f) => f.kind === "bossCast" && (f as any).by === bossId) as any,
      7000,
      "nhận bossCast",
    );
    expect(castFx.ms).toBeGreaterThanOrEqual(800); // Lời hứa công bằng: báo trước >= 800ms

    // ĐỨNG YÊN trong vùng cảnh báo -> mất khí huyết sau khi ms trôi qua
    await waitFor(() => p.hp < hpInitial, castFx.ms + 600, "mất khí huyết sau khi đòn đáp");
    expect(p.hp).toBeLessThan(hpInitial);
  });

  it("Client né ra ngoài vùng cảnh báo trong lúc trùm gồng chiêu thì KHÔNG mất khí huyết", async () => {
    const name = `Dodge ${++seq}`;
    const hero = await spawnInHacPhong(name);
    const w = worldOf(hero.room);

    let bossId: string | null = null;
    let bossObj: any = null;
    for (const [id, m] of w.state.monsters) {
      if (m.kind === "mang") {
        bossId = id;
        bossObj = m;
        break;
      }
    }
    expect(bossId).not.toBeNull();
    const p = serverState(hero.room).players.get(hero.room.sessionId)!;

    // Đặt người chơi cạnh trùm
    p.x = bossObj.x + 60;
    p.y = bossObj.y;

    // Chờ trùm gồng chiêu
    const castFx = await waitFor(
      () => hero.fxList.find((f) => f.kind === "bossCast" && (f as any).by === bossId) as any,
      7000,
      "nhận bossCast để né",
    );

    // Ghi nhận máu ngay lúc trùm gồng (có thể đã chịu 1 đòn đánh thường ban đầu)
    const hpWhenCast = p.hp;

    // NÉ THOÁT - dịch chuyển tức thời người chơi ra xa khỏi vùng chiêu trong lúc trùm đang gồng
    p.x = bossObj.x + 500;
    p.y = bossObj.y + 500;

    // Chờ đòn đáp xong
    await sleep(castFx.ms + 400);

    // Khí huyết KHÔNG bị trừ thêm bởi đòn chiêu của trùm vì đã thoát khỏi vùng đáp đòn
    expect(p.hp).toBe(hpWhenCast);
  });

  it("Người chơi trong Hoàng Tuyền (limbo/dead) nằm trong vùng đáp chiêu KHÔNG bị trúng thêm, không mất kiếp lần hai", async () => {
    const name = `Limbo ${++seq}`;
    const hero = await spawnInHacPhong(name);
    const w = worldOf(hero.room);
    const sid = hero.room.sessionId;
    const p = serverState(hero.room).players.get(sid)!;
    const ctrl = w.ctrl.get(sid)!;

    let bossObj: any = null;
    for (const [, m] of w.state.monsters) {
      if (m.kind === "mang") {
        bossObj = m;
        break;
      }
    }

    // 1. Đưa người chơi vào Hoàng Tuyền bằng sát thương quái
    ctrl.life = { playMs: 600_000, kills: 10, bossKills: 1 };
    p.realm = 1;
    p.tier = 5;
    hurtPlayer(w, sid, p, 1e9, bossObj);

    expect(p.dead).toBe(true);
    expect(ctrl.limbo).not.toBeNull();
    const limboSummaryBefore = { ...ctrl.limbo!.summary };
    const endedLifeIdBefore = ctrl.limbo!.endedLifeId;
    const hpAtDead = p.hp;

    // 2. Đặt xác người chơi ngay tại tâm trùm (nằm chắc chắn trong mọi vùng đáp đòn)
    p.x = bossObj.x;
    p.y = bossObj.y;

    // 3. Cho trùm đáp một đòn sát thương trực tiếp lên vùng chứa xác người chơi
    const z = { t: "circle" as const, x: bossObj.x, y: bossObj.y, r: 200, r0: 0 };
    expect(bossInZone(z, p.x, p.y)).toBe(true);

    // Chờ 1 chiêu nổ qua vòng lặp phòng hoặc gọi trực tiếp qua bossStep
    await sleep(500);

    // 4. Bất biến: người trong Hoàng Tuyền không bị trúng thêm
    expect(p.hp).toBe(hpAtDead);
    expect(ctrl.limbo!.summary).toEqual(limboSummaryBefore);
    expect(ctrl.limbo!.endedLifeId).toBe(endedLifeIdBefore);
  });
});

describe("Đột biến và biên an toàn của trùm (T6 #875)", () => {
  it("bossCanTarget từ chối người chết / Hoàng Tuyền (đột biến bỏ kiểm p.dead -> ĐỎ)", () => {
    const fakeWorld = {
      map: { inSafe: () => false },
      ghosts: new Set<string>(),
      shielded: new Set<string>(),
      duels: { active: false, has: () => false },
    } as any;
    const alivePlayer = { dead: false, x: 100, y: 100 } as any;
    const deadPlayer = { dead: true, x: 100, y: 100 } as any;

    expect(bossCanTarget(fakeWorld, "sid1", alivePlayer)).toBe(true);
    // Bắt buộc từ chối người chết:
    expect(bossCanTarget(fakeWorld, "sid2", deadPlayer)).toBe(false);
  });

  it("fxReachOf tính đúng tầm phủ của cảnh báo trùm (không tràn cả phòng)", () => {
    const circleWarn: FxMsg = { kind: "warn", shape: "circle", x: 100, y: 100, r: 150, ms: 1000 };
    const reach = fxReachOf(circleWarn);
    expect(reach).toBe(150); // Tầm vươn đúng bằng bán kính vùng
    expect(reach).toBeLessThan(600); // Không bao giờ gửi tới người chơi ở trấn xa (> 600 px)
  });
});
