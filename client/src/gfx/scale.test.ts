import { describe, expect, it, vi } from "vitest";
import {
  FPS_LIMIT_FOR_30,
  MIN_RENDER_SCALE,
  VIEW_MAX_H,
  VIEW_MAX_W,
  attachScale,
  canvasSizeFor,
  computeRenderScale,
  fitZoom,
  fpsLimitFor,
  setFpsLimit,
  toCssPoint,
  type GameLike,
  type ScaleDeps,
} from "./scale";

const LOW = { renderScaleMax: 1, maxPixels: 1_000_000 };
const MID = { renderScaleMax: 1.5, maxPixels: 2_200_000 };
const HIGH = { renderScaleMax: 2, maxPixels: 4_200_000 };

describe("gfx/scale: fitZoom (luật cũ theo đơn vị CSS)", () => {
  it("các khung nhìn tiêu biểu", () => {
    expect(fitZoom(390, 844)).toBeCloseTo(844 / 1100, 6); // phone dọc: kéo lên theo chiều dọc
    expect(fitZoom(844, 390)).toBe(0.75); // 844/1900 = 0,44 < 0,75: sàn 0,75
    expect(fitZoom(1280, 720)).toBeCloseTo(1.125, 6); // cạnh ngắn 720 / 640
    expect(fitZoom(1920, 1080)).toBe(1.3); // kẹp trên 1,3
    expect(fitZoom(3840, 2160)).toBeCloseTo(3840 / 1900, 6); // 4K: sàn zoom theo vùng nhìn của server
  });

  it("BẤT BIẾN: vùng nhìn trong thế giới không vượt 1900 x 1100 (VIEW_ENTER = 1100) ở mọi kích thước và mọi hệ số nhân", () => {
    for (let w = 200; w <= 5000; w += 137) {
      for (let h = 200; h <= 3000; h += 113) {
        const z = fitZoom(w, h);
        expect(z).toBeGreaterThanOrEqual(0.75);
        expect(w / z).toBeLessThanOrEqual(VIEW_MAX_W + 1e-6);
        expect(h / z).toBeLessThanOrEqual(VIEW_MAX_H + 1e-6);
        for (const rs of [0.5, 1, 1.5, 2]) {
          // camera.zoom = fitZoom * rs trên canvas (w*rs) x (h*rs): vùng nhìn = canvas / camera.zoom = css / fitZoom
          expect((w * rs) / (z * rs)).toBeLessThanOrEqual(VIEW_MAX_W + 1e-6);
          expect((h * rs) / (z * rs)).toBeLessThanOrEqual(VIEW_MAX_H + 1e-6);
        }
      }
    }
  });
});

describe("gfx/scale: computeRenderScale", () => {
  it("clamp(dpr, 1, trần): DPR 1/2/3 theo bậc", () => {
    expect(computeRenderScale(390, 844, 1, HIGH)).toBe(1);
    expect(computeRenderScale(390, 844, 2, MID)).toBe(1.5);
    expect(computeRenderScale(390, 844, 3, MID)).toBe(1.5);
    expect(computeRenderScale(390, 844, 2, HIGH)).toBe(2);
    expect(computeRenderScale(390, 844, 3, HIGH)).toBe(2);
    expect(computeRenderScale(390, 844, 2, LOW)).toBe(1);
  });

  it("vượt maxPixels thì hạ (có thể < 1), tổng điểm ảnh luôn <= maxPixels khi còn trên sàn 0,5", () => {
    const rs = computeRenderScale(1920, 1080, 1, LOW); // 2,07 M điểm ảnh ở 1,0 > 1,0 M
    expect(rs).toBeLessThan(1);
    expect(rs).toBeGreaterThanOrEqual(MIN_RENDER_SCALE);
    expect(1920 * 1080 * rs * rs).toBeLessThanOrEqual(LOW.maxPixels);
    expect(computeRenderScale(1920, 1080, 2, MID)).toBeLessThan(1.5); // 4,1 M ở 1,5... > 2,2 M
    for (const prof of [LOW, MID, HIGH]) {
      for (const [w, h] of [
        [390, 844],
        [844, 390],
        [1280, 720],
        [1920, 1080],
        [2560, 1440],
      ]) {
        for (const dpr of [1, 1.5, 2, 3]) {
          const r = computeRenderScale(w, h, dpr, prof);
          if (r > MIN_RENDER_SCALE) expect(w * h * r * r).toBeLessThanOrEqual(prof.maxPixels + 1);
          expect(r).toBeGreaterThanOrEqual(MIN_RENDER_SCALE);
          expect(r).toBeLessThanOrEqual(prof.renderScaleMax);
        }
      }
    }
  });

  it("sàn 0,5 cho màn hình khổng lồ; làm tròn XUỐNG bội 0,05", () => {
    expect(computeRenderScale(7680, 4320, 1, LOW)).toBe(MIN_RENDER_SCALE);
    const r = computeRenderScale(1920, 1080, 1, LOW); // sqrt(1e6/2073600) = 0,694
    expect(r).toBe(0.65);
    expect(Math.round(r * 20)).toBe(r * 20);
  });

  it("dpr rác / dưới 1 thì coi là 1", () => {
    expect(computeRenderScale(390, 844, NaN, HIGH)).toBe(1);
    expect(computeRenderScale(390, 844, 0.75, HIGH)).toBe(1);
    expect(computeRenderScale(390, 844, Infinity, HIGH)).toBe(1);
  });
});

describe("gfx/scale: kích thước canvas, toạ độ con trỏ, giới hạn FPS", () => {
  it("canvasSizeFor làm tròn, tối thiểu 1", () => {
    expect(canvasSizeFor(390, 844, 2)).toEqual({ width: 780, height: 1688 });
    expect(canvasSizeFor(390, 844, 1.25)).toEqual({ width: 488, height: 1055 });
    expect(canvasSizeFor(0, 0, 0.5)).toEqual({ width: 1, height: 1 });
  });

  it("toCssPoint: điểm ảnh canvas -> CSS px (chia displayScale); displayScale lạ thì giữ nguyên", () => {
    expect(toCssPoint(780, 1688, { x: 2, y: 2 })).toEqual({ x: 390, y: 844 });
    expect(toCssPoint(100, 50, { x: 1.5, y: 1.5 })).toEqual({ x: 100 / 1.5, y: 50 / 1.5 });
    expect(toCssPoint(100, 50, { x: 0, y: NaN })).toEqual({ x: 100, y: 50 });
  });

  it("fpsLimitFor: 30 -> 31 (ngưỡng 30 ra ~21 FPS ở 60 Hz: đo thật), 60 -> không giới hạn", () => {
    expect(fpsLimitFor(30)).toBe(FPS_LIMIT_FOR_30);
    expect(FPS_LIMIT_FOR_30).toBe(31);
    expect(fpsLimitFor(60)).toBe(0);
  });
});

function fakeGame(over: Partial<GameLike["loop"]> = {}) {
  const calls: string[] = [];
  const game = {
    scale: {
      width: 390,
      height: 844,
      resize(w: number, h: number) {
        calls.push(`resize ${w}x${h}`);
        this.width = w;
        this.height = h;
      },
      setZoom(z: number) {
        calls.push(`zoom ${z}`);
      },
    },
    canvas: { style: { width: "", height: "" } },
    loop: {
      hasFpsLimit: false,
      fpsLimit: 0,
      _limitRate: 0,
      stop: () => void calls.push("loop.stop"),
      start: (cb: unknown) => void calls.push(`loop.start ${typeof cb}`),
      ...over,
    },
    step() {},
  };
  return { game: game as unknown as GameLike & typeof game, calls };
}

describe("gfx/scale: setFpsLimit (đổi lúc chạy)", () => {
  it("bật 31: dừng -> đặt trường -> chạy lại với step đã bind; bỏ giới hạn: ngược lại", () => {
    const { game, calls } = fakeGame();
    expect(setFpsLimit(game, 31)).toBe(true);
    expect(calls).toEqual(["loop.stop", "loop.start function"]);
    expect(game.loop).toMatchObject({ hasFpsLimit: true, fpsLimit: 31 });
    expect(game.loop._limitRate).toBeCloseTo(1000 / 31, 6);
    calls.length = 0;
    expect(setFpsLimit(game, 0)).toBe(true);
    expect(calls).toEqual(["loop.stop", "loop.start function"]);
    expect(game.loop).toMatchObject({ hasFpsLimit: false, fpsLimit: 0, _limitRate: 0 });
  });

  it("đã đúng giá trị thì KHÔNG dừng / chạy lại vòng lặp", () => {
    const { game, calls } = fakeGame({ hasFpsLimit: true, fpsLimit: 31, _limitRate: 1000 / 31 });
    expect(setFpsLimit(game, 31)).toBe(true);
    const f = fakeGame();
    expect(setFpsLimit(f.game, 0)).toBe(true);
    expect(calls).toEqual([]);
    expect(f.calls).toEqual([]);
  });

  it("phiên bản Phaser thiếu trường nội bộ: trả false, không đụng vòng lặp", () => {
    const { game, calls } = fakeGame();
    delete (game.loop as Partial<GameLike["loop"]>)._limitRate;
    expect(setFpsLimit(game, 31)).toBe(false);
    expect(calls).toEqual([]);
    const g2 = fakeGame();
    (g2.game.loop as unknown as { stop?: unknown }).stop = undefined;
    expect(setFpsLimit(g2.game, 31)).toBe(false);
  });
});

function fakeDeps(init = { cssW: 390, cssH: 844, dpr: 2, profile: MID, fps: 60 as 30 | 60 }) {
  const st = { ...init };
  const order: string[] = [];
  const dispL: Array<() => void> = [];
  const qualL: Array<() => void> = [];
  const deps: ScaleDeps = {
    getDisplay: () => ({ cssW: st.cssW, cssH: st.cssH, dpr: st.dpr }),
    onDisplayChange: (cb) => {
      dispL.push(cb);
      return () => void dispL.splice(dispL.indexOf(cb), 1);
    },
    getQuality: () => ({ ...st.profile, targetFps: st.fps }),
    onQualityChange: (cb) => {
      qualL.push(cb);
      return () => void qualL.splice(qualL.indexOf(cb), 1);
    },
    setRenderScale: (rs) => void order.push(`rs ${rs}`),
  };
  const queue: Array<() => void> = [];
  const schedule = (fn: () => void) => void queue.push(fn);
  return { st, deps, order, dispL, qualL, queue, schedule };
}

describe("gfx/scale: attachScale", () => {
  it("áp dụng ngay: setRenderScale TRƯỚC resize, zoom = 1/rs, kích thước hiển thị = khung nhìn logic", () => {
    const { game, calls } = fakeGame();
    const t = fakeDeps(); // dpr 2, trần 1,5 => rs 1,5 => canvas 585 x 1266
    attachScale(game, t.deps, t.schedule);
    expect(t.order).toEqual(["rs 1.5"]);
    expect(game.scale.width).toBe(585);
    expect(game.scale.height).toBe(1266);
    expect(calls).toEqual(["resize 585x1266", `zoom ${1 / 1.5}`]);
    expect(game.canvas.style).toMatchObject({ width: "390px", height: "844px" });
  });

  it("kích thước không đổi thì KHÔNG resize lại (chỉ setZoom)", () => {
    const { game, calls } = fakeGame();
    const t = fakeDeps();
    const a = attachScale(game, t.deps, t.schedule);
    calls.length = 0;
    a.apply();
    expect(calls).toEqual([`zoom ${1 / 1.5}`]);
  });

  it("nhiều thay đổi dồn dập chỉ áp MỘT lần (hoãn tới cuối tác vụ)", () => {
    const { game } = fakeGame();
    const t = fakeDeps();
    attachScale(game, t.deps, t.schedule);
    t.st.cssW = 844;
    t.st.cssH = 390;
    for (const cb of t.dispL) cb();
    for (const cb of t.dispL) cb();
    for (const cb of t.qualL) cb();
    expect(t.queue).toHaveLength(1);
    t.queue.shift()!();
    expect(game.scale.width).toBe(Math.round(844 * 1.5));
    expect(game.scale.height).toBe(Math.round(390 * 1.5));
    expect(game.canvas.style.width).toBe("844px");
  });

  it("đổi hồ sơ chất lượng (Cao -> Thấp) đổi hệ số nhân: canvas nhỏ lại, vẫn đúng khung nhìn logic", () => {
    const { game } = fakeGame();
    const t = fakeDeps({ cssW: 390, cssH: 844, dpr: 3, profile: HIGH, fps: 60 });
    attachScale(game, t.deps, t.schedule);
    expect(game.scale.width).toBe(780); // rs 2
    t.st.profile = LOW;
    for (const cb of t.qualL) cb();
    t.queue.shift()!();
    expect(game.scale.width).toBe(390); // rs 1
    expect(game.canvas.style.width).toBe("390px");
  });

  it("tiết kiệm pin (targetFps 30) đặt giới hạn 31 lúc chạy; về 60 thì bỏ", () => {
    const { game } = fakeGame();
    const t = fakeDeps();
    attachScale(game, t.deps, t.schedule);
    expect(game.loop.hasFpsLimit).toBe(false);
    t.st.fps = 30;
    for (const cb of t.qualL) cb();
    t.queue.shift()!();
    expect(game.loop).toMatchObject({ hasFpsLimit: true, fpsLimit: 31 });
    t.st.fps = 60;
    for (const cb of t.qualL) cb();
    t.queue.shift()!();
    expect(game.loop.hasFpsLimit).toBe(false);
  });

  it("stop(): bỏ đăng ký, việc đã xếp hàng không còn áp", () => {
    const { game, calls } = fakeGame();
    const t = fakeDeps();
    const a = attachScale(game, t.deps, t.schedule);
    t.st.cssW = 800;
    for (const cb of t.dispL) cb();
    a.stop();
    calls.length = 0;
    t.queue.shift()!();
    expect(calls).toEqual([]);
    expect(t.dispL).toHaveLength(0);
    expect(t.qualL).toHaveLength(0);
  });

  it("vi.fn: setRenderScale được gọi đúng giá trị cuối", () => {
    const { game } = fakeGame();
    const t = fakeDeps();
    const spy = vi.spyOn(t.deps, "setRenderScale");
    attachScale(game, t.deps, t.schedule);
    expect(spy).toHaveBeenLastCalledWith(1.5);
  });
});
