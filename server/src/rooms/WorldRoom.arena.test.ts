// Đấu trường chặn đường trên máy chủ Colyseus THẬT (mục 52, CD3 #1063): "Chiến" -> vé -> phòng đấu trường solo -> trận (thắng / bỏ chạy / thoát) -> về CHỖ CŨ.
// `AMBUSH=on`, bảng cảnh + bầy nhỏ tiêm vào phòng (dữ liệu thật của `shared/` còn RỖNG), xúc xắc tiêm `random` = 0. Đường mạng thật: `ambushOffer` -> `ambushChoose fight` -> `travelTo` ->
// `joinById` vào đấu trường -> `ambushState` / `ambushEnd` -> `travelTo` về chỗ cũ. Hồ sơ trên đĩa LUÔN ghi chỗ cũ (không kẹt khi sập / rớt mạng giữa trận).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  AMBUSH_ARM_MS,
  AMBUSH_EXIT_MS,
  AMBUSH_MSG,
  DEFAULT_MAP_ID,
  PROTOCOL_VERSION,
  arenaMapIdOf,
  roomNameOf,
  type AmbushEndMsg,
  type AmbushFoeGroup,
  type AmbushOfferMsg,
  type AmbushScene,
  type AmbushStateMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";
import { listenWithRetry } from "../test-port";
import { ambushOf, rollAmbush } from "../systems/ambush";
import { killMonster } from "../systems/combat";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-arena-room-"));

let PORT = 0;
let server: Server;
let loadPlayer: typeof import("../store").loadPlayer;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  process.env.AMBUSH = "on";
  const mod = await import("./WorldRoom");
  ({ loadPlayer } = await import("../store"));
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(200);
});

afterAll(async () => {
  delete process.env.AMBUSH;
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

const SCENE: AmbushScene = {
  id: "canh_thu",
  text: "Đường qua {dia_danh} bỗng vắng hẳn, {ke_dich} lao ra chắn trước mặt.",
  mapIds: [DEFAULT_MAP_ID],
  tiers: ["normal"],
  source: "test",
};
const FOE: AmbushFoeGroup = {
  id: "bay_thuong",
  name: "Sói Hoang",
  mapId: DEFAULT_MAP_ID,
  minStep: 0,
  maxStep: 100,
  tier: "normal",
  foes: [{ kind: "tho", count: 2 }],
};

interface Hero {
  name: string;
  room: Room;
  offers: AmbushOfferMsg[];
  ends: AmbushEndMsg[];
  states: AmbushStateMsg[];
  travel: { mapId: string; roomId?: string }[];
}

function listen(room: Room, h: Hero) {
  room.onMessage(AMBUSH_MSG.offer, (m: AmbushOfferMsg) => h.offers.push(m));
  room.onMessage(AMBUSH_MSG.end, (m: AmbushEndMsg) => h.ends.push(m));
  room.onMessage(AMBUSH_MSG.state, (m: AmbushStateMsg) => h.states.push(m));
  room.onMessage("travelTo", (m: { mapId: string; roomId?: string }) => h.travel.push(m));
  for (const t of [
    "chat",
    "toast",
    "fx",
    "dmg",
    "party",
    "partyInvited",
    "dialog",
    "inv",
    "wallet",
    "quests",
    "skills",
    "status",
    "sect",
    "sectVault",
    "sectPresence",
    "soul",
  ])
    room.onMessage(t, () => {});
}

async function join(h: Hero, roomIdOrName: string, byId: boolean) {
  const client = new Client(`ws://localhost:${PORT}`);
  const opts = { v: PROTOCOL_VERSION, name: h.name, secret: secretOf(h.name) };
  const room = byId
    ? await client.joinById(roomIdOrName, opts)
    : await client.joinOrCreate(roomIdOrName, opts);
  h.room = room;
  listen(room, h);
  rooms.push(room);
  await waitFor(
    () => (room.state as any)?.players?.get(room.sessionId),
    4000,
    "player state đồng bộ",
  );
}

async function spawn(prefix: string): Promise<Hero> {
  const name = `${prefix} ${++seq}`;
  const h: Hero = { name, room: undefined as never, offers: [], ends: [], states: [], travel: [] };
  await join(h, roomNameOf(DEFAULT_MAP_ID), false);
  return h;
}

/** Chuẩn bị bị chặn được ngay ở phòng thường (bảng cảnh + bầy nhỏ, xúc xắc luôn trúng, dọn quái, ra ngoài trấn, có tu vi + Linh thạch). */
function prime(h: Hero, opts: { coin?: number; exp?: number } = {}) {
  const w = worldOf(h.room);
  // Giữ nguyên runtime do WorldRoom dựng (đã gắn `startFight` mở đấu trường); chỉ tiêm xúc xắc + bảng nhỏ
  w.ambush.random = () => 0;
  w.ambush.scenes = [SCENE];
  w.ambush.foes = [FOE];
  const sid = h.room.sessionId;
  const p = serverState(h.room).players.get(sid)!;
  const c = w.ctrl.get(sid);
  p.x = w.map.townPx.x + w.map.townPx.r + 600;
  p.y = w.map.townPx.y;
  p.hp = p.maxHp;
  p.exp = opts.exp ?? 400;
  p.expMax = 1000;
  c.coin = opts.coin ?? 5000;
  ambushOf(w, c).cooldownUntil = 0;
  c.lastHitAt = 0;
  for (const id of [...w.mctrl.keys()]) {
    w.state.monsters.delete(id);
    w.mctrl.delete(id);
  }
  return { w, sid, p, c };
}

/** Bị chặn -> chọn Chiến -> nhận travelTo -> vào đấu trường bằng joinById. Trả anh hùng đã ở trong đấu trường. */
async function enterArena(prefix: string, opts: { coin?: number; exp?: number } = {}) {
  const h = await spawn(prefix);
  const env = prime(h, opts);
  expect(rollAmbush(env.w, env.sid, env.p, env.c)).toBe(true);
  const offer = await waitFor(() => h.offers[0], 3000, "nhận ambushOffer");
  h.room.send(AMBUSH_MSG.seen, { id: offer.id });
  await sleep(AMBUSH_ARM_MS + 80);
  h.room.send(AMBUSH_MSG.choose, { id: offer.id, choice: "fight" });
  const go = await waitFor(() => h.travel[0], 5000, "nhận travelTo vào đấu trường");
  expect(go.mapId).toBe(arenaMapIdOf(DEFAULT_MAP_ID));
  expect(typeof go.roomId).toBe("string");
  const origin = { x: env.p.x, y: env.p.y };
  h.travel.length = 0;
  await join(h, go.roomId!, true);
  return { h, origin, hub: env.w.hub, roomId: go.roomId! };
}

describe("Đấu trường chặn đường qua mạng (máy chủ Colyseus thật)", () => {
  it("Chiến: vé -> phòng đấu trường solo; hồ sơ ghi CHỖ CŨ (bản đồ thường + toạ độ), vào trận nhận ambushState, bầy trong state, quái đánh dấu `arena`", async () => {
    const { h, origin, hub } = await enterArena("Dau Truong");
    const w = worldOf(h.room);
    expect(w.arena).not.toBeNull();
    expect(w.map.def.id).toBe(arenaMapIdOf(DEFAULT_MAP_ID));
    expect(hub.ambushes.ofKey(h.name.toLowerCase())).toBeDefined();
    await waitFor(() => h.states[0], 3000, "nhận ambushState");
    expect(h.states[0]!.msLeft).toBeGreaterThan(100_000);
    expect(h.states[0]!.price.coin.price).toBeGreaterThan(0);
    expect(serverState(h.room).monsters.size).toBe(2);
    for (const mc of w.mctrl.values()) expect(mc.arena).toBe(true);
    // hồ sơ trên đĩa: CHỖ CŨ, không phải đấu trường
    const saved = await loadPlayer(h.name);
    expect(saved?.mapId).toBe(DEFAULT_MAP_ID);
    expect(Math.abs((saved?.x ?? 0) - origin.x)).toBeLessThan(3);
    expect(Math.abs((saved?.y ?? 0) - origin.y)).toBeLessThan(3);
    expect(saved?.ambushUntil).toBeGreaterThan(Date.now()); // hồi đã vào hồ sơ trước khi sang đấu trường
  }, 20_000);

  it("bỏ chạy giữa trận: trừ ĐÚNG giá chốt, hồ sơ đã lưu khi ambushEnd tới; rồi sau AMBUSH_EXIT_MS tự về CHỖ CŨ (travelTo bản đồ thường), vé được dọn", async () => {
    const { h, origin, hub } = await enterArena("Dau Chay");
    const w = worldOf(h.room);
    const sid = h.room.sessionId;
    await waitFor(() => h.states.at(-1), 3000, "nhận ambushState");
    const price = h.states.at(-1)!.price;
    h.room.send(AMBUSH_MSG.flee, { choice: "flee_coin" });
    const end = await waitFor(() => h.ends[0], 3000, "nhận ambushEnd");
    expect(end.result).toBe("fled");
    expect(end.paid?.coin).toBeGreaterThan(0);
    expect(end.paid!.coin!).toBeLessThanOrEqual(price.coin.price * 2); // đúng giá đã chốt gần nhất (làm mới mỗi giây)
    const saved = await loadPlayer(h.name);
    expect(saved?.coin).toBe(5000 - end.paid!.coin!);
    expect(saved?.mapId).toBe(DEFAULT_MAP_ID);
    // chưa tới giờ về: vẫn ở đấu trường
    expect(w.arena.phase).toBe("over");
    expect(h.travel).toHaveLength(0);
    const back = await waitFor(() => h.travel[0], AMBUSH_EXIT_MS + 4000, "travelTo về chỗ cũ");
    expect(back.mapId).toBe(DEFAULT_MAP_ID);
    expect(back.roomId).toBeUndefined();
    await waitFor(() => hub.ambushes.ofKey(h.name.toLowerCase()) === undefined, 3000, "dọn vé");
    // vào lại phòng thường: đúng chỗ cũ, tiền đã trừ
    await sleep(300);
    const again: Hero = {
      name: h.name,
      room: undefined as never,
      offers: [],
      ends: [],
      states: [],
      travel: [],
    };
    await join(again, roomNameOf(DEFAULT_MAP_ID), false);
    const p2 = serverState(again.room).players.get(again.room.sessionId)!;
    expect(Math.abs(p2.x - origin.x)).toBeLessThan(4);
    expect(Math.abs(p2.y - origin.y)).toBeLessThan(4);
    void sid;
  }, 30_000);

  it("thắng: hạ hết bầy -> ambushEnd won + thưởng (tu vi + Linh thạch cộng đúng số báo, hồ sơ đã lưu); quái chết KHÔNG tự cho tu vi; rồi về chỗ cũ", async () => {
    const { h, hub } = await enterArena("Dau Thang", { exp: 10 }); // dưới thanh tu vi thật (nhân vật mới: Phàm Nhân, thanh 40) để thưởng không làm lên bậc giữa phép đo
    const w = worldOf(h.room);
    const sid = h.room.sessionId;
    const p = serverState(h.room).players.get(sid)!;
    const c = w.ctrl.get(sid);
    await waitFor(() => h.states[0], 3000, "nhận ambushState");
    p.x += 100; // có hành động (không bị tính vắng mặt)
    await sleep(120);
    const exp0 = p.exp;
    const coin0 = c.coin;
    for (const id of [...w.mctrl.keys()]) {
      w.mctrl.get(id).damageBy.set(sid, 50);
      killMonster(w, id, w.mctrl.get(id));
    }
    expect(p.exp).toBe(exp0); // giết quái đấu trường không cho tu vi
    const end = await waitFor(() => h.ends[0], 3000, "nhận ambushEnd");
    expect(end.result).toBe("won");
    expect(end.rewards!.exp).toBeGreaterThan(0);
    expect(p.exp - exp0).toBe(end.rewards!.exp);
    expect(c.coin - coin0).toBe(end.rewards!.coin);
    const saved = await loadPlayer(h.name);
    expect(saved?.exp).toBe(Math.floor(p.exp));
    expect(saved?.mapId).toBe(DEFAULT_MAP_ID);
    const back = await waitFor(() => h.travel[0], AMBUSH_EXIT_MS + 4000, "travelTo về chỗ cũ");
    expect(back.mapId).toBe(DEFAULT_MAP_ID);
    await waitFor(() => hub.ambushes.ofKey(h.name.toLowerCase()) === undefined, 3000, "dọn vé");
  }, 30_000);

  it("thoát chủ động giữa trận = bỏ chạy bằng tu vi (giá giữa trận); hồ sơ ghi CHỖ CŨ + tu vi đã trừ; vé được dọn khi phòng đóng", async () => {
    const { h, hub } = await enterArena("Dau Thoat");
    const w = worldOf(h.room);
    const sid = h.room.sessionId;
    const p = serverState(h.room).players.get(sid)!;
    await waitFor(() => h.states[0], 3000, "nhận ambushState");
    p.x += 100;
    await sleep(1200); // qua một lần làm mới giá
    const chot = w.arena.price.exp;
    expect(chot).toBeGreaterThan(0);
    await h.room.leave(true);
    rooms.splice(rooms.indexOf(h.room), 1);
    await waitFor(() => !w.ctrl.has(sid), 4000, "rời phòng");
    const saved = await loadPlayer(h.name);
    expect(saved?.exp).toBe(400 - chot);
    expect(saved?.coin).toBe(5000);
    expect(saved?.mapId).toBe(DEFAULT_MAP_ID);
    await waitFor(
      () => hub.ambushes.ofKey(h.name.toLowerCase()) === undefined,
      4000,
      "dọn vé khi phòng đóng",
    );
  }, 20_000);

  it("trong lúc có vé: vào phòng thường bị 409 (không hai bản của một nhân vật); người KHÔNG có vé không vào được đấu trường", async () => {
    const { h, roomId } = await enterArena("Dau Hai Ban");
    const dup: Hero = {
      name: h.name,
      room: undefined as never,
      offers: [],
      ends: [],
      states: [],
      travel: [],
    };
    await expect(join(dup, roomNameOf(DEFAULT_MAP_ID), false)).rejects.toThrow(/đấu trường/);
    const other: Hero = {
      name: `Nguoi La ${++seq}`,
      room: undefined as never,
      offers: [],
      ends: [],
      states: [],
      travel: [],
    };
    // người lạ chưa có hồ sơ: tạo ở phòng thường rồi thử vào đấu trường bằng joinById
    await join(other, roomNameOf(DEFAULT_MAP_ID), false);
    await other.room.leave(true);
    rooms.splice(rooms.indexOf(other.room), 1);
    await expect(join(other, roomId, true)).rejects.toThrow();
  }, 20_000);

  it("về chỗ cũ: vé được dọn NGAY khi đã đưa đi (không đợi phòng đấu trường đóng), nên vào lại phòng thường liền không bị 409", async () => {
    const { h, hub } = await enterArena("Dau Ve Don");
    const sid = h.room.sessionId;
    await waitFor(() => h.states[0], 3000, "nhận ambushState");
    expect(hub.ambushes.ofKey(h.name.toLowerCase())).toBeDefined();
    await (serverRoom(h.room) as any).exitArenaRoom(sid);
    // ngay lúc `exitArenaRoom` trả về, phòng đấu trường còn chưa kịp đóng: vé đã phải biến mất
    expect(hub.ambushes.ofKey(h.name.toLowerCase())).toBeUndefined();
    const back = await waitFor(() => h.travel[0], 3000, "travelTo về chỗ cũ");
    expect(back.mapId).toBe(DEFAULT_MAP_ID);
    const again: Hero = {
      name: h.name,
      room: undefined as never,
      offers: [],
      ends: [],
      states: [],
      travel: [],
    };
    await join(again, roomNameOf(DEFAULT_MAP_ID), false); // không bị 409
  }, 20_000);

  it("rớt kết nối ngay sau khi chọn Chiến (trước khi được đưa sang): vé bị huỷ và dọn, không kẹt nhân vật ở phòng đấu trường vô chủ", async () => {
    const h = await spawn("Dau Rot");
    const env = prime(h);
    expect(rollAmbush(env.w, env.sid, env.p, env.c)).toBe(true);
    const offer = await waitFor(() => h.offers[0], 3000, "nhận ambushOffer");
    h.room.send(AMBUSH_MSG.seen, { id: offer.id });
    await sleep(AMBUSH_ARM_MS + 80);
    // Làm `persist` (lần lưu lúc chuyển phòng) chậm 400 ms để có cửa sổ chắc chắn: vé đã lập, người chơi rớt TRƯỚC khi `handOff` kiểm client
    const room = serverRoom(h.room) as any;
    const persist = room.persist.bind(room);
    room.persist = async (...args: unknown[]) => {
      await sleep(400);
      return persist(...args);
    };
    try {
      h.room.send(AMBUSH_MSG.choose, { id: offer.id, choice: "fight" });
      await waitFor(() => env.w.hub.ambushes.ofKey(h.name.toLowerCase()), 3000, "vé được lập");
      (h.room.connection.transport as any).ws.close(); // rớt NGAY: đã có vé nhưng chưa kịp đưa sang
      await waitFor(
        () => env.w.hub.ambushes.ofKey(h.name.toLowerCase()) === undefined,
        4000,
        "vé bị huỷ và dọn",
      );
    } finally {
      room.persist = persist;
    }
    expect(env.c.coin).toBe(5000); // không phạt
  }, 20_000);

  it("đầy MAX_AMBUSH_ROOMS: lựa chọn Chiến bị huỷ lặng lẽ (ambushEnd canceled), không phạt, không sang phòng nào", async () => {
    const h = await spawn("Dau Day");
    const env = prime(h);
    const { MAX_AMBUSH_ROOMS } = await import("@tien-gioi/shared");
    for (let i = 0; i < MAX_AMBUSH_ROOMS; i++)
      env.w.hub.ambushes._add({
        id: `${i}`.padStart(32, "f"),
        key: `kẻ_${i}`,
        name: `k${i}`,
        origin: { mapId: DEFAULT_MAP_ID, x: 1, y: 1 },
        group: FOE,
        tier: "normal",
        roomId: null,
        createdAt: 0,
        expiresAt: 1,
        ended: false,
      });
    try {
      expect(rollAmbush(env.w, env.sid, env.p, env.c)).toBe(true);
      const offer = await waitFor(() => h.offers[0], 3000, "nhận ambushOffer");
      h.room.send(AMBUSH_MSG.seen, { id: offer.id });
      await sleep(AMBUSH_ARM_MS + 80);
      h.room.send(AMBUSH_MSG.choose, { id: offer.id, choice: "fight" });
      const end = await waitFor(() => h.ends[0], 3000, "nhận ambushEnd canceled");
      expect(end).toEqual({ result: "canceled" });
      expect(h.travel).toHaveLength(0);
      expect(env.c.coin).toBe(5000);
    } finally {
      for (const t of [...env.w.hub.ambushes.all()]) env.w.hub.ambushes._remove(t);
    }
  }, 20_000);
});
