import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  TILE,
  MAP_W,
  MAP_H,
  MAP_SEED,
  MAP_TILES,
  TOWN,
  TOWN_PX,
  BLOCKING,
  T,
  tileAt,
  isBlockedPx,
  circleBlocked,
  moveWithCollision,
  inTown,
  dangerAt,
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  GameMap,
  MAPS,
  MAX_BOSSES_PER_MAP,
  MAP_BY_ID,
  WORLD_W,
  WORLD_H,
  getMap,
  HAC_PHONG_ID,
  AM_SUONG_ID,
  HAN_VAN_ID,
  type MapDef,
  type PortalDef,
} from "./map";
import { MONSTERS, MONSTER_CAP, PLAYER_RADIUS } from "./game";

/** Bộ sinh số ngẫu nhiên cố định để test lặp lại được. */
function rng(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

describe("bản đồ", () => {
  it("có đúng kích thước", () => {
    expect(MAP_TILES).toHaveLength(MAP_W * MAP_H);
  });

  it("viền bản đồ là núi đá, ra ngoài bản đồ cũng bị chặn", () => {
    for (let x = 0; x < MAP_W; x++) {
      expect(tileAt(x, 0)).toBe(T.Rock);
      expect(tileAt(x, MAP_H - 1)).toBe(T.Rock);
    }
    for (let y = 0; y < MAP_H; y++) {
      expect(tileAt(0, y)).toBe(T.Rock);
      expect(tileAt(MAP_W - 1, y)).toBe(T.Rock);
    }
    expect(tileAt(-1, 5)).toBe(T.Rock);
    expect(tileAt(5, MAP_H)).toBe(T.Rock);
  });

  it("Lạc Hà Trấn lát đá và đi lại được", () => {
    expect(tileAt(TOWN.cx, TOWN.cy)).toBe(T.Stone);
    expect(circleBlocked(TOWN_PX.x, TOWN_PX.y, PLAYER_RADIUS)).toBe(false);
    expect(inTown(TOWN_PX.x, TOWN_PX.y)).toBe(true);
    expect(dangerAt(TOWN_PX.x, TOWN_PX.y)).toBe(0);
  });

  it("phần lớn vùng đi được nối liền với trấn", () => {
    // Loang từ trấn qua các ô không chặn
    const seen = new Uint8Array(MAP_W * MAP_H);
    const stack = [TOWN.cy * MAP_W + TOWN.cx];
    seen[stack[0]] = 1;
    let reached = 0;
    while (stack.length) {
      const i = stack.pop()!;
      reached++;
      const x = i % MAP_W,
        y = (i / MAP_W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          j = ny * MAP_W + nx;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= MAP_W ||
          ny >= MAP_H ||
          seen[j] ||
          BLOCKING.has(MAP_TILES[j] as T)
        )
          continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    const walkable = MAP_TILES.filter((t) => !BLOCKING.has(t as T)).length;
    expect(reached / walkable).toBeGreaterThan(0.6);
  });
});

describe("va chạm", () => {
  it("không đi xuyên tường khi lao thẳng ra viền bản đồ", () => {
    let p = { x: TOWN_PX.x, y: TOWN_PX.y };
    for (let i = 0; i < 2000; i++) p = moveWithCollision(p.x, p.y, -8, 0, PLAYER_RADIUS);
    expect(circleBlocked(p.x, p.y, PLAYER_RADIUS)).toBe(false);
    expect(p.x).toBeGreaterThan(TILE); // không lọt vào cột núi đá ở viền trái
  });

  it("đi ngẫu nhiên 5000 bước không bao giờ kẹt vào ô chặn", () => {
    const r = rng(42);
    let p = { x: TOWN_PX.x, y: TOWN_PX.y };
    for (let i = 0; i < 5000; i++) {
      const a = r() * Math.PI * 2;
      p = moveWithCollision(p.x, p.y, Math.cos(a) * 9, Math.sin(a) * 9, PLAYER_RADIUS);
      expect(circleBlocked(p.x, p.y, PLAYER_RADIUS)).toBe(false);
    }
  });

  it("trượt dọc tường: chạm tường theo X vẫn đi được theo Y", () => {
    // Tìm một ô chặn có ô trống ngay bên trái và một dải trống phía trên/dưới bên trái
    for (let ty = 3; ty < MAP_H - 3; ty++) {
      for (let tx = 3; tx < MAP_W - 3; tx++) {
        if (!BLOCKING.has(tileAt(tx, ty))) continue;
        const free = [-1, 0, 1].every(
          (d) => !BLOCKING.has(tileAt(tx - 1, ty + d)) && !BLOCKING.has(tileAt(tx - 2, ty + d)),
        );
        if (!free) continue;
        // Đứng sát mép trái của ô chặn, ở giữa ô theo chiều dọc
        const x = tx * TILE - PLAYER_RADIUS - 1,
          y = ty * TILE + TILE / 2;
        if (circleBlocked(x, y, PLAYER_RADIUS)) continue;
        const moved = moveWithCollision(x, y, 6, 6, PLAYER_RADIUS);
        expect(moved.x).toBe(x); // bị tường chặn theo X
        expect(moved.y).toBe(y + 6); // vẫn trượt theo Y
        return;
      }
    }
    throw new Error("Không tìm thấy chỗ phù hợp để thử trượt tường");
  });

  it("isBlockedPx khớp với loại ô", () => {
    for (let i = 0; i < 200; i++) {
      const tx = (i * 37) % MAP_W,
        ty = (i * 53) % MAP_H;
      expect(isBlockedPx(tx * TILE + 5, ty * TILE + 5)).toBe(BLOCKING.has(tileAt(tx, ty)));
    }
  });
});

describe("bản đồ là tham số (#123, Bước 0)", () => {
  /** Băm SHA-256 của ô Lạc Hà Trấn, ghi cứng từ lúc chưa tham số hoá: đổi trình sinh ô là test đỏ. */
  const LAC_HA_SHA256 = "9c297aaad56a8cdb138b7037c3f28e996fd83dbcf54849110c9bffd80f38f664";

  it("Lạc Hà Trấn sinh ra y hệt từng ô như trước khi tham số hoá", () => {
    const h = createHash("sha256").update(DEFAULT_MAP.tiles).digest("hex");
    expect(h).toBe(LAC_HA_SHA256);
    expect(MAP_TILES).toBe(DEFAULT_MAP.tiles);
    expect(new GameMap(MAP_BY_ID[DEFAULT_MAP_ID]).tiles).toEqual(DEFAULT_MAP.tiles);
  });

  it("danh sách bản đồ hợp lệ: id duy nhất, kích thước nguyên dương, trấn nằm trong bản đồ", () => {
    expect(MAPS.length).toBeGreaterThan(0);
    expect(new Set(MAPS.map((m) => m.id)).size).toBe(MAPS.length);
    for (const m of MAPS) {
      expect(MAP_BY_ID[m.id], m.id).toBe(m);
      expect(Number.isInteger(m.w) && Number.isInteger(m.h) && m.w > 8 && m.h > 8, m.id).toBe(true);
      expect(Number.isInteger(m.seed), m.id).toBe(true);
      expect(m.town.cx - m.town.r).toBeGreaterThan(1);
      expect(m.town.cy - m.town.r).toBeGreaterThan(1);
      expect(m.town.cx + m.town.r).toBeLessThan(m.w - 1);
      expect(m.town.cy + m.town.r).toBeLessThan(m.h - 1);
    }
    expect(MAP_BY_ID[DEFAULT_MAP_ID]).toBeDefined();
  });

  it("getMap: nhớ một bản duy nhất; id lạ hoặc tên thuộc tính của Object trả undefined", () => {
    expect(getMap(DEFAULT_MAP_ID)).toBe(DEFAULT_MAP);
    expect(getMap(DEFAULT_MAP_ID)).toBe(getMap(DEFAULT_MAP_ID));
    for (const id of ["", "khong_co", "constructor", "__proto__", "toString", "hasOwnProperty"])
      expect(getMap(id), id).toBeUndefined();
    for (const id of [undefined, null, 0, 1, {}, [], ["lac_ha"]])
      expect(getMap(id)).toBeUndefined();
  });

  it("các hàm cũ cho kết quả y hệt GameMap mặc định (giữ tên cũ để chuyển dần)", () => {
    const r = rng(7);
    expect(DEFAULT_MAP.worldW).toBe(WORLD_W);
    expect(DEFAULT_MAP.worldH).toBe(WORLD_H);
    expect(DEFAULT_MAP.townPx).toEqual(TOWN_PX);
    for (let i = 0; i < 2000; i++) {
      const x = r() * (WORLD_W + 200) - 100;
      const y = r() * (WORLD_H + 200) - 100;
      const dx = r() * 8 - 4;
      const dy = r() * 8 - 4;
      expect(tileAt(Math.floor(x / TILE), Math.floor(y / TILE))).toBe(
        DEFAULT_MAP.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)),
      );
      expect(isBlockedPx(x, y)).toBe(DEFAULT_MAP.isBlockedPx(x, y));
      expect(circleBlocked(x, y, PLAYER_RADIUS)).toBe(
        DEFAULT_MAP.circleBlocked(x, y, PLAYER_RADIUS),
      );
      expect(moveWithCollision(x, y, dx, dy, PLAYER_RADIUS)).toEqual(
        DEFAULT_MAP.moveWithCollision(x, y, dx, dy, PLAYER_RADIUS),
      );
      expect(inTown(x, y, 16)).toBe(DEFAULT_MAP.inTown(x, y, 16));
      expect(dangerAt(x, y)).toBe(DEFAULT_MAP.dangerAt(x, y));
    }
  });

  it("GameMap thật sự theo MapDef: bản đồ khác seed / kích thước sinh ô khác, tất định, viền núi, trấn lát đá", () => {
    const def: MapDef = {
      id: "thu_nghiem",
      name: "Thử nghiệm",
      seed: 12345,
      w: 40,
      h: 56,
      town: { cx: 20, cy: 28, r: 5 },
    };
    const m = new GameMap(def);
    expect(m.tiles).toHaveLength(40 * 56);
    expect(m.worldW).toBe(40 * TILE);
    expect(m.worldH).toBe(56 * TILE);
    expect(m.townPx).toEqual({ x: 20 * TILE, y: 28 * TILE, r: 5 * TILE });
    expect(new GameMap(def).tiles).toEqual(m.tiles); // tất định
    expect(new GameMap({ ...def, seed: 54321 }).tiles).not.toEqual(m.tiles);
    for (let x = 0; x < 40; x++) {
      expect(m.tileAt(x, 0)).toBe(T.Rock);
      expect(m.tileAt(x, 55)).toBe(T.Rock);
    }
    for (let y = 0; y < 56; y++) {
      expect(m.tileAt(0, y)).toBe(T.Rock);
      expect(m.tileAt(39, y)).toBe(T.Rock);
    }
    expect(m.tileAt(20, 28)).toBe(T.Stone);
    expect(m.inTown(20 * TILE, 28 * TILE)).toBe(true);
    expect(m.inTown(2 * TILE, 2 * TILE)).toBe(false);
    expect(m.dangerAt(20 * TILE, 28 * TILE)).toBe(0);
    {
      // 0 trong trấn, tăng dần ra xa theo kích thước CỦA BẢN ĐỒ NÀY (không theo WORLD_W của bản đồ mặc định)
      const d = Math.hypot(1 * TILE - m.townPx.x, 1 * TILE - m.townPx.y);
      expect(m.dangerAt(1 * TILE, 1 * TILE)).toBeCloseTo(
        Math.min(1, (d - m.townPx.r) / (m.worldW * 0.5 - m.townPx.r)),
        10,
      );
    }
    // Ra ngoài bản đồ nhỏ này thì chặn, dù nó vẫn nằm trong bản đồ mặc định lớn hơn
    for (const tx of [40, 41, 55, 95, -1])
      for (let ty = 1; ty < 55; ty += 6) expect(m.tileAt(tx, ty), `(${tx}, ${ty})`).toBe(T.Rock);
    for (const ty of [56, 57, 70, 95, -1])
      for (let tx = 1; tx < 39; tx += 6) expect(m.tileAt(tx, ty), `(${tx}, ${ty})`).toBe(T.Rock);
    expect(m.isBlockedPx(50 * TILE, 10 * TILE)).toBe(true);
    // Không làm đổi bản đồ mặc định
    expect(createHash("sha256").update(DEFAULT_MAP.tiles).digest("hex")).toBe(LAC_HA_SHA256);
  });

  it("dangerAt bản đồ chữ nhật: đạt 1 ở nửa cạnh NGẮN, không theo cạnh dài (#124)", () => {
    // Bản đồ rộng (56 x 40 ô): nửa cạnh ngắn = 20 ô; nếu tính theo cạnh dài (28 ô) thì mức nguy hiểm bị loãng
    const wide = new GameMap({
      id: "rong",
      name: "Rộng",
      seed: 1,
      w: 56,
      h: 40,
      town: { cx: 28, cy: 20, r: 4 },
    });
    const tall = new GameMap({
      id: "cao",
      name: "Cao",
      seed: 1,
      w: 40,
      h: 56,
      town: { cx: 20, cy: 28, r: 4 },
    });
    for (const m of [wide, tall]) {
      const { x, y, r } = m.townPx;
      const half = Math.min(m.worldW, m.worldH) * 0.5;
      expect(m.dangerAt(x, y), m.def.id).toBe(0);
      expect(m.dangerAt(x + r, y), m.def.id).toBe(0);
      expect(m.dangerAt(x + half, y), m.def.id).toBe(1);
      expect(m.dangerAt(x, y - half), m.def.id).toBe(1);
      expect(m.dangerAt(x + (r + half) / 2, y), m.def.id).toBeCloseTo(0.5, 10);
      expect(m.dangerAt(x + (r + half) / 2, y), m.def.id).toBeCloseTo(
        tall.dangerAt(tall.townPx.x, tall.townPx.y + (tall.townPx.r + half) / 2),
        10,
      );
    }
    // Bản đồ vuông (mặc định) giữ công thức cũ: nửa cạnh
    const { x, y, r } = DEFAULT_MAP.townPx;
    expect(DEFAULT_MAP.dangerAt(x + (r + WORLD_W * 0.5) / 2, y)).toBeCloseTo(0.5, 10);
  });

  it("dangerRadius là nghịch đảo của dangerAt; bản đồ mặc định khớp công thức client cũ (#124)", () => {
    const wide = new GameMap({
      id: "rong",
      name: "Rộng",
      seed: 1,
      w: 56,
      h: 40,
      town: { cx: 28, cy: 20, r: 4 },
    });
    const tall = new GameMap({
      id: "cao",
      name: "Cao",
      seed: 1,
      w: 40,
      h: 56,
      town: { cx: 20, cy: 28, r: 4 },
    });
    const mức = [0, 0.05, ...MONSTERS.map((m) => m.minDanger), 0.5, 0.99, 1];
    for (const m of [DEFAULT_MAP, wide, tall]) {
      const { x, y } = m.townPx;
      for (const d of mức) {
        const r = m.dangerRadius(d);
        // Đi theo cả bốn hướng: dangerAt chỉ phụ thuộc khoảng cách tới tâm trấn
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          expect(m.dangerAt(x + dx * r, y + dy * r), `${m.def.id} ${d}`).toBeCloseTo(d, 9);
      }
      expect(m.dangerRadius(0)).toBe(m.townPx.r);
    }
    // Công thức client trước #130: TOWN_PX.r + minDanger * (WORLD_W * 0.5 - TOWN_PX.r) (bản đồ vuông)
    for (const d of mức)
      expect(DEFAULT_MAP.dangerRadius(d), String(d)).toBe(
        TOWN_PX.r + d * (WORLD_W * 0.5 - TOWN_PX.r),
      );
    // Bản đồ chữ nhật: tính theo cạnh ngắn (rộng: worldH, cao: worldW)
    expect(wide.dangerRadius(1)).toBe(wide.worldH * 0.5);
    expect(tall.dangerRadius(1)).toBe(tall.worldW * 0.5);
  });

  it("MapDef: trấn phủ kín nửa cạnh ngắn của bản đồ bị từ chối (dangerAt sẽ chia cho 0) (#124)", () => {
    const def: MapDef = {
      id: "to",
      name: "Trấn to",
      seed: 3,
      w: 40,
      h: 40,
      town: { cx: 20, cy: 20, r: 19 },
    };
    expect(() => new GameMap(def)).not.toThrow();
    expect(() => new GameMap({ ...def, town: { cx: 20, cy: 20, r: 20 } })).toThrow(/bán kính trấn/);
    expect(() => new GameMap({ ...def, town: { cx: 20, cy: 20, r: 30 } })).toThrow(/bán kính trấn/);
    expect(() => new GameMap({ ...def, w: 80, town: { cx: 40, cy: 20, r: 20 } })).toThrow(
      /bán kính trấn/,
    );
    expect(() => new GameMap({ ...def, town: { cx: 20, cy: 20, r: Number.NaN } })).toThrow(
      /bán kính trấn/,
    );
  });

  it("MapDef: tâm trấn, w, h phải là số nguyên (số lẻ làm đường đất ghi lệch chỉ số mảng) (#124)", () => {
    const def: MapDef = {
      id: "le",
      name: "Lẻ",
      seed: 3,
      w: 40,
      h: 40,
      town: { cx: 20, cy: 20, r: 5 },
    };
    expect(() => new GameMap(def)).not.toThrow();
    expect(() => new GameMap({ ...def, town: { cx: 20.5, cy: 20, r: 5 } })).toThrow(/town\.cx/);
    expect(() => new GameMap({ ...def, town: { cx: 20, cy: 19.5, r: 5 } })).toThrow(/town\.cy/);
    expect(() => new GameMap({ ...def, w: 40.5 })).toThrow(/\bw\b/);
    expect(() => new GameMap({ ...def, h: Number.NaN })).toThrow(/\bh\b/);
    // Bán kính được phép lẻ
    expect(() => new GameMap({ ...def, town: { cx: 20, cy: 20, r: 5.5 } })).not.toThrow();
  });

  it("MapDef và TOWN chỉ đọc ở mức kiểu: gán vào là lỗi biên dịch (#124)", () => {
    const def = MAP_BY_ID[DEFAULT_MAP_ID];
    // @ts-expect-error MapDef.seed là readonly
    const sửaSeed = () => (def.seed = 1);
    // @ts-expect-error MapDef.town là readonly
    const sửaTrấn = () => (def.town.cx = 1);
    // @ts-expect-error TOWN là readonly
    const sửaTOWN = () => (TOWN.r = 1);
    // @ts-expect-error townPx là readonly
    const sửaPx = () => (DEFAULT_MAP.townPx.x = 1);
    // Không gọi: chỉ cần các dòng trên biên dịch được với @ts-expect-error
    expect([sửaSeed, sửaTrấn, sửaTOWN, sửaPx]).toHaveLength(4);
    expect(DEFAULT_MAP.def.seed).toBe(MAP_SEED);
  });
});

/** Các ô đi lại được nối với nhau từ ô (tx, ty) (4 hướng): dùng kiểm cổng với trấn có đường đi thật. */
function reachableFrom(m: GameMap, tx: number, ty: number): Set<number> {
  const seen = new Set<number>([ty * m.def.w + tx]);
  const stack = [[tx, ty]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.def.w || ny >= m.def.h) continue;
      if (BLOCKING.has(m.tileAt(nx, ny)) || seen.has(ny * m.def.w + nx)) continue;
      seen.add(ny * m.def.w + nx);
      stack.push([nx, ny]);
    }
  }
  return seen;
}

describe("nhiều bản đồ: danh sách, cổng, khu an toàn (M3 bước 1)", () => {
  const all = MAPS.map((d) => getMap(d.id)!);

  it("MAPS có Lạc Hà, Hắc Phong Cốc, Âm Sương Trạch và Hàn Vân Lĩnh; id duy nhất; getMap dựng được từng bản đồ", () => {
    expect(MAPS.map((m) => m.id)).toEqual([DEFAULT_MAP_ID, HAC_PHONG_ID, AM_SUONG_ID, HAN_VAN_ID]);
    expect(new Set(MAPS.map((m) => m.id)).size).toBe(MAPS.length);
    for (const m of all) expect(m).toBeDefined();
    expect(getMap(HAC_PHONG_ID)!.def.w).toBe(128);
    expect(getMap(AM_SUONG_ID)!.def.w).toBe(128);
    expect(getMap(HAN_VAN_ID)!.def.w).toBe(128);
    expect(getMap(HAN_VAN_ID)!.def.h).toBe(128);
    expect(getMap("constructor")).toBeUndefined();
  });

  it("Lạc Hà không đổi gì sau khi thêm cổng: ô, tên, quái đúng như trước", () => {
    expect(DEFAULT_MAP.townName).toBe("Lạc Hà Trấn");
    expect(DEFAULT_MAP.wildName).toBe("Vân Mộng Sơn");
    expect(DEFAULT_MAP.monsterCap).toBe(MONSTER_CAP);
    for (const k of MONSTERS) expect(DEFAULT_MAP.monsterCapOf(k.id)).toBe(MONSTER_CAP[k.id]);
  });

  it("tên bản đồ, khu an toàn, vùng hoang: bỏ trống thì dùng `name`", () => {
    const m = new GameMap({
      id: "t",
      name: "Tên",
      seed: 1,
      w: 40,
      h: 40,
      town: { cx: 20, cy: 20, r: 4 },
    });
    expect([m.townName, m.wildName, m.portals.length]).toEqual(["Tên", "Tên", 0]);
  });

  it("id cổng duy nhất trong CẢ game", () => {
    const ids = all.flatMap((m) => m.portals.map((p) => p.id));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cổng đi theo cặp: toMap / toPortal tồn tại và trỏ ngược lại đúng cổng đó", () => {
    for (const m of all)
      for (const p of m.portals) {
        const dest = getMap(p.toMap);
        expect(dest, `${p.id} -> ${p.toMap}`).toBeDefined();
        const back = dest!.portal(p.toPortal);
        expect(back, `${p.id} -> cổng ${p.toPortal}`).toBeDefined();
        expect(back!.toMap).toBe(m.def.id);
        expect(back!.toPortal).toBe(p.id);
        expect(p.toMap).not.toBe(m.def.id); // cổng sang bản đồ khác, không tự trỏ chính mình
      }
  });

  it("cổng nằm sát rìa, tâm và chỗ xuất hiện đi lại được, chỗ xuất hiện ngoài r và trong safeR", () => {
    for (const m of all)
      for (const p of m.portals) {
        const rim = Math.min(p.x, p.y, m.worldW - p.x, m.worldH - p.y);
        expect(rim, `${p.id} cách rìa`).toBeLessThanOrEqual(6 * TILE);
        expect(m.isBlockedPx(p.x, p.y)).toBe(false);
        expect(m.circleBlocked(p.spawn.x, p.spawn.y, PLAYER_RADIUS)).toBe(false);
        const d = Math.hypot(p.spawn.x - p.x, p.spawn.y - p.y);
        expect(d).toBeGreaterThan(p.r);
        expect(d).toBeLessThanOrEqual(p.safeR);
        expect(m.portalNear(p.spawn.x, p.spawn.y)).toBeUndefined(); // vừa tới không bị tính là đang đứng ở cổng
      }
  });

  it("từ chỗ xuất hiện đi bộ được tới trấn và tới tâm cổng, và đi được tới mọi cổng khác của bản đồ", () => {
    for (const m of all) {
      const fromTown = reachableFrom(m, m.def.town.cx, m.def.town.cy);
      // Phần lớn bản đồ nối được với trấn (còn lại là đảo nhỏ do hồ / núi tạo ra)
      const walkable = [...m.tiles].filter((t) => !BLOCKING.has(t)).length;
      expect(fromTown.size / walkable, `${m.def.id} liên thông`).toBeGreaterThan(0.9);
      for (const p of m.portals) {
        for (const [x, y] of [
          [p.x, p.y],
          [p.spawn.x, p.spawn.y],
        ])
          expect(
            fromTown.has(Math.floor(y / TILE) * m.def.w + Math.floor(x / TILE)),
            `${p.id} (${x}, ${y}) nối với trấn`,
          ).toBe(true);
      }
    }
  });

  it("inSafe = trong trấn hoặc trong safeR của cổng (cộng pad); inTown vẫn chỉ là trấn", () => {
    for (const m of all) {
      expect(m.inSafe(m.townPx.x, m.townPx.y)).toBe(true);
      for (const p of m.portals) {
        expect(m.inSafe(p.x, p.y)).toBe(true);
        expect(m.inSafe(p.spawn.x, p.spawn.y)).toBe(true);
        expect(m.inSafe(p.x + p.safeR, p.y)).toBe(true); // đúng mép
        expect(m.inSafe(p.x + p.safeR + 1, p.y)).toBe(m.inTown(p.x + p.safeR + 1, p.y));
        expect(m.inSafe(p.x + p.safeR + 20, p.y, 20)).toBe(true); // pad nới khu an toàn
        expect(m.inTown(p.x, p.y)).toBe(false); // cổng ở rìa, xa trấn (Lạc Hà)
      }
    }
    // Hắc Phong Cốc: trạm và cổng gần nhau nên chồng lên nhau là chủ ý (người mới tới thấy trạm ngay)
    const hp = getMap(HAC_PHONG_ID)!;
    expect(hp.inTown(hp.portals[0].spawn.x, hp.portals[0].spawn.y)).toBe(true);
  });

  it("cổng Lạc Hà: ở rìa nguy hiểm nhưng quanh cổng là khu an toàn; Hắc Phong: trạm an toàn sát cổng", () => {
    const [bac] = DEFAULT_MAP.portals;
    expect(DEFAULT_MAP.dangerAt(bac.x, bac.y)).toBeGreaterThan(0.8);
    expect(DEFAULT_MAP.inTown(bac.x, bac.y)).toBe(false);
    expect(DEFAULT_MAP.inSafe(bac.x, bac.y)).toBe(true);
    const hp = getMap(HAC_PHONG_ID)!;
    expect(hp.dangerAt(hp.townPx.x, hp.townPx.y)).toBe(0);
    expect(hp.dangerAt(hp.portals[0].x, hp.portals[0].y)).toBeLessThan(0.3);
    // Càng lên bắc càng nguy hiểm, đủ chỗ cho quái trùm (minDanger của trùm là 0.78)
    expect(hp.dangerAt(hp.townPx.x, 2 * TILE)).toBe(1);
  });

  it("portal / portalNear: id lạ không có; đứng trong r mới tính", () => {
    const [bac] = DEFAULT_MAP.portals;
    expect(DEFAULT_MAP.portal(bac.id)).toBe(bac);
    for (const bad of ["", "constructor", "__proto__", 7, null, undefined, {}])
      expect(DEFAULT_MAP.portal(bad)).toBeUndefined();
    expect(DEFAULT_MAP.portalNear(bac.x, bac.y)).toBe(bac);
    expect(DEFAULT_MAP.portalNear(bac.x + bac.r, bac.y)).toBe(bac);
    expect(DEFAULT_MAP.portalNear(bac.x + bac.r + 1, bac.y)).toBeUndefined();
    expect(DEFAULT_MAP.portalNear(Number.NaN, bac.y)).toBeUndefined();
    expect(DEFAULT_MAP.portalNear(DEFAULT_MAP.townPx.x, DEFAULT_MAP.townPx.y)).toBeUndefined();
  });

  it("monsterCap: Hắc Phong Cốc chỉ khai báo loại quái có thật, không có Linh Thố; loại không khai báo là 0", () => {
    const hp = getMap(HAC_PHONG_ID)!;
    for (const id of Object.keys(hp.monsterCap))
      expect(MONSTERS.some((k) => k.id === id)).toBe(true);
    expect(hp.monsterCapOf("tho")).toBe(0);
    expect(hp.monsterCapOf("mang")).toBeGreaterThan(0);
    for (const bad of ["constructor", "__proto__", "toString", "không_có"])
      expect(hp.monsterCapOf(bad)).toBe(0);
    // Số quái mỗi người ở không vượt Lạc Hà quá nhiều (ngân sách tick cho nhiều phòng, docs/LOAD_TEST.md)
    const total = (m: GameMap) => Object.values(m.monsterCap).reduce((a, b) => a + b, 0);
    expect(total(hp)).toBeLessThanOrEqual(total(DEFAULT_MAP));
  });

  describe("MapDef sai bị từ chối ngay khi dựng", () => {
    const portal = DEFAULT_MAP.portals[0];
    const base: MapDef = MAP_BY_ID[DEFAULT_MAP_ID];
    const withPortal = (p: Partial<PortalDef>): MapDef => ({
      ...base,
      portals: [{ ...portal, ...p }],
    });

    it("cổng hợp lệ dựng được; id trùng / rỗng, số không hữu hạn, r > safeR bị từ chối", () => {
      expect(() => new GameMap(withPortal({}))).not.toThrow();
      expect(() => new GameMap({ ...base, portals: [portal, portal] })).toThrow(/trùng/);
      expect(() => new GameMap(withPortal({ id: "" }))).toThrow(/id/);
      expect(() => new GameMap(withPortal({ x: Number.NaN }))).toThrow(/hữu hạn/);
      expect(() => new GameMap(withPortal({ r: Number.POSITIVE_INFINITY }))).toThrow(/hữu hạn/);
      expect(() => new GameMap(withPortal({ r: 0 }))).toThrow(/r <= safeR/);
      expect(() => new GameMap(withPortal({ r: 300 }))).toThrow(/r <= safeR/);
    });

    it("tâm cổng hoặc chỗ xuất hiện trên ô chặn, hoặc chỗ xuất hiện sai khoảng cách, bị từ chối", () => {
      expect(() => new GameMap(withPortal({ x: 0, y: 0 }))).toThrow(/ô chặn/); // góc núi
      expect(() => new GameMap(withPortal({ spawn: { x: 0, y: 0 } }))).toThrow(/ô chặn/);
      expect(() => new GameMap(withPortal({ spawn: { x: portal.x, y: portal.y } }))).toThrow(
        /ngoài r/,
      );
      expect(() => new GameMap(withPortal({ spawn: { x: portal.x, y: portal.y + 200 } }))).toThrow(
        /trong safeR/,
      );
    });

    it("monsterCap có loại quái lạ, số âm hoặc số lẻ bị từ chối; {} cho phép (bản đồ không quái)", () => {
      expect(() => new GameMap({ ...base, monsterCap: { rong: 3 } })).toThrow(/loại quái lạ/);
      expect(() => new GameMap({ ...base, monsterCap: { constructor: 3 } })).toThrow(
        /loại quái lạ/,
      );
      expect(() => new GameMap({ ...base, monsterCap: { ho: -1 } })).toThrow(/>= 0/);
      expect(() => new GameMap({ ...base, monsterCap: { ho: 1.5 } })).toThrow(/>= 0/);
      expect(() => new GameMap({ ...base, monsterCap: {} })).not.toThrow();
      expect(new GameMap({ ...base, monsterCap: {} }).monsterCapOf("ho")).toBe(0);
    });

    it("LUẬT CHUNG (mục 55 / 56): tối đa MAX_BOSSES_PER_MAP (6) trùm sinh sẵn mỗi bản đồ: 6 hợp lệ, 7 bị từ chối; trùm tính theo MỌI loài `boss: true` cộng lại", () => {
      expect(MAX_BOSSES_PER_MAP).toBe(6);
      expect(() => new GameMap({ ...base, monsterCap: { mang: 6 } })).not.toThrow();
      expect(() => new GameMap({ ...base, monsterCap: { mang: 7 } })).toThrow(/vượt giới hạn 6/);
      // hai loài trùm khác nhau cộng chung (3 + 4 = 7)
      expect(() => new GameMap({ ...base, monsterCap: { mang: 3, hac_giao: 4 } })).toThrow(
        /vượt giới hạn/,
      );
      expect(() => new GameMap({ ...base, monsterCap: { mang: 3, hac_giao: 3 } })).not.toThrow();
      // quái thường không tính: 36 con ho + 6 trùm vẫn hợp lệ
      expect(
        () => new GameMap({ ...base, monsterCap: { ho: 36, lang: 20, mang: 6 } }),
      ).not.toThrow();
    });
  });

  it("mọi bản đồ thật: tổng trùm sinh sẵn <= MAX_BOSSES_PER_MAP; Hắc Phong Xích Mãng 6 (giữ), Âm Sương Hắc Giao 6 (mục 56), Hàn Vân Thiên Hàn Vương 2, Lạc Hà Xích Mãng 2", () => {
    for (const m of all) {
      const bosses = Object.entries(m.monsterCap).reduce(
        (n, [id, c]) => n + (MONSTERS.find((k) => k.id === id)?.boss ? c : 0),
        0,
      );
      expect(bosses, m.def.id).toBeLessThanOrEqual(MAX_BOSSES_PER_MAP);
    }
    expect(getMap(HAC_PHONG_ID)!.monsterCapOf("mang")).toBe(6);
    expect(getMap(AM_SUONG_ID)!.monsterCapOf("hac_giao")).toBe(6);
    expect(getMap(HAN_VAN_ID)!.monsterCapOf("thien_han_vuong")).toBe(2);
    expect(getMap(DEFAULT_MAP_ID)!.monsterCapOf("mang")).toBe(2);
  });
});

describe("Hàn Vân Lĩnh, bản đồ thứ tư (M7.5, #506)", () => {
  const sha1 = (m: GameMap) => createHash("sha1").update(m.tiles).digest("hex");
  const hv = getMap(HAN_VAN_ID)!;
  const as = getMap(AM_SUONG_ID)!;

  it("thêm cổng bắc cho Âm Sương KHÔNG đổi ô của bản đồ nào có sẵn (seed giữ nguyên: tệp lưu vẫn hợp lệ)", () => {
    // Băm các ô sinh ra, ghi từ main trước M7.5: sửa seed / kích thước / bộ sinh ô thì băm đổi và test này đỏ
    expect(sha1(getMap(DEFAULT_MAP_ID)!)).toBe("d11034c8cc25a92e1e4a1746cc4e41443dd11633");
    expect(sha1(getMap(HAC_PHONG_ID)!)).toBe("b9678be84f2a2387112a870b38f8ae957b1aa304");
    expect(sha1(as)).toBe("efc2225c2ea8f7d9c58a35572626ec04e15b2a43");
    expect(as.def.seed).toBe(20261974);
    // Hàn Vân cũng ghim: nội dung M7.5b+ (quái, NPC, trang trí của B) đặt theo toạ độ ô của bản đồ này
    expect(sha1(hv)).toBe("877c067efe0da7c779eb251e767beb732e4ca59b");
    expect(hv.def.seed).toBe(20262122);
  });

  it("cặp cổng Âm Sương <-> Hàn Vân: `am_suong_bac` và `han_van_nam` trỏ ngược nhau, tâm cổng nằm trên ô đường đất", () => {
    const up = as.portal("am_suong_bac")!;
    const down = hv.portal("han_van_nam")!;
    expect(up.toMap).toBe(HAN_VAN_ID);
    expect(up.toPortal).toBe("han_van_nam");
    expect(down.toMap).toBe(AM_SUONG_ID);
    expect(down.toPortal).toBe("am_suong_bac");
    expect(as.tileAt(Math.floor(up.x / TILE), Math.floor(up.y / TILE))).toBe(T.Dirt);
    expect(hv.tileAt(Math.floor(down.x / TILE), Math.floor(down.y / TILE))).toBe(T.Dirt);
    // cổng nằm ở rìa: bắc của Âm Sương (hàng 3), nam của Hàn Vân (hàng 124 trên 128)
    expect(up.y).toBeLessThan(4 * TILE);
    expect(down.y).toBeGreaterThan((hv.def.h - 5) * TILE);
  });

  it("Hàn Vân: trạm an toàn sát cổng nam (cách ~10 ô), tên trạm / vùng hoang đúng, không có hang trùm", () => {
    expect(hv.def.name).toBe("Hàn Vân Lĩnh");
    expect(hv.townName).toBe("Hàn Vân Trạm");
    expect(hv.wildName).toBe("Hàn Vân Lĩnh");
    expect(hv.def.lair).toBeUndefined();
    const down = hv.portal("han_van_nam")!;
    const d = Math.hypot(down.x - hv.townPx.x, down.y - hv.townPx.y) / TILE;
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(14);
    expect(hv.inSafe(hv.townPx.x, hv.townPx.y)).toBe(true);
    expect(hv.inSafe(down.x, down.y)).toBe(true);
  });

  it("chất lượng hạt giống: liên thông >= 95 % từ trạm, nước + cát <= 10 %, hai con đường chính chạm hai rìa", () => {
    const seen = reachableFrom(hv, hv.def.town.cx, hv.def.town.cy);
    let walk = 0;
    let wet = 0;
    for (let y = 1; y < hv.def.h - 1; y++)
      for (let x = 1; x < hv.def.w - 1; x++) {
        const t = hv.tileAt(x, y);
        if (!BLOCKING.has(t)) walk++;
        if (t === T.Water || t === T.Sand) wet++;
      }
    expect(seen.size / walk).toBeGreaterThanOrEqual(0.95);
    expect(wet / (hv.def.w * hv.def.h)).toBeLessThanOrEqual(0.1);
    // đường đất của trạm đi tới sát rìa bắc (hàng 1-3) và rìa nam (hàng 124-126)
    const dirtRows = new Set<number>();
    for (let y = 0; y < hv.def.h; y++)
      for (let x = 0; x < hv.def.w; x++) if (hv.tileAt(x, y) === T.Dirt) dirtRows.add(y);
    expect(Math.min(...dirtRows)).toBeLessThanOrEqual(3);
    expect(Math.max(...dirtRows)).toBeGreaterThanOrEqual(hv.def.h - 5);
  });

  it("monsterCap khai báo toàn loài có thật, tổng <= 70, và MỖI loài có đủ chỗ (>= 300 ô liên thông ngoài khu an toàn mỗi con) theo vùng nguy hiểm của nó", () => {
    const seen = reachableFrom(hv, hv.def.town.cx, hv.def.town.cy);
    let total = 0;
    for (const [id, cap] of Object.entries(hv.monsterCap)) {
      const def = MONSTERS.find((m) => m.id === id);
      expect(def, id).toBeDefined();
      total += cap;
      let room = 0;
      for (const i of seen) {
        const x = (i % hv.def.w) + 0.5;
        const y = Math.floor(i / hv.def.w) + 0.5;
        if (!hv.inSafe(x * TILE, y * TILE) && hv.dangerAt(x * TILE, y * TILE) >= def!.minDanger)
          room++;
      }
      expect(room, id).toBeGreaterThanOrEqual(300 * cap);
    }
    // Hiện `monsterCap` là {} (bốn loài Nguyên Anh + trùm thêm ở M7.5b): vòng trên chưa chạy lần nào; từ M7.5b nó giữ sức chứa của từng loài
    expect(total).toBeLessThanOrEqual(70);
  });
});
