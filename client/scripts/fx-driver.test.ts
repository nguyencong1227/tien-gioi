import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  FX_DRIVER_COLORS,
  FX_DRIVER_RECIPES,
  FX_DRIVER_SOURCE,
  FX_PLANS,
  MIN_FX_PLAYED,
  parseFxDriverReport,
} from "./fx-driver.mjs";
import { getRecipe } from "../src/gfx/fx/recipes";
import { FX_COLOR } from "../src/gfx/fx/recipes-combat";

// Test HỢP ĐỒNG (bài học #390): bộ bắn hiệu ứng chạy trong TRANG, nên test chạy CHÍNH `FX_DRIVER_SOURCE` trong `node:vm` với một `window.__fx` giả
// dùng SỔ CÔNG THỨC THẬT (`getRecipe`: id lạ bị từ chối như `FxSystem.play` thật), đồng hồ và `setInterval` điều khiển được.

interface Call {
  kind: "play" | "num";
  id?: string;
  text?: string;
  x: number;
  y: number;
  opts?: any;
  at: number;
}

function makePage(over: { fx?: unknown; noScene?: boolean } = {}) {
  let nowMs = 0;
  const calls: Call[] = [];
  const live = { particles: 0, emitters: 0, floats: 0, admitted: 0, dropped: 0 };
  const intervals: Array<{ fn: () => void; cleared: boolean }> = [];
  const fx = over.fx ?? {
    play(id: string, x: number, y: number, opts?: unknown) {
      calls.push({ kind: "play", id, x, y, opts, at: nowMs });
      if (!getRecipe(id)) {
        live.dropped++;
        return false; // như FxSystem.play thật: công thức lạ -> false
      }
      live.admitted++;
      live.particles += 6;
      live.emitters += 1;
      return true;
    },
    floatNumber(text: string, x: number, y: number, o: unknown) {
      calls.push({ kind: "num", text, x, y, opts: o, at: nowMs });
      live.floats += 1;
      return true;
    },
    stats() {
      return {
        liveParticles: live.particles,
        liveEmitters: live.emitters,
        particleLimit: 60,
        admitted: live.admitted,
        dropped: live.dropped,
        floatsActive: live.floats,
        floatsDropped: 0,
        floatsCreated: live.floats,
      };
    },
  };
  const sandbox: any = {
    performance: { now: () => nowMs },
    setInterval: (fn: () => void) => intervals.push({ fn, cleared: false }),
    clearInterval: (id: number) => {
      intervals[id - 1].cleared = true;
    },
    __fx: fx,
    __scene: over.noScene
      ? undefined
      : { cameras: { main: { worldView: { centerX: 500, centerY: 400 } } } },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  const inject = (source = FX_DRIVER_SOURCE) => vm.runInContext(source, ctx);
  /** Tiến đồng hồ `ms` (bước 20 ms như TICK_MS), chạy các `setInterval` chưa huỷ; hạt / chữ sống giảm dần như thật. */
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 20) {
      nowMs += 20;
      for (const it of intervals) if (!it.cleared) it.fn();
      live.particles = Math.max(0, live.particles - 2);
      live.emitters = Math.max(0, live.emitters - 1);
      live.floats = Math.max(0, live.floats - 1);
    }
  };
  return { sandbox, calls, live, inject, advance };
}

const plays = (calls: Call[], id: string) => calls.filter((c) => c.kind === "play" && c.id === id);

describe("M5.1 #400: bộ bắn hiệu ứng thật (fx-driver) tiêm vào trang", () => {
  it("mọi id công thức nó dùng CÓ trong sổ công thức thật; không bịa tên", () => {
    for (const id of FX_DRIVER_RECIPES) expect(getRecipe(id), id).toBeDefined();
    const page = makePage();
    page.inject();
    expect(page.sandbox.__tgFxDriver.start("burst")).toEqual({ ok: true });
    page.advance(3000);
    const used = new Set(page.calls.filter((c) => c.kind === "play").map((c) => c.id));
    for (const id of used) expect(FX_DRIVER_RECIPES, `id ${id} dùng ngoài danh sách`).toContain(id);
    // và danh sách không thừa: mọi id khai báo đều được dùng ít nhất một lần trong kế hoạch dồn dập
    for (const id of FX_DRIVER_RECIPES)
      expect(used.has(id), `id ${id} khai báo mà không dùng`).toBe(true);
  });

  it("màu chữ trùng FX_COLOR thật (không trôi khỏi mã game)", () => {
    expect(FX_DRIVER_COLORS).toEqual({
      hit: FX_COLOR.hit,
      crit: FX_COLOR.crit,
      hurt: FX_COLOR.hurt,
    });
  });

  it("nhịp kế hoạch `combat`: đòn của mình ~ mỗi 200 ms, công pháp lớn mỗi 1,5 s, quái gục mỗi 3 s; ưu tiên 2 cho của mình, 1 cho người khác", () => {
    const page = makePage();
    page.inject();
    page.sandbox.__tgFxDriver.start("combat");
    page.advance(3000);
    const mine = page.calls.filter(
      (c) =>
        c.kind === "play" &&
        ["hit-spark", "hit-crit", "hit-heavy"].includes(c.id!) &&
        c.opts?.priority === 2,
    );
    const others = page.calls.filter(
      (c) => c.kind === "play" && c.id === "hit-spark" && c.opts?.priority === 1,
    );
    expect(mine.length).toBeGreaterThanOrEqual(14);
    expect(mine.length).toBeLessThanOrEqual(17);
    expect(others.length).toBeGreaterThanOrEqual(8);
    expect(others.length).toBeLessThanOrEqual(10);
    expect(plays(page.calls, "hurt-self").map((c) => c.at)).toEqual([0, 1200, 2400]);
    // công pháp: mỗi lần 3 sword-qi + 1 sword-tip + 1 slash-edge, ở 0 / 1500 / 3000 ms
    expect(plays(page.calls, "sword-qi").length).toBe(3 * plays(page.calls, "sword-tip").length);
    expect(plays(page.calls, "sword-tip").length).toBeGreaterThanOrEqual(2);
    expect(plays(page.calls, "slash-edge").length).toBe(plays(page.calls, "sword-tip").length);
    expect(plays(page.calls, "mon-vanish").length).toBeGreaterThanOrEqual(1);
    // chữ bay kèm theo (số sát thương), có cả chữ chí mạng "Bạo! N" cỡ 20 màu vàng
    const nums = page.calls.filter((c) => c.kind === "num");
    expect(nums.length).toBeGreaterThan(20);
    expect(
      nums.some(
        (c) => /^Bạo! \d+$/.test(c.text!) && c.opts.color === FX_COLOR.crit && c.opts.size === 20,
      ),
    ).toBe(true);
    expect(nums.some((c) => c.opts.color === FX_COLOR.hurt && c.opts.priority === 2)).toBe(true);
  });

  it("kế hoạch `burst` dồn dập hơn `combat` (mọi nhịp ngắn hơn)", () => {
    for (const k of ["hitMs", "otherMs", "hurtMs", "skillMs", "killMs"] as const)
      expect(FX_PLANS.burst[k], k).toBeLessThan(FX_PLANS.combat[k]);
    const a = makePage();
    a.inject();
    a.sandbox.__tgFxDriver.start("combat");
    a.advance(3000);
    const b = makePage();
    b.inject();
    b.sandbox.__tgFxDriver.start("burst");
    b.advance(3000);
    expect(b.calls.length).toBeGreaterThan(a.calls.length * 1.5);
  });

  it("vị trí quanh TÂM khung nhìn camera (không lệch ra ngoài màn hình)", () => {
    const page = makePage();
    page.inject();
    page.sandbox.__tgFxDriver.start("combat");
    page.advance(2000);
    for (const c of page.calls) {
      expect(Math.abs(c.x - 500), `x=${c.x}`).toBeLessThanOrEqual(200);
      expect(Math.abs(c.y - 400), `y=${c.y}`).toBeLessThanOrEqual(200);
    }
    // không có scene / camera: dùng toạ độ dự phòng, KHÔNG ném lỗi
    const bare = makePage({ noScene: true });
    bare.inject();
    expect(bare.sandbox.__tgFxDriver.start("combat")).toEqual({ ok: true });
    bare.advance(400);
    expect(bare.calls.length).toBeGreaterThan(0);
  });

  it("chạy lại cùng hạt giống cho CÙNG chuỗi hiệu ứng (tất định)", () => {
    const run = () => {
      const p = makePage();
      p.inject();
      p.sandbox.__tgFxDriver.start("combat");
      p.advance(2500);
      return JSON.stringify(p.calls);
    };
    expect(run()).toBe(run());
  });

  it("ĐỈNH hạt / emitter / chữ bay đọc NGAY SAU mỗi lần phát (không phải lúc dừng): lớn hơn số sống lúc stop()", () => {
    const page = makePage();
    page.inject();
    page.sandbox.__tgFxDriver.start("combat");
    page.advance(3000);
    const live = page.live;
    const report = page.sandbox.__tgFxDriver.stop();
    expect(report.peakParticles).toBeGreaterThan(live.particles);
    expect(report.peakEmitters).toBeGreaterThan(live.emitters);
    expect(report.peakFloats).toBeGreaterThan(live.floats);
    expect(report.peakParticles).toBeGreaterThanOrEqual(6);
    expect(report.particleLimit).toBe(60);
    expect(report.played).toBe(page.calls.filter((c) => c.kind === "play").length);
    expect(report.rejected).toBe(0);
    expect(report.floatsPlayed).toBe(page.calls.filter((c) => c.kind === "num").length);
    expect(report.fxAdmitted).toBe(report.played);
    // đọc bằng chính hàm của harness
    const parsed = parseFxDriverReport(JSON.stringify(report));
    expect(parsed).toMatchObject({
      fxPlan: "combat",
      fxPlayed: report.played,
      particlesPeak: report.peakParticles,
      emittersPeak: report.peakEmitters,
      floatsPeak: report.peakFloats,
    });
    expect(report.played).toBeGreaterThanOrEqual(MIN_FX_PLAYED);
  });

  it("đột biến: bịa id công thức -> `fx.play` từ chối (false) -> `rejected` tăng, không tính là đã phát", () => {
    const page = makePage();
    const broken = FX_DRIVER_SOURCE.replace(/"hit-spark"/g, '"hit-sparx"');
    expect(broken).not.toBe(FX_DRIVER_SOURCE);
    page.inject(broken);
    page.sandbox.__tgFxDriver.start("combat");
    page.advance(3000);
    const report = page.sandbox.__tgFxDriver.stop();
    expect(report.rejected).toBeGreaterThan(10);
    expect(report.played).toBeLessThan(report.played + report.rejected);
  });

  it("start: không có window.__fx / kế hoạch lạ / đang chạy -> báo lỗi rõ; stop() khi chưa start = null; start lại được sau stop()", () => {
    const noFx = makePage({ fx: undefined });
    noFx.sandbox.__fx = undefined;
    noFx.inject();
    expect(noFx.sandbox.__tgFxDriver.start("combat")).toMatchObject({
      ok: false,
      error: expect.stringContaining("__fx"),
    });
    const page = makePage();
    page.inject();
    expect(page.sandbox.__tgFxDriver.stop()).toBeNull();
    expect(page.sandbox.__tgFxDriver.start("khong-co")).toMatchObject({ ok: false });
    expect(page.sandbox.__tgFxDriver.start("combat")).toEqual({ ok: true });
    expect(page.sandbox.__tgFxDriver.start("combat")).toMatchObject({
      ok: false,
      error: "đang chạy",
    });
    page.advance(400);
    expect(page.sandbox.__tgFxDriver.stop()).not.toBeNull();
    expect(page.sandbox.__tgFxDriver.start("burst")).toEqual({ ok: true });
  });

  it("stop() huỷ vòng lặp: không bắn thêm sau khi dừng", () => {
    const page = makePage();
    page.inject();
    page.sandbox.__tgFxDriver.start("combat");
    page.advance(600);
    page.sandbox.__tgFxDriver.stop();
    const n = page.calls.length;
    page.advance(2000);
    expect(page.calls.length).toBe(n);
  });
});

describe("M5.1 #400: kịch bản của harness dùng đúng tên kế hoạch", () => {
  it('mọi `fx: "..."` trong ALL_SCENARIOS của measure-mobile-perf.mjs là kế hoạch CÓ trong FX_PLANS (gõ sai tên sẽ đỏ ngay)', () => {
    const src = fs.readFileSync(path.join(__dirname, "measure-mobile-perf.mjs"), "utf8");
    const used = [...src.matchAll(/^\s*fx:\s*"([^"]+)"/gm)].map((m) => m[1]);
    expect(used.length).toBeGreaterThanOrEqual(4); // combat x2, burst x2, dungeon
    for (const name of used) expect(Object.keys(FX_PLANS), name).toContain(name);
    // cả hai kế hoạch đều được dùng
    expect(new Set(used)).toEqual(new Set(Object.keys(FX_PLANS)));
  });
});

describe("M5.1 #400: parseFxDriverReport (hàm thuần)", () => {
  const good = {
    plan: "burst",
    durationMs: 5000,
    played: 80,
    rejected: 2,
    floatsPlayed: 90,
    floatsRejected: 1,
    peakParticles: 80,
    peakEmitters: 8,
    peakFloats: 8,
    particleLimit: 60,
    fxAdmitted: 80,
    fxDropped: 53,
  };

  it("đọc chuỗi JSON hoặc đối tượng đúng hình dạng", () => {
    const want = {
      fxPlan: "burst",
      fxPlayed: 80,
      fxRejected: 2,
      floatsPlayed: 90,
      floatsRejected: 1,
      particlesPeak: 80,
      emittersPeak: 8,
      floatsPeak: 8,
      fxAdmitted: 80,
      fxDropped: 53,
    };
    expect(parseFxDriverReport(JSON.stringify(good))).toEqual(want);
    expect(parseFxDriverReport(good)).toEqual(want);
  });

  it("thiếu / sai kiểu bất kỳ trường số nào, hoặc rác -> null (không mặc định 0)", () => {
    expect(parseFxDriverReport(null)).toBeNull();
    expect(parseFxDriverReport("không phải JSON")).toBeNull();
    expect(parseFxDriverReport("null")).toBeNull();
    expect(parseFxDriverReport(42)).toBeNull();
    for (const k of [
      "played",
      "rejected",
      "floatsPlayed",
      "floatsRejected",
      "peakParticles",
      "peakEmitters",
      "peakFloats",
      "fxAdmitted",
      "fxDropped",
    ]) {
      expect(parseFxDriverReport({ ...good, [k]: undefined }), `thiếu ${k}`).toBeNull();
      expect(parseFxDriverReport({ ...good, [k]: -1 }), `âm ${k}`).toBeNull();
      expect(parseFxDriverReport({ ...good, [k]: 1.5 }), `thập phân ${k}`).toBeNull();
      expect(parseFxDriverReport({ ...good, [k]: "3" }), `chuỗi ${k}`).toBeNull();
    }
    expect(parseFxDriverReport({ ...good, plan: undefined })).toBeNull();
  });
});
