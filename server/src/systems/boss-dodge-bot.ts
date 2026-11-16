// Bot né HOÀN HẢO cho trùm nhiều chiêu (mục 42, #934): dùng chung giữa fuzz bộ chiêu ngẫu nhiên (`boss-fuzz.test.ts`) và kiểm trên DỮ LIỆU THẬT (`boss-data-dodge.test.ts`).
// Bot được đặt ở chỗ XẤU NHẤT của mỗi vùng `warn` (đo bằng đúng `bossInZone` của máy chủ trên lưới, không chép công thức), đợi `FAIR_REFLEX_MS` rồi chạy thẳng ra chỗ
// an toàn gần nhất ở `FAIR_SPEED` mỗi tick một bước; `mode: "stand"` là bot đứng yên (đối chứng: phải bị trúng). Phạm vi: một người một trùm, bãi trống không tường,
// không làm chậm, đòn đánh thường của mọi quái bị tắt (chỉ đo chiêu của bộ thực thi); vũng cũ chạm vào kế hoạch thì bỏ qua đòn đó. Hai vùng chồng nhau cùng lúc chưa kiểm.
import {
  BOSS_HIT_GRACE_PX,
  DEFAULT_MAP,
  MONSTER_BY_ID,
  PLAYER_RADIUS,
  type BossAbility,
  type BossDef,
  type FxMsg,
  type GameMap,
} from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { bossInZone } from "./boss";
import { newBossCtrl, type BossZone } from "./boss-state";
import { tickMonsters } from "./monsters";

const TICK_MS = 50;
/**
 * LỜI HỨA công bằng mà bot kiểm chứng: người chơi phản xạ sau `FAIR_REFLEX_MS` kể từ lúc `warn` hiện (200 phản xạ + 200 trễ mạng, #950) rồi chạy ở `FAIR_SPEED` px/giây.
 * Cố ý KHÔNG lấy từ `BOSS_REACT_MS` / `BOSS_ESCAPE_SPEED` của luật: hạ hằng của luật xuống dưới lời hứa này thì bot trúng đòn, bài kiểm đỏ.
 */
export const FAIR_REFLEX_MS = 400;
export const FAIR_SPEED = 150;
const STEP_PX = (FAIR_SPEED * TICK_MS) / 1000; // 7,5 px mỗi tick
const REACH = PLAYER_RADIUS - BOSS_HIT_GRACE_PX;

// ---------- Cảnh: bãi trống + trùm đứng yên + một người chơi ----------

function openArena(): GameMap {
  const m = Object.create(DEFAULT_MAP) as GameMap;
  m.circleBlocked = () => false;
  return m;
}

type Pred = (x: number, y: number) => boolean;
type Box = { x0: number; x1: number; y0: number; y1: number };
const zoneFn =
  (z: BossZone): Pred =>
  (x, y) =>
    bossInZone(z, x, y);

/** Vùng nguy hiểm từ `fx` `warn` (đúng thứ client nhận); `pull` cần cả `pullPx` nên dựng theo hình của chiêu. */
function threatOf(fx: Extract<FxMsg, { kind: "warn" }>, ab: BossAbility): { hit: Pred; box: Box } {
  const s = ab.shape;
  if (s.t === "pull") {
    const blast = zoneFn({ t: "circle", x: fx.x, y: fx.y, r: s.blastR, r0: 0 });
    const R = Math.max(s.r, s.blastR) + 10;
    return {
      hit: (x, y) => {
        const dx = fx.x - x;
        const dy = fx.y - y;
        const d = Math.hypot(dx, dy);
        if (d > s.r + REACH || d <= 0) return blast(x, y); // ngoài tầm kéo: đứng nguyên
        const k = (d - Math.min(s.pullPx, d)) / d; // kéo về tâm tối đa `pullPx`
        return blast(fx.x - dx * k, fx.y - dy * k);
      },
      box: { x0: fx.x - R, x1: fx.x + R, y0: fx.y - R, y1: fx.y + R },
    };
  }
  if (fx.shape === "circle") {
    const R = fx.r + 10;
    return {
      hit: zoneFn({ t: "circle", x: fx.x, y: fx.y, r: fx.r, r0: fx.r0 ?? 0 }),
      box: { x0: fx.x - R, x1: fx.x + R, y0: fx.y - R, y1: fx.y + R },
    };
  }
  if (fx.shape === "cone") {
    const R = fx.r + 10;
    return {
      hit: zoneFn({ t: "cone", x: fx.x, y: fx.y, r: fx.r, angle: fx.angle ?? 0, arc: fx.arc ?? 0 }),
      box: { x0: fx.x - R, x1: fx.x + R, y0: fx.y - R, y1: fx.y + R },
    };
  }
  const a = fx.angle ?? 0;
  const x1 = fx.x + Math.cos(a) * fx.r;
  const y1 = fx.y + Math.sin(a) * fx.r;
  const pad = (fx.w ?? 0) / 2 + 10;
  return {
    hit: zoneFn({ t: "seg", x0: fx.x, y0: fx.y, x1, y1, w: fx.w ?? 0 }),
    box: {
      x0: Math.min(fx.x, x1) - pad,
      x1: Math.max(fx.x, x1) + pad,
      y0: Math.min(fx.y, y1) - pad,
      y1: Math.max(fx.y, y1) + pad,
    },
  };
}

// ---------- Biến đổi khoảng cách Euclid (Felzenszwalb) ----------

const INF = 1e20;
function dt1(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const dq = q - v[k]!;
    out[q] = dq * dq + f[v[k]!]!;
  }
}

/**
 * Chỗ XẤU NHẤT của vùng `threat` (không tính chỗ đang bị `hazards` chiếm: bot không được đặt vào vũng cũ) và đường thoát ngắn nhất tới chỗ an toàn (ngoài hợp của vùng
 * và `hazards`). Đo trên lưới `cell` px bằng chính hàm trúng của máy chủ; đích tinh chỉnh bằng chia đôi trên đoạn xuất phát -> ô an toàn gần nhất (sai số < 0,1 px).
 */
function worstSpot(threat: Pred, box: Box, hazards: Pred[]) {
  const size = Math.max(box.x1 - box.x0, box.y1 - box.y0);
  const cell = Math.max(2, size / 150);
  const nx = Math.ceil((box.x1 - box.x0) / cell);
  const ny = Math.ceil((box.y1 - box.y0) / cell);
  const g = new Float64Array(nx * ny);
  const inThreat = new Uint8Array(nx * ny);
  const free = (x: number, y: number) => !hazards.some((h) => h(x, y));
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = box.x0 + (i + 0.5) * cell;
      const y = box.y0 + (j + 0.5) * cell;
      const t = threat(x, y);
      const hz = !free(x, y);
      g[j * nx + i] = t || hz ? INF : 0;
      inThreat[j * nx + i] = t && !hz ? 1 : 0;
    }
  const n = Math.max(nx, ny);
  const f = new Float64Array(n);
  const o = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) f[j] = g[j * nx + i]!;
    dt1(f, ny, o, v, z);
    for (let j = 0; j < ny; j++) g[j * nx + i] = o[j]!;
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) f[i] = g[j * nx + i]!;
    dt1(f, nx, o, v, z);
    for (let i = 0; i < nx; i++) g[j * nx + i] = o[i]!;
  }
  let best = -1;
  let bestD = -1;
  for (let k = 0; k < nx * ny; k++) {
    if (inThreat[k] && g[k]! > bestD) {
      bestD = g[k]!;
      best = k;
    }
  }
  if (best < 0) return null;
  const sx = box.x0 + ((best % nx) + 0.5) * cell;
  const sy = box.y0 + (Math.floor(best / nx) + 0.5) * cell;
  // ô an toàn gần nhất (vét cạn một lần), rồi chia đôi trên đoạn tới đó để ra đúng mép
  let nd = Infinity;
  let tx = sx;
  let ty = sy;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (g[j * nx + i] !== 0) continue;
      const x = box.x0 + (i + 0.5) * cell;
      const y = box.y0 + (j + 0.5) * cell;
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < nd) {
        nd = d;
        tx = x;
        ty = y;
      }
    }
  const len = Math.sqrt(nd);
  const ux = (tx - sx) / (len || 1);
  const uy = (ty - sy) / (len || 1);
  const safe = (d: number) => !threat(sx + ux * d, sy + uy * d) && free(sx + ux * d, sy + uy * d);
  let lo = 0;
  let hi = len;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (safe(mid)) hi = mid;
    else lo = mid;
  }
  return { sx, sy, tx: sx + ux * (hi + 0.05), ty: sy + uy * (hi + 0.05), dist: hi };
}

// ---------- Một lần chạy: bot né hoàn hảo hoặc bot đứng yên ----------

export interface Result {
  casts: number; // số đòn có sát thương đã đáp (theo từng vùng `warn` là mối đe doạ)
  hitCasts: number; // số đòn mà khí huyết bot giảm quanh lúc đáp
  hurt: { at: number; ability: string; x: number; y: number }[]; // lần mất khí huyết (bot né)
  byShape: Record<string, { casts: number; hits: number }>;
}

/**
 * Chạy `def` `simMs` ms mô phỏng với một bot. `opts.phase` (mặc định 0) đặt khí huyết trùm ngay dưới mốc vào giai đoạn đó để kiểm bộ chiêu của TỪNG giai đoạn.
 * Trả số đòn đã đáp / trúng bot theo hình và danh sách lần bot mất khí huyết (bot né phải rỗng).
 */
export function runDodgeBot(
  defSeed: number,
  def: BossDef,
  mode: "dodge" | "stand",
  simMs: number,
  opts: { phase?: number } = {},
): Result {
  const h = makeWorld(openArena());
  const { w } = h;
  w.now = 10_000;
  w.bossMoves = true;
  const spot = { x: 2300, y: 2300 };
  const mon = addMonster(w, def.kind, spot.x, spot.y);
  // đứng yên, không đánh thường, thấy xa (800 px): chỉ còn chiêu của bộ thực thi gây sát thương, hình học đo được
  mon.mc.def = { ...MONSTER_BY_ID[def.kind]!, speed: 0, attackRange: 0, aggro: 800 };
  mon.mc.boss = newBossCtrl(def, defSeed % 1000003);
  mon.mc.nextAttack = Number.MAX_SAFE_INTEGER; // chỉ đo chiêu của bộ thực thi: tắt đòn đánh thường (đứng sát chân trùm không phải cái đang kiểm)
  if (opts.phase)
    mon.m.hp = Math.max(1, Math.ceil(def.phases[opts.phase]!.fromHp * mon.m.maxHp) - 1);
  const { p } = addPlayer(w, "a", 4, 0);
  p.x = spot.x + 250;
  p.y = spot.y;
  p.hp = p.maxHp = 1_000_000_000;

  const abOf = (id: string) => def.abilities.find((a) => a.id === id)!;
  const hazards: { hit: Pred; until: number }[] = [];
  interface Threat {
    hitAt: number;
    /** Hạn cuối để đòn này làm bot mất khí huyết (vũng: sau `tickMs`); qua hạn mà không mất thì tính là không trúng. */
    judgeAt: number;
    shape: string;
    judged: boolean;
  }
  const threats: Threat[] = [];
  let plan: { tx: number; ty: number; moveAt: number } | null = null;
  let seen = 0;
  let cur: BossAbility | null = null;
  let warnsInCast = 0;
  let lastHp = p.hp;
  const out: Result = { casts: 0, hitCasts: 0, hurt: [], byShape: {} };
  const tally = (shape: string, hit: boolean) => {
    const b = (out.byShape[shape] ??= { casts: 0, hits: 0 });
    b.casts++;
    if (hit) b.hits++;
  };
  const t0 = w.now;

  while (w.now < t0 + simMs) {
    w.now += TICK_MS;
    tickMonsters(w, TICK_MS / 1000);
    for (const q of w.mctrl.values()) q.nextAttack = Number.MAX_SAFE_INTEGER; // kể cả quái con trùm gọi ra: không đánh thường
    // khí huyết bot giảm trong tick này? Gán cho đòn chưa xử lý có mốc đáp gần nhất (đáp có thể sớm hơn mốc ước tính tới 2 tick: warn của mưa phát muộn tới một tick)
    if (p.hp < lastHp) {
      if (mode === "dodge") out.hurt.push({ at: w.now, ability: cur?.id ?? "?", x: p.x, y: p.y });
      const t = threats.find(
        (q) => !q.judged && w.now >= q.hitAt - 2 * TICK_MS && w.now <= q.judgeAt,
      );
      if (t) {
        t.judged = true;
        out.hitCasts++;
        out.casts++;
        tally(t.shape, true);
      }
      lastHp = p.hp;
    }
    // đọc `fx` mới
    for (; seen < h.fx.length; seen++) {
      const fx = h.fx[seen]!;
      if (fx.kind === "bossCast") {
        cur = abOf(fx.ability);
        warnsInCast = 0;
      } else if (fx.kind === "warn" && cur) {
        warnsInCast++;
        const s = cur.shape;
        if (s.t === "pull" && warnsInCast > 1) continue; // hai vòng cùng một đòn
        if (s.t === "pool" && warnsInCast > 1) continue; // báo lần hai = vũng hiện ra (đã tính ở lần một)
        const th = threatOf(fx, cur);
        // chỗ xấu nhất và đường thoát tính như vùng đứng MỘT MÌNH (đúng phạm vi của luật tĩnh); vũng cũ chỉ được phép KHÔNG liên quan tới kế hoạch này (xem dưới)
        const spotPlan = worstSpot(th.hit, th.box, []);
        const live = hazards.filter((hz) => hz.until > w.now);
        // vũng cũ chạm vào chỗ đặt, đường thoát hay đích (bot đơn giản không biết vòng; luật tĩnh cũng không tính hai vùng chồng nhau): cho bot ra xa, bỏ qua đòn này
        const crosses =
          spotPlan !== null &&
          live.length > 0 &&
          (() => {
            const len = Math.hypot(spotPlan.tx - spotPlan.sx, spotPlan.ty - spotPlan.sy);
            for (let d = 0; d <= len; d += 2) {
              const x = spotPlan.sx + ((spotPlan.tx - spotPlan.sx) * d) / (len || 1);
              const y = spotPlan.sy + ((spotPlan.ty - spotPlan.sy) * d) / (len || 1);
              if (live.some((hz) => hz.hit(x, y))) return true;
            }
            return false;
          })();
        if (!spotPlan || crosses) {
          for (let k = 0; k < 8; k++) {
            const x = spot.x + Math.cos(k * 0.785398) * 450;
            const y = spot.y + Math.sin(k * 0.785398) * 450;
            if (!th.hit(x, y) && !live.some((hz) => hz.hit(x, y))) {
              p.x = x;
              p.y = y;
              break;
            }
          }
          plan = null;
          continue;
        }
        p.x = spotPlan.sx;
        p.y = spotPlan.sy;
        threats.push({
          hitAt: w.now + fx.ms,
          judgeAt: w.now + fx.ms + (s.t === "pool" ? s.tickMs : 0) + 2 * TICK_MS,
          shape: s.t,
          judged: false,
        });
        if (s.t === "pool") hazards.push({ hit: th.hit, until: w.now + fx.ms + s.ttlMs });
        plan =
          mode === "dodge"
            ? { tx: spotPlan.tx, ty: spotPlan.ty, moveAt: w.now + FAIR_REFLEX_MS }
            : null;
      }
    }
    // bot chạy mỗi tick một bước, sau khi phản xạ xong
    if (plan && w.now >= plan.moveAt) {
      const dx = plan.tx - p.x;
      const dy = plan.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= 1e-9) plan = null;
      else {
        const k = Math.min(STEP_PX, d) / d;
        const m = w.map.moveWithCollision(p.x, p.y, dx * k, dy * k, PLAYER_RADIUS);
        p.x = m.x;
        p.y = m.y;
        if (d <= STEP_PX) plan = null;
      }
    }
    // đòn nào đã qua hạn mà khí huyết không giảm: tính là không trúng
    for (const t of threats)
      if (!t.judged && w.now > t.judgeAt) {
        t.judged = true;
        out.casts++;
        tally(t.shape, false);
      }
  }
  return out;
}
