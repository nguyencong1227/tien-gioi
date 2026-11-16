// Hợp đồng trùm nhiều chiêu (mục 42, T1): hằng số công bằng, `bossPhaseOf` (hàm thuần đơn điệu), `bossViolations` (mỗi luật có ca đỏ), `fx` mới.
import { describe, expect, it } from "vitest";
import {
  BOSSES,
  BOSS_ADDS_CAP,
  BOSS_BY_KIND,
  BOSS_COND_RADIUS,
  BOSS_FIRST_CAST_DELAY_MS,
  BOSS_HIT_GRACE_PX,
  BOSS_MIN_CAST_GAP_MS,
  BOSS_MIN_TELEGRAPH_MS,
  BOSS_PHASE_ROAR_MS,
  MONSTER_BY_ID,
  PLAYER_RADIUS,
  bossDefOf,
  bossPhaseMarks,
  bossPhaseOf,
  bossShapeDamages,
  bossViolations,
  type BossAbility,
  type BossDef,
  type BossShape,
  type FxMsg,
} from "./index";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const base = (): BossDef => clone(BOSSES[0]!);
/** Sửa một bản sao của trùm mẫu rồi trả lỗi của riêng nó. */
const probe = (f: (d: BossDef) => void): string => {
  const d = base();
  f(d);
  return bossViolations([d]).join(" | ");
};

describe("hằng số công bằng (mục 2 THIET_KE_TRUM.md)", () => {
  it("báo trước >= 0,8 giây, nghỉ giữa các lần vận >= 0,6 giây, lần vận đầu >= 1,2 giây; mức nghiêng về người chơi nhỏ hơn bán kính người chơi", () => {
    expect(BOSS_MIN_TELEGRAPH_MS).toBeGreaterThanOrEqual(800);
    expect(BOSS_MIN_CAST_GAP_MS).toBeGreaterThanOrEqual(600);
    expect(BOSS_FIRST_CAST_DELAY_MS).toBeGreaterThanOrEqual(1200);
    expect(BOSS_PHASE_ROAR_MS).toBeGreaterThan(0);
    expect(BOSS_HIT_GRACE_PX).toBeGreaterThan(0);
    expect(BOSS_HIT_GRACE_PX).toBeLessThan(PLAYER_RADIUS);
    expect(BOSS_ADDS_CAP).toBeGreaterThanOrEqual(1);
    expect(BOSS_COND_RADIUS).toBeGreaterThan(0);
  });
});

describe("bảng trùm khung", () => {
  it("sạch với bossViolations; trùm mẫu có thật và là trùm; tra bằng hasOwnProperty", () => {
    expect(bossViolations()).toEqual([]);
    for (const b of BOSSES) {
      expect(MONSTER_BY_ID[b.kind]?.boss).toBe(true);
      expect(bossDefOf(b.kind)).toBe(b);
      expect(BOSS_BY_KIND[b.kind]).toBe(b);
    }
    for (const bad of [undefined, null, 5, "constructor", "__proto__", "toString", "khong_co"]) {
      expect(bossDefOf(bad)).toBeUndefined();
    }
  });

  it("mọi chiêu có sát thương trong bảng thật sự báo trước >= BOSS_MIN_TELEGRAPH_MS (bất biến công bằng cốt lõi)", () => {
    for (const b of BOSSES)
      for (const a of b.abilities)
        if (bossShapeDamages(a.shape))
          expect(a.telegraphMs).toBeGreaterThanOrEqual(BOSS_MIN_TELEGRAPH_MS);
  });
});

describe("bossShapeDamages", () => {
  it("chỉ triệu hồi và giáp là không sát thương; mọi hình khác có sát thương", () => {
    const shapes: BossShape[] = [
      { t: "circleAt", at: "target", r: 60 },
      { t: "ring", r0: 40, r: 120 },
      { t: "cone", r: 100, arc: 1 },
      { t: "line", len: 200, w: 60 },
      { t: "charge", len: 200, w: 60 },
      { t: "rain", r: 50, count: 3, spreadPx: 100, gapMs: 500 },
      { t: "pull", r: 150, pullPx: 80, blastR: 60 },
      { t: "pool", r: 60, ttlMs: 4000, tickMs: 500 },
      { t: "blink", landR: 80 },
    ];
    for (const s of shapes) expect(bossShapeDamages(s)).toBe(true);
    expect(bossShapeDamages({ t: "summon", kind: "tho", count: 1 })).toBe(false);
    expect(bossShapeDamages({ t: "buff", dmgTakenMult: 0.6, ms: 4000 })).toBe(false);
  });
});

describe("bossPhaseOf / bossPhaseMarks (hàm thuần đơn điệu)", () => {
  const d = base(); // phases: fromHp 1 và 0.5

  it("ở mốc: đúng 0,5 vẫn là giai đoạn 0 ('dưới 50%' là NHỎ HƠN); ngay dưới thì giai đoạn 1; đầy máu và trên mức đầy là 0; hết máu là giai đoạn cuối", () => {
    expect(bossPhaseOf(d, 1)).toBe(0);
    expect(bossPhaseOf(d, 0.9999)).toBe(0);
    expect(bossPhaseOf(d, 0.5)).toBe(0);
    expect(bossPhaseOf(d, 0.4999)).toBe(1);
    expect(bossPhaseOf(d, 0.01)).toBe(1);
    expect(bossPhaseOf(d, 0)).toBe(1);
    expect(bossPhaseOf(d, -3)).toBe(1);
    expect(bossPhaseOf(d, 5)).toBe(0);
  });

  it("số không hợp lệ coi là đầy máu (giai đoạn 0): NaN, chuỗi, null, undefined, đối tượng", () => {
    for (const bad of [Number.NaN, "0.1", null, undefined, {}, []])
      expect(bossPhaseOf(d, bad)).toBe(0);
  });

  it("ĐƠN ĐIỆU: khí huyết giảm thì giai đoạn không bao giờ lùi (ba giai đoạn tổng hợp, quét 0..1)", () => {
    const three: BossDef = clone(d);
    three.phases = [
      { ...d.phases[0]!, id: "a", fromHp: 1 },
      { ...d.phases[1]!, id: "b", fromHp: 0.7 },
      { ...d.phases[1]!, id: "c", fromHp: 0.35 },
    ];
    let prev = 0;
    for (let i = 1000; i >= 0; i--) {
      const p = bossPhaseOf(three, i / 1000);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(bossPhaseOf(three, 0.8)).toBe(0);
    expect(bossPhaseOf(three, 0.6)).toBe(1);
    expect(bossPhaseOf(three, 0.2)).toBe(2);
    expect(bossPhaseMarks(three)).toEqual([0.7, 0.35]);
    expect(bossPhaseMarks(d)).toEqual([0.5]);
  });
});

describe("bossViolations bắt đúng từng luật", () => {
  it("trùm: loài lạ, không phải trùm, trùng, maxAdds ngoài khoảng", () => {
    expect(probe((x) => (x.kind = "khong_co"))).toMatch(/không có loài quái/);
    expect(probe((x) => (x.kind = "tho"))).toMatch(/không phải trùm/);
    expect(probe((x) => (x.kind = "constructor"))).toMatch(/không có loài quái/);
    expect(bossViolations([base(), base()]).join()).toMatch(/trùm trùng/);
    expect(probe((x) => (x.maxAdds = BOSS_ADDS_CAP + 1))).toMatch(/maxAdds/);
    expect(probe((x) => (x.maxAdds = -1))).toMatch(/maxAdds/);
  });

  it("CÔNG BẰNG: đòn sát thương báo trước < 800 ms bị bắt; chiêu không sát thương được phép báo trước ngắn", () => {
    expect(probe((x) => (x.abilities[0]!.telegraphMs = BOSS_MIN_TELEGRAPH_MS - 1))).toMatch(
      /báo trước/,
    );
    expect(probe((x) => (x.abilities[0]!.telegraphMs = 0))).toMatch(/báo trước/);
    // giáp / triệu hồi không sát thương: telegraphMs 0 hợp lệ
    expect(
      probe((x) => {
        const s = x.abilities.find((a) => a.shape.t === "summon")!;
        s.telegraphMs = 0;
        s.cooldownMs = 5000;
      }),
    ).toBe("");
    expect(probe((x) => (x.abilities[0]!.telegraphMs = Number.NaN))).toMatch(/telegraphMs/);
  });

  it("chiêu: id sai dạng / trùng, thiếu tên, cooldown < báo trước + thở, trọng số 0, dmgMult 0 ở chiêu sát thương, trạng thái lạ", () => {
    expect(probe((x) => (x.abilities[0]!.id = "Sai Dang"))).toMatch(/id chiêu sai dạng/);
    expect(probe((x) => (x.abilities[1]!.id = x.abilities[0]!.id))).toMatch(/trùng id chiêu/);
    expect(probe((x) => (x.abilities[0]!.name = "  "))).toMatch(/thiếu tên/);
    expect(probe((x) => (x.abilities[0]!.cooldownMs = 1000))).toMatch(/cooldownMs/);
    expect(probe((x) => (x.abilities[0]!.weight = 0))).toMatch(/weight/);
    expect(probe((x) => (x.abilities[0]!.dmgMult = 0))).toMatch(/dmgMult/);
    expect(
      probe(
        (x) =>
          (x.abilities[0]!.effect = {
            status: "khong_co" as never,
            ms: 1000,
            ratio: 0.1,
            chance: 1,
          }),
      ),
    ).toMatch(/không có thật/);
    expect(
      probe(
        (x) => (x.abilities[0]!.effect = { status: "poison", ms: 4000, ratio: 0.08, chance: 1 }),
      ),
    ).toBe("");
  });

  it("hình chiêu: vành khuyên r0 >= r, nón arc quá lớn, mưa 0 vòng / quá nhiều, triệu hồi quái lạ / quá số lượng, giáp > 1", () => {
    const withShape = (s: BossShape) =>
      probe((x) => {
        x.abilities[0]!.shape = s;
      });
    expect(withShape({ t: "ring", r0: 100, r: 100 })).toMatch(/vành khuyên/);
    expect(withShape({ t: "ring", r0: 40, r: 120 })).toBe("");
    expect(withShape({ t: "cone", r: 100, arc: 7 })).toMatch(/nón/);
    expect(withShape({ t: "rain", r: 50, count: 0, spreadPx: 100, gapMs: 500 })).toMatch(/mưa/);
    expect(withShape({ t: "rain", r: 50, count: 13, spreadPx: 100, gapMs: 500 })).toMatch(/mưa/);
    expect(withShape({ t: "line", len: 0, w: 60 })).toMatch(/len/);
    expect(withShape({ t: "summon", kind: "khong_co", count: 1 })).toMatch(/không có thật/);
    expect(withShape({ t: "summon", kind: "tho", count: 0 })).toMatch(/không có thật/);
    expect(withShape({ t: "buff", dmgTakenMult: 1.5, ms: 4000 })).toMatch(/giáp/);
    expect(withShape({ t: "circleAt", at: "farthest", r: Number.NaN })).toMatch(/bán kính/);
  });

  it("giai đoạn: đầu phải fromHp = 1, các sau giảm nghiêm ngặt trong (0,1), hệ số > 0, castGapMs >= 600, chiêu có trong bảng, không rỗng", () => {
    expect(probe((x) => (x.phases[0]!.fromHp = 0.9))).toMatch(/giai đoạn đầu/);
    expect(probe((x) => (x.phases[1]!.fromHp = 1))).toMatch(/giảm nghiêm ngặt/);
    expect(probe((x) => (x.phases[1]!.fromHp = 0))).toMatch(/giảm nghiêm ngặt/);
    expect(
      probe((x) => {
        x.phases.push({ ...x.phases[1]!, id: "ba", fromHp: 0.6 });
      }),
    ).toMatch(/giảm nghiêm ngặt/);
    expect(probe((x) => (x.phases[0]!.cdMult = 0))).toMatch(/hệ số/);
    expect(probe((x) => (x.phases[0]!.castGapMs = BOSS_MIN_CAST_GAP_MS - 1))).toMatch(/castGapMs/);
    expect(probe((x) => (x.phases[0]!.abilities = ["khong_co"]))).toMatch(/không có trong bảng/);
    expect(probe((x) => (x.phases[0]!.abilities = []))).toMatch(/không có chiêu nào/);
    expect(probe((x) => (x.phases = []))).toMatch(/thiếu giai đoạn/);
  });

  it("triệu hồi có trần: onEnter hoặc chiêu triệu hồi vượt maxAdds bị bắt", () => {
    expect(
      probe((x) => {
        x.maxAdds = 1;
      }),
    ).toMatch(/maxAdds/);
    expect(
      probe((x) => {
        x.phases[1]!.onEnter = [{ t: "summon", kind: "tho", count: 3 }];
      }),
    ).toMatch(/maxAdds/);
  });

  it("cuồng nộ: afterMs <= 0 hoặc hệ số <= 0 bị bắt; hợp lệ thì sạch", () => {
    expect(
      probe((x) => (x.enrage = { afterMs: 300_000, atkMult: 1.5, speedMult: 1.2, cdMult: 0.7 })),
    ).toBe("");
    expect(
      probe((x) => (x.enrage = { afterMs: 0, atkMult: 1.5, speedMult: 1.2, cdMult: 0.7 })),
    ).toMatch(/afterMs/);
    expect(
      probe((x) => (x.enrage = { afterMs: 1000, atkMult: 0, speedMult: 1.2, cdMult: 0.7 })),
    ).toMatch(/cuồng nộ/);
  });
});

describe("fx mới của trùm (client cũ bỏ qua fx lạ; warn có r0 tuỳ chọn)", () => {
  it("bossCast / bossPhase / bossEnrage mang (x, y) như mọi fx để sendNear chỉ gửi cho người ở gần; warn r0 tuỳ chọn; đi qua JSON không đổi", () => {
    const fx: FxMsg[] = [
      { kind: "bossCast", by: "m1", x: 10, y: 20, ability: "quat_duoi", ms: 900 },
      { kind: "bossPhase", by: "m1", x: 10, y: 20, phase: 1 },
      { kind: "bossEnrage", by: "m1", x: 10, y: 20 },
      { kind: "warn", shape: "circle", x: 1, y: 2, r: 120, r0: 40, ms: 900 },
      { kind: "warn", shape: "circle", x: 1, y: 2, r: 120, ms: 900 },
    ];
    for (const m of fx) {
      expect(typeof m.x).toBe("number");
      expect(typeof m.y).toBe("number");
      expect(JSON.parse(JSON.stringify(m))).toEqual(m);
    }
    const ab: BossAbility = BOSSES[0]!.abilities[0]!;
    expect(ab.telegraphMs).toBeGreaterThanOrEqual(BOSS_MIN_TELEGRAPH_MS);
  });
});
