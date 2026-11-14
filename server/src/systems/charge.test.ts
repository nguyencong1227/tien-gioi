// Quái `charger` (M7.3, #504): gồng báo trước, lao thẳng theo hướng khoá, trúng theo vị trí LÚC ĐÁP ĐÒN, choáng ngắt gồng, thở sau khi lao.
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID, PLAYER_RADIUS, type FxMsg, type MonsterKind } from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { tickMonsters } from "./monsters";
import { applyMonsterStatus } from "./status";
import { CHARGE_LEN, CHARGE_MULT, CHARGE_RECOVER_MS, CHARGE_TRIGGER, CHARGE_WIDTH } from "./charge";
import type { World } from "../world";

const TICK_MS = 50;
const WINDUP = 800;
/** Hôi Lang làm quái lao: số liệu thật của loài, chỉ thêm hành vi (M7.3 áp lên quái cũ ở bước sau). */
const CHARGER: MonsterKind = { ...MONSTER_BY_ID.lang, behavior: "charger", windupMs: WINDUP };

/** Một đoạn nằm ngang đủ thoáng (không vật cản, không khu an toàn) rộng 700 px quanh (x, y): chỗ đặt quái và người chơi. Quét cả bản đồ, kết quả cố định. */
function openSpot(w: World): { x: number; y: number } {
  const HALF = 350;
  for (let y = 200; y < w.map.worldH - 200; y += 64)
    for (let x = HALF + 100; x < w.map.worldW - HALF - 100; x += 64) {
      let ok = true;
      for (let k = -HALF; k <= HALF && ok; k += 16)
        if (w.map.circleBlocked(x + k, y, 18) || w.map.inSafe(x + k, y, 80)) ok = false;
      // dải rộng thêm 60 px hai bên cho bài "né" (đi ngang)
      for (const dy of [-60, 60]) if (ok && w.map.circleBlocked(x, y + dy, 18)) ok = false;
      if (ok) return { x, y };
    }
  throw new Error("không có chỗ trống cho test");
}

/**
 * Chỗ có TƯỜNG ở phía trước: quái đứng ở (xm, y), đường bên phải thoáng tới khi gặp ô chặn cách `xm` đúng `wallAt` px (trong [190, 240], ngắn hơn
 * CHARGE_LEN) nên cú lao PHẢI dừng sát tường. Quét cả bản đồ, kết quả cố định.
 */
function wallSpot(w: World): { xm: number; y: number; wallX: number } {
  const r = CHARGER.radius * 0.8;
  for (let y = 200; y < w.map.worldH - 200; y += 32)
    for (let xm = 150; xm < w.map.worldW - 400; xm += 16) {
      let clear = true;
      let wallX = -1;
      for (let d = 0; d <= 240; d += 4) {
        if (w.map.circleBlocked(xm + d, y, r)) {
          wallX = xm + d;
          break;
        }
        if (w.map.inSafe(xm + d, y, CHARGER.radius + 60)) clear = false;
      }
      if (clear && wallX > 0 && wallX - xm >= 190 && !w.map.inSafe(xm, y, 80))
        return { xm, y, wallX };
    }
  throw new Error("không có chỗ có tường cho test");
}

/** Dựng: người chơi ở (x, y), quái lao ở bên trái cách `gap` px, đã dùng số liệu CHARGER. */
function scene(gap = 150) {
  const h = makeWorld();
  const { w } = h;
  w.now = 10_000;
  const spot = openSpot(w);
  const { p, c } = addPlayer(w, "a", 3, 0);
  p.x = spot.x;
  p.y = spot.y;
  p.hp = p.maxHp;
  const mon = addMonster(w, "lang", spot.x - gap, spot.y);
  mon.mc.def = CHARGER;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      w.now += TICK_MS;
      tickMonsters(w, TICK_MS / 1000);
    }
  };
  const warns = () => h.fx.filter((f): f is Extract<FxMsg, { kind: "warn" }> => f.kind === "warn");
  return { h, w, p, c, mon, tick, warns, spot };
}

/** Số tick tới sát lúc đáp đòn (gồng xong). */
const WINDUP_TICKS = WINDUP / TICK_MS;

describe("charger: gồng báo trước (M7.3)", () => {
  it("thấy người trong tầm thì đứng gồng và gửi ĐÚNG MỘT `warn` đường thẳng: vị trí quái, dài CHARGE_LEN, rộng CHARGE_WIDTH, hướng về người, thời gian = windupMs", () => {
    const { mon, tick, warns, p } = scene();
    tick();
    expect(warns()).toHaveLength(1);
    const wn = warns()[0];
    expect(wn).toMatchObject({
      kind: "warn",
      shape: "line",
      r: CHARGE_LEN,
      w: CHARGE_WIDTH,
      ms: WINDUP,
    });
    expect(wn.x).toBeCloseTo(mon.m.x, 5);
    expect(wn.y).toBeCloseTo(mon.m.y, 5);
    expect(wn.angle).toBeCloseTo(0, 5); // người ở bên phải quái
    expect(mon.mc.ai?.phase).toBe("windup");
    expect(p.hp).toBe(p.maxHp); // chưa gây sát thương lúc gồng
    tick(WINDUP_TICKS - 2);
    expect(warns()).toHaveLength(1); // không báo lại trong lúc gồng
  });

  it("trong lúc gồng quái ĐỨNG YÊN (không tiến lại gần, không đánh thường)", () => {
    const { mon, tick, p } = scene();
    const x0 = mon.m.x;
    tick(WINDUP_TICKS - 2);
    expect(mon.m.x).toBe(x0);
    expect(p.hp).toBe(p.maxHp);
  });

  it("quá xa (> CHARGE_TRIGGER) thì chưa gồng, cứ đuổi như quái thường; sát người (trong tầm đánh) thì đánh thường, không gồng", () => {
    const far = scene(CHARGE_TRIGGER + 2);
    far.mon.mc.def = { ...CHARGER, aggro: 1000 };
    far.tick();
    expect(far.warns()).toHaveLength(0);
    expect(far.mon.mc.ai).toBeUndefined();

    const near = scene(PLAYER_RADIUS + CHARGER.attackRange - 2);
    near.tick();
    expect(near.warns()).toHaveLength(0);
    expect(near.p.hp).toBeLessThan(near.p.maxHp); // đòn thường đã trúng
  });

  it("quái cận chiến (`melee`, mặc định của quái cũ khác) không bao giờ gồng: đuổi và đánh gần như trước M7", () => {
    const { mon, tick, warns } = scene(100);
    mon.mc.def = { ...MONSTER_BY_ID.lang, behavior: "melee" };
    tick(WINDUP_TICKS + 20);
    expect(warns()).toHaveLength(0);
    expect(mon.mc.ai).toBeUndefined();
  });
});

describe("charger: đáp đòn theo vị trí LÚC ĐÁP (M7.3)", () => {
  it("đứng yên thì TRÚNG: mất đúng round(atk x CHARGE_MULT) khí huyết, quái lao tới vị trí người (quãng tối đa CHARGE_LEN)", () => {
    const { mon, p, tick } = scene();
    const x0 = mon.m.x;
    tick(WINDUP_TICKS + 1);
    // hệ số viết thẳng 1,5 (không dùng hằng CHARGE_MULT: sửa hằng thì test phải đỏ, đây là luật "đòn lao mạnh gấp rưỡi đòn thường")
    expect(p.maxHp - p.hp).toBe(Math.round(CHARGER.atk * 1.5));
    expect(CHARGE_MULT).toBe(1.5);
    expect(mon.m.x).toBeGreaterThan(x0 + 100); // đã lao tới
    expect(mon.m.x - x0).toBeLessThanOrEqual(CHARGE_LEN + 1);
    expect(mon.mc.ai?.phase).toBe("recover");
  });

  it("NÉ: đi ngang ra khỏi đường lao trong lúc gồng thì KHÔNG trúng (hướng đã khoá lúc bắt đầu)", () => {
    const { p, tick, mon } = scene();
    tick(); // bắt đầu gồng, hướng khoá về chỗ người đang đứng
    const side = CHARGE_WIDTH / 2 + PLAYER_RADIUS + 40;
    for (let i = 0; i < WINDUP_TICKS; i++) {
      p.y += side / WINDUP_TICKS;
      tick();
    }
    expect(p.hp).toBe(p.maxHp);
    expect(mon.mc.ai?.phase).toBe("recover"); // quái đã lao hụt
  });

  it("chỉ đứng sát mép đường lao (trong nửa bề rộng + bán kính) vẫn trúng", () => {
    const { p, tick } = scene();
    tick();
    p.y += CHARGE_WIDTH / 2 + PLAYER_RADIUS - 4;
    tick(WINDUP_TICKS);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it("đứng NGAY NGOÀI mép (nửa bề rộng + bán kính + 4 px) thì KHÔNG trúng", () => {
    const { p, tick } = scene();
    tick();
    p.y += CHARGE_WIDTH / 2 + PLAYER_RADIUS + 4;
    tick(WINDUP_TICKS);
    expect(p.hp).toBe(p.maxHp);
  });

  it("cú lao DỪNG SÁT TƯỜNG (không xuyên ô chặn) và vẫn trúng người đứng trước tường", () => {
    const h = makeWorld();
    const { w } = h;
    w.now = 10_000;
    const spot = wallSpot(w);
    const { p } = addPlayer(w, "a", 3, 0);
    p.x = spot.xm + 120; // trước tường, trong đường lao
    p.y = spot.y;
    p.hp = p.maxHp;
    const mon = addMonster(w, "lang", spot.xm, spot.y);
    mon.mc.def = CHARGER;
    for (let i = 0; i < WINDUP_TICKS + 1; i++) {
      w.now += TICK_MS;
      tickMonsters(w, TICK_MS / 1000);
    }
    expect(mon.mc.ai?.phase).toBe("recover");
    expect(mon.m.x).toBeLessThan(spot.wallX); // không xuyên tường
    expect(mon.m.x - spot.xm).toBeLessThan(CHARGE_LEN - 20); // dừng ngắn hơn quãng lao đầy đủ
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it("trúng cả người KHÁC nằm trên đường lao (không chỉ mục tiêu)", () => {
    const { w, p, tick, spot } = scene();
    const { p: q } = addPlayer(w, "b", 3, 0);
    q.x = spot.x - 60; // giữa quái và mục tiêu
    q.y = spot.y;
    q.hp = q.maxHp;
    tick(WINDUP_TICKS + 1);
    expect(q.hp).toBeLessThan(q.maxHp);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it("người đã chết / hồn lìa xác nằm TRÊN đường lao không bị trúng (mục tiêu sống vẫn trúng)", () => {
    const { w, p, tick, spot } = scene();
    const dead = addPlayer(w, "dead", 3, 0).p;
    const ghost = addPlayer(w, "ghost", 3, 0).p;
    for (const [q, dx] of [
      [dead, -80],
      [ghost, -50],
    ] as const) {
      q.x = spot.x + dx; // giữa quái và mục tiêu, trên đường lao
      q.y = spot.y;
      q.hp = q.maxHp;
    }
    dead.dead = true;
    w.ghosts.add("ghost");
    tick(WINDUP_TICKS + 1);
    expect(p.hp).toBeLessThan(p.maxHp);
    expect(dead.hp).toBe(dead.maxHp);
    expect(ghost.hp).toBe(ghost.maxHp);
  });

  it("người đứng TRONG khu an toàn (trấn) sát đường lao không bị trúng, dù cú lao dừng ngay rìa khu", () => {
    const h = makeWorld();
    const { w } = h;
    w.now = 10_000;
    const t = w.map.townPx;
    // mục tiêu ngay NGOÀI khu an toàn (lề 20 px), người đứng bên trong khu cách đó ~20 px, quái ở xa hơn phía đông, lao về hướng tây
    const { p } = addPlayer(w, "a", 3, 0);
    p.x = t.x + t.r + 25;
    p.y = t.y;
    p.hp = p.maxHp;
    const { p: q } = addPlayer(w, "b", 3, 0);
    q.x = t.x + t.r + 5; // trong lề an toàn 20 px của trấn; cú lao dừng ở k ~ 31 nên người này cách điểm cuối ~26 px < nửa bề rộng + bán kính
    q.y = t.y;
    q.hp = q.maxHp;
    expect(w.map.inSafe(q.x, q.y, 20)).toBe(true);
    expect(w.map.inSafe(p.x, p.y, 20)).toBe(false);
    const mon = addMonster(w, "lang", p.x + 150, p.y);
    mon.mc.def = CHARGER;
    for (let i = 0; i < WINDUP_TICKS + 1; i++) {
      w.now += TICK_MS;
      tickMonsters(w, TICK_MS / 1000);
    }
    expect(mon.mc.ai?.phase).toBe("recover");
    expect(p.hp).toBeLessThan(p.maxHp); // mục tiêu ngoài khu vẫn trúng
    expect(q.hp).toBe(q.maxHp); // người trong khu thì không
  });

  it("mất mục tiêu giữa lúc gồng (người chơi chết hoặc rời đi) thì bỏ đòn: không lao, không sát thương, `ai` xoá", () => {
    const { w, mon, p, tick } = scene();
    tick();
    expect(mon.mc.ai?.phase).toBe("windup");
    w.state.players.delete("a");
    w.ctrl.delete("a");
    const x0 = mon.m.x;
    tick(WINDUP_TICKS + 2);
    expect(mon.mc.ai).toBeUndefined();
    expect(mon.m.x).toBe(x0);
    expect(p.hp).toBe(p.maxHp);
  });
});

describe("charger: choáng ngắt gồng, thở sau khi lao (M7.3)", () => {
  it("choáng giữa lúc gồng HUỶ đòn (không lao, không sát thương) và phạt chờ lâu hơn đòn thường", () => {
    const { w, mon, p, tick } = scene();
    tick(3);
    expect(mon.mc.ai?.phase).toBe("windup");
    applyMonsterStatus(
      w,
      mon.id,
      { status: "stun", ms: 1500, ratio: 0, chance: 1 },
      0,
      "a",
      () => 0,
    );
    const x0 = mon.m.x;
    tick(WINDUP_TICKS);
    expect(mon.mc.ai).toBeUndefined();
    expect(mon.m.x).toBe(x0);
    expect(p.hp).toBe(p.maxHp);
    expect(mon.mc.nextAttack).toBeGreaterThanOrEqual(
      w.now - TICK_MS * WINDUP_TICKS + CHARGER.attackCd * 3,
    );
  });

  it("sau khi lao đứng THỞ CHARGE_RECOVER_MS (không đánh, không gồng lại), rồi chờ hồi chiêu trước cú lao kế", () => {
    const { mon, tick, warns, p } = scene(150);
    tick(WINDUP_TICKS + 1); // lao
    expect(mon.mc.ai?.phase).toBe("recover");
    const hpAfter = p.hp;
    const x1 = mon.m.x;
    tick(CHARGE_RECOVER_MS / TICK_MS - 2);
    expect(mon.m.x).toBe(x1);
    expect(p.hp).toBe(hpAfter);
    expect(warns()).toHaveLength(1);
    // thở xong: `ai` xoá và `nextAttack` đặt xa (cú lao kế không tới ngay)
    tick(4);
    expect(mon.mc.ai).toBeUndefined();
    expect(mon.mc.nextAttack).toBeGreaterThan(0);
  });
});

describe("charger: áp lên quái cũ (M7.3, số khởi đầu)", () => {
  it("Hôi Lang và Hắc Hổ là charger có thời gian gồng; Linh Thố và Xích Mãng (trùm) chưa đổi hành vi", () => {
    expect(MONSTER_BY_ID.lang).toMatchObject({ behavior: "charger", windupMs: 700 });
    expect(MONSTER_BY_ID.ho).toMatchObject({ behavior: "charger", windupMs: 900 });
    expect(MONSTER_BY_ID.tho.behavior).toBeUndefined();
    expect(MONSTER_BY_ID.mang.behavior).toBeUndefined();
  });

  it("thời gian gồng của mọi charger đủ để người chơi tránh (>= 600 ms) và không quá dài (<= 1200 ms): luật mục 6 của kế hoạch M7", () => {
    for (const d of Object.values(MONSTER_BY_ID))
      if (d.behavior === "charger") {
        expect(d.windupMs ?? 0).toBeGreaterThanOrEqual(600);
        expect(d.windupMs ?? 0).toBeLessThanOrEqual(1200);
      }
  });

  it("Hôi Lang THẬT (số liệu trong MONSTERS) gồng khi thấy người rồi lao: đúng MỘT warn dài theo hằng, ms = 700, lao trúng người đứng yên", () => {
    const h = makeWorld();
    const { w } = h;
    w.now = 10_000;
    const spot = openSpot(w);
    const { p } = addPlayer(w, "a", 3, 0);
    p.x = spot.x;
    p.y = spot.y;
    p.hp = p.maxHp;
    addMonster(w, "lang", spot.x - 150, spot.y); // KHÔNG đổi def: dùng đúng số liệu thật
    for (let i = 0; i < 700 / TICK_MS + 2; i++) {
      w.now += TICK_MS;
      tickMonsters(w, TICK_MS / 1000);
    }
    const warn = h.fx.filter((f) => f.kind === "warn");
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatchObject({ shape: "line", ms: 700, r: CHARGE_LEN });
    expect(p.hp).toBeLessThan(p.maxHp);
  });
});
