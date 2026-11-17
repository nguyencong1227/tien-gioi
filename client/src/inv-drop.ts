// Vứt đồ ở túi (lỗi túi đồ, QUYET_DINH_M3 mục 24): lớp THUẦN (không DOM) nên test được.
// Hộp xác nhận ghi rõ TÊN + SỐ LƯỢNG món sẽ vứt; kế hoạch vứt (`DropPlan`) chụp lại món + số lượng LÚC BẤM, đến lúc xác nhận phải kiểm lại túi vẫn còn đúng món
// đó (túi có thể đổi trong lúc hộp mở: nhặt đồ, dùng đan, máy chủ gửi lại túi) rồi mới gửi `dropItem`, để "Vứt" không bao giờ rơi vào món khác.
export interface DropSlot {
  itemId: string;
  qty: number;
}

export interface DropPlan {
  /** Chỉ số ô lúc bấm */
  index: number;
  itemId: string;
  /** Số lượng sẽ vứt (>= 1) */
  qty: number;
  /** Số lượng đang có lúc bấm */
  have: number;
  /** "Vứt hết" (gửi không kèm `qty`) hay "Vứt 1" */
  all: boolean;
}

type Slots = readonly (DropSlot | null | undefined)[];

/** Kế hoạch vứt cho ô `index`; `null` nếu ô không hợp lệ / trống / số lượng hỏng. `all` = "Vứt hết", ngược lại vứt đúng 1. */
export function planDrop(slots: Slots, index: number, all: boolean): DropPlan | null {
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) return null;
  const s = slots[index];
  if (!s || typeof s.itemId !== "string" || s.itemId === "") return null;
  if (!Number.isFinite(s.qty) || !(s.qty >= 1)) return null;
  const have = Math.floor(s.qty);
  return { index, itemId: s.itemId, qty: all ? have : 1, have, all };
}

/** Túi hiện tại còn đúng món + đủ số lượng như lúc lập kế hoạch không (nếu không thì HUỶ, không vứt món khác). */
export function dropStillValid(slots: Slots, plan: DropPlan): boolean {
  const s = slots[plan.index];
  return !!s && s.itemId === plan.itemId && Number.isFinite(s.qty) && s.qty >= plan.qty;
}

/**
 * Kế hoạch vứt sau khi người chơi chỉnh số trong ô số lượng (mục 47): kẹp vào [1, `have`], số hỏng thành 1. `plan` là kế hoạch GỐC lúc bấm nút (không phải kế hoạch đã chỉnh), nên
 * kéo số về đúng toàn bộ thì "Vứt hết" của lần bấm "Vứt hết" trở lại (gửi không kèm `qty`); chỉnh sang số khác thì luôn gửi `qty` cụ thể.
 */
export function withDropQty(plan: DropPlan, qty: number): DropPlan {
  const have = Math.max(1, Math.floor(plan.have));
  const q = Math.min(have, Math.max(1, Number.isFinite(qty) ? Math.floor(qty) : 1));
  return { ...plan, qty: q, all: plan.all && q === have };
}

/**
 * Lời hộp xác nhận: "Vứt hết Hồi Huyết Đan ×5?", "Vứt 3 Hồi Huyết Đan? (còn lại 2)", "Vứt Long Thố?" (chỉ có 1). Vứt đúng toàn bộ số đang có thì luôn nói "Vứt hết".
 * `name` là tên đầy đủ của món (không viết tắt).
 */
export function dropConfirmText(name: string, plan: DropPlan): string {
  if (plan.all || plan.qty >= plan.have)
    return plan.qty > 1 ? `Vứt hết ${name} ×${plan.qty}?` : `Vứt ${name}?`;
  return `Vứt ${plan.qty} ${name}? (còn lại ${plan.have - plan.qty})`;
}

/** Từ bậc phẩm (`ItemDef.rarity`) này trở lên là đồ quý: hộp xác nhận thêm một dòng nhắc. */
export const DROP_WARN_RARITY = 2;

/** Dòng nhắc cho đồ quý ("Đồ quý: Tiên phẩm. Vứt rồi không lấy lại được."), `null` nếu đồ thường. `rarityName` là tên bậc phẩm. */
export function dropWarnText(rarity: number, rarityName: string): string | null {
  if (!Number.isFinite(rarity) || rarity < DROP_WARN_RARITY) return null;
  return `Đồ quý: ${rarityName}. Vứt xuống đất rồi có thể mất.`;
}
