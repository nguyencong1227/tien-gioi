import { QUESTS, QUEST_BY_ID } from "@tien-gioi/shared";

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
}

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
    rows.push({ id, title: def.title, desc: def.desc, daily: Boolean(def.daily) });
  }
  // Chính tuyến trước (theo thứ tự chuỗi), lặp sau (cũng theo thứ tự khai báo cho ổn định)
  return rows.sort((a, b) => Number(a.daily) - Number(b.daily) || ORDER[a.id] - ORDER[b.id]);
}

/** Số nhiệm vụ chính tuyến (không lặp) của game: mẫu số của dòng tóm tắt. */
export const MAIN_QUEST_TOTAL = QUESTS.filter((q) => !q.daily).length;

/** Dòng tóm tắt đầu tab: "Chính tuyến 15 / 21 · Lặp hôm nay: 2" (không hiện phần lặp khi chưa làm). */
export function doneSummary(rows: readonly DoneRow[]): string {
  const main = rows.filter((r) => !r.daily).length;
  const daily = rows.length - main;
  const base = `Chính tuyến ${main} / ${MAIN_QUEST_TOTAL}`;
  return daily > 0 ? `${base} · Lặp hôm nay: ${daily}` : base;
}
