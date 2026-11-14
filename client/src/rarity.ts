// Độ hiếm của đồ (M7.8 #509, docs/THIET_KE_NHAN_VAT_6_O.md mục 4): trước đây CHỈ phân biệt bằng MÀU ở 11 chỗ của `ui.ts` (lục / lam / tím gần nhau với người khó phân biệt màu).
// Nay MỘT hàm quyết định cả ba tín hiệu: màu (`RARITY_COLORS` của shared), tên bậc (`RARITY_NAMES`) và DẤU PHỤ riêng từng bậc (◆, ◆◆, ◆◆◆, ★) hiện trước tên bằng CSS
// (`[data-mark]::before`: dấu đứng trước nên không bị cắt khi tên dài bị "..."). Lớp THUẦN (không DOM thật): `applyRarityText` chỉ đụng đối tượng có `style` / `dataset` / `title`.
import { RARITY_COLORS, RARITY_NAMES } from "@tien-gioi/shared";

/** Dấu phụ của năm bậc, khác nhau từng bậc (Phàm phẩm không dấu: bậc thường). */
export const RARITY_MARKS = ["", "◆", "◆◆", "◆◆◆", "★"] as const;

export interface RarityStyle {
  /** "#rrggbb" */
  color: string;
  /** Dấu phụ ("" cho bậc thường) */
  mark: string;
  /** Tên bậc ("Phàm phẩm"...) */
  name: string;
  /** Bậc đã chuẩn hoá 0..4 */
  tier: 0 | 1 | 2 | 3 | 4;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Bậc hợp lệ 0..4 từ giá trị bất kỳ (số lạ / rác / chuỗi thì về 0: không ném lỗi, không hiện "undefined"). */
export function rarityTier(r: unknown): 0 | 1 | 2 | 3 | 4 {
  return typeof r === "number" && Number.isInteger(r) && r >= 0 && r <= 4
    ? (r as 0 | 1 | 2 | 3 | 4)
    : 0;
}

export function rarityStyle(r: unknown): RarityStyle {
  const tier = rarityTier(r);
  return {
    color: hex(RARITY_COLORS[tier]),
    mark: RARITY_MARKS[tier],
    name: RARITY_NAMES[tier],
    tier,
  };
}

/** Phần của phần tử DOM mà các hàm dưới dùng (HTMLElement khớp). */
export interface RarityEl {
  style: { color: string };
  dataset: Record<string, string | undefined>;
  title: string;
}

/**
 * Gắn kiểu độ hiếm lên phần tử TÊN: màu chữ, `data-mark` (CSS vẽ dấu phụ trước tên), `data-rarity` (tên bậc) và `title` = tên bậc nếu chưa có chú thích riêng.
 * Bậc thường (Phàm phẩm): chỉ màu mặc định, không dấu, không `title`.
 */
export function applyRarityText(el: RarityEl, r: unknown): void {
  const s = rarityStyle(r);
  el.style.color = s.color;
  el.dataset.rarity = s.name;
  if (s.mark) {
    el.dataset.mark = s.mark;
    if (!el.title || el.dataset.rarityTitle === "1") {
      el.title = s.name;
      el.dataset.rarityTitle = "1";
    }
  } else {
    delete el.dataset.mark;
    if (el.dataset.rarityTitle === "1") {
      el.title = "";
      delete el.dataset.rarityTitle;
    }
  }
}

/** Phần của thẻ (ô nhỏ) mà huy hiệu góc dùng (HTMLElement khớp). */
export interface RarityCard {
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): unknown };
  dataset: Record<string, string | undefined>;
}

/**
 * Huy hiệu GÓC cho ô nhỏ (túi, thẻ trang bị) nơi tên bị cắt "..." nên không đặt dấu trước tên: `data-rbadge` (CSS vẽ ở góc trên trái) và biến `--rar` (màu bậc).
 * Bậc thường: không huy hiệu. Gọi lại với đồ khác thì ghi đè; ô trống thì `clearRarityBadge`.
 */
export function applyRarityBadge(el: RarityCard, r: unknown): void {
  const s = rarityStyle(r);
  el.style.setProperty("--rar", s.color);
  if (s.mark) el.dataset.rbadge = s.mark;
  else delete el.dataset.rbadge;
}

export function clearRarityBadge(el: RarityCard): void {
  el.style.removeProperty("--rar");
  delete el.dataset.rbadge;
}

/** Gỡ kiểu độ hiếm (ô trống / đổi sang đồ khác): màu về mặc định, bỏ dấu và chú thích do hàm trên đặt. */
export function clearRarityText(el: RarityEl): void {
  el.style.color = "";
  delete el.dataset.rarity;
  delete el.dataset.mark;
  if (el.dataset.rarityTitle === "1") {
    el.title = "";
    delete el.dataset.rarityTitle;
  }
}
