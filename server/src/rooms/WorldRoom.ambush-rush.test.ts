// Dồn MAX_AMBUSH_ROOMS + 4 (24) client cùng bị chặn đường (CD10b, Issue #1281, Refs #1070):
// Máy chủ Colyseus thật, kiểm tra trần 20 phòng đấu trường solo, 4 người vượt trần nhận ambushEnd canceled không phạt,
// 20 người vào đấu trường, đo tick p95 lúc 20 phòng cùng chạy, rồi bỏ chạy giữa trận đưa phòng về 0 và về đúng chỗ cũ.
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
  MAX_AMBUSH_ROOMS,
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

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-ambush-rush-"));

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
  await sleep(200);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WAIT_FLOOR_MS = 15_000;
async function waitFor<T>(
  fn: () => T | undefined | false | Promise<T | undefined | false>,
  ms = 8000,
  what = "điều kiện",
): Promise<T> {
  const end = Date.now() + Math.max(ms, WAIT_FLOOR_MS);
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ: ${what}`);
    await sleep(25);
  }
}

let seq = 0;
const secretOf = (name: string) => `secret-${name.replace(/\s/g, "")}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const worldOf = (room: Room) => (serverRoom(room) as any).world;

const SCENE: AmbushScene = {
  id: "canh_rush",
  text: "Đường qua {dia_danh} bỗng vắng hẳn, {ke_dich} lao ra chắn trước mặt.",
  mapIds: [DEFAULT_MAP_ID],
  tiers: ["normal"],
  source: "test",
};
const FOE: AmbushFoeGroup = {
  id: "bay_rush",
  name: "Sói Hoang Rush",
  mapId: DEFAULT_MAP_ID,
  minStep: 0,
  maxStep: 100,
  tier: "normal",
  foes: [{ kind: "tho", count: 1 }],
};

interface Hero {
  name: string;
  room: Room;
  offers: AmbushOfferMsg[];
  ends: AmbushEndMsg[];
  states: AmbushStateMsg[];
  travel: { mapId: string; roomId?: string }[];
  origin?: { x: number; y: number };
  initialCoin?: number;
  initialExp?: number;
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
    6000,
    `player state đồng bộ cho ${h.name}`,
  );
}

async function spawn(prefix: string): Promise<Hero> {
  const name = `${prefix} ${++seq}`;
  const h: Hero = { name, room: undefined as never, offers: [], ends: [], states: [], travel: [] };
  await join(h, roomNameOf(DEFAULT_MAP_ID), false);
  return h;
}

describe("WorldRoom ambush rush (CD10b, Issue #1281)", () => {
  it("dồn MAX_AMBUSH_ROOMS + 4 (24) client cùng bị chặn: đúng 20 phòng mở, 4 người bị huỷ lặng lẽ không phạt; 20 người kết thúc -> phòng về 0, về đúng chỗ cũ, hồ sơ sạch", async () => {
    const TOTAL = MAX_AMBUSH_ROOMS + 4; // 24 client
    expect(MAX_AMBUSH_ROOMS).toBe(20);

    // 1. Spawn cả 24 heroes vào bản đồ thường Lạc Hà
    const heroes: Hero[] = [];
    for (let i = 0; i < TOTAL; i++) {
      heroes.push(await spawn("RushBot"));
    }

    const w = worldOf(heroes[0].room);
    w.ambush.random = () => 0;
    w.ambush.scenes = [SCENE];
    w.ambush.foes = [FOE];

    // Dọn quái hoang để không ai bị đánh trúng trong lúc test
    for (const id of [...w.mctrl.keys()]) {
      w.state.monsters.delete(id);
      w.mctrl.delete(id);
    }

    // 2. Prime 24 heroes: đặt ngoài trấn, cấp tiền + tu vi, xoá cooldown
    for (let i = 0; i < TOTAL; i++) {
      const h = heroes[i];
      const sid = h.room.sessionId;
      const p = serverState(h.room).players.get(sid)!;
      const c = w.ctrl.get(sid);
      p.x = w.map.townPx.x + w.map.townPx.r + 600 + (i % 8) * 30;
      p.y = w.map.townPx.y + Math.floor(i / 8) * 30;
      p.hp = p.maxHp;
      p.exp = 400;
      p.expMax = 1000;
      c.coin = 5000;
      ambushOf(w, c).cooldownUntil = 0;
      c.lastHitAt = 0;
      h.origin = { x: p.x, y: p.y };
      h.initialCoin = c.coin;
      h.initialExp = p.exp;
    }

    // 3. Kích hoạt chặn đường đồng thời cho 24 người
    for (const h of heroes) {
      const sid = h.room.sessionId;
      const p = serverState(h.room).players.get(sid)!;
      const c = w.ctrl.get(sid);
      expect(rollAmbush(w, sid, p, c)).toBe(true);
    }

    await waitFor(
      () => heroes.every((h) => h.offers.length > 0),
      8000,
      "cả 24 người đều nhận ambushOffer",
    );

    // 4. Cả 24 người gửi seen, chờ arm time, rồi cùng chọn "fight"
    for (const h of heroes) {
      h.room.send(AMBUSH_MSG.seen, { id: h.offers[0].id });
    }
    // Chờ đồng hồ: thời gian kích hoạt chống bấm nhầm (AMBUSH_ARM_MS) trôi qua trước khi chọn Chiến
    await sleep(AMBUSH_ARM_MS + 80);

    for (const h of heroes) {
      h.room.send(AMBUSH_MSG.choose, { id: h.offers[0].id, choice: "fight" });
    }

    // 5. Chờ phản hồi: ĐÚNG 20 người nhận travelTo vào đấu trường, ĐÚNG 4 người nhận canceled
    await waitFor(
      () => {
        const travelCount = heroes.filter((h) => h.travel.length > 0).length;
        const cancelCount = heroes.filter((h) =>
          h.ends.some((e) => e.result === "canceled"),
        ).length;
        return travelCount === MAX_AMBUSH_ROOMS && cancelCount === 4;
      },
      10_000,
      `đúng 20 người nhận travelTo và 4 người nhận canceled`,
    );

    // Khẳng định sổ vé có đúng 20 phòng đấu trường
    expect(w.hub.ambushes.size).toBe(MAX_AMBUSH_ROOMS);

    // Kiểm tra 4 người bị hủy (canceled): không phạt, travel rỗng, ở nguyên phòng thường
    const canceledHeroes = heroes.filter((h) => h.ends.some((e) => e.result === "canceled"));
    expect(canceledHeroes).toHaveLength(4);
    for (const h of canceledHeroes) {
      expect(h.travel).toHaveLength(0);
      const sid = h.room.sessionId;
      const p = serverState(h.room).players.get(sid)!;
      const c = w.ctrl.get(sid);
      expect(c.coin).toBe(h.initialCoin);
      expect(p.exp).toBe(h.initialExp);
    }

    // 6. 20 người có vé tiến hành join vào phòng đấu trường solo tương ứng
    const fighters = heroes.filter((h) => h.travel.length > 0);
    expect(fighters).toHaveLength(MAX_AMBUSH_ROOMS);

    const arenaTargets = fighters.map((h) => ({
      h,
      roomId: h.travel[0].roomId!,
      mapId: h.travel[0].mapId,
    }));

    for (const target of arenaTargets) {
      expect(target.mapId).toBe(arenaMapIdOf(DEFAULT_MAP_ID));
      expect(typeof target.roomId).toBe("string");
    }

    await Promise.all(
      arenaTargets.map((t) => {
        t.h.travel.length = 0;
        return join(t.h, t.roomId, true);
      }),
    );

    // Chờ cả 20 người nhận ambushState trong phòng đấu trường
    await waitFor(
      () => fighters.every((h) => h.states.length > 0),
      10_000,
      "cả 20 đấu sĩ nhận ambushState trong đấu trường",
    );

    // Khẳng định đúng 20 phòng Colyseus đấu trường đang hoạt động (matchMaker.query)
    const activeRoomsBefore = await matchMaker.query({
      name: roomNameOf(arenaMapIdOf(DEFAULT_MAP_ID)),
    });
    expect(activeRoomsBefore).toHaveLength(MAX_AMBUSH_ROOMS);

    // 6b. GIỮA TRẬN: hồ sơ trên đĩa vẫn là CHỖ CŨ (bản đồ thường + toạ độ vé), cả khi chính phòng đấu trường tự lưu
    // (`persist` trong đấu trường: sập máy / rớt mạng giữa trận thì lần sau đăng nhập ở chỗ cũ, không kẹt ở đấu trường).
    // Chỉ kiểm hồ sơ SAU khi về thì bắt không được lỗi này vì lần lưu lúc về (`exitArenaRoom`) ghi đè hồ sơ giữa trận.
    for (const t of arenaTargets) {
      const sid = t.h.room.sessionId;
      expect(await worldOf(t.h.room).onSaveNow?.(sid)).toBe(true);
      const mid = await loadPlayer(t.h.name);
      expect(mid?.mapId).toBe(DEFAULT_MAP_ID);
      expect(Math.abs((mid?.x ?? 0) - t.h.origin!.x)).toBeLessThan(5);
      expect(Math.abs((mid?.y ?? 0) - t.h.origin!.y)).toBeLessThan(5);
    }

    // 7. Đo tick p95 lúc cả 20 phòng đấu trường cùng chạy
    // Chờ đồng hồ / ổn định đo đạc: 1,5 giây cho 20 phòng đấu trường chạy song song để mẫu tick ổn định trước khi lấy p95
    await sleep(1500);
    const p95List = arenaTargets.map((t) => {
      const aw = worldOf(t.h.room);
      return aw.tickStats.summary().p95;
    });
    const maxP95 = Math.max(...p95List);
    const avgP95 = p95List.reduce((a, b) => a + b, 0) / p95List.length;

    console.log(
      `[Đo tick 20 phòng đấu trường] p95 max: ${maxP95.toFixed(2)} ms, p95 avg: ${avgP95.toFixed(2)} ms`,
    );
    expect(avgP95).toBeLessThan(10);
    expect(maxP95).toBeLessThan(25); // Ngưỡng nới an toàn cho CI khi tải cao

    // 8. Cho cả 20 đấu sĩ bỏ chạy giữa trận (flee_coin)
    for (const h of fighters) {
      h.room.send(AMBUSH_MSG.flee, { choice: "flee_coin" });
    }

    // Chờ 20 người nhận ambushEnd fled
    await waitFor(
      () => fighters.every((h) => h.ends.some((e) => e.result === "fled")),
      8000,
      "cả 20 người nhận ambushEnd fled",
    );

    // Chờ 20 người nhận travelTo đưa về phòng gốc
    await waitFor(
      () => fighters.every((h) => h.travel.some((t) => t.mapId === DEFAULT_MAP_ID && !t.roomId)),
      AMBUSH_EXIT_MS + 8000,
      "cả 20 người nhận travelTo đưa về phòng gốc",
    );

    // Chờ sổ vé dọn sạch về 0
    await waitFor(() => w.hub.ambushes.size === 0, 6000, "sổ vé dọn về 0 phòng");
    expect(w.hub.ambushes.size).toBe(0);

    // Khẳng định toàn bộ phòng Colyseus đấu trường đã đóng hoàn toàn (matchMaker.query). KHÔNG khẳng định NGAY: vé được dọn trước khi
    // người chơi kịp rời phòng và Colyseus gỡ phòng khỏi danh sách (CI chạy chồng nhiều lần: một lần đỏ với 8 phòng còn `clients: 1`),
    // nên chờ THEO ĐIỀU KIỆN (có trần `WAIT_FLOOR_MS`); phòng rò thật thì hết hạn chờ vẫn đỏ.
    await waitFor(
      async () => {
        const active = await matchMaker.query({ name: roomNameOf(arenaMapIdOf(DEFAULT_MAP_ID)) });
        return active.length === 0 ? true : undefined;
      },
      WAIT_FLOOR_MS,
      "toàn bộ phòng Colyseus đấu trường đã đóng hoàn toàn",
    );

    // 9. Kiểm tra hồ sơ lưu trên đĩa của cả 24 người
    // 4 người canceled: lưu hồ sơ và khẳng định ở nguyên bản đồ gốc, tiền/tu vi bảo toàn
    for (const h of canceledHeroes) {
      await w.onSaveNow?.(h.room.sessionId);
      const saved = await loadPlayer(h.name);
      expect(saved?.mapId).toBe(DEFAULT_MAP_ID);
      expect(saved?.coin).toBe(h.initialCoin);
      expect(saved?.exp).toBe(h.initialExp);
    }

    // 20 người fighters đã bỏ chạy
    for (const h of fighters) {
      const saved = await loadPlayer(h.name);
      expect(saved?.mapId).toBe(DEFAULT_MAP_ID); // Không bao giờ lưu map đấu trường
      expect(Math.abs((saved?.x ?? 0) - h.origin!.x)).toBeLessThan(5); // Về đúng chỗ cũ
      expect(Math.abs((saved?.y ?? 0) - h.origin!.y)).toBeLessThan(5);
      const fledEnd = h.ends.find((e) => e.result === "fled");
      const paidCoin = fledEnd?.paid?.coin ?? 0;
      expect(paidCoin).toBeGreaterThan(0);
      expect(saved?.coin).toBe(h.initialCoin! - paidCoin); // Chỉ trừ đúng giá bỏ chạy
      expect(saved?.exp).toBe(h.initialExp); // Tu vi không đổi
    }
  }, 60_000);
});
