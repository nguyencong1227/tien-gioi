import { describe, expect, it } from "vitest";
import { analyzeRunJobs, getJobDuration, getStepDuration, stats } from "./measure-ci.mjs";

describe("measure-ci: thống kê đo thời lượng CI", () => {
  it("stats: tính toán đúng min, avg, median, p95, max", () => {
    expect(stats([])).toEqual({ min: 0, avg: 0, median: 0, p95: 0, max: 0 });

    const s = stats([10, 20, 30, 40, 50]);
    expect(s.min).toBe(10);
    expect(s.max).toBe(50);
    expect(s.median).toBe(30);
    expect(s.avg).toBe(30);
  });

  it("getJobDuration & getStepDuration: tính đúng số giây từ started_at tới completed_at", () => {
    const job = {
      started_at: "2026-11-23T12:00:00Z",
      completed_at: "2026-11-23T12:01:15Z",
    };
    expect(getJobDuration(job)).toBe(75);

    const steps = [
      {
        name: "Set up job",
        started_at: "2026-11-23T12:00:00Z",
        completed_at: "2026-11-23T12:00:02Z",
      },
      {
        name: "Run npm ci",
        started_at: "2026-11-23T12:00:02Z",
        completed_at: "2026-11-23T12:00:18Z",
      },
    ];
    expect(getStepDuration(steps, (s) => Boolean(s.name?.includes("npm ci")))).toBe(16);
    expect(getStepDuration(steps, (s) => s.name === "Khong co")).toBeNull();
  });

  it("analyzeRunJobs với lượt CI cũ (tuần tự, chỉ có job check)", () => {
    const run = {
      databaseId: 45166794755,
      headBranch: "main",
      event: "push",
      createdAt: "2026-11-23T11:37:00Z",
      status: "completed",
      conclusion: "success",
    };

    const jobs = [
      {
        name: "check",
        conclusion: "success",
        started_at: "2026-11-23T11:37:22Z",
        completed_at: "2026-11-23T11:43:34Z",
        steps: [
          {
            name: "Run actions/checkout@v4",
            started_at: "2026-11-23T11:37:24Z",
            completed_at: "2026-11-23T11:37:29Z",
          },
          {
            name: "Run npm ci",
            started_at: "2026-11-23T11:37:35Z",
            completed_at: "2026-11-23T11:37:49Z",
          },
          {
            name: "Kiểm tra kiểu",
            started_at: "2026-11-23T11:37:49Z",
            completed_at: "2026-11-23T11:38:03Z",
          },
          {
            name: "Lint",
            started_at: "2026-11-23T11:38:03Z",
            completed_at: "2026-11-23T11:38:18Z",
          },
          {
            name: "Kiểm tra định dạng",
            started_at: "2026-11-23T11:38:18Z",
            completed_at: "2026-11-23T11:38:37Z",
          },
          {
            name: "Test",
            started_at: "2026-11-23T11:38:37Z",
            completed_at: "2026-11-23T11:43:16Z",
          },
          {
            name: "Build client",
            started_at: "2026-11-23T11:43:17Z",
            completed_at: "2026-11-23T11:43:33Z",
          },
        ],
      },
      {
        name: "Docker Build",
        conclusion: "success",
        started_at: "2026-11-23T11:37:22Z",
        completed_at: "2026-11-23T11:39:35Z",
      },
    ];

    const res = analyzeRunJobs(run, jobs);
    expect(res.isSharded).toBe(false);
    expect(res.checkConclusion).toBe("success");
    // Từ createdAt 11:37:00 tới completed_at 11:43:34 = 394s
    expect(res.totalDuration).toBe(394);
    expect(res.npmCiDuration).toBe(14);
    expect(res.typecheckDuration).toBe(14);
    expect(res.lintStepDuration).toBe(15);
    expect(res.formatDuration).toBe(19);
    expect(res.testDuration).toBe(279);
    expect(res.buildStepDuration).toBe(16);
  });

  it("analyzeRunJobs với lượt CI mới (sharded, các jobs chạy song song)", () => {
    const run = {
      databaseId: 45170742406,
      headBranch: "c/1377-ci-nhanh-hon",
      event: "pull_request",
      createdAt: "2026-11-23T12:03:44Z",
      status: "completed",
      conclusion: "success",
    };

    const jobs = [
      {
        name: "Lint & Typecheck",
        conclusion: "success",
        started_at: "2026-11-23T12:03:48Z",
        completed_at: "2026-11-23T12:05:12Z", // 84s
      },
      {
        name: "Build Client",
        conclusion: "success",
        started_at: "2026-11-23T12:03:47Z",
        completed_at: "2026-11-23T12:04:36Z", // 49s
      },
      {
        name: "Test (1/3)",
        conclusion: "success",
        started_at: "2026-11-23T12:03:48Z",
        completed_at: "2026-11-23T12:05:51Z", // 123s
      },
      {
        name: "Test (2/3)",
        conclusion: "success",
        started_at: "2026-11-23T12:03:48Z",
        completed_at: "2026-11-23T12:07:04Z", // 196s
      },
      {
        name: "Test (3/3)",
        conclusion: "success",
        started_at: "2026-11-23T12:03:48Z",
        completed_at: "2026-11-23T12:05:48Z", // 120s
      },
      {
        name: "check",
        conclusion: "success",
        started_at: "2026-11-23T12:07:06Z",
        completed_at: "2026-11-23T12:07:09Z", // 3s
      },
    ];

    const res = analyzeRunJobs(run, jobs);
    expect(res.isSharded).toBe(true);
    expect(res.checkConclusion).toBe("success");
    // Từ createdAt 12:03:44 tới maxCompleted 12:07:09 = 205s (3m25s)
    expect(res.totalDuration).toBe(205);
    expect(res.lintDuration).toBe(84);
    expect(res.buildJobDuration).toBe(49);
    expect(res.test1Duration).toBe(123);
    expect(res.test2Duration).toBe(196);
    expect(res.test3Duration).toBe(120);
    expect(res.checkSummaryDuration).toBe(3);
  });
});
