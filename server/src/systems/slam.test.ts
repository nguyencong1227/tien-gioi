// Đập đất của quái (M7.3, #504): gồng báo trước bằng vòng tròn, trúng theo vị trí LÚC ĐÁP, bước ra là tránh được, choáng ngắt gồng, hồi giữa hai lần.
import { describe, expect, it } from "vitest";
import {
  MONSTER_BY_ID,
  MONSTERS,
  PLAYER_RADIUS,
  type FxMsg,
  type MonsterKind,
} from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { tickMonsters } from "./monsters";
import { applyMonsterStatus } from "./status";
import type { World } from "../world";

const TICK_MS = 50;
/** Cốt Tượng THẬT (số liệu `MONSTERS`): cận chiến chậm + đập đất 1100 ms / vòng 90 px / x2 / hồi 6000 ms. */
const CT = MONSTER_BY_ID.cot_tuong;
const SLAM = CT.slam!;

/** Chỗ thoáng 700 px ngang quanh (x, y), không khu an toàn: quét cả bản đồ, kết quả cố định. */
function openSpot(w: World): { x: number; y: number } {
  const HALF = 350;
  for (let y = 200; y < w.map.worldH - 200; y += 64)
    for (let x = HALF + 100; x < w.map.worldW - HALF - 100; x += 64) {
      let ok = true;
      for (let k = -HALF; k <= HALF && ok; k += 16)
        if (w.map.circleBlocked(x + k, y, 24) || w.map.inSafe(x + k, y, 80)) ok = false;
      for (const dy of [-60, 60]) if (ok && w.map.circleBlocked(x, y + dy, 24)) ok = false;
      if (ok) return { x, y };
    }
  throw new Error("không có chỗ trống cho test");
}

/** Cảnh: người chơi ở (x, y), Cốt Tượng thật đứng bên trái cách `gap` px. */
function scene(gap = 70, kind: MonsterKind = CT) {
  const h = makeWorld();
  const { w } = h;
  w.now = 10_000;
  const spot = openSpot(w);
  const { p, c } = addPlayer(w, "a", 4, 0);
  p.x = spot.x;
  p.y = spot.y;
  p.hp = p.maxHp = 100_000; // đủ trâu để không chết, đo bằng hiệu số
  const mon = addMonster(w, kind.id, spot.x - gap, spot.y);
  mon.mc.def = kind;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      w.now += TICK_MS;
      tickMonsters(w, TICK_MS / 1000);
    }
  };
  const circles = () =>
    h.fx.filter(
      (f): f is Extract<FxMsg, { kind: "warn" }> => f.kind === "warn" && f.shape === "circle",
    );
  const lines = () =>
    h.fx.filter(
      (f): f is Extract<FxMsg, { kind: "warn" }> => f.kind === "warn" && f.shape === "line",
    );
  return { h, w, p, c, mon, tick, circles, lines, spot };
}

const WINDUP_TICKS = Math.ceil(SLAM.windupMs / TICK_MS);
const DMG = Math.round(CT.atk * SLAM.mult);

describe("đập đất: gồng báo trước", () => {
  it("người chơi vào vòng thì quái đứng gồng và gửi ĐÚNG MỘT `warn` hình tròn: tâm là chỗ quái, bán kính radius, thời gian windupMs", () => {
    const { mon, tick, circles, p } = scene();
    const x0 = mon.m.x;
    const y0 = mon.m.y;
    tick(1);
    expect(circles()).toHaveLength(1);
    expect(circles()[0]).toMatchObject({
      shape: "circle",
      x: x0,
      y: y0,
      r: SLAM.radius,
      ms: SLAM.windupMs,
    });
    expect(mon.mc.slam).toBeDefined();
    tick(WINDUP_TICKS - 3); // còn đang gồng
    expect(circles()).toHaveLength(1); // không báo lặp
    expect([mon.m.x, mon.m.y]).toEqual([x0, y0]); // đứng yên suốt lúc gồng
    expect(p.hp).toBe(p.maxHp); // chưa mất gì (không đánh thường lúc gồng)
  });

  it("NGƯỠNG bắt đầu gồng khớp vùng trúng: người chơi ở radius + bán kính người chơi - 2 px (đã chạm vòng) thì quái gồng; radius + bán kính người chơi + 4 px thì chưa (nit B ở #629)", () => {
    for (const [gap, starts] of [
      [SLAM.radius + PLAYER_RADIUS - 2, true],
      [SLAM.radius + 5, true], // đã nằm giữa `radius` và `radius + PLAYER_RADIUS`: vùng trúng đã chạm người, nên phải báo trước
      [SLAM.radius + PLAYER_RADIUS + 4, false],
    ] as const) {
      const { circles, mon, tick } = scene(gap);
      tick(1);
      expect(circles().length > 0, `cách ${gap} px`).toBe(starts);
      expect(mon.mc.slam !== undefined, `cách ${gap} px`).toBe(starts);
    }
  });

  it("người chơi NGOÀI vòng (radius + bán kính người chơi + 4 px) thì quái chưa gồng, cứ đuổi như quái thường", () => {
    const { mon, tick, circles } = scene(SLAM.radius + PLAYER_RADIUS + 4);
    const x0 = mon.m.x;
    tick(2);
    expect(circles()).toHaveLength(0);
    expect(mon.mc.slam).toBeUndefined();
    expect(mon.m.x).toBeGreaterThan(x0); // đang đuổi
  });
});

describe("đập đất: trúng theo vị trí LÚC ĐÁP (M7.3)", () => {
  it("đứng yên thì TRÚNG đúng một lần: mất round(atk x mult) khí huyết (hệ số viết thẳng x2, không dùng hằng)", () => {
    const { p, tick, mon } = scene();
    tick(WINDUP_TICKS + 1);
    expect(DMG).toBe(Math.round(CT.atk * 2));
    expect(p.maxHp - p.hp).toBe(DMG);
    expect(mon.mc.slam).toBeUndefined();
    expect(mon.mc.nextSlam).toBeGreaterThan(mon.mc.def.slam!.cdMs); // đã đặt hồi
  });

  it("đáp đòn xong quái KHÔNG đánh thường ngay: chờ đủ attackCd rồi mới đánh (nit của B khi xem trùm thật: -642 = đập 432 + đánh thường ~210 liền sau)", () => {
    const { p, tick, mon } = scene();
    tick(WINDUP_TICKS + 1); // tick này đáp đòn
    expect(p.maxHp - p.hp).toBe(DMG);
    const landed = mon.mc.nextSlam! - SLAM.cdMs;
    expect(mon.mc.nextAttack).toBeGreaterThanOrEqual(landed + CT.attackCd);
    // chưa đủ attackCd kể từ lúc đáp: người vẫn đứng sát (70 px) nhưng KHÔNG mất thêm
    tick(Math.floor(CT.attackCd / TICK_MS) - 2);
    expect(p.maxHp - p.hp).toBe(DMG);
    // quá attackCd: đòn thường tiếp tục (quái KHÔNG bị câm vĩnh viễn)
    tick(5);
    expect(p.maxHp - p.hp).toBeGreaterThan(DMG);
  });

  it("trùm Thiên Hàn Vương cũng vậy (lao + đập): sau cú đập người sát tâm không bị đánh thường trong attackCd", () => {
    const boss = MONSTER_BY_ID.thien_han_vuong;
    const { p, tick, mon } = scene(70, boss);
    const dmg = Math.round(boss.atk * boss.slam!.mult);
    tick(Math.ceil(boss.slam!.windupMs / TICK_MS) + 1);
    expect(p.maxHp - p.hp).toBe(dmg);
    tick(Math.floor(boss.attackCd / TICK_MS) - 2);
    expect(p.maxHp - p.hp).toBe(dmg);
    expect(mon.mc.nextAttack).toBeGreaterThan(0);
  });

  it("TRÁNH được: bước ra khỏi vòng trong lúc gồng thì không mất khí huyết", () => {
    const { p, tick, circles } = scene();
    tick(3);
    expect(circles()).toHaveLength(1);
    p.x += SLAM.radius + PLAYER_RADIUS + 30; // ra xa hơn mép vòng (tâm cố định tại chỗ quái lúc gồng)
    tick(WINDUP_TICKS);
    expect(p.hp).toBe(p.maxHp);
  });

  it("mép vòng: đứng ở radius + bán kính người chơi - 2 px (so với tâm lúc gồng) vẫn trúng; + 4 px thì không", () => {
    for (const [off, hit] of [
      [-2, true],
      [4, false],
    ] as const) {
      const { p, tick, mon, w } = scene();
      tick(2); // quái bắt đầu gồng (người đang trong vòng)
      const cx = mon.mc.slam!.x;
      p.x = cx + SLAM.radius + PLAYER_RADIUS + off;
      p.y = mon.mc.slam!.y;
      // giữ quái đứng yên suốt lúc gồng, người chơi vẫn là mục tiêu
      tick(WINDUP_TICKS);
      expect(p.hp < p.maxHp, `lệch ${off}`).toBe(hit);
      expect(w.map.inSafe(p.x, p.y, 20)).toBe(false);
    }
  });

  it("trúng cả người KHÁC trong vòng, không trúng người chết / hồn lìa xác", () => {
    const { w, p, tick, spot } = scene();
    const other = addPlayer(w, "b", 4, 0);
    other.p.x = spot.x - 30;
    other.p.y = spot.y + 20;
    other.p.hp = other.p.maxHp = 100_000;
    const dead = addPlayer(w, "dead", 4, 0);
    dead.p.x = spot.x - 40;
    dead.p.y = spot.y - 20;
    dead.p.dead = true;
    const deadHp = dead.p.hp;
    const ghost = addPlayer(w, "ghost", 4, 0);
    ghost.p.x = spot.x - 35;
    ghost.p.y = spot.y + 30;
    ghost.p.hp = ghost.p.maxHp;
    w.ghosts.add("ghost");
    tick(WINDUP_TICKS + 1);
    expect(p.maxHp - p.hp).toBe(DMG);
    expect(other.p.maxHp - other.p.hp).toBe(DMG);
    expect(dead.p.hp).toBe(deadHp); // người chết không bị đụng tới
    expect(ghost.p.hp).toBe(ghost.p.maxHp);
  });
});

describe("đập đất: choáng, mất mục tiêu, hồi (M7.3)", () => {
  it("choáng giữa lúc gồng HUỶ đòn (không sát thương) và phạt chờ cả cdMs", () => {
    const { w, mon, p, tick } = scene();
    tick(3);
    expect(mon.mc.slam).toBeDefined();
    applyMonsterStatus(
      w,
      mon.id,
      { status: "stun", ms: 1500, ratio: 0, chance: 1 },
      0,
      "a",
      () => 0,
    );
    tick(1);
    expect(mon.mc.slam).toBeUndefined();
    expect(p.hp).toBe(p.maxHp);
    expect(mon.mc.nextSlam!).toBeGreaterThanOrEqual(w.now - TICK_MS + SLAM.cdMs - 1);
    tick(WINDUP_TICKS + 2); // hết choáng nhưng còn đang hồi: không gồng lại
    expect(p.hp).toBe(p.maxHp);
  });

  it("mất mục tiêu giữa lúc gồng (người chơi rời phòng) thì bỏ đòn: không đáp, `slam` xoá", () => {
    const { w, mon, p, tick } = scene();
    tick(3);
    expect(mon.mc.slam).toBeDefined();
    w.state.players.delete("a");
    w.ctrl.delete("a");
    tick(WINDUP_TICKS + 2);
    expect(mon.mc.slam).toBeUndefined();
    expect(p.hp).toBe(p.maxHp);
  });

  it("sau khi đập chờ đủ cdMs rồi mới đập lần hai (một `warn` mới); trước đó không gồng lại dù người chơi vẫn đứng trong vòng", () => {
    const { p, tick, circles, mon } = scene();
    tick(WINDUP_TICKS + 1);
    expect(circles()).toHaveLength(1);
    p.hp = p.maxHp;
    p.x += 0; // vẫn đứng đó
    // trong thời gian hồi: quái đuổi / đánh thường nhưng không đập
    mon.m.x = p.x - 70; // đưa quái về chỗ cũ để người chơi nằm trong vòng
    tick(Math.floor((SLAM.cdMs - 600) / TICK_MS));
    expect(circles()).toHaveLength(1);
    tick(Math.ceil(1200 / TICK_MS));
    expect(circles().length).toBe(2);
  });
});

describe("đập đất: trùm vừa lao vừa đập (M7.3)", () => {
  const BOSS = MONSTER_BY_ID.thien_han_vuong;

  it("trùm Thiên Hàn Vương có đập đất VÀ lao: người sát (trong vòng 140 px) thấy vòng tròn TRƯỚC, người đứng xa (200 px) thấy đường lao, không bao giờ cả hai cùng lúc", () => {
    expect(BOSS.behavior).toBe("charger");
    expect(BOSS.slam).toBeDefined();
    const near = scene(100, BOSS);
    near.tick(2);
    expect(near.circles()).toHaveLength(1);
    expect(near.lines()).toHaveLength(0);
    expect(near.mon.mc.ai).toBeUndefined(); // không vừa gồng đập vừa gồng lao
    const far = scene(200, BOSS);
    far.tick(2);
    expect(far.lines()).toHaveLength(1);
    expect(far.circles()).toHaveLength(0);
    expect(far.mon.mc.slam).toBeUndefined();
  });
});

describe("đập đất: dữ liệu (M7.3)", () => {
  it("quái nào có `slam` thì số liệu hợp lệ: gồng 600-1500 ms (kịp tránh), vòng rộng hơn tầm đánh gần, x1,2-x3, hồi >= 4 s; hiện Cốt Tượng, trùm Thiên Hàn Vương và Thương Nguyệt Lang (Hóa Thần, D1 #1466 lát A1)", () => {
    const withSlam = MONSTERS.filter((m) => m.slam);
    expect(withSlam.map((m) => m.id).sort()).toEqual([
      "cot_tuong",
      "thien_han_vuong",
      "thuong_nguyet_lang",
    ]);
    for (const m of withSlam) {
      const s = m.slam!;
      expect(s.windupMs, m.id).toBeGreaterThanOrEqual(600);
      expect(s.windupMs, m.id).toBeLessThanOrEqual(1500);
      expect(s.radius, m.id).toBeGreaterThan(m.attackRange);
      expect(s.mult, m.id).toBeGreaterThanOrEqual(1.2);
      expect(s.mult, m.id).toBeLessThanOrEqual(3);
      expect(s.cdMs, m.id).toBeGreaterThanOrEqual(4000);
      // bước ra khỏi vòng kịp: tốc độ người Nguyên Anh sơ kỳ (182 px/s) x thời gian gồng > bán kính
      expect(182 * (s.windupMs / 1000), m.id).toBeGreaterThan(s.radius);
    }
  });
});
