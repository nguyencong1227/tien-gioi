/**
 * Lớp VẼ đạn bay của người chơi (`fx` `pbolt`, CT11b bước 2). Phần tính (kiểm tin, vị trí theo thời gian, trần theo chủ) ở `pbolt-fx.ts` (thuần, có test); ở đây chỉ có
 * Graphics lấy từ POOL và vòng cập nhật mỗi khung (như `TelegraphLayer`): không hạt Phaser nên KHÔNG tốn ngân sách emitter; có trần riêng theo bậc chất lượng và theo chủ
 * (`pboltLimits`). Vượt trần thì TÁI DÙNG viên cũ nhất (xem `pboltSlot`), không bỏ tin mới. Không cấp phát trong vòng cập nhật (vị trí ghi vào đối tượng dùng lại).
 *
 * Không mô phỏng gì: mỗi đoạn bay thẳng theo đồng hồ cảnh từ lúc NHẬN tin (nảy / đổi hướng là một tin mới đến đúng lúc); máy chủ quyết định trúng / trượt.
 */
import type Phaser from "phaser";
import {
  PBOLT_CORE,
  PBOLT_GLOW,
  PBOLT_TRAIL_STEP,
  PBOLT_Y_OFFSET,
  pboltAlive,
  pboltAlpha,
  pboltLimits,
  pboltPosition,
  pboltSlot,
  pboltTravelled,
  type PBoltPlan,
  type Pt,
} from "./pbolt-fx";

/** Đạn vẽ trên thực thể cùng hàng (như đạn của quái `y + 2`). */
export const PBOLT_DEPTH_OFFSET = 3;
/** Phần ngoài khung nhìn vẫn được vẽ (đạn đang trượt vào màn hình). */
const VIEW_PAD = 160;

export interface PBoltDeps {
  /** Ngân sách emitter của bậc chất lượng hiện tại (đọc mỗi lần: đổi bậc có hiệu lực ngay). */
  emitterBudget: () => number;
  /** Giảm chuyển động: bỏ vệt đuôi. */
  reduced: () => boolean;
  /** Điểm (x, y) cách khung nhìn quá `pad` px thì không cần vẽ. */
  inView: (x: number, y: number, pad: number) => boolean;
}

interface Item {
  g: Phaser.GameObjects.Graphics;
  plan: PBoltPlan;
  start: number;
}

export interface PBoltStats {
  /** Đang giữ / đang được vẽ (trong khung nhìn) */
  alive: number;
  drawn: number;
  /** Tổng đã nhận / số lần tái dùng vì vượt trần / số Graphics đã tạo */
  spawned: number;
  recycled: number;
  graphics: number;
  peak: number;
}

export class PBoltLayer {
  private readonly items: Item[] = [];
  private readonly pool: Phaser.GameObjects.Graphics[] = [];
  private readonly pos: Pt = { x: 0, y: 0 };
  private created = 0;
  private spawned = 0;
  private recycled = 0;
  private peak = 0;
  private drawn = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: PBoltDeps,
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

  /** Nhận một đoạn đạn (đã `parsePBolt` + `pboltPlan`); luôn thành công (vượt trần thì thay viên cũ). */
  add(plan: PBoltPlan, now: number): void {
    const limits = pboltLimits(this.deps.emitterBudget());
    const k = pboltSlot(this.items, { by: plan.by, mine: plan.mine }, limits);
    let item: Item;
    if (k >= 0) {
      item = { g: this.items[k]!.g, plan, start: now };
      this.items[k] = item;
      this.recycled++;
    } else {
      item = { g: this.take(), plan, start: now };
      this.items.push(item);
    }
    item.g
      .setAlpha(1)
      .setVisible(true)
      .setPosition(plan.x, plan.y + PBOLT_Y_OFFSET);
    this.spawned++;
    this.peak = Math.max(this.peak, this.items.length);
    this.draw(item, now);
  }

  /** Cập nhật mỗi khung: vẽ lại, dọn cái đã hết hạn (hoán đổi với phần tử cuối, không dịch mảng). */
  update(now: number): void {
    let drawn = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (!pboltAlive(it.plan, now - it.start)) {
        this.release(it.g);
        const last = this.items.pop()!;
        if (i < this.items.length) this.items[i] = last;
        continue;
      }
      if (this.draw(it, now)) drawn++;
    }
    this.drawn = drawn;
  }

  /** Vẽ một viên tại vị trí theo thời gian; `false` (và ẩn) khi ngoài khung nhìn. */
  private draw(it: Item, now: number): boolean {
    const { g, plan } = it;
    const elapsed = now - it.start;
    const at = pboltPosition(this.pos, plan, elapsed);
    if (!this.deps.inView(at.x, at.y, VIEW_PAD)) {
      g.setVisible(false);
      return false;
    }
    g.setVisible(true)
      .setPosition(at.x, at.y + PBOLT_Y_OFFSET)
      .setDepth(at.y + PBOLT_DEPTH_OFFSET)
      .setAlpha(pboltAlpha(plan, elapsed))
      .clear();
    const limits = pboltLimits(this.deps.emitterBudget());
    if (limits.trail > 0 && !this.deps.reduced()) {
      // vệt đuôi: chấm nhỏ dần nằm sau đạn, không lùi quá điểm bắn
      const travelled = pboltTravelled(plan, elapsed);
      const c = Math.cos(plan.angle);
      const s = Math.sin(plan.angle);
      for (let k = limits.trail; k >= 1; k--) {
        const back = k * PBOLT_TRAIL_STEP;
        if (back > travelled) continue;
        g.fillStyle(plan.tint, 0.5 - k * 0.09);
        g.fillCircle(-c * back, -s * back, Math.max(1.2, PBOLT_CORE - k * 0.6));
      }
    }
    if (limits.detail) {
      g.fillStyle(plan.tint, plan.mine ? 0.38 : 0.28);
      g.fillCircle(0, 0, PBOLT_GLOW);
    }
    g.fillStyle(plan.tint, 1);
    g.fillCircle(0, 0, PBOLT_CORE);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(0, 0, PBOLT_CORE * 0.45);
    return true;
  }

  /** Bỏ hết (đổi bản đồ / nối lại phòng): trả Graphics về pool. */
  clear(): void {
    for (const it of this.items) this.release(it.g);
    this.items.length = 0;
    this.drawn = 0;
  }

  stats(): PBoltStats {
    return {
      alive: this.items.length,
      drawn: this.drawn,
      spawned: this.spawned,
      recycled: this.recycled,
      graphics: this.created,
      peak: this.peak,
    };
  }

  /** Cho script kiểm (`?debug`): từng viên đang giữ (chủ, chiêu, vị trí tại `now`). */
  snapshot(now: number): Array<{ by: string; mine: boolean; x: number; y: number; alpha: number }> {
    return this.items.map((it) => {
      const at = pboltPosition({ x: 0, y: 0 }, it.plan, now - it.start);
      return {
        by: it.plan.by,
        mine: it.plan.mine,
        x: at.x,
        y: at.y,
        alpha: pboltAlpha(it.plan, now - it.start),
      };
    });
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) g.destroy();
    this.pool.length = 0;
  }
}
