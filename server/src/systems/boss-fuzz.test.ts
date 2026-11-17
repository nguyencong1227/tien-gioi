// Fuzz ĐỘNG luật "né kịp" của trùm nhiều chiêu (mục 42, #934): bằng chứng độc lập với công thức tĩnh `bossEscapePx` của #919.
// Dựng nhiều bộ chiêu NGẪU NHIÊN hợp lệ (sinh rồi LỌC bằng chính `bossViolations`), cho một bot né HOÀN HẢO chạy trên bộ thực thi THẬT (`tickMonsters`):
// mỗi lần thấy `warn` bot được đặt ở chỗ XẤU NHẤT của vùng (đo bằng đúng `bossInZone` của máy chủ trên lưới điểm, không chép công thức), đợi `BOSS_REACT_MS`
// rồi chạy thẳng ra chỗ an toàn gần nhất ở `BOSS_ESCAPE_SPEED` (mỗi tick một bước); khẳng định khí huyết KHÔNG BAO GIỜ giảm. Đối chứng: cùng bộ chiêu, bot đứng yên
// ở chỗ xấu nhất phải bị trúng (chứng minh bài kiểm có răng). Lỗi in `seed` + bộ chiêu để tái hiện.
// Phạm vi (ghi rõ để không đọc quá): một người chơi một trùm, bãi trống không tường, không quái con, không làm chậm; mưa có `gapMs` >= báo trước (các vòng nối tiếp, không
// chồng thời gian); vũng là vùng cấm tới hết `ttlMs` đối với các lần đặt bot sau đó. Hai vùng chồng nhau cùng lúc (mưa gấp) chưa được kiểm ở đây.
import { describe, expect, it } from "vitest";
import {
  BOSS_ESCAPE_SPEED,
  BOSS_MIN_CAST_GAP_MS,
  BOSS_MIN_TELEGRAPH_MS,
  BOSS_REACT_MS,
  bossEscapeMs,
  bossEscapePx,
  bossViolations,
  type BossAbility,
  type BossDef,
  type BossShape,
} from "@tien-gioi/shared";
import { FAIR_REFLEX_MS, FAIR_SPEED, runDodgeBot } from "./boss-dodge-bot";

const DEG = Math.PI / 180;

// ---------- Bộ ngẫu nhiên có seed ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rnd = () => number;
const between = (r: Rnd, a: number, b: number) => a + r() * (b - a);
const int = (r: Rnd, a: number, b: number) => Math.round(between(r, a, b));

// ---------- Bộ sinh bộ chiêu ngẫu nhiên ----------

const SHAPES = [
  "circleAt",
  "ring",
  "cone",
  "line",
  "charge",
  "rain",
  "pull",
  "pool",
  "blink",
] as const;

function randomShape(r: Rnd, kind: (typeof SHAPES)[number], telegraphMs: number): BossShape {
  switch (kind) {
    case "circleAt":
      return {
        t: "circleAt",
        at: (["target", "self", "farthest"] as const)[int(r, 0, 2)]!,
        r: int(r, 30, 220),
      };
    case "ring": {
      const rr = int(r, 60, 260);
      return { t: "ring", r0: r() < 0.2 ? 0 : int(r, 14, rr - 20), r: rr };
    }
    case "cone":
      return { t: "cone", r: int(r, 80, 280), arc: between(r, 30, 359) * DEG };
    case "line":
      return { t: "line", len: int(r, 100, 500), w: int(r, 30, 200) };
    case "charge":
      return { t: "charge", len: int(r, 100, 400), w: int(r, 30, 160) };
    case "rain":
      return {
        t: "rain",
        r: int(r, 40, 140),
        count: int(r, 2, 4),
        spreadPx: int(r, 60, 260),
        gapMs: telegraphMs + int(r, 0, 400), // các vòng nối tiếp, không chồng thời gian
      };
    case "pull":
      return { t: "pull", r: int(r, 80, 260), pullPx: int(r, 20, 150), blastR: int(r, 40, 150) };
    case "pool":
      return {
        t: "pool",
        r: int(r, 40, 140),
        ttlMs: int(r, 2000, 5000),
        tickMs: int(r, 400, 1000),
      };
    case "blink":
      return { t: "blink", landR: int(r, 40, 150) };
  }
}

function randomDef(r: Rnd): BossDef {
  const n = int(r, 1, 3);
  const abilities: BossAbility[] = [];
  for (let i = 0; i < n; i++) {
    let telegraphMs = int(r, 800, 2200);
    const kind = SHAPES[int(r, 0, SHAPES.length - 1)]!;
    let shape = randomShape(r, kind, telegraphMs);
    // Một nửa số chiêu được đặt SÁT BIÊN luật (báo trước chỉ hơn mức tối thiểu của `bossEscapeMs` 0-40 ms): ngẫu nhiên đều gần như không bao giờ chạm biên, mà biên mới là
    // nơi công thức sai (quãng thoát hụt vài px) sẽ làm bot trúng đòn.
    const px = bossEscapePx(shape);
    if (px !== null && r() < 0.5) {
      telegraphMs = Math.max(BOSS_MIN_TELEGRAPH_MS, Math.ceil(bossEscapeMs(px)) + int(r, 0, 40));
      if (shape.t === "rain") shape = { ...shape, gapMs: telegraphMs + int(r, 0, 400) };
    }
    const recoverMs = int(r, 300, 1200);
    abilities.push({
      id: `c${i}`,
      name: `c${i}`,
      shape,
      telegraphMs,
      recoverMs,
      cooldownMs: telegraphMs + recoverMs + int(r, 0, 4000),
      weight: int(r, 1, 5),
      dmgMult: 1,
    });
  }
  return {
    kind: "mang",
    abilities,
    maxAdds: 0,
    phases: [
      {
        id: "p0",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: BOSS_MIN_CAST_GAP_MS + int(r, 0, 800),
        abilities: abilities.map((a) => a.id),
      },
    ],
  };
}

/** Sinh `want` bộ chiêu HỢP LỆ theo seed; trả luôn số lần thử và số hình bị luật né kịp / báo trước loại (để thấy luật có tác dụng). */
function validDefs(seed: number, want: number) {
  const r = rng(seed);
  const defs: { seed: number; def: BossDef }[] = [];
  let tries = 0;
  let rejected = 0;
  while (defs.length < want) {
    tries++;
    const s = int(r, 1, 1e9);
    const def = randomDef(rng(s));
    if (bossViolations([def]).length > 0) {
      rejected++;
      continue;
    }
    defs.push({ seed: s, def });
  }
  return { defs, tries, rejected };
}

// ---------- Kiểm ----------

const N_DEFS = 200;
const SIM_MS = 20_000;
const SEED = 20261117;

describe("fuzz động luật né kịp: bot né hoàn hảo chạy trên bộ thực thi thật (#934)", () => {
  const gen = validDefs(SEED, N_DEFS);

  it("bộ sinh: luật `bossViolations` có tác dụng (loại một phần đáng kể hình ngẫu nhiên) và đủ bộ hợp lệ", () => {
    expect(gen.defs).toHaveLength(N_DEFS);
    // ghi tỉ lệ để thấy luật cắn: chỉ cần > 10% để chứng minh bộ sinh không toàn hình hiển nhiên hợp lệ
    expect(gen.rejected / gen.tries, `loại ${gen.rejected} / ${gen.tries}`).toBeGreaterThan(0.1);
  });

  it("luật không lỏng hơn lời hứa: BOSS_REACT_MS >= phản xạ của bot, BOSS_ESCAPE_SPEED <= tốc độ của bot", () => {
    expect(BOSS_REACT_MS).toBeGreaterThanOrEqual(FAIR_REFLEX_MS);
    expect(BOSS_ESCAPE_SPEED).toBeLessThanOrEqual(FAIR_SPEED);
  });

  it(`bot né hoàn hảo (phản xạ ${FAIR_REFLEX_MS} ms, ${FAIR_SPEED} px/giây) KHÔNG BAO GIỜ trúng: ${N_DEFS} bộ chiêu x ${SIM_MS / 1000} giây`, () => {
    let casts = 0;
    const fails: string[] = [];
    for (const { seed, def } of gen.defs) {
      const r = runDodgeBot(seed, def, "dodge", SIM_MS);
      casts += r.casts;
      if (r.hurt.length > 0)
        fails.push(
          `seed ${seed}: bot né bị trúng ${r.hurt.length} lần, đầu tiên ở ${r.hurt[0]!.ability} lúc +${r.hurt[0]!.at - 10_000} ms; bộ chiêu ${JSON.stringify(def.abilities.map((a) => ({ id: a.id, shape: a.shape, telegraphMs: a.telegraphMs })))}`,
        );
    }
    expect(casts, "số đòn đã kiểm quá ít để có nghĩa").toBeGreaterThan(N_DEFS * 3);
    expect(fails.slice(0, 5), `${fails.length} / ${N_DEFS} bộ bị trúng`).toEqual([]);
  });

  it("đối chứng: cùng các bộ chiêu, bot ĐỨNG YÊN ở chỗ xấu nhất bị trúng ở >= 90% số đòn", () => {
    let casts = 0;
    let hits = 0;
    for (const { seed, def } of gen.defs.slice(0, 60)) {
      const r = runDodgeBot(seed, def, "stand", 12_000);
      casts += r.casts;
      hits += r.hitCasts;
    }
    expect(casts).toBeGreaterThan(100);
    expect(hits / casts, `trúng ${hits} / ${casts} đòn`).toBeGreaterThanOrEqual(0.9);
  });
});
