/**
 * Kế hoạch hiệu ứng THẾ GIỚI (M5.2, #329): rơi đồ theo độ hiếm, nhặt đồ, cổng truyền tống. Hàm thuần (không Phaser) để test;
 * `WorldScene` chỉ gọi và phát bằng `fx.play`. Không thêm tin / trường đồng bộ: dùng state `loot` và `map.portals` đã có.
 */
import { RARITY_COLORS } from "@tien-gioi/shared";
import type { FxPriority } from "./budget";

export interface WorldFxPlan {
  recipe: string;
  /** Màu hạt (0xRRGGBB) theo độ hiếm. */
  tint: number;
  priority: FxPriority;
}

/** Độ hiếm hợp lệ 0..4 (id lạ / thiếu dữ liệu thì coi như thường). */
export function clampRarity(r: number | undefined): 0 | 1 | 2 | 3 | 4 {
  if (r === undefined || !Number.isInteger(r) || r < 0) return 0;
  return (r > 4 ? 4 : r) as 0 | 1 | 2 | 3 | 4;
}

export function rarityTint(r: number | undefined): number {
  return RARITY_COLORS[clampRarity(r)];
}

/** Đồ vừa xuất hiện: số hạt và kiểu tăng theo độ hiếm (0-1 thường / lục, 2-3 lam / tím, 4 cam). Người khác nhặt / rơi: ưu tiên 1. */
export function planLootDrop(rarity: number | undefined): WorldFxPlan {
  const r = clampRarity(rarity);
  return {
    recipe: r >= 4 ? "loot-drop-high" : r >= 2 ? "loot-drop-mid" : "loot-drop-low",
    tint: RARITY_COLORS[r],
    priority: 1,
  };
}

/** Nhặt đồ của MÌNH: đốm màu độ hiếm, ưu tiên 2. */
export function planLootPickup(rarity: number | undefined): WorldFxPlan {
  return { recipe: "loot-pickup", tint: rarityTint(rarity), priority: 2 };
}

/** Lấp lánh định kỳ chỉ có từ độ hiếm lam (2) trở lên: đồ thường không tốn ngân sách. */
export function lootGlints(rarity: number | undefined): boolean {
  return clampRarity(rarity) >= 2;
}

/** Khoảng giữa hai lần lấp lánh của một món đồ: hiếm hơn thì dày hơn. */
export function glintIntervalMs(rarity: number | undefined): number {
  const r = clampRarity(rarity);
  return r >= 4 ? 700 : r === 3 ? 1000 : 1500;
}

/** Tới lúc phát lại chưa; trả mốc mới hoặc null. `rand01` tiêm vào để test tất định. */
export function nextDueAt(
  nextAt: number | undefined,
  now: number,
  intervalMs: number,
  jitterMs: number,
  rand01: number,
): number | null {
  if (nextAt !== undefined && now < nextAt) return null;
  return now + intervalMs + Math.floor(rand01 * jitterMs);
}

/** Bán kính vòng quay của điểm phát quanh tâm cổng (px thế giới) và chu kỳ một vòng (ms). */
export const PORTAL_SWIRL_RADIUS = 26;
export const PORTAL_SWIRL_PERIOD_MS = 2400;
export const PORTAL_SWIRL_INTERVAL_MS = 420;

/**
 * Hai điểm phát đối xứng quay quanh tâm cổng theo thời gian: các đốm trôi lên từ vị trí quay nên tạo thành vệt xoáy.
 * Hàm thuần theo `now` nên cổng nào cũng tất định.
 */
export function portalSwirlPoints(
  cx: number,
  cy: number,
  now: number,
): [{ x: number; y: number }, { x: number; y: number }] {
  const a = ((now % PORTAL_SWIRL_PERIOD_MS) / PORTAL_SWIRL_PERIOD_MS) * Math.PI * 2;
  const dx = Math.cos(a) * PORTAL_SWIRL_RADIUS;
  const dy = Math.sin(a) * PORTAL_SWIRL_RADIUS * 0.55; // vòng dẹt theo góc nhìn từ trên xuống
  return [
    { x: cx + dx, y: cy + dy },
    { x: cx - dx, y: cy - dy },
  ];
}
