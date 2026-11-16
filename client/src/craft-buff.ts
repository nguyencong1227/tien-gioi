// Hiệu lực của CHẾ PHẨM (đan / phù, nghề nhỏ #514, issue #769) phía client: lớp THUẦN (không DOM, không Phaser) nên test được.
//  - Hộp xác nhận khi bấm qua cổng mà đang có hiệu lực chế phẩm: máy chủ XOÁ hiệu lực khi qua cổng (test server thật ở `WorldRoom.test.ts`, #767),
//    nên lời cảnh báo không sai. Buff của chiêu (tăng tốc, khiên, hồi phục) cũng mất nhưng ngắn: KHÔNG hỏi vì chúng (hỏi mãi gây phiền).
//  - Toast thành công khi dùng đan: máy chủ không gửi toast riêng (chỉ từ chối kèm lý do), nên client báo khi chip mới hiện ngay sau một lần bấm Dùng.
import { statusOf, type StatusEntry } from "@tien-gioi/shared";
import { effectText, remainWords } from "./status-badges";

/**
 * Loại trạng thái đến từ chế phẩm: đan hộ đạo (`breakAid`) và, ở lát 2, tăng cường chiêu (`amp`), giảm hồi chiêu (`cdr`). Là chuỗi (không phải `StatusKind`)
 * để thêm loại mới ở `shared/` không làm vỡ tệp này; thêm loại chế phẩm mới thì thêm vào đây (test bắt `breakAid`, `amp`, `cdr`).
 */
const CRAFT_KINDS: ReadonlySet<string> = new Set(["breakAid", "amp", "cdr"]);

export function isCraftKind(kind: string): boolean {
  return CRAFT_KINDS.has(kind);
}

/** Tên các hiệu lực chế phẩm đang còn (không trùng, giữ thứ tự), để cảnh báo "Qua cổng sẽ mất ...". Mục lạ / hết hạn / buff của chiêu bị bỏ. */
export function craftBuffNames(active: readonly StatusEntry[]): string[] {
  const out: string[] = [];
  for (const [id, ms] of active) {
    const def = statusOf(id);
    if (!def || !isCraftKind(def.kind) || !(ms > 0)) continue;
    if (!out.includes(def.name)) out.push(def.name);
  }
  return out;
}

/** Lời của hộp xác nhận qua cổng: "Qua cổng sẽ mất Hộ đạo. Vẫn đi?"; `null` khi không có gì để mất (khỏi hỏi). */
export function travelConfirmText(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return `Qua cổng sẽ mất ${names.join(", ")}. Vẫn đi?`;
}

/** Sau khi bấm Dùng, chip mới phải hiện trong chừng này ms (một vòng tin máy chủ) thì mới coi là do lần dùng đó. */
export const USE_TOAST_WINDOW_MS = 4000;

/**
 * Toast thành công khi dùng đan / phù: "Hộ đạo: cộng 15% xác suất đột phá lần kế trong 15 phút". Chỉ khi (a) vừa bấm Dùng (`useAt`, ms của người gọi,
 * `null` = chưa bấm) trong `USE_TOAST_WINDOW_MS`, và (b) có hiệu lực chế phẩm MỚI (id không có trong `before`) trong danh sách `after`. Máy chủ làm mới
 * cùng id (không xảy ra với đan: #766 từ chối) hoặc gửi lại danh sách vì lý do khác thì im. `null` = không báo.
 */
export function useSuccessText(
  before: ReadonlySet<string>,
  after: readonly StatusEntry[],
  useAt: number | null,
  now: number,
): string | null {
  if (useAt === null || !(now - useAt >= 0) || now - useAt > USE_TOAST_WINDOW_MS) return null;
  for (const [id, ms, ratio] of after) {
    const def = statusOf(id);
    if (!def || !isCraftKind(def.kind) || !(ms > 0) || before.has(id)) continue;
    return `${def.name}: ${effectText(def, ratio)} trong ${remainWords(Math.ceil(ms / 1000))}`;
  }
  return null;
}
