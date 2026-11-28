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

// Ba bộ Kim Đan (M6, #403 / #404): rèn ở thợ rèn Vọng Sương (`tho_ren_suong`, Âm Sương Trạch), người chơi không phải về Lạc Hà.
// Nguyên liệu theo vùng săn: bộ I Sương Hồ + Thạch Quy, bộ II Thạch Quy + Độc Thiềm, bộ III Hắc Giao (trùm, đội 3-4 người) + Độc Thiềm.
// Phí Linh thạch (`coin`) là chỗ xả tiền: tổng ba bộ ~78.500 ~ 5 giờ thu nhập solo (docs/CAN_BANG.md), luôn cao hơn giá bán thành phẩm (`ITEM_VALUE` / 2).
const rc = (id: string, output: string, coin: number, inputs: [string, number][]): RecipeDef => ({
  ...r(id, output, inputs),
  npcId: "tho_ren_suong",
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
// Rèn đồ ba ô riêng (M7.4, `owner-gear.ts`): bậc Luyện Khí / Trúc Cơ ở Thợ rèn Lạc Hà (miễn phí như đồ cùng bậc), bậc Kim Đan và pháp bảo ở Thợ rèn Vọng Sương
// với phí Linh thạch (chỗ xả tiền cho người Kim Đan; luôn cao hơn giá bán thành phẩm, test giữ).
const OWNER_GEAR_RECIPES: RecipeDef[] = [
  r("ren_ho_bo_ngoa", "ho_bo_ngoa", [
    ["da_ho", 4],
    ["long_tho", 6],
  ]),
  r("ren_tho_nguyet_boi", "tho_nguyet_boi", [
    ["nanh_soi", 8],
    ["long_tho", 6],
  ]),
  r("ren_mang_hanh_ngoa", "mang_hanh_ngoa", [
    ["vay_mang", 2],
    ["da_ho", 4],
  ]),
  r("ren_mang_tinh_boi", "mang_tinh_boi", [
    ["vay_mang", 2],
    ["da_ho", 3],
  ]),
  rc("ren_suong_van_ngoa", "suong_van_ngoa", 2500, [
    ["suong_mao", 10],
    ["quy_giap", 5],
  ]),
  rc("ren_suong_linh_boi", "suong_linh_boi", 3000, [
    ["suong_mao", 8],
    ["quy_giap", 6],
  ]),
  rc("ren_giao_anh_ngoa", "giao_anh_ngoa", 12000, [
    ["giao_lan", 4],
    ["doc_nang", 6],
  ]),
  rc("ren_giao_chau_boi", "giao_chau_boi", 14000, [
    ["giao_lan", 4],
    ["doc_nang", 8],
  ]),
  rc("ren_ho_than_an", "ho_than_an", 5000, [
    ["quy_giap", 10],
    ["doc_nang", 4],
  ]),
  rc("ren_hap_linh_chau", "hap_linh_chau", 4500, [
    ["suong_mao", 12],
    ["quy_giap", 8],
  ]),
  rc("ren_xich_diem_an", "xich_diem_an", 9000, [
    ["quy_giap", 14],
    ["doc_nang", 8],
  ]),
  rc("ren_han_bang_an", "han_bang_an", 9000, [
    ["quy_giap", 14],
    ["doc_nang", 8],
  ]),
  rc("ren_dinh_tam_chung", "dinh_tam_chung", 16000, [
    ["giao_lan", 6],
    ["doc_nang", 8],
  ]),
  rc("ren_phong_hanh_boi", "phong_hanh_boi", 16000, [
    ["giao_lan", 6],
    ["doc_nang", 8],
  ]),
];

// Bộ IV Nguyên Anh (M7.5c, #506): rèn ở thợ rèn Hàn Vân (`tho_ren_han`), người chơi không phải về Âm Sương. Nguyên liệu theo vùng săn Hàn Vân; vũ khí cần Thiên Hàn châu
// (trùm Thiên Hàn Vương, đội 3-4 người). Phí Linh thạch ~x3 bộ I Kim Đan (chỗ xả tiền cho người Nguyên Anh), luôn cao hơn giá bán thành phẩm (`ITEM_VALUE` / 2). Số khởi đầu, M7.9.
const rn = (id: string, output: string, coin: number, inputs: [string, number][]): RecipeDef => ({
  ...r(id, output, inputs),
  npcId: "tho_ren_han",
  coin,
});
export const NGUYEN_ANH_RECIPES: RecipeDef[] = [
  rn("ren_han_vu_kiem", "han_vu_kiem", 9000, [
    ["han_lang_mao", 14],
    ["thien_han_chau", 2],
  ]),
  rn("ren_han_lang_bao", "han_lang_bao", 12000, [
    ["han_lang_mao", 18],
    ["tuong_cot", 8],
  ]),
  rn("ren_phong_nha_phu", "phong_nha_phu", 7500, [
    ["phong_nha_vu", 10],
    ["tuong_cot", 6],
  ]),
  rn("ren_tuyet_hanh_ngoa", "tuyet_hanh_ngoa", 7500, [
    ["phong_nha_vu", 8],
    ["han_lang_mao", 6],
  ]),
  rn("ren_han_tinh_boi", "han_tinh_boi", 7500, [
    ["doc_tuoc_nang", 6],
    ["tuong_cot", 8],
  ]),
];

// Bộ V Hóa Thần (D1 #1466 lát A2): rèn ở thợ rèn Tuyết Đao Quan (`tho_ren_tuyet_dao`, bản đồ `lang_hoang`), nguyên liệu từ chính sáu loài sói Lang Hoang (hồn tinh Thiên Lang chỉ từ Thương Nguyệt Lang,
// sói già nhất bãi). Phí Linh thạch ~x2,8 phí bộ IV. Hài / ngọc bội cùng bộ và nguyên liệu Uy Vân Kinh (Huyết Ảnh Tinh, Tủy Phi Cương) ở lát sau.
const rh = (id: string, output: string, coin: number, inputs: [string, number][]): RecipeDef => ({
  ...r(id, output, inputs),
  npcId: "tho_ren_tuyet_dao",
  coin,
});
export const HOA_THAN_RECIPES: RecipeDef[] = [
  rh("ren_kiem_nanh_nguyet", "kiem_nanh_nguyet", 25200, [
    ["nanh_nguyet", 14],
    ["hon_tinh_thien_lang", 2],
  ]),
  rh("ren_bao_huyet_nguyet", "bao_huyet_nguyet", 33600, [
    ["bi_lang_hoang", 18],
    ["cot_lang_vuong", 8],
  ]),
  rh("ren_phu_hon_thien_lang", "phu_hon_thien_lang", 21000, [
    ["nanh_nguyet", 10],
    ["cot_lang_vuong", 6],
  ]),
];

// Đan hộ đạo (nghề nhỏ lát 1, #514/#763): luyện ở Lò đan (`lao_dan`, trạm alchemy) ở Lạc Hà. Nguyên liệu là đồ quái rơi ĐÃ CÓ,
// theo vùng săn của mỗi lần đột phá: LK (quái Lạc Hà) / TC (Xích Mãng, boss Lạc Hà) / KD (Âm Sương). Phí Linh thạch là chỗ xả tiền.
// Số liệu EV (tại sao `coin` và nguyên liệu này): docs/NGHE_NHO_KINH_TE.md. `forRealm` của mỗi đan tăng dần theo `coin` (test giữ).
const ld = (id: string, output: string, coin: number, inputs: [string, number][]): RecipeDef => ({
  ...r(id, output, inputs),
  npcId: "lao_dan",
  coin,
});
export const DAO_HO_RECIPES: RecipeDef[] = [
  ld("luyen_dot_pha_dan", "dot_pha_dan", 500, [
    ["long_tho", 10],
    ["nanh_soi", 8],
    ["da_ho", 4],
  ]),
  ld("luyen_kinh_chi_dan", "kinh_chi_dan", 3000, [
    ["vay_mang", 6],
    ["da_ho", 6],
  ]),
  ld("luyen_duong_anh_dan", "duong_anh_dan", 8000, [
    ["suong_mao", 8],
    ["quy_giap", 6],
    ["doc_nang", 4],
  ]),
];

// Phù (nghề nhỏ lát 2, #514/#817): chế ở Bàn phù (`lao_phu`, trạm talisman) ở Lạc Hà. Phù tăng sát thương chiêu cùng hệ
// (`amp_<hệ>`) hoặc giảm hồi chiêu (`cdr_phu`) trong 60 giây. Nguyên liệu là đồ quái rơi ĐÃ CÓ theo bậc phù (LK -> quái Lạc Hà,
// TC -> quái Lạc Hà / Hắc Phong, KD -> Âm Sương, NA -> Hàn Vân); phí Linh thạch là chỗ xả tiền. Tên phù theo nguồn (Vạn Kiếp Tu
// Tiên, `docs/NGHE_NHO_NGUON.md` mục 3); hiệu ứng `amp_<hệ>` / `cdr_phu` là cơ chế Tiên Giới (lát 2 chỉ có hai loại này).
// `cdr_phu` (Tốc Phong Phù) KHÔNG có phù nguồn nên là nội dung GỐC. KHÔNG vào ITEM_VALUE (đồ tự chế không bán được, test giữ).
const lp = (id: string, output: string, coin: number, inputs: [string, number][]): RecipeDef => ({
  ...r(id, output, inputs),
  npcId: "lao_phu",
  coin,
});
export const PHU_RECIPES: RecipeDef[] = [
  // Luyện Khí (rarity 1): quái Lạc Hà
  lp("che_hoa_dan", "phu_hoa_dan", 300, [
    ["long_tho", 8],
    ["nanh_soi", 6],
  ]),
  lp("che_cuonghuyet", "phu_hoa_cuonghuyet", 400, [
    ["nanh_soi", 8],
    ["da_ho", 4],
  ]),
  // Trúc Cơ (rarity 2): quái Lạc Hà / Hắc Phong
  lp("che_phicham", "phu_kim_phicham", 1500, [
    ["vay_mang", 4],
    ["da_ho", 6],
  ]),
  lp("che_toagia", "phu_kim_toagia", 1800, [
    ["vay_mang", 5],
    ["da_ho", 8],
  ]),
  lp("che_lietdiem", "phu_hoa_lieutiem", 2000, [
    ["vay_mang", 6],
    ["da_ho", 6],
  ]),
  lp("che_tocphong", "phu_tho_tocphong", 2500, [
    ["vay_mang", 6],
    ["suong_mao", 4],
  ]),
  // Kim Đan (rarity 3): quái Âm Sương Trạch
  lp("che_loino", "phu_loi_loino", 6000, [
    ["suong_mao", 6],
    ["quy_giap", 4],
    ["doc_nang", 3],
  ]),
  // Nguyên Anh (rarity 3): quái Hàn Vân Lĩnh
  lp("che_tammoi", "phu_hoa_tammoi", 15000, [
    ["han_lang_mao", 6],
    ["tuong_cot", 4],
  ]),
  lp("che_kimlan", "phu_moc_kimlan", 18000, [
    ["phong_nha_vu", 6],
    ["doc_tuoc_nang", 4],
  ]),
];

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
  ...DAO_HO_RECIPES,
  ...KIM_DAN_RECIPES,
  ...OWNER_GEAR_RECIPES,
  ...NGUYEN_ANH_RECIPES,
  ...HOA_THAN_RECIPES,
  ...PHU_RECIPES,
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
