// Cờ bật bộ chiêu trùm (mục 42, `systems/boss.ts`) từ biến môi trường `BOSS_MOVES`. Mặc định TẮT (không đặt biến thì trùm chạy như cũ): dữ liệu thật của bốn trùm đã vào ở T3 #872 (v0.4.0) và
// bản chạy thật bật bằng `BOSS_MOVES=on` (hoặc `1`, `true`, `yes`) trong `.env`; máy dev / test không đặt thì giữ hành vi cũ.
// Thuần hàm (test được); `WorldRoom` đọc MỘT lần lúc dựng phòng.

const ON_VALUES = ["on", "1", "true", "yes"];
const OFF_VALUES = ["off", "0", "false", "no"];

/** `BOSS_MOVES` -> bật / tắt. Giá trị lạ (gõ nhầm) coi là TẮT: không bao giờ bật ngầm. */
export function bossMovesOf(env: NodeJS.ProcessEnv): boolean {
  const v = (env.BOSS_MOVES ?? "").trim().toLowerCase();
  return ON_VALUES.includes(v);
}

/**
 * Cảnh báo lúc khởi động khi `BOSS_MOVES` có giá trị mà không phải bật (`on` / `1` / `true` / `yes`) cũng không phải tắt (`off` / `0` / `false` / `no`): gõ nhầm (`enable`, `onn`) thì
 * trùm lặng lẽ chạy như cũ mà người vận hành tưởng đã bật bộ chiêu mới. Không đặt / rỗng: không cảnh báo (mặc định TẮT là đúng ý).
 */
export function bossMovesWarnings(env: NodeJS.ProcessEnv): string[] {
  const raw = (env.BOSS_MOVES ?? "").trim();
  if (raw === "") return [];
  const v = raw.toLowerCase();
  if (ON_VALUES.includes(v) || OFF_VALUES.includes(v)) return [];
  return [
    `BOSS_MOVES='${raw}' không hợp lệ (dùng on hoặc off): đang TẮT, trùm chạy như cũ (không có bộ chiêu nhiều chiêu).`,
  ];
}
