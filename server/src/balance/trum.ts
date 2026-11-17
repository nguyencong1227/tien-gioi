// Cân bằng TRÙM NHIỀU CHIÊU (mục 42, T5 #874): chạy BỘ THỰC THI THẬT (`systems/boss.ts` qua `tickMonsters`) trên dữ liệu `BOSSES` THẬT, nên thêm / sửa trùm là báo cáo
// đổi theo. Mỗi trùm đo ở bậc "đúng bậc" (`stepOf` = `level` của loài):
//  1. thời gian hạ trùm của đội 1..4 người (đánh thường liên tục, uống Hồi Huyết Đan, KHÔNG né: ca KHÓ, như `dungeon.ts`), quy ra thời gian thật = giây mô phỏng / `bossUptime`;
//  2. sát thương MỖI ĐÒN / khí huyết tối đa của người đúng bậc (mọi chiêu, mọi giai đoạn, kể cả cuồng nộ), thiết kế <= ~55%;
//  3. tỉ lệ chết: bot KHÔNG né (đứng cạnh trùm) vs bot né hoàn hảo (`boss-dodge-bot.ts`: phản xạ 400 ms, 150 px/giây): né phải ~0 trúng;
//  4. cuồng nộ: trận có kịp tới mốc cuồng nộ không (hạ trùm trước mốc là bình thường, nhưng đội yếu phải tới mốc).
// Dùng `Math.random` có hạt giống như `dungeon.ts` nên kết quả cố định. Số liệu là ĐỀ XUẤT của E (T3 #872) và D; ở đây chỉ ĐO và báo vi phạm, không sửa số.
import {
  BOSSES,
  DEFAULT_MAP,
  MONSTER_BY_ID,
  TICK_MS,
  stepOf,
  statsFor,
  type BossDef,
  type GameMap,
} from "@tien-gioi/shared";
import { runDodgeBot } from "../systems/boss-dodge-bot";
import { slash } from "../systems/combat";
import { setEquipment } from "../systems/equipment";
import { useItem } from "../systems/inventory";
import { placeMonster, tickMonsters } from "../systems/monsters";
import { applyStats } from "../systems/progression";
import { addPlayer, makeWorld } from "../systems/test-helpers";
import { ASSUME_DUNGEON, realmTierOfStep, seeded } from "./dungeon";
import { bestGear } from "./simulate";

/** Giả định riêng của trận trùm (đổi ở đây nếu thấy không giống người chơi thật). */
export const ASSUME_BOSS = {
  /** Mỗi đòn trùm đáp không quá tỉ lệ khí huyết tối đa này của người đúng bậc (thiết kế mục 9 / câu hỏi mở 2) */
  maxHitFraction: 0.55,
  /** Số trận mô phỏng mỗi cỡ đội (hạt giống 1..N) */
  runs: 8,
  /** Giây mô phỏng tối đa mỗi trận (hết giờ = không hạ nổi) */
  maxSeconds: 1800,
  /** Cỡ đội đo */
  parties: [1, 2, 3, 4] as readonly number[],
  /** Bot né hoàn hảo: số seed x giây mô phỏng mỗi giai đoạn (như `boss-data-dodge.test.ts`) */
  dodgeSeeds: 4,
  dodgeSimMs: 30_000,
} as const;

/** Bãi trống (không tường): chỉ đo bộ chiêu và hình học, không đo đường đi. */
function openArena(): GameMap {
  const m = Object.create(DEFAULT_MAP) as GameMap;
  m.circleBlocked = () => false;
  return m;
}

/** Bậc tu "đúng bậc" của trùm: `stepOf` = `level` của loài (Xích Mãng 12 = Trúc Cơ cuối, Hắc Giao 15 = Kim Đan ...). */
export function bossStep(def: BossDef): { realm: number; tier: number; step: number } {
  const level = MONSTER_BY_ID[def.kind]!.level;
  const { realm, tier } = realmTierOfStep(level);
  return { realm, tier, step: stepOf(realm, tier) };
}

export interface HitFraction {
  ability: string;
  /** Giai đoạn có hệ số công LỚN NHẤT cho chiêu này (kể cả cuồng nộ nếu có) */
  phase: string;
  /** Sát thương một đòn (giống `abilityDamage` của `boss.ts`: `round(atk x hệ số x dmgMult)`, >= 1) */
  dmg: number;
  /** dmg / khí huyết tối đa của người đúng bậc, mặc đồ tốt nhất */
  fraction: number;
}

/**
 * Sát thương MỖI ĐÒN / khí huyết tối đa của người đúng bậc: với mỗi chiêu có sát thương, lấy hệ số công lớn nhất trong mọi giai đoạn dùng chiêu đó
 * (và cuồng nộ nếu có: nhân thêm `enrage.atkMult`). Là cận trên, vì chưa trừ giảm sát thương nào của người chơi.
 */
export function hitFractions(def: BossDef): HitFraction[] {
  const { realm, tier } = bossStep(def);
  const maxHp = statsFor(realm, tier, bestGear(realm, tier)).maxHp;
  const atk = MONSTER_BY_ID[def.kind]!.atk;
  const enrage = def.enrage?.atkMult ?? 1;
  const out: HitFraction[] = [];
  for (const a of def.abilities) {
    if (a.dmgMult <= 0) continue;
    let best = 0;
    let bestPhase = "";
    for (const ph of def.phases) {
      if (!ph.abilities.includes(a.id)) continue;
      const mult = ph.atkMult * enrage;
      if (mult > best) {
        best = mult;
        bestPhase = ph.id;
      }
    }
    if (best <= 0) continue; // chiêu không giai đoạn nào dùng (dữ liệu lỗi: `bossViolations` bắt)
    const dmg = Math.max(1, Math.round(atk * best * a.dmgMult));
    out.push({ ability: a.id, phase: bestPhase, dmg, fraction: dmg / maxHp });
  }
  return out;
}

export interface BossFight {
  killed: boolean;
  /** Giây mô phỏng tới khi trùm chết (hoặc cả đội ngã / hết giờ) */
  seconds: number;
  deaths: number;
  potionsUsed: number;
  /** Trùm có vào cuồng nộ trong trận không (`BossCtrl.enraged`) */
  enraged: boolean;
  /** Số chiêu trùm đã vận trong trận (`fx` `bossCast`): trận quá ngắn thì bộ chiêu chẳng có ý nghĩa */
  casts: number;
}

/**
 * Trận đánh trùm `def` của đội `party` người đúng bậc, bằng mã server thật (`tickMonsters` chạy bộ chiêu): người đứng cạnh trùm đánh thường liên tục, uống đan khi
 * khí huyết dưới ngưỡng, KHÔNG né (ca khó nhất: trùm trúng mọi đòn có người trong vùng, kể cả đòn đánh thường).
 */
export function fightBossMoves(def: BossDef, party: number, seed: number): BossFight {
  const boss = MONSTER_BY_ID[def.kind]!;
  const { realm, tier } = bossStep(def);
  const saved = Math.random;
  Math.random = seeded(seed);
  try {
    const { w, fx } = makeWorld(openArena());
    w.bossMoves = true;
    const spot = { x: 2300, y: 2300 };
    const id = placeMonster(w, boss, spot.x, spot.y);
    const mc = w.mctrl.get(id)!;
    if (!mc.boss)
      throw new Error(`${def.kind}: placeMonster không dựng bộ chiêu (thiếu trong BOSSES?)`);
    const sids: string[] = [];
    for (let i = 0; i < party; i++) {
      const sid = `P${i}`;
      sids.push(sid);
      const { p, c } = addPlayer(w, sid, realm, tier);
      setEquipment(p, bestGear(realm, tier));
      applyStats(p, true);
      c.inv[0] = { itemId: "hoi_huyet_dan", qty: ASSUME_DUNGEON.potions };
      const a = (i / party) * Math.PI * 2;
      p.x = spot.x + Math.cos(a) * 45;
      p.y = spot.y + Math.sin(a) * 45;
    }
    const dt = TICK_MS / 1000;
    let seconds = 0;
    let potionsUsed = 0;
    w.now = 1_000_000;
    while (seconds < ASSUME_BOSS.maxSeconds) {
      w.now += TICK_MS;
      seconds += dt;
      w.tick++;
      for (const sid of sids) {
        const p = w.state.players.get(sid)!;
        const c = w.ctrl.get(sid)!;
        if (p.dead) continue;
        const m = w.state.monsters.get(id);
        if (!m) break;
        const stack = c.inv[0]?.qty ?? 0;
        if (
          p.hp < p.maxHp * ASSUME_DUNGEON.potionBelow &&
          stack > 0 &&
          w.now >= (c.itemCd.get("hoi_huyet_dan") ?? 0)
        ) {
          useItem(w, sid, 0);
          potionsUsed++;
        }
        slash(w, sid, Math.atan2(m.y - p.y, m.x - p.x));
      }
      tickMonsters(w, dt);
      if (!w.state.monsters.get(id)) break;
      if (sids.every((s) => w.state.players.get(s)!.dead)) break;
    }
    return {
      killed: !w.state.monsters.get(id),
      seconds,
      deaths: sids.filter((sid) => w.state.players.get(sid)!.dead).length,
      potionsUsed,
      enraged: mc.boss.enraged,
      casts: fx.filter((e) => e.kind === "bossCast").length,
    };
  } finally {
    Math.random = saved;
  }
}

export interface BossFightSummary {
  party: number;
  runs: number;
  winRate: number;
  /** Giây mô phỏng trung bình của các trận thắng; null nếu không thắng trận nào */
  simSeconds: number | null;
  /** Phút thật ước tính = giây mô phỏng / `bossUptime` (né làm đánh chậm đi) */
  realMinutes: number | null;
  /** Số người chết trung bình mỗi trận khi KHÔNG né */
  deathsPerRun: number;
  /** Tỉ lệ trận có vào cuồng nộ */
  enrageRate: number;
  /** Số chiêu trùm vận trung bình mỗi trận THẮNG (null nếu không thắng trận nào) */
  castsPerWin: number | null;
}

export function summarizeBossFights(
  def: BossDef,
  party: number,
  runs: number = ASSUME_BOSS.runs,
): BossFightSummary {
  let wins = 0;
  let sec = 0;
  let deaths = 0;
  let enr = 0;
  let casts = 0;
  for (let i = 1; i <= runs; i++) {
    const r = fightBossMoves(def, party, i);
    deaths += r.deaths;
    if (r.enraged) enr++;
    if (r.killed) {
      wins++;
      sec += r.seconds;
      casts += r.casts;
    }
  }
  const simSeconds = wins > 0 ? sec / wins : null;
  return {
    party,
    runs,
    winRate: wins / runs,
    simSeconds,
    realMinutes: simSeconds === null ? null : simSeconds / ASSUME_DUNGEON.bossUptime / 60,
    deathsPerRun: deaths / runs,
    enrageRate: enr / runs,
    castsPerWin: wins > 0 ? casts / wins : null,
  };
}

export interface DodgeSummary {
  /** Số đòn có sát thương đã đáp (mọi giai đoạn x seed) */
  casts: number;
  /** Số đòn trúng bot NÉ hoàn hảo (phải 0) */
  dodgeHits: number;
  /** Số đòn trúng bot ĐỨNG YÊN ở chỗ xấu nhất của vùng (đối chứng: chiêu có ý nghĩa) */
  standHits: number;
  standCasts: number;
}

/** Bot né hoàn hảo vs bot đứng yên (cùng seed) trên MỌI giai đoạn của trùm: tỉ lệ trúng đòn. */
export function dodgeSummary(def: BossDef): DodgeSummary {
  const out: DodgeSummary = { casts: 0, dodgeHits: 0, standHits: 0, standCasts: 0 };
  for (let ph = 0; ph < def.phases.length; ph++) {
    for (let seed = 1; seed <= ASSUME_BOSS.dodgeSeeds; seed++) {
      const d = runDodgeBot(seed, def, "dodge", ASSUME_BOSS.dodgeSimMs, { phase: ph, roam: true });
      out.casts += d.casts;
      out.dodgeHits += d.hurt.length;
      const s = runDodgeBot(seed, def, "stand", ASSUME_BOSS.dodgeSimMs, { phase: ph, roam: true });
      out.standCasts += s.casts;
      out.standHits += s.hitCasts;
    }
  }
  return out;
}

/**
 * Các vi phạm cân bằng trùm (rỗng = sạch): (1) có đòn > `maxHitFraction` khí huyết tối đa; (2) bot NÉ hoàn hảo bị trúng. Độ dài trận (số chiêu vận trong một trận thắng)
 * và thời gian hạ chỉ được BÁO CÁO (mục 1 của `renderBossBalance`), chưa có mục tiêu cứng trong thiết kế nên không phải luật.
 */
export function bossBalanceViolations(defs: readonly BossDef[] = BOSSES): string[] {
  const out: string[] = [];
  for (const def of defs) {
    for (const h of hitFractions(def)) {
      if (h.fraction > ASSUME_BOSS.maxHitFraction)
        out.push(
          `${def.kind}/${h.ability}: một đòn = ${(h.fraction * 100).toFixed(0)}% khí huyết tối đa (> ${pct(ASSUME_BOSS.maxHitFraction)}, giai đoạn ${h.phase})`,
        );
    }
    const d = dodgeSummary(def);
    if (d.dodgeHits > 0)
      out.push(`${def.kind}: bot né hoàn hảo bị trúng ${d.dodgeHits} / ${d.casts} đòn (phải 0)`);
  }
  return out;
}

// ---------- Báo cáo Markdown cho docs/CAN_BANG.md ----------

const f0 = (n: number) => Math.round(n).toLocaleString("vi-VN");
const f1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/** Mục "Trùm nhiều chiêu" của `docs/CAN_BANG.md` (sinh từ `BOSSES` thật). */
export function renderBossBalance(): string {
  const rows: string[] = [];
  const hitRows: string[] = [];
  const dodgeRows: string[] = [];
  for (const def of BOSSES) {
    const boss = MONSTER_BY_ID[def.kind]!;
    const { realm, tier } = bossStep(def);
    const s = statsFor(realm, tier, bestGear(realm, tier));
    const cells = ASSUME_BOSS.parties.map((n) => summarizeBossFights(def, n));
    rows.push(
      `| ${boss.name} | bậc ${stepOf(realm, tier)} (khí huyết ${f0(s.maxHp)}) | ${cells
        .map((c) =>
          c.simSeconds === null
            ? "không hạ nổi"
            : `${f1(c.realMinutes!)} phút, ${f1(c.castsPerWin!)} chiêu (${pct(c.winRate)} thắng, ${f1(c.deathsPerRun)} chết)`,
        )
        .join(" | ")} |`,
    );
    const hits = hitFractions(def);
    const worst = hits.reduce<HitFraction | null>(
      (a, b) => (a === null || b.fraction > a.fraction ? b : a),
      null,
    );
    hitRows.push(
      `| ${boss.name} | ${def.abilities.length} chiêu / ${def.phases.length} giai đoạn | ${hits.length} | ${worst ? `${worst.ability} ${pct(worst.fraction)} (${f0(worst.dmg)})` : "-"} | ${def.enrage ? `${f1(def.enrage.afterMs / 60000)} phút (công x${def.enrage.atkMult})` : "không có"} | ${cells.map((c) => pct(c.enrageRate)).join(" / ")} |`,
    );
    const d = dodgeSummary(def);
    dodgeRows.push(
      `| ${boss.name} | ${d.casts} | ${d.dodgeHits} | ${d.standCasts} | ${d.standHits} (${d.standCasts > 0 ? pct(d.standHits / d.standCasts) : "-"}) |`,
    );
  }
  const violations = bossBalanceViolations();
  const head = ASSUME_BOSS.parties.map((n) => (n === 1 ? "1 người" : `${n} người`)).join(" | ");
  return `## Trùm nhiều chiêu trên DỮ LIỆU THẬT (mục 42, T5 #874)

> Phần này sinh từ \`server/src/balance/trum.ts\`: chạy bộ thực thi thật (\`systems/boss.ts\` qua \`tickMonsters\`) trên \`BOSSES\` thật nên thêm / sửa trùm là báo cáo đổi theo (chạy lại \`npm run can-bang -w server\`).
> Mỗi trùm ở bậc "đúng bậc" (\`stepOf\` = \`level\` của loài), người chơi mặc đồ tốt nhất, ${ASSUME_BOSS.runs} trận (hạt giống 1..${ASSUME_BOSS.runs}) mỗi cỡ đội. Số liệu là ĐỀ XUẤT; đây chỉ ĐO. Bất biến giữ bằng \`bossBalanceViolations\` (test \`trum.test.ts\`).

### 1. Thời gian hạ trùm (đứng yên đánh thường, KHÔNG né: ca khó)

Thời gian thật = giây mô phỏng / ${ASSUME_DUNGEON.bossUptime} (né làm đánh chậm đi; \`ASSUME_DUNGEON.bossUptime\`). Mỗi người mang ${ASSUME_DUNGEON.potions} Hồi Huyết Đan, uống khi khí huyết < ${ASSUME_DUNGEON.potionBelow * 100}%. "chiêu" là số chiêu trùm vận trung bình mỗi trận thắng (trận quá ngắn thì bộ chiêu chưa kịp có ý nghĩa); "chết" là số người chết trung bình mỗi trận khi không né.

| Trùm | Bậc người chơi | ${head} |
|---|---|${ASSUME_BOSS.parties.map(() => "---").join("|")}|
${rows.join("\n")}

### 2. Sát thương mỗi đòn và cuồng nộ

Mỗi đòn / khí huyết tối đa của người đúng bậc, hệ số công lớn nhất trong mọi giai đoạn (và cuồng nộ). Thiết kế: <= ${pct(ASSUME_BOSS.maxHitFraction)}.

| Trùm | Bộ chiêu | chiêu có sát thương | đòn nặng nhất (sát thương) | cuồng nộ | trận có tới cuồng nộ (${ASSUME_BOSS.parties.join(" / ")} người) |
|---|---|--:|---|---|---|
${hitRows.join("\n")}

### 3. Tỉ lệ trúng: bot né hoàn hảo vs bot đứng yên

Bot né: phản xạ 400 ms rồi chạy 150 px/giây (\`boss-dodge-bot.ts\`, lời hứa công bằng); bot đứng yên ở chỗ XẤU NHẤT của vùng (đối chứng: chiêu phải có ý nghĩa). ${ASSUME_BOSS.dodgeSeeds} hạt giống x ${ASSUME_BOSS.dodgeSimMs / 1000} giây x mọi giai đoạn.

| Trùm | đòn đã đáp (bot né) | trúng bot NÉ (phải 0) | đòn đã đáp (bot đứng yên) | trúng bot ĐỨNG YÊN |
|---|--:|--:|--:|--:|
${dodgeRows.join("\n")}

${violations.length === 0 ? "**Không vi phạm bất biến nào** (mọi đòn <= ngưỡng, bot né hoàn hảo không bị trúng, bot đứng yên bị trúng)." : `**VI PHẠM (${violations.length}):**\n\n${violations.map((v) => `- ${v}`).join("\n")}`}
`;
}
