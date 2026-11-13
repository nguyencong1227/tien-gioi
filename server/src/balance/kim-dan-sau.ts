// Kim Đan SAU nội dung M6 (#403): số đo của bãi mới so với Xích Mãng, trùm theo cỡ đội, nhịp cả cảnh giới. Đối xứng với `kim-dan.ts`
// ("trước M6", ảnh chụp cố định); mục này tính SỐNG từ `shared/` nên đổi số quái / đồ là bảng đổi theo.
import {
  DROP_TABLES,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  REALMS,
  SKILLS,
  WILD_MONSTERS,
  expPillGain,
  expToNext,
  statsFor,
  type MonsterKind,
} from "@tien-gioi/shared";
import {
  ASSUME,
  bestGear,
  huntRate,
  monsterEconomy,
  partyRatio,
  simulate,
  simulateReincarnationMilestones,
  simulateReincarnationProgression,
} from "./simulate";

const KD = 3;
export const KIM_DAN_MONSTER_IDS = ["suong_ho", "thach_quy", "doc_thiem"] as const;
export const KIM_DAN_BOSS_ID = "hac_giao";

/** Phần khí huyết (0..) mất mỗi trận khi `party` người cùng bậc đánh `m` (cùng công thức `huntRate`). */
export function dangerFraction(m: MonsterKind, realm: number, tier: number, party = 1): number {
  const s = statsFor(realm, tier, bestGear(realm, tier));
  const dps = (s.atk * SKILLS.slash.mult * ASSUME.critAvg) / (SKILLS.slash.cooldown / 1000);
  const fight = m.hp / (dps * party);
  return ((m.atk / (m.attackCd / 1000)) * fight * ASSUME.hitTaken) / party / s.maxHp;
}

/** Tu vi / giờ solo kể cả đan Tụ Khí Đan rơi (có trần `maxExp`); null nếu không an toàn. */
export function rateWithPills(m: MonsterKind, tier: number): number | null {
  const h = huntRate(m, KD, tier);
  if (!h) return null;
  const e = DROP_TABLES[m.id]?.find((d) => d.itemId === "tu_khi_dan");
  const eff = ITEM_BY_ID.tu_khi_dan.effect;
  const perKill =
    e && eff?.kind === "exp"
      ? e.chance * ((e.min + e.max) / 2) * expPillGain(eff, expToNext(KD, tier))
      : 0;
  return h.rate * 3600 + (3600 / h.secPerKill) * perKill;
}

/**
 * Chạy `fn` với quái Kim Đan được thêm vào danh sách săn của mô hình (và bỏ Xích Mãng nếu `noMang`, và thêm trùm Hắc Giao nếu
 * `withBoss`: dùng cho bảng đội, vì trùm chỉ đánh được theo đội), rồi khôi phục.
 */
export function withKimDan<T>(fn: () => T, noMang = false, withBoss = false): T {
  const saved = [...WILD_MONSTERS];
  const ids: string[] = withBoss
    ? [...KIM_DAN_MONSTER_IDS, KIM_DAN_BOSS_ID]
    : [...KIM_DAN_MONSTER_IDS];
  for (const id of ids)
    if (!WILD_MONSTERS.includes(MONSTER_BY_ID[id])) WILD_MONSTERS.push(MONSTER_BY_ID[id]);
  if (noMang) {
    const keep = WILD_MONSTERS.filter((m) => m.id !== "mang");
    WILD_MONSTERS.length = 0;
    WILD_MONSTERS.push(...keep);
  }
  try {
    return fn();
  } finally {
    WILD_MONSTERS.length = 0;
    WILD_MONSTERS.push(...saved);
  }
}

/** Luân hồi khi cày tới hết Kim Đan (#406 mục 4): các mốc dừng và tiến trình qua kiếp, tính SỐNG từ `shared/` + mô hình. */
export function kimDanReincarnation(maxLives = 40) {
  const milestones = withKimDan(() => simulateReincarnationMilestones(simulate(KD, 1.0)));
  // Từ Luyện Khí tầng 5 (bỏ giai đoạn mới vào game), cùng tiêu chí với mục "Luân hồi & Điểm Duyên" mục 3
  const viable = milestones.filter((m) => m.realm > 1 || m.tier >= 4);
  const lo = viable.reduce((a, b) => (b.duyenPerHourZeroBoss < a.duyenPerHourZeroBoss ? b : a));
  const hi = viable.reduce((a, b) => (b.duyenPerHourZeroBoss > a.duyenPerHourZeroBoss ? b : a));
  const progression = withKimDan(() => simulateReincarnationProgression(maxLives, KD));
  return {
    milestones,
    lo,
    hi,
    ratio: hi.duyenPerHourZeroBoss / lo.duyenPerHourZeroBoss,
    progression,
  };
}

/** Bảng "Đi theo đội" ở Kim Đan: tu vi / giờ mỗi người so với săn solo tốt nhất (đội được thêm trùm Hắc Giao). */
export function kimDanPartyRows() {
  return REALMS[KD].tiers.map((name, tier) => ({
    label: `${REALMS[KD].name} ${name}`,
    tier,
    cells: [2, 3, 4].map((n) => ({ n, ...withKimDan(() => partyRatio(KD, tier, n), false, true) })),
  }));
}

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);

/** Mục Markdown "Kim Đan sau nội dung" cho `docs/CAN_BANG.md`. */
export function renderKimDanSau(): string {
  const tiers = REALMS[KD].tiers.map((name, tier) => ({
    tier,
    label: `${REALMS[KD].name} ${name}`,
    bar: expToNext(KD, tier),
  }));
  const solo = tiers.flatMap((t) =>
    ["mang", ...KIM_DAN_MONSTER_IDS].map((id) => {
      const m = MONSTER_BY_ID[id];
      const r = rateWithPills(m, t.tier);
      const e = monsterEconomy(m, KD, t.tier);
      const h = huntRate(m, KD, t.tier);
      return r === null || !e || !h
        ? `| ${t.label} | ${m.name} | không an toàn solo (${n0(dangerFraction(m, KD, t.tier) * 100)}% khí huyết / trận) | – | – | – |`
        : `| ${t.label} | ${m.name} | ${n0(r)} | ${n0(e.totalCoinPerHour)} | ${n0(3600 / h.secPerKill)} | ${n0(dangerFraction(m, KD, t.tier) * 100)}% |`;
    }),
  );
  const boss = MONSTER_BY_ID[KIM_DAN_BOSS_ID];
  const bossRows = tiers.map((t) => {
    const cells = [1, 2, 3, 4].map((n) => {
      const h = huntRate(boss, KD, t.tier, n);
      return h
        ? `${n0(h.rate * 3600)} (${n0(dangerFraction(boss, KD, t.tier, n) * 100)}%)`
        : `không an toàn (${n0(dangerFraction(boss, KD, t.tier, n) * 100)}%)`;
    });
    const best =
      withKimDan(() =>
        Math.max(...[...WILD_MONSTERS].map((m) => huntRate(m, KD, t.tier)?.rate ?? 0)),
      ) * 3600;
    const p3 = huntRate(boss, KD, t.tier, 3);
    return `| ${t.label} | ${cells.join(" | ")} | ${p3 ? n1((p3.rate * 3600) / best) + "x" : "–"} |`;
  });
  const tcRows = withKimDan(() => simulate(KD - 1));
  const tc = [0, tcRows.filter((r) => r.realm <= 1).at(-1)!.total, tcRows.at(-1)!.total];
  const optimal = withKimDan(() => simulate(KD));
  const designed = withKimDan(() => simulate(KD), true);
  const rowOf = (rows: ReturnType<typeof simulate>, tier: number) =>
    rows.find((r) => r.realm === KD && r.tier === tier)!;
  const before = (rows: ReturnType<typeof simulate>) =>
    rows.filter((r) => r.realm === KD - 1).at(-1)!.total;
  const hoursOf = (rows: ReturnType<typeof simulate>) => (rows.at(-1)!.total - before(rows)) / 60;
  const pacing = tiers.map((t) => {
    const a = rowOf(optimal, t.tier);
    const b = rowOf(designed, t.tier);
    return `| ${t.label} | ${n0(t.bar)} | ${MONSTER_BY_ID[a.source]?.name ?? a.source} | ${n1(a.minutes)} | ${MONSTER_BY_ID[b.source]?.name ?? b.source} | ${n1(b.minutes)} |`;
  });
  const rein = kimDanReincarnation();
  const reinMilestones = rein.milestones
    .filter((m) => m.realm > 1 || m.tier >= 4)
    .map(
      (m) =>
        `| ${m.label} | ${n0(m.minutes)} | ${m.duyenZeroBoss} | ${n1(m.duyenPerHourZeroBoss)} | ${m.duyenWithBoss} | **${n1(m.duyenPerHourWithBoss)}** |`,
    );
  const reinLives = rein.progression.map(
    (p) =>
      `| ${p.kiep} | Nấc ${p.duAmLevel} | +${p.duAmLevel * 10}% | ${n0(p.minutes)} | +${p.duyenEarned} | ${p.duyenRemaining} | **${n1(p.duyenPerHour)}** | ${p.ratioToFirstLife.toFixed(2)}x | ${p.upgradeNote} |`,
  );
  const reinFinal = rein.progression.at(-1)!;
  const reinFirst = rein.progression[0];
  const tcFirst = simulateReincarnationProgression(1, 2)[0];
  const partyRows = kimDanPartyRows().map(
    (r) =>
      `| ${r.label} | ${MONSTER_BY_ID[r.cells[0].solo]?.name ?? r.cells[0].solo} | ${r.cells
        .map((c) => `${c.ratio.toFixed(2)}x (${MONSTER_BY_ID[c.party]?.name ?? c.party})`)
        .join(" | ")} |`,
  );
  const partyAll = kimDanPartyRows().flatMap((r) => r.cells.map((c) => c.ratio));
  return `## Kim Đan sau nội dung (M6, #403)

Tính SỐNG từ \`shared/\` bằng mô hình ở trên (khác mục "Kim Đan trước M6": đó là ảnh chụp cố định). Quái mới: Sương Hồ (cấp 13, nhanh, đàn), Thạch Quy (cấp 14, dày, đòn nhẹ), Độc Thiềm (cấp 15, đòn nặng, máu thấp), trùm Hắc Giao (cấp 18, đội 3-4 người).
Trang bị mỗi bộ ~29% chỉ số gốc ở bậc đầu mặc được. **Thanh Kim Đan 48000 / 55200 / 63480** (trước M6: 26400 / 30360 / 34914). **Tụ Khí Đan có trần 300 tu vi mỗi viên** và Xích Mãng rơi 0.3 x 1 (trước: 0.6 x 1-2): ba thay đổi này thay cho "đường tắt" ở "Kim Đan trước M6" (mục 3 và 5).

### 1. Săn solo (tu vi / giờ kể cả đan rơi, Linh thạch / giờ, con / giờ, khí huyết mất / trận)

Mục tiêu: không bãi nào cho tu vi / giờ vượt ~1,5x bãi mới tốt nhất cùng bậc, Linh thạch / giờ không vượt ~2x. Quái mới KHÔNG an toàn cho người Trúc Cơ hậu kỳ (mất > 50% khí huyết / trận) nên quái mới không làm đổi nhịp Luyện Khí / Trúc Cơ (hết Luyện Khí ${n0(tc[1])} phút, hết Trúc Cơ ${Math.floor(tc[2] / 60)} giờ ${Math.round(tc[2] % 60)} phút cộng dồn).

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ | Khí huyết mất |
|---|---|---:|---:|---:|---:|
${solo.join("\n")}

### 2. Trùm Hắc Giao theo cỡ đội (tu vi / giờ MỖI người, trong ngoặc khí huyết mất / trận)

| Bậc | 1 người | Đội 2 | Đội 3 | Đội 4 | Đội 3 so với săn solo tốt nhất |
|---|---:|---:|---:|---:|---:|
${bossRows.join("\n")}

### 3. Nhịp cả cảnh giới Kim Đan (phút; có chuỗi nhiệm vụ hiện có, có đột phá thất bại)

"Tối ưu" = người chơi săn bãi tốt nhất kể cả Xích Mãng; "bãi mới" = không đụng Xích Mãng. Tổng: **${n1(hoursOf(optimal))} giờ** (tối ưu), **${n1(hoursOf(designed))} giờ** (bãi mới); mục tiêu 5-7 giờ. Trước M6: ${n1(386 / 60)} giờ nhưng nhờ đường tắt (Sơ kỳ 4,1 giờ rồi hai bậc sau ~2,3 giờ).

| Bậc | Thanh | Tối ưu: nguồn | phút | Bãi mới: nguồn | phút |
|---|---:|---|---:|---|---:|
${pacing.join("\n")}

### 4. Luân hồi khi cày tới hết Kim Đan (#406)

Cùng mô hình với mục "Luân hồi & Điểm Duyên" (Duyên theo \`calcDuyen\`, thời gian là nhịp ở mục 3, bãi tốt nhất, hạ 2 trùm; mốc "hết" hạ 3 trùm). \`duyenPerStep(3)\` được hạ từ **60 xuống 40** (PR shared riêng): ở 60, Duyên / giờ (0 trùm) ở Kim Đan hậu kỳ lên 31.4 (gấp ~1.4x Luyện Khí tầng 5, vượt ngưỡng 1.3x); thanh Kim Đan dài ~5 giờ chứ không 5 lần Trúc Cơ (~2 giờ) nên 12 x 5 trả quá tay.

| Chết ngay khi vừa đạt | Phút | Duyên (0 trùm) | Duyên / giờ (0 trùm) | Duyên (hạ trùm) | Duyên / giờ (hạ trùm) |
|---|---:|---:|---:|---:|---:|
${reinMilestones.join("\n")}

Từ Luyện Khí tầng 5 tới hết Kim Đan, Duyên / giờ (0 trùm) nhỏ nhất **${n1(rein.lo.duyenPerHourZeroBoss)}** (${rein.lo.label}), lớn nhất **${n1(rein.hi.duyenPerHourZeroBoss)}** (${rein.hi.label}): tỉ lệ **${rein.ratio.toFixed(2)}x** (ngưỡng 1.3x${rein.ratio <= 1.3 ? ", đạt" : ", VƯỢT"}). Mọi mốc Kim Đan nằm trong dải của Luyện Khí / Trúc Cơ nên không có điểm dừng nào đáng cố ý chết.

Tiến trình qua kiếp khi KIẾP NÀO CŨNG cày trọn tới hết Kim Đan (hạ 2 trùm) và dồn Duyên vào Dư âm tu hành:

| Kiếp | Dư âm tu hành | Tốc độ tu luyện | Thời gian chơi (phút) | Duyên nhận | Duyên còn lại | Duyên / giờ | So với kiếp 1 | Hành động tại Tam Sinh Thạch |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
${reinLives.join("\n")}

Duyên / giờ tăng từ **${n1(reinFirst.duyenPerHour)}** (kiếp 1) lên **${n1(reinFinal.duyenPerHour)}** khi đạt tối đa: **${reinFinal.ratioToFirstLife.toFixed(2)}x** (ngưỡng ~2.0x${reinFinal.ratioToFirstLife <= 2 ? ", đạt" : ", VƯỢT"}). Một kiếp tới hết Kim Đan nhận ${reinFirst.duyenEarned} Duyên (so với ${tcFirst.duyenEarned} khi chỉ tới hết Trúc Cơ) vì dài ${n1(reinFirst.minutes / tcFirst.minutes)} lần: cùng Duyên / giờ. Mô hình BỎ QUA nhiệm vụ lặp và phí rèn (không đổi Duyên). Giữ nguyên luật luân hồi đã chốt.

### 5. Đi theo đội ở Kim Đan (#406; KHÔNG đổi quy tắc chia tu vi)

Cùng mô hình với mục "Đi theo đội" (tu vi / giờ MỖI thành viên so với săn solo tốt nhất; trong ngoặc là quái tốt nhất mà đội đủ an toàn đánh, kể cả trùm Hắc Giao).

| Bậc | Một mình săn | Đội 2 | Đội 3 | Đội 4 |
|---|---|---:|---:|---:|
${partyRows.join("\n")}

Cao nhất **${Math.max(...partyAll).toFixed(2)}x**, thấp nhất **${Math.min(...partyAll).toFixed(2)}x**: ở Kim Đan đội 3-4 hạ Hắc Giao được ~1.0-1.2x săn solo (dưới ngưỡng 1.5x của #74, khác Trúc Cơ tới 2.5x), còn đội 2 chậm hơn solo (~0.8x: chưa đủ người hạ trùm, chia tu vi, thời gian tìm quái không rút ngắn). Đây là số đo, câu hỏi chia tu vi của người dùng vẫn chờ; test khoá cận dưới ~0.65x (đội nhỏ chậm hơn solo ở Sơ kỳ là hiện trạng, giống Luyện Khí bậc 6-9, không được xấu thêm).
`;
}
