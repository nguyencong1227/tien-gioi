/**
 * Ảnh minh hoạ AI tải THEO NHU CẦU (gói `art:*`, docs/art/PHONG_CACH_MINH_HOA.md mục 4; QUYẾT ĐỊNH ngân sách ảnh AI của A ở #998).
 *
 * Nơi dùng (thẻ trùm, chân dung NPC) KHÔNG biết gì về mạng: gọi `showArtImage(img, { packId, file })` rồi để `<img>` ẩn cùng ảnh dự phòng
 * bên cạnh (chữ / màu). Hàm này tải gói (một lần cho cả gói, `packs.ts`), lấy URL ĐÚNG tệp trong gói (có băm: khớp bộ nhớ đệm), và chỉ
 * HIỆN thẻ khi ảnh đã giải mã xong. Gói chưa có (manifest rỗng), lỗi, hết giờ chờ, tệp không có trong gói: thẻ vẫn ẩn, nơi dùng vẫn đủ
 * thông tin bằng chữ, KHÔNG ném lỗi, KHÔNG chặn gì. Gói về MUỘN (sau khi hết giờ chờ) thì áp dụng ngay nếu nơi dùng còn cần ảnh đó.
 *
 * Mỗi `<img>` chỉ phục vụ MỘT yêu cầu tại một thời điểm: gọi lại (đổi trùm, đổi NPC) thì yêu cầu cũ bị bỏ, kể cả khi nó về sau.
 */

import { applyMapCard, type CardImg } from "./map-card";
import { packs, type PackController } from "./gfx/packs";

/** Chờ gói tối đa chừng này (ms) trước khi bỏ cuộc (việc tải vẫn tiếp tục và áp dụng nếu về muộn). */
export const ART_WAIT_MS = 3000;

export interface ShowArtOptions {
  /** Id gói, vd `art:trum` (`artPackId("trum")`). */
  packId: string;
  /** Đường dẫn tương đối của tệp trong `/packs/`, vd `art-trum/the_xich_mang.webp`. */
  file: string;
  /** Hết giờ chờ (ms); mặc định `ART_WAIT_MS`. */
  timeoutMs?: number;
  /** Bộ nạp gói; mặc định bộ đang dùng của ứng dụng. */
  ctl?: PackController;
}

/** Mỗi `<img>` -> số thứ tự yêu cầu mới nhất (yêu cầu cũ về muộn thì so không khớp và bị bỏ). */
const latest = new WeakMap<object, number>();
let seq = 0;

/**
 * Áp một ảnh gói vào `<img>`. Ẩn ngay; hiện khi ảnh tải xong. Trả hàm HUỶ (nơi dùng đóng bảng / đổi nội dung): sau khi huỷ, ảnh về muộn
 * không hiện nữa. Gọi lại với cùng `<img>` tự huỷ yêu cầu cũ.
 */
export function showArtImage(img: CardImg, opt: ShowArtOptions): () => void {
  const ctl = opt.ctl ?? packs();
  const mine = ++seq;
  latest.set(img, mine);
  applyMapCard(img, null); // ẩn + bỏ src + bỏ bộ lắng nghe cũ
  let unsub: (() => void) | null = null;

  const current = (): boolean => latest.get(img) === mine;
  const apply = (): boolean => {
    if (!current()) return true; // yêu cầu cũ: bỏ, coi như xong
    const url = ctl.fileUrl(opt.packId, opt.file);
    if (url === null) return false;
    applyMapCard(img, url);
    return true;
  };

  void ctl
    .ensure(opt.packId, { timeoutMs: opt.timeoutMs ?? ART_WAIT_MS })
    .then((res) => {
      if (!current()) return;
      if (res === "loaded" || res === "cached") {
        apply();
        return;
      }
      // `failed` (kể cả hết giờ): gói có thể về MUỘN, lúc đó áp dụng nếu yêu cầu này còn hiệu lực. `skipped` (không có gói) thì thôi.
      if (res === "failed") {
        unsub = ctl.onReady((id) => {
          if (id !== opt.packId) return;
          if (apply()) {
            unsub?.();
            unsub = null;
          }
        });
      }
    })
    .catch(() => undefined); // `ensure` không ném lỗi; phòng thủ để không có lời hứa treo lỗi

  return () => {
    if (latest.get(img) === mine) latest.delete(img);
    unsub?.();
    unsub = null;
  };
}
