import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HUD_KEYS,
  applyKeyLabels,
  helpStripText,
  initKeyLabels,
  type KeyLabelDoc,
  type KeyLabelEl,
} from "./keybinds-dom";
import { ACTION_BY_ID, DEFAULT_KEYMAP, _resetKeymapCache, rebind, resetKeymap } from "./keybinds";

class El implements KeyLabelEl {
  attrs: Record<string, string> = {};
  kids: El[] = [];
  textContent: string | null = "";
  className = "";
  constructor(readonly tag = "div") {}
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
  querySelector(sel: string) {
    const cls = sel.replace(".", "");
    return this.kids.find((k) => k.className === cls) ?? null;
  }
  append(...nodes: KeyLabelEl[]) {
    this.kids.push(...(nodes as El[]));
  }
}

function makeDoc(withIds: readonly string[]) {
  const els = new Map<string, El>();
  for (const id of withIds) {
    const e = new El("button");
    if (id.startsWith("quick-")) {
      const q = new El("span");
      q.className = "qkey";
      q.textContent = "?";
      e.kids.push(q);
    }
    els.set(id, e);
  }
  const doc: KeyLabelDoc = {
    getElementById: (id) => els.get(id) ?? null,
    createElement: (tag) => new El(tag),
  };
  return { doc, els };
}

describe("nhãn phím HUD (#463)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    _resetKeymapCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetKeymapCache();
  });

  it("mỗi nút kỹ năng có thẻ keycap đúng phím chính; title và aria-label ghi đủ phím", () => {
    const { doc, els } = makeDoc(HUD_KEYS.map((k) => k.id));
    applyKeyLabels(doc);
    const cap = (id: string) => els.get(id)!.querySelector(".keycap")!;
    expect(cap("sk-slash").textContent).toBe("Cách");
    expect(cap("sk-sword").textContent).toBe("3");
    expect(cap("sk-med").textContent).toBe("4");
    expect(cap("sk-break").textContent).toBe("B");
    expect(cap("btn-target").textContent).toBe("Tab");
    expect(cap("btn-quest").textContent).toBe("J");
    expect(cap("sk-sword").attrs["aria-hidden"]).toBe("true");
    expect(els.get("sk-sword")!.attrs.title).toBe("Phóng kiếm khí (3 / K)");
    expect(els.get("sk-sword")!.attrs["aria-label"]).toBe("Phóng kiếm khí (Phím 3 hoặc K)");
    expect(els.get("btn-quest")!.attrs.title).toBe("Sổ nhiệm vụ (J / Q)");
  });

  it("ô đan dược dùng .qkey có sẵn (không thêm keycap), nút âm thanh / cài đặt chỉ ghi title", () => {
    const { doc, els } = makeDoc(HUD_KEYS.map((k) => k.id));
    applyKeyLabels(doc);
    expect(els.get("quick-1")!.querySelector(".qkey")!.textContent).toBe("1");
    expect(els.get("quick-2")!.querySelector(".qkey")!.textContent).toBe("2");
    expect(els.get("quick-1")!.querySelector(".keycap")).toBeNull();
    expect(els.get("btn-mute")!.querySelector(".keycap")).toBeNull();
    expect(els.get("btn-settings")!.attrs.title).toBe("Cài đặt và phím tắt (O)");
  });

  it("gọi lại không nhân đôi thẻ keycap; nút vắng mặt thì bỏ qua", () => {
    const { doc, els } = makeDoc(["sk-slash"]);
    applyKeyLabels(doc);
    applyKeyLabels(doc);
    expect(els.get("sk-slash")!.kids.filter((k) => k.className === "keycap")).toHaveLength(1);
  });

  it("đổi phím thì nhãn đổi theo (initKeyLabels vẽ lại), reset thì về mặc định", () => {
    const { doc, els } = makeDoc(HUD_KEYS.map((k) => k.id));
    const off = initKeyLabels(doc);
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("3");
    rebind("skill.sword", "KeyX");
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("X");
    expect(els.get("sk-sword")!.attrs.title).toBe("Phóng kiếm khí (X / 3 / K)");
    resetKeymap();
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("3");
    off();
    rebind("skill.sword", "KeyY");
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("3");
  });

  it("mọi nút HUD trỏ tới một hành động có thật", () => {
    for (const k of HUD_KEYS) expect(ACTION_BY_ID[k.action], k.id).toBeDefined();
  });

  it("dòng gợi ý đầu màn hình: phím mới (Cách chém, Tab mục tiêu, 3 kiếm khí, J nhiệm vụ), không còn J chém", () => {
    const t = helpStripText(DEFAULT_KEYMAP);
    expect(t).toContain("Cách chém");
    expect(t).toContain("Tab mục tiêu");
    expect(t).toContain("3 kiếm khí");
    expect(t).toContain("4 đả tọa");
    expect(t).toContain("1/2 đan");
    expect(t).toContain("J nhiệm vụ");
    expect(t).toContain("Enter chat");
    expect(t).not.toContain("J chém");
  });

  it("applyKeyLabels ghi dòng gợi ý vào #help và đổi theo khi người chơi đổi phím", () => {
    const { doc, els } = makeDoc(["help", "sk-slash"]);
    initKeyLabels(doc);
    expect(els.get("help")!.textContent).toContain("Cách chém");
    rebind("attack", "KeyX");
    expect(els.get("help")!.textContent).toContain("X chém");
  });
});
