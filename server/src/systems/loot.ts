// Đồ rơi: quái chết rơi đồ, nhặt đồ, vứt đồ, hết quyền nhặt trước / biến mất theo thời gian.
import {
  LOOT_OWNER_MS, LOOT_DESPAWN_MS, PICKUP_RANGE, ITEM_BY_ID, rollDrops,
} from "@tien-gioi/shared";
import { Loot } from "../schema";
import { rand, type World, type MonsterCtrl } from "../world";
import { giveItem, sendInv, slotIndex, takeFromSlot } from "./inventory";

/** Tạo một món đồ rơi. owner = "" thì ai cũng nhặt được ngay. */
export function spawnLoot(w: World, itemId: string, qty: number, x: number, y: number, owner: string): string {
  const id = `l${++w.lootSeq}`;
  const l = new Loot();
  l.itemId = itemId; l.qty = qty; l.x = x; l.y = y; l.owner = owner;
  w.state.loot.set(id, l);
  w.lctrl.set(id, { ownerUntil: w.now + LOOT_OWNER_MS, expiresAt: w.now + LOOT_DESPAWN_MS });
  return id;
}

/**
 * Quái chết: tung bảng rơi đồ, đồ nằm rải quanh xác.
 * Người gây sát thương nhiều nhất (còn trong phòng, chưa trọng thương) được quyền nhặt trước.
 */
export function dropLoot(w: World, mc: MonsterCtrl, x: number, y: number) {
  let owner = "", best = 0;
  for (const [sid, dmg] of mc.damageBy) {
    const p = w.state.players.get(sid);
    if (p && !p.dead && dmg > best) { best = dmg; owner = sid; }
  }
  for (const d of rollDrops(mc.def.id)) {
    const a = rand(0, Math.PI * 2), r = rand(0, 16);
    spawnLoot(w, d.itemId, d.qty, x + Math.cos(a) * r, y + Math.sin(a) * r, owner);
  }
}

/** Nhặt đồ: phải đứng gần, đồ phải của mình hoặc hết quyền nhặt trước. Túi chỉ đủ một phần thì nhặt phần đó. */
export function pickup(w: World, sid: string, lootId: unknown) {
  const r = w.ready(sid);
  if (!r || typeof lootId !== "string") return;
  const l = w.state.loot.get(lootId);
  if (!l) return;
  const { p } = r;
  if (Math.hypot(l.x - p.x, l.y - p.y) > PICKUP_RANGE) return;
  if (l.owner && l.owner !== sid) return w.events.toast(sid, { text: "Vật phẩm này chưa thuộc về ngươi.", tone: "bad" });
  const left = giveItem(w, sid, l.itemId, l.qty);
  if (left === l.qty) return w.events.toast(sid, { text: "Túi đồ đã đầy.", tone: "bad" });
  if (left > 0) {
    l.qty = left;
    w.events.toast(sid, { text: "Túi đồ đã đầy.", tone: "bad" });
  } else {
    removeLoot(w, lootId);
  }
}

/** Vứt đồ ra đất dưới chân. Đồ vứt ra ai cũng nhặt được (để đưa đồ cho bạn). */
export function dropItem(w: World, sid: string, slot: unknown, qty?: unknown) {
  const r = w.ready(sid);
  const i = slotIndex(slot);
  if (!r || i < 0) return;
  const s = r.c.inv[i];
  if (!s || !ITEM_BY_ID[s.itemId]) return;
  const n = qty === undefined ? s.qty : typeof qty === "number" && Number.isInteger(qty) ? qty : 0;
  if (n < 1 || n > s.qty) return;
  const itemId = s.itemId;
  takeFromSlot(r.c.inv, i, n);
  spawnLoot(w, itemId, n, r.p.x, r.p.y, "");
  sendInv(w, sid);
}

export function removeLoot(w: World, id: string) {
  w.state.loot.delete(id);
  w.lctrl.delete(id);
}

/** Mỗi tick: hết hạn quyền nhặt trước thì mở cho mọi người; hết thời gian thì đồ biến mất. */
export function tickLoot(w: World) {
  for (const [id, lc] of w.lctrl) {
    if (w.now >= lc.expiresAt) { removeLoot(w, id); continue; }
    const l = w.state.loot.get(id);
    if (l?.owner && w.now >= lc.ownerUntil) l.owner = "";
  }
}

/** Người chơi rời phòng: đồ đang giữ quyền nhặt trước được mở cho mọi người. */
export function releaseLootOwner(w: World, sid: string) {
  w.state.loot.forEach((l) => { if (l.owner === sid) l.owner = ""; });
}
