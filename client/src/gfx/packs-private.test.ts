// Gói tài nguyên RIÊNG (mục 63) đi qua bộ nạp `gfx/packs.ts` như NGUỒN THỨ HAI: hai nhánh (có / không gói) đều chạy ở `npm test` mặc định bằng môi trường giả, KHÔNG cần tệp thật.
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_PACK_MANIFEST_URL } from "@tien-gioi/shared";
import {
  MAP_PACK_TIMEOUT_MS,
  MAX_ATTEMPTS,
  PRIVATE_MANIFEST_TIMEOUT_MS,
  createPacks,
  defFileUrl,
  isPrivatePackDefId,
  privatePackDefId,
  sanitizeManifest,
  type PacksEnv,
} from "./packs";
import {
  PRIVATE_ART,
  PRIVATE_MAP_PACKS,
  privateArtUrl,
  privateArtViolations,
  type PrivateArtEntry,
} from "./private-art";

const SHA = "b".repeat(64);
const V = SHA.slice(0, 12);
const MANIFEST = {
  packs: [
    {
      id: "cainos",
      title: "Cainos Basic",
      url: "https://example.com/cainos",
      license: "Miễn phí, cấm phân phối lại",
      files: [
        { path: "atlas.png", bytes: 100, sha256: SHA },
        { path: "tiles/ground.webp", bytes: 40, sha256: "c".repeat(64) },
      ],
    },
    { id: "swords", title: "Tiny Swords", files: [{ path: "a.png", bytes: 10, sha256: SHA }] },
  ],
};
const PUBLIC_MANIFEST = {
  packs: [
    {
      id: "map:lac_ha",
      kind: "map",
      mapId: "lac_ha",
      files: [{ path: "m/a.webp", bytes: 7, sha256: SHA }],
    },
  ],
};

interface Opts {
  privateText?: string | null | "hang";
  failBytes?: (url: string, n: number) => boolean;
  wrongSize?: boolean;
  native?: boolean;
  throwText?: boolean;
  /** Treo việc tải tệp của gói riêng cho tới khi gọi `release()` (thử chờ cùng gói bản đồ). */
  holdPrivate?: boolean;
}
function fake(o: Opts = {}) {
  const log = { texts: [] as string[], bytes: [] as string[], warns: [] as string[] };
  const gate = { release: [] as (() => void)[] };
  const privateText = o.privateText === undefined ? JSON.stringify(MANIFEST) : o.privateText;
  const env: PacksEnv = {
    async fetchText(url) {
      log.texts.push(url);
      if (o.throwText) throw new Error("mạng lỗi");
      if (url === PRIVATE_PACK_MANIFEST_URL) {
        if (privateText === "hang") return new Promise<string | null>(() => {});
        return privateText;
      }
      return JSON.stringify(PUBLIC_MANIFEST);
    },
    async fetchBytes(url) {
      log.bytes.push(url);
      if (o.holdPrivate && url.startsWith("/assets-private/"))
        await new Promise<void>((r) => gate.release.push(r));
      if (o.failBytes?.(url, log.bytes.length)) throw new Error("tải lỗi");
      if (o.wrongSize) return 1;
      const path =
        /\/assets-private\/[^/]+\/([^?]+)\?/.exec(url)?.[1] ?? /\/packs\/([^?]+)\?/.exec(url)?.[1];
      const all = [
        ...MANIFEST.packs.flatMap((p) => p.files),
        ...PUBLIC_MANIFEST.packs.flatMap((p) => p.files),
      ];
      return all.find((f) => f.path === path)?.bytes ?? 0;
    },
    native: () => o.native ?? false,
    saveData: () => false,
    connection: () => "4g",
    hdAllowed: () => true,
    idle: (cb) => cb(),
    warn: (m) => log.warns.push(m),
  };
  return { env, log, gate };
}

afterEach(() => vi.useRealTimers());

describe("gói riêng: KHÔNG có gói (CI, máy dev) -> im lặng, không lỗi, dùng hình thay thế", () => {
  const NONE: [string, string | null][] = [
    ["404 / không có", null],
    ["manifest rỗng { packs: [] } (máy chủ tắt)", JSON.stringify({ packs: [] })],
    ["index.html do máy chủ trả cho đường dẫn lạ", "<!doctype html><html><body>x</body></html>"],
    ["JSON hỏng", "{ packs: ["],
    ["không phải đối tượng", "[1, 2]"],
    ["hợp đồng cũ có `version` (trường lạ)", JSON.stringify({ version: 1, packs: [] })],
    [
      "đường dẫn nguy hiểm",
      JSON.stringify({
        packs: [{ id: "x", title: "Xx", files: [{ path: "../etc/a.png", bytes: 1, sha256: SHA }] }],
      }),
    ],
    [
      "trường lạ ở gói",
      JSON.stringify({ packs: [{ id: "x", title: "Xx", kind: "map", files: [] }] }),
    ],
  ];
  for (const [name, text] of NONE)
    it(`${name}: ensure trả skipped, không tải tệp, không cảnh báo`, async () => {
      const { env, log } = fake({ privateText: text });
      const p = createPacks(env, {});
      expect(await p.ensure(privatePackDefId("cainos"))).toBe("skipped");
      expect(log.bytes).toEqual([]);
      expect(log.warns).toEqual([]);
      expect(p.state(privatePackDefId("cainos"))).toBe("idle");
      expect(p.fileUrl(privatePackDefId("cainos"), "atlas.png")).toBeNull();
    });

  it("fetchText ném lỗi hay treo quá hạn: cũng KHÔNG có gói, không chặn quá PRIVATE_MANIFEST_TIMEOUT_MS", async () => {
    const t = fake({ throwText: true });
    expect(await createPacks(t.env, {}).ensure("private:cainos")).toBe("skipped");
    vi.useFakeTimers();
    const h = fake({ privateText: "hang" });
    const p = createPacks(h.env, {});
    const r = p.ensure("private:cainos");
    await vi.advanceTimersByTimeAsync(PRIVATE_MANIFEST_TIMEOUT_MS - 1);
    let done = false;
    void r.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false); // chưa tới hạn
    await vi.advanceTimersByTimeAsync(2);
    expect(await r).toBe("skipped");
    expect(h.log.warns).toEqual([]);
  });
});

describe("gói riêng: CÓ gói", () => {
  it("ensure tải đúng URL /assets-private/<gói>/<tệp>?v=<12 hex>, state ready, fileUrl khớp, lần sau cached", async () => {
    const { env, log } = fake();
    const p = createPacks(env, {});
    expect(await p.ensure("private:cainos")).toBe("loaded");
    expect(log.bytes).toEqual([
      `/assets-private/cainos/atlas.png?v=${V}`,
      `/assets-private/cainos/tiles/ground.webp?v=${"c".repeat(12)}`,
    ]);
    expect(p.state("private:cainos")).toBe("ready");
    expect(p.fileUrl("private:cainos", "atlas.png")).toBe(
      `/assets-private/cainos/atlas.png?v=${V}`,
    );
    expect(p.fileUrl("private:cainos", "tiles/ground.webp")).toBe(
      `/assets-private/cainos/tiles/ground.webp?v=${"c".repeat(12)}`,
    );
    expect(p.fileUrl("private:cainos", "khong_co.png")).toBeNull();
    expect(await p.ensure("private:cainos")).toBe("cached");
    expect(log.bytes).toHaveLength(2); // không tải lại
    expect(log.warns).toEqual([]);
  });

  it("manifest riêng chỉ tải LƯỜI (khi có người xin gói riêng); manifest thường không đụng tới manifest riêng và ngược lại", async () => {
    const a = fake();
    const pa = createPacks(a.env, {});
    expect(await pa.ensure("map:lac_ha")).toBe("loaded");
    await new Promise((r) => setTimeout(r, 5)); // qua một lượt macrotask: không có việc tải ngầm nào của manifest riêng
    expect(a.log.texts).toEqual(["/packs/manifest.json"]); // KHÔNG xin /assets-private/manifest.json
    expect(a.log.bytes.every((u) => u.startsWith("/packs/"))).toBe(true);
    const b = fake();
    const pb = createPacks(b.env, {});
    expect(await pb.ensure("private:swords")).toBe("loaded");
    expect(b.log.texts).toEqual([PRIVATE_PACK_MANIFEST_URL]); // KHÔNG xin /packs/manifest.json
  });

  it("gói riêng không có trong manifest: failed + cảnh báo MỘT lần; /packs/manifest.json KHÔNG thể khai báo gói private", async () => {
    const { env, log } = fake();
    const p = createPacks(env, {});
    expect(await p.ensure("private:khong_co")).toBe("failed");
    expect(await p.ensure("private:khong_co")).toBe("failed");
    expect(log.warns.filter((w) => w.includes("private:khong_co"))).toHaveLength(1);
    // manifest THƯỜNG khai báo kind "private": bị loại (kênh duy nhất của gói riêng là manifest riêng)
    const m = sanitizeManifest({ packs: [{ id: "private:hack", kind: "private", files: [] }] });
    expect(m.packs).toEqual([]);
  });

  it("tải lỗi / sai dung lượng: failed, cảnh báo, thử lại tối đa MAX_ATTEMPTS rồi dừng; privateArtUrl null (hình thay thế)", async () => {
    const table: Record<string, PrivateArtEntry> = {
      "nen/co": { pack: "cainos", path: "atlas.png", frameWidth: 16, frameHeight: 16 },
    };
    for (const o of [{ failBytes: () => true }, { wrongSize: true }]) {
      const { env, log } = fake(o);
      const p = createPacks(env, {});
      for (let i = 0; i < MAX_ATTEMPTS + 2; i++)
        expect(await p.ensure("private:cainos")).toBe("failed");
      expect(log.bytes).toHaveLength(MAX_ATTEMPTS); // mỗi lần thử dừng ở tệp đầu
      expect(log.warns.length).toBeGreaterThanOrEqual(1);
      expect(privateArtUrl(p, "nen/co", table)).toBeNull();
    }
  });

  it("bản native (APK): gói riêng KHÔNG có trong APK nên skipped, không tải manifest riêng; gói thường vẫn 'cached'", async () => {
    const { env, log } = fake({ native: true });
    const p = createPacks(env, {});
    expect(await p.ensure("private:cainos")).toBe("skipped");
    expect(await p.ensure("map:lac_ha")).toBe("cached");
    expect(log.texts).toEqual([]);
    expect(log.bytes).toEqual([]);
  });

  it("releaseKind('private') giải phóng MỌI gói riêng (state idle, onRelease báo), gói thường nguyên vẹn", async () => {
    const { env } = fake();
    const p = createPacks(env, {});
    const released: string[] = [];
    p.onRelease((id) => released.push(id));
    await p.ensure("private:cainos");
    await p.ensure("private:swords");
    await p.ensure("map:lac_ha");
    p.releaseKind("private");
    expect(released.sort()).toEqual(["private:cainos", "private:swords"]);
    expect(p.state("private:cainos")).toBe("idle");
    expect(p.state("private:swords")).toBe("idle");
    expect(p.state("map:lac_ha")).toBe("ready");
    expect(await p.ensure("private:cainos")).toBe("loaded"); // tải lại được
  });

  it("onReady báo gói riêng về xong (kể cả về muộn sau hạn)", async () => {
    const { env } = fake();
    const p = createPacks(env, {});
    const ready: string[] = [];
    p.onReady((id) => ready.push(id));
    await p.ensure("private:swords");
    expect(ready).toEqual(["private:swords"]);
  });
});

describe("gói riêng: gắn vào bản đồ (chờ cùng hạn với gói bản đồ, KHÔNG đổi kết quả trả về)", () => {
  it("startMapWait / takeMapWait chờ cả gói riêng của bản đồ; kết quả vẫn là của GÓI BẢN ĐỒ", async () => {
    const { env, log } = fake();
    const p = createPacks(env, { lac_ha: ["cainos"] });
    p.startMapWait("lac_ha");
    expect(await p.takeMapWait("lac_ha")).toBe("loaded");
    expect(p.state("map:lac_ha")).toBe("ready");
    expect(p.state("private:cainos")).toBe("ready");
    expect(log.bytes.some((u) => u.startsWith("/assets-private/cainos/"))).toBe(true);
  });

  it("takeMapWait CHỜ gói riêng thật: chưa về thì chưa resolve; về rồi mới resolve; treo mãi thì tới hạn của gói bản đồ vẫn resolve với kết quả gói bản đồ", async () => {
    const h = fake({ holdPrivate: true });
    const p = createPacks(h.env, { lac_ha: ["cainos"] });
    let done: string | null = null;
    void p.takeMapWait("lac_ha").then((r) => (done = r));
    await new Promise((r) => setTimeout(r, 20));
    expect(h.gate.release.length).toBeGreaterThan(0); // việc tải tệp riêng đang treo
    expect(done).toBeNull(); // gói bản đồ đã xong nhưng còn chờ gói riêng
    expect(p.state("map:lac_ha")).toBe("ready");
    for (let i = 0; i < 5 && done === null; i++) {
      h.gate.release.splice(0).forEach((r) => r());
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(done).toBe("loaded");
    expect(p.state("private:cainos")).toBe("ready");

    // treo mãi: tới hạn của gói bản đồ thì vẫn resolve (không chặn vào game), kết quả là của gói bản đồ
    vi.useFakeTimers();
    const h2 = fake({ holdPrivate: true });
    const p2 = createPacks(h2.env, { lac_ha: ["cainos"] });
    const r2 = p2.takeMapWait("lac_ha");
    await vi.advanceTimersByTimeAsync(MAP_PACK_TIMEOUT_MS + 10);
    expect(await r2).toBe("loaded");
    expect(p2.state("private:cainos")).toBe("loading"); // vẫn tải tiếp; về muộn thì onReady báo để dựng lại
  });

  it("thiếu gói riêng (manifest riêng 404): vào bản đồ KHÔNG hỏng, kết quả gói bản đồ giữ nguyên", async () => {
    const { env, log } = fake({ privateText: null });
    const p = createPacks(env, { lac_ha: ["cainos"] });
    expect(await p.takeMapWait("lac_ha")).toBe("loaded");
    expect(p.state("private:cainos")).toBe("idle");
    expect(log.warns).toEqual([]);
  });

  it("bản đồ không khai báo / tên đặc biệt (constructor) không có gói riêng; mặc định PRIVATE_MAP_PACKS rỗng không đổi gì", async () => {
    const { env, log } = fake();
    const p = createPacks(env, { lac_ha: ["cainos"] });
    expect(await p.takeMapWait("constructor")).toBe("failed"); // không có gói map:constructor, và KHÔNG tra nhầm thuộc tính nguyên mẫu
    expect(log.texts).not.toContain(PRIVATE_PACK_MANIFEST_URL);
    expect(PRIVATE_MAP_PACKS).toEqual({});
    expect(PRIVATE_ART).toEqual({});
    const q = fake();
    const pq = createPacks(q.env); // mặc định
    expect(await pq.takeMapWait("lac_ha")).toBe("loaded");
    expect(q.log.texts).toEqual(["/packs/manifest.json"]); // bảng rỗng: không xin manifest riêng
  });
});

describe("privateArtUrl / privateArtViolations", () => {
  const table: Record<string, PrivateArtEntry> = {
    "nen/co": { pack: "cainos", path: "atlas.png", frameWidth: 16, frameHeight: 16 },
    "cay/lon": { pack: "cainos", path: "tiles/ground.webp", frameWidth: 32, frameHeight: 32 },
    nha: { pack: "swords", path: "khong_co.png", frameWidth: 64, frameHeight: 64 },
  };

  it("chỉ trả URL khi gói READY và có tệp; chưa tải / lỗi / khoá lạ / tệp không có trong manifest -> null (hình thay thế)", async () => {
    const { env } = fake();
    const p = createPacks(env, {});
    expect(privateArtUrl(p, "nen/co", table)).toBeNull(); // chưa tải
    await p.ensure("private:cainos");
    await p.ensure("private:swords");
    expect(privateArtUrl(p, "nen/co", table)).toBe(`/assets-private/cainos/atlas.png?v=${V}`);
    expect(privateArtUrl(p, "cay/lon", table)).toBe(
      `/assets-private/cainos/tiles/ground.webp?v=${"c".repeat(12)}`,
    );
    expect(privateArtUrl(p, "nha", table)).toBeNull(); // gói có, tệp không có trong manifest
    for (const k of ["khong_co", "constructor", "__proto__", "toString", ""])
      expect(privateArtUrl(p, k, table), k).toBeNull();
    p.releaseKind("private");
    expect(privateArtUrl(p, "nen/co", table)).toBeNull(); // đã giải phóng: lùi về hình thay thế
    // mặc định (bảng rỗng): mọi khoá null
    expect(privateArtUrl(p, "nen/co")).toBeNull();
  });

  it("privateArtViolations: bảng khớp lưới hình thay thế thì sạch; thiếu hình thay thế / lệch lưới / kích thước lạ bị nêu TÊN khoá", () => {
    const grid = { "nen/co": [16, 16], "cay/lon": [32, 32], nha: [64, 64] } as const;
    expect(privateArtViolations(table, grid)).toEqual([]);
    expect(privateArtViolations(table, { ...grid, "nen/co": [32, 32] }).join("\n")).toMatch(
      /nen\/co.*lệch/,
    );
    const { nha: _drop, ...noNha } = grid;
    expect(privateArtViolations(table, noNha).join("\n")).toMatch(/nha.*KHÔNG có hình thay thế/);
    const bad = {
      x: { pack: "a", path: "a.png", frameWidth: 0, frameHeight: 16 },
      y: { pack: "a", path: "a.png", frameWidth: 16.5, frameHeight: 16 },
    };
    expect(privateArtViolations(bad, { x: [0, 16], y: [16, 16] }).length).toBe(2);
    expect(privateArtViolations({}, {})).toEqual([]);
  });

  it("BẢNG THẬT: mọi khoá có hình thay thế cùng lưới ô (rỗng thì hiển nhiên đạt; khi thêm khoá, thêm lưới hình thay thế vào đây)", () => {
    // `FALLBACK_GRID`: khoá -> [rộng, cao] của hình thay thế TRONG REPO (Ninja Adventure CC0 / vẽ bằng code). Cập nhật cùng lúc với `PRIVATE_ART`.
    const FALLBACK_GRID: Record<string, readonly [number, number]> = {};
    expect(privateArtViolations(PRIVATE_ART, FALLBACK_GRID)).toEqual([]);
  });
});

describe("defFileUrl / id", () => {
  it("gói thường dưới /packs/, gói riêng dưới /assets-private/<gói>/; nhận dạng id", () => {
    const f = { path: "a/b.png", bytes: 1, sha256: SHA };
    expect(defFileUrl({ id: "map:x", kind: "map", files: [f], bytes: 1 }, f)).toBe(
      `/packs/a/b.png?v=${V}`,
    );
    expect(defFileUrl({ id: "private:cainos", kind: "private", files: [f], bytes: 1 }, f)).toBe(
      `/assets-private/cainos/a/b.png?v=${V}`,
    );
    expect(isPrivatePackDefId("private:x")).toBe(true);
    expect(isPrivatePackDefId("map:private:x")).toBe(false);
    expect(privatePackDefId("cainos")).toBe("private:cainos");
  });
});
