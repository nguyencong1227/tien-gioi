// Hệ số tu vi THỬ NGHIỆM ở phòng (QUYET_DINH_M3 mục 34): server Colyseus thật + colyseus.js. Chỉ đạo hiệu có trong `WorldRoom.testExpMult` được nhân (khớp không phân
// biệt hoa thường); chỉ CHỦ nhận `Player.testExpMult` (người khác không thấy); mỗi lần vào phòng ghi audit `test.exp_mult`; hệ số nhân vào tu vi thật.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { ROOM_NAME } from "@tien-gioi/shared";
import { matchMaker } from "colyseus";
import { setAuditSink } from "../audit";
import type { WorldRoom as WorldRoomT } from "./WorldRoom";
import type { WorldState } from "../schema";
import { listenWithRetry } from "../test-port";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-testexp-room-"));

let PORT = 0;
let server: Server;
let WorldRoom: typeof WorldRoomT;
const rooms: Room[] = [];
const lines: string[] = [];
const events = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const mod = await import("./WorldRoom");
  WorldRoom = mod.WorldRoom;
  WorldRoom.testExpMult = new Map([["han", 5]]); // `TEST_EXP_MULT=Han:5`
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
});
afterEach(async () => {
  setAuditSink(null);
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
});
afterAll(async () => {
  WorldRoom.testExpMult = new Map();
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => T | undefined | false, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("Hết thời gian chờ điều kiện");
    await sleep(20);
  }
}
const secretOf = (name: string) => `secret-${name.replace(/\s/g, "")}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoomT;
const serverPlayer = (room: Room) =>
  (serverRoom(room).state as WorldState).players.get(room.sessionId)!;
async function join(name: string) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    name,
    secret: secretOf(name),
  });
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  return room;
}

describe("hệ số tu vi thử nghiệm ở phòng thật", () => {
  it("đạo hiệu có trong cấu hình (không phân biệt hoa thường): nhận hệ số, ghi audit `test.exp_mult`; đạo hiệu khác không", async () => {
    setAuditSink((l) => lines.push(l));
    lines.length = 0;
    const han = await join("hAn"); // khác hoa thường với khoá "han"
    const other = await join("Linh Lan");
    expect(serverPlayer(han).testExpMult).toBe(5);
    expect(serverPlayer(other).testExpMult).toBe(1);
    const ev = events().filter((e) => e.ev === "test.exp_mult");
    expect(ev).toEqual([expect.objectContaining({ name: "hAn", mult: 5, audit: 1 })]);
    expect(lines.join("")).not.toContain(secretOf("hAn")); // không bao giờ ghi mã bí mật
  });

  it("CHỈ chủ thấy hệ số: client của chủ đọc 5; client người khác KHÔNG nhận 5 cho Han (trường `@view` chỉ gửi chủ)", async () => {
    const han = await join("hAn"); // đạo hiệu duy nhất không phân biệt hoa thường: dùng lại đúng tên + mã của ca đầu
    const other = await join("Linh Lan Hai");
    const hanId = han.sessionId;
    await waitFor(() => (other.state as any).players.get(hanId)); // người kia thấy Han (cùng vùng nhìn)
    expect((han.state as any).players.get(han.sessionId).testExpMult).toBe(5);
    expect((other.state as any).players.get(hanId).testExpMult).not.toBe(5);
    expect((other.state as any).players.get(other.sessionId).testExpMult).not.toBe(5);
  });

  it("hạ quái thật: tu vi của Han gấp 5 người thường cùng điều kiện (đúng đường `killMonster` của phòng)", async () => {
    const { killMonster } = await import("../systems/combat");
    const han = await join("hAn");
    const other = await join("Linh Lan Ba");
    const w = (serverRoom(han) as any).world;
    const kill = (room: Room) => {
      const p = serverPlayer(room);
      p.exp = 0;
      const [id, m] = [...serverRoom(room).state.monsters].find(([, mm]) => mm.kind === "tho")!;
      m.x = p.x + 20;
      m.y = p.y;
      const mc = w.mctrl.get(id);
      mc.damageBy.clear();
      mc.damageBy.set(room.sessionId, 100);
      killMonster(w, id, mc);
      return p.exp;
    };
    const normal = kill(other);
    const boosted = kill(han);
    expect(normal).toBeGreaterThan(0);
    expect(boosted).toBeCloseTo(normal * 5, 6);
  });
});
