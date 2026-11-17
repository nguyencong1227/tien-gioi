// Tin `boardsGet` / `boards` qua phòng thật (M9.3 #1022): client hỏi bảng, server trả bản chụp trong bộ nhớ CHỈ cho người hỏi; tin rác bị bỏ; không có dịch vụ thì bảng trống.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  BOARD_IDS,
  DEFAULT_MAP_ID,
  PROTOCOL_VERSION,
  SOCIAL_MSG,
  roomNameOf,
  type BoardsMsg,
} from "@tien-gioi/shared";
import { listenWithRetry } from "../test-port";
import { LeaderboardService } from "../leaderboard";
import { soulIdOf } from "../soul";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-boards-"));
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
  WorldRoomCls.leaderboards = null;
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
let seq = 0;
async function spawn(): Promise<{ room: Room; name: string; boards: BoardsMsg[] }> {
  const name = `Xep Hang ${++seq}`;
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    v: PROTOCOL_VERSION,
    name,
    secret: `secret-${name.replace(/\s/g, "")}-0123456789abcdef`,
  });
  rooms.push(room);
  const h = { room, name, boards: [] as BoardsMsg[] };
  room.onMessage(SOCIAL_MSG.boards, (m: BoardsMsg) => h.boards.push(m));
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
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "vào phòng");
  return h;
}

function service(names: string[]): LeaderboardService {
  return new LeaderboardService({
    souls: { all: async () => [] } as never,
    players: {
      listProfiles: async () =>
        names.map((n, i) => ({ name: n, realm: 2, tier: 0, exp: 100 - i, limbo: false })),
    } as never,
    sects: { all: async () => [] } as never,
    testExp: () => new Map(),
  });
}

describe("boardsGet / boards qua phòng thật", () => {
  it("trả đúng bảng cho người hỏi (kèm hạng của chính họ), chỉ người hỏi nhận", async () => {
    const a = await spawn();
    const b = await spawn();
    const svc = service(["Nguoi Dau", a.name, "Nguoi Ba"]);
    await svc.refresh();
    WorldRoomCls.leaderboards = svc;
    a.room.send(SOCIAL_MSG.boardsGet, { board: "tuvi" });
    const m = await waitFor(() => a.boards[0], 3000, "tin boards");
    expect(m.board).toBe("tuvi");
    expect(m.rows.map((r) => r.name)).toEqual(["Nguoi Dau", a.name, "Nguoi Ba"]);
    expect(m.mine).toMatchObject({ rank: 2, row: { name: a.name } });
    expect(m.ageMs).toBeGreaterThanOrEqual(0);
    await sleep(200);
    expect(b.boards.length).toBe(0); // người khác không nhận
    // mỗi bảng đều trả lời được
    for (const board of BOARD_IDS) a.room.send(SOCIAL_MSG.boardsGet, { board });
    await waitFor(() => a.boards.length >= 1 + BOARD_IDS.length, 3000, "đủ bốn bảng");
    expect(
      a.boards
        .slice(1)
        .map((x) => x.board)
        .sort(),
    ).toEqual([...BOARD_IDS].sort());
  });

  it("tin rác (bảng lạ, kiểu sai, không tải) bị bỏ, không trả lời, không sập phòng", async () => {
    const a = await spawn();
    const svc = service([a.name]);
    await svc.refresh();
    let looked = 0;
    const view = svc.view.bind(svc);
    svc.view = (...args) => {
      looked++;
      return view(...args);
    };
    WorldRoomCls.leaderboards = svc;
    for (const bad of [
      { board: "constructor" },
      { board: "khong_co" },
      { board: 5 },
      "tuvi",
      null,
      undefined,
      {},
      [],
    ])
      a.room.send(SOCIAL_MSG.boardsGet, bad as never);
    await sleep(900); // đồng thời cho xô giới hạn tần suất (burst 6, 2/giây) hồi lại sau đợt tin rác
    expect(a.boards.length).toBe(0);
    expect(looked).toBe(0); // tin rác không bao giờ tới dịch vụ
    a.room.send(SOCIAL_MSG.boardsGet, { board: "tuvi" }); // phòng còn sống
    await waitFor(() => a.boards[0], 3000, "phòng còn trả lời");
  });

  it("không có dịch vụ (LEADERBOARD=off): bảng trống, lý do none", async () => {
    const a = await spawn();
    WorldRoomCls.leaderboards = null;
    a.room.send(SOCIAL_MSG.boardsGet, { board: "pk" });
    const m = await waitFor(() => a.boards[0], 3000, "tin boards");
    expect(m).toEqual({ board: "pk", rows: [], mine: { rank: null, reason: "none" }, ageMs: 0 });
  });

  it("spam boardsGet bị giới hạn tần suất (không trả lời hàng trăm lần)", async () => {
    const a = await spawn();
    WorldRoomCls.leaderboards = service([a.name]);
    await WorldRoomCls.leaderboards.refresh();
    for (let i = 0; i < 40; i++) a.room.send(SOCIAL_MSG.boardsGet, { board: "tuvi" });
    await sleep(700);
    expect(a.boards.length).toBeGreaterThan(0);
    expect(a.boards.length).toBeLessThan(15); // burst 6 + vài tin hồi lại
  });
  it("tongmon: `mine` là hạng tông CỦA NGƯỜI HỎI (phòng truyền khoá chân linh); người không ở tông nào nhận none", async () => {
    const a = await spawn();
    const b = await spawn();
    const mk = (soulKeys: string[], points: number, name: string) => ({
      v: 1,
      id: `id-${name}`,
      name,
      tag: "T",
      leader: "x",
      motd: "",
      members: soulKeys.map((k) => ({ soulKey: k })),
      coin: 0,
      log: [],
      vault: {},
      points,
      createdAt: "t",
      updatedAt: "t",
    });
    const svc = new LeaderboardService({
      souls: { all: async () => [] } as never,
      players: { listProfiles: async () => [] } as never,
      sects: {
        all: async () => [
          mk(["khac"], 9000, "Thanh Van"),
          mk([soulIdOf(a.name)], 100, "Bach Lien"),
        ],
      } as never,
      testExp: () => new Map(),
    });
    await svc.refresh();
    WorldRoomCls.leaderboards = svc;
    a.room.send(SOCIAL_MSG.boardsGet, { board: "tongmon" });
    b.room.send(SOCIAL_MSG.boardsGet, { board: "tongmon" });
    const ma = await waitFor(() => a.boards[0], 3000, "boards của A");
    const mb = await waitFor(() => b.boards[0], 3000, "boards của B");
    expect(ma.rows.map((r) => r.name)).toEqual(["Thanh Van", "Bach Lien"]);
    expect(ma.mine).toMatchObject({ rank: 2, row: { name: "Bach Lien" } });
    expect(mb.mine).toEqual({ rank: null, reason: "none" });
  });
});
