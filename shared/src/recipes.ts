// Rèn đồ ở Thợ rèn: hợp đồng giữa client và server (Sprint 3).
// Server kiểm tra đứng gần Thợ rèn, đủ nguyên liệu, rồi trừ nguyên liệu và thêm đồ trong cùng một thao tác.
import type { EquipSlot } from "./items";

export interface RecipeDef {
  id: string;
  /** NPC rèn công thức này */
  npcId: string;
  /** Nguyên liệu bị trừ */
  inputs: { itemId: string; qty: number }[];
  /** Vật phẩm nhận được (trang bị luôn qty 1) */
  output: { itemId: string; qty: number };
}

const r = (id: string, output: string, inputs: [string, number][]): RecipeDef => ({
  id,
  npcId: "tho_ren",
  inputs: inputs.map(([itemId, qty]) => ({ itemId, qty })),
  output: { itemId: output, qty: 1 },
});

/**
 * Ba bộ theo ba vùng săn: Hôi Lang (Luyện Khí đầu), Hắc Hổ (Luyện Khí tầng 7+), Xích Mãng (Trúc Cơ).
 * Rèn được trước khi đủ cảnh giới mặc (để dành), mặc thì mới kiểm tra cảnh giới.
 */
export const RECIPES: RecipeDef[] = [
  r("ren_lang_nha_kiem", "lang_nha_kiem", [
    ["nanh_soi", 8],
    ["long_tho", 4],
  ]),
  r("ren_tho_nhung_bao", "tho_nhung_bao", [["long_tho", 12]]),
  r("ren_lang_nha_phu", "lang_nha_phu", [
    ["nanh_soi", 6],
    ["long_tho", 6],
  ]),
  r("ren_hac_ho_kiem", "hac_ho_kiem", [
    ["da_ho", 4],
    ["nanh_soi", 10],
  ]),
  r("ren_hac_ho_bao", "hac_ho_bao", [
    ["da_ho", 6],
    ["long_tho", 10],
  ]),
  r("ren_ho_hon_phu", "ho_hon_phu", [
    ["da_ho", 3],
    ["nanh_soi", 8],
  ]),
  r("ren_xich_mang_kiem", "xich_mang_kiem", [
    ["vay_mang", 3],
    ["da_ho", 8],
  ]),
  r("ren_xich_lan_bao", "xich_lan_bao", [
    ["vay_mang", 4],
    ["da_ho", 6],
  ]),
  r("ren_mang_dam_phu", "mang_dam_phu", [
    ["vay_mang", 2],
    ["da_ho", 4],
  ]),
];

export const RECIPE_BY_ID: Record<string, RecipeDef> = Object.fromEntries(
  RECIPES.map((x) => [x.id, x]),
);

// ---------- Tin nhắn client -> server ----------

/** Mặc món ở ô túi `slot`. Món đang mặc ở cùng ô trang bị (nếu có) về lại đúng ô túi đó. */
export interface EquipMsg {
  slot: number;
}
/** Tháo món ở ô trang bị về túi (bị từ chối nếu túi đầy) */
export interface UnequipMsg {
  slot: EquipSlot;
}
/** Rèn theo công thức (phải đứng trong NPC_RANGE của npcId của công thức) */
export interface CraftMsg {
  recipeId: string;
}
