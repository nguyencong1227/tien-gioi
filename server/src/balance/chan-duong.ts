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
// Dùng `Math.random` có hạt giống như `dungeon.ts` nên kết quả cố định. Số liệu bầy là của E / G (CD5). Giá và thưởng TU VI tính bằng PHÚT SĂN của bậc (`AMBUSH_EXP_PRICE_MIN`, `AMBUSH_REWARD_MIN`, bảng `AMBUSH_HUNT_EXP_PER_MIN` sinh từ `bestOption`: CD6b); thưởng Linh thạch vẫn TẠM (`ARENA_REWARD_MULT`): ở đây ĐO và báo vi phạm.
import {
  AMBUSH_COOLDOWN_MS,
  AMBUSH_DAY_CAP,
  AMBUSH_EXP_PRICE_MIN,
  AMBUSH_HUNT_EXP_PER_MIN,
  AMBUSH_REWARD_MIN,
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
  emptyEquipment,
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
  /**
   * Độ nhạy theo giả định (A đồng ý 22/11, phát hiện của B ở #1244: kết quả đổi rất mạnh theo số đan và đồ). Bảng 1-3 đo ở giả định CHUẨN (`ASSUME_DUNGEON.potions` đan + đồ tốt nhất đủ bậc);
   * mục 4 đo lại CÙNG các bầy với từng tổ hợp (số đan x có đồ hay không).
   */
  sensitivity: {
    /** Số trận mỗi bầy mỗi kịch bản (hạt giống 1..N): nhiều hơn `runs` ở trên vì mục này dựa vào tỉ lệ chết nhỏ (vài phần trăm). */
    runs: 48,
    /** Số Hồi Huyết Đan mang theo của các hàng (mỗi số đi với cả hai kiểu đồ). */
    potions: [8, 2, 0],
    /** Số lần bị chặn tối đa mỗi ngày (`AMBUSH_DAY_CAP`) để tính xác suất chết ít nhất một lần trong ngày (các lần độc lập). */
    dayCap: AMBUSH_DAY_CAP,
    /** Giả định THẬN TRỌNG (đề xuất của A làm giả định chuẩn): ít đan, đồ đúng bậc. Bầy chết "tới cùng" nhiều hơn `deathAbove` ở đây bị CẢNH BÁO (chưa chặn). */
    cautious: { potions: 2, gear: "best", deathAbove: 0.05 },
  },
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
  /** `best` (mặc định): đồ tốt nhất đủ bậc (`bestGear`); `none`: không mặc gì (người chơi chưa kịp lên đồ). */
  gear?: "best" | "none";
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
    const gear = o.gear === "none" ? emptyEquipment() : bestGear(realm, tier);
    setEquipment(p, gear);
    applyStats(p, true);
    c.inv[0] = { itemId: "hoi_huyet_dan", qty: o.potions ?? ASSUME_DUNGEON.potions };
    const lair = w.map.lairPx ?? { x: w.map.townPx.x, y: w.map.townPx.y - 400, r: 80 };
    p.x = lair.x;
    p.y = lair.y + ASSUME_AMBUSH.startOffsetPx;
    arenaJoined(w, sid);

    const speed = statsFor(realm, tier, gear).speed; // px / giây: người chơi TIẾN SÁT con gần nhất khi ngoài tầm chém (quái tầm xa lùi khi bị áp sát nên không thể đứng yên chờ)
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

/** Một kịch bản của bảng độ nhạy: số Hồi Huyết Đan mang theo và có mặc đồ tốt nhất đủ bậc hay không. */
export interface AmbushScenario {
  potions: number;
  gear: "best" | "none";
}

/** Chạy `runs` trận của MỘT bầy ở bậc `minStep` và tổng hợp (`scenario` vắng: giả định chuẩn của `fightAmbush`). */
export function summarizeGroup(
  g: AmbushFoeGroup,
  runs: number = ASSUME_AMBUSH.runs,
  scenario?: AmbushScenario,
): GroupSummary {
  const step = g.minStep;
  const { realm, tier } = realmTierOfStep(step);
  const toEnd = emptyRates();
  const flee = emptyRates();
  let sec = 0;
  let winExp = 0;
  let winCoin = 0;
  let wins = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const f = fightAmbush(g, { step, seed, potions: scenario?.potions, gear: scenario?.gear });
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

/** Tu vi / phút của người săn quái tốt nhất ở từng bậc 0..`steps - 1` (làm tròn), SINH từ `bestOption`: bản gốc của `AMBUSH_HUNT_EXP_PER_MIN` ở `shared/` (`chan-duong.test.ts` buộc hai bên khớp). */
export function huntExpPerMinTable(steps: number = AMBUSH_HUNT_EXP_PER_MIN.length): number[] {
  const out: number[] = [];
  for (let step = 0; step < steps; step++) {
    const { realm, tier } = realmTierOfStep(step);
    out.push(Math.round(bestOption(realm, tier).rate * 60));
  }
  return out;
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

export interface RealmUplift {
  realm: number;
  /** Tăng tu vi / phút trộn theo `AMBUSH_TIER_WEIGHTS` trên các bầy của cảnh giới này; `null` nếu cảnh giới không có bầy nào. */
  blended: number | null;
  /** Từng mức (trung bình các bầy); mức không có bầy thì thiếu. */
  byTier: Partial<Record<AmbushTier, number>>;
}

/** Tăng tu vi / phút theo CẢNH GIỚI của `minStep` (đổi hệ số thưởng chung không chỉnh đều được vì tu vi / phút săn lệch nhau tới 18 lần giữa các bậc: phải nhìn từng cảnh giới). */
export function upliftByRealm(sums: readonly GroupSummary[]): RealmUplift[] {
  const out: RealmUplift[] = [];
  for (let realm = 0; realm < REALMS.length; realm++) {
    const of = sums.filter((s) => realmTierOfStep(s.step).realm === realm);
    if (of.length === 0) continue;
    const byTier: Partial<Record<AmbushTier, number>> = {};
    for (const tier of AMBUSH_TIERS) {
      const t = of.filter((s) => s.group.tier === tier);
      if (t.length > 0) byTier[tier] = t.reduce((a, s) => a + upliftOf(s).uplift, 0) / t.length;
    }
    out.push({ realm, blended: blendedUplift(of), byTier });
  }
  return out;
}

// ---------- Độ nhạy theo giả định (số đan, đồ) ----------

/**
 * Tỉ lệ kết cục `outcome` MỖI lần bị chặn theo cách chơi `policy`, trộn theo `AMBUSH_TIER_WEIGHTS` (trung bình các bầy trong từng mức; mức không có bầy thì bỏ khỏi phép trộn).
 * `null` nếu không có bầy nào.
 */
export function blendedRate(
  sums: readonly GroupSummary[],
  policy: "toEnd" | "flee",
  outcome: AmbushOutcome,
): number | null {
  let w = 0;
  let acc = 0;
  for (const tier of AMBUSH_TIERS) {
    const of = sums.filter((s) => s.group.tier === tier);
    if (of.length === 0) continue;
    w += AMBUSH_TIER_WEIGHTS[tier];
    acc += (AMBUSH_TIER_WEIGHTS[tier] * of.reduce((a, s) => a + s[policy][outcome], 0)) / of.length;
  }
  return w > 0 ? acc / w : null;
}

/** Xác suất xảy ra ÍT NHẤT MỘT lần trong `n` lần độc lập, mỗi lần xác suất `p`: 1 - (1 - p)^n. `p` ngoài [0, 1] hoặc không hữu hạn kẹp về đầu gần nhất; `n` < 0 coi là 0. Thuần. */
export function atLeastOnce(p: number, n: number): number {
  const q = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
  return 1 - Math.pow(1 - q, Math.max(0, Math.floor(n)));
}

/** Các kịch bản của bảng độ nhạy: đồ tốt nhất rồi KHÔNG đồ, mỗi kiểu đi với từng số đan của `ASSUME_AMBUSH.sensitivity.potions`. */
export function sensitivityScenarios(): AmbushScenario[] {
  const out: AmbushScenario[] = [];
  for (const gear of ["best", "none"] as const)
    for (const potions of ASSUME_AMBUSH.sensitivity.potions) out.push({ potions, gear });
  return out;
}

export interface SensitivityRow {
  scenario: AmbushScenario;
  runs: number;
  groups: number;
  /** Chết MỖI lần bị chặn (trộn theo mức): "đánh tới cùng" và "biết bỏ chạy". */
  deadToEnd: number;
  deadFlee: number;
  /** Bỏ chạy MỖI lần bị chặn khi "biết bỏ chạy" (trộn theo mức): cái giá của việc sống sót (trả tu vi / Linh thạch). */
  fledFlee: number;
  /** Xác suất chết ít nhất một lần trong `sensitivity.dayCap` lần chặn của một ngày (các lần độc lập): cùng hai cách chơi. */
  deadDayToEnd: number;
  deadDayFlee: number;
  /** Số bầy có tỉ lệ thắng "tới cùng" DƯỚI mục tiêu của mức (`targets.winRate`). */
  belowTarget: number;
  /** Bầy chết nhiều nhất ("tới cùng"). */
  worst: GroupSummary;
  /** Tổng hợp từng bầy của kịch bản này (để cảnh báo nêu đúng tên bầy). */
  sums: GroupSummary[];
}

/** Đo MỘT kịch bản trên `foes` (`null` nếu bảng rỗng). Mỗi bầy ở bậc `minStep` (ca khó nhất), hạt giống 1..`runs`: kết quả cố định. */
export function sensitivityRow(
  foes: readonly AmbushFoeGroup[],
  scenario: AmbushScenario,
  runs: number = ASSUME_AMBUSH.sensitivity.runs,
): SensitivityRow | null {
  if (foes.length === 0) return null;
  const sums = foes.map((g) => summarizeGroup(g, runs, scenario));
  const deadToEnd = blendedRate(sums, "toEnd", "lost") ?? 0;
  const deadFlee = blendedRate(sums, "flee", "lost") ?? 0;
  const { dayCap } = ASSUME_AMBUSH.sensitivity;
  return {
    scenario,
    runs,
    groups: sums.length,
    deadToEnd,
    deadFlee,
    fledFlee: blendedRate(sums, "flee", "fled") ?? 0,
    deadDayToEnd: atLeastOnce(deadToEnd, dayCap),
    deadDayFlee: atLeastOnce(deadFlee, dayCap),
    belowTarget: sums.filter(
      (s) => s.toEnd.won + 1e-9 < ASSUME_AMBUSH.targets.winRate[s.group.tier],
    ).length,
    worst: sums.reduce((a, b) => (b.toEnd.lost > a.toEnd.lost ? b : a)),
    sums,
  };
}

/** Cả bảng độ nhạy (mọi kịch bản của `sensitivityScenarios`, thứ tự cố định); bảng rỗng thì rỗng. */
export function sensitivityRows(
  foes: readonly AmbushFoeGroup[] = AMBUSH_FOES,
  runs: number = ASSUME_AMBUSH.sensitivity.runs,
): SensitivityRow[] {
  const out: SensitivityRow[] = [];
  for (const sc of sensitivityScenarios()) {
    const r = sensitivityRow(foes, sc, runs);
    if (r) out.push(r);
  }
  return out;
}

/** Hàng của giả định THẬN TRỌNG (`sensitivity.cautious`) trong `rows`, hoặc `undefined`. */
export function cautiousRow(rows: readonly SensitivityRow[]): SensitivityRow | undefined {
  const { potions, gear } = ASSUME_AMBUSH.sensitivity.cautious;
  return rows.find((r) => r.scenario.potions === potions && r.scenario.gear === gear);
}

/**
 * Cảnh báo (không chặn) từ bảng độ nhạy: mỗi bầy chết "tới cùng" NHIỀU HƠN `cautious.deathAbove` ở giả định thận trọng (ít đan, đồ đúng bậc). Bầy ở đúng ngưỡng không bị cảnh báo
 * ("vượt"). Chưa là vi phạm vì bảng chuẩn (nhiều đan) vẫn đạt: khi E / G chỉnh xong các bầy này thì đặt giả định thận trọng làm chuẩn và chuyển thành vi phạm.
 */
export function ambushSensitivityWarnings(rows: readonly SensitivityRow[]): string[] {
  const row = cautiousRow(rows);
  if (!row) return [];
  const { potions, deathAbove } = ASSUME_AMBUSH.sensitivity.cautious;
  return row.sums
    .filter((s) => s.toEnd.lost > deathAbove + 1e-9)
    .map(
      (s) =>
        `bầy ${s.group.id} (${s.group.mapId}, bậc ${s.step}, ${s.group.tier}): chết ${pct(s.toEnd.lost)} "tới cùng" / ${pct(s.flee.lost)} "biết bỏ chạy" ở giả định thận trọng (${potions} đan + đồ đúng bậc, ${row.runs} trận), vượt ${pct(deathAbove)}`,
    );
}

// ---------- Bất biến ----------

/**
 * Chỗ vi phạm mục tiêu thiết kế (rỗng = đạt). Chặn phát hành AMBUSH (mục 59): tỉ lệ thắng "tới cùng" của từng bầy >= `targets.winRate[mức]` (thua = chết thật). Thời gian trận, giá bỏ chạy
 * so với thưởng và tu vi / phút chỉ ĐO (báo ở tài liệu, `⚠️`), không chặn: do D / A chốt hằng số ở CD6b. (Bản đầu coi "thưởng tu vi > giá bỏ chạy" là bất biến; sai: thắng +R luôn hơn
 * bỏ chạy -P dù R < P, nên đó là cảnh báo về độ đắt của giá bỏ chạy, không phải lỗi dữ liệu bầy.)
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
  }
  return bad;
}

/**
 * Cảnh báo (không chặn): (1) thời gian trận ngoài khung; (2) giá bỏ chạy bằng tu vi (`AMBUSH_EXP_PRICE_MIN` phút săn) KHÔNG nhỏ hơn thưởng tu vi của trận thắng (bỏ chạy đắt hơn cả thưởng,
 * người chơi bị dồn vào "Chiến" dù đang yếu); (3) tăng tu vi / phút TRỘN của một cảnh giới ngoài `targets.uplift` (đo bằng ít trận nên sát biên thì nhiễu: xem lại bằng nhiều trận hơn).
 */
export function ambushBalanceWarnings(sums: readonly GroupSummary[]): string[] {
  const { min, max } = ASSUME_AMBUSH.targets.seconds;
  const out: string[] = [];
  for (const s of sums) {
    if (s.realSeconds < min || s.realSeconds > max)
      out.push(
        `bầy ${s.group.id}: trận ${s.realSeconds.toFixed(0)} giây (khung ${min}-${max} giây)`,
      );
    if (s.winExp > 0 && s.winExp <= s.fleeExp)
      out.push(
        `bầy ${s.group.id}: thưởng tu vi ${f0(s.winExp)} không hơn giá bỏ chạy ${f0(s.fleeExp)} (bỏ chạy đắt hơn cả thưởng thắng)`,
      );
  }
  const { min: lo, max: hi } = ASSUME_AMBUSH.targets.uplift;
  for (const r of upliftByRealm(sums)) {
    if (r.blended !== null && (r.blended < lo - 1e-9 || r.blended > hi + 1e-9))
      out.push(
        `cảnh giới ${REALMS[r.realm].name}: tu vi / phút tăng ${(r.blended * 100).toFixed(0)}% ngoài mục tiêu ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%`,
      );
  }
  return out;
}

// ---------- Báo cáo Markdown cho docs/CAN_BANG.md ----------

const f0 = (n: number) => Math.round(n).toLocaleString("vi-VN");
const f1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const pct = (n: number) => `${Math.round(n * 100)}%`;
const pct1 = (n: number) => `${f1(n * 100)}%`;
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
  const upliftTable = upliftByRealm(sums)
    .map((r) => {
      const c = (t: AmbushTier) => (r.byTier[t] === undefined ? "-" : pct(r.byTier[t]));
      return `| ${REALMS[r.realm].name} | ${c("normal")} | ${c("elite")} | ${c("leader")} | **${r.blended === null ? "-" : pct(r.blended)}** |`;
    })
    .join("\n");
  const priceText = `${AMBUSH_EXP_PRICE_MIN.offer} phút (hộp thoại) / ${AMBUSH_EXP_PRICE_MIN.mid} phút (giữa trận)`;
  const rewardText = AMBUSH_TIERS.map((t) => `${TIER_VI[t]} ${AMBUSH_REWARD_MIN[t]} phút`).join(
    " / ",
  );
  const sens = sensitivityRows(foes);
  const sensTable = sens
    .map((r) => {
      const std =
        r.scenario.potions === ASSUME_DUNGEON.potions && r.scenario.gear === "best"
          ? " (chuẩn)"
          : r === cautiousRow(sens)
            ? " (thận trọng)"
            : "";
      return `| ${r.scenario.gear === "best" ? "đồ tốt nhất đủ bậc" : "KHÔNG đồ"} | ${r.scenario.potions}${std} | ${pct1(r.deadToEnd)} | ${pct1(r.deadFlee)} | ${pct1(r.fledFlee)} | ${pct(r.deadDayToEnd)} / ${pct(r.deadDayFlee)} | ${r.belowTarget} / ${r.groups} | ${r.worst.group.id} (chết ${pct(r.worst.toEnd.lost)}) |`;
    })
    .join("\n");
  const cautious = cautiousRow(sens);
  const cautiousText = !cautious
    ? ""
    : cautious.belowTarget === 0
      ? `Ở giả định thận trọng (${cautious.scenario.potions} đan + đồ đúng bậc) không bầy nào dưới mục tiêu thắng: có thể đặt nó làm giả định CHUẨN (\`ASSUME_AMBUSH\`).`
      : `Ở giả định thận trọng (${cautious.scenario.potions} đan + đồ đúng bậc) còn **${cautious.belowTarget} / ${cautious.groups} bầy dưới mục tiêu thắng**: CHƯA đặt nó làm giả định chuẩn được cho tới khi E / G chỉnh các bầy đó (tên ở cảnh báo bên dưới).`;
  const violations = ambushBalanceViolations(sums);
  const warnings = [...ambushBalanceWarnings(sums), ...ambushSensitivityWarnings(sens)];
  return `${head}
### 1. Tỉ lệ chết theo cảnh giới và mức (trung bình các bầy)

| Cảnh giới | Mức | Số bầy | Thắng (tới cùng) | **Chết (tới cùng)** | Thắng / thoát / **chết** (biết bỏ chạy) | Trận thật | Bầy tệ nhất |
|---|---|--:|--:|--:|---|--:|---|
${realmTable}

### 2. Từng bầy (ở bậc \`minStep\`)

"Thắng / chết / hết giờ" là cách tới cùng; "thắng / thoát / chết" là cách biết bỏ chạy. Thưởng = tu vi (\`ambushRewardExp\`: phút săn của bậc x mức, CD6b) + Linh thạch (\`ARENA_REWARD_MULT\` TẠM) MỖI trận thắng; giá bỏ chạy giữa trận = tu vi + Linh thạch khi tu vi đang ${ASSUME_AMBUSH.expInBarShare * 100}% thanh; "ph" là phút săn quái tương đương của thưởng trừ thời gian đánh.

| Bầy | Bản đồ | Bậc | Mức | Kẻ địch | Thắng / chết / hết giờ | Thắng / thoát / chết | Trận thật | Thưởng thắng | Giá bỏ chạy | Tương đương |
|---|---|--:|---|---|---|---|--:|---|---|--:|
${groupTable}

### 3. Tu vi / phút so với săn quái

Khoảng giữa hai lần bị chặn ước tính ${f1(ambushIntervalMin())} phút (hồi tối thiểu ${AMBUSH_COOLDOWN_MS / 60000} phút + quãng đi bộ tới lần tung trúng kế, ${pct(ASSUME_AMBUSH.walkShare)} thời gian đi bộ). Tu vi / phút tăng thêm so với chỉ săn quái, trộn theo \`AMBUSH_TIER_WEIGHTS\` (${AMBUSH_TIERS.map((t) => `${TIER_VI[t]} ${AMBUSH_TIER_WEIGHTS[t]}`).join(" / ")}): **${blended === null ? "-" : pct(blended)}** (mục tiêu ${pct(ASSUME_AMBUSH.targets.uplift.min)}-${pct(ASSUME_AMBUSH.targets.uplift.max)}, không hơn bí cảnh). Chưa tính đồ rơi và sách chiêu (chưa có: \`AMBUSH_LOOT\`).

Theo từng cảnh giới (thưởng và giá tính bằng phút săn của bậc, nên các hàng gần nhau; lệch nhiều là do bầy / tỉ lệ thắng của cảnh giới đó):

| Cảnh giới | Thường | Tinh anh | Kẻ cầm đầu | **Trộn** |
|---|--:|--:|--:|--:|
${upliftTable}

Giá bỏ chạy bằng tu vi: ${priceText}; thưởng tu vi thắng: ${rewardText} (phút săn của bậc người chơi; bảng tu vi / phút săn \`AMBUSH_HUNT_EXP_PER_MIN\` sinh từ mô phỏng). Giá bị kẹp bởi tu vi đang có trong thanh (không bao giờ rớt cảnh giới).

### 4. Độ nhạy theo giả định (Hồi Huyết Đan, đồ)

Bảng 1-3 đo ở giả định CHUẨN (${ASSUME_DUNGEON.potions} đan + đồ tốt nhất đủ bậc). Người chơi thật thường mang ít đan hơn hoặc chưa lên đồ, nên bảng này đo lại CÙNG ${foes.length} bầy (ở bậc \`minStep\`, mỗi bầy ${ASSUME_AMBUSH.sensitivity.runs} trận, hạt giống 1..${ASSUME_AMBUSH.sensitivity.runs}: ít nhiễu hơn bảng 1-3 vốn ${ASSUME_AMBUSH.runs} trận) với từng tổ hợp số đan x có đồ hay không. "Chết / lần" là tỉ lệ chết MỖI lần bị chặn, trộn theo \`AMBUSH_TIER_WEIGHTS\` (${AMBUSH_TIERS.map((t) => `${TIER_VI[t]} ${AMBUSH_TIER_WEIGHTS[t]}`).join(" / ")}); "chết >= 1 lần / ngày" là xác suất chết ít nhất một lần trong ${ASSUME_AMBUSH.sensitivity.dayCap} lần chặn (mức tối đa mỗi ngày, các lần độc lập: 1 - (1 - p)^${ASSUME_AMBUSH.sensitivity.dayCap}), tới cùng / biết bỏ chạy. Cách "tới cùng" là cận TRÊN của tỉ lệ chết; cách "biết bỏ chạy" của mô hình bấm Bỏ chạy ĐÚNG lúc khí huyết < ${ASSUME_AMBUSH.fleeBelow * 100}% rồi sống qua giây vận nên là cận DƯỚI (người chơi thật nằm giữa: bấm trễ hoặc không bấm); cái giá của cận dưới là cột "Thoát / lần" (mỗi lần thoát trả tu vi hoặc Linh thạch). Thua = chết thật nên con số "chết >= 1 lần / ngày" đáng chú ý hơn tỉ lệ từng lần.

| Đồ | Hồi Huyết Đan | Chết / lần (tới cùng) | Chết / lần (biết bỏ chạy) | Thoát / lần (biết bỏ chạy) | Chết >= 1 lần / ngày (tới cùng / biết bỏ chạy) | Bầy thắng dưới mục tiêu | Bầy chết nhiều nhất (tới cùng) |
|---|--:|--:|--:|--:|---|--:|---|
${sensTable}

${cautiousText}

${violations.length === 0 ? `**Không vi phạm bất biến nào** (mọi bầy thắng >= ${AMBUSH_TIERS.map((t) => `${pct(ASSUME_AMBUSH.targets.winRate[t])} ${TIER_VI[t]}`).join(" / ")}, giá bỏ chạy và thời gian trận xem cảnh báo bên dưới).` : `**VI PHẠM (${violations.length}):**\n\n${violations.map((v) => `- ${v}`).join("\n")}`}
${warnings.length === 0 ? "" : `\nCảnh báo (không chặn):\n\n${warnings.map((v) => `- ${v}`).join("\n")}\n`}`;
}
