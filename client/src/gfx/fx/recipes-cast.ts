/**
 * Công thức hiệu ứng DÙNG CHIÊU (M7.7, #508): mỗi kiểu `SkillDef.fx` (`SKILL_FX_IDS`, danh sách ĐÓNG ở shared) có MỘT công thức hạt, id `cast-<fx>` (gạch
 * nối thay gạch dưới). CHỈ là dữ liệu (xem `recipes-combat.ts` về vòng import). Màu cuối do `opts.tint` (màu theo HỆ của chiêu, `cast-fx.ts`), nên
 * `tint` ở đây chỉ là màu dự phòng gần đúng hệ; điểm phát và số điểm do `planCastFx` quyết định theo hình chiêu và ngân sách emitter của bậc chất lượng.
 */
import type { SkillFxId } from "@tien-gioi/shared";
import type { FxRecipe } from "./recipes";

/** Id công thức của một kiểu hiệu ứng chiêu: `slash_fire` -> `cast-slash-fire`. */
export function castRecipeId(fx: SkillFxId): string {
  return `cast-${fx.replace(/_/g, "-")}`;
}

type Spec = Omit<FxRecipe, "id">;

/** Một mục cho mỗi `SKILL_FX_IDS` (kiểu `Record` ép phủ kín: thêm id ở shared mà quên ở đây là lỗi biên dịch). */
const SPECS: Record<SkillFxId, Spec> = {
  // vệt chém lửa: tàn lửa bắn ra nhanh, tan sớm
  slash_fire: {
    priority: 1,
    particles: {
      frames: ["ember", "spark"],
      count: 10,
      lifespan: { min: 200, max: 380 },
      speed: { min: 50, max: 150 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xff7a3a,
    },
  },
  // đấm đất: mảnh đá văng lên rồi rơi
  punch_earth: {
    priority: 1,
    particles: {
      frames: ["ember", "dot"],
      count: 9,
      lifespan: { min: 260, max: 480 },
      speed: { min: 30, max: 110 },
      scale: { start: 0.65, end: 0.1 },
      alpha: { start: 1, end: 0 },
      tint: 0xb8885a,
      gravityY: 220,
    },
  },
  // vuốt kim: tia sáng sắc, rất nhanh
  claw_metal: {
    priority: 1,
    particles: {
      frames: ["spark"],
      count: 10,
      lifespan: { min: 160, max: 300 },
      speed: { min: 80, max: 180 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xe0c25a,
    },
  },
  // chém đất: đá vụn nặng, rơi xuống
  slash_earth: {
    priority: 1,
    particles: {
      frames: ["ember", "dot"],
      count: 10,
      lifespan: { min: 280, max: 520 },
      speed: { min: 60, max: 140 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xa8784a,
      gravityY: 180,
    },
  },
  // băng bay: tinh thể và vòng sáng lạnh
  bolt_ice: {
    priority: 1,
    particles: {
      frames: ["spark", "ring"],
      count: 8,
      lifespan: { min: 280, max: 520 },
      speed: { min: 60, max: 140 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0x8fd8f0,
    },
  },
  // hộ thể kim: vòng sáng toả chậm
  aura_metal: {
    priority: 1,
    particles: {
      frames: ["ring", "spark"],
      count: 8,
      lifespan: { min: 400, max: 700 },
      speed: { min: 20, max: 70 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: 0xe0c25a,
    },
  },
  // hộ thể thuỷ: giọt nước và vòng gợn
  aura_water: {
    priority: 1,
    particles: {
      frames: ["ring", "dot"],
      count: 8,
      lifespan: { min: 450, max: 800 },
      speed: { min: 15, max: 60 },
      scale: { start: 0.75, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: 0x4a90e2,
    },
  },
  // bộ pháp gió: khói nhạt kéo vệt phía sau
  dash_wind: {
    priority: 1,
    particles: {
      frames: ["smoke", "dot"],
      count: 8,
      lifespan: { min: 250, max: 450 },
      speed: { min: 20, max: 80 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: 0x9fe3c2,
      blend: "normal",
    },
  },
  // kim châm mộc: tia nhỏ xanh lẫn cánh lá
  needle_wood: {
    priority: 1,
    particles: {
      frames: ["spark", "petal"],
      count: 8,
      lifespan: { min: 220, max: 420 },
      speed: { min: 70, max: 160 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0x5fbf6a,
    },
  },
  // quạt băng: nhiều mảnh băng toả ra
  fan_ice: {
    priority: 1,
    particles: {
      frames: ["spark", "ring"],
      count: 7,
      lifespan: { min: 260, max: 480 },
      speed: { min: 70, max: 150 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: 0xbfeaff,
    },
  },
  // vùng đặt xuống đất: bụi và tàn cuộn lên từ mặt đất
  ground_earth: {
    priority: 1,
    particles: {
      frames: ["smoke", "ember"],
      count: 12,
      lifespan: { min: 450, max: 800 },
      speed: { min: 20, max: 90 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: 0xb8885a,
      blend: "normal",
    },
  },
  // hộ thể phong: vòng gió xoáy nhẹ
  aura_wind: {
    priority: 1,
    particles: {
      frames: ["ring", "dot", "petal"],
      count: 9,
      lifespan: { min: 400, max: 700 },
      speed: { min: 30, max: 90 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: 0x9fe3c2,
    },
  },
};

export const CAST_RECIPES: readonly FxRecipe[] = (Object.keys(SPECS) as SkillFxId[]).map((fx) => ({
  id: castRecipeId(fx),
  ...SPECS[fx],
}));
