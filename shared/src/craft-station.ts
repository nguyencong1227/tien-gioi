// Trạm chế tác (nghề nhỏ, #514; thiết kế ở docs/THIET_KE_NGHE_NHO.md mục 2): Lò rèn, Lò đan, Bàn phù.
// Cả ba dùng CHUNG bảng chế (`RecipeDef` theo `npcId`, tin `craft`); chỉ khác chữ hiển thị (động từ, nhãn, tiêu đề, nút).
// Một nguồn duy nhất cho máy chủ (toast "Luyện thành công ...") và client (tiêu đề bảng, nút, nhãn lựa chọn hội thoại).
// Tệp này KHÔNG import gì để `npcs.ts` / `quests.ts` / `recipes.ts` đều dùng được mà không vòng phụ thuộc.

/** Trạm chế tác. Thiếu / không hợp lệ ở `NpcDef.station` coi như `forge` (NPC cũ không đổi). */
export type CraftStation = "forge" | "alchemy" | "talisman";

/** Thứ tự cố định; thêm trạm mới thì thêm CUỐI và bổ sung `CRAFT_STATIONS` (test bắt thiếu). */
export const CRAFT_STATION_IDS: readonly CraftStation[] = ["forge", "alchemy", "talisman"];

export interface CraftStationDef {
  /** Động từ trong toast thành công: "Rèn" / "Luyện" / "Chế" */
  verb: string;
  /** Nhãn lựa chọn hội thoại: "Rèn đồ" / "Luyện đan" / "Chế phù" */
  label: string;
  /** Tiêu đề bảng chế (client ghép thêm " · <tên NPC>"): "Lò Rèn" / "Lò Đan" / "Bàn Phù" */
  title: string;
  /** Chữ trên nút bấm của mỗi công thức */
  button: string;
  /** Thẻ phụ nhỏ ở lựa chọn hội thoại: "Lò rèn" / "Lò đan" / "Bàn phù" */
  tag: string;
}

export const CRAFT_STATIONS: Readonly<Record<CraftStation, CraftStationDef>> = {
  forge: { verb: "Rèn", label: "Rèn đồ", title: "Lò Rèn", button: "Rèn", tag: "Lò rèn" },
  alchemy: { verb: "Luyện", label: "Luyện đan", title: "Lò Đan", button: "Luyện", tag: "Lò đan" },
  talisman: { verb: "Chế", label: "Chế phù", title: "Bàn Phù", button: "Chế", tag: "Bàn phù" },
};

/** Giá trị có phải một trạm hợp lệ (dữ liệu từ tin nhắn / tệp không tin được). */
export function isCraftStation(v: unknown): v is CraftStation {
  return typeof v === "string" && (CRAFT_STATION_IDS as readonly string[]).includes(v);
}

/** Trạm của một NPC (hoặc lựa chọn hội thoại): thiếu / lạ => `forge`. Nhận mọi vật có trường `station`, kể cả `undefined`. */
export function craftStationOf(owner: { station?: unknown } | null | undefined): CraftStation {
  return owner && isCraftStation(owner.station) ? owner.station : "forge";
}

/** Lời toast khi chế thành công: "<động từ> thành công <tên vật phẩm>." */
export function craftSuccessText(station: CraftStation, itemName: string): string {
  return `${CRAFT_STATIONS[station].verb} thành công ${itemName}.`;
}
