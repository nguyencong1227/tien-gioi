import {
  ITEM_BY_ID,
  MAIN_QUEST_START,
  MAP_BY_ID,
  NPC_BY_ID,
  QUESTS,
  QUEST_BY_ID,
  SECT_QUEST_GIVER,
  SECT_TERMS,
  isSectQuest,
  questDefAny,
  questReady,
  type DialogAction,
  type QuestCtx,
  type QuestProgress,
  type QuestReward,
} from "@tien-gioi/shared";
import { npcMapId } from "./quest-nav";

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

/**
 * Chữ "ĐÃ ĐỦ" khi nhiệm vụ xong mọi bước (QUYET_DINH_M3 mục 66): người chơi tưởng "làm xong mục tiêu" là xong nên PHẢI nói rõ còn việc phải làm (quay về trả) và đi đâu.
 * NPC thường: "ĐÃ ĐỦ — về gặp <NPC> ở <bản đồ> để trả nhiệm vụ" (bản đồ lạ / không rõ thì bỏ phần "ở ..."; NPC lạ thì "NPC"); nhiệm vụ tông môn trả ở bảng Tông môn,
 * tab Nội vụ (không có NPC để đi tới).
 */
export function questReadyText(def: { giver: string }): string {
  return `ĐÃ ĐỦ — ${questReadyTail(def)}`;
}

/** Phần "việc phải làm" dùng chung cho `questReadyText` và `questReadyToast`: "về gặp <NPC> ở <bản đồ> để trả nhiệm vụ" / "mở bảng ... để trả nhiệm vụ". */
function questReadyTail(def: { giver: string }): string {
  if (def.giver === SECT_QUEST_GIVER)
    return `mở bảng Tông môn > ${SECT_TERMS.hall} để trả nhiệm vụ`;
  const npc = Object.prototype.hasOwnProperty.call(NPC_BY_ID, def.giver)
    ? NPC_BY_ID[def.giver]
    : undefined;
  const mapId = npcMapId(def.giver);
  const where =
    mapId !== undefined && Object.prototype.hasOwnProperty.call(MAP_BY_ID, mapId)
      ? ` ở ${MAP_BY_ID[mapId].name}`
      : "";
  return `về gặp ${npc?.name ?? "NPC"}${where} để trả nhiệm vụ`;
}

/** Id các nhiệm vụ ĐÃ ĐỦ (trả được ngay) trong danh sách đang làm; id lạ / độc bị bỏ. */
export function readyQuestIds(active: readonly QuestProgress[], ctx: QuestCtx): Set<string> {
  const ids = new Set<string>();
  for (const a of active) {
    const def = questDefAny(a.id);
    if (def && questReady(def, a, ctx)) ids.add(def.id);
  }
  return ids;
}

/**
 * Nhiệm vụ VỪA đủ so với lần xem trước (thông báo MỘT lần, mục 66): `prev` là tập nhiệm vụ đã đủ ở lần trước; `null` = chưa có ảnh chụp nào (vừa vào phòng:
 * nhiệm vụ đã đủ từ trước KHÔNG được báo lại mỗi lần đăng nhập / qua cổng). Trả `notify` (id vừa đủ, theo thứ tự sổ) và `next` (tập mới để lần sau so).
 * Nhiệm vụ đã đủ mà vẫn đủ thì không báo lại; đủ -> thiếu (lỡ vứt đồ) -> đủ lại thì báo lại.
 */
export function newlyReadyQuests(
  prev: ReadonlySet<string> | null,
  active: readonly QuestProgress[],
  ctx: QuestCtx,
): { notify: string[]; next: Set<string> } {
  const next = readyQuestIds(active, ctx);
  if (prev === null) return { notify: [], next };
  return { notify: [...next].filter((id) => !prev.has(id)), next };
}

/**
 * Người theo dõi "nhiệm vụ vừa đủ" của MỘT phiên chơi (mục 66). Chưa có mốc cho tới khi đã nhận CẢ túi lẫn sổ nhiệm vụ lần đầu (server gửi túi rồi sổ ngay khi vào phòng;
 * điều kiện "thu thập" tính theo túi, nên chỉ có sổ hoặc chỉ có túi thì tính "đã đủ" sai): lần đầu chỉ lập mốc, nhiệm vụ đã đủ từ trước KHÔNG báo lại mỗi lần
 * đăng nhập / qua cổng. Sau đó mỗi lần `update` trả các id vừa đủ, mỗi id một lần.
 */
export class QuestReadyWatcher {
  private snap: Set<string> | null = null;
  private gotInv = false;
  private gotQuests = false;

  /** Đã nhận một tin túi. */
  noteInv(): void {
    this.gotInv = true;
  }

  /** Đã nhận một tin sổ nhiệm vụ. */
  noteQuests(): void {
    this.gotQuests = true;
  }

  /** Gọi sau mỗi lần túi hoặc sổ đổi (đã `note...` tương ứng): id nhiệm vụ cần báo ngay bây giờ. */
  update(active: readonly QuestProgress[], ctx: QuestCtx): string[] {
    if (!this.gotInv || !this.gotQuests) return [];
    const r = newlyReadyQuests(this.snap, active, ctx);
    this.snap = r.next;
    return r.notify;
  }
}

/** Chữ thông báo MỘT lần khi nhiệm vụ vừa đủ: "ĐÃ ĐỦ: <tên nhiệm vụ> — về gặp <NPC> ở <bản đồ> để trả". */
export function questReadyToast(def: { title: string; giver: string }): string {
  return `ĐÃ ĐỦ: ${def.title} — ${questReadyTail(def)}`;
}

/**
 * Phần thưởng để XEM TRƯỚC ở hộp thoại NPC (mục 66): lựa chọn nhận / trả nhiệm vụ mang `questId`; lựa chọn khác, id lạ / độc
 * (`questDefAny` đã chặn `constructor`, `__proto__`) hoặc nhiệm vụ không thưởng gì thì `undefined`. Đây là thưởng GỐC trong dữ liệu: tu vi thật khi trả có thể nhân hệ số
 * (tông môn / thử nghiệm), nên chữ xem trước ghi rõ "gốc" ở phía hiển thị, còn số thật do bảng thưởng sau khi trả cho biết.
 */
export function dialogRewardOf(action: DialogAction): QuestReward | undefined {
  if (action.kind !== "accept" && action.kind !== "turnIn") return undefined;
  const r = questDefAny(action.questId)?.rewards;
  return r && rewardParts(r).length > 0 ? r : undefined;
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
