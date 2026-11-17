// Cờ bật bộ chiêu trùm (mục 42, `systems/boss.ts`) từ biến môi trường `BOSS_MOVES`. Mặc định TẮT (không đặt biến thì trùm chạy như cũ): dữ liệu thật của bốn trùm đã vào ở T3 #872 (v0.4.0) và
// bản chạy thật bật bằng `BOSS_MOVES=on` (hoặc `1`, `true`, `yes`) trong `.env`; máy dev / test không đặt thì giữ hành vi cũ.
// Thuần hàm (test được); `WorldRoom` đọc MỘT lần lúc dựng phòng.

/** `BOSS_MOVES` -> bật / tắt. Giá trị lạ (gõ nhầm) coi là TẮT: không bao giờ bật ngầm. */
export function bossMovesOf(env: NodeJS.ProcessEnv): boolean {
  const v = (env.BOSS_MOVES ?? "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true" || v === "yes";
}
