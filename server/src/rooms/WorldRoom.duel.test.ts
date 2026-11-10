// Test tích hợp PK thách đấu (M3 bước 5b): server Colyseus thật, client colyseus.js như client thật.
// Thách -> nhận -> đếm ngược -> đánh -> KO / đầu hàng / rời phòng; cờ công khai `Player.duel`; quái không làm hại người trong trận;
// thua không mất kiếp (hồ sơ không có `limbo`, không đổi bản đồ, đứng dậy tại chỗ).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  DUEL_COUNTDOWN_MS,
  DUEL_INVITE_TTL_MS,
  DUEL_KO_HP_PCT,
  DUEL_MSG,
  roomNameOf,
  type DuelEndMsg,
  type DuelInvitedMsg,
  type DuelStateMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-duel-"));
const PORT = 49000 + Math.floor(Math.random() * 3000);
let server: Server;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir; // store.ts đọc biến này lúc nạp module
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
const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const worldOf = (room: Room) => (serverRoom(room) as any).world;

interface Hero {
  name: string;
  room: Room;
  invited: DuelInvitedMsg[];
  states: DuelStateMsg[];
  ends: DuelEndMsg[];
  toasts: string[];
  me: () => any;
}

/** Vào Lạc Hà, rồi đặt (phía server) đứng ngoài trấn cạnh nhau để thách đấu được. */
async function spawn(slot: number, name = `Dau Si ${++seq}`): Promise<Hero> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    name,
    secret: secretOf(name),
  });
  rooms.push(room);
  const h: Hero = {
    name,
    room,
    invited: [],
    states: [],
    ends: [],
    toasts: [],
    me: () => (room.state as any)?.players?.get(room.sessionId),
  };
  room.onMessage(DUEL_MSG.invited, (m: DuelInvitedMsg) => h.invited.push(m));
  room.onMessage(DUEL_MSG.state, (m: DuelStateMsg) => h.states.push(m));
  room.onMessage(DUEL_MSG.end, (m: DuelEndMsg) => h.ends.push(m));
  room.onMessage("toast", (m: { text: string }) => h.toasts.push(m.text));
  for (const t of ["inv", "wallet", "quests", "dialog", "chat", "fx", "dmg", "soul", "party"])
    room.onMessage(t, () => {});
  await waitFor(() => h.me(), 4000, "vào phòng");
  const p = serverState(room).players.get(room.sessionId)!;
  p.x = DEFAULT_MAP.townPx.x + DEFAULT_MAP.townPx.r + 500 + slot * 45; // ngoài trấn, trong tầm chém
  p.y = DEFAULT_MAP.townPx.y;
  // Quái hoang đi ngang sẽ đánh người đứng ngoài trấn => `lastHitAt` => "đang bận" 3 giây => lời thách bị từ chối (test chập chờn):
  // dọn quái của phòng và xoá dấu vết bị đánh. Test cần quái thì tự thêm sau.
  const w = worldOf(room);
  w.state.monsters.clear();
  w.mctrl.clear();
  w.ctrl.get(room.sessionId).lastHitAt = 0;
  return h;
}
const sidOf = (h: Hero) => h.room.sessionId;
const saveOf = (name: string) => {
  for (const f of readdirSync(dataDir).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
    if (d.name === name) return d;
  }
  return undefined;
};

async function startDuel(a: Hero, b: Hero) {
  a.room.send(DUEL_MSG.challenge, { name: b.name });
  const inv = await waitFor(() => b.invited[0], 3000, "lời thách đấu");
  expect(inv).toEqual({ from: a.name, ttlMs: DUEL_INVITE_TTL_MS });
  b.room.send(DUEL_MSG.accept, { from: a.name });
  await waitFor(() => a.states[0] && b.states[0], 3000, "duelState");
}
/** Bỏ chờ đếm ngược (rút `fightAt` về hiện tại phía server). */
const skipCountdown = (a: Hero) => {
  const w = worldOf(a.room);
  const d = w.duels.of(sidOf(a));
  d.fightAt = Date.now() - 1;
};

describe("thách đấu qua phòng thật", () => {
  it("thách -> nhận -> đếm ngược (cờ công khai thấy từ người thứ ba) -> đánh -> KO: thắng / thua, thua đứng dậy TẠI CHỖ 30% khí huyết, hồ sơ không mất kiếp", async () => {
    const a = await spawn(0);
    const b = await spawn(1);
    const c = await spawn(5); // người xem
    await startDuel(a, b);
    expect(a.states[0]).toMatchObject({ phase: "countdown", opponent: b.name });
    expect(a.states[0].startsInMs).toBeGreaterThan(DUEL_COUNTDOWN_MS - 500);
    // người xem thấy cờ ⚔ qua state công khai
    await waitFor(
      () => (c.room.state as any).players.get(sidOf(a))?.duel === true,
      3000,
      "cờ duel của A",
    );
    expect((c.room.state as any).players.get(sidOf(b)).duel).toBe(true);
    expect((c.room.state as any).players.get(sidOf(c)).duel).toBe(false);

    // đang đếm ngược: đánh không trúng
    const hpB = serverState(b.room).players.get(sidOf(b))!.hp;
    a.room.send("attack", { angle: Math.atan2(0, 1) });
    await sleep(200);
    expect(serverState(b.room).players.get(sidOf(b))!.hp).toBe(hpB);

    skipCountdown(a);
    await waitFor(() => a.states.some((s) => s.phase === "fight"), 3000, "pha đánh");
    const sb = serverState(b.room).players.get(sidOf(b))!;
    const at = { x: sb.x, y: sb.y };
    sb.hp = 1; // gần KO: một đòn là xong
    for (let i = 0; i < 10 && a.ends.length === 0; i++) {
      a.room.send("attack", { angle: 0 }); // B đứng bên phải A
      await sleep(450);
    }
    const ea = await waitFor(() => a.ends[0], 3000, "duelEnd của A");
    const eb = await waitFor(() => b.ends[0], 3000, "duelEnd của B");
    expect(ea).toEqual({ result: "won", reason: "ko" });
    expect(eb).toEqual({ result: "lost", reason: "ko" });
    expect(sb.dead).toBe(true);
    // đứng dậy tại chỗ (rút thời gian gục phía server)
    worldOf(b.room).ctrl.get(sidOf(b)).reviveAt = Date.now();
    await waitFor(() => !sb.dead, 3000, "B đứng dậy");
    expect([sb.x, sb.y]).toEqual([at.x, at.y]);
    expect(sb.hp).toBe(Math.max(1, Math.round(sb.maxHp * DUEL_KO_HP_PCT)));
    await waitFor(
      () => (c.room.state as any).players.get(sidOf(a))?.duel === false,
      3000,
      "cờ duel tắt",
    );
    // không mất kiếp: hồ sơ lưu không có `limbo`, vẫn ở Lạc Hà (lưu khi rời phòng)
    await b.room.leave(true);
    rooms.splice(rooms.indexOf(b.room), 1);
    await sleep(300);
    const save = saveOf(b.name);
    expect(save.limbo).toBeUndefined();
    expect(save.mapId ?? DEFAULT_MAP_ID).toBe(DEFAULT_MAP_ID);
  });

  it("từ chối: người thách nhận toast, không có trận; hết hạn không trả lời: toast và sổ lời mời về 0", async () => {
    const a = await spawn(0);
    const b = await spawn(1);
    a.room.send(DUEL_MSG.challenge, { name: b.name });
    await waitFor(() => b.invited[0], 3000);
    b.room.send(DUEL_MSG.decline, { from: a.name });
    await waitFor(() => a.toasts.some((t) => t.includes("từ chối")), 3000, "toast từ chối");
    expect(worldOf(a.room).duels.size).toBe(0);
    expect(worldOf(a.room).duels.invitesSize).toBe(0);
    // hết hạn: rút hạn phía server
    const c = await spawn(2);
    c.room.send(DUEL_MSG.challenge, { name: b.name });
    await waitFor(() => b.invited[1], 3000);
    const w = worldOf(a.room);
    for (const list of (w.duels as any).invites.values())
      for (const inv of list) inv.until = Date.now() - 1;
    await waitFor(() => c.toasts.some((t) => t.includes("không trả lời")), 3000, "toast hết hạn");
    expect(w.duels.invitesSize).toBe(0);
  });

  it("đầu hàng: người kia thắng, người đầu hàng không gục; rời phòng giữa trận: người còn lại HOÀ (`disconnect`)", async () => {
    const a = await spawn(0);
    const b = await spawn(1);
    await startDuel(a, b);
    skipCountdown(a);
    b.room.send(DUEL_MSG.yield, {});
    expect(await waitFor(() => a.ends[0], 3000)).toEqual({ result: "won", reason: "yield" });
    expect(await waitFor(() => b.ends[0], 3000)).toEqual({ result: "lost", reason: "yield" });
    expect(serverState(b.room).players.get(sidOf(b))!.dead).toBe(false);

    const c = await spawn(2);
    const d = await spawn(3);
    await startDuel(c, d);
    await d.room.leave(true);
    rooms.splice(rooms.indexOf(d.room), 1);
    expect(await waitFor(() => c.ends[0], 3000, "huỷ trận")).toEqual({
      result: "draw",
      reason: "disconnect",
    });
    expect(worldOf(c.room).duels.size).toBe(0);
    expect(serverState(c.room).players.get(sidOf(c))!.duel).toBe(false);
  });

  it("quái đứng cạnh không làm hại người trong trận (kể cả khi khí huyết gần cạn) và không nhắm họ; mất khí huyết 0 thì không mất kiếp", async () => {
    const a = await spawn(0);
    const b = await spawn(1);
    await startDuel(a, b);
    skipCountdown(a);
    const w = worldOf(a.room);
    const sa = serverState(a.room).players.get(sidOf(a))!;
    sa.hp = 5;
    // một con hổ ngay cạnh A
    const { addMonster } = await import("../systems/test-helpers");
    const mon = addMonster(w, "ho", sa.x + 10, sa.y);
    await sleep(1500);
    expect(sa.hp).toBe(5);
    expect(sa.dead).toBe(false);
    expect(mon.mc.target === sidOf(a) || mon.mc.target === sidOf(b)).toBe(false);
    expect(a.states.length).toBeGreaterThan(0);
  });

  it("tin rác: không làm sập phòng, không tạo lời mời / trận", async () => {
    const a = await spawn(0);
    const b = await spawn(1);
    for (const bad of [
      undefined,
      null,
      5,
      "x",
      [],
      {},
      { name: 5 },
      { name: "<b>" },
      { name: a.name },
    ])
      a.room.send(DUEL_MSG.challenge, bad as never);
    for (const bad of [undefined, null, {}, { from: 1 }, { from: "Nguoi La" }])
      b.room.send(DUEL_MSG.accept, bad as never);
    await sleep(500);
    expect(b.invited).toHaveLength(0);
    expect(worldOf(a.room).duels.size).toBe(0);
    expect(serverRoom(a.room)).toBeDefined();
  });
});
