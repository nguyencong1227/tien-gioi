// Lựa chọn đầu thai CLIENT gửi (QUYET_DINH_M3 mục 58, lỗi gấp "nhân vật mới không đầu thai được"): lớp THUẦN dựng `RebirthChoice` chỉ từ phần HỢP LỆ của những gì người chơi đã chọn,
// kẹp theo chân linh hiện hành và danh sách máy chủ gửi (`LimboMsg.keepable` / `engravable`): không bao giờ gửi giữ quá số ô, món không có, xuất thân chưa mở, chiêu không khắc được.
// Máy chủ vẫn kiểm lại và khoan dung (`server/src/systems/rebirth-choice.ts`); đây chỉ là lớp thứ nhất để tin gửi đi luôn sạch.
import {
  DEFAULT_ORIGIN,
  ORIGINS,
  engraveSlotsOf,
  keepSlotsOf,
  type LimboMsg,
  type RebirthChoice,
  type SoulView,
} from "@tien-gioi/shared";
import { clampEngrave, engraveToSend } from "./engrave";

export interface LimboSelection {
  /** Xuất thân đang chọn */
  origin: string;
  /** Trang bị đang tích giữ lại (id vật phẩm) */
  relics: readonly string[];
  /** Tập chiêu khắc đã chọn; `null` = chưa đụng tới bộ chọn (không gửi `engrave`) */
  engrave: readonly string[] | null;
}

/** Xuất thân dùng được: Phàm gia (miễn phí) hoặc xuất thân đã mua trong chân linh; còn lại về Phàm gia. */
export function usableOrigin(soul: Pick<SoulView, "origins"> | undefined, id: string): string {
  const o = ORIGINS.find((x) => x.id === id);
  if (!o) return DEFAULT_ORIGIN;
  if (o.cost <= 0) return o.id;
  return Array.isArray(soul?.origins) && soul.origins.includes(o.id) ? o.id : DEFAULT_ORIGIN;
}

/** Món giữ lại gửi đi: chỉ món CÓ trong `keepable` (mỗi phần tử dùng một lần), tối đa số ô `Ký vật` đã mở. */
export function keepToSend(
  keepable: readonly string[] | undefined,
  relics: readonly string[],
  cap: number,
): string[] {
  const pool = Array.isArray(keepable) ? [...keepable] : [];
  const out: string[] = [];
  if (!(cap > 0)) return out;
  for (const id of relics) {
    if (out.length >= cap) break;
    const i = typeof id === "string" ? pool.indexOf(id) : -1;
    if (i < 0) continue;
    pool.splice(i, 1);
    out.push(id);
  }
  return out;
}

/**
 * Dựng lựa chọn gửi đi. `soul` / `limbo` chưa có (không nên xảy ra khi màn đang mở) thì gửi lựa chọn rỗng, xuất thân mặc định: vẫn đầu thai được.
 * `engrave` vắng = giữ nguyên chiêu đã khắc (xem `engraveToSend`).
 */
export function buildRebirthChoice(
  soul: SoulView | undefined,
  limbo: Pick<LimboMsg, "keepable" | "engravable"> | undefined,
  sel: LimboSelection,
): RebirthChoice {
  const choice: RebirthChoice = {
    origin: usableOrigin(soul, sel.origin),
    keep: keepToSend(limbo?.keepable, sel.relics, soul ? keepSlotsOf(soul.unlocks) : 0),
  };
  if (soul && limbo) {
    const picked =
      sel.engrave === null
        ? null
        : clampEngrave(sel.engrave, limbo.engravable, engraveSlotsOf(soul.unlocks));
    const engrave = engraveToSend(soul.engraved, picked);
    if (engrave !== undefined) choice.engrave = engrave;
  }
  return choice;
}
