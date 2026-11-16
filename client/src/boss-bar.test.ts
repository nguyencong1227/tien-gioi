// Thanh máu trùm (mục 42, T4 #873): chọn trùm hiện thanh, mô hình thanh, mốc giai đoạn, tên chiêu, cuồng nộ.
import { describe, expect, it } from "vitest";
import { BOSS_BY_KIND, BOSS_PHASE_ROAR_MS, MONSTER_BY_ID } from "@tien-gioi/shared";
import {
  BOSS_BAR_RANGE,
  BOSS_CAST_LINGER_MS,
  BOSS_ARMOR_MAX_MS,
  BOSS_ENRAGE_FLASH_MS,
  BOSS_SFX_VIEW,
  BOSS_SUMMON_NOTE_MS,
  BossFxTracker,
  armorPercent,
  bossAbilityElement,
  bossBarText,
  bossMarkPercents,
  isBossCand,
  pickBossForBar,
  type BossCand,
} from "./boss-bar";

const cand = (id: string, o: Partial<BossCand> = {}): BossCand => ({
  id,
  kind: "mang",
  x: 0,
  y: 0,
  hp: 4000,
  maxHp: 4000,
  ...o,
});
const KIND_NO_PHASES = Object.keys(MONSTER_BY_ID).find(
  (k) => MONSTER_BY_ID[k]!.boss && !BOSS_BY_KIND[k],
);
const NOT_BOSS = Object.keys(MONSTER_BY_ID).find((k) => !MONSTER_BY_ID[k]!.boss)!;

describe("isBossCand: chỉ trùm còn sống, số liệu hợp lệ", () => {
  it("trùm sống hợp lệ; quái thường / id lạ / id độc / chết / số hỏng thì không", () => {
    expect(isBossCand(cand("a"))).toBe(true);
    expect(isBossCand(cand("a", { kind: NOT_BOSS }))).toBe(false);
    for (const k of ["khong_co", "constructor", "__proto__", "toString"])
      expect(isBossCand(cand("a", { kind: k })), k).toBe(false);
    expect(isBossCand(cand("a", { hp: 0 }))).toBe(false);
    expect(isBossCand(cand("a", { hp: -5 }))).toBe(false);
    expect(isBossCand(cand("a", { maxHp: 0 }))).toBe(false);
    expect(isBossCand(cand("a", { x: Number.NaN }))).toBe(false);
    expect(isBossCand(cand("a", { hp: Infinity }))).toBe(false);
    expect(isBossCand(null as never)).toBe(false);
  });
});

describe("pickBossForBar: không hiện 8 thanh cho 8 Hắc Giao", () => {
  const me = { x: 1000, y: 1000 };

  it("ngoài hoang: chỉ trùm trong tầm, gần nhất thắng; ngoài tầm hết thì null", () => {
    const near = cand("b", { x: 1100, y: 1000 });
    const nearer = cand("c", { x: 1050, y: 1000 });
    const far = cand("a", { x: 1000 + BOSS_BAR_RANGE + 1, y: 1000 });
    expect(pickBossForBar([far, near, nearer], me)?.id).toBe("c");
    expect(pickBossForBar([far], me)).toBeNull();
    // đúng mép tầm vẫn hiện
    expect(pickBossForBar([cand("e", { x: 1000 + BOSS_BAR_RANGE, y: 1000 })], me)?.id).toBe("e");
  });

  it("bí cảnh (always): trùm gần nhất bất kể tầm; chưa biết vị trí mình thì vẫn chọn được", () => {
    const far = cand("a", { x: 9000, y: 9000 });
    expect(pickBossForBar([far], me, { always: true })?.id).toBe("a");
    expect(pickBossForBar([far], null, { always: false })?.id).toBe("a");
    expect(pickBossForBar([far, cand("z", { x: 1010, y: 1000 })], me, { always: true })?.id).toBe(
      "z",
    );
  });

  it("hoà khoảng cách thì id nhỏ hơn (tất định); bỏ qua ứng viên hỏng; rỗng thì null", () => {
    const a = cand("b", { x: 1100, y: 1000 });
    const b = cand("a", { x: 900, y: 1000 });
    expect(pickBossForBar([a, b], me)?.id).toBe("a");
    expect(pickBossForBar([b, a], me)?.id).toBe("a");
    expect(pickBossForBar([cand("x", { hp: 0 }), cand("y", { kind: NOT_BOSS })], me)).toBeNull();
    expect(pickBossForBar([], me)).toBeNull();
  });
});

describe("BossFxTracker.modelOf: mô hình thanh", () => {
  it("khí huyết, tỉ lệ, giai đoạn suy từ khí huyết và mốc đổi giai đoạn từ dữ liệu (Xích Mãng: mốc 50 %)", () => {
    const t = new BossFxTracker();
    const full = t.modelOf(cand("a"), 0);
    expect(full).toMatchObject({
      name: MONSTER_BY_ID.mang!.name,
      frac: 1,
      phase: 0,
      castName: null,
    });
    expect(full.phaseCount).toBe(BOSS_BY_KIND.mang!.phases.length);
    expect(full.marks).toEqual([50]);
    const half = t.modelOf(cand("a", { hp: 1999 }), 0);
    expect(half.phase).toBe(1);
    expect(t.modelOf(cand("a", { hp: 2000 }), 0).phase).toBe(0); // đúng mốc: chưa đổi (đổi khi < fromHp)
    // hp vượt maxHp / số lẻ được kẹp
    expect(t.modelOf(cand("a", { hp: 9999 }), 0).frac).toBe(1);
    expect(t.modelOf(cand("a", { hp: 1234.6 }), 0).hp).toBe(1235);
  });

  it("trùm chưa có dữ liệu giai đoạn: một giai đoạn, không có vạch", () => {
    if (!KIND_NO_PHASES) return; // mọi trùm đã có dữ liệu: không còn ca này
    const m = new BossFxTracker().modelOf(cand("a", { kind: KIND_NO_PHASES }), 0);
    expect(m).toMatchObject({ phase: 0, phaseCount: 1, marks: [] });
  });

  it("tên chiêu đang vận từ bossCast: hiện trong ms + thời gian giữ, tiến độ 0..1, rồi tắt", () => {
    const t = new BossFxTracker();
    const first = BOSS_BY_KIND.mang!.abilities[0]!;
    t.onCast("a", first.id, 900, 1000);
    const m0 = t.modelOf(cand("a"), 1000);
    expect(m0.castName).toBe(first.name);
    expect(m0.castFrac).toBe(0);
    expect(t.modelOf(cand("a"), 1450).castFrac).toBeCloseTo(0.5, 5);
    expect(t.modelOf(cand("a"), 1900).castFrac).toBe(1);
    expect(t.modelOf(cand("a"), 1900 + BOSS_CAST_LINGER_MS - 1).castName).toBe(first.name); // giữ thêm
    expect(t.modelOf(cand("a"), 1900 + BOSS_CAST_LINGER_MS).castName).toBeNull();
    // trùm khác không thấy chiêu của trùm này
    expect(t.modelOf(cand("b"), 1200).castName).toBeNull();
  });

  it("chiêu lạ vẫn báo 'Đang vận chiêu' (không im lặng); bossCast hỏng bị bỏ", () => {
    const t = new BossFxTracker();
    t.onCast("a", "chieu_la", 900, 0);
    expect(t.modelOf(cand("a"), 100).castName).toBe("Đang vận chiêu");
    const u = new BossFxTracker();
    for (const [by, ab, ms, now] of [
      [5, "x", 900, 0],
      ["a", 5, 900, 0],
      ["a", "x", 0, 0],
      ["a", "x", Number.NaN, 0],
      ["a", "x", 900, Number.NaN],
    ] as const)
      u.onCast(by as never, ab as never, ms, now);
    expect(u.modelOf(cand("a"), 0).castName).toBeNull();
  });

  it("tiếng gầm giai đoạn chỉ trong BOSS_PHASE_ROAR_MS; cuồng nộ chớp trong BOSS_ENRAGE_FLASH_MS rồi giữ chỉ báo", () => {
    const t = new BossFxTracker();
    t.onPhase("a", 5000);
    expect(t.modelOf(cand("a"), 5000).roaring).toBe(true);
    expect(t.modelOf(cand("a"), 5000 + BOSS_PHASE_ROAR_MS - 1).roaring).toBe(true);
    expect(t.modelOf(cand("a"), 5000 + BOSS_PHASE_ROAR_MS).roaring).toBe(false);
    t.onEnrage("a", 8000);
    expect(t.modelOf(cand("a"), 8000)).toMatchObject({ enraged: true, enrageFlash: true });
    const later = t.modelOf(cand("a"), 8000 + BOSS_ENRAGE_FLASH_MS);
    expect(later).toMatchObject({ enraged: true, enrageFlash: false }); // hết chớp mà chỉ báo vẫn còn
    expect(t.modelOf(cand("b"), 8000).enraged).toBe(false);
  });

  it("forget / clear xoá mọi dấu vết của trùm (trùm chết, đổi phòng)", () => {
    const t = new BossFxTracker();
    t.onCast("a", "x", 900, 0);
    t.onPhase("a", 0);
    t.onEnrage("a", 0);
    t.forget("a");
    expect(t.modelOf(cand("a"), 10)).toMatchObject({
      castName: null,
      roaring: false,
      enraged: false,
    });
    t.onEnrage("b", 0);
    t.clear();
    expect(t.modelOf(cand("b"), 10).enraged).toBe(false);
  });
});

describe("BossFxTracker.castTiming: thời gian gồng cho hoạt ảnh trên thân trùm", () => {
  it("không có chiêu: null; có chiêu: thời gian đã trôi + thời lượng gồng, cùng bản ghi với thanh máu", () => {
    const t = new BossFxTracker();
    expect(t.castTiming("b1", 1000)).toBeNull();
    t.onCast("b1", "x", 1200, 1000);
    expect(t.castTiming("b1", 1000)).toEqual({ elapsedMs: 0, castMs: 1200 });
    expect(t.castTiming("b1", 1700)).toEqual({ elapsedMs: 700, castMs: 1200 });
    expect(t.castTiming("khac", 1700)).toBeNull();
  });

  it("hết gồng (không có thời gian đáp) thì null; có `graceMs` thì còn thêm đúng chừng đó", () => {
    const t = new BossFxTracker();
    t.onCast("b1", "x", 1000, 0);
    expect(t.castTiming("b1", 999)).not.toBeNull();
    expect(t.castTiming("b1", 1000)).toBeNull();
    expect(t.castTiming("b1", 1000, 160)).toEqual({ elapsedMs: 1000, castMs: 1000 });
    expect(t.castTiming("b1", 1159, 160)).not.toBeNull();
    expect(t.castTiming("b1", 1160, 160)).toBeNull();
  });

  it("đồng hồ lùi / số hỏng / `forget` / chiêu mới ghi đè: không ném, không trả bậy", () => {
    const t = new BossFxTracker();
    t.onCast("b1", "x", 1000, 5000);
    expect(t.castTiming("b1", 4000)).toBeNull();
    expect(t.castTiming("b1", NaN)).toBeNull();
    expect(t.castTiming("b1", 5100, NaN)).toBeNull();
    t.onCast("b1", "y", 500, 6000);
    expect(t.castTiming("b1", 6100)).toEqual({ elapsedMs: 100, castMs: 500 });
    t.forget("b1");
    expect(t.castTiming("b1", 6100)).toBeNull();
  });
});

describe("bossAbilityElement: hệ của chiêu cho tiếng trùm", () => {
  const def = BOSS_BY_KIND["mang"]!;
  it("chiêu có hệ riêng: dùng hệ đó; không có thì dùng hệ của chính con trùm", () => {
    for (const a of def.abilities)
      expect(bossAbilityElement("mang", a.id)).toBe(a.element ?? MONSTER_BY_ID["mang"]!.element);
  });
  it("chiêu CÓ hệ riêng thì hệ đó thắng hệ của con trùm (dữ liệu thật chưa có chiêu nào ghi hệ nên thêm tạm một chiêu)", () => {
    const first = def.abilities[0]!;
    def.abilities.push({ ...first, id: "tam_hệ_bang", element: "bang" });
    try {
      expect(bossAbilityElement("mang", "tam_hệ_bang")).toBe("bang");
      expect(bossAbilityElement("mang", first.id)).toBe(
        first.element ?? MONSTER_BY_ID["mang"]!.element,
      );
    } finally {
      def.abilities.pop();
    }
    expect(bossAbilityElement("mang", "tam_hệ_bang")).toBe(MONSTER_BY_ID["mang"]!.element);
  });
  it("chiêu lạ / thiếu: hệ của con trùm; trùm lạ / id độc / sai kiểu: undefined, không ném", () => {
    expect(bossAbilityElement("mang", "khong_co")).toBe(MONSTER_BY_ID["mang"]!.element);
    expect(bossAbilityElement("mang", 5)).toBe(MONSTER_BY_ID["mang"]!.element);
    for (const k of ["khong_co", "constructor", "__proto__", 7, null, undefined])
      expect(bossAbilityElement(k, "quat_duoi")).toBeUndefined();
  });
  it("BOSS_SFX_VIEW là số dương hợp lý (px)", () => {
    expect(BOSS_SFX_VIEW).toBeGreaterThan(0);
    expect(BOSS_SFX_VIEW).toBeLessThanOrEqual(1000);
  });
});

describe("giáp + gọi quái con của trùm (T4 #873, fx bossArmor / bossSummon)", () => {
  const c = cand("b1");

  it("armorPercent: 0,5 -> 50; kẹp 1..100; hệ số ngoài (0, 1] hoặc hỏng -> null (client không tin fx)", () => {
    expect(armorPercent(0.5)).toBe(50);
    expect(armorPercent(1)).toBe(100);
    expect(armorPercent(0.004)).toBe(1);
    expect(armorPercent(0.333)).toBe(33);
    for (const bad of [
      0,
      -0.2,
      1.01,
      3,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "0.5",
      null,
      undefined,
      {},
    ])
      expect(armorPercent(bad), String(bad)).toBeNull();
  });

  it("onArmor -> armorOf: còn bao lâu + phần còn lại giảm dần; hết giờ thì null; model có chữ phần trăm", () => {
    const t = new BossFxTracker();
    expect(t.armorOf("b1", 1000)).toBeNull();
    t.onArmor("b1", 4000, 0.5, 1000);
    expect(t.armorOf("b1", 1000)).toEqual({ mult: 0.5, leftMs: 4000, frac: 1 });
    expect(t.armorOf("b1", 3000)).toEqual({ mult: 0.5, leftMs: 2000, frac: 0.5 });
    expect(t.armorOf("b1", 4999)?.leftMs).toBe(1);
    expect(t.armorOf("b1", 5000)).toBeNull();
    expect(t.armorOf("khac", 3000)).toBeNull();
    expect(t.modelOf(c, 3000).armor).toEqual({ pct: 50, leftMs: 2000 });
    expect(t.modelOf(c, 5000).armor).toBeNull();
    expect(bossBarText(t.modelOf(c, 3000))).toContain("có giáp (nhận 50 % sát thương)");
    expect(bossBarText(t.modelOf(c, 5000))).not.toContain("giáp");
  });

  it("dựng giáp lại lúc đang có giáp THAY bản cũ (hệ số + thời hạn mới)", () => {
    const t = new BossFxTracker();
    t.onArmor("b1", 4000, 0.5, 1000);
    t.onArmor("b1", 2000, 0.25, 2000);
    expect(t.armorOf("b1", 2500)).toEqual({ mult: 0.25, leftMs: 1500, frac: 0.75 });
    expect(t.armorOf("b1", 4100)).toBeNull(); // hạn mới 4000, không còn hạn cũ 5000
  });

  it("fx hỏng bị bỏ: ms <= 0 / quá trần / không phải số, mult ngoài (0, 1], id sai kiểu; không ném", () => {
    const t = new BossFxTracker();
    t.onArmor("b1", 0, 0.5, 0);
    t.onArmor("b1", -5, 0.5, 0);
    t.onArmor("b1", BOSS_ARMOR_MAX_MS + 1, 0.5, 0);
    t.onArmor("b1", Number.NaN, 0.5, 0);
    t.onArmor("b1", 1000, 0, 0);
    t.onArmor("b1", 1000, 2, 0);
    t.onArmor("b1", 1000, Number.NaN, 0);
    t.onArmor(7 as unknown as string, 1000, 0.5, 0);
    t.onArmor("b1", 1000, 0.5, Number.NaN);
    expect(t.armorOf("b1", 1)).toBeNull();
    t.onArmor("b1", BOSS_ARMOR_MAX_MS, 0.5, 0); // đúng trần thì nhận
    expect(t.armorOf("b1", 1)).not.toBeNull();
    expect(t.armorOf("b1", Number.NaN)).toBeNull();
  });

  it("onSummon: model báo 'N quái con' trong BOSS_SUMMON_NOTE_MS rồi tắt; n lẻ / < 1 / quá lớn / hỏng bị bỏ", () => {
    const t = new BossFxTracker();
    expect(t.modelOf(c, 1000).summonN).toBeNull();
    t.onSummon("b1", 2, 1000);
    expect(t.modelOf(c, 1000).summonN).toBe(2);
    expect(t.modelOf(c, 1000 + BOSS_SUMMON_NOTE_MS - 1).summonN).toBe(2);
    expect(t.modelOf(c, 1000 + BOSS_SUMMON_NOTE_MS).summonN).toBeNull();
    expect(t.modelOf(c, 500).summonN).toBeNull(); // đồng hồ lùi: không báo
    const u = new BossFxTracker();
    for (const bad of [0, -1, 1.5, Number.NaN, 100, Number.POSITIVE_INFINITY])
      u.onSummon("b1", bad, 0);
    u.onSummon("b1", 3, Number.NaN);
    u.onSummon(7 as unknown as string, 3, 0);
    expect(u.modelOf(c, 1).summonN).toBeNull();
  });

  it("forget / clear xoá cả giáp lẫn ghi chú gọi quái con", () => {
    const t = new BossFxTracker();
    t.onArmor("b1", 4000, 0.5, 0);
    t.onSummon("b1", 2, 0);
    t.forget("b1");
    expect(t.armorOf("b1", 1)).toBeNull();
    expect(t.modelOf(c, 1).summonN).toBeNull();
    t.onArmor("b1", 4000, 0.5, 0);
    t.onSummon("b1", 2, 0);
    t.clear();
    expect(t.armorOf("b1", 1)).toBeNull();
    expect(t.modelOf(c, 1).summonN).toBeNull();
  });
});

describe("bossBarText (đọc cho màn hình đọc)", () => {
  it("nêu tên, phần trăm và giai đoạn (chỉ khi có nhiều giai đoạn)", () => {
    const t = new BossFxTracker();
    const m = t.modelOf(cand("a", { hp: 1000 }), 0);
    expect(bossBarText(m)).toBe(`${MONSTER_BY_ID.mang!.name}: 25 % khí huyết, giai đoạn 2 / 2`);
    expect(bossBarText({ ...m, phaseCount: 1 })).toBe(
      `${MONSTER_BY_ID.mang!.name}: 25 % khí huyết`,
    );
  });
});

describe("bossMarkPercents: vạch giai đoạn đúng chỗ khí huyết rơi xuống mốc", () => {
  it("mốc không đối xứng (0,7 / 0,35 -> vạch ở 70 % / 35 % từ trái, KHÔNG phải 30 % / 65 %); kẹp 0..100; bỏ số hỏng", () => {
    expect(bossMarkPercents([0.7, 0.35])).toEqual([70, 35]);
    expect(bossMarkPercents([0.125])).toEqual([12.5]);
    expect(bossMarkPercents([1.5, -1])).toEqual([100, 0]);
    expect(bossMarkPercents([Number.NaN, 0.4, Infinity])).toEqual([40]);
    expect(bossMarkPercents([])).toEqual([]);
  });
});
