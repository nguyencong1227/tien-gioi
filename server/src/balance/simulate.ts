// Mô phỏng thô thời gian tu luyện (bảng tính cân bằng, issue #28).
// Dùng đúng các công thức trong shared/ (chỉ số, thanh tu vi, quái, đả tọa, đột phá),
// cộng vài giả định về cách người chơi săn quái (ghi rõ trong ASSUME).
// Chạy `npm run can-bang -w server` để in bảng ra docs/CAN_BANG.md.
import {
  ITEMS,
  EQUIP_SLOTS,
  emptyEquipment,
  stepOf,
  type Equipment,
  MONSTERS,
  MEDITATE,
  REALMS,
  QUESTS,
  SKILLS,
  breakthroughChance,
  expToNext,
  killExp,
  meditateExpPerSec,
  statsFor,
  type MonsterKind,
} from "@tien-gioi/shared";

/** Giả định về lối chơi. Đổi ở đây nếu thấy không giống người chơi thật. */
export const ASSUME = {
  /** Thời gian tìm và tới con quái kế tiếp (giây) */
  searchSec: { tho: 6, lang: 8, ho: 12, mang: 90 } as Record<string, number>,
  /** Tỉ lệ đòn của quái thực sự trúng (người chơi né / lùi được một phần) */
  hitTaken: 0.8,
  /** Không đánh loại quái mà một trận làm mất quá tỉ lệ khí huyết này */
  maxHpLossPerKill: 0.5,
  /** Hệ số trung bình của bạo kích: 10% × 1.8 */
  critAvg: 1 + 0.1 * 0.8,
  /** Thời gian đi lại, nói chuyện với NPC trong cả chuỗi nhiệm vụ chính (giây) */
  questOverheadSec: 8 * 60,
  /**
   * Người chơi mặc món tốt nhất đủ cảnh giới ở mỗi ô (giả định đã rèn kịp; nguyên liệu rơi trong lúc săn).
   * Tắt để xem đường cong khi không có trang bị.
   */
  useGear: true,
};

/** Món tốt nhất mỗi ô mà bậc (realm, tier) mặc được: món có yêu cầu cảnh giới cao nhất. */
export function bestGear(realm: number, tier: number): Equipment {
  const eq = emptyEquipment();
  if (!ASSUME.useGear) return eq;
  const step = stepOf(realm, tier);
  for (const slot of EQUIP_SLOTS) {
    let best = -1;
    for (const it of ITEMS) {
      const e = it.equip;
      if (!e || e.slot !== slot) continue;
      const need = stepOf(e.reqRealm, e.reqTier);
      if (need <= step && need > best) {
        best = need;
        eq[slot] = it.id;
      }
    }
  }
  return eq;
}

export interface Row {
  realm: number;
  tier: number;
  label: string;
  bar: number;
  /** Nguồn tu vi tốt nhất: id quái hoặc "đả tọa" */
  source: string;
  kills: number;
  /** Phút để đầy thanh của bậc này (gồm đột phá thất bại nếu là bậc cuối) */
  minutes: number;
  /** Phút cộng dồn tới khi qua bậc này */
  total: number;
}

interface Option {
  source: string;
  /** tu vi / giây */
  rate: number;
  /** giây cho mỗi con quái (0 nếu đả tọa) */
  secPerKill: number;
}

/** Tốc độ tu vi khi săn một loại quái ở bậc (realm, tier); null nếu quá nguy hiểm. */
export function huntRate(m: MonsterKind, realm: number, tier: number): Option | null {
  const s = statsFor(realm, tier, bestGear(realm, tier));
  const dps = (s.atk * SKILLS.slash.mult * ASSUME.critAvg) / (SKILLS.slash.cooldown / 1000);
  const fight = m.hp / dps;
  const taken = (m.atk / (m.attackCd / 1000)) * fight * ASSUME.hitTaken;
  if (taken > s.maxHp * ASSUME.maxHpLossPerKill) return null;
  const rest = taken / (s.maxHp * MEDITATE.hpRegenPct); // đả tọa hồi khí huyết
  const sec = fight + rest + (ASSUME.searchSec[m.id] ?? 10);
  const exp = killExp(m, realm, tier) + meditateExpPerSec(realm, tier) * rest;
  return { source: m.id, rate: exp / sec, secPerKill: sec };
}

export function bestOption(realm: number, tier: number): Option {
  const meditate: Option = {
    source: "đả tọa",
    rate: meditateExpPerSec(realm, tier),
    secPerKill: 0,
  };
  let best = meditate;
  for (const m of MONSTERS) {
    const o = huntRate(m, realm, tier);
    if (o && o.rate > best.rate) best = o;
  }
  return best;
}

/** Tổng tu vi thưởng của chuỗi chính theo cảnh giới lúc nhận thưởng (gần đúng: theo mốc reachRealm cuối cùng của nhiệm vụ) */
function questExpByRealm(): Map<number, number> {
  const out = new Map<number, number>();
  for (const q of QUESTS) {
    if (q.daily || !q.rewards.exp) continue;
    const r = [...q.steps].reverse().find((s) => s.kind === "reachRealm");
    const realm = r?.kind === "reachRealm" ? r.realm : 1;
    out.set(realm, (out.get(realm) ?? 0) + q.rewards.exp);
  }
  return out;
}

/** Mô phỏng từ Phàm Nhân tới hết `lastRealm` (mặc định: hết Trúc Cơ, sẵn sàng đột phá Kim Đan). */
export function simulate(lastRealm = 2): Row[] {
  const rows: Row[] = [];
  const questExp = questExpByRealm();
  let total = ASSUME.questOverheadSec / 60;
  for (let realm = 0; realm <= lastRealm; realm++) {
    const tiers = REALMS[realm].tiers.length;
    for (let tier = 0; tier < tiers; tier++) {
      const bar = expToNext(realm, tier);
      const o = bestOption(realm, tier);
      let need = bar;
      // Thưởng nhiệm vụ chia đều cho các bậc của cảnh giới đó
      need = Math.max(0, need - (questExp.get(realm) ?? 0) / tiers);
      let sec = need / o.rate;
      if (tier === tiers - 1) {
        // Đột phá: mỗi lần thất bại mất 30% thanh, phải luyện lại
        const p = breakthroughChance(realm);
        sec += ((1 / p - 1) * 0.3 * bar) / o.rate;
      }
      const minutes = sec / 60;
      total += minutes;
      rows.push({
        realm,
        tier,
        label: `${REALMS[realm].name}${REALMS[realm].tiers[tier] ? " " + REALMS[realm].tiers[tier] : ""}`,
        bar,
        source: o.source,
        kills: o.secPerKill ? Math.round(sec / o.secPerKill) : 0,
        minutes,
        total,
      });
    }
  }
  return rows;
}

/** Phút cộng dồn khi xong bậc cuối của cảnh giới `realm` (sẵn sàng đột phá lên cảnh giới sau) */
export function minutesToFinish(rows: Row[], realm: number): number {
  return rows.filter((r) => r.realm === realm).at(-1)!.total;
}
