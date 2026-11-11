import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_APP_UPDATE_URL,
  getAppUpdateUrl,
  getOutdatedUiConfig,
  NativeBackButtonController,
  NativeLifecycleController,
  setupNativeApp,
} from "./native-app";

describe("Native App - Cấu hình URL Cập nhật & Modal 426 (M4.2b #301)", () => {
  it("getAppUpdateUrl: mặc định trỏ về releases của repo", () => {
    expect(getAppUpdateUrl({})).toBe(DEFAULT_APP_UPDATE_URL);
    expect(getAppUpdateUrl(undefined as any)).toBe(DEFAULT_APP_UPDATE_URL);
  });

  it("getAppUpdateUrl: lấy URL từ biến môi trường VITE_APP_UPDATE_URL khi được cấu hình", () => {
    expect(
      getAppUpdateUrl({
        VITE_APP_UPDATE_URL:
          "https://play.google.com/store/apps/details?id=site.hethongtm.tiengioi",
      }),
    ).toBe("https://play.google.com/store/apps/details?id=site.hethongtm.tiengioi");
  });

  it("getOutdatedUiConfig (Web): nhãn 'Tải Lại Trang' và gọi reload", () => {
    const onReload = vi.fn();
    const cfg = getOutdatedUiConfig(3, false, onReload);
    expect(cfg.buttonLabel).toBe("Tải Lại Trang");
    expect(cfg.message).toContain("tải lại trang");
    expect(cfg.message).toContain("v3");
    cfg.onAction();
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("getOutdatedUiConfig (Native): nhãn 'Cập Nhật Bản Mới' và mở URL tải", () => {
    const onReload = vi.fn();
    const openMock = vi.fn();
    const originalWindow = globalThis.window;
    globalThis.window = { open: openMock, location: { href: "" } } as any;

    try {
      const customUrl = "https://custom.release.url";
      const cfg = getOutdatedUiConfig(5, true, onReload, customUrl);
      expect(cfg.buttonLabel).toBe("Cập Nhật Bản Mới");
      expect(cfg.message).toContain("cập nhật ứng dụng");
      expect(cfg.message).toContain("v5");
      cfg.onAction();
      expect(onReload).not.toHaveBeenCalled();
      expect(openMock).toHaveBeenCalledWith(customUrl, "_blank");
    } finally {
      globalThis.window = originalWindow;
    }
  });
});

describe("Native App - Phím Back Android (NativeBackButtonController, M4.2b #301)", () => {
  it("trường hợp 1: hộp thoại 'Phiên bản đã cũ' (426) đang mở -> không làm gì, không thoát", () => {
    const exitApp = vi.fn();
    const handleEscape = vi.fn();
    const showToast = vi.fn();

    const controller = new NativeBackButtonController({
      isOutdatedOpen: () => true,
      isLoginOpen: () => false,
      handleEscape,
      exitApp,
      showToast,
    });

    const res = controller.handleBackButton();
    expect(res).toBe("ignored_outdated");
    expect(exitApp).not.toHaveBeenCalled();
    expect(handleEscape).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("trường hợp 2: đang ở màn hình đăng nhập -> thoát ngay lập tức", () => {
    const exitApp = vi.fn();
    const handleEscape = vi.fn();
    const showToast = vi.fn();

    const controller = new NativeBackButtonController({
      isOutdatedOpen: () => false,
      isLoginOpen: () => true,
      handleEscape,
      exitApp,
      showToast,
    });

    const res = controller.handleBackButton();
    expect(res).toBe("exit_login");
    expect(exitApp).toHaveBeenCalledOnce();
    expect(handleEscape).not.toHaveBeenCalled();
  });

  it("trường hợp 3: có modal/popup đang mở -> đóng tầng trên cùng qua handleEscape", () => {
    const exitApp = vi.fn();
    const handleEscape = vi.fn().mockReturnValue(true);
    const showToast = vi.fn();

    const controller = new NativeBackButtonController({
      isOutdatedOpen: () => false,
      isLoginOpen: () => false,
      handleEscape,
      exitApp,
      showToast,
    });

    const res = controller.handleBackButton();
    expect(res).toBe("closed_ui");
    expect(handleEscape).toHaveBeenCalledOnce();
    expect(exitApp).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("trường hợp 4: đang chơi game -> nhấn 2 lần trong 2 giây mới thoát", () => {
    let nowTime = 1000;
    const exitApp = vi.fn();
    const handleEscape = vi.fn().mockReturnValue(false);
    const showToast = vi.fn();

    const controller = new NativeBackButtonController({
      isOutdatedOpen: () => false,
      isLoginOpen: () => false,
      handleEscape,
      exitApp,
      showToast,
      now: () => nowTime,
    });

    // Lần 1: hiện toast nhắc nhở
    const res1 = controller.handleBackButton();
    expect(res1).toBe("toast_prompt");
    expect(showToast).toHaveBeenCalledWith({
      text: "Nhấn lần nữa để thoát trò chơi",
      tone: "info",
    });
    expect(exitApp).not.toHaveBeenCalled();

    // Nhấn lần 2 nhưng quá muộn (sau 2.5s = 2500ms > 2000ms): vẫn chỉ hiện toast nhắc lại
    nowTime = 3600;
    const res2 = controller.handleBackButton();
    expect(res2).toBe("toast_prompt");
    expect(exitApp).not.toHaveBeenCalled();

    // Nhấn lần 3 trong vòng 1.2s (1200ms <= 2000ms): THOÁT
    nowTime = 4800;
    const res3 = controller.handleBackButton();
    expect(res3).toBe("exit_double_back");
    expect(exitApp).toHaveBeenCalledOnce();
  });
});

describe("Native App - Vòng đời xuống nền / tiền cảnh (NativeLifecycleController, M4.2b #301)", () => {
  it("isActive: false -> tạm dừng âm thanh và gọi heartbeat.onVisibilityChange(true)", () => {
    const suspend = vi.fn();
    const resume = vi.fn();
    const onVisibilityChange = vi.fn();

    const controller = new NativeLifecycleController({
      sound: { suspend, resume },
      getHeartbeat: () => ({ onVisibilityChange }),
    });

    controller.handleAppStateChange({ isActive: false });
    expect(suspend).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();
    expect(onVisibilityChange).toHaveBeenCalledWith(true);
  });

  it("isActive: true -> phục hồi âm thanh và gọi heartbeat.onVisibilityChange(false)", () => {
    const suspend = vi.fn();
    const resume = vi.fn();
    const onVisibilityChange = vi.fn();

    const controller = new NativeLifecycleController({
      sound: { suspend, resume },
      getHeartbeat: () => ({ onVisibilityChange }),
    });

    controller.handleAppStateChange({ isActive: true });
    expect(resume).toHaveBeenCalledOnce();
    expect(suspend).not.toHaveBeenCalled();
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
  });
});

describe("Native App - setupNativeApp & Đăng ký Plugin Bridge", () => {
  it("trả về null nếu không có Capacitor App bridge", () => {
    const res = setupNativeApp({
      isOutdatedOpen: () => false,
      isLoginOpen: () => false,
      handleEscape: () => false,
      showToast: () => {},
      capacitorApp: null,
    });
    expect(res).toBeNull();
  });

  it("đăng ký backButton và appStateChange, cleanup huỷ listener sạch sẽ", () => {
    const listeners: Record<string, (...args: any[]) => any> = {};
    const removeBack = vi.fn();
    const removeState = vi.fn();

    const mockCapApp = {
      addListener: vi.fn((event: string, fn: (...args: any[]) => any) => {
        listeners[event] = fn;
        if (event === "backButton") return { remove: removeBack };
        if (event === "appStateChange") return { remove: removeState };
        return { remove: () => {} };
      }),
      exitApp: vi.fn(),
    };

    const setup = setupNativeApp({
      isOutdatedOpen: () => false,
      isLoginOpen: () => true,
      handleEscape: () => false,
      showToast: () => {},
      capacitorApp: mockCapApp,
    });

    expect(setup).not.toBeNull();
    expect(mockCapApp.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    expect(mockCapApp.addListener).toHaveBeenCalledWith("appStateChange", expect.any(Function));

    // Kích hoạt backButton listener
    listeners.backButton?.();
    expect(mockCapApp.exitApp).toHaveBeenCalledOnce();

    // Cleanup
    setup!.cleanup();
    expect(removeBack).toHaveBeenCalledOnce();
    expect(removeState).toHaveBeenCalledOnce();
  });
});

describe("Đột biến đỏ (Mutation Tests) - M4.2b", () => {
  it("đột biến 1: đổi nhãn nút native từ 'Cập Nhật Bản Mới' sang khác -> test bắt được", () => {
    const cfg = getOutdatedUiConfig(1, true, () => {});
    // Nếu ai đó đổi nhãn thành "Tải Lại" trên native thì fail
    expect(cfg.buttonLabel).toBe("Cập Nhật Bản Mới");
    expect(cfg.buttonLabel).not.toBe("Tải Lại Trang");
  });

  it("đột biến 2: phím Back trong game nếu thoát ngay lần bấm đầu tiên -> test bắt được", () => {
    const exitApp = vi.fn();
    const controller = new NativeBackButtonController({
      isOutdatedOpen: () => false,
      isLoginOpen: () => false,
      handleEscape: () => false,
      exitApp,
      showToast: () => {},
      now: () => 1000,
    });
    const res = controller.handleBackButton();
    expect(res).toBe("toast_prompt");
    expect(exitApp).not.toHaveBeenCalled(); // Không được thoát ngay ở lần 1
  });

  it("đột biến 3: phím Back khi modal 426 mở nếu bị thoát app -> test bắt được", () => {
    const exitApp = vi.fn();
    const controller = new NativeBackButtonController({
      isOutdatedOpen: () => true,
      isLoginOpen: () => false,
      handleEscape: () => false,
      exitApp,
      showToast: () => {},
    });
    const res = controller.handleBackButton();
    expect(res).toBe("ignored_outdated");
    expect(exitApp).not.toHaveBeenCalled();
  });

  it("đột biến 4: app xuống nền nếu không tạm dừng âm thanh -> test bắt được", () => {
    const suspend = vi.fn();
    const controller = new NativeLifecycleController({
      sound: { suspend, resume: vi.fn() },
    });
    controller.handleAppStateChange({ isActive: false });
    expect(suspend).toHaveBeenCalledOnce();
  });
});
