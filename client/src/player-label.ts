/**
 * Nhãn trên đầu người chơi (M9.8, #1027): `[tông]` / `«danh hiệu»` / đạo hiệu / cảnh giới. THUẦN để test được.
 * Danh hiệu là ID NGẮN (`Player.title`, state công khai): client tra `TITLES` ra chữ; id lạ (máy chủ mới hơn client) hoặc rỗng thì KHÔNG hiện gì (không lộ id).
 * Danh hiệu nằm cùng dòng với biệt hiệu tông môn (không thêm dòng thứ tư làm nhãn cao hơn đầu người ở khung nhỏ).
 */
import { TITLE_BY_ID } from "@tien-gioi/shared";

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Chữ danh hiệu từ id ngắn; rỗng / lạ / không phải chuỗi -> "" (không hiện). */
export function titleTextOf(id: unknown): string {
  return typeof id === "string" && id !== "" && hasOwn(TITLE_BY_ID, id) ? TITLE_BY_ID[id].text : "";
}

export interface PlayerLabelIn {
  name: string;
  /** "Luyện Khí Tầng 9" (đã định dạng). */
  realm: string;
  /** Biệt hiệu tông môn (không kèm ngoặc); rỗng / thiếu = không có. */
  sect?: string;
  /** `Player.title` (id ngắn); chỉ được dùng khi `showTitle` bật. */
  title?: string;
  /** Đang thách đấu PK (tiền tố ⚔). */
  duel?: boolean;
  /** Cờ Xã hội (mặc định bật; `?social=0` tắt): tắt thì không hiện danh hiệu. */
  showTitle?: boolean;
}

/** Nhãn nhiều dòng: [dòng tông + danh hiệu] / đạo hiệu / cảnh giới. */
export function playerLabelText(p: PlayerLabelIn): string {
  const sect = p.sect ? `[${p.sect}]` : "";
  const title = p.showTitle ? titleTextOf(p.title) : "";
  const top = [sect, title ? `«${title}»` : ""].filter(Boolean).join(" ");
  const name = `${p.duel ? "⚔ " : ""}${p.name}`;
  return top ? `${top}\n${name}\n${p.realm}` : `${name}\n${p.realm}`;
}
