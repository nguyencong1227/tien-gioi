// Cấu hình tông môn đọc từ môi trường (docs/THIET_KE_TONG_MON.md mục 11.7).
//
// `SECT_NEWLIFE_LOCK_HOURS`: cờ "kiếp mới chưa được rút". Bật thì người chơi có kiếp hiện tại (`life.playMs`) nhỏ hơn chừng đó giờ KHÔNG rút được kho đồ và
// kho Linh thạch của tông môn (chặn kẽ hở "góp đồ rồi chết thật, đầu thai, rút lại làm thừa kế"). Mặc định 0 = TẮT: người dùng chưa chốt (QUYET_DINH_M3
// mục 27), nên đầu thai xong vẫn rút theo luật chức vụ.
const MS_PER_HOUR = 3_600_000;
/** Trần để một giá trị gõ nhầm (vd 99999) không khoá kho vĩnh viễn: 30 ngày. */
export const NEWLIFE_LOCK_MAX_HOURS = 24 * 30;

export interface NewLifeLock {
  /** ms (0 = tắt) */
  ms: number;
  warnings: string[];
}

/** Đọc `SECT_NEWLIFE_LOCK_HOURS`: số giờ không âm (có thể lẻ); thiếu / rỗng / hỏng thì 0 (kèm cảnh báo nếu hỏng); quá `NEWLIFE_LOCK_MAX_HOURS` thì kẹp. */
export function newLifeLockOf(env: NodeJS.ProcessEnv): NewLifeLock {
  const raw = env.SECT_NEWLIFE_LOCK_HOURS;
  if (raw === undefined || raw.trim() === "") return { ms: 0, warnings: [] };
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) {
    return {
      ms: 0,
      warnings: [`SECT_NEWLIFE_LOCK_HOURS='${raw}' không phải số giờ không âm: bỏ qua (cờ TẮT).`],
    };
  }
  if (n > NEWLIFE_LOCK_MAX_HOURS) {
    return {
      ms: NEWLIFE_LOCK_MAX_HOURS * MS_PER_HOUR,
      warnings: [
        `SECT_NEWLIFE_LOCK_HOURS=${n} quá lớn: kẹp về ${NEWLIFE_LOCK_MAX_HOURS} giờ (30 ngày).`,
      ],
    };
  }
  return { ms: Math.floor(n * MS_PER_HOUR), warnings: [] };
}

/** `newLifeLockOf(env).ms` (cho WorldRoom). */
export const newLifeLockMsOf = (env: NodeJS.ProcessEnv): number => newLifeLockOf(env).ms;
