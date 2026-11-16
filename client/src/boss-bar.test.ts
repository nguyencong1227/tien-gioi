// Thanh máu trùm (mục 42, T4 #873): chọn trùm hiện thanh, mô hình thanh, mốc giai đoạn, tên chiêu, cuồng nộ.
import { describe, expect, it } from "vitest";
import { BOSS_BY_KIND, BOSS_PHASE_ROAR_MS, MONSTER_BY_ID } from "@tien-gioi/shared";
import {
  BOSS_BAR_RANGE,
  BOSS_CAST_LINGER_MS,
  BOSS_ENRAGE_FLASH_MS,
  BossFxTracker,
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
