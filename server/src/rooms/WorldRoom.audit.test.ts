// Nhật ký kiểm toán ở phòng (M4 2.4): sai mã nhân vật và bị ngắt vì spam, với server Colyseus thật + colyseus.js.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { ROOM_NAME } from "@tien-gioi/shared";
import { setAuditSink } from "../audit";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-audit-room-"));
import { listenWithRetry } from "../test-port";

// cổng do hệ điều hành cấp ở beforeAll (`listenWithRetry`): tự động thử lại nếu gặp EADDRINUSE giữa các tệp chạy song song
let PORT = 0;
let server: Server;
const rooms: Room[] = [];
const lines: string[] = [];
const events = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("./WorldRoom");
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  PORT = await listenWithRetry(server);
});
afterEach(async () => {
  setAuditSink(null);
  vi.restoreAllMocks();
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await new Promise((r) => setTimeout(r, 120));
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MA = "ma-that-cua-nhan-vat-0123456789";
const MA_SAI = "ma-sai-ma-sai-ma-sai-ma-sai-01";
async function join(name: string, secret: string) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, { name, secret });
  rooms.push(room);
  return room;
}

describe("nhật ký kiểm toán ở phòng", () => {
  it("sai mã nhân vật: ghi `join.denied` (lý do + đạo hiệu), KHÔNG ghi mã (đúng hay sai); vào đúng không ghi", async () => {
    setAuditSink((l) => lines.push(l));
    lines.length = 0;
    const a = await join("Kiem Toan Mot", MA);
    expect(lines).toEqual([]); // vào đúng: không ghi
    await a.leave(true);
    rooms.pop();
    await sleep(200);
    await expect(join("Kiem Toan Mot", MA_SAI)).rejects.toMatchObject({ code: 403 });
    expect(events()).toEqual([
      expect.objectContaining({
        ev: "join.denied",
        reason: "bad_secret",
        name: "Kiem Toan Mot",
        audit: 1,
      }),
    ]);
    const all = lines.join("");
    expect(all).not.toContain(MA);
    expect(all).not.toContain(MA_SAI);
  });

  it("bị ngắt vì spam: ghi `room.spam_kick` kèm đạo hiệu và bản đồ", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setAuditSink((l) => lines.push(l));
    lines.length = 0;
    const a = await join("Kiem Toan Hai", MA);
    let code = 0;
    a.onLeave((c) => (code = c));
    for (let i = 0; i < 400; i++) a.send("talk", { npcId: "truong_tran" });
    for (let i = 0; i < 100 && !code; i++) await sleep(30);
    expect(code).toBe(4429);
    const kicks = events().filter((e) => e.ev === "room.spam_kick");
    expect(kicks).toEqual([
      expect.objectContaining({ name: "Kiem Toan Hai", map: "lac_ha", audit: 1 }),
    ]);
  });

  it("chưa bật audit (mặc định): không dòng nào, game vẫn chạy bình thường", async () => {
    setAuditSink(null);
    const a = await join("Kiem Toan Ba", MA);
    expect(a.connection.isOpen).toBe(true);
    await a.leave(true);
    rooms.pop();
    await sleep(200);
    await expect(join("Kiem Toan Ba", MA_SAI)).rejects.toMatchObject({ code: 403 });
    expect(lines.filter((l) => l.includes("Kiem Toan Ba"))).toEqual([]);
  });
});
