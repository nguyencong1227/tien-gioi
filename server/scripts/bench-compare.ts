// Script so sánh kết quả benchmark hằng đêm với mốc chuẩn (baseline)
// Dùng trong GitHub Actions (.github/workflows/bench.yml) hoặc chạy tay
// Chạy: npx tsx server/scripts/bench-compare.ts <bench-hunt.json> <bench-crowd.json> [--baseline=<path>] [--threshold=0.15]
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BenchOutput, BenchResult } from "../src/perf/bench";

export interface BenchmarkBaseline {
  version: number;
  description: string;
  seconds: number;
  seed: number;
  hunt: BenchOutput;
  crowd: BenchOutput;
}

export interface ComparisonRow {
  scenario: string;
  players: number;
  baselinePatchBytes: number;
  currentPatchBytes: number;
  bytesDiffPercent: number;
  baselineAvgMs: number;
  currentAvgMs: number;
  isViolation: boolean;
  warningNote?: string;
}

export interface ComparisonReport {
  rows: ComparisonRow[];
  hasFailure: boolean;
  summaryMarkdown: string;
}

/** Tìm kết quả bench cho số người chơi cụ thể */
function findResult(results: BenchResult[], players: number): BenchResult | undefined {
  return results.find((r) => r.players === players);
}

/** So sánh kết quả hiện tại với baseline */
export function compareBenchmarks(
  baseline: BenchmarkBaseline,
  huntCurrent: BenchOutput,
  crowdCurrent: BenchOutput,
  threshold = 0.15,
): ComparisonReport {
  const rows: ComparisonRow[] = [];
  let hasFailure = false;

  const compareGroup = (scenarioName: string, baseGroup: BenchOutput, curGroup: BenchOutput) => {
    const playersList = [0, 10, 50, 100];
    for (const p of playersList) {
      const bRes = findResult(baseGroup.results, p);
      const cRes = findResult(curGroup.results, p);
      if (!bRes || !cRes) continue;

      let bytesDiffPercent = 0;
      if (bRes.patchBytes > 0) {
        bytesDiffPercent = ((cRes.patchBytes - bRes.patchBytes) / bRes.patchBytes) * 100;
      } else if (cRes.patchBytes > 0) {
        bytesDiffPercent = 100;
      }

      // Vi phạm khi ở mức 100 người chơi mà byte/tick tăng vượt ngưỡng cho phép (mặc định 15%)
      const is100p = p === 100;
      const isByteViolation = is100p && bytesDiffPercent > threshold * 100;

      let warningNote: string | undefined;
      if (isByteViolation) {
        warningNote = `Tăng ${bytesDiffPercent.toFixed(1)}% (vượt trần +${(threshold * 100).toFixed(0)}%)`;
        hasFailure = true;
      } else if (is100p && cRes.avgMs > bRes.avgMs * 2.0 && cRes.avgMs > 5.0) {
        warningNote = `CPU tick TB tăng hơn 2 lần (${cRes.avgMs.toFixed(2)} ms vs ${bRes.avgMs.toFixed(2)} ms)`;
      }

      rows.push({
        scenario: scenarioName,
        players: p,
        baselinePatchBytes: bRes.patchBytes,
        currentPatchBytes: cRes.patchBytes,
        bytesDiffPercent,
        baselineAvgMs: bRes.avgMs,
        currentAvgMs: cRes.avgMs,
        isViolation: isByteViolation,
        warningNote,
      });
    }
  };

  compareGroup("Săn quái (hunt)", baseline.hunt, huntCurrent);
  compareGroup("Đám đông (crowd)", baseline.crowd, crowdCurrent);

  // Tạo bảng Markdown
  let md = "## Báo cáo Benchmark Hiệu năng Server\n\n";
  md +=
    "| Kịch bản | Người chơi | Byte/tick (Mốc chuẩn) | Byte/tick (Hiện tại) | Thay đổi byte | Tick TB (Mốc chuẩn) | Tick TB (Hiện tại) | Trạng thái |\n";
  md += "|---|---:|---:|---:|---:|---:|---:|---|\n";

  for (const r of rows) {
    const sign = r.bytesDiffPercent > 0 ? "+" : "";
    const pctStr = `${sign}${r.bytesDiffPercent.toFixed(1)}%`;
    const status = r.isViolation ? "❌ **VƯỢT TRẦN**" : r.warningNote ? "⚠️ Cảnh báo" : "✅ Đạt";
    md += `| ${r.scenario} | ${r.players} | ${Math.round(r.baselinePatchBytes)} | ${Math.round(r.currentPatchBytes)} | ${pctStr} | ${r.baselineAvgMs.toFixed(3)} ms | ${r.currentAvgMs.toFixed(3)} ms | ${status} |\n`;
  }

  md += "\n";
  if (hasFailure) {
    md += `> ❌ **CẢNH BÁO BĂNG THÔNG:** Số byte/tick ở mức 100 người chơi tăng quá ${(threshold * 100).toFixed(0)}% so với mốc chuẩn!\n`;
  } else {
    md += `> ✅ **TẤT CẢ CHỈ SỐ BẢO ĐẢM:** Băng thông byte/tick ở mức 100 người chơi nằm trong ngưỡng an toàn (<= +${(threshold * 100).toFixed(0)}% mốc chuẩn).\n`;
  }

  return { rows, hasFailure, summaryMarkdown: md };
}

function resolveFile(filePath: string): string {
  if (existsSync(filePath)) return resolve(filePath);
  const fromServer = resolve(process.cwd(), "server", filePath);
  if (existsSync(fromServer)) return fromServer;
  return resolve(process.cwd(), filePath);
}

function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));

  if (positional.length < 2) {
    console.error(
      "Cách dùng: npx tsx bench-compare.ts <bench-hunt.json> <bench-crowd.json> [--baseline=<path>] [--threshold=0.15]",
    );
    process.exit(1);
  }

  const huntFile = resolveFile(positional[0]);
  const crowdFile = resolveFile(positional[1]);

  let baselineFile = resolveFile("server/src/perf/bench-baseline.json");
  const baselineArg = args.find((a) => a.startsWith("--baseline="));
  if (baselineArg) {
    baselineFile = resolveFile(baselineArg.slice(11));
  } else if (!existsSync(baselineFile)) {
    baselineFile = resolveFile("src/perf/bench-baseline.json");
  }

  let threshold = 0.15;
  const threshArg = args.find((a) => a.startsWith("--threshold="));
  if (threshArg) {
    threshold = Number(threshArg.slice(12));
  }

  if (!existsSync(huntFile)) {
    console.error(`Không tìm thấy file kết quả săn quái: ${huntFile}`);
    process.exit(1);
  }
  if (!existsSync(crowdFile)) {
    console.error(`Không tìm thấy file kết quả đám đông: ${crowdFile}`);
    process.exit(1);
  }
  if (!existsSync(baselineFile)) {
    console.error(`Không tìm thấy file mốc chuẩn (baseline): ${baselineFile}`);
    process.exit(1);
  }

  const baselineData: BenchmarkBaseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  const huntData: BenchOutput = JSON.parse(readFileSync(huntFile, "utf8"));
  const crowdData: BenchOutput = JSON.parse(readFileSync(crowdFile, "utf8"));

  const report = compareBenchmarks(baselineData, huntData, crowdData, threshold);

  console.log(report.summaryMarkdown);

  // Ghi vào $GITHUB_STEP_SUMMARY nếu đang chạy trong GitHub Actions
  const summaryEnv = process.env.GITHUB_STEP_SUMMARY;
  if (summaryEnv) {
    try {
      appendFileSync(summaryEnv, report.summaryMarkdown, "utf8");
      console.log(`Đã xuất báo cáo vào GITHUB_STEP_SUMMARY: ${summaryEnv}`);
    } catch (err) {
      console.error("Không thể ghi vào GITHUB_STEP_SUMMARY:", err);
    }
  }

  if (report.hasFailure) {
    console.error("\n❌ Workflow thất bại: Băng thông byte/tick ở 100 người tăng vượt ngưỡng 15%!");
    process.exit(1);
  }

  console.log("\n✅ Kiểm tra benchmark thành công: Không có hiện tượng thoái lui hiệu năng.");
}

if (process.argv[1]?.endsWith("bench-compare.ts")) {
  main();
}
