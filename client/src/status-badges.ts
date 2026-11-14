// Huy hiệu trạng thái của CHÍNH MÌNH ở HUD (M7.7 bước 3a, #508): mỗi trạng thái đang có (kể cả buff) là một ô nhỏ "tên + số giây còn lại", màu theo có hại / có lợi,
// dưới hàng Linh thạch / số đạo hữu. Dữ liệu từ `StatusTracker.active(now)` (server gửi `status`, client tự đếm lùi). Lớp THUẦN (mô hình + vẽ vào đối tượng DOM tối thiểu)
// nên test được không cần jsdom. Chỉ GHI DOM khi dấu hiệu đổi (id, số giây làm tròn lên, cường độ): gọi mỗi khung vẫn rẻ và trình đọc màn hình không bị đọc lại liên tục.
// Huy hiệu trên đầu quái / người khác cần `Monster.fx` công khai (hợp đồng đã có `STATUS_BIT`, schema ở M7.3 #504) nên làm ở bước sau.
import { STATUSES, statusOf, type StatusDef, type StatusEntry } from "@tien-gioi/shared";

/** Còn từng này giây trở xuống thì ô nhấp nháy (trừ khi giảm chuyển động): sắp hết, người chơi cần biết. */
export const BADGE_URGENT_SECS = 2;

/** Màu ô (chữ trên nền đặc): cặp có hại (đỏ) và có lợi (xanh). Chữ >= 4,5:1 trên nền (test giữ). */
export const BADGE_COLORS = {
  harmful: { fg: "#ffb8aa", bg: "#3d1a16", border: "#c0392b" },
  helpful: { fg: "#aef2bf", bg: "#16301f", border: "#3fa563" },
} as const;

export interface BadgeView {
  id: string;
  /** Tên đầy đủ ("Chảy máu") */
  name: string;
  harmful: boolean;
  /** Số giây còn lại, làm tròn LÊN (>= 1): ô còn hiện thì luôn >= 1 */
  secs: number;
  /** Chữ trên ô: "Độc 7", "Tê cóng −30% 4" */
  label: string;
  /** Câu cho trình đọc màn hình: tên, tác dụng, thời gian còn lại */
  aria: string;
  /** Sắp hết: nhấp nháy */
  urgent: boolean;
}

/** Câu tác dụng ngắn theo loại (cường độ chỉ có với tăng tốc / tê cóng: các loại khác KHÔNG ghi số vì server không gửi). */
export function effectText(def: StatusDef, ratio: number | undefined): string {
  const pct = ratio !== undefined && ratio > 0 ? Math.round(ratio * 100) : 0;
  switch (def.kind) {
    case "dot":
      return "mất khí huyết mỗi giây";
    case "slow":
      return pct > 0 ? `giảm ${pct}% tốc độ di chuyển` : "giảm tốc độ di chuyển";
    case "vuln":
      return "chịu thêm sát thương";
    case "stun":
      return "không di chuyển, không ra đòn được";
    case "shield":
      return "hấp thụ sát thương";
    case "haste":
      return pct > 0 ? `tăng ${pct}% tốc độ di chuyển` : "tăng tốc độ di chuyển";
    case "regen":
      return "hồi khí huyết mỗi giây";
  }
}

/** Số tiền tố chữ trên ô cho tăng tốc / tê cóng ("+30%" / "−30%"), rỗng cho loại khác hoặc khi chưa biết cường độ. */
function ratioTag(def: StatusDef, ratio: number | undefined): string {
  if (ratio === undefined || !(ratio > 0)) return "";
  if (def.kind === "haste") return ` +${Math.round(ratio * 100)}%`;
  if (def.kind === "slow") return ` −${Math.round(ratio * 100)}%`;
  return "";
}

/** Thứ tự cố định theo bảng `STATUSES` (ô không nhảy chỗ khi một cái làm mới): có hại trước, có lợi sau. */
const ORDER = new Map<string, number>(
  [...STATUSES]
    .sort((a, b) => Number(b.harmful) - Number(a.harmful))
    .map((d, i) => [d.id, i] as [string, number]),
);

/** Các ô hiển thị cho danh sách trạng thái còn hiệu lực (từ `StatusTracker.active`). Mục lạ / hết hạn bị bỏ. */
export function badgeViews(active: readonly StatusEntry[]): BadgeView[] {
  const out: BadgeView[] = [];
  for (const [id, ms, ratio] of active) {
    const def = statusOf(id);
    if (!def || !Number.isFinite(ms) || !(ms > 0)) continue;
    const secs = Math.max(1, Math.ceil(ms / 1000));
    out.push({
      id: def.id,
      name: def.name,
      harmful: def.harmful,
      secs,
      label: `${def.name}${ratioTag(def, ratio)} ${secs}`,
      aria: `${def.name}: ${effectText(def, ratio)}, còn ${secs} giây`,
      urgent: secs <= BADGE_URGENT_SECS,
    });
  }
  out.sort((a, b) => (ORDER.get(a.id) ?? 99) - (ORDER.get(b.id) ?? 99));
  return out;
}

/** Dấu hiệu đổi của cả hàng ô: giống nhau thì không cần vẽ lại. `label` đã chứa số giây nên cũng đủ cho `urgent` (suy ra từ số giây). */
export function badgeSignature(views: readonly BadgeView[]): string {
  return views.map((v) => `${v.id}:${v.label}`).join("|");
}

/** Danh sách trạng thái cho máy chủ giả: `?status=burn:5,haste:8:0.3` (id:giây[:cường độ]); id lạ / số hỏng bị bỏ, tối đa 4 mục. */
export function parseMockStatus(search: string, max = 4): StatusEntry[] {
  const raw = new URLSearchParams(search).get("status");
  if (!raw) return [];
  const out: StatusEntry[] = [];
  for (const part of raw.split(",")) {
    if (out.length >= max) break;
    const [id, secs, ratio] = part.split(":");
    const def = statusOf(id);
    const s = Number(secs);
    if (!def || !Number.isFinite(s) || !(s > 0)) continue;
    const r = ratio === undefined ? undefined : Number(ratio);
    if (r !== undefined && Number.isFinite(r)) out.push([def.id, s * 1000, r]);
    else out.push([def.id, s * 1000]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Vẽ DOM
// ---------------------------------------------------------------------------------------------------------------

export interface BadgeChild {
  className: string;
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  style: { setProperty(name: string, value: string): void };
}
/** `T` = kiểu nút con (ở trang thật là `HTMLElement`, ở test là đối tượng giả): hộp nhận đúng kiểu mà `doc` tạo ra. */
export interface BadgeBox<T extends BadgeChild = BadgeChild> {
  hidden: boolean;
  replaceChildren(...nodes: T[]): void;
}
export interface BadgeDoc<T extends BadgeChild = BadgeChild> {
  createElement(tag: string): T;
}

/** Vẽ hàng ô vào `box`: rỗng thì ẩn cả hàng (không chiếm chỗ ở HUD). Chỉ ghi khi dấu hiệu đổi. */
export class StatusBadgesDom<T extends BadgeChild = BadgeChild> {
  private sig = "";
  /** Số lần thực sự dựng lại DOM (cho test / script: gọi mỗi khung không được tăng liên tục) */
  rebuilds = 0;

  constructor(
    private readonly box: BadgeBox<T>,
    private readonly doc: BadgeDoc<T>,
  ) {}

  render(views: readonly BadgeView[]): void {
    const sig = badgeSignature(views);
    if (sig === this.sig) return;
    this.sig = sig;
    this.rebuilds++;
    this.box.hidden = views.length === 0;
    const nodes = views.map((v) => {
      const el = this.doc.createElement("span");
      const c = v.harmful ? BADGE_COLORS.harmful : BADGE_COLORS.helpful;
      el.className = `st-badge ${v.harmful ? "harmful" : "helpful"}${v.urgent ? " urgent" : ""}`;
      el.textContent = v.label;
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", v.aria);
      el.setAttribute("title", v.aria);
      el.setAttribute("data-status", v.id);
      el.style.setProperty("--st-fg", c.fg);
      el.style.setProperty("--st-bg", c.bg);
      el.style.setProperty("--st-border", c.border);
      return el;
    });
    this.box.replaceChildren(...nodes);
  }
}
