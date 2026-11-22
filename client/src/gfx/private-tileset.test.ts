// Nền bản đồ từ gói RIÊNG (mục 63, `gfx/private-tileset.ts`): hai nhánh (có / không gói) đều chạy ở `npm test` mặc định, KHÔNG cần tệp thật hay Phaser
// thật: `packs` và `scene` là bản giả theo giao diện hẹp. Đồng thời canh bảng `PRIVATE_ART` thật khớp lưới ô của hình thay thế (bảng hiện RỖNG).
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { T, TILE } from "@tien-gioi/shared";
import {
  PRIVATE_ART,
  PRIVATE_ART_FALLBACK_GRID,
  privateArtViolations,
  type PrivateArtEntry,
} from "./private-art";
import {
  PRIVATE_TILESET_KEY,
  TILESET_ART_KEY,
  TILE_TYPE_COUNT,
  loadPrivateTilesetTexture,
  privateTilesetUrl,
  tilesetKeyFor,
  type TilesetLoaderScene,
} from "./private-tileset";

const ENTRY: PrivateArtEntry = {
  pack: "cainos",
  path: "tileset.png",
  frameWidth: TILE,
  frameHeight: TILE,
};
const TABLE = { [TILESET_ART_KEY]: ENTRY };

function fakePacks(
  state: string,
  url: string | null = "/assets-private/cainos/tileset.png?v=abcdef012345",
) {
  return {
    state: vi.fn((id: string) => (id === "private:cainos" ? state : "idle")) as never,
    fileUrl: vi.fn((id: string, path: string) =>
      id === "private:cainos" && path === "tileset.png" ? url : null,
    ) as never,
  };
}

describe("privateTilesetUrl: khi nào dùng nền của gói riêng", () => {
  it("bảng RỖNG (hiện tại) => null: giữ hình thay thế, không hỏi gói", () => {
    const p = fakePacks("ready");
    expect(privateTilesetUrl(p)).toBeNull();
    expect(p.state).not.toHaveBeenCalled();
  });

  it("có khoá `tileset` và gói `ready` => URL của bộ nạp (đúng URL `fileUrl`, khớp bộ nhớ đệm)", () => {
    expect(privateTilesetUrl(fakePacks("ready"), TABLE)).toBe(
      "/assets-private/cainos/tileset.png?v=abcdef012345",
    );
  });

  it("gói chưa xong / lỗi / chưa tải => null", () => {
    for (const st of ["idle", "loading", "failed"])
      expect(privateTilesetUrl(fakePacks(st), TABLE)).toBeNull();
  });

  it("gói `ready` nhưng manifest không có tệp (fileUrl null) => null", () => {
    expect(privateTilesetUrl(fakePacks("ready", null), TABLE)).toBeNull();
  });

  it("ô của gói KHÔNG đúng TILE x TILE => null dù gói sẵn sàng (không để ô lệch cỡ làm vỡ bản đồ)", () => {
    for (const bad of [
      { frameWidth: 16, frameHeight: 16 },
      { frameWidth: TILE, frameHeight: 16 },
      { frameWidth: 16, frameHeight: TILE },
      { frameWidth: TILE, frameHeight: 64 },
    ])
      expect(
        privateTilesetUrl(fakePacks("ready"), { [TILESET_ART_KEY]: { ...ENTRY, ...bad } }),
      ).toBeNull();
  });

  it("khoá khác (không phải `tileset`) hoặc khoá kế thừa của Object không tính", () => {
    expect(privateTilesetUrl(fakePacks("ready"), { khac: ENTRY })).toBeNull();
    expect(privateTilesetUrl(fakePacks("ready"), {})).toBeNull();
  });
});

describe("tilesetKeyFor: khoá texture dựng nền", () => {
  it("đã nạp texture của gói riêng => dùng nó; chưa => hình thay thế", () => {
    expect(tilesetKeyFor((k) => k === PRIVATE_TILESET_KEY, "tileset")).toBe(PRIVATE_TILESET_KEY);
    expect(tilesetKeyFor(() => false, "tileset")).toBe("tileset");
    expect(tilesetKeyFor((k) => k === "tileset", "tileset")).toBe("tileset");
  });

  it("khoá private KHÁC khoá hình thay thế (giữ nguyên hình thay thế để lùi lại được)", () => {
    expect(PRIVATE_TILESET_KEY).not.toBe("tileset");
  });
});

describe("kích thước dải ô", () => {
  it("TILE_TYPE_COUNT = số loại ô của T (8) và hình thay thế `tileset.png` rộng đúng TILE x số này, cao TILE", () => {
    expect(TILE_TYPE_COUNT).toBe(8);
    expect(TILE_TYPE_COUNT).toBe(Object.keys(T).filter((k) => !/^\d+$/.test(k)).length);
    const b = fs.readFileSync(new URL("../../public/assets/tileset.png", import.meta.url));
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([TILE * TILE_TYPE_COUNT, TILE]);
  });
});

interface FakeOpts {
  exists?: boolean;
  /** Kích thước ảnh sau khi nạp; null = nạp lỗi (không có texture). */
  size?: { width: number; height: number } | null;
  throwOnImage?: boolean;
  /** `off` KHÔNG gỡ trình nghe (mô phỏng sự kiện đến lần hai trước khi gỡ kịp). */
  stickyHandlers?: boolean;
}
function fakeScene(o: FakeOpts = {}) {
  let have = o.exists ?? false;
  const handlers = new Map<string, Array<(...a: unknown[]) => void>>();
  const textures = {
    exists: vi.fn((k: string) => have && k === PRIVATE_TILESET_KEY),
    remove: vi.fn(() => {
      have = false;
    }),
    get: vi.fn(() => ({ getSourceImage: () => o.size ?? { width: 0, height: 0 } })),
  };
  const load = {
    image: vi.fn(() => {
      if (o.throwOnImage) throw new Error("loader hỏng");
    }),
    once: vi.fn((ev: string, fn: (...a: unknown[]) => void) => {
      handlers.set(ev, [...(handlers.get(ev) ?? []), fn]);
    }),
    off: vi.fn((ev: string, fn: (...a: unknown[]) => void) => {
      if (o.stickyHandlers) return;
      handlers.set(
        ev,
        (handlers.get(ev) ?? []).filter((h) => h !== fn),
      );
    }),
    start: vi.fn(),
  };
  const scene = { textures, load } as unknown as TilesetLoaderScene;
  /** Mô phỏng Phaser xong hàng đợi: có texture nếu `size` khác null. */
  const complete = () => {
    have = o.size != null;
    for (const h of [...(handlers.get("complete") ?? [])]) h();
  };
  return { scene, textures, load, complete };
}

const GOOD = { width: TILE * TILE_TYPE_COUNT, height: TILE };

describe("loadPrivateTilesetTexture: nạp dải ô riêng, không bao giờ ném lỗi", () => {
  it("đã có texture => báo xong NGAY, không tải lại", () => {
    const f = fakeScene({ exists: true });
    const done = vi.fn();
    loadPrivateTilesetTexture(f.scene, "/u", done);
    expect(done).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.load.image).not.toHaveBeenCalled();
  });

  it("nạp xong, đúng cỡ => done(true), texture giữ lại, nạp đúng khoá + URL rồi mới `start`", () => {
    const f = fakeScene({ size: GOOD });
    const done = vi.fn();
    loadPrivateTilesetTexture(f.scene, "/assets-private/cainos/tileset.png?v=1", done);
    expect(f.load.image).toHaveBeenCalledWith(
      PRIVATE_TILESET_KEY,
      "/assets-private/cainos/tileset.png?v=1",
    );
    expect(f.load.start).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled(); // chưa xong thì chưa báo
    f.complete();
    expect(done).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.textures.remove).not.toHaveBeenCalled();
  });

  it("nạp xong nhưng SAI cỡ (ô 16 px, thiếu ô, cao khác TILE) => xoá texture, done(false)", () => {
    for (const size of [
      { width: 16 * TILE_TYPE_COUNT, height: 16 },
      { width: TILE * (TILE_TYPE_COUNT - 1), height: TILE },
      { width: TILE * TILE_TYPE_COUNT, height: TILE * 2 },
    ]) {
      const f = fakeScene({ size });
      const done = vi.fn();
      loadPrivateTilesetTexture(f.scene, "/u", done);
      f.complete();
      expect(done).toHaveBeenCalledExactlyOnceWith(false);
      expect(f.textures.remove).toHaveBeenCalledWith(PRIVATE_TILESET_KEY);
    }
  });

  it("tệp lỗi (không ra texture) => done(false), không ném", () => {
    const f = fakeScene({ size: null });
    const done = vi.fn();
    loadPrivateTilesetTexture(f.scene, "/u", done);
    f.complete();
    expect(done).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("bộ nạp ném lỗi lúc xếp hàng => done(false), không ném ra ngoài", () => {
    const f = fakeScene({ throwOnImage: true });
    const done = vi.fn();
    expect(() => loadPrivateTilesetTexture(f.scene, "/u", done)).not.toThrow();
    expect(done).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("`complete` đến hai lần chỉ báo MỘT lần và gỡ trình nghe", () => {
    const f = fakeScene({ size: GOOD, stickyHandlers: true });
    const done = vi.fn();
    loadPrivateTilesetTexture(f.scene, "/u", done);
    f.complete();
    f.complete();
    expect(done).toHaveBeenCalledTimes(1);
    expect(f.load.off).toHaveBeenCalledWith("complete", expect.any(Function));
  });
});

describe("bảng PRIVATE_ART thật", () => {
  it("khớp lưới ô của hình thay thế (rỗng thì hiển nhiên đúng; điền khoá sai lưới thì ĐỎ)", () => {
    expect(privateArtViolations(PRIVATE_ART, PRIVATE_ART_FALLBACK_GRID)).toEqual([]);
    expect(PRIVATE_ART_FALLBACK_GRID[TILESET_ART_KEY]).toEqual([TILE, TILE]);
    expect(
      privateArtViolations(
        { [TILESET_ART_KEY]: { ...ENTRY, frameWidth: 16, frameHeight: 16 } },
        PRIVATE_ART_FALLBACK_GRID,
      ),
    ).toHaveLength(1);
  });
});

describe("nối vào WorldScene (quét mã nguồn: bảo vệ chỗ nối vì scene không dựng được trong test)", () => {
  const src = fs.readFileSync(new URL("../scenes/WorldScene.ts", import.meta.url), "utf8");

  it("lớp nền dựng bằng `tilesetKeyFor`, không còn gắn cứng TILESET_KEY ở `addTilesetImage` của nền", () => {
    expect(src).toContain("tilesetKeyFor(");
    expect(src).not.toMatch(/addTilesetImage\(\s*"tiles",\s*TILESET_KEY/);
  });

  it("`refreshPrivateTileset` được gọi lúc tạo scene VÀ khi đổi bản đồ, và gói về muộn (`onReady`) cũng gọi", () => {
    const calls = src.match(/this\.refreshPrivateTileset\(\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3); // create, onReady, changeMap
    expect(src).toMatch(/isPrivatePackDefId\(id\)\)\s*this\.refreshPrivateTileset\(\)/);
  });
});
