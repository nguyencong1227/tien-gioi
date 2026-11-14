// Bảng trang bị SÁU Ô (M7.4, #505, docs/THIET_KE_NHAN_VAT_6_O.md mục 3-4). Lớp THUẦN (dữ liệu + câu chữ, không đụng DOM / Phaser) nên test được; `ui.ts` chỉ vẽ.
// Hợp đồng ở `shared/` (#585): `EQUIP_SLOTS` (sáu ô, đúng thứ tự lưới 3 x 2), `EQUIP_SLOT_UNLOCK_REALM` + `equipSlotOpen`, `STAT_CAPS`, `Stats.crit / cdr / guard` (tổng từ trang bị ĐÃ KẸP
// bởi `statsFor`), `TREASURES[].desc` (câu hoàn chỉnh, client chỉ hiển thị). Client KHÔNG tự cộng, tự kẹp, tự diễn giải số: mọi con số đi qua `statsFor` / `equipBonus` của máy chủ.
// Ba ô riêng (`boots`, `jade`, `treasure`) chỉ chủ nhận (`@view(TAG_OWNER)`); ô vắng hoặc `""` = trống. Dữ liệu từ state là đầu vào KHÔNG tin được: giá trị lạ về trống.
import {
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  EQUIP_SLOT_UNLOCK_REALM,
  ITEM_BY_ID,
  REALMS,
  STAT_CAPS,
  equipSlotOpen,
  realmLabel,
  treasureOf,
  type EquipSlot,
  type EquipStats,
  type ItemDef,
  type Stats,
} from "@tien-gioi/shared";

/** Đủ sáu ô (ô trống = ""). */
export type FullEquip = Record<EquipSlot, string>;

/** Dựng đủ sáu ô từ `player` trong state (hoặc đối tượng giống thế). Giá trị không phải chuỗi / vắng -> "". */
export function equipmentOf(p: { [K in EquipSlot]?: unknown } | null | undefined): FullEquip {
  const out = {} as FullEquip;
  for (const s of EQUIP_SLOTS) {
    const v = p?.[s];
    out[s] = typeof v === "string" ? v : "";
  }
  return out;
}

/**
 * `player` trong state có KHÁC `eq` ở ô nào không (so sáu ô, giá trị không phải chuỗi tính là trống). KHÔNG cấp phát: `hud()` chạy mỗi khung, chỉ dựng `FullEquip` mới (bằng
 * `equipmentOf`) khi hàm này báo đổi.
 */
export function equipDiffers(
  p: { [K in EquipSlot]?: unknown } | null | undefined,
  eq: FullEquip,
): boolean {
  for (const s of EQUIP_SLOTS) {
    const v = p?.[s];
    if ((typeof v === "string" ? v : "") !== eq[s]) return true;
  }
  return false;
}

/** Tra món theo id không tin được: `ITEM_BY_ID["constructor"]` không phải `undefined`. */
export function itemOf(id: unknown): ItemDef | undefined {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(ITEM_BY_ID, id)
    ? ITEM_BY_ID[id]
    : undefined;
}

/** Tên cảnh giới cho câu "Mở ở ...": chỉ tên cảnh giới lớn ("Kim Đan"), không ghi bậc. */
function unlockRealmText(realm: number): string {
  return REALMS[realm]?.name ?? realmLabel(realm, 0);
}

/** Câu "Mở ở Kim Đan" nếu ô `slot` CHƯA mở ở cảnh giới `realm`; `null` nếu đã mở (hoặc ô không có điều kiện mở). */
export function slotLockText(slot: unknown, realm: number): string | null {
  if (equipSlotOpen(slot, realm)) return null;
  if (
    typeof slot !== "string" ||
    !Object.prototype.hasOwnProperty.call(EQUIP_SLOT_UNLOCK_REALM, slot)
  )
    return null;
  const need = EQUIP_SLOT_UNLOCK_REALM[slot as EquipSlot];
  return need === undefined ? null : `Mở ở ${unlockRealmText(need)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Lưới sáu ô
// ---------------------------------------------------------------------------------------------------------------

export interface SlotView {
  slot: EquipSlot;
  /** "Vũ khí", "Hài", "Pháp bảo"... */
  label: string;
  itemId: string;
  /** Món đang mặc (đúng ô); `undefined` = trống. Ô CHƯA MỞ luôn `undefined`: máy chủ bỏ qua chỉ số của ô đó nên không hiển thị như đang có tác dụng. */
  def: ItemDef | undefined;
  locked: boolean;
  /** "Mở ở Kim Đan" khi khoá, ngược lại `null` */
  lockText: string | null;
  /** Câu cho trình đọc màn hình */
  aria: string;
}

/** Sáu thẻ theo đúng thứ tự `EQUIP_SLOTS` (hàng trên: ba ô công khai, hàng dưới: ba ô riêng). */
export function slotViews(eq: FullEquip, realm: number): SlotView[] {
  return EQUIP_SLOTS.map((slot) => {
    const label = EQUIP_SLOT_NAMES[slot];
    const lockText = slotLockText(slot, realm);
    const locked = !equipSlotOpen(slot, realm);
    const raw = itemOf(eq[slot]);
    // Món mặc sai ô (tệp lưu hỏng) bị `equipBonus` bỏ qua: hiển thị như trống cho khớp chỉ số.
    const def = !locked && raw?.equip?.slot === slot ? raw : undefined;
    const aria = locked
      ? `${label}: khoá${lockText ? `, ${lockText}` : ""}`
      : def
        ? `${label}: ${def.name}, chạm để tháo`
        : `${label}: trống`;
    return { slot, label, itemId: eq[slot], def, locked, lockText, aria };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Chỉ số phần trăm mới (bạo kích, giảm hồi chiêu, giáp) với trần `STAT_CAPS`
// ---------------------------------------------------------------------------------------------------------------

export type PctKey = "crit" | "cdr" | "guard";

export const PCT_STATS: ReadonlyArray<{ key: PctKey; label: string }> = [
  { key: "crit", label: "Bạo kích" },
  { key: "cdr", label: "Giảm hồi chiêu" },
  { key: "guard", label: "Giáp (giảm sát thương)" },
];

/** Số làm tròn một chữ số thập phân, không hữu hạn -> 0 (điểm % từ trang bị thường là số nguyên). */
function fmt(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : "0";
}

export interface PctRow {
  key: PctKey;
  label: string;
  val: number;
  cap: number;
  /** Đang ở trần: ghi "(tối đa)" */
  atCap: boolean;
  /** Chênh khi mặc thử món xem trước (null = không xem trước) */
  diff: number | null;
  /** Đồ xem trước có cộng chỉ số này nhưng KHÔNG còn làm tăng vì đã chạm trần */
  maxed: boolean;
  /** "12%" hoặc "40% (tối đa)" */
  valueText: string;
  /** "▲+5%", "▼-3%", "▲+5% (tối đa)" (mặc thử thì chạm trần), "đã tối đa", hoặc rỗng */
  diffText: string;
  aria: string;
}

/**
 * Ba dòng chỉ số %: `cur` / `preview` là `Stats` do `statsFor` trả (đã kẹp), `candidate` là chỉ số của món xem trước (để biết món đó có cộng chỉ số này mà bị trần chặn).
 * Mũi tên ▲ / ▼ đi kèm số nên người khó phân biệt màu vẫn đọc được.
 */
export function pctRows(
  cur: Pick<Stats, PctKey>,
  preview: Pick<Stats, PctKey> | null,
  candidate?: EquipStats,
): PctRow[] {
  return PCT_STATS.map(({ key, label }) => {
    const cap = STAT_CAPS[key];
    const val = Number.isFinite(cur[key]) ? cur[key] : 0;
    const atCap = val >= cap;
    const diff = preview ? (Number.isFinite(preview[key]) ? preview[key] : 0) - val : null;
    const maxed = diff === 0 && atCap && (candidate?.[key] ?? 0) > 0;
    const valueText = `${fmt(val)}%${atCap ? " (tối đa)" : ""}`;
    let diffText = "";
    if (maxed) diffText = "đã tối đa";
    else if (diff !== null && diff !== 0) {
      const next = val + diff;
      diffText = `${diff > 0 ? `▲+${fmt(diff)}` : `▼${fmt(diff)}`}%${diff > 0 && next >= cap ? " (tối đa)" : ""}`;
    }
    return {
      key,
      label,
      val,
      cap,
      atCap,
      diff,
      maxed,
      valueText,
      diffText,
      aria: `${label}: ${valueText}${diffText ? `, ${diffText}` : ""}`,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// So sánh và mô tả đồ
// ---------------------------------------------------------------------------------------------------------------

export interface StatDelta {
  key: string;
  label: string;
  d: number;
  unit: string;
}

/** Các chỉ số ĐỔI khi mặc thử (bỏ chỉ số bằng nhau), theo thứ tự cố định. */
export function statDeltas(now: Stats, next: Stats): StatDelta[] {
  const all: StatDelta[] = [
    { key: "atk", label: "Công", d: next.atk - now.atk, unit: "" },
    { key: "maxHp", label: "Khí huyết", d: next.maxHp - now.maxHp, unit: "" },
    { key: "maxMp", label: "Linh lực", d: next.maxMp - now.maxMp, unit: "" },
    { key: "speed", label: "Tốc độ", d: next.speed - now.speed, unit: "" },
    { key: "crit", label: "Bạo kích", d: next.crit - now.crit, unit: "%" },
    { key: "cdr", label: "Giảm hồi chiêu", d: next.cdr - now.cdr, unit: "%" },
    { key: "guard", label: "Giáp", d: next.guard - now.guard, unit: "%" },
  ];
  return all.filter((x) => Number.isFinite(x.d) && x.d !== 0);
}

/** "Công +5", "Giáp -3%". */
export function deltaText(x: StatDelta): string {
  const d = Number.isFinite(x.d) ? x.d : 0; // số hỏng coi như 0 TRƯỚC khi chọn dấu (không "+0%" cho Infinity)
  return `${x.label} ${d > 0 ? `+${fmt(d)}` : fmt(d)}${x.unit}`;
}

/** Số dương hữu hạn (điểm % từ trang bị): `Infinity` / `NaN` / số âm không được in thành "+Infinity%" hay "+-3%". */
const pos = (n: number | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** Câu khi món không cộng chỉ số nào (và không có nội tại) */
export const NO_STATS_TEXT = "Không cộng chỉ số";

/** Câu mô tả chỉ số của một món: "+5 Công · +3% Bạo kích"; thêm câu nội tại nếu là pháp bảo (`treasure`); không có gì thì "Không cộng chỉ số". */
export function describeEquipStats(stats: EquipStats, treasure?: unknown): string {
  const parts: string[] = [];
  if (stats.atk) parts.push(`+${stats.atk} Công`);
  if (stats.hp) parts.push(`+${stats.hp} Khí huyết`);
  if (stats.mp) parts.push(`+${stats.mp} Linh lực`);
  if (stats.speed) parts.push(`+${stats.speed} Tốc độ`);
  if (pos(stats.crit)) parts.push(`+${fmt(stats.crit)}% Bạo kích`);
  if (pos(stats.cdr)) parts.push(`+${fmt(stats.cdr)}% Giảm hồi chiêu`);
  if (pos(stats.guard)) parts.push(`+${fmt(stats.guard)}% Giáp`);
  const t = treasureOf(treasure);
  if (t) parts.push(t.desc);
  return parts.join(" · ") || NO_STATS_TEXT;
}

export interface SwapInfo {
  slotName: string;
  /** Tên món đang mặc ở ô đó ("Trống" nếu chưa có) */
  fromName: string;
  toName: string;
  /** Pháp bảo so bằng hai câu mô tả (không có số để trừ); ô khác: null */
  fromDesc: string | null;
  toDesc: string | null;
}

/** "Đang mặc: <cũ> -> <mới>" cho món `cand` vào đúng ô của nó. `null` nếu `cand` không phải trang bị. */
export function swapInfo(eq: FullEquip, cand: ItemDef): SwapInfo | null {
  const e = cand.equip;
  if (!e) return null;
  const cur = itemOf(eq[e.slot]);
  const curOk = cur?.equip?.slot === e.slot ? cur : undefined;
  return {
    slotName: EQUIP_SLOT_NAMES[e.slot],
    fromName: curOk?.name ?? "Trống",
    toName: cand.name,
    fromDesc: curOk ? (treasureOf(curOk.equip?.treasure)?.desc ?? null) : null,
    toDesc: treasureOf(e.treasure)?.desc ?? null,
  };
}
