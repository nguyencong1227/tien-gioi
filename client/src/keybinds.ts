/**
 * Bảng phím của máy tính (QUYET_DINH_M3 mục 13, #463, `docs/THIET_KE_BAN_PHIM.md`). Mô-đun THUẦN (không đụng DOM / Phaser) để test:
 * mỗi HÀNH ĐỘNG có một danh sách phím mặc định, người chơi đổi được (lưu `localStorage`), `WorldScene` tra `actionOfEvent`
 * thay vì gắn cứng từng phím, HUD và màn "Phím tắt" đọc nhãn từ đây nên không bao giờ lệch với phím thật.
 *
 * Phím được ghi theo `KeyboardEvent.code` (vị trí vật lý: không đổi khi bật bộ gõ tiếng Việt, khác `key` có thể thành "Process"),
 * kèm tiền tố `Shift+` nếu cần phân biệt (Tab / Shift+Tab). Di chuyển (WASD + mũi tên) và Esc là phím CỐ ĐỊNH, không đổi được.
 * Cảm ứng không dùng mô-đun này.
 */

export type ActionId =
  | "attack"
  | "target.next"
  | "target.prev"
  | "skill.sword"
  | "skill.meditate"
  | "skill.breakthrough"
  | "quick.1"
  | "quick.2"
  | "interact"
  | "prompt.yes"
  | "prompt.no"
  | "exit.fight"
  | "panel.inventory"
  | "panel.char"
  | "panel.quest"
  | "panel.sect"
  | "panel.map"
  | "panel.settings"
  | "chat.open"
  | "sound.mute";

export type ActionGroup = "combat" | "interact" | "panel" | "other";

export interface ActionDef {
  id: ActionId;
  /** Tên hiển thị (tiếng Việt) ở màn "Phím tắt" và gợi ý nút */
  label: string;
  group: ActionGroup;
  /** Phím mặc định; phần tử ĐẦU là phím chính (hiện trên nút HUD) */
  defaults: readonly string[];
  /** Giữ phím thì lặp lại (đánh liên tục); mặc định không lặp để mở / đóng bảng không nhấp nháy */
  repeat?: boolean;
  /** Hành động cần THẾ GIỚI nhận phím: bị chặn khi bảng / hộp thoại đang mở (Space / Enter / mũi tên thuộc về bảng). Mở / đóng bảng, âm thanh vẫn chạy. */
  world: boolean;
}

/**
 * Bảng hành động. THỨ TỰ = thứ tự ở màn "Phím tắt".
 * Quyết định: 1 / 2 giữ đan dược như v0.1.2 (người đã quen, bấm nhầm kỹ năng lúc cần uống đan là nguy hiểm), 3 = Kiếm khí, 4 = Đả tọa;
 * K / L / B giữ nguyên làm phím phụ. J = Sổ nhiệm vụ (trước đây J là chém, nay chém chỉ còn Space) và Q vẫn mở sổ nhiệm vụ.
 */
export const ACTIONS: readonly ActionDef[] = [
  {
    id: "attack",
    label: "Kiếm chém",
    group: "combat",
    defaults: ["Space"],
    repeat: true,
    world: true,
  },
  {
    id: "target.next",
    label: "Chọn mục tiêu / mục tiêu kế",
    group: "combat",
    defaults: ["Tab", "KeyT"],
    world: true,
  },
  {
    id: "target.prev",
    label: "Mục tiêu trước",
    group: "combat",
    defaults: ["Shift+Tab"],
    world: true,
  },
  {
    id: "skill.sword",
    label: "Kiếm khí",
    group: "combat",
    defaults: ["Digit3", "KeyK"],
    repeat: true,
    world: true,
  },
  {
    id: "skill.meditate",
    label: "Đả tọa",
    group: "combat",
    defaults: ["Digit4", "KeyL"],
    world: true,
  },
  { id: "skill.breakthrough", label: "Đột phá", group: "combat", defaults: ["KeyB"], world: true },
  { id: "quick.1", label: "Đan dược ô 1", group: "combat", defaults: ["Digit1"], world: true },
  { id: "quick.2", label: "Đan dược ô 2", group: "combat", defaults: ["Digit2"], world: true },
  {
    id: "interact",
    label: "Nhặt / nói chuyện / qua cổng",
    group: "interact",
    defaults: ["KeyF"],
    world: true,
  },
  {
    id: "prompt.yes",
    label: "Nhận lời mời (tổ đội, bí cảnh, thách đấu, tông môn) / đồng ý",
    group: "interact",
    defaults: ["KeyY"],
    world: false,
  },
  {
    id: "prompt.no",
    label: "Từ chối lời mời / huỷ xác nhận",
    group: "interact",
    defaults: ["KeyX"],
    world: false,
  },
  {
    id: "exit.fight",
    label: "Rời bí cảnh / đầu hàng quyết đấu (hỏi xác nhận)",
    group: "interact",
    defaults: ["KeyR"],
    world: true,
  },
  { id: "panel.inventory", label: "Túi đồ", group: "panel", defaults: ["KeyI"], world: false },
  {
    id: "panel.char",
    label: "Nhân vật và trang bị",
    group: "panel",
    defaults: ["KeyC"],
    world: false,
  },
  {
    id: "panel.quest",
    label: "Sổ nhiệm vụ",
    group: "panel",
    defaults: ["KeyJ", "KeyQ"],
    world: false,
  },
  { id: "panel.sect", label: "Tông môn", group: "panel", defaults: ["KeyG"], world: false },
  { id: "panel.map", label: "Bản đồ lớn", group: "panel", defaults: ["KeyM"], world: false },
  {
    id: "panel.settings",
    label: "Cài đặt và phím tắt",
    group: "panel",
    defaults: ["KeyO"],
    world: false,
  },
  {
    id: "chat.open",
    label: "Mở ô chat (Enter gửi, Esc thoát)",
    group: "other",
    defaults: ["Enter"],
    world: true,
  },
  {
    id: "sound.mute",
    label: "Bật / tắt âm thanh",
    group: "other",
    defaults: ["KeyN"],
    world: false,
  },
];

export const ACTION_BY_ID: Readonly<Record<ActionId, ActionDef>> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
) as Record<ActionId, ActionDef>;

/** Phím CỐ ĐỊNH: không gán được cho hành động nào (di chuyển, Esc đóng / bỏ chọn, Tab trong bảng là của trình duyệt). */
export const RESERVED_CODES: ReadonlySet<string> = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Escape",
]);

export type Keymap = Readonly<Record<ActionId, readonly string[]>>;

export const DEFAULT_KEYMAP: Keymap = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a.defaults]),
) as Record<ActionId, readonly string[]>;

/** Một phím hợp lệ: `Shift+` tuỳ chọn rồi mã phím chữ-số (`KeyI`, `Digit3`, `Space`, `Tab`, `F5`, `Numpad1`...) */
const TOKEN_RE = /^(Shift\+)?[A-Za-z][A-Za-z0-9]{0,14}$/;

export function isValidToken(token: unknown): token is string {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return false;
  return !RESERVED_CODES.has(token.replace(/^Shift\+/, ""));
}

/** Làm sạch bảng phím đọc từ kho lưu: hành động lạ / phím sai bị bỏ, hành động thiếu lấy mặc định, phím trùng giữ ở hành động đứng trước. */
export function sanitizeKeymap(raw: unknown): Keymap {
  const out: Record<string, string[]> = {};
  const used = new Set<string>();
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const a of ACTIONS) {
    const v = src[a.id];
    let list: string[] | null = null;
    if (Array.isArray(v)) {
      list = [];
      for (const t of v) {
        if (list.length >= 3) break;
        if (isValidToken(t) && !used.has(t) && !list.includes(t)) list.push(t);
      }
      if (list.length === 0) list = null;
    }
    const final = list ?? a.defaults.filter((t) => !used.has(t));
    for (const t of final) used.add(t);
    out[a.id] = final;
  }
  return out as unknown as Keymap;
}

/** Bảng ngược: phím -> hành động (dùng khi gõ phím). */
export function buildLookup(map: Keymap): ReadonlyMap<string, ActionId> {
  const m = new Map<string, ActionId>();
  for (const a of ACTIONS) for (const t of map[a.id]) if (!m.has(t)) m.set(t, a.id);
  return m;
}

export interface KeyEventLike {
  code: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

/**
 * Hành động ứng với một phím bấm, hoặc `null`. Ctrl / Alt / Meta đi kèm = phím tắt của trình duyệt (Ctrl+R, Alt+Tab...): bỏ qua.
 * Shift: thử đúng `Shift+<phím>` trước (Shift+Tab), không có thì coi như phím thường (giữ Shift khi chạy vẫn mở được túi).
 */
export function actionOfEvent(
  e: KeyEventLike,
  lookup: ReadonlyMap<string, ActionId>,
): ActionId | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.shiftKey) {
    const shifted = lookup.get(`Shift+${e.code}`);
    if (shifted) return shifted;
  }
  return lookup.get(e.code) ?? null;
}

const LABEL_SPECIAL: Record<string, string> = {
  Space: "Cách",
  Tab: "Tab",
  Enter: "Enter",
  Escape: "Esc",
  Backspace: "Xoá",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
};

/** Nhãn ngắn của một phím để in lên nút: `KeyI` -> `I`, `Digit3` -> `3`, `Space` -> `Cách`, `Shift+Tab` -> `Shift+Tab`. */
export function keyLabel(token: string): string {
  const shift = token.startsWith("Shift+");
  const code = shift ? token.slice(6) : token;
  let base = LABEL_SPECIAL[code];
  if (base === undefined) {
    if (/^Key[A-Z]$/.test(code)) base = code.slice(3);
    else if (/^Digit[0-9]$/.test(code)) base = code.slice(5);
    else if (/^Numpad[0-9]$/.test(code)) base = `Số ${code.slice(6)}`;
    else base = code;
  }
  return shift ? `Shift+${base}` : base;
}

/** Nhãn tất cả phím của một hành động, phím chính trước: ["Tab", "T"]. */
export function keyLabels(map: Keymap, id: ActionId): string[] {
  return map[id].map(keyLabel);
}

/** Nhãn phím CHÍNH của một hành động theo bảng phím hiện hành (cho chữ gợi ý trong game: "Nhặt (F)"); hành động hết phím thì chuỗi rỗng. */
export function primaryKeyLabel(id: ActionId, map: Keymap = getKeymap()): string {
  const t = map[id][0];
  return t === undefined ? "" : keyLabel(t);
}

/** Phím chỉ là phím bổ trợ (Shift / Ctrl / Alt / Meta / CapsLock...): đứng một mình không phải phím để gán. */
const MODIFIER_CODES: ReadonlySet<string> = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OS",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Fn",
  "FnLock",
  "ContextMenu",
]);

/**
 * Phím vừa bấm ở màn "Phím tắt" khi đang chờ gán -> token để `rebind`, hoặc `null` nếu chưa phải phím gán được (chỉ bấm Shift / Ctrl..., hoặc có
 * Ctrl / Alt / Meta = phím tắt của trình duyệt). Shift chỉ được giữ lại cho Tab (`Shift+Tab`, đối xứng với `target.prev`); phím khác bấm kèm Shift
 * thì coi như phím thường để khỏi gán nhầm "Shift+R" chỉ chạy khi đang giữ Shift. Phím cố định (WASD, mũi tên, Esc) vẫn trả token để chỗ gọi
 * báo "phím cố định" cho người chơi thay vì lờ đi (`isValidToken` loại chúng khỏi `rebind`).
 */
export function tokenOfEvent(e: KeyEventLike): string | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (!e.code || MODIFIER_CODES.has(e.code)) return null;
  return e.shiftKey && e.code === "Tab" ? "Shift+Tab" : e.code;
}

/** Hành động đang giữ `token` (để báo "phím này đang là của X, sẽ đổi chỗ"), hoặc `null`. */
export function holderOf(token: string, map: Keymap = getKeymap()): ActionId | null {
  for (const a of ACTIONS) if (map[a.id].includes(token)) return a.id;
  return null;
}

/** Phím CỐ ĐỊNH (không đổi được) hiện ở màn "Phím tắt": mô tả luật chung, không nằm trong bảng `ACTIONS`. */
export const FIXED_KEYS: ReadonlyArray<{ keys: string; what: string }> = [
  { keys: "W A S D / ← ↑ ↓ →", what: "Đi bộ (khi bảng đang mở: mũi tên chuyển nút trong bảng)" },
  { keys: "Esc", what: "Đóng bảng trên cùng, bỏ chọn mục tiêu, thoát ô chat" },
  { keys: "Enter / Cách", what: "Bấm nút đang chọn trong bảng; tua nhanh chữ hội thoại" },
  { keys: "1 - 9", what: "Chọn dòng trả lời khi đang nói chuyện với NPC" },
  { keys: "Tab / Shift+Tab", what: "Trong bảng: sang nút kế / nút trước" },
];

// ---------- Lưu / đọc ----------

export const KEYMAP_STORAGE_KEY = "tg_keymap";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // chế độ riêng tư / bị chặn
  }
}

/** Chỉ lưu phần KHÁC mặc định để đổi mặc định ở bản sau vẫn tới người chơi chưa tự đổi phím. */
export function diffFromDefault(map: Keymap): Partial<Record<ActionId, string[]>> {
  const out: Partial<Record<ActionId, string[]>> = {};
  for (const a of ACTIONS) {
    const cur = map[a.id];
    if (cur.length !== a.defaults.length || cur.some((t, i) => t !== a.defaults[i]))
      out[a.id] = [...cur];
  }
  return out;
}

let current: Keymap | null = null;
let lookup: ReadonlyMap<string, ActionId> | null = null;
const listeners = new Set<() => void>();

export function getKeymap(): Keymap {
  if (!current) {
    let raw: unknown;
    try {
      const s = storage()?.getItem(KEYMAP_STORAGE_KEY);
      raw = s ? JSON.parse(s) : null;
    } catch {
      raw = null; // kho hỏng / bị chặn / JSON sai: dùng mặc định
    }
    current = sanitizeKeymap(raw);
  }
  return current;
}

export function getLookup(): ReadonlyMap<string, ActionId> {
  return (lookup ??= buildLookup(getKeymap()));
}

/** Đặt bảng phím mới (đã làm sạch), lưu và báo cho HUD / màn Phím tắt vẽ lại. */
export function setKeymap(map: Keymap): void {
  current = sanitizeKeymap(map);
  lookup = null;
  const diff = diffFromDefault(current);
  try {
    const st = storage();
    if (Object.keys(diff).length === 0) st?.removeItem(KEYMAP_STORAGE_KEY);
    else st?.setItem(KEYMAP_STORAGE_KEY, JSON.stringify(diff));
  } catch {
    /* kho đầy / bị chặn: giữ trong bộ nhớ cho phiên này */
  }
  for (const fn of listeners) fn();
}

export function resetKeymap(): void {
  setKeymap(DEFAULT_KEYMAP);
}

/**
 * Gán `token` làm phím CHÍNH của `id`; phím đó bị gỡ khỏi hành động đang giữ nó (không bao giờ có phím trùng).
 * Nếu đó là phím DUY NHẤT của hành động kia thì HOÁN ĐỔI: hành động kia nhận phím chính cũ của `id`, để không hành động nào mất sạch phím
 * (người chơi không còn cách gọi nó). Trả `false` nếu phím không hợp lệ / cố định.
 */
export function rebind(id: ActionId, token: string): boolean {
  if (!isValidToken(token)) return false;
  const cur = getKeymap();
  const oldPrimary = cur[id][0];
  const orphans = ACTIONS.filter(
    (a) => a.id !== id && cur[a.id].includes(token) && cur[a.id].every((t) => t === token),
  );
  const next: Record<string, string[]> = {};
  for (const a of ACTIONS) {
    const keep = cur[a.id].filter((t) => t !== token);
    if (a.id === id) {
      // nếu phím cũ chuyển sang hành động bị lấy phím thì không giữ nó ở đây nữa (tránh trùng)
      const give = orphans.length > 0 && oldPrimary !== undefined ? oldPrimary : null;
      next[a.id] = [token, ...keep.filter((t) => t !== give)];
    } else if (
      keep.length === 0 &&
      orphans.some((o) => o.id === a.id) &&
      oldPrimary !== undefined
    ) {
      next[a.id] = [oldPrimary];
    } else {
      next[a.id] = keep;
    }
  }
  setKeymap(next as unknown as Keymap);
  return true;
}

export function onKeymapChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Chỉ cho test: bỏ bộ nhớ đệm để đọc lại từ kho. */
export function _resetKeymapCache(): void {
  current = null;
  lookup = null;
}
