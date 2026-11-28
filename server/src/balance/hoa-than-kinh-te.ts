// Hóa Thần SAU nội dung (D1 #1466 lát A3): săn solo sáu loài sói Lang Hoang, nhịp cả cảnh giới, thu nhập Linh thạch so với phí rèn bộ V.
// Đối xứng (rút gọn) với `nguyen-anh-kinh-te.ts`: tính SỐNG từ `shared/` bằng mô hình ở `simulate.ts`, nên đổi số quái / đồ / phí thì bảng ở
// `docs/CAN_BANG.md` đổi theo (`can-bang-sync.test.ts` giữ bản sinh khớp tệp). Chưa có trùm (lát B) nên không có mục trùm theo đội.
import {
  DROP_TABLES,
  HOA_THAN_RECIPES,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  REALMS,
  WILD_MONSTERS,
  expToNext,
  sellPrice,
} from "@tien-gioi/shared";
import { huntRate, monsterEconomy, simulate } from "./simulate";
import { dangerFraction } from "./kim-dan-sau";
import { withNguyenAnh, nguyenAnhEconomy } from "./nguyen-anh-kinh-te";

const HT = 5;
export const HOA_THAN_MONSTER_IDS = [
  "da_lang",
  "hac_phong_lang",
  "huyet_nguyet_lang",
  "xich_diem_lang",
  "thuong_nguyet_lang",
  "ngan_nguyet_lang",
] as const;

/** Nguyên liệu bộ V: người chơi GIỮ lại để rèn, không bán (nên không tính vào thu nhập). */
export const HOA_THAN_MATERIALS: ReadonlySet<string> = new Set(
  HOA_THAN_RECIPES.flatMap((r) => r.inputs.map((i) => i.itemId)),
);

/** Chạy `fn` với quái Kim Đan, Nguyên Anh VÀ sáu sói Hóa Thần trong danh sách săn của mô hình, rồi khôi phục. */
export function withHoaThan<T>(fn: () => T): T {
  return withNguyenAnh(() => {
    for (const id of HOA_THAN_MONSTER_IDS)
      if (!WILD_MONSTERS.includes(MONSTER_BY_ID[id])) WILD_MONSTERS.push(MONSTER_BY_ID[id]);
    return fn();
  });
}

const avgDrop = (d: { chance: number; min: number; max: number }) =>
  d.chance * ((d.min + d.max) / 2);

export interface SoloCell {
  tier: number;
  monsterId: string;
  expPerHour: number;
  coinPerHour: number;
  killsPerHour: number;
  /** Phần khí huyết (0..) mất mỗi trận */
  danger: number;
}

/** Săn solo từng sói ở từng bậc Hóa Thần; `null` ở ô không an toàn (mất > 50 % khí huyết / trận). */
export function hoaThanSolo(): Record<string, (SoloCell | null)[]> {
  const out: Record<string, (SoloCell | null)[]> = {};
  for (const id of HOA_THAN_MONSTER_IDS) {
    const m = MONSTER_BY_ID[id];
    out[id] = REALMS[HT].tiers.map((_, tier) => {
      const h = huntRate(m, HT, tier);
      const e = monsterEconomy(m, HT, tier);
      if (!h || !e) return null;
      return {
        tier,
        monsterId: id,
        expPerHour: h.rate * 3600,
        coinPerHour: e.totalCoinPerHour,
        killsPerHour: e.killsPerHour,
        danger: dangerFraction(m, HT, tier),
      };
    });
  }
  return out;
}

/** Nhịp cảnh giới Hóa Thần: từng bậc (nguồn, phút) và tổng giờ (có chuỗi nhiệm vụ, có đột phá thất bại). */
export function hoaThanPacing(expMult = 1) {
  const rows = withHoaThan(() => simulate(HT, expMult));
  const before = rows.filter((r) => r.realm === HT - 1).at(-1)!.total;
  const tiers = rows
    .filter((r) => r.realm === HT)
    .map((r) => ({
      tier: r.tier,
      label: r.label,
      bar: r.bar,
      source: r.source,
      minutes: r.minutes,
    }));
  return { tiers, hours: (rows.at(-1)!.total - before) / 60 };
}

/** Linh thạch / giờ KHẢ DỤNG khi săn solo `monsterId` ở bậc `tier`: tiền rơi + bán đồ rơi, trừ nguyên liệu bộ V phải giữ để rèn. */
export function spendableCoinPerHour(monsterId: string, tier: number): number | null {
  const e = monsterEconomy(MONSTER_BY_ID[monsterId], HT, tier);
  if (!e) return null;
  let sale = 0;
  for (const d of DROP_TABLES[monsterId] ?? [])
    if (!HOA_THAN_MATERIALS.has(d.itemId)) sale += avgDrop(d) * sellPrice(d.itemId);
  return e.coinDropPerHour + e.killsPerHour * sale;
}

export interface BoGear {
  fee: number;
  materials: { itemId: string; qty: number; source: string; hours: number }[];
  /** Giờ cày nguyên liệu (mỗi người, solo) */
  hours: number;
}

/**
 * Bộ V (cả ba món mặc được từ Sơ kỳ Hóa Thần): phí, nguyên liệu, giờ cày. Mỗi nguyên liệu cày ở loài rơi nhiều nhất trong sáu loài; loài chưa an toàn solo
 * ở bậc 0 thì tính ở bậc kế an toàn (cận lạc quan), không có bậc nào an toàn thì theo ĐỘI 2 người ở Hậu kỳ.
 */
export function hoaThanBo(): BoGear {
  const need = new Map<string, number>();
  for (const r of HOA_THAN_RECIPES)
    for (const g of r.inputs) need.set(g.itemId, (need.get(g.itemId) ?? 0) + g.qty);
  const materials = [...need].map(([itemId, qty]) => {
    let source = "";
    let best = -1;
    for (const id of HOA_THAN_MONSTER_IDS) {
      const d = DROP_TABLES[id]?.find((x) => x.itemId === itemId);
      if (d && avgDrop(d) > best) {
        best = avgDrop(d);
        source = id;
      }
    }
    const m = MONSTER_BY_ID[source];
    const h =
      huntRate(m, HT, 0) ?? huntRate(m, HT, 1) ?? huntRate(m, HT, 2) ?? huntRate(m, HT, 2, 2)!;
    return { itemId, qty, source, hours: (qty / best) * (h.secPerKill / 3600) };
  });
  return {
    fee: HOA_THAN_RECIPES.reduce((n, r) => n + (r.coin ?? 0), 0),
    materials,
    hours: materials.reduce((n, m) => n + m.hours, 0),
  };
}

export interface EconomyTier {
  tier: number;
  label: string;
  source: string;
  minutes: number;
  coinPerHour: number;
  earned: number;
  cumulative: number;
  feeCumulative: number;
  surplus: number;
}

/**
 * Thu nhập theo nhịp Hóa Thần so với phí rèn bộ V. Ví mang vào = phần dư cuối Nguyên Anh (không âm). Cả ba món mặc được từ Sơ kỳ nên toàn bộ phí đáo hạn ở bậc đầu.
 */
export function hoaThanEconomy(expMult = 1) {
  const pace = hoaThanPacing(expMult);
  const bo = withHoaThan(() => hoaThanBo());
  const carry = Math.max(0, nguyenAnhEconomy(expMult).tiers.at(-1)!.surplus);
  let cumulative = carry;
  const tiers: EconomyTier[] = pace.tiers.map((t) => {
    const coinPerHour = withHoaThan(() => spendableCoinPerHour(t.source, t.tier)) ?? 0;
    const earned = (t.minutes / 60) * coinPerHour;
    cumulative += earned;
    const feeCumulative = bo.fee;
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

/** Số giờ thu nhập (ở bậc `tier`) để trả MỘT lần toàn bộ phí bộ V. */
export function feeHours(eco: ReturnType<typeof hoaThanEconomy>, tier = 0): number {
  return eco.bo.fee / eco.tiers.find((x) => x.tier === tier)!.coinPerHour;
}

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);
const nameOf = (id: string) => MONSTER_BY_ID[id]?.name ?? id;
const itemName = (id: string) => ITEM_BY_ID[id]?.name ?? id;

/** Mục Markdown "Hóa Thần sau nội dung" cho `docs/CAN_BANG.md`. */
export function renderHoaThanSau(): string {
  const solo = withHoaThan(() => hoaThanSolo());
  const soloRows = REALMS[HT].tiers.flatMap((name, tier) =>
    HOA_THAN_MONSTER_IDS.map((id) => {
      const c = solo[id][tier];
      const label = `${REALMS[HT].name} ${name}`;
      return c
        ? `| ${label} | ${nameOf(id)} | ${n0(c.expPerHour)} | ${n0(c.coinPerHour)} | ${n0(c.killsPerHour)} | ${n0(c.danger * 100)}% |`
        : `| ${label} | ${nameOf(id)} | không an toàn solo (${n0(dangerFraction(MONSTER_BY_ID[id], HT, tier) * 100)}% khí huyết / trận) | – | – | – |`;
    }),
  );
  const eco = hoaThanEconomy();
  const paceRows = eco.tiers.map(
    (t) => `| ${t.label} | ${n0(expToNext(HT, t.tier))} | ${nameOf(t.source)} | ${n1(t.minutes)} |`,
  );
  const incomeRows = eco.tiers.map(
    (t) =>
      `| ${t.label} | ${nameOf(t.source)} | ${n0(t.minutes)} | ${n0(t.coinPerHour)} | ${n0(t.earned)} | ${n0(t.cumulative)} | ${n0(t.feeCumulative)} | ${t.surplus >= 0 ? "+" : "-"}${n0(Math.abs(t.surplus))} |`,
  );
  const matRows = eco.bo.materials.map(
    (m) => `| ${itemName(m.itemId)} | ${m.qty} | ${nameOf(m.source)} | ${n1(m.hours * 60)} |`,
  );
  const first = eco.tiers[0];
  const last = eco.tiers.at(-1)!;
  const firstOk = eco.tiers.find((t) => t.surplus >= 0);
  return `## Hóa Thần sau nội dung (D1 #1466 lát A3)

Tính SỐNG từ \`shared/\` bằng mô hình ở trên. Sáu sói Lang Hoang (\`docs/QUAI_HOA_THAN_DE_XUAT.md\` mục 3): Dã Lang (cấp 19, gồng lao), Hắc Phong Lang (20, bắn đạn), Huyết Nguyệt Lang (21, gồng lao nhanh), Xích Diễm Lang (21, đòn nặng), Thương Nguyệt Lang (20, dày, đập đất), Ngân Nguyệt Lang (21, đòn nặng nhất). Người chơi mặc bộ V (kiếm / bào / phù, \`docs/KHUNG_HOA_THAN.md\` mục 4.2). Chưa có trùm (lát B) nên chưa có mục trùm theo đội.

### 1. Săn solo (tu vi / giờ, Linh thạch / giờ gồm bán đồ rơi, con / giờ, khí huyết mất / trận)

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ | Khí huyết mất |
|---|---|---:|---:|---:|---:|
${soloRows.join("\n")}

### 2. Nhịp cả cảnh giới Hóa Thần (phút; có chuỗi nhiệm vụ hiện có, có đột phá thất bại)

Tổng: **${n1(eco.hours)} giờ** solo; mục tiêu ~4,6 giờ theo mô hình khung (\`docs/KHUNG_HOA_THAN.md\` mục 3), ~4 giờ theo QUYET_DINH_M3 mục 30 (tu vi x2, máu x1,5). Mô hình bỏ qua nhiệm vụ lặp và thời gian đi lại.

| Bậc | Thanh | Nguồn tốt nhất | Phút |
|---|---:|---|---:|
${paceRows.join("\n")}

### 3. Kinh tế Hóa Thần: thu nhập so với phí rèn bộ V

Thu nhập theo nhịp mục 2 (săn solo, mỗi bậc nguồn tốt nhất): tiền rơi cộng bán đồ rơi, TRỪ nguyên liệu bộ V (người chơi giữ lại để rèn). Ví mang vào Hóa Thần = phần dư cuối Nguyên Anh (**${n0(eco.carry)}** Linh thạch). Cả ba món bộ V mặc được từ Sơ kỳ nên toàn bộ phí đáo hạn ở bậc đầu.

| Bậc | Nguồn | Phút | Linh thạch / giờ (khả dụng) | Kiếm trong bậc | Cộng dồn | Phí rèn cộng dồn | Dư / thiếu |
|---|---|---:|---:|---:|---:|---:|---:|
${incomeRows.join("\n")}

| Nguyên liệu bộ V | Cần | Cày ở | Phút cày solo |
|---|---:|---|---:|
${matRows.join("\n")}

Tổng phí rèn bộ V **${n0(eco.bo.fee)}** Linh thạch = **${n1(feeHours(eco))} giờ** thu nhập Sơ kỳ; cày đủ nguyên liệu mất **${n1(eco.bo.hours * 60)} phút** solo (**${n0(((eco.bo.hours * 60) / first.minutes) * 100)}%** thời gian Sơ kỳ).

**Đọc bảng.** ${firstOk ? `Bộ V trả đủ từ ${firstOk.label} (dư ${n0(firstOk.surplus)} cuối bậc${firstOk.tier > 0 ? `; cuối ${REALMS[HT].tiers[firstOk.tier - 1]} còn thiếu ${n0(-eco.tiers[firstOk.tier - 1].surplus)}` : ""}).` : `Bộ V chưa trả đủ tới hết Hóa Thần (thiếu ${n0(-last.surplus)}): giảm phí rèn hoặc tăng tiền rơi.`} Số khởi đầu: lát B (trùm) và đo lại bằng bot / người chơi thật sẽ chỉnh tiếp.
`;
}
