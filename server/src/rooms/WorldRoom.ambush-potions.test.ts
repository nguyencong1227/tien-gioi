// `AMBUSH_MIN_POTIONS` đi từ biến môi trường vào phòng THẬT (CD6c): `WorldRoom.onCreate` đọc MỘT lần, nên cần tệp riêng đặt biến TRƯỚC khi dựng phòng (tệp `WorldRoom.ambush.test.ts` dùng
// mặc định 0). Kiểm: phòng nhận đúng ngưỡng, người thiếu đan bị `ambushBlocked` trả `potion` (không có hộp thoại), đủ đan thì qua nhánh này.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { DEFAULT_MAP_ID, PROTOCOL_VERSION, roomNameOf } from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";
import { listenWithRetry } from "../test-port";
import { ambushBlocked, ambushOf } from "../systems/ambush";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-ambush-potions-"));
let PORT = 0;
let server: Server;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  process.env.AMBUSH = "on";
  process.env.AMBUSH_MIN_POTIONS = "2";
  const mod = await import("./WorldRoom");
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
});

afterAll(async () => {
  delete process.env.AMBUSH;
  delete process.env.AMBUSH_MIN_POTIONS;
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const worldOf = (room: Room) => (serverRoom(room) as any).world;

describe("AMBUSH_MIN_POTIONS qua phòng thật (AMBUSH=on, AMBUSH_MIN_POTIONS=2)", () => {
  it("phòng nhận ngưỡng 2; người túi trống bị chặn bằng nhánh `potion`, đủ 2 đan thì qua nhánh đó (và không còn gì khác chặn)", async () => {
    const name = "Thieu Dan";
    const client = new Client(`ws://localhost:${PORT}`);
    const room = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
      v: PROTOCOL_VERSION,
      name,
      secret: `secret-${name.replace(/\s/g, "")}-0123456789abcdef`,
    });
    rooms.push(room);
    for (const t of ["chat", "toast", "fx", "dmg", "inv", "wallet", "quests", "skills", "status"])
      room.onMessage(t, () => {});
    const deadline = Date.now() + 4000;
    while (!serverState(room).players.get(room.sessionId)) {
      if (Date.now() > deadline) throw new Error("player state không đồng bộ");
      await sleep(20);
    }
    const w = worldOf(room);
    expect(w.ambush).not.toBeNull();
    expect(w.ambush.minPotions).toBe(2);

    const sid = room.sessionId;
    const p = serverState(room).players.get(sid)!;
    const c = w.ctrl.get(sid);
    // đứng ngoài trấn, đủ máu, yên, hết hồi, dọn quái ngẫu nhiên: chỉ còn nhánh `potion` quyết định
    p.x = w.map.townPx.x + w.map.townPx.r + 600;
    p.y = w.map.townPx.y;
    p.hp = p.maxHp;
    ambushOf(w, c).cooldownUntil = 0;
    c.lastHitAt = 0;
    for (const id of [...w.mctrl.keys()]) {
      w.state.monsters.delete(id);
      w.mctrl.delete(id);
    }
    c.inv.fill(null);
    expect(ambushBlocked(w, sid)).toBe("potion");
    c.inv[0] = { itemId: "hoi_huyet_dan", qty: 1 };
    expect(ambushBlocked(w, sid)).toBe("potion");
    c.inv[0] = { itemId: "hoi_huyet_dan", qty: 2 };
    expect(ambushBlocked(w, sid)).toBeNull();
  }, 15_000);
});
