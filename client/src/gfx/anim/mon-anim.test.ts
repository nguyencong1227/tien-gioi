import { describe, it, expect } from "vitest";
import {
  MON_ONE_SHOT,
  animTickDue,
  markMonAttack,
  markMonHurt,
  monAnimKey,
  monAnimMs,
  monAnimState,
  newMonAnimClock,
} from "./mon-anim";

describe("gfx/anim/mon-anim: máy trạng thái hoạt ảnh yêu thú", () => {
  it("mặc định là đi; khoá hoạt ảnh khớp textures.ts", () => {
    const c = newMonAnimClock();
    expect(monAnimState(c, 0)).toBe("move");
    expect(monAnimState(c, 123456)).toBe("move");
    expect(monAnimKey("lang", "move")).toBe("mon-lang-move");
    expect(monAnimKey("mang", "die")).toBe("mon-mang-die");
  });

  it("đánh: đúng trong khoảng thời lượng rồi quay về đi", () => {
    const c = newMonAnimClock();
    markMonAttack(c, 1000);
    expect(monAnimState(c, 1000)).toBe("attack");
    expect(monAnimState(c, 1000 + monAnimMs("attack") - 1)).toBe("attack");
    expect(monAnimState(c, 1000 + monAnimMs("attack"))).toBe("move");
  });

  it("bị đánh: đúng trong khoảng thời lượng rồi quay về đi", () => {
    const c = newMonAnimClock();
    markMonHurt(c, 500);
    expect(monAnimState(c, 500)).toBe("hurt");
    expect(monAnimState(c, 500 + monAnimMs("hurt") - 1)).toBe("hurt");
    expect(monAnimState(c, 500 + monAnimMs("hurt"))).toBe("move");
  });

  it("ưu tiên: gục > bị đánh > đánh > đi", () => {
    const c = newMonAnimClock();
    markMonAttack(c, 0);
    markMonHurt(c, 50);
    // bị đánh cắt ngang đòn đánh đang chạy
    expect(monAnimState(c, 60)).toBe("hurt");
    // hết giật lùi mà đòn đánh còn hạn thì trở lại đòn đánh
    const afterHurt = 50 + monAnimMs("hurt");
    expect(monAnimState(c, afterHurt)).toBe(afterHurt < monAnimMs("attack") ? "attack" : "move");
    c.dying = true;
    expect(monAnimState(c, 60)).toBe("die");
    expect(monAnimState(c, 10_000_000)).toBe("die");
  });

  it("thời lượng = số khung / tốc độ, khớp bảng đăng ký (một nguồn duy nhất)", () => {
    for (const k of Object.keys(MON_ONE_SHOT) as Array<keyof typeof MON_ONE_SHOT>) {
      const a = MON_ONE_SHOT[k];
      expect(monAnimMs(k)).toBe(Math.round((a.frames.length * 1000) / a.fps));
      expect(monAnimMs(k)).toBeGreaterThan(0);
    }
    expect(MON_ONE_SHOT.die.frames).toHaveLength(4);
    expect(MON_ONE_SHOT.attack.frames).toHaveLength(2);
    expect(MON_ONE_SHOT.hurt.frames).toHaveLength(1);
  });

  it("animTickDue: thực thể ở xa cập nhật theo farAnimHz; hz rác thì luôn cập nhật", () => {
    // 8 Hz = mỗi 125 ms
    expect(animTickDue(1000, 900, 8)).toBe(false);
    expect(animTickDue(1000, 875, 8)).toBe(true);
    expect(animTickDue(1000, 876, 8)).toBe(false);
    // 30 Hz ~ 33,3 ms
    expect(animTickDue(1033, 1000, 30)).toBe(false);
    expect(animTickDue(1034, 1000, 30)).toBe(true);
    for (const hz of [0, -5, NaN, Infinity]) expect(animTickDue(1, 1, hz)).toBe(true);
  });
});
