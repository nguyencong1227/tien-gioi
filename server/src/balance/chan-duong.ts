// Cân bằng CHẶN ĐƯỜNG (QUYET_DINH_M3 mục 52 / 59, docs/THIET_KE_CHAN_DUONG.md mục 9, CD6 #1066).
// Điều kiện bật `AMBUSH=on` ở bản chạy thật (mục 59): "mô phỏng tỉ lệ CHẾT khi CHỌN CHIẾN theo từng cảnh giới ghi vào CAN_BANG.md". Vì thua = chết thật (mục 53) nên đây là số quan trọng nhất.
//
// Mô hình: chạy ĐẤU TRƯỜNG THẬT (`createArena` + `tickWorld`: AI quái, đòn trùm, thưởng `payRewards` của `arena.ts`) trên `AMBUSH_FOES` THẬT, nên thêm / sửa bầy là báo cáo đổi theo
// (như `trum.ts`). Người chơi "bình thường": đúng bậc `minStep` của bầy (ca KHÓ NHẤT bầy có thể gặp), mặc đồ tốt nhất đủ bậc (`bestGear`), mang `ASSUME_DUNGEON.potions` Hồi Huyết Đan,
// đánh thường liên tục vào con gần nhất, tiến sát nó khi ngoài tầm chém (không né, không dùng chiêu: như `dungeon.ts`; người chơi thật né được một phần và dùng chiêu, hai việc triệt tiêu nhau nên kết quả sống / chết
// dùng được, còn thời gian thật = giây mô phỏng / uptime). Hai cách chơi đo CÙNG MỘT trận (cùng hạt giống):
//  - "đánh tới cùng": không bao giờ bỏ chạy (cận trên tỉ lệ chết);
//  - "biết bỏ chạy": khi khí huyết < `fleeBelow` thì bấm Bỏ chạy, phải VẬN `AMBUSH_FLEE_CHANNEL_MS` (không bất khả xâm phạm, vẫn đánh / uống đan); sống qua giây vận thì thoát (trả giá), thắng
//    trước đó thì thắng, gục trong lúc vận thì chết. Suy ra từ vết khí huyết của trận "tới cùng" (hai cách giống hệt nhau tới hết giây vận) nên không tốn thêm trận.
// Dùng `Math.random` có hạt giống như `dungeon.ts` nên kết quả cố định. Số liệu bầy là của E / G (CD5), số thưởng / giá là TẠM (`ARENA_REWARD_MULT`, `AMBUSH_*`): ở đây chỉ ĐO và báo vi phạm.
import {
  AMBUSH_COOLDOWN_MS,
  AMBUSH_FLEE_CHANNEL_MS,
  AMBUSH_FOES,
  AMBUSH_ROLL_P_MAX,
  AMBUSH_ROLL_P_MIN,
  AMBUSH_STRIDE_PX,
  AMBUSH_TIERS,
  AMBUSH_TIER_WEIGHTS,
  AMBUSH_TIME_MS,
  MONSTER_BY_ID,
  REALMS,
  SKILLS,
  TICK_MS,
  ambushPrice,
  arenaMapIdOf,
  expToNext,
  getMap,
  statsFor,
  stepOf,
  type AmbushFoeGroup,
  type AmbushTier,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import {
  AMBUSH_TICKET_TTL_MS,
  arenaJoined,
  createArena,
  type AmbushTicket,
} from "../systems/arena";
import { slash } from "../systems/combat";
import { setEquipment } from "../systems/equipment";
import { useItem } from "../systems/inventory";
import { applyStats } from "../systems/progression";
import { addPlayer, makeWorld } from "../systems/test-helpers";
import { tickWorld } from "../systems/tick";
import { ASSUME_DUNGEON, realmTierOfStep, seeded } from "./dungeon";
import { bestGear, bestOption } from "./simulate";

/** Giả định riêng của chặn đường (đổi ở đây nếu thấy không giống người chơi thật). */
export const ASSUME_AMBUSH = {
  /** Số trận mô phỏng mỗi bầy (hạt giống 1..N). */
  runs: 8,
  /** "Biết bỏ chạy": bấm Bỏ chạy khi khí huyết dưới tỉ lệ này. */
  fleeBelow: 0.25,
  /** Tỉ lệ thời gian người chơi thật sự đánh trúng (né, lùi, đổi chỗ): quái thường / tinh anh như `trashUptime`, kẻ cầm đầu như `bossUptime` (dùng chung với `dungeon.ts`). */
  uptime: {
    normal: ASSUME_DUNGEON.trashUptime,
    elite: ASSUME_DUNGEON.trashUptime,
    leader: ASSUME_DUNGEON.bossUptime,
  } as Readonly<Record<AmbushTier, number>>,
  /** Khoảng cách (px) từ tâm bầy tới chỗ người chơi đứng lúc bắt đầu: kẻ địch đã ở tầm nhìn, người chơi không mất giây nào đi bộ (ca khó). */
  startOffsetPx: 140,
  /** Tỉ lệ thời gian một người săn quái là ĐI BỘ (quãng đường mới tính cho xúc xắc chặn đường: `trackAmbushWalk`), dùng ước tính khoảng cách giữa hai lần bị chặn. */
  walkShare: 0.5,
  /** Tốc độ đi bộ (px / giây) dùng cho ước tính trên (~ `moveWithCollision` mỗi bước 50 ms). */
  walkPxPerSec: 170,
  /** Người chơi đang có chừng này phần thanh tu vi khi bị chặn (để tính giá bỏ chạy bằng tu vi). */
  expInBarShare: 0.5,
  /** Mục tiêu (thiết kế mục 9). */
  targets: {
    /** Tỉ lệ thắng tối thiểu theo mức (ca khó: không né, không chiêu, chỉ đánh thường). */
    winRate: { normal: 0.9, elite: 0.8, leader: 0.6 } as Readonly<Record<AmbushTier, number>>,
    /** Thời gian trận thật (giây). */
    seconds: { min: 30, max: 70 },
    /** Tu vi / phút (tính cả thời gian giữa hai lần bị chặn) hơn đánh quái thường chừng này. */
    uplift: { min: 0.2, max: 0.4 },
  },
} as const;

const T0 = Date.UTC(2026, 10, 21, 5, 0, 0);

export type AmbushPolicy = "to_end" | "flee";
export type AmbushOutcome = "won" | "lost" | "timeout" | "fled";

export interface AmbushFight {
  /** Kết cục khi "đánh tới cùng". */
  result: "won" | "lost" | "timeout";
  /** Giây mô phỏng tới khi trận kết thúc. */
  seconds: number;
  /** Khi khí huyết lần đầu xuống dưới `fleeBelow` (giây mô phỏng); `null` nếu chưa bao giờ. */
  fleeAt: number | null;
  /** Tu vi / Linh thạch thưởng THẬT của `payRewards` (chỉ khi thắng). */
  exp: number;
  coin: number;
  potionsUsed: number;
}

export interface AmbushFightOptions {
  /** Bậc của người chơi (thang `stepOf`). */
  step: number;
  seed?: number;
  potions?: number;
}

/** Vé giả cho đấu trường thử (không qua `openTicket`: không cần người chơi / hồ sơ). */
function ticketOf(g: AmbushFoeGroup): AmbushTicket {
  return {
    id: "b".repeat(32),
    key: "mo-phong",
    name: "mo-phong",
    origin: { mapId: g.mapId, x: 100, y: 100 },
    group: g,
    tier: g.tier,
    roomId: "mo-phong",
    createdAt: T0,
    expiresAt: T0 + AMBUSH_TICKET_TTL_MS,
    ended: false,
  };
}

/** Một trận của người chơi bậc `o.step` với bầy `g`, chạy bằng mã đấu trường thật. `Math.random` được thay bằng bộ có hạt giống trong lúc chạy. */
export function fightAmbush(g: AmbushFoeGroup, o: AmbushFightOptions): AmbushFight {
  const { realm, tier } = realmTierOfStep(o.step);
  const saved = Math.random;
  const rand = seeded(o.seed ?? 1);
  Math.random = rand;
  try {
    const arenaMap = getMap(arenaMapIdOf(g.mapId));
    if (!arenaMap) throw new Error(`Không có đấu trường cho bản đồ ${g.mapId}`);
    const h = makeWorld(arenaMap, new Hub());
    const w = h.w;
    w.now = T0;
    const ticket = ticketOf(g);
    w.hub.ambushes._add(ticket);
    const a = createArena(w, ticket);
    const sid = "mo-phong";
    const { p, c } = addPlayer(w, sid, realm, tier);
    setEquipment(p, bestGear(realm, tier));
    applyStats(p, true);
    c.inv[0] = { itemId: "hoi_huyet_dan", qty: o.potions ?? ASSUME_DUNGEON.potions };
    const lair = w.map.lairPx ?? { x: w.map.townPx.x, y: w.map.townPx.y - 400, r: 80 };
    p.x = lair.x;
    p.y = lair.y + ASSUME_AMBUSH.startOffsetPx;
    arenaJoined(w, sid);

    const speed = statsFor(realm, tier, bestGear(realm, tier)).speed; // px / giây: người chơi TIẾN SÁT con gần nhất khi ngoài tầm chém (quái tầm xa lùi khi bị áp sát nên không thể đứng yên chờ)
    const uptime = ASSUME_AMBUSH.uptime[g.tier];
    const limitSec = (AMBUSH_TIME_MS / 1000) * uptime; // trận thật dài ra 1 / uptime nên hết giờ sớm hơn theo giây mô phỏng
    const dt = TICK_MS / 1000;
    let seconds = 0;
    let potionsUsed = 0;
    let fleeAt: number | null = null;
    let result: AmbushFight["result"] = "timeout";
    let rewards: { exp: number; coin: number } | undefined;
    while (seconds < limitSec) {
      w.now += TICK_MS;
      seconds += dt;
      if (p.hp < p.maxHp * ASSUME_DUNGEON.potionBelow && (c.inv[0]?.qty ?? 0) > 0) {
        if (w.now >= (c.itemCd.get("hoi_huyet_dan") ?? 0)) {
          useItem(w, sid, 0);
          potionsUsed++;
        }
      }
      let near: { x: number; y: number; kind: string } | null = null;
      let best = Infinity;
      for (const id of a.foes) {
        const m = w.state.monsters.get(id);
        if (!m || m.hp <= 0) continue;
        const d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d < best) {
          best = d;
          near = m;
        }
      }
      if (near) {
        const reach = SKILLS.slash.range + (MONSTER_BY_ID[near.kind]?.radius ?? 0) - 10;
        if (best > reach) {
          // ngoài tầm: đi thẳng tới (không vướng vật cản: lõi đấu trường đã san phẳng), chưa chém tick này
          const step = Math.min(speed * dt, best - reach);
          p.x += ((near.x - p.x) / best) * step;
          p.y += ((near.y - p.y) / best) * step;
        } else slash(w, sid, Math.atan2(near.y - p.y, near.x - p.x));
      }
      tickWorld(w, TICK_MS);
      if (fleeAt === null && p.hp < p.maxHp * ASSUME_AMBUSH.fleeBelow) fleeAt = seconds;
      // `a.end` đặt ĐỒNG BỘ lúc kết thúc, kể cả khi người chơi bị hạ (tin `ambushEnd` chỉ đi sau lần lưu bất đồng bộ nên không dùng `h.ambushEnds` ở đây);
      // test "bầy khó: bị hạ" khoá việc đấu trường báo chết qua `a.end`
      const end = a.end;
      if (end) {
        result = end.result === "won" ? "won" : end.result === "lost" ? "lost" : "timeout";
        if (end.rewards) rewards = end.rewards;
        break;
      }
    }
    return {
      result,
      seconds,
      fleeAt,
      exp: rewards?.exp ?? 0,
      coin: rewards?.coin ?? 0,
      potionsUsed,
    };
  } finally {
    Math.random = saved;
  }
}

/** Kết cục của cách chơi `policy` suy từ một trận "tới cùng" (xem đầu tệp). */
export function outcomeOf(f: AmbushFight, policy: AmbushPolicy): AmbushOutcome {
  if (policy === "to_end" || f.fleeAt === null) return f.result;
  // hết giờ không phải chuyện của bỏ chạy: vận tới đâu thì thoát tới đó nếu còn sống và chưa thắng
  const channelEnds = f.fleeAt + AMBUSH_FLEE_CHANNEL_MS / 1000;
  if (f.seconds <= channelEnds + 1e-9 && f.result !== "timeout") return f.result;
  return "fled";
}

export interface GroupSummary {
  group: AmbushFoeGroup;
  /** Bậc người chơi đo (= `minStep` của bầy: ca khó nhất). */
  step: number;
  runs: number;
  /** Tỉ lệ theo từng kết cục, cách "đánh tới cùng". */
  toEnd: Record<AmbushOutcome, number>;
  /** Như trên, cách "biết bỏ chạy". */
  flee: Record<AmbushOutcome, number>;
  /** Giây THẬT trung bình của các trận (mọi kết cục; = giây mô phỏng / uptime). */
  realSeconds: number;
  /** Thưởng trung bình MỖI trận thắng. */
  winExp: number;
  winCoin: number;
  /** Giá bỏ chạy giữa trận (giá chốt lúc vào trận) khi tu vi đang ở `expInBarShare` thanh. */
  fleeExp: number;
  fleeCoin: number;
}

const emptyRates = (): Record<AmbushOutcome, number> => ({ won: 0, lost: 0, timeout: 0, fled: 0 });

/** Chạy `runs` trận của MỘT bầy ở bậc `minStep` và tổng hợp. */
export function summarizeGroup(g: AmbushFoeGroup, runs: number = ASSUME_AMBUSH.runs): GroupSummary {
  const step = g.minStep;
  const { realm, tier } = realmTierOfStep(step);
  const toEnd = emptyRates();
  const flee = emptyRates();
  let sec = 0;
  let winExp = 0;
  let winCoin = 0;
  let wins = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const f = fightAmbush(g, { step, seed });
    toEnd[outcomeOf(f, "to_end")] += 1 / runs;
    flee[outcomeOf(f, "flee")] += 1 / runs;
    sec += f.seconds / ASSUME_AMBUSH.uptime[g.tier];
    if (f.result === "won") {
      wins++;
      winExp += f.exp;
      winCoin += f.coin;
    }
  }
  const bar = expToNext(realm, tier);
  const price = ambushPrice(
    {
      barSize: bar,
      expInBar: bar * ASSUME_AMBUSH.expInBarShare,
      step: stepOf(realm, tier),
      wallet: Number.MAX_SAFE_INTEGER,
    },
    "mid",
  );
  return {
    group: g,
    step,
    runs,
    toEnd,
    flee,
    realSeconds: sec / runs,
    winExp: wins > 0 ? winExp / wins : 0,
    winCoin: wins > 0 ? winCoin / wins : 0,
    fleeExp: price.exp,
    fleeCoin: price.coin.price,
  };
}

/** Tổng hợp cả bảng `foes` (mặc định `AMBUSH_FOES` thật), thứ tự giữ như trong bảng. */
export function summarizeAll(foes: readonly AmbushFoeGroup[] = AMBUSH_FOES): GroupSummary[] {
  return foes.map((g) => summarizeGroup(g));
}

// ---------- Theo cảnh giới ----------

export interface RealmRow {
  realm: number;
  tier: AmbushTier;
  groups: number;
  /** Trung bình các bầy (mỗi bầy một phiếu). */
  toEnd: Record<AmbushOutcome, number>;
  flee: Record<AmbushOutcome, number>;
  /** Bầy tệ nhất (tỉ lệ chết "tới cùng" cao nhất). */
  worst: GroupSummary;
  realSeconds: number;
}

/** Gộp theo (cảnh giới của `minStep`, mức). Cảnh giới / mức không có bầy thì không có hàng. */
export function realmRows(sums: readonly GroupSummary[]): RealmRow[] {
  const rows: RealmRow[] = [];
  for (let realm = 0; realm < REALMS.length; realm++)
    for (const tier of AMBUSH_TIERS) {
      const of = sums.filter(
        (s) => realmTierOfStep(s.step).realm === realm && s.group.tier === tier,
      );
      if (of.length === 0) continue;
      const avg = (pick: (s: GroupSummary) => number) =>
        of.reduce((acc, s) => acc + pick(s), 0) / of.length;
      const rates = (k: "toEnd" | "flee"): Record<AmbushOutcome, number> => ({
        won: avg((s) => s[k].won),
        lost: avg((s) => s[k].lost),
        timeout: avg((s) => s[k].timeout),
        fled: avg((s) => s[k].fled),
      });
      rows.push({
        realm,
        tier,
        groups: of.length,
        toEnd: rates("toEnd"),
        flee: rates("flee"),
        worst: of.reduce((a, b) => (b.toEnd.lost > a.toEnd.lost ? b : a)),
        realSeconds: avg((s) => s.realSeconds),
      });
    }
  return rows;
}

// ---------- Tu vi / phút so với săn quái ----------

/** Khoảng cách trung bình (phút) giữa hai lần bị chặn: hồi tối thiểu + quãng đi bộ tới lần tung trúng kế (xác suất giữa khoảng `AMBUSH_ROLL_P_*`). */
export function ambushIntervalMin(): number {
  const p = (AMBUSH_ROLL_P_MIN + AMBUSH_ROLL_P_MAX) / 2;
  const walkSec = AMBUSH_STRIDE_PX / ASSUME_AMBUSH.walkPxPerSec / p; // số bước chân kỳ vọng x giây đi mỗi bước
  return AMBUSH_COOLDOWN_MS / 60_000 + walkSec / ASSUME_AMBUSH.walkShare / 60;
}

export interface UpliftRow {
  group: AmbushFoeGroup;
  /** Tu vi kỳ vọng MỖI lần bị chặn khi biết bỏ chạy: thắng +thưởng, bỏ chạy -giá (tu vi); chết không tính tu vi (tính riêng ở tỉ lệ chết). */
  expPerAmbush: number;
  /** Tu vi / giây săn quái tốt nhất cùng bậc (`bestOption`). */
  huntRate: number;
  /** Phút săn quái tương đương của `expPerAmbush` trừ phần thời gian chiến đấu (thay vì săn). */
  equivMinutes: number;
  /** Tăng tu vi / phút so với chỉ săn quái, tính trên cả khoảng giữa hai lần bị chặn (`ambushIntervalMin`). */
  uplift: number;
}

export function upliftOf(s: GroupSummary): UpliftRow {
  const { realm, tier } = realmTierOfStep(s.step);
  const huntRate = bestOption(realm, tier).rate;
  const expPerAmbush = s.flee.won * s.winExp - s.flee.fled * s.fleeExp;
  const fightMin = s.realSeconds / 60;
  const equivMinutes = expPerAmbush / (huntRate * 60) - fightMin;
  return {
    group: s.group,
    expPerAmbush,
    huntRate,
    equivMinutes,
    uplift: equivMinutes / (ambushIntervalMin() + fightMin),
  };
}

/** Tu vi / phút kỳ vọng của MỘT lần chặn đường ở bậc `step` trộn theo `AMBUSH_TIER_WEIGHTS` trên các bầy có mặt (mức không có bầy thì bỏ khỏi phép trộn). */
export function blendedUplift(sums: readonly GroupSummary[]): number | null {
  let w = 0;
  let acc = 0;
  for (const tier of AMBUSH_TIERS) {
    const of = sums.filter((s) => s.group.tier === tier);
    if (of.length === 0) continue;
    const u = of.reduce((a, s) => a + upliftOf(s).uplift, 0) / of.length;
    w += AMBUSH_TIER_WEIGHTS[tier];
    acc += AMBUSH_TIER_WEIGHTS[tier] * u;
  }
  return w > 0 ? acc / w : null;
}

// ---------- Bất biến ----------

/**
 * Chỗ vi phạm mục tiêu thiết kế (rỗng = đạt). Chặn phát hành AMBUSH (mục 59): tỉ lệ thắng "tới cùng" của từng bầy >= `targets.winRate[mức]`; thắng PHẢI hơn bỏ chạy
 * (thưởng tu vi của trận thắng > giá bỏ chạy giữa trận bằng tu vi). Thời gian trận và tu vi / phút chỉ ĐO (báo ở tài liệu, `⚠️`), không chặn: do D / A chốt hằng số.
 */
export function ambushBalanceViolations(sums: readonly GroupSummary[] = summarizeAll()): string[] {
  const bad: string[] = [];
  for (const s of sums) {
    const at = `bầy ${s.group.id} (${s.group.mapId}, bậc ${s.step}, ${s.group.tier})`;
    const need = ASSUME_AMBUSH.targets.winRate[s.group.tier];
    if (s.toEnd.won + 1e-9 < need)
      bad.push(
        `${at}: thắng ${(s.toEnd.won * 100).toFixed(0)}% < ${(need * 100).toFixed(0)}% (chết ${(s.toEnd.lost * 100).toFixed(0)}%)`,
      );
    if (s.winExp > 0 && s.winExp <= s.fleeExp)
      bad.push(`${at}: thưởng tu vi ${s.winExp} không hơn giá bỏ chạy ${s.fleeExp}`);
  }
  return bad;
}

/** Cảnh báo (không chặn): thời gian trận ngoài khung. */
export function ambushBalanceWarnings(sums: readonly GroupSummary[]): string[] {
  const { min, max } = ASSUME_AMBUSH.targets.seconds;
  return sums
    .filter((s) => s.realSeconds < min || s.realSeconds > max)
    .map(
      (s) => `bầy ${s.group.id}: trận ${s.realSeconds.toFixed(0)} giây (khung ${min}-${max} giây)`,
    );
}

// ---------- Báo cáo Markdown cho docs/CAN_BANG.md ----------

const f0 = (n: number) => Math.round(n).toLocaleString("vi-VN");
const f1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const pct = (n: number) => `${Math.round(n * 100)}%`;
const TIER_VI: Readonly<Record<AmbushTier, string>> = {
  normal: "thường",
  elite: "tinh anh",
  leader: "kẻ cầm đầu",
};

/** Mục "Chặn đường" của `docs/CAN_BANG.md` (sinh từ `AMBUSH_FOES` thật; bảng rỗng thì chỉ nói chưa có dữ liệu). */
export function renderAmbushBalance(foes: readonly AmbushFoeGroup[] = AMBUSH_FOES): string {
  const head = `## Chặn đường: tỉ lệ chết khi chọn Chiến (mục 52 / 59, CD6 #1066)

> Phần này sinh từ \`server/src/balance/chan-duong.ts\`: chạy ĐẤU TRƯỜNG THẬT (\`createArena\` + \`tickWorld\`, thưởng \`payRewards\`) trên \`AMBUSH_FOES\` thật, nên thêm / sửa bầy là báo cáo đổi theo (chạy lại \`npm run can-bang -w server\`).
> Người chơi đúng bậc \`minStep\` của bầy (ca khó nhất bầy có thể gặp), mặc đồ tốt nhất đủ bậc, ${ASSUME_DUNGEON.potions} Hồi Huyết Đan (uống khi khí huyết < ${ASSUME_DUNGEON.potionBelow * 100}%), đánh thường vào con gần nhất (tiến sát khi ngoài tầm chém; quái tầm xa lùi khi bị áp sát), KHÔNG né, KHÔNG dùng chiêu (ca khó, như bí cảnh); ${ASSUME_AMBUSH.runs} trận (hạt giống 1..${ASSUME_AMBUSH.runs}) mỗi bầy. Thời gian thật = giây mô phỏng / uptime (thường và tinh anh ${ASSUME_AMBUSH.uptime.normal}, kẻ cầm đầu ${ASSUME_AMBUSH.uptime.leader}); hết giờ trận ${AMBUSH_TIME_MS / 1000} giây thật.
> **Thua = chết thật** (mục 53), nên đây là số quyết định có bật \`AMBUSH=on\` hay không (mục 59). Hai cách chơi đo trên CÙNG một trận: **tới cùng** (không bao giờ bỏ chạy: cận trên tỉ lệ chết) và **biết bỏ chạy** (bấm khi khí huyết < ${ASSUME_AMBUSH.fleeBelow * 100}%, vận ${AMBUSH_FLEE_CHANNEL_MS / 1000} giây không bất khả xâm phạm rồi thoát, trả giá).
`;
  if (foes.length === 0)
    return `${head}
**Chưa có bầy kẻ chặn đường nào** (\`AMBUSH_FOES\` rỗng, CD5b #1065): chưa có gì để đo. Khi E / G nhập bảng, chạy lại \`npm run can-bang -w server\` để mục này có số; \`AMBUSH=on\` chỉ được đề xuất khi bảng dưới đây không còn vi phạm.
`;
  const sums = summarizeAll(foes);
  const rows = realmRows(sums);
  const realmTable = rows
    .map(
      (r) =>
        `| ${REALMS[r.realm].name} | ${TIER_VI[r.tier]} | ${r.groups} | ${pct(r.toEnd.won)} | **${pct(r.toEnd.lost)}** | ${pct(r.flee.won)} / ${pct(r.flee.fled)} / **${pct(r.flee.lost)}** | ${f0(r.realSeconds)} s | ${r.worst.group.id} (chết ${pct(r.worst.toEnd.lost)}) |`,
    )
    .join("\n");
  const groupTable = sums
    .map((s) => {
      const u = upliftOf(s);
      return `| ${s.group.id} | ${s.group.mapId} | ${s.step} | ${TIER_VI[s.group.tier]} | ${s.group.foes.map((f) => `${MONSTER_BY_ID[f.kind]?.name ?? f.kind} x${f.count}`).join(", ")} | ${pct(s.toEnd.won)} / ${pct(s.toEnd.lost)} / ${pct(s.toEnd.timeout)} | ${pct(s.flee.won)} / ${pct(s.flee.fled)} / ${pct(s.flee.lost)} | ${f0(s.realSeconds)} s | ${f0(s.winExp)} + ${f0(s.winCoin)} | ${f0(s.fleeExp)} + ${f0(s.fleeCoin)} | ${f1(u.equivMinutes)} ph |`;
    })
    .join("\n");
  const blended = blendedUplift(sums);
  const violations = ambushBalanceViolations(sums);
  const warnings = ambushBalanceWarnings(sums);
  return `${head}
### 1. Tỉ lệ chết theo cảnh giới và mức (trung bình các bầy)

| Cảnh giới | Mức | Số bầy | Thắng (tới cùng) | **Chết (tới cùng)** | Thắng / thoát / **chết** (biết bỏ chạy) | Trận thật | Bầy tệ nhất |
|---|---|--:|--:|--:|---|--:|---|
${realmTable}

### 2. Từng bầy (ở bậc \`minStep\`)

"Thắng / chết / hết giờ" là cách tới cùng; "thắng / thoát / chết" là cách biết bỏ chạy. Thưởng = tu vi + Linh thạch MỖI trận thắng (\`ARENA_REWARD_MULT\` TẠM); giá bỏ chạy giữa trận = tu vi + Linh thạch khi tu vi đang ${ASSUME_AMBUSH.expInBarShare * 100}% thanh; "ph" là phút săn quái tương đương của thưởng trừ thời gian đánh.

| Bầy | Bản đồ | Bậc | Mức | Kẻ địch | Thắng / chết / hết giờ | Thắng / thoát / chết | Trận thật | Thưởng thắng | Giá bỏ chạy | Tương đương |
|---|---|--:|---|---|---|---|--:|---|---|--:|
${groupTable}

### 3. Tu vi / phút so với săn quái

Khoảng giữa hai lần bị chặn ước tính ${f1(ambushIntervalMin())} phút (hồi tối thiểu ${AMBUSH_COOLDOWN_MS / 60000} phút + quãng đi bộ tới lần tung trúng kế, ${pct(ASSUME_AMBUSH.walkShare)} thời gian đi bộ). Tu vi / phút tăng thêm so với chỉ săn quái, trộn theo \`AMBUSH_TIER_WEIGHTS\` (${AMBUSH_TIERS.map((t) => `${TIER_VI[t]} ${AMBUSH_TIER_WEIGHTS[t]}`).join(" / ")}): **${blended === null ? "-" : pct(blended)}** (mục tiêu ${pct(ASSUME_AMBUSH.targets.uplift.min)}-${pct(ASSUME_AMBUSH.targets.uplift.max)}, không hơn bí cảnh). Chưa tính đồ rơi và sách chiêu (chưa có: \`AMBUSH_LOOT\`).

${violations.length === 0 ? `**Không vi phạm bất biến nào** (mọi bầy thắng >= ${AMBUSH_TIERS.map((t) => `${pct(ASSUME_AMBUSH.targets.winRate[t])} ${TIER_VI[t]}`).join(" / ")}, thắng luôn hơn bỏ chạy).` : `**VI PHẠM (${violations.length}):**\n\n${violations.map((v) => `- ${v}`).join("\n")}`}
${warnings.length === 0 ? "" : `\nCảnh báo (không chặn):\n\n${warnings.map((v) => `- ${v}`).join("\n")}\n`}`;
}
