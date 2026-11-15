// Tốc độ gõ chữ của hộp thoại NPC theo THỜI GIAN thật, không theo số lần timer chạy (#694).
// Bản cũ cộng 2 ký tự mỗi lần `setInterval(28 ms)` chạy: khi luồng chính bận (điện thoại yếu, runner CI ~6 FPS, `taskset -c 0`) timer chạy thưa theo
// tốc độ khung nên một đoạn thoại dài mất hàng chục giây để hiện hết (E2E `e2e:ban-phim` chờ lựa chọn của Lão Dược Sư quá 15 s, gợi ý "tua chữ"
// vẫn hiện). Tính số ký tự từ thời gian đã trôi thì tốc độ danh nghĩa giữ nguyên ở máy nhanh và máy chậm theo kịp (chữ nhảy nhiều ký tự mỗi lần).

/** 1 ký tự mỗi 14 ms (= 2 ký tự mỗi 28 ms như bản cũ ở máy nhanh). */
export const TYPE_MS_PER_CHAR = 14;

/** Số ký tự đã gõ sau `elapsedMs` (kẹp trong [0, total]; thời gian âm / không hữu hạn tính là 0). */
export function typedLength(
  elapsedMs: number,
  total: number,
  msPerChar: number = TYPE_MS_PER_CHAR,
): number {
  if (!(total > 0)) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (!(msPerChar > 0)) return total;
  return Math.min(total, Math.floor(elapsedMs / msPerChar));
}
