// Thành tựu + danh hiệu theo LINH HỒN (M9.5 #1024, docs/PHAN_CONG_M9.md mục 5): phần THUẦN (không I/O, không đồng hồ): cấp thành tựu đến hạn, thưởng Duyên, danh hiệu đã mở.
// Ghi vào kho chạy ở `WorldRoom.socialUpdate` (một `SoulStore.update` nguyên tử: bộ đếm + cấp thành tựu + Duyên CÙNG MỘT lần ghi, nên sập máy không cấp một nửa); `grantDue` idempotent.
import {
  ACHIEVEMENT_BY_ID,
  DUYEN_CAP,
  achievementsDue,
  socialGrant,
  titleOf,
  type AchievementsMsg,
  type Soul,
  type SoulSocial,
} from "@tien-gioi/shared";

/**
 * Cấp MỌI thành tựu đã đủ điều kiện mà chưa có (`achievementsDue`), ghi `at`, cộng Duyên thưởng (kẹp `DUYEN_CAP`, cộng cả `duyenTotal`). Thuần: trả chân linh mới + id vừa cấp; không có gì
 * đến hạn thì trả lại ĐÚNG đối tượng cũ. Idempotent (gọi lại không cấp / không cộng Duyên lần nữa).
 */
export function grantDue(soul: Soul, at: string): { soul: Soul; granted: string[] } {
  let social: SoulSocial | undefined = soul.social;
  let duyen = soul.duyen;
  let total = soul.duyenTotal;
  const granted: string[] = [];
  for (const a of achievementsDue(social)) {
    const g = socialGrant(social, a.id, at);
    if (!g.granted) continue;
    social = g.social;
    granted.push(a.id);
    const d = a.reward?.duyen ?? 0;
    if (d > 0) {
      duyen = Math.min(DUYEN_CAP, duyen + d);
      total = Math.min(DUYEN_CAP, total + d);
    }
  }
  if (granted.length === 0) return { soul, granted };
  return { soul: { ...soul, social, duyen, duyenTotal: total }, granted };
}

/** Danh hiệu ĐÃ MỞ: `reward.titleId` của mọi thành tựu đã đạt (id thành tựu không còn trong dữ liệu thì bỏ qua) mà danh hiệu còn có thật. */
export function unlockedTitles(social: SoulSocial | undefined): Set<string> {
  const out = new Set<string>();
  if (!social) return out;
  for (const id of Object.keys(social.ach)) {
    const t = ACHIEVEMENT_BY_ID[id]?.reward?.titleId;
    if (t !== undefined && titleOf(t)) out.add(t);
  }
  return out;
}

/** Danh hiệu đang đeo nếu CÒN hợp lệ (đã mở và còn trong `TITLES`), không thì "" (chuỗi rỗng = không đeo). Dùng để đặt `Player.title`. */
export function wornTitle(social: SoulSocial | undefined): string {
  const id = social?.title;
  return typeof id === "string" && unlockedTitles(social).has(id) ? id : "";
}

/** Tin `achievements` cho chủ (đúng `Soul.social` rút gọn, KHÔNG kèm định nghĩa): bản SAO (người gửi không giữ tham chiếu vào chân linh). */
export function achievementsMsgOf(social: SoulSocial | undefined): AchievementsMsg {
  return {
    ach: { ...(social?.ach ?? {}) },
    counters: { ...(social?.counters ?? {}) },
    title: social?.title ?? null,
  };
}
