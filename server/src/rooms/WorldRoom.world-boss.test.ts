// Trùm thế giới theo giờ qua phòng Colyseus THẬT (M9.4 #1023): nối tin `worldBossGet` / `worldBoss` với client, vòng lặp tick gọi bộ lập lịch, thưởng khi hạ.
// Đồng hồ: chỉ giả `Date` (vitest `toFake: ["Date"]`), các bộ hẹn giờ vẫn thật nên máy chủ chạy bình thường; nhảy giờ để tới 12:00 mà không phải chờ.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  PROTOCOL_VERSION,
  SOCIAL_MSG,
  WORLD_BOSS_TZ_OFFSET_MS,
  roomNameOf,
  type WorldBossMsg,
  type WorldBossSlot,
} from "@tien-gioi/shared";
import { listenWithRetry } from "../test-port";
import { dealMonsterDamage } from "../systems/combat";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-wboss-"));
let PORT = 0;
let server: Server;
let WorldRoomCls: typeof import("./WorldRoom").WorldRoom;
let ensureWorldBossRooms: typeof import("./WorldRoom").ensureWorldBossRooms;
const rooms: Room[] = [];

/** 00:00 giờ máy chủ (UTC+7) của một ngày TƯƠNG LAI XA (18/11/2036): đồng hồ GIẢ phải luôn SAU đồng hồ thật, vì sổ trùm coi giờ lùi là "đồng hồ đi lùi" và lỡ giờ (đặt ngày 18/11/2026 thì test đỏ từ lúc đồng hồ thật qua giờ giả, 18/11/2026 ~04:50 UTC, làm CI mọi PR đỏ). */
const DAY0 = Date.UTC(2036, 10, 18) - WORLD_BOSS_TZ_OFFSET_MS;
const at = (h: number, m = 0, s = 0) => DAY0 + ((h * 60 + m) * 60 + s) * 1000;

/** Khung giờ thử: Xích Mãng (có bộ chiêu) ở Lạc Hà Trấn, 12:00, 30 phút. */
const SLOT: WorldBossSlot = {
  id: "thu_trua",
  hour: 12,
  minute: 0,
  boss: "mang",
  mapId: DEFAULT_MAP_ID,
  durationMin: 30,
  announceMin: [10, 5, 1],
  reward: { exp: 10, coin: 100 },
};

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const mod = await import("./WorldRoom");
  WorldRoomCls = mod.WorldRoom;
  ensureWorldBossRooms = mod.ensureWorldBossRooms;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
  // Lịch THẬT có khung 12:00 / 21:00 và sổ mặc định TẮT: tệp này tự bật sổ và dùng lịch RỖNG cho tới khi từng ca đặt khung của nó (afterEach đưa về rỗng)
  WorldRoomCls.hub.worldBoss.slots = [];
  WorldRoomCls.hub.worldBoss.enabled = true;
});
afterEach(async () => {
  vi.useRealTimers();
  WorldRoomCls.hub.worldBoss.slots = [];
  // Sổ nhớ mốc làm việc cuối (đồng hồ GIẢ của ca trước): ca sau đặt giờ sớm hơn thì sổ coi là "đồng hồ đi lùi" và lỡ giờ bắt đầu. Đặt lại cho mỗi ca.
  (WorldRoomCls.hub.worldBoss as unknown as { lastTickMs: number | null }).lastTickMs = null;
  WorldRoomCls.hub.worldBoss.current = null;
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(100);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(
  fn: () => T | undefined | false,
  ms = 4000,
  what = "điều kiện",
): Promise<T> {
  // Sàn hạn chờ (#1215): 4 giây / 100-200 vòng là mức máy rảnh; máy tải cao / cả bộ `npm test` làm tick của máy chủ tới muộn. Chờ theo ĐIỀU KIỆN nên nâng sàn không làm test chậm đi khi điều kiện tới đúng hạn.
  const end = Date.now() + Math.max(ms, WAIT_FLOOR_MS);
  let left = Math.max(budget, WAIT_FLOOR_ROUNDS);
  for (;;) {
    const v = fn();
    if (v) return v;
    // `Date` có thể đang bị giả (đứng yên): đếm thời gian chờ theo số vòng thay vì đồng hồ
    if (--left <= 0 || (!fake && Date.now() > end)) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(20);
  }
}
const WAIT_FLOOR_MS = 12_000;
const WAIT_FLOOR_ROUNDS = 600; // ~12 giây với nhịp 20 ms
let budget = 0;
let fake = false;
const serverRoom = (room: Room) =>
  matchMaker.getLocalRoomById(room.roomId) as unknown as {
    world: import("../world").World;
    state: import("../schema").WorldState;
  };

interface Hero {
  name: string;
  room: Room;
  msgs: WorldBossMsg[];
}
let seq = 0;
async function spawn(name = `Trum The Gioi ${++seq}`): Promise<Hero> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    v: PROTOCOL_VERSION,
    name,
    secret: `secret-${name.replace(/\s/g, "")}-0123456789abcdef`,
  });
  rooms.push(room);
  const h: Hero = { name, room, msgs: [] };
  room.onMessage(SOCIAL_MSG.worldBoss, (m: WorldBossMsg) => h.msgs.push(m));
  for (const t of [
    "inv",
    "wallet",
    "quests",
    "dialog",
    "chat",
    "fx",
    "dmg",
    "soul",
    "party",
    "toast",
  ])
    room.onMessage(t, () => {});
  budget = 200;
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "vào phòng");
  return h;
}

/** Đặt giờ giả cho `Date` rồi chờ vài nhịp tick của máy chủ (50 ms mỗi tick: `world.now` lấy từ `Date.now()` giả). */
async function setClock(ms: number) {
  vi.setSystemTime(ms);
  await sleep(160);
}

/** Cho giờ giả CHẠY tiếp `ms` (bước 250 ms mỗi 60 ms thật): bộ lập lịch cần đồng hồ nhích tới mới gửi bảng. */
async function advance(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    vi.setSystemTime(Date.now() + 250);
    await sleep(60);
  }
}

describe("trùm thế giới qua phòng thật", () => {
  it("không có lịch: `worldBossGet` trả `none`; có lịch: trả lần sắp tới (thời gian tương đối)", async () => {
    const h = await spawn();
    h.room.send(SOCIAL_MSG.worldBossGet, {});
    budget = 200;
    const none = await waitFor(() => h.msgs.at(-1), 4000, "tin none");
    expect(none).toEqual({ phase: "none", id: "", name: "", mapId: "" });

    WorldRoomCls.hub.worldBoss.slots = [SLOT];
    vi.useFakeTimers({ toFake: ["Date"], now: at(11, 0) });
    fake = true;
    try {
      await sleep(160); // để vài tick cập nhật `world.now` theo giờ giả
      h.msgs.length = 0;
      h.room.send(SOCIAL_MSG.worldBossGet, {});
      budget = 200;
      const soon = await waitFor(() => h.msgs.at(-1), 4000, "tin soon");
      expect(soon).toMatchObject({ phase: "soon", id: "thu_trua", mapId: DEFAULT_MAP_ID });
      expect(soon.startsInMs).toBeGreaterThan(59 * 60_000);
      expect(soon.startsInMs).toBeLessThanOrEqual(60 * 60_000);
    } finally {
      fake = false;
    }
  });

  it("tới giờ: báo trước, sinh trùm ở phòng, bảng đóng góp tới người trong phòng; hạ được thì thưởng vào ví và tin `ended` kèm `reward`", async () => {
    WorldRoomCls.hub.worldBoss.slots = [SLOT];
    const h = await spawn();
    const world = serverRoom(h.room).world;
    const sid = h.room.sessionId;
    vi.useFakeTimers({ toFake: ["Date"], now: at(11, 58, 30) });
    fake = true;
    try {
      await sleep(200); // bộ lập lịch ghi mốc đầu tiên (giờ giả 11:58:30)
      await setClock(at(11, 59, 5)); // lọt qua mốc báo trước 1 phút (11:59:00)
      budget = 100;
      await waitFor(
        () => h.msgs.some((m) => m.phase === "soon" && Math.round(m.startsInMs! / 60_000) === 1),
        4000,
        "báo trước 1 phút",
      );
      await setClock(at(12, 0, 1));
      budget = 100;
      await waitFor(() => world.wbossId !== null, 4000, "trùm sinh ra");
      await advance(1000); // bảng đóng góp đầu tiên gửi ở nhịp sau lúc sinh
      const id = world.wbossId!;
      expect(world.state.monsters.get(id)?.kind).toBe("mang");
      expect(world.mctrl.get(id)?.wboss).toBe(true);
      budget = 100;
      const board = await waitFor(
        () => h.msgs.find((m) => m.phase === "live" && m.top !== undefined),
        4000,
        "bảng đóng góp",
      );
      expect(board.mine).toEqual({ pts: 0, pct: 0, eligible: false });
      expect(board.hpPct).toBe(100);

      // hạ trùm bằng một đòn (cổng sát thương chung): người duy nhất đóng góp, đủ ngưỡng
      const coin0 = world.ctrl.get(sid)!.coin;
      const mon = world.state.monsters.get(id)!;
      dealMonsterDamage(world, id, mon, sid, mon.maxHp * 2, false);
      budget = 100;
      const ended = await waitFor(() => h.msgs.find((m) => m.phase === "ended"), 4000, "tin ended");
      expect(ended.outcome).toBe("killed");
      expect(ended.reward).toMatchObject({ coin: 100 });
      expect(world.ctrl.get(sid)!.coin).toBe(coin0 + 100);
      expect(world.wbossId).toBeNull();
      expect(WorldRoomCls.hub.worldBoss.current).toBeNull();
    } finally {
      fake = false;
    }
  });
  it("nối lại sau rớt mạng: Room MỚI nhận lại trạng thái trùm thế giới (không lỡ sự kiện đã bắt đầu lúc rớt)", async () => {
    WorldRoomCls.hub.worldBoss.slots = [SLOT];
    const h = await spawn();
    const world = serverRoom(h.room).world;
    vi.useFakeTimers({ toFake: ["Date"], now: at(11, 59, 50) });
    fake = true;
    try {
      await sleep(200);
      // rớt mạng TRƯỚC giờ: sự kiện bắt đầu khi người chơi đang là hồn lìa xác
      (h.room.connection.transport as any).ws.close();
      budget = 200;
      await waitFor(() => !h.room.connection.isOpen, 4000, "socket đóng");
      await waitFor(
        () => (serverRoom(h.room) as any).ghosts.has(h.room.sessionId),
        4000,
        "thành hồn lìa xác",
      );
      await setClock(at(12, 0, 1));
      budget = 100;
      await waitFor(() => world.wbossId !== null, 4000, "trùm sinh ra lúc rớt mạng");
      const r2 = await new Client(`ws://localhost:${PORT}`).reconnect(h.room.reconnectionToken);
      rooms.push(r2);
      const got: WorldBossMsg[] = [];
      r2.onMessage(SOCIAL_MSG.worldBoss, (m: WorldBossMsg) => got.push(m));
      for (const t of [
        "inv",
        "wallet",
        "quests",
        "dialog",
        "chat",
        "fx",
        "dmg",
        "soul",
        "party",
        "toast",
        "skills",
        "status",
      ])
        r2.onMessage(t, () => {});
      budget = 200;
      const live = await waitFor(
        () => got.find((m) => m.phase === "live"),
        4000,
        "nhận LẠI tin live sau nối lại",
      );
      expect(live).toMatchObject({ id: "thu_trua", mapId: DEFAULT_MAP_ID });
    } finally {
      fake = false;
    }
  }, 25_000);

  it("`ensureWorldBossRooms`: bản đồ có trùm trong lịch mà chưa ai vào vẫn có phòng sẵn (để sinh trùm); gọi lại không tạo thêm; không có lịch thì không tạo", async () => {
    const roomsOf = (mapId: string) =>
      [...WorldRoomCls.hub.worlds].filter((w) => w.map.def.id === mapId && w.runId === null);
    const MAP = "hac_phong";
    expect(roomsOf(MAP)).toHaveLength(0); // chưa ai vào
    await ensureWorldBossRooms();
    expect(roomsOf(MAP)).toHaveLength(0); // không có lịch: không làm gì
    WorldRoomCls.hub.worldBoss.slots = [{ ...SLOT, mapId: MAP }];
    await ensureWorldBossRooms();
    expect(roomsOf(MAP)).toHaveLength(1);
    await ensureWorldBossRooms();
    expect(roomsOf(MAP)).toHaveLength(1); // gọi lại: không tạo thêm
  });
});
