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
import { AMBUSH_FOE_COUNT_MAX, AMBUSH_FOE_LEVEL_CAP, AMBUSH_TIERS } from "./ambush";
import { MONSTER_BY_ID } from "./game";
import { stepOf } from "./realms";
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
    [
      "viết như đang ngồi: 'chỗ ngươi ngồi'",
      { text: "Con thủy quái đang bò lên bờ, thẳng về chỗ ngươi ngồi, mùi bùn tanh nồng nặc." },
      /NGỒI/,
    ],
    [
      "viết như vừa thiền: 'ngươi mở mắt'",
      { text: "Ngươi mở mắt trên Hàn Vân Lĩnh thì quanh người đã kín mắt xanh mắt đỏ rồi." },
      /NGỒI/,
    ],
    [
      "viết như đang ngồi: 'quanh chỗ ngồi'",
      { text: "Bầy yêu nhỏ đã vây kín quanh chỗ ngồi của ngươi từ lúc nào chẳng hay biết." },
      /NGỒI/,
    ],
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
  it("KHÔNG bắt kẻ địch 'ngồi' / 'mở mắt' (ngôi thứ ba) và người chơi 'dừng chân' / 'ghé vào' (đúng lối đi bộ)", () => {
    for (const text of [
      "Con đại xà đen cuộn trong hang mở mắt, đuôi quật nước tanh vào mặt ngươi giữa đường.",
      'Tên sơn tặc ngồi trên tảng đá chặn đầu, rìu gác vai: "Mãi lộ năm mươi linh thạch."',
      "Cái hang ngươi ghé vào trú chân khô ráo, kín gió, sâu trong có ổ xương của ai đó.",
      "Ngươi dừng chân giữa Hàn Vân Lĩnh thì quanh người đã kín mắt xanh mắt đỏ rồi.",
    ])
      expect(ambushViolations([scene({ text })], []), text).toEqual([]);
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
    // đủ cảnh giới để kẻ cầm đầu không vượt trần cấp (mục 53): bậc đầu ở cảnh giới của chính loài trùm đó
    const high = { minStep: stepOf(4, 0), maxStep: stepOf(4, 2) };
    expect(
      ambushViolations([], [group({ ...high, tier: "leader", foes: [{ kind: boss, count: 1 }] })]),
    ).toEqual([]);
    expect(
      ambushViolations(
        [],
        [group({ ...high, tier: "leader", foes: [{ kind: boss, count: 2 }] })],
      ).join("\n"),
    ).toMatch(/đúng 1 con/);
  });

  describe("MỤC 53: đối thủ KHÔNG mạnh vượt cảnh giới (cấp loài <= AMBUSH_FOE_LEVEL_CAP của cảnh giới bậc đầu)", () => {
    const at = (realm: number, kind: string) =>
      ambushViolations(
        [],
        [
          group({
            minStep: stepOf(realm, 0),
            maxStep: stepOf(realm, 2),
            foes: [{ kind, count: 1 }],
          }),
        ],
      );
    it("trần theo cảnh giới đúng bảng và loài nằm đúng chỗ", () => {
      expect(AMBUSH_FOE_LEVEL_CAP).toEqual({ 0: 1, 1: 7, 2: 12, 3: 15, 4: 18 });
      expect(MONSTER_BY_ID.lang!.level).toBeLessThanOrEqual(AMBUSH_FOE_LEVEL_CAP[0]!);
      expect(MONSTER_BY_ID.ho!.level).toBeLessThanOrEqual(AMBUSH_FOE_LEVEL_CAP[1]!);
      expect(MONSTER_BY_ID.mang!.level).toBeLessThanOrEqual(AMBUSH_FOE_LEVEL_CAP[2]!);
      expect(MONSTER_BY_ID.doc_thiem!.level).toBeLessThanOrEqual(AMBUSH_FOE_LEVEL_CAP[3]!);
      expect(MONSTER_BY_ID.hac_giao!.level).toBeLessThanOrEqual(AMBUSH_FOE_LEVEL_CAP[4]!);
    });
    it("loài cấp vừa tầm thì qua; loài mạnh hơn cảnh giới bị bắt, kèm tên loài và trần", () => {
      expect(at(0, "lang")).toEqual([]);
      expect(at(1, "ho")).toEqual([]);
      expect(at(2, "mang")).toEqual([]);
      expect(at(3, "doc_thiem")).toEqual([]);
      expect(at(4, "hac_giao")).toEqual([]);
      for (const [realm, kind] of [
        [0, "ho"], // Hắc Hổ (cấp 7) quá mạnh cho Phàm Nhân
        [1, "mang"], // Xích Mãng (cấp 12) cho Luyện Khí
        [2, "suong_ho"], // cấp 13 > 12
        [3, "hac_giao"], // trùm Kim Đan cấp 18 > 15
        [4, "thien_han_vuong"], // cấp 21 > 18
      ] as const)
        expect(at(realm, kind).join("\n"), `${kind} ở cảnh giới ${realm}`).toMatch(
          new RegExp(`${kind} cấp \\d+ vượt trần ${AMBUSH_FOE_LEVEL_CAP[realm]}`),
        );
    });
    it("cảnh giới chưa khai báo trần (Hóa Thần trở lên) bị bắt: phải thêm trần trước khi thêm nội dung", () => {
      expect(at(5, "lang").join("\n")).toMatch(/chưa có trần cấp/);
    });
    it("trần tính theo CẢNH GIỚI của bậc đầu (bầy trải nhiều bậc dùng bậc thấp nhất)", () => {
      // bầy từ Luyện Khí (bậc đầu) tới Kim Đan (bậc cuối) có Xích Mãng: vượt trần Luyện Khí nên bắt (người Luyện Khí gặp phải)
      const v = ambushViolations(
        [],
        [
          group({
            minStep: stepOf(1, 0),
            maxStep: stepOf(3, 2),
            foes: [{ kind: "mang", count: 1 }],
          }),
        ],
      );
      expect(v.join("\n")).toMatch(/mang cấp 12 vượt trần 7/);
    });
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
