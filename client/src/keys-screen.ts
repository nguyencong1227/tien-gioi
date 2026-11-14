/**
 * Màn "Phím tắt" trong Cài đặt (QUYET_DINH_M3 mục 13, #463): phần LOGIC THUẦN (mô hình danh sách + quyết định khi bấm phím lúc đang chờ gán),
 * không đụng DOM nên test được; `ui.ts` chỉ vẽ mô hình này và nối `rebind` / `resetKeymap` của `keybinds.ts`.
 */
import {
  ACTIONS,
  ACTION_BY_ID,
  RESERVED_CODES,
  holderOf,
  isValidToken,
  keyLabel,
  tokenOfEvent,
  type ActionGroup,
  type ActionId,
  type KeyEventLike,
  type Keymap,
} from "./keybinds";

export const GROUP_TITLE: Readonly<Record<ActionGroup, string>> = {
  combat: "Chiến đấu",
  interact: "Tương tác",
  panel: "Bảng và cửa sổ",
  other: "Khác",
};

export interface KeysRow {
  id: ActionId;
  label: string;
  /** Nhãn các phím, phím chính trước */
  keys: string[];
  /** Khác mặc định (người chơi đã đổi) */
  custom: boolean;
  /** Hành động không còn phím nào (phím mặc định của nó đã bị phím người chơi tự đổi chiếm): màn "Phím tắt" phải nói rõ "chưa gán" */
  unbound: boolean;
}

export interface KeysGroup {
  group: ActionGroup;
  title: string;
  rows: KeysRow[];
}

/** Danh sách hiển thị: nhóm theo `group` đúng thứ tự xuất hiện trong `ACTIONS`, mỗi hành động một dòng. */
export function keysScreenModel(map: Keymap): KeysGroup[] {
  const groups: KeysGroup[] = [];
  for (const a of ACTIONS) {
    let g = groups.find((x) => x.group === a.group);
    if (!g) {
      g = { group: a.group, title: GROUP_TITLE[a.group], rows: [] };
      groups.push(g);
    }
    const cur = map[a.id];
    g.rows.push({
      id: a.id,
      label: a.label,
      keys: cur.map(keyLabel),
      unbound: cur.length === 0,
      custom: cur.length !== a.defaults.length || cur.some((t, i) => t !== a.defaults[i]),
    });
  }
  return groups;
}

export type CaptureOutcome =
  /** Chưa phải phím gán được (chỉ Shift / Ctrl..., hoặc phím giữ lặp): chờ tiếp, không báo gì */
  | { kind: "ignore" }
  /** Esc: người chơi huỷ việc đổi phím */
  | { kind: "cancel"; message: string }
  /** Phím cố định hoặc không hợp lệ: báo và vẫn chờ phím khác */
  | { kind: "reject"; message: string }
  /** Gán được: chỗ gọi chạy `rebind(id, token)` rồi hiện `message` */
  | { kind: "bind"; token: string; message: string };

/**
 * Quyết định khi người chơi bấm một phím lúc màn "Phím tắt" đang chờ gán phím cho `id`. `map` là bảng phím TRƯỚC khi gán (để nói rõ phím
 * đó đang của hành động nào, và hành động đó có bị đổi chỗ không: `rebind` hoán đổi khi lấy phím DUY NHẤT của hành động khác).
 */
export function captureOutcome(
  id: ActionId,
  e: KeyEventLike & { repeat?: boolean },
  map: Keymap,
): CaptureOutcome {
  if (e.code === "Escape") return { kind: "cancel", message: "Đã huỷ, giữ nguyên phím cũ." };
  if (e.repeat) return { kind: "ignore" }; // giữ phím Enter / Cách vừa dùng để bắt đầu đổi: không tính là phím mới
  const token = tokenOfEvent(e);
  if (token === null) return { kind: "ignore" };
  const bare = token.replace(/^Shift\+/, "");
  if (RESERVED_CODES.has(bare)) {
    return {
      kind: "reject",
      message: `${keyLabel(bare)} là phím cố định (đi bộ / Esc), chọn phím khác.`,
    };
  }
  if (!isValidToken(token)) {
    return { kind: "reject", message: "Phím này không gán được, chọn phím khác." };
  }
  const name = ACTION_BY_ID[id].label;
  const label = keyLabel(token);
  if (map[id][0] === token) {
    return { kind: "bind", token, message: `${name}: ${label} vốn đã là phím chính.` };
  }
  const holder = holderOf(token, map);
  if (holder && holder !== id) {
    const other = ACTION_BY_ID[holder].label;
    const onlyKey = map[holder].every((t) => t === token);
    const oldPrimary = map[id][0];
    const swap =
      onlyKey && oldPrimary !== undefined
        ? `"${other}" đổi sang ${keyLabel(oldPrimary)}.`
        : `"${other}" mất phím này.`;
    return { kind: "bind", token, message: `${name}: ${label}. ${swap}` };
  }
  return { kind: "bind", token, message: `${name}: ${label}.` };
}
