// Vẽ bốn ô chiêu thức L U I O lên DOM (M7.6, #507). Chỉ GHI khi dấu hiệu của ô đổi (tên, tầng, trạng thái, số giây, phím), vòng quét hồi chiêu chỉ ghi
// khi nhích >= 2%: gọi mỗi khung hình vẫn rẻ và không làm trình đọc màn hình đọc lại liên tục. Không biết Phaser; đối tượng DOM tối thiểu để test không cần jsdom.
import { REALMS, SLOT_UNLOCK_REALM, type SkillSlot } from "@tien-gioi/shared";
import { elementColor, levelPips, shortName, slotAriaLabel, type SlotView } from "./skill-bar";
import { lockIconSvg, skillIconSvg } from "./skill-icon";

export interface BarChild {
  textContent: string | null;
  innerHTML: string;
  style: { setProperty(name: string, value: string): void };
}
export interface BarEl {
  className: string;
  setAttribute(name: string, value: string): void;
  querySelector(sel: string): BarChild | null;
}
export interface BarDoc {
  getElementById(id: string): BarEl | null;
}

/** Số chiêu đã gắn: câu của nhóm ô (`role="group"`). */
export function groupLabel(filled: number): string {
  return filled > 0
    ? `Ô chiêu thức 2 đến 5, đã gắn ${filled} chiêu`
    : "Ô chiêu thức 2 đến 5, chưa có chiêu";
}

/** Chữ nhỏ dưới ô: tên viết tắt khi có chiêu; ô khoá ghi cảnh giới mở; ô trống ghi số ô. */
export function slotCaption(v: SlotView): string {
  if (v.def) return shortName(v.def.name);
  if (v.kind === "locked")
    return shortName(REALMS[SLOT_UNLOCK_REALM[v.slot]]?.name ?? String(v.slot), 10);
  return String(v.slot);
}

/** Chấm tầng ("●●○"): rỗng khi không có chiêu. */
export function pipsText(level: number): string {
  const n = levelPips(level);
  return n === 0 ? "" : "●".repeat(n) + "○".repeat(3 - n);
}

export class SkillBarDom {
  /** Dấu hiệu lần vẽ cuối của từng ô (không có = chưa vẽ) */
  private sig = new Map<SkillSlot, string>();
  private iconKey = new Map<SkillSlot, string>();
  private sweep = new Map<SkillSlot, number>();
  private groupFilled = -1;

  constructor(private doc: BarDoc) {}

  /** Buộc vẽ lại mọi ô lần tới (đổi phím, đổi ngôn ngữ chữ). */
  invalidate(): void {
    this.sig.clear();
    this.iconKey.clear();
    this.sweep.clear();
    this.groupFilled = -1;
  }

  /** Vẽ nhóm: câu mô tả theo số chiêu đã gắn. */
  renderGroup(filled: number): void {
    if (filled === this.groupFilled) return;
    this.groupFilled = filled;
    const g = this.doc.getElementById("skill-slots");
    g?.setAttribute("aria-label", groupLabel(filled));
    // cụm cảm ứng chọn bố cục theo số chiêu đã gắn (CSS `[data-filled]`): 1-2 hàng ngang, 3-4 khối 2 x 2
    g?.setAttribute("data-filled", String(filled));
  }

  /** Vẽ một ô. Trả `true` nếu có ghi vào DOM (để test / đo). */
  render(v: SlotView, keys: readonly string[]): boolean {
    const el = this.doc.getElementById(`sk-slot${v.slot}`);
    if (!el) return false;
    let wrote = false;
    const sig = `${v.kind}|${v.skillId}|${v.level}|${v.cdSec}|${v.mpCost}|${keys.join("+")}`;
    if (this.sig.get(v.slot) !== sig) {
      this.sig.set(v.slot, sig);
      wrote = true;
      el.className = `sk slot k-${v.kind}`;
      const label = slotAriaLabel(v, keys);
      el.setAttribute("aria-label", label);
      el.setAttribute("title", label);
      el.setAttribute("aria-disabled", v.canCast ? "false" : "true");
      // biểu tượng chỉ dựng lại khi đổi chiêu / đổi dạng (khoá hay thiếu cảnh giới dùng ổ khoá), không phải mỗi giây khi đếm lùi
      const iconKey = `${v.kind === "locked" || v.kind === "needRealm" ? "L" : "S"}|${v.skillId}`;
      const ico = el.querySelector(".ico");
      if (ico && this.iconKey.get(v.slot) !== iconKey) {
        this.iconKey.set(v.slot, iconKey);
        const lock = v.kind === "locked" || v.kind === "needRealm";
        ico.innerHTML = lock ? lockIconSvg() : v.def ? skillIconSvg(v.def) : "";
        // màu hệ qua biến CSS (`.skico svg` trong style.css): thuộc tính SVG bị CSS của `.ico svg` đè
        ico.style.setProperty("--si-c", !lock && v.def ? elementColor(v.def.element) : "");
      }
      const nm = el.querySelector(".nm");
      if (nm) nm.textContent = slotCaption(v);
      const pips = el.querySelector(".pips");
      if (pips) pips.textContent = pipsText(v.level);
      const cdn = el.querySelector(".cdn");
      if (cdn) cdn.textContent = v.cdSec > 0 ? String(v.cdSec) : "";
    }
    // vòng quét: phần còn lại 0..1, ghi khi nhích >= 2%
    const frac = v.kind === "cooldown" ? Math.round(v.cdFrac * 50) / 50 : 0;
    if (this.sweep.get(v.slot) !== frac) {
      this.sweep.set(v.slot, frac);
      wrote = true;
      el.querySelector(".cdv")?.style.setProperty("--cd", String(frac));
    }
    return wrote;
  }
}
