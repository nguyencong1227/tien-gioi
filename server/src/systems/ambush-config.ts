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

function warn(name: string, raw: string | undefined, effect: string): string[] {
  const v = (raw ?? "").trim();
  if (v === "") return [];
  const low = v.toLowerCase();
  if (ON_VALUES.includes(low) || OFF_VALUES.includes(low)) return [];
  return [`${name}='${v}' không hợp lệ (dùng on hoặc off): đang TẮT, ${effect}.`];
}

/** Cảnh báo lúc khởi động khi `AMBUSH` có giá trị lạ (gõ nhầm `enable`, `onn`): lặng lẽ tắt mà người vận hành tưởng đã bật. Không đặt / rỗng: không cảnh báo. */
export function ambushWarnings(env: NodeJS.ProcessEnv): string[] {
  return warn("AMBUSH", env.AMBUSH, "người chơi không bị chặn đường");
}

/** Dòng log lúc khởi động khi BẬT (để `./prod.sh logs game | grep AMBUSH` xác nhận sau khi triển khai); tắt thì không có dòng nào (`null`). */
export function ambushNotice(env: NodeJS.ProcessEnv): string | null {
  return ambushOn(env) ? "Gặp chặn đường: BẬT (AMBUSH)" : null;
}
