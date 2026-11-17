/**
 * Thẻ minh hoạ của từng TRÙM (ảnh AI lô 2, gói tải theo nhu cầu `art:trum`; docs/art/PHONG_CACH_MINH_HOA.md mục 4b / 5b; M7.12 / #513):
 * hiện làm ảnh đại diện nhỏ ở đầu thanh máu trùm (`boss-bar-ui.ts`). Ảnh dự phòng là CHỮ: thiếu thẻ / gói chưa tải xong / lỗi thì thanh
 * máu giữ nguyên như cũ (chỉ tên), không chỗ trống, không ảnh vỡ (`art-image.ts` `showArtImage`).
 *
 * `BOSS_CARDS` là DANH SÁCH THẺ ĐÃ VÀO GAME: `kind` trùm (id trong `MONSTERS` của `shared/`) -> tên tệp trong `client/public/packs/art-trum/`.
 * Lô 2 (4 thẻ) đã vào (17/11/2026). Thêm một thẻ = một dòng ở đây CÙNG PR với ảnh, tệp nguồn `docs/art/nguon/<tên>.json`, mục ở `CREDITS.md`
 * và `npm run build:packs` (`boss-card.test.ts` bắt dòng trỏ tới tệp không có / trùm không có / tên lệch khỏi `BOSS_CARD_BATCH`).
 */
import { artPackId } from "./gfx/packs";

/** Thư mục của gói `art:trum` trong `/packs/` (khớp `BOSS_CARD_BATCH.dir` ở `client/scripts/art/prompt-rules.mjs`, test kiểm). */
export const BOSS_CARD_DIR = "art-trum";

/** `kind` của trùm -> tên tệp thẻ (không kèm thư mục). Lô 2: bốn trùm có ảnh AI (mục 7 `CREDITS.md`). */
export const BOSS_CARDS: Readonly<Record<string, string>> = {
  mang: "the_xich_mang.webp",
  hac_giao: "the_hac_giao.webp",
  thien_han_vuong: "the_thien_han_vuong.webp",
  yeu_vuong: "the_yeu_vuong.webp",
};

/** Ghi đè khi thử trong trình duyệt thật (`?debug` / DEV, `check-boss-card.mjs`); bản chạy thật không bao giờ có mục. */
const overrides = new Map<string, string>();

/** Đặt (hoặc xoá nếu `file` là `null`) tên tệp thẻ của một loại trùm, chỉ để thử. */
export function setBossCardOverride(kind: string, file: string | null): void {
  if (file === null) overrides.delete(kind);
  else overrides.set(kind, file);
}

export interface BossCardTarget {
  packId: string;
  /** Đường dẫn tương đối trong `/packs/`, vd `art-trum/the_xich_mang.webp`. */
  file: string;
}

/**
 * Gói + tệp của thẻ một loại trùm, hoặc `null` nếu chưa có thẻ. `kind` đến từ state công khai của máy chủ nên tra bằng `hasOwnProperty`
 * (`BOSS_CARDS["constructor"]` không phải `undefined`) và chỉ nhận tên tệp là chuỗi không rỗng, không có dấu `/`.
 */
export function bossCardTarget(
  kind: unknown,
  cards: Readonly<Record<string, string>> = BOSS_CARDS,
): BossCardTarget | null {
  if (typeof kind !== "string") return null;
  let file: unknown = overrides.get(kind);
  if (file === undefined) {
    if (!Object.prototype.hasOwnProperty.call(cards, kind)) return null;
    file = cards[kind];
  }
  if (typeof file !== "string" || file.length === 0 || file.includes("/")) return null;
  return { packId: artPackId("trum"), file: `${BOSS_CARD_DIR}/${file}` };
}
