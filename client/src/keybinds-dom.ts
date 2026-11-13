/**
 * Nhãn phím trên HUD (QUYET_DINH_M3 mục 13, #462): đọc từ bảng phím (`keybinds.ts`) nên đổi phím thì nhãn đổi theo.
 * Nút kỹ năng / mục tiêu / HUD có một thẻ `<kbd class="keycap">` (CSS chỉ hiện trên máy tính, cảm ứng ẩn); `title` và `aria-label` ghi
 * "Tên (Phím X)". Ô đan dược dùng sẵn `.qkey`. Không đụng logic điều khiển.
 */
import {
  ACTION_BY_ID,
  getKeymap,
  keyLabel,
  keyLabels,
  onKeymapChange,
  type ActionId,
  type Keymap,
} from "./keybinds";

interface HudKey {
  /** id phần tử HTML */
  id: string;
  action: ActionId;
  /** Tên đầy đủ cho `title` / `aria-label` */
  name: string;
  /** Thêm thẻ keycap trong nút (nút kỹ năng + nút HUD); ô đan dược dùng `.qkey` có sẵn */
  keycap: "kbd" | "qkey" | "none";
}

export const HUD_KEYS: readonly HudKey[] = [
  { id: "sk-slash", action: "attack", name: "Kiếm chém tấn công", keycap: "kbd" },
  { id: "sk-sword", action: "skill.sword", name: "Phóng kiếm khí", keycap: "kbd" },
  { id: "sk-med", action: "skill.meditate", name: "Đả tọa hồi phục", keycap: "kbd" },
  { id: "sk-break", action: "skill.breakthrough", name: "Đột phá cảnh giới", keycap: "kbd" },
  { id: "btn-target", action: "target.next", name: "Khoá hoặc chuyển mục tiêu", keycap: "kbd" },
  { id: "quick-1", action: "quick.1", name: "Đan dược ô 1", keycap: "qkey" },
  { id: "quick-2", action: "quick.2", name: "Đan dược ô 2", keycap: "qkey" },
  { id: "btn-char", action: "panel.char", name: "Bảng nhân vật và trang bị", keycap: "kbd" },
  { id: "btn-bag", action: "panel.inventory", name: "Túi đồ", keycap: "kbd" },
  { id: "btn-quest", action: "panel.quest", name: "Sổ nhiệm vụ", keycap: "kbd" },
  { id: "btn-sect", action: "panel.sect", name: "Tông môn", keycap: "kbd" },
  { id: "btn-mute", action: "sound.mute", name: "Bật hoặc tắt âm thanh", keycap: "none" },
  { id: "btn-settings", action: "panel.settings", name: "Cài đặt và phím tắt", keycap: "none" },
];

/** Phần tử tối thiểu mà `applyKeyLabels` cần (để test bằng đối tượng giả, không cần jsdom). */
export interface KeyLabelEl {
  setAttribute(name: string, value: string): void;
  querySelector(sel: string): KeyLabelEl | null;
  append(...nodes: KeyLabelEl[]): void;
  textContent: string | null;
  className: string;
}
export interface KeyLabelDoc {
  getElementById(id: string): KeyLabelEl | null;
  createElement(tag: string): KeyLabelEl;
}

/** Dòng gợi ý phím ngắn ở đầu màn hình (`#help`): phím CHÍNH của từng hành động chính, đổi phím thì đổi theo. */
export function helpStripText(map: Keymap): string {
  const k = (id: ActionId) => keyLabel(map[id][0] ?? "");
  return [
    "WASD / mũi tên đi",
    `${k("attack")} chém`,
    `${k("target.next")} mục tiêu`,
    `${k("skill.sword")} kiếm khí`,
    `${k("skill.meditate")} đả tọa`,
    `${k("quick.1")}/${k("quick.2")} đan`,
    `${k("interact")} nhặt/nói/cổng`,
    `${k("panel.inventory")} túi`,
    `${k("panel.char")} nhân vật`,
    `${k("panel.quest")} nhiệm vụ`,
    `${k("panel.sect")} tông môn`,
    `${k("panel.map")} bản đồ`,
    `${k("panel.settings")} cài đặt`,
    `${k("chat.open")} chat`,
  ].join(" · ");
}

/** Gán nhãn phím cho mọi nút HUD có mặt trong tài liệu (nút vắng thì bỏ qua). Gọi lại được: cập nhật chứ không nhân đôi thẻ. */
export function applyKeyLabels(doc: KeyLabelDoc = document as unknown as KeyLabelDoc): void {
  const map = getKeymap();
  const help = doc.getElementById("help");
  if (help) help.textContent = helpStripText(map);
  for (const k of HUD_KEYS) {
    const el = doc.getElementById(k.id);
    if (!el) continue;
    const labels = keyLabels(map, k.action);
    const primary = labels[0] ?? "";
    el.setAttribute("title", labels.length ? `${k.name} (${labels.join(" / ")})` : k.name);
    el.setAttribute(
      "aria-label",
      labels.length ? `${k.name} (Phím ${labels.join(" hoặc ")})` : k.name,
    );
    if (k.keycap === "kbd") {
      let cap = el.querySelector(".keycap");
      if (!cap) {
        cap = doc.createElement("kbd");
        cap.className = "keycap";
        cap.setAttribute("aria-hidden", "true");
        el.append(cap);
      }
      cap.textContent = primary;
    } else if (k.keycap === "qkey") {
      const q = el.querySelector(".qkey");
      if (q) q.textContent = primary;
    }
  }
}

/** Gắn một lần khi khởi động: vẽ nhãn ngay và vẽ lại mỗi khi người chơi đổi phím. */
export function initKeyLabels(doc?: KeyLabelDoc): () => void {
  applyKeyLabels(doc);
  return onKeymapChange(() => applyKeyLabels(doc));
}

/** Tên hành động cho màn "Phím tắt" / gợi ý (cùng nguồn với bảng phím). */
export function actionLabel(id: ActionId): string {
  return ACTION_BY_ID[id].label;
}
