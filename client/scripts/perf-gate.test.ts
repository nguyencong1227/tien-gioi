import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { evaluatePerfResults, formatSummary, parseOverlayCounts } from "./perf-gate.mjs";
import { formatPerfLines } from "../src/gfx/perf-overlay";

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
  drawCallsAvg: 3,
  drawCallsP95: 4,
  drawCallFrames: 120,
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

  describe("draw call (#397): số ĐO THẬT bằng bộ đếm tiêm vào WebGL, cổng bật", () => {
    it("draw call p95 vượt trần bậc -> đỏ đúng chỉ số; đúng bằng trần thì còn xanh; mỗi bậc một trần", () => {
      for (const tier of ["low", "mid", "high"] as const) {
        const cap = budget.runtime.tiers[tier].drawCalls as number;
        expect(evaluatePerfResults([ok("a", tier, { drawCallsP95: cap })], budget).ok).toBe(true);
        const ev = evaluatePerfResults([ok("a", tier, { drawCallsP95: cap + 1 })], budget);
        expect(ev.ok, tier).toBe(false);
        expect(ev.violations).toEqual([
          { id: "a", metric: "draw call p95 mỗi khung", actual: cap + 1, limit: cap },
        ]);
      }
    });

    it("thiếu / sai kiểu số đo draw call (null = bộ đếm không bắt được, undefined, NaN, âm, chuỗi) -> ĐỎ, không bao giờ xanh giả", () => {
      for (const bad of [null, undefined, NaN, -1, "4", Infinity]) {
        const ev = evaluatePerfResults([ok("a", "mid", { drawCallsP95: bad })], budget);
        expect(ev.ok, `drawCallsP95=${String(bad)}`).toBe(false);
        expect(ev.violations.map((v) => v.metric)).toEqual(["draw call p95 mỗi khung"]);
      }
      // kết quả CŨ (trước #397) chỉ có `drawCalls` gán cứng: không đủ, phải đỏ
      const old = ok("a", "low", { drawCallsP95: undefined, drawCalls: 3 });
      expect(evaluatePerfResults([old], budget).ok).toBe(false);
    });

    it("ngân sách thiếu khoá `drawCalls` / sai kiểu -> đỏ (không so với undefined)", () => {
      const b = JSON.parse(JSON.stringify(budget));
      delete b.runtime.tiers.mid.drawCalls;
      b.runtime.tiers.high.drawCalls = "160";
      const ev = evaluatePerfResults([ok("m", "mid"), ok("h", "high")], b);
      expect(ev.violations.map((v) => `${v.id}: ${v.metric}`)).toEqual([
        "m: ngân sách của draw call p95 mỗi khung",
        "h: ngân sách của draw call p95 mỗi khung",
      ]);
    });

    it("mẫu quá ít (số khung có vẽ < 10, hoặc thiếu) -> đỏ dù p95 nằm trong trần", () => {
      for (const frames of [0, 9, undefined, null, NaN]) {
        const ev = evaluatePerfResults([ok("a", "low", { drawCallFrames: frames })], budget);
        expect(ev.ok, `drawCallFrames=${String(frames)}`).toBe(false);
        expect(ev.violations.map((v) => v.metric)).toEqual(["số khung có vẽ trong cửa sổ lấy mẫu"]);
      }
      expect(evaluatePerfResults([ok("a", "low", { drawCallFrames: 10 })], budget).ok).toBe(true);
    });

    it("time-slack KHÔNG nới draw call (số đếm tất định)", () => {
      const cap = budget.runtime.tiers.low.drawCalls as number;
      const over = ok("a", "low", { drawCallsP95: cap + 1 });
      expect(evaluatePerfResults([over], budget, { timeSlack: 3 }).ok).toBe(false);
    });
  });

  it("bản tóm tắt Markdown nêu kịch bản vi phạm, có cột draw call, và ghi rõ chỉ không chặn FPS", () => {
    const ev = evaluatePerfResults([ok("a", "low", { updateP95Ms: 20 })], budget);
    const md = formatSummary(ev, { timeSlack: 1 });
    expect(md).toContain("❌ 1 chỉ số vượt ngân sách");
    expect(md).toContain("`a`: JS update p95 (ms) = 20");
    expect(md).toContain("Draw call p95");
    expect(md).toContain("4 / 60 (3)"); // p95 / trần (trung bình)
    expect(md).not.toMatch(/KHÔNG chặn.*drawCalls|không chặn trên FPS[^.]*drawCalls/i);
    expect(md).not.toContain("gán cứng");
    expect(md).toContain("Không chặn trên FPS");
    expect(formatSummary(evaluatePerfResults([ok("a", "low")], budget))).toContain(
      "✅ Mọi kịch bản",
    );
  });

  describe("parseOverlayCounts: hợp đồng với lớp phủ ?perf=1 (bài học #390: regex có dấu hai chấm không bao giờ khớp)", () => {
    const snap = (extras: Array<[string, string]>) => ({
      fps: 60,
      p95Ms: 16,
      tier: "high",
      mode: "auto",
      cssW: 390,
      cssH: 844,
      dpr: 2,
      renderScale: 1,
      heapMb: 30,
      governor: { downshifts: 0, badStreak: 0, goodStreak: 3 },
      extras,
    });

    it("đọc đúng chuỗi do CHÍNH formatPerfLines dựng ('hạt 30/520', 'emitter 10/24')", () => {
      const text = formatPerfLines(
        snap([
          ["hạt", "30/520"],
          ["emitter", "10/24"],
          ["fx bỏ", "0 (chữ 0)"],
        ]),
      ).join("\n");
      expect(parseOverlayCounts(text)).toEqual({
        particles: 30,
        particleLimit: 520,
        emitters: 10,
        emitterLimit: 24,
      });
    });

    it("chịu được dấu hai chấm / khoảng trắng; không tìm thấy thì null (KHÔNG mặc định 0)", () => {
      expect(parseOverlayCounts("hạt: 5 / 60\nemitter:1/4")).toMatchObject({
        particles: 5,
        particleLimit: 60,
        emitters: 1,
        emitterLimit: 4,
      });
      const none = { particles: null, particleLimit: null, emitters: null, emitterLimit: null };
      expect(parseOverlayCounts("")).toEqual(none);
      expect(parseOverlayCounts(undefined)).toEqual(none);
      expect(parseOverlayCounts("FPS 60  p95 16 ms\nheap 30 MB")).toEqual(none);
      // chữ "hạt" nằm giữa dòng khác không được tính
      expect(parseOverlayCounts("chất lượng hạt 3/4")).toEqual(none);
    });

    it("fx.ts đăng ký đúng hai khoá 'hạt' / 'emitter' với giá trị dạng `<số>/<trần>` (đổi tên là test đỏ)", () => {
      const src = fs.readFileSync(path.join(repo, "client/src/gfx/fx/fx.ts"), "utf8");
      expect(src).toMatch(/registerPerfStat\("hạt",[\s\S]*?\$\{l\.particles\}\/\$\{/);
      expect(src).toMatch(/registerPerfStat\("emitter",[\s\S]*?\$\{l\.emitters\}\/\$\{/);
    });

    it("harness dùng parseOverlayCounts, không còn regex tự chế đọc lớp phủ", () => {
      const src = fs.readFileSync(
        path.join(repo, "client/scripts/measure-mobile-perf.mjs"),
        "utf8",
      );
      expect(src).toContain("parseOverlayCounts(overlayText)");
      expect(src).not.toMatch(/overlayText\.match\(/);
    });
  });

  describe("ngân sách thiếu khoá, trần lệch mã, số đo hạt vắng", () => {
    it("đột biến: xoá / đổi tên khoá ngân sách -> ĐỎ (trước đây 9999 hạt vẫn xanh vì so với undefined)", () => {
      const broken = JSON.parse(JSON.stringify(budget));
      delete broken.runtime.tiers.mid.peakParticles;
      broken.runtime.tiers.mid.emitterBudget = "10";
      const ev = evaluatePerfResults([ok("a", "mid", { particles: 9999, emitters: 5 })], broken);
      expect(ev.ok).toBe(false);
      expect(ev.violations.map((v) => v.metric)).toEqual([
        "ngân sách của số hạt sống",
        "ngân sách của số emitter",
      ]);
    });

    it("trần hạt / emitter harness đọc từ lớp phủ phải khớp perf-budget.json (hồ sơ trong mã không được trôi khỏi ngân sách)", () => {
      const t = budget.runtime.tiers.mid;
      const same = ok("a", "mid", {
        particleLimit: t.peakParticles,
        emitterLimit: t.emitterBudget,
      });
      expect(evaluatePerfResults([same], budget).ok).toBe(true);
      const ev = evaluatePerfResults(
        [
          ok("a", "mid", {
            particleLimit: t.peakParticles + 10,
            emitterLimit: t.emitterBudget + 1,
          }),
        ],
        budget,
      );
      expect(ev.violations.map((v) => v.metric)).toEqual([
        "trần hạt của hồ sơ",
        "trần emitter của hồ sơ",
      ]);
    });

    it("số hạt null (không đọc được lớp phủ) -> ĐỎ thiếu số đo, không coi là 0", () => {
      const ev = evaluatePerfResults([ok("a", "low", { particles: null, emitters: null })], budget);
      expect(ev.ok).toBe(false);
      expect(ev.violations.map((v) => v.metric)).toEqual(["số hạt sống", "số emitter"]);
    });

    it("cảnh báo (không đỏ) khi MỌI kịch bản Vừa / Cao đều 0 hạt + 0 emitter; có một ca > 0 thì hết cảnh báo", () => {
      const allZero = evaluatePerfResults(
        [ok("l", "low"), ok("m", "mid"), ok("h", "high")],
        budget,
      );
      expect(allZero.ok).toBe(true);
      expect(allZero.warnings).toHaveLength(1);
      expect(formatSummary(allZero)).toContain("⚠️");
      const some = evaluatePerfResults(
        [ok("m", "mid"), ok("h", "high", { particles: 30 })],
        budget,
      );
      expect(some.warnings).toEqual([]);
      // chỉ có bậc Thấp (tắt hạt) thì không cảnh báo
      expect(evaluatePerfResults([ok("l", "low")], budget).warnings).toEqual([]);
    });
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
