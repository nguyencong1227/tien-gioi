import { describe, expect, it } from "vitest";
import { type BenchmarkBaseline, compareBenchmarks } from "./bench-compare";
import type { BenchOutput } from "../src/perf/bench";

function createMockBenchOutput(
  mode: "hunt" | "crowd",
  p100Bytes: number,
  p100AvgMs = 1.5,
): BenchOutput {
  return {
    mode,
    seconds: 20,
    seed: 1,
    timestamp: "2026-11-10T00:00:00.000Z",
    results: [
      {
        players: 0,
        monsters: 88,
        ticks: 400,
        avgMs: 0.02,
        p95Ms: 0.03,
        maxMs: 0.4,
        patchBytes: 0,
        kbPerSecPerClient: 0,
        eventKbBroadcast: 0,
        eventKbNear: 0,
        partyKbPerClient: 0,
      },
      {
        players: 10,
        monsters: 70,
        ticks: 400,
        avgMs: 0.15,
        p95Ms: 0.3,
        maxMs: 0.9,
        patchBytes: 80,
        kbPerSecPerClient: 1.5,
        eventKbBroadcast: 2.0,
        eventKbNear: 1.0,
        partyKbPerClient: 0.3,
      },
      {
        players: 50,
        monsters: 50,
        ticks: 400,
        avgMs: 0.5,
        p95Ms: 0.9,
        maxMs: 1.5,
        patchBytes: 150,
        kbPerSecPerClient: 3.0,
        eventKbBroadcast: 5.0,
        eventKbNear: 2.0,
        partyKbPerClient: 0.3,
      },
      {
        players: 100,
        monsters: 30,
        ticks: 400,
        avgMs: p100AvgMs,
        p95Ms: p100AvgMs * 1.5,
        maxMs: p100AvgMs * 2.0,
        patchBytes: p100Bytes,
        kbPerSecPerClient: (p100Bytes * 20) / 1024,
        eventKbBroadcast: 8.0,
        eventKbNear: 3.0,
        partyKbPerClient: 0.33,
      },
    ],
  };
}

const mockBaseline: BenchmarkBaseline = {
  version: 1,
  description: "Test baseline",
  seconds: 20,
  seed: 1,
  hunt: createMockBenchOutput("hunt", 200, 1.0),
  crowd: createMockBenchOutput("crowd", 400, 1.5),
};

describe("bench-compare", () => {
  it("trả về thành công khi kết quả bằng hoặc thấp hơn baseline", () => {
    const curHunt = createMockBenchOutput("hunt", 200, 1.0);
    const curCrowd = createMockBenchOutput("crowd", 380, 1.4);

    const report = compareBenchmarks(mockBaseline, curHunt, curCrowd, 0.15);
    expect(report.hasFailure).toBe(false);
    expect(report.rows.every((r) => !r.isViolation)).toBe(true);
    expect(report.summaryMarkdown).toContain("TẤT CẢ CHỈ SỐ BẢO ĐẢM");
  });

  it("cho phép byte/tick nhích lên trong phạm vi <= 15%", () => {
    // 200 * 1.10 = 220 (+10% < 15%)
    const curHunt = createMockBenchOutput("hunt", 220, 1.0);
    // 400 * 1.14 = 456 (+14% < 15%)
    const curCrowd = createMockBenchOutput("crowd", 456, 1.5);

    const report = compareBenchmarks(mockBaseline, curHunt, curCrowd, 0.15);
    expect(report.hasFailure).toBe(false);
  });

  it("báo lỗi thất bại khi byte/tick ở 100 người tăng vượt quá 15%", () => {
    // 200 * 1.20 = 240 (+20% > 15%)
    const curHunt = createMockBenchOutput("hunt", 240, 1.0);
    const curCrowd = createMockBenchOutput("crowd", 400, 1.5);

    const report = compareBenchmarks(mockBaseline, curHunt, curCrowd, 0.15);
    expect(report.hasFailure).toBe(true);

    const rowHunt100 = report.rows.find((r) => r.scenario.includes("hunt") && r.players === 100);
    expect(rowHunt100?.isViolation).toBe(true);
    expect(rowHunt100?.warningNote).toContain("vượt trần +15%");
    expect(report.summaryMarkdown).toContain("CẢNH BÁO BĂNG THÔNG");
  });

  it("báo lỗi thất bại khi ca đám đông 100 người tăng vượt quá 15%", () => {
    const curHunt = createMockBenchOutput("hunt", 200, 1.0);
    // 400 * 1.18 = 472 (+18% > 15%)
    const curCrowd = createMockBenchOutput("crowd", 472, 1.5);

    const report = compareBenchmarks(mockBaseline, curHunt, curCrowd, 0.15);
    expect(report.hasFailure).toBe(true);

    const rowCrowd100 = report.rows.find((r) => r.scenario.includes("crowd") && r.players === 100);
    expect(rowCrowd100?.isViolation).toBe(true);
  });
});
