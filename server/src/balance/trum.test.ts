// Cân bằng trùm trên DỮ LIỆU THẬT (T5 #874): bất biến + hàm đo của `trum.ts`. Dữ liệu thật phải sạch; mỗi luật có một trùm GIẢ chứng minh nó đỏ khi bị phá.
import { describe, expect, it } from "vitest";
import { BOSSES, MONSTER_BY_ID, bossViolations, type BossDef } from "@tien-gioi/shared";
import {
  ASSUME_BOSS,
  BOSS_PLAYER_STEP,
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

/**
 * Hạn tường minh cho ba ca chạy mô phỏng trên dữ liệu THẬT (#1215). Đo 22/11 trên máy dev: 0,65 / 0,76 / 1,6 giây (hạn mặc định 15 giây của `vitest.config.ts`, nên dư ~9 lần); số ca
 * và số bầy tăng theo dữ liệu D / E / G, còn CI chậm 2-3 lần và cả bộ chạy song song nên ca nặng nhất có thể phình lên vài lần. Hạn dài chỉ làm test CHẬM-NHƯNG-ĐÚNG khỏi đỏ,
 * không che lỗi: kết quả sai vẫn đỏ ngay (khẳng định, không phải thời gian).
 */
const DATA_TEST_TIMEOUT_MS = 60_000;

describe("cân bằng trùm trên dữ liệu THẬT (BOSSES, T5 #874)", () => {
  it(
    "dữ liệu qua `bossViolations` (tiền đề) và qua `bossBalanceViolations` (mọi đòn <= 55% khí huyết, bot né hoàn hảo không bị trúng)",
    () => {
      expect(bossViolations()).toEqual([]);
      expect(bossBalanceViolations()).toEqual([]);
    },
    DATA_TEST_TIMEOUT_MS,
  );

  it(
    "mỗi trùm: có bậc đúng bậc, có chiêu sát thương, bot đứng yên bị trúng (đối chứng) còn bot né thì không",
    () => {
      for (const def of BOSSES) {
        const st = bossStep(def);
        expect(st.step, def.kind).toBe(
          BOSS_PLAYER_STEP[def.kind] ?? MONSTER_BY_ID[def.kind]!.level,
        );
        expect(hitFractions(def).length, def.kind).toBeGreaterThan(0);
        const d = dodgeSummary(def);
        expect(d.casts, def.kind).toBeGreaterThan(0);
        expect(d.dodgeHits, def.kind).toBe(0);
        expect(d.standHits, def.kind).toBeGreaterThan(0);
      }
    },
    DATA_TEST_TIMEOUT_MS,
  );

  it(
    "báo cáo sinh từ dữ liệu thật: nêu từng trùm, đủ cỡ đội, không NaN / Infinity / undefined, không dòng VI PHẠM",
    () => {
      const md = renderBossBalance();
      for (const def of BOSSES) expect(md).toContain(MONSTER_BY_ID[def.kind]!.name);
      for (const n of ASSUME_BOSS.parties) expect(md).toContain(n === 1 ? "1 người" : `${n} người`);
      expect(md).not.toMatch(/NaN|Infinity|undefined/);
      expect(md).not.toContain("VI PHẠM");
      expect(md).toContain("**Không vi phạm bất biến nào**");
    },
    DATA_TEST_TIMEOUT_MS,
  );
});

describe("hàm đo", () => {
  it("bậc đúng bậc: Xích Mãng = Trúc Cơ cuối (12), Hắc Giao = Kim Đan cuối (15), Thiên Hàn Vương = Nguyên Anh cuối (18), Yêu Vương = ngưỡng vào bí cảnh; loài ngoài bảng lấy `level`", () => {
    expect(bossStep(MANG).step).toBe(12);
    expect(BOSS_PLAYER_STEP.hac_giao).toBe(15);
    expect(BOSS_PLAYER_STEP.thien_han_vuong).toBe(18);
    expect(BOSS_PLAYER_STEP.yeu_vuong).toBe(9);
    const other = { ...MANG, kind: "doc_thiem" } as BossDef; // ngoài bảng: lấy level của loài
    expect(bossStep(other).step).toBe(MONSTER_BY_ID.doc_thiem!.level);
  });

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
    const a = fightBossMoves(MANG, 4, 3);
    const b = fightBossMoves(MANG, 4, 3);
    expect(b).toEqual(a);
    expect(a.killed).toBe(true);
    expect(a.casts).toBeGreaterThanOrEqual(0);
    const two = summarizeBossFights(MANG, 2, 4);
    const four = summarizeBossFights(MANG, 4, 4);
    expect(two.simSeconds).not.toBeNull();
    expect(four.simSeconds!).toBeLessThanOrEqual(two.simSeconds!);
    expect(two.realMinutes!).toBeGreaterThan(two.simSeconds! / 60); // quy ra thời gian thật chia cho uptime < 1
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

  it("ranh giới 55%: ~49% sạch, ~56% vi phạm (khí huyết đúng bậc của Xích Mãng 1.147, công 140)", () => {
    // 140 x 4,0 = 560 = 48,8%; 140 x 4,6 = 644 = 56,1%
    expect(
      bossBalanceViolations([fakeBoss({ dmgMult: 4.0 })]).some((x) => x.includes("vong")),
    ).toBe(false);
    expect(
      bossBalanceViolations([fakeBoss({ dmgMult: 4.6 })]).some((x) => x.includes("vong")),
    ).toBe(true);
  });

  it("hệ số công LỚN NHẤT của các giai đoạn dùng chiêu được tính (giai đoạn sau nặng hơn thì chiêu bị bắt)", () => {
    const d = fakeBoss({ dmgMult: 3.5, atkMult: 1 }); // giai đoạn đầu 140 x 3,5 = 490 (43%): sạch
    d.phases.push({
      id: "p1",
      fromHp: 0.5,
      speedMult: 1,
      atkMult: 1.4, // giai đoạn sau 140 x 1,4 x 3,5 = 686 (60%): vi phạm
      cdMult: 1,
      castGapMs: 800,
      abilities: ["vong"],
    });
    const h = hitFractions(d)[0]!;
    expect(h.phase).toBe("p1");
    expect(h.dmg).toBe(Math.round(140 * 1.4 * 3.5));
    expect(bossBalanceViolations([d]).some((x) => x.includes("giai đoạn p1"))).toBe(true);
  });

  it("vùng quá rộng so với báo trước (bot né hoàn hảo KHÔNG thoát kịp) bị bắt, dù đòn nhẹ", () => {
    // r 400 px / 150 px/giây = 2,7 s > báo trước 0,9 s - phản xạ 0,4 s: né hoàn hảo cũng trúng
    const v = bossBalanceViolations([fakeBoss({ r: 400, telegraphMs: 900, dmgMult: 0.3 })]);
    expect(v.some((x) => x.includes("bot né hoàn hảo bị trúng"))).toBe(true);
  });
});
