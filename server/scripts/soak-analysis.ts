// Phân tích số liệu thử tải dài (soak test) cho M4 3.5 (Issue #282).
// Đánh giá: rò rỉ bộ nhớ (VmRSS, dốc hồi quy tuyến tính OLS), số đo vận hành thật từ /metrics (tick p95 phòng tệ nhất,
// hàng đợi ghi, độ trễ vòng lặp), băng thông WebSocket mỗi client, log server và toàn vẹn dữ liệu.

export type ServerLogCategory = "error" | "monitorAlert" | "startupWarning" | "info";

/**
 * Phân loại một dòng log từ server:
 * - `[ĐÃ ỔN]` là thông báo hết vi phạm giám sát (M4 3.3) -> info (không tính lỗi)
 * - `[CẢNH BÁO]` trước khi sẵn sàng (serverReady = false) là cảnh báo cấu hình khởi động -> startupWarning (bỏ qua)
 * - `[CẢNH BÁO]` sau khi sẵn sàng (serverReady = true) là cảnh báo giám sát (tick, hàng đợi ghi) -> monitorAlert (làm soak ĐỎ)
 * - `[lỗi]`, `unhandledRejection`, `uncaughtException`, stack trace lỗi Node -> error (làm soak ĐỎ)
 * - Dòng thông tin thông thường -> info
 * - **Mọi dòng ở STDERR còn lại -> error** (server chỉ ghi stderr bằng `console.warn` / `console.error`): `console.error("save failed", e)` in
 *   `save failed Error: ENOSPC...` (chữ `Error:` không ở đầu dòng) và mọi dòng của stack trace, nên khớp theo mẫu chữ sẽ bỏ lỡ chính loại lỗi mà
 *   soak sinh ra để bắt (A bắt được khi review #291).
 */
export function classifyServerLogLine(
  line: string,
  ready: boolean,
  stream: "stdout" | "stderr" = "stdout",
): ServerLogCategory {
  if (!line || line.trim() === "") return "info";
  const trimmed = line.trim();

  // [ĐÃ ỔN] là thông báo giám sát kết thúc vi phạm -> info (không tính lỗi)
  if (trimmed.includes("[ĐÃ ỔN]")) return "info";

  // [CẢNH BÁO]
  if (trimmed.includes("[CẢNH BÁO]")) {
    return ready ? "monitorAlert" : "startupWarning";
  }

  // Các dạng lỗi rõ ràng
  if (
    trimmed.includes("[lỗi]") ||
    trimmed.includes("unhandledRejection") ||
    trimmed.includes("uncaughtException") ||
    trimmed.includes("TypeError:") ||
    trimmed.includes("RangeError:") ||
    trimmed.includes("ReferenceError:") ||
    trimmed.includes("AssertionError:") ||
    /^Error:\s/.test(trimmed)
  ) {
    return "error";
  }

  return stream === "stderr" ? "error" : "info";
}

export interface SoakSample {
  /** Giây tính từ lúc bắt đầu đo */
  elapsedSec: number;
  /** Thời điểm timestamp epoch ms */
  timestamp: number;
  /** VmRSS của server (MB) từ /proc/<pid>/status */
  rssMb: number;
  /** Số bot đang kết nối còn sống */
  activeBots: number;
  /** CPU ms luồng chính trung bình mỗi tick trong 10 giây qua (từ /proc/<pid>/sched) */
  cpuMsPerTickAvg: number;
  /** Thời gian xử lý tick p95 (ms) của phòng tệ nhất lấy THỰC TẾ từ /metrics?format=json */
  worstTickP95Ms: number;
  /** Tổng số tick overrun tích lũy từ các phòng trong /metrics */
  tickOverruns: number;
  /** Số lần ghi hồ sơ đang inflight từ /metrics */
  writesInflight: number;
  /** Tuổi lần ghi chờ lâu nhất (ms) từ /metrics */
  writesOldestAgeMs: number;
  /** Số lần ghi thất bại từ /metrics */
  writesFailed: number;
  /** Độ trễ vòng lặp sự kiện p99 (ms) từ /metrics */
  loopLagP99Ms: number;
  /** Byte WebSocket nhận trung bình mỗi tick trên mỗi bot */
  bytesPerTickPerBot: number;
  /** Băng thông nhận KB/s trên mỗi bot */
  rxKBpsPerBot: number;
  /** Số lỗi hoặc disconnect bất thường ghi nhận được trong 10 giây qua */
  sampleErrors: number;
  /** Cờ báo gọi /metrics thất bại hoặc không trả về HTTP 200 */
  metricsFetchFailed?: boolean;
}

export interface SoakThresholds {
  /** Thời gian khởi động (giây) bỏ qua trước khi tính dốc và mức tăng RSS (mặc định 300s = 5 phút; nếu tổng thời gian < 10 phút thì lấy 20% tổng thời gian) */
  warmupSec?: number;
  /** Ngưỡng tăng RSS tối đa sau warmup (MB). Đề xuất 50 MB / 30 phút */
  maxRssDeltaMb?: number;
  /** Ngưỡng dốc dương tối đa của RSS ở nửa sau (MB / phút). Đề xuất 1.0 MB/min */
  maxSecondHalfSlopeMbPerMin?: number;
  /** Ngưỡng tick p95 tối đa của phòng tệ nhất (ms). Ngân sách trong perf.test.ts là 10.0 ms */
  maxWorstTickP95Ms?: number;
  /** Ngưỡng byte WebSocket / tick tối đa cho mỗi bot. Ngân sách perf.test.ts là 600 byte */
  maxBytesPerTick?: number;
  /** Cho phép bao nhiêu lỗi log server? Mặc định 0 */
  maxServerLogErrors?: number;
  /** Cho phép bao nhiêu cảnh báo giám sát sau khi sẵn sàng? Mặc định 0 */
  maxMonitorAlerts?: number;
  /** Tỉ lệ bot rớt kết nối tối đa cho phép. Mặc định 0.05 (không quá 5% rớt) */
  maxDropRatio?: number;
  /** Tuổi lần ghi chờ tối đa (ms). Mặc định 30,000 ms (30s) */
  maxWritesOldestAgeMs?: number;
  /** Độ trễ vòng lặp p99 tối đa (ms). Mặc định 100 ms */
  maxLoopLagP99Ms?: number;
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
}

/**
 * Hồi quy tuyến tính y = slope * x + intercept theo phương pháp bình phương tối thiểu (OLS).
 * x thường là thời gian tính bằng phút, y là VmRSS (MB).
 */
export function linearRegression(points: { x: number; y: number }[]): LinearRegressionResult {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 1 };
  if (n === 1) return { slope: 0, intercept: points[0].y, r2: 1 };

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let covXY = 0;
  let varX = 0;
  let ssTot = 0;

  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    ssTot += dy * dy;
  }

  if (varX === 0) {
    return { slope: 0, intercept: meanY, r2: 1 };
  }

  const slope = covXY / varX;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  for (const p of points) {
    const pred = slope * p.x + intercept;
    const diff = p.y - pred;
    ssRes += diff * diff;
  }

  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

export interface ExtraSoakContext {
  serverLogErrors?: number;
  monitorAlerts?: number;
  auditErrorsTotal?: number;
  hongFilesCount?: number;
  currencyConservationPassed?: boolean;
}

export interface SoakAnalysisResult {
  pass: boolean;
  reasons: string[];
  totalSamples: number;
  totalDurationSec: number;
  warmupSec: number;
  startRssMb: number;
  endRssMb: number;
  postWarmupRssMb: number;
  rssDeltaAfterWarmupMb: number;
  overallRssSlopeMbPerMin: number;
  secondHalfRssSlopeMbPerMin: number;
  cpuMsPerTickAvg: number;
  worstTickP95AvgMs: number;
  worstTickP95MaxMs: number;
  totalTickOverruns: number;
  maxWritesInflight: number;
  maxWritesOldestAgeMs: number;
  totalWritesFailed: number;
  maxLoopLagP99Ms: number;
  bytesPerTickAvg: number;
  bytesPerTickP95: number;
  rxKBpsAvgPerBot: number;
  initialBots: number;
  endBots: number;
  droppedBots: number;
  totalSampleErrors: number;
  metricsFetchFailedCount: number;
  serverLogErrors: number;
  monitorAlerts: number;
  auditErrorsTotal?: number;
  hongFilesCount?: number;
  currencyConservationPassed?: boolean;
  thresholds: Required<SoakThresholds>;
}

/**
 * Phân tích chuỗi mẫu đo của một lượt soak test và kiểm tra các tiêu chuẩn ĐẠT / KHÔNG ĐẠT.
 */
export function analyzeSoak(
  samples: SoakSample[],
  customThresholds: SoakThresholds = {},
  extra: ExtraSoakContext = {},
): SoakAnalysisResult {
  const reasons: string[] = [];

  const defaultDuration = samples.length > 0 ? samples[samples.length - 1].elapsedSec : 0;
  const defaultWarmup = defaultDuration >= 600 ? 300 : Math.round(defaultDuration * 0.2);

  const thresholds: Required<SoakThresholds> = {
    warmupSec: customThresholds.warmupSec ?? defaultWarmup,
    maxRssDeltaMb: customThresholds.maxRssDeltaMb ?? 50.0,
    maxSecondHalfSlopeMbPerMin: customThresholds.maxSecondHalfSlopeMbPerMin ?? 1.0,
    maxWorstTickP95Ms: customThresholds.maxWorstTickP95Ms ?? 10.0,
    maxBytesPerTick: customThresholds.maxBytesPerTick ?? 600,
    maxServerLogErrors: customThresholds.maxServerLogErrors ?? 0,
    maxMonitorAlerts: customThresholds.maxMonitorAlerts ?? 0,
    maxDropRatio: customThresholds.maxDropRatio ?? 0.05,
    maxWritesOldestAgeMs: customThresholds.maxWritesOldestAgeMs ?? 30000,
    maxLoopLagP99Ms: customThresholds.maxLoopLagP99Ms ?? 100,
  };

  if (samples.length === 0) {
    return {
      pass: false,
      reasons: ["Không có mẫu đo nào"],
      totalSamples: 0,
      totalDurationSec: 0,
      warmupSec: 0,
      startRssMb: 0,
      endRssMb: 0,
      postWarmupRssMb: 0,
      rssDeltaAfterWarmupMb: 0,
      overallRssSlopeMbPerMin: 0,
      secondHalfRssSlopeMbPerMin: 0,
      cpuMsPerTickAvg: 0,
      worstTickP95AvgMs: 0,
      worstTickP95MaxMs: 0,
      totalTickOverruns: 0,
      maxWritesInflight: 0,
      maxWritesOldestAgeMs: 0,
      totalWritesFailed: 0,
      maxLoopLagP99Ms: 0,
      bytesPerTickAvg: 0,
      bytesPerTickP95: 0,
      rxKBpsAvgPerBot: 0,
      initialBots: 0,
      endBots: 0,
      droppedBots: 0,
      totalSampleErrors: 0,
      metricsFetchFailedCount: 0,
      serverLogErrors: extra.serverLogErrors ?? 0,
      monitorAlerts: extra.monitorAlerts ?? 0,
      thresholds,
    };
  }

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const totalDurationSec = lastSample.elapsedSec;
  const warmupSec = thresholds.warmupSec;

  const postWarmupSamples = samples.filter((s) => s.elapsedSec >= warmupSec);
  const effectivePostWarmup = postWarmupSamples.length > 0 ? postWarmupSamples : samples;
  const postWarmupSample = effectivePostWarmup[0];

  const startRssMb = Number(firstSample.rssMb.toFixed(2));
  const postWarmupRssMb = Number(postWarmupSample.rssMb.toFixed(2));
  const endRssMb = Number(lastSample.rssMb.toFixed(2));
  const rssDeltaAfterWarmupMb = Number((endRssMb - postWarmupRssMb).toFixed(2));

  // Hồi quy toàn bộ sau warmup
  const postWarmupPoints = effectivePostWarmup.map((s) => ({
    x: s.elapsedSec / 60,
    y: s.rssMb,
  }));
  const overallReg = linearRegression(postWarmupPoints);
  const overallRssSlopeMbPerMin = Number(overallReg.slope.toFixed(3));

  // Hồi quy nửa sau thời gian
  const halfDurationSec = totalDurationSec / 2;
  const secondHalfSamples = samples.filter((s) => s.elapsedSec >= halfDurationSec);
  const effectiveSecondHalf = secondHalfSamples.length > 0 ? secondHalfSamples : samples;
  const secondHalfPoints = effectiveSecondHalf.map((s) => ({
    x: s.elapsedSec / 60,
    y: s.rssMb,
  }));
  const secondHalfReg = linearRegression(secondHalfPoints);
  const secondHalfRssSlopeMbPerMin = Number(secondHalfReg.slope.toFixed(3));

  // Thống kê CPU luồng chính
  const cpuMsAvg = samples.reduce((acc, s) => acc + s.cpuMsPerTickAvg, 0) / samples.length;

  // Thống kê tick p95 thật từ /metrics
  const worstTickAvg = samples.reduce((acc, s) => acc + s.worstTickP95Ms, 0) / samples.length;
  const worstTickMax = Math.max(...samples.map((s) => s.worstTickP95Ms));

  // Thống kê metrics khác
  const lastSampleMetrics = lastSample;
  const totalTickOverruns = lastSampleMetrics.tickOverruns;
  const maxWritesInflight = Math.max(...samples.map((s) => s.writesInflight));
  const maxWritesOldestAgeMs = Math.max(...samples.map((s) => s.writesOldestAgeMs));
  const totalWritesFailed = Math.max(...samples.map((s) => s.writesFailed));
  const maxLoopLagP99Ms = Math.max(...samples.map((s) => s.loopLagP99Ms));
  const metricsFetchFailedCount = samples.filter((s) => s.metricsFetchFailed).length;

  // Thống kê byte WebSocket nhận / tick / bot
  const bytesAvg = samples.reduce((acc, s) => acc + s.bytesPerTickPerBot, 0) / samples.length;
  const bytesSorted = [...samples.map((s) => s.bytesPerTickPerBot)].sort((a, b) => a - b);
  const bytesP95Idx = Math.min(bytesSorted.length - 1, Math.floor(0.95 * bytesSorted.length));
  const bytesP95 = bytesSorted[bytesP95Idx] ?? 0;

  // Thống kê băng thông nhận
  const rxKBpsAvg = samples.reduce((acc, s) => acc + s.rxKBpsPerBot, 0) / samples.length;

  // Thống kê bot và lỗi
  const initialBots = firstSample.activeBots;
  const endBots = lastSample.activeBots;
  const droppedBots = Math.max(0, initialBots - endBots);
  const totalSampleErrors = samples.reduce((acc, s) => acc + s.sampleErrors, 0);
  const serverLogErrors = extra.serverLogErrors ?? 0;
  const monitorAlerts = extra.monitorAlerts ?? 0;

  // 1. Kiểm tra rò rỉ bộ nhớ
  if (rssDeltaAfterWarmupMb > thresholds.maxRssDeltaMb) {
    reasons.push(
      `VmRSS tăng sau khởi động vượt ngưỡng: +${rssDeltaAfterWarmupMb} MB > ${thresholds.maxRssDeltaMb} MB`,
    );
  }
  if (
    secondHalfRssSlopeMbPerMin > thresholds.maxSecondHalfSlopeMbPerMin &&
    rssDeltaAfterWarmupMb > 10
  ) {
    reasons.push(
      `Dốc VmRSS nửa sau tăng liên tục vượt ngưỡng: +${secondHalfRssSlopeMbPerMin} MB/phút > ${thresholds.maxSecondHalfSlopeMbPerMin} MB/phút`,
    );
  }

  // 2. Kiểm tra gọi /metrics
  if (metricsFetchFailedCount > 0) {
    reasons.push(
      `Thu thập số đo /metrics thất bại (${metricsFetchFailedCount} lần lỗi hoặc không 200)`,
    );
  }

  // 3. Kiểm tra độ trễ tick p95 thật từ /metrics (phòng tệ nhất)
  if (worstTickMax > thresholds.maxWorstTickP95Ms) {
    reasons.push(
      `Tick p95 phòng tệ nhất vượt ngân sách: ${worstTickMax.toFixed(2)} ms > ${thresholds.maxWorstTickP95Ms} ms`,
    );
  }

  // 4. Kiểm tra hàng đợi ghi nhân vật (writes)
  if (maxWritesOldestAgeMs > thresholds.maxWritesOldestAgeMs) {
    reasons.push(
      `Tuổi lần ghi nhân vật lâu nhất vượt ngưỡng: ${(maxWritesOldestAgeMs / 1000).toFixed(1)} s > ${(thresholds.maxWritesOldestAgeMs / 1000).toFixed(1)} s`,
    );
  }
  if (totalWritesFailed > 0) {
    reasons.push(`Phát hiện ${totalWritesFailed} lần ghi nhân vật thất bại trong /metrics`);
  }

  // 5. Kiểm tra độ trễ vòng lặp sự kiện loop lag
  if (maxLoopLagP99Ms > thresholds.maxLoopLagP99Ms) {
    reasons.push(
      `Độ trễ vòng lặp sự kiện p99 vượt ngưỡng: ${maxLoopLagP99Ms.toFixed(1)} ms > ${thresholds.maxLoopLagP99Ms} ms`,
    );
  }

  // 6. Kiểm tra byte/tick mỗi client
  if (bytesAvg > thresholds.maxBytesPerTick) {
    reasons.push(
      `Byte WebSocket nhận mỗi client vượt ngân sách: ${Math.round(bytesAvg)} B/tick > ${thresholds.maxBytesPerTick} B/tick`,
    );
  }

  // 7. Kiểm tra lỗi log server
  if (serverLogErrors > thresholds.maxServerLogErrors) {
    reasons.push(
      `Phát hiện ${serverLogErrors} lỗi trong log server ([lỗi] / unhandledRejection / ngoại lệ)`,
    );
  }

  // 8. Kiểm tra cảnh báo giám sát sau ready
  if (monitorAlerts > thresholds.maxMonitorAlerts) {
    reasons.push(
      `Phát hiện ${monitorAlerts} cảnh báo giám sát [CẢNH BÁO] từ server sau khi sẵn sàng`,
    );
  }

  // 9. Kiểm tra bot rớt kết nối
  if (initialBots > 0 && droppedBots / initialBots > thresholds.maxDropRatio) {
    reasons.push(
      `Bot bị rớt kết nối bất thường vượt ngưỡng: ${droppedBots}/${initialBots} bot (${((droppedBots / initialBots) * 100).toFixed(1)}% > ${(thresholds.maxDropRatio * 100).toFixed(1)}%)`,
    );
  }

  // 10. Kiểm tra toàn vẹn kiem-save
  if (typeof extra.auditErrorsTotal === "number" && extra.auditErrorsTotal > 0) {
    reasons.push(`kiem-save phát hiện ${extra.auditErrorsTotal} lỗi toàn vẹn tệp lưu`);
  }

  // 11. Kiểm tra tệp hỏng *.hong-*
  if (typeof extra.hongFilesCount === "number" && extra.hongFilesCount > 0) {
    reasons.push(`Phát hiện ${extra.hongFilesCount} tệp hỏng bị cách ly (*.hong-*)`);
  }

  // 12. Kiểm tra bảo toàn tiền tệ
  if (extra.currencyConservationPassed === false) {
    reasons.push("Bảo toàn Linh thạch thất bại: Tổng tiền cuối kỳ vượt tổng ban đầu + phát sinh");
  }

  return {
    pass: reasons.length === 0,
    reasons,
    totalSamples: samples.length,
    totalDurationSec,
    warmupSec,
    startRssMb,
    endRssMb,
    postWarmupRssMb,
    rssDeltaAfterWarmupMb,
    overallRssSlopeMbPerMin,
    secondHalfRssSlopeMbPerMin,
    cpuMsPerTickAvg: Number(cpuMsAvg.toFixed(2)),
    worstTickP95AvgMs: Number(worstTickAvg.toFixed(2)),
    worstTickP95MaxMs: Number(worstTickMax.toFixed(2)),
    totalTickOverruns,
    maxWritesInflight,
    maxWritesOldestAgeMs,
    totalWritesFailed,
    maxLoopLagP99Ms: Number(maxLoopLagP99Ms.toFixed(1)),
    bytesPerTickAvg: Math.round(bytesAvg),
    bytesPerTickP95: Math.round(bytesP95),
    rxKBpsAvgPerBot: Number(rxKBpsAvg.toFixed(2)),
    initialBots,
    endBots,
    droppedBots,
    totalSampleErrors,
    metricsFetchFailedCount,
    serverLogErrors,
    monitorAlerts,
    auditErrorsTotal: extra.auditErrorsTotal,
    hongFilesCount: extra.hongFilesCount,
    currencyConservationPassed: extra.currencyConservationPassed,
    thresholds,
  };
}

/**
 * Định dạng bảng tổng kết thử tải dài để in ra màn hình hoặc ghi vào báo cáo Markdown.
 */
export function formatSoakTable(res: SoakAnalysisResult): string {
  const durationMin = (res.totalDurationSec / 60).toFixed(1);
  const statusStr = res.pass ? "ĐẠT (PASS)" : "KHÔNG ĐẠT (FAIL)";
  const th = res.thresholds;

  const lines = [
    "================================================================================",
    `                     KẾT QUẢ THỬ TẢI DÀI (SOAK TEST) - ${statusStr}`,
    "================================================================================",
    `Thời lượng đo:          ${durationMin} phút (${res.totalSamples} mẫu, mỗi 10 giây)`,
    `Số bot tham gia:        ${res.initialBots} khởi tạo -> ${res.endBots} kết thúc (rớt ${res.droppedBots})`,
    "--------------------------------------------------------------------------------",
    "BỘ NHỚ TIẾN TRÌNH SERVER (VmRSS):",
    `  - Ban đầu:            ${res.startRssMb} MB`,
    `  - Sau khởi động (${(res.warmupSec / 60).toFixed(1)}m): ${res.postWarmupRssMb} MB`,
    `  - Kết thúc:           ${res.endRssMb} MB`,
    `  - Tăng sau warmup:    ${res.rssDeltaAfterWarmupMb > 0 ? "+" : ""}${res.rssDeltaAfterWarmupMb} MB (ngưỡng: <= ${th.maxRssDeltaMb.toFixed(1)} MB)`,
    `  - Dốc nửa sau (OLS):  ${res.secondHalfRssSlopeMbPerMin > 0 ? "+" : ""}${res.secondHalfRssSlopeMbPerMin} MB/phút (ngưỡng: <= ${th.maxSecondHalfSlopeMbPerMin.toFixed(2)} MB/phút)`,
    "--------------------------------------------------------------------------------",
    "SỐ ĐO VẬN HÀNH THẬT (/metrics & /proc/<pid>/sched):",
    `  - Tick p95 phòng tệ nhất: TB ${res.worstTickP95AvgMs} ms, Max ${res.worstTickP95MaxMs} ms (ngân sách: <= ${th.maxWorstTickP95Ms.toFixed(1)} ms)`,
    `  - Tick overruns (>50ms): ${res.totalTickOverruns}`,
    `  - CPU luồng chính/tick:  TB ${res.cpuMsPerTickAvg} ms/tick`,
    `  - Hàng đợi ghi nhân vật: Inflight max ${res.maxWritesInflight}, Tuổi max ${(res.maxWritesOldestAgeMs / 1000).toFixed(1)} s, Lỗi ${res.totalWritesFailed}`,
    `  - Độ trễ vòng lặp p99:   ${res.maxLoopLagP99Ms} ms (ngưỡng: <= ${th.maxLoopLagP99Ms} ms)`,
    "--------------------------------------------------------------------------------",
    "BĂNG THÔNG WEBSOCKET CLIENT:",
    `  - Nhận trung bình:       ${res.bytesPerTickAvg} B/tick (ngân sách: <= ${th.maxBytesPerTick} B/tick)`,
    `  - Phân vị p95:           ${res.bytesPerTickP95} B/tick`,
    `  - Băng thông nhận TB:    ${res.rxKBpsAvgPerBot} KB/s mỗi bot`,
    "--------------------------------------------------------------------------------",
    "TOÀN VẸN DỮ LIỆU & TÍNH ỔN ĐỊNH:",
    `  - Cảnh báo giám sát:     ${res.monitorAlerts} (yêu cầu: <= ${th.maxMonitorAlerts})`,
    `  - Lỗi log server:        ${res.serverLogErrors} (yêu cầu: <= ${th.maxServerLogErrors})`,
    `  - Lỗi gọi /metrics:      ${res.metricsFetchFailedCount} (yêu cầu: 0)`,
    `  - kiem-save sau soak:    ${res.auditErrorsTotal ?? 0} lỗi (yêu cầu: 0)`,
    `  - Tệp hỏng (*.hong-*):   ${res.hongFilesCount ?? 0} (yêu cầu: 0)`,
    `  - Bảo toàn tiền tệ:      ${res.currencyConservationPassed === false ? "KHÔNG ĐẠT" : "ĐẠT"}`,
    "================================================================================",
  ];

  if (!res.pass) {
    lines.push("LÝ DO KHÔNG ĐẠT:");
    for (const r of res.reasons) {
      lines.push(`  [X] ${r}`);
    }
    lines.push("================================================================================");
  }

  return lines.join("\n");
}
