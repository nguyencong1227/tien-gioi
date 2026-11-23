// Đo thời lượng CI: thống kê thời lượng job 'check' (cả dạng cũ và dạng sharded mới) cùng các bước chi tiết (Issue #945, #1377, #1380).
// Cách chạy: node server/scripts/measure-ci.mjs [--limit=50] [--branch=main]
/* global console */
import { execSync } from "node:child_process";
import process from "node:process";

export function getStepDuration(steps, matchFn) {
  const step = steps?.find(matchFn);
  if (!step || !step.started_at || !step.completed_at) return null;
  return Math.max(
    0,
    Math.round(
      (new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) / 1000,
    ),
  );
}

export function getJobDuration(job) {
  if (!job || !job.started_at || !job.completed_at) return null;
  return Math.max(
    0,
    Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000),
  );
}

export function stats(arr) {
  if (!arr || arr.length === 0) return { min: 0, avg: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length);
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { min, avg, median, p95, max };
}

/**
 * Phân tích thời lượng các job của một lượt chạy CI (hỗ trợ cả dạng cũ tuần tự và dạng sharded song song).
 * @param {object} run Dữ liệu lượt chạy từ gh run list
 * @param {Array<object>} jobs Danh sách jobs từ API gh api runs/<id>/jobs
 */
export function analyzeRunJobs(run, jobs = []) {
  const checkJob = jobs.find((j) => j.name === "check");
  const isSharded = jobs.some((j) => j.name === "Lint & Typecheck" || j.name?.startsWith("Test ("));

  // Nhóm các job thuộc pipeline kiểm thử/chất lượng code
  const pipelineJobs = isSharded
    ? jobs.filter(
        (j) =>
          j.name === "check" ||
          j.name === "Lint & Typecheck" ||
          j.name === "Build Client" ||
          j.name?.startsWith("Test ("),
      )
    : checkJob
      ? [checkJob]
      : [];

  let totalDuration = null;
  if (pipelineJobs.length > 0) {
    const completedTimes = pipelineJobs
      .map((j) => (j.completed_at ? new Date(j.completed_at).getTime() : null))
      .filter((t) => t !== null);

    if (completedTimes.length > 0) {
      const maxCompleted = Math.max(...completedTimes);
      // Đo toàn lượt: từ createdAt (hoặc started_at sớm nhất nếu không có createdAt) tới completed_at muộn nhất
      const startTime = run.createdAt
        ? new Date(run.createdAt).getTime()
        : Math.min(
            ...pipelineJobs
              .map((j) => (j.started_at ? new Date(j.started_at).getTime() : Infinity))
              .filter((t) => t !== Infinity),
          );

      if (Number.isFinite(startTime) && maxCompleted >= startTime) {
        totalDuration = Math.round((maxCompleted - startTime) / 1000);
      }
    }
  }

  // Lượt mới (sharded)
  const lintJob = jobs.find((j) => j.name === "Lint & Typecheck");
  const buildJob = jobs.find((j) => j.name === "Build Client");

  const lintDuration = getJobDuration(lintJob);
  const buildJobDuration = getJobDuration(buildJob);
  const checkSummaryDuration = getJobDuration(checkJob);

  // Thu thập động mọi job khớp ^Test \(
  const testJobs = {};
  for (const j of jobs) {
    if (j.name && /^Test \(/i.test(j.name)) {
      testJobs[j.name] = getJobDuration(j);
    }
  }

  const test1Job = jobs.find((j) => j.name === "Test (1/3)");
  const test2Job = jobs.find((j) => j.name === "Test (2/3)");
  const test3Job = jobs.find((j) => j.name === "Test (3/3)");

  const test1Duration = getJobDuration(test1Job);
  const test2Duration = getJobDuration(test2Job);
  const test3Duration = getJobDuration(test3Job);

  // Lượt cũ (steps trong job check)
  const steps = checkJob?.steps || [];
  const checkoutDuration = getStepDuration(
    steps,
    (s) => s.name?.includes("checkout") && !s.name?.startsWith("Post"),
  );
  const setupNodeDuration = getStepDuration(
    steps,
    (s) => s.name?.includes("setup-node") && !s.name?.startsWith("Post"),
  );
  const npmCiDuration = getStepDuration(steps, (s) => s.name?.includes("npm ci"));
  const typecheckDuration = getStepDuration(steps, (s) => s.name?.includes("Kiểm tra kiểu"));
  const lintStepDuration = getStepDuration(steps, (s) => s.name?.includes("Lint"));
  const formatDuration = getStepDuration(steps, (s) => s.name?.includes("Kiểm tra định dạng"));
  const testStep = steps.find((s) => s.name === "Test");
  const testDuration = getStepDuration(steps, (s) => s.name === "Test");
  const buildStepDuration = getStepDuration(steps, (s) => s.name?.includes("Build client"));

  return {
    id: run.databaseId,
    branch: run.headBranch,
    event: run.event,
    createdAt: run.createdAt,
    conclusion: run.conclusion,
    isSharded,
    checkConclusion: checkJob?.conclusion ?? "none",
    totalDuration,
    // Chi tiết sharded
    lintDuration,
    buildJobDuration,
    testJobs,
    test1Duration,
    test2Duration,
    test3Duration,
    checkSummaryDuration,
    // Chi tiết steps cũ
    checkDuration: isSharded ? checkSummaryDuration : checkJob ? getJobDuration(checkJob) : null,
    checkoutDuration,
    setupNodeDuration,
    npmCiDuration,
    typecheckDuration,
    lintStepDuration,
    formatDuration,
    testStepConclusion: testStep?.conclusion ?? "none",
    testDuration,
    buildStepDuration,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let limit = 50;
  let branchFilter = null;
  for (const arg of args) {
    if (arg.startsWith("--limit=")) {
      limit = Number.parseInt(arg.slice("--limit=".length), 10) || 50;
    }
    if (arg.startsWith("--branch=")) {
      branchFilter = arg.slice("--branch=".length);
    }
  }

  const branchMsg = branchFilter ? ` trên nhánh '${branchFilter}'` : "";
  console.log(
    `Đang lấy danh sách các lượt chạy CI gần nhất${branchMsg} (tối đa ${limit + 20} để lọc)...`,
  );
  const branchFlag = branchFilter ? `-b "${branchFilter}"` : "";
  const rawRuns = execSync(
    `gh run list --workflow=ci.yml ${branchFlag} -L ${limit + 25} --json databaseId,status,conclusion,createdAt,headBranch,event`,
    { encoding: "utf-8" },
  );
  const allRuns = JSON.parse(rawRuns);
  const completedRuns = allRuns.filter((r) => r.status === "completed");

  console.log(
    `Tìm thấy ${completedRuns.length} lượt đã hoàn thành. Đang lấy chi tiết từng lượt...`,
  );

  const results = [];

  for (let i = 0; i < completedRuns.length && results.length < limit; i++) {
    const run = completedRuns[i];
    try {
      const rawJobs = execSync(
        `gh api repos/nguyencong1227/tien-gioi/actions/runs/${run.databaseId}/jobs`,
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const jobsData = JSON.parse(rawJobs);
      const res = analyzeRunJobs(run, jobsData.jobs || []);
      if (!res.checkConclusion || res.checkConclusion === "none") continue;

      results.push(res);
      process.stdout.write(`.`);
    } catch {
      process.stdout.write(`x`);
    }
  }

  console.log(`\nThu thập xong ${results.length} lượt.`);

  const successfulRuns = results.filter(
    (r) => r.checkConclusion === "success" && r.totalDuration !== null,
  );

  const shardedRuns = successfulRuns.filter((r) => r.isSharded);
  const legacyRuns = successfulRuns.filter((r) => !r.isSharded);

  const totalRuns = results.length;
  const successCount = results.filter((r) => r.conclusion === "success").length;
  const failureCount = results.filter((r) => r.conclusion === "failure").length;
  const cancelledCount = results.filter((r) => r.conclusion === "cancelled").length;

  console.log("\n=================== TỔNG HỢP CI (TOÀN LƯỢT & TỪNG JOB) ===================");
  console.log(`Tổng số lượt phân tích: ${totalRuns}`);
  console.log(`- Thành công (success): ${successCount}`);
  console.log(`- Thất bại (failure): ${failureCount}`);
  console.log(`- Bị huỷ (cancelled): ${cancelledCount}`);

  if (shardedRuns.length > 0) {
    console.log(
      `\n--- BẢNG THỜI LƯỢNG PIPELINE SHARDED MỚI (${shardedRuns.length} lượt thành công) ---`,
    );
    console.log("| Nhánh kiểm tra / Job | Min | TB | Median | p95 | MAX |");
    console.log("|---|---:|---:|---:|---:|---:|");

    // Thu thập danh sách tên test jobs động
    const dynamicTestJobNames = Array.from(
      new Set(shardedRuns.flatMap((r) => Object.keys(r.testJobs || {}))),
    ).sort();

    const shardedRows = [
      {
        name: "Lint & Typecheck",
        s: stats(shardedRuns.map((r) => r.lintDuration).filter(Boolean)),
      },
      {
        name: "Build Client",
        s: stats(shardedRuns.map((r) => r.buildJobDuration).filter(Boolean)),
      },
      ...dynamicTestJobNames.map((name) => ({
        name,
        s: stats(shardedRuns.map((r) => r.testJobs?.[name]).filter(Boolean)),
      })),
      {
        name: "check (tổng hợp)",
        s: stats(shardedRuns.map((r) => r.checkSummaryDuration).filter(Boolean)),
      },
      {
        name: "**TOÀN LƯỢT KIỂM TRA (wall-clock)**",
        s: stats(shardedRuns.map((r) => r.totalDuration).filter(Boolean)),
      },
    ];
    for (const row of shardedRows) {
      console.log(
        `| ${row.name} | ${row.s.min}s | ${row.s.avg}s | ${row.s.median}s | ${row.s.p95}s | **${row.s.max}s** |`,
      );
    }
  }

  if (legacyRuns.length > 0) {
    console.log(
      `\n--- BẢNG THỜI LƯỢNG PIPELINE CŨ TUẦN TỰ (${legacyRuns.length} lượt thành công) ---`,
    );
    console.log("| Bước trong job check | Min | TB | Median | p95 | MAX |");
    console.log("|---|---:|---:|---:|---:|---:|");
    const legacyRows = [
      {
        name: "1. actions/checkout@v4",
        s: stats(legacyRuns.map((r) => r.checkoutDuration).filter(Boolean)),
      },
      {
        name: "2. actions/setup-node@v4",
        s: stats(legacyRuns.map((r) => r.setupNodeDuration).filter(Boolean)),
      },
      { name: "3. npm ci", s: stats(legacyRuns.map((r) => r.npmCiDuration).filter(Boolean)) },
      {
        name: "4. Kiểm tra kiểu",
        s: stats(legacyRuns.map((r) => r.typecheckDuration).filter(Boolean)),
      },
      { name: "5. Lint", s: stats(legacyRuns.map((r) => r.lintStepDuration).filter(Boolean)) },
      {
        name: "6. Kiểm tra định dạng",
        s: stats(legacyRuns.map((r) => r.formatDuration).filter(Boolean)),
      },
      {
        name: "7. Test (vitest đơn)",
        s: stats(legacyRuns.map((r) => r.testDuration).filter(Boolean)),
      },
      {
        name: "8. Build client",
        s: stats(legacyRuns.map((r) => r.buildStepDuration).filter(Boolean)),
      },
      {
        name: "**TỔNG CẢ JOB CHECK CŨ**",
        s: stats(legacyRuns.map((r) => r.totalDuration).filter(Boolean)),
      },
    ];
    for (const row of legacyRows) {
      console.log(
        `| ${row.name} | ${row.s.min}s | ${row.s.avg}s | ${row.s.median}s | ${row.s.p95}s | **${row.s.max}s** |`,
      );
    }
  }

  console.log("\n--- Danh sách chi tiết các lượt gần nhất ---");
  console.log("| ID | Branch | Kiểu | Kết quả | Toàn lượt | Shard 1 | Shard 2 | Shard 3 | check |");
  console.log("|---|---|---|---|---:|---:|---:|---:|---:|");
  for (const r of results) {
    const kieu = r.isSharded ? "sharded" : "cũ";
    const s1 = r.test1Duration ? r.test1Duration + "s" : "-";
    const s2 = r.test2Duration ? r.test2Duration + "s" : "-";
    const s3 = r.test3Duration ? r.test3Duration + "s" : "-";
    const chk = r.checkDuration ? r.checkDuration + "s" : "-";
    console.log(
      `| ${r.id} | \`${r.branch}\` | ${kieu} | ${r.conclusion} (${r.checkConclusion}) | ${r.totalDuration ? r.totalDuration + "s" : "-"} | ${s1} | ${s2} | ${s3} | ${chk} |`,
    );
  }
}

// Chạy trực tiếp qua CLI
const isDirectCall =
  process.argv[1] &&
  (process.argv[1].endsWith("measure-ci.mjs") || process.argv[1].endsWith("measure-ci"));

if (isDirectCall) {
  main().catch(console.error);
}
