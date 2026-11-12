/**
 * Công thức hiệu ứng nhóm THẾ GIỚI (M5.2, #329, mục 7.2): rơi đồ lấp lánh theo độ hiếm, nhặt đồ, cổng truyền tống xoáy.
 *
 * CHỈ là dữ liệu (xem `recipes-combat.ts` về vòng import). Màu theo độ hiếm truyền bằng `opts.tint` (`RARITY_COLORS`), nên
 * mỗi bậc chỉ cần khác SỐ hạt / cỡ: `loot-drop-low` (thường, lục), `loot-drop-mid` (lam, tím), `loot-drop-high` (cam: có vòng
 * sáng). Không truyền `opts.angle` cho công thức toả mọi hướng (lõi sẽ ép nón ±20°).
 */
import type { FxRecipe } from "./recipes";

export const WORLD_COLOR = {
  portal: 0xb48cff,
} as const;

export const WORLD_RECIPES: readonly FxRecipe[] = [
  {
    // Đồ thường / lục rơi ra: vài đốm nhỏ
    id: "loot-drop-low",
    priority: 1,
    particles: {
      frames: ["dot"],
      count: 5,
      lifespan: { min: 350, max: 600 },
      speed: { min: 20, max: 60 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.9, end: 0 },
    },
  },
  {
    // Lam / tím: đốm + tia
    id: "loot-drop-mid",
    priority: 1,
    particles: {
      frames: ["dot", "spark"],
      count: 9,
      lifespan: { min: 450, max: 800 },
      speed: { min: 30, max: 90 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
    },
  },
  {
    // Cam (hiếm nhất): nhiều tia + vòng sáng phình ra
    id: "loot-drop-high",
    priority: 1,
    particles: {
      frames: ["spark", "ring", "ember"],
      count: 16,
      lifespan: { min: 500, max: 1000 },
      speed: { min: 40, max: 120 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
    },
  },
  {
    // Lấp lánh định kỳ trên đồ từ lam trở lên (môi trường: ưu tiên 0)
    id: "loot-glint",
    priority: 0,
    particles: {
      frames: ["spark"],
      count: 2,
      lifespan: { min: 500, max: 900 },
      speed: { min: 4, max: 14 },
      scale: { start: 0.45, end: 0 },
      alpha: { start: 0.9, end: 0 },
      gravityY: -8,
    },
  },
  {
    // Nhặt đồ: đốm bay lên rồi tan (của mình: ưu tiên 2)
    id: "loot-pickup",
    priority: 2,
    particles: {
      frames: ["dot", "ember"],
      count: 8,
      lifespan: { min: 350, max: 650 },
      speed: { min: 40, max: 110 },
      angle: { min: -140, max: -40 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: -40,
    },
  },
  {
    // Cổng truyền tống xoáy: đốm sáng tím trôi lên, điểm phát quay quanh cổng (WorldScene phát lặp, ưu tiên 0)
    id: "portal-swirl",
    priority: 0,
    particles: {
      frames: ["dot", "spark"],
      count: 3,
      lifespan: { min: 800, max: 1400 },
      speed: { min: 14, max: 38 },
      angle: { min: -105, max: -75 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: WORLD_COLOR.portal,
      gravityY: -18,
    },
  },
];
