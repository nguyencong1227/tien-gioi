/**
 * Công thức hiệu ứng theo DỮ LIỆU (M5.2, #325, mục 7.1 (2)): thêm hiệu ứng = thêm một mục dữ liệu, KHÔNG thêm nhánh `if`
 * trong `WorldScene`. Lõi (`fx.ts`) biết cách phát một công thức; B (#329) viết các công thức cụ thể.
 */
import type { FxPriority } from "./budget";
import { COMBAT_RECIPES } from "./recipes-combat";
import { CULTIVATION_RECIPES } from "./recipes-cultivation";
import { SKILL_RECIPES } from "./recipes-skill";
import { WORLD_RECIPES } from "./recipes-world";

/** Tên khung hình trong atlas hạt (`atlas.ts`). */
export type FxFrame = "dot" | "spark" | "ring" | "smoke" | "petal" | "ember";
export const FX_FRAMES: readonly FxFrame[] = ["dot", "spark", "ring", "smoke", "petal", "ember"];

export interface FxRange {
  min: number;
  max: number;
}

export interface FxParticles {
  frames: readonly FxFrame[];
  /** Số hạt phát ra một lần. */
  count: number;
  /** Thời gian sống của hạt (ms). */
  lifespan: FxRange;
  /** Tốc độ ban đầu (px thế giới / giây). */
  speed: FxRange;
  /** Hướng phát (độ, 0 = sang phải); thiếu = mọi hướng. */
  angle?: FxRange;
  scale: { start: number; end: number };
  alpha: { start: number; end: number };
  /** Màu (0xRRGGBB); thiếu = trắng. */
  tint?: number;
  /** Cộng sáng (ADD, mặc định) hay thường (NORMAL, vd khói). */
  blend?: "add" | "normal";
  gravityY?: number;
}

export interface FxFlash {
  /** Chớp toàn màn hình (tắt khi giảm chuyển động). */
  color: number;
  durationMs: number;
}

export interface FxShake {
  /** Rung camera (tắt khi giảm chuyển động / hồ sơ không cho rung). */
  intensity: number;
  durationMs: number;
}

export interface FxRecipe {
  id: string;
  particles?: FxParticles;
  flash?: FxFlash;
  shake?: FxShake;
  /** Ưu tiên mặc định (người gọi có thể ghi đè bằng `opts.priority`). */
  priority: FxPriority;
}

const registry = new Map<string, FxRecipe>();

/** Kiểm một công thức (lỗi dữ liệu thì ném, để test / lúc nạp bắt sớm). */
export function validateRecipe(r: FxRecipe): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(r.id)) throw new Error(`Công thức id không hợp lệ: ${r.id}`);
  const p = r.particles;
  if (p) {
    if (!Number.isInteger(p.count) || p.count < 1 || p.count > 200)
      throw new Error(`${r.id}: count phải nguyên 1..200`);
    if (p.frames.length === 0) throw new Error(`${r.id}: thiếu frames`);
    for (const f of p.frames) if (!FX_FRAMES.includes(f)) throw new Error(`${r.id}: frame lạ ${f}`);
    if (!(p.lifespan.min > 0) || p.lifespan.max < p.lifespan.min || p.lifespan.max > 4000)
      throw new Error(`${r.id}: lifespan phải 0 < min <= max <= 4000 ms`);
    if (p.speed.min < 0 || p.speed.max < p.speed.min) throw new Error(`${r.id}: speed lạ`);
  }
  if (!r.particles && !r.flash && !r.shake) throw new Error(`${r.id}: công thức rỗng`);
}

export function registerRecipe(r: FxRecipe): void {
  validateRecipe(r);
  if (registry.has(r.id)) throw new Error(`Công thức trùng id: ${r.id}`);
  registry.set(r.id, r);
}

export function getRecipe(id: string): FxRecipe | undefined {
  return registry.get(id);
}

export function recipeIds(): string[] {
  return [...registry.keys()];
}

/** Chi phí ngân sách của một công thức (hạt, emitter, thời gian sống tối đa). */
export function recipeCost(
  r: FxRecipe,
  countScale = 1,
): { particles: number; emitters: number; ms: number } {
  const p = r.particles;
  if (!p) return { particles: 0, emitters: 0, ms: 0 };
  return {
    particles: Math.max(1, Math.round(p.count * countScale)),
    emitters: 1,
    ms: p.lifespan.max,
  };
}

// --- Công thức khung của lõi (chứng minh đường đi từ đầu tới cuối; B thêm các công thức thật ở #329) ---
registerRecipe({
  id: "hit-spark",
  priority: 1,
  particles: {
    frames: ["spark", "ember"],
    count: 8,
    lifespan: { min: 180, max: 320 },
    speed: { min: 60, max: 160 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: 0xffe9a8,
  },
});
// --- Công thức theo nhóm (B, #329): mảng dữ liệu ở `recipes-*.ts`, đăng ký ở đây ---
for (const r of COMBAT_RECIPES) registerRecipe(r);
for (const r of CULTIVATION_RECIPES) registerRecipe(r);
for (const r of WORLD_RECIPES) registerRecipe(r);
for (const r of SKILL_RECIPES) registerRecipe(r);

registerRecipe({
  id: "ambient-glimmer",
  priority: 0,
  particles: {
    frames: ["dot"],
    count: 4,
    lifespan: { min: 600, max: 1100 },
    speed: { min: 4, max: 14 },
    scale: { start: 0.35, end: 0 },
    alpha: { start: 0.7, end: 0 },
    tint: 0xbfe8ff,
  },
});
