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
 * Tab kế khi bấm mũi tên trên thanh tab (kiểu WAI-ARIA tablist): Trái / Lên = lùi, Phải / Xuống = tiến,
 * vòng quanh hai đầu; Home / End nhảy về đầu / cuối. Phím khác trả `null` (để phím đi tiếp như thường).
 */
export function socialTabByKey(cur: SocialTabId, code: string): SocialTabId | null {
  const n = SOCIAL_TABS.length;
  const i = Math.max(
    0,
    SOCIAL_TABS.findIndex((t) => t.id === cur),
  );
  switch (code) {
    case "ArrowRight":
    case "ArrowDown":
      return SOCIAL_TABS[(i + 1) % n].id;
    case "ArrowLeft":
    case "ArrowUp":
      return SOCIAL_TABS[(i - 1 + n) % n].id;
    case "Home":
      return SOCIAL_TABS[0].id;
    case "End":
      return SOCIAL_TABS[n - 1].id;
    default:
      return null;
  }
}

/**
 * Cờ bật tính năng: nút HUD "Xã hội" và phím tắt CHỈ hoạt động khi `?social=1` (hoặc `?social=on`) cho đến khi cả ba
 * mảng M9.6-M9.8 xong; PR cuối của M9 đổi mặc định thành bật. Cố ý KHÔNG nhớ vào localStorage (khỏi kẹt cờ ở máy người chơi).
 */
export function socialEnabled(search: string): boolean {
  const v = new URLSearchParams(search).get("social");
  return v === "1" || v === "on";
}
