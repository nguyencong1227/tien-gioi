// Test tích hợp Trùm nhiều chiêu (T6 #875, docs/THIET_KE_TRUM.md mục 2, 4):
// Chạy trên máy chủ Colyseus THẬT với `BOSS_MOVES=on` và dữ liệu `BOSSES` thật (Xích Mãng ở Hắc Phong Cốc).
// Kiểm chứng:
//   1. Client gần trùm nhận `fx` `bossCast` và `warn` qua `sendNear`; Client xa ngoài vùng nhìn KHÔNG nhận (đối chứng cùng lượt).
//   2. Đối chứng cùng lượt: Client đứng yên trong vùng cảnh báo bị mất khí huyết; Client né ra ngoài thì KHÔNG mất khí huyết.
//   3. Người chơi trong Hoàng Tuyền (limbo / dead) nằm trong vùng đáp chiêu KHÔNG bị trúng thêm, không mất kiếp lần hai (đối chứng với người sống đứng cạnh).
//   4. Đột biến và biên an toàn: bossCanTarget từ chối người chết; fxReachOf tính đúng tầm phủ.
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
import { bossCanTarget } from "../systems/boss";
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

function getBoss(w: any, kind = "mang") {
  for (const [id, m] of w.state.monsters) {
    if (m.kind === kind) {
      return { id, m, mc: w.mctrl.get(id)! };
    }
  }
  return null;
}

/** Khóa đòn thường của mọi quái trong phòng và ép trùm vận chiêu nón quat_duoi (r: 150 px, arc: 120 độ) nhắm vào targetSid */
function forceQuatDuoi(w: any, boss: NonNullable<ReturnType<typeof getBoss>>, targetSid: string) {
  // Khử nhiễu: không quái nào trong phòng (trùm và quái thường xung quanh) được đánh thường
  for (const mc of w.mctrl.values()) {
    mc.nextAttack = Number.MAX_SAFE_INTEGER;
  }
  boss.mc.target = targetSid;
  boss.mc.boss.engaged = true;
  // Khóa mọi chiêu khác, chỉ để quat_duoi sẵn sàng
  boss.mc.boss.cds.set("phun_doc", w.now + 1_000_000);
  boss.mc.boss.cds.set("cuon_minh", w.now + 1_000_000);
  boss.mc.boss.cds.set("goi_ran_con", w.now + 1_000_000);
  boss.mc.boss.cds.delete("quat_duoi");
  boss.mc.boss.nextCastAt = w.now;
}

describe("Trùm nhiều chiêu trên máy chủ Colyseus thật (T6 #875)", () => {
  it("Client gần nhận bossCast và fx warn; Client xa ngoài vùng nhìn KHÔNG nhận (sendNear đối chứng cùng lượt)", async () => {
    // 1. Tạo phòng Hắc Phong Cốc và tìm trùm Xích Mãng
    const nameNear = `Near ${++seq}`;
    const near = await spawnInHacPhong(nameNear);
    const w = worldOf(near.room);
    expect(w.bossMoves).toBe(true);

    const boss = getBoss(w, "mang");
    expect(boss).not.toBeNull();
    expect(boss!.mc?.boss).toBeDefined();

    // 2. Client Near (gần): đặt cách trùm 80 px (trong tầm nhìn và aggro của trùm)
    const pNear = serverState(near.room).players.get(near.room.sessionId)!;
    pNear.x = boss!.m.x + 80;
    pNear.y = boss!.m.y;

    // 3. Client Far (xa): tạo ở trấn Hắc Phong Cốc (cách trùm > 1000 px, ngoài vùng nhìn)
    const nameFar = `Far ${++seq}`;
    const far = await spawnInHacPhong(nameFar, w.map.townPx.x, w.map.townPx.y);
    const pFar = serverState(far.room).players.get(far.room.sessionId)!;
    const distToFar = Math.hypot(pFar.x - boss!.m.x, pFar.y - boss!.m.y);
    expect(distToFar).toBeGreaterThan(600); // Ngoài vùng nhìn

    // Xóa mọi fx nhận được trong quá trình kết nối ban đầu để đo chính xác đòn ép
    near.fxList.length = 0;
    far.fxList.length = 0;

    // 4. Khử nhiễu đòn thường và ép trùm vận chiêu quat_duoi ngay vào Near
    forceQuatDuoi(w, boss!, near.room.sessionId);

    // 5. Đối chứng dương: Near nhận đủ cả warn và bossCast
    const warnReceived = await waitFor(
      () => near.fxList.find((f) => f.kind === "warn"),
      4000,
      "Near nhận fx warn từ trùm",
    );
    const castReceived = await waitFor(
      () => near.fxList.find((f) => f.kind === "bossCast" && (f as any).by === boss!.id),
      4000,
      "Near nhận bossCast từ trùm",
    );
    expect(warnReceived).toBeDefined();
    expect(castReceived).toBeDefined();
    expect(near.fxList.filter((f) => f.kind === "warn").length).toBeGreaterThan(0);
    expect(
      near.fxList.filter((f) => f.kind === "bossCast" && (f as any).by === boss!.id).length,
    ).toBeGreaterThan(0);

    // 6. Chờ theo điều kiện: trùm bắt đầu gồng và hoàn tất đòn chiêu
    await waitFor(() => boss!.mc.boss.cast != null, 2000, "trùm bắt đầu gồng");
    await waitFor(() => boss!.mc.boss.cast == null, 5000, "trùm hoàn tất đòn chiêu");

    // 7. Đối chứng âm cùng lượt: Client xa KHÔNG nhận được bất kỳ warn hay bossCast nào
    const farBossFx = far.fxList.filter(
      (f) => f.kind === "warn" || (f.kind === "bossCast" && (f as any).by === boss!.id),
    );
    expect(farBossFx.length).toBe(0);
  });

  it("Đối chứng cùng lượt: Client đứng yên mất khí huyết vs Client né ra ngoài KHÔNG mất khí huyết (cùng một đòn chiêu)", async () => {
    // 1. Tạo 2 hero: Stand (đứng yên) và Dodge (né thoát) cùng trong Hắc Phong Cốc
    const nameStand = `Stand ${++seq}`;
    const stand = await spawnInHacPhong(nameStand);
    const w = worldOf(stand.room);

    const boss = getBoss(w, "mang");
    expect(boss).not.toBeNull();
    const pStand = serverState(stand.room).players.get(stand.room.sessionId)!;

    const nameDodge = `Dodge ${++seq}`;
    const dodge = await spawnInHacPhong(nameDodge);
    const pDodge = serverState(dodge.room).players.get(dodge.room.sessionId)!;

    // Đặt máu đủ lớn để không bị hạ gục ngay
    pStand.hp = pStand.maxHp = 1000;
    pDodge.hp = pDodge.maxHp = 1000;

    // 2. Đặt cả 2 ban đầu cùng trong vùng quất đuôi (nón 150 px phía trước trùm)
    pStand.x = boss!.m.x + 80;
    pStand.y = boss!.m.y;
    pDodge.x = boss!.m.x + 80;
    pDodge.y = boss!.m.y + 20;

    stand.fxList.length = 0;
    dodge.fxList.length = 0;

    // 3. Khử hoàn toàn đòn thường và ép trùm gồng chiêu quat_duoi vào Stand
    forceQuatDuoi(w, boss!, stand.room.sessionId);

    // 4. Chờ nhận bossCast gồng chiêu và xác nhận trùm đang trong trạng thái gồng
    const castFx = await waitFor(
      () => stand.fxList.find((f) => f.kind === "bossCast" && (f as any).by === boss!.id) as any,
      4000,
      "nhận bossCast",
    );
    expect(castFx.ms).toBeGreaterThanOrEqual(800); // Báo trước >= 800 ms
    await waitFor(() => boss!.mc.boss.cast != null, 2000, "trùm đang cast");

    // Ghi nhận khí huyết trước khi đòn nổ
    const hpStandBefore = pStand.hp;
    const hpDodgeBefore = pDodge.hp;

    // 5. Trong thời gian gồng: Stand đứng nguyên, Dodge né luồn ra sau lưng trùm (cách trùm 80 px phía sau, hoàn toàn ngoài nón)
    pDodge.x = boss!.m.x - 80;
    pDodge.y = boss!.m.y;

    // 6. Chờ theo điều kiện đòn chiêu hoàn tất (cast null)
    await waitFor(() => boss!.mc.boss.cast == null, 5000, "trùm hoàn tất đòn chiêu");

    // 7. Khẳng định đối chứng song song:
    // Stand đứng yên -> chắc chắn mất khí huyết
    expect(pStand.hp).toBeLessThan(hpStandBefore);
    // Dodge đã né ra sau lưng ngoài vùng nón -> chắc chắn KHÔNG mất khí huyết
    expect(pDodge.hp).toBe(hpDodgeBefore);
  });

  it("Người chơi trong Hoàng Tuyền (limbo/dead) nằm trong vùng đáp chiêu KHÔNG bị trúng thêm, không mất kiếp lần hai (đối chứng với người sống)", async () => {
    // 1. Tạo 2 hero: một người sống (Alive) và một người đưa vào Hoàng Tuyền (Dead)
    const nameDead = `Limbo ${++seq}`;
    const deadHero = await spawnInHacPhong(nameDead);
    const w = worldOf(deadHero.room);
    const sidDead = deadHero.room.sessionId;
    const pDead = serverState(deadHero.room).players.get(sidDead)!;
    const ctrlDead = w.ctrl.get(sidDead)!;

    const boss = getBoss(w, "mang");
    expect(boss).not.toBeNull();

    const nameAlive = `Alive ${++seq}`;
    const aliveHero = await spawnInHacPhong(nameAlive);
    const sidAlive = aliveHero.room.sessionId;
    const pAlive = serverState(aliveHero.room).players.get(sidAlive)!;

    // 2. Đưa deadHero vào Hoàng Tuyền bằng sát thương quái
    ctrlDead.life = { playMs: 600_000, kills: 10, bossKills: 1 };
    pDead.realm = 1;
    pDead.tier = 5;
    hurtPlayer(w, sidDead, pDead, 1e9, boss!.m);

    expect(pDead.dead).toBe(true);
    expect(ctrlDead.limbo).not.toBeNull();
    const limboSummaryBefore = { ...ctrlDead.limbo!.summary };
    const endedLifeIdBefore = ctrlDead.limbo!.endedLifeId;
    const hpAtDead = pDead.hp;

    // 3. Đặt cả xác Dead lẫn Alive tại cùng toạ độ trong vùng đáp đòn của trùm
    pDead.x = boss!.m.x + 80;
    pDead.y = boss!.m.y;
    pAlive.x = boss!.m.x + 80;
    pAlive.y = boss!.m.y;
    pAlive.hp = pAlive.maxHp = 1000;

    aliveHero.fxList.length = 0;
    deadHero.fxList.length = 0;

    const hpAliveBefore = pAlive.hp;

    // 4. Khử đòn thường, ép trùm tung chiêu quat_duoi nhắm vào Alive
    forceQuatDuoi(w, boss!, sidAlive);

    // 5. Chờ trùm bắt đầu gồng và hoàn tất đòn chiêu
    await waitFor(() => boss!.mc.boss.cast != null, 4000, "trùm bắt đầu gồng chiêu lên Alive");
    await waitFor(() => boss!.mc.boss.cast == null, 5000, "trùm hoàn tất đòn chiêu");

    // 6. Khẳng định đối chứng:
    // Người sống Alive đứng tại toạ độ đó chắc chắn bị trúng đòn và mất máu (chứng minh đòn trùm thực sự đã nổ trúng toạ độ này)
    expect(pAlive.hp).toBeLessThan(hpAliveBefore);
    // Người chết trong Hoàng Tuyền nằm cùng toạ độ TUYỆT ĐỐI KHÔNG bị trúng thêm, không mất kiếp lần 2
    expect(pDead.hp).toBe(hpAtDead);
    expect(ctrlDead.limbo!.summary).toEqual(limboSummaryBefore);
    expect(ctrlDead.limbo!.endedLifeId).toBe(endedLifeIdBefore);
  });
});

describe("Đột biến và biên an toàn của trùm (T6 #875)", () => {
  it("bossCanTarget từ chối người chết / Hoàng Tuyền (đơn vị: đột biến bỏ kiểm p.dead -> ĐỎ)", () => {
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

  it("fxReachOf tính đúng tầm phủ của cảnh báo trùm (đơn vị: warn trả đúng r, không tràn cả phòng)", () => {
    const circleWarn: FxMsg = { kind: "warn", shape: "circle", x: 100, y: 100, r: 150, ms: 1000 };
    const reach = fxReachOf(circleWarn);
    expect(reach).toBe(150); // Tầm vươn đúng bằng bán kính vùng
    expect(reach).toBeLessThan(600); // Không bao giờ gửi tới người chơi ở trấn xa (> 600 px)
  });
});
