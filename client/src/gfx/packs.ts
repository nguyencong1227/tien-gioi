/**
 * Bộ nạp gói tải theo nhu cầu (M7.15, #516; `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 10.1-10.2, QUYET_DINH_M3 mục 21).
 *
 * Tài sản chia thành GÓI (`core`, `map:<mapId>`, `icons`, `audio`, `hd:*`) mô tả ở `client/public/packs/manifest.json` (C sinh bằng
 * `build-packs.mjs`). Gói chỉ BỔ SUNG: trò chơi vẽ gần hết bằng mã nên thiếu gói (chưa tải xong, mạng lỗi, chưa có tài sản) thì VẪN chạy,
 * `ensurePack` KHÔNG BAO GIỜ ném lỗi và không bao giờ chặn vào game quá thời gian chờ.
 *
 * - **Idempotent:** gọi nhiều lần / đồng thời cùng một gói chỉ tải MỘT lần; gói đã sẵn sàng trả `cached`.
 * - **Hết giờ KHÔNG huỷ tải:** quá `timeoutMs` thì người gọi nhận `failed` (đi tiếp), nhưng việc tải vẫn chạy; về muộn thì `onReady` báo để
 *   áp dụng (dựng lại hình bản đồ nếu người chơi còn ở đó) hoặc để dành cho lần sau.
 * - **Thử lại:** gói lỗi được thử lại ở các lần gọi sau, tối đa `MAX_ATTEMPTS` lần tải rồi dừng (không đập mạng).
 * - **Bản native (APK)** có sẵn `client/dist`: trả `cached` ngay, không `fetch`, và LOẠI `hd:*` (`skipped`).
 * - **`hd:*`** chỉ khi môi trường cho phép (`hdAllowed`: bậc Rất cao đã ổn định); hạ bậc thì `releaseKind("hd")`.
 * - Manifest rỗng / thiếu (chưa có tài sản nào vào repo, hoặc máy chủ trả `index.html` cho đường dẫn lạ) coi là KHÔNG có gói: mọi `ensure` trả `skipped`,
 *   không gọi mạng thêm và không ghi cảnh báo.
 *
 * Lớp THUẦN: mọi thứ phụ thuộc trình duyệt (`fetch`, Cache API, `navigator.connection`, `requestIdleCallback`) tiêm qua `PacksEnv` nên test được
 * bằng môi trường giả; `browserPacksEnv` ở cuối là bản thật.
 */

import { isDungeonMap } from "@tien-gioi/shared";

export type PackKind = "core" | "map" | "icons" | "audio" | "hd";
export type PackResult = "loaded" | "cached" | "failed" | "skipped";
export type PackState = "idle" | "loading" | "ready" | "failed";

export interface PackFile {
  /** Đường dẫn tương đối trong `/packs/` */
  path: string;
  bytes: number;
  sha256: string;
}

export interface PackDef {
  id: string;
  kind: PackKind;
  mapId?: string;
  files: PackFile[];
  /** Tổng `bytes` các tệp (tính lại khi làm sạch, không tin giá trị trong tệp) */
  bytes: number;
}

export interface PackManifest {
  packs: PackDef[];
}

/** Thời gian chờ gói ở màn chuyển cảnh (ms): khớp `client/perf-budget.json` `packs.mapLoadTimeoutMs` / `dungeonLoadTimeoutMs` (có test). */
export const MAP_PACK_TIMEOUT_MS = 8000;
export const DUNGEON_PACK_TIMEOUT_MS = 3000;
/** Số lần tải tối đa của một gói (lần đầu + thử lại ở các lần gọi sau). */
export const MAX_ATTEMPTS = 3;
/** Lại gần cổng trong bán kính này (px, ~7,5 giây đi bộ) thì tải trước gói bản đồ bên kia. */
export const PORTAL_PREFETCH_PX = 1200;
/** Số bản đồ kề tải trước lúc rảnh (khi mạng 4g, không tiết kiệm dữ liệu). */
export const NEIGHBOR_PREFETCH_MAX = 2;
/** Lời hứa chờ gói của `startMapWait` quá cũ chừng này (ms) thì bỏ (cổng bị từ chối, không có `travelTo`). */
export const MAP_WAIT_TTL_MS = 30_000;
/** `hd:*` chỉ nạp khi bậc Rất cao đã ổn định chừng này (ms). */
export const HD_STABLE_MS = 60_000;

const KINDS: ReadonlySet<string> = new Set(["core", "map", "icons", "audio", "hd"]);
const ID_RE = /^[a-z0-9_:.-]{1,64}$/i;
const SHA_RE = /^[0-9a-f]{64}$/i;
const MAX_PACKS = 64;
const MAX_FILES = 512;

export const mapPackId = (mapId: string): string => `map:${mapId}`;

function cleanPath(p: unknown): string | null {
  if (typeof p !== "string" || p.length === 0 || p.length > 200) return null;
  if (p.startsWith("/") || p.includes("\\") || p.includes("?") || p.includes("#")) return null;
  if (p.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) return null;
  return p;
}

/** Làm sạch manifest nhận từ mạng (không tin): chỉ giữ gói / tệp hợp lệ, không trùng id, tính lại `bytes`. Bất cứ thứ gì không phải manifest thì rỗng. */
export function sanitizeManifest(raw: unknown): PackManifest {
  const out: PackManifest = { packs: [] };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  const list = (raw as { packs?: unknown }).packs;
  if (!Array.isArray(list)) return out;
  const seen = new Set<string>();
  for (const p of list) {
    if (out.packs.length >= MAX_PACKS) break;
    if (p === null || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    if (typeof r.id !== "string" || !ID_RE.test(r.id) || seen.has(r.id)) continue;
    if (typeof r.kind !== "string" || !KINDS.has(r.kind)) continue;
    const files: PackFile[] = [];
    if (Array.isArray(r.files)) {
      for (const f of r.files.slice(0, MAX_FILES)) {
        if (f === null || typeof f !== "object") continue;
        const x = f as Record<string, unknown>;
        const path = cleanPath(x.path);
        if (
          path === null ||
          typeof x.sha256 !== "string" ||
          !SHA_RE.test(x.sha256) ||
          typeof x.bytes !== "number" ||
          !Number.isInteger(x.bytes) ||
          x.bytes < 0
        )
          continue;
        files.push({ path, bytes: x.bytes, sha256: x.sha256.toLowerCase() });
      }
    }
    seen.add(r.id);
    out.packs.push({
      id: r.id,
      kind: r.kind as PackKind,
      ...(typeof r.mapId === "string" && ID_RE.test(r.mapId) ? { mapId: r.mapId } : {}),
      files,
      bytes: files.reduce((a, f) => a + f.bytes, 0),
    });
  }
  return out;
}

/** URL của một tệp gói: gắn băm (`?v=`) để bản mới tự thay và Service Worker không tải hai lần (thiết kế mục 10.2). */
export function packFileUrl(f: PackFile): string {
  return `/packs/${f.path}?v=${f.sha256.slice(0, 12)}`;
}

/** Phần môi trường mà bộ nạp cần (tiêm vào để test không cần trình duyệt). */
export interface PacksEnv {
  /** Tải manifest: văn bản, hoặc `null` nếu không có (404, lỗi mạng). Không ném lỗi ra ngoài thì càng tốt, nhưng ném cũng được bắt. */
  fetchText(url: string): Promise<string | null>;
  /** Tải trọn một tệp (đọc hết thân để làm ấm bộ nhớ đệm), trả số byte; ném lỗi nếu không tải được. */
  fetchBytes(url: string, init: { signal: AbortSignal; lowPriority: boolean }): Promise<number>;
  /** Tệp đã nằm trong bộ nhớ đệm (Cache API / Service Worker)? Bỏ trống = coi là chưa. */
  isCached?(url: string): Promise<boolean>;
  /** Bản native (APK): mọi gói đã đóng sẵn trong ứng dụng. */
  native(): boolean;
  saveData(): boolean;
  /** `navigator.connection.effectiveType` (`slow-2g` | `2g` | `3g` | `4g`), không rõ thì `undefined`. */
  connection(): string | undefined;
  /** Được nạp `hd:*` không (bậc Rất cao đã ổn định)? */
  hdAllowed(): boolean;
  /** Chạy `cb` lúc rảnh (`requestIdleCallback`). */
  idle(cb: () => void): void;
  warn(msg: string): void;
}

export interface EnsureOptions {
  /** Hết giờ chờ (ms): người gọi nhận `failed` và đi tiếp, việc tải KHÔNG bị huỷ. Bỏ trống = chờ tới khi xong / lỗi. */
  timeoutMs?: number;
  /** Người gọi này bỏ chờ (không huỷ việc tải chung với người khác). */
  signal?: AbortSignal;
  /** `(đã tải, tổng)` theo byte, sau mỗi tệp. */
  onProgress?: (loaded: number, total: number) => void;
  /** Ưu tiên thấp (tải trước). */
  lowPriority?: boolean;
}

export interface PackController {
  ensure(id: string, opt?: EnsureOptions): Promise<PackResult>;
  state(id: string): PackState;
  /** Gói về xong (kể cả về MUỘN sau khi người gọi đã hết giờ). Trả hàm huỷ đăng ký. */
  onReady(cb: (id: string) => void): () => void;
  /** Gói bị giải phóng (đổi bản đồ, hạ khỏi Rất cao): nơi giữ texture của gói đó phải xoá. */
  onRelease(cb: (id: string) => void): () => void;
  /** Giải phóng gói: huỷ việc tải đang chạy, về `idle` (gọi `ensure` sau sẽ tải lại). */
  release(id: string): void;
  /** Giải phóng mọi gói thuộc một loại (vd `hd` khi hạ khỏi Rất cao). */
  releaseKind(kind: PackKind): void;
  /** Tải trước ưu tiên thấp lúc rảnh; bỏ qua khi tiết kiệm dữ liệu / mạng 2g / native; mỗi gói chỉ một lần. */
  prefetch(id: string): void;
  /**
   * Lúc GỬI `travel`: bắt đầu tải gói của bản đồ đích và bắt đầu tính giờ chờ (8 s, bí cảnh 3 s). Việc tải tiếp tục dù hết giờ.
   * Mỗi lần gọi thay lời hứa cũ của cùng bản đồ.
   */
  startMapWait(mapId: string): void;
  /**
   * Lúc nhận `travelTo`: lấy lời hứa đã bắt đầu ở `startMapWait` (còn mới, <= `MAP_WAIT_TTL_MS`); không có thì bắt đầu ngay bây giờ.
   * Luôn resolve (không bao giờ ném lỗi, quá giờ là `failed`), nên `Promise.all` với việc vào phòng không làm hỏng việc vào phòng.
   */
  takeMapWait(mapId: string): Promise<PackResult>;
  /** Lúc rảnh sau khi vào thế giới: tải trước gói của các bản đồ KỀ (tối đa `NEIGHBOR_PREFETCH_MAX`), chỉ khi mạng 4g và không tiết kiệm dữ liệu. */
  prefetchNeighbors(neighborMapIds: readonly string[]): void;
}

interface Entry {
  def: PackDef;
  state: PackState;
  attempts: number;
  promise: Promise<PackResult> | null;
  abort: AbortController | null;
  loaded: number;
  progress: Set<(loaded: number, total: number) => void>;
}

export function createPacks(env: PacksEnv): PackController {
  let manifest: Promise<Map<string, Entry>> | null = null;
  // `state` / `release` cần đồng bộ: giữ bảng đã nạp để tra ngay (chưa nạp xong thì mọi gói là `idle`)
  let loadedMap: Map<string, Entry> | null = null;
  const readyCbs = new Set<(id: string) => void>();
  const releaseCbs = new Set<(id: string) => void>();
  const prefetched = new Set<string>();
  const warned = new Set<string>();
  const waits = new Map<string, { at: number; p: Promise<PackResult> }>();

  const warnOnce = (key: string, msg: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    try {
      env.warn(msg);
    } catch {
      /* ghi cảnh báo không được làm hỏng gì */
    }
  };

  const loadManifest = (): Promise<Map<string, Entry>> => {
    manifest ??= (async () => {
      // Ném lỗi (kể cả đồng bộ) hay 404 đều như nhau: không có manifest
      const text = await Promise.resolve()
        .then(() => env.fetchText("/packs/manifest.json"))
        .catch(() => null);
      let parsed: unknown = null;
      if (text !== null) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null; // ví dụ máy chủ trả index.html cho đường dẫn lạ
        }
      }
      const map = new Map<string, Entry>();
      for (const def of sanitizeManifest(parsed).packs)
        map.set(def.id, {
          def,
          state: "idle",
          attempts: 0,
          promise: null,
          abort: null,
          loaded: 0,
          progress: new Set(),
        });
      loadedMap = map;
      return map;
    })();
    return manifest;
  };

  const fire = (set: Set<(id: string) => void>, id: string): void => {
    for (const cb of [...set]) {
      try {
        cb(id);
      } catch {
        /* một người nghe lỗi không được chặn người khác */
      }
    }
  };

  const start = (e: Entry, lowPriority: boolean): Promise<PackResult> => {
    e.attempts++;
    e.state = "loading";
    e.loaded = 0;
    const ctl = new AbortController();
    e.abort = ctl;
    const total = e.def.bytes;
    // Việc tải này còn "của" `e` không? `release` rồi `ensure` lại thì `e.abort` đã là của lần tải khác.
    const mine = (): boolean => e.abort === ctl;
    const p = (async (): Promise<PackResult> => {
      await Promise.resolve(); // để `e.promise = p` kịp gán trước khi có gì chạy xong đồng bộ
      try {
        let allCached = e.def.files.length > 0 && env.isCached !== undefined;
        if (allCached) {
          for (const f of e.def.files) {
            if (!(await env.isCached!(packFileUrl(f)))) {
              allCached = false;
              break;
            }
          }
        }
        if (!allCached) {
          for (const f of e.def.files) {
            const got = await env.fetchBytes(packFileUrl(f), {
              signal: ctl.signal,
              lowPriority,
            });
            if (got !== f.bytes) throw new Error(`sai dung lượng ${f.path}: ${got} != ${f.bytes}`);
            e.loaded += f.bytes;
            for (const cb of [...e.progress]) {
              try {
                cb(e.loaded, total);
              } catch {
                /* người nghe tiến độ lỗi: bỏ qua */
              }
            }
          }
        }
        if (ctl.signal.aborted || !mine()) return "failed"; // bị `release` giữa chừng: `release` đã đưa về `idle`
        e.state = "ready";
        fire(readyCbs, e.def.id);
        return allCached ? "cached" : "loaded";
      } catch (err) {
        if (ctl.signal.aborted || !mine()) return "failed";
        e.state = "failed";
        warnOnce(
          `fail:${e.def.id}:${e.attempts}`,
          `[gói] không tải được ${e.def.id} (lần ${e.attempts}/${MAX_ATTEMPTS}): ${String(err)}`,
        );
        return "failed";
      } finally {
        if (mine()) {
          e.promise = null;
          e.abort = null;
          e.progress.clear();
        }
      }
    })();
    e.promise = p;
    return p;
  };

  const ensure = async (id: string, opt: EnsureOptions = {}): Promise<PackResult> => {
    try {
      const isHd = id.startsWith("hd:");
      if (isHd && (env.native() || !env.hdAllowed())) return "skipped";
      if (env.native()) return "cached"; // đã đóng sẵn trong APK
      const m = await loadManifest();
      if (m.size === 0) return "skipped"; // chưa có tài sản nào: không có gì để tải
      const e = m.get(id);
      if (!e) {
        warnOnce(`unknown:${id}`, `[gói] không có gói "${id}" trong manifest`);
        return "failed";
      }
      if (e.state === "ready") return "cached";
      if (e.state === "failed" && e.attempts >= MAX_ATTEMPTS) return "failed";
      if (opt.onProgress) e.progress.add(opt.onProgress);
      const work = e.promise ?? start(e, opt.lowPriority === true);
      const waits: Promise<PackResult>[] = [work];
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (opt.timeoutMs !== undefined && opt.timeoutMs >= 0)
        waits.push(new Promise((r) => (timer = setTimeout(() => r("failed"), opt.timeoutMs))));
      let onAbort: (() => void) | undefined;
      if (opt.signal) {
        const sig = opt.signal;
        waits.push(
          new Promise<PackResult>((r) => {
            if (sig.aborted) return r("failed");
            onAbort = () => r("failed");
            sig.addEventListener("abort", onAbort, { once: true });
          }),
        );
      }
      try {
        return await Promise.race(waits);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (onAbort && opt.signal) opt.signal.removeEventListener("abort", onAbort);
        if (opt.onProgress) e.progress.delete(opt.onProgress);
      }
    } catch (err) {
      warnOnce(`ensure:${id}`, `[gói] lỗi khi nạp ${id}: ${String(err)}`);
      return "failed";
    }
  };

  const release = (id: string): void => {
    prefetched.delete(id); // giải phóng rồi thì lần lại gần sau được tải trước lại
    const e = loadedMap?.get(id);
    if (!e || e.state === "idle") return;
    e.abort?.abort();
    e.abort = null;
    e.promise = null; // `ensure` ngay sau đó phải bắt đầu việc tải MỚI, không nối vào việc đang bị huỷ
    e.progress.clear();
    e.state = "idle";
    e.attempts = 0;
    e.loaded = 0;
    fire(releaseCbs, id);
  };

  const canPrefetch = (): boolean =>
    !env.native() && !env.saveData() && !["slow-2g", "2g"].includes(env.connection() ?? "");

  const prefetch = (id: string): void => {
    if (prefetched.has(id) || !canPrefetch()) return;
    prefetched.add(id);
    env.idle(() => void ensure(id, { lowPriority: true }));
  };

  const waitFor = (mapId: string): Promise<PackResult> =>
    ensure(mapPackId(mapId), { timeoutMs: mapPackTimeoutMs(isDungeonMap(mapId)) });

  return {
    ensure,
    state: (id) => loadedMap?.get(id)?.state ?? "idle",
    onReady(cb) {
      readyCbs.add(cb);
      return () => readyCbs.delete(cb);
    },
    onRelease(cb) {
      releaseCbs.add(cb);
      return () => releaseCbs.delete(cb);
    },
    release,
    releaseKind(kind) {
      if (!loadedMap) return;
      for (const e of loadedMap.values()) if (e.def.kind === kind) release(e.def.id);
    },
    prefetch,
    startMapWait(mapId) {
      waits.set(mapId, { at: Date.now(), p: waitFor(mapId) });
    },
    takeMapWait(mapId) {
      const w = waits.get(mapId);
      waits.delete(mapId);
      return w && Date.now() - w.at <= MAP_WAIT_TTL_MS ? w.p : waitFor(mapId);
    },
    prefetchNeighbors(ids) {
      if (env.connection() !== "4g") return;
      for (const id of ids.slice(0, NEIGHBOR_PREFETCH_MAX)) prefetch(mapPackId(id));
    },
  };
}

// --- Môi trường thật ---

interface NetworkInfo {
  effectiveType?: string;
  saveData?: boolean;
}

export function browserPacksEnv(opts: {
  isNative: () => boolean;
  hdAllowed: () => boolean;
  win?: Window;
}): PacksEnv {
  const win = opts.win ?? window;
  const conn = (): NetworkInfo | undefined =>
    (win.navigator as Navigator & { connection?: NetworkInfo }).connection;
  return {
    async fetchText(url) {
      const r = await win.fetch(url, { cache: "no-cache" });
      return r.ok ? await r.text() : null;
    },
    async fetchBytes(url, init) {
      const r = await win.fetch(url, {
        signal: init.signal,
        cache: "force-cache",
        // `priority` chưa có trong mọi kiểu `RequestInit` của TypeScript
        ...(init.lowPriority ? ({ priority: "low" } as object) : {}),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.arrayBuffer()).byteLength;
    },
    async isCached(url) {
      try {
        return (await win.caches?.match(url)) !== undefined;
      } catch {
        return false;
      }
    },
    native: opts.isNative,
    saveData: () => conn()?.saveData === true,
    connection: () => conn()?.effectiveType,
    hdAllowed: opts.hdAllowed,
    idle: (cb) => {
      const ric = (
        win as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }
      ).requestIdleCallback;
      if (ric) ric.call(win, cb, { timeout: 5000 });
      else win.setTimeout(cb, 1500);
    },
    warn: (msg) => console.warn(msg),
  };
}

// --- Bản duy nhất dùng trong ứng dụng ---

let current: PackController | null = null;

export function initPacks(env: PacksEnv): PackController {
  current = createPacks(env);
  return current;
}

/** Bộ nạp đang dùng; chưa `initPacks` (test, chế độ giả lập) thì `ensure` trả `skipped` ngay. */
export function packs(): PackController {
  return (
    current ?? {
      ensure: async () => "skipped",
      state: () => "idle",
      onReady: () => () => undefined,
      onRelease: () => () => undefined,
      release: () => undefined,
      releaseKind: () => undefined,
      prefetch: () => undefined,
      startMapWait: () => undefined,
      takeMapWait: async () => "skipped",
      prefetchNeighbors: () => undefined,
    }
  );
}

/** Thời gian chờ gói ở màn chuyển cảnh theo loại bản đồ: bí cảnh chờ ngắn (đồng hồ của lượt vào), bản đồ thường chờ lâu hơn. */
export function mapPackTimeoutMs(isDungeon: boolean): number {
  return isDungeon ? DUNGEON_PACK_TIMEOUT_MS : MAP_PACK_TIMEOUT_MS;
}

/** Bản đồ thường nối với bản đồ hiện tại qua `portals` (không trùng, không phải bí cảnh, khác `currentId`), theo thứ tự cổng. */
export function neighborMapIds(
  portals: readonly { readonly toMap: string }[],
  currentId: string,
): string[] {
  const out: string[] = [];
  for (const p of portals)
    if (p.toMap !== currentId && !isDungeonMap(p.toMap) && !out.includes(p.toMap))
      out.push(p.toMap);
  return out;
}

/** Bản đồ bên kia của các cổng trong vòng `PORTAL_PREFETCH_PX` quanh (x, y), không trùng. */
export function mapsNearPortals(
  portals: readonly { readonly x: number; readonly y: number; readonly toMap: string }[],
  x: number,
  y: number,
): string[] {
  const out: string[] = [];
  const r2 = PORTAL_PREFETCH_PX * PORTAL_PREFETCH_PX;
  for (const p of portals) {
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= r2 && !isDungeonMap(p.toMap) && !out.includes(p.toMap))
      out.push(p.toMap);
  }
  return out;
}
