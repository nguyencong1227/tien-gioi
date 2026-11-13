// Đo Kim Đan với nội dung HIỆN CÓ, trước khi M6 thêm quái / đồ mới (docs/PHAN_CONG_M6.md, issue #402).
// Dùng đúng mô hình của `simulate.ts` và mã server thật của `dungeon.ts`; hàm thuần, không ghi tệp.
// Số "trước M6" được chụp một lần vào `kim-dan-truoc.json` (xem `kim-dan-truoc.ts`) để không đổi khi #403 thêm quái;
// #406 dùng lại `measureKimDan()` cho số "sau".
import {
  DROP_TABLES,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  REALMS,
  expToNext,
  stepOf,
  type MonsterKind,
} from "@tien-gioi/shared";
import { LINH_HU, summarizeFights } from "./dungeon";
import { ASSUME, huntRate, monsterEconomy, simulate } from "./simulate";

/** Bốn loài ngoài hoang trước M6. Cố định để số "trước" tái lập được dù sau này có thêm quái. */
export const BASELINE_IDS = ["tho", "lang", "ho", "mang"] as const;

/** Cảnh giới đo (Kim Đan). */
export const KIM_DAN = 3;

export interface HuntRow {
  id: string;
  name: string;
  /** Solo an toàn (mỗi trận mất không quá `ASSUME.maxHpLossPerKill` khí huyết) */
  safe: boolean;
  /** Vẫn an toàn solo nếu MỌI đòn của quái đều trúng (`ASSUME.hitTaken` = 1): ca xấu nhất, để biết bậc nào sát ngưỡng */
  safeIfAllHit: boolean;
  expPerHour: number | null;
  secPerKill: number | null;
  coinPerHour: number | null;
}

/** Đường tắt Tụ Khí Đan: viên đan cộng % `expMax`, hồi chiêu `cooldownSec`. */
export interface PillRow {
  monsterId: string;
  killsPerHour: number;
  /** Kỳ vọng số viên rơi mỗi con (chance x số lượng trung bình) */
  pillsPerKill: number;
  supplyPerHour: number;
  /** Số viên dùng được mỗi giờ: min(nguồn cung, giới hạn hồi chiêu) */
  usedPerHour: number;
  expEach: number;
  pillExpPerHour: number;
  /** Tu vi / giờ của việc săn + đan */
  totalExpPerHour: number;
  /** Phút để đầy MỘT thanh nếu chỉ săn loài này (không đan / có đan) */
  minutesNoPill: number;
  minutesWithPill: number;
}

export interface DungeonRow {
  party: number;
  winRate: number;
  realMinutes: number | null;
  deathsPerRun: number;
}

export interface KimDanTier {
  tier: number;
  step: number;
  label: string;
  bar: number;
  hunts: HuntRow[];
  /** Nguồn tu vi tốt nhất an toàn solo (không tính đả tọa) */
  best: { id: string; expPerHour: number } | null;
  /** Đường tắt đan với loài rơi nhiều đan nhất trong các loài an toàn; null nếu không loài an toàn nào rơi đan */
  pill: PillRow | null;
  /** Như `pill` nhưng thời gian tìm quái Xích Mãng giảm còn `mangSearchFast` giây (bãi 6 con ở Hắc Phong Cốc) */
  pillFastSearch: PillRow | null;
  dungeon: DungeonRow[];
}

export interface KimDanReport {
  ids: string[];
  /** Giả định thời gian tìm Xích Mãng của mô hình (`ASSUME.searchSec.mang`) và của ca nhạy cảm */
  mangSearch: number;
  mangSearchFast: number;
  /** Phút cả cảnh giới Kim Đan theo `simulate()` (có chuỗi nhiệm vụ, có đột phá thất bại) */
  simulateMinutes: number;
  tiers: KimDanTier[];
}

function pillsPerKill(monsterId: string): number {
  const e = DROP_TABLES[monsterId]?.find((d) => d.itemId === "tu_khi_dan");
  return e ? e.chance * ((e.min + e.max) / 2) : 0;
}

function pillRow(m: MonsterKind, bar: number, expPerHour: number, secPerKill: number): PillRow {
  const def = ITEM_BY_ID["tu_khi_dan"];
  if (def?.effect?.kind !== "exp") throw new Error("tu_khi_dan phải có hiệu ứng exp");
  const killsPerHour = 3600 / secPerKill;
  const perKill = pillsPerKill(m.id);
  const supply = killsPerHour * perKill;
  const cap = 3600 / ((def.cooldown ?? 60_000) / 1000);
  const used = Math.min(supply, cap);
  const expEach = bar * def.effect.pct;
  const pillExp = used * expEach;
  return {
    monsterId: m.id,
    killsPerHour,
    pillsPerKill: perKill,
    supplyPerHour: supply,
    usedPerHour: used,
    expEach,
    pillExpPerHour: pillExp,
    totalExpPerHour: expPerHour + pillExp,
    minutesNoPill: (bar / expPerHour) * 60,
    minutesWithPill: (bar / (expPerHour + pillExp)) * 60,
  };
}

/**
 * Đo Kim Đan (3 bậc) với các loài `ids`: tu vi / Linh thạch mỗi giờ solo, đường tắt đan, đội vào bí cảnh Linh Hư.
 * `runs`: số trận mô phỏng bí cảnh mỗi dòng (mã server thật, hạt giống 1..runs).
 */
export function measureKimDan(
  ids: readonly string[] = BASELINE_IDS,
  runs = 20,
  mangSearchFast = 30,
): KimDanReport {
  const mons = ids.map((id) => {
    const m = MONSTER_BY_ID[id];
    if (!m) throw new Error(`Không có loài quái "${id}"`);
    return m;
  });
  const mangSearch = ASSUME.searchSec.mang;
  const tiers: KimDanTier[] = [];
  for (let tier = 0; tier < REALMS[KIM_DAN].tiers.length; tier++) {
    const bar = expToNext(KIM_DAN, tier);
    const hunts: HuntRow[] = mons.map((m) => {
      const h = huntRate(m, KIM_DAN, tier);
      const e = monsterEconomy(m, KIM_DAN, tier);
      const savedHit = ASSUME.hitTaken;
      ASSUME.hitTaken = 1;
      let safeIfAllHit: boolean;
      try {
        safeIfAllHit = !!huntRate(m, KIM_DAN, tier);
      } finally {
        ASSUME.hitTaken = savedHit;
      }
      return {
        id: m.id,
        name: m.name,
        safe: !!h,
        safeIfAllHit,
        expPerHour: h ? h.rate * 3600 : null,
        secPerKill: h ? h.secPerKill : null,
        coinPerHour: e ? e.totalCoinPerHour : null,
      };
    });
    const safe = hunts.filter((h) => h.safe);
    const bestHunt = safe.reduce<HuntRow | null>(
      (a, h) => (!a || h.expPerHour! > a.expPerHour! ? h : a),
      null,
    );
    // Loài an toàn rơi nhiều đan nhất trong số lượt kỳ vọng mỗi giờ (nguồn cung lớn nhất)
    const pillSource = safe
      .filter((h) => pillsPerKill(h.id) > 0)
      .reduce<HuntRow | null>(
        (a, h) =>
          !a ||
          (3600 / h.secPerKill!) * pillsPerKill(h.id) > (3600 / a.secPerKill!) * pillsPerKill(a.id)
            ? h
            : a,
        null,
      );
    let pill: PillRow | null = null;
    let pillFast: PillRow | null = null;
    if (pillSource) {
      const m = MONSTER_BY_ID[pillSource.id];
      pill = pillRow(m, bar, pillSource.expPerHour!, pillSource.secPerKill!);
      // Ca nhạy cảm: nhiều Xích Mãng hơn trên bản đồ thì tìm con kế tiếp nhanh hơn
      if (m.id === "mang") {
        ASSUME.searchSec.mang = mangSearchFast;
        try {
          const h = huntRate(m, KIM_DAN, tier);
          if (h) pillFast = pillRow(m, bar, h.rate * 3600, h.secPerKill);
        } finally {
          ASSUME.searchSec.mang = mangSearch;
        }
      }
    }
    const dungeon: DungeonRow[] = [1, 2, 3, 4].map((party) => {
      const f = summarizeFights(LINH_HU, party, { realm: KIM_DAN, tier }, runs);
      return {
        party,
        winRate: f.winRate,
        realMinutes: f.realMinutes,
        deathsPerRun: f.deathsPerRun,
      };
    });
    tiers.push({
      tier,
      step: stepOf(KIM_DAN, tier),
      label: `${REALMS[KIM_DAN].name} ${REALMS[KIM_DAN].tiers[tier]}`,
      bar,
      hunts,
      best: bestHunt ? { id: bestHunt.id, expPerHour: bestHunt.expPerHour! } : null,
      pill,
      pillFastSearch: pillFast,
      dungeon,
    });
  }
  const rows = simulate(KIM_DAN);
  const before = rows.filter((r) => r.realm === KIM_DAN - 1).at(-1)!.total;
  const simulateMinutes = rows.filter((r) => r.realm === KIM_DAN).at(-1)!.total - before;
  return { ids: [...ids], mangSearch, mangSearchFast, simulateMinutes, tiers };
}

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);
/** "a-b" (hoặc "a" nếu bằng nhau sau khi làm tròn `digits` chữ số). */
const range = (xs: number[], digits: number) => {
  const lo = Math.min(...xs).toFixed(digits);
  const hi = Math.max(...xs).toFixed(digits);
  return lo === hi ? lo : `${lo}-${hi}`;
};
const fmtMin = (m: number) => (m >= 90 ? `${n1(m / 60)} giờ` : `${Math.round(m)} phút`);

/** Dựng mục Markdown cho `docs/CAN_BANG.md` từ một báo cáo (số "trước M6" đọc từ `kim-dan-truoc.json`). */
export function renderKimDan(r: KimDanReport): string {
  const names = Object.fromEntries(r.tiers[0].hunts.map((h) => [h.id, h.name]));
  const huntRows = r.tiers.flatMap((t) =>
    t.hunts.map((h) =>
      h.safe
        ? `| ${t.label} | ${h.name} | ${n0(h.expPerHour!)} | ${n0(h.coinPerHour!)} | ${n0(3600 / h.secPerKill!)} |`
        : `| ${t.label} | ${h.name} | không an toàn solo | – | – |`,
    ),
  );
  const pillRows = r.tiers.flatMap((t) => {
    const row = (p: PillRow | null, label: string) =>
      p
        ? [
            `| ${t.label} | ${label} | ${n0(p.killsPerHour)} | ${n1(p.supplyPerHour)} / ${n1(p.usedPerHour)} | ${n0(p.expEach)} | ${n0(p.totalExpPerHour)} | ${fmtMin(p.minutesNoPill)} → ${fmtMin(p.minutesWithPill)} |`,
          ]
        : [];
    // Thời gian tìm quái (90 s / 30 s) là giả định của riêng Xích Mãng; loài khác dùng `ASSUME.searchSec` như mọi bảng khác
    const name = (p: PillRow, search?: number) =>
      p.monsterId === "mang" && search !== undefined
        ? `${names[p.monsterId]} (tìm ${search} s)`
        : names[p.monsterId];
    return [
      ...(t.pill ? row(t.pill, name(t.pill, r.mangSearch)) : []),
      ...(t.pillFastSearch ? row(t.pillFastSearch, name(t.pillFastSearch, r.mangSearchFast)) : []),
    ];
  });
  const dunRows = r.tiers.flatMap((t) =>
    t.dungeon.map(
      (d) =>
        `| ${t.label} | ${d.party} | ${Math.round(d.winRate * 100)}% | ${d.realMinutes === null ? "–" : n1(d.realMinutes)} | ${n1(d.deathsPerRun)} |`,
    ),
  );
  const t1 = r.tiers[1];
  const hoRate = t1.hunts.find((h) => h.id === "ho")?.expPerHour ?? 0;
  const mangRate = t1.hunts.find((h) => h.id === "mang")?.expPerHour ?? 0;
  const mangCoin = t1.hunts.find((h) => h.id === "mang")?.coinPerHour ?? 0;
  const broken = r.tiers.every((t) => {
    const d = t.dungeon.find((x) => x.party === LINH_HU.partyMin)!;
    return d.winRate >= 0.5 && (d.realMinutes ?? Infinity) <= LINH_HU.timeLimitMs / 60_000;
  });
  const soloWins = r.tiers.every((t) => t.dungeon.find((d) => d.party === 1)?.winRate === 1);
  // Bậc mà Xích Mãng "an toàn solo" chỉ nhờ giả định né được một phần đòn (hitTaken 0.8): nếu mọi đòn trúng thì không còn an toàn
  const edgeTiers = r.tiers.filter((t) => {
    const h = t.hunts.find((x) => x.id === "mang");
    return !!h && h.safe && !h.safeIfAllHit;
  });
  const firstSafeAllHit = r.tiers.find(
    (t) => t.hunts.find((x) => x.id === "mang")?.safeIfAllHit,
  )?.label;
  const edge = edgeTiers.length
    ? ` **Độ nhạy:** "an toàn" dựa trên giả định người chơi né được một phần đòn; nếu mọi đòn của Xích Mãng đều trúng thì ${edgeTiers.map((t) => t.label).join(", ")} sát ngưỡng (không còn an toàn solo) và đường tắt chỉ bắt đầu từ ${firstSafeAllHit ?? "bậc sau Kim Đan"}.`
    : "";
  const dMin = r.tiers.map((t) => t.dungeon.find((d) => d.party === LINH_HU.partyMin)!);
  return `## Kim Đan trước M6 (#402)

Số đo bằng đúng mô hình và mã server ở trên, với **nội dung hiện có** (${r.ids.map((i) => names[i]).join(", ")}; chưa có quái / đồ / nhiệm vụ cho Kim Đan).
Ảnh chụp cố định ở \`server/src/balance/kim-dan-truoc.json\` (sinh bằng \`npm run can-bang:kim-dan-truoc -w server\`): không đổi khi M6 thêm nội dung,
để #406 so "trước / sau". Giả định thời gian tìm Xích Mãng ${r.mangSearch} giây là của mô hình (bản đồ chỉ có 2 con); Hắc Phong Cốc có 6 con.

### 1. Cả cảnh giới: đúng mục tiêu nhưng hình dạng sai

Theo \`simulate()\` (có chuỗi nhiệm vụ, có đột phá thất bại), Kim Đan mất **${fmtMin(r.simulateMinutes)}**. Con số này nằm trong mục tiêu đề xuất (5-7 giờ) **chỉ nhờ một đường tắt**:

| Bậc | Thanh | Săn tốt nhất (solo, an toàn) | Tu vi / giờ |
|---|---:|---|---:|
${r.tiers.map((t) => `| ${t.label} | ${n0(t.bar)} | ${t.best ? names[t.best.id] : "đả tọa"} | ${t.best ? n0(t.best.expPerHour) : "–"} |`).join("\n")}

Sơ kỳ phải cày Hắc Hổ rất lâu; từ ${t1.label} Xích Mãng (cấp 12, 4000 máu) thành an toàn khi solo (mô hình: mất ≤ 50% khí huyết mỗi trận) và cho **${n0(mangRate)} tu vi / giờ, gấp ${n1(mangRate / hoRate)} lần Hắc Hổ** (${n0(hoRate)}): mục tiêu "tu vi / giờ không quá ~1,5× bãi đúng bậc" bị vượt xa. \`KILL_EXP_FREE_GAP\` chưa trừ gì vì Xích Mãng chỉ thấp hơn người chơi 1-3 bậc.${edge}

### 2. Mỗi loài (solo)

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ |
|---|---|---:|---:|---:|
${huntRows.join("\n")}

### 3. Đường tắt Tụ Khí Đan

Tụ Khí Đan cộng **5% \`expMax\`** mỗi viên (hồi chiêu 60 giây = tối đa 60 viên / giờ). Ở Kim Đan, mỗi viên đáng ${n0(r.tiers[0].pill?.expEach ?? 0)}-${n0(r.tiers[2].pill?.expEach ?? 0)} tu vi, trong khi Xích Mãng cho 900 tu vi và rơi 60% x 1-2 viên. Cột "nguồn cung / dùng" là số viên mỗi giờ (rơi / thực dùng sau giới hạn hồi chiêu); cột cuối là thời gian đầy MỘT thanh nếu chỉ săn loài đó.

| Bậc | Loài săn | Con / giờ | Đan: nguồn cung / dùng | Tu vi / viên | Tu vi / giờ (săn + đan) | Một thanh (không đan → có đan) |
|---|---|---:|---|---:|---:|---|
${pillRows.join("\n")}

Mô hình chưa tính: thời gian tập hợp, chết, Xích Mãng bị người khác hạ trước (một bản đồ nhiều người tranh 2-6 con). Nhưng chiều hướng rõ: đan không phải phần thưởng hiếm ở Kim Đan mà là nguồn tu vi chính.

### 4. Bí cảnh Linh Hư (ngưỡng bậc ${LINH_HU.minStep}; TRƯỚC M6 chưa có trần bậc, nay trần bậc ${LINH_HU.maxStep}) với đội Kim Đan

Mô phỏng bằng mã server thật (\`fightBoss\`, ca khó: đứng yên, không né), 20 trận mỗi dòng. Mục tiêu thiết kế ở bậc ngưỡng: một người không hạ nổi; đội 2 người không kịp giờ (${LINH_HU.timeLimitMs / 60_000} phút); đội 3 người 5-8 phút.

| Bậc | Đội | Hạ được trùm | Phút thật | Người chết / trận |
|---|---:|---:|---:|---:|
${dunRows.join("\n")}

Đội nhỏ nhất mở được (${LINH_HU.partyMin} người) hạ trùm ${range(
    dMin.map((d) => d.winRate * 100),
    0,
  )}% số trận trong ${range(
    dMin.map((d) => d.realMinutes ?? NaN),
    1,
  )} phút, ${n1(Math.max(...dMin.map((d) => d.deathsPerRun)))} người chết: ${broken ? `mục tiêu "đội ${LINH_HU.partyMin} người không kịp giờ" bị phá ở mọi bậc Kim Đan ${soloWins ? "(và một người Kim Đan cũng thắng, chỉ bị luật cỡ đội chặn)" : ""}` : "mục tiêu thiết kế của bí cảnh còn giữ được ở ít nhất một bậc Kim Đan"}. Phần Linh thạch của một lượt thưởng (${LINH_HU.reward.coin}) chỉ bằng ~${n1(LINH_HU.reward.coin / (mangCoin / 60))} phút săn Xích Mãng ở ${t1.label}, nhưng lượt thưởng còn ${LINH_HU.reward.items.find((i) => i.itemId === "tu_khi_dan")?.qty ?? 0} Tụ Khí Đan chắc chắn (mục 3).

### 5. Kết luận và hướng xử lý (đề xuất, chốt ở #403 / #405 / #406)

1. **Nhịp tổng đúng nhưng hình dạng sai:** Sơ kỳ rất chậm, rồi Xích Mãng + Tụ Khí Đan làm hai bậc sau trôi qua trong vài chục phút. Nội dung Kim Đan mới (Sương Hồ / Thạch Quy / Độc Thiềm / Hắc Giao) phải tạo bãi đúng bậc cho CẢ ba bậc và làm Xích Mãng hết là đường tắt.
2. **Tụ Khí Đan tính theo % thanh là bẫy khi thanh nhảy ×6:** cách xử lý ứng viên (đo ở #406): (a) bảng rơi quái cũ (nhất là Xích Mãng 60%) giảm mạnh hoặc bỏ \`tu_khi_dan\`; (b) đan cộng một lượng cố định theo cảnh giới của đan (đan mới cho Kim Đan, đan cũ chỉ cộng % thanh của bậc Luyện Khí / Trúc Cơ); (c) hạ \`pct\` còn ~1%. Cần ghi rõ lý do trong PR hợp đồng #403.
3. **Bí cảnh Linh Hư cần trần bậc (\`maxStep\`, tuỳ chọn trong \`DungeonDef\`) hoặc chỉ số trùm theo bậc đội:** nếu không, người Kim Đan quay lại hạ trùm trong vài phút (3 lượt thưởng / ngày). Chốt ở #405 (PR \`shared/\` riêng, B review).
4. Số trên là mô hình (chưa kiểm bằng người chơi thật): bot của C (#410) kiểm lại hai đường tắt bằng đo thật.
`;
}
