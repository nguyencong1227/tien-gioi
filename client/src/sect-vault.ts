// Kho đồ tông môn, phần LOGIC THUẦN ở client (QUYET_DINH_M3 mục 27, issue #788, `docs/THIET_KE_TONG_MON.md` mục 11): làm sạch ảnh chụp máy chủ gửi, quyết định nút Góp / Rút
// bật hay tắt (và vì sao), kế hoạch gửi tin + hộp xác nhận, dòng sổ. KHÔNG biết DOM / Phaser. Máy chủ vẫn là bên quyết định mọi thứ (hạn mức, khoá kỳ vọng theo ô, chống nhân
// đôi đồ): client chỉ báo trước cho người chơi thấy vì sao một nút không bấm được và gửi `itemId` ĐANG THẤY để máy chủ từ chối `vault_changed` nếu ô đã đổi.
import {
  ITEM_BY_ID,
  SECT_VAULT_DRAW_MAX,
  SECT_VAULT_LOG_MAX,
  SECT_VAULT_QTY_MAX,
  SECT_LEVELS,
  SECT_TERMS,
  SECT_VAULT_SLOTS,
  SECT_VAULT_SLOTS_MAX,
  sectVaultAccepts,
  sectVaultDrawQtyCap,
  type InvSlot,
  type SectRank,
  type SectVaultLogEntry,
  type SectVaultView,
} from "@tien-gioi/shared";
import type { ConfirmSpec } from "./act-confirm";
import { DROP_WARN_RARITY } from "./inv-drop";

/** Từ chừng này món trở lên là "số lớn": góp / rút phải qua hộp xác nhận (bảng `RA_SOAT_THAO_TAC.md`). */
export const VAULT_LARGE_QTY = 10;

function ownItem(id: unknown) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(ITEM_BY_ID, id)
    ? ITEM_BY_ID[id]
    : undefined;
}

function cleanSlot(raw: unknown): InvSlot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { itemId?: unknown; qty?: unknown };
  const def = ownItem(r.itemId);
  if (!def || typeof r.qty !== "number" || !Number.isFinite(r.qty)) return null;
  const qty = Math.min(def.stack, Math.floor(r.qty));
  return qty >= 1 ? { itemId: def.id, qty } : null;
}

function cleanLog(raw: unknown): SectVaultLogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<Record<keyof SectVaultLogEntry, unknown>>;
  const def = ownItem(r.itemId);
  if (!def || typeof r.name !== "string") return null;
  if (r.kind !== "deposit" && r.kind !== "withdraw") return null;
  if (typeof r.qty !== "number" || !Number.isFinite(r.qty) || r.qty < 1) return null;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0;
  return {
    at,
    name: r.name.slice(0, 40),
    kind: r.kind,
    itemId: def.id,
    qty: Math.floor(r.qty),
  };
}

/**
 * Làm sạch ảnh chụp kho đồ nhận từ máy chủ (client không tin tin nhắn): `SECT_VAULT_SLOTS` ô trở lên (các ô ĐÃ MỞ theo cấp tông, tới `SECT_VAULT_SLOTS_MAX`), món lạ / số lượng hỏng thành ô trống, số lượng kẹp theo chồng của món, sổ tối đa
 * `SECT_VAULT_LOG_MAX` dòng, `drawPerDay` kẹp [0, `SECT_VAULT_DRAW_MAX`], `myDrawsLeft` `null` hoặc số nguyên không âm, `lockMs` không âm. Hỏng hẳn: `null` (coi như chưa có kho).
 */
export function sanitizeVaultView(raw: unknown): SectVaultView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const rawSlots = Array.isArray(r.slots) ? r.slots : [];
  // M8: máy chủ chỉ gửi các ô ĐÃ MỞ theo cấp tông (độ dài = `unlocked`; cấp 1 = 40 như trước M8). Chỉ tin `unlocked` (không suy từ độ dài mảng: mảng dài hơn mà thiếu `unlocked` là rác);
  // máy chủ cũ không có `unlocked` thì luôn `SECT_VAULT_SLOTS`. Kẹp trong [SECT_VAULT_SLOTS, SECT_VAULT_SLOTS_MAX]: ô khoá không bao giờ vẽ như ô dùng được.
  const wantRaw =
    typeof r.unlocked === "number" && Number.isFinite(r.unlocked)
      ? Math.floor(r.unlocked)
      : SECT_VAULT_SLOTS;
  const open = Math.min(SECT_VAULT_SLOTS_MAX, Math.max(SECT_VAULT_SLOTS, wantRaw));
  const slots: (InvSlot | null)[] = [];
  for (let i = 0; i < open; i++) slots.push(cleanSlot(rawSlots[i]));
  const log: SectVaultLogEntry[] = [];
  if (Array.isArray(r.log))
    for (const e of r.log) {
      const c = cleanLog(e);
      if (c) log.push(c);
      if (log.length >= SECT_VAULT_LOG_MAX) break;
    }
  const dpd =
    typeof r.drawPerDay === "number" && Number.isFinite(r.drawPerDay)
      ? Math.min(SECT_VAULT_DRAW_MAX, Math.max(0, Math.floor(r.drawPerDay)))
      : 0;
  const left =
    typeof r.myDrawsLeft === "number" && Number.isFinite(r.myDrawsLeft) && r.myDrawsLeft >= 0
      ? Math.floor(r.myDrawsLeft)
      : null;
  const lock =
    typeof r.lockMs === "number" && Number.isFinite(r.lockMs) && r.lockMs > 0
      ? Math.floor(r.lockMs)
      : 0;
  return { slots, unlocked: open, log, drawPerDay: dpd, myDrawsLeft: left, lockMs: lock };
}

/**
 * Ghi chú về các ô CHƯA MỞ của kho (M8, mục 12.4): kho có tối đa `SECT_VAULT_SLOTS_MAX` ô, chỉ `unlocked` ô đầu dùng được theo cấp tông. Trả "" khi đã mở hết;
 * không thì nêu số ô còn khoá và cấp tông gần nhất mở thêm ô (lấy từ bảng `SECT_LEVELS`, không chép số).
 */
export function vaultLockedNote(unlocked: number): string {
  const open = Number.isFinite(unlocked) ? Math.max(0, Math.floor(unlocked)) : SECT_VAULT_SLOTS;
  if (open >= SECT_VAULT_SLOTS_MAX) return "";
  const next = SECT_LEVELS.find((l) => l.vaultSlots > open);
  const locked = SECT_VAULT_SLOTS_MAX - open;
  return next
    ? `Còn ${locked} ô chưa mở: ${SECT_TERMS.level.toLowerCase()} ${next.level} (${next.name}) mở thêm ${next.vaultSlots - open} ô.`
    : `Còn ${locked} ô chưa mở.`;
}

/** Lý do một nút Góp / Rút không bấm được (hiện bằng chữ cạnh nút, không chỉ bằng màu). */
export type VaultBlock =
  "no_selection" | "empty" | "denied" | "vault_full" | "no_draws" | "locked" | "no_rank";

const BLOCK_TEXT: Record<VaultBlock, string> = {
  no_selection: "Chọn một ô trước.",
  empty: "Ô này trống.",
  denied: "Món này không góp được vào kho.",
  vault_full: "Kho đã đầy, không còn chỗ cho món này.",
  no_draws: "Hôm nay đã hết lượt rút.",
  locked: "Kiếp này còn quá mới, chưa được rút.",
  no_rank: "Chức vụ của ngươi không rút được.",
};

export function vaultBlockText(b: VaultBlock): string {
  return BLOCK_TEXT[b];
}

/** Kho còn chỗ cho `qty` món `itemId` không (ô trống, hoặc ô cùng món còn chỗ trong chồng): chỉ để báo trước, máy chủ vẫn quyết định. */
export function vaultHasRoom(v: SectVaultView, itemId: string, qty: number): boolean {
  const def = ownItem(itemId);
  if (!def) return false;
  let left = qty;
  for (const s of v.slots) {
    if (s === null) left -= def.stack;
    else if (s.itemId === itemId) left -= def.stack - s.qty;
    if (left <= 0) return true;
  }
  return false;
}

/** Số món tối đa chọn được để GÓP từ ô túi `index` (0 nếu ô trống / hỏng). */
export function maxDepositQty(bag: readonly (InvSlot | null | undefined)[], index: number): number {
  const s = Number.isInteger(index) && index >= 0 && index < bag.length ? bag[index] : null;
  if (!s || !Number.isFinite(s.qty) || s.qty < 1) return 0;
  return Math.min(Math.floor(s.qty), SECT_VAULT_QTY_MAX);
}

/** Góp ô túi `index` được không: `null` = được, hoặc lý do. */
export function depositBlock(
  v: SectVaultView,
  bag: readonly (InvSlot | null | undefined)[],
  index: number,
): VaultBlock | null {
  const s = Number.isInteger(index) && index >= 0 && index < bag.length ? bag[index] : null;
  if (!s) return "empty";
  if (!sectVaultAccepts(s.itemId)) return "denied";
  if (!vaultHasRoom(v, s.itemId, 1)) return "vault_full";
  return null;
}

/** Rút ô kho `slot` được không: `null` = được, hoặc lý do. `rank` null = chưa biết chức vụ (không rút). */
export function withdrawBlock(
  v: SectVaultView,
  rank: SectRank | null,
  slot: number,
): VaultBlock | null {
  if (rank === null) return "no_rank";
  const s = Number.isInteger(slot) && slot >= 0 && slot < v.slots.length ? v.slots[slot] : null;
  if (!s) return "empty";
  if (v.lockMs > 0) return "locked";
  if (v.myDrawsLeft !== null && v.myDrawsLeft <= 0) return "no_draws";
  if (sectVaultDrawQtyCap(rank) === 0) return "no_rank";
  return null;
}

/** Số món tối đa chọn được để RÚT từ ô kho `slot`: số có trong ô, kẹp theo mỗi lượt của chức vụ (Đệ tử 10 món) và `SECT_VAULT_QTY_MAX`. */
export function maxWithdrawQty(v: SectVaultView, rank: SectRank | null, slot: number): number {
  const s = Number.isInteger(slot) && slot >= 0 && slot < v.slots.length ? v.slots[slot] : null;
  if (!s) return 0;
  const cap = sectVaultDrawQtyCap(rank);
  return Math.max(0, Math.min(s.qty, Number.isFinite(cap) ? cap : s.qty, SECT_VAULT_QTY_MAX));
}

/** Kẹp số lượng người chơi chỉnh vào [1, max] (số hỏng -> 1; max < 1 -> 0). */
export function clampQty(n: unknown, max: number): number {
  if (!Number.isFinite(max) || max < 1) return 0;
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 1;
  return Math.min(Math.floor(max), Math.max(1, v));
}

/** Dòng tóm tắt hạn mức rút của CHÍNH người xem (từ ảnh chụp). */
export function drawSummary(v: SectVaultView, rank: SectRank | null): string {
  if (v.lockMs > 0) {
    const min = Math.max(1, Math.ceil(v.lockMs / 60_000));
    return `Kiếp này còn mới: chưa rút được, còn khoảng ${min} phút.`;
  }
  if (v.myDrawsLeft === null) return "Lượt rút: không hạn.";
  const per = v.drawPerDay;
  if (per === 0) return "Tông chủ chưa cho Đệ tử rút kho đồ.";
  void rank;
  return `Lượt rút hôm nay: còn ${v.myDrawsLeft} / ${per}.`;
}

/** Kế hoạch gửi một tin góp / rút kèm hộp xác nhận (`null` = gửi thẳng). */
export interface VaultPlan {
  type: "deposit" | "withdraw";
  /** Nội dung tin gửi máy chủ (đúng hình `SectVaultDepositMsg` / `SectVaultWithdrawMsg`) */
  msg: { slot: number; qty: number; itemId?: string };
  itemId: string;
  qty: number;
  confirm: ConfirmSpec | null;
}

function name(itemId: string): string {
  return ownItem(itemId)?.name ?? itemId;
}

function precious(itemId: string): boolean {
  const d = ownItem(itemId);
  return !!d && (d.type === "equip" || d.rarity >= DROP_WARN_RARITY);
}

/** Kế hoạch GÓP `qty` món ở ô túi `index` (`null` nếu không góp được / số hỏng). Đồ quý, trang bị hoặc số lớn thì có hộp xác nhận. */
export function planDeposit(
  v: SectVaultView,
  bag: readonly (InvSlot | null | undefined)[],
  index: number,
  qty: number,
): VaultPlan | null {
  if (depositBlock(v, bag, index) !== null) return null;
  const max = maxDepositQty(bag, index);
  if (!Number.isInteger(qty) || qty < 1 || qty > max) return null;
  const s = bag[index]!;
  const q = precious(s.itemId);
  const big = qty >= VAULT_LARGE_QTY;
  const label = qty > 1 ? `${name(s.itemId)} ×${qty}` : name(s.itemId);
  return {
    type: "deposit",
    msg: { slot: index, qty },
    itemId: s.itemId,
    qty,
    confirm:
      q || big
        ? {
            text: `Góp ${label} vào kho tông môn?`,
            warn: q
              ? "Đồ quý: rút lại phải theo chức vụ (Đệ tử có hạn mức lượt mỗi ngày)."
              : "Số lượng lớn: rút lại phải theo chức vụ (Đệ tử có hạn mức lượt mỗi ngày).",
            ok: "Góp",
            cancel: "Giữ lại",
          }
        : null,
  };
}

/**
 * Kế hoạch RÚT `qty` món ở ô kho `slot` (`null` nếu không rút được / số hỏng). Gửi KÈM `itemId` đang thấy (khoá kỳ vọng). Hộp xác nhận khi chức vụ có HẠN MỨC (mỗi lần rút tốn một lượt trong
 * ngày), hoặc đồ quý / trang bị, hoặc số lớn.
 */
export function planWithdraw(
  v: SectVaultView,
  rank: SectRank | null,
  slot: number,
  qty: number,
): VaultPlan | null {
  if (withdrawBlock(v, rank, slot) !== null) return null;
  const max = maxWithdrawQty(v, rank, slot);
  if (!Number.isInteger(qty) || qty < 1 || qty > max) return null;
  const s = v.slots[slot]!;
  const limited = v.myDrawsLeft !== null;
  const q = precious(s.itemId);
  const big = qty >= VAULT_LARGE_QTY;
  const label = qty > 1 ? `${name(s.itemId)} ×${qty}` : name(s.itemId);
  let warn: string | null = null;
  if (limited) warn = `Tốn 1 lượt rút (còn ${v.myDrawsLeft} / ${v.drawPerDay} hôm nay).`;
  else if (q) warn = "Đồ quý trong kho chung của tông môn.";
  else if (big) warn = "Số lượng lớn.";
  return {
    type: "withdraw",
    msg: { slot, itemId: s.itemId, qty },
    itemId: s.itemId,
    qty,
    confirm:
      limited || q || big
        ? { text: `Rút ${label} từ kho tông môn?`, warn, ok: "Rút", cancel: "Giữ lại" }
        : null,
  };
}

/** Lúc xác nhận: ảnh chụp hiện tại còn ĐÚNG món + đủ số lượng như lúc bấm không (khác thì huỷ, không gửi theo lời hỏi cũ). */
export function planStillValid(
  v: SectVaultView | null,
  bag: readonly (InvSlot | null | undefined)[],
  plan: VaultPlan,
): boolean {
  if (!v) return false;
  const slot = plan.msg.slot;
  if (plan.type === "withdraw") {
    const s = slot >= 0 && slot < v.slots.length ? v.slots[slot] : null;
    return !!s && s.itemId === plan.itemId && s.qty >= plan.qty;
  }
  const s = slot >= 0 && slot < bag.length ? bag[slot] : null;
  return !!s && s.itemId === plan.itemId && s.qty >= plan.qty;
}

/** Dòng sổ kho đồ: "10:30 · Tiêu Viêm đã góp Hồi Huyết Đan ×5" (giờ theo máy người xem). */
export function vaultLogLine(e: SectVaultLogEntry): string {
  const d = new Date(e.at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const verb = e.kind === "deposit" ? "góp" : "rút";
  const item = e.qty > 1 ? `${name(e.itemId)} ×${e.qty}` : name(e.itemId);
  return `${hh}:${mm} · ${e.name} đã ${verb} ${item}`;
}

/** Các lựa chọn số lượt rút / ngày cho Tông chủ: 0 .. `SECT_VAULT_DRAW_MAX`. */
export function drawPerDayOptions(): number[] {
  return Array.from({ length: SECT_VAULT_DRAW_MAX + 1 }, (_, i) => i);
}
