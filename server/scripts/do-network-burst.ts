// Đo lường mạng giật xả dồn input và trôi vị trí trên máy chủ Colyseus THẬT (Mục 41 QUYET_DINH_M3 & PR #852).
// Kịch bản đo lường:
// 1. Mạng đứng 1.5s (30 input di chuyển), nhả phím gửi 3 input dừng (client mới).
// 2. Mạng đứng 1.5s (30 input di chuyển), không input dừng (client cũ).
// 3. Mạng đứng 2.0s (40 input di chuyển), nhả phím gửi 3 input dừng (cách nhau 5ms sau đợt xả dồn).
// 4. Mạng đứng 2.0s (40 input di chuyển), không input dừng (client cũ).
// 5. Gửi dồn 200 input liên tiếp (Spam DoS): kiểm tra tốc độ di chuyển không vượt quá giới hạn và số input bị drop.
// 6. Kiểm tra các chỉ số /metrics (input dropped, backlogTicks).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { PROTOCOL_VERSION, roomNameOf, DEFAULT_MAP_ID } from "@tien-gioi/shared";
import { listenWithRetry } from "../src/test-port";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface BurstResult {
  scenario: string;
  settleTimeMs: number;
  driftPx: number;
  sentInputs: number;
  droppedInputs: number;
  finalLastSeq: number;
  maxSpeedPps: number;
}

async function runScenarioWithFreshClient(
  server: Server,
  port: number,
  scenarioName: string,
  options: {
    moveCount: number;
    stopCount: number;
    delayBetweenStopsMs?: number;
    startDelayMs?: number;
  },
): Promise<{ result: BurstResult; droppedTotal: number; backlogTicksTotal: number }> {
  const client = new Client(`ws://localhost:${port}`);
  const name = `Bot${Math.floor(Math.random() * 89999 + 10000)}`;
  const room = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    name,
    secret: `secret-${name}-0123456789abcdef`,
    v: PROTOCOL_VERSION,
  });

  const wr: any = matchMaker.getLocalRoomById(room.roomId);
  const t0 = Date.now();
  while (!(room.state as any)?.players?.get(room.sessionId)) {
    if (Date.now() - t0 > 5000) throw new Error("Không vào được phòng sau 5s");
    await sleep(20);
  }

  const p = wr.state.players.get(room.sessionId);
  const getCtrl = () => wr.world.ctrl.get(room.sessionId);
  const world = wr.world;

  // Đặt nhân vật ở vị trí thoáng đãng
  p.x = 800;
  p.y = 800;

  // Chờ đứng yên và hồi token
  await sleep(options.startDelayMs ?? 200);

  const startX = p.x;
  const startY = p.y;
  const initialDropped = world.inputStats.dropped;

  let seq = 0;
  const movePackets: { seq: number; dx: number; dy: number }[] = [];
  for (let i = 0; i < options.moveCount; i++) {
    movePackets.push({ seq: ++seq, dx: 1, dy: 0 });
  }

  const stopPackets: { seq: number; dx: number; dy: number }[] = [];
  for (let i = 0; i < options.stopCount; i++) {
    stopPackets.push({ seq: ++seq, dx: 0, dy: 0 });
  }

  const tBurstSent = performance.now();

  // Xả dồn các gói di chuyển
  for (const pkt of movePackets) {
    room.send("input", pkt);
  }

  // Gửi các gói dừng
  if (options.delayBetweenStopsMs && options.delayBetweenStopsMs > 0) {
    for (const pkt of stopPackets) {
      await sleep(options.delayBetweenStopsMs);
      room.send("input", pkt);
    }
  } else {
    for (const pkt of stopPackets) {
      room.send("input", pkt);
    }
  }

  let lastX = p.x;
  let lastY = p.y;
  let lastMoveTime = tBurstSent;
  let maxObservedSpeed = 0;
  let lastSampleTime = tBurstSent;

  const timeoutAt = performance.now() + 3500;
  while (performance.now() < timeoutAt) {
    await sleep(10);
    const now = performance.now();
    const curX = p.x;
    const curY = p.y;
    const dt = (now - lastSampleTime) / 1000;
    if (dt > 0.005) {
      const dDist = Math.hypot(curX - lastX, curY - lastY);
      if (dDist > 0.001) {
        const speed = dDist / dt;
        if (speed > maxObservedSpeed) maxObservedSpeed = speed;
        lastMoveTime = now;
        lastX = curX;
        lastY = curY;
      }
      lastSampleTime = now;
    }

    if (now - lastMoveTime >= 200 && (getCtrl()?.inputs.length ?? 0) === 0) {
      break;
    }
  }

  const settleTimeMs = Math.max(0, Math.round(lastMoveTime - tBurstSent));
  const driftPx = Math.round(Math.hypot(lastX - startX, lastY - startY) * 10) / 10;
  const droppedInputs = world.inputStats.dropped - initialDropped;

  const result: BurstResult = {
    scenario: scenarioName,
    settleTimeMs,
    driftPx,
    sentInputs: movePackets.length + stopPackets.length,
    droppedInputs,
    finalLastSeq: p.lastSeq,
    maxSpeedPps: Math.round(maxObservedSpeed),
  };

  const droppedTotal = world.inputStats.dropped;
  const backlogTicksTotal = world.inputStats.backlogTicks;

  await room.leave(true);
  return { result, droppedTotal, backlogTicksTotal };
}

export async function runNetworkBurstSuite(): Promise<{
  results: BurstResult[];
  metrics: { dropped: number; backlogTicks: number };
}> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-burst-"));
  process.env.DATA_DIR = dataDir;

  const { defineRooms } = await import("../src/rooms/WorldRoom");
  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  const port = await listenWithRetry(server);

  const results: BurstResult[] = [];
  let lastDropped = 0;
  let lastBacklog = 0;

  // 1. Mạng đứng 1.5s (30 input di chuyển) + 3 input dừng (client mới)
  {
    const { result, droppedTotal, backlogTicksTotal } = await runScenarioWithFreshClient(
      server,
      port,
      "Mạng đứng 1.5s (30 input) + 3 input dừng (client mới)",
      { moveCount: 30, stopCount: 3 },
    );
    results.push(result);
    lastDropped = droppedTotal;
    lastBacklog = backlogTicksTotal;
  }

  // 2. Mạng đứng 1.5s (30 input di chuyển), không input dừng (client cũ)
  {
    const { result, droppedTotal, backlogTicksTotal } = await runScenarioWithFreshClient(
      server,
      port,
      "Mạng đứng 1.5s (30 input), không input dừng (client cũ)",
      { moveCount: 30, stopCount: 0 },
    );
    results.push(result);
    lastDropped = droppedTotal;
    lastBacklog = backlogTicksTotal;
  }

  // 3. Mạng đứng 2.0s (40 input di chuyển) + 3 input dừng (gửi nhịp 20ms)
  {
    const { result, droppedTotal, backlogTicksTotal } = await runScenarioWithFreshClient(
      server,
      port,
      "Mạng đứng 2.0s (40 input) + 3 input dừng (nhả phím)",
      { moveCount: 40, stopCount: 3, delayBetweenStopsMs: 20 },
    );
    results.push(result);
    lastDropped = droppedTotal;
    lastBacklog = backlogTicksTotal;
  }

  // 4. Mạng đứng 2.0s (40 input di chuyển), không input dừng (client cũ)
  {
    const { result, droppedTotal, backlogTicksTotal } = await runScenarioWithFreshClient(
      server,
      port,
      "Mạng đứng 2.0s (40 input), không input dừng (client cũ)",
      { moveCount: 40, stopCount: 0 },
    );
    results.push(result);
    lastDropped = droppedTotal;
    lastBacklog = backlogTicksTotal;
  }

  // 5. Gửi dồn 200 input liên tiếp (Spam DoS)
  {
    const { result, droppedTotal, backlogTicksTotal } = await runScenarioWithFreshClient(
      server,
      port,
      "Spam dồn 200 input liên tiếp (kiểm tra tốc độ tối đa & drop)",
      { moveCount: 200, stopCount: 0 },
    );
    results.push(result);
    lastDropped = droppedTotal;
    lastBacklog = backlogTicksTotal;
  }

  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });

  return { results, metrics: { dropped: lastDropped, backlogTicks: lastBacklog } };
}

async function main() {
  console.log("=== BẮT ĐẦU ĐO THỬ TẢI MẠNG GIẬT XẢ DỒN INPUT TRÊN COLYSEUS THẬT ===");
  const { results, metrics } = await runNetworkBurstSuite();

  console.log("\n### BẢNG KẾT QUẢ ĐO:");
  console.log("| Kịch bản | Gửi (pkt) | Đứng yên sau (ms) | Đi thêm (px) | Bị drop | Vận tốc max (px/s) |");
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const r of results) {
    console.log(
      `| ${r.scenario} | ${r.sentInputs} | ${r.settleTimeMs} ms | ${r.driftPx} px | ${r.droppedInputs} | ${r.maxSpeedPps} px/s |`,
    );
  }

  console.log(`\nMetrics: tiengioi_room_input_dropped_total=${metrics.dropped}, tiengioi_room_input_backlog_ticks_total=${metrics.backlogTicks}`);
}

if (process.argv[1]?.endsWith("do-network-burst.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
