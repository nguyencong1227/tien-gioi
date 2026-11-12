import { describe, expect, it } from "vitest";
import {
  HURT_PULSE_MS,
  HURT_STRETCH_X,
  NEUTRAL_TWEEN,
  STRIKE_PULSE_MS,
  STRIKE_STRETCH_X,
  WALK_BOB_PERIOD_MS,
  WALK_BOB_PX,
  footPlant,
  sinceStart,
  spriteTween,
  tweenEnabled,
  walkBob,
  type TweenInput,
} from "./tween";

const base: TweenInput = {
  enabled: true,
  nowMs: 1000,
  moving: false,
  dead: false,
  strikeSince: -1,
  hurtSince: -1,
  phaseMs: 0,
};

describe("tween: tweenEnabled", () => {
  it("bật khi không giảm chuyển động, không bậc Thấp và ở gần", () => {
    expect(tweenEnabled({ reducedMotion: false, tier: "high" }, true)).toBe(true);
    expect(tweenEnabled({ reducedMotion: false, tier: "mid" }, true)).toBe(true);
  });
  it("tắt khi giảm chuyển động, bậc Thấp hoặc ở xa", () => {
    expect(tweenEnabled({ reducedMotion: true, tier: "high" }, true)).toBe(false);
    expect(tweenEnabled({ reducedMotion: false, tier: "low" }, true)).toBe(false);
    expect(tweenEnabled({ reducedMotion: false, tier: "high" }, false)).toBe(false);
  });
});

describe("tween: walkBob", () => {
  it("nằm trong [-WALK_BOB_PX, 0], chạm đất ở đầu mỗi nửa chu kỳ, đỉnh ở giữa", () => {
    expect(walkBob(0)).toBeCloseTo(0, 6);
    expect(walkBob(WALK_BOB_PERIOD_MS / 2)).toBeCloseTo(0, 6);
    expect(walkBob(WALK_BOB_PERIOD_MS / 4)).toBeCloseTo(-WALK_BOB_PX, 6);
    for (let t = 0; t < 2000; t += 7) {
      const v = walkBob(t);
      expect(v).toBeLessThanOrEqual(1e-9);
      expect(v).toBeGreaterThanOrEqual(-WALK_BOB_PX - 1e-9);
    }
  });
  it("số hỏng trả 0", () => {
    expect(walkBob(NaN)).toBe(0);
    expect(walkBob(Infinity)).toBe(0);
  });
});

describe("tween: sinceStart", () => {
  it("đang diễn ra thì trả thời gian đã trôi, còn lại -1", () => {
    // đòn kéo dài 220 ms, hết ở mốc 1220 => bắt đầu ở 1000
    expect(sinceStart(1000, 1220, 220)).toBe(0);
    expect(sinceStart(1100, 1220, 220)).toBe(100);
    expect(sinceStart(1219, 1220, 220)).toBe(219);
    expect(sinceStart(1220, 1220, 220)).toBe(-1); // vừa hết
    expect(sinceStart(999, 1220, 220)).toBe(-1); // chưa bắt đầu
    expect(sinceStart(5000, 0, 220)).toBe(-1); // chưa từng (until = 0)
  });
  it("số hỏng và thời lượng không dương trả -1", () => {
    expect(sinceStart(NaN, 1220, 220)).toBe(-1);
    expect(sinceStart(1000, Infinity, 220)).toBe(-1);
    expect(sinceStart(1000, 1220, 0)).toBe(-1);
    expect(sinceStart(1000, 1220, -5)).toBe(-1);
  });
});

describe("tween: spriteTween", () => {
  it("không bật hoặc đã gục: trung tính, dù đang đi / đánh", () => {
    const busy = { ...base, moving: true, strikeSince: 50, hurtSince: 50 };
    expect(spriteTween({ ...busy, enabled: false })).toBe(NEUTRAL_TWEEN);
    expect(spriteTween({ ...busy, dead: true })).toBe(NEUTRAL_TWEEN);
  });
  it("đứng yên: trung tính", () => {
    expect(spriteTween(base)).toBe(NEUTRAL_TWEEN);
  });
  it("đi: chỉ nhấp nhô (không co giãn), theo pha riêng", () => {
    const a = spriteTween({ ...base, moving: true, nowMs: WALK_BOB_PERIOD_MS / 4 });
    expect(a.sx).toBe(1);
    expect(a.sy).toBe(1);
    expect(a.dy).toBeCloseTo(-WALK_BOB_PX, 6);
    // lệch pha một phần tư chu kỳ: cùng thời điểm nhưng chạm đất
    const b = spriteTween({
      ...base,
      moving: true,
      nowMs: WALK_BOB_PERIOD_MS / 4,
      phaseMs: WALK_BOB_PERIOD_MS / 4,
    });
    expect(b.dy).toBeCloseTo(0, 6);
  });
  it("đánh: giãn ngang, nén dọc nhẹ, đỉnh ở giữa, về 1 ở hai đầu và sau khi hết", () => {
    const mid = spriteTween({ ...base, strikeSince: STRIKE_PULSE_MS / 2 });
    expect(mid.sx).toBeCloseTo(1 + STRIKE_STRETCH_X, 6);
    expect(mid.sy).toBeLessThan(1);
    expect(mid.dy).toBe(0);
    expect(spriteTween({ ...base, strikeSince: 0 })).toBe(NEUTRAL_TWEEN); // đầu xung = 0
    expect(spriteTween({ ...base, strikeSince: STRIKE_PULSE_MS })).toBe(NEUTRAL_TWEEN);
    expect(spriteTween({ ...base, strikeSince: -1 })).toBe(NEUTRAL_TWEEN);
  });
  it("bị đánh: nén dọc rõ hơn đánh và ưu tiên hơn đánh / đi", () => {
    const hurt = spriteTween({
      ...base,
      moving: true,
      strikeSince: STRIKE_PULSE_MS / 2,
      hurtSince: HURT_PULSE_MS / 2,
    });
    expect(hurt.sx).toBeCloseTo(1 + HURT_STRETCH_X, 6);
    expect(hurt.sy).toBeLessThan(spriteTween({ ...base, strikeSince: STRIKE_PULSE_MS / 2 }).sy);
    expect(hurt.dy).toBe(0); // bị đánh thì không nảy
  });
  it("đi lúc đang đánh: ưu tiên co giãn, không nhấp nhô", () => {
    const r = spriteTween({ ...base, moving: true, strikeSince: STRIKE_PULSE_MS / 2 });
    expect(r.dy).toBe(0);
    expect(r.sx).toBeGreaterThan(1);
  });
  it("biên độ luôn trong ±15 % và dy trong [-WALK_BOB_PX, 0] với mọi đầu vào", () => {
    for (let t = 0; t < 400; t += 3) {
      const r = spriteTween({
        ...base,
        moving: t % 2 === 0,
        strikeSince: t % 5 === 0 ? t : -1,
        hurtSince: t % 7 === 0 ? t : -1,
        nowMs: t * 11,
      });
      expect(Math.abs(r.sx - 1)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(r.sy - 1)).toBeLessThanOrEqual(0.15);
      expect(r.dy).toBeLessThanOrEqual(1e-9);
      expect(r.dy).toBeGreaterThanOrEqual(-WALK_BOB_PX - 1e-9);
    }
  });
  it("pha hỏng được coi là 0", () => {
    const r = spriteTween({ ...base, moving: true, nowMs: WALK_BOB_PERIOD_MS / 4, phaseMs: NaN });
    expect(r.dy).toBeCloseTo(-WALK_BOB_PX, 6);
  });
});

describe("tween: footPlant", () => {
  it("giữ chân đứng yên: đáy sprite (gốc giữa) = y + h/2 * sy + footPlant không đổi", () => {
    const h = 40;
    for (const sy of [0.88, 0.92, 1, 1.05]) {
      const bottom = (h / 2) * sy + footPlant(h, sy);
      expect(bottom).toBeCloseTo(h / 2, 9);
    }
    expect(footPlant(40, 1)).toBe(0);
  });
  it("số hỏng trả 0", () => {
    expect(footPlant(NaN, 0.9)).toBe(0);
    expect(footPlant(40, NaN)).toBe(0);
  });
});
