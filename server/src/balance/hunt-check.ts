// Đối chiếu mô hình cân bằng với MÃ SERVER THẬT (#406 mục 7, độc lập với số đo bằng bot của C ở #410).
// `huntRate` (simulate.ts) giả định: thời gian một trận = máu quái / sát thương mỗi giây của kiếm chém (kể cả bạo kích trung bình),
// khí huyết mất = công quái / chu kỳ x thời gian trận x tỉ lệ trúng (0,8: người chơi né ~20%), đội `n` người thì mỗi người chịu 1/n.
// Ở đây dựng một `World` thật (như `pk.ts` / `dungeon.ts`): người chơi đứng cạnh quái, đánh thường mỗi lần hồi chiêu, quái dùng AI
// thật (`tickMonsters`); đo thời gian hạ quái và khí huyết mất rồi so với công thức. Không né, không di chuyển (ca khó).
// Không kiểm: thời gian tìm quái, mật độ quái, người chơi thật (cần bot: #410).
import {
  AM_SUONG_ID,
  DROP_TABLES,
  KIM_DAN_RECIPES,
  buyPrice,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  REALMS,
  SKILLS,
  TICK_MS,
  getMap,
  statsFor,
} from "@tien-gioi/shared";
import { slash } from "../systems/combat";
import { setEquipment } from "../systems/equipment";
import { useItem } from "../systems/inventory";
import { tickMonsters } from "../systems/monsters";
import { applyStats } from "../systems/progression";
import { addMonster, addPlayer, makeWorld } from "../systems/test-helpers";
import { ASSUME, bestGear } from "./simulate";
import { ASSUME_DUNGEON } from "./dungeon";
import { KIM_DAN_BOSS_ID, KIM_DAN_MONSTER_IDS } from "./kim-dan-sau";

const KD = 3;
const MAX_SECONDS = 300;
/** Số trận mỗi ô của bảng trùm theo đội (hạt giống 1..N) */
export const BOSS_RUNS = 6;

function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const median = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

export interface HuntFight {
  /** Giây từ lúc vào trận tới lúc quái chết (MAX_SECONDS nếu không hạ được) */
  seconds: number;
  /** Khí huyết người chơi mất (không né, không uống đan) */
  lost: number;
  dead: boolean;
  killed: boolean;
  maxHp: number;
}

/** Một trận solo: người cảnh giới (realm, tier) mặc trang bị tốt nhất đánh một con `kind` (mã server thật, Math.random có hạt giống). */
export function huntFight(realm: number, tier: number, kind: string, seed = 1): HuntFight {
  const saved = Math.random;
  Math.random = seeded(seed);
  try {
    const { w } = makeWorld(getMap(AM_SUONG_ID)!);
    const { p } = addPlayer(w, "A", realm, tier);
    setEquipment(p, bestGear(realm, tier));
    applyStats(p, true);
    const hp0 = p.hp;
    const { id } = addMonster(w, kind, p.x + 40, p.y);
    w.now = 1_000_000;
    const dt = TICK_MS / 1000;
    let t = 0;
    while (t < MAX_SECONDS && w.state.monsters.has(id) && !p.dead) {
      w.now += TICK_MS;
      t += dt;
      w.tick++;
      tickMonsters(w, dt);
      const m = w.state.monsters.get(id);
      if (!m) break;
      slash(w, "A", Math.atan2(m.y - p.y, m.x - p.x));
    }
    return {
      seconds: t,
      lost: hp0 - p.hp,
      dead: p.dead,
      killed: !w.state.monsters.has(id),
      maxHp: p.maxHp,
    };
  } finally {
    Math.random = saved;
  }
}

export interface HuntCheckRow {
  label: string;
  realm: number;
  tier: number;
  monsterId: string;
  /** Thời gian trận theo mô hình / trung vị mã thật (giây) */
  modelSeconds: number;
  realSeconds: number;
  /** Khí huyết mất theo mô hình (đã có tỉ lệ trúng 0,8) / trung vị mã thật (không né) */
  modelLost: number;
  realLost: number;
  maxHp: number;
  killedAll: boolean;
  /** realSeconds / modelSeconds */
  timeRatio: number;
  /** realLost / (modelLost / hitTaken): khí huyết mất của mã thật so với mô hình NẾU người chơi không né */
  lostRatioNoDodge: number;
}

/** So mô hình với mã thật cho một (bậc, quái): `runs` trận hạt giống 1..runs. */
export function huntCheck(realm: number, tier: number, monsterId: string, runs = 12): HuntCheckRow {
  const m = MONSTER_BY_ID[monsterId];
  const s = statsFor(realm, tier, bestGear(realm, tier));
  const dps = (s.atk * SKILLS.slash.mult * ASSUME.critAvg) / (SKILLS.slash.cooldown / 1000);
  const modelSeconds = m.hp / dps;
  const modelLost = (m.atk / (m.attackCd / 1000)) * modelSeconds * ASSUME.hitTaken;
  const fights = Array.from({ length: runs }, (_, i) => huntFight(realm, tier, monsterId, i + 1));
  const realSeconds = median(fights.map((f) => f.seconds));
  const realLost = median(fights.map((f) => f.lost));
  return {
    label: `${REALMS[realm].name} ${REALMS[realm].tiers[tier]}`,
    realm,
    tier,
    monsterId,
    modelSeconds,
    realSeconds,
    modelLost,
    realLost,
    maxHp: fights[0].maxHp,
    killedAll: fights.every((f) => f.killed),
    timeRatio: realSeconds / modelSeconds,
    lostRatioNoDodge: realLost / (modelLost / ASSUME.hitTaken),
  };
}

/** Các cặp (bậc, quái) đối chiếu: mọi loài Kim Đan (kể cả Xích Mãng) x ba bậc, cộng đại diện Luyện Khí / Trúc Cơ. */
export function huntCheckCases(): [number, number, string][] {
  const out: [number, number, string][] = [
    [1, 4, "lang"],
    [2, 2, "ho"],
  ];
  for (let tier = 0; tier < REALMS[KD].tiers.length; tier++)
    for (const id of ["mang", ...KIM_DAN_MONSTER_IDS]) out.push([KD, tier, id]);
  return out;
}

export interface BossFight {
  seconds: number;
  killed: boolean;
  deaths: number;
  /** Số Đại Hồi Huyết Đan mỗi người đã uống */
  potions: number[];
  /** Khí huyết mất cuối trận của người chịu nhiều nhất (tỉ lệ maxHp, 0..1) */
  worstLostFrac: number;
}

export interface BossOptions {
  realm?: number;
  tier: number;
  party: number;
  /** Số Đại Hồi Huyết Đan mỗi người mang (0 = không đan) */
  potions?: number;
  seed?: number;
}

/**
 * Trận đánh trùm Hắc Giao của đội `party` người cùng bậc bằng mã server thật, cùng chính sách với `dungeon.ts` (`fightBoss`): đứng
 * cạnh trùm đánh thường liên tục, uống Đại Hồi Huyết Đan (hồi 70%, hồi chiêu 10 giây) khi khí huyết dưới 50%. Trùm CHỈ đánh một
 * mục tiêu (người nó đã nhắm) nên sát thương KHÔNG chia đều như công thức `/ party` của mô hình.
 */
export function bossFight(o: BossOptions): BossFight {
  const realm = o.realm ?? KD;
  const potionsEach = o.potions ?? ASSUME_DUNGEON.potions;
  const saved = Math.random;
  Math.random = seeded(o.seed ?? 1);
  try {
    const { w } = makeWorld(getMap(AM_SUONG_ID)!);
    const sids = Array.from({ length: o.party }, (_, i) => `P${i}`);
    const players = sids.map((sid) => {
      const { p, c } = addPlayer(w, sid, realm, o.tier);
      setEquipment(p, bestGear(realm, o.tier));
      applyStats(p, true);
      if (potionsEach > 0) c.inv[0] = { itemId: "dai_hoi_huyet_dan", qty: potionsEach };
      return p;
    });
    players.forEach((p, i) => {
      p.x = players[0].x + i * 12;
      p.y = players[0].y;
    });
    const hp0 = players.map((p) => p.hp);
    const used = sids.map(() => 0);
    const worst = sids.map(() => 0);
    const { id } = addMonster(w, KIM_DAN_BOSS_ID, players[0].x + 40, players[0].y);
    w.now = 1_000_000;
    const dt = TICK_MS / 1000;
    let t = 0;
    while (t < 600 && w.state.monsters.has(id) && players.some((p) => !p.dead)) {
      w.now += TICK_MS;
      t += dt;
      w.tick++;
      tickMonsters(w, dt);
      const m = w.state.monsters.get(id);
      if (!m) break;
      sids.forEach((sid, i) => {
        const p = players[i];
        if (p.dead) return;
        const c = w.ctrl.get(sid)!;
        if (
          p.hp < p.maxHp * ASSUME_DUNGEON.potionBelow &&
          (c.inv[0]?.qty ?? 0) > 0 &&
          w.now >= (c.itemCd.get("dai_hoi_huyet_dan") ?? 0)
        ) {
          useItem(w, sid, 0);
          used[i]++;
        }
        slash(w, sid, Math.atan2(m.y - p.y, m.x - p.x));
        worst[i] = Math.max(worst[i], (hp0[i] - p.hp) / p.maxHp);
      });
    }
    return {
      seconds: t,
      killed: !w.state.monsters.has(id),
      deaths: players.filter((p) => p.dead).length,
      potions: used,
      worstLostFrac: Math.max(...players.map((p, i) => (hp0[i] - p.hp) / p.maxHp), 0),
    };
  } finally {
    Math.random = saved;
  }
}

export interface BossSummary {
  tier: number;
  party: number;
  potionsEach: number;
  runs: number;
  killRate: number;
  /** Giây trung vị của các trận thắng (null nếu không thắng trận nào) */
  seconds: number | null;
  /** Trung bình tổng số đan cả đội uống mỗi trận thắng */
  potionsPerKill: number | null;
  deathsPerRun: number;
}

/** Tổng hợp `runs` trận (hạt giống 1..runs). */
export function bossSummary(
  tier: number,
  party: number,
  potionsEach: number = ASSUME_DUNGEON.potions,
  runs = BOSS_RUNS,
): BossSummary {
  const fights = Array.from({ length: runs }, (_, i) =>
    bossFight({ tier, party, potions: potionsEach, seed: i + 1 }),
  );
  const won = fights.filter((f) => f.killed);
  return {
    tier,
    party,
    potionsEach,
    runs,
    killRate: won.length / runs,
    seconds: won.length ? median(won.map((f) => f.seconds)) : null,
    potionsPerKill: won.length
      ? won.reduce((n, f) => n + f.potions.reduce((a, b) => a + b, 0), 0) / won.length
      : null,
    deathsPerRun: fights.reduce((n, f) => n + f.deaths, 0) / runs,
  };
}

/** Số đan mỗi người mang khi "đủ đan" (đan xếp chồng 20 / ô): đủ để không phải là giới hạn, dùng để tách luật khỏi trần mang. */
export const POTIONS_PLENTY = 30;

/** Sát thương trùm lên MỘT người mỗi giây, tỉ lệ khí huyết tối đa (trúng 100%, không né) ở bậc Kim Đan `tier` (mặc trang bị tốt nhất). */
export function bossDpsFrac(tier: number): number {
  const b = MONSTER_BY_ID[KIM_DAN_BOSS_ID];
  return b.atk / (b.attackCd / 1000) / statsFor(KD, tier, bestGear(KD, tier)).maxHp;
}

/** Tốc độ hồi của Đại Hồi Huyết Đan: tỉ lệ khí huyết tối đa mỗi giây (70% / 10 giây = 7%). */
export function potionHealFrac(): number {
  const d = ITEM_BY_ID.dai_hoi_huyet_dan;
  return (d.effect as { pct: number }).pct / (d.cooldown! / 1000);
}

export interface PerPersonRow {
  tier: number;
  party: number;
  /** Giây một trận, số trận cả đội cần, phút MỖI NGƯỜI, đan MỖI NGƯỜI và Linh thạch tương ứng, số chết trung bình */
  secondsPerKill: number;
  kills: number;
  minutes: number;
  potions: number;
  coin: number;
  deathsPerRun: number;
}

/**
 * Chi phí MỖI NGƯỜI để có đủ Giao Lân của MỘT bộ III (`KIM_DAN_RECIPES`: 19) khi cả đội `party` người cùng hạ trùm. Đồ rơi của trùm
 * là MỘT chủ (cùng giả định mục 6): cả đội cần `party x 19`, mỗi trận rơi trung bình 3, nên số trận tăng theo cỡ đội và thời gian
 * mỗi người gần như KHÔNG đổi (mỗi trận ngắn lại tương ứng); cái đổi là số đan mỗi người. Mỗi người mang đủ đan (`POTIONS_PLENTY`).
 */
export function bossPerPerson(tier: number, party: number, runs = BOSS_RUNS): PerPersonRow | null {
  const sum = bossSummary(tier, party, POTIONS_PLENTY, runs);
  if (sum.seconds === null || sum.potionsPerKill === null) return null;
  const need = KIM_DAN_RECIPES.reduce(
    (n, r) => n + (r.inputs.find((i) => i.itemId === "giao_lan")?.qty ?? 0),
    0,
  );
  const row = DROP_TABLES[KIM_DAN_BOSS_ID].find((d) => d.itemId === "giao_lan")!;
  const perKill = row.chance * ((row.min + row.max) / 2);
  const kills = (need * party) / perKill;
  return {
    tier,
    party,
    secondsPerKill: sum.seconds,
    kills,
    minutes: (kills * sum.seconds) / 60,
    potions: (kills * sum.potionsPerKill) / party,
    coin: ((kills * sum.potionsPerKill) / party) * buyPrice("dai_hoi_huyet_dan"),
    deathsPerRun: sum.deathsPerRun,
  };
}

export interface AtkSweepRow {
  mult: number;
  hauSolo: BossSummary;
  hauParty3: BossSummary;
  hauParty4: BossSummary;
  soParty4: BossSummary;
}

/** Nhân công trùm với từng hệ số (đủ đan): có hệ số chung nào vừa chặn solo ở Hậu kỳ vừa giữ đội 4 ở Sơ kỳ không chết? Khôi phục công trùm sau khi đo. */
export function bossAtkSweep(mults = [1, 1.4, 1.7, 2, 2.5], runs = 4): AtkSweepRow[] {
  const boss = MONSTER_BY_ID[KIM_DAN_BOSS_ID];
  const saved = boss.atk;
  try {
    return mults.map((mult) => {
      boss.atk = saved * mult;
      return {
        mult,
        hauSolo: bossSummary(2, 1, POTIONS_PLENTY, runs),
        hauParty3: bossSummary(2, 3, POTIONS_PLENTY, runs),
        hauParty4: bossSummary(2, 4, POTIONS_PLENTY, runs),
        soParty4: bossSummary(0, 4, POTIONS_PLENTY, runs),
      };
    });
  } finally {
    boss.atk = saved;
  }
}

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);
const n2 = (x: number) => x.toFixed(2);

/** Mục 9 của "Kim Đan sau nội dung" trong `docs/CAN_BANG.md`. */
export function renderHuntCheck(): string {
  const rows = huntCheckCases().map(([realm, tier, id]) => huntCheck(realm, tier, id));
  const rowLines = rows.map(
    (r) =>
      `| ${r.label} | ${MONSTER_BY_ID[r.monsterId].name} | ${n1(r.modelSeconds)} | ${n1(r.realSeconds)} | ${n2(r.timeRatio)}x | ${n0(r.modelLost)} | ${n0(r.realLost)} (${n0((r.realLost / r.maxHp) * 100)}%) | ${n2(r.lostRatioNoDodge)}x |`,
  );
  const tMin = Math.min(...rows.map((r) => r.timeRatio));
  const tMax = Math.max(...rows.map((r) => r.timeRatio));
  const lMin = Math.min(...rows.map((r) => r.lostRatioNoDodge));
  const lMax = Math.max(...rows.map((r) => r.lostRatioNoDodge));
  const hauRow = rows.find((r) => r.realm === KD && r.tier === 2 && r.monsterId === "doc_thiem")!;
  const hauDoc = { ...hauRow, monsterName: MONSTER_BY_ID[hauRow.monsterId].name };
  const tiers = [0, 1, 2];
  const boss = tiers.flatMap((tier) =>
    [1, 2, 3, 4].map((party) => ({
      tier,
      party,
      none: bossSummary(tier, party, 0),
      eight: bossSummary(tier, party, ASSUME_DUNGEON.potions),
      plenty: bossSummary(tier, party, POTIONS_PLENTY),
    })),
  );
  const cell = (s: BossSummary) =>
    s.killRate === 0
      ? `không hạ được (${n1(s.deathsPerRun)} chết / trận)`
      : `${n0(s.killRate * 100)}% hạ, ${n0(s.seconds!)} giây, ${n1(s.deathsPerRun)} chết / trận${s.potionsPerKill ? `, ${n1(s.potionsPerKill)} đan` : ""}`;
  const bossLines = boss.map(
    (b) =>
      `| ${REALMS[KD].tiers[b.tier]} | ${b.party} | ${cell(b.none)} | ${cell(b.eight)} | ${cell(b.plenty)} |`,
  );
  const partyOk = boss
    .filter((b) => b.party >= 3)
    .every((b) => b.eight.killRate === 1 && b.eight.deathsPerRun === 0);
  const soloEnough = boss
    .filter((b) => b.party === 1)
    .every((b) => b.plenty.killRate === 1 && b.plenty.deathsPerRun === 0);
  const heal = potionHealFrac();
  const dps = tiers.map((t) => bossDpsFrac(t));
  const perPerson = tiers.flatMap((t) => [1, 2, 3, 4].map((party) => bossPerPerson(t, party)));
  const ppLines = perPerson.map((r) =>
    r
      ? `| ${REALMS[KD].tiers[r.tier]} | ${r.party} | ${n0(r.secondsPerKill)} | ${n1(r.kills)} | ${n1(r.minutes)} | ${n1(r.potions)} (${n0(r.coin)} Linh thạch) |`
      : "",
  );
  const ppHau = (party: number) => perPerson.find((r) => r?.tier === 2 && r.party === party)!;
  const sweep = bossAtkSweep();
  const sweepLine = (s: BossSummary) =>
    s.killRate === 0
      ? `0% (${n1(s.deathsPerRun)} chết)`
      : `${n0(s.killRate * 100)}%, ${n1(s.deathsPerRun)} chết`;
  const sweepLines = sweep.map(
    (r) =>
      `| x${r.mult} (${n0(MONSTER_BY_ID[KIM_DAN_BOSS_ID].atk * r.mult)}) | ${sweepLine(r.hauSolo)} | ${sweepLine(r.hauParty3)} | ${sweepLine(r.hauParty4)} | ${sweepLine(r.soParty4)} |`,
  );
  const noCommonFactor = !sweep.some(
    (r) => r.hauSolo.killRate === 0 && r.soParty4.deathsPerRun === 0,
  );
  return `### 9. Đối chiếu mô hình với mã server thật (#406 mục 7)

Độc lập với số đo bằng bot của C (#410): dựng \`World\` thật (\`hunt-check.ts\`), người chơi mặc trang bị tốt nhất đứng cạnh quái, đánh thường mỗi lần hồi chiêu, quái dùng AI thật; **không né, không di chuyển** (ca khó, như mục "PK" và "Bí cảnh"). Không kiểm thời gian tìm quái, mật độ quái và người chơi thật (cần bot).

**Săn quái thường (solo, 12 trận mỗi dòng).** Thời gian trận theo mô hình = máu / (công x hệ số chém x bạo kích trung bình / hồi chiêu); khí huyết mất theo mô hình đã nhân tỉ lệ trúng ${ASSUME.hitTaken} (giả định người chơi né ~20%), nên cột cuối so mã thật (không né) với mô hình chia ${ASSUME.hitTaken}.

| Bậc | Quái | Giây (mô hình) | Giây (thật) | Tỉ lệ | Khí huyết mất (mô hình) | Khí huyết mất (thật, không né) | Thật / mô hình không né |
|---|---|---:|---:|---:|---:|---:|---:|
${rowLines.join("\n")}

Thời gian hạ quái khớp mô hình trong **${n2(tMin)}x - ${n2(tMax)}x** (mục tiêu lệch <= ~25%): tốc độ tu vi / giờ và Linh thạch / giờ của mục 1 (phụ thuộc thời gian trận) đáng tin ở phần này. Khí huyết mất của mã thật bằng **${n2(lMin)}x - ${n2(lMax)}x** mô hình không né (mô hình giả định né ${n0((1 - ASSUME.hitTaken) * 100)}%, nên mã thật không né mất nhiều hơn mô hình ${n0((lMin / ASSUME.hitTaken - 1) * 100)}-${n0((lMax / ASSUME.hitTaken - 1) * 100)}%; phần dư ngoài hệ số né là làm tròn: quái đánh phát đầu ngay khi vào tầm nên số đòn là làm tròn LÊN, rõ nhất ở trận ngắn). Hệ quả: tiêu chí "an toàn" (mất <= 50% khí huyết mỗi trận) dựa trên giả định né; người KHÔNG né mất nhiều hơn số ở mục 1, vd ${hauDoc.label} ${hauDoc.monsterName}: **${n0((hauDoc.realLost / hauDoc.maxHp) * 100)}%** thay vì ${n0((hauDoc.modelLost / hauDoc.maxHp) * 100)}%; vẫn sống (đả tọa / đan hồi giữa các trận) nhưng sát ngưỡng khi gặp hai con cùng lúc.

**Trùm Hắc Giao theo đội, mã thật.** Mô hình mục 2 chia sát thương đều cho cả đội (\`/ n\`); mã thật thì trùm CHỈ đánh một mục tiêu (người nó đã nhắm), nên người bị nhắm chịu gần hết sát thương (cột "Không đan": có người chết ở đội 3 - 4); Đại Hồi Huyết Đan (hồi ${n0((ITEM_BY_ID.dai_hoi_huyet_dan.effect as { pct: number }).pct * 100)}%, hồi chiêu ${n0(ITEM_BY_ID.dai_hoi_huyet_dan.cooldown! / 1000)} giây, ${n0(buyPrice("dai_hoi_huyet_dan"))} Linh thạch) cứu được. Chính sách như \`dungeon.ts\` (\`ASSUME_DUNGEON\`): đứng đánh liên tục, uống đan khi khí huyết dưới ${n0(ASSUME_DUNGEON.potionBelow * 100)}%. Hai cột đan: mang ${ASSUME_DUNGEON.potions} viên (chính sách của bí cảnh) và đủ đan (${POTIONS_PLENTY} viên, không còn là giới hạn). ${BOSS_RUNS} trận mỗi ô.

| Bậc | Đội | Không đan | ${ASSUME_DUNGEON.potions} viên / người | Đủ đan (${POTIONS_PLENTY} viên / người) |
|---|---:|---|---|---|
${bossLines.join("\n")}

**Vì sao một người hạ được.** Sát thương trùm lên MỘT người (trúng 100%, không né) là **${dps.map((d) => n1(d * 100)).join("% / ")}%** khí huyết mỗi giây ở Sơ / Trung / Hậu kỳ, còn đan hồi **${n1(heal * 100)}%** mỗi giây: ở CẢ BA bậc sát thương < tốc độ hồi nên một người bền vững nếu đủ đan. Trần ${ASSUME_DUNGEON.potions} viên chỉ là giới hạn mang, không phải của luật: ở cột "${ASSUME_DUNGEON.potions} viên" solo Sơ kỳ không hạ được và Trung kỳ hạ được ít, ${soloEnough ? "nhưng đủ đan thì hạ được 100%, 0 chết ở mọi bậc" : "xem cột đủ đan"}.

**Chi phí MỖI NGƯỜI để có 19 Giao Lân (một bộ III).** Đồ rơi của trùm là MỘT chủ (cùng giả định mục 6), nên cả đội cần \`số người x 19\`, mỗi trận rơi trung bình 3: số trận tăng theo cỡ đội và mỗi trận ngắn lại tương ứng nên **thời gian mỗi người gần như KHÔNG đổi theo cỡ đội**; cái đổi là **số đan** (đủ đan, mỗi người mang theo):

| Bậc | Đội | Giây / trận | Số trận cả đội | Phút mỗi người | Đan mỗi người |
|---|---:|---:|---:|---:|---:|
${ppLines.join("\n")}

**Hệ số công trùm: không có hệ số chung nào vừa chặn solo vừa giữ đội an toàn.** Nhân công trùm (đủ đan, ${4} trận mỗi ô) để bắt buộc đội:

| Công trùm | Hậu kỳ, một người | Hậu kỳ, đội 3 | Hậu kỳ, đội 4 | Sơ kỳ, đội 4 |
|---|---|---|---|---|
${sweepLines.join("\n")}

**Nhận định.** Mục tiêu M6 "đội 3-4 người hạ được, không ai chết; một người không hạ nổi" (\`PHAN_CONG_M6.md\` mục 4): ${partyOk ? "đội 3-4 hạ được và không ai chết khi có đan (đạt)" : "đội 3-4 CHƯA đạt (xem bảng)"}; ${soloEnough ? `"một người không hạ nổi" **không đạt**: một người hạ được ở mọi bậc nếu đủ đan (Hậu kỳ solo ${n0(ppHau(1).potions)} đan ~ ${n0(ppHau(1).coin)} Linh thạch cho 19 Giao Lân). Đội KHÔNG nhanh hơn theo người (${n1(ppHau(1).minutes)} phút solo so với ${n1(ppHau(4).minutes)} phút đội 4 ở Hậu kỳ); lợi thế của đội là **ít đan hơn ~${n1(ppHau(1).potions / ppHau(4).potions)} lần** (${n0(ppHau(4).potions)} so với ${n0(ppHau(1).potions)} viên mỗi người), tức ${n0(ppHau(1).coin - ppHau(4).coin)} Linh thạch chênh mỗi bộ III.` : "một người không hạ nổi ở mọi bậc (đạt)."} ${noCommonFactor ? "Tăng công trùm KHÔNG giải được: hệ số đủ chặn solo Hậu kỳ thì đội 4 Sơ kỳ đã có người chết (bảng trên)." : ""} Chốt cho người dùng (\`questions.md\` câu 3): giữ nguyên (đội là cách RẺ đan, không phải cách duy nhất), hoặc giảm hiệu lực / kéo dài hồi chiêu Đại Hồi Huyết Đan (đụng cả bí cảnh và PK), hoặc công trùm theo cỡ đội (cần mã mới).
`;
}
