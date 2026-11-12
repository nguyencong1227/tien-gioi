/**
 * Sương trôi theo bản đồ (M5.3, #332 bước 2d, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 9): 4-8 mảng mềm (bậc Vừa / Cao) trôi
 * chậm ngang màn hình, màu / độ đậm / tốc độ từ `MapStyle.fog`. Mỗi mảng là MỘT ảnh (texture radial 128x128 dùng chung, nhuộm
 * bằng `tint`), cố định theo màn hình (scrollFactor 0), nên 8 mảng = 8 quad gộp lô, không thêm draw call.
 *
 * Hàm THUẦN (`planFog`, `fogPatchLayout`, `advanceU`, `fogRect`: test không cần Phaser) + `ensureFogTexture`. Vị trí mảng tính theo
 * TỈ LỆ khung nhìn (u, v) nên đúng ở mọi cỡ / thu phóng / DPR; bố cục tất định theo hạt giống (mọi lần vào bản đồ như nhau).
 */
import type Phaser from "phaser";
import { hash01 } from "./map-decor";
import type { MapStyle } from "./map-style";

export const FOG_KEY = "fog-blob";
export const FOG_SIZE = 128;
/** Mảng sương dẹt: cao = rộng x tỉ lệ này. */
export const FOG_ASPECT = 0.55;

export interface FogPlan {
  count: number;
  color: number;
  alpha: number;
  /** px thế giới / giây (nhân hệ số riêng của từng mảng). */
  speed: number;
}

/** Số mảng, màu, độ đậm, tốc độ: kiểu bản đồ giao với cờ / số mảng của hồ sơ chất lượng. `null` = không có sương. */
export function planFog(
  fog: MapStyle["fog"],
  flags: { fog: boolean; fogPatches: number },
): FogPlan | null {
  if (!flags.fog || !(flags.fogPatches > 0) || !(fog.alpha > 0)) return null;
  return {
    count: Math.floor(flags.fogPatches),
    color: fog.color,
    alpha: fog.alpha,
    speed: fog.speed,
  };
}

export interface FogPatch {
  /** Tâm theo tỉ lệ bề rộng / bề cao khung nhìn (0..1 là trong màn hình; mảng có thể nằm ngoài lúc trôi qua). */
  u: number;
  v: number;
  /** Bề rộng theo tỉ lệ bề rộng khung nhìn. */
  size: number;
  /** Hệ số tốc độ riêng (mỗi mảng trôi nhanh chậm khác nhau để không thành một khối). */
  speed: number;
}

/** Bố cục tất định của `count` mảng: rải đều theo chiều ngang, lệch dọc / cỡ / tốc độ theo băm của `seed`. */
export function fogPatchLayout(count: number, seed: number): FogPatch[] {
  const n = Math.max(0, Math.floor(count));
  const out: FogPatch[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      u: (i + hash01(seed, i, 1, 0x61)) / n,
      v: 0.15 + 0.75 * hash01(seed, i, 2, 0x62),
      size: 0.45 + 0.35 * hash01(seed, i, 3, 0x63),
      speed: 0.6 + 0.8 * hash01(seed, i, 4, 0x64),
    });
  }
  return out;
}

/**
 * Dời tâm mảng sang phải `speedPxS * factor * dtMs` px (theo bề rộng khung nhìn thế giới `dispW`); trôi hết ra khỏi mép phải thì
 * quay lại từ mép trái (cả hai lúc mảng nằm hoàn toàn ngoài màn hình nên không thấy nhảy). Số rác / `dt` âm: giữ nguyên.
 */
export function advanceU(
  u: number,
  dtMs: number,
  speedPxS: number,
  factor: number,
  dispW: number,
  size: number,
): number {
  if (![u, dtMs, speedPxS, factor, dispW, size].every(Number.isFinite) || dtMs <= 0 || dispW <= 0)
    return u;
  let nu = u + (speedPxS * factor * dtMs) / 1000 / dispW;
  if (nu - size / 2 > 1) nu -= 1 + size;
  return nu;
}

export interface FogRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Chỗ đặt ảnh sương (scrollFactor 0, gốc ảnh giữa): cùng quy ước với `lightRect` của map-light.ts (tâm camera + khung nhìn thế giới). */
export function fogRect(
  p: FogPatch,
  camW: number,
  camH: number,
  dispW: number,
  dispH: number,
): FogRect | null {
  for (const v of [camW, camH, dispW, dispH]) if (!Number.isFinite(v) || v <= 0) return null;
  const w = p.size * dispW;
  return {
    x: camW / 2 + (p.u - 0.5) * dispW,
    y: camH / 2 + (p.v - 0.5) * dispH,
    w,
    h: w * FOG_ASPECT,
  };
}

/** Dựng (một lần) texture mảng sương: trắng, đục ở giữa, mờ dần ra rìa (nhuộm màu bằng `tint`). */
export function ensureFogTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FOG_KEY)) return;
  const t = scene.textures.createCanvas(FOG_KEY, FOG_SIZE, FOG_SIZE)!;
  const c = t.getContext();
  const mid = FOG_SIZE / 2;
  const g = c.createRadialGradient(mid, mid, 0, mid, mid, mid);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, FOG_SIZE, FOG_SIZE);
  t.refresh();
}
