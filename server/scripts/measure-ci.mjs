// Đo thời lượng CI: thống kê thời lượng job 'check' và các bước chi tiết của các lượt CI gần nhất (Issue #945).
// Cách chạy: node server/scripts/measure-ci.mjs [--limit=50]
/* global console */
import { execSync } from "node:child_process";
import process from "node:process";

function getStepDuration(steps, matchFn) {
  const step = steps?.find(matchFn);
  if (!step || !step.started_at || !step.completed_at) return null;
  return Math.max(
    0,
    Math.round(
      (new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) / 1000,
    ),
  );
}

function stats(arr) {
  if (!arr || arr.length === 0) return { min: 0, avg: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length);
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { min, avg, median, p95, max };
}

async function main() {
  const args = process.argv.slice(2);
  let limit = 50;
  for (const arg of args) {
    if (arg.startsWith("--limit=")) {
      limit = Number.parseInt(arg.slice("--limit=".length), 10) || 50;
    }
  }

  console.log(`Đang lấy danh sách các lượt chạy CI gần nhất (tối đa ${limit + 20} để lọc)...`);
  const rawRuns = execSync(
    `gh run list --workflow=ci.yml -L ${limit + 25} --json databaseId,status,conclusion,createdAt,headBranch,event`,
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
      const checkJob = jobsData.jobs?.find((j) => j.name === "check");
      if (!checkJob) continue;

      let checkDuration = null;
      if (checkJob.started_at && checkJob.completed_at) {
        checkDuration = Math.round(
          (new Date(checkJob.completed_at).getTime() - new Date(checkJob.started_at).getTime()) /
            1000,
        );
      }

      const steps = checkJob.steps || [];
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
      const lintDuration = getStepDuration(steps, (s) => s.name?.includes("Lint"));
      const formatDuration = getStepDuration(steps, (s) => s.name?.includes("Kiểm tra định dạng"));
      const testStep = steps.find((s) => s.name === "Test");
      const testDuration = getStepDuration(steps, (s) => s.name === "Test");
      const buildDuration = getStepDuration(steps, (s) => s.name?.includes("Build client"));

      results.push({
        id: run.databaseId,
        branch: run.headBranch,
        event: run.event,
        createdAt: run.createdAt,
        conclusion: run.conclusion,
        checkConclusion: checkJob.conclusion,
        checkDuration,
        checkoutDuration,
        setupNodeDuration,
        npmCiDuration,
        typecheckDuration,
        lintDuration,
        formatDuration,
        testStepConclusion: testStep?.conclusion ?? "none",
        testDuration,
        buildDuration,
      });

      process.stdout.write(`.`);
    } catch {
      process.stdout.write(`x`);
    }
  }

  console.log(`\nThu thập xong ${results.length} lượt.`);

  // Tính toán số liệu thống kê cho các lượt check thành công
  const successfulChecks = results.filter(
    (r) => r.checkConclusion === "success" && r.checkDuration !== null,
  );

  const checkDurations = successfulChecks.map((r) => r.checkDuration);
  const checkoutDurations = successfulChecks
    .map((r) => r.checkoutDuration)
    .filter((d) => d !== null);
  const setupNodeDurations = successfulChecks
    .map((r) => r.setupNodeDuration)
    .filter((d) => d !== null);
  const npmCiDurations = successfulChecks.map((r) => r.npmCiDuration).filter((d) => d !== null);
  const typecheckDurations = successfulChecks
    .map((r) => r.typecheckDuration)
    .filter((d) => d !== null);
  const lintDurations = successfulChecks.map((r) => r.lintDuration).filter((d) => d !== null);
  const formatDurations = successfulChecks.map((r) => r.formatDuration).filter((d) => d !== null);
  const testDurations = successfulChecks.map((r) => r.testDuration).filter((d) => d !== null);
  const buildDurations = successfulChecks.map((r) => r.buildDuration).filter((d) => d !== null);

  const checkStats = stats(checkDurations);
  const checkoutStats = stats(checkoutDurations);
  const setupNodeStats = stats(setupNodeDurations);
  const npmCiStats = stats(npmCiDurations);
  const typecheckStats = stats(typecheckDurations);
  const lintStats = stats(lintDurations);
  const formatStats = stats(formatDurations);
  const testStats = stats(testDurations);
  const buildStats = stats(buildDurations);

  const totalRuns = results.length;
  const successCount = results.filter((r) => r.conclusion === "success").length;
  const failureCount = results.filter((r) => r.conclusion === "failure").length;
  const cancelledCount = results.filter((r) => r.conclusion === "cancelled").length;

  console.log("\n=================== TỔNG HỢP CI (JOB CHECK & CÁC BƯỚC) ===================");
  console.log(`Tổng số lượt phân tích: ${totalRuns}`);
  console.log(`- Thành công (success): ${successCount}`);
  console.log(`- Thất bại (failure): ${failureCount}`);
  console.log(`- Bị huỷ (cancelled): ${cancelledCount}`);

  console.log("\n--- BẢNG PHÂN BỐ THỜI LƯỢNG TỪNG BƯỚC TRONG JOB 'CHECK' (giây) ---");
  console.log("| Bước | Min | TB | Median | p95 | MAX | Tỉ lệ TB/Job |");
  console.log("|---|---:|---:|---:|---:|---:|---:|");
  const stepRows = [
    { name: "1. actions/checkout@v4", s: checkoutStats },
    { name: "2. actions/setup-node@v4", s: setupNodeStats },
    { name: "3. npm ci", s: npmCiStats },
    { name: "4. Kiểm tra kiểu (typecheck)", s: typecheckStats },
    { name: "5. Lint", s: lintStats },
    { name: "6. Kiểm tra định dạng (prettier)", s: formatStats },
    { name: "7. Test (vitest)", s: testStats },
    { name: "8. Build client", s: buildStats },
    { name: "**TỔNG CẢ JOB CHECK**", s: checkStats },
  ];
  for (const row of stepRows) {
    const ratio = checkStats.avg > 0 ? ((row.s.avg / checkStats.avg) * 100).toFixed(1) + "%" : "-";
    console.log(
      `| ${row.name} | ${row.s.min}s | ${row.s.avg}s | ${row.s.median}s | ${row.s.p95}s | **${row.s.max}s** | ${ratio} |`,
    );
  }

  console.log("\n--- Danh sách chi tiết các lượt gần nhất ---");
  console.log(
    "| ID | Branch | Event | Kết quả | Job check | Checkout | npm ci | Typecheck | Test |",
  );
  console.log("|---|---|---|---|---:|---:|---:|---:|---:|");
  for (const r of results) {
    console.log(
      `| ${r.id} | \`${r.branch}\` | ${r.event} | ${r.conclusion} (${r.checkConclusion}) | ${r.checkDuration ? r.checkDuration + "s" : "-"} | ${r.checkoutDuration ? r.checkoutDuration + "s" : "-"} | ${r.npmCiDuration ? r.npmCiDuration + "s" : "-"} | ${r.typecheckDuration ? r.typecheckDuration + "s" : "-"} | ${r.testDuration ? r.testDuration + "s" : "-"} |`,
    );
  }
}

main().catch(console.error);
