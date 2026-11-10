// Quản lý PWA (Progressive Web App): kiểm tra cập nhật an toàn và xử lý ngoại tuyến.
// Không bao giờ tự động tải lại khi người chơi đang trong PK, bí cảnh, hoặc đang giao chiến.

export interface PwaGameState {
  /** Có đang trong trận PK thách đấu hay không */
  inDuel?: boolean;
  /** Có đang trong bí cảnh hay không */
  inDungeon?: boolean;
  /** Bản đồ hiện tại có phải bản đồ bí cảnh hay không */
  isDungeonMap?: boolean;
  /** Có đang ở Hoàng Tuyền / Tam Sinh Thạch hay không */
  inLimbo?: boolean;
  /** Có đang gục ngã (chết / chờ hồi sinh / chờ đưa ra) hay không */
  isDead?: boolean;
  /** Có đang chuyển map qua cổng truyền tống hay không */
  isTravelling?: boolean;
  /** Có đang trong giao tranh (vừa tấn công hoặc bị trừ máu gần đây) hay không */
  inCombat?: boolean;
}

/**
 * Kiểm tra xem client có thể tự động tải lại an toàn để cập nhật bản mới hay không.
 * Trả về false nếu người chơi đang ở trong tình huống căng thẳng không thể bị ngắt quãng.
 */
export function canReloadSafely(state: PwaGameState): boolean {
  if (state.inDuel) return false;
  if (state.inDungeon || state.isDungeonMap) return false;
  if (state.inLimbo) return false;
  if (state.isDead) return false;
  if (state.isTravelling) return false;
  if (state.inCombat) return false;
  return true;
}

export interface PwaManagerOptions {
  getGameState: () => PwaGameState;
  onUpdateReady: (applyUpdate: () => void, isSafe: boolean) => void;
  onOfflineChange?: (online: boolean) => void;
}

/**
 * Đăng ký Service Worker và quản lý chu trình cập nhật an toàn.
 */
export function setupPwa(options: PwaManagerOptions): {
  checkForUpdate: () => Promise<void>;
  applyUpdate: () => void;
} {
  let waitingWorker: ServiceWorker | null = null;
  let updatePending = false;

  const applyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { checkForUpdate: async () => {}, applyUpdate };
  }

  // Lắng nghe trạng thái mạng online / offline
  window.addEventListener("online", () => options.onOfflineChange?.(true));
  window.addEventListener("offline", () => options.onOfflineChange?.(false));

  // Khi có controller mới sau khi cập nhật (chỉ reload khi trước đó đã có controller cũ)
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");

      // Đã có worker đang chờ kích hoạt
      if (reg.waiting) {
        waitingWorker = reg.waiting;
        updatePending = true;
        const safe = canReloadSafely(options.getGameState());
        options.onUpdateReady(applyUpdate, safe);
      }

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorker = newWorker;
            updatePending = true;
            const safe = canReloadSafely(options.getGameState());
            options.onUpdateReady(applyUpdate, safe);
          }
        });
      });
    } catch {
      // Bỏ qua lỗi đăng ký service worker ở môi trường dev hoặc test
    }
  });

  const checkForUpdate = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (updatePending && waitingWorker) {
          const safe = canReloadSafely(options.getGameState());
          options.onUpdateReady(applyUpdate, safe);
        }
      }
    } catch {
      // Bỏ qua lỗi cập nhật nếu không có kết nối mạng
    }
  };

  return { checkForUpdate, applyUpdate };
}
