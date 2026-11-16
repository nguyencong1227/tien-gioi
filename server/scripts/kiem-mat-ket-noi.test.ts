// Test kiểm tra tích hợp Mục 33 bằng bot trên máy chủ thật (biến thể ngắn stall 4s cho CI, Issue #810).
import { describe, expect, it } from "vitest";
import { runNetGuardChecks } from "./kiem-mat-ket-noi";

describe("kiểm tra tích hợp mục 33 trên máy chủ thật (bot stall 4s)", () => {
  it("chạy đủ 4 ca: stall giữa đàn quái, hạn mức tha chết 3 lần / 10 phút, đối chứng, và PK thách đấu huỷ hoà", async () => {
    const summary = await runNetGuardChecks({ stallSeconds: 4 });

    expect(summary.results).toHaveLength(4);
    for (const r of summary.results) {
      expect(r.passed, `${r.name}: ${r.detail}`).toBe(true);
    }
    expect(summary.allPassed).toBe(true);
  }, 60_000);
});
