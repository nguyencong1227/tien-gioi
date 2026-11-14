// Kiểm thử tính năng bot tránh vùng báo trước (M7.10 #511): segDist, isPointInWarnZone, computeEvadeVector, updateBotWarns, đo tỉ lệ né bãi Hôi Lang
import { describe, expect, it } from "vitest";
import {
  type ActiveWarnZone,
  type BotState,
  computeEvadeVector,
  isPointInWarnZone,
  segDist,
  updateBotWarns,
} from "./bots";
import { DEFAULT_MAP } from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "../src/systems/test-helpers";
import { tickMonsters } from "../src/systems/monsters";

describe("bot tránh báo trước: segDist (M7.10 #511)", () => {
  it("tính chính xác khoảng cách và vector thoát ly với đoạn thẳng ngang", () => {
    // Đoạn thẳng từ (0, 0) đến (100, 0)
    // Điểm (50, 20): nằm bên trái/dưới trục x
    const r1 = segDist(50, 20, 0, 0, 100, 0);
    expect(r1.dist).toBeCloseTo(20, 3);
    expect(r1.nx).toBeCloseTo(0, 3);
    expect(r1.ny).toBeCloseTo(1, 3);

    // Điểm (50, -30): nằm bên phải/trên trục x
    const r2 = segDist(50, -30, 0, 0, 100, 0);
    expect(r2.dist).toBeCloseTo(30, 3);
    expect(r2.nx).toBeCloseTo(0, 3);
    expect(r2.ny).toBeCloseTo(-1, 3);

    // Điểm nằm ngay trên đoạn thẳng (50, 0): tự chọn pháp tuyến vuông góc
    const r3 = segDist(50, 0, 0, 0, 100, 0);
    expect(r3.dist).toBe(0);
    expect(r3.nx).toBeCloseTo(0, 3);
    expect(r3.ny).toBeCloseTo(1, 3);

    // Điểm nằm trước điểm đầu (-20, 0)
    const r4 = segDist(-20, 0, 0, 0, 100, 0);
    expect(r4.dist).toBeCloseTo(20, 3);
    expect(r4.nx).toBeCloseTo(-1, 3);
    expect(r4.ny).toBeCloseTo(0, 3);

    // Điểm nằm sau điểm cuối (130, 0)
    const r5 = segDist(130, 0, 0, 0, 100, 0);
    expect(r5.dist).toBeCloseTo(30, 3);
    expect(r5.nx).toBeCloseTo(1, 3);
    expect(r5.ny).toBeCloseTo(0, 3);
  });

  it("tính chính xác với đoạn thẳng xiên góc", () => {
    // Đoạn thẳng từ (0, 0) đến (100, 100) (góc PI/4, len = 100*sqrt(2))
    const r = segDist(50, 60, 0, 0, 100, 100);
    // Điểm (50, 60) chiếu lên đường x=y tại (55, 55). Khoảng cách = sqrt(25 + 25) = 5*sqrt(2) ≈ 7.071
    expect(r.dist).toBeCloseTo(5 * Math.SQRT2, 2);
    // Vector thoát ly phải hướng từ (55, 55) tới (50, 60) -> (-5/dist, 5/dist) = (-1/sqrt(2), 1/sqrt(2))
    expect(r.nx).toBeCloseTo(-Math.SQRT1_2, 2);
    expect(r.ny).toBeCloseTo(Math.SQRT1_2, 2);
  });
});

describe("bot tránh báo trước: isPointInWarnZone (M7.10 #511)", () => {
  it("nhận diện đúng vùng nguy hiểm của đòn lao charger (line)", () => {
    const lineWarn: ActiveWarnZone = {
      shape: "line",
      x: 100,
      y: 100,
      r: 280, // chiều dài lao
      w: 56, // bề rộng
      angle: 0, // lao sang phải dọc trục x
      arc: 0,
      expiresAt: Date.now() + 800,
    };
    const buffer = 8;
    // Bán kính nguy hiểm hiệu dụng: lineWarn.w / 2 + PLAYER_RADIUS + buffer = 28 + 14 + 8 = 50 px

    // Điểm nằm ngay trên đường lao
    expect(isPointInWarnZone(200, 100, lineWarn, buffer)).toBe(true);

    // Điểm nằm trong phạm vi bề rộng (cách 30 px < 50 px)
    expect(isPointInWarnZone(200, 130, lineWarn, buffer)).toBe(true);
    expect(isPointInWarnZone(200, 70, lineWarn, buffer)).toBe(true);

    // Điểm nằm ngoài phạm vi bề rộng (cách 60 px > 50 px)
    expect(isPointInWarnZone(200, 160, lineWarn, buffer)).toBe(false);
    expect(isPointInWarnZone(200, 40, lineWarn, buffer)).toBe(false);

    // Điểm nằm phía sau quái (x = 30 < 100 - reach)
    expect(isPointInWarnZone(30, 100, lineWarn, buffer)).toBe(false);

    // Điểm nằm vượt quá tầm lao (x = 450 > 100 + 280 + reach)
    expect(isPointInWarnZone(450, 100, lineWarn, buffer)).toBe(false);
  });

  it("nhận diện đúng vùng nguy hiểm hình tròn (circle)", () => {
    const circleWarn: ActiveWarnZone = {
      shape: "circle",
      x: 200,
      y: 200,
      r: 80,
      w: 0,
      angle: 0,
      arc: 0,
      expiresAt: Date.now() + 1000,
    };
    const buffer = 8;
    // Bán kính nguy hiểm hiệu dụng: 80 + PLAYER_RADIUS + buffer = 102 px

    expect(isPointInWarnZone(200, 250, circleWarn, buffer)).toBe(true);
    expect(isPointInWarnZone(200, 310, circleWarn, buffer)).toBe(false);
  });

  it("nhận diện đúng vùng nguy hiểm hình nón (cone)", () => {
    const coneWarn: ActiveWarnZone = {
      shape: "cone",
      x: 200,
      y: 200,
      r: 120,
      w: 0,
      angle: 0, // hướng sang phải
      arc: Math.PI / 2, // góc mở 90 độ (-45 đến +45 độ)
      expiresAt: Date.now() + 1000,
    };
    const buffer = 8;

    // Điểm nằm thẳng trước mặt trong tầm
    expect(isPointInWarnZone(280, 200, coneWarn, buffer)).toBe(true);

    // Điểm nằm ở góc 30 độ (trong cung 45 độ)
    const angle30 = (30 * Math.PI) / 180;
    expect(
      isPointInWarnZone(
        200 + 80 * Math.cos(angle30),
        200 + 80 * Math.sin(angle30),
        coneWarn,
        buffer,
      ),
    ).toBe(true);

    // Điểm nằm ở góc 70 độ (ngoài cung 45 độ)
    const angle70 = (70 * Math.PI) / 180;
    expect(
      isPointInWarnZone(
        200 + 80 * Math.cos(angle70),
        200 + 80 * Math.sin(angle70),
        coneWarn,
        buffer,
      ),
    ).toBe(false);

    // Điểm nằm phía sau lưng
    expect(isPointInWarnZone(120, 200, coneWarn, buffer)).toBe(false);
  });
});

describe("bot tránh báo trước: computeEvadeVector (M7.10 #511)", () => {
  it("trả về null khi không có cảnh báo hoặc cảnh báo đã hết hạn", () => {
    const now = 1000;
    expect(computeEvadeVector(100, 100, [], now)).toBeNull();

    const expiredWarns: ActiveWarnZone[] = [
      {
        shape: "circle",
        x: 100,
        y: 100,
        r: 50,
        w: 0,
        angle: 0,
        arc: 0,
        expiresAt: 900, // đã hết hạn
      },
    ];
    expect(computeEvadeVector(100, 100, expiredWarns, now)).toBeNull();
    // Danh sách đã được tự động dọn dẹp
    expect(expiredWarns.length).toBe(0);
  });

  it("trả về null khi bot ở vị trí an toàn ngoài vùng cảnh báo", () => {
    const now = 1000;
    const warns: ActiveWarnZone[] = [
      {
        shape: "line",
        x: 100,
        y: 100,
        r: 280,
        w: 56,
        angle: 0,
        arc: 0,
        expiresAt: 1800,
      },
    ];
    // Bot ở (200, 300) cách xa đường lao hơn 200 px
    expect(computeEvadeVector(200, 300, warns, now)).toBeNull();
  });

  it("tính vector né vuông góc hoàn hảo khi bị quái charger nhắm tới", () => {
    const now = 1000;
    // Quái ở (100, 100) gồng lao sang phải (angle = 0)
    const chargerWarn: ActiveWarnZone = {
      shape: "line",
      x: 100,
      y: 100,
      r: 280,
      w: 56,
      angle: 0,
      arc: 0,
      expiresAt: now + 800,
    };

    // Trường hợp 1: Bot ở (180, 115) - lệch một chút về phía dưới
    const vec1 = computeEvadeVector(180, 115, [chargerWarn], now);
    expect(vec1).not.toBeNull();
    // Phải né thẳng xuống dưới (dy > 0, dx = 0)
    expect(vec1!.dx).toBeCloseTo(0, 3);
    expect(vec1!.dy).toBeCloseTo(1, 3);
    // Tích vô hướng với vector lao (1, 0) phải bằng 0 (vuông góc 100%)
    expect(vec1!.dx * 1 + vec1!.dy * 0).toBeCloseTo(0, 3);

    // Trường hợp 2: Bot ở (180, 85) - lệch một chút về phía trên
    const vec2 = computeEvadeVector(180, 85, [chargerWarn], now);
    expect(vec2).not.toBeNull();
    // Phải né thẳng lên trên (dy < 0, dx = 0)
    expect(vec2!.dx).toBeCloseTo(0, 3);
    expect(vec2!.dy).toBeCloseTo(-1, 3);

    // Trường hợp 3: Quái gồng theo hướng xiên góc PI/4
    const diagonalWarn: ActiveWarnZone = {
      shape: "line",
      x: 100,
      y: 100,
      r: 280,
      w: 56,
      angle: Math.PI / 4,
      arc: 0,
      expiresAt: now + 800,
    };
    // Bot nằm ở (150, 150) chính giữa đường lao
    const vec3 = computeEvadeVector(150, 150, [diagonalWarn], now);
    expect(vec3).not.toBeNull();
    // Tích vô hướng với hướng lao (cos(PI/4), sin(PI/4)) phải bằng 0
    const dot = vec3!.dx * Math.cos(Math.PI / 4) + vec3!.dy * Math.sin(Math.PI / 4);
    expect(dot).toBeCloseTo(0, 3);
    // Độ dài vector né phải chuẩn hoá bằng 1
    expect(Math.hypot(vec3!.dx, vec3!.dy)).toBeCloseTo(1, 3);
  });

  it("ưu tiên né cảnh báo sắp phát nổ sớm nhất khi có nhiều cảnh báo", () => {
    const now = 1000;
    const warns: ActiveWarnZone[] = [
      {
        shape: "circle",
        x: 100,
        y: 100,
        r: 60,
        w: 0,
        angle: 0,
        arc: 0,
        expiresAt: now + 1200, // nổ sau 1200 ms
      },
      {
        shape: "line",
        x: 50,
        y: 100,
        r: 200,
        w: 56,
        angle: 0,
        arc: 0,
        expiresAt: now + 200, // NGUY CẤP: nổ sau 200 ms!
      },
    ];

    // Bot ở (100, 110) nằm trong cả 2 vùng báo trước
    const vec = computeEvadeVector(100, 110, warns, now);
    expect(vec).not.toBeNull();
    // Phải né đòn line (charger) nguy cấp trước: né vuông góc xuống dưới (dx = 0, dy = 1)
    expect(vec!.dx).toBeCloseTo(0, 3);
    expect(vec!.dy).toBeCloseTo(1, 3);
  });

  it("mô phỏng chu trình né đòn charger hoàn chỉnh: bot bước ra khỏi đường lao trước khi đáp đòn", () => {
    const now = 0;
    const chargerWarn: ActiveWarnZone = {
      shape: "line",
      x: 100,
      y: 200,
      r: 280,
      w: 56,
      angle: 0,
      arc: 0,
      expiresAt: now + 800, // 800 ms gồng
    };

    const warns = [chargerWarn];
    // Bot đứng ở (220, 205) - cách quái 120 px, nằm chính diện đường lao (y = 205, trục y = 200)
    let botX = 220;
    let botY = 205;

    expect(isPointInWarnZone(botX, botY, chargerWarn)).toBe(true);

    const botSpeed = 150; // px/giây (tốc độ Trúc Cơ)
    const tickMs = 50; // 20 tick/giây
    const stepPx = botSpeed * (tickMs / 1000); // 7.5 px mỗi tick

    let ticksEscaped = 0;
    for (let tick = 1; tick <= 16; tick++) {
      // 16 ticks = 800 ms
      const currentNow = tick * tickMs;
      const evadeVec = computeEvadeVector(botX, botY, warns, currentNow);
      if (evadeVec) {
        botX += evadeVec.dx * stepPx;
        botY += evadeVec.dy * stepPx;
      } else {
        ticksEscaped = tick;
        break;
      }
    }

    // Bot phải thoát khỏi vùng nguy hiểm trong vòng chưa đến 8 ticks (400 ms, chỉ nửa thời gian gồng của quái)
    expect(ticksEscaped).toBeGreaterThan(0);
    expect(ticksEscaped).toBeLessThanOrEqual(8);
    // Vị trí mới của bot đã an toàn
    expect(isPointInWarnZone(botX, botY, chargerWarn)).toBe(false);
  });
});

describe("bot theo dõi cảnh báo: updateBotWarns (M7.10 #511)", () => {
  it("ghi nhận trúng đòn khi bot đứng yên trong vùng warn lúc hết hạn", () => {
    const fakeBot = {
      predX: 150,
      predY: 100,
      warns: [
        {
          shape: "line" as const,
          x: 100,
          y: 100,
          r: 280,
          w: 56,
          angle: 0,
          arc: 0,
          expiresAt: 500,
          targeted: true,
        },
      ],
      warnsTargetedCount: 1,
      warnsEvadedCount: 0,
      warnsHitCount: 0,
    } as unknown as BotState;

    // Chưa đến hạn (now = 400 < 500): chưa giải quyết
    updateBotWarns(fakeBot, 400, true);
    expect(fakeBot.warns.length).toBe(1);
    expect(fakeBot.warnsHitCount).toBe(0);
    expect(fakeBot.warnsEvadedCount).toBe(0);

    // Đến hạn (now = 500): bot vẫn ở (150, 100) -> trúng đòn
    updateBotWarns(fakeBot, 500, true);
    expect(fakeBot.warns.length).toBe(0); // đã dọn dẹp
    expect(fakeBot.warnsHitCount).toBe(1);
    expect(fakeBot.warnsEvadedCount).toBe(0);
  });

  it("ghi nhận né thoát thành công khi bot di chuyển ra ngoài vùng warn trước khi hết hạn", () => {
    const fakeBot = {
      predX: 150,
      predY: 160, // Đã chạy ra xa trục y = 100 tới y = 160 (cách 60 px > 42 px)
      warns: [
        {
          shape: "line" as const,
          x: 100,
          y: 100,
          r: 280,
          w: 56,
          angle: 0,
          arc: 0,
          expiresAt: 700,
          targeted: true,
        },
      ],
      warnsTargetedCount: 1,
      warnsEvadedCount: 0,
      warnsHitCount: 0,
    } as unknown as BotState;

    updateBotWarns(fakeBot, 700, true);
    expect(fakeBot.warns.length).toBe(0);
    expect(fakeBot.warnsHitCount).toBe(0);
    expect(fakeBot.warnsEvadedCount).toBe(1);
  });
});

describe("thực nghiệm bãi Hôi Lang: tỉ lệ né đòn và cơ sở chốt windupMs 700 ms (M7.9 / M7.10 #511)", () => {
  const HOI_LANG_WINDUP = 700; // ms
  const CHARGE_LEN = 280; // px
  const CHARGE_WIDTH = 56; // px
  const BOT_SPEED_LUYEN_KHI = 140; // px/giây (cảnh giới Luyện Khí)
  const TICK_STEP_SEC = 0.05; // 50 ms mỗi tick
  const STEP_PX = BOT_SPEED_LUYEN_KHI * TICK_STEP_SEC; // 7 px mỗi tick

  // Tạo 50 vị trí thử nghiệm nằm rải rác trên đường lao của Hôi Lang
  const testSamples = Array.from({ length: 50 }, (_, i) => {
    const dist = 50 + (i % 10) * 20; // 50 đến 230 px dọc trục lao
    const offset = ((i % 5) - 2) * 8; // -16, -8, 0, 8, 16 px lệch tâm đường lao
    return { dist, offset };
  });

  it("đối chứng: bot KHÔNG né (--evade = false) có tỉ lệ né 0% và dính 100% đòn lao", () => {
    let hits = 0;
    let evades = 0;

    for (const sample of testSamples) {
      const chargerWarn: ActiveWarnZone = {
        shape: "line",
        x: 100,
        y: 200,
        r: CHARGE_LEN,
        w: CHARGE_WIDTH,
        angle: 0,
        arc: 0,
        expiresAt: HOI_LANG_WINDUP,
        targeted: true,
      };

      const fakeBot = {
        predX: 100 + sample.dist,
        predY: 200 + sample.offset,
        warns: [chargerWarn],
        evade: false,
        warnsHitCount: 0,
        warnsEvadedCount: 0,
      } as unknown as BotState;

      // Bot không né: đứng yên hoặc chém thường, vị trí không đổi sau 700 ms (14 ticks)
      updateBotWarns(fakeBot, HOI_LANG_WINDUP, true);
      hits += fakeBot.warnsHitCount;
      evades += fakeBot.warnsEvadedCount;
    }

    expect(hits).toBe(50);
    expect(evades).toBe(0);
    const successRate = (evades / (hits + evades)) * 100;
    expect(successRate).toBe(0);
  });

  it("thực nghiệm bot CÓ né (--evade = true): phản xạ tức thì đạt tỉ lệ né 100% ở 700 ms", () => {
    let hits = 0;
    let evades = 0;
    let totalTicksToEscape = 0;

    for (const sample of testSamples) {
      const chargerWarn: ActiveWarnZone = {
        shape: "line",
        x: 100,
        y: 200,
        r: CHARGE_LEN,
        w: CHARGE_WIDTH,
        angle: 0,
        arc: 0,
        expiresAt: HOI_LANG_WINDUP,
        targeted: true,
      };

      const fakeBot = {
        predX: 100 + sample.dist,
        predY: 200 + sample.offset,
        warns: [{ ...chargerWarn }],
        warnsHitCount: 0,
        warnsEvadedCount: 0,
      } as unknown as BotState;

      const totalTicks = HOI_LANG_WINDUP / 50; // 14 ticks
      let escapedTick = 0;

      for (let t = 1; t <= totalTicks; t++) {
        const now = t * 50;
        updateBotWarns(fakeBot, now, true);
        if (fakeBot.warns.length > 0) {
          const evadeVec = computeEvadeVector(fakeBot.predX, fakeBot.predY, fakeBot.warns, now);
          if (evadeVec) {
            fakeBot.predX += evadeVec.dx * STEP_PX;
            fakeBot.predY += evadeVec.dy * STEP_PX;
          } else if (escapedTick === 0) {
            escapedTick = t;
          }
        }
      }

      totalTicksToEscape += escapedTick || totalTicks;
      hits += fakeBot.warnsHitCount;
      evades += fakeBot.warnsEvadedCount;
    }

    expect(evades).toBe(50);
    expect(hits).toBe(0);
    const avgEscapeMs = (totalTicksToEscape / 50) * 50;
    // Thời gian né thoát trung bình chỉ khoảng 300 - 350 ms (< 50% của 700 ms)
    expect(avgEscapeMs).toBeLessThanOrEqual(400);
  });

  it("thực nghiệm bot CÓ né với độ trễ phản xạ người chơi 150-200 ms: tỉ lệ né đạt > 90% ở 700 ms", () => {
    // 150 ms trễ tương đương 3 tick độ trễ phản xạ + mạng
    const latencyTicks = 3;
    let hits = 0;
    let evades = 0;

    for (const sample of testSamples) {
      const chargerWarn: ActiveWarnZone = {
        shape: "line",
        x: 100,
        y: 200,
        r: CHARGE_LEN,
        w: CHARGE_WIDTH,
        angle: 0,
        arc: 0,
        expiresAt: HOI_LANG_WINDUP,
        targeted: true,
      };

      const fakeBot = {
        predX: 100 + sample.dist,
        predY: 200 + sample.offset,
        warns: [{ ...chargerWarn }],
        warnsHitCount: 0,
        warnsEvadedCount: 0,
      } as unknown as BotState;

      const totalTicks = HOI_LANG_WINDUP / 50; // 14 ticks
      for (let t = 1; t <= totalTicks; t++) {
        const now = t * 50;
        updateBotWarns(fakeBot, now, true);
        // Trong latencyTicks đầu tiên, bot chưa phản xạ
        if (t > latencyTicks && fakeBot.warns.length > 0) {
          const evadeVec = computeEvadeVector(fakeBot.predX, fakeBot.predY, fakeBot.warns, now);
          if (evadeVec) {
            fakeBot.predX += evadeVec.dx * STEP_PX;
            fakeBot.predY += evadeVec.dy * STEP_PX;
          }
        }
      }

      hits += fakeBot.warnsHitCount;
      evades += fakeBot.warnsEvadedCount;
    }

    const rate = (evades / (hits + evades)) * 100;
    // Ở 700 ms với độ trễ 150 ms, bot vẫn né được >= 95%
    expect(rate).toBeGreaterThanOrEqual(95);
  });

  it("kiểm chứng độ nhạy windupMs: 500 ms (thấp) vs 700 ms (tối ưu) vs 900 ms (an toàn cao)", () => {
    // Giả lập độ trễ phản xạ 200 ms (4 ticks)
    const latencyTicks = 4;

    const measureForWindup = (windupMs: number) => {
      let hits = 0;
      let evades = 0;
      const totalTicks = windupMs / 50;

      for (const sample of testSamples) {
        const chargerWarn: ActiveWarnZone = {
          shape: "line",
          x: 100,
          y: 200,
          r: CHARGE_LEN,
          w: CHARGE_WIDTH,
          angle: 0,
          arc: 0,
          expiresAt: windupMs,
          targeted: true,
        };

        const fakeBot = {
          predX: 100 + sample.dist,
          predY: 200 + sample.offset,
          warns: [{ ...chargerWarn }],
          warnsHitCount: 0,
          warnsEvadedCount: 0,
        } as unknown as BotState;

        for (let t = 1; t <= totalTicks; t++) {
          const now = t * 50;
          updateBotWarns(fakeBot, now, true);
          if (t > latencyTicks && fakeBot.warns.length > 0) {
            const evadeVec = computeEvadeVector(fakeBot.predX, fakeBot.predY, fakeBot.warns, now);
            if (evadeVec) {
              fakeBot.predX += evadeVec.dx * STEP_PX;
              fakeBot.predY += evadeVec.dy * STEP_PX;
            }
          }
        }

        hits += fakeBot.warnsHitCount;
        evades += fakeBot.warnsEvadedCount;
      }

      return (evades / (hits + evades)) * 100;
    };

    const rate500 = measureForWindup(500);
    const rate700 = measureForWindup(700);
    const rate900 = measureForWindup(900);

    // 500 ms: có 20% bot đứng chính diện không kịp thoát (chỉ còn 300 ms di chuyển)
    expect(rate500).toBeLessThanOrEqual(85);
    expect(rate500).toBeLessThan(rate700);
    // 700 ms: tỉ lệ né đạt >= 95%, người chơi kể cả đứng giữa tâm đường lao vẫn kịp né ra ngoài
    expect(rate700).toBeGreaterThanOrEqual(95);
    // 900 ms: tỉ lệ né đạt 100%
    expect(rate900).toBe(100);
  });

  it("mô phỏng trong World thật: thợ săn né đòn charger tránh hoàn toàn sát thương lao của Hôi Lang", () => {
    const { w } = makeWorld(DEFAULT_MAP);
    const { p } = addPlayer(w, "BotPlayer", 1, 3); // Luyện Khí tầng 3
    p.x = 200;
    p.y = 200;

    const hp0 = p.hp;
    const { id } = addMonster(w, "lang", 350, 200); // Cách 150 px về phía phải
    const mc = w.mctrl.get(id)!;

    w.now = 1000;
    // Cho quái chuẩn bị gồng lao
    mc.nextAttack = 1000;
    tickMonsters(w, 0.05);

    // Quái đã bước vào phase gồng windup (700 ms)
    expect(mc.ai?.phase).toBe("windup");
    expect(mc.ai?.until).toBe(1700);

    // TH 1: Người chơi né bằng cách bước lên phía trên (dy = -1) với tốc độ 140 px/s
    // Trong 700 ms (14 ticks x 50 ms):
    for (let t = 1; t <= 14; t++) {
      w.now += 50;
      // Di chuyển người chơi lên phía trên (né vuông góc)
      p.y -= 140 * 0.05; // 7 px mỗi tick
      tickMonsters(w, 0.05);
    }

    // Đòn lao đáp xuống tại tick 14 (now = 1700)
    expect(mc.ai?.phase).toBe("recover"); // Quái đã lao xong và chuyển sang thở
    // Người chơi đã né ra ngoài phạm vi đòn lao (p.y = 200 - 14 * 7 = 102 px, cách tâm lao 98 px > 42 px)
    // -> Người chơi KHÔNG mất máu từ đòn lao!
    expect(p.hp).toBe(hp0);
  });
});
