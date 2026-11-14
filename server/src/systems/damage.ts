// Tung sát thương dùng chung (đánh quái và PK thách đấu): bạo kích + dao động. Thứ tự gọi `Math.random` GIỮ NGUYÊN so với bản
// cũ trong `hitMonster` (bạo kích trước, rồi dao động) để bench có hạt giống không đổi quỹ đạo.
import { rand } from "../world";

export const CRIT_CHANCE = 0.1;
export const CRIT_MULT = 1.8;

/**
 * Sát thương một đòn: `atk * mult` nhân dao động 0.9-1.1 và bạo kích, tối thiểu 1. `critPct` (điểm %, mặc định 0) là bạo kích CỘNG THÊM từ trang bị (`Stats.crit`, M7.4,
 * đã kẹp theo `STAT_CAPS.crit`; ô chưa mở không tính): xác suất = `CRIT_CHANCE` + `critPct / 100` (tối đa 1). Vẫn đúng MỘT lần gọi `Math.random` cho bạo kích rồi mới tới
 * dao động như cũ: `critPct` = 0 (không trang bị bạo kích) cho cùng chuỗi ngẫu nhiên và cùng kết quả với bản trước (bench có hạt giống không đổi).
 */
export function rollDamage(atk: number, mult: number, critPct = 0): { dmg: number; crit: boolean } {
  const bonus = Number.isFinite(critPct) && critPct > 0 ? critPct / 100 : 0;
  const crit = Math.random() < Math.min(1, CRIT_CHANCE + bonus);
  const dmg = Math.max(1, Math.round(atk * mult * rand(0.9, 1.1) * (crit ? CRIT_MULT : 1)));
  return { dmg, crit };
}
