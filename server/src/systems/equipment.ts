// Trang bị: 6 ô (M7.4, #505). Ba ô công khai (vũ khí, pháp bào, hộ phù: `Player.weapon / robe / talisman`, ai cũng thấy để vẽ ngoại hình) và ba ô RIÊNG của chủ
// (hài, ngọc bội, pháp bảo: `Player.boots / jade / treasure` với `@view(TAG_OWNER)`). Chỉ số tính bằng statsFor(realm, tier, p) dùng chung với client; ô chưa mở ở
// cảnh giới hiện tại (pháp bảo trước Kim Đan) không có tác dụng và không mặc được (`equipSlotOpen`).
import {
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  EQUIP_SLOT_UNLOCK_REALM,
  ITEM_BY_ID,
  OWNER_EQUIP_SLOTS,
  REALMS,
  addToInventory,
  canEquip,
  emptyEquipment,
  equipSlotOpen,
  realmLabel,
  type EquipSlot,
  type Equipment,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { World } from "../world";
import { sendInv, slotIndex } from "./inventory";
import { applyStats } from "./progression";
import { byId } from "./lookup";
import { cdrOf, sendSkills } from "./skills";

/**
 * Đọc đồ đang mặc từ file lưu: chỉ giữ món có thật và đúng ô. Truyền `realm` thì bỏ cả ô CHƯA MỞ ở cảnh giới đó (file sửa tay đặt pháp bảo cho người chưa tới Kim Đan);
 * ô riêng chỉ có trong kết quả khi có món (ô vắng = trống: file / test cũ ba khoá giữ nguyên).
 */
export function sanitizeEquipment(raw: unknown, realm?: number): Equipment {
  const eq = emptyEquipment();
  if (!raw || typeof raw !== "object") return eq;
  for (const slot of EQUIP_SLOTS) {
    const id = (raw as Record<string, unknown>)[slot];
    if (byId(ITEM_BY_ID, id)?.equip?.slot !== slot) continue;
    if (realm !== undefined && !equipSlotOpen(slot, realm)) continue;
    eq[slot] = id as string;
  }
  return eq;
}

/** Đồ đang mặc của người chơi; ô riêng chỉ có khi không trống (cùng dạng với `sanitizeEquipment` / file lưu). */
export function equipmentOf(p: Player): Equipment {
  const eq: Equipment = { weapon: p.weapon, robe: p.robe, talisman: p.talisman };
  for (const slot of OWNER_EQUIP_SLOTS) if (p[slot]) eq[slot] = p[slot];
  return eq;
}

/** Đặt cả sáu ô từ `eq` (ô riêng vắng = trống: đặt lại về "" kể cả khi luân hồi). */
export function setEquipment(p: Player, eq: Equipment) {
  p.weapon = eq.weapon;
  p.robe = eq.robe;
  p.talisman = eq.talisman;
  p.boots = eq.boots ?? "";
  p.jade = eq.jade ?? "";
  p.treasure = eq.treasure ?? "";
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
  if (!equipSlotOpen(e.slot, p.realm)) {
    const need = EQUIP_SLOT_UNLOCK_REALM[e.slot] ?? 0;
    return w.events.toast(sid, {
      text: `Ô ${EQUIP_SLOT_NAMES[e.slot]} mở ở ${REALMS[need].name}.`,
      tone: "bad",
    });
  }
  const old = p[e.slot];
  const cdr0 = cdrOf(p);
  c.inv[i] = old ? { itemId: old, qty: 1 } : null;
  p[e.slot] = s.itemId;
  applyStats(p, false, c.mult);
  sendInv(w, sid);
  if (cdrOf(p) !== cdr0) sendSkills(w, sid); // giảm hồi chiêu đổi: ô chiêu cần `cdMax` mới
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
  const cdr0 = cdrOf(p);
  p[slot] = "";
  applyStats(p, false, c.mult);
  sendInv(w, sid);
  if (cdrOf(p) !== cdr0) sendSkills(w, sid);
}
