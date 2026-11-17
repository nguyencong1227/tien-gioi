// Cân bằng tông môn có chiều sâu TRÊN BẢNG THẬT (M8.7, #844 phần mã `can-bang`): ngày lên cấp tông, sức mua mỗi ngày của cửa hàng
// (`SECT_SHOP`), vòng "Linh thạch -> cống hiến -> hàng -> bán lại", buff. Phân tích bằng giấy của D ở `docs/M8_TONG_MON_MO_PHONG.md` (#918)
// dùng số TRONG THIẾT KẾ; ở đây mọi số tính SỐNG từ `shared/` nên đổi bảng là báo cáo đổi theo và `sectBalanceViolations` đỏ nếu phá bất biến.
import {
  ITEM_BY_ID,
  REALMS,
  SECT_BUFF_DROP_MAX,
  SECT_BUFF_EXP_MAX,
  SECT_CH_VALUE_LT,
  SECT_DEPOSIT_VALUE_PER_CH,
  SECT_EARN_DAY_CAP,
  SECT_LEVELS,
  SECT_QUEST_CH,
  SECT_SHOP,
  WILD_MONSTERS,
  buyPrice,
  sellPrice,
  type SectLevelInfo,
  type SectShopEntry,
} from "@tien-gioi/shared";
import { monsterEconomy, simulate } from "./simulate";

/** Số thành viên TÍCH CỰC dùng để đo tốc độ lên cấp tông (khớp bảng của D ở #918) */
export const SECT_ACTIVE_COUNTS = [1, 2, 3, 5, 10] as const;

/** Bất biến mục 12.6 `THIET_KE_TONG_MON.md`: sức mua tối đa trong ngày không vượt ~1 giờ săn của bậc có thu nhập THẤP NHẤT */
export const SECT_MAX_HUNT_HOURS = 1;

/** Nhịp lên cảnh giới nhanh hơn tối đa / cơ hội rơi đồ tăng tối đa do buff tông (thiết kế: <= 5%) */
export const SECT_BUFF_BUDGET = 0.05;

/** Ngày để tông có `members` người tích cực (mỗi người kiếm `earnPerDay` cống hiến / ngày) đạt `points` điểm tông. */
export function sectDaysToPoints(points: number, members: number, earnPerDay: number): number {
  const perDay = members * earnPerDay;
  return perDay > 0 ? points / perDay : Infinity;
}

/** Một món của cửa hàng cùng các tỉ lệ giá (mọi số TÍNH từ bảng và hàm giá của `shared/`). */
export interface SectShopFact {
  itemId: string;
  name: string;
  minLevel: number;
  cost: number;
  limitDay: number;
  /** Giá mua NPC (Linh thạch) của món, 0 nếu món không có giá trị */
  npcBuy: number;
  /** Giá NPC mua lại */
  npcSell: number;
  /** Sức mua của MỖI cống hiến: giá mua NPC / cống hiến (<= `SECT_CH_VALUE_LT` với món NPC có bán; tu_khi_dan chủ ý rẻ hơn công thức) */
  valuePerCh: number;
  /** Bán lại NPC / (cống hiến x neo 5 LT): cống hiến kiếm bằng nhiệm vụ coi như giá trị cơ hội 5 LT */
  resaleAnchor: number;
  /** Bán lại NPC / (cống hiến x 100 LT): cống hiến mua bằng cách GÓP KHO, tốn Linh thạch thật */
  resaleDeposit: number;
}

export function sectShopFacts(entries: readonly SectShopEntry[] = SECT_SHOP): SectShopFact[] {
  return entries.map((e) => {
    const npcBuy = buyPrice(e.itemId);
    const npcSell = sellPrice(e.itemId);
    return {
      itemId: e.itemId,
      name: ITEM_BY_ID[e.itemId]?.name ?? e.itemId,
      minLevel: e.minLevel,
      cost: e.cost,
      limitDay: e.limitDay,
      npcBuy,
      npcSell,
      valuePerCh: npcBuy / e.cost,
      resaleAnchor: npcSell / (e.cost * SECT_CH_VALUE_LT),
      resaleDeposit: npcSell / (e.cost * SECT_DEPOSIT_VALUE_PER_CH),
    };
  });
}

/**
 * CẬN TRÊN sức mua (Linh thạch theo giá mua NPC) mà MỘT người mua trong MỘT ngày ở cấp tông `level` với `budget` cống hiến:
 * xếp món theo sức mua mỗi cống hiến giảm dần, lấy tới hạn mức `limitDay` (knapsack PHÂN SỐ nên là cận trên của kết quả nguyên).
 */
export function sectDailyMaxValue(
  level: number,
  entries: readonly SectShopEntry[] = SECT_SHOP,
  budget: number = SECT_EARN_DAY_CAP,
): number {
  const facts = sectShopFacts(entries)
    .filter((f) => f.minLevel <= level && f.cost > 0)
    .sort((a, b) => b.valuePerCh - a.valuePerCh);
  let left = budget;
  let value = 0;
  for (const f of facts) {
    if (left <= 0) break;
    const ch = Math.min(left, f.cost * f.limitDay);
    value += ch * f.valuePerCh;
    left -= ch;
  }
  return value;
}

/** Thu nhập Linh thạch / giờ của loại quái săn solo tốt nhất ở bậc đầu cảnh giới `realm` (mô hình `monsterEconomy`); null nếu không săn được. */
export function sectHuntIncome(realm: number): number | null {
  let best: number | null = null;
  for (const m of WILD_MONSTERS) {
    const e = monsterEconomy(m, realm, 0);
    if (e && (best === null || e.totalCoinPerHour > best)) best = e.totalCoinPerHour;
  }
  return best;
}

/** Cảnh giới có thu thập (săn solo được) và thu nhập THẤP NHẤT: mốc "giờ săn" của bất biến 12.6. */
export function sectLowestIncome(): { realm: number; name: string; perHour: number } {
  let low: { realm: number; name: string; perHour: number } | null = null;
  for (let r = 0; r < REALMS.length; r++) {
    const perHour = sectHuntIncome(r);
    if (perHour !== null && (low === null || perHour < low.perHour))
      low = { realm: r, name: REALMS[r]!.name, perHour };
  }
  if (!low) throw new Error("không cảnh giới nào săn solo được");
  return low;
}

/**
 * Các bất biến cân bằng tông môn trên bảng (rỗng = sạch). Tham số mặc định là bảng THẬT; test truyền bảng giả để chứng minh mỗi luật đỏ khi bị phá.
 * 1. KHÔNG vòng lời: bán lại NPC < vốn (cả hai cách quy vốn); 2. sức mua tối đa / ngày <= `SECT_MAX_HUNT_HOURS` giờ săn của bậc thấp nhất, ở MỌI cấp tông;
 * 3. buff không vượt ngân sách `SECT_BUFF_BUDGET` (5% < trần cứng 10% nên đã bao trần cứng).
 */
export function sectBalanceViolations(
  entries: readonly SectShopEntry[] = SECT_SHOP,
  levels: readonly SectLevelInfo[] = SECT_LEVELS,
  lowestPerHour: number = sectLowestIncome().perHour,
): string[] {
  const out: string[] = [];
  for (const f of sectShopFacts(entries)) {
    if (f.resaleAnchor >= 1)
      out.push(
        `${f.itemId}: bán lại NPC ${f.npcSell} >= vốn neo ${f.cost * SECT_CH_VALUE_LT} LT (vòng lời qua cống hiến miễn phí)`,
      );
    if (f.resaleDeposit >= 1)
      out.push(
        `${f.itemId}: bán lại NPC ${f.npcSell} >= vốn góp kho ${f.cost * SECT_DEPOSIT_VALUE_PER_CH} LT (vòng lời Linh thạch -> cống hiến -> hàng -> bán lại)`,
      );
  }
  for (const l of levels) {
    const value = sectDailyMaxValue(l.level, entries);
    const hours = value / lowestPerHour;
    if (hours > SECT_MAX_HUNT_HOURS)
      out.push(
        `cấp tông ${l.level}: sức mua tối đa / ngày ${Math.round(value)} LT = ${hours.toFixed(2)} giờ săn bậc thấp nhất (> ${SECT_MAX_HUNT_HOURS})`,
      );
    const expUp = 1 - 1 / l.buff.exp;
    if (expUp > SECT_BUFF_BUDGET + 1e-9)
      out.push(
        `cấp tông ${l.level}: buff tu vi x${l.buff.exp} làm nhịp lên cảnh giới nhanh ${(expUp * 100).toFixed(1)}% (ngân sách ${SECT_BUFF_BUDGET * 100}%; trần cứng x${SECT_BUFF_EXP_MAX} nằm trên ngân sách nên ngân sách bắt trước)`,
      );
    if (l.buff.drop - 1 > SECT_BUFF_BUDGET + 1e-9)
      out.push(
        `cấp tông ${l.level}: buff rơi đồ x${l.buff.drop} vượt ngân sách +${SECT_BUFF_BUDGET * 100}% (trần cứng x${SECT_BUFF_DROP_MAX} nằm trên ngân sách)`,
      );
  }
  return out;
}

const f1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const f2 = (n: number) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Phần "Tông môn có chiều sâu" của `docs/CAN_BANG.md` (sinh từ bảng thật). */
export function renderSectEconomy(): string {
  const questCh = SECT_QUEST_CH.reduce((a, b) => a + b, 0);
  const facts = sectShopFacts();
  const levelPts = SECT_LEVELS.slice(1);
  const dayRows = (earn: number) =>
    SECT_ACTIVE_COUNTS.map(
      (n) =>
        `| ${n} | ${f1(n * earn)} | ${levelPts.map((l) => f1(sectDaysToPoints(l.points, n, earn))).join(" | ")} |`,
    ).join("\n");
  const levelHead = levelPts
    .map((l) => `Cấp ${l.level} (${l.points.toLocaleString("vi-VN")})`)
    .join(" | ");
  const lowest = sectLowestIncome();
  const incomes = REALMS.map((r, i) => ({ name: r.name, perHour: sectHuntIncome(i) })).filter(
    (x): x is { name: string; perHour: number } => x.perHour !== null && x.perHour > 0,
  );
  const refRealms = incomes.slice(0, 4); // Phàm Nhân .. Kim Đan: các bậc có người dùng cửa hàng tông môn
  const shopRows = SECT_LEVELS.map((l) => {
    const opened = facts.filter((f) => f.minLevel <= l.level);
    const value = sectDailyMaxValue(l.level);
    const hours = refRealms.map((r) => f2(value / r.perHour)).join(" | ");
    return `| ${l.level} (${l.name}) | ${opened.length} | ${Math.round(value).toLocaleString("vi-VN")} | ${hours} |`;
  }).join("\n");
  const maxAnchor = facts.reduce((a, b) => (b.resaleAnchor > a.resaleAnchor ? b : a));
  const maxDeposit = facts.reduce((a, b) => (b.resaleDeposit > a.resaleDeposit ? b : a));
  const maxValuePerCh = facts.reduce((a, b) => (b.valuePerCh > a.valuePerCh ? b : a));
  const sellable = facts.filter((f) => f.npcSell > 0).length;
  const violations = sectBalanceViolations();
  const buffRows = SECT_LEVELS.map(
    (l) =>
      `| ${l.level} (${l.name}) | x${l.buff.exp.toFixed(2)} | ${f1((1 - 1 / l.buff.exp) * 100)}% | x${l.buff.drop.toFixed(2)} | +${f1((l.buff.drop - 1) * 100)}% |`,
  ).join("\n");
  // Đan tu luyện mua bằng cống hiến: thanh tu vi tiết kiệm mỗi ngày so với nhịp bậc (mô hình `simulate`, Luyện Khí -> Trúc Cơ)
  const tuKhi = SECT_SHOP.find((e) => e.itemId === "tu_khi_dan");
  const tuKhiRaw = ITEM_BY_ID["tu_khi_dan"]?.effect;
  const tuKhiEff = tuKhiRaw && tuKhiRaw.kind === "exp" ? tuKhiRaw : null;
  const tuKhiCap = tuKhiEff?.maxExp ?? Infinity;
  const sim = simulate(2);
  let tuKhiRows = "";
  if (tuKhi && tuKhiEff) {
    const pick = [
      sim.find((r) => r.realm === 1 && r.tier === 4),
      sim.find((r) => r.realm === 1 && r.tier === 8),
      sim.find((r) => r.realm === 2 && r.tier === 1),
    ];
    tuKhiRows = pick
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => {
        const perPill = Math.min(r.bar * tuKhiEff.pct, tuKhiCap);
        const gain = perPill * tuKhi.limitDay;
        const savedMin = (gain / r.bar) * r.minutes;
        return `| ${r.label} | ${Math.round(r.bar).toLocaleString("vi-VN")} | ${Math.round(perPill)} | ${Math.round(gain)} | ${f1(savedMin)} phút (${f1((gain / r.bar) * 100)}% thanh) |`;
      })
      .join("\n");
  }
  return `## Tông môn có chiều sâu trên BẢNG THẬT (M8.7, #844)

> Phần này sinh từ \`server/src/balance/tong-mon.ts\`, tính SỐNG từ \`SECT_LEVELS\`, \`SECT_QUEST_CH\`, \`SECT_SHOP\` (${facts.length} món) và hàm giá của \`shared/src/currency.ts\`; phân tích bằng giấy (số trong thiết kế) ở \`docs/M8_TONG_MON_MO_PHONG.md\`.
> Bất biến giữ bằng \`sectBalanceViolations\` (test \`tong-mon.test.ts\`): không vòng lời, sức mua / ngày <= ${SECT_MAX_HUNT_HOURS} giờ săn bậc thấp nhất, buff <= ${SECT_BUFF_BUDGET * 100}%.

### 1. Ngày lên cấp tông theo số thành viên tích cực

Điểm tông = tổng cống hiến MỌI thành viên từng kiếm (chỉ tăng). Trần mỗi người ${SECT_EARN_DAY_CAP} cống hiến / ngày; ba nhiệm vụ / ngày = ${questCh} (độ khó ${SECT_QUEST_CH.join(" + ")}).

**Cả trần (${SECT_EARN_DAY_CAP} / người / ngày: nhiệm vụ + góp kho + bí cảnh), số NGÀY tới từng cấp:**

| Tích cực | điểm / ngày | ${levelHead} |
|:-:|--:|${levelPts.map(() => "--:").join("|")}|
${dayRows(SECT_EARN_DAY_CAP)}

**Chỉ làm nhiệm vụ (${questCh} / người / ngày):**

| Tích cực | điểm / ngày | ${levelHead} |
|:-:|--:|${levelPts.map(() => "--:").join("|")}|
${dayRows(questCh)}

Lên cấp là chuyện của TUẦN, không phải GIỜ: tông 3 người tích cực đạt cấp 5 sau ${f1(sectDaysToPoints(SECT_LEVELS.at(-1)!.points, 3, SECT_EARN_DAY_CAP) / 7)} tuần (cả trần) tới ${f1(sectDaysToPoints(SECT_LEVELS.at(-1)!.points, 3, questCh) / 7)} tuần (chỉ nhiệm vụ).

### 2. Sức mua mỗi ngày của cửa hàng thật

Cận trên giá trị (Linh thạch theo GIÁ MUA NPC) một người mua trong một ngày với ${SECT_EARN_DAY_CAP} cống hiến (knapsack phân số theo sức mua mỗi cống hiến, tới hạn mức \`limitDay\` của từng món). Cột còn lại: sức mua đó bằng bao nhiêu GIỜ săn solo của cảnh giới (loại quái tốt nhất ở bậc đầu, \`monsterEconomy\`).

| Cấp tông | món đã mở | sức mua tối đa / ngày (LT) | ${refRealms.map((r) => `giờ săn ${r.name} (${Math.round(r.perHour).toLocaleString("vi-VN")} LT/h)`).join(" | ")} |
|:-:|--:|--:|${refRealms.map(() => "--:").join("|")}|
${shopRows}

- Mốc bất biến: bậc thu nhập thấp nhất là **${lowest.name}** (${Math.round(lowest.perHour).toLocaleString("vi-VN")} LT/h); sức mua tối đa ở cấp 5 = **${f2(sectDailyMaxValue(SECT_LEVELS.at(-1)!.level) / lowest.perHour)} giờ** (<= ${SECT_MAX_HUNT_HOURS}). Cửa hàng là tiện lợi / phần thưởng tham gia, không phải chỗ kiếm tiền.
- Sức mua cao nhất mỗi cống hiến: **${f2(maxValuePerCh.valuePerCh)} LT / cống hiến** (${maxValuePerCh.name}); neo thiết kế là ${SECT_CH_VALUE_LT}. Chỉ món NPC KHÔNG bán (Tụ Khí Đan, rẻ hơn công thức chủ ý) có thể vượt neo; mọi món NPC có bán bị \`sectShopViolations\` giữ <= ${SECT_CH_VALUE_LT}.

### 3. Vòng Linh thạch -> cống hiến -> hàng -> bán lại

Một món mua bằng \`cost\` cống hiến rồi bán lại NPC (\`sellPrice\`). Vốn tính hai cách: (a) cống hiến kiếm bằng nhiệm vụ coi như đáng ${SECT_CH_VALUE_LT} LT (neo); (b) cống hiến có được bằng GÓP KHO, ${SECT_DEPOSIT_VALUE_PER_CH} LT giá trị = 1 cống hiến (Linh thạch thật). Vòng có lời khi bán lại / vốn >= 1.

| Cách quy vốn | bán lại / vốn LỚN NHẤT trên ${sellable} món có giá bán | món |
|---|--:|---|
| (a) neo ${SECT_CH_VALUE_LT} LT / cống hiến | ${f2(maxAnchor.resaleAnchor)} | ${maxAnchor.name} (cost ${maxAnchor.cost}, bán ${maxAnchor.npcSell} LT) |
| (b) góp kho ${SECT_DEPOSIT_VALUE_PER_CH} LT / cống hiến | ${f2(maxDeposit.resaleDeposit)} | ${maxDeposit.name} (cost ${maxDeposit.cost}, bán ${maxDeposit.npcSell} LT) |

${violations.length === 0 ? "**Không có vòng lời** (mọi tỉ lệ < 1); hàng mua bằng cống hiến không rửa Linh thạch." : `**VI PHẠM bất biến (${violations.length}):**\n\n${violations.map((v) => `- ${v}`).join("\n")}`}

### 4. Buff cấp tông

Buff gắn vào tu vi cá nhân / rơi đồ / hồi phục, KHÔNG gắn vào điểm tông nên không tạo vòng tăng tốc lên cấp. Ngân sách thiết kế: nhịp lên cảnh giới nhanh hơn <= ${SECT_BUFF_BUDGET * 100}%, rơi đồ <= +${SECT_BUFF_BUDGET * 100}%; trần cứng x${SECT_BUFF_EXP_MAX} / x${SECT_BUFF_DROP_MAX}.

| Cấp tông | buff tu vi | nhịp lên cảnh giới nhanh hơn | buff rơi đồ | rơi đồ |
|:-:|--:|--:|--:|--:|
${buffRows}
${
  tuKhiRows
    ? `
### 5. Đường tắt Tụ Khí Đan mua bằng cống hiến

Tụ Khí Đan (cấp tông ${tuKhi!.minLevel}, ${tuKhi!.cost} cống hiến, tối đa ${tuKhi!.limitDay} viên / ngày) cộng ${(tuKhiEff!.pct * 100).toFixed(0)}% thanh tu vi, tối đa ${tuKhiCap} tu vi mỗi viên. Mua đủ hạn mức mỗi ngày tốn ${tuKhi!.cost * tuKhi!.limitDay} / ${SECT_EARN_DAY_CAP} cống hiến của ngày. Thời gian tiết kiệm theo nhịp bậc (mô hình \`simulate\`, có chuỗi nhiệm vụ):

| Bậc | thanh tu vi | tu vi / viên | tu vi / ngày | tiết kiệm / ngày |
|---|--:|--:|--:|---|
${tuKhiRows}
`
    : ""
}`;
}
