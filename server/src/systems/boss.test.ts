// Bộ thực thi trùm nhiều chiêu (mục 42, T2 #871, docs/THIET_KE_TRUM.md): báo trước >= 800 ms, đáp đòn theo vị trí LÚC ĐÁP, một chiêu một lúc, giai đoạn, quái con, cuồng nộ, reset, bộ lọc mục tiêu.
// Dữ liệu chiêu của test do test TỰ DỰNG (kiểm bộ thực thi, không kiểm cân bằng); loài quái là Xích Mãng thật (`boss: true`) với `speed: 0` để trùm đứng yên, đo được hình học.
import { describe, expect, it, vi } from "vitest";
import {
  BOSS_FIRST_CAST_DELAY_MS,
  BOSS_HIT_GRACE_PX,
  BOSS_MIN_CAST_GAP_MS,
  BOSS_MIN_TELEGRAPH_MS,
  BOSS_PHASE_ROAR_MS,
  DEFAULT_MAP,
  MONSTER_BY_ID,
  PLAYER_RADIUS,
  bossViolations,
  type BossAbility,
  type BossDef,
  type BossPhase,
  type BossShape,
  type FxMsg,
  type GameMap,
} from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { bossCanTarget, bossInZone } from "./boss";
import { newBossCtrl, bossLiveAdds } from "./boss-state";
import { dealMonsterDamage, killMonster } from "./combat";
import { placeMonster, tickMonsters } from "./monsters";
import type { World } from "../world";

const TICK_MS = 50;
// đứng yên, không đánh thường, thấy xa (800 px): chỉ còn chiêu của bộ thực thi gây sát thương, hình học đo được
const MANG = { ...MONSTER_BY_ID.mang, speed: 0, attackRange: 0, aggro: 800 };
const BOSS_ATK = MANG.atk;

type Warn = Extract<FxMsg, { kind: "warn" }>;

/** Chiêu mẫu: báo trước 900 ms, hồi 600 ms, nghỉ giữa 600 ms; đè `over` theo nhu cầu từng ca. */
function ab(id: string, shape: BossShape, over: Partial<BossAbility> = {}): BossAbility {
  return {
    id,
    name: id,
    shape,
    telegraphMs: 900,
    recoverMs: 600,
    cooldownMs: 5000,
    weight: 1,
    dmgMult: 1,
    ...over,
  };
}

function phase(abilities: string[], over: Partial<BossPhase> = {}): BossPhase {
  return {
    id: "p0",
    fromHp: 1,
    speedMult: 1,
    atkMult: 1,
    cdMult: 1,
    castGapMs: BOSS_MIN_CAST_GAP_MS,
    abilities,
    ...over,
  };
}

/** Bộ chiêu một giai đoạn từ các chiêu `abs`. */
function def(abs: BossAbility[], over: Partial<BossDef> = {}): BossDef {
  return {
    kind: "mang",
    abilities: abs,
    phases: [phase(abs.map((a) => a.id))],
    maxAdds: 2,
    ...over,
  };
}

/** Bãi đấu TRỐNG: bản đồ thật nhưng không có ô chặn (hình học của chiêu đo được, không phụ thuộc cây đá); khu an toàn vẫn như thật. */
function openArena(): GameMap {
  const m = Object.create(DEFAULT_MAP) as GameMap;
  m.circleBlocked = () => false;
  return m;
}

/** Tâm bãi đấu: cách xa trấn, quanh nó (+-450 px) không có khu an toàn. */
function openSpot(w: World): { x: number; y: number } {
  const spot = { x: 2300, y: 2300 };
  for (const dx of [-450, 0, 450])
    for (const dy of [-450, 0, 450])
      if (w.map.inSafe(spot.x + dx, spot.y + dy, 40)) throw new Error("bãi đấu dính khu an toàn");
  return spot;
}

/** Cảnh: trùm đứng ở tâm chỗ thoáng, người chơi `gap` px bên phải trùm, khí huyết người chơi cực lớn (đo bằng hiệu số). */
function scene(bossDef: BossDef, gap = 200, seed = 1) {
  const h = makeWorld(openArena());
  const { w } = h;
  w.now = 10_000;
  w.bossMoves = true;
  const spot = openSpot(w);
  const mon = addMonster(w, "mang", spot.x, spot.y);
  mon.mc.def = MANG;
  mon.mc.boss = newBossCtrl(bossDef, seed);
  const { p, c } = addPlayer(w, "a", 4, 0);
  p.x = spot.x + gap;
  p.y = spot.y;
  p.hp = p.maxHp = 1_000_000_000;
  const log: { at: number; fx: FxMsg }[] = [];
  let seen = 0;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      w.now += TICK_MS;
      tickMonsters(w, TICK_MS / 1000);
      for (; seen < h.fx.length; seen++) log.push({ at: w.now, fx: h.fx[seen]! });
    }
  };
  const warns = () =>
    log.filter((l) => l.fx.kind === "warn").map((l) => ({ at: l.at, ...(l.fx as Warn) }));
  const until = (cond: () => boolean, max = 400) => {
    for (let i = 0; i < max && !cond(); i++) tick();
    if (!cond()) throw new Error("điều kiện không tới trong thời gian chờ");
  };
  /** Tick tới khi MỘT chiêu bắt đầu (có `bossCast`), trả mốc bắt đầu. */
  const untilCast = () => {
    until(() => log.some((l) => l.fx.kind === "bossCast"));
    return log.find((l) => l.fx.kind === "bossCast")!.at;
  };
  return { h, w, mon, p, c, tick, warns, log, until, untilCast, spot };
}

describe("dữ liệu của test hợp lệ", () => {
  it("bộ chiêu dựng cho test qua `bossViolations` (không có lỗi)", () => {
    const d = def([ab("a", { t: "circleAt", at: "target", r: 60 })]);
    expect(bossViolations([d])).toEqual([]);
  });
});

describe("báo trước và đáp đòn", () => {
  it("lần vận đầu sau khi gây hấn >= 1,2 giây; `warn` gửi ĐÚNG MỘT lần, vùng khoá ở chỗ mục tiêu, ms = telegraphMs; tên chiêu qua `bossCast`", () => {
    const { w, tick, warns, log, untilCast, p } = scene(
      def([ab("roi", { t: "circleAt", at: "target", r: 60 })]),
    );
    const t0 = w.now;
    const startedAt = untilCast();
    expect(startedAt - t0).toBeGreaterThanOrEqual(BOSS_FIRST_CAST_DELAY_MS);
    tick();
    expect(warns()).toHaveLength(1);
    expect(warns()[0]).toMatchObject({ shape: "circle", x: p.x, y: p.y, r: 60, ms: 900 });
    const cast = log.find((l) => l.fx.kind === "bossCast")!.fx;
    expect(cast).toMatchObject({ kind: "bossCast", ability: "roi", ms: 900 });
    tick(40); // hết một vòng: không gửi thêm warn thứ hai trong lúc vận
    expect(warns().filter((x) => x.at <= startedAt + 900)).toHaveLength(1);
  });

  it("KHÔNG có sát thương trước hạn báo trước; trúng đúng lúc đáp (sát thương = round(atk x dmgMult))", () => {
    const { w, p, tick, untilCast } = scene(
      def([ab("roi", { t: "circleAt", at: "target", r: 60 }, { dmgMult: 1.5 })]),
    );
    const hp0 = p.hp;
    const t = untilCast();
    while (w.now < t + 900 - TICK_MS) {
      tick();
      expect(p.hp).toBe(hp0); // chưa tới hạn: không mất khí huyết
    }
    tick(2);
    expect(hp0 - p.hp).toBe(Math.round(BOSS_ATK * 1.5));
  });

  it("bước ra khỏi vùng đã báo trong lúc gồng thì KHÔNG trúng (tính theo vị trí LÚC ĐÁP)", () => {
    const { p, tick, untilCast, w } = scene(
      def([ab("roi", { t: "circleAt", at: "target", r: 60 })]),
    );
    const hp0 = p.hp;
    const t = untilCast();
    p.x += 120;
    while (w.now < t + 900 + 3 * TICK_MS) tick();
    expect(p.hp).toBe(hp0);
  });

  it("đứng ngoài lúc báo, bước VÀO vùng trước lúc đáp thì trúng", () => {
    const { p, tick, untilCast, w } = scene(
      def([ab("roi", { t: "circleAt", at: "self", r: 260 })]),
      320,
    );
    const hp0 = p.hp;
    const t = untilCast();
    tick();
    p.x -= 100; // vào vòng tròn quanh trùm
    while (w.now < t + 900 + 3 * TICK_MS) tick();
    expect(p.hp).toBeLessThan(hp0);
  });

  it("trúng thật thì gắn trạng thái của chiêu; né thì không gắn", () => {
    const eff = { status: "burn", ms: 3000, ratio: 0.05, chance: 1 } as const;
    const a = scene(def([ab("roi", { t: "circleAt", at: "target", r: 60 }, { effect: eff })]));
    a.until(() => a.p.hp < 1_000_000_000);
    expect(a.c.st?.list.some((s) => s.id === "burn")).toBe(true);
    const b = scene(def([ab("roi", { t: "circleAt", at: "target", r: 60 }, { effect: eff })]));
    const t = b.untilCast();
    b.p.x += 150;
    while (b.w.now < t + 1200) b.tick();
    expect(b.c.st?.list.length ?? 0).toBe(0);
  });
});

describe("hình chiêu (hàm thuần `bossInZone`, nới BOSS_HIT_GRACE_PX về phía người chơi)", () => {
  const reach = PLAYER_RADIUS - BOSS_HIT_GRACE_PX;
  it("vòng tròn: trong bán kính + reach trúng, ngoài thì không", () => {
    const z = { t: "circle", x: 0, y: 0, r: 100, r0: 0 } as const;
    expect(bossInZone(z, 100 + reach, 0)).toBe(true);
    expect(bossInZone(z, 100 + reach + 1, 0)).toBe(false);
  });
  it("vành khuyên: giữa tâm (< r0) là chỗ an toàn", () => {
    const z = { t: "circle", x: 0, y: 0, r: 200, r0: 80 } as const;
    expect(bossInZone(z, 0, 0)).toBe(false);
    expect(bossInZone(z, 60, 0)).toBe(false);
    expect(bossInZone(z, 80 - reach, 0)).toBe(true);
    expect(bossInZone(z, 150, 0)).toBe(true);
    expect(bossInZone(z, 201 + reach, 0)).toBe(false);
  });
  it("nón: trong góc mở và bán kính trúng; ngoài góc / ngoài tầm không; sát chân trùm luôn trong", () => {
    const z = { t: "cone", x: 0, y: 0, r: 150, angle: 0, arc: Math.PI / 2 } as const; // mở ±45 độ về phía +x
    expect(bossInZone(z, 100, 0)).toBe(true);
    expect(bossInZone(z, 100, 90)).toBe(true); // lệch ~42 độ: còn trong nửa góc mở 45 độ
    expect(bossInZone(z, 100, 120)).toBe(false); // ~50 độ: ra ngoài kể cả nới theo bán kính người
    expect(bossInZone(z, 100, 60)).toBe(true); // ~31 độ
    expect(bossInZone(z, -100, 0)).toBe(false); // phía sau
    expect(bossInZone(z, 200, 0)).toBe(false); // ngoài tầm
    expect(bossInZone(z, -2, 1)).toBe(true); // sát chân
  });
  it("đoạn (đường / lao): nửa bề rộng + reach; ngoài đầu mút không trúng", () => {
    const z = { t: "seg", x0: 0, y0: 0, x1: 300, y1: 0, w: 80 } as const;
    expect(bossInZone(z, 150, 40 + reach)).toBe(true);
    expect(bossInZone(z, 150, 40 + reach + 1)).toBe(false);
    expect(bossInZone(z, 300 + 40 + reach, 0)).toBe(true); // đầu mút tròn bán kính nửa bề rộng
    expect(bossInZone(z, 300 + 40 + reach + 1, 0)).toBe(false);
    expect(bossInZone(z, -(40 + reach) - 1, 0)).toBe(false);
  });
});

describe("hình chiêu trong trận thật", () => {
  it("nón khoá hướng lúc bắt đầu: người đi sang ngang ra khỏi nón thì né được; `warn` hình cone đủ góc", () => {
    const { p, tick, untilCast, warns, w } = scene(
      def([ab("quat", { t: "cone", r: 260, arc: Math.PI / 3 })]),
    );
    const hp0 = p.hp;
    const t = untilCast();
    tick();
    expect(warns()[0]).toMatchObject({ shape: "cone", r: 260, arc: Math.PI / 3, angle: 0 });
    p.y += 160; // ra khỏi nón (nón nhọn 60 độ, ở cách 200 px chỉ rộng ~±115)
    while (w.now < t + 900 + 3 * TICK_MS) tick();
    expect(p.hp).toBe(hp0);
  });

  it("đường thẳng: `warn` hình line có bề rộng w; đứng yên trên đường thì trúng", () => {
    const { p, tick, untilCast, warns, until } = scene(
      def([ab("song", { t: "line", len: 500, w: 90 })]),
    );
    untilCast();
    tick();
    expect(warns()[0]).toMatchObject({ shape: "line", r: 500, w: 90 });
    until(() => p.hp < 1_000_000_000);
  });

  it("vành khuyên: gửi r0; đứng sát trùm (giữa vòng) là an toàn, đứng trong vành thì trúng", () => {
    const a = scene(def([ab("no", { t: "ring", r0: 100, r: 300 })]), 40);
    const hp0 = a.p.hp;
    const t = a.untilCast();
    a.tick();
    expect(a.warns()[0]).toMatchObject({ shape: "circle", r: 300, r0: 100 });
    while (a.w.now < t + 900 + 3 * TICK_MS) a.tick();
    expect(a.p.hp).toBe(hp0);
    const b = scene(def([ab("no", { t: "ring", r0: 100, r: 300 })]), 200);
    b.until(() => b.p.hp < 1_000_000_000);
  });

  it("lao: trùm lao theo hướng khoá một quãng <= len, trúng người trên đường lao; vị trí cuối dừng ở ô chặn", () => {
    const { p, mon, spot, tick, untilCast, until } = scene(
      def([ab("lao", { t: "charge", len: 400, w: 80 })]),
    );
    const t = untilCast();
    tick();
    expect(mon.m.x).toBe(spot.x); // gồng: đứng yên
    until(() => p.hp < 1_000_000_000);
    expect(mon.m.x).toBeGreaterThan(spot.x + 100);
    expect(mon.m.x - spot.x).toBeLessThanOrEqual(400 + 1);
    expect(t).toBeGreaterThan(0);
  });

  it("kéo vào: người trong vòng r bị kéo về tâm tối đa pullPx rồi nổ blastR; người ngoài vòng không bị kéo; gửi hai `warn`", () => {
    const { p, mon, spot, tick, untilCast, warns, until } = scene(
      def([ab("xoay", { t: "pull", r: 500, pullPx: 120, blastR: 80 })]),
      300,
    );
    untilCast();
    tick();
    expect(warns().map((x) => x.r)).toEqual([500, 80]);
    const x0 = p.x;
    until(() => p.x !== x0);
    expect(x0 - p.x).toBeGreaterThan(100);
    expect(x0 - p.x).toBeLessThanOrEqual(120 + 1);
    expect(p.px).toBe(Math.round(p.x)); // vị trí công khai đồng bộ ngay
    expect(mon.m.x).toBe(spot.x);
    const far = scene(def([ab("xoay", { t: "pull", r: 500, pullPx: 120, blastR: 80 })]), 700);
    const xf = far.p.x;
    far.untilCast();
    far.tick(40);
    expect(far.p.x).toBe(xf);
  });

  it("kéo vào: người bị kéo vào tâm trong blastR thì bị nổ trúng", () => {
    const { p, until } = scene(
      def([ab("xoay", { t: "pull", r: 500, pullPx: 300, blastR: 80 })]),
      250,
    );
    until(() => p.hp < 1_000_000_000);
  });

  it("vũng: để lại vũng ttlMs, mỗi tickMs gây sát thương người đứng trong; tick đầu sau tickMs, hết hạn thì thôi", () => {
    const { p, w, tick, untilCast, warns } = scene(
      def([ab("doc", { t: "pool", r: 70, ttlMs: 3000, tickMs: 1000 }, { cooldownMs: 60_000 })]),
    );
    const hp0 = p.hp;
    const t = untilCast();
    // chờ tới lúc vũng hiện: vẫn KHÔNG mất máu (tick đầu sau tickMs)
    while (w.now < t + 900 + 900) tick();
    expect(p.hp).toBe(hp0);
    while (w.now < t + 900 + 1100) tick();
    const afterFirst = hp0 - p.hp;
    expect(afterFirst).toBe(BOSS_ATK);
    while (w.now < t + 900 + 2300) tick();
    expect(hp0 - p.hp).toBe(BOSS_ATK * 2); // tick ở +1000 và +2000 ms; tới +3000 ms vũng hết hạn (không tick thứ ba)
    tick(60);
    expect(hp0 - p.hp).toBe(BOSS_ATK * 2);
    // hiện lại vùng khi vũng hiện: warn thứ hai có ms = ttlMs
    expect(warns().some((x) => x.ms === 3000)).toBe(true);
  });

  it("vũng: người rời khỏi vũng thì không mất máu", () => {
    const { p, w, tick, untilCast } = scene(
      def([ab("doc", { t: "pool", r: 70, ttlMs: 3000, tickMs: 500 }, { cooldownMs: 60_000 })]),
    );
    const hp0 = p.hp;
    const t = untilCast();
    p.x += 200;
    while (w.now < t + 5000) tick();
    expect(p.hp).toBe(hp0);
  });

  it("chớp: trùm dịch chuyển tới điểm đáp (đã báo) rồi nổ landR; `warn` ở ĐIỂM ĐÁP chứ không ở chỗ trùm", () => {
    const { p, mon, spot, tick, untilCast, warns, until } = scene(
      def([ab("chop", { t: "blink", landR: 70 })]),
      300,
    );
    untilCast();
    tick();
    expect(warns()[0]).toMatchObject({ shape: "circle", r: 70, x: p.x, y: p.y });
    expect(mon.m.x).toBe(spot.x); // chưa chớp
    until(() => p.hp < 1_000_000_000);
    expect(Math.hypot(mon.m.x - p.x, mon.m.y - p.y)).toBeLessThan(10); // đã tới chỗ đáp
  });

  it("mưa: mỗi vòng có `warn` riêng, vòng nào >= telegraphMs từ lúc hiện tới lúc đáp; vòng đầu rơi đúng chỗ mục tiêu", () => {
    const { p, w, tick, untilCast, warns, log } = scene(
      def([
        ab(
          "mua",
          { t: "rain", r: 60, count: 4, spreadPx: 150, gapMs: 400 },
          { cooldownMs: 60_000 },
        ),
      ]),
    );
    const hp0 = p.hp;
    const t = untilCast();
    tick();
    while (w.now < t + 3 * 400 + 900 + 200) tick();
    const ws = warns();
    expect(ws).toHaveLength(4);
    expect(ws[0]).toMatchObject({ x: p.x, y: p.y });
    for (const x of ws) expect(x.ms).toBe(900);
    // các warn cách nhau gapMs
    expect(ws[1]!.at - ws[0]!.at).toBe(400);
    expect(ws[3]!.at - ws[0]!.at).toBe(1200);
    // người đứng yên tại chỗ vòng đầu: trúng đúng một lần lúc vòng đầu đáp (900 ms sau warn đầu), không trước
    expect(hp0 - p.hp).toBeGreaterThanOrEqual(BOSS_ATK);
    expect(
      log.some((l) => l.fx.kind === "bossCast" && (l.fx as { ms: number }).ms === 3 * 400 + 900),
    ).toBe(true);
  });

  it("triệu hồi: gọi quái con quanh trùm, không vượt maxAdds, quái con mang `addOf`", () => {
    const { w, mon, tick, until } = scene(
      def([ab("goi", { t: "summon", kind: "tho", count: 2 }, { dmgMult: 0, cooldownMs: 3000 })], {
        maxAdds: 3,
      }),
    );
    until(() => bossLiveAdds(w, mon.mc.boss!) > 0);
    tick(400); // gọi nhiều lần: vẫn <= 3
    expect(bossLiveAdds(w, mon.mc.boss!)).toBeLessThanOrEqual(3);
    for (const id of mon.mc.boss!.adds) expect(w.mctrl.get(id)!.addOf).toBe(mon.id);
  });

  it("giáp: trong thời gian giáp trùm nhận dmgTakenMult lần sát thương; hết giáp thì như cũ", () => {
    const { w, mon, tick, until, p } = scene(
      def([
        ab("giap", { t: "buff", dmgTakenMult: 0.5, ms: 4000 }, { dmgMult: 0, cooldownMs: 60_000 }),
      ]),
    );
    until(() => mon.mc.boss!.armorUntil > w.now);
    const hp0 = mon.m.hp;
    dealMonsterDamage(w, mon.id, mon.m, "a", 100, false);
    expect(hp0 - mon.m.hp).toBe(50);
    while (w.now < mon.mc.boss!.armorUntil + TICK_MS) tick();
    const hp1 = mon.m.hp;
    dealMonsterDamage(w, mon.id, mon.m, "a", 100, false);
    expect(hp1 - mon.m.hp).toBe(100);
    expect(p.hp).toBe(1_000_000_000); // giáp không sát thương
  });
});

describe("một chiêu một lúc, nghỉ giữa các chiêu", () => {
  it("hai đòn liên tiếp cách >= 1,4 giây (castGapMs >= 600 + báo trước >= 800), kể cả khi cuồng nộ", () => {
    const d = def(
      [ab("a", { t: "circleAt", at: "target", r: 60 }, { recoverMs: 0, cooldownMs: 900 })],
      {
        enrage: { afterMs: 5000, atkMult: 1.5, speedMult: 1.2, cdMult: 0.1 },
      },
    );
    d.phases[0]!.cdMult = 0.1; // hồi chiêu / nghỉ cực ngắn: nghỉ giữa vẫn bị kẹp tối thiểu
    const { p, w, tick } = scene(d);
    const hits: number[] = [];
    let last = p.hp;
    for (let i = 0; i < 1200; i++) {
      tick();
      if (p.hp < last) hits.push(w.now);
      last = p.hp;
    }
    expect(hits.length).toBeGreaterThan(5);
    for (let i = 1; i < hits.length; i++)
      expect(hits[i]! - hits[i - 1]!).toBeGreaterThanOrEqual(1400);
  });

  it("không bao giờ hai chiêu nặng chồng báo trước: giữa hai `bossCast` luôn cách >= tổng báo trước + nghỉ", () => {
    const { log, tick } = scene(
      def([
        ab("a", { t: "circleAt", at: "target", r: 60 }),
        ab("b", { t: "cone", r: 200, arc: 1 }, { weight: 2 }),
        ab("c", { t: "line", len: 400, w: 60 }),
      ]),
    );
    tick(1200);
    const casts = log.filter((l) => l.fx.kind === "bossCast");
    expect(casts.length).toBeGreaterThan(5);
    for (let i = 1; i < casts.length; i++)
      expect(casts[i]!.at - casts[i - 1]!.at).toBeGreaterThanOrEqual(
        900 + 600 + BOSS_MIN_CAST_GAP_MS,
      );
  });

  it("hồi chiêu riêng từng chiêu: chiêu vừa dùng không được chọn lại trước cooldownMs", () => {
    const { log, tick } = scene(
      def([ab("a", { t: "circleAt", at: "target", r: 60 }, { cooldownMs: 6000 })]),
    );
    tick(600);
    const casts = log.filter((l) => l.fx.kind === "bossCast");
    expect(casts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < casts.length; i++)
      expect(casts[i]!.at - casts[i - 1]!.at).toBeGreaterThanOrEqual(6000);
  });
});

describe("chọn chiêu: điều kiện, trọng số, seed", () => {
  it("minDist / maxDist: chiêu chỉ được chọn khi mục tiêu trong khoảng", () => {
    const near = scene(
      def([
        ab("gan", { t: "circleAt", at: "self", r: 80 }, { cond: { maxDist: 100 } }),
        ab("xa", { t: "circleAt", at: "target", r: 80 }, { cond: { minDist: 150 } }),
      ]),
      60,
    );
    near.tick(200);
    const abilities = near.log
      .filter((l) => l.fx.kind === "bossCast")
      .map((l) => (l.fx as { ability: string }).ability);
    expect(abilities.length).toBeGreaterThan(0);
    expect(new Set(abilities)).toEqual(new Set(["gan"]));
    const far = scene(
      def([
        ab("gan", { t: "circleAt", at: "self", r: 80 }, { cond: { maxDist: 100 } }),
        ab("xa", { t: "circleAt", at: "target", r: 80 }, { cond: { minDist: 150 } }),
      ]),
      300,
    );
    far.tick(200);
    const fa = far.log
      .filter((l) => l.fx.kind === "bossCast")
      .map((l) => (l.fx as { ability: string }).ability);
    expect(new Set(fa)).toEqual(new Set(["xa"]));
  });

  it("minTargets: chiêu đám đông chỉ khi đủ người quanh trùm", () => {
    const d = def([ab("dam", { t: "circleAt", at: "self", r: 80 }, { cond: { minTargets: 2 } })]);
    const solo = scene(d);
    solo.tick(200);
    expect(solo.log.some((l) => l.fx.kind === "bossCast")).toBe(false); // chỉ một người: không chiêu nào hợp lệ
    const duo = scene(d);
    const q = addPlayer(duo.w, "b", 4, 0);
    q.p.x = duo.p.x + 20;
    q.p.y = duo.p.y;
    q.p.hp = q.p.maxHp = 1_000_000_000;
    duo.tick(200);
    expect(duo.log.some((l) => l.fx.kind === "bossCast")).toBe(true);
  });

  it("cùng seed cho đúng cùng chuỗi chiêu; khác seed (thường) khác chuỗi; chọn theo trọng số", () => {
    const d = () =>
      def([
        ab(
          "a",
          { t: "circleAt", at: "target", r: 60 },
          { weight: 1, cooldownMs: 1500, recoverMs: 0 },
        ),
        ab("b", { t: "cone", r: 200, arc: 1 }, { weight: 1, cooldownMs: 1500, recoverMs: 0 }),
        ab("c", { t: "line", len: 400, w: 60 }, { weight: 1, cooldownMs: 1500, recoverMs: 0 }),
      ]);
    const seq = (seed: number) => {
      const s = scene(d(), 200, seed);
      s.tick(1500);
      return s.log
        .filter((l) => l.fx.kind === "bossCast")
        .map((l) => (l.fx as { ability: string }).ability)
        .join("");
    };
    expect(seq(7)).toBe(seq(7));
    expect(seq(7).length).toBeGreaterThan(8);
    const distinct = new Set([1, 2, 3, 4, 5, 6].map(seq));
    expect(distinct.size).toBeGreaterThan(1);
    // trọng số nặng lệch về chiêu "a"
    const heavy = scene(
      def([
        ab(
          "a",
          { t: "circleAt", at: "target", r: 60 },
          { weight: 50, cooldownMs: 1500, recoverMs: 0 },
        ),
        ab("b", { t: "cone", r: 200, arc: 1 }, { weight: 1, cooldownMs: 1500, recoverMs: 0 }),
      ]),
      200,
      3,
    );
    heavy.tick(3000);
    const names = heavy.log
      .filter((l) => l.fx.kind === "bossCast")
      .map((l) => (l.fx as { ability: string }).ability);
    expect(names.filter((n) => n === "a").length).toBeGreaterThan(
      names.filter((n) => n === "b").length,
    );
  });

  it("KHÔNG dùng `Math.random` khi chọn chiêu / báo trước / đáp đòn (giữ chuỗi của bench có seed; đòn thường cận chiến của trùm vẫn dùng `rand` như mọi quái, nên ca này không có ai sát chân trùm)", () => {
    const spy = vi.spyOn(Math, "random");
    try {
      const { tick } = scene(
        def([
          ab("a", { t: "circleAt", at: "target", r: 60 }),
          ab("m", { t: "rain", r: 50, count: 3, spreadPx: 120, gapMs: 300 }),
          ab("n", { t: "cone", r: 240, arc: 1.2 }),
          ab("l", { t: "line", len: 420, w: 70 }),
        ]),
      );
      tick(1200);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("giai đoạn", () => {
  const twoPhases = (withAdds = true): BossDef => {
    const a = ab("a", { t: "circleAt", at: "target", r: 60 });
    const b = ab("b", { t: "circleAt", at: "self", r: 100 });
    return {
      kind: "mang",
      maxAdds: 2,
      abilities: [a, b],
      phases: [
        phase(["a"]),
        phase(["a", "b"], {
          id: "p1",
          fromHp: 0.5,
          speedMult: 1.5,
          atkMult: 2,
          cdMult: 0.5,
          onEnter: withAdds
            ? [{ t: "summon", kind: "tho", count: 2 }]
            : [{ t: "buff", dmgTakenMult: 0.9, ms: 1000 }],
        }),
      ],
    };
  };

  it("hết khí huyết tới ngưỡng thì chuyển MỘT lần: `fx` bossPhase, quái con xuất hiện (<= maxAdds), hệ số đổi", () => {
    const { w, mon, tick, log } = scene(twoPhases());
    tick(40);
    mon.m.hp = Math.floor(mon.m.maxHp * 0.49);
    tick(1);
    expect(log.filter((l) => l.fx.kind === "bossPhase")).toHaveLength(1);
    expect(log.find((l) => l.fx.kind === "bossPhase")!.fx).toMatchObject({ phase: 1, by: mon.id });
    expect(mon.mc.boss!.phase).toBe(1);
    expect(mon.mc.boss!.atk).toBe(2);
    expect(mon.mc.boss!.mv).toBe(1.5);
    expect(bossLiveAdds(w, mon.mc.boss!)).toBe(2);
    tick(200); // không chuyển lần nữa
    expect(log.filter((l) => l.fx.kind === "bossPhase")).toHaveLength(1);
  });

  it("chuyển giai đoạn NGẮT chiêu đang gồng (không đáp), rồi gầm BOSS_PHASE_ROAR_MS KHÔNG sát thương", () => {
    const { w, mon, p, tick, untilCast } = scene(twoPhases(false)); // không quái con: chỉ đo sát thương của chính trùm
    const hp0 = p.hp;
    const t = untilCast();
    tick(2);
    mon.m.hp = Math.floor(mon.m.maxHp * 0.4); // giữa lúc gồng
    const tp = w.now;
    while (w.now < t + 900 + 3 * TICK_MS) tick(); // qua hạn đáp của chiêu bị ngắt
    expect(p.hp).toBe(hp0);
    expect(mon.mc.boss!.roarUntil).toBe(tp + TICK_MS + BOSS_PHASE_ROAR_MS);
    while (w.now < mon.mc.boss!.roarUntil) {
      tick();
      expect(p.hp).toBe(hp0); // đang gầm: không sát thương
    }
  });

  it("đang gầm trùm ĐỨNG YÊN (không đuổi, không đánh thường); hết gầm mới đi tiếp", () => {
    const { mon, p, tick, w } = scene(twoPhases(false), 400);
    mon.mc.def = { ...MANG, speed: 120 }; // lần này trùm biết đi
    tick(2);
    mon.m.hp = Math.floor(mon.m.maxHp * 0.4);
    tick(1);
    const x0 = mon.m.x;
    const until = mon.mc.boss!.roarUntil;
    expect(until).toBeGreaterThan(w.now);
    while (w.now < until - TICK_MS) {
      tick();
      expect(mon.m.x).toBe(x0);
    }
    tick(10);
    expect(mon.m.x).not.toBe(x0); // hết gầm: đuổi tiếp
    expect(p.hp).toBeGreaterThan(0);
  });

  it("nhảy qua nhiều ngưỡng trong một tick: chạy `onEnter` của MỌI giai đoạn đã vượt, vào thẳng giai đoạn cuối", () => {
    const d = twoPhases();
    d.phases.push(
      phase(["a"], {
        id: "p2",
        fromHp: 0.2,
        onEnter: [{ t: "buff", dmgTakenMult: 0.5, ms: 5000 }],
      }),
    );
    const { w, mon, tick } = scene(d);
    tick(1);
    mon.m.hp = 1;
    tick(1);
    expect(mon.mc.boss!.phase).toBe(2);
    expect(bossLiveAdds(w, mon.mc.boss!)).toBe(2);
    expect(mon.mc.boss!.armorUntil).toBeGreaterThan(w.now);
  });

  it("giai đoạn chỉ TĂNG: khí huyết hồi lên (ngoài reset) không đưa về giai đoạn trước", () => {
    const { mon, tick } = scene(twoPhases());
    tick(2);
    mon.m.hp = Math.floor(mon.m.maxHp * 0.4);
    tick(2);
    mon.m.hp = mon.m.maxHp;
    tick(10);
    expect(mon.mc.boss!.phase).toBe(1);
  });
});

describe("fx giáp / triệu hồi của trùm (bossArmor / bossSummon, T4 #873)", () => {
  type Armor = Extract<FxMsg, { kind: "bossArmor" }>;
  type Summon = Extract<FxMsg, { kind: "bossSummon" }>;
  const armors = (log: { fx: FxMsg }[]) =>
    log.filter((l) => l.fx.kind === "bossArmor").map((l) => l.fx as Armor);
  const summons = (log: { fx: FxMsg }[]) =>
    log.filter((l) => l.fx.kind === "bossSummon").map((l) => l.fx as Summon);

  it("chiêu giáp: ĐÚNG MỘT `bossArmor` lúc dựng (ms, mult khớp dữ liệu, chỗ trùm đứng), không gửi lại mỗi tick", () => {
    const { mon, tick, until, log } = scene(
      def([
        ab("giap", { t: "buff", dmgTakenMult: 0.5, ms: 4000 }, { dmgMult: 0, cooldownMs: 60_000 }),
      ]),
    );
    until(() => armors(log).length > 0);
    tick(60); // 3 giây giáp vẫn đang có: không gửi thêm
    expect(armors(log)).toHaveLength(1);
    expect(armors(log)[0]).toEqual({
      kind: "bossArmor",
      by: mon.id,
      x: mon.m.x,
      y: mon.m.y,
      ms: 4000,
      mult: 0.5,
    });
  });

  it("fx giáp đi đúng lúc giáp có tác dụng: có `bossArmor` thì sát thương nhận đã nhân `mult`", () => {
    const { w, mon, until, log } = scene(
      def([ab("giap", { t: "buff", dmgTakenMult: 0.25, ms: 5000 }, { dmgMult: 0 })]),
    );
    until(() => armors(log).length > 0);
    const hp0 = mon.m.hp;
    dealMonsterDamage(w, mon.id, mon.m, "a", 100, false);
    expect(hp0 - mon.m.hp).toBe(Math.round(100 * armors(log)[0]!.mult));
  });

  it("chiêu không phải giáp / triệu hồi (đòn gây sát thương) KHÔNG sinh `bossArmor` / `bossSummon`", () => {
    const { tick, log } = scene(def([ab("a", { t: "circleAt", at: "target", r: 60 })]));
    tick(200);
    expect(log.some((l) => l.fx.kind === "warn")).toBe(true);
    expect(armors(log)).toHaveLength(0);
    expect(summons(log)).toHaveLength(0);
  });

  it("onEnter vào giai đoạn: `bossPhase` TRƯỚC, rồi `bossArmor` (một lần)", () => {
    const d = def([ab("a", { t: "circleAt", at: "target", r: 60 })]);
    d.phases.push(
      phase(["a"], {
        id: "p1",
        fromHp: 0.5,
        onEnter: [{ t: "buff", dmgTakenMult: 0.5, ms: 5000 }],
      }),
    );
    const { mon, tick, log } = scene(d);
    tick(5);
    expect(armors(log)).toHaveLength(0);
    mon.m.hp = Math.floor(mon.m.maxHp * 0.4);
    tick(1);
    const kinds = log.map((l) => l.fx.kind).filter((k) => k === "bossPhase" || k === "bossArmor");
    expect(kinds).toEqual(["bossPhase", "bossArmor"]);
    expect(armors(log)[0]).toMatchObject({ by: mon.id, ms: 5000, mult: 0.5 });
  });

  it("triệu hồi: `bossSummon` mang số con THẬT SỰ xuất hiện (<= maxAdds), một lần mỗi lần gọi", () => {
    const { w, mon, until, log } = scene(
      def([ab("goi", { t: "summon", kind: "tho", count: 5 }, { dmgMult: 0, cooldownMs: 60_000 })], {
        maxAdds: 2,
      }),
    );
    until(() => summons(log).length > 0);
    expect(summons(log)).toHaveLength(1);
    expect(summons(log)[0]).toMatchObject({ kind: "bossSummon", by: mon.id, n: 2 });
    expect(bossLiveAdds(w, mon.mc.boss!)).toBe(summons(log)[0]!.n);
  });

  it("triệu hồi lúc đã đủ quái con (không còn chỗ): KHÔNG gửi `bossSummon` (n luôn >= 1)", () => {
    const { w, mon, tick, until, log } = scene(
      def([ab("goi", { t: "summon", kind: "tho", count: 2 }, { dmgMult: 0, cooldownMs: 1500 })], {
        maxAdds: 2,
      }),
    );
    until(() => summons(log).length > 0);
    tick(400); // gọi nhiều lần nữa nhưng đã đủ 2 con
    expect(bossLiveAdds(w, mon.mc.boss!)).toBe(2);
    expect(summons(log)).toHaveLength(1);
    for (const f of summons(log)) expect(f.n).toBeGreaterThanOrEqual(1);
  });

  it("gọi mà KHÔNG dựng được con nào (mọi chỗ quanh trùm bị chặn): có `bossCast` nhưng KHÔNG `bossSummon`", () => {
    const { w, mon, tick, until, log } = scene(
      def([ab("goi", { t: "summon", kind: "tho", count: 2 }, { dmgMult: 0, cooldownMs: 1500 })]),
    );
    (w.map as { circleBlocked: unknown }).circleBlocked = () => true;
    until(() => log.some((l) => l.fx.kind === "bossCast"));
    tick(100);
    expect(bossLiveAdds(w, mon.mc.boss!)).toBe(0);
    expect(summons(log)).toHaveLength(0);
  });

  it("gọi 2 mà chỉ dựng được 1 (con đầu hết chỗ đặt): `bossSummon.n` = 1 = số con THẬT, không phải số muốn gọi / số còn chỗ", () => {
    const { w, mon, tick, until, log } = scene(
      def([ab("goi", { t: "summon", kind: "tho", count: 2 }, { dmgMult: 0, cooldownMs: 60_000 })], {
        maxAdds: 2,
      }),
    );
    // Chặn đúng 4 lần thử đặt đầu tiên SAU khi trùm bắt đầu gọi (con thứ nhất thử đủ 4 hướng đều bị chặn), từ đó không chặn nữa: con thứ hai đặt được
    let blocked = 0;
    let armed = false;
    (w.map as { circleBlocked: unknown }).circleBlocked = () => {
      if (!armed) return false;
      return blocked++ < 4;
    };
    until(() => log.some((l) => l.fx.kind === "bossCast"));
    armed = true;
    until(() => summons(log).length > 0);
    tick(5);
    expect(bossLiveAdds(w, mon.mc.boss!)).toBe(1);
    expect(summons(log)).toHaveLength(1);
    expect(summons(log)[0]!.n).toBe(1);
  });

  it("onEnter gọi quái con: `bossPhase` rồi `bossSummon` với n = số con xuất hiện", () => {
    const d = def([ab("a", { t: "circleAt", at: "target", r: 60 })]);
    d.phases.push(
      phase(["a"], {
        id: "p1",
        fromHp: 0.5,
        onEnter: [{ t: "summon", kind: "tho", count: 2 }],
      }),
    );
    const { w, mon, tick, log } = scene(d);
    tick(5);
    mon.m.hp = Math.floor(mon.m.maxHp * 0.4);
    tick(1);
    const kinds = log.map((l) => l.fx.kind).filter((k) => k === "bossPhase" || k === "bossSummon");
    expect(kinds).toEqual(["bossPhase", "bossSummon"]);
    expect(summons(log)[0]!.n).toBe(bossLiveAdds(w, mon.mc.boss!));
  });
});

describe("quái con của trùm", () => {
  it("hạ quái con: KHÔNG tu vi, KHÔNG rơi đồ / Linh thạch, KHÔNG tính kiếp; và nó biến mất", () => {
    const { w, mon, p, c, until } = scene(
      def([ab("goi", { t: "summon", kind: "tho", count: 1 }, { dmgMult: 0 })]),
    );
    until(() => bossLiveAdds(w, mon.mc.boss!) > 0);
    const aid = [...mon.mc.boss!.adds][0]!;
    const amc = w.mctrl.get(aid)!;
    amc.damageBy.set("a", 50);
    const exp0 = p.exp;
    const coin0 = c.coin;
    const kills0 = c.life.kills;
    const loot0 = w.state.loot.size;
    killMonster(w, aid, amc);
    expect(w.mctrl.has(aid)).toBe(false);
    expect(w.state.monsters.has(aid)).toBe(false);
    expect(p.exp).toBe(exp0);
    expect(c.coin).toBe(coin0);
    expect(c.life.kills).toBe(kills0);
    expect(w.state.loot.size).toBe(loot0);
  });

  it("trùm chết: quái con biến mất theo (không để chúng đứng lại)", () => {
    const { w, mon, until } = scene(
      def([ab("goi", { t: "summon", kind: "tho", count: 2 }, { dmgMult: 0 })]),
    );
    until(() => bossLiveAdds(w, mon.mc.boss!) >= 2);
    const ids = [...mon.mc.boss!.adds];
    killMonster(w, mon.id, mon.mc);
    for (const id of ids) expect(w.mctrl.has(id)).toBe(false);
  });
});

describe("cuồng nộ", () => {
  it("sau afterMs có người trong trận: gửi bossEnrage, nhân sát thương; báo trước KHÔNG rút ngắn", () => {
    const d = def(
      [ab("a", { t: "circleAt", at: "target", r: 60 }, { cooldownMs: 1500, recoverMs: 0 })],
      {
        enrage: { afterMs: 6000, atkMult: 2, speedMult: 1.3, cdMult: 0.3 },
      },
    );
    const { w, mon, p, tick, log, warns } = scene(d);
    const dmgs: number[] = [];
    let last = p.hp;
    for (let i = 0; i < 400; i++) {
      tick();
      if (p.hp < last) dmgs.push(last - p.hp);
      last = p.hp;
    }
    expect(log.filter((l) => l.fx.kind === "bossEnrage")).toHaveLength(1);
    expect(mon.mc.boss!.enraged).toBe(true);
    expect(dmgs[0]).toBe(BOSS_ATK);
    expect(dmgs[dmgs.length - 1]).toBe(BOSS_ATK * 2);
    for (const x of warns()) expect(x.ms).toBeGreaterThanOrEqual(BOSS_MIN_TELEGRAPH_MS);
    expect(w.now).toBeGreaterThan(0);
  });

  it("đồng hồ cuồng nộ chỉ chạy khi có mục tiêu (không ai thì dừng)", () => {
    const d = def([ab("a", { t: "circleAt", at: "target", r: 60 })], {
      enrage: { afterMs: 3000, atkMult: 2, speedMult: 1, cdMult: 1 },
    });
    const { w, mon, p, tick } = scene(d);
    tick(20);
    const ms = mon.mc.boss!.fightMs;
    expect(ms).toBeGreaterThan(0);
    p.dead = true; // hết mục tiêu
    tick(100);
    expect(w.now).toBeGreaterThan(0);
    expect(mon.mc.boss!.fightMs).toBe(0); // reset
  });
});

describe("reset", () => {
  it("mất hết mục tiêu: hồi đầy khí huyết, giai đoạn 0, xoá hồi chiêu / cuồng nộ / vũng / giáp / quái con", () => {
    const d = def(
      [
        ab("goi", { t: "summon", kind: "tho", count: 2 }, { dmgMult: 0 }),
        ab("doc", { t: "pool", r: 60, ttlMs: 20_000, tickMs: 1000 }),
      ],
      { enrage: { afterMs: 1000, atkMult: 2, speedMult: 1, cdMult: 1 } },
    );
    d.phases.push(
      phase(["goi", "doc"], {
        id: "p1",
        fromHp: 0.5,
        onEnter: [{ t: "buff", dmgTakenMult: 0.5, ms: 60_000 }],
      }),
    );
    const { w, mon, p, tick, until } = scene(d);
    until(() => mon.mc.boss!.enraged);
    mon.m.hp = Math.floor(mon.m.maxHp * 0.3);
    until(() => bossLiveAdds(w, mon.mc.boss!) > 0 && mon.mc.boss!.phase === 1);
    const ids = [...mon.mc.boss!.adds];
    p.dead = true;
    tick(5);
    const bs = mon.mc.boss!;
    expect(mon.m.hp).toBe(mon.m.maxHp);
    expect(bs.phase).toBe(0);
    expect(bs.enraged).toBe(false);
    expect(bs.fightMs).toBe(0);
    expect(bs.cast).toBeUndefined();
    expect(bs.cds.size).toBe(0);
    expect(bs.pools).toHaveLength(0);
    expect(bs.armorUntil).toBe(0);
    expect(bs.engaged).toBe(false);
    expect(bs.atk).toBe(1);
    for (const id of ids) expect(w.mctrl.has(id)).toBe(false);
  });

  it("sau reset trùm lại vận chiêu từ đầu: lần đầu vẫn chờ >= 1,2 giây sau khi gây hấn lại", () => {
    const { w, p, tick, untilCast, log } = scene(
      def([ab("a", { t: "circleAt", at: "target", r: 60 })]),
    );
    untilCast();
    p.dead = true;
    tick(5);
    p.dead = false;
    const t1 = w.now;
    log.length = 0;
    const t = untilCast();
    expect(t - t1).toBeGreaterThanOrEqual(BOSS_FIRST_CAST_DELAY_MS);
  });
});

describe("bộ lọc mục tiêu (mục 33: bảo vệ mất kết nối)", () => {
  it("`bossCanTarget`: người chết, hồn lìa xác, hộ thể, khu an toàn KHÔNG bị nhắm", () => {
    const { w, p } = scene(def([ab("a", { t: "circleAt", at: "target", r: 60 })]));
    expect(bossCanTarget(w, "a", p)).toBe(true);
    p.dead = true;
    expect(bossCanTarget(w, "a", p)).toBe(false);
    p.dead = false;
    w.ghosts.add("a");
    expect(bossCanTarget(w, "a", p)).toBe(false);
    w.ghosts.delete("a");
    w.shielded.add("a");
    expect(bossCanTarget(w, "a", p)).toBe(false);
    w.shielded.delete("a");
    const home = { x: w.map.townPx.x, y: w.map.townPx.y };
    const save = { x: p.x, y: p.y };
    p.x = home.x;
    p.y = home.y;
    expect(bossCanTarget(w, "a", p)).toBe(false);
    p.x = save.x;
    p.y = save.y;
    expect(bossCanTarget(w, "a", p)).toBe(true);
  });

  it("đứng trong vùng đáp nhưng hồn lìa xác / hộ thể thì KHÔNG mất máu", () => {
    for (const kind of ["ghost", "shield"] as const) {
      const { w, p, tick } = scene(def([ab("roi", { t: "circleAt", at: "target", r: 80 })]));
      const hp0 = p.hp;
      if (kind === "ghost") w.ghosts.add("a");
      else w.shielded.add("a");
      tick(120);
      expect(p.hp).toBe(hp0);
    }
  });

  it("người đứng trong khu an toàn (trấn) KHÔNG trúng dù nằm trong vùng đáp; người ngoài khu cùng vùng thì trúng", () => {
    const { w, mon, p, tick, until } = scene(
      def([ab("roi", { t: "circleAt", at: "self", r: 320 })]),
      100,
    );
    const t = w.map.townPx;
    mon.m.x = t.x + t.r + 110; // trùm đứng ngay ngoài trấn
    mon.m.y = t.y;
    p.x = mon.m.x + 100; // người làm mục tiêu: ngoài trấn
    p.y = t.y;
    const home = addPlayer(w, "h", 4, 0);
    home.p.x = t.x + t.r - 40; // trong trấn, cách trùm ~150 px: nằm trong vòng r = 320
    home.p.y = t.y;
    home.p.hp = home.p.maxHp = 1_000_000_000;
    expect(w.map.inSafe(home.p.x, home.p.y, 20)).toBe(true);
    expect(Math.hypot(home.p.x - mon.m.x, home.p.y - mon.m.y)).toBeLessThan(320);
    until(() => p.hp < 1_000_000_000);
    tick(20);
    expect(home.p.hp).toBe(1_000_000_000);
  });

  it("nhiều người trong vùng đáp: ai trong vùng đều trúng, ai ngoài thì không", () => {
    const { w, p, tick, until } = scene(def([ab("roi", { t: "circleAt", at: "target", r: 100 })]));
    const b = addPlayer(w, "b", 4, 0);
    b.p.x = p.x + 40;
    b.p.y = p.y;
    b.p.hp = b.p.maxHp = 1_000_000_000;
    const far = addPlayer(w, "c", 4, 0);
    far.p.x = p.x + 400;
    far.p.y = p.y;
    far.p.hp = far.p.maxHp = 1_000_000_000;
    until(() => p.hp < 1_000_000_000);
    tick(1);
    expect(b.p.hp).toBeLessThan(1_000_000_000);
    expect(far.p.hp).toBe(1_000_000_000);
  });
});

describe("bất biến công bằng (fuzz có seed, mô phỏng người chạy loạn)", () => {
  /** Bộ ngẫu nhiên có seed riêng của test (không đụng `Math.random`). */
  const mk = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Vùng `warn` có chứa điểm (px, py) không? Nới 11 px (bán kính người) cho mọi hình: đủ cho "hit ⊆ warn" mà không lẫn. */
  const inWarn = (x: Warn, px: number, py: number): boolean => {
    const d = Math.hypot(px - x.x, py - x.y);
    if (x.shape === "circle") return d <= x.r + PLAYER_RADIUS;
    if (x.shape === "cone") {
      if (d > x.r + PLAYER_RADIUS) return false;
      const a = Math.atan2(py - x.y, px - x.x) - (x.angle ?? 0);
      return (
        Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= (x.arc ?? 0) / 2 + Math.PI / 12 ||
        d < 2 * PLAYER_RADIUS
      );
    }
    const ang = x.angle ?? 0;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const along = (px - x.x) * ux + (py - x.y) * uy;
    const perp = Math.abs((px - x.x) * uy - (py - x.y) * ux);
    return (
      along >= -PLAYER_RADIUS &&
      along <= x.r + PLAYER_RADIUS &&
      perp <= (x.w ?? 0) / 2 + PLAYER_RADIUS
    );
  };

  const everything = (): BossDef =>
    def(
      [
        ab("c", { t: "circleAt", at: "target", r: 70 }, { weight: 2 }),
        ab("f", { t: "circleAt", at: "farthest", r: 70 }),
        ab("r", { t: "ring", r0: 90, r: 260 }),
        ab("n", { t: "cone", r: 240, arc: 1.2 }, { cond: { maxDist: 260 } }),
        ab("l", { t: "line", len: 420, w: 70 }),
        ab("x", { t: "charge", len: 300, w: 70 }, { cond: { minDist: 80 } }),
        ab("m", { t: "rain", r: 55, count: 4, spreadPx: 160, gapMs: 450 }, { cooldownMs: 9000 }),
        ab("k", { t: "pull", r: 420, pullPx: 100, blastR: 70 }),
        ab("d", { t: "pool", r: 60, ttlMs: 2500, tickMs: 700 }),
        ab("b", { t: "blink", landR: 70 }),
      ],
      { maxAdds: 0 },
    );

  it("MỌI lần mất máu vì trùm xảy ra SAU một `warn` >= 800 ms đã hết hạn và phủ chỗ người chơi (nhiều seed, người chạy loạn, nhiều người)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const rnd = mk(seed * 977);
      const s = scene(everything(), 220, seed);
      const people = [s.p];
      for (const name of ["b", "c"]) {
        const q = addPlayer(s.w, name, 4, 0);
        q.p.x = s.p.x + (rnd() - 0.5) * 300;
        q.p.y = s.p.y + (rnd() - 0.5) * 300;
        q.p.hp = q.p.maxHp = 1_000_000_000;
        people.push(q.p);
      }
      let hits = 0;
      for (let i = 0; i < 1600; i++) {
        // người chạy loạn: mỗi người đổi hướng ngẫu nhiên, giữ trong vùng thoáng quanh trùm
        for (const q of people) {
          if (i % 8 === 0) {
            q.angle = rnd() * 2 * Math.PI;
          }
          const nx = q.x + Math.cos(q.angle) * 6;
          const ny = q.y + Math.sin(q.angle) * 6;
          if (
            Math.hypot(nx - s.spot.x, ny - s.spot.y) < 380 &&
            !s.w.map.circleBlocked(nx, ny, 12)
          ) {
            q.x = nx;
            q.y = ny;
          } else q.angle = rnd() * 2 * Math.PI;
        }
        const before = people.map((q) => ({ hp: q.hp, x: q.x, y: q.y }));
        s.tick();
        const now = s.w.now;
        const wr = s.warns();
        people.forEach((q, k) => {
          if (q.hp >= before[k]!.hp) return;
          hits++;
          // vị trí lúc đáp = vị trí đầu tick (trùm đáp trong tick, trước khi người kịp bước thêm trong test này)
          const ok = wr.some(
            (x) =>
              x.ms >= BOSS_MIN_TELEGRAPH_MS &&
              x.at + x.ms <= now &&
              inWarn(x, before[k]!.x, before[k]!.y),
          );
          if (!ok)
            throw new Error(
              `seed ${seed} tick ${i}: người ${k} mất máu mà không có warn >= 800 ms đã hết hạn phủ vị trí (${before[k]!.x | 0}, ${before[k]!.y | 0})`,
            );
        });
      }
      expect(hits, `seed ${seed}: bài test phải thật sự có người trúng đòn`).toBeGreaterThan(3);
    }
  });

  it("mọi `warn` của chiêu có sát thương có ms >= BOSS_MIN_TELEGRAPH_MS", () => {
    const s = scene(everything(), 220, 9);
    s.tick(1800);
    const wr = s.warns();
    expect(wr.length).toBeGreaterThan(10);
    for (const x of wr) expect(x.ms).toBeGreaterThanOrEqual(BOSS_MIN_TELEGRAPH_MS);
  });
});

describe("cờ bật bộ chiêu", () => {
  it("`bossMoves` TẮT (mặc định): `placeMonster` không dựng `boss`, trùm chạy như cũ", () => {
    const h = makeWorld();
    expect(h.w.bossMoves).toBe(false);
    const id = placeMonster(h.w, MONSTER_BY_ID.mang!, 500, 500);
    expect(h.w.mctrl.get(id)!.boss).toBeUndefined();
  });

  it("`bossMoves` BẬT: `placeMonster` dựng `boss` cho loài có bộ chiêu trong `BOSSES`, không dựng cho quái thường", () => {
    const h = makeWorld();
    h.w.bossMoves = true;
    const id = placeMonster(h.w, MONSTER_BY_ID.mang!, 500, 500);
    expect(h.w.mctrl.get(id)!.boss?.def.kind).toBe("mang");
    const t = placeMonster(h.w, MONSTER_BY_ID.tho!, 520, 500);
    expect(h.w.mctrl.get(t)!.boss).toBeUndefined();
  });

  it("trùm KHÔNG có `boss` (cờ tắt) vẫn đánh thường như cũ và gây sát thương", () => {
    const h = makeWorld(openArena());
    const { w } = h;
    w.now = 10_000;
    const spot = openSpot(w);
    const mon = addMonster(w, "mang", spot.x, spot.y);
    const { p } = addPlayer(w, "a", 4, 0);
    p.x = spot.x + 40;
    p.y = spot.y;
    p.hp = p.maxHp = 1_000_000_000;
    for (let i = 0; i < 100; i++) {
      w.now += TICK_MS;
      tickMonsters(w, TICK_MS / 1000);
    }
    expect(p.hp).toBeLessThan(1_000_000_000);
    expect(mon.mc.boss).toBeUndefined();
    expect(h.fx.some((f) => f.kind === "bossCast")).toBe(false);
  });
});
