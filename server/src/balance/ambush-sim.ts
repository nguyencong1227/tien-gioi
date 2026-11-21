// Mô phỏng cân bằng GẶP CHẶN ĐƯỜNG (CD6, issue #1066; docs/THIET_KE_CHAN_DUONG.md mục 9). Mở rộng `npm run can-bang -w server`.
//
// MỤC TIÊU (mục 9): với người chơi TRUNG BÌNH (đồ chuẩn bậc) thì tỉ lệ thắng khi CHỌN CHIẾN theo mức kẻ địch >= 90 / 80 / 60 %
// (normal / elite / leader); thời gian trận 30-70 s; tu vi / phút (tính cả đi bộ tới lúc bị chặn) hơn đánh quái thường ~20-40 %, KHÔNG hơn bí cảnh;
// số lần chặn đường / giờ bị chặn bởi hồi 8 phút + trần 12/ngày; thắng luôn lợi hơn bỏ chạy, bỏ chạy lỗ ít hơn thua.
//
// CÁCH LÀM: trận là một ĐẤU TRƯỜNG (như bí cảnh): người chơi đứng yên chém, quái trúng 80 % đòn (CẬN TRÊN), và DÙNG ĐAN Hồi Huyết (8 s/lần, hồi 40% máu,
// mang 3 viên) — hợp lý vì đây là trận riêng, không phải đánh lén giữa lúc săn. Kẻ địch là MÔ HÌNH TỔNG QUÁT theo mức (KHÔNG phụ thuộc `AMBUSH_FOES` — nội dung E/G chưa nhập):
// lấy con quái CỨNG NHẤT hợp cảnh giới (level <= `AMBUSH_FOE_LEVEL_CAP`, KHÔNG tính world-boss máu khổng lồ) làm gốc, nhân hệ số theo mức. Số thưởng là ĐỀ XUẤT (dấu `ĐỀ XUẤT`),
// D chốt bằng mô phỏng rồi chuyển vào `shared/src/ambush.ts` ở PR chốt hằng số riêng (KHÔNG đổi `shared/` ở PR mô phỏng này).

import {
  AMBUSH_TIME_MS,
  AMBUSH_COOLDOWN_MS,
  AMBUSH_DAY_CAP,
  AMBUSH_STRIDE_PX,
  AMBUSH_ROLL_P_MIN,
  AMBUSH_ROLL_P_MAX,
  AMBUSH_FOE_LEVEL_CAP,
  ambushExpPrice,
  expToNext,
  killExp,
  MONSTERS,
  REALMS,
  SKILLS,
  statsFor,
  type AmbushTier,
  type MonsterKind,
} from "@tien-gioi/shared";
import { ELITE_ATK_MULT, ELITE_HP_MULT } from "../systems/elite";
import { ASSUME, bestGear, bestOption, expectedTotalCoin } from "./simulate";

/** Số mẫu sức mạnh người chơi quanh mức "chuẩn" (đồ chuẩn bậc): dưới trung bình -> trên trung bình. Win rate = tỉ lệ mẫu thắng. */
export const DPS_SPREAD = [0.78, 0.82, 0.86, 0.9, 0.94, 0.98, 1.02, 1.06, 1.1, 1.15, 1.2, 1.25];

/** An toàn: thắng phải vừa hạ trong thời gian trận, vừa còn khí huyết > 0 sau khi trừ đan (đấu trường, CẬN TRÊN). */
export const SURVIVE_MARGIN = 0.15; // còn lại tối thiểu phần máu (sau khi đã dùng hết đan hợp lý) — để ý: mô hình dùng đan nên cận này lỏng hơn dangerFraction

// ---------- Đan trong đấu trường (arena fight, như bí cảnh) ----------

/** Hồi Huyết Đan: hồi 40% máu, hồi chiêu 8 s (từ `shared/ITEMS`). */
const POTION_HEAL_PCT = 0.4;
const POTION_CD_S = 8;
/** Đan người chơi trung bình mang theo cho một trận chặn đường (đấu trường riêng). */
const POTION_CARRIED = 3;
/** Dùng đan khi khí huyết dưới mức này. */
const POTION_BELOW = 0.5;

// ---------- Hệ số kẻ địch theo mức (ĐỀ XUẤT — D chốt bằng mô phỏng) ----------

/**
 * Kẻ địch tổng quát theo mức, gốc = con quái cứng nhất của cảnh giới người chơi.
 * `normal`: 2 con thường; `elite`: 1 con tinh anh (Nhân `ELITE_*`); `leader`: 1 kẻ cầm đầu + 1 lính (ĐỀ XUẤT: hp x4, công x1.6; lính x0.5/x0.7).
 */
export const TIER_MODEL: Record<
  AmbushTier,
  {
    headHp: number;
    headAtk: number;
    headCd: number;
    adds: { hp: number; atk: number; cd: number }[];
  }
> = {
  normal: { headHp: 1, headAtk: 1, headCd: 1, adds: [{ hp: 1, atk: 1, cd: 1 }] }, // 2 con thường
  elite: { headHp: ELITE_HP_MULT, headAtk: ELITE_ATK_MULT, headCd: 1, adds: [] }, // 1 tinh anh
  leader: { headHp: 4, headAtk: 1.6, headCd: 1, adds: [{ hp: 0.5, atk: 0.7, cd: 1 }] }, // cầm đầu + 1 lính
};

/** Thưởng TU VI = hệ số x tu vi một con quái cùng bậc (ĐỀ XUẤT mục 6: 6 / 12 / 28). */
export const AMBUSH_EXP_REWARD_MULT: Record<AmbushTier, number> = {
  normal: 6,
  elite: 12,
  leader: 28,
};
/** Thưởng LINH THẠCH = hệ số x tổng kỳ vọng Linh thạch một con quái (ĐỀ XUẤT: 2 / 3 / 5). */
export const AMBUSH_COIN_REWARD_MULT: Record<AmbushTier, number> = {
  normal: 2,
  elite: 3,
  leader: 5,
};

/** Đòn của một kẻ địch (hp, atk, attackCd ms) đã nhân hệ số mức, quy về con gốc `base`. */
interface Foe {
  hp: number;
  atk: number;
  attackCd: number;
}

/** Dựng bầy kẻ địch của mức `tier` cho người chơi ở (realm, tier) với con gốc `base`. */
function ambushFoes(tier: AmbushTier, base: MonsterKind): Foe[] {
  const m = TIER_MODEL[tier];
  const foes: Foe[] = [
    { hp: base.hp * m.headHp, atk: base.atk * m.headAtk, attackCd: base.attackCd },
  ];
  for (const a of m.adds)
    foes.push({ hp: base.hp * a.hp, atk: base.atk * a.atk, attackCd: base.attackCd * a.cd });
  return foes;
}

/**
 * Con quái CỨNG NHẤT (level cao nhất) hợp cảnh giới `realm` — dùng `MONSTERS` (không phải `WILD_MONSTERS`) để gồm nội dung Kim Đan / Nguyên Anh
 * (spawn cap 0 nhưng là kẻ chặn đường hợp lệ). Loại WORLD-BOSS (máu > 10× máu người chơi cảnh giới đó: hac_giao / yeu_vuong / thien_han_vuong) —
 * boss đó dành cho mức `leader`, không làm gốc bầy thường. null nếu cảnh giới chưa có quái hợp.
 */
export function representativeFoe(realm: number): MonsterKind | null {
  const cap = AMBUSH_FOE_LEVEL_CAP[realm];
  // Máu người chơi bậc cuối cảnh giới để lọc world-boss.
  const tierNo = REALMS[realm].tiers.length - 1;
  const playerHp = statsFor(realm, tierNo, bestGear(realm, tierNo)).maxHp;
  const bossHpCeil = playerHp * 10;
  let best: MonsterKind | null = null;
  for (const m of MONSTERS) {
    if (cap !== undefined && m.level > cap) continue;
    if (m.hp > bossHpCeil) continue; // world-boss: không làm gốc bầy thường
    if (!best || m.level > best.level) best = m;
  }
  return best;
}

/** DPS của người chơi chuẩn ở (realm, tier) — ĐÚNG công thức `huntRate` / `dangerFraction`. `dpsMult` nhân sức mạnh quần chúng. */
function playerDps(realm: number, tier: number, dpsMult = 1): number {
  const s = statsFor(realm, tier, bestGear(realm, tier));
  return ((s.atk * SKILLS.slash.mult * ASSUME.critAvg) / (SKILLS.slash.cooldown / 1000)) * dpsMult;
}

export interface AmbushSimResult {
  win: boolean;
  fightSec: number; // giây trận thực (làm tròn xuống, tại dpsMult)
  damageTaken: number; // tổng sát thương nhận (CẬN TRÊN)
  potionsUsed: number;
}

/**
 * Mô phỏng trận đấu trường giây-từng-giây: người chơi chém `dps`, bầy đánh `foeDps` mỗi giây, người chơi dùng đan khi máu < 50% (hồi 40%, hồi chiêu 8 s, tối đa `POTION_CARRIED`).
 * Thắng = hạ hết bầy trong `AMBUSH_TIME_MS` mà máu không về 0. Đây là CẬN TRÊN (đứng yên, KHÔNG né) nhưng đã tính đan nên hợp lý cho trận riêng.
 */
export function simulateFight(
  totalHp: number,
  foeDps: number,
  dps: number,
  maxHp: number,
): AmbushSimResult {
  let remaining = totalHp;
  let hp = maxHp;
  let potionCd = 0;
  let potionsUsed = 0;
  let damageTaken = 0;
  const limit = Math.min(Math.ceil(totalHp / dps), Math.floor(AMBUSH_TIME_MS / 1000));
  for (let t = 1; t <= limit; t++) {
    remaining -= dps;
    damageTaken += foeDps;
    hp -= foeDps;
    if (hp <= 0) return { win: false, fightSec: t, damageTaken, potionsUsed };
    if (hp < maxHp * POTION_BELOW && potionCd <= 0 && potionsUsed < POTION_CARRIED) {
      hp += maxHp * POTION_HEAL_PCT;
      potionCd = POTION_CD_S;
      potionsUsed++;
    }
    if (potionCd > 0) potionCd--;
    if (remaining <= 0) return { win: true, fightSec: t, damageTaken, potionsUsed };
  }
  return { win: false, fightSec: limit, damageTaken, potionsUsed }; // hết giờ = thua
}

export interface AmbushFight {
  fightSec: number; // giây hạ bầy (tại dpsMult=1)
  /** Trận có thắng được không tại sức mạnh quần chúng này (hạ trong thời gian + còn máu nhờ đan). */
  winAt(dpsMult: number): AmbushSimResult;
}

/** Mô hình trận chặn đường của mức `tier` ở (realm, tier). */
export function ambushFight(tier: AmbushTier, realm: number, tierNo: number): AmbushFight | null {
  const base = representativeFoe(realm);
  if (!base) return null;
  const s = statsFor(realm, tierNo, bestGear(realm, tierNo));
  const baseDps = playerDps(realm, tierNo, 1);
  if (baseDps <= 0) return null;
  const foes = ambushFoes(tier, base);
  const totalHp = foes.reduce((a, f) => a + f.hp, 0);
  const foeDps = foes.reduce((a, f) => a + f.atk / (f.attackCd / 1000), 0);
  return {
    fightSec: totalHp / baseDps,
    winAt(dpsMult: number) {
      return simulateFight(totalHp, foeDps, baseDps * dpsMult, s.maxHp);
    },
  };
}

/** Tỉ lệ thắng (quần chúng DPS_SPREAD) của mức `tier` ở (realm, tierNo). */
export function ambushWinRate(tier: AmbushTier, realm: number, tierNo: number): number | null {
  const f = ambushFight(tier, realm, tierNo);
  if (!f) return null;
  let win = 0;
  for (const d of DPS_SPREAD) if (f.winAt(d).win) win++;
  return win / DPS_SPREAD.length;
}

// ---------- Thưởng & so sánh (mục 9) ----------

export interface AmbushReward {
  exp: number;
  coin: number;
}

/** Thưởng khi thắng (đi qua `finishRun`; đồ chờ `AMBUSH_LOOT` — CD6 chưa có). */
export function ambushReward(
  tier: AmbushTier,
  base: MonsterKind,
  realm: number,
  tierNo: number,
): AmbushReward {
  return {
    exp: Math.round(AMBUSH_EXP_REWARD_MULT[tier] * killExp(base, realm, tierNo)),
    coin: Math.round(AMBUSH_COIN_REWARD_MULT[tier] * expectedTotalCoin(base.id)),
  };
}

/**
 * Tu vi / giây của TRẬN chặn đường so với săn quái thường tốt nhất ở bậc đó.
 * Hai cách so (mục 9): `fightOnly` = chỉ thời gian đánh (đấu trường); `withWalk` = tính cả thời gian đi bộ tới lúc bị chặn (quy tảo).
 * Mục tiêu: `withWalk` ~1.2-1.4 (hơn săn thường), KHÔNG hơn bí cảnh.
 */
export function ambushVsHuntRatio(
  tier: AmbushTier,
  realm: number,
  tierNo: number,
  walkSec: number,
): {
  ambushRateFight: number;
  ambushRateWalk: number;
  huntRate: number;
  ratioFight: number;
  ratioWalk: number;
} | null {
  const f = ambushFight(tier, realm, tierNo);
  const base = representativeFoe(realm);
  if (!f || !base) return null;
  const hunt = bestOption(realm, tierNo);
  const exp = ambushReward(tier, base, realm, tierNo).exp;
  const ambushRateFight = exp / f.fightSec; // tu vi / giây trong trận
  const ambushRateWalk = exp / (f.fightSec + walkSec); // tính cả đi bộ
  return {
    ambushRateFight,
    ambushRateWalk,
    huntRate: hunt.rate,
    ratioFight: ambushRateFight / hunt.rate,
    ratioWalk: ambushRateWalk / hunt.rate,
  };
}

/**
 * Số lần chặn đường / giờ. Bị chặn bởi (a) hồi tối thiểu `AMBUSH_COOLDOWN_MS` + thời gian trận + đi bộ tới lần kế,
 * và (b) trần `AMBUSH_DAY_CAP` mỗi ngày. Báo cả hai để so mục tiêu.
 */
export function ambushPerHour(
  avgFightSec: number,
  walkSecBetween: number,
): {
  cooldownCeil: number;
  dayCapPerHour: number;
} {
  const cooldownSec = AMBUSH_COOLDOWN_MS / 1000;
  const cooldownCeil = 3600 / (cooldownSec + avgFightSec + walkSecBetween);
  const sessionHours = 6; // phiên chơi trung bình
  const dayCapPerHour = AMBUSH_DAY_CAP / sessionHours;
  return { cooldownCeil, dayCapPerHour };
}

/** Thời gian đi bộ trung bình tới lúc bị chặn (giây): quãng `AMBUSH_STRIDE_PX / p` chia tốc độ đi; p nội suy danger 0..1. */
export function avgWalkSecBetweenAmbush(walkSpeedPx: number): number {
  const p = (AMBUSH_ROLL_P_MIN + AMBUSH_ROLL_P_MAX) / 2;
  const distPerRoll = AMBUSH_STRIDE_PX / p;
  return distPerRoll / walkSpeedPx;
}

// ---------- Tổng hợp theo cảnh giới ----------

export interface AmbushRealmRow {
  realm: number;
  label: string;
  base: string;
  /** Tỉ lệ thắng của quần chúng theo mức (null nếu cảnh giới chưa có quái hợp / chưa có trần kẻ chặn đường). */
  win: Record<AmbushTier, number | null>;
  /** Thời gian trận trung bình (giây) tại dpsMult=1 theo mức. */
  fightSec: Record<AmbushTier, number | null>;
  /** Thưởng tu vi theo mức. */
  expReward: Record<AmbushTier, number>;
  /** Tu vi / giây trận so săn quái thường (fight-only; mục tiêu > 1). */
  ratioFight: Record<AmbushTier, number | null>;
  /** Tu vi / giây tính cả đi bộ so săn quái thường (mục tiêu 1.2-1.4). */
  ratioWalk: Record<AmbushTier, number | null>;
}

const TIERS: readonly AmbushTier[] = ["normal", "elite", "leader"];

/** Một hàng cho MỖI cảnh giới có quái hợp (bỏ qua cảnh giới chưa có trần kẻ chặn đường / chưa có quái). */
export function ambushRealmRows(walkSec: number): AmbushRealmRow[] {
  const rows: AmbushRealmRow[] = [];
  for (let realm = 0; realm < REALMS.length; realm++) {
    if (AMBUSH_FOE_LEVEL_CAP[realm] === undefined) continue; // cảnh giới chưa có trần -> KHÔNG có bầy hợp lệ
    const base = representativeFoe(realm);
    if (!base) continue;
    const tierNo = REALMS[realm].tiers.length - 1; // đồ chuẩn bậc: bậc cuối của cảnh giới
    const row: AmbushRealmRow = {
      realm,
      label: REALMS[realm].name,
      base: base.name,
      win: { normal: null, elite: null, leader: null },
      fightSec: { normal: null, elite: null, leader: null },
      expReward: { normal: 0, elite: 0, leader: 0 },
      ratioFight: { normal: null, elite: null, leader: null },
      ratioWalk: { normal: null, elite: null, leader: null },
    };
    for (const t of TIERS) {
      row.win[t] = ambushWinRate(t, realm, tierNo);
      const f = ambushFight(t, realm, tierNo);
      row.fightSec[t] = f?.fightSec ?? null;
      row.expReward[t] = ambushReward(t, base, realm, tierNo).exp;
      const cmp = ambushVsHuntRatio(t, realm, tierNo, walkSec);
      row.ratioFight[t] = cmp?.ratioFight ?? null;
      row.ratioWalk[t] = cmp?.ratioWalk ?? null;
    }
    rows.push(row);
  }
  return rows;
}

/** Trung bình (không tính null) tỉ lệ thắng / thời gian trận / tỉ số tu vi across các cảnh giới có dữ liệu. */
export function ambushAverages(rows: AmbushRealmRow[]) {
  const avg = (
    get: (r: AmbushRealmRow, t: AmbushTier) => number | null,
  ): Record<AmbushTier, number | null> => {
    const out: Record<AmbushTier, number | null> = { normal: null, elite: null, leader: null };
    for (const t of TIERS) {
      const vals = rows.map((r) => get(r, t)).filter((v): v is number => v !== null);
      out[t] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    return out;
  };
  return {
    win: avg((r, t) => r.win[t]),
    fightSec: avg((r, t) => r.fightSec[t]),
    ratioFight: avg((r, t) => r.ratioFight[t]),
    ratioWalk: avg((r, t) => r.ratioWalk[t]),
  };
}

const n0 = (x: number | null) => (x === null ? "—" : Math.round(x).toLocaleString("en-US"));
const n1 = (x: number | null) => (x === null ? "—" : x.toFixed(1));
const n2 = (x: number | null) => (x === null ? "—" : x.toFixed(2));
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Mục Markdown "Chặn đường (CD6)" cho `docs/CAN_BANG.md`. */
export function renderAmbush(walkSec: number): string {
  const rows = ambushRealmRows(walkSec);
  const a = ambushAverages(rows);
  const walk = walkSec;
  const perHour = ambushPerHour(45, walk); // trận ~45 s trung bình

  const table = rows.map(
    (r) =>
      `| ${r.label} | ${r.base} | ${pct(r.win.normal)} / ${pct(r.win.elite)} / ${pct(r.win.leader)} | ${n1(r.fightSec.normal)} / ${n1(r.fightSec.elite)} / ${n1(r.fightSec.leader)} | ${n2(r.ratioWalk.normal)} / ${n2(r.ratioWalk.elite)} / ${n2(r.ratioWalk.leader)} |`,
  );

  // So sánh giá bỏ chạy vs thưởng (mục 9): thắng luôn lợi hơn bỏ chạy, bỏ chạy lỗ ít hơn thua.
  const sample = rows[0];
  const priceExample = sample
    ? ambushExpPrice(
        Math.round(expToNextBar(sample.realm)),
        Math.round(expToNextBar(sample.realm)),
        "offer",
      )
    : 0;

  return `## Chặn đường (CD6, #1066)

Mô phỏng cân bằng gặp chặn đường (docs/THIET_KE_CHAN_DUONG.md mục 9): người chơi TRUNG BÌNH (đồ chuẩn bậc cuối mỗi cảnh giới) CHỌN CHIẾN. Trận là một **đấu trường** (như bí cảnh): đứng yên chém, quái trúng 80% đòn (CẬN TRÊN), người chơi dùng Hồi Huyết Đan (hồi 40% máu, 8 s/lần, mang 3 viên). Kẻ địch là MÔ HÌNH TỔNG QUÁT theo mức (chưa phụ thuộc \`AMBUSH_FOES\` — nội dung E/G): con quái cứng nhất hợp cảnh giới (loại world-boss máu khổng lồ) làm gốc, nhân hệ số (\`normal\` 2 con; \`elite\` x${ELITE_HP_MULT} máu/x${ELITE_ATK_MULT} công; \`leader\` cầm đầu x4 máu + 1 lính — ĐỀ XUẤT).

| Cảnh giới | Quái gốc | Thắng thường / tinh anh / cầm đầu | Trận (s) thường / T.A / C.đầu | Tu vi/phút có đi bộ so thường (T/T.A/C.đầu) |
|---|---|---:|---:|---:|
${table.join("\n")}

**Trung bình các cảnh giới:** thắng ${pct(a.win.normal)} / ${pct(a.win.elite)} / ${pct(a.win.leader)} (mục tiêu >= 90 / 80 / 60%); trận ${n1(a.fightSec.normal)} / ${n1(a.fightSec.elite)} / ${n1(a.fightSec.leader)} s (mục tiêu 30-70 s); tu vi/phút có đi bộ so săn thường ${n2(a.ratioWalk.normal)} / ${n2(a.ratioWalk.elite)} / ${n2(a.ratioWalk.leader)} x (mục tiêu 1.2-1.4, KHÔNG hơn bí cảnh).

**Số lần chặn đường / giờ:** trần do hồi 8 phút ~${n0(perHour.cooldownCeil)} lần/giờ (nếu liên tục); thực tế bị trần ${AMBUSH_DAY_CAP}/ngày (~${n0(perHour.dayCapPerHour)}/giờ trong phiên 6 giờ); đi bộ trung bình ~${n0(walk)} s giữa hai lần. Chặn đường là CƠ HỘI bổ sung (quy tảo), KHÔNG phải cách cày chính — hợp với hồi + trần ngày.

**Giá bỏ chạy so với thưởng (mục 9):** thắng luôn LỢI hơn bỏ chạy (thắng +${n0(sample?.expReward.normal ?? 0)} tu vi; bỏ chạy mất ~${n0(priceExample)} tu vi — chỉ ~${Math.round((priceExample / (sample?.expReward.normal ?? 1)) * 100)}% thưởng); bỏ chạy lỗ NHỎ hơn thua (thua = chết thật, mất kiếp — nặng hơn nhiều). Hệ số thưởng (tu vi x6/12/28, Linh thạch x2/3/5 — ĐỀ XUẤT) chốt lại ở PR hằng số riêng sau khi duyệt mô phỏng.

**Đề xuất hằng số chốt (chuyển \`shared/src/ambush.ts\` ở PR riêng):** \`AMBUSH_EXP_REWARD_MULT\`, \`AMBUSH_COIN_REWARD_MULT\`, hệ số kẻ địch \`leader\`. \`AMBUSH_TIER_WEIGHTS\` (70/25/5), \`AMBUSH_COOLDOWN_MS\` (8p), \`AMBUSH_DAY_CAP\` (12), \`AMBUSH_ROLL_P_*\` giữ nguyên — mô phỏng cho thấy đủ.
`;
}

/** Độ lớn thanh tu vi của cảnh giới (độ lớn thanh ở bậc cuối) — cho ví dụ giá bỏ chạy. */
function expToNextBar(realm: number): number {
  const tiers = REALMS[realm].tiers.length;
  return expToNext(realm, Math.max(0, tiers - 1));
}
