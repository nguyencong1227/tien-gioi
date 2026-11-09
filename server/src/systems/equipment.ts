// Trang bị: 3 ô (vũ khí, pháp bào, hộ phù). Đồ đang mặc nằm công khai trên Player trong state
// (weapon / robe / talisman), chỉ số tính bằng statsFor(realm, tier, p) dùng chung với client.
import {
  EQUIP_SLOTS,
  ITEM_BY_ID,
  REALMS,
  addToInventory,
  canEquip,
  emptyEquipment,
  realmLabel,
  type EquipSlot,
  type Equipment,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { World } from "../world";
import { sendInv, slotIndex } from "./inventory";
import { applyStats } from "./progression";
import { byId } from "./lookup";

/** Đọc đồ đang mặc từ file lưu: chỉ giữ món có thật và đúng ô. */
export function sanitizeEquipment(raw: unknown): Equipment {
  const eq = emptyEquipment();
  if (!raw || typeof raw !== "object") return eq;
  for (const slot of EQUIP_SLOTS) {
    const id = (raw as Record<string, unknown>)[slot];
    if (byId(ITEM_BY_ID, id)?.equip?.slot === slot) eq[slot] = id as string;
  }
  return eq;
}

export function equipmentOf(p: Player): Equipment {
  return { weapon: p.weapon, robe: p.robe, talisman: p.talisman };
}

export function setEquipment(p: Player, eq: Equipment) {
  p.weapon = eq.weapon;
  p.robe = eq.robe;
  p.talisman = eq.talisman;
}

function isEquipSlot(v: unknown): v is EquipSlot {
  return typeof v === "string" && (EQUIP_SLOTS as string[]).includes(v);
}

/** Mặc món ở ô túi `slot`. Món đang mặc cùng ô trang bị về lại đúng ô túi đó (đổi chỗ, không cần ô trống). */
export function equip(w: World, sid: string, slot: unknown) {
  const r = w.ready(sid);
  const i = slotIndex(slot);
  if (!r || i < 0) return;
  const { p, c } = r;
  const s = c.inv[i];
  const e = s ? ITEM_BY_ID[s.itemId]?.equip : undefined;
  if (!s || !e) return;
  if (!canEquip(s.itemId, p.realm, p.tier)) {
    const need = realmLabel(e.reqRealm, Math.min(e.reqTier, REALMS[e.reqRealm].tiers.length - 1));
    return w.events.toast(sid, { text: `Cần đạt ${need} mới mặc được.`, tone: "bad" });
  }
  const old = p[e.slot];
  c.inv[i] = old ? { itemId: old, qty: 1 } : null;
  p[e.slot] = s.itemId;
  applyStats(p, false);
  sendInv(w, sid);
}

/** Tháo món ở ô trang bị về túi. Túi đầy thì từ chối, không mất đồ. */
export function unequip(w: World, sid: string, slot: unknown) {
  const r = w.ready(sid);
  if (!r || !isEquipSlot(slot)) return;
  const { p, c } = r;
  const id = p[slot];
  if (!id) return;
  if (addToInventory(c.inv, id, 1) > 0)
    return w.events.toast(sid, { text: "Túi đồ đã đầy.", tone: "bad" });
  p[slot] = "";
  applyStats(p, false);
  sendInv(w, sid);
}
