// Chữ của bảng chế tác theo TRẠM (nghề nhỏ, #514, issue #769): Lò rèn / Lò đan / Bàn phù. Lớp THUẦN (không DOM) nên test được.
// Nguồn chữ DUY NHẤT là `CRAFT_STATIONS` ở shared (cùng bảng máy chủ dùng cho toast "Luyện thành công ..."); NPC thiếu `station` hoặc lạ = Lò rèn
// (`craftStationOf`), nên thợ rèn cũ không đổi một chữ nào.
import { CRAFT_STATIONS, craftStationOf, type CraftStation } from "@tien-gioi/shared";

/** Tiêu đề khi chưa biết NPC nào (dữ liệu hỏng): giữ chữ cũ. */
export const FORGE_FALLBACK_TITLE = "Lò Rèn Thiết Ngưu";

/** Dòng phụ dưới tiêu đề bảng, theo trạm. `Record` đầy đủ: thêm trạm mới ở shared mà quên ở đây thì typecheck ĐỎ. */
export const CRAFT_SUBTITLES: Readonly<Record<CraftStation, string>> = {
  forge: "Rèn trước để dành · Đủ cảnh giới mới mặc được",
  alchemy: "Luyện đan để dành · Hiệu lực mất khi qua cổng hoặc thoát phòng",
  talisman: "Chế phù để dành · Hiệu lực mất khi qua cổng hoặc thoát phòng",
};

/** Tiêu đề bảng: "Lò Đan · <tên NPC>"; NPC không có (hoặc không biết) thì chữ cũ. */
export function craftTitle(npc: { name: string; station?: unknown } | null | undefined): string {
  if (!npc) return FORGE_FALLBACK_TITLE;
  return `${CRAFT_STATIONS[craftStationOf(npc)].title} · ${npc.name}`;
}

/** Dòng phụ dưới tiêu đề của NPC (thiếu NPC = như Lò rèn). */
export function craftSubtitle(npc: { station?: unknown } | null | undefined): string {
  return CRAFT_SUBTITLES[craftStationOf(npc)];
}

/** Chữ trên nút của mỗi công thức: "Rèn" / "Luyện" / "Chế". */
export function craftButtonText(npc: { station?: unknown } | null | undefined): string {
  return CRAFT_STATIONS[craftStationOf(npc)].button;
}

/** Gợi ý (title) của nút khi có phí: "Luyện: tốn 700 Linh thạch". `feeText` đã định dạng sẵn (số + đơn vị). */
export function craftFeeHint(
  npc: { station?: unknown } | null | undefined,
  feeText: string,
): string {
  return `${craftButtonText(npc)}: tốn ${feeText}`;
}

/** Thẻ phụ của lựa chọn hội thoại `forge` (`action.station` đi kèm khi khác `forge`; thiếu / lạ = Lò rèn). */
export function craftTag(station: unknown): string {
  return CRAFT_STATIONS[craftStationOf({ station })].tag;
}
