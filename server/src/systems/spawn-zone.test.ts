// Vùng sinh quái theo dữ liệu (S5, docs/THIET_KE_BAN_DO_TILED.md mục 6): loài có vùng chỉ sinh trong vùng (chữ nhật / elip, `max`, nhiều vùng theo diện tích); loài không khai vùng
// vẫn sinh theo cách cũ; vùng đè ô chặn / khu an toàn thì không sinh; trùm thế giới cũng sinh trong vùng.
// Dùng bản đồ TỰ DỰNG nhỏ (48 x 48, viền đá, một khối đá, trấn ở góc) để mọi con số tất định.
import { describe, expect, it } from "vitest";
import {
  GameMap,
  MONSTER_BY_ID,
  T,
  TILE,
  WORLD_BOSS_TZ_OFFSET_MS,
  inSpawnZone,
  sampleWorldBossSchedule,
  type SpawnZoneDef,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { makeWorld, addMonster } from "./test-helpers";
import { bossSpawnOk, spawnInitial, spawnMonster, topUpMonsters, zoneSpawnSpot } from "./monsters";
import { tickWorldBoss } from "./world-boss";
import { MIN_ZONE_SPOTS, spawnZoneViolations } from "./map-checks";
import { inMainRegion } from "./nav";

const SIDE = 48;

/** Cỏ, viền đá, một khối đá 6 x 6 ô ở (30..35, 30..35). Trấn ở (10, 10) bán kính 3 ô. */
function tiles(): Uint8Array {
  const t = new Uint8Array(SIDE * SIDE).fill(T.Grass);
  for (let i = 0; i < SIDE; i++) {
    t[i] = T.Rock;
    t[(SIDE - 1) * SIDE + i] = T.Rock;
    t[i * SIDE] = T.Rock;
    t[i * SIDE + SIDE - 1] = T.Rock;
  }
  for (let y = 30; y < 36; y++) for (let x = 30; x < 36; x++) t[y * SIDE + x] = T.Rock;
  return t;
}

function mapWith(
  zones: SpawnZoneDef[],
  monsterCap: Record<string, number> = { lang: 20, ho: 10 },
  edit?: (t: Uint8Array) => void,
): GameMap {
  const t = tiles();
  edit?.(t);
  return new GameMap({
    id: "thu_vung",
    name: "Thử Vùng",
    seed: 1,
    w: SIDE,
    h: SIDE,
    town: { cx: 10, cy: 10, r: 3 },
    monsterCap,
    tiles: t,
    spawnZones: zones,
  });
}

/**
 * Bản đồ rộng 80 x 32 với một trấn bán kính 15 ô ở giữa (50, 16) chạm gần hết chiều cao: với LƯỚI CỦA QUÁI (khu an toàn là tường) trấn cắt bản đồ làm hai nửa không qua lại được (nửa trái lớn = vùng chính,
 * nửa phải nhỏ), còn người chơi đi qua trấn được. Giống Âm Sương Trạch (B đo ở review #1214: nửa nhỏ ~20 % diện tích tách vì trấn).
 */
function townSplitMap(zones: SpawnZoneDef[]): GameMap {
  const w = 80;
  const h = 32;
  const t = new Uint8Array(w * h).fill(T.Grass);
  for (let x = 0; x < w; x++) {
    t[x] = T.Rock;
    t[(h - 1) * w + x] = T.Rock;
  }
  for (let y = 0; y < h; y++) {
    t[y * w] = T.Rock;
    t[y * w + w - 1] = T.Rock;
  }
  return new GameMap({
    id: "thu_rong",
    name: "Thử Rộng",
    seed: 1,
    w,
    h,
    town: { cx: 50, cy: 16, r: 15 },
    monsterCap: { lang: 5 },
    tiles: t,
    spawnZones: zones,
  });
}

/** Vòng đá bao kín (các ô x0..x1 x y0..y1, chỉ viền) để dựng phòng kín. */
const ringOf = (x0: number, y0: number, x1: number, y1: number) => (t: Uint8Array) => {
  for (let i = x0; i <= x1; i++) {
    t[y0 * SIDE + i] = T.Rock;
    t[y1 * SIDE + i] = T.Rock;
  }
  for (let j = y0; j <= y1; j++) {
    t[j * SIDE + x0] = T.Rock;
    t[j * SIDE + x1] = T.Rock;
  }
};

/** Khung (đơn vị Ô) -> vùng (px thế giới). */
function zone(
  monster: string,
  tx: number,
  ty: number,
  tw: number,
  th: number,
  extra: Partial<SpawnZoneDef> = {},
): SpawnZoneDef {
  return {
    monster,
    shape: "rect",
    x: tx * TILE,
    y: ty * TILE,
    w: tw * TILE,
    h: th * TILE,
    ...extra,
  };
}

const of = (w: ReturnType<typeof makeWorld>["w"], kind: string) =>
  [...w.state.monsters.values()].filter((m) => m.kind === kind);

describe("spawnZone: sinh trong vùng", () => {
  it("loài có vùng chỉ sinh TRONG vùng, đủ số lượng; loài không khai vùng vẫn sinh theo cách cũ (rải ngoài vùng)", () => {
    const z = zone("lang", 18, 18, 8, 8);
    const { w } = makeWorld(mapWith([z]));
    spawnInitial(w);
    const langs = of(w, "lang");
    expect(langs).toHaveLength(20);
    for (const m of langs) expect(inSpawnZone(z, m.x, m.y), `${m.x},${m.y}`).toBe(true);
    // loài `ho` không có vùng: cách cũ (theo dangerAt) rải khắp bản đồ, nên có con ngoài khung của vùng kia
    const hos = of(w, "ho");
    expect(hos.length).toBeGreaterThan(0);
    expect(hos.some((m) => !inSpawnZone(z, m.x, m.y))).toBe(true);
  });

  it("vùng ELIP: mọi con nằm trong elip, không con nào ở bốn góc khung", () => {
    const z = zone("lang", 16, 16, 12, 12, { shape: "ellipse" });
    const { w } = makeWorld(mapWith([z], { lang: 60 }));
    spawnInitial(w);
    const langs = of(w, "lang");
    expect(langs).toHaveLength(60);
    for (const m of langs) expect(inSpawnZone(z, m.x, m.y), `${m.x},${m.y}`).toBe(true);
    // góc trên-trái của khung: ngoài elip nhưng trong khung chữ nhật
    const corner = { x: z.x + 0.15 * z.w * 0.5, y: z.y + 0.15 * z.h * 0.5 };
    expect(inSpawnZone({ ...z, shape: "rect" }, corner.x, corner.y)).toBe(true);
    expect(inSpawnZone(z, corner.x, corner.y)).toBe(false);
  });

  it("`max` của vùng giới hạn số con cùng loài đang sống trong vùng, kể cả khi bổ sung quái bị giết", () => {
    const z = zone("lang", 18, 18, 8, 8, { max: 5 });
    const { w } = makeWorld(mapWith([z]));
    spawnInitial(w);
    expect(of(w, "lang")).toHaveLength(5); // cap 20 nhưng vùng chỉ chứa 5
    topUpMonsters(w);
    topUpMonsters(w);
    expect(of(w, "lang")).toHaveLength(5);
    // giết hai con: bổ sung đúng hai con (không hơn)
    const ids = [...w.state.monsters.entries()]
      .filter(([, m]) => m.kind === "lang")
      .map(([id]) => id);
    w.state.monsters.delete(ids[0]!);
    w.state.monsters.delete(ids[1]!);
    w.mctrl.delete(ids[0]!);
    w.mctrl.delete(ids[1]!);
    topUpMonsters(w);
    topUpMonsters(w);
    const langs = of(w, "lang");
    expect(langs).toHaveLength(5);
    for (const m of langs) expect(inSpawnZone(z, m.x, m.y)).toBe(true);
  });

  it("nhiều vùng cho một loài: chọn theo DIỆN TÍCH (vùng lớn gấp 4 nhận nhiều hơn rõ rệt), vùng nhỏ vẫn được dùng", () => {
    const big = zone("lang", 14, 14, 8, 8);
    const small = zone("lang", 38, 4, 4, 4);
    const { w } = makeWorld(mapWith([big, small]));
    for (let i = 0; i < 300; i++) spawnMonster(w, MONSTER_BY_ID.lang!);
    const langs = of(w, "lang");
    expect(langs).toHaveLength(300);
    const inBig = langs.filter((m) => inSpawnZone(big, m.x, m.y)).length;
    const inSmall = langs.filter((m) => inSpawnZone(small, m.x, m.y)).length;
    expect(inBig + inSmall).toBe(300); // không con nào ngoài hai vùng
    expect(inSmall).toBeGreaterThan(20);
    expect(inBig).toBeGreaterThan(inSmall * 2); // kỳ vọng 4:1
  });

  it("`max` theo từng vùng: vùng đã đầy thì con mới chỉ vào vùng còn chỗ", () => {
    const a = zone("lang", 14, 14, 8, 8, { max: 2 });
    const b = zone("lang", 38, 4, 6, 6);
    const { w } = makeWorld(mapWith([a, b]));
    for (let i = 0; i < 50; i++) spawnMonster(w, MONSTER_BY_ID.lang!);
    const langs = of(w, "lang");
    expect(langs).toHaveLength(50);
    expect(langs.filter((m) => inSpawnZone(a, m.x, m.y))).toHaveLength(2);
    expect(langs.filter((m) => inSpawnZone(b, m.x, m.y))).toHaveLength(48);
  });

  it("vùng đè một phần khối đá: không con nào đè ô chặn; vùng NẰM TRỌN trên đá hoặc trong khu an toàn thì không sinh và KHÔNG rơi về cách cũ", () => {
    const part = zone("lang", 28, 28, 10, 10); // quanh khối đá
    const m1 = makeWorld(mapWith([part]));
    for (let i = 0; i < 60; i++) spawnMonster(m1.w, MONSTER_BY_ID.lang!);
    expect(of(m1.w, "lang")).toHaveLength(60);
    for (const m of of(m1.w, "lang")) {
      expect(m1.w.map.circleBlocked(m.x, m.y, MONSTER_BY_ID.lang!.radius), `${m.x},${m.y}`).toBe(
        false,
      );
      expect(inSpawnZone(part, m.x, m.y)).toBe(true);
    }
    const onRock = zone("lang", 31, 31, 3, 3); // gọn trong khối đá 30..35
    const m2 = makeWorld(mapWith([onRock]));
    spawnInitial(m2.w);
    expect(of(m2.w, "lang")).toHaveLength(0);
    const inTown = zone("lang", 8, 8, 4, 4); // tâm trấn (10, 10), bán kính 3 ô
    const m3 = makeWorld(mapWith([inTown]));
    spawnInitial(m3.w);
    expect(of(m3.w, "lang")).toHaveLength(0);
  });

  it("`SPAWN_SPREAD_PX` vẫn áp trong vùng (hac_giao rải >= 700 px); không đủ chỗ thì bỏ lượt, không dồn", () => {
    const wide = zone("hac_giao", 4, 4, 40, 40); // gần cả bản đồ
    const { w } = makeWorld(mapWith([wide], { hac_giao: 3 }));
    spawnInitial(w);
    const gs = of(w, "hac_giao");
    expect(gs).toHaveLength(3);
    for (let i = 0; i < gs.length; i++)
      for (let j = i + 1; j < gs.length; j++)
        expect(Math.hypot(gs[i]!.x - gs[j]!.x, gs[i]!.y - gs[j]!.y)).toBeGreaterThanOrEqual(700);
    // vùng nhỏ (8 x 8 ô = 256 px) không chứa nổi hai con cách 700 px: chỉ con đầu vào
    const tiny = zone("hac_giao", 18, 18, 8, 8);
    const t = makeWorld(mapWith([tiny], { hac_giao: 3 }));
    spawnInitial(t.w);
    expect(of(t.w, "hac_giao")).toHaveLength(1);
  });
});

describe("spawnZone: trùm", () => {
  const HAN = MONSTER_BY_ID.thien_han_vuong!;

  it("trùm trong vùng: mọi chỗ đều qua `bossSpawnOk` (không sát đá) dù vùng chạm khối đá", () => {
    const z = zone("thien_han_vuong", 24, 24, 14, 14); // chạm khối đá 30..35
    const { w } = makeWorld(mapWith([z], { thien_han_vuong: 1 }));
    for (let i = 0; i < 30; i++) {
      const spot = zoneSpawnSpot(w, HAN, w.map.spawnZonesOf("thien_han_vuong"));
      expect(spot, `lần ${i}`).not.toBeNull();
      expect(inSpawnZone(z, spot!.x, spot!.y)).toBe(true);
      expect(bossSpawnOk(w, HAN, spot!.x, spot!.y), `${spot!.x},${spot!.y}`).toBe(true);
    }
  });

  it("`ignoreMax`: trùm thế giới là THÊM, vẫn có chỗ khi vùng đã đủ `max`; sinh thường thì hết chỗ", () => {
    const z = zone("thien_han_vuong", 18, 18, 10, 10, { max: 1 });
    const { w } = makeWorld(mapWith([z], { thien_han_vuong: 1 }));
    addMonster(w, "thien_han_vuong", z.x + z.w / 2, z.y + z.h / 2);
    const zones = w.map.spawnZonesOf("thien_han_vuong");
    expect(zoneSpawnSpot(w, HAN, zones)).toBeNull();
    expect(zoneSpawnSpot(w, HAN, zones, { ignoreMax: true })).not.toBeNull();
  });

  /** Chạy bộ lập lịch qua 12:00 ở bản đồ tự dựng `thu_vung` (lịch mẫu, trùm Thiên Hàn Vương); `pre` đặt quái trước khi tới giờ. */
  function runNoon(z: SpawnZoneDef, pre?: (w: ReturnType<typeof makeWorld>["w"]) => void) {
    const hub = new Hub();
    hub.worldBoss.slots = [{ ...sampleWorldBossSchedule()[0]!, mapId: "thu_vung" }];
    const { w } = makeWorld(mapWith([z], { lang: 4 }), hub);
    pre?.(w);
    const day0 = Date.UTC(2026, 10, 18) - WORLD_BOSS_TZ_OFFSET_MS;
    for (
      let t = day0 + 11 * 3600_000 + 59 * 60_000;
      t <= day0 + 12 * 3600_000 + 60_000;
      t += 1000
    ) {
      w.now = t;
      tickWorldBoss(w);
    }
    return w;
  }

  it("trùm thế giới theo giờ sinh TRONG vùng của bản đồ", () => {
    const z = zone("thien_han_vuong", 18, 18, 10, 10);
    const w = runNoon(z);
    expect(w.wbossId).not.toBeNull();
    const b = w.state.monsters.get(w.wbossId!)!;
    expect(b.kind).toBe("thien_han_vuong");
    expect(inSpawnZone(z, b.x, b.y), `${b.x},${b.y}`).toBe(true);
  });

  it("trùm thế giới KHÔNG chiếm chỗ `max` của vùng (như `topUpMonsters`): sinh thường cùng loài vẫn còn chỗ", () => {
    const z = zone("thien_han_vuong", 18, 18, 10, 10, { max: 1 });
    const w = runNoon(z);
    expect(w.wbossId).not.toBeNull();
    expect(of(w, "thien_han_vuong")).toHaveLength(1); // chỉ có trùm thế giới
    expect(zoneSpawnSpot(w, HAN, w.map.spawnZonesOf("thien_han_vuong"))).not.toBeNull();
  });

  it("trùm thế giới BỎ `max` của vùng: vùng đã đủ một con cùng loài vẫn sinh được (trùm thế giới là thêm)", () => {
    const z = zone("thien_han_vuong", 18, 18, 10, 10, { max: 1 });
    const w = runNoon(z, (x) => addMonster(x, "thien_han_vuong", z.x + z.w / 2, z.y + z.h / 2));
    expect(w.wbossId).not.toBeNull();
    const b = w.state.monsters.get(w.wbossId!)!;
    expect(inSpawnZone(z, b.x, b.y), `${b.x},${b.y}`).toBe(true);
    expect(of(w, "thien_han_vuong")).toHaveLength(2); // con thường đứng sẵn + trùm thế giới
  });
});

describe("spawnZoneViolations: kiểm vùng sinh trên dữ liệu (mục 5.5)", () => {
  it("vùng hợp lệ (cỏ thoáng) và bản đồ không khai vùng đều không có lỗi", () => {
    expect(spawnZoneViolations(mapWith([zone("lang", 18, 18, 8, 8)]))).toEqual([]);
    expect(spawnZoneViolations(mapWith([]))).toEqual([]);
  });

  it("vùng chồng MỘT PHẦN lên khối đá hoặc lên khu an toàn vẫn hợp lệ: đá / trấn bị lọc, không bị tính là túi kín", () => {
    expect(spawnZoneViolations(mapWith([zone("lang", 28, 28, 10, 10)]))).toEqual([]); // quanh khối đá
    expect(spawnZoneViolations(mapWith([zone("lang", 6, 6, 24, 8)]))).toEqual([]); // vắt qua trấn (10, 10)
  });

  it("loài không có trong monsterCap bị báo; trùm của lịch thế giới ở bản đồ này thì được", () => {
    const m = mapWith([zone("ho", 18, 18, 8, 8)], { lang: 5 });
    expect(spawnZoneViolations(m).join("\n")).toMatch(/\(ho\): loài này không có trong monsterCap/);
    const boss = mapWith([zone("thien_han_vuong", 18, 18, 8, 8)], { lang: 5 });
    expect(spawnZoneViolations(boss).join("\n")).toMatch(/thien_han_vuong/);
    const slot = { ...sampleWorldBossSchedule()[0]!, mapId: "thu_vung" };
    expect(spawnZoneViolations(boss, [slot])).toEqual([]);
    // lịch của bản đồ KHÁC không tính
    expect(spawnZoneViolations(boss, [{ ...slot, mapId: "han_van" }]).length).toBeGreaterThan(0);
  });

  it(`ngưỡng đúng ${MIN_ZONE_SPOTS} chỗ: khung 2 x 1 ô có đúng ${MIN_ZONE_SPOTS} điểm lưới thì qua, bớt nửa ô thì còn 6 và bị báo`, () => {
    expect(spawnZoneViolations(mapWith([zone("lang", 18, 18, 2, 1)]))).toEqual([]);
    const narrow: SpawnZoneDef = { ...zone("lang", 18, 18, 2, 1), w: 2 * TILE - 16 };
    expect(spawnZoneViolations(mapWith([narrow])).join("\n")).toMatch(/chỉ có 6 chỗ sinh hợp lệ/);
  });

  it("vùng nằm trọn trên đá hoặc trong khu an toàn: không có chỗ sinh nào", () => {
    const onRock = spawnZoneViolations(mapWith([zone("lang", 31, 31, 3, 3)]));
    expect(onRock.join("\n")).toMatch(/chỉ có 0 chỗ sinh hợp lệ/);
    const inTown = spawnZoneViolations(mapWith([zone("lang", 8, 8, 4, 4)]));
    expect(inTown.join("\n")).toMatch(/chỉ có 0 chỗ sinh hợp lệ/);
  });

  it(`vùng quá chật (ít hơn ${MIN_ZONE_SPOTS} chỗ) bị báo, đủ rộng thì qua`, () => {
    // ô cỏ duy nhất giữa khối đá và đá dựng thêm: khung 1 x 1 ô chỉ có 4 điểm lưới
    const one = spawnZoneViolations(mapWith([zone("lang", 18, 18, 1, 1)]));
    expect(one.join("\n")).toMatch(/chỉ có \d chỗ sinh hợp lệ/);
    expect(spawnZoneViolations(mapWith([zone("lang", 18, 18, 3, 3)]))).toEqual([]);
  });

  it("vùng chứa TÚI KÍN (đất đứng được bị đá bao kín) bị báo; bỏ vòng đá thì qua", () => {
    const pocket = (t: Uint8Array) => {
      for (let i = 20; i <= 25; i++) {
        t[38 * SIDE + i] = T.Rock;
        t[43 * SIDE + i] = T.Rock;
        t[(38 + (i - 20)) * SIDE + 20] = T.Rock;
        t[(38 + (i - 20)) * SIDE + 25] = T.Rock;
      }
    };
    const z = zone("lang", 19, 37, 8, 8); // phủ cả túi (21..24 x 39..42) lẫn đất ngoài
    const bad = spawnZoneViolations(mapWith([z], { lang: 5 }, pocket));
    expect(bad.join("\n")).toMatch(/túi kín/);
    expect(spawnZoneViolations(mapWith([z], { lang: 5 }))).toEqual([]);
  });

  it("vùng gọn trong túi kín: các chỗ trong túi KHÔNG được tính là chỗ sinh hợp lệ (0 chỗ) và báo túi kín", () => {
    const ring = (t: Uint8Array) => {
      for (let i = 20; i <= 25; i++) {
        t[38 * SIDE + i] = T.Rock;
        t[43 * SIDE + i] = T.Rock;
        t[(38 + (i - 20)) * SIDE + 20] = T.Rock;
        t[(38 + (i - 20)) * SIDE + 25] = T.Rock;
      }
    };
    const errs = spawnZoneViolations(mapWith([zone("lang", 21, 39, 4, 4)], { lang: 5 }, ring)).join(
      "\n",
    );
    expect(errs).toMatch(/chỉ có 0 chỗ sinh hợp lệ/);
    expect(errs).toMatch(/túi kín/);
  });

  it("hình elip loại bốn góc khung: túi kín nằm ở góc khung (ngoài elip) không bị tính; cùng khung dạng chữ nhật thì bị báo", () => {
    // túi (ô trong 4..5 x 28..29, vòng đá 3..6 x 27..30) ở góc trên-trái của khung 4..20 x 28..44, xa trấn (10, 10) hơn 200 px
    const ring = (t: Uint8Array) => {
      for (let i = 3; i <= 6; i++) {
        t[27 * SIDE + i] = T.Rock;
        t[30 * SIDE + i] = T.Rock;
      }
      for (let y = 27; y <= 30; y++) {
        t[y * SIDE + 3] = T.Rock;
        t[y * SIDE + 6] = T.Rock;
      }
    };
    const ell = zone("lang", 4, 28, 16, 16, { shape: "ellipse" });
    expect(spawnZoneViolations(mapWith([ell], { lang: 5 }, ring))).toEqual([]);
    const rect = { ...ell, shape: "rect" as const };
    expect(spawnZoneViolations(mapWith([rect], { lang: 5 }, ring)).join("\n")).toMatch(/túi kín/);
  });

  it("trấn CẮT bản đồ làm đôi (lưới quái coi trấn là tường): vùng trong nửa nhỏ vẫn HỢP LỆ vì người chơi đi qua trấn tới được (B đo Âm Sương ở review #1214)", () => {
    const lang = MONSTER_BY_ID.lang!;
    const right = zone("lang", 70, 8, 8, 16); // nửa phải (nhỏ), ngoài đệm an toàn 160 px của trấn
    const m = townSplitMap([right]);
    // tiền đề: với LƯỚI CỦA QUÁI hai nửa tách nhau (nửa phải KHÔNG thuộc vùng chính), nên luật cũ `inMainRegion` sẽ báo nhầm "túi kín"
    expect(inMainRegion(m, lang.radius * 0.8, 74 * TILE, 16 * TILE)).toBe(false);
    expect(inMainRegion(m, lang.radius * 0.8, 10 * TILE, 16 * TILE)).toBe(true);
    expect(spawnZoneViolations(m)).toEqual([]);
    const left = zone("lang", 5, 8, 8, 16);
    expect(spawnZoneViolations(townSplitMap([left]))).toEqual([]);
  });

  it("phòng BAO KÍN LỚN (hơn 400 nút: vượt ngưỡng nhỏ tuỳ ý) vẫn là túi kín: người chơi không tới được dù đi qua trấn", () => {
    // vòng đá 20..33 x 20..33, ô trong 21..32 (12 x 12 ô = 24 x 24 nút): phòng rộng, nhưng bao kín hoàn toàn
    const room = zone("lang", 22, 22, 8, 8);
    const errs = spawnZoneViolations(mapWith([room], { lang: 5 }, ringOf(20, 20, 33, 33)));
    expect(errs.join("\n")).toMatch(/túi kín/);
    expect(errs.join("\n")).toMatch(/chỉ có 0 chỗ sinh hợp lệ/);
    // bỏ vòng đá: cùng vùng hợp lệ
    expect(spawnZoneViolations(mapWith([room], { lang: 5 }))).toEqual([]);
    // chừa một khe 1 ô trên vòng (thân quái lọt): tới được nên hợp lệ
    const gap = (t: Uint8Array) => {
      ringOf(20, 20, 33, 33)(t);
      t[20 * SIDE + 26] = T.Grass;
    };
    expect(spawnZoneViolations(mapWith([room], { lang: 5 }, gap))).toEqual([]);
  });

  it("liên thông theo CỠ THÂN của loài: khe 1 ô cho quái nhỏ lọt nhưng trùm to không lọt thì phòng là túi kín với TRÙM", () => {
    const gap = (t: Uint8Array) => {
      ringOf(20, 20, 33, 33)(t);
      t[20 * SIDE + 26] = T.Grass; // khe rộng 1 ô (32 px) trên vòng đá
    };
    const room = (monster: string) => zone(monster, 22, 22, 8, 8);
    const cap = { lang: 5, thien_han_vuong: 1 };
    expect(spawnZoneViolations(mapWith([room("lang")], cap, gap))).toEqual([]);
    const boss = spawnZoneViolations(mapWith([room("thien_han_vuong")], cap, gap)).join("\n");
    expect(boss).toMatch(/túi kín/);
  });

  it("MỘT lần gọi, nhiều loài khác cỡ thân: mỗi loài loang theo cỡ thân RIÊNG (bộ nhớ đệm khoá theo cỡ, không dùng chung; ca của B, review #1214)", () => {
    const gap = (t: Uint8Array) => {
      ringOf(20, 20, 33, 33)(t);
      t[20 * SIDE + 26] = T.Grass; // khe 1 ô: quái nhỏ lọt, trùm to không
    };
    const room = (monster: string) => zone(monster, 22, 22, 8, 8);
    const cap = { lang: 5, thien_han_vuong: 1 };
    // cả hai thứ tự: nếu loài sau dùng nhầm lần loang của loài trước thì một trong hai bị báo sai
    for (const order of [
      ["lang", "thien_han_vuong"],
      ["thien_han_vuong", "lang"],
    ]) {
      const errs = spawnZoneViolations(mapWith(order.map(room), cap, gap)).join("\n");
      expect(errs, order.join(",")).toMatch(
        /\(thien_han_vuong\): \d+ chỗ đứng được nằm trong túi kín/,
      );
      expect(errs, order.join(",")).not.toMatch(/\(lang\): \d+ chỗ đứng được nằm trong túi kín/);
    }
  });

  it("lời báo cho TRÙM nêu LÝ DO: nửa nhỏ do trấn cắt (ngoài vùng chính) khác với sát cây / đá; quái thường ở nửa nhỏ thì hợp lệ", () => {
    const HANV = MONSTER_BY_ID.thien_han_vuong!;
    const slot = { ...sampleWorldBossSchedule()[0]!, mapId: "thu_rong" };
    const right = zone("thien_han_vuong", 70, 8, 8, 16); // nửa phải (nhỏ), ngoài đệm an toàn của trấn
    const m = townSplitMap([right]);
    expect(inMainRegion(m, HANV.radius * 0.8, 74 * TILE, 16 * TILE)).toBe(false); // tiền đề
    const errs = spawnZoneViolations(m, [slot]).join("\n");
    expect(errs).toMatch(/chỉ có 0 chỗ sinh hợp lệ/);
    expect(errs).toMatch(/chỗ ngoài vùng chính của lưới quái cho trùm \(trấn có thể cắt bản đồ/);
    // lý do CHÍNH là ngoài vùng chính (vài chỗ sát viền đá thật vẫn được kể riêng, nên không đòi vắng hẳn "sát cây / đá")
    const outside = Number(/(\d+) chỗ ngoài vùng chính/.exec(errs)?.[1]);
    const tight = Number(/(\d+) chỗ sát cây/.exec(errs)?.[1] ?? 0);
    expect(outside).toBeGreaterThan(tight * 5);
    // vùng sát đá (không do trấn): lý do là sát cây / đá, KHÔNG nhắc vùng chính
    const near = spawnZoneViolations(
      mapWith([zone("thien_han_vuong", 28, 30, 2, 4)], { lang: 5, thien_han_vuong: 1 }),
    ).join("\n");
    expect(near).toMatch(/chỉ có 0 chỗ sinh hợp lệ/);
    expect(near).toMatch(/chỗ sát cây \/ đá/);
    expect(near).not.toMatch(/ngoài vùng chính/);
    // quái thường ở cùng nửa nhỏ: hợp lệ (không có phần "bị loại")
    expect(spawnZoneViolations(townSplitMap([zone("lang", 70, 8, 8, 16)]))).toEqual([]);
  });

  it("trùm: vùng sát đá (mọi chỗ trong 62 px quanh đá) không có chỗ `bossSpawnOk`; quái thường cùng vùng thì qua", () => {
    const z = (m: string) => zone(m, 28, 30, 2, 4); // sát khối đá 30..35 ở phía trái
    const cap = { lang: 5, thien_han_vuong: 1 };
    expect(spawnZoneViolations(mapWith([z("lang")], cap))).toEqual([]);
    expect(spawnZoneViolations(mapWith([z("thien_han_vuong")], cap)).join("\n")).toMatch(
      /chỉ có 0 chỗ sinh hợp lệ/,
    );
  });

  it("tổng `max` các vùng nhỏ hơn monsterCap bị báo; có một vùng không khai `max` thì qua", () => {
    const a = zone("lang", 14, 14, 6, 6, { max: 5 });
    const b = zone("lang", 38, 4, 6, 6, { max: 3 });
    const bad = spawnZoneViolations(mapWith([a, b], { lang: 20 }));
    expect(bad.join("\n")).toMatch(/tổng max các vùng \(8\) nhỏ hơn monsterCap \(20\)/);
    expect(spawnZoneViolations(mapWith([a, b], { lang: 8 }))).toEqual([]);
    expect(spawnZoneViolations(mapWith([a, { ...b, max: undefined }], { lang: 20 }))).toEqual([]);
  });
});
