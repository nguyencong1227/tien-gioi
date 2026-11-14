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
  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }
  querySelector(sel: string) {
    const cls = sel.replace(".", "");
    return this.kids.find((k) => k.className === cls) ?? null;
  }
  append(...nodes: KeyLabelEl[]) {
    this.kids.push(...(nodes as El[]));
  }
}

function makeDoc(withIds: readonly string[], tagged: readonly El[] = []) {
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
    querySelectorAll: (sel) => (sel === "[data-key-action]" ? tagged : []),
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
    rebind("skill.sword", "KeyV");
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("V");
    expect(els.get("sk-sword")!.attrs.title).toBe("Phóng kiếm khí (V / 3 / K)");
    resetKeymap();
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("3");
    off();
    rebind("skill.sword", "KeyY");
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("3");
  });

  it("nút nhặt / nói chuyện / qua cổng / bản đồ ghi đúng phím tương tác và phím bản đồ (đổi phím thì đổi theo)", () => {
    const { doc, els } = makeDoc(["btn-pickup", "btn-talk", "btn-portal", "minimap-wrap"]);
    initKeyLabels(doc);
    expect(els.get("btn-pickup")!.attrs["aria-label"]).toBe("Nhặt vật phẩm rơi (Phím F)");
    expect(els.get("btn-portal")!.attrs.title).toBe("Đi qua cổng truyền tống (F)");
    expect(els.get("minimap-wrap")!.attrs.title).toBe("Bản đồ thế giới (M)");
    // nhãn phím (keycap) trên ba nút ngữ cảnh: nhãn nút M6 chỉ còn tên ngắn nên phím F phải hiện ở góc nút (cảm ứng: CSS ẩn)
    for (const id of ["btn-pickup", "btn-talk", "btn-portal"])
      expect(els.get(id)!.querySelector(".keycap")!.textContent, id).toBe("F");
    expect(els.get("minimap-wrap")!.querySelector(".keycap")).toBeNull();
    rebind("interact", "KeyE");
    for (const id of ["btn-pickup", "btn-talk", "btn-portal"])
      expect(els.get(id)!.querySelector(".keycap")!.textContent, id + " sau khi đổi phím").toBe(
        "E",
      );
    expect(els.get("btn-talk")!.attrs["aria-label"]).toBe("Nói chuyện với NPC (Phím E hoặc F)");
    expect(els.get("btn-talk")!.attrs.title).toBe("Nói chuyện với NPC (E / F)");
  });

  it("phần tử gắn data-key-action (chữ hướng dẫn tĩnh trong HTML) được điền phím CHÍNH và đổi theo", () => {
    const a = new El("b");
    a.attrs["data-key-action"] = "attack";
    const b = new El("b");
    b.attrs["data-key-action"] = "panel.quest";
    const bad = new El("b");
    bad.attrs["data-key-action"] = "constructor"; // id lạ: không điền, không văng lỗi
    bad.textContent = "giữ";
    const { doc } = makeDoc([], [a, b, bad]);
    initKeyLabels(doc);
    expect(a.textContent).toBe("Cách");
    expect(b.textContent).toBe("J");
    expect(bad.textContent).toBe("giữ");
    rebind("attack", "KeyV");
    expect(a.textContent).toBe("V");
    resetKeymap();
    expect(a.textContent).toBe("Cách");
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
    rebind("attack", "KeyV");
    expect(els.get("help")!.textContent).toContain("V chém");
  });
});
