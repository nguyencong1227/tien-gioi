/**
 * Công thức hạt của đợt thêm chiêu (mục 51, CT11b): tia lửa điện của SÉT LAN, chớp ở mục tiêu, vụ nổ DẤU khi combo, bụi cuối đoạn ĐẠN của người chơi. CHỈ là dữ liệu (xem `recipes-combat.ts` về vòng import);
 * màu cuối do `opts.tint` (màu theo HỆ, `ct2-fx.ts`), `tint` ở đây chỉ là dự phòng. Kế hoạch điểm phát và ngân sách do `ct2-fx.ts` quyết.
 */
import type { FxRecipe } from "./recipes";

export const CT2_RECIPES: readonly FxRecipe[] = [
  // tia lửa điện dọc đoạn sét: ngắn, sáng, tan rất nhanh (cảm giác giật)
  {
    id: "chain-spark",
    priority: 1,
    particles: {
      frames: ["spark"],
      count: 3,
      lifespan: { min: 120, max: 240 },
      speed: { min: 20, max: 70 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xd8d8ff,
    },
  },
  // chớp ở mục tiêu vừa trúng: tia toả ra, lâu hơn chút
  {
    id: "chain-node",
    priority: 1,
    particles: {
      frames: ["spark", "dot"],
      count: 6,
      lifespan: { min: 180, max: 360 },
      speed: { min: 40, max: 110 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xd8d8ff,
    },
  },
  // cuối mỗi đoạn đạn của người chơi (chạm tường / mục tiêu / điểm nảy): bụi tia nhỏ, tan nhanh
  {
    id: "pbolt-hit",
    priority: 1,
    particles: {
      frames: ["spark", "dot"],
      count: 5,
      lifespan: { min: 140, max: 300 },
      speed: { min: 30, max: 90 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xffffff,
    },
  },
  // vụ nổ dấu khi ăn combo: chớp lớn, nhiều tia, có rung nhẹ khung
  {
    id: "combo-burst",
    priority: 2,
    particles: {
      frames: ["spark", "ember", "dot"],
      count: 14,
      lifespan: { min: 260, max: 520 },
      speed: { min: 60, max: 160 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xffe08a,
    },
  },
];
