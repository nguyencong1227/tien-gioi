/**
 * Tải PHASER + cảnh thế giới (`WorldScene`) SAU màn đăng nhập (#1097, hướng (b) A chọn).
 *
 * Trước đây một gói JS duy nhất ~533 KB gzip phải tải xong mới có màn đăng nhập (Phaser ~290 KB + `WorldScene` ~58 KB chỉ cần LÚC VÀO GAME). Nay hai thứ đó nằm ở chunk riêng (`import()`),
 * gói khởi động chỉ còn phần giao diện (màn đăng nhập, HUD DOM, mạng, âm thanh...). Chunk game được tải SẴN lúc rảnh khi người chơi còn ở màn đăng nhập (`prefetchGameModulesWhenIdle`),
 * nên bấm Vào gần như không phải chờ; nếu họ vào ngay (đã có token) thì `start()` chờ cùng một lời hứa, không tải hai lần.
 *
 * Cùng lúc chunk game còn NHẬN TỆP BẢN ĐỒ (`adoptTiledMapFiles`, S3a): client dựng bản đồ từ đúng tệp máy chủ dùng, xong TRƯỚC khi ai nhận được `GameModules` (nên trước `new WorldScene` / `getMap` ở `main.ts`).
 *
 * Quy tắc cho mã trong gói khởi động: KHÔNG `import` tĩnh `phaser` hay `./scenes/WorldScene` (chỉ `import type`), nếu không Rollup kéo cả chúng về gói khởi động và
 * `check:budget` (`startupGzipKb`) đỏ. `game-modules.test.ts` canh điều này.
 */
import type PhaserNs from "phaser";
import type { WorldScene as WorldSceneClass } from "./scenes/WorldScene";

type PhaserApi = typeof PhaserNs;

export interface GameModules {
  Phaser: PhaserApi;
  WorldScene: typeof WorldSceneClass;
}

/** Hai chỗ `import()` thật được truyền vào để test thay bằng giả (Phaser không chạy được ngoài trình duyệt). */
export interface GameImporters {
  phaser: () => Promise<unknown>;
  scene: () => Promise<{ WorldScene: typeof WorldSceneClass }>;
  /**
   * Tệp bản đồ Tiled (S3a, `docs/THIET_KE_BAN_DO_TILED.md` mục 4a): module có `adoptTiledMapFiles`. Nhận TRƯỚC khi lời hứa nạp chunk game xong, tức trước mọi lần dựng `WorldScene` / `getMap`
   * sau màn đăng nhập, để client dựng bản đồ từ ĐÚNG tệp máy chủ đang dùng (không sinh theo `seed`: từ S6 tệp sửa tay khác `seed`). KHÔNG nhập tĩnh: bốn tệp ~14 KB gzip sẽ vào gói khởi động.
   */
  mapFiles: () => Promise<{ adoptTiledMapFiles: () => string[] }>;
}

export interface GameLoader {
  load: () => Promise<GameModules>;
  prefetch: () => void;
}

/**
 * Lời hứa dùng chung: lần đầu bắt đầu tải, các lần sau trả lại cùng lời hứa (không tải hai lần). Tải LỖI (mất mạng giữa chừng) thì lần gọi sau THỬ LẠI thay vì kẹt trên lỗi cũ.
 * `prefetch` không chờ kết quả và nuốt lỗi (lúc vào game `start()` tải lại và báo lỗi cho người chơi).
 */
export function createGameLoader(imp: GameImporters): GameLoader {
  let loading: Promise<GameModules> | null = null;
  const load = (): Promise<GameModules> => {
    if (!loading) {
      const p = Promise.all([imp.phaser(), imp.scene(), imp.mapFiles()]).then(
        ([phaser, scene, files]): GameModules => {
          // Nhận tệp bản đồ NGAY khi cả ba chunk đã về và TRƯỚC khi ai nhận được `GameModules` (chạy một lần cho mỗi lần tải thành công; lỗi tải thì lần gọi sau thử lại cả ba)
          files.adoptTiledMapFiles();
          return {
            // Phaser là gói UMD (`export =`): bản dựng của Vite đưa vào `default`, TypeScript lại kiểu nó như chính không gian tên; nhận cả hai
            Phaser: (phaser as { default?: PhaserApi }).default ?? (phaser as PhaserApi),
            WorldScene: scene.WorldScene,
          };
        },
      );
      loading = p;
      p.catch(() => {
        if (loading === p) loading = null;
      });
    }
    return loading;
  };
  return { load, prefetch: () => void load().catch(() => {}) };
}

const loader = createGameLoader({
  phaser: () => import("phaser"),
  scene: () => import("./scenes/WorldScene"),
  mapFiles: () => import("@tien-gioi/shared/src/map-files"),
});
export const loadGameModules = loader.load;
export const prefetchGameModules = loader.prefetch;

/** Phần của môi trường trình duyệt mà việc hẹn tải sẵn cần (test truyền giả). */
export interface PrefetchEnv {
  saveData?: boolean;
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  setTimeout: (cb: () => void, ms: number) => unknown;
}

/** Hạn chờ tối đa của `requestIdleCallback` (ms) và độ trễ khi trình duyệt không có nó. */
export const PREFETCH_IDLE_TIMEOUT_MS = 2500;
export const PREFETCH_FALLBACK_MS = 500;

/**
 * Hẹn tải sẵn lúc trình duyệt rảnh. Bỏ qua khi người dùng bật "Tiết kiệm dữ liệu" (`saveData`): khi đó chỉ tải lúc thật sự vào game. Trả về `true` nếu đã hẹn.
 */
export function schedulePrefetch(prefetch: () => void, env: PrefetchEnv): boolean {
  if (env.saveData) return false;
  if (typeof env.requestIdleCallback === "function")
    env.requestIdleCallback(prefetch, { timeout: PREFETCH_IDLE_TIMEOUT_MS });
  else env.setTimeout(prefetch, PREFETCH_FALLBACK_MS);
  return true;
}

export function prefetchGameModulesWhenIdle(): void {
  const g = globalThis as {
    navigator?: { connection?: { saveData?: boolean } };
    requestIdleCallback?: PrefetchEnv["requestIdleCallback"];
  };
  schedulePrefetch(prefetchGameModules, {
    saveData: g.navigator?.connection?.saveData === true,
    requestIdleCallback: g.requestIdleCallback?.bind(globalThis),
    setTimeout: (cb, ms) => setTimeout(cb, ms),
  });
}
