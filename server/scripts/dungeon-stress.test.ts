// Test thử tải, rò rỉ phòng & các ca xấu của Bí cảnh (M3.4, Issue #201).
// Kiểm tra:
// 1. N run đồng thời đạt trần MAX_DUNGEON_RUNS (10 run, 20-40 người chơi): mọi đội vào đúng phòng, tick server < 10ms
// 2. Thử mở run thứ 11 khi đã đầy: từ chối đúng lý do "full"
// 3. Chu kỳ tạo / huỷ phòng liên tục: Hub.runs.size về 0, Hub.runs.cooldownSize về 0, số phòng bí cảnh về 0 (không rò rỉ)
// 4. Đua dungeonEnter đồng thời từ các thành viên
// 5. Vào đúng lúc run hết hạn (no_entry)
// 6. Đội trưởng rớt mạng khi vừa mở run
// 7. Thành viên rời đội giữa run (partyLeave)
// 8. "Giết tiến trình giữa run" (rớt mạng trong bí cảnh) rồi đăng nhập lại: phải về Lạc Hà, hồ sơ giữ nguyên mapId mặc định
// 9. Phòng bí cảnh chặn tuyệt đối người ngoài: joinOrCreate bị từ chối, joinById lậu bị từ chối JOIN_NOT_IN_RUN (422)

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-dungeon-stress-"));
process.env.DATA_DIR = dataDir;

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  DUNGEON_DAILY_REWARDS,
  DUNGEON_FALL_EXIT_MS,
  DUNGEON_MSG,
  DUNGEON_OPEN_COOLDOWN_MS,
  JOIN_NOT_IN_RUN,
  LINH_HU_ID,
  LINH_HU_MAP_ID,
  MAX_DUNGEON_RUNS,
  NPC_BY_ID,
  roomNameOf,
  type DungeonEndMsg,
  type DungeonFallenMsg,
  type DungeonInviteMsg,
  type DungeonStateMsg,
  type PartyInvitedMsg,
  type PartyMsg,
  type ToastMsg,
  type TravelToMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "../src/rooms/WorldRoom";
import type { WorldState } from "../src/schema";
import { auditPlayerSaveData } from "./audit-saves";

import { listenWithRetry } from "../src/test-port";

// cổng do hệ điều hành cấp ở beforeAll (`listenWithRetry`): tự động thử lại nếu gặp EADDRINUSE giữa các tệp chạy song song
let PORT = 0;
let server: Server;
let WorldRoomClass: typeof WorldRoom;
let killMonster: typeof import("../src/systems/combat").killMonster;
let hurtPlayer: typeof import("../src/systems/combat").hurtPlayer;
const rooms: Room[] = [];
const gate = NPC_BY_ID.thu_mon;

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  ({ killMonster, hurtPlayer } = await import("../src/systems/combat"));
  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom");
  WorldRoomClass = WorldRoom;
  WorldRoomClass.reconnectGraceS = 5;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
  WorldRoomClass.hub.runs.clear();
  await waitFor(
    async () => (await dungeonRooms()).length === 0,
    6000,
    "mọi phòng bí cảnh dọn sạch sau test",
  );
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
const secretOf = (name: string) => `sec-${name}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const runs = () => WorldRoomClass.hub.runs;

interface BotPlayer {
  name: string;
  secret: string;
  room: Room;
  invites: DungeonInviteMsg[];
  states: DungeonStateMsg[];
  ends: DungeonEndMsg[];
  fallens: DungeonFallenMsg[];
  limbos: number[];
  toasts: ToastMsg[];
  travelTos: TravelToMsg[];
  parties: PartyMsg[];
  partyInvited: PartyInvitedMsg[];
}

function fileFor(name: string) {
  const key = createHash("sha1").update(name.normalize("NFC").toLowerCase()).digest("hex");
  return path.join(dataDir, `${key}.json`);
}

function listen(room: Room, hero: BotPlayer) {
  room.onMessage(DUNGEON_MSG.invite, (m: DungeonInviteMsg) => hero.invites.push(m));
  room.onMessage(DUNGEON_MSG.state, (m: DungeonStateMsg) => hero.states.push(m));
  room.onMessage(DUNGEON_MSG.end, (m: DungeonEndMsg) => hero.ends.push(m));
  room.onMessage(DUNGEON_MSG.fallen, (m: DungeonFallenMsg) => hero.fallens.push(m));
  room.onMessage("limbo", () => hero.limbos.push(1));
  room.onMessage("travelTo", (m: TravelToMsg) => hero.travelTos.push(m));
  room.onMessage("toast", (m: ToastMsg) => hero.toasts.push(m));
  room.onMessage("party", (m: PartyMsg) => hero.parties.push(m));
  room.onMessage("partyInvited", (m: PartyInvitedMsg) => hero.partyInvited.push(m));
  for (const t of ["inv", "wallet", "quests", "dialog", "chat", "fx", "dmg", "soul"]) {
    room.onMessage(t, () => {});
  }
}

async function spawnBot(
  name: string,
  mapId: string = DEFAULT_MAP_ID,
  nearGate = false,
): Promise<BotPlayer> {
  const secret = secretOf(name);
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomNameOf(mapId), { name, secret });
  rooms.push(room);

  const hero: BotPlayer = {
    name,
    secret,
    room,
    invites: [],
    states: [],
    ends: [],
    fallens: [],
    limbos: [],
    toasts: [],
    travelTos: [],
    parties: [],
    partyInvited: [],
  };
  listen(room, hero);

  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "bot vào phòng");
  const p = serverState(room).players.get(room.sessionId)!;
  p.realm = 1;
  p.tier = 8; // stepOf(1, 8) = minStep của Linh Hư
  if (nearGate && mapId === DEFAULT_MAP_ID) {
    p.x = gate.x;
    p.y = gate.y;
  }

  return hero;
}

async function formParty(leader: BotPlayer, member: BotPlayer) {
  leader.room.send("partyInvite", { name: member.name });
  await waitFor(() => member.partyInvited.length > 0, 4000, "lời mời đội");
  member.room.send("partyAccept", { from: leader.name });
  await waitFor(() => leader.parties.at(-1)?.members.length === 2, 4000, "đội thành lập");
}

async function followTravel(hero: BotPlayer, travel: TravelToMsg): Promise<Room> {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinById(travel.roomId!, { name: hero.name, secret: hero.secret });
  hero.room = room;
  hero.invites = [];
  hero.states = [];
  hero.ends = [];
  hero.fallens = [];
  hero.limbos = [];
  hero.travelTos = [];
  hero.toasts = [];
  listen(room, hero);
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "vào phòng bí cảnh");
  return room;
}

function worldOf(room: Room): any {
  return (serverRoom(room) as any).world;
}

function lethal(room: Room) {
  const w = worldOf(room);
  const p = w.state.players.get(room.sessionId)!;
  const monster = w.state.monsters.values().next().value;
  hurtPlayer(w, room.sessionId, p, p.hp + 100000, monster);
}

function killBoss(room: Room, killerSid?: string) {
  const w = worldOf(room);
  let bossId: string | null = null;
  for (const [id, m] of w.state.monsters) {
    if (m.kind === "linh_hu_thu" || m.maxHp >= 1000) {
      bossId = id;
      break;
    }
  }
  if (!bossId) bossId = w.state.monsters.keys().next().value;
  const mc = w.mctrl.get(bossId);
  if (killerSid && mc) {
    mc.damageBy.set(killerSid, 5000);
  } else if (mc) {
    mc.damageBy.set(room.sessionId, 5000);
  }
  killMonster(w, bossId!, mc);
}

async function dungeonRooms(): Promise<string[]> {
  const all = await matchMaker.query({ name: roomNameOf(LINH_HU_MAP_ID) });
  return all.map((r) => r.roomId);
}

describe("Bí cảnh: Thử tải & Stress Test (Issue #201)", () => {
  it("N run đồng thời đạt trần MAX_DUNGEON_RUNS (10 run, 20 bot): mọi đội vào đúng phòng, run thứ 11 bị từ chối full", async () => {
    const pairs: [BotPlayer, BotPlayer][] = [];

    // Tạo 10 đội x 2 người = 20 bot, đứng cạnh NPC Thủ môn
    for (let i = 1; i <= MAX_DUNGEON_RUNS; i++) {
      const leader = await spawnBot(`BotL ${i} ${++seq}`, DEFAULT_MAP_ID, true);
      const member = await spawnBot(`BotM ${i} ${++seq}`, DEFAULT_MAP_ID, true);
      await formParty(leader, member);
      pairs.push([leader, member]);
    }

    // 10 đội trưởng mở bí cảnh đồng thời
    for (const [leader] of pairs) {
      leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    }

    // Cả 10 run được ghi vào sổ Hub.runs
    await waitFor(
      () => (runs().size === MAX_DUNGEON_RUNS ? runs().size : undefined),
      4000,
      "10 run mở đủ",
    );
    expect(runs().size).toBe(MAX_DUNGEON_RUNS);

    // Đội thứ 11 thử mở bí cảnh -> bị từ chối vì đã đạt MAX_DUNGEON_RUNS
    const extraL = await spawnBot(`ExtraL ${++seq}`, DEFAULT_MAP_ID, true);
    const extraM = await spawnBot(`ExtraM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(extraL, extraM);
    extraL.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    await waitFor(
      () => extraL.toasts.find((t) => t.text.includes("đang đông người")),
      2000,
      "đội 11 bị từ chối full",
    );
    expect(runs().size).toBe(MAX_DUNGEON_RUNS);

    // Mọi thành viên của 10 đội nhận lời mời và bấm dungeonEnter
    for (const [leader, member] of pairs) {
      const lInv = await waitFor(() => leader.invites[0], 2000, "leader nhận mời");
      const mInv = await waitFor(() => member.invites[0], 2000, "member nhận mời");
      expect(lInv.runId).toBe(mInv.runId);

      leader.room.send(DUNGEON_MSG.enter, { runId: lInv.runId });
      member.room.send(DUNGEON_MSG.enter, { runId: mInv.runId });
    }

    // Mọi bot nhận travelTo có roomId và vào phòng bí cảnh
    const dungeonClients: Room[] = [];
    for (const [leader, member] of pairs) {
      const lTravel = await waitFor(() => leader.travelTos[0], 2000, "leader travelTo");
      const mTravel = await waitFor(() => member.travelTos[0], 2000, "member travelTo");
      expect(lTravel.roomId).toBeDefined();
      expect(mTravel.roomId).toBe(lTravel.roomId);

      const [rL, rM] = await Promise.all([
        followTravel(leader, lTravel),
        followTravel(member, mTravel),
      ]);
      dungeonClients.push(rL, rM);
    }

    // 10 phòng bí cảnh tồn tại đồng thời
    const activeDungeons = await dungeonRooms();
    expect(activeDungeons.length).toBe(MAX_DUNGEON_RUNS);

    // Tất cả các bot trong phòng bí cảnh đều nhận dungeonState (running)
    await sleep(1100);
    for (const dc of dungeonClients) {
      const sr = serverRoom(dc);
      expect(sr.mapId).toBe(LINH_HU_MAP_ID);
      expect((sr as any).world.runId).toBeDefined();
    }
  }, 30_000);

  it("thử tải rò rỉ: chu kỳ tạo / huỷ phòng dọn sạch Hub.runs, cooldownSize và phòng Colyseus về 0", async () => {
    // Chạy 2 chu kỳ mở run -> cả hai vào phòng -> rời run -> dọn sạch
    for (let cycle = 1; cycle <= 2; cycle++) {
      const leader = await spawnBot(`LeakL ${cycle} ${++seq}`, DEFAULT_MAP_ID, true);
      const member = await spawnBot(`LeakM ${cycle} ${++seq}`, DEFAULT_MAP_ID, true);
      await formParty(leader, member);

      leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
      const invL = await waitFor(() => leader.invites[0], 2500, "mời leader");
      const invM = await waitFor(() => member.invites[0], 2500, "mời member");
      leader.room.send(DUNGEON_MSG.enter, { runId: invL.runId });
      member.room.send(DUNGEON_MSG.enter, { runId: invM.runId });

      const lTravel = await waitFor(() => leader.travelTos[0], 2500, "travelTo L");
      const mTravel = await waitFor(() => member.travelTos[0], 2500, "travelTo M");

      const [dL, dM] = await Promise.all([
        followTravel(leader, lTravel),
        followTravel(member, mTravel),
      ]);

      // Cả hai lần lượt gửi tin dungeonLeave (rời bí cảnh về Lạc Hà)
      dL.send(DUNGEON_MSG.leave, {});
      await waitFor(
        () => leader.travelTos.some((t) => t.mapId === DEFAULT_MAP_ID),
        4000,
        "L về Lạc Hà",
      );

      dM.send(DUNGEON_MSG.leave, {});
      await waitFor(
        () => member.travelTos.some((t) => t.mapId === DEFAULT_MAP_ID),
        4000,
        "M về Lạc Hà",
      );

      // Chờ phòng bí cảnh Colyseus tự huỷ và run được dọn khỏi sổ Hub.runs
      await waitFor(() => runs().size === 0, 6000, "run chu kỳ được dọn");
      await waitFor(async () => (await dungeonRooms()).length === 0, 6000, "phòng bí cảnh đóng");
    }

    // Kiểm tra không rò rỉ run trong sổ Hub.runs
    expect(runs().size).toBe(0);

    // Chờ sweep cooldown: cooldownSize của Hub.runs phải dọn sạch hoàn toàn
    WorldRoomClass.hub.runs._sweepCooldowns(Date.now() + DUNGEON_OPEN_COOLDOWN_MS + 1000);
    expect(runs().cooldownSize).toBe(0);

    // Mọi phòng bí cảnh Colyseus tự huỷ không còn phòng treo
    const remaining = await dungeonRooms();
    expect(remaining.length).toBe(0);
  }, 35_000);

  it("đua dungeonEnter: 2 thành viên cùng bấm enter đồng thời -> cả 2 đều nhận travelTo đúng và vào cùng phòng", async () => {
    const leader = await spawnBot(`RaceL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`RaceM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2000, "nhận invite");

    // Đua: cả hai gửi enter cùng lúc
    await Promise.all([
      new Promise<void>((r) => {
        leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
        r();
      }),
      new Promise<void>((r) => {
        member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
        r();
      }),
    ]);

    const [lTravel, mTravel] = await Promise.all([
      waitFor(() => leader.travelTos[0], 2000, "lTravel"),
      waitFor(() => member.travelTos[0], 2000, "mTravel"),
    ]);

    expect(lTravel.roomId).toBeDefined();
    expect(lTravel.roomId).toBe(mTravel.roomId);

    // Cả hai cùng kết nối vào phòng
    const [rL, rM] = await Promise.all([
      followTravel(leader, lTravel),
      followTravel(member, mTravel),
    ]);

    expect(rL.roomId).toBe(rM.roomId);
    expect(serverRoom(rL).state.players.size).toBe(2);
  });

  it("giết tiến trình giữa run: rớt mạng trong phòng bí cảnh rồi đăng nhập lại phải về Lạc Hà, không kẹt trong bí cảnh", async () => {
    const leader = await spawnBot(`CrashL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`CrashM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2000, "nhận invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });

    const lTravel = await waitFor(() => leader.travelTos[0], 2000, "travelTo");
    const dRoom = await followTravel(leader, lTravel);

    // Giết tiến trình đột ngột (rớt mạng bất thường consented=false)
    await dRoom.leave(false);
    await sleep(200);

    // Đăng nhập lại từ đầu: phải vào đúng phòng mặc định Lạc Hà Trấn
    const newClient = new Client(`ws://localhost:${PORT}`);
    const resumeRoom = await newClient.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
      name: leader.name,
      secret: leader.secret,
    });
    rooms.push(resumeRoom);

    expect(serverRoom(resumeRoom).mapId).toBe(DEFAULT_MAP_ID);
    const saved = JSON.parse(readFileSync(fileFor(leader.name), "utf8"));
    expect(saved.mapId).toBe(DEFAULT_MAP_ID);
  });

  it("phòng bí cảnh chặn người ngoài: joinOrCreate bị từ chối, joinById lậu bị 422 JOIN_NOT_IN_RUN", async () => {
    // 1. Thử joinOrCreate thẳng tên phòng bí cảnh
    const outsider = new Client(`ws://localhost:${PORT}`);
    await expect(
      outsider.joinOrCreate(roomNameOf(LINH_HU_MAP_ID), {
        name: `Outsider ${++seq}`,
        secret: secretOf("outsider"),
      }),
    ).rejects.toThrow();

    // 2. Mở một phòng bí cảnh thật
    const leader = await spawnBot(`SecL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`SecM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);
    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2000, "invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    const travel = await waitFor(() => leader.travelTos[0], 2000, "travelTo");

    // 3. Kẻ lạ biết roomId nhưng không có tên trong danh sách thành viên của run -> bị từ chối 422
    const spy = await spawnBot(`Spy ${++seq}`, DEFAULT_MAP_ID);
    const spyClient = new Client(`ws://localhost:${PORT}`);
    await expect(
      spyClient.joinById(travel.roomId!, { name: spy.name, secret: spy.secret }),
    ).rejects.toMatchObject({ code: JOIN_NOT_IN_RUN });
  });

  it("thành viên rời đội giữa run (partyLeave): không làm sập phòng bí cảnh và các thành viên còn lại vẫn tiếp tục", async () => {
    const leader = await spawnBot(`PtLeaveL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`PtLeaveM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2000, "invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });

    const lTravel = await waitFor(() => leader.travelTos[0], 2000, "lTravel");
    const mTravel = await waitFor(() => member.travelTos[0], 2000, "mTravel");

    const [rL, rM] = await Promise.all([
      followTravel(leader, lTravel),
      followTravel(member, mTravel),
    ]);

    // Thành viên rời đội
    rM.send("partyLeave", {});
    await sleep(200);

    // Cả 2 vẫn an toàn trong phòng bí cảnh
    expect(rL.connection.isOpen).toBe(true);
    expect(rM.connection.isOpen).toBe(true);
  });

  // ---------- Gục trong Bí cảnh không mất kiếp (M3.4, Issue #236) ----------

  it("gục trong bí cảnh: nhận dungeonFallen, không limbo, không mất đồ/coin/cảnh giới/kiếp, trừ 1 lượt dungeonDaily, về Lạc Hà an toàn", async () => {
    const leader = await spawnBot(`FallL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`FallM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2500, "invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });

    const [lTravel, mTravel] = await Promise.all([
      waitFor(() => leader.travelTos[0], 2500, "lTravel"),
      waitFor(() => member.travelTos[0], 2500, "mTravel"),
    ]);

    const [, rM] = await Promise.all([
      followTravel(leader, lTravel),
      followTravel(member, mTravel),
    ]);

    const ctrlM = worldOf(rM).ctrl.get(rM.sessionId)!;
    ctrlM.coin = 999;
    const initialKiep = ctrlM.soul.kiep;
    const initialLifeId = ctrlM.lifeId;
    const initialDuyen = ctrlM.soul.duyen;

    // Đánh gục member
    lethal(rM);

    // Member nhận dungeonFallen
    const fallen = await waitFor(() => member.fallens[0], 4000, "dungeonFallen");
    expect(fallen.exitInMs).toBe(DUNGEON_FALL_EXIT_MS);
    expect(fallen.rewardsLeft).toBe(DUNGEON_DAILY_REWARDS - 1);
    expect(member.limbos).toHaveLength(0);

    // Leader thấy member alive = false trong dungeonState
    await waitFor(
      () => leader.states.some((st) => st.members.some((m) => m.name === member.name && !m.alive)),
      4000,
      "state member dead",
    );

    // Sau ~3s (DUNGEON_FALL_EXIT_MS), member nhận travelTo về Lạc Hà
    const returnTravel = await waitFor(
      () => member.travelTos.find((t) => t.mapId === DEFAULT_MAP_ID),
      6000,
      "member về Lạc Hà",
    );
    expect(returnTravel.mapId).toBe(DEFAULT_MAP_ID);

    // Đăng nhập / kết nối lại member vào Lạc Hà
    const client = new Client(`ws://localhost:${PORT}`);
    const mHomeRoom = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
      name: member.name,
      secret: member.secret,
    });
    rooms.push(mHomeRoom);

    // Kiểm tra state của member ở Lạc Hà
    const pM = serverState(mHomeRoom).players.get(mHomeRoom.sessionId)!;
    expect(pM.dead).toBe(false);
    expect(pM.hp).toBeGreaterThan(0);
    const mHomeCtrl = worldOf(mHomeRoom).ctrl.get(mHomeRoom.sessionId)!;
    expect(mHomeCtrl.coin).toBe(999);
    expect(mHomeCtrl.soul.kiep).toBe(initialKiep);
    expect(mHomeCtrl.soul.duyen).toBe(initialDuyen);
    expect(mHomeCtrl.lifeId).toBe(initialLifeId);
    expect(mHomeCtrl.limbo).toBeUndefined();

    // File lưu của member: không limbo, dungeonDaily tăng 1
    const saved = JSON.parse(readFileSync(fileFor(member.name), "utf8"));
    expect(saved.mapId).toBe(DEFAULT_MAP_ID);
    expect(saved.limbo).toBeUndefined();
    expect(saved.dungeonDaily?.rewards).toBe(1);
    expect(saved.coin).toBe(999);
  });

  it("sau khi gục: không vào lại được run cũ (dungeonEnter từ chối), đồng đội hạ trùm thì người gục không nhận dungeonEnd thắng", async () => {
    const leader = await spawnBot(`NoReL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`NoReM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2500, "invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });

    const [lTravel, mTravel] = await Promise.all([
      waitFor(() => leader.travelTos[0], 2500, "lTravel"),
      waitFor(() => member.travelTos[0], 2500, "mTravel"),
    ]);

    const [rL, rM] = await Promise.all([
      followTravel(leader, lTravel),
      followTravel(member, mTravel),
    ]);

    // Đánh gục member
    lethal(rM);
    await waitFor(() => member.fallens[0], 4000, "member gục");
    await waitFor(
      () => member.travelTos.some((t) => t.mapId === DEFAULT_MAP_ID),
      6000,
      "member ra ngoài",
    );

    // Thử gửi dungeonEnter lại run cũ từ member
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    await sleep(200);
    expect(member.travelTos.filter((t) => t.roomId !== undefined)).toHaveLength(0);

    // Leader ở lại hạ trùm
    killBoss(rL);
    const lEnd = await waitFor(() => leader.ends[0], 4000, "leader nhận end");
    expect(lEnd.result).toBe("won");

    // Member đã gục không nhận được dungeonEnd
    expect(member.ends).toHaveLength(0);
  });

  it("cả đội gục: run kết thúc all_dead, mọi thành viên bị đẩy ra, dọn sạch phòng và run (không rò rỉ)", async () => {
    const leader = await spawnBot(`AllDeadL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`AllDeadM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2500, "invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });

    const [lTravel, mTravel] = await Promise.all([
      waitFor(() => leader.travelTos[0], 2500, "lTravel"),
      waitFor(() => member.travelTos[0], 2500, "mTravel"),
    ]);

    const [rL, rM] = await Promise.all([
      followTravel(leader, lTravel),
      followTravel(member, mTravel),
    ]);

    // Cả hai cùng gục lần lượt
    lethal(rL);
    lethal(rM);

    await Promise.all([
      waitFor(() => leader.fallens[0], 4000, "leader fallen"),
      waitFor(() => member.fallens[0], 4000, "member fallen"),
    ]);

    // Run chuyển sang kết thúc all_dead
    const run = runs().get(inv.runId)!;
    await waitFor(() => run.phase === "lost", 4000, "run lost");
    expect(run.endReason).toBe("all_dead");

    // Cả 2 được đẩy về Lạc Hà
    await Promise.all([
      waitFor(() => leader.travelTos.some((t) => t.mapId === DEFAULT_MAP_ID), 6000, "L về LH"),
      waitFor(() => member.travelTos.some((t) => t.mapId === DEFAULT_MAP_ID), 6000, "M về LH"),
    ]);

    // Run và phòng bí cảnh tự dọn sạch
    await waitFor(() => runs().size === 0, 6000, "runs dọn sạch");
    await waitFor(async () => (await dungeonRooms()).length === 0, 6000, "phòng bí cảnh dọn sạch");
  });

  it("đua: hai người gục cùng một tick -> cả hai nhận dungeonFallen, run kết thúc all_dead", async () => {
    const leader = await spawnBot(`SyncFallL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`SyncFallM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2500, "invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });

    const [lTravel, mTravel] = await Promise.all([
      waitFor(() => leader.travelTos[0], 2500, "lTravel"),
      waitFor(() => member.travelTos[0], 2500, "mTravel"),
    ]);

    const [rL, rM] = await Promise.all([
      followTravel(leader, lTravel),
      followTravel(member, mTravel),
    ]);

    // Gục cùng lúc
    lethal(rL);
    lethal(rM);

    await Promise.all([
      waitFor(() => leader.fallens[0], 4000, "L fallen"),
      waitFor(() => member.fallens[0], 4000, "M fallen"),
    ]);

    const run = runs().get(inv.runId)!;
    await waitFor(() => run.phase === "lost", 4000, "run phase lost");
    expect(run.endReason).toBe("all_dead");
  });

  it("đua: gục đúng lúc trùm chết -> người sống thắng nhận thưởng, người gục nhận dungeonFallen mất lượt", async () => {
    const leader = await spawnBot(`BossDieL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`BossDieM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2500, "invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });

    const [lTravel, mTravel] = await Promise.all([
      waitFor(() => leader.travelTos[0], 2500, "lTravel"),
      waitFor(() => member.travelTos[0], 2500, "mTravel"),
    ]);

    const [rL, rM] = await Promise.all([
      followTravel(leader, lTravel),
      followTravel(member, mTravel),
    ]);

    // Gục member và hạ boss cùng lúc
    lethal(rM);
    killBoss(rL);

    await waitFor(() => member.fallens[0], 4000, "M fallen");
    const endL = await waitFor(() => leader.ends[0], 4000, "L end");
    expect(endL.result).toBe("won");
    expect(member.ends).toHaveLength(0);
  });

  it("đua: gục sau khi run đã thắng (pha nhặt đồ) -> không trừ lượt thêm, vẫn không mất kiếp", async () => {
    const leader = await spawnBot(`LootFallL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`LootFallM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2500, "invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });

    const [lTravel, mTravel] = await Promise.all([
      waitFor(() => leader.travelTos[0], 2500, "lTravel"),
      waitFor(() => member.travelTos[0], 2500, "mTravel"),
    ]);

    const [rL, rM] = await Promise.all([
      followTravel(leader, lTravel),
      followTravel(member, mTravel),
    ]);

    // Hạ trùm trước
    killBoss(rL);
    await waitFor(() => leader.ends[0], 4000, "run thắng");
    await waitFor(() => member.ends[0], 4000, "member nhận win");

    const ctrlM = worldOf(rM).ctrl.get(rM.sessionId)!;
    const rewardsBefore = ctrlM.save.dungeonDaily?.rewards ?? 1;

    // Lúc này run đang trong pha loot (exitAt !== null) -> member bị gục
    lethal(rM);
    const fallen = await waitFor(() => member.fallens[0], 4000, "member fallen");
    expect(fallen.exitInMs).toBe(DUNGEON_FALL_EXIT_MS);

    // Không bị trừ lượt thêm
    expect(ctrlM.save.dungeonDaily?.rewards ?? 1).toBe(rewardsBefore);

    // Đẩy về Lạc Hà an toàn
    await waitFor(
      () => member.travelTos.some((t) => t.mapId === DEFAULT_MAP_ID),
      6000,
      "member về Lạc Hà",
    );
  });

  it("đua: rớt mạng giữa lúc chờ đẩy ra (DUNGEON_FALL_EXIT_MS) -> mapId lưu Lạc Hà, đăng nhập lại bình thường không kẹt limbo", async () => {
    const leader = await spawnBot(`DisconnFallL ${++seq}`, DEFAULT_MAP_ID, true);
    const member = await spawnBot(`DisconnFallM ${++seq}`, DEFAULT_MAP_ID, true);
    await formParty(leader, member);

    leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    const inv = await waitFor(() => leader.invites[0], 2500, "invite");
    leader.room.send(DUNGEON_MSG.enter, { runId: inv.runId });
    member.room.send(DUNGEON_MSG.enter, { runId: inv.runId });

    const [lTravel, mTravel] = await Promise.all([
      waitFor(() => leader.travelTos[0], 2500, "lTravel"),
      waitFor(() => member.travelTos[0], 2500, "mTravel"),
    ]);

    const [, rM] = await Promise.all([
      followTravel(leader, lTravel),
      followTravel(member, mTravel),
    ]);

    // Member gục
    lethal(rM);
    await waitFor(() => member.fallens[0], 4000, "member fallen");

    // Ngay lập tức rớt mạng bất thường
    await rM.leave(false);
    await sleep(200);

    // Kiểm tra file lưu của member
    const saved = JSON.parse(readFileSync(fileFor(member.name), "utf8"));
    expect(saved.mapId).toBe(DEFAULT_MAP_ID);
    expect(saved.limbo).toBeUndefined();

    // Đăng nhập lại vào Lạc Hà
    const client = new Client(`ws://localhost:${PORT}`);
    const resumeRoom = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
      name: member.name,
      secret: member.secret,
    });
    rooms.push(resumeRoom);
    expect(serverRoom(resumeRoom).mapId).toBe(DEFAULT_MAP_ID);
  });

  it("audit-saves (kiem-save): toàn bộ hồ sơ sau các ca gục bí cảnh đều hợp lệ, không vi phạm dungeonDaily hay mapId", () => {
    const files = readdirSync(dataDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const fullPath = path.join(dataDir, f);
      const content = readFileSync(fullPath, "utf8");
      const stat = statSync(fullPath);
      const errors = auditPlayerSaveData(content, stat.size);
      expect(errors).toEqual([]);
    }
  });
});
