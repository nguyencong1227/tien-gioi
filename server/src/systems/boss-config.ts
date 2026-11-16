// Cờ bật bộ chiêu trùm (mục 42, `systems/boss.ts`) từ biến môi trường `BOSS_MOVES`. Mặc định TẮT: số liệu trong `BOSSES` mới là khung mẫu (T1), dữ liệu thật của E (T3)
// và cân bằng của D (T5) chưa xong, nên bản chạy thật chưa đổi hành vi trùm. Bật bằng `BOSS_MOVES=on` (hoặc `1`, `true`, `yes`) để thử trên máy dev / thử nghiệm.
// Thuần hàm (test được); `WorldRoom` đọc MỘT lần lúc dựng phòng.

/** `BOSS_MOVES` -> bật / tắt. Giá trị lạ (gõ nhầm) coi là TẮT: không bao giờ bật ngầm. */
export function bossMovesOf(env: NodeJS.ProcessEnv): boolean {
  const v = (env.BOSS_MOVES ?? "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true" || v === "yes";
}
