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

function warn(name: string, raw: string | undefined, effect: string): string[] {
  const v = (raw ?? "").trim();
  if (v === "") return [];
  const low = v.toLowerCase();
  if (ON_VALUES.includes(low) || OFF_VALUES.includes(low)) return [];
  return [`${name}='${v}' không hợp lệ (dùng on hoặc off): đang TẮT, ${effect}.`];
}

/** Cảnh báo lúc khởi động khi `AMBUSH` hoặc `AMBUSH_BOTS` có giá trị lạ. Không đặt / rỗng: không cảnh báo. */
export function ambushWarnings(env: NodeJS.ProcessEnv): string[] {
  return [
    ...warn("AMBUSH", env.AMBUSH, "người chơi không bị chặn đường"),
    ...warn("AMBUSH_BOTS", env.AMBUSH_BOTS, "bot bị bỏ qua khi gặp chặn đường"),
  ];
}

/** Dòng log lúc khởi động khi BẬT (để `./prod.sh logs game | grep AMBUSH` xác nhận sau khi triển khai); tắt thì không có dòng nào (`null`). */
export function ambushNotice(env: NodeJS.ProcessEnv): string | null {
  if (!ambushOn(env)) return null;
  const botPart = ambushBotsOn(env) ? " [bật bot (AMBUSH_BOTS)]" : "";
  return `Gặp chặn đường: BẬT (AMBUSH)${botPart}`;
}
