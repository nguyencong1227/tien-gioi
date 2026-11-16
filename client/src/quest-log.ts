import {
  ITEM_BY_ID,
  MAIN_QUEST_START,
  NPC_BY_ID,
  QUESTS,
  QUEST_BY_ID,
  SECT_QUEST_GIVER,
  SECT_TERMS,
  isSectQuest,
  questDefAny,
  type QuestReward,
} from "@tien-gioi/shared";

/**
 * Tab "Đã hoàn thành" của Sổ nhiệm vụ khi chuỗi dài (M6 #409: ~20 nhiệm vụ chính tuyến + nhiệm vụ lặp). Trước đây mỗi nhiệm vụ xong là một
 * thẻ đầy đủ (tiêu đề + mô tả nhiều dòng) nên danh sách dài hàng chục màn hình; nay là MỘT HÀNG gọn (tiêu đề + nhãn), bấm mới mở mô tả.
 * Phần chọn / sắp xếp / đếm ở đây là hàm thuần (không đụng DOM) để test được; `ui.ts` chỉ vẽ.
 */

export interface DoneRow {
  id: string;
  title: string;
  desc: string;
  /** Nhiệm vụ lặp (Bảng cáo thị), xong trong hôm nay */
  daily: boolean;
  /** Việc phụ: không lặp nhưng KHÔNG thuộc chuỗi chính (hạ Xích Mãng / Hắc Giao theo đội...), làm hay không cũng không chặn chuỗi */
  side: boolean;
}

/** Loại nhiệm vụ: chuỗi chính, việc phụ (không lặp, ngoài chuỗi chính), lặp hằng ngày, hoặc nhiệm vụ TÔNG MÔN (M8, trả ở bảng Tông môn, không có NPC giao). */
export type QuestKind = "main" | "side" | "daily" | "sect";

/**
 * Id các nhiệm vụ THUỘC chuỗi chính: đi từ nhiệm vụ đầu theo `next`. Nhiệm vụ không lặp mà không nằm trong chuỗi (không ai nối tới) là việc phụ:
 * không chặn chuỗi nên không thể gọi là "chính tuyến" (M7.5c: Hắc Giao thành việc phụ để chuỗi chính làm được một mình).
 */
const MAIN_CHAIN: ReadonlySet<string> = (() => {
  const ids = new Set<string>();
  let id: string | undefined = MAIN_QUEST_START;
  while (
    id !== undefined &&
    !ids.has(id) &&
    Object.prototype.hasOwnProperty.call(QUEST_BY_ID, id)
  ) {
    ids.add(id);
    id = QUEST_BY_ID[id].next;
  }
  return ids;
})();

/** Loại của nhiệm vụ `def` (không có định nghĩa: coi như việc phụ, không ném lỗi). */
export function questKind(
  def: { id: string; daily?: boolean; giver?: unknown } | undefined,
): QuestKind {
  if (!def) return "side";
  if (isSectQuest(def)) return "sect"; // `daily: true` nhưng là loại riêng: không có NPC giao
  if (def.daily) return "daily";
  return MAIN_CHAIN.has(def.id) ? "main" : "side";
}

/** Nhãn tiếng Việt của từng loại (thẻ nhiệm vụ đang làm). */
export const QUEST_KIND_LABEL: Readonly<Record<QuestKind, string>> = {
  main: "Chính tuyến",
  side: "Việc phụ",
  daily: "Hằng ngày",
  sect: "Tông môn",
};

/** Nhãn ngắn trên hộp thoại NPC (cùng hàng với tên nhiệm vụ). */
export const QUEST_KIND_BADGE: Readonly<Record<QuestKind, string>> = {
  main: "Chính",
  side: "Phụ",
  daily: "Lặp",
  sect: "Tông",
};

/**
 * Dòng phụ của thẻ nhiệm vụ đang làm: người giao + loại. Nhiệm vụ TÔNG MÔN không có NPC (giver là `SECT_QUEST_GIVER`, KHÔNG tra `NPC_BY_ID`): ghi nơi nhận / trả là bảng Tông môn.
 * NPC lạ thì ghi chính id (không ném lỗi).
 */
export function questCardSubtitle(def: { id: string; giver: string; daily?: boolean }): string {
  if (def.giver === SECT_QUEST_GIVER) return `Nhiệm vụ ${SECT_TERMS.hall.toLowerCase()} tông môn`;
  const npc = Object.prototype.hasOwnProperty.call(NPC_BY_ID, def.giver)
    ? NPC_BY_ID[def.giver]
    : undefined;
  return `${npc?.name ?? def.giver} (${QUEST_KIND_LABEL[questKind(def)]})`;
}

/** Dòng trạng thái khi nhiệm vụ đã xong mọi bước: NPC thường thì tới gặp người giao; nhiệm vụ tông môn thì mở bảng Tông môn, tab Nội vụ để trả (không có NPC để đi tới). */
export function questReadyText(def: { giver: string }): string {
  if (def.giver === SECT_QUEST_GIVER)
    return `Hoàn thành · Mở bảng Tông môn > ${SECT_TERMS.hall} để trả nhiệm vụ`;
  const npc = Object.prototype.hasOwnProperty.call(NPC_BY_ID, def.giver)
    ? NPC_BY_ID[def.giver]
    : undefined;
  return `Hoàn thành · Gặp ${npc?.name ?? "NPC"} trả nhiệm vụ`;
}

/** Vị trí của nhiệm vụ trong `QUESTS` = thứ tự chuỗi chính (nhiệm vụ nối nhau theo thứ tự khai báo). */
const ORDER: Record<string, number> = Object.fromEntries(QUESTS.map((q, i) => [q.id, i]));

/**
 * Các hàng của tab "Đã hoàn thành": nhiệm vụ chính tuyến theo thứ tự chuỗi, rồi nhiệm vụ lặp hôm nay.
 * Bỏ id lạ / id độc ("constructor", "__proto__": `QUEST_BY_ID["constructor"]` không phải `undefined`) và id trùng
 * (server gửi danh sách của file lưu: không tin). Một id vừa ở `done` vừa ở `dailyDone` tính theo định nghĩa (`daily` của nhiệm vụ).
 */
export function doneRows(done: readonly string[], dailyDone: readonly string[]): DoneRow[] {
  const seen = new Set<string>();
  const rows: DoneRow[] = [];
  for (const id of [...done, ...dailyDone]) {
    const def = questDefAny(id); // cả nhiệm vụ thường lẫn nhiệm vụ tông môn; id lạ / độc (constructor, __proto__) -> undefined
    if (typeof id !== "string" || seen.has(id) || !def) continue;
    seen.add(id);
    const kind = questKind(def);
    rows.push({
      id,
      title: def.title,
      desc: def.desc,
      daily: kind === "daily" || kind === "sect", // nhiệm vụ tông môn cũng LẶP hằng ngày
      side: kind === "side",
    });
  }
  // Chính tuyến trước (theo thứ tự chuỗi), rồi việc phụ, rồi lặp (cũng theo thứ tự khai báo cho ổn định)
  const rank = (r: DoneRow) => (r.daily ? 2 : r.side ? 1 : 0);
  const order = (id: string) => ORDER[id] ?? Number.MAX_SAFE_INTEGER; // nhiệm vụ tông môn không nằm trong QUESTS: xếp cuối nhóm
  return rows.sort((a, b) => rank(a) - rank(b) || order(a.id) - order(b.id));
}

/** Số nhiệm vụ THUỘC chuỗi chính của game (không tính việc phụ và nhiệm vụ lặp): mẫu số của dòng tóm tắt. */
export const MAIN_QUEST_TOTAL = MAIN_CHAIN.size;

/**
 * Dòng tóm tắt đầu tab: "Chính tuyến 15 / 21 · Việc phụ: 1 · Lặp hôm nay: 2" (không hiện phần việc phụ / lặp khi chưa làm). Việc phụ không tính vào
 * tử số chính tuyến (trước M7.5c tính chung nên đủ chuỗi chính vẫn có thể hiện thiếu hoặc thừa theo số việc phụ đã làm).
 */
export function doneSummary(rows: readonly DoneRow[]): string {
  const daily = rows.filter((r) => r.daily).length;
  const side = rows.filter((r) => r.side).length;
  const main = rows.length - daily - side;
  let text = `Chính tuyến ${main} / ${MAIN_QUEST_TOTAL}`;
  if (side > 0) text += ` · Việc phụ: ${side}`;
  if (daily > 0) text += ` · Lặp hôm nay: ${daily}`;
  return text;
}

/** Một phần của dòng "Thưởng:" ở thẻ nhiệm vụ: chữ + (nếu là đồ) id để tô màu / dấu theo độ hiếm. */
export interface RewardPart {
  text: string;
  /** Có thì là một món đồ: ui tô màu độ hiếm + dấu phụ lên chính phần này (cùng cách với túi, cửa hàng) */
  itemId?: string;
  /** Độ hiếm của món (`ITEM_BY_ID`); id lạ thì bỏ trống (không tô) */
  rarity?: number;
}

/**
 * Các phần thưởng của một nhiệm vụ theo thứ tự hiển thị: tu vi trước, rồi từng món ("<tên> ×<số lượng>"). Trước đây cả dòng là MỘT chuỗi chữ vàng nên quyển / đồ hiếm thưởng
 * (vd. Hỏa Vân Kiếm Pháp ở "Bước vào tiên đồ", M7.4) không hơn gì món thường; nay mỗi món mang `itemId` + độ hiếm để `ui.ts` tô như mọi bảng khác (#509 "viền / màu độ hiếm đúng
 * ở mọi bảng"). Số lượng / tu vi lạ (không hữu hạn, <= 0) bị bỏ; id đồ lạ vẫn hiện bằng id (không ném lỗi).
 */
export function rewardParts(r: QuestReward | undefined): RewardPart[] {
  const parts: RewardPart[] = [];
  if (!r) return parts;
  if (typeof r.exp === "number" && Number.isFinite(r.exp) && r.exp > 0)
    parts.push({ text: `${r.exp} tu vi` });
  for (const it of r.items ?? []) {
    if (!it || typeof it.qty !== "number" || !Number.isFinite(it.qty) || it.qty <= 0) continue;
    // `ITEM_BY_ID["constructor"]` là hàm của Object: chỉ nhận khoá riêng của bảng (quy ước `byId` ở AGENTS.md)
    const def = Object.prototype.hasOwnProperty.call(ITEM_BY_ID, it.itemId)
      ? ITEM_BY_ID[it.itemId]
      : undefined;
    parts.push({
      text: `${def?.name ?? it.itemId} ×${it.qty}`,
      itemId: it.itemId,
      ...(def && typeof def.rarity === "number" ? { rarity: def.rarity } : {}),
    });
  }
  return parts;
}
