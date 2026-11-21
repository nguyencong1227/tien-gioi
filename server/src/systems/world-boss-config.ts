// Cờ bật TRÙM THẾ GIỚI THEO GIỜ (M9.4, `systems/world-boss.ts`) từ biến môi trường `WORLD_BOSS`. Mặc định TẮT (đổi từ "bật trừ khi off" khi lịch thật có dữ liệu, QUYET_DINH_M3 mục 59):
// thêm khung giờ vào `WORLD_BOSS_SCHEDULE` KHÔNG tự bật ở bản chạy thật cho tới khi người dùng đồng ý (trùm sinh ở bản đồ thường: bị hạ = chết thật, questions.md 21:50).
// Bật bằng `WORLD_BOSS=on`; lịch rỗng thì bật cũng không chạy. Thuần hàm (test được), cùng khuôn `ambush-config.ts`.

const ON_VALUES = ["on", "1", "true", "yes"];
const OFF_VALUES = ["off", "0", "false", "no"];

const norm = (raw: string | undefined): string => (raw ?? "").trim().toLowerCase();

/** `WORLD_BOSS` -> bật / tắt. Không đặt / rỗng / giá trị lạ (gõ nhầm) là TẮT: không bao giờ bật ngầm. */
export function worldBossOn(env: NodeJS.ProcessEnv): boolean {
  return ON_VALUES.includes(norm(env.WORLD_BOSS));
}

/** Cảnh báo lúc khởi động khi `WORLD_BOSS` có giá trị lạ (không đặt / rỗng / on / off: không cảnh báo). */
export function worldBossWarnings(env: NodeJS.ProcessEnv): string[] {
  const v = (env.WORLD_BOSS ?? "").trim();
  if (v === "") return [];
  const low = v.toLowerCase();
  if (ON_VALUES.includes(low) || OFF_VALUES.includes(low)) return [];
  return [`WORLD_BOSS='${v}' không hợp lệ (dùng on hoặc off): đang TẮT, không có trùm thế giới.`];
}

/**
 * Dòng log lúc khởi động (để `grep "Trùm thế giới"` xác nhận sau khi triển khai): bật và có lịch thì nêu số khung giờ; bật mà lịch RỖNG thì nói rõ là không chạy;
 * tắt thì không có dòng nào (`null`).
 */
export function worldBossNotice(env: NodeJS.ProcessEnv, slotCount: number): string | null {
  if (!worldBossOn(env)) return null;
  return slotCount > 0
    ? `Trùm thế giới: BẬT (WORLD_BOSS, ${slotCount} khung giờ mỗi ngày)`
    : "Trùm thế giới: WORLD_BOSS=on nhưng lịch RỖNG: không có sự kiện nào";
}
