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
  partyExpShare,
  statsFor,
  type MonsterKind,
  COIN_DROPS,
  DROP_TABLES,
  sellPrice,
  buyPrice,
  calcDuyen,
  UNLOCK_BY_ID,
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

/**
 * Tốc độ tu vi (của MỖI người) khi săn một loại quái ở bậc (realm, tier); null nếu quá nguy hiểm.
 * `party` > 1: đội `party` người cùng cảnh giới đánh chung. Sát thương cộng dồn nên trận ngắn `party` lần; quái chỉ
 * đánh một mục tiêu một lúc nên mỗi người chịu 1/`party` sát thương (nên đội đánh được quái mà một người không dám);
 * thời gian tìm quái không đổi; tu vi mỗi con nhân partyExpShare (tu vi đả tọa lúc hồi sức không chia).
 * `party` = 1 cho đúng kết quả đánh một mình như trước.
 */
export function huntRate(m: MonsterKind, realm: number, tier: number, party = 1): Option | null {
  const s = statsFor(realm, tier, bestGear(realm, tier));
  const dps = (s.atk * SKILLS.slash.mult * ASSUME.critAvg) / (SKILLS.slash.cooldown / 1000);
  const fight = m.hp / (dps * party);
  const taken = ((m.atk / (m.attackCd / 1000)) * fight * ASSUME.hitTaken) / party;
  if (taken > s.maxHp * ASSUME.maxHpLossPerKill) return null;
  const rest = taken / (s.maxHp * MEDITATE.hpRegenPct); // đả tọa hồi khí huyết
  const sec = fight + rest + (ASSUME.searchSec[m.id] ?? 10);
  const exp =
    killExp(m, realm, tier) * partyExpShare(party) + meditateExpPerSec(realm, tier) * rest;
  return { source: m.id, rate: exp / sec, secPerKill: sec };
}

export function bestOption(realm: number, tier: number, party = 1): Option {
  const meditate: Option = {
    source: "đả tọa",
    rate: meditateExpPerSec(realm, tier),
    secPerKill: 0,
  };
  let best = meditate;
  for (const m of MONSTERS) {
    const o = huntRate(m, realm, tier, party);
    if (o && o.rate > best.rate) best = o;
  }
  return best;
}

/** Tu vi mỗi giờ của một thành viên đội `party` người so với đánh một mình, mỗi bên chọn quái tốt nhất an toàn. */
export function partyRatio(realm: number, tier: number, party: number) {
  const solo = bestOption(realm, tier);
  const grp = bestOption(realm, tier, party);
  return { ratio: grp.rate / solo.rate, solo: solo.source, party: grp.source };
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

/**
 * Mô phỏng từ Phàm Nhân tới hết `lastRealm` (mặc định: hết Trúc Cơ, sẵn sàng đột phá Kim Đan).
 * `expMult` là hệ số tăng tốc tu luyện từ Dư âm tu hành (mặc định 1.0, tối đa 2.0).
 */
export function simulate(lastRealm = 2, expMult = 1.0): Row[] {
  const rows: Row[] = [];
  const questExp = questExpByRealm();
  let total = ASSUME.questOverheadSec / 60;
  for (let realm = 0; realm <= lastRealm; realm++) {
    const tiers = REALMS[realm].tiers.length;
    for (let tier = 0; tier < tiers; tier++) {
      const bar = expToNext(realm, tier);
      const o = bestOption(realm, tier);
      let need = bar;
      // Thưởng nhiệm vụ chia đều cho các bậc của cảnh giới đó (không nhân expMult)
      need = Math.max(0, need - (questExp.get(realm) ?? 0) / tiers);
      // Tu vi từ săn quái & đả tọa được nhân expMult
      let sec = need / (o.rate * expMult);
      if (tier === tiers - 1) {
        // Đột phá: mỗi lần thất bại mất 30% thanh, phải luyện lại
        const p = breakthroughChance(realm);
        sec += ((1 / p - 1) * 0.3 * bar) / (o.rate * expMult);
      }
      const minutes = sec / 60;
      total += minutes;
      rows.push({
        realm,
        tier,
        label: `${REALMS[realm].name}${REALMS[realm].tiers[tier] ? " " + REALMS[realm].tiers[tier] : ""}`,
        bar,
        source: o.source,
        kills: o.secPerKill ? Math.round(sec / (o.secPerKill / expMult)) : 0,
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

// ---------- Kinh tế Linh thạch (#102) ----------

/** Kỳ vọng Linh thạch rơi trực tiếp từ 1 con quái (COIN_DROPS) */
export function expectedCoinDrop(monsterKind: string): number {
  const d = COIN_DROPS[monsterKind];
  if (!d) return 0;
  return d.chance * ((d.min + d.max) / 2);
}

/** Kỳ vọng Linh thạch từ việc bán đồ rơi của 1 con quái (DROP_TABLES × sellPrice) */
export function expectedLootValue(monsterKind: string): number {
  const drops = DROP_TABLES[monsterKind] ?? [];
  let val = 0;
  for (const e of drops) {
    const qty = e.chance * ((e.min + e.max) / 2);
    val += qty * sellPrice(e.itemId);
  }
  return val;
}

/** Tổng kỳ vọng Linh thạch từ 1 con quái (tiền rơi + bán đồ rơi) */
export function expectedTotalCoin(monsterKind: string): number {
  return expectedCoinDrop(monsterKind) + expectedLootValue(monsterKind);
}

export interface MonsterEconomy {
  monsterId: string;
  monsterName: string;
  secPerKill: number;
  killsPerHour: number;
  coinDropPerHour: number;
  lootSellPerHour: number;
  totalCoinPerHour: number;
  potionsPerHour: number;
}

/**
 * Thu nhập Linh thạch mỗi giờ khi săn một loại quái ở bậc (realm, tier);
 * null nếu quái quá nguy hiểm không an toàn để săn đơn lẻ.
 */
export function monsterEconomy(m: MonsterKind, realm: number, tier: number): MonsterEconomy | null {
  const h = huntRate(m, realm, tier);
  if (!h) return null;
  const killsPerHour = 3600 / h.secPerKill;
  const coinDropPerKill = expectedCoinDrop(m.id);
  const lootSellPerKill = expectedLootValue(m.id);
  const totalCoinPerKill = coinDropPerKill + lootSellPerKill;
  const potionPrice = buyPrice("hoi_huyet_dan");

  const coinDropPerHour = killsPerHour * coinDropPerKill;
  const lootSellPerHour = killsPerHour * lootSellPerKill;
  const totalCoinPerHour = killsPerHour * totalCoinPerKill;
  const potionsPerHour = potionPrice > 0 ? totalCoinPerHour / potionPrice : 0;

  return {
    monsterId: m.id,
    monsterName: m.name,
    secPerKill: h.secPerKill,
    killsPerHour,
    coinDropPerHour,
    lootSellPerHour,
    totalCoinPerHour,
    potionsPerHour,
  };
}

// ---------- Luân hồi & Duyên (#151) ----------

export interface ReincarnationMilestone {
  label: string;
  realm: number;
  tier: number;
  minutes: number;
  duyenZeroBoss: number;
  duyenWithBoss: number;
  duyenPerHourZeroBoss: number;
  duyenPerHourWithBoss: number;
}

export interface ReincarnationLifeRow {
  kiep: number;
  duAmLevel: number;
  expMult: number;
  minutes: number;
  duyenEarned: number;
  duyenRemaining: number;
  duyenPerHour: number;
  ratioToFirstLife: number;
  upgradeNote: string;
}

/**
 * Mô phỏng các mốc kết thúc kiếp (chết ngay khi vừa đạt bậc đó) ở kiếp đầu tiên (chưa có Dư âm tu hành),
 * kiểm tra số Duyên nhận được và tốc độ Duyên / giờ theo đúng bảng mục 5 của THIET_KE_LUAN_HOI.md.
 */
export function simulateReincarnationMilestones(
  baseRows = simulate(2, 1.0),
): ReincarnationMilestone[] {
  const phamNhan = baseRows.find((r) => r.realm === 0 && r.tier === 0)!;
  const lk4 = baseRows.find((r) => r.realm === 1 && r.tier === 3)!;
  const lk8 = baseRows.find((r) => r.realm === 1 && r.tier === 7)!;
  const lk9 = baseRows.find((r) => r.realm === 1 && r.tier === 8)!;
  const tc0 = baseRows.find((r) => r.realm === 2 && r.tier === 0)!;
  const tc1 = baseRows.find((r) => r.realm === 2 && r.tier === 1)!;
  const tc2 = baseRows.find((r) => r.realm === 2 && r.tier === 2)!;

  const rawMilestones = [
    { label: "Luyện Khí tầng 1", realm: 1, tier: 0, exp: 0, minutes: phamNhan.total, bossKills: 2 },
    { label: "Luyện Khí tầng 5", realm: 1, tier: 4, exp: 0, minutes: lk4.total, bossKills: 2 },
    { label: "Luyện Khí tầng 9", realm: 1, tier: 8, exp: 0, minutes: lk8.total, bossKills: 2 },
    { label: "Trúc Cơ sơ kỳ", realm: 2, tier: 0, exp: 0, minutes: lk9.total, bossKills: 2 },
    { label: "Trúc Cơ trung kỳ", realm: 2, tier: 1, exp: 0, minutes: tc0.total, bossKills: 2 },
    { label: "Trúc Cơ hậu kỳ", realm: 2, tier: 2, exp: 0, minutes: tc1.total, bossKills: 2 },
    {
      label: "Hết Trúc Cơ (thanh đầy)",
      realm: 2,
      tier: 2,
      exp: tc2.bar,
      minutes: tc2.total,
      bossKills: 3,
    },
  ];

  return rawMilestones.map((m) => {
    const duyenZero = calcDuyen({
      realm: m.realm,
      tier: m.tier,
      exp: m.exp,
      playMs: m.minutes * 60_000,
      bossKills: 0,
    });
    const duyenBoss = calcDuyen({
      realm: m.realm,
      tier: m.tier,
      exp: m.exp,
      playMs: m.minutes * 60_000,
      bossKills: m.bossKills,
    });
    const hours = m.minutes / 60;
    return {
      label: m.label,
      realm: m.realm,
      tier: m.tier,
      minutes: m.minutes,
      duyenZeroBoss: duyenZero,
      duyenWithBoss: duyenBoss,
      duyenPerHourZeroBoss: duyenZero / hours,
      duyenPerHourWithBoss: duyenBoss / hours,
    };
  });
}

/**
 * Mô phỏng chuỗi kiếp 1..N: người chơi chơi trọn vẹn mỗi kiếp (đến hết Trúc Cơ, hạ 2 trùm)
 * và ưu tiên dùng Duyên mở khóa dần 'Dư âm tu hành' (du_am) từ nấc 1 đến nấc 10 (+100%).
 * Đo số kiếp, thời gian và tốc độ Duyên / giờ qua từng kiếp.
 */
export function simulateReincarnationProgression(maxLives = 20): ReincarnationLifeRow[] {
  const duAmCosts = UNLOCK_BY_ID.du_am.costs;
  let currentDuAmLevel = 0;
  let accumulatedDuyen = 0;
  const history: ReincarnationLifeRow[] = [];
  let firstLifeDuyenPerHour = 0;

  for (let kiep = 1; kiep <= maxLives; kiep++) {
    const expMult = 1 + 0.1 * currentDuAmLevel;
    const rows = simulate(2, expMult);
    const lastRow = rows.at(-1)!;
    const minutes = lastRow.total;

    // Giả định hạ 2 trùm trong kiếp chơi trọn vẹn tới hết Trúc Cơ
    const duyenEarned = calcDuyen({
      realm: 2,
      tier: 2,
      exp: lastRow.bar,
      playMs: minutes * 60_000,
      bossKills: 2,
    });

    const hours = minutes / 60;
    const duyenPerHour = duyenEarned / hours;
    if (kiep === 1) {
      firstLifeDuyenPerHour = duyenPerHour;
    }
    const ratioToFirstLife = duyenPerHour / firstLifeDuyenPerHour;

    accumulatedDuyen += duyenEarned;

    let upgradesBought = 0;
    while (
      currentDuAmLevel < duAmCosts.length &&
      accumulatedDuyen >= duAmCosts[currentDuAmLevel]!
    ) {
      accumulatedDuyen -= duAmCosts[currentDuAmLevel]!;
      currentDuAmLevel++;
      upgradesBought++;
    }

    const upgradeNote =
      upgradesBought > 0
        ? `Lên nấc ${currentDuAmLevel} (+${currentDuAmLevel * 10}%)`
        : currentDuAmLevel >= duAmCosts.length
          ? "Đã đạt tối đa (+100%)"
          : `Chờ đủ ${duAmCosts[currentDuAmLevel]} Duyên`;

    history.push({
      kiep,
      duAmLevel: currentDuAmLevel,
      expMult,
      minutes,
      duyenEarned,
      duyenRemaining: accumulatedDuyen,
      duyenPerHour,
      ratioToFirstLife,
      upgradeNote,
    });

    if (
      currentDuAmLevel >= duAmCosts.length &&
      history.filter((h) => h.duAmLevel === duAmCosts.length).length >= 2
    ) {
      break;
    }
  }

  return history;
}
