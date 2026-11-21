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
    "KHÔNG cộng CPU của luồng khác trong cùng tiến trình: luồng bị chặn (ngủ trong nhân) cạnh một worker đang quay vẫn đo ~0",
    async () => {
      const busy = new Worker("for(;;){}", { eval: true }); // như một tệp test khác đang chạy song song
      try {
        await new Promise((r) => setTimeout(r, 300)); // cho luồng bận chạy hẳn
        // Chặn luồng này (ngủ trong nhân, ~0 CPU) cho tới khi CPU CẢ TIẾN TRÌNH đã tăng >= 30 ms (tức luồng bận kia THẬT SỰ đã chạy), tối đa 5 giây.
        // Cố định 40 ms tường thì khi máy quá tải luồng bận bị bỏ đói và tiền đề không đạt (A đo: 12/12 lần đỏ dưới 40 tiến trình bận trên 20 nhân, review #1232);
        // cửa sổ cố định dài hơn thì chỉ giảm chứ không bảo đảm. Cách này ĐẢM BẢO tiền đề và bản `process.cpuUsage()` cũ luôn đo ra >= 30.
        let procCpuMs = 0;
        const ms = measureSyncStepMs(() => {
          const before = process.cpuUsage();
          const giveUp = performance.now() + 5000;
          do {
            blockWithoutCpu(10);
            const proc = process.cpuUsage(before);
            procCpuMs = (proc.user + proc.system) / 1000;
          } while (procCpuMs < 30 && performance.now() < giveUp);
        });
        // điều kiện của phép thử: CPU CẢ TIẾN TRÌNH thật sự bị luồng bận đội lên (nếu không thì phép thử không chứng minh gì)
        expect(procCpuMs).toBeGreaterThanOrEqual(30);
        // `process.cpuUsage()` cũ sẽ ra >= 30 (cộng luồng bận); CPU luồng thì ~0
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
