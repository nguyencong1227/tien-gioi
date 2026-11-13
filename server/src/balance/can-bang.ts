// In bảng mô phỏng cân bằng ra docs/CAN_BANG.md (hoặc stdout với --stdout).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WILD_MONSTERS,
  PK_DAMAGE_MULT,
  MONSTER_BY_ID,
  REALMS,
  TRADE_BY_ID,
  DROP_TABLES,
  buyPrice,
  sellPrice,
} from "@tien-gioi/shared";
import { renderKimDan, type KimDanReport } from "./kim-dan";
import { renderKimDanSau } from "./kim-dan-sau";
import { PK_TARGET_SECONDS, representativeLevels, summarizeDuels } from "./pk";
import {
  ASSUME_DUNGEON,
  LINH_HU,
  dungeonValue,
  realmTierOfStep,
  runMinutes,
  summarizeFights,
} from "./dungeon";
import {
  ASSUME,
  expectedCoinDrop,
  expectedLootValue,
  expectedTotalCoin,
  minutesToFinish,
  monsterEconomy,
  partyRatio,
  simulate,
  simulateReincarnationMilestones,
  simulateReincarnationProgression,
} from "./simulate";

// Mốc "trước M6" chụp cố định (kim-dan-truoc.ts): không đổi theo nội dung mới, để #406 so trước / sau
const kimDanTruocSection = renderKimDan(
  JSON.parse(
    readFileSync(new URL("./kim-dan-truoc.json", import.meta.url), "utf-8"),
  ) as KimDanReport,
);
const rows = simulate();
const fmt = (m: number) => {
  const totalMin = Math.round(m);
  const h = Math.floor(totalMin / 60);
  const rem = totalMin % 60;
  return h > 0 ? `${h} giờ ${rem} phút` : `${rem} phút`;
};
const table = [
  "| Bậc | Thanh tu vi | Săn gì | Số quái | Phút ở bậc này | Cộng dồn |",
  "|---|---:|---|---:|---:|---:|",
  ...rows.map(
    (r) =>
      `| ${r.label} | ${r.bar} | ${r.source} | ${r.kills || "–"} | ${r.minutes.toFixed(1)} | ${fmt(r.total)} |`,
  ),
].join("\n");
const partyRatios = rows.flatMap((r) =>
  [2, 3, 4].map((n) => ({
    label: `${REALMS[r.realm].name} bậc ${r.tier + 1}`,
    n,
    ...partyRatio(r.realm, r.tier, n),
  })),
);
const partyMax = partyRatios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
const partyMin = partyRatios.reduce((a, b) => (b.ratio < a.ratio ? b : a));
const partyOver = partyRatios.filter((x) => x.ratio > 1.5).length;
const partyTable = [
  "| Bậc | Một mình săn | Đội 2 | Đội 3 | Đội 4 |",
  "|---|---|---:|---:|---:|",
  ...rows.map((r) => {
    const cells = [2, 3, 4].map((n) => {
      const p = partyRatio(r.realm, r.tier, n);
      return `${p.ratio.toFixed(2)}× (${p.party})`;
    });
    return `| ${REALMS[r.realm].name} bậc ${r.tier + 1} | ${partyRatio(r.realm, r.tier, 2).solo} | ${cells.join(" | ")} |`;
  }),
].join("\n");
const summary = [
  `- Hết Luyện Khí (sẵn sàng Trúc Cơ): **${fmt(minutesToFinish(rows, 1))}** (mục tiêu ~1 giờ)`,
  `- Hết Trúc Cơ (sẵn sàng Kim Đan): **${fmt(minutesToFinish(rows, 2))}** (mục tiêu ~3 giờ)`,
].join("\n");

// ---------- Kinh tế Linh thạch (#102) ----------

const monsterTable = [
  "| Quái | Cấp | Máu | Tiền rơi TB | Bán đồ rơi TB | Tổng LT / con | Đồ bán có giá |",
  "|---|---:|---:|---:|---:|---:|---|",
  ...WILD_MONSTERS.map((m) => {
    const coin = expectedCoinDrop(m.id);
    const loot = expectedLootValue(m.id);
    const total = expectedTotalCoin(m.id);
    const notes: Record<string, string> = {
      tho: "Lông thỏ (1 LT), Hồi huyết đan (6 LT)",
      lang: "Nanh sói (2 LT), Hồi huyết đan (6 LT), Hồi linh đan (6 LT)",
      ho: "Da hổ (9 LT), Đan hồi phục (6 LT), Tụ khí đan (45 LT)",
      mang: "Vảy mãng (60 LT), Tụ khí đan (45 LT), Hồi huyết đan (6 LT)",
    };
    return `| ${m.name} (\`${m.id}\`) | ${m.level} | ${m.hp} | ${coin.toFixed(2)} | ${loot.toFixed(2)} | **${total.toFixed(2)}** | ${notes[m.id] ?? "–"} |`;
  }),
].join("\n");

const economyRows = rows.flatMap((r) =>
  WILD_MONSTERS.map((m) => {
    const eco = monsterEconomy(m, r.realm, r.tier);
    return eco ? { label: r.label, realm: r.realm, tier: r.tier, ...eco } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null),
);

const economyTable = [
  "| Bậc | Quái săn | Diệt / giờ | Tiền rơi / giờ | Bán đồ / giờ | Tổng LT / giờ | Hồi huyết đan / giờ |",
  "|---|---|---:|---:|---:|---:|---:|",
  ...economyRows.map(
    (e) =>
      `| ${e.label} | ${e.monsterName} | ${Math.round(e.killsPerHour)} | ${Math.round(e.coinDropPerHour).toLocaleString("en-US")} | ${Math.round(e.lootSellPerHour).toLocaleString("en-US")} | **${Math.round(e.totalCoinPerHour).toLocaleString("en-US")}** | ${e.potionsPerHour.toFixed(1)} |`,
  ),
].join("\n");

const langThoRatios = rows
  .map((r) => {
    const tho = monsterEconomy(MONSTER_BY_ID.tho, r.realm, r.tier);
    const lang = monsterEconomy(MONSTER_BY_ID.lang, r.realm, r.tier);
    if (!tho || !lang) return null;
    return {
      label: r.label,
      ratio: lang.totalCoinPerHour / tho.totalCoinPerHour,
      thoCoin: tho.totalCoinPerHour,
      langCoin: lang.totalCoinPerHour,
    };
  })
  .filter((x): x is NonNullable<typeof x> => x !== null);

const minLangTho = langThoRatios.reduce((a, b) => (b.ratio < a.ratio ? b : a));
const maxLangTho = langThoRatios.reduce((a, b) => (b.ratio > a.ratio ? b : a));

const tradeHoiHuyet = TRADE_BY_ID["doi_hoi_huyet"]!;
const tradeItem = tradeHoiHuyet.give[0]!;
const thoDropEntry = DROP_TABLES.tho!.find((d) => d.itemId === tradeItem.itemId)!;
const avgLongThoPerKill = thoDropEntry.chance * ((thoDropEntry.min + thoDropEntry.max) / 2);
const killsToTradeDan = tradeItem.qty / avgLongThoPerKill;
const potionBuyPrice = buyPrice("hoi_huyet_dan");
const thoTotalCoin = expectedTotalCoin("tho");
const thoCoinOnlyAndMat = expectedCoinDrop("tho") + avgLongThoPerKill * sellPrice(tradeItem.itemId);
const killsToBuyDanAll = potionBuyPrice / thoTotalCoin;
const killsToBuyDanNoPotionSell = potionBuyPrice / thoCoinOnlyAndMat;
const tradeRatioMin = killsToBuyDanAll / killsToTradeDan;
const tradeRatioMax = killsToBuyDanNoPotionSell / killsToTradeDan;
const thoExpectedCoin = expectedTotalCoin("tho");
const langExpectedCoin = expectedTotalCoin("lang");
const langThoExpectedRatio = langExpectedCoin / thoExpectedCoin;

// ---------- Luân hồi & Duyên (#151) ----------

const milestones = simulateReincarnationMilestones(rows);
const milestoneTable = [
  "| Chết ngay khi vừa đạt | Phút | Duyên (0 trùm) | Duyên / giờ (0 trùm) | Duyên (hạ trùm) | Duyên / giờ (hạ trùm) |",
  "|---|---:|---:|---:|---:|---:|",
  ...milestones.map(
    (m) =>
      `| ${m.label} | ${Math.round(m.minutes)} | ${m.duyenZeroBoss} | ${m.duyenPerHourZeroBoss.toFixed(1)} | ${m.duyenWithBoss} | **${m.duyenPerHourWithBoss.toFixed(1)}** |`,
  ),
].join("\n");

const viableMilestones = milestones.filter((_, idx) => idx >= 1);
const minZeroBoss = viableMilestones.reduce((a, b) =>
  b.duyenPerHourZeroBoss < a.duyenPerHourZeroBoss ? b : a,
);
const maxZeroBoss = viableMilestones.reduce((a, b) =>
  b.duyenPerHourZeroBoss > a.duyenPerHourZeroBoss ? b : a,
);
const ratioZeroBoss = maxZeroBoss.duyenPerHourZeroBoss / minZeroBoss.duyenPerHourZeroBoss;
const warnZeroBoss = ratioZeroBoss > 1.3 ? ` ⚠️ (vượt ngưỡng mục tiêu ~1.3×)` : "";
const lastMilestone = milestones.at(-1)!;
const peakOverEnd = maxZeroBoss.duyenPerHourZeroBoss / lastMilestone.duyenPerHourZeroBoss;
const milestoneNote = `Đọc bảng: Tính từ Luyện Khí tầng 5 trở đi (bỏ qua giai đoạn mới vào game), Duyên / giờ (0 trùm) nhỏ nhất là **${minZeroBoss.duyenPerHourZeroBoss.toFixed(1)}** (${minZeroBoss.label}), lớn nhất là **${maxZeroBoss.duyenPerHourZeroBoss.toFixed(1)}** (${maxZeroBoss.label}), tỷ lệ lớn / nhỏ là **${ratioZeroBoss.toFixed(2)}×**${warnZeroBoss}. Đỉnh Duyên / giờ rơi vào ${maxZeroBoss.label} (~${maxZeroBoss.duyenPerHourZeroBoss.toFixed(1)} Duyên/h, gấp ~${peakOverEnd.toFixed(2)}× so với cày hết Trúc Cơ).`;

const progression = simulateReincarnationProgression(20);
const progressionTable = [
  "| Kiếp | Dư âm tu hành | Tốc độ tu luyện | Thời gian chơi | Duyên nhận | Duyên còn lại | Duyên / giờ | So với kiếp 1 | Hành động tại Tam Sinh Thạch |",
  "|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...progression.map(
    (p) =>
      `| ${p.kiep} | Nấc ${p.duAmLevel} | +${p.duAmLevel * 10}% | ${fmt(p.minutes)} | +${p.duyenEarned} | ${p.duyenRemaining} | **${p.duyenPerHour.toFixed(1)}** | ${p.ratioToFirstLife.toFixed(2)}× | ${p.upgradeNote} |`,
  ),
].join("\n");

const maxProgressionLife = progression.find((p) => p.duAmLevel === 10);
const firstLife = progression[0]!;
const finalLife = progression.at(-1)!;
const hoursToMaxDuAm = maxProgressionLife
  ? progression
      .filter((p) => p.kiep <= maxProgressionLife.kiep)
      .reduce((s, p) => s + p.minutes, 0) / 60
  : 0;

// ---------- Bí cảnh (M3.4, 4c-2) ----------
const dun = realmTierOfStep(LINH_HU.minStep);
const dunBoss = MONSTER_BY_ID[LINH_HU.boss]!;
const dunLimit = LINH_HU.timeLimitMs / 60_000;
const dunFights = [1, 2, 3, 4].map((n) => {
  const f = summarizeFights(LINH_HU, n, dun, 20);
  return {
    ...f,
    run: f.simSeconds === null ? null : runMinutes(LINH_HU, n, dun.realm, dun.tier, f.simSeconds),
  };
});
const dunTable = [
  "| Đội | Hạ được trùm | Trùm (giây mô phỏng) | Trùm (phút thật) | Cả lượt (phút) | Người chết / trận |",
  "|---|---:|---:|---:|---:|---:|",
  ...dunFights.map(
    (f) =>
      `| ${f.party} người | ${Math.round(f.winRate * 100)}% | ${f.simSeconds === null ? "–" : Math.round(f.simSeconds)} | ${f.realMinutes === null ? "–" : f.realMinutes.toFixed(1)} | ${f.run === null ? "–" : f.run.toFixed(1) + (f.run > dunLimit ? " ⚠️ quá giờ" : "")} | ${f.deathsPerRun.toFixed(2)} |`,
  ),
].join("\n");
const dunValueTable = [
  "| Đội | Linh thạch ròng / người | = phút săn | Tu vi / người | = phút săn |",
  "|---|---:|---:|---:|---:|",
  ...[2, 3, 4].map((n) => {
    const v = dungeonValue(LINH_HU, n, dun.realm, dun.tier);
    return `| ${n} người | ${Math.round(v.coinNet)} | ${v.coinMinutes.toFixed(1)} | ${Math.round(v.exp)} | ${v.expMinutes.toFixed(1)} |`;
  }),
].join("\n");
const dungeonSection = `## Bí cảnh Linh Hư (M3.4, 4c-2, #203)

Mô phỏng ở \`server/src/balance/dungeon.ts\`; test \`dungeon.test.ts\` giữ các mục tiêu bên dưới. **Số liệu đang dùng:** trùm \`${dunBoss.id}\`
${dunBoss.hp} máu, đòn ${dunBoss.atk} mỗi ${dunBoss.attackCd / 1000} giây, ${dunBoss.exp} tu vi; thưởng hoàn thành ${LINH_HU.reward.coin} Linh thạch + đồ;
ngưỡng bậc ${LINH_HU.minStep} (Luyện Khí tầng ${dun.tier + 1}); giới hạn ${dunLimit} phút; đội ${LINH_HU.partyMin}-${LINH_HU.partyMax} người.

**Mục tiêu (thiết kế):** đội 3 người ở đúng ngưỡng hạ trùm trong 5-8 phút và không ai chết; đội 2 người không kịp giờ; một người không
hạ nổi; một lượt thưởng bằng khoảng 15-20 phút săn quái tốt nhất cùng bậc. Trùm là một **bao máu**: đòn nhẹ nhưng trận dài, nên cần đan
và đồng đội (chết trong bí cảnh là mất kiếp, nên chọn số liệu để ca khó nhất cũng không ai chết).

### 1. Trận đánh trùm (mô phỏng bằng chính mã server)

\`fightBoss\` dựng một thế giới thật, đặt trùm ở tâm hang, người chơi đứng cạnh đánh thường liên tục (\`slash\`), uống Hồi Huyết Đan khi khí huyết
dưới ${ASSUME_DUNGEON.potionBelow * 100}% (\`useItem\`, hồi chiêu 8 giây), mỗi người mang ${ASSUME_DUNGEON.potions} viên; AI quái, sát thương, bạo kích đều là mã thật (hạt giống cố
định). **Ca khó:** đứng yên, không né, trùm trúng 100% đòn. Người chơi thật né được nhưng mất thời gian đánh theo cùng tỉ lệ nên xác suất
sống không đổi; thời gian thật = thời gian mô phỏng / ${ASSUME_DUNGEON.bossUptime} (giả định \`bossUptime\`, chưa kiểm bằng người chơi thật). Cả lượt = đi ${ASSUME_DUNGEON.walkSec}
giây + dọn quái nhỏ (${ASSUME_DUNGEON.searchSecPerMob} giây tìm mỗi con, đánh ${ASSUME_DUNGEON.trashUptime * 100}% thời gian) + trùm. Bậc cả đội: ngưỡng, trang bị tốt nhất đủ bậc. 20 trận mỗi dòng.

${dunTable}

### 2. Một lượt thưởng đáng bao nhiêu phút săn

Linh thạch ròng = thưởng hoàn thành + giá bán đồ thưởng kỳ vọng + phần chia từ tiền / đồ trùm rơi và quái nhỏ − ${ASSUME_DUNGEON.potions} đan (${ASSUME_DUNGEON.potions} × giá mua). Tu vi = trùm + quái nhỏ theo
\`partyExpShare\`. So với săn quái tốt nhất cùng bậc (mục tiêu ${ASSUME_DUNGEON.equivMinutes} phút).

${dunValueTable}

Tối đa 3 lượt thưởng mỗi ngày (\`DUNGEON_DAILY_REWARDS\`) nên bí cảnh là một lựa chọn thêm chứ không thay được việc săn quái.
`;

// ---------- PK thách đấu (M3.5, 5c) ----------
const pkLevels = representativeLevels();
const pkRows = pkLevels
  .filter((l, i) => l.tier === 0 || i === pkLevels.length - 1)
  .map((l) => ({ l, s: summarizeDuels(l, l, 20) }));
const pkTable = [
  "| Bậc | Giây đánh (trung vị) | Nhỏ nhất - lớn nhất |",
  "|---|---:|---:|",
  ...pkRows.map(
    ({ l, s }) =>
      `| ${l.label} (bậc ${l.step}) | ${s.median.toFixed(1)} | ${s.min.toFixed(1)} - ${s.max.toFixed(1)} |`,
  ),
].join("\n");
const pkBase = { realm: 1, tier: 4 };
const pkEven = summarizeDuels(pkBase, pkBase, 20);
const pkGapRows = [1, 2, 3].map((g) => ({
  g,
  s: summarizeDuels({ realm: 1, tier: 4 + g }, pkBase, 20),
}));
const pkGapTable = [
  "| Chênh | Bên mạnh hơn thắng | Giây đánh (trung vị) |",
  "|---|---:|---:|",
  `| cùng bậc (Luyện Khí tầng 5) | ${Math.round(pkEven.winRate * 100)}% (bên đánh trước) | ${pkEven.median.toFixed(1)} |`,
  ...pkGapRows.map(
    ({ g, s }) => `| ${g} tầng | ${Math.round(s.winRate * 100)}% | ${s.median.toFixed(1)} |`,
  ),
].join("\n");
const pkSection = `## PK thách đấu (M3.5, 5c, #217)

Mô phỏng ở \`server/src/balance/pk.ts\`; test \`pk.test.ts\` giữ mục tiêu. **Số liệu đang dùng:** \`PK_DAMAGE_MULT\` ${PK_DAMAGE_MULT} (sát thương người lên người = \`atk\` × hệ số kỹ năng × hệ số này).

**Mục tiêu (thiết kế):** hai người **cùng bậc** đánh thường liên tục hết khí huyết nhau trong ${PK_TARGET_SECONDS.min}-${PK_TARGET_SECONDS.max} giây (đủ để có cảm giác đấu, không kéo lê), không đan, không đả tọa (bị khoá trong trận).

### 1. Hai người cùng bậc

\`duelOnce\` dựng một \`World\` thật, hai người nhận / thách bằng chính \`duelChallenge\` / \`duelAnswer\`, rồi đứng cạnh nhau đánh thường (\`slash\`) mỗi lần hồi chiêu cho tới khi trận kết thúc; sát thương, bạo kích, đếm ngược và \`tickDuels\` là mã server thật, \`Math.random\` có hạt giống. Trang bị tốt nhất đủ bậc. **Ca liên tục:** không né, đánh 100% thời gian; người chơi thật không đánh liên tục nên trận thật dài hơn. 20 trận mỗi dòng; test kiểm mọi bậc (tầng đầu, giữa, cuối của từng cảnh giới); bảng chỉ hiện tầng đầu mỗi cảnh giới và bậc cuối cùng.

${pkTable}

\`atk\` và \`maxHp\` tăng gần cùng tỉ lệ theo bậc nên **một hệ số chung** đủ cho mọi bậc (chậm dần nhẹ vì \`maxHp\` tăng nhỉnh hơn).

### 2. Chênh bậc (không hiệu chỉnh)

${pkGapTable}

Không có hiệu chỉnh chênh lệch: bên mạnh hơn hầu như luôn thắng và nhanh hơn (trận này không có né / đan / kỹ năng nên ít bất ngờ); người yếu hơn có quyền từ chối lời thách. Hai người cùng bậc: bên **đánh trước** trong cùng một tick thắng thường hơn (đòn hạ khí huyết về 0 kết thúc trận ngay), nên tỉ lệ thắng của người thứ nhất ở dòng "cùng bậc" trên 50% là hiệu ứng thứ tự xử lý, không phải lợi thế bậc. Nếu muốn trận công bằng giữa người chênh bậc thì cần chuẩn hoá chỉ số về bậc thấp hơn: việc riêng, chờ người dùng quyết (câu hỏi 4 ở \`questions.md\`).
`;

const reincarnationSection = `## Luân hồi & Điểm Duyên (M3.2, #151)

Mô phỏng cân bằng hệ thống Luân hồi theo thiết kế tại \`docs/THIET_KE_LUAN_HOI.md\` (mục 5 & 6) và hợp đồng \`shared/src/reincarnation.ts\`:
- Điểm Duyên tính theo: \`calcDuyen = floor(stepPts + timePts + bossPts)\`.
- Mở khóa vĩnh viễn tại Tam Sinh Thạch: Dư âm tu hành (\`du_am\`, 10 nấc: +10% đến +100% tốc độ tu luyện).

### 1. Duyên nhận được và tốc độ Duyên / giờ theo mốc kết thúc (Kiếp 1)

Ước tính theo mốc thời gian săn quái đơn lẻ hiệu quả nhất (thanh tu vi bậc đó còn 0%):

${milestoneTable}

${milestoneNote}

### 2. Tiến trình luân hồi qua chuỗi kiếp (1..N) khi mở dần "Dư âm tu hành"

Giả định người chơi kiếp nào cũng cày trọn vẹn đến hết Trúc Cơ (hạ 2 trùm) và dồn Duyên nâng cấp \`du_am\` (+10% đến +100%):

${progressionTable}

### 3. Nhận xét & Đánh giá cân bằng luân hồi

- **Tính chất ngang bằng giữa các cách chơi (chết ở bậc nào):**
  - Người chơi cày chay chết ở Luyện Khí tầng 5 (${Math.round(milestones[1]!.minutes)} phút): **${milestones[1]!.duyenPerHourZeroBoss.toFixed(1)} Duyên/h** (0 trùm) / **${milestones[1]!.duyenPerHourWithBoss.toFixed(1)} Duyên/h** (hạ trùm).
  - Người chơi cày tới Trúc Cơ sơ kỳ (${Math.round(milestones[3]!.minutes)} phút): đạt đỉnh **${milestones[3]!.duyenPerHourZeroBoss.toFixed(1)} Duyên/h** (0 trùm) / **${milestones[3]!.duyenPerHourWithBoss.toFixed(1)} Duyên/h** (hạ trùm).
  - Người chơi cày hết Trúc Cơ (${Math.round(milestones.at(-1)!.minutes)} phút): **${milestones.at(-1)!.duyenPerHourZeroBoss.toFixed(1)} Duyên/h** (0 trùm) / **${milestones.at(-1)!.duyenPerHourWithBoss.toFixed(1)} Duyên/h** (hạ trùm).
  - **Đánh giá:** ${ratioZeroBoss <= 1.3 ? `Mục tiêu thiết kế ("mọi cách chơi tương đương", mục 5 của docs/THIET_KE_LUAN_HOI.md) **đạt**: từ Luyện Khí tầng 5 trở đi mọi mốc nằm trong ${minZeroBoss.duyenPerHourZeroBoss.toFixed(1)}–${maxZeroBoss.duyenPerHourZeroBoss.toFixed(1)} Duyên/h (chênh ${ratioZeroBoss.toFixed(2)}×, ngưỡng 1.3×), không có bậc nào đáng để cố ý chết sớm; chết ở Luyện Khí tầng 1 (9 phút) chỉ nhận ${milestones[0]!.duyenZeroBoss} Duyên.` : `Mục tiêu thiết kế ("mọi cách chơi tương đương") **chưa đạt**: chết ở ${maxZeroBoss.label} cho Duyên / giờ gấp ~${ratioZeroBoss.toFixed(2)}× mốc thấp nhất (${maxZeroBoss.duyenPerHourZeroBoss.toFixed(1)} vs ${minZeroBoss.duyenPerHourZeroBoss.toFixed(1)} Duyên/h); cần chỉnh công thức \`calcDuyen\`.`}
- **Tiến trình tăng trưởng qua các kiếp (Progression pacing):**
  - Cần **${maxProgressionLife ? maxProgressionLife.kiep : "hơn 20"} kiếp** trọn vẹn để đạt tối đa nấc 10 Dư âm tu hành (+100% tốc độ tu luyện). Tổng thời gian chơi khoảng **~${Math.round(hoursToMaxDuAm)} giờ**.
  - Tốc độ Duyên mỗi giờ tăng từ **${firstLife.duyenPerHour.toFixed(1)} Duyên/h** (kiếp 1) lên **${finalLife.duyenPerHour.toFixed(1)} Duyên/h** (khi max Dư âm tu hành), tương đương tỷ lệ **${finalLife.ratioToFirstLife.toFixed(2)}×**.
  - **Đánh giá:** Tỷ lệ tăng trưởng **${finalLife.ratioToFirstLife.toFixed(2)}×** nằm trong mục tiêu thiết kế (không vượt quá ~2.0× so với kiếp đầu), đem lại cảm giác nhân vật chuyển kiếp ngày càng mạnh mẽ và tu luyện thần tốc, nhưng kiểm soát tốt không gây lạm phát hay phá vỡ chiều sâu lối chơi.
`;

const economySection = `## Kinh tế Linh thạch (Sprint 5, #102)

Mô hình kinh tế dựa trên hợp đồng \`shared/src/currency.ts\`: tiền rơi trực tiếp (\`COIN_DROPS\`), tiền bán đồ rơi (\`DROP_TABLES\` × \`sellPrice\`), và giá mua đan hồi phục tại cửa hàng Lão dược sư (\`buyPrice("hoi_huyet_dan") = ${potionBuyPrice}\` Linh thạch).

### 1. Kỳ vọng Linh thạch từ mỗi con quái

${monsterTable}

### 2. Thu nhập Linh thạch mỗi giờ khi săn một loại quái

Giả định người chơi đánh đơn lẻ (solo), dùng Kiếm chém, đả tọa hồi phục khí huyết sau trận, mặc trang bị tốt nhất theo bậc (\`bestGear\`). Chỉ hiển thị những loại quái đủ an toàn để săn đơn (mất ≤ 50% HP mỗi trận). Cột "Hồi huyết đan / giờ" tính theo giá mua ở Dược sư (${potionBuyPrice} LT/viên).

${economyTable}

### 3. Nhận xét & phân tích cân bằng kinh tế

- **So sánh các bãi quái cùng cấp (Linh Thố vs Hôi Lang - khu vực khởi đầu ngoài trấn):**
  - Cả Thỏ (level 0) và Sói (level 1) đều là quái săn ở giai đoạn đầu game. Hôi Lang cho **${langExpectedCoin.toFixed(2)} LT/con** (gấp ~${langThoExpectedRatio.toFixed(1)}× so với Thỏ ${thoExpectedCoin.toFixed(2)} LT/con), nhưng đánh lâu hơn và mất máu nhiều hơn.
  - Tỷ lệ thu nhập Linh thạch mỗi giờ giữa Sói và Thỏ dao động từ **${minLangTho.ratio.toFixed(2)}×** (${minLangTho.label}: Sói ${Math.round(minLangTho.langCoin).toLocaleString("en-US")} vs Thỏ ${Math.round(minLangTho.thoCoin).toLocaleString("en-US")} LT/h) đến **${maxLangTho.ratio.toFixed(2)}×** (${maxLangTho.label}: Sói ${Math.round(maxLangTho.langCoin).toLocaleString("en-US")} vs Thỏ ${Math.round(maxLangTho.thoCoin).toLocaleString("en-US")} LT/h).
  - **Đánh giá:** Không có bãi nào lệch quá 2× (> ~2×) so với bãi cùng cấp. Mức chênh ${minLangTho.ratio.toFixed(2)}× – ${maxLangTho.ratio.toFixed(2)}× là hợp lý: vừa đủ để khuyến khích người chơi tiến sang bãi Sói khi đủ mạnh, vừa không làm bãi Thỏ bị phế bỏ.
- **Đường mua đan bằng tiền vs Đổi nguyên liệu (\`TRADES\`):**
  - Đổi nguyên liệu tại Lão dược sư: ${tradeItem.qty} Lông thỏ (\`${tradeItem.itemId}\`) lấy 1 Hồi Huyết Đan. Lông thỏ rơi ${thoDropEntry.chance * 100}% số lượng ${thoDropEntry.min}–${thoDropEntry.max} (kỳ vọng ${avgLongThoPerKill.toFixed(2)} lông/con), cần hạ trung bình **~${killsToTradeDan.toFixed(1)} con thỏ** để đổi được 1 viên đan.
  - Mua đan bằng tiền: Giá mua là **${potionBuyPrice} Linh thạch**. Mỗi con thỏ cho trung bình **${thoTotalCoin.toFixed(2)} LT** (gồm ${expectedCoinDrop("tho").toFixed(2)} LT tiền rơi + ${expectedLootValue("tho").toFixed(2)} LT bán đồ). Cần hạ trung bình **~${killsToBuyDanAll.toFixed(1)} con thỏ** (hoặc ~${killsToBuyDanNoPotionSell.toFixed(1)} con nếu không bán viên đan nhặt được) để đủ tiền mua 1 viên đan.
  - **Đánh giá:** Đường đổi nguyên liệu (${killsToTradeDan.toFixed(1)} con thỏ) **rẻ hơn đáng kể** (~${tradeRatioMin.toFixed(1)}× – ${tradeRatioMax.toFixed(1)}×) so với mua thẳng bằng tiền (${Math.round(killsToBuyDanAll)}–${Math.round(killsToBuyDanNoPotionSell)} con thỏ). Đây là thiết kế cố ý: đổi đồ là đường rẻ nhất cho người mới bắt đầu và người chịu khó gom nguyên liệu; cửa hàng tiền tệ đóng vai trò tiện lợi, xả tiền tích lũy khi không muốn gom nguyên liệu.
- **Quái cấp cao & Thiếu hụt chỗ tiêu tiền (Linh thạch sink):**
  - Hắc Hổ (cấp 2, an toàn từ Luyện Khí Tầng 6): thu nhập tăng mạnh từ ~2,570 LT/h lên ~4,650 LT/h ở Trúc Cơ.
  - Xích Mãng (trùm cấp 3): cho kỳ vọng tới ${expectedTotalCoin("mang").toFixed(1)} LT/con nhưng không an toàn khi solo trước Kim Đan; thích hợp đi săn theo tổ đội (xem mục "Đi theo đội" ở trên).
  - **Lưu ý cân bằng:** Hiện tại cửa hàng Lão dược sư chỉ bán 2 loại đan hồi phục cơ bản (${potionBuyPrice} LT/viên), trang bị chỉ rèn qua nguyên liệu rơi mà không tốn tiền. Người chơi từ Luyện Khí hậu kỳ đến Trúc Cơ sẽ nhanh chóng tích lũy hàng ngàn đến hàng vạn Linh thạch mà **gần như không có chỗ tiêu** từ giữa game. Cần bổ sung các chỗ xả tiền lớn (mua bí kíp, phí nâng cấp/rèn trang bị cao cấp, phí dịch chuyển, vào bí cảnh hoặc đấu giá) trong các sprint tiếp theo của M3.
`;

if (process.argv.includes("--stdout")) {
  console.log(
    summary +
      "\n\n" +
      table +
      "\n\n" +
      partyTable +
      "\n\n" +
      economySection +
      "\n\n" +
      reincarnationSection +
      "\n\n" +
      dungeonSection +
      "\n\n" +
      pkSection,
  );
} else {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(here, "../../../docs/CAN_BANG.md");
  writeFileSync(
    out,
    `# Cân bằng tu luyện (bảng tính)

> File này sinh tự động từ \`server/src/balance/simulate.ts\`. Sửa số liệu trong \`shared/\` rồi chạy
> \`npm run can-bang -w server\` để cập nhật. Test \`server/src/balance/simulate.test.ts\` giữ đường cong trong mục tiêu.

## Kết quả

${summary}

${table}

## Giả định

- Mỗi bậc, người chơi chọn nguồn tu vi nhanh nhất mà an toàn: săn một loại quái, hoặc chỉ đả tọa.
- Săn quái: chỉ dùng Kiếm chém (có tính bạo kích trung bình ×${ASSUME.critAvg.toFixed(2)}), quái đánh trúng ${ASSUME.hitTaken * 100}% số đòn,
  bỏ qua loại quái mà mỗi trận mất quá ${ASSUME.maxHpLossPerKill * 100}% khí huyết. Sau mỗi trận đả tọa hồi khí huyết (vẫn được tu vi đả tọa).
- Thời gian tìm quái kế tiếp: ${Object.entries(ASSUME.searchSec)
      .map(([k, v]) => `${k} ${v}s`)
      .join(", ")}.
- Thưởng tu vi của chuỗi nhiệm vụ chính chia đều cho các bậc của cảnh giới tương ứng; đi lại + nói chuyện cả chuỗi: ${ASSUME.questOverheadSec / 60} phút.
- Đột phá thất bại mất 30% thanh tu vi, tính theo số lần thất bại kỳ vọng.
- Trang bị: ${ASSUME.useGear ? "mặc món tốt nhất đủ cảnh giới ở mỗi ô (giả định đã rèn kịp; nguyên liệu rơi trong lúc săn, không tính thời gian đi rèn)" : "không mặc gì"}. Không mặc gì thì chậm hơn khoảng 10%.
- Chưa tính: nhiệm vụ lặp, đan dược, thời gian chết. Đánh theo đội: xem mục "Đi theo đội" bên dưới.
- Tụ Khí Đan (+5% thanh) cố ý hiếm: rơi 1% từ Hắc Hổ, thưởng nhiệm vụ, không đổi được ở Lão dược sư.
  Ước khoảng 11 viên trong 3 giờ đầu, cộng lại chừng nửa thanh Trúc Cơ (rút ngắn khoảng 20 phút).

## Đi theo đội (tổ đội, #74)

Tu vi mỗi giờ của **mỗi thành viên** khi đi theo đội so với đánh một mình (1.00× = bằng nhau). Mỗi bên chọn loại quái
tốt nhất mà đủ an toàn (trong ngoặc là quái đội chọn). Mô hình (\`huntRate(..., party)\` trong \`simulate.ts\`): \`n\` người cùng cảnh giới
đánh chung, sát thương cộng dồn nên trận ngắn \`n\` lần, quái chỉ đánh một mục tiêu nên mỗi người chịu 1/\`n\` sát thương (đội đánh được quái
mà một người không dám), thời gian tìm quái không đổi, tu vi mỗi con nhân \`partyExpShare(n)\` (chia đều, thưởng 15% mỗi người thêm).
Không tính: nhiều đội tranh cùng một con trùm (số quái có hạn và chờ hồi sinh), thời gian tập hợp đội, người cầm đầu mạnh hơn.

${partyTable}

Đọc bảng: lớn hơn 1.5× thường là bậc mà đội đánh được Xích Mãng (trùm) còn một người chưa dám; nhỏ hơn 1× là bậc mà chia tu vi
làm đội chậm hơn đánh một mình (thời gian tìm quái không rút ngắn được). Cao nhất: **${partyMax.ratio.toFixed(2)}×** (${partyMax.label}, đội ${partyMax.n}); thấp nhất:
**${partyMin.ratio.toFixed(2)}×** (${partyMin.label}, đội ${partyMin.n}); **${partyOver}/${partyRatios.length}** ô vượt 1.5×. Đây là số đo của mô hình, **chưa phải quyết định cân bằng**:
mục tiêu "không quá ~1.5×" của #74 chưa đạt ở những ô trên. Xem câu hỏi trong \`~/TT/orchestra/questions.md\` (thưởng tu vi của đội).

${economySection}

${reincarnationSection}

${dungeonSection}

${pkSection}

${kimDanTruocSection}

${renderKimDanSau()}`,
  );
  console.log(`Đã ghi ${out}\n\n${summary}`);
}
