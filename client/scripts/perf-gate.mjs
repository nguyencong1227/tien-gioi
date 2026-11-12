/* global console, process */
/**
 * Cổng đỏ / xanh cho kết quả `perf:mobile` (M5.1, #330 tiêu chí 4): so từng kịch bản với client/perf-budget.json.
 * Chạy hằng đêm trong .github/workflows/bench.yml sau `npm run perf:mobile`; chạy tay:
 *   node client/scripts/perf-gate.mjs [docs/perf-mobile-results.json] [--budget client/perf-budget.json]
 *                                     [--time-slack 1.5] [--summary tệp.md]
 *
 * Chỉ chặn trên số đo TIN ĐƯỢC của harness: thời gian `update` p95 của cảnh (JS), số hạt sống, số emitter, và số draw call mỗi khung
 * (p95 trong cửa sổ lấy mẫu; ĐO THẬT bằng bộ đếm tiêm vào WebGL, `draw-counter.mjs`, #397; trước đó là số gán cứng nên không chặn).
 * Kịch bản bắn hiệu ứng THẬT (`fxPlan`, fx-driver.mjs, #400) chặn trên ĐỈNH hạt / emitter (trần x `OWN_OVERSHOOT`) và ĐỈNH chữ bay
 * (`damageNumbers`) trong cả cửa sổ lấy mẫu thay cho số sống lúc lớp phủ vẽ lần cuối.
 * KHÔNG chặn trên FPS (headless SwiftShader không phản ánh GPU thật).
 * `--time-slack` (hoặc biến PERF_TIME_SLACK) nhân hệ số vào ngân sách thời gian để bù runner CI chậm hơn máy dev;
 * số hạt / emitter / draw call là đếm tất định nên KHÔNG nới.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MIN_FX_PLAYED } from "./fx-driver.mjs";

const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");

const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Ưu tiên 2 (hiệu ứng của CHÍNH MÌNH: đòn, kỹ năng, bị đánh) được vượt trần hạt / emitter của hồ sơ tới bấy nhiêu lần trước khi bị bỏ
 * (`OWN_OVERSHOOT` trong `client/src/gfx/fx/budget.ts`, docs/THIET_KE_GIAO_DIEN_DO_HOA.md mục 7.1; test hợp đồng đối chiếu hằng số thật).
 * Kịch bản có bắn hiệu ứng thật (`fxPlan`, #400) tính theo ĐỈNH trong cả cửa sổ lấy mẫu: trần CỨNG = trần x `OWN_OVERSHOOT` (đỉnh vượt
 * trần danh nghĩa nhưng trong trần cứng là THIẾT KẾ, không phải lỗi; vượt trần cứng nghĩa là kiểm soát ngân sách hỏng).
 */
export const OWN_OVERSHOOT = 2;

/** Số khung CÓ VẼ tối thiểu trong cửa sổ lấy mẫu để tin p95 draw call (5 giây ở 6x CPU vẫn ra hàng chục khung). */
export const MIN_DRAW_FRAMES = 10;

/**
 * Đọc số hạt / emitter từ văn bản lớp phủ `?perf=1` (`gfx/perf-overlay.ts`: `formatPerfLines` in `${tên} ${giá trị}`,
 * KHÔNG có dấu hai chấm: "hạt 30/520", "emitter 10/24"; `gfx/fx/fx.ts` đăng ký hai chỉ số này). Cho phép dấu hai chấm để
 * không vỡ nếu định dạng đổi nhẹ. Không tìm thấy thì trả `null` (KHÔNG mặc định 0: số 0 giả làm cổng xanh giả).
 * Đây là số SỐNG tại lúc lớp phủ vẽ lần cuối (cập nhật ~4 lần / giây), không phải đỉnh trong cả cửa sổ lấy mẫu.
 * @param {unknown} text
 * @returns {{ particles: number | null, particleLimit: number | null, emitters: number | null, emitterLimit: number | null }}
 */
export function parseOverlayCounts(text) {
  const src = String(text ?? "");
  const grab = (name) => {
    const m = new RegExp(`(?:^|\\n)[ \\t]*${name}:?[ \\t]*(\\d+)[ \\t]*/[ \\t]*(\\d+)`, "u").exec(
      src,
    );
    return m ? [Number(m[1]), Number(m[2])] : [null, null];
  };
  const [particles, particleLimit] = grab("hạt");
  const [emitters, emitterLimit] = grab("emitter");
  return { particles, particleLimit, emitters, emitterLimit };
}

/**
 * @param {any[]} results mảng kết quả của measure-mobile-perf.mjs
 * @param {any} budget nội dung client/perf-budget.json
 * @param {{ timeSlack?: number }} [opts]
 * @returns {{ ok: boolean, violations: {id: string, metric: string, actual: number | string, limit: number | string}[], rows: any[] }}
 */
export function evaluatePerfResults(results, budget, { timeSlack = 1 } = {}) {
  const violations = [];
  const rows = [];
  const warnings = [];
  if (!Array.isArray(results) || results.length === 0) {
    violations.push({ id: "(tất cả)", metric: "kết quả", actual: "rỗng", limit: ">= 1 kịch bản" });
    return { ok: false, violations, rows, warnings };
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
    // Kịch bản có bắn hiệu ứng THẬT: ĐỈNH trong cả cửa sổ (hạt / emitter tới trần x OWN_OVERSHOOT vì ưu tiên 2, chữ bay tới `damageNumbers`);
    // không bắn thì số SỐNG lúc lớp phủ vẽ lần cuối so với trần danh nghĩa như trước
    const fx = r.fxPlan !== undefined && r.fxPlan !== null;
    const checks = [
      ["JS update p95 (ms)", r.updateP95Ms, tier.jsFrameP95Ms * timeSlack, "ms"],
      ...(fx
        ? [
            ["đỉnh hạt (fx)", r.particlesPeak, tier.peakParticles * OWN_OVERSHOOT, "hạt"],
            ["đỉnh emitter (fx)", r.emittersPeak, tier.emitterBudget * OWN_OVERSHOOT, "emitter"],
            ["đỉnh chữ bay (fx)", r.floatsPeak, tier.damageNumbers, "chữ"],
          ]
        : [
            ["số hạt sống", r.particles, tier.peakParticles, "hạt"],
            ["số emitter", r.emitters, tier.emitterBudget, "emitter"],
          ]),
      ["draw call p95 mỗi khung", r.drawCallsP95, tier.drawCalls, "draw call"],
    ];
    row.p95 = r.updateP95Ms;
    row.p95Limit = tier.jsFrameP95Ms * timeSlack;
    row.particles = r.particles;
    row.particleLimit = tier.peakParticles;
    row.emitters = r.emitters;
    row.emitterLimit = tier.emitterBudget;
    row.fxPlan = fx ? String(r.fxPlan) : null;
    row.fxPlayed = r.fxPlayed;
    row.fxDropped = r.fxDropped;
    row.particlesPeak = r.particlesPeak;
    row.emittersPeak = r.emittersPeak;
    row.floatsPeak = r.floatsPeak;
    row.floatsLimit = tier.damageNumbers;
    row.drawCalls = r.drawCallsP95;
    row.drawCallsAvg = r.drawCallsAvg;
    row.drawCallsLimit = tier.drawCalls;
    for (const [metric, actual, limit] of checks) {
      // Ngân sách thiếu khoá / sai kiểu (đổi tên khoá trong perf-budget.json): so `actual > undefined` luôn false => xanh giả
      if (!isNum(limit)) {
        violations.push({
          id,
          metric: `ngân sách của ${metric}`,
          actual: String(limit),
          limit: "số >= 0",
        });
        row.bad.push(`ngân sách ${metric}`);
      } else if (!isNum(actual)) {
        violations.push({ id, metric, actual: String(actual), limit: `số <= ${limit}` });
        row.bad.push(metric);
      } else if (actual > limit) {
        violations.push({ id, metric, actual, limit });
        row.bad.push(metric);
      }
    }
    // Bắn hiệu ứng thật mà phát được quá ít, hoặc đỉnh bằng 0 dù đã phát: bộ bắn / bộ đọc đỉnh hỏng, KHÔNG được xanh giả
    if (fx) {
      if (!(isNum(r.fxPlayed) && r.fxPlayed >= MIN_FX_PLAYED)) {
        violations.push({
          id,
          metric: "số hiệu ứng bắn thật phát được",
          actual: String(r.fxPlayed),
          limit: `số >= ${MIN_FX_PLAYED}`,
        });
        row.bad.push("bắn hiệu ứng quá ít");
      } else {
        for (const [metric, peak] of [
          ["đỉnh hạt (fx)", r.particlesPeak],
          ["đỉnh emitter (fx)", r.emittersPeak],
          ["đỉnh chữ bay (fx)", r.floatsPeak],
        ]) {
          if (peak === 0) {
            violations.push({ id, metric, actual: 0, limit: "> 0 (đã phát hiệu ứng)" });
            row.bad.push(`${metric} = 0`);
          }
        }
      }
    }
    // p95 draw call chỉ đáng tin khi đủ khung có vẽ: ít quá thì ĐỎ (bộ đếm không bắt được khung nào / cửa sổ lấy mẫu hỏng)
    if (
      isNum(r.drawCallsP95) &&
      !(isNum(r.drawCallFrames) && r.drawCallFrames >= MIN_DRAW_FRAMES)
    ) {
      violations.push({
        id,
        metric: "số khung có vẽ trong cửa sổ lấy mẫu",
        actual: String(r.drawCallFrames),
        limit: `số >= ${MIN_DRAW_FRAMES}`,
      });
      row.bad.push("mẫu draw call quá ít");
    }
    // Trần mà harness đọc từ lớp phủ (hồ sơ chất lượng trong mã) phải khớp perf-budget.json, nếu không ngân sách bị trôi khỏi mã
    for (const [metric, shown, budgeted] of [
      ["trần hạt của hồ sơ", r.particleLimit, tier.peakParticles],
      ["trần emitter của hồ sơ", r.emitterLimit, tier.emitterBudget],
    ]) {
      if (isNum(shown) && isNum(budgeted) && shown !== budgeted) {
        violations.push({ id, metric, actual: shown, limit: `${budgeted} (perf-budget.json)` });
        row.bad.push(metric);
      }
    }
  }
  // Bậc Vừa / Cao mà MỌI kịch bản đều 0 hạt + 0 emitter thì số đo hạt gần như chắc chắn không đọc được (đừng tin cổng hạt)
  const rich = rows.filter((x) => x.tier === "mid" || x.tier === "high");
  if (
    rich.length > 0 &&
    rich.every(
      (x) => (x.particlesPeak ?? x.particles) === 0 && (x.emittersPeak ?? x.emitters) === 0,
    )
  ) {
    warnings.push(
      "Mọi kịch bản bậc Vừa / Cao đều 0 hạt + 0 emitter: nhiều khả năng harness không đọc được số hạt từ lớp phủ (cổng hạt / emitter KHÔNG có tác dụng).",
    );
  }
  return { ok: violations.length === 0, violations, rows, warnings };
}

/** Ô "hiệu ứng bắn thật" của bảng tóm tắt: kế hoạch, phát / bỏ, đỉnh hạt · emitter (trần cứng) · chữ; "-" nếu kịch bản không bắn. */
function fxCell(r) {
  if (!r.fxPlan) return "-";
  const f = (v) => (v === undefined || v === null ? "?" : String(v));
  const hardP = isNum(r.particleLimit) ? r.particleLimit * OWN_OVERSHOOT : "?";
  const hardE = isNum(r.emitterLimit) ? r.emitterLimit * OWN_OVERSHOOT : "?";
  return `${r.fxPlan}: ${f(r.fxPlayed)} / ${f(r.fxDropped)}; ${f(r.particlesPeak)}/${f(hardP)} · ${f(r.emittersPeak)}/${f(hardE)} · ${f(r.floatsPeak)}/${f(r.floatsLimit)}`;
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
    "| Kịch bản | Bậc | CPU | JS update p95 | Draw call p95 (TB) | Hạt sống | Emitter sống | Hiệu ứng bắn thật: phát / bỏ, đỉnh hạt · emitter · chữ | FPS | |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of evaluation.rows) {
    const f = (v) => (v === undefined || v === null ? "?" : String(v));
    lines.push(
      `| ${f(r.scenario ?? r.id)} (\`${r.id}\`) | ${f(r.tier)} | ${f(r.cpu)} | ${f(r.p95)} / ${f(r.p95Limit)} ms | ${f(r.drawCalls)} / ${f(r.drawCallsLimit)} (${f(r.drawCallsAvg)}) | ${r.fxPlan ? "-" : `${f(r.particles)} / ${f(r.particleLimit)}`} | ${r.fxPlan ? "-" : `${f(r.emitters)} / ${f(r.emitterLimit)}`} | ${fxCell(r)} | ${f(r.fps)} | ${r.bad.length ? "❌ " + r.bad.join(", ") : "✅"} |`,
    );
  }
  for (const w of evaluation.warnings ?? []) lines.push("", `⚠️ ${w}`);
  if (!evaluation.ok) {
    lines.push("", "**Vi phạm:**");
    for (const v of evaluation.violations) {
      lines.push(`- \`${v.id}\`: ${v.metric} = ${v.actual} (giới hạn ${v.limit})`);
    }
  }
  lines.push(
    "",
    `Ngân sách thời gian nhân hệ số \`time-slack\` = ${timeSlack} (bù runner CI chậm hơn máy dev); số hạt / emitter / draw call không nới.`,
    "Không chặn trên FPS (SwiftShader không phản ánh GPU thật). Draw call = số lệnh vẽ WebGL mỗi khung CÓ VẼ (bộ đếm tiêm vào `drawElements` / `drawArrays` và bản instanced, gom theo `requestAnimationFrame`; khung không vẽ không tính), p95 trong cửa sổ lấy mẫu.",
    `Kịch bản có bắn hiệu ứng thật (cột "Hiệu ứng bắn thật") chặn trên ĐỈNH trong cả cửa sổ: hạt / emitter tới trần x ${OWN_OVERSHOOT} (ưu tiên 2 được vượt trần danh nghĩa, docs 7.1) và chữ bay tới \`damageNumbers\`. Kịch bản không bắn (crowd) kiểm số hạt / emitter SỐNG lúc lớp phủ vẽ lần cuối (không phải đỉnh).`,
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
    for (const w of evaluation.warnings) console.log(`::warning::${w}`);
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
