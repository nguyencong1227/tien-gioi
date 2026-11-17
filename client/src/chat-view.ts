/**
 * Nhãn người nói ở dòng chat (M9, #1027 / #1079 / #1086): kênh (`[Đội]`, `[Tông môn]`), danh hiệu đang đeo và tên. THUẦN (không DOM): `ui.ts` dựng DOM bằng `textContent`.
 *
 * Danh hiệu đi theo `ChatOut.titleId` mà MÁY CHỦ điền từ `Player.title` lúc gửi (không bao giờ từ client). Client chỉ HIỆN khi cờ `?social=1` bật (M9 chưa phát hành);
 * id lạ (máy chủ mới hơn client) hoặc sai kiểu thì KHÔNG hiện gì và KHÔNG lộ id ra màn hình; tin cũ không có `titleId` thì y hệt trước đây.
 */
import { titleOf, type ChatOut } from "@tien-gioi/shared";

/** Nhãn kênh hiển thị (rỗng cho chat chung). */
export function channelTag(channel: ChatOut["channel"]): string {
  return channel === "party" ? "[Đội] " : channel === "sect" ? "[Tông môn] " : "";
}

/** Chữ danh hiệu để hiện ("«Tái Sinh»"); cờ tắt, thiếu, sai kiểu hoặc id lạ -> "". */
export function chatTitleText(titleId: unknown, socialOn: boolean): string {
  if (!socialOn) return "";
  const t = titleOf(titleId);
  return t === undefined || t.text === "" ? "" : `«${t.text}»`;
}

/** Ba mảnh của nhãn người nói: kênh, danh hiệu (có thể rỗng), tên kèm dấu hai chấm. Ghép lại cho người đọc màn hình: "[Đội] «Tái Sinh» Tên: ". */
export function chatSpeaker(
  m: Pick<ChatOut, "from" | "channel" | "titleId">,
  socialOn: boolean,
): { tag: string; title: string; name: string } {
  return {
    tag: channelTag(m.channel),
    title: chatTitleText(m.titleId, socialOn),
    name: `${m.from}: `,
  };
}
