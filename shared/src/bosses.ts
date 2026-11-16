// Khung trùm nhiều chiêu (QUYET_DINH_M3 mục 42, docs/THIET_KE_TRUM.md, issue T1 #870): HỢP ĐỒNG `shared/` giữa client và server.
//
// Mọi chiêu của trùm là DỮ LIỆU (bảng `BOSSES`), không viết mã riêng từng con: bộ thực thi chung ở `server/src/systems/boss.ts` (T2) chọn chiêu, báo trước, đáp đòn,
// chuyển giai đoạn, triệu hồi, cuồng nộ. File này chỉ có kiểu, hằng số, hàm thuần và kiểm dữ liệu; server vẫn quyết định mọi kết quả.
// Công bằng (vì chết = mất kiếp): mọi đòn GÂY SÁT THƯƠNG có báo trước >= `BOSS_MIN_TELEGRAPH_MS` (kể cả khi cuồng nộ), né được bằng di chuyển.
// Giai đoạn là hàm THUẦN của khí huyết (`bossPhaseOf`): client suy ra mốc trên thanh máu từ bảng này, KHÔNG thêm trường vào state.
import { MONSTER_BY_ID } from "./game";
import { STATUS_BY_ID, type Element, type SkillEffect } from "./skills";

// ---------- Hằng số ----------

/** Báo trước tối thiểu (ms) của MỌI đòn gây sát thương: người chơi phải kịp thấy và bước ra khỏi vùng. Cuồng nộ KHÔNG được rút ngắn xuống dưới mức này. */
export const BOSS_MIN_TELEGRAPH_MS = 800;
/** Trúng chỉ khi tâm người chơi cách mép vùng <= `PLAYER_RADIUS` - mức này (px): nghiêng về phía người chơi vì hình vẽ trễ ~100 ms so với máy chủ. */
export const BOSS_HIT_GRACE_PX = 8;
/** Nghỉ tối thiểu (ms) giữa hai lần vận chiêu: không bao giờ hai đòn nặng chồng báo trước, và người chơi có nhịp để uống đan / hồi. */
export const BOSS_MIN_CAST_GAP_MS = 600;
/** Lần vận chiêu đầu sau khi gây hấn phải cách >= mức này (ms). */
export const BOSS_FIRST_CAST_DELAY_MS = 1200;
/** Tiếng gầm khi chuyển giai đoạn (ms): KHÔNG sát thương, trùm đứng yên. */
export const BOSS_PHASE_ROAR_MS = 1500;
/** Trần cứng số quái con đồng thời của MỘT trùm (`BossDef.maxAdds` không vượt mức này). */
export const BOSS_ADDS_CAP = 6;

// ---------- Hình chiêu ----------

/**
 * Hình / kiểu của một chiêu. Hình có SÁT THƯƠNG (mọi hình trừ `summon`, `buff`) bắt buộc có báo trước >= `BOSS_MIN_TELEGRAPH_MS`:
 *  - `circleAt`: vòng tròn bán kính `r` rơi tại mục tiêu / người XA nhất / chỗ trùm đứng;
 *  - `ring`: vành khuyên quanh thân, trong `[r0, r]` (giữa `r0` là chỗ an toàn);
 *  - `cone`: nón trước mặt bán kính `r`, góc mở `arc` (radian);  `line`: đường thẳng dài `len` rộng `w`;
 *  - `charge`: lao thẳng dài `len` rộng `w` (đường báo trước là đường lao);
 *  - `rain`: `count` vòng tròn bán kính `r` rơi lần lượt cách nhau `gapMs`, rải trong `spreadPx` quanh mục tiêu; MỖI vòng có báo trước riêng;
 *  - `pull`: kéo người trong vòng `r` vào giữa tối đa `pullPx` rồi nổ bán kính `blastR` (báo trước cả hai vùng);
 *  - `pool`: vũng bán kính `r` để lại `ttlMs`, gây sát thương mỗi `tickMs` (vị trí vũng được báo trước);
 *  - `blink`: trùm dịch chuyển tới điểm đáp rồi nổ bán kính `landR` (báo trước ở điểm đáp);
 *  - `summon` (triệu hồi `count` quái `kind`) và `buff` (giáp: nhận `dmgTakenMult` lần sát thương trong `ms`): không sát thương.
 */
export type BossShape =
  | { t: "circleAt"; at: "target" | "farthest" | "self"; r: number }
  | { t: "ring"; r0: number; r: number }
  | { t: "cone"; r: number; arc: number }
  | { t: "line"; len: number; w: number }
  | { t: "charge"; len: number; w: number }
  | { t: "rain"; r: number; count: number; spreadPx: number; gapMs: number }
  | { t: "pull"; r: number; pullPx: number; blastR: number }
  | { t: "pool"; r: number; ttlMs: number; tickMs: number }
  | { t: "blink"; landR: number }
  | { t: "summon"; kind: string; count: number }
  | { t: "buff"; dmgTakenMult: number; ms: number };

/** Hình có gây sát thương (cần báo trước >= `BOSS_MIN_TELEGRAPH_MS`)? */
export function bossShapeDamages(shape: BossShape): boolean {
  return shape.t !== "summon" && shape.t !== "buff";
}

/** Điều kiện chọn chiêu (đều tuỳ chọn; thiếu = không hạn). */
export interface BossCond {
  /** Khoảng cách tới mục tiêu chính (px) */
  minDist?: number;
  maxDist?: number;
  /** Số người chơi (đang bị nhắm được) trong `BOSS_COND_RADIUS` quanh trùm */
  minTargets?: number;
  maxTargets?: number;
}
/** Bán kính (px) đếm số người quanh trùm cho `BossCond.minTargets` / `maxTargets`. */
export const BOSS_COND_RADIUS = 320;

export interface BossAbility {
  /** Id duy nhất trong một `BossDef` (chữ thường, số, gạch dưới) */
  id: string;
  /** Tên chiêu hiện trên thanh máu trùm (tiếng Việt) */
  name: string;
  shape: BossShape;
  /** Báo trước (ms): từ lúc hiện vùng cảnh báo tới lúc đáp đòn. Chiêu có sát thương >= `BOSS_MIN_TELEGRAPH_MS`. */
  telegraphMs: number;
  /** Thở sau khi đáp đòn (ms): trùm đứng yên, người cận chiến đánh trả */
  recoverMs: number;
  /** Chờ tối thiểu giữa hai lần dùng CHIÊU NÀY (ms), tính từ lúc bắt đầu vận; >= `telegraphMs` + `recoverMs` */
  cooldownMs: number;
  /** Trọng số khi chọn ngẫu nhiên (> 0) */
  weight: number;
  /** Sát thương = `round(atk x giai đoạn.atkMult x dmgMult)`; 0 cho chiêu không sát thương */
  dmgMult: number;
  /** Hệ của vùng cảnh báo (màu); bỏ trống = hệ của trùm */
  element?: Element;
  /** Trạng thái gắn kèm khi trúng (độc, bỏng, tê cóng...: dùng lại hệ trạng thái M7) */
  effect?: SkillEffect;
  cond?: BossCond;
}

/** Hành động chạy MỘT lần khi vào giai đoạn: gọi quái con hoặc dựng giáp (không sát thương). */
export type BossAction = Extract<BossShape, { t: "summon" } | { t: "buff" }>;

export interface BossPhase {
  /** Id giai đoạn (chữ thường, gạch dưới) */
  id: string;
  /**
   * Vào giai đoạn này khi khí huyết < `fromHp` (phân số 0..1 của khí huyết tối đa). Giai đoạn ĐẦU có `fromHp` = 1 (luôn áp dụng); các giai đoạn sau GIẢM DẦN.
   */
  fromHp: number;
  /** Hệ số tốc độ di chuyển, sát thương và hồi chiêu (< 1 = nhanh hơn) của giai đoạn */
  speedMult: number;
  atkMult: number;
  cdMult: number;
  /** Nghỉ giữa hai lần vận chiêu ở giai đoạn này (ms, >= `BOSS_MIN_CAST_GAP_MS`) */
  castGapMs: number;
  /** Id các chiêu dùng được ở giai đoạn này (lấy từ `BossDef.abilities`); chiêu mở ở giai đoạn trước vẫn nằm trong danh sách nếu muốn giữ */
  abilities: string[];
  onEnter?: BossAction[];
}

/** Cuồng nộ (CHỈ trùm bí cảnh): sau `afterMs` có người trong vùng, nhân các hệ số; KHÔNG rút ngắn báo trước dưới `BOSS_MIN_TELEGRAPH_MS`. */
export interface BossEnrage {
  afterMs: number;
  atkMult: number;
  speedMult: number;
  cdMult: number;
}

export interface BossDef {
  /** Id `MonsterKind` có thật và `boss: true` */
  kind: string;
  abilities: BossAbility[];
  phases: BossPhase[];
  enrage?: BossEnrage;
  /** Số quái con đồng thời tối đa (0..`BOSS_ADDS_CAP`) */
  maxAdds: number;
}

// ---------- Hàm thuần dùng chung server / client ----------

/**
 * Chỉ số giai đoạn ứng với phân số khí huyết `hpFrac` (0..1): giai đoạn cuối cùng có `fromHp` > `hpFrac`. Chỉ TĂNG khi khí huyết giảm (hàm đơn điệu); số không hợp lệ
 * (NaN, không phải số) coi là đầy máu = giai đoạn 0; <= 0 là giai đoạn cuối. Client vẽ mốc giai đoạn trên thanh máu từ `bossPhaseMarks`.
 */
export function bossPhaseOf(def: BossDef, hpFrac: unknown): number {
  if (typeof hpFrac !== "number" || Number.isNaN(hpFrac)) return 0;
  let p = 0;
  for (let i = 1; i < def.phases.length; i++) if (hpFrac < def.phases[i]!.fromHp) p = i;
  return p;
}

/** Các mốc phân số khí huyết (giảm dần) mà tại đó đổi giai đoạn: để vẽ vạch trên thanh máu trùm. */
export function bossPhaseMarks(def: BossDef): number[] {
  return def.phases.slice(1).map((ph) => ph.fromHp);
}

// ---------- Dữ liệu ----------

/**
 * KHUNG: một trùm mẫu để test và để B làm giao diện bằng dữ liệu thật của hợp đồng. Dev E thay bằng bộ chiêu thật của bốn trùm (Xích Mãng, Hắc Giao, Thiên Hàn Vương, Linh Hư Yêu Vương)
 * ở issue T3 (#872) bằng `bossViolations`; con số ở đây chỉ để dữ liệu hợp lệ, KHÔNG phải cân bằng.
 */
export const BOSSES: readonly BossDef[] = [
  {
    kind: "mang",
    maxAdds: 2,
    abilities: [
      {
        id: "quat_duoi",
        name: "Quất đuôi",
        shape: { t: "cone", r: 150, arc: (2 * Math.PI) / 3 },
        telegraphMs: 900,
        recoverMs: 700,
        cooldownMs: 7000,
        weight: 3,
        dmgMult: 1.4,
        cond: { maxDist: 170 },
      },
      {
        id: "cuon_minh",
        name: "Cuộn mình lao tới",
        shape: { t: "charge", len: 320, w: 80 },
        telegraphMs: 900,
        recoverMs: 900,
        cooldownMs: 9000,
        weight: 2,
        dmgMult: 1.6,
        cond: { minDist: 120 },
      },
      {
        id: "goi_ran_con",
        name: "Gọi rắn con",
        shape: { t: "summon", kind: "tho", count: 2 },
        telegraphMs: 800,
        recoverMs: 600,
        cooldownMs: 20000,
        weight: 1,
        dmgMult: 0,
      },
    ],
    phases: [
      {
        id: "dau",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1500,
        abilities: ["quat_duoi", "cuon_minh"],
      },
      {
        id: "nua_sau",
        fromHp: 0.5,
        speedMult: 1.15,
        atkMult: 1,
        cdMult: 0.85,
        castGapMs: 1200,
        abilities: ["quat_duoi", "cuon_minh", "goi_ran_con"],
        onEnter: [{ t: "summon", kind: "tho", count: 2 }],
      },
    ],
  },
];

export const BOSS_BY_KIND: Readonly<Record<string, BossDef>> = Object.fromEntries(
  BOSSES.map((b) => [b.kind, b]),
);

/** Định nghĩa trùm của `kind` (tra bằng `hasOwnProperty`, không bằng `[]`); `undefined` nếu không có. */
export function bossDefOf(kind: unknown): BossDef | undefined {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(BOSS_BY_KIND, kind)
    ? BOSS_BY_KIND[kind]
    : undefined;
}

// ---------- Kiểm dữ liệu (D / E / F dùng; test của `shared/` gọi với `BOSSES`) ----------

const ID_RE = /^[a-z0-9_]+$/;
const pos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function shapeProblems(s: BossShape): string[] {
  const bad: string[] = [];
  switch (s.t) {
    case "circleAt":
      if (!pos(s.r)) bad.push("bán kính r");
      break;
    case "ring":
      if (!pos(s.r) || !(typeof s.r0 === "number" && s.r0 >= 0 && s.r0 < s.r))
        bad.push("vành khuyên r0 < r");
      break;
    case "cone":
      if (!pos(s.r) || !pos(s.arc) || s.arc > 2 * Math.PI) bad.push("nón r / arc");
      break;
    case "line":
    case "charge":
      if (!pos(s.len) || !pos(s.w)) bad.push("len / w");
      break;
    case "rain":
      if (
        !pos(s.r) ||
        !Number.isInteger(s.count) ||
        s.count < 1 ||
        s.count > 12 ||
        !pos(s.spreadPx) ||
        !pos(s.gapMs)
      )
        bad.push("mưa r / count (1-12) / spreadPx / gapMs");
      break;
    case "pull":
      if (!pos(s.r) || !pos(s.pullPx) || !pos(s.blastR)) bad.push("kéo r / pullPx / blastR");
      break;
    case "pool":
      if (!pos(s.r) || !pos(s.ttlMs) || !pos(s.tickMs)) bad.push("vũng r / ttlMs / tickMs");
      break;
    case "blink":
      if (!pos(s.landR)) bad.push("landR");
      break;
    case "summon":
      if (
        !Number.isInteger(s.count) ||
        s.count < 1 ||
        s.count > BOSS_ADDS_CAP ||
        !Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, s.kind)
      )
        bad.push(
          `triệu hồi quái ${String(s.kind)} không có thật hoặc số lượng ngoài 1-${BOSS_ADDS_CAP}`,
        );
      break;
    case "buff":
      if (
        !(typeof s.dmgTakenMult === "number" && s.dmgTakenMult > 0 && s.dmgTakenMult <= 1) ||
        !pos(s.ms)
      )
        bad.push("giáp dmgTakenMult (0,1] / ms");
      break;
  }
  return bad;
}

/**
 * Kiểm bảng trùm: trả danh sách lỗi (rỗng = sạch). Luật công bằng (mục 2 `THIET_KE_TRUM.md`): mọi chiêu có sát thương báo trước >= `BOSS_MIN_TELEGRAPH_MS`; nghỉ giữa các lần vận
 * >= `BOSS_MIN_CAST_GAP_MS`; `cooldownMs` >= `telegraphMs` + `recoverMs`. Còn: `kind` có thật và là trùm; id đúng dạng và không trùng; giai đoạn đầu `fromHp` = 1, các giai đoạn sau giảm
 * nghiêm ngặt trong (0, 1); chiêu của giai đoạn có thật; trọng số > 0; hệ số > 0; tổng triệu hồi một lần <= `maxAdds` <= `BOSS_ADDS_CAP`; cuồng nộ hợp lệ.
 */
export function bossViolations(defs: readonly BossDef[] = BOSSES): string[] {
  const bad: string[] = [];
  const kinds = new Set<string>();
  for (const d of defs) {
    const k = String(d.kind);
    if (kinds.has(k)) bad.push(`${k}: trùm trùng`);
    kinds.add(k);
    const mk = Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, k)
      ? MONSTER_BY_ID[k]
      : undefined;
    if (!mk) bad.push(`${k}: không có loài quái này`);
    else if (!mk.boss) bad.push(`${k}: loài quái không phải trùm (boss: true)`);
    if (!Number.isInteger(d.maxAdds) || d.maxAdds < 0 || d.maxAdds > BOSS_ADDS_CAP)
      bad.push(`${k}: maxAdds ngoài 0-${BOSS_ADDS_CAP}`);
    const ids = new Set<string>();
    for (const a of d.abilities) {
      const w = `${k}.${a.id}`;
      if (!ID_RE.test(a.id)) bad.push(`${w}: id chiêu sai dạng`);
      if (ids.has(a.id)) bad.push(`${w}: trùng id chiêu`);
      ids.add(a.id);
      if (!a.name.trim()) bad.push(`${w}: thiếu tên`);
      for (const p of shapeProblems(a.shape)) bad.push(`${w}: ${p}`);
      if (!(typeof a.telegraphMs === "number" && a.telegraphMs >= 0))
        bad.push(`${w}: telegraphMs không hợp lệ`);
      else if (bossShapeDamages(a.shape) && a.telegraphMs < BOSS_MIN_TELEGRAPH_MS)
        bad.push(
          `${w}: báo trước ${a.telegraphMs} ms < ${BOSS_MIN_TELEGRAPH_MS} ms (đòn có sát thương phải báo trước)`,
        );
      if (!(typeof a.recoverMs === "number" && a.recoverMs >= 0))
        bad.push(`${w}: recoverMs không hợp lệ`);
      if (!(typeof a.cooldownMs === "number") || a.cooldownMs < a.telegraphMs + a.recoverMs)
        bad.push(`${w}: cooldownMs < telegraphMs + recoverMs`);
      if (!pos(a.weight)) bad.push(`${w}: weight phải > 0`);
      if (!(typeof a.dmgMult === "number" && a.dmgMult >= 0))
        bad.push(`${w}: dmgMult không hợp lệ`);
      else if (bossShapeDamages(a.shape) && a.dmgMult <= 0)
        bad.push(`${w}: chiêu sát thương cần dmgMult > 0`);
      if (a.effect && !Object.prototype.hasOwnProperty.call(STATUS_BY_ID, a.effect.status))
        bad.push(`${w}: trạng thái ${a.effect.status} không có thật`);
    }
    if (d.phases.length < 1) bad.push(`${k}: thiếu giai đoạn`);
    let prev = 2;
    d.phases.forEach((ph, i) => {
      const w = `${k}.${ph.id}`;
      if (!ID_RE.test(ph.id)) bad.push(`${w}: id giai đoạn sai dạng`);
      if (i === 0 && ph.fromHp !== 1) bad.push(`${w}: giai đoạn đầu phải có fromHp = 1`);
      if (i > 0 && !(ph.fromHp > 0 && ph.fromHp < 1 && ph.fromHp < prev))
        bad.push(`${w}: fromHp phải giảm nghiêm ngặt trong (0, 1)`);
      prev = ph.fromHp;
      for (const x of [ph.speedMult, ph.atkMult, ph.cdMult])
        if (!pos(x)) bad.push(`${w}: hệ số tốc độ / sát thương / hồi chiêu phải > 0`);
      if (!(typeof ph.castGapMs === "number" && ph.castGapMs >= BOSS_MIN_CAST_GAP_MS))
        bad.push(`${w}: castGapMs < ${BOSS_MIN_CAST_GAP_MS}`);
      if (ph.abilities.length < 1) bad.push(`${w}: không có chiêu nào`);
      for (const id of ph.abilities)
        if (!ids.has(id)) bad.push(`${w}: chiêu ${id} không có trong bảng chiêu`);
      let adds = 0;
      for (const act of ph.onEnter ?? []) {
        for (const p of shapeProblems(act)) bad.push(`${w}.onEnter: ${p}`);
        if (act.t === "summon") adds += act.count;
      }
      if (adds > d.maxAdds) bad.push(`${w}: onEnter triệu hồi ${adds} > maxAdds ${d.maxAdds}`);
    });
    for (const a of d.abilities)
      if (a.shape.t === "summon" && a.shape.count > d.maxAdds)
        bad.push(`${k}.${a.id}: triệu hồi ${a.shape.count} > maxAdds ${d.maxAdds}`);
    if (d.enrage) {
      const e = d.enrage;
      if (!pos(e.afterMs)) bad.push(`${k}: enrage.afterMs phải > 0`);
      for (const x of [e.atkMult, e.speedMult, e.cdMult])
        if (!pos(x)) bad.push(`${k}: hệ số cuồng nộ phải > 0`);
    }
  }
  return bad;
}
