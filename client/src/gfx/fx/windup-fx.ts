/**
 * CHIÊU VẬN ở client (`SkillDef.windupMs`, mục 51, CT5 lát 2 #1112 + CT11b bước 3): người dùng chiêu vận khí `windupMs` rồi MỚI đáp (hiệu ứng hình + sát thương). Máy chủ gửi `fx cast`
 * lúc BẮT ĐẦU vận (không gửi gì khi đáp với hình cũ; hình mới `pbolt` / `chain` / `zone`... tự có `fx` lúc đáp) và KHÔNG gửi gì khi vận bị ngắt (choáng, chết, hồn lìa xác, qua cổng):
 * client tự dựng vòng TỤ KHÍ theo `windupMs` của chiêu, hoãn hiệu ứng đáp tới hết `windupMs`, và tự tắt khi thấy người vận chết / rời vùng nhìn / (của mình) bị choáng.
 *
 * THUẦN (không Phaser, không `Math.random`, không đồng hồ máy): `windup-layer.ts` lo Graphics. Client không quyết kết quả: sát thương luôn là `dmg` của máy chủ; hết hạn vận mà máy chủ
 * huỷ ngầm (vd người khác bị choáng, mình chưa biết) thì chỉ thừa MỘT hiệu ứng đáp không có sát thương, không sai số liệu.
 */
import { SKILL_LIMITS, WINDUP_MAX_MS, type SkillDef } from "@tien-gioi/shared";
import { castTint } from "./cast-fx";

/** Vòng tụ khí thu từ bán kính ngoài vào bán kính trong (px) trong `windupMs`; vòng cung tiến độ chạy quanh vòng. */
export const WINDUP_R_OUT = 46;
export const WINDUP_R_IN = 12;
/** Chớp lúc đáp / mờ nhanh lúc bị huỷ (ms). */
export const WINDUP_RELEASE_MS = 170;
export const WINDUP_FIZZLE_MS = 140;
/** Vòng bay lệch lên một chút so với chân (khớp hạt khác, `cast-fx`). */
export const WINDUP_Y_OFFSET = -10;
/** Biên toạ độ chấp nhận (px) và độ dài tối đa của id: ngoài khoảng này coi là tin hỏng. */
const COORD_LIMIT = 100_000;
const ID_MAX = 64;

/**
 * Thời gian vận (ms) của chiêu, KẸP đúng như máy chủ (`windupMsOf`): 0 = TỨC THỜI (không khai, không hữu hạn, <= 0); còn lại trong [`windupMin`, `WINDUP_MAX_MS`].
 * Máy chủ đáp sau đúng chừng này (từ lúc bắt đầu), nên client dùng CÙNG số để hoãn hiệu ứng đáp.
 */
export function windupMsOfDef(def: Pick<SkillDef, "windupMs">): number {
  const v = def.windupMs;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(WINDUP_MAX_MS, Math.max(SKILL_LIMITS.windupMin, v));
}

/** Một lần vận khí đang diễn ra, dựng từ tin `fx cast` + chiêu. */
export interface WindupPlan {
  by: string;
  skill: string;
  /** Chỗ bắt đầu (chỉ để đặt vòng nếu chưa biết vị trí người vận) */
  x: number;
  y: number;
  /** Hướng lúc bắt đầu (máy chủ đáp theo hướng này) và tầm thật (px) của tin `cast` */
  angle: number;
  range: number;
  ms: number;
  tint: number;
  mine: boolean;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Kế hoạch vận từ tin `cast` (kiểu / số hữu hạn / biên toạ độ) và chiêu `def`; `null` khi chiêu tức thời (`windupMsOfDef` = 0) hoặc tin hỏng. `range` âm bị kẹp về 0.
 */
export function planWindup(raw: unknown, def: SkillDef, mine: boolean): WindupPlan | null {
  const ms = windupMsOfDef(def);
  if (ms <= 0) return null;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const { by, skill, x, y, angle, range } = m;
  if (typeof by !== "string" || by === "" || by.length > ID_MAX) return null;
  if (typeof skill !== "string" || skill === "" || skill.length > ID_MAX) return null;
  if (!num(x) || !num(y) || !num(angle) || !num(range)) return null;
  if (Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) return null;
  return {
    by,
    skill,
    x,
    y,
    angle,
    range: Math.max(0, range),
    ms,
    tint: castTint(def.element),
    mine,
  };
}

/** Tiến độ vận 0..1 sau `elapsed` ms (kẹp; thời gian âm / không hữu hạn = 0). */
export function windupProgress(ms: number, elapsed: number): number {
  if (!(ms > 0) || !Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.min(1, elapsed / ms);
}

/** Bán kính vòng tụ khí tại tiến độ `p`: thu nhanh lúc đầu rồi chậm dần (dễ thấy "tụ" vào trong). */
export function windupRadius(p: number): number {
  const q = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0));
  return WINDUP_R_OUT + (WINDUP_R_IN - WINDUP_R_OUT) * (1 - (1 - q) * (1 - q));
}

/** Độ đậm vòng tại tiến độ `p`: đậm dần tới lúc đáp; của mình đậm hơn một chút (người chơi cần thấy mình đang vận). */
export function windupAlpha(p: number, mine: boolean): number {
  const q = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0));
  return (mine ? 0.5 : 0.35) + 0.45 * q;
}

/** Lý do HUỶ vận mà client nhìn thấy được. Của người khác chỉ thấy chết / rời vùng nhìn; của mình thấy cả choáng. */
export interface WindupWatch {
  /** Người vận không còn trong state (rời phòng / ra ngoài vùng nhìn) */
  gone: boolean;
  dead: boolean;
  /** Chỉ của MÌNH (trạng thái choáng chỉ gửi cho chủ) */
  stunned: boolean;
}

export function windupCancelled(w: WindupWatch): boolean {
  return w.gone || w.dead || w.stunned;
}

/** Trần số vòng vận đang vẽ theo ngân sách emitter (Thấp 4 -> 4, Vừa 10 -> 5, Cao 24 -> 12, tối đa 16); `detail`: vẽ thêm quầng sáng. */
export interface WindupLimits {
  total: number;
  detail: boolean;
}

export function windupLimits(emitterBudget: number): WindupLimits {
  const b = Number.isFinite(emitterBudget) ? emitterBudget : 4;
  return { total: Math.min(16, Math.max(4, Math.round(b / 2))), detail: b >= 10 };
}

export interface WindupSlotItem {
  plan: { by: string; mine: boolean };
  start: number;
}

/**
 * Chỗ cho một lần vận mới: `-1` = thêm mới, còn lại = chỉ số cần THAY. Mỗi người chỉ vận MỘT chiêu một lúc (máy chủ không cho dùng chiêu khác khi đang vận) nên lần vận mới của
 * cùng người thay lần cũ (đã hết hoặc bị huỷ ngầm); đủ trần thì thay vòng của NGƯỜI KHÁC cũ nhất (không có thì cũ nhất), vòng của mình luôn được giữ chỗ.
 */
export function windupSlot(
  items: ReadonlyArray<WindupSlotItem>,
  incoming: { by: string; mine: boolean },
  limits: WindupLimits,
): number {
  let oldestOther = -1;
  let oldestAny = -1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.plan.by === incoming.by) return i;
    if (!it.plan.mine && (oldestOther < 0 || it.start < items[oldestOther]!.start)) oldestOther = i;
    if (oldestAny < 0 || it.start < items[oldestAny]!.start) oldestAny = i;
  }
  if (items.length < limits.total) return -1;
  return oldestOther >= 0 ? oldestOther : oldestAny;
}
