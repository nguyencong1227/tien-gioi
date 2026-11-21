import { describe, it, expect } from "vitest";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swPath = path.resolve(__dirname, "../public/sw.js");

/** Dựng `sw.js` trong một vm với Cache / fetch giả; `run(đường dẫn, đã có trong cache?)` mô phỏng một sự kiện `fetch`. */
async function harness() {
  const src = fs.readFileSync(swPath, "utf8");
  const handlers: Record<string, (event: any) => void> = {};
  const store = new Map<string, string>(); // url -> body
  const calls: string[] = [];

  const mkRes = (body: string, status = 200) => ({
    status,
    type: "basic",
    body,
    clone() {
      return this;
    },
  });

  const cache = {
    async match(req: any) {
      const k = typeof req === "string" ? req : req.url;
      return store.has(k) ? mkRes(store.get(k)!) : undefined;
    },
    async put(req: any, res: any) {
      const k = typeof req === "string" ? req : req.url;
      store.set(k, res.body);
      calls.push("put " + k);
    },
    async addAll() {},
  };

  const ctx = {
    self: {
      addEventListener: (t: string, f: any) => (handlers[t] = f),
      location: { origin: "https://x.test" },
      registration: {},
      skipWaiting() {},
      clients: { claim() {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => {},
      match: async (r: any) => cache.match(r),
    },
    fetch: async (req: any) => {
      calls.push("fetch " + req.url);
      return mkRes("NET:" + req.url);
    },
    URL,
    console,
  };

  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  expect(typeof handlers.fetch).toBe("function");

  async function run(urlPath: string, preCached: boolean) {
    calls.length = 0;
    store.clear();
    const url = "https://x.test" + urlPath;
    if (preCached) store.set(url, "CACHED:" + url);

    let resp: any = null;
    const event = {
      request: {
        method: "GET",
        url,
        mode: "no-cors",
        headers: { get: () => null },
      },
      respondWith: (p: any) => (resp = p),
    };

    handlers.fetch(event);
    const r = resp ? await resp : null;
    return { handled: resp !== null, body: r?.body, calls: [...calls] };
  }

  return { handlers, run };
}

describe("M7.15: sw-routing (Kiểm thử định tuyến Service Worker cho gói tải và bundle)", () => {
  it("sw.js: phân định chính xác cache-first và network-first cho 9 trường hợp URL", async () => {
    const { handlers, run } = await harness();
    expect(typeof handlers.fetch).toBe("function");

    const V = "0123456789ab";

    // 1. Tệp trong packs có ?v= đã có trong cache -> cache-first: trả cache, KHÔNG fetch mạng
    const r1 = await run("/packs/core/a.png?v=" + V, true);
    expect(r1.handled).toBe(true);
    expect(r1.body).toBe("CACHED:https://x.test/packs/core/a.png?v=" + V);
    expect(r1.calls).toHaveLength(0); // Không gọi fetch mạng

    // 2. Tệp trong packs có ?v= chưa có trong cache -> cache-first: fetch mạng rồi put vào cache
    const r2 = await run("/packs/core/a.png?v=" + V, false);
    expect(r2.handled).toBe(true);
    expect(r2.body).toBe("NET:https://x.test/packs/core/a.png?v=" + V);
    expect(r2.calls).toContain("fetch https://x.test/packs/core/a.png?v=" + V);
    expect(r2.calls).toContain("put https://x.test/packs/core/a.png?v=" + V);

    // 3. Tệp trong packs KHÔNG có ?v= -> network-first (fetch mạng dù đã có trong cache)
    const r3 = await run("/packs/core/a.png", true);
    expect(r3.handled).toBe(true);
    expect(r3.body).toBe("NET:https://x.test/packs/core/a.png");
    expect(r3.calls).toContain("fetch https://x.test/packs/core/a.png");

    // 4. Tệp trong packs có ?v= sai độ dài -> network-first
    const r4 = await run("/packs/core/a.png?v=short", true);
    expect(r4.handled).toBe(true);
    expect(r4.body).toBe("NET:https://x.test/packs/core/a.png?v=short");
    expect(r4.calls).toContain("fetch https://x.test/packs/core/a.png?v=short");

    // 5. /packs/manifest.json dù có ?v= hay không -> luôn network-first
    const r5 = await run("/packs/manifest.json?v=" + V, true);
    expect(r5.handled).toBe(true);
    expect(r5.body).toBe("NET:https://x.test/packs/manifest.json?v=" + V);
    expect(r5.calls).toContain("fetch https://x.test/packs/manifest.json?v=" + V);

    // 6. /packs/manifest.json thông thường -> network-first
    const r6 = await run("/packs/manifest.json", true);
    expect(r6.handled).toBe(true);
    expect(r6.body).toBe("NET:https://x.test/packs/manifest.json");

    // 7. Bundle JS có hash của Vite -> cache-first (giữ nguyên hoạt động cũ)
    const r7 = await run("/assets/index-abcdefgh12.js", true);
    expect(r7.handled).toBe(true);
    expect(r7.body).toBe("CACHED:https://x.test/assets/index-abcdefgh12.js");
    expect(r7.calls).toHaveLength(0);

    // 8. Tệp âm thanh .ogg có ?v= -> cache-first (fetch + put)
    const r8 = await run("/packs/audio/b.ogg?v=" + V, false);
    expect(r8.handled).toBe(true);
    expect(r8.body).toBe("NET:https://x.test/packs/audio/b.ogg?v=" + V);
    expect(r8.calls).toContain("put https://x.test/packs/audio/b.ogg?v=" + V);

    // 9. Tệp âm thanh .ogg không có ?v= -> network-first
    const r9 = await run("/packs/audio/b.ogg", false);
    expect(r9.handled).toBe(true);
    expect(r9.body).toBe("NET:https://x.test/packs/audio/b.ogg");
  });
  it("mục 63: gói tài nguyên RIÊNG /assets-private/ cùng luật gói tải: ?v= đúng 12 hex -> cache-first; không / sai ?v= và manifest -> network-first", async () => {
    const { run } = await harness();
    const V = "0123456789ab";
    const U = "https://x.test";

    // 1. tệp gói riêng có ?v= 12 hex ĐÃ có trong cache -> cache-first, KHÔNG fetch
    const r1 = await run("/assets-private/cainos/atlas.png?v=" + V, true);
    expect(r1.handled).toBe(true);
    expect(r1.body).toBe(`CACHED:${U}/assets-private/cainos/atlas.png?v=${V}`);
    expect(r1.calls).toHaveLength(0);

    // 2. chưa có trong cache -> fetch mạng rồi put (200 cùng nguồn)
    const r2 = await run("/assets-private/cainos/atlas.png?v=" + V, false);
    expect(r2.body).toBe(`NET:${U}/assets-private/cainos/atlas.png?v=${V}`);
    expect(r2.calls).toContain(`put ${U}/assets-private/cainos/atlas.png?v=${V}`);

    // 3. KHÔNG có ?v= -> network-first (fetch mạng dù đã có trong cache)
    const r3 = await run("/assets-private/cainos/atlas.png", true);
    expect(r3.body).toBe(`NET:${U}/assets-private/cainos/atlas.png`);

    // 4. ?v= 8 hex (độ dài của bản hợp đồng đầu #1262) hoặc sai dạng -> KHÔNG cache-first: phải 12 hex như /packs/
    for (const bad of ["01234567", "short", "0123456789abc", "0123456789ag"]) {
      const r = await run("/assets-private/cainos/atlas.png?v=" + bad, true);
      expect(r.body, bad).toBe(`NET:${U}/assets-private/cainos/atlas.png?v=${bad}`);
    }

    // 5. manifest không bao giờ cache-first, dù gắn ?v= 12 hex hay không
    for (const q of ["", "?v=" + V]) {
      const r = await run("/assets-private/manifest.json" + q, true);
      expect(r.body, q).toBe(`NET:${U}/assets-private/manifest.json${q}`);
    }

    // 6. .jpg (có trong danh sách trắng của hợp đồng nhưng KHÔNG nằm trong danh sách đuôi của isStaticAsset) vẫn đi đường của gói riêng nhờ tiền tố
    const r6 = await run("/assets-private/cainos/bg.jpg?v=" + V, true);
    expect(r6.handled).toBe(true);
    expect(r6.body).toBe(`CACHED:${U}/assets-private/cainos/bg.jpg?v=${V}`);
    expect(r6.calls).toHaveLength(0);

    // 7. tiền tố gần giống (thiếu dấu gạch cuối) KHÔNG được coi là gói riêng: network-first dù có ?v= 12 hex
    const r7 = await run("/assets-privatex/atlas.png?v=" + V, true);
    expect(r7.body).toBe(`NET:${U}/assets-privatex/atlas.png?v=${V}`);

    // 8. gói tải thường (/packs/) giữ nguyên luật cũ
    const r8 = await run("/packs/core/a.png?v=" + V, true);
    expect(r8.body).toBe(`CACHED:${U}/packs/core/a.png?v=${V}`);
  });
});
