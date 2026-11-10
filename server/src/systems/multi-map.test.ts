// Nhiều bản đồ (M3 bước 1): quái, khu an toàn quanh cổng và NPC theo bản đồ của phòng.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP,
  HAC_PHONG_ID,
  MONSTERS,
  NPC_BY_ID,
  NPC_RANGE,
  getMap,
  type GameMap,
} from "@tien-gioi/shared";
import { nearNpc } from "./npc";
import { spawnInitial, tickMonsters, topUpMonsters } from "./monsters";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const HAC_PHONG = getMap(HAC_PHONG_ID)!;
const maps: [string, GameMap][] = [
  ["lac_ha", DEFAULT_MAP],
  [HAC_PHONG_ID, HAC_PHONG],
];

const countKinds = (w: ReturnType<typeof makeWorld>["w"]) => {
  const n: Record<string, number> = {};
  for (const m of w.state.monsters.values()) n[m.kind] = (n[m.kind] ?? 0) + 1;
  return n;
};

describe("quái theo bản đồ của phòng", () => {
  it.each(maps)(
    "%s: sinh đúng số quái từng loại theo monsterCap, loại không khai báo thì không có",
    (_id, map) => {
      const { w } = makeWorld(map);
      spawnInitial(w);
      const n = countKinds(w);
      for (const k of MONSTERS)
        expect(n[k.id] ?? 0, k.id).toBeLessThanOrEqual(map.monsterCapOf(k.id));
      if (map === HAC_PHONG) expect(n.tho).toBeUndefined();
      // Gần như đủ số lượng (mỗi con thử 40 chỗ ngẫu nhiên; thiếu chút ít được topUp bù)
      const total = Object.values(n).reduce((a, b) => a + b, 0);
      const cap = Object.values(map.monsterCap).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThanOrEqual(cap * 0.9);
    },
  );

  it("topUp bù đúng theo monsterCap của bản đồ: Hắc Phong Cốc không bao giờ sinh Linh Thố", () => {
    const { w } = makeWorld(HAC_PHONG);
    spawnInitial(w);
    for (const [id] of [...w.state.monsters.entries()]) {
      w.state.monsters.delete(id);
      w.mctrl.delete(id);
    }
    for (let i = 0; i < 40; i++) topUpMonsters(w);
    const n = countKinds(w);
    expect(n.tho).toBeUndefined();
    for (const k of MONSTERS)
      expect(n[k.id] ?? 0, k.id).toBeLessThanOrEqual(HAC_PHONG.monsterCapOf(k.id));
    expect(n.mang).toBeGreaterThan(0);
  });

  it.each(maps)("%s: không con quái nào sinh ra trong khu an toàn quanh cổng", (_id, map) => {
    const { w } = makeWorld(map);
    spawnInitial(w);
    for (let i = 0; i < 5; i++) topUpMonsters(w);
    for (const m of w.state.monsters.values()) {
      expect(map.inSafe(m.x, m.y), `(${m.x | 0}, ${m.y | 0})`).toBe(false);
      for (const p of map.portals)
        expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeGreaterThan(p.safeR);
    }
  });
});

describe("khu an toàn quanh cổng: quái không đuổi, không bước vào", () => {
  it.each(maps)("%s: người đứng ở chỗ xuất hiện của cổng không bị quái nhắm tới", (_id, map) => {
    const { w } = makeWorld(map);
    const portal = map.portals[0];
    const { p } = addPlayer(w, "a");
    p.x = portal.spawn.x;
    p.y = portal.spawn.y;
    // Con quái hung dữ nhất đứng sát ngoài mép khu an toàn, trong tầm phát hiện
    const hungDu = MONSTERS.find((k) => k.id === "mang")!;
    const { mc, m } = addMonster(w, "mang", portal.x, portal.y + portal.safeR + 40);
    expect(hungDu.aggro).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) tickMonsters(w, 0.05);
    expect(mc.target).toBeNull();
    // và không tự bước vào khu an toàn
    expect(map.inSafe(m.x, m.y, 0)).toBe(false);
  });

  it("ngoài khu an toàn thì quái vẫn đuổi như thường (không làm quái hiền đi)", () => {
    const { w } = makeWorld(HAC_PHONG);
    const portal = HAC_PHONG.portals[0];
    const { p } = addPlayer(w, "a");
    // cách xa trạm và cổng, trên đường lên bắc, có quái sát bên
    p.x = portal.x;
    p.y = portal.y - portal.safeR - 400;
    expect(HAC_PHONG.inSafe(p.x, p.y, 20)).toBe(false);
    const { mc } = addMonster(w, "mang", p.x + 150, p.y); // trong tầm phát hiện, ngoài tầm đánh
    tickMonsters(w, 0.05);
    expect(mc.target).toBe("a");
  });
});

describe("NPC chỉ đứng ở bản đồ của mình", () => {
  it("cùng toạ độ: đúng bản đồ thì nói chuyện được, bản đồ khác thì không", () => {
    const npc = NPC_BY_ID.truong_tran!;
    const lacHa = makeWorld(DEFAULT_MAP).w;
    const hacPhong = makeWorld(HAC_PHONG).w;
    for (const w of [lacHa, hacPhong]) {
      const { p } = addPlayer(w, "a");
      p.x = npc.x;
      p.y = npc.y + NPC_RANGE - 5;
    }
    expect(nearNpc(lacHa, "a", npc.id)?.npc.id).toBe(npc.id);
    expect(nearNpc(hacPhong, "a", npc.id)).toBeNull();
  });
});
