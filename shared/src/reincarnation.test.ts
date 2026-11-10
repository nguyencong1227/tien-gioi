import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORIGIN,
  DUYEN_BOSS_CAP,
  DUYEN_CAP,
  DUYEN_MINUTES_PER_PT,
  DUYEN_TIME_CAP,
  HISTORY_MAX,
  MIN_LIFE_MINUTES_FOR_KIEP,
  ORIGINS,
  ORIGIN_BUY_PREFIX,
  UNLOCKS,
  UNLOCK_BY_ID,
  buyUnlock,
  calcDuyen,
  coinCarryCap,
  countsAsKiep,
  duyenPerStep,
  expMultOf,
  keepSlotsOf,
  levelOf,
  newSoul,
  nextCost,
  originMult,
  sanitizeSoul,
  soulView,
  startPackOf,
  unlockOf,
  validateRebirth,
  type LifeStats,
  type Soul,
} from "./reincarnation";
import { ITEM_BY_ID } from "./items";
import { REALMS, stepOf, statsFor, expToNext } from "./realms";

const min = (m: number) => m * 60_000;
/** Bậc (realm, tier) ứng với `step` trên thang tuyến tính */
function atStep(step: number): { realm: number; tier: number } {
  for (let r = 0; r < REALMS.length; r++)
    for (let t = 0; t < REALMS[r].tiers.length; t++)
      if (stepOf(r, t) === step) return { realm: r, tier: t };
  throw new Error(`không có bậc ${step}`);
}
const life = (step: number, minutes: number, bossKills = 0, exp = 0): LifeStats => ({
  ...atStep(step),
  exp,
  playMs: min(minutes),
  bossKills,
});

/** Mốc thời gian đạt từng bậc (phút), từ bảng docs/CAN_BANG.md (săn hiệu quả một mình) */
const REACH: Record<number, number> = {
  1: 9,
  2: 14,
  3: 19,
  4: 24,
  5: 29,
  6: 35,
  7: 40,
  8: 44,
  9: 48,
  10: 53,
  11: 86,
  12: 122,
};

describe("calcDuyen: bảng ước tính của docs/THIET_KE_LUAN_HOI.md mục 5", () => {
  it.each([
    [1, 1, 7],
    [5, 11, 17],
    [9, 21, 27],
    [10, 23, 29],
    [11, 39, 45],
    [12, 55, 61],
  ])("chết ngay khi vừa đạt bậc %i: %i Duyên (hạ 2 trùm: %i)", (step, duyen, withBoss) => {
    expect(calcDuyen(life(step, REACH[step]))).toBe(duyen);
    expect(calcDuyen(life(step, REACH[step], 2))).toBe(withBoss);
  });

  it("hết Trúc Cơ, thanh tu vi đầy, 175 phút: 69 Duyên (hạ 3 trùm: 78)", () => {
    const l = { ...atStep(12), exp: expToNext(2, 2), playMs: min(175), bossKills: 0 };
    expect(calcDuyen(l)).toBe(69);
    expect(calcDuyen({ ...l, bossKills: 3 })).toBe(78);
  });

  it("điểm mỗi bậc: Phàm Nhân 0, Luyện Khí 2, Trúc Cơ 12, mỗi cảnh giới sau gấp 5; id lạ là 0", () => {
    expect([0, 1, 2, 3, 4].map(duyenPerStep)).toEqual([0, 2, 12, 60, 300]);
    for (const bad of [-1, 1.5, Number.NaN, Infinity, "2" as unknown as number])
      expect(duyenPerStep(bad)).toBe(0);
  });

  it("thời gian và trùm có trần: ở lâu / hạ nhiều trùm cũng không vượt trần", () => {
    const base = calcDuyen(life(9, 48));
    expect(calcDuyen(life(9, 48 + 10_000))).toBe(
      base - Math.floor(48 / DUYEN_MINUTES_PER_PT) + DUYEN_TIME_CAP,
    );
    expect(calcDuyen(life(9, 48, 1000))).toBe(base + DUYEN_BOSS_CAP);
  });

  it("tiến bộ luôn có lợi: thêm bậc, thêm tu vi trong bậc, thêm thời gian, thêm trùm không bao giờ làm Duyên giảm", () => {
    let prev = -1;
    for (let s = 1; s <= stepOf(3, 2); s++) {
      const d = calcDuyen(life(s, 200));
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    const a = life(7, 60);
    let last = calcDuyen(a);
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const d = calcDuyen({ ...a, exp: expToNext(a.realm, a.tier) * f });
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
    expect(calcDuyen(life(7, 90))).toBeGreaterThanOrEqual(calcDuyen(life(7, 60)));
    expect(calcDuyen(life(7, 60, 3))).toBeGreaterThanOrEqual(calcDuyen(life(7, 60)));
  });

  it("chết sớm gần như không có Duyên: dưới 2 phút hoặc còn Phàm Nhân là 0 và không tính là một kiếp", () => {
    expect(MIN_LIFE_MINUTES_FOR_KIEP).toBe(2);
    expect(calcDuyen(life(9, 1.9))).toBe(0);
    expect(countsAsKiep(life(9, 1.9))).toBe(false);
    expect(calcDuyen({ realm: 0, tier: 0, exp: 39, playMs: min(300), bossKills: 5 })).toBe(0);
    expect(countsAsKiep({ realm: 0, tier: 0, exp: 0, playMs: min(300), bossKills: 0 })).toBe(false);
    expect(countsAsKiep(life(1, 2))).toBe(true);
  });

  it("Duyên mỗi giờ tương đương nhau giữa các cách chơi (bậc 5..12 trong khoảng 20..30, chênh dưới 1.3 lần)", () => {
    const rates: number[] = [];
    for (let s = 5; s <= 12; s++) rates.push(calcDuyen(life(s, REACH[s])) / (REACH[s] / 60));
    for (const r of rates) {
      expect(r).toBeGreaterThan(20);
      expect(r).toBeLessThan(30);
    }
    expect(Math.max(...rates) / Math.min(...rates)).toBeLessThan(1.3);
  });

  it("không có tiền vào cảnh giới: vừa vào Trúc Cơ (chưa bỏ công sức bậc nào) chỉ hơn hết Luyện Khí đúng phần thời gian", () => {
    // bậc 10 = Trúc Cơ sơ kỳ. Điểm bậc = 9 bậc Luyện Khí (18), không cộng thêm 12 của bậc Trúc Cơ chưa vượt qua
    const tcStart = life(10, 53);
    const lkFull = { ...atStep(9), exp: expToNext(1, 8), playMs: min(53), bossKills: 0 };
    expect(calcDuyen(tcStart)).toBe(calcDuyen(lkFull));
  });

  it("đầu vào rác không bao giờ cho NaN, âm hay vô cùng", () => {
    const junk: unknown[] = [
      null,
      undefined,
      "x",
      5,
      [],
      {},
      { realm: "a" },
      { realm: -5, tier: -1 },
      { realm: 99, tier: 99 },
      { realm: Infinity, tier: NaN, exp: -Infinity, playMs: NaN, bossKills: -3 },
      { realm: 3, tier: 1, exp: 1e300, playMs: 1e300, bossKills: 1e300 },
    ];
    for (const j of junk) {
      const d = calcDuyen(j as LifeStats);
      expect(Number.isInteger(d) && d >= 0 && Number.isFinite(d), JSON.stringify(j)).toBe(true);
    }
  });
});

describe("Tam Sinh Thạch: bảng mở khóa", () => {
  it("id duy nhất, giá tăng dần, mỗi nấc có mô tả, tổng chi phí cỡ 1700 Duyên", () => {
    expect(new Set(UNLOCKS.map((u) => u.id)).size).toBe(UNLOCKS.length);
    for (const u of UNLOCKS) {
      expect(u.effects).toHaveLength(u.costs.length);
      for (let i = 1; i < u.costs.length; i++) expect(u.costs[i]).toBeGreaterThan(u.costs[i - 1]);
    }
    const total =
      UNLOCKS.reduce((a, u) => a + u.costs.reduce((x, y) => x + y, 0), 0) +
      ORIGINS.reduce((a, o) => a + o.cost, 0);
    expect(total).toBeGreaterThan(1600);
    expect(total).toBeLessThan(1800);
  });

  it("Dư âm tu hành: 10 nấc, mỗi nấc +10%, tối đa đúng +100%, tổng 1079 Duyên", () => {
    const du = UNLOCK_BY_ID.du_am;
    expect(du.costs).toHaveLength(10);
    expect(du.costs.reduce((a, b) => a + b, 0)).toBe(1079);
    expect(expMultOf({})).toBe(1);
    expect(expMultOf({ du_am: 3 })).toBeCloseTo(1.3, 10);
    expect(expMultOf({ du_am: 10 })).toBeCloseTo(2, 10);
    expect(expMultOf({ du_am: 999 })).toBeCloseTo(2, 10); // kẹp: không vượt +100%
    expect(expMultOf({ du_am: -5 })).toBe(1);
    expect(expMultOf(undefined)).toBe(1);
  });

  it("hiệu lực các mục khác: Linh thạch mang theo, quà đầu thai, ô giữ đồ; giá trị rác coi như chưa mở", () => {
    expect([0, 1, 2, 3, 4].map((n) => coinCarryCap({ kim_nang: n }))).toEqual([
      0, 20, 60, 150, 400,
    ]);
    expect(coinCarryCap({ kim_nang: 99 })).toBe(400);
    expect(startPackOf({})).toEqual([]);
    expect(startPackOf({ le_ma: 2 })).toEqual([
      { itemId: "hoi_huyet_dan", qty: 6 },
      { itemId: "hoi_linh_dan", qty: 6 },
    ]);
    for (const n of [1, 2, 3])
      for (const it of startPackOf({ le_ma: n }))
        expect(ITEM_BY_ID[it.itemId]?.effect?.kind).not.toBe("exp"); // không có Tụ Khí Đan
    expect([0, 1, 2, 3, 9].map((n) => keepSlotsOf({ ky_vat: n }))).toEqual([0, 1, 2, 3, 3]);
    for (const bad of [Number.NaN, "3", null, Infinity, 2.9]) {
      const lv = levelOf({ ky_vat: bad as number }, "ky_vat");
      expect(Number.isInteger(lv) && lv >= 0 && lv <= 3).toBe(true);
    }
    expect(levelOf({ constructor: 3 } as never, "constructor")).toBe(0);
  });

  it("unlockOf / levelOf an toàn với id lạ (constructor, __proto__...)", () => {
    for (const bad of ["constructor", "__proto__", "toString", "", null, 5, {}])
      expect(unlockOf(bad)).toBeUndefined();
    expect(unlockOf("du_am")).toBe(UNLOCK_BY_ID.du_am);
  });

  it("xuất thân: Phàm gia không thưởng, ba xuất thân mở một lần với hệ số nhỏ; statsFor nhân vào chỉ số gốc, bỏ trống thì không đổi", () => {
    expect(ORIGINS[0].id).toBe(DEFAULT_ORIGIN);
    expect(originMult(DEFAULT_ORIGIN)).toEqual({});
    for (const bad of ["constructor", "", null, 3]) expect(originMult(bad)).toEqual({});
    const base = statsFor(2, 1);
    expect(statsFor(2, 1, undefined, undefined)).toEqual(base);
    expect(statsFor(2, 1, {}, {})).toEqual(base);
    const kk = statsFor(2, 1, undefined, originMult("kiem_khach"));
    expect(kk.atk).toBeGreaterThan(base.atk);
    expect([kk.maxHp, kk.maxMp]).toEqual([base.maxHp, base.maxMp]);
    expect(statsFor(2, 1, undefined, originMult("the_tu")).maxHp).toBeGreaterThan(base.maxHp);
    expect(statsFor(2, 1, undefined, originMult("linh_tu")).maxMp).toBeGreaterThan(base.maxMp);
    for (const o of ORIGINS)
      for (const v of Object.values(o.mult)) expect(v).toBeGreaterThanOrEqual(1);
  });
});

describe("mua mở khóa (thuần, trừ Duyên và tăng nấc cùng lúc)", () => {
  const rich = (duyen: number, extra: Partial<Soul> = {}): Soul => ({
    ...newSoul("x", "t"),
    duyen,
    ...extra,
  });

  it("mua nấc kế tiếp: đúng giá, không sửa đối số, mua liên tiếp tới nấc tối đa rồi 'max'", () => {
    const s0 = rich(100_000);
    let s = s0;
    for (let n = 1; n <= 10; n++) {
      const cost = UNLOCK_BY_ID.du_am.costs[n - 1];
      expect(nextCost(s, "du_am")).toBe(cost);
      const r = buyUnlock(s, "du_am");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.cost).toBe(cost);
      expect(r.soul.duyen).toBe(s.duyen - cost);
      expect(r.soul.unlocks.du_am).toBe(n);
      s = r.soul;
    }
    expect(s0.duyen).toBe(100_000);
    expect(s0.unlocks).toEqual({});
    expect(nextCost(s, "du_am")).toBeNull();
    expect(buyUnlock(s, "du_am")).toEqual({ ok: false, reason: "max" });
  });

  it("không đủ Duyên thì không đổi gì (không bao giờ trừ mà không tăng)", () => {
    const s = rich(11);
    expect(buyUnlock(s, "du_am")).toEqual({ ok: false, reason: "poor" });
    expect(buyUnlock(rich(12), "du_am").ok).toBe(true);
  });

  it("mua xuất thân một lần; mua lại, mua Phàm gia, id lạ đều bị từ chối", () => {
    const s = rich(100);
    const r = buyUnlock(s, ORIGIN_BUY_PREFIX + "kiem_khach");
    expect(r.ok && r.soul.origins).toEqual(["kiem_khach"]);
    if (!r.ok) return;
    expect(r.soul.duyen).toBe(80);
    expect(buyUnlock(r.soul, ORIGIN_BUY_PREFIX + "kiem_khach")).toEqual({
      ok: false,
      reason: "max",
    });
    expect(buyUnlock(s, ORIGIN_BUY_PREFIX + DEFAULT_ORIGIN)).toEqual({ ok: false, reason: "max" });
    for (const bad of [
      ORIGIN_BUY_PREFIX + "rong",
      ORIGIN_BUY_PREFIX,
      "constructor",
      "__proto__",
      "",
      null,
      undefined,
      7,
      {},
      ORIGIN_BUY_PREFIX + "constructor",
    ])
      expect(buyUnlock(s, bad), JSON.stringify(bad)).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("sanitizeSoul: không tin file lưu", () => {
  it("không phải object thì null; object rỗng ra chân linh mới hợp lệ", () => {
    for (const bad of [null, undefined, 5, "x", [], true]) expect(sanitizeSoul(bad)).toBeNull();
    const s = sanitizeSoul({}, "now")!;
    expect([s.kiep, s.duyen, s.duyenTotal, s.origins, s.unlocks, s.history]).toEqual([
      1,
      0,
      0,
      [],
      {},
      [],
    ]);
  });

  it("kẹp số, bỏ id lạ, nấc không vượt tối đa, Duyên không âm, lịch sử cắt 20", () => {
    const s = sanitizeSoul({
      id: "a".repeat(500),
      kiep: -3,
      duyen: -50,
      duyenTotal: 1e30,
      unlocks: {
        du_am: 999,
        kim_nang: -2,
        ky_vat: "3",
        le_ma: 2.9,
        rong: 5,
        constructor: 4,
        __proto__: { du_am: 5 },
      },
      origins: ["kiem_khach", "kiem_khach", DEFAULT_ORIGIN, "rong", 5, "the_tu"],
      best: { realm: 99, tier: 99 },
      lastCreditedLife: 12345,
      history: Array.from({ length: 50 }, (_, i) => ({
        kiep: i + 1,
        step: 1e9,
        minutes: -1,
        gain: Number.NaN,
        at: 5,
      })),
    })!;
    expect(s.id).toHaveLength(64);
    expect(s.kiep).toBe(1);
    expect(s.duyen).toBe(0);
    expect(s.duyenTotal).toBe(DUYEN_CAP);
    expect(s.unlocks).toEqual({ du_am: 10, le_ma: 2 });
    expect(s.origins).toEqual(["kiem_khach", "the_tu"]);
    expect(s.best.step).toBe(stepOf(REALMS.length - 1, REALMS[REALMS.length - 1].tiers.length - 1));
    expect(s.lastCreditedLife).toBe("");
    expect(s.history).toHaveLength(HISTORY_MAX);
    expect(s.history[HISTORY_MAX - 1].kiep).toBe(50);
    for (const h of s.history) expect([h.minutes, h.gain, h.at]).toEqual([0, 0, ""]);
  });

  it("tổng Duyên đã nhận không bao giờ nhỏ hơn Duyên đang có; khứ hồi giữ nguyên chân linh hợp lệ", () => {
    expect(sanitizeSoul({ duyen: 50, duyenTotal: 10 })!.duyenTotal).toBe(50);
    const ok: Soul = {
      ...newSoul("a b", "t0"),
      kiep: 4,
      duyen: 7,
      duyenTotal: 90,
      unlocks: { du_am: 2, ky_vat: 1 },
      origins: ["linh_tu"],
      lastCreditedLife: "life-3",
      best: { step: 10, realm: 2, tier: 0 },
      history: [{ kiep: 3, step: 9, minutes: 50, gain: 22, at: "2026-11-10" }],
      updatedAt: "t1",
    };
    expect(sanitizeSoul(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
  });

  it("soulView chỉ gồm kiếp, Duyên, nấc, xuất thân và là bản sao", () => {
    const s: Soul = { ...newSoul("a", "t"), duyen: 5, unlocks: { du_am: 1 }, origins: ["the_tu"] };
    const v = soulView(s);
    expect(v).toEqual({ kiep: 1, duyen: 5, unlocks: { du_am: 1 }, origins: ["the_tu"] });
    v.unlocks.du_am = 9;
    v.origins.push("x");
    expect(s.unlocks.du_am).toBe(1);
    expect(s.origins).toEqual(["the_tu"]);
  });
});

describe("validateRebirth", () => {
  const soul = { unlocks: { ky_vat: 2 }, origins: ["kiem_khach"] };
  const keepable = ["hac_ho_kiem", "tho_nhung_bao", "hac_ho_kiem"];

  it("hợp lệ: bỏ trống / Phàm gia / xuất thân đã mở, giữ trong số ô và trong keepable (có thể trùng loại)", () => {
    expect(validateRebirth(soul, { keep: [] }, keepable)).toEqual({
      origin: DEFAULT_ORIGIN,
      keep: [],
    });
    expect(
      validateRebirth(soul, { origin: DEFAULT_ORIGIN, keep: ["hac_ho_kiem"] }, keepable),
    ).toEqual({ origin: DEFAULT_ORIGIN, keep: ["hac_ho_kiem"] });
    expect(
      validateRebirth(
        soul,
        { origin: "kiem_khach", keep: ["hac_ho_kiem", "hac_ho_kiem"] },
        keepable,
      ),
    ).toEqual({ origin: "kiem_khach", keep: ["hac_ho_kiem", "hac_ho_kiem"] });
  });

  it("không hợp lệ: xuất thân chưa mở / lạ, quá số ô, món không có (hoặc nhiều hơn số đang có), sai kiểu", () => {
    const bad: unknown[] = [
      null,
      undefined,
      5,
      "x",
      [],
      {},
      { keep: "hac_ho_kiem" },
      { origin: "the_tu", keep: [] },
      { origin: "rong", keep: [] },
      { origin: 5, keep: [] },
      { origin: "constructor", keep: [] },
      { keep: ["hac_ho_kiem", "tho_nhung_bao", "hac_ho_kiem"] }, // 3 món, chỉ 2 ô
      { keep: ["khong_co"] },
      { keep: ["tho_nhung_bao", "tho_nhung_bao"] }, // chỉ có một
      { keep: [5] },
      { keep: [{}] },
    ];
    for (const m of bad) expect(validateRebirth(soul, m, keepable), JSON.stringify(m)).toBeNull();
    expect(
      validateRebirth({ unlocks: {}, origins: [] }, { keep: ["hac_ho_kiem"] }, keepable),
    ).toBeNull(); // chưa mở Ký vật
  });
});
