/**
 * Công thức THỜI TIẾT (M5.3, #332): cánh hoa đào (Lạc Hà), tro (Hắc Phong), linh khí (bí cảnh), ma trơi (Âm Sương Trạch, M6 #408), tuyết (Hàn Vân Lĩnh, M7.8 #509). CHỈ là dữ liệu.
 *
 * Mỗi lần phát rải `count` (12) hạt ở điểm ngẫu nhiên trong `zone` (`opts.area` ghi đè theo khung nhìn), sống tới ~3,5 s; ưu tiên 0
 * (môi trường: tới 60 % trần, bị bỏ trước mọi hiệu ứng khác). Nhịp phát do `map-weather.ts` tính (số hạt / tốc độ) để một
 * thời tiết chỉ chiếm vài emitter. Không truyền `opts.angle`: hướng nằm trong `particles.angle` (lõi sẽ ép nón ±20°).
 */
import type { FxRecipe } from "./recipes";

export const WEATHER_COUNT = 12;

export const WEATHER_RECIPES: readonly FxRecipe[] = [
  {
    // Cánh hoa đào rơi chậm, trôi nhẹ sang phải
    id: "weather-petals",
    priority: 0,
    particles: {
      frames: ["petal"],
      count: WEATHER_COUNT,
      lifespan: { min: 2800, max: 3800 },
      speed: { min: 8, max: 26 },
      angle: { min: 40, max: 110 },
      scale: { start: 0.55, end: 0.35 },
      alpha: { start: 0.85, end: 0 },
      tint: 0xf6c5d4,
      blend: "normal",
      gravityY: 14,
      zone: { w: 1200, h: 700 },
    },
  },
  {
    // Tro xám bay chếch theo gió
    id: "weather-ash",
    priority: 0,
    particles: {
      frames: ["dot", "smoke"],
      count: WEATHER_COUNT,
      lifespan: { min: 2400, max: 3600 },
      speed: { min: 22, max: 58 },
      angle: { min: 15, max: 55 },
      scale: { start: 0.35, end: 0.2 },
      alpha: { start: 0.65, end: 0 },
      tint: 0xb9bcc6,
      blend: "normal",
      gravityY: 6,
      zone: { w: 1200, h: 700 },
    },
  },
  {
    // Đốm linh khí lam ngọc trôi lên (cộng sáng)
    id: "weather-spirit",
    priority: 0,
    particles: {
      frames: ["spark", "dot"],
      count: WEATHER_COUNT,
      lifespan: { min: 2600, max: 3800 },
      speed: { min: 10, max: 30 },
      angle: { min: 250, max: 290 },
      scale: { start: 0.5, end: 0.1 },
      alpha: { start: 0.9, end: 0 },
      tint: 0x8ff0ff,
      blend: "add",
      gravityY: -6,
      zone: { w: 1200, h: 700 },
    },
  },
  {
    // Ma trơi vàng lục lơ lửng trên đầm, trôi chậm ngang rồi tan (cộng sáng nhẹ): cùng chi phí với linh khí (12 hạt, <= 3,8 s)
    id: "weather-wisp",
    priority: 0,
    particles: {
      frames: ["dot", "spark"],
      count: WEATHER_COUNT,
      lifespan: { min: 2800, max: 3800 },
      speed: { min: 6, max: 20 },
      angle: { min: -170, max: -10 },
      scale: { start: 0.42, end: 0.12 },
      alpha: { start: 0.75, end: 0 },
      tint: 0xd2e68a,
      blend: "add",
      gravityY: -3,
      zone: { w: 1200, h: 700 },
    },
  },
  {
    // Tuyết rơi chậm chếch sang trái (gió bắc), trắng ngà, không cộng sáng; cùng chi phí với các loại khác (12 hạt, <= 3,8 s)
    id: "weather-snow",
    priority: 0,
    particles: {
      frames: ["dot"],
      count: WEATHER_COUNT,
      lifespan: { min: 2800, max: 3800 },
      speed: { min: 12, max: 34 },
      angle: { min: 70, max: 125 },
      scale: { start: 0.4, end: 0.25 },
      alpha: { start: 0.9, end: 0 },
      tint: 0xf2f8ff,
      blend: "normal",
      gravityY: 16,
      zone: { w: 1200, h: 700 },
    },
  },
];
