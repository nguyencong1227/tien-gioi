// Danh hiệu của người nói gắn vào tin chat (M9, `ChatOut.titleId`). Tách riêng để chat chung / đội / tông môn cùng dùng mà không vòng import (chat.ts gọi party.ts, sect.ts).
import { TITLE_ID_RE } from "@tien-gioi/shared";
import type { Player } from "../schema";

/**
 * Danh hiệu đang đeo của người nói để gắn vào `ChatOut.titleId` (M9): MÁY CHỦ điền từ `Player.title` LÚC GỬI, không bao giờ từ client. Không đeo (rỗng) hoặc id không đúng dạng
 * (`TITLE_ID_RE`: hồ sơ hỏng) thì `undefined` (tin không có trường này, y hệt tin cũ). Dùng cho cả chat chung, đội và tông môn.
 */
export function titleOf(p: Player | undefined): string | undefined {
  const t = p?.title;
  return typeof t === "string" && t !== "" && TITLE_ID_RE.test(t) ? t : undefined;
}

/** `{ titleId }` nếu có danh hiệu, không thì `{}` (để rải vào `ChatOut` mà không thêm trường `undefined`). */
export function titleField(p: Player | undefined): { titleId?: string } {
  const t = titleOf(p);
  return t === undefined ? {} : { titleId: t };
}
