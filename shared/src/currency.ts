// Tiền tệ (Linh thạch) và cửa hàng: hợp đồng giữa client và server (M3, Sprint 5, phần tiền tệ).
// Server quyết định mọi thứ (rơi bao nhiêu, mua / bán được không, giá); client chỉ gửi ý định và hiển thị.
// Số Linh thạch là dữ liệu riêng của người chơi: không vào state chung, server chỉ gửi cho chủ bằng `WalletMsg`
// và lưu trong file nhân vật (`SavedPlayer.coin`, thiếu thì coi là 0).
//
// Toàn bộ con số dưới đây là GIÁ KHỞI ĐIỂM, chỉnh bằng số đo (`npm run can-bang -w server`), không phải
// quyết định cân bằng cuối. Test trong `currency.test.ts` giữ các bất biến để chỉnh số không làm hỏng kinh tế
// (không có vòng mua rồi bán lại có lời, mọi vật phẩm / quái được nhắc đều có thật).

import { OWNER_GEAR_VALUE } from "./owner-gear";
import { SHOP_BOOK_IDS, SKILL_BOOK_VALUE } from "./books";
export const CURRENCY_NAME = "Linh thạch";

/** Trần số Linh thạch giữ được (vừa số nguyên 32 bit có dấu). Nhận thêm vượt trần thì bị cắt, không báo lỗi. */
export const COIN_CAP = 999_999_999;

/** Mỗi lần mua / bán tối đa bấy nhiêu vật phẩm (chống tin nhắn khổng lồ; túi chỉ có 24 ô). */
export const SHOP_MAX_QTY = 99;

// ---------- Giá trị vật phẩm ----------

/**
 * Giá trị gốc của vật phẩm (Linh thạch). Mọi vật phẩm trong `ITEMS` phải có mặt ở đây:
 * giá trị 0 nghĩa là KHÔNG bán được cho NPC (đồ nhiệm vụ, đồ riêng); thiếu khóa thì test đỏ.
 */
export const ITEM_VALUE: Record<string, number> = {
  // Đan dược
  hoi_huyet_dan: 12,
  hoi_linh_dan: 12,
  tu_khi_dan: 90,
  // Nguyên liệu
  long_tho: 2,
  nanh_soi: 4,
  da_ho: 18,
  vay_mang: 120,
  // Đan cấp 2 và nguyên liệu Kim Đan (M6, #403)
  dai_hoi_huyet_dan: 60,
  dai_hoi_linh_dan: 60,
  suong_mao: 45,
  quy_giap: 60,
  doc_nang: 90,
  giao_lan: 600,
  // Nguyên liệu Nguyên Anh và đan cấp 3 (M7.5c): ~x3 loài Kim Đan cùng vai
  han_lang_mao: 135,
  phong_nha_vu: 180,
  tuong_cot: 180,
  doc_tuoc_nang: 270,
  thien_han_chau: 1800,
  thuong_hoi_huyet_dan: 180,
  thuong_hoi_linh_dan: 180,
  // Trang bị (theo bậc: phàm 30, linh 120, bảo 500)
  lang_nha_kiem: 30,
  tho_nhung_bao: 30,
  lang_nha_phu: 30,
  hac_ho_kiem: 120,
  hac_ho_bao: 120,
  ho_hon_phu: 120,
  xich_mang_kiem: 500,
  xich_lan_bao: 500,
  mang_dam_phu: 500,
  // Ba bộ Kim Đan (tiên phẩm 2000, tiên phẩm 4500, thần phẩm 10000): luôn thấp hơn phí rèn (nguyên liệu + `RecipeDef.coin`), nên rèn rồi bán không lời
  suong_vu_kiem: 2000,
  suong_ho_bao: 2000,
  ho_tam_phu: 2000,
  huyen_quy_kiem: 4500,
  quy_giap_bao: 4500,
  quy_tuc_phu: 4500,
  hac_giao_kiem: 10000,
  giao_lan_bao: 10000,
  giao_long_phu: 10000,
  // Bộ IV Nguyên Anh (M7.5c; hài / ngọc bội ở `OWNER_GEAR_VALUE`): luôn thấp hơn phí rèn
  han_vu_kiem: 15000,
  han_lang_bao: 12000,
  phong_nha_phu: 12000,
  // Nguyên liệu Hóa Thần của Lang Hoang (D1 lát A2): ~x2,8 loài Nguyên Anh cùng vai (KHUNG mục 3); hồn tinh ~x2,8 Thiên Hàn châu
  bi_lang_hoang: 380,
  nanh_nguyet: 380,
  cot_lang_vuong: 500,
  hon_tinh_thien_lang: 5000,
  // Vật phẩm CỐT TRUYỆN chương 5 (#1465 lát 2): giá trị 0 = KHÔNG bán được (sellPrice 0), không sinh Linh thạch; nhiệm vụ `lang_hoang_duong_mau` lấy đi lúc trả
  manh_ao_liet_duong: 0,
  // Bộ V Hóa Thần (D1 lát A2): ~x2,8 bộ IV, luôn thấp hơn phí rèn + nguyên liệu
  kiem_nanh_nguyet: 42000,
  bao_huyet_nguyet: 33600,
  phu_hon_thien_lang: 33600,
  // Đồ ba ô riêng của chủ (M7.4, `owner-gear.ts`)
  ...OWNER_GEAR_VALUE,
  // Kinh quyển 12 chiêu (M7.4, `books.ts`)
  ...SKILL_BOOK_VALUE,
};

/** NPC thu mua trả bằng phần trăm này của giá trị gốc (làm tròn xuống, tối thiểu 1 nếu giá trị > 0). */
export const SELL_RATE = 0.5;

/** Cửa hàng bán với giá bằng bấy nhiêu lần giá trị gốc. Phải đủ lớn để mua rồi bán lại luôn lỗ (test giữ). */
export const BUY_MARKUP = 2;

/** Số Linh thạch NPC trả khi thu mua MỘT vật phẩm; 0 nếu không bán được. Id lạ trả 0. */
export function sellPrice(itemId: string): number {
  const v = Object.prototype.hasOwnProperty.call(ITEM_VALUE, itemId) ? ITEM_VALUE[itemId]! : 0;
  return v > 0 ? Math.max(1, Math.floor(v * SELL_RATE)) : 0;
}

/** Số Linh thạch cửa hàng đòi khi bán MỘT vật phẩm (chỉ áp dụng cho hàng trong `ShopDef.itemIds`); 0 nếu vật phẩm không có giá. */
export function buyPrice(itemId: string): number {
  const v = Object.prototype.hasOwnProperty.call(ITEM_VALUE, itemId) ? ITEM_VALUE[itemId]! : 0;
  return v > 0 ? Math.ceil(v * BUY_MARKUP) : 0;
}

// ---------- Cửa hàng ----------

export interface ShopDef {
  /** NPC bán (id trong `NPCS`); người chơi phải đứng trong `NPC_RANGE` mới mua / bán được */
  npcId: string;
  /** Hàng bán, mỗi loại một giá (`buyPrice`), không giới hạn số lượng */
  itemIds: string[];
}

/**
 * Chỉ bán đan hồi phục. CỐ Ý không bán `tu_khi_dan` (cộng tu vi) và trang bị: mua tu vi bằng tiền sẽ vòng
 * qua đường cong tu luyện đã cân bằng ở docs/CAN_BANG.md; cần quyết định riêng trước khi thêm.
 * NPC nào có trong `SHOPS` thì cũng thu mua mọi vật phẩm bán được (`sellPrice` > 0) của người chơi.
 */
export const SHOPS: ShopDef[] = [
  // + kinh quyển chiêu CƠ BẢN (M7.4, `SHOP_BOOK_IDS`: độ hiếm <= 1, cảnh giới Luyện Khí) để người mới mua ngay ở trấn; chiêu cao cấp chỉ rơi từ quái / trùm
  { npcId: "duoc_su", itemIds: ["hoi_huyet_dan", "hoi_linh_dan", ...SHOP_BOOK_IDS] },
  // Lái buôn ở Thanh Lộ Trạm (Hắc Phong Cốc): cùng hàng và cùng giá với Lão Dược Sư, để săn xa vẫn mua / bán được tại chỗ
  { npcId: "lai_buon", itemIds: ["hoi_huyet_dan", "hoi_linh_dan", ...SHOP_BOOK_IDS] },
  // Lái buôn Vọng Sương (Âm Sương Trạch, M6 #404): thêm đan cấp 2 (chỗ xả Linh thạch cho người Kim Đan); vẫn KHÔNG bán `tu_khi_dan` và trang bị
  {
    npcId: "lai_buon_suong",
    itemIds: ["hoi_huyet_dan", "hoi_linh_dan", "dai_hoi_huyet_dan", "dai_hoi_linh_dan"],
  },
  // Lái buôn Hàn Vân (M7.5c): thêm đan cấp 3; vẫn KHÔNG bán `tu_khi_dan` và trang bị (kinh quyển Nguyên Anh: chưa có chiêu cho bậc này)
  {
    npcId: "lai_buon_han",
    itemIds: [
      "hoi_huyet_dan",
      "hoi_linh_dan",
      "dai_hoi_huyet_dan",
      "dai_hoi_linh_dan",
      "thuong_hoi_huyet_dan",
      "thuong_hoi_linh_dan",
    ],
  },
];

export const SHOP_BY_NPC: Record<string, ShopDef> = Object.fromEntries(
  SHOPS.map((s) => [s.npcId, s]),
);

// ---------- Rơi Linh thạch ----------

export interface CoinDrop {
  /** Xác suất rơi mỗi lần quái chết (0..1) */
  chance: number;
  min: number;
  max: number;
}

/**
 * Linh thạch quái rơi, theo id quái (`MONSTERS` trong game.ts). Không có khóa = quái không rơi tiền.
 * Tiền không nằm trên đất như đồ: cộng thẳng vào người hạ quái (đội thì chia như tu vi, xem hợp đồng tổ đội);
 * server gửi `WalletMsg.gained` để client hiện "+5 Linh thạch".
 */
export const COIN_DROPS: Record<string, CoinDrop> = {
  tho: { chance: 0.6, min: 1, max: 3 },
  lang: { chance: 0.7, min: 2, max: 6 },
  ho: { chance: 0.8, min: 8, max: 20 },
  mang: { chance: 1, min: 150, max: 300 },
  // Thanh Xà: trùm CẦM ĐƯỜNG Lạc Hà bậc Luyện Khí (CD5 #1065), exp 650 < Xích Mãng 900 -> rơi trung bình ít hơn. Ambush-only (cap 0) nên xếp nhóm bí cảnh, giữ avg < yeu_vuong (currency.test)
  thanh_xa: { chance: 1, min: 100, max: 200 },
  // Trùm bí cảnh (đã tính vào cân bằng 4c-2: `server/src/balance/dungeon.ts`); thưởng hoàn thành là `DUNGEONS[].reward.coin`, riêng với tiền rơi này
  yeu_vuong: { chance: 1, min: 300, max: 500 },
  // Quái Kim Đan (M6, #403): thu nhập 8-17k Linh thạch / giờ solo, gần Xích Mãng (~15k) nhưng không vượt 2x (docs/CAN_BANG.md)
  suong_ho: { chance: 0.8, min: 25, max: 55 },
  thach_quy: { chance: 0.8, min: 50, max: 110 },
  doc_thiem: { chance: 0.9, min: 60, max: 130 },
  hac_giao: { chance: 1, min: 300, max: 490 }, // trùm: chia cho đội; thấp hơn trùm bí cảnh (400) vì exp thấp hơn (test giữ thứ tự theo exp)
  // Quái Nguyên Anh (M7.5b): cao hơn loài Kim Đan cùng vai nhưng PHẢI giữ thứ tự theo `exp` với mọi loài khác (`currency.test.ts`: Xích Mãng exp 900 rơi ~225,
  // Hắc Giao exp 3200 rơi ~395 nên Cốt Tượng / Độc Tước, exp ~1300, nằm giữa hai mức đó). Số khởi đầu, M7.9 hiệu chỉnh theo `docs/CAN_BANG.md`
  han_lang: { chance: 0.8, min: 75, max: 165 },
  phong_nha: { chance: 0.8, min: 85, max: 185 },
  cot_tuong: { chance: 0.8, min: 200, max: 400 },
  doc_tuoc: { chance: 0.9, min: 230, max: 430 },
  thien_han_vuong: { chance: 1, min: 900, max: 1470 }, // trùm: chia cho đội
  // Sói Hóa Thần của Lang Hoang (D1 #1466 lát A1 / A3): thu nhập ~x2,8-3,6 Nguyên Anh cùng vai (`docs/KHUNG_HOA_THAN.md` mục 3; đo ở `docs/CAN_BANG.md` mục "Hóa Thần sau nội dung"), giữ thứ tự theo `exp`
  // trong cùng bản đồ (`currency.test.ts`: bản đồ nhà = Lang Hoang từ lát A3).
  da_lang: { chance: 0.8, min: 250, max: 540 },
  hac_phong_lang: { chance: 0.8, min: 270, max: 570 },
  huyet_nguyet_lang: { chance: 0.8, min: 280, max: 580 },
  xich_diem_lang: { chance: 0.9, min: 410, max: 680 },
  thuong_nguyet_lang: { chance: 0.8, min: 600, max: 900 },
  ngan_nguyet_lang: { chance: 0.9, min: 640, max: 980 },
  // Trùm Lang Hoang (D1 lát B): chia cho đội; giữ thứ tự theo `exp` (Lang Vương 103.680 < Thiên Lang Vương 230.400) và ~x2,8 Thiên Hàn Vương (900-1470)
  lang_vuong: { chance: 1, min: 1100, max: 1800 },
  thien_lang_vuong: { chance: 1, min: 2500, max: 4000 },
  // Quái Hóa Thần của Uy Vân Kinh (D1 #1466 lát A1 chương 6): CHƯA sinh nên (như sói Lang Hoang lúc A1) xếp chung nhóm "bi_canh" với trùm bí cảnh: trung bình mỗi con phải >= Linh Hư Yêu Vương 400.
  // Giữ thứ tự theo `exp` (nga_quy 6.732 < luyen_huyet_de_tu 7.128 < huyet_anh 9.120 < cuong_thi 14.706 < huyet_mi 14.904 < huyet_sat_chan_truyen 18.216). Số khởi đầu, lát cho sinh hiệu chỉnh theo `docs/CAN_BANG.md`.
  nga_quy: { chance: 0.8, min: 330, max: 720 },
  luyen_huyet_de_tu: { chance: 0.8, min: 340, max: 740 },
  huyet_anh: { chance: 0.8, min: 380, max: 780 },
  cuong_thi: { chance: 0.8, min: 550, max: 900 },
  huyet_mi: { chance: 0.9, min: 560, max: 910 },
  huyet_sat_chan_truyen: { chance: 0.9, min: 850, max: 1300 },
};

/** Tung rơi tiền. rng trả về số trong [0, 1) (truyền vào để test được). Quái không có bảng thì 0. */
export function rollCoin(monsterKind: string, rng: () => number = Math.random): number {
  const d = Object.prototype.hasOwnProperty.call(COIN_DROPS, monsterKind)
    ? COIN_DROPS[monsterKind]
    : undefined;
  if (!d || rng() >= d.chance) return 0;
  return Math.min(d.max, d.min + Math.floor(rng() * (d.max - d.min + 1)));
}

/** Cộng tiền có cắt trần. Số âm / không hữu hạn coi là 0; kết quả luôn là số nguyên trong 0..COIN_CAP. */
export function addCoin(current: number, delta: number): number {
  const c = Number.isFinite(current) ? Math.floor(current) : 0;
  const d = Number.isFinite(delta) ? Math.floor(delta) : 0;
  return Math.min(COIN_CAP, Math.max(0, c + d));
}

// ---------- Tin nhắn client -> server ----------
// Server kiểm tra: kiểu, số nguyên hữu hạn trong 1..SHOP_MAX_QTY, NPC có cửa hàng và người chơi đứng
// trong NPC_RANGE, đủ tiền / đủ đồ / túi còn chỗ. Mua hoặc bán trọn vẹn hoặc không gì cả (không mua dở).

/** Mua `qty` vật phẩm `itemId` ở cửa hàng của `npcId` (phải có trong `ShopDef.itemIds`). */
export interface BuyMsg {
  npcId: string;
  itemId: string;
  qty: number;
}

/** Bán `qty` vật phẩm đang ở ô túi `slot` (chỉ số trong `Inventory`) cho `npcId`. */
export interface SellMsg {
  npcId: string;
  slot: number;
  qty: number;
}

// ---------- Tin nhắn server -> client (chỉ gửi cho chủ) ----------

/**
 * Số Linh thạch hiện có. Gửi khi vào phòng và mỗi khi đổi. `gained` (có thể âm khi mua) chỉ để hiện
 * chữ bay "+5 Linh thạch"; không có khi chỉ đồng bộ lại.
 */
export interface WalletMsg {
  coin: number;
  gained?: number;
}
