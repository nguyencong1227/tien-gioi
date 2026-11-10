// Vào phòng bằng TOKEN (AUTH_MODE=account, M3 bước 3c-4): server Colyseus thật + AuthService / CharacterService thật
// trên kho file trong thư mục tạm; client colyseus.js như thật. Chế độ cũ (tên + mã bí mật) có test riêng ở WorldRoom.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  JOIN_BAD_TOKEN,
  JOIN_NEED_CHARACTER,
  JOIN_WRONG_MAP,
  newSoul,
  parseWrongMap,
  roomNameOf,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { AuthService } from "../auth-service";
import type { CharacterService } from "../character-service";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-acc-room-"));
const PORT = 46000 + Math.floor(Math.random() * 3000);
let server: Server;
let WorldRoomClass: typeof WorldRoom;
let auth: AuthService;
let characters: CharacterService;
let stores: typeof import("../store");
let souls: ReturnType<typeof import("../soul").defaultSoulStore>;
let soulIdOf: typeof import("../soul").soulIdOf;
let accountStore: import("../account-store").AccountStore;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir; // store.ts đọc biến này lúc nạp module
  const { WorldRoom, defineRooms } = await import("./WorldRoom");
  const { AuthService } = await import("../auth-service");
  const { CharacterService } = await import("../character-service");
  const { FileAccountStore, FileSessionStore } = await import("../account-store");
  const { hashSecretScrypt, verifyScrypt, needsRehash } = await import("../auth");
  const soul = await import("../soul");
  const { defaultPlayerStore } = await import("../player-store");
  stores = await import("../store");
  souls = soul.defaultSoulStore();
  soulIdOf = soul.soulIdOf;
  WorldRoomClass = WorldRoom;
  accountStore = new FileAccountStore(path.join(dataDir, "accounts"));
  const cheap = { N: 1 << 10, r: 8, p: 1 };
  const dummy = hashSecretScrypt("x", cheap);
  auth = new AuthService({
    accounts: accountStore,
    sessions: new FileSessionStore(path.join(dataDir, "sessions")),
    kdf: {
      hash: (s) => hashSecretScrypt(s, cheap),
      verify: verifyScrypt,
      dummy: () => dummy,
      needsRehash: (h) => needsRehash(h, cheap),
    },
  });
  characters = new CharacterService({
    auth,
    accounts: accountStore,
    players: defaultPlayerStore(),
    souls,
  });
  WorldRoom.auth = auth;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  await server.listen(PORT);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(100);
});

afterAll(async () => {
  WorldRoomClass.auth = null;
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => T | undefined | false, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("Hết thời gian chờ điều kiện");
    await sleep(20);
  }
}

let seq = 0;
const PW = "mat-khau-dai-du";
/** Đăng ký một tài khoản thật qua AuthService; `name` có thì chọn luôn đạo hiệu. */
async function account(name?: string) {
  const username = `nguoi_${++seq}_${Date.now() % 100000}`;
  const r = await auth.register(`10.0.${seq >> 8}.${seq & 255}`, { username, password: PW });
  if (!r.ok) throw new Error(`đăng ký lỗi ${r.error}`);
  const me = (await accountStore.byUsername(username))!;
  if (name) {
    const c = await characters.create(r.value.token, { name });
    if (!c.ok) throw new Error(`chọn đạo hiệu lỗi ${c.error}`);
  }
  return { token: r.value.token, id: me.id, username };
}

const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
/** `World` của phòng (thuộc tính private của WorldRoom): test đọc để kiểm danh tính / chân linh. */
const worldOf = (room: Room) => (serverRoom(room) as any).world as import("../world").World;

async function joinWith(options: Record<string, unknown>, roomName = roomNameOf(DEFAULT_MAP_ID)) {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomName, options);
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
async function joinError(options: Record<string, unknown>, roomName = roomNameOf(DEFAULT_MAP_ID)) {
  const client = new Client(`ws://localhost:${PORT}`);
  try {
    await client.joinOrCreate(roomName, options);
  } catch (e: any) {
    return { code: e.code as number, message: String(e.message) };
  }
  throw new Error("Đáng ra phải bị từ chối");
}
const playerFiles = () =>
  readdirSync(dataDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dataDir, f), "utf8")));

describe("vào phòng bằng token", () => {
  it("không token / token sai / token rác: JOIN_BAD_TOKEN; name + secret bị BỎ QUA (không vào được bằng đường cũ, không tạo hồ sơ)", async () => {
    for (const opts of [
      {},
      { token: "" },
      { token: "a".repeat(43) },
      { token: 12345 },
      { token: "../../x" },
      { name: "Ke Gian Nhap", secret: "0123456789abcdef0123456789abcdef" },
    ]) {
      const e = await joinError(opts);
      expect(e.code, JSON.stringify(opts)).toBe(JOIN_BAD_TOKEN);
    }
    expect(playerFiles().some((p) => p.name === "Ke Gian Nhap")).toBe(false);
  });

  it("tài khoản chưa có đạo hiệu: JOIN_NEED_CHARACTER; chọn đạo hiệu xong vào được, hồ sơ mới được tạo ở bản đồ mặc định", async () => {
    const a = await account();
    expect((await joinError({ token: a.token })).code).toBe(JOIN_NEED_CHARACTER);
    expect((await characters.create(a.token, { name: "Thanh Phong Tu" })).ok).toBe(true);
    const j = await joinWith({ token: a.token });
    expect(j.me().name).toBe("Thanh Phong Tu");
    const ctrl = worldOf(j.room).ctrl.get(j.room.sessionId)!;
    expect(ctrl.identity).toEqual({
      name: "Thanh Phong Tu",
      soulKey: a.id,
      accountId: a.id,
    });
    expect(ctrl.soul.id).toBe(a.id);
    const save = playerFiles().find((p) => p.name === "Thanh Phong Tu")!;
    expect(save.realm).toBe(0);
    // mã bí mật của hồ sơ tài khoản là băm ngẫu nhiên: không trùng băm của mã nào đoán được
    expect(save.secretHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hồ sơ của tài khoản có mã bí mật ngẫu nhiên: mỗi hồ sơ một băm khác nhau, không phải băm của chuỗi rỗng / đoán được", async () => {
    const a = await account("Ngau Nhien Mot");
    const b = await account("Ngau Nhien Hai");
    await joinWith({ token: a.token });
    await joinWith({ token: b.token });
    const [x, y] = ["Ngau Nhien Mot", "Ngau Nhien Hai"].map(
      (n) => playerFiles().find((p) => p.name === n).secretHash as string,
    );
    expect(x).not.toBe(y);
    for (const h of [x, y]) {
      expect(h).not.toBe(stores.hashSecret(""));
      expect(h).not.toBe(stores.hashSecret("Ngau Nhien Mot"));
    }
  });

  it("name / secret / mapId của client không đổi được đạo hiệu hay danh tính: luôn lấy từ tài khoản", async () => {
    const a = await account("Van Du Tien");
    const j = await joinWith({
      token: a.token,
      name: "Ten Gia Mao",
      secret: "x".repeat(32),
      mapId: HAC_PHONG_ID,
    });
    expect(j.me().name).toBe("Van Du Tien");
    expect(worldOf(j.room).ctrl.get(j.room.sessionId)!.identity.accountId).toBe(a.id);
  });

  it("một tài khoản một chỗ: vào lần hai khi đang kết nối thật bị từ chối 409", async () => {
    const a = await account("Doc Hanh Khach");
    await joinWith({ token: a.token });
    const e = await joinError({ token: a.token });
    expect(e.code).toBe(409);
    expect(e.message).toContain("đang ở trong game");
  });

  it("rớt mạng rồi đăng nhập lại (mất token nối lại): chính chủ huỷ chờ và vào được, chỉ còn một nhân vật của tài khoản", async () => {
    const a = await account("Hoi Lai Nguoi");
    const first = await joinWith({ token: a.token });
    const sid1 = first.room.sessionId;
    (first.room.connection.transport as any).ws.close(); // rớt mạng bất thường
    await waitFor(() => worldOf(first.room).ghosts.has(sid1));
    const second = await joinWith({ token: a.token });
    expect(second.me().name).toBe("Hoi Lai Nguoi");
    const w = worldOf(second.room);
    expect(w.ghosts.has(sid1)).toBe(false);
    expect([...w.ctrl.values()].filter((c) => c.identity.accountId === a.id)).toHaveLength(1);
  });

  it("đăng xuất / hết phiên: token bị thu hồi thì không vào được nữa", async () => {
    const a = await account("Thoat Phien");
    await joinWith({ token: a.token }).then((j) => j.room.leave(true));
    await sleep(150);
    await auth.logout(a.token);
    expect((await joinError({ token: a.token })).code).toBe(JOIN_BAD_TOKEN);
  });

  it("tiến trình được lưu theo tài khoản: thoát rồi vào lại giữ tu vi; chân linh khoá theo accountId", async () => {
    const a = await account("Giu Tu Vi");
    const j = await joinWith({ token: a.token });
    (serverRoom(j.room).state as any).players.get(j.room.sessionId).exp = 77;
    await j.room.leave(true);
    await waitFor(() => stores.loadPlayer("Giu Tu Vi").then((s) => s?.exp === 77));
    const again = await joinWith({ token: a.token });
    expect(again.me().exp).toBe(77);
    expect((await souls.get(a.id))?.id).toBe(a.id);
  });

  it("nhân vật đang ở bản đồ khác: JOIN_WRONG_MAP báo bản đồ đúng", async () => {
    const a = await account("Hac Phong Khach");
    await joinWith({ token: a.token }).then((j) => j.room.leave(true));
    await sleep(150);
    const save = (await stores.loadPlayer("Hac Phong Khach"))!;
    await stores.savePlayer({ ...save, mapId: HAC_PHONG_ID });
    const e = await joinError({ token: a.token });
    expect(e.code).toBe(JOIN_WRONG_MAP);
    expect(parseWrongMap(e.code, e.message)).toBe(HAC_PHONG_ID);
  });
});

describe("nhận lại nhân vật cũ rồi vào phòng", () => {
  const SECRET = "0123456789abcdef0123456789abcdef";

  it("nhân vật cũ (tên + mã bí mật) và chân linh theo tên về đúng tài khoản; vào phòng giữ cảnh giới và Duyên", async () => {
    const name = "Co Nhan Cu";
    await stores.savePlayer({
      name,
      secretHash: stores.hashSecret(SECRET),
      realm: 1,
      tier: 3,
      exp: 500,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await souls.create(soulIdOf(name), (s) => ({
      ...newSoul(s.id, s.createdAt),
      duyen: 42,
      kiep: 3,
    }));
    const a = await account();
    expect((await characters.claim("1.1.1.1", a.token, { name, secret: SECRET })).ok).toBe(true);
    const j = await joinWith({ token: a.token });
    expect([j.me().realm, j.me().tier, j.me().name]).toEqual([1, 3, name]);
    const soul = worldOf(j.room).ctrl.get(j.room.sessionId)!.soul;
    expect([soul.id, soul.duyen, soul.kiep]).toEqual([a.id, 42, 3]);
    expect((await souls.get(soulIdOf(name)))?.duyen).toBe(42); // chân linh cũ theo tên vẫn nguyên (không xoá nguồn)
  });
});
