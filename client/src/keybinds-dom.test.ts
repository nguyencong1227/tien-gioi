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
    expect(cap("sk-slash").textContent).toBe("J");
    expect(cap("sk-sword").textContent).toBe("K");
    expect(cap("sk-med").textContent).toBe("Z");
    expect(cap("sk-break").textContent).toBe("V");
    expect(cap("btn-target").textContent).toBe("Tab");
    expect(cap("btn-quest").textContent).toBe("N");
    expect(cap("btn-bag").textContent).toBe("B");
    expect(cap("sk-sword").attrs["aria-hidden"]).toBe("true");
    expect(els.get("sk-sword")!.attrs.title).toBe("Phóng kiếm khí (K / 3)");
    expect(els.get("sk-sword")!.attrs["aria-label"]).toBe("Phóng kiếm khí (Phím K hoặc 3)");
    expect(els.get("sk-slash")!.attrs.title).toBe("Kiếm chém tấn công (J / Cách)");
    expect(els.get("btn-quest")!.attrs.title).toBe("Sổ nhiệm vụ (N / Q)");
  });

  it("bốn ô chiêu 2-5 có keycap L U I O và tên nói rõ chưa có chiêu (QUYET_DINH_M3 mục 17.1)", () => {
    const { doc, els } = makeDoc(HUD_KEYS.map((k) => k.id));
    applyKeyLabels(doc);
    const caps = [2, 3, 4, 5].map(
      (n) => els.get(`sk-slot${n}`)!.querySelector(".keycap")!.textContent,
    );
    expect(caps).toEqual(["L", "U", "I", "O"]);
    expect(els.get("sk-slot2")!.attrs.title).toBe("Ô chiêu thức 2, chưa có chiêu (L)");
    expect(els.get("sk-slot5")!.attrs["aria-label"]).toBe("Ô chiêu thức 5, chưa có chiêu (Phím O)");
  });

  it("ô đan dược dùng .qkey có sẵn (không thêm keycap), nút âm thanh / cài đặt chỉ ghi title", () => {
    const { doc, els } = makeDoc(HUD_KEYS.map((k) => k.id));
    applyKeyLabels(doc);
    expect(els.get("quick-1")!.querySelector(".qkey")!.textContent).toBe("1");
    expect(els.get("quick-2")!.querySelector(".qkey")!.textContent).toBe("2");
    expect(els.get("quick-1")!.querySelector(".keycap")).toBeNull();
    expect(els.get("btn-mute")!.querySelector(".keycap")).toBeNull();
    expect(els.get("btn-settings")!.attrs.title).toBe("Cài đặt và phím tắt (E)");
    expect(els.get("btn-mute")!.attrs.title).toBe("Bật hoặc tắt âm thanh (0)");
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
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("K");
    rebind("skill.sword", "Digit9");
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("9");
    expect(els.get("sk-sword")!.attrs.title).toBe("Phóng kiếm khí (9 / K / 3)");
    resetKeymap();
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("K");
    off();
    rebind("skill.sword", "Digit8");
    expect(els.get("sk-sword")!.querySelector(".keycap")!.textContent).toBe("K");
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
    rebind("interact", "Digit9");
    for (const id of ["btn-pickup", "btn-talk", "btn-portal"])
      expect(els.get(id)!.querySelector(".keycap")!.textContent, id + " sau khi đổi phím").toBe(
        "9",
      );
    expect(els.get("btn-talk")!.attrs["aria-label"]).toBe("Nói chuyện với NPC (Phím 9 hoặc F)");
    expect(els.get("btn-talk")!.attrs.title).toBe("Nói chuyện với NPC (9 / F)");
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
    expect(a.textContent).toBe("J");
    expect(b.textContent).toBe("N");
    expect(bad.textContent).toBe("giữ");
    rebind("attack", "Digit9");
    expect(a.textContent).toBe("9");
    resetKeymap();
    expect(a.textContent).toBe("J");
  });

  it("mọi nút HUD trỏ tới một hành động có thật", () => {
    for (const k of HUD_KEYS) expect(ACTION_BY_ID[k.action], k.id).toBeDefined();
  });

  it("dòng gợi ý đầu màn hình: phím mới (J chém, Tab mục tiêu, K kiếm khí, Z đả tọa, B túi, N nhiệm vụ), không còn Cách chém / J nhiệm vụ", () => {
    const t = helpStripText(DEFAULT_KEYMAP);
    expect(t).toContain("J chém");
    expect(t).toContain("Tab mục tiêu");
    expect(t).toContain("K kiếm khí");
    expect(t).toContain("Z đả tọa");
    expect(t).toContain("1/2 đan");
    expect(t).toContain("B túi");
    expect(t).toContain("N nhiệm vụ");
    expect(t).toContain("E cài đặt");
    expect(t).toContain("Enter chat");
    expect(t).not.toContain("Cách chém");
    expect(t).not.toContain("J nhiệm vụ");
  });

  it("applyKeyLabels ghi dòng gợi ý vào #help và đổi theo khi người chơi đổi phím", () => {
    const { doc, els } = makeDoc(["help", "sk-slash"]);
    initKeyLabels(doc);
    expect(els.get("help")!.textContent).toContain("J chém");
    rebind("attack", "Digit9");
    expect(els.get("help")!.textContent).toContain("9 chém");
  });
});
