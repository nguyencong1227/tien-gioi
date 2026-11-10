// Bộ đếm cửa sổ và khoá mềm: hết hạn đúng lúc, quên sau một giờ, bộ nhớ có trần.
import { describe, expect, it } from "vitest";
import { FAILS_PER_LOCK, LOCK_STEPS_S, LoginLocks, WindowCounter } from "./auth-limits";

const S = 1000;
const MIN = 60 * S;

describe("WindowCounter", () => {
  it("đếm trong cửa sổ, hết cửa sổ thì về 0; retryAfterMs đúng; khoá khác nhau độc lập", () => {
    const c = new WindowCounter(10 * MIN);
    expect([c.add("a", 0), c.add("a", 1000), c.count("a", 2000), c.count("b", 2000)]).toEqual([
      1, 2, 2, 0,
    ]);
    expect(c.retryAfterMs("a", 4000)).toBe(10 * MIN - 0 - 4000);
    expect(c.count("a", 10 * MIN - 1)).toBe(2);
    expect(c.count("a", 10 * MIN)).toBe(0);
    expect(c.retryAfterMs("a", 10 * MIN)).toBe(0);
    expect(c.add("a", 10 * MIN)).toBe(1); // cửa sổ mới
  });

  it("có trần: bỏ khoá hết hạn trước, đầy thật thì bỏ khoá cũ nhất; không vượt trần", () => {
    const c = new WindowCounter(MIN, 20);
    for (let i = 0; i < 20; i++) c.add(`k${i}`, 0);
    c.add("moi", 2 * MIN); // 20 khoá cũ đã hết hạn: dọn hết
    expect(c.size).toBe(1);
    const d = new WindowCounter(MIN, 20);
    for (let i = 0; i < 500; i++) d.add(`k${i}`, i); // không cái nào hết hạn
    expect(d.size).toBeLessThanOrEqual(20);
    expect(d.count("k499", 500)).toBe(1); // khoá mới nhất còn
    expect(d.count("k0", 500)).toBe(0); // khoá cũ nhất bị bỏ
  });
});

describe("LoginLocks", () => {
  it(`${FAILS_PER_LOCK} lần thất bại thì khoá theo bậc ${LOCK_STEPS_S.join(" / ")} giây, rồi giữ bậc cuối`, () => {
    const l = new LoginLocks();
    let now = 0;
    const burst = () => {
      for (let i = 0; i < FAILS_PER_LOCK; i++) l.fail("x", now);
    };
    for (let i = 0; i < FAILS_PER_LOCK - 1; i++) l.fail("x", now);
    expect(l.lockedMs("x", now)).toBe(0);
    l.fail("x", now);
    expect(l.lockedMs("x", now)).toBe(60 * S);
    now += 60 * S;
    expect(l.lockedMs("x", now)).toBe(0);
    burst();
    expect(l.lockedMs("x", now)).toBe(300 * S);
    now += 300 * S;
    burst();
    expect(l.lockedMs("x", now)).toBe(1800 * S);
    now += 1800 * S;
    burst();
    expect(l.lockedMs("x", now)).toBe(1800 * S);
  });

  it("success xoá; quên sau 1 giờ kể từ lúc hết khoá (bậc về đầu); khoá đang chạy thì không bị quên", () => {
    const l = new LoginLocks();
    for (let i = 0; i < FAILS_PER_LOCK; i++) l.fail("x", 0);
    for (let i = 0; i < FAILS_PER_LOCK; i++) l.fail("x", 60 * S); // bậc 2 (300 s) tới 360 s
    expect(l.lockedMs("x", 60 * S)).toBe(300 * S);
    expect(l.lockedMs("x", 359 * S)).toBeGreaterThan(0);
    // 1 giờ sau lúc hết khoá: quên, lần khoá kế lại là bậc đầu
    const later = 360 * S + 60 * MIN + 1;
    expect(l.lockedMs("x", later)).toBe(0);
    for (let i = 0; i < FAILS_PER_LOCK; i++) l.fail("x", later);
    expect(l.lockedMs("x", later)).toBe(60 * S);
    l.success("x");
    expect(l.lockedMs("x", later)).toBe(0);
  });

  it("có trần số tên theo dõi", () => {
    const l = new LoginLocks(20);
    for (let i = 0; i < 500; i++) l.fail(`k${i}`, i);
    expect(l.size).toBeLessThanOrEqual(20);
  });
});
