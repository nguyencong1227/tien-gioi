import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DUNGEON_MAPS, MAPS, T, TILE, getMap, type GameMap } from "@tien-gioi/shared";
import {
  DECOR_FRAMES,
  DECOR_KINDS,
  DECOR_VARIANTS,
  DEFAULT_MAP_STYLE,
  MAP_STYLES,
  MAX_DECOR_DENSITY,
  hasOwnStyle,
  styleOf,
  validateStyle,
  type MapStyle,
  styleIdFor,
  MAX_TILE_TINT_ALPHA,
  planTileTint,
} from "./map-style";
import { NO_DECOR, buildDecorGrid, decorAtTile, decorCounts, hash01, hashId } from "./map-decor";
import { getRecipe } from "./fx/recipes";
import { WEATHER_RECIPE } from "./map-weather";

/**
 * Thời gian CPU (ms) của CHÍNH luồng đang chạy bước `fn`, kẹp trên bởi đồng hồ tường: bản sao gọn của `measureSyncStepMs` ở `server/src/perf/bench.ts`
 * (client không import chéo workspace). `process.threadCpuUsage` có từ Node 22.19 (`.nvmrc` = 22); Node cũ quay về CPU cả tiến trình.
 */
function cpuStepMs(fn: () => void): number {
  const read = (
    process as unknown as { threadCpuUsage?: (prev?: NodeJS.CpuUsage) => NodeJS.CpuUsage }
  ).threadCpuUsage;
  const cpu = (prev?: NodeJS.CpuUsage) =>
    read ? read.call(process, prev) : process.cpuUsage(prev);
  const c0 = cpu();
  const t0 = performance.now();
  fn();
  const wallMs = performance.now() - t0;
  const c1 = cpu(c0);
  return Math.min(wallMs, (c1.user + c1.system) / 1000);
}

const ALL_IDS = [...MAPS, ...DUNGEON_MAPS].map((m) => m.id);
const mapOf = (id: string): GameMap => getMap(id)!;

describe("map-style (dữ liệu kiểu theo bản đồ)", () => {
  it("mọi bản đồ của game có kiểu RIÊNG, không rơi về mặc định", () => {
    for (const id of ALL_IDS) expect(hasOwnStyle(id), id).toBe(true);
  });

  it("mọi kiểu (kể cả mặc định) hợp lệ: màu, độ đậm, mật độ, thời tiết, bảng màu", () => {
    for (const [id, s] of Object.entries({ ...MAP_STYLES, default: DEFAULT_MAP_STYLE }))
      expect(validateStyle(s), id).toEqual([]);
  });

  it("id lạ / id độc (constructor, __proto__) trả kiểu mặc định, không ném lỗi", () => {
    for (const id of ["", "khong_co", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(styleOf(id)).toBe(DEFAULT_MAP_STYLE);
      expect(hasOwnStyle(id)).toBe(false);
    }
  });

  it("kiểu KHÔNG mồ côi: mọi kiểu trong MAP_STYLES là của một bản đồ có thật (trừ danh sách chờ, và danh sách chờ không được để cũ)", () => {
    // `am_suong` (M6 #408) từng chờ ở đây trước bản đồ của nó; #404 (shared) đã đưa bản đồ vào nên danh sách chờ đã được dọn.
    // `han_van` (M7.8 #509) từng chờ ở đây: có kiểu TRƯỚC bản đồ; M7.5 (#506, `shared/src/map.ts`) đã thêm bản đồ nên danh sách chờ đã được dọn.
    // `lang_hoang` / `uy_van` (#1467) từng chờ ở đây trước bản đồ của chúng; PR đăng ký bản đồ (shared/src/map.ts) đã dọn danh sách chờ.
    const waiting: string[] = [];
    for (const id of Object.keys(MAP_STYLES)) {
      if (waiting.includes(id)) continue;
      expect(getMap(id), `kiểu "${id}" không có bản đồ`).toBeDefined();
    }
    // Có bản đồ rồi thì phải RỜI danh sách chờ (để bài kiểm trên lại giữ kiểu này về sau)
    for (const id of waiting) {
      expect(MAP_STYLES[id], `"${id}" trong danh sách chờ nhưng không có kiểu`).toBeDefined();
      expect(getMap(id), `"${id}" đã có bản đồ: bỏ khỏi danh sách chờ`).toBeUndefined();
    }
  });

  it("Âm Sương Trạch: sương dày nhất, thời tiết ma trơi riêng, màu môi trường lục khác ba bản đồ kia", () => {
    const am = MAP_STYLES.am_suong;
    expect(am).toBeDefined();
    expect(validateStyle(am)).toEqual([]);
    expect(am.weather.kind).toBe("wisp");
    const others = Object.entries(MAP_STYLES).filter(([id]) => id !== "am_suong");
    expect(others.length).toBeGreaterThanOrEqual(3);
    for (const [id, s] of others) {
      expect(am.fog.alpha, `sương dày hơn ${id}`).toBeGreaterThan(s.fog.alpha);
      expect(am.ambient.color, `màu môi trường khác ${id}`).not.toBe(s.ambient.color);
      expect(am.weather.kind, `thời tiết khác ${id}`).not.toBe(s.weather.kind);
    }
  });

  it("mỗi bản đồ có phong cách khác nhau (không chép một kiểu cho tất cả)", () => {
    const kinds = new Set(ALL_IDS.map((id) => styleOf(id).weather.kind));
    expect(kinds.size).toBe(ALL_IDS.length);
    expect(styleOf("lac_ha").weather.kind).toBe("petals");
    expect(styleOf("hac_phong").weather.kind).toBe("ash");
    expect(styleOf("bi_canh_linh_hu").weather.kind).toBe("spirit");
  });

  it("ĐỘT BIẾN: validateStyle bắt kiểu hỏng (màu, độ đậm, mật độ, thời tiết, bảng màu)", () => {
    const base: MapStyle = styleOf("lac_ha");
    const bad = (patch: Partial<MapStyle>) => validateStyle({ ...base, ...patch });
    expect(bad({ ambient: { color: -1, alpha: 0.1 } })).toContain(
      "ambient.color không phải màu 0..0xffffff",
    );
    expect(bad({ ambient: { color: 0xffffff, alpha: 0.9 } }).join()).toMatch(/ambient\.alpha/);
    expect(bad({ fog: { color: 0, alpha: 0.1, speed: 999 } }).join()).toMatch(/fog\.speed/);
    expect(bad({ weather: { kind: "ash", rate: 0 } }).join()).toMatch(/rate <= 0/);
    expect(bad({ weather: { kind: "none", rate: 5 } }).join()).toMatch(/none mà rate/);
    expect(bad({ weather: { kind: "ash", rate: 9999 } }).join()).toMatch(/weather\.rate/);
    expect(bad({ decor: { ...base.decor, density: { tuft: 0.4, flower: 0.4 } } }).join()).toMatch(
      /tổng mật độ/,
    );
    expect(bad({ decor: { ...base.decor, density: { tuft: Number.NaN } } }).join()).toMatch(
      /decor\.density\.tuft/,
    );
    expect(
      bad({
        decor: { ...base.decor, palette: { ...base.decor.palette, bush: [0x123456] as never } },
      }).join(),
    ).toMatch(/palette\.bush/);
    expect(MAX_DECOR_DENSITY).toBe(0.5);
  });
});

describe("map-decor (sinh trang trí tất định)", () => {
  it("hash01 nằm trong [0, 1) và thay đổi theo từng tham số", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = hash01(i, i * 7, 3, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(1990);
    expect(hash01(1, 2, 3, 4)).toBe(hash01(1, 2, 3, 4));
    for (const alt of [
      hash01(9, 2, 3, 4),
      hash01(1, 9, 3, 4),
      hash01(1, 2, 9, 4),
      hash01(1, 2, 3, 9),
    ])
      expect(alt).not.toBe(hash01(1, 2, 3, 4));
    expect(hashId("lac_ha")).not.toBe(hashId("hac_phong"));
  });

  it("TẤT ĐỊNH: dựng hai lần ra đúng cùng một lưới, cho mọi bản đồ", () => {
    for (const id of ALL_IDS) {
      const a = buildDecorGrid(mapOf(id), styleOf(id));
      const b = buildDecorGrid(mapOf(id), styleOf(id));
      expect(a.length).toBe(mapOf(id).def.w * mapOf(id).def.h);
      expect(Array.from(a)).toEqual(Array.from(b));
    }
  });

  it("ĐỘC LẬP THỨ TỰ: decorAtTile từng ô (thứ tự ngẫu nhiên) khớp lưới dựng một lần", () => {
    const m = mapOf("hac_phong");
    const s = styleOf("hac_phong");
    const grid = buildDecorGrid(m, s);
    const { w, h } = m.def;
    // Duyệt theo bước nguyên tố nhân modulo: hoán vị tất định, không phải thứ tự hàng
    const total = w * h;
    for (let i = 0, k = 1; i < total; i++, k = (k * 7919 + 13) % total) {
      const x = k % w;
      const y = Math.floor(k / w);
      expect(decorAtTile(m, s, x, y)).toBe(grid[y * w + x]);
    }
  });

  it("ngoài bản đồ trả NO_DECOR", () => {
    const m = mapOf("lac_ha");
    const s = styleOf("lac_ha");
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [m.def.w, 0],
      [0, m.def.h],
    ])
      expect(decorAtTile(m, s, x, y)).toBe(NO_DECOR);
  });

  it("hai bản đồ khác nhau cho lưới khác nhau; mapId được trộn vào hạt giống", () => {
    const a = buildDecorGrid(mapOf("lac_ha"), styleOf("lac_ha"));
    const b = buildDecorGrid(mapOf("hac_phong"), styleOf("hac_phong"));
    expect(a.length).not.toBe(b.length); // 96x96 và 128x96
    // Cùng seed + cùng ô nhưng khác id thì quyết định khác: dựng lưới giả có id khác
    const m = mapOf("lac_ha");
    const clone = { ...m, def: { ...m.def, id: "lac_ha_khac" } } as GameMap;
    const c = buildDecorGrid(clone, styleOf("lac_ha"));
    expect(Array.from(c)).not.toEqual(Array.from(buildDecorGrid(m, styleOf("lac_ha"))));
  });

  it("khung nằm trong [0, DECOR_FRAMES) hoặc NO_DECOR; mọi loại xuất hiện ở mọi bản đồ", () => {
    for (const id of ALL_IDS) {
      const grid = buildDecorGrid(mapOf(id), styleOf(id));
      for (const f of grid) expect(f === NO_DECOR || (f >= 0 && f < DECOR_FRAMES)).toBe(true);
      const counts = decorCounts(grid);
      for (const k of DECOR_KINDS) expect(counts[k], `${id}:${k}`).toBeGreaterThan(0);
    }
  });

  it("không có trang trí trên ô chặn / nước / đá lát / cỏ cao", () => {
    for (const id of ALL_IDS) {
      const m = mapOf(id);
      const grid = buildDecorGrid(m, styleOf(id));
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] === NO_DECOR) continue;
        const t = m.tiles[i] as T;
        expect([T.Water, T.Tree, T.Rock, T.Stone, T.TallGrass], `${id} ô ${i}`).not.toContain(t);
      }
    }
  });

  it("vùng trống: không trang trí quanh cổng, trong hang trùm và trong lòng trấn", () => {
    for (const id of ALL_IDS) {
      const m = mapOf(id);
      const grid = buildDecorGrid(m, styleOf(id));
      const { w, h } = m.def;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (grid[y * w + x] === NO_DECOR) continue;
          const cx = (x + 0.5) * TILE;
          const cy = (y + 0.5) * TILE;
          for (const p of m.portals)
            expect(Math.hypot(cx - p.x, cy - p.y), `${id} cổng ${p.id}`).toBeGreaterThan(
              p.r + TILE,
            );
          if (m.lairPx)
            expect(Math.hypot(cx - m.lairPx.x, cy - m.lairPx.y), `${id} hang`).toBeGreaterThan(
              m.lairPx.r + TILE,
            );
          expect(Math.hypot(cx - m.townPx.x, cy - m.townPx.y), `${id} trấn`).toBeGreaterThan(
            m.townPx.r,
          );
        }
    }
  });

  it("nấm chỉ mọc cạnh cây; bụi chỉ mọc cạnh cây hoặc nước", () => {
    for (const id of ALL_IDS) {
      const m = mapOf(id);
      const grid = buildDecorGrid(m, styleOf(id));
      const { w, h } = m.def;
      const kindIdx = (n: string) => DECOR_KINDS.indexOf(n as (typeof DECOR_KINDS)[number]);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const f = grid[y * w + x];
          if (f === NO_DECOR) continue;
          const k = Math.floor(f / DECOR_VARIANTS);
          if (k !== kindIdx("mushroom") && k !== kindIdx("bush")) continue;
          const around: T[] = [];
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h)
                around.push(m.tiles[(y + dy) * w + x + dx] as T);
          if (k === kindIdx("mushroom")) expect(around, `${id} nấm ${x},${y}`).toContain(T.Tree);
          else
            expect(
              around.some((t) => t === T.Tree || t === T.Water),
              `${id} bụi ${x},${y}`,
            ).toBe(true);
        }
    }
  });

  it("mật độ đúng cỡ khai báo: tuft ~ density.tuft trên ô cỏ (dung sai 35 % tương đối)", () => {
    const id = "hac_phong";
    const m = mapOf(id);
    const s = styleOf(id);
    const grid = buildDecorGrid(m, s);
    let grass = 0;
    let tufts = 0;
    for (let i = 0; i < grid.length; i++) {
      if (m.tiles[i] !== T.Grass) continue;
      grass++;
      if (grid[i] !== NO_DECOR && Math.floor(grid[i] / DECOR_VARIANTS) === 0) tufts++;
    }
    expect(grass).toBeGreaterThan(2000);
    const rate = tufts / grass;
    const want = s.decor.density.tuft!;
    expect(rate).toBeGreaterThan(want * 0.65);
    expect(rate).toBeLessThan(want * 1.35);
  });

  it("hoa mọc THÀNH ĐÁM (không rắc đều): phương sai theo mảng lớn hơn rắc ngẫu nhiên", () => {
    const id = "lac_ha";
    const m = mapOf(id);
    const grid = buildDecorGrid(m, styleOf(id));
    const { w, h } = m.def;
    const flowerK = DECOR_KINDS.indexOf("flower");
    const B = 8;
    const per: number[] = [];
    for (let by = 0; by + B <= h; by += B)
      for (let bx = 0; bx + B <= w; bx += B) {
        let n = 0;
        let grass = 0;
        for (let y = by; y < by + B; y++)
          for (let x = bx; x < bx + B; x++) {
            if (m.tiles[y * w + x] === T.Grass) grass++;
            const f = grid[y * w + x];
            if (f !== NO_DECOR && Math.floor(f / DECOR_VARIANTS) === flowerK) n++;
          }
        if (grass >= B * B * 0.6) per.push(n);
      }
    const mean = per.reduce((a, b) => a + b, 0) / per.length;
    const variance = per.reduce((a, b) => a + (b - mean) ** 2, 0) / per.length;
    // Rắc ngẫu nhiên độc lập (Poisson): phương sai ~ trung bình. Đám hoa: lớn hơn rõ.
    expect(mean).toBeGreaterThan(1);
    expect(variance).toBeGreaterThan(mean * 1.5);
  });

  it("ĐỘT BIẾN: đổi mật độ thì lưới đổi; mật độ 0 cho lưới trống", () => {
    const m = mapOf("lac_ha");
    const base = styleOf("lac_ha");
    const none: MapStyle = { ...base, decor: { ...base.decor, density: {} } };
    expect(decorCounts(buildDecorGrid(m, none))).toEqual({
      tuft: 0,
      flower: 0,
      pebble: 0,
      mushroom: 0,
      bush: 0,
    });
    const more: MapStyle = {
      ...base,
      decor: { ...base.decor, density: { ...base.decor.density, pebble: 0.3 } },
    };
    expect(decorCounts(buildDecorGrid(m, more)).pebble).toBeGreaterThan(
      decorCounts(buildDecorGrid(m, base)).pebble * 4,
    );
  });

  it("không dùng Math.random và không trạng thái chạy dần trong module sinh (tất định theo cấu trúc)", () => {
    // Bỏ chú thích trước khi dò (chú thích được phép nhắc tên các hàm này)
    const code = (f: string) =>
      readFileSync(new URL(f, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
    for (const f of ["./map-decor.ts", "./map-style.ts"]) {
      expect(code(f), f).not.toMatch(/Math\.random/);
      expect(code(f), f).not.toMatch(/Date\.now|performance\.now/);
    }
  });

  it("tốc độ: dựng lưới bản đồ lớn nhất dưới 50 ms (một lần mỗi lần vào bản đồ)", () => {
    const biggest = ALL_IDS.map(mapOf).sort((a, b) => b.def.w * b.def.h - a.def.w * a.def.h)[0];
    // CPU của chính luồng, KHÔNG đồng hồ tường: cả bộ `npm test` chạy `pool: "threads"` + máy tải cao làm tường vọt (A đo 51,1 ms ở load 35-50, #1215)
    expect(cpuStepMs(() => buildDecorGrid(biggest, styleOf(biggest.def.id)))).toBeLessThan(50);
  });
});

describe("Hàn Vân Lĩnh: kiểu băng nguyên (M7.8 #509) và xem trước ?debug&style=", () => {
  const hv = MAP_STYLES.han_van;

  it("hợp lệ, tuyết rơi, sương dày vừa dưới trần, màu LẠNH (xanh trội đỏ) khác ba bản đồ ngoài và bí cảnh", () => {
    expect(hv).toBeDefined();
    expect(validateStyle(hv)).toEqual([]);
    expect(hv.weather.kind).toBe("snow");
    expect(hv.fog.alpha).toBeGreaterThan(MAP_STYLES.lac_ha.fog.alpha);
    expect(hv.fog.alpha).toBeLessThanOrEqual(0.4);
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    for (const c of [hv.ambient.color, hv.fog.color, hv.water.shimmer]) {
      const [r, , b] = rgb(c);
      expect(b, `#${c.toString(16)}`).toBeGreaterThan(r); // lạnh
    }
    // thời tiết RIÊNG (không chép của bản đồ khác) và ánh sáng khác nhau
    const others = Object.entries(MAP_STYLES).filter(([id]) => id !== "han_van");
    for (const [id, o] of others) {
      expect(o.weather.kind, id).not.toBe("snow");
      expect(o.ambient.color, id).not.toBe(hv.ambient.color);
    }
  });

  it("trang trí thưa hơn Lạc Hà (tuyết phủ), đủ năm loại, bảng màu không trùng bản đồ khác", () => {
    const sum = (d: Record<string, number | undefined>) =>
      Object.values(d).reduce((a: number, v) => a + (v ?? 0), 0);
    expect(sum(hv.decor.density)).toBeLessThan(sum(MAP_STYLES.lac_ha.decor.density));
    const sig = (id: string) => JSON.stringify(MAP_STYLES[id].decor.palette);
    for (const id of Object.keys(MAP_STYLES))
      if (id !== "han_van") expect(sig(id)).not.toBe(sig("han_van"));
  });

  it("styleIdFor: chỉ ?debug mới xem trước được kiểu khác; id lạ / độc / thiếu ?debug giữ mapId", () => {
    expect(styleIdFor("lac_ha", "?debug=1&style=han_van")).toBe("han_van");
    expect(styleIdFor("lac_ha", "?style=han_van")).toBe("lac_ha"); // bản phát hành: không đổi được diện mạo
    expect(styleIdFor("lac_ha", "?debug=1&style=khong_co")).toBe("lac_ha");
    expect(styleIdFor("lac_ha", "?debug=1&style=constructor")).toBe("lac_ha");
    expect(styleIdFor("lac_ha", "?debug=1&style=__proto__")).toBe("lac_ha");
    expect(styleIdFor("lac_ha", "?debug=1")).toBe("lac_ha");
    expect(styleIdFor("lac_ha", "")).toBe("lac_ha");
  });
});

describe("Lang Hoang và Uy Vân Kinh: kiểu riêng (#1467, mục 75)", () => {
  const lh = MAP_STYLES.lang_hoang;
  const uv = MAP_STYLES.uy_van;
  const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;

  it("hợp lệ, mỗi bản đồ có thời tiết RIÊNG (bụi gió / đốm huyết) có công thức thật và màu môi trường không trùng bản đồ nào", () => {
    for (const [id, st, kind] of [
      ["lang_hoang", lh, "dust"],
      ["uy_van", uv, "blood"],
    ] as const) {
      expect(st, id).toBeDefined();
      expect(validateStyle(st), id).toEqual([]);
      expect(st.weather.kind, id).toBe(kind);
      expect(getRecipe(WEATHER_RECIPE[kind]), id).toBeDefined();
      for (const [oid, o] of Object.entries(MAP_STYLES)) {
        if (oid === id) continue;
        expect(o.weather.kind, `${id} / ${oid} thời tiết`).not.toBe(kind);
        expect(o.ambient.color, `${id} / ${oid} ánh sáng`).not.toBe(st.ambient.color);
        expect(JSON.stringify(o.decor.palette), `${id} / ${oid} bảng trang trí`).not.toBe(
          JSON.stringify(st.decor.palette),
        );
      }
    }
  });

  it("Lang Hoang: gió (sương trôi NHANH nhất), nắng vàng úa (đỏ + lục trội lam), không hoa; chỉ Hàn Vân có màu phủ nền", () => {
    for (const [id, o] of Object.entries(MAP_STYLES))
      if (id !== "lang_hoang") expect(lh.fog.speed, id).toBeGreaterThan(o.fog.speed);
    const [r, g, b] = rgb(lh.ambient.color);
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
    expect(lh.decor.density.flower ?? 0).toBeLessThanOrEqual(0.01);
    expect(lh.tileTint).toBeUndefined();
  });

  it("Uy Vân Kinh: 'ban đêm' (tối mép NẶNG nhất), phủ đỏ (đỏ trội xanh), đốm huyết bay lên, màu phủ nền không khai", () => {
    for (const [id, o] of Object.entries(MAP_STYLES))
      if (id !== "uy_van") expect(uv.vignette.strength, id).toBeGreaterThan(o.vignette.strength);
    const [r, g, b] = rgb(uv.ambient.color);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    const blood = getRecipe(WEATHER_RECIPE.blood)!.particles!;
    expect(blood.gravityY ?? 0, "bay lên").toBeLessThan(0);
    expect(uv.tileTint).toBeUndefined();
  });
});

describe("Màu phủ nền (tileTint): tuyết phủ ở Hàn Vân Lĩnh (M7.8 #509)", () => {
  it("chỉ Hàn Vân Lĩnh khai báo; màu sáng và LẠNH, độ đậm trong trần (không xoá mất kiểu ô)", () => {
    const hv = MAP_STYLES.han_van;
    expect(hv.tileTint).toBeDefined();
    expect(validateStyle(hv)).toEqual([]);
    const t = hv.tileTint!;
    const [r, g, b] = [(t.color >> 16) & 255, (t.color >> 8) & 255, t.color & 255];
    expect(b).toBeGreaterThan(r); // lạnh
    expect(Math.min(r, g, b)).toBeGreaterThan(200); // sáng (trắng xanh), không phải màu tối
    expect(t.alpha).toBeGreaterThan(0.2);
    expect(t.alpha).toBeLessThanOrEqual(MAX_TILE_TINT_ALPHA);
    for (const [id, st] of Object.entries(MAP_STYLES))
      if (id !== "han_van") expect(st.tileTint, id).toBeUndefined();
  });

  it("validateStyle: độ đậm ngoài trần / màu hỏng bị bắt; planTileTint: vắng hoặc 0 => null, quá trần thì kẹp", () => {
    const base = MAP_STYLES.han_van;
    expect(
      validateStyle({
        ...base,
        tileTint: { color: 0xffffff, alpha: MAX_TILE_TINT_ALPHA + 0.01 },
      }).join(),
    ).toContain("tileTint.alpha");
    expect(validateStyle({ ...base, tileTint: { color: 0xffffff, alpha: -0.1 } }).join()).toContain(
      "tileTint.alpha",
    );
    expect(validateStyle({ ...base, tileTint: { color: 0x1000000, alpha: 0.2 } }).join()).toContain(
      "tileTint.color",
    );
    expect(planTileTint(MAP_STYLES.lac_ha)).toBeNull();
    expect(planTileTint({ ...base, tileTint: { color: 0xffffff, alpha: 0 } })).toBeNull();
    expect(planTileTint(base)).toEqual(base.tileTint);
    expect(planTileTint({ ...base, tileTint: { color: 0xffffff, alpha: 5 } })!.alpha).toBe(
      MAX_TILE_TINT_ALPHA,
    );
  });
});
