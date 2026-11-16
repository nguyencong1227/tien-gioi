// Trạng thái riêng của trùm nhiều chiêu (QUYET_DINH_M3 mục 42, docs/THIET_KE_TRUM.md mục 4): kiểu dữ liệu, khởi tạo, bộ ngẫu nhiên có seed, quái con.
// Tách khỏi `boss.ts` (bộ thực thi) để `world.ts`, `combat.ts`, `monster-place.ts` dùng được mà KHÔNG vòng import (`boss.ts` cần `combat.ts` và `monster-place.ts`).
import type { BossAbility, BossDef, SkillEffect } from "@tien-gioi/shared";
import type { MonsterCtrl, World } from "../world";

/** Vùng đáp đòn (đã khoá lúc báo trước): vòng / vành khuyên, nón, hoặc đoạn có bề rộng. */
export type BossZone =
  | { t: "circle"; x: number; y: number; r: number; r0: number }
  | { t: "cone"; x: number; y: number; r: number; angle: number; arc: number }
  | { t: "seg"; x0: number; y0: number; x1: number; y1: number; w: number };

/** Vũng đang tồn tại (`pool`): gây sát thương mỗi `tickMs` tới `until`. Vị trí đã được báo trước bằng đúng vùng này. */
export interface BossPool {
  x: number;
  y: number;
  r: number;
  until: number;
  next: number;
  tickMs: number;
  dmg: number;
  effect?: SkillEffect;
}

/** Một lần vận chiêu: mọi mốc đều tính theo `World.now` (ms). */
export interface BossCast {
  ab: BossAbility;
  startAt: number;
  /** Mốc đáp đòn CUỐI (mưa: vòng cuối). */
  hitAt: number;
  /** Hết thở: sau mốc này mới được chọn chiêu kế. */
  endAt: number;
  /** Điểm khoá lúc bắt đầu: tâm vùng (đòn tại mục tiêu), chỗ trùm đứng, hoặc điểm đáp (`blink`). */
  x: number;
  y: number;
  /** Hướng khoá (nón / đường / lao). */
  angle: number;
  /** Đã đáp đòn (không mưa). */
  done: boolean;
  /** Mưa: tâm từng vòng, số vòng đã báo, số vòng đã đáp. */
  rain?: { xs: number[]; ys: number[]; warned: number; hit: number };
}

export interface BossCtrl {
  def: BossDef;
  /** Chỉ số giai đoạn hiện tại (chỉ tăng, về 0 khi reset). */
  phase: number;
  /** Đã vào trận (có mục tiêu ít nhất một lần kể từ lần reset cuối). */
  engaged: boolean;
  /** Trạng thái bộ ngẫu nhiên có seed riêng của con trùm (KHÔNG `Math.random`: giữ chuỗi của bench, test lặp lại được). */
  rng: number;
  cast?: BossCast;
  /** Sớm nhất được chọn chiêu kế (ms của `World.now`). */
  nextCastAt: number;
  /** Chiêu -> mốc được dùng lại. */
  cds: Map<string, number>;
  /** Id quái con đang sống do trùm gọi (tỉa lười khi đếm). */
  adds: Set<string>;
  /** Đang gầm (chuyển giai đoạn): tới mốc này trùm đứng yên, không sát thương. */
  roarUntil: number;
  /** Giáp (`buff`): tới mốc này sát thương trùm nhận nhân `armorMult`. */
  armorUntil: number;
  armorMult: number;
  /** Thời gian chiến đấu cộng dồn (ms) để tính cuồng nộ: chỉ chạy khi có mục tiêu. */
  fightMs: number;
  enraged: boolean;
  pools: BossPool[];
  /** Hệ số hiện hành = giai đoạn x cuồng nộ: sát thương, hồi chiêu, tốc độ di chuyển. */
  atk: number;
  cd: number;
  mv: number;
}

/** Hạt giống ổn định cho một con trùm: từ số thứ tự quái và loài (mỗi con một chuỗi, cùng thế giới thì lặp lại được). */
function seedOf(kind: string, n: number): number {
  let h = (Math.imul(n | 0, 2654435761) ^ 0x9e3779b9) | 0;
  for (let i = 0; i < kind.length; i++) h = Math.imul(h ^ kind.charCodeAt(i), 16777619);
  return h | 0;
}

/** Trạng thái mới cho trùm `def`; `n` thường là `World.monsterSeq` lúc sinh. */
export function newBossCtrl(def: BossDef, n: number): BossCtrl {
  const ph = def.phases[0]!;
  return {
    def,
    phase: 0,
    engaged: false,
    rng: seedOf(def.kind, n),
    nextCastAt: 0,
    cds: new Map(),
    adds: new Set(),
    roarUntil: 0,
    armorUntil: 0,
    armorMult: 1,
    fightMs: 0,
    enraged: false,
    pools: [],
    atk: ph.atkMult,
    cd: ph.cdMult,
    mv: ph.speedMult,
  };
}

/** Số ngẫu nhiên [0, 1) từ bộ có seed của trùm (mulberry32). */
export function bossRand(bs: BossCtrl): number {
  bs.rng = (bs.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(bs.rng ^ (bs.rng >>> 15), 1 | bs.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Số quái con còn sống (tỉa khỏi tập những con đã chết / biến mất). */
export function bossLiveAdds(w: World, bs: BossCtrl): number {
  if (bs.adds.size === 0) return 0;
  for (const id of bs.adds) if (!w.mctrl.has(id)) bs.adds.delete(id);
  return bs.adds.size;
}

/** Xoá mọi quái con của trùm (trùm chết hoặc reset): không rơi đồ, không tu vi, không tính nhiệm vụ. */
export function bossDespawnAdds(w: World, bs: BossCtrl) {
  for (const id of bs.adds) {
    w.state.monsters.delete(id);
    w.mctrl.delete(id);
  }
  bs.adds.clear();
}

/** Hệ số sát thương trùm NHẬN lúc này (giáp `buff`); 1 khi không có giáp. Gọi ở `dealMonsterDamage`. */
export function bossArmorMult(mc: MonsterCtrl, now: number): number {
  const bs = mc.boss;
  return bs !== undefined && bs.armorUntil > now ? bs.armorMult : 1;
}
