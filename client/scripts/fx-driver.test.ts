import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  FX_CAST_SKILLS,
  FX_DRIVER_COLORS,
  FX_DRIVER_RECIPES,
  FX_DRIVER_SOURCE,
  FX_PLANS,
  MIN_CASTS_EMITTED,
  MIN_CAST_CALLS,
  MIN_CAST_PLAYED,
  MIN_FX_PLAYED,
  parseFxDriverReport,
} from "./fx-driver.mjs";
import { SKILL_BY_ID } from "@tien-gioi/shared";
import { getRecipe } from "../src/gfx/fx/recipes";
import { castRecipeId } from "../src/gfx/fx/recipes-cast";
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

function makePage(
  over: { fx?: unknown; noScene?: boolean; noRoom?: boolean; deadCast?: boolean } = {},
) {
  let nowMs = 0;
  const calls: Call[] = [];
  /** Tin `fx` đã gửi qua `window.__scene.room.emit` (chiêu của kế hoạch `*-cast`). */
  const emitted: Array<{ type: string; msg: any }> = [];
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
      : {
          cameras: { main: { worldView: { centerX: 500, centerY: 400 } } },
          sid: "me",
          // giống `WorldScene.onFx` (case "cast"): của mình ưu tiên 2, của người khác ưu tiên 1, công thức `cast-<fx>` của chiêu; `deadCast` = đường onFx hỏng (nhận tin, không phát gì)
          room: over.noRoom
            ? undefined
            : {
                emit(type: string, msg: any) {
                  emitted.push({ type, msg });
                  if (over.deadCast || type !== "fx" || msg?.kind !== "cast") return;
                  const def = SKILL_BY_ID[msg.skill];
                  if (!def) return;
                  (sandbox.__fx as any).play(castRecipeId(def.fx), msg.x, msg.y, {
                    priority: msg.by === "me" ? 2 : 1,
                    angle: msg.angle,
                  });
                },
              },
        },
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
  return { sandbox, calls, emitted, live, inject, advance };
}

const plays = (calls: Call[], id: string) => calls.filter((c) => c.kind === "play" && c.id === id);

describe("M5.1 #400: bộ bắn hiệu ứng thật (fx-driver) tiêm vào trang", () => {
  it("mọi id công thức nó dùng CÓ trong sổ công thức thật; không bịa tên", () => {
    for (const id of FX_DRIVER_RECIPES) expect(getRecipe(id), id).toBeDefined();
    // Hợp của hai kế hoạch dồn dập: `burst` (quái thường) và `boss` (trùm: boss-hit / boss-vanish)
    const used = new Set<string | undefined>();
    for (const plan of ["burst", "boss"]) {
      const page = makePage();
      page.inject();
      expect(page.sandbox.__tgFxDriver.start(plan)).toEqual({ ok: true });
      page.advance(3000);
      for (const c of page.calls) if (c.kind === "play") used.add(c.id);
    }
    for (const id of used) expect(FX_DRIVER_RECIPES, `id ${id} dùng ngoài danh sách`).toContain(id);
    // và danh sách không thừa: mọi id khai báo đều được dùng ít nhất một lần trong các kế hoạch dồn dập
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

describe("M6 #409: kế hoạch `boss` (đòn thường -> boss-hit, trùm gục -> boss-vanish)", () => {
  const BOSS_IDS = ["boss-hit", "boss-vanish"];
  const run = (plan: string, ms = 3000) => {
    const page = makePage();
    page.inject();
    expect(page.sandbox.__tgFxDriver.start(plan)).toEqual({ ok: true });
    page.advance(ms);
    return page;
  };

  it("`boss`: đòn thường của mình (ưu tiên 2) và của người khác (ưu tiên 1) là boss-hit, KHÔNG còn hit-spark; trùm gục là boss-vanish ưu tiên 2, KHÔNG còn mon-vanish", () => {
    const { calls } = run("boss");
    expect(plays(calls, "hit-spark")).toHaveLength(0);
    expect(plays(calls, "mon-vanish")).toHaveLength(0);
    const mine = plays(calls, "boss-hit").filter((c) => c.opts?.priority === 2);
    const others = plays(calls, "boss-hit").filter((c) => c.opts?.priority === 1);
    expect(mine.length).toBeGreaterThanOrEqual(15);
    expect(others.length).toBeGreaterThanOrEqual(15);
    const dead = plays(calls, "boss-vanish");
    expect(dead.length).toBeGreaterThanOrEqual(2);
    expect(dead.every((c) => c.opts?.priority === 2)).toBe(true);
  });

  it("`boss`: đòn nặng / chí mạng vẫn là hit-heavy / hit-crit (đúng như game: đòn mạnh lên trùm không đổi công thức), chữ 'Bạo!' chỉ đi cùng hai loại đó", () => {
    const { calls } = run("boss", 6000);
    const crits = plays(calls, "hit-heavy").length + plays(calls, "hit-crit").length;
    expect(crits).toBeGreaterThan(3);
    const bang = calls.filter((c) => c.kind === "num" && /^Bạo! /.test(c.text!));
    // mỗi đòn của mình kèm đúng một chữ; chữ "Bạo!" (+ chữ công pháp lớn) không thể ít hơn số đòn nặng / chí mạng
    expect(bang.length).toBeGreaterThanOrEqual(crits);
  });

  it("`combat` và `burst` KHÔNG đổi: không bao giờ bắn công thức trùm (đo cũ giữ nguyên)", () => {
    for (const plan of ["combat", "burst"]) {
      const { calls } = run(plan);
      for (const id of BOSS_IDS) expect(plays(calls, id), `${plan} / ${id}`).toHaveLength(0);
      expect(plays(calls, "hit-spark").length).toBeGreaterThan(0);
      expect(plays(calls, "mon-vanish").length).toBeGreaterThan(0);
    }
  });

  it("`boss` có nhịp của `burst` (ca xấu nhất) và cờ `boss`; chỉ kế hoạch `boss` có cờ", () => {
    for (const k of ["hitMs", "otherMs", "hurtMs", "skillMs", "killMs"] as const)
      expect(FX_PLANS.boss[k], k).toBe(FX_PLANS.burst[k]);
    expect(FX_PLANS.boss.boss).toBe(true);
    expect((FX_PLANS.combat as Record<string, unknown>).boss).toBeUndefined();
    expect((FX_PLANS.burst as Record<string, unknown>).boss).toBeUndefined();
  });

  it("cả hai công thức trùm có trong sổ thật và chi phí khai báo nằm trong trần mỗi công thức (<= 20 hạt)", () => {
    for (const id of BOSS_IDS) {
      const r = getRecipe(id);
      expect(r, id).toBeDefined();
      expect(r!.particles!.count, id).toBeLessThanOrEqual(20);
    }
  });

  it("ĐỘT BIẾN: nếu bộ bắn `boss` quay về công thức quái thường thì test đỏ (bắt hồi quy ở chính đoạn tiêm)", () => {
    const broken = FX_DRIVER_SOURCE.replace(/"boss-hit"/g, '"hit-spark"');
    expect(broken).not.toBe(FX_DRIVER_SOURCE);
    const page = makePage();
    page.inject(broken);
    page.sandbox.__tgFxDriver.start("boss");
    page.advance(3000);
    expect(plays(page.calls, "boss-hit")).toHaveLength(0); // thấy ngay: không còn boss-hit nào
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

describe("#515: kế hoạch `burst-cast` / `boss-cast` (hiệu ứng dùng chiêu của 61 chiêu qua đường onFx thật)", () => {
  const CAST_PLANS = ["burst-cast", "boss-cast"] as const;

  it("FX_CAST_SKILLS TRÙNG đúng các chiêu trong `SKILLS` của shared (thêm / bớt chiêu mà quên ở đây thì đỏ), không trùng id", () => {
    expect([...FX_CAST_SKILLS].sort()).toEqual(Object.keys(SKILL_BY_ID).sort());
    expect(new Set(FX_CAST_SKILLS).size).toBe(FX_CAST_SKILLS.length);
    expect(FX_CAST_SKILLS).toHaveLength(64);
    // sáu chiêu Nguyên Anh đợt 2 (#722) nằm trong danh sách
    for (const id of [
      "han_quang_tien",
      "bach_kim_trao",
      "van_thach_tran",
      "bang_hoa_loan",
      "liet_hoa_kiem",
      "van_hanh_bo",
    ])
      expect(FX_CAST_SKILLS, id).toContain(id);
    // bảy chiêu hệ Mộc / Thủy (CT7 #1052) nằm trong danh sách
    for (const id of [
      "hu_thuy_chuong",
      "trien_xa_thu",
      "hac_sa_doc_chuong",
      "thi_doc_am_chuong",
      "thiem_to_cong",
      "doan_truong_chi_phap",
      "kho_moc_phung_xuan_quyet",
    ])
      expect(FX_CAST_SKILLS, id).toContain(id);
    // bốn chiêu Kim / Thổ (CT17 lát 1, G) nằm trong danh sách
    for (const id of [
      "kim_thoa_xuyen_tam",
      "thuc_giap_phi_tan",
      "thiet_sa_chuong",
      "chuong_vu_phong_lam",
    ])
      expect(FX_CAST_SKILLS, id).toContain(id);
    // hai chiêu Lôi (CT15 đợt 2, #1185, D) nằm trong danh sách
    for (const id of ["loi_hoa_pha_ta_chuong", "chan_hon_loi_phap"])
      expect(FX_CAST_SKILLS, id).toContain(id);
  });

  it("hai kế hoạch cast giữ NHỊP của `burst` / `boss` (ca xấu nhất) và thêm `castMs` 300; kế hoạch cũ KHÔNG có `castMs` (đo cũ giữ nguyên)", () => {
    const base = (p: any) => ({ ...p, castMs: undefined });
    expect(base(FX_PLANS["burst-cast"])).toEqual({ ...FX_PLANS.burst, castMs: undefined });
    expect(base(FX_PLANS["boss-cast"])).toEqual({ ...FX_PLANS.boss, castMs: undefined });
    for (const p of CAST_PLANS) expect((FX_PLANS as any)[p].castMs).toBe(300);
    for (const p of ["combat", "burst", "boss"])
      expect((FX_PLANS as any)[p].castMs, p).toBeUndefined();
  });

  it("start: kế hoạch cast cần window.__scene.room.emit (không có -> báo lỗi rõ); kế hoạch thường vẫn chạy khi không có phòng", () => {
    for (const noRoom of [true, false]) {
      const page = makePage({ noRoom });
      page.inject();
      const r = page.sandbox.__tgFxDriver.start("boss-cast");
      if (noRoom)
        expect(r).toMatchObject({ ok: false, error: expect.stringContaining("room.emit") });
      else expect(r).toEqual({ ok: true });
    }
    const page = makePage({ noScene: true });
    page.inject();
    expect(page.sandbox.__tgFxDriver.start("boss-cast")).toMatchObject({ ok: false });
    expect(page.sandbox.__tgFxDriver.start("combat")).toMatchObject({ ok: true });
  });

  it("cứ 300 ms gửi MỘT tin `fx {kind: cast}` qua room.emit, chiêu xoay vòng đúng thứ tự FX_CAST_SKILLS, quanh tâm khung nhìn, hai trong ba lần là của mình", () => {
    for (const plan of CAST_PLANS) {
      const page = makePage();
      page.inject();
      page.sandbox.__tgFxDriver.start(plan);
      page.advance(6000);
      const casts = page.emitted.filter((e) => e.type === "fx" && e.msg.kind === "cast");
      expect(casts.length, plan).toBeGreaterThanOrEqual(19);
      expect(casts.length, plan).toBeLessThanOrEqual(21);
      casts.forEach((e, k) => {
        expect(e.msg.skill).toBe(FX_CAST_SKILLS[k % FX_CAST_SKILLS.length]);
        expect(e.msg.by).toBe(k % 3 === 2 ? "perf-bot" : "me");
        expect([e.msg.x, e.msg.y]).toEqual([500, 400]);
        expect(e.msg.range).toBe(150);
        expect(Number.isFinite(e.msg.angle)).toBe(true);
      });
      // 18 lần đầu là 18 chiêu KHÁC NHAU (xoay vòng danh sách; kế hoạch chỉ bắn ~20 lần nên không phủ hết danh sách dài hơn)
      expect(new Set(casts.slice(0, 18).map((e) => e.msg.skill)).size).toBe(18);
    }
  });

  it("chiêu tới `FxSystem.play` bằng công thức `cast-<fx>` của chính chiêu đó (đường onFx), ưu tiên 2 của mình / 1 của đồng đội", () => {
    const page = makePage();
    page.inject();
    page.sandbox.__tgFxDriver.start("burst-cast");
    page.advance(6000);
    const castPlays = page.calls.filter((c) => c.kind === "play" && c.id!.startsWith("cast-"));
    expect(castPlays.length).toBeGreaterThanOrEqual(19);
    const casts = page.emitted.map((e) => e.msg);
    castPlays.forEach((c, k) => {
      expect(c.id).toBe(castRecipeId(SKILL_BY_ID[casts[k].skill].fx));
      expect(c.opts.priority).toBe(casts[k].by === "me" ? 2 : 1);
    });
  });

  it("chạy lại cùng hạt giống cho CÙNG chuỗi tin cast và hiệu ứng (tất định)", () => {
    const run = () => {
      const p = makePage();
      p.inject();
      p.sandbox.__tgFxDriver.start("boss-cast");
      p.advance(4000);
      return JSON.stringify([p.calls, p.emitted]);
    };
    expect(run()).toBe(run());
  });

  it("báo cáo stop() có số tin cast đã gửi và số lần game phát / từ chối công thức cast-*; parse đọc đúng, kế hoạch không cast thì không có ba trường đó", () => {
    const page = makePage();
    page.inject();
    page.sandbox.__tgFxDriver.start("boss-cast");
    page.advance(5000);
    const report = page.sandbox.__tgFxDriver.stop();
    const castPlays = page.calls.filter((c) => c.kind === "play" && c.id!.startsWith("cast-"));
    expect(report.casts).toBe(page.emitted.length);
    expect(report.castPlayed).toBe(castPlays.length);
    expect(report.castRejected).toBe(0);
    expect(report.casts).toBeGreaterThanOrEqual(MIN_CASTS_EMITTED);
    expect(report.castPlayed).toBeGreaterThanOrEqual(MIN_CAST_PLAYED);
    expect(report.castPlayed + report.castRejected).toBeGreaterThanOrEqual(MIN_CAST_CALLS);
    expect(parseFxDriverReport(JSON.stringify(report))).toMatchObject({
      fxPlan: "boss-cast",
      castsEmitted: report.casts,
      castPlayed: report.castPlayed,
      castRejected: 0,
    });
    // kế hoạch không cast: báo cáo KHÔNG có ba trường cast (hình dạng cũ giữ nguyên, không mặc định 0)
    const p2 = makePage();
    p2.inject();
    p2.sandbox.__tgFxDriver.start("boss");
    p2.advance(1500);
    const old = parseFxDriverReport(JSON.stringify(p2.sandbox.__tgFxDriver.stop()))!;
    expect(old.fxPlan).toBe("boss");
    for (const k of ["castsEmitted", "castPlayed", "castRejected"])
      expect(old).not.toHaveProperty(k);
    // có trường cast thì phải là số đếm
    expect(parseFxDriverReport({ ...report, castPlayed: "x" })).toBeNull();
    expect(parseFxDriverReport({ ...report, casts: -1 })).toBeNull();
  });

  it("ĐỘT BIẾN: đường onFx hỏng (phòng nhận tin nhưng không phát hiệu ứng) -> castPlayed = 0 dù tin vẫn gửi (để gate đỏ, không xanh giả)", () => {
    const page = makePage({ deadCast: true });
    page.inject();
    page.sandbox.__tgFxDriver.start("burst-cast");
    page.advance(5000);
    const report = page.sandbox.__tgFxDriver.stop();
    expect(report.casts).toBeGreaterThanOrEqual(MIN_CASTS_EMITTED);
    expect(report.castPlayed).toBe(0);
  });

  it("bộ đếm bọc `fx.play` chỉ đếm công thức cast-* (không đếm hiệu ứng của chính bộ bắn) và stop() trả `fx.play` về nguyên bản", () => {
    const page = makePage();
    const fx = page.sandbox.__fx;
    const original = fx.play;
    page.inject();
    page.sandbox.__tgFxDriver.start("burst-cast");
    expect(fx.play).not.toBe(original);
    page.advance(2000);
    const report = page.sandbox.__tgFxDriver.stop();
    expect(fx.play).toBe(original);
    expect(report.played).toBeGreaterThan(report.castPlayed); // hiệu ứng của chính bộ bắn nhiều hơn và KHÔNG tính vào castPlayed
    // kế hoạch thường không bọc
    const p2 = makePage();
    const orig2 = p2.sandbox.__fx.play;
    p2.inject();
    p2.sandbox.__tgFxDriver.start("burst");
    expect(p2.sandbox.__fx.play).toBe(orig2);
  });

  it("stop() huỷ vòng lặp cast: không gửi thêm tin sau khi dừng", () => {
    const page = makePage();
    page.inject();
    page.sandbox.__tgFxDriver.start("boss-cast");
    page.advance(1000);
    page.sandbox.__tgFxDriver.stop();
    const n = page.emitted.length;
    page.advance(2000);
    expect(page.emitted.length).toBe(n);
  });

  it("harness có kịch bản cast ở bậc Thấp (burst và trùm: trần chặt nhất) và bậc Cao (trùm), CPU 4x, dùng đúng hai kế hoạch cast", () => {
    const src = fs.readFileSync(path.join(__dirname, "measure-mobile-perf.mjs"), "utf8");
    for (const id of ["burst-cast-low-4x", "boss-cast-low-4x", "boss-cast-high-4x"])
      expect(src, id).toContain(`id: "${id}"`);
    const used = new Set([...src.matchAll(/^\s*fx:\s*"([^"]+)"/gm)].map((m) => m[1]));
    for (const p of CAST_PLANS) expect(used, p).toContain(p);
  });
});
