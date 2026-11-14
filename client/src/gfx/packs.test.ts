import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DUNGEON_MAPS } from "@tien-gioi/shared";
import {
  DUNGEON_PACK_TIMEOUT_MS,
  MAP_PACK_TIMEOUT_MS,
  MAP_WAIT_TTL_MS,
  MAX_ATTEMPTS,
  NEIGHBOR_PREFETCH_MAX,
  PORTAL_PREFETCH_PX,
  createPacks,
  mapPackId,
  mapPackTimeoutMs,
  mapsNearPortals,
  neighborMapIds,
  packFileUrl,
  packs,
  sanitizeManifest,
  type PackFile,
  type PacksEnv,
} from "./packs";

const SHA = "a".repeat(64);
const file = (path: string, bytes = 100, sha = SHA): PackFile => ({ path, bytes, sha256: sha });
const manifestText = (...ps: object[]) => JSON.stringify({ packs: ps });
const MAP_A = {
  id: "map:lac_ha",
  kind: "map",
  mapId: "lac_ha",
  files: [file("map/lac_ha/a.webp", 100)],
};
const MAP_B = {
  id: "map:hac_phong",
  kind: "map",
  mapId: "hac_phong",
  files: [file("map/hac_phong/b.webp", 50)],
};
const HD = { id: "hd:lac_ha", kind: "hd", files: [file("hd/lac_ha/a.webp", 300)] };

interface FakeOpts {
  manifest?: string | null;
  failFetch?: (url: string, call: number) => boolean;
  cached?: (url: string) => boolean;
  native?: boolean;
  saveData?: boolean;
  conn?: string;
  hd?: boolean;
}

/** Môi trường giả: ghi lại mọi `fetch`, cho phép treo việc tải bằng `gate` để thử hết giờ / tải muộn. */
function fake(o: FakeOpts = {}) {
  const log = {
    text: 0,
    bytes: [] as string[],
    warns: [] as string[],
    idle: [] as (() => void)[],
    low: [] as boolean[],
  };
  const gate = { hold: false, release: [] as (() => void)[] };
  const flags = { native: o.native ?? false, hd: o.hd ?? true, saveData: o.saveData ?? false };
  const env: PacksEnv = {
    async fetchText() {
      log.text++;
      return o.manifest === undefined ? manifestText(MAP_A, MAP_B, HD) : o.manifest;
    },
    async fetchBytes(url, init) {
      log.bytes.push(url);
      log.low.push(init.lowPriority);
      if (gate.hold)
        await new Promise<void>((r, rej) => {
          gate.release.push(r);
          init.signal.addEventListener("abort", () => rej(new Error("abort")), { once: true });
        });
      if (o.failFetch?.(url, log.bytes.length)) throw new Error("mạng lỗi");
      const f = /\/packs\/(.+)\?/.exec(url)?.[1];
      const all = [MAP_A, MAP_B, HD].flatMap((p) => p.files);
      return all.find((x) => x.path === f)?.bytes ?? 0;
    },
    ...(o.cached ? { isCached: async (u: string) => o.cached!(u) } : {}),
    native: () => flags.native,
    saveData: () => flags.saveData,
    connection: () => o.conn,
    hdAllowed: () => flags.hd,
    idle: (cb) => log.idle.push(cb),
    warn: (m) => log.warns.push(m),
  };
  return { env, log, gate, flags };
}

describe("gfx/packs: làm sạch manifest", () => {
  it("rác (không phải đối tượng / không có packs) thì rỗng, không ném lỗi", () => {
    for (const bad of [null, undefined, 1, "x", [], {}, { packs: 5 }, { packs: "x" }])
      expect(sanitizeManifest(bad).packs).toEqual([]);
  });

  it("giữ gói hợp lệ và tự tính lại bytes (không tin giá trị trong tệp)", () => {
    const m = sanitizeManifest({
      packs: [{ ...MAP_A, bytes: 999999, files: [file("a.webp", 10), file("b.webp", 20)] }],
    });
    expect(m.packs).toHaveLength(1);
    expect(m.packs[0].bytes).toBe(30);
  });

  it("bỏ id sai / trùng, loại lạ, tệp có đường dẫn thoát ra ngoài hoặc băm sai", () => {
    const m = sanitizeManifest({
      packs: [
        { id: "../x", kind: "map", files: [] },
        { id: "ok", kind: "lạ", files: [] },
        { id: "dup", kind: "core", files: [] },
        { id: "dup", kind: "icons", files: [] },
        {
          id: "f",
          kind: "map",
          files: [
            file("../etc/passwd"),
            file("/abs.webp"),
            file("a\\b.webp"),
            file("a//b.webp"),
            file("a?x=1.webp"),
            file("ok.webp", -1),
            file("ok.webp", 1.5),
            file("ok.webp", 10, "xyz"),
            file("good.webp", 10),
          ],
        },
      ],
    });
    expect(m.packs.map((p) => p.id)).toEqual(["dup", "f"]);
    expect(m.packs[0].kind).toBe("core");
    expect(m.packs[1].files.map((f) => f.path)).toEqual(["good.webp"]);
  });

  it("URL tệp gắn băm ngắn để bản mới tự thay; băm viết hoa được đưa về chữ thường", () => {
    const sha = "ABCDEF0123456789".padEnd(64, "0");
    const [pack] = sanitizeManifest({
      packs: [{ id: "map:x", kind: "map", files: [file("map/a.webp", 1, sha)] }],
    }).packs;
    expect(packFileUrl(pack.files[0])).toBe("/packs/map/a.webp?v=abcdef012345");
  });
});

describe("gfx/packs: ensure", () => {
  it("tải đủ các tệp rồi báo loaded, lần sau là cached và không fetch lại", async () => {
    const { env, log } = fake();
    const p = createPacks(env);
    expect(p.state("map:lac_ha")).toBe("idle");
    expect(await p.ensure("map:lac_ha")).toBe("loaded");
    expect(p.state("map:lac_ha")).toBe("ready");
    expect(log.bytes).toHaveLength(1);
    expect(await p.ensure("map:lac_ha")).toBe("cached");
    expect(log.bytes).toHaveLength(1);
  });

  it("gọi đồng thời cùng một gói chỉ tải MỘT lần và manifest chỉ tải một lần", async () => {
    const { env, log } = fake();
    const p = createPacks(env);
    const rs = await Promise.all([
      p.ensure("map:lac_ha"),
      p.ensure("map:lac_ha"),
      p.ensure("map:hac_phong"),
    ]);
    expect(rs).toEqual(["loaded", "loaded", "loaded"]);
    expect(log.bytes).toHaveLength(2);
    expect(log.text).toBe(1);
  });

  it("tệp đã nằm trong bộ nhớ đệm thì không fetch và báo cached", async () => {
    const { env, log } = fake({ cached: () => true });
    const p = createPacks(env);
    expect(await p.ensure("map:lac_ha")).toBe("cached");
    expect(log.bytes).toHaveLength(0);
    expect(p.state("map:lac_ha")).toBe("ready");
  });

  it("chỉ MỘT tệp chưa có trong bộ nhớ đệm cũng phải tải cả gói", async () => {
    const { env, log } = fake({ cached: (u) => !u.includes("b.webp") });
    const p = createPacks(env);
    expect(await p.ensure("map:hac_phong")).toBe("loaded");
    expect(log.bytes).toHaveLength(1);
  });

  it("báo tiến độ theo byte sau mỗi tệp", async () => {
    const m = manifestText({
      id: "map:x",
      kind: "map",
      files: [file("x/1.webp", 100), file("x/2.webp", 300)],
    });
    const { env } = fake({ manifest: m });
    env.fetchBytes = async (url) => (url.includes("1.webp") ? 100 : 300);
    const seen: [number, number][] = [];
    await createPacks(env).ensure("map:x", { onProgress: (a, b) => seen.push([a, b]) });
    expect(seen).toEqual([
      [100, 400],
      [400, 400],
    ]);
  });

  it("sai dung lượng tệp thì coi là lỗi (không đánh dấu ready)", async () => {
    const { env } = fake();
    env.fetchBytes = async () => 7;
    const p = createPacks(env);
    expect(await p.ensure("map:lac_ha")).toBe("failed");
    expect(p.state("map:lac_ha")).toBe("failed");
  });

  it("id không có trong manifest: failed + cảnh báo đúng MỘT lần", async () => {
    const { env, log } = fake();
    const p = createPacks(env);
    expect(await p.ensure("map:khong_co")).toBe("failed");
    expect(await p.ensure("map:khong_co")).toBe("failed");
    expect(log.warns.filter((w) => w.includes("map:khong_co"))).toHaveLength(1);
  });

  it("KHÔNG BAO GIỜ ném lỗi: fetch lỗi / manifest ném lỗi / người nghe ném lỗi", async () => {
    const a = fake({ failFetch: () => true });
    expect(await createPacks(a.env).ensure("map:lac_ha")).toBe("failed");
    const b = fake();
    b.env.fetchText = async () => {
      throw new Error("mất mạng");
    };
    expect(await createPacks(b.env).ensure("map:lac_ha")).toBe("skipped");
    const c = fake();
    const p = createPacks(c.env);
    p.onReady(() => {
      throw new Error("người nghe hỏng");
    });
    const ok = vi.fn();
    p.onReady(ok);
    expect(await p.ensure("map:lac_ha")).toBe("loaded");
    expect(ok).toHaveBeenCalledWith("map:lac_ha"); // người nghe sau vẫn được gọi
  });

  it("manifest 404 / trả HTML (SPA fallback) / rỗng: mọi gói là skipped, không fetch thêm, không cảnh báo", async () => {
    for (const manifest of [null, "<!doctype html><html></html>", "", "{}", manifestText()]) {
      const { env, log } = fake({ manifest });
      const p = createPacks(env);
      expect(await p.ensure("map:lac_ha")).toBe("skipped");
      expect(await p.ensure("core")).toBe("skipped");
      expect(log.bytes).toHaveLength(0);
      expect(log.warns).toHaveLength(0);
      expect(log.text).toBe(1);
    }
  });

  it("onReady báo cho mỗi gói xong và hàm huỷ đăng ký có tác dụng", async () => {
    const { env } = fake();
    const p = createPacks(env);
    const cb = vi.fn();
    const off = p.onReady(cb);
    await p.ensure("map:lac_ha");
    off();
    await p.ensure("map:hac_phong");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("map:lac_ha");
  });
});

describe("gfx/packs: hết giờ không huỷ tải", () => {
  afterEach(() => vi.useRealTimers());

  it("quá timeoutMs người gọi nhận failed nhưng việc tải vẫn chạy; về muộn thì onReady báo và lần sau là cached", async () => {
    vi.useFakeTimers();
    const { env, gate } = fake();
    gate.hold = true;
    const p = createPacks(env);
    const ready = vi.fn();
    p.onReady(ready);
    const r = p.ensure("map:lac_ha", { timeoutMs: 8000 });
    await vi.advanceTimersByTimeAsync(7999);
    expect(p.state("map:lac_ha")).toBe("loading");
    await vi.advanceTimersByTimeAsync(2);
    expect(await r).toBe("failed");
    expect(p.state("map:lac_ha")).toBe("loading"); // VẪN đang tải
    expect(ready).not.toHaveBeenCalled();
    gate.hold = false;
    gate.release.forEach((f) => f());
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toHaveBeenCalledWith("map:lac_ha");
    expect(p.state("map:lac_ha")).toBe("ready");
    expect(await p.ensure("map:lac_ha")).toBe("cached");
  });

  it("tải xong trước hạn thì không để hẹn giờ treo lại", async () => {
    vi.useFakeTimers();
    const { env } = fake();
    const p = createPacks(env);
    const r = p.ensure("map:lac_ha", { timeoutMs: 8000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(await r).toBe("loaded");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("signal của người gọi: bỏ chờ nhưng không huỷ việc tải chung", async () => {
    const { env, gate } = fake();
    gate.hold = true;
    const p = createPacks(env);
    const ac = new AbortController();
    const r = p.ensure("map:lac_ha", { signal: ac.signal });
    await Promise.resolve();
    ac.abort();
    expect(await r).toBe("failed");
    expect(p.state("map:lac_ha")).toBe("loading");
    expect(await p.ensure("map:lac_ha", { signal: AbortSignal.abort() })).toBe("failed"); // đã huỷ sẵn
  });
});

describe("gfx/packs: thử lại có giới hạn", () => {
  it("lỗi thì lần gọi sau thử lại, tối đa MAX_ATTEMPTS lần tải rồi dừng hẳn", async () => {
    const { env, log } = fake({ failFetch: () => true });
    const p = createPacks(env);
    for (let i = 0; i < MAX_ATTEMPTS + 3; i++) expect(await p.ensure("map:lac_ha")).toBe("failed");
    expect(log.bytes).toHaveLength(MAX_ATTEMPTS);
    expect(p.state("map:lac_ha")).toBe("failed");
  });

  it("lần thử lại thành công thì ready", async () => {
    const { env } = fake({ failFetch: (_u, call) => call <= 1 });
    const p = createPacks(env);
    expect(await p.ensure("map:lac_ha")).toBe("failed");
    expect(await p.ensure("map:lac_ha")).toBe("loaded");
    expect(p.state("map:lac_ha")).toBe("ready");
  });

  it("cảnh báo mỗi lần lỗi một dòng (không lặp khi đã dừng)", async () => {
    const { env, log } = fake({ failFetch: () => true });
    const p = createPacks(env);
    for (let i = 0; i < MAX_ATTEMPTS + 3; i++) await p.ensure("map:lac_ha");
    expect(log.warns).toHaveLength(MAX_ATTEMPTS);
  });
});

describe("gfx/packs: bản native (APK)", () => {
  it("trả cached ngay, không fetch gì kể cả manifest; hd:* bị loại", async () => {
    const { env, log } = fake({ native: true });
    const p = createPacks(env);
    expect(await p.ensure("map:lac_ha")).toBe("cached");
    expect(await p.ensure("core")).toBe("cached");
    expect(await p.ensure("hd:lac_ha")).toBe("skipped");
    expect(log.text).toBe(0);
    expect(log.bytes).toHaveLength(0);
  });

  it("native không tải trước dù mạng 4g", () => {
    const { env, log } = fake({ native: true, conn: "4g" });
    const p = createPacks(env);
    p.prefetch("map:lac_ha");
    p.prefetchNeighbors(["lac_ha", "hac_phong"]);
    expect(log.idle).toHaveLength(0);
  });
});

describe("gfx/packs: hd:*", () => {
  it("chỉ nạp khi môi trường cho phép (Rất cao ổn định), không thì skipped và không fetch", async () => {
    const { env, log, flags } = fake({ hd: false });
    const p = createPacks(env);
    expect(await p.ensure("hd:lac_ha")).toBe("skipped");
    expect(log.bytes).toHaveLength(0);
    flags.hd = true;
    expect(await p.ensure("hd:lac_ha")).toBe("loaded");
  });

  it("releaseKind('hd') giải phóng mọi gói hd, báo onRelease và lần sau tải lại; gói map không bị đụng", async () => {
    const { env, log } = fake();
    const p = createPacks(env);
    await p.ensure("map:lac_ha");
    await p.ensure("hd:lac_ha");
    const rel = vi.fn();
    p.onRelease(rel);
    p.releaseKind("hd");
    expect(rel).toHaveBeenCalledTimes(1);
    expect(rel).toHaveBeenCalledWith("hd:lac_ha");
    expect(p.state("hd:lac_ha")).toBe("idle");
    expect(p.state("map:lac_ha")).toBe("ready");
    const before = log.bytes.length;
    expect(await p.ensure("hd:lac_ha")).toBe("loaded");
    expect(log.bytes.length).toBe(before + 1);
  });

  it("release gói đang tải: huỷ việc tải, về idle; ensure ngay sau đó bắt đầu việc tải MỚI", async () => {
    const { env, gate, log } = fake();
    gate.hold = true;
    const p = createPacks(env);
    const first = p.ensure("map:lac_ha");
    await vi.waitFor(() => expect(p.state("map:lac_ha")).toBe("loading"));
    p.release("map:lac_ha");
    expect(p.state("map:lac_ha")).toBe("idle");
    gate.hold = false;
    const second = p.ensure("map:lac_ha");
    expect(await first).toBe("failed");
    expect(await second).toBe("loaded");
    expect(p.state("map:lac_ha")).toBe("ready");
    expect(log.bytes).toHaveLength(2);
  });

  it("release gói idle hoặc không có thì không làm gì (không báo onRelease)", async () => {
    const { env } = fake();
    const p = createPacks(env);
    const rel = vi.fn();
    p.onRelease(rel);
    p.release("map:lac_ha");
    p.releaseKind("hd");
    await p.ensure("map:lac_ha");
    p.release("khong_co");
    expect(rel).not.toHaveBeenCalled();
  });
});

describe("gfx/packs: tải trước", () => {
  it("prefetch xếp vào lúc rảnh, ưu tiên thấp, mỗi gói đúng một lần", async () => {
    const { env, log } = fake({ conn: "4g" });
    const p = createPacks(env);
    p.prefetch("map:lac_ha");
    p.prefetch("map:lac_ha");
    expect(log.idle).toHaveLength(1);
    expect(log.bytes).toHaveLength(0); // chưa tới lúc rảnh
    log.idle[0]();
    await vi.waitFor(() => expect(p.state("map:lac_ha")).toBe("ready"));
    expect(log.low).toEqual([true]);
  });

  it("bỏ qua khi tiết kiệm dữ liệu hoặc mạng chậm (2g / slow-2g)", () => {
    for (const o of [{ saveData: true }, { conn: "2g" }, { conn: "slow-2g" }] as FakeOpts[]) {
      const { env, log } = fake(o);
      createPacks(env).prefetch("map:lac_ha");
      expect(log.idle).toHaveLength(0);
    }
  });

  it("prefetchNeighbors chỉ khi 4g (3g / không rõ thì không), tối đa NEIGHBOR_PREFETCH_MAX bản đồ", () => {
    for (const conn of ["3g", undefined]) {
      const { env, log } = fake({ conn });
      createPacks(env).prefetchNeighbors(["a", "b"]);
      expect(log.idle).toHaveLength(0);
    }
    const { env, log } = fake({ conn: "4g" });
    createPacks(env).prefetchNeighbors(["a", "b", "c", "d"]);
    expect(log.idle).toHaveLength(NEIGHBOR_PREFETCH_MAX);
  });

  it("prefetchNeighbors không đè ngoài tiết kiệm dữ liệu dù 4g", () => {
    const { env, log } = fake({ conn: "4g", saveData: true });
    createPacks(env).prefetchNeighbors(["a"]);
    expect(log.idle).toHaveLength(0);
  });
});

describe("gfx/packs: tiện ích", () => {
  it("mapPackId và thời gian chờ theo loại bản đồ", () => {
    expect(mapPackId("lac_ha")).toBe("map:lac_ha");
    expect(MAP_PACK_TIMEOUT_MS).toBe(8000);
    expect(DUNGEON_PACK_TIMEOUT_MS).toBe(3000);
    expect(mapPackTimeoutMs(false)).toBe(8000);
    expect(mapPackTimeoutMs(true)).toBe(3000);
  });

  it("chưa initPacks thì packs() là bản rỗng: ensure trả skipped, mọi thứ không làm gì", async () => {
    const p = packs();
    expect(await p.ensure("map:lac_ha")).toBe("skipped");
    expect(p.state("map:lac_ha")).toBe("idle");
    expect(() => {
      p.release("x");
      p.releaseKind("hd");
      p.prefetch("x");
      p.prefetchNeighbors(["a"]);
      p.onReady(() => undefined)();
      p.onRelease(() => undefined)();
    }).not.toThrow();
  });
});

describe("gfx/packs: bổ sung", () => {
  it("release gói đang ở trạng thái lỗi trả lại đủ số lần thử", async () => {
    const o = { fail: true };
    const { env, log } = fake({ failFetch: () => o.fail });
    const p = createPacks(env);
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await p.ensure("map:lac_ha");
    expect(log.bytes).toHaveLength(MAX_ATTEMPTS);
    p.release("map:lac_ha");
    expect(p.state("map:lac_ha")).toBe("idle");
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await p.ensure("map:lac_ha");
    expect(log.bytes).toHaveLength(MAX_ATTEMPTS * 2);
    o.fail = false;
    p.release("map:lac_ha");
    expect(await p.ensure("map:lac_ha")).toBe("loaded");
  });

  it("gói không có tệp nào vẫn xong bình thường (ready, rồi cached), onReady báo một lần", async () => {
    const { env, log } = fake({ manifest: manifestText({ id: "core", kind: "core", files: [] }) });
    const p = createPacks(env);
    const cb = vi.fn();
    p.onReady(cb);
    expect(await p.ensure("core")).toBe("loaded");
    expect(await p.ensure("core")).toBe("cached");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(log.bytes).toHaveLength(0);
  });
});

describe("gfx/packs: đua giữa tải cũ bị huỷ và tải mới", () => {
  /** Môi trường mà fetch KHÔNG nhìn signal: việc tải cũ chỉ xong khi ta cho phép (giống trình duyệt đã nhận hết thân). */
  function manual() {
    const calls: { url: string; done: () => void }[] = [];
    const { env } = fake();
    env.fetchBytes = (url) =>
      new Promise<number>((resolve) => calls.push({ url, done: () => resolve(100) }));
    return { env, calls };
  }
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  it("tải cũ xong SAU khi đã release + ensure lại thì không phá việc tải mới và không báo ready giả", async () => {
    const { env, calls } = manual();
    const p = createPacks(env);
    const ready = vi.fn();
    p.onReady(ready);
    const first = p.ensure("map:lac_ha");
    await flush();
    expect(calls).toHaveLength(1);
    p.release("map:lac_ha");
    const second = p.ensure("map:lac_ha");
    await flush();
    expect(calls).toHaveLength(2);
    calls[0].done(); // việc tải cũ về muộn
    await flush();
    expect(await first).toBe("failed");
    expect(p.state("map:lac_ha")).toBe("loading"); // KHÔNG bị tải cũ đánh dấu ready
    expect(ready).not.toHaveBeenCalled();
    const third = p.ensure("map:lac_ha"); // phải nối vào việc tải mới, không mở lần thứ ba
    await flush();
    expect(calls).toHaveLength(2);
    calls[1].done();
    expect(await second).toBe("loaded");
    expect(await third).toBe("loaded");
    expect(ready).toHaveBeenCalledTimes(1);
  });
});

describe("gfx/packs: tuỳ chọn của người gọi", () => {
  afterEach(() => vi.useRealTimers());

  it("timeoutMs âm hoặc NaN bị bỏ qua (chờ tới khi xong), không hết giờ ngay", async () => {
    for (const timeoutMs of [-1, Number.NaN]) {
      const { env } = fake();
      // tải mất một nhịp macrotask thật: hẹn giờ 0 ms (nếu có) sẽ thắng
      env.fetchBytes = () => new Promise<number>((r) => setTimeout(() => r(100), 20));
      expect(await createPacks(env).ensure("map:lac_ha", { timeoutMs })).toBe("loaded");
    }
  });

  it("gỡ người nghe 'abort' khỏi signal khi xong (không rò rỉ)", async () => {
    const { env } = fake();
    const ac = new AbortController();
    const rm = vi.spyOn(ac.signal, "removeEventListener");
    expect(await createPacks(env).ensure("map:lac_ha", { signal: ac.signal })).toBe("loaded");
    expect(rm).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("người gọi đã hết giờ thì KHÔNG nhận thêm tiến độ khi việc tải vẫn chạy", async () => {
    vi.useFakeTimers();
    const m = manifestText({
      id: "map:x",
      kind: "map",
      files: [file("x/1.webp", 100), file("x/2.webp", 100)],
    });
    const { env } = fake({ manifest: m });
    let second: (() => void) | undefined;
    env.fetchBytes = (url) =>
      url.includes("1.webp")
        ? Promise.resolve(100)
        : new Promise<number>((r) => (second = () => r(100)));
    const seen: number[] = [];
    const p = createPacks(env);
    const r = p.ensure("map:x", { timeoutMs: 50, onProgress: (a) => seen.push(a) });
    await vi.advanceTimersByTimeAsync(60);
    expect(await r).toBe("failed");
    expect(seen).toEqual([100]);
    second?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.state("map:x")).toBe("ready");
    expect(seen).toEqual([100]); // tệp thứ hai về sau khi đã bỏ chờ: không gọi lại người đã đi
  });
});

describe("gfx/packs: chờ gói lúc qua cổng", () => {
  afterEach(() => vi.useRealTimers());
  const DUNGEON_ID = DUNGEON_MAPS[0].id;

  it("takeMapWait lấy lại đúng lời hứa của startMapWait (không tải lần hai)", async () => {
    const { env, log } = fake();
    const p = createPacks(env);
    p.startMapWait("lac_ha");
    expect(await p.takeMapWait("lac_ha")).toBe("loaded");
    expect(log.bytes).toHaveLength(1);
    expect(p.state("map:lac_ha")).toBe("ready");
  });

  it("giờ chờ tính từ lúc BẮT ĐẦU (gửi travel), không phải lúc take: 8 s cho bản đồ thường", async () => {
    vi.useFakeTimers();
    const { env, gate } = fake();
    gate.hold = true;
    const p = createPacks(env);
    p.startMapWait("lac_ha");
    await vi.advanceTimersByTimeAsync(7000); // màn chuyển cảnh + vào phòng đã ngốn 7 s
    let done: string | undefined;
    void p.takeMapWait("lac_ha").then((r) => (done = r));
    await vi.advanceTimersByTimeAsync(900);
    expect(done).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200); // tổng 8,1 s kể từ lúc gửi
    expect(done).toBe("failed");
    expect(p.state("map:lac_ha")).toBe("loading"); // quá giờ KHÔNG huỷ tải
  });

  it("takeMapWait không có startMapWait (travelTo tới từ nơi khác): bắt đầu ngay, vẫn bị chặn 8 s", async () => {
    vi.useFakeTimers();
    const { env, gate } = fake();
    gate.hold = true;
    const p = createPacks(env);
    let done: string | undefined;
    void p.takeMapWait("lac_ha").then((r) => (done = r));
    await vi.advanceTimersByTimeAsync(7999);
    expect(done).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe("failed");
  });

  it("lời hứa quá cũ (cổng bị từ chối, không có travelTo) bị bỏ: take sau MAP_WAIT_TTL_MS bắt đầu lại", async () => {
    vi.useFakeTimers();
    const { env, log } = fake({ failFetch: (_u, call) => call === 1 });
    const p = createPacks(env);
    p.startMapWait("lac_ha"); // tải lần một lỗi
    await vi.advanceTimersByTimeAsync(MAP_WAIT_TTL_MS + 1);
    expect(await p.takeMapWait("lac_ha")).toBe("loaded"); // lần hai (thử lại), không dùng lời hứa cũ "failed"
    expect(log.bytes).toHaveLength(2);
  });

  it("takeMapWait chỉ dùng được một lần mỗi startMapWait", async () => {
    const { env } = fake();
    const p = createPacks(env);
    p.startMapWait("lac_ha");
    await p.takeMapWait("lac_ha");
    expect(await p.takeMapWait("lac_ha")).toBe("cached");
  });

  it("manifest rỗng / bản native: takeMapWait trả skipped / cached ngay, không treo", async () => {
    const a = createPacks(fake({ manifest: null }).env);
    a.startMapWait("lac_ha");
    expect(await a.takeMapWait("lac_ha")).toBe("skipped");
    const b = createPacks(fake({ native: true }).env);
    expect(await b.takeMapWait("lac_ha")).toBe("cached");
  });

  it("bí cảnh chỉ chờ 3 s", async () => {
    vi.useFakeTimers();
    const { env, gate } = fake({
      manifest: manifestText({
        id: `map:${DUNGEON_ID}`,
        kind: "map",
        files: [file("d/1.webp", 100)],
      }),
    });
    gate.hold = true;
    const p = createPacks(env);
    let done: string | undefined;
    void p.takeMapWait(DUNGEON_ID).then((r) => (done = r));
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe("failed");
  });
});

describe("gfx/packs: chọn bản đồ để tải trước", () => {
  const portals = [
    { x: 0, y: 0, toMap: "hac_phong" },
    { x: 5000, y: 0, toMap: "lac_ha" },
    { x: 100, y: 0, toMap: "hac_phong" },
    { x: 0, y: 100, toMap: DUNGEON_MAPS[0].id },
  ];

  it("neighborMapIds: không trùng, bỏ bản đồ hiện tại, theo thứ tự cổng", () => {
    expect(neighborMapIds(portals, "lac_ha")).toEqual(["hac_phong"]); // bí cảnh không tải trước
    expect(neighborMapIds(portals, "hac_phong")).toEqual(["lac_ha"]);
    expect(neighborMapIds([], "lac_ha")).toEqual([]);
  });

  it("mapsNearPortals: chỉ cổng trong PORTAL_PREFETCH_PX, tính đúng cả biên", () => {
    expect(mapsNearPortals(portals, 0, 0)).toEqual(["hac_phong"]);
    expect(mapsNearPortals(portals, 5000 - PORTAL_PREFETCH_PX, 0)).toContain("lac_ha");
    expect(mapsNearPortals(portals, 5000 - PORTAL_PREFETCH_PX - 1, 0)).not.toContain("lac_ha");
    expect(mapsNearPortals(portals, 0, PORTAL_PREFETCH_PX)).toContain("hac_phong");
    expect(mapsNearPortals(portals, 0, PORTAL_PREFETCH_PX + 1)).not.toContain("hac_phong");
    // chéo: (900, 900) cách (0,0) ~1273 > 1200 nhưng cổng (100,0) cách ~ 806 < 1200
    expect(mapsNearPortals([{ x: 0, y: 0, toMap: "a" }], 900, 900)).toEqual([]);
  });

  it("prefetch: sau khi giải phóng gói thì lần lại gần sau được tải trước lại", async () => {
    const { env, log } = fake({ conn: "4g" });
    const p = createPacks(env);
    p.prefetch("map:lac_ha");
    log.idle.shift()!();
    await vi.waitFor(() => expect(p.state("map:lac_ha")).toBe("ready"));
    p.prefetch("map:lac_ha"); // đã tải trước: không xếp lại
    expect(log.idle).toHaveLength(0);
    p.release("map:lac_ha");
    p.prefetch("map:lac_ha");
    expect(log.idle).toHaveLength(1);
  });
});

describe("gfx/packs: thời gian chờ ở màn chuyển cảnh khớp ngân sách perf-budget.json (M7.15, #516)", () => {
  const budget = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../perf-budget.json"), "utf-8"),
  );

  it("MAP_PACK_TIMEOUT_MS / DUNGEON_PACK_TIMEOUT_MS bằng `packs.mapLoadTimeoutMs` / `dungeonLoadTimeoutMs` (sửa một nơi thì phải sửa nơi kia)", () => {
    expect(MAP_PACK_TIMEOUT_MS).toBe(budget.packs.mapLoadTimeoutMs);
    expect(DUNGEON_PACK_TIMEOUT_MS).toBe(budget.packs.dungeonLoadTimeoutMs);
  });

  it("`mapPackTimeoutMs` chọn đúng số theo loại bản đồ; bí cảnh chờ ngắn hơn bản đồ thường", () => {
    expect(mapPackTimeoutMs(false)).toBe(budget.packs.mapLoadTimeoutMs);
    expect(mapPackTimeoutMs(true)).toBe(budget.packs.dungeonLoadTimeoutMs);
    expect(budget.packs.dungeonLoadTimeoutMs).toBeLessThan(budget.packs.mapLoadTimeoutMs);
  });
});
