// Túi đồ: nhận đồ, dùng đan dược, đồng bộ túi cho chủ túi.
// Túi nằm trong PlayerCtrl (dữ liệu riêng), chỉ gửi cho chủ qua tin nhắn `inv`.
import {
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  addToInventory,
  emptyInventory,
  type Inventory,
  type InvSlot,
} from "@tien-gioi/shared";
import type { World } from "../world";
import { gainExp } from "./progression";
import { refreshQuests } from "./quests";
import { byId } from "./lookup";

/** Đọc túi từ file lưu: bỏ món không còn tồn tại, ép số lượng về [1, stack], đúng 24 ô. */
export function sanitizeInventory(raw: unknown): Inventory {
  const inv = emptyInventory();
  if (!Array.isArray(raw)) return inv;
  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    const s = raw[i] as Partial<InvSlot> | null | undefined;
    const def = byId(ITEM_BY_ID, s?.itemId);
    const qty = Math.floor(Number(s?.qty));
    if (def && qty >= 1) inv[i] = { itemId: def.id, qty: Math.min(qty, def.stack) };
  }
  return inv;
}

/** Gửi lại toàn bộ túi + hồi chiêu còn lại cho chủ túi. */
export function sendInv(w: World, sid: string, gained?: InvSlot[]) {
  const c = w.ctrl.get(sid);
  if (!c) return;
  const cd: Record<string, number> = {};
  for (const [id, until] of c.itemCd) if (until > w.now) cd[id] = until - w.now;
  w.events.inv(sid, {
    slots: c.inv.map((s) => (s ? { ...s } : null)),
    cd,
    ...(gained?.length ? { gained } : {}),
  });
  refreshQuests(w, sid); // bước "collect" phụ thuộc túi đồ
}

/** Cho vật phẩm vào túi người chơi. Trả về số còn thừa (túi đầy). */
export function giveItem(w: World, sid: string, itemId: string, qty: number): number {
  const c = w.ctrl.get(sid);
  if (!c || !byId(ITEM_BY_ID, itemId)) return qty;
  const left = addToInventory(c.inv, itemId, qty);
  const got = Math.floor(qty) - left;
  if (got > 0) sendInv(w, sid, [{ itemId, qty: got }]);
  return left;
}

/**
 * Đổi đồ nguyên khối: trừ `remove` rồi thêm `add` trên một bản sao của túi.
 * Thiếu đồ hoặc túi không đủ chỗ thì không đổi gì và trả về false.
 */
export function exchangeItems(
  inv: Inventory,
  remove: { itemId: string; qty: number }[],
  add: { itemId: string; qty: number }[],
): boolean {
  const next = inv.map((s) => (s ? { ...s } : null));
  for (const r of remove) {
    let left = r.qty;
    for (let i = next.length - 1; i >= 0 && left > 0; i--) {
      const s = next[i];
      if (s?.itemId !== r.itemId) continue;
      const n = Math.min(left, s.qty);
      takeFromSlot(next, i, n);
      left -= n;
    }
    if (left > 0) return false;
  }
  for (const a of add) if (addToInventory(next, a.itemId, a.qty) > 0) return false;
  next.forEach((s, i) => (inv[i] = s));
  return true;
}

/** Số thứ tự ô hợp lệ (0..23) hoặc -1. */
export function slotIndex(slot: unknown): number {
  return typeof slot === "number" && Number.isInteger(slot) && slot >= 0 && slot < INVENTORY_SLOTS
    ? slot
    : -1;
}

/** Bớt qty món ở một ô, hết thì ô thành trống. */
export function takeFromSlot(inv: Inventory, i: number, qty: number) {
  const s = inv[i]!;
  s.qty -= qty;
  if (s.qty <= 0) inv[i] = null;
}

/** Dùng vật phẩm ở ô `slot` (hiện tại chỉ có đan dược). */
export function useItem(w: World, sid: string, slot: unknown) {
  const r = w.ready(sid); // đã trọng thương thì không dùng được
  const i = slotIndex(slot);
  if (!r || i < 0) return;
  const { p, c } = r;
  const s = c.inv[i];
  const def = s ? ITEM_BY_ID[s.itemId] : undefined;
  if (!def?.effect) return;
  const ready = c.itemCd.get(def.id) ?? 0;
  if (w.now < ready) {
    return w.events.toast(sid, {
      text: `${def.name} đang hồi, chờ ${Math.ceil((ready - w.now) / 1000)} giây.`,
      tone: "info",
    });
  }

  const e = def.effect;
  switch (e.kind) {
    case "healHp":
      if (p.hp >= p.maxHp)
        return w.events.toast(sid, { text: "Khí huyết đang đầy.", tone: "info" });
      p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * e.pct));
      break;
    case "healMp":
      if (p.mp >= p.maxMp) return w.events.toast(sid, { text: "Linh lực đang đầy.", tone: "info" });
      p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * e.pct));
      break;
    case "exp":
      if (p.exp >= p.expMax)
        return w.events.toast(sid, { text: "Tu vi đã đầy, hãy đột phá trước.", tone: "info" });
      gainExp(w, sid, p, Math.round(p.expMax * e.pct));
      break;
  }
  takeFromSlot(c.inv, i, 1);
  if (def.cooldown) c.itemCd.set(def.id, w.now + def.cooldown);
  sendInv(w, sid);
}

/** Lệnh thử nghiệm `/give <itemId> [qty]`: chỉ bật khi không chạy production. */
export function giveCommand(w: World, sid: string, args: string[]): void {
  if (process.env.NODE_ENV === "production") return;
  const [itemId, rawQty] = args;
  const def = byId(ITEM_BY_ID, itemId);
  if (!def) {
    return w.events.toast(sid, {
      text: `Không có vật phẩm "${itemId ?? ""}". Có: ${Object.keys(ITEM_BY_ID).join(", ")}`,
      tone: "bad",
    });
  }
  const qty = Math.min(999, Math.max(1, Math.floor(Number(rawQty ?? 1)) || 1));
  const left = giveItem(w, sid, def.id, qty);
  if (left > 0) w.events.toast(sid, { text: "Túi đồ đã đầy.", tone: "bad" });
}
