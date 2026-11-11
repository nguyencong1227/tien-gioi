// Script thử tải dài (soak test) cho M4 3.5 (Issue #282).
// Tự dựng server THẬT trong tiến trình con (thư mục dữ liệu tạm, cổng ngẫu nhiên),
// cho bot vào chạy trộn các kịch bản (săn quái, trấn/shop, qua cổng, bí cảnh, PK, tông môn).
// Đo mỗi 10 giây vào tệp soak-*.json:
// - VmRSS của server từ /proc/<pid>/status và CPU luồng chính từ /proc/<pid>/sched
// - Số đo vận hành THẬT từ /metrics?format=json (M4 3.3, Bearer METRICS_TOKEN):
//   worstTickP95Ms, tick overruns, writes.inflight, writes.oldestAgeMs, writes.failed, process.loopLagP99Ms
// - Băng thông WebSocket thật: bytes nhận / tick / bot, KB/s mỗi bot
// - Phân loại log server qua classifyServerLogLine: bắt lỗi [lỗi] và cảnh báo giám sát sau khi sẵn sàng
// - Phân tích hồi quy tuyến tính OLS dốc RSS, kiểm tra ngân sách hiệu năng và bất biến toàn vẹn dữ liệu.
//
// Cách dùng:
//   npm run soak -w server -- --bots=100 --minutes=30
//   npm run soak -w server -- --bots=20 --duration=60   (thử nhanh 60 giây)

import { execSync, spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  DUEL_COOLDOWN_MS,
  DUEL_MSG,
  DUEL_RANGE,
  DUNGEON_MSG,
  DUNGEON_OPEN_COOLDOWN_MS,
  LINH_HU_ID,
  NPC_BY_ID,
  PLAYER_RADIUS,
  PROTOCOL_VERSION,
  SECT_MSG,
  SKILLS,
  TICK_MS,
  TRAVEL_COOLDOWN_MS,
  buyPrice,
  getMap,
  roomNameOf,
  type DuelInvitedMsg,
  type DuelStateMsg,
  type DungeonInviteMsg,
  type DungeonStateMsg,
  type GameMap,
  type InvMsg,
  type PartyInvitedMsg,
  type PartyMsg,
  type SectInvitedMsg,
  type SectMsg,
  type TravelToMsg,
  type WalletMsg,
} from "@tien-gioi/shared";
import { auditSavesDirectory } from "./audit-saves";
import { assertNotProd } from "./assert-not-prod";
import { readServerExecRuntimeMs, readServerRssMb, seedBotSaveFile } from "./bots";
import {
  analyzeSoak,
  classifyServerLogLine,
  formatSoakTable,
  type SoakSample,
} from "./soak-analysis";

// Lọc cảnh báo nội bộ của @colyseus/schema client decoder khi nhiều bot trong cùng tiến trình
const origConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === "string" && args[0].includes('"refId" not found')) return;
  origConsoleWarn(...args);
};

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const serverDir = path.resolve(here, "..");
const tsxCli = path.resolve(repoRoot, "node_modules/tsx/dist/cli.mjs");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function byteLengthOf(data: unknown): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof (data as any)?.size === "number") return (data as any).size;
  if (typeof (data as any)?.byteLength === "number") return (data as any).byteLength;
  if (typeof data === "string") return Buffer.byteLength(data);
  if (Array.isArray(data)) return data.reduce((sum, item) => sum + byteLengthOf(item), 0);
  return 0;
}

export interface SoakCliArgs {
  bots: number;
  durationSec: number;
  port: number;
  sampleIntervalSec: number;
  outJsonPath?: string;
  keepDataDir: boolean;
}

function parseCliArgs(argv: string[]): SoakCliArgs {
  let bots = 100;
  let durationSec = 60; // Mặc định 60s để thử nhanh; khi chạy dài dùng --minutes=30
  let port = 0;
  let sampleIntervalSec = 10;
  let outJsonPath: string | undefined;
  let keepDataDir = false;

  for (const arg of argv) {
    if (arg.startsWith("--bots=")) {
      bots = Math.max(1, Number(arg.slice(7)));
    } else if (arg.startsWith("--minutes=")) {
      durationSec = Math.max(5, Number(arg.slice(10)) * 60);
    } else if (arg.startsWith("--duration=")) {
      durationSec = Math.max(5, Number(arg.slice(11)));
    } else if (arg.startsWith("--port=")) {
      port = Math.max(0, Number(arg.slice(7)));
      assertNotProd(port, "soak");
    } else if (arg.startsWith("--interval=")) {
      sampleIntervalSec = Math.max(1, Number(arg.slice(11)));
    } else if (arg.startsWith("--out=")) {
      outJsonPath = arg.slice(6);
    } else if (arg === "--keep-data") {
      keepDataDir = true;
    }
  }

  return { bots, durationSec, port, sampleIntervalSec, outJsonPath, keepDataDir };
}

/** Tìm PID thật của tiến trình server (nếu được bọc bởi launcher tsx) */
export function findActualServerPid(launcherPid: number): number {
  try {
    const out = execSync(`pgrep -P ${launcherPid}`, { encoding: "utf8" }).trim();
    const pids = out
      .split("\n")
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    return pids.length > 0 ? pids[0] : launcherPid;
  } catch {
    return launcherPid;
  }
}

/** Tìm một cổng TCP trống ngẫu nhiên trong dải cao để không đụng cổng nào của dev */
export async function findFreePort(startPort = 39000, maxTries = 100): Promise<number> {
  for (let i = 0; i < maxTries; i++) {
    const candidate = startPort + Math.floor(Math.random() * 5000);
    const free = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.unref();
      s.on("error", () => resolve(false));
      s.listen(candidate, "127.0.0.1", () => {
        s.close(() => resolve(true));
      });
    });
    if (free) return candidate;
  }
  throw new Error("Không tìm được cổng trống!");
}

function findUnblockedPosition(
  map: GameMap,
  targetX: number,
  targetY: number,
  maxSearchRadius = 80,
): { x: number; y: number } {
  if (isPositionSafe(map, targetX, targetY)) {
    return { x: targetX, y: targetY };
  }
  for (let r = 8; r <= maxSearchRadius; r += 8) {
    for (let step = 0; step < 8; step++) {
      const a = (step / 8) * Math.PI * 2;
      const x = Math.round(targetX + Math.cos(a) * r);
      const y = Math.round(targetY + Math.sin(a) * r);
      if (isPositionSafe(map, x, y)) {
        return { x, y };
      }
    }
  }
  return { x: map.townPx.x, y: map.townPx.y };
}

/** Kiểm tra vị trí an toàn tuyệt đối cách xa mọi vật cản và mép bản đồ ít nhất safePadding px. */
function isPositionSafe(map: GameMap, x: number, y: number, safePadding = 32): boolean {
  if (
    x < 150 ||
    x > map.worldW - 150 ||
    y < 150 ||
    y > map.worldH - 150 ||
    map.circleBlocked(x, y, PLAYER_RADIUS)
  ) {
    return false;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.round(x + Math.cos(a) * safePadding);
    const py = Math.round(y + Math.sin(a) * safePadding);
    if (map.circleBlocked(px, py, PLAYER_RADIUS) || map.isBlockedPx(px, py)) {
      return false;
    }
  }
  return true;
}

type BotRole = "hunt" | "crowd" | "travel" | "dungeon" | "duel" | "sect";

interface BotState {
  index: number;
  name: string;
  secret: string;
  role: BotRole;
  client: Client;
  room: Room;
  map: GameMap;
  seq: number;
  predX: number;
  predY: number;
  campX: number;
  campY: number;
  rxBytes: number;
  txBytes: number;
  lastPatchAt: number;
  wanderAngle: number;
  avoidUntil: number;
  nextTurnAt: number;
  nextSlashAt: number;
  nextSwordAt: number;
  coin: number;
  mintedCoin: number;
  spentCoin: number;
  invSlots: any[];
  nextShopAt: number;
  shopping: boolean;
  isTravelling: boolean;
  nextTravelAt: number;
  myParty: PartyMsg | null;
  dungeonOpenSentAt: number;
  dungeonLastEndAt: number;
  nextDungeonOpenAt: number;
  /** Mốc sớm nhất được mời đội lần nữa (đội trưởng bí cảnh): mời MỖI tick là spam và bị server ngắt (`[spam]`) */
  nextPartyInviteAt: number;
  dungeonState: DungeonStateMsg | null;
  duelPhase?: "countdown" | "fight";
  duelOpponentName?: string;
  nextDuelChallengeAt: number;
  sectTag?: string;
  sectIsLeader: boolean;
  nextSectActionAt: number;
  closedCode: number | null;
}

// Tập các thư mục tạm cần dọn dẹp khi kết thúc hoặc thoát đột ngột
const tempDirsToClean = new Set<string>();

function cleanupTempDirs() {
  for (const d of tempDirsToClean) {
    try {
      if (existsSync(d)) {
        rmSync(d, { recursive: true, force: true });
      }
    } catch {
      /* bỏ qua */
    }
  }
  tempDirsToClean.clear();
}

export async function main(): Promise<number> {
  const args = parseCliArgs(process.argv.slice(2));
  const port = args.port > 0 ? args.port : await findFreePort();
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-soak-"));
  if (!args.keepDataDir) {
    tempDirsToClean.add(tempDir);
  }

  const outPath =
    args.outJsonPath ??
    path.join(serverDir, `soak-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  console.log("================================================================================");
  console.log("            BẮT ĐẦU THỬ TẢI DÀI TIÊN GIỚI (M4 3.5 - ISSUE #282)");
  console.log("================================================================================");
  console.log(`Số bot:            ${args.bots}`);
  console.log(
    `Thời lượng:        ${(args.durationSec / 60).toFixed(1)} phút (${args.durationSec} giây)`,
  );
  console.log(`Cổng server:       ${port} (ngẫu nhiên, cách ly)`);
  console.log(`Thư mục dữ liệu:   ${tempDir}`);
  console.log(`Tệp nhật ký mẫu:   ${outPath}`);
  console.log("--------------------------------------------------------------------------------");

  let serverProc: ChildProcess | null = null;
  const serverLogs: string[] = [];
  let serverLogErrors = 0;
  let monitorAlerts = 0;
  let serverReady = false;

  // Sinh token ngẫu nhiên >= 16 ký tự để truy cập /metrics?format=json (M4 3.3)
  const metricsToken = crypto.randomBytes(16).toString("hex");

  const shutdownServer = async () => {
    if (!serverProc || serverProc.killed) return;
    try {
      serverProc.kill("SIGTERM");
      const exited = await Promise.race([
        new Promise<boolean>((resolve) => {
          serverProc?.on("exit", () => resolve(true));
        }),
        sleep(5000).then(() => false),
      ]);
      if (!exited && serverProc && !serverProc.killed) {
        serverProc.kill("SIGKILL");
      }
    } catch {
      /* bỏ qua */
    }
  };

  const cleanupAndExit = async (code: number) => {
    await shutdownServer();
    cleanupTempDirs();
    process.exit(code);
  };

  process.on("exit", () => {
    cleanupTempDirs();
  });
  process.on("SIGINT", () => void cleanupAndExit(130));
  process.on("SIGTERM", () => void cleanupAndExit(143));

  // 1. Phân bổ vai trò cho các bot
  const botRoles: BotRole[] = [];
  const countHunt = Math.max(1, Math.round(args.bots * 0.3));
  const countCrowd = Math.max(1, Math.round(args.bots * 0.2));
  const countTravel = Math.max(1, Math.round(args.bots * 0.1));
  const countDungeon = Math.max(0, Math.floor((args.bots * 0.16) / 4) * 4);
  const countDuel = Math.max(0, Math.floor((args.bots * 0.12) / 2) * 2);
  const countSect = Math.max(
    0,
    args.bots - (countHunt + countCrowd + countTravel + countDungeon + countDuel),
  );

  for (let i = 0; i < countHunt; i++) botRoles.push("hunt");
  for (let i = 0; i < countCrowd; i++) botRoles.push("crowd");
  for (let i = 0; i < countTravel; i++) botRoles.push("travel");
  for (let i = 0; i < countDungeon; i++) botRoles.push("dungeon");
  for (let i = 0; i < countDuel; i++) botRoles.push("duel");
  for (let i = 0; i < countSect; i++) botRoles.push("sect");
  while (botRoles.length < args.bots) botRoles.push("hunt");

  console.log(
    `Phân bổ kịch bản (${args.bots} bot): Săn quái ${countHunt} | Trấn/Shop ${countCrowd} | Cổng ${countTravel} | Bí cảnh ${countDungeon} | PK ${countDuel} | Tông môn ${countSect}`,
  );

  // 2. Gieo sẵn file lưu nhân vật vào tempDir
  let initialTotalCoin = 0;
  const initialPositions = new Map<number, { x: number; y: number }>();
  for (let i = 1; i <= args.bots; i++) {
    const role = botRoles[i - 1];
    const name = `Bot ${String(i).padStart(3, "0")}`;
    const secret = `bot_secret_tien_gioi_${String(i).padStart(3, "0")}_soak`;
    const initialCoin = role === "sect" && (i - 1) % 3 === 0 ? 5000 : 100;
    initialTotalCoin += initialCoin;

    let cx = DEFAULT_MAP.townPx.x;
    let cy = DEFAULT_MAP.townPx.y;

    if (role === "hunt") {
      const angle = (i / countHunt) * Math.PI * 2;
      cx = DEFAULT_MAP.townPx.x + Math.cos(angle) * (DEFAULT_MAP.townPx.r + 150);
      cy = DEFAULT_MAP.townPx.y + Math.sin(angle) * (DEFAULT_MAP.townPx.r + 150);
    } else if (role === "crowd") {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * (DEFAULT_MAP.townPx.r - 30);
      cx = DEFAULT_MAP.townPx.x + Math.cos(angle) * r;
      cy = DEFAULT_MAP.townPx.y + Math.sin(angle) * r;
    } else if (role === "travel") {
      const portal = DEFAULT_MAP.portals[0];
      cx = portal ? portal.spawn.x : DEFAULT_MAP.townPx.x;
      cy = portal ? portal.spawn.y : DEFAULT_MAP.townPx.y;
    } else if (role === "dungeon") {
      cx = NPC_BY_ID.thu_mon.x + (Math.random() - 0.5) * 30;
      cy = NPC_BY_ID.thu_mon.y + (Math.random() - 0.5) * 30;
    } else if (role === "duel") {
      const pairIdx = Math.floor((i - 1) / 2);
      const angle = (pairIdx / Math.max(1, countDuel / 2)) * Math.PI * 2;
      cx = DEFAULT_MAP.townPx.x + Math.cos(angle) * (DEFAULT_MAP.townPx.r + 80);
      cy = DEFAULT_MAP.townPx.y + Math.sin(angle) * (DEFAULT_MAP.townPx.r + 80);
    } else if (role === "sect") {
      const grpIdx = Math.floor((i - 1) / 3);
      const angle = (grpIdx / Math.max(1, countSect / 3)) * Math.PI * 2;
      cx = DEFAULT_MAP.townPx.x + Math.cos(angle) * (DEFAULT_MAP.townPx.r + 100);
      cy = DEFAULT_MAP.townPx.y + Math.sin(angle) * (DEFAULT_MAP.townPx.r + 100);
    }

    const pos = findUnblockedPosition(DEFAULT_MAP, cx, cy);
    cx = pos.x;
    cy = pos.y;
    initialPositions.set(i, { x: cx, y: cy });

    seedBotSaveFile(
      name,
      secret,
      cx,
      cy,
      role === "dungeon" ? 1 : 1,
      role === "dungeon" ? 8 : 4,
      DEFAULT_MAP_ID,
      undefined,
      initialCoin,
      tempDir,
    );
  }

  // 3. Khởi động server con
  console.log("Đang khởi động máy chủ thật trong tiến trình con...");
  serverProc = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: tempDir,
      STORE: "file",
      SECTS: "on",
      AUDIT_LOG: "on",
      METRICS_TOKEN: metricsToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const serverPid = serverProc.pid ?? 0;
  if (!serverPid) {
    console.error("[LỖI] Không thể lấy PID tiến trình server!");
    await cleanupAndExit(1);
    return 1;
  }

  const handleServerLogLine = (line: string, stream: "stdout" | "stderr") => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Giữ mảng serverLogs tối đa 2000 dòng để không phình bộ nhớ của soak script
    serverLogs.push(trimmed);
    if (serverLogs.length > 2000) serverLogs.shift();

    if (trimmed.includes(`Tiên Giới server: http://localhost:${port}`)) {
      serverReady = true;
    }

    const category = classifyServerLogLine(trimmed, serverReady, stream);
    if (category === "error") {
      serverLogErrors++;
      console.log(`  [Phát hiện lỗi log server] ${trimmed}`);
    } else if (category === "monitorAlert") {
      monitorAlerts++;
      console.log(`  [Phát hiện cảnh báo giám sát server] ${trimmed}`);
    }
  };

  serverProc.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      handleServerLogLine(line, "stdout");
    }
  });

  serverProc.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      handleServerLogLine(line, "stderr");
    }
  });

  serverProc.on("exit", (code, signal) => {
    console.log(
      `[SERVER TIẾN TRÌNH THOÁT] PID launcher: ${serverPid}, code=${code}, signal=${signal}`,
    );
  });

  const readyTimeout = 15000;
  const startWait = Date.now();
  while (!serverReady && Date.now() - startWait < readyTimeout) {
    await sleep(100);
  }

  if (!serverReady) {
    console.error("[LỖI] Hết thời gian chờ máy chủ sẵn sàng!");
    await cleanupAndExit(1);
    return 1;
  }

  const actualPid = findActualServerPid(serverPid);
  console.log(
    `Máy chủ sẵn sàng tại cổng ${port} (PID launcher: ${serverPid}, PID server: ${actualPid}). Bắt đầu kết nối bot...`,
  );

  // 4. Kết nối các bot và thiết lập sự kiện
  const bots: BotState[] = [];
  const wsUrl = `ws://localhost:${port}`;

  const bindBotEvents = (b: BotState, room: Room) => {
    b.room = room;
    b.closedCode = null;

    room.onMessage("chat", () => {});
    room.onMessage("toast", () => {});
    room.onMessage("quests", () => {});
    room.onMessage("soul", () => {});
    room.onMessage("fx", () => {});
    room.onMessage("dmg", () => {});
    room.onMessage("dialog", () => {});
    room.onMessage("reborn", () => {});
    room.onMessage("limbo", () => {});
    room.onMessage("dungeon:fallen", () => {});
    room.onMessage(SECT_MSG.presence, () => {});

    room.onMessage("wallet", (msg: WalletMsg) => {
      const cur = msg.coin ?? 0;
      const delta = cur - b.coin;
      if (delta > 0) {
        b.mintedCoin += delta;
      } else if (delta < 0) {
        b.spentCoin += -delta;
      }
      b.coin = cur;
    });

    room.onMessage("inv", (msg: InvMsg) => {
      b.invSlots = msg.slots ?? [];
    });

    room.onMessage("partyInvited", (msg: PartyInvitedMsg) => {
      room.send("partyAccept", { from: msg.from });
    });

    room.onMessage("party", (msg: PartyMsg) => {
      b.myParty = msg;
    });

    room.onMessage("travelTo", (msg: TravelToMsg) => {
      void (async () => {
        try {
          const nextMap = getMap(msg.mapId) ?? DEFAULT_MAP;
          const targetClient = new Client(wsUrl);
          const nextOpts = {
            name: b.name,
            secret: b.secret,
            v: PROTOCOL_VERSION,
          };
          const nextRoom = msg.roomId
            ? await targetClient.joinById(msg.roomId, nextOpts)
            : await targetClient.joinOrCreate(roomNameOf(nextMap.def.id), nextOpts);
          b.map = nextMap;
          bindBotEvents(b, nextRoom);
          b.isTravelling = false;
          b.nextTravelAt = performance.now() + TRAVEL_COOLDOWN_MS + 2000;
        } catch {
          b.isTravelling = false;
          b.nextTravelAt = performance.now() + 4000;
        }
      })();
    });

    room.onMessage(DUNGEON_MSG.invite, (msg: DungeonInviteMsg) => {
      if (b.role === "dungeon") {
        room.send(DUNGEON_MSG.enter, { runId: msg.runId });
      }
    });

    room.onMessage(DUNGEON_MSG.state, (msg: DungeonStateMsg) => {
      b.dungeonState = msg;
    });

    room.onMessage(DUNGEON_MSG.end, () => {
      b.dungeonLastEndAt = performance.now();
    });

    room.onMessage(DUEL_MSG.invited, (msg: DuelInvitedMsg) => {
      if (b.role === "duel") {
        room.send(DUEL_MSG.accept, { from: msg.from });
      }
    });

    room.onMessage(DUEL_MSG.state, (msg: DuelStateMsg) => {
      if (b.role === "duel") {
        b.duelPhase = msg.phase;
        b.duelOpponentName = msg.opponent;
      }
    });

    room.onMessage(DUEL_MSG.end, () => {
      if (b.role === "duel") {
        b.duelPhase = undefined;
        b.nextDuelChallengeAt = performance.now() + DUEL_COOLDOWN_MS + 1000;
      }
    });

    room.onMessage(SECT_MSG.invited, (msg: SectInvitedMsg) => {
      if (b.role === "sect" && !b.sectIsLeader) {
        room.send(SECT_MSG.accept, { from: msg.from });
      }
    });

    room.onMessage(SECT_MSG.snapshot, (msg: SectMsg) => {
      if (b.role === "sect" && msg.sect) {
        b.sectTag = msg.sect.tag;
      }
    });

    const ws = (room.connection as any)?.transport?.ws;
    if (ws) {
      const onIncomingData = (data: unknown) => {
        const len = byteLengthOf(data);
        b.rxBytes += len;
      };

      if (typeof ws.addEventListener === "function") {
        ws.addEventListener("message", (ev: { data: unknown }) => {
          if (ev) onIncomingData(ev.data);
        });
      } else if (typeof ws.on === "function") {
        ws.on("message", onIncomingData);
      } else {
        const origOnMessage = ws.onmessage;
        ws.onmessage = (ev: { data: unknown }) => {
          if (ev) onIncomingData(ev.data);
          if (origOnMessage) origOnMessage.call(ws, ev);
        };
      }
    }

    room.onLeave((code) => {
      if (code !== 1000 && code !== 4000) {
        b.closedCode = code;
      }
    });
  };

  for (let i = 1; i <= args.bots; i++) {
    const role = botRoles[i - 1];
    const name = `Bot ${String(i).padStart(3, "0")}`;
    const secret = `bot_secret_tien_gioi_${String(i).padStart(3, "0")}_soak`;
    const client = new Client(wsUrl);
    const room = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
      name,
      secret,
      v: PROTOCOL_VERSION,
    });

    const initPos = initialPositions.get(i) ?? {
      x: DEFAULT_MAP.townPx.x,
      y: DEFAULT_MAP.townPx.y,
    };
    const b: BotState = {
      index: i,
      name,
      secret,
      role,
      client,
      room,
      map: DEFAULT_MAP,
      seq: 0,
      predX: initPos.x,
      predY: initPos.y,
      campX: initPos.x,
      campY: initPos.y,
      rxBytes: 0,
      txBytes: 0,
      lastPatchAt: performance.now(),
      wanderAngle: Math.random() * Math.PI * 2,
      avoidUntil: 0,
      nextTurnAt: 0,
      nextSlashAt: 0,
      nextSwordAt: 0,
      coin: role === "sect" && (i - 1) % 3 === 0 ? 5000 : 100,
      mintedCoin: 0,
      spentCoin: 0,
      invSlots: [],
      nextShopAt: performance.now() + 2000 + Math.random() * 5000,
      shopping: false,
      isTravelling: false,
      nextTravelAt: performance.now() + 5000 + Math.random() * 5000,
      myParty: null,
      dungeonOpenSentAt: 0,
      dungeonLastEndAt: 0,
      nextDungeonOpenAt: performance.now() + 3000 + Math.random() * 5000,
      nextPartyInviteAt: performance.now() + 2000,
      dungeonState: null,
      nextDuelChallengeAt: performance.now() + 3000 + Math.random() * 4000,
      sectIsLeader: role === "sect" && (i - 1) % 3 === 0,
      nextSectActionAt: performance.now() + 2000 + Math.random() * 3000,
      closedCode: null,
    };

    bindBotEvents(b, room);
    bots.push(b);

    if (i % 25 === 0 || i === args.bots) {
      console.log(`- Đã kết nối ${i}/${args.bots} bot`);
    }
  }

  console.log("Toàn bộ bot đã vào phòng. Bắt đầu vòng lặp hành vi và đo đạc...");

  // 5. Vòng lặp hành vi bot (mỗi TICK_MS = 50ms)
  const stepBot = (b: BotState, now: number) => {
    if (!b.room || !b.room.connection?.isOpen) return;

    const me = b.room.state.players.get(b.room.sessionId);
    if (me) {
      b.predX = me.x;
      b.predY = me.y;
    }

    if (now < b.avoidUntil) return;

    let dx = 0;
    let dy = 0;

    switch (b.role) {
      case "hunt": {
        // Tìm quái gần nhất trong bán kính 300px
        let nearestMon: any = null;
        let minDist = 300;
        b.room.state.monsters.forEach((m: any) => {
          if (m.hp <= 0) return;
          const d = Math.hypot(m.x - b.predX, m.y - b.predY);
          if (d < minDist && isPositionSafe(b.map, m.x, m.y, 20)) {
            minDist = d;
            nearestMon = m;
          }
        });

        if (nearestMon) {
          const angle = Math.atan2(nearestMon.y - b.predY, nearestMon.x - b.predX);
          if (minDist > SKILLS.slash.range) {
            dx = Math.cos(angle);
            dy = Math.sin(angle);
          }
          if (minDist <= SKILLS.slash.range + 10 && now >= b.nextSlashAt) {
            b.room.send("attack", { angle });
            b.nextSlashAt = now + SKILLS.slash.cooldown + 50;
          }
          if (minDist <= SKILLS.sword.range && now >= b.nextSwordAt) {
            b.room.send("cast", { skillId: "sword", angle });
            b.nextSwordAt = now + SKILLS.sword.cooldown + 100;
          }
        } else {
          // Đi tuần quanh bãi săn
          if (now >= b.nextTurnAt) {
            b.wanderAngle += (Math.random() - 0.5) * 0.8;
            b.nextTurnAt = now + 1000 + Math.random() * 2000;
          }
          const distCamp = Math.hypot(b.campX - b.predX, b.campY - b.predY);
          if (distCamp > 200) {
            b.wanderAngle = Math.atan2(b.campY - b.predY, b.campX - b.predX);
          }
          dx = Math.cos(b.wanderAngle);
          dy = Math.sin(b.wanderAngle);
        }
        break;
      }

      case "crowd": {
        // Đi lại trong trấn và định kỳ ghé NPC Dược Đồng mua đan dược
        const distTown = Math.hypot(b.map.townPx.x - b.predX, b.map.townPx.y - b.predY);
        if (distTown > b.map.townPx.r - 20) {
          b.wanderAngle = Math.atan2(b.map.townPx.y - b.predY, b.map.townPx.x - b.predX);
        } else if (now >= b.nextTurnAt) {
          b.wanderAngle += (Math.random() - 0.5) * 1.2;
          b.nextTurnAt = now + 800 + Math.random() * 1500;
        }
        dx = Math.cos(b.wanderAngle);
        dy = Math.sin(b.wanderAngle);

        if (now >= b.nextShopAt) {
          b.nextShopAt = now + 8000 + Math.random() * 5000;
          const cost = buyPrice(LINH_HU_ID);
          if (b.coin >= cost) {
            b.room.send("buy", { npcId: "duoc_dong", itemId: LINH_HU_ID, count: 1 });
          }
        }
        break;
      }

      case "travel": {
        // Đi lại giữa cổng dịch chuyển để thử tải cơ chế qua cổng
        if (!b.isTravelling && now >= b.nextTravelAt) {
          const portals = b.map.portals;
          if (portals.length > 0) {
            const p = portals[0];
            const dist = Math.hypot(p.x - b.predX, p.y - b.predY);
            if (dist > 30) {
              const a = Math.atan2(p.y - b.predY, p.x - b.predX);
              dx = Math.cos(a);
              dy = Math.sin(a);
            } else {
              b.isTravelling = true;
              b.room.send("travel", { portalId: p.id });
              b.nextTravelAt = now + TRAVEL_COOLDOWN_MS + 2000;
            }
          }
        }
        break;
      }

      case "dungeon": {
        // Tổ đội bí cảnh
        const isLeader = (b.index - 1) % 4 === 0;
        if (isLeader) {
          const partyMembers = b.myParty?.members ?? [];
          if (partyMembers.length < 4 && now >= b.nextPartyInviteAt) {
            // Mỗi 6 giây một lượt (3 lời mời); trước đây gửi 3 lời mời MỖI tick 50 ms (60 tin/giây) nên server ngắt đội trưởng vì spam
            b.nextPartyInviteAt = now + 6000;
            const groupBase = b.index;
            for (let offset = 1; offset < 4; offset++) {
              const targetIdx = groupBase + offset;
              const targetName = `Bot ${String(targetIdx).padStart(3, "0")}`;
              b.room.send("partyInvite", { name: targetName });
            }
          }
          if (
            partyMembers.length >= 4 &&
            !b.dungeonState &&
            now >= b.nextDungeonOpenAt &&
            now >= b.dungeonLastEndAt + DUNGEON_OPEN_COOLDOWN_MS
          ) {
            b.room.send(DUNGEON_MSG.open, { dungeonId: "hac_phong_dong" });
            b.nextDungeonOpenAt = now + 15000;
          }
        }

        if (b.dungeonState && b.dungeonState.phase === "running") {
          let targetBoss: any = null;
          b.room.state.monsters.forEach((m: any) => {
            if (m.hp > 0) targetBoss = m;
          });
          if (targetBoss) {
            const d = Math.hypot(targetBoss.x - b.predX, targetBoss.y - b.predY);
            const a = Math.atan2(targetBoss.y - b.predY, targetBoss.x - b.predX);
            if (d > SKILLS.slash.range) {
              dx = Math.cos(a);
              dy = Math.sin(a);
            }
            if (d <= SKILLS.slash.range + 10 && now >= b.nextSlashAt) {
              b.room.send("attack", { angle: a });
              b.nextSlashAt = now + SKILLS.slash.cooldown + 50;
            }
          }
        }
        break;
      }

      case "duel": {
        const isFirst = (b.index - 1) % 2 === 0;
        const oppIdx = isFirst ? b.index + 1 : b.index - 1;
        const oppName = `Bot ${String(oppIdx).padStart(3, "0")}`;

        let oppPlayer: any = null;
        b.room.state.players.forEach((p: any) => {
          if (p.name === oppName) oppPlayer = p;
        });

        if (b.duelPhase === "fight" && oppPlayer && !oppPlayer.dead) {
          const dist = Math.hypot(oppPlayer.px - b.predX, oppPlayer.py - b.predY);
          const angle = Math.atan2(oppPlayer.py - b.predY, oppPlayer.px - b.predX);
          if (dist > SKILLS.slash.range) {
            dx = Math.cos(angle);
            dy = Math.sin(angle);
          }
          if (dist <= SKILLS.slash.range + 15 && now >= b.nextSlashAt) {
            b.room.send("attack", { angle });
            b.nextSlashAt = now + SKILLS.slash.cooldown + 50;
          }
        } else {
          // Đi ra ngoài khu an toàn để thách đấu
          const outside = !b.map.inSafe(b.predX, b.predY);
          if (!outside) {
            const a = Math.atan2(b.campY - b.predY, b.campX - b.predX);
            dx = Math.cos(a);
            dy = Math.sin(a);
          } else if ((b.index - 1) % 2 === 0 && oppPlayer && !oppPlayer.dead && !oppPlayer.duel) {
            const dist = Math.hypot(oppPlayer.px - b.predX, oppPlayer.py - b.predY);
            if (
              !b.map.inSafe(oppPlayer.px, oppPlayer.py) &&
              dist <= DUEL_RANGE &&
              now >= b.nextDuelChallengeAt
            ) {
              b.room.send(DUEL_MSG.challenge, { name: oppName });
              b.nextDuelChallengeAt = now + DUEL_COOLDOWN_MS + 2000;
            }
          }
        }
        break;
      }

      case "sect": {
        // Tông môn: lập, mời, nạp, rút, chat
        if (now >= b.nextTurnAt) {
          b.wanderAngle += (Math.random() - 0.5) * Math.PI;
          b.nextTurnAt = now + 1500 + Math.random() * 2000;
        }
        dx = Math.cos(b.wanderAngle);
        dy = Math.sin(b.wanderAngle);

        if (now >= b.nextSectActionAt) {
          const groupIdx = Math.floor((b.index - 1) / 3);
          const roleIdx = (b.index - 1) % 3;
          if (roleIdx === 0) {
            // Tông chủ
            if (!b.sectTag) {
              const sName = `Soak Phai ${groupIdx + 1}`;
              const sTag = `S${String(groupIdx + 1).padStart(2, "0")}`;
              b.room.send(SECT_MSG.create, { name: sName, tag: sTag });
              b.nextSectActionAt = now + 2500;
            } else {
              const targetIdx = groupIdx * 3 + (Math.random() < 0.5 ? 2 : 3);
              const targetName = `Bot ${String(targetIdx).padStart(3, "0")}`;
              b.room.send(SECT_MSG.invite, { name: targetName });
              const r = Math.random();
              if (r < 0.4) {
                b.room.send(SECT_MSG.deposit, { amount: 50 });
              } else if (r < 0.7) {
                b.room.send(SECT_MSG.withdraw, { amount: 30 });
              } else {
                b.room.send("chat", { text: `/s Tông môn ${b.sectTag} đồng tâm hiệp lực` });
              }
              b.nextSectActionAt = now + 3500 + Math.random() * 1500;
            }
          } else {
            // Thành viên
            if (b.sectTag) {
              if (Math.random() < 0.5) {
                b.room.send(SECT_MSG.deposit, { amount: 20 });
              } else {
                b.room.send("chat", { text: `/s Kính chào Tông chủ ${b.sectTag}` });
              }
            }
            b.nextSectActionAt = now + 4000 + Math.random() * 2000;
          }
        }
        break;
      }
    }

    const len = Math.hypot(dx, dy);
    if (len > 0.05) {
      dx /= len;
      dy /= len;
      const stepPx = 150 * (TICK_MS / 1000);
      const testX = Math.round(b.predX + dx * stepPx);
      const testY = Math.round(b.predY + dy * stepPx);
      if (!isPositionSafe(b.map, testX, testY, 32)) {
        b.wanderAngle += Math.PI * 0.75 + (Math.random() - 0.5) * 0.5;
        b.avoidUntil = now + 600;
        dx = 0;
        dy = 0;
      }
    }

    if (dx !== 0 || dy !== 0) {
      b.seq++;
      b.room.send("input", { seq: b.seq, dx, dy });
    }
  };

  const botTimer = setInterval(() => {
    const now = performance.now();
    for (const b of bots) stepBot(b, now);
  }, TICK_MS);

  // 6. Vòng lặp lấy mẫu mỗi sampleIntervalSec (mặc định 10s)
  const samples: SoakSample[] = [];
  let prevExecTime = readServerExecRuntimeMs(actualPid) ?? 0;
  let prevRxBytesTotal = 0;
  const startTime = Date.now();

  const sampleIntervalMs = args.sampleIntervalSec * 1000;
  const totalIterations = Math.ceil(args.durationSec / args.sampleIntervalSec);

  for (let iter = 1; iter <= totalIterations; iter++) {
    await sleep(sampleIntervalMs);
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const rssMb = readServerRssMb(actualPid) ?? 0;
    const curExecTime = readServerExecRuntimeMs(actualPid) ?? prevExecTime;

    const deltaExecMs = Math.max(0, curExecTime - prevExecTime);
    prevExecTime = curExecTime;

    const activeBots = bots.filter((b) => b.room?.connection?.isOpen).length;
    const sampleTicks = args.sampleIntervalSec * (1000 / TICK_MS);
    const cpuMsPerTickAvg = Number((deltaExecMs / Math.max(1, sampleTicks)).toFixed(2));

    let curRxBytesTotal = 0;
    for (const b of bots) {
      curRxBytesTotal += b.rxBytes;
    }

    const deltaRxBytes = Math.max(0, curRxBytesTotal - prevRxBytesTotal);
    prevRxBytesTotal = curRxBytesTotal;

    const bytesPerTickPerBot =
      activeBots > 0 ? Math.round(deltaRxBytes / (sampleTicks * activeBots)) : 0;
    const rxKBpsPerBot =
      activeBots > 0
        ? Number((deltaRxBytes / 1024 / args.sampleIntervalSec / activeBots).toFixed(2))
        : 0;

    const sampleErrors = bots.filter((b) => b.closedCode !== null).length;

    // Cào số đo thật từ /metrics?format=json (M4 3.3)
    let metricsSnapshot: any = null;
    let metricsFetchFailed = false;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/metrics?format=json`, {
        headers: { Authorization: `Bearer ${metricsToken}` },
      });
      if (res.status === 200) {
        metricsSnapshot = await res.json();
      } else {
        metricsFetchFailed = true;
      }
    } catch {
      metricsFetchFailed = true;
    }

    const worstTickP95Ms = Number((metricsSnapshot?.worstTickP95Ms ?? 0).toFixed(2));
    const tickOverruns =
      metricsSnapshot?.rooms?.reduce((sum: number, r: any) => sum + (r.tick?.overrun ?? 0), 0) ?? 0;
    const writesInflight = metricsSnapshot?.writes?.inflight ?? 0;
    const writesOldestAgeMs = metricsSnapshot?.writes?.oldestAgeMs ?? 0;
    const writesFailed = metricsSnapshot?.writes?.failed ?? 0;
    const loopLagP99Ms = Number((metricsSnapshot?.process?.loopLagP99Ms ?? 0).toFixed(1));

    const sample: SoakSample = {
      elapsedSec,
      timestamp: Date.now(),
      rssMb: Number(rssMb.toFixed(2)),
      activeBots,
      cpuMsPerTickAvg,
      worstTickP95Ms,
      tickOverruns,
      writesInflight,
      writesOldestAgeMs,
      writesFailed,
      loopLagP99Ms,
      bytesPerTickPerBot,
      rxKBpsPerBot,
      sampleErrors,
      metricsFetchFailed,
    };
    samples.push(sample);

    try {
      writeFileSync(outPath, JSON.stringify(samples, null, 2));
    } catch {
      /* bỏ qua */
    }

    const minStr = (elapsedSec / 60).toFixed(1);
    const totalMinStr = (args.durationSec / 60).toFixed(1);
    console.log(
      `[${minStr.padStart(4)}m / ${totalMinStr}m] VmRSS: ${rssMb.toFixed(1).padStart(5)} MB | Bots: ${String(activeBots).padStart(3)}/${args.bots} | Tick p95: ${worstTickP95Ms.toFixed(2).padStart(5)} ms | CPU: ${cpuMsPerTickAvg.toFixed(1).padStart(4)} ms/t | WS: ${String(bytesPerTickPerBot).padStart(3)} B/t | Inflight: ${writesInflight} | Lỗi: ${serverLogErrors} | Cảnh báo: ${monitorAlerts}`,
    );
  }

  clearInterval(botTimer);
  console.log("\nThời gian đo kết thúc. Đang dừng hành động bot để xả hết tin nhắn...");
  await sleep(1500);

  // 7. Ngắt kết nối các bot và tắt máy chủ bằng SIGTERM
  console.log("Đang ngắt kết nối bot và tắt máy chủ bằng SIGTERM...");
  for (const b of bots) {
    try {
      if (b.room?.connection?.isOpen) b.room.leave(true);
    } catch {
      /* bỏ qua */
    }
  }
  await sleep(1000);
  await shutdownServer();
  await sleep(1000);

  // 8. Kiểm tra bất biến dữ liệu sau soak
  console.log("Đang kiểm tra bất biến dữ liệu sau soak test...");

  // 8a. kiem-save trên DATA_DIR tạm
  const auditReport = auditSavesDirectory(tempDir);
  const auditErrorsTotal =
    auditReport.errorFiles +
    (auditReport.errorSouls ?? 0) +
    (auditReport.errorSects ?? 0) +
    (auditReport.errorAccounts ?? 0) +
    (auditReport.errorSessions ?? 0);
  console.log(
    `- kiem-save: ${auditReport.totalFiles} nhân vật, ${auditReport.totalSouls ?? 0} chân linh, ${auditReport.totalSects ?? 0} tông môn -> ${auditErrorsTotal} lỗi.`,
  );
  if (auditErrorsTotal > 0) {
    for (const f of auditReport.failedFiles) {
      console.log(`  [kiem-save lỗi] ${f.file}: ${JSON.stringify(f.errors)}`);
    }
  }

  // 8b. Kiểm tra tệp hỏng *.hong-*
  let hongFilesCount = 0;
  const scanHongFiles = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        scanHongFiles(full);
      } else if (item.name.includes(".hong-")) {
        hongFilesCount++;
      }
    }
  };
  scanHongFiles(tempDir);
  console.log(`- Tệp hỏng (*.hong-*): ${hongFilesCount}`);

  // 8c. Kiểm tra bảo toàn tiền tệ (Linh thạch)
  let finalPlayerCoin = 0;
  let botCoinMismatchCount = 0;
  try {
    for (const b of bots) {
      const key = crypto
        .createHash("sha1")
        .update(b.name.normalize("NFC").toLowerCase())
        .digest("hex");
      const botFile = path.join(tempDir, `${key}.json`);
      if (existsSync(botFile)) {
        try {
          const raw = JSON.parse(readFileSync(botFile, "utf8"));
          // Linh thạch của người chơi gồm ví hiện tại + coinAtDeath (nếu đang ở Hoàng Tuyền / limbo)
          const savedCoin = (raw.coin ?? 0) + (raw.limbo?.coinAtDeath ?? 0);
          finalPlayerCoin += savedCoin;
          if (savedCoin !== b.coin) {
            botCoinMismatchCount++;
            console.log(
              `  [Lệch ví bot] ${b.name}: file lưu = ${savedCoin}, bot ghi nhận = ${b.coin} (lệch ${savedCoin - b.coin})`,
            );
          }
        } catch {
          /* bỏ qua */
        }
      }
    }
  } catch {
    /* bỏ qua */
  }

  let finalSectCoin = 0;
  const sectsDir = path.join(tempDir, "sects");
  if (existsSync(sectsDir)) {
    try {
      for (const file of readdirSync(sectsDir)) {
        if (file.endsWith(".json")) {
          try {
            const raw = JSON.parse(readFileSync(path.join(sectsDir, file), "utf8"));
            finalSectCoin += raw.coin ?? 0;
          } catch {
            /* bỏ qua */
          }
        }
      }
    } catch {
      /* bỏ qua */
    }
  }

  const finalTotalCoin = finalPlayerCoin + finalSectCoin;
  let totalMintedCoin = 0;
  let totalSpentCoin = 0;
  for (const b of bots) {
    totalMintedCoin += b.mintedCoin;
    totalSpentCoin += b.spentCoin;
  }

  // Tổng tiền cuối cùng không được vượt quá: ban đầu + tiền phát sinh từ rơi đồ / thưởng / shop
  const currencyConservationPassed =
    finalTotalCoin <= initialTotalCoin + totalMintedCoin && botCoinMismatchCount === 0;
  console.log(
    `- Bảo toàn Linh thạch: Ban đầu ${initialTotalCoin} + Thả ra ${totalMintedCoin} - Tiêu ${totalSpentCoin} = Trần ${initialTotalCoin + totalMintedCoin} | Thực tế cuối: Ví ${finalPlayerCoin} + Kho ${finalSectCoin} = ${finalTotalCoin} (Lệch ví bot: ${botCoinMismatchCount}) -> ${currencyConservationPassed ? "ĐẠT" : "KHÔNG ĐẠT"}`,
  );

  // 9. Phân tích tự động và in bảng tổng kết
  const analysis = analyzeSoak(
    samples,
    {},
    {
      serverLogErrors,
      monitorAlerts,
      auditErrorsTotal,
      hongFilesCount,
      currencyConservationPassed,
    },
  );

  const formattedTable = formatSoakTable(analysis);
  console.log("\n" + formattedTable);

  // Ghi kết quả tổng hợp vào cuối tệp JSON
  const finalOutput = {
    metadata: {
      generatedAt: new Date().toISOString(),
      bots: args.bots,
      durationSec: args.durationSec,
      port,
      dataDir: tempDir,
    },
    analysis,
    samples,
    serverLogsTail: serverLogs.slice(-100),
  };
  try {
    writeFileSync(outPath, JSON.stringify(finalOutput, null, 2));
    console.log(`Đã lưu báo cáo chi tiết vào: ${outPath}`);
  } catch {
    /* bỏ qua */
  }

  cleanupTempDirs();

  return analysis.pass ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((code) => {
    process.exit(code);
  });
}
