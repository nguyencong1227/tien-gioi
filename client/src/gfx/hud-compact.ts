/**
 * HUD gọn (M5.1, #326, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 4.2; QUYET_DINH_M3 mục 15, `docs/THIET_KE_GIAO_DIEN_GON.md`): trên màn hẹp các bảng nổi
 * (Tổ đội, Nhiệm vụ, Chat) MẶC ĐỊNH THU GỌN để không che màn chơi; người chơi bấm tiêu đề để mở / thu và lựa chọn được nhớ (`tg_qt_open`,
 * `tg_party_open`, `tg_chat_open`). Hàm thuần, test không cần DOM.
 */

export const TRACKER_PREF_KEY = "tg_qt_open";

/** Chiều rộng khung nhìn (CSS px) dưới mức này thì coi là màn hẹp (cửa sổ trình duyệt nhỏ, máy tính bảng dọc nhỏ) dù không phải điện thoại. */
export const COMPACT_MAX_WIDTH = 700;

export interface HudDisplay {
  form: string;
  orient: string;
  cssH: number;
  /** Chiều rộng khung nhìn; thiếu / hỏng thì chỉ xét `form` */
  cssW?: number;
}

/**
 * Màn hẹp: MỌI điện thoại (dọc lẫn ngang, cao bao nhiêu cũng vậy) hoặc cửa sổ rộng dưới `COMPACT_MAX_WIDTH`. Máy tính / máy tính bảng đủ rộng thì không.
 * (Trước đây điện thoại dọc cao >= 700 px được coi là thoáng: cửa sổ ~550x900 bị xếp ba bảng chồng lên nhau che nửa màn.)
 */
export function isCompactHud(d: HudDisplay): boolean {
  if (d.form === "phone") return true;
  return typeof d.cssW === "number" && Number.isFinite(d.cssW) && d.cssW < COMPACT_MAX_WIDTH;
}

/** Lựa chọn đã lưu: "1" = mở, "0" = thu gọn, còn lại (chưa có / hỏng) = chưa chọn (null). */
export function parseTrackerPref(raw: unknown): boolean | null {
  return raw === "1" ? true : raw === "0" ? false : null;
}

/** Một bảng nổi đang mở không: lựa chọn của người chơi thắng, chưa chọn thì mở trừ khi màn hẹp. */
export function panelOpen(pref: boolean | null, d: HudDisplay): boolean {
  return pref ?? !isCompactHud(d);
}

/** Bảng Nhiệm vụ (giữ tên cũ cho chỗ gọi và test có sẵn). */
export const trackerOpen = panelOpen;

/** Khoá lưu trạng thái mở / thu của Tổ đội và Chat ("1" = mở, "0" = thu gọn; cùng quy ước với `TRACKER_PREF_KEY`). */
export const PARTY_PREF_KEY = "tg_party_open";
export const CHAT_PREF_KEY = "tg_chat_open";

/** Khoá lưu việc hiện bản đồ nhỏ ("1" = hiện, "0" = thu gọn thành nhãn tên khu; QUYET_DINH_M3 mục 17.2, #496). */
export const MINIMAP_PREF_KEY = "tg_minimap_open";

/** Bản đồ nhỏ đang hiện không: lựa chọn của người chơi thắng; CHƯA chọn thì HIỆN ở mọi màn (khác Tổ đội / Chat: bản đồ nhỏ nhỏ sẵn, và là nút mở bản đồ lớn trên cảm ứng). */
export function minimapOpen(pref: boolean | null): boolean {
  return pref ?? true;
}
