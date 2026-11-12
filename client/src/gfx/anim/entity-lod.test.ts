import { describe, expect, it } from "vitest";
import {
  FAR_ANIM_DIST,
  SHADOW_TEX_H,
  SHADOW_TEX_W,
  animUpdateDue,
  labelVisible,
  monsterShadow,
  playerShadow,
} from "./entity-lod";
import { TIER_BASE } from "../quality";

describe("gfx/anim: animUpdateDue (hoạt ảnh thực thể ở xa theo farAnimHz)", () => {
  it("gần (< FAR_ANIM_DIST) thì LUÔN cập nhật, bất kể lần trước", () => {
    expect(animUpdateDue(1000, 999, 0, 8)).toBe(true);
    expect(animUpdateDue(1000, 1000, FAR_ANIM_DIST - 1, 8)).toBe(true);
  });

  it("xa: chỉ khi đã qua 1000/hz ms kể từ lần trước", () => {
    const step = 1000 / 8; // 125 ms ở 8 Hz
    expect(animUpdateDue(1000, 1000, FAR_ANIM_DIST, 8)).toBe(false);
    expect(animUpdateDue(1000 + step - 1, 1000, 900, 8)).toBe(false);
    expect(animUpdateDue(1000 + step, 1000, 900, 8)).toBe(true);
  });

  it("số lần cập nhật trong 1 giây ở 60 khung / giây: gần 60, xa ~ hz của từng bậc", () => {
    for (const [tier, base] of Object.entries(TIER_BASE)) {
      let last = -1e9;
      let n = 0;
      for (let t = 0; t < 1000; t += 1000 / 60) {
        if (animUpdateDue(t, last, 800, base.farAnimHz)) {
          last = t;
          n++;
        }
      }
      expect(n, tier).toBeLessThanOrEqual(base.farAnimHz + 1);
      expect(n, tier).toBeGreaterThanOrEqual(Math.floor(base.farAnimHz * 0.7));
    }
  });

  it("số rác (NaN, vô cực, hz <= 0) không bao giờ đóng băng hoạt ảnh", () => {
    expect(animUpdateDue(1000, 1000, Number.NaN, 8)).toBe(true);
    expect(animUpdateDue(Number.NaN, 0, 900, 8)).toBe(true);
    expect(animUpdateDue(1000, Number.NaN, 900, 8)).toBe(true);
    expect(animUpdateDue(1000, 1000, 900, 0)).toBe(true); // hz <= 0 = luôn cập nhật (animTickDue)
    expect(animUpdateDue(1000, 1000, Number.POSITIVE_INFINITY, 8)).toBe(true);
  });
});

describe("gfx/anim: labelVisible (nhãn tên theo nameLabelRadius)", () => {
  it("của mình luôn hiện; người khác: ẩn tên thì không, ngoài bán kính thì không, trong bán kính thì có", () => {
    expect(labelVisible(true, true, 9999, 10)).toBe(true);
    expect(labelVisible(false, true, 10, 640)).toBe(false);
    expect(labelVisible(false, false, 260, 260)).toBe(true);
    expect(labelVisible(false, false, 261, 260)).toBe(false);
    expect(labelVisible(false, false, Number.NaN, 640)).toBe(false);
  });

  it("bán kính tăng theo bậc (Thấp < Vừa < Cao)", () => {
    expect(TIER_BASE.low.nameLabelRadius).toBeLessThan(TIER_BASE.mid.nameLabelRadius);
    expect(TIER_BASE.mid.nameLabelRadius).toBeLessThan(TIER_BASE.high.nameLabelRadius);
  });
});

describe("gfx/anim: kích thước bóng đốm", () => {
  it("người chơi cố định; quái theo bán kính, kẹp 16..120, bán kính hỏng thì cỡ nhỏ", () => {
    const p = playerShadow();
    expect(p.w).toBeGreaterThan(p.h);
    const small = monsterShadow(10);
    const big = monsterShadow(40);
    expect(big.w).toBeGreaterThan(small.w);
    expect(big.y).toBeGreaterThan(small.y);
    expect(monsterShadow(1).w).toBe(16);
    expect(monsterShadow(9999).w).toBe(120);
    expect(monsterShadow(Number.NaN).w).toBeGreaterThanOrEqual(16);
    for (const r of [1, 10, 40, 500]) {
      const s = monsterShadow(r);
      expect(s.h).toBeLessThan(s.w); // dẹt như bóng thật
    }
  });

  it("texture bóng nhỏ (<= 8 KB) và dẹt", () => {
    expect(SHADOW_TEX_W * SHADOW_TEX_H * 4).toBeLessThanOrEqual(8 * 1024);
    expect(SHADOW_TEX_H).toBeLessThan(SHADOW_TEX_W);
  });
});
