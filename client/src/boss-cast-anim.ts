// Hoạt ảnh GỒNG / ĐÁP của chính con trùm khi vận chiêu (QUYET_DINH_M3 mục 42, issue T4 #873; docs/THIET_KE_TRUM.md mục 5). Lớp THUẦN (không DOM / Phaser) nên test được.
//
// Vùng cảnh báo trên đất cho biết CHỖ nào nguy hiểm; hoạt ảnh này cho biết CON TRÙM NÀO đang vận chiêu và LÚC NÀO đáp, ngay trên thân nó:
//   - gồng (0 .. ms): thân co thấp, nở ngang, càng lúc càng nặng (tăng tốc) và ngả dần sang đỏ cam: người chơi nhìn con trùm mà đoán được lúc đòn rơi;
//   - đáp (ms .. ms + BOSS_STRIKE_MS): bật vươn cao, hẹp ngang rồi trả về, ánh đỏ tắt dần;
//   - GIẢM CHUYỂN ĐỘNG: không co giãn gì cả, chỉ ánh màu (cùng nhịp). Màu không là dấu hiệu DUY NHẤT: thanh máu trùm đã có tên chiêu bằng chữ, vùng cảnh báo có hoa văn riêng.
// Đồng hồ (`elapsedMs`) tính từ lúc nhận `fx bossCast` (đồng hồ cảnh), `castMs` là `bossCast.ms` (từ lúc báo tới lúc đòn rơi).
import type { SpriteTween } from "./gfx/anim/tween";

/** Thời gian "đáp" (ms) sau lúc đòn rơi: thân bật vươn rồi trả về. */
export const BOSS_STRIKE_MS = 160;
/** Mức co / nở cực đại lúc gồng (cộng vào tỉ lệ 1): nở ngang, co thấp. */
export const BOSS_WINDUP_SX = 0.1;
export const BOSS_WINDUP_SY = -0.08;
/** Mức vươn lúc đáp (đỉnh, giảm dần về 0): hẹp ngang, cao thêm. */
export const BOSS_STRIKE_SX = -0.08;
export const BOSS_STRIKE_SY = 0.12;
/** Ánh đỏ cam pha vào màu gốc (nhân với `glow`). */
export const BOSS_GLOW_COLOR = 0xff7a5c;
/** Số bậc lượng tử hoá của ánh (đổi `setTint` chỉ khi sang bậc khác: không gọi mỗi khung). */
export const BOSS_GLOW_STEPS = 8;

export type BossCastPhase = "none" | "windup" | "strike";

export interface BossCastPose {
  phase: BossCastPhase;
  /** Hệ số nhân tỉ lệ ngang / dọc lên tween nền (1 = không đổi) */
  sx: number;
  sy: number;
  /** Ánh đỏ cam 0..1 (0 = không ánh) */
  glow: number;
}

/** Không đang vận chiêu: tư thế trung tính (dùng chung một đối tượng, chỉ đọc). */
export const NEUTRAL_POSE: Readonly<BossCastPose> = Object.freeze({
  phase: "none",
  sx: 1,
  sy: 1,
  glow: 0,
});

/**
 * Tư thế của trùm `elapsedMs` sau lúc báo chiêu có `castMs` gồng. Số hỏng (NaN, âm, `castMs` <= 0) hoặc đã qua đòn đáp: trung tính.
 * Giảm chuyển động: tỉ lệ luôn 1, chỉ còn `glow` (cùng nhịp gồng / đáp).
 */
export function bossCastPose(elapsedMs: number, castMs: number, reduced: boolean): BossCastPose {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(castMs) || castMs <= 0 || elapsedMs < 0)
    return NEUTRAL_POSE;
  if (elapsedMs < castMs) {
    const t = elapsedMs / castMs;
    const e = t * t; // tăng tốc: nặng dần về phía đòn rơi
    return {
      phase: "windup",
      sx: reduced ? 1 : 1 + BOSS_WINDUP_SX * e,
      sy: reduced ? 1 : 1 + BOSS_WINDUP_SY * e,
      glow: t,
    };
  }
  const since = elapsedMs - castMs;
  if (since >= BOSS_STRIKE_MS) return NEUTRAL_POSE;
  const k = 1 - since / BOSS_STRIKE_MS; // đỉnh lúc đòn rơi rồi tắt dần
  return {
    phase: "strike",
    sx: reduced ? 1 : 1 + BOSS_STRIKE_SX * k,
    sy: reduced ? 1 : 1 + BOSS_STRIKE_SY * k,
    glow: k,
  };
}

/**
 * Ghép tư thế gồng / đáp lên tween nền của sprite (đi bộ, đánh, bị đánh): nhân tỉ lệ, giữ `dy`. Tư thế trung tính trả NGUYÊN đối tượng
 * `base` (để nơi gọi so sánh với `NEUTRAL_TWEEN` như cũ, không tạo đối tượng mới mỗi khung).
 */
export function composeTween(
  base: Readonly<SpriteTween>,
  pose: Readonly<BossCastPose>,
): SpriteTween {
  if (pose === NEUTRAL_POSE || (pose.sx === 1 && pose.sy === 1)) return base;
  return { dy: base.dy, sx: base.sx * pose.sx, sy: base.sy * pose.sy };
}

/** Lượng tử hoá ánh về bậc nguyên 0..BOSS_GLOW_STEPS (số hỏng -> 0). */
export function bossGlowStep(glow: number): number {
  if (!Number.isFinite(glow) || glow <= 0) return 0;
  return Math.min(BOSS_GLOW_STEPS, Math.round(glow * BOSS_GLOW_STEPS));
}

/** Màu `setTint` cho bậc ánh `step` (0 = trắng = không đổi màu gốc): pha từ trắng sang `BOSS_GLOW_COLOR`. */
export function bossGlowTint(step: number): number {
  const f = Math.min(1, Math.max(0, Number.isFinite(step) ? step / BOSS_GLOW_STEPS : 0));
  const ch = (shift: number) => {
    const to = (BOSS_GLOW_COLOR >> shift) & 0xff;
    return Math.round(255 + (to - 255) * f);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
