// Bộ chạy toàn bộ 22 script E2E của Tiên Giới một lệnh (M7.16, Issue #694).
// Chạy TUẦN TỰ từng script e2e:* (đọc từ server/package.json), timeout mỗi script,
// tự động dọn sạch toàn bộ cây tiến trình con cháu (tránh mồ côi Chrome detached),
// tự động thử lại 1 lần nếu đỏ (xanh ở lần 2 -> FLAKY), in bảng kết quả Markdown,
// trích dẫn 3-5 dòng log cuối của script đỏ, và ghi log đầy đủ từng script vào thư mục.
//
// Cách dùng:
//   npm run e2e:all -w server
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

export interface E2eAllOptions {
  only?: string[];
  skip?: string[];
  timeoutSec: number;
  logsDir: string;
  build: boolean;
  dryRun: boolean;
  retry: boolean;
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
    }
  }

  if (!options.logsDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    options.logsDir = path.join(os.tmpdir(), `tien-gioi-e2e-${timestamp}`);
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

/** Trích xuất 3-5 dòng cuối của chuỗi log */
export function extractLastLines(logContent: string, count = 5): string[] {
  const lines = logContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
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

/**
 * Liệt kê danh sách tên các mục tạm e2e (tiền tố `tien-gioi-e2e-` hoặc `tg-`) hiện có trong tmpDir.
 * Dùng để chụp snapshot trước khi chạy một kịch bản E2E.
 */
export function getE2eTmpEntries(tmpDir: string = os.tmpdir()): Set<string> {
  try {
    const entries = readdirSync(tmpDir);
    const result = new Set<string>();
    for (const name of entries) {
      if (name.startsWith("tien-gioi-e2e-") || name.startsWith("tg-")) {
        result.add(name);
      }
    }
    return result;
  } catch {
    return new Set<string>();
  }
}

/**
 * Xoá các mục tạm mới sinh ra trong lần chạy (có trong tmpDir nhưng không có trong beforeEntries).
 * Loại trừ excludeDir (ví dụ thư mục logsDir chứa file nhật ký của runner) để không xoá nhầm.
 */
export function cleanupNewTmpEntries(
  beforeEntries: Set<string>,
  excludeDir?: string,
  tmpDir: string = os.tmpdir(),
): string[] {
  const cleaned: string[] = [];
  try {
    const current = readdirSync(tmpDir);
    const normExclude = excludeDir ? path.resolve(excludeDir) : null;

    for (const name of current) {
      if (!name.startsWith("tien-gioi-e2e-") && !name.startsWith("tg-")) {
        continue;
      }
      if (beforeEntries.has(name)) {
        continue;
      }
      const fullPath = path.join(tmpDir, name);
      if (normExclude && path.resolve(fullPath) === normExclude) {
        continue;
      }

      try {
        rmSync(fullPath, { recursive: true, force: true });
        cleaned.push(name);
      } catch {
        // Bỏ qua lỗi xoá từng file tạm
      }
    }
  } catch {
    // Bỏ qua lỗi đọc tmpDir
  }
  return cleaned;
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
  },
): Promise<{ exitCode: number | null; durationSec: number; log: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let timedOut = false;
    let logBuffer = "";
    let cleanupPromise: Promise<void> | null = null;
    const tmpEntriesBefore = getE2eTmpEntries();

    const cmd = options.command?.cmd ?? "npm";
    const args = options.command?.args ?? ["run", scriptName, "-w", "server"];

    const cp = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // tạo process group để quản lý
      env: {
        ...process.env,
        FORCE_COLOR: "0",
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

        // Dọn dẹp các thư mục tạm /tmp/tien-gioi-e2e-* hoặc tg-* mới sinh ra do script bị kill không kịp removeTmpDirs
        await new Promise((r) => setTimeout(r, 200));
        const excludeDir = options.logFile ? path.dirname(options.logFile) : undefined;
        const cleaned = cleanupNewTmpEntries(tmpEntriesBefore, excludeDir);
        if (cleaned.length > 0) {
          logBuffer += `[CLEANUP] Đã dọn dẹp ${cleaned.length} thư mục tạm sau timeout: ${cleaned.join(", ")}\n`;
        }
      }

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
      });
    });

    cp.on("error", (err) => {
      clearTimeout(timer);
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
      });
    });
  });
}

/** Chạy toàn bộ quy trình e2e:all */
export async function runE2eAll(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseCliArgs(args);
  const out = (m: string) => console.log(m);

  out("======================================================================");
  out("🚀 Tiên Giới: Bộ chạy toàn diện E2E (e2e:all)");
  out("======================================================================");

  // Đọc danh sách script
  const pkgJson = JSON.parse(readFileSync(serverPkgPath, "utf-8"));
  const allScripts = getE2eScripts(pkgJson);

  const { selected, skipped } = filterScripts(allScripts, {
    only: options.only,
    skip: options.skip,
  });

  out(
    `Danh sách script E2E: tổng ${allScripts.length} | chọn ${selected.length} | bỏ qua ${skipped.length}`,
  );
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
    for (let i = 0; i < selected.length; i++) {
      out(`  ${i + 1}. ${selected[i]}`);
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

  out(`\nBắt đầu chạy tuần tự ${selected.length} script...\n`);

  for (let i = 0; i < selected.length; i++) {
    const script = selected[i];
    const logFile = path.join(options.logsDir, `${script.replace(/[:/]/g, "-")}.log`);
    const progress = `[${i + 1}/${selected.length}]`;

    process.stdout.write(`${progress} ${script} ... `);

    // Chạy lần 1
    const run1 = await executeScriptOnce(script, {
      cwd: repoRoot,
      timeoutSec: options.timeoutSec,
      logFile,
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

    // Nếu thất bại ở lần 1 và có bật retry
    if (options.retry) {
      process.stdout.write(
        `⚠️ Lần 1 thất bại (${run1.durationSec.toFixed(1)}s). Thử lại lần 2... `,
      );

      const run2 = await executeScriptOnce(script, {
        cwd: repoRoot,
        timeoutSec: options.timeoutSec,
        logFile,
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
        const lastLines = extractLastLines(run2.log, 5);
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
      const lastLines = extractLastLines(run1.log, 5);
      results.push({
        script,
        status: "ĐỎ",
        durationSec: run1.durationSec,
        attempts: 1,
        note: run1.timedOut ? "Hết thời gian (timeout)" : `Mã thoát ${run1.exitCode}`,
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
