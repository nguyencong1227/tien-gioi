// Dựng sẵn mặt nạ đi bộ lúc TẠO phòng thường (tiếp #1220: lần vào phòng đầu tiên không phải dựng trong `onJoin`, B nêu ở review): tạo phòng KHÔNG có người vào rồi kiểm mặt nạ của bản đồ đã dựng.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { getMap, roomNameOf } from "@tien-gioi/shared";
import { listenWithRetry } from "../test-port";
import { isWalkReachWarm } from "../systems/walk-reach";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-warm-"));
let server: Server;

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const mod = await import("./WorldRoom");
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  await listenWithRetry(server);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

describe("mặt nạ đi bộ dựng sẵn khi tạo phòng", () => {
  it("tạo phòng thường (chưa ai vào) thì mặt nạ của bản đồ đó đã dựng; bản đồ khác thì chưa", async () => {
    const map = getMap("han_van")!;
    const other = getMap("am_suong")!;
    expect(isWalkReachWarm(map)).toBe(false); // tiền đề: chưa ai dựng (tệp test chạy trong tiến trình riêng)
    expect(isWalkReachWarm(other)).toBe(false);
    const cache = await matchMaker.createRoom(roomNameOf("han_van"), {});
    expect(cache.roomId).toBeTruthy();
    expect(isWalkReachWarm(map)).toBe(true);
    expect(isWalkReachWarm(other)).toBe(false);
    await matchMaker.remoteRoomCall(cache.roomId, "disconnect").catch(() => {});
  });
});
