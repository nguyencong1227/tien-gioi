// Test tích hợp Bí cảnh (M3 bước 4b-2): server Colyseus thật, client colyseus.js như client thật.
// Mở -> mời -> vào (travelTo kèm roomId, joinById) -> chạy / kết thúc -> về Lạc Hà; chống vào lậu; không bao giờ kẹt trong bí cảnh.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  DUNGEON_MSG,
  HAC_PHONG_ID,
  JOIN_NOT_IN_RUN,
  LINH_HU_ID,
  LINH_HU_MAP_ID,
  NPC_BY_ID,
  dungeonOf,
  getMap,
  roomNameOf,
  type DungeonEndMsg,
  type DungeonInviteMsg,
  type DungeonStateMsg,
  type PartyInvitedMsg,
  type PartyMsg,
  type ToastMsg,
  type TravelToMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";
import type { Run } from "../systems/dungeon";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-dungeon-"));
const PORT = 46000 + Math.floor(Math.random() * 3000);
let server: Server;
let WorldRoomClass: typeof WorldRoom;
const rooms: Room[] = [];
const gate = NPC_BY_ID.thu_mon;
const LINH_HU = dungeonOf(LINH_HU_ID)!;

beforeAll(async () => {
  process.env.DATA_DIR = dataDir; // store.ts đọc biến này lúc nạp module
  const { WorldRoom, defineRooms } = await import("./WorldRoom");
  WorldRoomClass = WorldRoom;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  await server.listen(PORT);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
  WorldRoomClass.hub.runs.clear(); // mỗi test một sổ run sạch (run sót của test trước không ảnh hưởng)
  // phòng bí cảnh còn sót (chưa ai vào) tự đóng khi thấy run biến mất (<= 1 giây): chờ xong rồi mới sang test sau
  await waitFor(
    async () => (await dungeonRooms()).length === 0,
    5000,
    "phòng bí cảnh sót đóng hết",
  );
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(
  fn: () => T | undefined | false | Promise<T | undefined | false>,
  ms = 4000,
  what = "điều kiện",
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(20);
  }
}

let seq = 0;
const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const runs = () => WorldRoomClass.hub.runs;

/** Một người chơi: kết nối vào phòng, gom các tin của bí cảnh. */
interface Hero {
  name: string;
  secret: string;
  room: Room;
  invites: DungeonInviteMsg[];
  states: DungeonStateMsg[];
  ends: DungeonEndMsg[];
  travels: TravelToMsg[];
  toasts: ToastMsg[];
  parties: PartyMsg[];
  partyInvited: PartyInvitedMsg[];
}

function listen(room: Room, h: Hero) {
  room.onMessage(DUNGEON_MSG.invite, (m: DungeonInviteMsg) => h.invites.push(m));
  room.onMessage(DUNGEON_MSG.state, (m: DungeonStateMsg) => h.states.push(m));
  room.onMessage(DUNGEON_MSG.end, (m: DungeonEndMsg) => h.ends.push(m));
  room.onMessage("travelTo", (m: TravelToMsg) => h.travels.push(m));
  room.onMessage("toast", (m: ToastMsg) => h.toasts.push(m));
  room.onMessage("party", (m: PartyMsg) => h.parties.push(m));
  room.onMessage("partyInvited", (m: PartyInvitedMsg) => h.partyInvited.push(m));
  for (const t of ["inv", "wallet", "quests", "dialog", "chat", "fx", "dmg", "soul"])
    room.onMessage(t, () => {});
}

/** Vào phòng `roomName` (tạo nhân vật mới nếu chưa có). Đặt cảnh giới đủ vào Linh Hư và đứng cạnh Thủ môn nếu ở Lạc Hà. */
async function spawn(
  name = `Tu Si ${++seq}`,
  roomName = roomNameOf(DEFAULT_MAP_ID),
): Promise<Hero> {
  const secret = secretOf(name);
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomName, { name, secret });
  const h: Hero = {
    name,
    secret,
    room,
    invites: [],
    states: [],
    ends: [],
    travels: [],
    toasts: [],
    parties: [],
    partyInvited: [],
  };
  listen(room, h);
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  const p = serverState(room).players.get(room.sessionId)!;
  p.realm = 1;
  p.tier = 8; // stepOf(1, 8) = minStep của Linh Hư
  p.x = gate.x;
  p.y = gate.y;
  return h;
}

/** Nhân vật đang ở một bản đồ khác (như đã đi qua cổng): tạo ở Lạc Hà, sửa hồ sơ sang `mapId`, vào phòng của bản đồ đó. */
async function spawnIn(mapId: string): Promise<Hero> {
  const name = `Lu Khach ${++seq}`;
  const first = await spawn(name);
  await first.room.leave(true);
  rooms.splice(rooms.indexOf(first.room), 1);
  await sleep(200);
  const f = readdirSync(dataDir)
    .filter((x) => x.endsWith(".json"))
    .map((x) => path.join(dataDir, x))
    .find((x) => JSON.parse(readFileSync(x, "utf8")).name === name)!;
  const m = getMap(mapId)!;
  writeFileSync(
    f,
    JSON.stringify({
      ...JSON.parse(readFileSync(f, "utf8")),
      mapId,
      x: Math.round(m.townPx.x),
      y: Math.round(m.townPx.y),
    }),
  );
  return spawn(name, roomNameOf(mapId));
}

/** `joinById` như client thật làm sau `travelTo { mapId, roomId }`. */
async function followTravel(h: Hero, travel: TravelToMsg): Promise<Room> {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinById(travel.roomId!, { name: h.name, secret: h.secret });
  h.room = room;
  h.invites = [];
  h.states = [];
  h.ends = [];
  h.travels = [];
  h.toasts = [];
  listen(room, h);
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "vào phòng bí cảnh");
  return room;
}

/** Hai người (đội trưởng ở Lạc Hà, thành viên ở Lạc Hà hoặc Hắc Phong Cốc) thành đội. */
async function party(leader: Hero, member: Hero) {
  leader.room.send("partyInvite", { name: member.name });
  await waitFor(() => member.partyInvited.length > 0, 4000, "lời mời đội");
  member.room.send("partyAccept", { from: leader.name });
  await waitFor(() => leader.parties.at(-1)?.members.length === 2, 4000, "đội thành lập");
}

/** Đội trưởng mở Linh Hư; chờ cả hai nhận lời mời. */
async function openRun(leader: Hero, member: Hero): Promise<Run> {
  leader.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
  await waitFor(
    () => leader.invites.length > 0 && member.invites.length > 0,
    5000,
    "lời mời bí cảnh",
  );
  return [...runs().all()][0];
}

const saveOf = (name: string) => {
  const f = readdirSync(dataDir)
    .filter((x) => x.endsWith(".json"))
    .find((x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name);
  return f ? JSON.parse(readFileSync(path.join(dataDir, f), "utf8")) : undefined;
};

const dungeonRooms = () => matchMaker.query({ name: roomNameOf(LINH_HU_MAP_ID) });

/** Đội A (đội trưởng) + B đã thành đội, cùng ở Lạc Hà, run đã mở. */
async function setupRun() {
  const a = await spawn();
  const b = await spawn();
  await party(a, b);
  const run = await openRun(a, b);
  return { a, b, run };
}

describe("mở và vào bí cảnh", () => {
  it("luồng đầy đủ: mở -> cả hai nhận lời mời (runId, hạn, lượt thưởng) -> `travelTo` có roomId -> joinById -> đồng hồ chạy, HUD nhận `dungeonState`", async () => {
    const { a, b, run } = await setupRun();
    expect(run.phase).toBe("gathering");
    expect(run.roomId).toBeTruthy();
    const inv = a.invites[0];
    expect(inv).toMatchObject({ runId: run.id, dungeonId: LINH_HU_ID, from: a.name });
    expect(inv.expiresInMs).toBeGreaterThan(50_000);
    expect(inv.rewardsLeft).toBe(3);
    expect(b.invites[0].runId).toBe(run.id);

    a.room.send(DUNGEON_MSG.enter, { runId: run.id });
    const ta = await waitFor(() => a.travels[0], 5000, "travelTo của A");
    expect(ta).toEqual({ mapId: LINH_HU_MAP_ID, roomId: run.roomId });
    // lưu xong mới gửi: hồ sơ ghi bản đồ vào ở Lạc Hà (không phải bí cảnh)
    expect(saveOf(a.name)).toMatchObject({ mapId: DEFAULT_MAP_ID });
    const ra = await followTravel(a, ta);
    const sr = serverRoom(ra);
    expect(sr.mapId).toBe(LINH_HU_MAP_ID);
    expect(sr.maxClients).toBe(LINH_HU.partyMax);
    expect(run.phase).toBe("running"); // người đầu tiên vào bắt đầu đồng hồ
    expect(run.startedAt).not.toBeNull();
    expect(run.deadline - run.startedAt!).toBe(LINH_HU.timeLimitMs);
    // xuất hiện ở cổng vào (khu an toàn phía nam)
    const me = serverState(ra).players.get(ra.sessionId)!;
    const gateMap = getMap(LINH_HU_MAP_ID)!;
    expect(Math.hypot(me.x - gateMap.townPx.x, me.y - gateMap.townPx.y)).toBeLessThanOrEqual(
      gateMap.townPx.r,
    );
    // quái nhỏ + trùm có mặt; HUD nhận trạng thái
    const st = await waitFor(() => a.states.at(-1), 3000, "dungeonState");
    expect(st.phase).toBe("running");
    expect(st.mobsLeft).toBeGreaterThan(0);
    expect(st.boss).not.toBeNull();
    expect(st.deadlineInMs).toBeGreaterThan(LINH_HU.timeLimitMs - 5000);
    expect(st.members.map((m) => m.name)).toEqual([a.name]);

    // B vào muộn: cùng phòng, đồng hồ không đổi
    const deadline = run.deadline;
    b.room.send(DUNGEON_MSG.enter, { runId: run.id });
    const rb = await followTravel(b, await waitFor(() => b.travels[0], 5000, "travelTo của B"));
    expect(rb.roomId).toBe(ra.roomId);
    expect(run.deadline).toBe(deadline);
    expect(serverState(ra).players.size).toBe(2);
    expect(run.members.get(a.name.toLowerCase())!.status).toBe("inside");
    expect(run.members.get(b.name.toLowerCase())!.status).toBe("inside");
    // đội vẫn còn (sổ đội dùng chung): chat đội đi xuyên phòng
    await waitFor(
      () => (a.states.at(-1)?.members.length ?? 0) === 2,
      3000,
      "danh sách đội trong HUD",
    );
  });

  it("người ở bản đồ khác (Hắc Phong Cốc) cũng nhận lời mời và vào được; hồ sơ ghi bản đồ vào ở Lạc Hà", async () => {
    const a = await spawn();
    const b = await spawnIn(HAC_PHONG_ID);
    expect(serverRoom(b.room).mapId).toBe(HAC_PHONG_ID);
    await party(a, b);
    const run = await openRun(a, b);
    b.room.send(DUNGEON_MSG.enter, { runId: run.id });
    const tb = await waitFor(() => b.travels[0], 5000, "travelTo của B");
    expect(tb).toEqual({ mapId: LINH_HU_MAP_ID, roomId: run.roomId });
    expect(saveOf(b.name)).toMatchObject({ mapId: DEFAULT_MAP_ID });
    const rb = await followTravel(b, tb);
    expect(serverRoom(rb).mapId).toBe(LINH_HU_MAP_ID);
  });

  it("client không tạo được phòng bí cảnh bằng joinOrCreate (không runId, runId lạ / sai kiểu / đã có phòng); người ngoài không lọt vào phòng của run", async () => {
    const outsider = await spawn();
    const client = new Client(`ws://localhost:${PORT}`);
    const attempt = (opts: object) =>
      client.joinOrCreate(roomNameOf(LINH_HU_MAP_ID), {
        name: outsider.name,
        secret: outsider.secret,
        ...opts,
      });
    // chưa có run nào: không tạo được phòng nào
    for (const opts of [{}, { runId: "0".repeat(32) }, { runId: 5 }, { runId: null }])
      await expect(attempt(opts), JSON.stringify(opts)).rejects.toBeTruthy();
    expect(await dungeonRooms()).toHaveLength(0);
    // server cũng không tạo thẳng khi không có run hợp lệ
    await expect(matchMaker.createRoom(roomNameOf(LINH_HU_MAP_ID), {})).rejects.toBeTruthy();
    expect(await dungeonRooms()).toHaveLength(0);

    // có một run đang mở: người ngoài joinOrCreate (kể cả có runId thật) chỉ nhận lỗi, không có phòng mới
    const a = await spawn();
    const b = await spawn();
    await party(a, b);
    const run = await openRun(a, b);
    for (const opts of [{}, { runId: run.id }]) {
      const e = await attempt(opts).then(
        () => null,
        (x) => x,
      );
      expect(e?.code, JSON.stringify(opts)).toBe(JOIN_NOT_IN_RUN);
    }
    // run đã có phòng thì không tạo thêm phòng thứ hai cho cùng run
    await expect(
      matchMaker.createRoom(roomNameOf(LINH_HU_MAP_ID), { runId: run.id }),
    ).rejects.toBeTruthy();
    expect(await dungeonRooms()).toHaveLength(1);
  });

  it("joinById lậu: người ngoài đội (dù có tài khoản và mã đúng) và nhân vật chưa có hồ sơ bị `JOIN_NOT_IN_RUN`", async () => {
    const { run } = await setupRun();
    const outsider = await spawn(); // có hồ sơ, không trong đội
    const client = new Client(`ws://localhost:${PORT}`);
    const err = await client
      .joinById(run.roomId!, { name: outsider.name, secret: outsider.secret })
      .then(
        () => null,
        (e) => e,
      );
    expect(err?.code).toBe(JOIN_NOT_IN_RUN);
    // chưa có hồ sơ: không tạo nhân vật trong bí cảnh
    const ghost = await new Client(`ws://localhost:${PORT}`)
      .joinById(run.roomId!, { name: "Vo Danh Khach", secret: secretOf("Vo Danh Khach") })
      .then(
        () => null,
        (e) => e,
      );
    expect(ghost?.code).toBe(JOIN_NOT_IN_RUN);
    expect(saveOf("Vo Danh Khach")).toBeUndefined();
    // sai mã: vẫn là lỗi xác thực thường (403), không lộ chuyện run
    const thief = await new Client(`ws://localhost:${PORT}`)
      .joinById(run.roomId!, { name: outsider.name, secret: "sai-ma-0123456789abcdef-zzz" })
      .then(
        () => null,
        (e) => e,
      );
    expect(thief?.code).toBe(403);
  });

  it("hai run cùng lúc: thành viên của run này không vào được phòng của run kia (kiểm đúng phòng ở onAuth)", async () => {
    const a = await spawn();
    const b = await spawn();
    const c = await spawn();
    const d = await spawn();
    await party(a, b);
    await party(c, d);
    a.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    await waitFor(() => a.invites.length > 0 && b.invites.length > 0, 5000, "lời mời run 1");
    c.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
    await waitFor(() => c.invites.length > 0 && d.invites.length > 0, 5000, "lời mời run 2");
    expect(runs().size).toBe(2);
    const run1 = runs().get(a.invites[0].runId)!;
    const run2 = runs().get(c.invites[0].runId)!;
    expect(run1.roomId).not.toBe(run2.roomId);
    // A (run 1) thử vào phòng của run 2 bằng joinById
    const err = await new Client(`ws://localhost:${PORT}`)
      .joinById(run2.roomId!, { name: a.name, secret: a.secret })
      .then(
        () => null,
        (e) => e,
      );
    expect(err?.code).toBe(JOIN_NOT_IN_RUN);
    // và vào đúng phòng của mình thì được
    a.room.send(DUNGEON_MSG.enter, { runId: run1.id });
    const ra = await followTravel(a, await waitFor(() => a.travels[0], 5000));
    expect(ra.roomId).toBe(run1.roomId);
  });

  it("run đã hết (xoá khỏi sổ) hoặc kết thúc: thành viên cũng không joinById được nữa", async () => {
    const { a, run } = await setupRun();
    const roomId = run.roomId!;
    run.phase = "lost"; // run đã kết thúc
    const client = new Client(`ws://localhost:${PORT}`);
    const err = await client.joinById(roomId, { name: a.name, secret: a.secret }).then(
      () => null,
      (e) => e,
    );
    expect(err?.code).toBe(JOIN_NOT_IN_RUN);
  });
});

describe("từ chối và hết hạn mời: không để phòng hay run treo", () => {
  it("mọi người từ chối: đội trưởng nhận `declined`, run biến mất, phòng bí cảnh chưa ai vào được đóng", async () => {
    const { a, b, run } = await setupRun();
    expect(await dungeonRooms()).toHaveLength(1);
    b.room.send(DUNGEON_MSG.decline, { runId: run.id });
    await waitFor(() => a.toasts.some((t) => t.text.includes("từ chối")), 4000, "báo từ chối");
    a.room.send(DUNGEON_MSG.decline, { runId: run.id });
    const end = await waitFor(() => a.ends[0], 4000, "dungeonEnd declined");
    expect(end).toMatchObject({ result: "lost", reason: "declined", rewardsLeft: 3 });
    expect(runs().size).toBe(0);
    await waitFor(async () => (await dungeonRooms()).length === 0, 5000, "phòng bí cảnh bị đóng");
  });

  it("quá hạn mời mà không ai vào: `no_entry`, run và phòng được dọn", async () => {
    const { a, run } = await setupRun();
    (run as { inviteUntil: number }).inviteUntil = Date.now() + 200;
    const end = await waitFor(() => a.ends[0], 5000, "dungeonEnd no_entry");
    expect(end.reason).toBe("no_entry");
    expect(runs().size).toBe(0);
    await waitFor(async () => (await dungeonRooms()).length === 0, 5000, "phòng bí cảnh bị đóng");
  });
});

describe("kết thúc và về Lạc Hà", () => {
  it("hết giờ: `dungeonEnd timeout`, rồi mọi người được đưa về Lạc Hà (travelTo không roomId); hồ sơ ở Lạc Hà; run và phòng được dọn", async () => {
    const { a, b, run } = await setupRun();
    a.room.send(DUNGEON_MSG.enter, { runId: run.id });
    const ra = await followTravel(a, await waitFor(() => a.travels[0], 5000));
    b.room.send(DUNGEON_MSG.enter, { runId: run.id });
    const rb = await followTravel(b, await waitFor(() => b.travels[0], 5000));
    expect(rb.roomId).toBe(ra.roomId);
    (run as { deadline: number }).deadline = Date.now() + 100; // hết giờ ngay
    const ea = await waitFor(() => a.ends[0], 5000, "dungeonEnd");
    expect(ea).toMatchObject({ result: "lost", reason: "timeout" });
    expect(b.ends[0]?.reason).toBe("timeout");
    (run as { exitAt: number | null }).exitAt = Date.now(); // bỏ chờ 3 giây
    const ta = await waitFor(() => a.travels[0], 5000, "về Lạc Hà");
    const tb = await waitFor(() => b.travels[0], 5000, "về Lạc Hà");
    expect(ta).toEqual({ mapId: DEFAULT_MAP_ID });
    expect(tb).toEqual({ mapId: DEFAULT_MAP_ID });
    expect(saveOf(a.name)).toMatchObject({ mapId: DEFAULT_MAP_ID });
    expect(runs().size).toBe(0);
    // vào lại Lạc Hà bình thường (không bị báo sai bản đồ)
    const again = await new Client(`ws://localhost:${PORT}`).joinOrCreate(
      roomNameOf(DEFAULT_MAP_ID),
      {
        name: a.name,
        secret: a.secret,
      },
    );
    rooms.push(again);
    expect(serverRoom(again).mapId).toBe(DEFAULT_MAP_ID);
    await waitFor(async () => (await dungeonRooms()).length === 0, 5000, "phòng bí cảnh bị đóng");
  });

  it("`dungeonLeave`: về Lạc Hà ngay; người cuối cùng rời thì `all_left`, run được dọn", async () => {
    const { a, b, run } = await setupRun();
    a.room.send(DUNGEON_MSG.enter, { runId: run.id });
    const ra = await followTravel(a, await waitFor(() => a.travels[0], 5000));
    b.room.send(DUNGEON_MSG.enter, { runId: run.id });
    const rb = await followTravel(b, await waitFor(() => b.travels[0], 5000));
    ra.send(DUNGEON_MSG.leave, {});
    expect(await waitFor(() => a.travels[0], 5000, "A về Lạc Hà")).toEqual({
      mapId: DEFAULT_MAP_ID,
    });
    expect(run.members.get(a.name.toLowerCase())!.status).toBe("left");
    expect(run.phase).toBe("running"); // B còn ở trong
    expect(serverState(rb).players.size).toBe(1);
    rb.send(DUNGEON_MSG.leave, {});
    expect(await waitFor(() => b.travels[0], 5000, "B về Lạc Hà")).toEqual({
      mapId: DEFAULT_MAP_ID,
    });
    await waitFor(() => runs().size === 0, 5000, "run được dọn");
    await waitFor(async () => (await dungeonRooms()).length === 0, 5000, "phòng bí cảnh bị đóng");
  });
});

describe("không bao giờ kẹt trong bí cảnh", () => {
  it("mất kết nối giữa run (thoát đột ngột): rời run ngay, hồ sơ ghi bản đồ Lạc Hà không toạ độ bí cảnh, KHÔNG có hồn lìa xác ghi đè sau này; đăng nhập lại vào thẳng Lạc Hà", async () => {
    const { a, b, run } = await setupRun();
    a.room.send(DUNGEON_MSG.enter, { runId: run.id });
    const ra = await followTravel(a, await waitFor(() => a.travels[0], 5000));
    b.room.send(DUNGEON_MSG.enter, { runId: run.id });
    const rb = await followTravel(b, await waitFor(() => b.travels[0], 5000));
    // lưu định kỳ trong lúc đang ở sâu trong bí cảnh: vị trí ở bí cảnh KHÔNG được ghi
    const sp = serverState(ra).players.get(ra.sessionId)!;
    sp.x = 1500;
    sp.y = 300; // xa cổng vào
    await (serverRoom(ra) as any).saveAll();
    const mid = saveOf(a.name);
    expect(mid.mapId).toBe(DEFAULT_MAP_ID);
    expect(mid.x).toBeUndefined();
    expect(mid.y).toBeUndefined();
    // A rớt mạng (đóng không báo trước, như mất mạng): rời run ngay, không giữ chỗ chờ nối lại
    (ra.connection.transport as any).ws.close();
    rooms.splice(rooms.indexOf(ra), 1);
    await waitFor(
      () => run.members.get(a.name.toLowerCase())!.status === "left",
      4000,
      "A rời run",
    );
    expect(serverState(rb).players.size).toBe(1);
    expect(run.phase).toBe("running"); // B còn ở trong: run tiếp tục
    // đăng nhập lại NGAY (không bị 409 "đang ở trong game") vào Lạc Hà; chơi tiếp mà không bị hồ sơ cũ đè sau này
    const again = await new Client(`ws://localhost:${PORT}`).joinOrCreate(
      roomNameOf(DEFAULT_MAP_ID),
      {
        name: a.name,
        secret: a.secret,
      },
    );
    rooms.push(again);
    expect(serverRoom(again).mapId).toBe(DEFAULT_MAP_ID);
    const live = serverState(again).players.get(again.sessionId)!;
    live.exp = 4242; // tiến triển mới trong Lạc Hà
    await sleep(600);
    await (serverRoom(again) as any).saveAll();
    expect(saveOf(a.name)).toMatchObject({ mapId: DEFAULT_MAP_ID, exp: 4242 });
    // "giết tiến trình": B cũng bị ngắt, run và phòng bị xoá như khi server chết -> B đăng nhập lại về Lạc Hà
    runs().clear();
    (rb.connection.transport as any).ws.close();
    rooms.splice(rooms.indexOf(rb), 1);
    await sleep(300);
    const backB = await new Client(`ws://localhost:${PORT}`).joinOrCreate(
      roomNameOf(DEFAULT_MAP_ID),
      {
        name: b.name,
        secret: b.secret,
      },
    );
    rooms.push(backB);
    expect(serverRoom(backB).mapId).toBe(DEFAULT_MAP_ID);
    // hồ sơ của A không bị ghi đè lại sau đó (không có hồn lìa xác ở phòng bí cảnh)
    await sleep(500);
    expect(saveOf(a.name).exp).toBe(4242);
  });

  it("file lưu mang mapId bí cảnh (lỗi / sửa tay): đăng nhập vào Lạc Hà, không bị đưa tới phòng bí cảnh không tồn tại", async () => {
    const a = await spawn();
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    const f = readdirSync(dataDir)
      .filter((x) => x.endsWith(".json"))
      .map((x) => path.join(dataDir, x))
      .find((x) => JSON.parse(readFileSync(x, "utf8")).name === a.name)!;
    writeFileSync(
      f,
      JSON.stringify({ ...JSON.parse(readFileSync(f, "utf8")), mapId: LINH_HU_MAP_ID }),
    );
    const back = await new Client(`ws://localhost:${PORT}`).joinOrCreate(
      roomNameOf(DEFAULT_MAP_ID),
      {
        name: a.name,
        secret: a.secret,
      },
    );
    rooms.push(back);
    expect(serverRoom(back).mapId).toBe(DEFAULT_MAP_ID);
  });
});
