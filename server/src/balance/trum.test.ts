// Cân bằng trùm trên DỮ LIỆU THẬT (T5 #874): bất biến + hàm đo của `trum.ts`. Dữ liệu thật phải sạch; mỗi luật có một trùm GIẢ chứng minh nó đỏ khi bị phá.
import { describe, expect, it } from "vitest";
import { BOSSES, MONSTER_BY_ID, bossViolations, type BossDef } from "@tien-gioi/shared";
import {
  ASSUME_BOSS,
  bossBalanceViolations,
  bossStep,
  dodgeSummary,
  fightBossMoves,
  hitFractions,
  renderBossBalance,
  summarizeBossFights,
} from "./trum";

const MANG = BOSSES.find((b) => b.kind === "mang")!;

/** Trùm giả: một chiêu `circleAt` (vòng tròn rơi vào người), số liệu chỉnh được. */
function fakeBoss(over: {
  dmgMult?: number;
  r?: number;
  telegraphMs?: number;
  atkMult?: number;
}): BossDef {
  return {
    kind: "mang",
    maxAdds: 0,
    abilities: [
      {
        id: "vong",
        name: "Vòng thử",
        shape: { t: "circleAt", at: "target", r: over.r ?? 60 },
        telegraphMs: over.telegraphMs ?? 1000,
        recoverMs: 600,
        cooldownMs: 2500,
        weight: 1,
        dmgMult: over.dmgMult ?? 1,
      },
    ],
    phases: [
      {
        id: "p0",
        fromHp: 1,
        speedMult: 1,
        atkMult: over.atkMult ?? 1,
        cdMult: 1,
        castGapMs: 800,
        abilities: ["vong"],
      },
    ],
  };
}

describe("cân bằng trùm trên dữ liệu THẬT (BOSSES, T5 #874)", () => {
  it("dữ liệu qua `bossViolations` (tiền đề) và qua `bossBalanceViolations` (mọi đòn <= 55% khí huyết, bot né hoàn hảo không bị trúng)", () => {
    expect(bossViolations()).toEqual([]);
    expect(bossBalanceViolations()).toEqual([]);
  });

  it("mỗi trùm: có bậc đúng bậc, có chiêu sát thương, bot đứng yên bị trúng (đối chứng) còn bot né thì không", () => {
    for (const def of BOSSES) {
      const st = bossStep(def);
      expect(st.step, def.kind).toBe(MONSTER_BY_ID[def.kind]!.level);
      expect(hitFractions(def).length, def.kind).toBeGreaterThan(0);
      const d = dodgeSummary(def);
      expect(d.casts, def.kind).toBeGreaterThan(0);
      expect(d.dodgeHits, def.kind).toBe(0);
      expect(d.standHits, def.kind).toBeGreaterThan(0);
    }
  });

  it("báo cáo sinh từ dữ liệu thật: nêu từng trùm, đủ cỡ đội, không NaN / Infinity / undefined, không dòng VI PHẠM", () => {
    const md = renderBossBalance();
    for (const def of BOSSES) expect(md).toContain(MONSTER_BY_ID[def.kind]!.name);
    for (const n of ASSUME_BOSS.parties) expect(md).toContain(n === 1 ? "1 người" : `${n} người`);
    expect(md).not.toMatch(/NaN|Infinity|undefined/);
    expect(md).not.toContain("VI PHẠM");
    expect(md).toContain("**Không vi phạm bất biến nào**");
  });
});

describe("hàm đo", () => {
  it("hitFractions: đúng công thức `round(atk x hệ số giai đoạn x dmgMult)` / khí huyết tối đa; lấy hệ số công LỚN NHẤT (kể cả cuồng nộ)", () => {
    const atk = MONSTER_BY_ID.mang!.atk;
    const plain = hitFractions(fakeBoss({ dmgMult: 1, atkMult: 1 }))[0]!;
    expect(plain.dmg).toBe(Math.round(atk));
    const x2 = hitFractions(fakeBoss({ dmgMult: 1, atkMult: 2 }))[0]!;
    expect(x2.dmg).toBe(Math.round(atk * 2));
    expect(x2.fraction).toBeCloseTo(2 * plain.fraction, 5);
    const enr = fakeBoss({ dmgMult: 1, atkMult: 1 });
    enr.enrage = { afterMs: 60_000, atkMult: 1.5, speedMult: 1, cdMult: 1 };
    expect(hitFractions(enr)[0]!.dmg).toBe(Math.round(atk * 1.5));
  });

  it("chiêu không sát thương (dmgMult 0: triệu hồi / giáp) không tính vào tỉ lệ mỗi đòn", () => {
    const d = fakeBoss({ dmgMult: 0 });
    expect(hitFractions(d)).toEqual([]);
  });

  it("fightBossMoves: tất định theo hạt giống; đông người không hạ chậm hơn; có đếm chiêu trùm đã vận", () => {
    const a = fightBossMoves(MANG, 1, 3);
    const b = fightBossMoves(MANG, 1, 3);
    expect(b).toEqual(a);
    expect(a.killed).toBe(true);
    expect(a.casts).toBeGreaterThanOrEqual(0);
    const solo = summarizeBossFights(MANG, 1, 4);
    const four = summarizeBossFights(MANG, 4, 4);
    expect(solo.simSeconds).not.toBeNull();
    expect(four.simSeconds!).toBeLessThanOrEqual(solo.simSeconds!);
    expect(solo.realMinutes!).toBeGreaterThan(solo.simSeconds! / 60); // quy ra thời gian thật chia cho uptime < 1
  });
});

describe("mỗi luật ĐỎ khi dữ liệu bị phá (trùm giả)", () => {
  it("một đòn quá nặng (> 55% khí huyết tối đa) bị bắt", () => {
    const v = bossBalanceViolations([fakeBoss({ dmgMult: 20 })]);
    expect(v.some((x) => x.includes("vong") && x.includes("khí huyết tối đa"))).toBe(true);
  });

  it("đòn vừa phải thì sạch", () => {
    expect(bossBalanceViolations([fakeBoss({ dmgMult: 0.5 })])).toEqual([]);
  });

  it("vùng quá rộng so với báo trước (bot né hoàn hảo KHÔNG thoát kịp) bị bắt, dù đòn nhẹ", () => {
    // r 400 px / 150 px/giây = 2,7 s > báo trước 0,9 s - phản xạ 0,4 s: né hoàn hảo cũng trúng
    const v = bossBalanceViolations([fakeBoss({ r: 400, telegraphMs: 900, dmgMult: 0.3 })]);
    expect(v.some((x) => x.includes("bot né hoàn hảo bị trúng"))).toBe(true);
  });
});
