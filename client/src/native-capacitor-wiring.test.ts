import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupNativeApp } from "./native-app";

/**
 * Nối dây THẬT giữa `setupNativeApp` và Capacitor (M4.2b #301, review #314).
 *
 * Lỗi đã lọt qua các test dùng mock: bridge native của Android KHÔNG tự điền `window.Capacitor.Plugins.App`;
 * chỉ `registerPlugin("App")` (chạy khi gói JS `@capacitor/app` được import) mới điền. Client không import gói
 * này thì `setupNativeApp` không có plugin, phím Back không bao giờ được bắt, `appStateChange` không tới.
 * Ở đây dùng `@capacitor/core` + `@capacitor/app` THẬT, chỉ giả phần native (`nativeCallback` / `nativePromise`
 * mà bridge Android bơm vào `window.Capacitor` cùng `PluginHeaders`).
 */

const REPO_ROOT = resolve(__dirname, "../..");

type NativeCb = (data?: unknown) => void;

/** Giả bridge Android: ghi lại listener đăng ký và lời gọi `exitApp`. */
function installFakeAndroidBridge() {
  const callbacks = new Map<string, NativeCb>();
  const nativeCallback = vi.fn((plugin: string, method: string, options: any, cb: NativeCb) => {
    if (method === "addListener") callbacks.set(`${plugin}.${options.eventName}`, cb);
    return `callback-${callbacks.size}`;
  });
  const nativePromise = vi.fn(async () => undefined);
  // @capacitor/core nhận ra nền tảng Android bằng window.androidBridge (bridge native bơm vào), không bằng getPlatform
  (globalThis as any).androidBridge = { postMessage: () => {} };
  (globalThis as any).Capacitor = {
    PluginHeaders: [
      {
        name: "App",
        methods: [
          { name: "addListener", rtype: "callback" },
          { name: "removeListener", rtype: "promise" },
          { name: "exitApp", rtype: "promise" },
        ],
      },
    ],
    getPlatform: () => "android",
    nativeCallback,
    nativePromise,
  };
  return { callbacks, nativeCallback, nativePromise };
}

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    isOutdatedOpen: () => false,
    isLoginOpen: () => false,
    handleEscape: () => false,
    showToast: vi.fn(),
    ...overrides,
  };
}

describe("Nối dây Capacitor thật: @capacitor/core + @capacitor/app + bridge Android giả", () => {
  // `@capacitor/*` là phụ thuộc ngoài (Node cache module): vi.resetModules() KHÔNG nạp lại chúng, nên
  // dựng bridge MỘT lần TRƯỚC lần import đầu và chỉ xoá trạng thái giữa các test.
  let bridge: ReturnType<typeof installFakeAndroidBridge>;
  let App: any;
  beforeAll(async () => {
    bridge = installFakeAndroidBridge();
    ({ App } = await import("@capacitor/app"));
  });
  beforeEach(() => {
    bridge.callbacks.clear();
    bridge.nativeCallback.mockClear();
    bridge.nativePromise.mockClear();
  });

  it("plugin thật: phím Back tới được controller (đóng tầng trên cùng, bấm hai lần thì exitApp qua bridge)", async () => {
    let uiOpen = true;
    const handleEscape = vi.fn(() => {
      const wasOpen = uiOpen;
      uiOpen = false;
      return wasOpen;
    });
    const showToast = vi.fn();
    const setup = setupNativeApp(
      baseOptions({ handleEscape, showToast, capacitorApp: App }) as any,
    );
    expect(setup).not.toBeNull();

    await vi.waitFor(() => expect(bridge.callbacks.has("App.backButton")).toBe(true));
    const back = bridge.callbacks.get("App.backButton")!;

    back({ canGoBack: false }); // có tầng UI đang mở: đóng nó, KHÔNG thoát
    expect(handleEscape).toHaveBeenCalledTimes(1);
    expect(bridge.nativePromise).not.toHaveBeenCalledWith("App", "exitApp", undefined);

    back({ canGoBack: false }); // hết tầng để đóng: toast nhắc, vẫn chưa thoát
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: "info" }));
    expect(bridge.nativePromise).not.toHaveBeenCalledWith("App", "exitApp", undefined);

    back({ canGoBack: false }); // bấm lần hai trong 2 giây: thoát thật qua bridge
    await vi.waitFor(() =>
      expect(bridge.nativePromise).toHaveBeenCalledWith("App", "exitApp", undefined),
    );
  });

  it("plugin thật: appStateChange tới được bộ điều khiển nhịp tim và âm thanh", async () => {
    const heartbeat = { onVisibilityChange: vi.fn() };
    const sound = { suspend: vi.fn(), resume: vi.fn() };
    const setup = setupNativeApp(
      baseOptions({ getHeartbeat: () => heartbeat, sound, capacitorApp: App }) as any,
    );
    expect(setup).not.toBeNull();

    await vi.waitFor(() => expect(bridge.callbacks.has("App.appStateChange")).toBe(true));
    const state = bridge.callbacks.get("App.appStateChange")!;

    state({ isActive: false });
    expect(heartbeat.onVisibilityChange).toHaveBeenLastCalledWith(true);
    expect(sound.suspend).toHaveBeenCalled();

    state({ isActive: true });
    expect(heartbeat.onVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(sound.resume).toHaveBeenCalled();
  });
});

describe("Kiểm tĩnh: client nạp plugin thật và ghim cùng phiên bản với app/", () => {
  const read = (p: string) => readFileSync(resolve(REPO_ROOT, p), "utf-8");

  it("main.ts nạp @capacitor/app và truyền vào setupNativeApp (không dựa vào window.Capacitor.Plugins)", () => {
    const main = read("client/src/main.ts");
    expect(main).toMatch(/import\(\s*["']@capacitor\/app["']\s*\)/);
    expect(main).toMatch(/capacitorApp:\s*App\b/);
  });

  it("client/package.json có @capacitor/core + @capacitor/app, ghim chính xác, trùng phiên bản app/package.json", () => {
    const client = JSON.parse(read("client/package.json")).dependencies ?? {};
    const app = JSON.parse(read("app/package.json")).dependencies ?? {};
    for (const dep of ["@capacitor/core", "@capacitor/app"]) {
      expect(client[dep], `${dep} thiếu trong client/package.json`).toBeDefined();
      expect(client[dep]).toMatch(/^\d+\.\d+\.\d+$/); // ghim chính xác, không ^ ~
      // Lệch phiên bản giữa JS (client) và plugin native (app/) gây lỗi lúc chạy trên máy thật
      expect(client[dep]).toBe(app[dep]);
    }
  });
});
