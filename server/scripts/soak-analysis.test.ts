// Unit test cho bộ phân tích số liệu thử tải dài (soak-analysis.ts)
import { describe, expect, it } from "vitest";
import {
  analyzeSoak,
  classifyServerLogLine,
  formatSoakTable,
  linearRegression,
  type M7SoakContext,
  type SoakSample,
} from "./soak-analysis";
import { ALL_SKILL_IDS, NGUYEN_ANH_SKILL_IDS } from "./soak-plan";

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

  it('STDERR: mọi dòng không phải [CẢNH BÁO] / [ĐÃ ỔN] là lỗi, kể cả dạng `console.error("save failed", e)` mà chữ Error: không ở đầu dòng', () => {
    for (const line of [
      "save failed Error: ENOSPC: no space left on device, write",
      "save failed (limbo) Error: EACCES: permission denied",
      "[hub] gửi chat thất bại Error: boom",
      "    at async WorldRoom.persist (/app/server/src/rooms/WorldRoom.ts:900:5)",
      "một dòng lạ nào đó",
    ]) {
      expect(classifyServerLogLine(line, true, "stderr"), line).toBe("error");
      expect(classifyServerLogLine(line, false, "stderr"), line).toBe("error");
    }
    // stdout giữ nguyên: dòng thường vẫn là info
    expect(classifyServerLogLine("save failed Error: ENOSPC", true, "stdout")).toBe("info");
    // ngoại lệ trên stderr: cảnh báo cấu hình / giám sát vẫn theo luật riêng
    expect(classifyServerLogLine("[ĐÃ ỔN] tick: trở lại dưới ngưỡng", true, "stderr")).toBe("info");
    expect(classifyServerLogLine("[CẢNH BÁO] tick p95 28 ms > 25 ms", true, "stderr")).toBe(
      "monitorAlert",
    );
    expect(classifyServerLogLine("[CẢNH BÁO] STORE=file: ...", false, "stderr")).toBe(
      "startupWarning",
    );
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

  describe("nội dung M7 (--m7)", () => {
    const samples = generateSamples(60, 10, () => 90);
    /** Mọi chiêu đều được thi triển 10 lần, 20 bot Nguyên Anh */
    function m7Ctx(over: Partial<M7SoakContext> = {}): M7SoakContext {
      return {
        requiredSkillIds: NGUYEN_ANH_SKILL_IDS,
        allSkillIds: ALL_SKILL_IDS,
        realmCounts: { 1: 56, 2: 12, 3: 12, 4: 20 },
        skillCastCounts: Object.fromEntries(ALL_SKILL_IDS.map((id) => [id, 10])),
        ...over,
      };
    }

    it("không bật --m7: không có phần m7 và không kiểm gì về chiêu (soak cũ giữ nguyên)", () => {
      const res = analyzeSoak(samples, {}, {});
      expect(res.pass).toBe(true);
      expect(res.m7).toBeUndefined();
      expect(formatSoakTable(res)).not.toContain("NỘI DUNG M7");
    });

    it("ĐẠT khi có bot Nguyên Anh và cả 6 chiêu Nguyên Anh đều được thi triển", () => {
      const res = analyzeSoak(samples, {}, { m7: m7Ctx() });
      expect(res.pass).toBe(true);
      expect(res.m7?.missingRequired).toEqual([]);
      expect(res.m7?.notCast).toEqual([]);
      expect(res.m7?.totalSkillCasts).toBe(180);
    });

    it("KHÔNG ĐẠT khi một chiêu Nguyên Anh không được thi triển lần nào, nêu đích danh chiêu đó", () => {
      const counts = Object.fromEntries(ALL_SKILL_IDS.map((id) => [id, 10]));
      counts["liet_hoa_kiem"] = 0;
      const res = analyzeSoak(samples, {}, { m7: m7Ctx({ skillCastCounts: counts }) });
      expect(res.pass).toBe(false);
      expect(res.m7?.missingRequired).toEqual(["liet_hoa_kiem"]);
      expect(res.reasons.some((r) => r.includes("1/6") && r.includes("liet_hoa_kiem"))).toBe(true);
    });

    it("KHÔNG ĐẠT khi không chiêu nào được thi triển (sổ chiêu không vào được máy chủ)", () => {
      const res = analyzeSoak(samples, {}, { m7: m7Ctx({ skillCastCounts: {} }) });
      expect(res.pass).toBe(false);
      expect(res.m7?.missingRequired).toHaveLength(6);
      expect(res.m7?.totalSkillCasts).toBe(0);
    });

    it("KHÔNG ĐẠT khi không có bot Nguyên Anh nào được gieo", () => {
      const res = analyzeSoak(samples, {}, { m7: m7Ctx({ realmCounts: { 1: 100 } }) });
      expect(res.pass).toBe(false);
      expect(res.reasons.some((r) => r.includes("không có bot Nguyên Anh"))).toBe(true);
    });

    it("chiêu không bắt buộc chưa thi triển chỉ được ghi lại, KHÔNG làm đỏ", () => {
      const counts = Object.fromEntries(ALL_SKILL_IDS.map((id) => [id, 10]));
      counts["bon_thach_quyen"] = 0;
      const res = analyzeSoak(samples, {}, { m7: m7Ctx({ skillCastCounts: counts }) });
      expect(res.pass).toBe(true);
      expect(res.m7?.notCast).toEqual(["bon_thach_quyen"]);
    });

    it("bảng tổng kết in số bot theo cảnh giới, lượt thi triển, chiêu thiếu và số lần từng chiêu", () => {
      const counts = Object.fromEntries(ALL_SKILL_IDS.map((id) => [id, 10]));
      counts["bon_thach_quyen"] = 0;
      counts["han_quang_tien"] = 99;
      const res = analyzeSoak(samples, {}, { m7: m7Ctx({ skillCastCounts: counts }) });
      const table = formatSoakTable(res);
      expect(table).toContain("NỘI DUNG M7");
      expect(table).toContain("Luyện Khí 56 | Trúc Cơ 12 | Kim Đan 12 | Nguyên Anh 20");
      expect(table).toContain("6/6 có lượt thi triển");
      expect(table).toContain("Chiêu chưa thi triển:  bon_thach_quyen");
      expect(table).toContain("han_quang_tien 99");
    });
  });

  describe("bộ chiêu trùm (--boss)", () => {
    const samples = generateSamples(60, 10, () => 90);
    const required = ["quat_duoi", "phun_doc", "cuon_minh", "goi_ran_con"];

    it("không có boss: không có phần bộ chiêu trùm và không làm đỏ", () => {
      const res = analyzeSoak(samples, {}, {});
      expect(res.pass).toBe(true);
      expect(res.boss).toBeUndefined();
      expect(formatSoakTable(res)).not.toContain("BỘ CHIÊU TRÙM");
    });

    it("ĐẠT khi mọi chiêu trùm bắt buộc đều được thi triển", () => {
      const abilityCastCounts = { quat_duoi: 12, phun_doc: 8, cuon_minh: 6, goi_ran_con: 4 };
      const res = analyzeSoak(
        samples,
        {},
        { boss: { requiredAbilities: required, abilityCastCounts } },
      );
      expect(res.pass).toBe(true);
      expect(res.boss?.missingRequired).toEqual([]);
      expect(res.boss?.totalAbilityCasts).toBe(30);
      const table = formatSoakTable(res);
      expect(table).toContain("BỘ CHIÊU TRÙM (BOSS_MOVES=on)");
      expect(table).toContain("30 (máy chủ xác nhận qua fx bossCast)");
      expect(table).toContain("4/4 có lượt thi triển");
      expect(table).toContain("quat_duoi 12");
    });

    it("KHÔNG ĐẠT khi một chiêu trùm bắt buộc không được thi triển (ví dụ trùm chưa vào giai đoạn 2 để gọi rắn con)", () => {
      const abilityCastCounts = { quat_duoi: 12, phun_doc: 8, cuon_minh: 6, goi_ran_con: 0 };
      const res = analyzeSoak(
        samples,
        {},
        { boss: { requiredAbilities: required, abilityCastCounts } },
      );
      expect(res.pass).toBe(false);
      expect(res.boss?.missingRequired).toEqual(["goi_ran_con"]);
      expect(res.reasons.some((r) => r.includes("1/4") && r.includes("goi_ran_con"))).toBe(true);
    });

    it("in gợi ý nguyên nhân khi thiếu chiêu trùm và có thông tin botHunterStatus (#1301)", () => {
      const abilityCastCounts = { quat_duoi: 0, phun_doc: 0, cuon_minh: 0, goi_ran_con: 0 };
      const res = analyzeSoak(
        samples,
        {},
        {
          boss: {
            requiredAbilities: required,
            abilityCastCounts,
            bossHunterStatus: {
              totalHunters: 15,
              huntersInMap: 10,
              huntersAlive: 11,
              bossesAliveInMap: 0,
            },
          },
        },
      );
      expect(res.pass).toBe(false);
      expect(res.boss?.diagnosis).toContain("5/15 bot săn trùm ở sai bản đồ");
      expect(res.boss?.diagnosis).toContain("4/15 bot săn trùm đã chết/luân hồi về Phàm Nhân");
      expect(res.boss?.diagnosis).toContain("không còn con trùm nào sống trên bản đồ");
      const table = formatSoakTable(res);
      expect(table).toContain(
        "Gợi ý nguyên nhân:     gợi ý nguyên nhân: 5/15 bot săn trùm ở sai bản đồ",
      );
    });
  });

  describe("Chế độ thử tải Chặn đường (--ambush, CD10 #1070, #1276)", () => {
    const samples = generateSamples(60, 10, () => 90);

    it("vắng extra.ambush thì không có kết quả ambush và bảng không in khối CHẶN ĐƯỜNG", () => {
      const res = analyzeSoak(samples, {}, {});
      expect(res.ambush).toBeUndefined();
      expect(formatSoakTable(res)).not.toContain("CHẶN ĐƯỜNG");
    });

    it("ĐẠT khi bot gặp chặn đường, phòng đấu trường không vượt MAX_AMBUSH_ROOMS và về 0 sau khi dừng", () => {
      const ambushCtx = {
        offersTotal: 45,
        fightTotal: 25,
        fleeCoinTotal: 10,
        fleeExpTotal: 10,
        midFleeTotal: 3,
        wonTotal: 18,
        lostTotal: 4,
        fledTotal: 3,
        timeoutTotal: 0,
        droppedTotal: 0,
        canceledTotal: 0,
        maxActiveArenaRooms: 8,
        finalActiveArenaRooms: 0,
      };
      const res = analyzeSoak(samples, {}, { ambush: ambushCtx });
      expect(res.pass).toBe(true);
      expect(res.ambush?.passed).toBe(true);
      expect(res.ambush?.offersTotal).toBe(45);
      expect(res.ambush?.maxActiveArenaRooms).toBe(8);
      expect(res.ambush?.finalActiveArenaRooms).toBe(0);

      const table = formatSoakTable(res);
      expect(table).toContain("CHẶN ĐƯỜNG (AMBUSH=on):");
      expect(table).toContain("Số lần bị chặn:       45 lần");
      expect(table).toContain("Chiến: 25 | Bỏ chạy: 20 (Linh thạch: 10, Tu vi: 10)");
      expect(table).toContain("Thoát giữa trận:      3 lần");
      expect(table).toContain("Thắng: 18 | Thua: 4 | Chạy thoát: 3 | Hết giờ: 0");
      expect(table).toContain("Tối đa đồng thời: 8/20 | Cuối cùng: 0 (yêu cầu: 0)");
    });

    it("KHÔNG ĐẠT khi rò rỉ phòng đấu trường sau khi dừng (finalActiveArenaRooms > 0)", () => {
      const ambushCtx = {
        offersTotal: 45,
        fightTotal: 25,
        fleeCoinTotal: 10,
        fleeExpTotal: 10,
        midFleeTotal: 0,
        wonTotal: 15,
        lostTotal: 5,
        fledTotal: 2,
        timeoutTotal: 0,
        droppedTotal: 0,
        canceledTotal: 0,
        maxActiveArenaRooms: 6,
        finalActiveArenaRooms: 2, // rò 2 phòng
      };
      const res = analyzeSoak(samples, {}, { ambush: ambushCtx });
      expect(res.pass).toBe(false);
      expect(res.ambush?.passed).toBe(false);
      expect(
        res.reasons.some((r) => r.includes("Rò rỉ phòng đấu trường") && r.includes("còn 2")),
      ).toBe(true);
    });

    it("KHÔNG ĐẠT khi số phòng đấu trường vượt trần MAX_AMBUSH_ROOMS (maxActiveArenaRooms > 20)", () => {
      const ambushCtx = {
        offersTotal: 100,
        fightTotal: 60,
        fleeCoinTotal: 20,
        fleeExpTotal: 20,
        midFleeTotal: 0,
        wonTotal: 40,
        lostTotal: 10,
        fledTotal: 10,
        timeoutTotal: 0,
        droppedTotal: 0,
        canceledTotal: 0,
        maxActiveArenaRooms: 22, // vượt 20
        finalActiveArenaRooms: 0,
      };
      const res = analyzeSoak(samples, {}, { ambush: ambushCtx });
      expect(res.pass).toBe(false);
      expect(res.ambush?.passed).toBe(false);
      expect(res.reasons.some((r) => r.includes("vượt trần: 22 > 20"))).toBe(true);
    });

    it("KHÔNG ĐẠT khi bật --ambush nhưng không có lượt chặn nào (offersTotal = 0)", () => {
      const ambushCtx = {
        offersTotal: 0,
        fightTotal: 0,
        fleeCoinTotal: 0,
        fleeExpTotal: 0,
        midFleeTotal: 0,
        wonTotal: 0,
        lostTotal: 0,
        fledTotal: 0,
        timeoutTotal: 0,
        droppedTotal: 0,
        canceledTotal: 0,
        maxActiveArenaRooms: 0,
        finalActiveArenaRooms: 0,
      };
      const res = analyzeSoak(samples, {}, { ambush: ambushCtx });
      expect(res.pass).toBe(false);
      expect(res.ambush?.passed).toBe(false);
      expect(res.reasons.some((r) => r.includes("offersTotal = 0"))).toBe(true);
    });
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
