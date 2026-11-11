import { describe, expect, it, vi } from "vitest";
import { setupNativeApp } from "./native-app";

/**
 * "Cái bẫy" của Capacitor (M4.2b #301, review #314), tách tệp riêng vì `@capacitor/core` bị Node cache theo tiến trình:
 * bridge Android có `PluginHeaders` cho plugin App, nhưng nếu chưa ai gọi `registerPlugin("App")` (tức chưa import
 * `@capacitor/app`) thì `window.Capacitor.Plugins.App` là `undefined`. Cách cũ của `setupNativeApp` (tìm
 * `window.Capacitor.Plugins.App`) vì thế không gắn được gì trên máy thật, và test dùng mock không thấy.
 */
describe("Capacitor: bridge có PluginHeaders nhưng chưa registerPlugin('App')", () => {
  it("Plugins.App là undefined; setupNativeApp không truyền capacitorApp thì không gắn gì (trả null)", async () => {
    const nativeCallback = vi.fn();
    (globalThis as any).androidBridge = { postMessage: () => {} };
    (globalThis as any).window = globalThis;
    (globalThis as any).Capacitor = {
      PluginHeaders: [{ name: "App", methods: [{ name: "addListener", rtype: "callback" }] }],
      nativeCallback,
      nativePromise: vi.fn(async () => undefined),
    };
    await import("@capacitor/core"); // nạp lõi nhưng KHÔNG import @capacitor/app

    expect((globalThis as any).Capacitor.Plugins.App).toBeUndefined();
    const res = setupNativeApp({
      isOutdatedOpen: () => false,
      isLoginOpen: () => false,
      handleEscape: () => false,
      showToast: () => {},
    });
    expect(res).toBeNull();
    expect(nativeCallback).not.toHaveBeenCalled();
  });
});
