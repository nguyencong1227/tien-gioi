import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { evaluatePerfResults, formatSummary } from "./perf-gate.mjs";

const repo = path.resolve(__dirname, "../..");
const budget = JSON.parse(fs.readFileSync(path.join(repo, "client/perf-budget.json"), "utf8"));
const gateScript = path.join(repo, "client/scripts/perf-gate.mjs");

// Một kết quả hợp lệ (đúng hình dạng measure-mobile-perf.mjs) nằm gọn trong ngân sách bậc `tier`
const ok = (id: string, tier: "low" | "mid" | "high", over: Record<string, unknown> = {}) => ({
  id,
  scenario: id,
  tier,
  cpu: "4x",
  fpsAvg: 58,
  updateP95Ms: 2,
  particles: 0,
  emitters: 0,
  ...over,
});

describe("M5.1 #330: perf-gate (cổng ngân sách cho perf:mobile)", () => {
  it("mọi kịch bản trong ngân sách -> ok, không vi phạm", () => {
    const ev = evaluatePerfResults(
      [ok("a", "low"), ok("b", "mid"), ok("c", "high", { updateP95Ms: 13 })],
      budget,
    );
    expect(ev.ok).toBe(true);
    expect(ev.violations).toEqual([]);
    expect(ev.rows).toHaveLength(3);
  });

  it("đột biến: JS p95 vượt ngân sách bậc (low 9 ms) -> đỏ đúng kịch bản và chỉ số", () => {
    const ev = evaluatePerfResults([ok("a", "low", { updateP95Ms: 9.5 }), ok("b", "mid")], budget);
    expect(ev.ok).toBe(false);
    expect(ev.violations).toEqual([
      {
        id: "a",
        metric: "JS update p95 (ms)",
        actual: 9.5,
        limit: budget.runtime.tiers.low.jsFrameP95Ms,
      },
    ]);
  });

  it("đột biến: hạt sống / emitter vượt trần bậc -> đỏ; đúng bằng trần thì còn xanh", () => {
    const t = budget.runtime.tiers.low;
    expect(
      evaluatePerfResults(
        [ok("a", "low", { particles: t.peakParticles, emitters: t.emitterBudget })],
        budget,
      ).ok,
    ).toBe(true);
    const ev = evaluatePerfResults(
      [ok("a", "low", { particles: t.peakParticles + 1, emitters: t.emitterBudget + 1 })],
      budget,
    );
    expect(ev.violations.map((v) => v.metric)).toEqual(["số hạt sống", "số emitter"]);
  });

  it("đột biến: thiếu / sai kiểu số đo (undefined, NaN, âm, chuỗi) -> đỏ, không bao giờ xanh giả", () => {
    for (const bad of [undefined, NaN, -1, "2", null, Infinity]) {
      const ev = evaluatePerfResults([ok("a", "mid", { updateP95Ms: bad })], budget);
      expect(ev.ok, `updateP95Ms=${String(bad)}`).toBe(false);
      expect(ev.violations[0].metric).toBe("JS update p95 (ms)");
    }
    const ev = evaluatePerfResults([ok("a", "mid", { particles: undefined })], budget);
    expect(ev.violations.map((v) => v.metric)).toEqual(["số hạt sống"]);
  });

  it("kết quả rỗng / không phải mảng / bậc lạ -> đỏ", () => {
    expect(evaluatePerfResults([], budget).ok).toBe(false);
    expect(evaluatePerfResults(null as unknown as unknown[], budget).ok).toBe(false);
    const ev = evaluatePerfResults([ok("a", "ultra" as "low")], budget);
    expect(ev.ok).toBe(false);
    expect(ev.violations[0].metric).toBe("bậc đồ hoạ");
  });

  it("time-slack chỉ nới ngân sách THỜI GIAN, không nới số hạt / emitter; slack < 1 bị từ chối", () => {
    const slow = ok("a", "low", { updateP95Ms: 12 });
    expect(evaluatePerfResults([slow], budget).ok).toBe(false);
    expect(evaluatePerfResults([slow], budget, { timeSlack: 1.5 }).ok).toBe(true);
    const t = budget.runtime.tiers.low;
    const manyParticles = ok("a", "low", { particles: t.peakParticles + 1 });
    expect(evaluatePerfResults([manyParticles], budget, { timeSlack: 3 }).ok).toBe(false);
    expect(() => evaluatePerfResults([slow], budget, { timeSlack: 0.5 })).toThrow(/time-slack/);
  });

  it("bản tóm tắt Markdown nêu kịch bản vi phạm và ghi rõ không chặn FPS / drawCalls", () => {
    const ev = evaluatePerfResults([ok("a", "low", { updateP95Ms: 20 })], budget);
    const md = formatSummary(ev, { timeSlack: 1 });
    expect(md).toContain("❌ 1 chỉ số vượt ngân sách");
    expect(md).toContain("`a`: JS update p95 (ms) = 20");
    expect(md).toContain("drawCalls");
    expect(formatSummary(evaluatePerfResults([ok("a", "low")], budget))).toContain(
      "✅ Mọi kịch bản",
    );
  });

  describe("CLI (mã thoát)", () => {
    const run = (results: unknown, ...extra: string[]) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-perf-gate-"));
      try {
        const file = path.join(dir, "r.json");
        fs.writeFileSync(file, JSON.stringify(results));
        const env = { ...process.env };
        delete env.GITHUB_STEP_SUMMARY;
        delete env.PERF_TIME_SLACK;
        return spawnSync(process.execPath, [gateScript, file, ...extra], { encoding: "utf8", env });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };

    it("xanh -> exit 0; vượt ngân sách -> exit 1 và in dòng ✗", () => {
      expect(run([ok("a", "low")]).status).toBe(0);
      const bad = run([ok("a", "low", { updateP95Ms: 50 })]);
      expect(bad.status).toBe(1);
      expect(bad.stderr).toContain("✗ a: JS update p95 (ms) = 50");
    });

    it("--time-slack nới ngân sách thời gian; giá trị rác -> exit 1; ghi bản tóm tắt vào --summary", () => {
      const slow = [ok("a", "low", { updateP95Ms: 12 })];
      expect(run(slow).status).toBe(1);
      expect(run(slow, "--time-slack", "1.5").status).toBe(0);
      expect(run(slow, "--time-slack", "abc").status).toBe(1);
      const sum = path.join(os.tmpdir(), `tg-perf-sum-${process.pid}.md`);
      try {
        expect(run(slow, "--summary", sum).status).toBe(1);
        expect(fs.readFileSync(sum, "utf8")).toContain("perf:mobile");
      } finally {
        fs.rmSync(sum, { force: true });
      }
    });

    it("tệp kết quả không đọc được / không phải JSON -> exit 1 (không xanh giả)", () => {
      const r = spawnSync(process.execPath, [gateScript, "/khong/co/tep.json"], {
        encoding: "utf8",
      });
      expect(r.status).toBe(1);
    });
  });
});
