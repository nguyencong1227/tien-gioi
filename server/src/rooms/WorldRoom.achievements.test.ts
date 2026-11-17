// Thành tựu + danh hiệu qua phòng thật (M9.5 #1024): bộ đếm -> cấp thành tựu + Duyên NGUYÊN TỬ với lần ghi, báo chủ, danh hiệu (`titleSet`, `Player.title`), mặc định TẮT, cấp bù khi bật.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
  roomNameOf,
  type AchievementsMsg,
} from "@tien-gioi/shared";
import { listenWithRetry } from "../test-port";
import { trackSocial } from "../systems/social";
import { soulIdOf } from "../soul";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-ach-"));
let PORT = 0;
let server: Server;
let WorldRoomCls: typeof import("./WorldRoom").WorldRoom;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const mod = await import("./WorldRoom");
  WorldRoomCls = mod.WorldRoom;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
});
afterEach(async () => {
  WorldRoomCls.achievements = false;
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
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(20);
  }
}
const serverRoom = (room: Room) =>
  matchMaker.getLocalRoomById(room.roomId) as unknown as {
    world: import("../world").World;
    souls: import("../soul").SoulStore;
    state: import("../schema").WorldState;
  };

interface Hero {
  name: string;
  room: Room;
  ach: AchievementsMsg[];
  news: string[];
  toasts: string[];
}
let seq = 0;
async function spawn(name = `Thanh Tuu ${++seq}`): Promise<Hero> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    v: PROTOCOL_VERSION,
    name,
    secret: `secret-${name.replace(/\s/g, "")}-0123456789abcdef`,
  });
  rooms.push(room);
  const h: Hero = { name, room, ach: [], news: [], toasts: [] };
  room.onMessage(SOCIAL_MSG.achievements, (m: AchievementsMsg) => h.ach.push(m));
  room.onMessage(SOCIAL_MSG.achievementNew, (m: { id: string }) => h.news.push(m.id));
  room.onMessage("toast", (m: { text: string }) => h.toasts.push(m.text));
  for (const t of ["inv", "wallet", "quests", "dialog", "chat", "fx", "dmg", "soul", "party"])
    room.onMessage(t, () => {});
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "vào phòng");
  return h;
}
const key = (h: Hero) => soulIdOf(h.name);
const me = (h: Hero) => serverRoom(h.room).state.players.get(h.room.sessionId)!;
const soulOf = (h: Hero) => serverRoom(h.room).souls.get(key(h));
async function until<T>(
  fn: () => Promise<T | undefined | false>,
  ms = 4000,
  what = "điều kiện",
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(40);
  }
}

describe("thành tựu qua phòng thật", () => {
  it("MẶC ĐỊNH TẮT: bộ đếm vẫn ghi vào chân linh nhưng không cấp thành tựu / Duyên / tin; BẬT thì thành tựu đến hạn được CẤP BÙ ở lần ghi kế", async () => {
    const h = await spawn();
    expect(WorldRoomCls.achievements).toBe(false);
    trackSocial(serverRoom(h.room).world, h.room.sessionId, ["boss:mang", 1]);
    const s1 = await until(
      async () => {
        const s = await soulOf(h);
        return s?.social?.counters["boss:mang"] === 1 ? s : undefined;
      },
      4000,
      "bộ đếm được ghi",
    );
    expect(s1.social!.ach).toEqual({}); // không cấp
    await sleep(150);
    expect(h.news).toEqual([]);
    // bật: lần ghi kế cấp bù thành tựu đã đến hạn (trum_mang_1)
    WorldRoomCls.achievements = true;
    trackSocial(serverRoom(h.room).world, h.room.sessionId, ["pk_won", 1]);
    await waitFor(() => h.news.includes("trum_mang_1"), 4000, "cấp bù");
    const s2 = (await soulOf(h))!;
    expect(Object.keys(s2.social!.ach)).toContain("trum_mang_1");
  });

  it("bật: đạt thành tựu -> CẤP + cộng Duyên cùng một lần ghi, báo chủ (achievementNew, toast, achievements), chỉ chủ nhận", async () => {
    WorldRoomCls.achievements = true;
    const a = await spawn();
    const b = await spawn();
    const duyenBefore = (await soulOf(a))!.duyen;
    trackSocial(serverRoom(a.room).world, a.room.sessionId, ["kiep", 2]);
    await waitFor(() => a.news.includes("kiep_2"), 4000, "achievementNew");
    const msg = await waitFor(() => a.ach.find((m) => m.ach.kiep_2), 3000, "achievements");
    expect(msg.counters.kiep).toBe(2);
    expect(a.toasts.some((t) => t.includes("Đạt thành tựu"))).toBe(true);
    const s = (await soulOf(a))!;
    expect(s.social!.ach.kiep_2).toBeTruthy();
    expect(s.duyen).toBe(duyenBefore + 2); // thưởng Duyên của kiep_2
    expect(s.duyenTotal).toBeGreaterThanOrEqual(s.duyen);
    await sleep(200);
    expect(b.news).toEqual([]); // người khác không nhận
    // idempotent: ghi lại cùng mốc không cấp / cộng Duyên lần nữa
    trackSocial(serverRoom(a.room).world, a.room.sessionId, ["kiep", 2], ["pk_won", 1]);
    await until(
      async () => ((await soulOf(a))?.social?.counters.pk_won === 1 ? true : undefined),
      4000,
      "ghi lần hai",
    );
    expect((await soulOf(a))!.duyen).toBe(duyenBefore + 2);
    expect(a.news.filter((x) => x === "kiep_2").length).toBe(1);
  });

  it("danh hiệu: đeo cái ĐÃ MỞ -> Player.title đổi, achievements có title; cái CHƯA mở bị từ chối (vẫn trả achievements); gỡ bằng null; vào lại nhận danh hiệu đang đeo", async () => {
    WorldRoomCls.achievements = true;
    const h = await spawn();
    trackSocial(serverRoom(h.room).world, h.room.sessionId, ["boss:mang", 1]);
    await waitFor(() => h.news.includes("trum_mang_1"), 4000, "mở tr1");
    expect(me(h).title).toBe("");
    const n0 = h.ach.length;
    h.room.send(SOCIAL_MSG.titleSet, { id: "lh2" }); // chưa mở
    await waitFor(() => h.ach.length > n0, 3000, "trả lời titleSet bị từ chối");
    expect(h.ach.at(-1)!.title).toBeNull();
    expect(me(h).title).toBe("");
    h.room.send(SOCIAL_MSG.titleSet, { id: "tr1" }); // đã mở
    await waitFor(() => me(h).title === "tr1", 3000, "Player.title");
    expect(h.ach.at(-1)!.title).toBe("tr1");
    expect((await soulOf(h))!.social!.title).toBe("tr1");
    // tin rác: bỏ, không trả lời, không đổi
    const n1 = h.ach.length;
    for (const bad of [{ id: 5 }, { id: "TOO-LONG-ID" }, "tr1", null, {}])
      h.room.send(SOCIAL_MSG.titleSet, bad as never);
    await sleep(500);
    expect(h.ach.length).toBe(n1);
    expect(me(h).title).toBe("tr1");
    // vào lại: nhận danh hiệu đang đeo
    const name = h.name;
    await h.room.leave(true);
    rooms.splice(rooms.indexOf(h.room), 1);
    await sleep(300);
    const again = await spawn(name);
    await waitFor(() => me(again).title === "tr1", 3000, "danh hiệu sau khi vào lại");
    again.room.send(SOCIAL_MSG.titleSet, { id: null });
    await waitFor(() => me(again).title === "", 3000, "gỡ danh hiệu");
    expect((await soulOf(again))!.social!.title).toBeNull();
  });

  it("achievementsGet: trả sổ hiện tại cho chủ; chân linh cũ có kiếp >= 2 được cấp thành tựu ngay lần VÀO đầu tiên khi bật", async () => {
    WorldRoomCls.achievements = true;
    const name = `Kiep Cu ${++seq}`;
    const first = await spawn(name);
    await serverRoom(first.room).souls.update(soulIdOf(name), (s) => ({ ...s, kiep: 3 }));
    await first.room.leave(true);
    rooms.splice(rooms.indexOf(first.room), 1);
    await sleep(300);
    const h = await spawn(name);
    await waitFor(() => h.news.includes("kiep_2"), 4000, "cấp bù khi vào");
    h.room.send(SOCIAL_MSG.achievementsGet, {});
    const m = await waitFor(() => h.ach.at(-1), 3000, "achievements");
    expect(m.ach.kiep_2).toBeTruthy();
    expect(m.counters.kiep).toBe(3);
  });
});
