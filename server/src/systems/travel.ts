// Đi qua cổng chuyển bản đồ (M3 bước 1, shared/src/travel.ts). System chỉ KIỂM và LẬP KẾ HOẠCH; việc lưu nhân vật,
// đưa ra khỏi phòng và gửi `travelTo` do WorldRoom làm (cần I/O và kết nối), xem `WorldRoom.travel`.
import { TRAVEL_COMBAT_LOCK_MS, TRAVEL_COOLDOWN_MS, getMap } from "@tien-gioi/shared";
import type { World } from "../world";

/**
 * Sai số vị trí (px) cho phép so với tầm cổng: client kiểm bằng vị trí đoán trước nên có thể đi trước server
 * vài bước; không có sai số này thì nút hiện rồi bấm vẫn bị từ chối oan.
 */
export const PORTAL_SLACK = 24;

export interface TravelPlan {
  /** Bản đồ đích */
  mapId: string;
  /** Chỗ xuất hiện ở bản đồ đích (px) */
  x: number;
  y: number;
  portalName: string;
}

/**
 * Kiểm một lần đi qua cổng: còn sống, cổng có ở bản đồ này, đứng trong tầm, qua hồi chiêu (kể cả hồi chiêu lưu trong
 * file từ lần qua cổng trước: người chơi qua lại liên tục không né được bằng cách vào phòng mới), không vừa bị đánh.
 * Từ chối thì chỉ gửi `toast` (không có tin riêng) và trả `null`; tin rác (kiểu sai, id lạ) trả `null` im lặng.
 */
export function planTravel(w: World, sid: string, portalId: unknown): TravelPlan | null {
  const r = w.ready(sid);
  if (!r || r.c.travelling || typeof portalId !== "string") return null;
  const { p, c } = r;
  const deny = (text: string) => {
    w.events.toast(sid, { text, tone: "bad" });
    return null;
  };
  const portal = w.map.portal(portalId);
  if (!portal) return deny("Không có cổng này ở đây.");
  if (Math.hypot(p.x - portal.x, p.y - portal.y) > portal.r + PORTAL_SLACK)
    return deny("Phải đứng gần cổng mới đi qua được.");
  if (w.now - (c.save.travelAt ?? 0) < TRAVEL_COOLDOWN_MS) return deny("Cổng vừa mở, chờ một lát.");
  if (w.now - c.lastHitAt < TRAVEL_COMBAT_LOCK_MS)
    return deny("Đang giao chiến, chưa qua cổng được.");
  // Hợp đồng đảm bảo cổng đích tồn tại (test shared giữ); kiểm lại để một bản đồ cấu hình sai không làm kẹt người chơi
  const to = getMap(portal.toMap)?.portal(portal.toPortal);
  if (!to) return deny("Cổng này chưa mở được.");
  return { mapId: portal.toMap, x: to.spawn.x, y: to.spawn.y, portalName: portal.name };
}
