import { describe, expect, it } from "vitest";
import {
  AMBUSH_FOES,
  AMBUSH_SCENES,
  ambushCoverageViolations,
  ambushFillScene,
  ambushViolations,
  type AmbushFoeGroup,
  type AmbushScene,
} from "./ambush-data";
import { AMBUSH_FOE_COUNT_MAX, AMBUSH_TIERS } from "./ambush";
import { BOSSES } from "./bosses";
import { DEFAULT_MAP_ID, MAPS } from "./map";

// chữ Hán dựng bằng mã (no-cjk.test.ts cấm chữ Hán trực tiếp trong mã nguồn, kể cả test)
const HAN = String.fromCharCode(0x5c71);
const scene = (o: Partial<AmbushScene> = {}): AmbushScene => ({
  id: "canh_mau",
  text: "Đường {dia_danh} bỗng vắng hẳn, {ke_dich} lao ra chặn lối giữa đường.",
  mapIds: [DEFAULT_MAP_ID],
  tiers: ["normal"],
  source: "hoang_da/rung_ram.yaml#ev.mau",
  ...o,
});
const group = (o: Partial<AmbushFoeGroup> = {}): AmbushFoeGroup => ({
  id: "bay_mau",
  name: "Bầy Sói Hoang",
  mapId: DEFAULT_MAP_ID,
  minStep: 0,
  maxStep: 5,
  tier: "normal",
  foes: [{ kind: "lang", count: 2 }],
  ...o,
});

describe("dữ liệu chặn đường: khung", () => {
  it("dữ liệu thật hợp lệ (rỗng ở khung; E / G / D thêm thì phải qua luật này)", () => {
    expect(ambushViolations(AMBUSH_SCENES, AMBUSH_FOES)).toEqual([]);
  });
  it("mẫu hợp lệ", () => {
    expect(ambushViolations([scene()], [group()])).toEqual([]);
  });
});

describe("ambushFillScene", () => {
  it("điền cả hai biến (mọi lần xuất hiện); biến lạ giữ nguyên chữ", () => {
    const vars = { dia_danh: "Vân Mộng Sơn", ke_dich: "Sói Hoang" };
    expect(ambushFillScene("{dia_danh}: {ke_dich} và {ke_dich}", vars)).toBe(
      "Vân Mộng Sơn: Sói Hoang và Sói Hoang",
    );
    expect(ambushFillScene("{la_hoa} {constructor}", vars)).toBe("{la_hoa} {constructor}");
    expect(ambushFillScene("không biến", vars)).toBe("không biến");
  });
  it("không ăn nhầm tên thuộc tính của Object (constructor / __proto__)", () => {
    const vars = { dia_danh: "A", ke_dich: "B" };
    expect(ambushFillScene("{__proto__}{toString}", vars)).toBe("{__proto__}{toString}");
  });
});

describe("ambushViolations: cảnh", () => {
  const cases: [string, Partial<AmbushScene>, RegExp][] = [
    ["id sai dạng", { id: "Canh-Sai" }, /id sai dạng/],
    ["id rỗng", { id: "" }, /id sai dạng/],
    ["text quá ngắn", { text: "ngắn" }, /20-600/],
    ["text quá dài", { text: "a".repeat(601) }, /20-600/],
    [
      "có chữ Hán",
      { text: `Đường vắng hẳn, bóng đen lao ra chặn lối giữa đường ${HAN} kia.` },
      /chữ Hán/,
    ],
    [
      "biến lạ",
      { text: "Đường vắng hẳn, {la_hoa} lao ra chặn lối giữa đường." },
      /không được phép/,
    ],
    ["ngoặc thừa", { text: "Đường vắng hẳn, {ke_dich} lao ra chặn lối } giữa đường." }, /ngoặc/],
    ["mapIds rỗng", { mapIds: [] }, /mapIds rỗng/],
    ["bản đồ lạ", { mapIds: ["khong_co"] }, /không có/],
    ["bản đồ đấu trường không hợp", { mapIds: ["arena_lac_ha"] }, /không có/],
    ["tiers rỗng", { tiers: [] }, /tiers rỗng/],
    ["mức lạ", { tiers: ["boss" as never] }, /không hợp lệ/],
    ["thiếu source", { source: "  " }, /thiếu source/],
  ];
  for (const [name, o, re] of cases)
    it(`bắt: ${name}`, () => {
      const v = ambushViolations([scene(o)], []);
      expect(v.length, name).toBeGreaterThan(0);
      expect(v.join("\n")).toMatch(re);
    });
  it("bắt id trùng", () => {
    expect(ambushViolations([scene(), scene()], []).join("\n")).toMatch(/trùng id/);
  });
});

describe("ambushViolations: bầy", () => {
  const cases: [string, Partial<AmbushFoeGroup>, RegExp][] = [
    ["id sai dạng", { id: "X Y" }, /id sai dạng/],
    ["tên quá ngắn", { name: "A" }, /tên phải/],
    ["tên có chữ Hán", { name: `Sói ${HAN}` }, /chữ Hán/],
    ["bản đồ lạ", { mapId: "khong_co" }, /không có/],
    ["bậc đầu ngoài thang", { minStep: -1 }, /khoảng bậc/],
    ["bậc cuối ngoài thang", { maxStep: 99999 }, /khoảng bậc/],
    ["bậc đầu > bậc cuối", { minStep: 6, maxStep: 5 }, /khoảng bậc/],
    ["bậc lẻ", { minStep: 1.5 }, /khoảng bậc/],
    ["mức lạ", { tier: "x" as never }, /không hợp lệ/],
    ["không có kẻ địch", { foes: [] }, /không có kẻ địch/],
    ["loài lạ", { foes: [{ kind: "khong_co", count: 1 }] }, /không có/],
    ["loài prototype", { foes: [{ kind: "constructor", count: 1 }] }, /không có/],
    ["count 0", { foes: [{ kind: "lang", count: 0 }] }, /count/],
    ["count lẻ", { foes: [{ kind: "lang", count: 1.5 }] }, /count/],
    [
      "vượt trần số con",
      { foes: [{ kind: "lang", count: AMBUSH_FOE_COUNT_MAX + 1 }] },
      /vượt trần/,
    ],
    [
      "vượt trần cộng nhiều loài",
      {
        foes: [
          { kind: "lang", count: 2 },
          { kind: "ho", count: 2 },
        ],
      },
      /vượt trần/,
    ],
    [
      "kẻ cầm đầu chưa có BossDef",
      { tier: "leader", foes: [{ kind: "lang", count: 1 }] },
      /chưa có BossDef/,
    ],
  ];
  for (const [name, o, re] of cases)
    it(`bắt: ${name}`, () => {
      const v = ambushViolations([], [group(o)]);
      expect(v.length, name).toBeGreaterThan(0);
      expect(v.join("\n")).toMatch(re);
    });
  it("bắt id trùng", () => {
    expect(ambushViolations([], [group(), group()]).join("\n")).toMatch(/trùng id/);
  });
  it("kẻ cầm đầu: có BossDef thì qua; 2 con cầm đầu thì bắt", () => {
    const boss = BOSSES[0].kind;
    expect(
      ambushViolations([], [group({ tier: "leader", foes: [{ kind: boss, count: 1 }] })]),
    ).toEqual([]);
    expect(
      ambushViolations([], [group({ tier: "leader", foes: [{ kind: boss, count: 2 }] })]).join(
        "\n",
      ),
    ).toMatch(/đúng 1 con/);
  });
});

describe("ambushCoverageViolations", () => {
  const maps = MAPS.map((m) => m.id);
  it("dữ liệu rỗng thiếu mọi (bản đồ, mức): 2 lỗi (cảnh + bầy) mỗi ô", () => {
    expect(ambushCoverageViolations([], [], maps).length).toBe(
      maps.length * AMBUSH_TIERS.length * 2,
    );
  });
  it("đủ cảnh + bầy cho mọi (bản đồ, mức) thì không lỗi; thiếu một ô thì báo đúng ô đó", () => {
    const scenes = maps.map((m, i) =>
      scene({ id: `c${i}`, mapIds: [m], tiers: [...AMBUSH_TIERS] }),
    );
    const foes = maps.flatMap((m, i) =>
      AMBUSH_TIERS.map((t, j) => group({ id: `b${i}_${j}`, mapId: m, tier: t })),
    );
    expect(ambushCoverageViolations(scenes, foes, maps)).toEqual([]);
    const missing = ambushCoverageViolations(
      scenes,
      foes.filter((g) => !(g.mapId === maps[0] && g.tier === "leader")),
      maps,
    );
    expect(missing).toEqual([`${maps[0]} / leader: thiếu bầy`]);
  });
});
