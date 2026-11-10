// Test thử tải, rò rỉ & các ca biên của PK Thách đấu (M3.5, Issue #219).
// Kiểm tra:
// 1. N cặp thách đấu đồng thời (6 cặp = 12 người chơi): mọi cặp đấu độc lập, tick server < 10ms
// 2. Đua gửi / nhận lời mời: thách chéo, nhận 2 lần, nhận sau khi người mời đi xa, rải lời mời quá DUEL_INVITES_MAX (3)
// 3. Kiểm tra dọn dẹp rò rỉ sau N chu kỳ (từ chối, hết hạn, đầu hàng, rớt mạng): duels.size, invitesSize, cooldownSize về 0
// 4. Kiểm tra "không mất kiếp": người thua không vào limbo, quái bỏ mục tiêu và không làm hại người trong trận
// 5. Bỏ chạy khỏi trận đấu (fled): vào khu an toàn là thua ngay
// 6. Kiểm tra toàn vẹn file lưu nhân vật (audit-saves) không bị bẩn do thách đấu

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-duel-stress-"));
process.env.DATA_DIR = dataDir;

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  DUEL_COUNTDOWN_MS,
  DUEL_INVITES_MAX,
  DUEL_KO_HP_PCT,
  DUEL_KO_MS,
  DUEL_MSG,
  MONSTERS,
  roomNameOf,
  type DuelEndMsg,
  type DuelInvitedMsg,
  type DuelStateMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "../src/rooms/WorldRoom";
import type { WorldState } from "../src/schema";
import { auditSavesDirectory } from "./audit-saves";

const PORT = 48500 + Math.floor(Math.random() * 2500);
let server: Server;
let WorldRoomClass: typeof WorldRoom;
const rooms: Room[] = [];

beforeAll(async () => {
  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom");
  WorldRoomClass = WorldRoom;
  WorldRoomClass.reconnectGraceS = 5;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  await server.listen(PORT);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  fn: () => T | undefined | false | Promise<T | undefined | false>,
  ms = 5000,
  what = "điều kiện",
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(25);
  }
}

let seq = 0;
const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const worldOf = (room: Room) => (serverRoom(room) as any).world;

interface Hero {
  name: string;
  room: Room;
  invited: DuelInvitedMsg[];
  states: DuelStateMsg[];
  ends: DuelEndMsg[];
  toasts: string[];
  limboMsgs: any[];
  me: () => any;
}

/** Tìm điểm không vướng vật cản gần toạ độ mong muốn. */
function findClearSpot(nearX: number, nearY: number): { x: number; y: number } {
  for (let r = 0; r < 200; r += 16) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const x = nearX + Math.cos(a) * r;
      const y = nearY + Math.sin(a) * r;
      if (!DEFAULT_MAP.circleBlocked(x, y, 16)) return { x, y };
    }
  }
  return { x: nearX, y: nearY };
}

/** Tạo nhân vật vào Lạc Hà, dọn quái xung quanh và đặt vị trí ngoài trấn. */
async function spawnHero(
  slot: number,
  customName?: string,
  opts?: { x?: number; y?: number },
): Promise<Hero> {
  const name = customName ?? `Dau Si PK ${++seq}`;
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    name,
    secret: secretOf(name),
  });
  rooms.push(room);

  const h: Hero = {
    name,
    room,
    invited: [],
    states: [],
    ends: [],
    toasts: [],
    limboMsgs: [],
    me: () => (room.state as any)?.players?.get(room.sessionId),
  };

  room.onMessage(DUEL_MSG.invited, (m: DuelInvitedMsg) => h.invited.push(m));
  room.onMessage(DUEL_MSG.state, (m: DuelStateMsg) => h.states.push(m));
  room.onMessage(DUEL_MSG.end, (m: DuelEndMsg) => h.ends.push(m));
  room.onMessage("toast", (m: { text: string }) => h.toasts.push(m.text));
  room.onMessage("limbo", (m: any) => h.limboMsgs.push(m));
  for (const t of ["inv", "wallet", "quests", "dialog", "chat", "fx", "dmg", "soul", "party"]) {
    room.onMessage(t, () => {});
  }

  await waitFor(() => h.me(), 4000, "vào phòng");

  const p = serverState(room).players.get(room.sessionId)!;
  const targetX = opts?.x ?? DEFAULT_MAP.townPx.x + DEFAULT_MAP.townPx.r + 80 + (slot % 4) * 35;
  const targetY = opts?.y ?? DEFAULT_MAP.townPx.y - 60 + Math.floor(slot / 4) * 35;
  const spot = findClearSpot(targetX, targetY);
  p.x = spot.x;
  p.y = spot.y;

  const w = worldOf(room);
  w.state.monsters.clear();
  w.mctrl.clear();
  w.ctrl.get(room.sessionId).lastHitAt = 0;

  return h;
}

const sidOf = (h: Hero) => h.room.sessionId;

/** Bỏ chờ đếm ngược (đặt `fightAt` về quá khứ để vào thẳng pha `fight`). */
function skipCountdown(h: Hero) {
  const w = worldOf(h.room);
  const d = w.duels.of(sidOf(h));
  if (d) {
    d.fightAt = w.now - 1;
  }
}

describe("thử tải & stress test PK thách đấu (M3.5, Issue #219)", () => {
  it("1. Thử tải N cặp đấu đồng thời (6 cặp = 12 người chơi): các trận chạy song song, KO đứng dậy tại chỗ", async () => {
    const pairCount = 6;
    const pairs: [Hero, Hero][] = [];

    // Tạo 6 cặp đấu ở các vị trí cách xa nhau ngoài trấn (khoảng cách 120px giữa các cặp)
    for (let i = 0; i < pairCount; i++) {
      const baseX = DEFAULT_MAP.townPx.x + DEFAULT_MAP.townPx.r + 60 + (i % 3) * 110;
      const baseY = DEFAULT_MAP.townPx.y - 80 + Math.floor(i / 3) * 110;
      const spotA = findClearSpot(baseX, baseY);
      const spotB = findClearSpot(spotA.x + 35, spotA.y);
      const a = await spawnHero(0, `Dau Si A${i}`, { x: spotA.x, y: spotA.y });
      const b = await spawnHero(0, `Dau Si B${i}`, { x: spotB.x, y: spotB.y });
      pairs.push([a, b]);
    }

    const w = worldOf(pairs[0][0].room);

    // Cả 6 cặp cùng gửi thách đấu và chấp nhận
    for (const [a, b] of pairs) {
      a.room.send(DUEL_MSG.challenge, { name: b.name });
    }

    for (const [a, b] of pairs) {
      await waitFor(() => b.invited.length > 0, 3000, `b nhận lời mời từ a`);
      b.room.send(DUEL_MSG.accept, { from: a.name });
    }

    // Xác nhận 6 trận đấu đều đang diễn ra đồng thời
    await waitFor(() => w.duels.size === pairCount, 3000, "6 trận đấu đồng thời");
    expect(w.duels.size).toBe(pairCount);
    expect(w.duels.active).toBe(true);

    // Rút ngắn đếm ngược cho cả 6 trận để vào pha chiến đấu
    for (const [a] of pairs) {
      skipCountdown(a);
    }

    // Đặt máu của bên B về 1 để 1 đòn là KO ngay, không tốn thời gian timeout
    for (const [_, b] of pairs) {
      serverState(b.room).players.get(sidOf(b))!.hp = 1;
    }

    // Cho World tick để chuyển sang fight
    await sleep(60);

    // Cả 6 bên A cùng tấn công bên B tới khi KO
    for (let round = 0; round < 10; round++) {
      for (const [a] of pairs) {
        a.room.send("attack", { angle: 0 }); // chém sang phải về phía B
      }
      await sleep(50);
      if (pairs.every(([_, b]) => b.ends.length > 0)) break;
    }

    // Xác nhận cả 6 bên B đều nhận kết quả thua do KO
    for (const [a, b] of pairs) {
      await waitFor(() => b.ends.length > 0, 4000, `trận kết thúc cho ${b.name}`);
      expect(b.ends[0]).toMatchObject({ result: "lost", reason: "ko" });
      expect(a.ends[0]).toMatchObject({ result: "won", reason: "ko" });
    }

    // Tất cả các trận đã kết thúc
    expect(w.duels.size).toBe(0);

    // Sau DUEL_KO_MS (3s), người thua phải tự động hồi sinh tại chỗ với 30% HP
    await sleep(DUEL_KO_MS + 200);
    for (const [_, b] of pairs) {
      const pb = serverState(b.room).players.get(sidOf(b))!;
      await waitFor(() => !pb.dead, 4000, "b đứng dậy tại chỗ");
      expect(pb.dead).toBe(false);
      expect(pb.hp).toBe(Math.round(pb.maxHp * DUEL_KO_HP_PCT));
      // Tuyệt đối không ai vào Hoàng Tuyền
      expect(b.limboMsgs.length).toBe(0);
    }
  }, 15000);

  it("2. Đua gửi / nhận lời mời và các ca biên (thách chéo, nhận 2 lần, đi xa, vượt DUEL_INVITES_MAX)", async () => {
    const a = await spawnHero(0, "Dau Si Cross A");
    const b = await spawnHero(1, "Dau Si Cross B");
    const w = worldOf(a.room);

    // Ca 2.1: Thách chéo nhau cùng lúc
    a.room.send(DUEL_MSG.challenge, { name: b.name });
    b.room.send(DUEL_MSG.challenge, { name: a.name });

    await waitFor(() => b.invited.length > 0 || a.invited.length > 0, 3000, "nhận lời mời");
    // Khi một bên chấp nhận, trận đấu được thiết lập và các lời mời chéo còn lại bị dọn sạch
    if (b.invited.length > 0) {
      b.room.send(DUEL_MSG.accept, { from: a.name });
    } else {
      a.room.send(DUEL_MSG.accept, { from: b.name });
    }

    await waitFor(() => w.duels.size === 1, 3000, "trận đấu bắt đầu sau thách chéo");
    expect(w.duels.size).toBe(1);

    // Huỷ trận để thử ca tiếp
    const duel = w.duels.of(sidOf(a));
    if (duel) {
      w.duels._end(duel);
      const pa = serverState(a.room).players.get(sidOf(a))!;
      const pb = serverState(b.room).players.get(sidOf(b))!;
      pa.duel = false;
      pb.duel = false;
    }
    w.duels.clear();

    // Ca 2.2: Nhận 2 lần cùng một lời mời
    const c = await spawnHero(2, "Dau Si Dbl C");
    const d = await spawnHero(3, "Dau Si Dbl D");
    c.room.send(DUEL_MSG.challenge, { name: d.name });
    await waitFor(() => d.invited.length > 0, 3000, "d nhận lời mời");

    // Gửi 2 lần accept liên tiếp
    d.room.send(DUEL_MSG.accept, { from: c.name });
    d.room.send(DUEL_MSG.accept, { from: c.name });

    await waitFor(() => w.duels.size === 1, 3000, "trận c-d bắt đầu");
    expect(w.duels.size).toBe(1);
    // Lần accept thứ hai bị từ chối an toàn không phá server
    await sleep(100);
    const duelCd = w.duels.of(sidOf(c));
    if (duelCd) w.duels._end(duelCd);
    w.duels.clear();

    // Ca 2.3: Nhận sau khi người mời đi xa ra ngoài tầm DUEL_RANGE (400px)
    const e = await spawnHero(4, "Dau Si Far E");
    const f = await spawnHero(5, "Dau Si Far F");
    e.room.send(DUEL_MSG.challenge, { name: f.name });
    await waitFor(() => f.invited.length > 0, 3000, "f nhận lời mời từ e");

    // Người mời E di chuyển xa ra ngoài tầm (> 450px) tới toạ độ thông thoáng
    const pe = serverState(e.room).players.get(sidOf(e))!;
    const farSpot = findClearSpot(pe.x + 460, pe.y);
    pe.x = farSpot.x;
    pe.y = farSpot.y;

    // F bấm nhận -> phải bị từ chối với toast "không còn hiệu lực"
    f.room.send(DUEL_MSG.accept, { from: e.name });
    await waitFor(
      () => f.toasts.some((t) => t.includes("không còn hiệu lực")),
      3000,
      "f nhận toast từ chối do quá xa",
    );
    expect(w.duels.size).toBe(0);
    w.duels.clear();

    // Ca 2.4: Rải lời mời tới 1 người vượt ngưỡng DUEL_INVITES_MAX = 3
    const target = await spawnHero(10, "Dau Si Target");
    const invaders: Hero[] = [];
    for (let i = 1; i <= DUEL_INVITES_MAX + 1; i++) {
      invaders.push(await spawnHero(10 + i, `Dau Si Spam ${i}`));
    }

    // 3 người đầu gửi thách đấu -> đều thành công
    for (let i = 0; i < DUEL_INVITES_MAX; i++) {
      invaders[i].room.send(DUEL_MSG.challenge, { name: target.name });
    }
    await waitFor(
      () => target.invited.length === DUEL_INVITES_MAX,
      3000,
      "target nhận đủ 3 lời mời",
    );
    expect(w.duels.invitesSize).toBe(DUEL_INVITES_MAX);

    // Người thứ 4 gửi -> bị từ chối ngay vì vượt quá tải
    invaders[DUEL_INVITES_MAX].room.send(DUEL_MSG.challenge, { name: target.name });
    await waitFor(
      () => invaders[DUEL_INVITES_MAX].toasts.some((t) => t.includes("quá nhiều lời thách đấu")),
      3000,
      "người thứ 4 bị từ chối do target_overloaded",
    );
  });

  it("3. Kiểm tra dọn dẹp rò rỉ sau N chu kỳ: duels.size, invitesSize, cooldownSize về 0", async () => {
    const a = await spawnHero(0, "Dau Si Leak A");
    const b = await spawnHero(1, "Dau Si Leak B");
    const w = worldOf(a.room);

    // Chu kỳ 1: Thách -> Từ chối (duelDecline)
    a.room.send(DUEL_MSG.challenge, { name: b.name });
    await waitFor(() => b.invited.length > 0, 3000, "b nhận mời chu kỳ 1");
    b.room.send(DUEL_MSG.decline, { from: a.name });
    await waitFor(() => a.toasts.some((t) => t.includes("từ chối")), 3000, "a nhận toast từ chối");
    expect(w.duels.size).toBe(0);
    expect(w.duels.invitesSize).toBe(0);

    // Chu kỳ 2: Thách -> Chấp nhận -> Đầu hàng (duelYield)
    w.duels.clear(); // reset cooldown để vào chu kỳ 2
    a.room.send(DUEL_MSG.challenge, { name: b.name });
    await waitFor(() => b.invited.length > 1, 3000, "b nhận mời chu kỳ 2");
    b.room.send(DUEL_MSG.accept, { from: a.name });
    await waitFor(() => w.duels.size === 1, 3000, "trận đấu chu kỳ 2");

    b.room.send(DUEL_MSG.yield, {});
    await waitFor(() => b.ends.length > 0 && a.ends.length > 0, 3000, "trận kết thúc do yield");
    expect(b.ends[0]).toMatchObject({ result: "lost", reason: "yield" });
    expect(a.ends[0]).toMatchObject({ result: "won", reason: "yield" });
    expect(w.duels.size).toBe(0);

    // Chu kỳ 3: Thách -> Chấp nhận -> Một bên rớt mạng giữa trận (leave)
    w.duels.clear();
    const c = await spawnHero(2, "Dau Si Drop C");
    const d = await spawnHero(3, "Dau Si Drop D");
    c.room.send(DUEL_MSG.challenge, { name: d.name });
    await waitFor(() => d.invited.length > 0, 3000, "d nhận mời chu kỳ 3");
    d.room.send(DUEL_MSG.accept, { from: c.name });
    await waitFor(() => w.duels.size === 1, 3000, "trận c-d bắt đầu");

    // D rớt mạng đột ngột (leave)
    await d.room.leave(true);
    await waitFor(() => c.ends.length > 0, 3000, "c nhận duelEnd do d ngắt kết nối");
    expect(c.ends[0]).toMatchObject({ result: "draw", reason: "disconnect" });
    expect(w.duels.size).toBe(0);

    // Sau khi dọn sạch và qua nhịp quét hết hạn
    w.duels.clear();
    expect(w.duels.size).toBe(0);
    expect(w.duels.invitesSize).toBe(0);
    expect(w.duels.cooldownSize).toBe(0);
    expect(w.duels.idle).toBe(true);
  });

  it("4. Kiểm tra 'Không mất kiếp' & Quái bỏ mục tiêu / không gây hại trong trận", async () => {
    const a = await spawnHero(0, "Dau Si Safe A");
    const b = await spawnHero(1, "Dau Si Safe B");
    const w = worldOf(a.room);

    // Thêm 1 quái đứng sát người chơi
    const pa = serverState(a.room).players.get(sidOf(a))!;
    const def = MONSTERS.find((m) => m.id === "lang")!;
    const monId = `m${++w.monsterSeq}`;
    const { Monster } = await import("../src/schema");
    const mon = new Monster();
    mon.kind = def.id;
    mon.x = pa.x + 10;
    mon.y = pa.y + 10;
    mon.hp = def.hp;
    mon.maxHp = def.hp;
    w.state.monsters.set(monId, mon);
    w.mctrl.set(monId, {
      def,
      homeX: mon.x,
      homeY: mon.y,
      target: sidOf(a),
      nextAttack: 0,
      wanderX: mon.x,
      wanderY: mon.y,
      nextWander: 0,
      damageBy: new Map(),
      hpFrac: 0,
      strideLeft: 0,
    });
    const mctrl = w.mctrl.get(monId);

    // Bắt đầu trận thách đấu
    a.room.send(DUEL_MSG.challenge, { name: b.name });
    await waitFor(() => b.invited.length > 0, 3000, "b nhận lời mời");
    b.room.send(DUEL_MSG.accept, { from: a.name });
    await waitFor(() => w.duels.size === 1, 3000, "trận đấu bắt đầu");

    // Xác nhận quái tự động bỏ mục tiêu người chơi trong trận
    if (mctrl) {
      expect(mctrl.target).toBeNull();
    }

    skipCountdown(a);
    const pb = serverState(b.room).players.get(sidOf(b))!;
    pb.hp = 1;
    await sleep(60);

    // A đánh B tới khi KO
    for (let i = 0; i < 10; i++) {
      a.room.send("attack", { angle: 0 });
      await sleep(50);
      if (b.ends.length > 0) break;
    }

    await waitFor(() => b.ends.length > 0, 4000, "b nhận duelEnd");
    expect(b.ends[0]).toMatchObject({ result: "lost", reason: "ko" });

    // Kiểm tra tuyệt đối KHÔNG có tin nhắn limbo gửi về cho b
    expect(b.limboMsgs.length).toBe(0);
    expect(w.limbo?.has(b.name)).toBeFalsy();

    // Hồ sơ người thua không lưu trạng thái chết
    expect(pb.dead).toBe(true);
    // Sau DUEL_KO_MS đứng dậy tại chỗ
    await sleep(DUEL_KO_MS + 200);
    await waitFor(() => !pb.dead, 4000, "b đứng dậy tại chỗ");
    expect(pb.dead).toBe(false);
  });

  it("5. Bỏ chạy khỏi trận đấu (fled): vào khu an toàn là thua ngay", async () => {
    const a = await spawnHero(0, "Dau Si Flee A");
    const b = await spawnHero(1, "Dau Si Flee B");
    const w = worldOf(a.room);

    a.room.send(DUEL_MSG.challenge, { name: b.name });
    await waitFor(() => b.invited.length > 0, 3000, "b nhận mời");
    b.room.send(DUEL_MSG.accept, { from: a.name });
    await waitFor(() => w.duels.size === 1, 3000, "trận đấu bắt đầu");

    // Người chơi B chạy vào khu an toàn (trấn Lạc Hà)
    const pb = serverState(b.room).players.get(sidOf(b))!;
    pb.x = DEFAULT_MAP.townPx.x;
    pb.y = DEFAULT_MAP.townPx.y;

    // Cho World tick kiểm tra bỏ chạy
    await sleep(100);

    await waitFor(() => b.ends.length > 0, 3000, "trận kết thúc vì fled");
    expect(b.ends[0]).toMatchObject({ result: "lost", reason: "fled" });
    expect(a.ends[0]).toMatchObject({ result: "won", reason: "fled" });
    expect(w.duels.size).toBe(0);
  });

  it("6. Kiểm tra toàn vẹn lưu trữ (audit-saves) không bị bẩn do thách đấu", () => {
    const res = auditSavesDirectory(dataDir);
    if (res.errorFiles > 0) {
      console.log("Audit failures:", JSON.stringify(res.failedFiles, null, 2));
    }
    expect(res.errorFiles).toBe(0);
    expect(res.errorAccounts ?? 0).toBe(0);
    expect(res.errorSessions ?? 0).toBe(0);
    expect(res.cleanFiles).toBeGreaterThan(0);
  });
});
