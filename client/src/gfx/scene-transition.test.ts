import { describe, expect, it, vi } from "vitest";
import { FADE_MS, IRIS_MS, transitionMs, waitOrSkip, type WaitDeps } from "./scene-transition";

describe("gfx/scene-transition: thời lượng", () => {
  it("mống mắt 400 ms (trong khoảng 300-500 ms của #329); giảm chuyển động chỉ mờ 300 ms, ngắn hơn", () => {
    expect(IRIS_MS).toBeGreaterThanOrEqual(300);
    expect(IRIS_MS).toBeLessThanOrEqual(500);
    expect(FADE_MS).toBeGreaterThanOrEqual(300);
    expect(FADE_MS).toBeLessThanOrEqual(IRIS_MS);
    expect(transitionMs(false)).toBe(IRIS_MS);
    expect(transitionMs(true)).toBe(FADE_MS);
  });

  it("CSS dùng đúng cùng số (0,4 s mống mắt, 0,3 s mờ)", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
    expect(css).toMatch(/transition:\s*--iris-r\s+0\.4s/);
    expect(IRIS_MS).toBe(400);
    expect(css).toMatch(/\.transition-overlay[^{]*\{[^}]*transition:\s*opacity\s+0\.3s/);
    expect(FADE_MS).toBe(300);
  });
});

/** Đồng hồ giả: kiểm tất định, không chờ thật. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const deps: WaitDeps = {
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h) => void timers.delete(h as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...timers]) {
      if (t.at <= now) {
        timers.delete(id);
        t.fn();
      }
    }
  };
  return { deps, advance, pending: () => timers.size };
}

describe("gfx/scene-transition: waitOrSkip (bỏ qua được)", () => {
  it("không ai bỏ qua: xong sau đúng ms với false, và huỷ đăng ký bộ lắng nghe", async () => {
    const c = fakeClock();
    const unsub = vi.fn();
    const p = waitOrSkip(400, () => unsub, c.deps);
    c.advance(399);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    c.advance(1);
    await expect(p).resolves.toBe(false);
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it("bấm / gõ phím giữa chừng: xong NGAY với true, huỷ hẹn giờ và bộ lắng nghe", async () => {
    const c = fakeClock();
    let skip: () => void = () => {};
    const unsub = vi.fn();
    const p = waitOrSkip(
      400,
      (onSkip) => {
        skip = onSkip;
        return unsub;
      },
      c.deps,
    );
    c.advance(100);
    skip();
    await expect(p).resolves.toBe(true);
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(0); // hẹn giờ đã bị huỷ, không rò
  });

  it("bỏ qua hai lần / bỏ qua sau khi hết giờ: không đổi kết quả, không gọi huỷ hai lần", async () => {
    const c = fakeClock();
    let skip: () => void = () => {};
    const unsub = vi.fn();
    const p = waitOrSkip(
      400,
      (onSkip) => {
        skip = onSkip;
        return unsub;
      },
      c.deps,
    );
    c.advance(400);
    await expect(p).resolves.toBe(false);
    skip();
    skip();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it("bỏ qua gọi đồng bộ ngay trong subscribeSkip: true và vẫn huỷ đăng ký", async () => {
    const c = fakeClock();
    const unsub = vi.fn();
    const p = waitOrSkip(
      400,
      (onSkip) => {
        onSkip();
        return unsub;
      },
      c.deps,
    );
    await expect(p).resolves.toBe(true);
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(0);
  });

  it("ms <= 0 / NaN: xong ngay với false, không đăng ký gì", async () => {
    const c = fakeClock();
    const sub = vi.fn(() => () => {});
    for (const ms of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(waitOrSkip(ms, sub, c.deps)).resolves.toBe(false);
    }
    expect(sub).not.toHaveBeenCalled();
  });
});
