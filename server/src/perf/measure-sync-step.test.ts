// `measureSyncStepMs` (đo tick cho mọi ngưỡng thời gian của perf.test.ts / boss-perf.test.ts, #723 / #1215) phải đo CPU của CHÍNH luồng gọi.
// Vitest chạy `pool: "threads"`: các tệp test khác chạy song song là worker thread của CÙNG tiến trình, nên `process.cpuUsage()` (cả tiến trình)
// cộng cả CPU của chúng và làm `min(đồng hồ tường, CPU)` mất tác dụng chống tải khi chạy cả bộ `npm test`.
import { describe, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { measureSyncStepMs, summarizeTickMs } from "./bench";

const hasThreadCpu =
  typeof (process as unknown as { threadCpuUsage?: unknown }).threadCpuUsage === "function";

/** Chặn luồng này `ms` mili giây tường mà gần như KHÔNG tốn CPU (Atomics.wait ngủ trong nhân). */
function blockWithoutCpu(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** CPU (ms) đã dùng của luồng này (Node cũ chưa có `threadCpuUsage` thì CPU cả tiến trình: chỉ dùng để đốt đủ CPU, không dùng để khẳng định). */
function threadCpuMs(): number {
  const read = (process as unknown as { threadCpuUsage?: () => NodeJS.CpuUsage }).threadCpuUsage;
  const u = read ? read.call(process) : process.cpuUsage();
  return (u.user + u.system) / 1000;
}

/**
 * Đốt ÍT NHẤT `ms` mili giây CPU của luồng này. Đếm theo CPU của luồng chứ KHÔNG theo đồng hồ tường: máy tải cao làm luồng bị chen
 * thì vòng lặp chạy lâu hơn về tường nhưng vẫn đủ CPU (đếm theo tường từng làm ca "đo >= 20 ms" đỏ giả khi chạy cả bộ).
 */
function burnCpu(ms: number): void {
  const end = threadCpuMs() + ms;
  let x = 0;
  while (threadCpuMs() < end) x += Math.sqrt(x + 1);
  if (x < 0) throw new Error("không bao giờ"); // chống tối ưu bỏ vòng lặp
}

describe("measureSyncStepMs", () => {
  it.skipIf(!hasThreadCpu)(
    "KHÔNG cộng CPU của luồng khác trong cùng tiến trình: luồng bị chặn 250 ms tường với một worker đang quay vẫn đo ~0, không hàng chục ms",
    async () => {
      const busy = new Worker("for(;;){}", { eval: true }); // như một tệp test khác đang chạy song song
      try {
        await new Promise((r) => setTimeout(r, 300)); // cho luồng bận chạy hẳn
        // Cửa sổ 250 ms (không phải 40): máy quá tải làm luồng bận chỉ nhận một phần CPU, cửa sổ dài thì vẫn tích đủ hàng chục ms CPU cho
        // `process.cpuUsage()` cũ đo ra "hàng chục ms" và phép thử bắt được nó. Phía ĐÚNG (CPU của luồng này, đang ngủ trong nhân) luôn ~0
        // nên KHÔNG BAO GIỜ đỏ giả dù máy tải đến đâu (tải quá cao chỉ làm phép thử mất khả năng phân biệt bản cũ, không làm nó đỏ).
        const ms = measureSyncStepMs(() => blockWithoutCpu(250));
        expect(ms).toBeLessThan(10);
      } finally {
        await busy.terminate();
      }
    },
  );

  it("vẫn bắt CPU thật: bước đốt 25 ms CPU đo ra >= 20 ms (ngưỡng ngân sách không bị làm mù)", () => {
    const ms = measureSyncStepMs(() => burnCpu(25));
    expect(ms).toBeGreaterThanOrEqual(20);
    expect(ms).toBeLessThan(500);
  });

  it("không bao giờ vượt đồng hồ tường và không âm", () => {
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      const ms = measureSyncStepMs(() => burnCpu(1));
      const wall = performance.now() - t0;
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(wall + 0.5);
    }
  });
});

describe("summarizeTickMs", () => {
  it("trung bình, p95, max; mảng rỗng thì 0", () => {
    expect(summarizeTickMs([])).toEqual({ avgMs: 0, p95Ms: 0, maxMs: 0 });
    const r = summarizeTickMs([1, 2, 3, 4, 100]);
    expect(r.avgMs).toBeCloseTo(22, 9);
    expect(r.maxMs).toBe(100);
    expect(r.p95Ms).toBe(100);
  });
});
