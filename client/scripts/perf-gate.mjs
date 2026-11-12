/* global console, process */
/**
 * Cổng đỏ / xanh cho kết quả `perf:mobile` (M5.1, #330 tiêu chí 4): so từng kịch bản với client/perf-budget.json.
 * Chạy hằng đêm trong .github/workflows/bench.yml sau `npm run perf:mobile`; chạy tay:
 *   node client/scripts/perf-gate.mjs [docs/perf-mobile-results.json] [--budget client/perf-budget.json]
 *                                     [--time-slack 1.5] [--summary tệp.md]
 *
 * Chỉ chặn trên số đo TIN ĐƯỢC của harness: thời gian `update` p95 của cảnh (JS), số hạt sống, số emitter.
 * KHÔNG chặn trên FPS (headless SwiftShader không phản ánh GPU thật) và KHÔNG chặn trên `drawCalls`
 * (harness hiện GÁN CỨNG theo tên kịch bản, chưa đo thật: xem ghi chú trong bản tóm tắt).
 * `--time-slack` (hoặc biến PERF_TIME_SLACK) nhân hệ số vào ngân sách thời gian để bù runner CI chậm hơn máy dev;
 * số hạt / emitter là đếm tất định nên KHÔNG nới.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");

const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * @param {any[]} results mảng kết quả của measure-mobile-perf.mjs
 * @param {any} budget nội dung client/perf-budget.json
 * @param {{ timeSlack?: number }} [opts]
 * @returns {{ ok: boolean, violations: {id: string, metric: string, actual: number | string, limit: number | string}[], rows: any[] }}
 */
export function evaluatePerfResults(results, budget, { timeSlack = 1 } = {}) {
  const violations = [];
  const rows = [];
  if (!Array.isArray(results) || results.length === 0) {
    violations.push({ id: "(tất cả)", metric: "kết quả", actual: "rỗng", limit: ">= 1 kịch bản" });
    return { ok: false, violations, rows };
  }
  if (!(timeSlack >= 1)) throw new Error(`time-slack phải >= 1 (nhận ${timeSlack})`);
  for (const r of results) {
    const id = String(r?.id ?? "?");
    const tier = budget?.runtime?.tiers?.[r?.tier];
    const row = { id, scenario: r?.scenario, tier: r?.tier, cpu: r?.cpu, fps: r?.fpsAvg, bad: [] };
    rows.push(row);
    if (!tier) {
      violations.push({
        id,
        metric: "bậc đồ hoạ",
        actual: String(r?.tier),
        limit: "low | mid | high",
      });
      row.bad.push("bậc");
      continue;
    }
    const checks = [
      ["JS update p95 (ms)", r.updateP95Ms, tier.jsFrameP95Ms * timeSlack, "ms"],
      ["số hạt sống", r.particles, tier.peakParticles, "hạt"],
      ["số emitter", r.emitters, tier.emitterBudget, "emitter"],
    ];
    row.p95 = r.updateP95Ms;
    row.p95Limit = tier.jsFrameP95Ms * timeSlack;
    row.particles = r.particles;
    row.particleLimit = tier.peakParticles;
    row.emitters = r.emitters;
    row.emitterLimit = tier.emitterBudget;
    for (const [metric, actual, limit] of checks) {
      if (!isNum(actual)) {
        violations.push({ id, metric, actual: String(actual), limit: `số <= ${limit}` });
        row.bad.push(metric);
      } else if (actual > limit) {
        violations.push({ id, metric, actual, limit });
        row.bad.push(metric);
      }
    }
  }
  return { ok: violations.length === 0, violations, rows };
}

/** Bản tóm tắt Markdown (job summary của GitHub Actions). */
export function formatSummary(evaluation, { timeSlack = 1 } = {}) {
  const lines = [
    "### Hiệu năng di động (perf:mobile) so với `client/perf-budget.json`",
    "",
    evaluation.ok
      ? "✅ Mọi kịch bản nằm trong ngân sách."
      : `❌ ${evaluation.violations.length} chỉ số vượt ngân sách.`,
    "",
    "| Kịch bản | Bậc | CPU | JS update p95 | Hạt | Emitter | FPS | |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const r of evaluation.rows) {
    const f = (v) => (v === undefined || v === null ? "?" : String(v));
    lines.push(
      `| ${f(r.scenario ?? r.id)} (\`${r.id}\`) | ${f(r.tier)} | ${f(r.cpu)} | ${f(r.p95)} / ${f(r.p95Limit)} ms | ${f(r.particles)} / ${f(r.particleLimit)} | ${f(r.emitters)} / ${f(r.emitterLimit)} | ${f(r.fps)} | ${r.bad.length ? "❌ " + r.bad.join(", ") : "✅"} |`,
    );
  }
  if (!evaluation.ok) {
    lines.push("", "**Vi phạm:**");
    for (const v of evaluation.violations) {
      lines.push(`- \`${v.id}\`: ${v.metric} = ${v.actual} (giới hạn ${v.limit})`);
    }
  }
  lines.push(
    "",
    `Ngân sách thời gian nhân hệ số \`time-slack\` = ${timeSlack} (bù runner CI chậm hơn máy dev); số hạt / emitter không nới.`,
    "Không chặn trên FPS (SwiftShader không phản ánh GPU thật) và `drawCalls` (harness đang gán cứng theo tên kịch bản, chưa đo thật).",
  );
  return lines.join("\n") + "\n";
}

function argOf(args, flag) {
  const eq = args.find((a) => a.startsWith(`--${flag}=`));
  if (eq) return eq.slice(flag.length + 3);
  const i = args.indexOf(`--${flag}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

if (process.argv[1] === __filename) {
  const args = process.argv.slice(2);
  const valueFlags = new Set(["--budget", "--time-slack", "--summary"]);
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !valueFlags.has(args[i - 1] ?? ""),
  );
  const resultsPath = path.resolve(REPO, positional[0] ?? "docs/perf-mobile-results.json");
  const budgetPath = path.resolve(REPO, argOf(args, "budget") ?? "client/perf-budget.json");
  const slackRaw = argOf(args, "time-slack") ?? process.env.PERF_TIME_SLACK ?? "1";
  const timeSlack = Number(slackRaw);
  const summaryPath = argOf(args, "summary") ?? process.env.GITHUB_STEP_SUMMARY ?? null;
  try {
    if (!Number.isFinite(timeSlack) || timeSlack < 1) {
      throw new Error(`time-slack không hợp lệ: "${slackRaw}" (cần số >= 1)`);
    }
    const results = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
    const evaluation = evaluatePerfResults(results, budget, { timeSlack });
    const md = formatSummary(evaluation, { timeSlack });
    console.log(md);
    if (summaryPath) fs.appendFileSync(summaryPath, md, "utf8");
    if (!evaluation.ok) {
      for (const v of evaluation.violations) {
        console.error(`✗ ${v.id}: ${v.metric} = ${v.actual} (giới hạn ${v.limit})`);
      }
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("[perf-gate] Lỗi:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
