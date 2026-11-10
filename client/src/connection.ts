import {
  DEFAULT_MAP_ID,
  getMap,
  parseWrongMap,
  roomNameOf,
  type JoinOptions,
} from "@tien-gioi/shared";

/** Giao diện client Colyseus tối thiểu để thực hiện kết nối. */
export interface JoinClient<R> {
  joinOrCreate(roomName: string, options: JoinOptions): Promise<R>;
}

/** Giao diện bộ nhớ cục bộ (localStorage hoặc đối tượng giả lập để test). */
export interface JoinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Khóa lưu bản đồ gần nhất theo tên nhân vật. */
export function getSavedMapKey(charName: string): string {
  return `tien-gioi:map:${charName.trim()}`;
}

/** Lấy bản đồ đã lưu của nhân vật. Nếu không có hoặc id lạ (không có trong GameMap) thì dọn và trả DEFAULT_MAP_ID. */
export function getSavedMap(storage: JoinStorage, charName: string): string {
  const raw = storage.getItem(getSavedMapKey(charName));
  if (!raw) return DEFAULT_MAP_ID;
  if (!getMap(raw)) {
    clearSavedMap(storage, charName);
    return DEFAULT_MAP_ID;
  }
  return raw;
}

/** Lưu bản đồ hiện tại của nhân vật. */
export function saveMap(storage: JoinStorage, charName: string, mapId: string): void {
  storage.setItem(getSavedMapKey(charName), mapId);
}

/** Xóa bản đồ đã lưu của nhân vật (khi mapId bị hỏng/lạ). */
export function clearSavedMap(storage: JoinStorage, charName: string): void {
  storage.removeItem(getSavedMapKey(charName));
}

export interface JoinWithRedirectOptions<R> {
  client: JoinClient<R>;
  storage: JoinStorage;
  name: string;
  secret: string;
  suggestedMapId?: string;
  maxRedirects?: number;
}

export interface JoinResult<R> {
  room: R;
  mapId: string;
}

/**
 * Vào phòng Colyseus theo roomNameOf(mapId) có hỗ trợ tự động chuyển hướng khi server báo JOIN_WRONG_MAP.
 * - Thử vào mapId gợi ý (hoặc lấy từ storage). Nếu mapId lạ (không có trong getMap), tự động dọn và dùng DEFAULT_MAP_ID.
 * - Nếu server từ chối vì nhân vật đang ở map khác (`wrong_map:<id>`), tự động vào lại map đúng (không báo lỗi).
 * - Chặn tối đa `maxRedirects` lần (mặc định 3) để tránh vòng lặp vô hạn.
 */
export async function joinWithRedirect<R>(
  options: JoinWithRedirectOptions<R>,
): Promise<JoinResult<R>> {
  const { client, storage, name, secret, maxRedirects = 3 } = options;

  let currentMapId = options.suggestedMapId || getSavedMap(storage, name);
  if (!getMap(currentMapId)) {
    clearSavedMap(storage, name);
    currentMapId = DEFAULT_MAP_ID;
  }
  let redirectCount = 0;
  let badMapRetried = false;

  while (redirectCount <= maxRedirects) {
    try {
      const room = await client.joinOrCreate(roomNameOf(currentMapId), {
        name,
        secret,
      });

      // Kết nối thành công: lưu lại mapId đúng vào bộ nhớ
      saveMap(storage, name, currentMapId);
      return { room, mapId: currentMapId };
    } catch (err: any) {
      // 1. Kiểm tra lỗi sai bản đồ (wrong_map:mapId)
      const correctMap = parseWrongMap(err?.code, err?.message);
      if (correctMap) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error("Chuyển hướng bản đồ vượt quá giới hạn cho phép.", { cause: err });
        }
        currentMapId = correctMap;
        continue;
      }

      // 2. Lớp phòng thủ thứ hai: nếu phòng chưa được định nghĩa (Colyseus MATCHMAKE_NO_HANDLER = 4210)
      const isNoHandler =
        err?.code === 4210 ||
        (typeof err?.message === "string" && /not defined|MATCHMAKE_NO_HANDLER/i.test(err.message));
      if (isNoHandler && currentMapId !== DEFAULT_MAP_ID && !badMapRetried) {
        clearSavedMap(storage, name);
        currentMapId = DEFAULT_MAP_ID;
        badMapRetried = true;
        redirectCount++;
        continue;
      }

      // 3. Các lỗi khác (400, 403, 409, mất mạng...) ném lỗi ra ngoài
      throw err;
    }
  }

  throw new Error("Không thể vào phòng sau khi chuyển hướng.");
}
