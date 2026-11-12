/**
 * Ngân sách hiệu ứng (M5.2, #325, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 7.1 (3)).
 *
 * MỘT nơi duy nhất quyết định hiệu ứng nào được phát: mỗi `playFx` xin ngân sách (số hạt + số emitter trong thời gian sống
 * của nó). Hạt sống được tính THEO THỜI GIAN (mỗi lần phát ghi lại "n hạt, 1 emitter, tới lúc t"), không đọc nội bộ Phaser,
 * nên tất định và test được bằng đồng hồ giả. Bộ nhớ cố định (mảng định kích thước sẵn): không cấp phát khi xin / trả.
 *
 * Ưu tiên (mục 7.1):
 *   2 = của CHÍNH MÌNH và sự kiện quan trọng (đột phá...): chỉ bị bỏ khi vượt GẤP ĐÔI trần;
 *   1 = người khác, quái: bị bỏ khi vượt trần;
 *   0 = môi trường (sương, thời tiết, lấp lánh): chỉ được dùng tới 60 % trần, chừa chỗ cho hiệu ứng chiến đấu.
 */

export type FxPriority = 0 | 1 | 2;

export interface FxLimits {
  particles: number;
  emitters: number;
}

export interface FxCost {
  /** Số hạt phát ra. */
  particles: number;
  /** Số emitter chiếm (thường 1). */
  emitters: number;
  /** Thời gian sống tối đa của các hạt (ms): hết thời gian này ngân sách được trả lại. */
  ms: number;
}

export interface FxBudgetStats {
  admitted: number;
  /** Số lần bị bỏ, theo ưu tiên [0, 1, 2]. */
  dropped: [number, number, number];
  peakParticles: number;
  peakEmitters: number;
}

/** Ưu tiên 0 chỉ được dùng tới tỉ lệ này của trần. */
export const AMBIENT_SHARE = 0.6;
/** Ưu tiên 2 được vượt trần tới bấy nhiêu lần trước khi bị bỏ. */
export const OWN_OVERSHOOT = 2;

const CAPACITY = 256;

export class FxBudget {
  private readonly until = new Float64Array(CAPACITY);
  private readonly parts = new Int32Array(CAPACITY);
  private readonly emits = new Int32Array(CAPACITY);
  private n = 0;
  private liveP = 0;
  private liveE = 0;
  private readonly st: FxBudgetStats = {
    admitted: 0,
    dropped: [0, 0, 0],
    peakParticles: 0,
    peakEmitters: 0,
  };

  constructor(
    private readonly limits: () => FxLimits,
    private readonly now: () => number,
  ) {}

  /** Trả ngân sách của các hiệu ứng đã hết thời gian sống. */
  private prune(t: number): void {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.until[i] > t) {
        if (w !== i) {
          this.until[w] = this.until[i];
          this.parts[w] = this.parts[i];
          this.emits[w] = this.emits[i];
        }
        w++;
      } else {
        this.liveP -= this.parts[i];
        this.liveE -= this.emits[i];
      }
    }
    this.n = w;
  }

  /** Xin ngân sách cho một hiệu ứng; true = được phát (đã ghi nhận), false = bỏ. */
  tryAcquire(cost: FxCost, priority: FxPriority): boolean {
    const t = this.now();
    this.prune(t);
    const lim = this.limits();
    const share = priority === 0 ? AMBIENT_SHARE : priority === 2 ? OWN_OVERSHOOT : 1;
    const pCap = lim.particles * share;
    const eCap = lim.emitters * share;
    const p = Math.max(0, cost.particles);
    const e = Math.max(0, cost.emitters);
    if (this.liveP + p > pCap || this.liveE + e > eCap || this.n >= CAPACITY) {
      this.st.dropped[priority]++;
      return false;
    }
    this.until[this.n] = t + Math.max(0, cost.ms);
    this.parts[this.n] = p;
    this.emits[this.n] = e;
    this.n++;
    this.liveP += p;
    this.liveE += e;
    this.st.admitted++;
    if (this.liveP > this.st.peakParticles) this.st.peakParticles = this.liveP;
    if (this.liveE > this.st.peakEmitters) this.st.peakEmitters = this.liveE;
    return true;
  }

  /** Hạt / emitter đang tính là sống (sau khi trả phần hết hạn). */
  live(): FxLimits {
    this.prune(this.now());
    return { particles: this.liveP, emitters: this.liveE };
  }

  stats(): Readonly<FxBudgetStats> {
    return this.st;
  }

  /** Quên mọi thứ (đóng cảnh). */
  clear(): void {
    this.n = 0;
    this.liveP = 0;
    this.liveE = 0;
  }
}
