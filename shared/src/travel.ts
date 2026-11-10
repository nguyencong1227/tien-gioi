// Chuyển bản đồ: hợp đồng giữa client và server (M3 bước 1, phương án A của docs/THIET_KE_NHIEU_BAN_DO.md).
//
// Mỗi bản đồ là một phòng Colyseus (`ROOM_NAME` + `JoinOptions.mapId`), một người chỉ ở một phòng một lúc.
// File lưu nhân vật ghi `mapId` (thiếu thì coi là `DEFAULT_MAP_ID`) và vị trí trong bản đồ đó.
// **Server quyết định nhân vật thuộc bản đồ nào**: `JoinOptions.mapId` chỉ là gợi ý của client để chọn phòng.
//
// Đi qua cổng (client -> server -> client):
//  1. Client đứng trong tầm `PortalDef.r` của một cổng (`GameMap.portalNear`) thì hiện nút "Đi qua cổng" và gửi
//     `travel { portalId }`. Cổng chỉ là điều kiện để NHÌN THẤY nút: server kiểm lại mọi thứ.
//  2. Server kiểm (kiểu, id cổng có ở bản đồ này, còn sống, đang trong tầm cổng, hồi chiêu `TRAVEL_COOLDOWN_MS`,
//     không vừa bị đánh trong `TRAVEL_COMBAT_LOCK_MS`). Không đạt thì chỉ gửi `ToastMsg` (không có tin riêng).
//  3. Đạt: server lưu nhân vật với `mapId` = bản đồ đích và vị trí = `spawn` của cổng đích, đưa nhân vật ra khỏi
//     phòng cũ (không chờ nối lại), rồi gửi `travelTo { mapId }` cho client.
//  4. Client nhận `travelTo` thì rời phòng cũ và `joinOrCreate(ROOM_NAME, { name, secret, mapId })`
//     (vẽ màn chuyển cảnh trong lúc chờ, tối đa `TRAVEL_JOIN_TIMEOUT_MS`). Phòng đích nạp file lưu ĐÃ GHI ở bước 3.
//
// Vào nhầm phòng (mở game lần đầu không biết nhân vật đang ở đâu, cache cũ, kết nối lại sau khi đã đi qua cổng...):
// `onAuth` của phòng so `mapId` đã lưu với bản đồ của phòng. Khác thì từ chối bằng `ServerError(JOIN_WRONG_MAP,
// wrongMapMessage(mapId đúng))`; client gặp lỗi này (`parseWrongMap`) thì vào lại ngay phòng đúng, không báo lỗi cho
// người chơi. Nhờ vậy client luôn có thể bắt đầu bằng `mapId` mặc định (hoặc cái nhớ lần trước) mà vẫn hội tụ.
// `mapId` lạ (không có trong `MAPS`) bị từ chối `JOIN_BAD_MAP` ngay ở `onCreate` / `onAuth`: không tạo phòng cho id rác.
//
// Token nối lại khi rớt mạng (#117) thuộc về MỘT phòng: sau khi vào phòng đích phải lưu token mới.

/** Gửi lại `travel` trong bấy nhiêu ms sau lần đi qua cổng trước (chống bấm liên tục / vòng lặp qua lại). */
export const TRAVEL_COOLDOWN_MS = 3000;

/** Vừa bị quái / người đánh trong bấy nhiêu ms thì chưa được đi qua cổng (cổng không phải cách trốn trận). */
export const TRAVEL_COMBAT_LOCK_MS = 3000;

/** Client chờ vào được phòng đích tối đa bấy nhiêu ms; quá hạn thì thử lại như đăng nhập thường (đã có `wrong_map`). */
export const TRAVEL_JOIN_TIMEOUT_MS = 10_000;

// ---------- Tin nhắn client -> server ----------

/** Đi qua cổng `portalId` (id có trong `GameMap.portals` của phòng hiện tại). */
export interface TravelMsg {
  portalId: string;
}

// ---------- Tin nhắn server -> client ----------

/**
 * Nhân vật đã được lưu và rời phòng: client vào phòng của `mapId` (bước 4 ở đầu file).
 * Chỉ gửi cho người đi qua cổng.
 */
export interface TravelToMsg {
  mapId: string;
}

// ---------- Lỗi khi vào phòng ----------
// Mã lỗi trong `ServerError` ở `onAuth` / `onCreate`; các mã cũ của server (400 tên sai, 403 tên đã có người dùng,
// 409 nhân vật đang ở trong game) giữ nguyên.

/** Nhân vật thuộc bản đồ khác: thông điệp là `wrongMapMessage(mapId đúng)`. */
export const JOIN_WRONG_MAP = 421;
/** `mapId` không có trong `MAPS`. */
export const JOIN_BAD_MAP = 422;

const WRONG_MAP_PREFIX = "wrong_map:";

/** Thông điệp của lỗi `JOIN_WRONG_MAP`, mang theo bản đồ đúng. */
export function wrongMapMessage(mapId: string): string {
  return WRONG_MAP_PREFIX + mapId;
}

/** Lấy `mapId` đúng từ lỗi vào phòng; không phải lỗi `wrong_map` thì `undefined`. Không kiểm id có trong `MAPS`. */
export function parseWrongMap(code: unknown, message: unknown): string | undefined {
  if (code !== JOIN_WRONG_MAP || typeof message !== "string") return undefined;
  if (!message.startsWith(WRONG_MAP_PREFIX)) return undefined;
  const id = message.slice(WRONG_MAP_PREFIX.length);
  return id || undefined;
}
