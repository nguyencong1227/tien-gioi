/**
 * Hệ thống chất lượng đồ hoạ M5 (issue #323, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 6).
 *
 * MỘT nguồn duy nhất cho mọi quyết định "vẽ bao nhiêu": hồ sơ Thấp / Vừa / Cao (`QualityProfile`), chế độ Tự động
 * (chọn theo thiết bị + bộ điều tốc hạ / nâng bậc theo thời gian khung đo được), giảm chuyển động, tiết kiệm pin.
 * Lớp hiệu ứng, trang trí bản đồ, hoạt ảnh, camera chỉ ĐỌC `getQuality()` và nghe `onQualityChange`; không ai
 * tự đọc `tg_low_fx` / `prefers-reduced-motion` nữa.
 *
 * Tách hàm thuần (`buildProfile`, `pickInitialTier`, `FrameGovernor`) khỏi bộ điều khiển nhận `QualityEnv` tiêm vào
 * (client không có jsdom): mọi thứ test được bằng đối tượng giả và đồng hồ giả. Bộ điều tốc đo bằng TỔNG thời gian
 * khung hợp lệ (không dùng đồng hồ tường) nên tất định.
 */

export type Tier = "low" | "mid" | "high";
export type QualityMode = "auto" | Tier;
import type { FormFactor } from "./display";
export type { FormFactor };

export const TIERS: readonly Tier[] = ["low", "mid", "high"] as const;
export const QUALITY_STORAGE_KEY = "tg_quality";
export const BATTERY_SAVER_STORAGE_KEY = "tg_battery_saver";
/** Khoá cũ (bool); di cư: `tg_low_fx=1` mà chưa chọn chất lượng thì thành `low`. */
export const LEGACY_LOW_FX_KEY = "tg_low_fx";

export interface QualityProfile {
  tier: Tier;
  /** Chế độ người chơi chọn (`auto` nghĩa là `tier` do thiết bị + bộ điều tốc quyết định). */
  mode: QualityMode;
  /** Trần hệ số nhân DPR cho canvas (#324). */
  renderScaleMax: number;
  /** Trần tổng điểm ảnh canvas = cssW * cssH * renderScale^2 (#324). */
  maxPixels: number;
  /** Số hạt sống tối đa toàn cảnh. */
  particleBudget: number;
  /** Số emitter hoạt động tối đa. */
  emitterBudget: number;
  /** Số chữ bay (sát thương / hồi máu) tối đa cùng lúc. */
  damageNumbers: number;
  /** Ánh sáng môi trường. */
  ambient: boolean;
  /** Sương: bật / tắt và số mảng. */
  fog: boolean;
  fogPatches: number;
  weather: "off" | "light" | "full";
  blobShadows: boolean;
  vignette: boolean;
  /** Hậu xử lý bloom (chỉ máy tính, WebGL). */
  bloom: boolean;
  /** Tần số cập nhật hoạt ảnh thực thể ở xa (Hz). */
  farAnimHz: number;
  /** Ngoài bán kính này (px thế giới) ẩn tên người chơi. */
  nameLabelRadius: number;
  /** Rung màn hình (đã tính giảm chuyển động). */
  shake: boolean;
  /** Chớp sáng toàn màn hình (đột phá...). */
  flashes: boolean;
  /** Chuyển cảnh chỉ mờ dần (không trượt / mống mắt). */
  fadeOnly: boolean;
  targetFps: 30 | 60;
  reducedMotion: boolean;
  batterySaver: boolean;
}

/** Số liệu BAN ĐẦU của mục 6.2 (C đo, A chỉnh; kết quả ghi vào docs/HIEU_NANG_DI_DONG.md). */
interface TierBase {
  renderScaleMax: number;
  maxPixels: number;
  particleBudget: number;
  emitterBudget: number;
  damageNumbers: number;
  ambient: boolean;
  fogPatches: number;
  weather: "off" | "light" | "full";
  blobShadows: boolean;
  vignette: boolean;
  bloom: boolean;
  farAnimHz: number;
  nameLabelRadius: number;
}

export const TIER_BASE: Record<Tier, TierBase> = {
  low: {
    renderScaleMax: 1,
    maxPixels: 1_000_000,
    particleBudget: 60,
    emitterBudget: 4,
    damageNumbers: 8,
    ambient: false,
    fogPatches: 0,
    weather: "off",
    blobShadows: false,
    vignette: false,
    bloom: false,
    farAnimHz: 8,
    nameLabelRadius: 260,
  },
  mid: {
    renderScaleMax: 1.5,
    maxPixels: 2_200_000,
    particleBudget: 220,
    emitterBudget: 10,
    damageNumbers: 16,
    ambient: true,
    fogPatches: 4,
    weather: "light",
    blobShadows: true,
    vignette: true,
    bloom: false,
    farAnimHz: 15,
    nameLabelRadius: 420,
  },
  high: {
    renderScaleMax: 2,
    maxPixels: 4_200_000,
    particleBudget: 520,
    emitterBudget: 24,
    damageNumbers: 28,
    ambient: true,
    fogPatches: 8,
    weather: "full",
    blobShadows: true,
    vignette: true,
    bloom: true,
    farAnimHz: 30,
    nameLabelRadius: 640,
  },
};

/** Giảm chuyển động giữ lại bấy nhiêu phần ngân sách hạt (giảm 70 %). */
export const REDUCED_MOTION_PARTICLE_FACTOR = 0.3;

export interface ProfileContext {
  mode: QualityMode;
  reducedMotion: boolean;
  batterySaver: boolean;
  form: FormFactor;
}

/** Dựng hồ sơ từ bậc + ngữ cảnh (thuần). */
export function buildProfile(tier: Tier, ctx: ProfileContext): QualityProfile {
  const b = TIER_BASE[tier];
  const rm = ctx.reducedMotion;
  return {
    tier,
    mode: ctx.mode,
    renderScaleMax: b.renderScaleMax,
    maxPixels: b.maxPixels,
    particleBudget: rm
      ? Math.round(b.particleBudget * REDUCED_MOTION_PARTICLE_FACTOR)
      : b.particleBudget,
    emitterBudget: rm ? Math.max(1, Math.round(b.emitterBudget * 0.5)) : b.emitterBudget,
    damageNumbers: b.damageNumbers,
    ambient: b.ambient,
    fog: b.fogPatches > 0,
    fogPatches: b.fogPatches,
    weather: b.weather,
    blobShadows: b.blobShadows,
    vignette: b.vignette,
    // Hậu xử lý chỉ trên máy tính (không trên Android / máy tính bảng): quyết định đã chốt ở mục 14
    bloom: b.bloom && ctx.form === "desktop",
    farAnimHz: b.farAnimHz,
    nameLabelRadius: b.nameLabelRadius,
    shake: !rm,
    flashes: !rm,
    fadeOnly: rm,
    targetFps: ctx.batterySaver ? 30 : 60,
    reducedMotion: rm,
    batterySaver: ctx.batterySaver,
  };
}

export interface DeviceSignals {
  form: FormFactor;
  /** `navigator.hardwareConcurrency` */
  cores?: number;
  /** `navigator.deviceMemory` (GB, bị trình duyệt làm tròn / chặn trên Safari). */
  memoryGb?: number;
  /** Chuỗi GPU từ WEBGL_debug_renderer_info nếu đọc được. */
  gpu?: string;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * Chọn bậc ban đầu và TRẦN của thiết bị (bộ điều tốc không nâng quá trần). Thuần.
 * - Dựng hình bằng phần mềm: Thấp, trần Thấp.
 * - Máy tính: Cao (Vừa nếu < 4 lõi), trần Cao.
 * - Điện thoại / tablet: Vừa nếu >= 6 lõi và (RAM >= 4 GB hoặc không rõ RAM); còn lại Thấp. Trần Cao chỉ cho máy mạnh
 *   (>= 8 lõi và RAM >= 6 GB), còn lại trần Vừa.
 */
export function pickInitialTier(sig: DeviceSignals): { tier: Tier; ceiling: Tier } {
  if (sig.gpu && SOFTWARE_GPU.test(sig.gpu)) return { tier: "low", ceiling: "low" };
  const cores = sig.cores ?? 0;
  if (sig.form === "desktop") {
    return { tier: cores !== 0 && cores < 4 ? "mid" : "high", ceiling: "high" };
  }
  const memOk = sig.memoryGb === undefined || sig.memoryGb >= 4;
  const decent = cores >= 6 && memOk;
  const strong = cores >= 8 && sig.memoryGb !== undefined && sig.memoryGb >= 6;
  return { tier: decent ? "mid" : "low", ceiling: strong ? "high" : "mid" };
}

export function tierIndex(t: Tier): number {
  return TIERS.indexOf(t);
}

// --- Bộ điều tốc ---

export interface GovernorOptions {
  /** Độ dài cửa sổ đo (ms thời gian khung hợp lệ). */
  windowMs: number;
  /** p95 vượt mức này (ms) là cửa sổ XẤU (~45 FPS). */
  badP95Ms: number;
  /**
   * p95 dưới mức này (ms) là cửa sổ TỐT. PHẢI > chu kỳ làm tươi 60 Hz (16,7 ms): p95 của KHOẢNG CÁCH khung ở đúng 60 FPS
   * luôn >= 16,7 ms nên ngưỡng 14 ms (bản đầu) không bao giờ đạt trên màn 60 Hz và bộ điều tốc chỉ biết hạ, không biết nâng
   * (B đo thật: `p95 16.7-16.8 ms`, `tốt 0` sau nhiều chục giây). 19 ms = ~52 FPS xấu nhất; vùng chết 19-22 ms giữ trễ.
   */
  goodP95Ms: number;
  badWindowsToDown: number;
  goodWindowsToUp: number;
  /** Khoảng tối thiểu giữa hai lần đổi bậc (ms thời gian khung). */
  minChangeGapMs: number;
  /** Sau khi hạ, không nâng trong chừng này (ms thời gian khung). */
  upLockoutAfterDownMs: number;
  maxDownshifts: number;
  /** Khung dài hơn mức này coi là tạm dừng / chuyển tab, KHÔNG đo. */
  ignoreAboveMs: number;
}

export const DEFAULT_GOVERNOR: GovernorOptions = {
  windowMs: 5000,
  badP95Ms: 22,
  goodP95Ms: 19,
  badWindowsToDown: 2,
  goodWindowsToUp: 6, // 6 x 5 s = 30 s
  minChangeGapMs: 20_000,
  upLockoutAfterDownMs: 60_000,
  maxDownshifts: 3,
  ignoreAboveMs: 500,
};

export type GovernorDecision = "down" | "up" | null;

export interface GovernorSnapshot {
  /** Số khung hợp lệ trong cửa sổ hiện tại. */
  samples: number;
  lastP95Ms: number;
  lastWindowFps: number;
  badStreak: number;
  goodStreak: number;
  downshifts: number;
}

/**
 * Đo thời gian khung theo cửa sổ và quyết định hạ / nâng một bậc. Không biết gì về bậc hiện tại: người gọi cho biết
 * có còn chỗ hạ / nâng không (`canDown`, `canUp`) rồi áp quyết định. Không cấp phát trong `frame()` (mảng cố định).
 */
export class FrameGovernor {
  private readonly buf = new Float32Array(2048);
  private count = 0;
  private elapsed = 0;
  private sinceChange = Infinity;
  private sinceDown = Infinity;
  private bad = 0;
  private good = 0;
  private downs = 0;
  private lastP95 = 0;
  private lastFps = 0;

  constructor(private readonly opt: GovernorOptions = DEFAULT_GOVERNOR) {}

  /** Bỏ cửa sổ đang đo (vào nền, đổi chế độ...). Giữ nguyên số lần hạ đã dùng. */
  resetWindow(): void {
    this.count = 0;
    this.elapsed = 0;
    this.bad = 0;
    this.good = 0;
  }

  snapshot(): GovernorSnapshot {
    return {
      samples: this.count,
      lastP95Ms: this.lastP95,
      lastWindowFps: this.lastFps,
      badStreak: this.bad,
      goodStreak: this.good,
      downshifts: this.downs,
    };
  }

  /** Nạp một khung; trả về quyết định khi cửa sổ vừa khép. */
  frame(dtMs: number, canDown: boolean, canUp: boolean): GovernorDecision {
    if (!(dtMs > 0) || dtMs > this.opt.ignoreAboveMs) return null;
    this.sinceChange += dtMs;
    this.sinceDown += dtMs;
    if (this.count < this.buf.length) this.buf[this.count++] = dtMs;
    this.elapsed += dtMs;
    if (this.elapsed < this.opt.windowMs) return null;

    const p95 = this.p95();
    this.lastP95 = p95;
    this.lastFps = (this.count * 1000) / this.elapsed;
    this.count = 0;
    this.elapsed = 0;

    if (p95 > this.opt.badP95Ms) {
      this.bad++;
      this.good = 0;
    } else if (p95 < this.opt.goodP95Ms) {
      this.good++;
      this.bad = 0;
    } else {
      this.bad = 0;
      this.good = 0;
    }

    if (
      this.bad >= this.opt.badWindowsToDown &&
      canDown &&
      this.downs < this.opt.maxDownshifts &&
      this.sinceChange >= this.opt.minChangeGapMs
    ) {
      this.downs++;
      this.sinceChange = 0;
      this.sinceDown = 0;
      this.bad = 0;
      this.good = 0;
      return "down";
    }
    if (
      this.good >= this.opt.goodWindowsToUp &&
      canUp &&
      this.sinceChange >= this.opt.minChangeGapMs &&
      this.sinceDown >= this.opt.upLockoutAfterDownMs
    ) {
      this.sinceChange = 0;
      this.bad = 0;
      this.good = 0;
      return "up";
    }
    return null;
  }

  private p95(): number {
    const n = this.count;
    if (n === 0) return 0;
    const a = this.buf.subarray(0, n);
    a.sort(); // Float32Array.sort mặc định là số học
    return a[Math.min(n - 1, Math.ceil(n * 0.95) - 1)];
  }
}

// --- Bộ điều khiển ---

/** Phần môi trường mà hệ thống chất lượng cần (tiêm vào để test không cần DOM). */
export interface QualityEnv {
  signals(): DeviceSignals;
  form(): FormFactor;
  reducedMotion(): boolean;
  storage: { get(key: string): string | null; set(key: string, value: string): void };
  /** Ghi `data-quality` / `data-reduce-motion` lên <html> và class `low-fx` lên <body>. */
  applyDom(p: QualityProfile): void;
}

export interface QualityController {
  get(): QualityProfile;
  onChange(cb: (p: QualityProfile) => void): () => void;
  setMode(mode: QualityMode): void;
  setBatterySaver(on: boolean): void;
  /** Gọi sau khi cài đặt giảm chuyển động hoặc hình thức thiết bị thay đổi. */
  refresh(): void;
  /** Nạp thời gian một khung (ms). Chỉ bộ điều tốc dùng (khi `auto`); bộ đo FPS luôn chạy. */
  frame(dtMs: number): void;
  /** Báo vào nền / về tiền cảnh: bỏ cửa sổ đang đo. */
  setActive(active: boolean): void;
  /** Trần bậc của thiết bị (cho giao diện / gỡ lỗi). */
  ceiling(): Tier;
  stats(): { fps: number; p95Ms: number; governor: GovernorSnapshot };
  dispose(): void;
}

function parseMode(v: string | null): QualityMode | null {
  return v === "auto" || v === "low" || v === "mid" || v === "high" ? v : null;
}

/** Đọc chế độ đã lưu, di cư `tg_low_fx=1` -> `low` khi chưa chọn. */
export function loadMode(storage: QualityEnv["storage"]): QualityMode {
  const saved = parseMode(storage.get(QUALITY_STORAGE_KEY));
  if (saved) return saved;
  if (storage.get(LEGACY_LOW_FX_KEY) === "1") {
    storage.set(QUALITY_STORAGE_KEY, "low");
    return "low";
  }
  return "auto";
}

/** Đo FPS / p95 cho lớp phủ gỡ lỗi trên 120 khung gần nhất (bộ đệm vòng, không cấp phát). */
class FpsMeter {
  private readonly ring = new Float32Array(120);
  private tmp = new Float32Array(120);
  private n = 0;
  private i = 0;
  push(dt: number): void {
    if (!(dt > 0) || dt > 500) return;
    this.ring[this.i] = dt;
    this.i = (this.i + 1) % this.ring.length;
    if (this.n < this.ring.length) this.n++;
  }
  read(): { fps: number; p95Ms: number } {
    if (this.n === 0) return { fps: 0, p95Ms: 0 };
    let sum = 0;
    for (let k = 0; k < this.n; k++) {
      this.tmp[k] = this.ring[k];
      sum += this.ring[k];
    }
    const a = this.tmp.subarray(0, this.n);
    a.sort();
    return {
      fps: (this.n * 1000) / sum,
      p95Ms: a[Math.min(this.n - 1, Math.ceil(this.n * 0.95) - 1)],
    };
  }
}

export function createQuality(
  env: QualityEnv,
  governorOpt: GovernorOptions = DEFAULT_GOVERNOR,
): QualityController {
  const listeners = new Set<(p: QualityProfile) => void>();
  const gov = new FrameGovernor(governorOpt);
  const meter = new FpsMeter();
  let mode = loadMode(env.storage);
  let batterySaver = env.storage.get(BATTERY_SAVER_STORAGE_KEY) === "1";
  let active = true;

  let initial = pickInitialTier(env.signals());
  /** Bậc đang chạy khi `auto` (bộ điều tốc đổi giá trị này). */
  let autoTier: Tier = initial.tier;

  const currentTier = (): Tier => (mode === "auto" ? autoTier : mode);
  const build = (): QualityProfile =>
    buildProfile(currentTier(), {
      mode,
      reducedMotion: env.reducedMotion(),
      batterySaver,
      form: env.form(),
    });

  let profile = build();
  env.applyDom(profile);

  const same = (a: QualityProfile, b: QualityProfile): boolean => {
    for (const k of Object.keys(a) as Array<keyof QualityProfile>) if (a[k] !== b[k]) return false;
    return true;
  };
  const apply = (): void => {
    const next = build();
    if (same(profile, next)) return;
    profile = next;
    env.applyDom(profile);
    for (const cb of [...listeners]) cb(profile);
  };

  return {
    get: () => profile,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setMode(m) {
      if (m === mode) return;
      mode = m;
      env.storage.set(QUALITY_STORAGE_KEY, m);
      if (m === "auto") {
        // Quay lại Tự động: chọn lại từ thiết bị (không giữ bậc cũ của lần chọn tay)
        initial = pickInitialTier(env.signals());
        autoTier = initial.tier;
      }
      gov.resetWindow();
      apply();
    },
    setBatterySaver(on) {
      if (on === batterySaver) return;
      batterySaver = on;
      env.storage.set(BATTERY_SAVER_STORAGE_KEY, on ? "1" : "0");
      apply();
    },
    refresh() {
      apply();
    },
    frame(dtMs) {
      meter.push(dtMs);
      // Tiết kiệm pin: khung ~33 ms là CHỦ Ý (giới hạn 30 FPS), không phải quá tải: bộ điều tốc nghỉ
      if (mode !== "auto" || !active || profile.targetFps === 30) return;
      const i = tierIndex(autoTier);
      const d = gov.frame(dtMs, i > 0, i < tierIndex(initial.ceiling));
      if (d === "down") autoTier = TIERS[i - 1];
      else if (d === "up") autoTier = TIERS[i + 1];
      else return;
      apply();
    },
    setActive(a) {
      if (a === active) return;
      active = a;
      gov.resetWindow();
    },
    ceiling: () => initial.ceiling,
    stats: () => ({ ...meter.read(), governor: gov.snapshot() }),
    dispose() {
      listeners.clear();
    },
  };
}

// --- Môi trường thật ---

export function browserQualityEnv(
  getForm: () => FormFactor,
  isReduced: () => boolean,
  win: Window = window,
  doc: Document = document,
): QualityEnv {
  // Chuỗi GPU không đổi trong phiên: đọc MỘT lần và nhớ (mỗi lần gọi mà tạo ngữ cảnh WebGL mới rồi bỏ sẽ chạm trần ~16
  // ngữ cảnh sống của Chrome), rồi giải phóng ngữ cảnh ngay.
  let gpuRead = false;
  let gpuCache: string | undefined;
  const gpuString = (): string | undefined => {
    if (gpuRead) return gpuCache;
    gpuRead = true;
    try {
      const c = doc.createElement("canvas");
      const gl = (c.getContext("webgl") ||
        c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      gpuCache = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : undefined;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      gpuCache = undefined;
    }
    return gpuCache;
  };
  return {
    signals: () => {
      const nav = win.navigator as Navigator & { deviceMemory?: number };
      return {
        form: getForm(),
        cores: nav.hardwareConcurrency || undefined,
        memoryGb: nav.deviceMemory,
        gpu: gpuString(),
      };
    },
    form: getForm,
    reducedMotion: isReduced,
    storage: {
      get: (k) => {
        try {
          return win.localStorage.getItem(k);
        } catch {
          return null;
        }
      },
      set: (k, v) => {
        try {
          win.localStorage.setItem(k, v);
        } catch {
          /* chế độ riêng tư: bỏ qua */
        }
      },
    },
    applyDom: (p) => {
      doc.documentElement.setAttribute("data-quality", p.tier);
      doc.documentElement.setAttribute("data-reduce-motion", p.reducedMotion ? "1" : "0");
      // Tương thích CSS cũ (`body.low-fx ...`): bậc Thấp = chế độ hiệu ứng thấp
      doc.body?.classList.toggle("low-fx", p.tier === "low");
    },
  };
}

// --- Bản duy nhất dùng trong ứng dụng ---

let current: QualityController | null = null;

export function initQuality(env: QualityEnv, governorOpt?: GovernorOptions): QualityController {
  current?.dispose();
  current = createQuality(env, governorOpt);
  return current;
}

function ctl(): QualityController {
  if (!current) throw new Error("initQuality() chưa được gọi (gọi sớm trong main.ts)");
  return current;
}

export function getQuality(): QualityProfile {
  return ctl().get();
}
export function onQualityChange(cb: (p: QualityProfile) => void): () => void {
  return ctl().onChange(cb);
}
export function setQualityMode(m: QualityMode): void {
  ctl().setMode(m);
}
export function setBatterySaver(on: boolean): void {
  ctl().setBatterySaver(on);
}
export function qualityFrame(dtMs: number): void {
  ctl().frame(dtMs);
}
export function setQualityActive(active: boolean): void {
  ctl().setActive(active);
}
export function refreshQuality(): void {
  ctl().refresh();
}
export function qualityStats(): ReturnType<QualityController["stats"]> {
  return ctl().stats();
}
export function qualityCeiling(): Tier {
  return ctl().ceiling();
}
/** Giảm chuyển động đang bật? (OS + cài đặt; trước khi khởi tạo coi là tắt.) */
export function reducedMotion(): boolean {
  return current ? current.get().reducedMotion : false;
}
export function hasQuality(): boolean {
  return current !== null;
}
