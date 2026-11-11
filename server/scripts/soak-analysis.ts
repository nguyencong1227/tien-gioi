// Phân tích số liệu thử tải dài (soak test) cho M4 3.5 (Issue #282).
// Đánh giá: rò rỉ bộ nhớ (VmRSS, dốc hồi quy tuyến tính), độ trễ tick CPU p95,
// băng thông patch state mỗi client, số lỗi log server, ngắt kết nối và toàn vẹn dữ liệu.

export interface SoakSample {
  /** Giây tính từ lúc bắt đầu đo */
  elapsedSec: number;
  /** Thời điểm timestamp epoch ms */
  timestamp: number;
  /** VmRSS của server (MB) từ /proc/<pid>/status */
  rssMb: number;
  /** Số bot đang kết nối còn sống */
  activeBots: number;
  /** CPU ms trung bình mỗi tick trong 10 giây qua */
  tickCpuAvgMs: number;
  /** CPU ms p95 mỗi tick trong 10 giây qua */
  tickCpuP95Ms: number;
  /** Patch bytes nhận trung bình mỗi tick trên mỗi bot */
  patchBytesPerTick: number;
  /** Băng thông nhận KB/s trên mỗi bot */
  rxKBpsPerBot: number;
  /** Băng thông gửi KB/s trên mỗi bot */
  txKBpsPerBot: number;
  /** Số lỗi hoặc disconnect bất thường ghi nhận được trong 10 giây qua */
  sampleErrors: number;
}

export interface SoakThresholds {
  /** Thời gian khởi động (giây) bỏ qua trước khi tính dốc và mức tăng RSS (mặc định 300s = 5 phút; nếu tổng thời gian < 10 phút thì lấy 20% tổng thời gian) */
  warmupSec?: number;
  /** Ngưỡng tăng RSS tối đa sau warmup (MB). Đề xuất 50 MB / 30 phút */
  maxRssDeltaMb?: number;
  /** Ngưỡng dốc dương tối đa của RSS ở nửa sau (MB / phút). Đề xuất 1.0 MB/min */
  maxSecondHalfSlopeMbPerMin?: number;
  /** Ngưỡng tick p95 tối đa (ms). Ngân sách trong perf.test.ts là 10 ms */
  maxTickP95Ms?: number;
  /** Ngưỡng patch bytes / tick tối đa cho mỗi client. Ngân sách perf.test.ts là 600 byte (crowd) / 520 byte (hunt) */
  maxPatchBytesPerTick?: number;
  /** Cho phép bao nhiêu lỗi log server? Mặc định 0 */
  maxServerLogErrors?: number;
  /** Tỉ lệ bot rớt kết nối tối đa cho phép. Mặc định 0.05 (không quá 5% rớt) */
  maxDropRatio?: number;
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
  tickCpuAvgMs: number;
  tickCpuP95Ms: number;
  tickCpuMaxMs: number;
  patchBytesAvg: number;
  patchBytesP95: number;
  rxKBpsAvgPerBot: number;
  initialBots: number;
  endBots: number;
  droppedBots: number;
  totalSampleErrors: number;
  serverLogErrors: number;
  auditErrorsTotal?: number;
  hongFilesCount?: number;
  currencyConservationPassed?: boolean;
}

export interface ExtraSoakContext {
  serverLogErrors?: number;
  auditErrorsTotal?: number;
  hongFilesCount?: number;
  currencyConservationPassed?: boolean;
}

/**
 * Phân tích chuỗi mẫu đo của một lượt soak test và kiểm tra các tiêu chuẩn ĐẠT / KHÔNG ĐẠT.
 */
export function analyzeSoak(
  samples: SoakSample[],
  thresholds: SoakThresholds = {},
  extra: ExtraSoakContext = {},
): SoakAnalysisResult {
  const reasons: string[] = [];
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
      tickCpuAvgMs: 0,
      tickCpuP95Ms: 0,
      tickCpuMaxMs: 0,
      patchBytesAvg: 0,
      patchBytesP95: 0,
      rxKBpsAvgPerBot: 0,
      initialBots: 0,
      endBots: 0,
      droppedBots: 0,
      totalSampleErrors: 0,
      serverLogErrors: extra.serverLogErrors ?? 0,
    };
  }

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const totalDurationSec = lastSample.elapsedSec;

  const defaultWarmup = totalDurationSec >= 600 ? 300 : Math.round(totalDurationSec * 0.2);
  const warmupSec = thresholds.warmupSec ?? defaultWarmup;

  const maxRssDeltaMb = thresholds.maxRssDeltaMb ?? 50;
  const maxSecondHalfSlope = thresholds.maxSecondHalfSlopeMbPerMin ?? 1.0;
  const maxTickP95Ms = thresholds.maxTickP95Ms ?? 10.0;
  const maxPatchBytesPerTick = thresholds.maxPatchBytesPerTick ?? 600;
  const maxServerLogErrors = thresholds.maxServerLogErrors ?? 0;
  const maxDropRatio = thresholds.maxDropRatio ?? 0.05;

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

  // Thống kê tick CPU
  const tickAvg = samples.reduce((acc, s) => acc + s.tickCpuAvgMs, 0) / samples.length;
  const tickP95 = samples.reduce((acc, s) => acc + s.tickCpuP95Ms, 0) / samples.length;
  const tickMax = Math.max(...samples.map((s) => s.tickCpuP95Ms));

  // Thống kê patch bytes
  const patchAvg = samples.reduce((acc, s) => acc + s.patchBytesPerTick, 0) / samples.length;
  const patchSorted = [...samples.map((s) => s.patchBytesPerTick)].sort((a, b) => a - b);
  const patchP95Idx = Math.min(patchSorted.length - 1, Math.floor(0.95 * patchSorted.length));
  const patchP95 = patchSorted[patchP95Idx] ?? 0;

  // Thống kê băng thông nhận
  const rxKBpsAvg = samples.reduce((acc, s) => acc + s.rxKBpsPerBot, 0) / samples.length;

  // Thống kê bot và lỗi
  const initialBots = firstSample.activeBots;
  const endBots = lastSample.activeBots;
  const droppedBots = Math.max(0, initialBots - endBots);
  const totalSampleErrors = samples.reduce((acc, s) => acc + s.sampleErrors, 0);
  const serverLogErrors = extra.serverLogErrors ?? 0;

  // 1. Kiểm tra rò rỉ bộ nhớ
  if (rssDeltaAfterWarmupMb > maxRssDeltaMb) {
    reasons.push(
      `VmRSS tăng sau khởi động vượt ngưỡng: +${rssDeltaAfterWarmupMb} MB > ${maxRssDeltaMb} MB`,
    );
  }
  if (secondHalfRssSlopeMbPerMin > maxSecondHalfSlope && rssDeltaAfterWarmupMb > 10) {
    reasons.push(
      `Dốc VmRSS nửa sau tăng liên tục vượt ngưỡng: +${secondHalfRssSlopeMbPerMin} MB/phút > ${maxSecondHalfSlope} MB/phút`,
    );
  }

  // 2. Kiểm tra độ trễ tick CPU p95
  if (tickP95 > maxTickP95Ms) {
    reasons.push(
      `CPU tick p95 vượt ngân sách: ${tickP95.toFixed(2)} ms/tick > ${maxTickP95Ms} ms/tick`,
    );
  }

  // 3. Kiểm tra byte/tick mỗi client
  if (patchAvg > maxPatchBytesPerTick) {
    reasons.push(
      `Bản vá StateView mỗi client vượt ngân sách: ${Math.round(patchAvg)} byte/tick > ${maxPatchBytesPerTick} byte/tick`,
    );
  }

  // 4. Kiểm tra lỗi log server
  if (serverLogErrors > maxServerLogErrors) {
    reasons.push(
      `Phát hiện ${serverLogErrors} lỗi trong log server ([lỗi] / unhandledRejection / ngoại lệ)`,
    );
  }

  // 5. Kiểm tra bot rớt kết nối
  if (initialBots > 0 && droppedBots / initialBots > maxDropRatio) {
    reasons.push(
      `Bot bị rớt kết nối bất thường vượt ngưỡng: ${droppedBots}/${initialBots} bot (${((droppedBots / initialBots) * 100).toFixed(1)}% > ${(maxDropRatio * 100).toFixed(1)}%)`,
    );
  }

  // 6. Kiểm tra toàn vẹn kiem-save
  if (typeof extra.auditErrorsTotal === "number" && extra.auditErrorsTotal > 0) {
    reasons.push(`kiem-save phát hiện ${extra.auditErrorsTotal} lỗi toàn vẹn tệp lưu`);
  }

  // 7. Kiểm tra tệp hỏng *.hong-*
  if (typeof extra.hongFilesCount === "number" && extra.hongFilesCount > 0) {
    reasons.push(`Phát hiện ${extra.hongFilesCount} tệp hỏng bị cách ly (*.hong-*)`);
  }

  // 8. Kiểm tra bảo toàn tiền tệ
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
    tickCpuAvgMs: Number(tickAvg.toFixed(2)),
    tickCpuP95Ms: Number(tickP95.toFixed(2)),
    tickCpuMaxMs: Number(tickMax.toFixed(2)),
    patchBytesAvg: Math.round(patchAvg),
    patchBytesP95: Math.round(patchP95),
    rxKBpsAvgPerBot: Number(rxKBpsAvg.toFixed(2)),
    initialBots,
    endBots,
    droppedBots,
    totalSampleErrors,
    serverLogErrors,
    auditErrorsTotal: extra.auditErrorsTotal,
    hongFilesCount: extra.hongFilesCount,
    currencyConservationPassed: extra.currencyConservationPassed,
  };
}

/**
 * Định dạng bảng tổng kết thử tải dài để in ra màn hình hoặc ghi vào báo cáo Markdown.
 */
export function formatSoakTable(res: SoakAnalysisResult): string {
  const durationMin = (res.totalDurationSec / 60).toFixed(1);
  const statusStr = res.pass ? "ĐẠT (PASS)" : "KHÔNG ĐẠT (FAIL)";

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
    `  - Tăng sau warmup:    ${res.rssDeltaAfterWarmupMb > 0 ? "+" : ""}${res.rssDeltaAfterWarmupMb} MB (ngưỡng: <= 50.0 MB)`,
    `  - Dốc nửa sau:        ${res.secondHalfRssSlopeMbPerMin > 0 ? "+" : ""}${res.secondHalfRssSlopeMbPerMin} MB/phút (ngưỡng: <= 1.0 MB/phút)`,
    "--------------------------------------------------------------------------------",
    "ĐỘ TRỄ TICK CPU SERVER (/proc/<pid>/sched):",
    `  - Trung bình:         ${res.tickCpuAvgMs} ms/tick`,
    `  - Phân vị p95:        ${res.tickCpuP95Ms} ms/tick (ngân sách: <= 10.0 ms)`,
    `  - Tối đa:             ${res.tickCpuMaxMs} ms/tick`,
    "--------------------------------------------------------------------------------",
    "BĂNG THÔNG STATEVIEW MÃ HOÁ:",
    `  - Patch trung bình:   ${res.patchBytesAvg} byte/tick (ngân sách: <= 600 byte)`,
    `  - Patch phân vị p95:  ${res.patchBytesP95} byte/tick`,
    `  - Băng thông nhận TB: ${res.rxKBpsAvgPerBot} KB/s mỗi bot`,
    "--------------------------------------------------------------------------------",
    "TOÀN VẸN DỮ LIỆU & TÍNH ỔN ĐỊNH:",
    `  - Lỗi log server:     ${res.serverLogErrors} (yêu cầu: 0)`,
    `  - kiem-save sau soak: ${res.auditErrorsTotal ?? 0} lỗi (yêu cầu: 0)`,
    `  - Tệp hỏng (*.hong-*): ${res.hongFilesCount ?? 0} (yêu cầu: 0)`,
    `  - Bảo toàn tiền tệ:   ${res.currencyConservationPassed === false ? "KHÔNG ĐẠT" : "ĐẠT"}`,
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
