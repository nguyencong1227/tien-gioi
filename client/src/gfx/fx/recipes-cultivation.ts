/**
 * Công thức hiệu ứng nhóm TU LUYỆN (M5.2, #329, mục 7.2): lên cấp, đột phá cảnh giới, đột phá thất bại, hào quang thiền định.
 *
 * CHỈ là dữ liệu (xem `recipes-combat.ts` về vòng import). Mỗi công thức là MỘT emitter nên khung hạt dùng chung một kiểu chuyển
 * động: vòng sóng (`ring`, đứng yên, phình ra) và tia / hạt sáng bay lên là hai công thức riêng, `cultivation-fx.ts` ghép lại.
 * Không truyền `opts.angle` (lõi sẽ ép nón ±20° đè `particles.angle`); hướng bay đã nằm trong dữ liệu.
 * `flash` chỉ phát khi ưu tiên 2 (của mình) và hồ sơ cho chớp (giảm chuyển động tắt).
 */
import type { FxRecipe } from "./recipes";

export const CULTIVATION_COLOR = {
  levelup: 0xbfe8ff,
  breakthrough: 0xffd34d,
  smoke: 0x6a3a7a,
  mote: 0xffe9a0,
} as const;

export const CULTIVATION_RECIPES: readonly FxRecipe[] = [
  {
    // Lên cấp thường: hai vòng sóng xanh nhạt lệch pha (tuổi thọ khác nhau nên kích thước khác nhau tại mỗi thời điểm)
    id: "levelup-ring",
    priority: 1,
    particles: {
      frames: ["ring"],
      count: 2,
      lifespan: { min: 450, max: 750 },
      speed: { min: 0, max: 0 },
      scale: { start: 0.4, end: 4.5 },
      alpha: { start: 0.9, end: 0 },
      tint: CULTIVATION_COLOR.levelup,
    },
  },
  {
    id: "levelup-glow",
    priority: 1,
    particles: {
      frames: ["dot", "spark"],
      count: 10,
      lifespan: { min: 500, max: 900 },
      speed: { min: 30, max: 90 },
      angle: { min: -125, max: -55 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: 0xdff4ff,
      gravityY: -30,
    },
  },
  {
    // Đột phá cảnh giới: ba vòng nổ vàng phình tới ~110 px
    id: "breakthrough-ring",
    priority: 2,
    particles: {
      frames: ["ring"],
      count: 3,
      lifespan: { min: 500, max: 1000 },
      speed: { min: 0, max: 0 },
      scale: { start: 0.4, end: 8 },
      alpha: { start: 0.9, end: 0 },
      tint: CULTIVATION_COLOR.breakthrough,
    },
  },
  {
    // Cột sáng bay thẳng lên + chớp nhẹ toàn màn hình (chỉ của mình, tắt khi giảm chuyển động)
    id: "breakthrough-pillar",
    priority: 2,
    particles: {
      frames: ["spark", "dot", "ember"],
      count: 28,
      lifespan: { min: 600, max: 1100 },
      speed: { min: 120, max: 360 },
      angle: { min: -96, max: -84 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xffe9a8,
    },
    flash: { color: 0xfff0c0, durationMs: 260 },
  },
  {
    id: "breakfail-smoke",
    priority: 1,
    particles: {
      frames: ["smoke"],
      count: 10,
      lifespan: { min: 600, max: 1000 },
      speed: { min: 10, max: 45 },
      scale: { start: 0.6, end: 1.8 },
      alpha: { start: 0.6, end: 0 },
      tint: CULTIVATION_COLOR.smoke,
      blend: "normal",
      gravityY: -15,
    },
  },
  {
    // Hào quang thiền định: vài đốm sáng trôi lên, phát lại định kỳ cho từng người đang đả tọa (ưu tiên 0 / 1 để ngân sách chừa chỗ cho chiến đấu)
    id: "meditate-mote",
    priority: 0,
    particles: {
      frames: ["dot"],
      count: 3,
      lifespan: { min: 900, max: 1400 },
      speed: { min: 8, max: 20 },
      angle: { min: -110, max: -70 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: CULTIVATION_COLOR.mote,
      gravityY: -10,
    },
  },
];
