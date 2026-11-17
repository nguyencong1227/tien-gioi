// Tìm đường trên DỮ LIỆU BẢN ĐỒ THẬT (mục 48, #1012): chỗ sinh trùm đủ rộng, và trùm / quái đuổi được người ở mọi bản đồ có trùm dù đường thẳng bị cây, đá, nước chặn.
// Số liệu tất định: bộ ngẫu nhiên đồng dư tuyến tính có hạt giống riêng (KHÔNG `Math.random`), nên đỏ là đỏ thật, không chập chờn.
import { describe, expect, it } from "vitest";
import {
  DUNGEON_MAPS,
  MAPS,
  MONSTERS,
  MONSTER_BY_ID,
  PLAYER_RADIUS,
  getMap,
  type GameMap,
  type MonsterKind,
} from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import {
  BOSS_SPAWN_MARGIN,
  bossSpawnOk,
  placeMonster,
  spawnMonster,
  tickMonsters,
} from "./monsters";
import { inMainRegion, lineClear, squareFree } from "./nav";
import { isEvading } from "./nav-chase";

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** Mọi (bản đồ, loại trùm) có sinh ngoài hoang (không phải hang cố định của bí cảnh). */
const BOSS_SITES: Array<{ map: GameMap; def: MonsterKind }> = [...MAPS, ...DUNGEON_MAPS].flatMap(
  (md) => {
    const map = getMap(md.id)!;
    return MONSTERS.filter((k) => k.boss && map.monsterCapOf(k.id) > 0 && !map.lairPx).map(
      (def) => ({
        map,
        def,
      }),
    );
  },
);

describe("chỗ sinh trùm trên bản đồ thật", () => {
  it("có trùm ở bốn bản đồ thường (không bỏ sót bản đồ nào khi dữ liệu đổi)", () => {
    expect(BOSS_SITES.map((s) => `${s.map.def.id}:${s.def.id}`).sort()).toEqual(
      ["am_suong:hac_giao", "hac_phong:mang", "han_van:thien_han_vuong", "lac_ha:mang"].sort(),
    );
  });

  for (const { map, def } of BOSS_SITES) {
    it(`${map.def.id} / ${def.id}: 40 lần sinh đều ra, đều rộng (cách ô chặn >= bán kính + ${BOSS_SPAWN_MARGIN} px) và nằm trong vùng chính`, () => {
      for (let i = 0; i < 40; i++) {
        const { w } = makeWorld(map);
        spawnMonster(w, def);
        const bosses = [...w.state.monsters.values()].filter((m) => m.kind === def.id);
        expect(bosses.length, `lần ${i}: trùm phải sinh được`).toBe(1);
        const b = bosses[0];
        expect(squareFree(map, b.x, b.y, def.radius + BOSS_SPAWN_MARGIN)).toBe(true);
        expect(inMainRegion(map, def.radius * 0.8, b.x, b.y)).toBe(true);
        expect(map.dangerAt(b.x, b.y)).toBeGreaterThanOrEqual(def.minDanger);
      }
    });

    it(`${map.def.id} / ${def.id}: còn nhiều chỗ sinh hợp lệ (vùng sinh đủ rộng, không chỉ vài điểm)`, () => {
      const { w } = makeWorld(map);
      let ok = 0;
      for (let y = 64; y < map.worldH - 64; y += 32)
        for (let x = 64; x < map.worldW - 64; x += 32) {
          if (map.dangerAt(x, y) < def.minDanger) continue;
          if (map.inSafe(x, y, 160) || map.circleBlocked(x, y, def.radius)) continue;
          if (bossSpawnOk(w, def, x, y)) ok++;
        }
      expect(ok).toBeGreaterThan(300); // đo lúc viết: >= 1000 ô 32 px mỗi bản đồ
    });
  }
});

describe("trùm đuổi người trên bản đồ thật, đường thẳng bị chặn", () => {
  for (const { map, def } of BOSS_SITES) {
    it(`${map.def.id} / ${def.id}: 24 cặp (trùm, người) mà đường thẳng bị chặn: trùm tới tầm đánh trong 30 giây, không rút`, () => {
      const rnd = lcg(map.def.seed ^ 0x9e3779b9);
      const move = def.radius * 0.8;
      let tried = 0;
      let guard = 0;
      const bad: string[] = [];
      while (tried < 24 && guard++ < 200_000) {
        const x = 64 + rnd() * (map.worldW - 128);
        const y = 64 + rnd() * (map.worldH - 128);
        if (map.dangerAt(x, y) < def.minDanger) continue;
        if (map.inSafe(x, y, 160) || map.circleBlocked(x, y, def.radius)) continue;
        const a = rnd() * Math.PI * 2;
        const dd = 100 + rnd() * (def.aggro - 120);
        const px = x + Math.cos(a) * dd;
        const py = y + Math.sin(a) * dd;
        if (px < 64 || py < 64 || px > map.worldW - 64 || py > map.worldH - 64) continue;
        if (map.circleBlocked(px, py, 12) || map.inSafe(px, py, 40)) continue;
        if (lineClear(map, x, y, px, py, move)) continue; // chỉ những ca cần đường vòng
        const { w } = makeWorld(map);
        w.now = 10_000;
        if (!bossSpawnOk(w, def, x, y) || !inMainRegion(map, move, px, py)) continue;
        tried++;
        w.bossMoves = true;
        const id = placeMonster(w, def, x, y);
        const m = w.state.monsters.get(id)!;
        const mc = w.mctrl.get(id)!;
        const { p } = addPlayer(w, "p1");
        p.x = px;
        p.y = py;
        p.hp = p.maxHp = 1_000_000_000;
        const reach = def.attackRange + PLAYER_RADIUS;
        let ok = false;
        let evaded = false;
        for (let t = 0; t < 30_000 && !ok && !evaded; t += 50) {
          w.now += 50;
          tickMonsters(w, 0.05);
          ok = Math.hypot(m.x - p.x, m.y - p.y) <= reach;
          evaded = isEvading(w, mc);
        }
        if (!ok)
          bad.push(
            `(${Math.round(x)},${Math.round(y)}) -> (${Math.round(px)},${Math.round(py)}) ${evaded ? "rút" : "hết giờ"} ở (${Math.round(m.x)},${Math.round(m.y)})`,
          );
      }
      expect(tried).toBe(24);
      expect(bad).toEqual([]);
    });
  }

  it("quái thường (Hắc Hổ ở Lạc Hà): 24 cặp đường thẳng bị chặn đều tới được người", () => {
    const map = getMap("lac_ha")!;
    const def = MONSTER_BY_ID["ho"];
    const rnd = lcg(777);
    const move = def.radius * 0.8;
    let tried = 0;
    let guard = 0;
    const bad: string[] = [];
    while (tried < 24 && guard++ < 200_000) {
      const x = 64 + rnd() * (map.worldW - 128);
      const y = 64 + rnd() * (map.worldH - 128);
      if (
        map.dangerAt(x, y) < def.minDanger ||
        map.inSafe(x, y, 160) ||
        map.circleBlocked(x, y, def.radius)
      )
        continue;
      const a = rnd() * Math.PI * 2;
      const dd = 80 + rnd() * (def.aggro - 100);
      const px = x + Math.cos(a) * dd;
      const py = y + Math.sin(a) * dd;
      if (px < 64 || py < 64 || px > map.worldW - 64 || py > map.worldH - 64) continue;
      if (map.circleBlocked(px, py, 12) || map.inSafe(px, py, 40)) continue;
      if (lineClear(map, x, y, px, py, move)) continue;
      const { w } = makeWorld(map);
      w.now = 10_000;
      if (!inMainRegion(map, move, x, y) || !inMainRegion(map, move, px, py)) continue;
      tried++;
      const id = placeMonster(w, def, x, y);
      const m = w.state.monsters.get(id)!;
      const { p } = addPlayer(w, "p1");
      p.x = px;
      p.y = py;
      p.hp = p.maxHp = 1_000_000_000;
      let ok = false;
      for (let t = 0; t < 30_000 && !ok; t += 50) {
        w.now += 50;
        tickMonsters(w, 0.05);
        ok = Math.hypot(m.x - p.x, m.y - p.y) <= def.attackRange + PLAYER_RADIUS;
      }
      if (!ok)
        bad.push(`(${Math.round(x)},${Math.round(y)}) -> (${Math.round(px)},${Math.round(py)})`);
    }
    expect(tried).toBe(24);
    expect(bad).toEqual([]);
  });
});

describe("CPU: 8 trùm + 50 người trên bản đồ thật (ngân sách tick < 10 ms)", () => {
  for (const { map, def } of BOSS_SITES) {
    it(`${map.def.id} / ${def.id}: 30 giây mô phỏng, người đi lang thang trong tầm phát hiện: tick quái TB < 1 ms, p95 < 3 ms, p99 < 10 ms`, () => {
      const rnd = lcg(99);
      const { w } = makeWorld(map);
      w.now = 10_000;
      w.bossMoves = true;
      const sites: Array<[number, number]> = [];
      while (sites.length < 8) {
        const x = 64 + rnd() * (map.worldW - 128);
        const y = 64 + rnd() * (map.worldH - 128);
        if (map.dangerAt(x, y) < def.minDanger || map.inSafe(x, y, 160)) continue;
        if (map.circleBlocked(x, y, def.radius) || !bossSpawnOk(w, def, x, y)) continue;
        sites.push([x, y]);
      }
      for (const [x, y] of sites) placeMonster(w, def, x, y);
      const walkers: Array<{ p: ReturnType<typeof addPlayer>["p"]; a: number }> = [];
      for (let i = 0; i < 50; i++) {
        const [bx, by] = sites[i % 8];
        const a = rnd() * Math.PI * 2;
        const d = 100 + rnd() * (def.aggro - 120);
        const { p } = addPlayer(w, `p${i}`);
        p.x = bx + Math.cos(a) * d;
        p.y = by + Math.sin(a) * d;
        if (map.circleBlocked(p.x, p.y, 12) || map.inSafe(p.x, p.y, 40)) {
          p.x = bx;
          p.y = by + 200;
        }
        p.hp = p.maxHp = 1_000_000_000;
        walkers.push({ p, a: rnd() * Math.PI * 2 });
      }
      const ms: number[] = [];
      for (let t = 0; t < 600; t++) {
        w.now += 50;
        for (const o of walkers) {
          o.a += (rnd() - 0.5) * 0.4;
          const nx = o.p.x + Math.cos(o.a) * 4;
          const ny = o.p.y + Math.sin(o.a) * 4;
          if (!map.circleBlocked(nx, ny, 12) && !map.inSafe(nx, ny, 40)) {
            o.p.x = nx;
            o.p.y = ny;
          }
        }
        const t0 = performance.now();
        tickMonsters(w, 0.05);
        ms.push(performance.now() - t0);
      }
      ms.sort((a, b) => a - b);
      const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
      // Đo lúc viết: TB ~0,04 ms, p95 ~0,1 ms, lớn nhất ~1,7 ms (lần tìm đường đầu tiên)
      expect(avg).toBeLessThan(1);
      expect(ms[Math.floor(ms.length * 0.95)]).toBeLessThan(3);
      // Không ghim giá trị lớn nhất: một nhịp dọn rác / tranh CPU với các tệp test chạy song song làm nó vọt lên mà không do mã (p99 đủ bắt tìm đường quá tay)
      expect(ms[Math.floor(ms.length * 0.99)]).toBeLessThan(10);
    });
  }
});
