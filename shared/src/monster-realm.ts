// Bậc (cảnh giới) của quái, khai tường minh. Chuyển từ `book-drop-realm.test.ts` sang `shared/` (#1420) để công cụ sinh tài liệu `so-tay-quai` dùng chung;
// dữ liệu và luật KHÔNG đổi. Chỉ số: 0 Phàm Nhân, 1 Luyện Khí, 2 Trúc Cơ, 3 Kim Đan, 4 Nguyên Anh, 5 Hóa Thần, ... 9 Độ Kiếp (cùng chỉ số `REALMS`).

/**
 * Cảnh giới của quái = `reqRealm` CAO NHẤT của sách chiêu quái đó được phép rơi (quái bậc thấp rơi sách bậc cao thì người chơi nhặt được quyển chưa học nổi,
 * còn người đủ bậc lại phải về cày bãi dưới). Khai báo TƯỜNG MINH (KHÁC bậc suy từ `level`: Hắc Hổ `level` 7 là Luyện Khí tầng 7 nhưng thuộc bãi Trúc Cơ): thêm quái mới có rơi sách chiêu thì phải thêm dòng ở đây và chọn bậc có chủ ý (`book-drop-realm.test.ts` giữ).
 * Nguồn bậc: Luyện Khí = Linh Thố, Hôi Lang; Trúc Cơ = Hắc Hổ, Xích Mãng (trùm), Linh Hư Yêu Vương (bí cảnh) và hai quái phụ của nó; Kim Đan = bãi Âm Sương (Sương Hồ, Thạch Quy, Độc Thiềm) + Hắc Giao;
 * Nguyên Anh = bãi Hàn Vân (Hàn Lang, Phong Nha, Cốt Tượng, Độc Tước) + Thiên Hàn Vương (`docs/CAN_BANG.md`).
 */
export const MONSTER_REALM: Readonly<Record<string, number>> = {
  tho: 1,
  lang: 1,
  ho: 2,
  mang: 2,
  yeu_vuong: 2,
  ran_con: 2,
  phan_than_yeu_vuong: 2,
  suong_ho: 3,
  thach_quy: 3,
  doc_thiem: 3,
  hac_giao: 3,
  han_lang: 4,
  phong_nha: 4,
  cot_tuong: 4,
  doc_tuoc: 4,
  thien_han_vuong: 4,
  // Trùm CẦM ĐƯỜNG Lạc Hà (CD5 #1065): cấp 7, bậc Luyện Khí; không rơi sách chiêu, khai để sổ tay quái (#1420) đủ mọi quái
  thanh_xa: 1,
  // Quái Hóa Thần của Lang Hoang (D1 #1466 lát A1): bậc 5 (chưa loài nào rơi sách chiêu; lát C thêm sách `reqRealm` 5)
  da_lang: 5,
  hac_phong_lang: 5,
  huyet_nguyet_lang: 5,
  xich_diem_lang: 5,
  thuong_nguyet_lang: 5,
  ngan_nguyet_lang: 5,
  // Trùm Lang Hoang (D1 lát B): bậc 5 (sách chiêu Hóa Thần của lát C sẽ rơi từ Thiên Lang Vương)
  lang_vuong: 5,
  thien_lang_vuong: 5,
  // Quái Hóa Thần của Uy Vân Kinh (D1 #1466 lát A1 chương 6): bậc 5 (chưa loài nào rơi sách chiêu; sách `reqRealm` 5 thêm ở lát sau)
  luyen_huyet_de_tu: 5,
  nga_quy: 5,
  cuong_thi: 5,
  huyet_mi: 5,
  huyet_anh: 5,
  huyet_sat_chan_truyen: 5,
};

/** Bậc khai của quái `id` (id đến từ client / file lưu thì không tin `MONSTER_REALM["constructor"]`); `undefined` nếu chưa khai. */
export function monsterRealmOf(id: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(MONSTER_REALM, id) ? MONSTER_REALM[id] : undefined;
}
