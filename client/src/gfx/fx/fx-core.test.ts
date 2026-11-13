import { describe, expect, it } from "vitest";
import { AMBIENT_SHARE, FxBudget, OWN_OVERSHOOT, type FxCost } from "./budget";
import { FLOAT_MS, FLOAT_MS_REDUCED, FloatSet, type FloatHooks, type FloatSpec } from "./float-set";
import { FX_CHARS, glyphUvs, layoutGlyphGrid, missingGlyphs } from "./glyphs";
import {
  FX_FRAMES,
  getRecipe,
  recipeCost,
  recipeIds,
  registerRecipe,
  validateRecipe,
  type FxParticles,
  type FxRecipe,
} from "./recipes";

const cost = (particles: number, ms = 500, emitters = 1): FxCost => ({ particles, emitters, ms });

describe("gfx/fx: FxBudget (ngân sách theo thời gian)", () => {
  function make(limits = { particles: 100, emitters: 10 }) {
    let t = 0;
    const lim = { ...limits };
    const b = new FxBudget(
      () => lim,
      () => t,
    );
    return { b, lim, at: (ms: number) => void (t = ms) };
  }

  it("ưu tiên 1: nhận tới trần hạt rồi bỏ; hạt hết thời gian sống thì ngân sách được trả lại", () => {
    const { b, at } = make();
    expect(b.tryAcquire(cost(60, 500), 1)).toBe(true);
    expect(b.tryAcquire(cost(40, 500), 1)).toBe(true);
    expect(b.live()).toEqual({ particles: 100, emitters: 2 });
    expect(b.tryAcquire(cost(1, 500), 1)).toBe(false); // đầy
    at(499);
    expect(b.tryAcquire(cost(1, 500), 1)).toBe(false); // chưa hết hạn
    at(500);
    expect(b.live()).toEqual({ particles: 0, emitters: 0 });
    expect(b.tryAcquire(cost(100, 500), 1)).toBe(true);
  });

  it("trần emitter độc lập với trần hạt", () => {
    const { b } = make({ particles: 1000, emitters: 3 });
    for (let i = 0; i < 3; i++) expect(b.tryAcquire(cost(1), 1)).toBe(true);
    expect(b.tryAcquire(cost(1), 1)).toBe(false);
  });

  it("ưu tiên 0 (môi trường) chỉ dùng tới 60 % trần, chừa chỗ cho chiến đấu", () => {
    const { b } = make();
    expect(b.tryAcquire(cost(AMBIENT_SHARE * 100, 1000), 0)).toBe(true); // 60 hạt
    expect(b.tryAcquire(cost(1, 1000), 0)).toBe(false); // môi trường bị chặn ở 60
    expect(b.tryAcquire(cost(40, 1000), 1)).toBe(true); // chiến đấu vẫn dùng được phần còn lại tới trần
  });

  it("ưu tiên 2 (của mình) KHÔNG bị bỏ khi mới chạm trần, chỉ bị bỏ khi vượt GẤP ĐÔI", () => {
    const { b } = make();
    expect(b.tryAcquire(cost(100, 1000), 1)).toBe(true); // đầy trần
    expect(b.tryAcquire(cost(1, 1000), 1)).toBe(false); // người khác bị bỏ
    expect(b.tryAcquire(cost(50, 1000), 2)).toBe(true); // của mình vẫn được (150 <= 200)
    expect(b.tryAcquire(cost(50, 1000), 2)).toBe(true); // 200 <= 200
    expect(b.tryAcquire(cost(1, 1000), 2)).toBe(false); // vượt gấp đôi (OWN_OVERSHOOT)
    expect(OWN_OVERSHOOT).toBe(2);
  });

  it("đổi hồ sơ (trần nhỏ lại) áp dụng ngay cho lần xin sau; không có số âm", () => {
    const { b, lim } = make();
    expect(b.tryAcquire(cost(80, 1000), 1)).toBe(true);
    lim.particles = 60; // hạ bậc
    expect(b.tryAcquire(cost(1, 1000), 1)).toBe(false);
    expect(b.tryAcquire(cost(-5, 10), 1)).toBe(false); // vẫn đang vượt; chi phí âm bị kẹp về 0 nhưng 80 > 60
  });

  it("thống kê: nhận / bỏ theo ưu tiên, đỉnh; clear() quên hết", () => {
    const { b } = make();
    b.tryAcquire(cost(100, 1000), 1);
    b.tryAcquire(cost(1, 1000), 1);
    b.tryAcquire(cost(70, 1000), 0);
    expect(b.stats().admitted).toBe(1);
    expect(b.stats().dropped).toEqual([1, 1, 0]);
    expect(b.stats().peakParticles).toBe(100);
    b.clear();
    expect(b.live()).toEqual({ particles: 0, emitters: 0 });
  });

  it("không rò: phát rất nhiều hiệu ứng ngắn rồi để hết hạn thì về 0 (mảng cố định không tràn)", () => {
    const { b, at } = make({ particles: 1_000_000, emitters: 1_000_000 });
    for (let i = 0; i < 5000; i++) {
      at(i);
      b.tryAcquire(cost(3, 50), 1);
    }
    at(10_000);
    expect(b.live()).toEqual({ particles: 0, emitters: 0 });
    expect(b.stats().admitted).toBeGreaterThan(1000);
  });
});

describe("gfx/fx: FloatSet (chữ bay)", () => {
  function make(max = 3) {
    const log = {
      created: 0,
      shown: [] as string[],
      hidden: 0,
      destroyed: 0,
      placed: [] as Array<[number, number]>,
    };
    let cap = max;
    const hooks: FloatHooks<{ id: number }> = {
      create: () => ({ id: ++log.created }),
      show: (_i, s: FloatSpec) => void log.shown.push(s.text),
      place: (_i, y, a) => void log.placed.push([y, a]),
      hide: () => void log.hidden++,
      destroy: () => void log.destroyed++,
    };
    const set = new FloatSet(hooks, () => cap);
    const spec = (text: string, priority: 0 | 1 | 2 = 1): FloatSpec => ({
      text,
      x: 10,
      y: 100,
      color: 0xffffff,
      size: 15,
      priority,
    });
    return { set, log, spec, setCap: (c: number) => void (cap = c) };
  }

  it("tạo tối đa `max` đối tượng cho cả phiên; hết giờ trả về pool và được tái dùng (không tạo thêm)", () => {
    const { set, log, spec } = make(3);
    for (let round = 0; round < 50; round++) {
      const t0 = round * 1000;
      for (let i = 0; i < 3; i++) expect(set.spawn(spec(String(i)), t0)).toBe(true);
      set.step(t0 + FLOAT_MS + 1, false);
      expect(set.activeCount).toBe(0);
    }
    expect(log.created).toBe(3);
    expect(set.createdCount).toBe(3);
  });

  it("đầy: ưu tiên thường BỊ BỎ; ưu tiên 2 (của mình) THAY chữ cũ nhất / ưu tiên thấp nhất", () => {
    const { set, log, spec } = make(2);
    expect(set.spawn(spec("a", 0), 0)).toBe(true);
    expect(set.spawn(spec("b", 1), 100)).toBe(true);
    expect(set.spawn(spec("c", 1), 200)).toBe(false);
    expect(set.dropped).toBe(1);
    expect(set.spawn(spec("mine", 2), 300)).toBe(true); // thay "a" (ưu tiên 0)
    expect(set.recycled).toBe(1);
    expect(log.created).toBe(2); // không tạo thêm
    expect(log.shown.at(-1)).toBe("mine");
    expect(set.activeCount).toBe(2);
  });

  it("trần = 0 thì bỏ hết; trần giảm giữa chừng thì chữ mới bị bỏ tới khi bớt", () => {
    const z = make(0);
    expect(z.set.spawn(z.spec("x", 2), 0)).toBe(false);
    const { set, spec, setCap } = make(3);
    for (let i = 0; i < 3; i++) set.spawn(spec("n"), 0);
    setCap(1);
    expect(set.spawn(spec("m"), 10)).toBe(false);
    set.step(FLOAT_MS + 1, false);
    expect(set.spawn(spec("m"), FLOAT_MS + 2)).toBe(true);
  });

  it("chuyển động: bay lên + mờ dần (Cubic.easeOut); giảm chuyển động ngắn hơn và trôi nhẹ 8 px", () => {
    const a = make(1);
    a.set.spawn(a.spec("n"), 0);
    a.set.step(FLOAT_MS / 2, false);
    const [y, al] = a.log.placed.at(-1)!;
    expect(y).toBeLessThan(100);
    expect(y).toBeGreaterThan(100 - 36);
    expect(al).toBeGreaterThan(0);
    expect(al).toBeLessThan(1);

    const r = make(1);
    r.set.spawn(r.spec("n"), 0);
    r.set.step(FLOAT_MS_REDUCED / 2, true);
    const [yr, ar] = r.log.placed.at(-1)!;
    expect(yr).toBeCloseTo(100 - 4, 6);
    expect(ar).toBeCloseTo(0.5, 6);
    r.set.step(FLOAT_MS_REDUCED + 1, true);
    expect(r.set.activeCount).toBe(0); // 300 ms đã hết (không đợi 800 ms)
  });

  it("clear(): ẩn và trả tất cả về pool", () => {
    const { set, log, spec } = make(3);
    for (let i = 0; i < 3; i++) set.spawn(spec("n"), 0);
    set.clear();
    expect(set.activeCount).toBe(0);
    expect(log.hidden).toBe(3);
    set.spawn(spec("n"), 10);
    expect(log.created).toBe(3);
  });
});

describe("gfx/fx: FloatSet.dispose", () => {
  it("giải phóng cả chữ đang bay lẫn trong pool; sau đó spawn không tạo gì thêm", () => {
    const destroyed: number[] = [];
    let n = 0;
    const set = new FloatSet<{ id: number }>(
      {
        create: () => ({ id: ++n }),
        show: () => {},
        place: () => {},
        hide: () => {},
        destroy: (i) => void destroyed.push(i.id),
      },
      () => 4,
    );
    const spec: FloatSpec = { text: "1", x: 0, y: 0, color: 0xffffff, size: 15, priority: 1 };
    for (let i = 0; i < 4; i++) set.spawn(spec, 0);
    set.step(FLOAT_MS + 1, false); // cả 4 về pool
    set.spawn(spec, 2000); // 1 đang bay, 3 trong pool
    set.dispose();
    expect(destroyed.sort()).toEqual([1, 2, 3, 4]);
    expect(set.activeCount).toBe(0);
    expect(set.spawn(spec, 3000)).toBe(false);
    expect(n).toBe(4);
  });

  it("hook destroy tuỳ chọn: thiếu thì dispose vẫn chạy", () => {
    const set = new FloatSet<number>(
      { create: () => 1, show: () => {}, place: () => {}, hide: () => {} },
      () => 2,
    );
    set.spawn({ text: "1", x: 0, y: 0, color: 0, size: 1, priority: 1 }, 0);
    expect(() => set.dispose()).not.toThrow();
  });
});

describe("gfx/fx: glyph của phông bit-map", () => {
  it("in được nhãn hiện tại ('Bạo! 123') và đủ số, dấu, chữ cái tiếng Việt có dấu", () => {
    expect(missingGlyphs("Bạo! 123")).toEqual([]);
    expect(missingGlyphs("+45 -12 x2 10% 3.5")).toEqual([]);
    expect(missingGlyphs("Chí mạng Miễn Hụt Đột phá ƯỚC")).toEqual([]);
  });

  it("ký tự thiếu được báo ra (emoji, chữ Hán), khoảng trắng thì không", () => {
    expect(missingGlyphs("12 34")).toEqual([]);
    expect(missingGlyphs("A😀B落")).toEqual(["😀", "落"]);
  });

  it("FX_CHARS không trùng ký tự và không quá lớn (bộ nhớ texture trong ngân sách)", () => {
    const list = Array.from(FX_CHARS);
    expect(new Set(list).size).toBe(list.length);
    expect(list.length).toBeLessThan(260);
  });

  it("layoutGlyphGrid: lưới tất định, ô không chồng nhau, vừa trong kích thước", () => {
    const g = layoutGlyphGrid("abcdefg", 40, 48, 3);
    expect(g).toMatchObject({ cols: 3, rows: 3, width: 120, height: 144 });
    expect(g.cells.map((c) => [c.ch, c.x, c.y])).toEqual([
      ["a", 0, 0],
      ["b", 40, 0],
      ["c", 80, 0],
      ["d", 0, 48],
      ["e", 40, 48],
      ["f", 80, 48],
      ["g", 0, 96],
    ]);
    const full = layoutGlyphGrid(FX_CHARS, 40, 48, 12);
    const keys = new Set(full.cells.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(full.cells.length);
    expect(full.width * full.height * 4).toBeLessThan(2 * 1024 * 1024); // < 2 MB texture
  });
});

describe("gfx/fx: công thức", () => {
  const ok: FxRecipe = {
    id: "test-ok",
    priority: 1,
    particles: {
      frames: ["dot"],
      count: 5,
      lifespan: { min: 100, max: 200 },
      speed: { min: 0, max: 10 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
    },
  };

  it("công thức khung của lõi hợp lệ và có chi phí khai báo", () => {
    for (const id of ["hit-spark", "ambient-glimmer"]) {
      const r = getRecipe(id)!;
      expect(r).toBeDefined();
      validateRecipe(r);
      const c = recipeCost(r);
      expect(c.emitters).toBe(1);
      expect(c.particles).toBe(r.particles!.count);
      expect(c.ms).toBe(r.particles!.lifespan.max);
    }
    expect(getRecipe("ambient-glimmer")!.priority).toBe(0);
    expect(recipeIds()).toContain("hit-spark");
  });

  it("recipeCost: giảm số hạt theo tỉ lệ (giảm chuyển động), tối thiểu 1", () => {
    const r = getRecipe("hit-spark")!;
    expect(recipeCost(r, 0.3).particles).toBe(Math.round(8 * 0.3));
    expect(recipeCost(r, 0.01).particles).toBe(1);
  });

  it("validateRecipe từ chối dữ liệu hỏng", () => {
    validateRecipe(ok);
    type Patch = Partial<Omit<FxRecipe, "particles">> & { particles?: Partial<FxParticles> };
    const bad = (r: Patch) => () =>
      validateRecipe({
        ...ok,
        ...r,
        particles: r.particles ? { ...ok.particles!, ...r.particles } : ok.particles,
      } as FxRecipe);
    expect(bad({ id: "Sai Id" })).toThrow(/id/);
    expect(bad({ particles: { count: 0 } })).toThrow(/count/);
    expect(bad({ particles: { count: 500 } })).toThrow(/count/);
    expect(bad({ particles: { count: 1.5 } })).toThrow(/count/);
    expect(bad({ particles: { frames: [] } })).toThrow(/frames/);
    expect(bad({ particles: { frames: ["khong-co" as never] } })).toThrow(/frame/);
    expect(bad({ particles: { lifespan: { min: 0, max: 100 } } })).toThrow(/lifespan/);
    expect(bad({ particles: { lifespan: { min: 100, max: 9000 } } })).toThrow(/lifespan/);
    expect(() => validateRecipe({ id: "rong", priority: 1 })).toThrow(/rỗng/);
  });

  it("registerRecipe: trùng id bị từ chối; FX_FRAMES khớp kiểu khung", () => {
    registerRecipe({ ...ok, id: "test-register" });
    expect(() => registerRecipe({ ...ok, id: "test-register" })).toThrow(/trùng/);
    expect(FX_FRAMES).toEqual(["dot", "spark", "ring", "smoke", "petal", "ember"]);
  });
});

describe("gfx/fx: vùng phát (zone) cho thời tiết", () => {
  const base: FxParticles = {
    frames: ["dot"],
    count: 4,
    lifespan: { min: 100, max: 200 },
    speed: { min: 0, max: 10 },
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
  };
  const rec = (zone?: { w: number; h: number }): FxRecipe => ({
    id: "zone-test",
    priority: 0,
    particles: { ...base, zone },
  });

  it("chấp nhận vùng hợp lệ và thiếu vùng; từ chối vùng không dương / quá lớn / rác", () => {
    expect(() => validateRecipe(rec())).not.toThrow();
    expect(() => validateRecipe(rec({ w: 1200, h: 700 }))).not.toThrow();
    expect(() => validateRecipe(rec({ w: 4000, h: 4000 }))).not.toThrow();
    for (const bad of [
      { w: 0, h: 10 },
      { w: 10, h: -1 },
      { w: 4001, h: 10 },
      { w: Number.NaN, h: 10 },
      { w: 10, h: Infinity },
    ])
      expect(() => validateRecipe(rec(bad)), JSON.stringify(bad)).toThrow(/zone/);
  });

  it("makeZoneSource: điểm ngẫu nhiên nằm trong hình chữ nhật căn giữa và đổi kích thước được", async () => {
    const { makeZoneSource } = await import("./zone");
    const z = makeZoneSource(200, 100);
    const p = { x: 0, y: 0 };
    let minX = Infinity,
      maxX = -Infinity;
    for (let i = 0; i < 2000; i++) {
      z.getRandomPoint(p);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(100);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(50);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    }
    expect(minX).toBeLessThan(-80);
    expect(maxX).toBeGreaterThan(80); // phủ cả bề rộng, không dồn vào một chỗ
    z.w = 20;
    z.h = 10;
    for (let i = 0; i < 200; i++) {
      z.getRandomPoint(p);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(5);
    }
  });
});

describe("gfx/fx: glyphUvs (UV bắt buộc cho BitmapText WebGL)", () => {
  it("chia toạ độ điểm ảnh cho kích thước texture; mọi glyph của lưới thật nằm trong [0,1]", () => {
    expect(glyphUvs({ x: 48, y: 56, width: 24, height: 56 }, 576, 1008)).toEqual({
      u0: 48 / 576,
      v0: 56 / 1008,
      u1: 72 / 576,
      v1: 112 / 1008,
    });
    const grid = layoutGlyphGrid(FX_CHARS, 48, 56, 12);
    for (const c of grid.cells) {
      const uv = glyphUvs({ x: c.x, y: c.y, width: 48, height: 56 }, grid.width, grid.height);
      for (const v of [uv.u0, uv.v0, uv.u1, uv.v1]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(uv.u1).toBeGreaterThan(uv.u0);
      expect(uv.v1).toBeGreaterThan(uv.v0);
    }
  });
});
