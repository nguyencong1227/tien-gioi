// Hệ cảnh giới: thang chuẩn của thể loại tu tiên.
// "Bậc" (step) = vị trí tuyến tính trên toàn thang, dùng để tính chỉ số.
import { equipBonus, ITEM_BY_ID, type Equipment } from "./items";

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

/** Tu vi cần để lên bậc kế tiếp. */
export function expToNext(realm: number, tier: number): number {
  return Math.round(40 * Math.pow(1.35, stepOf(realm, tier)));
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
 */
export function statsFor(realm: number, tier: number, equipment?: Partial<Equipment>): Stats {
  const s = stepOf(realm, tier);
  // Qua cảnh giới lớn có thêm thưởng để đột phá có cảm giác "nhảy vọt"
  const realmBonus = 1 + realm * 0.15;
  const b = equipBonus(equipment);
  return {
    maxHp: Math.round(100 * Math.pow(1.18, s) * realmBonus) + b.hp,
    maxMp: Math.round(50 * Math.pow(1.12, s) * realmBonus) + b.mp,
    atk: Math.round(10 * Math.pow(1.17, s) * realmBonus) + b.atk,
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
