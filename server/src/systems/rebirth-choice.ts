// Lựa chọn đầu thai KHOAN DUNG (QUYET_DINH_M3 mục 58, lỗi gấp bản thật v0.5.1: "chết xong không đầu thai được").
// `validateRebirth` (shared) từ chối CẢ yêu cầu khi có MỘT chỗ sai (giữ quá ô, chiêu lạ, xuất thân chưa mở): người chơi kẹt ở Hoàng Tuyền, chỉ thấy toast "không hợp lệ".
// Ở đây ngược lại: luôn trả về MỘT lựa chọn hợp lệ, bỏ phần sai / vượt và ghi chú lại để báo người chơi. Không bao giờ để ai kẹt ở Hoàng Tuyền vì tin sai.
// Server vẫn quyết định mọi thứ: phần được giữ vẫn đi qua đúng các luật của `validateRebirth` (số ô, đồ có thật, chiêu có thể khắc, xuất thân đã mở).
import {
  DEFAULT_ORIGIN,
  engraveSlotsOf,
  keepSlotsOf,
  originOf,
  skillOf,
  type RebirthChoice,
  type Soul,
} from "@tien-gioi/shared";

export interface LenientRebirth {
  choice: RebirthChoice;
  /** Những phần đã bỏ (tiếng Việt, để báo người chơi và ghi nhật ký); rỗng = giữ nguyên mọi thứ người chơi chọn. */
  notes: string[];
}

export function lenientRebirth(
  soul: Pick<Soul, "unlocks" | "origins">,
  msg: unknown,
  keepable: readonly string[],
  engravable: readonly string[] = [],
): LenientRebirth {
  const notes: string[] = [];
  const m =
    msg !== null && typeof msg === "object" && !Array.isArray(msg)
      ? (msg as { origin?: unknown; keep?: unknown; engrave?: unknown })
      : {};

  // Xuất thân: chưa mở / lạ / sai kiểu thì về Phàm gia (xuất thân vắng mặt là chuyện bình thường, không ghi chú)
  let origin = DEFAULT_ORIGIN;
  if (m.origin !== undefined && m.origin !== null && m.origin !== DEFAULT_ORIGIN) {
    const o = originOf(m.origin);
    if (o && o.cost > 0 && soul.origins.includes(o.id)) origin = o.id;
    else notes.push("xuất thân chưa mở (về Phàm gia)");
  }

  // Đồ giữ lại: chỉ món có trong danh sách chụp lúc chết (mỗi món dùng một lần), tối đa số ô đã mở
  const slots = keepSlotsOf(soul.unlocks);
  const rawKeep = Array.isArray(m.keep) ? (m.keep as unknown[]) : [];
  const pool = [...keepable];
  const keep: string[] = [];
  let droppedKeep = 0;
  for (const k of rawKeep) {
    const i = typeof k === "string" ? pool.indexOf(k) : -1;
    if (i < 0 || keep.length >= slots) {
      droppedKeep++;
      continue;
    }
    pool.splice(i, 1);
    keep.push(k as string);
  }
  if (droppedKeep > 0)
    notes.push(
      slots > 0
        ? `bỏ ${droppedKeep} món giữ lại không hợp lệ hoặc vượt ${slots} ô`
        : `bỏ ${droppedKeep} món giữ lại (chưa mở ô Ký vật)`,
    );

  // Khắc chiêu: vắng = giữ nguyên chiêu đã khắc. Có sai sót (chiêu lạ / không khắc được / sai kiểu) thì bỏ CẢ phần khắc và giữ nguyên chân linh
  // (cắt từng chiêu sai rồi THAY danh sách sẽ xoá nhầm chiêu đã khắc khi tin chỉ là rác). Chỉ thừa ô thì cắt bớt giữ các chiêu đầu.
  let engrave: string[] | undefined;
  if (m.engrave !== undefined && m.engrave !== null) {
    const cap = engraveSlotsOf(soul.unlocks);
    const ok: string[] = [];
    let bad = !Array.isArray(m.engrave);
    if (!bad) {
      for (const id of m.engrave as unknown[]) {
        if (typeof id !== "string" || !engravable.includes(id) || !skillOf(id)) {
          bad = true;
          break;
        }
        if (!ok.includes(id)) ok.push(id);
      }
    }
    if (bad) notes.push("bỏ phần khắc chiêu không hợp lệ (giữ nguyên chiêu đã khắc)");
    else {
      if (ok.length > cap) notes.push(`khắc chiêu vượt ${cap} ô: chỉ giữ ${cap} chiêu đầu`);
      engrave = ok.slice(0, cap);
    }
  }

  return { choice: engrave === undefined ? { origin, keep } : { origin, keep, engrave }, notes };
}
