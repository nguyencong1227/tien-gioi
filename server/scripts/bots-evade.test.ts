// Kiểm thử tính năng bot tránh vùng báo trước (M7.10 #511): segDist, isPointInWarnZone, computeEvadeVector
import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS } from "@tien-gioi/shared";
import { type ActiveWarnZone, computeEvadeVector, isPointInWarnZone, segDist } from "./bots";

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
    const reach = lineWarn.w / 2 + PLAYER_RADIUS + buffer; // 28 + 14 + 8 = 50 px

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
    const reach = 80 + PLAYER_RADIUS + buffer; // 102 px

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
