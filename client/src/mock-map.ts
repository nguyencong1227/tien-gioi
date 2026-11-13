import { DEFAULT_MAP_ID, getMap, isDungeonMap } from "@tien-gioi/shared";

/** Điểm đứng của người chơi trong chế độ mock ở bản đồ mặc định (giữ nguyên để các ảnh / số đo cũ không đổi). */
const DEFAULT_MOCK_SPAWN = { x: 512, y: 896 } as const;

/**
 * Bản đồ chế độ mock (`?dungeon=mock`, `?duel=mock`, `?crowd=N`) khởi đầu: `?map=<id>` chọn bản đồ thường (Hắc Phong, Âm Sương...)
 * để harness đo (`perf:mobile`, `capture-viewports`) đi qua bản đồ mới mà không cần server thật (#408 bước 4).
 *
 * Chỉ nhận id của bản đồ NGOÀI (không phải phòng bí cảnh: bí cảnh có mock riêng `?dungeon=fallen`); id lạ / thiếu, hoặc không phải
 * DEV lẫn `?debug`, quay về bản đồ mặc định. `getMap` tra theo bảng nên id độc ("constructor", "__proto__") trả `undefined`.
 */
export function mockStartMapId(
  search: string = typeof location !== "undefined" ? location.search : "",
  isDev: boolean = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV),
): string {
  const params = new URLSearchParams(search);
  if (!(isDev || params.has("debug"))) return DEFAULT_MAP_ID;
  const id = params.get("map");
  if (!id || isDungeonMap(id) || !getMap(id)) return DEFAULT_MAP_ID;
  return id;
}

/**
 * Điểm đứng của người chơi mock trên bản đồ `mapId`: bản đồ mặc định giữ điểm cũ, bản đồ khác đứng giữa trấn an toàn
 * (`GameMap.townPx`, luôn đi được và có sương / nước / trang trí trong tầm nhìn của camera).
 */
export function mockSpawnOf(mapId: string): { x: number; y: number } {
  if (mapId === DEFAULT_MAP_ID) return { ...DEFAULT_MOCK_SPAWN };
  const t = getMap(mapId)?.townPx;
  return t ? { x: t.x, y: t.y } : { ...DEFAULT_MOCK_SPAWN };
}

/**
 * `?map=<id>` được ghi (và đang DEV / `?debug`): phòng mock phải ĐỒNG BỘ vị trí cho cảnh như máy chủ thật (gọi `onStateChange` một lần),
 * nếu không `reconcile()` không chạy, `predX` / `predY` đứng ở 0 và camera nhìn góc trên-trái bản đồ (núi viền) chứ không phải chỗ
 * người chơi đứng. Chỉ khi có `?map=`: các kịch bản mock cũ (không `?map=`) giữ nguyên hành vi để ảnh / số đo cũ không đổi.
 */
export function mockSyncsState(
  search: string = typeof location !== "undefined" ? location.search : "",
  isDev: boolean = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV),
): boolean {
  const params = new URLSearchParams(search);
  return (isDev || params.has("debug")) && params.has("map");
}
