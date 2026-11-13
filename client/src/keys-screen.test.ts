import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIONS,
  DEFAULT_KEYMAP,
  FIXED_KEYS,
  RESERVED_CODES,
  _resetKeymapCache,
  getKeymap,
  holderOf,
  primaryKeyLabel,
  rebind,
  resetKeymap,
  tokenOfEvent,
} from "./keybinds";
import { GROUP_TITLE, captureOutcome, keysScreenModel } from "./keys-screen";

const ev = (code: string, extra: Record<string, unknown> = {}) => ({ code, ...extra });

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  _resetKeymapCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  _resetKeymapCache();
});

describe("tokenOfEvent: phím bấm lúc chờ gán (#463)", () => {
  it("phím thường -> mã vị trí vật lý, không phụ thuộc bộ gõ", () => {
    expect(tokenOfEvent(ev("KeyX"))).toBe("KeyX");
    expect(tokenOfEvent(ev("Digit7"))).toBe("Digit7");
    expect(tokenOfEvent(ev("Space"))).toBe("Space");
    expect(tokenOfEvent(ev("F5"))).toBe("F5");
  });
  it("chỉ bấm phím bổ trợ (Shift, Ctrl, Alt, Meta, CapsLock) thì chưa phải phím để gán", () => {
    for (const c of ["ShiftLeft", "ShiftRight", "ControlLeft", "AltRight", "MetaLeft", "CapsLock"])
      expect(tokenOfEvent(ev(c))).toBeNull();
  });
  it("Ctrl / Alt / Meta đi kèm = phím tắt của trình duyệt: không gán", () => {
    expect(tokenOfEvent(ev("KeyR", { ctrlKey: true }))).toBeNull();
    expect(tokenOfEvent(ev("KeyF", { altKey: true }))).toBeNull();
    expect(tokenOfEvent(ev("KeyW", { metaKey: true }))).toBeNull();
  });
  it("Shift chỉ được giữ cho Tab (Shift+Tab); phím khác kèm Shift là phím thường", () => {
    expect(tokenOfEvent(ev("Tab", { shiftKey: true }))).toBe("Shift+Tab");
    expect(tokenOfEvent(ev("KeyR", { shiftKey: true }))).toBe("KeyR");
    expect(tokenOfEvent(ev("Digit3", { shiftKey: true }))).toBe("Digit3");
  });
  it("sự kiện không có mã phím (bộ gõ / ô nhập tự động) bị bỏ qua", () => {
    expect(tokenOfEvent(ev(""))).toBeNull();
  });
});

describe("holderOf / primaryKeyLabel", () => {
  it("holderOf: hành động đang giữ phím, kể cả phím phụ; phím tự do -> null", () => {
    expect(holderOf("Digit3")).toBe("skill.sword");
    expect(holderOf("KeyK")).toBe("skill.sword");
    expect(holderOf("Shift+Tab")).toBe("target.prev");
    expect(holderOf("KeyX")).toBeNull();
  });
  it("primaryKeyLabel đổi theo bảng phím hiện hành (chữ gợi ý trong game không lệch phím thật)", () => {
    expect(primaryKeyLabel("interact")).toBe("F");
    expect(primaryKeyLabel("attack")).toBe("Cách");
    rebind("interact", "KeyE");
    expect(primaryKeyLabel("interact")).toBe("E");
    resetKeymap();
    expect(primaryKeyLabel("interact")).toBe("F");
  });
});

describe("keysScreenModel", () => {
  it("liệt kê MỌI hành động đúng một lần, gom theo nhóm, nhóm có tên tiếng Việt", () => {
    const groups = keysScreenModel(DEFAULT_KEYMAP);
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids.slice().sort()).toEqual(ACTIONS.map((a) => a.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of groups) {
      expect(g.title).toBe(GROUP_TITLE[g.group]);
      expect(g.title.length).toBeGreaterThan(0);
    }
    expect(groups.map((g) => g.group)).toEqual(["combat", "interact", "panel", "other"]);
  });
  it("mỗi dòng có nhãn phím (chính trước); mặc định thì không dòng nào 'custom'", () => {
    const rows = keysScreenModel(DEFAULT_KEYMAP).flatMap((g) => g.rows);
    expect(rows.every((r) => r.keys.length > 0 && !r.custom)).toBe(true);
    const sword = rows.find((r) => r.id === "skill.sword");
    expect(sword?.keys).toEqual(["3", "K"]);
    const quest = rows.find((r) => r.id === "panel.quest");
    expect(quest?.keys).toEqual(["J", "Q"]);
  });
  it("sau khi đổi phím: dòng đó 'custom', dòng khác không", () => {
    rebind("skill.sword", "KeyX");
    const rows = keysScreenModel(getKeymap()).flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === "skill.sword")).toMatchObject({
      keys: ["X", "3", "K"],
      custom: true,
    });
    expect(rows.filter((r) => r.custom).map((r) => r.id)).toEqual(["skill.sword"]);
  });
  it("phím cố định có mô tả và nhắc cả mũi tên lẫn WASD, Esc, phím số hội thoại", () => {
    const all = FIXED_KEYS.map((k) => k.keys + " " + k.what).join(" | ");
    expect(all).toMatch(/W A S D/);
    expect(all).toMatch(/Esc/);
    expect(all).toMatch(/1 - 9/);
  });
});

describe("captureOutcome: quyết định khi bấm phím lúc chờ gán", () => {
  const map = () => getKeymap();

  it("Esc = huỷ, không đổi gì", () => {
    expect(captureOutcome("attack", ev("Escape"), map()).kind).toBe("cancel");
  });
  it("chỉ bấm Shift hoặc phím giữ lặp (Enter / Cách vừa bấm để bắt đầu) thì bỏ qua", () => {
    expect(captureOutcome("attack", ev("ShiftLeft"), map()).kind).toBe("ignore");
    expect(captureOutcome("attack", ev("Enter", { repeat: true }), map()).kind).toBe("ignore");
    expect(captureOutcome("attack", ev("Space", { repeat: true }), map()).kind).toBe("ignore");
  });
  it("phím cố định (WASD, mũi tên) bị từ chối kèm lời giải thích, KHÔNG gán", () => {
    for (const c of RESERVED_CODES) {
      if (c === "Escape") continue;
      const r = captureOutcome("attack", ev(c), map());
      expect(r.kind, c).toBe("reject");
      if (r.kind === "reject") expect(r.message).toMatch(/cố định/);
    }
  });
  it("phím tự do -> bind, lời nhắn có tên hành động và phím", () => {
    const r = captureOutcome("skill.sword", ev("KeyX"), map());
    expect(r).toEqual({
      kind: "bind",
      token: "KeyX",
      message: "Kiếm khí: X.",
    });
  });
  it("lấy phím DUY NHẤT của hành động khác: báo hoán đổi, đúng như rebind làm", () => {
    // Digit1 là phím duy nhất của đan ô 1; Kiếm khí đang giữ 3
    const r = captureOutcome("skill.sword", ev("Digit1"), map());
    expect(r.kind).toBe("bind");
    if (r.kind !== "bind") return;
    expect(r.message).toContain("Đan dược ô 1");
    expect(r.message).toContain("đổi sang 3");
    expect(rebind("skill.sword", r.token)).toBe(true);
    expect(getKeymap()["quick.1"]).toEqual(["Digit3"]); // đúng như lời nhắn: đan ô 1 nhận phím 3
    expect(getKeymap()["skill.sword"][0]).toBe("Digit1");
  });
  it("lấy phím PHỤ của hành động khác (hành động đó còn phím khác): báo 'mất phím này'", () => {
    // KeyQ là phím phụ của Sổ nhiệm vụ (còn J)
    const r = captureOutcome("attack", ev("KeyQ"), map());
    expect(r.kind).toBe("bind");
    if (r.kind === "bind") expect(r.message).toContain("mất phím này");
  });
  it("phím đã là phím chính của chính hành động đó: nói rõ, không làm gì thêm", () => {
    const r = captureOutcome("interact", ev("KeyF"), map());
    expect(r.kind).toBe("bind");
    if (r.kind === "bind") expect(r.message).toContain("vốn đã là phím chính");
  });
  it("Shift+Tab gán được (cho hành động khác thì hoán đổi vì là phím duy nhất của 'mục tiêu trước')", () => {
    const r = captureOutcome("attack", ev("Tab", { shiftKey: true }), map());
    expect(r.kind).toBe("bind");
    if (r.kind === "bind") {
      expect(r.token).toBe("Shift+Tab");
      expect(r.message).toContain("Mục tiêu trước");
    }
  });
});
