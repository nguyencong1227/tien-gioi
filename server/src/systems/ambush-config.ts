// Cờ bật GẶP CHẶN ĐƯỜNG (mục 52, `systems/ambush.ts`) từ biến môi trường `AMBUSH`. Mặc định TẮT: không đặt biến thì bản chạy thật không đổi cho tới nghiệm thu
// (CD10); máy dev / test không đặt thì giữ hành vi cũ. Thuần hàm (test được); `WorldRoom` đọc MỘT lần lúc dựng phòng. Cùng khuôn `boss-config.ts`.

const ON_VALUES = ["on", "1", "true", "yes"];
const OFF_VALUES = ["off", "0", "false", "no"];

const flag = (raw: string | undefined): boolean =>
  ON_VALUES.includes((raw ?? "").trim().toLowerCase());

/** `AMBUSH` -> bật / tắt. Giá trị lạ (gõ nhầm) coi là TẮT: không bao giờ bật ngầm. */
export function ambushOn(env: NodeJS.ProcessEnv): boolean {
  return flag(env.AMBUSH);
}

/** `AMBUSH_BOTS` -> bật / tắt cho bot gặp chặn đường (mục 52, CD9 #1069). Mặc định TẮT. */
export function ambushBotsOn(env: NodeJS.ProcessEnv): boolean {
  return flag(env.AMBUSH_BOTS);
}

/** Số Hồi Huyết Đan tối đa có thể đòi (trần: không ai cần nhiều hơn số đan giả định của mô phỏng, `ASSUME_DUNGEON.potions`). */
export const AMBUSH_MIN_POTIONS_MAX = 8;

/**
 * `AMBUSH_MIN_POTIONS` -> số Hồi Huyết Đan TỐI THIỂU trong túi để bị chặn đường (người có ít đan hơn thì KHÔNG bị chặn: bị hạ là chết thật, mục 53, mà đo cho thấy chiến với 2 đan gần như không chết còn
 * không có đan chết ~16% / lần). Mặc định 0 (không đòi, như trước). Số nguyên 0..`AMBUSH_MIN_POTIONS_MAX`; giá trị lạ / ngoài khoảng coi là 0 (KHÔNG chặn ngầm) và có cảnh báo. Khuyến nghị 2 nếu bật.
 */
export function ambushMinPotions(env: NodeJS.ProcessEnv): number {
  const v = (env.AMBUSH_MIN_POTIONS ?? "").trim();
  if (!/^\d{1,2}$/.test(v)) return 0;
  const n = Number(v);
  return n <= AMBUSH_MIN_POTIONS_MAX ? n : 0;
}

function warn(name: string, raw: string | undefined, effect: string): string[] {
  const v = (raw ?? "").trim();
  if (v === "") return [];
  const low = v.toLowerCase();
  if (ON_VALUES.includes(low) || OFF_VALUES.includes(low)) return [];
  return [`${name}='${v}' không hợp lệ (dùng on hoặc off): đang TẮT, ${effect}.`];
}

function warnMinPotions(env: NodeJS.ProcessEnv): string[] {
  const v = (env.AMBUSH_MIN_POTIONS ?? "").trim();
  if (v === "") return [];
  if (/^\d{1,2}$/.test(v) && Number(v) <= AMBUSH_MIN_POTIONS_MAX) return [];
  return [
    `AMBUSH_MIN_POTIONS='${v}' không hợp lệ (số nguyên 0-${AMBUSH_MIN_POTIONS_MAX}): đang 0, không loại ai khỏi chặn đường theo số đan.`,
  ];
}

/** Cảnh báo lúc khởi động khi `AMBUSH`, `AMBUSH_BOTS` hoặc `AMBUSH_MIN_POTIONS` có giá trị lạ. Không đặt / rỗng: không cảnh báo. */
export function ambushWarnings(env: NodeJS.ProcessEnv): string[] {
  return [
    ...warn("AMBUSH", env.AMBUSH, "người chơi không bị chặn đường"),
    ...warn("AMBUSH_BOTS", env.AMBUSH_BOTS, "bot bị bỏ qua khi gặp chặn đường"),
    ...warnMinPotions(env),
  ];
}

/** Dòng log lúc khởi động khi BẬT (để `./prod.sh logs game | grep AMBUSH` xác nhận sau khi triển khai); tắt thì không có dòng nào (`null`). */
export function ambushNotice(env: NodeJS.ProcessEnv): string | null {
  if (!ambushOn(env)) return null;
  const botPart = ambushBotsOn(env) ? " [bật bot (AMBUSH_BOTS)]" : "";
  const min = ambushMinPotions(env);
  const potionPart =
    min > 0 ? ` [không chặn người có dưới ${min} Hồi Huyết Đan (AMBUSH_MIN_POTIONS)]` : "";
  return `Gặp chặn đường: BẬT (AMBUSH)${botPart}${potionPart}`;
}
