// Tung sát thương dùng chung (đánh quái và PK thách đấu): bạo kích + dao động. Thứ tự gọi `Math.random` GIỮ NGUYÊN so với bản
// cũ trong `hitMonster` (bạo kích trước, rồi dao động) để bench có hạt giống không đổi quỹ đạo.
import { rand } from "../world";

export const CRIT_CHANCE = 0.1;
export const CRIT_MULT = 1.8;

/** Sát thương một đòn: `atk * mult` nhân dao động 0.9-1.1 và bạo kích, tối thiểu 1. */
export function rollDamage(atk: number, mult: number): { dmg: number; crit: boolean } {
  const crit = Math.random() < CRIT_CHANCE;
  const dmg = Math.max(1, Math.round(atk * mult * rand(0.9, 1.1) * (crit ? CRIT_MULT : 1)));
  return { dmg, crit };
}
