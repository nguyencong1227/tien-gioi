// Cân bằng PK thách đấu (M3 bước 5c, docs/THIET_KE_PK.md mục 6, issue #217).
// `duelOnce` dựng một `World` thật, cho hai người nhận / thách qua chính `duelChallenge` / `duelAnswer`, rồi để cả hai đánh thường
// (`slash`) liên tục mỗi lần hồi chiêu cho tới khi trận kết thúc: sát thương, bạo kích, đếm ngược, `tickDuels` đều là mã server
// thật. Ca "liên tục": đứng cạnh nhau, không né, không đan, không đả tọa (trong trận bị khoá). Người chơi thật không đánh 100% thời
// gian nên trận thật dài hơn. `Math.random` có hạt giống (ghi đè trong lúc chạy, trả lại sau) để kết quả cố định, như bench.
import { DEFAULT_MAP, REALMS, TICK_MS, stepOf } from "@tien-gioi/shared";
import { Hub } from "../hub";
import { slash } from "../systems/combat";
import { duelAnswer, duelChallenge, tickDuels } from "../systems/duel";
import { setEquipment } from "../systems/equipment";
import { applyStats } from "../systems/progression";
import { addPlayer, makeWorld } from "../systems/test-helpers";
import { bestGear } from "./simulate";

export interface Level {
  realm: number;
  tier: number;
}

export interface DuelOutcome {
  /** Giây đánh thật (không tính đếm ngược) tới khi kết thúc; 0 nếu trận không bắt đầu */
  seconds: number;
  /** Kết quả của người thứ nhất (`a`) */
  result: "won" | "lost" | "draw" | "none";
}

function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Giới hạn mô phỏng (giây): dài hơn `DUEL_MAX_MS` để thấy cả trận không ai thắng nổi (hết giờ = hoà). */
const MAX_SIM_SECONDS = 400;

/** Một trận giữa hai người ở bậc `a` và `b` (trang bị tốt nhất đủ bậc), hạt giống `seed`. */
export function duelOnce(a: Level, b: Level, seed = 1): DuelOutcome {
  const saved = Math.random;
  Math.random = seeded(seed);
  try {
    const { w, duelEnds } = makeWorld(DEFAULT_MAP, new Hub());
    const pa = addPlayer(w, "Aa", a.realm, a.tier);
    const pb = addPlayer(w, "Bb", b.realm, b.tier);
    for (const [r, l] of [
      [pa, a],
      [pb, b],
    ] as const) {
      setEquipment(r.p, bestGear(l.realm, l.tier));
      applyStats(r.p, true);
    }
    pb.p.x = pa.p.x + 45; // trong tầm chém
    w.now = 1_000_000;
    duelChallenge(w, "Aa", { name: "Bb" });
    duelAnswer(w, "Bb", { from: "Aa" }, true);
    const dt = TICK_MS / 1000;
    let t = 0;
    let started = -1;
    while (t < MAX_SIM_SECONDS && w.duels.of("Aa")) {
      w.now += TICK_MS;
      t += dt;
      w.tick++;
      tickDuels(w);
      const d = w.duels.of("Aa");
      if (!d) break;
      if (d.phase === "fight") {
        if (started < 0) started = t;
        slash(w, "Aa", 0);
        slash(w, "Bb", Math.PI);
      }
    }
    const end = duelEnds.find((e) => e.sid === "Aa")?.msg;
    return { seconds: started < 0 ? 0 : t - started, result: end?.result ?? "none" };
  } finally {
    Math.random = saved;
  }
}

export interface DuelSummary {
  a: Level;
  b: Level;
  runs: number;
  /** Giây đánh trung vị / nhỏ nhất / lớn nhất */
  median: number;
  min: number;
  max: number;
  /** Tỉ lệ người thứ nhất thắng (0..1) */
  winRate: number;
}

/** Tổng hợp `runs` trận (hạt giống 1..runs). */
export function summarizeDuels(a: Level, b: Level, runs = 20): DuelSummary {
  const secs: number[] = [];
  let wins = 0;
  for (let i = 1; i <= runs; i++) {
    const o = duelOnce(a, b, i);
    secs.push(o.seconds);
    if (o.result === "won") wins++;
  }
  secs.sort((x, y) => x - y);
  return {
    a,
    b,
    runs,
    median: secs[Math.floor(runs / 2)],
    min: secs[0],
    max: secs[runs - 1],
    winRate: wins / runs,
  };
}

/** Bậc đại diện: mỗi cảnh giới lấy tầng đầu, giữa, cuối (Phàm Nhân chỉ một tầng). */
export function representativeLevels(): (Level & { label: string; step: number })[] {
  const out: (Level & { label: string; step: number })[] = [];
  for (let realm = 0; realm < REALMS.length; realm++) {
    const n = REALMS[realm].tiers.length;
    const tiers = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
    for (const tier of tiers)
      out.push({
        realm,
        tier,
        label: `${REALMS[realm].name} tầng ${tier + 1}`,
        step: stepOf(realm, tier),
      });
  }
  return out;
}

/** Mục tiêu thiết kế: trận liên tục giữa hai người cùng bậc kéo dài chừng này (giây). */
export const PK_TARGET_SECONDS = { min: 25, max: 45 } as const;
