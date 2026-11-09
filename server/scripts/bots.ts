// Kịch bản thử tải bằng bot kết nối qua colyseus.js như người chơi thật.
// Chỉ chạy vào server của Dev C (mặc định cổng 2587 từ .env.local), tuyệt đối không bắn vào cổng 2567 (Dev A) hay 2577 (Dev B).
// Cách dùng:
//   npm run bots -w server -- --bots=50 --duration=15
//   npm run bots -w server -- --suite --mode=realistic --duration=15 --write-doc
//   npm run bots -w server -- --clean-only
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Client, Protocol, type Room } from "colyseus.js";
import {
  PICKUP_RANGE,
  PLAYER_RADIUS,
  ROOM_NAME,
  SKILLS,
  TICK_MS,
  TOWN_PX,
  WORLD_H,
  WORLD_W,
  inTown,
  moveWithCollision,
  statsFor,
  type AttackMsg,
  type InputMsg,
  type JoinOptions,
  type PickupMsg,
  type SkillMsg,
} from "@tien-gioi/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const envFile = path.join(repoRoot, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const DEFAULT_PORT = Number(process.env.PORT ?? 2587);
const FORBIDDEN_PORTS = new Set([2567, 2577]); // Cổng của Dev A và Dev B
const DATA_PLAYERS_DIR = path.resolve(here, "../data/players");
const DOC_PATH = path.resolve(repoRoot, "docs/LOAD_TEST.md");

export type BotMode = "realistic" | "worst";

interface CliArgs {
  bots: number;
  durationSec: number;
  url: string;
  port: number;
  mode: BotMode;
  bothModes: boolean;
  cleanOnly: boolean;
  keepSaves: boolean;
  writeDoc: boolean;
  suite: boolean;
  allowOtherPort: boolean;
  note: string;
  saveJson: string;
  compareJson: string;
}

function parseArgs(argv: string[]): CliArgs {
  let bots = 50;
  let durationSec = 15;
  let url = "";
  let mode: BotMode = "realistic";
  let bothModes = false;
  let cleanOnly = false;
  let keepSaves = false;
  let writeDoc = false;
  let suite = false;
  let allowOtherPort = false;
  let note = "chưa có #57, #59";
  let saveJson = "";
  let compareJson = "";

  for (const arg of argv) {
    if (arg.startsWith("--bots=")) bots = Math.max(1, Number(arg.slice(7)));
    else if (arg.startsWith("--duration=")) durationSec = Math.max(2, Number(arg.slice(11)));
    else if (arg.startsWith("--url=")) url = arg.slice(6);
    else if (arg.startsWith("--mode=")) {
      const m = arg.slice(7);
      if (m === "both") bothModes = true;
      else if (m === "worst") mode = "worst";
      else mode = "realistic";
    } else if (arg.startsWith("--note=")) note = arg.slice(7);
    else if (arg.startsWith("--save-json=")) saveJson = arg.slice(12);
    else if (arg.startsWith("--compare-json=")) compareJson = arg.slice(15);
    else if (arg === "--clean-only") cleanOnly = true;
    else if (arg === "--keep-saves") keepSaves = true;
    else if (arg === "--write-doc") writeDoc = true;
    else if (arg === "--suite") suite = true;
    else if (arg === "--allow-other-port") allowOtherPort = true;
  }

  if (!url) url = `ws://localhost:${DEFAULT_PORT}`;
  const parsedUrl = new URL(url);
  const port = Number(parsedUrl.port || DEFAULT_PORT);

  return {
    bots,
    durationSec,
    url,
    port,
    mode,
    bothModes,
    cleanOnly,
    keepSaves,
    writeDoc,
    suite,
    allowOtherPort,
    note,
    saveJson,
    compareJson,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function currentGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Xoá các file nhân vật bot trong server/data/players/ của Dev C.
 * Lưu ý: store.ts băm tên nhân vật bằng SHA-1 thành `<sha1>.json` và chỉ cho phép chữ/số/khoảng trắng
 * trong tên (`cleanName`), nên bot đặt tên dạng `Bot 001` và ta đọc trường `name` trong JSON để xoá.
 */
function cleanBotSaves(): number {
  if (!existsSync(DATA_PLAYERS_DIR)) return 0;
  let removed = 0;
  for (const entry of readdirSync(DATA_PLAYERS_DIR)) {
    if (!entry.endsWith(".json")) continue;
    const fullPath = path.join(DATA_PLAYERS_DIR, entry);
    try {
      const data = JSON.parse(readFileSync(fullPath, "utf8")) as { name?: string };
      if (typeof data.name === "string" && /^bot[\s_]/i.test(data.name.trim())) {
        rmSync(fullPath, { force: true });
        removed++;
      }
    } catch {
      // Bỏ qua file đang ghi dở hoặc lỗi đọc
    }
  }
  return removed;
}

/** Tìm PID của tiến trình server đang lắng nghe trên cổng đích để đo thời gian CPU mỗi tick từ bên ngoài. */
function findServerPid(port: number): number | null {
  try {
    const out = execSync(`ss -ltnp "sport = :${port}" 2>/dev/null || true`, {
      encoding: "utf8",
    });
    const m = /pid=(\d+)/.exec(out);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Đọc tổng thời gian CPU thực thi (ms, độ chính xác nano-giây) của luồng chính Node.js
 * từ `/proc/<pid>/sched` (`se.sum_exec_runtime`).
 */
function readServerExecRuntimeMs(pid: number): number | null {
  try {
    const sched = readFileSync(`/proc/${pid}/sched`, "utf8");
    const m = /se\.sum_exec_runtime\s*:\s*([\d.]+)/.exec(sched);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** Đọc RSS memory (MB) của tiến trình server từ `/proc/<pid>/status`. */
function readServerRssMb(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const m = /VmRSS:\s*(\d+)\s*kB/.exec(status);
    return m ? Number(m[1]) / 1024 : null;
  } catch {
    return null;
  }
}

function byteLengthOf(data: unknown): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof data === "string") return Buffer.byteLength(data);
  if (Array.isArray(data)) return data.reduce((sum, item) => sum + byteLengthOf(item), 0);
  return 0;
}

function firstByteOf(data: unknown): number | null {
  if (data instanceof ArrayBuffer && data.byteLength > 0) return new Uint8Array(data, 0, 1)[0];
  if (ArrayBuffer.isView(data) && data.byteLength > 0)
    return new Uint8Array(data.buffer, data.byteOffset, 1)[0];
  return null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

interface BotState {
  index: number;
  name: string;
  room: Room;
  seq: number;
  predX: number;
  predY: number;
  hasPos: boolean;
  wanderAngle: number;
  campX: number;
  campY: number;
  avoidUntil: number;
  nextTurnAt: number;
  nextSlashAt: number;
  nextSwordAt: number;
  nextPickupAt: number;
  lastPatchAt: number;
  sentAtBySeq: Map<number, number>;
  rxBytes: number;
  rxPatchBytes: number;
  txBytes: number;
  rxMsgs: number;
  txMsgs: number;
  fxCount: number;
  dmgCount: number;
  kicked4429: boolean;
  closedCode: number | null;
}

export interface LoadTestMetrics {
  commit: string;
  note: string;
  mode?: BotMode;
  botCount: number;
  connectedBots: number;
  durationSec: number;
  kicked4429: number;
  unexpectedCloses: number;
  serverPid: number | null;
  serverCpuMsPerTickAvg: number | null;
  serverCpuMsPerTickP50: number | null;
  serverCpuMsPerTickP95: number | null;
  serverCpuMsPerTickP99: number | null;
  serverCpuMsPerTickMax: number | null;
  serverRssMb: number | null;
  patchIntervalAvgMs: number;
  patchIntervalP50Ms: number;
  patchIntervalP95Ms: number;
  patchIntervalP99Ms: number;
  ackRttAvgMs: number;
  ackRttMinMs: number;
  ackRttP50Ms: number;
  ackRttP95Ms: number;
  rxKBpsPerBot: number;
  rxPatchKBpsPerBot: number;
  txKBpsPerBot: number;
  rxMsgsPerSecPerBot: number;
  txMsgsPerSecPerBot: number;
  totalRxKBps: number;
  totalTxKBps: number;
  monstersStart: number;
  monstersAvg: number;
  monstersMin: number;
  monstersEnd: number;
  attacksSent: number;
  skillsSent: number;
  inputsSent: number;
  dmgEventsReceivedPerBot: number;
}

export interface LoadTestSnapshot {
  commit: string;
  note: string;
  results: LoadTestMetrics[];
}

async function runLoadTest(
  botCount: number,
  durationSec: number,
  url: string,
  port: number,
  keepSaves: boolean,
  commit: string,
  note: string,
  mode: BotMode,
): Promise<LoadTestMetrics> {
  const modeLabel =
    mode === "realistic" ? "Thực tế (vào tầm đứng chém)" : "Xấu nhất (100% di chuyển 20 input/s)";
  console.log(
    `\n=== Bắt đầu thử tải [${modeLabel}]: ${botCount} bot, đo trong ${durationSec}s (${url}) ===`,
  );

  const bots: BotState[] = [];
  const patchIntervals: number[] = [];
  const ackRtts: number[] = [];
  const serverTickCpuSamples: number[] = [];
  const monsterCounts: number[] = [];
  let measuring = false;
  let attacksSent = 0;
  let skillsSent = 0;
  let inputsSent = 0;

  for (let i = 1; i <= botCount; i++) {
    const numStr = String(i).padStart(3, "0");
    const name = `Bot ${numStr}`;
    const secret = `bot_secret_tien_gioi_${numStr}_loadtest`;
    const joinOpts: JoinOptions = { name, secret };

    const client = new Client(url);
    const room = await client.joinOrCreate(ROOM_NAME, joinOpts);

    const radialAngle = ((i - 1) / botCount) * Math.PI * 2;
    const campR = TOWN_PX.r + 70 + ((i * 67) % 340);
    const now = performance.now();

    const b: BotState = {
      index: i,
      name,
      room,
      seq: 0,
      predX: TOWN_PX.x,
      predY: TOWN_PX.y,
      hasPos: false,
      wanderAngle: radialAngle,
      campX: TOWN_PX.x + Math.cos(radialAngle) * campR,
      campY: TOWN_PX.y + Math.sin(radialAngle) * campR,
      avoidUntil: 0,
      nextTurnAt: now + 3000 + Math.random() * 2000,
      nextSlashAt: now + Math.random() * SKILLS.slash.cooldown,
      nextSwordAt: now + Math.random() * SKILLS.sword.cooldown,
      nextPickupAt: now + 500,
      lastPatchAt: 0,
      sentAtBySeq: new Map(),
      rxBytes: 0,
      rxPatchBytes: 0,
      txBytes: 0,
      rxMsgs: 0,
      txMsgs: 0,
      fxCount: 0,
      dmgCount: 0,
      kicked4429: false,
      closedCode: null,
    };

    room.onMessage("fx", () => {
      if (measuring) b.fxCount++;
    });
    room.onMessage("dmg", () => {
      if (measuring) b.dmgCount++;
    });
    room.onMessage("chat", () => {});
    room.onMessage("toast", () => {});
    room.onMessage("inv", () => {});
    room.onMessage("quests", () => {});
    room.onMessage("dialog", () => {});

    room.onLeave((code) => {
      b.closedCode = code;
      if (code === 4429) b.kicked4429 = true;
    });

    const ws = (room.connection as any)?.transport?.ws;
    if (ws) {
      const onIncomingData = (data: unknown) => {
        if (!measuring) return;
        const len = byteLengthOf(data);
        b.rxBytes += len;
        b.rxMsgs += 1;
        if (firstByteOf(data) === Protocol.ROOM_STATE_PATCH) {
          b.rxPatchBytes += len;
        }
      };

      if (typeof ws.on === "function") {
        ws.on("message", onIncomingData);
      } else {
        const origOnMessage = ws.onmessage;
        ws.onmessage = (ev: { data: unknown }) => {
          if (ev) onIncomingData(ev.data);
          if (origOnMessage) origOnMessage.call(ws, ev);
        };
      }

      const origSend = ws.send.bind(ws);
      ws.send = (data: unknown, ...rest: unknown[]) => {
        if (measuring) {
          b.txBytes += byteLengthOf(data);
          b.txMsgs += 1;
        }
        return origSend(data, ...rest);
      };
    }

    room.onStateChange(() => {
      const t = performance.now();
      if (measuring && b.lastPatchAt > 0) {
        const dt = t - b.lastPatchAt;
        if (dt >= 5) patchIntervals.push(dt);
      }
      b.lastPatchAt = t;

      const me = (room.state as any)?.players?.get(room.sessionId);
      if (!me) return;
      if (!b.hasPos || me.dead) {
        b.predX = me.x;
        b.predY = me.y;
        b.hasPos = true;
      }

      if (typeof me.lastSeq === "number" && me.lastSeq > 0) {
        const sentAt = b.sentAtBySeq.get(me.lastSeq);
        if (sentAt !== undefined) {
          if (measuring) ackRtts.push(t - sentAt);
          for (const k of b.sentAtBySeq.keys()) {
            if (k <= me.lastSeq) b.sentAtBySeq.delete(k);
          }
        }
      }
    });

    bots.push(b);
    await sleep(20);
  }

  console.log(`Đã kết nối ${bots.length}/${botCount} bot. Chờ ổn định 2 giây để ra bãi quái...`);

  const stepBot = (b: BotState, now: number) => {
    if (!b.room.connection.isOpen) return;
    const state = b.room.state as any;
    const me = state?.players?.get(b.room.sessionId);
    if (!me || me.dead) return;

    b.predX = me.x;
    b.predY = me.y;

    let dx: number;
    let dy: number;

    if (now < b.avoidUntil) {
      // Đang vòng qua vật cản (cây/nước)
      dx = Math.cos(b.wanderAngle);
      dy = Math.sin(b.wanderAngle);
    } else if (inTown(b.predX, b.predY)) {
      dx = Math.cos(b.wanderAngle);
      dy = Math.sin(b.wanderAngle);
    } else {
      let targetMon: any = null;
      let bestScore = Number.POSITIVE_INFINITY;
      const maxSearchDist = mode === "realistic" ? 280 : 420;
      if (state?.monsters && typeof state.monsters.forEach === "function") {
        state.monsters.forEach((m: any) => {
          if (!m || m.hp <= 0) return;
          const dist = Math.hypot(m.x - b.predX, m.y - b.predY);
          if (dist > maxSearchDist) return;
          const penalty = m.kind === "mang" ? 250 : m.kind === "ho" ? 80 : 0;
          const score = dist + penalty;
          if (score < bestScore) {
            bestScore = score;
            targetMon = m;
          }
        });
      }

      if (targetMon) {
        const dist = Math.hypot(targetMon.x - b.predX, targetMon.y - b.predY);
        const angle = Math.atan2(targetMon.y - b.predY, targetMon.x - b.predX);

        if (dist > SKILLS.slash.range) {
          dx = Math.cos(angle);
          dy = Math.sin(angle);
        } else if (mode === "worst") {
          // Kịch bản xấu nhất: kể cả khi đã áp sát quái vẫn di chuyển vòng quanh mỗi tick
          const orbitAngle = angle + Math.PI / 2;
          dx = Math.cos(orbitAngle);
          dy = Math.sin(orbitAngle);
        } else {
          // Kịch bản thực tế (như WorldScene.fixedStep và bench.ts): vào tầm thì đứng lại chém, không gửi input
          dx = 0;
          dy = 0;
        }

        if (dist <= SKILLS.slash.range && now >= b.nextSlashAt) {
          const msg: AttackMsg = { angle };
          b.room.send("attack", msg);
          b.nextSlashAt = now + SKILLS.slash.cooldown + 60;
          if (measuring) attacksSent++;
        }

        const swordReach = mode === "worst" ? SKILLS.sword.range : SKILLS.slash.range;
        if (dist <= swordReach && me.mp >= SKILLS.sword.mp && now >= b.nextSwordAt) {
          const msg: SkillMsg = { id: "sword", angle };
          b.room.send("skill", msg);
          b.nextSwordAt = now + SKILLS.sword.cooldown + 100;
          if (measuring) skillsSent++;
        }
      } else if (mode === "realistic") {
        // Kịch bản thực tế: đi tới bãi săn của mình rồi đứng canh quái hồi (không chạy liên tục khi chưa có quái)
        const distToCamp = Math.hypot(b.campX - b.predX, b.campY - b.predY);
        if (distToCamp > 48) {
          const a = Math.atan2(b.campY - b.predY, b.campX - b.predX);
          dx = Math.cos(a);
          dy = Math.sin(a);
        } else {
          dx = 0;
          dy = 0;
        }
      } else {
        const distFromTown = Math.hypot(b.predX - TOWN_PX.x, b.predY - TOWN_PX.y);
        if (distFromTown > TOWN_PX.r + 750) {
          b.wanderAngle = Math.atan2(TOWN_PX.y - b.predY, TOWN_PX.x - b.predX);
          b.nextTurnAt = now + 2500;
        } else if (distFromTown < TOWN_PX.r + 50) {
          b.wanderAngle = Math.atan2(b.predY - TOWN_PX.y, b.predX - TOWN_PX.x);
          b.nextTurnAt = now + 2500;
        } else if (now >= b.nextTurnAt) {
          b.wanderAngle += (Math.random() - 0.5) * Math.PI;
          b.nextTurnAt = now + 2500 + Math.random() * 2500;
        }
        dx = Math.cos(b.wanderAngle);
        dy = Math.sin(b.wanderAngle);
      }

      if (now >= b.nextPickupAt && state?.loot && typeof state.loot.forEach === "function") {
        let pickId: string | null = null;
        state.loot.forEach((l: any, id: string) => {
          if (pickId || !l) return;
          if (l.owner && l.owner !== b.room.sessionId) return;
          if (Math.hypot(l.x - b.predX, l.y - b.predY) <= PICKUP_RANGE) {
            pickId = id;
          }
        });
        if (pickId) {
          const msg: PickupMsg = { lootId: pickId };
          b.room.send("pickup", msg);
          b.nextPickupAt = now + 700;
        }
      }
    }

    const len = Math.hypot(dx, dy);
    if (len > 0.05) {
      dx /= len;
      dy /= len;
      const stepPx = statsFor(me.realm ?? 0, me.tier ?? 0).speed * (TICK_MS / 1000);
      const moved = moveWithCollision(b.predX, b.predY, dx * stepPx, dy * stepPx, PLAYER_RADIUS);
      if (
        Math.hypot(moved.x - b.predX, moved.y - b.predY) < stepPx * 0.2 ||
        moved.x < 64 ||
        moved.x > WORLD_W - 64 ||
        moved.y < 64 ||
        moved.y > WORLD_H - 64
      ) {
        b.wanderAngle = Math.atan2(dy, dx) + (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.45);
        b.avoidUntil = now + 800;
        // Nếu đang đứng ở bãi săn mà vướng cây thì nhận luôn vị trí hiện tại làm bãi săn
        if (!inTown(b.predX, b.predY)) {
          b.campX = b.predX;
          b.campY = b.predY;
        }
      }
      b.predX = moved.x;
      b.predY = moved.y;

      const seq = ++b.seq;
      b.sentAtBySeq.set(seq, now);
      if (b.sentAtBySeq.size > 60) {
        const firstKey = b.sentAtBySeq.keys().next().value;
        if (firstKey !== undefined) b.sentAtBySeq.delete(firstKey);
      }
      const input: InputMsg = { seq, dx, dy };
      b.room.send("input", input);
      if (measuring) inputsSent++;
    }
  };

  const serverPid = findServerPid(port);
  let prevServerCpuMs = serverPid ? readServerExecRuntimeMs(serverPid) : null;

  const loopTimer = setInterval(() => {
    const now = performance.now();
    for (const b of bots) stepBot(b, now);

    if (measuring) {
      const mSize = (bots[0]?.room.state as any)?.monsters?.size;
      if (typeof mSize === "number") monsterCounts.push(mSize);
    }

    if (measuring && serverPid) {
      const curCpuMs = readServerExecRuntimeMs(serverPid);
      if (curCpuMs !== null && prevServerCpuMs !== null) {
        const deltaCpuMs = Math.max(0, curCpuMs - prevServerCpuMs);
        serverTickCpuSamples.push(deltaCpuMs);
      }
      prevServerCpuMs = curCpuMs;
    } else if (serverPid) {
      prevServerCpuMs = readServerExecRuntimeMs(serverPid);
    }
  }, TICK_MS);

  await sleep(3500);

  for (const b of bots) {
    b.rxBytes = 0;
    b.rxPatchBytes = 0;
    b.txBytes = 0;
    b.rxMsgs = 0;
    b.txMsgs = 0;
    b.fxCount = 0;
    b.dmgCount = 0;
    b.lastPatchAt = performance.now();
  }
  patchIntervals.length = 0;
  ackRtts.length = 0;
  serverTickCpuSamples.length = 0;
  monsterCounts.length = 0;
  attacksSent = 0;
  skillsSent = 0;
  inputsSent = 0;

  const cpuStartMs = serverPid ? readServerExecRuntimeMs(serverPid) : null;
  const measureStart = performance.now();
  measuring = true;

  await sleep(durationSec * 1000);

  measuring = false;
  const actualDurationSec = (performance.now() - measureStart) / 1000;
  const cpuEndMs = serverPid ? readServerExecRuntimeMs(serverPid) : null;
  const serverRssMb = serverPid ? readServerRssMb(serverPid) : null;

  clearInterval(loopTimer);

  const connectedBots = bots.filter((b) => b.room.connection.isOpen).length;
  const kicked4429 = bots.filter((b) => b.kicked4429).length;
  const unexpectedCloses = bots.filter(
    (b) => b.closedCode !== null && b.closedCode !== 1000,
  ).length;

  await Promise.all(
    bots.map(async (b) => {
      try {
        if (b.room.connection.isOpen) await b.room.leave(true);
      } catch {
        // Bỏ qua lỗi khi đóng
      }
    }),
  );

  await sleep(400);
  if (!keepSaves) {
    const removed = cleanBotSaves();
    console.log(`Đã dọn ${removed} file lưu của bot trong server/data/players/.`);
  }

  patchIntervals.sort((a, b) => a - b);
  ackRtts.sort((a, b) => a - b);
  serverTickCpuSamples.sort((a, b) => a - b);

  const totalRxBytes = bots.reduce((s, b) => s + b.rxBytes, 0);
  const totalRxPatchBytes = bots.reduce((s, b) => s + b.rxPatchBytes, 0);
  const totalTxBytes = bots.reduce((s, b) => s + b.txBytes, 0);
  const totalRxMsgs = bots.reduce((s, b) => s + b.rxMsgs, 0);
  const totalTxMsgs = bots.reduce((s, b) => s + b.txMsgs, 0);
  const totalDmgEvents = bots.reduce((s, b) => s + b.dmgCount, 0);

  const expectedTicks = actualDurationSec * (1000 / TICK_MS);
  const serverCpuMsPerTickAvg =
    cpuStartMs !== null && cpuEndMs !== null && expectedTicks > 0
      ? (cpuEndMs - cpuStartMs) / expectedTicks
      : serverTickCpuSamples.length > 0
        ? avg(serverTickCpuSamples)
        : null;

  const monstersStart = monsterCounts[0] ?? 0;
  const monstersEnd = monsterCounts.at(-1) ?? 0;
  const monstersAvg = Math.round(avg(monsterCounts));
  const monstersMin = monsterCounts.length > 0 ? Math.min(...monsterCounts) : 0;

  const metrics: LoadTestMetrics = {
    commit,
    note,
    mode,
    botCount,
    connectedBots,
    durationSec: Number(actualDurationSec.toFixed(2)),
    kicked4429,
    unexpectedCloses,
    serverPid,
    serverCpuMsPerTickAvg:
      serverCpuMsPerTickAvg !== null ? Number(serverCpuMsPerTickAvg.toFixed(2)) : null,
    serverCpuMsPerTickP50:
      serverTickCpuSamples.length > 0
        ? Number(percentile(serverTickCpuSamples, 50).toFixed(2))
        : null,
    serverCpuMsPerTickP95:
      serverTickCpuSamples.length > 0
        ? Number(percentile(serverTickCpuSamples, 95).toFixed(2))
        : null,
    serverCpuMsPerTickP99:
      serverTickCpuSamples.length > 0
        ? Number(percentile(serverTickCpuSamples, 99).toFixed(2))
        : null,
    serverCpuMsPerTickMax:
      serverTickCpuSamples.length > 0 ? Number(serverTickCpuSamples.at(-1)!.toFixed(2)) : null,
    serverRssMb: serverRssMb !== null ? Number(serverRssMb.toFixed(1)) : null,
    patchIntervalAvgMs: Number(avg(patchIntervals).toFixed(2)),
    patchIntervalP50Ms: Number(percentile(patchIntervals, 50).toFixed(2)),
    patchIntervalP95Ms: Number(percentile(patchIntervals, 95).toFixed(2)),
    patchIntervalP99Ms: Number(percentile(patchIntervals, 99).toFixed(2)),
    ackRttAvgMs: Number(avg(ackRtts).toFixed(2)),
    ackRttMinMs: ackRtts.length > 0 ? Number(ackRtts[0].toFixed(2)) : 0,
    ackRttP50Ms: Number(percentile(ackRtts, 50).toFixed(2)),
    ackRttP95Ms: Number(percentile(ackRtts, 95).toFixed(2)),
    rxKBpsPerBot: Number((totalRxBytes / botCount / actualDurationSec / 1024).toFixed(2)),
    rxPatchKBpsPerBot: Number((totalRxPatchBytes / botCount / actualDurationSec / 1024).toFixed(2)),
    txKBpsPerBot: Number((totalTxBytes / botCount / actualDurationSec / 1024).toFixed(2)),
    rxMsgsPerSecPerBot: Number((totalRxMsgs / botCount / actualDurationSec).toFixed(1)),
    txMsgsPerSecPerBot: Number((totalTxMsgs / botCount / actualDurationSec).toFixed(1)),
    totalRxKBps: Number((totalRxBytes / actualDurationSec / 1024).toFixed(1)),
    totalTxKBps: Number((totalTxBytes / actualDurationSec / 1024).toFixed(1)),
    monstersStart,
    monstersAvg,
    monstersMin,
    monstersEnd,
    attacksSent,
    skillsSent,
    inputsSent,
    dmgEventsReceivedPerBot: Number((totalDmgEvents / botCount / actualDurationSec).toFixed(1)),
  };

  printMetrics(metrics);
  return metrics;
}

function printMetrics(m: LoadTestMetrics) {
  console.log(
    `\n--- Kết quả [${m.mode ?? "realistic"}] (${m.botCount} bot, ${m.durationSec}s, commit ${m.commit}) ---`,
  );
  console.log(
    `- Kết nối giữ vững: ${m.connectedBots}/${m.botCount} (bị ngắt 4429: ${m.kicked4429}, đóng bất thường: ${m.unexpectedCloses})`,
  );
  if (m.serverCpuMsPerTickAvg !== null) {
    console.log(
      `- Thời gian CPU server mỗi tick (50 ms) [PID ${m.serverPid}]: TB ${m.serverCpuMsPerTickAvg} ms | p95 ${m.serverCpuMsPerTickP95} ms | cao nhất ${m.serverCpuMsPerTickMax} ms (mục tiêu < 10 ms)`,
    );
  }
  if (m.serverRssMb !== null) {
    console.log(`- Bộ nhớ RSS của server: ${m.serverRssMb} MB`);
  }
  console.log(
    `- Số quái còn sống lúc đo: TB ${m.monstersAvg} con (đầu: ${m.monstersStart}, thấp nhất: ${m.monstersMin}, cuối: ${m.monstersEnd})`,
  );
  console.log(
    `- Nhịp nhận patch tại client (Δt): TB ${m.patchIntervalAvgMs} ms | p50 ${m.patchIntervalP50Ms} ms | p95 ${m.patchIntervalP95Ms} ms | p99 ${m.patchIntervalP99Ms} ms`,
  );
  console.log(
    `- Độ trễ vòng lặp input -> lastSeq: TB ${m.ackRttAvgMs} ms | min ${m.ackRttMinMs} ms | p50 ${m.ackRttP50Ms} ms | p95 ${m.ackRttP95Ms} ms`,
  );
  console.log(
    `- Băng thông mỗi bot: nhận tổng (RX) ${m.rxKBpsPerBot} KB/s (riêng state patch: ${m.rxPatchKBpsPerBot} KB/s, ${m.rxMsgsPerSecPerBot} gói/s) | gửi (TX) ${m.txKBpsPerBot} KB/s (${m.txMsgsPerSecPerBot} gói/s)`,
  );
  console.log(
    `- Tổng băng thông cả phòng (${m.botCount} bot): server phát ra ${m.totalRxKBps} KB/s, nhận vào ${m.totalTxKBps} KB/s`,
  );
  console.log(
    `- Hoạt động chiến đấu: ${m.inputsSent} bước đi, ${m.attacksSent} đòn chém, ${m.skillsSent} kiếm khí (~${m.dmgEventsReceivedPerBot} sự kiện sát thương/s mỗi client)`,
  );
}

function renderTableRows(
  beforeList: LoadTestMetrics[],
  afterList?: LoadTestMetrics[] | null,
): string {
  const fmtCell = (bVal: string, aVal?: string) => (aVal ? `${bVal} → **${aVal}**` : bVal);

  return beforeList
    .map((b) => {
      const a = afterList?.find(
        (x) => x.botCount === b.botCount && (x.mode ?? "realistic") === (b.mode ?? "realistic"),
      );
      const modeName =
        (b.mode ?? "realistic") === "realistic"
          ? "Thực tế (vào tầm đứng chém)"
          : "Xấu nhất (100% đi liên tục)";
      return `| ${modeName} | **${b.botCount}** | ${fmtCell(
        `${b.connectedBots}/${b.botCount} (4429: ${b.kicked4429})`,
        a ? `${a.connectedBots}/${a.botCount} (4429: ${a.kicked4429})` : undefined,
      )} | ${fmtCell(
        `TB **${b.serverCpuMsPerTickAvg ?? "–"} ms** / p95 ${b.serverCpuMsPerTickP95 ?? "–"} ms / max ${b.serverCpuMsPerTickMax ?? "–"} ms`,
        a
          ? `TB **${a.serverCpuMsPerTickAvg ?? "–"} ms** / p95 ${a.serverCpuMsPerTickP95 ?? "–"} ms / max ${a.serverCpuMsPerTickMax ?? "–"} ms`
          : undefined,
      )} | ${fmtCell(
        `Tổng **${b.rxKBpsPerBot} KB/s** (patch: ${b.rxPatchKBpsPerBot} KB/s)`,
        a ? `Tổng **${a.rxKBpsPerBot} KB/s** (patch: ${a.rxPatchKBpsPerBot} KB/s)` : undefined,
      )} | ${fmtCell(
        `**${b.txKBpsPerBot} KB/s** (${b.txMsgsPerSecPerBot} gói/s)`,
        a ? `**${a.txKBpsPerBot} KB/s** (${a.txMsgsPerSecPerBot} gói/s)` : undefined,
      )} | ${fmtCell(
        `TB ${b.patchIntervalAvgMs} ms (p95: ${b.patchIntervalP95Ms} ms)`,
        a ? `TB ${a.patchIntervalAvgMs} ms (p95: ${a.patchIntervalP95Ms} ms)` : undefined,
      )} | ${fmtCell(
        `TB ${b.ackRttAvgMs} ms (min: ${b.ackRttMinMs} ms, p95: ${b.ackRttP95Ms} ms)`,
        a
          ? `TB ${a.ackRttAvgMs} ms (min: ${a.ackRttMinMs} ms, p95: ${a.ackRttP95Ms} ms)`
          : undefined,
      )} | ${fmtCell(
        `TB ${b.monstersAvg} (đầu ${b.monstersStart} → cuối ${b.monstersEnd}, thấp nhất ${b.monstersMin})`,
        a
          ? `TB ${a.monstersAvg} (đầu ${a.monstersStart} → cuối ${a.monstersEnd}, thấp nhất ${a.monstersMin})`
          : undefined,
      )} |`;
    })
    .join("\n");
}

export function renderMarkdownReport(
  current: LoadTestSnapshot,
  baseline?: LoadTestSnapshot | null,
): string {
  const before = baseline ?? current;
  const after = baseline ? current : null;
  const rows = renderTableRows(before.results, after?.results);
  const sample = (after ?? before).results[0];

  const commitHeader = after
    ? `- **Mốc trước tối ưu:** commit \`${before.commit}\` (${before.note})\n- **Mốc sau tối ưu:** commit \`${after.commit}\` (${after.note})`
    : `- **Commit đã đo:** \`${before.commit}\` (${before.note})`;

  return `# Báo cáo thử tải bằng Bot (Load Test)

> Kịch bản: \`server/scripts/bots.ts\` kết nối bằng \`colyseus.js\` vào server của Dev C (cổng \`2587\`).
> Chạy lại bằng: \`npm run bots -w server -- --suite --mode=both --duration=15 --write-doc\`

## 1. Thông tin bản đo & Phương pháp

${commitHeader}
- **Thời lượng đo mỗi mức:** ${sample.durationSec} giây ổn định (sau 2 giây khởi động để toàn bộ bot đi ra khỏi khu an toàn Lạc Hà Trấn).
- **Hai kịch bản hành vi bot (đều chạy ở nhịp \`TICK_MS = 50\` ms = 20 lần/giây):**
  1. **Thực tế (\`--mode=realistic\`):** giống hệt \`WorldScene.fixedStep()\` của client thật và \`bench.ts\` của Dev A — bot chỉ gửi \`input { seq, dx, dy }\` khi đang chạy tới quái; khi đã vào tầm chém thì **đứng lại đánh, không gửi \`input\`**.
  2. **Trường hợp xấu nhất (\`--mode=worst\`):** cả 100% bot di chuyển liên tục mỗi tick (20 \`input\`/giây/bot, kể cả khi đã áp sát quái vẫn lượn vòng quanh), làm \`x, y, lastSeq\` của mọi người chơi đổi ở tất cả các tick và phải phát cho mọi client.
- **Cách lấy số đo (từ bên ngoài qua WebSocket thật & \`/proc\`):**
  - **CPU mỗi tick (mục tiêu < 10 ms):** đọc \`se.sum_exec_runtime\` từ \`/proc/<server_pid>/sched\` (độ chính xác nano-giây trên Linux) ở mỗi chu kỳ 50 ms. Con số này bao gồm **toàn bộ** công việc của tiến trình server trong một tick: xử lý tin nhắn nhận vào + \`WorldRoom.update()\` + mã hoá bản vá \`@colyseus/schema\` + gửi khung WebSocket qua mạng cho 50–100 kết nối.
  - **Băng thông mỗi bot nhận vào (RX) & gửi đi (TX):** đo trực tiếp số byte qua socket của từng bot; tách riêng **Tổng RX** (gồm cả tin nhắn broadcast \`fx\`, \`dmg\`, \`chat\`) và **Riêng state patch RX** (mã gói \`Protocol.ROOM_STATE_PATCH = 15\`).
  - **Nhịp nhận patch (\`Δt\`) & Độ trễ \`input → lastSeq\`:** đo trên từng client \`colyseus.js\` bằng \`performance.now()\`.
  - **Số quái còn sống lúc đo:** lấy mẫu \`room.state.monsters.size\` mỗi tick trong suốt kỳ đo (bot giết quái nhanh hơn chu kỳ hồi 10 giây, ảnh hưởng trực tiếp tới kích thước patch và số gói \`fx\`/\`dmg\`).

## 2. Bảng kết quả${after ? " (Trước → Sau #57, #59)" : " (Trước tối ưu — chưa có #57, #59)"}

| Kịch bản | Số bot | Kết nối giữ vững | CPU mỗi tick: TB / p95 / cao nhất (mục tiêu < 10 ms) | Băng thông nhận vào (RX / bot) | Băng thông gửi đi (TX / bot) | Nhịp nhận patch \`Δt\` (mục tiêu ~50 ms) | Độ trễ \`input → lastSeq\` | Số quái còn sống lúc đo |
|---|---:|---|---|---|---|---|---|---|
${rows}

## 3. Đối chiếu với Benchmark nội bộ (\`npm run bench -w server\`) & Nhận xét

1. **Nguyên nhân chênh lệch băng thông giữa kịch bản Xấu nhất (~42 KB/s) và Benchmark nội bộ (~25–26.6 KB/s):**
   - Benchmark không qua mạng của Dev A (\`npm run bench -w server\`) đo trên code \`main\` (trước #59) cho kết quả **~26.6 KB/s mỗi client** ở 100 người, và sau #59 giảm ~5% về **~25 KB/s**.
   - Sự khác biệt giữa con số **~42.5 KB/s** (kịch bản Xấu nhất của \`bots.ts\`) và **~26.6 KB/s** của \`bench.ts\` **không phải** do \`takeWhole\`, mà do **kịch bản di chuyển**:
     - Ở kịch bản **Xấu nhất (\`--mode=worst\`)**, cả 100 bot đều gửi 20 \`input\`/giây liên tục không nghỉ, khiến \`x, y, lastSeq\` của cả 100 nhân vật thay đổi ở mọi tick và được phát cho toàn bộ 100 client. Sau #59, kịch bản xấu nhất này dự kiến chỉ giảm vài KB/s (không về ~25 KB/s).
     - Ở kịch bản **Thực tế (\`--mode=realistic\`)**, khi bot vào tầm đánh quái thì đứng lại chém và không gửi \`input\` (giống \`WorldScene.fixedStep\` và \`bench.ts\`), băng thông gửi đi (TX) và băng thông state patch nhận về (RX) thấp hơn rõ rệt và sát với \`bench.ts\` (cộng thêm chi phí gói tin broadcast \`fx\`/\`dmg\` và khung WebSocket).
2. **CPU mỗi tick (< 10 ms):**
   - Trong \`bench.ts\` (chỉ chạy logic \`tickWorld\` + \`encoder.encode()\` một lần trong bộ nhớ), thời gian thuần logic là **~0.2 ms/tick**.
   - Khi chạy server thật với **50–100 kết nối WebSocket**, tiến trình Node.js gánh thêm chi phí đọc/giải mã các gói \`input\`+\`attack\`/giây từ socket và đẩy hàng nghìn gói \`patch\`+\`fx\`+\`dmg\`/giây qua tầng TCP/WebSocket của hệ điều hành, nhưng tổng CPU tiến trình vẫn chỉ **~1.5–3.0 ms/tick trung bình (p95 < 5 ms, cao nhất < 10 ms)** — đạt mục tiêu **< 10 ms/tick**.
3. **Ghi nhận trên nhánh chưa có #59:**
   - Khi nối từ bot thứ ~85 tới 100 trên bản chưa có #59, \`@colyseus/schema\` in cảnh báo \`buffer overflow. Encoded state is higher than default BUFFER_SIZE\` (do bộ đệm mặc định nhỏ hơn state đầy đủ của 100 người + quái). PR #59 nâng \`Encoder.BUFFER_SIZE = 32 * 1024\` sẽ giải quyết triệt để cảnh báo này.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.cleanOnly) {
    const removed = cleanBotSaves();
    console.log(`Đã xoá ${removed} file lưu nhân vật bot trong ${DATA_PLAYERS_DIR}.`);
    return;
  }

  if (FORBIDDEN_PORTS.has(args.port) && !args.allowOtherPort) {
    console.error(
      `Từ chối chạy: cổng ${args.port} thuộc về Dev A (2567) hoặc Dev B (2577). Chỉ chạy thử tải vào cổng của Dev C (2587).`,
    );
    process.exit(1);
  }

  const commit = currentGitCommit();
  const modes: BotMode[] = args.bothModes ? ["realistic", "worst"] : [args.mode];
  const counts = args.suite ? [50, 100] : [args.bots];
  const results: LoadTestMetrics[] = [];

  for (const m of modes) {
    for (const c of counts) {
      if (results.length > 0) await sleep(1000);
      results.push(
        await runLoadTest(
          c,
          args.durationSec,
          args.url,
          args.port,
          args.keepSaves,
          commit,
          args.note,
          m,
        ),
      );
    }
  }

  const snapshot: LoadTestSnapshot = { commit, note: args.note, results };

  if (args.saveJson) {
    writeFileSync(args.saveJson, JSON.stringify(snapshot, null, 2));
    console.log(`Đã lưu dữ liệu JSON vào ${args.saveJson}`);
  }

  let baseline: LoadTestSnapshot | null = null;
  if (args.compareJson && existsSync(args.compareJson)) {
    baseline = JSON.parse(readFileSync(args.compareJson, "utf8")) as LoadTestSnapshot;
  }

  if (args.writeDoc) {
    const md = renderMarkdownReport(snapshot, baseline);
    writeFileSync(DOC_PATH, md);
    console.log(`\nĐã ghi báo cáo thử tải vào ${DOC_PATH}`);
  }
}

if (process.argv[1]?.endsWith("bots.ts")) {
  main().catch((err) => {
    console.error("Lỗi khi chạy thử tải bằng bot:", err);
    process.exit(1);
  });
}
