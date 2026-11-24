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

/**
 * Đi `n` bước 20 Hz (+x) rồi 3 tin dừng, như `WorldScene` (một input mỗi 50 ms). Trả seq cuối.
 * Lịch KHÔNG đuổi kịp: gửi trễ thì dời mốc kế tiếp (`setInterval` của trình duyệt cũng không bắn bù các nhịp đã lỡ). Lịch tuyệt đối cũ (`t0 + i * 50`) khiến sau mỗi lần
 * tiến trình bị giữ lâu (test chạy song song, máy tải) phía gửi dồn cả chục tin trong vài ms, vượt `MAX_INPUT_BACKLOG` nên máy chủ (đúng) bỏ tin: CI từng đỏ
 * "expected 1 to be +0" (#923). `stall` giữ vòng lặp sự kiện bằng vòng bận để dựng lại đúng cú đứng hình đó một cách tất định.
 */
async function walk20Hz(
  room: Room,
  n: number,
  stall?: { stallAt: number; stallMs: number },
  onStall?: (fromMs: number, toMs: number) => void,
): Promise<number> {
  let s = 0;
  let due = Date.now();
  for (let i = 0; i < n; i++) {
    await sleep(Math.max(0, due - Date.now()));
    if (stall && i === stall.stallAt) {
      const from = performance.now();
      const end = Date.now() + stall.stallMs;
      while (Date.now() < end); // đứng hình: không timer / I/O nào chạy (máy chủ cùng tiến trình cũng đứng)
      onStall?.(from, performance.now());
    }
    room.send("input", { seq: ++s, dx: 1, dy: 0 });
    due = Math.max(due, Date.now()) + TICK_MS;
  }
  await sleep(Math.max(0, due - Date.now())); // một nhịp nữa rồi mới nhả phím
  // ...và chờ máy chủ xử lý hết hàng đợi: nhả phím sau khi mọi bước đã tới và đã đi (người chơi thật nhả khi thấy mình dừng tới đích); không thì máy chủ đói tick
  // (CI tải nặng) còn vài bước trong hàng đợi lúc tin dừng tới và cắt chúng, tính vào `dropped` (đúng thiết kế mục 41, nhưng không phải thứ ca này đo)
  await waitFor(
    () => ctrlOf(room).inputs.length === 0,
    8000,
    "hàng đợi input rỗng trước khi nhả phím",
  );
  for (let i = 0; i < 3; i++) room.send("input", { seq: ++s, dx: 0, dy: 0 });
  return s;
}

/** Ghi mốc (performance.now) mỗi lần vòng `update` của phòng chạy: để biết máy chủ có bị ĐÓI tick (CI tải nặng) trong lúc đo hay không. `stop()` trả các khoảng giữa hai tick liên tiếp. */
function watchTicks(room: Room) {
  const r = serverRoom(room) as any;
  const orig = Object.getPrototypeOf(r).update as (...a: unknown[]) => unknown;
  const at: number[] = [];
  r.update = function (this: unknown, ...a: unknown[]) {
    at.push(performance.now());
    return orig.apply(this, a);
  };
  return {
    stop() {
      delete r.update;
      const gaps: { from: number; to: number }[] = [];
      for (let i = 1; i < at.length; i++) gaps.push({ from: at[i - 1]!, to: at[i]! });
      return gaps;
    },
  };
}

/** Khoảng giữa hai tick dài hơn mức này (ms) tính là máy chủ bị đói tick: input dồn lại và bị bỏ là hậu quả ĐÚNG của thiết kế, không phải lỗi. */
const STARVED_GAP_MS = 3 * TICK_MS;

/** Một lần đi 20 Hz trong phòng mới: trả số input bị bỏ, quãng đã đi, và máy chủ có bị đói tick không (không tính chính cú đứng hình do test dựng). */
async function attempt20Hz(stall?: { stallAt: number; stallMs: number }) {
  const room = await join();
  const p = serverPlayer(room);
  const x0 = p.x;
  const w = (serverRoom(room) as any).world;
  const dropped0 = w.inputStats.dropped;
  const watch = watchTicks(room);
  let stallWin: [number, number] | null = null;
  const s = await walk20Hz(room, 40, stall, (a, b) => (stallWin = [a, b]));
  await waitFor(() => p.lastSeq === s, 8000, "tới tin dừng cuối");
  const gaps = watch.stop();
  const { moved } = await settle(room, x0);
  const win = stallWin as [number, number] | null;
  const starved = gaps.some(
    (g) => g.to - g.from > STARVED_GAP_MS && !(win && g.from <= win[1] && g.to >= win[0]),
  );
  return { dropped: w.inputStats.dropped - dropped0, moved, starved };
}

/**
 * Chạy `attempt20Hz` tới khi KHÔNG input nào bị bỏ. Có input bị bỏ mà máy chủ KHÔNG đói tick (mọi khoảng giữa hai tick <= 150 ms, trừ cú đứng hình do test dựng) là LỖI THẬT
 * (máy chủ bỏ input của một khách đi đều 20 Hz): đỏ ngay. Có bỏ mà máy chủ đói tick (CI tải nặng, #923) thì đo lại, tối đa 4 lần: tải tạm thời không kéo dài mãi.
 */
async function walkWithoutDrops(stall?: { stallAt: number; stallMs: number }) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await attempt20Hz(stall);
    if (r.dropped === 0) return r;
    expect(
      r.starved,
      `lần ${attempt}: máy chủ bỏ ${r.dropped} input dù KHÔNG đói tick (mọi khoảng giữa hai tick <= ${STARVED_GAP_MS} ms): lỗi thật`,
    ).toBe(true);
  }
  throw new Error("máy chủ đói tick 4 lần liên tiếp (máy quá tải): không đo được");
}

/** Chờ máy chủ xử lý xong hàng đợi, trả { x đã đi, thời gian (ms) tới lúc đứng yên hẳn }. */
/** Thời gian đứng yên chờ trong `settle` sau khi hàng đợi rỗng (để kiểm không đi thêm): KHÔNG tính vào thời gian chuyển động. */
const SETTLE_QUIET_MS = 4 * TICK_MS;

async function settle(room: Room, x0: number) {
  const t0 = Date.now();
  const ctrl = ctrlOf(room);
  await waitFor(() => ctrl.inputs.length === 0, 3000, "máy chủ xử lý hết hàng đợi");
  const done = Date.now() - t0;
  const x1 = serverPlayer(room).x;
  await sleep(SETTLE_QUIET_MS); // không còn đi thêm sau khi hàng đợi rỗng
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
    // Chỉ tính thời gian CHUYỂN ĐỘNG: bỏ phần đứng yên cố định `settle` chờ ở cuối. Trước đây đo cả 200 ms đó nên chỉ còn ~100 ms dư
    // (đo thật 475-529 ms so với trần 550; CI chậm ra 553 => đỏ giả, 24/11). Giờ ~280 ms so với trần 550; vẫn bắt "trôi 3 giây".
    const ms = Date.now() - t0 - SETTLE_QUIET_MS;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual((10 + MAX_INPUT_BACKLOG + 1) * 7.5 + 1e-6);
    expect(ms).toBeLessThanOrEqual((MAX_INPUT_BACKLOG + 2) * TICK_MS + 200);
  });

  it("đi bình thường 20 Hz trong 2 giây rồi tin dừng: không input nào bị bỏ, đi đúng ~40 bước và dừng ngay", async () => {
    const { moved } = await walkWithoutDrops();
    expect(moved).toBeGreaterThan(30 * 7.5); // đi gần đủ 40 bước (mạng tốt: không bị cắt vô cớ)
    expect(moved).toBeLessThanOrEqual(41 * 7.5 + 1e-6);
  });

  it("tiến trình đứng hình 1,2 giây giữa chừng (máy tải, #923): khách thật KHÔNG bắn bù nên không input nào bị bỏ, vẫn đi đủ và dừng ngay", async () => {
    const { moved } = await walkWithoutDrops({ stallAt: 15, stallMs: 1200 });
    expect(moved).toBeGreaterThan(30 * 7.5);
    expect(moved).toBeLessThanOrEqual(41 * 7.5 + 1e-6);
  });
});
