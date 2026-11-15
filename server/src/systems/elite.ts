// Tinh anh (M7.3, #504, docs/PHAN_CONG_M7.md mục 6): một con quái thường hiếm khi sinh ra mạnh hơn hẳn, đánh được thì thưởng nhiều.
// Luật chốt (server quyết định; client chỉ đọc `Monster.elite` để vẽ viền / sao / tiền tố tên, không tin client):
//  - Chỉ QUÁI THƯỜNG hiếu chiến (không trùm, không quái hiền `aggro` 0 như Linh Thố) và CHỈ ở bản đồ thường (phòng bí cảnh giữ nguyên số liệu đã cân bằng).
//  - Mỗi lần sinh quái đủ điều kiện có xác suất `ELITE_CHANCE`; đồng thời không quá `ELITE_MAX` tinh anh trong một bản đồ.
//  - Số liệu nhân từ loài gốc: khí huyết x`ELITE_HP_MULT`, công x`ELITE_ATK_MULT`, tu vi x`ELITE_EXP_MULT`; mọi hệ thống khác đọc `mc.def` (bản nhân) nên đòn lao / đập
//    đất / đạn / độc dùng đúng công mới, `id` giữ nguyên nên bảng rơi đồ, nhiệm vụ, bản đồ chỉ số loài vẫn theo loài gốc.
//  - Rơi thêm: tung bảng rơi đồ thêm MỘT lần và tiền rơi x`ELITE_COIN_MULT`.
//  - Đặt MỘT lần lúc sinh (`Monster.elite` = 1, không đổi giữa chừng) nên không tốn băng thông mỗi tick.
import type { MonsterKind } from "@tien-gioi/shared";
import type { World } from "../world";

/** Xác suất một con quái đủ điều kiện sinh ra là tinh anh. */
export const ELITE_CHANCE = 0.04;
/** Số tinh anh tối đa cùng lúc trong một bản đồ (một phòng). */
export const ELITE_MAX = 3;
export const ELITE_HP_MULT = 2.5;
export const ELITE_ATK_MULT = 1.5;
export const ELITE_EXP_MULT = 2;
/** Tiền rơi của tinh anh nhân với hệ số này (đồ rơi: tung thêm một lần bảng rơi). */
export const ELITE_COIN_MULT = 2;

/** Loài nào có thể sinh ra tinh anh: quái thường hiếu chiến (không trùm, không quái hiền). */
export function canBeElite(def: MonsterKind): boolean {
  return !def.boss && def.aggro > 0;
}

const eliteDefs = new WeakMap<MonsterKind, MonsterKind>();

/**
 * Số liệu của tinh anh loài `def`: bản nhân (khí huyết, công, tu vi), cùng `id` / hành vi / bán kính. Cache theo đối tượng loài để mọi tinh anh cùng loài dùng chung một
 * đối tượng (không tạo mới mỗi lần sinh).
 */
export function eliteDefOf(def: MonsterKind): MonsterKind {
  let e = eliteDefs.get(def);
  if (!e) {
    e = {
      ...def,
      name: `${def.name} tinh anh`,
      hp: Math.round(def.hp * ELITE_HP_MULT),
      atk: Math.round(def.atk * ELITE_ATK_MULT),
      exp: Math.round(def.exp * ELITE_EXP_MULT),
    };
    eliteDefs.set(def, e);
  }
  return e;
}

/** Số tinh anh đang sống trong phòng. */
export function eliteCount(w: World): number {
  let n = 0;
  for (const m of w.state.monsters.values()) if (m.elite) n++;
  return n;
}

/**
 * Con quái `def` sinh lúc này có là tinh anh không. `rng` mặc định `Math.random` (tests truyền giá trị cố định). Chỉ gọi `rng` khi loài đủ điều kiện và đang ở bản
 * đồ thường (phòng bí cảnh `w.runId !== null` không có tinh anh), rồi mới đếm số tinh anh hiện có (hiếm nên rẻ).
 */
export function rollElite(w: World, def: MonsterKind, rng: () => number = Math.random): boolean {
  if (!canBeElite(def) || w.runId !== null) return false;
  if (rng() >= ELITE_CHANCE) return false;
  return eliteCount(w) < ELITE_MAX;
}
