/**
 * HUD gọn trên điện thoại (M5.1, #326, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 4.2): cột HUD trái (HUD + Tổ đội + Nhiệm vụ) cao 318 px =
 * 82-88 % chiều cao ở điện thoại NGANG (844x390 / 667x375 / 640x360) và 73 % ở điện thoại dọc thấp (360x640). Bảng Nhiệm vụ là phần có
 * thể thu gọn mà vẫn đủ thông tin (còn tiêu đề + số nhiệm vụ): mặc định THU GỌN ở máy "gọn", người chơi bấm tiêu đề để mở / thu và
 * lựa chọn được nhớ (`tg_qt_open`). Hàm thuần, test không cần DOM.
 */

export const TRACKER_PREF_KEY = "tg_qt_open";

/** Chiều cao khung nhìn (CSS px) dưới mức này thì điện thoại DỌC cũng coi là gọn (360x640 cao 640). */
export const COMPACT_MAX_HEIGHT = 700;

export interface HudDisplay {
  form: string;
  orient: string;
  cssH: number;
}

/** Điện thoại ngang, hoặc điện thoại dọc thấp: HUD phải gọn. Tablet / máy tính không bao giờ gọn. */
export function isCompactHud(d: HudDisplay): boolean {
  if (d.form !== "phone") return false;
  if (d.orient === "landscape") return true;
  return Number.isFinite(d.cssH) && d.cssH < COMPACT_MAX_HEIGHT;
}

/** Lựa chọn đã lưu: "1" = mở, "0" = thu gọn, còn lại (chưa có / hỏng) = chưa chọn (null). */
export function parseTrackerPref(raw: unknown): boolean | null {
  return raw === "1" ? true : raw === "0" ? false : null;
}

/** Bảng Nhiệm vụ đang mở không: lựa chọn của người chơi thắng, chưa chọn thì mở trừ khi HUD gọn. */
export function trackerOpen(pref: boolean | null, d: HudDisplay): boolean {
  return pref ?? !isCompactHud(d);
}
