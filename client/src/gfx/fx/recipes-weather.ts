/**
 * Công thức THỜI TIẾT (M5.3, #332): cánh hoa đào (Lạc Hà), tro (Hắc Phong), linh khí (bí cảnh). CHỈ là dữ liệu.
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
];
