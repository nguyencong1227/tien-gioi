/**
 * Quản lý tính năng và vòng đời ứng dụng Android Native (Capacitor) - M4.2b (Issue #301)
 *
 * Bao gồm:
 * 1. Phím Back Android: đóng UI -> nhấn 2 lần trong 2 giây mới thoát; thoát ngay ở login; không thoát khi ở 426.
 * 2. Xuống nền / tiền cảnh native: nối với bộ nhịp tim và âm thanh.
 * 3. Phiên bản cũ (426) trên native: nhãn "Cập Nhật Bản Mới" và mở VITE_APP_UPDATE_URL.
 */

export const DEFAULT_APP_UPDATE_URL = "https://github.com/nguyencong1227/tien-gioi/releases";

/**
 * Lấy URL cập nhật ứng dụng, ưu tiên biến môi trường VITE_APP_UPDATE_URL.
 */
export function getAppUpdateUrl(
  env: Record<string, unknown> = typeof import.meta !== "undefined" && import.meta.env
    ? (import.meta.env as unknown as Record<string, unknown>)
    : {},
): string {
  const url = env?.VITE_APP_UPDATE_URL;
  if (typeof url === "string" && url.trim().length > 0) {
    return url.trim();
  }
  return DEFAULT_APP_UPDATE_URL;
}

export interface OutdatedUiConfig {
  message: string;
  buttonLabel: string;
  onAction: () => void;
}

/**
 * Xác định nội dung và hành động hiển thị khi máy chủ trả lỗi 426 (phiên bản giao thức đã cũ).
 */
export function getOutdatedUiConfig(
  minVersion: number,
  isNative: boolean,
  onWebReload: () => void,
  updateUrl: string = DEFAULT_APP_UPDATE_URL,
): OutdatedUiConfig {
  if (isNative) {
    const message =
      minVersion > 0
        ? `Máy chủ đã nâng cấp phiên bản giao thức mới (yêu cầu tối thiểu v${minVersion}). Vui lòng cập nhật ứng dụng lên bản mới nhất để tiếp tục phiêu bạt Tiên Giới.`
        : "Máy chủ đã nâng cấp phiên bản giao thức mới. Vui lòng cập nhật ứng dụng lên bản mới nhất để tiếp tục phiêu bạt Tiên Giới.";
    return {
      message,
      buttonLabel: "Cập Nhật Bản Mới",
      onAction: () => {
        if (typeof window !== "undefined") {
          const opened = window.open(updateUrl, "_blank");
          if (!opened) {
            window.location.href = updateUrl;
          }
        }
      },
    };
  }

  const message =
    minVersion > 0
      ? `Máy chủ đã nâng cấp phiên bản giao thức mới (yêu cầu tối thiểu v${minVersion}). Vui lòng tải lại trang để nạp bản cập nhật mới nhất.`
      : "Máy chủ đã nâng cấp phiên bản giao thức mới. Vui lòng tải lại trang để tiếp tục phiêu bạt Tiên Giới.";
  return {
    message,
    buttonLabel: "Tải Lại Trang",
    onAction: onWebReload,
  };
}

export interface NativeBackButtonContext {
  isOutdatedOpen: () => boolean;
  isLoginOpen: () => boolean;
  handleEscape: () => boolean;
  exitApp: () => void;
  showToast: (msg: { text: string; tone?: "good" | "bad" | "info" }) => void;
  now?: () => number;
}

export type BackButtonActionResult =
  "ignored_outdated" | "exit_login" | "closed_ui" | "toast_prompt" | "exit_double_back";

export class NativeBackButtonController {
  private lastBackTime = 0;
  private readonly now: () => number;

  constructor(private readonly context: NativeBackButtonContext) {
    this.now = context.now ?? (() => Date.now());
  }

  /**
   * Xử lý sự kiện khi người dùng nhấn phím Back vật lý / cử chỉ Back hệ thống.
   */
  handleBackButton(): BackButtonActionResult {
    // 1. Nếu đang hiển thị modal "Phiên bản đã cũ": không làm gì để tránh thoát nhầm
    if (this.context.isOutdatedOpen()) {
      return "ignored_outdated";
    }

    // 2. Nếu đang ở màn hình đăng nhập: thoát ứng dụng ngay lập tức
    if (this.context.isLoginOpen()) {
      this.context.exitApp();
      return "exit_login";
    }

    // 3. Nếu có modal, dialog, menu hay ô chat đang mở: đóng tầng trên cùng
    if (this.context.handleEscape()) {
      this.lastBackTime = 0;
      return "closed_ui";
    }

    // 4. Nếu không còn gì để đóng (đang chơi game): nhấn 2 lần trong 2 giây mới thoát
    const currentTime = this.now();
    if (this.lastBackTime > 0 && currentTime - this.lastBackTime <= 2000) {
      this.lastBackTime = 0;
      this.context.exitApp();
      return "exit_double_back";
    }

    this.lastBackTime = currentTime;
    this.context.showToast({
      text: "Nhấn lần nữa để thoát trò chơi",
      tone: "info",
    });
    return "toast_prompt";
  }
}

export interface NativeLifecycleContext {
  getHeartbeat?: () => { onVisibilityChange: (forcedHidden?: boolean) => void } | null;
  sound?: { suspend: () => void; resume: () => void };
}

export class NativeLifecycleController {
  constructor(private readonly context: NativeLifecycleContext) {}

  handleAppStateChange(state: { isActive: boolean }): void {
    if (state.isActive) {
      // Tiền cảnh: phục hồi âm thanh và nhịp tim
      this.context.sound?.resume();
      this.context.getHeartbeat?.()?.onVisibilityChange(false);
    } else {
      // Xuống nền: tạm dừng âm thanh và nhịp tim
      this.context.sound?.suspend();
      this.context.getHeartbeat?.()?.onVisibilityChange(true);
    }
  }
}

export interface SetupNativeAppOptions {
  isOutdatedOpen: () => boolean;
  isLoginOpen: () => boolean;
  handleEscape: () => boolean;
  showToast: (msg: { text: string; tone?: "good" | "bad" | "info" }) => void;
  getHeartbeat?: () => { onVisibilityChange: (forcedHidden?: boolean) => void } | null;
  sound?: { suspend: () => void; resume: () => void };
  capacitorApp?: any;
}

/**
 * Đăng ký các trình xử lý native cho Capacitor App (nếu đang chạy môi trường native).
 */
export function setupNativeApp(opts: SetupNativeAppOptions): {
  backController: NativeBackButtonController;
  lifecycleController: NativeLifecycleController;
  cleanup: () => void;
} | null {
  const cap =
    opts.capacitorApp ?? (typeof window !== "undefined" && (window as any).Capacitor?.Plugins?.App);

  const backController = new NativeBackButtonController({
    isOutdatedOpen: opts.isOutdatedOpen,
    isLoginOpen: opts.isLoginOpen,
    handleEscape: opts.handleEscape,
    exitApp: () => {
      if (cap && typeof cap.exitApp === "function") {
        cap.exitApp();
      }
    },
    showToast: opts.showToast,
  });

  const lifecycleController = new NativeLifecycleController({
    getHeartbeat: opts.getHeartbeat,
    sound: opts.sound,
  });

  if (!cap || typeof cap.addListener !== "function") {
    // Không có bridge Capacitor (chạy trên trình duyệt thuần)
    return null;
  }

  let removeBack: (() => void) | null = null;
  let removeState: (() => void) | null = null;

  try {
    const backResult = cap.addListener("backButton", () => {
      backController.handleBackButton();
    });
    // Plugin thật trả về Promise<{ remove }> (kèm `.remove` kiểu cũ đã bị Capacitor đánh dấu deprecated):
    // ưu tiên `.then` để lấy handle; chỉ khi không phải thenable mới dùng `.remove` trực tiếp.
    if (backResult && typeof backResult.then === "function") {
      backResult.then((handle: any) => {
        if (handle && typeof handle.remove === "function") {
          removeBack = () => handle.remove();
        }
      });
    } else if (backResult && typeof backResult.remove === "function") {
      removeBack = () => backResult.remove();
    }

    const stateResult = cap.addListener("appStateChange", (state: { isActive: boolean }) => {
      lifecycleController.handleAppStateChange(state);
    });
    if (stateResult && typeof stateResult.then === "function") {
      stateResult.then((handle: any) => {
        if (handle && typeof handle.remove === "function") {
          removeState = () => handle.remove();
        }
      });
    } else if (stateResult && typeof stateResult.remove === "function") {
      removeState = () => stateResult.remove();
    }
  } catch {
    // Bỏ qua lỗi đăng ký plugin
  }

  return {
    backController,
    lifecycleController,
    cleanup: () => {
      removeBack?.();
      removeState?.();
    },
  };
}
