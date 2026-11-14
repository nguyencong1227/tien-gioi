import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BATTERY_SAVER_STORAGE_KEY,
  browserQualityEnv,
  DEFAULT_GOVERNOR,
  FrameGovernor,
  LEGACY_LOW_FX_KEY,
  QUALITY_STORAGE_KEY,
  STRONG_GPU,
  TIER_BASE,
  TIERS,
  buildProfile,
  createQuality,
  isUltraCapable,
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
    for (const v of ["auto", "low", "mid", "high", "ultra"] as const)
      expect(loadMode(memStore({ [QUALITY_STORAGE_KEY]: v }))).toBe(v);
    for (const junk of ["extreme", "", "HIGH", "__proto__", "1"])
      expect(loadMode(memStore({ [QUALITY_STORAGE_KEY]: junk })), junk).toBe("auto");
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

  it("MÀN 60 Hz: khung 16,7 ms đều (p95 ~16,8) vẫn là 'tốt' -> sau một lần hạ + khoá 60 s, máy khoẻ được NÂNG trở lại", () => {
    // Bản đầu có goodP95Ms = 14 < chu kỳ 60 Hz nên KHÔNG BAO GIỜ nâng được trên màn 60 Hz (B đo thật); test cũ dùng khung 10 ms
    // nên không thấy.
    const g = new FrameGovernor();
    run(g, framesFor(10_000, 30), 30); // hạ
    const ups: number[] = [];
    let t = 0;
    for (let i = 0; i < framesFor(150_000, 16.7); i++) {
      if (g.frame(16.7, true, true) === "up") ups.push(t);
      t += 16.7;
    }
    expect(ups.length).toBeGreaterThan(0);
    expect(ups[0]).toBeGreaterThanOrEqual(DEFAULT_GOVERNOR.upLockoutAfterDownMs - 100);
  });

  it("vsync có rung nhẹ (16,7 +- 1 ms, p95 ~17,7) vẫn 'tốt'; p95 ~20 ms (vùng chết) không nâng cũng không hạ", () => {
    const g = new FrameGovernor();
    const jitter = (i: number) => 16.7 + (i % 5 === 0 ? 1 : 0);
    let ups = 0;
    for (let i = 0; i < framesFor(60_000, 16.7); i++)
      if (g.frame(jitter(i), true, true) === "up") ups++;
    expect(ups).toBeGreaterThan(0);
    const g2 = new FrameGovernor();
    let any = 0;
    for (let i = 0; i < framesFor(120_000, 20); i++) if (g2.frame(20, true, true)) any++;
    expect(any).toBe(0); // 20 ms: > 19 (không tốt) và < 22 (không xấu)
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

describe("gfx/quality: đọc chuỗi GPU (browserQualityEnv)", () => {
  function fakeBrowser() {
    const lose = vi.fn();
    let created = 0;
    const gl = {
      getExtension: (name: string) =>
        name === "WEBGL_debug_renderer_info"
          ? { UNMASKED_RENDERER_WEBGL: 37446 }
          : name === "WEBGL_lose_context"
            ? { loseContext: lose }
            : null,
      getParameter: () => "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))",
    };
    const doc = {
      createElement: () => {
        created++;
        return { getContext: () => gl };
      },
      documentElement: { setAttribute: () => {} },
      body: null,
    };
    const win = {
      navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
      localStorage: { getItem: () => null, setItem: () => {} },
    };
    return { lose, created: () => created, doc, win };
  }

  it("chỉ tạo MỘT ngữ cảnh WebGL cho mọi lần signals() và giải phóng nó ngay (không chạm trần ngữ cảnh của Chrome)", () => {
    const b = fakeBrowser();
    const env = browserQualityEnv(
      () => "desktop",
      () => false,
      b.win as never,
      b.doc as never,
    );
    for (let i = 0; i < 20; i++) expect(env.signals().gpu).toMatch(/SwiftShader/);
    expect(b.created()).toBe(1);
    expect(b.lose).toHaveBeenCalledTimes(1);
  });

  it("không đọc được GPU (ném lỗi) thì undefined và cũng chỉ thử MỘT lần", () => {
    const b = fakeBrowser();
    b.doc.createElement = () => {
      throw new Error("không có WebGL");
    };
    let tries = 0;
    const doc = {
      ...b.doc,
      createElement: () => {
        tries++;
        throw new Error("không có WebGL");
      },
    };
    const env = browserQualityEnv(
      () => "phone",
      () => false,
      b.win as never,
      doc as never,
    );
    expect(env.signals().gpu).toBeUndefined();
    expect(env.signals().gpu).toBeUndefined();
    expect(tries).toBe(1);
  });
});

// ---------------------------------------------------------------- Bậc "Rất cao" (M7.15, mục 10.3)

/** Máy tính mạnh: chuỗi ANGLE thật của RTX 5060 trên Chrome Linux. */
const BIG_DESKTOP: DeviceSignals = {
  form: "desktop",
  cores: 16,
  memoryGb: 8,
  gpu: "ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  mobile: false,
};

describe("gfx/quality: bậc Rất cao (ultra)", () => {
  it("số liệu: mọi trần của Rất cao >= Cao (không có trường nào tụt), nâng cả maxPixels / renderScaleMax; hdPacks CHỈ ở Rất cao", () => {
    const hi = TIER_BASE.high;
    const ul = TIER_BASE.ultra;
    expect(TIERS).toEqual(["low", "mid", "high", "ultra"]);
    for (const k of [
      "renderScaleMax",
      "maxPixels",
      "particleBudget",
      "emitterBudget",
      "damageNumbers",
      "fogPatches",
      "farAnimHz",
      "nameLabelRadius",
    ] as const)
      expect(ul[k], k).toBeGreaterThanOrEqual(hi[k]);
    expect(ul.maxPixels).toBeGreaterThan(hi.maxPixels); // không thì ảnh 2x vô dụng (canvas bị kẹp)
    expect(ul).toMatchObject({ particleBudget: 1000, emitterBudget: 40, damageNumbers: 40 });
    for (const t of TIERS) expect(buildProfile(t, ctx()).hdPacks, t).toBe(t === "ultra");
    // bloom vẫn chỉ trên máy tính (kể cả ở Rất cao)
    expect(buildProfile("ultra", ctx({ form: "tablet" })).bloom).toBe(false);
    expect(buildProfile("ultra", ctx({ form: "desktop" })).bloom).toBe(true);
  });

  it("isUltraCapable: DƯƠNG (RTX 5060, GTX 1660, Radeon RX 7800, Radeon PRO W7800, Apple M2, Arc A770 có (TM)) và ÂM (iGPU, di động, thiếu lõi / RAM, phần mềm, rỗng)", () => {
    const withGpu = (
      gpu: string | undefined,
      over: Partial<DeviceSignals> = {},
    ): DeviceSignals => ({
      ...BIG_DESKTOP,
      gpu,
      ...over,
    });
    for (const g of [
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Direct3D11)",
      "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER)",
      "ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11)",
      "ANGLE (AMD, AMD Radeon PRO W7800 Direct3D11)",
      "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
      "ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11)",
    ])
      expect(isUltraCapable(withGpu(g)), g).toBe(true);
    for (const g of [
      "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)",
      "ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11)",
      "Mali-G78",
      "Adreno (TM) 740",
      "Apple GPU",
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))",
      "",
      undefined,
    ])
      expect(isUltraCapable(withGpu(g)), String(g)).toBe(false);
    // GPU mạnh nhưng chuỗi lẫn phần mềm: phần mềm thắng
    expect(isUltraCapable(withGpu("NVIDIA llvmpipe (LLVM)"))).toBe(false);
    // thiết bị di động / hình thức khác máy tính: không bao giờ, kể cả chip Apple M (iPad Pro)
    expect(isUltraCapable({ ...BIG_DESKTOP, mobile: true })).toBe(false);
    expect(isUltraCapable({ ...BIG_DESKTOP, form: "tablet" })).toBe(false);
    expect(isUltraCapable({ ...BIG_DESKTOP, form: "phone" })).toBe(false);
    expect(
      isUltraCapable({
        ...BIG_DESKTOP,
        form: "tablet",
        gpu: "ANGLE (Apple, Apple M2)",
        mobile: true,
      }),
    ).toBe(false);
    // lõi / RAM: < 8 lõi không; RAM báo < 8 không; RAM không rõ thì được
    expect(isUltraCapable({ ...BIG_DESKTOP, cores: 7 })).toBe(false);
    expect(isUltraCapable({ ...BIG_DESKTOP, cores: undefined })).toBe(false);
    expect(isUltraCapable({ ...BIG_DESKTOP, memoryGb: 4 })).toBe(false);
    expect(isUltraCapable({ ...BIG_DESKTOP, memoryGb: undefined })).toBe(true);
    expect(STRONG_GPU.test("NVIDIA")).toBe(true);
  });

  it("pickInitialTier: máy tính mạnh khởi đầu Rất cao (trần Rất cao); máy tính thường vẫn Cao trần Cao; điện thoại mạnh trần Cao trở xuống", () => {
    expect(pickInitialTier(BIG_DESKTOP)).toEqual({ tier: "ultra", ceiling: "ultra" });
    expect(
      pickInitialTier({ ...BIG_DESKTOP, gpu: "ANGLE (Intel, Intel(R) UHD Graphics)" }),
    ).toEqual({
      tier: "high",
      ceiling: "high",
    });
    expect(pickInitialTier({ ...BIG_DESKTOP, cores: 4, gpu: "GeForce GTX 1050" })).toEqual({
      tier: "high",
      ceiling: "high",
    });
    const phone = pickInitialTier({
      form: "phone",
      cores: 16,
      memoryGb: 8,
      gpu: BIG_DESKTOP.gpu,
      mobile: true,
    });
    expect(TIERS.indexOf(phone.ceiling)).toBeLessThanOrEqual(TIERS.indexOf("high"));
    expect(TIERS.indexOf(phone.tier)).toBeLessThanOrEqual(TIERS.indexOf("mid"));
  });

  it("loadMode: `ultra` đã lưu bị BỎ (quay về Tự động và ghi đè giá trị lưu) nếu thiết bị không đủ điều kiện; giữ nếu đủ", () => {
    const s = memStore({ [QUALITY_STORAGE_KEY]: "ultra" });
    expect(loadMode(s, false)).toBe("auto");
    expect(s.m[QUALITY_STORAGE_KEY]).toBe("auto");
    expect(loadMode(memStore({ [QUALITY_STORAGE_KEY]: "ultra" }), true)).toBe("ultra");
    // các chế độ khác không bị ảnh hưởng bởi cờ
    expect(loadMode(memStore({ [QUALITY_STORAGE_KEY]: "high" }), false)).toBe("high");
  });

  it("bộ điều khiển: máy mạnh khởi đầu Rất cao + hdPacks; chọn tay Rất cao được lưu; ultraAvailable đúng", () => {
    const f = fakeEnv({ signals: BIG_DESKTOP, form: "desktop" });
    const q = createQuality(f.env);
    expect(q.ultraAvailable()).toBe(true);
    expect(q.get()).toMatchObject({ tier: "ultra", mode: "auto", hdPacks: true });
    expect(q.ceiling()).toBe("ultra");
    q.setMode("high");
    expect(q.get()).toMatchObject({ tier: "high", hdPacks: false });
    q.setMode("ultra");
    expect(q.get()).toMatchObject({ tier: "ultra", mode: "ultra", hdPacks: true });
    expect(f.store.m[QUALITY_STORAGE_KEY]).toBe("ultra");
  });

  it("điện thoại / máy yếu: KHÔNG chọn được Rất cao dù bị gọi thẳng; giá trị lưu cũ bị gỡ", () => {
    const f = fakeEnv(); // phone, 8 lõi, 8 GB, không có GPU rời
    const q = createQuality(f.env);
    expect(q.ultraAvailable()).toBe(false);
    q.setMode("ultra");
    expect(q.get().mode).toBe("auto");
    expect(f.store.m[QUALITY_STORAGE_KEY]).toBeUndefined();
    // đã từng lưu `ultra` (đổi máy / sửa tay): vào game tự về Tự động
    const g = fakeEnv({ store: { [QUALITY_STORAGE_KEY]: "ultra" } });
    const q2 = createQuality(g.env);
    expect(q2.get().mode).toBe("auto");
    expect(q2.get().tier).not.toBe("ultra");
    expect(g.store.m[QUALITY_STORAGE_KEY]).toBe("auto");
  });

  it("bộ điều tốc: hạ khỏi Rất cao thì KHÔNG nâng lại trong phiên (trần thành Cao); hạ từ Cao xuống Vừa vẫn nâng lại được tới Cao", () => {
    const f = fakeEnv({ signals: BIG_DESKTOP, form: "desktop" });
    const q = createQuality(f.env, FAST);
    expect(q.get().tier).toBe("ultra");
    feed(q, 400, 30); // khung xấu (30 ms): hạ một bậc
    expect(q.get().tier).toBe("high");
    expect(q.ceiling()).toBe("high");
    feed(q, 2000, 12); // khung tốt dài (p95 12 ms < 14 ms của FAST): đủ điều kiện nâng, nhưng trần đã thành Cao
    expect(q.get().tier).toBe("high");
    expect(q.get().hdPacks).toBe(false);
    // hạ tiếp xuống Vừa rồi nâng lại: tới Cao, không tới Rất cao
    feed(q, 400, 30);
    expect(q.get().tier).toBe("mid");
    feed(q, 3000, 12);
    expect(q.get().tier).toBe("high");
    expect(q.get().hdPacks).toBe(false);
  });

  it("máy tính thường (không đủ điều kiện): trần vẫn Cao, không bao giờ lên Rất cao dù khung rất tốt", () => {
    const f = fakeEnv({
      signals: { ...BIG_DESKTOP, gpu: "Intel(R) UHD Graphics" },
      form: "desktop",
    });
    const q = createQuality(f.env, FAST);
    expect(q.ceiling()).toBe("high");
    feed(q, 5000, 12);
    expect(q.get().tier).toBe("high");
  });
});

describe("gfx/quality: nhận diện thiết bị di động (browserQualityEnv.signals().mobile)", () => {
  const sig = (nav: Record<string, unknown>) => {
    const doc = {
      createElement: () => ({ getContext: () => null }),
      documentElement: { setAttribute: () => {} },
      body: null,
    };
    const win = {
      navigator: { hardwareConcurrency: 8, deviceMemory: 8, userAgent: "", ...nav },
      localStorage: { getItem: () => null, setItem: () => {} },
    };
    return browserQualityEnv(
      () => "desktop",
      () => false,
      win as never,
      doc as never,
    ).signals();
  };

  it("di động khi userAgentData.mobile, UA Android / iPhone / iPad / iPod, hoặc iPadOS giả Macintosh có cảm ứng nhiều điểm", () => {
    expect(sig({ userAgentData: { mobile: true } }).mobile).toBe(true);
    for (const ua of [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      "Mozilla/5.0 (iPad; CPU OS 17_0)",
      "Mozilla/5.0 (iPod touch)",
    ])
      expect(sig({ userAgent: ua }).mobile, ua).toBe(true);
    expect(
      sig({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 5 }).mobile,
    ).toBe(true);
  });

  it("không phải di động: Chrome Linux / Windows, Mac thật (không cảm ứng), userAgentData.mobile = false", () => {
    expect(sig({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/130" }).mobile).toBe(false);
    expect(sig({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }).mobile).toBe(false);
    expect(
      sig({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 0 }).mobile,
    ).toBe(false);
    expect(sig({ userAgentData: { mobile: false } }).mobile).toBe(false);
  });
});

describe("gfx/quality: khớp ngân sách perf-budget.json (M7.15)", () => {
  const budget = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../perf-budget.json"), "utf-8"),
  );

  it("mỗi bậc trong TIERS có mục ngân sách; hạt / emitter / chữ sát thương khớp TIER_BASE; bộ nhớ texture tăng dần", () => {
    let prevTex = 0;
    for (const t of TIERS) {
      const b = budget.runtime.tiers[t];
      expect(b, t).toBeDefined();
      expect(b.peakParticles, `${t} hạt`).toBe(TIER_BASE[t].particleBudget);
      expect(b.emitterBudget, `${t} emitter`).toBe(TIER_BASE[t].emitterBudget);
      expect(b.damageNumbers, `${t} chữ`).toBe(TIER_BASE[t].damageNumbers);
      expect(b.maxTextureMemoryMb, `${t} texture`).toBeGreaterThan(prevTex);
      prevTex = b.maxTextureMemoryMb;
      expect(budget.static.textureMemoryMb[t]).toBe(b.maxTextureMemoryMb);
    }
    // mục 10 / QUYET_DINH_M3 mục 21: Cao 256 MB, Rất cao 512 MB, draw call Rất cao ~300
    expect(budget.runtime.tiers.high.maxTextureMemoryMb).toBe(256);
    expect(budget.runtime.tiers.ultra).toMatchObject({ maxTextureMemoryMb: 512, drawCalls: 300 });
  });

  it("khối `packs` giữ đúng ngân sách theo gói của QUYET_DINH_M3 mục 21 (2 / 2 / 3 / 5 MB, hd <= 3 lần, chờ 8 s / 3 s)", () => {
    expect(budget.packs).toMatchObject({
      core: { maxKb: 2048 },
      map: { maxKb: 2048 },
      icons: { maxKb: 3072 },
      audio: { maxKb: 5120 },
      hdMaxFactor: 3,
      mapLoadTimeoutMs: 8000,
      dungeonLoadTimeoutMs: 3000,
    });
  });
});
