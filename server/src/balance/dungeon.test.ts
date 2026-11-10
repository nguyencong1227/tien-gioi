// Cân bằng Bí cảnh Linh Hư (M3 bước 4c-2): số liệu trong shared/ phải đạt mục tiêu thiết kế (docs/THIET_KE_BI_CANH.md mục 6).
// Sửa số liệu trùm / thưởng mà test này đỏ thì xem lại docs/CAN_BANG.md mục "Bí cảnh" (chạy `npm run can-bang -w server`).
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID } from "@tien-gioi/shared";
import {
  ASSUME_DUNGEON,
  LINH_HU,
  dungeonValue,
  fightBoss,
  realmTierOfStep,
  runMinutes,
  summarizeFights,
} from "./dungeon";

const { realm, tier } = realmTierOfStep(LINH_HU.minStep);
const RUNS = 12;
const fight = (party: number, o: Partial<Parameters<typeof fightBoss>[2]> = {}) =>
  summarizeFights(LINH_HU, party, { realm, tier, ...o }, RUNS);
const limitMin = LINH_HU.timeLimitMs / 60_000;

describe("ngưỡng vào bí cảnh", () => {
  it("`minStep` là Luyện Khí tầng 9; cả đội ở đúng ngưỡng (ca khó nhất mà luật cho phép vào)", () => {
    expect({ realm, tier }).toEqual({ realm: 1, tier: 8 });
  });
});

describe("trận đánh trùm (mô phỏng bằng mã server thật, ca khó: đứng yên, không né)", () => {
  it("một người không hạ nổi trùm và chết", () => {
    const s = fight(1);
    expect(s.winRate).toBe(0);
    expect(s.deathsPerRun).toBeGreaterThanOrEqual(1);
  });

  it("đội 2 người ở ngưỡng không kịp trong giới hạn thời gian (kể cả khi hạ được trùm về máu)", () => {
    const s = fight(2);
    if (s.simSeconds !== null)
      expect(runMinutes(LINH_HU, 2, realm, tier, s.simSeconds)).toBeGreaterThan(limitMin);
    else expect(s.winRate).toBe(0);
  });

  it("đội 3 người ở ngưỡng: thắng chắc, không ai chết, trùm ~5-8 phút thật, cả lượt trong 80% giới hạn", () => {
    const s = fight(3);
    expect(s.winRate).toBeGreaterThanOrEqual(0.95);
    expect(s.deathsPerRun).toBeLessThanOrEqual(0.2); // chết = mất kiếp: ca khó nhất cũng gần như không ai chết
    expect(s.realMinutes!).toBeGreaterThanOrEqual(5);
    expect(s.realMinutes!).toBeLessThanOrEqual(8);
    expect(runMinutes(LINH_HU, 3, realm, tier, s.simSeconds!)).toBeLessThanOrEqual(limitMin * 0.8);
  });

  it("đội 4 người: thắng chắc, nhanh hơn đội 3", () => {
    const s4 = fight(4);
    const s3 = fight(3);
    expect(s4.winRate).toBe(1);
    expect(s4.deathsPerRun).toBeLessThanOrEqual(0.2);
    expect(s4.simSeconds!).toBeLessThan(s3.simSeconds!);
  });

  it("mô phỏng phản ứng với số liệu: trùm đánh đau hơn (atk 40) thì đội 3 thua; mang nhiều đan hơn thì đỡ hơn", () => {
    expect(fight(3, { bossAtk: 40 }).winRate).toBeLessThan(0.5);
    const base = fight(3, { bossAtk: 22 });
    const more = fight(3, { bossAtk: 22, potions: 20 });
    expect(more.deathsPerRun).toBeLessThan(base.deathsPerRun);
  });

  it("kết quả cố định theo hạt giống; mô phỏng trả lại `Math.random` và số liệu trùm như cũ", () => {
    const hp = MONSTER_BY_ID[LINH_HU.boss].hp;
    const atk = MONSTER_BY_ID[LINH_HU.boss].atk;
    const random = Math.random;
    const a = fightBoss(LINH_HU, 3, { realm, tier, seed: 7 });
    const b = fightBoss(LINH_HU, 3, { realm, tier, seed: 7 });
    expect(a).toEqual(b);
    expect(Math.random).toBe(random);
    expect(MONSTER_BY_ID[LINH_HU.boss].hp).toBe(hp);
    expect(MONSTER_BY_ID[LINH_HU.boss].atk).toBe(atk);
    // quét số liệu (ghi đè) cũng được trả lại
    fightBoss(LINH_HU, 2, { realm, tier, seed: 1, bossHp: 5000, bossAtk: 1 });
    expect(MONSTER_BY_ID[LINH_HU.boss].hp).toBe(hp);
  });
});

describe("một lượt thưởng đáng bao nhiêu phút săn quái", () => {
  it("đội 3 ở ngưỡng: Linh thạch ròng và tu vi mỗi người đều ~15-20 phút săn quái tốt nhất cùng bậc", () => {
    const v = dungeonValue(LINH_HU, 3, realm, tier);
    expect(v.coinMinutes).toBeGreaterThanOrEqual(15);
    expect(v.coinMinutes).toBeLessThanOrEqual(20);
    expect(v.expMinutes).toBeGreaterThanOrEqual(15);
    expect(v.expMinutes).toBeLessThanOrEqual(20);
  });

  it("đội đông hơn chia ít hơn: đội 4 mỗi người được ít Linh thạch và tu vi hơn đội 3 (cùng một lượt thưởng cố định)", () => {
    const v3 = dungeonValue(LINH_HU, 3, realm, tier);
    const v4 = dungeonValue(LINH_HU, 4, realm, tier);
    expect(v4.exp).toBeLessThan(v3.exp);
    expect(v4.coinNet).toBeLessThan(v3.coinNet);
  });

  it("giả định hợp lý: giữ trong khoảng đã xem xét", () => {
    expect(ASSUME_DUNGEON.bossUptime).toBeGreaterThan(0.3);
    expect(ASSUME_DUNGEON.bossUptime).toBeLessThanOrEqual(1);
    expect(ASSUME_DUNGEON.potions).toBeGreaterThan(0);
  });
});
