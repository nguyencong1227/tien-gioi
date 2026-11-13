/**
 * Bắn hiệu ứng THẬT trong cửa sổ lấy mẫu của harness hiệu năng (M5.1, #400): chế độ mock (`duel=mock`, `dungeon=mock`) không phát hạt / chữ bay đúng
 * lúc lấy mẫu nên kịch bản "Chiến đấu có hiệu ứng hạt" đo 0 hạt, 0 emitter, 2 draw call và cổng `perf-gate` không kiểm gì cho chiến đấu.
 *
 * KHÔNG sửa mã game: `FX_DRIVER_SOURCE` (chạy trong trang) dùng đúng API sẵn có `window.__fx` (`FxSystem.play` / `floatNumber` / `stats`,
 * lộ ra khi có `?debug` hoặc dev; harness luôn mở trang với `debug=1`) với các CÔNG THỨC THẬT trong `client/src/gfx/fx/recipes*.ts`
 * (test `fx-driver.test.ts` đòi mọi id dùng ở đây có trong sổ công thức và màu chữ trùng `FX_COLOR`), theo nhịp giống người chơi:
 *   - đòn của MÌNH (`hit-spark`, thỉnh thoảng `hit-crit` / `hit-heavy`, ưu tiên 2) kèm chữ sát thương;
 *   - đòn của người khác (ưu tiên 1) kèm chữ;
 *   - mình bị đánh (`hurt-self`, ưu tiên 2) kèm chữ đỏ;
 *   - công pháp lớn: kiếm khí (`sword-qi` rải dọc đường bay + `sword-tip` ở mũi) và `slash-edge`;
 *   - quái gục (`mon-vanish`);
 *   - kế hoạch `boss` (M6 #409, nit của A ở #450): đòn thường lên TRÙM là `boss-hit` (thay `hit-spark`) và trùm gục nổ `boss-vanish` (ưu tiên 2
 *     như `planMonsterDeath`), đo bằng số thật chứ không chỉ bằng test `FxBudget`.
 * Vị trí quanh TÂM KHUNG NHÌN của camera (không phụ thuộc chế độ mock không đối chiếu vị trí). Dùng bộ sinh số giả ngẫu nhiên có hạt giống cố định
 * nên mỗi lần chạy cùng một chuỗi hiệu ứng.
 *
 * ĐO ĐỈNH: hạt / emitter / chữ bay SỐNG chỉ TĂNG lúc xin ngân sách (play / floatNumber), rồi giảm theo thời gian. Vì vậy đọc `fx.stats()` NGAY SAU
 * mỗi lần phát cho ra đúng đỉnh trong cửa sổ (lớp phủ `?perf=1` chỉ cho số sống ở lần vẽ cuối, không phải đỉnh).
 *
 * Hợp đồng (test chạy CHÍNH đoạn tiêm này trong `node:vm` với `__fx` giả):
 *   window.__tgFxDriver.start(tên kế hoạch)  -> { ok: true } | { ok: false, error }
 *   window.__tgFxDriver.stop()               -> báo cáo (xem `parseFxDriverReport`) hoặc null nếu chưa start.
 * Chữ bay: ngân sách `damageNumbers`; hạt / emitter: ưu tiên 2 được vượt trần tới `OWN_OVERSHOOT` lần (docs 7.1) nên trần CỨNG của cổng là
 * trần x `OWN_OVERSHOOT` (xem `perf-gate.mjs`).
 */

/** Màu chữ (trùng `FX_COLOR` trong `recipes-combat.ts`; test đối chiếu). */
export const FX_DRIVER_COLORS = { hit: 0xffe9a8, crit: 0xffd34d, hurt: 0xff6b5e };

/** Mọi id công thức mà bộ bắn dùng (test đòi có trong sổ công thức thật). */
export const FX_DRIVER_RECIPES = [
  "hit-spark",
  "hit-crit",
  "hit-heavy",
  "hurt-self",
  "sword-qi",
  "sword-tip",
  "slash-edge",
  "mon-vanish",
  "boss-hit",
  "boss-vanish",
];

/**
 * Kế hoạch (ms giữa hai lần): `hitMs` đòn của mình, `otherMs` đòn của người khác, `hurtMs` mình bị đánh, `skillMs` công pháp lớn,
 * `killMs` quái gục. `combat` = nhịp người chơi thường; `burst` = "nhiều chiêu liên tục" (đòn dồn dập + công pháp liên tiếp);
 * `boss` = nhịp `burst` nhưng đánh TRÙM (`boss: true`: đòn thường -> `boss-hit`, gục -> `boss-vanish`): ca xấu nhất của hai công thức trùm
 * (cả đội dồn đòn, trùm "gục" mỗi 1,2 s: thực tế chỉ một lần mỗi trận).
 */
export const FX_PLANS = {
  combat: { hitMs: 200, otherMs: 350, hurtMs: 1200, skillMs: 1500, killMs: 3000 },
  burst: { hitMs: 100, otherMs: 160, hurtMs: 500, skillMs: 600, killMs: 1200 },
  boss: { hitMs: 100, otherMs: 160, hurtMs: 500, skillMs: 600, killMs: 1200, boss: true },
};

export const FX_DRIVER_SOURCE = `(() => {
  if (window.__tgFxDriver) return;
  const PLANS = ${JSON.stringify(FX_PLANS)};
  const COLOR = ${JSON.stringify(FX_DRIVER_COLORS)};
  const TICK_MS = 20;
  let run = null;

  // Bộ sinh số giả ngẫu nhiên (mulberry32) hạt giống cố định: mỗi lần chạy cùng một chuỗi hiệu ứng
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const center = () => {
    const v = window.__scene && window.__scene.cameras && window.__scene.cameras.main && window.__scene.cameras.main.worldView;
    return v && Number.isFinite(v.centerX) && Number.isFinite(v.centerY) ? { x: v.centerX, y: v.centerY } : { x: 400, y: 300 };
  };

  window.__tgFxDriver = {
    start(planName) {
      const fx = window.__fx;
      const plan = PLANS[planName];
      if (!plan) return { ok: false, error: "kế hoạch lạ: " + planName };
      if (!fx || typeof fx.play !== "function" || typeof fx.floatNumber !== "function" || typeof fx.stats !== "function")
        return { ok: false, error: "không có window.__fx (cần ?debug=1)" };
      if (run) return { ok: false, error: "đang chạy" };
      const rand = rng(20261112);
      const s0 = fx.stats();
      run = {
        planName, fx, plan, rand, startedAt: performance.now(),
        next: { hit: 0, other: 0, hurt: 0, skill: 0, kill: 0 },
        played: 0, rejected: 0, floatsPlayed: 0, floatsRejected: 0,
        peakParticles: 0, peakEmitters: 0, peakFloats: 0,
        admitted0: s0.admitted, dropped0: s0.dropped,
        timer: null,
      };
      const r = run;
      const peaks = () => {
        const s = fx.stats();
        if (s.liveParticles > r.peakParticles) r.peakParticles = s.liveParticles;
        if (s.liveEmitters > r.peakEmitters) r.peakEmitters = s.liveEmitters;
        if (s.floatsActive > r.peakFloats) r.peakFloats = s.floatsActive;
      };
      const play = (id, x, y, opts) => {
        const ok = fx.play(id, x, y, opts);
        if (ok) r.played++; else r.rejected++;
        peaks();
      };
      const num = (text, x, y, color, size, priority) => {
        const ok = fx.floatNumber(text, x, y, { color, size, priority });
        if (ok) r.floatsPlayed++; else r.floatsRejected++;
        peaks();
      };
      const near = (spread) => {
        const c = center();
        return { x: c.x + (rand() * 2 - 1) * spread, y: c.y + (rand() * 2 - 1) * spread };
      };
      const tick = () => {
        const now = performance.now() - r.startedAt;
        if (now >= r.next.hit) {
          r.next.hit = now + plan.hitMs;
          const p = near(70); const roll = rand();
          const id = roll < 0.06 ? "hit-heavy" : roll < 0.18 ? "hit-crit" : plan.boss ? "boss-hit" : "hit-spark";
          play(id, p.x, p.y, { priority: 2 });
          const crit = id === "hit-heavy" || id === "hit-crit";
          num((crit ? "Bạo! " : "") + Math.round(20 + rand() * 180), p.x, p.y - 8, crit ? COLOR.crit : COLOR.hit, crit ? 20 : 15, 2);
        }
        if (now >= r.next.other) {
          r.next.other = now + plan.otherMs;
          const p = near(130);
          play(plan.boss ? "boss-hit" : "hit-spark", p.x, p.y, { priority: 1 });
          num(String(Math.round(10 + rand() * 90)), p.x, p.y - 8, COLOR.hit, 15, 1);
        }
        if (now >= r.next.hurt) {
          r.next.hurt = now + plan.hurtMs;
          const p = near(30);
          play("hurt-self", p.x, p.y, { priority: 2 });
          num(String(Math.round(15 + rand() * 60)), p.x, p.y - 8, COLOR.hurt, 15, 2);
        }
        if (now >= r.next.skill) {
          r.next.skill = now + plan.skillMs;
          // Kiếm khí: sword-qi rải dọc đường bay (3 điểm) + sword-tip ở mũi; kèm slash-edge và chữ lớn
          const c = center(); const angle = rand() * Math.PI * 2; const range = 180;
          for (let i = 1; i <= 3; i++) {
            const d = (range * i) / 4;
            play("sword-qi", c.x + Math.cos(angle) * d, c.y + Math.sin(angle) * d, { priority: 2, angle });
          }
          play("sword-tip", c.x + Math.cos(angle) * range, c.y + Math.sin(angle) * range, { priority: 2 });
          const q = near(60);
          play("slash-edge", q.x, q.y, { priority: 2 });
          num("Bạo! " + Math.round(150 + rand() * 250), q.x, q.y - 10, COLOR.crit, 20, 2);
        }
        if (now >= r.next.kill) {
          r.next.kill = now + plan.killMs;
          const p = near(110);
          if (plan.boss) play("boss-vanish", p.x, p.y, { priority: 2 });
          else play("mon-vanish", p.x, p.y);
        }
      };
      tick();
      r.timer = setInterval(tick, TICK_MS);
      return { ok: true };
    },
    stop() {
      const r = run;
      if (!r) return null;
      clearInterval(r.timer);
      run = null;
      const s = r.fx.stats();
      return {
        plan: r.planName,
        durationMs: Math.round(performance.now() - r.startedAt),
        played: r.played, rejected: r.rejected,
        floatsPlayed: r.floatsPlayed, floatsRejected: r.floatsRejected,
        peakParticles: r.peakParticles, peakEmitters: r.peakEmitters, peakFloats: r.peakFloats,
        particleLimit: s.particleLimit,
        fxAdmitted: s.admitted - r.admitted0, fxDropped: s.dropped - r.dropped0,
      };
    },
  };
})();`;

const isCount = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Số lần phát thành công tối thiểu để tin báo cáo (5 giây ở nhịp `combat` phát vài chục lần). */
export const MIN_FX_PLAYED = 10;

/**
 * Đọc báo cáo từ `JSON.stringify(window.__tgFxDriver.stop())`. Sai hình dạng / thiếu số cho `null` (perf-gate đỏ "thiếu số đo",
 * KHÔNG mặc định 0).
 * @param {unknown} raw
 * @returns {{ fxPlan: string, fxPlayed: number, fxRejected: number, floatsPlayed: number, floatsRejected: number,
 *   particlesPeak: number, emittersPeak: number, floatsPeak: number, fxAdmitted: number, fxDropped: number } | null}
 */
export function parseFxDriverReport(raw) {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const need = [
    "played",
    "rejected",
    "floatsPlayed",
    "floatsRejected",
    "peakParticles",
    "peakEmitters",
    "peakFloats",
    "fxAdmitted",
    "fxDropped",
  ];
  for (const k of need) if (!isCount(v[k])) return null;
  if (typeof v.plan !== "string") return null;
  return {
    fxPlan: v.plan,
    fxPlayed: v.played,
    fxRejected: v.rejected,
    floatsPlayed: v.floatsPlayed,
    floatsRejected: v.floatsRejected,
    particlesPeak: v.peakParticles,
    emittersPeak: v.peakEmitters,
    floatsPeak: v.peakFloats,
    fxAdmitted: v.fxAdmitted,
    fxDropped: v.fxDropped,
  };
}
