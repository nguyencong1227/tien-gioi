# Phân công M9 (NHÁP): HOÁ THẦN — nội dung chiều dọc cho người đã lên Nguyên Anh

> **TRẠNG THÁI: NHÁP của Dev A, CHƯA được người dùng duyệt.** Hướng này là mặc định của A trong `~/TT/orchestra/questions.md` (mục "ĐỀ XUẤT HƯỚNG M9", 17/11/2026); nếu người dùng chọn hướng khác thì bỏ tài liệu này. KHÔNG mở issue, KHÔNG sửa `shared/` theo tài liệu này cho tới khi có xác nhận. Mọi con số dưới đây là **đề xuất**, người soạn nội dung (D / E / G) và C (mô phỏng, bot) chốt lại bằng `npm run can-bang -w server`.

## 1. Ràng buộc (giữ nguyên từ M7 / M8)
| Điều | Quyết định |
|---|---|
| Hướng | Thêm **cảnh giới Hoá Thần** (`realm` 5) bằng đúng dây chuyền đã làm Nguyên Anh ở M7.5: bản đồ thứ năm + quái + trùm + bộ trang bị V + chiêu đợt 3 + NPC / nhiệm vụ nối Nguyên Anh sang Hoá Thần |
| Ngoài phạm vi | Luyện Hư trở đi; bảng xếp hạng / sự kiện cả server (người chơi thật còn ít); chiến tranh tông môn; app Android; chạy nhiều tiến trình |
| Nguồn nội dung | Mặc định nội dung **GỐC** của Tiên Giới. Lấy từ Vạn Kiếp Tu Tiên chỉ khi người dùng xác nhận RIÊNG (quy tắc Asset nguồn 3 của `AGENTS.md`, `docs/NGUON_NOI_DUNG.md`). Tên bản đồ / quái / NPC phải là của Tiên Giới, kiểm bằng `no-foreign-names.test.ts` |
| Giữ nguyên | Server quyết định mọi kết quả; ngân sách hiệu năng (tick < 10 ms, byte / tick mỗi client < 520, bench 0,0 %); không chữ Hán; mục bấm >= 44 px; `PROTOCOL_VERSION` KHÔNG tăng (chỉ THÊM dữ liệu); **KHÔNG đổi seed của bản đồ có sẵn** (cổng mới đặt trên đường đã có, như cổng Âm Sương - Hàn Vân) |
| Phát hành | **Hỏi người dùng khi xong**, không tự phát hành |

## 2. Hiện trạng (đã đọc mã trên `main` sau v0.4.0)
- `REALMS` (`shared/src/realms.ts`) đã có 10 cảnh giới; Hoá Thần là `realm` 5, bậc tuyến tính 19-21 (`stepOf(5, 0)` = 19). `statsFor` là công thức, không tra bảng nên đã tính được mọi bậc.
- Thanh tu vi: `REALM_EXP_BASE = [40, 280, 4400, 48000]`, từ Nguyên Anh trở đi nhân `REALM_EXP_MULT_AFTER = 6`: Nguyên Anh sơ kỳ 288.000, **Hoá Thần sơ kỳ 1.728.000** (`expToNext(5, 0)`). Chú thích trong mã còn ghi "chưa có nội dung" cho Nguyên Anh: sửa cùng PR hợp đồng.
- `breakthroughChance(realm) = max(0,15; 0,85 - 0,08 x realm)`: đột phá Nguyên Anh -> Hoá Thần ra **53 %** (Kim Đan -> Nguyên Anh là 61 %).
- Bốn bản đồ: Lạc Hà, Hắc Phong Cốc, Âm Sương Trạch, Hàn Vân Lĩnh (Nguyên Anh, cổng `am_suong_bac` <-> `han_van_nam`). `MonsterKind.level` tính theo `stepOf` của người chơi: quái thường Hàn Vân cấp 16-18 (đúng bậc Nguyên Anh), trùm Thiên Hàn Vương cấp 21 (cao hơn bãi 3 bậc; theo thang đó đã là Hoá Thần hậu kỳ). `monsterCap` mỗi bản đồ <= ~70.
- Bộ trang bị I-IV, chiêu đợt 1-2 (Nguyên Anh: 6 chiêu gốc, `reqRealm: 4`), hành vi quái (`charger`, `ranged`, `poisoner`, tinh anh, báo trước đòn) và bộ chiêu trùm (mục 42, cờ `BOSS_MOVES`) đã có: M9 TÁI DÙNG, không viết cơ chế mới.
- Một bí cảnh (Linh Hư) có trần bậc `maxStep: 12` (`shared/src/dungeon.ts`); bí cảnh thứ hai chưa có.
- Quy mô thật: vài người chơi (người dùng và bạn bè thử). Trùm "bãi đội 3-4 người" không kiểm bằng người thật được: kiểm bằng bot / mô phỏng của C.

## 3. Phạm vi đề xuất
1. **Bản đồ thứ năm** (128x128 ô như Hàn Vân; tên do D / B chọn, A kiểm trùng; một trạm an toàn sát cổng) nối với **cổng bắc mới ở Hàn Vân** (`han_van_bac`), `MAP_STYLES` riêng, hạt giống chọn bằng quét như `am_suong` / `han_van` đã làm (liên thông + sức chứa quái).
2. **Quái:** 4 loài thường (cấp 19-21, mỗi loài một hệ + một hành vi có sẵn, không trùng bộ của Hàn Vân) + 1 trùm bãi đội 3-4 người (cấp đề xuất 24 = bãi + 3 bậc như Thiên Hàn Vương, bộ chiêu theo `docs/THIET_KE_TRUM.md`); bảng rơi + nguyên liệu mới.
3. **Trang bị bộ V** (5 món, `reqRealm: 5`), **chiêu đợt 3** (6 chiêu gốc, mỗi hệ <= 2, `reqRealm: 5`), đan cấp 4 (đan thường + đan hộ đạo cho đột phá 53 %).
4. **NPC + nhiệm vụ:** trạm trưởng / lái buôn / thợ rèn ở trạm mới, chuỗi chính ~6 bước nối Nguyên Anh -> Hoá Thần (kill / collect / talk / reachRealm) + 2-3 việc lặp + việc phụ.
5. **Bí cảnh thứ hai** (tuỳ, làm sau cùng nếu còn sức): dùng lại bộ máy `dungeon` (chỉ thêm một mục dữ liệu `DungeonDef` + trùm), trần bậc cao hơn Linh Hư.

## 4. Chia việc (đề xuất; số issue ghi ở GitHub sau khi người dùng duyệt)
| Mã | Việc | Ai | Phụ thuộc |
|---|---|---|---|
| M9.1 | **Hợp đồng `shared/`** (PR RIÊNG, B hoặc C review): bản đồ thứ năm (`MapDef` + `MAP_STYLES`), cổng `han_van_bac`, khung quái / NPC rỗng hợp lệ, `REALMS` / `REALM_EXP_BASE` chú thích, test liên thông + sức chứa + `no-global-map-imports` | A | người dùng duyệt |
| M9.2 | Server: qua cổng Hàn Vân - bản đồ mới (`planTravel`, `travelTo`), test bốn -> năm, `kiem-save` (không nhân vật nào đứng trong ô thành chặn), bench 0,0 % | A | M9.1 |
| M9.3 | Quái + trùm + bảng rơi + nguyên liệu (dữ liệu, `DROP_TABLES`, `monsterCap`); mô phỏng thu nhập tu vi / giờ cho "bãi đúng bậc" | D (A review) | M9.1 |
| M9.4 | Trang bị bộ V + chiêu đợt 3 + đan cấp 4 (dữ liệu + icon bằng mã hoặc ảnh có nguồn); `ITEM_VALUE`, công thức, nguồn rơi cho MỌI món (kiểm toán #751) | D + G | M9.1 |
| M9.5 | NPC + nhiệm vụ chuỗi chính + việc lặp + việc phụ; test khả thi (mỗi bước làm được ở đúng bản đồ, như `lac-ha-sidequests.test.ts`) | E | M9.1, M9.3 |
| M9.6 | Giao diện: `MAP_STYLES`, bản đồ nhỏ / lớn, thẻ minh hoạ bản đồ (`MAP_CARDS`) nạp THEO GÓI TẢI THEO NHU CẦU, ảnh 5 khung nhìn | B | M9.1 |
| M9.7 | Cân bằng + bot (sống sót, né báo trước, tu vi / giờ), soak 5 bản đồ, `LOAD_TEST.md`, chốt `breakthroughChance` cho Nguyên Anh -> Hoá Thần | C (A review) | M9.3, M9.4 |
| M9.8 | Kiểm toán + hồi quy: cap test mở rộng `realm` 5, nguồn mọi vật phẩm mới, nhiệm vụ khả thi, rà ngôn ngữ (không "bạn", không chữ Hán), E2E người mới đi hết chuỗi mới | F + H + G | M9.3-M9.5 |
| M9.9 | Bí cảnh thứ hai (tuỳ): thiết kế ở `docs/THIET_KE_BI_CANH.md` rồi dữ liệu | A + D | M9.3 |
| M9.10 | Nghiệm thu + CHANGELOG + hỏi người dùng phát hành (`MIN_PROTOCOL_VERSION` giữ 3 nếu không đổi hợp đồng) | A | tất cả |

**Thứ tự gợi ý:** M9.1 (nhỏ, sớm, mở đường cho mọi người) -> M9.2 song song M9.3 / M9.4 / M9.6 -> M9.5 -> M9.7 / M9.8 -> M9.10. Việc của D / E / G / F / H (Ornith) chỉ là dữ liệu / test / tài liệu: PR cần B hoặc C LGTM, PR đổi logic qua A; trước khi mở PR chạy TOÀN BỘ `npm test`, typecheck, lint, prettier và `npm run can-bang -w server`.

## 5. Kiểm thử và cân bằng (bắt buộc)
- **Bãi đúng bậc:** tu vi / giờ của người Nguyên Anh hậu kỳ solo ở bản đồ mới nằm trong khoảng tương xứng thanh 1.728.000 (mục tiêu giờ / cảnh giới chốt ở M9.7, như Kim Đan 5-6 giờ); không quái nào cho tu vi / giờ vượt bãi Hàn Vân quá hệ số đã chốt (chống "cày bãi dễ").
- **Không vật phẩm mồ côi:** mọi món bộ V / đan cấp 4 có nguồn (rơi, cửa hàng, công thức), có `ITEM_VALUE` đúng luật (đầu ra nghề không bán lại được).
- **Không đổi seed bản đồ cũ:** test chụp ô của 4 bản đồ cũ (băm) phải xanh; `kiem-save` sạch trên dữ liệu thật.
- **Hiệu năng:** `npm run bench -w server` (kể cả `--crowd`) bảng trước / sau trong PR M9.2; ngưỡng ở mục Hiệu năng của `AGENTS.md`.
- Test mới có đột biến chứng minh đỏ khi mã sai (commit mã thật TRƯỚC khi chạy đột biến).

## 6. Rủi ro
- **Quá ít người chơi để kiểm bằng người thật:** mọi tiêu chí cân bằng đi bằng bot / mô phỏng; người dùng chơi thử trước phát hành.
- **Ornith chạy chậm khi GX10 tải cao:** hàng đợi nhỏ (>= 2 issue mỗi dev) và M9.1 xong sớm để mọi người có việc.
- **Bản đồ thứ năm làm tăng gói tải:** thẻ minh hoạ + tài sản vào GÓI THEO NHU CẦU (quyết định ngân sách ảnh AI ở `client/perf-budget.json`), không vào gói lõi.
- **Đổi `breakthroughChance` ảnh hưởng người đã ở Nguyên Anh:** không đổi công thức chung; chỉ chốt số riêng cho bậc 4 -> 5 nếu mô phỏng cho thấy cần.

## 7. Câu hỏi cho người dùng (KHÔNG chặn; mặc định ghi sẵn)
1. Chọn hướng M9 (Hoá Thần / xã hội / hạ tầng): mặc định **Hoá Thần**, xem `questions.md`.
2. Có cho D / E lấy nội dung Hoá Thần từ Vạn Kiếp Tu Tiên không? Mặc định **không** (nội dung gốc).
3. Bí cảnh thứ hai có nằm trong M9 không? Mặc định **tuỳ, cuối cùng**, bị cắt đầu tiên nếu trễ.
