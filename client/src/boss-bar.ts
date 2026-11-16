// Thanh máu TRÙM (QUYET_DINH_M3 mục 42, issue T4 #873; docs/THIET_KE_TRUM.md mục 5). Lớp THUẦN (không DOM / Phaser) nên test được.
//
// Việc của client: chọn trùm nào đáng hiện thanh (không hiện 8 thanh cho 8 Hắc Giao cùng bản đồ), tính mô hình thanh từ state công khai (`hp`, `maxHp`, `kind`) + các `fx` của máy chủ
// (`bossCast` tên chiêu đang vận, `bossPhase` tiếng gầm, `bossEnrage` cuồng nộ), và mốc giai đoạn từ `BOSS_BY_KIND[kind].phases[].fromHp` (KHÔNG thêm trường vào schema: byte / tick giữ 0).
// Giai đoạn suy từ khí huyết bằng `bossPhaseOf` của `shared/` (cùng hàm máy chủ dùng), `fx` chỉ để chớp / gầm.
import {
  BOSS_ARMOR_MAX_MS,
  BOSS_PHASE_ROAR_MS,
  MONSTER_BY_ID,
  bossDefOf,
  bossPhaseMarks,
  bossPhaseOf,
} from "@tien-gioi/shared";

/** Trùm ngoài hoang chỉ hiện thanh khi trong tầm này (px); bí cảnh luôn hiện (trùm duy nhất của run). */
export const BOSS_BAR_RANGE = 600;
/** Tiếng của trùm chỉ phát khi trùm trong / sát tầm nhìn (px ngoài rìa màn hình; `inView`): trùm ở xa khuất không gầm vào tai người chơi. */
export const BOSS_SFX_VIEW = 480;
/** Giữ tên chiêu trên thanh thêm chừng này (ms) sau lúc đòn đáp (đọc kịp, nhất là tên ngắn). */
export const BOSS_CAST_LINGER_MS = 500;
/** Dòng "Gọi N quái con" trên thanh trùm giữ chừng này (ms) sau lúc nhận `bossSummon`, rồi tắt (đọc kịp, không dán mãi). */
export const BOSS_SUMMON_NOTE_MS = 3000;
/** Cuồng nộ chớp mạnh chừng này (ms) lúc mới nhận `bossEnrage`, rồi giữ chỉ báo đứng yên. */
export const BOSS_ENRAGE_FLASH_MS = 1500;

/**
 * Hệ (màu / âm) của chiêu `abilityId` của trùm `kind`: `BossAbility.element`, bỏ trống thì hệ của chính con trùm (như vùng cảnh báo); không có thì `undefined`.
 * Tra bảng bằng `hasOwnProperty` (id lạ / `constructor` không lọt). Dùng cho tiếng của trùm (`sfx-recipes.ts` `bossSfx`).
 */
export function bossAbilityElement(kind: unknown, abilityId: unknown): string | undefined {
  if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, kind))
    return undefined;
  const own = MONSTER_BY_ID[kind]!.element;
  const ab =
    typeof abilityId === "string"
      ? bossDefOf(kind)?.abilities.find((a) => a.id === abilityId)
      : undefined;
  return ab?.element ?? own;
}

/** Một con trùm ứng viên (đọc từ state công khai). */
export interface BossCand {
  id: string;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

const finite = (...v: number[]) => v.every((n) => Number.isFinite(n));

/** Có phải trùm (có `boss: true` trong bảng quái) còn sống, số liệu hợp lệ không? Tra bằng `hasOwnProperty` (id lạ / `constructor` không lọt). */
export function isBossCand(c: BossCand): boolean {
  if (!c || typeof c.kind !== "string") return false;
  if (!Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, c.kind)) return false;
  if (!MONSTER_BY_ID[c.kind]!.boss) return false;
  return finite(c.x, c.y, c.hp, c.maxHp) && c.maxHp > 0 && c.hp > 0;
}

/**
 * Trùm nào hiện thanh. `always` (bí cảnh): trùm GẦN NHẤT bất kể tầm (nếu chưa biết vị trí mình thì trùm đầu tiên theo id). Ngoài hoang: trùm gần nhất TRONG `range` px, ai ngoài tầm
 * thì không hiện (8 Hắc Giao rải đều bản đồ: chỉ thanh của con đang ở gần). Hoà thì id nhỏ hơn thắng (tất định). Không có thì `null`.
 */
export function pickBossForBar(
  cands: Iterable<BossCand>,
  me: { x: number; y: number } | null,
  opts: { always: boolean; range?: number } = { always: false },
): BossCand | null {
  const range = opts.range ?? BOSS_BAR_RANGE;
  let best: BossCand | null = null;
  let bestD = Infinity;
  for (const c of cands) {
    if (!isBossCand(c)) continue;
    const d = me && finite(me.x, me.y) ? Math.hypot(c.x - me.x, c.y - me.y) : 0;
    if (!opts.always && me && d > range) continue;
    if (d < bestD || (d === bestD && best !== null && c.id < best.id)) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Mốc phân số khí huyết (0..1) -> phần trăm từ TRÁI của thanh (độ rộng phần tô = khí huyết nên vạch ở đúng chỗ khí huyết rơi xuống mốc); kẹp 0..100, bỏ số hỏng. */
export function bossMarkPercents(marks: readonly number[]): number[] {
  return marks
    .filter((m) => Number.isFinite(m))
    .map((m) => Math.round(Math.min(1, Math.max(0, m)) * 1000) / 10);
}

/**
 * Phần trăm sát thương trùm NHẬN khi có giáp (`bossArmor.mult` 0,5 -> 50): số nguyên 1..100; `null` nếu `mult` hỏng (không phải số hữu hạn, <= 0 hoặc > 1: client không tin `fx`,
 * không ghi "nhận 0 %" / "nhận 300 %" lên thanh).
 */
export function armorPercent(mult: unknown): number | null {
  if (typeof mult !== "number" || !Number.isFinite(mult) || mult <= 0 || mult > 1) return null;
  return Math.max(1, Math.round(mult * 100));
}

export interface BossBarModel {
  id: string;
  /** Tên trùm (từ bảng quái) */
  name: string;
  hp: number;
  maxHp: number;
  /** Tỉ lệ khí huyết 0..1 (độ rộng phần tô) */
  frac: number;
  /** Giai đoạn hiện tại (0-based, suy từ khí huyết) và tổng số giai đoạn; trùm chưa có dữ liệu giai đoạn: 0 và 1 */
  phase: number;
  phaseCount: number;
  /** Vị trí vạch đổi giai đoạn trên thanh, phần trăm từ TRÁI (0..100) = phân số khí huyết tại mốc x 100 */
  marks: number[];
  /** Tên chiêu đang vận (hoặc vừa đáp, còn trong `BOSS_CAST_LINGER_MS`); `null` = không */
  castName: string | null;
  /** Tiến độ gồng 0..1 của chiêu đang vận (1 = đáp đòn): thanh mảnh dưới tên chiêu; 0 khi không có chiêu */
  castFrac: number;
  /** Vừa chuyển giai đoạn (trong `BOSS_PHASE_ROAR_MS`): thanh chớp / hiện "Giai đoạn mới" */
  roaring: boolean;
  /** Đã cuồng nộ (bí cảnh) và còn đang chớp mạnh (`BOSS_ENRAGE_FLASH_MS`) */
  enrageFlash: boolean;
  enraged: boolean;
  /** Đang có GIÁP (`bossArmor`): phần trăm sát thương trùm nhận + còn bao lâu (ms); `null` = không có giáp. Hiện bằng CHỮ trên thanh (không chỉ vầng màu quanh trùm). */
  armor: { pct: number; leftMs: number } | null;
  /** Vừa gọi quái con (`bossSummon`, trong `BOSS_SUMMON_NOTE_MS`): số con; `null` = không */
  summonN: number | null;
}

interface ArmorRec {
  /** Lúc giáp hết (đồng hồ cảnh, ms) */
  until: number;
  /** Tổng thời lượng (ms) */
  ms: number;
  /** Sát thương nhận (0 < mult <= 1) */
  mult: number;
}

interface CastRec {
  ability: string;
  startAt: number;
  ms: number;
}

/**
 * Nhớ trạng thái theo `fx` của từng trùm (theo id quái): chiêu đang vận, lúc chuyển giai đoạn, cuồng nộ. Không giữ gì cho trùm không còn (`forget` khi quái biến mất).
 * Đồng hồ `now` do người gọi đưa vào (đồng hồ cảnh, ms): thuần, test được.
 */
export class BossFxTracker {
  private cast = new Map<string, CastRec>();
  private phaseAt = new Map<string, number>();
  private enrageAt = new Map<string, number>();
  private armor = new Map<string, ArmorRec>();
  private summon = new Map<string, { at: number; n: number }>();

  onCast(by: string, ability: string, ms: number, now: number): void {
    if (typeof by !== "string" || typeof ability !== "string" || !finite(ms, now) || ms <= 0)
      return;
    this.cast.set(by, { ability, startAt: now, ms });
  }
  onPhase(by: string, now: number): void {
    if (typeof by === "string" && finite(now)) this.phaseAt.set(by, now);
  }
  /** `bossArmor`: trùm dựng giáp `ms` ms nhận `mult` lần sát thương. Số hỏng (ms <= 0 / quá `BOSS_ARMOR_MAX_MS` của `shared/`, cùng trần `bossViolations` dùng cho dữ liệu, `mult` ngoài (0, 1]) thì bỏ; dựng lại thì THAY bản cũ. */
  onArmor(by: string, ms: number, mult: number, now: number): void {
    if (typeof by !== "string" || !finite(ms, now) || ms <= 0 || ms > BOSS_ARMOR_MAX_MS) return;
    if (armorPercent(mult) === null) return;
    this.armor.set(by, { until: now + ms, ms, mult });
  }
  /** `bossSummon`: trùm gọi `n` >= 1 quái con (số lẻ / hỏng thì bỏ). */
  onSummon(by: string, n: number, now: number): void {
    if (typeof by !== "string" || !finite(now) || !Number.isInteger(n) || n < 1 || n > 99) return;
    this.summon.set(by, { at: now, n });
  }
  /** Giáp còn hiệu lực của trùm `id` lúc `now`: hệ số, còn bao lâu và phần còn lại 0..1 (cho vầng giáp mờ dần); `null` nếu không có / đã hết. */
  armorOf(id: string, now: number): { mult: number; leftMs: number; frac: number } | null {
    const r = this.armor.get(id);
    if (!r || !finite(now)) return null;
    const left = r.until - now;
    // đồng hồ cảnh lùi (trước lúc nhận) thì không được báo còn NHIỀU HƠN thời lượng giáp
    return left > 0
      ? { mult: r.mult, leftMs: Math.min(left, r.ms), frac: Math.min(1, left / r.ms) }
      : null;
  }
  onEnrage(by: string, now: number): void {
    if (typeof by === "string" && finite(now)) this.enrageAt.set(by, now);
  }
  /**
   * Thời gian đã trôi kể từ lúc báo chiêu và thời lượng gồng của trùm `id`, nếu còn trong khoảng gồng + đáp (`graceMs` = thời gian đáp, mặc định 0); `null` nếu không có chiêu
   * hoặc đã quá. Dùng cho hoạt ảnh gồng / đáp trên thân trùm (`boss-cast-anim.ts`), cùng một bản ghi với thanh máu nên hai nơi luôn khớp nhau.
   */
  castTiming(id: string, now: number, graceMs = 0): { elapsedMs: number; castMs: number } | null {
    const rec = this.cast.get(id);
    if (!rec || !finite(now, graceMs)) return null;
    const el = now - rec.startAt;
    return el >= 0 && el < rec.ms + Math.max(0, graceMs) ? { elapsedMs: el, castMs: rec.ms } : null;
  }
  forget(id: string): void {
    this.cast.delete(id);
    this.phaseAt.delete(id);
    this.enrageAt.delete(id);
    this.armor.delete(id);
    this.summon.delete(id);
  }
  clear(): void {
    this.cast.clear();
    this.phaseAt.clear();
    this.enrageAt.clear();
    this.armor.clear();
    this.summon.clear();
  }

  /** Mô hình thanh của trùm `c` lúc `now`. Chiêu lạ (không có trong dữ liệu) vẫn hiện "Đang vận chiêu" để người chơi biết trùm đang gồng (không im lặng). */
  modelOf(c: BossCand, now: number): BossBarModel {
    const mon = MONSTER_BY_ID[c.kind]!;
    const def = bossDefOf(c.kind);
    const frac = Math.min(1, Math.max(0, c.hp / c.maxHp));
    const phase = def ? bossPhaseOf(def, frac) : 0;
    const marks = def ? bossMarkPercents(bossPhaseMarks(def)) : [];
    let castName: string | null = null;
    let castFrac = 0;
    const rec = this.cast.get(c.id);
    if (rec) {
      const el = now - rec.startAt;
      if (el < rec.ms + BOSS_CAST_LINGER_MS) {
        castName = def?.abilities.find((a) => a.id === rec.ability)?.name ?? "Đang vận chiêu";
        castFrac = Math.min(1, Math.max(0, el / rec.ms));
      }
    }
    const pAt = this.phaseAt.get(c.id);
    const eAt = this.enrageAt.get(c.id);
    const ar = this.armorOf(c.id, now);
    const sm = this.summon.get(c.id);
    return {
      id: c.id,
      name: mon.name,
      hp: Math.max(0, Math.round(c.hp)),
      maxHp: Math.round(c.maxHp),
      frac,
      phase,
      phaseCount: def ? def.phases.length : 1,
      marks,
      castName,
      castFrac,
      roaring: pAt !== undefined && now - pAt < BOSS_PHASE_ROAR_MS,
      enrageFlash: eAt !== undefined && now - eAt < BOSS_ENRAGE_FLASH_MS,
      enraged: eAt !== undefined,
      armor: ar ? { pct: armorPercent(ar.mult) ?? 100, leftMs: ar.leftMs } : null,
      summonN: sm && now - sm.at >= 0 && now - sm.at < BOSS_SUMMON_NOTE_MS ? sm.n : null,
    };
  }
}

/** Chữ mô tả cho người đọc màn hình (`aria-valuetext`): "Xích Mãng: 62 % khí huyết, giai đoạn 2 / 2". */
export function bossBarText(m: BossBarModel): string {
  const pct = Math.round(m.frac * 100);
  const ph = m.phaseCount > 1 ? `, giai đoạn ${m.phase + 1} / ${m.phaseCount}` : "";
  const ar = m.armor ? `, có giáp (nhận ${m.armor.pct} % sát thương)` : "";
  return `${m.name}: ${pct} % khí huyết${ph}${ar}`;
}
