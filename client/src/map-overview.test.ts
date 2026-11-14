import {
  DEFAULT_MAP_ID,
  DUNGEON_MAPS,
  MAP_BY_ID,
  MAPS,
  MONSTER_BY_ID,
  T,
  TILE,
  getMap,
  npcsOfMap,
} from "@tien-gioi/shared";
import { describe, expect, it } from "vitest";
import {
  MAP_PALETTE,
  SPAWN_SAFE_PAD,
  buildMapOverview,
  getMapOverview,
  levelLabel,
  mapGraph,
  overviewSize,
  terrainRGBA,
  type Rgb,
} from "./map-overview";

const ALL_IDS = [...MAPS, ...DUNGEON_MAPS].map((d) => d.id);

function dist(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe("map-overview: dữ liệu tổng quan", () => {
  it.each(ALL_IDS)("%s: địa hình khớp GameMap.tiles và kích thước", (id) => {
    const map = getMap(id)!;
    const ov = getMapOverview(id)!;
    expect(ov.w).toBe(map.def.w);
    expect(ov.h).toBe(map.def.h);
    expect(ov.terrain.length).toBe(ov.w * ov.h);
    expect(Array.from(ov.terrain)).toEqual(Array.from(map.tiles));
    // Bản sao: sửa terrain của overview không làm hỏng bản đồ gốc
    expect(ov.terrain).not.toBe(map.tiles);
    expect(ov.zoneOfCell.length).toBe(ov.w * ov.h);
  });

  it("id lạ / độc trả undefined, cùng id trả cùng đối tượng (được nhớ)", () => {
    for (const bad of ["", "nope", "constructor", "__proto__", "toString"])
      expect(getMapOverview(bad)).toBeUndefined();
    expect(getMapOverview(DEFAULT_MAP_ID)).toBe(getMapOverview(DEFAULT_MAP_ID));
  });

  describe.each(ALL_IDS)("%s: khu quái theo quy tắc sinh thật", (id) => {
    const map = getMap(id)!;
    const ov = getMapOverview(id)!;

    it("số ô, chỉ số vùng và cấp tăng dần nhất quán", () => {
      const count = new Array<number>(ov.zones.length + 1).fill(0);
      for (const z of ov.zoneOfCell) {
        expect(z).toBeLessThanOrEqual(ov.zones.length);
        count[z]++;
      }
      ov.zones.forEach((z, i) => {
        expect(z.cells, z.name).toBe(count[i + 1]);
        expect(z.cells).toBeGreaterThan(0);
        if (i > 0) expect(z.level).toBeGreaterThanOrEqual(ov.zones[i - 1].level);
      });
    });

    it("nhãn nằm trong chính vùng của nó", () => {
      ov.zones.forEach((z, i) => {
        const tx = Math.floor(z.labelX / TILE);
        const ty = Math.floor(z.labelY / TILE);
        expect(ov.zoneOfCell[ty * ov.w + tx], z.name).toBe(i + 1);
      });
    });

    it("mọi ô của vùng đúng điều kiện sinh: loài có số lượng > 0, đủ nguy hiểm, ngoài khu an toàn, không chặn", () => {
      for (let ty = 0; ty < ov.h; ty++) {
        for (let tx = 0; tx < ov.w; tx++) {
          const zi = ov.zoneOfCell[ty * ov.w + tx];
          if (zi === 0) continue;
          const z = ov.zones[zi - 1];
          const kind = MONSTER_BY_ID[z.kindId];
          const x = tx * TILE + TILE / 2;
          const y = ty * TILE + TILE / 2;
          expect(map.monsterCapOf(kind.id), `${z.name} có số lượng`).toBeGreaterThan(0);
          expect(map.dangerAt(x, y)).toBeGreaterThanOrEqual(kind.minDanger);
          expect(map.inSafe(x, y, SPAWN_SAFE_PAD)).toBe(false);
          expect(map.circleBlocked(x, y, kind.radius)).toBe(false);
        }
      }
    });

    it("loài không có số lượng ở bản đồ này không bao giờ thành khu quái, trùm tách riêng", () => {
      for (const z of ov.zones) {
        expect(MONSTER_BY_ID[z.kindId].boss ?? false).toBe(false);
        for (const k of z.kindIds) expect(map.monsterCapOf(k)).toBeGreaterThan(0);
      }
      for (const b of ov.bosses) {
        expect(MONSTER_BY_ID[b.kindId].boss).toBe(true);
        expect(b.cap).toBe(map.monsterCapOf(b.kindId));
      }
    });

    it("khu an toàn và vòng quanh cổng không có quái", () => {
      const spots = [
        ...(ov.town ? [{ x: ov.town.x, y: ov.town.y }] : []),
        ...ov.portals.map((p) => ({ x: p.x, y: p.y })),
      ];
      for (const s of spots) {
        const tx = Math.floor(s.x / TILE);
        const ty = Math.floor(s.y / TILE);
        expect(ov.zoneOfCell[ty * ov.w + tx]).toBe(0);
      }
    });
  });

  it("Lạc Hà: Linh Thố chỉ ở vùng ít nguy hiểm (<= 0,45), sâu hơn là Hôi Lang rồi Hắc Hổ", () => {
    const ov = getMapOverview(DEFAULT_MAP_ID)!;
    const map = getMap(DEFAULT_MAP_ID)!;
    expect(ov.zones.map((z) => z.kindId)).toEqual(["tho", "lang", "ho"]);
    const tho = ov.zones[0];
    expect(tho.kindIds).toEqual(["tho"]);
    for (let ty = 0; ty < ov.h; ty++)
      for (let tx = 0; tx < ov.w; tx++)
        if (ov.zoneOfCell[ty * ov.w + tx] === 1)
          expect(map.dangerAt(tx * TILE + TILE / 2, ty * TILE + TILE / 2)).toBeLessThanOrEqual(
            0.45,
          );
    // Vùng Hôi Lang có cả Linh Thố sinh chung (Linh Thố còn sinh ở mức nguy hiểm thấp)
    expect(ov.zones[1].kindIds).toEqual(["tho", "lang"]);
    // Sâu hơn thì Linh Thố KHÔNG sinh nữa (spawnMonster bỏ khi nguy hiểm > 0,45)
    expect(ov.zones[2].kindIds).toEqual(["lang", "ho"]);
  });

  it("Âm Sương: ba khu Kim Đan theo cấp tăng dần và trùm Hắc Giao 2 con; không có Hôi Lang / Hắc Hổ", () => {
    const ov = getMapOverview("am_suong")!;
    expect(ov.zones.map((z) => z.kindId)).toEqual(["suong_ho", "thach_quy", "doc_thiem"]);
    expect(ov.zones.map((z) => z.levelLabel)).toEqual([
      "Kim Đan sơ kỳ",
      "Kim Đan trung kỳ",
      "Kim Đan hậu kỳ",
    ]);
    expect(ov.bosses).toEqual([expect.objectContaining({ kindId: "hac_giao", cap: 2 })]);
    expect(ov.zones.flatMap((z) => z.kindIds)).not.toContain("lang");
  });

  it.each(MAPS.map((d) => d.id))("%s: cổng ghi đúng bản đồ đích và khớp hai chiều", (id) => {
    const ov = getMapOverview(id)!;
    const def = MAP_BY_ID[id];
    expect(ov.portals.length).toBe(def.portals?.length ?? 0);
    for (const p of ov.portals) {
      expect(p.toMapName).toBe(MAP_BY_ID[p.toMapId].name);
      const other = getMapOverview(p.toMapId)!;
      const back = other.portals.find((q) => q.toMapId === id && q.name === p.toPortalName);
      expect(back, `${p.name} -> ${p.toMapName}`).toBeDefined();
      expect(back!.toPortalName).toBe(p.name);
      expect(["N", "S", "E", "W"]).toContain(p.dir);
    }
  });

  it.each(ALL_IDS)("%s: NPC, trấn, hang khớp bản đồ", (id) => {
    const ov = getMapOverview(id)!;
    const map = getMap(id)!;
    expect(ov.npcs.map((n) => n.id)).toEqual(npcsOfMap(id).map((n) => n.id));
    if (map.townPx.r > 0) expect(ov.town).toEqual({ ...map.townPx, name: map.townName });
    else expect(ov.town).toBeNull();
    if (map.lairPx) expect(ov.lair).toEqual({ ...map.lairPx });
    else expect(ov.lair).toBeNull();
  });

  it("bí cảnh Linh Hư có hang trùm", () => {
    expect(getMapOverview("bi_canh_linh_hu")!.lair).not.toBeNull();
  });

  it("buildMapOverview không dùng bộ nhớ đệm (hai lần gọi là hai đối tượng bằng nhau)", () => {
    const map = getMap(DEFAULT_MAP_ID)!;
    const a = buildMapOverview(map);
    const b = buildMapOverview(map);
    expect(a).not.toBe(b);
    expect(a.zones).toEqual(b.zones);
  });
});

describe("map-overview: nhãn cấp", () => {
  it("Phàm Nhân, Luyện Khí theo tầng, các cảnh giới sau theo kỳ", () => {
    expect(levelLabel(0)).toBe("Phàm Nhân");
    expect(levelLabel(1)).toBe("Luyện Khí tầng 1");
    expect(levelLabel(9)).toBe("Luyện Khí tầng 9");
    expect(levelLabel(10)).toBe("Trúc Cơ sơ kỳ");
    expect(levelLabel(12)).toBe("Trúc Cơ hậu kỳ");
    expect(levelLabel(13)).toBe("Kim Đan sơ kỳ");
    expect(levelLabel(15)).toBe("Kim Đan hậu kỳ");
  });
  it("ngoài thang hoặc không phải số nguyên -> ?", () => {
    for (const bad of [-1, 1.5, Number.NaN, Infinity, 100000]) expect(levelLabel(bad)).toBe("?");
  });
});

describe("map-overview: ảnh địa hình", () => {
  const tiny = (tiles: number[], w: number, h: number) => ({
    terrain: Uint8Array.from(tiles),
    w,
    h,
  });

  it("đủ độ lớn, alpha 255, độ phân giải đầy đủ = đúng màu bảng của từng ô", () => {
    const ov = getMapOverview(DEFAULT_MAP_ID)!;
    const img = terrainRGBA(ov, ov.w, ov.h);
    expect(img.length).toBe(ov.w * ov.h * 4);
    for (let i = 0; i < ov.w * ov.h; i += 97) {
      const c = MAP_PALETTE[ov.terrain[i] as T];
      expect([img[i * 4], img[i * 4 + 1], img[i * 4 + 2], img[i * 4 + 3]]).toEqual([...c, 255]);
    }
  });

  it("hạ mẫu theo độ ưu tiên: một ô nước giữa cỏ vẫn thấy, đường đất thắng cỏ, đá thắng cây", () => {
    const water = tiny([T.Grass, T.Grass, T.Grass, T.Water], 2, 2);
    expect(Array.from(terrainRGBA(water, 1, 1).slice(0, 3))).toEqual([...MAP_PALETTE[T.Water]]);
    const road = tiny([T.Grass, T.Dirt, T.Grass, T.Grass], 2, 2);
    expect(Array.from(terrainRGBA(road, 1, 1).slice(0, 3))).toEqual([...MAP_PALETTE[T.Dirt]]);
    const rock = tiny([T.Tree, T.Rock, T.Tree, T.Tree], 2, 2);
    expect(Array.from(terrainRGBA(rock, 1, 1).slice(0, 3))).toEqual([...MAP_PALETTE[T.Rock]]);
  });

  it("thu nhỏ bản đồ thật vẫn còn đường đất và nước (không bị trung bình làm mất)", () => {
    for (const id of MAPS.map((d) => d.id)) {
      const ov = getMapOverview(id)!;
      const size = overviewSize(ov, 48, 48);
      const img = terrainRGBA(ov, size.w, size.h);
      let dirt = 0;
      let water = 0;
      for (let i = 0; i < img.length; i += 4) {
        const px: Rgb = [img[i], img[i + 1], img[i + 2]];
        if (dist(px, MAP_PALETTE[T.Dirt]) === 0) dirt++;
        if (dist(px, MAP_PALETTE[T.Water]) === 0) water++;
      }
      const hasDirt = ov.terrain.includes(T.Dirt);
      const hasWater = ov.terrain.includes(T.Water);
      if (hasDirt) expect(dirt, `${id}: đường đất`).toBeGreaterThan(0);
      if (hasWater) expect(water, `${id}: nước`).toBeGreaterThan(0);
    }
  });

  it("bảng màu tương phản: nước, đường, cỏ, đá, cây đủ xa nhau", () => {
    const keys = [T.Water, T.Dirt, T.Grass, T.Rock, T.Tree];
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++)
        expect(
          dist(MAP_PALETTE[keys[i]], MAP_PALETTE[keys[j]]),
          `${T[keys[i]]}/${T[keys[j]]}`,
        ).toBeGreaterThan(40);
    // Mọi loại ô đều có màu
    for (const t of Object.values(T).filter((v): v is T => typeof v === "number"))
      expect(MAP_PALETTE[t]).toBeDefined();
  });

  it("kích thước ảnh không hợp lệ thì ném lỗi", () => {
    const ov = getMapOverview(DEFAULT_MAP_ID)!;
    for (const [w, h] of [
      [0, 10],
      [10, 0],
      [-1, 5],
      [2.5, 4],
      [Number.NaN, 3],
    ])
      expect(() => terrainRGBA(ov, w, h)).toThrow();
  });

  it("overviewSize giữ tỉ lệ bản đồ và vừa khung", () => {
    const ov = getMapOverview("hac_phong")!; // 128x96
    const s = overviewSize(ov, 384, 384);
    expect(s).toEqual({ w: 384, h: 288 });
    expect(overviewSize(ov, 1, 1)).toEqual({ w: 1, h: 1 });
    const t = overviewSize(getMapOverview(DEFAULT_MAP_ID)!, 120, 90);
    expect(t.w).toBeLessThanOrEqual(120);
    expect(t.h).toBeLessThanOrEqual(90);
  });
});

describe("map-overview: sơ đồ nối bản đồ", () => {
  const g = mapGraph();
  const portalCount = MAPS.reduce((n, d) => n + (d.portals?.length ?? 0), 0);

  it("đủ bản đồ ngoài, mỗi cổng một cạnh, mỗi cạnh có cạnh ngược, tên cổng hai đầu khớp", () => {
    expect(g.nodes.map((n) => n.mapId)).toEqual(MAPS.map((d) => d.id));
    expect(g.edges.length).toBe(portalCount);
    for (const e of g.edges) {
      const back = g.edges.find(
        (x) =>
          x.fromMapId === e.toMapId && x.toMapId === e.fromMapId && x.fromPortalId === e.toPortalId,
      );
      expect(back, `${e.fromPortalName} -> ${e.toPortalName}`).toBeDefined();
      expect(back!.fromPortalName).toBe(e.toPortalName);
    }
  });

  it("không hai bản đồ chung một ô lưới; Lạc Hà ở gốc; đi qua cổng bắc thì bản đồ kế nằm phía trên", () => {
    const cells = g.nodes.map((n) => `${n.gx},${n.gy}`);
    expect(new Set(cells).size).toBe(cells.length);
    const by = Object.fromEntries(g.nodes.map((n) => [n.mapId, n]));
    expect([by[DEFAULT_MAP_ID].gx, by[DEFAULT_MAP_ID].gy]).toEqual([0, 0]);
    expect(by.hac_phong.gy).toBeLessThan(by[DEFAULT_MAP_ID].gy);
    expect(by.am_suong.gy).toBeLessThan(by.hac_phong.gy);
  });

  it("chuỗi Lạc Hà - Hắc Phong - Âm Sương nối đúng", () => {
    const pairs = new Set(g.edges.map((e) => `${e.fromMapId}>${e.toMapId}`));
    for (const p of [
      "lac_ha>hac_phong",
      "hac_phong>lac_ha",
      "hac_phong>am_suong",
      "am_suong>hac_phong",
    ])
      expect(pairs.has(p), p).toBe(true);
    expect(pairs.has("lac_ha>am_suong")).toBe(false);
  });
});
