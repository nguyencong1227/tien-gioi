// Nguyên Anh SAU nội dung M7 (M7.9): săn solo bốn loài Hàn Vân, nhịp cả cảnh giới, thu nhập Linh thạch so với phí rèn bộ IV, đan cấp 3.
// Đối xứng với `kim-dan-sau.ts` + `kim-dan-kinh-te.ts`: tính SỐNG từ `shared/` bằng mô hình ở `simulate.ts`, nên đổi số quái / đồ / phí
// thì bảng ở `docs/CAN_BANG.md` đổi theo (`can-bang-sync.test.ts` giữ bản sinh khớp tệp).
import {
  COIN_DROPS,
  DROP_TABLES,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  NGUYEN_ANH_RECIPES,
  REALMS,
  WILD_MONSTERS,
  buyPrice,
  expToNext,
  sellPrice,
  type RecipeDef,
} from "@tien-gioi/shared";
import { huntRate, monsterEconomy, simulate } from "./simulate";
import { dangerFraction, withKimDan } from "./kim-dan-sau";
import { BOSS_PARTY, bestDropper, kimDanEconomy } from "./kim-dan-kinh-te";

const NA = 4;
export const NGUYEN_ANH_MONSTER_IDS = ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc"] as const;
export const NGUYEN_ANH_BOSS_ID = "thien_han_vuong";
/** Đan cấp 3 (hồi 90 %): chỗ xả Linh thạch tuỳ chọn, bán ở Kỳ Thiên Lộc (Hàn Vân Trạm) */
export const PILL_TIER3 = "thuong_hoi_huyet_dan";

/** Nguyên liệu bộ IV: người chơi GIỮ lại để rèn, không bán (nên không tính vào thu nhập). */
export const NGUYEN_ANH_MATERIALS: ReadonlySet<string> = new Set(
  NGUYEN_ANH_RECIPES.flatMap((r) => r.inputs.map((i) => i.itemId)),
);

/**
 * Chạy `fn` với quái Kim Đan VÀ bốn loài Nguyên Anh trong danh sách săn của mô hình (trùm Thiên Hàn Vương không vào: chỉ đánh theo
 * đội, tính riêng bằng `huntRate(boss, ..., BOSS_PARTY)`), rồi khôi phục.
 */
export function withNguyenAnh<T>(fn: () => T): T {
  return withKimDan(() => {
    for (const id of NGUYEN_ANH_MONSTER_IDS)
      if (!WILD_MONSTERS.includes(MONSTER_BY_ID[id])) WILD_MONSTERS.push(MONSTER_BY_ID[id]);
    return fn();
  });
}

const avgDrop = (d: { chance: number; min: number; max: number }) =>
  d.chance * ((d.min + d.max) / 2);
const avgCoin = (id: string) => {
  const c = COIN_DROPS[id];
  return c ? c.chance * ((c.min + c.max) / 2) : 0;
};

export interface SoloCell {
  tier: number;
  monsterId: string;
  /** Tu vi / giờ solo (không tính đan rơi: bốn loài thường không rơi Tụ Khí Đan) */
  expPerHour: number;
  coinPerHour: number;
  killsPerHour: number;
  /** Phần khí huyết (0..) mất mỗi trận */
  danger: number;
}

/** Săn solo từng loài Nguyên Anh ở từng bậc; `null` ở ô không an toàn (mất > 50 % khí huyết / trận). */
export function nguyenAnhSolo(): Record<string, (SoloCell | null)[]> {
  const out: Record<string, (SoloCell | null)[]> = {};
  for (const id of NGUYEN_ANH_MONSTER_IDS) {
    const m = MONSTER_BY_ID[id];
    out[id] = REALMS[NA].tiers.map((_, tier) => {
      const h = huntRate(m, NA, tier);
      const e = monsterEconomy(m, NA, tier);
      if (!h || !e) return null;
      return {
        tier,
        monsterId: id,
        expPerHour: h.rate * 3600,
        coinPerHour: e.totalCoinPerHour,
        killsPerHour: e.killsPerHour,
        danger: dangerFraction(m, NA, tier),
      };
    });
  }
  return out;
}

/** Nhịp riêng cảnh giới Nguyên Anh: từng bậc (nguồn, phút) và tổng giờ (có chuỗi nhiệm vụ, có đột phá thất bại). */
export function nguyenAnhPacing(expMult = 1) {
  const rows = withNguyenAnh(() => simulate(NA, expMult));
  const before = rows.filter((r) => r.realm === NA - 1).at(-1)!.total;
  const tiers = rows
    .filter((r) => r.realm === NA)
    .map((r) => ({
      tier: r.tier,
      label: r.label,
      bar: r.bar,
      source: r.source,
      minutes: r.minutes,
    }));
  return { tiers, hours: (rows.at(-1)!.total - before) / 60 };
}

/** Linh thạch / giờ KHẢ DỤNG khi săn solo `monsterId` ở bậc `tier`: tiền rơi + bán đồ rơi, trừ nguyên liệu bộ IV phải giữ để rèn. */
export function spendableCoinPerHour(monsterId: string, tier: number): number | null {
  const e = monsterEconomy(MONSTER_BY_ID[monsterId], NA, tier);
  if (!e) return null;
  let sale = 0;
  for (const d of DROP_TABLES[monsterId] ?? [])
    if (!NGUYEN_ANH_MATERIALS.has(d.itemId)) sale += avgDrop(d) * sellPrice(d.itemId);
  return e.coinDropPerHour + e.killsPerHour * sale;
}

/** Linh thạch / giờ MỖI NGƯỜI khi cả đội `BOSS_PARTY` săn Thiên Hàn Vương: tiền rơi chia đều, đồ rơi không tính (một chủ). 0 nếu đội không an toàn. */
export function bossCoinPerHour(tier: number): number {
  const h = huntRate(MONSTER_BY_ID[NGUYEN_ANH_BOSS_ID], NA, tier, BOSS_PARTY);
  return h ? ((3600 / h.secPerKill) * avgCoin(NGUYEN_ANH_BOSS_ID)) / BOSS_PARTY : 0;
}

export interface BoGear {
  /** Bậc nhỏ đầu tiên mặc được (0 = Sơ kỳ) */
  tier: number;
  recipes: RecipeDef[];
  /** Tổng phí rèn cả bộ (Linh thạch) */
  fee: number;
  materials: { itemId: string; qty: number; source: string }[];
  /** Giờ cày nguyên liệu (mỗi người): solo cho quái thường, theo đội `BOSS_PARTY` cho trùm */
  soloHours: number;
  bossHours: number;
}

/** Bộ IV (mọi món mặc được từ Sơ kỳ Nguyên Anh): phí, nguyên liệu, giờ cày nguyên liệu (mỗi người). */
export function nguyenAnhBo(): BoGear[] {
  const tiers = [
    ...new Set(NGUYEN_ANH_RECIPES.map((r) => ITEM_BY_ID[r.output.itemId].equip!.reqTier)),
  ];
  return tiers
    .sort((a, b) => a - b)
    .map((tier) => {
      const recipes = NGUYEN_ANH_RECIPES.filter(
        (r) => ITEM_BY_ID[r.output.itemId].equip!.reqTier === tier,
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
        if (m.boss) {
          // Cả đội cần `qty` mỗi người: BOSS_PARTY x qty vật phẩm, mỗi trận một mảnh rơi chung
          const h = huntRate(m, NA, tier, BOSS_PARTY);
          if (h) bossHours += (((BOSS_PARTY * qty) / avgDrop(drop)) * h.secPerKill) / 3600;
        } else {
          // Quái chưa an toàn solo ở bậc này: coi là cày ở bậc kế (số đo gần đúng)
          const h = huntRate(m, NA, tier) ?? huntRate(m, NA, Math.min(2, tier + 1))!;
          soloHours += (qty / avgDrop(drop)) * (h.secPerKill / 3600);
        }
        return { itemId, qty, source };
      });
      return {
        tier,
        recipes,
        fee: recipes.reduce((n, r) => n + (r.coin ?? 0), 0),
        materials,
        soloHours,
        bossHours,
      };
    });
}

export interface EconomyTier {
  tier: number;
  label: string;
  source: string;
  minutes: number;
  /** Linh thạch / giờ khả dụng của nguồn tu vi ở bậc này */
  coinPerHour: number;
  /** Kiếm trong bậc, đã trừ phần hụt do săn trùm theo đội lấy Thiên Hàn Châu */
  earned: number;
  /** Cộng dồn: ví mang vào Nguyên Anh + kiếm tới hết bậc này */
  cumulative: number;
  /** Phí rèn cộng dồn của các bộ mặc được tới bậc này */
  feeCumulative: number;
  surplus: number;
}

/**
 * Thu nhập theo nhịp Nguyên Anh so với phí rèn bộ IV. Ví mang vào = phần dư cuối Kim Đan (không âm: thiếu tiền ở Kim Đan nghĩa là chưa
 * rèn đủ bộ III, ví về 0). Cả năm món bộ IV mặc được từ Sơ kỳ nên toàn bộ phí đáo hạn ở bậc đầu.
 */
export function nguyenAnhEconomy(expMult = 1) {
  const pace = nguyenAnhPacing(expMult);
  const bo = nguyenAnhBo();
  const carry = Math.max(0, kimDanEconomy(expMult).tiers.at(-1)!.surplus);
  let cumulative = carry;
  let feeCumulative = 0;
  const tiers: EconomyTier[] = pace.tiers.map((t) => {
    const coinPerHour = withNguyenAnh(() => spendableCoinPerHour(t.source, t.tier)) ?? 0;
    const b = bo.find((x) => x.tier === t.tier);
    const bossHours = Math.min(b?.bossHours ?? 0, t.minutes / 60);
    const bossLoss = bossHours * Math.max(0, coinPerHour - bossCoinPerHour(t.tier));
    const earned = (t.minutes / 60) * coinPerHour - bossLoss;
    cumulative += earned;
    feeCumulative += b?.fee ?? 0;
    return {
      tier: t.tier,
      label: t.label,
      source: t.source,
      minutes: t.minutes,
      coinPerHour,
      earned,
      cumulative,
      feeCumulative,
      surplus: cumulative - feeCumulative,
    };
  });
  return { tiers, bo, carry, hours: pace.hours };
}

/** Phần thời gian của bậc `tier` dành cho cày nguyên liệu của bộ mặc được từ bậc đó (0..); dưới 1 nghĩa là "rèn kịp" trong bậc. */
export function materialShare(eco: ReturnType<typeof nguyenAnhEconomy>, tier: number): number {
  const b = eco.bo.find((x) => x.tier === tier);
  const t = eco.tiers.find((x) => x.tier === tier);
  return b && t ? ((b.soloHours + b.bossHours) * 60) / t.minutes : 0;
}

/** Số giờ thu nhập (ở bậc `tier`, nguồn tu vi tốt nhất của bậc) để trả MỘT lần toàn bộ phí bộ IV. */
export function feeHours(eco: ReturnType<typeof nguyenAnhEconomy>, tier = 0): number {
  const t = eco.tiers.find((x) => x.tier === tier)!;
  const fee = eco.bo.reduce((n, b) => n + b.fee, 0);
  return fee / t.coinPerHour;
}

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);
const nameOf = (id: string) => MONSTER_BY_ID[id]?.name ?? id;
const itemName = (id: string) => ITEM_BY_ID[id]?.name ?? id;

/** Mục Markdown "Nguyên Anh sau nội dung" cho `docs/CAN_BANG.md`. */
export function renderNguyenAnhSau(): string {
  const solo = withNguyenAnh(() => nguyenAnhSolo());
  const soloRows = REALMS[NA].tiers.flatMap((name, tier) =>
    NGUYEN_ANH_MONSTER_IDS.map((id) => {
      const c = solo[id][tier];
      const label = `${REALMS[NA].name} ${name}`;
      return c
        ? `| ${label} | ${nameOf(id)} | ${n0(c.expPerHour)} | ${n0(c.coinPerHour)} | ${n0(c.killsPerHour)} | ${n0(c.danger * 100)}% |`
        : `| ${label} | ${nameOf(id)} | không an toàn solo (${n0(dangerFraction(MONSTER_BY_ID[id], NA, tier) * 100)}% khí huyết / trận) | – | – | – |`;
    }),
  );
  const eco = nguyenAnhEconomy();
  const boss = MONSTER_BY_ID[NGUYEN_ANH_BOSS_ID];
  const bossRows = REALMS[NA].tiers.map((name, tier) => {
    const cells = [1, 2, 3, 4].map((n) => {
      const h = huntRate(boss, NA, tier, n);
      const d = dangerFraction(boss, NA, tier, n);
      return h ? `${n0(h.rate * 3600)} (${n0(d * 100)}%)` : `không an toàn (${n0(d * 100)}%)`;
    });
    return `| ${REALMS[NA].name} ${name} | ${cells.join(" | ")} |`;
  });
  const paceRows = eco.tiers.map(
    (t) => `| ${t.label} | ${n0(expToNext(NA, t.tier))} | ${nameOf(t.source)} | ${n1(t.minutes)} |`,
  );
  const incomeRows = eco.tiers.map(
    (t) =>
      `| ${t.label} | ${nameOf(t.source)} | ${n0(t.minutes)} | ${n0(t.coinPerHour)} | ${n0(t.earned)} | ${n0(t.cumulative)} | ${n0(t.feeCumulative)} | ${t.surplus >= 0 ? "+" : "-"}${n0(Math.abs(t.surplus))} |`,
  );
  const boRows = eco.bo.map(
    (b) =>
      `| Bộ IV (từ ${REALMS[NA].tiers[b.tier]}) | ${b.recipes.length} | ${n0(b.fee)} | ${b.materials.map((m) => `${m.qty} ${itemName(m.itemId)}`).join(", ")} | ${n1(b.soloHours * 60)} | ${n1(b.bossHours * 60)} | ${n0(materialShare(eco, b.tier) * 100)}% |`,
  );
  const totalFee = eco.bo.reduce((n, b) => n + b.fee, 0);
  const last = eco.tiers.at(-1)!;
  const pill = buyPrice(PILL_TIER3);
  const kd = kimDanEconomy();
  const firstOk = eco.tiers.find((t) => t.surplus >= 0);
  const kdBoIII = kd.bo.at(-1)!;
  const kdTotal = kd.bo.reduce((n, b) => n + b.fee, 0);
  return `## Nguyên Anh sau nội dung (M7.5 / M7.9)

Tính SỐNG từ \`shared/\` bằng mô hình ở trên. Quái mới ở Hàn Vân: Hàn Lang (cấp 16, gồng lao), Phong Nha (17, bắn đạn), Cốt Tượng (17, dày, đập đất), Độc Tước (18, đòn nặng + độc), trùm Thiên Hàn Vương (21, đội 3-4 người). Thanh Nguyên Anh ${REALMS[NA].tiers.map((_, t) => n0(expToNext(NA, t))).join(" / ")}. Thời gian tìm quái lấy theo loài Kim Đan cùng vai (\`ASSUME.searchSec\`): Hàn Vân thưa hơn Âm Sương nên là cận lạc quan, \`search-check.ts\` chưa đo Hàn Vân. Mô hình KHÔNG tính chiêu / hệ / trạng thái (chỉ Kiếm chém, như mọi mục trên) và không tính đồ ba ô riêng (\`ASSUME.useOwnerGear\` tắt; độ nhạy ở mục 5).

### 1. Săn solo (tu vi / giờ, Linh thạch / giờ gồm bán đồ rơi, con / giờ, khí huyết mất / trận)

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ | Khí huyết mất |
|---|---|---:|---:|---:|---:|
${soloRows.join("\n")}

### 2. Trùm Thiên Hàn Vương theo cỡ đội (tu vi / giờ MỖI người, trong ngoặc khí huyết mất / trận)

| Bậc | 1 người | Đội 2 | Đội 3 | Đội 4 |
|---|---:|---:|---:|---:|
${bossRows.join("\n")}

### 3. Nhịp cả cảnh giới Nguyên Anh (phút; có chuỗi nhiệm vụ hiện có, có đột phá thất bại)

Tổng: **${n1(eco.hours)} giờ** solo; mục tiêu 6-9 giờ (\`docs/PHAN_CONG_M7.md\` mục 10). Mô hình bỏ qua nhiệm vụ lặp và thời gian đi lại ngoài \`ASSUME.questOverheadSec\`.

| Bậc | Thanh | Nguồn tốt nhất | Phút |
|---|---:|---|---:|
${paceRows.join("\n")}

### 4. Kinh tế Nguyên Anh: thu nhập so với phí rèn bộ IV

Thu nhập theo nhịp mục 3 (săn solo, mỗi bậc nguồn tốt nhất): tiền rơi cộng bán đồ rơi, TRỪ nguyên liệu bộ IV (người chơi giữ lại để rèn). Ví mang vào Nguyên Anh = phần dư cuối Kim Đan (**${n0(eco.carry)}** Linh thạch; thiếu thì ví về 0). Cả năm món bộ IV mặc được từ Sơ kỳ nên toàn bộ phí đáo hạn ở bậc đầu. Săn trùm theo đội lấy Thiên Hàn Châu (vũ khí cần 2) kiếm ít hơn solo (tiền rơi trùm chia ${BOSS_PARTY} người: ~${n0(bossCoinPerHour(0))} / ${n0(bossCoinPerHour(1))} / ${n0(bossCoinPerHour(2))} Linh thạch / giờ mỗi người ở Sơ / Trung / Hậu kỳ): phần hụt đã trừ.

| Bậc | Nguồn | Phút | Linh thạch / giờ (khả dụng) | Kiếm trong bậc | Cộng dồn | Phí rèn cộng dồn | Dư / thiếu |
|---|---|---:|---:|---:|---:|---:|---:|
${incomeRows.join("\n")}

| Bộ | Món | Phí rèn | Nguyên liệu | Phút cày solo | Phút săn trùm theo đội | So với thời gian ở bậc |
|---|---:|---:|---|---:|---:|---:|
${boRows.join("\n")}

Tổng phí rèn bộ IV **${n0(totalFee)}** Linh thạch = **${n1(feeHours(eco))} giờ** thu nhập Sơ kỳ (so với Kim Đan: bộ III một mình ${n0(kdBoIII.fee)} Linh thạch ~ ${n1(kdBoIII.fee / kd.tiers.at(-1)!.coinPerHour)} giờ thu nhập Hậu kỳ, ba bộ ${n0(kdTotal)} ~ ${n1(kdTotal / kd.tiers.at(-1)!.coinPerHour)} giờ). Có được ${n0(last.cumulative)} tới hết Nguyên Anh: ${last.surplus >= 0 ? `dư ${n0(last.surplus)}` : `thiếu ${n0(-last.surplus)}`}. Đan cấp 3 (\`${PILL_TIER3}\`, ${n0(pill)} Linh thạch / viên) là chỗ xả TUỲ CHỌN: ${n0(eco.tiers[0].coinPerHour / pill)} viên / giờ thu nhập Sơ kỳ.

**Đọc bảng.** ${firstOk ? `Bộ IV trả đủ từ ${firstOk.label} (dư ${n0(firstOk.surplus)} cuối bậc${firstOk.tier > 0 ? `; cuối ${REALMS[NA].tiers[firstOk.tier - 1]} còn thiếu ${n0(-eco.tiers[firstOk.tier - 1].surplus)}` : ""})` : "Bộ IV KHÔNG trả đủ trong cảnh giới"}; cày nguyên liệu chiếm tối đa ${n0(Math.max(...eco.tiers.map((t) => materialShare(eco, t.tier))) * 100)}% thời gian bậc nên nguyên liệu không phải nút cổ chai, tiền mới là. **CHƯA CHỐT (câu hỏi ở \`questions.md\`):** vì cả năm món cùng mặc được từ Sơ kỳ (khác Kim Đan: ba bộ rải ba bậc), sau khi rèn xong Linh thạch còn dư **${n0(last.surplus)}** (${n1(last.surplus / totalFee)}x phí bộ IV) tới hết cảnh giới mà chỉ có đan cấp 3 (${n0(last.surplus / pill)} viên) và kho tông môn làm chỗ tiêu: đúng cảnh báo "dư hàng vạn Linh thạch không có chỗ tiêu" của mục "Kinh tế Linh thạch" (Kim Đan thì thiếu ${n0(Math.max(0, -kd.tiers.at(-1)!.surplus))} cuối cảnh giới). Hướng đề xuất: tách bộ IV thành ba bậc (Sơ / Trung / Hậu kỳ, phí tăng dần như Kim Đan) hoặc nâng phí; chưa đổi vì đụng \`shared/\` (công thức, món đồ, \`reqTier\`) và phải chờ số đo bot thật của C.
`;
}
