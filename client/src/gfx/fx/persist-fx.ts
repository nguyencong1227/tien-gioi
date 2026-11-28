/**
 * VẬT THỂ BỀN (`FxMsg` `zone` / `trap` / `totem` / `aura` + `fxEnd`, mục 51, CT11b bước 3b; máy chủ CT4 #1118): máy chủ gửi MỘT tin `fx` lúc dựng (`id` tăng theo phòng, tâm (x, y),
 * bán kính `r`, thời gian tồn tại tối đa `ms`) và CHỈ gửi `fxEnd` khi vật thể kết thúc SỚM (`pop` = bẫy nổ, `gone` = chủ chết / rời / bị thay / bị đẩy). Hết `ms` tự nhiên thì KHÔNG
 * có `fxEnd`: client tự tắt theo đồng hồ. `zone` / `trap` / `totem` đứng yên; `aura` BÁM người dùng `by` (lớp vẽ lấy vị trí từ cảnh). Người vào vùng nhìn SAU lúc dựng không nhận tin
 * nên không thấy (sát thương vẫn tính); nối lại mạng thì hình mất: chấp nhận, vật thể ngắn.
 *
 * Hàm THUẦN (không Phaser, không `Math.random`, không đồng hồ máy): `persist-layer.ts` lo Graphics. Client không quyết kết quả: sát thương luôn là `dmg` của máy chủ, ở đây chỉ vẽ.
 * Không tin tin nhắn: kiểu / số hữu hạn / biên kiểm ở `parsePersist` / `parsePersistEnd` (sai thì bỏ CẢ tin); `r` và `ms` kẹp. Trần số vật thể đang vẽ lấy từ `SKILL_LIMITS` (cùng nguồn
 * với máy chủ) và theo bậc chất lượng (`persistLimits` + `persistSlot`): 4 / người x nhiều người không được phình thành vài trăm hình.
 */
import { SKILL_LIMITS, type SkillDef } from "@tien-gioi/shared";
import { castTint } from "./cast-fx";
import type { FxPoint } from "./skill-fx";

export type PersistKind = "zone" | "trap" | "totem" | "aura";
const KINDS: readonly string[] = ["zone", "trap", "totem", "aura"];

/** Công thức hạt khi bẫy nổ (dùng lại bụi chạm của đạn, `recipes-ct2.ts`). */
export const PERSIST_POP_RECIPE = "pbolt-hit";
/** `r` kẹp trong khoảng này (px); `ms` kẹp [1, `PERSIST_MS_MAX`] (máy chủ: bẫy lâu nhất `trapDurationMax` = 20 giây). */
export const PERSIST_R_MIN = 8;
export const PERSIST_R_MAX = 400;
export const PERSIST_MS_MAX = 30_000;
/** Hiện dần lúc dựng / mờ dần trước khi hết hạn hoặc bị thay (ms). */
export const PERSIST_FADE_IN_MS = 180;
export const PERSIST_FADE_OUT_MS = 350;
/** Bẫy nổ: thân tắt nhanh trong `PERSIST_POP_BODY_MS`, vòng nổ toả trong `PERSIST_POP_MS`. */
export const PERSIST_POP_BODY_MS = 90;
export const PERSIST_POP_MS = 280;
/** Bẫy vừa kích hoạt (hết `armMs`): chớp vòng trong chừng này (ms). */
export const PERSIST_ARM_FLASH_MS = 220;
/** Hào quang: người dùng chưa có trong state (tin `fx` có thể đến trước bản vá state) thì chờ chừng này (ms) rồi mới coi là đã rời; chết thì tắt ngay. */
export const PERSIST_ANCHOR_GRACE_MS = 800;
/**
 * Vòng tầm đánh (nét đứt) quanh chân TƯỢNG: người chơi cần thấy tượng với tới đâu để dụ quái vào. Rà giao diện điện thoại 25/11 (390x844, Hồn Phiên Tượng tầm 220 px): bản cũ nét 1 / độ đậm 0,22
 * (0,275 của tượng mình) gần như vô hình, dò điểm ảnh quanh bán kính tầm không thấy vòng nào (khác vùng / bẫy đã kích hoạt: nét 2, độ đậm 0,5-0,55, có nền). Nét 2 / độ đậm 0,5 ngang vòng của bẫy và vùng.
 */
export const PERSIST_TOTEM_RING_WIDTH = 2;
export const PERSIST_TOTEM_RING_ALPHA = 0.5;
/** Số cung nét đứt của vòng tầm tượng, và độ dài mỗi cung (rad). */
export const PERSIST_TOTEM_RING_DASHES = 12;
export const PERSIST_TOTEM_RING_ARC = 0.3;
/** Nền nhạt phủ vùng tầm của tượng (chỉ khi bậc đồ hoạ có chi tiết): vừa đủ để vùng đọc được trên nền sáng, nhẹ hơn vùng (0,14) vì tượng không gây sát thương theo vùng đặc. */
export const PERSIST_TOTEM_FILL_ALPHA = 0.06;
/** Nhịp mặc định khi chiêu không khai `tickMs`, và khoảng kẹp (ms). */
export const PERSIST_TICK_DEFAULT = 800;
const TICK_MIN = 200;
const TICK_MAX = 5000;
/** Biên toạ độ chấp nhận (px) và độ dài tối đa của id chữ: ngoài khoảng này coi là tin hỏng. */
const COORD_LIMIT = 100_000;
const ID_MAX = 64;
/** `id` số nguyên do máy chủ cấp: 0..2^31 (tăng dần theo phòng). */
const NUM_ID_MAX = 2 ** 31;

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const idStr = (v: unknown): v is string => typeof v === "string" && v !== "" && v.length <= ID_MAX;
const idNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= NUM_ID_MAX;

export interface PersistMsgClean {
  kind: PersistKind;
  by: string;
  skill: string;
  id: number;
  x: number;
  y: number;
  r: number;
  ms: number;
}

/** Tin vật thể bền đã làm sạch; sai dạng thì `null`. `r` > 0 kẹp [`PERSIST_R_MIN`, `PERSIST_R_MAX`]; `ms` > 0 kẹp [1, `PERSIST_MS_MAX`] và làm tròn; `id` nguyên không âm. */
export function parsePersist(raw: unknown): PersistMsgClean | null {
  if (!isObj(raw)) return null;
  const { kind, by, skill, id, x, y, r, ms } = raw;
  if (typeof kind !== "string" || !KINDS.includes(kind)) return null;
  if (!idStr(by) || !idStr(skill) || !idNum(id)) return null;
  if (!num(x) || !num(y) || !num(r) || !num(ms)) return null;
  if (Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) return null;
  if (!(r > 0) || !(ms > 0)) return null;
  return {
    kind: kind as PersistKind,
    by,
    skill,
    id,
    x,
    y,
    r: clamp(r, PERSIST_R_MIN, PERSIST_R_MAX),
    ms: clamp(Math.round(ms), 1, PERSIST_MS_MAX),
  };
}

export type PersistWhy = "pop" | "gone";
export interface PersistEndMsg {
  id: number;
  x: number;
  y: number;
  why: PersistWhy;
}

/** Tin `fxEnd` đã làm sạch; sai dạng (id không nguyên, `why` lạ, toạ độ hỏng) thì `null`. */
export function parsePersistEnd(raw: unknown): PersistEndMsg | null {
  if (!isObj(raw)) return null;
  const { id, x, y, why } = raw;
  if (!idNum(id) || !num(x) || !num(y)) return null;
  if (Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) return null;
  if (why !== "pop" && why !== "gone") return null;
  return { id, x, y, why };
}

/** Một vật thể sẵn sàng vẽ: tin sạch + màu theo hệ + của mình hay không + thời gian chờ kích hoạt (bẫy) + nhịp tác dụng. */
export interface PersistPlan extends PersistMsgClean {
  tint: number;
  mine: boolean;
  /** Bẫy: chưa kích hoạt trước mốc này (ms từ lúc dựng); hình khác = 0 */
  armMs: number;
  /** Nhịp tác dụng của chiêu (ms): nhịp lan sóng / chớp của vùng, tượng, hào quang */
  tickMs: number;
}

/** Kế hoạch vẽ: `def` là chiêu của tin (tra `skillOf`); `armMs` chỉ có nghĩa với bẫy và không dài hơn `ms`; `tickMs` kẹp [200, 5000], thiếu thì 800. */
export function persistPlan(
  m: PersistMsgClean,
  def: Pick<SkillDef, "element" | "armMs" | "tickMs">,
  mine: boolean,
): PersistPlan {
  const arm = m.kind === "trap" && num(def.armMs) ? clamp(def.armMs, 0, m.ms) : 0;
  const tick = num(def.tickMs) ? clamp(def.tickMs, TICK_MIN, TICK_MAX) : PERSIST_TICK_DEFAULT;
  return { ...m, tint: castTint(def.element), mine, armMs: Math.round(arm), tickMs: tick };
}

/** Vật thể kết thúc SỚM tại `at` (ms từ lúc dựng) vì `why`. */
export interface PersistEnd {
  at: number;
  why: PersistWhy;
}

/** Mốc (ms từ lúc dựng) vật thể được gỡ hẳn: hết `ms` tự nhiên, hoặc sớm hơn nếu có `fxEnd` (nổ: `PERSIST_POP_MS`, mờ: `PERSIST_FADE_OUT_MS`). */
export function persistLifeEnd(plan: Pick<PersistPlan, "ms">, end: PersistEnd | null): number {
  if (end === null) return plan.ms;
  return Math.min(plan.ms, end.at + (end.why === "pop" ? PERSIST_POP_MS : PERSIST_FADE_OUT_MS));
}

export function persistAlive(
  plan: Pick<PersistPlan, "ms">,
  elapsed: number,
  end: PersistEnd | null,
): boolean {
  return elapsed < persistLifeEnd(plan, end);
}

/** Độ đậm của THÂN: hiện dần lúc dựng; tự nhiên thì mờ dần `PERSIST_FADE_OUT_MS` cuối; `gone` mờ từ lúc `fxEnd`; `pop` tắt nhanh (vòng nổ có `persistPopProgress` riêng). */
export function persistAlpha(
  plan: Pick<PersistPlan, "ms">,
  elapsed: number,
  end: PersistEnd | null,
): number {
  const fin = clamp(elapsed / PERSIST_FADE_IN_MS, 0, 1);
  if (end === null) return fin * clamp((plan.ms - elapsed) / PERSIST_FADE_OUT_MS, 0, 1);
  const since = elapsed - end.at;
  if (since <= 0) return fin;
  const span = end.why === "pop" ? PERSIST_POP_BODY_MS : PERSIST_FADE_OUT_MS;
  return fin * clamp(1 - since / span, 0, 1);
}

/** Tiến độ vòng nổ của bẫy (0..1) sau `fxEnd` `pop`; `-1` khi chưa nổ / không phải nổ. */
export function persistPopProgress(elapsed: number, end: PersistEnd | null): number {
  if (end === null || end.why !== "pop" || elapsed < end.at) return -1;
  return clamp((elapsed - end.at) / PERSIST_POP_MS, 0, 1);
}

/** Đã kích hoạt chưa: chỉ bẫy mới có thời gian chờ (`armMs`); hình khác luôn "đang hoạt động". */
export function persistArmed(plan: Pick<PersistPlan, "kind" | "armMs">, elapsed: number): boolean {
  return plan.kind !== "trap" || elapsed >= plan.armMs;
}

/** Độ sáng chớp lúc bẫy vừa kích hoạt (1 -> 0 trong `PERSIST_ARM_FLASH_MS`); 0 ở mọi lúc khác. */
export function persistArmFlash(
  plan: Pick<PersistPlan, "kind" | "armMs">,
  elapsed: number,
): number {
  if (plan.kind !== "trap" || plan.armMs <= 0) return 0;
  const since = elapsed - plan.armMs;
  return since >= 0 && since < PERSIST_ARM_FLASH_MS ? 1 - since / PERSIST_ARM_FLASH_MS : 0;
}

/** Pha trong nhịp tác dụng (0..1): lan sóng / chớp một lần mỗi `tickMs`. */
export function persistPulse(plan: Pick<PersistPlan, "tickMs">, elapsed: number): number {
  if (!(elapsed > 0)) return 0;
  return (elapsed % plan.tickMs) / plan.tickMs;
}

/** Hạt MỘT lần khi bẫy nổ (đúng chỗ bẫy): bụi chạm tô theo hệ. Của mình ưu tiên 2 (không bị bỏ khi đông), người khác 1. */
export function planPersistPop(
  plan: Pick<PersistPlan, "mine" | "tint">,
  x: number,
  y: number,
): FxPoint[] {
  return [
    {
      recipe: PERSIST_POP_RECIPE,
      x,
      y: y - 6,
      angle: 0,
      tint: plan.tint,
      priority: plan.mine ? 2 : 1,
      delayMs: 0,
    },
  ];
}

/** Trần số vật thể vẽ cùng lúc và chi tiết, theo ngân sách emitter của bậc chất lượng. */
export interface PersistLimits {
  /** Tổng vật thể đang giữ (mọi người): Thấp 12, Vừa 24, Cao 60 = `persistPerRoomMax` */
  total: number;
  /** Của MỖI người = `persistPerPlayerMax` (máy chủ đã trần cùng số này) */
  perOwner: number;
  /** Vẽ sóng lan / vòng quay / quầng sáng hay chỉ hình nền */
  detail: boolean;
}

export function persistLimits(emitterBudget: number): PersistLimits {
  const b = Number.isFinite(emitterBudget) ? emitterBudget : 4;
  const total = b >= 24 ? SKILL_LIMITS.persistPerRoomMax : b >= 10 ? 24 : 12;
  return {
    total: Math.min(SKILL_LIMITS.persistPerRoomMax, total),
    perOwner: SKILL_LIMITS.persistPerPlayerMax,
    detail: b >= 10,
  };
}

/** Phần của một vật thể đang giữ mà `persistSlot` cần. */
export interface PersistSlotItem {
  plan: { id: number; by: string; mine: boolean };
  start: number;
}

/**
 * Chỗ cho vật thể mới: `-1` = thêm mới; còn lại = chỉ số cái cũ cần TÁI DÙNG. Cùng `id` thì cập nhật đúng cái đó (tin gửi lại). Chủ đã đủ phần (`perOwner`) thì thay cái dựng sớm nhất CỦA
 * CHỦ ĐÓ (máy chủ cũng đẩy cái cũ nhất); chưa mà tổng đã đủ thì thay cái sớm nhất của NGƯỜI KHÁC (không có thì sớm nhất). Không cấp phát, không sắp xếp.
 */
export function persistSlot(
  items: ReadonlyArray<PersistSlotItem>,
  incoming: { id: number; by: string; mine: boolean },
  limits: PersistLimits,
): number {
  let owned = 0;
  let oldestOwn = -1;
  let oldestOther = -1;
  let oldestAny = -1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.plan.id === incoming.id) return i;
    if (it.plan.by === incoming.by) {
      owned++;
      if (oldestOwn < 0 || it.start < items[oldestOwn]!.start) oldestOwn = i;
    }
    if (!it.plan.mine && (oldestOther < 0 || it.start < items[oldestOther]!.start)) oldestOther = i;
    if (oldestAny < 0 || it.start < items[oldestAny]!.start) oldestAny = i;
  }
  if (owned >= limits.perOwner) return oldestOwn;
  if (items.length >= limits.total) return oldestOther >= 0 ? oldestOther : oldestAny;
  return -1;
}
