import {
  DEFAULT_MAP_ID,
  JOIN_CLIENT_OUTDATED,
  JOIN_NOT_IN_RUN,
  PROTOCOL_VERSION,
  ROOM_ID_RE,
  getMap,
  isDungeonMap,
  parseClientOutdated,
  parseWrongMap,
  roomNameOf,
  type JoinOptions,
} from "@tien-gioi/shared";

/** Lỗi dứt khoát khi phiên bản giao thức client quá cũ so với yêu cầu tối thiểu của server (M4 2.5). */
export class ClientOutdatedError extends Error {
  public readonly minVersion: number;
  public readonly code = JOIN_CLIENT_OUTDATED;

  constructor(minVersion: number, message?: string) {
    super(message || `client_outdated:${minVersion}`);
    this.name = "ClientOutdatedError";
    this.minVersion = minVersion;
  }
}

export function isClientOutdatedError(err: unknown): err is ClientOutdatedError {
  return (
    err instanceof ClientOutdatedError ||
    (typeof err === "object" && err !== null && (err as any).name === "ClientOutdatedError")
  );
}

/** Giao diện client Colyseus tối thiểu để thực hiện kết nối. */
export interface JoinClient<R> {
  joinOrCreate(roomName: string, options: JoinOptions): Promise<R>;
  joinById?(roomId: string, options: JoinOptions): Promise<R>;
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

/** Lấy bản đồ đã lưu của nhân vật. Nếu không có, id lạ hoặc là bản đồ bí cảnh thì dọn và trả DEFAULT_MAP_ID. */
export function getSavedMap(storage: JoinStorage, charName: string): string {
  const raw = storage.getItem(getSavedMapKey(charName));
  if (!raw) return DEFAULT_MAP_ID;
  if (!getMap(raw) || isDungeonMap(raw)) {
    clearSavedMap(storage, charName);
    return DEFAULT_MAP_ID;
  }
  return raw;
}

/** Lưu bản đồ hiện tại của nhân vật (không bao giờ lưu bản đồ bí cảnh). */
export function saveMap(storage: JoinStorage, charName: string, mapId: string): void {
  if (isDungeonMap(mapId)) return;
  storage.setItem(getSavedMapKey(charName), mapId);
}

/** Xóa bản đồ đã lưu của nhân vật (khi mapId bị hỏng/lạ). */
export function clearSavedMap(storage: JoinStorage, charName: string): void {
  storage.removeItem(getSavedMapKey(charName));
}

export interface JoinWithRedirectOptions<R> {
  client: JoinClient<R>;
  storage: JoinStorage;
  name?: string;
  secret?: string;
  token?: string;
  suggestedMapId?: string;
  /** Id phòng Colyseus cụ thể (dùng khi vào bí cảnh bằng joinById). */
  roomId?: string;
  maxRedirects?: number;
}

export interface JoinResult<R> {
  room: R;
  mapId: string;
  /** Cờ báo bí cảnh đã hết hạn / không vào được và đã tự khôi phục về Lạc Hà. */
  expiredDungeonFallback?: boolean;
}

/**
 * Vào phòng Colyseus theo roomNameOf(mapId) hoặc joinById(roomId) có hỗ trợ tự động chuyển hướng:
 * - Khi có `roomId` hợp lệ (`ROOM_ID_RE`), gọi `client.joinById(roomId, joinOpts)`.
 * - Nếu server từ chối `JOIN_NOT_IN_RUN` (422) hoặc phòng bí cảnh đã huỷ (4212), tự động đưa về `DEFAULT_MAP_ID`
 *   kèm `expiredDungeonFallback = true` để client báo "bí cảnh đã hết hạn" và không treo.
 * - Khi không có `roomId`: vào bằng `joinOrCreate(roomNameOf(mapId))`, tự động chuyển hướng nếu gặp `JOIN_WRONG_MAP`.
 * - Chặn tối đa `maxRedirects` lần (mặc định 3) để tránh vòng lặp vô hạn.
 */
export async function joinWithRedirect<R>(
  options: JoinWithRedirectOptions<R>,
): Promise<JoinResult<R>> {
  const { client, storage, name, secret, token, maxRedirects = 3 } = options;
  const storageKey = name || (token ? `token:${token.slice(0, 16)}` : "anonymous");

  let targetRoomId: string | undefined;
  let expiredDungeonFallback = false;

  if (options.roomId !== undefined) {
    if (typeof options.roomId === "string" && ROOM_ID_RE.test(options.roomId)) {
      targetRoomId = options.roomId;
    } else {
      // roomId sai hình dạng: không tin dữ liệu lạ, đưa về bản đồ mặc định
      expiredDungeonFallback = true;
    }
  }

  let currentMapId = options.suggestedMapId || getSavedMap(storage, storageKey);
  if (!getMap(currentMapId)) {
    clearSavedMap(storage, storageKey);
    currentMapId = DEFAULT_MAP_ID;
  }

  // Không bao giờ gọi joinOrCreate vào bản đồ bí cảnh nếu thiếu roomId hợp lệ
  if (isDungeonMap(currentMapId) && !targetRoomId) {
    currentMapId = DEFAULT_MAP_ID;
    expiredDungeonFallback = true;
  }

  let redirectCount = 0;
  let badMapRetried = false;

  while (redirectCount <= maxRedirects) {
    try {
      const joinOpts: JoinOptions = {
        v: PROTOCOL_VERSION,
      };
      if (token) joinOpts.token = token;
      if (name) joinOpts.name = name;
      if (secret) joinOpts.secret = secret;

      let room: R;
      if (targetRoomId) {
        if (!client.joinById) {
          throw new Error("Client không hỗ trợ joinById.");
        }
        room = await client.joinById(targetRoomId, joinOpts);
      } else {
        room = await client.joinOrCreate(roomNameOf(currentMapId), joinOpts);
      }

      // Kết nối thành công: lưu lại mapId đúng vào bộ nhớ (saveMap tự bỏ qua bản đồ bí cảnh)
      if (!targetRoomId && !isDungeonMap(currentMapId)) {
        saveMap(storage, storageKey, currentMapId);
      }
      return expiredDungeonFallback
        ? { room, mapId: currentMapId, expiredDungeonFallback: true }
        : { room, mapId: currentMapId };
    } catch (err: any) {
      // 0a. Kiểm tra lỗi phiên bản client quá cũ (M4 2.5):
      // Đây là lỗi dứt khoát: máy chủ yêu cầu bản mới hơn, KHÔNG thử lại (kể cả vòng wrong_map hay phòng khác).
      const minProtocol = parseClientOutdated(err?.code, err?.message);
      if (minProtocol !== undefined) {
        throw new ClientOutdatedError(minProtocol, err?.message);
      }

      // 0b. Nếu đang vào phòng bí cảnh bằng roomId mà gặp JOIN_NOT_IN_RUN (422) hoặc phòng đã đóng (4212):
      // tự động khôi phục về DEFAULT_MAP_ID để người chơi về Lạc Hà, không bị treo.
      const isDungeonExpired =
        err?.code === JOIN_NOT_IN_RUN ||
        err?.code === 4212 ||
        (typeof err?.message === "string" &&
          /not_in_run|not in run|room.*not found|expired/i.test(err.message));
      if (targetRoomId && isDungeonExpired) {
        targetRoomId = undefined;
        currentMapId = DEFAULT_MAP_ID;
        expiredDungeonFallback = true;
        redirectCount++;
        continue;
      }

      // 1. Kiểm tra lỗi sai bản đồ (wrong_map:mapId)
      const correctMap = parseWrongMap(err?.code, err?.message);
      if (correctMap) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error("Chuyển hướng bản đồ vượt quá giới hạn cho phép.", { cause: err });
        }
        targetRoomId = undefined;
        currentMapId = correctMap;
        continue;
      }

      // 2. Lớp phòng thủ thứ hai: nếu phòng chưa được định nghĩa (Colyseus MATCHMAKE_NO_HANDLER = 4210)
      const isNoHandler =
        err?.code === 4210 ||
        (typeof err?.message === "string" && /not defined|MATCHMAKE_NO_HANDLER/i.test(err.message));
      if (isNoHandler && currentMapId !== DEFAULT_MAP_ID && !badMapRetried) {
        clearSavedMap(storage, storageKey);
        targetRoomId = undefined;
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
