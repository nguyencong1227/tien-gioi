// Đối chiếu công thức "né kịp" `bossEscapePx` (shared, luật `bossViolations`, #919) với vùng trúng THẬT của máy chủ (`bossInZone`, nới `reach` = `PLAYER_RADIUS - BOSS_HIT_GRACE_PX`) cho mọi hình có sát thương (#935).
// Vì sao: luật né kịp chỉ đúng khi công thức KHÔNG thấp hơn quãng thoát thật; bài kiểm cũ ở `shared/src/bosses.test.ts` đo trên vùng do test tự dựng (reach = 0). Ở đây đo trên vùng do máy chủ dùng, rồi neo cách DỰNG vùng
// (`zoneOf` bên dưới sao y `resolveCast`) vào bộ thực thi thật bằng các đòn đánh thử (`strikes`): ai sửa một bên mà không sửa bên kia thì một trong hai nhóm ca đỏ.
// Cách đo: dựng lưới điểm (<= 1,5 px) quanh vùng, ô nào bị trúng thì tính quãng NGẮN NHẤT tới một ô KHÔNG bị trúng (biến đổi khoảng cách Euclid O(N)), lấy ô xấu nhất = quãng thoát thật của người đứng yên ở chỗ xấu nhất.
import { describe, expect, it } from "vitest";
import {
  BOSS_HIT_GRACE_PX,
  BOSS_MIN_CAST_GAP_MS,
  DEFAULT_MAP,
  MONSTER_BY_ID,
  PLAYER_RADIUS,
  bossEscapePx,
  type BossAbility,
  type BossDef,
  type BossShape,
  type GameMap,
} from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { bossInZone } from "./boss";
import { newBossCtrl, type BossZone } from "./boss-state";
import { tickMonsters } from "./monsters";

const REACH = PLAYER_RADIUS - BOSS_HIT_GRACE_PX;
/** Dung sai (px) công thức so với đo: không được THẤP hơn thật quá `LOWER`, không được cao hơn quá `UPPER`. Trên 260 ca không quá tay, chênh (công thức - đo) nằm trong [-1,73; +1,17]; cận trên 2,5 (chứ không phải 6 như #935 nêu) để bắt cả việc `bossInZone` bỏ mức nới `reach` 3 px. */
const LOWER = 2;
const UPPER = 2.5;
const DEG = Math.PI / 180;

// ---------- Vùng trúng THẬT theo hình (sao y `resolveCast`, boss ở gốc, hướng +x) ----------

/** Người ở (x, y) có bị đòn của `shape` trúng không (tính từ gốc, hướng +x), theo đúng các bước của `resolveCast`. */
function hits(shape: BossShape): (x: number, y: number) => boolean {
  const zone = (z: BossZone) => (x: number, y: number) => bossInZone(z, x, y);
  switch (shape.t) {
    case "circleAt":
    case "pool":
    case "rain":
      return zone({ t: "circle", x: 0, y: 0, r: shape.r, r0: 0 });
    case "blink":
      return zone({ t: "circle", x: 0, y: 0, r: shape.landR, r0: 0 });
    case "ring":
      return zone({ t: "circle", x: 0, y: 0, r: shape.r, r0: shape.r0 });
    case "cone":
      return zone({ t: "cone", x: 0, y: 0, r: shape.r, angle: 0, arc: shape.arc });
    case "line":
    case "charge":
      // `charge` lao hết `len` ở bãi trống rồi đánh đoạn (gốc -> chỗ trùm dừng): cùng một đoạn với `line`
      return zone({ t: "seg", x0: 0, y0: 0, x1: shape.len, y1: 0, w: shape.w });
    case "pull": {
      const blast = zone({ t: "circle", x: 0, y: 0, r: shape.blastR, r0: 0 });
      return (x, y) => {
        const d = Math.hypot(x, y);
        if (d > shape.r + REACH || d <= 0) return blast(x, y); // ngoài tầm kéo (hoặc ngay tâm): đứng nguyên
        const k = (d - Math.min(shape.pullPx, d)) / d; // kéo về tâm tối đa `pullPx`
        return blast(x * k, y * k);
      };
    }
    default:
      throw new Error(`hình không sát thương: ${shape.t}`);
  }
}

/** Hộp bao (px, nửa cạnh theo từng trục) của vùng trúng: x từ `x0` tới `x1`, y từ `-hy` tới `hy`. */
function boxOf(shape: BossShape): { x0: number; x1: number; hy: number } {
  const pad = 24;
  switch (shape.t) {
    case "circleAt":
    case "pool":
    case "rain":
      return { x0: -shape.r - pad, x1: shape.r + pad, hy: shape.r + pad };
    case "blink":
      return { x0: -shape.landR - pad, x1: shape.landR + pad, hy: shape.landR + pad };
    case "ring":
    case "cone":
      return { x0: -shape.r - pad, x1: shape.r + pad, hy: shape.r + pad };
    case "line":
    case "charge":
      return { x0: -shape.w - pad, x1: shape.len + shape.w + pad, hy: shape.w + pad };
    case "pull":
      return {
        x0: -Math.max(shape.r, shape.blastR) - pad,
        x1: Math.max(shape.r, shape.blastR) + pad,
        hy: Math.max(shape.r, shape.blastR) + pad,
      };
    default:
      throw new Error("hình không sát thương");
  }
}

// ---------- Biến đổi khoảng cách Euclid (Felzenszwalb), bình phương, theo ô ----------

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

/** Quãng thoát XẤU NHẤT (px) của vùng `hit` trong hộp `box`: ô cách ô an toàn gần nhất xa nhất. `cell` = cạnh ô (px). */
function worstEscape(
  hit: (x: number, y: number) => boolean,
  box: { x0: number; x1: number; hy: number },
  cell: number,
): number {
  const nx = Math.ceil((box.x1 - box.x0) / cell);
  const ny = Math.ceil((2 * box.hy) / cell);
  const g = new Float64Array(nx * ny);
  const isHit = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = box.x0 + (i + 0.5) * cell;
      const y = -box.hy + (j + 0.5) * cell;
      const h = hit(x, y);
      isHit[j * nx + i] = h ? 1 : 0;
      g[j * nx + i] = h ? INF : 0;
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
  let worst = 0;
  for (let k = 0; k < nx * ny; k++) if (isHit[k] && g[k]! > worst) worst = g[k]!;
  return Math.sqrt(worst) * cell;
}

const cellOf = (b: { x0: number; x1: number; hy: number }) =>
  Math.max(1, Math.max(b.x1 - b.x0, 2 * b.hy) / 380);

/** Đo quãng thoát thật của `shape` (px). */
const measure = (shape: BossShape) => worstEscape(hits(shape), boxOf(shape), cellOf(boxOf(shape)));

// ---------- Bộ tham số (>= 8 mỗi hình, có biên) ----------

const circles = [20, 40, 60, 80, 100, 150, 200, 250];
const lines: [number, number][] = [
  [400, 80],
  [300, 100],
  [100, 300], // `len` < `w`
  [50, 50],
  [600, 20],
  [320, 80],
  [200, 160],
  [10, 200],
];
const pulls: [number, number, number][] = [
  [200, 60, 80],
  [100, 60, 80],
  [100, 5, 120], // `blastR` > `r`
  [300, 100, 120],
  [150, 200, 60], // `pullPx` > `r`
  [120, 40, 100],
  [80, 10, 200],
  [250, 120, 60],
];
const arcsDeg = [30, 60, 90, 120, 180, 270, 271, 300, 330, 350, 359]; // quá 270 độ: công thức coi như cả vòng (#953)

/** Hình có sát thương mẫu cho từng tên (để đột biến / báo lỗi nói rõ hình nào). */
const cases: { label: string; shape: BossShape; conservative?: boolean }[] = [];
for (const r of circles) {
  cases.push({ label: `circleAt r${r}`, shape: { t: "circleAt", at: "target", r } });
  cases.push({ label: `pool r${r}`, shape: { t: "pool", r, ttlMs: 4000, tickMs: 500 } });
  cases.push({ label: `blink landR${r}`, shape: { t: "blink", landR: r } });
  cases.push({ label: `rain r${r}`, shape: { t: "rain", r, count: 3, spreadPx: 200, gapMs: 400 } });
}
for (const [r0, r] of [
  [60, 160],
  [30, 100],
  [100, 200],
  [150, 260],
  [14, 120], // lỗ vừa đủ chứa thân người (r0 - reach = PLAYER_RADIUS)
  [200, 240],
  [0, 160], // vòng đặc
]) {
  cases.push({ label: `ring ${r0}-${r}`, shape: { t: "ring", r0: r0!, r: r! } });
}
// lỗ nhỏ hơn thân người: công thức coi như vòng đặc (cố ý quá tay, chỉ kiểm cận dưới)
for (const r0 of [1, 5, 10, 13])
  cases.push({
    label: `ring hố nhỏ ${r0}-160`,
    shape: { t: "ring", r0, r: 160 },
    conservative: true,
  });
for (const arcDeg of arcsDeg)
  cases.push({
    label: `cone r150 ${arcDeg}°`,
    shape: { t: "cone", r: 150, arc: arcDeg * DEG },
    conservative: arcDeg > 270, // quá 270 độ công thức tính như cả vòng (cận trên): chỉ kiểm cận dưới
  });
cases.push({ label: "cone r80 90°", shape: { t: "cone", r: 80, arc: 90 * DEG } });
cases.push({ label: "cone r250 60°", shape: { t: "cone", r: 250, arc: 60 * DEG } });
cases.push({ label: "cone r150 360°", shape: { t: "cone", r: 150, arc: 2 * Math.PI } });
for (const [len, w] of lines) {
  cases.push({ label: `line ${len}x${w}`, shape: { t: "line", len, w } });
  cases.push({ label: `charge ${len}x${w}`, shape: { t: "charge", len, w } });
}
for (const [r, pullPx, blastR] of pulls)
  cases.push({
    label: `pull r${r} kéo${pullPx} nổ${blastR}`,
    shape: { t: "pull", r, pullPx, blastR },
  });

// Quét ngẫu nhiên có seed (tìm lỗ hổng ngoài các bộ tham số chọn tay): mỗi loại hình 40 bộ tham số trong khoảng dữ liệu thật có thể đặt.
{
  let seed = 20261117;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const between = (a: number, b: number) => a + rnd() * (b - a);
  for (let i = 0; i < 40; i++) {
    const r = Math.round(between(30, 260));
    cases.push({
      label: `ngẫu nhiên #${i} circleAt r${r}`,
      shape: { t: "circleAt", at: "target", r },
    });
    const r0 = Math.round(between(0, r - 10));
    cases.push({
      label: `ngẫu nhiên #${i} ring ${r0}-${r}`,
      shape: { t: "ring", r0, r },
      conservative: r0 < PLAYER_RADIUS + REACH,
    });
    const arc = Math.round(between(20, 359)) * DEG;
    cases.push({
      label: `ngẫu nhiên #${i} cone r${r} ${Math.round(arc / DEG)}°`,
      shape: { t: "cone", r, arc },
      conservative: arc > 1.5 * Math.PI + 1e-9,
    });
    const len = Math.round(between(10, 500));
    const w = Math.round(between(10, 260));
    cases.push({ label: `ngẫu nhiên #${i} line ${len}x${w}`, shape: { t: "line", len, w } });
    const pullPx = Math.round(between(1, 220)); // `pullPx` > 0 theo `shapeProblems`
    const blastR = Math.round(between(30, 220));
    cases.push({
      label: `ngẫu nhiên #${i} pull r${r} kéo${pullPx} nổ${blastR}`,
      shape: { t: "pull", r, pullPx, blastR },
    });
  }
}

describe("bossEscapePx so với vùng trúng THẬT (bossInZone, có reach) cho mọi hình (#935)", () => {
  it("hằng số: reach = PLAYER_RADIUS - BOSS_HIT_GRACE_PX = 3 px (nếu đổi, các số trong doc THIET_KE_TRUM đổi theo)", () => {
    expect(REACH).toBe(3);
  });

  it("phép đo tự kiểm: vòng tròn r thì quãng thoát thật = r + reach (sai số <= 1,5 px)", () => {
    for (const r of [30, 100, 200]) {
      const m = measure({ t: "circleAt", at: "target", r });
      expect(Math.abs(m - (r + REACH)), `r ${r}: đo ${m}`).toBeLessThanOrEqual(1.5);
    }
  });

  for (const c of cases) {
    it(`${c.label}: công thức trong [đo - 2, đo + 2,5]${c.conservative ? " (cố ý quá tay: chỉ cận dưới)" : ""}`, () => {
      const f = bossEscapePx(c.shape);
      expect(f, "công thức trả null cho hình hợp lệ").not.toBeNull();
      const m = measure(c.shape);
      expect(
        f!,
        `${c.label}: công thức ${f!.toFixed(1)} px, đo ${m.toFixed(1)} px`,
      ).toBeGreaterThanOrEqual(m - LOWER);
      if (!c.conservative)
        expect(
          f!,
          `${c.label}: công thức ${f!.toFixed(1)} px, đo ${m.toFixed(1)} px`,
        ).toBeLessThanOrEqual(m + UPPER);
    });
  }
});

// ---------- Neo cách dựng vùng vào bộ thực thi THẬT ----------

const TICK_MS = 50;
const MANG = { ...MONSTER_BY_ID.mang, speed: 0, attackRange: 0, aggro: 800 };

function openArena(): GameMap {
  const m = Object.create(DEFAULT_MAP) as GameMap;
  m.circleBlocked = () => false;
  return m;
}

function bossDefOf(shape: BossShape): BossDef {
  const a: BossAbility = {
    id: "thu",
    name: "thu",
    shape,
    telegraphMs: 900,
    recoverMs: 600,
    cooldownMs: 5000,
    weight: 1,
    dmgMult: 1,
  };
  return {
    kind: "mang",
    abilities: [a],
    maxAdds: 2,
    phases: [
      {
        id: "p0",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: BOSS_MIN_CAST_GAP_MS,
        abilities: ["thu"],
      },
    ],
  };
}

/** Cho trùm vận `shape` (khoá hướng +x vì người chơi đứng bên phải) rồi, TRONG lúc gồng, dời người tới (px, py) quanh trùm; trả `true` nếu bị trúng khi đáp. */
function strikes(shape: BossShape, px: number, py: number): boolean {
  const h = makeWorld(openArena());
  const { w } = h;
  w.now = 10_000;
  w.bossMoves = true;
  const spot = { x: 2300, y: 2300 }; // cách xa trấn: không có khu an toàn quanh (như boss.test.ts)
  const mon = addMonster(w, "mang", spot.x, spot.y);
  mon.mc.def = MANG;
  mon.mc.boss = newBossCtrl(bossDefOf(shape), 1);
  const { p } = addPlayer(w, "a", 4, 0);
  p.x = spot.x + 200;
  p.y = spot.y;
  p.hp = p.maxHp = 1_000_000_000;
  const hp0 = p.hp;
  const tick = () => {
    w.now += TICK_MS;
    tickMonsters(w, TICK_MS / 1000);
  };
  let guard = 0;
  while (!h.fx.some((f) => f.kind === "warn") && guard++ < 200) tick();
  if (!h.fx.some((f) => f.kind === "warn")) throw new Error("trùm không vận chiêu");
  const t0 = w.now;
  p.x = spot.x + px;
  p.y = spot.y + py;
  while (w.now < t0 + 900 + 4 * TICK_MS) tick(); // báo trước 900 ms của `bossDefOf`
  return p.hp < hp0;
}

/**
 * Điểm thử quanh trùm, rải ngẫu nhiên có seed nhưng CHỈ lấy điểm SÁT MÉP vùng (trong 12-20 px quanh nó có điểm khác kết quả) mà vẫn "chắc chắn" (8 láng giềng cách 3 px cùng kết quả,
 * tránh sai số sát mép): đổi kích thước / góc / lỗ của vùng ở bộ thực thi dù ít đều làm một điểm lật kết quả. Điểm ở sâu trong hay xa vùng thì hiển nhiên, không đáng thử.
 */
function probes(shape: BossShape, want: number): { x: number; y: number; hit: boolean }[] {
  const f = hits(shape);
  const b = boxOf(shape);
  let s = 12345;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const inside: { x: number; y: number; hit: boolean }[] = [];
  const outside: { x: number; y: number; hit: boolean }[] = [];
  const ring = (x: number, y: number, rad: number, n: number, pred: (v: boolean) => boolean) => {
    for (let k = 0; k < n; k++) {
      const a = (k * 2 * Math.PI) / n;
      if (pred(f(x + Math.cos(a) * rad, y + Math.sin(a) * rad))) return true;
    }
    return false;
  };
  for (let n = 0; n < 60000 && (inside.length < want || outside.length < want); n++) {
    const x = b.x0 + rnd() * (b.x1 - b.x0);
    const y = (rnd() * 2 - 1) * b.hy;
    const h = f(x, y);
    if (ring(x, y, 3, 8, (v) => v !== h)) continue; // sát mép quá: bỏ
    if (!ring(x, y, 12, 16, (v) => v !== h) && !ring(x, y, 20, 16, (v) => v !== h)) continue; // không sát mép: bỏ
    (h ? inside : outside).push({ x, y, hit: h });
  }
  return [...inside.slice(0, want), ...outside.slice(0, want)];
}

describe("vùng dựng trong test khớp bộ thực thi THẬT (đòn đánh thử qua `tickMonsters`)", () => {
  const anchors: { label: string; shape: BossShape }[] = [
    { label: "circleAt tại chỗ trùm", shape: { t: "circleAt", at: "self", r: 90 } },
    { label: "ring 60-160", shape: { t: "ring", r0: 60, r: 160 } },
    { label: "cone r150 120°", shape: { t: "cone", r: 150, arc: 120 * DEG } },
    { label: "cone r150 270°", shape: { t: "cone", r: 150, arc: 270 * DEG } },
    { label: "line 400x80", shape: { t: "line", len: 400, w: 80 } },
    { label: "charge 320x80", shape: { t: "charge", len: 320, w: 80 } },
    { label: "pull r200 kéo60 nổ80", shape: { t: "pull", r: 200, pullPx: 60, blastR: 80 } },
    {
      label: "pull r100 kéo5 nổ120 (nổ > tầm kéo)",
      shape: { t: "pull", r: 100, pullPx: 5, blastR: 120 },
    },
  ];
  for (const a of anchors) {
    it(`${a.label}: 8 điểm trong + 8 điểm ngoài vùng: bộ thực thi trúng / không đúng như \`hits\``, () => {
      const pts = probes(a.shape, 8);
      expect(pts.filter((q) => q.hit)).toHaveLength(8); // đủ điểm trong và ngoài (ca không rỗng)
      expect(pts.filter((q) => !q.hit)).toHaveLength(8);
      for (const pt of pts) {
        expect(
          strikes(a.shape, pt.x, pt.y),
          `${a.label} tại (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`,
        ).toBe(pt.hit);
      }
    });
  }
});
