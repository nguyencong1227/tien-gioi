/**
 * Lớp VẼ vật thể bền (`fx` `zone` / `trap` / `totem` / `aura` + `fxEnd`, CT11b bước 3b). Phần tính (kiểm tin, nhịp, độ đậm, trần theo chủ) ở `persist-fx.ts` (thuần, có test); ở đây chỉ
 * có Graphics lấy từ POOL và vòng cập nhật mỗi khung (như `PBoltLayer` / `WindupLayer`): không hạt Phaser nên KHÔNG tốn ngân sách emitter; có trần riêng theo bậc chất lượng và theo chủ
 * (`persistLimits`). Vượt trần thì TÁI DÙNG cái cũ nhất (xem `persistSlot`), không bỏ tin mới. Không cấp phát trong vòng cập nhật.
 *
 * Không mô phỏng gì: hết `ms` thì tự tắt; `fxEnd` chỉ báo kết thúc SỚM (`pop` = vòng nổ + bụi do cảnh phát, `gone` = mờ dần). `aura` bám người dùng (cảnh cho biết vị trí qua `anchor`); người
 * dùng chết / rời state thì hào quang mờ tắt như `gone`.
 */
import type Phaser from "phaser";
import {
  PERSIST_ANCHOR_GRACE_MS,
  persistAlive,
  persistAlpha,
  persistArmed,
  persistArmFlash,
  persistLimits,
  persistPopProgress,
  persistPulse,
  persistSlot,
  type PersistEnd,
  type PersistPlan,
  type PersistWhy,
} from "./persist-fx";

/** Vùng / bẫy / hào quang là hình trên mặt đất: vẽ trên nền, dưới mọi thực thể (cùng lớp với vùng báo trước đòn, trên nó một bậc). */
export const PERSIST_GROUND_DEPTH = -3;
/** Tượng đứng như một thực thể: vẽ theo hàng y của chân. */
export const PERSIST_TOTEM_DEPTH_OFFSET = 1;
/** Phần ngoài khung nhìn vẫn được vẽ (cộng thêm bán kính). */
const VIEW_PAD = 120;
const TAU = Math.PI * 2;

/** Vị trí người dùng hào quang và cờ chết; `null` = không còn trong state. */
export interface PersistAnchor {
  x: number;
  y: number;
  dead: boolean;
}

export interface PersistDeps {
  emitterBudget: () => number;
  reduced: () => boolean;
  inView: (x: number, y: number, pad: number) => boolean;
  /** Vị trí hiện tại của người dùng hào quang (của mình: vị trí đoán trước) */
  anchor: (by: string, mine: boolean) => PersistAnchor | null;
}

interface Item {
  g: Phaser.GameObjects.Graphics;
  plan: PersistPlan;
  start: number;
  end: PersistEnd | null;
  /** Chỗ vẽ hiện tại (tâm); hào quang cập nhật theo người dùng mỗi khung */
  x: number;
  y: number;
}

export interface PersistStats {
  /** Đang giữ / đang được vẽ (trong khung nhìn) */
  alive: number;
  drawn: number;
  /** Tổng đã nhận / số lần tái dùng vì vượt trần / số Graphics đã tạo / số `fxEnd` áp dụng */
  spawned: number;
  recycled: number;
  graphics: number;
  ended: number;
  peak: number;
}

export interface PersistSnap {
  id: number;
  kind: string;
  by: string;
  mine: boolean;
  x: number;
  y: number;
  r: number;
  alpha: number;
  armed: boolean;
  /** `pop` / `gone` khi đã nhận `fxEnd`, `null` khi còn sống bình thường */
  ending: PersistWhy | null;
}

export class PersistLayer {
  private readonly items: Item[] = [];
  private readonly pool: Phaser.GameObjects.Graphics[] = [];
  private created = 0;
  private spawned = 0;
  private recycled = 0;
  private ended = 0;
  private peak = 0;
  private drawn = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: PersistDeps,
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

  /** Nhận một vật thể (đã `parsePersist` + `persistPlan`); luôn thành công (vượt trần thì thay cái cũ). */
  add(plan: PersistPlan, now: number): void {
    const k = persistSlot(
      this.items,
      { id: plan.id, by: plan.by, mine: plan.mine },
      persistLimits(this.deps.emitterBudget()),
    );
    let item: Item;
    if (k >= 0) {
      item = { g: this.items[k]!.g, plan, start: now, end: null, x: plan.x, y: plan.y };
      this.items[k] = item;
      this.recycled++;
    } else {
      item = { g: this.take(), plan, start: now, end: null, x: plan.x, y: plan.y };
      this.items.push(item);
    }
    item.g.setAlpha(1).setVisible(true);
    this.spawned++;
    this.peak = Math.max(this.peak, this.items.length);
    this.draw(item, now);
  }

  /**
   * `fxEnd`: vật thể `id` kết thúc sớm. Trả về kế hoạch + chỗ đứng LÚC NÀY để cảnh phát bụi khi `pop`; `null` nếu không giữ cái nào mang `id` đó (người vào vùng nhìn sau lúc
   * dựng, đã bị thay, hoặc đã tắt) hoặc đã có `fxEnd` trước đó.
   */
  endOne(
    id: number,
    why: PersistWhy,
    now: number,
  ): { plan: PersistPlan; x: number; y: number } | null {
    for (const it of this.items) {
      if (it.plan.id !== id) continue;
      if (it.end !== null) return null;
      it.end = { at: now - it.start, why };
      this.ended++;
      return { plan: it.plan, x: it.x, y: it.y };
    }
    return null;
  }

  /** Cập nhật mỗi khung: vẽ lại, dọn cái đã hết hạn (hoán đổi với phần tử cuối, không dịch mảng). */
  update(now: number): void {
    let drawn = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      const elapsed = now - it.start;
      if (it.plan.kind === "aura" && it.end === null) {
        // hào quang bám người dùng: chết thì mờ tắt như `gone`; chưa thấy trong state thì chờ một lúc (tin `fx` có thể đến trước bản vá state) rồi mới coi là đã rời
        const a = this.deps.anchor(it.plan.by, it.plan.mine);
        if (a?.dead || (a === null && elapsed >= PERSIST_ANCHOR_GRACE_MS)) {
          it.end = { at: elapsed, why: "gone" };
          this.ended++;
        } else if (a !== null) {
          it.x = a.x;
          it.y = a.y;
        }
      }
      if (!persistAlive(it.plan, elapsed, it.end)) {
        this.release(it.g);
        const last = this.items.pop()!;
        if (i < this.items.length) this.items[i] = last;
        continue;
      }
      if (this.draw(it, now)) drawn++;
    }
    this.drawn = drawn;
  }

  /** Vẽ một vật thể; `false` (và ẩn) khi ngoài khung nhìn. */
  private draw(it: Item, now: number): boolean {
    const { g, plan } = it;
    if (!this.deps.inView(it.x, it.y, plan.r + VIEW_PAD)) {
      g.setVisible(false);
      return false;
    }
    const elapsed = now - it.start;
    const lim = persistLimits(this.deps.emitterBudget());
    const calm = this.deps.reduced();
    const a = persistAlpha(plan, elapsed, it.end);
    const pop = persistPopProgress(elapsed, it.end);
    const pulse = calm ? 0.5 : persistPulse(plan, elapsed);
    const spin = calm ? 0 : elapsed * 0.0009;
    const mineBoost = plan.mine ? 1.25 : 1;
    const r = plan.r;
    g.setVisible(true)
      .setPosition(it.x, it.y)
      .setDepth(plan.kind === "totem" ? it.y + PERSIST_TOTEM_DEPTH_OFFSET : PERSIST_GROUND_DEPTH)
      .setAlpha(1)
      .clear();
    if (a > 0) {
      switch (plan.kind) {
        case "zone":
          this.drawZone(g, plan, r, a, mineBoost, pulse, spin, lim.detail);
          break;
        case "trap":
          this.drawTrap(g, plan, r, a, mineBoost, elapsed, calm);
          break;
        case "totem":
          this.drawTotem(g, plan, r, a, mineBoost, pulse, lim.detail);
          break;
        case "aura":
          this.drawAura(g, plan, r, a, mineBoost, pulse, spin, lim.detail);
          break;
      }
    }
    if (pop >= 0) {
      // vòng nổ của bẫy: toả ra từ tâm, mờ dần; chớp trắng nửa đầu
      const pr = r * (0.35 + 0.85 * pop);
      g.lineStyle(3, plan.tint, 0.9 * (1 - pop));
      g.strokeCircle(0, 0, pr);
      if (pop < 0.5) {
        g.fillStyle(0xffffff, 0.35 * (1 - pop * 2));
        g.fillCircle(0, 0, pr * 0.8);
      }
    }
    return true;
  }

  /** Vùng: nền nhạt + viền, sóng lan mỗi nhịp, vài cung sáng quay quanh viền. */
  private drawZone(
    g: Phaser.GameObjects.Graphics,
    plan: PersistPlan,
    r: number,
    a: number,
    boost: number,
    pulse: number,
    spin: number,
    detail: boolean,
  ): void {
    g.fillStyle(plan.tint, (detail ? 0.14 : 0.11) * a * boost);
    g.fillCircle(0, 0, r);
    g.lineStyle(2, plan.tint, Math.min(1, 0.55 * a * boost));
    g.strokeCircle(0, 0, r);
    if (!detail) return;
    g.lineStyle(1.5, plan.tint, 0.4 * (1 - pulse) * a);
    g.strokeCircle(0, 0, r * (0.25 + 0.75 * pulse));
    g.lineStyle(3, 0xffffff, 0.55 * a);
    for (let k = 0; k < 3; k++) {
      const s = spin + (k * TAU) / 3;
      g.beginPath();
      g.arc(0, 0, r, s, s + 0.5);
      g.strokePath();
    }
  }

  /** Bẫy: chưa kích hoạt thì vòng nét đứt mờ; kích hoạt rồi thì ký hiệu thoi sáng + vòng, chớp một lần lúc kích hoạt. */
  private drawTrap(
    g: Phaser.GameObjects.Graphics,
    plan: PersistPlan,
    r: number,
    a: number,
    boost: number,
    elapsed: number,
    calm: boolean,
  ): void {
    const armed = persistArmed(plan, elapsed);
    const flash = persistArmFlash(plan, elapsed);
    if (!armed) {
      g.lineStyle(1.5, plan.tint, 0.3 * a * boost);
      for (let k = 0; k < 10; k++) {
        const s = (k * TAU) / 10;
        g.beginPath();
        g.arc(0, 0, r, s, s + 0.35);
        g.strokePath();
      }
      g.fillStyle(plan.tint, 0.18 * a);
      g.fillCircle(0, 0, 3);
      return;
    }
    const breathe = calm ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 0.006);
    g.fillStyle(plan.tint, (0.1 + 0.05 * breathe) * a * boost);
    g.fillCircle(0, 0, r);
    g.lineStyle(2, plan.tint, Math.min(1, (0.5 + 0.2 * breathe) * a * boost));
    g.strokeCircle(0, 0, r);
    const d = Math.min(r * 0.45, 10);
    g.fillStyle(plan.tint, 0.85 * a);
    g.fillPoints(
      [
        { x: 0, y: -d },
        { x: d, y: 0 },
        { x: 0, y: d },
        { x: -d, y: 0 },
      ],
      true,
    );
    if (flash > 0) {
      g.lineStyle(3, 0xffffff, 0.8 * flash);
      g.strokeCircle(0, 0, r * (1 + 0.3 * (1 - flash)));
    }
  }

  /** Tượng: bệ + cột đá có quầng sáng chớp theo nhịp, vòng tầm đánh mờ (nét đứt) quanh chân. */
  private drawTotem(
    g: Phaser.GameObjects.Graphics,
    plan: PersistPlan,
    r: number,
    a: number,
    boost: number,
    pulse: number,
    detail: boolean,
  ): void {
    g.lineStyle(1, plan.tint, 0.22 * a * boost);
    for (let k = 0; k < 12; k++) {
      const s = (k * TAU) / 12;
      g.beginPath();
      g.arc(0, 0, r, s, s + 0.3);
      g.strokePath();
    }
    g.fillStyle(0x1b1612, 0.55 * a);
    g.fillEllipse(0, 1, 22, 8);
    g.fillStyle(0x6a5f52, a);
    g.fillRect(-5, -22, 10, 22);
    g.fillStyle(0x8c8071, a);
    g.fillRect(-6, -24, 12, 3);
    const glow = 0.55 + 0.45 * (1 - pulse);
    if (detail) {
      g.fillStyle(plan.tint, 0.3 * glow * a);
      g.fillCircle(0, -14, 11);
    }
    g.fillStyle(plan.tint, glow * a);
    g.fillCircle(0, -14, 4);
    g.fillStyle(0xffffff, 0.8 * glow * a);
    g.fillCircle(0, -14, 1.6);
  }

  /** Hào quang: vòng mảnh quanh thân, thở theo nhịp; bậc cao thêm vài hạt sáng quay quanh vòng. */
  private drawAura(
    g: Phaser.GameObjects.Graphics,
    plan: PersistPlan,
    r: number,
    a: number,
    boost: number,
    pulse: number,
    spin: number,
    detail: boolean,
  ): void {
    const rr = r * (0.94 + 0.06 * Math.sin(pulse * TAU));
    g.fillStyle(plan.tint, 0.08 * a * boost);
    g.fillCircle(0, 0, rr);
    g.lineStyle(1.5, plan.tint, 0.5 * a * boost);
    g.strokeCircle(0, 0, rr);
    if (!detail || spin === 0) return;
    g.fillStyle(0xffffff, 0.85 * a);
    for (let k = 0; k < 4; k++) {
      const s = spin * 1.6 + (k * TAU) / 4;
      g.fillCircle(Math.cos(s) * rr, Math.sin(s) * rr, 2);
    }
  }

  /** Bỏ hết (đổi bản đồ / nối lại phòng): trả Graphics về pool. */
  clear(): void {
    for (const it of this.items) this.release(it.g);
    this.items.length = 0;
    this.drawn = 0;
  }

  stats(): PersistStats {
    return {
      alive: this.items.length,
      drawn: this.drawn,
      spawned: this.spawned,
      recycled: this.recycled,
      graphics: this.created,
      ended: this.ended,
      peak: this.peak,
    };
  }

  /** Cho script kiểm (`?debug`): từng vật thể đang giữ (chủ, hình, chỗ đứng, độ đậm tại `now`). */
  snapshot(now: number): PersistSnap[] {
    return this.items.map((it) => {
      const elapsed = now - it.start;
      return {
        id: it.plan.id,
        kind: it.plan.kind,
        by: it.plan.by,
        mine: it.plan.mine,
        x: it.x,
        y: it.y,
        r: it.plan.r,
        alpha: persistAlpha(it.plan, elapsed, it.end),
        armed: persistArmed(it.plan, elapsed),
        ending: it.end?.why ?? null,
      };
    });
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) g.destroy();
    this.pool.length = 0;
  }
}
