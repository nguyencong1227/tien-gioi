/**
 * Mô-đun Trợ năng (Accessibility & Usability, M4 M4-sớm, Issue #269)
 * Quản lý ngăn xếp modal (ModalStack), phím Escape đóng bảng trên cùng,
 * chuyển focus vào modal khi mở và trả focus khi đóng, trap focus.
 */

export interface ModalEntry {
  id: string;
  triggerEl?: HTMLElement | null;
}

export interface EscapeHandlers {
  isTyping?: () => boolean;
  blurChat?: () => boolean;
  closeSectActionConfirm?: () => boolean;
  closeSectDisbandConfirm?: () => boolean;
  closeDhudLeaveConfirm?: () => boolean;
  closeDuelYieldConfirm?: () => boolean;
  closePlayerMenu?: () => boolean;
  closeDialog?: () => boolean;
  closeDuelEndModal?: () => boolean;
  closeDungeonEndModal?: () => boolean;
  closeTopModal?: () => boolean;
  closeInviteBox?: () => boolean;
  /** Bước CUỐI (không còn gì để đóng): bỏ chọn mục tiêu (QUYET_DINH_M3 mục 13, #463) */
  clearTarget?: () => boolean;
}

/**
 * Ngăn xếp quản lý thứ tự các modal đang mở
 */
export class ModalStack {
  private stack: ModalEntry[] = [];

  push(id: string, triggerEl?: HTMLElement | null): void {
    // Nếu modal đã có trong stack, đưa lên đỉnh
    this.remove(id);
    // Chỉ trả focus về nút khi chính nút đó đang giữ focus lúc mở (người dùng Tab tới rồi bấm Enter / Space). Mở bằng phím tắt (I, C...)
    // hay bằng chuột thì KHÔNG: nếu không, focus nằm trên nút HUD và phím Space (chém) bị `bindTap` biến thành "bấm nút" mở lại bảng.
    if (triggerEl?.dataset)
      triggerEl.dataset.a11yRestore = document.activeElement === triggerEl ? "1" : "";
    this.stack.push({ id, triggerEl });
    if (triggerEl && typeof triggerEl.setAttribute === "function") {
      triggerEl.setAttribute("aria-expanded", "true");
    }
  }

  pop(): ModalEntry | undefined {
    const entry = this.stack.pop();
    if (entry?.triggerEl && typeof entry.triggerEl.setAttribute === "function") {
      entry.triggerEl.setAttribute("aria-expanded", "false");
    }
    return entry;
  }

  peek(): ModalEntry | undefined {
    return this.stack[this.stack.length - 1];
  }

  remove(id: string): ModalEntry | undefined {
    const idx = this.stack.findIndex((m) => m.id === id);
    if (idx !== -1) {
      const [removed] = this.stack.splice(idx, 1);
      if (removed?.triggerEl && typeof removed.triggerEl.setAttribute === "function") {
        removed.triggerEl.setAttribute("aria-expanded", "false");
      }
      return removed;
    }
    return undefined;
  }

  size(): number {
    return this.stack.length;
  }

  clear(): void {
    while (this.stack.length > 0) {
      this.pop();
    }
  }

  getEntries(): ModalEntry[] {
    return [...this.stack];
  }
}

export const modalStack = new ModalStack();

/**
 * Kiểm tra xem người dùng có đang gõ văn bản trong input / textarea không
 */
export function isTypingElement(el?: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") {
    // Checkbox và radio không coi là đang nhập văn bản
    const type = (el as HTMLInputElement).type?.toLowerCase();
    if (type === "checkbox" || type === "radio" || type === "button" || type === "submit") {
      return false;
    }
    return true;
  }
  return Boolean((el as HTMLElement).isContentEditable);
}

/**
 * Lấy danh sách các phần tử có thể nhận focus bên trong một container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    if (el.hidden) return false;
    // Kiểm tra hiển thị: không dùng offsetParent vì phần tử position: fixed có offsetParent === null
    if (typeof el.getClientRects === "function" && el.getClientRects().length === 0) return false;
    if (typeof window !== "undefined" && window.getComputedStyle) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  });
}

/**
 * Đưa focus vào modal: ưu tiên nút đóng hoặc input/button đầu tiên, fallback vào chính modal
 */
export function focusModal(modalEl: HTMLElement | null): void {
  if (!modalEl) return;
  const focusables = getFocusableElements(modalEl);
  if (focusables.length > 0) {
    // Ưu tiên input autofocus hoặc input đầu tiên nếu là form
    const autofocusEl = focusables.find((el) => el.hasAttribute("autofocus"));
    if (autofocusEl) {
      autofocusEl.focus();
      return;
    }
    // Hoặc nút đóng
    const closeBtn = focusables.find(
      (el) => el.classList.contains("modal-close") || el.classList.contains("pm-close"),
    );
    if (closeBtn) {
      closeBtn.focus();
      return;
    }
    focusables[0].focus();
  } else {
    modalEl.focus();
  }
}

/**
 * Trả focus về trigger element đã mở modal, hoặc canvas của game
 */
export function returnFocus(triggerEl?: HTMLElement | null): void {
  if (
    triggerEl &&
    triggerEl.dataset?.a11yRestore === "1" &&
    typeof triggerEl.focus === "function" &&
    document.body.contains(triggerEl)
  ) {
    triggerEl.focus();
    return;
  }
  // Fallback: focus vào canvas game
  const canvas = document.querySelector("#game canvas, canvas") as HTMLElement | null;
  if (canvas && typeof canvas.focus === "function") {
    canvas.focus();
  }
}

/**
 * Giữ focus bên trong modal (Focus Trap)
 */
export function trapTabKey(container: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key !== "Tab") return false;
  const focusables = getFocusableElements(container);
  if (focusables.length === 0) {
    e.preventDefault();
    return true;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first || !container.contains(document.activeElement)) {
      e.preventDefault();
      last.focus();
      return true;
    }
  } else {
    if (document.activeElement === last || !container.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
      return true;
    }
  }
  return false;
}

/**
 * Xử lý phím Escape theo thứ tự ưu tiên các tầng modal/dialog:
 * 1. Nếu đang gõ ở ô chat: blur ô chat, trả focus về canvas (không đóng modal).
 * 2. Hộp xác nhận hành động con (Sect Action Confirm, Disband Confirm, Dhud Leave, Duel Yield) -> Huỷ.
 * 3. Menu người chơi (Player Menu) / Hộp thoại NPC (Dialog Modal).
 * 4. Modal kết quả PK / Bí cảnh.
 * 5. Modal chính trên cùng (ModalStack) -> đóng modal đó và trả focus về trigger.
 * 6. Lời mời tổ đội / bí cảnh / thách đấu / tông môn.
 * 7. Không còn gì để đóng: bỏ chọn mục tiêu (nếu có).
 */
export function processEscapeKey(handlers: EscapeHandlers): boolean {
  // 1. Nếu đang nhập liệu trong ô chat: blur ô chat
  if (handlers.blurChat?.()) {
    return true;
  }

  // 2. Nếu đang nhập liệu trong input/textarea khác: không đóng modal chính nếu đang gõ
  if (handlers.isTyping?.()) {
    return false;
  }

  // 3. Hộp xác nhận hành động con (bấm Esc = Huỷ, an toàn)
  if (handlers.closeSectActionConfirm?.()) return true;
  if (handlers.closeSectDisbandConfirm?.()) return true;
  if (handlers.closeDhudLeaveConfirm?.()) return true;
  if (handlers.closeDuelYieldConfirm?.()) return true;

  // 4. Menu người chơi hoặc hộp thoại NPC
  if (handlers.closePlayerMenu?.()) return true;
  if (handlers.closeDialog?.()) return true;

  // 5. Modal kết quả
  if (handlers.closeDuelEndModal?.()) return true;
  if (handlers.closeDungeonEndModal?.()) return true;

  // 6. Modal chính trên cùng
  if (handlers.closeTopModal?.()) return true;

  // 7. Lời mời
  if (handlers.closeInviteBox?.()) return true;

  // 8. Không còn gì để đóng: Esc bỏ chọn mục tiêu đang khoá
  if (handlers.clearTarget?.()) return true;

  return false;
}

export const NEWBIE_GUIDE_STORAGE_KEY = "tg_newbie_guide_dismissed";
export const REDUCED_MOTION_STORAGE_KEY = "tg_reduced_motion";

/**
 * Kiểm tra xem người dùng có kích hoạt chế độ giảm chuyển động không
 * (ưu tiên cài đặt thủ công trong game tg_reduced_motion, sau đó fallback theo prefers-reduced-motion của OS)
 */
export function isReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const userPref = localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
    if (userPref === "1") return true;
    if (userPref === "0") return false;
  } catch {
    /* localStorage bị chặn trong chế độ duyệt web ẩn danh */
  }
  return Boolean(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
}

/**
 * Đồng bộ class trên document.body theo cài đặt giảm chuyển động:
 * - body.reduced-motion: khi bật (trong game = 1 hoặc OS bật mà chưa cài đặt).
 * - body.motion-ok: khi người chơi chủ động tắt trong game (= 0), giúp loại trừ khỏi media query prefers-reduced-motion.
 */
export function syncReducedMotionDom(): void {
  if (typeof document === "undefined") return;
  const reduced = isReducedMotion();
  document.body.classList.toggle("reduced-motion", reduced);
  let userPref: string | null = null;
  try {
    userPref = localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  document.body.classList.toggle("motion-ok", userPref === "0");
}

/**
 * Cập nhật cấu hình giảm chuyển động vào localStorage và toggle class trên body
 */
export function setReducedMotionPref(enabled: boolean): void {
  try {
    localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  syncReducedMotionDom();
}

/**
 * Kiểm tra xem có cần hiển thị bảng chỉ dẫn người mới không
 */
export function shouldShowNewbieGuide(): boolean {
  try {
    return localStorage.getItem(NEWBIE_GUIDE_STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}

/**
 * Ghi nhớ đã đóng bảng chỉ dẫn người mới
 */
export function markNewbieGuideDismissed(): void {
  try {
    localStorage.setItem(NEWBIE_GUIDE_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}
