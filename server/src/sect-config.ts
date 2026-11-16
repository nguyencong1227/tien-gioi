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

/**
 * `SECT_EARN_WARMUP` (M8, docs/THIET_KE_TONG_MON.md mục 12.3): "chờ sang ngày mới kiếm được cống hiến" (thành viên vào tông CÙNG ngày chưa kiếm được; chống nhảy tông / lập tông mỗi ngày để lấy lại trần).
 * MẶC ĐỊNH BẬT. `off` (hoặc `0` / `false`) CHỈ để dev / E2E (kiểm trong một phiên); `warnings` nhắc khi tắt: KHÔNG BAO GIỜ tắt trên bản chạy thật. Giá trị lạ coi là BẬT (kèm cảnh báo).
 */
export interface EarnWarmup {
  on: boolean;
  warnings: string[];
}
export function earnWarmupOf(env: NodeJS.ProcessEnv): EarnWarmup {
  const raw = env.SECT_EARN_WARMUP;
  if (raw === undefined || raw.trim() === "") return { on: true, warnings: [] };
  const v = raw.trim().toLowerCase();
  if (v === "off" || v === "0" || v === "false")
    return {
      on: false,
      warnings: [
        "SECT_EARN_WARMUP=off: thành viên mới vào tông kiếm được cống hiến NGAY (chỉ để dev / E2E). KHÔNG BAO GIỜ tắt trên bản chạy thật: mở cửa cho nhảy tông lấy lại trần kiếm mỗi ngày.",
      ],
    };
  if (v === "on" || v === "1" || v === "true") return { on: true, warnings: [] };
  return { on: true, warnings: [`SECT_EARN_WARMUP='${raw}' không hiểu: giữ BẬT (chỉ nhận off / on).`] };
}

/** `newLifeLockOf(env).ms` (cho WorldRoom). */
export const newLifeLockMsOf = (env: NodeJS.ProcessEnv): number => newLifeLockOf(env).ms;
