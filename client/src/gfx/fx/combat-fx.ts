/**
 * Kế hoạch hiệu ứng chiến đấu (M5.2, #329): từ tin `dmg` đã có (KHÔNG thêm tin / trường đồng bộ) suy ra công thức nào,
 * ưu tiên nào, chữ bay màu gì. Hàm THUẦN (không Phaser) nên test được; `WorldScene` chỉ gọi và phát bằng `fx.play`.
 *
 * "Của mình": `DmgMsg` không có người đánh (đổi giao thức là ngoài phạm vi), nên suy từ đòn ĐÁNH GẦN ĐÂY của chính mình:
 * mình vừa ra đòn trong `MY_HIT_WINDOW_MS` và chỗ trúng nằm trong tầm đòn đó. Suy sai (người khác đánh cùng con quái, cùng
 * lúc) chỉ khiến hiệu ứng được ưu tiên 2 / rung nhẹ, không ảnh hưởng kết quả (server vẫn quyết định mọi thứ).
 */
import type { FxPriority } from "./budget";
import { FX_COLOR } from "./recipes-combat";

/** Đòn "nặng": từ tỉ lệ này của khí huyết tối đa của mục tiêu (hoặc chí mạng). */
export const HEAVY_HIT_FRAC = 0.15;
/** Một lần tăng khí huyết từ tỉ lệ này của tối đa mới tính là "hồi máu" (đan dược...), không phải hồi tự nhiên. */
export const HEAL_JUMP_FRAC = 0.1;
/** Sau khi ra đòn, các `dmg` tới trong khoảng này coi là của mình (độ trễ mạng + một nhịp tick). */
export const MY_HIT_WINDOW_MS = 450;
/** Dung sai ngoài tầm đòn (px) khi đối chiếu chỗ trúng (quái có bán kính, đòn tới trễ một nhịp). */
export const MY_HIT_RANGE_SLACK = 80;

export interface HitInput {
  amount: number;
  crit: boolean;
  /** Mục tiêu là người chơi (không phải quái). */
  toPlayer: boolean;
  /** Mục tiêu là chính mình. */
  targetIsMe: boolean;
  /** Khí huyết tối đa của mục tiêu (0 / không rõ thì chỉ xét chí mạng). */
  targetMaxHp: number;
  /** Mình là người ra đòn (suy từ `isMyHit`). */
  mine: boolean;
}

export interface HitPlan {
  recipe: string;
  /** Ưu tiên ngân sách của hạt (và của rung: chỉ ưu tiên 2 mới rung). */
  priority: FxPriority;
  heavy: boolean;
}

export interface NumberPlan {
  text: string;
  color: number;
  size: number;
  priority: FxPriority;
}

export function isHeavyHit(amount: number, crit: boolean, maxHp: number): boolean {
  if (crit) return true;
  return maxHp > 0 && amount >= maxHp * HEAVY_HIT_FRAC;
}

/** Công thức hạt cho một lần trúng đòn. */
export function planHitFx(i: HitInput): HitPlan {
  const heavy = isHeavyHit(i.amount, i.crit, i.targetMaxHp);
  if (i.targetIsMe) {
    return { recipe: heavy ? "hurt-heavy" : "hurt-self", priority: 2, heavy };
  }
  // Mình đánh: ưu tiên 2 (không bị bỏ khi đông; đòn nặng được rung). Người khác: ưu tiên 1, KHÔNG rung màn hình của mình.
  const priority: FxPriority = i.mine ? 2 : 1;
  if (heavy) return { recipe: "hit-heavy", priority, heavy };
  return { recipe: i.crit ? "hit-crit" : "hit-spark", priority, heavy };
}

/** Chữ sát thương bay (màu / cỡ / ưu tiên). Giữ đúng kiểu cũ: mình bị đánh đỏ, chí mạng vàng lớn hơn. */
export function planHitNumber(i: HitInput): NumberPlan {
  return {
    text: `${i.crit ? "Bạo! " : ""}${i.amount}`,
    color: i.toPlayer ? FX_COLOR.hurt : i.crit ? FX_COLOR.crit : 0xffffff,
    size: i.crit ? 20 : 15,
    // Mình bị đánh hoặc mình đánh = ưu tiên 2 (không bao giờ bị bỏ khi đông); còn lại 1.
    priority: i.targetIsMe || i.mine ? 2 : 1,
  };
}

export interface MyAttack {
  /** Thời điểm ra đòn (ms, đồng hồ cảnh). */
  at: number;
  /** Tầm đòn (px). */
  range: number;
}

/** Đòn trúng tại (hx, hy) có phải của mình không (xem đầu tệp). */
export function isMyHit(
  last: MyAttack | null,
  now: number,
  me: { x: number; y: number },
  hit: { x: number; y: number },
): boolean {
  if (!last) return false;
  if (now - last.at > MY_HIT_WINDOW_MS || now < last.at) return false;
  return Math.hypot(hit.x - me.x, hit.y - me.y) <= last.range + MY_HIT_RANGE_SLACK;
}

/**
 * Hồi máu của CHÍNH MÌNH: khí huyết tăng một bước lớn (đan dược...) khi còn sống. Hồi tự nhiên (đả tọa 6 % / giây, theo
 * từng số nguyên) và hồi sinh (từ 0) không tính. Trả số máu hồi, hoặc 0.
 */
export function healAmount(
  prevHp: number,
  hp: number,
  maxHp: number,
  dead: boolean,
  frameMs: number,
): number {
  if (dead || prevHp <= 0 || maxHp <= 0 || frameMs > 500) return 0; // khung dài (tab nền) -> hồi tự nhiên dồn lại, bỏ
  const gain = hp - prevHp;
  return gain >= maxHp * HEAL_JUMP_FRAC ? gain : 0;
}

export function healNumber(amount: number): NumberPlan {
  return { text: `+${amount}`, color: FX_COLOR.heal, size: 16, priority: 2 };
}

/**
 * Quái biến khỏi state chỉ coi là GỤC khi còn gần mình hơn mức này (px). Server cũng xoá quái khỏi state khi nó rời vùng nhìn
 * (xa hơn `VIEW_EXIT` = 1300 px), mà màn hình rất rộng / thu phóng thấp vẫn thấy tới đó: quái còn sống rời vùng nhìn không được
 * "tan thành điểm sáng". Khớp `VIEW_ENTER` của `server/src/systems/interest.ts` (test giữ cho hai số bằng nhau; client không
 * import được từ server).
 */
export const MON_DEATH_MAX_DIST = 1100;

export function isMonsterDeath(distToMe: number): boolean {
  return Number.isFinite(distToMe) && distToMe < MON_DEATH_MAX_DIST;
}

/** Hai chữ bay trên CÙNG một mục tiêu cách nhau không quá khoảng này (ms) thì xếp lệch lên để khỏi đè nhau. */
export const LANE_WINDOW_MS = 450;
/** Số hàng chữ lệch lên tối đa trước khi quay về hàng 0, và độ lệch mỗi hàng (px thế giới). */
export const LANE_COUNT = 4;
export const LANE_STEP_PX = 12;

/**
 * Xếp hàng chữ bay theo mục tiêu (nit của A ở #349: "Bạo!" chồng số khác khi dồn đòn): lần đầu (hoặc sau `LANE_WINDOW_MS` yên
 * ắng) ở hàng 0, mỗi chữ kế tiếp trong cửa sổ lên một hàng (0..LANE_COUNT-1 rồi quay lại). Trả độ lệch dọc (px, âm = lên).
 * Bộ nhớ nhỏ: mục đã quá hạn bị dọn khi số mục vượt `LANE_PRUNE_AT`. Thuần (đồng hồ truyền vào) nên test tất định.
 */
export const LANE_PRUNE_AT = 32;
export class FloatLanes {
  private readonly m = new Map<string, { lane: number; at: number }>();

  offset(key: string, now: number): number {
    if (this.m.size > LANE_PRUNE_AT) {
      for (const [k, v] of this.m) if (!(now - v.at <= LANE_WINDOW_MS)) this.m.delete(k);
    }
    const prev = this.m.get(key);
    const lane =
      prev && now >= prev.at && now - prev.at <= LANE_WINDOW_MS ? (prev.lane + 1) % LANE_COUNT : 0;
    this.m.set(key, { lane, at: now });
    return lane === 0 ? 0 : -lane * LANE_STEP_PX; // tránh -0
  }

  /** Số mục đang nhớ (để test dọn bộ nhớ). */
  size(): number {
    return this.m.size;
  }

  clear(): void {
    this.m.clear();
  }
}
