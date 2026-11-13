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
  /**
   * Phí Linh thạch (M6, #403): số nguyên 0..COIN_CAP, thiếu = 0 (miễn phí như trước). Là chỗ xả tiền cho người Kim Đan
   * (docs/CAN_BANG.md: từ Luyện Khí hậu kỳ gần như không có chỗ tiêu). Server (#405) trừ ví theo thứ tự "chỉ được MẤT":
   * kiểm đủ tiền + nguyên liệu + chỗ túi TRƯỚC, rồi trừ tiền, rồi trừ nguyên liệu và đưa đồ; thiếu gì thì từ chối trọn vẹn.
   */
  coin?: number;
}

const r = (id: string, output: string, inputs: [string, number][]): RecipeDef => ({
  id,
  npcId: "tho_ren",
  inputs: inputs.map(([itemId, qty]) => ({ itemId, qty })),
  output: { itemId: output, qty: 1 },
});

// Ba bộ Kim Đan (M6, #403). TẠM rèn ở `tho_ren` (Lạc Hà) vì NPC thợ rèn Vọng Sương thuộc #404 (bản đồ + NPC); #404 đổi `npcId` sang NPC đó.
// Nguyên liệu theo vùng săn: bộ I Sương Hồ + Thạch Quy, bộ II Thạch Quy + Độc Thiềm, bộ III Hắc Giao (trùm, đội 3-4 người) + Độc Thiềm.
// Phí Linh thạch (`coin`) là chỗ xả tiền: tổng ba bộ ~78.500 ~ 5 giờ thu nhập solo (docs/CAN_BANG.md), luôn cao hơn giá bán thành phẩm (`ITEM_VALUE` / 2).
const rc = (id: string, output: string, coin: number, inputs: [string, number][]): RecipeDef => ({
  ...r(id, output, inputs),
  coin,
});
export const KIM_DAN_RECIPES: RecipeDef[] = [
  rc("ren_suong_vu_kiem", "suong_vu_kiem", 3000, [
    ["suong_mao", 14],
    ["quy_giap", 6],
  ]),
  rc("ren_suong_ho_bao", "suong_ho_bao", 4000, [
    ["suong_mao", 18],
    ["quy_giap", 8],
  ]),
  rc("ren_ho_tam_phu", "ho_tam_phu", 2500, [
    ["suong_mao", 10],
    ["quy_giap", 6],
  ]),
  rc("ren_huyen_quy_kiem", "huyen_quy_kiem", 7000, [
    ["quy_giap", 16],
    ["doc_nang", 6],
  ]),
  rc("ren_quy_giap_bao", "quy_giap_bao", 9000, [
    ["quy_giap", 20],
    ["doc_nang", 8],
  ]),
  rc("ren_quy_tuc_phu", "quy_tuc_phu", 6000, [
    ["quy_giap", 12],
    ["doc_nang", 6],
  ]),
  rc("ren_hac_giao_kiem", "hac_giao_kiem", 15000, [
    ["giao_lan", 6],
    ["doc_nang", 10],
  ]),
  rc("ren_giao_lan_bao", "giao_lan_bao", 20000, [
    ["giao_lan", 8],
    ["doc_nang", 12],
  ]),
  rc("ren_giao_long_phu", "giao_long_phu", 12000, [
    ["giao_lan", 5],
    ["doc_nang", 8],
  ]),
];

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
  ...KIM_DAN_RECIPES,
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
