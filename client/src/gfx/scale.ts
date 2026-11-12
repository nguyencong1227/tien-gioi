/**
 * Scale Manager + DPR của M5 (issue #324, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 5).
 *
 * Trước đây Phaser dùng `Scale.RESIZE`: canvas bằng CSS px nên MỜ trên màn hình mật độ cao (DPR 2-3). Spike (Chrome
 * thật, Phaser 3.90, DPR 1 / 2 / 3, đo `canvas.width`, kích thước hiển thị và toạ độ chạm) cho thấy:
 *   - `RESIZE` giữ canvas = CSS px ở mọi DPR (mờ); `RESIZE + zoom` KHÔNG có tác dụng (zoom bị bỏ qua);
 *   - `NONE` + `width/height = css * rs` + `zoom = 1/rs` + (khi đổi kích thước) `scale.resize()` và `setZoom()`:
 *     DPR 2 -> canvas 780x1688 hiển thị 390x844, `displayScale` = 2, toạ độ chạm sai số 0 ở 3 điểm, đúng cả sau khi xoay.
 * Nên chọn `NONE` + `zoom`, do `attachScale()` điều khiển theo `DisplayInfo` (kích thước logic) và hồ sơ chất lượng
 * (`renderScaleMax`, `maxPixels`). Camera: luật `fitZoom` giữ NGUYÊN theo đơn vị CSS rồi nhân `renderScale` vào
 * `camera.zoom`, nên vùng nhìn trong thế giới (`canvas / (zoom * rs)`) không đổi và ràng buộc vùng nhìn của server
 * (`VIEW_ENTER = 1100` px) vẫn giữ.
 *
 * Giới hạn FPS: `fps.limit = 30` của Phaser ra ~21 FPS trên màn 60 Hz (khung 16,67 ms x 2 = 33,33 ms rơi ngay dưới
 * ngưỡng `1000/30`, nên cứ ba khung mới vẽ một lần; đo thật). Ngưỡng 31 ra đúng 30 FPS ở 60 / 90 / 120 Hz.
 */

/** Vùng nhìn tối đa theo chiều ngang / dọc (px thế giới): `VIEW_ENTER` của server là 1100 (xem `interest.ts`). */
export const VIEW_MAX_W = 1900;
export const VIEW_MAX_H = 1100;
export const MIN_RENDER_SCALE = 0.5;
/** Ngưỡng bộ giới hạn FPS của Phaser cho mục tiêu 30 FPS (xem ghi chú đầu tệp). */
export const FPS_LIMIT_FOR_30 = 31;

/**
 * Hệ số zoom camera theo ĐƠN VỊ CSS (luật cũ của `WorldScene`): zoom cơ sở theo cạnh ngắn, kẹp 0,75-1,3, rồi nâng lên
 * đủ để vùng nhìn nằm gọn trong vùng nhìn của server (`w / zoom <= 1900`, `h / zoom <= 1100`).
 */
export function fitZoom(cssW: number, cssH: number): number {
  const minZoom = Math.max(0.75, cssW / VIEW_MAX_W, cssH / VIEW_MAX_H);
  const base = Math.min(1.3, Math.max(0.75, Math.min(cssW, cssH) / 640));
  return Math.max(base, minZoom);
}

export interface RenderScaleProfile {
  renderScaleMax: number;
  maxPixels: number;
}

/**
 * Hệ số nhân canvas: `clamp(dpr, 1, renderScaleMax)`, rồi hạ nếu tổng điểm ảnh `cssW*cssH*rs^2` vượt `maxPixels`
 * (có thể < 1, sàn 0,5), làm tròn XUỐNG bội 0,05 để kích thước canvas ổn định.
 */
export function computeRenderScale(
  cssW: number,
  cssH: number,
  dpr: number,
  profile: RenderScaleProfile,
): number {
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  let rs = Math.min(Math.max(Number.isFinite(dpr) ? dpr : 1, 1), profile.renderScaleMax);
  if (w * h * rs * rs > profile.maxPixels) rs = Math.sqrt(profile.maxPixels / (w * h));
  rs = Math.max(MIN_RENDER_SCALE, rs);
  return Math.floor(rs * 20 + 1e-9) / 20;
}

/** Kích thước canvas (điểm ảnh) cho khung nhìn logic (CSS px) và hệ số nhân. */
export function canvasSizeFor(
  cssW: number,
  cssH: number,
  rs: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(cssW * rs)),
    height: Math.max(1, Math.round(cssH * rs)),
  };
}

/** Đổi toạ độ con trỏ của Phaser (điểm ảnh canvas) về CSS px (để đặt phần tử DOM, vd menu người chơi). */
export function toCssPoint(
  x: number,
  y: number,
  displayScale: { x: number; y: number },
): { x: number; y: number } {
  const sx = displayScale.x > 0 ? displayScale.x : 1;
  const sy = displayScale.y > 0 ? displayScale.y : 1;
  return { x: x / sx, y: y / sy };
}

/** Giá trị `fps.limit` của Phaser cho mục tiêu FPS (0 = không giới hạn). */
export function fpsLimitFor(targetFps: 30 | 60): number {
  return targetFps === 30 ? FPS_LIMIT_FOR_30 : 0;
}

// --- Phần gắn vào Phaser (kiểu tối thiểu để test không cần Phaser) ---

export interface ScaleLike {
  width: number;
  height: number;
  resize(w: number, h: number): void;
  setZoom(z: number): void;
}
export interface LoopLike {
  hasFpsLimit: boolean;
  fpsLimit: number;
  _limitRate: number;
  stop(): void;
  start(cb: unknown): void;
}
export interface GameLike {
  scale: ScaleLike;
  canvas: { style: { width: string; height: string } };
  loop: LoopLike;
  step: unknown;
}

/**
 * Đổi giới hạn FPS LÚC CHẠY. Phaser 3.90 chỉ gắn bộ giới hạn khi khởi động vòng lặp, nên phải dừng rồi chạy lại
 * (đụng `hasFpsLimit` / `_limitRate` nội bộ: đã đo thật 60 -> 30 -> 60 FPS; E2E `e2e:dpr` giữ). Trả về false nếu
 * phiên bản Phaser không có các trường đó (giữ nguyên, không làm hỏng vòng lặp).
 */
export function setFpsLimit(game: GameLike, limit: number): boolean {
  const loop = game.loop as Partial<LoopLike>;
  if (
    typeof loop.stop !== "function" ||
    typeof loop.start !== "function" ||
    typeof loop.hasFpsLimit !== "boolean" ||
    typeof loop._limitRate !== "number"
  ) {
    return false;
  }
  const want = limit > 0;
  if (loop.hasFpsLimit === want && (!want || loop.fpsLimit === limit)) return true;
  loop.stop();
  loop.fpsLimit = want ? limit : 0;
  loop.hasFpsLimit = want;
  loop._limitRate = want ? 1000 / limit : 0;
  loop.start((game.step as () => void).bind(game));
  return true;
}

export interface ScaleDeps {
  getDisplay(): { cssW: number; cssH: number; dpr: number };
  onDisplayChange(cb: () => void): () => void;
  getQuality(): RenderScaleProfile & { targetFps: 30 | 60 };
  onQualityChange(cb: () => void): () => void;
  setRenderScale(rs: number): void;
}

/**
 * Giữ canvas Phaser khớp khung nhìn logic + hệ số nhân + giới hạn FPS. Trả về `{ stop, apply }`. Việc áp dụng được
 * hoãn tới cuối tác vụ hiện tại (vi tác vụ) để không đổi kích thước giữa một bước của vòng lặp Phaser (bộ điều tốc
 * có thể đổi bậc ngay trong `POST_STEP`).
 */
export function attachScale(
  game: GameLike,
  deps: ScaleDeps,
  schedule: (fn: () => void) => void = (fn) => queueMicrotask(fn),
): { stop(): void; apply(): void } {
  let queued = false;
  let stopped = false;
  const apply = (): void => {
    queued = false;
    if (stopped) return;
    const d = deps.getDisplay();
    const q = deps.getQuality();
    const rs = computeRenderScale(d.cssW, d.cssH, d.dpr, q);
    const { width, height } = canvasSizeFor(d.cssW, d.cssH, rs);
    // Báo hệ số nhân TRƯỚC khi đổi kích thước: sự kiện `resize` của Phaser làm camera tính lại zoom và đọc `renderScale`
    deps.setRenderScale(rs);
    if (game.scale.width !== width || game.scale.height !== height)
      game.scale.resize(width, height);
    game.scale.setZoom(1 / rs);
    // `zoom` làm tròn kích thước hiển thị theo canvas / rs; ép đúng bằng khung nhìn logic để không hở / tràn
    game.canvas.style.width = `${d.cssW}px`;
    game.canvas.style.height = `${d.cssH}px`;
    setFpsLimit(game, fpsLimitFor(q.targetFps));
  };
  const request = (): void => {
    if (queued || stopped) return;
    queued = true;
    schedule(apply);
  };
  const offA = deps.onDisplayChange(request);
  const offB = deps.onQualityChange(request);
  apply();
  return {
    apply,
    stop() {
      stopped = true;
      offA();
      offB();
    },
  };
}
