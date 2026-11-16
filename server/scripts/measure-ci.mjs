// Đo thời lượng CI: thống kê thời lượng job 'check' và bước 'Test' của các lượt CI gần nhất (Issue #945).
// Cách chạy: node server/scripts/measure-ci.mjs [--limit=50]
/* global console */
import { execSync } from "node:child_process";
import process from "node:process";

async function main() {
  const args = process.argv.slice(2);
  let limit = 50;
  for (const arg of args) {
    if (arg.startsWith("--limit=")) {
      limit = Number.parseInt(arg.slice("--limit=".length), 10) || 50;
    }
  }

  console.log(`Đang lấy danh sách các lượt chạy CI gần nhất (tối đa ${limit + 15} để lọc)...`);
  const rawRuns = execSync(
    `gh run list --workflow=ci.yml -L ${limit + 20} --json databaseId,status,conclusion,createdAt,headBranch,event`,
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
          (new Date(checkJob.completed_at) - new Date(checkJob.started_at)) / 1000,
        );
      }

      const testStep = checkJob.steps?.find((s) => s.name === "Test");
      let testDuration = null;
      if (testStep && testStep.started_at && testStep.completed_at) {
        testDuration = Math.round(
          (new Date(testStep.completed_at) - new Date(testStep.started_at)) / 1000,
        );
      }

      const typecheckStep = checkJob.steps?.find((s) => s.name === "Kiểm tra kiểu");
      let typecheckDuration = null;
      if (typecheckStep && typecheckStep.started_at && typecheckStep.completed_at) {
        typecheckDuration = Math.round(
          (new Date(typecheckStep.completed_at) - new Date(typecheckStep.started_at)) / 1000,
        );
      }

      const formatStep = checkJob.steps?.find((s) => s.name === "Kiểm tra định dạng");
      let formatDuration = null;
      if (formatStep && formatStep.started_at && formatStep.completed_at) {
        formatDuration = Math.round(
          (new Date(formatStep.completed_at) - new Date(formatStep.started_at)) / 1000,
        );
      }

      results.push({
        id: run.databaseId,
        branch: run.headBranch,
        event: run.event,
        createdAt: run.createdAt,
        conclusion: run.conclusion,
        checkConclusion: checkJob.conclusion,
        checkDuration,
        testStepConclusion: testStep?.conclusion ?? "none",
        testDuration,
        typecheckDuration,
        formatDuration,
      });

      process.stdout.write(`.`);
    } catch {
      process.stdout.write(`x`);
    }
  }

  console.log(`\nThu thập xong ${results.length} lượt.`);

  // Tính toán số liệu thống kê
  const successfulChecks = results.filter(
    (r) => r.checkConclusion === "success" && r.checkDuration !== null,
  );
  const checkDurations = successfulChecks.map((r) => r.checkDuration).sort((a, b) => a - b);
  const testDurations = results
    .filter((r) => r.testDuration !== null && r.testStepConclusion === "success")
    .map((r) => r.testDuration)
    .sort((a, b) => a - b);

  function stats(arr) {
    if (arr.length === 0) return { min: 0, avg: 0, median: 0, p95: 0, max: 0 };
    const min = arr[0];
    const max = arr[arr.length - 1];
    const avg = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
    const median = arr[Math.floor(arr.length * 0.5)];
    const p95 = arr[Math.floor(arr.length * 0.95)];
    return { min, avg, median, p95, max };
  }

  const checkStats = stats(checkDurations);
  const testStats = stats(testDurations);

  const totalRuns = results.length;
  const successCount = results.filter((r) => r.conclusion === "success").length;
  const failureCount = results.filter((r) => r.conclusion === "failure").length;
  const cancelledCount = results.filter((r) => r.conclusion === "cancelled").length;

  console.log("\n=================== TỔNG HỢP CI (JOB CHECK & BƯỚC TEST) ===================");
  console.log(`Tổng số lượt phân tích: ${totalRuns}`);
  console.log(`- Thành công (success): ${successCount}`);
  console.log(`- Thất bại (failure): ${failureCount}`);
  console.log(`- Bị huỷ (cancelled): ${cancelledCount}`);
  console.log("\n--- Thời lượng Job 'check' (giây) [chỉ tính các lượt check success] ---");
  console.log(`Mẫu (N): ${checkDurations.length}`);
  console.log(
    `Min: ${checkStats.min}s | TB: ${checkStats.avg}s | Median: ${checkStats.median}s | p95: ${checkStats.p95}s | Max: ${checkStats.max}s`,
  );

  console.log("\n--- Thời lượng Bước 'Test' (giây) [chỉ tính các lượt test success] ---");
  console.log(`Mẫu (N): ${testDurations.length}`);
  console.log(
    `Min: ${testStats.min}s | TB: ${testStats.avg}s | Median: ${testStats.median}s | p95: ${testStats.p95}s | Max: ${testStats.max}s`,
  );

  console.log("\n--- Danh sách chi tiết các lượt gần nhất ---");
  console.log("| ID | Branch | Event | Kết quả | Job check | Bước Test | Typecheck | Prettier |");
  console.log("|---|---|---|---|---:|---:|---:|---:|");
  for (const r of results) {
    console.log(
      `| ${r.id} | \`${r.branch}\` | ${r.event} | ${r.conclusion} (${r.checkConclusion}) | ${r.checkDuration ? r.checkDuration + "s" : "-"} | ${r.testDuration ? r.testDuration + "s" : "-"} | ${r.typecheckDuration ? r.typecheckDuration + "s" : "-"} | ${r.formatDuration ? r.formatDuration + "s" : "-"} |`,
    );
  }
}

main().catch(console.error);
