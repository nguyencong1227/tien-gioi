/**
 * Lõi hiệu ứng (M5.2, #325, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 7): `playFx` + chữ bay, có NGÂN SÁCH và POOL.
 *
 *  - client-only, theo sự kiện đã có (không thêm tin nhắn / trường đồng bộ);
 *  - công thức theo dữ liệu (`recipes.ts`); mỗi công thức một emitter dùng lại (pool), phát bằng `explode`;
 *  - ngân sách tập trung (`budget.ts`): trần hạt / emitter theo hồ sơ chất lượng, ưu tiên 2 > 1 > 0;
 *  - chữ bay bằng BitmapText (một texture phông sinh bằng mã) với trần `damageNumbers`, tái dùng đối tượng;
 *  - tôn trọng hồ sơ: rung (`shake`), chớp (`flashes`), giảm chuyển động (hạt -70 %);
 *  - đóng cảnh thì giải phóng sạch (emitter, chữ, đăng ký chỉ số).
 */
import Phaser from "phaser";
import { FxBudget, type FxPriority } from "./budget";
import { FloatSet, type FloatSpec } from "./float-set";
import { ensureFxAtlas, ensureFxFont, FX_ATLAS_KEY, FX_FONT_KEY } from "./atlas";
import { getRecipe, recipeCost, type FxRecipe } from "./recipes";
import { registerPerfStat } from "../perf-overlay";
import { REDUCED_MOTION_PARTICLE_FACTOR, type QualityProfile } from "../quality";
import { makeZoneSource, type ZoneSource } from "./zone";

export interface FxOpts {
  /** Ghi đè ưu tiên mặc định của công thức. */
  priority?: FxPriority;
  /** Hướng phát (radian, 0 = sang phải) cho công thức có hướng; hạt bay trong ±20° quanh hướng này. */
  angle?: number;
  /** Hệ số kích thước hạt (mặc định 1). */
  scale?: number;
  /** Ghi đè màu hạt (0xRRGGBB). */
  tint?: number;
  /** Ghi đè kích thước vùng phát (px thế giới) của công thức có `zone` (vd phủ khung nhìn cho thời tiết). */
  area?: { w: number; h: number };
}

export interface FxStats {
  liveParticles: number;
  liveEmitters: number;
  particleLimit: number;
  admitted: number;
  dropped: number;
  floatsActive: number;
  floatsDropped: number;
  floatsCreated: number;
}

export interface FxSystem {
  /** Phát công thức tại toạ độ THẾ GIỚI; trả về false nếu bị bỏ (hết ngân sách / không biết công thức). */
  play(id: string, x: number, y: number, opts?: FxOpts): boolean;
  /** Chữ bay (số sát thương...). `color` 0xRRGGBB, `size` px thế giới. */
  floatNumber(
    text: string,
    x: number,
    y: number,
    o: { color: number; size: number; priority?: FxPriority },
  ): boolean;
  /** Gọi mỗi khung (chuyển động chữ bay). */
  update(nowMs: number): void;
  /** Ẩn chữ bay (đổi bản đồ); hạt tự hết. */
  clear(): void;
  stats(): FxStats;
  destroy(): void;
}

export interface FxDeps {
  getProfile: () => QualityProfile;
  /** Độ sâu vẽ của hiệu ứng (trên mọi thực thể). */
  depth: () => number;
}

const DEG = 180 / Math.PI;

function buildEmitterConfig(
  r: FxRecipe,
  zone?: ZoneSource,
): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig {
  const p = r.particles!;
  const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
    frame: [...p.frames],
    emitting: false,
    lifespan: { min: p.lifespan.min, max: p.lifespan.max },
    speed: { min: p.speed.min, max: p.speed.max },
    scale: { start: p.scale.start, end: p.scale.end },
    alpha: { start: p.alpha.start, end: p.alpha.end },
    blendMode: p.blend === "normal" ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD,
    gravityY: p.gravityY ?? 0,
    tint: p.tint ?? 0xffffff,
  };
  if (p.angle) cfg.angle = { min: p.angle.min, max: p.angle.max };
  if (zone) cfg.emitZone = { type: "random", source: zone, quantity: 1 };
  return cfg;
}

export function createFxSystem(scene: Phaser.Scene, deps: FxDeps): FxSystem {
  ensureFxAtlas(scene);
  ensureFxFont(scene);

  const budget = new FxBudget(
    () => {
      const p = deps.getProfile();
      return { particles: p.particleBudget, emitters: p.emitterBudget };
    },
    () => scene.time.now,
  );

  const emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  const zones = new Map<string, ZoneSource>();
  const emitterFor = (r: FxRecipe): Phaser.GameObjects.Particles.ParticleEmitter => {
    let e = emitters.get(r.id);
    if (!e) {
      let zone: ZoneSource | undefined;
      if (r.particles?.zone) {
        zone = makeZoneSource(r.particles.zone.w, r.particles.zone.h);
        zones.set(r.id, zone);
      }
      e = scene.add.particles(0, 0, FX_ATLAS_KEY, buildEmitterConfig(r, zone));
      e.setDepth(deps.depth());
      emitters.set(r.id, e);
    }
    return e;
  };

  const floats = new FloatSet<Phaser.GameObjects.BitmapText>(
    {
      create: () => {
        const t = scene.add
          .bitmapText(0, 0, FX_FONT_KEY, "", 16)
          .setOrigin(0.5)
          .setDepth(deps.depth() + 1)
          .setVisible(false);
        return t;
      },
      show: (t, s: FloatSpec) => {
        t.setText(s.text).setFontSize(s.size).setTint(s.color).setPosition(s.x, s.y).setAlpha(1);
        t.setVisible(true);
      },
      place: (t, y, a) => void t.setY(y).setAlpha(a),
      hide: (t) => void t.setVisible(false),
      destroy: (t) => t.destroy(),
    },
    () => deps.getProfile().damageNumbers,
  );

  const offStats = [
    registerPerfStat("hạt", () => {
      const l = budget.live();
      return `${l.particles}/${deps.getProfile().particleBudget}`;
    }),
    registerPerfStat("emitter", () => {
      const l = budget.live();
      return `${l.emitters}/${deps.getProfile().emitterBudget}`;
    }),
    registerPerfStat("fx bỏ", () => {
      const d = budget.stats().dropped;
      return `${d[0] + d[1] + d[2]} (chữ ${floats.dropped})`;
    }),
  ];

  let destroyed = false;

  const sys: FxSystem = {
    play(id, x, y, opts) {
      if (destroyed) return false;
      const r = getRecipe(id);
      if (!r) return false;
      const prof = deps.getProfile();
      const priority = opts?.priority ?? r.priority;
      let played = false;

      if (r.particles) {
        const scale = prof.reducedMotion ? REDUCED_MOTION_PARTICLE_FACTOR : 1;
        const cost = recipeCost(r, scale);
        if (budget.tryAcquire(cost, priority)) {
          const e = emitterFor(r);
          e.setDepth(deps.depth());
          if (opts?.angle !== undefined) {
            const deg = opts.angle * DEG;
            e.setEmitterAngle({ min: deg - 20, max: deg + 20 });
          } else if (!r.particles.angle) {
            e.setEmitterAngle({ min: 0, max: 360 });
          }
          const zone = zones.get(r.id);
          if (zone) {
            zone.w = opts?.area?.w ?? r.particles.zone!.w;
            zone.h = opts?.area?.h ?? r.particles.zone!.h;
          }
          e.setParticleTint(opts?.tint ?? r.particles.tint ?? 0xffffff);
          const k = opts?.scale ?? 1;
          e.setParticleScale(r.particles.scale.start * k, r.particles.scale.end * k);
          e.explode(cost.particles, x, y);
          played = true;
        }
      }
      // Rung / chớp toàn màn hình: chỉ khi hồ sơ cho phép (giảm chuyển động tắt cả hai) và là việc của mình
      if (r.shake && prof.shake && priority === 2) {
        scene.cameras.main.shake(r.shake.durationMs, r.shake.intensity);
        played = true;
      }
      if (r.flash && prof.flashes && priority === 2) {
        const c = r.flash.color;
        scene.cameras.main.flash(r.flash.durationMs, (c >> 16) & 255, (c >> 8) & 255, c & 255);
        played = true;
      }
      return played;
    },

    floatNumber(text, x, y, o) {
      if (destroyed) return false;
      return floats.spawn(
        { text, x, y, color: o.color, size: o.size, priority: o.priority ?? 1 },
        scene.time.now,
      );
    },

    update(nowMs) {
      if (destroyed) return;
      floats.step(nowMs, deps.getProfile().reducedMotion);
    },

    clear() {
      floats.clear();
    },

    stats() {
      const l = budget.live();
      const d = budget.stats().dropped;
      return {
        liveParticles: l.particles,
        liveEmitters: l.emitters,
        particleLimit: deps.getProfile().particleBudget,
        admitted: budget.stats().admitted,
        dropped: d[0] + d[1] + d[2],
        floatsActive: floats.activeCount,
        floatsDropped: floats.dropped,
        floatsCreated: floats.createdCount,
      };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offStats) off();
      floats.dispose();
      for (const e of emitters.values()) e.destroy();
      emitters.clear();
      budget.clear();
    },
  };
  return sys;
}
