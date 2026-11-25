// BỐN bản đồ thường là TỆP Tiled (`shared/maps/<id>.logic.json`, lát cắt S2): phải cho CÙNG kết quả từng byte so với bản sinh theo `seed` (`PROCEDURAL_MAPS`, "đồng hồ chuẩn"),
// tệp đúng là sản phẩm của công cụ `map:bake`, và cổng giữa các bản đồ đi theo cặp. Khi bản đồ đầu tiên được sửa TAY (S6) nó ra khỏi `PROCEDURAL_MAPS`: gỡ các ca "giống seed" / "đúng bản sinh" của riêng nó.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ARENA_MAPS,
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  GameMap,
  MAPS,
  MAP_BY_ID,
  PROCEDURAL_MAPS,
  adoptTiledMaps,
  arenaMapIdOf,
  dangerAt,
  getMap,
  tileAt,
  type MapDef,
} from "./map";
import { portalLinkViolations } from "./map-checks";
import { bakeTiledMap, formatTiledJson } from "./tiled-bake";
import { tiledViolations, type TiledMap } from "./tiled";
import { TILED_MAP_FILES, adoptTiledMapFiles } from "./map-files";

const mapsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../maps");
/** Tệp của `id` có đánh dấu sửa tay (`handEdited` = true) không: đọc thẳng thuộc tính bản đồ của JSON. */
const handEditedFile = (id: string): boolean => {
  const props = (TILED_MAP_FILES[id] as { properties?: { name?: string; value?: unknown }[] })
    ?.properties;
  return !!props?.some((p) => p.name === "handEdited" && p.value === true);
};
const readText = (id: string) => readFileSync(path.join(mapsDir, `${id}.logic.json`), "utf8");

// Server nhận tệp lúc `defineRooms`; client (S2) chưa nhận nên vẫn sinh theo seed. Ở đây nhận để kiểm CHÍNH các tệp.
beforeAll(() => {
  adoptTiledMapFiles();
});

describe("bốn bản đồ thường đọc từ tệp Tiled == bản sinh theo seed (S2)", () => {
  it("adoptTiledMapFiles nhận đủ bốn tệp; MAPS / MAP_BY_ID / getMap thấy bản dựng từ tệp (có ô dựng sẵn, không còn sinh theo seed)", () => {
    expect(adoptTiledMapFiles().sort()).toEqual(Object.keys(TILED_MAP_FILES).sort());
    for (const def of PROCEDURAL_MAPS) {
      expect(MAPS.find((m) => m.id === def.id)!.tiles).toBeDefined();
      expect(MAP_BY_ID[def.id]!.tiles).toBeDefined();
      expect(getMap(def.id)!.def.tiles).toBeDefined();
      expect(def.tiles).toBeUndefined(); // định nghĩa sinh theo seed vẫn nguyên làm đồng hồ chuẩn
    }
  });
  it("DEFAULT_MAP (dựng một lần lúc nạp module) KHÁC getMap(DEFAULT_MAP_ID) sau khi nhận tệp, nhưng cùng từng byte: vì thế mã nguồn phải dùng getMap, không nhập DEFAULT_MAP (no-global-map-imports canh)", () => {
    adoptTiledMapFiles();
    const now = getMap(DEFAULT_MAP_ID)!;
    expect(now).not.toBe(DEFAULT_MAP);
    expect(now.def.tiles).toBeDefined();
    expect(DEFAULT_MAP.def.tiles).toBeUndefined();
    // cùng từng byte với bản sinh theo seed, TRỪ khi Lạc Hà đã SỬA TAY (S6: khi đó khác nhau chính là lý do không được nhập `DEFAULT_MAP`)
    if (!handEditedFile(DEFAULT_MAP_ID))
      expect(Buffer.from(now.tiles).equals(Buffer.from(DEFAULT_MAP.tiles))).toBe(true);
    // các hàm tên cũ tra bản mới nhất mỗi lần gọi
    expect(tileAt(10, 10)).toBe(now.tileAt(10, 10));
    expect(dangerAt(40, 40)).toBe(now.dangerAt(40, 40));
  });
  it("adoptTiledMaps từ chối id không phải bản đồ thường, tệp sai, và tệp khai lệch id", () => {
    expect(() => adoptTiledMaps({ khong_co: TILED_MAP_FILES.lac_ha })).toThrow(
      /không phải bản đồ thường/,
    );
    expect(() => adoptTiledMaps({ lac_ha: { rac: true } })).toThrow();
    expect(() => adoptTiledMaps({ lac_ha: TILED_MAP_FILES.hac_phong })).toThrow(
      /khai id 'hac_phong'/,
    );
    expect(getMap("lac_ha")!.def.tiles).toBeDefined(); // lỗi không làm hỏng bản đã nhận
  });

  it("MAPS cùng id, cùng thứ tự với PROCEDURAL_MAPS", () => {
    expect(MAPS.map((m) => m.id)).toEqual(PROCEDURAL_MAPS.map((m) => m.id));
    expect(MAPS.length).toBe(5);
  });

  for (const def of PROCEDURAL_MAPS) {
    // Bản đồ SỬA TAY (S6): thuộc tính bản đồ `handEdited` = true (cùng tên với `server/src/systems/map-hand-edited.ts`): tệp là nguồn duy nhất, không còn bằng bản sinh theo seed
    if (handEditedFile(def.id)) {
      describe(`${def.id} (SỬA TAY: tệp là nguồn duy nhất, không so với seed)`, () => {
        it("tệp hợp lệ theo tiledViolations; getMap thấy bản dựng từ tệp (có ô dựng sẵn)", () => {
          expect(tiledViolations(TILED_MAP_FILES[def.id])).toEqual([]);
          expect(getMap(def.id)!.def.tiles).toBeDefined();
        });

        // Sổ PROCEDURAL_MAPS vẫn là nguồn của đấu trường (`seed + 7919`, tên) và của `mapById`, còn game chạy từ TỆP: mọi thứ KHÔNG phải ô phải khớp, nếu không hai nơi nói hai chuyện
        // (A2 #1467: lúc đăng ký Lang Hoang, dán sai toạ độ cổng hoặc quên `monsterCap` ở một bên thì chỉ lộ khi chơi)
        it("sổ đăng ký khớp tệp ở mọi thứ KHÔNG phải ô: kích thước, trấn, tên, hạt giống, monsterCap, hang, cổng", () => {
          const file = getMap(def.id)!;
          const reg = new GameMap(def);
          expect([file.def.w, file.def.h]).toEqual([reg.def.w, reg.def.h]);
          expect(file.def.town).toEqual(reg.def.town);
          expect(file.townPx).toEqual(reg.townPx);
          expect(file.townName).toBe(reg.townName);
          expect(file.wildName).toBe(reg.wildName);
          expect(file.def.name).toBe(reg.def.name);
          expect(file.def.seed).toBe(reg.def.seed);
          expect(file.monsterCap).toEqual(reg.monsterCap);
          expect(file.def.monsterCap).toEqual(reg.def.monsterCap);
          expect(file.lairPx).toEqual(reg.lairPx);
          expect(file.portals).toEqual(reg.portals);
        });
      });
      continue;
    }
    describe(def.id, () => {
      const file = getMap(def.id)!;
      const seed = new GameMap(def);

      it("ô (tiles) giống từng byte; kích thước, trấn, tên khu, hạt giống trang trí, monsterCap, hang giống", () => {
        expect(Buffer.from(file.tiles).equals(Buffer.from(seed.tiles))).toBe(true);
        expect([file.def.w, file.def.h]).toEqual([seed.def.w, seed.def.h]);
        expect(file.def.town).toEqual(seed.def.town);
        expect(file.townPx).toEqual(seed.townPx);
        expect(file.townName).toBe(seed.townName);
        expect(file.wildName).toBe(seed.wildName);
        expect(file.def.name).toBe(seed.def.name);
        expect(file.def.seed).toBe(seed.def.seed); // WorldScene dùng `def.seed` bố trí sương mù
        expect(file.monsterCap).toEqual(seed.monsterCap);
        expect(file.def.monsterCap).toEqual(seed.def.monsterCap);
        expect(file.lairPx).toEqual(seed.lairPx);
      });

      it("cổng giống từng số (tâm, bán kính, chỗ xuất hiện, đích)", () => {
        expect(file.portals).toEqual(seed.portals);
      });

      it("300 điểm mẫu: dangerAt, isBlockedPx, inTown, inSafe, circleBlocked giống", () => {
        for (let i = 0; i < 300; i++) {
          const x = ((i * 977) % seed.worldW) + 0.5;
          const y = ((i * 1543) % seed.worldH) + 0.5;
          expect(file.dangerAt(x, y)).toBe(seed.dangerAt(x, y));
          expect(file.isBlockedPx(x, y)).toBe(seed.isBlockedPx(x, y));
          expect(file.inTown(x, y)).toBe(seed.inTown(x, y));
          expect(file.inSafe(x, y)).toBe(seed.inSafe(x, y));
          expect(file.circleBlocked(x, y, 11)).toBe(seed.circleBlocked(x, y, 11));
        }
      });

      it("tệp hợp lệ theo tiledViolations và ĐÚNG là sản phẩm của map:bake (idempotent: ghi lại ra cùng chuỗi)", () => {
        const text = readText(def.id);
        expect(tiledViolations(JSON.parse(text))).toEqual([]);
        expect(formatTiledJson(bakeTiledMap(seed))).toBe(text);
      });
    });
  }

  it("đấu trường chặn đường vẫn dựng từ hạt giống / tên của định nghĩa sinh theo seed (không đổi theo tệp)", () => {
    expect(ARENA_MAPS.length).toBe(PROCEDURAL_MAPS.length);
    PROCEDURAL_MAPS.forEach((m, i) => {
      const a = ARENA_MAPS[i]!;
      expect(a.id).toBe(arenaMapIdOf(m.id));
      expect(a.seed).toBe((m.seed + 7919) >>> 0);
      expect(a.wildName).toBe(m.wildName ?? m.name);
      expect(getMap(a.id)).toBeDefined();
    });
  });
});

describe("formatTiledJson: tất định, đọc được, vẫn là JSON hợp lệ", () => {
  const json = bakeTiledMap(getMap("lac_ha")!);
  const text = formatTiledJson(json);
  it("đọc lại bằng JSON.parse ra đúng cấu trúc ban đầu; kết thúc bằng xuống dòng; gọi hai lần ra cùng chuỗi", () => {
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(json)));
    expect(text.endsWith("}\n")).toBe(true);
    expect(formatTiledJson(json)).toBe(text);
  });
  it("mỗi HÀNG ô logic một dòng (96 dòng dữ liệu cho bản đồ 96 hàng), không đổ cả mảng thành một cột", () => {
    const rows = text.split("\n").filter((l) => /^ {3}\d+(,\d+){95},?$/.test(l));
    expect(rows.length).toBe(96);
  });
  it("không làm hỏng dữ liệu khi có hai lớp ô (mỗi lớp thay đúng mảng của mình)", () => {
    const two: TiledMap = structuredClone(json);
    two.layers.splice(1, 0, {
      type: "tilelayer",
      name: "ground",
      width: 96,
      height: 96,
      data: Array(96 * 96).fill(3),
    });
    const back = JSON.parse(formatTiledJson(two)) as TiledMap;
    expect(back.layers.map((l) => l.name)).toEqual(["logic", "ground", "objects"]);
    expect((back.layers[1]!.data as number[]).every((v) => v === 3)).toBe(true);
    expect(back.layers[0]!.data).toEqual(json.layers[0]!.data);
  });
});

describe("portalLinkViolations: cổng đi theo cặp", () => {
  it("bốn bản đồ thật hợp lệ", () => {
    expect(portalLinkViolations(MAPS)).toEqual([]);
  });
  const clone = (): MapDef[] => structuredClone(MAPS) as MapDef[];
  const edit = (
    maps: MapDef[],
    mapId: string,
    portalId: string,
    patch: Record<string, unknown>,
  ) => {
    const m = maps.find((x) => x.id === mapId)!;
    (m as { portals: unknown }).portals = m.portals!.map((p) =>
      p.id === portalId ? { ...p, ...patch } : p,
    );
  };
  const cases: [string, (m: MapDef[]) => void, RegExp][] = [
    [
      "toMap không phải bản đồ nào",
      (m) => edit(m, "lac_ha", "lac_ha_bac", { toMap: "khong_co" }),
      /toMap 'khong_co' không phải bản đồ nào/,
    ],
    [
      "toPortal không có ở bản đồ đích",
      (m) => edit(m, "lac_ha", "lac_ha_bac", { toPortal: "khong_co" }),
      /toPortal 'khong_co' không có ở bản đồ hac_phong/,
    ],
    [
      "cổng đích không trỏ ngược lại (trỏ sang bản đồ khác)",
      (m) => edit(m, "hac_phong", "hac_phong_nam", { toMap: "am_suong", toPortal: "am_suong_nam" }),
      /không trỏ ngược về/,
    ],
    [
      "cổng đích trỏ ngược nhưng sai cổng",
      (m) => edit(m, "hac_phong", "hac_phong_nam", { toPortal: "hac_phong_bac" }),
      /không trỏ ngược về|không trỏ ngược/,
    ],
    [
      "cổng trỏ về chính bản đồ này",
      (m) => edit(m, "lac_ha", "lac_ha_bac", { toMap: "lac_ha", toPortal: "lac_ha_bac" }),
      /trỏ về chính bản đồ này/,
    ],
    [
      "id cổng trùng giữa hai bản đồ",
      (m) => edit(m, "am_suong", "am_suong_nam", { id: "lac_ha_bac" }),
      /id cổng trùng/,
    ],
  ];
  for (const [label, mutate, re] of cases) {
    it(`bắt: ${label}`, () => {
      const m = clone();
      mutate(m);
      const errs = portalLinkViolations(m);
      expect(errs.length, label).toBeGreaterThan(0);
      expect(errs.join("\n"), label).toMatch(re);
    });
  }
});
