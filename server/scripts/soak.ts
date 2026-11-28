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
//   npm run soak -w server -- --bots=100 --minutes=10 --m7   (có nội dung M7: sổ chiêu, ~20 % Nguyên Anh ở Hàn Vân Lĩnh; xem soak-plan.ts)
//
// Mặc định (không --m7) soak giữ y hệt trước đây: 100 bot Luyện Khí KHÔNG có sổ chiêu, nên KHÔNG đo gì về chiêu thức / trạng thái / đạn /
// tinh anh / Nguyên Anh. Chỉ khi bật --m7 báo cáo mới có số lượt thi triển theo chiêu và số bot theo cảnh giới.

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
  AMBUSH_ARM_MS,
  AMBUSH_MSG,
  DUEL_COOLDOWN_MS,
  DUEL_MSG,
  DUEL_RANGE,
  DUNGEON_MSG,
  DUNGEON_OPEN_COOLDOWN_MS,
  LINH_HU_ID,
  NPC_BY_ID,
  PLAYER_RADIUS,
  HAN_VAN_ID,
  PROTOCOL_VERSION,
  SECT_MSG,
  SKILL_MSG,
  SKILLS,
  TICK_MS,
  TRAVEL_COOLDOWN_MS,
  buyPrice,
  getMap,
  isArenaMap,
  roomNameOf,
  type AmbushChoice,
  type AmbushChooseMsg,
  type AmbushEndMsg,
  type AmbushFleeMsg,
  type AmbushOfferMsg,
  type AmbushSeenMsg,
  type AmbushStateMsg,
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
  type SkillsMsg,
  type TravelToMsg,
  type WalletMsg,
  DEFAULT_MAP_ID,
} from "@tien-gioi/shared";
import { auditSavesDirectory } from "./audit-saves";
import { assertNotProd } from "./assert-not-prod";
import {
  applySkillsMsg,
  emptySkillCaster,
  readServerExecRuntimeMs,
  readServerRssMb,
  tryCastLearnedSkill,
  type SkillCaster,
} from "./bots";
import {
  analyzeSoak,
  classifyServerLogLine,
  computeBossHunterMinuteStatus,
  formatSoakTable,
  type AmbushSoakContext,
  type BossCastEvent,
  type BossHunterMinuteStatus,
  type BossHunterSnapshotInput,
  type BossSoakContext,
  type M7SoakContext,
  type SoakSample,
} from "./soak-analysis";
import {
  ALL_SKILL_IDS,
  DEFAULT_NA_RATIO,
  NGUYEN_ANH_SKILL_IDS,
  allocateSoakRoles,
  countRealms,
  planM7Bots,
  seedSoakBot,
  soakNaCount,
  type SoakRole,
} from "./soak-plan";

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
  /** Bật nội dung M7: bot Trúc Cơ / Kim Đan có sổ chiêu + một phần Nguyên Anh ở Hàn Vân Lĩnh (mặc định tắt: soak cũ giữ nguyên) */
  m7: boolean;
  /** Tỉ lệ bot Nguyên Anh khi bật `--m7` (0..1; mặc định 0,2) */
  naRatio: number;
  /** Bật bộ chiêu trùm BOSS_MOVES=on và phân bổ bot săn trùm (#1001) */
  boss: boolean;
  /** Bật kịch bản tông môn (mặc định server đã luôn chạy SECTS=on, cờ này nhận để tương thích dòng lệnh) */
  sect: boolean;
  /** Bật kịch bản thử tải chặn đường AMBUSH=on + AMBUSH_BOTS=on và bot đi hoang liên tục (CD10 #1070, #1276) */
  ambush: boolean;
}

/** `--na=0.2` / `--na=20` / `--na=20%` -> tỉ lệ 0..1; không hợp lệ -> `null` */
export function parseNaRatio(raw: string): number | null {
  const num = Number(raw.trim().replace(/%$/, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  const frac = num > 1 ? num / 100 : num;
  return Math.min(1, frac);
}

export function parseCliArgs(argv: string[]): SoakCliArgs {
  let bots = 100;
  let durationSec = 60; // Mặc định 60s để thử nhanh; khi chạy dài dùng --minutes=30
  let port = 0;
  let sampleIntervalSec = 10;
  let outJsonPath: string | undefined;
  let keepDataDir = false;
  let m7 = false;
  let naRatio = DEFAULT_NA_RATIO;
  let boss = false;
  let sect = false;
  let ambush = false;

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
    } else if (arg === "--m7" || arg === "--skills") {
      m7 = true;
    } else if (arg === "--boss" || arg === "--boss-hunt") {
      boss = true;
    } else if (arg === "--sect") {
      sect = true;
    } else if (arg === "--ambush") {
      ambush = true;
    } else if (arg.startsWith("--na=")) {
      const ratio = parseNaRatio(arg.slice(5));
      if (ratio !== null) {
        naRatio = ratio;
        m7 = true; // chỉ định tỉ lệ Nguyên Anh thì đương nhiên là bật nội dung M7
      }
    }
  }

  return {
    bots,
    durationSec,
    port,
    sampleIntervalSec,
    outJsonPath,
    keepDataDir,
    m7,
    naRatio,
    boss,
    sect,
    ambush,
  };
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

/**
 * Đường đi bộ (BFS 4 hướng trên lưới 16 px, dùng đúng `circleBlocked` của server) từ (x, y) tới vùng cổng; trả các điểm đặt cách nhau ~48 px,
 * điểm cuối nằm trong 0,6 bán kính cổng. Âm Sương: cổng nằm sau chướng ngại ngay phía nam điểm hiện nên đi thẳng thì kẹt (có đường vòng, 84 ô);
 * bot "travel" đi theo các điểm này thay vì thẳng tới cổng. `null` nếu không có đường (bot đi thẳng như cũ).
 */
function pathToPortal(
  map: GameMap,
  x: number,
  y: number,
  portal: { x: number; y: number; r: number },
): Array<{ x: number; y: number }> | null {
  const S = 16;
  const W = Math.ceil(map.worldW / S);
  const H = Math.ceil(map.worldH / S);
  const prev = new Int32Array(W * H).fill(-2);
  const start = Math.round(y / S) * W + Math.round(x / S);
  const queue: number[] = [start];
  prev[start] = -1;
  let goal = -1;
  for (let qi = 0; qi < queue.length && goal < 0; qi++) {
    const c = queue[qi];
    const cx = c % W;
    const cy = (c - cx) / W;
    if (Math.hypot(portal.x - cx * S, portal.y - cy * S) <= portal.r * 0.6) {
      goal = c;
      break;
    }
    for (const [ax, ay] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + ax;
      const ny = cy + ay;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (prev[n] !== -2 || map.circleBlocked(nx * S, ny * S, PLAYER_RADIUS)) continue;
      prev[n] = c;
      queue.push(n);
    }
  }
  if (goal < 0) return null;
  const cells: number[] = [];
  for (let c = goal; c >= 0; c = prev[c]) cells.push(c);
  cells.reverse();
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 3; i < cells.length; i += 3) {
    pts.push({ x: (cells[i] % W) * S, y: Math.floor(cells[i] / W) * S });
  }
  const last = cells[cells.length - 1];
  pts.push({ x: (last % W) * S, y: Math.floor(last / W) * S });
  return pts;
}

/** Đường thẳng (x0, y0) -> (x1, y1) có thông (không vướng ô chặn, bước 16 px, bằng `circleBlocked` của server) không? */
function segmentClear(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 16));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (map.circleBlocked(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, PLAYER_RADIUS)) return false;
  }
  return true;
}

type BotRole = SoakRole;

/** Tầm tìm quái của bot Nguyên Anh (px): gần hết vùng nhìn của server (`VIEW_ENTER` 1100), chừa biên để quái chưa kịp ra khỏi view */
const NA_HUNT_RADIUS = 1000;
/** Tính lại đường đi vòng tới quái sau chừng này ms (quái đi lại nên đường cũ lệch dần) */
const NA_PATH_REFRESH_MS = 3000;
/**
 * Bot Nguyên Anh không có trang bị (bộ IV 43.500 Linh thạch), nên gặp quái Hàn Vân là gục trong chưa đầy 90 giây rồi luân hồi về Phàm Nhân
 * (soak ngắn đầu tiên: 4 / 4 bot Nguyên Anh gục): soak dài sẽ chỉ còn đo luân hồi. Như người chơi thật, bot rút về trạm nghỉ khi khí huyết / linh lực
 * xuống thấp (đả tọa hồi 6 % khí huyết, 10 % linh lực mỗi giây) rồi mới đi săn tiếp.
 */
const NA_REST_BELOW_HP = 0.5;
const NA_REST_BELOW_MP = 0.2;
const NA_RESUME_HP = 0.95;
const NA_RESUME_MP = 0.9;

const SOAK_MAP_IDS = ["lac_ha", "hac_phong", "am_suong", "han_van", "lang_hoang", "uy_van"];

/**
 * 15 toạ độ an toàn (isPositionSafe = true, không bị chặn bởi cây/đá) nằm sâu trong vùng nguy hiểm cao
 * (danger = 1.0) ở nửa phía bắc Hắc Phong Cốc để rải 15 bot săn trùm bao quát toàn bộ vùng sinh của Xích Mãng.
 */
const BOSS_HUNTER_SPOTS: readonly { x: number; y: number }[] = [
  { x: 600, y: 400 },
  { x: 1600, y: 400 },
  { x: 2600, y: 400 },
  { x: 2800, y: 400 },
  { x: 3400, y: 400 },
  { x: 600, y: 550 },
  { x: 1200, y: 550 },
  { x: 1400, y: 550 },
  { x: 1600, y: 550 },
  { x: 1800, y: 550 },
  { x: 2000, y: 550 },
  { x: 2600, y: 550 },
  { x: 2800, y: 550 },
  { x: 600, y: 700 },
  { x: 1200, y: 700 },
];

/**
 * Bản đồ xuất phát của bot. Mọi vai đều ở Lạc Hà, trừ các bot "travel": phân bổ trải đều qua bốn bản đồ
 * (Lạc Hà, Hắc Phong, Âm Sương, Hàn Vân) sát các cổng chuyển cảnh để soak có người qua lại giữa mọi cặp bản đồ (M7.10 #511),
 * và bot săn trùm khi bật `--boss`: xuất phát ở Hắc Phong Cốc nơi có 6 Xích Mãng.
 */
function startMapOf(role: BotRole, index: number, isBossHunter = false): GameMap {
  if (isBossHunter) return getMap("hac_phong") ?? getMap(DEFAULT_MAP_ID)!;
  // Bot Nguyên Anh (chỉ có khi bật --m7) săn ở Hàn Vân Lĩnh: khớp `mapId` của kế hoạch (soak-plan.ts)
  if (role === "na") return getMap(HAN_VAN_ID) ?? getMap(DEFAULT_MAP_ID)!;
  if (role !== "travel") return getMap(DEFAULT_MAP_ID)!;
  const targetId = SOAK_MAP_IDS[index % SOAK_MAP_IDS.length];
  return getMap(targetId) ?? getMap(DEFAULT_MAP_ID)!;
}

interface BotState extends SkillCaster {
  index: number;
  name: string;
  secret: string;
  role: BotRole;
  bossHunt?: boolean;
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
  /** Các điểm đi bộ tới cổng (xem `pathToPortal`) của bản đồ hiện tại; `null` = chưa tính, đổi bản đồ thì tính lại */
  travelPath: Array<{ x: number; y: number }> | null;
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
  /** Bot Nguyên Anh: các điểm đi bộ vòng qua vật cản tới con quái đang đuổi (xem `pathToPortal`), `null` = đường thẳng thông */
  huntPath: Array<{ x: number; y: number }> | null;
  huntPathAt: number;
  huntPathMonster: string;
  /** Bot Nguyên Anh đang rút về trạm nghỉ (hồi khí huyết / linh lực) */
  resting: boolean;
  nextMeditateAt: number;
  /** Thử tải chặn đường (--ambush, CD10 #1070, #1276) */
  ambush?: boolean;
  ambushState?: AmbushStateMsg;
  ambushFleeing?: boolean;
  ambushMidFleeDecided?: boolean;
  ambushWillMidFlee?: boolean;
  ambushOffersCount: number;
  ambushFightCount: number;
  ambushFleeCoinCount: number;
  ambushFleeExpCount: number;
  ambushMidFleeCount: number;
  ambushWonCount: number;
  ambushLostCount: number;
  ambushFledCount: number;
  ambushTimeoutCount: number;
  ambushDroppedCount: number;
  ambushCanceledCount: number;
  nextItemAt: number;
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
  if (args.m7) {
    console.log(
      `Chế độ:            --m7 (sổ chiêu; ~${Math.round(args.naRatio * 100)}% Nguyên Anh ở Hàn Vân Lĩnh)`,
    );
  }
  if (args.boss) {
    console.log(
      "Chế độ trùm:       --boss (bộ chiêu trùm BOSS_MOVES=on, bot săn Xích Mãng ở Hắc Phong Cốc)",
    );
  }
  if (args.ambush) {
    console.log(
      "Chế độ chặn đường:  --ambush (AMBUSH=on, AMBUSH_BOTS=on, bot đi hoang, đấu trường solo)",
    );
  }
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

  // 1. Phân bổ vai trò cho các bot (soak-plan.ts): không --m7 thì đúng bảng cũ; --m7 thêm vai "na" (Nguyên Anh ở Hàn Vân Lĩnh); --ambush: toàn bộ đi hoang để thử tải chặn đường
  const naCount = args.m7 ? soakNaCount(args.bots, args.naRatio) : 0;
  const botRoles = args.ambush
    ? Array(args.bots).fill("hunt" as BotRole)
    : allocateSoakRoles(args.bots, naCount);
  const roleCount = (r: BotRole) => botRoles.slice(0, args.bots).filter((x) => x === r).length;
  const countHunt = roleCount("hunt");
  const countCrowd = roleCount("crowd");
  const countTravel = roleCount("travel");
  const countDungeon = roleCount("dungeon");
  const countDuel = roleCount("duel");
  const countSect = roleCount("sect");
  // Cảnh giới / bậc / bản đồ / sổ chiêu theo vai (chỉ khi --m7; bot khác gieo như cũ)
  const m7Plans = args.m7 ? planM7Bots(botRoles, args.bots) : [];
  const naFirstIndex = botRoles.indexOf("na");

  console.log(
    `Phân bổ kịch bản (${args.bots} bot): Săn quái ${countHunt} | Trấn/Shop ${countCrowd} | Cổng ${countTravel} | Bí cảnh ${countDungeon} | PK ${countDuel} | Tông môn ${countSect}${args.m7 ? ` | Nguyên Anh (Hàn Vân) ${roleCount("na")}` : ""}`,
  );

  // 2. Gieo sẵn file lưu nhân vật vào tempDir
  let initialTotalCoin = 0;
  const initialPositions = new Map<number, { x: number; y: number }>();
  for (let i = 1; i <= args.bots; i++) {
    const role = botRoles[i - 1];
    const isBossHunter = args.boss && role === "hunt" && i <= 15;
    const name = `Bot ${String(i).padStart(3, "0")}`;
    const secret = `bot_secret_tien_gioi_${String(i).padStart(3, "0")}_soak`;
    const initialCoin = role === "sect" && (i - 1) % 3 === 0 ? 5000 : 100;
    initialTotalCoin += initialCoin;

    const startMap = startMapOf(role, i, isBossHunter);
    let cx = startMap.townPx.x;
    let cy = startMap.townPx.y;

    if (role === "hunt") {
      if (isBossHunter) {
        // Bot săn trùm ở Hắc Phong Cốc: rải đều trên 15 điểm an toàn sâu trong vùng nguy hiểm cao
        // để chắc chắn mọi con Xích Mãng sinh ra đều nằm trong tầm nhìn StateView (1100 px)
        const spot = BOSS_HUNTER_SPOTS[(i - 1) % BOSS_HUNTER_SPOTS.length]!;
        cx = spot.x;
        cy = spot.y;
      } else {
        const angle = (i / countHunt) * Math.PI * 2;
        cx = startMap.townPx.x + Math.cos(angle) * (startMap.townPx.r + 150);
        cy = startMap.townPx.y + Math.sin(angle) * (startMap.townPx.r + 150);
      }
    } else if (role === "na") {
      // Bot Nguyên Anh rải đều quanh trạm Hàn Vân Lĩnh, ba lớp bán kính: ngoài vùng an toàn nhưng chưa vào sâu vùng quái mạnh
      const hv = startMapOf(role, i);
      const k = i - 1 - naFirstIndex;
      const angle = (k / Math.max(1, naCount)) * Math.PI * 2;
      const r = hv.townPx.r + 150 + (k % 3) * 100;
      cx = hv.townPx.x + Math.cos(angle) * r;
      cy = hv.townPx.y + Math.sin(angle) * r;
    } else if (role === "crowd") {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * (getMap(DEFAULT_MAP_ID)!.townPx.r - 30);
      cx = getMap(DEFAULT_MAP_ID)!.townPx.x + Math.cos(angle) * r;
      cy = getMap(DEFAULT_MAP_ID)!.townPx.y + Math.sin(angle) * r;
    } else if (role === "travel") {
      // Sát cổng chuyển cảnh của bản đồ xuất phát (chọn xen kẽ các cổng nếu bản đồ có nhiều cổng; M7.10 #511)
      const startMap = startMapOf(role, i);
      const portalIdx = Math.floor(i / SOAK_MAP_IDS.length) % startMap.portals.length;
      const portal = startMap.portals[portalIdx] ?? startMap.portals.at(-1);
      cx = portal ? portal.spawn.x : getMap(DEFAULT_MAP_ID)!.townPx.x;
      cy = portal ? portal.spawn.y : getMap(DEFAULT_MAP_ID)!.townPx.y;
    } else if (role === "dungeon") {
      cx = NPC_BY_ID.thu_mon.x + (Math.random() - 0.5) * 30;
      cy = NPC_BY_ID.thu_mon.y + (Math.random() - 0.5) * 30;
    } else if (role === "duel") {
      const pairIdx = Math.floor((i - 1) / 2);
      const angle = (pairIdx / Math.max(1, countDuel / 2)) * Math.PI * 2;
      cx =
        getMap(DEFAULT_MAP_ID)!.townPx.x +
        Math.cos(angle) * (getMap(DEFAULT_MAP_ID)!.townPx.r + 80);
      cy =
        getMap(DEFAULT_MAP_ID)!.townPx.y +
        Math.sin(angle) * (getMap(DEFAULT_MAP_ID)!.townPx.r + 80);
    } else if (role === "sect") {
      const grpIdx = Math.floor((i - 1) / 3);
      const angle = (grpIdx / Math.max(1, countSect / 3)) * Math.PI * 2;
      cx =
        getMap(DEFAULT_MAP_ID)!.townPx.x +
        Math.cos(angle) * (getMap(DEFAULT_MAP_ID)!.townPx.r + 100);
      cy =
        getMap(DEFAULT_MAP_ID)!.townPx.y +
        Math.sin(angle) * (getMap(DEFAULT_MAP_ID)!.townPx.r + 100);
    }

    // Điểm hiện của cổng là chỗ hợp lệ theo thiết kế (người qua cổng rơi vào đó); `findUnblockedPosition` đòi xa quái nên kéo bot Hắc Phong về trạm phía nam
    if (role !== "travel") {
      const pos = findUnblockedPosition(startMap, cx, cy);
      cx = pos.x;
      cy = pos.y;
    }
    initialPositions.set(i, { x: cx, y: cy });

    const rawPlan = m7Plans[i - 1];
    const plan =
      isBossHunter && rawPlan
        ? { ...rawPlan, realm: 3, tier: 5, mapId: startMap.def.id }
        : (rawPlan ?? null);
    if (isBossHunter && m7Plans[i - 1]) {
      m7Plans[i - 1] = plan;
    }

    seedSoakBot({
      name,
      secret,
      x: cx,
      y: cy,
      baseRealm: isBossHunter ? 3 : 1,
      baseTier: isBossHunter ? 5 : role === "dungeon" ? 8 : 4,
      baseMapId: startMap.def.id,
      coin: initialCoin,
      dir: tempDir,
      plan,
    });

    if (args.ambush) {
      const key = crypto
        .createHash("sha1")
        .update(name.normalize("NFC").toLowerCase())
        .digest("hex");
      const botFile = path.join(tempDir, `${key}.json`);
      try {
        const saved = JSON.parse(readFileSync(botFile, "utf8"));
        let potQty = 5;
        if (process.env.AMBUSH_SPLIT_POTIONS === "1") {
          potQty = i % 2 === 0 ? 1 : 5;
        } else {
          // Phân bổ: 50% bot mang 0 đan (dễ thua nếu chiến đấu), 50% mang 5 đan (thắng)
          potQty = i % 2 === 0 ? 0 : 5;
        }
        saved.inventory = potQty > 0 ? [{ itemId: "hoi_huyet_dan", qty: potQty }] : [];
        writeFileSync(botFile, JSON.stringify(saved, null, 1));
      } catch {
        /* bỏ qua */
      }
    }
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
      BOSS_MOVES: args.boss ? "on" : (process.env.BOSS_MOVES ?? "on"),
      AMBUSH: args.ambush ? "on" : (process.env.AMBUSH ?? "off"),
      AMBUSH_BOTS: args.ambush ? "on" : (process.env.AMBUSH_BOTS ?? "off"),
      ...(process.env.AMBUSH_MIN_POTIONS
        ? { AMBUSH_MIN_POTIONS: process.env.AMBUSH_MIN_POTIONS }
        : {}),
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
  /** Số lần bot vào phòng của từng bản đồ qua cổng (kiểm ba bản đồ đều được ghé; M6, #410) */
  const mapVisits = new Map<string, number>();
  /**
   * Số lần thi triển theo id chiêu, đếm từ tin `fx` `cast` MÁY CHỦ gửi về đúng người dùng chiêu (`by` = sessionId của chính bot):
   * chỉ tính lần máy chủ đã chấp nhận (đủ ô, đủ cảnh giới / bậc, hết hồi chiêu, đủ linh lực), không tính tin bot gửi đi.
   */
  const skillCastCounts: Record<string, number> = {};
  /** Cùng số liệu theo từng bot (tên bot -> id chiêu -> số lần): để tìm bot nào không dùng chiêu được giao khi một chiêu thiếu lượt */
  const castsByBot: Record<string, Record<string, number>> = {};
  /** Số lần thi triển theo id chiêu trùm từ tin `fx` `bossCast` của máy chủ (#1001) */
  const bossAbilityCastCounts: Record<string, number> = {};
  /** Mốc thi triển chiêu trùm gần nhất theo key `bossId:ability` để chống đếm trùng khi nhiều bot cùng nhận tin fx */
  const recentBossCasts = new Map<string, number>();
  /** Dòng thời gian từng lần thi triển chiêu trùm (#1301) */
  const bossAbilityTimeline: BossCastEvent[] = [];
  /** Trạng thái nhóm săn trùm theo từng phút (#1301) */
  const bossHuntersTimeline: BossHunterMinuteStatus[] = [];
  let lastRecordedHunterMinute = -1;
  let testStartTime = 0;
  const wsUrl = `ws://localhost:${port}`;

  const collectBossHunterInputs = (): BossHunterSnapshotInput[] => {
    const bossBots = bots.filter((b) => b.bossHunt);
    return bossBots.map((b) => {
      const me = b.room?.state?.players?.get(b.room?.sessionId);
      const visibleBossIds: string[] = [];
      if (b.map.def.id === "hac_phong") {
        b.room?.state?.monsters?.forEach((m: any, id: string) => {
          if (
            m.hp > 0 &&
            (m.kind === "mang" || m.kind === "hac_giao" || m.kind === "thien_han_vuong")
          ) {
            visibleBossIds.push(id);
          }
        });
      }
      return {
        mapId: b.map.def.id,
        resting: b.resting,
        hp: me?.hp,
        realm: me?.realm,
        isConnected: b.room?.connection?.isOpen && b.closedCode === null,
        visibleBossIds,
      };
    });
  };

  const recordBossHunterStatus = (min: number) => {
    if (!args.boss) return;
    const snap = computeBossHunterMinuteStatus(min, collectBossHunterInputs());
    bossHuntersTimeline.push(snap);
  };

  const bindBotEvents = (b: BotState, room: Room) => {
    b.room = room;
    b.closedCode = null;

    room.onMessage("chat", () => {});
    room.onMessage("toast", () => {});
    room.onMessage("quests", () => {});
    room.onMessage("soul", () => {});
    room.onMessage(
      "fx",
      (msg: { kind?: string; by?: string; skill?: string; ability?: string }) => {
        if (msg?.kind === "cast" && msg.by === room.sessionId && typeof msg.skill === "string") {
          skillCastCounts[msg.skill] = (skillCastCounts[msg.skill] ?? 0) + 1;
          const own = (castsByBot[b.name] ??= {});
          own[msg.skill] = (own[msg.skill] ?? 0) + 1;
        }
        if (msg?.kind === "bossCast" && typeof msg.ability === "string") {
          const key = `${msg.by ?? ""}:${msg.ability}`;
          const now = performance.now();
          const last = recentBossCasts.get(key) ?? 0;
          if (now - last > 500) {
            recentBossCasts.set(key, now);
            bossAbilityCastCounts[msg.ability] = (bossAbilityCastCounts[msg.ability] ?? 0) + 1;
            const elapsedSec =
              testStartTime > 0 ? Math.floor((Date.now() - testStartTime) / 1000) : 0;
            const minute = Math.floor(elapsedSec / 60);
            const second = elapsedSec % 60;
            const bossMon = b.room?.state?.monsters?.get(msg.by);
            const bossKind =
              bossMon?.kind ?? (typeof msg.by === "string" ? msg.by.split(":")[0] : "boss");
            bossAbilityTimeline.push({
              minute,
              second,
              ability: msg.ability,
              bossId: msg.by,
              bossKind,
            });
          }
        }
      },
    );
    // Sổ chiêu + hồi chiêu của chính bot (bot không có sổ chiêu thì hàm này chỉ ghi nhận, không lắp gì)
    room.onMessage(SKILL_MSG.skills, (msg: SkillsMsg) => applySkillsMsg(b, msg));
    room.onMessage(SKILL_MSG.status, () => {});
    room.onMessage("dmg", () => {});
    room.onMessage("dialog", () => {});
    room.onMessage("reborn", () => {});
    room.onMessage("limbo", () => {
      // Bot bị quái / trùm hạ gục: tự động gửi rebirth sau 1s để hồi sinh tiếp tục hành động (#1001)
      setTimeout(() => {
        if (room.connection?.isOpen) {
          room.send("rebirth", { lineage: "pham_gia" });
        }
      }, 1000);
    });
    room.onMessage("dungeon:fallen", () => {});
    room.onMessage(SECT_MSG.presence, () => {});
    room.onMessage("sectVault", () => {});
    room.onMessage("sectHall", () => {});

    // Sự kiện chặn đường (--ambush, CD9 #1069, CD10 #1070)
    room.onMessage(AMBUSH_MSG.offer, (msg: AmbushOfferMsg) => {
      b.ambushOffersCount++;
      // Xác nhận đã thấy ngay lập tức để không bị hủy sau AMBUSH_SEEN_MS
      room.send(AMBUSH_MSG.seen, { id: msg.id } satisfies AmbushSeenMsg);

      // Chờ qua AMBUSH_ARM_MS (700 ms) rồi mới chọn
      const armDelay = AMBUSH_ARM_MS + 100 + Math.floor(Math.random() * 200);
      setTimeout(() => {
        if (b.closedCode !== null || b.room !== room) return;
        const choices: AmbushChoice[] = ["fight", "flee_exp"];
        if (msg.price?.coin?.enough) {
          choices.push("flee_coin");
        }
        // Khi --ambush: ưu tiên chọn "fight" 75% để thử tải đấu trường solo (có thắng, thua, chạy giữa trận)
        const pickFight = args.ambush ? Math.random() < 0.75 : false;
        const choice = pickFight ? "fight" : choices[Math.floor(Math.random() * choices.length)];
        if (choice === "fight") b.ambushFightCount++;
        else if (choice === "flee_coin") b.ambushFleeCoinCount++;
        else b.ambushFleeExpCount++;
        room.send(AMBUSH_MSG.choose, { id: msg.id, choice } satisfies AmbushChooseMsg);
      }, armDelay);
    });

    let midFleeTimer: NodeJS.Timeout | undefined;

    room.onMessage(AMBUSH_MSG.state, (msg: AmbushStateMsg) => {
      b.ambushState = msg;
      // Trong đấu trường: quyết định 1 lần duy nhất mỗi trận (khoảng 15% xác suất trận này sẽ bỏ chạy giữa trận, còn lại đánh tới cùng)
      if (args.ambush && !b.ambushMidFleeDecided) {
        b.ambushMidFleeDecided = true;
        b.ambushWillMidFlee = Math.random() < 0.15;
      }
      if (args.ambush && b.ambushWillMidFlee && !b.ambushFleeing) {
        const canCoin = msg.price?.coin?.enough === true;
        const me = b.room.state?.players?.get(b.room.sessionId);
        const canExp = (msg.price?.exp ?? 0) > 0 && (me?.exp ?? 0) >= (msg.price?.exp ?? 0);
        if (canCoin || canExp) {
          b.ambushFleeing = true;
          const fleeChoice: AmbushChoice =
            canCoin && (Math.random() < 0.5 || !canExp) ? "flee_coin" : "flee_exp";
          b.ambushMidFleeCount++;
          room.send(AMBUSH_MSG.flee, { choice: fleeChoice } satisfies AmbushFleeMsg);
          // Hẹn giờ dự phòng: nếu sau 3s chưa nhận ambushEnd (bị quái đánh hoặc lỗi), reset để chiến tiếp
          midFleeTimer = setTimeout(() => {
            if (b.ambushState && b.ambushFleeing) {
              b.ambushFleeing = false;
            }
          }, 3000);
        } else {
          b.ambushWillMidFlee = false;
        }
      }
    });

    room.onMessage(AMBUSH_MSG.end, (msg: AmbushEndMsg) => {
      if (midFleeTimer) {
        clearTimeout(midFleeTimer);
        midFleeTimer = undefined;
      }
      b.ambushState = undefined;
      b.ambushFleeing = false;
      b.ambushMidFleeDecided = false;
      b.ambushWillMidFlee = false;
      if (msg.result === "won") b.ambushWonCount++;
      else if (msg.result === "lost") b.ambushLostCount++;
      else if (msg.result === "fled") b.ambushFledCount++;
      else if (msg.result === "timeout") b.ambushTimeoutCount++;
      else if (msg.result === "dropped") b.ambushDroppedCount++;
      else if (msg.result === "canceled") b.ambushCanceledCount++;
    });

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
          const nextMap = getMap(msg.mapId) ?? getMap(DEFAULT_MAP_ID)!;
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
          b.travelPath = null;
          if (b.bossHunt && nextMap.def.id === "hac_phong") {
            const spot = BOSS_HUNTER_SPOTS[(b.index - 1) % BOSS_HUNTER_SPOTS.length]!;
            b.campX = spot.x;
            b.campY = spot.y;
          }
          mapVisits.set(nextMap.def.id, (mapVisits.get(nextMap.def.id) ?? 0) + 1);
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
    const isBossHunter = args.boss && role === "hunt" && i <= 15;
    const name = `Bot ${String(i).padStart(3, "0")}`;
    const secret = `bot_secret_tien_gioi_${String(i).padStart(3, "0")}_soak`;
    const client = new Client(wsUrl);
    const startMap = startMapOf(role, i, isBossHunter);
    const room = await client.joinOrCreate(roomNameOf(startMap.def.id), {
      name,
      secret,
      v: PROTOCOL_VERSION,
    });

    const initPos = initialPositions.get(i) ?? {
      x: getMap(DEFAULT_MAP_ID)!.townPx.x,
      y: getMap(DEFAULT_MAP_ID)!.townPx.y,
    };
    const b: BotState = {
      index: i,
      name,
      secret,
      role,
      bossHunt: isBossHunter,
      client,
      room,
      map: startMap,
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
      travelPath: null,
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
      huntPath: null,
      huntPathAt: 0,
      huntPathMonster: "",
      resting: false,
      nextMeditateAt: 0,
      ambush: args.ambush,
      ambushMidFleeDecided: false,
      ambushWillMidFlee: false,
      ambushOffersCount: 0,
      ambushFightCount: 0,
      ambushFleeCoinCount: 0,
      ambushFleeExpCount: 0,
      ambushMidFleeCount: 0,
      ambushWonCount: 0,
      ambushLostCount: 0,
      ambushFledCount: 0,
      ambushTimeoutCount: 0,
      ambushDroppedCount: 0,
      ambushCanceledCount: 0,
      nextItemAt: 0,
      closedCode: null,
      ...emptySkillCaster(m7Plans[i - 1] != null),
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

    // state có thể chưa giải mã xong ngay sau khi vào phòng (hoặc vừa qua cổng): bỏ qua nhịp này
    const players = b.room.state?.players;
    if (!players) return;
    const me = players.get(b.room.sessionId);
    if (me) {
      b.predX = me.x;
      b.predY = me.y;
    }

    if (now < b.avoidUntil) return;

    let dx = 0;
    let dy = 0;
    /** Đang đi theo điểm đường đã tính (BFS): bỏ kiểm đệm 32 px bên dưới (đường BFS chỉ chừa bán kính người chơi), như bot "travel" */
    let followingPath = false;

    if (isArenaMap(b.map.def.id)) {
      if (b.ambushFleeing) {
        // Đang vận bỏ chạy giữa trận: đứng yên chờ kết quả
        dx = 0;
        dy = 0;
      } else {
        // Tự động dùng đan dược khi máu thấp (< 60% HP)
        if (me && me.hp < me.maxHp * 0.6 && (!b.nextItemAt || now >= b.nextItemAt)) {
          const potSlot = b.invSlots.findIndex(
            (s) => s && s.qty > 0 && s.itemId === "hoi_huyet_dan",
          );
          if (potSlot >= 0) {
            b.room.send("useItem", { slot: potSlot });
            b.nextItemAt = now + 1500;
          }
        }

        // Tìm quái còn sống trong phòng đấu trường solo
        let nearestMon: any = null;
        let nearestId = "";
        let nearestDist = Number.POSITIVE_INFINITY;
        b.room.state.monsters?.forEach((m: any, id: string) => {
          if (m.hp <= 0) return;
          const d = Math.hypot(m.x - b.predX, m.y - b.predY);
          if (d < nearestDist) {
            nearestDist = d;
            nearestMon = m;
            nearestId = id;
          }
        });

        if (nearestMon) {
          // Nếu đứng xa: di chuyển tiếp cận quái
          if (nearestDist > SKILLS.slash.range) {
            let aimX = nearestMon.x;
            let aimY = nearestMon.y;
            // Nếu đường thẳng bị vật cản chặn: tìm đường vòng bằng BFS
            if (!segmentClear(b.map, b.predX, b.predY, aimX, aimY)) {
              if (!b.huntPath || b.huntPathMonster !== nearestId || now >= b.huntPathAt + 2000) {
                b.huntPath =
                  pathToPortal(b.map, b.predX, b.predY, { x: aimX, y: aimY, r: 40 }) ?? [];
                b.huntPathAt = now;
                b.huntPathMonster = nearestId;
              }
              while (
                b.huntPath.length > 1 &&
                Math.hypot(b.huntPath[0].x - b.predX, b.huntPath[0].y - b.predY) < 24
              ) {
                b.huntPath.shift();
              }
              const wp = b.huntPath[0];
              if (wp) {
                aimX = wp.x;
                aimY = wp.y;
              }
            } else {
              b.huntPath = null;
            }
            const a = Math.atan2(aimY - b.predY, aimX - b.predX);
            dx = Math.cos(a);
            dy = Math.sin(a);
            followingPath = true;
          }

          // Vào tầm chém: tung đòn đánh thường
          const angle = Math.atan2(nearestMon.y - b.predY, nearestMon.x - b.predX);
          if (nearestDist <= SKILLS.slash.range + 15 && now >= b.nextSlashAt) {
            b.room.send("attack", { angle });
            b.nextSlashAt = now + SKILLS.slash.cooldown + 50;
          }
          // Tung đòn kiếm cơ bản
          if (nearestDist <= SKILLS.sword.range && now >= b.nextSwordAt) {
            b.room.send("cast", { skillId: "sword", angle });
            b.nextSwordAt = now + SKILLS.sword.cooldown + 100;
          }
          // Thi triển chiêu thức nếu có sổ chiêu
          if (b.skills && me) {
            tryCastLearnedSkill(b, me, nearestDist, angle, now, true);
          }
        }
      }
    } else {
      switch (b.role) {
        case "na": // Nguyên Anh ở Hàn Vân Lĩnh săn như bot "hunt" (khác: cảnh giới, bản đồ, sổ chiêu và tầm tìm quái)
        case "hunt": {
          if (args.ambush) {
            // Kịch bản --ambush: bot đi hoang liên tục ngoài trấn để kích hoạt gặp chặn đường
            // Không đuổi đánh quái thường để không bị khóa trạng thái giao chiến (AMBUSH_CALM_MS = 10s)
            if (now >= b.nextTurnAt) {
              b.wanderAngle += (Math.random() - 0.5) * 1.0;
              b.nextTurnAt = now + 1000 + Math.random() * 2000;
            }
            const town = b.map.townPx;
            const distTown = Math.hypot(town.x - b.predX, town.y - b.predY);
            if (distTown < town.r + 50) {
              b.wanderAngle = Math.atan2(b.predY - town.y, b.predX - town.x);
            } else if (distTown > town.r + 550) {
              b.wanderAngle = Math.atan2(town.y - b.predY, town.x - b.predX);
            }
            dx = Math.cos(b.wanderAngle);
            dy = Math.sin(b.wanderAngle);
            break;
          }

          if (b.bossHunt && b.map.def.id !== "hac_phong") {
            // Bị chuyển về bản đồ khác (ví dụ Lạc Hà sau khi luân hồi): tìm cổng dẫn về Hắc Phong Cốc
            const targetPortal =
              b.map.portals.find((p) => p.toMap === "hac_phong") ?? b.map.portals[0];
            if (targetPortal && now >= b.nextTravelAt && !b.isTravelling) {
              const dist = Math.hypot(targetPortal.x - b.predX, targetPortal.y - b.predY);
              if (dist > targetPortal.r * 0.75) {
                b.travelPath ??= pathToPortal(b.map, b.predX, b.predY, targetPortal) ?? [];
                while (
                  b.travelPath.length > 1 &&
                  Math.hypot(b.travelPath[0].x - b.predX, b.travelPath[0].y - b.predY) < 24
                ) {
                  b.travelPath.shift();
                }
                const wp = b.travelPath[0] ?? targetPortal;
                const a = Math.atan2(wp.y - b.predY, wp.x - b.predX);
                dx = Math.cos(a);
                dy = Math.sin(a);
                followingPath = true;
              } else {
                b.isTravelling = true;
                b.travelPath = null;
                b.room.send("travel", { portalId: targetPortal.id });
                b.nextTravelAt = now + TRAVEL_COOLDOWN_MS + 2000;
              }
            }
            break;
          }
          // Tìm quái gần nhất trong bán kính 300px. Hàn Vân Lĩnh chỉ có 62 quái trên bản đồ 4096 x 4096, con gần trạm nhất cách ~600 px
          // (quái sinh từ `minDanger` 0,2 trở ra): bán kính 300 px thì bot Nguyên Anh đứng quanh trạm gần như không gặp quái nào (soak 10 phút
          // đầu tiên: 3 / 6 chiêu Nguyên Anh không lần nào được thi triển). Bot Nguyên Anh nhìn tới tầm thấy của vùng nhìn (VIEW_ENTER 1100 px).
          const naHunter = b.role === "na";
          // Bot Nguyên Anh hoặc bot săn trùm thấp khí huyết / linh lực: rút về vùng an toàn đả tọa hồi phục
          if (naHunter && me) {
            const hpRatio = me.hp / Math.max(1, me.maxHp);
            const mpRatio = me.mp / Math.max(1, me.maxMp);
            if (!b.resting && (hpRatio < NA_REST_BELOW_HP || mpRatio < NA_REST_BELOW_MP)) {
              b.resting = true;
              b.huntPath = null;
            } else if (b.resting && hpRatio >= NA_RESUME_HP && mpRatio >= NA_RESUME_MP) {
              b.resting = false;
              b.huntPath = null;
              b.room.send("meditate", { on: false });
            }
          } else if (b.bossHunt && me) {
            const hpRatio = me.hp / Math.max(1, me.maxHp);
            const mpRatio = me.mp / Math.max(1, me.maxMp);
            if (!b.resting && (hpRatio < 0.4 || mpRatio < 0.2)) {
              b.resting = true;
              b.huntPath = null;
            } else if (b.resting && hpRatio >= 0.95 && mpRatio >= 0.9) {
              b.resting = false;
              b.huntPath = null;
              b.room.send("meditate", { on: false });
            }
          }
          if (b.resting) {
            if (b.bossHunt) {
              // Bot săn trùm: điểm an toàn là phía nam cổng bắc Hắc Phong Cốc (x: 2080, y: 220, safeR: 192)
              // Điểm này nằm sâu trong vùng an toàn của cổng bắc, đồng thời y > 150 nên không bị chặn bởi isPositionSafe
              const safeX = 2080;
              const safeY = 220;
              const distSafe = Math.hypot(safeX - b.predX, safeY - b.predY);
              if (distSafe <= 80) {
                if (now >= b.nextMeditateAt) {
                  b.room.send("meditate", { on: true });
                  b.nextMeditateAt = now + 3000;
                }
              } else {
                const a = Math.atan2(safeY - b.predY, safeX - b.predX);
                dx = Math.cos(a);
                dy = Math.sin(a);
              }
            } else if (b.map.inTown(b.predX, b.predY)) {
              // Trong trạm: đứng yên đả tọa (gửi lại định kỳ vì bị đánh / di chuyển là thôi đả tọa)
              if (now >= b.nextMeditateAt) {
                b.room.send("meditate", { on: true });
                b.nextMeditateAt = now + 3000;
              }
            } else {
              const town = b.map.townPx;
              if (!b.huntPath || b.huntPathMonster !== "town" || now >= b.huntPathAt + 4000) {
                b.huntPath =
                  pathToPortal(b.map, b.predX, b.predY, { x: town.x, y: town.y, r: town.r }) ?? [];
                b.huntPathAt = now;
                b.huntPathMonster = "town";
              }
              while (
                b.huntPath.length > 1 &&
                Math.hypot(b.huntPath[0].x - b.predX, b.huntPath[0].y - b.predY) < 24
              ) {
                b.huntPath.shift();
              }
              const wp = b.huntPath[0] ?? town;
              const a = Math.atan2(wp.y - b.predY, wp.x - b.predX);
              dx = Math.cos(a);
              dy = Math.sin(a);
              followingPath = true;
            }
            break;
          }
          let nearestMon: any = null;
          let nearestId = "";
          let nearestDist = Number.POSITIVE_INFINITY;
          const maxDist = naHunter ? NA_HUNT_RADIUS : b.bossHunt ? 2500 : 300;
          let bestScore = Number.POSITIVE_INFINITY;
          b.room.state.monsters.forEach((m: any, id: string) => {
            if (m.hp <= 0) return;
            const d = Math.hypot(m.x - b.predX, m.y - b.predY);
            if (d > maxDist) return;
            if (b.bossHunt) {
              // Bot săn trùm:
              // - Nếu có rắn con (ran_con) gần bot (d <= 350), ưu tiên diệt rắn con trước để bossLiveAdds < maxAdds,
              //   giúp Xích Mãng ở Giai đoạn 2 kích hoạt chiêu "goi_ran_con".
              const isAdd = m.kind === "ran_con" && d <= 350;
              const isBoss =
                m.kind === "mang" ||
                m.kind === "hac_giao" ||
                m.kind === "thien_han_vuong" ||
                m.kind === "yeu_vuong";
              const score = isAdd ? d - 20000 : isBoss ? d - 10000 : d;
              const safe = isAdd || isBoss || isPositionSafe(b.map, m.x, m.y, 20);
              if (score < bestScore && safe) {
                bestScore = score;
                nearestDist = d;
                nearestMon = m;
                nearestId = id;
              }
            } else if (d < nearestDist && isPositionSafe(b.map, m.x, m.y, 20)) {
              nearestDist = d;
              nearestMon = m;
              nearestId = id;
            }
          });

          if (nearestMon) {
            // Săn lang thang: bãi săn dời theo con quái đang đuổi (không thì hết quái gần là bot quay về bãi cũ rồi lại đi)
            if (naHunter || b.bossHunt) {
              b.campX = b.predX;
              b.campY = b.predY;
            }
            const angle = Math.atan2(nearestMon.y - b.predY, nearestMon.x - b.predX);
            const isBossTarget =
              b.bossHunt &&
              (nearestMon.kind === "mang" ||
                nearestMon.kind === "hac_giao" ||
                nearestMon.kind === "thien_han_vuong" ||
                nearestMon.kind === "yeu_vuong");
            // Bot săn trùm giữ cự ly giao chiến ở 160-190 px: ở cự ly này bot dùng kiếm (sword, tầm 260 px)
            // và các chiêu tầm xa. Cự ly luôn >= 130 px buộc trùm phải dùng "cuon_minh" (minDist 120 px) để lao tới áp sát,
            // và khi trùm lao tới sát bot (< 100 px), trùm sẽ thi triển tiếp "quat_duoi" (maxDist 170 px)
            const wantDist = isBossTarget ? 190 : SKILLS.slash.range;
            if (nearestDist > wantDist) {
              let aimX = nearestMon.x;
              let aimY = nearestMon.y;
              // Bot Nguyên Anh đứng cách quái xa: đường thẳng bị vách băng chặn thì đi vòng theo BFS, không thì chỉ đâm đầu vào vách, cả đời không
              // chạm quái, nên các chiêu tầm ngắn (nón 90-95 px) không bao giờ được thi triển (chỉ chiêu tự thân như Vân Hành Bộ)
              if (naHunter && !segmentClear(b.map, b.predX, b.predY, aimX, aimY)) {
                if (
                  !b.huntPath ||
                  b.huntPathMonster !== nearestId ||
                  now >= b.huntPathAt + NA_PATH_REFRESH_MS
                ) {
                  b.huntPath =
                    pathToPortal(b.map, b.predX, b.predY, { x: aimX, y: aimY, r: 120 }) ?? [];
                  b.huntPathAt = now;
                  b.huntPathMonster = nearestId;
                }
                while (
                  b.huntPath.length > 1 &&
                  Math.hypot(b.huntPath[0].x - b.predX, b.huntPath[0].y - b.predY) < 24
                ) {
                  b.huntPath.shift();
                }
                const wp = b.huntPath[0];
                if (wp) {
                  aimX = wp.x;
                  aimY = wp.y;
                  followingPath = true;
                }
              } else {
                b.huntPath = null;
              }
              const a = Math.atan2(aimY - b.predY, aimX - b.predX);
              dx = Math.cos(a);
              dy = Math.sin(a);
            } else if (isBossTarget && nearestDist < 150) {
              // Lùi nhẹ để giữ cự ly >= 130 px kích hoạt chiêu cuon_minh
              const a = angle + Math.PI;
              dx = Math.cos(a);
              dy = Math.sin(a);
            }
            if (nearestDist <= SKILLS.slash.range + 10 && now >= b.nextSlashAt) {
              b.room.send("attack", { angle });
              b.nextSlashAt = now + SKILLS.slash.cooldown + 50;
            }
            // Có sổ chiêu (--m7): dùng chiêu đã học theo luật của bots.ts (chọn chiêu mạnh nhất đang sẵn sàng, đủ linh lực, trong tầm)
            if (b.skills && me) {
              tryCastLearnedSkill(b, me, nearestDist, angle, now, true);
            }
            if (nearestDist <= SKILLS.sword.range && now >= b.nextSwordAt) {
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
              // Cổng GẦN NHẤT: Hắc Phong có hai cổng cách nhau ~2700 px (về Lạc Hà / sang Âm Sương), bot đi thẳng tới cổng gần nên mỗi bot qua lại giữa một cặp bản đồ
              let p = portals[0];
              for (const q of portals) {
                if (
                  Math.hypot(q.x - b.predX, q.y - b.predY) <
                  Math.hypot(p.x - b.predX, p.y - b.predY)
                )
                  p = q;
              }
              const dist = Math.hypot(p.x - b.predX, p.y - b.predY);
              // Server chấp nhận trong `portal.r + PORTAL_SLACK`; ngưỡng cũ 30 px không đạt được (`isPositionSafe` loại y < 150 nên bot đứng im cách cổng Bắc ~33 px: soak chưa từng qua cổng)
              if (dist > p.r * 0.75) {
                b.travelPath ??= pathToPortal(b.map, b.predX, b.predY, p) ?? [];
                while (
                  b.travelPath.length > 1 &&
                  Math.hypot(b.travelPath[0].x - b.predX, b.travelPath[0].y - b.predY) < 24
                )
                  b.travelPath.shift();
                const wp = b.travelPath[0] ?? p;
                const a = Math.atan2(wp.y - b.predY, wp.x - b.predX);
                dx = Math.cos(a);
                dy = Math.sin(a);
              } else {
                b.isTravelling = true;
                b.travelPath = null;
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
              b.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
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
    }

    const len = Math.hypot(dx, dy);
    if (len > 0.05) {
      dx /= len;
      dy /= len;
      const stepPx = 150 * (TICK_MS / 1000);
      const testX = Math.round(b.predX + dx * stepPx);
      const testY = Math.round(b.predY + dy * stepPx);
      // bot "travel" đi thẳng tới cổng và bot "bossHunt" đang rút lui về đả tọa bỏ kiểm này để không bị kẹt ở mép
      if (
        b.role !== "travel" &&
        !(b.bossHunt && b.resting) &&
        !followingPath &&
        !isPositionSafe(b.map, testX, testY, 32)
      ) {
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
  testStartTime = startTime;

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
    const activeArenaRooms =
      metricsSnapshot?.rooms?.filter((r: any) => isArenaMap(r.map)).length ?? 0;

    const sample: SoakSample = {
      elapsedSec,
      timestamp: Date.now(),
      rssMb: Number(rssMb.toFixed(2)),
      activeBots,
      activeArenaRooms,
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

    const currentMin = Math.floor(elapsedSec / 60);
    if (args.boss && currentMin > lastRecordedHunterMinute) {
      lastRecordedHunterMinute = currentMin;
      recordBossHunterStatus(currentMin);
    }

    try {
      writeFileSync(outPath, JSON.stringify(samples, null, 2));
    } catch {
      /* bỏ qua */
    }

    const minStr = (elapsedSec / 60).toFixed(1);
    const totalMinStr = (args.durationSec / 60).toFixed(1);
    const arenaStr = args.ambush ? ` | Đấu trường: ${activeArenaRooms}` : "";
    console.log(
      `[${minStr.padStart(4)}m / ${totalMinStr}m] VmRSS: ${rssMb.toFixed(1).padStart(5)} MB | Bots: ${String(activeBots).padStart(3)}/${args.bots}${arenaStr} | Tick p95: ${worstTickP95Ms.toFixed(2).padStart(5)} ms | CPU: ${cpuMsPerTickAvg.toFixed(1).padStart(4)} ms/t | WS: ${String(bytesPerTickPerBot).padStart(3)} B/t | Inflight: ${writesInflight} | Lỗi: ${serverLogErrors} | Cảnh báo: ${monitorAlerts}`,
    );
  }

  clearInterval(botTimer);
  console.log("\nThời gian đo kết thúc. Đang dừng hành động bot để xả hết tin nhắn...");
  const finalMin = Math.floor((Date.now() - startTime) / 1000 / 60);
  if (args.boss && finalMin > lastRecordedHunterMinute) {
    recordBossHunterStatus(finalMin);
  }
  await sleep(1500);

  // Cảnh giới THẬT của bot lúc cuối (chết do quái thì luân hồi, cảnh giới có thể tụt so với lúc gieo): chỉ để ghi nhận, không kiểm
  const finalRealmCounts: Record<number, number> = {};
  if (args.m7) {
    for (const b of bots) {
      const realm = b.room?.state?.players?.get?.(b.room.sessionId)?.realm;
      if (typeof realm === "number") finalRealmCounts[realm] = (finalRealmCounts[realm] ?? 0) + 1;
    }
  }

  // 7. Ngắt kết nối các bot và tắt máy chủ bằng SIGTERM
  console.log("Đang ngắt kết nối bot và tắt máy chủ bằng SIGTERM...");
  for (const b of bots) {
    try {
      if (b.room?.connection?.isOpen) b.room.leave(true);
    } catch {
      /* bỏ qua */
    }
  }
  await sleep(1500);

  // Đo số phòng đấu trường sau khi bot đã ngắt kết nối (yêu cầu phải về 0)
  let finalActiveArenaRooms = 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/metrics?format=json`, {
      headers: { Authorization: `Bearer ${metricsToken}` },
    });
    if (res.status === 200) {
      const m = await res.json();
      finalActiveArenaRooms = m.rooms?.filter((r: any) => isArenaMap(r.map)).length ?? 0;
    }
  } catch {
    /* bỏ qua */
  }

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
  const m7Context: M7SoakContext | undefined = args.m7
    ? {
        requiredSkillIds: NGUYEN_ANH_SKILL_IDS,
        allSkillIds: ALL_SKILL_IDS,
        realmCounts: countRealms(m7Plans),
        skillCastCounts,
      }
    : undefined;
  let bossHunterStatus: BossSoakContext["bossHunterStatus"] | undefined;
  if (args.boss) {
    const inputs = collectBossHunterInputs();
    const finalSnap = computeBossHunterMinuteStatus(0, inputs);
    bossHunterStatus = {
      totalHunters: finalSnap.totalHunters,
      huntersInMap: finalSnap.inHacPhong,
      huntersAlive: inputs.filter((h) => h.isConnected && (h.realm ?? 0) >= 1).length,
      bossesVisible: finalSnap.bossesVisible,
    };
  }

  const bossContext: BossSoakContext | undefined = args.boss
    ? {
        requiredAbilities: ["quat_duoi", "phun_doc", "cuon_minh", "goi_ran_con"],
        abilityCastCounts: bossAbilityCastCounts,
        bossHunterStatus,
        bossTimeline: bossAbilityTimeline,
        bossHuntersTimeline,
      }
    : undefined;

  let totalAmbushOffers = 0;
  let totalAmbushFight = 0;
  let totalAmbushFleeCoin = 0;
  let totalAmbushFleeExp = 0;
  let totalAmbushMidFlee = 0;
  let totalAmbushWon = 0;
  let totalAmbushLost = 0;
  let totalAmbushFled = 0;
  let totalAmbushTimeout = 0;
  let totalAmbushDropped = 0;
  let totalAmbushCanceled = 0;
  for (const b of bots) {
    totalAmbushOffers += b.ambushOffersCount;
    totalAmbushFight += b.ambushFightCount;
    totalAmbushFleeCoin += b.ambushFleeCoinCount;
    totalAmbushFleeExp += b.ambushFleeExpCount;
    totalAmbushMidFlee += b.ambushMidFleeCount;
    totalAmbushWon += b.ambushWonCount;
    totalAmbushLost += b.ambushLostCount;
    totalAmbushFled += b.ambushFledCount;
    totalAmbushTimeout += b.ambushTimeoutCount;
    totalAmbushDropped += b.ambushDroppedCount;
    totalAmbushCanceled += b.ambushCanceledCount;
  }
  const maxActiveArenaRooms = Math.max(0, ...samples.map((s) => s.activeArenaRooms ?? 0));
  const ambushContext: AmbushSoakContext | undefined = args.ambush
    ? {
        offersTotal: totalAmbushOffers,
        fightTotal: totalAmbushFight,
        fleeCoinTotal: totalAmbushFleeCoin,
        fleeExpTotal: totalAmbushFleeExp,
        midFleeTotal: totalAmbushMidFlee,
        wonTotal: totalAmbushWon,
        lostTotal: totalAmbushLost,
        fledTotal: totalAmbushFled,
        timeoutTotal: totalAmbushTimeout,
        droppedTotal: totalAmbushDropped,
        canceledTotal: totalAmbushCanceled,
        maxActiveArenaRooms,
        finalActiveArenaRooms,
      }
    : undefined;

  const analysis = analyzeSoak(
    samples,
    {},
    {
      serverLogErrors,
      monitorAlerts,
      auditErrorsTotal,
      hongFilesCount,
      currencyConservationPassed,
      m7: m7Context,
      boss: bossContext,
      ambush: ambushContext,
    },
  );

  let splitPotionsLogLine: string | undefined;
  if (process.env.AMBUSH_SPLIT_POTIONS === "1") {
    const minPotions = parseInt(process.env.AMBUSH_MIN_POTIONS || "0", 10);
    const pot1Bots = bots.filter((b) => b.index % 2 === 0);
    const pot5Bots = bots.filter((b) => b.index % 2 !== 0);
    const pot1Offers = pot1Bots.reduce((s, b) => s + b.ambushOffersCount, 0);
    const pot5Offers = pot5Bots.reduce((s, b) => s + b.ambushOffersCount, 0);
    if (minPotions >= 2) {
      const pass = pot1Offers === 0;
      splitPotionsLogLine = `- Khẳng định AMBUSH_MIN_POTIONS=${minPotions}: Bot mang 1 đan (chẵn, ${pot1Bots.length} bot) nhận ${pot1Offers} hộp thoại (${
        pass ? "ĐẠT - KHÔNG BAO GIỜ NHẬN" : "FAIL - CÓ HỘP THOẠI"
      }) | Bot mang 5 đan (lẻ, ${pot5Bots.length} bot) nhận ${pot5Offers} hộp thoại`;
      if (!pass) {
        analysis.pass = false;
        analysis.reasons.push(
          `Cơ chế AMBUSH_MIN_POTIONS=${minPotions}: bot mang 1 đan nhận ${pot1Offers} hộp thoại (yêu cầu: 0)`,
        );
      }
    } else {
      splitPotionsLogLine = `- Đối chứng AMBUSH_MIN_POTIONS=${minPotions} (< 2): Bot mang 1 đan (chẵn, ${pot1Bots.length} bot) nhận ${pot1Offers} hộp thoại | Bot mang 5 đan (lẻ, ${pot5Bots.length} bot) nhận ${pot5Offers} hộp thoại (số đo đối chứng khi không lọc)`;
    }
  }

  const formattedTable = formatSoakTable(analysis);
  console.log("\n" + formattedTable);
  if (args.m7) {
    console.log(
      `- Cảnh giới của bot lúc cuối (sau luân hồi nếu có): ${
        Object.entries(finalRealmCounts)
          .map(([r, n]) => `realm ${r}: ${n}`)
          .join(" | ") || "(không đọc được)"
      }`,
    );
  }
  if (args.boss) {
    console.log(
      `- Số lần thi triển chiêu trùm: ${
        Object.entries(bossAbilityCastCounts)
          .map(([id, n]) => `${id}: ${n}`)
          .join(" | ") || "(không có)"
      }`,
    );
  }
  if (splitPotionsLogLine) {
    console.log(splitPotionsLogLine);
  }
  const mapVisitsObj = Object.fromEntries(mapVisits);
  console.log(
    `- Lượt qua cổng vào từng bản đồ: ${
      mapVisits.size === 0
        ? "(không có)"
        : [...mapVisits].map(([id, n]) => `${id} ${n}`).join(" | ")
    }`,
  );

  // Ghi kết quả tổng hợp vào cuối tệp JSON
  const finalOutput = {
    metadata: {
      generatedAt: new Date().toISOString(),
      bots: args.bots,
      durationSec: args.durationSec,
      port,
      dataDir: tempDir,
      mapVisits: mapVisitsObj,
      m7: args.m7,
      boss: args.boss,
      ambush: args.ambush,
      ...(args.boss
        ? {
            bossAbilityCastCounts,
            bossAbilityTimeline,
            bossHuntersTimeline,
          }
        : {}),
      ...(args.ambush ? { ambush: ambushContext } : {}),
      ...(process.env.AMBUSH_SPLIT_POTIONS === "1"
        ? {
            potionsSplit: {
              pot1OffersTotal: bots
                .filter((b) => b.index % 2 === 0)
                .reduce((s, b) => s + b.ambushOffersCount, 0),
              pot5OffersTotal: bots
                .filter((b) => b.index % 2 !== 0)
                .reduce((s, b) => s + b.ambushOffersCount, 0),
            },
          }
        : {}),
      ...(args.m7 ? { naRatio: args.naRatio, naBots: naCount, finalRealmCounts, castsByBot } : {}),
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
