import { describe, expect, it, vi } from "vitest";
import {
  BATTERY_SAVER_STORAGE_KEY,
  DEFAULT_GOVERNOR,
  FrameGovernor,
  LEGACY_LOW_FX_KEY,
  QUALITY_STORAGE_KEY,
  TIER_BASE,
  buildProfile,
  createQuality,
  loadMode,
  pickInitialTier,
  type DeviceSignals,
  type FormFactor,
  type QualityEnv,
  type QualityProfile,
  type Tier,
} from "./quality";

const ctx = (over: Partial<Parameters<typeof buildProfile>[1]> = {}) => ({
  mode: "auto" as const,
  reducedMotion: false,
  batterySaver: false,
  form: "desktop" as FormFactor,
  ...over,
});

describe("gfx/quality: hồ sơ theo bậc", () => {
  it("mỗi bậc lấy đúng số liệu mục 6.2; bậc càng cao ngân sách càng lớn", () => {
    const low = buildProfile("low", ctx());
    const mid = buildProfile("mid", ctx());
    const high = buildProfile("high", ctx());
    expect(low).toMatchObject({
      tier: "low",
      particleBudget: 60,
      emitterBudget: 4,
      damageNumbers: 8,
      weather: "off",
      renderScaleMax: 1,
    });
    expect(mid).toMatchObject({
      tier: "mid",
      particleBudget: 220,
      emitterBudget: 10,
      damageNumbers: 16,
      weather: "light",
      renderScaleMax: 1.5,
    });
    expect(high).toMatchObject({
      tier: "high",
      particleBudget: 520,
      emitterBudget: 24,
      damageNumbers: 28,
      weather: "full",
      renderScaleMax: 2,
    });
    for (const key of [
      "particleBudget",
      "emitterBudget",
      "damageNumbers",
      "maxPixels",
      "renderScaleMax",
      "farAnimHz",
      "nameLabelRadius",
      "fogPatches",
    ] as const) {
      expect(low[key]).toBeLessThan(mid[key]);
      expect(mid[key]).toBeLessThan(high[key]);
    }
    expect(low.fog).toBe(false);
    expect(mid.fog).toBe(true);
    expect(low.vignette).toBe(false);
    expect(high.targetFps).toBe(60);
  });

  it("bloom chỉ bật ở bậc Cao VÀ máy tính (không trên điện thoại / tablet)", () => {
    expect(buildProfile("high", ctx({ form: "desktop" })).bloom).toBe(true);
    expect(buildProfile("high", ctx({ form: "phone" })).bloom).toBe(false);
    expect(buildProfile("high", ctx({ form: "tablet" })).bloom).toBe(false);
    expect(buildProfile("mid", ctx({ form: "desktop" })).bloom).toBe(false);
  });

  it("giảm chuyển động: hạt giảm 70 %, tắt rung + chớp, chuyển cảnh chỉ mờ dần; ngân sách không về 0", () => {
    const r = buildProfile("high", ctx({ reducedMotion: true }));
    expect(r.particleBudget).toBe(Math.round(TIER_BASE.high.particleBudget * 0.3));
    expect(r.emitterBudget).toBeGreaterThanOrEqual(1);
    expect(r).toMatchObject({ shake: false, flashes: false, fadeOnly: true, reducedMotion: true });
    const n = buildProfile("high", ctx());
    expect(n).toMatchObject({ shake: true, flashes: true, fadeOnly: false, reducedMotion: false });
    expect(buildProfile("low", ctx({ reducedMotion: true })).emitterBudget).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("tiết kiệm pin: 30 FPS", () => {
    expect(buildProfile("mid", ctx({ batterySaver: true })).targetFps).toBe(30);
    expect(buildProfile("mid", ctx({ batterySaver: false })).targetFps).toBe(60);
  });
});

describe("gfx/quality: chọn bậc ban đầu theo thiết bị", () => {
  const cases: Array<[string, DeviceSignals, Tier, Tier]> = [
    ["máy tính 8 lõi", { form: "desktop", cores: 8 }, "high", "high"],
    ["máy tính 2 lõi", { form: "desktop", cores: 2 }, "mid", "high"],
    ["máy tính không rõ số lõi", { form: "desktop" }, "high", "high"],
    [
      "dựng hình phần mềm (SwiftShader)",
      { form: "desktop", cores: 16, gpu: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))" },
      "low",
      "low",
    ],
    [
      "llvmpipe trên điện thoại",
      { form: "phone", cores: 8, memoryGb: 8, gpu: "llvmpipe (LLVM 15)" },
      "low",
      "low",
    ],
    ["điện thoại mạnh 8 lõi 8 GB", { form: "phone", cores: 8, memoryGb: 8 }, "mid", "high"],
    ["điện thoại tầm trung 6 lõi 4 GB", { form: "phone", cores: 6, memoryGb: 4 }, "mid", "mid"],
    ["điện thoại yếu 4 lõi 2 GB", { form: "phone", cores: 4, memoryGb: 2 }, "low", "mid"],
    ["điện thoại 8 lõi nhưng 2 GB", { form: "phone", cores: 8, memoryGb: 2 }, "low", "mid"],
    ["điện thoại 6 lõi, không rõ RAM (Safari)", { form: "phone", cores: 6 }, "mid", "mid"],
    ["điện thoại không rõ cả hai", { form: "phone" }, "low", "mid"],
    ["tablet 8 lõi 6 GB", { form: "tablet", cores: 8, memoryGb: 6 }, "mid", "high"],
  ];
  for (const [name, sig, tier, ceiling] of cases) {
    it(name, () => {
      expect(pickInitialTier(sig)).toEqual({ tier, ceiling });
    });
  }
});

function memStore(init: Record<string, string> = {}) {
  const m: Record<string, string> = { ...init };
  return { m, get: (k: string) => m[k] ?? null, set: (k: string, v: string) => void (m[k] = v) };
}

describe("gfx/quality: chế độ đã lưu + di cư tg_low_fx", () => {
  it("giá trị hợp lệ được giữ; rác thì Tự động", () => {
    for (const v of ["auto", "low", "mid", "high"] as const)
      expect(loadMode(memStore({ [QUALITY_STORAGE_KEY]: v }))).toBe(v);
    expect(loadMode(memStore({ [QUALITY_STORAGE_KEY]: "ultra" }))).toBe("auto");
    expect(loadMode(memStore())).toBe("auto");
  });
  it("tg_low_fx=1 mà chưa chọn chất lượng -> low và lưu lại; đã chọn thì không ghi đè", () => {
    const s = memStore({ [LEGACY_LOW_FX_KEY]: "1" });
    expect(loadMode(s)).toBe("low");
    expect(s.m[QUALITY_STORAGE_KEY]).toBe("low");
    const t = memStore({ [LEGACY_LOW_FX_KEY]: "1", [QUALITY_STORAGE_KEY]: "high" });
    expect(loadMode(t)).toBe("high");
    expect(loadMode(memStore({ [LEGACY_LOW_FX_KEY]: "0" }))).toBe("auto");
  });
});

/** Chạy `n` khung cùng thời gian `dt`; trả về các quyết định khác null. */
function run(g: FrameGovernor, n: number, dt: number, canDown = true, canUp = true) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = g.frame(dt, canDown, canUp);
    if (d) out.push(d);
  }
  return out;
}
const framesFor = (ms: number, dt: number) => Math.ceil(ms / dt);

describe("gfx/quality: bộ điều tốc (đồng hồ giả, thời gian = tổng thời gian khung)", () => {
  it("60 FPS đều: không đổi bậc dù chạy rất lâu (không nâng khi canUp=false)", () => {
    const g = new FrameGovernor();
    expect(run(g, framesFor(120_000, 16.7), 16.7, true, false)).toEqual([]);
  });

  it("p95 xấu hai cửa sổ liền -> HẠ một bậc (đúng sau cửa sổ thứ hai, không sớm hơn)", () => {
    const g = new FrameGovernor();
    expect(run(g, framesFor(5000, 30), 30)).toEqual([]); // cửa sổ xấu 1
    expect(run(g, framesFor(5000, 30), 30)).toEqual(["down"]); // cửa sổ xấu 2
  });

  it("một cửa sổ xấu xen cửa sổ tốt: KHÔNG hạ (chuỗi bị ngắt)", () => {
    const g = new FrameGovernor();
    run(g, framesFor(5000, 30), 30);
    run(g, framesFor(5000, 12), 12);
    expect(run(g, framesFor(5000, 30), 30)).toEqual([]);
  });

  it("dùng p95 chứ không phải trung bình: 10 % khung gấp 40 ms làm cửa sổ XẤU dù trung bình ~13 ms", () => {
    const g = new FrameGovernor();
    const window = () => {
      const out: string[] = [];
      for (let t = 0; t < 5100;) {
        for (let k = 0; k < 10; k++) {
          const dt = k === 0 ? 40 : 10;
          const d = g.frame(dt, true, true);
          if (d) out.push(d);
          t += dt;
        }
      }
      return out;
    };
    window();
    expect(window()).toEqual(["down"]);
  });

  it("trong khoảng trễ giữa hai lần đổi (20 s) không hạ tiếp; qua khoảng trễ thì hạ tiếp", () => {
    const g = new FrameGovernor();
    run(g, framesFor(10_000, 30), 30); // hạ lần 1 ở 10 s
    expect(run(g, framesFor(10_000, 30), 30)).toEqual([]); // 20 s: đủ hai cửa sổ xấu nhưng mới 10 s kể từ lần đổi
    expect(run(g, framesFor(5000, 30), 30)).toEqual([]); // 25 s: mới 15 s kể từ lần đổi
    expect(run(g, framesFor(5000, 30), 30)).toEqual(["down"]); // 30 s: đủ 20 s kể từ lần đổi
  });

  it("tối đa 3 lần hạ mỗi phiên", () => {
    const g = new FrameGovernor();
    const downs = run(g, framesFor(300_000, 30), 30).filter((d) => d === "down");
    expect(downs).toHaveLength(DEFAULT_GOVERNOR.maxDownshifts);
  });

  it("không hạ khi đã ở bậc thấp nhất (canDown=false)", () => {
    const g = new FrameGovernor();
    expect(run(g, framesFor(60_000, 30), 30, false, true)).toEqual([]);
  });

  it("p95 tốt 30 giây (6 cửa sổ) -> NÂNG một bậc; thiếu một cửa sổ thì chưa", () => {
    const g = new FrameGovernor();
    expect(run(g, framesFor(25_000, 10), 10)).toEqual([]);
    expect(run(g, framesFor(5000, 10), 10)).toEqual(["up"]);
  });

  it("không nâng khi canUp=false (đã chạm trần của thiết bị)", () => {
    const g = new FrameGovernor();
    expect(run(g, framesFor(120_000, 10), 10, true, false)).toEqual([]);
  });

  it("vừa hạ xong thì không nâng trong 60 giây dù khung rất tốt (tránh nhấp nháy bậc)", () => {
    const g = new FrameGovernor();
    run(g, framesFor(10_000, 30), 30); // hạ
    const ups: number[] = [];
    let t = 0;
    for (let i = 0; i < framesFor(120_000, 10); i++) {
      if (g.frame(10, true, true) === "up") ups.push(t);
      t += 10;
    }
    expect(ups.length).toBeGreaterThan(0);
    expect(ups[0]).toBeGreaterThanOrEqual(DEFAULT_GOVERNOR.upLockoutAfterDownMs - 100);
  });

  it("khung > 500 ms (chuyển tab / treo) và dt rác không được đo", () => {
    const g = new FrameGovernor();
    for (let i = 0; i < 100; i++) {
      expect(g.frame(5000, true, true)).toBeNull();
      expect(g.frame(0, true, true)).toBeNull();
      expect(g.frame(-3, true, true)).toBeNull();
      expect(g.frame(NaN, true, true)).toBeNull();
    }
    expect(g.snapshot().samples).toBe(0);
  });

  it("resetWindow bỏ cửa sổ đang đo và chuỗi xấu, giữ số lần hạ", () => {
    const g = new FrameGovernor();
    run(g, framesFor(10_000, 30), 30); // hạ lần 1
    expect(g.snapshot().downshifts).toBe(1);
    run(g, framesFor(5000, 30), 30);
    g.resetWindow();
    expect(g.snapshot()).toMatchObject({ samples: 0, badStreak: 0, goodStreak: 0, downshifts: 1 });
  });
});

function fakeEnv(
  init: {
    signals?: DeviceSignals;
    form?: FormFactor;
    reduced?: boolean;
    store?: Record<string, string>;
  } = {},
) {
  const store = memStore(init.store);
  const state = {
    signals: init.signals ?? ({ form: "phone", cores: 8, memoryGb: 8 } as DeviceSignals),
    form: init.form ?? ("phone" as FormFactor),
    reduced: init.reduced ?? false,
  };
  const applied: QualityProfile[] = [];
  const env: QualityEnv = {
    signals: () => state.signals,
    form: () => state.form,
    reducedMotion: () => state.reduced,
    storage: store,
    applyDom: (p) => void applied.push(p),
  };
  return { env, state, store, applied };
}

/** Bộ điều tốc nhanh cho test bộ điều khiển (cửa sổ 100 ms, đổi liên tục được). */
const FAST = {
  windowMs: 100,
  badP95Ms: 22,
  goodP95Ms: 14,
  badWindowsToDown: 2,
  goodWindowsToUp: 2,
  minChangeGapMs: 0,
  upLockoutAfterDownMs: 0,
  maxDownshifts: 99,
  ignoreAboveMs: 500,
};
const feed = (c: ReturnType<typeof createQuality>, ms: number, dt: number) => {
  for (let t = 0; t < ms; t += dt) c.frame(dt);
};

describe("gfx/quality: bộ điều khiển", () => {
  it("Tự động: khởi đầu theo thiết bị, ghi data-quality + data-reduce-motion; đã áp ngay lúc tạo", () => {
    const f = fakeEnv();
    const q = createQuality(f.env);
    expect(q.get()).toMatchObject({ tier: "mid", mode: "auto" });
    expect(q.ceiling()).toBe("high");
    expect(f.applied).toHaveLength(1);
  });

  it("Tự động: khung xấu hạ bậc và phát sự kiện; khung tốt nâng lại nhưng không quá trần thiết bị", () => {
    const f = fakeEnv({ signals: { form: "phone", cores: 6, memoryGb: 4 } }); // mid, trần mid
    const q = createQuality(f.env, FAST);
    const cb = vi.fn();
    q.onChange(cb);
    feed(q, 400, 30);
    expect(q.get().tier).toBe("low");
    expect(cb).toHaveBeenCalledTimes(1);
    feed(q, 400, 30); // đã ở thấp nhất: không hạ thêm
    expect(q.get().tier).toBe("low");
    feed(q, 2000, 10); // tốt: nâng lên mid rồi dừng vì trần
    expect(q.get().tier).toBe("mid");
    feed(q, 4000, 10);
    expect(q.get().tier).toBe("mid");
  });

  it("chọn tay: bỏ qua khung xấu, lưu lựa chọn; quay lại Tự động chọn lại từ thiết bị", () => {
    const f = fakeEnv();
    const q = createQuality(f.env, FAST);
    q.setMode("high");
    expect(q.get()).toMatchObject({ tier: "high", mode: "high" });
    expect(f.store.m[QUALITY_STORAGE_KEY]).toBe("high");
    feed(q, 1000, 40); // rất xấu nhưng đã chọn tay
    expect(q.get().tier).toBe("high");
    q.setMode("auto");
    expect(q.get()).toMatchObject({ tier: "mid", mode: "auto" }); // lại bậc ban đầu của thiết bị
    expect(f.store.m[QUALITY_STORAGE_KEY]).toBe("auto");
  });

  it("chọn tay không làm tiêu hao số lần hạ tối đa của bộ điều tốc (về Tự động vẫn hạ được)", () => {
    const f = fakeEnv();
    const q = createQuality(f.env, { ...FAST, maxDownshifts: 1 });
    q.setMode("high");
    feed(q, 3000, 40); // rất xấu lúc chọn tay: KHÔNG được coi là một lần hạ của bộ điều tốc
    q.setMode("auto");
    expect(q.get().tier).toBe("mid");
    feed(q, 400, 40);
    expect(q.get().tier).toBe("low");
  });

  it("tiết kiệm pin (30 FPS): khung ~33 ms là chủ ý, bộ điều tốc KHÔNG hạ bậc; tắt tiết kiệm pin thì chạy lại", () => {
    const f = fakeEnv();
    const q = createQuality(f.env, FAST);
    q.setBatterySaver(true);
    feed(q, 3000, 33.4);
    expect(q.get().tier).toBe("mid");
    q.setBatterySaver(false);
    feed(q, 400, 33.4);
    expect(q.get().tier).toBe("low");
  });

  it("setActive(false): khung lúc ở nền không làm hạ bậc", () => {
    const f = fakeEnv();
    const q = createQuality(f.env, FAST);
    q.setActive(false);
    feed(q, 1000, 40);
    expect(q.get().tier).toBe("mid");
    q.setActive(true);
    feed(q, 400, 40);
    expect(q.get().tier).toBe("low");
  });

  it("giảm chuyển động: refresh() cập nhật hồ sơ + phát sự kiện; tiết kiệm pin lưu và phát sự kiện", () => {
    const f = fakeEnv();
    const q = createQuality(f.env);
    const cb = vi.fn();
    q.onChange(cb);
    f.state.reduced = true;
    q.refresh();
    expect(q.get()).toMatchObject({ reducedMotion: true, shake: false });
    expect(cb).toHaveBeenCalledTimes(1);
    q.refresh(); // không đổi: không phát lại
    expect(cb).toHaveBeenCalledTimes(1);
    q.setBatterySaver(true);
    expect(q.get().targetFps).toBe(30);
    expect(f.store.m[BATTERY_SAVER_STORAGE_KEY]).toBe("1");
    expect(cb).toHaveBeenCalledTimes(2);
    q.setBatterySaver(true);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("khởi tạo đọc lại chế độ + tiết kiệm pin đã lưu và di cư tg_low_fx", () => {
    const f = fakeEnv({ store: { [LEGACY_LOW_FX_KEY]: "1", [BATTERY_SAVER_STORAGE_KEY]: "1" } });
    const q = createQuality(f.env);
    expect(q.get()).toMatchObject({ tier: "low", mode: "low", batterySaver: true, targetFps: 30 });
  });

  it("hình thức thiết bị đổi (phone -> desktop) + refresh: bloom theo form", () => {
    const f = fakeEnv({ form: "phone" });
    const q = createQuality(f.env);
    q.setMode("high");
    expect(q.get().bloom).toBe(false);
    f.state.form = "desktop";
    q.refresh();
    expect(q.get().bloom).toBe(true);
  });

  it("stats(): FPS và p95 từ các khung gần nhất (bật cả khi chọn tay)", () => {
    const f = fakeEnv();
    const q = createQuality(f.env);
    q.setMode("low");
    for (let i = 0; i < 60; i++) q.frame(20);
    const s = q.stats();
    expect(s.fps).toBeCloseTo(50, 0);
    expect(s.p95Ms).toBeCloseTo(20, 0);
  });

  it("dispose: bỏ người nghe", () => {
    const f = fakeEnv();
    const q = createQuality(f.env, FAST);
    const cb = vi.fn();
    q.onChange(cb);
    q.dispose();
    feed(q, 400, 30);
    expect(cb).not.toHaveBeenCalled();
  });
});
