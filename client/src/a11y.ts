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
}

/**
 * Ngăn xếp quản lý thứ tự các modal đang mở
 */
export class ModalStack {
  private stack: ModalEntry[] = [];

  push(id: string, triggerEl?: HTMLElement | null): void {
    // Nếu modal đã có trong stack, đưa lên đỉnh
    this.remove(id);
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
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) =>
      !el.hidden && el.offsetParent !== null && window.getComputedStyle(el).display !== "none",
  );
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
  if (triggerEl && typeof triggerEl.focus === "function" && document.body.contains(triggerEl)) {
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

  return false;
}
