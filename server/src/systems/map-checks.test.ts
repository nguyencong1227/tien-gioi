// Kiểm liên thông bản đồ cho người chơi (docs/THIET_KE_BAN_DO_TILED.md mục 5.4): bản đồ thật qua; bản đồ bị ĐỘT BIẾN (khoanh cổng bằng đá, bao kín trấn, chặn tâm trấn) thì bị bắt đúng chỗ.
import { beforeAll, describe, expect, it } from "vitest";
import {
  GameMap,
  MAPS,
  T,
  TILE,
  bakeTiledMap,
  getMap,
  mapDefFromTiled,
  type TiledMap,
} from "@tien-gioi/shared";
import { adoptTiledMapFiles } from "@tien-gioi/shared/src/map-files";
import { reachabilityViolations, spawnZoneViolations } from "./map-checks";

// Kiểm CHÍNH các tệp Tiled (server nhận tệp lúc defineRooms)
beforeAll(() => {
  adoptTiledMapFiles();
});

/** Dựng `GameMap` từ bản đồ thật `id` sau khi sửa lớp logic bằng `edit(đặt ô, w, h)`. */
function mutated(
  id: string,
  edit: (set: (x: number, y: number, t: T) => void, w: number, h: number) => void,
): GameMap {
  const json: TiledMap = structuredClone(bakeTiledMap(getMap(id)!));
  const w = json.width;
  const h = json.height;
  const data = json.layers.find((l) => l.name === "logic")!.data as number[];
  edit(
    (x, y, t) => {
      if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = 1 + t;
    },
    w,
    h,
  );
  return new GameMap(mapDefFromTiled(json, TILE));
}

describe("reachabilityViolations", () => {
  for (const def of MAPS)
    it(`${def.id} (bản đồ thật): từ tâm trấn tới được mọi cổng`, () => {
      expect(reachabilityViolations(getMap(def.id)!)).toEqual([]);
    });

  it("ĐỘT BIẾN: khoanh kín chỗ xuất hiện của cổng bắc Lạc Hà bằng vòng đá => bắt 'chỗ xuất hiện'", () => {
    const base = getMap("lac_ha")!;
    const p = base.portals[0]!;
    const sx = Math.floor(p.spawn.x / TILE);
    const sy = Math.floor(p.spawn.y / TILE);
    const sealed = mutated("lac_ha", (set) => {
      for (let y = sy - 3; y <= sy + 3; y++)
        for (let x = sx - 3; x <= sx + 3; x++)
          if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) === 3) set(x, y, T.Rock);
    });
    const errs = reachabilityViolations(sealed);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join("\n")).toMatch(
      /chỗ xuất hiện của cổng lac_ha_bac .* không tới được từ tâm trấn/,
    );
  });

  it("ĐIỀU KHIỂN: cùng vòng đá nhưng chừa một khe 2 ô thì VẪN tới được (kiểm không quá chặt)", () => {
    const base = getMap("lac_ha")!;
    const p = base.portals[0]!;
    const sx = Math.floor(p.spawn.x / TILE);
    const sy = Math.floor(p.spawn.y / TILE);
    const gap = mutated("lac_ha", (set) => {
      for (let y = sy - 3; y <= sy + 3; y++)
        for (let x = sx - 3; x <= sx + 3; x++)
          if (
            Math.max(Math.abs(x - sx), Math.abs(y - sy)) === 3 &&
            !(y === sy + 3 && (x === sx || x === sx + 1))
          )
            set(x, y, T.Rock);
    });
    // khe phía nam (hướng về trấn) mở thì không còn cô lập
    expect(reachabilityViolations(gap)).toEqual([]);
  });

  it("ĐỘT BIẾN: bao kín cả trấn bằng vành núi đá dày => mọi cổng không tới được từ trấn", () => {
    const base = getMap("lac_ha")!;
    const { cx, cy } = base.def.town;
    const walled = mutated("lac_ha", (set, w, h) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d >= base.def.town.r + 3 && d <= base.def.town.r + 5) set(x, y, T.Rock);
        }
    });
    const errs = reachabilityViolations(walled);
    for (const portal of base.portals) expect(errs.join("\n")).toContain(`tâm cổng ${portal.id}`);
  });

  it("ĐỘT BIẾN: chặn ngay tâm trấn bằng đá => 'không đứng được'", () => {
    const base = getMap("lac_ha")!;
    const { cx, cy } = base.def.town;
    const blocked = mutated("lac_ha", (set) => {
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let x = cx - 1; x <= cx + 1; x++) set(x, y, T.Rock);
    });
    expect(reachabilityViolations(blocked).join("\n")).toMatch(/tâm trấn .* không đứng được/);
  });
});

/** Bản đồ thật `id` + MỘT đối tượng `spawnZone` chèn vào tệp Tiled (đúng đường S6: người soạn thêm đối tượng vào tệp, `parseTiledMap` đọc, `GameMap` dựng). Khung tính theo ô. */
function withZone(
  id: string,
  z: { tx: number; ty: number; tw: number; th: number; monster: string; max?: number },
): GameMap {
  const json: TiledMap = structuredClone(bakeTiledMap(getMap(id)!));
  json.layers
    .find((l) => l.name === "objects")!
    .objects!.push({
      id: 99,
      name: "vung_thu",
      class: "spawnZone",
      x: z.tx * json.tilewidth,
      y: z.ty * json.tilewidth,
      width: z.tw * json.tilewidth,
      height: z.th * json.tilewidth,
      properties: [
        { name: "monster", value: z.monster },
        ...(z.max !== undefined ? [{ name: "max", value: z.max }] : []),
      ],
    });
  return new GameMap(mapDefFromTiled(json, TILE));
}

/** Tâm ô (tx, ty) của ô cỏ đầu tiên mà khung `n x n` quanh nó toàn cỏ, cách trấn > 25 ô (quét tất định). */
function openGrass(map: GameMap, n: number): { tx: number; ty: number } {
  const t = map.def.town;
  for (let ty = 2; ty < map.def.h - n - 2; ty++)
    for (let tx = 2; tx < map.def.w - n - 2; tx++) {
      if (Math.hypot(tx + n / 2 - t.cx, ty + n / 2 - t.cy) < 25 + n) continue;
      let all = true;
      for (let y = ty; y < ty + n && all; y++)
        for (let x = tx; x < tx + n && all; x++) if (map.tileAt(x, y) !== T.Grass) all = false;
      if (all) return { tx, ty };
    }
  throw new Error(`không có khoảng cỏ ${n} x ${n} ở ${map.def.id}`);
}

describe("spawnZoneViolations trên bản đồ thật (lưới an toàn cho S6)", () => {
  for (const def of MAPS)
    it(`${def.id} (bản đồ thật, lịch trùm thế giới thật): mọi vùng sinh khai trong tệp đều hợp lệ`, () => {
      expect(spawnZoneViolations(getMap(def.id)!)).toEqual([]);
    });

  it("đường tệp: vùng chèn vào tệp Tiled của Lạc Hà được đọc và kiểm; đất cỏ thoáng hợp lệ, vùng đè TRẤN thì bị bắt", () => {
    const base = getMap("lac_ha")!;
    const g = openGrass(base, 6);
    const ok = withZone("lac_ha", { ...g, tw: 6, th: 6, monster: "lang" });
    expect(ok.spawnZones).toHaveLength(1); // tệp -> parse -> GameMap giữ vùng
    expect(ok.spawnZonesOf("lang")).toHaveLength(1);
    expect(spawnZoneViolations(ok)).toEqual([]);
    const t = base.def.town;
    const onTown = withZone("lac_ha", {
      tx: t.cx - 2,
      ty: t.cy - 2,
      tw: 4,
      th: 4,
      monster: "lang",
    });
    expect(spawnZoneViolations(onTown).join("\n")).toMatch(/chỉ có 0 chỗ sinh hợp lệ/);
    // trùm ở NỬA NHỎ do trấn cắt Âm Sương, nhiều cây: mọi chỗ ứng viên vừa sát cây / đá vừa ngoài vùng chính (B đo ở review #1218); cả hai lý do phải được báo, không chỉ "sát cây"
    const half = withZone("am_suong", { tx: 97, ty: 61, tw: 4, th: 4, monster: "hac_giao" });
    const why = spawnZoneViolations(half).join("\n");
    expect(why).toMatch(/\d+ chỗ sát cây \/ đá/);
    expect(why).toMatch(/\d+ chỗ ngoài vùng chính của lưới quái cho trùm/);
    // loài không có ở bản đồ này (Lạc Hà không sinh Hắc Giao): báo
    const wrong = withZone("lac_ha", { ...g, tw: 6, th: 6, monster: "hac_giao" });
    expect(spawnZoneViolations(wrong).join("\n")).toMatch(/không có trong monsterCap/);
  });
});
