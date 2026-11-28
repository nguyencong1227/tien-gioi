// Bộ chạy toàn bộ các script E2E của Tiên Giới một lệnh (M7.16, Issue #694, #1386, #1404).
// Chạy TUẦN TỰ từng script e2e:* (đọc từ server/package.json), timeout mỗi script,
// hỗ trợ chia shard (--shard M/N) để chạy song song trên nhiều runner CI,
// tự động dọn sạch toàn bộ cây tiến trình con cháu (tránh mồ côi Chrome detached),
// tự động thử lại 1 lần nếu đỏ (xanh ở lần 2 -> FLAKY), in bảng kết quả Markdown,
// trích dẫn 3-5 dòng log cuối của script đỏ, và ghi log đầy đủ từng script vào thư mục.
//
// Cách dùng:
//   npm run e2e:all -w server
//   npm run e2e:all -w server -- --shard 1/2
//   npm run e2e:all -w server -- --only noi-lai,chat-luong
//   npm run e2e:all -w server -- --skip map,dpr
//   npm run e2e:all -w server -- --timeout 180 --logs /tmp/e2e-run
//   npm run e2e:all -w server -- --build
//   npm run e2e:all -w server -- --dry-run
//   npm run e2e:all -w server -- --no-retry
import { spawn, execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const serverPkgPath = path.resolve(here, "../package.json");

export interface ShardConfig {
  index: number;
  total: number;
}

export interface E2eAllOptions {
  only?: string[];
  skip?: string[];
  timeoutSec: number;
  logsDir: string;
  build: boolean;
  dryRun: boolean;
  retry: boolean;
  shard?: ShardConfig;
}

export type ScriptStatus = "XANH" | "FLAKY" | "ĐỎ" | "BỎ QUA";

export interface ScriptResult {
  script: string;
  status: ScriptStatus;
  durationSec: number;
  attempts: number;
  note?: string;
  logPath?: string;
  lastLines?: string[];
}

/**
 * Sàn hạn chờ RIÊNG (giây) cho kịch bản chậm: hạn thực = max(--timeout, sàn), nên `--timeout` nhỏ hơn không cắt ngang chúng (#1458, A: KHÔNG nâng chung lên 600 s).
 * Sàn ~2,4-3 lần thời gian ĐO TRÊN CI (runner SwiftShader, không GPU; run 45539915300 và 45549071896 ngày 25/11): social-shell 380 s -> 900 (thống nhất A + C);
 * text-size 131-159 s -> 480; sect-hall 167-205 s -> 500; sect-confirm 167-210 s -> 540; sect-vault 164-182 s -> 540 (#1477).
 * Issue #1501 (C khảo sát số đo thật 3 lượt main 45658493051, 45691664338, 45701781366):
 * chuyen-canh bản hiện tại sau #1499 đo 86,9-173,9 s trên 13 lượt CI -> sàn 480 s (trước đó 300 s, tỷ lệ 58,0% nguy hiểm khi runner dao động 2,0x);
 * inv-select đo 133,6-173,9 s -> sàn 480 s (trước đó 300 s, tỷ lệ 58,0%). Cả hai hạn thực 480 s <= 600 s nên vẫn được thử lại.
 * Lưu ý: cả chuyen-canh và inv-select cùng nằm Shard 3 nên sàn giữ 480 s để nếu một script treo + thử lại không vượt trần 30 phút của shard.
 * hud (lô 6, #1522) đo 61,5-103,8 s trên CI (5 lượt `only=hud,equip-six,skill-book`, runs 45762380754 ... 45763947053 ngày 26/11): 3 x 103,8 = 311 s > 300 -> sàn 360 s (A, nhận xét ở #1522); cùng nằm Shard 3 nên 360 <= các sàn khác, không đổi trần 30 phút của shard.
 * skill-touch (lô 7, #1524) đo 130,2-138,3 s trên CI (runs 45765623259, 45766212473, 45766891291 ngày 26/11): 3 x 138,3 = 415 s > 300 -> sàn 420 s (<= 600 s nên vẫn được thử lại).
 * shop-qty (nit #1530, `settle()` thay `sleep`) đo 100,3-158,3 s trên CI (runs 46127581294 ... 46128986171 ngày 28/11): 3 x 158,3 = 475 s > 300 -> sàn 480 s (<= 600 s nên vẫn được thử lại).
 * Kịch bản có 3 x thời gian CI <= 300 s không cần dòng ở đây. Thêm kịch bản chậm mới thì thêm vào đây theo số đo CI, đừng nâng `--timeout` chung.
 */
export const SCRIPT_TIMEOUT_SEC: Readonly<Record<string, number>> = {
  "e2e:social-shell": 900,
  "e2e:text-size": 480,
  "e2e:sect-hall": 500,
  "e2e:sect-confirm": 540,
  "e2e:sect-vault": 540,
  "e2e:chuyen-canh": 480,
  "e2e:inv-select": 480,
  "e2e:hud": 360,
  "e2e:skill-touch": 420,
  "e2e:shop-qty": 480,
};

/** Kịch bản có hạn chờ thực LỚN HƠN ngưỡng này KHÔNG được thử lại: một lần treo + thử lại sẽ ăn quá `timeout-minutes` của cả shard (A ở #1458). */
export const RETRY_MAX_TIMEOUT_SEC = 600;

/** Hạn chờ thực của một kịch bản: max(hạn chung, sàn riêng). Tra bằng `hasOwnProperty` (tên script đến từ package.json, không tin `constructor`). */
export function timeoutSecFor(script: string, globalSec: number): number {
  const own = Object.prototype.hasOwnProperty.call(SCRIPT_TIMEOUT_SEC, script)
    ? SCRIPT_TIMEOUT_SEC[script]
    : 0;
  return Math.max(globalSec, own);
}

/** Có được thử lại khi lần đầu đỏ không: chỉ khi hạn chờ thực <= `RETRY_MAX_TIMEOUT_SEC`. */
export function retryAllowed(script: string, globalSec: number): boolean {
  return timeoutSecFor(script, globalSec) <= RETRY_MAX_TIMEOUT_SEC;
}

/** Đọc danh sách các script bắt đầu bằng "e2e" từ package.json, loại bỏ e2e:all và e2e-all */
export function getE2eScripts(pkgJson: { scripts?: Record<string, string> }): string[] {
  const scripts = pkgJson.scripts ?? {};
  return Object.keys(scripts).filter(
    (name) => name.startsWith("e2e") && name !== "e2e:all" && name !== "e2e-all",
  );
}

function isExactMatch(script: string, filterItem: string): boolean {
  const clean = filterItem.trim().toLowerCase();
  if (!clean) return false;
  const sLower = script.toLowerCase();
  const suffix = sLower.replace(/^e2e:?/, "");
  return sLower === clean || suffix === clean;
}

function isSubstringMatch(script: string, filterItem: string): boolean {
  const clean = filterItem.trim().toLowerCase();
  if (!clean) return false;
  return script.toLowerCase().includes(clean);
}

/** Lọc danh sách script theo --only và --skip (ưu tiên khớp chính xác trước khi rơi về chuỗi con) */
export function filterScripts(
  allScripts: string[],
  options: { only?: string[]; skip?: string[] },
): { selected: string[]; skipped: string[] } {
  const only = (options.only ?? []).map((s) => s.trim()).filter(Boolean);
  const skip = (options.skip ?? []).map((s) => s.trim()).filter(Boolean);

  let candidates = allScripts;
  if (only.length > 0) {
    const selectedOnly = new Set<string>();
    for (const item of only) {
      // Ưu tiên khớp chính xác trước (tên đầy đủ hoặc phần sau e2e:)
      const exact = allScripts.filter((s) => isExactMatch(s, item));
      if (exact.length > 0) {
        for (const s of exact) selectedOnly.add(s);
      } else {
        // Chỉ rơi về chuỗi con khi không có khớp chính xác nào
        const sub = allScripts.filter((s) => isSubstringMatch(s, item));
        for (const s of sub) selectedOnly.add(s);
      }
    }
    candidates = allScripts.filter((s) => selectedOnly.has(s));
  }

  const skipSet = new Set<string>();
  if (skip.length > 0) {
    for (const item of skip) {
      const exact = allScripts.filter((s) => isExactMatch(s, item));
      if (exact.length > 0) {
        for (const s of exact) skipSet.add(s);
      } else {
        const sub = allScripts.filter((s) => isSubstringMatch(s, item));
        for (const s of sub) skipSet.add(s);
      }
    }
  }

  const selected: string[] = [];
  const skipped: string[] = [];

  for (const script of candidates) {
    if (skipSet.has(script)) {
      skipped.push(script);
    } else {
      selected.push(script);
    }
  }

  return { selected, skipped };
}

/** Phân tích và kiểm tra giá trị tham số --shard M/N (1 <= M <= N) */
export function parseShard(val: string): ShardConfig {
  const clean = val.trim();
  const match = /^(\d+)\/(\d+)$/.exec(clean);
  if (!match) {
    throw new Error(
      `Định dạng --shard không hợp lệ: "${val}". Cần có định dạng M/N (ví dụ: --shard 1/2)`,
    );
  }
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    index < 1 ||
    total < 1 ||
    index > total
  ) {
    throw new Error(
      `Phạm vi --shard không hợp lệ: "${val}". Yêu cầu 1 <= M <= N với M, N là số nguyên dương (ví dụ: --shard 1/2)`,
    );
  }
  return { index, total };
}

/**
 * Chia danh sách kịch bản theo shard M/N (hàm thuần pure function).
 * Sử dụng phân bổ vòng tròn (round-robin: idx % N === M - 1) để phân tán đều tải,
 * bảo toàn thứ tự kịch bản ban đầu và đảm bảo mỗi kịch bản chỉ xuất hiện đúng 1 lần qua các shard.
 */
export function shardScripts(scripts: string[], shard: ShardConfig): string[] {
  const { index, total } = shard;
  if (total < 1 || index < 1 || index > total) {
    throw new Error(`Phạm vi shard không hợp lệ: ${index}/${total}. Yêu cầu 1 <= M <= N.`);
  }

  return scripts.filter((_, idx) => idx % total === index - 1);
}

/** Phân tích các tham số dòng lệnh CLI */
export function parseCliArgs(args: string[]): E2eAllOptions {
  const options: E2eAllOptions = {
    timeoutSec: 300,
    logsDir: "",
    build: false,
    dryRun: false,
    retry: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--only" || arg === "-o") {
      const val = args[++i] ?? "";
      options.only = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--only=")) {
      options.only = arg
        .slice("--only=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--skip" || arg === "-s") {
      const val = args[++i] ?? "";
      options.skip = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--skip=")) {
      options.skip = arg
        .slice("--skip=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--timeout" || arg === "-t") {
      const val = Number(args[++i]);
      if (Number.isFinite(val) && val > 0) options.timeoutSec = val;
    } else if (arg.startsWith("--timeout=")) {
      const val = Number(arg.slice("--timeout=".length));
      if (Number.isFinite(val) && val > 0) options.timeoutSec = val;
    } else if (arg === "--logs") {
      options.logsDir = args[++i] ?? "";
    } else if (arg.startsWith("--logs=")) {
      options.logsDir = arg.slice("--logs=".length);
    } else if (arg === "--build") {
      options.build = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-retry") {
      options.retry = false;
    } else if (arg === "--shard") {
      const val = args[++i] ?? "";
      options.shard = parseShard(val);
    } else if (arg.startsWith("--shard=")) {
      const val = arg.slice("--shard=".length);
      options.shard = parseShard(val);
    }
  }

  if (!options.logsDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    options.logsDir = path.join(os.tmpdir(), `tien-gioi-e2e-${timestamp}`);
  } else {
    const baseCwd = process.env.INIT_CWD ?? process.cwd();
    options.logsDir = path.resolve(baseCwd, options.logsDir);
  }

  return options;
}

/** Lấy thời điểm mtime lớn nhất của tất cả file trong một thư mục đệ quy */
function getMaxMtime(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  let maxTime = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subMax = getMaxMtime(fullPath);
        if (subMax > maxTime) maxTime = subMax;
      } else if (entry.isFile()) {
        const stat = statSync(fullPath);
        if (stat.mtimeMs > maxTime) maxTime = stat.mtimeMs;
      }
    }
  } catch {
    // Bỏ qua lỗi đọc thư mục nếu có
  }
  return maxTime;
}

/** Kiểm tra tình trạng client/dist so với client/src */
export function checkClientDist(rootDir: string): {
  exists: boolean;
  outdated: boolean;
  srcMtime: number;
  distMtime: number;
} {
  const distHtml = path.join(rootDir, "client/dist/index.html");
  const srcDir = path.join(rootDir, "client/src");

  if (!existsSync(distHtml)) {
    return { exists: false, outdated: true, srcMtime: 0, distMtime: 0 };
  }

  const distMtime = statSync(distHtml).mtimeMs;
  const srcMtime = getMaxMtime(srcDir);
  return {
    exists: true,
    outdated: distMtime < srcMtime,
    srcMtime,
    distMtime,
  };
}

/** Trích xuất ~15 dòng cuối của chuỗi log, lọc bỏ các dòng boilerplate của npm error */
export function extractLastLines(logContent: string, count = 15): string[] {
  const lines = logContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !l.startsWith("npm error") && !l.startsWith("npm ERR!"));
  if (lines.length <= count) return lines;
  return lines.slice(-count);
}

/** Định dạng bảng kết quả Markdown */
export function formatResultTable(results: ScriptResult[]): string {
  const header = [
    "| STT | Script | Kết quả | Thời gian | Lần chạy | Ghi chú |",
    "| :---: | :--- | :---: | :---: | :---: | :--- |",
  ];

  const rows = results.map((r, i) => {
    let statusIcon = "✓ XANH";
    if (r.status === "FLAKY") statusIcon = "⚠️ FLAKY";
    else if (r.status === "ĐỎ") statusIcon = "❌ ĐỎ";
    else if (r.status === "BỎ QUA") statusIcon = "⏭ BỎ QUA";

    const duration = r.status === "BỎ QUA" ? "-" : `${r.durationSec.toFixed(1)}s`;
    const attempts = r.status === "BỎ QUA" ? "-" : String(r.attempts);
    const note = r.note ?? "";

    return `| ${i + 1} | \`${r.script}\` | ${statusIcon} | ${duration} | ${attempts} | ${note} |`;
  });

  const total = results.length;
  const passed = results.filter((r) => r.status === "XANH").length;
  const flaky = results.filter((r) => r.status === "FLAKY").length;
  const failed = results.filter((r) => r.status === "ĐỎ").length;
  const skipped = results.filter((r) => r.status === "BỎ QUA").length;
  const totalTime = results
    .filter((r) => r.status !== "BỎ QUA")
    .reduce((acc, r) => acc + r.durationSec, 0);

  const summary =
    `\n**Tổng kết:** ${total} script | ` +
    `✓ **Xanh:** ${passed} | ` +
    (flaky > 0 ? `⚠️ **Flaky:** ${flaky} | ` : "") +
    (failed > 0 ? `❌ **Đỏ:** ${failed} | ` : `❌ **Đỏ:** 0 | `) +
    (skipped > 0 ? `⏭ **Bỏ qua:** ${skipped} | ` : "") +
    `⏱ **Tổng thời gian:** ${totalTime.toFixed(1)}s`;

  return [...header, ...rows].join("\n") + "\n" + summary;
}

/** Định dạng chi tiết các script bị ĐỎ */
export function formatFailureDetails(results: ScriptResult[]): string {
  const failedResults = results.filter((r) => r.status === "ĐỎ");
  if (failedResults.length === 0) return "";

  const sections: string[] = ["\n### Chi tiết lỗi (ĐỎ):"];
  for (const r of failedResults) {
    sections.push(`\n#### ❌ \`${r.script}\`${r.logPath ? ` (log: \`${r.logPath}\`)` : ""}`);
    if (r.lastLines && r.lastLines.length > 0) {
      sections.push("```text");
      sections.push(r.lastLines.join("\n"));
      sections.push("```");
    } else {
      sections.push("*(không có dòng log)*");
    }
  }
  return sections.join("\n");
}

/**
 * Phân tích đầu ra `ps -eo pid=,ppid=,pgid=` để tìm tất cả các PGID con cháu của một rootPid.
 * Hàm thuần (pure function) để dễ dàng kiểm thử không phụ thuộc môi trường chạy.
 */
export function findDescendantPgids(
  psOutput: string,
  rootPid: number,
  selfPids: Set<number> = new Set(),
): number[] {
  const childrenMap = new Map<number, number[]>();
  const pgidMap = new Map<number, number>();

  const lines = psOutput.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    const pgid = Number(parts[2]);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !Number.isInteger(pgid)) continue;

    pgidMap.set(pid, pgid);
    let children = childrenMap.get(ppid);
    if (!children) {
      children = [];
      childrenMap.set(ppid, children);
    }
    children.push(pid);
  }

  // Duyệt BFS tìm toàn bộ con cháu của rootPid
  const visited = new Set<number>();
  const queue = [rootPid];
  const descendantPgids = new Set<number>();

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const children = childrenMap.get(curr) ?? [];
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
        const childPgid = pgidMap.get(child);
        if (childPgid && childPgid !== rootPid && !selfPids.has(childPgid)) {
          descendantPgids.add(childPgid);
        }
      }
    }
  }

  return Array.from(descendantPgids);
}

/**
 * Tiêu diệt triệt để cây tiến trình của một rootPid (bao gồm cả các tiến trình con spawn detached như Chrome).
 * Thực hiện SIGKILL ngay lập tức tới các nhóm con cháu để ngăn chặn việc bị reparent về init/systemd.
 */
export async function killProcessTree(
  rootPid: number,
  options?: { psCommandOutput?: string },
): Promise<void> {
  let psOutput = options?.psCommandOutput;
  if (psOutput === undefined) {
    try {
      psOutput = execSync("ps -eo pid=,ppid=,pgid=", { encoding: "utf-8" });
    } catch {
      psOutput = "";
    }
  }

  const selfPids = new Set<number>();
  if (process.pid) selfPids.add(process.pid);
  const getpgrp = (process as unknown as { getpgrp?: () => number }).getpgrp;
  if (typeof getpgrp === "function") {
    try {
      selfPids.add(getpgrp());
    } catch {
      // Bỏ qua lỗi đọc process group
    }
  }

  const descendantPgids = findDescendantPgids(psOutput, rootPid, selfPids);

  // 1. Tiêu diệt NGAY LẬP TỨC các nhóm tiến trình con cháu (Chrome, sub-workers...) bằng SIGKILL
  for (const pgid of descendantPgids) {
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // Bỏ qua lỗi kill nhóm nếu đã thoát
    }
  }

  // 2. Tiêu diệt nhóm tiến trình gốc của npm/tsx
  try {
    process.kill(-rootPid, "SIGKILL");
  } catch {
    // Bỏ qua lỗi kill nhóm gốc
  }
  try {
    process.kill(rootPid, "SIGKILL");
  } catch {
    // Bỏ qua lỗi kill rootPid
  }

  // Chờ ngắn để kernel hoàn tất thu hồi tài nguyên tiến trình
  await new Promise((r) => setTimeout(r, 100));
}

/** Chạy một lần script bằng npm run (hoặc command tuỳ chọn) và bắt log + timeout */
export function executeScriptOnce(
  scriptName: string,
  options: {
    cwd: string;
    timeoutSec: number;
    logFile: string;
    attempt: number;
    command?: { cmd: string; args: string[] };
    graceMs?: number;
    privTmpDir?: string;
    logsDir?: string;
  },
): Promise<{
  exitCode: number | null;
  durationSec: number;
  log: string;
  timedOut: boolean;
  privTmpDir: string;
}> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let timedOut = false;
    let logBuffer = "";
    let cleanupPromise: Promise<void> | null = null;

    // Dùng thư mục tạm riêng biệt (ngắn, dưới os.tmpdir()) để cô lập môi trường chạy
    // Mọi thư mục tạm của Chrome và file lưu của kịch bản đều sinh bên trong thư mục này
    // và được dọn dẹp sạch sẽ sau khi script kết thúc mà không đụng chạm tới tài nguyên của dev khác
    const privTmpDir = options.privTmpDir ?? mkdtempSync(path.join(os.tmpdir(), "tg-e2eall-"));

    const cmd = options.command?.cmd ?? "npm";
    const args = options.command?.args ?? ["run", scriptName, "-w", "server"];

    const cp = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // tạo process group để quản lý
      env: {
        ...process.env,
        TMPDIR: privTmpDir,
        TEMP: privTmpDir,
        TMP: privTmpDir,
        FORCE_COLOR: "0",
        E2E_LOG_DIR: options.logsDir,
      },
    });

    const appendLog = (chunk: Buffer | string) => {
      const text = chunk.toString();
      logBuffer += text;
    };

    cp.stdout?.on("data", appendLog);
    cp.stderr?.on("data", appendLog);

    const timer = setTimeout(() => {
      timedOut = true;
      if (cp.pid) {
        cleanupPromise = killProcessTree(cp.pid);
      }
    }, options.timeoutSec * 1000);

    const cleanupPrivTmp = async () => {
      if (timedOut) {
        // Chờ ngắn để tiến trình con giải phóng hoàn toàn file lock trước khi xoá thư mục
        await new Promise((r) => setTimeout(r, 200));
      }
      try {
        if (existsSync(privTmpDir)) {
          rmSync(privTmpDir, { recursive: true, force: true });
        }
      } catch {
        // Bỏ qua lỗi dọn privTmpDir
      }
    };

    cp.on("close", async (code) => {
      clearTimeout(timer);
      if (cleanupPromise) {
        try {
          await cleanupPromise;
        } catch {
          // Bỏ qua lỗi dọn dẹp
        }
      }

      const durationSec = (Date.now() - startTime) / 1000;
      if (timedOut) {
        logBuffer += `\n[TIMEOUT] Script chạy quá giới hạn ${options.timeoutSec}s và đã bị dừng (đã dọn cây tiến trình).\n`;
      }

      await cleanupPrivTmp();

      // Ghi log ra file
      try {
        writeFileSync(options.logFile, logBuffer, { flag: options.attempt > 1 ? "a" : "w" });
      } catch (err) {
        console.error(`Không thể ghi log vào ${options.logFile}:`, err);
      }

      resolve({
        exitCode: timedOut ? 124 : code,
        durationSec,
        log: logBuffer,
        timedOut,
        privTmpDir,
      });
    });

    cp.on("error", async (err) => {
      clearTimeout(timer);
      await cleanupPrivTmp();
      const durationSec = (Date.now() - startTime) / 1000;
      logBuffer += `\n[LỖI TIẾN TRÌNH] ${err.message}\n`;
      try {
        writeFileSync(options.logFile, logBuffer, { flag: options.attempt > 1 ? "a" : "w" });
      } catch {
        // Bỏ qua lỗi ghi log dự phòng khi tiến trình thất bại
      }
      resolve({
        exitCode: 1,
        durationSec,
        log: logBuffer,
        timedOut: false,
        privTmpDir,
      });
    });
  });
}

/** Chạy toàn bộ quy trình e2e:all */
export async function runE2eAll(args: string[] = process.argv.slice(2)): Promise<number> {
  let options: E2eAllOptions;
  try {
    options = parseCliArgs(args);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Lỗi tham số dòng lệnh: ${msg}`);
    return 2;
  }
  const out = (m: string) => console.log(m);

  out("======================================================================");
  out("🚀 Tiên Giới: Bộ chạy toàn diện E2E (e2e:all)");
  out("======================================================================");

  // Đọc danh sách script
  const pkgJson = JSON.parse(readFileSync(serverPkgPath, "utf-8"));
  const allScripts = getE2eScripts(pkgJson);

  // Thứ tự xử lý: lọc --only và --skip TRƯỚC
  const { selected, skipped } = filterScripts(allScripts, {
    only: options.only,
    skip: options.skip,
  });

  // Sau đó mới chia shard trên danh sách còn lại
  let toRun = selected;
  if (options.shard) {
    toRun = shardScripts(selected, options.shard);
  }

  out(
    `Danh sách script E2E: tổng ${allScripts.length} | chọn ${selected.length} | bỏ qua ${skipped.length}`,
  );
  if (options.shard) {
    out(
      `  --shard: ${options.shard.index}/${options.shard.total} (chạy ${toRun.length}/${selected.length} script)`,
    );
  }
  if (options.only && options.only.length > 0) {
    out(`  --only: ${options.only.join(", ")}`);
  }
  if (options.skip && options.skip.length > 0) {
    out(`  --skip: ${options.skip.join(", ")}`);
  }
  out(`Timeout mỗi script: ${options.timeoutSec}s | Thư mục logs: ${options.logsDir}`);

  // Nếu là dry-run, in kế hoạch và kết thúc ngay không tạo thư mục log và không build
  if (options.dryRun) {
    out("\n[DRY RUN] Các script sẽ chạy:");
    for (let i = 0; i < toRun.length; i++) {
      out(`  ${i + 1}. ${toRun[i]}`);
    }
    if (skipped.length > 0) {
      out("[DRY RUN] Các script bị bỏ qua:");
      for (const s of skipped) {
        out(`  - ${s}`);
      }
    }
    return 0;
  }

  // Kiểm tra client/dist
  const distCheck = checkClientDist(repoRoot);
  if (options.build || distCheck.outdated) {
    if (options.build) {
      out("\n📦 Đang build client (`npm run build -w client` theo cờ --build)...");
      execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
    } else {
      out(
        "\n⚠️  CẢNH BÁO: client/dist cũ hơn client/src hoặc chưa được build!\n" +
          "   Nên chạy `npm run build` trước khi chạy E2E hoặc thêm cờ `--build`.\n",
      );
    }
  }

  // Tạo thư mục log
  if (!existsSync(options.logsDir)) {
    mkdirSync(options.logsDir, { recursive: true });
  }

  const results: ScriptResult[] = [];

  // Ghi nhận các script bị bỏ qua
  for (const s of skipped) {
    results.push({
      script: s,
      status: "BỎ QUA",
      durationSec: 0,
      attempts: 0,
      note: "Bỏ qua theo --skip hoặc không khớp --only",
    });
  }

  out(`\nBắt đầu chạy tuần tự ${toRun.length} script...\n`);

  for (let i = 0; i < toRun.length; i++) {
    const script = toRun[i];
    const logFile = path.join(options.logsDir, `${script.replace(/[:/]/g, "-")}.log`);
    const progress = `[${i + 1}/${toRun.length}]`;

    process.stdout.write(`${progress} ${script} ... `);

    // Chạy lần 1
    const run1 = await executeScriptOnce(script, {
      cwd: repoRoot,
      timeoutSec: timeoutSecFor(script, options.timeoutSec),
      logFile,
      logsDir: options.logsDir,
      attempt: 1,
    });

    if (run1.exitCode === 0) {
      out(`✓ XANH (${run1.durationSec.toFixed(1)}s)`);
      results.push({
        script,
        status: "XANH",
        durationSec: run1.durationSec,
        attempts: 1,
        logPath: logFile,
      });
      continue;
    }

    // Nếu thất bại ở lần 1 và có bật retry (kịch bản có hạn chờ > RETRY_MAX_TIMEOUT_SEC thì không thử lại)
    if (options.retry && retryAllowed(script, options.timeoutSec)) {
      process.stdout.write(
        `⚠️ Lần 1 thất bại (${run1.durationSec.toFixed(1)}s). Thử lại lần 2... `,
      );

      const run2 = await executeScriptOnce(script, {
        cwd: repoRoot,
        timeoutSec: timeoutSecFor(script, options.timeoutSec),
        logFile,
        logsDir: options.logsDir,
        attempt: 2,
      });

      const totalDuration = run1.durationSec + run2.durationSec;

      if (run2.exitCode === 0) {
        out(`✓ FLAKY (${run2.durationSec.toFixed(1)}s)`);
        results.push({
          script,
          status: "FLAKY",
          durationSec: totalDuration,
          attempts: 2,
          note: "Thành công ở lần thử lại",
          logPath: logFile,
        });
      } else {
        out(`❌ ĐỎ (${run2.durationSec.toFixed(1)}s)`);
        const lastLines = extractLastLines(run2.log, 15);
        results.push({
          script,
          status: "ĐỎ",
          durationSec: totalDuration,
          attempts: 2,
          note: run2.timedOut ? "Hết thời gian (timeout)" : `Mã thoát ${run2.exitCode}`,
          logPath: logFile,
          lastLines,
        });
      }
    } else {
      out(`❌ ĐỎ (${run1.durationSec.toFixed(1)}s)`);
      const lastLines = extractLastLines(run1.log, 15);
      results.push({
        script,
        status: "ĐỎ",
        durationSec: run1.durationSec,
        attempts: 1,
        note:
          (run1.timedOut ? "Hết thời gian (timeout)" : `Mã thoát ${run1.exitCode}`) +
          (options.retry && !retryAllowed(script, options.timeoutSec)
            ? `; không thử lại (hạn chờ > ${RETRY_MAX_TIMEOUT_SEC}s)`
            : ""),
        logPath: logFile,
        lastLines,
      });
    }
  }

  // In bảng kết quả
  out("\n======================================================================");
  out("📊 BẢNG KẾT QUẢ KIỂM THỬ E2E TOÀN DIỆN");
  out("======================================================================\n");
  const table = formatResultTable(results);
  out(table);

  const failureDetails = formatFailureDetails(results);
  if (failureDetails) {
    out(failureDetails);
  }

  out(`\n📂 Thư mục chứa toàn bộ nhật ký (logs): ${options.logsDir}`);

  // Lưu bảng kết quả ra file markdown trong logsDir
  try {
    const reportPath = path.join(options.logsDir, "REPORT.md");
    writeFileSync(reportPath, `# Báo cáo E2E Toàn diện\n\n${table}\n${failureDetails}\n`);
    out(`📝 Đã ghi báo cáo ra tệp: ${reportPath}`);
  } catch {
    // Bỏ qua lỗi ghi tệp báo cáo dự phòng
  }

  const hasFailed = results.some((r) => r.status === "ĐỎ");
  return hasFailed ? 1 : 0;
}

// Chạy trực tiếp nếu là file chính
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  runE2eAll()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error("Lỗi nghiêm trọng khi chạy e2e:all:", err);
      process.exit(1);
    });
}
