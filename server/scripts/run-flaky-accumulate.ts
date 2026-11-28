// Runner tự động chạy đo tích lũy 3 điều kiện (Issue #752).
// Đo tích lũy đủ >= 20 lượt cho mỗi điều kiện:
//  1. parallel: thêm 8 lượt song song (16 bản) -> tổng 20 bản.
//  2. cpu-load: thêm 17 lượt -> tổng 20 lượt.
//  3. idle: thêm 10 lượt -> tổng 20 lượt.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatReportMarkdown, measureFlakyTests } from "./do-test-chap-chon.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

async function main() {
  console.log("=== BẮT ĐẦU CHẠY ĐO TÍCH LŨY 3 ĐIỀU KIỆN (Issue #752) ===");
  const t0 = Date.now();

  // 1. Parallel: 8 lượt song song (= 16 bản, + 4 bản cũ = 20 bản)
  console.log("\n>>> ĐỢT 1: ĐO PARALLEL (8 lượt song song = 16 bản)");
  const parallelPath = path.join(REPO_ROOT, "docs/data/flaky-parallel.json");
  const repParallel = await measureFlakyTests({
    mode: "parallel",
    runs: 8,
    outputJsonPath: parallelPath,
    append: true,
  });
  console.log(formatReportMarkdown(repParallel));

  // 2. CPU-Load: 17 lượt (+ 3 lượt cũ = 20 lượt)
  console.log("\n>>> ĐỢT 2: ĐO CPU-LOAD (17 lượt)");
  const cpuLoadPath = path.join(REPO_ROOT, "docs/data/flaky-cpu-load.json");
  const repCpu = await measureFlakyTests({
    mode: "cpu-load",
    runs: 17,
    workers: 2,
    outputJsonPath: cpuLoadPath,
    append: true,
  });
  console.log(formatReportMarkdown(repCpu));

  // 3. Idle: 10 lượt (+ 10 lượt cũ = 20 lượt)
  console.log("\n>>> ĐỢT 3: ĐO IDLE (10 lượt)");
  const idlePath = path.join(REPO_ROOT, "docs/data/flaky-idle.json");
  const repIdle = await measureFlakyTests({
    mode: "idle",
    runs: 10,
    outputJsonPath: idlePath,
    append: true,
  });
  console.log(formatReportMarkdown(repIdle));

  console.log(
    `\n=== HOÀN TẤT TOÀN BỘ ĐO TÍCH LŨY trong ${((Date.now() - t0) / 1000 / 60).toFixed(1)} phút ===`,
  );
}

main().catch((err) => {
  console.error("LỖI ĐO TÍCH LŨY:", err);
  process.exit(1);
});
