// Bảng thưởng khi TRẢ nhiệm vụ (QUYET_DINH_M3 mục 66, issue #1327): trước đây trả xong chỉ có toast "Hoàn thành: <tên>", tu vi cộng lặng lẽ, đồ vào túi lặng lẽ. Server (PR #1331) gửi MỘT tin
// `questReward` với số THẬT đã cộng; file này làm sạch tin (không tin mạng) và dựng các dòng hiển thị. Hàm thuần, không đụng DOM: `ui.ts` chỉ vẽ.
import { CURRENCY_NAME, ITEM_BY_ID, questDefAny, type QuestRewardMsg } from "@tien-gioi/shared";

/** Trần số vật phẩm hiển thị / trần mỗi số: tin hợp lệ không bao giờ vượt, đây là hàng rào cho tin hỏng. */
export const QUEST_REWARD_MAX_ITEMS = 12;
export const QUEST_REWARD_MAX_NUM = 1_000_000_000;

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Số nguyên không âm trong [0, QUEST_REWARD_MAX_NUM]; không hữu hạn / âm / không phải số -> 0, lẻ -> làm tròn xuống. */
function whole(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.min(Math.floor(n), QUEST_REWARD_MAX_NUM)
    : 0;
}

/**
 * Làm sạch tin `questReward` đến từ mạng: đúng kiểu thì trả `QuestRewardMsg` đã kẹp (số nguyên không âm, vật phẩm lạ / số lượng sai bị bỏ, tối đa `QUEST_REWARD_MAX_ITEMS`), sai kiểu thì
 * `null` (bỏ tin, không sập). `questId` lạ vẫn nhận (hiện tiêu đề chung): thưởng vẫn là thưởng thật.
 */
export function sanitizeQuestRewardMsg(raw: unknown): QuestRewardMsg | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.questId !== "string") return null;
  const items: QuestRewardMsg["items"] = [];
  if (Array.isArray(r.items)) {
    for (const it of r.items) {
      if (items.length >= QUEST_REWARD_MAX_ITEMS) break;
      if (typeof it !== "object" || it === null) continue;
      const { itemId, qty } = it as Record<string, unknown>;
      // `ITEM_BY_ID["constructor"]` là hàm của Object: chỉ nhận khoá riêng của bảng
      if (typeof itemId !== "string" || !hasOwn(ITEM_BY_ID, itemId)) continue;
      const q = whole(qty);
      if (q > 0) items.push({ itemId, qty: q });
    }
  }
  return { questId: r.questId, exp: whole(r.exp), coin: whole(r.coin), items };
}

export interface RewardLine {
  kind: "exp" | "item" | "coin" | "note";
  text: string;
  /** Chỉ `item`: id để vẽ biểu tượng + tô độ hiếm */
  itemId?: string;
  rarity?: number;
}

export interface QuestRewardView {
  title: string;
  lines: RewardLine[];
}

const fmt = (n: number) => n.toLocaleString("vi-VN");

/**
 * Các dòng của bảng thưởng: tu vi, rồi từng vật phẩm (kèm số lượng), rồi Linh thạch. Tu vi 0 mà nhiệm vụ CÓ thưởng tu vi nghĩa là đã đầy ở bậc cuối chờ Đột phá (server trừ phần bị cắt):
 * nói rõ thay vì im lặng. Không có gì để hiện thì ghi một dòng chú thích (bảng vẫn báo "Hoàn thành").
 */
export function questRewardView(msg: QuestRewardMsg): QuestRewardView {
  const def = questDefAny(msg.questId);
  const lines: RewardLine[] = [];
  if (msg.exp > 0) lines.push({ kind: "exp", text: `+${fmt(msg.exp)} tu vi` });
  else if ((def?.rewards.exp ?? 0) > 0)
    lines.push({ kind: "note", text: "Tu vi đã đầy: cần Đột phá để tích luỹ tiếp" });
  for (const it of msg.items) {
    const d = ITEM_BY_ID[it.itemId];
    lines.push({
      kind: "item",
      text: `${d.name} ×${fmt(it.qty)}`,
      itemId: it.itemId,
      rarity: typeof d.rarity === "number" ? d.rarity : undefined,
    });
  }
  if (msg.coin > 0) lines.push({ kind: "coin", text: `+${fmt(msg.coin)} ${CURRENCY_NAME}` });
  if (lines.length === 0) lines.push({ kind: "note", text: "Nhiệm vụ này không có phần thưởng" });
  return { title: def ? `Hoàn thành: ${def.title}` : "Hoàn thành nhiệm vụ", lines };
}
