import { describe, expect, it } from "vitest";
import {
  BOLT_FADE_MS,
  BOLT_MAX_RANGE,
  BOLT_MAX_SPEED,
  BOLT_MIN_SPEED,
  BOLT_NEUTRAL_TINT,
  BOLT_WALL_SAMPLE,
  WARN_BURST_FLASH,
  WARN_BURST_GROW,
  WARN_FADE_MS,
  WARN_MAX_ARC_STEPS,
  WARN_MAX_MS,
  WARN_MAX_R,
  WARN_MAX_W,
  WARN_MIN_MS,
  boltAlive,
  boltAlpha,
  boltPosition,
  boltTrailCount,
  boltTravelled,
  clipBoltToWall,
  planBolt,
  planWarn,
  telegraphLimits,
  warnAlive,
  warnCovers,
  warnArcSteps,
  warnBurst,
  warnFillAlpha,
  warnOutlineAlpha,
  warnPolygon,
  warnProgress,
  type BoltMsg,
  type Pt,
  type WarnMsg,
} from "./telegraph";
import { castTint } from "./cast-fx";

const warn = (o: Partial<WarnMsg> = {}): WarnMsg =>
  ({ kind: "warn", shape: "circle", x: 100, y: 200, r: 60, ms: 800, ...o }) as WarnMsg;
const bolt = (o: Partial<BoltMsg> = {}): BoltMsg =>
  ({ kind: "bolt", x: 100, y: 200, angle: 0, speed: 300, range: 450, ...o }) as BoltMsg;
const scratch = (): Pt[] => Array.from({ length: WARN_MAX_ARC_STEPS + 2 }, () => ({ x: 0, y: 0 }));

describe("telegraph: planWarn (kiểm + kẹp tin báo trước)", () => {
  it("tin hợp lệ: giữ nguyên số, điền mặc định cho cone / line", () => {
    const c = planWarn(warn());
    expect(c).toMatchObject({ shape: "circle", x: 100, y: 200, r: 60, ms: 800, angle: 0 });
    const cone = planWarn(warn({ shape: "cone", angle: 1, arc: 1.2 }))!;
    expect(cone).toMatchObject({ shape: "cone", angle: 1, arc: 1.2 });
    const line = planWarn(warn({ shape: "line", angle: 2, w: 40, r: 300 }))!;
    expect(line).toMatchObject({ shape: "line", angle: 2, w: 40, r: 300 });
    // thiếu arc / w: dùng mặc định chứ không NaN
    expect(planWarn(warn({ shape: "cone" }))!.arc).toBeCloseTo(Math.PI / 2);
    expect(planWarn(warn({ shape: "line" }))!.w).toBe(24);
  });

  it("từ chối hình lạ, số không hữu hạn, r / ms / arc / w không dương", () => {
    const bad: Array<Partial<WarnMsg>> = [
      { shape: "square" as never },
      { shape: "constructor" as never },
      { x: NaN },
      { y: Infinity },
      { r: 0 },
      { r: -5 },
      { r: NaN },
      { ms: 0 },
      { ms: -1 },
      { ms: Infinity },
      { shape: "cone", arc: 0 },
      { shape: "cone", arc: NaN },
      { shape: "line", w: 0 },
      { shape: "line", w: -3 },
      { angle: NaN },
    ];
    for (const o of bad) expect(planWarn(warn(o)), JSON.stringify(o)).toBeNull();
    expect(planWarn(undefined as never)).toBeNull();
  });

  it("kẹp số quá lớn / quá nhỏ vào khoảng cho phép (tin hỏng không vẽ vô hạn)", () => {
    expect(planWarn(warn({ r: 1e9 }))!.r).toBe(WARN_MAX_R);
    expect(planWarn(warn({ r: 0.1 }))!.r).toBe(4);
    expect(planWarn(warn({ ms: 1e9 }))!.ms).toBe(WARN_MAX_MS);
    expect(planWarn(warn({ ms: 1 }))!.ms).toBe(WARN_MIN_MS);
    expect(planWarn(warn({ shape: "line", w: 1e6 }))!.w).toBe(WARN_MAX_W);
    expect(planWarn(warn({ shape: "cone", arc: 100 }))!.arc).toBeCloseTo(Math.PI * 2);
  });
});

describe("telegraph: thời gian của vùng báo", () => {
  it("warnProgress: 0 -> 1 tuyến tính, kẹp hai đầu, không NaN", () => {
    expect(warnProgress(0, 800)).toBe(0);
    expect(warnProgress(400, 800)).toBeCloseTo(0.5);
    expect(warnProgress(800, 800)).toBe(1);
    expect(warnProgress(5000, 800)).toBe(1);
    expect(warnProgress(-50, 800)).toBe(0);
    expect(warnProgress(NaN, 800)).toBe(1);
    expect(warnProgress(10, 0)).toBe(1);
  });

  it("warnFillAlpha: đậm dần tới lúc đáp, rồi mờ về 0 trong WARN_FADE_MS", () => {
    const a0 = warnFillAlpha(0, 800);
    const aHalf = warnFillAlpha(400, 800);
    const aEnd = warnFillAlpha(800, 800);
    expect(a0).toBeGreaterThan(0.1);
    expect(aHalf).toBeGreaterThan(a0);
    expect(aEnd).toBeGreaterThan(aHalf);
    expect(warnFillAlpha(800 + WARN_FADE_MS / 2, 800)).toBeCloseTo(aEnd / 2, 5);
    expect(warnFillAlpha(800 + WARN_FADE_MS, 800)).toBe(0);
    expect(warnFillAlpha(800 + WARN_FADE_MS * 3, 800)).toBe(0);
  });

  it("warnAlive: sống đúng tới ms + WARN_FADE_MS", () => {
    expect(warnAlive(0, 800)).toBe(true);
    expect(warnAlive(800 + WARN_FADE_MS - 1, 800)).toBe(true);
    expect(warnAlive(800 + WARN_FADE_MS, 800)).toBe(false);
  });

  it("warnBurst: chỉ vòng circle, chỉ trong khoảng (ms, ms + WARN_FADE_MS); chưa đáp / đã hết thì null", () => {
    expect(warnBurst(799, 800, "circle", false)).toBeNull();
    expect(warnBurst(800, 800, "circle", false)).toBeNull(); // đúng lúc đáp: sóng bắt đầu từ khung kế tiếp
    expect(warnBurst(801, 800, "circle", false)).not.toBeNull();
    expect(warnBurst(800 + WARN_FADE_MS - 1, 800, "circle", false)).not.toBeNull();
    expect(warnBurst(800 + WARN_FADE_MS, 800, "circle", false)).toBeNull();
    for (const shape of ["cone", "line", "xyz"])
      expect(warnBurst(850, 800, shape, false)).toBeNull();
  });

  it("warnBurst: vòng sóng nở từ r tới r * (1 + WARN_BURST_GROW) (không bao giờ nhỏ hơn r), mờ dần về 0; chớp trắng mờ tuyến tính", () => {
    let prevScale = 1;
    let prevRing = Infinity;
    for (let t = 1; t < WARN_FADE_MS; t += 7) {
      const b = warnBurst(800 + t, 800, "circle", false)!;
      expect(b.scale).toBeGreaterThanOrEqual(prevScale); // chỉ nở, không co lại
      expect(b.scale).toBeLessThanOrEqual(1 + WARN_BURST_GROW);
      expect(b.ring).toBeLessThan(prevRing); // mờ dần
      expect(b.ring).toBeGreaterThan(0);
      expect(b.flash).toBeCloseTo(WARN_BURST_FLASH * b.ring, 10);
      prevScale = b.scale;
      prevRing = b.ring;
    }
    // sớm nở nhanh hơn muộn (easeOut): nửa đầu nở hơn nửa sau
    const mid = warnBurst(800 + WARN_FADE_MS / 2, 800, "circle", false)!;
    expect(mid.scale - 1).toBeGreaterThan(WARN_BURST_GROW / 2);
  });

  it("warnBurst: giảm chuyển động thì KHÔNG nở, KHÔNG chớp (chỉ nét viền trắng mờ dần); số không hợp lệ thì null", () => {
    for (const t of [1, 40, 100, WARN_FADE_MS - 1]) {
      const b = warnBurst(800 + t, 800, "circle", true)!;
      expect(b.scale).toBe(1);
      expect(b.flash).toBe(0);
      expect(b.ring).toBeGreaterThan(0);
    }
    expect(warnBurst(NaN, 800, "circle", false)).toBeNull();
    expect(warnBurst(Infinity, 800, "circle", false)).toBeNull();
    expect(warnBurst(850, NaN, "circle", false)).toBeNull();
    expect(warnBurst(850, 0, "circle", false)).toBeNull();
  });

  it("warnOutlineAlpha: giảm chuyển động thì đứng yên, còn lại luôn trong (0.45, 0.95)", () => {
    for (const t of [0, 100, 333, 700, 799]) expect(warnOutlineAlpha(t, 800, true)).toBe(0.8);
    let lo = 1;
    let hi = 0;
    for (let t = 0; t <= 1000; t += 7) {
      const a = warnOutlineAlpha(t, 800, false);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    expect(lo).toBeGreaterThan(0.44);
    expect(hi).toBeLessThan(0.96);
    expect(hi - lo).toBeGreaterThan(0.3); // thật sự nhấp nháy
  });
});

describe("telegraph: hình học vùng báo", () => {
  it("circle: không có đa giác (vẽ bằng hình tròn)", () => {
    expect(warnPolygon(scratch(), planWarn(warn())!, 1, 8)).toBe(0);
  });

  it("cone: đỉnh đầu là tâm; các điểm trên cung cách tâm đúng r * scale, trải đúng góc mở quanh hướng", () => {
    const plan = planWarn(warn({ shape: "cone", r: 100, angle: 0.5, arc: 1.0 }))!;
    const out = scratch();
    const n = warnPolygon(out, plan, 1, 8);
    expect(n).toBe(10); // tâm + 9 điểm cung (8 đoạn)
    expect(out[0]).toEqual({ x: 0, y: 0 });
    for (let i = 1; i < n; i++) expect(Math.hypot(out[i].x, out[i].y)).toBeCloseTo(100, 6);
    expect(Math.atan2(out[1].y, out[1].x)).toBeCloseTo(0.5 - 0.5, 6); // mép trái cung
    expect(Math.atan2(out[n - 1].y, out[n - 1].x)).toBeCloseTo(0.5 + 0.5, 6); // mép phải cung
    // scale co bán kính
    warnPolygon(out, plan, 0.5, 8);
    for (let i = 1; i < n; i++) expect(Math.hypot(out[i].x, out[i].y)).toBeCloseTo(50, 6);
  });

  it("cone: số đoạn kẹp trong [1, WARN_MAX_ARC_STEPS], không ghi quá mảng", () => {
    const plan = planWarn(warn({ shape: "cone" }))!;
    expect(warnPolygon(scratch(), plan, 1, 0)).toBe(3);
    expect(warnPolygon(scratch(), plan, 1, 999)).toBe(WARN_MAX_ARC_STEPS + 2);
  });

  it("line: hình chữ nhật dài r, rộng w, xuất phát từ tâm theo hướng angle", () => {
    const out = scratch();
    // hướng phải
    let plan = planWarn(warn({ shape: "line", r: 200, w: 40, angle: 0 }))!;
    expect(warnPolygon(out, plan, 1, 8)).toBe(4);
    const pts = out.slice(0, 4).map((p) => [Math.round(p.x) || 0, Math.round(p.y) || 0]);
    expect(pts).toEqual([
      [0, 20],
      [200, 20],
      [200, -20],
      [0, -20],
    ]);
    // hướng xuống (angle = pi/2): chiều dài chạy theo +y
    plan = planWarn(warn({ shape: "line", r: 200, w: 40, angle: Math.PI / 2 }))!;
    warnPolygon(out, plan, 1, 8);
    const down = out.slice(0, 4).map((p) => [Math.round(p.x) || 0, Math.round(p.y) || 0]);
    expect(down).toEqual([
      [-20, 0],
      [-20, 200],
      [20, 200],
      [20, 0],
    ]);
    // scale co chiều dài, KHÔNG co bề rộng
    plan = planWarn(warn({ shape: "line", r: 200, w: 40, angle: 0 }))!;
    warnPolygon(out, plan, 0.25, 8);
    expect(out[1].x).toBeCloseTo(50);
    expect(Math.abs(out[1].y - out[2].y)).toBeCloseTo(40);
  });

  it("warnArcSteps: bậc thấp thô hơn bậc cao, có chặn trên và dưới", () => {
    expect(warnArcSteps(4)).toBeLessThan(warnArcSteps(24));
    expect(warnArcSteps(4)).toBeGreaterThanOrEqual(5);
    expect(warnArcSteps(1e9)).toBe(WARN_MAX_ARC_STEPS);
    expect(warnArcSteps(NaN)).toBe(5);
  });
});

describe("telegraph: đạn (bolt)", () => {
  it("planBolt: tin hợp lệ giữ số; thời gian bay = range / speed", () => {
    const p = planBolt(bolt())!;
    expect(p).toMatchObject({ x: 100, y: 200, angle: 0, speed: 300, range: 450 });
    expect(p.flightMs).toBeCloseTo(1500);
  });

  it("planBolt: từ chối số không hữu hạn / không dương; kẹp tốc độ và tầm", () => {
    const bad: Array<Partial<BoltMsg>> = [
      { x: NaN },
      { y: Infinity },
      { angle: NaN },
      { speed: 0 },
      { speed: -10 },
      { speed: NaN },
      { range: 0 },
      { range: -1 },
      { range: Infinity },
    ];
    for (const o of bad) expect(planBolt(bolt(o)), JSON.stringify(o)).toBeNull();
    expect(planBolt(undefined as never)).toBeNull();
    expect(planBolt(bolt({ speed: 1e9 }))!.speed).toBe(BOLT_MAX_SPEED);
    expect(planBolt(bolt({ speed: 0.001 }))!.speed).toBe(BOLT_MIN_SPEED);
    expect(planBolt(bolt({ range: 1e9 }))!.range).toBe(BOLT_MAX_RANGE);
  });

  it("planBolt: màu theo hệ; không hệ hoặc hệ lạ thì trung tính", () => {
    expect(planBolt(bolt({ element: "hoa" }))!.tint).toBe(castTint("hoa"));
    expect(planBolt(bolt({ element: "thuy" }))!.tint).toBe(castTint("thuy"));
    expect(castTint("hoa")).not.toBe(castTint("thuy"));
    expect(planBolt(bolt())!.tint).toBe(BOLT_NEUTRAL_TINT);
    expect(planBolt(bolt({ element: "none" }))!.tint).toBe(BOLT_NEUTRAL_TINT);
    expect(planBolt(bolt({ element: "constructor" as never }))!.tint).toBe(BOLT_NEUTRAL_TINT);
  });

  it("boltPosition: bay thẳng theo angle với speed px/giây, dừng ở cuối tầm", () => {
    const p = planBolt(bolt({ angle: 0, speed: 300, range: 450 }))!;
    const out: Pt = { x: 0, y: 0 };
    expect(boltPosition(out, p, 0)).toEqual({ x: 100, y: 200 });
    boltPosition(out, p, 500); // 150 px
    expect(out.x).toBeCloseTo(250);
    expect(out.y).toBeCloseTo(200);
    boltPosition(out, p, 1500);
    expect(out.x).toBeCloseTo(550);
    boltPosition(out, p, 99999); // quá tầm: dừng ở 450 px
    expect(out.x).toBeCloseTo(550);
    // hướng chéo (xuống phải 45 độ)
    const d = planBolt(bolt({ angle: Math.PI / 4, speed: 100, range: 1000 }))!;
    boltPosition(out, d, 1000);
    expect(out.x - 100).toBeCloseTo(100 * Math.cos(Math.PI / 4));
    expect(out.y - 200).toBeCloseTo(100 * Math.sin(Math.PI / 4));
  });

  it("boltTravelled: không âm, không NaN, không vượt tầm", () => {
    const p = planBolt(bolt())!;
    expect(boltTravelled(p, -100)).toBe(0);
    expect(boltTravelled(p, NaN)).toBe(0);
    expect(boltTravelled(p, 1e9)).toBe(450);
  });

  it("boltAlive / boltAlpha: bay hết tầm rồi mờ trong BOLT_FADE_MS", () => {
    const p = planBolt(bolt())!; // flightMs 1500
    expect(boltAlive(p, 0)).toBe(true);
    expect(boltAlpha(p, 1500)).toBe(1);
    expect(boltAlpha(p, 1500 + BOLT_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(boltAlpha(p, 1500 + BOLT_FADE_MS)).toBe(0);
    expect(boltAlive(p, 1500 + BOLT_FADE_MS - 1)).toBe(true);
    expect(boltAlive(p, 1500 + BOLT_FADE_MS)).toBe(false);
  });
});

describe("telegraph: clipBoltToWall (đạn cắt tầm ở ô chặn như máy chủ)", () => {
  /** Tường thẳng đứng từ x = wallX trở đi (mọi y). */
  const wallAt = (wallX: number) => (x: number) => x >= wallX;

  it("không có hàm kiểm ô chặn, hoặc tường ở ngoài tầm: trả đúng kế hoạch cũ (không cấp phát)", () => {
    const p = planBolt(bolt({ x: 0, y: 0, angle: 0, range: 300 }))!;
    expect(clipBoltToWall(p, undefined)).toBe(p);
    expect(clipBoltToWall(p, () => false)).toBe(p);
    expect(clipBoltToWall(p, wallAt(301))).toBe(p);
  });

  it("tường ở giữa đường bay: tầm cắt sát tường (sai số ~1 px), thời gian bay theo tầm mới, kế hoạch cũ không bị sửa", () => {
    const p = planBolt(bolt({ x: 0, y: 0, angle: 0, speed: 300, range: 300 }))!;
    const c = clipBoltToWall(p, wallAt(100));
    expect(c).not.toBe(p);
    expect(c.range).toBeLessThanOrEqual(100);
    expect(c.range).toBeGreaterThan(100 - 1.1);
    expect(c.flightMs).toBeCloseTo((c.range / 300) * 1000);
    expect(p.range).toBe(300); // không sửa bản cũ
    expect(p.flightMs).toBeCloseTo(1000);
    expect({ ...c, range: 0, flightMs: 0 }).toEqual({ ...p, range: 0, flightMs: 0 }); // chỉ đổi tầm + thời gian
  });

  it("tường đúng tại mốc lấy mẫu và ngay cạnh: không lọt (tường mỏng một ô 32 px cũng bị bắt)", () => {
    const p = planBolt(bolt({ x: 0, y: 0, angle: 0, range: 600 }))!;
    for (const wall of [BOLT_WALL_SAMPLE, BOLT_WALL_SAMPLE + 1, 2 * BOLT_WALL_SAMPLE, 250.5]) {
      const c = clipBoltToWall(p, wallAt(wall));
      expect(c.range, `tường ${wall}`).toBeLessThanOrEqual(wall);
      expect(c.range, `tường ${wall}`).toBeGreaterThan(wall - 1.1);
    }
    // tường mỏng 32 px ở 200..232: chắc chắn bị quét thấy
    const thin = clipBoltToWall(p, (x) => x >= 200 && x < 232);
    expect(thin.range).toBeLessThanOrEqual(200);
    expect(thin.range).toBeGreaterThan(198.9);
  });

  it("chạm tường ngay trước mặt: tầm 0 (đạn tắt tại chỗ), không âm, không NaN", () => {
    const p = planBolt(bolt({ x: 0, y: 0, angle: 0, speed: 300, range: 300 }))!;
    const c = clipBoltToWall(p, wallAt(0.5));
    expect(c.range).toBeGreaterThanOrEqual(0);
    expect(c.range).toBeLessThan(1);
    expect(Number.isFinite(c.flightMs)).toBe(true);
    expect(boltAlive(c, 0)).toBe(true);
    expect(boltAlive(c, c.flightMs + BOLT_FADE_MS + 1)).toBe(false);
  });

  it("hướng chéo và ngược: tầm cắt theo khoảng cách dọc đường bay, không theo trục x", () => {
    // tường nằm ở y >= 50; bay xuống 45 độ từ gốc: chạm khi d*sin45 = 50 => d ~ 70,7
    const down = planBolt(bolt({ x: 0, y: 0, angle: Math.PI / 4, range: 400 }))!;
    const c = clipBoltToWall(down, (_x, y) => y >= 50);
    expect(c.range).toBeLessThanOrEqual(50 / Math.sin(Math.PI / 4));
    expect(c.range).toBeGreaterThan(50 / Math.sin(Math.PI / 4) - 1.1);
    // bay sang trái, tường ở x <= -120
    const left = planBolt(bolt({ x: 0, y: 0, angle: Math.PI, range: 400 }))!;
    const l = clipBoltToWall(left, (x) => x <= -120);
    expect(l.range).toBeLessThanOrEqual(120);
    expect(l.range).toBeGreaterThan(118.9);
  });

  it("số lần gọi hàm kiểm bị chặn: tối đa ~ range / mẫu + vài lần tinh chỉnh (không vòng lặp vô hạn)", () => {
    let calls = 0;
    const p = planBolt(bolt({ x: 0, y: 0, angle: 0, range: BOLT_MAX_RANGE }))!;
    clipBoltToWall(p, () => (calls++, false));
    expect(calls).toBeLessThanOrEqual(Math.ceil(BOLT_MAX_RANGE / BOLT_WALL_SAMPLE) + 1);
    calls = 0;
    clipBoltToWall(p, (x) => (calls++, x >= 500));
    expect(calls).toBeLessThanOrEqual(Math.ceil(500 / BOLT_WALL_SAMPLE) + 8);
  });
});

describe("telegraph: trần theo bậc chất lượng", () => {
  it("bậc cao nhiều hơn bậc thấp; số cụ thể của bốn bậc", () => {
    const lim = (b: number) => telegraphLimits(b);
    expect(lim(4)).toEqual({ warns: 4, bolts: 8, detail: false });
    expect(lim(10)).toEqual({ warns: 7, bolts: 10, detail: true });
    expect(lim(24)).toEqual({ warns: 14, bolts: 24, detail: true });
    expect(lim(40)).toEqual({ warns: 16, bolts: 32, detail: true });
    expect(lim(NaN)).toEqual({ warns: 4, bolts: 8, detail: false });
    expect(lim(-5).warns).toBeGreaterThanOrEqual(4);
  });

  it("vệt đuôi đạn: 0 ở bậc không chi tiết, nhiều hơn ở bậc cao", () => {
    expect(boltTrailCount(telegraphLimits(4))).toBe(0);
    expect(boltTrailCount(telegraphLimits(10))).toBe(3);
    expect(boltTrailCount(telegraphLimits(24))).toBe(4);
  });
});

describe("telegraph: warnCovers (mình có đang trong vùng báo không)", () => {
  const P = (o: Partial<WarnMsg>) => planWarn(warn(o))!;
  it("circle: trong bán kính + bề dày thân; sát mép tính là trong, ngay ngoài thì không", () => {
    const c = P({ shape: "circle", x: 100, y: 100, r: 60 });
    expect(warnCovers(c, 100, 100)).toBe(true);
    expect(warnCovers(c, 160, 100)).toBe(true); // đúng mép
    expect(warnCovers(c, 160.5, 100)).toBe(false);
    expect(warnCovers(c, 175, 100, 16)).toBe(true); // thân bán kính 16 chạm vào vùng
    expect(warnCovers(c, 177, 100, 16)).toBe(false);
  });

  it("line: hình viên thuốc quanh đoạn lao (nửa bề rộng + thân); phía sau điểm xuất phát chỉ trong đầu tròn", () => {
    const l = P({ shape: "line", x: 0, y: 0, r: 280, w: 56, angle: 0 });
    expect(warnCovers(l, 140, 0)).toBe(true);
    expect(warnCovers(l, 140, 28)).toBe(true); // mép bên
    expect(warnCovers(l, 140, 29)).toBe(false);
    expect(warnCovers(l, 140, 40, 14)).toBe(true); // thân 14 chạm mép
    expect(warnCovers(l, 140, 43, 14)).toBe(false);
    expect(warnCovers(l, 280, 0)).toBe(true); // đúng đầu mút
    expect(warnCovers(l, 281, 0)).toBe(true); // đầu tròn (28 px quanh đầu mút)
    expect(warnCovers(l, 310, 0)).toBe(false);
    expect(warnCovers(l, -20, 0)).toBe(true); // đầu tròn sau lưng quái
    expect(warnCovers(l, -40, 0)).toBe(false);
    // hướng khác: xuống (pi/2)
    const down = P({ shape: "line", x: 0, y: 0, r: 280, w: 56, angle: Math.PI / 2 });
    expect(warnCovers(down, 0, 200)).toBe(true);
    expect(warnCovers(down, 200, 0)).toBe(false);
  });

  it("cone: trong bán kính và trong góc mở quanh hướng; thân rộng thì nới góc; sát tâm luôn trong", () => {
    const c = P({ shape: "cone", x: 0, y: 0, r: 100, angle: 0, arc: Math.PI / 2 }); // +-45 độ
    expect(warnCovers(c, 50, 0)).toBe(true);
    expect(warnCovers(c, 50, 49)).toBe(true); // ~44,4 độ
    expect(warnCovers(c, 50, 52)).toBe(false); // ~46,1 độ
    expect(warnCovers(c, 50, 52, 10)).toBe(true); // thân 10 nới thêm góc
    expect(warnCovers(c, 101, 0)).toBe(false);
    expect(warnCovers(c, -50, 0)).toBe(false); // sau lưng
    expect(warnCovers(c, -5, 0, 10)).toBe(true); // thân chạm tâm quạt
    // hướng quanh góc +-pi: người ở phía trái, quạt hướng trái (angle = pi)
    const left = P({ shape: "cone", x: 0, y: 0, r: 100, angle: Math.PI, arc: 1 });
    expect(warnCovers(left, -50, 5)).toBe(true);
    expect(warnCovers(left, -50, -5)).toBe(true); // vắt qua điểm nhảy +-pi
    expect(warnCovers(left, 50, 0)).toBe(false);
    // góc hướng ngoài [-pi, pi] (nhiều vòng): vẫn so đúng hướng, không "nhầm" phía đối diện thành cùng hướng
    const wound = P({ shape: "cone", x: 0, y: 0, r: 100, angle: 4 * Math.PI + 1, arc: 1 });
    expect(warnCovers(wound, Math.cos(1) * 50, Math.sin(1) * 50)).toBe(true);
    expect(warnCovers(wound, -Math.cos(1) * 50, -Math.sin(1) * 50)).toBe(false);
  });

  it("số không hữu hạn: không bao giờ 'trong'", () => {
    const c = P({ shape: "circle", x: 0, y: 0, r: 60 });
    expect(warnCovers(c, NaN, 0)).toBe(false);
    expect(warnCovers(c, 0, Infinity)).toBe(false);
    expect(warnCovers(c, 0, 0, NaN)).toBe(false);
    expect(warnCovers(c, 0, 0, -50)).toBe(true); // bề dày âm coi như 0
  });
});
