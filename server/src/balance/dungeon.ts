// Cân bằng Bí cảnh (M3 bước 4c-2, docs/THIET_KE_BI_CANH.md mục 6, issue #203).
// Hai phần:
//  1. `fightBoss`: trận đánh trùm mô phỏng bằng CHÍNH mã server (`hitMonster`, AI quái, `useItem`): người đứng cạnh trùm đánh
//     thường liên tục, uống Hồi Huyết Đan khi khí huyết dưới ngưỡng. Không né, không di chuyển: đây là ca KHÓ (trùm trúng
//     đòn 100%, người đánh 100% thời gian); người chơi thật né được một phần nhưng cũng mất thời gian đánh, hai việc triệt tiêu
//     nhau (xem `ASSUME_DUNGEON.bossUptime`), nên kết quả sống / chết dùng được, còn thời gian thật = thời gian mô phỏng / uptime.
//  2. Giá trị một lượt thưởng so với săn quái cùng bậc (`dungeonValue`), quy ra "phút săn tương đương".
// Dùng `Math.random` có hạt giống (ghi đè trong lúc chạy) để kết quả cố định, như bench.
import {
  DUNGEONS,
  LINH_HU_MAP_ID,
  MONSTER_BY_ID,
  REALMS,
  SKILLS,
  TICK_MS,
  buyPrice,
  getMap,
  killExp,
  partyExpShare,
  sellPrice,
  stepOf,
  statsFor,
  type DungeonDef,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { slash } from "../systems/combat";
import { setEquipment } from "../systems/equipment";
import { useItem } from "../systems/inventory";
import { tickMonsters } from "../systems/monsters";
import { applyStats } from "../systems/progression";
import { addMonster, addPlayer, makeWorld } from "../systems/test-helpers";
import {
  ASSUME,
  bestGear,
  bestOption,
  expectedCoinDrop,
  expectedLootValue,
  monsterEconomy,
} from "./simulate";

/** Giả định riêng của bí cảnh (đổi ở đây nếu thấy không giống người chơi thật). */
export const ASSUME_DUNGEON = {
  /** Hồi Huyết Đan mỗi người mang vào (mua ở Lão dược sư: tính vào chi phí một lượt) */
  potions: 8,
  /** Uống đan khi khí huyết dưới tỉ lệ này */
  potionBelow: 0.5,
  /**
   * Tỉ lệ thời gian người chơi thật sự đánh trúng trùm (né, lùi, đổi chỗ). Trận mô phỏng đứng yên đánh 100%; né làm giảm cả
   * sát thương nhận lẫn sát thương gây ra theo cùng tỉ lệ nên xác suất sống không đổi, chỉ thời gian thật dài ra 1 / uptime.
   */
  bossUptime: 0.6,
  /** Như trên cho quái nhỏ (đánh nhanh, ít né) */
  trashUptime: 0.8,
  /** Thời gian tìm và tới con quái nhỏ kế tiếp (giây): quái dày đặc hơn ngoài hoang */
  searchSecPerMob: 3,
  /** Đi từ cổng vào tới hang (giây), ~47 ô ở tốc độ ~170 px/s cộng đường vòng và dừng lại gom đội */
  walkSec: 30,
  /** Một lượt thưởng nên đáng bao nhiêu phút săn quái tốt nhất cùng bậc (mục tiêu 15-20 phút) */
  equivMinutes: 17.5,
} as const;

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32), thay `Math.random` trong lúc mô phỏng. */
function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FightResult {
  killed: boolean;
  /** Giây mô phỏng tới khi trùm chết (hoặc tới khi cả đội ngã / hết 30 phút) */
  seconds: number;
  /** Số người chết (trong game thật: mất kiếp, theo luật chung) */
  deaths: number;
  potionsUsed: number;
}

export interface FightOptions {
  /** Bậc tu của cả đội (mặc định: ngưỡng `minStep` của bí cảnh, trang bị tốt nhất đủ bậc) */
  realm: number;
  tier: number;
  potions?: number;
  /** Ghi đè số liệu trùm (để quét tìm số liệu); bỏ trống thì dùng số liệu thật trong shared/ */
  bossHp?: number;
  bossAtk?: number;
  seed?: number;
}

/** (realm, tier) có `stepOf` = `step`: bậc tu ở ngưỡng vào bí cảnh (`DungeonDef.minStep`). */
export function realmTierOfStep(step: number): { realm: number; tier: number } {
  for (let realm = 0; realm < REALMS.length; realm++)
    for (let tier = 0; tier < REALMS[realm].tiers.length; tier++)
      if (stepOf(realm, tier) === step) return { realm, tier };
  throw new Error(`Không có bậc tu nào có step = ${step}`);
}

/** Trận đánh trùm của đội `party` người cùng bậc, mô phỏng bằng mã server thật. */
export function fightBoss(def: DungeonDef, party: number, o: FightOptions): FightResult {
  const boss = MONSTER_BY_ID[def.boss];
  const map = getMap(def.mapId)!;
  const lair = map.lairPx!;
  const saved = { hp: boss.hp, atk: boss.atk, random: Math.random };
  boss.hp = o.bossHp ?? boss.hp;
  boss.atk = o.bossAtk ?? boss.atk;
  Math.random = seeded(o.seed ?? 1);
  try {
    const { w } = makeWorld(map, new Hub());
    const mon = addMonster(w, def.boss, lair.x, lair.y);
    const sids: string[] = [];
    for (let i = 0; i < party; i++) {
      const sid = `P${i}`;
      sids.push(sid);
      const { p, c } = addPlayer(w, sid, o.realm, o.tier);
      setEquipment(p, bestGear(o.realm, o.tier));
      applyStats(p, true);
      c.inv[0] = { itemId: "hoi_huyet_dan", qty: o.potions ?? ASSUME_DUNGEON.potions };
      const a = (i / party) * Math.PI * 2;
      p.x = lair.x + Math.cos(a) * 45;
      p.y = lair.y + Math.sin(a) * 45;
    }
    const dt = TICK_MS / 1000;
    let seconds = 0;
    let potionsUsed = 0;
    w.now = 1_000_000;
    while (seconds < 1800) {
      w.now += TICK_MS;
      seconds += dt;
      w.tick++;
      for (const sid of sids) {
        const p = w.state.players.get(sid)!;
        const c = w.ctrl.get(sid)!;
        if (p.dead) continue;
        const m = w.state.monsters.get(mon.id);
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
      if (!w.state.monsters.get(mon.id)) break;
      if (sids.every((s) => w.state.players.get(s)!.dead)) break;
    }
    return {
      killed: !w.state.monsters.get(mon.id),
      seconds,
      deaths: sids.filter((sid) => w.state.players.get(sid)!.dead).length,
      potionsUsed,
    };
  } finally {
    boss.hp = saved.hp;
    boss.atk = saved.atk;
    Math.random = saved.random;
  }
}

export interface FightSummary {
  party: number;
  runs: number;
  /** Tỉ lệ trận hạ được trùm (0..1) */
  winRate: number;
  /** Giây mô phỏng trung bình của các trận thắng; `null` nếu không thắng trận nào */
  simSeconds: number | null;
  /** Phút thật ước tính = giây mô phỏng / `bossUptime` */
  realMinutes: number | null;
  /** Số người chết trung bình mỗi trận (mô phỏng ca khó: không né) */
  deathsPerRun: number;
}

/** Tổng hợp `runs` trận (hạt giống 1..runs) của đội `party` người. */
export function summarizeFights(
  def: DungeonDef,
  party: number,
  o: FightOptions,
  runs = 20,
): FightSummary {
  let wins = 0;
  let sec = 0;
  let deaths = 0;
  for (let i = 1; i <= runs; i++) {
    const r = fightBoss(def, party, { ...o, seed: i });
    deaths += r.deaths;
    if (r.killed) {
      wins++;
      sec += r.seconds;
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
  };
}

/** Quái nhỏ của bí cảnh (`monsterCap` trừ trùm): [id, số con]. */
export function dungeonMobs(def: DungeonDef): [string, number][] {
  const map = getMap(def.mapId)!;
  return Object.entries(map.monsterCap).filter(([id, n]) => id !== def.boss && n > 0);
}

/** Thời gian thật (phút) của một lượt thắng: đi + dọn quái nhỏ + trùm; `bossSimSeconds` từ `summarizeFights`. */
export function runMinutes(
  def: DungeonDef,
  party: number,
  realm: number,
  tier: number,
  bossSimSeconds: number,
): number {
  let hp = 0;
  let n = 0;
  for (const [id, count] of dungeonMobs(def)) {
    hp += MONSTER_BY_ID[id].hp * count;
    n += count;
  }
  const trash =
    hp / (dpsOf(realm, tier) * party * ASSUME_DUNGEON.trashUptime) +
    n * ASSUME_DUNGEON.searchSecPerMob;
  const boss = bossSimSeconds / ASSUME_DUNGEON.bossUptime;
  return (ASSUME_DUNGEON.walkSec + trash + boss) / 60;
}

/** Sát thương đánh thường mỗi giây của một người ở bậc (realm, tier), trang bị tốt nhất đủ bậc (như `huntRate`). */
export function dpsOf(realm: number, tier: number): number {
  const s = statsFor(realm, tier, bestGear(realm, tier));
  return (s.atk * SKILLS.slash.mult * ASSUME.critAvg) / (SKILLS.slash.cooldown / 1000);
}

export interface DungeonValue {
  /** Linh thạch ròng mỗi người một lượt (thưởng + đồ + phần chia từ trùm / quái nhỏ, trừ đan đã uống) */
  coinNet: number;
  /** Tu vi mỗi người một lượt (trùm + quái nhỏ, theo chia đội) */
  exp: number;
  /** Phút săn quái tốt nhất cùng bậc cho cùng lượng Linh thạch / tu vi */
  coinMinutes: number;
  expMinutes: number;
}

/** Giá trị một lượt thắng cho MỖI người của đội `party` người, so với săn quái tốt nhất cùng bậc. */
export function dungeonValue(
  def: DungeonDef,
  party: number,
  realm: number,
  tier: number,
): DungeonValue {
  const mobs = dungeonMobs(def);
  let mobCoin = 0;
  let mobExp = 0;
  for (const [id, n] of mobs) {
    mobCoin += n * (expectedCoinDrop(id) + expectedLootValue(id));
    mobExp += n * killExp(MONSTER_BY_ID[id], realm, tier);
  }
  const bossCoin = expectedCoinDrop(def.boss) + expectedLootValue(def.boss);
  const itemsEv = def.reward.items.reduce((a, i) => a + i.chance * i.qty * sellPrice(i.itemId), 0);
  const potionCost = ASSUME_DUNGEON.potions * buyPrice("hoi_huyet_dan");
  const coinNet = def.reward.coin + itemsEv + (bossCoin + mobCoin) / party - potionCost;
  const exp = (killExp(MONSTER_BY_ID[def.boss], realm, tier) + mobExp) * partyExpShare(party);
  // Săn quái tốt nhất cùng bậc: tu vi/phút của lựa chọn tối ưu, Linh thạch/phút của loại quái cho nhiều nhất
  const huntExpPerMin = bestOption(realm, tier).rate * 60;
  let huntCoinPerMin = 0;
  for (const id of ["lang", "ho", "mang"]) {
    const e = monsterEconomy(MONSTER_BY_ID[id], realm, tier);
    if (e) huntCoinPerMin = Math.max(huntCoinPerMin, e.totalCoinPerHour / 60);
  }
  return {
    coinNet,
    exp,
    coinMinutes: coinNet / huntCoinPerMin,
    expMinutes: exp / huntExpPerMin,
  };
}

export const LINH_HU = DUNGEONS.find((d) => d.mapId === LINH_HU_MAP_ID)!;
