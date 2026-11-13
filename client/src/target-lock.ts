/**
 * Khoá / chuyển mục tiêu cho cảm ứng (M5.1, #327). Hàm thuần: chọn con quái kế tiếp để khoá.
 * Server vẫn quyết định mọi kết quả; khoá chỉ đổi GÓC ĐÁNH mà client gửi (như `aim` tự ngắm hiện có).
 */

/** Tầm tối đa (px thế giới) để khoá một mục tiêu; vượt quá thì tự nhả khoá. */
export const LOCK_RANGE = 520;

export interface LockCandidate {
  id: string;
  /** Khoảng cách từ người chơi (px thế giới). */
  dist: number;
}

/**
 * Bấm nút khoá: chọn mục tiêu kế tiếp theo thứ tự GẦN -> XA (vòng lại), bỏ qua quái ngoài `range`.
 * - chưa khoá: lấy con gần nhất;
 * - đang khoá con X: lấy con liền sau X (xa hơn); hết thì quay về con gần nhất;
 * - chỉ còn đúng con đang khoá (không còn con nào khác): trả `null` = nhả khoá (bấm lần nữa là bỏ khoá);
 * - không có quái nào trong tầm: `null`.
 */
export function pickNextTarget(
  candidates: readonly LockCandidate[],
  currentId: string | null,
  range: number = LOCK_RANGE,
): string | null {
  return pickTarget(candidates, currentId, 1, range);
}

/**
 * Shift+Tab (bàn phím, #462): như `pickNextTarget` nhưng đi NGƯỢC (xa -> gần, vòng lại). Chưa khoá thì cũng lấy con GẦN nhất
 * (bấm Tab hay Shift+Tab lúc chưa có mục tiêu đều ra con gần nhất); đang khoá con gần nhất thì quay về con xa nhất.
 */
export function pickPrevTarget(
  candidates: readonly LockCandidate[],
  currentId: string | null,
  range: number = LOCK_RANGE,
): string | null {
  return pickTarget(candidates, currentId, -1, range);
}

function pickTarget(
  candidates: readonly LockCandidate[],
  currentId: string | null,
  step: 1 | -1,
  range: number,
): string | null {
  const list = candidates
    .filter((c) => Number.isFinite(c.dist) && c.dist <= range)
    .sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (list.length === 0) return null;
  if (currentId === null) return list[0].id;
  const i = list.findIndex((c) => c.id === currentId);
  if (i < 0) return list[0].id; // mục tiêu cũ đã mất / ra khỏi tầm: lấy con gần nhất
  if (list.length === 1) return null; // chỉ còn chính nó: nhả khoá
  return list[(i + step + list.length) % list.length].id;
}

/** Khoá còn hiệu lực không: quái còn đó (`dist` hữu hạn) và trong tầm. */
export function keepLock(dist: number | null, range: number = LOCK_RANGE): boolean {
  return dist !== null && Number.isFinite(dist) && dist <= range;
}
