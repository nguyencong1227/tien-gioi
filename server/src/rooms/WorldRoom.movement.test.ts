// Mục 41 (di chuyển "trôi như liệt phím") trên máy chủ Colyseus THẬT + colyseus.js: client đệm một loạt tin `input` rồi xả dồn như sau lúc mạng đứng (đúng thứ tự, một lúc),
// kèm 3 tin DỪNG như `WorldScene` mới; máy chủ phải dừng ngay chứ không đi tiếp cả đợt dồn. Kiểm cả giới hạn tần suất: burst cũ 40 bỏ đúng phần đuôi (các tin dừng).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { ROOM_NAME, TICK_MS } from "@tien-gioi/shared";
import type { WorldRoom as WorldRoomT } from "./WorldRoom";
import type { WorldState } from "../schema";
import { listenWithRetry } from "../test-port";
import { MAX_INPUT_BACKLOG, STOP_KEEP_INPUTS } from "../systems/movement";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-move-room-"));
let PORT = 0;
let server: Server;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const mod = await import("./WorldRoom");
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
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
async function waitFor(fn: () => unknown, ms = 4000, what = "điều kiện") {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(10);
  }
}
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoomT;
const serverPlayer = (room: Room) =>
  (serverRoom(room).state as WorldState).players.get(room.sessionId)!;
const ctrlOf = (room: Room) => (serverRoom(room) as any).world.ctrl.get(room.sessionId);
let seq = 0;
async function join() {
  const name = `DiChuyen${++seq}`;
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    name,
    secret: `secret-${name}-0123456789abcdef`,
  });
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  // đặt người chơi giữa trấn (khoảng trống rộng) và xoá hàng đợi cũ
  const w = (serverRoom(room) as any).world;
  const p = serverPlayer(room);
  p.x = w.map.townPx.x - 200;
  p.y = w.map.townPx.y;
  ctrlOf(room).inputs.length = 0;
  ctrlOf(room).moveBudget = 10; // đứng im đã lâu: ngân sách bước đầy (như ngay sau một lần mạng đứng)
  p.lastSeq = 0;
  return room;
}

/**
 * Gửi một đợt `n` input di chuyển (+x) rồi `stops` input dừng và để máy chủ nhận HẾT trước khi nó xử lý: đúng kịch bản "mạng đứng rồi xả dồn".
 * Tạm chặn vòng `update` của phòng trong lúc gửi, chờ tin cuối nằm ở ĐUÔI hàng đợi, rồi thả ra. Không chặn thì chạy dưới tải (CI / máy bận) các tin tới rải
 * qua nhiều tick và máy chủ xử lý dần từng đợt nhỏ: đó là hành vi ĐÚNG nhưng không phải thứ ca này đo (từng đỏ "expected 90 to be <= 15" ở CI). Trả seq cuối.
 */
async function burst(room: Room, n: number, stops: number): Promise<number> {
  const r = serverRoom(room) as any;
  r.update = () => {}; // thuộc tính của đối tượng che hàm của lớp: tick chạy không đụng hàng đợi
  try {
    let s = 0;
    for (let i = 0; i < n; i++) room.send("input", { seq: ++s, dx: 1, dy: 0 });
    for (let i = 0; i < stops; i++) room.send("input", { seq: ++s, dx: 0, dy: 0 });
    const inputs = ctrlOf(room).inputs as { seq: number }[];
    await waitFor(() => inputs[inputs.length - 1]?.seq === s, 3000, "toàn bộ đợt tin tới hàng đợi");
    return s;
  } finally {
    delete r.update; // thả: máy chủ xử lý cả đợt dồn một lúc
  }
}

/** Chờ máy chủ xử lý xong hàng đợi, trả { x đã đi, thời gian (ms) tới lúc đứng yên hẳn }. */
async function settle(room: Room, x0: number) {
  const t0 = Date.now();
  const ctrl = ctrlOf(room);
  await waitFor(() => ctrl.inputs.length === 0, 3000, "máy chủ xử lý hết hàng đợi");
  const done = Date.now() - t0;
  const x1 = serverPlayer(room).x;
  await sleep(4 * TICK_MS); // không còn đi thêm sau khi hàng đợi rỗng
  expect(serverPlayer(room).x).toBe(x1);
  return { moved: x1 - x0, ms: done };
}

describe("mạng đứng rồi xả dồn, nhả phím (phòng thật)", () => {
  it("60 input + 3 tin dừng tới cùng lúc (mạng đứng 3 giây): dừng ngay, chỉ đi <= (STOP_KEEP_INPUTS + 1) bước, lastSeq = seq tin dừng cuối", async () => {
    const room = await join();
    const p = serverPlayer(room);
    const x0 = p.x;
    const last = await burst(room, 60, 3);
    await waitFor(() => p.lastSeq === last, 3000, "máy chủ xử lý tới tin dừng cuối");
    const { moved, ms } = await settle(room, x0);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(STOP_KEEP_INPUTS * 7.5 + 1e-6);
    expect(ms).toBeLessThanOrEqual(300); // tiêu chí mục 41: dừng trong <= 0,3 giây
    expect(p.lastSeq).toBe(last);
  });

  it("100 tin (đứng 5 giây) kết thúc bằng 3 tin dừng: KHÔNG tin nào bị giới hạn tần suất bỏ (burst cũ 40 bỏ đúng 3 tin dừng cuối: nhân vật cứ đi tiếp)", async () => {
    const room = await join();
    const p = serverPlayer(room);
    const x0 = p.x;
    const last = await burst(room, 97, 3);
    await waitFor(() => p.lastSeq === last, 3000, "tin dừng cuối (seq 100) tới được máy chủ");
    const { moved } = await settle(room, x0);
    expect(moved).toBeLessThanOrEqual(STOP_KEEP_INPUTS * 7.5 + 1e-6);
  });

  it("client CŨ (không gửi tin dừng): 60 input dồn cũng chỉ đi tối đa ngân sách bước + backlog 0,25 giây, rồi đứng yên (không trôi 3 giây)", async () => {
    const room = await join();
    const p = serverPlayer(room);
    const x0 = p.x;
    const t0 = Date.now();
    const last = await burst(room, 60, 0);
    // chờ TIN CUỐI được áp (hàng đợi có thể rỗng tạm thời khi các tin còn đang tới qua WebSocket)
    await waitFor(() => p.lastSeq === last, 3000, "máy chủ áp tới input cuối (seq 60)");
    const { moved } = await settle(room, x0);
    const ms = Date.now() - t0;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual((10 + MAX_INPUT_BACKLOG + 1) * 7.5 + 1e-6);
    expect(ms).toBeLessThanOrEqual((MAX_INPUT_BACKLOG + 2) * TICK_MS + 200);
  });

  it("đi bình thường 20 Hz trong 2 giây rồi tin dừng: không input nào bị bỏ, đi đúng ~40 bước và dừng ngay", async () => {
    const room = await join();
    const p = serverPlayer(room);
    const x0 = p.x;
    const w = (serverRoom(room) as any).world;
    const dropped0 = w.inputStats.dropped;
    let s = 0;
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) {
      room.send("input", { seq: ++s, dx: 1, dy: 0 });
      await sleep(Math.max(0, t0 + (i + 1) * TICK_MS - Date.now())); // lịch tuyệt đối 20 Hz
    }
    for (let i = 0; i < 3; i++) room.send("input", { seq: ++s, dx: 0, dy: 0 });
    await waitFor(() => p.lastSeq === s, 2000, "tới tin dừng cuối");
    const { moved } = await settle(room, x0);
    expect(w.inputStats.dropped - dropped0).toBe(0);
    expect(moved).toBeGreaterThan(30 * 7.5); // đi gần đủ 40 bước (mạng tốt: không bị cắt vô cớ)
    expect(moved).toBeLessThanOrEqual(41 * 7.5 + 1e-6);
  });
});
