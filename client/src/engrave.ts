// Khắc chân linh ở màn Hoàng Tuyền (M7.2c, #503 / #507): chọn tối đa `engraveSlotsOf(soul.unlocks)` công pháp từ `LimboMsg.engravable` để kiếp sau vẫn còn
// chiêu (tầng 1, tự gắn lại ô). Lớp THUẦN: không biết DOM, nên test được. Máy chủ kiểm lại tất cả (`validateRebirth`): client chỉ chọn và gửi ý định.
// Quy ước tin `rebirth`: VẮNG `engrave` = giữ nguyên các chiêu đã khắc; mảng (kể cả rỗng) = THAY đúng bằng mảng đó. Nên client chỉ gửi `engrave` khi người
// chơi đã ĐỔI tập chiêu khắc (không gửi lại đúng thứ máy chủ đã có: bớt một ca máy chủ phải ghi chân linh).
import { elementOf, skillOf, type SkillDef } from "@tien-gioi/shared";

/** Lọc `ids` còn nằm trong `engravable`, bỏ trùng, cắt `cap` (giữ thứ tự). Không phải mảng thì rỗng. */
export function clampEngrave(
  ids: readonly unknown[] | undefined,
  engravable: readonly string[] | undefined,
  cap: number,
): string[] {
  const out: string[] = [];
  if (!Array.isArray(ids) || !Array.isArray(engravable) || !(cap > 0)) return out;
  for (const id of ids) {
    if (out.length >= cap) break;
    if (typeof id === "string" && engravable.includes(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Tập chiêu đang chọn để hiện: chưa đụng (`selected` null) thì là chiêu ĐÃ khắc; đã đụng thì lựa chọn của người chơi (luôn kẹp lại theo nấc / danh sách hiện hành). */
export function effectiveEngrave(
  engraved: readonly string[] | undefined,
  selected: readonly string[] | null,
  engravable: readonly string[] | undefined,
  cap: number,
): string[] {
  return clampEngrave(selected ?? engraved, engravable, cap);
}

/** Bấm một chiêu: đang chọn thì bỏ; chưa chọn thì thêm nếu còn chỗ (`cap`) và chiêu có trong danh sách. Trả mảng MỚI. */
export function toggleEngrave(
  current: readonly string[],
  id: string,
  engravable: readonly string[] | undefined,
  cap: number,
): string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (!Array.isArray(engravable) || !engravable.includes(id) || current.length >= cap)
    return [...current];
  return [...current, id];
}

/**
 * Phần `engrave` gửi kèm `rebirth`: `undefined` (vắng = giữ nguyên) khi người chơi chưa đụng tới bộ chọn, hoặc đã đụng nhưng tập chiêu trùng đúng
 * tập đã khắc; ngược lại là mảng lựa chọn (kể cả `[]` = xoá hết).
 */
export function engraveToSend(
  engraved: readonly string[] | undefined,
  selected: readonly string[] | null,
): string[] | undefined {
  if (selected === null) return undefined;
  const have = new Set(engraved ?? []);
  if (selected.length === have.size && selected.every((id) => have.has(id))) return undefined;
  return [...selected];
}

/** Dòng gợi ý cạnh nhãn: "Tối đa 2 chiêu (đã chọn 1/2)". */
export function engraveHint(cap: number, picked: number): string {
  return `Tối đa ${cap} chiêu (đã chọn ${picked}/${cap})`;
}

/** Câu thay cho danh sách khi không có gì để chọn; `null` = có danh sách để hiện. */
export function engraveEmptyText(cap: number, engravableCount: number): string | null {
  if (cap <= 0) return 'Chưa mở "Khắc chân linh" ở Tam Sinh Thạch.';
  if (engravableCount <= 0) return "Kiếp này chưa học công pháp nào để khắc.";
  return null;
}

export interface EngraveItem {
  id: string;
  def: SkillDef | undefined;
  /** Tên hiện (id lạ thì chính id) */
  name: string;
  /** Tên hệ ("Hỏa"...) hoặc "" */
  element: string;
}

/** Thông tin hiện của một mục khắc: id lạ / độc không làm hỏng giao diện (tên = id, không có hệ). */
export function engraveItem(id: string): EngraveItem {
  const def = skillOf(id);
  return {
    id,
    def,
    name: def?.name ?? id,
    element: def ? (elementOf(def.element)?.name ?? "") : "",
  };
}
