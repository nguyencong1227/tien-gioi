/**
 * Kế hoạch hiệu ứng TU LUYỆN (M5.2, #329): từ tin `fx` đã có (`levelup`, `breakfail`) và trạng thái đả tọa suy ra công thức + ưu tiên.
 * Hàm thuần (không Phaser) để test; `WorldScene` chỉ gọi và phát bằng `fx.play`. Không thêm tin / trường đồng bộ.
 */
import type { FxPriority } from "./budget";

/** Khoảng giữa hai lần phát đốm sáng của MỘT người đang đả tọa (ms), cộng thêm nhiễu để đám đông không đồng bộ. */
export const MOTE_INTERVAL_MS = 600;
export const MOTE_JITTER_MS = 200;

export interface FxPlan {
  /** Công thức phát lần lượt tại cùng một điểm. */
  recipes: readonly string[];
  priority: FxPriority;
}

/** Lên cấp (`major` = đột phá cảnh giới). Của mình: ưu tiên 2 (được chớp màn hình, không bị bỏ khi đông); người khác: 1. */
export function planLevelUp(major: boolean, mine: boolean): FxPlan {
  return {
    recipes: major
      ? ["breakthrough-ring", "breakthrough-pillar"]
      : ["levelup-ring", "levelup-glow"],
    priority: mine ? 2 : 1,
  };
}

/** Đột phá thất bại: khói tím. */
export function planBreakFail(mine: boolean): FxPlan {
  return { recipes: ["breakfail-smoke"], priority: mine ? 2 : 1 };
}

/** Ưu tiên đốm sáng đả tọa: của mình 1 (luôn thấy khi không đông), người khác 0 (chỉ tới 60 % trần). */
export function motePriority(isMe: boolean): FxPriority {
  return isMe ? 1 : 0;
}

/** Tới lúc phát đốm kế tiếp chưa; trả mốc mới (hoặc null nếu chưa tới). `rand01` tiêm vào để test tất định. */
export function nextMoteAt(nextAt: number | undefined, now: number, rand01: number): number | null {
  if (nextAt !== undefined && now < nextAt) return null;
  return now + MOTE_INTERVAL_MS + Math.floor(rand01 * MOTE_JITTER_MS);
}
