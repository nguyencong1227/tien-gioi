/**
 * Khung bảng "Xã hội" (M9, #1025 / #1026 / #1027): MỘT nút HUD mở MỘT bảng có ba tab
 * (Xếp hạng / Thành tựu / Sự kiện), không thêm nhiều nút HUD cho điện thoại.
 * Tệp này chỉ giữ phần THUẦN (danh sách tab, đi tab bằng mũi tên, cờ bật) để test được không cần DOM;
 * dữ liệu từng tab đến từ hợp đồng `shared/src/social.ts` (M9.1, #1020) ở các PR sau.
 */

export type SocialTabId = "rank" | "ach" | "event";

export interface SocialTabDef {
  id: SocialTabId;
  /** Chữ trên tab (tiếng Việt, không chữ Hán) */
  label: string;
}

/** Thứ tự tab = thứ tự trên màn hình; phần tử ĐẦU là tab mở sẵn. */
export const SOCIAL_TABS: readonly SocialTabDef[] = [
  { id: "rank", label: "Xếp hạng" },
  { id: "ach", label: "Thành tựu" },
  { id: "event", label: "Sự kiện" },
];

export const DEFAULT_SOCIAL_TAB: SocialTabId = SOCIAL_TABS[0].id;

/** Tra tab theo chuỗi bất kỳ (id từ nơi khác): lạ thì về tab mặc định, không ném lỗi. */
export function asSocialTab(v: unknown): SocialTabId {
  return SOCIAL_TABS.some((t) => t.id === v) ? (v as SocialTabId) : DEFAULT_SOCIAL_TAB;
}

/**
 * Mục kế khi bấm mũi tên trên một thanh tab bất kỳ (kiểu WAI-ARIA tablist): Trái / Lên = lùi, Phải / Xuống = tiến, vòng quanh hai đầu;
 * Home / End nhảy về đầu / cuối. Phím khác trả `null` (để phím đi tiếp như thường). `cur` lạ coi như mục đầu. Danh sách rỗng -> `null`.
 */
export function tabByKey<T extends string>(ids: readonly T[], cur: T, code: string): T | null {
  const n = ids.length;
  if (n === 0) return null;
  const i = Math.max(0, ids.indexOf(cur));
  switch (code) {
    case "ArrowRight":
    case "ArrowDown":
      return ids[(i + 1) % n];
    case "ArrowLeft":
    case "ArrowUp":
      return ids[(i - 1 + n) % n];
    case "Home":
      return ids[0];
    case "End":
      return ids[n - 1];
    default:
      return null;
  }
}

/** Tab chính của bảng Xã hội kế tiếp theo phím (xem `tabByKey`). */
export function socialTabByKey(cur: SocialTabId, code: string): SocialTabId | null {
  return tabByKey(
    SOCIAL_TABS.map((t) => t.id),
    cur,
    code,
  );
}

/**
 * Cờ tính năng Xã hội (nút HUD, phím Shift+G, banner trùm thế giới, danh hiệu): MẶC ĐỊNH BẬT (PR cuối của M9). `?social=0` (hoặc `off` / `false`) TẮT phía client: công tắc khẩn khi một
 * mảng gặp lỗi mà chưa kịp phát hành bản vá (người dùng thêm vào địa chỉ trang; máy chủ vẫn gửi tin, client bỏ). Cố ý KHÔNG nhớ vào localStorage (khỏi kẹt cờ ở máy người chơi).
 */
export function socialEnabled(search: string): boolean {
  const v = new URLSearchParams(search).get("social");
  return !(v === "0" || v === "off" || v === "false");
}
