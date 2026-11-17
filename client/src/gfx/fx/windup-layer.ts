/**
 * Lớp VẼ vòng TỤ KHÍ của chiêu vận (`windupMs`, CT11b bước 3). Phần tính (kế hoạch, tiến độ, bán kính, trần, chỗ chứa) ở `windup-fx.ts` (thuần, có test); ở đây chỉ có Graphics từ POOL
 * và vòng cập nhật mỗi khung (như `TelegraphLayer` / `PBoltLayer`): không hạt Phaser nên KHÔNG tốn ngân sách emitter; có trần riêng theo bậc chất lượng.
 *
 * Vòng thu nhỏ quanh người vận trong `windupMs`, vòng cung trắng chạy quanh theo tiến độ; hết `windupMs` mà người vận còn thấy được (không chết / không rời vùng nhìn / của mình không bị
 * choáng) thì gọi `onRelease` ĐÚNG MỘT LẦN (chỗ cảnh vẽ hiệu ứng đáp của hình cũ tại vị trí HIỆN TẠI của người vận, như máy chủ) rồi chớp; bị huỷ thì mờ tắt, KHÔNG gọi `onRelease`.
 * Không cấp phát trong vòng cập nhật.
 */
import type Phaser from "phaser";
import {
  WINDUP_FIZZLE_MS,
  WINDUP_RELEASE_MS,
  WINDUP_R_IN,
  WINDUP_R_OUT,
  WINDUP_Y_OFFSET,
  windupAlpha,
  windupCancelled,
  windupLimits,
  windupProgress,
  windupRadius,
  windupSlot,
  type WindupPlan,
} from "./windup-fx";

/** Vòng vẽ trên thực thể cùng hàng. */
export const WINDUP_DEPTH_OFFSET = 4;
/** Phần ngoài khung nhìn vẫn được vẽ. */
const VIEW_PAD = 120;
const FIZZLE_COLOR = 0xb8b0a8;

/** Điều người gọi cho biết về người đang vận tại thời điểm `now`; `null` = không còn trong state. */
export interface WindupWatchResult {
  x: number;
  y: number;
  dead: boolean;
  /** Chỉ đúng với CHÍNH MÌNH (trạng thái choáng chỉ gửi cho chủ) */
  stunned: boolean;
}

export interface WindupDeps {
  emitterBudget: () => number;
  reduced: () => boolean;
  inView: (x: number, y: number, pad: number) => boolean;
  watch: (by: string, mine: boolean, now: number) => WindupWatchResult | null;
  /** Vận xong không bị huỷ: vẽ hiệu ứng đáp ở (x, y) = vị trí HIỆN TẠI của người vận. Gọi đúng một lần cho mỗi lần vận. */
  onRelease: (plan: WindupPlan, x: number, y: number) => void;
}

type Phase = "charge" | "release" | "fizzle";

interface Item {
  g: Phaser.GameObjects.Graphics;
  plan: WindupPlan;
  start: number;
  phase: Phase;
  /** Lúc chuyển sang `release` / `fizzle` (ms đồng hồ cảnh) */
  phaseAt: number;
  /** Tiến độ lúc bị huỷ (để vòng mờ ở đúng bán kính đang có) */
  frozenP: number;
  x: number;
  y: number;
}

export interface WindupStats {
  alive: number;
  spawned: number;
  /** Số lần đáp / huỷ / thay thế vì cùng người vận lần mới hoặc đủ trần */
  released: number;
  fizzled: number;
  replaced: number;
  graphics: number;
  peak: number;
}

export class WindupLayer {
  private readonly items: Item[] = [];
  private readonly pool: Phaser.GameObjects.Graphics[] = [];
  private created = 0;
  private spawned = 0;
  private released = 0;
  private fizzled = 0;
  private replaced = 0;
  private peak = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: WindupDeps,
  ) {}

  private take(): Phaser.GameObjects.Graphics {
    const g = this.pool.pop();
    if (g) return g;
    this.created++;
    return this.scene.add.graphics();
  }

  private free(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    g.setVisible(false);
    this.pool.push(g);
  }

  /** Bắt đầu một lần vận (đã `planWindup`); lần vận mới của cùng người thay lần cũ. */
  begin(plan: WindupPlan, now: number): void {
    const k = windupSlot(this.items, plan, windupLimits(this.deps.emitterBudget()));
    const item: Item = {
      g: k >= 0 ? this.items[k]!.g : this.take(),
      plan,
      start: now,
      phase: "charge",
      phaseAt: now,
      frozenP: 0,
      x: plan.x,
      y: plan.y,
    };
    if (k >= 0) {
      this.items[k] = item;
      this.replaced++;
    } else {
      this.items.push(item);
    }
    this.spawned++;
    this.peak = Math.max(this.peak, this.items.length);
    item.g.setAlpha(1).setVisible(true);
    this.draw(item, now);
  }

  /** Mỗi khung: theo dõi người vận, chuyển pha (đáp / huỷ), vẽ, dọn vòng đã tắt (hoán đổi với phần tử cuối). */
  update(now: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (it.phase === "charge") this.step(it, now);
      const done =
        it.phase === "release"
          ? now - it.phaseAt >= WINDUP_RELEASE_MS
          : it.phase === "fizzle" && now - it.phaseAt >= WINDUP_FIZZLE_MS;
      if (done) {
        this.free(it.g);
        const last = this.items.pop()!;
        if (i < this.items.length) this.items[i] = last;
        continue;
      }
      this.draw(it, now);
    }
  }

  /** Pha `charge`: cập nhật vị trí, huỷ nếu người vận chết / mất / bị choáng (của mình), đáp nếu hết `ms`. */
  private step(it: Item, now: number): void {
    const w = this.deps.watch(it.plan.by, it.plan.mine, now);
    const elapsed = now - it.start;
    if (w !== null) {
      it.x = w.x;
      it.y = w.y;
    }
    if (
      windupCancelled({
        gone: w === null,
        dead: w?.dead ?? false,
        stunned: w?.stunned ?? false,
      })
    ) {
      it.phase = "fizzle";
      it.phaseAt = now;
      it.frozenP = windupProgress(it.plan.ms, elapsed);
      this.fizzled++;
      return;
    }
    if (elapsed >= it.plan.ms) {
      it.phase = "release";
      it.phaseAt = now;
      this.released++;
      this.deps.onRelease(it.plan, it.x, it.y);
    }
  }

  private draw(it: Item, now: number): void {
    const { g, plan } = it;
    if (!this.deps.inView(it.x, it.y, VIEW_PAD)) {
      g.setVisible(false);
      return;
    }
    const limits = windupLimits(this.deps.emitterBudget());
    const reduced = this.deps.reduced();
    g.setVisible(true)
      .setPosition(it.x, it.y + WINDUP_Y_OFFSET)
      .setDepth(it.y + WINDUP_DEPTH_OFFSET)
      .clear();
    if (it.phase === "charge") {
      const p = windupProgress(plan.ms, now - it.start);
      const r = reduced ? WINDUP_R_OUT * 0.6 : windupRadius(p); // giảm chuyển động: vòng đứng yên, chỉ cung tiến độ chạy
      const a = windupAlpha(p, plan.mine);
      if (limits.detail) {
        g.fillStyle(plan.tint, 0.08 + 0.16 * p);
        g.fillCircle(0, 0, r);
      }
      g.lineStyle(2.5, plan.tint, a);
      g.strokeCircle(0, 0, r);
      if (p > 0) {
        g.lineStyle(4, 0xffffff, Math.min(1, a + 0.1));
        g.beginPath();
        g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        g.strokePath();
      }
    } else if (it.phase === "release") {
      const q = Math.min(1, (now - it.phaseAt) / WINDUP_RELEASE_MS);
      const r = WINDUP_R_IN + (WINDUP_R_OUT * 1.1 - WINDUP_R_IN) * (reduced ? 0 : q);
      g.fillStyle(plan.tint, 0.3 * (1 - q));
      g.fillCircle(0, 0, r);
      g.lineStyle(3, 0xffffff, 1 - q);
      g.strokeCircle(0, 0, r);
    } else {
      const q = Math.min(1, (now - it.phaseAt) / WINDUP_FIZZLE_MS);
      const r = windupRadius(it.frozenP) * (reduced ? 1 : 1 + 0.3 * q);
      g.lineStyle(2, FIZZLE_COLOR, 0.6 * (1 - q));
      g.strokeCircle(0, 0, r);
    }
  }

  /** Bỏ hết (đổi bản đồ / nối lại phòng): trả Graphics về pool, KHÔNG gọi `onRelease`. */
  clear(): void {
    for (const it of this.items) this.free(it.g);
    this.items.length = 0;
  }

  stats(): WindupStats {
    return {
      alive: this.items.length,
      spawned: this.spawned,
      released: this.released,
      fizzled: this.fizzled,
      replaced: this.replaced,
      graphics: this.created,
      peak: this.peak,
    };
  }

  /** Cho script kiểm (`?debug`): từng vòng đang giữ (người vận, pha, tiến độ tại `now`, vị trí). */
  snapshot(now: number): Array<{
    by: string;
    mine: boolean;
    phase: string;
    progress: number;
    x: number;
    y: number;
  }> {
    return this.items.map((it) => ({
      by: it.plan.by,
      mine: it.plan.mine,
      phase: it.phase,
      progress: windupProgress(it.plan.ms, now - it.start),
      x: it.x,
      y: it.y,
    }));
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) g.destroy();
    this.pool.length = 0;
  }
}
