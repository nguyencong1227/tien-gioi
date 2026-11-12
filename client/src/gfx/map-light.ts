/**
 * Ánh sáng môi trường + vignette theo bản đồ (M5.3, #332 bước 2b, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 9).
 *
 * Hai ảnh phủ cố định theo MÀN HÌNH (scrollFactor 0), một ảnh trắng 4x4 nhuộm màu môi trường (`ambient`) và một ảnh gradient
 * 128x128 tối dần ra mép (`vignette`), cả hai kéo giãn cho đủ khung nhìn: hai draw call gộp lô với phần còn lại, texture
 * ~64 KB dùng chung mọi bản đồ (màu / độ đậm đến từ `MapStyle`, nhuộm bằng `tint` + `alpha`).
 *
 * Tách phần THUẦN (`planLight`, `vignetteAlphaAt`, `lightRect`: test không cần Phaser) khỏi phần vẽ (`ensureLightTextures`).
 * Bật / tắt theo hồ sơ chất lượng (`ambient` / `vignette`: bậc Thấp không có cả hai).
 */
import type Phaser from "phaser";
import type { MapStyle } from "./map-style";

export const LIGHT_WHITE_KEY = "light-white";
export const VIGNETTE_KEY = "light-vignette";
export const VIGNETTE_SIZE = 128;
/** Phần bán kính đầu KHÔNG tối (vùng chơi giữa màn hình luôn sạch). */
export const VIGNETTE_CLEAR = 0.45;
/** Bán kính gradient so với nửa cạnh ảnh: > 1 để giữa cạnh màn hình chưa tối hết, góc thì tối hết. */
export const VIGNETTE_RADIUS = 1.15;
/** Phủ thừa mỗi cạnh một chút để không hở mép khi làm tròn điểm ảnh / thu phóng. */
export const LIGHT_OVERSCAN = 1.04;

export interface LightLayer {
  color: number;
  alpha: number;
}
export interface LightPlan {
  ambient: LightLayer | null;
  vignette: LightLayer | null;
}

/** Lớp nào hiện, màu / độ đậm gì: kiểu bản đồ giao với cờ của hồ sơ chất lượng. Độ đậm 0 coi như tắt. */
export function planLight(
  style: MapStyle,
  flags: { ambient: boolean; vignette: boolean },
): LightPlan {
  return {
    ambient:
      flags.ambient && style.ambient.alpha > 0
        ? { color: style.ambient.color, alpha: style.ambient.alpha }
        : null,
    vignette:
      flags.vignette && style.vignette.strength > 0
        ? { color: style.vignette.color, alpha: style.vignette.strength }
        : null,
  };
}

/** Độ đục (0..1) của gradient tại khoảng cách `t` (0 = tâm, 1 = cuối gradient): 0 trong vùng sạch rồi smoothstep. */
export function vignetteAlphaAt(t: number): number {
  if (!Number.isFinite(t) || t <= VIGNETTE_CLEAR) return 0;
  if (t >= 1) return 1;
  const u = (t - VIGNETTE_CLEAR) / (1 - VIGNETTE_CLEAR);
  return u * u * (3 - 2 * u);
}

export interface LightRect {
  /** Tâm (px màn hình, gốc ảnh 0,5 / 0,5), cạnh (px THẾ GIỚI: đã nhân thu phóng ngược của camera). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Chỗ đặt ảnh phủ scrollFactor 0 để che đủ khung nhìn: tâm ở giữa camera (điểm bất động khi thu phóng), cạnh = kích thước
 * khung nhìn trong thế giới (`displayWidth` / `displayHeight` của camera đã tính thu phóng) nhân `LIGHT_OVERSCAN`.
 * Số liệu hỏng / không dương: `null` (không đặt gì thay vì đặt ảnh kích thước NaN).
 */
export function lightRect(
  camW: number,
  camH: number,
  dispW: number,
  dispH: number,
): LightRect | null {
  for (const v of [camW, camH, dispW, dispH]) if (!Number.isFinite(v) || v <= 0) return null;
  return { x: camW / 2, y: camH / 2, w: dispW * LIGHT_OVERSCAN, h: dispH * LIGHT_OVERSCAN };
}

/** Dựng (một lần) hai texture dùng chung. */
export function ensureLightTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(LIGHT_WHITE_KEY)) {
    const t = scene.textures.createCanvas(LIGHT_WHITE_KEY, 4, 4)!;
    const c = t.getContext();
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, 4, 4);
    t.refresh();
  }
  if (!scene.textures.exists(VIGNETTE_KEY)) {
    const t = scene.textures.createCanvas(VIGNETTE_KEY, VIGNETTE_SIZE, VIGNETTE_SIZE)!;
    const c = t.getContext();
    const mid = VIGNETTE_SIZE / 2;
    const g = c.createRadialGradient(mid, mid, 0, mid, mid, mid * VIGNETTE_RADIUS);
    for (let i = 0; i <= 16; i++)
      g.addColorStop(i / 16, `rgba(255,255,255,${vignetteAlphaAt(i / 16)})`);
    c.fillStyle = g;
    c.fillRect(0, 0, VIGNETTE_SIZE, VIGNETTE_SIZE);
    t.refresh();
  }
}
