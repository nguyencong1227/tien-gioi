// Đo mạng giật xả dồn input và trôi vị trí trên máy chủ Colyseus THẬT (Mục 41 QUYET_DINH_M3, PR #852, issue #857 [F1]).
//
// Mở rộng từ kịch bản gốc của Dev C (30/40 tin): thêm kịch bản 100 và 150 tin để kiểm giới hạn tần suất `input` burst 100 (nay ở #852):
//   - 100 tin: vừa khít burst 100 -> TẤT CẢ qua, kể cả 3 tin dừng ở đuôi -> tin dừng cuối tới nơi, nhân vật dừng nhanh.
//   - 150 tin: vượt burst 100 -> phần đuôi (bao gồm các tin dừng) BỊ BỎ ở lớp giới hạn tần suất -> đo hậu quả (trôi thêm, dừng chậm).
//
// Chạy lặp >= 10 lần (--iterations) và tổng hợp phân bố (min/median/mean/max + tỉ lệ tin dừng tới nơi k/N), vì thời gian tới của gói
// qua WebSocket dao động. Chờ theo ĐIỀU KIỆN (vị trí đứng yên >= 200 ms VÀ hàng đợi rỗng), KHÔNG sleep cố định. Cổng do hệ điều hành
// cấp (listenWithRetry, không bao giờ 2567); dữ liệu ghi vào thư mục tạm, tắt hết khi xong.
//
// Chạy: `npx tsx scripts/do-network-burst.ts --iterations 12` trong `server/`. Thêm `--suite new|old|all` để chọn nhóm kịch bản.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { PROTOCOL_VERSION, roomNameOf, DEFAULT_MAP_ID } from "@tien-gioi/shared";
import { listenWithRetry } from "../src/test-port";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Vị trí xuất phát ở sân trấn thông thoáng (gần tâm trấn, khu nền đá không vật cản) để đi dồn không đâm tường ngay. */
const START_X = 1300;
const START_Y = 1500;
/** Timeout tổng cho một kịch bản: phải lớn hơn thời gian đi hết hàng đợi (150 tin đi theo thời gian thật có thể tới ~5 s). */
const SCENARIO_TIMEOUT_MS = 8000;
/** Coi nhân vật "đứng yên hẳn" khi vị trí không đổi >= khoảng này VÀ hàng đợi đã rỗng. */
const SETTLE_STILL_MS = 200;

export interface BurstResult {
  scenario: string;
  settleTimeMs: number;
  driftPx: number;
  sentInputs: number;
  /** Input bị bỏ ở lớp giới hạn tần suất + hàng đợi = tổng số seq đuôi không bao giờ được áp (sent - lastSeq cuối, vì seq đơn điệu). */
  trailingDropped: number;
  /** Seq của tin dừng CUỐI cùng gửi đi; so với lastSeq cuối để biết tin dừng có tới nơi không. */
  lastStopSeq: number;
  finalLastSeq: number;
  /** Tin dừng có tới nơi (được máy chủ áp) không — tiêu chí mục 41 cho kịch bản 100 tin. */
  stopArrived: boolean;
  droppedInputs: number; // inputStats.dropped: bị bỏ vì hàng đợi đầy / bị tin dừng cắt (KHÔNG gồm bị giới hạn tần suất bỏ)
  maxSpeedPps: number;
}

async function runScenarioWithFreshClient(
  server: Server,
  port: number,
  scenarioName: string,
  options: { moveCount: number; stopCount: number; delayBetweenStopsMs?: number },
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

  // Đặt nhân vật ở vùng an toàn không có vật cản (sân trấn thông thoáng), lùi vào giữa một chút để đi dồn không đâm tường ngay
  p.x = START_X;
  p.y = START_Y;

  // Chờ đứng yên và hồi token bucket giới hạn tần suất về đầy (burst 100) trước khi xả dồn
  await sleep(300);

  const startX = p.x;
  const startY = p.y;
  const initialDropped = world.inputStats.dropped;

  let seq = 0;
  const movePackets: { seq: number; dx: number; dy: number }[] = [];
  for (let i = 0; i < options.moveCount; i++) {
    movePackets.push({ seq: ++seq, dx: 1, dy: 0 });
  }
  let lastStopSeq = 0;
  const stopPackets: { seq: number; dx: number; dy: number }[] = [];
  for (let i = 0; i < options.stopCount; i++) {
    stopPackets.push({ seq: ++seq, dx: 0, dy: 0 });
    lastStopSeq = seq;
  }

  const tBurstSent = performance.now();

  // Xả dồn các gói di chuyển (TCP giữ thứ tự: tin dừng ở ĐUÔI, nên bị bỏ thì bỏ đúng tin dừng — đúng hiện thực mạng giật)
  for (const pkt of movePackets) {
    room.send("input", pkt);
  }
  // Gửi các gói dừng (mô phỏng client mới #851: nhả phím gửi ngay tin dừng)
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

  const deadline = performance.now() + SCENARIO_TIMEOUT_MS;
  while (performance.now() < deadline) {
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
    // Đứng yên >= SETTLE_STILL_MS VÀ hàng đợi đã cạn -> đã dừng hẳn
    if (now - lastMoveTime >= SETTLE_STILL_MS && (getCtrl()?.inputs.length ?? 0) === 0) {
      break;
    }
  }

  const settleTimeMs = Math.max(0, Math.round(lastMoveTime - tBurstSent));
  const driftPx = Math.round(Math.hypot(lastX - startX, lastY - startY) * 10) / 10;
  const finalLastSeq = p.lastSeq ?? 0;
  // seq đơn điệu tăng: lastSeq cuối = seq của input được áp cao nhất; (sent - lastSeq) = số tin đuôi không bao giờ tới tay máy chủ
  const sentTotal = movePackets.length + stopPackets.length;
  const trailingDropped = sentTotal - finalLastSeq;
  const droppedInputs = world.inputStats.dropped - initialDropped;
  // Tin dừng tới nơi khi lastSeq cuối >= seq tin dừng cuối (máy chủ đã áp tin dừng đó)
  const stopArrived = stopPackets.length > 0 && finalLastSeq >= lastStopSeq;

  const result: BurstResult = {
    scenario: scenarioName,
    settleTimeMs,
    driftPx,
    sentInputs: sentTotal,
    trailingDropped,
    lastStopSeq,
    finalLastSeq,
    stopArrived,
    droppedInputs,
    maxSpeedPps: Math.round(maxObservedSpeed),
  };

  const droppedTotal = world.inputStats.dropped;
  const backlogTicksTotal = world.inputStats.backlogTicks;

  await room.leave(true);
  return { result, droppedTotal, backlogTicksTotal };
}

/** Một lượt chạy đủ các kịch bản (mỗi kịch bản một client mới). */
async function runSuiteOnce(
  server: Server,
  port: number,
  want: "new" | "old" | "all",
): Promise<BurstResult[]> {
  const results: BurstResult[] = [];
  const run = async (name: string, moveCount: number, stopCount: number, delay?: number) => {
    const { result } = await runScenarioWithFreshClient(server, port, name, {
      moveCount,
      stopCount,
      delayBetweenStopsMs: delay,
    });
    results.push(result);
  };

  if (want === "old" || want === "all") {
    // Các kịch bản gốc (Dev C, PR #852) — so sánh liên tục
    await run("Mạng đứng 1.5s (30 input) + 3 dừng (client mới)", 30, 3);
    await run("Mạng đứng 1.5s (30 input), không dừng (client cũ)", 30, 0);
    await run("Mạng đứng 2.0s (40 input) + 3 dừng (nhả phím)", 40, 3, 20);
    await run("Mạng đứng 2.0s (40 input), không dừng (client cũ)", 40, 0);
    await run("Spam dồn 200 input liên tiếp (DoS)", 200, 0);
  }
  if (want === "new" || want === "all") {
    // Mở rộng issue #857 [F1]: 100 và 150 tin so với giới hạn burst 100
    await run("100 tin (97 đi + 3 dừng) — vừa khít burst 100, tin dừng phải tới nơi", 97, 3);
    await run("100 tin (100 đi), không dừng (client cũ)", 100, 0);
    await run("150 tin (147 đi + 3 dừng) — vượt burst 100, đuôi (tin dừng) bị bỏ", 147, 3);
    await run("150 tin (150 đi), không dừng (client cũ)", 150, 0);
  }
  return results;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function max(xs: number[]): number {
  return Math.max(...xs);
}

interface Agg {
  scenario: string;
  n: number;
  settle: [number, number, number, number]; // min, median, mean, max
  drift: [number, number, number, number];
  trailing: [number, number, number, number];
  stopArrivedN: number; // tin dừng tới nơi k/N (khi có tin dừng)
  hasStop: boolean;
}

function aggregate(scenarios: BurstResult[]): Agg[] {
  const byName = new Map<string, BurstResult[]>();
  for (const r of scenarios) {
    const arr = byName.get(r.scenario) ?? [];
    arr.push(r);
    byName.set(r.scenario, arr);
  }
  const out: Agg[] = [];
  for (const [scenario, arr] of byName) {
    const settle = [
      Math.min(...arr.map((r) => r.settleTimeMs)),
      median(arr.map((r) => r.settleTimeMs)),
      Math.round(mean(arr.map((r) => r.settleTimeMs))),
      Math.max(...arr.map((r) => r.settleTimeMs)),
    ];
    const drift = [
      Math.min(...arr.map((r) => r.driftPx)),
      median(arr.map((r) => r.driftPx)),
      Math.round(mean(arr.map((r) => r.driftPx))),
      Math.max(...arr.map((r) => r.driftPx)),
    ];
    const trailing = [
      Math.min(...arr.map((r) => r.trailingDropped)),
      median(arr.map((r) => r.trailingDropped)),
      Math.round(mean(arr.map((r) => r.trailingDropped))),
      Math.max(...arr.map((r) => r.trailingDropped)),
    ];
    out.push({
      scenario,
      n: arr.length,
      settle,
      drift,
      trailing,
      stopArrivedN: arr.filter((r) => r.stopArrived).length,
      hasStop: arr.some((r) => r.lastStopSeq > 0),
    });
  }
  return out;
}

async function main() {
  const iters = Number(process.argv[process.argv.indexOf("--iterations") + 1] ?? 1) || 1;
  const want = (process.argv[process.argv.indexOf("--suite") + 1] ?? "all") as "new" | "old" | "all";
  console.log(
    `=== ĐO MẠNG GIẬT XẢ DỒN INPUT (Colyseus THẬT) — lặp ${iters} lần, nhóm kịch bản "${want}" — mục 41 / #857 [F1] ===`,
  );

  const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-burst-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom");
  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  const port = await listenWithRetry(server);

  const all: BurstResult[] = [];
  for (let i = 0; i < iters; i++) {
    const suite = await runSuiteOnce(server, port, want);
    // in tóm tắt mỗi lượt để theo dõi tiến độ / phát hiện chập chờn
    const line = suite
      .map((r) => `${r.scenario.slice(0, 18)}: dừng=${r.settleTimeMs}ms trôi=${r.driftPx}px đuôi_bị_bỏ=${r.trailingDropped}${r.hasStop ? ` dừng_tới=${r.stopArrived}` : ""}`)
      .join("\n    ");
    console.log(`--- lượt ${i + 1}/${iters} ---\n    ${line}`);
    all.push(...suite);
  }

  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });

  const agg = aggregate(all);
  console.log("\n### TỔNG HỢP (min / median / mean / max):");
  console.log("| Kịch bản | N | Dừng (ms): min/med/mean/max | Trôi (px): min/med/mean/max | Đuôi bị bỏ: min/med/mean/max | Tin dừng tới nơi |");
  console.log("|---|---:|---|---|---|---:|");
  for (const a of agg) {
    const stop = a.hasStop ? `${a.stopArrivedN}/${a.n}` : "—";
    console.log(
      `| ${a.scenario} | ${a.n} | ${a.settle[0]}/${a.settle[1]}/${a.settle[2]}/${a.settle[3]} | ${a.drift[0]}/${a.drift[1]}/${a.drift[2]}/${a.drift[3]} | ${a.trailing[0]}/${a.trailing[1]}/${a.trailing[2]}/${a.trailing[3]} | ${stop} |`,
    );
  }
  // JSON để ghi lại số THẬT
  console.log("\n### JSON:");
  console.log(JSON.stringify({ iterations: iters, suite: want, results: agg }, null, 2));
  process.exit(0);
}

if (process.argv[1]?.endsWith("do-network-burst.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
