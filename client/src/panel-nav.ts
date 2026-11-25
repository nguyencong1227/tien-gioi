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

/**
 * Như `pickNeighbor` nhưng nút CỐ ĐỊNH theo màn hình (`fixed[i]`: nút Đóng tròn góc dưới phải của tấm ở điện thoại) chỉ được chọn khi không còn phần tử nào
 * khác theo hướng đó. Nút Đóng nằm cố định ở đáy màn hình nên ở danh sách dài đã cuộn nó luôn "gần hơn" hàng kế còn nằm ngoài tầm nhìn: bấm Xuống từ hàng
 * cuối nhìn thấy nhảy vào nút Đóng thay vì sang hàng kế (và Xuống tiếp thì vòng lên đầu danh sách), người dùng bàn phím không tới được các hàng bên dưới.
 */
export function pickNeighborSkipFixed(
  rects: readonly NavRect[],
  fixed: readonly boolean[],
  from: number,
  dir: NavDir,
): number | null {
  if (fixed[from]) return pickNeighbor(rects, from, dir);
  const keep: number[] = [];
  for (let i = 0; i < rects.length; i++) if (i === from || !fixed[i]) keep.push(i);
  const sub = pickNeighbor(
    keep.map((i) => rects[i]),
    keep.indexOf(from),
    dir,
  );
  return sub !== null ? keep[sub] : pickNeighbor(rects, from, dir);
}

/**
 * Phần tử mà mũi tên là của CHÍNH nó (chỉnh thanh trượt, đổi lựa chọn, di chuyển con trỏ chữ): không cướp mũi tên.
 * Thanh trượt nằm NGANG: chỉ Trái / Phải là của nó khi biết `dir`; Lên / Xuống vẫn chuyển focus, nếu không người chơi đứng ở thanh âm lượng
 * đầu Cài đặt sẽ không đi tiếp xuống được bằng mũi tên (chỉ còn Tab). Ô chọn (select) và ô chữ giữ mọi mũi tên (Tab là lối thoát).
 * Ô TÌM một dòng (`type="search"`: ô tìm món ở cửa hàng, ô tìm chiêu) cũng chỉ giữ Trái / Phải (con trỏ chữ): Lên / Xuống không có nghĩa gì trong ô một dòng,
 * mà giữ lại thì ô tìm là BẪY BÀN PHÍM (e2e:ban-phim đỏ ở cửa hàng 22 món từ khi có ô tìm: mũi tên đi xuống từ tab Mua rơi vào ô tìm rồi kẹt, không tới được nút + / Mua).
 * Ô số (`number`) vẫn giữ cả bốn phím vì Lên / Xuống đổi giá trị của nó.
 * Ô chữ một dòng còn lại (ô số lượng ở cửa hàng / kho tông môn là `type="text"`, Lên / Xuống do chính ô xử lý) NHẢ Trái / Phải khi con trỏ đã ở MÉP ô
 * (Trái ở đầu chữ, Phải ở cuối chữ, không bôi đen): không còn gì để di chuyển trong ô nên mũi tên đi tiếp sang phần tử lân cận. Trước đây ô số lượng là BẪY:
 * bấm Trái từ nút Mua (hoặc Lên từ nút Mua của thẻ dưới) rơi vào ô số lượng rồi kẹt, chỉ còn Tab / Esc (Esc làm mất chỗ đứng trong danh sách 22 món).
 */
export function ownsArrowKeys(el: Element | null, dir?: NavDir): boolean {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "select" || tag === "textarea") return true;
  if (tag === "input") {
    const type = (el as HTMLInputElement).type?.toLowerCase();
    if (type === "range" && dir) return dir === "left" || dir === "right";
    if (type === "search" && (dir === "up" || dir === "down")) return false;
    if (dir && caretAtEdge(el as HTMLInputElement, type, dir)) return false;
    return !(type === "checkbox" || type === "button" || type === "submit");
  }
  return Boolean((el as HTMLElement).isContentEditable);
}

/** Loại ô chữ một dòng đọc được vị trí con trỏ (`number` / `email` trả `null` ở `selectionStart`: không biết thì coi như con trỏ KHÔNG ở mép, ô giữ phím như cũ). */
const CARET_INPUT_TYPES = new Set(["text", "search", "tel", "url", "password"]);

/** Con trỏ đã ở mép theo hướng `dir` (Trái: ở đầu chữ, Phải: ở cuối chữ, không bôi đen)? Lên / Xuống: không (do ô tự xử lý). */
function caretAtEdge(input: HTMLInputElement, type: string | undefined, dir: NavDir): boolean {
  if (!type || !CARET_INPUT_TYPES.has(type)) return false;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (typeof start !== "number" || typeof end !== "number" || start !== end) return false;
  if (dir === "left") return start === 0;
  if (dir === "right") return end === (input.value ?? "").length;
  return false;
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
  const next = pickNeighborSkipFixed(
    els.map((el) => el.getBoundingClientRect()),
    els.map((el) => getComputedStyle(el).position === "fixed"),
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
