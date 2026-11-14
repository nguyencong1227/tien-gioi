import { describe, expect, it } from "vitest";
import {
  BOLT_FADE_MS,
  BOLT_MAX_RANGE,
  BOLT_MAX_SPEED,
  BOLT_MIN_SPEED,
  BOLT_NEUTRAL_TINT,
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
  planBolt,
  planWarn,
  telegraphLimits,
  warnAlive,
  warnArcSteps,
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
