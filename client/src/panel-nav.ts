/**
 * Điều hướng bảng bằng mũi tên (QUYET_DINH_M3 mục 13, #463): mũi tên chuyển focus sang phần tử LÂN CẬN theo hình học (không phải theo thứ tự
 * DOM) nên một mẫu duy nhất phủ túi (lưới), cửa hàng / lò rèn (danh sách thẻ có hàng nút), hội thoại (dãy lựa chọn), tông môn, nhiệm vụ,
 * cài đặt... mà không viết riêng từng bảng. Phần chọn là hàm THUẦN trên hình chữ nhật (test được); phần DOM mỏng ở `moveFocus`.
 */
import { getFocusableElements } from "./a11y";

export type NavDir = "up" | "down" | "left" | "right";

export interface NavRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const ARROW_DIR: Record<string, NavDir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Phím mũi tên -> hướng, hoặc `null`. */
export function dirOfArrowKey(key: string): NavDir | null {
  return ARROW_DIR[key] ?? null;
}

const center = (r: NavRect) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

/**
 * Chọn phần tử kế theo `dir` từ phần tử `from` trong danh sách `rects`; `null` nếu không có (mép bảng: KHÔNG vòng lại, để Esc / Tab là lối thoát).
 * Ứng viên phải nằm lệch về hướng đó (theo tâm). Ưu tiên phần tử CÙNG HÀNG / CỘT (hình chiếu chồng lên nhau theo trục vuông góc) gần nhất,
 * như bấm Xuống trong một cột nút thì sang nút ngay dưới; không có thì lấy phần tử có `khoảng cách dọc theo hướng + 2 x độ lệch ngang` nhỏ nhất.
 */
export function pickNeighbor(rects: readonly NavRect[], from: number, dir: NavDir): number | null {
  const cur = rects[from];
  if (!cur) return null;
  const c = center(cur);
  const horizontal = dir === "left" || dir === "right";
  const sign = dir === "right" || dir === "down" ? 1 : -1;
  let bestBeam = -1,
    bestBeamScore = Infinity;
  let bestAny = -1,
    bestAnyScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue;
    const r = rects[i];
    const rc = center(r);
    const forward = (horizontal ? rc.x - c.x : rc.y - c.y) * sign;
    if (!(forward > 0.5)) continue; // phải nằm về phía đó
    const lateral = Math.abs(horizontal ? rc.y - c.y : rc.x - c.x);
    // hình chiếu chồng lên nhau theo trục vuông góc = cùng hàng (trái / phải) hoặc cùng cột (lên / xuống)
    const overlap = horizontal
      ? Math.min(r.bottom, cur.bottom) - Math.max(r.top, cur.top) > 0
      : Math.min(r.right, cur.right) - Math.max(r.left, cur.left) > 0;
    if (overlap) {
      const score = forward + lateral * 0.01; // gần nhất trong hàng / cột, lệch ít thì thắng khi hoà
      if (score < bestBeamScore) {
        bestBeamScore = score;
        bestBeam = i;
      }
    }
    const score = forward + lateral * 2;
    if (score < bestAnyScore) {
      bestAnyScore = score;
      bestAny = i;
    }
  }
  const pick = bestBeam >= 0 ? bestBeam : bestAny;
  return pick >= 0 ? pick : null;
}

/** Phần tử mà mũi tên là của CHÍNH nó (chỉnh thanh trượt, đổi lựa chọn, di chuyển con trỏ chữ): không cướp mũi tên. */
export function ownsArrowKeys(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "select" || tag === "textarea") return true;
  if (tag === "input") {
    const type = (el as HTMLInputElement).type?.toLowerCase();
    return !(type === "checkbox" || type === "button" || type === "submit");
  }
  return Boolean((el as HTMLElement).isContentEditable);
}

/**
 * Chuyển focus trong `container` theo mũi tên `dir`. Chưa có focus trong bảng thì vào phần tử đầu tiên (nhìn thấy được).
 * Trả `true` nếu đã xử lý (để chặn mặc định: cuộn trang / di chuyển nhân vật).
 */
export function moveFocus(container: HTMLElement, dir: NavDir): boolean {
  const els = getFocusableElements(container);
  if (els.length === 0) return false;
  const active = document.activeElement as HTMLElement | null;
  let from = active ? els.indexOf(active) : -1;
  if (from < 0 && active) from = els.findIndex((el) => el.contains(active));
  if (from < 0) {
    els[0].focus();
    return true;
  }
  const next = pickNeighbor(
    els.map((el) => el.getBoundingClientRect()),
    from,
    dir,
  );
  if (next !== null) els[next].focus();
  return true; // ở mép: đứng yên nhưng vẫn nuốt phím (không để nhân vật đi / trang cuộn)
}

/**
 * Vẽ lại một bảng mà KHÔNG làm mất focus bàn phím (#463): bảng của game vẽ lại cả danh sách khi dữ liệu đổi (bấm +/-, server báo túi / nhiệm vụ
 * đổi), phần tử đang focus bị thay mới nên focus rơi về `body` và người dùng phải điều hướng lại từ đầu. Nhớ phần tử đang focus trong
 * `container` (theo `data-nav` nếu có, không thì theo thứ tự trong danh sách phần tử focus được), vẽ lại, rồi trả focus về phần tử tương ứng.
 */
export function withFocusKept(container: HTMLElement | null, render: () => void): void {
  const active = document.activeElement as HTMLElement | null;
  if (!container || !active || !container.contains(active)) {
    render();
    return;
  }
  const nav = active.dataset?.nav;
  const index = getFocusableElements(container).indexOf(active);
  render();
  if (container.contains(document.activeElement) && document.activeElement !== container) return; // focus còn sống
  let next: HTMLElement | null = null;
  if (nav) next = container.querySelector<HTMLElement>(`[data-nav="${CSS.escape(nav)}"]`);
  if (!next || next.matches(":disabled")) {
    const els = getFocusableElements(container);
    next = els.length === 0 ? null : els[Math.max(0, Math.min(index, els.length - 1))];
  }
  next?.focus();
}
