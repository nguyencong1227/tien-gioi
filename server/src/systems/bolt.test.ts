// Quái tầm xa và đạn (M7.3, #504): `fireBolt`, `rangedStep`, `tickBolts` (docs/PHAN_CONG_M7.md mục 6). Loài quái thử `t_xa` chèn vào `MONSTER_BY_ID` rồi dọn.
import { afterEach, describe, expect, it } from "vitest";
import { MAX_BOLTS, MONSTER_BY_ID, PLAYER_RADIUS, TILE, type MonsterKind } from "@tien-gioi/shared";
import { fxReachOf } from "../rooms/WorldRoom";
import {
  BOLT_HOLD_MAX,
  BOLT_HOLD_MIN,
  BOLT_RADIUS,
  BOLT_RETREAT_MULT,
  DEFAULT_BOLT_RANGE,
  DEFAULT_BOLT_SPEED,
  POISON_EFFECT,
  boltRangeOf,
  boltSpeedOf,
  fireBolt,
  isRanged,
  onHitEffectOf,
  rangedStep,
  tickBolts,
} from "./bolt";
import { hurtPlayer } from "./combat";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const XA = "t_xa";
const added: string[] = [];
/** Loài quái tầm xa thử: bắn 300 px / giây, tầm 300 px, 20 sát thương, hồi 1 giây. */
function ranged(over: Partial<MonsterKind> = {}): MonsterKind {
  const def: MonsterKind = {
    ...MONSTER_BY_ID.lang,
    id: XA,
    name: "Quái bắn thử",
    behavior: "ranged",
    boltSpeed: 300,
    boltRange: 300,
    atk: 20,
    attackCd: 1000,
    aggro: 500,
    attackRange: 20,
    hp: 1e9,
    ...over,
  };
  MONSTER_BY_ID[XA] = def;
  if (!added.includes(XA)) added.push(XA);
  return def;
}
afterEach(() => {
  for (const id of added.splice(0)) delete MONSTER_BY_ID[id];
});

/** Người chơi Luyện Khí đứng ngoài trấn, quái tầm xa đứng cách `gap` px về bên trái. */
function setup(gap: number, over: Partial<MonsterKind> = {}) {
  ranged(over);
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 1, 0);
  const m = addMonster(t.w, XA, a.p.x - gap, a.p.y);
  m.mc.homeX = m.m.x;
  m.mc.homeY = m.m.y;
  t.w.now = 10_000;
  return { ...t, ...a, mon: m };
}
const boltFx = (t: ReturnType<typeof setup>) => t.fx.filter((f) => f.kind === "bolt");

describe("fireBolt", () => {
  it("thêm đúng MỘT đạn (hướng, tốc độ, tầm, sát thương = atk) và gửi đúng MỘT fx `bolt`", () => {
    const t = setup(200);
    expect(fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0)).toBe(true);
    expect(t.w.bolts).toHaveLength(1);
    const b = t.w.bolts[0];
    expect([b.x, b.y]).toEqual([t.mon.m.x, t.mon.m.y]);
    expect([b.ux, b.uy]).toEqual([1, 0]);
    expect([b.speed, b.left, b.dmg, b.kind]).toEqual([300, 300, 20, XA]);
    const fx = boltFx(t);
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ kind: "bolt", angle: 0, speed: 300, range: 300 });
  });

  it("đủ MAX_BOLTS thì bỏ đạn mới (không ném lỗi, không gửi fx)", () => {
    const t = setup(200);
    for (let i = 0; i < MAX_BOLTS; i++)
      expect(fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0)).toBe(true);
    t.fx.length = 0;
    expect(fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0)).toBe(false);
    expect(t.w.bolts).toHaveLength(MAX_BOLTS);
    expect(t.fx).toHaveLength(0);
  });

  it("mặc định tốc độ / tầm khi dữ liệu bỏ trống; fx `bolt` có tầm nhìn bằng `range`", () => {
    const def = ranged({ boltSpeed: undefined, boltRange: undefined });
    expect([boltSpeedOf(def), boltRangeOf(def)]).toEqual([DEFAULT_BOLT_SPEED, DEFAULT_BOLT_RANGE]);
    expect(fxReachOf({ kind: "bolt", x: 0, y: 0, angle: 0, speed: 240, range: 280 })).toBe(280);
    expect(isRanged(def)).toBe(true);
    expect(isRanged(MONSTER_BY_ID.lang)).toBe(false);
  });
});

describe("tickBolts", () => {
  it("bay đúng speed x dt mỗi tick, hết tầm thì biến mất (không bay quá tầm)", () => {
    const t = setup(200);
    t.p.x += 5000; // người chơi ở rất xa: không trúng
    fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0);
    const x0 = t.w.bolts[0].x;
    tickBolts(t.w, 0.05);
    expect(t.w.bolts[0].x).toBeCloseTo(x0 + 15, 6); // 300 x 0,05
    expect(t.w.bolts[0].left).toBeCloseTo(285, 6);
    for (let i = 0; i < 18; i++) tickBolts(t.w, 0.05);
    expect(t.w.bolts).toHaveLength(1); // còn 15 px
    tickBolts(t.w, 0.05);
    expect(t.w.bolts).toHaveLength(0);
  });

  it("trúng người đứng trên đường bay: trừ đúng atk, mất đạn; bắn trượt (người đứng lệch quá bán kính trúng) thì bay qua", () => {
    const t = setup(200);
    fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0);
    const hp0 = t.p.hp;
    for (let i = 0; i < 20 && t.w.bolts.length > 0; i++) tickBolts(t.w, 0.05);
    expect(t.w.bolts).toHaveLength(0);
    expect(hp0 - t.p.hp).toBe(20);
    expect(t.dmgs.some((d) => d.toPlayer && d.amount === 20)).toBe(true);

    const s = setup(200);
    s.p.y += PLAYER_RADIUS + BOLT_RADIUS + 3; // đi ngang ra khỏi đường đạn
    fireBolt(s.w, s.mon.m, MONSTER_BY_ID[XA], 0);
    const hs = s.p.hp;
    for (let i = 0; i < 20; i++) tickBolts(s.w, 0.05);
    expect(s.p.hp).toBe(hs);
    expect(s.w.bolts).toHaveLength(0); // hết tầm
  });

  it("đạn nhanh không xuyên qua người (kiểm theo ĐOẠN bay, không theo điểm cuối)", () => {
    const t = setup(170, { boltSpeed: 4000, boltRange: 400 }); // một tick bay 200 px: điểm cuối nằm 30 px SAU người chơi (ngoài bán kính trúng)
    fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0);
    const hp0 = t.p.hp;
    tickBolts(t.w, 0.05); // 200 px một tick, bước qua người chơi
    expect(hp0 - t.p.hp).toBe(20);
    expect(t.w.bolts).toHaveLength(0);
  });

  it("một đạn một người: hai người xếp hàng trên đường bay thì chỉ người đứng trước trúng", () => {
    const t = setup(200);
    const b = addPlayer(t.w, "b", 1, 0);
    b.p.x = t.p.x + 60;
    b.p.y = t.p.y;
    fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0);
    const [hpA, hpB] = [t.p.hp, b.p.hp];
    for (let i = 0; i < 30; i++) tickBolts(t.w, 0.05);
    expect(t.p.hp).toBeLessThan(hpA);
    expect(b.p.hp).toBe(hpB);
  });

  it("không trúng người trong khu an toàn (trấn); người chết không bị trúng", () => {
    const t = setup(200);
    t.p.x = t.w.map.townPx.x;
    t.p.y = t.w.map.townPx.y;
    t.mon.m.x = t.p.x - 200;
    t.mon.m.y = t.p.y;
    fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0);
    const hp0 = t.p.hp;
    for (let i = 0; i < 20; i++) tickBolts(t.w, 0.05);
    expect(t.p.hp).toBe(hp0);

    const d = setup(200);
    d.p.dead = true;
    fireBolt(d.w, d.mon.m, MONSTER_BY_ID[XA], 0);
    const hd = d.p.hp;
    for (let i = 0; i < 20; i++) tickBolts(d.w, 0.05);
    expect(d.p.hp).toBe(hd);
  });

  it("dừng ở ô chặn: đạn bắn vào tường biến mất, người đứng sau tường không bị trúng", () => {
    const t = setup(200);
    // Tìm một điểm chặn gần nhất bên phải người chơi và đặt người chơi sau nó
    let wallX = -1;
    for (let x = t.p.x; x < t.p.x + 3000; x += 8) {
      if (t.w.map.isBlockedPx(x, t.p.y)) {
        wallX = x;
        break;
      }
    }
    expect(wallX).toBeGreaterThan(0);
    t.w.bolts.push({
      x: wallX - 20,
      y: t.p.y,
      ux: 1,
      uy: 0,
      speed: 300,
      left: 300,
      dmg: 20,
      kind: XA,
    });
    t.p.x = wallX + 200;
    const hp0 = t.p.hp;
    for (let i = 0; i < 20; i++) tickBolts(t.w, 0.05);
    expect(t.w.bolts).toHaveLength(0);
    expect(t.p.hp).toBe(hp0);
  });

  /** Tường MỎNG nhất theo hàng ngang (dải chặn <= một ô, hai bên thoáng 80 px): [x đầu, x cuối] của dải và hàng y. Bản đồ sinh theo hạt giống nên tất định. */
  function thinWall(t: ReturnType<typeof setup>) {
    for (let y = 64; y < t.w.map.worldH - 64; y += 16) {
      for (let x = 64; x < t.w.map.worldW - 200; x += 4) {
        if (t.w.map.isBlockedPx(x, y) || !t.w.map.isBlockedPx(x + 4, y)) continue;
        let x1 = x + 4;
        while (t.w.map.isBlockedPx(x1, y)) x1 += 4;
        let clear = true;
        for (let k = 1; k <= 20; k++)
          if (t.w.map.isBlockedPx(x - k * 4, y) || t.w.map.isBlockedPx(x1 + k * 4, y))
            clear = false;
        if (clear && x1 - (x + 4) <= TILE) return { x0: x + 4, x1, y };
      }
    }
    return null;
  }

  it("đạn NHANH (> một ô mỗi tick) không nhảy qua tường mỏng: người đứng ngay sau tường không bị trúng (hồi quy #599 review B)", () => {
    const t = setup(200);
    const wall = thinWall(t);
    expect(wall, "bản đồ phải có tường mỏng một ô").not.toBeNull();
    const speed = 1200; // 60 px mỗi tick > TILE (32)
    t.p.x = wall!.x1 + 12; // ngay sau tường, nằm trong bước nhảy của đạn
    t.p.y = wall!.y;
    t.w.bolts.push({
      x: wall!.x0 - 2,
      y: wall!.y,
      ux: 1,
      uy: 0,
      speed,
      left: 600,
      dmg: 20,
      kind: XA,
    });
    const hp0 = t.p.hp;
    for (let i = 0; i < 10; i++) tickBolts(t.w, 0.05);
    expect(t.w.bolts).toHaveLength(0);
    expect(t.p.hp).toBe(hp0);
  });

  it("người đứng ngay TRƯỚC tường vẫn bị trúng ở tick đạn chạm tường (không mất đòn vì điểm cuối nằm trong tường)", () => {
    const t = setup(200);
    const wall = thinWall(t);
    expect(wall).not.toBeNull();
    t.p.x = wall!.x0 - 12;
    t.p.y = wall!.y;
    t.w.bolts.push({
      x: wall!.x0 - 44,
      y: wall!.y,
      ux: 1,
      uy: 0,
      speed: 1200,
      left: 600,
      dmg: 20,
      kind: XA,
    });
    const hp0 = t.p.hp;
    tickBolts(t.w, 0.05);
    expect(t.w.bolts).toHaveLength(0);
    expect(t.p.hp).toBeLessThan(hp0);
  });

  it("tốc độ không dương / không phải số: đạn bị bỏ, không treo vòng quét", () => {
    const t = setup(200);
    for (const speed of [0, -5, Number.NaN]) {
      t.w.bolts.push({
        x: t.p.x - 100,
        y: t.p.y,
        ux: 1,
        uy: 0,
        speed,
        left: 300,
        dmg: 20,
        kind: XA,
      });
    }
    const hp0 = t.p.hp;
    expect(() => tickBolts(t.w, 0.05)).not.toThrow();
    expect(t.w.bolts).toHaveLength(0);
    expect(t.p.hp).toBe(hp0);
  });

  it("danh sách rỗng thì không tốn gì và không ném lỗi", () => {
    const t = setup(200);
    expect(() => tickBolts(t.w, 0.05)).not.toThrow();
    expect(t.w.bolts).toHaveLength(0);
  });
});

describe("rangedStep: giữ khoảng cách", () => {
  const range = 300;
  it("quá xa (> 0,85 tầm): đuổi theo, chưa bắn", () => {
    const t = setup(range * BOLT_HOLD_MAX + 40);
    const d = Math.hypot(t.p.x - t.mon.m.x, t.p.y - t.mon.m.y);
    const mv = rangedStep(t.w, t.mon.m, t.mon.mc, t.p, d, false);
    expect(mv.speed).toBe(MONSTER_BY_ID[XA].speed);
    expect([mv.tx, mv.ty]).toEqual([t.p.x, t.p.y]);
    expect(t.w.bolts).toHaveLength(0);
  });

  it("trong dải bắn: đứng yên, bắn MỘT đạn rồi chờ `attackCd`; hết hồi thì bắn tiếp", () => {
    const t = setup(200);
    const d = 200;
    const mv = rangedStep(t.w, t.mon.m, t.mon.mc, t.p, d, false);
    expect(mv.speed).toBe(0);
    expect(t.w.bolts).toHaveLength(1);
    expect(t.mon.mc.nextAttack).toBe(t.w.now + 1000);
    rangedStep(t.w, t.mon.m, t.mon.mc, t.p, d, false);
    expect(t.w.bolts).toHaveLength(1); // chưa hết hồi
    t.w.now += 1000;
    rangedStep(t.w, t.mon.m, t.mon.mc, t.p, d, false);
    expect(t.w.bolts).toHaveLength(2);
  });

  it("mục tiêu áp sát (< 0,3 tầm): lùi ra xa (tốc độ x BOLT_RETREAT_MULT) mà vẫn bắn", () => {
    const gap = range * BOLT_HOLD_MIN - 20;
    const t = setup(gap);
    const mv = rangedStep(t.w, t.mon.m, t.mon.mc, t.p, gap, false);
    expect(mv.speed).toBeCloseTo(MONSTER_BY_ID[XA].speed * BOLT_RETREAT_MULT, 6);
    expect(mv.tx).toBeLessThan(t.mon.m.x); // người chơi ở bên phải, quái lùi sang trái
    expect(t.w.bolts).toHaveLength(1);
  });

  it("choáng thì không bắn", () => {
    const t = setup(200);
    rangedStep(t.w, t.mon.m, t.mon.mc, t.p, 200, true);
    expect(t.w.bolts).toHaveLength(0);
  });
});

describe("nối vào vòng tick: quái thật bắn người chơi", () => {
  it("quái tầm xa thấy người chơi thì đứng ở tầm, bắn đạn bay tới trúng người đứng yên; người đi ngang tránh được", () => {
    const hit = setup(280);
    hit.w.now = 10_000;
    let shots = 0;
    for (let i = 0; i < 120; i++) {
      hit.w.now += 50;
      tickWorld(hit.w, 50);
      shots = boltFx(hit).length;
    }
    expect(shots).toBeGreaterThanOrEqual(2); // hồi 1 giây, ~6 giây mô phỏng
    expect(hit.p.hp).toBeLessThan(hit.p.maxHp); // đứng yên: dính đạn

    const dodge = setup(280);
    dodge.w.now = 10_000;
    for (let i = 0; i < 120; i++) {
      dodge.w.now += 50;
      // Người chơi liên tục đi ngang (lên xuống) ra khỏi đường đạn
      dodge.p.y += i % 40 < 20 ? 6 : -6;
      tickWorld(dodge.w, 50);
    }
    expect(boltFx(dodge).length).toBeGreaterThanOrEqual(2);
    expect(dodge.p.hp).toBeGreaterThanOrEqual(hit.p.hp); // né giỏi hơn đứng yên
  });
});

describe("quái `poisoner`: độc đi kèm đòn / đạn TRÚNG (M7.3)", () => {
  const poisonOf = (c: { st?: { list: { id: string; dps: number }[] } }) =>
    c.st?.list.find((s) => s.id === "poison");

  it("onHitEffectOf: chỉ `poisoner` có hiệu ứng (độc); `isRanged`: `ranged` luôn, `poisoner` chỉ khi có `boltRange`", () => {
    const doc = ranged({ behavior: "poisoner" });
    expect(onHitEffectOf(doc)).toBe(POISON_EFFECT);
    expect(onHitEffectOf(ranged({ behavior: "ranged" }))).toBeUndefined();
    expect(onHitEffectOf(MONSTER_BY_ID.lang)).toBeUndefined();
    expect(isRanged(doc)).toBe(true); // có boltRange
    expect(isRanged(ranged({ behavior: "poisoner", boltRange: undefined }))).toBe(false);
    expect(isRanged(ranged({ behavior: "ranged" }))).toBe(true);
    expect(isRanged(MONSTER_BY_ID.lang)).toBe(false);
  });

  it("đạn của `poisoner` trúng: trừ atk VÀ gắn độc (dps = ratio x atk); đạn của `ranged` thường trúng thì không gắn gì", () => {
    const t = setup(200, { behavior: "poisoner" });
    fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0);
    for (let i = 0; i < 20 && t.w.bolts.length > 0; i++) tickBolts(t.w, 0.05);
    const s = poisonOf(t.c)!;
    expect(s).toBeDefined();
    expect(s.dps).toBeCloseTo(POISON_EFFECT.ratio * 20, 6); // atk thử = 20
    expect(t.statusMsgs.length).toBeGreaterThan(0); // chủ nhận danh sách trạng thái mới

    const plain = setup(200);
    fireBolt(plain.w, plain.mon.m, MONSTER_BY_ID[XA], 0);
    for (let i = 0; i < 20 && plain.w.bolts.length > 0; i++) tickBolts(plain.w, 0.05);
    expect(plain.p.hp).toBeLessThan(plain.p.maxHp); // vẫn bị trừ
    expect(poisonOf(plain.c)).toBeUndefined();
  });

  it("đạn độc bị né (`dodgeUntil`) hoặc người đang thách đấu: KHÔNG trúng nên KHÔNG dính độc", () => {
    const t = setup(200, { behavior: "poisoner" });
    t.c.dodgeUntil = t.w.now + 5000; // đang né
    fireBolt(t.w, t.mon.m, MONSTER_BY_ID[XA], 0);
    const hp0 = t.p.hp;
    for (let i = 0; i < 20; i++) tickBolts(t.w, 0.05);
    expect(t.p.hp).toBe(hp0);
    expect(poisonOf(t.c)).toBeUndefined();
  });

  it("đòn GẦN của `poisoner` (không `boltRange`) trúng thì gắn độc; độc một mình không giết người (khí huyết dừng ở 1)", () => {
    const t = setup(30, {
      behavior: "poisoner",
      boltRange: undefined,
      boltSpeed: undefined,
      atk: 40,
    });
    t.w.now = 10_000;
    for (let i = 0; i < 60 && poisonOf(t.c) === undefined; i++) {
      t.w.now += 50;
      tickWorld(t.w, 50);
    }
    expect(poisonOf(t.c)).toBeDefined();
    expect(t.p.hp).toBeLessThan(t.p.maxHp);
    // Quái biến mất (không còn đòn nào nữa): chỉ còn độc, khí huyết rất thấp
    t.w.state.monsters.clear();
    t.w.mctrl.clear();
    t.p.hp = 5;
    for (let i = 0; i < 120; i++) {
      t.w.now += 50;
      tickWorld(t.w, 50);
    }
    expect(t.p.dead).toBe(false);
    expect(t.c.limbo).toBeUndefined();
    expect(t.p.hp).toBeGreaterThanOrEqual(1);
    expect(poisonOf(t.c)).toBeUndefined(); // độc đã hết hạn
  });

  it("hurtPlayer trả true khi đòn trúng (kể cả khiên đỡ hết) và false khi người chết / hồn lìa xác / đang né", () => {
    const t = setup(200);
    const m = addMonster(t.w, "lang", 0, 0);
    expect(hurtPlayer(t.w, "a", t.p, 1, m.m)).toBe(true);
    t.c.dodgeUntil = t.w.now + 5000;
    expect(hurtPlayer(t.w, "a", t.p, 1, m.m)).toBe(false);
    t.c.dodgeUntil = undefined;
    t.w.ghosts.add("a");
    expect(hurtPlayer(t.w, "a", t.p, 1, m.m)).toBe(false);
    t.w.ghosts.delete("a");
    t.p.dead = true;
    expect(hurtPlayer(t.w, "a", t.p, 1, m.m)).toBe(false);
  });
});
