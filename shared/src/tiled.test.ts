import { describe, expect, it } from "vitest";
import { GameMap, MAPS, T, TILE, getMap } from "./map";
import {
  LOGIC_TILE_COUNT,
  TILED_MAX_SIDE,
  TILED_SCHEMA,
  mapDefFromTiled,
  parseTiledMap,
  tiledViolations,
  type TiledMap,
} from "./tiled";

const TW = 16; // px của tệp: phóng ×2 = TILE (32)

const prop = (name: string, value: string | number | boolean) => ({ name, value });

/** Tệp nhỏ hợp lệ: 16 x 16, viền đá, một hồ nước, trấn ở (8, 10), một cổng ở rìa bắc. */
function fixture(): TiledMap {
  const w = 16;
  const h = 16;
  const data: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let t: T = T.Grass;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) t = T.Rock;
      if (x === 5 && y === 5) t = T.Water;
      data.push(1 + t);
    }
  return {
    type: "map",
    orientation: "orthogonal",
    infinite: false,
    width: w,
    height: h,
    tilewidth: TW,
    tileheight: TW,
    properties: [
      prop("schema", TILED_SCHEMA),
      prop("id", "thu_nho"),
      prop("name", "Thử Nhỏ"),
      prop("townName", "Trạm Thử"),
      prop("wildName", "Vùng Thử"),
    ],
    tilesets: [{ firstgid: 1, name: "logic" }],
    layers: [
      { type: "tilelayer", name: "logic", width: w, height: h, data },
      {
        type: "objectgroup",
        name: "objects",
        objects: [
          {
            id: 1,
            name: "tram",
            class: "town",
            x: 8 * TW + 8,
            y: 10 * TW + 8,
            point: true,
            properties: [prop("r", 2)],
          },
          {
            id: 2,
            name: "cong_bac",
            class: "portal",
            x: 136,
            y: 40,
            point: true,
            properties: [
              prop("id", "thu_nho_bac"),
              prop("name", "Bắc Môn"),
              prop("toMap", "lac_ha"),
              prop("toPortal", "lac_ha_bac"),
              prop("r", 16),
              prop("safeR", 48),
              prop("spawnX", 136),
              prop("spawnY", 72),
            ],
          },
        ],
      },
    ],
  };
}

const clone = (): TiledMap => structuredClone(fixture());
const objects = (m: TiledMap) => m.layers.find((l) => l.name === "objects")!.objects!;
const logic = (m: TiledMap) => m.layers.find((l) => l.name === "logic")!;

describe("tiledViolations / parseTiledMap: tệp Tiled hợp lệ", () => {
  it("tệp mẫu hợp lệ; đổi sang px thế giới (×2) đúng; giá trị enum T khớp số loại ô logic", () => {
    expect(tiledViolations(fixture())).toEqual([]);
    const p = parseTiledMap(fixture(), TILE);
    expect(p.id).toBe("thu_nho");
    expect(p.name).toBe("Thử Nhỏ");
    expect([p.w, p.h]).toEqual([16, 16]);
    expect(p.tiles.length).toBe(256);
    expect(p.tiles[5 * 16 + 5]).toBe(T.Water);
    expect(p.tiles[0]).toBe(T.Rock);
    expect(p.tiles[3 * 16 + 3]).toBe(T.Grass);
    expect(p.town).toEqual({ cx: 8, cy: 10, r: 2 });
    expect(p.lair).toBeUndefined();
    expect(p.portals).toEqual([
      {
        id: "thu_nho_bac",
        name: "Bắc Môn",
        x: 272,
        y: 80,
        r: 32,
        safeR: 96,
        spawn: { x: 272, y: 144 },
        toMap: "lac_ha",
        toPortal: "lac_ha_bac",
      },
    ]);
    const members = Object.values(T).filter((v) => typeof v === "number").length;
    expect(LOGIC_TILE_COUNT).toBe(members);
  });

  it("tileset logic có firstgid khác 1 và tên qua `source` ngoài vẫn đọc đúng", () => {
    const m = clone();
    m.tilesets = [{ firstgid: 9, source: "tilesets/logic.tsx" }];
    logic(m).data = (logic(m).data as number[]).map((v) => v + 8);
    expect(tiledViolations(m)).toEqual([]);
    expect(parseTiledMap(m, TILE).tiles[5 * 16 + 5]).toBe(T.Water);
  });

  it("`type` kiểu cũ (Tiled <= 1.8) thay cho `class` vẫn nhận; đối tượng loại khác (spawnZone sau này) bị bỏ qua", () => {
    const m = clone();
    const o = objects(m);
    o[0] = { ...o[0]!, type: "town", class: undefined };
    o.push({ id: 9, name: "z", class: "spawnZone", x: 1, y: 1 });
    expect(tiledViolations(m)).toEqual([]);
    expect(parseTiledMap(m, TILE).town.cx).toBe(8);
  });

  it("dựng `GameMap` từ tệp: ô, trấn, cổng, tên khu, va chạm đúng", () => {
    const map = new GameMap(mapDefFromTiled(fixture(), TILE));
    expect(map.def.id).toBe("thu_nho");
    expect(map.worldW).toBe(16 * TILE);
    expect(map.tileAt(5, 5)).toBe(T.Water);
    expect(map.isBlockedPx(5 * TILE + 5, 5 * TILE + 5)).toBe(true);
    expect(map.isBlockedPx(3 * TILE, 3 * TILE)).toBe(false);
    expect(map.townName).toBe("Trạm Thử");
    expect(map.wildName).toBe("Vùng Thử");
    expect(map.townPx).toEqual({ x: 8 * TILE, y: 10 * TILE, r: 2 * TILE });
    expect(map.inTown(8 * TILE, 10 * TILE)).toBe(true);
    expect(map.portal("thu_nho_bac")?.toMap).toBe("lac_ha");
    expect(map.portalNear(272, 80)?.id).toBe("thu_nho_bac");
  });
});

describe("tiledViolations: mỗi luật có ca sai (đột biến dữ liệu)", () => {
  const cases: [string, (m: TiledMap) => void, RegExp][] = [
    [
      "orientation không phải orthogonal",
      (m) => (m.orientation = "isometric"),
      /orientation phải là 'orthogonal'/,
    ],
    ["bản đồ vô hạn", (m) => (m.infinite = true), /infinite phải là false/],
    [
      "schema lạ",
      (m) =>
        (m.properties = m.properties!.map((p) => (p.name === "schema" ? prop("schema", 2) : p))),
      /schema/,
    ],
    [
      "id sai dạng",
      (m) =>
        (m.properties = m.properties!.map((p) => (p.name === "id" ? prop("id", "Thử Nhỏ!") : p))),
      /'id' phải là/,
    ],
    [
      "thiếu name",
      (m) => (m.properties = m.properties!.filter((p) => p.name !== "name")),
      /thiếu thuộc tính chuỗi 'name'/,
    ],
    [
      "kind không phải world",
      (m) => m.properties!.push(prop("kind", "dungeon")),
      /kind chỉ được là 'world'/,
    ],
    [
      "kích thước quá lớn",
      (m) => (m.width = TILED_MAX_SIDE + 1),
      /width \/ height phải là số nguyên/,
    ],
    ["kích thước không nguyên", (m) => (m.height = 16.5), /width \/ height phải là số nguyên/],
    ["tilewidth khác tileheight", (m) => (m.tileheight = 32), /tilewidth phải bằng tileheight/],
    [
      "monsterCap hỏng",
      (m) => m.properties!.push(prop("monsterCap", "{ không phải json")),
      /monsterCap không hợp lệ/,
    ],
    [
      "monsterCap số âm",
      (m) => m.properties!.push(prop("monsterCap", '{"slime":-1}')),
      /monsterCap không hợp lệ/,
    ],
    [
      "thiếu tileset logic",
      (m) => (m.tilesets = [{ firstgid: 1, name: "hinh" }]),
      /thiếu tileset 'logic'/,
    ],
    [
      "thiếu lớp logic",
      (m) => (m.layers = m.layers.filter((l) => l.name !== "logic")),
      /thiếu lớp ô 'logic'/,
    ],
    [
      "lớp logic sai số ô",
      (m) => (logic(m).data = (logic(m).data as number[]).slice(1)),
      /lớp logic có 255 ô, cần 256/,
    ],
    [
      "lớp logic nén base64",
      (m) => (logic(m).data = "eJztwQEBAAAAgiD/r25IQAEAAAAAAAAAAAAAAAAAAAAAAAAA"),
      /phải là MẢNG số/,
    ],
    [
      "ô logic ngoài khoảng (loại ô lạ)",
      (m) => ((logic(m).data as number[])[40] = 1 + LOGIC_TILE_COUNT),
      /lớp logic ô \d+,\d+/,
    ],
    ["ô logic trống (0)", (m) => ((logic(m).data as number[])[40] = 0), /lớp logic ô/],
    ["ô logic có cờ lật", (m) => ((logic(m).data as number[])[40] = 2 ** 31 + 1), /lớp logic ô/],
    ["ô logic không nguyên", (m) => ((logic(m).data as number[])[40] = 1.5), /lớp logic ô/],
    [
      "thiếu lớp objects",
      (m) => (m.layers = m.layers.filter((l) => l.name !== "objects")),
      /thiếu lớp đối tượng 'objects'/,
    ],
    [
      "không có town",
      (m) => (objects(m).splice(0, 1), undefined),
      /cần ĐÚNG một đối tượng 'town' \(có 0\)/,
    ],
    [
      "hai town",
      (m) => objects(m).push({ ...objects(m)[0]!, id: 7 }),
      /cần ĐÚNG một đối tượng 'town' \(có 2\)/,
    ],
    ["town r < 1", (m) => (objects(m)[0]!.properties = [prop("r", 0.5)]), /r phải >= 1 ô/],
    ["town ngoài bản đồ", (m) => (objects(m)[0]!.x = 99 * TW), /nằm ngoài bản đồ/],
    [
      "hai lair",
      (m) => {
        const lair = { id: 8, class: "lair", x: 5 * TW, y: 12 * TW, properties: [prop("r", 1)] };
        objects(m).push(lair, { ...lair, id: 9 });
      },
      /tối đa một đối tượng 'lair'/,
    ],
    [
      "cổng thiếu toMap",
      (m) =>
        (objects(m)[1]!.properties = objects(m)[1]!.properties!.filter((p) => p.name !== "toMap")),
      /thiếu thuộc tính chuỗi 'toMap'/,
    ],
    [
      "cổng spawnX không phải số",
      (m) =>
        (objects(m)[1]!.properties = objects(m)[1]!.properties!.map((p) =>
          p.name === "spawnX" ? prop("spawnX", "abc") : p,
        )),
      /thiếu thuộc tính số 'spawnX'/,
    ],
    [
      "cổng safeR < r",
      (m) =>
        (objects(m)[1]!.properties = objects(m)[1]!.properties!.map((p) =>
          p.name === "safeR" ? prop("safeR", 4) : p,
        )),
      /cần 0 < r <= safeR/,
    ],
    [
      "id cổng trùng",
      (m) => objects(m).push({ ...objects(m)[1]!, id: 12 }),
      /id 'thu_nho_bac' trùng/,
    ],
    ["thuộc tính khai hai lần", (m) => m.properties!.push(prop("name", "Khác")), /bị khai hai lần/],
  ];
  it("tệp mẫu là điểm xuất phát sạch", () => {
    expect(tiledViolations(fixture())).toEqual([]);
  });
  for (const [label, mutate, re] of cases) {
    it(`bắt: ${label}`, () => {
      const m = clone();
      mutate(m);
      const errs = tiledViolations(m);
      expect(errs.length, label).toBeGreaterThan(0);
      expect(errs.join("\n"), label).toMatch(re);
      expect(() => parseTiledMap(m, TILE), label).toThrow();
    });
  }
  it("không phải đối tượng JSON thì báo lỗi, không ném", () => {
    for (const bad of [null, undefined, 5, "x", [], { layers: 3 }])
      expect(tiledViolations(bad).length).toBeGreaterThan(0);
  });
});

describe("GameMap dựng từ `MapDef.tiles`", () => {
  it("ô dựng sẵn được dùng đúng (không sinh theo seed) và được CHÉP", () => {
    const def = mapDefFromTiled(fixture(), TILE);
    const map = new GameMap(def);
    expect(Array.from(map.tiles)).toEqual(Array.from(def.tiles!));
    expect(map.tiles).not.toBe(def.tiles);
    def.tiles![5 * 16 + 5] = T.Grass; // sửa nguồn sau khi dựng không đổi va chạm
    expect(map.tileAt(5, 5)).toBe(T.Water);
  });
  it("sai số ô hoặc loại ô lạ thì ném lỗi khi dựng", () => {
    const def = mapDefFromTiled(fixture(), TILE);
    expect(() => new GameMap({ ...def, tiles: new Uint8Array(255) })).toThrow(/tiles có 255 ô/);
    const bad = Uint8Array.from(def.tiles!);
    bad[10] = 99;
    expect(() => new GameMap({ ...def, tiles: bad })).toThrow(/không phải loại ô T/);
  });
  it("các kiểm cũ vẫn chạy với ô dựng sẵn: cổng trên ô chặn bị từ chối", () => {
    const m = clone();
    logic(m).data = (logic(m).data as number[]).map((v, i) => (i === 2 * 16 + 8 ? 1 + T.Rock : v));
    // tâm cổng ở ô (8, 2): nay là đá
    expect(() => new GameMap(mapDefFromTiled(m, TILE))).toThrow(/tâm cổng nằm trên ô chặn/);
  });
});

/**
 * Dựng tệp Tiled từ một `GameMap` có sẵn (bản thu nhỏ của công cụ `map:bake` ở lát cắt S2): chứng minh định dạng đủ biểu diễn BỐN bản đồ thật
 * và đọc lại cho đúng từng ô, cổng, trấn, độ nguy hiểm.
 */
function bake(map: GameMap): TiledMap {
  const { def } = map;
  const k = TW / TILE;
  const props = [
    prop("schema", TILED_SCHEMA),
    prop("id", def.id),
    prop("name", def.name),
    prop("townName", map.townName),
    prop("wildName", map.wildName),
    prop("monsterCap", JSON.stringify(map.monsterCap)),
  ];
  return {
    type: "map",
    orientation: "orthogonal",
    infinite: false,
    width: def.w,
    height: def.h,
    tilewidth: TW,
    tileheight: TW,
    properties: props,
    tilesets: [{ firstgid: 1, name: "logic" }],
    layers: [
      {
        type: "tilelayer",
        name: "logic",
        width: def.w,
        height: def.h,
        data: Array.from(map.tiles, (t) => t + 1),
      },
      {
        type: "objectgroup",
        name: "objects",
        objects: [
          {
            id: 1,
            name: "town",
            class: "town",
            x: (def.town.cx + 0.5) * TW,
            y: (def.town.cy + 0.5) * TW,
            point: true,
            properties: [prop("r", def.town.r)],
          },
          ...map.portals.map((p, i) => ({
            id: 10 + i,
            name: p.id,
            class: "portal",
            x: p.x * k,
            y: p.y * k,
            point: true,
            properties: [
              prop("id", p.id),
              prop("name", p.name),
              prop("toMap", p.toMap),
              prop("toPortal", p.toPortal),
              prop("r", p.r * k),
              prop("safeR", p.safeR * k),
              prop("spawnX", p.spawn.x * k),
              prop("spawnY", p.spawn.y * k),
            ],
          })),
        ],
      },
    ],
  };
}

describe("bốn bản đồ thật đi vòng qua tệp Tiled cho kết quả y hệt (bản thu nhỏ của S2)", () => {
  for (const def of MAPS) {
    it(`${def.id}: tiles, trấn, cổng, tên khu, monsterCap, dangerAt giống từng byte / từng số`, () => {
      const orig = getMap(def.id)!;
      const json = JSON.parse(JSON.stringify(bake(orig))) as TiledMap; // đi qua chuỗi JSON thật
      expect(tiledViolations(json)).toEqual([]);
      const back = new GameMap(mapDefFromTiled(json, TILE));
      expect(Buffer.from(back.tiles).equals(Buffer.from(orig.tiles))).toBe(true);
      expect([back.def.w, back.def.h]).toEqual([orig.def.w, orig.def.h]);
      expect(back.townPx).toEqual(orig.townPx);
      expect(back.townName).toBe(orig.townName);
      expect(back.wildName).toBe(orig.wildName);
      expect(back.portals).toEqual(orig.portals);
      expect(back.monsterCap).toEqual(orig.monsterCap);
      for (let i = 0; i < 200; i++) {
        const x = ((i * 977) % orig.worldW) + 0.5;
        const y = ((i * 1543) % orig.worldH) + 0.5;
        expect(back.dangerAt(x, y)).toBe(orig.dangerAt(x, y));
        expect(back.isBlockedPx(x, y)).toBe(orig.isBlockedPx(x, y));
        expect(back.inTown(x, y)).toBe(orig.inTown(x, y));
      }
    });
  }
});
