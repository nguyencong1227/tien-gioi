// Test rò rỉ (issue #1105, Dev H): chạy N vòng đời (vào-thoát, rớt-nối lại) LIÊN TIẾP rồi kiểm MỌI sổ dùng chung của
// `Hub` (parties / runs / ambushes / sects / pkPairs / worldBoss / writes) + players/ctrl/ghosts/số phòng sống về ĐÚNG mức
// gốc, KHÔNG tích luỹ theo số vòng. Chỉ test; KHÔNG sửa mã trò chơi (rò thì mở issue `dev-a` kèm test này).
//
// Vì sao snapshot BAO QUANH TOÀN BỘ test (before/after), KHÔNG snapshot giữa các vòng: phòng THƯỜNG `autoDispose = false`
// nên KHÔNG tự đóng khi hết client — `Hub.worlds.size` / chat sink / hộ thể CÒN lại qua việc rời (thiết kế: thế giới luôn
// sống). Rò ở đây là TÍCH LŨY (players/ctrl/ghosts/phòng/phòng-sống/chat-sink) theo số vòng; snapshot trước/sau cùng một
// điểm nên mọi thứ PHẢI về đúng mức, phồng = rò. Snapshot giữa các vòng sẽ báo nhầm các trạng thái hợp lệ này.
//
// Hai chuỗi vòng đời v1 (vững, chạy được ổn định ≥ 20 lượt):
//   A. vào phòng → thoát chủ động (players/ctrl rút khỏi state; phòng vẫn sống).
//   B. vào phòng → rớt socket → nối lại → thoát (đường net-guard: ghost phòng, hộ thể World.shielded; phòng vẫn sống qua nối lại).
// Các chuỗi populating sổ chung (đội / thách đấu / bí cảnh / đấu trường) thêm dần ở các lượt sau; snapshot đã gồm mọi sổ để bắt rò.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { DEFAULT_MAP_ID, roomNameOf } from "@tien-gioi/shared";
import { listenWithRetry } from "../test-port";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-leak-"));
let PORT = 0;
let server: Server;
let WorldRoomClass: typeof import("./WorldRoom").WorldRoom;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir; // store.ts đọc biến này lúc nạp module
  const mod = await import("./WorldRoom");
  WorldRoomClass = mod.WorldRoom;
  // Rút thời gian chờ nối lại: không muốn đợi ~90 giây mỗi vòng nếu nối lại lỡ (chỉ ảnh hưởng test này, chạy tuần tự)
  WorldRoomClass.reconnectGraceS = 3;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server); // cổng free, retry EADDRINUSE giữa các tệp chạy song song
});

afterEach(async () => {
  // An toàn: nếu một vòng để sót phòng (test đỏ giữa chừng), force-leave dọn trước khi vòng/test kế.
  // Phòng THƯỜNG `autoDispose = false` nên KHÔNG tự đóng khi hết client — `afterEach` chỉ force-leave client, KHÔNG khiến
  // phòng đóng. Rò ở đây là TÍCH LŨY (players/ctrl/ghosts/phòng) theo số vòng, nên phát hiện bằng snapshot bao-quanh-toàn-test
  // (beforeTest/afterTest), KHÔNG phải snapshot giữa các vòng hay snapshot sau force-leave.
  await Promise.all(
    rooms.splice(0).map((r) => (r.connection.isOpen ? r.leave(true) : Promise.resolve())),
  );
  await sleep(80);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | undefined | false, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("Hết thời gian chờ điều kiện (waitFor)");
    await sleep(20);
  }
}

let nameSeq = 0;
const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;
/** Tên đủ riêng mỗi vòng để không đụng "đã có chủ"/ghost còn sót của vòng trước. */
const roundName = () => `Leak ${++nameSeq}`;

/** Phòng thật phía server, để truy cập sổ nội bộ (World, ghost phòng…) khi phòng còn sống. */
function serverRoom(room: Room) {
  return matchMaker.getLocalRoomById(room.roomId) as WorldRoomClass;
}

async function join(name: string): Promise<Room> {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    name,
    secret: secretOf(name),
  });
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  return room;
}

/** Rớt mạng: đóng WebSocket mà KHÔNG thoát chủ động (server thấy mã khác 4000 → hồn lìa xác chờ nối lại). */
const dropConnection = (room: Room) => (room.connection.transport as any).ws.close();

/** Nối lại bằng token phòng cũ, như client thật. */
async function reconnectTo(old: Room): Promise<Room> {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.reconnect(old.reconnectionToken);
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  return room;
}

// ---------------------------------------------------------------- Snapshot các sổ

interface Snap {
  worlds: number; // số phòng / World sống (= số phòng Colyseus, 1:1)
  chatSinks: number; // kênh chat toàn server đã đăng ký
  parties: number;
  runs: number;
  runsCooldown: number;
  ambushes: number;
  sectInvites: number;
  sectOnline: number;
  sectCache: number;
  sectBusy: number;
  sectLastPresence: number;
  pkPairs: number;
  wbCurrent: number; // 0/1: có sự kiện trùm thế giới đang live không
  wbRows: number;
  wbClaimed: number;
  writesInflight: number; // lần ghi hồ sơ đang chờ (HUB.writes)
  players: number; // tổng players trên mọi World sống (rò player = phòng sót)
  ctrl: number; // tổng PlayerCtrl
  worldGhosts: number; // World.ghosts (im lặng)
  worldShielded: number; // World.shielded (hộ thể)
  duels: number;
}

/** Ảnh chụp mọi sổ dùng chung + tổng các sổ per-room trên mọi World đang sống. */
function snapshot(): Snap {
  const hub = WorldRoomClass.hub;
  let players = 0;
  let ctrl = 0;
  let worldGhosts = 0;
  let worldShielded = 0;
  let duels = 0;
  for (const w of hub.worlds) {
    players += w.state.players.size;
    ctrl += w.ctrl.size;
    worldGhosts += w.ghosts.size;
    worldShielded += w.shielded.size;
    duels += w.duels.size;
  }
  const wb = hub.worldBoss;
  return {
    worlds: hub.worlds.size,
    chatSinks: hub.chatSinkCount,
    parties: hub.parties.size,
    runs: hub.runs.size,
    runsCooldown: hub.runs.cooldownSize,
    ambushes: hub.ambushes.size,
    sectInvites: hub.sects.invitesSize,
    sectOnline: hub.sects.online.size,
    sectCache: hub.sects.cache.size,
    sectBusy: hub.sects.busy.size,
    sectLastPresence: hub.sects.lastPresence.size,
    pkPairs: hub.pkPairs.size,
    wbCurrent: wb.current ? 1 : 0,
    wbRows: wb.current?.rows.size ?? 0,
    wbClaimed: wb.current?.claimed.size ?? 0,
    writesInflight: hub.writes.summary().inflight,
    players,
    ctrl,
    worldGhosts,
    worldShielded,
    duels,
  };
}

// Khởi tạo HỢP LỆ lần đầu: snapshot `beforeTest` chụp khi CHƯA ai vào (vòng đầu tiên tạo phòng + chat sink). `worlds` /
// `chatSinks` tăng 0→1 là hợp lệ (không phải rò). Mọi thứ KHÁC (players/ctrl/worldGhosts/worldShielded + mọi sổ chung) PHẢI
// về đúng mức; phồng theo số vòng = rò.
//
// `worldShielded` là RÒ THẬT (đã tái hiện: `rớt-nối lại × N` thấy `0 → N`): `grantShield` thêm sid vào `World.shielded` khi
// nối lại, nhưng player đã rời khỏi `state.players` (dropPlayer) nên `tickNetGuard` KHÔNG bao giờ gỡ → tích luỹ theo số vòng
// nối lại. Test ĐỎ ở đây là đúng — đây là bug cần Dev A sửa (mở issue `dev-a`, KHÔNG sửa mã trò chơi trong test này).
const FIRST_INIT_KEYS = new Set<keyof Snap>(["worlds", "chatSinks"]);

/**
 * Trả khóa + giá trị đầu tiên KHÁC nhau (loại khởi tạo hợp lệ lần đầu) giữa hai snapshot, hoặc `null` nếu mọi thứ hợp lệ.
 * Bao quanh toàn bộ test (beforeTest/afterTest): mọi sổ + players/ctrl/worldGhosts/worldShielded phải VỀ ĐÚNG MỨC.
 * worldGhosts / players / ctrl là RÒ TÍCH LŨY — xét TRƯỚC FIRST_INIT_KEYS để rò ghost KHÔNG bị `worlds: 0→1` che mất.
 */
const LEAK_FIRST_KEYS: (keyof Snap)[] = ["worldGhosts", "players", "ctrl", "worldShielded"];

function diffSnap(a: Snap, b: Snap): string | null {
  for (const k of LEAK_FIRST_KEYS) if (a[k] !== b[k]) return `${k}: ${a[k]} → ${b[k]}`;
  const keys = Object.keys(a) as (keyof Snap)[];
  for (const k of keys) {
    if (FIRST_INIT_KEYS.has(k) && a[k] === 0 && b[k] === 1) continue; // khởi tạo hợp lệ lần đầu (vòng đầu tạo phòng)
    if (a[k] !== b[k]) return `${k}: ${a[k]} → ${b[k]}`;
  }
  return null;
}

/**
 * Thoát chủ động rồi chờ server dọn sạch người của vòng đó. Phòng THƯỜNG (`autoDispose = false`) KHÔNG tự đóng — `worlds.size`
 * giữ nguyên, `onDispose` không chạy — nên chỉ đợi `players`/`ctrl` về 0 (đó mới là dấu vết rò của vòng vào-thoát). Phòng tạm
 * (bí cảnh / đấu trường) có `autoDispose` nên sẽ đóng; snapshot sau đó vẫn phải bằng snapshot trước về MỌI sổ. Chờ theo điều
 * kiện, KHÔNG sleep cố định.
 */
async function leaveAndClear(room: Room) {
  await room.leave(true);
  await waitFor(() => snapshot().players === 0, 8000);
}

describe("rò rỉ sổ Hub / phòng sau nhiều vòng đời (#1105)", () => {
  const gc =
    typeof (globalThis as { gc?: unknown }).gc === "function"
      ? (globalThis as unknown as { gc: () => void }).gc
      : undefined;

  it(
    "vào-thoát × N: mọi sổ về mức gốc + đo bộ nhớ mềm",
    { timeout: 120_000 },
    async () => {
      const N = 14;
      const heap: number[] = [];
      const beforeTest = snapshot(); // snapshot TRƯỚC khi vào vòng nào: mọi sổ + players/ctrl/ghosts ở mức gốc
      for (let i = 0; i < N; i++) {
        const room = await join(roundName());
        await leaveAndClear(room);
        if (gc) gc();
        heap.push(process.memoryUsage().heapUsed);
      }
      // Sau N vòng vào-thoát: mọi sổ dùng chung + players/ctrl/ghosts/phòng/phòng-sống/chat-sink HỒI VỀ ĐÚNG MỨC.
      // Rò (players/ctrl/ghosts/phòng sót) sẽ PHỒNG theo số vòng → snapshot sau khác trước.
      const afterTest = snapshot();
      expect(
        diffSnap(beforeTest, afterTest),
        "rò rỉ sau N vòng vào-thoát: " + diffSnap(beforeTest, afterTest),
      ).toBeNull();
      // Bộ nhớ MỀM: chỉ in + dán PR; đỏ CHỈ khi --expose-gc có sẵn và tăng > 50% (rò thật).
      const first = heap[0]!;
      const last = heap[heap.length - 1]!;
      const growPct = ((last - first) / Math.max(1, first)) * 100;
      // Tăng ở nửa cuối (ổn định): delta giữa vòng áp-t้าย và vòng cuối, loại nhiễu rác đầu.
      const base = heap[Math.floor(N * 0.5) - 1]!;
      const steadyPct = ((last - base) / Math.max(1, base)) * 100;
      console.log(
        `[leak] heapUsed: đầu ${Math.round(first / 1048576)}MB → cuối ${Math.round(last / 1048576)}MB ` +
          `(tăng ${growPct.toFixed(1)}%${gc ? "" : "; KHÔNG có --expose-gc nên gồm rác"}), ` +
          `tăng ổn định nửa cuối ${steadyPct.toFixed(1)}%`,
      );
      if (gc) expect(growPct, "bộ nhớ mềm tăng > 50%: có rò rỉ").toBeLessThanOrEqual(50);
    },
  );

  it(
    "rớt-nối lại × N: net-guard không rò sổ Hub / phòng",
    { timeout: 120_000 },
    async () => {
      const N = 8;
      const beforeTest = snapshot(); // snapshot TRƯỚC khi vào vòng nào: mọi sổ + players/ctrl/ghosts ở mức gốc
      for (let i = 0; i < N; i++) {
        const a = await join(roundName());
        const sid = a.sessionId;
        dropConnection(a);
        await waitFor(() => !a.connection.isOpen, 5000);
        // Chờ server giữ chỗ nối lại (onLeave đã gọi allowReconnection): token chỉ hợp lệ từ lúc này.
        await waitFor(() => (serverRoom(a) as any).ghosts.has(sid), 5000);
        const r2 = await reconnectTo(a);
        await waitFor(() => (r2.state as any).players.get(r2.sessionId), 5000);
        await leaveAndClear(r2);
      }
      // Sau N vòng rớt-nối lại-thoát: mọi sổ + players/ctrl/ghosts/phòng HỒI VỀ ĐÚNG MỨC. Rò (ghost sót, players/ctrl/phòng
      // phình) sẽ tích lũy → snapshot sau khác trước.
      const afterTest = snapshot();
      expect(
        diffSnap(beforeTest, afterTest),
        "rò rỉ sau N vòng rớt-nối lại: " + diffSnap(beforeTest, afterTest),
      ).toBeNull();
    },
  );
});
