// Cửa hàng: mua đan của NPC bán hàng, bán đồ trong túi lấy Linh thạch (hợp đồng: shared/src/currency.ts).
// Mọi giao dịch trọn vẹn hoặc không gì cả; server kiểm tra lại tất cả, client chỉ gửi ý định.
import {
  COIN_CAP,
  ITEM_BY_ID,
  SHOP_BY_NPC,
  SHOP_MAX_QTY,
  buyPrice,
  sellPrice,
  type ToastMsg,
} from "@tien-gioi/shared";
import type { World } from "../world";
import { exchangeItems, sendInv, slotIndex, takeFromSlot } from "./inventory";
import { nearNpc } from "./npc";
import { changeCoin, trySpendCoin } from "./wallet";

const itemName = (id: string) => ITEM_BY_ID[id]?.name ?? id;

/** Số lượng hợp lệ: số nguyên trong 1..SHOP_MAX_QTY (loại NaN, lẻ, âm, quá lớn, sai kiểu). */
function validQty(qty: unknown): qty is number {
  return typeof qty === "number" && Number.isInteger(qty) && qty >= 1 && qty <= SHOP_MAX_QTY;
}

const toast = (w: World, sid: string, text: string, tone: ToastMsg["tone"]) =>
  w.events.toast(sid, { text, tone });

/** Mua `qty` vật phẩm `itemId` ở cửa hàng của NPC `npcId`. */
export function buy(w: World, sid: string, npcId: unknown, itemId: unknown, qty: unknown) {
  const r = nearNpc(w, sid, npcId); // còn sống, NPC có thật, đứng trong NPC_RANGE
  const shop = r && SHOP_BY_NPC[r.npc.id];
  // includes trên mảng, không tra bảng bằng khóa từ client: "constructor" không lọt qua
  if (!r || !shop || typeof itemId !== "string" || !shop.itemIds.includes(itemId)) return;
  if (!validQty(qty)) return;
  const total = buyPrice(itemId) * qty;
  if (!(total > 0)) return;
  if (r.c.coin < total) return toast(w, sid, "Không đủ Linh thạch.", "bad");
  // exchangeItems làm trên bản sao: túi không đủ chỗ cho cả qty thì không đổi gì
  if (!exchangeItems(r.c.inv, [], [{ itemId, qty }])) {
    return toast(w, sid, "Túi đồ đã đầy.", "bad");
  }
  trySpendCoin(w, sid, total); // đã kiểm đủ tiền ở trên
  sendInv(w, sid, [{ itemId, qty }]);
  toast(w, sid, `Đã mua ${qty} ${itemName(itemId)} (-${total} Linh thạch).`, "good");
}

/** Bán `qty` vật phẩm ở ô túi `slot` cho NPC `npcId` (chỉ ô túi; đồ đang mặc không bán được). */
export function sell(w: World, sid: string, npcId: unknown, slot: unknown, qty: unknown) {
  const r = nearNpc(w, sid, npcId);
  if (!r || !SHOP_BY_NPC[r.npc.id]) return;
  const i = slotIndex(slot);
  const s = i < 0 ? null : r.c.inv[i];
  if (!s || !validQty(qty)) return;
  const name = itemName(s.itemId);
  const unit = sellPrice(s.itemId);
  if (unit <= 0) return toast(w, sid, `${name} không bán được.`, "bad");
  if (qty > s.qty) return toast(w, sid, `Không đủ ${name} để bán.`, "bad");
  const total = unit * qty;
  // Ví không nhận hết thì không bán (không để người chơi mất đồ lấy tiền bị cắt)
  if (r.c.coin + total > COIN_CAP) return toast(w, sid, "Ví Linh thạch đã đầy.", "bad");
  takeFromSlot(r.c.inv, i, qty);
  changeCoin(w, sid, total);
  sendInv(w, sid);
  toast(w, sid, `Đã bán ${qty} ${name} (+${total} Linh thạch).`, "good");
}
