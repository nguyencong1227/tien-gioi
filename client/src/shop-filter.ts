/**
 * Lọc / tìm hàng MUA ở cửa hàng NPC (rà giao diện 25/11): lái buôn / dược sư bán 22 món (20 kinh quyển + đan dược), mỗi thẻ trên điện thoại cao 190-270 px nên tìm một quyển
 * phải cuộn cả ngàn điểm ảnh. Dùng lại khuôn của sổ chiêu (`skill-filter.ts`, CT11a): tìm theo tên (không cần gõ dấu, nhiều từ phải khớp hết). THUẦN (không DOM, không đồng hồ):
 * `ui.ts` đọc ô nhập rồi gọi các hàm ở đây.
 *
 * Nguyên tắc như sổ chiêu: không biến đổi danh sách đầu vào; không dùng RegExp từ chuỗi người chơi gõ; thứ tự giữ nguyên (cửa hàng sắp hàng theo ý người soạn dữ liệu);
 * đầu vào lạ (không phải chuỗi) về mặc định chứ không ném lỗi.
 */
import { foldText, SKILL_QUERY_MAX } from "./skill-filter";

/** Từ bấy nhiêu món bán trở lên mới hiện ô tìm (cửa hàng 4-6 món nhìn một lượt hết, ô tìm chỉ thêm rối). Cùng ngưỡng với sổ chiêu (`SKILL_FILTER_MIN`). */
export const SHOP_FILTER_MIN = 8;

/** Chuỗi tìm đã làm sạch từ đầu vào bất kỳ: không phải chuỗi -> "", cắt về `SKILL_QUERY_MAX` (chặn dán cả đoạn văn). */
export function cleanShopQuery(raw: unknown): string {
  return typeof raw === "string" ? raw.slice(0, SKILL_QUERY_MAX) : "";
}

/** Chuỗi tìm có đang LỌC bớt gì không (chỉ khoảng trắng thì không). */
export function shopFilterActive(q: unknown): boolean {
  return foldText(cleanShopQuery(q)) !== "";
}

/** Một món có qua chuỗi tìm không: MỖI từ trong chuỗi phải xuất hiện trong tên hoặc mô tả (không phân biệt hoa thường, không cần dấu). Chuỗi trống: qua hết. */
export function shopItemMatches(name: string, desc: string, q: unknown): boolean {
  const tokens = foldText(cleanShopQuery(q))
    .split(" ")
    .filter((t) => t !== "");
  if (tokens.length === 0) return true;
  const hay = foldText(`${name} ${desc}`);
  return tokens.every((t) => hay.includes(t));
}

/** Lọc danh sách id món (không sửa đầu vào, giữ nguyên thứ tự). `info` trả tên + mô tả của id; id không có trong bảng (`undefined`) bị bỏ khi đang lọc, giữ khi không lọc. */
export function filterShopIds(
  ids: readonly string[],
  q: unknown,
  info: (id: string) => { name: string; desc: string } | undefined,
): string[] {
  if (!shopFilterActive(q)) return [...ids];
  return ids.filter((id) => {
    const it = info(id);
    return it !== undefined && shopItemMatches(it.name, it.desc, q);
  });
}

/** Dòng đếm cạnh ô tìm: "Hiện 5 / 22 món" khi đang lọc, "22 món" khi không. Số lạ (NaN / âm / lẻ) về số nguyên không âm. */
export function shopFilterSummary(shown: number, total: number, active: boolean): string {
  const s = Number.isFinite(shown) ? Math.max(0, Math.floor(shown)) : 0;
  const t = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  return active ? `Hiện ${s} / ${t} món` : `${t} món`;
}
