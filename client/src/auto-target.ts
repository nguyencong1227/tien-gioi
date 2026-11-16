/**
 * Chế độ nhắm (QUYET_DINH_M3 mục 26): "Tự động — gần nhất" (MẶC ĐỊNH) và "Thủ công — khoá". Hàm THUẦN (không DOM, không Phaser) để test được; `WorldScene` chỉ
 * đưa ứng viên vào và vẽ kết quả. Chỉ phía client: server vẫn quyết định mọi kết quả, nhắm chỉ đổi GÓC mà client gửi (như `aim` / khoá mục tiêu đã có).
 *
 * Chế độ Tự động: mục tiêu luôn là đối tượng hợp lệ GẦN nhất trong tầm, có ĐỘ TRỄ CHỐNG NHẢY (`switchMargin`): đã có mục tiêu thì chỉ đổi khi đối tượng mới
 * gần hơn RÕ RỆT; mục tiêu cũ chết / ra khỏi tầm / ra khỏi màn hình (không còn trong ứng viên) thì chọn lại ngay con gần nhất. Tab / Shift+Tab / nút Mục tiêu vẫn
 * chọn tay được (`pinned`): giữ tới khi mục tiêu mất hoặc Esc, rồi quay lại tự động.
 */
import { LOCK_RANGE, pickNextTarget, pickPrevTarget } from "./target-lock";

export type AimMode = "auto" | "manual";

/** Khoá lưu theo THIẾT BỊ (localStorage), như chất lượng đồ hoạ. */
export const AIM_MODE_STORAGE_KEY = "tg_aim_mode";
/** Mặc định kể cả người chơi cũ chưa từng đổi (người dùng chốt ở mục 26). */
export const DEFAULT_AIM_MODE: AimMode = "auto";

/** Giá trị đọc từ nơi lưu (có thể `null` / hỏng / do bản khác ghi): chỉ đúng "manual" mới là thủ công, còn lại là mặc định tự động. */
export function parseAimMode(raw: unknown): AimMode {
  return raw === "manual" ? "manual" : DEFAULT_AIM_MODE;
}

/** Nhãn hiển thị trong Cài đặt và toast đổi chế độ. */
export const AIM_MODE_LABEL: Record<AimMode, string> = {
  auto: "Tự động — gần nhất",
  manual: "Thủ công — khoá mục tiêu",
};

/** Chế độ kia (phím tắt đổi chế độ). */
export function otherAimMode(m: AimMode): AimMode {
  return m === "auto" ? "manual" : "auto";
}

/**
 * Độ trễ chống nhảy: đối tượng mới phải gần hơn mục tiêu hiện tại ít nhất `max(SWITCH_MARGIN_PX, SWITCH_MARGIN_RATIO x khoảng cách hiện tại)`. Lấy số LỚN HƠN của
 * hai ngưỡng (người dùng nêu "vd ≥ 15% hoặc ≥ 24 px"): sát người (60 px) thì sàn 24 px chặn nhấp nháy do quái xoay quanh, xa (400 px) thì 15% = 60 px chặn
 * nhấp nháy do chênh lệch nhỏ giữa hai con đứng sát nhau.
 */
export const SWITCH_MARGIN_RATIO = 0.15;
export const SWITCH_MARGIN_PX = 24;

export function switchMargin(dist: number): number {
  return Math.max(SWITCH_MARGIN_PX, SWITCH_MARGIN_RATIO * dist);
}

/** Đối tượng đang bị đánh dở được coi là gần hơn chừng này khi so sánh (ưu tiên giữ mục tiêu đang đánh nếu khoảng cách gần bằng nhau). */
export const ENGAGED_FACTOR = 0.85;
/** Quái vừa trúng đòn trong chừng này ms thì tính là "đang bị đánh dở" (`DmgMsg` không nêu người đánh nên chỉ xấp xỉ; chỉ dùng để phân thắng bại khi khoảng cách gần bằng nhau). */
export const ENGAGED_MS = 2000;

export interface AutoCandidate {
  id: string;
  /** Khoảng cách từ người chơi (px thế giới). */
  dist: number;
  /** Đang bị đánh dở (vừa trúng đòn); chỉ để phân thắng bại khi khoảng cách gần bằng nhau. */
  engaged?: boolean;
}

/**
 * Chọn mục tiêu cho chế độ Tự động. `currentId` = mục tiêu hiện tại (`null` nếu chưa có). Ứng viên ngoài `range` hoặc khoảng cách hỏng bị bỏ.
 * - không còn ứng viên: `null`;
 * - mục tiêu hiện tại không còn trong ứng viên: chọn con gần nhất (đang bị đánh dở thì tính gần hơn `ENGAGED_FACTOR`);
 * - còn: giữ, trừ khi con gần nhất gần hơn nó ít nhất `switchMargin`.
 * Kết quả tất định (hoà khoảng cách thì theo `id`).
 */
export function autoPickTarget(
  candidates: readonly AutoCandidate[],
  currentId: string | null,
  range: number = LOCK_RANGE,
): string | null {
  const list = candidates
    .filter((c) => Number.isFinite(c.dist) && c.dist >= 0 && c.dist <= range)
    .map((c) => ({ id: c.id, dist: c.dist, eff: c.engaged ? c.dist * ENGAGED_FACTOR : c.dist }))
    .sort((a, b) => a.eff - b.eff || a.dist - b.dist || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (list.length === 0) return null;
  const best = list[0];
  const cur = currentId === null ? undefined : list.find((c) => c.id === currentId);
  if (!cur) return best.id;
  if (best.id === cur.id) return cur.id;
  return cur.eff - best.eff >= switchMargin(cur.eff) ? best.id : cur.id;
}

/** Trạng thái mục tiêu của người chơi. `pinned` = chọn tay (Tab / nút) lúc đang ở chế độ Tự động. */
export interface TargetState {
  id: string | null;
  pinned: boolean;
}

export const NO_TARGET: TargetState = { id: null, pinned: false };

/**
 * Một nhịp cập nhật (gọi mỗi khung hoặc ~10 lần / giây).
 * - Thủ công: KHÔNG tự chọn; chỉ nhả khoá khi mục tiêu không còn trong ứng viên (hành vi cũ của `syncTargetLock`).
 * - Tự động: mục tiêu chọn tay còn trong ứng viên thì giữ; mất thì bỏ ghim rồi chọn tự động; không ghim thì `autoPickTarget`.
 */
export function stepTarget(
  mode: AimMode,
  state: TargetState,
  candidates: readonly AutoCandidate[],
  range: number = LOCK_RANGE,
): TargetState {
  const inRange = (id: string | null) =>
    id !== null &&
    candidates.some((c) => c.id === id && Number.isFinite(c.dist) && c.dist <= range);
  if (mode === "manual") {
    return inRange(state.id) ? { id: state.id, pinned: false } : NO_TARGET;
  }
  if (state.pinned && inRange(state.id)) return state;
  return { id: autoPickTarget(candidates, state.pinned ? null : state.id, range), pinned: false };
}

/**
 * Tab (`step` = 1) / Shift+Tab (`step` = -1) / nút Mục tiêu. Thủ công: như cũ (xoay vòng gần -> xa, hết vòng thì nhả khoá).
 * Tự động: chọn tay TẠM THỜI (ghim); hết vòng (chỉ còn đúng con đang chọn) thì bỏ ghim, quay lại tự động.
 */
export function cycleTarget(
  mode: AimMode,
  state: TargetState,
  candidates: readonly AutoCandidate[],
  step: 1 | -1 = 1,
  range: number = LOCK_RANGE,
): TargetState {
  const pick = step === 1 ? pickNextTarget : pickPrevTarget;
  const id = pick(candidates, state.id, range);
  if (mode === "manual") return { id, pinned: false };
  if (id === null) return stepTarget("auto", NO_TARGET, candidates, range);
  return { id, pinned: true };
}

/**
 * Esc khi không còn bảng nào để đóng. Thủ công: bỏ khoá nếu đang khoá. Tự động: chỉ có nghĩa khi đang ghim tay (bỏ ghim, quay lại tự động);
 * mục tiêu do tự động chọn thì Esc không làm gì (vừa bỏ là chọn lại ngay) nên KHÔNG tính là đã xử lý.
 */
export function escapeTarget(
  mode: AimMode,
  state: TargetState,
): { state: TargetState; handled: boolean } {
  if (mode === "manual") return { state: NO_TARGET, handled: state.id !== null };
  if (state.pinned) return { state: NO_TARGET, handled: true };
  return { state, handled: false };
}
