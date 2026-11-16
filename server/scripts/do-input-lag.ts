// Đo độ TỤT HẬU hàng đợi input của máy chủ so với client gửi đúng 20 Hz (mục 25 QUYET_DINH_M3: di chuyển bàn phím giật).
// Máy chủ Colyseus thật trong tiến trình + một client colyseus.js gửi `input` theo lịch TUYỆT ĐỐI (50,000 ms, không trôi như setInterval):
// đúng cách trình duyệt gửi (bộ cộng dồn `acc` của WorldScene). In mỗi `--log` giây: số input đã gửi, `lastSeq` máy chủ đã xử lý,
// độ sâu hàng đợi (c.inputs) và số input BỊ BỎ (hàng đợi đầy). Chạy: `npx tsx scripts/do-input-lag.ts --seconds 120` trong `server/`.
// Cổng do hệ điều hành cấp (không bao giờ 2567); dữ liệu ghi vào thư mục tạm.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { PROTOCOL_VERSION, roomNameOf, DEFAULT_MAP_ID, TICK_MS } from "@tien-gioi/shared";
import { listenWithRetry } from "../src/test-port";

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : def;
  return Number.isFinite(v) ? v : def;
}
const SECONDS = arg("seconds", 120);
const LOG_S = arg("log", 10);
const SEND_HZ_MUL = arg("mul", 1); // 1 = đúng 20 Hz; 1.02 = nhanh hơn 2 % (thử ngưỡng)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-do-input-"));
process.env.DATA_DIR = dataDir;

async function main() {
  const { defineRooms } = await import("../src/rooms/WorldRoom");
  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  const port = await listenWithRetry(server);
  const client = new Client(`ws://localhost:${port}`);
  const name = "DoInput";
  const room = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    name,
    secret: `secret-${name}-0123456789abcdef`,
    v: PROTOCOL_VERSION,
  });
  const wr: any = matchMaker.getLocalRoomById(room.roomId);
  const t00 = Date.now();
  while (!(room.state as any)?.players?.get(room.sessionId)) {
    if (Date.now() - t00 > 5000) throw new Error("không vào được phòng");
    await sleep(20);
  }
  const me = () => (room.state as any).players.get(room.sessionId);
  const ctrl = () => wr.world.ctrl.get(room.sessionId);

  // đếm input được nhận vào hàng đợi (còn lại là bị bỏ vì đầy)
  const ctl0 = ctrl();
  const origPush = ctl0.inputs.push.bind(ctl0.inputs);
  let pushes = 0;
  ctl0.inputs.push = (...a: any[]) => {
    pushes++;
    return origPush(...a);
  };

  let seq = 0;
  const t0 = performance.now();
  const step = TICK_MS / SEND_HZ_MUL;
  let nextLog = LOG_S;
  let maxQ = 0;
  const total = Math.floor((SECONDS * 1000) / step);
  for (let n = 0; n < total; n++) {
    const wait = t0 + n * step - performance.now();
    if (wait > 0) await sleep(wait);
    // đổi hướng mỗi 40 input (2 s) để quay đi quay lại, không đâm tường
    const dx = Math.floor(n / 40) % 2 === 0 ? 1 : -1;
    room.send("input", { seq: ++seq, dx, dy: 0 });
    maxQ = Math.max(maxQ, ctrl()?.inputs.length ?? 0);
    const el = (performance.now() - t0) / 1000;
    if (el >= nextLog) {
      nextLog += LOG_S;
      const lastSeq = me()?.lastSeq ?? 0;
      console.log(
        `${el.toFixed(0).padStart(4)}s  gửi=${seq}  lastSeq=${lastSeq}  chưa xử lý=${seq - lastSeq}  hàng đợi=${ctrl()?.inputs.length}  hàng đợi tối đa=${maxQ}  đã vào hàng đợi=${pushes}`,
      );
      maxQ = 0;
    }
  }
  await sleep(2500); // xả hết
  console.log(
    JSON.stringify({
      sent: seq,
      accepted: pushes,
      droppedByQueueCap: seq - pushes,
      finalLastSeq: me()?.lastSeq ?? 0,
      secondsSent: SECONDS,
      mul: SEND_HZ_MUL,
    }),
  );
  await room.leave(true);
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
