// Test tích hợp Tông môn (M3.6 bước 6c): server Colyseus thật, client colyseus.js như client thật. Lập (mất phí) -> mời người Ở PHÒNG
// KHÁC -> nhận -> chat /s xuyên phòng -> góp / rút kho (ví + hồ sơ + tệp tông môn) -> thoát và vào lại (theo linh hồn) -> giải tán.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  SECT_CREATE_COST,
  SECT_MSG,
  getMap,
  roomNameOf,
  type ChatOut,
  type SectInvitedMsg,
  type SectMsg,
  type SectPresenceMsg,
  type ToastMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-room-"));
const PORT = 52000 + Math.floor(Math.random() * 3000);
let server: Server;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir; // store.ts / sect-store.ts đọc biến này lúc dùng
  const { defineRooms } = await import("./WorldRoom");
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
  fn: () => T | undefined | false,
  ms = 5000,
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
let seq = 0;
const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const worldOf = (room: Room) => (serverRoom(room) as any).world;

interface Hero {
  name: string;
  room: Room;
  snaps: SectMsg[];
  presences: SectPresenceMsg[];
  invited: SectInvitedMsg[];
  chats: ChatOut[];
  toasts: string[];
}

function listen(room: Room, h: Hero) {
  room.onMessage(SECT_MSG.snapshot, (m: SectMsg) => h.snaps.push(m));
  room.onMessage(SECT_MSG.presence, (m: SectPresenceMsg) => h.presences.push(m));
  room.onMessage(SECT_MSG.invited, (m: SectInvitedMsg) => h.invited.push(m));
  room.onMessage("chat", (m: ChatOut) => h.chats.push(m));
  room.onMessage("toast", (m: ToastMsg) => h.toasts.push(m.text));
  for (const t of ["inv", "wallet", "quests", "dialog", "fx", "dmg", "soul", "party"])
    room.onMessage(t, () => {});
}

async function join(name: string, roomName: string): Promise<Hero> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomName, {
    name,
    secret: secretOf(name),
  });
  rooms.push(room);
  const h: Hero = { name, room, snaps: [], presences: [], invited: [], chats: [], toasts: [] };
  listen(room, h);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "vào phòng");
  const w = worldOf(room);
  w.state.monsters.clear(); // không để quái hoang làm phiền
  w.mctrl.clear();
  return h;
}

const ctrlOf = (h: Hero) => worldOf(h.room).ctrl.get(h.room.sessionId);
const playerOf = (h: Hero) => serverState(h.room).players.get(h.room.sessionId)!;
const lastSnap = (h: Hero) => h.snaps.at(-1)?.sect;

/** Hồ sơ trong thư mục dữ liệu (tên nhân vật). */
const saveOf = (name: string) => {
  const f = readdirSync(dataDir)
    .filter((x) => x.endsWith(".json"))
    .find((x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name);
  return f ? JSON.parse(readFileSync(path.join(dataDir, f), "utf8")) : undefined;
};
const sectFiles = () =>
  existsSync(path.join(dataDir, "sects"))
    ? readdirSync(path.join(dataDir, "sects")).filter((f) => f.endsWith(".json"))
    : [];

/** Nhân vật ở Hắc Phong Cốc: tạo ở Lạc Hà rồi sửa hồ sơ sang bản đồ đó (như đã đi qua cổng), vào phòng của bản đồ đó. */
async function joinIn(name: string, mapId: string): Promise<Hero> {
  const first = await join(name, roomNameOf(DEFAULT_MAP_ID));
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
  return join(name, roomNameOf(mapId));
}

describe("tông môn: luồng đầy đủ", () => {
  it("lập (mất phí, lưu hồ sơ) -> mời người ở phòng khác -> nhận -> chat /s xuyên phòng -> góp / rút -> thoát và vào lại vẫn ở tông môn -> giải tán", async () => {
    const A = await join(`Tong Chu ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const B = await joinIn(`De Tu ${++seq}`, HAC_PHONG_ID);
    ctrlOf(A).coin = 3000;
    ctrlOf(B).coin = 500;

    // Lập
    A.room.send(SECT_MSG.create, { name: "Thanh Van Mon", tag: "TV" });
    const s0 = await waitFor(() => lastSnap(A), 5000, "ảnh chụp của Tông chủ");
    expect(s0).toMatchObject({ name: "Thanh Van Mon", tag: "TV", myRank: "chu", coin: 0 });
    expect(ctrlOf(A).coin).toBe(3000 - SECT_CREATE_COST);
    expect(playerOf(A).sect).toBe("TV");
    expect(saveOf(A.name).coin).toBe(3000 - SECT_CREATE_COST); // phí đã xuống hồ sơ
    expect(sectFiles()).toHaveLength(1);

    // Mời người ở Hắc Phong Cốc, nhận
    A.room.send(SECT_MSG.invite, { name: B.name });
    const inv = await waitFor(() => B.invited[0], 4000, "lời mời");
    expect(inv).toMatchObject({ from: A.name, sect: "Thanh Van Mon", tag: "TV" });
    B.room.send(SECT_MSG.accept, { from: A.name });
    await waitFor(() => lastSnap(B)?.myRank === "de_tu", 4000, "B vào tông môn");
    await waitFor(() => lastSnap(A)?.members.length === 2, 4000, "A thấy B");
    expect(playerOf(B).sect).toBe("TV");

    // Chat /s tới người ở phòng khác; chat thường không lẫn kênh
    A.room.send("chat", { text: "/s Hom nay san boss" });
    const got = await waitFor(() => B.chats.find((c) => c.channel === "sect"), 4000, "chat /s");
    expect(got).toEqual({ from: A.name, text: "Hom nay san boss", channel: "sect" });
    await waitFor(
      () => A.chats.some((c) => c.channel === "sect"),
      4000,
      "A cũng nhận chat /s của mình",
    );

    // Góp (đệ tử) và rút (Tông chủ)
    B.room.send(SECT_MSG.deposit, { amount: 200 });
    await waitFor(() => lastSnap(A)?.coin === 200, 4000, "kho 200");
    expect(ctrlOf(B).coin).toBe(300);
    expect(saveOf(B.name).coin).toBe(300);
    expect(lastSnap(A)?.log[0]).toMatchObject({ name: B.name, kind: "deposit", amount: 200 });
    A.room.send(SECT_MSG.withdraw, { amount: 150 });
    await waitFor(() => lastSnap(A)?.coin === 50, 4000, "kho 50");
    expect(ctrlOf(A).coin).toBe(3000 - SECT_CREATE_COST + 150);
    expect(saveOf(A.name).coin).toBe(3000 - SECT_CREATE_COST + 150);
    // Tổng Linh thạch (ví A + ví B + kho) chỉ giảm đúng phí lập
    expect(ctrlOf(A).coin + ctrlOf(B).coin + 50).toBe(3500 - SECT_CREATE_COST);
    // tệp tông môn phản ánh kho
    const file = JSON.parse(readFileSync(path.join(dataDir, "sects", sectFiles()[0]), "utf8"));
    expect(file.coin).toBe(50);
    expect(file.members).toHaveLength(2);

    // B thoát hẳn rồi vào lại phòng: vẫn ở tông môn (theo linh hồn), nhận ảnh chụp, biệt hiệu hiện lại
    await B.room.leave(true);
    rooms.splice(rooms.indexOf(B.room), 1);
    await sleep(200);
    const B2 = await join(B.name, roomNameOf(HAC_PHONG_ID));
    await waitFor(() => lastSnap(B2)?.myRank === "de_tu", 5000, "B vào lại vẫn ở tông môn");
    expect(lastSnap(B2)?.coin).toBe(50);
    await waitFor(() => playerOf(B2).sect === "TV", 4000, "biệt hiệu hiện lại");

    // Giải tán: phải rút hết kho trước
    A.room.send(SECT_MSG.disband, {});
    await waitFor(() => A.toasts.some((t) => /rút hết/.test(t)), 4000, "bị chặn vì kho còn tiền");
    expect(sectFiles()).toHaveLength(1);
    A.room.send(SECT_MSG.withdraw, { amount: 50 });
    await waitFor(() => lastSnap(A)?.coin === 0, 4000, "kho rỗng");
    A.room.send(SECT_MSG.disband, {});
    await waitFor(() => lastSnap(A) === null && lastSnap(B2) === null, 5000, "giải tán");
    expect(playerOf(A).sect).toBe("");
    expect(playerOf(B2).sect).toBe("");
    expect(sectFiles()).toEqual([]);
  }, 40_000);

  it("hồ sơ không lưu được lúc này (đang qua cổng / đĩa lỗi): lập và góp bị huỷ và HOÀN ví, đĩa không đổi; rút bị từ chối sớm (không nhân đôi, không mất)", async () => {
    const A = await join(`Tong Chu ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    ctrlOf(A).coin = 3000;
    const trucTrac = (h: Hero) => h.toasts.filter((t) => /trục trặc/.test(t)).length;

    // Lập khi đang qua cổng: `persist` bỏ qua nên KHÔNG được coi là đã lưu -> huỷ, hoàn phí, không có tệp tông môn
    ctrlOf(A).travelling = true;
    A.room.send(SECT_MSG.create, { name: "Thanh Van Mon", tag: "TV" });
    await waitFor(() => trucTrac(A) === 1, 4000, "bị từ chối vì đang qua cổng");
    expect(ctrlOf(A).coin).toBe(3000);
    expect(sectFiles()).toEqual([]);
    ctrlOf(A).travelling = false;

    // Lập khi ghi hồ sơ lỗi (đĩa / DB): huỷ, hoàn phí
    const players = (serverRoom(A.room) as any).players;
    const realSave = players.save;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    players.save = async () => {
      throw new Error("đĩa lỗi (mô phỏng)");
    };
    A.room.send(SECT_MSG.create, { name: "Thanh Van Mon", tag: "TV" });
    await waitFor(() => trucTrac(A) === 2, 4000, "bị từ chối vì lưu lỗi");
    expect(ctrlOf(A).coin).toBe(3000);
    expect(sectFiles()).toEqual([]);
    players.save = realSave;
    log.mockRestore();

    // Đĩa lành lại: lập được; hồ sơ trên đĩa đã trừ phí
    A.room.send(SECT_MSG.create, { name: "Thanh Van Mon", tag: "TV" });
    await waitFor(() => lastSnap(A), 5000, "lập được khi đĩa lành");
    const after = 3000 - SECT_CREATE_COST;
    expect(ctrlOf(A).coin).toBe(after);
    expect(saveOf(A.name).coin).toBe(after);

    // Góp khi ghi hồ sơ lỗi: huỷ, hoàn ví, kho nguyên; đĩa không đổi (không có "ví cũ + kho mới")
    players.save = async () => {
      throw new Error("đĩa lỗi (mô phỏng)");
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    A.room.send(SECT_MSG.deposit, { amount: 300 });
    await waitFor(() => trucTrac(A) === 3, 4000, "góp bị từ chối vì lưu lỗi");
    expect(ctrlOf(A).coin).toBe(after);
    expect(lastSnap(A)?.coin).toBe(0);
    players.save = realSave;
    quiet.mockRestore();
    expect(saveOf(A.name).coin).toBe(after);
    expect(JSON.parse(readFileSync(path.join(dataDir, "sects", sectFiles()[0]), "utf8")).coin).toBe(
      0,
    );

    // Góp khi đang qua cổng: huỷ, hoàn ví; rút khi đang qua cổng: từ chối sớm (kho nguyên)
    ctrlOf(A).travelling = true;
    A.room.send(SECT_MSG.deposit, { amount: 300 });
    await waitFor(() => trucTrac(A) === 4, 4000, "góp bị từ chối khi qua cổng");
    expect(ctrlOf(A).coin).toBe(after);
    A.room.send(SECT_MSG.withdraw, { amount: 1 });
    await waitFor(() => trucTrac(A) === 5, 4000, "rút bị từ chối khi qua cổng");
    ctrlOf(A).travelling = false;

    // Hết qua cổng: góp được, đĩa đủ cả hai phía
    A.room.send(SECT_MSG.deposit, { amount: 300 });
    await waitFor(() => lastSnap(A)?.coin === 300, 4000, "góp được");
    expect(saveOf(A.name).coin).toBe(after - 300);
    expect(JSON.parse(readFileSync(path.join(dataDir, "sects", sectFiles()[0]), "utf8")).coin).toBe(
      300,
    );
  }, 30_000);

  it("tin rác và quá quyền không phá gì: Đệ tử mời / rút / giải tán / mời ra bị từ chối; client không thể tự đặt chức vụ Tông chủ", async () => {
    const A = await join(`Tong Chu ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const C = await join(`Khach ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    ctrlOf(A).coin = 2000;
    A.room.send(SECT_MSG.create, { name: "Hac Long", tag: "HL" });
    await waitFor(() => lastSnap(A), 5000, "lập");
    A.room.send(SECT_MSG.invite, { name: C.name });
    await waitFor(() => C.invited[0], 4000, "lời mời");
    C.room.send(SECT_MSG.accept, { from: A.name });
    await waitFor(() => lastSnap(C)?.myRank === "de_tu", 4000, "C vào");
    for (const [type, body] of [
      [SECT_MSG.withdraw, { amount: 1 }],
      [SECT_MSG.disband, {}],
      [SECT_MSG.kick, { name: A.name }],
      [SECT_MSG.rank, { name: C.name, rank: "chu" }],
      [SECT_MSG.rank, { name: A.name, rank: "de_tu" }],
      [SECT_MSG.transfer, { name: C.name }],
      [SECT_MSG.motd, { motd: "hack" }],
      [SECT_MSG.invite, { name: A.name }],
      [SECT_MSG.deposit, { amount: -5 }],
      [SECT_MSG.deposit, { amount: "9999" }],
      [SECT_MSG.create, { name: "x", tag: "y" }],
      [SECT_MSG.kick, null],
      [SECT_MSG.accept, 42],
    ] as const) {
      C.room.send(type, body);
    }
    await sleep(600);
    expect(lastSnap(A)).toMatchObject({
      myRank: "chu",
      members: [
        { name: A.name, rank: "chu" },
        { name: C.name, rank: "de_tu" },
      ],
      motd: "",
    });
    expect(lastSnap(A)?.coin).toBe(0);
    expect(ctrlOf(C).coin).toBe(0);
  }, 30_000);
});
