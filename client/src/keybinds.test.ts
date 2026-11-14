import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIONS,
  ACTION_BY_ID,
  SKILL_SLOTS,
  DEFAULT_KEYMAP,
  KEYMAP_STORAGE_KEY,
  RESERVED_CODES,
  _resetKeymapCache,
  actionOfEvent,
  buildLookup,
  diffFromDefault,
  getKeymap,
  getLookup,
  isValidToken,
  keyLabel,
  keyLabels,
  onKeymapChange,
  rebind,
  resetKeymap,
  sanitizeKeymap,
  type ActionId,
} from "./keybinds";

const ev = (code: string, extra: Record<string, boolean> = {}) => ({ code, ...extra });
const lookup = () => buildLookup(DEFAULT_KEYMAP);

describe("phím ẩn toàn bộ giao diện (QUYET_DINH_M3 mục 15)", () => {
  it("H = ui.toggle, chạy cả khi bảng đang mở (không phải hành động của thế giới), nằm ở màn Phím tắt (ACTIONS)", () => {
    expect(actionOfEvent(ev("KeyH"), lookup())).toBe("ui.toggle");
    expect(ACTION_BY_ID["ui.toggle"].world).toBe(false);
    expect(ACTION_BY_ID["ui.toggle"].label).toMatch(/giao diện/);
    expect(ACTIONS.map((a) => a.id)).toContain("ui.toggle");
  });
});

describe("bảng phím mặc định (QUYET_DINH_M3 mục 13)", () => {
  it("cụm phải J K L U I O (QUYET_DINH_M3 mục 17.1): J chém, K kiếm khí, L U I O = ô chiêu 2-5", () => {
    const l = lookup();
    expect(actionOfEvent(ev("KeyJ"), l)).toBe("attack");
    expect(actionOfEvent(ev("KeyK"), l)).toBe("skill.sword");
    expect(actionOfEvent(ev("KeyL"), l)).toBe("skill.slot2");
    expect(actionOfEvent(ev("KeyU"), l)).toBe("skill.slot3");
    expect(actionOfEvent(ev("KeyI"), l)).toBe("skill.slot4");
    expect(actionOfEvent(ev("KeyO"), l)).toBe("skill.slot5");
    expect(DEFAULT_KEYMAP.attack).toEqual(["KeyJ", "Space"]); // J là phím chính (hiện trên nút), Cách vẫn là phím phụ
    expect(DEFAULT_KEYMAP["skill.sword"]).toEqual(["KeyK", "Digit3"]);
  });

  it("các phím bị cụm J K L U I O chiếm đã dời: Túi -> B, Nhiệm vụ -> N (Q vẫn dùng được), Đả tọa -> Z (4 vẫn dùng được)", () => {
    const l = lookup();
    expect(actionOfEvent(ev("KeyB"), l)).toBe("panel.inventory");
    expect(actionOfEvent(ev("KeyN"), l)).toBe("panel.quest");
    expect(actionOfEvent(ev("KeyQ"), l)).toBe("panel.quest");
    expect(actionOfEvent(ev("KeyZ"), l)).toBe("skill.meditate");
    expect(actionOfEvent(ev("Digit4"), l)).toBe("skill.meditate");
    expect(DEFAULT_KEYMAP["panel.inventory"]).toEqual(["KeyB"]);
    expect(DEFAULT_KEYMAP["panel.quest"]).toEqual(["KeyN", "KeyQ"]);
    expect(DEFAULT_KEYMAP["skill.meditate"]).toEqual(["KeyZ", "Digit4"]);
  });

  it("ba hành động mất phím cũ được đặt phím mới tự do: Đột phá V, Cài đặt E, Âm thanh 0", () => {
    const l = lookup();
    expect(actionOfEvent(ev("KeyV"), l)).toBe("skill.breakthrough");
    expect(actionOfEvent(ev("KeyE"), l)).toBe("panel.settings");
    expect(actionOfEvent(ev("Digit0"), l)).toBe("sound.mute");
  });

  it("các phím còn lại giữ nguyên: Tab / Shift+Tab / T mục tiêu, 1-2 đan, 3 kiếm khí, F tương tác, C, G, M, H, Enter, Y, X, R, P", () => {
    const l = lookup();
    expect(actionOfEvent(ev("Tab"), l)).toBe("target.next");
    expect(actionOfEvent(ev("KeyT"), l)).toBe("target.next");
    expect(actionOfEvent(ev("Tab", { shiftKey: true }), l)).toBe("target.prev");
    expect(actionOfEvent(ev("Digit1"), l)).toBe("quick.1");
    expect(actionOfEvent(ev("Digit2"), l)).toBe("quick.2");
    expect(actionOfEvent(ev("Digit3"), l)).toBe("skill.sword");
    expect(actionOfEvent(ev("Space"), l)).toBe("attack");
    expect(actionOfEvent(ev("KeyF"), l)).toBe("interact");
    expect(actionOfEvent(ev("KeyC"), l)).toBe("panel.char");
    expect(actionOfEvent(ev("KeyG"), l)).toBe("panel.sect");
    expect(actionOfEvent(ev("KeyM"), l)).toBe("panel.map");
    expect(actionOfEvent(ev("KeyH"), l)).toBe("ui.toggle");
    expect(actionOfEvent(ev("Enter"), l)).toBe("chat.open");
    expect(actionOfEvent(ev("KeyY"), l)).toBe("prompt.yes");
    expect(actionOfEvent(ev("KeyX"), l)).toBe("prompt.no");
    expect(actionOfEvent(ev("KeyR"), l)).toBe("exit.fight");
    expect(actionOfEvent(ev("KeyP"), l)).toBe("player.menu");
  });

  it("bốn ô chiêu 2-5 là hành động của thế giới (bị chặn khi bảng mở), không lặp khi giữ phím, có tên nói rõ chưa có chiêu", () => {
    for (const n of SKILL_SLOTS) {
      const def = ACTION_BY_ID[`skill.slot${n}` as ActionId];
      expect(def.world).toBe(true);
      expect(def.repeat).toBeUndefined();
      expect(def.group).toBe("combat");
      expect(def.label).toContain(`${n}`);
      expect(def.label).toContain("chưa có chiêu");
    }
    expect(SKILL_SLOTS).toEqual([2, 3, 4, 5]);
  });

  it("Shift+M bật / tắt bản đồ nhỏ, M vẫn mở bản đồ lớn (QUYET_DINH_M3 mục 17.2): không đụng chữ cái nào", () => {
    const l = lookup();
    expect(actionOfEvent(ev("KeyM", { shiftKey: true }), l)).toBe("panel.minimap");
    expect(actionOfEvent(ev("KeyM"), l)).toBe("panel.map");
    expect(DEFAULT_KEYMAP["panel.minimap"]).toEqual(["Shift+KeyM"]);
    expect(keyLabels(DEFAULT_KEYMAP, "panel.minimap")).toEqual(["Shift+M"]);
    expect(ACTION_BY_ID["panel.minimap"].world).toBe(false); // chạy cả khi bảng đang mở, như M
  });

  it("không có phím nào gán cho hai hành động, và không phím mặc định nào là phím cố định (WASD, mũi tên, Esc)", () => {
    const seen = new Map<string, ActionId>();
    for (const a of ACTIONS)
      for (const t of a.defaults) {
        expect(seen.has(t), `${t} trùng giữa ${seen.get(t)} và ${a.id}`).toBe(false);
        seen.set(t, a.id);
        expect(isValidToken(t), `${t} hợp lệ`).toBe(true);
        expect(RESERVED_CODES.has(t.replace(/^Shift\+/, ""))).toBe(false);
      }
  });

  it("mọi hành động có tên, ít nhất một phím mặc định; ACTION_BY_ID đủ mục", () => {
    for (const a of ACTIONS) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.defaults.length).toBeGreaterThan(0);
      expect(ACTION_BY_ID[a.id]).toBe(a);
    }
    expect(Object.keys(ACTION_BY_ID).length).toBe(ACTIONS.length);
  });

  it("hành động của thế giới (đánh, kỹ năng, đan, tương tác, mục tiêu, mở chat) bị chặn khi bảng mở; mở / đóng bảng và âm thanh thì không", () => {
    for (const id of [
      "attack",
      "target.next",
      "target.prev",
      "skill.sword",
      "skill.slot2",
      "skill.slot3",
      "skill.slot4",
      "skill.slot5",
      "skill.meditate",
      "skill.breakthrough",
      "quick.1",
      "quick.2",
      "interact",
      "chat.open",
    ] as ActionId[])
      expect(ACTION_BY_ID[id].world, id).toBe(true);
    for (const id of [
      "panel.inventory",
      "panel.char",
      "panel.quest",
      "panel.sect",
      "panel.map",
      "panel.settings",
      "sound.mute",
    ] as ActionId[])
      expect(ACTION_BY_ID[id].world, id).toBe(false);
  });

  it("chỉ đánh thường (J / Cách) và Kiếm khí được lặp khi giữ phím", () => {
    const rep = ACTIONS.filter((a) => a.repeat).map((a) => a.id);
    expect(rep.sort()).toEqual(["attack", "skill.sword"]);
  });
});

describe("actionOfEvent", () => {
  it("Ctrl / Alt / Meta đi kèm là phím tắt của trình duyệt: bỏ qua", () => {
    const l = lookup();
    expect(actionOfEvent(ev("KeyI", { ctrlKey: true }), l)).toBeNull();
    expect(actionOfEvent(ev("KeyF", { altKey: true }), l)).toBeNull();
    expect(actionOfEvent(ev("KeyC", { metaKey: true }), l)).toBeNull();
  });

  it("giữ Shift mà không có phím Shift+ tương ứng thì coi như phím thường (vừa chạy vừa mở túi)", () => {
    expect(actionOfEvent(ev("KeyB", { shiftKey: true }), lookup())).toBe("panel.inventory");
    expect(actionOfEvent(ev("Space", { shiftKey: true }), lookup())).toBe("attack");
  });

  it("phím không gán, phím di chuyển và Esc: null", () => {
    const l = lookup();
    for (const c of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "Escape", "Digit9", "F5"])
      expect(actionOfEvent(ev(c), l), c).toBeNull();
  });
});

describe("keyLabel", () => {
  it("nhãn ngắn dễ đọc", () => {
    expect(keyLabel("KeyI")).toBe("I");
    expect(keyLabel("Digit3")).toBe("3");
    expect(keyLabel("Space")).toBe("Cách");
    expect(keyLabel("Tab")).toBe("Tab");
    expect(keyLabel("Shift+Tab")).toBe("Shift+Tab");
    expect(keyLabel("Enter")).toBe("Enter");
    expect(keyLabel("Numpad5")).toBe("Số 5");
    expect(keyLabel("F5")).toBe("F5");
    expect(keyLabel("Semicolon")).toBe(";");
  });

  it("keyLabels: phím chính đứng đầu", () => {
    expect(keyLabels(DEFAULT_KEYMAP, "target.next")).toEqual(["Tab", "T"]);
    expect(keyLabels(DEFAULT_KEYMAP, "panel.quest")).toEqual(["N", "Q"]);
    expect(keyLabels(DEFAULT_KEYMAP, "attack")).toEqual(["J", "Cách"]);
  });
});

describe("isValidToken / sanitizeKeymap", () => {
  it("từ chối phím lạ, phím cố định và kiểu sai", () => {
    for (const t of [
      "",
      "Key I",
      "KeyW",
      "Escape",
      "ArrowLeft",
      "Shift+KeyD",
      "1abc",
      "A".repeat(40),
    ])
      expect(isValidToken(t), t).toBe(false);
    expect(isValidToken(5)).toBe(false);
    expect(isValidToken(null)).toBe(false);
    for (const t of ["KeyI", "Digit0", "Shift+Tab", "F12", "Numpad1", "Space"])
      expect(isValidToken(t), t).toBe(true);
  });

  it("dữ liệu rác / thiếu thì dùng mặc định", () => {
    for (const raw of [null, undefined, 5, "x", [], {}, { attack: 7 }, { attack: [] }])
      expect(sanitizeKeymap(raw)).toEqual(DEFAULT_KEYMAP);
  });

  it("giữ phím hợp lệ, bỏ phím sai, hành động lạ bị bỏ, tối đa 3 phím mỗi hành động", () => {
    const m = sanitizeKeymap({
      attack: ["Digit9", "KeyW", "Bad Key", "Digit9", "Digit8", "Digit7", "Digit9"],
      hack: ["KeyZ"],
    });
    expect(m.attack).toEqual(["Digit9", "Digit8", "Digit7"]);
    expect((m as Record<string, unknown>).hack).toBeUndefined();
    expect(m.interact).toEqual(DEFAULT_KEYMAP.interact);
  });

  it("phím trùng giữa hai hành động: giữ ở hành động đứng trước; hành động sau mất phím đó", () => {
    const m = sanitizeKeymap({ attack: ["KeyF"] });
    expect(m.attack).toEqual(["KeyF"]);
    expect(m.interact).not.toContain("KeyF");
    const seen = new Set<string>();
    for (const a of ACTIONS)
      for (const t of m[a.id]) {
        expect(seen.has(t), t).toBe(false);
        seen.add(t);
      }
  });

  it("phím NGƯỜI CHƠI ĐÃ ĐỔI thắng phím mặc định của hành động đứng trước (đổi mặc định ở bản sau không lấy mất phím họ chọn)", () => {
    // Nhân vật đổi sang J từ trước khi J thành phím chém mặc định: giữ J cho Bảng nhân vật; chém còn Cách
    const m = sanitizeKeymap({ "panel.char": ["KeyJ"] });
    expect(m["panel.char"]).toEqual(["KeyJ"]);
    expect(m.attack).toEqual(["Space"]);
    expect(actionOfEvent(ev("KeyJ"), buildLookup(m))).toBe("panel.char");
    // phím đã đổi của hai hành động trùng nhau: vẫn giữ ở hành động đứng trước
    const dup = sanitizeKeymap({ "panel.char": ["KeyJ"], attack: ["KeyJ"] });
    expect(dup.attack).toEqual(["KeyJ"]);
    expect(dup["panel.char"]).toEqual(["KeyC"]);
  });

  it("ba ca giao nhau với cụm mới (issue #495): Túi = U, Chém = B, Túi = I: người chơi giữ phím đã chọn, không phím trùng", () => {
    const noDup = (m: ReturnType<typeof sanitizeKeymap>) => {
      const seen = new Set<string>();
      for (const a of ACTIONS)
        for (const t of m[a.id]) {
          expect(seen.has(t), `${t} trùng`).toBe(false);
          seen.add(t);
        }
    };
    // Túi = U (U là ô chiêu 3): Túi giữ U; ô chiêu 3 hết phím; B (mặc định của Túi) thành phím của Chém
    const u = sanitizeKeymap({ "panel.inventory": ["KeyU"] });
    expect(u["panel.inventory"]).toEqual(["KeyU"]);
    expect(u["skill.slot3"]).toEqual([]);
    noDup(u);
    // Chém = B (B là Túi): Chém giữ B (kèm phím phụ nếu họ có), Túi hết phím
    const b = sanitizeKeymap({ attack: ["KeyB", "Space"] });
    expect(b.attack).toEqual(["KeyB", "Space"]);
    expect(b["panel.inventory"]).toEqual([]);
    expect(actionOfEvent(ev("KeyB"), buildLookup(b))).toBe("attack");
    expect(actionOfEvent(ev("KeyJ"), buildLookup(b))).toBeNull(); // J không còn là chém: người chơi đã bỏ nó
    noDup(b);
    // Túi = I (I là ô chiêu 4): Túi giữ I; ô chiêu 4 hết phím
    const i = sanitizeKeymap({ "panel.inventory": ["KeyI"] });
    expect(actionOfEvent(ev("KeyI"), buildLookup(i))).toBe("panel.inventory");
    expect(i["skill.slot4"]).toEqual([]);
    noDup(i);
  });

  it("bản lưu cũ chỉ chứa phần đã đổi: phần chưa đổi nhận mặc định MỚI, phần đã đổi giữ nguyên", () => {
    // người chơi v0.2.0 chỉ đổi Bản đồ sang P (và Nhân vật sang Digit9); không đụng gì khác
    const m = sanitizeKeymap({ "panel.map": ["KeyP", "KeyM"], "panel.char": ["Digit9"] });
    expect(m["panel.map"]).toEqual(["KeyP", "KeyM"]);
    expect(m["panel.char"]).toEqual(["Digit9"]);
    expect(m["panel.inventory"]).toEqual(["KeyB"]);
    expect(m.attack).toEqual(["KeyJ", "Space"]);
    expect(m["skill.slot4"]).toEqual(["KeyI"]);
    expect(m["player.menu"]).toEqual([]); // P bị Bản đồ của người chơi chiếm: không hành động nào có hai phím giống nhau
  });
});

describe("lưu / đổi phím", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    });
    _resetKeymapCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetKeymapCache();
  });

  it("chưa lưu gì: bảng mặc định", () => {
    expect(getKeymap()).toEqual(DEFAULT_KEYMAP);
    expect(actionOfEvent(ev("KeyB"), getLookup())).toBe("panel.inventory");
  });

  it("kho hỏng (JSON sai) không làm lỗi: dùng mặc định", () => {
    store.set(KEYMAP_STORAGE_KEY, "{không phải json");
    expect(getKeymap()).toEqual(DEFAULT_KEYMAP);
  });

  it("đổi phím chính: phím mới chạy, phím cũ của hành động đó vẫn là phím phụ, bảng được lưu", () => {
    expect(rebind("attack", "Digit9")).toBe(true);
    expect(getKeymap().attack).toEqual(["Digit9", "KeyJ", "Space"]);
    expect(actionOfEvent(ev("Digit9"), getLookup())).toBe("attack");
    expect(actionOfEvent(ev("KeyJ"), getLookup())).toBe("attack");
    expect(JSON.parse(store.get(KEYMAP_STORAGE_KEY)!)).toEqual({
      attack: ["Digit9", "KeyJ", "Space"],
    });
  });

  it("gán phím DUY NHẤT của hành động khác: hoán đổi, hành động kia nhận phím chính cũ, không ai mất sạch phím", () => {
    expect(rebind("attack", "KeyF")).toBe(true);
    expect(getKeymap().attack).toEqual(["KeyF", "Space"]);
    expect(getKeymap().interact).toEqual(["KeyJ"]);
    expect(actionOfEvent(ev("KeyF"), getLookup())).toBe("attack");
    expect(actionOfEvent(ev("KeyJ"), getLookup())).toBe("interact");
    for (const a of ACTIONS) expect(getKeymap()[a.id].length, a.id).toBeGreaterThan(0);
  });

  it("gán phím PHỤ của hành động khác: hành động kia chỉ mất phím phụ đó, giữ phím chính; không phím trùng", () => {
    expect(rebind("attack", "KeyT")).toBe(true); // T là phím phụ của target.next (Tab là chính)
    expect(getKeymap().attack).toEqual(["KeyT", "KeyJ", "Space"]);
    expect(getKeymap()["target.next"]).toEqual(["Tab"]);
    const seen = new Set<string>();
    for (const a of ACTIONS)
      for (const t of getKeymap()[a.id]) {
        expect(seen.has(t), t).toBe(false);
        seen.add(t);
      }
  });

  it("từ chối phím cố định và phím sai, bảng không đổi", () => {
    expect(rebind("attack", "KeyW")).toBe(false);
    expect(rebind("attack", "Escape")).toBe(false);
    expect(rebind("attack", "bad key")).toBe(false);
    expect(getKeymap()).toEqual(DEFAULT_KEYMAP);
    expect(store.size).toBe(0);
  });

  it("nạp lại từ kho sau khi tải lại trang", () => {
    rebind("panel.map", "KeyP");
    _resetKeymapCache();
    expect(getKeymap()["panel.map"][0]).toBe("KeyP");
    expect(actionOfEvent(ev("KeyP"), getLookup())).toBe("panel.map");
  });

  it("resetKeymap xoá kho và báo cho người nghe; onKeymapChange gỡ được", () => {
    const fn = vi.fn();
    const off = onKeymapChange(fn);
    rebind("attack", "Digit9");
    expect(fn).toHaveBeenCalledTimes(1);
    resetKeymap();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(getKeymap()).toEqual(DEFAULT_KEYMAP);
    expect(store.has(KEYMAP_STORAGE_KEY)).toBe(false);
    off();
    rebind("attack", "Digit8");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("diffFromDefault: bảng mặc định không có gì để lưu", () => {
    expect(diffFromDefault(DEFAULT_KEYMAP)).toEqual({});
  });

  it("không có localStorage (chế độ riêng tư): vẫn đổi phím được trong bộ nhớ", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("chặn");
      },
      setItem: () => {
        throw new Error("chặn");
      },
      removeItem: () => {
        throw new Error("chặn");
      },
    });
    _resetKeymapCache();
    expect(getKeymap()).toEqual(DEFAULT_KEYMAP);
    expect(rebind("attack", "KeyV")).toBe(true);
    expect(getKeymap().attack[0]).toBe("KeyV");
  });
});
