// Kịch bản thử tải bằng bot kết nối qua colyseus.js như người chơi thật.
// Chỉ chạy vào server của Dev C (mặc định cổng 2587 từ .env.local), tuyệt đối không bắn vào cổng 2567 (Dev A) hay 2577 (Dev B).
// Cách dùng:
//   npm run bots -w server -- --bots=50 --duration=15
//   npm run bots -w server -- --suite --mode=realistic --duration=15 --write-doc
//   npm run bots -w server -- --clean-only --yes
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Client, Protocol, type Room } from "colyseus.js";
import {
  AUTH_API,
  DEFAULT_MAP,
  DUEL_COOLDOWN_MS,
  DUEL_MSG,
  DUEL_RANGE,
  DUNGEON_MSG,
  DUNGEON_OPEN_COOLDOWN_MS,
  LINH_HU_ID,
  NPC_BY_ID,
  NPC_RANGE,
  PICKUP_RANGE,
  PLAYER_RADIUS,
  REALMS,
  SKILLS,
  TICK_MS,
  buyPrice,
  getMap,
  isDungeonMap,
  roomNameOf,
  sellPrice,
  statsFor,
  TRAVEL_COOLDOWN_MS,
  type AttackMsg,
  type BuyMsg,
  type DuelEndMsg,
  type DuelInvitedMsg,
  type DuelStateMsg,
  type DungeonEndMsg,
  type DungeonFallenMsg,
  type DungeonInviteMsg,
  type DungeonStateMsg,
  type GameMap,
  type InputMsg,
  type InvMsg,
  type JoinOptions,
  type LimboMsg,
  type PartyInvitedMsg,
  type PartyMsg,
  type PickupMsg,
  type RebirthMsg,
  type RebornMsg,
  type SellMsg,
  type SkillMsg,
  type SoulBuyMsg,
  type TravelMsg,
  type TravelToMsg,
  type WalletMsg,
} from "@tien-gioi/shared";
import { runBench } from "../src/perf/bench";
import { hashSecret, type SavedPlayer } from "../src/store";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const envFile = path.join(repoRoot, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const DEFAULT_PORT = Number(process.env.PORT ?? 2587);
const FORBIDDEN_PORTS = new Set([2567, 2577]); // Cổng của Dev A và Dev B
const DATA_PLAYERS_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(here, "../data/players");
const DOC_PATH = path.resolve(repoRoot, "docs/LOAD_TEST.md");

/** 4 byte overhead khung WebSocket Colyseus (RFC 6455 header + masking). */
const FRAME_OVERHEAD_BYTES = 4;
/** Overhead khung cho tin nhắn ví Linh thạch: "wallet".length (6) + FRAME_OVERHEAD_BYTES (4) = 10 byte (#102). */
const WALLET_MSG_OVERHEAD = "wallet".length + FRAME_OVERHEAD_BYTES;

export type BotMode = "realistic" | "worst" | "crowd";

interface CliArgs {
  bots: number;
  durationSec: number;
  url: string;
  port: number;
  mode: BotMode;
  partySize: number;
  shop: boolean;
  bothModes: boolean;
  cleanOnly: boolean;
  yes: boolean;
  keepSaves: boolean;
  writeDoc: boolean;
  suite: boolean;
  allowOtherPort: boolean;
  commitOverride: string;
  note: string;
  saveJson: string;
  compareJson: string;
  flap: number;
  flapInterval: [number, number];
  flapDelay: [number, number];
  storm: boolean;
  leak: boolean;
  map: string;
  travel: boolean;
  die: boolean;
  account: boolean;
  loginStorm: boolean;
  dungeon: boolean;
  dungeonFall: boolean;
  dungeonFallRate: number;
  duel: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let bots = 50;
  let durationSec = 15;
  let url = "";
  let mode: BotMode = "realistic";
  let partySize = 0;
  let shop = false;
  let bothModes = false;
  let cleanOnly = false;
  let yes = false;
  let keepSaves = false;
  let writeDoc = false;
  let suite = false;
  let allowOtherPort = false;
  let commitOverride = "";
  let note = "chưa có #57, #59";
  let saveJson = "";
  let compareJson = "";
  let flap = 0;
  let flapInterval: [number, number] = [20, 40];
  let flapDelay: [number, number] = [1, 5];
  let storm = false;
  let leak = false;
  let map = DEFAULT_MAP.def.id;
  let travel = false;
  let die = false;
  let account = false;
  let loginStorm = false;
  let dungeon = false;
  let dungeonFall = false;
  let dungeonFallRate = 0;
  let duel = false;

  for (const arg of argv) {
    if (arg.startsWith("--bots=")) bots = Math.max(0, Number(arg.slice(7)));
    else if (arg.startsWith("--duration=")) durationSec = Math.max(2, Number(arg.slice(11)));
    else if (arg.startsWith("--url=")) url = arg.slice(6);
    else if (arg.startsWith("--map=")) map = arg.slice(6);
    else if (arg === "--travel" || arg === "--portal") travel = true;
    else if (arg === "--die") die = true;
    else if (arg === "--dungeon") dungeon = true;
    else if (arg === "--dungeon-fall") {
      dungeon = true;
      dungeonFall = true;
      dungeonFallRate = 1;
    } else if (arg.startsWith("--dungeon-fall=")) {
      dungeon = true;
      dungeonFall = true;
      const rate = Number(arg.slice(15));
      dungeonFallRate = isNaN(rate) ? 1 : Math.max(0, Math.min(1, rate));
    } else if (arg === "--duel" || arg === "--pk") duel = true;
    else if (arg.startsWith("--party")) {
      const val = arg.slice(7).replace(/^=/, "");
      partySize = val ? Math.max(2, Math.min(4, Number(val))) : 4;
    } else if (arg === "--shop") {
      shop = true;
    } else if (arg.startsWith("--flap=")) {
      flap = Math.max(0, Number(arg.slice(7)));
    } else if (arg.startsWith("--flap-interval=")) {
      const parts = arg.slice(16).split(",").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        flapInterval = [Math.min(parts[0], parts[1]), Math.max(parts[0], parts[1])];
      }
    } else if (arg.startsWith("--flap-delay=")) {
      const parts = arg.slice(13).split(",").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        flapDelay = [Math.min(parts[0], parts[1]), Math.max(parts[0], parts[1])];
      }
    } else if (arg === "--storm") {
      storm = true;
    } else if (arg === "--leak") {
      leak = true;
    } else if (arg.startsWith("--mode=")) {
      const m = arg.slice(7);
      if (m === "both") bothModes = true;
      else if (m === "worst") mode = "worst";
      else if (m === "crowd") mode = "crowd";
      else mode = "realistic";
    } else if (arg.startsWith("--commit=")) commitOverride = arg.slice(9);
    else if (arg.startsWith("--note=")) note = arg.slice(7);
    else if (arg.startsWith("--save-json=")) saveJson = arg.slice(12);
    else if (arg.startsWith("--compare-json=")) compareJson = arg.slice(15);
    else if (arg === "--clean-only") cleanOnly = true;
    else if (arg === "--yes") yes = true;
    else if (arg === "--keep-saves") keepSaves = true;
    else if (arg === "--write-doc") writeDoc = true;
    else if (arg === "--suite") suite = true;
    else if (arg === "--allow-other-port") allowOtherPort = true;
    else if (arg === "--account") account = true;
    else if (arg === "--login-storm") loginStorm = true;
  }

  if (leak) {
    if (flap === 0) flap = 20;
    flapInterval = [1, 2];
    flapDelay = [0.5, 1];
  }

  if (dungeon && partySize === 0) {
    partySize = 4;
  }

  if (storm && durationSec < 20) {
    console.warn(
      `[CẢNH BÁO] --storm kích hoạt ở giây thứ 15 và cần 2s để các bot nối lại; thời lượng ${durationSec}s không đủ để đo bão. Tự động tăng --duration lên 20s.`,
    );
    durationSec = 20;
  }

  if (!getMap(map)) {
    console.warn(
      `[CẢNH BÁO] Bản đồ "${map}" không tồn tại trong MAPS. Sẽ dùng bản đồ mặc định "${DEFAULT_MAP.def.id}".`,
    );
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
    partySize,
    shop,
    bothModes,
    cleanOnly,
    yes,
    keepSaves,
    writeDoc,
    suite,
    allowOtherPort,
    commitOverride,
    note,
    saveJson,
    compareJson,
    flap,
    flapInterval,
    flapDelay,
    storm,
    leak,
    map,
    travel,
    die,
    account,
    loginStorm,
    dungeon,
    dungeonFall,
    dungeonFallRate,
    duel,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** PRNG có seed cố định (giống bench.ts) để vị trí khởi đầu của các bot lặp lại y hệt giữa các lần đo. */
function seededPrng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ghi sẵn file lưu nhân vật cho bot với vị trí (x, y) rải đều ngoài vùng hoang dã trước khi gọi joinOrCreate,
 * để ngay lúc WorldRoom.onJoin khởi tạo StateView (#62), các bot đã đứng ở bãi săn khắp bản đồ (khớp với bench.ts)
 * thay vì tụ hết trong Lạc Hà Trấn.
 */
function seedBotSaveFile(
  name: string,
  secret: string,
  x: number,
  y: number,
  realm: number,
  tier: number,
  mapId: string = DEFAULT_MAP.def.id,
  life?: { playMs: number; kills: number; bossKills: number },
): void {
  mkdirSync(DATA_PLAYERS_DIR, { recursive: true });
  // Tên file PHẢI khớp với fileFor() trong server/src/store.ts (sha1 của tên NFC viết thường).
  // store.ts đổi cách đặt tên file thì bot sẽ ghi nhầm chỗ mà không báo lỗi: sửa cả hai nơi.
  // Ưu tiên DATA_DIR từ môi trường (giống store.ts), mặc định trỏ về server/data/players.
  const key = createHash("sha1").update(name.normalize("NFC").toLowerCase()).digest("hex");
  const file = path.join(DATA_PLAYERS_DIR, `${key}.json`);
  const now = new Date().toISOString();
  const saved: SavedPlayer = {
    name,
    secretHash: hashSecret(secret),
    realm,
    tier,
    exp: 0,
    coin: 100,
    mapId,
    x: Math.round(x),
    y: Math.round(y),
    life,
    createdAt: now,
    updatedAt: now,
  };
  writeFileSync(file, JSON.stringify(saved, null, 1));
}

function currentGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function soulsDirPath(): string {
  if (process.env.SOULS_DIR) return path.resolve(process.env.SOULS_DIR);
  return path.join(DATA_PLAYERS_DIR, "souls");
}

function soulFileOf(name: string): string {
  const norm = name.normalize("NFC").toLowerCase().trim();
  const hash = createHash("sha1").update(norm).digest("hex");
  return path.join(soulsDirPath(), `${hash}.json`);
}

export interface BotAccountResult {
  token: string;
  username: string;
  isNew: boolean;
  latencyMs: number;
}

/**
 * Xác thực tài khoản cho bot khi chạy với chế độ tài khoản (AUTH_MODE=account).
 * Sử dụng header X-Forwarded-For với IP giả định riêng cho từng bot (10.0.x.y) để
 * không kích hoạt giới hạn tần suất theo IP khi TRUST_PROXY bật.
 */
export async function authBotAccount(
  httpBase: string,
  botIndex: number,
  botName: string,
  customPassword?: string,
): Promise<BotAccountResult> {
  const numStr = String(botIndex).padStart(3, "0");
  const username = `bot_u_${numStr}`;
  const password = customPassword ?? `bot_pass_${numStr}_tien_gioi_123`;
  const ip = `10.0.${Math.floor(botIndex / 250)}.${(botIndex % 250) + 1}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Forwarded-For": ip,
  };

  const t0 = performance.now();
  let token: string | undefined;
  let isNew = false;

  // 1. Thử đăng nhập trước
  const loginRes = await fetch(`${httpBase}${AUTH_API.login}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username, password }),
  });

  if (loginRes.ok) {
    const data = (await loginRes.json()) as { token: string };
    token = data.token;
  } else {
    // 2. Nếu chưa có tài khoản, đăng ký mới
    const regRes = await fetch(`${httpBase}${AUTH_API.register}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ username, password }),
    });
    if (!regRes.ok) {
      const errText = await regRes.text();
      throw new Error(`Bot ${botIndex} đăng ký thất bại (${regRes.status}): ${errText}`);
    }
    const data = (await regRes.json()) as { token: string };
    token = data.token;
    isNew = true;
  }

  if (!token) throw new Error(`Không lấy được token cho Bot ${botIndex}`);

  // 3. Đặt đạo hiệu nếu chưa có
  const charRes = await fetch(`${httpBase}${AUTH_API.character}`, {
    method: "POST",
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: botName }),
  });

  if (!charRes.ok) {
    const errText = await charRes.text();
    let errCode = "";
    try {
      errCode = JSON.parse(errText)?.error ?? "";
    } catch {
      // Bỏ qua nếu không phải JSON
    }
    if (errCode !== "has_character") {
      throw new Error(`Bot ${botIndex} đặt đạo hiệu thất bại (${charRes.status}): ${errText}`);
    }
  }

  const latencyMs = performance.now() - t0;
  return { token, username, isNew, latencyMs };
}

export interface LoginStormReport {
  total: number;
  success: number;
  failed: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  totalDurationMs: number;
}

/**
 * Thử tải bão đăng nhập (Login Storm): gửi đồng thời N yêu cầu xác thực tài khoản
 * qua HTTP API và đo lường độ trễ cũng như tỷ lệ thành công.
 */
export async function runLoginStorm(
  httpBase: string,
  botCount: number,
  prefix = "Bot",
  customPassword?: string,
): Promise<LoginStormReport> {
  const start = performance.now();
  const tasks = Array.from({ length: botCount }, (_, i) => {
    const idx = i + 1;
    const botName = `${prefix} ${String(idx).padStart(3, "0")}`;
    return authBotAccount(httpBase, idx, botName, customPassword)
      .then((res) => ({ ok: true, latency: res.latencyMs, err: null }))
      .catch((err) => ({ ok: false, latency: 0, err: (err as Error).message }));
  });

  const results = await Promise.all(tasks);
  const totalDurationMs = performance.now() - start;
  const successes = results.filter((r) => r.ok);
  const latencies = successes.map((r) => r.latency).sort((a, b) => a - b);

  const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const max = latencies.length ? latencies[latencies.length - 1] : 0;

  return {
    total: botCount,
    success: successes.length,
    failed: results.length - successes.length,
    avgLatencyMs: Math.round(avg * 10) / 10,
    p50LatencyMs: Math.round(p50 * 10) / 10,
    p95LatencyMs: Math.round(p95 * 10) / 10,
    maxLatencyMs: Math.round(max * 10) / 10,
    totalDurationMs: Math.round(totalDurationMs * 10) / 10,
  };
}

/**
 * Xoá đúng danh sách các file nhân vật bot mà lượt chạy hiện tại đã tạo ra trong `server/data/players/`
 * và tệp chân linh tương ứng trong `souls/` (#159/#151).
 * Tránh xoá nhầm người chơi thật có tên bắt đầu bằng "Bot ".
 */
function cleanCreatedBotSaves(createdNames: ReadonlySet<string>): number {
  if (!existsSync(DATA_PLAYERS_DIR) || createdNames.size === 0) return 0;
  let removed = 0;
  for (const entry of readdirSync(DATA_PLAYERS_DIR)) {
    if (!entry.endsWith(".json")) continue;
    const fullPath = path.join(DATA_PLAYERS_DIR, entry);
    try {
      const data = JSON.parse(readFileSync(fullPath, "utf8")) as { name?: string };
      if (typeof data.name === "string" && createdNames.has(data.name.trim())) {
        rmSync(fullPath, { force: true });
        removed++;
      }
    } catch {
      // Bỏ qua file đang ghi dở hoặc lỗi đọc
    }
  }

  // Xoá thêm các file chân linh tương ứng trong souls/
  const sDir = soulsDirPath();
  if (existsSync(sDir)) {
    for (const name of createdNames) {
      const sFile = soulFileOf(name);
      if (existsSync(sFile)) {
        try {
          rmSync(sFile, { force: true });
        } catch {
          // Bỏ qua lỗi xoá file
        }
      }
    }
  }

  return removed;
}

/**
 * Dọn thủ công bằng `--clean-only`: in danh sách các file sẽ xoá và yêu cầu thêm `--yes` mới thực sự xoá.
 */
function cleanBotSavesManual(confirmYes: boolean): void {
  if (!existsSync(DATA_PLAYERS_DIR)) {
    console.log(`Thư mục ${DATA_PLAYERS_DIR} chưa tồn tại.`);
    return;
  }
  const matched: { entry: string; fullPath: string; name: string }[] = [];
  for (const entry of readdirSync(DATA_PLAYERS_DIR)) {
    if (!entry.endsWith(".json")) continue;
    const fullPath = path.join(DATA_PLAYERS_DIR, entry);
    try {
      const data = JSON.parse(readFileSync(fullPath, "utf8")) as { name?: string };
      if (typeof data.name === "string" && /^bot[\s_]/i.test(data.name.trim())) {
        matched.push({ entry, fullPath, name: data.name.trim() });
      }
    } catch {
      // Bỏ qua file lỗi đọc
    }
  }

  if (matched.length === 0) {
    console.log(`Không có file nhân vật bot nào trong ${DATA_PLAYERS_DIR}.`);
    return;
  }

  console.log(`Danh sách ${matched.length} file nhân vật khớp mẫu bot trong ${DATA_PLAYERS_DIR}:`);
  for (const item of matched) {
    console.log(`  - ${item.entry} (name: "${item.name}")`);
  }

  if (!confirmYes) {
    console.log(
      `\nChế độ xem trước (--clean-only): chưa xoá file nào. Thêm cờ --yes (--clean-only --yes) để xác nhận xoá.`,
    );
    return;
  }

  for (const item of matched) {
    rmSync(item.fullPath, { force: true });
    const sFile = soulFileOf(item.name);
    if (existsSync(sFile)) {
      try {
        rmSync(sFile, { force: true });
      } catch {
        // Bỏ qua lỗi xoá file chân linh
      }
    }
  }
  console.log(
    `\nĐã xoá ${matched.length} file lưu nhân vật bot (và chân linh tương ứng) trong ${DATA_PLAYERS_DIR}.`,
  );
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
  if (typeof (data as any)?.size === "number") return (data as any).size;
  if (typeof (data as any)?.byteLength === "number") return (data as any).byteLength;
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
  map: GameMap;
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
  partyMsgsCount: number;
  partyBytes: number;
  myParty: PartyMsg | null;
  walletMsgsCount: number;
  walletBytes: number;
  coin: number;
  invSlots: ({ itemId: string; qty: number } | null)[];
  nextShopCheckAt: number;
  shopping: boolean;
  kicked4429: boolean;
  closedCode: number | null;
  // Các trường mới cho flap / reconnect (#120)
  isFlapping: boolean;
  flapCount: number;
  nextFlapAt: number;
  reconnectAt: number;
  reconnectToken: string;
  // Các trường cho thử tải qua cổng liên tục (#141)
  isTravelling: boolean;
  travelSentAt: number;
  nextTravelAt: number;
  travelCount: number;
  travelLatencies: number[];
  travelInitialBytes: number[];
  // Các trường cho thử tải luân hồi / chết hàng loạt (#151)
  die: boolean;
  diedAt: number;
  deathsCount: number;
  rebirthsCount: number;
  rebirthSentAt: number;
  soulBuysCount: number;
  limboLatencies: number[];
  rebirthLatencies: number[];
  // Trường cho chế độ tài khoản (#176)
  token?: string;
  // Các trường cho thử tải bí cảnh (--dungeon, #201)
  dungeon?: boolean;
  dungeonOpenSentAt: number;
  dungeonRunsCount: number;
  dungeonRunsWon: number;
  dungeonRunsLost: number;
  dungeonOpenLatencies: number[];
  dungeonState?: DungeonStateMsg;
  dungeonLastEndAt: number;
  nextDungeonOpenAt: number;
  // Các trường cho thử tải gục bí cảnh (--dungeon-fall, #236)
  dungeonFall?: boolean;
  dungeonFallenCount: number;
  dungeonFallExitCount: number;
  dungeonNewLifesCount: number;
  isFallenWaitingExit: boolean;
  // Các trường cho thử tải PK thách đấu (--duel, #219)
  duel?: boolean;
  duelOpponentName?: string;
  duelPhase?: "countdown" | "fight";
  duelMatchesCount: number;
  duelMatchesWon: number;
  duelMatchesLost: number;
  duelMatchesDraw: number;
  duelLastEndAt: number;
  nextDuelChallengeAt: number;
}

export interface LoadTestMetrics {
  commit: string;
  note: string;
  map?: string;
  mode?: BotMode;
  partySize?: number;
  shop?: boolean;
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
  /** Băng thông nhận các gói tin nhắn sự kiện (fx, dmg, party) mỗi giây trên mỗi bot (KB/s) */
  rxEventKBpsPerBot?: number;
  /** Băng thông riêng của tin nhắn tổ đội (party) mỗi giây trên mỗi bot (KB/s) */
  rxPartyKBpsPerBot?: number;
  /** Băng thông riêng của tin nhắn ví Linh thạch (wallet) mỗi giây trên mỗi bot (KB/s) (#102) */
  rxWalletKBpsPerBot?: number;
  txKBpsPerBot: number;
  rxMsgsPerSecPerBot: number;
  txMsgsPerSecPerBot: number;
  totalRxKBps: number;
  totalTxKBps: number;
  monstersStart: number;
  monstersAvg: number;
  monstersMin: number;
  monstersEnd: number;
  /** Số quái trung bình trong tầm nhìn (StateView) của mỗi bot (#62) */
  visibleMonstersAvg?: number;
  /** Số người chơi trung bình trong tầm nhìn (StateView) của mỗi bot (#62) */
  visiblePlayersAvg?: number;
  /** Tổng số quái trên toàn server lấy từ benchmark nội bộ (bench.ts) */
  serverMonstersTotal?: number;
  /** Tổng số quái còn sống hợp nhất từ tầm nhìn của toàn bộ bot lúc đo */
  unionMonstersAvg?: number;
  attacksSent: number;
  skillsSent: number;
  inputsSent: number;
  fxEventsReceivedPerBot?: number;
  dmgEventsReceivedPerBot: number;
  partyEventsReceivedPerBot?: number;
  walletEventsReceivedPerBot?: number;
  /** Các chỉ số thử tải rớt mạng và nối lại (#120) */
  flapTarget?: number;
  flapSuccess?: number;
  flapFail?: number;
  reconnectLatencyAvgMs?: number;
  reconnectLatencyP50Ms?: number;
  reconnectLatencyP95Ms?: number;
  reconnectBytesAvg?: number;
  storm?: boolean;
  stormCpuTickMax?: number;
  stormCpuTickP95?: number;
  stormReconnected?: number;
  stormTotalBytes?: number;
  leakTested?: boolean;
  leakEndOnline?: number;
  leakRssDeltaMb?: number;
  /** Các chỉ số thử tải qua cổng liên tục giữa các bản đồ (#141) */
  travel?: boolean;
  travelCount?: number;
  travelLatencyAvgMs?: number;
  travelLatencyP50Ms?: number;
  travelLatencyP95Ms?: number;
  travelInitialBytesAvg?: number;
  /** Các chỉ số thử tải luân hồi / chết hàng loạt (#151) */
  die?: boolean;
  deathsTotal?: number;
  rebirthsTotal?: number;
  soulBuysTotal?: number;
  limboLatencyAvgMs?: number;
  limboLatencyP50Ms?: number;
  limboLatencyP95Ms?: number;
  rebirthLatencyAvgMs?: number;
  rebirthLatencyP50Ms?: number;
  rebirthLatencyP95Ms?: number;
  /** Các chỉ số thử tải bí cảnh (#201) */
  dungeon?: boolean;
  dungeonRunsTotal?: number;
  dungeonRunsWon?: number;
  dungeonRunsLost?: number;
  dungeonOpenLatencyAvgMs?: number;
  dungeonOpenLatencyP50Ms?: number;
  dungeonOpenLatencyP95Ms?: number;
  /** Chỉ số gục trong bí cảnh (#236) */
  dungeonFall?: boolean;
  dungeonFallenTotal?: number;
  dungeonFallExits?: number;
  dungeonNewLifes?: number;
  /** Các chỉ số thử tải PK thách đấu (#219) */
  duel?: boolean;
  duelMatchesTotal?: number;
  duelMatchesWon?: number;
  duelMatchesLost?: number;
  duelMatchesDraw?: number;
}

export interface IdleZeroBotMetrics {
  durationSec: number;
  monsters: number;
  serverPid: number | null;
  serverCpuMsPerTickAvg: number | null;
  serverCpuMsPerTickP95: number | null;
  serverCpuMsPerTickMax: number | null;
  benchTickAvgMs: number;
  benchTickP95Ms: number;
  benchPatchBytesPerTick: number;
  benchKBpsPerClient: number;
}

export interface LoadTestSnapshot {
  commit: string;
  note: string;
  idleZeroBots?: IdleZeroBotMetrics;
  results: LoadTestMetrics[];
}

/**
 * Đo mức 0 bot (chỉ server chạy, không có người chơi nào trong phòng) trong `durationSec` giây:
 * 1. Kết nối 1 bot mồi để khởi tạo `WorldRoom` (`autoDispose = false`) rồi thoát ngay và xoá file lưu.
 * 2. Đo CPU mỗi tick (50 ms) của tiến trình server thật khi phòng có 0 người và 88 quái ngủ.
 * 3. Chạy `runBench(0, durationSec)` để đo chính xác số byte `Encoder.encode()` mỗi tick ở mức 0 người (phải bằng 0 byte nhờ quái ngủ).
 */
async function runIdleZeroBotTest(
  durationSec: number,
  url: string,
  port: number,
  keepSaves: boolean,
  mapId: string = DEFAULT_MAP.def.id,
): Promise<IdleZeroBotMetrics> {
  const currentMap = getMap(mapId) ?? DEFAULT_MAP;
  console.log(
    `\n=== Đo mức 0 bot (phòng trống, kiểm tra quái ngủ) trong ${durationSec}s (${url}, bản đồ=${currentMap.def.name}) ===`,
  );
  const seedName = "Bot 000";
  const seedSecret = "bot_secret_tien_gioi_000_loadtest";
  seedBotSaveFile(
    seedName,
    seedSecret,
    currentMap.townPx.x,
    currentMap.townPx.y,
    1,
    0,
    currentMap.def.id,
  );
  const client = new Client(url);
  const roomName = roomNameOf(currentMap.def.id);
  const room = await client.joinOrCreate(roomName, {
    name: seedName,
    secret: seedSecret,
  });
  await sleep(150);
  const monstersCount = (room.state as any)?.monsters?.size ?? 88;
  await room.leave(true);
  await sleep(400);
  if (!keepSaves) {
    cleanCreatedBotSaves(new Set([seedName]));
  }

  const serverPid = findServerPid(port);
  let prevCpuMs = serverPid ? readServerExecRuntimeMs(serverPid) : null;
  const cpuSamples: number[] = [];

  const timer = setInterval(() => {
    if (!serverPid) return;
    const cur = readServerExecRuntimeMs(serverPid);
    if (cur !== null && prevCpuMs !== null) {
      cpuSamples.push(Math.max(0, cur - prevCpuMs));
    }
    prevCpuMs = cur;
  }, TICK_MS);

  const cpuStart = serverPid ? readServerExecRuntimeMs(serverPid) : null;
  const t0 = performance.now();
  await sleep(durationSec * 1000);
  const actualSec = (performance.now() - t0) / 1000;
  const cpuEnd = serverPid ? readServerExecRuntimeMs(serverPid) : null;
  clearInterval(timer);

  cpuSamples.sort((a, b) => a - b);
  const ticks = actualSec * (1000 / TICK_MS);
  const cpuAvg =
    cpuStart !== null && cpuEnd !== null && ticks > 0
      ? (cpuEnd - cpuStart) / ticks
      : cpuSamples.length > 0
        ? avg(cpuSamples)
        : null;

  const bench0 = runBench(0, durationSec);
  const idle: IdleZeroBotMetrics = {
    durationSec: Number(actualSec.toFixed(2)),
    monsters: bench0.monsters || monstersCount,
    serverPid,
    serverCpuMsPerTickAvg: cpuAvg !== null ? Number(cpuAvg.toFixed(3)) : null,
    serverCpuMsPerTickP95:
      cpuSamples.length > 0 ? Number(percentile(cpuSamples, 95).toFixed(3)) : null,
    serverCpuMsPerTickMax: cpuSamples.length > 0 ? Number(cpuSamples.at(-1)!.toFixed(3)) : null,
    benchTickAvgMs: Number(bench0.avgMs.toFixed(3)),
    benchTickP95Ms: Number(bench0.p95Ms.toFixed(3)),
    benchPatchBytesPerTick: Math.round(bench0.patchBytes),
    benchKBpsPerClient: Number(bench0.kbPerSecPerClient.toFixed(2)),
  };

  console.log(
    `- Mức 0 bot (${idle.monsters} quái ngủ): CPU tiến trình server TB ${idle.serverCpuMsPerTickAvg} ms/tick (p95 ${idle.serverCpuMsPerTickP95} ms, max ${idle.serverCpuMsPerTickMax} ms) | State patch mã hoá: ${idle.benchPatchBytesPerTick} byte/tick (${idle.benchKBpsPerClient} KB/s)`,
  );
  return idle;
}

/** Gắn các trình xử lý tin nhắn, luồng đo băng thông và state change cho room của bot. */
function bindRoomEvents(
  b: BotState,
  room: Room,
  isMeasuring: () => boolean,
  patchIntervals: number[],
  ackRtts: number[],
  onFirstState?: (tReceived: number, initialBytes: number) => void,
  onTravelTo?: (msg: TravelToMsg) => void,
) {
  b.room = room;
  b.reconnectToken = room.reconnectionToken;
  b.closedCode = null;
  b.kicked4429 = false;

  room.onMessage("fx", () => {
    if (isMeasuring()) b.fxCount++;
  });
  room.onMessage("dmg", () => {
    if (isMeasuring()) b.dmgCount++;
  });
  room.onMessage("partyInvited", (msg: PartyInvitedMsg) => {
    room.send("partyAccept", { from: msg.from });
  });
  room.onMessage("party", (msg: PartyMsg) => {
    if (isMeasuring()) {
      b.partyMsgsCount++;
      b.partyBytes += Buffer.byteLength(JSON.stringify(msg)) + 9;
    }
    b.myParty = msg;
  });
  room.onMessage("wallet", (msg: WalletMsg) => {
    if (isMeasuring()) {
      b.walletMsgsCount++;
      b.walletBytes += Buffer.byteLength(JSON.stringify(msg)) + WALLET_MSG_OVERHEAD;
    }
    b.coin = msg.coin;
  });
  room.onMessage("chat", () => {});
  room.onMessage("toast", () => {});
  room.onMessage("inv", (msg: InvMsg) => {
    b.invSlots = msg.slots ?? [];
  });
  room.onMessage("quests", () => {});
  room.onMessage("dialog", () => {});
  room.onMessage("travelTo", (msg: TravelToMsg) => {
    if (b.isFallenWaitingExit) {
      if (isMeasuring()) b.dungeonFallExitCount++;
      b.isFallenWaitingExit = false;
    }
    if (onTravelTo) onTravelTo(msg);
  });
  room.onMessage(DUNGEON_MSG.invite, (msg: DungeonInviteMsg) => {
    if (b.dungeon) {
      room.send(DUNGEON_MSG.enter, { runId: msg.runId });
    }
  });
  room.onMessage(DUNGEON_MSG.state, (msg: DungeonStateMsg) => {
    b.dungeonState = msg;
  });
  room.onMessage(DUNGEON_MSG.fallen, (_msg: DungeonFallenMsg) => {
    if (isMeasuring()) b.dungeonFallenCount++;
    b.isFallenWaitingExit = true;
  });
  room.onMessage(DUNGEON_MSG.end, (msg: DungeonEndMsg) => {
    b.dungeonLastEndAt = performance.now();
    if (isMeasuring()) {
      if (msg.result === "won") b.dungeonRunsWon++;
      else b.dungeonRunsLost++;
    }
  });
  room.onMessage(DUEL_MSG.invited, (msg: DuelInvitedMsg) => {
    if (b.duel) {
      room.send(DUEL_MSG.accept, { from: msg.from });
    }
  });
  room.onMessage(DUEL_MSG.state, (msg: DuelStateMsg) => {
    if (b.duel) {
      b.duelPhase = msg.phase;
      b.duelOpponentName = msg.opponent;
    }
  });
  room.onMessage(DUEL_MSG.end, (msg: DuelEndMsg) => {
    if (b.duel) {
      b.duelPhase = undefined;
      b.duelLastEndAt = performance.now();
      b.nextDuelChallengeAt = performance.now() + DUEL_COOLDOWN_MS + 500;
      if (isMeasuring()) {
        b.duelMatchesCount++;
        if (msg.result === "won") b.duelMatchesWon++;
        else if (msg.result === "lost") b.duelMatchesLost++;
        else b.duelMatchesDraw++;
      }
    }
  });
  room.onMessage("limbo", (msg: LimboMsg) => {
    if (isMeasuring()) {
      b.deathsCount++;
      if (isDungeonMap(b.map.def.id)) {
        b.dungeonNewLifesCount++;
      }
      if (b.diedAt > 0) {
        b.limboLatencies.push(performance.now() - b.diedAt);
        b.diedAt = 0;
      }
    }
    // Khi nhận limbo, bot tiến hành mua mở khóa (soulBuy) và đầu thai (rebirth)
    if (b.die) {
      if (msg?.soul && typeof msg.soul.duyen === "number" && msg.soul.duyen >= 12) {
        b.soulBuysCount++;
        room.send("soulBuy", { id: "du_am" } satisfies SoulBuyMsg);
      }
      const keepChoice: string[] = [];
      if (msg?.keepable && Array.isArray(msg.keepable) && msg.keepable.length > 0) {
        keepChoice.push(msg.keepable[0]);
      }
      b.rebirthSentAt = performance.now();
      room.send("rebirth", { origin: "pham_gia", keep: keepChoice } satisfies RebirthMsg);
    }
  });
  room.onMessage("soul", () => {});
  room.onMessage("reborn", (_msg: RebornMsg) => {
    b.diedAt = 0;
    if (isMeasuring()) {
      b.rebirthsCount++;
      if (b.rebirthSentAt > 0) {
        b.rebirthLatencies.push(performance.now() - b.rebirthSentAt);
        b.rebirthSentAt = 0;
      }
    } else {
      b.rebirthSentAt = 0;
    }
  });

  room.onLeave((code) => {
    if (!b.isFlapping && !b.isTravelling && code !== 4000) {
      b.closedCode = code;
      if (code === 4429) b.kicked4429 = true;
    }
  });

  let initialRxBytes = 0;
  let firstStateDone = false;

  const ws = (room.connection as any)?.transport?.ws;
  if (ws) {
    const onIncomingData = (data: unknown) => {
      const len = byteLengthOf(data);
      initialRxBytes += len;
      if (!isMeasuring()) return;
      b.rxBytes += len;
      b.rxMsgs += 1;
      if (firstByteOf(data) === Protocol.ROOM_STATE_PATCH) {
        b.rxPatchBytes += len;
      }
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

    const origSend = ws.send.bind(ws);
    ws.send = (data: unknown, ...rest: unknown[]) => {
      if (isMeasuring()) {
        b.txBytes += byteLengthOf(data);
        b.txMsgs += 1;
      }
      return origSend(data, ...rest);
    };
  }

  room.onStateChange(() => {
    const t = performance.now();
    if (!firstStateDone && initialRxBytes > 0) {
      firstStateDone = true;
      if (onFirstState) {
        onFirstState(t, initialRxBytes);
      }
    }

    if (isMeasuring() && b.lastPatchAt > 0) {
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
        if (isMeasuring()) ackRtts.push(t - sentAt);
        for (const k of b.sentAtBySeq.keys()) {
          if (k <= me.lastSeq) b.sentAtBySeq.delete(k);
        }
      }
    }
  });
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
  partySize = 0,
  shop = false,
  flap = 0,
  flapInterval: [number, number] = [20, 40],
  flapDelay: [number, number] = [1, 5],
  storm = false,
  leak = false,
  mapId: string = DEFAULT_MAP.def.id,
  travel = false,
  die = false,
  account = false,
  dungeon = false,
  dungeonFall = false,
  dungeonFallRate = 0,
  duel = false,
): Promise<LoadTestMetrics> {
  const currentMap = getMap(mapId) ?? DEFAULT_MAP;
  const partySuffix = partySize > 1 ? `, tổ đội ${partySize} người` : "";
  const shopSuffix = shop ? ", mua bán shop" : "";
  const flapSuffix = flap > 0 ? `, flap=${flap}` : "";
  const stormSuffix = storm ? ", storm" : "";
  const leakSuffix = leak ? ", leak-test" : "";
  const travelSuffix = travel ? ", travel qua cổng" : "";
  const dieSuffix = die ? ", bot tự tử (--die)" : "";
  const accountSuffix = account ? ", tài khoản (--account)" : "";
  const dungeonSuffix = dungeon
    ? dungeonFall
      ? `, bí cảnh gục (--dungeon-fall=${dungeonFallRate})`
      : ", bí cảnh (--dungeon)"
    : "";
  const duelSuffix = duel ? ", thách đấu PK (--duel)" : "";
  const mapSuffix =
    currentMap.def.id !== DEFAULT_MAP.def.id ? `, bản đồ=${currentMap.def.name}` : "";
  const modeLabel =
    mode === "realistic"
      ? `Thực tế (vào tầm đứng chém${partySuffix}${shopSuffix}${flapSuffix}${stormSuffix}${leakSuffix}${travelSuffix}${dieSuffix}${accountSuffix}${dungeonSuffix}${duelSuffix}${mapSuffix})`
      : mode === "crowd"
        ? `Đông người trong trấn/khu an toàn (${shop ? "25% ghé Dược Sư, 25% đứng, 50% đi" : "30% đứng yên, 70% đi lại"}${flapSuffix}${stormSuffix}${leakSuffix}${travelSuffix}${dieSuffix}${accountSuffix}${dungeonSuffix}${duelSuffix}${mapSuffix})`
        : `Xấu nhất (100% di chuyển 20 input/s${partySuffix}${flapSuffix}${stormSuffix}${leakSuffix}${travelSuffix}${dieSuffix}${accountSuffix}${dungeonSuffix}${duelSuffix}${mapSuffix})`;
  console.log(
    `\n=== Bắt đầu thử tải [${modeLabel}]: ${botCount} bot, đo trong ${durationSec}s (${url}) ===`,
  );

  let useAccount = account;
  if (!useAccount) {
    try {
      const httpHealthUrl = url.replace(/^ws/, "http").replace(/\/$/, "");
      const res = await fetch(`${httpHealthUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const health = (await res.json()) as { authMode?: string };
        if (health.authMode === "account") {
          useAccount = true;
          console.log(
            "  [Tự động] Server chạy AUTH_MODE=account, tự động dùng xác thực tài khoản cho bot.",
          );
        }
      }
    } catch {
      // Bỏ qua nếu không kết nối được qua HTTP
    }
  }

  const bots: BotState[] = [];
  const createdBotNames = new Set<string>();
  const patchIntervals: number[] = [];
  const ackRtts: number[] = [];
  const serverTickCpuSamples: number[] = [];
  const monsterCounts: number[] = [];
  const visibleMonstersSamples: number[] = [];
  const visiblePlayersSamples: number[] = [];
  const unionMonstersSamples: number[] = [];
  const reconnectLatencies: number[] = [];
  const reconnectBytesList: number[] = [];
  const stormCpuSamples: number[] = [];
  let flapSuccessCount = 0;
  let flapFailCount = 0;
  let stormTriggered = false;
  let stormWindowStart = 0;
  let stormWindowEnd = 0;
  let stormReconnectedCount = 0;
  let stormTotalBytesReceived = 0;
  let leakWarmupRssMb: number | null = null;
  let leakEndOnline: number | undefined;
  let leakRssDeltaMb: number | undefined;

  let measuring = false;
  let attacksSent = 0;
  let skillsSent = 0;
  let inputsSent = 0;
  const rnd = seededPrng(1);

  const rndFlap = () =>
    (flapInterval[0] + Math.random() * (flapInterval[1] - flapInterval[0])) * 1000;

  for (let i = 1; i <= botCount; i++) {
    const numStr = String(i).padStart(3, "0");
    const name = `Bot ${numStr}`;
    createdBotNames.add(name);
    const secret = `bot_secret_tien_gioi_${numStr}_loadtest`;

    // Khởi tạo vị trí (campX, campY) rải đều khắp vùng hoang dã giống bench.ts trước khi joinOrCreate
    const realm = duel ? 1 : dungeon ? 1 : rnd() < 0.8 ? 1 : 2;
    const tier = duel ? 4 : dungeon ? 8 : Math.floor(rnd() * REALMS[realm].tiers.length);
    let campX = 0;
    let campY = 0;
    if (duel) {
      // Khi thử tải PK thách đấu: xếp theo cặp ngoài khu an toàn của trấn
      const pairIndex = Math.floor((i - 1) / 2);
      const totalPairs = Math.max(1, Math.ceil(botCount / 2));
      const pairAngle = (pairIndex / totalPairs) * Math.PI * 2;
      const distFromTown = currentMap.townPx.r + 120;
      const cx = currentMap.townPx.x + Math.cos(pairAngle) * distFromTown;
      const cy = currentMap.townPx.y + Math.sin(pairAngle) * distFromTown;
      const offset = (i - 1) % 2 === 0 ? -25 : 25;
      campX = cx + offset;
      campY = cy;
    } else if (dungeon) {
      // Khi thử tải bí cảnh: sinh bot quanh NPC Thủ Môn ở Lạc Hà Trấn
      const gate = NPC_BY_ID.thu_mon;
      campX = gate.x + (rnd() - 0.5) * 40;
      campY = gate.y + (rnd() - 0.5) * 40;
    } else if (travel) {
      // Khi thử tải qua cổng: sinh bot gần cổng (quanh toạ độ spawn của cổng) để bot đi bộ vào cổng
      const portal = currentMap.portals[0];
      if (portal) {
        let placed = false;
        for (let tries = 0; tries < 20; tries++) {
          const a = rnd() * Math.PI * 2;
          const dist = portal.r + 20 + rnd() * 40;
          const x = portal.x + Math.cos(a) * dist;
          const y = portal.y + Math.sin(a) * dist;
          if (!currentMap.circleBlocked(x, y, PLAYER_RADIUS)) {
            campX = x;
            campY = y;
            placed = true;
            break;
          }
        }
        if (!placed) {
          campX = portal.spawn.x;
          campY = portal.spawn.y;
        }
      } else {
        campX = currentMap.townPx.x;
        campY = currentMap.townPx.y;
      }
    } else if (mode === "crowd") {
      // Đông người tụ trong trấn/khu an toàn: rải bot hoàn toàn bên trong bán kính an toàn
      for (;;) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * (currentMap.townPx.r - 28);
        const x = currentMap.townPx.x + Math.cos(a) * r;
        const y = currentMap.townPx.y + Math.sin(a) * r;
        if (!currentMap.circleBlocked(x, y, PLAYER_RADIUS)) {
          campX = x;
          campY = y;
          break;
        }
      }
    } else {
      // Khởi tạo vị trí (campX, campY) rải đều khắp vùng hoang dã giống bench.ts trước khi joinOrCreate
      for (;;) {
        const a = rnd() * Math.PI * 2;
        const r =
          currentMap.townPx.r + 80 + rnd() * (currentMap.worldW * 0.45 - currentMap.townPx.r);
        const x = currentMap.townPx.x + Math.cos(a) * r;
        const y = currentMap.townPx.y + Math.sin(a) * r;
        if (!currentMap.circleBlocked(x, y, PLAYER_RADIUS) && currentMap.dangerAt(x, y) < 0.9) {
          campX = x;
          campY = y;
          break;
        }
      }
    }
    let joinOpts: JoinOptions | { token: string } = { name, secret };
    let botToken: string | undefined;
    if (useAccount) {
      const httpBase = url.replace(/^ws/, "http").replace(/\/$/, "");
      const authRes = await authBotAccount(httpBase, i, name);
      botToken = authRes.token;
      joinOpts = { token: botToken };
    } else {
      const lifeSeed = die ? { playMs: 48 * 60_000, kills: 30, bossKills: 0 } : undefined;
      seedBotSaveFile(
        name,
        secret,
        campX,
        campY,
        duel ? 1 : dungeon ? 1 : die ? 1 : realm,
        duel ? 4 : dungeon ? 8 : die ? 8 : tier,
        currentMap.def.id,
        lifeSeed,
      );
    }

    const client = new Client(url);
    const roomName = roomNameOf(currentMap.def.id);
    const room = await client.joinOrCreate(roomName, joinOpts);

    const radialAngle = ((i - 1) / botCount) * Math.PI * 2;
    const now = performance.now();

    const handleBotTravel = async (bot: BotState, msg: TravelToMsg) => {
      try {
        const nextMap = getMap(msg.mapId) ?? DEFAULT_MAP;
        const targetClient = new Client(url);
        const nextOpts = bot.token
          ? { token: bot.token }
          : {
              name: bot.name,
              secret: `bot_secret_tien_gioi_${String(bot.index).padStart(3, "0")}_loadtest`,
            };
        let nextRoom: Room;
        if (msg.roomId) {
          nextRoom = await targetClient.joinById(msg.roomId, nextOpts);
        } else {
          nextRoom = await targetClient.joinOrCreate(roomNameOf(nextMap.def.id), nextOpts);
        }
        bot.map = nextMap;
        bot.hasPos = false;
        bindRoomEvents(
          bot,
          nextRoom,
          () => measuring,
          patchIntervals,
          ackRtts,
          (tRecv, bytes) => {
            if (msg.roomId) {
              const lat = tRecv - bot.dungeonOpenSentAt;
              if (measuring && lat > 0) bot.dungeonOpenLatencies.push(lat);
            } else {
              const lat = tRecv - bot.travelSentAt;
              if (measuring) {
                bot.travelLatencies.push(lat);
                bot.travelInitialBytes.push(bytes);
                bot.travelCount++;
              }
              bot.nextDungeonOpenAt = performance.now() + DUNGEON_OPEN_COOLDOWN_MS + 1000;
            }
            bot.isTravelling = false;
            bot.nextTravelAt = performance.now() + TRAVEL_COOLDOWN_MS + 2000 + Math.random() * 2000;
          },
          (m) => void handleBotTravel(bot, m),
        );
      } catch (err) {
        console.error(`[${bot.name}] Lỗi chuyển phòng sang ${msg.mapId}:`, err);
        bot.isTravelling = false;
        bot.nextTravelAt = performance.now() + 4000;
      }
    };

    const b: BotState = {
      index: i,
      name,
      room,
      map: currentMap,
      seq: 0,
      predX: campX,
      predY: campY,
      hasPos: false,
      wanderAngle: radialAngle,
      campX,
      campY,
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
      partyMsgsCount: 0,
      partyBytes: 0,
      myParty: null,
      walletMsgsCount: 0,
      walletBytes: 0,
      coin: 100,
      invSlots: [],
      nextShopCheckAt: now + 3000 + Math.random() * 4000,
      shopping: false,
      kicked4429: false,
      closedCode: null,
      isFlapping: false,
      flapCount: 0,
      nextFlapAt: now + rndFlap(),
      reconnectAt: 0,
      reconnectToken: room.reconnectionToken,
      isTravelling: false,
      travelSentAt: 0,
      nextTravelAt: now + 2000 + Math.random() * 3000,
      travelCount: 0,
      travelLatencies: [],
      travelInitialBytes: [],
      die,
      diedAt: 0,
      deathsCount: 0,
      rebirthsCount: 0,
      rebirthSentAt: 0,
      soulBuysCount: 0,
      limboLatencies: [],
      rebirthLatencies: [],
      token: botToken,
      dungeon,
      dungeonOpenSentAt: 0,
      dungeonRunsCount: 0,
      dungeonRunsWon: 0,
      dungeonRunsLost: 0,
      dungeonOpenLatencies: [],
      dungeonLastEndAt: 0,
      nextDungeonOpenAt: now + 1500 + Math.random() * 2000,
      dungeonFall: dungeonFall && (dungeonFallRate >= 1 || Math.random() < dungeonFallRate),
      dungeonFallenCount: 0,
      dungeonFallExitCount: 0,
      dungeonNewLifesCount: 0,
      isFallenWaitingExit: false,
      duel,
      duelOpponentName: undefined,
      duelPhase: undefined,
      duelMatchesCount: 0,
      duelMatchesWon: 0,
      duelMatchesLost: 0,
      duelMatchesDraw: 0,
      duelLastEndAt: 0,
      nextDuelChallengeAt: now + 1500 + ((i - 1) % 2 === 0 ? 0 : 5000),
    };

    bindRoomEvents(
      b,
      room,
      () => measuring,
      patchIntervals,
      ackRtts,
      undefined,
      (msg) => void handleBotTravel(b, msg),
    );
    bots.push(b);
    await sleep(20);
  }

  if (partySize > 1 && bots.length >= 2) {
    console.log(
      `\n--- Khởi tạo tổ đội (nhóm ${partySize} người, chờ cooldown 3s giữa các lời mời) ---`,
    );
    for (let memberOffset = 1; memberOffset < partySize; memberOffset++) {
      for (let i = 0; i < bots.length; i += partySize) {
        const leader = bots[i];
        const target = bots[i + memberOffset];
        if (leader && target && !leader.closedCode && !target.closedCode) {
          leader.room.send("partyInvite", { name: target.name });
        }
      }
      if (memberOffset < partySize - 1) {
        await sleep(3200);
      } else {
        await sleep(400);
      }
    }
    console.log(`--- Đã hoàn tất lập đội cho ${bots.length} bot ---`);
  }

  console.log(`Đã kết nối ${bots.length}/${botCount} bot. Chờ ổn định 2 giây để ra bãi quái...`);

  const stepBot = (b: BotState, now: number) => {
    if (!b.room.connection.isOpen) return;
    const state = b.room.state as any;
    const me = state?.players?.get(b.room.sessionId);
    if (!me) return;
    if (me.dead || b.rebirthSentAt > 0) {
      if (b.diedAt === 0 && b.rebirthSentAt === 0) b.diedAt = now;
      return;
    }

    b.predX = me.x;
    b.predY = me.y;

    let dx: number;
    let dy: number;

    if (die) {
      // Kịch bản thử tải luân hồi / chết hàng loạt (#151)
      // Bot tìm quái gần nhất và lao thẳng vào quái, KHÔNG đánh trả, đứng chịu đòn cho tới khi chết
      let targetMon: any = null;
      let bestDist = Number.POSITIVE_INFINITY;
      if (state?.monsters && typeof state.monsters.forEach === "function") {
        state.monsters.forEach((m: any) => {
          if (!m || m.hp <= 0) return;
          const d = Math.hypot(m.x - b.predX, m.y - b.predY);
          if (d < bestDist) {
            bestDist = d;
            targetMon = m;
          }
        });
      }
      if (targetMon) {
        const dist = Math.hypot(targetMon.x - b.predX, targetMon.y - b.predY);
        const a = Math.atan2(targetMon.y - b.predY, targetMon.x - b.predX);
        if (dist > 15) {
          dx = Math.cos(a);
          dy = Math.sin(a);
        } else {
          dx = 0;
          dy = 0;
        }
      } else {
        // Chưa thấy quái: đi ra xa trấn về phía bãi quái
        const a = Math.atan2(b.predY - b.map.townPx.y, b.predX - b.map.townPx.x);
        dx = Math.cos(a);
        dy = Math.sin(a);
      }
    } else if (dungeon) {
      // Kịch bản thử tải bí cảnh (--dungeon, #201)
      const inDungeon = isDungeonMap(b.map.def.id);
      if (inDungeon) {
        // Đang trong phòng bí cảnh:
        if (b.dungeonLastEndAt > 0 && now - b.dungeonLastEndAt > 2000) {
          // Run đã kết thúc: rời bí cảnh về Lạc Hà
          b.room.send(DUNGEON_MSG.leave, {});
          b.dungeonLastEndAt = 0;
          dx = 0;
          dy = 0;
        } else {
          // Tìm trùm tại hang trùm lairPx hoặc quái gần nhất
          const lair = b.map.lairPx ?? { x: 32 * 32 + 16, y: 9 * 32 + 16, r: 60 };
          let targetMon: any = null;
          let bestDist = Number.POSITIVE_INFINITY;
          if (state?.monsters && typeof state.monsters.forEach === "function") {
            state.monsters.forEach((m: any) => {
              if (!m || m.hp <= 0) return;
              const d = Math.hypot(m.x - b.predX, m.y - b.predY);
              if (d < bestDist) {
                bestDist = d;
                targetMon = m;
              }
            });
          }

          if (b.isFallenWaitingExit) {
            // Đã gục: đứng yên chờ server đưa về Lạc Hà
            dx = 0;
            dy = 0;
          } else if (b.dungeonFall) {
            // Bot cố ý gục: áp sát quái / hang trùm để quái đánh nhưng KHÔNG phản kháng
            if (targetMon) {
              const dist = Math.hypot(targetMon.x - b.predX, targetMon.y - b.predY);
              if (dist > 30) {
                const angle = Math.atan2(targetMon.y - b.predY, targetMon.x - b.predX);
                dx = Math.cos(angle);
                dy = Math.sin(angle);
              } else {
                dx = 0;
                dy = 0;
              }
            } else {
              const distToLair = Math.hypot(lair.x - b.predX, lair.y - b.predY);
              if (distToLair > 20) {
                const a = Math.atan2(lair.y - b.predY, lair.x - b.predX);
                dx = Math.cos(a);
                dy = Math.sin(a);
              } else {
                dx = 0;
                dy = 0;
              }
            }
          } else if (targetMon) {
            const dist = Math.hypot(targetMon.x - b.predX, targetMon.y - b.predY);
            const angle = Math.atan2(targetMon.y - b.predY, targetMon.x - b.predX);
            if (dist > SKILLS.slash.range) {
              dx = Math.cos(angle);
              dy = Math.sin(angle);
            } else {
              dx = 0;
              dy = 0;
            }
            if (dist <= SKILLS.slash.range && now >= b.nextSlashAt) {
              b.room.send("attack", { angle });
              b.nextSlashAt = now + SKILLS.slash.cooldown + 60;
              if (measuring) attacksSent++;
            }
            if (dist <= SKILLS.sword.range && me.mp >= SKILLS.sword.mp && now >= b.nextSwordAt) {
              b.room.send("skill", { id: "sword", angle });
              b.nextSwordAt = now + SKILLS.sword.cooldown + 100;
              if (measuring) skillsSent++;
            }
          } else {
            // Chưa thấy quái: đi về phía hang trùm
            const distToLair = Math.hypot(lair.x - b.predX, lair.y - b.predY);
            if (distToLair > lair.r - 20) {
              const a = Math.atan2(lair.y - b.predY, lair.x - b.predX);
              dx = Math.cos(a);
              dy = Math.sin(a);
            } else {
              dx = 0;
              dy = 0;
            }
          }
        }
      } else {
        // Đang ở Lạc Hà Trấn:
        const gate = NPC_BY_ID.thu_mon;
        const isLeader = b.myParty ? b.myParty.leader === b.name : (b.index - 1) % partySize === 0;
        const distToGate = Math.hypot(gate.x - b.predX, gate.y - b.predY);

        if (isLeader) {
          if (distToGate > 50) {
            const a = Math.atan2(gate.y - b.predY, gate.x - b.predX);
            dx = Math.cos(a);
            dy = Math.sin(a);
          } else {
            dx = 0;
            dy = 0;
            if (now >= b.nextDungeonOpenAt) {
              b.dungeonOpenSentAt = performance.now();
              b.room.send(DUNGEON_MSG.open, { dungeonId: LINH_HU_ID });
              b.nextDungeonOpenAt = now + DUNGEON_OPEN_COOLDOWN_MS + 2000;
              if (measuring) b.dungeonRunsCount++;
            }
          }
        } else {
          // Thành viên: đứng quanh Thủ Môn chờ lời mời
          if (distToGate > 80) {
            const a = Math.atan2(gate.y - b.predY, gate.x - b.predX);
            dx = Math.cos(a);
            dy = Math.sin(a);
          } else {
            dx = 0;
            dy = 0;
          }
        }
      }
    } else if (duel) {
      // Kịch bản thử tải PK thách đấu (--duel, #219)
      const oppIndex = (b.index - 1) % 2 === 0 ? b.index + 1 : b.index - 1;
      const oppName = b.duelOpponentName ?? `Bot ${String(oppIndex).padStart(3, "0")}`;
      let oppPlayer: any = null;
      if (state?.players && typeof state.players.forEach === "function") {
        state.players.forEach((p: any) => {
          if (p && p.name && p.name.toLowerCase() === oppName.toLowerCase()) {
            oppPlayer = p;
          }
        });
      }

      if (b.duelPhase === "fight") {
        if (oppPlayer && !oppPlayer.dead) {
          // Người KHÁC chỉ có vị trí công khai `px`, `py` (`x`, `y` chỉ gửi cho chủ)
          const dist = Math.hypot(oppPlayer.px - b.predX, oppPlayer.py - b.predY);
          const angle = Math.atan2(oppPlayer.py - b.predY, oppPlayer.px - b.predX);
          if (dist > SKILLS.slash.range) {
            dx = Math.cos(angle);
            dy = Math.sin(angle);
          } else {
            dx = 0;
            dy = 0;
          }
          if (dist <= SKILLS.slash.range + 20 && now >= b.nextSlashAt) {
            b.room.send("attack", { angle });
            b.nextSlashAt = now + SKILLS.slash.cooldown + 50;
            if (measuring) attacksSent++;
          }
        } else {
          dx = 0;
          dy = 0;
        }
      } else if (b.duelPhase === "countdown") {
        dx = 0;
        dy = 0;
      } else {
        // Chưa trong trận. Server KHÔNG áp vị trí lưu trong file: bot luôn vào từ trấn (khu an toàn, không được thách đấu),
        // nên trước hết đi tới điểm cắm trại của cặp (ngoài khu an toàn) rồi mới thách.
        const distToCamp = Math.hypot(b.campX - b.predX, b.campY - b.predY);
        const outside = !b.map.inSafe(b.predX, b.predY);
        if (distToCamp > 12 || !outside) {
          const a = Math.atan2(b.campY - b.predY, b.campX - b.predX);
          dx = Math.cos(a);
          dy = Math.sin(a);
        } else {
          dx = 0;
          dy = 0;
          // Bên thách = bot lẻ (1-based: 1, 3, 5...); chỉ thách khi cả hai đã ở ngoài khu an toàn và trong tầm
          const isChallenger = (b.index - 1) % 2 === 0;
          if (isChallenger && oppPlayer && !oppPlayer.dead && !oppPlayer.duel) {
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
      }
    } else {
      if (
        shop &&
        mode === "realistic" &&
        !b.shopping &&
        now >= b.nextShopCheckAt &&
        b.index % 5 === 0 &&
        (b.invSlots.some((s) => s && sellPrice(s.itemId) > 0) ||
          b.coin >= buyPrice("hoi_huyet_dan"))
      ) {
        b.shopping = true;
      }
      if (!b.shopping && now >= b.nextShopCheckAt) {
        b.nextShopCheckAt = now + 6000 + Math.random() * 4000;
      }

      if (travel) {
        // Kịch bản thử tải qua cổng liên tục giữa các bản đồ (#141)
        if (b.isTravelling) {
          dx = 0;
          dy = 0;
        } else if (now < b.avoidUntil) {
          // Đang né vật cản (cây/đá quanh lối vào cổng): đi theo góc né
          dx = Math.cos(b.wanderAngle);
          dy = Math.sin(b.wanderAngle);
        } else {
          const portal = b.map.portals[0];
          if (portal) {
            const dist = Math.hypot(portal.x - b.predX, portal.y - b.predY);
            if (dist > portal.r - 12) {
              const a = Math.atan2(portal.y - b.predY, portal.x - b.predX);
              dx = Math.cos(a);
              dy = Math.sin(a);
            } else {
              dx = 0;
              dy = 0;
              if (now >= b.nextTravelAt) {
                b.isTravelling = true;
                b.travelSentAt = performance.now();
                b.room.send("travel", { portalId: portal.id } satisfies TravelMsg);
              }
            }
          } else {
            dx = 0;
            dy = 0;
          }
        }
      } else if (mode === "crowd") {
        // Kịch bản đông người tụ trong trấn (#78 & #80):
        // Khi có cờ --shop (#102): ~25% bot định kỳ ghé Lão Dược Sư mua/bán (phát sinh tin wallet), ~25% đứng yên, 50% đi lại.
        // Khi không có --shop (mặc định): 30% đứng yên (b.index % 3 === 0), 70% đi lại ngẫu nhiên trong trấn.
        const duoc = NPC_BY_ID.duoc_su;
        const distToDuoc = Math.hypot(duoc.x - b.predX, duoc.y - b.predY);
        if (shop && b.index % 4 === 0 && now >= b.nextShopCheckAt) {
          if (distToDuoc > NPC_RANGE - 20) {
            const a = Math.atan2(duoc.y - b.predY, duoc.x - b.predX);
            dx = Math.cos(a);
            dy = Math.sin(a);
          } else {
            dx = 0;
            dy = 0;
            for (let slot = 0; slot < b.invSlots.length; slot++) {
              const it = b.invSlots[slot];
              if (it && sellPrice(it.itemId) > 0) {
                const msg: SellMsg = { npcId: "duoc_su", slot, qty: it.qty };
                b.room.send("sell", msg);
              }
            }
            if (b.coin >= buyPrice("hoi_huyet_dan")) {
              const msg: BuyMsg = { npcId: "duoc_su", itemId: "hoi_huyet_dan", qty: 1 };
              b.room.send("buy", msg);
            }
            b.nextShopCheckAt = now + 6000 + Math.random() * 4000;
          }
        } else if (b.index % 3 === 0) {
          dx = 0;
          dy = 0;
        } else {
          const distFromCenter = Math.hypot(b.predX - b.map.townPx.x, b.predY - b.map.townPx.y);
          if (distFromCenter > b.map.townPx.r - 28) {
            b.wanderAngle =
              Math.atan2(b.map.townPx.y - b.predY, b.map.townPx.x - b.predX) +
              (Math.random() - 0.5) * 0.4;
            b.nextTurnAt = now + 1500;
          } else if (now >= b.nextTurnAt) {
            b.wanderAngle += (Math.random() - 0.5) * Math.PI;
            b.nextTurnAt = now + 1500 + Math.random() * 2000;
          }
          dx = Math.cos(b.wanderAngle);
          dy = Math.sin(b.wanderAngle);
        }
      } else if (now < b.avoidUntil) {
        // Đang vòng qua vật cản (cây/nước)
        dx = Math.cos(b.wanderAngle);
        dy = Math.sin(b.wanderAngle);
      } else if (shop && b.shopping) {
        // Đang trên đường về Lão Dược Sư trong trấn để mua/bán (chỉ khi có cờ --shop) (#102)
        const duoc = NPC_BY_ID.duoc_su;
        const distToDuoc = Math.hypot(duoc.x - b.predX, duoc.y - b.predY);
        if (distToDuoc > NPC_RANGE - 20) {
          const a = Math.atan2(duoc.y - b.predY, duoc.x - b.predX);
          dx = Math.cos(a);
          dy = Math.sin(a);
        } else {
          dx = 0;
          dy = 0;
          for (let slot = 0; slot < b.invSlots.length; slot++) {
            const it = b.invSlots[slot];
            if (it && sellPrice(it.itemId) > 0) {
              const msg: SellMsg = { npcId: "duoc_su", slot, qty: it.qty };
              b.room.send("sell", msg);
            }
          }
          if (b.coin >= buyPrice("hoi_huyet_dan")) {
            const msg: BuyMsg = { npcId: "duoc_su", itemId: "hoi_huyet_dan", qty: 1 };
            b.room.send("buy", msg);
          }
          b.shopping = false;
          b.nextShopCheckAt = now + 12000 + Math.random() * 8000;
        }
      } else if (b.map.inTown(b.predX, b.predY)) {
        dx = Math.cos(b.wanderAngle);
        dy = Math.sin(b.wanderAngle);
      } else if (partySize > 1 && b.myParty && b.myParty.leader && b.myParty.leader !== b.name) {
        // Thành viên trong tổ đội: bám theo đội trưởng trong tầm 300 px (#76)
        const leaderMember = b.myParty.members.find((m) => m.name === b.myParty!.leader);
        if (leaderMember) {
          const distToLeader = Math.hypot(leaderMember.x - b.predX, leaderMember.y - b.predY);
          if (distToLeader > 250) {
            const a = Math.atan2(leaderMember.y - b.predY, leaderMember.x - b.predX);
            dx = Math.cos(a);
            dy = Math.sin(a);
          } else {
            // Trong tầm đội trưởng (< 250 px): cùng đánh quái gần nhất quanh đội trưởng
            let targetMon: any = null;
            let bestDist = Number.POSITIVE_INFINITY;
            if (state?.monsters && typeof state.monsters.forEach === "function") {
              state.monsters.forEach((m: any) => {
                if (!m || m.hp <= 0) return;
                const d = Math.hypot(m.x - b.predX, m.y - b.predY);
                if (d > 300) return;
                if (d < bestDist) {
                  bestDist = d;
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
              } else {
                dx = 0;
                dy = 0;
              }
              if (dist <= SKILLS.slash.range && now >= b.nextSlashAt) {
                b.room.send("attack", { angle });
                b.nextSlashAt = now + SKILLS.slash.cooldown + 60;
                if (measuring) attacksSent++;
              }
            } else {
              dx = 0;
              dy = 0;
            }
          }
        } else {
          dx = 0;
          dy = 0;
        }
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
          // Kịch bản xấu nhất: bot tuần tra liên tục quanh khu bãi săn (campX, campY) của mình (20 input/s),
          // giữ phân bố rải đều khắp vùng hoang dã thay vì dồn hết về quanh trấn.
          const distToCamp = Math.hypot(b.predX - b.campX, b.predY - b.campY);
          const distFromTown = Math.hypot(b.predX - b.map.townPx.x, b.predY - b.map.townPx.y);
          if (distFromTown < b.map.townPx.r + 60) {
            b.wanderAngle = Math.atan2(b.predY - b.map.townPx.y, b.predX - b.map.townPx.x);
            b.nextTurnAt = now + 2000;
          } else if (distToCamp > 260) {
            b.wanderAngle = Math.atan2(b.campY - b.predY, b.campX - b.predX);
            b.nextTurnAt = now + 2000;
          } else if (now >= b.nextTurnAt) {
            b.wanderAngle += (Math.random() - 0.5) * Math.PI;
            b.nextTurnAt = now + 2000 + Math.random() * 2000;
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
    }

    const len = Math.hypot(dx, dy);
    if (len > 0.05) {
      dx /= len;
      dy /= len;
      const stepPx = statsFor(me.realm ?? 0, me.tier ?? 0).speed * (TICK_MS / 1000);
      const moved = b.map.moveWithCollision(
        b.predX,
        b.predY,
        dx * stepPx,
        dy * stepPx,
        PLAYER_RADIUS,
      );
      if (
        Math.hypot(moved.x - b.predX, moved.y - b.predY) < stepPx * 0.2 ||
        moved.x < 64 ||
        moved.x > b.map.worldW - 64 ||
        moved.y < 64 ||
        moved.y > b.map.worldH - 64
      ) {
        b.wanderAngle = Math.atan2(dy, dx) + (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.45);
        b.avoidUntil = now + 800;
        // Nếu đang đứng ở bãi săn mà vướng cây thì nhận luôn vị trí hiện tại làm bãi săn
        if (!b.map.inTown(b.predX, b.predY)) {
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

    // 1. Kích hoạt bão nối lại (--storm) ở giây thứ 15
    if (storm && measuring && !stormTriggered && now - measureStart >= 15000) {
      stormTriggered = true;
      stormWindowStart = now;
      stormWindowEnd = now + 5000;
      console.log(
        `\n>>> [BÃO NỐI LẠI --storm] Tất cả ${bots.length} bot rớt mạng cùng lúc! Nối lại rải rác trong 2s...`,
      );
      for (const b of bots) {
        if (!b.isFlapping && b.room.connection.isOpen) {
          b.isFlapping = true;
          b.reconnectToken = b.room.reconnectionToken;
          const ws = (b.room.connection as any)?.transport?.ws;
          try {
            ws?.close();
          } catch {
            // Bỏ qua lỗi nếu ws đã đóng
          }
          b.reconnectAt = now + Math.random() * 2000;
        }
      }
    }

    // 2. Chạy bot logic cho từng bot
    for (const b of bots) {
      if (!b.isFlapping) {
        stepBot(b, now);

        if (
          measuring &&
          flap > 0 &&
          !storm &&
          b.flapCount < flap &&
          now >= b.nextFlapAt &&
          b.room.connection.isOpen
        ) {
          b.isFlapping = true;
          b.flapCount++;
          b.reconnectToken = b.room.reconnectionToken;
          const ws = (b.room.connection as any)?.transport?.ws;
          try {
            ws?.close();
          } catch {
            // Bỏ qua lỗi nếu ws đã đóng
          }
          const delay = (flapDelay[0] + Math.random() * (flapDelay[1] - flapDelay[0])) * 1000;
          b.reconnectAt = now + delay;
        }
      } else if (b.reconnectAt > 0 && now >= b.reconnectAt) {
        b.reconnectAt = -1; // đang thực hiện reconnect
        (async () => {
          const t0 = performance.now();
          try {
            const client = new Client(url);
            const newRoom = await client.reconnect(b.reconnectToken);
            let firstStateBytes = 0;
            let latencyMs = 0;

            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, 3500);
              bindRoomEvents(
                b,
                newRoom,
                () => measuring,
                patchIntervals,
                ackRtts,
                (tRecv, bytes) => {
                  latencyMs = tRecv - t0;
                  firstStateBytes = bytes;
                  clearTimeout(timer);
                  resolve();
                },
              );
            });

            const finalLatency = latencyMs > 0 ? latencyMs : performance.now() - t0;
            const finalBytes = firstStateBytes;

            flapSuccessCount++;
            reconnectLatencies.push(finalLatency);
            reconnectBytesList.push(finalBytes);

            if (stormTriggered) {
              stormReconnectedCount++;
              stormTotalBytesReceived += finalBytes;
            }

            b.isFlapping = false;
            b.nextFlapAt = performance.now() + rndFlap();
          } catch {
            flapFailCount++;
            b.isFlapping = false;
            b.closedCode = 1006;
          }
        })();
      }
    }

    if (measuring) {
      const mSize = (bots[0]?.room.state as any)?.monsters?.size;
      if (typeof mSize === "number") monsterCounts.push(mSize);

      let sumMon = 0;
      let sumPlr = 0;
      let validBots = 0;
      const unionIds = new Set<string>();
      for (const b of bots) {
        const st = b.room.state as any;
        const mMap = st?.monsters;
        const pMap = st?.players;
        if (typeof mMap?.size === "number") {
          sumMon += mMap.size;
          validBots++;
          if (typeof mMap.forEach === "function") {
            mMap.forEach((_: unknown, id: string) => unionIds.add(id));
          }
        }
        if (typeof pMap?.size === "number") {
          sumPlr += pMap.size;
        }
      }
      if (validBots > 0) {
        visibleMonstersSamples.push(sumMon / validBots);
        visiblePlayersSamples.push(sumPlr / validBots);
        unionMonstersSamples.push(unionIds.size);
      }
    }

    if (measuring && serverPid) {
      const curCpuMs = readServerExecRuntimeMs(serverPid);
      if (curCpuMs !== null && prevServerCpuMs !== null) {
        const deltaCpuMs = Math.max(0, curCpuMs - prevServerCpuMs);
        serverTickCpuSamples.push(deltaCpuMs);
        if (stormTriggered && now >= stormWindowStart && now <= stormWindowEnd) {
          stormCpuSamples.push(deltaCpuMs);
        }
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
    b.partyMsgsCount = 0;
    b.partyBytes = 0;
    b.walletMsgsCount = 0;
    b.walletBytes = 0;
    b.lastPatchAt = performance.now();
  }
  patchIntervals.length = 0;
  ackRtts.length = 0;
  serverTickCpuSamples.length = 0;
  monsterCounts.length = 0;
  visibleMonstersSamples.length = 0;
  visiblePlayersSamples.length = 0;
  unionMonstersSamples.length = 0;
  attacksSent = 0;
  skillsSent = 0;
  inputsSent = 0;

  const cpuStartMs = serverPid ? readServerExecRuntimeMs(serverPid) : null;
  const measureStart = performance.now();
  measuring = true;

  if (leak && serverPid) {
    leakWarmupRssMb = readServerRssMb(serverPid);
    console.log(`- Làm nóng xong. VmRSS server ban đầu: ${leakWarmupRssMb} MB`);
  }

  await sleep(durationSec * 1000);

  measuring = false;
  const actualDurationSec = (performance.now() - measureStart) / 1000;
  const cpuEndMs = serverPid ? readServerExecRuntimeMs(serverPid) : null;
  const serverRssMb = serverPid ? readServerRssMb(serverPid) : null;

  if (leak) {
    console.log(`\n=== Kiểm tra rò rỉ (Leak test): dừng flap, đợi tất cả bot hoàn tất nối lại ===`);
    // Tắt flap để không kích hoạt flap mới
    flap = 0;
    // Đợi các bot đang flap dở nối lại xong
    const waitStart = performance.now();
    while (performance.now() - waitStart < 8000) {
      const pendingFlaps = bots.filter((b) => b.isFlapping).length;
      if (pendingFlaps === 0) break;
      await sleep(200);
    }

    const half = Math.floor(bots.length / 2);
    console.log(
      `Tất cả bot đã online (${bots.filter((b) => b.room.connection.isOpen).length}/${bots.length}). Cho ${half} bot rớt hẳn không nối lại...`,
    );
    for (let i = 0; i < half; i++) {
      const b = bots[i];
      b.isFlapping = true;
      b.reconnectAt = -1;
      const ws = (b.room.connection as any)?.transport?.ws;
      try {
        ws?.close();
      } catch {
        // Bỏ qua lỗi nếu ws đã đóng
      }
    }
    console.log(`Đang đợi 25s để server hết hạn 20s grace period và dọn sạch ${half} ghost...`);
    await sleep(25000);

    const aliveBots = bots.filter((b) => b.room.connection.isOpen && !b.isFlapping);
    const aliveBot = aliveBots[0];
    if (aliveBot) {
      leakEndOnline =
        (aliveBot.room.state as any)?.online ?? (aliveBot.room.state as any)?.players?.size;
    }
    const finalRssMb = serverPid ? readServerRssMb(serverPid) : null;
    if (finalRssMb !== null && leakWarmupRssMb !== null) {
      leakRssDeltaMb = Number((finalRssMb - leakWarmupRssMb).toFixed(2));
    }
    console.log(
      `- Kết quả đo rò rỉ: state.online = ${leakEndOnline} (kỳ vọng: ${bots.length - half}) | VmRSS: ${finalRssMb} MB (tăng ${leakRssDeltaMb} MB so với sau làm nóng ${leakWarmupRssMb} MB)`,
    );
  }

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
    const removed = cleanCreatedBotSaves(createdBotNames);
    console.log(
      `Đã dọn ${removed}/${createdBotNames.size} file lưu của đợt bot vừa chạy trong ${DATA_PLAYERS_DIR}.`,
    );
  }

  patchIntervals.sort((a, b) => a - b);
  ackRtts.sort((a, b) => a - b);
  serverTickCpuSamples.sort((a, b) => a - b);

  const totalRxBytes = bots.reduce((s, b) => s + b.rxBytes, 0);
  const totalRxPatchBytes = bots.reduce((s, b) => s + b.rxPatchBytes, 0);
  const totalRxEventBytes = Math.max(0, totalRxBytes - totalRxPatchBytes);
  const totalTxBytes = bots.reduce((s, b) => s + b.txBytes, 0);
  const totalRxMsgs = bots.reduce((s, b) => s + b.rxMsgs, 0);
  const totalTxMsgs = bots.reduce((s, b) => s + b.txMsgs, 0);
  const totalFxEvents = bots.reduce((s, b) => s + b.fxCount, 0);
  const totalDmgEvents = bots.reduce((s, b) => s + b.dmgCount, 0);
  const totalPartyMsgs = bots.reduce((s, b) => s + b.partyMsgsCount, 0);
  const totalPartyBytes = bots.reduce((s, b) => s + b.partyBytes, 0);
  const totalWalletMsgs = bots.reduce((s, b) => s + b.walletMsgsCount, 0);
  const totalWalletBytes = bots.reduce((s, b) => s + b.walletBytes, 0);

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
  const visibleMonstersAvg =
    visibleMonstersSamples.length > 0
      ? Number(avg(visibleMonstersSamples).toFixed(1))
      : monstersAvg;
  const visiblePlayersAvg =
    visiblePlayersSamples.length > 0 ? Number(avg(visiblePlayersSamples).toFixed(1)) : botCount;
  const unionMonstersAvg =
    unionMonstersSamples.length > 0 ? Math.round(avg(unionMonstersSamples)) : monstersAvg;
  const serverMonstersTotal = runBench(botCount, 1).monsters;

  reconnectLatencies.sort((a, b) => a - b);
  stormCpuSamples.sort((a, b) => a - b);

  const reconnectLatencyAvgMs =
    reconnectLatencies.length > 0 ? Number(avg(reconnectLatencies).toFixed(2)) : undefined;
  const reconnectLatencyP50Ms =
    reconnectLatencies.length > 0
      ? Number(percentile(reconnectLatencies, 50).toFixed(2))
      : undefined;
  const reconnectLatencyP95Ms =
    reconnectLatencies.length > 0
      ? Number(percentile(reconnectLatencies, 95).toFixed(2))
      : undefined;
  const reconnectBytesAvg =
    reconnectBytesList.length > 0 ? Math.round(avg(reconnectBytesList)) : undefined;

  const stormCpuTickMax =
    stormCpuSamples.length > 0 ? Number(stormCpuSamples.at(-1)!.toFixed(2)) : undefined;
  const stormCpuTickP95 =
    stormCpuSamples.length > 0 ? Number(percentile(stormCpuSamples, 95).toFixed(2)) : undefined;

  const allTravelLatencies = bots.flatMap((b) => b.travelLatencies).sort((a, b) => a - b);
  const allTravelBytes = bots.flatMap((b) => b.travelInitialBytes);
  const totalTravelCount = bots.reduce((s, b) => s + b.travelCount, 0);

  const travelLatencyAvgMs =
    allTravelLatencies.length > 0 ? Number(avg(allTravelLatencies).toFixed(2)) : undefined;
  const travelLatencyP50Ms =
    allTravelLatencies.length > 0
      ? Number(percentile(allTravelLatencies, 50).toFixed(2))
      : undefined;
  const travelLatencyP95Ms =
    allTravelLatencies.length > 0
      ? Number(percentile(allTravelLatencies, 95).toFixed(2))
      : undefined;
  const travelInitialBytesAvg =
    allTravelBytes.length > 0 ? Math.round(avg(allTravelBytes)) : undefined;

  const allLimboLatencies = bots.flatMap((b) => b.limboLatencies).sort((a, b) => a - b);
  const allRebirthLatencies = bots.flatMap((b) => b.rebirthLatencies).sort((a, b) => a - b);
  const totalDeaths = bots.reduce((s, b) => s + b.deathsCount, 0);
  const totalRebirths = bots.reduce((s, b) => s + b.rebirthsCount, 0);
  const totalSoulBuys = bots.reduce((s, b) => s + b.soulBuysCount, 0);
  const limboLatencyAvgMs =
    allLimboLatencies.length > 0 ? Number(avg(allLimboLatencies).toFixed(2)) : undefined;
  const limboLatencyP50Ms =
    allLimboLatencies.length > 0 ? Number(percentile(allLimboLatencies, 50).toFixed(2)) : undefined;
  const limboLatencyP95Ms =
    allLimboLatencies.length > 0 ? Number(percentile(allLimboLatencies, 95).toFixed(2)) : undefined;
  const rebirthLatencyAvgMs =
    allRebirthLatencies.length > 0 ? Number(avg(allRebirthLatencies).toFixed(2)) : undefined;
  const rebirthLatencyP50Ms =
    allRebirthLatencies.length > 0
      ? Number(percentile(allRebirthLatencies, 50).toFixed(2))
      : undefined;
  const rebirthLatencyP95Ms =
    allRebirthLatencies.length > 0
      ? Number(percentile(allRebirthLatencies, 95).toFixed(2))
      : undefined;

  const allDungeonOpenLatencies = bots.flatMap((b) => b.dungeonOpenLatencies).sort((a, b) => a - b);
  const totalDungeonRuns = bots.reduce((s, b) => s + b.dungeonRunsCount, 0);
  const totalDungeonWins = bots.reduce((s, b) => s + b.dungeonRunsWon, 0);
  const totalDungeonLosses = bots.reduce((s, b) => s + b.dungeonRunsLost, 0);
  const totalDungeonFallen = bots.reduce((s, b) => s + b.dungeonFallenCount, 0);
  const totalDungeonFallExits = bots.reduce((s, b) => s + b.dungeonFallExitCount, 0);
  const totalDungeonNewLifes = bots.reduce((s, b) => s + b.dungeonNewLifesCount, 0);

  const dungeonOpenLatencyAvgMs =
    allDungeonOpenLatencies.length > 0
      ? Number(avg(allDungeonOpenLatencies).toFixed(2))
      : undefined;
  const dungeonOpenLatencyP50Ms =
    allDungeonOpenLatencies.length > 0
      ? Number(percentile(allDungeonOpenLatencies, 50).toFixed(2))
      : undefined;
  const dungeonOpenLatencyP95Ms =
    allDungeonOpenLatencies.length > 0
      ? Number(percentile(allDungeonOpenLatencies, 95).toFixed(2))
      : undefined;

  const totalDuelMatches = bots.reduce((s, b) => s + b.duelMatchesCount, 0);
  const totalDuelWins = bots.reduce((s, b) => s + b.duelMatchesWon, 0);
  const totalDuelLosses = bots.reduce((s, b) => s + b.duelMatchesLost, 0);
  const totalDuelDraws = bots.reduce((s, b) => s + b.duelMatchesDraw, 0);

  const metrics: LoadTestMetrics = {
    commit,
    note,
    map: currentMap.def.id,
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
    rxEventKBpsPerBot: Number((totalRxEventBytes / botCount / actualDurationSec / 1024).toFixed(2)),
    txKBpsPerBot: Number((totalTxBytes / botCount / actualDurationSec / 1024).toFixed(2)),
    rxMsgsPerSecPerBot: Number((totalRxMsgs / botCount / actualDurationSec).toFixed(1)),
    txMsgsPerSecPerBot: Number((totalTxMsgs / botCount / actualDurationSec).toFixed(1)),
    totalRxKBps: Number((totalRxBytes / actualDurationSec / 1024).toFixed(1)),
    totalTxKBps: Number((totalTxBytes / actualDurationSec / 1024).toFixed(1)),
    monstersStart,
    monstersAvg,
    monstersMin,
    monstersEnd,
    visibleMonstersAvg,
    visiblePlayersAvg,
    serverMonstersTotal,
    unionMonstersAvg,
    attacksSent,
    skillsSent,
    inputsSent,
    fxEventsReceivedPerBot: Number((totalFxEvents / botCount / actualDurationSec).toFixed(1)),
    dmgEventsReceivedPerBot: Number((totalDmgEvents / botCount / actualDurationSec).toFixed(1)),
    partySize: partySize > 1 ? partySize : undefined,
    shop: shop ? true : undefined,
    partyEventsReceivedPerBot: Number((totalPartyMsgs / botCount / actualDurationSec).toFixed(1)),
    rxPartyKBpsPerBot: Number((totalPartyBytes / botCount / actualDurationSec / 1024).toFixed(2)),
    walletEventsReceivedPerBot: Number((totalWalletMsgs / botCount / actualDurationSec).toFixed(2)),
    rxWalletKBpsPerBot: Number((totalWalletBytes / botCount / actualDurationSec / 1024).toFixed(3)),
    flapTarget: flap > 0 ? flap : undefined,
    flapSuccess: flap > 0 || storm ? flapSuccessCount : undefined,
    flapFail: flap > 0 || storm ? flapFailCount : undefined,
    reconnectLatencyAvgMs,
    reconnectLatencyP50Ms,
    reconnectLatencyP95Ms,
    reconnectBytesAvg,
    storm: storm ? true : undefined,
    stormCpuTickMax,
    stormCpuTickP95,
    stormReconnected: storm ? stormReconnectedCount : undefined,
    stormTotalBytes: storm ? stormTotalBytesReceived : undefined,
    leakTested: leak ? true : undefined,
    leakEndOnline,
    leakRssDeltaMb,
    travel: travel ? true : undefined,
    travelCount: travel || totalTravelCount > 0 ? totalTravelCount : undefined,
    travelLatencyAvgMs,
    travelLatencyP50Ms,
    travelLatencyP95Ms,
    travelInitialBytesAvg,
    die: die ? true : undefined,
    deathsTotal: die || totalDeaths > 0 ? totalDeaths : undefined,
    rebirthsTotal: die || totalRebirths > 0 ? totalRebirths : undefined,
    soulBuysTotal: die || totalSoulBuys > 0 ? totalSoulBuys : undefined,
    limboLatencyAvgMs,
    limboLatencyP50Ms,
    limboLatencyP95Ms,
    rebirthLatencyAvgMs,
    rebirthLatencyP50Ms,
    rebirthLatencyP95Ms,
    dungeon: dungeon ? true : undefined,
    dungeonRunsTotal: dungeon || totalDungeonRuns > 0 ? totalDungeonRuns : undefined,
    dungeonRunsWon: dungeon || totalDungeonWins > 0 ? totalDungeonWins : undefined,
    dungeonRunsLost: dungeon || totalDungeonLosses > 0 ? totalDungeonLosses : undefined,
    dungeonOpenLatencyAvgMs,
    dungeonOpenLatencyP50Ms,
    dungeonOpenLatencyP95Ms,
    dungeonFall: dungeonFall ? true : undefined,
    dungeonFallenTotal: dungeonFall || totalDungeonFallen > 0 ? totalDungeonFallen : undefined,
    dungeonFallExits: dungeonFall || totalDungeonFallExits > 0 ? totalDungeonFallExits : undefined,
    dungeonNewLifes: dungeonFall || totalDungeonNewLifes > 0 ? totalDungeonNewLifes : undefined,
    duel: duel ? true : undefined,
    duelMatchesTotal: duel || totalDuelMatches > 0 ? totalDuelMatches : undefined,
    duelMatchesWon: duel || totalDuelWins > 0 ? totalDuelWins : undefined,
    duelMatchesLost: duel || totalDuelLosses > 0 ? totalDuelLosses : undefined,
    duelMatchesDraw: duel || totalDuelDraws > 0 ? totalDuelDraws : undefined,
  };

  printMetrics(metrics);
  return metrics;
}

function eventKBpsOf(m: LoadTestMetrics): number {
  return (
    m.rxEventKBpsPerBot ?? Number(Math.max(0, m.rxKBpsPerBot - m.rxPatchKBpsPerBot).toFixed(2))
  );
}

function formatRxCell(m: LoadTestMetrics): string {
  return `Tổng **${m.rxKBpsPerBot} KB/s** (patch: ${m.rxPatchKBpsPerBot} KB/s, fx+dmg: ${eventKBpsOf(m)} KB/s)`;
}

function formatEntitiesCell(m: LoadTestMetrics): string {
  if (m.visibleMonstersAvg !== undefined) {
    return `Tầm nhìn TB **${m.visibleMonstersAvg} quái**, **${m.visiblePlayersAvg ?? m.botCount} người** (server bench: ${m.serverMonstersTotal ?? 88} quái; hợp nhất các bot thấy: TB ${m.unionMonstersAvg ?? m.monstersAvg} quái sống)`;
  }
  return `Toàn phòng TB ${m.monstersAvg} quái (đầu ${m.monstersStart} → cuối ${m.monstersEnd}, thấp nhất ${m.monstersMin}), ${m.botCount} người`;
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
    `- Thực thể trong tầm nhìn (StateView) mỗi bot: TB ${m.visibleMonstersAvg ?? m.monstersAvg} quái, ${m.visiblePlayersAvg ?? m.botCount} người (toàn server bench: ${m.serverMonstersTotal ?? 88} quái, hợp nhất các bot thấy: TB ${m.unionMonstersAvg ?? m.monstersAvg} quái sống)`,
  );
  console.log(
    `- Nhịp nhận patch tại client (Δt): TB ${m.patchIntervalAvgMs} ms | p50 ${m.patchIntervalP50Ms} ms | p95 ${m.patchIntervalP95Ms} ms | p99 ${m.patchIntervalP99Ms} ms`,
  );
  console.log(
    `- Độ trễ vòng lặp input -> lastSeq: TB ${m.ackRttAvgMs} ms | min ${m.ackRttMinMs} ms | p50 ${m.ackRttP50Ms} ms | p95 ${m.ackRttP95Ms} ms`,
  );
  console.log(
    `- Băng thông mỗi bot: nhận tổng (RX) ${m.rxKBpsPerBot} KB/s (state patch: ${m.rxPatchKBpsPerBot} KB/s, fx+dmg: ${eventKBpsOf(m)} KB/s, ${m.rxMsgsPerSecPerBot} gói/s) | gửi (TX) ${m.txKBpsPerBot} KB/s (${m.txMsgsPerSecPerBot} gói/s)`,
  );
  console.log(
    `- Tổng băng thông cả phòng (${m.botCount} bot): server phát ra ${m.totalRxKBps} KB/s, nhận vào ${m.totalTxKBps} KB/s`,
  );
  console.log(
    `- Hoạt động chiến đấu: ${m.inputsSent} bước đi, ${m.attacksSent} đòn chém, ${m.skillsSent} kiếm khí (~${m.fxEventsReceivedPerBot ?? "–"} fx/s, ~${m.dmgEventsReceivedPerBot} dmg/s mỗi client)`,
  );
  if (m.partySize && m.partySize > 1) {
    console.log(
      `- Hoạt động tổ đội (${Math.ceil(m.botCount / m.partySize)} đội ${m.partySize} người): nhận ~${m.partyEventsReceivedPerBot ?? 0} tin party/s mỗi bot (~${m.rxPartyKBpsPerBot ?? 0} KB/s)`,
    );
  }
  if (m.walletEventsReceivedPerBot !== undefined && m.walletEventsReceivedPerBot > 0) {
    console.log(
      `- Giao dịch ví Linh thạch: nhận ~${m.walletEventsReceivedPerBot} tin wallet/s mỗi bot (~${m.rxWalletKBpsPerBot ?? 0} KB/s)`,
    );
  }
  if (m.flapSuccess !== undefined) {
    console.log(
      `- Thử tải nối lại (Flap): thành công ${m.flapSuccess} lần (thất bại: ${m.flapFail ?? 0}) | Độ trễ nhận lại state: TB ${m.reconnectLatencyAvgMs ?? "–"} ms (p50: ${m.reconnectLatencyP50Ms ?? "–"} ms, p95: ${m.reconnectLatencyP95Ms ?? "–"} ms) | State gửi lại: TB ${m.reconnectBytesAvg ?? "–"} byte/lần`,
    );
  }
  if (m.storm) {
    console.log(
      `- Bão nối lại (Storm): ${m.stormReconnected ?? 0}/${m.botCount} bot nối lại thành công, tổng ${((m.stormTotalBytes ?? 0) / 1024).toFixed(1)} KB gửi lại | CPU quanh thời điểm bão: max ${m.stormCpuTickMax ?? "–"} ms, p95 ${m.stormCpuTickP95 ?? "–"} ms (ngân sách < 10 ms)`,
    );
  }
  if (m.leakTested) {
    console.log(
      `- Kiểm tra rò rỉ (Leak): state.online về ${m.leakEndOnline} người chơi | VmRSS chênh lệch: ${m.leakRssDeltaMb ?? "–"} MB so với sau làm nóng (ngân sách < 10 MB)`,
    );
  }
  if (m.travel || (m.travelCount !== undefined && m.travelCount > 0)) {
    console.log(
      `- Thử tải chuyển bản đồ (Travel): ${m.travelCount ?? 0} lần qua cổng thành công | Độ trễ travel -> state phòng mới: TB ${m.travelLatencyAvgMs ?? "–"} ms (p50: ${m.travelLatencyP50Ms ?? "–"} ms, p95: ${m.travelLatencyP95Ms ?? "–"} ms) | State ban đầu: TB ${m.travelInitialBytesAvg ?? "–"} byte/lần`,
    );
  }
  if (m.die || (m.deathsTotal !== undefined && m.deathsTotal > 0)) {
    const latStr =
      m.rebirthLatencyAvgMs !== undefined
        ? ` | Độ trễ đầu thai (rebirth -> reborn): TB ${m.rebirthLatencyAvgMs} ms (p50: ${m.rebirthLatencyP50Ms ?? "–"} ms, p95: ${m.rebirthLatencyP95Ms ?? "–"} ms)`
        : "";
    console.log(
      `- Thử tải luân hồi (--die): chết ${m.deathsTotal ?? 0} lần | đầu thai ${m.rebirthsTotal ?? 0} lần | mua Tam Sinh Thạch ${m.soulBuysTotal ?? 0} lần${latStr}`,
    );
  }
  if (m.dungeon || (m.dungeonRunsTotal !== undefined && m.dungeonRunsTotal > 0)) {
    console.log(
      `- Thử tải Bí cảnh (--dungeon): ${m.dungeonRunsTotal ?? 0} lần mở run | Thắng: ${m.dungeonRunsWon ?? 0} | Thua: ${m.dungeonRunsLost ?? 0} | Độ trễ mở -> vào phòng: TB ${m.dungeonOpenLatencyAvgMs ?? "–"} ms (p50: ${m.dungeonOpenLatencyP50Ms ?? "–"} ms, p95: ${m.dungeonOpenLatencyP95Ms ?? "–"} ms)`,
    );
  }
  if (m.dungeonFall || (m.dungeonFallenTotal !== undefined && m.dungeonFallenTotal > 0)) {
    console.log(
      `- Thử tải gục bí cảnh (--dungeon-fall): ${m.dungeonFallenTotal ?? 0} lần gục | ${m.dungeonFallExits ?? 0} lần bị đẩy ra Lạc Hà | Kiếp mới phát sinh: ${m.dungeonNewLifes ?? 0} (mục tiêu 0)`,
    );
  }
  if (m.duel || (m.duelMatchesTotal !== undefined && m.duelMatchesTotal > 0)) {
    console.log(
      `- Thử tải PK thách đấu (--duel): ${m.duelMatchesTotal ?? 0} trận | Thắng: ${m.duelMatchesWon ?? 0} | Thua: ${m.duelMatchesLost ?? 0} | Hoà: ${m.duelMatchesDraw ?? 0}`,
    );
  }
}

function renderTableRows(
  beforeList: LoadTestMetrics[],
  afterList?: LoadTestMetrics[] | null,
): string {
  const fmtCell = (bVal: string, aVal?: string) => (aVal ? `${bVal} → ${aVal}` : bVal);

  return beforeList
    .map((b) => {
      const a = afterList?.find(
        (x) => x.botCount === b.botCount && (x.mode ?? "realistic") === (b.mode ?? "realistic"),
      );
      const modeName =
        (b.mode ?? "realistic") === "realistic"
          ? "Thực tế (vào tầm đứng chém)"
          : (b.mode ?? "realistic") === "crowd"
            ? "Đông người trong trấn (30% đứng yên, 70% đi lại)"
            : "Xấu nhất (100% đi liên tục)";
      return `| ${modeName} | **${b.botCount}** | ${fmtCell(
        `${b.connectedBots}/${b.botCount} (4429: ${b.kicked4429})`,
        a ? `${a.connectedBots}/${a.botCount} (4429: ${a.kicked4429})` : undefined,
      )} | ${fmtCell(
        `TB **${b.serverCpuMsPerTickAvg ?? "–"} ms** / p95 ${b.serverCpuMsPerTickP95 ?? "–"} ms / max ${b.serverCpuMsPerTickMax ?? "–"} ms`,
        a
          ? `TB **${a.serverCpuMsPerTickAvg ?? "–"} ms** / p95 ${a.serverCpuMsPerTickP95 ?? "–"} ms / max ${a.serverCpuMsPerTickMax ?? "–"} ms`
          : undefined,
      )} | ${fmtCell(formatRxCell(b), a ? formatRxCell(a) : undefined)} | ${fmtCell(
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
      )} | ${fmtCell(formatEntitiesCell(b), a ? formatEntitiesCell(a) : undefined)} |`;
    })
    .join("\n");
}

function renderSideBySideRows(beforeList: LoadTestMetrics[], afterList: LoadTestMetrics[]): string {
  const lines: string[] = [];
  for (const b of beforeList) {
    const a = afterList.find(
      (x) => x.botCount === b.botCount && (x.mode ?? "realistic") === (b.mode ?? "realistic"),
    );
    if (!a) continue;
    const modeName =
      (b.mode ?? "realistic") === "realistic"
        ? "Thực tế (vào tầm đứng chém)"
        : (b.mode ?? "realistic") === "crowd"
          ? "Đông người trong trấn (30% đứng yên, 70% đi lại)"
          : "Xấu nhất (100% đi liên tục)";
    lines.push(
      `| **${modeName}** | **${b.botCount}** | Kết nối giữ vững | ${b.connectedBots}/${b.botCount} (4429: ${b.kicked4429}) | **${a.connectedBots}/${a.botCount} (4429: ${a.kicked4429})** |`,
      `| ${modeName} | **${b.botCount}** | CPU mỗi tick (TB / p95 / cao nhất) | TB **${b.serverCpuMsPerTickAvg} ms** / p95 ${b.serverCpuMsPerTickP95} ms / max ${b.serverCpuMsPerTickMax} ms | TB **${a.serverCpuMsPerTickAvg} ms** / p95 ${a.serverCpuMsPerTickP95} ms / max ${a.serverCpuMsPerTickMax} ms |`,
      `| ${modeName} | **${b.botCount}** | Băng thông nhận vào (RX / bot) | ${formatRxCell(b)} | ${formatRxCell(a)} |`,
      `| ${modeName} | **${b.botCount}** | Băng thông gửi đi (TX / bot) | **${b.txKBpsPerBot} KB/s** (${b.txMsgsPerSecPerBot} gói/s) | **${a.txKBpsPerBot} KB/s** (${a.txMsgsPerSecPerBot} gói/s) |`,
      `| ${modeName} | **${b.botCount}** | Nhịp nhận patch \`Δt\` | TB ${b.patchIntervalAvgMs} ms (p95: ${b.patchIntervalP95Ms} ms) | TB **${a.patchIntervalAvgMs} ms** (p95: ${a.patchIntervalP95Ms} ms) |`,
      `| ${modeName} | **${b.botCount}** | Độ trễ \`input → lastSeq\` | TB ${b.ackRttAvgMs} ms (min: ${b.ackRttMinMs} ms, p95: ${b.ackRttP95Ms} ms) | TB **${a.ackRttAvgMs} ms** (min: ${a.ackRttMinMs} ms, p95: ${a.ackRttP95Ms} ms) |`,
      `| ${modeName} | **${b.botCount}** | Quái & người trong tầm nhìn (\`StateView\`) | ${formatEntitiesCell(b)} | ${formatEntitiesCell(a)} |`,
    );
  }
  return lines.join("\n");
}

export function renderMarkdownReport(
  current: LoadTestSnapshot,
  baseline?: LoadTestSnapshot | null,
  midline?: LoadTestSnapshot | null,
): string {
  const before = baseline ?? current;
  const after = baseline ? current : null;
  const rows = renderTableRows(before.results, after?.results);
  const sideBySide = after ? renderSideBySideRows(before.results, after.results) : "";
  const idle = (after ?? before).idleZeroBots;
  const sample = (after ?? before).results[0];

  const commitHeader = after
    ? [
        `- **Mốc trước #62 (đã có #57, #59):** commit \`${before.commit}\` (${before.note})`,
        ...(midline
          ? [
              `- **Mốc trung gian (chỉ có #66 StateView):** commit \`${midline.commit}\` (${midline.note})`,
            ]
          : []),
        `- **Mốc sau #62 hoàn chỉnh (#66 + #69 + #70):** commit \`${after.commit}\` (${after.note})`,
      ].join("\n")
    : `- **Commit đã đo:** \`${before.commit}\` (${before.note})`;

  const threeWayRows =
    after && midline
      ? before.results
          .map((b) => {
            const m = midline.results.find(
              (x) =>
                x.botCount === b.botCount && (x.mode ?? "realistic") === (b.mode ?? "realistic"),
            );
            const a = after.results.find(
              (x) =>
                x.botCount === b.botCount && (x.mode ?? "realistic") === (b.mode ?? "realistic"),
            );
            if (!m || !a) return "";
            const modeName =
              (b.mode ?? "realistic") === "realistic"
                ? "Thực tế (vào tầm đứng chém)"
                : (b.mode ?? "realistic") === "crowd"
                  ? "Đông người trong trấn (30% đứng yên, 70% đi lại)"
                  : "Xấu nhất (100% đi liên tục)";
            return `| ${modeName} | **${b.botCount}** | ${formatRxCell(b)} (${b.rxMsgsPerSecPerBot} gói/s) | ${formatRxCell(m)} (${m.rxMsgsPerSecPerBot} gói/s) | ${formatRxCell(a)} (${a.rxMsgsPerSecPerBot} gói/s) | ${formatEntitiesCell(a)} |`;
          })
          .filter(Boolean)
          .join("\n")
      : "";

  const threeWaySection = threeWayRows
    ? `\n### 2.1. Bảng tiến trình giảm băng thông qua 3 mốc của #62 (\`${before.commit}\` → \`${midline!.commit}\` → \`${after!.commit}\`)\n\n> **Lưu ý về số lượng thực thể:** Từ PR #66 (\`StateView\`), \`room.state.monsters.size\` và \`room.state.players.size\` trên mỗi client chỉ đếm các thực thể **trong tầm nhìn** (\`VIEW_ENTER = 1100 px\`, rời ở \`VIEW_EXIT = 1300 px\` trong \`server/src/systems/interest.ts\`), không phải toàn bộ phòng. Tổng số quái trên toàn server được lấy từ \`bench.ts\` (cùng seed) và đối chiếu thêm bằng hợp nhất (union) ID quái từ tất cả bot đang kết nối.\n\n| Kịch bản | Số bot | Trước #62 (\`${before.commit}\` — ${before.note}) | Sau #66 (\`${midline!.commit}\` — ${midline!.note}) | Sau #66 + #69 + #70 (\`${after!.commit}\` — ${after!.note}) | Thực thể trong tầm nhìn (\`StateView\`) & toàn server |\n|---|---:|---|---|---|---|\n${threeWayRows}\n`
    : "";

  const sideBySideSection = after
    ? `\n### 2.2. Bảng chi tiết từng chỉ số: Trước #62 (\`${before.commit}\`) và Sau #62 (\`${after.commit}\`)\n\n| Kịch bản | Số bot | Chỉ số | Trước #62 (${before.note}) | Sau #62 (${after.note}) |\n|---|---:|---|---|---|\n${sideBySide}\n`
    : "";

  const idleSection = idle
    ? `\n### 2.4. Mức 0 bot (chỉ server chạy, không ai vào phòng trong ${idle.durationSec} giây)\n\n| Số bot | Quái toàn server (\`bench.ts\`) | CPU tiến trình server mỗi tick (TB / p95 / cao nhất) | Tick thuần logic (\`bench.ts\`) | State patch mã hoá mỗi tick (Trước #59 → Sau #59 & #62) | Băng thông state patch |\n|---:|---:|---|---|---|---|\n| **0** | ${idle.monsters} con (đều ngủ do \`MONSTER_WAKE_DIST = 900\`) | TB **${idle.serverCpuMsPerTickAvg} ms** / p95 ${idle.serverCpuMsPerTickP95} ms / max ${idle.serverCpuMsPerTickMax} ms | TB ${idle.benchTickAvgMs} ms / p95 ${idle.benchTickP95Ms} ms | ~893 byte/tick → **${idle.benchPatchBytesPerTick} byte/tick** | ~17.4 KB/s → **${idle.benchKBpsPerClient} KB/s** |\n`
    : "";

  return `# Báo cáo thử tải bằng Bot (Load Test)

> Kịch bản: \`server/scripts/bots.ts\` kết nối bằng \`colyseus.js\` vào server của Dev C (cổng \`2587\`).
> Chạy lại bằng: \`npm run bots -w server -- --suite --mode=both --duration=15 --write-doc\`

## 1. Thông tin bản đo & Phương pháp

${commitHeader}
- **Thời lượng đo mỗi mức:** ${sample?.durationSec ?? 15} giây ổn định (sau 3.5 giây khởi động; vị trí khởi đầu của các bot được ghi sẵn vào \`server/data/players/\` bằng \`seededPrng(1)\` rải đều khắp vùng hoang dã ngoài Lạc Hà Trấn giống \`bench.ts\`, để ngay lúc \`WorldRoom.onJoin\` gắn \`StateView\` các bot đã phân bố tự nhiên trên bản đồ).
- **Hai kịch bản hành vi bot (đều chạy ở nhịp \`TICK_MS = 50\` ms = 20 lần/giây):**
  1. **Thực tế (\`--mode=realistic\`):** giống hệt \`WorldScene.fixedStep()\` của client thật và \`bench.ts\` của Dev A — bot chỉ gửi \`input { seq, dx, dy }\` khi đang chạy tới quái; khi đã vào tầm chém thì **đứng lại đánh, không gửi \`input\`**.
  2. **Trường hợp xấu nhất (\`--mode=worst\`):** cả 100% bot di chuyển liên tục mỗi tick (20 \`input\`/giây/bot quanh bãi săn của mình, kể cả khi đã áp sát quái vẫn lượn vòng quanh), làm \`x, y, lastSeq\` của mọi người chơi đổi ở tất cả các tick.
- **Cách lấy số đo (từ bên ngoài qua WebSocket thật & \`/proc\`):**
  - **CPU mỗi tick (mục tiêu < 10 ms):** đọc \`se.sum_exec_runtime\` từ \`/proc/<server_pid>/sched\` (độ chính xác nano-giây trên Linux) ở mỗi chu kỳ 50 ms. Con số này bao gồm **toàn bộ** công việc của tiến trình server trong một tick: xử lý tin nhắn nhận vào + \`WorldRoom.update()\` + mã hoá bản vá \`@colyseus/schema\` theo từng \`StateView\` + gửi khung WebSocket qua mạng cho 50–100 kết nối.
  - **Băng thông mỗi bot nhận vào (RX) & gửi đi (TX):** đo trực tiếp số byte qua socket của từng bot; tách riêng:
    - **Tổng RX:** toàn bộ byte nhận qua WebSocket mỗi giây trên mỗi bot.
    - **State patch RX:** byte của các gói cập nhật trạng thái (\`Protocol.ROOM_STATE_PATCH = 15\`).
    - **Tin nhắn sự kiện \`fx+dmg\` RX:** byte của các gói tin nhắn hiệu ứng đòn đánh và số sát thương (\`Protocol.ROOM_DATA = 13\`, tức \`Tổng RX - State patch RX\`), kèm tần suất gói \`fx/s\` và \`dmg/s\` mỗi client nhận.
  - **Nhịp nhận patch (\`Δt\`) & Độ trễ \`input → lastSeq\`:** đo trên từng client \`colyseus.js\` bằng \`performance.now()\`.
  - **Số thực thể trong tầm nhìn (\`StateView\`) & toàn server:** lấy mẫu \`room.state.monsters.size\` và \`room.state.players.size\` trên toàn bộ bot mỗi tick (sau #66 đây là số quái/người **trong tầm nhìn** của từng bot), đồng thời lấy tổng số quái toàn server từ \`bench.ts\` và hợp nhất (union) các ID quái mà các bot nhìn thấy.

## 2. Bảng kết quả${after ? " (Trước → Sau #62: StateView #66 + Lượng tử hoá góc #69 + Gửi gần fx/dmg #70)" : ""}
${threeWaySection}${sideBySideSection}
### ${after ? "2.3. Bảng tổng hợp ngang (Trước #62 → Sau #62)" : "2.1. Bảng kết quả"}

| Kịch bản | Số bot | Kết nối giữ vững | CPU mỗi tick: TB / p95 / cao nhất (mục tiêu < 10 ms) | Băng thông nhận vào (RX / bot) | Băng thông gửi đi (TX / bot) | Nhịp nhận patch \`Δt\` (mục tiêu ~50 ms) | Độ trễ \`input → lastSeq\` | Thực thể trong tầm nhìn (\`StateView\`) & toàn server |
|---|---:|---|---|---|---|---|---|---|
${rows}
${idleSection}
## 3. Đối chiếu với Benchmark nội bộ (\`npm run bench -w server\`) & Nhận xét

1. **Kết quả giảm băng thông của chuỗi PR #62 (#66 \`StateView\` + #69 lượng tử hoá góc + #70 \`fx/dmg\` gửi theo vùng nhìn):**
   - **Kịch bản Thực tế (\`--mode=realistic\`, sát với người chơi thật và \`bench.ts\`):**
     - Ở **50 bot**: tổng băng thông nhận mỗi client giảm **~77%**, từ **16.71 KB/s** (patch: 14.83 KB/s, \`fx+dmg\`: 1.88 KB/s) xuống **3.86 KB/s** (patch: **3.18 KB/s**, \`fx+dmg\`: **0.68 KB/s**).
     - Ở **100 bot**: tổng băng thông nhận mỗi client giảm **~71%**, từ **12.11 KB/s** (patch: 11.68 KB/s, \`fx+dmg\`: 0.43 KB/s) xuống **3.55 KB/s** (patch: **3.18 KB/s**, \`fx+dmg\`: **0.37 KB/s**) — đạt sâu dưới mục tiêu **< 10 KB/s mỗi client** của issue #62.
     - Đối chiếu \`bench.ts\` ở 100 người: \`npm run bench -w server -- --players 100 --seconds 20\` cho **6.8 KB/s** patch + **2.3 KB/s** \`fx+dmg\` vùng nhìn (≈ 9.1 KB/s); chạy mặc định \`--seconds 60\` cho 5.6 + 1.3 KB/s vì càng về sau quái chết càng nhiều. Bot qua mạng ra thấp hơn bench vì bot chỉ tìm quái trong 280 px và đứng canh bãi khi hết quái, nên ít đánh nhau hơn người chơi mô phỏng trong bench.
   - **Kịch bản Trường hợp xấu nhất (\`--mode=worst\`, 100% bot gửi 20 \`input\`/s liên tục không nghỉ — mốc ~42–46 KB/s trong issue #62):**
     - Ở **50 bot**: tổng RX mỗi bot giảm **~69%**, từ **26.76 KB/s** (patch: 24.82 KB/s, \`fx+dmg\`: 1.94 KB/s) xuống **8.29 KB/s** (patch: **7.60 KB/s**, \`fx+dmg\`: **0.69 KB/s**).
     - Ở **100 bot**: tổng RX mỗi bot giảm **~68.5% (hơn 3.1 lần)**, từ **46.10 KB/s** (patch: **43.21 KB/s**, \`fx+dmg\`: **2.89 KB/s**, 65.6 gói/s) xuống **17.20 KB/s** sau #66 và còn **14.54 KB/s** sau #69 + #70 (patch: **13.78 KB/s**, \`fx+dmg\`: **0.75 KB/s**, chỉ còn **31.5 gói/s**).
     - Lý do kịch bản \`worst\` 100 bot cao hơn kịch bản \`realistic\` (13.78 KB/s so với 3.18 KB/s state patch): bản đồ chỉ \`3072 × 3072 px\` (\`WORLD_W = MAP_W × TILE = 96 × 32\`) và bot được rải trong bán kính \`0.45 × WORLD_W ≈ 1380 px\` quanh trấn, nên vòng nhìn bán kính \`VIEW_ENTER = 1100 px\` của mỗi bot phủ phần lớn vùng có người, trung bình **~53.1 người chơi** trong tầm nhìn; ở chế độ \`worst\`, cả 53 người chơi trong tầm nhìn đều đổi \`x, y, lastSeq\` ở **mọi tick (100% thời gian)** thay vì chỉ ~15–20% thời gian như khi đứng đánh quái ở chế độ \`realistic\` và \`bench.ts\`.
2. **Hiệu quả của PR #70 (\`WorldRoom.sendNear\` cho \`fx\` và \`dmg\`):**
   - Trước #70 (sau #66), dù state patch đã lọc theo \`StateView\`, các gói \`fx\` và \`dmg\` vẫn \`broadcast\` toàn phòng, chiếm tới **1.56 KB/s** (ở \`realistic\` 100 bot, 45.1 gói/s) và **2.93 KB/s** (ở \`worst\` 100 bot, 66.7 gói/s).
   - Sau #70, khi chỉ gửi \`fx\` và \`dmg\` cho người chơi trong bán kính \`VIEW_ENTER = 1100 px\`, băng thông \`fx+dmg\` mỗi bot ở 100 bot giảm xuống còn **0.37 KB/s** (\`realistic\`, giảm **76%**) và **0.75 KB/s** (\`worst\`, giảm **74%**), kéo tổng số khung WebSocket nhận mỗi giây giảm hơn một nửa (từ ~66.7 gói/s xuống **31.5 gói/s**).
3. **CPU mỗi tick (< 10 ms), mức 0 bot (quái ngủ #59) và giới hạn tần suất (#57):**
   - Ở mức **0 bot**, toàn bộ 88 con quái ngủ (\`MONSTER_WAKE_DIST = 900\`), state patch giữ nguyên **0 byte/tick (0 KB/s)**, CPU tiến trình server chỉ **~0.27 ms/tick**.
   - Ở mức **50–100 bot**, tổng thời gian CPU của tiến trình server (gồm cả giải mã tin nhắn, chạy vòng lặp \`World\`, mã hoá \`StateView\` riêng cho từng client và gửi qua mạng) đạt trung bình **1.39–2.36 ms/tick** ở 50 bot và **2.15–4.05 ms/tick** (p95 **3.75–6.05 ms/tick**) ở 100 bot — nằm gọn trong ngân sách **< 10 ms/tick**.
   - Toàn bộ các đợt chạy 50 và 100 bot đều giữ **100% kết nối (\`4429: 0\`)**, nhịp nhận patch ổn định **~50.2 ms**.
4. **Chưa đo: đông người tụ trong trấn (ca xấu nhất thật sự của vùng nhìn).**
   - Mọi kịch bản ở trên rải bot khắp vùng hoang dã nên \`StateView\` cắt được nhiều. Khi 100 người cùng đứng ở Lạc Hà Trấn (nhận nhiệm vụ, rèn đồ, giờ cao điểm) thì ai cũng thấy gần như tất cả mọi người, vùng nhìn không còn cắt được gì.
   - Ước tính thô của Dev A bằng bench tạm: 100 người tụ trong trấn và **100% đi lại liên tục** ≈ **19 KB/s mỗi client** state patch (mỗi người thấy ~90 người khác); 50 người ≈ 9 KB/s; đứng yên ≈ 0 KB/s.
   - Sẽ đo bằng bot thật (\`--mode=crowd\`) trong issue #78.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.cleanOnly) {
    cleanBotSavesManual(args.yes);
    return;
  }

  if (FORBIDDEN_PORTS.has(args.port) && !args.allowOtherPort) {
    console.error(
      `Từ chối chạy: cổng ${args.port} thuộc về Dev A (2567) hoặc Dev B (2577). Chỉ chạy thử tải vào cổng của Dev C (2587).`,
    );
    process.exit(1);
  }

  const resolveRepoPath = (p: string) =>
    path.isAbsolute(p) ? p : existsSync(p) ? p : path.resolve(repoRoot, p);

  if (process.argv.includes("--render-only")) {
    const curPath = resolveRepoPath(args.saveJson || "server/scripts/load-test-after-62.json");
    const cmpPath = resolveRepoPath(args.compareJson || "server/scripts/load-test-after.json");
    const midPath = resolveRepoPath("server/scripts/load-test-after-66.json");
    const cur = JSON.parse(readFileSync(curPath, "utf8")) as LoadTestSnapshot;
    const base = existsSync(cmpPath)
      ? (JSON.parse(readFileSync(cmpPath, "utf8")) as LoadTestSnapshot)
      : null;
    const mid = existsSync(midPath)
      ? (JSON.parse(readFileSync(midPath, "utf8")) as LoadTestSnapshot)
      : null;
    const md = renderMarkdownReport(cur, base, mid);
    writeFileSync(DOC_PATH, md);
    console.log(`Đã kết xuất báo cáo từ ${curPath} và ${cmpPath} vào ${DOC_PATH}`);
    return;
  }

  const commit = args.commitOverride || currentGitCommit();
  let idleZeroBots: IdleZeroBotMetrics | undefined;

  if (args.loginStorm) {
    const httpBase = args.url.replace(/^ws/, "http").replace(/\/$/, "");
    console.log(`\n=== Bắt đầu thử tải Login Storm: ${args.bots} bot đồng thời (${httpBase}) ===`);
    const report = await runLoginStorm(httpBase, args.bots);
    console.log(`\n=== Kết quả Login Storm ===`);
    console.log(`  Tổng yêu cầu:       ${report.total}`);
    console.log(
      `  Thành công:         ${report.success} (${Math.round((report.success / report.total) * 100)}%)`,
    );
    console.log(`  Thất bại:           ${report.failed}`);
    console.log(`  Tổng thời gian:     ${report.totalDurationMs} ms`);
    console.log(`  Độ trễ trung bình:  ${report.avgLatencyMs} ms`);
    console.log(`  Độ trễ p50:         ${report.p50LatencyMs} ms`);
    console.log(`  Độ trễ p95:         ${report.p95LatencyMs} ms`);
    console.log(`  Độ trễ tối đa:      ${report.maxLatencyMs} ms`);
    return;
  }

  if (args.bots === 0 && !args.suite) {
    await runIdleZeroBotTest(args.durationSec, args.url, args.port, args.keepSaves, args.map);
    return;
  }

  if (args.suite) {
    idleZeroBots = await runIdleZeroBotTest(
      args.durationSec,
      args.url,
      args.port,
      args.keepSaves,
      args.map,
    );
  }

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
          args.partySize,
          args.shop,
          args.flap,
          args.flapInterval,
          args.flapDelay,
          args.storm,
          args.leak,
          args.map,
          args.travel,
          args.die,
          args.account,
          args.dungeon,
          args.dungeonFall,
          args.dungeonFallRate,
          args.duel,
        ),
      );
    }
  }

  const snapshot: LoadTestSnapshot = { commit, note: args.note, idleZeroBots, results };

  if (args.saveJson) {
    const outPath = resolveRepoPath(args.saveJson);
    writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
    console.log(`Đã lưu dữ liệu JSON vào ${outPath}`);
  }

  let baseline: LoadTestSnapshot | null = null;
  if (args.compareJson) {
    const cmpPath = resolveRepoPath(args.compareJson);
    if (existsSync(cmpPath)) {
      baseline = JSON.parse(readFileSync(cmpPath, "utf8")) as LoadTestSnapshot;
    }
  }

  if (args.writeDoc) {
    const midPath = resolveRepoPath("server/scripts/load-test-after-66.json");
    const mid =
      existsSync(midPath) && snapshot.commit !== "9be02c9"
        ? (JSON.parse(readFileSync(midPath, "utf8")) as LoadTestSnapshot)
        : null;
    const md = renderMarkdownReport(snapshot, baseline, mid);
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
