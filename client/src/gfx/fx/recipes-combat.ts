/**
 * Công thức hiệu ứng nhóm CHIẾN ĐẤU (M5.2, #329, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 7.2): tia lửa khi trúng, đòn chí
 * mạng / đòn nặng (có rung nhẹ), mình bị đánh, hồi máu, quái gục tan thành điểm sáng.
 *
 * CHỈ là dữ liệu, không import `registerRecipe` (tránh vòng import với `recipes.ts`): `recipes.ts` đăng ký mảng này.
 * Quy ước: `shake` chỉ có tác dụng khi gọi với ưu tiên 2 (của mình) và hồ sơ cho rung (lõi lo); không truyền `opts.angle`
 * cho các công thức toả mọi hướng (lõi sẽ ép nón ±20°).
 */
import type { FxRecipe } from "./recipes";

/** Màu dùng chung với chữ sát thương (`combat-fx.ts`). */
export const FX_COLOR = {
  hit: 0xffe9a8,
  crit: 0xffd34d,
  hurt: 0xff6b5e,
  heal: 0x7dffa0,
  vanish: 0xcfeaff,
} as const;

export const COMBAT_RECIPES: readonly FxRecipe[] = [
  // `hit-spark` (tia lửa thường) là công thức khung của lõi, nằm trong recipes.ts.
  {
    id: "hit-crit",
    priority: 1,
    particles: {
      frames: ["spark", "ember"],
      count: 12,
      lifespan: { min: 220, max: 400 },
      speed: { min: 90, max: 210 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: FX_COLOR.crit,
    },
  },
  {
    id: "hit-heavy",
    priority: 1,
    particles: {
      frames: ["spark", "ember", "ring"],
      count: 16,
      lifespan: { min: 240, max: 460 },
      speed: { min: 100, max: 240 },
      scale: { start: 0.85, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: FX_COLOR.crit,
    },
    shake: { intensity: 0.004, durationMs: 110 },
  },
  {
    id: "hurt-self",
    priority: 2,
    particles: {
      frames: ["ember", "dot"],
      count: 10,
      lifespan: { min: 200, max: 380 },
      speed: { min: 50, max: 150 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: FX_COLOR.hurt,
    },
  },
  {
    id: "hurt-heavy",
    priority: 2,
    particles: {
      frames: ["ember", "dot", "spark"],
      count: 14,
      lifespan: { min: 240, max: 440 },
      speed: { min: 70, max: 190 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: FX_COLOR.hurt,
    },
    shake: { intensity: 0.005, durationMs: 130 },
  },
  {
    id: "heal-glow",
    priority: 2,
    particles: {
      frames: ["dot", "petal"],
      count: 10,
      lifespan: { min: 500, max: 900 },
      speed: { min: 18, max: 50 },
      angle: { min: -130, max: -50 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: FX_COLOR.heal,
      gravityY: -20,
    },
  },
  {
    id: "mon-vanish",
    priority: 1,
    particles: {
      frames: ["dot", "ember"],
      count: 12,
      lifespan: { min: 500, max: 900 },
      speed: { min: 12, max: 50 },
      scale: { start: 0.45, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: FX_COLOR.vanish,
      gravityY: -30,
    },
  },
];
