// Hộp xác nhận DÙNG CHUNG cho thao tác khó hoàn tác (issue #779, docs/RA_SOAT_THAO_TAC.md): lớp THUẦN (không DOM) nên test được. Cùng khuôn với `inv-drop.ts`:
// nêu HẬU QUẢ bằng chữ, kiểm lại lúc xác nhận, "Giữ lại" được focus mặc định, Esc = Giữ lại, chống click ma 450 ms cho cảm ứng.
import {
  BREAK_FAIL_EXP_LOSS,
  REALMS,
  breakthroughChanceWith,
  canAttemptBreakthrough,
  type StatusEntry,
} from "@tien-gioi/shared";

/** Nội dung một hộp xác nhận. */
export interface ConfirmSpec {
  /** Câu hỏi chính, nêu tên + số lượng / hậu quả ("Bán Hồi Huyết Đan ×5 được 250 Linh thạch?") */
  text: string;
  /** Dòng nhắc thêm (hậu quả nặng, điều kiện), `null` = không có */
  warn: string | null;
  /** Chữ trên nút xác nhận ("Đột phá", "Bán", "Mở") */
  ok: string;
  /** Chữ trên nút giữ lại ("Chưa", "Giữ lại") */
  cancel: string;
}

/** Hộp bỏ qua mọi lần bấm trong chừng này ms đầu sau khi mở: `click` do trình duyệt tạo sau khi nhả ngón có thể rơi vào nút xác nhận mới hiện ("click ma"). */
export const ACT_CONFIRM_GUARD_MS = 450;

/** Hộp mở lúc `openedAt` còn trong cửa sổ chống click ma tại `now` (ms, cùng đồng hồ) không. Đồng hồ lùi / số hỏng coi như CÒN trong cửa sổ (an toàn: không xác nhận). */
export function inConfirmGuard(openedAt: number, now: number): boolean {
  const dt = now - openedAt;
  return !Number.isFinite(dt) || dt < 0 || dt < ACT_CONFIRM_GUARD_MS;
}

/** Phần cộng xác suất đột phá từ đan hộ đạo đang còn hiệu lực (`dao_ho` trong danh sách trạng thái của mình; 0 nếu không có / hỏng). */
export function breakAidRatio(active: readonly StatusEntry[]): number {
  let best = 0;
  for (const [id, ms, ratio] of active) {
    if (id === "dao_ho" && ms > 0 && typeof ratio === "number" && Number.isFinite(ratio))
      best = Math.max(best, ratio);
  }
  return best;
}

/** Kế hoạch đột phá chụp lúc bấm: so lại lúc xác nhận (`samePlan`) để lời trong hộp không còn đúng thì huỷ. */
export interface BreakPlan {
  realm: number;
  /** Xác suất thành công hiển thị (số nguyên %, đã cộng đan hộ đạo, kẹp trần) */
  pct: number;
  /** Phần đan hộ đạo đóng góp (số nguyên %, 0 nếu không có) */
  aidPct: number;
  spec: ConfirmSpec;
}

/**
 * Hộp xác nhận ĐỘT PHÁ (thất bại mất `BREAK_FAIL_EXP_LOSS` tu vi và nửa khí huyết, thành công thì lên cảnh giới mới: không hoàn tác). `null` khi chưa đủ
 * điều kiện thử (`canAttemptBreakthrough`: máy chủ sẽ từ chối KHÔNG mất gì nên cứ gửi để nhận lời báo, không hỏi). Xác suất tính bằng `breakthroughChanceWith`,
 * CÙNG hàm với máy chủ.
 */
export function breakthroughPlan(
  realm: number,
  tier: number,
  exp: number,
  expMax: number,
  active: readonly StatusEntry[],
): BreakPlan | null {
  if (!canAttemptBreakthrough(realm, tier, exp, expMax)) return null;
  const aid = breakAidRatio(active);
  const pct = Math.round(breakthroughChanceWith(realm, aid) * 100);
  const base = Math.round(breakthroughChanceWith(realm, 0) * 100);
  const aidPct = Math.max(0, pct - base);
  const from = REALMS[realm].name;
  const to = REALMS[realm + 1]?.name ?? "cảnh giới kế";
  const loss = Math.round(BREAK_FAIL_EXP_LOSS * 100);
  return {
    realm,
    pct,
    aidPct,
    spec: {
      text: `Đột phá ${from} lên ${to}: thành công ${pct}%.`,
      warn: `Thất bại mất ${loss}% tu vi và nửa khí huyết.${aidPct > 0 ? ` (Đã cộng ${aidPct}% từ đan hộ đạo.)` : ""}`,
      ok: "Đột phá",
      cancel: "Chưa",
    },
  };
}

/** Hai kế hoạch đột phá cùng cảnh giới và cùng xác suất không (lúc xác nhận so lại với lúc bấm). */
export function samePlan(a: BreakPlan | null, b: BreakPlan | null): boolean {
  return !!a && !!b && a.realm === b.realm && a.pct === b.pct;
}
