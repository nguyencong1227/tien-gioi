// Quái đuổi người bằng đường A*, phát hiện kẹt và RÚT về (mục 48, #1012). Bản đồ thử: `flatMap` / `paint` của `nav.test.ts` (GameMap thật, `tiles` san phẳng + tường cây).
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID, PLAYER_RADIUS } from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { flatMap, paint } from "./nav-test-helpers";
import { dealMonsterDamage } from "./combat";
import { placeMonster, tickMonsters } from "./monsters";
import {
  EVADE_HOME_PX,
  NAV_SEARCHES_PER_TICK,
  SHUN_MS,
  STUCK_EVADE_MS,
  STUCK_REROUTE_MS,
  isEvading,
} from "./nav-chase";
import type { World } from "../world";

const TICK_MS = 50;

/** Chạy `ms` mili giây mô phỏng; `each` gọi sau mỗi tick (trả `true` để dừng sớm). */
function run(w: World, ms: number, each?: () => boolean | void): number {
  let t = 0;
  for (; t < ms; t += TICK_MS) {
    w.now += TICK_MS;
    tickMonsters(w, TICK_MS / 1000);
    if (each?.()) return t + TICK_MS;
  }
  return t;
}

/** Thế giới thử trên bản đồ phẳng có tường cây dọc ở cột `wallTx`, hở từ hàng `gapFrom` tới `gapTo` (rỗng nếu gapFrom > gapTo). Người chơi bất tử (khí huyết khổng lồ). */
function setup(opts: { wallTx?: number; gapFrom?: number; gapTo?: number } = {}) {
  const map = flatMap(40, 30);
  const wallTx = opts.wallTx ?? 20;
  paint(map, wallTx, 1, wallTx, 28);
  if (opts.gapFrom !== undefined && opts.gapTo !== undefined && opts.gapFrom <= opts.gapTo)
    paint(map, wallTx, opts.gapFrom, wallTx, opts.gapTo, 0); // T.Grass = 0: mở khe
  const h = makeWorld(map);
  h.w.now = 10_000;
  return { ...h, map };
}

function tough(w: World, sid: string, x: number, y: number) {
  const { p } = addPlayer(w, sid);
  p.x = x;
  p.y = y;
  p.px = Math.round(x);
  p.py = Math.round(y);
  p.hp = p.maxHp = 1_000_000_000;
  return p;
}

describe("quái thường vòng qua tường cây để tới người", () => {
  it("tường dài có lối ở cuối: tới tầm đánh trong 20 giây (bản cũ đi thẳng vào tường và đứng im)", () => {
    const { w } = setup({ gapFrom: 24, gapTo: 28 });
    const def = MONSTER_BY_ID["hac_giao"];
    const { m } = addMonster(w, "hac_giao", 520, 400);
    const p = tough(w, "p1", 760, 400);
    const reach = def.attackRange + PLAYER_RADIUS;
    const took = run(w, 20_000, () => Math.hypot(m.x - p.x, m.y - p.y) <= reach);
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeLessThanOrEqual(reach);
    expect(took).toBeLessThan(20_000);
  });

  it("khe 2 ô: thân to (Hắc Giao, bán kính di chuyển 22,4) lọt và tới được người", () => {
    const { w } = setup({ gapFrom: 14, gapTo: 15 });
    const def = MONSTER_BY_ID["hac_giao"];
    const { m } = addMonster(w, "hac_giao", 520, 450);
    const p = tough(w, "p1", 760, 450);
    const reach = def.attackRange + PLAYER_RADIUS;
    run(w, 20_000, () => Math.hypot(m.x - p.x, m.y - p.y) <= reach);
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeLessThanOrEqual(reach);
  });

  it("đường thẳng thông thì đi thẳng như cũ: không tìm đường lần nào", () => {
    const { w } = setup({ gapFrom: 1, gapTo: 28 }); // tường mở hết
    const { m, mc } = addMonster(w, "hac_giao", 520, 400);
    const p = tough(w, "p1", 760, 400);
    let everPath = false;
    run(w, 3000, () => {
      if (mc.nav?.pts) everPath = true;
    });
    expect(everPath).toBe(false); // không một tick nào bám đường A*
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeLessThan(240);
  });
});

describe("trùm vòng qua tường, phát hiện kẹt và rút về", () => {
  /** Trùm nhiều chiêu (bộ chiêu bật) ở (x, y) trên thế giới `w`. */
  function boss(w: World, x: number, y: number) {
    w.bossMoves = true;
    const id = placeMonster(w, MONSTER_BY_ID["hac_giao"], x, y);
    return { id, m: w.state.monsters.get(id)!, mc: w.mctrl.get(id)! };
  }

  it("trùm lách qua lối ở cuối tường và tới tầm đánh; không bao giờ đứng im quá STUCK_REROUTE_MS khi có đường", () => {
    const { w } = setup({ gapFrom: 24, gapTo: 28 });
    const { m, mc } = boss(w, 520, 400);
    expect(mc.boss).toBeDefined();
    const p = tough(w, "p1", 760, 400);
    const def = MONSTER_BY_ID["hac_giao"];
    let worstStuck = 0;
    run(w, 25_000, () => {
      worstStuck = Math.max(worstStuck, mc.nav?.stuckMs ?? 0);
      return Math.hypot(m.x - p.x, m.y - p.y) <= def.attackRange + PLAYER_RADIUS;
    });
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeLessThanOrEqual(def.attackRange + PLAYER_RADIUS);
    expect(worstStuck).toBeLessThan(STUCK_REROUTE_MS);
    expect(mc.nav?.evadeUntil ?? 0).toBe(0);
  });

  it("người đứng sau tường kín (không có lối): sau ~5 giây trùm RÚT về chỗ sinh, hồi đầy, không bị đòn đánh kéo lại, rồi không nhắm lại người đó ngay", () => {
    const { w } = setup({ wallTx: 14 });
    const { id, m, mc } = boss(w, 300, 400);
    const p = tough(w, "p1", 560, 400);
    m.hp = Math.floor(m.maxHp / 2);
    // Tới sát tường rồi kẹt
    let evadeAt = -1;
    const t0 = w.now;
    run(w, 20_000, () => {
      if (isEvading(w, mc)) {
        evadeAt = w.now - t0;
        return true;
      }
    });
    expect(evadeAt).toBeGreaterThan(STUCK_EVADE_MS - 1000);
    expect(evadeAt).toBeLessThan(STUCK_EVADE_MS + 8000); // vận chiêu từ xa giữa chừng chỉ tạm dừng đồng hồ kẹt
    expect(mc.target).toBeNull();
    // Trong lúc rút, đánh trùm không kéo nó lại
    dealMonsterDamage(w, id, m, "p1", 5, false);
    expect(mc.target).toBeNull(); // ngay sau đòn (chưa tới tick sau): `dealMonsterDamage` không nhận mục tiêu khi đang rút
    run(w, 100);
    expect(mc.target).toBeNull();
    // Rút về chỗ sinh, hết rút; hồi đầy khí huyết (mất mục tiêu -> reset trùm)
    run(w, 10_000, () => !isEvading(w, mc));
    expect(isEvading(w, mc)).toBe(false);
    expect(Math.hypot(m.x - mc.homeX, m.y - mc.homeY)).toBeLessThanOrEqual(EVADE_HOME_PX + 6);
    expect(m.hp).toBe(m.maxHp);
    // Người đó vẫn trong tầm phát hiện (260 < 300) nhưng bị cấm nhắm trong SHUN_MS
    const left = mc.nav!.shunUntil - w.now;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(SHUN_MS);
    run(w, Math.max(0, left - 200));
    expect(mc.target).toBeNull();
    // Hết SHUN_MS: nhắm lại (người đó vẫn đứng đó)
    run(w, 1500, () => mc.target === "p1");
    expect(mc.target).toBe("p1");
    expect(p.dead).toBeFalsy();
  });

  it("khe 1 ô, thân to không lọt: cũng rút (không đứng ngơ cho người đứng sau khe đánh miễn phí)", () => {
    const { w } = setup({ wallTx: 14, gapFrom: 15, gapTo: 15 });
    const { mc } = boss(w, 300, 450);
    tough(w, "p1", 560, 450);
    let evaded = false;
    run(w, 24_000, () => {
      if (isEvading(w, mc)) evaded = true;
      return evaded;
    });
    expect(evaded).toBe(true);
  });

  it("người chạy vòng quanh (kéo trùm đi): trùm luôn di chuyển nên KHÔNG bị coi là kẹt", () => {
    const { w } = setup({ gapFrom: 1, gapTo: 28 });
    const { mc } = boss(w, 400, 400);
    const p = tough(w, "p1", 520, 400);
    let a = 0;
    run(w, 30_000, () => {
      a += 0.05 * 0.7; // chạy vòng tròn bán kính 130 quanh (400, 400)
      p.x = 400 + Math.cos(a) * 130;
      p.y = 400 + Math.sin(a) * 130;
    });
    expect(mc.nav?.evadeUntil ?? 0).toBe(0);
    expect(mc.target).toBe("p1");
  });

  it("đứng sát trùm (trong tầm đánh) cả 20 giây: trùm đánh, không bị coi là kẹt", () => {
    const { w } = setup({ gapFrom: 1, gapTo: 28 });
    const { mc } = boss(w, 400, 400);
    tough(w, "p1", 440, 400);
    run(w, 20_000);
    expect(mc.nav?.evadeUntil ?? 0).toBe(0);
    expect(mc.target).toBe("p1");
  });

  it("rút quá EVADE_MAX_MS: đặt thẳng về chỗ sinh", () => {
    const { w } = setup({ wallTx: 14 });
    const { m, mc } = boss(w, 300, 400);
    tough(w, "p1", 560, 400);
    run(w, 24_000, () => isEvading(w, mc));
    expect(isEvading(w, mc)).toBe(true);
    m.x = 700; // bị "kéo" đi xa, hết hạn rút
    m.y = 700;
    mc.nav!.evadeUntil = w.now; // hết hạn
    run(w, TICK_MS);
    expect(Math.hypot(m.x - mc.homeX, m.y - mc.homeY)).toBeLessThan(2);
    expect(isEvading(w, mc)).toBe(false);
  });
});

describe("quái vòng qua khu an toàn (không bước vào trấn)", () => {
  it("trấn chắn giữa quái và người: quái tới được người bằng đường vòng ngoài trấn, không kẹt, không rút", () => {
    const map = flatMap(40, 30, { cx: 20, cy: 15, r: 3 }); // trấn tâm (656, 496), bán kính 96 px
    const h = makeWorld(map);
    const w = h.w;
    w.now = 10_000;
    const def = MONSTER_BY_ID["hac_giao"];
    const { m, mc } = addMonster(w, "hac_giao", 400, 496);
    const p = tough(w, "p1", 910, 496); // ngoài trấn (910 - 656 = 254 > 96 + 20), cách quái 510 px nên nới tầm phát hiện
    mc.def = { ...def, aggro: 700 };
    const reach = def.attackRange + PLAYER_RADIUS;
    let evaded = false;
    run(w, 40_000, () => {
      if (isEvading(w, mc)) evaded = true;
      return evaded || Math.hypot(m.x - p.x, m.y - p.y) <= reach;
    });
    expect(evaded).toBe(false);
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeLessThanOrEqual(reach);
  });
});

describe("ngân sách tìm đường", () => {
  it("quái thường chia chung NAV_SEARCHES_PER_TICK lần mỗi tick; trùm luôn được tìm", () => {
    const { w } = setup({ gapFrom: 24, gapTo: 28 });
    tough(w, "p1", 760, 400);
    const normals = [];
    for (let i = 0; i < 8; i++) normals.push(addMonster(w, "hac_giao", 500 + i * 3, 380 + i * 6));
    w.bossMoves = true;
    const bid = placeMonster(w, MONSTER_BY_ID["hac_giao"], 480, 420);
    const bmc = w.mctrl.get(bid)!;
    run(w, TICK_MS); // tick đầu
    const withPath = normals.filter((n) => n.mc.nav?.pts != null).length;
    expect(withPath).toBeLessThanOrEqual(NAV_SEARCHES_PER_TICK);
    expect(withPath).toBeGreaterThan(0);
    expect(bmc.nav?.pts ?? null).not.toBeNull(); // trùm không bị ngân sách chặn
    run(w, 1500); // vài tick sau: ai cũng có đường
    expect(normals.every((n) => n.mc.nav?.pts != null || n.mc.nav?.los)).toBe(true);
  });
});
