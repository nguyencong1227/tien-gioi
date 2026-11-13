// Âm Sương Trạch (M6, #405): quái Kim Đan sinh đúng chỗ / đúng số, hồi sinh, trùm Hắc Giao tính cho luân hồi, đi qua cổng hai chiều.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AM_SUONG_ID,
  COIN_DROPS,
  DROP_TABLES,
  HAC_PHONG_ID,
  MONSTER_BY_ID,
  MONSTERS,
  getMap,
  killExp,
} from "@tien-gioi/shared";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { killMonster } from "./combat";
import { spawnInitial, topUpMonsters, tickMonsters } from "./monsters";
import { planTravel } from "./travel";

const AM_SUONG = getMap(AM_SUONG_ID)!;
const HAC_PHONG = getMap(HAC_PHONG_ID)!;
const KD = ["suong_ho", "thach_quy", "doc_thiem", "hac_giao"];

/** Bộ sinh số có hạt giống (mulberry32) thay `Math.random`, để kết quả cố định. */
function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
afterEach(() => vi.restoreAllMocks());

describe("quái sinh ở Âm Sương Trạch", () => {
  it("20 hạt giống: đủ đúng số quái mỗi loại, ngoài khu an toàn, không đè ô cản, đủ nguy hiểm, và KHÔNG có quái cũ", () => {
    for (let seed = 1; seed <= 20; seed++) {
      vi.spyOn(Math, "random").mockImplementation(seeded(seed));
      const { w } = makeWorld(AM_SUONG);
      spawnInitial(w);
      const count: Record<string, number> = {};
      for (const m of w.state.monsters.values()) {
        count[m.kind] = (count[m.kind] ?? 0) + 1;
        const def = MONSTER_BY_ID[m.kind];
        expect(AM_SUONG.dangerAt(m.x, m.y), `${m.kind} hạt ${seed}`).toBeGreaterThanOrEqual(
          def.minDanger,
        );
        expect(AM_SUONG.inSafe(m.x, m.y, 160), `${m.kind} trong khu an toàn`).toBe(false);
        expect(AM_SUONG.circleBlocked(m.x, m.y, def.radius), `${m.kind} đè ô cản`).toBe(false);
      }
      for (const id of KD)
        expect(count[id] ?? 0, `${id} hạt ${seed}`).toBe(AM_SUONG.monsterCapOf(id));
      for (const old of ["tho", "lang", "ho", "mang", "yeu_vuong"])
        expect(count[old], old).toBeUndefined();
      expect(w.state.monsters.size).toBe(62);
      vi.restoreAllMocks();
    }
  });

  it("hồi sinh: giết bớt rồi `topUpMonsters` bù lại đủ số lượng", () => {
    vi.spyOn(Math, "random").mockImplementation(seeded(7));
    const { w } = makeWorld(AM_SUONG);
    spawnInitial(w);
    const ids = [...w.state.monsters.entries()]
      .filter(([, m]) => m.kind === "suong_ho")
      .slice(0, 5)
      .map(([id]) => id);
    for (const id of ids) {
      w.state.monsters.delete(id);
      w.mctrl.delete(id);
    }
    expect([...w.state.monsters.values()].filter((m) => m.kind === "suong_ho")).toHaveLength(19);
    for (let i = 0; i < 6; i++) topUpMonsters(w);
    expect([...w.state.monsters.values()].filter((m) => m.kind === "suong_ho")).toHaveLength(24);
  });

  it("không ai ở gần thì quái ngủ: tick không làm quái nhúc nhích", () => {
    vi.spyOn(Math, "random").mockImplementation(seeded(3));
    const { w } = makeWorld(AM_SUONG);
    spawnInitial(w);
    const before = JSON.stringify([...w.state.monsters.values()].map((m) => [m.x, m.y]));
    for (let i = 0; i < 40; i++) tickMonsters(w, 0.05);
    expect(JSON.stringify([...w.state.monsters.values()].map((m) => [m.x, m.y]))).toBe(before);
  });
});

describe("hạ quái Kim Đan", () => {
  function kill(kind: string, realm = 3, tier = 0) {
    const t = makeWorld(AM_SUONG);
    const { p, c } = addPlayer(t.w, "a", realm, tier);
    addMonster(t.w, kind, 1000, 1000);
    const id = [...t.w.state.monsters.keys()].at(-1)!;
    const mc = t.w.mctrl.get(id)!;
    mc.damageBy.set("a", 1000);
    c.coin = 0;
    killMonster(t.w, id, mc);
    return { ...t, p, c };
  }

  it("Hắc Giao (trùm): tính vào bossKills của kiếp (Duyên khi luân hồi), rơi Giao Lân + tiền trong khoảng; quái thường không tính bossKills", () => {
    const boss = kill("hac_giao");
    expect(boss.c.life.bossKills).toBe(1);
    expect(boss.c.life.kills).toBe(1);
    const loot = [...boss.w.state.loot.values()].map((l) => l.itemId);
    expect(loot).toContain("giao_lan");
    const d = COIN_DROPS.hac_giao;
    expect(boss.c.coin).toBeGreaterThanOrEqual(d.min);
    expect(boss.c.coin).toBeLessThanOrEqual(d.max);
    for (const id of ["suong_ho", "thach_quy", "doc_thiem"]) {
      const t = kill(id);
      expect(t.c.life.bossKills, id).toBe(0);
      expect(t.c.life.kills, id).toBe(1);
    }
  });

  it("tu vi: đúng killExp (người Kim Đan sơ kỳ không bị trừ vì cấp quái 13-18 >= bậc 13)", () => {
    for (const id of ["suong_ho", "thach_quy", "doc_thiem", "hac_giao"]) {
      const t = kill(id);
      // thanh Kim Đan 48000 chưa đầy nên không lên bậc: tu vi nhận đúng bằng exp của quái
      expect(t.p.exp, id).toBe(MONSTER_BY_ID[id].exp);
      expect(killExp(MONSTER_BY_ID[id], 3, 0), id).toBe(MONSTER_BY_ID[id].exp);
    }
  });

  it("đồ rơi của quái mới chỉ gồm vật phẩm khai báo trong DROP_TABLES; mọi quái Kim Đan đều có bảng rơi", () => {
    for (const id of KD) {
      const allowed = new Set(DROP_TABLES[id].map((x) => x.itemId));
      for (let i = 0; i < 30; i++) {
        const t = kill(id);
        for (const l of t.w.state.loot.values())
          expect(allowed.has(l.itemId), `${id}: ${l.itemId}`).toBe(true);
      }
    }
    expect(MONSTERS.filter((m) => KD.includes(m.id))).toHaveLength(4);
  });
});

describe("đi qua cổng Hắc Phong Cốc <-> Âm Sương Trạch", () => {
  it("cổng bắc Hắc Phong dẫn tới chỗ xuất hiện của cổng nam Âm Sương, và ngược lại", () => {
    const bac = HAC_PHONG.portals.find((p) => p.id === "hac_phong_bac")!;
    const nam = AM_SUONG.portals.find((p) => p.id === "am_suong_nam")!;
    {
      const t = makeWorld(HAC_PHONG);
      const { p } = addPlayer(t.w, "a", 3, 0);
      p.x = bac.x;
      p.y = bac.y;
      expect(planTravel(t.w, "a", bac.id)).toEqual({
        mapId: AM_SUONG_ID,
        x: nam.spawn.x,
        y: nam.spawn.y,
        portalName: bac.name,
      });
    }
    {
      const t = makeWorld(AM_SUONG);
      const { p } = addPlayer(t.w, "a", 3, 0);
      p.x = nam.x;
      p.y = nam.y;
      expect(planTravel(t.w, "a", nam.id)).toEqual({
        mapId: HAC_PHONG_ID,
        x: bac.spawn.x,
        y: bac.spawn.y,
        portalName: nam.name,
      });
    }
  });

  it("xa cổng thì không qua được; cổng của bản đồ khác thì bị từ chối", () => {
    const t = makeWorld(AM_SUONG);
    const { p } = addPlayer(t.w, "a", 3, 0);
    p.x = AM_SUONG.townPx.x;
    p.y = AM_SUONG.townPx.y;
    expect(planTravel(t.w, "a", "am_suong_nam")).toBeNull();
    const nam = AM_SUONG.portals[0];
    p.x = nam.x;
    p.y = nam.y;
    expect(planTravel(t.w, "a", "hac_phong_bac")).toBeNull(); // cổng ở bản đồ khác
  });
});
