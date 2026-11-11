// Hệ thống nhạc nền (trấn / hoang dã chuyển mượt) và âm thanh hiệu ứng bằng Web Audio API.
// Không cần file âm thanh nặng, tuân thủ chính sách autoplay của trình duyệt và lưu trạng thái tắt tiếng vào localStorage.

export type BgmZone = "town" | "wild";

const MUTE_KEY = "tg_muted";
const BGM_VOL_KEY = "tg_bgm_vol";
const SFX_VOL_KEY = "tg_sfx_vol";

// Ngũ cung cổ phong (C4 D4 E4 G4 A4 C5 D5 E5 G5 A5)
const TOWN_NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
// Ngũ cung trầm huyền bí ngoài hoang dã (A3 C4 D4 E4 G4 A4 C5)
const WILD_NOTES = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

const TOWN_MELODY = [0, 2, 4, 5, 4, 2, 1, 2, 3, 5, 6, 4, 3, 1, 0, -1];
const WILD_MELODY = [0, 3, 2, 4, 1, 3, 0, -1, 2, 5, 4, 3, 1, 2, 0, -1];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private townGain: GainNode | null = null;
  private wildGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private unlocked = false;
  private muted = false;
  private bgmVolume = 0.7;
  private sfxVolume = 0.8;
  private zone: BgmZone = "town";
  private stepIdx = 0;
  private bgmTimer: number | null = null;
  private lastBlipAt = 0;
  private listeners: Array<(muted: boolean) => void> = [];

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
      const bv = Number(localStorage.getItem(BGM_VOL_KEY));
      if (Number.isFinite(bv) && localStorage.getItem(BGM_VOL_KEY) !== null) {
        this.bgmVolume = Math.max(0, Math.min(1, bv));
      }
      const sv = Number(localStorage.getItem(SFX_VOL_KEY));
      if (Number.isFinite(sv) && localStorage.getItem(SFX_VOL_KEY) !== null) {
        this.sfxVolume = Math.max(0, Math.min(1, sv));
      }
    } catch {
      this.muted = false;
    }
    this.installUnlockHandlers();
  }

  private installUnlockHandlers() {
    if (typeof window === "undefined") return;
    const unlock = () => {
      this.ensureContext();
      if (this.ctx && this.ctx.state === "suspended") {
        void this.ctx.resume();
      }
      if (this.ctx && this.ctx.state === "running") {
        this.unlocked = true;
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("touchstart", unlock);
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.75;
      this.masterGain.connect(ctx.destination);

      this.bgmBus = ctx.createGain();
      this.bgmBus.gain.value = this.bgmVolume;
      this.bgmBus.connect(this.masterGain);

      this.townGain = ctx.createGain();
      this.townGain.gain.value = this.zone === "town" ? 0.22 : 0;
      this.townGain.connect(this.bgmBus);

      this.wildGain = ctx.createGain();
      this.wildGain.gain.value = this.zone === "wild" ? 0.22 : 0;
      this.wildGain.connect(this.bgmBus);

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = 0.55 * this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.startBgmLoop();
      return ctx;
    } catch {
      return null;
    }
  }

  private ready(): boolean {
    if (this.muted) return false;
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    this.unlocked = ctx.state === "running";
    return this.unlocked;
  }

  private startBgmLoop() {
    if (this.bgmTimer !== null || typeof window === "undefined") return;
    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== "running" || this.muted) return;
      this.tickBgm();
    }, 460);
  }

  private tickBgm() {
    const ctx = this.ctx;
    if (!ctx || !this.townGain || !this.wildGain) return;
    const now = ctx.currentTime;
    const idx = this.stepIdx++ % 16;

    // Giai điệu đàn cổ tranh / tiêu trong Lạc Hà Trấn
    const tNoteIdx = TOWN_MELODY[idx];
    if (tNoteIdx >= 0 && this.townGain.gain.value > 0.01) {
      const freq = TOWN_NOTES[tNoteIdx % TOWN_NOTES.length];
      this.playPluck(freq, now, 0.85, "triangle", this.townGain, 0.35);
      if (idx % 4 === 0) {
        this.playPluck(freq * 0.5, now, 1.4, "sine", this.townGain, 0.22);
      }
    }

    // Giai điệu hoang dã u trầm ngoài Vân Mộng Sơn
    const wNoteIdx = WILD_MELODY[idx];
    if (wNoteIdx >= 0 && this.wildGain.gain.value > 0.01) {
      const freq = WILD_NOTES[wNoteIdx % WILD_NOTES.length];
      this.playPluck(freq, now, 0.45, "sine", this.wildGain, 0.32);
      if (idx % 4 === 0) {
        this.playPluck(110, now, 1.2, "triangle", this.wildGain, 0.25);
      }
    }
  }

  private playPluck(
    freq: number,
    startTime: number,
    dur: number,
    type: OscillatorType,
    dest: AudioNode,
    peak = 0.3,
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(peak, startTime + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.02);
  }

  /** Đổi vùng nhạc nền (trấn <-> hoang dã) có hiệu ứng fade 1.2 giây. */
  setZone(zone: BgmZone) {
    if (this.zone === zone) return;
    this.zone = zone;
    if (!this.ctx || !this.townGain || !this.wildGain) return;
    const now = this.ctx.currentTime;
    const fadeSec = 1.2;
    this.townGain.gain.cancelScheduledValues(now);
    this.wildGain.gain.cancelScheduledValues(now);
    this.townGain.gain.setValueAtTime(this.townGain.gain.value, now);
    this.wildGain.gain.setValueAtTime(this.wildGain.gain.value, now);
    this.townGain.gain.linearRampToValueAtTime(zone === "town" ? 0.22 : 0.0001, now + fadeSec);
    this.wildGain.gain.linearRampToValueAtTime(zone === "wild" ? 0.22 : 0.0001, now + fadeSec);
  }

  getZone(): BgmZone {
    return this.zone;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(m ? 0 : 0.75, now);
    }
    for (const fn of this.listeners) fn(this.muted);
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) this.pickup();
    return this.muted;
  }

  onChange(fn: (muted: boolean) => void) {
    this.listeners.push(fn);
  }

  getBgmVolume(): number {
    return this.bgmVolume;
  }

  setBgmVolume(v: number) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(BGM_VOL_KEY, this.bgmVolume.toFixed(2));
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
    if (this.ctx && this.bgmBus) {
      this.bgmBus.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
    }
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  setSfxVolume(v: number) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(SFX_VOL_KEY, this.sfxVolume.toFixed(2));
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
    if (this.ctx && this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(0.55 * this.sfxVolume, this.ctx.currentTime);
    }
  }

  // ---------------- Hiệu ứng âm thanh (SFX) ----------------

  /** Tiếng búa nện đe sắt khi rèn trang bị */
  forge() {
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPluck(320, now, 0.12, "triangle", this.sfxGain, 0.35);
    this.playPluck(640, now + 0.04, 0.28, "sine", this.sfxGain, 0.32);
    this.playPluck(960, now + 0.1, 0.42, "sine", this.sfxGain, 0.38);
  }

  /** Tiếng mặc / tháo trang bị */
  equip() {
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPluck(440, now, 0.14, "triangle", this.sfxGain, 0.28);
    this.playPluck(659.25, now + 0.05, 0.22, "sine", this.sfxGain, 0.3);
  }

  /** Tiếng vung kiếm chém */
  slash() {
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  /** Tiếng phóng kiếm khí */
  sword() {
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(290, now + 0.24);
    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /** Tiếng trúng đòn (bạo kích có thêm âm kim khí cao) */
  hit(crit = false) {
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = crit ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(crit ? 310 : 190, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.11);
    g.gain.setValueAtTime(crit ? 0.38 : 0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  /** Tiếng nhặt linh vật / đan dược */
  pickup() {
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPluck(587.33, now, 0.18, "sine", this.sfxGain, 0.3);
    this.playPluck(880.0, now + 0.06, 0.26, "sine", this.sfxGain, 0.34);
  }

  /** Tiếng lên tầng hoặc đột phá cảnh giới */
  levelup(major: boolean) {
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes = major ? [261.63, 329.63, 392.0, 523.25, 659.25] : [329.63, 392.0, 523.25];
    notes.forEach((f, i) => {
      this.playPluck(f, now + i * 0.08, major ? 0.65 : 0.38, "triangle", this.sfxGain!, 0.36);
    });
  }

  /** Tiếng đột phá thất bại */
  breakfail() {
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPluck(180, now, 0.35, "sawtooth", this.sfxGain, 0.28);
    this.playPluck(130, now + 0.14, 0.45, "sawtooth", this.sfxGain, 0.3);
  }

  /** Tiếng mở hộp thoại / hoàn thành nhiệm vụ */
  questDone() {
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [392.0, 440.0, 523.25, 659.25].forEach((f, i) => {
      this.playPluck(f, now + i * 0.07, 0.4, "sine", this.sfxGain!, 0.32);
    });
  }

  /** Tiếng gõ chữ nhẹ khi chạy chữ hộp thoại */
  typeBlip() {
    const t = performance.now();
    if (t - this.lastBlipAt < 55) return;
    this.lastBlipAt = t;
    if (!this.ready() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPluck(480, now, 0.04, "sine", this.sfxGain, 0.08);
  }

  /** Tạm dừng AudioContext khi ứng dụng xuống nền (M4.2b). */
  suspend() {
    if (this.ctx && this.ctx.state === "running") {
      void this.ctx.suspend();
    }
  }

  /** Phục hồi AudioContext khi ứng dụng quay lại tiền cảnh (M4.2b). */
  resume() {
    if (this.ctx && this.ctx.state === "suspended" && this.unlocked) {
      void this.ctx.resume();
    }
  }
}

export const sound = new SoundEngine();
