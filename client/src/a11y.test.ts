import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ModalStack, isTypingElement, processEscapeKey, type EscapeHandlers } from "./a11y";

describe("a11y: ModalStack", () => {
  it("quản lý thứ tự modal và cập nhật aria-expanded trên trigger", () => {
    const stack = new ModalStack();
    const trigger1 = {
      setAttribute: vi.fn(),
    } as unknown as HTMLElement;
    const trigger2 = {
      setAttribute: vi.fn(),
    } as unknown as HTMLElement;

    stack.push("inv-modal", trigger1);
    expect(stack.size()).toBe(1);
    expect(stack.peek()?.id).toBe("inv-modal");
    expect(trigger1.setAttribute).toHaveBeenCalledWith("aria-expanded", "true");

    stack.push("char-modal", trigger2);
    expect(stack.size()).toBe(2);
    expect(stack.peek()?.id).toBe("char-modal");
    expect(trigger2.setAttribute).toHaveBeenCalledWith("aria-expanded", "true");

    // Pop modal trên cùng
    const popped = stack.pop();
    expect(popped?.id).toBe("char-modal");
    expect(trigger2.setAttribute).toHaveBeenCalledWith("aria-expanded", "false");
    expect(stack.size()).toBe(1);
    expect(stack.peek()?.id).toBe("inv-modal");

    // Pop nốt modal còn lại
    const popped2 = stack.pop();
    expect(popped2?.id).toBe("inv-modal");
    expect(trigger1.setAttribute).toHaveBeenCalledWith("aria-expanded", "false");
    expect(stack.size()).toBe(0);
  });

  it("đưa modal lên đỉnh khi push lại modal đã có trong stack", () => {
    const stack = new ModalStack();
    stack.push("inv-modal");
    stack.push("char-modal");
    stack.push("inv-modal");

    expect(stack.size()).toBe(2);
    expect(stack.peek()?.id).toBe("inv-modal");
  });

  it("remove modal cụ thể ở giữa stack", () => {
    const stack = new ModalStack();
    const trigger = { setAttribute: vi.fn() } as unknown as HTMLElement;
    stack.push("inv-modal");
    stack.push("char-modal", trigger);
    stack.push("map-modal");

    const removed = stack.remove("char-modal");
    expect(removed?.id).toBe("char-modal");
    expect(trigger.setAttribute).toHaveBeenCalledWith("aria-expanded", "false");
    expect(stack.size()).toBe(2);
    expect(stack.peek()?.id).toBe("map-modal");
  });

  it("clear dọn sạch toàn bộ stack và tắt aria-expanded", () => {
    const stack = new ModalStack();
    const trigger = { setAttribute: vi.fn() } as unknown as HTMLElement;
    stack.push("inv-modal", trigger);
    stack.clear();

    expect(stack.size()).toBe(0);
    expect(trigger.setAttribute).toHaveBeenCalledWith("aria-expanded", "false");
  });
});

describe("a11y: isTypingElement", () => {
  it("nhận diện đúng các phần tử nhập văn bản", () => {
    const textInput = { tagName: "INPUT", type: "text" } as unknown as Element;
    const passInput = { tagName: "INPUT", type: "password" } as unknown as Element;
    const textarea = { tagName: "TEXTAREA" } as unknown as Element;
    const editableDiv = { tagName: "DIV", isContentEditable: true } as unknown as Element;

    expect(isTypingElement(textInput)).toBe(true);
    expect(isTypingElement(passInput)).toBe(true);
    expect(isTypingElement(textarea)).toBe(true);
    expect(isTypingElement(editableDiv)).toBe(true);
  });

  it("bỏ qua các nút và phần tử không phải gõ văn bản", () => {
    const checkbox = { tagName: "INPUT", type: "checkbox" } as unknown as Element;
    const radio = { tagName: "INPUT", type: "radio" } as unknown as Element;
    const button = { tagName: "BUTTON" } as unknown as Element;
    const regularDiv = { tagName: "DIV", isContentEditable: false } as unknown as Element;

    expect(isTypingElement(checkbox)).toBe(false);
    expect(isTypingElement(radio)).toBe(false);
    expect(isTypingElement(button)).toBe(false);
    expect(isTypingElement(regularDiv)).toBe(false);
    expect(isTypingElement(null)).toBe(false);
    expect(isTypingElement(undefined)).toBe(false);
  });
});

describe("a11y: processEscapeKey", () => {
  it("ưu tiên blur chat khi đang ở ô chat", () => {
    const handlers: EscapeHandlers = {
      blurChat: vi.fn(() => true),
      closeTopModal: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(true);
    expect(handlers.blurChat).toHaveBeenCalledTimes(1);
    expect(handlers.closeTopModal).not.toHaveBeenCalled();
  });

  it("không đóng modal khi đang gõ text trong form", () => {
    const handlers: EscapeHandlers = {
      isTyping: vi.fn(() => true),
      closeTopModal: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(false);
    expect(handlers.closeTopModal).not.toHaveBeenCalled();
  });

  it("đóng hộp xác nhận tông môn trước khi đóng bảng tông môn", () => {
    const handlers: EscapeHandlers = {
      closeSectActionConfirm: vi.fn(() => true),
      closeTopModal: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(true);
    expect(handlers.closeSectActionConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.closeTopModal).not.toHaveBeenCalled();
  });

  it("đóng hộp xác nhận giải tán tông môn", () => {
    const handlers: EscapeHandlers = {
      closeSectDisbandConfirm: vi.fn(() => true),
      closeTopModal: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(true);
    expect(handlers.closeSectDisbandConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.closeTopModal).not.toHaveBeenCalled();
  });

  it("đóng hộp xác nhận rời bí cảnh", () => {
    const handlers: EscapeHandlers = {
      closeDhudLeaveConfirm: vi.fn(() => true),
      closeTopModal: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(true);
    expect(handlers.closeDhudLeaveConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.closeTopModal).not.toHaveBeenCalled();
  });

  it("đóng hộp xác nhận đầu hàng PK", () => {
    const handlers: EscapeHandlers = {
      closeDuelYieldConfirm: vi.fn(() => true),
      closeTopModal: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(true);
    expect(handlers.closeDuelYieldConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.closeTopModal).not.toHaveBeenCalled();
  });

  it("đóng menu người chơi khi mở", () => {
    const handlers: EscapeHandlers = {
      closePlayerMenu: vi.fn(() => true),
      closeTopModal: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(true);
    expect(handlers.closePlayerMenu).toHaveBeenCalledTimes(1);
    expect(handlers.closeTopModal).not.toHaveBeenCalled();
  });

  it("đóng hộp thoại NPC khi mở", () => {
    const handlers: EscapeHandlers = {
      closeDialog: vi.fn(() => true),
      closeTopModal: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(true);
    expect(handlers.closeDialog).toHaveBeenCalledTimes(1);
    expect(handlers.closeTopModal).not.toHaveBeenCalled();
  });

  it("đóng bảng trên cùng khi không có popup con", () => {
    const handlers: EscapeHandlers = {
      closeTopModal: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(true);
    expect(handlers.closeTopModal).toHaveBeenCalledTimes(1);
  });

  it("đóng hộp mời khi không có bảng nào mở", () => {
    const handlers: EscapeHandlers = {
      closeInviteBox: vi.fn(() => true),
    };
    const result = processEscapeKey(handlers);
    expect(result).toBe(true);
    expect(handlers.closeInviteBox).toHaveBeenCalledTimes(1);
  });

  it("trả về false khi không có gì để đóng", () => {
    const handlers: EscapeHandlers = {};
    const result = processEscapeKey(handlers);
    expect(result).toBe(false);
  });
});

describe("a11y: Cấu trúc HTML & ARIA trong client/index.html", () => {
  const htmlPath = path.resolve(__dirname, "../index.html");
  const html = readFileSync(htmlPath, "utf-8");

  it("mọi modal chính đều có role=dialog hoặc role=alertdialog và aria-modal=true", () => {
    const requiredModals = [
      "inv-modal",
      "char-modal",
      "forge-modal",
      "shop-modal",
      "settings-modal",
      "dialog-modal",
      "quest-modal",
      "map-modal",
      "sect-modal",
      "dungeon-end-modal",
      "duel-end-modal",
      "player-menu",
      "limbo-overlay",
      "outdated-modal",
    ];

    for (const id of requiredModals) {
      const match = html.match(new RegExp(`<[^>]*id=["']${id}["'][^>]*>`, "s"));
      expect(match, `Không tìm thấy thẻ có id="${id}"`).toBeTruthy();
      const tag = match![0];
      const hasRole = tag.includes('role="dialog"') || tag.includes('role="alertdialog"');
      expect(hasRole, `Modal "${id}" phải có role="dialog" hoặc "alertdialog"`).toBe(true);
      expect(tag, `Modal "${id}" phải có aria-modal="true"`).toContain('aria-modal="true"');
      expect(tag, `Modal "${id}" phải có aria-labelledby`).toContain("aria-labelledby");
    }
  });

  it("các hộp xác nhận và lời mời đều có role=alertdialog", () => {
    const alertboxes = [
      "sect-action-confirm",
      "sect-disband-confirm",
      "party-invite-box",
      "dungeon-invite-box",
      "duel-invite-box",
      "sect-invite-box",
    ];

    for (const id of alertboxes) {
      const match = html.match(new RegExp(`<[^>]*id=["']${id}["'][^>]*>`, "s"));
      expect(match, `Không tìm thấy thẻ có id="${id}"`).toBeTruthy();
      const tag = match![0];
      expect(tag, `Hộp "${id}" phải có role="alertdialog"`).toContain('role="alertdialog"');
      expect(tag, `Hộp "${id}" phải có aria-modal="true"`).toContain('aria-modal="true"');
    }
  });

  it("các nút đóng modal ✕ đều có aria-label thân thiện", () => {
    const closeBtns = [
      "inv-close",
      "char-close",
      "forge-close",
      "shop-close",
      "settings-close",
      "dlg-close",
      "quest-close",
      "map-close",
      "sect-close",
      "pm-close",
    ];

    for (const id of closeBtns) {
      const match = html.match(new RegExp(`<button[^>]*id=["']${id}["'][^>]*>`, "s"));
      expect(match, `Không tìm thấy nút đóng "${id}"`).toBeTruthy();
      const tag = match![0];
      expect(tag, `Nút đóng "${id}" phải có aria-label`).toContain("aria-label=");
    }
  });

  it("chat-log, reconnect-banner, toast có cấu trúc ARIA live region đúng chuẩn", () => {
    expect(html).toContain('id="chat-log"');
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-relevant="additions"');

    expect(html).toContain('id="reconnect-banner"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');

    expect(html).toContain('id="toast"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("các nút quickbar và kỹ năng đều có aria-label", () => {
    const actionBtns = ["quick-1", "quick-2", "sk-break", "sk-med", "sk-sword", "sk-slash"];
    for (const id of actionBtns) {
      const match = html.match(new RegExp(`<button[^>]*id=["']${id}["'][^>]*>`, "s"));
      expect(match, `Không tìm thấy nút "${id}"`).toBeTruthy();
      expect(match![0], `Nút "${id}" phải có aria-label`).toContain("aria-label=");
    }
  });
});
