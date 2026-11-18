/**
 * ĐẠN BAY của người chơi (`FxMsg` `pbolt`, mục 51, CT11b bước 2; máy chủ CT3 #1108): MỖI tin là MỘT đoạn thẳng, từ (x, y) theo `angle` với `speed` px/giây trong `ms`
 * (máy chủ đã tính tới ô chặn / trúng / hết tầm). Client KHÔNG mô phỏng va chạm hay nảy: xuyên thì cùng một đoạn, nảy thì máy chủ gửi đoạn MỚI từ chỗ nảy đúng lúc đạn tới.
 * Sát thương đã có `dmg` riêng, ở đây chỉ vẽ. Hàm THUẦN (không Phaser, không `Math.random`, không cấp phát trong vòng vẽ): `pbolt-layer.ts` lo Graphics.
 *
 * Không tin tin nhắn: kiểu / số hữu hạn / biên toạ độ kiểm ở `parsePBolt` (sai thì bỏ CẢ tin); `ms` kẹp [1, `PBOLT_MS_MAX`], `speed` kẹp theo giới hạn dữ liệu chiêu
 * (`SKILL_LIMITS`). Trần số đạn đang vẽ theo bậc chất lượng và THEO CHỦ (`pboltLimits` + `pboltSlot`): 16 viên / người x nhiều người không được phình thành vài trăm hình.
 */
import { SKILL_LIMITS } from "@tien-gioi/shared";
import { castTint } from "./cast-fx";
import type { FxPriority } from "./budget";
import type { FxPoint } from "./skill-fx";

/** Công thức hạt ở CUỐI mỗi đoạn (chỗ chạm tường / mục tiêu / điểm nảy), xem `recipes-ct2.ts`. */
export const PBOLT_HIT_RECIPE = "pbolt-hit";
/** `ms` của một đoạn kẹp trong khoảng này (máy chủ: quãng bay <= `boltRangeMax` / `boltSpeedMin` ~ 1,9 giây; chặn rộng hơn để không bỏ tin hợp lệ). */
export const PBOLT_MS_MIN = 1;
export const PBOLT_MS_MAX = 6000;
/** Sau khi tới chỗ dừng, hình mờ nhanh trong chừng này (ms) rồi gỡ (đạn nảy: đoạn mới đã bắt đầu từ chỗ đó). */
export const PBOLT_FADE_MS = 140;
/** Biên toạ độ chấp nhận (px): ngoài khoảng này coi là tin hỏng. */
const COORD_LIMIT = 100_000;
/** Độ dài tối đa của `by` / `skill` chấp nhận (id thật ngắn hơn nhiều; chặn chuỗi khổng lồ trong tin hỏng). */
const ID_MAX = 64;
/** Số đạn của MỘT người tối đa đang bay (khớp `MAX_PLAYER_BOLTS_PER_PLAYER` của máy chủ). */
export const PBOLT_MINE_MAX = 16;
/** Bước vệt đuôi (px), bán kính lõi và quầng sáng của đạn. */
export const PBOLT_TRAIL_STEP = 7;
export const PBOLT_CORE = 3.5;
export const PBOLT_GLOW = 8;
/** Đạn bay lệch lên một chút so với chân (khớp `cast-fx`). */
export const PBOLT_Y_OFFSET = -10;

export interface PBoltMsgClean {
  by: string;
  skill: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  ms: number;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Tin `pbolt` đã làm sạch; sai dạng thì `null`. `speed` phải > 0 (rồi kẹp vào [`boltSpeedMin`, `boltSpeedMax`]); `ms` kẹp [`PBOLT_MS_MIN`, `PBOLT_MS_MAX`] và làm tròn;
 * toạ độ trong biên; `by` / `skill` là chuỗi không rỗng, ngắn.
 */
export function parsePBolt(raw: unknown): PBoltMsgClean | null {
  if (!isObj(raw)) return null;
  const { by, skill, x, y, angle, speed, ms } = raw;
  if (typeof by !== "string" || by === "" || by.length > ID_MAX) return null;
  if (typeof skill !== "string" || skill === "" || skill.length > ID_MAX) return null;
  if (!num(x) || !num(y) || !num(angle) || !num(speed) || !num(ms)) return null;
  if (Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) return null;
  if (!(speed > 0)) return null;
  return {
    by,
    skill,
    x,
    y,
    angle,
    speed: Math.min(SKILL_LIMITS.boltSpeedMax, Math.max(SKILL_LIMITS.boltSpeedMin, speed)),
    ms: Math.min(PBOLT_MS_MAX, Math.max(PBOLT_MS_MIN, Math.round(ms))),
  };
}

/** Một đoạn đạn sẵn sàng vẽ: tin sạch + màu theo hệ của chiêu + của mình hay của người khác. */
export interface PBoltPlan extends PBoltMsgClean {
  tint: number;
  mine: boolean;
}

export function pboltPlan(m: PBoltMsgClean, element: unknown, mine: boolean): PBoltPlan {
  return { ...m, tint: castTint(element), mine };
}

/** Quãng đường (px) cả đoạn: `speed x ms / 1000`. */
export function pboltLength(p: Pick<PBoltMsgClean, "speed" | "ms">): number {
  return (p.speed * p.ms) / 1000;
}

/** Quãng đã bay sau `elapsed` ms: không âm, dừng ở cuối đoạn (đạn không bay quá chỗ máy chủ đã tính). */
export function pboltTravelled(p: Pick<PBoltMsgClean, "speed" | "ms">, elapsed: number): number {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.min(pboltLength(p), (p.speed * elapsed) / 1000);
}

export interface Pt {
  x: number;
  y: number;
}

/** Vị trí đạn sau `elapsed` ms (ghi vào `out`, không cấp phát). */
export function pboltPosition(out: Pt, p: PBoltMsgClean, elapsed: number): Pt {
  const d = pboltTravelled(p, elapsed);
  out.x = p.x + Math.cos(p.angle) * d;
  out.y = p.y + Math.sin(p.angle) * d;
  return out;
}

/** Điểm cuối đoạn (chỗ chạm tường / mục tiêu / điểm nảy). */
export function pboltEnd(p: PBoltMsgClean): Pt {
  return pboltPosition({ x: 0, y: 0 }, p, p.ms);
}

/** Còn vẽ không: bay hết `ms` rồi mờ trong `PBOLT_FADE_MS`. */
export function pboltAlive(p: Pick<PBoltMsgClean, "ms">, elapsed: number): boolean {
  return elapsed < p.ms + PBOLT_FADE_MS;
}

/** Độ đậm: 1 khi đang bay, về 0 trong `PBOLT_FADE_MS` sau khi tới chỗ dừng. */
export function pboltAlpha(p: Pick<PBoltMsgClean, "ms">, elapsed: number): number {
  if (elapsed <= p.ms) return 1;
  return Math.min(1, Math.max(0, 1 - (elapsed - p.ms) / PBOLT_FADE_MS));
}

/** Hạt MỘT lần ở cuối đoạn (đúng lúc đạn tới): bụi chạm / chớp nảy. Của mình ưu tiên 2 (không bị bỏ khi đông), người khác 1. */
export function planPBoltEnd(p: PBoltPlan): FxPoint[] {
  const end = pboltEnd(p);
  const priority: FxPriority = p.mine ? 2 : 1;
  return [
    {
      recipe: PBOLT_HIT_RECIPE,
      x: end.x,
      y: end.y + PBOLT_Y_OFFSET,
      angle: p.angle,
      tint: p.tint,
      priority,
      delayMs: p.ms,
    },
  ];
}

/** Trần số đạn vẽ cùng lúc và chi tiết, theo ngân sách emitter của bậc chất lượng. */
export interface PBoltLimits {
  /** Tổng đạn đang vẽ (mọi người) */
  total: number;
  /** Đạn của MỖI người khác */
  perOther: number;
  /** Đạn của chính mình (không bị bóp bởi bậc chất lượng, máy chủ đã trần 16) */
  perMine: number;
  /** Vẽ vệt đuôi + quầng sáng hay chỉ lõi */
  detail: boolean;
  /** Số chấm vệt đuôi (0 khi không chi tiết) */
  trail: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Thấp (4) -> 8 tổng / 2 mỗi người, không đuôi; Vừa (10) -> 10 / 3, đuôi 3; Cao (24) -> 24 / 6, đuôi 4. */
export function pboltLimits(emitterBudget: number): PBoltLimits {
  const b = Number.isFinite(emitterBudget) ? emitterBudget : 4;
  return {
    total: clamp(Math.round(b), 8, 32),
    perOther: clamp(Math.round(b / 4), 2, 6),
    perMine: PBOLT_MINE_MAX,
    detail: b >= 10,
    trail: b >= 24 ? 4 : b >= 10 ? 3 : 0,
  };
}

/** Phần của một đạn đang giữ mà `pboltSlot` cần (khớp `PBoltPlan` + lúc nhận tin). */
export interface PBoltSlotItem {
  plan: { by: string; mine: boolean };
  start: number;
}

/**
 * Chỗ cho đạn mới: `-1` = thêm mới; còn lại = chỉ số viên cũ cần TÁI DÙNG (bỏ tin mới còn tệ hơn vẽ thay viên cũ: đạn là thông tin về mối đe doạ / đòn của mình).
 * Chủ đã đủ phần của mình (`perMine` / `perOther`) thì thay viên bay lâu nhất CỦA CHỦ ĐÓ; chưa mà tổng đã đủ thì thay viên bay lâu nhất của NGƯỜI KHÁC (không có thì
 * viên lâu nhất). Không cấp phát, không sắp xếp.
 */
export function pboltSlot(
  items: ReadonlyArray<PBoltSlotItem>,
  incoming: { by: string; mine: boolean },
  limits: PBoltLimits,
): number {
  let owned = 0;
  let oldestOwn = -1;
  let oldestOther = -1;
  let oldestAny = -1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.plan.by === incoming.by) {
      owned++;
      if (oldestOwn < 0 || it.start < items[oldestOwn]!.start) oldestOwn = i;
    }
    if (!it.plan.mine && (oldestOther < 0 || it.start < items[oldestOther]!.start)) oldestOther = i;
    if (oldestAny < 0 || it.start < items[oldestAny]!.start) oldestAny = i;
  }
  const cap = incoming.mine ? limits.perMine : limits.perOther;
  if (owned >= cap) return oldestOwn;
  if (items.length >= limits.total) return oldestOther >= 0 ? oldestOther : oldestAny;
  return -1;
}
