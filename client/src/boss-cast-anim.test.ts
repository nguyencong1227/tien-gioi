// Hoạt ảnh gồng / đáp của trùm (mục 42, T4 #873): tư thế theo thời gian, giảm chuyển động chỉ còn ánh màu, ghép lên tween nền, lượng tử hoá ánh.
import { describe, expect, it } from "vitest";
import { NEUTRAL_TWEEN } from "./gfx/anim/tween";
import {
  BOSS_GLOW_COLOR,
  BOSS_GLOW_STEPS,
  BOSS_STRIKE_MS,
  BOSS_STRIKE_SX,
  BOSS_STRIKE_SY,
  BOSS_WINDUP_SX,
  BOSS_WINDUP_SY,
  NEUTRAL_POSE,
  bossCastPose,
  bossGlowStep,
  bossGlowTint,
  composeTween,
} from "./boss-cast-anim";

const MS = 1000;

describe("bossCastPose: gồng rồi đáp", () => {
  it("lúc mới báo: chưa co giãn, chưa ánh; phase = windup", () => {
    const p = bossCastPose(0, MS, false);
    expect(p).toMatchObject({ phase: "windup", sx: 1, sy: 1, glow: 0 });
  });

  it("giữa chừng gồng: nở ngang, co thấp, ánh tăng; nặng dần (tăng tốc)", () => {
    const mid = bossCastPose(MS / 2, MS, false);
    expect(mid.phase).toBe("windup");
    expect(mid.sx).toBeGreaterThan(1);
    expect(mid.sy).toBeLessThan(1);
    expect(mid.glow).toBeCloseTo(0.5, 5);
    // tăng tốc: nửa đường mới được một phần tư mức cực đại
    expect(mid.sx - 1).toBeCloseTo(BOSS_WINDUP_SX * 0.25, 5);
    expect(mid.sy - 1).toBeCloseTo(BOSS_WINDUP_SY * 0.25, 5);
    const late = bossCastPose(MS * 0.95, MS, false);
    expect(late.sx).toBeGreaterThan(mid.sx);
    expect(late.sy).toBeLessThan(mid.sy);
    expect(late.glow).toBeGreaterThan(mid.glow);
  });

  it("đúng lúc đòn rơi: bật sang đáp, vươn cao + hẹp ngang ở đỉnh, ánh đầy", () => {
    const hit = bossCastPose(MS, MS, false);
    expect(hit.phase).toBe("strike");
    expect(hit.sx).toBeCloseTo(1 + BOSS_STRIKE_SX, 5);
    expect(hit.sy).toBeCloseTo(1 + BOSS_STRIKE_SY, 5);
    expect(hit.glow).toBeCloseTo(1, 5);
  });

  it("đáp tắt dần rồi hết: sau BOSS_STRIKE_MS là trung tính (đúng đối tượng NEUTRAL_POSE)", () => {
    const half = bossCastPose(MS + BOSS_STRIKE_MS / 2, MS, false);
    expect(half.phase).toBe("strike");
    expect(half.glow).toBeCloseTo(0.5, 5);
    expect(half.sy).toBeCloseTo(1 + BOSS_STRIKE_SY * 0.5, 5);
    expect(bossCastPose(MS + BOSS_STRIKE_MS, MS, false)).toBe(NEUTRAL_POSE);
    expect(bossCastPose(MS + 5000, MS, false)).toBe(NEUTRAL_POSE);
  });

  it("GIẢM CHUYỂN ĐỘNG: không co giãn lúc nào, ánh màu vẫn chạy cùng nhịp", () => {
    for (const el of [0, MS * 0.3, MS * 0.9, MS, MS + 40, MS + BOSS_STRIKE_MS - 1]) {
      const p = bossCastPose(el, MS, true);
      expect(p.sx).toBe(1);
      expect(p.sy).toBe(1);
    }
    expect(bossCastPose(MS * 0.9, MS, true).glow).toBeCloseTo(0.9, 5);
    expect(bossCastPose(MS, MS, true).glow).toBeCloseTo(1, 5);
    expect(bossCastPose(MS * 0.9, MS, true).phase).toBe("windup");
  });

  it("số hỏng / thời gian âm / thời lượng gồng <= 0: trung tính, không ném", () => {
    for (const [el, ms] of [
      [NaN, MS],
      [Infinity, MS],
      [-1, MS],
      [100, 0],
      [100, -5],
      [100, NaN],
      [100, Infinity],
    ] as const)
      expect(bossCastPose(el, ms, false)).toBe(NEUTRAL_POSE);
  });

  it("ánh nằm trong [0, 1] ở mọi lúc", () => {
    for (let el = 0; el < MS + BOSS_STRIKE_MS + 50; el += 7) {
      const g = bossCastPose(el, MS, false).glow;
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });
});

describe("composeTween: ghép lên tween nền", () => {
  it("tư thế trung tính: trả NGUYÊN đối tượng nền (không tạo mới mỗi khung)", () => {
    expect(composeTween(NEUTRAL_TWEEN, NEUTRAL_POSE)).toBe(NEUTRAL_TWEEN);
    const walking = { dy: -1.2, sx: 1, sy: 1 };
    expect(composeTween(walking, NEUTRAL_POSE)).toBe(walking);
  });

  it("giảm chuyển động (sx = sy = 1 nhưng còn ánh): vẫn trả nguyên tween nền", () => {
    const p = bossCastPose(MS * 0.5, MS, true);
    expect(composeTween(NEUTRAL_TWEEN, p)).toBe(NEUTRAL_TWEEN);
  });

  it("nhân tỉ lệ lên nền, giữ dy (trùm đang bước + gồng)", () => {
    const base = { dy: -1.5, sx: 1.1, sy: 0.9 };
    const pose = bossCastPose(MS * 0.8, MS, false);
    const t = composeTween(base, pose);
    expect(t.dy).toBe(-1.5);
    expect(t.sx).toBeCloseTo(1.1 * pose.sx, 8);
    expect(t.sy).toBeCloseTo(0.9 * pose.sy, 8);
  });

  it("kết quả khác NEUTRAL_TWEEN khi đang gồng (để cảnh biết phải ghi tỉ lệ)", () => {
    expect(composeTween(NEUTRAL_TWEEN, bossCastPose(MS * 0.8, MS, false))).not.toBe(NEUTRAL_TWEEN);
  });
});

describe("ánh đỏ cam: lượng tử hoá và màu", () => {
  it("bậc 0 .. BOSS_GLOW_STEPS, kẹp hai đầu, số hỏng = 0", () => {
    expect(bossGlowStep(0)).toBe(0);
    expect(bossGlowStep(-0.4)).toBe(0);
    expect(bossGlowStep(NaN)).toBe(0);
    expect(bossGlowStep(1)).toBe(BOSS_GLOW_STEPS);
    expect(bossGlowStep(7)).toBe(BOSS_GLOW_STEPS);
    expect(bossGlowStep(0.5)).toBe(BOSS_GLOW_STEPS / 2);
  });

  it("bậc tăng không giảm theo ánh (đơn điệu): cảnh chỉ gọi setTint khi đổi bậc", () => {
    let prev = 0;
    const steps = new Set<number>();
    for (let g = 0; g <= 1.0001; g += 0.01) {
      const s = bossGlowStep(g);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
      steps.add(s);
    }
    expect(steps.size).toBe(BOSS_GLOW_STEPS + 1);
  });

  it("màu: bậc 0 = trắng (màu gốc), bậc đầy = BOSS_GLOW_COLOR, ở giữa nằm giữa hai đầu", () => {
    expect(bossGlowTint(0)).toBe(0xffffff);
    expect(bossGlowTint(BOSS_GLOW_STEPS)).toBe(BOSS_GLOW_COLOR);
    const mid = bossGlowTint(BOSS_GLOW_STEPS / 2);
    const g = (c: number, shift: number) => (c >> shift) & 0xff;
    for (const sh of [16, 8, 0]) {
      const lo = Math.min(g(0xffffff, sh), g(BOSS_GLOW_COLOR, sh));
      const hi = Math.max(g(0xffffff, sh), g(BOSS_GLOW_COLOR, sh));
      expect(g(mid, sh)).toBeGreaterThanOrEqual(lo);
      expect(g(mid, sh)).toBeLessThanOrEqual(hi);
    }
    expect(bossGlowTint(99)).toBe(BOSS_GLOW_COLOR);
    expect(bossGlowTint(-3)).toBe(0xffffff);
    expect(bossGlowTint(NaN)).toBe(0xffffff);
  });
});
