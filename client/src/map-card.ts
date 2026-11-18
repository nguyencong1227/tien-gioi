/**
 * Thẻ minh hoạ của từng bản đồ (ảnh AI, `docs/art/PHONG_CACH_MINH_HOA.md` lô 1; M7.12 / #513): hiện ở màn chuyển cảnh qua cổng
 * (`ui.showTransition`) cạnh tên bản đồ đích, lúc chờ gói bản đồ và nối phòng mới.
 *
 * `MAP_CARDS` là DANH SÁCH ẢNH ĐÃ VÀO GAME: bản đồ nào chưa có ảnh thì KHÔNG có mục và màn chuyển cảnh vẫn như cũ (chỉ tên). Thêm một
 * ảnh = một dòng ở đây CÙNG LÚC với tệp ở `client/public/assets/ai/`, tệp nguồn `docs/art/nguon/<tên>.json` và mục ở `CREDITS.md`
 * (`npm run check:credits` bắt thiếu; `map-card.test.ts` bắt dòng trỏ tới tệp không có / bản đồ không có).
 */

/** Đường dẫn gốc của ảnh AI (cùng chỗ với nền màn đăng nhập, `style.css`). */
export const MAP_CARD_DIR = "/assets/ai/";

/** `mapId` -> tên tệp trong `MAP_CARD_DIR`. Lô 1 (năm bản đồ) đã vào game; bản đồ mới thì thêm dòng CÙNG PR với ảnh. */
export const MAP_CARDS: Readonly<Record<string, string>> = {
  lac_ha: "the_lac_ha.webp",
  hac_phong: "the_hac_phong.webp",
  bi_canh_linh_hu: "the_linh_hu.webp",
  am_suong: "the_am_suong.webp",
  han_van: "the_han_van.webp",
};

/** Ghi đè khi thử trong trình duyệt thật (`?debug` / DEV, `check-map-card.mjs`); bản chạy thật không bao giờ có mục. */
const overrides = new Map<string, string>();

/** Đặt (hoặc xoá nếu `url` là `null`) đường dẫn thẻ của một bản đồ, chỉ để thử. */
export function setMapCardOverride(mapId: string, url: string | null): void {
  if (url === null) overrides.delete(mapId);
  else overrides.set(mapId, url);
}

/**
 * Đường dẫn thẻ của bản đồ, hoặc `null` nếu chưa có ảnh. `mapId` đến từ máy chủ nên tra bằng `hasOwn` (không trả `Object.prototype`:
 * `MAP_CARDS["constructor"]` không phải `undefined`).
 */
export function mapCardUrl(
  mapId: unknown,
  cards: Readonly<Record<string, string>> = MAP_CARDS,
): string | null {
  if (typeof mapId !== "string") return null;
  const over = overrides.get(mapId);
  if (over !== undefined) return over;
  if (!Object.prototype.hasOwnProperty.call(cards, mapId)) return null;
  const file = cards[mapId];
  return typeof file === "string" && file.length > 0 ? `${MAP_CARD_DIR}${file}` : null;
}

/** Phần của `HTMLImageElement` mà `applyMapCard` dùng (để test bằng đối tượng giả). */
export interface CardImg {
  hidden: boolean;
  src: string;
  onload: ((ev: Event) => void) | null;
  onerror: ((ev: Event | string) => void) | null;
  removeAttribute(name: string): void;
}

/**
 * Áp thẻ vào thẻ `<img>` của màn chuyển cảnh. `url = null` (chưa có ảnh): ẩn thẻ, bỏ `src`. Có `url`: ẨN cho tới khi ảnh tải XONG (không
 * hiện ô trống / biểu tượng ảnh vỡ), lỗi thì vẫn ẩn: màn chuyển cảnh luôn dùng được với chữ như cũ. Bỏ `src` trước khi đặt lại để
 * trình duyệt luôn bắn `load` (đặt lại đúng URL cũ không chắc bắn) và để thẻ của bản đồ trước KHÔNG nháy lên rồi mới đổi.
 */
export function applyMapCard(img: CardImg, url: string | null): void {
  img.onload = null;
  img.onerror = null;
  img.hidden = true;
  img.removeAttribute("src");
  if (url === null) return;
  img.onload = () => {
    img.hidden = false;
  };
  img.onerror = () => {
    img.hidden = true;
  };
  img.src = url;
}
