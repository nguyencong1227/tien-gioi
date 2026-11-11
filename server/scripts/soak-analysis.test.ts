// Unit test cho bộ phân tích số liệu thử tải dài (soak-analysis.ts)
import { describe, expect, it } from "vitest";
import { analyzeSoak, formatSoakTable, linearRegression, type SoakSample } from "./soak-analysis";

describe("linearRegression", () => {
  it("trả slope và intercept chính xác cho đường thẳng y = 2x + 10", () => {
    const points = [
      { x: 0, y: 10 },
      { x: 1, y: 12 },
      { x: 2, y: 14 },
      { x: 3, y: 16 },
      { x: 4, y: 18 },
    ];
    const res = linearRegression(points);
    expect(res.slope).toBeCloseTo(2, 5);
    expect(res.intercept).toBeCloseTo(10, 5);
    expect(res.r2).toBeCloseTo(1, 5);
  });

  it("trả slope = 0 khi dữ liệu nằm ngang y = c", () => {
    const points = [
      { x: 1, y: 50 },
      { x: 2, y: 50 },
      { x: 3, y: 50 },
    ];
    const res = linearRegression(points);
    expect(res.slope).toBeCloseTo(0, 5);
    expect(res.intercept).toBeCloseTo(50, 5);
  });

  it("xử lý an toàn khi chỉ có 0 hoặc 1 điểm", () => {
    expect(linearRegression([])).toEqual({ slope: 0, intercept: 0, r2: 1 });
    expect(linearRegression([{ x: 5, y: 20 }])).toEqual({ slope: 0, intercept: 20, r2: 1 });
  });
});

describe("analyzeSoak", () => {
  function generateSamples(
    count: number,
    intervalSec: number,
    rssFn: (sec: number) => number,
    overrides: Partial<SoakSample> = {},
  ): SoakSample[] {
    const samples: SoakSample[] = [];
    for (let i = 1; i <= count; i++) {
      const elapsedSec = i * intervalSec;
      samples.push({
        elapsedSec,
        timestamp: Date.now() + elapsedSec * 1000,
        rssMb: rssFn(elapsedSec),
        activeBots: 100,
        tickCpuAvgMs: 1.8,
        tickCpuP95Ms: 2.5,
        patchBytesPerTick: 410,
        rxKBpsPerBot: 8.2,
        txKBpsPerBot: 1.1,
        sampleErrors: 0,
        ...overrides,
      });
    }
    return samples;
  }

  it("ĐẠT (PASS) khi máy chủ chạy ổn định 30 phút không rò rỉ bộ nhớ, tick thấp, 0 lỗi", () => {
    // 30 phút, đo mỗi 10s = 180 mẫu
    // Khởi động tăng nhẹ từ 80MB lên 95MB trong 5 phút đầu, sau đó dao động ổn định quanh 96MB
    const samples = generateSamples(180, 10, (sec) => {
      if (sec <= 300) return 80 + (sec / 300) * 15;
      return 95 + Math.sin(sec / 60) * 2;
    });

    const res = analyzeSoak(
      samples,
      {},
      {
        serverLogErrors: 0,
        auditErrorsTotal: 0,
        hongFilesCount: 0,
        currencyConservationPassed: true,
      },
    );

    expect(res.pass).toBe(true);
    expect(res.reasons).toEqual([]);
    expect(res.startRssMb).toBeCloseTo(80.5, 1);
    expect(res.rssDeltaAfterWarmupMb).toBeLessThan(10);
    expect(res.secondHalfRssSlopeMbPerMin).toBeLessThan(0.5);
    expect(res.tickCpuP95Ms).toBeLessThan(10);
    expect(res.patchBytesAvg).toBeLessThan(600);
    expect(res.serverLogErrors).toBe(0);
  });

  it("KHÔNG ĐẠT khi VmRSS tăng vọt > 50 MB sau khởi động (rò rỉ bộ nhớ)", () => {
    // Tăng đều từ 90 lên 160 sau warmup (+70 MB)
    const samples = generateSamples(180, 10, (sec) => {
      if (sec <= 300) return 90;
      return 90 + ((sec - 300) / 1500) * 70;
    });

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("VmRSS tăng sau khởi động vượt ngưỡng"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi dốc nửa sau > 1.0 MB/phút liên tục", () => {
    // Nửa sau tăng mạnh với dốc 1.8 MB/phút
    const samples = generateSamples(180, 10, (sec) => {
      if (sec <= 900) return 90;
      return 90 + ((sec - 900) / 60) * 1.8;
    });

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Dốc VmRSS nửa sau tăng liên tục"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi độ trễ tick CPU p95 > 10 ms (vượt ngân sách perf.test.ts)", () => {
    const samples = generateSamples(60, 10, () => 90, {
      tickCpuP95Ms: 14.5,
    });

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("CPU tick p95 vượt ngân sách"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi bản vá patch bytes / tick > 600 byte (vượt ngân sách StateView)", () => {
    const samples = generateSamples(60, 10, () => 90, {
      patchBytesPerTick: 750,
    });

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Bản vá StateView mỗi client vượt ngân sách"))).toBe(
      true,
    );
  });

  it("KHÔNG ĐẠT khi log server xuất hiện lỗi ([lỗi] / unhandledRejection)", () => {
    const samples = generateSamples(60, 10, () => 90);
    const res = analyzeSoak(samples, {}, { serverLogErrors: 3 });

    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Phát hiện 3 lỗi trong log server"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi bot bị rớt mạng bất thường > 5%", () => {
    const samples = generateSamples(60, 10, () => 90);
    samples[samples.length - 1].activeBots = 85; // rớt 15 bot (15%)

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Bot bị rớt kết nối bất thường"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi kiem-save phát hiện lỗi dữ liệu", () => {
    const samples = generateSamples(60, 10, () => 90);
    const res = analyzeSoak(samples, {}, { auditErrorsTotal: 2 });

    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("kiem-save phát hiện 2 lỗi"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi phát hiện tệp hỏng *.hong-*", () => {
    const samples = generateSamples(60, 10, () => 90);
    const res = analyzeSoak(samples, {}, { hongFilesCount: 1 });

    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Phát hiện 1 tệp hỏng"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi bảo toàn Linh thạch thất bại", () => {
    const samples = generateSamples(60, 10, () => 90);
    const res = analyzeSoak(samples, {}, { currencyConservationPassed: false });

    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Bảo toàn Linh thạch thất bại"))).toBe(true);
  });

  it("formatSoakTable hiển thị đầy đủ các trường và trạng thái", () => {
    const samples = generateSamples(60, 10, () => 90);
    const res = analyzeSoak(samples, {}, { serverLogErrors: 0 });
    const formatted = formatSoakTable(res);

    expect(formatted).toContain("KẾT QUẢ THỬ TẢI DÀI (SOAK TEST)");
    expect(formatted).toContain("ĐẠT (PASS)");
    expect(formatted).toContain("BỘ NHỚ TIẾN TRÌNH SERVER (VmRSS)");
    expect(formatted).toContain("ĐỘ TRỄ TICK CPU SERVER");
    expect(formatted).toContain("BĂNG THÔNG STATEVIEW MÃ HOÁ");
    expect(formatted).toContain("TOÀN VẸN DỮ LIỆU & TÍNH ỔN ĐỊNH");
  });
});
