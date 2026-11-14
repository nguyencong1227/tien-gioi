/**
 * Lớp vẽ báo trước đòn (`warn`) và đạn tầm xa (`bolt`) của quái (M7.7, #508). Phần tính (kiểm tin, hình học, thời gian) ở `telegraph.ts` (thuần, có test); ở đây chỉ có
 * Graphics từ POOL và vòng cập nhật mỗi khung. Không hạt Phaser nên KHÔNG tốn ngân sách emitter của `FxBudget`; thay vào đó có trần riêng theo bậc chất lượng
 * (`telegraphLimits`). Vượt trần thì TÁI DÙNG cái sắp hết hạn nhất thay vì bỏ tin mới: vùng báo là thông tin để người chơi né, bỏ mất còn tệ hơn vẽ thô.
 *
 * Không cấp phát trong vòng cập nhật: mảng đỉnh dựng sẵn (`scratch`), vị trí đạn ghi vào đối tượng dùng lại.
 */
import type Phaser from "phaser";
import {
  WARN_MAX_ARC_STEPS,
  boltAlive,
  boltAlpha,
  boltPosition,
  boltTrailCount,
  boltTravelled,
  planBolt,
  planWarn,
  telegraphLimits,
  warnAlive,
  warnArcSteps,
  warnFillAlpha,
  warnOutlineAlpha,
  warnPolygon,
  warnCovers,
  warnProgress,
  type BoltMsg,
  type BoltPlan,
  type Pt,
  type WarnMsg,
  type WarnPlan,
} from "./telegraph";

/** Phía trên nền + vòng trấn (-5), dưới mọi thực thể (độ sâu = y >= 0): vùng báo nằm DƯỚI chân người và quái, không che chữ / hình. */
export const WARN_DEPTH = -4;
/** Đạn vẽ trên thực thể cùng hàng (như vệt chém `y + 1`). */
export const BOLT_DEPTH_OFFSET = 2;
/** Màu vùng báo: đỏ cam nóng cho dễ nhận (đạn có màu theo hệ riêng). */
export const WARN_FILL = 0xff4030;
export const WARN_LINE = 0xffb090;
/** Bước vệt đuôi đạn (px) và bán kính lõi / quầng sáng. */
const TRAIL_STEP = 8;
const BOLT_CORE = 4;
const BOLT_GLOW = 9;
/** Phần ngoài khung nhìn vẫn được vẽ (đạn / vùng báo to đang trượt vào màn hình). */
const VIEW_PAD = 160;

export interface TelegraphDeps {
  /** Ngân sách emitter của bậc chất lượng hiện tại (đọc mỗi lần phát: đổi bậc có hiệu lực ngay). */
  emitterBudget: () => number;
  /** Giảm chuyển động: nét viền đứng yên (không nhịp thở). */
  reduced: () => boolean;
  /** Điểm (x, y) cách khung nhìn quá `pad` px thì không cần vẽ. */
  inView: (x: number, y: number, pad: number) => boolean;
  /**
   * Vị trí + bán kính thân của CHÍNH MÌNH (px thế giới): vùng báo đang bao lấy mình thì nét viền sáng trắng dày hơn và gọi `onDanger` MỘT lần cho vùng đó
   * ("bạn đang trong vùng nguy hiểm"). Bỏ trống thì không phân biệt (mọi vùng như nhau).
   */
  player?: () => { x: number; y: number; r: number } | null;
  /** Gọi đúng một lần cho mỗi vùng báo lúc mình lần đầu bị nó bao (và đòn chưa đáp), để phát tiếng báo. */
  onDanger?: (plan: WarnPlan) => void;
}

interface WarnItem {
  g: Phaser.GameObjects.Graphics;
  plan: WarnPlan;
  start: number;
  /** Mình đang đứng trong vùng này (cập nhật mỗi khung) và đã báo động cho vùng này chưa */
  danger: boolean;
  alerted: boolean;
}
interface BoltItem {
  g: Phaser.GameObjects.Graphics;
  plan: BoltPlan;
  start: number;
}

export interface TelegraphStats {
  warns: number;
  bolts: number;
  /** Số cái đang được vẽ (trong khung nhìn) */
  drawnWarns: number;
  drawnBolts: number;
  /** Tổng đã nhận / số lần tái dùng vì vượt trần / tin bị bỏ vì không hợp lệ */
  spawnedWarns: number;
  spawnedBolts: number;
  recycledWarns: number;
  recycledBolts: number;
  /** Số lần báo động "mình đang trong vùng báo" (mỗi vùng tối đa một lần) */
  dangerAlerts: number;
  rejected: number;
  peakWarns: number;
  peakBolts: number;
  /** Số Graphics đã tạo (pool) */
  graphics: number;
}

export class TelegraphLayer {
  private readonly warns: WarnItem[] = [];
  private readonly bolts: BoltItem[] = [];
  private readonly pool: Phaser.GameObjects.Graphics[] = [];
  private readonly scratch: Pt[] = Array.from({ length: WARN_MAX_ARC_STEPS + 2 }, () => ({
    x: 0,
    y: 0,
  }));
  private readonly pos: Pt = { x: 0, y: 0 };
  private created = 0;
  private spawnedWarns = 0;
  private spawnedBolts = 0;
  private recycledWarns = 0;
  private recycledBolts = 0;
  private rejected = 0;
  private dangerAlerts = 0;
  private peakWarns = 0;
  private peakBolts = 0;
  private drawnWarns = 0;
  private drawnBolts = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: TelegraphDeps,
  ) {}

  private take(): Phaser.GameObjects.Graphics {
    const g = this.pool.pop();
    if (g) return g;
    this.created++;
    return this.scene.add.graphics();
  }

  private release(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    g.setVisible(false);
    this.pool.push(g);
  }

  /** Nhận tin `warn`. `false` khi tin không hợp lệ. */
  warn(m: WarnMsg, now: number): boolean {
    const plan = planWarn(m);
    if (!plan) {
      this.rejected++;
      return false;
    }
    const cap = telegraphLimits(this.deps.emitterBudget()).warns;
    let item: WarnItem;
    if (this.warns.length >= cap) {
      // tái dùng cái sắp đáp nhất (còn ít thời gian nhất): người chơi đã thấy nó đủ lâu
      let k = 0;
      let soonest = Infinity;
      for (let i = 0; i < this.warns.length; i++) {
        const end = this.warns[i].start + this.warns[i].plan.ms;
        if (end < soonest) {
          soonest = end;
          k = i;
        }
      }
      item = { g: this.warns[k].g, plan, start: now, danger: false, alerted: false };
      this.warns[k] = item;
      this.recycledWarns++;
    } else {
      item = { g: this.take(), plan, start: now, danger: false, alerted: false };
      this.warns.push(item);
    }
    item.g.setPosition(plan.x, plan.y).setDepth(WARN_DEPTH).setAlpha(1).setVisible(true);
    this.spawnedWarns++;
    this.peakWarns = Math.max(this.peakWarns, this.warns.length);
    this.drawWarn(item, now);
    return true;
  }

  /** Nhận tin `bolt`. `false` khi tin không hợp lệ. */
  bolt(m: BoltMsg, now: number): boolean {
    const plan = planBolt(m);
    if (!plan) {
      this.rejected++;
      return false;
    }
    const cap = telegraphLimits(this.deps.emitterBudget()).bolts;
    let item: BoltItem;
    if (this.bolts.length >= cap) {
      // tái dùng viên bay lâu nhất (xa điểm bắn nhất, người chơi ít còn để ý)
      let k = 0;
      let oldest = Infinity;
      for (let i = 0; i < this.bolts.length; i++) {
        if (this.bolts[i].start < oldest) {
          oldest = this.bolts[i].start;
          k = i;
        }
      }
      item = { g: this.bolts[k].g, plan, start: now };
      this.bolts[k] = item;
      this.recycledBolts++;
    } else {
      item = { g: this.take(), plan, start: now };
      this.bolts.push(item);
    }
    item.g.setAlpha(1).setVisible(true).setPosition(plan.x, plan.y);
    this.spawnedBolts++;
    this.peakBolts = Math.max(this.peakBolts, this.bolts.length);
    this.drawBolt(item, now);
    return true;
  }

  /** Cập nhật mỗi khung: vẽ lại, dọn cái đã hết hạn (hoán đổi với phần tử cuối, không dịch mảng). */
  update(now: number): void {
    let drawnW = 0;
    for (let i = this.warns.length - 1; i >= 0; i--) {
      const it = this.warns[i];
      if (!warnAlive(now - it.start, it.plan.ms)) {
        this.release(it.g);
        const last = this.warns.pop()!;
        if (i < this.warns.length) this.warns[i] = last;
        continue;
      }
      if (this.drawWarn(it, now)) drawnW++;
    }
    this.drawnWarns = drawnW;
    let drawnB = 0;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const it = this.bolts[i];
      if (!boltAlive(it.plan, now - it.start)) {
        this.release(it.g);
        const last = this.bolts.pop()!;
        if (i < this.bolts.length) this.bolts[i] = last;
        continue;
      }
      if (this.drawBolt(it, now)) drawnB++;
    }
    this.drawnBolts = drawnB;
  }

  /** Vẽ một vùng báo; `false` (và ẩn) khi ngoài khung nhìn. */
  private drawWarn(it: WarnItem, now: number): boolean {
    const { g, plan } = it;
    const elapsed = now - it.start;
    if (!this.deps.inView(plan.x, plan.y, plan.r + VIEW_PAD)) {
      g.setVisible(false);
      return false;
    }
    const limits = telegraphLimits(this.deps.emitterBudget());
    const reduced = this.deps.reduced();
    const p = warnProgress(elapsed, plan.ms);
    // Mình đang đứng trong vùng (chỉ tính tới lúc đòn đáp): viền sáng trắng dày hơn + báo động MỘT lần cho vùng này
    const me = elapsed < plan.ms ? this.deps.player?.() : null;
    it.danger = !!me && warnCovers(plan, me.x, me.y, me.r);
    if (it.danger && !it.alerted) {
      it.alerted = true;
      this.dangerAlerts++;
      this.deps.onDanger?.(plan);
    }
    g.setVisible(true).clear();
    // vùng tô đặc lớn dần: hết `ms` là đầy tới viền = lúc đòn đáp xuống (và mờ đi trong WARN_FADE_MS)
    g.fillStyle(WARN_FILL, Math.min(0.6, warnFillAlpha(elapsed, plan.ms) * (it.danger ? 1.4 : 1)));
    const steps = warnArcSteps(this.deps.emitterBudget());
    if (plan.shape === "circle") {
      g.fillCircle(0, 0, plan.r * p);
    } else {
      const n = warnPolygon(this.scratch, plan, p, steps);
      g.fillPoints(this.scratch, true, true, n);
    }
    // nét viền: ranh giới thật của vùng; bậc thấp vẽ nét đứng yên một lớp
    const a = limits.detail ? warnOutlineAlpha(elapsed, plan.ms, reduced) : 0.8;
    const fade = elapsed <= plan.ms ? 1 : Math.max(0, 1 - (elapsed - plan.ms) / 140);
    if (it.danger) g.lineStyle(3, 0xffffff, Math.max(0.9, a) * fade);
    else g.lineStyle(2, WARN_LINE, a * fade);
    if (plan.shape === "circle") {
      g.strokeCircle(0, 0, plan.r);
    } else {
      const n = warnPolygon(this.scratch, plan, 1, steps);
      g.strokePoints(this.scratch, true, true, n);
    }
    return true;
  }

  /** Vẽ một viên đạn tại vị trí theo thời gian; `false` (và ẩn) khi ngoài khung nhìn. */
  private drawBolt(it: BoltItem, now: number): boolean {
    const { g, plan } = it;
    const elapsed = now - it.start;
    const at = boltPosition(this.pos, plan, elapsed);
    if (!this.deps.inView(at.x, at.y, VIEW_PAD)) {
      g.setVisible(false);
      return false;
    }
    g.setVisible(true)
      .setPosition(at.x, at.y)
      .setDepth(at.y + BOLT_DEPTH_OFFSET);
    g.setAlpha(boltAlpha(plan, elapsed));
    g.clear();
    const limits = telegraphLimits(this.deps.emitterBudget());
    const trail = boltTrailCount(limits);
    if (trail > 0) {
      // vệt đuôi: chấm nhỏ dần nằm sau đạn, không lùi quá điểm bắn
      const travelled = boltTravelled(plan, elapsed);
      const c = Math.cos(plan.angle);
      const s = Math.sin(plan.angle);
      for (let k = trail; k >= 1; k--) {
        const back = k * TRAIL_STEP;
        if (back > travelled) continue;
        g.fillStyle(plan.tint, 0.45 - k * 0.08);
        g.fillCircle(-c * back, -s * back, Math.max(1.5, BOLT_CORE - k * 0.7));
      }
    }
    if (limits.detail) {
      g.fillStyle(plan.tint, 0.3);
      g.fillCircle(0, 0, BOLT_GLOW);
    }
    g.fillStyle(plan.tint, 1);
    g.fillCircle(0, 0, BOLT_CORE);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(0, 0, BOLT_CORE * 0.45);
    return true;
  }

  /** Bỏ hết (đổi bản đồ / nối lại phòng): trả Graphics về pool. */
  clear(): void {
    for (const it of this.warns) this.release(it.g);
    for (const it of this.bolts) this.release(it.g);
    this.warns.length = 0;
    this.bolts.length = 0;
    this.drawnWarns = 0;
    this.drawnBolts = 0;
  }

  stats(): TelegraphStats {
    return {
      warns: this.warns.length,
      bolts: this.bolts.length,
      drawnWarns: this.drawnWarns,
      drawnBolts: this.drawnBolts,
      spawnedWarns: this.spawnedWarns,
      spawnedBolts: this.spawnedBolts,
      recycledWarns: this.recycledWarns,
      recycledBolts: this.recycledBolts,
      dangerAlerts: this.dangerAlerts,
      rejected: this.rejected,
      peakWarns: this.peakWarns,
      peakBolts: this.peakBolts,
      graphics: this.created,
    };
  }

  /** Cho script kiểm (`?debug`): ảnh chụp trạng thái từng cái đang sống tại thời điểm `now`. */
  snapshot(now: number): {
    warns: Array<{
      shape: string;
      x: number;
      y: number;
      r: number;
      ms: number;
      elapsed: number;
      progress: number;
      danger: boolean;
      visible: boolean;
    }>;
    bolts: Array<{
      x: number;
      y: number;
      elapsed: number;
      travelled: number;
      alpha: number;
      visible: boolean;
    }>;
  } {
    return {
      warns: this.warns.map((it) => ({
        shape: it.plan.shape,
        x: it.plan.x,
        y: it.plan.y,
        r: it.plan.r,
        ms: it.plan.ms,
        elapsed: now - it.start,
        progress: warnProgress(now - it.start, it.plan.ms),
        danger: it.danger,
        visible: it.g.visible,
      })),
      bolts: this.bolts.map((it) => ({
        x: it.g.x,
        y: it.g.y,
        elapsed: now - it.start,
        travelled: boltTravelled(it.plan, now - it.start),
        alpha: it.g.alpha,
        visible: it.g.visible,
      })),
    };
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) g.destroy();
    this.pool.length = 0;
  }
}
