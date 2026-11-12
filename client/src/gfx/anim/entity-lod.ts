/**
 * Mức chi tiết theo khoảng cách / hồ sơ chất lượng cho thực thể (người chơi, quái) (M5.2, #328 phần 2b, mục 8):
 *  - hoạt ảnh thực thể Ở XA chỉ cập nhật theo `farAnimHz`;
 *  - bóng đốm dưới chân theo cờ `blobShadows`;
 *  - nhãn tên theo `nameLabelRadius`.
 * Phần THUẦN (test không cần Phaser) + `ensureShadowTexture` (texture bóng vẽ bằng mã, dùng chung).
 */
import type Phaser from "phaser";
import { animTickDue } from "./mon-anim";

/** Từ khoảng cách này (px thế giới, tới nhân vật của mình) trở ra thì thực thể coi là "ở xa" cho hoạt ảnh. */
export const FAR_ANIM_DIST = 420;

/**
 * Có nên cập nhật trạng thái hoạt ảnh của thực thể ở khung này không. Gần thì luôn; xa thì chỉ theo nhịp `farHz`
 * (`animTickDue`). Khoảng cách / giờ hỏng thì coi là GẦN (không bao giờ đóng băng hoạt ảnh vì số rác).
 */
export function animUpdateDue(
  nowMs: number,
  lastAnimMs: number,
  distToMe: number,
  farHz: number,
): boolean {
  if (!Number.isFinite(distToMe) || !Number.isFinite(nowMs) || !Number.isFinite(lastAnimMs))
    return true;
  if (distToMe < FAR_ANIM_DIST) return true;
  return animTickDue(nowMs, lastAnimMs, farHz);
}

/** Nhãn tên người chơi: của mình luôn hiện; người khác khi không ẩn tên và trong bán kính của hồ sơ chất lượng. */
export function labelVisible(
  isMe: boolean,
  hideNames: boolean,
  distToMe: number,
  radius: number,
): boolean {
  if (isMe) return true;
  if (hideNames) return false;
  return Number.isFinite(distToMe) && distToMe <= radius;
}

export const SHADOW_KEY = "blob-shadow";
export const SHADOW_TEX_W = 64;
export const SHADOW_TEX_H = 28;
/** Độ đậm ảnh bóng (nhân với độ đậm trong texture). */
export const SHADOW_ALPHA = 0.55;

export interface ShadowDims {
  /** Kích thước hiển thị (px thế giới). */
  w: number;
  h: number;
  /** Độ lệch dọc so với gốc của thực thể (xuống chân). */
  y: number;
}

/**
 * Bóng người chơi: cố định theo cỡ nhân vật. Sprite cao 40 đặt ở y = -12 nên phủ tới ~ +8: đặt bóng thấp hơn (tâm +9) để phần
 * dưới chân lộ ra khỏi sprite (bóng vẽ DƯỚI sprite).
 */
export function playerShadow(): ShadowDims {
  return { w: 26, h: 11, y: 9 };
}

/** Bóng quái theo bán kính thân (`MonsterDef.radius`); bán kính lạ thì dùng cỡ nhỏ nhất. */
export function monsterShadow(radius: number): ShadowDims {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 8;
  const w = Math.max(16, Math.min(120, Math.round(r * 2.3)));
  return { w, h: Math.round(w * 0.42), y: Math.round(r * 0.95) };
}

/** Dựng (một lần) texture bóng: elip tối ở giữa, mờ dần ra rìa (đen, độ đục theo gradient). */
export function ensureShadowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(SHADOW_KEY)) return;
  const t = scene.textures.createCanvas(SHADOW_KEY, SHADOW_TEX_W, SHADOW_TEX_H)!;
  const c = t.getContext();
  c.save();
  c.translate(SHADOW_TEX_W / 2, SHADOW_TEX_H / 2);
  c.scale(1, SHADOW_TEX_H / SHADOW_TEX_W); // vòng tròn -> elip dẹt
  const g = c.createRadialGradient(0, 0, 0, 0, 0, SHADOW_TEX_W / 2);
  g.addColorStop(0, "rgba(0,0,0,0.85)");
  g.addColorStop(0.55, "rgba(0,0,0,0.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(-SHADOW_TEX_W / 2, -SHADOW_TEX_W / 2, SHADOW_TEX_W, SHADOW_TEX_W);
  c.restore();
  t.refresh();
}
