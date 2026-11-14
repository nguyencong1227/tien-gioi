// Phòng thật + kho PostgreSQL (pg-mem), M3 bước 3e-2: đường lưu / nạp nhân vật và chân linh khi vào / ra phòng chạy qua
// `Pg*Store` (không qua tệp). Hai chế độ vào phòng: tài khoản (token) và chế độ cũ (tên + mã bí mật).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { DEFAULT_MAP_ID, newSoul, roomNameOf } from "@tien-gioi/shared";
import { newDb } from "pg-mem";
import type { WorldRoom } from "./WorldRoom";
import type { Stores } from "../stores";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-pgroom-"));
import { listenWithRetry } from "../test-port";

// cổng do hệ điều hành cấp ở beforeAll (`listenWithRetry`): tự động thử lại nếu gặp EADDRINUSE giữa các tệp chạy song song
let PORT = 0;
let server: Server;
let WorldRoomClass: typeof WorldRoom;
let stores: Stores;
let auth: import("../auth-service").AuthService;
let characters: import("../character-service").CharacterService;
let soulIdOf: (n: string) => string;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir; // nếu có gì lọt sang bản file, nó nằm ở đây và test phát hiện được
  const { WorldRoom, defineRooms } = await import("./WorldRoom");
  const { createStores } = await import("../stores");
  const { AuthService } = await import("../auth-service");
  const { CharacterService } = await import("../character-service");
  const { hashSecretScrypt, verifyScrypt, needsRehash } = await import("../auth");
  soulIdOf = (await import("../soul")).soulIdOf;
  const { Pool } = newDb().adapters.createPg();
  stores = await createStores({ STORE: "pg" }, { db: new Pool() as never });
  WorldRoomClass = WorldRoom;
  WorldRoom.players = stores.players;
  WorldRoom.souls = stores.souls;
  const cheap = { N: 1 << 10, r: 8, p: 1 };
  const dummy = hashSecretScrypt("x", cheap);
  auth = new AuthService({
    accounts: stores.accounts,
    sessions: stores.sessions,
    kdf: {
      hash: (s) => hashSecretScrypt(s, cheap),
      verify: verifyScrypt,
      dummy: () => dummy,
      needsRehash: (h) => needsRehash(h, cheap),
    },
  });
  characters = new CharacterService({
    auth,
    accounts: stores.accounts,
    players: stores.players,
    souls: stores.souls,
  });
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  WorldRoomClass.auth = null;
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(100);
});

afterAll(async () => {
  WorldRoomClass.players = null;
  WorldRoomClass.souls = null;
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(
  fn: () => T | undefined | false | Promise<T | undefined | false>,
  ms = 3000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("Hết thời gian chờ điều kiện");
    await sleep(20);
  }
}
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;

async function join(options: Record<string, unknown>) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(
    roomNameOf(DEFAULT_MAP_ID),
    options,
  );
  for (const t of [
    "inv",
    "quests",
    "wallet",
    "soul",
    "chat",
    "toast",
    "fx",
    "dmg",
    "party",
    "limbo",
  ])
    room.onMessage(t, () => {});
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  return { room, me: () => (room.state as any).players.get(room.sessionId) };
}
const filesInDataDir = () =>
  readdirSync(dataDir, { recursive: true } as never) as unknown as string[];

describe("phòng thật trên kho PostgreSQL (pg-mem)", () => {
  it("chế độ cũ (tên + mã bí mật): nhân vật mới vào được, thoát thì LƯU VÀO DB, vào lại giữ tu vi và chân linh; KHÔNG có tệp nào trong DATA_DIR", async () => {
    const name = "Thu Pg Cu";
    const opts = { name, secret: "0123456789abcdef0123456789abcdef" };
    const j = await join(opts);
    (serverRoom(j.room).state as any).players.get(j.room.sessionId).exp = 88;
    await j.room.leave(true);
    await waitFor(async () => (await stores.players.load(name))?.exp === 88);
    expect((await stores.souls.get(soulIdOf(name)))?.kiep).toBe(1);
    const again = await join(opts);
    expect(again.me().exp).toBe(88);
    expect(filesInDataDir().filter((f) => f.endsWith(".json"))).toEqual([]);
  });

  it("chế độ tài khoản (token): đăng ký -> đạo hiệu -> vào -> lưu -> vào lại; chân linh khoá theo accountId nằm trong DB", async () => {
    const r = await auth.register("10.0.0.1", {
      username: "pg_tai_khoan",
      password: "mat-khau-dai-du",
    });
    if (!r.ok) throw new Error(r.error);
    expect((await characters.create(r.value.token, { name: "Pg Tai Khoan" })).ok).toBe(true);
    WorldRoomClass.auth = auth;
    const j = await join({ token: r.value.token });
    (serverRoom(j.room).state as any).players.get(j.room.sessionId).exp = 41;
    await j.room.leave(true);
    await waitFor(async () => (await stores.players.load("Pg Tai Khoan"))?.exp === 41);
    const acc = (await stores.accounts.byUsername("pg_tai_khoan"))!;
    expect((await stores.souls.get(acc.id))?.id).toBe(acc.id);
    expect((await join({ token: r.value.token })).me().exp).toBe(41);
    expect(filesInDataDir().filter((f) => f.endsWith(".json"))).toEqual([]);
  });

  it("nhận nhân vật cũ về tài khoản: chân linh theo tên (Duyên, Kiếp) chuyển sang accountId trong DB, vào phòng thấy đúng", async () => {
    const name = "Co Nhan Pg";
    const secret = "fedcba9876543210fedcba9876543210";
    await stores.players.save({
      name,
      secretHash: createHash("sha256").update(secret).digest("hex"),
      realm: 1,
      tier: 2,
      exp: 9,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await stores.souls.create(soulIdOf(name), (s) => ({
      ...newSoul(s.id, s.createdAt),
      duyen: 33,
      kiep: 4,
    }));
    const r = await auth.register("10.0.0.2", {
      username: "pg_nhan_cu",
      password: "mat-khau-dai-du",
    });
    if (!r.ok) throw new Error(r.error);
    expect((await characters.claim("10.0.0.2", r.value.token, { name, secret })).ok).toBe(true);
    WorldRoomClass.auth = auth;
    const j = await join({ token: r.value.token });
    expect([j.me().realm, j.me().tier, j.me().name]).toEqual([1, 2, name]);
    const acc = (await stores.accounts.byUsername("pg_nhan_cu"))!;
    const soul = serverRoom(j.room) && (await stores.souls.get(acc.id));
    expect([soul?.duyen, soul?.kiep]).toEqual([33, 4]);
  });
});
