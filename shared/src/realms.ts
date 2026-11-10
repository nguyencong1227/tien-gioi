// Hệ cảnh giới: thang chuẩn của thể loại tu tiên.
// "Bậc" (step) = vị trí tuyến tính trên toàn thang, dùng để tính chỉ số.
import { equipBonus, ITEM_BY_ID, type Equipment } from "./items";
import type { StatMult } from "./reincarnation";

export interface Realm {
  name: string;
  tiers: string[]; // tên bậc nhỏ
}

const KY = ["Sơ kỳ", "Trung kỳ", "Hậu kỳ"];

export const REALMS: Realm[] = [
  { name: "Phàm Nhân", tiers: [""] },
  { name: "Luyện Khí", tiers: Array.from({ length: 9 }, (_, i) => `Tầng ${i + 1}`) },
  { name: "Trúc Cơ", tiers: KY },
  { name: "Kim Đan", tiers: KY },
  { name: "Nguyên Anh", tiers: KY },
  { name: "Hóa Thần", tiers: KY },
  { name: "Luyện Hư", tiers: KY },
  { name: "Hợp Thể", tiers: KY },
  { name: "Đại Thừa", tiers: KY },
  { name: "Độ Kiếp", tiers: KY },
];

export function realmLabel(realm: number, tier: number): string {
  const r = REALMS[realm];
  if (!r) return "?";
  const t = r.tiers[tier] ?? "";
  return t ? `${r.name} ${t}` : r.name;
}

/** Vị trí tuyến tính trên thang (0 = Phàm Nhân). */
export function stepOf(realm: number, tier: number): number {
  let s = 0;
  for (let i = 0; i < realm; i++) s += REALMS[i].tiers.length;
  return s + tier;
}

export function isLastTier(realm: number, tier: number): boolean {
  return tier >= REALMS[realm].tiers.length - 1;
}

export function isPeak(realm: number, tier: number): boolean {
  return realm >= REALMS.length - 1 && isLastTier(realm, tier);
}

/**
 * Thanh tu vi của bậc đầu mỗi cảnh giới. Trong một cảnh giới thanh tăng chậm (REALM_TIER_GROWTH),
 * qua cảnh giới mới thì nhảy vọt: quái mới mạnh hơn nhưng không bù kịp, nên mỗi cảnh giới lâu hơn hẳn.
 * Số liệu chọn theo bảng tính docs/CAN_BANG.md (Luyện Khí ~1 giờ, Trúc Cơ ~3 giờ).
 */
export const REALM_EXP_BASE = [40, 280, 4400];
/** Từ Kim Đan trở đi (chưa có nội dung): mỗi cảnh giới gấp ngần này lần cảnh giới trước */
export const REALM_EXP_MULT_AFTER = 6;
export const REALM_TIER_GROWTH = [1, 1.1, 1.15];

/** Tu vi cần để lên bậc kế tiếp. */
export function expToNext(realm: number, tier: number): number {
  const last = REALM_EXP_BASE.length - 1;
  const base =
    realm <= last
      ? REALM_EXP_BASE[realm]
      : REALM_EXP_BASE[last] * Math.pow(REALM_EXP_MULT_AFTER, realm - last);
  const growth = REALM_TIER_GROWTH[Math.min(realm, REALM_TIER_GROWTH.length - 1)];
  return Math.round(base * Math.pow(growth, tier));
}

export interface Stats {
  maxHp: number;
  maxMp: number;
  atk: number;
  speed: number; // px/giây
}

/**
 * Chỉ số gốc theo cảnh giới, cộng chỉ số đồ đang mặc (nếu truyền `equipment`).
 * Client và server dùng chung hàm này nên số hiển thị khớp số server tính.
 * Client nhớ truyền equipment của chính mình khi đoán trước di chuyển (hộ phù có tốc độ).
 * `mult`: hệ số nhân chỉ số GỐC của xuất thân (luân hồi, `originMult` ở reincarnation.ts); bỏ trống = không đổi.
 */
export function statsFor(
  realm: number,
  tier: number,
  equipment?: Partial<Equipment>,
  mult?: StatMult,
): Stats {
  const s = stepOf(realm, tier);
  // Qua cảnh giới lớn có thêm thưởng để đột phá có cảm giác "nhảy vọt"
  const realmBonus = 1 + realm * 0.15;
  const b = equipBonus(equipment);
  return {
    maxHp: Math.round(100 * Math.pow(1.18, s) * realmBonus * (mult?.maxHp ?? 1)) + b.hp,
    maxMp: Math.round(50 * Math.pow(1.12, s) * realmBonus * (mult?.maxMp ?? 1)) + b.mp,
    atk: Math.round(10 * Math.pow(1.17, s) * realmBonus * (mult?.atk ?? 1)) + b.atk,
    speed: 150 + Math.min(realm, 6) * 8 + b.speed,
  };
}

/** Đủ cảnh giới để mặc món này chưa (false nếu không phải trang bị). */
export function canEquip(itemId: string, realm: number, tier: number): boolean {
  const e = ITEM_BY_ID[itemId]?.equip;
  return !!e && stepOf(realm, tier) >= stepOf(e.reqRealm, e.reqTier);
}

/** Xác suất đột phá cảnh giới lớn (từ realm → realm+1). */
export function breakthroughChance(realm: number): number {
  return Math.max(0.15, 0.85 - realm * 0.08);
}
