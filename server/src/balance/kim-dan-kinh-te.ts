// Kinh tế và trang bị Kim Đan SAU nội dung M6 (#406 mục 2 và 3): thu nhập Linh thạch theo nhịp, chi cho ba bộ (phí rèn + nguyên liệu),
// và sức mạnh từng bộ. Đối xứng với `kim-dan-sau.ts`: tính SỐNG từ `shared/` bằng mô hình ở `simulate.ts`.
import {
  DROP_TABLES,
  ITEMS,
  ITEM_BY_ID,
  KIM_DAN_RECIPES,
  UNLOCK_BY_ID,
  coinCarryCap,
  MONSTER_BY_ID,
  REALMS,
  buyPrice,
  COIN_DROPS,
  sellPrice,
  type RecipeDef,
} from "@tien-gioi/shared";
import { bestOption, huntRate, monsterEconomy, simulate } from "./simulate";
import { dangerFraction, kimDanReincarnation, KIM_DAN_BOSS_ID, withKimDan } from "./kim-dan-sau";

const KD = 3;
/** Trần Linh thạch mang qua kiếp khi đủ Kim nang (nấc cuối), đọc từ `shared/src/reincarnation.ts` */
const CARRY_CAP_MAX = coinCarryCap({ kim_nang: UNLOCK_BY_ID.kim_nang.costs.length });

/** Đội đi hạ trùm để lấy Giao Lân (mô hình: bốn người, an toàn từ Sơ kỳ). */
export const BOSS_PARTY = 4;

/** Nguyên liệu của ba bộ: người chơi GIỮ lại để rèn, không bán (nên không tính vào thu nhập). */
export const KIM_DAN_MATERIALS: ReadonlySet<string> = new Set(
  KIM_DAN_RECIPES.flatMap((r) => r.inputs.map((i) => i.itemId)),
);

/** Chạy `fn` khi người chơi chỉ có trang bị Kim Đan tới bộ `upTo` (0 = chưa có bộ nào, 1 = bộ I, ...), rồi khôi phục. */
export function withGearUpTo<T>(upTo: number, fn: () => T): T {
  const saved = [...ITEMS];
  const keep = ITEMS.filter(
    (i) => !(i.equip && i.equip.reqRealm === KD && i.equip.reqTier >= upTo),
  );
  ITEMS.length = 0;
  ITEMS.push(...keep);
  try {
    return fn();
  } finally {
    ITEMS.length = 0;
    ITEMS.push(...saved);
  }
}

const avgDrop = (d: { chance: number; min: number; max: number }) =>
  d.chance * ((d.min + d.max) / 2);
const avgCoin = (id: string) => {
  const c = COIN_DROPS[id];
  return c ? c.chance * ((c.min + c.max) / 2) : 0;
};

/** Linh thạch / giờ KHẢ DỤNG khi săn solo `monsterId` ở bậc `tier`: tiền rơi + bán đồ rơi, trừ nguyên liệu phải giữ để rèn. */
export function spendableCoinPerHour(monsterId: string, tier: number): number | null {
  const e = monsterEconomy(MONSTER_BY_ID[monsterId], KD, tier);
  if (!e) return null;
  let sale = 0;
  for (const d of DROP_TABLES[monsterId] ?? [])
    if (!KIM_DAN_MATERIALS.has(d.itemId)) sale += avgDrop(d) * sellPrice(d.itemId);
  return e.coinDropPerHour + e.killsPerHour * sale;
}

/**
 * Quái nên cày để lấy `itemId`: ưu tiên QUÁI THƯỜNG rơi nhiều nhất (đi một mình được), chỉ dùng trùm khi không loài thường nào rơi
 * (Giao Lân). Hắc Giao cũng rơi Độc nang nhưng đi tìm trùm theo đội để lấy thứ có thể săn solo là không hợp lý.
 */
export function bestDropper(itemId: string): string {
  let best = "";
  let bestKey = -1;
  for (const [mon, rows] of Object.entries(DROP_TABLES)) {
    const d = rows.find((r) => r.itemId === itemId);
    if (!d) continue;
    const key = avgDrop(d) + (MONSTER_BY_ID[mon]?.boss ? 0 : 1000); // quái thường luôn thắng trùm
    if (key > bestKey) {
      best = mon;
      bestKey = key;
    }
  }
  return best;
}

export interface BoGear {
  /** 1 = bộ I ... */
  bo: number;
  /** Bậc nhỏ đầu tiên mặc được (0 = Sơ kỳ) */
  tier: number;
  recipes: RecipeDef[];
  /** Tổng phí rèn cả bộ (Linh thạch) */
  fee: number;
  /** Tổng nguyên liệu cả bộ */
  materials: { itemId: string; qty: number; source: string }[];
  /** Giờ cày nguyên liệu (mỗi người), solo cho quái thường, theo đội BOSS_PARTY cho trùm */
  soloHours: number;
  bossHours: number;
}

/** Ba bộ Kim Đan: phí, nguyên liệu và thời gian cày nguyên liệu (mỗi người) ở bậc đầu tiên mặc được. */
export function kimDanBo(): BoGear[] {
  return [0, 1, 2].map((tier) => {
    const recipes = KIM_DAN_RECIPES.filter(
      (r) => ITEM_BY_ID[r.output.itemId].equip?.reqTier === tier,
    );
    const need = new Map<string, number>();
    for (const r of recipes)
      for (const g of r.inputs) need.set(g.itemId, (need.get(g.itemId) ?? 0) + g.qty);
    let soloHours = 0;
    let bossHours = 0;
    const materials = [...need].map(([itemId, qty]) => {
      const source = bestDropper(itemId);
      const drop = DROP_TABLES[source].find((d) => d.itemId === itemId)!;
      const m = MONSTER_BY_ID[source];
      if (m.boss && source === KIM_DAN_BOSS_ID) {
        // Cả đội cần `qty` mỗi người: BOSS_PARTY x qty vật phẩm, mỗi trận một mảnh rơi chung
        const h = withKimDan(() => huntRate(m, KD, tier, BOSS_PARTY), false, true)!;
        bossHours += (((BOSS_PARTY * qty) / avgDrop(drop)) * h.secPerKill) / 3600;
      } else {
        const h = withKimDan(() => huntRate(m, KD, tier));
        // Quái chưa an toàn solo ở bậc này: coi là cày ở bậc kế (mô hình chỉ cần số đo gần đúng)
        const at = h ?? withKimDan(() => huntRate(m, KD, Math.min(2, tier + 1)))!;
        soloHours += (qty / avgDrop(drop)) * (at.secPerKill / 3600);
      }
      return { itemId, qty, source };
    });
    return {
      bo: tier + 1,
      tier,
      recipes,
      fee: recipes.reduce((n, r) => n + (r.coin ?? 0), 0),
      materials,
      soloHours,
      bossHours,
    };
  });
}

/**
 * Linh thạch kiếm được TRƯỚC Kim Đan trong cùng kiếp (Phàm Nhân tới hết Trúc Cơ, bán hết đồ rơi): ví chỉ đặt lại lúc đầu thai và
 * Luyện Khí / Trúc Cơ gần như không có chỗ tiêu, nên số này còn nguyên khi vào Kim Đan và trả được phí rèn (nit của B ở #440).
 */
export function preKimDanCoin(rows: ReturnType<typeof simulate>): number {
  let coin = 0;
  for (const r of rows) {
    if (r.realm >= KD) continue;
    const m = MONSTER_BY_ID[r.source];
    const e = m ? monsterEconomy(m, r.realm, r.tier) : null;
    if (e) coin += (r.minutes / 60) * e.totalCoinPerHour;
  }
  return coin;
}

export interface EconomyTier {
  tier: number;
  label: string;
  /** Nguồn tu vi theo đường "bãi mới" (không đụng Xích Mãng), id quái */
  source: string;
  minutes: number;
  coinPerHour: number;
  /** Linh thạch kiếm được trong bậc (tiền rơi + bán đồ thừa) */
  earned: number;
  /** Cộng dồn tới hết bậc: Linh thạch mang vào từ Luyện Khí / Trúc Cơ + kiếm ở Kim Đan, đã trừ phần hụt do săn trùm theo đội (bộ III) */
  cumulative: number;
  /** Phí rèn cộng dồn của các bộ tới bộ `tier + 1` (bộ mặc được từ bậc kế) */
  feeCumulative: number;
  /** cumulative - feeCumulative: dương = dư, âm = thiếu */
  surplus: number;
}

/**
 * Thu nhập theo nhịp Kim Đan (đường "bãi mới") so với phí rèn cộng dồn: cuối Sơ kỳ đủ tiền cho bộ I, cuối Trung kỳ cho I + II,
 * cuối Hậu kỳ cho cả ba (bộ III chỉ mặc được ở Hậu kỳ nên phí bộ III tính vào cuối Hậu kỳ). Săn trùm theo đội (lấy Giao Lân) kiếm
 * ít tiền hơn săn solo: phần hụt đó trừ vào thu nhập của bậc tương ứng.
 */
export function kimDanEconomy(expMult = 1): {
  tiers: EconomyTier[];
  bo: BoGear[];
  bossCoinPerHour: number;
  /** Linh thạch kiếm trước Kim Đan, đã nằm trong `cumulative` của bậc đầu */
  preKimDan: number;
} {
  // `expMult` > 1 (Dư âm tu hành): bậc ngắn lại nhưng tiền rơi theo số quái hạ nên KHÔNG tăng theo tốc độ tu vi
  const designed = withKimDan(() => simulate(KD, expMult), true);
  const bo = kimDanBo();
  const preKimDan = preKimDanCoin(designed);
  let cumulative = preKimDan;
  let feeCumulative = 0;
  const tiers = [0, 1, 2].map((tier) => {
    const row = designed.find((r) => r.realm === KD && r.tier === tier)!;
    const coinPerHour = withKimDan(() => spendableCoinPerHour(row.source, tier), true)!;
    // Giờ săn trùm không dài hơn chính bậc đó (bậc ngắn lại khi tu nhanh: phần còn lại tính ở "So với thời gian ở bậc")
    const bossHours = Math.min(bo[tier].bossHours, row.minutes / 60);
    const bossLoss = bossHours * Math.max(0, coinPerHour - bossCoinPerHourOf(tier));
    const earned = (row.minutes / 60) * coinPerHour - bossLoss;
    cumulative += earned;
    feeCumulative += bo[tier].fee;
    return {
      tier,
      label: `${REALMS[KD].name} ${REALMS[KD].tiers[tier]}`,
      source: row.source,
      minutes: row.minutes,
      coinPerHour,
      earned,
      cumulative,
      feeCumulative,
      surplus: cumulative - feeCumulative,
    };
  });
  return { tiers, bo, bossCoinPerHour: bossCoinPerHourOf(2), preKimDan };
}

export interface EconomyLife {
  kiep: number;
  duAmLevel: number;
  /** Thời gian chơi cả kiếp tới hết Kim Đan (phút, theo mô hình luân hồi) */
  minutes: number;
  /** Linh thạch kiếm được trong kiếp (cộng dồn tới hết Kim Đan) */
  earned: number;
  /** Số bộ trả đủ phí được trong kiếp, rèn lần lượt từ bộ I (0..3) */
  affordableBo: number;
  /** Phần thời gian của Hậu kỳ dành cho cày nguyên liệu bộ III (> 1 = không kịp trong bậc) */
  boIIIShare: number;
}

/**
 * Kinh tế QUA KIẾP (#406, câu hỏi của B ở #439): khi kiếp nào cũng cày tới hết Kim Đan và nâng Dư âm tu hành, bậc ngắn lại theo hệ
 * số tốc độ nhưng tiền rơi theo số quái hạ nên không tăng, trong khi `applyRebirth` đưa ví về tối đa `coinCarryCap` (400) và túi rỗng.
 */
export function kimDanEconomyByLife(
  progression: { kiep: number; duAmLevel: number; expMult: number; minutes: number }[],
): EconomyLife[] {
  return progression.map((p) => {
    const e = kimDanEconomy(p.expMult);
    const earned = e.tiers.at(-1)!.cumulative;
    let affordableBo = 0;
    let fee = 0;
    for (const b of e.bo) {
      fee += b.fee;
      if (earned >= fee) affordableBo = b.bo;
    }
    return {
      kiep: p.kiep,
      duAmLevel: p.duAmLevel,
      minutes: p.minutes,
      earned,
      affordableBo,
      boIIIShare: materialShare(e, 2),
    };
  });
}

/** Linh thạch / giờ MỖI NGƯỜI khi cả đội `BOSS_PARTY` săn trùm: tiền rơi của trùm chia đều, đồ rơi không tính (một chủ). */
export function bossCoinPerHourOf(tier: number): number {
  const h = withKimDan(
    () => huntRate(MONSTER_BY_ID[KIM_DAN_BOSS_ID], KD, tier, BOSS_PARTY),
    false,
    true,
  );
  return h ? ((3600 / h.secPerKill) * avgCoin(KIM_DAN_BOSS_ID)) / BOSS_PARTY : 0;
}

export interface GearEffect {
  tier: number;
  /** Chỉ có trang bị tới bộ `upTo` (0 = không có bộ Kim Đan nào, chỉ bộ Xích Mãng) */
  upTo: number;
  bestSource: string;
  expPerHour: number;
  /** Như `expPerHour` nhưng người chơi chỉ săn bãi mới (không đụng Xích Mãng), như đường "bãi mới" ở mục 3 */
  expPerHourNewOnly: number;
  /** Khí huyết mất mỗi trận khi solo Độc Thiềm (phần trăm) */
  docThiemDanger: number;
}

/** Tu vi / giờ solo tốt nhất và độ nguy hiểm khi đủ trang bị tới từng bộ, ở từng bậc (bộ chưa mặc được ở bậc đó thì bỏ). */
export function kimDanGearEffect(): GearEffect[] {
  const out: GearEffect[] = [];
  for (let tier = 0; tier < 3; tier++)
    for (let upTo = 0; upTo <= tier + 1; upTo++) {
      const r = withKimDan(() =>
        withGearUpTo(upTo, () => ({
          best: bestOption(KD, tier),
          danger: dangerFraction(MONSTER_BY_ID.doc_thiem, KD, tier),
        })),
      );
      const newOnly = withKimDan(() => withGearUpTo(upTo, () => bestOption(KD, tier)), true);
      out.push({
        tier,
        upTo,
        bestSource: r.best.source,
        expPerHour: r.best.rate * 3600,
        expPerHourNewOnly: newOnly.rate * 3600,
        docThiemDanger: r.danger * 100,
      });
    }
  return out;
}

/** Phần thời gian của bậc `tier` dành cho cày nguyên liệu của bộ mặc được từ bậc đó (0..); dưới 1 nghĩa là "rèn kịp" trong bậc. */
export function materialShare(eco: ReturnType<typeof kimDanEconomy>, tier: number): number {
  const b = eco.bo[tier];
  return ((b.soloHours + b.bossHours) * 60) / eco.tiers[tier].minutes;
}

/** Số giờ săn Hậu kỳ còn thiếu để mua đủ ba bộ sau khi hết Kim Đan (0 nếu đã đủ). */
export function shortfallHours(eco: ReturnType<typeof kimDanEconomy>): number {
  const last = eco.tiers.at(-1)!;
  return last.surplus < 0 ? -last.surplus / last.coinPerHour : 0;
}

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);
const nameOf = (id: string) => MONSTER_BY_ID[id]?.name ?? id;
const itemName = (id: string) => ITEM_BY_ID[id]?.name ?? id;

/** Tỉ lệ tu vi / giờ thấp nhất giữa "không có bộ Kim Đan nào" và "đủ bộ mặc được", mọi bậc và cả hai cách săn (mọi bãi / chỉ bãi mới). */
export function minGearRatio(gear: GearEffect[]): number {
  let min = Infinity;
  for (let tier = 0; tier < 3; tier++) {
    const rows = gear.filter((g) => g.tier === tier);
    const none = rows[0];
    const full = rows.at(-1)!;
    min = Math.min(
      min,
      none.expPerHour / full.expPerHour,
      none.expPerHourNewOnly / full.expPerHourNewOnly,
    );
  }
  return min;
}

/** Chỉ số gốc của món ô `slot` trong bộ `tier` (0 = bộ I): `atk` của kiếm, `hp` của bào. */
export function boStat(
  tier: number,
  slot: "weapon" | "robe" | "talisman",
  key: "atk" | "hp" | "mp" | "speed",
): number {
  const r = KIM_DAN_RECIPES.find((x) => {
    const e = ITEM_BY_ID[x.output.itemId].equip;
    return e?.reqTier === tier && e.slot === slot;
  })!;
  return ITEM_BY_ID[r.output.itemId].equip!.stats[key] ?? 0;
}

/** Mục 6 và 7 của "Kim Đan sau nội dung" trong `docs/CAN_BANG.md`. */
export function renderKimDanKinhTe(): string {
  const eco = kimDanEconomy();
  const totalFee = eco.bo.reduce((n, b) => n + b.fee, 0);
  const incomeRows = eco.tiers.map(
    (t) =>
      `| ${t.label} | ${nameOf(t.source)} | ${n0(t.minutes)} | ${n0(t.coinPerHour)} | ${n0(t.earned)} | ${n0(t.cumulative)} | ${n0(t.feeCumulative)} | ${t.surplus >= 0 ? "+" : "-"}${n0(Math.abs(t.surplus))} |`,
  );
  const boRows = eco.bo.map(
    (b) =>
      `| Bộ ${"I".repeat(b.bo)} (từ ${REALMS[KD].tiers[b.tier]}) | ${b.recipes.length} | ${n0(b.fee)} | ${b.materials.map((m) => `${m.qty} ${itemName(m.itemId)}`).join(", ")} | ${n1(b.soloHours * 60)} | ${n1(b.bossHours * 60)} | ${n0(materialShare(eco, b.tier) * 100)}% |`,
  );
  const gear = kimDanGearEffect();
  const gearRows = gear.map(
    (g) =>
      `| ${REALMS[KD].tiers[g.tier]} | ${g.upTo === 0 ? "không bộ Kim Đan nào" : `tới bộ ${"I".repeat(g.upTo)}`} | ${n0(g.expPerHour)} (${nameOf(g.bestSource)}) | ${n0(g.docThiemDanger)}% |`,
  );
  const pillPrice = buyPrice("dai_hoi_huyet_dan");
  const last = eco.tiers.at(-1)!;
  const hau = gear.filter((g) => g.tier === 2);
  const gain = (hau.at(-1)!.expPerHour / hau[0].expPerHour - 1) * 100;
  const lives = kimDanEconomyByLife(kimDanReincarnation().progression);
  const boLabel = (k: number) =>
    k === 0 ? "chưa đủ bộ I" : `bộ ${["I", "I + II", "I + II + III"][k - 1]}`;
  const lifeRows = lives.map(
    (l) =>
      `| ${l.kiep} | Nấc ${l.duAmLevel} | ${n0(l.minutes)} | ${n0(l.earned)} | ${boLabel(l.affordableBo)} | ${n0(l.boIIIShare * 100)}% |`,
  );
  const kyVat = UNLOCK_BY_ID.ky_vat.costs;
  const kyVatTotal = kyVat.reduce((n, c) => n + c, 0);
  const lastLife = lives.at(-1)!;
  const duyenPerLife = kimDanReincarnation().progression[0].duyenEarned;
  const firstShort = lives.find((l) => l.affordableBo < 3);
  const firstLow = lives.find((l) => l.affordableBo <= 1);
  const lifeNote = `${firstShort ? `Không kiếp nào trả đủ cả ba bộ (kiếp 1 chỉ tới ${boLabel(firstShort.affordableBo)})` : "Cả ba bộ trả đủ trong mọi kiếp"}${firstLow ? `; từ kiếp ${firstLow.kiep} trở đi chỉ trả đủ ${boLabel(firstLow.affordableBo)}` : ""} (kiếp ${lastLife.kiep}: ${n0(lastLife.earned)} Linh thạch, cày nguyên liệu bộ III chiếm ${n0(lastLife.boIIIShare * 100)}% Hậu kỳ nên không kịp trong bậc). Đây là CHỦ Ý hay không là câu hỏi cho người dùng (ghi ở \`questions.md\`): đường giữ đồ là **Ký vật** (${kyVat.length} nấc, tổng ${n0(kyVatTotal)} Duyên ~ ${n1(kyVatTotal / duyenPerLife)} kiếp Kim Đan; nấc ${kyVat.length} giữ lại cả ba món đang mặc), nên bộ rèn ở kiếp trước đi theo sang kiếp sau và Linh thạch chỉ cần cho phần còn thiếu; Linh thạch KHÔNG tích lũy qua kiếp (ví về tối đa ${n0(CARRY_CAP_MAX)}) nên "dư hàng vạn" ở kiếp sau không thành vấn đề tích tụ. Mô hình chưa tính người chơi kiếp sau rèn lại từ đầu (không Ký vật).`;

  return `### 6. Kinh tế Kim Đan: chỗ tiêu Linh thạch so với thu nhập (#406)

Thu nhập theo nhịp "bãi mới" ở mục 3 (săn solo, mỗi bậc một loài tốt nhất): tiền rơi cộng bán đồ rơi, TRỪ nguyên liệu của ba bộ (người chơi giữ lại để rèn). Chi: phí rèn \`RecipeDef.coin\` (mỗi bộ rèn được từ bậc ghi ở cột đầu, tiền trả khi rèn). Cột "Cộng dồn / Phí cộng dồn" so sánh tiền có được tới hết bậc với phí cộng dồn của các bộ mặc được tới bậc kế; tiền có được gồm cả **${n0(eco.preKimDan)}** Linh thạch kiếm ở Luyện Khí / Trúc Cơ CÙNG kiếp (ví chỉ đặt lại lúc đầu thai và ở đó gần như không có chỗ tiêu); bộ III chỉ mặc được ở Hậu kỳ nên phí của nó tính vào cuối Hậu kỳ. Săn trùm theo đội lấy Giao Lân kiếm ít tiền hơn solo (tiền rơi của trùm chia ${BOSS_PARTY} người: ~${n0(eco.bossCoinPerHour)} Linh thạch / giờ mỗi người): phần hụt đã trừ vào thu nhập Hậu kỳ.

| Bậc | Nguồn | Phút | Linh thạch / giờ (khả dụng) | Kiếm trong bậc | Cộng dồn | Phí rèn cộng dồn | Dư / thiếu |
|---|---|---:|---:|---:|---:|---:|---:|
${incomeRows.join("\n")}

Chi cho từng bộ (nguyên liệu tính MỖI NGƯỜI; trùm đi theo đội ${BOSS_PARTY} người, mỗi mảnh rơi chung nên cả đội cần ${BOSS_PARTY} lần số lượng):

| Bộ | Món | Phí rèn | Nguyên liệu | Phút cày solo | Phút săn trùm theo đội | So với thời gian ở bậc |
|---|---:|---:|---|---:|---:|---:|
${boRows.join("\n")}

Tổng phí rèn ba bộ **${n0(totalFee)}** Linh thạch so với **${n0(last.cumulative)}** có được từ đầu kiếp tới hết Kim Đan: ${last.surplus >= 0 ? `dư ${n0(last.surplus)}` : `thiếu ${n0(-last.surplus)} (~${n1(shortfallHours(eco))} giờ săn Hậu kỳ sau khi hết Kim Đan)`}. Bộ I mua đủ trong Sơ kỳ (${eco.tiers[0].surplus >= 0 ? "dư" : "thiếu"} ${n0(Math.abs(eco.tiers[0].surplus))} cuối bậc) và bộ II trong Trung kỳ (${eco.tiers[1].surplus >= 0 ? "dư" : "thiếu"} ${n0(Math.abs(eco.tiers[1].surplus))}); bộ III (${n0(eco.bo[2].fee)}, ${n0((eco.bo[2].fee / totalFee) * 100)}% tổng phí) là mục tiêu cuối game: người chơi KHÔNG dư hàng vạn Linh thạch không có chỗ tiêu như cảnh báo cũ của mục "Kinh tế Linh thạch", và cũng không bị chặn (thiếu chừng ${n1(shortfallHours(eco))} giờ). Cột cuối: cày nguyên liệu chiếm tối đa ${n0(Math.max(...eco.tiers.map((t) => materialShare(eco, t.tier))) * 100)}% thời gian bậc và các giờ đó vẫn kiếm tu vi, nên nguyên liệu không phải nút cổ chai, tiền mới là.
Đan cấp 2 (\`dai_hoi_huyet_dan\` / \`dai_hoi_linh_dan\`, ${n0(pillPrice)} Linh thạch / viên ở Lái buôn Vọng Sương) là chỗ xả TUỲ CHỌN thêm vào: mô hình không tính vì không giả định người chơi uống đan (đả tọa hồi khí huyết). Mô hình cũng bỏ qua nhiệm vụ lặp và phí rèn ở nhịp tu luyện (mục 3), phần Linh thạch / đồ thưởng của nhiệm vụ.

**Qua kiếp.** Bảng trên là kiếp 1 (không Dư âm tu hành). Khi kiếp nào cũng cày tới hết Kim Đan và nâng Dư âm tu hành (mục 4), bậc ngắn lại theo hệ số tốc độ nhưng Linh thạch theo số quái hạ nên KHÔNG tăng, còn \`applyRebirth\` đưa ví về tối đa \`coinCarryCap\` (${n0(CARRY_CAP_MAX)} khi đủ Kim nang) và túi rỗng:

| Kiếp | Dư âm tu hành | Phút cả kiếp | Linh thạch kiếm được | Rèn đủ phí | Cày nguyên liệu bộ III so với Hậu kỳ |
|---|---:|---:|---:|---|---:|
${lifeRows.join("\n")}

${lifeNote}

### 7. Trang bị: ba bộ tăng sức mạnh đều, không bộ nào bắt buộc hay vô dụng (#406)

Sức mạnh gốc mỗi bộ (kiếm +công, bào +khí huyết, phù +linh lực / tốc): ${["I", "II", "III"]
    .map((nm, i) => {
      const w = KIM_DAN_RECIPES.filter((r) => ITEM_BY_ID[r.output.itemId].equip?.reqTier === i).map(
        (r) => ITEM_BY_ID[r.output.itemId].equip!,
      );
      const atk = w.find((e) => e.slot === "weapon")!.stats.atk ?? 0;
      const hp = w.find((e) => e.slot === "robe")!.stats.hp ?? 0;
      return `bộ ${nm}: công ${atk}, khí huyết ${hp}`;
    })
    .join(
      "; ",
    )}. Bảng dưới: tu vi / giờ solo tốt nhất và khí huyết mất mỗi trận khi solo Độc Thiềm (loài đòn nặng nhất) nếu người chơi chỉ có trang bị tới từng bộ.

| Bậc | Trang bị | Tu vi / giờ (loài tốt nhất) | Khí huyết mất / trận (Độc Thiềm) |
|---|---|---:|---:|
${gearRows.join("\n")}

Đọc bảng: tỉ lệ tu vi / giờ giữa không có bộ nào và đủ bộ mặc được là ${gear
    .filter((g) => g.upTo === 0)
    .map((g0) => {
      const full = gear.filter((g) => g.tier === g0.tier).at(-1)!;
      return `${n0((g0.expPerHour / full.expPerHour) * 100)}% ở ${REALMS[KD].tiers[g0.tier]} (${n0((g0.expPerHourNewOnly / full.expPerHourNewOnly) * 100)}% nếu chỉ săn bãi mới)`;
    })
    .join(
      ", ",
    )}: không bộ nào BẮT BUỘC cho nhịp (luôn còn loài an toàn, thấp nhất ${n0(minGearRatio(gear) * 100)}%: một số loài chỉ an toàn khi đã có bộ đầu, Xích Mãng ở Sơ kỳ và Độc Thiềm ở Trung kỳ), nhưng mỗi bộ đều làm nhanh hơn và bớt nguy hiểm (khí huyết mất / trận giảm ở mọi hàng): không bộ nào VÔ DỤNG. Ở Hậu kỳ đủ ba bộ nhanh hơn không có bộ nào **${n1(gain)}%** và bớt ~${n0(hau[0].docThiemDanger - hau.at(-1)!.docThiemDanger)} điểm phần trăm khí huyết mất. Bộ III đắt nhất (${n0((eco.bo[2].fee / totalFee) * 100)}% tổng phí) nhưng chỉ thêm ~${n1((hau.at(-1)!.expPerHour / hau.at(-2)!.expPerHour - 1) * 100)}% tu vi / giờ so với bộ II: giá trị của nó nằm ở sức mạnh (công ${n0(boStat(2, "weapon", "atk"))} so với ${n0(boStat(1, "weapon", "atk"))}, PK và trùm), cố ý là chỗ xả Linh thạch cuối game. Công / khí huyết gốc tăng đều giữa các bộ (+${n0((boStat(1, "weapon", "atk") / boStat(0, "weapon", "atk") - 1) * 100)}% / +${n0((boStat(2, "weapon", "atk") / boStat(1, "weapon", "atk") - 1) * 100)}% công, +${n0((boStat(1, "robe", "hp") / boStat(0, "robe", "hp") - 1) * 100)}% / +${n0((boStat(2, "robe", "hp") / boStat(1, "robe", "hp") - 1) * 100)}% khí huyết).
`;
}
