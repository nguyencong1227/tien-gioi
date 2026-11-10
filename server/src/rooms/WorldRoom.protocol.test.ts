// Từ chối client quá cũ khi vào phòng (M4 2.5, shared/src/protocol.ts): server Colyseus thật, client colyseus.js.
// Kiểm: thiếu / sai / thấp hơn mức tối thiểu bị từ chối bằng `JOIN_CLIENT_OUTDATED` TRƯỚC xác thực (không lộ nhân vật, không tạo
// tệp), bằng / cao hơn mức được nhận, mặc định (mức 0) nhận mọi client kể cả không gửi `v`.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  JOIN_CLIENT_OUTDATED,
  MIN_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ROOM_NAME,
  parseClientOutdated,
  parseWrongMap,
} from "@tien-gioi/shared";
import type { WorldRoom as WorldRoomType } from "./WorldRoom";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-proto-room-"));
const PORT = 57000 + Math.floor(Math.random() * 3000);
let server: Server;
let WorldRoom: typeof WorldRoomType;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const mod = await import("./WorldRoom");
  WorldRoom = mod.WorldRoom;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  await server.listen(PORT);
});
afterEach(async () => {
  WorldRoom.minProtocol = MIN_PROTOCOL_VERSION;
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await new Promise((r) => setTimeout(r, 120));
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const secret = (name: string) => `secret-${name}-0123456789abcdef`;
let seq = 0;
const nameOf = () => `Cu Ky ${++seq}`;
async function tryJoin(opts: Record<string, unknown>) {
  try {
    const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, opts);
    rooms.push(room);
    return { room };
  } catch (e) {
    const err = e as { code?: unknown; message?: unknown };
    return { code: err.code, message: err.message };
  }
}
const savedFiles = () => readdirSync(dataDir).filter((f) => f.endsWith(".json"));

describe("phiên bản giao thức khi vào phòng", () => {
  it("mặc định (mức tối thiểu 0): nhận cả client không gửi `v`, gửi `v` cũ / mới / rác", async () => {
    expect(WorldRoom.minProtocol).toBe(MIN_PROTOCOL_VERSION);
    for (const v of [undefined, 0, PROTOCOL_VERSION, PROTOCOL_VERSION + 50, "x", -3, 1.5, null]) {
      const name = nameOf();
      const r = await tryJoin({ name, secret: secret(name), ...(v === undefined ? {} : { v }) });
      expect(r.room, `v=${JSON.stringify(v)}: ${r.code} ${r.message}`).toBeTruthy();
      await r.room!.leave(true);
      rooms.pop();
    }
  });

  it("nâng mức lên 1: thiếu `v`, `v` = 0, sai kiểu (chuỗi, null, âm, lẻ, NaN) đều bị từ chối bằng 426 + `client_outdated:1`", async () => {
    WorldRoom.minProtocol = 1;
    const before = savedFiles().length;
    for (const v of [undefined, 0, "1", null, -1, 0.5, NaN, true]) {
      const name = nameOf();
      const r = await tryJoin({ name, secret: secret(name), ...(v === undefined ? {} : { v }) });
      expect(r.room, `v=${String(v)} lẽ ra bị từ chối`).toBeUndefined();
      expect(r.code, `v=${String(v)}`).toBe(JOIN_CLIENT_OUTDATED);
      expect(r.message).toBe("client_outdated:1");
      // client đọc lỗi bằng hợp đồng chung và không nhầm với `wrong_map`
      expect(parseClientOutdated(r.code, r.message)).toBe(1);
      expect(parseWrongMap(r.code, r.message)).toBeUndefined();
    }
    expect(savedFiles().length, "từ chối ở onAuth: không tạo hồ sơ nhân vật").toBe(before);
  });

  it("bằng hoặc cao hơn mức tối thiểu thì vào được (kể cả client MỚI HƠN server)", async () => {
    WorldRoom.minProtocol = 1;
    for (const v of [1, 2, PROTOCOL_VERSION, 999]) {
      const name = nameOf();
      const r = await tryJoin({ name, secret: secret(name), v });
      expect(r.room, `v=${v}: ${r.code} ${r.message}`).toBeTruthy();
      await r.room!.leave(true);
      rooms.pop();
    }
  });

  it("kiểm phiên bản TRƯỚC xác thực: sai mã nhân vật + client cũ vẫn nhận 426 (không lộ 'tên này đã có người dùng')", async () => {
    // tạo nhân vật khi chưa có yêu cầu
    const name = nameOf();
    const first = await tryJoin({ name, secret: secret(name), v: PROTOCOL_VERSION });
    expect(first.room).toBeTruthy();
    await first.room!.leave(true);
    rooms.pop();
    await new Promise((r) => setTimeout(r, 200));
    WorldRoom.minProtocol = 1;
    // mã sai + cũ: 426 chứ không phải 403
    const old = await tryJoin({ name, secret: "ma-sai-ma-sai-ma-sai-ma-sai" });
    expect(old.code).toBe(JOIN_CLIENT_OUTDATED);
    // mã sai + mới: vẫn là lỗi xác thực cũ (403)
    const wrong = await tryJoin({
      name,
      secret: "ma-sai-ma-sai-ma-sai-ma-sai",
      v: PROTOCOL_VERSION,
    });
    expect(wrong.code).toBe(403);
    // đúng mã + mới: vào được
    const ok = await tryJoin({ name, secret: secret(name), v: PROTOCOL_VERSION });
    expect(ok.room).toBeTruthy();
  });

  it("tin rác ở `options` (null, chuỗi, mảng) không làm onAuth ném lỗi lạ: bị từ chối đúng cách khi mức > 0", async () => {
    WorldRoom.minProtocol = 1;
    for (const opts of [{}, { v: {} }, { v: [] }, { v: "9" }]) {
      const r = await tryJoin(opts as Record<string, unknown>);
      expect(r.code).toBe(JOIN_CLIENT_OUTDATED);
    }
  });
});
