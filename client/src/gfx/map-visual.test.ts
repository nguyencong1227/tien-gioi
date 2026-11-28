// Lớp hình từ `visual.json` (client/src/gfx/map-visual.ts, Tiled S3b #1206): kiểm tệp KHÔNG TIN, kích thước ảnh, bộ nạp ảnh, tải JSON. Hàm thuần: không cần Phaser / trình duyệt.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  VISUAL_GID_TREE_CANOPY,
  VISUAL_GID_TREE_TRUNK,
  VISUAL_TREE_BASE_INSET,
  VISUAL_TREE_FRAME,
  VISUAL_LAYER_NAMES,
  VISUAL_MAX_CELLS,
  VISUAL_TILE,
  fetchVisualJson,
  VISUAL_FADE_MS,
  VISUAL_STORAGE_KEY,
  loadVisualTexture,
  mapVisualEnabled,
  onMapVisualPref,
  setMapVisualPref,
  sanitizeVisualMap,
  visualImageFits,
  visualFadePlan,
  visualImageWidth,
  visualMinImageHeight,
  visualOverDepth,
  visualPackPaths,
  visualRows,
  visualTextureKey,
  visualTreeSpots,
  visualWithoutTreeTiles,
  type VisualLoaderScene,
} from "./map-visual";

const here = path.dirname(fileURLToPath(import.meta.url));
const real = (id: string) =>
  JSON.parse(
    fs.readFileSync(path.join(here, `../../public/packs/map-${id}/visual.json`), "utf8"),
  ) as Record<string, unknown>;

/** Bản nhỏ hợp lệ 4 x 3 ô (gid 10..19 trong tileset 5 cột, firstgid 10). */
function tiny(over: Record<string, unknown> = {}) {
  const cells = 12;
  const layer = (name: string, fill: number) => ({
    name,
    type: "tilelayer",
    data: Array.from({ length: cells }, (_, i) => (i % 3 === 0 ? 0 : fill)),
  });
  return {
    type: "map",
    width: 4,
    height: 3,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [
      {
        firstgid: 10,
        name: "world",
        tilewidth: 16,
        tileheight: 16,
        margin: 1,
        spacing: 2,
        columns: 5,
        tilecount: 10,
        image: "tileset_world.png",
      },
    ],
    layers: [layer("ground", 10), layer("decor", 14), layer("over", 19)],
    ...over,
  } as Record<string, unknown>;
}

describe("sanitizeVisualMap: bản nhỏ hợp lệ", () => {
  it("đọc đủ ba lớp, 0 = trống, maxGid đúng, tileset đúng", () => {
    const v = sanitizeVisualMap(tiny(), 4, 3)!;
    expect(v).not.toBeNull();
    expect(v.width).toBe(4);
    expect(v.height).toBe(3);
    expect(v.maxGid).toBe(19);
    expect([...v.ground.subarray(0, 4)]).toEqual([0, 10, 10, 0]);
    expect([...v.decor.subarray(0, 4)]).toEqual([0, 14, 14, 0]);
    expect(v.over[1]).toBe(19);
    expect(v.tileset).toEqual({
      firstgid: 10,
      columns: 5,
      tilecount: 10,
      margin: 1,
      spacing: 2,
      image: "tileset_world.png",
    });
    expect(VISUAL_LAYER_NAMES).toEqual(["ground", "decor", "over"]);
  });
});

describe("sanitizeVisualMap: từ chối tệp xấu (mỗi ca một lỗi)", () => {
  const bad = (mut: (m: Record<string, unknown>) => void, w = 4, h = 3) => {
    const m = tiny();
    mut(m);
    return sanitizeVisualMap(m, w, h);
  };
  const layerOf = (m: Record<string, unknown>, name: string) =>
    (m.layers as { name: string; data: unknown[] }[]).find((l) => l.name === name)!;

  it("không phải đối tượng", () => {
    for (const x of [null, undefined, 5, "x", [], true])
      expect(sanitizeVisualMap(x, 4, 3), String(x)).toBeNull();
  });
  it("kích thước khác bản đồ thật", () => {
    expect(sanitizeVisualMap(tiny(), 5, 3)).toBeNull();
    expect(sanitizeVisualMap(tiny(), 4, 2)).toBeNull();
  });
  it("ô không phải 16 px (map hoặc tileset)", () => {
    expect(bad((m) => (m.tilewidth = 32))).toBeNull();
    expect(bad((m) => ((m.tilesets as Record<string, unknown>[])[0]!.tileheight = 8))).toBeNull();
  });
  it("không đúng MỘT tileset", () => {
    expect(bad((m) => (m.tilesets = []))).toBeNull();
    expect(
      bad((m) => (m.tilesets = [(m.tilesets as unknown[])[0], (m.tilesets as unknown[])[0]])),
    ).toBeNull();
  });
  it("tileset có số lạ / quá lớn / không nguyên", () => {
    const ts = (m: Record<string, unknown>) => (m.tilesets as Record<string, unknown>[])[0]!;
    expect(bad((m) => (ts(m).columns = 0))).toBeNull();
    expect(bad((m) => (ts(m).columns = 2.5))).toBeNull();
    expect(bad((m) => (ts(m).margin = 99))).toBeNull();
    expect(bad((m) => (ts(m).spacing = -1))).toBeNull();
    expect(bad((m) => (ts(m).firstgid = 0))).toBeNull();
    expect(bad((m) => (ts(m).tilecount = 70000))).toBeNull();
    expect(bad((m) => (ts(m).tilecount = "10"))).toBeNull();
  });
  it("tên ảnh không phải tên tệp png trơn (chống đường dẫn lạ)", () => {
    for (const img of ["../x.png", "a/b.png", "x.jpg", "", "x..png", "https://e.com/x.png", 5]) {
      expect(
        bad((m) => ((m.tilesets as Record<string, unknown>[])[0]!.image = img)),
        String(img),
      ).toBeNull();
    }
  });
  it("thiếu lớp, sai kiểu lớp, sai độ dài", () => {
    expect(
      bad((m) => (m.layers = (m.layers as { name: string }[]).filter((l) => l.name !== "over"))),
    ).toBeNull();
    expect(bad((m) => (layerOf(m, "decor").data = [1, 2, 3]))).toBeNull();
    expect(
      bad((m) => ((layerOf(m, "ground") as unknown as { type: string }).type = "objectgroup")),
    ).toBeNull();
    expect(bad((m) => (m.layers = "x"))).toBeNull();
  });
  it("gid ngoài tileset, âm, không nguyên, chuỗi, hoặc CÓ CỜ LẬT của Tiled", () => {
    for (const g of [
      9,
      20,
      -1,
      1.5,
      "12",
      null,
      10 + 0x80000000,
      10 + 0x40000000,
      0x20000000 + 12,
    ]) {
      expect(
        bad((m) => (layerOf(m, "ground").data[5] = g)),
        String(g),
      ).toBeNull();
    }
  });
  it("rộng x cao bị đảo (cùng số ô) vẫn bị từ chối: chỉ kiểm chiều của tệp mới bắt được, độ dài lớp thì khớp", () => {
    expect(sanitizeVisualMap(tiny(), 3, 4)).toBeNull(); // tệp nói 4 x 3, bản đồ thật 3 x 4: cùng 12 ô
  });
  it("quá nhiều ô (chống tệp lạ ngốn bộ nhớ): tệp ĐÚNG mọi mặt nhưng quá trần thì bị từ chối, vừa trần thì qua", () => {
    const big = (w: number, h: number) => {
      const m = tiny({ width: w, height: h });
      m.layers = VISUAL_LAYER_NAMES.map((name) => ({
        name,
        type: "tilelayer",
        data: new Array<number>(w * h).fill(0),
      }));
      return m;
    };
    const side = Math.floor(Math.sqrt(VISUAL_MAX_CELLS));
    expect(sanitizeVisualMap(big(side, side), side, side)).not.toBeNull(); // đúng trần
    expect(sanitizeVisualMap(big(side + 1, side), side + 1, side)).toBeNull(); // quá trần 1 hàng
  });
  it("không bao giờ ném lỗi, kể cả với getter ném", () => {
    const evil = tiny();
    Object.defineProperty(evil, "layers", {
      get() {
        throw new Error("boom");
      },
    });
    expect(sanitizeVisualMap(evil, 4, 3)).toBeNull();
  });
});

describe("kích thước ảnh tileset đùn mép", () => {
  const v = sanitizeVisualMap(tiny(), 4, 3)!;
  it("rộng đúng = 2 x margin + cột x 16 + (cột - 1) x spacing; cao tối thiểu theo gid lớn nhất", () => {
    expect(visualImageWidth(v.tileset)).toBe(2 + 5 * 16 + 4 * 2); // 90
    // gid lớn nhất 19 -> chỉ số 9 -> hàng 1 (5 cột) -> cần 2 hàng: 2 + 2 * 16 + 1 * 2
    expect(visualMinImageHeight(v)).toBe(36);
  });
  it("visualImageFits: rộng phải ĐÚNG, cao phải ĐỦ (cao hơn thì được)", () => {
    expect(visualImageFits(v, { width: 90, height: 36 })).toBe(true);
    expect(visualImageFits(v, { width: 90, height: 80 })).toBe(true);
    expect(visualImageFits(v, { width: 90, height: 35 })).toBe(false);
    expect(visualImageFits(v, { width: 91, height: 80 })).toBe(false);
    expect(visualImageFits(v, { width: 89, height: 80 })).toBe(false);
  });
});

describe("gói bản đồ thật trong repo (client/public/packs/map-<id>/visual.json)", () => {
  const sizes: Record<string, [number, number]> = {
    lac_ha: [96, 96],
    hac_phong: [128, 96],
    am_suong: [128, 112],
    han_van: [128, 128],
  };
  it("cả bốn bản đồ qua kiểm; ảnh tileset_world 396 rộng đúng (22 cột, margin 1, spacing 2)", () => {
    for (const [id, [w, h]] of Object.entries(sizes)) {
      const v = sanitizeVisualMap(real(id), w, h);
      expect(v, id).not.toBeNull();
      expect(visualImageWidth(v!.tileset), id).toBe(396);
      expect(v!.maxGid, id).toBeGreaterThan(v!.tileset.firstgid);
    }
  });
  it("mỗi gói CÓ ảnh tileset_world.png khớp visual.json của nó (rộng đúng 396, đủ cao cho gid lớn nhất) và manifest liệt kê cả hai tệp", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(here, "../../public/packs/manifest.json"), "utf8"),
    ) as { packs: { id: string; files: { path: string }[] }[] };
    for (const [id, [w, h]] of Object.entries(sizes)) {
      const png = fs.readFileSync(
        path.join(here, `../../public/packs/map-${id}/tileset_world.png`),
      );
      expect(png.subarray(1, 4).toString(), id).toBe("PNG");
      const img = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }; // IHDR
      const v = sanitizeVisualMap(real(id), w, h)!;
      expect(
        visualImageFits(v, img),
        `${id}: ảnh ${img.width}x${img.height} không khớp visual.json`,
      ).toBe(true);
      const files = manifest.packs.find((p) => p.id === `map:${id}`)!.files.map((f) => f.path);
      expect(files, id).toContain(`map-${id}/tileset_world.png`);
      expect(files, id).toContain(`map-${id}/visual.json`);
    }
  });
  it("sai kích thước bản đồ thì từ chối (nhầm gói của bản đồ khác)", () => {
    expect(sanitizeVisualMap(real("lac_ha"), 128, 96)).toBeNull();
  });
});

describe("visualPackPaths / visualTextureKey / visualRows", () => {
  it("đường dẫn trong gói theo id bản đồ; id lạ bị từ chối", () => {
    expect(visualPackPaths("lac_ha", "tileset_world.png")).toEqual({
      json: "map-lac_ha/visual.json",
      image: "map-lac_ha/tileset_world.png",
    });
    for (const id of ["", "../x", "a/b", "A", "x y", "__proto__x/y"])
      expect(visualPackPaths(id, "t.png"), id).toBeNull();
    expect(visualTextureKey("lac_ha")).toBe("map-visual:lac_ha");
  });
  it("visualRows cắt đúng hàng", () => {
    const rows = visualRows(Uint16Array.from([1, 2, 3, 4, 5, 6]), 3, 2);
    expect(rows).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });
});

function fakeScene(opts: { size?: { width: number; height: number } | null; fail?: boolean } = {}) {
  const have = new Set<string>();
  const handlers = new Map<string, (...a: unknown[]) => void>();
  const scene: VisualLoaderScene & { have: Set<string>; fire(): void } = {
    have,
    textures: {
      exists: (k) => have.has(k),
      remove: (k) => void have.delete(k),
      get: () => ({
        getSourceImage: () => {
          if (opts.size === null) throw new Error("no image");
          return opts.size ?? { width: 90, height: 40 };
        },
      }),
    },
    load: {
      image: (k) => {
        if (opts.fail) throw new Error("boom");
        if (opts.size !== undefined || !opts.fail) have.add(k);
      },
      once: (e, fn) => void handlers.set(e, fn),
      off: (e) => void handlers.delete(e),
      start: () => undefined,
    },
    fire() {
      handlers.get("complete")?.();
    },
  };
  return scene;
}

describe("loadVisualTexture", () => {
  const fits = (i: { width: number; height: number }) => i.width === 90 && i.height >= 36;

  it("ảnh đúng cỡ: done(true), texture giữ lại", () => {
    const s = fakeScene();
    const done = vi.fn();
    loadVisualTexture(s, "k", "/u.png", fits, done);
    expect(done).not.toHaveBeenCalled();
    s.fire();
    expect(done).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledWith(true);
    expect(s.have.has("k")).toBe(true);
  });
  it("ảnh SAI cỡ: done(false) và XOÁ texture", () => {
    const s = fakeScene({ size: { width: 91, height: 40 } });
    const done = vi.fn();
    loadVisualTexture(s, "k", "/u.png", fits, done);
    s.fire();
    expect(done).toHaveBeenCalledWith(false);
    expect(s.have.has("k")).toBe(false);
  });
  it("không đọc được ảnh nguồn: done(false)", () => {
    const s = fakeScene({ size: null });
    const done = vi.fn();
    loadVisualTexture(s, "k", "/u.png", fits, done);
    s.fire();
    expect(done).toHaveBeenCalledWith(false);
    expect(s.have.has("k")).toBe(false);
  });
  it("tải hỏng (Phaser ném): done(false) ngay, không ném", () => {
    const s = fakeScene({ fail: true });
    const done = vi.fn();
    expect(() => loadVisualTexture(s, "k", "/u.png", fits, done)).not.toThrow();
    expect(done).toHaveBeenCalledWith(false);
  });
  it("texture đã có: done(true) ngay, không tải lại", () => {
    const s = fakeScene();
    s.have.add("k");
    const img = vi.spyOn(s.load, "image");
    const done = vi.fn();
    loadVisualTexture(s, "k", "/u.png", fits, done);
    expect(done).toHaveBeenCalledWith(true);
    expect(img).not.toHaveBeenCalled();
  });
  it("complete tới hai lần: done chỉ gọi MỘT lần", () => {
    const s = fakeScene();
    const done = vi.fn();
    loadVisualTexture(s, "k", "/u.png", fits, done);
    s.fire();
    s.fire();
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("fetchVisualJson", () => {
  const ok = (body: unknown) =>
    (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
  it("trả JSON khi HTTP ổn", async () => {
    expect(await fetchVisualJson("/x", ok({ a: 1 }))).toEqual({ a: 1 });
  });
  it("HTTP lỗi / JSON hỏng / mạng ném: null, không ném", async () => {
    expect(
      await fetchVisualJson("/x", (async () => ({
        ok: false,
        json: async () => ({}),
      })) as unknown as typeof fetch),
    ).toBeNull();
    expect(
      await fetchVisualJson("/x", (async () => ({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      })) as unknown as typeof fetch),
    ).toBeNull();
    expect(
      await fetchVisualJson("/x", (async () => {
        throw new Error("net");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
  it("quá giờ thì huỷ và trả null", async () => {
    const slow = ((_u: string, init?: { signal?: AbortSignal }) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      })) as unknown as typeof fetch;
    expect(await fetchVisualJson("/x", slow, 20)).toBeNull();
  });
});

describe("hằng số", () => {
  it("ô tileset nhúng 16 px (khớp ảnh dựng bởi dung-tileset-world.py)", () => {
    expect(VISUAL_TILE).toBe(16);
  });
});

describe("mapVisualEnabled (cờ bật / tắt lớp hình mới)", () => {
  const store = (v: string | null) => ({
    getItem: (k: string) => (k === VISUAL_STORAGE_KEY ? v : null),
  });
  it("mặc định BẬT (không tham số, không khoá lưu, hoặc không có localStorage)", () => {
    expect(mapVisualEnabled("", store(null))).toBe(true);
    expect(mapVisualEnabled("", null)).toBe(true);
    expect(mapVisualEnabled("?crowd=12", null)).toBe(true);
  });
  it("?debug mặc định TẮT (cảnh cũ ổn định cho script đo / E2E); ?visual=1 bật lại, ?visual=0 vẫn tắt", () => {
    expect(mapVisualEnabled("?debug=1", null)).toBe(false);
    expect(mapVisualEnabled("?dungeon=mock&debug=1", store(null))).toBe(false);
    expect(mapVisualEnabled("?debug=1&visual=1", null)).toBe(true);
    expect(mapVisualEnabled("?debug=1&visual=1", store("0"))).toBe(true);
    expect(mapVisualEnabled("?debug=1&visual=0", null)).toBe(false);
  });
  it("lựa chọn RÕ RÀNG ở Cài đặt ('1' / '0') thắng mặc định của ?debug; ?visual vẫn thắng lựa chọn", () => {
    expect(mapVisualEnabled("?debug=1", store("1"))).toBe(true);
    expect(mapVisualEnabled("?debug=1", store("0"))).toBe(false);
    expect(mapVisualEnabled("?debug=1&visual=0", store("1"))).toBe(false);
    expect(mapVisualEnabled("", store("0"))).toBe(false);
  });
  it("?visual=0 tắt, ?visual=1 bật và THẮNG khoá lưu", () => {
    expect(mapVisualEnabled("?visual=0", store(null))).toBe(false);
    expect(mapVisualEnabled("?visual=0", store("1"))).toBe(false);
    expect(mapVisualEnabled("?visual=1", store("0"))).toBe(true);
  });
  it("khoá lưu '0' tắt; giá trị khác (rác) vẫn bật", () => {
    expect(mapVisualEnabled("", store("0"))).toBe(false);
    expect(mapVisualEnabled("", store("1"))).toBe(true);
    expect(mapVisualEnabled("", store("off"))).toBe(true);
    expect(mapVisualEnabled("?visual=2", store("0"))).toBe(false);
  });
  it("trình duyệt chặn localStorage (getItem ném): không ném, mặc định bật", () => {
    const evil = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(mapVisualEnabled("", evil)).toBe(true);
  });
});

describe("độ sâu lớp over và làm mờ chuyển", () => {
  it("over NGAY DƯỚI worldH (phủ mọi thực thể y <= worldH, nhưng fx / vòng chọn ở đúng worldH nằm TRÊN tán)", () => {
    const worldH = 3072;
    const over = visualOverDepth(worldH);
    expect(over).toBeLessThan(worldH); // fx / targetRing / tia kiếm khí ở worldH không bị che
    expect(over).toBeGreaterThan(worldH - 1); // vẫn trên mọi thực thể xếp theo y
    expect(over).toBeGreaterThan(-9); // trên decor
  });
  it("làm mờ chỉ khi CÓ nền cũ và KHÔNG giảm chuyển động", () => {
    expect(visualFadePlan(true, false)).toEqual({ fade: true, ms: VISUAL_FADE_MS });
    expect(visualFadePlan(true, true)).toEqual({ fade: false, ms: 0 });
    expect(visualFadePlan(false, false)).toEqual({ fade: false, ms: 0 });
    expect(visualFadePlan(false, true)).toEqual({ fade: false, ms: 0 });
    expect(VISUAL_FADE_MS).toBeGreaterThan(100);
    expect(VISUAL_FADE_MS).toBeLessThan(1000);
  });
});

describe("setMapVisualPref / onMapVisualPref (ô Cài đặt)", () => {
  it("ghi '1' / '0' vào khoá lưu và báo mọi người nghe; huỷ đăng ký thì thôi báo", () => {
    const m = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => void m.set(k, v) };
    const calls: string[] = [];
    const off = onMapVisualPref(() => calls.push("a"));
    setMapVisualPref(storage, false);
    expect(m.get(VISUAL_STORAGE_KEY)).toBe("0");
    setMapVisualPref(storage, true);
    expect(m.get(VISUAL_STORAGE_KEY)).toBe("1");
    expect(calls).toEqual(["a", "a"]);
    off();
    setMapVisualPref(storage, true);
    expect(calls).toHaveLength(2);
  });
  it("không bao giờ ném lỗi: lưu bị chặn vẫn báo; một người nghe lỗi không chặn người khác", () => {
    const evil = {
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    const calls: string[] = [];
    const offBad = onMapVisualPref(() => {
      throw new Error("lỗi nghe");
    });
    const offGood = onMapVisualPref(() => calls.push("ok"));
    expect(() => setMapVisualPref(evil, true)).not.toThrow();
    expect(() => setMapVisualPref(null, false)).not.toThrow();
    expect(calls).toEqual(["ok", "ok"]);
    offBad();
    offGood();
  });
});

// ---- CÂY NGUYÊN KHỐI (QUYET_DINH_M3 mục 73): thân + tán không còn là hai ô rời ----
const hereDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hereDir, "../../..");

/** Giải mã PNG RGBA 8 bit mọi bộ lọc (Pillow lưu `optimize=True` dùng bộ lọc thích ứng, khác bộ mã hoá bộ lọc None của `gen-assets.mjs`). */
function decodePng(b: Buffer) {
  const idat: Buffer[] = [];
  for (let off = 8; off < b.length;) {
    const len = b.readUInt32BE(off);
    if (b.toString("ascii", off + 4, off + 8) === "IDAT")
      idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  expect(b[24]).toBe(8); // độ sâu bit
  expect(b[25]).toBe(6); // RGBA
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const up = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      let v = x;
      if (ft === 1) v = x + a;
      else if (ft === 2) v = x + up;
      else if (ft === 3) v = x + ((a + up) >> 1);
      else if (ft === 4) {
        const pp = a + up - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - up);
        const pc = Math.abs(pp - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c);
      }
      px[y * stride + i] = v & 255;
    }
  }
  return { w, h, alpha: (x: number, y: number) => px[y * stride + x * bpp + 3] };
}

describe("cây nguyên khối: vị trí và bỏ ô thân / tán", () => {
  it("gốc cây cách đáy ô logic ĐÚNG 3 px (số cứng, không theo hằng): rễ nằm trong ô bị chặn, không thò sang ô phía nam", () => {
    expect(VISUAL_TREE_BASE_INSET).toBe(3);
    const decor = new Uint16Array(2 * 2);
    decor[1] = VISUAL_GID_TREE_TRUNK; // ô (1, 0)
    expect(visualTreeSpots(decor, 2, 2, 32)).toEqual([{ x: 48, y: 29, flip: expect.any(Boolean) }]);
  });

  it("MỖI ô GID thân cây (620) là một cây: giữa gốc ở giữa ô, đáy rễ cách đáy ô VISUAL_TREE_BASE_INSET, độ sâu = y gốc", () => {
    const w = 4;
    const decor = new Uint16Array(w * 3);
    decor[1 * w + 2] = VISUAL_GID_TREE_TRUNK; // ô (2, 1)
    decor[2 * w + 0] = VISUAL_GID_TREE_TRUNK; // ô (0, 2)
    decor[0 * w + 3] = 622; // đá: không phải cây
    const spots = visualTreeSpots(decor, w, 3, 32);
    expect(spots.map((s) => [s.x, s.y])).toEqual([
      [2.5 * 32, 2 * 32 - VISUAL_TREE_BASE_INSET],
      [0.5 * 32, 3 * 32 - VISUAL_TREE_BASE_INSET],
    ]);
  });

  it("ô tán (621), đá, bụi và ô trống KHÔNG sinh cây; lớp ngắn hơn khai báo không ném lỗi", () => {
    const decor = Uint16Array.from([0, VISUAL_GID_TREE_CANOPY, 622, 623, 10]);
    expect(visualTreeSpots(decor, 5, 1, 32)).toEqual([]);
    expect(visualTreeSpots(new Uint16Array(3).fill(VISUAL_GID_TREE_TRUNK), 4, 4, 32)).toHaveLength(
      3,
    );
    expect(visualTreeSpots(new Uint16Array(0), 4, 4, 32)).toEqual([]);
  });

  it("lật ngang tất định theo ô (cùng đầu vào cùng kết quả) và có cả hai hướng trong một cánh rừng", () => {
    const decor = new Uint16Array(10 * 10).fill(VISUAL_GID_TREE_TRUNK);
    const a = visualTreeSpots(decor, 10, 10, 32);
    const b = visualTreeSpots(decor, 10, 10, 32);
    expect(a).toEqual(b);
    const flips = a.filter((s) => s.flip).length;
    expect(flips).toBeGreaterThan(20);
    expect(flips).toBeLessThan(80);
  });

  it("visualWithoutTreeTiles bỏ ĐÚNG ô 620 / 621 (thành 0), giữ nguyên ô khác và không sửa mảng gốc", () => {
    const layer = Uint16Array.from([VISUAL_GID_TREE_TRUNK, 5, VISUAL_GID_TREE_CANOPY, 622, 623, 0]);
    const out = visualWithoutTreeTiles(layer);
    expect([...out]).toEqual([0, 5, 0, 622, 623, 0]);
    expect(layer[0]).toBe(VISUAL_GID_TREE_TRUNK); // bản gốc nguyên vẹn
  });
});

describe("cây nguyên khối: đồng bộ với máy chủ, script dựng tileset và ảnh thật", () => {
  it("GID thân / tán KHỚP GID_TREE_TRUNK / GID_TREE_CANOPY của server/src/systems/map-builder.ts", () => {
    const text = fs.readFileSync(path.join(repoRoot, "server/src/systems/map-builder.ts"), "utf-8");
    const num = (name: string) =>
      Number(new RegExp(`export const ${name} = (\\d+);`).exec(text)?.[1]);
    expect(num("GID_TREE_TRUNK")).toBe(VISUAL_GID_TREE_TRUNK);
    expect(num("GID_TREE_CANOPY")).toBe(VISUAL_GID_TREE_CANOPY);
  });

  it("VISUAL_TREE_FRAME KHỚP TREE_FRAME của client/scripts/art/dung-tileset-world.py", () => {
    const py = fs.readFileSync(
      path.join(repoRoot, "client/scripts/art/dung-tileset-world.py"),
      "utf-8",
    );
    const m = /^TREE_FRAME = \((\d+), (\d+), (\d+), (\d+)\)/m.exec(py);
    expect(m, "thiếu TREE_FRAME trong script").not.toBeNull();
    const [x, y, w, h] = (m as RegExpExecArray).slice(1).map(Number);
    expect({ x, y, w, h }).toEqual(VISUAL_TREE_FRAME);
  });

  for (const id of ["lac_ha", "hac_phong", "am_suong", "han_van"]) {
    it(`${id}: ảnh tileset_world.png CÓ sprite cây trong khung (góc trên trong suốt, giữa đặc, rễ chạm đáy) và quanh khung trống`, () => {
      const png = decodePng(
        fs.readFileSync(path.join(repoRoot, `client/public/packs/map-${id}/tileset_world.png`)),
      );
      const { x, y, w, h } = VISUAL_TREE_FRAME;
      expect(x + w).toBeLessThanOrEqual(png.w);
      expect(y + h).toBeLessThanOrEqual(png.h);
      expect(png.alpha(x, y)).toBe(0);
      expect(png.alpha(x + w - 1, y)).toBe(0);
      expect(png.alpha(x + w / 2, y + 12)).toBe(255);
      let rootOpaque = 0;
      for (let dx = -4; dx < 4; dx++)
        if (png.alpha(x + w / 2 + dx, y + h - 1) === 255) rootOpaque++;
      expect(rootOpaque, "rễ phải chạm đáy khung (điểm neo ở gốc)").toBeGreaterThan(0);
      let opaque = 0;
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) if (png.alpha(x + i, y + j) === 255) opaque++;
      expect(opaque).toBeGreaterThan(600); // một cây trọn vẹn 32 x 31, không phải ô lẻ
      // quanh khung (1 px) trống: sprite không đè lên ô nào của lưới tileset
      for (let i = -1; i <= w; i++) {
        expect(png.alpha(x + i, y - 1)).toBe(0);
        expect(png.alpha(x + i, y + h)).toBe(0);
      }
      for (let j = -1; j <= h; j++) {
        expect(png.alpha(x - 1, y + j)).toBe(0);
        expect(png.alpha(x + w, y + j)).toBe(0);
      }
    });
  }
});
