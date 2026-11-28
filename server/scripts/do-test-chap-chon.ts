// Công cụ đo và thống kê test chập chờn (Issue #752).
// Đo tỉ lệ đỏ thật của `npm test` toàn bộ qua >= 20 lần ở 3 điều kiện:
//  1. Máy rảnh (idle)
//  2. Có thêm tải CPU nền (cpu-load)
//  3. Hai bản vitest chạy song song (parallel)
//
// Cách dùng:
//   npx tsx server/scripts/do-test-chap-chon.ts --mode=idle --runs=20
//   npx tsx server/scripts/do-test-chap-chon.ts --mode=cpu-load --runs=20 --workers=2
//   npx tsx server/scripts/do-test-chap-chon.ts --mode=parallel --runs=10
//   npx tsx server/scripts/do-test-chap-chon.ts --pattern=server/src/rooms/WorldRoom --runs=10

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

export type MeasurementMode = "idle" | "cpu-load" | "parallel";

export interface TestFailure {
  suiteFile: string;
  testTitle: string;
  errorMessage: string;
  durationMs: number;
}

export interface RunSummary {
  runIndex: number;
  mode: MeasurementMode;
  success: boolean;
  durationMs: number;
  totalSuites: number;
  failedSuites: number;
  totalTests: number;
  failedTests: number;
  failures: TestFailure[];
}

export interface SuiteStats {
  suiteFile: string;
  totalRuns: number;
  failedRuns: number;
  failureRatePct: number;
  avgDurationMs: number;
  failedTestTitles: Record<string, number>;
  sampleErrors: Record<string, string>;
}

export interface BatchReport {
  mode: MeasurementMode;
  timestamp: string;
  runsTarget: number;
  runsCompleted: number;
  avgRunDurationSec: number;
  flakySuitesCount: number;
  stableSuitesCount: number;
  suiteStats: SuiteStats[];
  runs: RunSummary[];
}

export interface MeasureOptions {
  mode?: MeasurementMode;
  runs?: number;
  workers?: number;
  pattern?: string;
  outputJsonPath?: string;
  append?: boolean;
}

function parseCliArgs(): MeasureOptions {
  const args = process.argv.slice(2);
  let mode: MeasurementMode = "idle";
  let runs = 20;
  let workers = 2;
  let pattern: string | undefined;
  let outputJsonPath: string | undefined;
  let append = false;

  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const val = arg.split("=")[1] as MeasurementMode;
      if (val === "idle" || val === "cpu-load" || val === "parallel") mode = val;
    } else if (arg.startsWith("--runs=")) {
      const val = Number(arg.split("=")[1]);
      if (Number.isFinite(val) && val > 0) runs = Math.round(val);
    } else if (arg.startsWith("--workers=")) {
      const val = Number(arg.split("=")[1]);
      if (Number.isFinite(val) && val > 0) workers = Math.round(val);
    } else if (arg.startsWith("--pattern=")) {
      pattern = arg.split("=")[1];
    } else if (arg.startsWith("--out=")) {
      outputJsonPath = arg.split("=")[1];
    } else if (arg === "--append" || arg === "--merge") {
      append = true;
    }
  }

  return { mode, runs, workers, pattern, outputJsonPath, append };
}

function runVitestInstance(
  pattern: string | undefined,
  outputFile: string,
): Promise<{ exitCode: number; durationMs: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const vitestArgs = ["vitest", "run"];
    if (pattern) vitestArgs.push(pattern);
    vitestArgs.push("--reporter=json", `--outputFile=${outputFile}`);

    const proc = spawn("npx", vitestArgs, {
      cwd: REPO_ROOT,
      env: { ...process.env, CI: "true" },
      stdio: "pipe",
    });

    proc.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 0, durationMs: Date.now() - t0 });
    });
  });
}

function parseVitestJson(
  filePath: string,
  runIndex: number,
  mode: MeasurementMode,
  durationMs: number,
): RunSummary {
  if (!existsSync(filePath)) {
    return {
      runIndex,
      mode,
      success: false,
      durationMs,
      totalSuites: 0,
      failedSuites: 0,
      totalTests: 0,
      failedTests: 0,
      failures: [
        {
          suiteFile: "UNKNOWN",
          testTitle: "Không tìm thấy tệp JSON báo cáo",
          errorMessage: `Vitest không sinh được file ${filePath}`,
          durationMs,
        },
      ],
    };
  }

  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    const failures: TestFailure[] = [];

    const testResults = (raw.testResults as any[]) ?? [];
    let failedSuitesCount = 0;

    for (const suite of testResults) {
      const relPath = path.relative(REPO_ROOT, suite.name);
      const isSuiteFailed = suite.status === "failed";
      if (isSuiteFailed) failedSuitesCount++;

      for (const assertion of suite.assertionResults ?? []) {
        if (assertion.status === "failed") {
          const title = assertion.ancestorTitles?.length
            ? `${assertion.ancestorTitles.join(" > ")} > ${assertion.title}`
            : assertion.title;
          const msg = (assertion.failureMessages ?? []).join("\n") || "Test failed";
          failures.push({
            suiteFile: relPath,
            testTitle: title,
            errorMessage: msg.slice(0, 500),
            durationMs: assertion.duration ?? 0,
          });
        }
      }
    }

    return {
      runIndex,
      mode,
      success: raw.success === true && failures.length === 0,
      durationMs,
      totalSuites: testResults.length,
      failedSuites: failedSuitesCount,
      totalTests: raw.numTotalTests ?? 0,
      failedTests: raw.numFailedTests ?? failures.length,
      failures,
    };
  } catch (err: any) {
    return {
      runIndex,
      mode,
      success: false,
      durationMs,
      totalSuites: 0,
      failedSuites: 1,
      totalTests: 0,
      failedTests: 1,
      failures: [
        {
          suiteFile: "PARSE_ERROR",
          testTitle: "Lỗi parse file json vitest",
          errorMessage: String(err?.message ?? err),
          durationMs,
        },
      ],
    };
  }
}

export async function measureFlakyTests(opts: MeasureOptions = {}): Promise<BatchReport> {
  const mode = opts.mode ?? "idle";
  const runs = opts.runs ?? 20;
  const workersCount = opts.workers ?? 2;
  const pattern = opts.pattern;

  console.log(`================================================================================`);
  console.log(`        BẮT ĐẦU ĐO TEST CHẬP CHỜN (Issue #752)`);
  console.log(
    `  Chế độ: ${mode.toUpperCase()} | Số lượt: ${runs} | Tệp lọc: ${pattern ?? "Tất cả"}`,
  );
  if (mode === "cpu-load") {
    console.log(`  Tải CPU: ${workersCount} background worker threads tính toán`);
  }
  console.log(`================================================================================\n`);

  // Quản lý CPU burner workers nếu mode === 'cpu-load'
  const workers: Worker[] = [];
  if (mode === "cpu-load") {
    const workerScript = path.join(__dirname, "cpu-burner-worker.js");
    for (let w = 0; w < workersCount; w++) {
      workers.push(new Worker(workerScript));
    }
    console.log(`[CPU-LOAD] Đã khởi chạy ${workers.length} workers tính toán nền.\n`);
  }

  // Nạp các runs cũ nếu có --append
  let prevRuns: RunSummary[] = [];
  let prevRunsTarget = 0;
  if (opts.append && opts.outputJsonPath && existsSync(opts.outputJsonPath)) {
    try {
      const prevData = JSON.parse(readFileSync(opts.outputJsonPath, "utf8")) as BatchReport;
      if (Array.isArray(prevData.runs)) {
        prevRuns = prevData.runs;
        prevRunsTarget = prevData.runsTarget ?? prevData.runs.length;
        console.log(
          `[APPEND] Đã nạp ${prevRuns.length} lượt đo trước đó, mục tiêu tổng: ${prevRunsTarget + runs} lượt.\n`,
        );
      }
    } catch {
      // bỏ qua nếu file cũ hỏng
    }
  }

  const runSummaries: RunSummary[] = [];
  const tmpFilesToClean: string[] = [];

  try {
    for (let i = 1; i <= runs; i++) {
      const now = Date.now();
      if (mode === "parallel") {
        // Chạy 2 bản vitest song song cùng lúc
        const fileA = `/tmp/vitest-meas-${now}-${i}-A.json`;
        const fileB = `/tmp/vitest-meas-${now}-${i}-B.json`;
        tmpFilesToClean.push(fileA, fileB);

        const [resA, resB] = await Promise.all([
          runVitestInstance(pattern, fileA),
          runVitestInstance(pattern, fileB),
        ]);

        const summaryA = parseVitestJson(fileA, i * 2 - 1, mode, resA.durationMs);
        const summaryB = parseVitestJson(fileB, i * 2, mode, resB.durationMs);
        runSummaries.push(summaryA, summaryB);

        const passedBoth = summaryA.success && summaryB.success;
        const icon = passedBoth ? "✅" : "❌";
        console.log(
          `[Lượt ${i}/${runs} Song song] ${icon} Bản A: ${summaryA.success ? "XANH" : "ĐỎ"} (${(resA.durationMs / 1000).toFixed(1)}s) | Bản B: ${summaryB.success ? "XANH" : "ĐỎ"} (${(resB.durationMs / 1000).toFixed(1)}s)`,
        );

        for (const s of [summaryA, summaryB]) {
          if (!s.success) {
            for (const f of s.failures) {
              console.log(`   -> [${f.suiteFile}] ${f.testTitle}`);
            }
          }
        }
      } else {
        // Chế độ idle hoặc cpu-load
        const file = `/tmp/vitest-meas-${now}-${i}.json`;
        tmpFilesToClean.push(file);

        const res = await runVitestInstance(pattern, file);
        const summary = parseVitestJson(file, i, mode, res.durationMs);
        runSummaries.push(summary);

        const icon = summary.success ? "✅" : "❌";
        console.log(
          `[Lượt ${i}/${runs}] ${icon} ${summary.success ? "XANH" : "ĐỎ"} (${summary.totalSuites - summary.failedSuites}/${summary.totalSuites} tệp) | Thời gian: ${(res.durationMs / 1000).toFixed(1)}s`,
        );

        if (!summary.success) {
          for (const f of summary.failures) {
            console.log(`   -> [${f.suiteFile}] ${f.testTitle}`);
          }
        }
      }

      // Lưu ngay kết quả trung gian sau mỗi lượt để bảo toàn dữ liệu khi có gián đoạn
      if (opts.outputJsonPath) {
        try {
          const intermediate = summarizeBatchReport(mode, prevRunsTarget + runs, [
            ...prevRuns,
            ...runSummaries,
          ]);
          writeFileSync(opts.outputJsonPath, JSON.stringify(intermediate, null, 2) + "\n", "utf8");
        } catch {
          // bỏ qua lỗi ghi đĩa tạm thời
        }
      }
    }
  } finally {
    // Dừng worker threads
    for (const w of workers) {
      w.postMessage("stop");
      w.terminate().catch(() => {});
    }
    // Dọn file tạm
    for (const f of tmpFilesToClean) {
      rmSync(f, { force: true });
    }
  }

  const allRuns = [...prevRuns, ...runSummaries];
  return summarizeBatchReport(mode, prevRunsTarget + runs, allRuns);
}

export function summarizeBatchReport(
  mode: MeasurementMode,
  runsTarget: number,
  runSummaries: RunSummary[],
): BatchReport {
  // Tổng hợp thống kê theo tệp test
  const suiteMap = new Map<
    string,
    {
      totalRuns: number;
      failedRuns: number;
      durations: number[];
      failedTestTitles: Record<string, number>;
      sampleErrors: Record<string, string>;
    }
  >();

  const totalRunsCount = runSummaries.length;
  runSummaries.forEach((r, idx) => {
    r.runIndex = idx + 1;
  });

  for (const r of runSummaries) {
    const failedSuitesThisRun = new Set<string>();

    for (const f of r.failures) {
      failedSuitesThisRun.add(f.suiteFile);
      let entry = suiteMap.get(f.suiteFile);
      if (!entry) {
        entry = {
          totalRuns: totalRunsCount,
          failedRuns: 0,
          durations: [],
          failedTestTitles: {},
          sampleErrors: {},
        };
        suiteMap.set(f.suiteFile, entry);
      }
      entry.failedTestTitles[f.testTitle] = (entry.failedTestTitles[f.testTitle] ?? 0) + 1;
      if (!entry.sampleErrors[f.testTitle]) {
        entry.sampleErrors[f.testTitle] = f.errorMessage;
      }
    }

    for (const sf of failedSuitesThisRun) {
      const entry = suiteMap.get(sf);
      if (entry) entry.failedRuns++;
    }
  }

  const suiteStats: SuiteStats[] = [];
  suiteMap.forEach((data, suiteFile) => {
    suiteStats.push({
      suiteFile,
      totalRuns: totalRunsCount,
      failedRuns: data.failedRuns,
      failureRatePct: Math.round((data.failedRuns / totalRunsCount) * 1000) / 10,
      avgDurationMs:
        data.durations.length > 0
          ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length)
          : 0,
      failedTestTitles: data.failedTestTitles,
      sampleErrors: data.sampleErrors,
    });
  });

  // Sắp xếp tệp chập chờn theo tỉ lệ đỏ giảm dần
  suiteStats.sort((a, b) => b.failedRuns - a.failedRuns);

  const totalDurMs = runSummaries.reduce((a, b) => a + b.durationMs, 0);
  const avgRunDurationSec = Math.round((totalDurMs / totalRunsCount / 1000) * 10) / 10;
  const flakyCount = suiteStats.filter((s) => s.failedRuns > 0).length;
  const maxTotalSuites = Math.max(...runSummaries.map((r) => r.totalSuites), 0);

  const report: BatchReport = {
    mode,
    timestamp: new Date().toISOString(),
    runsTarget,
    runsCompleted: totalRunsCount,
    avgRunDurationSec,
    flakySuitesCount: flakyCount,
    stableSuitesCount: maxTotalSuites - flakyCount,
    suiteStats,
    runs: runSummaries,
  };

  return report;
}

export function formatReportMarkdown(report: BatchReport): string {
  const lines: string[] = [];
  lines.push(`### Kết quả đo điều kiện: **${report.mode.toUpperCase()}** (${report.timestamp})`);
  lines.push(`- **Tổng số lượt chạy**: ${report.runsCompleted}`);
  lines.push(`- **Thời gian trung bình mỗi lượt**: ${report.avgRunDurationSec}s`);
  lines.push(`- **Số tệp ĐẠT 100%**: ${report.stableSuitesCount}`);
  lines.push(`- **Số tệp có lần ĐỎ (chập chờn)**: ${report.flakySuitesCount}`);
  lines.push("");

  if (report.flakySuitesCount === 0) {
    lines.push(
      `> ✅ **TẤT CẢ TỆP TEST ĐỀU ĐẠT 100% (${report.runsCompleted}/${report.runsCompleted})** trong điều kiện này.`,
    );
  } else {
    lines.push("| Tệp test | Số lần ĐỎ / Tổng | Tỉ lệ ĐỎ (%) | Test case bị lỗi |");
    lines.push("|---|:---:|:---:|---|");
    for (const st of report.suiteStats) {
      if (st.failedRuns === 0) continue;
      const testNames = Object.keys(st.failedTestTitles)
        .map((t) => `\`${t}\` (${st.failedTestTitles[t]} lần)`)
        .join("<br/>");
      lines.push(
        `| \`${st.suiteFile}\` | **${st.failedRuns}/${st.totalRuns}** | **${st.failureRatePct}%** | ${testNames} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

// Chạy trực tiếp từ CLI
if (
  process.argv[1]?.endsWith("do-test-chap-chon.ts") ||
  process.argv[1]?.endsWith("do-test-chap-chon")
) {
  const opts = parseCliArgs();
  measureFlakyTests(opts)
    .then((report) => {
      console.log("\n" + formatReportMarkdown(report));
      const dataDir = path.join(REPO_ROOT, "docs/data");
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
      const outPath =
        opts.outputJsonPath ?? path.join(dataDir, `flaky-${opts.mode ?? "idle"}.json`);
      writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
      console.log(`Đã lưu kết quả chi tiết vào: ${outPath}\n`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[LỖI ĐO TEST]", err);
      process.exit(1);
    });
}
