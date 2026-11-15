import { MAIN_QUEST_START, QUESTS, QUEST_BY_ID } from "@tien-gioi/shared";

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

/** Loại nhiệm vụ: chuỗi chính, việc phụ (không lặp, ngoài chuỗi chính), hoặc lặp hằng ngày. */
export type QuestKind = "main" | "side" | "daily";

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
export function questKind(def: { id: string; daily?: boolean } | undefined): QuestKind {
  if (!def) return "side";
  if (def.daily) return "daily";
  return MAIN_CHAIN.has(def.id) ? "main" : "side";
}

/** Nhãn tiếng Việt của từng loại (thẻ nhiệm vụ đang làm). */
export const QUEST_KIND_LABEL: Readonly<Record<QuestKind, string>> = {
  main: "Chính tuyến",
  side: "Việc phụ",
  daily: "Hằng ngày",
};

/** Nhãn ngắn trên hộp thoại NPC (cùng hàng với tên nhiệm vụ). */
export const QUEST_KIND_BADGE: Readonly<Record<QuestKind, string>> = {
  main: "Chính",
  side: "Phụ",
  daily: "Lặp",
};

/** Vị trí của nhiệm vụ trong `QUESTS` = thứ tự chuỗi chính (nhiệm vụ nối nhau theo thứ tự khai báo). */
const ORDER: Record<string, number> = Object.fromEntries(QUESTS.map((q, i) => [q.id, i]));

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Các hàng của tab "Đã hoàn thành": nhiệm vụ chính tuyến theo thứ tự chuỗi, rồi nhiệm vụ lặp hôm nay.
 * Bỏ id lạ / id độc ("constructor", "__proto__": `QUEST_BY_ID["constructor"]` không phải `undefined`) và id trùng
 * (server gửi danh sách của file lưu: không tin). Một id vừa ở `done` vừa ở `dailyDone` tính theo định nghĩa (`daily` của nhiệm vụ).
 */
export function doneRows(done: readonly string[], dailyDone: readonly string[]): DoneRow[] {
  const seen = new Set<string>();
  const rows: DoneRow[] = [];
  for (const id of [...done, ...dailyDone]) {
    if (typeof id !== "string" || seen.has(id) || !has(QUEST_BY_ID, id)) continue;
    seen.add(id);
    const def = QUEST_BY_ID[id];
    const kind = questKind(def);
    rows.push({
      id,
      title: def.title,
      desc: def.desc,
      daily: kind === "daily",
      side: kind === "side",
    });
  }
  // Chính tuyến trước (theo thứ tự chuỗi), rồi việc phụ, rồi lặp (cũng theo thứ tự khai báo cho ổn định)
  const rank = (r: DoneRow) => (r.daily ? 2 : r.side ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b) || ORDER[a.id] - ORDER[b.id]);
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
