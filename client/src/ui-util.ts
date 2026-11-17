// Tiện ích thuần của HUD DOM, tách khỏi `ui.ts` (dọn ui.ts: mỗi PR một mô-đun, CHỈ chuyển mã, không đổi hành vi). Không giữ trạng thái, không nhập từ mô-đun giao diện khác.

export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export const fmt = (n: number) =>
  !Number.isFinite(n) || n < 0
    ? "0"
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : n >= 1e4
        ? `${(n / 1e3).toFixed(1)}k`
        : `${Math.floor(n)}`;

export const hexColor = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Đọc / ghi `localStorage` an toàn (chế độ riêng tư có thể chặn). */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* chế độ riêng tư: bỏ qua */
  }
}

/**
 * Gắn hành động bấm cho nút tạo động: chuột / chạm = `pointerdown` (nhanh, giữ hành vi cũ), bàn phím = Enter / Cách (#463).
 * Nút `<button>` chỉ nhận `click` khi bấm phím nên các nút chỉ nghe `pointerdown` không dùng được bằng bàn phím.
 */
export function onPress(el: HTMLElement, fn: () => void, stop = false) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (stop) e.stopPropagation();
    fn();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (!e.repeat) fn();
  });
}

/** Nút đang hiện và bấm được (không `disabled`; nit của A ở #470): không có tổ tiên nào bị `hidden` (hộp lời mời, HUD bí cảnh / quyết đấu, hộp xác nhận ẩn bằng thuộc tính `hidden` của hộp chứa). */
export function buttonShown(id: string): boolean {
  const el = document.getElementById(id);
  return el !== null && el.closest("[hidden]") === null && !(el as HTMLButtonElement).disabled;
}
