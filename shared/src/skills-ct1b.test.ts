// Hợp đồng THÊM CHIÊU phần hình mới + trạng thái mới + fx (mục 51, CT1b #1076): `skillViolations` cho hình / trường mới, trạng thái `empower` / `weaken` / `mark_*` / `windup`,
// `STATUS_BIT.weaken`, `Monster.mark` (`markIndexOf`), `FxMsg` mới, `hitsOf`.
import { describe, expect, it } from "vitest";
import {
  AMP_ELEMENTS,
  CHAIN_FX_POINTS_MAX,
  EMPOWER_MAX_RATIO,
  MAX_STATUSES,
  MOVE_SPEED_MUL_MIN,
  SKILLS_M7,
  SKILL_FX_IDS,
  SKILL_LIMITS,
  SKILL_SHAPES,
  STATUSES,
  STATUS_BIT,
  STATUS_BY_ID,
  STATUS_SKILL_ONLY,
  STATUS_UNCOUNTED,
  WEAKEN_MAX_RATIO,
  WINDUP_MAX_MS,
  WINDUP_SLOW,
  clampStatusEffect,
  hitsOf,
  markElementOf,
  markIndexOf,
  markStatusIdOf,
  moveSpeedMul,
  sanitizeStatusList,
  skillEffect,
  skillStyleOf,
  skillViolations,
  statusCarriesRatio,
  statusEmpowerMult,
  statusMask,
  statusesOfMask,
  type FxMsg,
  type SkillDef,
  type StatusEntry,
} from "./index";

const base = (): SkillDef => ({ ...SKILLS_M7.find((s) => s.id === "hoa_van_kiem")! });
const mk = (o: Partial<SkillDef>): SkillDef => ({ ...base(), ...o });
const L = SKILL_LIMITS;

// Mỗi hình mới một chiêu HỢP LỆ (mult nhỏ để vượt khung tổng của cảnh giới 1 không xảy ra)
const OK: Record<string, Partial<SkillDef>> = {
  chain: {
    shape: "chain",
    mult: 0.6,
    range: 200,
    arc: undefined,
    bounces: 2,
    chainReach: 160,
    falloff: 0.85,
    fx: "chain",
  },
  bolt: {
    shape: "bolt",
    mult: 0.4,
    range: 400,
    arc: Math.PI / 4,
    width: 20,
    count: 3,
    speed: 500,
    pierce: 1,
    bounce: 0,
    fx: "bolt",
  },
  zone: {
    shape: "zone",
    mult: 0.3,
    range: 90,
    arc: undefined,
    reach: 80,
    durationMs: 4000,
    tickMs: 1000,
    fx: "zone",
  },
  trap: {
    shape: "trap",
    mult: 1.4,
    range: 70,
    arc: undefined,
    reach: 60,
    armMs: 600,
    durationMs: 10_000,
    fx: "trap",
  },
  aura: {
    shape: "aura",
    mult: 0.3,
    range: 120,
    arc: undefined,
    durationMs: 6000,
    tickMs: 1000,
    fx: "aura",
  },
  totem: {
    shape: "totem",
    mult: 0.4,
    range: 200,
    arc: undefined,
    reach: 70,
    durationMs: 5000,
    tickMs: 1000,
    taunt: true,
    fx: "totem",
  },
};
const ok = (shape: string, o: Partial<SkillDef> = {}): SkillDef => mk({ ...OK[shape], ...o });

describe("hình mới: dữ liệu hợp lệ", () => {
  it("SKILL_SHAPES có đủ 13 hình (7 cũ + 6 mới), mỗi hình mới có mẫu hợp lệ", () => {
    expect(SKILL_SHAPES).toEqual(
      expect.arrayContaining(["chain", "bolt", "zone", "trap", "aura", "totem"]),
    );
    expect(SKILL_SHAPES.length).toBe(13);
    for (const shape of Object.keys(OK)) expect(skillViolations([ok(shape)]), shape).toEqual([]);
  });
  it("id hiệu ứng client chung cho hình mới có trong SKILL_FX_IDS (không một id mỗi chiêu)", () => {
    for (const id of ["bolt", "chain", "zone", "trap", "aura", "totem", "pull", "push", "windup"])
      expect(SKILL_FX_IDS as readonly string[], id).toContain(id);
    expect(new Set(SKILL_FX_IDS).size).toBe(SKILL_FX_IDS.length);
  });
});

describe("hình mới: skillViolations bắt từng loại lỗi", () => {
  const cases: [string, SkillDef, RegExp][] = [
    [
      "chain bounces quá nhiều",
      ok("chain", { bounces: L.chainBouncesMax + 1 }),
      /chain cần bounces/,
    ],
    ["chain bounces âm", ok("chain", { bounces: -1 }), /chain cần bounces/],
    ["chain thiếu bounces", ok("chain", { bounces: undefined }), /chain cần bounces/],
    ["chain chainReach quá xa", ok("chain", { chainReach: L.chainReachMax + 1 }), /chainReach/],
    ["chain falloff quá thấp", ok("chain", { falloff: 0.1 }), /falloff/],
    ["chain falloff > 1", ok("chain", { falloff: 1.5 }), /falloff/],
    ["bolt count 0", ok("bolt", { count: 0 }), /bolt cần count/],
    ["bolt quá nhiều viên", ok("bolt", { count: L.boltCountMax + 1 }), /bolt cần count/],
    ["bolt speed quá chậm", ok("bolt", { speed: 100 }), /bolt cần speed/],
    ["bolt speed quá nhanh", ok("bolt", { speed: 9000 }), /bolt cần speed/],
    ["bolt range quá xa", ok("bolt", { range: L.boltRangeMax + 1 }), /bolt cần range/],
    ["bolt nhiều viên thiếu arc", ok("bolt", { arc: undefined }), /bolt nhiều viên cần arc/],
    ["bolt thiếu width", ok("bolt", { width: undefined }), /bolt cần width/],
    ["bolt pierce quá lớn", ok("bolt", { pierce: L.boltPierceMax + 1 }), /pierce/],
    ["bolt bounce quá lớn", ok("bolt", { bounce: L.boltBounceMax + 1 }), /bounce/],
    ["zone thiếu durationMs", ok("zone", { durationMs: undefined }), /zone cần durationMs/],
    ["zone quá lâu", ok("zone", { durationMs: L.zoneDurationMax + 1 }), /zone cần durationMs/],
    ["zone tickMs quá dày", ok("zone", { tickMs: L.zoneTickMin - 1 }), /zone cần tickMs/],
    ["zone tickMs > durationMs", ok("zone", { tickMs: 9000 }), /zone cần tickMs/],
    ["trap armMs quá ngắn", ok("trap", { armMs: 100 }), /trap cần armMs/],
    ["trap durationMs <= armMs", ok("trap", { durationMs: 600 }), /trap cần durationMs/],
    ["trap quá lâu", ok("trap", { durationMs: L.trapDurationMax + 1 }), /trap cần durationMs/],
    ["aura quá lâu", ok("aura", { durationMs: L.auraDurationMax + 1 }), /aura cần durationMs/],
    ["aura tickMs quá dày", ok("aura", { tickMs: L.auraTickMin - 1 }), /aura cần tickMs/],
    ["totem quá lâu", ok("totem", { durationMs: L.totemDurationMax + 1 }), /totem cần durationMs/],
    ["totem tickMs quá dày", ok("totem", { tickMs: L.totemTickMin - 1 }), /totem cần tickMs/],
    ["totem range 0", ok("totem", { range: 0 }), /totem cần range/],
    ["trường chain ở hình khác", mk({ bounces: 2 }), /bounces chỉ dùng cho hình chain/],
    ["trường bolt ở hình khác", mk({ speed: 500 }), /speed chỉ dùng cho hình bolt/],
    ["armMs ở hình khác", ok("zone", { armMs: 600 }), /armMs chỉ dùng cho hình trap/],
    ["taunt ở hình khác", ok("aura", { taunt: true }), /taunt chỉ dùng cho hình totem/],
    ["durationMs ở hình tức thời", mk({ durationMs: 3000 }), /durationMs chỉ dùng/],
    ["tickMs ở bẫy", ok("trap", { tickMs: 1000 }), /tickMs chỉ dùng/],
    // tổng sát thương: nhiều lần trúng vượt khung dù mult mỗi lần nhỏ
    [
      "aura nhiều nhịp vượt khung tổng",
      ok("aura", { mult: 1, durationMs: 12_000, tickMs: 500 }),
      /tổng mult/,
    ],
    ["chain nhiều lần nảy vượt khung tổng", ok("chain", { mult: 1.5, bounces: 4 }), /tổng mult/],
    [
      "bolt xuyên + nảy vượt khung tổng",
      ok("bolt", { mult: 1, count: 5, pierce: 3, bounce: 2 }),
      /tổng mult/,
    ],
  ];
  for (const [name, def, re] of cases)
    it(`bắt: ${name}`, () => {
      const v = skillViolations([def]);
      expect(v.length, name).toBeGreaterThan(0);
      expect(v.join("\n")).toMatch(re);
    });
});

describe("trường chung mới: windupMs / displace / combo / ally", () => {
  it("windupMs trong 300..WINDUP_MAX_MS; ngoài khoảng, lẻ, hoặc ở dash thì bị bắt", () => {
    expect(skillViolations([mk({ windupMs: L.windupMin })])).toEqual([]);
    expect(skillViolations([mk({ windupMs: WINDUP_MAX_MS })])).toEqual([]);
    for (const w of [100, WINDUP_MAX_MS + 1, 1000.5, -5, Number.NaN])
      expect(skillViolations([mk({ windupMs: w })]).join("\n"), String(w)).toMatch(/windupMs/);
    const dash = { ...SKILLS_M7.find((s) => s.shape === "dash")!, windupMs: 500 };
    expect(skillViolations([dash]).join("\n")).toMatch(/chiêu vận không dùng cho dash/);
  });
  it("displace: pull / push trong khoảng; dir lạ, px ngoài khoảng, hoặc ở self / dash thì bị bắt", () => {
    expect(skillViolations([mk({ displace: { dir: "pull", px: 80 } })])).toEqual([]);
    expect(skillViolations([mk({ displace: { dir: "push", px: L.displaceMax } })])).toEqual([]);
    for (const d of [
      { dir: "spin", px: 80 },
      { dir: "pull", px: L.displaceMin - 1 },
      { dir: "pull", px: L.displaceMax + 1 },
      { dir: "push", px: Number.NaN },
    ])
      expect(skillViolations([mk({ displace: d as never })]).join("\n"), JSON.stringify(d)).toMatch(
        /displace/,
      );
    const self = {
      ...SKILLS_M7.find((s) => s.shape === "self")!,
      displace: { dir: "push" as const, px: 80 },
    };
    expect(skillViolations([self]).join("\n")).toMatch(/displace không dùng cho hình self/);
  });
  it("combo: needs là trạng thái CÓ HẠI có thật; mult 1..2; apply trong trần; cần mult > 0", () => {
    const good = mk({
      combo: { needs: "chill", mult: 1.4, consume: true, apply: skillEffect("sunder", 2, 0.2, 1) },
    });
    expect(skillViolations([good])).toEqual([]);
    expect(skillViolations([mk({ combo: { needs: "mark_loi" } })])).toEqual([]); // dấu hệ là trạng thái có hại
    const cases: [Partial<SkillDef>, RegExp][] = [
      [{ combo: { needs: "khong_co" as never } }, /combo.needs/],
      [{ combo: { needs: "constructor" as never } }, /combo.needs/],
      [{ combo: { needs: "shield" } }, /CÓ HẠI/],
      [{ combo: { needs: "chill", mult: 0.5 } }, /combo.mult/],
      [{ combo: { needs: "chill", mult: 9 } }, /combo.mult/],
      [{ combo: { needs: "chill", consume: "yes" as never } }, /consume/],
      [
        { combo: { needs: "chill", apply: { status: "burn", ms: 99_999, ratio: 0.1, chance: 1 } } },
        /combo.apply/,
      ],
      [
        {
          combo: {
            needs: "chill",
            apply: { status: "khong_co" as never, ms: 1000, ratio: 0.1, chance: 1 },
          },
        },
        /combo.apply/,
      ],
      [{ combo: { needs: "chill" }, mult: 0 }, /combo cần chiêu có sát thương/],
    ];
    for (const [o, re] of cases)
      expect(skillViolations([mk(o)]).join("\n"), JSON.stringify(o)).toMatch(re);
  });
  it("ally: range trong (0, 600] và cần ít nhất một hiệu ứng CÓ LỢI để chia", () => {
    const self = { ...SKILLS_M7.find((s) => s.id === "kim_chung_trao")! }; // hộ thể (có lợi)
    expect(skillViolations([{ ...self, ally: { range: 300 } }])).toEqual([]);
    expect(skillViolations([{ ...self, ally: { range: 0 } }]).join("\n")).toMatch(/ally.range/);
    expect(skillViolations([{ ...self, ally: { range: L.allyRangeMax + 1 } }]).join("\n")).toMatch(
      /ally.range/,
    );
    // chỉ có hiệu ứng có hại (hoa_van_kiem: bỏng) thì không có gì để chia cho đồng đội
    expect(skillViolations([mk({ ally: { range: 300 } })]).join("\n")).toMatch(
      /ally cần ít nhất một hiệu ứng CÓ LỢI/,
    );
  });
});

describe("hitsOf: số lần trúng tối đa của một lần dùng", () => {
  it("theo hình: fan count, chain 1 + bounces, bolt count x (1 + pierce + bounce), zone / aura / totem số nhịp, còn lại 1", () => {
    expect(hitsOf(mk({}))).toBe(1);
    expect(hitsOf(mk({ shape: "fan", count: 5 }))).toBe(5);
    expect(hitsOf(ok("chain", { bounces: 3 }))).toBe(4);
    expect(hitsOf(ok("bolt", { count: 3, pierce: 1, bounce: 1 }))).toBe(9);
    expect(hitsOf(ok("zone", { durationMs: 4000, tickMs: 1000 }))).toBe(4);
    expect(hitsOf(ok("aura", { durationMs: 6000, tickMs: 1500 }))).toBe(4);
    expect(hitsOf(ok("totem", { durationMs: 5000, tickMs: 2000 }))).toBe(2);
    expect(hitsOf(ok("trap"))).toBe(1);
  });
  it("dữ liệu rác coi là 1 (không NaN / vô hạn)", () => {
    expect(hitsOf(mk({ shape: "fan", count: Number.NaN }))).toBe(1);
    expect(hitsOf(ok("zone", { durationMs: Number.NaN }))).toBe(1);
    expect(hitsOf(ok("zone", { tickMs: 0 }))).toBe(1);
    expect(hitsOf(ok("chain", { bounces: -3 }))).toBe(1);
  });
});

describe("trạng thái mới: empower / weaken / mark_<hệ> / windup", () => {
  it("thêm CUỐI bảng (thứ tự cũ không đổi): cdr_phu rồi empower, weaken, 9 dấu, windup", () => {
    const ids = STATUSES.map((s) => s.id);
    const i = ids.indexOf("cdr_phu");
    expect(ids.slice(i + 1)).toEqual([
      "empower",
      "weaken",
      ...AMP_ELEMENTS.map((e) => `mark_${e}`),
      "windup",
    ]);
    expect(ids.slice(0, 10)).toEqual([
      "burn",
      "poison",
      "bleed",
      "chill",
      "sunder",
      "stun",
      "shield",
      "haste",
      "regen",
      "dao_ho",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("định nghĩa: empower có lợi (tối đa +50%), weaken có hại (tối đa 40%), 9 dấu có hại không ratio, windup kind slow 0,5 tối đa 2,5 s", () => {
    expect(STATUS_BY_ID.empower).toMatchObject({
      kind: "empower",
      harmful: false,
      maxRatio: EMPOWER_MAX_RATIO,
    });
    expect(STATUS_BY_ID.weaken).toMatchObject({
      kind: "weaken",
      harmful: true,
      maxRatio: WEAKEN_MAX_RATIO,
    });
    for (const e of AMP_ELEMENTS)
      expect(STATUS_BY_ID[`mark_${e}`], e).toMatchObject({
        kind: "mark",
        harmful: true,
        maxRatio: 0,
      });
    expect(STATUS_BY_ID.windup).toMatchObject({
      kind: "slow",
      harmful: false,
      maxRatio: WINDUP_SLOW,
      maxMs: WINDUP_MAX_MS,
    });
    expect(WINDUP_SLOW).toBe(0.5);
  });
  it("windup là trạng thái `slow`: moveSpeedMul của người đang vận = 0,5 (client đoán đúng miễn phí), kẹp không dưới MOVE_SPEED_MUL_MIN", () => {
    expect(moveSpeedMul([["windup", 2000, WINDUP_SLOW]])).toBe(0.5);
    expect(moveSpeedMul([["windup", 2000, 9]])).toBe(0.5); // ratio kẹp theo maxRatio
    expect(moveSpeedMul([["windup", 0, 0.5]])).toBe(1); // hết hạn
    expect(
      moveSpeedMul([
        ["windup", 2000, 0.5],
        ["chill", 2000, 0.6],
      ]),
    ).toBe(MOVE_SPEED_MUL_MIN); // chồng tê cóng: kẹp sàn
  });
  it("windup NGOÀI trần MAX_STATUSES: người đủ MAX_STATUSES buff vẫn nhận được windup; vẫn một mục mỗi id", () => {
    expect(STATUS_UNCOUNTED).toContain("windup");
    const buffs: StatusEntry[] = [
      ["shield", 5000, 0.2],
      ["haste", 5000, 0.3],
      ["regen", 5000, 0.1],
      ["empower", 5000, 0.2],
    ];
    expect(buffs.length).toBe(MAX_STATUSES);
    const all = sanitizeStatusList([...buffs, ["windup", 2000, 0.5]]);
    expect(all.map((e) => e[0])).toEqual(["shield", "haste", "regen", "empower", "windup"]);
    // buff thứ 5 (đếm được) vẫn bị cắt
    expect(
      sanitizeStatusList([...buffs, ["dao_ho", 5000, 0.1], ["windup", 2000, 0.5]]).map((e) => e[0]),
    ).toEqual(["shield", "haste", "regen", "empower", "windup"]);
    // windup lặp: giữ một
    expect(
      sanitizeStatusList([
        ["windup", 1000, 0.5],
        ["windup", 2000, 0.5],
      ]).length,
    ).toBe(1);
  });
  it("vật phẩm KHÔNG gắn được trạng thái chỉ-chiêu (windup); empower (có lợi) thì được, kẹp trần", () => {
    expect(STATUS_SKILL_ONLY).toContain("windup");
    expect(clampStatusEffect({ id: "windup", ratio: 0.5, ms: 2000 })).toBeNull();
    expect(clampStatusEffect({ id: "empower", ratio: 9, ms: 99_999 })).toEqual({
      id: "empower",
      ratio: EMPOWER_MAX_RATIO,
      ms: 8000,
    });
    expect(clampStatusEffect({ id: "weaken", ratio: 0.2, ms: 1000 })).toBeNull(); // có hại
    expect(clampStatusEffect({ id: "mark_hoa", ratio: 0, ms: 1000 })).toBeNull(); // có hại
  });
  it("statusCarriesRatio: empower và windup (slow) mang ratio; weaken / dấu không", () => {
    expect(statusCarriesRatio("empower")).toBe(true);
    expect(statusCarriesRatio("windup")).toBe(true);
    expect(statusCarriesRatio("weaken")).toBe(false);
    expect(statusCarriesRatio("mark_loi")).toBe(false);
    expect(sanitizeStatusList([["empower", 3000, 0.3]])).toEqual([["empower", 3000, 0.3]]);
    expect(sanitizeStatusList([["empower", 3000, 9]])).toEqual([
      ["empower", 3000, EMPOWER_MAX_RATIO],
    ]);
    expect(sanitizeStatusList([["mark_loi", 3000, 0.9]])).toEqual([["mark_loi", 3000]]); // không ghi ratio
  });
  it("statusEmpowerMult: 1 + ratio (kẹp), bỏ mục hết hạn / lạ", () => {
    expect(statusEmpowerMult([])).toBe(1);
    expect(statusEmpowerMult([["empower", 3000, 0.25]])).toBeCloseTo(1.25, 10);
    expect(statusEmpowerMult([["empower", 3000, 9]])).toBeCloseTo(1 + EMPOWER_MAX_RATIO, 10);
    expect(statusEmpowerMult([["empower", 0, 0.25]])).toBe(1);
    expect(statusEmpowerMult([["amp_hoa", 3000, 0.25]])).toBe(1);
  });
});

describe("STATUS_BIT.weaken và Monster.mark", () => {
  it("weaken = bit 64 (6 bit cũ không đổi); mask nhận 0..127; DẤU hệ không có bit", () => {
    expect(STATUS_BIT).toEqual({
      burn: 1,
      poison: 2,
      bleed: 4,
      chill: 8,
      sunder: 16,
      stun: 32,
      weaken: 64,
    });
    expect(statusMask(["weaken", "burn"])).toBe(65);
    expect(statusesOfMask(65)).toEqual(["burn", "weaken"]);
    expect(statusMask(["mark_hoa", "mark_loi", "windup", "empower"])).toBe(0);
    expect(statusesOfMask(128)).toEqual([]); // bit 128 dành cho `root` (đợt 2), chưa gán
  });
  it("markIndexOf / markElementOf: 1..9 theo AMP_ELEMENTS, hai chiều khớp; none / lạ / ngoài khoảng -> 0 / undefined", () => {
    expect(AMP_ELEMENTS.map(markIndexOf)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const e of AMP_ELEMENTS) expect(markElementOf(markIndexOf(e))).toBe(e);
    expect(markIndexOf("none")).toBe(0);
    for (const bad of ["constructor", "__proto__", "", 3, null, undefined])
      expect(markIndexOf(bad), String(bad)).toBe(0);
    for (const bad of [0, 10, -1, 1.5, "1", null, undefined, Number.NaN])
      expect(markElementOf(bad), String(bad)).toBeUndefined();
    expect(markStatusIdOf("loi")).toBe("mark_loi");
    expect(markStatusIdOf("none")).toBeUndefined();
    expect(markStatusIdOf("constructor")).toBeUndefined();
  });
});

describe("FxMsg mới (kiểm lúc biên dịch bằng `satisfies`)", () => {
  it("pbolt / chain / zone / trap / totem / aura / fxEnd hợp kiểu; chain có tối đa CHAIN_FX_POINTS_MAX điểm", () => {
    const msgs = [
      { kind: "pbolt", by: "a", skill: "x", x: 1, y: 2, angle: 0, speed: 500, ms: 400 },
      { kind: "chain", by: "a", skill: "x", x: 1, y: 2, pts: [1, 2, 30, 40, 60, 80] },
      { kind: "zone", by: "a", skill: "x", id: 1, x: 1, y: 2, r: 90, ms: 4000 },
      { kind: "trap", by: "a", skill: "x", id: 2, x: 1, y: 2, r: 70, ms: 10_000 },
      { kind: "totem", by: "a", skill: "x", id: 3, x: 1, y: 2, r: 200, ms: 5000 },
      { kind: "aura", by: "a", skill: "x", id: 4, x: 1, y: 2, r: 120, ms: 6000 },
      { kind: "fxEnd", id: 2, x: 1, y: 2, why: "pop" },
    ] satisfies FxMsg[];
    expect(msgs.length).toBe(7);
    expect(CHAIN_FX_POINTS_MAX).toBe(1 + SKILL_LIMITS.chainBouncesMax + 1);
    for (const m of msgs) expect(typeof (m as { x: number }).x).toBe("number"); // mọi tin có (x, y) cho `sendNear`
  });
});

describe("phong cách mặc định của hình mới (skillStyleOf)", () => {
  it("chain / bolt -> chi, zone -> phu, trap / totem -> tran, aura -> ho_the", () => {
    const want: Record<string, string> = {
      chain: "chi",
      bolt: "chi",
      zone: "phu",
      trap: "tran",
      aura: "ho_the",
      totem: "tran",
    };
    for (const [shape, style] of Object.entries(want))
      expect(skillStyleOf({ shape }), shape).toBe(style);
    expect(skillStyleOf({ shape: "chain", style: "an" })).toBe("an");
  });
});
