// Unit test cho bộ phân tích số liệu thử tải dài (soak-analysis.ts)
import { describe, expect, it } from "vitest";
import {
  analyzeSoak,
  classifyServerLogLine,
  formatSoakTable,
  linearRegression,
  type SoakSample,
} from "./soak-analysis";

describe("classifyServerLogLine", () => {
  it("dòng rỗng hoặc khoảng trắng trả 'info'", () => {
    expect(classifyServerLogLine("", false)).toBe("info");
    expect(classifyServerLogLine("   \t  ", true)).toBe("info");
  });

  it("[ĐÃ ỔN] luôn trả 'info' kể cả trước hay sau khi sẵn sàng", () => {
    expect(classifyServerLogLine("[ĐÃ ỔN] tick p95 đã hạ xuống 3.2 ms", true)).toBe("info");
    expect(classifyServerLogLine("[ĐÃ ỔN] hàng đợi ghi đã xả hết", false)).toBe("info");
  });

  it("[CẢNH BÁO] trước khi sẵn sàng là 'startupWarning', sau khi sẵn sàng là 'monitorAlert'", () => {
    const startupLine = "[CẢNH BÁO] NODE_ENV không phải 'production': cho phép lệnh /give";
    expect(classifyServerLogLine(startupLine, false)).toBe("startupWarning");

    const monitorLine = "[CẢNH BÁO] tick p95 của 'lac_ha' là 28.5 ms (> 25 ms)";
    expect(classifyServerLogLine(monitorLine, true)).toBe("monitorAlert");
  });

  it("phát hiện chính xác các dạng lỗi nghiêm trọng trả 'error'", () => {
    expect(classifyServerLogLine("[lỗi] Không thể kết nối cơ sở dữ liệu", true)).toBe("error");
    expect(classifyServerLogLine("unhandledRejection: connection reset", true)).toBe("error");
    expect(classifyServerLogLine("uncaughtException: out of memory", false)).toBe("error");
    expect(classifyServerLogLine("TypeError: Cannot read properties of undefined", true)).toBe(
      "error",
    );
    expect(classifyServerLogLine("AssertionError: state invariant violated", true)).toBe("error");
    expect(classifyServerLogLine("Error: ETIMEDOUT", true)).toBe("error");
  });

  it("log thông tin thông thường trả 'info'", () => {
    expect(classifyServerLogLine("Khởi động server trên cổng 2567", false)).toBe("info");
    expect(classifyServerLogLine("Đã mở phòng world (lac_ha)", true)).toBe("info");
    expect(classifyServerLogLine("Người chơi Bot 001 vào phòng", true)).toBe("info");
  });
});

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
        cpuMsPerTickAvg: 1.8,
        worstTickP95Ms: 2.5,
        tickOverruns: 0,
        writesInflight: 1,
        writesOldestAgeMs: 50,
        writesFailed: 0,
        loopLagP99Ms: 15,
        bytesPerTickPerBot: 410,
        rxKBpsPerBot: 8.2,
        sampleErrors: 0,
        metricsFetchFailed: false,
        ...overrides,
      });
    }
    return samples;
  }

  it("ĐẠT (PASS) khi máy chủ chạy ổn định 30 phút không rò rỉ bộ nhớ, tick thấp, /metrics tốt, 0 lỗi", () => {
    // 30 phút, đo mỗi 10s = 180 mẫu
    const samples = generateSamples(180, 10, (sec) => {
      if (sec <= 300) return 80 + (sec / 300) * 15;
      return 95 + Math.sin(sec / 60) * 2;
    });

    const res = analyzeSoak(
      samples,
      {},
      {
        serverLogErrors: 0,
        monitorAlerts: 0,
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
    expect(res.worstTickP95MaxMs).toBeLessThan(10);
    expect(res.bytesPerTickAvg).toBeLessThan(600);
    expect(res.serverLogErrors).toBe(0);
    expect(res.monitorAlerts).toBe(0);
  });

  it("KHÔNG ĐẠT khi VmRSS tăng vọt > 50 MB sau khởi động (rò rỉ bộ nhớ)", () => {
    const samples = generateSamples(180, 10, (sec) => {
      if (sec <= 300) return 90;
      return 90 + ((sec - 300) / 1500) * 70;
    });

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("VmRSS tăng sau khởi động vượt ngưỡng"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi dốc nửa sau > 1.0 MB/phút liên tục", () => {
    const samples = generateSamples(180, 10, (sec) => {
      if (sec <= 900) return 90;
      return 90 + ((sec - 900) / 60) * 1.8;
    });

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Dốc VmRSS nửa sau tăng liên tục"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi tick p95 phòng tệ nhất từ /metrics > 10 ms (vượt ngân sách perf.test.ts)", () => {
    const samples = generateSamples(60, 10, () => 90, {
      worstTickP95Ms: 14.5,
    });

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Tick p95 phòng tệ nhất vượt ngân sách"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi hàng đợi ghi nhân vật bị kẹt (tuổi > 30s hoặc failed > 0)", () => {
    const samplesStuck = generateSamples(60, 10, () => 90, {
      writesOldestAgeMs: 35000,
    });
    const resStuck = analyzeSoak(samplesStuck);
    expect(resStuck.pass).toBe(false);
    expect(
      resStuck.reasons.some((r) => r.includes("Tuổi lần ghi nhân vật lâu nhất vượt ngưỡng")),
    ).toBe(true);

    const samplesFailed = generateSamples(60, 10, () => 90, {
      writesFailed: 2,
    });
    const resFailed = analyzeSoak(samplesFailed);
    expect(resFailed.pass).toBe(false);
    expect(resFailed.reasons.some((r) => r.includes("Phát hiện 2 lần ghi nhân vật thất bại"))).toBe(
      true,
    );
  });

  it("KHÔNG ĐẠT khi độ trễ vòng lặp sự kiện loop lag p99 > 100 ms", () => {
    const samples = generateSamples(60, 10, () => 90, {
      loopLagP99Ms: 125,
    });

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Độ trễ vòng lặp sự kiện p99 vượt ngưỡng"))).toBe(
      true,
    );
  });

  it("KHÔNG ĐẠT khi gọi /metrics thất bại", () => {
    const samples = generateSamples(60, 10, () => 90);
    samples[10].metricsFetchFailed = true;

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Thu thập số đo /metrics thất bại"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi có cảnh báo giám sát [CẢNH BÁO] sau khi server đã sẵn sàng", () => {
    const samples = generateSamples(60, 10, () => 90);
    const res = analyzeSoak(samples, {}, { monitorAlerts: 1 });

    expect(res.pass).toBe(false);
    expect(res.reasons.some((r) => r.includes("Phát hiện 1 cảnh báo giám sát"))).toBe(true);
  });

  it("KHÔNG ĐẠT khi byte WebSocket nhận / tick > 600 byte (vượt ngân sách StateView)", () => {
    const samples = generateSamples(60, 10, () => 90, {
      bytesPerTickPerBot: 750,
    });

    const res = analyzeSoak(samples);
    expect(res.pass).toBe(false);
    expect(
      res.reasons.some((r) => r.includes("Byte WebSocket nhận mỗi client vượt ngân sách")),
    ).toBe(true);
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

  it("formatSoakTable hiển thị đầy đủ các trường và số đo từ /metrics", () => {
    const samples = generateSamples(60, 10, () => 90);
    const res = analyzeSoak(samples, {}, { serverLogErrors: 0, monitorAlerts: 0 });
    const formatted = formatSoakTable(res);

    expect(formatted).toContain("KẾT QUẢ THỬ TẢI DÀI (SOAK TEST)");
    expect(formatted).toContain("ĐẠT (PASS)");
    expect(formatted).toContain("BỘ NHỚ TIẾN TRÌNH SERVER (VmRSS)");
    expect(formatted).toContain("SỐ ĐO VẬN HÀNH THẬT (/metrics & /proc/<pid>/sched)");
    expect(formatted).toContain("Tick p95 phòng tệ nhất");
    expect(formatted).toContain("Hàng đợi ghi nhân vật");
    expect(formatted).toContain("BĂNG THÔNG WEBSOCKET CLIENT");
    expect(formatted).toContain("TOÀN VẸN DỮ LIỆU & TÍNH ỔN ĐỊNH");
  });
});
