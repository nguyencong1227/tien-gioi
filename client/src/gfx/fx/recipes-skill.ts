/**
 * Công thức hiệu ứng nhóm CÔNG PHÁP (M5.2, #329, mục 7.2): kiếm khí (tia sáng rải dọc đường bay + chớp ở mũi), vệt chém (tia lửa
 * ở hai đầu cung). Hạt CHỈ thêm cho `fxSword` / `fxSlash` hiện có (ảnh `swordbeam` và cung `Graphics` giữ nguyên).
 *
 * CHỈ là dữ liệu (xem `recipes-combat.ts` về vòng import). Màu truyền bằng `opts.tint` (màu vũ khí); `sword-qi` truyền
 * `opts.angle` = hướng bay (lõi ép nón ±20° quanh hướng đó), `sword-tip` và `slash-edge` toả mọi hướng nên KHÔNG truyền angle.
 */
import type { FxRecipe } from "./recipes";

export const SKILL_RECIPES: readonly FxRecipe[] = [
  {
    // Rải dọc đường bay của kiếm khí: tia nhỏ trôi theo hướng bay rồi tan
    id: "sword-qi",
    priority: 1,
    particles: {
      frames: ["spark", "dot"],
      count: 6,
      lifespan: { min: 220, max: 420 },
      speed: { min: 10, max: 60 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xdff4ff,
    },
  },
  {
    // Mũi kiếm khí: nổ nhỏ có vòng sáng
    id: "sword-tip",
    priority: 1,
    particles: {
      frames: ["spark", "ring"],
      count: 8,
      lifespan: { min: 250, max: 450 },
      speed: { min: 40, max: 130 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xffffff,
    },
  },
  {
    // Hai đầu cung chém: vài tia lửa
    id: "slash-edge",
    priority: 1,
    particles: {
      frames: ["spark"],
      count: 4,
      lifespan: { min: 150, max: 260 },
      speed: { min: 40, max: 110 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xffffff,
    },
  },
];
