// Đồ cho ba ô RIÊNG của chủ (M7.4, #505): hài (`boots`: tốc độ + giáp), ngọc bội (`jade`: khí huyết + linh lực, sau thêm giảm hồi chiêu) và pháp bảo (`treasure`:
// nội tại đặc biệt `TREASURES`, mở từ Kim Đan). Dữ liệu THUẦN, tên và câu chữ của Tiên Giới (không lấy từ nguồn ngoài). Số khởi đầu, M7.9 hiệu chỉnh.
// Bốn bậc hài / ngọc bội theo cảnh giới (Luyện Khí hậu kỳ, Trúc Cơ, Kim Đan sơ, Kim Đan hậu): chỉ số tăng đều theo bậc (test `recipes.test.ts` giữ). Chỉ import KIỂU
// từ `items.ts` (không import giá trị: `items.ts` nạp tệp này vào `ITEMS`, import giá trị sẽ thành vòng).
import type { ItemDef } from "./items";

const equip = (
  id: string,
  name: string,
  rarity: ItemDef["rarity"],
  desc: string,
  color: number,
  e: NonNullable<ItemDef["equip"]>,
): ItemDef => ({ id, name, type: "equip", stack: 1, rarity, desc, equip: e, color });

export const OWNER_GEAR_ITEMS: ItemDef[] = [
  // ---------- Hài: tốc độ + giáp ----------
  equip("ho_bo_ngoa", "Hổ Bộ Ngoa", 1, "Hài da hổ, bước chân nhẹ hẳn.", 0x8a6a3a, {
    slot: "boots",
    stats: { speed: 8, guard: 2 },
    reqRealm: 1,
    reqTier: 6,
  }),
  equip("mang_hanh_ngoa", "Mãng Hành Ngoa", 2, "Hài vảy mãng, trườn nhanh mà vững.", 0x4f7a3c, {
    slot: "boots",
    stats: { speed: 12, guard: 3 },
    reqRealm: 2,
    reqTier: 0,
  }),
  equip("suong_van_ngoa", "Sương Vân Ngoa", 3, "Hài lông sương, đạp mây mà đi.", 0x8fb0c8, {
    slot: "boots",
    stats: { speed: 16, guard: 4 },
    reqRealm: 3,
    reqTier: 0,
  }),
  equip("giao_anh_ngoa", "Giao Ảnh Ngoa", 4, "Hài vảy giao, thoắt ẩn thoắt hiện.", 0x2e5a7a, {
    slot: "boots",
    stats: { speed: 20, guard: 5 },
    reqRealm: 3,
    reqTier: 2,
  }),
  // Bộ IV (Nguyên Anh sơ kỳ, M7.5c; độ hiếm 4 vì thang độ hiếm không giảm theo bậc): tốc độ / giáp tăng đều theo bậc (8, 12, 16, 20 -> 24; 2, 3, 4, 5 -> 6)
  equip(
    "tuyet_hanh_ngoa",
    "Tuyết Hành Ngoa",
    4,
    "Hài lót lông tuyết, đạp băng như đi trên đất bằng.",
    0x9cc0dc,
    {
      slot: "boots",
      stats: { speed: 24, guard: 6 },
      reqRealm: 4,
      reqTier: 0,
    },
  ),
  // ---------- Ngọc bội: khí huyết + linh lực (Kim Đan trở lên thêm giảm hồi chiêu) ----------
  equip("tho_nguyet_boi", "Thố Nguyệt Bội", 1, "Ngọc bội trắng như trăng thố.", 0xd8d4c4, {
    slot: "jade",
    stats: { hp: 50, mp: 20 },
    reqRealm: 1,
    reqTier: 6,
  }),
  equip("mang_tinh_boi", "Mãng Tinh Bội", 2, "Ngọc bội kết tinh từ vảy mãng.", 0x5e8c48, {
    slot: "jade",
    stats: { hp: 100, mp: 35 },
    reqRealm: 2,
    reqTier: 0,
  }),
  equip("suong_linh_boi", "Sương Linh Bội", 3, "Ngọc bội ngưng sương, mát và tĩnh.", 0xa4c4d8, {
    slot: "jade",
    stats: { hp: 180, mp: 60, cdr: 3 },
    reqRealm: 3,
    reqTier: 0,
  }),
  equip(
    "giao_chau_boi",
    "Giao Châu Bội",
    4,
    "Ngọc bội từ châu giao, linh khí cuộn chảy.",
    0x3a6e92,
    {
      slot: "jade",
      stats: { hp: 280, mp: 90, cdr: 5 },
      reqRealm: 3,
      reqTier: 2,
    },
  ),
  // Bộ IV (Nguyên Anh sơ kỳ, M7.5c): hp / mp / giảm hồi chiêu tăng đều theo bậc (180, 280 -> 400; 60, 90 -> 125; 3, 5 -> 6)
  equip(
    "han_tinh_boi",
    "Hàn Tinh Bội",
    4,
    "Ngọc bội kết từ sao lạnh, linh khí chảy đều như dòng băng.",
    0x8fc0e8,
    {
      slot: "jade",
      stats: { hp: 400, mp: 125, cdr: 6 },
      reqRealm: 4,
      reqTier: 0,
    },
  ),
  // ---------- Pháp bảo (mở từ Kim Đan): nội tại ở `TREASURES`, chỉ số nền nhỏ ----------
  equip("ho_than_an", "Hộ Thân Ấn", 3, "Ấn hộ thân, khiên dựng đều đặn.", 0x6a8caf, {
    slot: "treasure",
    stats: { hp: 120 },
    reqRealm: 3,
    reqTier: 0,
    treasure: "ho_than_an",
  }),
  equip("hap_linh_chau", "Hấp Linh Châu", 3, "Châu hút linh khí của kẻ bại trận.", 0x7a6ac8, {
    slot: "treasure",
    stats: { mp: 80 },
    reqRealm: 3,
    reqTier: 0,
    treasure: "hap_linh_chau",
  }),
  equip("xich_diem_an", "Xích Diễm Ấn", 3, "Ấn đỏ rực, lửa theo chiêu mà bùng.", 0xc8503a, {
    slot: "treasure",
    stats: { atk: 6 },
    reqRealm: 3,
    reqTier: 1,
    treasure: "xich_diem_an",
  }),
  equip("han_bang_an", "Hàn Băng Ấn", 3, "Ấn lạnh buốt, băng theo chiêu mà kết.", 0x7ab8e0, {
    slot: "treasure",
    stats: { atk: 6 },
    reqRealm: 3,
    reqTier: 1,
    treasure: "han_bang_an",
  }),
  equip("dinh_tam_chung", "Định Tâm Chung", 4, "Chuông nhỏ, tiếng ngân dưỡng thương.", 0xc9a24a, {
    slot: "treasure",
    stats: { hp: 200 },
    reqRealm: 3,
    reqTier: 2,
    treasure: "dinh_tam_chung",
  }),
  equip(
    "phong_hanh_boi",
    "Phong Hành Bội",
    4,
    "Bội gió, thắng trận là chân nhẹ như bay.",
    0x9ad0b8,
    {
      slot: "treasure",
      stats: { speed: 10 },
      reqRealm: 3,
      reqTier: 2,
      treasure: "phong_hanh_boi",
    },
  ),
];

/** Giá trị gốc (Linh thạch) của đồ ô riêng: phàm 30 / linh 80-100 / bảo 400 / tiên 1800-4000 / thần 9000-10000; luôn thấp hơn phí rèn (nguyên liệu + `coin`). */
export const OWNER_GEAR_VALUE: Record<string, number> = {
  ho_bo_ngoa: 100,
  tho_nguyet_boi: 80,
  mang_hanh_ngoa: 400,
  mang_tinh_boi: 400,
  suong_van_ngoa: 1800,
  suong_linh_boi: 1800,
  giao_anh_ngoa: 9000,
  giao_chau_boi: 9000,
  tuyet_hanh_ngoa: 12000, // bộ IV (M7.5c): thần phẩm, cao hơn bộ III (10000); luôn thấp hơn phí rèn
  han_tinh_boi: 12000,
  ho_than_an: 2000,
  hap_linh_chau: 2000,
  xich_diem_an: 4500,
  han_bang_an: 4500,
  dinh_tam_chung: 10000,
  phong_hanh_boi: 10000,
};
